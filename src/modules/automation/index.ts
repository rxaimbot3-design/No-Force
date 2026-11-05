import { BaseModule } from '../base';
import { Services } from '../../types';
import { audit } from '../../security/audit';
import { logger } from '../../logger';
import { configService } from '../../config/service';
import { db } from '../../database/client';

interface AutomationEvent {
  type: string;
  guildId: string;
  userId?: string;
  payload: Record<string, unknown>;
}

export class AutomationModule extends BaseModule {
  private client: any;

  constructor() {
    super('automation');
  }

  async initialize(client: any, _services: Services): Promise<void> {
    this.client = client;
  }

  async handleEvent(event: unknown): Promise<void> {
    const e = event as AutomationEvent;
    const rules = await configService.get(e.guildId);
    if (!rules) return;

    // Load rules from DB each event (could be cached)
    const dbRules = await db.query<{
      id: string;
      name: string;
      trigger: string;
      conditions: any;
      actions: any[];
    }>(
      `SELECT id, name, trigger, conditions, actions FROM automation_rules WHERE guild_id = $1 AND enabled = true`,
      [e.guildId]
    );

    for (const rule of dbRules) {
      if (rule.trigger !== e.type) continue;
      if (!this.matchConditions(rule.conditions, e.payload)) continue;
      await this.executeActions(rule.actions, e);
      await audit.record({
        guild_id: e.guildId,
        actor_id: 'tong-ghor:system',
        action: 'tg:automation:executed',
        target_id: rule.id,
        target_type: 'rule',
        result: 'ALLOWED',
        reason: `executed rule ${rule.name}`,
        metadata: { module: 'automation', rule: rule.name, trigger: e.type },
      });
    }
  }

  private matchConditions(conditions: any, payload: Record<string, unknown>): boolean {
    if (!conditions || Object.keys(conditions).length === 0) return true;
    for (const [key, expected] of Object.entries(conditions)) {
      if (payload[key] !== expected) return false;
    }
    return true;
  }

  private async executeActions(actions: any[], e: AutomationEvent): Promise<void> {
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'send_message': {
            const guild = this.client.guilds?.cache?.get(e.guildId);
            const channel = guild?.channels?.cache?.get(action.channelId);
            if (channel?.isText())
              await channel.send(action.content || 'Tong Ghor automation').catch(() => {});
            break;
          }
          case 'add_role': {
            const guild = this.client.guilds?.cache?.get(e.guildId);
            const member = e.userId ? guild?.members?.cache?.get(e.userId) : undefined;
            const role = guild?.roles?.cache?.get(action.roleId);
            if (member && role)
              await member.roles.add(role, `Tong Ghor automation: ${action.type}`).catch(() => {});
            break;
          }
          case 'remove_role': {
            const guild = this.client.guilds?.cache?.get(e.guildId);
            const member = e.userId ? guild?.members?.cache?.get(e.userId) : undefined;
            const role = guild?.roles?.cache?.get(action.roleId);
            if (member && role)
              await member.roles
                .remove(role, `Tong Ghor automation: ${action.type}`)
                .catch(() => {});
            break;
          }
        }
      } catch (err) {
        logger.error({ err, action }, 'tong-ghor: automation action failed');
      }
    }
  }

  async shutdown(): Promise<void> {
    // no-op
  }
}

export const automation = new AutomationModule();
