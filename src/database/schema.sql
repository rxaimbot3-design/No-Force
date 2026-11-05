-- Tong Ghor database schema (PostgreSQL)
-- Applied at startup via migration runner.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS guild_configs (
    guild_id        TEXT PRIMARY KEY,
    prefix          TEXT DEFAULT 't!',
    language        TEXT DEFAULT 'en',
    mod_log_channel TEXT,
    audit_channel   TEXT,
    welcome_channel TEXT,
    verification_channel TEXT,
    ticket_category TEXT,
    muted_role      TEXT,
    admin_role      TEXT,
    mod_role        TEXT,
    trusted_role    TEXT,
    anti_raid_enabled      BOOLEAN DEFAULT true,
    anti_raid_threshold    INTEGER DEFAULT 10,
    anti_raid_window_sec   INTEGER DEFAULT 60,
    anti_spam_enabled      BOOLEAN DEFAULT true,
    anti_spam_threshold    INTEGER DEFAULT 5,
    anti_spam_window_sec   INTEGER DEFAULT 10,
    anti_nuke_enabled      BOOLEAN DEFAULT true,
    leveling_enabled       BOOLEAN DEFAULT true,
    economy_enabled        BOOLEAN DEFAULT false,
    verification_enabled   BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    action      TEXT NOT NULL,
    allowed     BOOLEAN NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_permissions_guild_user_action_uk UNIQUE (guild_id, user_id, action)
);

CREATE TABLE IF NOT EXISTS role_permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id    TEXT NOT NULL,
    role_id     TEXT NOT NULL,
    action      TEXT NOT NULL,
    allowed     BOOLEAN NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT role_permissions_guild_role_action_uk UNIQUE (guild_id, role_id, action)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_guild ON user_permissions(guild_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_guild ON role_permissions(guild_id);

CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id    TEXT NOT NULL,
    actor_id    TEXT NOT NULL,
    action      TEXT NOT NULL,
    target_id   TEXT,
    target_type TEXT,
    result      TEXT NOT NULL,
    reason      TEXT,
    metadata    JSONB DEFAULT '{}',
    prev_hash   TEXT,
    hash        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_guild_created ON audit_log(guild_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

CREATE TABLE IF NOT EXISTS moderation_cases (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id      TEXT NOT NULL,
    case_number   INTEGER NOT NULL,
    actor_id      TEXT NOT NULL,
    target_id     TEXT NOT NULL,
    target_type   TEXT NOT NULL,
    action        TEXT NOT NULL,
    reason        TEXT,
    duration_sec  INTEGER,
    expires_at    TIMESTAMPTZ,
    resolved      BOOLEAN DEFAULT false,
    resolved_by   TEXT,
    resolved_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT moderation_cases_guild_case_uk UNIQUE (guild_id, case_number)
);

CREATE INDEX IF NOT EXISTS idx_moderation_cases_guild ON moderation_cases(guild_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_cases_target ON moderation_cases(guild_id, target_id);
CREATE INDEX IF NOT EXISTS idx_moderation_cases_expires ON moderation_cases(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS warnings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    actor_id    TEXT NOT NULL,
    reason      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warnings_guild_user ON warnings(guild_id, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tickets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id        TEXT NOT NULL,
    channel_id      TEXT NOT NULL,
    creator_id      TEXT NOT NULL,
    assignee_id     TEXT,
    status          TEXT NOT NULL DEFAULT 'open',
    subject         TEXT,
    transcript_url  TEXT,
    cs_rating       INTEGER,
    cs_feedback     TEXT,
    opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    claimed_at      TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ,
    sla_breach_at   TIMESTAMPTZ,
    CONSTRAINT tickets_channel_uk UNIQUE (guild_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_tickets_guild_status ON tickets(guild_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_creator ON tickets(guild_id, creator_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(guild_id, assignee_id);

CREATE TABLE IF NOT EXISTS user_levels (
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    xp          BIGINT NOT NULL DEFAULT 0,
    level       INTEGER NOT NULL DEFAULT 0,
    messages    BIGINT NOT NULL DEFAULT 0,
    last_xp_at  TIMESTAMPTZ,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_levels_guild_xp ON user_levels(guild_id, xp DESC);

CREATE TABLE IF NOT EXISTS level_rewards (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id    TEXT NOT NULL,
    level       INTEGER NOT NULL,
    role_id     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT level_rewards_guild_level_uk UNIQUE (guild_id, level)
);

CREATE TABLE IF NOT EXISTS economy_balances (
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    balance     BIGINT NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS economy_transactions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id    TEXT NOT NULL,
    from_user   TEXT,
    to_user     TEXT,
    amount      BIGINT NOT NULL,
    type        TEXT NOT NULL,
    reason      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_economy_transactions_guild ON economy_transactions(guild_id, created_at DESC);

CREATE TABLE IF NOT EXISTS verification_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    attempts    INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    challenge   TEXT,
    verified_at TIMESTAMPTZ,
    locked_until TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT verification_sessions_guild_user_uk UNIQUE (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS automation_rules (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id    TEXT NOT NULL,
    name        TEXT NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    trigger     TEXT NOT NULL,
    conditions  JSONB NOT NULL DEFAULT '{}',
    actions     JSONB NOT NULL DEFAULT '[]',
    created_by  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_guild ON automation_rules(guild_id);

CREATE TABLE IF NOT EXISTS welcome_configs (
    guild_id        TEXT PRIMARY KEY,
    enabled         BOOLEAN NOT NULL DEFAULT true,
    channel_id      TEXT,
    message         TEXT,
    embed_title     TEXT,
    embed_color     TEXT DEFAULT '#000000',
    assign_role     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
