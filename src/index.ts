import { config } from './config';
import { childLogger } from './logger';
import { db } from './database/client';
import { redisClient } from './redis/client';
import { eventRouter } from './events/router';
import { audit } from './security/audit';
import { runMigrations, applySeedSchema } from './database/migrate';

const log = childLogger({ component: 'core' });

async function start(): Promise<void> {
  log.info({ version: '1.0.0' }, 'tong-ghor: starting');

  log.info(
    { nodeEnv: config.nodeEnv, shardCount: config.shardCount },
    'tong-ghor: configuration loaded'
  );

  const dbHealth = await db.health();
  log.info({ db: dbHealth }, 'tong-ghor: database health check');
  if (!dbHealth.ok) {
    log.error('tong-ghor: database unhealthy; continuing in degraded mode');
  }

  const redisHealth = await redisClient.health();
  log.info({ redis: redisHealth }, 'tong-ghor: redis health check');
  if (!redisHealth.ok) {
    log.error('tong-ghor: redis unhealthy; continuing in degraded mode');
  }

  try {
    const head = await db.queryOne<{ hash: string }>(
      `SELECT hash FROM audit_log ORDER BY created_at DESC LIMIT 1`
    );
    if (head) audit.setChainHead(head.hash);
  } catch {
    log.warn('tong-ghor: could not load audit chain head, starting fresh');
  }

  try {
    await runMigrations();
    await applySeedSchema();
  } catch {
    log.warn('tong-ghor: migrations/schema skipped (db unavailable), running in degraded mode');
  }

  log.info('tong-ghor: core framework initialized');

  const { createServer } = await import('http');
  const server = createServer((req, res) => {
    void (async () => {
      if (req.url === '/health') {
        const [dbH, redisH] = await Promise.all([db.health(), redisClient.health()]);
        const healthy = dbH.ok && redisH.ok;
        res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ service: 'tong-ghor', healthy, db: dbH, redis: redisH }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
      }
    })();
  });

  server.listen(config.server.port, () => {
    log.info({ port: config.server.port }, 'tong-ghor: health server listening');
  });

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  async function handleShutdown(sig: NodeJS.Signals): Promise<void> {
    log.info({ signal: sig }, 'tong-ghor: shutting down');
    eventRouter.removeAllListeners();
    await db.close();
    await redisClient.close();
    server.close(() => process.exit(0));
  }
  for (const sig of signals) {
    process.on(sig, () => {
      void handleShutdown(sig);
    });
  }
}

start().catch((err) => {
  log.error({ err }, 'tong-ghor: fatal startup error');
  process.exit(1);
});
