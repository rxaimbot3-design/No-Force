import { db } from '../database/client';
import { redisClient } from '../redis/client';
import { config } from '../config';
import type {
  AuthorizationService as AuthorizationServiceType,
  AuthDecision,
  PermissionAction,
} from '../types';

const CACHE_TTL_SECONDS = 60;
const ROOT_USER_ID = config.rootUserId;

export class AuthorizationService implements AuthorizationServiceType {
  async can(
    guildId: string,
    userId: string,
    action: PermissionAction,
    roles: string[] = []
  ): Promise<AuthDecision> {
    if (ROOT_USER_ID && userId === ROOT_USER_ID) {
      return { allowed: true, reason: 'root identity', source: 'root' };
    }

    const cacheKey = `tg:auth:${guildId}:${userId}:${action}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as AuthDecision;
    }

    const userOverride = await db.queryOne<{ allowed: boolean }>(
      `SELECT allowed FROM user_permissions
       WHERE guild_id = $1 AND user_id = $2 AND action = $3`,
      [guildId, userId, action]
    );

    if (userOverride) {
      const decision: AuthDecision = userOverride.allowed
        ? { allowed: true, reason: 'user override grant', source: 'user_override' }
        : { allowed: false, reason: 'user override deny', source: 'user_override' };
      await redisClient.set(cacheKey, JSON.stringify(decision), CACHE_TTL_SECONDS);
      return decision;
    }

    let granted = false;
    let denied = false;

    if (roles.length > 0) {
      const rows = await db.query<{ role_id: string; allowed: boolean }>(
        `SELECT role_id, allowed FROM role_permissions
         WHERE guild_id = $1 AND role_id = ANY($2::text[]) AND action = $3`,
        [guildId, roles, action]
      );
      for (const row of rows) {
        if (row.allowed) granted = true;
        else denied = true;
      }
    }

    if (!denied && !granted && roles.includes('Administrator')) {
      granted = true;
    }

    if (denied) {
      const decision: AuthDecision = { allowed: false, reason: 'role deny', source: 'role_deny' };
      await redisClient.set(cacheKey, JSON.stringify(decision), CACHE_TTL_SECONDS);
      return decision;
    }

    if (granted) {
      const decision: AuthDecision = { allowed: true, reason: 'role grant', source: 'role_grant' };
      await redisClient.set(cacheKey, JSON.stringify(decision), CACHE_TTL_SECONDS);
      return decision;
    }

    const decision: AuthDecision = { allowed: false, reason: 'default deny', source: 'default' };
    await redisClient.set(cacheKey, JSON.stringify(decision), CACHE_TTL_SECONDS);
    return decision;
  }

  middleware(_action: PermissionAction) {
    return (_handler: unknown) => _handler;
  }
}

export const authorization = new AuthorizationService();
