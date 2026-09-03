import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pgClient } from '../db/postgres/client.js';
import { DiscoveryIngestionService, type DiscoveryPayloadMapper } from './discovery-ingestion.service.js';
import type { NormalizedDiscoveryDto } from '../../shared/utils/cmdb-discovery-contract.js';
import type { BankUser } from '../../shared/types/auth.js';

const execFileAsync = promisify(execFile);
export type SmbPrinterShare = { shareName: string; comment?: string };

function smbHost(value: unknown): string {
  const host = String(value || '').trim();
  if (!/^(?:[a-z0-9][a-z0-9.-]{0,252}|(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3})$/i.test(host)) {
    throw Object.assign(new Error('SMB printer host must be a hostname or IPv4 address.'), { code: 'SMB_PRINTER_HOST_INVALID' });
  }
  return host;
}

/** Runs `net view` only: it performs SMB share enumeration and never creates,
 * modifies, deletes, connects to, or installs a printer. */
export async function listSmbPrinterShares(hostValue: unknown): Promise<SmbPrinterShare[]> {
  const host = smbHost(hostValue);
  let stdout: string;
  if (process.platform !== 'win32') throw Object.assign(new Error('SMB printer discovery requires a Windows worker running under an approved read-only SMB identity.'), { code: 'SMB_PRINTER_WINDOWS_WORKER_REQUIRED' });
  try { ({ stdout } = await execFileAsync('net.exe', ['view', `\\\\${host}`], { windowsHide: true, timeout: 30_000, maxBuffer: 2 * 1024 * 1024 })); }
  catch (error: any) { throw Object.assign(new Error('Read-only SMB share enumeration failed. Verify SMB reachability and the worker identity access.'), { code: 'SMB_PRINTER_ENUMERATION_FAILED', cause: error }); }
  const printers: SmbPrinterShare[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    // net.exe aligns the Share name / Type / Used as / Comment columns. A
    // whitespace split preserves printer names because Type is the first Print token.
    const match = /^\s*(.*?)\s{2,}Print(?:\s{2,}(?:\S*)?)?\s{2,}(.*)\s*$/i.exec(line);
    if (!match || !match[1].trim()) continue;
    printers.push({ shareName: match[1].trim(), ...(match[2].trim() ? { comment: match[2].trim() } : {}) });
  }
  return printers;
}

type RawPrinter = SmbPrinterShare & { host: string };
export const smbPrinterPayloadMapper: DiscoveryPayloadMapper<RawPrinter> = {
  name: 'smb-read-only-printer-shares-v1', normalizedSchemaVersion: 1,
  validateRaw(payload: unknown): RawPrinter {
    const item = payload as RawPrinter;
    if (!item || !item.host || !item.shareName) throw new Error('Invalid SMB printer share observation.');
    return { host: smbHost(item.host), shareName: String(item.shareName).trim(), ...(item.comment ? { comment: String(item.comment).trim() } : {}) };
  },
  normalize(item, envelope): NormalizedDiscoveryDto {
    const uncPath = `\\\\${item.host}\\${item.shareName}`;
    return {
      schemaVersion: 1, source: { connectorId: envelope.connectorId, objectType: 'SmbPrinterShare', objectId: item.shareName },
      identity: { name: item.comment || item.shareName, identifiers: [{ type: 'OTHER', namespace: envelope.connectorId, value: uncPath, confidence: 100, primary: true }] },
      classification: { type: 'printer', subtype: 'network_smb_printer', environment: 'UNKNOWN' }, compute: {}, operatingSystem: {}, network: { interfaces: [] }, storage: { disks: [] }, placement: { relationships: [] }, tags: [{ key: 'discoveryProtocol', value: 'SMB' }, { key: 'accessMode', value: 'READ_ONLY' }], technicalState: 'DISCOVERED',
      sourceSpecificMetadata: { smbHost: item.host, shareName: item.shareName, uncPath, comment: item.comment, discoveryOperation: 'net view', writeOperations: 'BLOCKED' },
    };
  },
};

export class SmbPrinterInventorySyncService {
  public static async testConnection(connectorId: string) {
    const row = (await pgClient.query<any>("SELECT non_secret_configuration FROM cmdb_discovery_connectors WHERE id=$1 AND connector_type_id='SMB_PRINTER' AND deleted_at IS NULL", [connectorId])).rows[0];
    if (!row) throw Object.assign(new Error('SMB printer connector was not found.'), { statusCode: 404, code: 'DISCOVERY_CONNECTOR_NOT_FOUND' });
    const host = smbHost(row.non_secret_configuration?.host); const printers = await listSmbPrinterShares(host);
    await pgClient.query("UPDATE cmdb_discovery_connectors SET health_status='HEALTHY',operational_state=CASE WHEN enabled THEN 'READY' ELSE 'DISABLED' END,last_failure_code=NULL,last_failure_message=NULL,consecutive_failures=0,updated_at=NOW() WHERE id=$1", [connectorId]);
    return { connectorId, snapshot: { testResult: { status: 'SUCCEEDED', transport: 'SMB', accessMode: 'READ_ONLY', operation: 'net view', writeOperations: 'BLOCKED', printerShareCount: printers.length } } };
  }
  public static async enqueue(connectorId: string, actor: BankUser, runType: 'FULL' | 'INCREMENTAL' = 'FULL', context: { correlationId?: string } = {}) {
    const runId = `dsrun-${crypto.randomUUID()}`;
    await pgClient.transaction(async (client) => {
      const connector = await client.query("SELECT id FROM cmdb_discovery_connectors WHERE id=$1 AND connector_type_id='SMB_PRINTER' AND enabled AND deleted_at IS NULL FOR UPDATE", [connectorId]);
      if (!connector.rows[0]) throw Object.assign(new Error('Enabled SMB printer connector was not found.'), { statusCode: 404, code: 'DISCOVERY_CONNECTOR_NOT_FOUND' });
      await client.query("INSERT INTO cmdb_discovery_sync_runs(id,connector_id,run_type,state,requested_by_user_id,correlation_id,queued_at) VALUES($1,$2,$3,'QUEUED',$4,$5,NOW())", [runId, connectorId, runType, actor.id, context.correlationId || null]);
      await client.query("INSERT INTO outbox_events(id,topic,aggregate_type,aggregate_id,payload,correlation_id,occurred_at) VALUES($1,'cmdb.discovery.sync.requested','DISCOVERY_SYNC_RUN',$2,$3::jsonb,$4,NOW())", [`out-${crypto.randomUUID()}`, runId, JSON.stringify({ runId, connectorId, connectorType: 'SMB_PRINTER', actorId: actor.id, runType }), context.correlationId || `cmdb.discovery.sync:${runId}`]);
    });
    return { runId, state: 'QUEUED' as const, runType };
  }
  public static async runQueued(runId: string): Promise<{ runId: string; discovered: number; failed: number; state: string }> {
    const run = await pgClient.transaction(async (client) => {
      const row = (await client.query<any>("SELECT r.connector_id,r.state,c.non_secret_configuration FROM cmdb_discovery_sync_runs r JOIN cmdb_discovery_connectors c ON c.id=r.connector_id WHERE r.id=$1 AND c.connector_type_id='SMB_PRINTER' FOR UPDATE", [runId])).rows[0];
      if (!row) throw Object.assign(new Error('SMB printer discovery run was not found.'), { code: 'DISCOVERY_RUN_NOT_FOUND' });
      if (['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(row.state)) return row;
      await client.query("UPDATE cmdb_discovery_sync_runs SET state='RUNNING',started_at=COALESCE(started_at,NOW()),checkpoint='Read-only SMB printer share enumeration',updated_at=NOW() WHERE id=$1", [runId]); return row;
    });
    if (['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(run.state)) return { runId, discovered: 0, failed: 0, state: run.state };
    try {
      const host = smbHost(run.non_secret_configuration?.host); const printers = await listSmbPrinterShares(host);
      const observedAt = new Date().toISOString();
      const batch = await DiscoveryIngestionService.ingestBatch(printers.map((printer) => ({ connectorId: run.connector_id, syncRunId: runId, sourceObjectType: 'SmbPrinterShare', sourceObjectId: printer.shareName, observedAt, rawPayload: { ...printer, host } })), smbPrinterPayloadMapper);
      if (batch.failed.length) await pgClient.query(`UPDATE cmdb_discovery_sync_runs
        SET failed_count=$2,error_summary=error_summary || $3::jsonb,updated_at=NOW() WHERE id=$1`, [runId, batch.failed.length, JSON.stringify(batch.failed.slice(0, 25).map((failure) => ({ objectId: failure.sourceObjectId, message: failure.error.slice(0, 1000) })))]);
      await DiscoveryIngestionService.reconcileAndCompleteRun(runId);
      return { runId, discovered: batch.succeeded.length, failed: batch.failed.length, state: batch.failed.length ? 'PARTIAL' : 'SUCCEEDED' };
    } catch (error) { await DiscoveryIngestionService.failRun(runId, error); throw error; }
  }
}
