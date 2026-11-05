# Tong Ghor — Requirements Analysis

## 1. Product Overview

Tong Ghor is a premium, security-first, high-performance Discord Community Management and Protection Platform engineered for very large communities. It is not a basic Discord bot. It is a distributed, event-driven platform that provides anti-raid, anti-spam, anti-nuke protection, advanced moderation, audit logging, welcome/verification systems, professional ticket management, leveling, optional economy, event-driven automation, and server health monitoring.

**Identity:** The brand is "Tong Ghor". The name "AEGIS" must not appear anywhere. All commands, embeds, logs, configuration interfaces, and documentation use "Tong Ghor".

**Target deployment:** Controlled production deployment on Linux with PostgreSQL and Redis, containerized via Docker, written in TypeScript/Node.js using Discord.js.

---

## 2. Goals

| Goal | Description |
|------|-------------|
| Security & bypass resistance | Zero-trust authorization; every action authorized against source-of-truth policy; no client-side trust; bypass-resistant checks enforced server-side. |
| High availability & reliability | Graceful degradation, circuit breakers, retries with backoff, health checks, idempotent operations, crash-only design with supervision. |
| Ultra-low internal latency | Sub-millisecond hot-path decisions using Redis-backed sliding-window rate limiting and in-memory caches; async off-path work via queue. |
| Scalability | Shard-aware Discord.js deployment; horizontal worker scaling; PostgreSQL read replicas; Redis clustering. |
| Maintainability | Typed codebase, strict linting, modular architecture, comprehensive docs, versioned migrations. |

---

## 3. Functional Requirements

### FR-1: Zero-Trust Authorization & Security
- Every moderation/action command requires explicit authorization resolved from a server-side permission matrix (roles + user overrides + guild config).
- No defaults to "allow". Default-deny for all privileged endpoints.
- Authorization decisions are audited (who, what, when, result, reason).
- Bypass-resistant: admin/bypass flags cannot be self-granted; only a root bootstrap identity can seed initial trustees.
- Secrets (bot token, DB credentials, signing keys) never logged; loaded from env at startup only.

### FR-2: Anti-Raid Protection
- Join-rate tracking per guild with sliding-window threshold (configurable).
- Automated actions on raid detection: lockdown channels, require verification, kick/ban joiners within window, notify moderators.
- Whitelist for known/trusted members and roles.
- Cooldown and escalation levels (warn → soft-lock → hard-lock).

### FR-3: Anti-Spam Protection
- Message-rate tracking per user/channel/guild with sliding-window thresholds.
- Duplicate-message and mention-spam detection.
- Link/invite filtering with configurable allowlist.
- Action ladder: delete message → mute → kick → ban.

### FR-4: Anti-Nuke Protection
- Monitor guild-wide destructive events (mass role/channel deletion, mass bans, webhook creation, @everyone spam).
- Threshold-based rollback: auto-undo recent changes where permissions allow, alert root admins, trigger emergency lockdown.

### FR-5: Advanced Moderation
- Commands: kick, ban, soft-ban, mute, timeout, warn, un-warn, clear/purge, slowmode, lock/unlock.
- Reason required for all actions; optional duration for time-bounded actions.
- Moderation cases stored in PostgreSQL with full audit trail.
- Appeal workflow: users can appeal a case; moderators review and resolve.

### FR-6: Audit Logging
- Immutable append-only log of all platform and moderation actions.
- Stored in PostgreSQL; optionally streamed to a configured Discord audit channel.
- Tamper-evident: each record has a sequence hash chain (hash of previous record).

### FR-7: Welcome & Verification
- Configurable welcome message (embed) in a designated channel on member join.
- Verification gate: new members receive a "Unverified" role until they complete a reaction/button-based verification or CAPTCHA-style challenge.
- Auto-assign roles on verification completion.
- Verification attempts tracked; max attempts with lockout.

### FR-8: Professional Ticket Management
- Users open tickets via panel/button in a designated category.
- Each ticket creates a private text channel + transcript.
- Staff claim/assign tickets; status (open → claimed → resolved → closed).
- Transcript saved on close; customer satisfaction rating optional.
- SLA timers with escalation to senior staff.

### FR-9: Leveling & Optional Economy
- XP granted per message (cooldown-protected, anti-farm: ignore bot/webhook, min length, channel exclusions).
- Levels computed server-side; role rewards at configured level thresholds.
- Optional economy: balance, daily claim, transfer (with cooldown), leaderboard.
- All currency changes audited.

### FR-10: Event-Driven Automation
- Rule engine: trigger (event) → conditions → actions.
- Built-in triggers: member join, message, role add/remove, message delete, member ban.
- Built-in actions: send message, add/remove role, timeout, kick, ban, webhook to external URL.
- Rules stored in PostgreSQL; evaluated asynchronously.

### FR-11: Server Health Monitoring
- Periodic checks: Discord gateway latency, REST latency, DB latency, Redis latency, shard health, queue depth.
- Health endpoint (`/health`) for load balancer; metrics exposed for Prometheus (optional).
- Alerts on unhealthy thresholds to a configured channel/webhook.

### FR-12: Configuration & Commands
- Slash commands (Discord.js command registry) with guild-scoped and global registration.
- Per-guild configuration stored in PostgreSQL (prefix, channels, roles, thresholds, enabled modules).
- Hot-reloadable configuration where safe; restart-required changes documented.

---

## 4. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Authorization decision latency (hot path) | < 1 ms (Redis/in-memory cache) |
| Moderation action decision latency | < 50 ms |
| Message processing (anti-spam) per event | < 10 ms p95 |
| Audit log write durability | Synchronous PostgreSQL commit before ACK |
| Availability | 99.9% target; degraded mode when Redis/DB unavailable |
| Concurrency | Support 100k+ members per guild; 1000+ events/sec aggregate |
| Observability | Structured JSON logs, health endpoint, metrics |

---

## 5. Out of Scope (v1)

- Direct DM-based moderation (security risk; limited to guild context).
- Cryptocurrency or real-money economy.
- Mobile/native client apps.
- Public SaaS multi-tenancy beyond per-guild isolation (each guild is a logical tenant).

---

## 6. Constraints

- Language/runtime: TypeScript, Node.js 20+, Discord.js v14.
- Databases: PostgreSQL (primary), Redis (cache/rate-limit/queue).
- No usage of the name "AEGIS".
- All secrets via environment variables; no hardcoded credentials.
- TypeScript strict mode; ESLint + Prettier; vitest for testing.

---

## 7. Acceptance Criteria (MVP)

- [ ] Platform boots, connects to Discord gateway, registers slash commands.
- [ ] Zero-trust authorization enforced; default-deny; audit trail present.
- [ ] Anti-raid, anti-spam, anti-nuke each reduce/ block simulated attack events.
- [ ] Moderation commands (kick/ban/mute/warn/clear) persist cases to PostgreSQL.
- [ ] Welcome + verification gate functional.
- [ ] Ticket open/claim/resolve/close with transcript.
- [ ] Leveling XP grant + level-up role reward.
- [ ] Automation rule engine executes at least one trigger→action.
- [ ] Health endpoint returns healthy with DB/Redis latency.
- [ ] Security + functional + load tests pass; lint + typecheck clean.
