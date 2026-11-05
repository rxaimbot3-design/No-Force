import * as fs from 'fs';
import * as path from 'path';
import { db } from './client';
import { logger } from '../logger';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const SCHEMA_VERSION_TABLE = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
`;

export async function runMigrations(): Promise<void> {
  const files = fs.existsSync(MIGRATIONS_DIR)
    ? fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort()
    : [];

  await db.execute(SCHEMA_VERSION_TABLE);

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    const already = await db.queryOne<{ version: string }>(
      'SELECT version FROM schema_migrations WHERE version = $1',
      [version]
    );
    if (already) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await db.transaction(async (tx) => {
      await tx.execute(sql);
      await tx.execute('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    });
    logger.info({ migration: version }, 'tong-ghor: migration applied');
  }
}

export async function applySeedSchema(): Promise<void> {
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) return;
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await db.execute(sql);
  logger.info('tong-ghor: seed schema applied');
}
