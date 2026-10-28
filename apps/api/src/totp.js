// Time-based one-time passwords (RFC 6238, HMAC-SHA1, 6 digits, 30-second steps), which every authenticator app understands.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const STEP_SECONDS = 30;
const DIGITS = 6;
// A code from one step before or after the current one still counts, for clocks that are a little off.
const DRIFT_STEPS = 1;

export const newSecret = () => base32Encode(crypto.getRandomValues(new Uint8Array(20)));

export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('not base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export const stepAt = (ms) => Math.floor(ms / 1000 / STEP_SECONDS);

export async function codeFor(secretBytes, step) {
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const counter = new DataView(new ArrayBuffer(8));
  counter.setBigUint64(0, BigInt(step));
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter));
  const offset = mac[19] & 15;
  const binary = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

// Returns the step the code belongs to, or null. Only a step newer than lastStep is accepted, so a code cannot be used twice.
export async function verifyCode(secret, code, lastStep = 0, now = Date.now()) {
  if (!/^\d{6}$/.test(String(code ?? ''))) return null;
  const bytes = base32Decode(secret);
  const current = stepAt(now);
  for (let step = current - DRIFT_STEPS; step <= current + DRIFT_STEPS; step++) {
    if (step > lastStep && (await codeFor(bytes, step)) === code) return step;
  }
  return null;
}

// The link an authenticator app reads from the QR code.
export const otpauthUri = (secret, account, issuer) =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
