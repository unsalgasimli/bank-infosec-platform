import type pg from 'pg';
import { pgClient } from '../db/postgres/client.js';

export type ConnectorLockResult<T> = { acquired: true; value: T } | { acquired: false };

/**
 * Holds a PostgreSQL advisory lock on a dedicated pooled connection for the
 * duration of a connector operation. The key is connector-scoped, not global.
 */
export class ConnectorScopedLockService {
  public static key(connectorId: string, operation = 'sync'): string {
    const normalizedConnectorId = connectorId.trim();
    const normalizedOperation = operation.trim();
    if (!normalizedConnectorId || !normalizedOperation) throw new Error('Connector lock requires connector ID and operation.');
    return `aegissec:discovery:${normalizedOperation}:${normalizedConnectorId}`;
  }

  public static async withLock<T>(connectorId: string, operation: string, callback: () => Promise<T>): Promise<ConnectorLockResult<T>> {
    const pool = pgClient.getPool();
    if (!pool) throw new Error('Connector-scoped locks require PostgreSQL.');
    const client = await pool.connect();
    const lockKey = this.key(connectorId, operation);
    try {
      const acquired = await this.tryAcquire(client, lockKey);
      if (!acquired) return { acquired: false };
      try {
        return { acquired: true, value: await callback() };
      } finally {
        await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [lockKey]);
      }
    } finally {
      client.release();
    }
  }

  private static async tryAcquire(client: pg.PoolClient, lockKey: string): Promise<boolean> {
    const result = await client.query<{ acquired: boolean }>('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired', [lockKey]);
    return Boolean(result.rows[0]?.acquired);
  }
}
