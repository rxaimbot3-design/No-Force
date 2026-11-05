import pino, { type Logger as PinoLogger } from 'pino';
import { config } from './config';

const level = (config.logLevel as pino.Level) || 'info';

const logger: PinoLogger = pino({
  level,
  transport:
    config.nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l' } }
      : undefined,
  base: { service: 'tong-ghor', env: config.nodeEnv },
  redact: [
    'req.headers.authorization',
    'DISCORD_TOKEN',
    'DATABASE_URL',
    'REDIS_URL',
    'token',
    'password',
    'secret',
  ],
});

export { logger };
export type { PinoLogger };

export function childLogger(bindings: Record<string, unknown>): PinoLogger {
  return logger.child(bindings);
}
