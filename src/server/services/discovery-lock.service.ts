import { pgClient } from '../db/postgres/client.js';
import type pg from 'pg';

export type ConnectorLockResult<T> = { acquired: true; value: T } | { acquired: false };

/**
 * The transaction pins the server connection even with PgBouncer transaction
 * pooling. The callback uses that same transaction; commit/rollback releases
 * the connector-scoped lock, including failure and connection loss.
 */
export class ConnectorScopedLockService {
  public static key(connectorId: string, operation = 'sync'): string {
    const normalizedConnectorId = connectorId.trim();
    const normalizedOperation = operation.trim();
    if (!normalizedConnectorId || !normalizedOperation) throw new Error('Connector lock requires connector ID and operation.');
    return `aegissec:discovery:${normalizedOperation}:${normalizedConnectorId}`;
  }

  public static async withLock<T>(connectorId: string, operation: string, callback: (client: pg.PoolClient) => Promise<T>): Promise<ConnectorLockResult<T>> {
    const lockKey = this.key(connectorId, operation);
    return pgClient.transaction(async (client) => {
      const result = await client.query<{ acquired: boolean }>('SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired', [lockKey]);
      if (!result.rows[0]?.acquired) return { acquired: false };
      return { acquired: true, value: await callback(client) };
    });
  }
}
