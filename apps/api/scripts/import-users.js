// Usage: node scripts/import-users.js <employees.csv>
// CSV columns (header row required): emp_id,name,email,department,extra_departments,level,is_dcc,is_qmr
// extra_departments is separated by ";" and is_dcc/is_qmr are 1 or empty. Writes:
//   .wrangler/import-users.sql        run with: npx wrangler d1 execute DB --remote --file .wrangler/import-users.sql
//   .wrangler/import-passwords.csv    temporary passwords to hand out; delete both files after use
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { hashPassword } from '../src/password.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/import-users.js <employees.csv>');
  process.exit(1);
}

// shortcut: no quoted-comma support, names and emails never contain commas; upgrade if a name needs one.
const rows = readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim()).map((line) => line.split(',').map((cell) => cell.trim()));
const header = rows.shift();
const col = (name) => header.indexOf(name);
for (const name of ['emp_id', 'name', 'email', 'department', 'extra_departments', 'level', 'is_dcc', 'is_qmr']) {
  if (col(name) < 0) {
    console.error(`Missing column: ${name}`);
    process.exit(1);
  }
}

// QA and QC are one department in this system (the web normalises the same way).
const dept = (code) => { const upper = code.toUpperCase(); return upper === 'QA' ? 'QC' : upper; };
// No look-alike characters (0/O, 1/l/I); 14 characters clears the 12-character minimum.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const tempPassword = () => Array.from({ length: 14 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;

const errors = [];
const seenEmails = new Set();
const seenEmpIds = new Set();
const sql = [];
const passwords = ['email,name,temporary_password'];
for (const [index, row] of rows.entries()) {
  const get = (name) => row[col(name)] ?? '';
  const line = index + 2;
  const email = get('email').toLowerCase();
  const level = Number(get('level'));
  const empId = get('emp_id');
  if (!get('name')) errors.push(`row ${line}: name is empty`);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push(`row ${line}: invalid email "${email}"`);
  if (seenEmails.has(email)) errors.push(`row ${line}: duplicate email "${email}"`);
  if (empId && seenEmpIds.has(empId)) errors.push(`row ${line}: duplicate emp_id "${empId}"`);
  if (!get('department')) errors.push(`row ${line}: department is empty`);
  if (!(Number.isInteger(level) && level >= 1 && level <= 8)) errors.push(`row ${line}: level must be 1-8, got "${get('level')}"`);
  seenEmails.add(email);
  if (empId) seenEmpIds.add(empId);
  if (errors.length) continue;

  const primary = dept(get('department'));
  const departments = [...new Set([primary, ...get('extra_departments').split(';').map((c) => c.trim()).filter(Boolean).map(dept)])];
  const isDcc = get('is_dcc') === '1' ? 1 : 0;
  const password = tempPassword();
  const values = [crypto.randomUUID(), empId || null, get('name'), email, await hashPassword(password), isDcc ? 'DCC_ADMIN' : 'GENERAL_USER', level, primary, JSON.stringify(departments)];
  sql.push(`INSERT INTO users (id, emp_id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc, is_qmr, must_change_password) VALUES (${values.map((v) => (v === null ? 'NULL' : quote(v))).join(', ')}, ${isDcc}, ${get('is_qmr') === '1' ? 1 : 0}, 1);`);
  passwords.push(`${email},${get('name')},${password}`);
}

if (errors.length) {
  console.error(`Nothing written. Fix these ${errors.length} problem(s) and run again:\n${errors.join('\n')}`);
  process.exit(1);
}
mkdirSync('.wrangler', { recursive: true });
writeFileSync('.wrangler/import-users.sql', `${sql.join('\n')}\n`);
writeFileSync('.wrangler/import-passwords.csv', `﻿${passwords.join('\n')}\n`);
console.log(`Wrote ${sql.length} users to .wrangler/import-users.sql and passwords to .wrangler/import-passwords.csv`);
