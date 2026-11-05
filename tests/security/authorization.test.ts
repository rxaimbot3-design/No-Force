import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthorizationService } from '../../src/security/authorization';
import { db } from '../../src/database/client';
import { redisClient } from '../../src/redis/client';
import type { AuthDecision } from '../../src/types';

vi.mock('../../src/database/client', () => ({
  db: { query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() },
}));
vi.mock('../../src/redis/client', () => ({
  redisClient: {
    get: vi.fn(),
    set: vi.fn(),
    eval: vi.fn(),
    del: vi.fn(),
    ping: vi.fn(),
    close: vi.fn(),
    health: vi.fn(),
  },
}));

const queryMock = vi.mocked(db.query);
const queryOneMock = vi.mocked(db.queryOne);
const getMock = vi.mocked(redisClient.get);
const setMock = vi.mocked(redisClient.set);

describe('AuthorizationService (zero-trust)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows root identity unconditionally', async () => {
    const auth = new AuthorizationService();
    const decision: AuthDecision = await auth.can('guild_1', 'root_user_id', 'tg:moderation:ban');
    expect(decision.allowed).toBe(true);
    expect(decision.source).toBe('root');
  });

  it('denies by default (default-deny)', async () => {
    getMock.mockResolvedValue(null);
    queryOneMock.mockResolvedValue(null);
    queryMock.mockResolvedValue([]);

    const auth = new AuthorizationService();
    const decision: AuthDecision = await auth.can('guild_1', 'user_1', 'tg:moderation:ban');
    expect(decision.allowed).toBe(false);
    expect(decision.source).toBe('default');
  });

  it('denies when user override is deny', async () => {
    getMock.mockResolvedValue(null);
    queryOneMock.mockResolvedValue({ allowed: false });

    const auth = new AuthorizationService();
    const decision: AuthDecision = await auth.can('guild_1', 'user_1', 'tg:moderation:kick');
    expect(decision.allowed).toBe(false);
    expect(decision.source).toBe('user_override');
  });

  it('allows when user override is grant', async () => {
    getMock.mockResolvedValue(null);
    queryOneMock.mockResolvedValue({ allowed: true });

    const auth = new AuthorizationService();
    const decision: AuthDecision = await auth.can('guild_1', 'user_1', 'tg:moderation:kick');
    expect(decision.allowed).toBe(true);
    expect(decision.source).toBe('user_override');
  });

  it('deny wins over grant for roles', async () => {
    getMock.mockResolvedValue(null);
    queryOneMock.mockResolvedValue(null);
    queryMock.mockResolvedValue([
      { role_id: 'r1', allowed: true },
      { role_id: 'r2', allowed: false },
    ]);

    const auth = new AuthorizationService();
    const decision: AuthDecision = await auth.can('guild_1', 'user_1', 'tg:moderation:mute', [
      'r1',
      'r2',
    ]);
    expect(decision.allowed).toBe(false);
    expect(decision.source).toBe('role_deny');
  });
});
