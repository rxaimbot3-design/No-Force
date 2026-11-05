import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuditService } from '../../src/security/audit';
import { db } from '../../src/database/client';

vi.mock('../../src/database/client', () => ({
  db: { execute: vi.fn() },
}));

const executeMock = vi.mocked(db.execute);

describe('AuditService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records an audit entry', async () => {
    executeMock.mockResolvedValue({ rowCount: 1 });
    const audit = new AuditService();

    await audit.record({
      guild_id: 'g1',
      actor_id: 'u1',
      action: 'tg:moderation:ban',
      target_id: 'u2',
      target_type: 'user',
      result: 'ALLOWED',
      reason: 'raid',
    });

    expect(executeMock).toHaveBeenCalled();
    const call = executeMock.mock.calls[0][0] as string;
    expect(call).toContain('INSERT INTO audit_log');
  });
});
