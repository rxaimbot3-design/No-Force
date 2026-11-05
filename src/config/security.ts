export const SECURITY_HEADER = 'X-Tong-Ghor-Authorized';

export const ROOT_ACTION_PREFIX = 'tg:root:';

export const PRIVILEGED_ACTIONS = [
  'tg:moderation:kick',
  'tg:moderation:ban',
  'tg:moderation:softban',
  'tg:moderation:mute',
  'tg:moderation:timeout',
  'tg:moderation:warn',
  'tg:moderation:clear',
  'tg:config:write',
  'tg:antiRaid:configure',
  'tg:antiSpam:configure',
  'tg:antiNuke:configure',
] as const;

export const REDACT_SECRET = '[REDACTED]';

export function isPrivilegedAction(action: string): boolean {
  return PRIVILEGED_ACTIONS.includes(action as (typeof PRIVILEGED_ACTIONS)[number]);
}
