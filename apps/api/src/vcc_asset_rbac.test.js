import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';
import { canManageVccAsset, manageableVccDepartments } from './vccAuth.js';

const PASSWORD = 'test-password-123';
const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const TYPE = 'เทอร์โมมิเตอร์';

// [id, primary dept, departments, approval level, is_dcc, is_qmr]
const USERS = [
  ['AR-DCC', 'DC', ['DC'], 4, 1, 0],
  ['AR-QC2', 'QC', ['QC'], 2, 0, 0],
  ['AR-QC4', 'QC', ['QC'], 4, 0, 0],
  ['AR-LB4', 'LB', ['LB'], 4, 0, 0],
  ['AR-QC6', 'QC', ['QC'], 6, 0, 0],
  ['AR-MGT6', 'MGT', ['MGT'], 6, 0, 1],
  ['AR-PD5', 'PD', ['PD'], 5, 0, 0]
];

describe('VCC asset register — department-based management (RBAC)', () => {
  let proxy;
  let env;
  const tokens = {};
  const ids = {};
  let originalTypes;

  const call = async (method, path, asUser, body) => {
    const res = await app.request(
      path,
      {
        method,
        headers: { 'Content-Type': 'application/json', ...(asUser ? { Authorization: `Bearer ${tokens[asUser]}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      },
      env
    );
    return { status: res.status, body: await res.json() };
  };
  const newAsset = (dept, suffix, extra = {}) => ({
    asset_code: `RB-${RUN}-${suffix}`, name: `rbac ${suffix}`, asset_type: TYPE, department: dept, ...extra
  });

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret', DISABLE_LOGIN_THROTTLE: '1' };
    const hash = await hashPassword(PASSWORD);
    const typesRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'vcc_asset_types'").first();
    originalTypes = typesRow?.value;
    await env.DB.prepare(
      `INSERT INTO settings (key, value) VALUES ('vcc_asset_types', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`
    ).bind(JSON.stringify([TYPE])).run();
    await env.DB.batch([
      ...['DC', 'QC', 'MGT', 'LB', 'PD'].map((code) =>
        env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES (?, ?, 'ACTIVE')").bind(code, code)),
      ...USERS.map(([id, dept, depts, level, dcc, qmr]) =>
        env.DB.prepare(
          `INSERT OR REPLACE INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc, is_qmr, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`
        ).bind(id, id, `${id}@asset-rbac.local`, hash, dcc ? 'DCC_ADMIN' : 'GENERAL_USER', level, dept, JSON.stringify(depts), dcc, qmr))
    ]);
    for (const [id] of USERS) {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `${id}@asset-rbac.local`, password: PASSWORD })
      }, env);
      tokens[id] = (await res.json()).token;
    }
    const qc = await call('POST', '/api/vcc/assets', 'AR-DCC', newAsset('QC', 'QC1'));
    const lb = await call('POST', '/api/vcc/assets', 'AR-DCC', newAsset('LB', 'LB1'));
    ids.qc = qc.body.asset.id;
    ids.lb = lb.body.asset.id;
  });

  afterAll(async () => {
    try {
      await env.DB.prepare('DELETE FROM vcc_work_orders WHERE wo_code LIKE ?').bind(`RB-${RUN}-%`).run();
      if (originalTypes) await env.DB.prepare("UPDATE settings SET value = ? WHERE key = 'vcc_asset_types'").bind(originalTypes).run();
    } catch {}
    await proxy?.dispose();
  });

  it('shared helper: DCC all, L4+ own VCC departments only, seniority and QMR add nothing', () => {
    expect(manageableVccDepartments({ isDcc: true })).toEqual(['DC', 'QC', 'QA', 'MGT', 'LB']);
    expect(canManageVccAsset({ approval_level: 4, department: 'QC', depts: ['QC'] }, 'qc')).toBe(true);
    expect(canManageVccAsset({ approval_level: 4, department: 'QC', depts: ['QC'] }, 'LB')).toBe(false);
    expect(canManageVccAsset({ approval_level: 3, department: 'QC', depts: ['QC'] }, 'QC')).toBe(false);
    expect(canManageVccAsset({ approval_level: 7, isQmr: true, department: 'MGT', depts: ['MGT'] }, 'QC')).toBe(false);
    expect(canManageVccAsset({ approval_level: 5, department: 'PD', depts: ['PD'] }, 'PD')).toBe(false);
  });

  it('QC L2 can read but cannot add, edit, retire or reactivate', async () => {
    expect((await call('GET', '/api/vcc/assets', 'AR-QC2')).status).toBe(200);
    expect((await call('POST', '/api/vcc/assets', 'AR-QC2', newAsset('QC', 'L2'))).status).toBe(403);
    expect((await call('PUT', `/api/vcc/assets/${ids.qc}`, 'AR-QC2', { name: 'x' })).status).toBe(403);
    expect((await call('POST', `/api/vcc/assets/${ids.qc}/retire`, 'AR-QC2', { reason: 'x' })).status).toBe(403);
    expect((await call('POST', `/api/vcc/assets/${ids.qc}/reactivate`, 'AR-QC2', { reason: 'x' })).status).toBe(403);
  });

  it('QC L4 adds, edits, retires and reactivates a QC asset; the department comes from the server, not the request', async () => {
    // No department sent → the user's own department is used.
    const created = await call('POST', '/api/vcc/assets', 'AR-QC4', { ...newAsset('', 'QC4A'), department: undefined });
    expect(created.status).toBe(201);
    expect(created.body.asset.department).toBe('QC');
    const id = created.body.asset.id;

    expect((await call('POST', '/api/vcc/assets', 'AR-QC4', newAsset('QC', 'QC4A'))).status).toBe(409);

    const edited = await call('PUT', `/api/vcc/assets/${id}`, 'AR-QC4', { name: 'renamed by QC' });
    expect(edited.status).toBe(200);
    expect(edited.body.asset.name).toBe('renamed by QC');

    expect((await call('POST', `/api/vcc/assets/${id}/retire`, 'AR-QC4', {})).status).toBe(400);
    const retired = await call('POST', `/api/vcc/assets/${id}/retire`, 'AR-QC4', { reason: 'ชำรุด' });
    expect(retired.status).toBe(200);
    expect(retired.body.asset.status).toBe('RETIRED');
    const back = await call('POST', `/api/vcc/assets/${id}/reactivate`, 'AR-QC4', { reason: 'ซ่อมแล้ว' });
    expect(back.status).toBe(200);
    expect(back.body.asset.status).toBe('ACTIVE');

    // Audit trail names the QC user and keeps before/after.
    const detail = await call('GET', `/api/vcc/assets/${id}`, 'AR-QC4');
    const actions = detail.body.history.map((h) => h.action);
    expect(actions).toEqual(expect.arrayContaining(['VCC_ASSET_CREATED', 'VCC_ASSET_UPDATED', 'VCC_ASSET_RETIRED', 'VCC_ASSET_REACTIVATED']));
    expect(detail.body.history.every((h) => h.actor_id === 'AR-QC4')).toBe(true);
    const updated = detail.body.history.find((h) => h.action === 'VCC_ASSET_UPDATED');
    expect(updated.details.before.name).toBe(`rbac QC4A`);
    expect(updated.details.after.name).toBe('renamed by QC');
  });

  it('QC L4 cannot touch LB assets or create one for LB, even by calling the API directly', async () => {
    expect((await call('POST', '/api/vcc/assets', 'AR-QC4', newAsset('LB', 'X1'))).status).toBe(403);
    expect((await call('PUT', `/api/vcc/assets/${ids.lb}`, 'AR-QC4', { name: 'hijack' })).status).toBe(403);
    expect((await call('POST', `/api/vcc/assets/${ids.lb}/retire`, 'AR-QC4', { reason: 'x' })).status).toBe(403);
    expect((await call('POST', `/api/vcc/assets/${ids.lb}/reactivate`, 'AR-QC4', { reason: 'x' })).status).toBe(403);
    const lb = await call('GET', `/api/vcc/assets/${ids.lb}`, 'AR-DCC');
    expect(lb.body.asset.name).toBe('rbac LB1');
  });

  it('QC L4 cannot transfer an asset to another department; DCC can and it is audited', async () => {
    const t = await call('PUT', `/api/vcc/assets/${ids.qc}`, 'AR-QC4', { department: 'LB' });
    expect(t.status).toBe(403);
    const moved = await call('PUT', `/api/vcc/assets/${ids.qc}`, 'AR-DCC', { department: 'LB' });
    expect(moved.status).toBe(200);
    expect(moved.body.asset.department).toBe('LB');
    const hist = (await call('GET', `/api/vcc/assets/${ids.qc}`, 'AR-DCC')).body.history.find((h) => h.action === 'VCC_ASSET_UPDATED');
    expect(hist.details.before.department).toBe('QC');
    expect(hist.details.after.department).toBe('LB');
    await call('PUT', `/api/vcc/assets/${ids.qc}`, 'AR-DCC', { department: 'QC' });
  });

  it('LB L4 manages LB assets but not QC assets', async () => {
    expect((await call('PUT', `/api/vcc/assets/${ids.lb}`, 'AR-LB4', { name: 'lb edit' })).status).toBe(200);
    expect((await call('PUT', `/api/vcc/assets/${ids.qc}`, 'AR-LB4', { name: 'nope' })).status).toBe(403);
    const own = await call('POST', '/api/vcc/assets', 'AR-LB4', { ...newAsset('', 'LB4A'), department: undefined });
    expect(own.body.asset?.department).toBe('LB');
  });

  it('L6 and QMR/MGT get no cross-department write access; non-VCC departments get none at all', async () => {
    expect((await call('PUT', `/api/vcc/assets/${ids.lb}`, 'AR-QC6', { name: 'senior' })).status).toBe(403);
    expect((await call('POST', '/api/vcc/assets', 'AR-QC6', newAsset('LB', 'L6X'))).status).toBe(403);
    expect((await call('PUT', `/api/vcc/assets/${ids.qc}`, 'AR-QC6', { name: 'own dept ok' })).status).toBe(200);
    expect((await call('PUT', `/api/vcc/assets/${ids.qc}`, 'AR-MGT6', { name: 'qmr' })).status).toBe(403);
    expect((await call('POST', `/api/vcc/assets/${ids.qc}/retire`, 'AR-MGT6', { reason: 'x' })).status).toBe(403);
    expect((await call('GET', '/api/vcc/assets', 'AR-MGT6')).status).toBe(200);
    expect((await call('POST', '/api/vcc/assets', 'AR-PD5', newAsset('PD', 'PD1'))).status).toBe(403);
  });

  it('asset types stay DCC-only', async () => {
    expect((await call('PUT', '/api/vcc/asset-types', 'AR-QC4', { assetTypes: [TYPE] })).status).toBe(403);
    expect((await call('PUT', '/api/vcc/asset-types', 'AR-DCC', { assetTypes: [TYPE] })).status).toBe(200);
  });

  it('retire is refused while the asset has an open work order; impact is reported; closed history is untouched', async () => {
    const created = await call('POST', '/api/vcc/assets', 'AR-QC4', newAsset('QC', 'WO1'));
    const id = created.body.asset.id;
    await env.DB.prepare(
      `INSERT INTO vcc_work_orders (id, wo_code, asset_id, provider_name, due_date, original_due_date, status)
       VALUES (?, ?, ?, 'ผู้ให้บริการ', '2099-01-31', '2099-01-31', 'OPEN')`
    ).bind(`rb-wo-${RUN}`, `RB-${RUN}-WO`, id).run();

    const impact = await call('GET', `/api/vcc/assets/${id}/impact`, 'AR-QC4');
    expect(impact.body.impact.open_work_orders).toBe(1);

    const blocked = await call('POST', `/api/vcc/assets/${id}/retire`, 'AR-QC4', { reason: 'x' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toContain('ใบสั่งงาน');
    expect((await call('GET', `/api/vcc/assets/${id}`, 'AR-QC4')).body.asset.status).toBe('ACTIVE');

    await env.DB.prepare("UPDATE vcc_work_orders SET status = 'CANCELLED' WHERE id = ?").bind(`rb-wo-${RUN}`).run();
    expect((await call('POST', `/api/vcc/assets/${id}/retire`, 'AR-QC4', { reason: 'x' })).status).toBe(200);
    // The other department cannot even read the impact of an asset it cannot see.
    expect((await call('GET', `/api/vcc/assets/${id}/impact`, 'AR-LB4')).status).toBe(403);
  });

  it('concurrent creates with the same code: exactly one wins', async () => {
    const body = newAsset('QC', 'DUP');
    const results = await Promise.all([1, 2, 3].map(() => call('POST', '/api/vcc/assets', 'AR-QC4', body)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
  });
});
