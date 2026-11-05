# Tong Ghor

Tong Ghor is a premium, security-first, high-performance Discord Community Management and Protection Platform engineered for very large communities.

## Features

- Zero-trust authorization with bypass-resistant security
- Anti-raid, anti-spam, and anti-nuke protection
- Advanced moderation with audit logging
- Welcome, verification, and community engagement
- Professional ticket management
- Leveling and optional economy modules
- Event-driven automation
- Server health monitoring
- PostgreSQL + Redis architecture
- TypeScript, Node.js, Discord.js

## Security

Tong Ghor is secure-by-default: every action is authorized server-side, the
audit log is append-only and hash-chained, secrets are redacted from logs, and
the root bootstrap identity is immutable. See `docs/threat-model.md`.

## Project Identity

The product name is **Tong Ghor**. The name "AEGIS" is not used anywhere in this project.

## Documentation

- `docs/requirements.md` — Requirements analysis
- `docs/threat-model.md` — Threat model
- `docs/architecture.md` — Technical architecture
- `docs/permission-matrix.md` — Permission matrix
- `docs/database-design.md` — Database design
- `docs/scaling-strategy.md` — Scaling strategy
- `docs/roadmap.md` — Implementation roadmap
- `docs/deployment.md` — Deployment & operations

## Getting Started

```bash
cp .env.example .env
# fill in DISCORD_TOKEN, DISCORD_CLIENT_ID, TONG_GHOR_ROOT_USER_ID,
# DATABASE_URL, REDIS_URL
npm ci
npm run build
npm run migrate
npm start
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript |
| `npm start` | Run the platform |
| `npm run dev` | Run with hot reload (tsx) |
| `npm run lint` | Lint source |
| `npm run typecheck` | Typecheck |
| `npm test` | Run test suite |
| `npm run migrate` | Apply database schema |
