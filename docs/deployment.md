# Tong Ghor — Deployment & Operations

## 1. Requirements

- Node.js 20+ (24 recommended)
- PostgreSQL 16+
- Redis 7+
- Discord application with bot token, client ID, and public key

## 2. Configuration

Copy `.env.example` to `.env` and fill in the values:

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_TOKEN` | Discord bot token | Yes |
| `DISCORD_CLIENT_ID` | Discord application client ID | Yes |
| `DISCORD_PUBLIC_KEY` | Interactions public key | No |
| `TONG_GHOR_ROOT_USER_ID` | Bootstrap root identity (immutable) | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `DATABASE_READ_URL` | Read replica connection string | No |
| `REDIS_URL` | Redis connection string | Yes |
| `PORT` | Health server port (default 8080) | No |
| `NODE_ENV` | `production` or `development` | No |
| `SHARD_COUNT` | Discord shard count or `auto` | No |
| `LOG_LEVEL` | Log level (default `info`) | No |

## 3. Running with Docker

```bash
cp .env.example .env
# edit .env with your values
docker compose up -d
```

The platform exposes:
- Discord gateway/shard connections
- Health endpoint: `http://localhost:8080/health`

## 4. Running from Source

```bash
npm ci
npm run build
npm run migrate      # apply database schema
npm start            # or: node dist/index.js
```

For development with hot reload:
```bash
npm run dev
```

## 5. Database Migrations

The schema lives in `src/database/schema.sql` and versioned migrations in
`src/database/migrations/`. On startup the core framework applies pending
migrations and the seed schema automatically.

## 6. Health Endpoint

`GET /health` returns JSON with the health of Discord shards, PostgreSQL, and
Redis. Use it for load balancer health checks and container liveness probes.

## 7. Security Operations

- The root identity (`TONG_GHOR_ROOT_USER_ID`) is set once and cannot be
  changed via platform commands. Treat it as a break-glass identity.
- All privileged actions require server-side authorization; default is deny.
- Audit log is append-only and hash-chained; do not truncate it.
- Secrets are loaded from environment only and redacted from logs.

## 8. Degraded Mode

If Redis is unavailable, rate limiting falls back to an in-memory fixed window
(fail-safe). If PostgreSQL is unavailable, moderation writes are queued in
memory (bounded) and flushed on recovery. The platform preserves default-deny
authorization in all degraded modes.

## 9. Logs

Tong Ghor emits structured JSON logs (pino). Secrets and tokens are redacted.
In development, logs are pretty-printed via pino-pretty.
