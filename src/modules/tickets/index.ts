import { BaseModule } from '../base';
import { Services } from '../../types';
import { audit } from '../../security/audit';
import { authorization } from '../../security/authorization';
import { configService } from '../../config/service';
import { db } from '../../database/client';
import { randomUUID } from 'crypto';

interface TicketCommand {
  type: 'open' | 'claim' | 'resolve' | 'close' | 'transcript';
  guildId: string;
  actorId: string;
  channelId?: string;
  subject?: string;
  transcriptUrl?: string;
  csRating?: number;
  csFeedback?: string;
}

export class TicketsModule extends BaseModule {
  constructor() {
    super('tickets');
  }

  async initialize(_client: any, _services: Services): Promise<void> {
    // no-op
  }

  async handleEvent(_event: unknown): Promise<void> {
    // Ticket lifecycle is command-driven
  }

  async execute(cmd: TicketCommand): Promise<{ ok: boolean; ticketId?: string; error?: string }> {
    switch (cmd.type) {
      case 'open':
        return this.openTicket(cmd.guildId, cmd.actorId, cmd.subject, cmd.channelId);
      case 'claim':
        return this.claimTicket(cmd.guildId, cmd.channelId!, cmd.actorId);
      case 'resolve':
        return this.resolveTicket(cmd.guildId, cmd.channelId!, cmd.actorId);
      case 'close':
        return this.closeTicket(
          cmd.guildId,
          cmd.channelId!,
          cmd.actorId,
          cmd.transcriptUrl,
          cmd.csRating,
          cmd.csFeedback
        );
      case 'transcript':
        return this.getTranscript(cmd.guildId, cmd.channelId!);
    }
  }

  private async openTicket(
    guildId: string,
    creatorId: string,
    subject: string | undefined,
    channelId: string | undefined
  ): Promise<{ ok: boolean; ticketId?: string; error?: string }> {
    const config = await configService.get(guildId);
    if (!config?.ticket_category) {
      return { ok: false, error: 'ticket category not configured' };
    }

    const memberAuth = await authorization.can(guildId, creatorId, 'tg:ticket:open');
    if (!memberAuth.allowed) {
      await audit.record({
        guild_id: guildId,
        actor_id: creatorId,
        action: 'tg:ticket:open',
        target_id: creatorId,
        target_type: 'user',
        result: 'DENIED',
        reason: memberAuth.reason,
      });
      return { ok: false, error: 'authorization denied' };
    }

    const id = randomUUID();
    await db.execute(
      `INSERT INTO tickets (id, guild_id, channel_id, creator_id, status, subject, opened_at) VALUES ($1,$2,$3,$4,'open',$5,now())`,
      [id, guildId, channelId ?? null, creatorId, subject ?? null]
    );

    await audit.record({
      guild_id: guildId,
      actor_id: creatorId,
      action: 'tg:ticket:open',
      target_id: id,
      target_type: 'ticket',
      result: 'ALLOWED',
      reason: subject,
    });
    return { ok: true, ticketId: id };
  }

  private async claimTicket(
    guildId: string,
    channelId: string,
    assigneeId: string
  ): Promise<{ ok: boolean; ticketId?: string; error?: string }> {
    const auth = await authorization.can(guildId, assigneeId, 'tg:ticket:claim');
    if (!auth.allowed) {
      await audit.record({
        guild_id: guildId,
        actor_id: assigneeId,
        action: 'tg:ticket:claim',
        target_id: channelId,
        target_type: 'channel',
        result: 'DENIED',
        reason: auth.reason,
      });
      return { ok: false, error: 'authorization denied' };
    }

    const row = await db.queryOne<{ id: string; status: string }>(
      `SELECT id, status FROM tickets WHERE guild_id = $1 AND channel_id = $2`,
      [guildId, channelId]
    );
    if (!row) return { ok: false, error: 'ticket not found' };
    if (row.status !== 'open') return { ok: false, error: 'ticket not open' };

    await db.execute(
      `UPDATE tickets SET assignee_id = $1, status = 'claimed', claimed_at = now() WHERE id = $2`,
      [assigneeId, row.id]
    );
    await audit.record({
      guild_id: guildId,
      actor_id: assigneeId,
      action: 'tg:ticket:claim',
      target_id: row.id,
      target_type: 'ticket',
      result: 'ALLOWED',
    });
    return { ok: true, ticketId: row.id };
  }

  private async resolveTicket(
    guildId: string,
    channelId: string,
    actorId: string
  ): Promise<{ ok: boolean; ticketId?: string; error?: string }> {
    const auth = await authorization.can(guildId, actorId, 'tg:ticket:close');
    if (!auth.allowed) {
      await audit.record({
        guild_id: guildId,
        actor_id: actorId,
        action: 'tg:ticket:resolve',
        target_id: channelId,
        target_type: 'channel',
        result: 'DENIED',
        reason: auth.reason,
      });
      return { ok: false, error: 'authorization denied' };
    }

    const row = await db.queryOne<{ id: string; status: string }>(
      `SELECT id, status FROM tickets WHERE guild_id = $1 AND channel_id = $2`,
      [guildId, channelId]
    );
    if (!row) return { ok: false, error: 'ticket not found' };

    await db.execute(`UPDATE tickets SET status = 'resolved', resolved_at = now() WHERE id = $1`, [
      row.id,
    ]);
    await audit.record({
      guild_id: guildId,
      actor_id: actorId,
      action: 'tg:ticket:resolve',
      target_id: row.id,
      target_type: 'ticket',
      result: 'ALLOWED',
    });
    return { ok: true, ticketId: row.id };
  }

  private async closeTicket(
    guildId: string,
    channelId: string,
    actorId: string,
    transcriptUrl: string | undefined,
    csRating: number | undefined,
    csFeedback: string | undefined
  ): Promise<{ ok: boolean; ticketId?: string; error?: string }> {
    const auth = await authorization.can(guildId, actorId, 'tg:ticket:close');
    if (!auth.allowed) {
      await audit.record({
        guild_id: guildId,
        actor_id: actorId,
        action: 'tg:ticket:close',
        target_id: channelId,
        target_type: 'channel',
        result: 'DENIED',
        reason: auth.reason,
      });
      return { ok: false, error: 'authorization denied' };
    }

    const row = await db.queryOne<{ id: string; status: string }>(
      `SELECT id, status FROM tickets WHERE guild_id = $1 AND channel_id = $2`,
      [guildId, channelId]
    );
    if (!row) return { ok: false, error: 'ticket not found' };

    await db.execute(
      `UPDATE tickets SET status = 'closed', closed_at = now(), transcript_url = $1, cs_rating = $2, cs_feedback = $3 WHERE id = $4`,
      [transcriptUrl ?? null, csRating ?? null, csFeedback ?? null, row.id]
    );
    await audit.record({
      guild_id: guildId,
      actor_id: actorId,
      action: 'tg:ticket:close',
      target_id: row.id,
      target_type: 'ticket',
      result: 'ALLOWED',
    });
    return { ok: true, ticketId: row.id };
  }

  private async getTranscript(
    guildId: string,
    channelId: string
  ): Promise<{ ok: boolean; ticketId?: string; error?: string; transcriptUrl?: string }> {
    const row = await db.queryOne<{ id: string; transcript_url: string | null }>(
      `SELECT id, transcript_url FROM tickets WHERE guild_id = $1 AND channel_id = $2`,
      [guildId, channelId]
    );
    if (!row) return { ok: false, error: 'ticket not found' };
    return { ok: true, ticketId: row.id, transcriptUrl: row.transcript_url ?? undefined };
  }

  async shutdown(): Promise<void> {
    // no-op
  }
}

export const tickets = new TicketsModule();
