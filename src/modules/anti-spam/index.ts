import { BaseModule } from '../base';
import { Services } from '../../types';
import { checkRateLimit } from '../../utils/rate-limit';
import { audit } from '../../security/audit';
import { logger } from '../../logger';
import { configService } from '../../config/service';

interface MessageEvent {
  type: 'messageCreate';
  guildId: string;
  channelId: string;
  userId: string;
  memberRoles: string[];
  content: string;
  authorBot: boolean;
  authorWebhook: boolean;
}

export class AntiSpamModule extends BaseModule {
  private client: any;

  constructor() {
    super('anti-spam');
  }

  async initialize(client: any, _services: Services): Promise<void> {
    this.client = client;
  }

  async handleEvent(event: unknown): Promise<void> {
    const e = event as MessageEvent;
    if (e.type !== 'messageCreate') return;
    if (e.authorBot || e.authorWebhook) return;

    const config = await configService.get(e.guildId);
    if (!config || !config.anti_spam_enabled) return;

    // Trusted role bypass
    if (config.trusted_role && e.memberRoles.includes(config.trusted_role)) return;

    const key = `tg:spam:${e.guildId}:${e.userId}`;
    const result = await checkRateLimit(key, {
      windowSeconds: config.anti_spam_window_sec || 10,
      maxHits: config.anti_spam_threshold || 5,
    });

    if (!result.allowed) {
      await this.handleSpam(e, config);
    }
  }

  private async handleSpam(e: MessageEvent, config: any): Promise<void> {
    const log = logger.child({ component: 'anti-spam', guildId: e.guildId, userId: e.userId });
    log.warn('spam threshold exceeded');

    await audit.record({
      guild_id: e.guildId,
      actor_id: 'tong-ghor:system',
      action: 'tg:antiSpam:triggered',
      target_id: e.userId,
      target_type: 'user',
      result: 'ALLOWED',
      reason: 'spam threshold exceeded',
      metadata: { module: 'anti-spam', channelId: e.channelId },
    });

    const guild = this.client.guilds?.cache?.get(e.guildId);
    if (!guild) return;

    const member = guild.members?.cache?.get(e.userId);
    const mutedRole = config.muted_role ? guild.roles?.cache?.get(config.muted_role) : null;

    // Delete the offending message if we can (handled by caller passing message ref)
    // Apply muted role if configured
    if (member && mutedRole) {
      await member.roles
        .add(mutedRole, 'Tong Ghor anti-spam: spam threshold exceeded')
        .catch(() => {});
    }

    if (config.mod_log_channel) {
      const channel = guild.channels?.cache?.get(config.mod_log_channel);
      if (channel?.isText()) {
        await channel
          .send({
            content: `**Tong Ghor Anti-Spam**: User \`<@${e.userId}>\` exceeded the spam threshold in <#${e.channelId}> and was muted.`,
          })
          .catch(() => {});
      }
    }
  }

  async shutdown(): Promise<void> {
    // no-op
  }
}

export const antiSpam = new AntiSpamModule();
