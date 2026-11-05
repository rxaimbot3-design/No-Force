import { BaseModule } from '../base';
import { Services } from '../../types';
import { audit } from '../../security/audit';
import { authorization } from '../../security/authorization';
import { configService } from '../../config/service';
import { db } from '../../database/client';
import { randomUUID } from 'crypto';

interface EconomyCommand {
  type: 'balance' | 'daily' | 'transfer';
  guildId: string;
  userId: string;
  targetId?: string;
  amount?: number;
}

const DAILY_AMOUNT = 100;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export class EconomyModule extends BaseModule {
  private dailyCooldown = new Map<string, number>();

  constructor() {
    super('economy');
  }

  async initialize(_client: any, _services: Services): Promise<void> {
    // Economy is command-driven
  }

  async handleEvent(_event: unknown): Promise<void> {
    // Economy is command-driven
  }

  async execute(cmd: EconomyCommand): Promise<{ ok: boolean; balance?: number; error?: string }> {
    const config = await configService.get(cmd.guildId);
    if (!config || !config.economy_enabled) {
      return { ok: false, error: 'economy module not enabled' };
    }

    switch (cmd.type) {
      case 'balance':
        return this.getBalance(cmd.guildId, cmd.userId);
      case 'daily':
        return this.daily(cmd.guildId, cmd.userId);
      case 'transfer':
        return this.transfer(cmd.guildId, cmd.userId, cmd.targetId!, cmd.amount!);
    }
  }

  private async getBalance(
    guildId: string,
    userId: string
  ): Promise<{ ok: boolean; balance?: number; error?: string }> {
    const auth = await authorization.can(guildId, userId, 'tg:economy:claim');
    if (!auth.allowed) {
      await audit.record({
        guild_id: guildId,
        actor_id: userId,
        action: 'tg:economy:balance',
        target_id: userId,
        target_type: 'user',
        result: 'DENIED',
        reason: auth.reason,
      });
      return { ok: false, error: 'authorization denied' };
    }
    const row = await db.queryOne<{ balance: number }>(
      `SELECT balance FROM economy_balances WHERE guild_id = $1 AND user_id = $2`,
      [guildId, userId]
    );
    return { ok: true, balance: row?.balance ?? 0 };
  }

  private async daily(
    guildId: string,
    userId: string
  ): Promise<{ ok: boolean; balance?: number; error?: string }> {
    const auth = await authorization.can(guildId, userId, 'tg:economy:claim');
    if (!auth.allowed) {
      await audit.record({
        guild_id: guildId,
        actor_id: userId,
        action: 'tg:economy:daily',
        target_id: userId,
        target_type: 'user',
        result: 'DENIED',
        reason: auth.reason,
      });
      return { ok: false, error: 'authorization denied' };
    }

    const now = Date.now();
    const key = `${guildId}:${userId}`;
    const last = this.dailyCooldown.get(key) ?? 0;
    if (now - last < DAILY_COOLDOWN_MS) {
      return { ok: false, error: 'daily claim on cooldown' };
    }

    await db.execute(
      `INSERT INTO economy_balances (guild_id, user_id, balance, updated_at) VALUES ($1,$2,$3,now())
       ON CONFLICT (guild_id, user_id) DO UPDATE SET balance = economy_balances.balance + $3, updated_at = now()`,
      [guildId, userId, DAILY_AMOUNT]
    );
    this.dailyCooldown.set(key, now);

    await db.execute(
      `INSERT INTO economy_transactions (id, guild_id, to_user, amount, type, reason, created_at)
       VALUES ($1,$2,$3,$4,'daily',$5,now())`,
      [randomUUID(), guildId, userId, DAILY_AMOUNT, 'daily claim']
    );
    await audit.record({
      guild_id: guildId,
      actor_id: 'tong-ghor:system',
      action: 'tg:economy:daily',
      target_id: userId,
      target_type: 'user',
      result: 'ALLOWED',
      reason: 'daily claim',
      metadata: { module: 'economy', amount: DAILY_AMOUNT },
    });

    const row = await db.queryOne<{ balance: number }>(
      `SELECT balance FROM economy_balances WHERE guild_id = $1 AND user_id = $2`,
      [guildId, userId]
    );
    return { ok: true, balance: row?.balance ?? 0 };
  }

  private async transfer(
    guildId: string,
    fromUser: string,
    toUser: string,
    amount: number
  ): Promise<{ ok: boolean; balance?: number; error?: string }> {
    if (!amount || amount <= 0) return { ok: false, error: 'invalid amount' };
    if (fromUser === toUser) return { ok: false, error: 'cannot transfer to self' };

    const auth = await authorization.can(guildId, fromUser, 'tg:economy:transfer');
    if (!auth.allowed) {
      await audit.record({
        guild_id: guildId,
        actor_id: fromUser,
        action: 'tg:economy:transfer',
        target_id: toUser,
        target_type: 'user',
        result: 'DENIED',
        reason: auth.reason,
      });
      return { ok: false, error: 'authorization denied' };
    }

    return db.transaction(async (tx) => {
      const from = await tx.queryOne<{ balance: number }>(
        `SELECT balance FROM economy_balances WHERE guild_id = $1 AND user_id = $2 FOR UPDATE`,
        [guildId, fromUser]
      );
      if (!from || from.balance < amount) {
        return { ok: false, error: 'insufficient balance' };
      }

      await tx.execute(
        `INSERT INTO economy_balances (guild_id, user_id, balance, updated_at) VALUES ($1,$2,$3,now())
         ON CONFLICT (guild_id, user_id) DO UPDATE SET balance = economy_balances.balance + $3, updated_at = now()`,
        [guildId, toUser, amount]
      );
      await tx.execute(
        `UPDATE economy_balances SET balance = balance - $1, updated_at = now() WHERE guild_id = $2 AND user_id = $3`,
        [amount, guildId, fromUser]
      );
      await tx.execute(
        `INSERT INTO economy_transactions (id, guild_id, from_user, to_user, amount, type, reason, created_at)
         VALUES ($1,$2,$3,$4,$5,'transfer',$6,now())`,
        [randomUUID(), guildId, fromUser, toUser, amount, 'user transfer']
      );
      await audit.record({
        guild_id: guildId,
        actor_id: fromUser,
        action: 'tg:economy:transfer',
        target_id: toUser,
        target_type: 'user',
        result: 'ALLOWED',
        reason: 'transfer',
        metadata: { module: 'economy', amount },
      });

      const bal = await tx.queryOne<{ balance: number }>(
        `SELECT balance FROM economy_balances WHERE guild_id = $1 AND user_id = $2`,
        [guildId, fromUser]
      );
      return { ok: true, balance: bal?.balance ?? 0 };
    });
  }

  async shutdown(): Promise<void> {
    this.dailyCooldown.clear();
  }
}

export const economy = new EconomyModule();
