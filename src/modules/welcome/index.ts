import { BaseModule } from '../base';
import { Services } from '../../types';
import { audit } from '../../security/audit';
import { configService } from '../../config/service';

interface WelcomeEvent {
  type: 'guildMemberAdd';
  guildId: string;
  userId: string;
}

export class WelcomeModule extends BaseModule {
  private client: any;

  constructor() {
    super('welcome');
  }

  async initialize(client: any, _services: Services): Promise<void> {
    this.client = client;
  }

  async handleEvent(event: unknown): Promise<void> {
    const e = event as WelcomeEvent;
    if (e.type !== 'guildMemberAdd') return;

    const config = await configService.get(e.guildId);
    if (!config?.welcome_channel) return;

    const guild = this.client.guilds?.cache?.get(e.guildId);
    const channel = guild?.channels?.cache?.get(config.welcome_channel);
    if (!channel?.isText()) return;

    const member = guild?.members?.cache?.get(e.userId);
    const content = config.welcome_message || `Welcome to the server, <@${e.userId}>!`;

    await channel
      .send({
        content,
        embeds: config.welcome_embed_title
          ? [
              {
                title: config.welcome_embed_title,
                description: content,
                color: config.welcome_embed_color
                  ? parseInt(config.welcome_embed_color.replace('#', ''), 16)
                  : 0,
              },
            ]
          : undefined,
      })
      .catch(() => {});

    if (config.welcome_assign_role && member) {
      const role = guild?.roles?.cache?.get(config.welcome_assign_role);
      if (role) await member.roles.add(role, 'Tong Ghor welcome: role assigned').catch(() => {});
    }

    await audit.record({
      guild_id: e.guildId,
      actor_id: 'tong-ghor:system',
      action: 'tg:welcome:send',
      target_id: e.userId,
      target_type: 'user',
      result: 'ALLOWED',
      reason: 'welcome message sent',
    });
  }

  async shutdown(): Promise<void> {
    // no-op
  }
}

export const welcome = new WelcomeModule();
