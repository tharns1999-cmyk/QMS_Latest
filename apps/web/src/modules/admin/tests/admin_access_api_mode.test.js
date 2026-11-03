import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../api/client', () => ({ isApiMode: true }));

const { isSystemAdmin } = await import('../adminAccess');

describe('isSystemAdmin when connected to the server', () => {
  it('follows the server rule (is_dcc) whatever the stored role says', () => {
    expect(isSystemAdmin({ isDcc: true, role: 'DCC_ADMIN' })).toBe(true);
    // an old row whose role column was never updated still has admin endpoints on the server
    expect(isSystemAdmin({ isDcc: true, role: 'GENERAL_USER' })).toBe(true);
  });

  it('is false for everyone the server would refuse', () => {
    expect(isSystemAdmin({ isDcc: false, role: 'DCC_ADMIN' })).toBe(false);
    expect(isSystemAdmin({ isDcc: false, isQmr: true, role: 'QMR' })).toBe(false);
    expect(isSystemAdmin({ isDcc: false, role: 'GENERAL_USER', approval_level: 8 })).toBe(false);
    expect(isSystemAdmin(null)).toBe(false);
  });
});
