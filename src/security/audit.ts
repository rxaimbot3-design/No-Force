import crypto from 'crypto';
import { db } from '../database/client';
import { logger } from '../logger';
import type { AuditRecord, AuditService as AuditServiceType } from '../types';

let lastHash: string | null = null;

export class AuditService implements AuditServiceType {
  async record(record: AuditRecord): Promise<void> {
    const payload = JSON.stringify({
      actor_id: record.actor_id,
      action: record.action,
      target_id: record.target_id,
      target_type: record.target_type,
      result: record.result,
      reason: record.reason,
      metadata: record.metadata ?? {},
    });
    const hash = crypto
      .createHash('sha256')
      .update((lastHash || '') + payload)
      .digest('hex');

    try {
      await db.execute(
        `INSERT INTO audit_log (guild_id, actor_id, action, target_id, target_type, result, reason, metadata, prev_hash, hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          record.guild_id,
          record.actor_id,
          record.action,
          record.target_id ?? null,
          record.target_type ?? null,
          record.result,
          record.reason ?? null,
          JSON.stringify(record.metadata ?? {}),
          lastHash ?? null,
          hash,
        ]
      );
      lastHash = hash;
    } catch (err) {
      logger.error({ err, record }, 'tong-ghor: audit record write failed');
      throw err;
    }
  }

  chainHead(): Promise<string | null> {
    return Promise.resolve(lastHash);
  }

  setChainHead(hash: string): void {
    lastHash = hash;
  }
}

export const audit = new AuditService();
