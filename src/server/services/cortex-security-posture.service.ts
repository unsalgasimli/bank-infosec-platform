import crypto from 'node:crypto';
import type pg from 'pg';
import { pgClient } from '../db/postgres/client.js';

type Finding = { type: string; severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; title: string; details?: Record<string, unknown>; sourceRecordId?: string };

const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim().slice(0, 2048) : typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined;
const timestamp = (value: unknown): string | undefined => {
  if (typeof value === 'number' || /^\d{10,16}$/.test(String(value || ''))) {
    const number = Number(value); const millis = number < 10_000_000_000 ? number * 1000 : number;
    const date = new Date(millis); return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
  }
  const date = new Date(String(value || '')); return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
};
const normalizeProtection = (value: unknown): 'PROTECTED' | 'PARTIALLY_PROTECTED' | 'UNPROTECTED' | 'UNKNOWN' => {
  const normalized = String(value || '').toUpperCase().replace(/[\s-]+/g, '_');
  if (normalized.includes('PARTIALLY')) return 'PARTIALLY_PROTECTED';
  if (normalized === 'PROTECTED' || normalized.endsWith('_PROTECTED')) return 'PROTECTED';
  if (normalized.includes('UNPROTECTED')) return 'UNPROTECTED';
  return 'UNKNOWN';
};
const isOffline = (value: unknown) => /disconnect|offline|lost|stale/i.test(String(value || ''));
const versionParts = (value: string) => value.split(/[^0-9]+/).filter(Boolean).map(Number);
const versionLessThan = (actual: string, minimum: string) => {
  const left = versionParts(actual); const right = versionParts(minimum);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] || 0) !== (right[index] || 0)) return (left[index] || 0) < (right[index] || 0);
  }
  return false;
};
const findingId = (assetId: string, key: string) => `secf-${crypto.createHash('sha256').update(`${assetId}\u0000${key}`).digest('hex').slice(0, 32)}`;

export class CortexSecurityPostureService {
  public static async reconcileConnector(connectorId: string): Promise<{ postureCount: number; openFindings: number; resolvedFindings: number }> {
    return pgClient.transaction(async (client) => {
      const connector = await client.query<{ non_secret_configuration: Record<string, unknown> }>("SELECT non_secret_configuration FROM cmdb_discovery_connectors WHERE id=$1 AND connector_type_id='CORTEX' AND deleted_at IS NULL FOR UPDATE", [connectorId]);
      if (!connector.rows[0]) return { postureCount: 0, openFindings: 0, resolvedFindings: 0 };
      const configuration = connector.rows[0].non_secret_configuration || {};
      const staleAgentHours = Math.min(8760, Math.max(1, Number(configuration.staleAgentHours || 72)));
      const minimumAgentVersion = text(configuration.minimumAgentVersion);

      const sources = await client.query<any>(`SELECT id,asset_id,external_object_type,status,revision,normalized_payload,last_seen_at
        FROM cmdb_source_records WHERE connector_id=$1 AND asset_id IS NOT NULL
        ORDER BY asset_id,(external_object_type='CORTEX_ENDPOINT') DESC,last_seen_at DESC,id`, [connectorId]);
      const selected = new Map<string, any>();
      for (const row of sources.rows) if (!selected.has(row.asset_id)) selected.set(row.asset_id, row);
      for (const row of selected.values()) await this.upsertPosture(client, connectorId, row);

      const assets = await client.query<any>(`SELECT a.id,a.name,a.lifecycle_state,
          bool_or(c.connector_type_id='CORTEX' AND sr.status='ACTIVE') AS cortex,
          bool_or(c.connector_type_id='ACTIVE_DIRECTORY' AND sr.status='ACTIVE') AS ad,
          bool_or(c.connector_type_id='VCENTER' AND sr.status='ACTIVE' AND sr.external_object_type='VirtualMachine') AS vcenter,
          count(DISTINCT c.connector_type_id) FILTER (WHERE sr.status='ACTIVE') AS source_type_count
        FROM configuration_items a
        LEFT JOIN cmdb_source_records sr ON sr.asset_id=a.id
        LEFT JOIN cmdb_discovery_connectors c ON c.id=sr.connector_id AND c.deleted_at IS NULL
        WHERE a.archived_at IS NULL
        GROUP BY a.id,a.name,a.lifecycle_state`, []);
      const posture = await client.query<any>('SELECT * FROM cmdb_cortex_security_posture WHERE connector_id=$1', [connectorId]);
      const postureByAsset = new Map(posture.rows.map((row) => [row.asset_id, row]));
      const conflicts = await client.query<{ asset_id: string }>(`SELECT DISTINCT cc.asset_id FROM cmdb_correlation_cases c JOIN cmdb_correlation_candidates cc ON cc.case_id=c.id WHERE c.status='OPEN' AND c.outcome='IDENTITY_CONFLICT'`);
      const conflicted = new Set(conflicts.rows.map((row) => row.asset_id));
      const desired = new Map<string, { assetId: string; finding: Finding }>();
      const add = (assetId: string, finding: Finding) => desired.set(`${assetId}:${finding.type}`, { assetId, finding });

      for (const asset of assets.rows) {
        const state = postureByAsset.get(asset.id);
        if ((asset.ad || asset.vcenter) && !asset.cortex) add(asset.id, { type: asset.ad && asset.vcenter ? 'CORTEX_MISSING' : asset.vcenter ? 'VCENTER_WITHOUT_CORTEX' : 'AD_WITHOUT_CORTEX', severity: 'HIGH', title: 'Canonical asset is missing Cortex coverage', details: { ad: asset.ad, vcenter: asset.vcenter } });
        if (asset.cortex && !asset.ad && !asset.vcenter) add(asset.id, { type: 'CORTEX_ONLY', severity: 'MEDIUM', title: 'Cortex endpoint is not represented in AD or vCenter', sourceRecordId: state?.source_record_id });
        if (conflicted.has(asset.id)) add(asset.id, { type: 'IDENTITY_CONFLICT', severity: 'HIGH', title: 'Source identities conflict during reconciliation' });
        if (!state || !asset.cortex) continue;
        const lastSeen = state.cortex_last_seen_at ? new Date(state.cortex_last_seen_at).valueOf() : 0;
        if (isOffline(state.agent_status) || (lastSeen > 0 && Date.now() - lastSeen > staleAgentHours * 3_600_000)) add(asset.id, { type: 'CORTEX_OFFLINE', severity: 'HIGH', title: 'Cortex agent is offline or stale', details: { agentStatus: state.agent_status, lastSeenAt: state.cortex_last_seen_at, staleAgentHours }, sourceRecordId: state.source_record_id });
        if (state.protection_state === 'PARTIALLY_PROTECTED') add(asset.id, { type: 'CORTEX_PARTIALLY_PROTECTED', severity: 'HIGH', title: 'Cortex endpoint is only partially protected', sourceRecordId: state.source_record_id });
        if (state.protection_state === 'UNPROTECTED') add(asset.id, { type: 'CORTEX_UNPROTECTED', severity: 'CRITICAL', title: 'Cortex endpoint is unprotected', sourceRecordId: state.source_record_id });
        if (/outdated|out_of_date|waiting/i.test(String(state.content_status || ''))) add(asset.id, { type: 'CORTEX_CONTENT_OUTDATED', severity: 'HIGH', title: 'Cortex content is outdated', details: { contentStatus: state.content_status, contentVersion: state.content_version }, sourceRecordId: state.source_record_id });
        if (minimumAgentVersion && state.agent_version && versionLessThan(state.agent_version, minimumAgentVersion)) add(asset.id, { type: 'CORTEX_AGENT_OUTDATED', severity: 'MEDIUM', title: 'Cortex agent version is below the configured minimum', details: { agentVersion: state.agent_version, minimumAgentVersion }, sourceRecordId: state.source_record_id });
      }

      const now = new Date().toISOString();
      for (const { assetId, finding } of desired.values()) {
        const key = `${finding.type}:${connectorId}`;
        await client.query(`INSERT INTO cmdb_security_findings(id,asset_id,finding_type,source_connector_id,source_record_id,severity,state,title,details,detection_key,first_observed_at,last_observed_at)
          VALUES($1,$2,$3,$4,$5,$6,'OPEN',$7,$8::jsonb,$9,$10,$10)
          ON CONFLICT(asset_id,detection_key) DO UPDATE SET source_record_id=EXCLUDED.source_record_id,severity=EXCLUDED.severity,state='OPEN',title=EXCLUDED.title,details=EXCLUDED.details,last_observed_at=EXCLUDED.last_observed_at,resolved_at=NULL,updated_at=NOW()`,
        [findingId(assetId, key), assetId, finding.type, connectorId, finding.sourceRecordId || null, finding.severity, finding.title, JSON.stringify(finding.details || {}), key, now]);
      }
      const activeIds = [...desired.values()].map(({ assetId, finding }) => findingId(assetId, `${finding.type}:${connectorId}`));
      const resolved = activeIds.length
        ? await client.query(`UPDATE cmdb_security_findings SET state='RESOLVED',resolved_at=NOW(),updated_at=NOW()
            WHERE source_connector_id=$1 AND state='OPEN' AND NOT(id=ANY($2::text[]))`, [connectorId, activeIds])
        : await client.query("UPDATE cmdb_security_findings SET state='RESOLVED',resolved_at=NOW(),updated_at=NOW() WHERE source_connector_id=$1 AND state='OPEN'", [connectorId]);
      return { postureCount: selected.size, openFindings: desired.size, resolvedFindings: resolved.rowCount || 0 };
    });
  }

  private static async upsertPosture(client: pg.PoolClient, connectorId: string, row: any): Promise<void> {
    const dto = row.normalized_payload || {};
    const cortex = dto.sourceSpecificMetadata?.cortex || {};
    const firstSeen = timestamp(cortex.firstSeen);
    const lastSeen = timestamp(cortex.lastSeen) || timestamp(row.last_seen_at);
    const policies = [cortex.assignedPreventionPolicy, cortex.assignedExtensionsPolicy, ...(Array.isArray(cortex.securityPolicies) ? cortex.securityPolicies : [])].map(text).filter(Boolean);
    const agentStatus = text(cortex.agentStatus || dto.technicalState);
    await client.query(`INSERT INTO cmdb_cortex_security_posture(asset_id,connector_id,source_record_id,cortex_asset_id,endpoint_id,asset_class,asset_category,asset_type,coverage_status,agent_installed,agent_status,agent_version,protection_state,isolation_status,content_status,content_version,assigned_security_policies,cortex_first_seen_at,cortex_last_seen_at,observed_at,source_record_revision)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19,$20,$21)
      ON CONFLICT(asset_id) DO UPDATE SET connector_id=EXCLUDED.connector_id,source_record_id=EXCLUDED.source_record_id,cortex_asset_id=COALESCE(EXCLUDED.cortex_asset_id,cmdb_cortex_security_posture.cortex_asset_id),endpoint_id=COALESCE(EXCLUDED.endpoint_id,cmdb_cortex_security_posture.endpoint_id),asset_class=EXCLUDED.asset_class,asset_category=EXCLUDED.asset_category,asset_type=EXCLUDED.asset_type,coverage_status=EXCLUDED.coverage_status,agent_installed=EXCLUDED.agent_installed,agent_status=EXCLUDED.agent_status,agent_version=EXCLUDED.agent_version,protection_state=EXCLUDED.protection_state,isolation_status=EXCLUDED.isolation_status,content_status=EXCLUDED.content_status,content_version=EXCLUDED.content_version,assigned_security_policies=EXCLUDED.assigned_security_policies,cortex_first_seen_at=COALESCE(cmdb_cortex_security_posture.cortex_first_seen_at,EXCLUDED.cortex_first_seen_at),cortex_last_seen_at=GREATEST(cmdb_cortex_security_posture.cortex_last_seen_at,EXCLUDED.cortex_last_seen_at),observed_at=EXCLUDED.observed_at,source_record_revision=EXCLUDED.source_record_revision,updated_at=NOW()`, [
      row.asset_id, connectorId, row.id, text(cortex.assetId), text(cortex.endpointId), text(cortex.assetClass), text(cortex.assetCategory), text(cortex.assetType), row.status === 'ACTIVE' ? 'COVERED' : row.status === 'STALE' ? 'STALE' : 'MISSING', cortex.agentInstalled === undefined ? Boolean(cortex.endpointId || cortex.agentVersion) : Boolean(cortex.agentInstalled), agentStatus || null, text(cortex.agentVersion), normalizeProtection(cortex.protectionState || cortex.operationalStatus), text(cortex.isolationStatus), text(cortex.contentStatus), text(cortex.contentVersion), JSON.stringify([...new Set(policies)]), firstSeen || null, lastSeen || null, row.last_seen_at, Number(row.revision),
    ]);
  }
}
