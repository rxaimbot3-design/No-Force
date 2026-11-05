import { BaseModule } from '../base';
import { Services } from '../../types';
import { audit } from '../../security/audit';
import { configService } from '../../config/service';
import { db } from '../../database/client';

interface LevelEvent {
  type: 'messageCreate';
  guildId: string;
  userId: string;
  memberRoles: string[];
  contentLength: number;
  authorBot: boolean;
  authorWebhook: boolean;
}

export class LevelingModule extends BaseModule {
  private client: any;
  private xpCooldown = new Map<string, number>();

  constructor() {
    super('leveling');
  }

  async initialize(client: any, _services: Services): Promise<void> {
    this.client = client;
  }

  async handleEvent(event: unknown): Promise<void> {
    const e = event as LevelEvent;
    if (e.type !== 'messageCreate') return;
    if (!e.guildId) return;
    if (e.authorBot || e.authorWebhook) return;
    if (e.contentLength < 3) return;

    const config = await configService.get(e.guildId);
    if (!config || !config.leveling_enabled) return;

    // Trusted/staff bypass xp gain? No—everyone gains, but cooldown prevents farm.
    const now = Date.now();
    const cdKey = `${e.guildId}:${e.userId}`;
    const last = this.xpCooldown.get(cdKey) ?? 0;
    if (now - last < 60000) return; // 60s cooldown
    this.xpCooldown.set(cdKey, now);

    const grant = 5 + Math.floor(Math.random() * 6); // 5-10 xp
    const row = await db.queryOne<{ xp: number; level: number }>(
      `SELECT xp, level FROM user_levels WHERE guild_id = $1 AND user_id = $2`,
      [e.guildId, e.userId]
    );

    let currentXp = row?.xp ?? 0;
    let currentLevel = row?.level ?? 0;
    currentXp += grant;

    const newLevel = this.levelForXp(currentXp);
    let leveledUp = false;
    if (newLevel > currentLevel) {
      leveledUp = true;
      currentLevel = newLevel;
      await this.awardRoleReward(e.guildId, e.userId, newLevel);
    }

    await db.execute(
      `INSERT INTO user_levels (guild_id, user_id, xp, level, messages, last_xp_at, updated_at)
       VALUES ($1,$2,$3,$4,1,now(),now())
       ON CONFLICT (guild_id, user_id) DO UPDATE SET xp = $3, level = $4, messages = user_levels.messages + 1, last_xp_at = now(), updated_at = now()`,
      [e.guildId, e.userId, currentXp, currentLevel]
    );

    if (leveledUp) {
      await audit.record({
        guild_id: e.guildId,
        actor_id: 'tong-ghor:system',
        action: 'tg:leveling:levelup',
        target_id: e.userId,
        target_type: 'user',
        result: 'ALLOWED',
        reason: `reached level ${newLevel}`,
        metadata: { module: 'leveling', xp: currentXp, level: newLevel },
      });
    }
  }

  private levelForXp(xp: number): number {
    return Math.floor(Math.sqrt(xp / 100));
  }

  private async awardRoleReward(guildId: string, userId: string, level: number): Promise<void> {
    const reward = await db.queryOne<{ role_id: string }>(
      `SELECT role_id FROM level_rewards WHERE guild_id = $1 AND level = $2`,
      [guildId, level]
    );
    if (!reward) return;
    const guild = this.client.guilds?.cache?.get(guildId);
    const member = guild?.members?.cache?.get(userId);
    const role = guild?.roles?.cache?.get(reward.role_id);
    if (member && role) {
      await member.roles.add(role, `Tong Ghor leveling: reached level ${level}`).catch(() => {});
    }
  }

  async shutdown(): Promise<void> {
    this.xpCooldown.clear();
  }
}

export const leveling = new LevelingModule();
