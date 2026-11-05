import { BaseModule } from '../base';
import { Services } from '../../types';
import { checkRateLimit } from '../../utils/rate-limit';
import { audit } from '../../security/audit';
import { logger } from '../../logger';
import { configService } from '../../config/service';

interface NukeEvent {
  type: 'channelDelete' | 'roleDelete' | 'guildBanAdd' | 'webhooksUpdate';
  guildId: string;
  actorId?: string;
  targetId: string;
}

export class AntiNukeModule extends BaseModule {
  private client: any;

  constructor() {
    super('anti-nuke');
  }

  async initialize(client: any, _services: Services): Promise<void> {
    this.client = client;
  }

  async handleEvent(event: unknown): Promise<void> {
    const e = event as NukeEvent;
    if (!['channelDelete', 'roleDelete', 'guildBanAdd', 'webhooksUpdate'].includes(e.type)) return;

    const config = await configService.get(e.guildId);
    if (!config || !config.anti_nuke_enabled) return;

    const key = `tg:nuke:${e.guildId}:${e.type}`;
    const result = await checkRateLimit(key, {
      windowSeconds: 10,
      maxHits: 5,
    });

    if (!result.allowed) {
      await this.handleNuke(e, config);
    }
  }

  private async handleNuke(e: NukeEvent, config: any): Promise<void> {
    const log = logger.child({ component: 'anti-nuke', guildId: e.guildId, actorId: e.actorId });
    log.warn('nuke threshold exceeded', { event: e.type, target: e.targetId });

    await audit.record({
      guild_id: e.guildId,
      actor_id: e.actorId || 'tong-ghor:system',
      action: 'tg:antiNuke:triggered',
      target_id: e.targetId,
      target_type: e.type,
      result: 'ALLOWED',
      reason: `nuke threshold exceeded: ${e.type}`,
      metadata: { module: 'anti-nuke', event: e.type },
    });

    const guild = this.client.guilds?.cache?.get(e.guildId);
    if (!guild) return;

    // Alert admins via mod log channel
    if (config.mod_log_channel) {
      const channel = guild.channels?.cache?.get(config.mod_log_channel);
      if (channel?.isText()) {
        await channel
          .send({
            content: `**Tong Ghor Anti-Nuke**: Possible nuke detected in guild \`${guild.name}\`. Multiple \`${e.type}\` events in a short window. Actor: \`<@${e.actorId || 'unknown'}\`.`,
          })
          .catch(() => {});
      }
    }
  }

  async shutdown(): Promise<void> {
    // no-op
  }
}

export const antiNuke = new AntiNukeModule();
