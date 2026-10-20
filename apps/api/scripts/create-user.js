// Usage: node scripts/create-user.js <email> <name> <department> <approval_level> [role]
// Writes .wrangler/new-user.sql, then run: npx wrangler d1 execute DB --local --file .wrangler/new-user.sql  (--remote for Cloudflare)
import { mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { hashPassword } from '../src/password.js';

const [email, name, department, level, role = 'GENERAL_USER'] = process.argv.slice(2);
if (!email || !name || !department || !(Number(level) >= 1 && Number(level) <= 8)) {
  console.error('Usage: node scripts/create-user.js <email> <name> <department> <approval_level 1-8> [role]');
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stderr });
const password = await rl.question('Password (at least 8 characters): ');
rl.close();
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const values = [crypto.randomUUID(), name, email, await hashPassword(password), role, Number(level), department, JSON.stringify([department]), role === 'DCC_ADMIN' ? 1 : 0];
mkdirSync('.wrangler', { recursive: true });
writeFileSync('.wrangler/new-user.sql', `INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc) VALUES (${values.map(quote).join(', ')});\n`);
console.log('Wrote .wrangler/new-user.sql');
