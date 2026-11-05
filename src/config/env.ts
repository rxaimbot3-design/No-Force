import { z } from 'zod';

const EnvSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_CLIENT_ID: z.string().min(1, 'DISCORD_CLIENT_ID is required'),
  DISCORD_PUBLIC_KEY: z.string().optional(),
  TONG_GHOR_ROOT_USER_ID: z.string().min(1, 'TONG_GHOR_ROOT_USER_ID is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_READ_URL: z.string().optional(),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  PORT: z.string().transform(Number).default('8080'),
  NODE_ENV: z.string().default('production'),
  SHARD_COUNT: z.string().default('auto'),
  LOG_LEVEL: z.string().default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

let envCache: Env | null = null;

export function loadEnv(): Env {
  if (envCache) return envCache;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  envCache = parsed.data;
  return envCache;
}

export function getEnv(): Env {
  return loadEnv();
}
