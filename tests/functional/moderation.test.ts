import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModerationModule } from '../../src/modules/moderation';
import { authorization } from '../../src/security/authorization';
import { audit } from '../../src/security/audit';
import { db } from '../../src/database/client';

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
vi.mock('../../src/security/authorization', () => ({
  authorization: { can: vi.fn() },
}));
vi.mock('../../src/security/audit', () => ({
  audit: { record: vi.fn() },
}));

const canMock = vi.mocked(authorization.can);
const recordMock = vi.mocked(audit.record);
const executeMock = vi.mocked(db.execute);
const queryOneMock = vi.mocked(db.queryOne);

describe('ModerationModule', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('denies unauthorized moderation action', async () => {
    canMock.mockResolvedValue({
      allowed: false,
      reason: 'default deny',
      source: 'default',
    } as any);

    const mod = new ModerationModule();
    const result = await mod.execute({
      type: 'kick',
      guildId: 'g1',
      actorId: 'u1',
      targetId: 'u2',
      reason: 'test',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('authorization denied');
  });

  it('records a case when authorized', async () => {
    canMock.mockResolvedValue({
      allowed: true,
      reason: 'role grant',
      source: 'role_grant',
    } as any);
    queryOneMock.mockResolvedValue(null);

    const mod = new ModerationModule();
    (mod as any).client = {
      guilds: { cache: new Map() },
    };

    const result = await mod.execute({
      type: 'warn',
      guildId: 'g1',
      actorId: 'u1',
      targetId: 'u2',
      reason: 'spam',
    });

    expect(result.ok).toBe(true);
    expect(result.caseId).toBeDefined();
    expect(executeMock).toHaveBeenCalled();
  });
});
