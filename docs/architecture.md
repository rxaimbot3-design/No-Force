# Tong Ghor — Technical Architecture

## 1. Architecture Overview

Tong Ghor is a layered, event-driven Node.js/TypeScript service built on Discord.js v14, PostgreSQL, and Redis. It runs as a single deployable unit (container) that can be scaled horizontally behind Discord.js sharding.

```
+---------------------+      gateway/REST      +----------------------+
|   Discord API       |<======================>|  Discord.js Client   |
+---------------------+                        |  (sharded)           |
                                              +----------+-----------+
                                                         |
         +-------------------+  events   +---------------v---------------+
         |   Event Router    |---------->|  Module Bus (pub/sub in Redis)|
         +-------------------+           +---------------+---------------+
                                                          |
          +-----------------------------------------------+----------------+
          |               |                   |                   |          |
    +-----v-----+   +-----v-----+     +-----v-----+     +-----v-----+ +--v--+
    | Anti-Raid |   | Anti-Spam |     | Anti-Nuke |     | Moderation| |Tick-|
    |   Module  |   |  Module   |     |  Module   |     |  Module   | |eting|
    +-----+-----+   +-----+-----+     +-----+-----+     +-----+-----+ +--+--+
          |               |                   |                   |
          +------+--------+-------------------+-------------------+
                 |
        +--------v--------+     PostgreSQL   +---------------+
        |   Audit Service |<================>|   PostgreSQL  |
        +-----------------+   (primary)      |   (primary)   |
                                             +---------------+
                                             ^
                                             | cache/ratelimit/queue
                                             v
                                      +-------------+
                                      |    Redis    |
                                      +-------------+
```

## 2. Layer Model

| Layer | Responsibility | Technology |
|-------|----------------|------------|
| Transport | Discord gateway + REST, health HTTP server | Discord.js, native `http` |
| Event Router | Dispatches Discord events to modules | Internal emitter |
| Module Bus | Cross-module coordination, distributed events | Redis pub/sub |
| Modules | Domain logic (anti-raid, moderation, tickets, ...) | TypeScript classes |
| Authorization | Zero-trust policy resolution | Server-side matrix + Redis cache |
| Data Access | PostgreSQL queries, migrations | `pg` (node-postgres) |
| Cache/Rate Limit | Sliding-window counters, hot data | Redis + Lua scripts |
| Observability | Structured logs, health endpoint, metrics | pino, `/health` |

## 3. Core Components

### 3.1 Discord.js Client (Transport)
- Sharded manager for large-community support.
- Intents: `Guilds`, `GuildMembers`, `GuildMessages`, `MessageContent`, `GuildMessageReactions`, `GuildModeration`.
- Slash commands registered globally and per-guild at startup.
- All commands route through the Authorization layer before execution.

### 3.2 Authorization Layer (Zero-Trust)
- Resolves effective permissions for `(userId, guildId, action)`.
- Sources: guild config roles, user overrides, root bootstrap identity.
- Default-deny: no permission → action rejected.
- Cached in Redis with short TTL; invalidated on config change.
- Every decision audited.

### 3.3 Modules
Each module is a self-contained class with:
- `initialize(client, services)` 
- `handleEvent(event)` 
- `registerCommands(registry)`
- `shutdown()`

Modules communicate via the Module Bus (Redis pub/sub) for cross-guild or cross-module events (e.g., anti-nuke triggering a lockdown handled by moderation).

### 3.4 Data Access Layer
- `pg` connection pool (bounded, with timeouts).
- Parameterized queries only; no dynamic SQL.
- Schema migrations versioned in `src/database/migrations/`.
- Read path can use replicas (configured via `DATABASE_READ_URL`).

### 3.5 Cache & Rate Limit (Redis)
- Sliding-window log rate limiter implemented with Redis ZSET + Lua (atomic).
- Keys: `tg:ratelimit:{guildId}:{userId}:{window}`.
- Authorization cache: `tg:auth:{guildId}:{userId}`.
- Health checks via Redis PING.

### 3.6 Audit Service
- Append-only writes to PostgreSQL `audit_log` table.
- Hash chain: `record.hash = SHA256(prevHash || recordPayload)`.
- Optional streaming to Discord audit channel.

## 4. Data Flow

### Command Flow (e.g., `/moderate kick`)
1. Discord interaction → Discord.js → command handler.
2. Authorization layer resolves caller permissions for `moderation:kick` in guild.
3. If denied → ephemeral response, audit `AUTH_DENIED`, return.
4. If allowed → validate input, execute Discord API action, write case to `moderation_cases`, audit `MOD_ACTION`, respond.
5. All writes synchronous to PostgreSQL before ACK.

### Event Flow (e.g., message create → anti-spam)
1. Gateway event → Event Router.
2. Filter: ignore bots/webhooks, DMs, non-guild.
3. Dispatch to Anti-Spam module.
4. Anti-Spam checks Redis sliding window; if over threshold → action (delete/mute) + audit.
5. Cross-module: publish `user:spammed` to Module Bus; Anti-Raid may escalate.

## 5. Security Boundaries

- Bot token, DB/Redis credentials loaded from env at startup, never logged.
- Logger redacts values matching secret patterns.
- All Discord interaction signatures validated (where applicable).
- All SQL parameterized.
- Default-deny authorization; root identity not DB-mutable.

## 6. Observability

- Structured JSON logs (pino) with correlation IDs.
- `/health` HTTP endpoint: reports Discord gateway state, DB latency, Redis latency, shard health.
- Optional Prometheus metrics via `/metrics`.

## 7. Error Handling & Reliability

- Circuit breaker on external calls (Discord REST, DB, Redis).
- Degraded mode: if Redis unavailable, fall back to in-memory fixed-window (less accurate, still safe); if DB unavailable, queue writes in memory and flush on recovery.
- Unhandled rejection → crash-only; supervisor (systemd/docker restart) restarts process.
- Retries with exponential backoff + jitter for transient failures.

## 8. Technology Versions

| Component | Version |
|-----------|---------|
| Node.js | 20 LTS |
| TypeScript | 5.x |
| Discord.js | 14.x |
| node-postgres (pg) | 8.x |
| ioredis | 5.x |
| pino | 8.x |
| vitest | 2.x |
| ESLint + Prettier | latest |
| Docker | multi-stage build |
