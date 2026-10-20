// Workers caps PBKDF2 at 100k iterations.
const ITERATIONS = 100_000;
const encoder = new TextEncoder();
const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text) => Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(await derive(password, salt, ITERATIONS))}`;
}

// Unknown users still pay for one derivation, so response time does not reveal which emails exist.
const DUMMY_HASH = `pbkdf2$${ITERATIONS}$${'A'.repeat(22)}==$${'A'.repeat(43)}=`;

export async function verifyPassword(password, stored) {
  const [scheme, iterations, salt, hash] = (stored ?? DUMMY_HASH).split('$');
  if (scheme !== 'pbkdf2') return false;
  const actual = await derive(password, fromBase64(salt), Number(iterations));
  const expected = fromBase64(hash);
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ (expected[i] ?? 0);
  return diff === 0 && stored != null;
}
