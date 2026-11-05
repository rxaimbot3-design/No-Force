# Tong Ghor — Scaling Strategy

## 1. Scaling Axes

| Axis | Strategy |
|------|----------|
| Guild count | Sharded Discord.js deployment; each shard owns a subset of guilds. |
| Members per guild | Sharding distributes large guilds across processes; member cache bounded via LRU. |
| Event throughput | Redis-backed module bus decouples modules; async processing for non-critical paths. |
| Read volume | PostgreSQL read replicas for read-heavy queries (leaderboards, audit). |
| Write volume | Bounded connection pools; async queue for non-durable writes (metrics, some cache warming). |
| Rate-limit state | Redis cluster/sentinel; sliding-window counters shared across all shards. |

## 2. Discord.js Sharding

- Use `ShardingManager` with `shardCount` = auto (Discord-recommended) or `MAX_SHARDS` env.
- Each shard runs in its own process/worker connected to the same Redis and PostgreSQL.
- Per-shard process restarts independently (crash-only).
- Cross-shard coordination (global rate limits, leaderboards) via Redis.

## 3. Redis Usage

- Rate-limit sliding windows (shared across shards so a raider hitting multiple shards is still limited).
- Authorization cache (TTL-based, invalidated via pub/sub on config change).
- Module bus (pub/sub) for cross-module events.
- Session/verification state (short TTL).
- Connection: `ioredis` with cluster support optional; sentinel for HA.

## 4. PostgreSQL Scaling

- Primary for all writes.
- Read replicas for: `user_levels` leaderboards, `audit_log` reads, `moderation_cases` history.
- Connection pool bounded per shard (e.g., 10 connections) to avoid exhausting `max_connections`.
- PgBouncer recommended in front of PostgreSQL for high shard counts.

## 5. Caching Strategy

| Data | Store | TTL / Invalidation |
|------|-------|---------------------|
| Authorization decisions | Redis | 60s TTL; pub/sub invalidation on change |
| Guild config | Redis | 300s TTL; invalidated on write |
| Member role cache | Discord.js cache (bounded LRU) | Discord-driven |
| Rate-limit counters | Redis | Window TTL |

## 6. Rate Limiting Design (Hot Path)

Sliding-window log implemented with Redis ZSET + Lua script (atomic):

```
ZADD key <now> <now>
ZREMRANGEBYSCORE key 0 <now - window>
ZCARD key
```

If count > threshold → rate-limited. This guarantees accuracy across shards and processes.

Degraded mode (Redis down): in-memory fixed-window per process; less accurate but still enforces a bound (fail-safe).

## 7. Load Targets

| Metric | Target |
|--------|--------|
| Events/sec (aggregate) | 1,000+ |
| Authorization decisions (p95) | < 1 ms |
| Anti-spam decision (p95) | < 10 ms |
| Moderation action (p95) | < 50 ms |
| Concurrent shards | 16–64 (configurable) |
| DB connections per shard | ≤ 12 |

## 8. Degraded Mode

When Redis or PostgreSQL is unreachable:
- Anti-spam/anti-raid use local fixed-window counters (still enforce limits).
- Authorization falls back to in-memory cached grants; denies closed.
- Moderation writes queued in memory, flushed to PostgreSQL on recovery (bounded queue; drop oldest on overflow with alert).
- Platform remains safe: default-deny preserved, no bypass possible.

## 9. Observability for Scaling

- `/health` reports shard count, DB latency, Redis latency, queue depth.
- Prometheus metrics (optional): `tg_events_processed`, `tg_auth_decisions`, `tg_rate_limited`, `tg_db_latency_seconds`.
- Alerts: shard disconnect, DB/Redis latency > threshold, queue depth high.
