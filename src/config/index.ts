import { getEnv } from './env';

export const env = getEnv();

export const config = {
  discord: {
    token: env.DISCORD_TOKEN,
    clientId: env.DISCORD_CLIENT_ID,
    publicKey: env.DISCORD_PUBLIC_KEY,
  },
  rootUserId: env.TONG_GHOR_ROOT_USER_ID,
  database: {
    url: env.DATABASE_URL,
    readUrl: env.DATABASE_READ_URL,
  },
  redis: {
    url: env.REDIS_URL,
  },
  server: {
    port: env.PORT,
  },
  nodeEnv: env.NODE_ENV,
  shardCount: env.SHARD_COUNT,
  logLevel: env.LOG_LEVEL,
};
