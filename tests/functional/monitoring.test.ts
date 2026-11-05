import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { monitoring } from '../../src/modules/monitoring';
import { db } from '../../src/database/client';
import { redisClient } from '../../src/redis/client';

const dbHealthSpy = vi.spyOn(db, 'health');
const redisHealthSpy = vi.spyOn(redisClient, 'health');

describe('MonitoringModule health', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dbHealthSpy.mockResolvedValue({ ok: true, latencyMs: 5 });
    redisHealthSpy.mockResolvedValue({ ok: true, latencyMs: 2 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getHealth returns a status object', async () => {
    (monitoring as any).client = {
      ws: { shards: new Map() },
    };
    const health = await monitoring.getHealth();
    expect(health).toHaveProperty('service');
    expect(health).toHaveProperty('healthy');
    expect(health).toHaveProperty('db');
    expect(health).toHaveProperty('redis');
    expect(health.service).toBe('tong-ghor');
    expect(health.healthy).toBe(true);
  });
});
