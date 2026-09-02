import crypto from 'node:crypto';
import { pgClient } from '../db/postgres/client.js';
import { logger } from './logger.service.js';

/** Schedules durable Cortex work only; all network I/O remains in the worker. */
export class CortexInventorySchedulerService {
  public static async enqueueDue(now = new Date()): Promise<number> {
    const scheduled = await pgClient.transaction(async (client) => {
      const connectors = await client.query<{ id: string; schedule_minutes: number; last_sync_at: Date | null }>(`
        SELECT id,schedule_minutes,last_sync_at
        FROM cmdb_discovery_connectors
        WHERE connector_type_id='CORTEX' AND enabled AND deleted_at IS NULL AND schedule_minutes > 0
          AND (last_sync_at IS NULL OR last_sync_at <= $1::timestamptz - make_interval(mins => schedule_minutes))
        FOR UPDATE SKIP LOCKED`, [now.toISOString()]);
      let count = 0;
      for (const connector of connectors.rows) {
        const active = await client.query('SELECT 1 FROM cmdb_discovery_sync_runs WHERE connector_id=$1 AND state IN (\'QUEUED\',\'RUNNING\')', [connector.id]);
        if (active.rowCount) continue;
        const reconciliation = await client.query(`SELECT 1 FROM cmdb_discovery_sync_runs WHERE connector_id=$1 AND run_type='RECONCILIATION' AND state='SUCCEEDED' AND completed_at >= date_trunc('day',$2::timestamptz)`, [connector.id, now.toISOString()]);
        const runType = reconciliation.rowCount ? 'FULL' : 'RECONCILIATION';
        const runId = `dsrun-${crypto.randomUUID()}`;
        const correlationId = `cmdb.cortex.schedule:${connector.id}:${now.toISOString().slice(0, 16)}`;
        await client.query(`INSERT INTO cmdb_discovery_sync_runs(id,connector_id,run_type,state,correlation_id,queued_at) VALUES($1,$2,$3,'QUEUED',$4,NOW())`, [runId, connector.id, runType, correlationId]);
        await client.query(`INSERT INTO outbox_events(id,topic,aggregate_type,aggregate_id,payload,correlation_id,occurred_at) VALUES($1,'cmdb.discovery.sync.requested','DISCOVERY_SYNC_RUN',$2,$3::jsonb,$4,NOW())`, [`out-${crypto.randomUUID()}`, runId, JSON.stringify({ runId, connectorId: connector.id, connectorType: 'CORTEX', runType, trigger: 'SCHEDULED' }), correlationId]);
        count += 1;
      }
      return count;
    });
    if (scheduled) logger.info({ scheduled }, 'Queued scheduled Cortex Asset Inventory runs');
    return scheduled;
  }
}
