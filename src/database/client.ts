import { Pool, type PoolClient, type QueryResult } from 'pg';
import { config } from '../config';
import { logger } from '../logger';
import type { DatabaseClient as DatabaseClientType } from '../types';

const pool = new Pool({
  connectionString: config.database.url,
  max: 12,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'tong-ghor: database pool unexpected error');
});

export class PostgresDatabaseClient implements DatabaseClientType {
  private pool = pool;

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const start = process.hrtime.bigint();
    let client: PoolClient | null = null;
    try {
      client = await this.pool.connect();
      const result: QueryResult = await client.query(sql, params);
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      logger.debug({ sql, durationMs, rows: result.rowCount }, 'tong-ghor: db query');
      return result.rows as unknown as T[];
    } catch (err) {
      logger.error({ err, sql }, 'tong-ghor: db query failed');
      throw err;
    } finally {
      if (client) client.release();
    }
  }

  async queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length ? (rows[0] as T) : null;
  }

  async execute(sql: string, params: unknown[] = []): Promise<{ rowCount: number }> {
    const start = process.hrtime.bigint();
    let client: PoolClient | null = null;
    try {
      client = await this.pool.connect();
      const result: QueryResult = await client.query(sql, params);
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      logger.debug({ sql, durationMs, rowCount: result.rowCount }, 'tong-ghor: db execute');
      return { rowCount: result.rowCount ?? 0 };
    } catch (err) {
      logger.error({ err, sql }, 'tong-ghor: db execute failed');
      throw err;
    } finally {
      if (client) client.release();
    }
  }

  async transaction<T>(fn: (client: DatabaseClientType) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const txClient: DatabaseClientType = new TxDatabaseClient(client);
      const result = await fn(txClient);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async health(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = process.hrtime.bigint();
    try {
      await this.query<{ now: Date }>('SELECT now()', []);
      const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      return { ok: true, latencyMs };
    } catch {
      const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      return { ok: false, latencyMs };
    }
  }
}

class TxDatabaseClient implements DatabaseClientType {
  constructor(private client: PoolClient) {}
  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.client.query(sql, params);
    return result.rows as unknown as T[];
  }
  async queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length ? (rows[0] as T) : null;
  }
  async execute(sql: string, params: unknown[] = []): Promise<{ rowCount: number }> {
    const result = await this.client.query(sql, params);
    return { rowCount: result.rowCount ?? 0 };
  }
  transaction(): Promise<never> {
    return Promise.reject(new Error('nested transactions not supported'));
  }
  close(): Promise<void> {
    this.client.release(true);
    return Promise.resolve();
  }
  health(): Promise<{ ok: boolean; latencyMs: number }> {
    return Promise.resolve({ ok: true, latencyMs: 0 });
  }
}

export const db = new PostgresDatabaseClient();
