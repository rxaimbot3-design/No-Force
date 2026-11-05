export type Snowflake = string;

export interface GuildConfig {
  guild_id: string;
  prefix?: string;
  language?: string;
  mod_log_channel?: string | null;
  audit_channel?: string | null;
  welcome_channel?: string | null;
  verification_channel?: string | null;
  ticket_category?: string | null;
  muted_role?: string | null;
  admin_role?: string | null;
  mod_role?: string | null;
  trusted_role?: string | null;
  welcome_message?: string | null;
  welcome_embed_title?: string | null;
  welcome_embed_color?: string | null;
  welcome_assign_role?: string | null;
  anti_raid_enabled?: boolean;
  anti_raid_threshold?: number;
  anti_raid_window_sec?: number;
  anti_spam_enabled?: boolean;
  anti_spam_threshold?: number;
  anti_spam_window_sec?: number;
  anti_nuke_enabled?: boolean;
  leveling_enabled?: boolean;
  economy_enabled?: boolean;
  verification_enabled?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export type PermissionAction = string;

export interface PermissionOverride {
  id?: string;
  guild_id: string;
  target_type: 'user' | 'role';
  target_id: string;
  action: PermissionAction;
  allowed: boolean;
}

export interface AuthDecision {
  allowed: boolean;
  reason: string;
  source: 'root' | 'user_override' | 'role_grant' | 'role_deny' | 'default';
}

export interface AuditRecord {
  guild_id: string;
  actor_id: string;
  action: string;
  target_id?: string | null;
  target_type?: string | null;
  result: 'ALLOWED' | 'DENIED' | 'ERROR';
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface Module {
  name: string;
  initialize?(client: unknown, services: Services): Promise<void> | void;
  handleEvent?(event: unknown): Promise<void> | void;
  registerCommands?(registry: CommandRegistry): void;
  shutdown?(): Promise<void> | void;
}

export interface Services {
  db: DatabaseClient;
  redis: RedisClient;
  logger: Logger;
  auth: AuthorizationService;
  audit: AuditService;
  config: ConfigService;
}

export interface CommandRegistry {
  register(command: SlashCommand): void;
}

export interface SlashCommand {
  name: string;
  description: string;
  handler: (interaction: unknown) => Promise<void> | void;
}

export interface DatabaseClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>;
  execute(sql: string, params?: unknown[]): Promise<{ rowCount: number }>;
  transaction<T>(fn: (client: DatabaseClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<number>;
  eval(script: string, keys: string[], args: unknown[]): Promise<unknown>;
  ping(): Promise<string>;
  close(): Promise<void>;
}

export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
  child(bindings: Record<string, unknown>): Logger;
}

export interface AuthorizationService {
  can(
    guildId: string,
    userId: string,
    action: PermissionAction,
    roles?: string[]
  ): Promise<AuthDecision>;
  middleware(action: PermissionAction): (handler: unknown) => unknown;
}

export interface AuditService {
  record(record: AuditRecord): Promise<void>;
}

export interface ConfigService {
  get(guildId: string): Promise<GuildConfig | null>;
  set(guildId: string, patch: Partial<GuildConfig>): Promise<void>;
}

export interface ShutdownSignal {
  signal: NodeJS.Signals;
}
