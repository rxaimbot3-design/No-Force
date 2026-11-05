# Tong Ghor — Implementation Roadmap

## Phase 0 — Foundation (this session)
- Project scaffolding: package.json, tsconfig, ESLint, Prettier, vitest, Dockerfile, docker-compose, .env.example.
- Core framework: config loader, logger (pino), PostgreSQL client (`pg`), Redis client (`ioredis`), types.
- Security: zero-trust authorization service, secret redaction, hash-chained audit service.
- Database: migration runner + schema.sql applied at startup.

## Phase 1 — Core Platform
- Discord.js client with sharding support, intents, slash-command registry.
- Event router dispatching gateway events to modules.
- Health HTTP server (`/health`).
- Bot bootstrap: root identity from env, guild config upsert on `guildCreate`.

## Phase 2 — Security Modules
- Anti-Raid: sliding-window join tracking, lockdown, whitelist, escalation.
- Anti-Spam: sliding-window message tracking, duplicate/mention detection, action ladder.
- Anti-Nuke: destructive event monitoring, rollback alert, emergency lockdown.
- All three integrated with authorization and audit logging.

## Phase 3 — Moderation & Tickets
- Moderation commands: kick, ban, soft-ban, mute, timeout, warn, clear, slowmode, lock/unlock.
- Moderation cases persisted to PostgreSQL; appeal workflow.
- Ticket module: open/claim/resolve/close, transcripts, CS rating, SLA timers.

## Phase 4 — Engagement
- Welcome & verification: welcome embed, verification gate, role assignment, attempt lockout.
- Leveling: XP grant (cooldown, anti-farm), level computation, role rewards.
- Optional economy: balance, daily claim, transfer, leaderboard.

## Phase 5 — Automation & Monitoring
- Event-driven automation rule engine (trigger → conditions → actions).
- Server health monitoring: gateway/REST/DB/Redis latency, shard health, alerts.
- Automation rules stored in PostgreSQL; evaluated asynchronously.

## Phase 6 — Testing & Hardening
- Security tests: authorization bypass attempts, default-deny, secret redaction, rate-limit accuracy.
- Functional tests: each module against mocked Discord + test database.
- Load tests: synthetic event flood, rate-limit throughput, authorization latency.
- Lint + typecheck clean; load targets met.

## Phase 7 — Documentation & Deployment
- Deployment guide (Docker, systemd, env reference).
- Operations runbook (migrations, backups, degraded mode, incident response).
- User-facing command reference.

## Exit Criteria per Phase
- All planned modules implemented with unit tests.
- Lint, typecheck, and test suite pass.
- No placeholder or TODO implementations in shipped code.
- Security properties (default-deny, audit, root immutability) verified by tests.
