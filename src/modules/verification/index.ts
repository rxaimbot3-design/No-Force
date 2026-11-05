import { BaseModule } from '../base';
import { Services } from '../../types';
import { audit } from '../../security/audit';
import { configService } from '../../config/service';
import { db } from '../../database/client';
import { randomUUID } from 'crypto';

interface VerificationEvent {
  type: 'guildMemberAdd' | 'verify' | 'fail';
  guildId: string;
  userId: string;
  challenge?: string;
}

export class VerificationModule extends BaseModule {
  private client: any;

  constructor() {
    super('verification');
  }

  async initialize(client: any, _services: Services): Promise<void> {
    this.client = client;
  }

  async handleEvent(event: unknown): Promise<void> {
    const e = event as VerificationEvent;
    if (e.type === 'guildMemberAdd') {
      await this.onMemberJoin(e.guildId, e.userId);
    }
  }

  private async onMemberJoin(guildId: string, userId: string): Promise<void> {
    const config = await configService.get(guildId);
    if (!config || !config.verification_enabled) return;

    const challenge = randomUUID();
    await db.execute(
      `INSERT INTO verification_sessions (id, guild_id, user_id, status, challenge, created_at)
       VALUES ($1,$2,$3,'pending',$4,now())
       ON CONFLICT (guild_id, user_id) DO UPDATE SET status = 'pending', attempts = 0, challenge = $4, locked_until = null, updated_at = now()`,
      [randomUUID(), guildId, userId, challenge]
    );

    const guild = this.client.guilds?.cache?.get(guildId);
    const channel = config.verification_channel
      ? guild?.channels?.cache?.get(config.verification_channel)
      : null;
    if (channel?.isText()) {
      await channel
        .send({
          content: `Welcome <@${userId}>! Please verify yourself to access Tong Ghor. Use the verification panel to complete the challenge.`,
        })
        .catch(() => {});
    }
  }

  async submitVerification(
    guildId: string,
    userId: string,
    challenge: string
  ): Promise<{ ok: boolean; error?: string }> {
    const session = await db.queryOne<{
      status: string;
      attempts: number;
      max_attempts: number;
      locked_until: Date | null;
      challenge: string | null;
    }>(
      `SELECT status, attempts, max_attempts, locked_until, challenge FROM verification_sessions WHERE guild_id = $1 AND user_id = $2`,
      [guildId, userId]
    );
    if (!session) return { ok: false, error: 'no active verification session' };

    const now = Date.now();
    if (session.locked_until && now < new Date(session.locked_until).getTime()) {
      return { ok: false, error: 'verification locked' };
    }

    if (session.challenge !== challenge) {
      await db.execute(
        `UPDATE verification_sessions SET attempts = attempts + 1, updated_at = now() WHERE guild_id = $1 AND user_id = $2`,
        [guildId, userId]
      );
      if (session.attempts + 1 >= (session.max_attempts ?? 3)) {
        await db.execute(
          `UPDATE verification_sessions SET status = 'locked', locked_until = now() + interval '1 hour', updated_at = now() WHERE guild_id = $1 AND user_id = $2`,
          [guildId, userId]
        );
        await audit.record({
          guild_id: guildId,
          actor_id: userId,
          action: 'tg:verification:locked',
          target_id: userId,
          target_type: 'user',
          result: 'ALLOWED',
          reason: 'max verification attempts exceeded',
        });
        return { ok: false, error: 'verification locked' };
      }
      return { ok: false, error: 'invalid challenge' };
    }

    await db.execute(
      `UPDATE verification_sessions SET status = 'verified', verified_at = now(), updated_at = now() WHERE guild_id = $1 AND user_id = $2`,
      [guildId, userId]
    );

    const config = await configService.get(guildId);
    const guild = this.client.guilds?.cache?.get(guildId);
    const member = guild?.members?.cache?.get(userId);
    if (config?.welcome_assign_role && member) {
      const role = guild?.roles?.cache?.get(config.welcome_assign_role);
      if (role) await member.roles.add(role, 'Tong Ghor verification: verified').catch(() => {});
    }

    await audit.record({
      guild_id: guildId,
      actor_id: userId,
      action: 'tg:verification:verified',
      target_id: userId,
      target_type: 'user',
      result: 'ALLOWED',
      reason: 'verification complete',
    });
    return { ok: true };
  }

  async shutdown(): Promise<void> {
    // no-op
  }
}

export const verification = new VerificationModule();
