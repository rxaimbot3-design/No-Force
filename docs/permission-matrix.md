# Tong Ghor — Permission Matrix

## 1. Authorization Model

Tong Ghor uses zero-trust, default-deny authorization. Every privileged action is resolved server-side against `(actorId, guildId, action, context)`. Discord role IDs are resolved from the live guild member state via Discord.js, never trusted from client input.

### Identity Classes

| Class | Description | Source |
|-------|-------------|--------|
| Root | Bootstrap identity; full platform control. Set once at setup. | Config (`TONG_GHOR_ROOT_USER_ID`) |
| Admin | Guild administrator (Discord `Administrator` permission or configured admin role). | Guild config / Discord perms |
| Moderator | Configured moderator role(s). | Guild config |
| Trusted | Whitelisted members/roles exempt from anti-raid/anti-spam. | Guild config |
| Member | Any guild member. | Discord |
| Unverified | Member pending verification. | Verification module |
| Bot/Webhook | Non-user actors. | Discord |

### Resolution Order (highest wins)

1. Root (always allow, audited)
2. Explicit user override (allow/deny row in `user_permissions`)
3. Role-based grant (actor has any role granting the action)
4. Role-based deny (actor has any role denying the action) — deny wins over grant
5. Default-deny

---

## 2. Actions & Required Permissions

| Action | Module | Required | Notes |
|--------|--------|----------|-------|
| `tg:config:read` | Core | Admin | View guild config |
| `tg:config:write` | Core | Admin | Change guild config |
| `tg:auth:manage` | Core | Root | Manage user/role overrides |
| `tg:moderation:kick` | Moderation | Moderator+ |  |
| `tg:moderation:ban` | Moderation | Moderator+ |  |
| `tg:moderation:softban` | Moderation | Moderator+ |  |
| `tg:moderation:mute` | Moderation | Moderator+ | Requires mute role configured |
| `tg:moderation:timeout` | Moderation | Moderator+ | Discord native timeout |
| `tg:moderation:warn` | Moderation | Moderator+ |  |
| `tg:moderation:clear` | Moderation | Moderator+ | Message purge |
| `tg:moderation:appeal` | Moderation | Member | Appeal own case |
| `tg:moderation:review` | Moderation | Moderator+ | Review/resolve appeals |
| `tg:antiRaid:configure` | Anti-Raid | Admin |  |
| `tg:antiRaid:bypass` | Anti-Raid | Trusted | Exempt from raid limits |
| `tg:antiSpam:configure` | Anti-Spam | Admin |  |
| `tg:antiSpam:bypass` | Anti-Spam | Trusted | Exempt from spam limits |
| `tg:antiNuke:configure` | Anti-Nuke | Admin |  |
| `tg:ticket:open` | Tickets | Member |  |
| `tg:ticket:claim` | Tickets | Moderator+ |  |
| `tg:ticket:close` | Tickets | Moderator+ / ticket author |  |
| `tg:ticket:transcript` | Tickets | Moderator+ |  |
| `tg:leveling:configure` | Leveling | Admin |  |
| `tg:economy:claim` | Economy | Member | Daily claim |
| `tg:economy:transfer` | Economy | Member |  |
| `tg:welcome:configure` | Welcome | Admin |  |
| `tg:verification:configure` | Verification | Admin |  |
| `tg:automation:manage` | Automation | Admin | Create/edit rules |
| `tg:monitoring:read` | Monitoring | Admin | Health/metrics |

"Moderator+" = Moderator role or Admin role or Root.

---

## 3. Role-Based Grants (Default Matrix)

| Role | Granted Actions |
|------|-----------------|
| Root | All actions |
| Administrator (Discord) | All guild-scoped actions |
| Admin (configured role) | All guild-scoped actions except root-only |
| Moderator (configured role) | Moderation + ticket + verification-read actions |
| Trusted | Anti-raid/anti-spam bypass |
| Member | ticket:open, economy:claim/transfer, moderation:appeal |
| Unverified | None (read-only) |

---

## 4. Deny Rules

Deny rules always override grants (except Root).

| Deny Target | Denied Actions | Context |
|-------------|---------------|---------|
| Unverified | All write actions | Until verification complete |
| Bot accounts | Moderation actions | Prevent bot self-moderation |
| Self | kick/ban/timeout own account | Prevent self-action (Root exempt for emergency) |

---

## 5. Implementation Notes

- Permissions are cached in Redis (`tg:auth:{guildId}:{userId}`) with short TTL (default 60s).
- Cache invalidated on guild config change or permission override change.
- Root identity is read from `TONG_GHOR_ROOT_USER_ID` env at startup; not stored as a mutable DB row.
- Every authorization decision is recorded in `audit_log` with `allowed` boolean and `reason`.
- Missing/malformed guild config → default-deny (fail closed).
