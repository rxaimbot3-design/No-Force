import { Client, GatewayIntentBits, Routes } from 'discord.js';
import { REST } from '@discordjs/rest';
import { config } from '../config';
import { childLogger } from '../logger';
import { eventRouter } from '../events/router';
import { configService } from '../config/service';
import { db } from '../database/client';
import { redisClient } from '../redis/client';
import { authorization } from '../security/authorization';
import { audit } from '../security/audit';
import { antiRaid } from '../modules/anti-raid';
import { antiSpam } from '../modules/anti-spam';
import { antiNuke } from '../modules/anti-nuke';
import { moderation } from '../modules/moderation';
import { tickets } from '../modules/tickets';
import { leveling } from '../modules/leveling';
import { economy } from '../modules/economy';
import { verification } from '../modules/verification';
import { welcome } from '../modules/welcome';
import { automation } from '../modules/automation';
import { monitoring } from '../modules/monitoring';
import type { Module, Services } from '../types';

const log = childLogger({ component: 'discord' });

const modules: Module[] = [
  antiRaid,
  antiSpam,
  antiNuke,
  moderation,
  tickets,
  leveling,
  economy,
  verification,
  welcome,
  automation,
  monitoring,
];

const services: Services = {
  db,
  redis: redisClient,
  logger: log,
  auth: authorization,
  audit,
  config: configService,
};

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.GuildModeration,
];

export class TongGhorClient {
  public client: Client;
  private rest: REST;

  constructor() {
    this.client = new Client({
      intents,
      shardCount: config.shardCount === 'auto' ? undefined : Number(config.shardCount) || undefined,
    });
    this.rest = new REST({ version: '10' }).setToken(config.discord.token);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('debug', (info) => log.debug({ info }, 'tong-ghor: discord debug'));
    this.client.on('error', (err) => log.error({ err }, 'tong-ghor: discord client error'));
    this.client.on('warn', (info) => log.warn({ info }, 'tong-ghor: discord warn'));
    this.client.on('shardError', (err, id) =>
      log.error({ err, shardId: id }, 'tong-ghor: shard error')
    );

    this.client.on('ready', async () => {
      log.info(
        { user: this.client.user?.tag, shards: this.client.ws?.shards.size },
        'tong-ghor: discord ready'
      );
      await this.registerCommands();
      for (const mod of modules) {
        try {
          await mod.initialize!(this.client, services);
        } catch (err) {
          log.error({ err, module: mod.name }, 'tong-ghor: module initialize failed');
        }
      }
    });
    this.client.on('guildCreate', async (guild) => {
      await configService.ensure(guild.id);
      log.info({ guildId: guild.id, name: guild.name }, 'tong-ghor: joined guild');
    });

    this.client.on('guildMemberAdd', (member) => {
      void eventRouter.emitEvent({
        type: 'guildMemberAdd',
        guildId: member.guild.id,
        payload: { userId: member.id },
      });
    });

    this.client.on('messageCreate', (message) => {
      if (!message.guild || message.author.bot || message.webhookId) return;
      void eventRouter.emitEvent({
        type: 'messageCreate',
        guildId: message.guild.id,
        payload: {
          channelId: message.channel.id,
          userId: message.author.id,
          memberRoles: message.member?.roles.cache.map((r) => r.id) ?? [],
          contentLength: message.content.length,
          authorBot: message.author.bot,
          authorWebhook: !!message.webhookId,
        },
      });
    });

    this.client.on('channelDelete', (channel) => {
      const guild = (channel as any).guild;
      if (!guild) return;
      void eventRouter.emitEvent({
        type: 'channelDelete',
        guildId: guild.id,
        payload: { actorId: undefined, targetId: channel.id },
      });
    });

    this.client.on('roleDelete', (role) => {
      const guild = (role as any).guild;
      if (!guild) return;
      void eventRouter.emitEvent({
        type: 'roleDelete',
        guildId: guild.id,
        payload: { actorId: undefined, targetId: role.id },
      });
    });

    this.client.on('guildBanAdd', (ban) => {
      void eventRouter.emitEvent({
        type: 'guildBanAdd',
        guildId: ban.guild.id,
        payload: { actorId: undefined, targetId: ban.user.id },
      });
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isCommand()) return;
      await this.handleCommand(interaction);
    });
  }

  private async registerCommands(): Promise<void> {
    const commands: any[] = [];
    const registry = {
      register: (cmd: {
        name: string;
        description: string;
        handler: (ctx: any) => Promise<void>;
      }) => {
        commands.push({ name: cmd.name, description: cmd.description });
        registerCommand(cmd.name, cmd.handler);
      },
    };

    for (const mod of modules) {
      if (!mod.registerCommands) continue;
      mod.registerCommands!(registry);
    }

    try {
      await this.rest.put(Routes.applicationCommands(config.discord.clientId), { body: commands });
      log.info({ count: commands.length }, 'tong-ghor: global commands registered');
    } catch (err) {
      log.error({ err }, 'tong-ghor: command registration failed');
    }
  }

  private async handleCommand(interaction: any): Promise<void> {
    const { commandName } = interaction;
    const guildId = interaction.guild?.id ?? null;
    const userId = interaction.user.id;
    const roles = interaction.member?.roles?.cache?.map((r: any) => r.id) ?? [];

    const handler = commandRegistry.get(commandName);
    if (!handler) {
      await interaction.reply({ content: 'Tong Ghor: unknown command.', ephemeral: true });
      return;
    }
    await handler({ interaction, guildId, userId, roles });
  }

  async login(): Promise<void> {
    await this.client.login(config.discord.token);
  }

  async destroy(): Promise<void> {
    this.client.destroy();
  }
}

const commandRegistry = new Map<string, (ctx: any) => Promise<void>>();

export function registerCommand(name: string, handler: (ctx: any) => Promise<void>): void {
  commandRegistry.set(name, handler);
}

export const tongGhor = new TongGhorClient();
