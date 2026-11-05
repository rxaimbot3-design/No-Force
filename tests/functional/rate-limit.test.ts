import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkRateLimit } from '../../src/utils/rate-limit';
import { redisClient } from '../../src/redis/client';

vi.mock('../../src/redis/client', () => ({
  redisClient: { eval: vi.fn(), ping: vi.fn(), close: vi.fn(), health: vi.fn() },
}));

const evalMock = vi.mocked(redisClient.eval);

describe('rate-limit sliding window', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows requests under the limit', async () => {
    evalMock.mockResolvedValue(3);
    const result = await checkRateLimit('key', { windowSeconds: 60, maxHits: 10 });
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(3);
  });

  it('denies requests over the limit', async () => {
    evalMock.mockResolvedValue(11);
    const result = await checkRateLimit('key', { windowSeconds: 60, maxHits: 10 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('fails closed when redis errors', async () => {
    evalMock.mockRejectedValue(new Error('redis down'));
    const result = await checkRateLimit('key', { windowSeconds: 60, maxHits: 10 });
    expect(result.allowed).toBe(false);
  });
});
