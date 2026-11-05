import Redis from 'ioredis';
import { config } from '../config';

const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 100, 5000),
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error({ err }, 'tong-ghor: redis error');
});

export class RedisClient {
  private client = redis;

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async eval(script: string, keys: string[], args: unknown[]): Promise<unknown> {
    return this.client.eval(script, keys.length, ...keys, ...(args as unknown as any[]));
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async close(): Promise<void> {
    await this.client.quit();
  }

  async health(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = process.hrtime.bigint();
    try {
      await this.client.ping();
      const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      return { ok: true, latencyMs };
    } catch {
      const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      return { ok: false, latencyMs };
    }
  }

  getClient() {
    return this.client;
  }
}

export const redisClient = new RedisClient();

export default redis;
