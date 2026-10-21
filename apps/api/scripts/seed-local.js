// LOCAL TESTING ONLY. Fills the local D1 (wrangler dev) with sign-in accounts for every department, all with the password 1234.
// Never run the SQL it writes against Cloudflare: the password is trivial and nobody is asked to change it.
// Usage (after a fresh `npm run db:migrate:local`): npm run db:seed:local
//   Starting from scratch: stop wrangler dev, delete apps/api/.wrangler/state/v3/d1 and .../r2, then migrate and seed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { hashPassword } from '../src/password.js';

const PASSWORD = '1234';
// Department code -> short prefix for the email. Codes are the ones migration 0014 creates.
const DEPARTMENTS = { DC: 'dc', PD: 'pd', QC: 'qc', WH: 'wh', EN: 'en', PC: 'pc', 'HR&GA': 'hr', HSE: 'hse', MKT: 'mkt', ST: 'st', FIN: 'fin', MGMT: 'mg', EXEC: 'ex' };
// Level 2 asks, 4 reviews, 6 approves (L6 covers every type but the Quality Manual, which needs 8).
const ROLES = [[2, 'พนักงาน'], [4, 'หัวหน้า'], [6, 'ผู้จัดการ']];
// The DC department's L4 head (dc4) is the DCC supervisor and runs master data and admin alone, so dcc2 is the backup. The MGMT L6 manager is the QMR and the DCC's boss; DCC accounts are
// kept out of the reviewer and approver pickers, so the boss is QMR rather than DCC.
const EXTRA = [
  { id: 'dcc2', name: 'DCC สำรอง', dept: 'DC', level: 4, dcc: 1, qmr: 0 },
  { id: 'md', name: 'กรรมการผู้จัดการ', dept: 'EXEC', level: 8, dcc: 0, qmr: 0 }
];

const q = (v) => `'${String(v).replaceAll("'", "''")}'`;
const hash = await hashPassword(PASSWORD);
const users = [
  ...Object.entries(DEPARTMENTS).flatMap(([dept, prefix]) => ROLES.map(([level, title]) => ({ id: `${prefix}${level}`, name: `${dept} ${title}${dept === 'DC' && level === 4 ? ' (DCC)' : ''}`, dept, level, qmr: dept === 'MGMT' && level === 6 ? 1 : 0, dcc: dept === 'DC' && level === 4 ? 1 : 0 }))),
  ...EXTRA
];
const sql = [
  ...users.map((u) => `INSERT INTO users (id, emp_id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc, is_qmr, must_change_password)
    VALUES (${[u.id, u.id, u.name, `${u.id}@t.co`, hash, u.dcc ? 'DCC_ADMIN' : 'GENERAL_USER', u.level, u.dept, JSON.stringify([u.dept])].map((v, i) => (i === 6 ? v : q(v))).join(', ')}, ${u.dcc}, ${u.qmr}, 0);`),
  // Two places per department so a DAR can name where controlled copies go.
  ...Object.keys(DEPARTMENTS).flatMap((dept) => [['สำนักงาน', 'ตู้เอกสารหลัก'], ['หน้างาน', 'จุดใช้งานหน้างาน']]
    .map(([name, description]) => `INSERT INTO distribution_locations (id, department, name, description) VALUES (${q(`loc-${dept}-${name}`)}, ${q(dept)}, ${q(`${dept} ${name}`)}, ${q(description)});`))
];
mkdirSync('.wrangler', { recursive: true });
writeFileSync('.wrangler/seed-local.sql', `${sql.join('\n')}\n`);
console.log(`Wrote ${users.length} users and ${Object.keys(DEPARTMENTS).length * 2} places to .wrangler/seed-local.sql`);
