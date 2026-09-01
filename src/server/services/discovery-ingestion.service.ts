import crypto from 'crypto';
import type pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  discoveryObservationEnvelopeSchema,
  normalizedDiscoveryDtoSchema,
  stableJson,
  type DiscoveryObservationEnvelope,
  type NormalizedDiscoveryDto,
} from '../../shared/utils/cmdb-discovery-contract.js';
import { pgClient } from '../db/postgres/client.js';
import { logger } from './logger.service.js';
import { ConnectorScopedLockService } from './discovery-lock.service.js';
import {
  CmdbCorrelationService,
  CORRELATION_RULE_VERSION,
  extractDiscoveryIdentifiers,
  type CorrelationOutcome,
  type ExtractedIdentifier,
} from './cmdb-correlation.service.js';
import { CmdbPrecedenceService, type AppliedAttributeChange } from './cmdb-precedence.service.js';

export interface DiscoveryPayloadMapper<TRaw = unknown> {
  readonly name: string;
  readonly normalizedSchemaVersion: 1;
  validateRaw(payload: unknown): TRaw;
  normalize(payload: TRaw, envelope: DiscoveryObservationEnvelope): NormalizedDiscoveryDto | Promise<NormalizedDiscoveryDto>;
}

export interface DiscoveryIngestionResult {
  observationId: string;
  sourceRecordId: string;
  assetId?: string;
  outcome: CorrelationOutcome;
  correlationCaseId?: string;
  assetCreated: boolean;
  reactivated: boolean;
  unchanged: boolean;
  changedFields: string[];
}

export interface DiscoveryBatchResult {
  succeeded: DiscoveryIngestionResult[];
  failed: Array<{ sourceObjectType: string; sourceObjectId: string; error: string }>;
}

type SourceRecordRow = {
  id: string;
  asset_id: string | null;
  revision: string | number;
  normalized_payload_hash: string | null;
};

type RawObservationRow = {
  id: string;
  processing_status: string;
  inserted: boolean;
};

const sha256 = (value: unknown): string => crypto.createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex');
const deterministicId = (prefix: string, value: unknown): string => `${prefix}-${sha256(value).slice(0, 32)}`;
const relationshipTypeId = (value: string): string => value.toLowerCase();

export class DiscoveryIngestionError extends Error {
  public constructor(message: string, public readonly code: string, public readonly retryable = false) {
    super(message);
  }
}

export class DiscoveryIngestionService {
  public static async ingestObservation<TRaw>(rawEnvelope: unknown, mapper: DiscoveryPayloadMapper<TRaw>): Promise<DiscoveryIngestionResult> {
    const started = Date.now();
    const envelope = discoveryObservationEnvelopeSchema.parse(rawEnvelope);
    let validatedRaw: TRaw;
    try {
      validatedRaw = mapper.validateRaw(envelope.rawPayload);
    } catch (error) {
      throw new DiscoveryIngestionError(error instanceof Error ? error.message : 'Raw payload validation failed.', 'RAW_VALIDATION_FAILED');
    }

    const rawHash = sha256(validatedRaw);
    const observation = await this.persistRawObservation(envelope, rawHash, mapper.normalizedSchemaVersion);
    if (observation.processing_status === 'PROCESSED') {
      const existing = await this.loadProcessedResult(observation.id);
      if (existing) return existing;
    }

    try {
      const mapped = await mapper.normalize(validatedRaw, envelope);
      const dto = normalizedDiscoveryDtoSchema.parse(mapped);
      if (dto.source.connectorId !== envelope.connectorId
        || dto.source.objectType !== envelope.sourceObjectType
        || dto.source.objectId !== envelope.sourceObjectId) {
        throw new DiscoveryIngestionError('Normalized source identity must exactly match the observation envelope.', 'SOURCE_IDENTITY_MISMATCH');
      }
      const result = await this.processNormalizedObservation(envelope, dto, rawHash, observation.id);
      logger.info({
        connectorId: envelope.connectorId,
        syncRunId: envelope.syncRunId,
        sourceObjectType: envelope.sourceObjectType,
        outcome: result.outcome,
        assetId: result.assetId,
        changedFields: result.changedFields,
        durationMs: Date.now() - started,
      }, 'CMDB discovery observation processed');
      return result;
    } catch (error) {
      await this.markObservationFailed(observation.id, envelope.syncRunId, error);
      throw error;
    }
  }

  public static async ingestBatch<TRaw>(rawEnvelopes: unknown[], mapper: DiscoveryPayloadMapper<TRaw>): Promise<DiscoveryBatchResult> {
    const succeeded: DiscoveryIngestionResult[] = [];
    const failed: DiscoveryBatchResult['failed'] = [];
    for (const raw of rawEnvelopes) {
      const identity = discoveryObservationEnvelopeSchema.safeParse(raw);
      try {
        succeeded.push(await this.ingestObservation(raw, mapper));
      } catch (error) {
        failed.push({
          sourceObjectType: identity.success ? identity.data.sourceObjectType : 'INVALID',
          sourceObjectId: identity.success ? identity.data.sourceObjectId : 'INVALID',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { succeeded, failed };
  }

  public static async reconcileAndCompleteRun(runId: string): Promise<{ staleCandidates: number; lifecycleChanges: number }> {
    const connectorResult = await pgClient.query<{ connector_id: string }>('SELECT connector_id FROM cmdb_discovery_sync_runs WHERE id=$1', [runId]);
    if (!connectorResult.rows[0]) throw new DiscoveryIngestionError('Discovery run not found.', 'RUN_NOT_FOUND');
    const locked = await ConnectorScopedLockService.withLock(connectorResult.rows[0].connector_id, 'sync', () => pgClient.transaction(async (client) => {
      const runResult = await client.query<any>('SELECT * FROM cmdb_discovery_sync_runs WHERE id=$1 FOR UPDATE', [runId]);
      const run = runResult.rows[0];
      if (!run) throw new DiscoveryIngestionError('Discovery run not found.', 'RUN_NOT_FOUND');
      if (['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(run.state)) {
        return { staleCandidates: Number(run.stale_candidate_count || 0), lifecycleChanges: 0 };
      }
      let staleCandidates = 0;
      let lifecycleChanges = 0;
      if (['FULL', 'RECONCILIATION'].includes(run.run_type)) {
        const policy = await client.query<any>(`
          SELECT * FROM cmdb_discovery_lifecycle_policies
          WHERE connector_id=$1 OR scope_key='GLOBAL'
          ORDER BY (connector_id IS NOT NULL) DESC LIMIT 1`, [run.connector_id]);
        const currentPolicy = policy.rows[0];
        const staleAfter = Number(currentPolicy.stale_after_missed_runs);
        const decommissionAfter = Number(currentPolicy.decommission_after_missed_runs);
        const retireAfter = currentPolicy.retire_after_missed_runs === null ? null : Number(currentPolicy.retire_after_missed_runs);
        const autoRetire = Boolean(currentPolicy.auto_retire_enabled);
        const missed = await client.query<{ id: string; asset_id: string | null; miss_count: number }>(`
          UPDATE cmdb_source_records
          SET miss_count=miss_count+1,
              status=CASE WHEN miss_count+1 >= $3 THEN 'STALE' ELSE 'MISSING' END,
              missing_since=COALESCE(missing_since,NOW()),updated_at=NOW()
          WHERE connector_id=$1 AND last_sync_run_id<>$2 AND status NOT IN ('RETIRED','ERROR')
          RETURNING id,asset_id,miss_count`, [run.connector_id, runId, staleAfter]);
        staleCandidates = missed.rowCount || 0;
        const assetIds = [...new Set(missed.rows.map((row) => row.asset_id).filter((id): id is string => Boolean(id)))];
        for (const assetId of assetIds) {
          const sourceState = await client.query<{ active_count: string; max_misses: string }>(`
            SELECT count(*) FILTER (WHERE status='ACTIVE') AS active_count,
                   COALESCE(max(miss_count),0) AS max_misses
            FROM cmdb_source_records WHERE asset_id=$1`, [assetId]);
          if (Number(sourceState.rows[0].active_count) > 0) continue;
          const misses = Number(sourceState.rows[0].max_misses);
          const desired = autoRetire && retireAfter !== null && misses >= retireAfter
            ? 'RETIRED'
            : misses >= decommissionAfter
              ? 'DECOMMISSION_CANDIDATE'
              : misses >= staleAfter
                ? 'STALE'
                : undefined;
          if (!desired) continue;
          const changed = await client.query<{ lifecycle_state: string }>(`
            UPDATE configuration_items
            SET lifecycle_state=$2,
                stale_since=CASE WHEN $2 IN ('STALE','DECOMMISSION_CANDIDATE') THEN COALESCE(stale_since,NOW()) ELSE stale_since END,
                retired_at=CASE WHEN $2='RETIRED' THEN COALESCE(retired_at,NOW()) ELSE retired_at END,
                updated_at=NOW(),version=version+1
            WHERE id=$1 AND lifecycle_state NOT IN ($2,'ARCHIVED')
            RETURNING lifecycle_state`, [assetId, desired]);
          if (!changed.rowCount) continue;
          lifecycleChanges += 1;
          const topic = desired === 'STALE' ? 'asset.stale' : desired === 'RETIRED' ? 'asset.retired' : 'asset.updated';
          await this.insertOutbox(client, topic, 'CONFIGURATION_ITEM', assetId, {
            assetId, lifecycleState: desired, missCount: misses, syncRunId: runId,
          }, `${topic}:${assetId}:${runId}:${misses}`);
        }
      }
      await client.query(`
        UPDATE cmdb_discovery_sync_runs
        SET state=CASE WHEN failed_count>0 THEN 'PARTIAL' ELSE 'SUCCEEDED' END,
            started_at=COALESCE(started_at,NOW()),
            stale_candidate_count=$2,completed_at=NOW(),updated_at=NOW()
        WHERE id=$1`, [runId, staleCandidates]);
      await client.query(`
        UPDATE cmdb_discovery_connectors
        SET last_sync_at=NOW(),
            last_successful_sync_at=CASE WHEN $4=0 THEN NOW() ELSE last_successful_sync_at END,
            last_full_sync_at=CASE WHEN $2='FULL' AND $4=0 THEN NOW() ELSE last_full_sync_at END,
            last_incremental_at=CASE WHEN $2='INCREMENTAL' AND $4=0 THEN NOW() ELSE last_incremental_at END,
            last_reconciliation_at=CASE WHEN $2='RECONCILIATION' AND $4=0 THEN NOW() ELSE last_reconciliation_at END,
            health_status=CASE WHEN $4=0 THEN 'HEALTHY' ELSE 'DEGRADED' END,
            operational_state=CASE WHEN enabled THEN CASE WHEN $4=0 THEN 'READY' ELSE 'DEGRADED' END ELSE 'DISABLED' END,
            consecutive_failures=CASE WHEN $4=0 THEN 0 ELSE consecutive_failures+1 END,
            checkpoint=COALESCE($3, checkpoint), updated_at=NOW()
        WHERE id=$1 AND deleted_at IS NULL`, [run.connector_id, run.run_type, run.checkpoint || null, Number(run.failed_count || 0)]);
      await this.insertOutbox(client, 'discovery.run.completed', 'DISCOVERY_RUN', runId, {
        runId, connectorId: run.connector_id, staleCandidates, lifecycleChanges,
      }, `discovery.run.completed:${runId}`);
      return { staleCandidates, lifecycleChanges };
    }));
    if (!locked.acquired) throw new DiscoveryIngestionError('Another sync operation is already running for this connector.', 'CONNECTOR_SYNC_LOCKED');
    return locked.value;
  }

  public static async failRun(runId: string, error: unknown): Promise<void> {
    await pgClient.transaction(async (client) => {
      const message = error instanceof Error ? error.message : String(error);
      const run = await client.query<{ connector_id: string }>(`
        UPDATE cmdb_discovery_sync_runs
        SET state='FAILED',started_at=COALESCE(started_at,NOW()),completed_at=NOW(),updated_at=NOW(),
            error_summary=error_summary || jsonb_build_array(jsonb_build_object('message',$2::text,'at',NOW()))
        WHERE id=$1 AND state NOT IN ('SUCCEEDED','PARTIAL','FAILED','CANCELLED')
        RETURNING connector_id`, [runId, message.slice(0, 4000)]);
      if (!run.rows[0]) return;
      await client.query(`
        UPDATE cmdb_discovery_connectors
        SET health_status=CASE WHEN enabled THEN 'DEGRADED' ELSE 'DISABLED' END,
            operational_state=CASE WHEN enabled THEN 'DEGRADED' ELSE 'DISABLED' END,
            last_failure_at=NOW(), last_failure_code='DISCOVERY_RUN_FAILED',
            last_failure_message=$2, consecutive_failures=consecutive_failures+1,
            updated_at=NOW()
        WHERE id=$1 AND deleted_at IS NULL`, [run.rows[0].connector_id, message.slice(0, 4000)]);
      await this.insertOutbox(client, 'discovery.run.failed', 'DISCOVERY_RUN', runId, {
        runId, connectorId: run.rows[0].connector_id, error: message.slice(0, 1000),
      }, `discovery.run.failed:${runId}`);
    });
  }

  /** Complete an incomplete source read without evaluating source absence. */
  public static async completePartialRun(runId: string, checkpoint: Record<string, unknown> = {}, error?: unknown): Promise<void> {
    const connectorResult = await pgClient.query<{ connector_id: string }>('SELECT connector_id FROM cmdb_discovery_sync_runs WHERE id=$1', [runId]);
    if (!connectorResult.rows[0]) throw new DiscoveryIngestionError('Discovery run not found.', 'RUN_NOT_FOUND');
    const locked = await ConnectorScopedLockService.withLock(connectorResult.rows[0].connector_id, 'sync', () => pgClient.transaction(async (client) => {
      const message = error ? (error instanceof Error ? error.message : String(error)).slice(0, 4000) : undefined;
      const run = await client.query<{ connector_id: string }>(`UPDATE cmdb_discovery_sync_runs
        SET state='PARTIAL',started_at=COALESCE(started_at,NOW()),completed_at=NOW(),checkpoint=$2,
            error_summary=CASE WHEN $3::text IS NULL THEN error_summary ELSE error_summary || jsonb_build_array(jsonb_build_object('message',$3,'at',NOW(),'partial',true)) END,
            updated_at=NOW()
        WHERE id=$1 AND state NOT IN ('SUCCEEDED','PARTIAL','FAILED','CANCELLED') RETURNING connector_id`, [runId, JSON.stringify(checkpoint), message || null]);
      if (!run.rows[0]) return;
      await client.query(`UPDATE cmdb_discovery_connectors SET last_sync_at=NOW(),health_status=CASE WHEN enabled THEN 'DEGRADED' ELSE 'DISABLED' END,
        operational_state=CASE WHEN enabled THEN 'DEGRADED' ELSE 'DISABLED' END,consecutive_failures=consecutive_failures+1,checkpoint=$2,updated_at=NOW() WHERE id=$1`, [run.rows[0].connector_id, JSON.stringify(checkpoint)]);
      await this.insertOutbox(client, 'discovery.run.completed', 'DISCOVERY_RUN', runId, { runId, connectorId: run.rows[0].connector_id, partial: true, absenceReconciliation: false }, `discovery.run.completed:${runId}`);
    }));
    if (!locked.acquired) throw new DiscoveryIngestionError('Another sync operation is already running for this connector.', 'CONNECTOR_SYNC_LOCKED');
  }

  private static async persistRawObservation(
    envelope: DiscoveryObservationEnvelope,
    rawHash: string,
    schemaVersion: number,
  ): Promise<RawObservationRow> {
    return pgClient.transaction(async (client) => {
      const run = await client.query<{ connector_id: string; state: string }>(
        'SELECT connector_id,state FROM cmdb_discovery_sync_runs WHERE id=$1 FOR UPDATE',
        [envelope.syncRunId],
      );
      if (!run.rows[0] || run.rows[0].connector_id !== envelope.connectorId) {
        throw new DiscoveryIngestionError('Observation connector does not match a real discovery run.', 'RUN_CONNECTOR_MISMATCH');
      }
      if (!['QUEUED', 'RUNNING'].includes(run.rows[0].state)) {
        throw new DiscoveryIngestionError(`Discovery run is not ingestible in state ${run.rows[0].state}.`, 'RUN_NOT_ACTIVE');
      }
      await client.query("UPDATE cmdb_discovery_sync_runs SET state='RUNNING',started_at=COALESCE(started_at,NOW()),updated_at=NOW() WHERE id=$1", [envelope.syncRunId]);
       const inserted = await client.query<RawObservationRow>(`
        INSERT INTO cmdb_raw_observations(
          connector_id,sync_run_id,source_object_type,source_object_id,observed_at,
          schema_version,raw_payload,deterministic_hash,processing_status
        ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'RECEIVED')
         ON CONFLICT(sync_run_id,source_object_type,source_object_id,deterministic_hash)
         DO NOTHING
         RETURNING id::text,processing_status,(xmax=0) AS inserted`, [
        envelope.connectorId,
        envelope.syncRunId,
        envelope.sourceObjectType,
        envelope.sourceObjectId,
        envelope.observedAt,
        schemaVersion,
        JSON.stringify(envelope.rawPayload),
        rawHash,
      ]);
       if (inserted.rows[0]) return inserted.rows[0];
       const existing = await client.query<RawObservationRow>(`SELECT id::text,processing_status,FALSE AS inserted
         FROM cmdb_raw_observations WHERE sync_run_id=$1 AND source_object_type=$2 AND source_object_id=$3 AND deterministic_hash=$4`, [
         envelope.syncRunId, envelope.sourceObjectType, envelope.sourceObjectId, rawHash,
       ]);
       if (!existing.rows[0]) throw new DiscoveryIngestionError('Concurrent raw observation was not available after deduplication.', 'OBSERVATION_DEDUPLICATION_RACE', true);
       return existing.rows[0];
    });
  }

  private static async processNormalizedObservation(
    envelope: DiscoveryObservationEnvelope,
    dto: NormalizedDiscoveryDto,
    rawHash: string,
    observationId: string,
  ): Promise<DiscoveryIngestionResult> {
    const normalizedHash = sha256(dto);
    return pgClient.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `cmdb:source:${envelope.connectorId}:${envelope.sourceObjectType}:${envelope.sourceObjectId}`,
      ]);
      const raw = await client.query<{ processing_status: string }>(
        'SELECT processing_status FROM cmdb_raw_observations WHERE id=$1 FOR UPDATE',
        [observationId],
      );
      if (raw.rows[0]?.processing_status === 'PROCESSED') {
        const existing = await this.loadProcessedResultWithClient(client, observationId);
        if (existing) return existing;
      }

      const sourceRecord = await this.upsertSourceRecord(client, envelope, dto, rawHash, normalizedHash);
      await client.query(`UPDATE cmdb_raw_observations
        SET source_record_id=$2,processing_status='VALIDATED',processing_attempts=processing_attempts+1
        WHERE id=$1`, [observationId, sourceRecord.id]);

      const identifiers = extractDiscoveryIdentifiers(dto);
      await CmdbCorrelationService.acquireIdentityLocks(client, identifiers);
      const resolution = await CmdbCorrelationService.resolve(client, {
        id: sourceRecord.id,
        assetId: sourceRecord.asset_id || undefined,
      }, dto, identifiers);

      const connectorType = await client.query<{ connector_type_id: string }>(
        'SELECT connector_type_id FROM cmdb_discovery_connectors WHERE id=$1 AND deleted_at IS NULL',
        [envelope.connectorId],
      );
      const isVCenter = connectorType.rows[0]?.connector_type_id === 'VCENTER';

      // VMware observations remain evidence until a governed reconciliation
      // decision explicitly promotes them. This prevents an adapter from
      // directly creating or mutating canonical configuration_items.
      if (isVCenter) {
        const matchedAssetId = resolution.outcome === 'AUTO_LINK' ? resolution.assetId : undefined;
        await client.query(`UPDATE cmdb_source_records
          SET asset_id=$2,status=$3,last_correlation_outcome=$4,correlation_rule_version=$5,updated_at=NOW()
          WHERE id=$1`, [
          sourceRecord.id,
          matchedAssetId || null,
          matchedAssetId ? 'ACTIVE' : 'UNMATCHED',
          resolution.outcome,
          CORRELATION_RULE_VERSION,
        ]);
        const correlationCaseId = await CmdbCorrelationService.persistDecision(client, {
          observationId, sourceRecordId: sourceRecord.id, resolution,
          ...(matchedAssetId ? { selectedAssetId: matchedAssetId } : {}),
          observedAt: envelope.observedAt,
        });
        await client.query("UPDATE cmdb_raw_observations SET processing_status='PROCESSED',processed_at=NOW() WHERE id=$1", [observationId]);
        await this.accountObservation(client, observationId, envelope.syncRunId, resolution.outcome, false, false);
        if (correlationCaseId) {
          await this.insertOutbox(client, 'asset.correlation.required', 'CORRELATION_CASE', correlationCaseId, {
            correlationCaseId, sourceRecordId: sourceRecord.id, connectorId: envelope.connectorId, outcome: resolution.outcome,
          }, `asset.correlation.required:${correlationCaseId}:${observationId}`);
        }
        return {
          observationId, sourceRecordId: sourceRecord.id, assetId: matchedAssetId,
          outcome: resolution.outcome, correlationCaseId, assetCreated: false,
          reactivated: false, unchanged: false, changedFields: [],
        };
      }

      let assetId = resolution.assetId;
      let assetCreated = false;
      if (resolution.outcome === 'CREATE_NEW') {
        assetId = await this.createCanonicalAsset(client, dto, sourceRecord.id, envelope.observedAt);
        assetCreated = true;
      }

      await this.stagePendingRelationships(client, sourceRecord.id, assetId, envelope, dto);

      if (!assetId || ['REVIEW_REQUIRED', 'IDENTITY_CONFLICT'].includes(resolution.outcome)) {
        await client.query(`UPDATE cmdb_source_records
          SET asset_id=NULL,status='UNMATCHED',last_correlation_outcome=$2,correlation_rule_version=$3,updated_at=NOW()
          WHERE id=$1`, [sourceRecord.id, resolution.outcome, CORRELATION_RULE_VERSION]);
        const correlationCaseId = await CmdbCorrelationService.persistDecision(client, {
          observationId, sourceRecordId: sourceRecord.id, resolution, observedAt: envelope.observedAt,
        });
        await client.query("UPDATE cmdb_raw_observations SET processing_status='PROCESSED',processed_at=NOW() WHERE id=$1", [observationId]);
        await this.accountObservation(client, observationId, envelope.syncRunId, resolution.outcome, false, false);
        if (correlationCaseId) {
          await this.insertOutbox(client, 'asset.correlation.required', 'CORRELATION_CASE', correlationCaseId, {
            correlationCaseId, sourceRecordId: sourceRecord.id, outcome: resolution.outcome,
          }, `asset.correlation.required:${correlationCaseId}:${observationId}`);
        }
        return {
          observationId, sourceRecordId: sourceRecord.id, outcome: resolution.outcome,
          correlationCaseId, assetCreated: false, reactivated: false, unchanged: false, changedFields: [],
        };
      }

      const asset = await client.query<any>('SELECT * FROM configuration_items WHERE id=$1 FOR UPDATE', [assetId]);
      if (!asset.rows[0]) throw new DiscoveryIngestionError('Correlated canonical asset no longer exists.', 'ASSET_NOT_FOUND', true);
      await CmdbPrecedenceService.protectExistingBusinessFields(client, asset.rows[0]);
      await client.query(`UPDATE cmdb_source_records SET asset_id=$2,status='ACTIVE',miss_count=0,missing_since=NULL,
        last_correlation_outcome=$3,correlation_rule_version=$4,updated_at=NOW() WHERE id=$1`,
      [sourceRecord.id, assetId, resolution.outcome, CORRELATION_RULE_VERSION]);

      const reactivated = await this.reactivateIfNeeded(client, assetId, sourceRecord, envelope);
      const identifierChanges = await this.upsertIdentifiers(client, assetId, sourceRecord, envelope, identifiers, assetCreated);
      const attributes = this.discoveryAttributes(dto);
      const attributeChanges = await CmdbPrecedenceService.applyDiscoveryAttributes(client, {
        assetId,
        connectorId: envelope.connectorId,
        sourceRecordId: sourceRecord.id,
        sourceRecordRevision: Number(sourceRecord.revision),
        syncRunId: envelope.syncRunId,
        observedAt: envelope.observedAt,
        attributes,
        recordChanges: !assetCreated,
      });
      const networkChanged = await this.reconcileNetwork(client, assetId, sourceRecord, envelope, dto, assetCreated);
      const storageChanged = await this.reconcileStorage(client, assetId, sourceRecord, envelope, dto, assetCreated);
      const tagsChanged = await this.reconcileTags(client, assetId, sourceRecord, envelope, dto, assetCreated);
      const relationshipChanges = await this.resolvePendingRelationships(client, sourceRecord, envelope);

      await CmdbCorrelationService.persistDecision(client, {
        observationId, sourceRecordId: sourceRecord.id, resolution, selectedAssetId: assetId, observedAt: envelope.observedAt,
      });
      await client.query("UPDATE cmdb_raw_observations SET processing_status='PROCESSED',processed_at=NOW() WHERE id=$1", [observationId]);
      await client.query(`UPDATE configuration_items
        SET last_seen_at=GREATEST(COALESCE(last_seen_at,$2),$2),last_discovered_at=$2,last_sync_at=$2,
            discovery_status='SYNCED',sync_status='SYNCED',updated_at=NOW()
        WHERE id=$1`, [assetId, envelope.observedAt]);

      const changedFields = [
        ...identifierChanges,
        ...attributeChanges.filter((change) => change.changeId).map((change) => change.path),
        ...(networkChanged ? ['network'] : []),
        ...(storageChanged ? ['storage'] : []),
        ...(tagsChanged ? ['tags'] : []),
        ...relationshipChanges,
        ...(reactivated ? ['lifecycleState'] : []),
      ];
      if (assetCreated) {
        await this.insertOutbox(client, 'asset.discovered', 'CONFIGURATION_ITEM', assetId, { assetId, sourceRecordId: sourceRecord.id, connectorId: envelope.connectorId }, `asset.discovered:${assetId}`);
        await this.insertOutbox(client, 'asset.created', 'CONFIGURATION_ITEM', assetId, { assetId, sourceRecordId: sourceRecord.id, connectorId: envelope.connectorId }, `asset.created:${assetId}`);
        await this.insertOutbox(client, 'cmdb.ci.created', 'CONFIGURATION_ITEM', assetId, { ciId: assetId, actorId: null, criticality: 'MEDIUM', typeId: dto.classification.type }, `cmdb.ci.created:${assetId}`);
      } else if (changedFields.length > 0) {
        await this.insertOutbox(client, 'asset.updated', 'CONFIGURATION_ITEM', assetId, { assetId, sourceRecordId: sourceRecord.id, changedFields }, `asset.updated:${assetId}:${sourceRecord.id}:${sourceRecord.revision}`);
        await this.insertOutbox(client, 'cmdb.ci.material-change', 'CONFIGURATION_ITEM', assetId, { ciId: assetId, actorId: null, changedFields }, `cmdb.ci.material-change:${assetId}:${sourceRecord.id}:${sourceRecord.revision}`);
      }
      await this.accountObservation(client, observationId, envelope.syncRunId, resolution.outcome, assetCreated, changedFields.length > 0);
      return {
        observationId,
        sourceRecordId: sourceRecord.id,
        assetId,
        outcome: resolution.outcome,
        assetCreated,
        reactivated,
        unchanged: !assetCreated && !reactivated && changedFields.length === 0,
        changedFields: [...new Set(changedFields)].sort(),
      };
    });
  }

  private static async upsertSourceRecord(
    client: pg.PoolClient,
    envelope: DiscoveryObservationEnvelope,
    dto: NormalizedDiscoveryDto,
    rawHash: string,
    normalizedHash: string,
  ): Promise<SourceRecordRow> {
    const sourceId = deterministicId('src', `${envelope.connectorId}\u0000${envelope.sourceObjectType}\u0000${envelope.sourceObjectId}`);
    const result = await client.query<SourceRecordRow>(`
      INSERT INTO cmdb_source_records(
        id,connector_id,external_object_type,external_object_id,native_uuid,source_name,
        first_seen_at,last_seen_at,last_sync_run_id,current_observation_hash,
        normalized_payload_hash,normalized_schema_version,normalized_payload,normalized_at,
        revision,status,miss_count
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11,$12::jsonb,$7,1,'UNMATCHED',0)
      ON CONFLICT(connector_id,external_object_type,external_object_id) DO UPDATE SET
        native_uuid=COALESCE(EXCLUDED.native_uuid,cmdb_source_records.native_uuid),
        source_name=EXCLUDED.source_name,
        last_seen_at=GREATEST(cmdb_source_records.last_seen_at,EXCLUDED.last_seen_at),
        last_sync_run_id=EXCLUDED.last_sync_run_id,
        current_observation_hash=EXCLUDED.current_observation_hash,
        normalized_payload_hash=EXCLUDED.normalized_payload_hash,
        normalized_schema_version=EXCLUDED.normalized_schema_version,
        normalized_payload=EXCLUDED.normalized_payload,
        normalized_at=EXCLUDED.normalized_at,
        revision=CASE WHEN cmdb_source_records.normalized_payload_hash IS DISTINCT FROM EXCLUDED.normalized_payload_hash
          THEN cmdb_source_records.revision+1 ELSE cmdb_source_records.revision END,
        status=CASE WHEN cmdb_source_records.asset_id IS NULL THEN 'UNMATCHED' ELSE 'ACTIVE' END,
        miss_count=0,missing_since=NULL,updated_at=NOW()
      RETURNING id,asset_id,revision,normalized_payload_hash`, [
      sourceId,
      envelope.connectorId,
      envelope.sourceObjectType,
      envelope.sourceObjectId,
      dto.source.nativeUuid || null,
      dto.identity.name,
      envelope.observedAt,
      envelope.syncRunId,
      rawHash,
      normalizedHash,
      dto.schemaVersion,
      JSON.stringify(dto),
    ]);
    return result.rows[0];
  }

  private static async createCanonicalAsset(
    client: pg.PoolClient,
    dto: NormalizedDiscoveryDto,
    sourceRecordId: string,
    observedAt: string,
  ): Promise<string> {
    const type = await client.query('SELECT id FROM cmdb_ci_types WHERE id=$1 AND is_active=TRUE', [dto.classification.type]);
    if (!type.rows[0]) throw new DiscoveryIngestionError(`Unknown or inactive canonical asset type: ${dto.classification.type}`, 'INVALID_ASSET_TYPE');
    const assetId = `ci-${uuidv4()}`;
    const ciNumber = `CI-DISC-${uuidv4().replace(/-/g, '').slice(0, 20).toUpperCase()}`;
    const sourcePayload = {
      id: assetId,
      ciNumber,
      name: dto.identity.name,
      displayName: dto.identity.name,
      typeId: dto.classification.type,
      status: 'ACTIVE',
      lifecycleStatus: 'IN_USE',
      lifecycleState: 'DISCOVERED',
      technicalStatus: dto.technicalState,
      environment: dto.classification.environment,
      criticality: 'MEDIUM',
      source: 'SERVICE_DISCOVERY',
      discoveryStatus: 'SYNCED',
      details: { discovery: { schemaVersion: dto.schemaVersion } },
      version: 1,
      createdAt: observedAt,
      updatedAt: observedAt,
      createdBy: '',
      updatedBy: '',
    };
    await client.query(`
      INSERT INTO configuration_items(
        id,ci_number,name,display_name,type_id,asset_subtype,status,lifecycle_status,
        lifecycle_state,technical_status,environment,criticality,source,source_system,
        source_record_id,discovery_status,last_discovered_at,last_seen_at,last_sync_at,
        sync_status,details,version,first_seen_at,created_at,updated_at,source_payload
      ) VALUES($1,$2,$3,$3,$4,$5,'ACTIVE','IN_USE','DISCOVERED',$6,$7,'MEDIUM',
        'SERVICE_DISCOVERY',$8,$9,'SYNCED',$10,$10,$10,'SYNCED',$11::jsonb,1,$10,$10,$10,$12::jsonb)`, [
      assetId, ciNumber, dto.identity.name, dto.classification.type, dto.classification.subtype || null,
      dto.technicalState, dto.classification.environment, dto.source.connectorId, sourceRecordId,
      observedAt, JSON.stringify({ discovery: { schemaVersion: dto.schemaVersion } }), JSON.stringify(sourcePayload),
    ]);
    return assetId;
  }

  private static discoveryAttributes(dto: NormalizedDiscoveryDto) {
    const effectiveOs = dto.operatingSystem.reported || dto.operatingSystem.configured;
    return [
      { path: 'identity.name', value: dto.identity.name, confidence: 80 },
      { path: 'identity.hostname', value: dto.identity.hostname, confidence: 70 },
      { path: 'identity.fqdn', value: dto.identity.fqdn, confidence: 80 },
      { path: 'identity.serialNumber', value: dto.identity.serialNumber, confidence: 90 },
      { path: 'classification.environment', value: dto.classification.environment, confidence: 80 },
      { path: 'technicalState', value: dto.technicalState, confidence: 90 },
      { path: 'compute.cpuCount', value: dto.compute.cpuCount, confidence: 95 },
      { path: 'compute.memoryBytes', value: dto.compute.memoryBytes, confidence: 95 },
      { path: 'operatingSystem.configured', value: dto.operatingSystem.configured, confidence: 60 },
      { path: 'operatingSystem.reported', value: dto.operatingSystem.reported, confidence: 85 },
      { path: 'operatingSystem.name', value: effectiveOs, confidence: dto.operatingSystem.reported ? 85 : 60 },
      { path: 'operatingSystem.version', value: dto.operatingSystem.version, confidence: 80 },
    ];
  }

  private static async upsertIdentifiers(
    client: pg.PoolClient,
    assetId: string,
    sourceRecord: SourceRecordRow,
    envelope: DiscoveryObservationEnvelope,
    identifiers: ExtractedIdentifier[],
    assetCreated: boolean,
  ): Promise<string[]> {
    const changed: string[] = [];
    for (const identifier of identifiers) {
      if (identifier.primary) {
        await client.query(`UPDATE cmdb_asset_identifiers SET is_primary=FALSE,updated_at=NOW()
          WHERE asset_id=$1 AND identifier_type_id=$2 AND namespace=$3 AND normalized_value<>$4 AND is_primary AND retired_at IS NULL`,
        [assetId, identifier.type, identifier.namespace, identifier.normalizedValue]);
      }
      const inserted = await client.query(`
        INSERT INTO cmdb_asset_identifiers(
          id,asset_id,identifier_type_id,namespace,value,normalized_value,source,
          connector_id,source_record_id,confidence,is_primary,first_seen_at,last_seen_at
        ) VALUES($1,$2,$3,$4,$5,$6,'DISCOVERY',$7,$8,$9,$10,$11,$11)
        ON CONFLICT DO NOTHING RETURNING id`, [
        deterministicId('aid', `${assetId}:${identifier.type}:${identifier.namespace}:${identifier.normalizedValue}`),
        assetId, identifier.type, identifier.namespace, identifier.value, identifier.normalizedValue,
        envelope.connectorId, sourceRecord.id, identifier.confidence, identifier.primary, envelope.observedAt,
      ]);
      await client.query(`UPDATE cmdb_asset_identifiers
        SET last_seen_at=GREATEST(last_seen_at,$5),confidence=GREATEST(confidence,$6),updated_at=NOW()
        WHERE asset_id=$1 AND identifier_type_id=$2 AND namespace=$3 AND normalized_value=$4 AND retired_at IS NULL`,
      [assetId, identifier.type, identifier.namespace, identifier.normalizedValue, envelope.observedAt, identifier.confidence]);
      if (inserted.rowCount && !assetCreated) {
        await this.insertChange(client, {
          assetId, sourceRecord, envelope, changeType: 'IDENTIFIER_ADDED',
          fieldPath: `identifiers.${identifier.type}.${identifier.namespace}`,
          beforeValue: null, afterValue: identifier.normalizedValue,
        });
        changed.push(`identifiers.${identifier.type}`);
      }
    }
    return changed;
  }

  private static async reconcileNetwork(
    client: pg.PoolClient,
    assetId: string,
    sourceRecord: SourceRecordRow,
    envelope: DiscoveryObservationEnvelope,
    dto: NormalizedDiscoveryDto,
    assetCreated: boolean,
  ): Promise<boolean> {
    const beforeResult = await client.query<{ snapshot: unknown }>(`
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'key',i.interface_key,
        'macAddresses',COALESCE((SELECT jsonb_agg(m.normalized_mac ORDER BY m.normalized_mac) FROM cmdb_mac_addresses m WHERE m.interface_id=i.id AND m.retired_at IS NULL),'[]'::jsonb),
        'ipAddresses',COALESCE((SELECT jsonb_agg(host(ip.ip_address) ORDER BY host(ip.ip_address)) FROM cmdb_ip_addresses ip WHERE ip.interface_id=i.id AND ip.retired_at IS NULL),'[]'::jsonb)
      ) ORDER BY i.interface_key),'[]'::jsonb) AS snapshot
      FROM cmdb_network_interfaces i WHERE i.asset_id=$1 AND i.source_record_id=$2 AND i.retired_at IS NULL`,
    [assetId, sourceRecord.id]);
    const before = beforeResult.rows[0]?.snapshot || [];
    const interfaceKeys = dto.network.interfaces.map((nic) => nic.key);
    if (interfaceKeys.length) {
      await client.query(`UPDATE cmdb_network_interfaces SET retired_at=$3,updated_at=NOW()
        WHERE asset_id=$1 AND source_record_id=$2 AND retired_at IS NULL AND NOT(interface_key=ANY($4::text[]))`,
      [assetId, sourceRecord.id, envelope.observedAt, interfaceKeys]);
    } else {
      await client.query(`UPDATE cmdb_network_interfaces SET retired_at=$3,updated_at=NOW()
        WHERE asset_id=$1 AND source_record_id=$2 AND retired_at IS NULL`,
      [assetId, sourceRecord.id, envelope.observedAt]);
    }

    await client.query('UPDATE cmdb_ip_addresses SET is_primary=FALSE,updated_at=NOW() WHERE asset_id=$1 AND retired_at IS NULL', [assetId]);
    let primaryIpAssigned = false;
    for (const nic of dto.network.interfaces) {
      const interfaceId = deterministicId('nif', `${assetId}:${sourceRecord.id}:${nic.key}`);
      await client.query(`
        INSERT INTO cmdb_network_interfaces(
          id,asset_id,connector_id,source_record_id,interface_key,name,description,
          interface_type,technical_status,mtu,speed_bps,is_virtual,first_seen_at,last_seen_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
        ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
          interface_type=EXCLUDED.interface_type,technical_status=EXCLUDED.technical_status,
          mtu=EXCLUDED.mtu,speed_bps=EXCLUDED.speed_bps,is_virtual=EXCLUDED.is_virtual,
          last_seen_at=GREATEST(cmdb_network_interfaces.last_seen_at,EXCLUDED.last_seen_at),
          retired_at=NULL,updated_at=NOW()`, [
        interfaceId, assetId, envelope.connectorId, sourceRecord.id, nic.key, nic.name || null,
        nic.description || null, nic.type || null, nic.technicalState, nic.mtu || null,
        nic.speedBps ?? null, nic.virtual, envelope.observedAt,
      ]);
      const normalizedMacs = [...new Set(nic.macAddresses.map((mac) => mac.replace(/[^0-9a-f]/gi, '').toLowerCase()))].sort();
      await client.query('UPDATE cmdb_mac_addresses SET is_primary=FALSE,updated_at=NOW() WHERE interface_id=$1 AND retired_at IS NULL', [interfaceId]);
      if (normalizedMacs.length) {
        await client.query(`UPDATE cmdb_mac_addresses SET retired_at=$2,updated_at=NOW()
          WHERE interface_id=$1 AND retired_at IS NULL AND NOT(normalized_mac=ANY($3::text[]))`,
        [interfaceId, envelope.observedAt, normalizedMacs]);
      } else {
        await client.query('UPDATE cmdb_mac_addresses SET retired_at=$2,updated_at=NOW() WHERE interface_id=$1 AND retired_at IS NULL', [interfaceId, envelope.observedAt]);
      }
      for (let index = 0; index < normalizedMacs.length; index += 1) {
        const mac = normalizedMacs[index];
        await client.query(`
          INSERT INTO cmdb_mac_addresses(id,interface_id,normalized_mac,display_mac,address_type,is_primary,first_seen_at,last_seen_at)
          VALUES($1,$2,$3,$3,'UNKNOWN',$4,$5,$5)
          ON CONFLICT(id) DO UPDATE SET is_primary=EXCLUDED.is_primary,
            last_seen_at=GREATEST(cmdb_mac_addresses.last_seen_at,EXCLUDED.last_seen_at),retired_at=NULL,updated_at=NOW()`,
        [deterministicId('mac', `${interfaceId}:${mac}`), interfaceId, mac, index === 0, envelope.observedAt]);
      }

      const incomingIps = [...new Set(nic.ipAddresses.map((ip) => ip.address))].sort();
      if (incomingIps.length) {
        await client.query(`UPDATE cmdb_ip_addresses SET retired_at=$3,updated_at=NOW()
          WHERE asset_id=$1 AND interface_id=$2 AND retired_at IS NULL AND NOT(host(ip_address)=ANY($4::text[]))`,
        [assetId, interfaceId, envelope.observedAt, incomingIps]);
      } else {
        await client.query('UPDATE cmdb_ip_addresses SET retired_at=$3,updated_at=NOW() WHERE asset_id=$1 AND interface_id=$2 AND retired_at IS NULL', [assetId, interfaceId, envelope.observedAt]);
      }
      for (const ip of nic.ipAddresses) {
        await client.query(`
          INSERT INTO cmdb_ip_addresses(
            id,asset_id,interface_id,ip_address,address_role,dns_name,is_primary,is_dynamic,first_seen_at,last_seen_at
          ) VALUES($1,$2,$3,$4::inet,$5,$6,$7,$8,$9,$9)
          ON CONFLICT(id) DO UPDATE SET address_role=EXCLUDED.address_role,dns_name=EXCLUDED.dns_name,
            is_primary=EXCLUDED.is_primary,is_dynamic=EXCLUDED.is_dynamic,
            last_seen_at=GREATEST(cmdb_ip_addresses.last_seen_at,EXCLUDED.last_seen_at),retired_at=NULL,updated_at=NOW()`, [
          deterministicId('ip', `${assetId}:${interfaceId}:${ip.address}`), assetId, interfaceId,
          ip.address, ip.role, ip.dnsName || null, ip.primary && !primaryIpAssigned, ip.dynamic, envelope.observedAt,
        ]);
        if (ip.primary && !primaryIpAssigned) primaryIpAssigned = true;
      }
    }
    const after = dto.network.interfaces
      .map((nic) => ({
        key: nic.key,
        macAddresses: [...new Set(nic.macAddresses.map((mac) => mac.replace(/[^0-9a-f]/gi, '').toLowerCase()))].sort(),
        ipAddresses: [...new Set(nic.ipAddresses.map((ip) => ip.address))].sort(),
      }))
      .sort((left, right) => left.key.localeCompare(right.key));
    const changed = stableJson(before) !== stableJson(after);
    if (changed && !assetCreated) {
      await this.insertChange(client, {
        assetId, sourceRecord, envelope, changeType: 'NETWORK_CHANGED', fieldPath: 'network', beforeValue: before, afterValue: after,
      });
    }
    return changed && !assetCreated;
  }

  private static async reconcileStorage(
    client: pg.PoolClient,
    assetId: string,
    sourceRecord: SourceRecordRow,
    envelope: DiscoveryObservationEnvelope,
    dto: NormalizedDiscoveryDto,
    assetCreated: boolean,
  ): Promise<boolean> {
    const beforeResult = await client.query<{ snapshot: unknown }>(`
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'key',device_key,'capacityBytes',capacity_bytes::text,'usedBytes',used_bytes::text,'freeBytes',free_bytes::text
      ) ORDER BY device_key),'[]'::jsonb) AS snapshot
      FROM cmdb_storage_devices WHERE asset_id=$1 AND source_record_id=$2 AND retired_at IS NULL`,
    [assetId, sourceRecord.id]);
    const before = beforeResult.rows[0]?.snapshot || [];
    const keys = dto.storage.disks.map((disk) => disk.key);
    if (keys.length) {
      await client.query(`UPDATE cmdb_storage_devices SET retired_at=$3,updated_at=NOW()
        WHERE asset_id=$1 AND source_record_id=$2 AND retired_at IS NULL AND NOT(device_key=ANY($4::text[]))`,
      [assetId, sourceRecord.id, envelope.observedAt, keys]);
    } else {
      await client.query('UPDATE cmdb_storage_devices SET retired_at=$3,updated_at=NOW() WHERE asset_id=$1 AND source_record_id=$2 AND retired_at IS NULL', [assetId, sourceRecord.id, envelope.observedAt]);
    }
    for (const disk of dto.storage.disks) {
      await client.query(`
        INSERT INTO cmdb_storage_devices(
          id,asset_id,connector_id,source_record_id,device_key,name,storage_type,
          technical_status,vendor,model,serial_number,capacity_bytes,used_bytes,
          free_bytes,filesystem,mount_path,first_seen_at,last_seen_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
        ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,storage_type=EXCLUDED.storage_type,
          technical_status=EXCLUDED.technical_status,vendor=EXCLUDED.vendor,model=EXCLUDED.model,
          serial_number=EXCLUDED.serial_number,capacity_bytes=EXCLUDED.capacity_bytes,
          used_bytes=EXCLUDED.used_bytes,free_bytes=EXCLUDED.free_bytes,filesystem=EXCLUDED.filesystem,
          mount_path=EXCLUDED.mount_path,last_seen_at=GREATEST(cmdb_storage_devices.last_seen_at,EXCLUDED.last_seen_at),
          retired_at=NULL,updated_at=NOW()`, [
        deterministicId('std', `${assetId}:${sourceRecord.id}:${disk.key}`), assetId, envelope.connectorId,
        sourceRecord.id, disk.key, disk.name, disk.type, disk.technicalState, disk.vendor || null,
        disk.model || null, disk.serialNumber || null, disk.capacityBytes ?? null,
        disk.usedBytes ?? null, disk.freeBytes ?? null, disk.filesystem || null,
        disk.mountPath || null, envelope.observedAt,
      ]);
    }
    const after = dto.storage.disks.map((disk) => ({
      key: disk.key,
      capacityBytes: disk.capacityBytes === undefined ? null : String(disk.capacityBytes),
      usedBytes: disk.usedBytes === undefined ? null : String(disk.usedBytes),
      freeBytes: disk.freeBytes === undefined ? null : String(disk.freeBytes),
    })).sort((left, right) => left.key.localeCompare(right.key));
    const changed = stableJson(before) !== stableJson(after);
    if (changed && !assetCreated) {
      await this.insertChange(client, {
        assetId, sourceRecord, envelope, changeType: 'STORAGE_CHANGED', fieldPath: 'storage', beforeValue: before, afterValue: after,
      });
    }
    return changed && !assetCreated;
  }

  private static async reconcileTags(
    client: pg.PoolClient,
    assetId: string,
    sourceRecord: SourceRecordRow,
    envelope: DiscoveryObservationEnvelope,
    dto: NormalizedDiscoveryDto,
    assetCreated: boolean,
  ): Promise<boolean> {
    const beforeResult = await client.query<{ tag_key: string; tag_value: string }>(`
      SELECT tag_key,tag_value FROM cmdb_asset_tags
      WHERE asset_id=$1 AND source_record_id=$2 AND retired_at IS NULL ORDER BY tag_key,tag_value`,
    [assetId, sourceRecord.id]);
    const before = beforeResult.rows.map((tag) => ({ key: tag.tag_key, value: tag.tag_value }));
    const after = [...new Map(dto.tags.map((tag) => [`${tag.key}\u0000${tag.value}`, tag])).values()]
      .sort((left, right) => left.key.localeCompare(right.key) || left.value.localeCompare(right.value));
    await client.query('UPDATE cmdb_asset_tags SET retired_at=$3,updated_at=NOW() WHERE asset_id=$1 AND source_record_id=$2 AND retired_at IS NULL', [assetId, sourceRecord.id, envelope.observedAt]);
    for (const tag of after) {
      await client.query(`
        INSERT INTO cmdb_asset_tags(asset_id,tag_key,tag_value,source_record_id,first_seen_at,last_seen_at)
        VALUES($1,$2,$3,$4,$5,$5)
        ON CONFLICT(asset_id,tag_key,tag_value) DO UPDATE SET source_record_id=EXCLUDED.source_record_id,
          last_seen_at=GREATEST(cmdb_asset_tags.last_seen_at,EXCLUDED.last_seen_at),retired_at=NULL,updated_at=NOW()`,
      [assetId, tag.key, tag.value, sourceRecord.id, envelope.observedAt]);
    }
    const changed = stableJson(before) !== stableJson(after);
    if (changed && !assetCreated) {
      await this.insertChange(client, {
        assetId, sourceRecord, envelope, changeType: 'TAGS_CHANGED', fieldPath: 'tags', beforeValue: before, afterValue: after,
      });
    }
    return changed && !assetCreated;
  }

  private static async stagePendingRelationships(
    client: pg.PoolClient,
    sourceRecordId: string,
    sourceAssetId: string | undefined,
    envelope: DiscoveryObservationEnvelope,
    dto: NormalizedDiscoveryDto,
  ): Promise<void> {
    const activeIds: string[] = [];
    for (const relationship of dto.placement.relationships) {
      const targetConnectorId = relationship.target.connectorId || envelope.connectorId;
      const typeId = relationshipTypeId(relationship.type);
      const type = await client.query('SELECT id FROM cmdb_relationship_types WHERE id=$1 AND is_active=TRUE', [typeId]);
      if (!type.rows[0]) throw new DiscoveryIngestionError(`Unknown relationship type: ${relationship.type}`, 'INVALID_RELATIONSHIP_TYPE');
      const pendingId = deterministicId('prel', `${sourceRecordId}:${typeId}:${targetConnectorId}:${relationship.target.objectType}:${relationship.target.objectId}`);
      activeIds.push(pendingId);
      await client.query(`
        INSERT INTO cmdb_pending_relationships(
          id,source_record_id,source_asset_id,source_connector_id,source_sync_run_id,relationship_type_id,target_connector_id,
          target_object_type,target_object_id,target_native_uuid,target_identifiers,confidence,
          status,first_seen_at,last_seen_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,'PENDING',$13,$13)
        ON CONFLICT(id) DO UPDATE SET source_asset_id=EXCLUDED.source_asset_id,
          source_connector_id=EXCLUDED.source_connector_id,source_sync_run_id=EXCLUDED.source_sync_run_id,
          target_native_uuid=COALESCE(EXCLUDED.target_native_uuid,cmdb_pending_relationships.target_native_uuid),
          target_identifiers=EXCLUDED.target_identifiers,confidence=EXCLUDED.confidence,
          status='PENDING',resolved_relationship_id=NULL,resolved_at=NULL,
          last_seen_at=GREATEST(cmdb_pending_relationships.last_seen_at,EXCLUDED.last_seen_at),updated_at=NOW()`, [
        pendingId, sourceRecordId, sourceAssetId || null, envelope.connectorId, envelope.syncRunId, typeId, targetConnectorId,
        relationship.target.objectType, relationship.target.objectId,
        relationship.target.nativeUuid || null, JSON.stringify(relationship.target.identifiers),
        relationship.confidence, envelope.observedAt,
      ]);
    }
    if (activeIds.length) {
      await client.query(`UPDATE cmdb_pending_relationships SET status='SUPERSEDED',updated_at=NOW()
        WHERE source_record_id=$1 AND status='PENDING' AND NOT(id=ANY($2::text[]))`, [sourceRecordId, activeIds]);
    } else {
      await client.query("UPDATE cmdb_pending_relationships SET status='SUPERSEDED',updated_at=NOW() WHERE source_record_id=$1 AND status='PENDING'", [sourceRecordId]);
    }
  }

  private static async resolvePendingRelationships(
    client: pg.PoolClient,
    currentSourceRecord: SourceRecordRow,
    envelope: DiscoveryObservationEnvelope,
  ): Promise<string[]> {
    const pending = await client.query<any>(`
      SELECT p.*
      FROM cmdb_pending_relationships p
      WHERE p.status='PENDING' AND (
        p.source_record_id=$1 OR
        (p.target_connector_id=$2 AND p.target_object_type=$3 AND p.target_object_id=$4)
      )
      ORDER BY p.created_at,p.id FOR UPDATE`, [
      currentSourceRecord.id, envelope.connectorId, envelope.sourceObjectType, envelope.sourceObjectId,
    ]);
    const changedPaths: string[] = [];
    for (const item of pending.rows) {
      const source = await client.query<{ asset_id: string | null }>('SELECT asset_id FROM cmdb_source_records WHERE id=$1', [item.source_record_id]);
      const target = await client.query<{ id: string; asset_id: string | null }>(`
        SELECT id,asset_id FROM cmdb_source_records
        WHERE connector_id=$1 AND external_object_type=$2
          AND (external_object_id=$3 OR ($4::text IS NOT NULL AND native_uuid=$4))
          AND asset_id IS NOT NULL
        ORDER BY CASE WHEN external_object_id=$3 THEN 0 ELSE 1 END,id LIMIT 1`,
      [item.target_connector_id, item.target_object_type, item.target_object_id, item.target_native_uuid]);
      const sourceAssetId = source.rows[0]?.asset_id;
      const targetAssetId = target.rows[0]?.asset_id;
      if (!sourceAssetId || !targetAssetId) continue;
      if (sourceAssetId === targetAssetId) {
        await client.query("UPDATE cmdb_pending_relationships SET status='FAILED',last_error='SELF_RELATIONSHIP',updated_at=NOW() WHERE id=$1", [item.id]);
        continue;
      }

      const previous = await client.query<{ evidence_id: string; relationship_id: string; target_ci_id: string }>(`
        SELECT e.id::text AS evidence_id,e.relationship_id,r.target_ci_id
        FROM cmdb_relationship_evidence e
        JOIN ci_relationships r ON r.id=e.relationship_id
        WHERE e.source_record_id=$1 AND r.relationship_type_id=$2
          AND e.status='ACTIVE' AND r.target_ci_id<>$3
        FOR UPDATE`, [item.source_record_id, item.relationship_type_id, targetAssetId]);
      for (const old of previous.rows) {
        await client.query("UPDATE cmdb_relationship_evidence SET status='RETIRED',last_seen_at=$2,updated_at=NOW() WHERE id=$1", [old.evidence_id, item.last_seen_at]);
        const otherEvidence = await client.query('SELECT 1 FROM cmdb_relationship_evidence WHERE relationship_id=$1 AND status=\'ACTIVE\' LIMIT 1', [old.relationship_id]);
        if (!otherEvidence.rows[0]) {
          await client.query("UPDATE ci_relationships SET status='RETIRED',valid_to=$2,retired_at=$2,archived_at=$2 WHERE id=$1", [old.relationship_id, item.last_seen_at]);
        }
      }

      const existingRelation = await client.query<{ id: string }>(`
        SELECT id FROM ci_relationships
        WHERE source_ci_id=$1 AND target_ci_id=$2 AND relationship_type_id=$3
          AND status='ACTIVE' AND archived_at IS NULL
        ORDER BY created_at,id LIMIT 1 FOR UPDATE`, [sourceAssetId, targetAssetId, item.relationship_type_id]);
      const relationId = existingRelation.rows[0]?.id || deterministicId('cir', `${sourceAssetId}:${targetAssetId}:${item.relationship_type_id}`);
      const relation = existingRelation.rows[0] ? existingRelation : await client.query<{ id: string }>(`
        INSERT INTO ci_relationships(
          id,source_ci_id,target_ci_id,relationship_type_id,status,source,confidence,
          valid_from,created_at,first_seen_at,last_seen_at,source_payload
        ) VALUES($1,$2,$3,$4,'ACTIVE','DISCOVERY',$5,$6,$6,$6,$6,$7::jsonb)
        ON CONFLICT(id) DO UPDATE SET status='ACTIVE',confidence=GREATEST(ci_relationships.confidence,EXCLUDED.confidence),
          valid_to=NULL,archived_at=NULL,retired_at=NULL,last_seen_at=GREATEST(ci_relationships.last_seen_at,EXCLUDED.last_seen_at)
        RETURNING id`, [
        relationId, sourceAssetId, targetAssetId, item.relationship_type_id, item.confidence,
        item.first_seen_at, JSON.stringify({ sourceRecordId: item.source_record_id }),
      ]);
      const canonicalRelationshipId = relation.rows[0].id;
      await client.query(`
        INSERT INTO cmdb_relationship_evidence(
          relationship_id,connector_id,source_record_id,sync_run_id,source,confidence,
          first_seen_at,last_seen_at,status
        ) VALUES($1,$2,$3,$4,'DISCOVERY',$5,$6,$7,'ACTIVE')
        ON CONFLICT DO NOTHING`, [
        canonicalRelationshipId, item.source_connector_id, item.source_record_id,
        item.source_sync_run_id, item.confidence, item.first_seen_at, item.last_seen_at,
      ]);
      await client.query(`UPDATE cmdb_relationship_evidence
        SET sync_run_id=$4,confidence=$5,last_seen_at=GREATEST(last_seen_at,$6),status='ACTIVE',updated_at=NOW()
        WHERE relationship_id=$1 AND connector_id=$2 AND source_record_id=$3 AND source='DISCOVERY'`, [
        canonicalRelationshipId, item.source_connector_id, item.source_record_id,
        item.source_sync_run_id, item.confidence, item.last_seen_at,
      ]);
      await client.query(`UPDATE cmdb_pending_relationships
        SET source_asset_id=$2,status='RESOLVED',resolved_relationship_id=$3,resolved_at=NOW(),last_error=NULL,updated_at=NOW()
        WHERE id=$1`, [item.id, sourceAssetId, canonicalRelationshipId]);

      const moved = previous.rows.length > 0;
      const topic = moved ? 'asset.relationship.changed' : 'asset.relationship.created';
      await this.insertOutbox(client, topic, 'CI_RELATIONSHIP', canonicalRelationshipId, {
        relationshipId: canonicalRelationshipId,
        sourceAssetId,
        targetAssetId,
        relationshipType: item.relationship_type_id,
        previousTargetAssetIds: previous.rows.map((row) => row.target_ci_id),
      }, `${topic}:${item.id}:${targetAssetId}`);
      if (moved) {
        const sourceRow = await client.query<SourceRecordRow>('SELECT id,asset_id,revision,normalized_payload_hash FROM cmdb_source_records WHERE id=$1', [item.source_record_id]);
        if (sourceRow.rows[0]) {
          const sourceEnvelope = {
            ...envelope,
            connectorId: item.source_connector_id,
            syncRunId: item.source_sync_run_id,
            observedAt: new Date(item.last_seen_at).toISOString(),
          };
          await this.insertChange(client, {
            assetId: sourceAssetId,
            sourceRecord: sourceRow.rows[0],
            envelope: sourceEnvelope,
            changeType: 'RELATIONSHIP_CHANGED',
            fieldPath: `relationships.${item.relationship_type_id}.${item.id}`,
            beforeValue: previous.rows.map((row) => row.target_ci_id).sort(),
            afterValue: targetAssetId,
          });
          changedPaths.push(`relationships.${item.relationship_type_id}`);
        }
      }
    }
    return changedPaths;
  }

  private static async reactivateIfNeeded(
    client: pg.PoolClient,
    assetId: string,
    sourceRecord: SourceRecordRow,
    envelope: DiscoveryObservationEnvelope,
  ): Promise<boolean> {
    const previous = await client.query<{ lifecycle_state: string }>('SELECT lifecycle_state FROM configuration_items WHERE id=$1', [assetId]);
    const previousState = previous.rows[0]?.lifecycle_state;
    if (!['STALE', 'DECOMMISSION_CANDIDATE', 'RETIRED'].includes(previousState)) return false;
    await client.query(`UPDATE configuration_items SET lifecycle_state='ACTIVE',stale_since=NULL,retired_at=NULL,
      reactivated_at=$2,updated_at=NOW(),version=version+1 WHERE id=$1`, [assetId, envelope.observedAt]);
    await this.insertChange(client, {
      assetId, sourceRecord, envelope, changeType: 'LIFECYCLE_CHANGED', fieldPath: 'lifecycleState',
      beforeValue: previousState, afterValue: 'ACTIVE',
    });
    await this.insertOutbox(client, 'asset.reactivated', 'CONFIGURATION_ITEM', assetId, {
      assetId, previousLifecycleState: previousState, sourceRecordId: sourceRecord.id,
    }, `asset.reactivated:${assetId}:${sourceRecord.id}:${sourceRecord.revision}`);
    return true;
  }

  private static async insertChange(
    client: pg.PoolClient,
    input: {
      assetId: string;
      sourceRecord: SourceRecordRow;
      envelope: DiscoveryObservationEnvelope;
      changeType: string;
      fieldPath: string;
      beforeValue: unknown;
      afterValue: unknown;
    },
  ): Promise<void> {
    if (stableJson(input.beforeValue) === stableJson(input.afterValue)) return;
    const detectionHash = sha256({
      sourceRecordId: input.sourceRecord.id,
      revision: Number(input.sourceRecord.revision),
      fieldPath: input.fieldPath,
      beforeValue: input.beforeValue,
      afterValue: input.afterValue,
    });
    await client.query(`
      INSERT INTO cmdb_asset_changes(
        asset_id,change_type,field_path,before_value,after_value,source,connector_id,
        source_record_id,source_record_revision,sync_run_id,detection_hash,detected_at
      ) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,'DISCOVERY',$6,$7,$8,$9,$10,$11)
      ON CONFLICT DO NOTHING`, [
      input.assetId, input.changeType, input.fieldPath, JSON.stringify(input.beforeValue),
      JSON.stringify(input.afterValue), input.envelope.connectorId, input.sourceRecord.id,
      Number(input.sourceRecord.revision), input.envelope.syncRunId, detectionHash,
      input.envelope.observedAt,
    ]);
  }

  private static async accountObservation(
    client: pg.PoolClient,
    observationId: string,
    runId: string,
    outcome: CorrelationOutcome,
    created: boolean,
    changed: boolean,
  ): Promise<void> {
    const accounted = await client.query("UPDATE cmdb_raw_observations SET accounted_at=NOW() WHERE id=$1 AND accounted_at IS NULL RETURNING id", [observationId]);
    if (!accounted.rowCount) return;
    await client.query(`UPDATE cmdb_discovery_sync_runs SET
      discovered_count=discovered_count+1,
      processed_count=processed_count+1,
      created_count=created_count+$2,
      updated_count=updated_count+$3,
      unchanged_count=unchanged_count+$4,
      linked_count=linked_count+$5,
      ambiguous_count=ambiguous_count+$6,
      conflict_count=conflict_count+$7,
      unmatched_count=unmatched_count+$8,
      updated_at=NOW()
      WHERE id=$1`, [
      runId,
      created ? 1 : 0,
      !created && changed ? 1 : 0,
      !created && !changed && outcome === 'AUTO_LINK' ? 1 : 0,
      outcome === 'AUTO_LINK' && !created ? 1 : 0,
      outcome === 'REVIEW_REQUIRED' ? 1 : 0,
      outcome === 'IDENTITY_CONFLICT' ? 1 : 0,
      ['REVIEW_REQUIRED', 'IDENTITY_CONFLICT'].includes(outcome) ? 1 : 0,
    ]);
  }

  private static async markObservationFailed(observationId: string, runId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof DiscoveryIngestionError ? error.code : 'NORMALIZATION_OR_PROCESSING_FAILED';
    try {
      await pgClient.transaction(async (client) => {
        const newlyAccounted = await client.query(`UPDATE cmdb_raw_observations
          SET processing_status='FAILED',processing_error_code=$2,processing_error=$3,
              processing_attempts=processing_attempts+1,processed_at=NOW(),
              accounted_at=NOW()
          WHERE id=$1 AND accounted_at IS NULL RETURNING id`,
        [observationId, code, message.slice(0, 4000)]);
        if (!newlyAccounted.rowCount) {
          await client.query(`UPDATE cmdb_raw_observations
            SET processing_status='FAILED',processing_error_code=$2,processing_error=$3,
                processing_attempts=processing_attempts+1,processed_at=NOW()
            WHERE id=$1`, [observationId, code, message.slice(0, 4000)]);
        } else {
          await client.query('UPDATE cmdb_discovery_sync_runs SET failed_count=failed_count+1,updated_at=NOW() WHERE id=$1', [runId]);
        }
      });
    } catch (markError) {
      logger.error({ observationId, runId, error: markError }, 'Failed to persist discovery observation processing error');
    }
  }

  private static async loadProcessedResult(observationId: string): Promise<DiscoveryIngestionResult | undefined> {
    return pgClient.transaction((client) => this.loadProcessedResultWithClient(client, observationId));
  }

  private static async loadProcessedResultWithClient(client: pg.PoolClient, observationId: string): Promise<DiscoveryIngestionResult | undefined> {
    const result = await client.query<any>(`
      SELECT o.id::text AS observation_id,s.id AS source_record_id,s.asset_id,d.outcome,
             c.id AS correlation_case_id
      FROM cmdb_raw_observations o
      JOIN cmdb_source_records s ON s.id=o.source_record_id
      JOIN cmdb_correlation_decisions d ON d.observation_id=o.id
      LEFT JOIN cmdb_correlation_cases c ON c.source_record_id=s.id AND c.status='OPEN'
      WHERE o.id=$1 AND o.processing_status='PROCESSED'`, [observationId]);
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      observationId: row.observation_id,
      sourceRecordId: row.source_record_id,
      assetId: row.asset_id || undefined,
      outcome: row.outcome,
      correlationCaseId: row.correlation_case_id || undefined,
      assetCreated: false,
      reactivated: false,
      unchanged: true,
      changedFields: [],
    };
  }

  private static async insertOutbox(
    client: pg.PoolClient,
    topic: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<void> {
    await client.query(`
      INSERT INTO outbox_events(id,topic,aggregate_type,aggregate_id,payload,correlation_id,occurred_at)
      VALUES($1,$2,$3,$4,$5::jsonb,$6,NOW()) ON CONFLICT(id) DO NOTHING`, [
      deterministicId('out', idempotencyKey), topic, aggregateType, aggregateId,
      JSON.stringify(payload), idempotencyKey,
    ]);
  }
}
