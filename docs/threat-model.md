# Tong Ghor — Threat Model

## 1. Methodology

STRIDE-based threat model applied to the Tong Ghor platform. Assets, threats, and mitigations are enumerated below. This document is reviewed on every release and after any security incident.

## 2. Assets

| Asset | Sensitivity | Protection Goal |
|-------|-------------|-----------------|
| Bot token (Discord) | Critical | Confidentiality, integrity |
| PostgreSQL credentials | Critical | Confidentiality |
| Redis credentials | Critical | Confidentiality |
| Signing/JWT or session secrets | High | Confidentiality, integrity |
| Moderation cases & audit log | High | Integrity, availability, non-repudiation |
| User/guild configuration | Medium | Confidentiality, integrity |
| Economy balances (if enabled) | High | Integrity |
| Platform availability | High | Availability |

## 3. Trust Boundaries

1. **Discord → Tong Ghor** (gateway/REST/webhook): untrusted external input. All events authenticated via Discord signature/token; payloads validated.
2. **Tong Ghor → Discord** (REST actions): privileged outbound; rate-limit and permission-checked before dispatch.
3. **Tong Ghor → PostgreSQL/Redis**: internal data plane; authenticated via credentials; least-privilege DB user.
4. **Operator → Tong Ghor** (slash commands, admin panel): authenticated via Discord roles + root bootstrap; zero-trust.

## 4. Threat Enumeration (STRIDE)

### Spoofing

| ID | Threat | Target | Impact | Mitigation |
|----|--------|--------|--------|------------|
| T-S1 | Spoofed Discord webhook/event | Event ingest | False moderation/action | Verify Discord interaction signatures; validate event origin; reject unverifiable events |
| T-S2 | Impersonate moderator via forged role | Authorization | Unauthorized action | Resolve roles from guild member cache via Discord API, not client-provided claims |
| T-S3 | Self-grant bypass/root identity | Authorization | Full compromise | Root/bootstrap identity created once at setup; cannot be assigned by any in-platform command; stored in config, not DB-mutable |

### Tampering

| ID | Threat | Target | Impact | Mitigation |
|----|--------|--------|--------|------------|
| T-T1 | Modify audit log entries | Audit log | Non-repudiation loss | Append-only writes; hash-chain each record (hash = H(prevHash + payload)); store admin-signing key off-box |
| T-T2 | Alter rate-limit counters in Redis | Anti-spam/raid | Bypass limits | Redis accessed only by platform; counters keyed by guild+user+window; Lua scripts for atomic increment |
| T-T3 | Escalate privileges via DB write | Database | Privilege escalation | DB user has limited privileges; migrations run separately; ORM enforces schema; no dynamic SQL |

### Repudiation

| ID | Threat | Target | Impact | Mitigation |
|----|--------|--------|--------|------------|
| T-R1 | Deny performing a moderation action | Audit log | Dispute resolution failure | Every action logged with actor ID, target ID, guild ID, timestamp, reason, result before ACK |
| T-R2 | Deny opening/closing a ticket | Ticket DB | SLA dispute | Ticket lifecycle transitions logged immutably |

### Information Disclosure

| ID | Threat | Target | Impact | Mitigation |
|----|--------|--------|--------|------------|
| T-I1 | Log secrets (bot token, DB password) | Logs | Credential theft | Secret redaction in logger; env loaded once; never printed |
| T-I2 | Expose economy balances to unauthorized users | API | Financial loss | Authorization check before any balance read; default-deny |
| T-I3 | Cross-guild data leakage | Database | Privacy breach | All queries scoped by `guild_id`; RLS-style application-layer scoping |

### Denial of Service

| ID | Threat | Target | Impact | Mitigation |
|----|--------|--------|--------|------------|
| T-D1 | Event flood (spam/raid) | Event loop | Latency spike/crash | Sliding-window rate limits per guild/user; circuit breaker; async queue for off-path work; shard-aware concurrency |
| T-D2 | DB/Redis connection exhaustion | Data plane | Unavailability | Connection pools with bounded size; timeouts; graceful degraded mode |
| T-D3 | Large message/payload processing | CPU/Memory | Slow processing | Message size caps; ignore bots/webhooks; async heavy work |

### Elevation of Privilege

| ID | Threat | Target | Impact | Mitigation |
|----|--------|--------|--------|------------|
| T-E1 | Non-staff execute moderation command | Command handler | Unauthorized moderation | Zero-trust authorization matrix resolved server-side per command; default-deny |
| T-E2 | Ticket assigned/closed by non-staff | Ticket DB | SLA/integrity breach | Role-based gating on ticket transitions |
| T-E3 | Economy self-inflation | Economy DB | Balance tampering | Currency mutations only via server-side commands; daily claim rate-limited |

## 5. Attack Scenarios

### Scenario A: Raid flood
Attacker controls 500 accounts that join a guild within seconds and post spam.
- T-D1, T-S2 relevant.
- Mitigation: anti-raid sliding window triggers lockdown; new joins require verification; anti-spam deletes messages and mutes/kickers.

### Scenario B: Compromised moderator account
A moderator's Discord account is compromised; attacker uses their role to nuke channels.
- T-E1, T-T2 relevant.
- Mitigation: anti-nuke thresholds on mass deletions; require second factor outside platform scope; alert root admins; rollback where permitted.

### Scenario C: Insider DB write
A platform operator with DB access tries to grant themselves root.
- T-S3, T-E3 relevant.
- Mitigation: root identity not stored as mutable DB row; DB user limited; changes audited.

### Scenario D: Forged webhook
Attacker sends a fake `guild_member_add` event to trigger welcome/verification.
- T-S1 relevant.
- Mitigation: only gateway events from authenticated Discord session are processed; no public webhook ingestion without signature verification.

## 6. Risk Rating

| Risk | Likelihood | Impact | Rating |
|------|------------|--------|--------|
| Credential disclosure via logs | Low | Critical | High |
| Authorization bypass | Low | Critical | High |
| Audit log tampering | Low | High | Medium |
| Rate-limit bypass | Medium | High | Medium |
| Raid/spam flood | High | Medium | High |
| DB DoS via connection exhaustion | Medium | High | Medium |

## 7. Security Controls Summary

- Zero-trust, default-deny authorization resolved server-side.
- Root bootstrap identity immutable via platform commands.
- Append-only, hash-chained audit log.
- Secrets redacted; loaded from env only.
- Sliding-window rate limiting (Redis + Lua, atomic).
- Circuit breakers + degraded mode.
- Bounded connection pools + timeouts.
- Input validation on all Discord events and commands.

## 8. Assumptions

- Discord bot token and gateway are authentic (TLS-terminated by Discord).
- PostgreSQL/Redis are in a trusted network or use TLS + auth.
- Operators follow least-privilege and do not share the root bootstrap identity.
