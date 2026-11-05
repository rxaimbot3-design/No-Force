import { BaseModule } from '../base';
import { Services } from '../../types';
import { checkRateLimit } from '../../utils/rate-limit';
import { audit } from '../../security/audit';
import { configService } from '../../config/service';
import { logger } from '../../logger';
import { EventEmitter } from 'events';

interface RaidEvent {
  type: 'guildMemberAdd';
  guildId: string;
  userId: string;
}

export class AntiRaidModule extends BaseModule {
  private client: any;
  private readonly events = new EventEmitter();

  constructor() {
    super('anti-raid');
  }

  async initialize(client: any, _services: Services): Promise<void> {
    this.client = client;
  }

  async handleEvent(event: unknown): Promise<void> {
    const e = event as RaidEvent;
    if (e.type !== 'guildMemberAdd') return;
    await this.onMemberJoin(e.guildId, e.userId);
  }

  private async onMemberJoin(guildId: string, userId: string): Promise<void> {
    const config = await configService.get(guildId);
    if (!config || !config.anti_raid_enabled) return;

    const key = `tg:raid:${guildId}`;
    const result = await checkRateLimit(key, {
      windowSeconds: config.anti_raid_window_sec || 60,
      maxHits: config.anti_raid_threshold || 10,
    });

    if (!result.allowed) {
      await this.handleRaid(guildId, userId, config);
    }
  }

  private async handleRaid(guildId: string, userId: string, config: any): Promise<void> {
    const log = logger.child({ component: 'anti-raid', guildId, userId });
    log.warn('raid threshold exceeded');

    await audit.record({
      guild_id: guildId,
      actor_id: 'tong-ghor:system',
      action: 'tg:antiRaid:triggered',
      target_id: userId,
      target_type: 'user',
      result: 'ALLOWED',
      reason: 'raid threshold exceeded',
      metadata: { module: 'anti-raid' },
    });

    const guild = this.client.guilds?.cache?.get(guildId);
    if (!guild) return;

    // Notify moderators via audit/mod log channel
    if (config.mod_log_channel) {
      const channel = guild.channels?.cache?.get(config.mod_log_channel);
      if (channel?.isText()) {
        await channel
          .send({
            content: `**Tong Ghor Anti-Raid**: Raid detected in guild \`${guildId}\`. Join rate exceeded threshold. Member \`<@${userId}>\` joined during the raid window.`,
          })
          .catch(() => {});
      }
    }

    // Emit for other modules (e.g., anti-nuke lockdown)
    this.events.emit('raid:detected', { guildId, userId, config });
  }

  on(
    event: 'raid:detected',
    listener: (data: { guildId: string; userId: string; config: any }) => void
  ): this {
    this.events.on(event, listener);
    return this;
  }

  async shutdown(): Promise<void> {
    this.events.removeAllListeners();
  }
}

export const antiRaid = new AntiRaidModule();
