import type pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import type { NormalizedDiscoveryDto, NormalizedDiscoveryIdentifier } from '../../shared/utils/cmdb-discovery-contract.js';
import type { AssetIdentifierType } from '../../shared/types/cmdb-discovery.js';
import { isStrongAssetIdentifier, normalizeAssetIdentifier } from '../db/postgres/cmdb-foundation-repository.js';

export const CORRELATION_RULE_VERSION = 'cmdb-identity-v3';

/**
 * Stable, source-neutral decisions persisted with every observation. These
 * names are deliberately action-oriented: adapters must not infer a merge
 * from a hostname or treat a review case as a canonical asset.
 */
export type CorrelationOutcome = 'AUTO_LINK' | 'REVIEW_REQUIRED' | 'CREATE_NEW' | 'IDENTITY_CONFLICT';
export type IdentifierSignalStrength = 'STRONG' | 'COMPOSITE' | 'WEAK';

export interface ExtractedIdentifier {
  type: AssetIdentifierType;
  namespace: string;
  value: string;
  normalizedValue: string;
  confidence: number;
  primary: boolean;
  strength: IdentifierSignalStrength;
}

export interface CorrelationEvidence {
  signal: string;
  strength: IdentifierSignalStrength;
  value: string;
  assetId: string;
  score: number;
}

export interface CorrelationCandidate {
  assetId: string;
  score: number;
  strongSignalCount: number;
  mediumSignalCount: number;
  weakSignalCount: number;
  evidence: CorrelationEvidence[];
}

export interface CorrelationResolution {
  outcome: CorrelationOutcome;
  assetId?: string;
  confidence: number;
  candidates: CorrelationCandidate[];
  evidence: CorrelationEvidence[];
  summary: string;
}

function strength(type: AssetIdentifierType): IdentifierSignalStrength {
  if (isStrongAssetIdentifier(type)) return 'STRONG';
  if (type === 'FQDN' || type === 'MAC_ADDRESS') return 'COMPOSITE';
  return 'WEAK';
}

function addIdentifier(target: Map<string, ExtractedIdentifier>, value: NormalizedDiscoveryIdentifier): void {
  const type = value.type as AssetIdentifierType;
  const normalizedValue = normalizeAssetIdentifier(type, value.value);
  const namespace = value.namespace || 'GLOBAL';
  const key = `${type}\u0000${namespace}\u0000${normalizedValue}`;
  const existing = target.get(key);
  const candidate: ExtractedIdentifier = {
    type,
    namespace,
    value: value.value,
    normalizedValue,
    confidence: value.confidence,
    primary: value.primary,
    strength: strength(type),
  };
  if (!existing || candidate.confidence > existing.confidence || (candidate.primary && !existing.primary)) target.set(key, candidate);
}

export function extractDiscoveryIdentifiers(dto: NormalizedDiscoveryDto): ExtractedIdentifier[] {
  const identifiers = new Map<string, ExtractedIdentifier>();
  for (const identifier of dto.identity.identifiers) addIdentifier(identifiers, identifier);
  if (dto.identity.hostname) addIdentifier(identifiers, { type: 'HOSTNAME', namespace: 'GLOBAL', value: dto.identity.hostname, confidence: 60, primary: true });
  if (dto.identity.fqdn) addIdentifier(identifiers, { type: 'FQDN', namespace: 'DNS', value: dto.identity.fqdn, confidence: 75, primary: true });
  if (dto.identity.serialNumber) addIdentifier(identifiers, { type: 'SERIAL_NUMBER', namespace: 'GLOBAL', value: dto.identity.serialNumber, confidence: 90, primary: true });
  for (const nic of dto.network.interfaces) {
    for (const mac of nic.macAddresses) addIdentifier(identifiers, { type: 'MAC_ADDRESS', namespace: 'GLOBAL', value: mac, confidence: 65, primary: false });
  }
  return [...identifiers.values()].sort((left, right) =>
    left.type.localeCompare(right.type) || left.namespace.localeCompare(right.namespace) || left.normalizedValue.localeCompare(right.normalizedValue));
}

function candidateMap(evidence: CorrelationEvidence[]): CorrelationCandidate[] {
  const candidates = new Map<string, CorrelationCandidate>();
  for (const item of evidence) {
    const candidate = candidates.get(item.assetId) || {
      assetId: item.assetId,
      score: 0,
      strongSignalCount: 0,
      mediumSignalCount: 0,
      weakSignalCount: 0,
      evidence: [],
    };
    candidate.score += item.score;
    if (item.strength === 'STRONG') candidate.strongSignalCount += 1;
    if (item.strength === 'COMPOSITE') candidate.mediumSignalCount += 1;
    if (item.strength === 'WEAK') candidate.weakSignalCount += 1;
    candidate.evidence.push(item);
    candidates.set(item.assetId, candidate);
  }
  return [...candidates.values()].sort((left, right) => right.score - left.score || left.assetId.localeCompare(right.assetId));
}

function osFamily(value: unknown): string | undefined {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('windows')) return 'WINDOWS';
  if (normalized.includes('linux') || /ubuntu|debian|rhel|centos|suse|fedora/.test(normalized)) return 'LINUX';
  if (normalized.includes('mac os') || normalized.includes('macos') || normalized.includes('darwin')) return 'MACOS';
  return undefined;
}

export class CmdbCorrelationService {
  public static async acquireIdentityLocks(client: pg.PoolClient, identifiers: ExtractedIdentifier[]): Promise<void> {
    const lockKeys = identifiers
      .filter((identifier) => identifier.strength === 'STRONG')
      .map((identifier) => `cmdb:identity:${identifier.type}:${identifier.namespace}:${identifier.normalizedValue}`)
      .sort();
    for (const key of lockKeys) {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
    }
  }

  public static async resolve(
    client: pg.PoolClient,
    sourceRecord: { id: string; assetId?: string },
    dto: NormalizedDiscoveryDto,
    identifiers: ExtractedIdentifier[],
  ): Promise<CorrelationResolution> {
    const evidence: CorrelationEvidence[] = [];
    for (const identifier of identifiers) {
      const matches = await client.query<{ asset_id: string }>(`
        SELECT asset_id FROM cmdb_asset_identifiers
        WHERE identifier_type_id=$1 AND namespace=$2 AND normalized_value=$3 AND retired_at IS NULL
        ORDER BY asset_id`, [identifier.type, identifier.namespace, identifier.normalizedValue]);
      const signalScore = identifier.strength === 'STRONG' ? 100 : identifier.strength === 'COMPOSITE' ? 30 : 10;
      for (const match of matches.rows) {
        evidence.push({
          signal: identifier.type,
          strength: identifier.strength,
          value: `${identifier.namespace}:${identifier.normalizedValue}`,
          assetId: match.asset_id,
          score: signalScore,
        });
      }
    }

    const ipAddresses = [...new Set(dto.network.interfaces.flatMap((nic) => nic.ipAddresses.map((ip) => ip.address)))].sort();
    for (const ipAddress of ipAddresses) {
      const matches = await client.query<{ asset_id: string }>(
        'SELECT DISTINCT asset_id FROM cmdb_ip_addresses WHERE ip_address=$1::inet AND retired_at IS NULL ORDER BY asset_id',
        [ipAddress],
      );
      for (const match of matches.rows) {
        evidence.push({ signal: 'IP_ADDRESS', strength: 'WEAK', value: ipAddress, assetId: match.asset_id, score: 5 });
      }
    }

    const fqdnCandidateIds = new Set(evidence.filter((item) => item.signal === 'FQDN').map((item) => item.assetId));

    // OS family is supporting evidence only. Restrict it to assets already
    // selected by exact FQDN so a common OS family cannot introduce unrelated
    // candidates or produce an automatic link by itself (or with an IP).
    const incomingOsFamily = osFamily(dto.operatingSystem.reported || dto.operatingSystem.configured);
    if (incomingOsFamily && fqdnCandidateIds.size) {
      const observed = await client.query<{ asset_id: string; effective_value: unknown }>(`
        SELECT asset_id,effective_value FROM cmdb_asset_attribute_state
        WHERE asset_id=ANY($1::varchar[])
          AND attribute_path IN ('operatingSystem.name','operatingSystem.reported','operatingSystem.configured')`, [[...fqdnCandidateIds]]);
      for (const item of observed.rows) if (osFamily(item.effective_value) === incomingOsFamily) {
        evidence.push({ signal: 'OS_FAMILY', strength: 'WEAK', value: incomingOsFamily, assetId: item.asset_id, score: 10 });
      }
    }

    if (fqdnCandidateIds.size) {
      const corroboration = await client.query<{ asset_id: string; source_count: string }>(`
        SELECT sr.asset_id,count(DISTINCT c.connector_type_id)::text source_count
        FROM cmdb_source_records sr JOIN cmdb_discovery_connectors c ON c.id=sr.connector_id
        WHERE sr.asset_id=ANY($1::varchar[]) AND sr.status='ACTIVE' AND sr.connector_id<>$2
        GROUP BY sr.asset_id`, [[...fqdnCandidateIds], dto.source.connectorId]);
      for (const item of corroboration.rows) if (Number(item.source_count) > 0) {
        evidence.push({ signal: 'INDEPENDENT_SOURCE', strength: 'WEAK', value: item.source_count, assetId: item.asset_id, score: 10 });
      }
    }

    const candidates = candidateMap(evidence);
    const inputStrong = identifiers.filter((identifier) => identifier.strength === 'STRONG');
    const strongCandidateIds = new Set(evidence.filter((item) => item.strength === 'STRONG').map((item) => item.assetId));

    const manualOverride = await client.query<{ asset_id: string; resolution_action: string }>(`
      SELECT asset_id,resolution_action FROM cmdb_correlation_overrides
      WHERE source_record_id=$1 AND active=TRUE AND asset_id IS NOT NULL`, [sourceRecord.id]);
    if (manualOverride.rows[0]) {
      return {
        outcome: 'AUTO_LINK',
        assetId: manualOverride.rows[0].asset_id,
        confidence: 100,
        candidates,
        evidence,
        summary: `Authorized manual correlation override: ${manualOverride.rows[0].resolution_action}.`,
      };
    }

    if (sourceRecord.assetId) {
      const existingStrong = await client.query<{ identifier_type_id: AssetIdentifierType; normalized_value: string; namespace: string }>(`
        SELECT ai.identifier_type_id, ai.normalized_value, ai.namespace
        FROM cmdb_asset_identifiers ai JOIN cmdb_identifier_types it ON it.id=ai.identifier_type_id
        WHERE ai.asset_id=$1 AND ai.retired_at IS NULL AND it.is_strong_identity`, [sourceRecord.assetId]);
      const contradictory = inputStrong.some((incoming) => existingStrong.rows.some((current) =>
        current.identifier_type_id === incoming.type
        && current.namespace === incoming.namespace
        && current.normalized_value !== incoming.normalizedValue));
      const pointsElsewhere = [...strongCandidateIds].some((assetId) => assetId !== sourceRecord.assetId);
      if (contradictory || pointsElsewhere) {
        return { outcome: 'IDENTITY_CONFLICT', confidence: 0, candidates, evidence, summary: 'The stable source record conflicts with existing strong canonical identity evidence.' };
      }
      return { outcome: 'AUTO_LINK', assetId: sourceRecord.assetId, confidence: 100, candidates, evidence, summary: 'The stable connector/object identity is already linked to a canonical asset.' };
    }

    if (strongCandidateIds.size === 1) {
      const assetId = [...strongCandidateIds][0];
      return { outcome: 'AUTO_LINK', assetId, confidence: 100, candidates, evidence, summary: 'Exactly one canonical asset matched strong identity evidence.' };
    }
    if (strongCandidateIds.size > 1) {
      return { outcome: 'IDENTITY_CONFLICT', confidence: 0, candidates, evidence, summary: 'Strong identifiers resolve to more than one canonical asset.' };
    }
    if (candidates.length === 1 && candidates[0].mediumSignalCount >= 2) {
      return { outcome: 'AUTO_LINK', assetId: candidates[0].assetId, confidence: 85, candidates, evidence, summary: 'Two independent composite identifiers agree on one canonical asset; hostname and IP were not used as sole identity.' };
    }
    if (candidates.length === 1) {
      const signals = new Set(candidates[0].evidence.map((item) => item.signal));
      if (signals.has('FQDN') && signals.has('OS_FAMILY') && signals.has('INDEPENDENT_SOURCE')) {
        return { outcome: 'AUTO_LINK', assetId: candidates[0].assetId, confidence: 80, candidates, evidence, summary: 'Exact FQDN, OS family, and independently active source coverage corroborate one canonical asset.' };
      }
    }
    if (inputStrong.length > 0) {
      return { outcome: 'CREATE_NEW', confidence: 100, candidates, evidence, summary: 'Strong identity evidence is new; hostname or IP similarity is not allowed to auto-merge it.' };
    }
    if (candidates.length === 0) {
      return { outcome: 'CREATE_NEW', confidence: 100, candidates, evidence, summary: 'No canonical identity evidence matched.' };
    }
    return { outcome: 'REVIEW_REQUIRED', confidence: Math.min(79, candidates[0]?.score || 0), candidates, evidence, summary: 'Only weak or ambiguous evidence matched; human correlation review is required.' };
  }

  public static async persistDecision(
    client: pg.PoolClient,
    input: { observationId: string; sourceRecordId: string; resolution: CorrelationResolution; selectedAssetId?: string; observedAt: string },
  ): Promise<string | undefined> {
    const selectedAssetId = input.selectedAssetId || input.resolution.assetId || null;
    await client.query(`
      INSERT INTO cmdb_correlation_decisions(observation_id,source_record_id,outcome,selected_asset_id,rule_version,confidence,evidence,decided_at)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
      ON CONFLICT(observation_id) DO NOTHING`, [
      input.observationId,
      input.sourceRecordId,
      input.resolution.outcome,
      selectedAssetId,
      CORRELATION_RULE_VERSION,
      input.resolution.confidence,
      JSON.stringify(input.resolution.evidence),
      input.observedAt,
    ]);
    if (!['REVIEW_REQUIRED', 'IDENTITY_CONFLICT'].includes(input.resolution.outcome)) return undefined;

    const existing = await client.query<{ id: string }>(
      "SELECT id FROM cmdb_correlation_cases WHERE source_record_id=$1 AND status='OPEN' FOR UPDATE",
      [input.sourceRecordId],
    );
    const caseId = existing.rows[0]?.id || `corr-${uuidv4()}`;
    if (existing.rows[0]) {
      await client.query(`
        UPDATE cmdb_correlation_cases
        SET observation_id=$2,outcome=$3,rule_version=$4,summary=$5,opened_at=$6
        WHERE id=$1`, [caseId, input.observationId, input.resolution.outcome, CORRELATION_RULE_VERSION, input.resolution.summary, input.observedAt]);
      await client.query('DELETE FROM cmdb_correlation_candidates WHERE case_id=$1', [caseId]);
    } else {
      await client.query(`
        INSERT INTO cmdb_correlation_cases(id,source_record_id,observation_id,outcome,status,rule_version,summary,opened_at)
        VALUES($1,$2,$3,$4,'OPEN',$5,$6,$7)`,
      [caseId, input.sourceRecordId, input.observationId, input.resolution.outcome, CORRELATION_RULE_VERSION, input.resolution.summary, input.observedAt]);
    }
    for (const candidate of input.resolution.candidates) {
      await client.query(`
        INSERT INTO cmdb_correlation_candidates(case_id,asset_id,score,strong_signal_count,medium_signal_count,weak_signal_count,evidence)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`, [caseId, candidate.assetId, candidate.score, candidate.strongSignalCount, candidate.mediumSignalCount, candidate.weakSignalCount, JSON.stringify(candidate.evidence)]);
    }
    return caseId;
  }
}
