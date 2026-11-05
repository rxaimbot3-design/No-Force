import type { ConfigService as ConfigServiceType, GuildConfig } from '../types';
import { db } from '../database/client';
import { redisClient } from '../redis/client';
import { logger } from '../logger';

const CACHE_TTL_SECONDS = 300;

export class ConfigService implements ConfigServiceType {
  async get(guildId: string): Promise<GuildConfig | null> {
    const cacheKey = `tg:config:${guildId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as GuildConfig;
    }

    const row = await db.queryOne<GuildConfig>(`SELECT * FROM guild_configs WHERE guild_id = $1`, [
      guildId,
    ]);

    if (row) {
      await redisClient.set(cacheKey, JSON.stringify(row), CACHE_TTL_SECONDS);
    }
    return row;
  }

  async set(guildId: string, patch: Partial<GuildConfig>): Promise<void> {
    const existing = await this.get(guildId);
    const now = new Date().toISOString();

    if (existing) {
      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;
      for (const [key, val] of Object.entries(patch)) {
        if (val === undefined) continue;
        fields.push(`${key} = $${idx++}`);
        values.push(val);
      }
      fields.push(`updated_at = $${idx++}`);
      values.push(now);
      values.push(guildId);

      await db.execute(
        `UPDATE guild_configs SET ${fields.join(', ')} WHERE guild_id = $${idx}`,
        values
      );
    } else {
      const keys = Object.keys(patch);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let idx = 1;
      for (const key of keys) {
        placeholders.push(`$${idx++}`);
        values.push((patch as Record<string, unknown>)[key]);
      }
      placeholders.push(`$${idx++}`);
      values.push(now);
      placeholders.push(`$${idx++}`);
      values.push(now);

      await db.execute(
        `INSERT INTO guild_configs (guild_id, ${keys.join(', ')}, created_at, updated_at)
         VALUES ($1, ${placeholders.slice(0, keys.length).join(', ')}, $${keys.length + 1}, $${keys.length + 2})`,
        [guildId, ...values.slice(0, keys.length), now, now]
      );
    }

    await redisClient.del(`tg:config:${guildId}`);
    logger.info({ guildId, patch }, 'tong-ghor: guild config updated');
  }

  async ensure(guildId: string): Promise<GuildConfig> {
    let config = await this.get(guildId);
    if (!config) {
      await this.set(guildId, { guild_id: guildId } as Partial<GuildConfig>);
      config = await this.get(guildId);
    }
    return config!;
  }
}

export const configService = new ConfigService();
