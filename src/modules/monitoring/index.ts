import { BaseModule } from '../base';
import { Services } from '../../types';
import { db } from '../../database/client';
import { redisClient } from '../../redis/client';

export interface HealthStatus {
  service: string;
  healthy: boolean;
  shards: { count: number; ready: number };
  db: { ok: boolean; latencyMs: number };
  redis: { ok: boolean; latencyMs: number };
  timestamp: string;
}

export class MonitoringModule extends BaseModule {
  private client: any;

  constructor() {
    super('monitoring');
  }

  async initialize(client: any, _services: Services): Promise<void> {
    this.client = client;
  }

  async handleEvent(_event: unknown): Promise<void> {
    // Monitoring is pull-based via /health
  }

  async getHealth(): Promise<HealthStatus> {
    const [dbHealth, redisHealth] = await Promise.all([db.health(), redisClient.health()]);
    const shardCount = this.client.ws?.shards ? this.client.ws.shards.size : 0;
    const readyShards = Array.from(this.client.ws?.shards?.values() ?? []).filter(
      (s: any) => s.status === 'READY'
    ).length;
    const healthy = dbHealth.ok && redisHealth.ok;
    return {
      service: 'tong-ghor',
      healthy,
      shards: { count: shardCount, ready: readyShards },
      db: dbHealth,
      redis: redisHealth,
      timestamp: new Date().toISOString(),
    };
  }

  async shutdown(): Promise<void> {
    // no-op
  }
}

export const monitoring = new MonitoringModule();
