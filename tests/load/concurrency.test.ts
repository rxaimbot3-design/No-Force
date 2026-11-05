import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkRateLimit } from '../../src/utils/rate-limit';
import { redisClient } from '../../src/redis/client';

vi.mock('../../src/redis/client', () => ({
  redisClient: { eval: vi.fn() },
}));

const evalMock = vi.mocked(redisClient.eval);

describe('Load: concurrent rate-limit checks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles high concurrency without errors', async () => {
    evalMock.mockResolvedValue(1);
    const concurrency = 200;
    const results = await Promise.all(
      Array.from({ length: concurrency }).map((_, i) =>
        checkRateLimit(`key:${i % 10}`, { windowSeconds: 60, maxHits: 10 })
      )
    );
    expect(results).toHaveLength(concurrency);
    for (const r of results) {
      expect(r.allowed).toBe(true);
    }
  });
});
