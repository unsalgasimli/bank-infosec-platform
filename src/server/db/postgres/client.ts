import pg from 'pg';
import { config } from '../../config/index.js';
import { logger } from '../../services/logger.service.js';

const { Pool } = pg;

export class PostgresClient {
  private static instance: PostgresClient;
  private pool: pg.Pool | null = null;
  private isConnected: boolean = false;

  private constructor() {
    this.initPool();
  }

  public static getInstance(): PostgresClient {
    if (!PostgresClient.instance) {
      PostgresClient.instance = new PostgresClient();
    }
    return PostgresClient.instance;
  }

  private initPool(): void {
    if (config.DB_TYPE !== 'postgres') {
      logger.info('Running in in-memory / local fallback mode for database.');
      return;
    }

    if (!config.DATABASE_URL && (!config.DB_HOST || !config.DB_USER || !config.DB_PASSWORD || !config.DB_NAME)) {
      throw new Error('DB_TYPE=postgres requires DATABASE_URL or DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME.');
    }

    try {
      const poolConfig: pg.PoolConfig = config.DATABASE_URL
        ? {
            connectionString: config.DATABASE_URL,
            ssl: config.DB_SSL ? { rejectUnauthorized: false } : false,
            min: config.DB_POOL_MIN,
            max: config.DB_POOL_MAX,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
            statement_timeout: config.DB_STATEMENT_TIMEOUT_MS,
            query_timeout: config.DB_STATEMENT_TIMEOUT_MS,
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000,
            maxUses: 10000,
            application_name: 'aegissec-banking-platform',
          }
        : {
            host: config.DB_HOST,
            port: config.DB_PORT,
            user: config.DB_USER,
            password: config.DB_PASSWORD,
            database: config.DB_NAME,
            ssl: config.DB_SSL ? { rejectUnauthorized: false } : false,
            min: config.DB_POOL_MIN,
            max: config.DB_POOL_MAX,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
            statement_timeout: config.DB_STATEMENT_TIMEOUT_MS,
            query_timeout: config.DB_STATEMENT_TIMEOUT_MS,
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000,
            maxUses: 10000,
            application_name: 'aegissec-banking-platform',
          };

      this.pool = new Pool(poolConfig);

      this.pool.on('connect', () => {
        this.isConnected = true;
        logger.debug('New PostgreSQL client connected to pool');
      });

      this.pool.on('error', (err) => {
        logger.error({ err }, 'Unexpected PostgreSQL pool client error');
        this.isConnected = false;
      });

      logger.info(
        {
          host: config.DB_HOST,
          database: config.DB_NAME,
          poolMin: config.DB_POOL_MIN,
          poolMax: config.DB_POOL_MAX,
        },
        'PostgreSQL connection pool initialized'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to initialize PostgreSQL connection pool');
    }
  }

  public getPool(): pg.Pool | null {
    return this.pool;
  }

  public async query<T extends pg.QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<pg.QueryResult<T>> {
    if (!this.pool) {
      throw new Error('PostgreSQL pool is not initialized or DB_TYPE is set to memory.');
    }

    const start = Date.now();
    try {
      const res = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      logger.trace({ text, duration, rows: res.rowCount }, 'Executed PostgreSQL query');
      return res;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error({ text, duration, error }, 'PostgreSQL query failed');
      throw error;
    }
  }

  public async transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) {
      throw new Error('PostgreSQL pool is not initialized.');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await client.query(`SET LOCAL statement_timeout = ${Math.trunc(config.DB_STATEMENT_TIMEOUT_MS)}`);
      await client.query(`SET LOCAL lock_timeout = ${Math.trunc(config.DB_LOCK_TIMEOUT_MS)}`);
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async checkHealth(): Promise<{ status: 'UP' | 'DOWN'; latencyMs?: number; error?: string }> {
    if (!this.pool) {
      return { status: 'DOWN', error: 'PostgreSQL pool not active (DB_TYPE=memory)' };
    }

    const start = Date.now();
    try {
      await this.pool.query('SELECT 1 AS health_check');
      const latencyMs = Date.now() - start;
      return { status: 'UP', latencyMs };
    } catch (error: any) {
      return { status: 'DOWN', error: error.message || 'Health check query failed' };
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      const pool = this.pool;
      this.pool = null;
      await pool.end();
      this.isConnected = false;
      logger.info('PostgreSQL connection pool closed');
    }
  }
}

export const pgClient = PostgresClient.getInstance();
