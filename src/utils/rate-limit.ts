import { redisClient } from '../redis/client';
import { logger } from '../logger';

const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = now .. ':' .. math.random()
redis.call('ZADD', key, now, member)
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = tonumber(redis.call('ZCARD', key))
redis.call('EXPIRE', key, window)
return count
`;

export interface RateLimitConfig {
  windowSeconds: number;
  maxHits: number;
}

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; count: number; remaining: number }> {
  const now = Date.now();
  try {
    const count = (await redisClient.eval(
      SLIDING_WINDOW_SCRIPT,
      [key],
      [now, config.windowSeconds * 1000, config.maxHits]
    )) as number;
    const allowed = count <= config.maxHits;
    const remaining = Math.max(0, config.maxHits - count);
    return { allowed, count, remaining };
  } catch (err) {
    logger.error({ err, key }, 'tong-ghor: rate limit check failed, failing closed');
    // Fail closed: treat as rate limited when Redis is unavailable
    return { allowed: false, count: 0, remaining: 0 };
  }
}

export async function consumeRateLimit(key: string, config: RateLimitConfig): Promise<boolean> {
  const result = await checkRateLimit(key, config);
  return result.allowed;
}
