// LOCAL TESTING ONLY. Fills the local D1 (wrangler dev) with sign-in accounts for every department, all with the password 1234.
// Never run the SQL it writes against Cloudflare: the password is trivial and nobody is asked to change it.
// Usage (after a fresh `npm run db:migrate:local`): npm run db:seed:local
//   Starting from scratch: stop wrangler dev, delete apps/api/.wrangler/state/v3/d1 and .../r2, then migrate and seed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { hashPassword } from '../src/password.js';

const PASSWORD = '1234';
// Department code -> short prefix for the email. Codes are the ones migration 0014 creates.
const DEPARTMENTS = { MGT: 'mg', DC: 'dc', QA: 'qa', QC: 'qc', PD: 'pd', WH: 'wh', EN: 'en', RD: 'rd', PU: 'pu', HR: 'hr', AC: 'ac', SF: 'sf', LB: 'lb' };
// Level 2 asks, 4 reviews, 6 approves (L6 covers every type but the Quality Manual, which needs 8).
const ROLES = [[2, 'เจ้าหน้าที่'], [4, 'หัวหน้า'], [6, 'ผู้จัดการ']];
// Job titles in the seed read like "หัวหน้าฝ่ายผลิต".
const DEPT_TH = { MGT: 'ฝ่ายบริหาร', DC: 'ฝ่ายควบคุมเอกสาร', QA: 'ฝ่ายประกันคุณภาพ', QC: 'ฝ่ายควบคุมคุณภาพ', PD: 'ฝ่ายผลิต', WH: 'ฝ่ายคลังสินค้า', EN: 'ฝ่ายวิศวกรรม', RD: 'ฝ่ายวิจัยและพัฒนา', PU: 'ฝ่ายจัดซื้อ', HR: 'ฝ่ายบุคคล', AC: 'ฝ่ายบัญชี', SF: 'ฝ่ายความปลอดภัย', LB: 'ฝ่ายห้องปฏิบัติการ' };
// The DC department's L4 head (dc4) is the DCC supervisor and runs master data and admin alone, so dcc2 is the backup. The MGT L6 manager is the QMR and the DCC's boss; DCC accounts are
// kept out of the reviewer and approver pickers, so the boss is QMR rather than DCC.
const EXTRA = [
  { id: 'dcc2', name: 'DCC สำรอง', position: 'เจ้าหน้าที่ควบคุมเอกสาร (สำรอง)', dept: 'DC', level: 4, dcc: 1, qmr: 0 },
  { id: 'md', name: 'กรรมการผู้จัดการ', position: 'กรรมการผู้จัดการ', dept: 'MGT', level: 8, dcc: 0, qmr: 0 }
];

const q = (v) => `'${String(v).replaceAll("'", "''")}'`;
const hash = await hashPassword(PASSWORD);
const users = [
  ...Object.entries(DEPARTMENTS).flatMap(([dept, prefix]) => ROLES.map(([level, title]) => ({ id: `${prefix}${level}`, name: `${dept} ${title}${dept === 'DC' && level === 4 ? ' (DCC)' : ''}`, position: `${title}${DEPT_TH[dept]}`, dept, level, qmr: dept === 'MGT' && level === 6 ? 1 : 0, dcc: dept === 'DC' && level === 4 ? 1 : 0 }))),
  ...EXTRA
];
const sql = [
  ...users.map((u) => `INSERT INTO users (id, emp_id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc, is_qmr, must_change_password, position)
    VALUES (${[u.id, u.id, u.name, `${u.id}@t.co`, hash, u.dcc ? 'DCC_ADMIN' : 'GENERAL_USER', u.level, u.dept, JSON.stringify([u.dept])].map((v, i) => (i === 6 ? v : q(v))).join(', ')}, ${u.dcc}, ${u.qmr}, 0, ${q(u.position)});`),
  // Two places per department so a DAR can name where controlled copies go.
  ...Object.keys(DEPARTMENTS).flatMap((dept) => [['สำนักงาน', 'ตู้เอกสารหลัก'], ['หน้างาน', 'จุดใช้งานหน้างาน']]
    .map(([name, description]) => `INSERT INTO distribution_locations (id, department, name, description, is_master) VALUES (${q(`loc-${dept}-${name}`)}, ${q(dept)}, ${q(`${dept} ${name}`)}, ${q(description)}, ${name === 'สำนักงาน' ? 1 : 0});`))
];
// Production asks DCC and L5+ for an authenticator code at sign-in. Locally that would mean a phone for every test account, so it starts off;
// turn it on in Master Data > Security to try it.
sql.push("UPDATE settings SET value = '0' WHERE key IN ('two_factor_min_level', 'two_factor_for_dcc');");

// Sample VCC assets for localhost testing only (clearly labeled [ข้อมูลทดสอบ]).
const VCC_SEED = [
  { id: 'vcc-seed-st002', code: 'ST002', name: '[ข้อมูลทดสอบ] เทอร์โมมิเตอร์มาตรฐาน ST002', type: 'เทอร์โมมิเตอร์', serial: '40717388', model: 'Testo 176T4', location: 'ห้องปฏิบัติการ QC', dept: 'QC', isGroup: 0, parentId: null, status: 'ACTIVE', retiredReason: null },
  { id: 'vcc-seed-sw001', code: 'SW001', name: '[ข้อมูลทดสอบ] ตุ้มน้ำหนักมาตรฐานชุด 100 mg - 500 g (Class E2)', type: 'ตุ้มน้ำหนักมาตรฐาน', serial: '', model: 'Class E2', location: 'ห้องปฏิบัติการ QC', dept: 'QC', isGroup: 0, parentId: null, status: 'ACTIVE', retiredReason: null },
  { id: 'vcc-seed-tc001', code: 'TC001', name: '[ข้อมูลทดสอบ] Temperature Controller ห้องเย็น F1', type: 'Temperature Controller', serial: '', model: 'Dixell (Xweb) / XR120C', location: 'ห้องเย็น F1', dept: 'QC', isGroup: 0, parentId: null, status: 'ACTIVE', retiredReason: null },
  { id: 'vcc-seed-grp-scale', code: 'GRP-SCALE', name: '[ข้อมูลทดสอบ] กลุ่มเครื่องชั่งฝ่ายคลังสินค้า', type: 'เครื่องชั่ง', serial: '', model: '', location: 'คลังสินค้า (WH)', dept: 'WH', isGroup: 1, parentId: null, status: 'ACTIVE', retiredReason: null },
  { id: 'vcc-seed-sc001', code: 'SC-WH-001', name: '[ข้อมูลทดสอบ] เครื่องชั่งดิจิทัล จุดรับวัตถุดิบ 1', type: 'เครื่องชั่ง', serial: 'SN-WH-001', model: 'Mettler Toledo', location: 'จุดรับวัตถุดิบ WH', dept: 'WH', isGroup: 0, parentId: 'vcc-seed-grp-scale', status: 'ACTIVE', retiredReason: null },
  { id: 'vcc-seed-retired', code: 'T-OLD-01', name: '[ข้อมูลทดสอบ] เทอร์โมมิเตอร์รุ่นเก่า (ตัวอย่างปลดออก)', type: 'เทอร์โมมิเตอร์', serial: 'SN-OLD-99', model: 'Testo รุ่นเดิม', location: 'คลังเก็บเครื่องมือปลดระวาง', dept: 'QC', isGroup: 0, parentId: null, status: 'RETIRED', retiredReason: '[ข้อมูลทดสอบ] หน้าจอชำรุด ไม่คุ้มซ่อม' }
];
for (const a of VCC_SEED) {
  sql.push(
    `INSERT OR IGNORE INTO vcc_assets (id, asset_code, name, asset_type, serial_no, model, location, department, is_group, parent_id, status, retired_reason, retired_by, created_by, updated_by)
     VALUES (${[a.id, a.code, a.name, a.type, a.serial, a.model, a.location, a.dept].map(q).join(', ')}, ${a.isGroup}, ${a.parentId ? q(a.parentId) : 'NULL'}, ${q(a.status)}, ${a.retiredReason ? q(a.retiredReason) : 'NULL'}, ${a.status === 'RETIRED' ? q('dc4') : 'NULL'}, 'dc4', 'dc4');`
  );
  const createdDetails = JSON.stringify({ asset_id: a.id, asset_code: a.code, name: a.name, asset_type: a.type, department: a.dept, is_group: a.isGroup, parent_id: a.parentId, status: 'ACTIVE' });
  sql.push(
    `INSERT INTO audit_log (actor_id, action, details) SELECT 'dc4', 'VCC_ASSET_CREATED', ${q(createdDetails)} WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE action = 'VCC_ASSET_CREATED' AND json_extract(details, '$.asset_id') = ${q(a.id)});`
  );
  if (a.status === 'RETIRED') {
    const retiredDetails = JSON.stringify({ asset_id: a.id, asset_code: a.code, name: a.name, reason: a.retiredReason, before: { status: 'ACTIVE' }, after: { status: 'RETIRED' } });
    sql.push(
      `INSERT INTO audit_log (actor_id, action, details) SELECT 'dc4', 'VCC_ASSET_RETIRED', ${q(retiredDetails)} WHERE NOT EXISTS (SELECT 1 FROM audit_log WHERE action = 'VCC_ASSET_RETIRED' AND json_extract(details, '$.asset_id') = ${q(a.id)});`
    );
  }
}

mkdirSync('.wrangler', { recursive: true });
writeFileSync('.wrangler/seed-local.sql', `${sql.join('\n')}\n`);
console.log(`Wrote ${users.length} users, ${Object.keys(DEPARTMENTS).length * 2} places and ${VCC_SEED.length} VCC test assets to .wrangler/seed-local.sql`);
