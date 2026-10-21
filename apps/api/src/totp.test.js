import { describe, it, expect } from 'vitest';
import { base32Encode, base32Decode, codeFor, verifyCode, stepAt, newSecret, otpauthUri } from './totp.js';

// RFC 6238 appendix B uses the ASCII secret "12345678901234567890"; the 6-digit codes are the last six digits of its 8-digit ones.
const RFC_SECRET = base32Encode(new TextEncoder().encode('12345678901234567890'));

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors', async () => {
    const bytes = base32Decode(RFC_SECRET);
    expect(await codeFor(bytes, stepAt(59_000))).toBe('287082');
    expect(await codeFor(bytes, stepAt(1_111_111_109_000))).toBe('081804');
    expect(await codeFor(bytes, stepAt(1_234_567_890_000))).toBe('005924');
    expect(await codeFor(bytes, stepAt(2_000_000_000_000))).toBe('279037');
  });

  it('round-trips base32 and makes a fresh 160-bit secret each time', () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 251, 252, 0, 99]);
    expect(Array.from(base32Decode(base32Encode(bytes)))).toEqual(Array.from(bytes));
    const a = newSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(newSecret()).not.toBe(a);
    expect(() => base32Decode('abc1')).toThrow();
  });

  it('accepts the current code and one step of drift, but not older, newer or reused ones', async () => {
    const now = 1_700_000_000_000;
    const bytes = base32Decode(RFC_SECRET);
    const step = stepAt(now);
    const code = (s) => codeFor(bytes, s);
    expect(await verifyCode(RFC_SECRET, await code(step), 0, now)).toBe(step);
    expect(await verifyCode(RFC_SECRET, await code(step - 1), 0, now)).toBe(step - 1);
    expect(await verifyCode(RFC_SECRET, await code(step + 1), 0, now)).toBe(step + 1);
    expect(await verifyCode(RFC_SECRET, await code(step - 2), 0, now)).toBeNull();
    expect(await verifyCode(RFC_SECRET, await code(step + 2), 0, now)).toBeNull();
    // Once a step is used, that step and anything older are refused.
    expect(await verifyCode(RFC_SECRET, await code(step), step, now)).toBeNull();
    expect(await verifyCode(RFC_SECRET, await code(step - 1), step, now)).toBeNull();
    expect(await verifyCode(RFC_SECRET, await code(step + 1), step, now)).toBe(step + 1);
  });

  it('refuses anything that is not six digits', async () => {
    for (const bad of ['', '12345', '1234567', 'abcdef', null, undefined, '12 345']) expect(await verifyCode(RFC_SECRET, bad, 0, 59_000)).toBeNull();
  });

  it('builds the link an authenticator reads', () => {
    expect(otpauthUri('ABC', 'a@b.co', 'QMS Portal')).toBe('otpauth://totp/QMS%20Portal%3Aa%40b.co?secret=ABC&issuer=QMS%20Portal&algorithm=SHA1&digits=6&period=30');
  });
});
