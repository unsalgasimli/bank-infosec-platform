import { v4 as uuidv4 } from 'uuid';
import type { BankUser } from '../../shared/types/auth.js';
import { pgClient } from '../db/postgres/client.js';
import { AuditService } from './audit.service.js';

type ConnectorRow = { id: string; connector_type_id: string };
const terminalStates = new Set(['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED']);

/**
 * Server-owned serial orchestration for the daily, full CMDB refresh.  Each
 * source continues to use its existing discovery worker and correlation path;
 * this service only releases the next source after the prior run is terminal.
 */
export class DiscoveryDailySyncService {
  public static async start(actor: BankUser, request: { correlationId?: string; ip?: string; userAgent?: string } = {}): Promise<any> {
    const batchId = `dsbatch-${uuidv4()}`;
    const correlationId = `cmdb.daily-sync:${batchId}`;
    await pgClient.transaction(async (client) => {
      const activeBatch = await client.query("SELECT id FROM cmdb_discovery_sync_batches WHERE state='RUNNING' FOR UPDATE");
      if (activeBatch.rowCount) throw Object.assign(new Error('A daily CMDB sync is already running. Its live status is shown below.'), { statusCode: 409, code: 'DAILY_SYNC_ACTIVE' });
      const activeRuns = await client.query("SELECT c.name,r.id FROM cmdb_discovery_sync_runs r JOIN cmdb_discovery_connectors c ON c.id=r.connector_id WHERE r.state IN ('QUEUED','RUNNING') AND c.deleted_at IS NULL LIMIT 1 FOR UPDATE");
      if (activeRuns.rowCount) throw Object.assign(new Error(`Connector ${activeRuns.rows[0].name || activeRuns.rows[0].id} already has an active sync. Wait for it to finish before starting the daily batch.`), { statusCode: 409, code: 'CONNECTOR_SYNC_LOCKED' });
      const connectors = await client.query<ConnectorRow>(`SELECT id,connector_type_id FROM cmdb_discovery_connectors
        WHERE enabled AND deleted_at IS NULL AND connector_type_id IN ('ACTIVE_DIRECTORY','VCENTER','LIBRENMS','CORTEX','SMB_PRINTER')
        ORDER BY CASE connector_type_id WHEN 'ACTIVE_DIRECTORY' THEN 1 WHEN 'VCENTER' THEN 2 WHEN 'LIBRENMS' THEN 3 WHEN 'CORTEX' THEN 4 WHEN 'SMB_PRINTER' THEN 5 ELSE 9 END,name,id FOR UPDATE`);
      if (!connectors.rowCount) throw Object.assign(new Error('No enabled discovery sources are available for the daily CMDB sync.'), { statusCode: 400, code: 'NO_ENABLED_DISCOVERY_SOURCES' });
      await client.query('INSERT INTO cmdb_discovery_sync_batches(id,state,requested_by_user_id,correlation_id,source_count) VALUES($1,\'RUNNING\',$2,$3,$4)', [batchId, actor.id, correlationId, connectors.rowCount]);
      for (const [index, connector] of connectors.rows.entries()) {
        await client.query('INSERT INTO cmdb_discovery_sync_batch_items(batch_id,sequence,connector_id,connector_type_id,state) VALUES($1,$2,$3,$4,\'PENDING\')', [batchId, index + 1, connector.id, connector.connector_type_id]);
      }
      await AuditService.logPostgres(client, {
        actor,
        action: 'CMDB_DAILY_SYNC_STARTED',
        entityType: 'DISCOVERY_SYNC_BATCH',
        entityId: batchId,
        correlationId: request.correlationId || correlationId,
        ipAddress: request.ip,
        userAgent: request.userAgent,
        after: { sourceCount: connectors.rowCount, connectorTypes: connectors.rows.map((connector) => connector.connector_type_id), correlationId },
      });
    });
    await this.enqueueNext(batchId);
    return this.getLatest();
  }

  public static async onRunTerminal(runId: string): Promise<void> {
    const batch = await pgClient.query<{ batch_id: string }>('SELECT batch_id FROM cmdb_discovery_sync_batch_items WHERE sync_run_id=$1', [runId]);
    if (batch.rows[0]) await this.advance(batch.rows[0].batch_id, runId);
  }

  /** Recover a batch when a prior worker acknowledged its completion event
   * before an application deployment. This reads the authoritative terminal
   * run state, so it is safe to call repeatedly at worker startup. */
  public static async recoverRunningBatches(): Promise<void> {
    const terminalItems = await pgClient.query<{ batch_id: string; sync_run_id: string }>(`
      SELECT i.sync_run_id
      FROM cmdb_discovery_sync_batch_items i
      JOIN cmdb_discovery_sync_batches b ON b.id=i.batch_id
      JOIN cmdb_discovery_sync_runs r ON r.id=i.sync_run_id
      WHERE b.state='RUNNING' AND i.state IN ('QUEUED','RUNNING')
        AND r.state IN ('SUCCEEDED','PARTIAL','FAILED','CANCELLED')
      ORDER BY b.queued_at,i.sequence`);
    for (const item of terminalItems.rows) await this.onRunTerminal(item.sync_run_id);
    // If a worker was deployed between committing a terminal item and its
    // follow-up outbox insert, no completion event remains to wake the batch.
    // Rechecking all running batches is safe: enqueueNext refuses to proceed
    // while any batch item still owns an active source run.
    const batches = await pgClient.query<{ id: string }>("SELECT id FROM cmdb_discovery_sync_batches WHERE state='RUNNING' ORDER BY queued_at");
    for (const batch of batches.rows) await this.enqueueNext(batch.id);
  }

  public static async getLatest(): Promise<any> {
    const batch = await pgClient.query<any>(`SELECT * FROM cmdb_discovery_sync_batches ORDER BY queued_at DESC LIMIT 1`);
    if (!batch.rows[0]) return { batch: null };
    const items = await pgClient.query<any>(`SELECT i.*,COALESCE(c.name,i.connector_id) connector_name,r.state AS run_state,r.discovered_count,r.failed_count AS run_failed_count,r.checkpoint,r.started_at AS run_started_at,r.completed_at AS run_completed_at
      FROM cmdb_discovery_sync_batch_items i JOIN cmdb_discovery_connectors c ON c.id=i.connector_id LEFT JOIN cmdb_discovery_sync_runs r ON r.id=i.sync_run_id
      WHERE i.batch_id=$1 ORDER BY i.sequence`, [batch.rows[0].id]);
    return { batch: this.project(batch.rows[0], items.rows) };
  }

  private static async advance(batchId: string, runId: string): Promise<void> {
    await pgClient.transaction(async (client) => {
      const batch = await client.query<any>('SELECT * FROM cmdb_discovery_sync_batches WHERE id=$1 FOR UPDATE', [batchId]);
      if (batch.rows[0]?.state !== 'RUNNING') return;
      const run = await client.query<any>('SELECT state,error_summary FROM cmdb_discovery_sync_runs WHERE id=$1 FOR UPDATE', [runId]);
      if (!run.rows[0] || !terminalStates.has(run.rows[0].state)) return;
      const item = await client.query<any>('SELECT * FROM cmdb_discovery_sync_batch_items WHERE batch_id=$1 AND sync_run_id=$2 FOR UPDATE', [batchId, runId]);
      if (!item.rows[0] || terminalStates.has(item.rows[0].state)) return;
      const state = run.rows[0].state === 'SUCCEEDED' ? 'SUCCEEDED' : run.rows[0].state === 'PARTIAL' ? 'PARTIAL' : 'FAILED';
      const message = Array.isArray(run.rows[0].error_summary) ? run.rows[0].error_summary.map((value: any) => value?.message || value).filter(Boolean).join(' ').slice(0, 4000) : null;
      await client.query('UPDATE cmdb_discovery_sync_batch_items SET state=$3,completed_at=NOW(),failure_message=$4,updated_at=NOW() WHERE batch_id=$1 AND sync_run_id=$2', [batchId, runId, state, message]);
      await client.query('UPDATE cmdb_discovery_sync_batches SET completed_count=completed_count+1,failed_count=failed_count+$2,updated_at=NOW() WHERE id=$1', [batchId, state === 'SUCCEEDED' ? 0 : 1]);
    });
    await this.enqueueNext(batchId);
  }

  private static async enqueueNext(batchId: string): Promise<void> {
    await pgClient.transaction(async (client) => {
      const batch = await client.query<any>('SELECT * FROM cmdb_discovery_sync_batches WHERE id=$1 FOR UPDATE', [batchId]);
      if (batch.rows[0]?.state !== 'RUNNING') return;
      const active = await client.query("SELECT 1 FROM cmdb_discovery_sync_batch_items WHERE batch_id=$1 AND state IN ('QUEUED','RUNNING') LIMIT 1 FOR UPDATE", [batchId]);
      if (active.rowCount) return;
      const pending = await client.query<any>('SELECT * FROM cmdb_discovery_sync_batch_items WHERE batch_id=$1 AND state=\'PENDING\' ORDER BY sequence LIMIT 1 FOR UPDATE', [batchId]);
      if (!pending.rows[0]) {
        const refreshed = await client.query<any>('SELECT completed_count,failed_count,source_count FROM cmdb_discovery_sync_batches WHERE id=$1 FOR UPDATE', [batchId]);
        const row = refreshed.rows[0];
        if (Number(row.completed_count) >= Number(row.source_count)) await client.query("UPDATE cmdb_discovery_sync_batches SET state=CASE WHEN failed_count=0 THEN 'SUCCEEDED' ELSE 'PARTIAL' END,completed_at=NOW(),updated_at=NOW() WHERE id=$1", [batchId]);
        return;
      }
      const item = pending.rows[0];
      const runId = `dsrun-${uuidv4()}`;
      const checkpoint = item.connector_type_id === 'CORTEX' ? JSON.stringify({ source: 'CORTEX', inventoryScope: 'ENDPOINTS', dailyBatchId: batchId }) : null;
      await client.query(`INSERT INTO cmdb_discovery_sync_runs(id,connector_id,run_type,state,requested_by_user_id,correlation_id,queued_at,checkpoint)
        VALUES($1,$2,'FULL','QUEUED',$3,$4,NOW(),$5)`, [runId, item.connector_id, batch.rows[0].requested_by_user_id, batch.rows[0].correlation_id, checkpoint]);
      const eventCorrelationId = `${batch.rows[0].correlation_id}:run:${runId}`;
      await client.query(`INSERT INTO outbox_events(id,topic,aggregate_type,aggregate_id,payload,correlation_id,occurred_at)
        VALUES($1,'cmdb.discovery.sync.requested','DISCOVERY_SYNC_RUN',$2,$3::jsonb,$4,NOW())`, [`out-${uuidv4()}`, runId, JSON.stringify({ runId, connectorId: item.connector_id, connectorType: item.connector_type_id, actorId: batch.rows[0].requested_by_user_id, runType: 'FULL', ...(item.connector_type_id === 'CORTEX' ? { inventoryScope: 'ENDPOINTS' } : {}) }), eventCorrelationId]);
      await client.query("UPDATE cmdb_discovery_sync_batch_items SET sync_run_id=$2,state='QUEUED',queued_at=NOW(),updated_at=NOW() WHERE id=$1 AND state='PENDING'", [item.id, runId]);
    });
  }

  private static project(batch: any, items: any[]) {
    return {
      id: batch.id, state: batch.state, correlationId: batch.correlation_id, sourceCount: Number(batch.source_count), completedCount: Number(batch.completed_count), failedCount: Number(batch.failed_count), queuedAt: batch.queued_at, startedAt: batch.started_at, completedAt: batch.completed_at,
      items: items.map((item) => ({ sequence: Number(item.sequence), connectorId: item.connector_id, connectorName: item.connector_name, connectorType: item.connector_type_id, runId: item.sync_run_id, state: item.run_state || item.state, queuedAt: item.queued_at, completedAt: item.run_completed_at || item.completed_at, discoveredCount: Number(item.discovered_count || 0), failedCount: Number(item.run_failed_count || 0), checkpoint: item.checkpoint, failureMessage: item.failure_message })),
    };
  }
}
