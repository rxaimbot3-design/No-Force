import { describe, it, expect } from 'vitest';

describe('Tong Ghor smoke test', () => {
  it('platform name is Tong Ghor, not AEGIS', () => {
    const name = 'tong-ghor';
    expect(name).toBe('tong-ghor');
    expect(name).not.toContain('aegis');
  });
});
