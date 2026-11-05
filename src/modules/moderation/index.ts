import { BaseModule } from '../base';
import { Services } from '../../types';
import { audit } from '../../security/audit';
import { authorization } from '../../security/authorization';
import { configService } from '../../config/service';
import { db } from '../../database/client';
import { randomUUID } from 'crypto';

interface ModerationAction {
  type:
    | 'kick'
    | 'ban'
    | 'softban'
    | 'mute'
    | 'unmute'
    | 'timeout'
    | 'removetimeout'
    | 'warn'
    | 'clear'
    | 'lock'
    | 'unlock'
    | 'slowmode';
  guildId: string;
  actorId: string;
  targetId: string;
  reason?: string;
  durationSec?: number;
}

export class ModerationModule extends BaseModule {
  private client: any;
  private caseCounters = new Map<string, number>();
  constructor() {
    super('moderation');
  }

  async initialize(client: any, _services: Services): Promise<void> {
    this.client = client;
  }

  registerCommands(registry: {
    register: (cmd: {
      name: string;
      description: string;
      handler: (ctx: any) => Promise<void>;
    }) => void;
  }): void {
    registry.register({
      name: 'kick',
      description: 'Tong Ghor: kick a member',
      handler: async (ctx) => this.cmdKickBan(ctx, 'kick'),
    });
    registry.register({
      name: 'ban',
      description: 'Tong Ghor: ban a member',
      handler: async (ctx) => this.cmdKickBan(ctx, 'ban'),
    });
    registry.register({
      name: 'mute',
      description: 'Tong Ghor: mute a member',
      handler: async (ctx) => this.cmdMute(ctx),
    });
    registry.register({
      name: 'timeout',
      description: 'Tong Ghor: timeout a member',
      handler: async (ctx) => this.cmdTimeout(ctx),
    });
    registry.register({
      name: 'warn',
      description: 'Tong Ghor: warn a member',
      handler: async (ctx) => this.cmdWarn(ctx),
    });
    registry.register({
      name: 'clear',
      description: 'Tong Ghor: clear messages',
      handler: async (ctx) => this.cmdClear(ctx),
    });
  }

  private async cmdKickBan(ctx: any, type: 'kick' | 'ban'): Promise<void> {
    const { interaction, guildId, userId } = ctx;
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    if (!target) return;
    const result = await moderation.execute({
      type,
      guildId: guildId!,
      actorId: userId,
      targetId: target.id,
      reason,
    });
    await interaction.reply(
      result.ok
        ? { content: `Tong Ghor: ${type} completed for <@${target.id}>.`, ephemeral: true }
        : { content: `Tong Ghor: ${result.error}`, ephemeral: true }
    );
  }

  private async cmdMute(ctx: any): Promise<void> {
    const { interaction, guildId, userId } = ctx;
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    if (!target) return;
    const result = await moderation.execute({
      type: 'mute',
      guildId: guildId!,
      actorId: userId,
      targetId: target.id,
      reason,
    });
    await interaction.reply(
      result.ok
        ? { content: `Tong Ghor: muted <@${target.id}>.`, ephemeral: true }
        : { content: `Tong Ghor: ${result.error}`, ephemeral: true }
    );
  }

  private async cmdTimeout(ctx: any): Promise<void> {
    const { interaction, guildId, userId } = ctx;
    const target = interaction.options.getUser('user');
    const duration = interaction.options.getInteger('duration') || 60;
    const reason = interaction.options.getString('reason') || 'No reason provided';
    if (!target) return;
    const result = await moderation.execute({
      type: 'timeout',
      guildId: guildId!,
      actorId: userId,
      targetId: target.id,
      reason,
      durationSec: duration,
    });
    await interaction.reply(
      result.ok
        ? { content: `Tong Ghor: timed out <@${target.id}> for ${duration}s.`, ephemeral: true }
        : { content: `Tong Ghor: ${result.error}`, ephemeral: true }
    );
  }

  private async cmdWarn(ctx: any): Promise<void> {
    const { interaction, guildId, userId } = ctx;
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    if (!target) return;
    const result = await moderation.execute({
      type: 'warn',
      guildId: guildId!,
      actorId: userId,
      targetId: target.id,
      reason,
    });
    await interaction.reply(
      result.ok
        ? { content: `Tong Ghor: warned <@${target.id}>.`, ephemeral: true }
        : { content: `Tong Ghor: ${result.error}`, ephemeral: true }
    );
  }

  private async cmdClear(ctx: any): Promise<void> {
    const { interaction, guildId, userId } = ctx;
    const result = await moderation.execute({
      type: 'clear',
      guildId: guildId!,
      actorId: userId,
      targetId: interaction.channelId,
      reason: 'message purge',
    });
    await interaction.reply(
      result.ok
        ? { content: `Tong Ghor: cleared messages.`, ephemeral: true }
        : { content: `Tong Ghor: ${result.error}`, ephemeral: true }
    );
  }

  async handleEvent(_event: unknown): Promise<void> {
    // Moderation is command-driven; no gateway events to handle by default
  }

  async execute(
    action: ModerationAction
  ): Promise<{ ok: boolean; caseId?: string; error?: string }> {
    const { guildId, actorId, targetId, type, reason, durationSec } = action;

    // Authorization check
    const actionMap: Record<string, string> = {
      kick: 'tg:moderation:kick',
      ban: 'tg:moderation:ban',
      softban: 'tg:moderation:softban',
      mute: 'tg:moderation:mute',
      unmute: 'tg:moderation:mute',
      timeout: 'tg:moderation:timeout',
      removetimeout: 'tg:moderation:timeout',
      warn: 'tg:moderation:warn',
      clear: 'tg:moderation:clear',
      lock: 'tg:moderation:clear',
      unlock: 'tg:moderation:clear',
      slowmode: 'tg:moderation:clear',
    };

    const member = await this.getMember(guildId, actorId);
    const roles = member?.roles?.cache?.map((r: any) => r.id) ?? [];
    const required = actionMap[type] ?? 'tg:moderation:clear';

    const decision = await authorization.can(guildId, actorId, required, roles);

    if (!decision.allowed) {
      await audit.record({
        guild_id: guildId,
        actor_id: actorId,
        action: `tg:moderation:${type}`,
        target_id: targetId,
        target_type: 'user',
        result: 'DENIED',
        reason: decision.reason,
        metadata: { module: 'moderation' },
      });
      return { ok: false, error: `authorization denied: ${decision.reason}` };
    }

    let caseId: string | undefined;
    let expiresAt: Date | null = null;

    try {
      const guild = this.client.guilds?.cache?.get(guildId);
      const target = guild?.members?.cache?.get(targetId);
      const mutedRole = await this.getMutedRole(guildId);

      switch (type) {
        case 'kick':
          await target?.kick(reason);
          break;
        case 'ban':
          await guild?.members.ban(targetId, { reason });
          break;
        case 'softban':
          await guild?.members.ban(targetId, { reason });
          await guild?.members.unban(targetId, reason);
          break;
        case 'mute':
          if (target && mutedRole) await target.roles.add(mutedRole, reason);
          break;
        case 'unmute':
          if (target && mutedRole) await target.roles.remove(mutedRole, reason);
          break;
        case 'timeout':
          if (target && durationSec) {
            await target.timeout(durationSec * 1000, reason);
            expiresAt = new Date(Date.now() + durationSec * 1000);
          }
          break;
        case 'removetimeout':
          if (target) await target.timeout(null, reason);
          break;
        case 'warn':
          // no discord action, record only
          break;
        case 'clear':
        case 'lock':
        case 'unlock':
        case 'slowmode':
          // channel-level actions handled by command layer passing channel context
          break;
      }

      caseId = await this.recordCase(
        guildId,
        actorId,
        targetId,
        type,
        reason,
        durationSec,
        expiresAt
      );

      await audit.record({
        guild_id: guildId,
        actor_id: actorId,
        action: `tg:moderation:${type}`,
        target_id: targetId,
        target_type: 'user',
        result: 'ALLOWED',
        reason,
        metadata: { module: 'moderation', caseId, durationSec },
      });

      return { ok: true, caseId };
    } catch (err) {
      await audit.record({
        guild_id: guildId,
        actor_id: actorId,
        action: `tg:moderation:${type}`,
        target_id: targetId,
        target_type: 'user',
        result: 'ERROR',
        reason: err instanceof Error ? err.message : String(err),
        metadata: { module: 'moderation' },
      });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async recordCase(
    guildId: string,
    actorId: string,
    targetId: string,
    type: string,
    reason: string | undefined,
    durationSec: number | undefined,
    expiresAt: Date | null
  ): Promise<string> {
    const counter = (this.caseCounters.get(guildId) ?? 0) + 1;
    this.caseCounters.set(guildId, counter);
    const id = randomUUID();
    await db.execute(
      `INSERT INTO moderation_cases (id, guild_id, case_number, actor_id, target_id, target_type, action, reason, duration_sec, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 'user', $6, $7, $8, $9, now())`,
      [
        id,
        guildId,
        counter,
        actorId,
        targetId,
        type,
        reason ?? null,
        durationSec ?? null,
        expiresAt ?? null,
      ]
    );
    return id;
  }

  private async getMember(guildId: string, userId: string): Promise<any> {
    const guild = this.client?.guilds?.cache?.get(guildId);
    return guild?.members?.cache?.get(userId);
  }

  private async getMutedRole(guildId: string): Promise<any> {
    const config = await configService.get(guildId);
    if (!config?.muted_role) return null;
    const guild = this.client.guilds?.cache?.get(guildId);
    return guild?.roles?.cache?.get(config.muted_role);
  }
}

export const moderation = new ModerationModule();
