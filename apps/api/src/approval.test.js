import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';
import { checkDecisionRights, getThresholds } from './approval.js';

const user = (over) => ({ id: 'U', approval_level: 5, department: 'PD', depts: ['PD'], isDcc: false, isQmr: false, ...over });
const SOP = { required_reviewer_level: 4, required_approver_level: 6 };
const WI = { required_reviewer_level: 4, required_approver_level: 5 };
const doc = { department: 'PD', requesterId: 'REQ', reviewerId: 'REV' };

describe('checkDecisionRights', () => {
  it('allows a same-department user at the matrix level', () => {
    expect(checkDecisionRights(user(), { ...doc, stage: 'REVIEW' }, SOP)).toBeNull();
    expect(checkDecisionRights(user(), { ...doc, stage: 'APPROVE' }, WI)).toBeNull();
  });

  it('follows the matrix per doc type: SOP approval needs L6, WI only L5', () => {
    expect(checkDecisionRights(user(), { ...doc, stage: 'APPROVE' }, SOP)).toMatch('L6');
    expect(checkDecisionRights(user({ approval_level: 3 }), { ...doc, stage: 'REVIEW' }, SOP)).toMatch('L4');
  });

  it('never lets the requester decide, nor the reviewer approve', () => {
    expect(checkDecisionRights(user({ id: 'REQ', approval_level: 8 }), { ...doc, stage: 'REVIEW' }, WI)).toMatch('ผู้ขอ');
    expect(checkDecisionRights(user({ id: 'REQ', approval_level: 8 }), { ...doc, stage: 'APPROVE' }, WI)).toMatch('ผู้ขอ');
    expect(checkDecisionRights(user({ id: 'REV' }), { ...doc, stage: 'APPROVE' }, WI)).toMatch('ผู้ทบทวน');
  });

  it('blocks other departments unless cross-org authority, and DCC outside DC', () => {
    expect(checkDecisionRights(user({ department: 'QC', depts: ['QC'] }), { ...doc, stage: 'REVIEW' }, WI)).toMatch('แผนก');
    expect(checkDecisionRights(user({ department: 'MGT', depts: ['MGT'] }), { ...doc, stage: 'REVIEW' }, WI)).toBeNull();
    expect(checkDecisionRights(user({ department: 'QC', depts: ['QC'], approval_level: 6 }), { ...doc, stage: 'APPROVE' }, SOP)).toBeNull();
    expect(checkDecisionRights(user({ isDcc: true, approval_level: 8 }), { ...doc, stage: 'REVIEW' }, WI)).toMatch('DCC');
    expect(checkDecisionRights(user({ isDcc: true, department: 'DC', depts: ['DC'] }), { ...doc, department: 'DC', stage: 'REVIEW' }, WI)).toBeNull();
  });

  it('rejects an unknown stage', () => {
    expect(checkDecisionRights(user(), { ...doc, stage: 'PUBLISH' }, WI)).not.toBeNull();
  });
});

describe('approval matrix API', () => {
  let proxy;
  let env;
  const tokens = {};
  const call = (path, token, init = {}) => app.request(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  }, env);

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword('matrix-pass');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
        VALUES ('M-DCC', 'DCC', 'm-dcc@test.local', ?, 'DCC_ADMIN', 4, 'DC', '["DC"]', 1)`).bind(hash),
      env.DB.prepare(`INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments)
        VALUES ('M-PD', 'PD', 'm-pd@test.local', ?, 'DEPT_ADMIN', 6, 'PD', '["PD"]')`).bind(hash)
    ]);
    for (const [key, email] of [['dcc', 'm-dcc@test.local'], ['pd', 'm-pd@test.local']]) {
      const res = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'matrix-pass' }) }, env);
      tokens[key] = (await res.json()).token;
    }
  });

  afterAll(() => proxy?.dispose());

  it('serves the seeded matrix to any signed-in user', async () => {
    const res = await call('/api/approval-matrix', tokens.pd);
    const { matrix } = await res.json();
    expect(matrix.find((m) => m.doc_type === 'SOP')).toMatchObject({ required_reviewer_level: 4, required_approver_level: 6 });
    expect(await getThresholds(env.DB, 'ed')).toMatchObject({ required_approver_level: 5 });
    // Retiring an external document needs one level more than the matrix's level for adding or changing it.
    expect(await getThresholds(env.DB, 'ed', 'OBSOLETE')).toMatchObject({ required_approver_level: 6 });
    expect(await getThresholds(env.DB, 'sop', 'OBSOLETE')).toMatchObject({ required_approver_level: 6 });
    expect(matrix.map((m) => m.doc_type)).toEqual(['ED', 'FM', 'QM', 'QP', 'SD', 'SOP', 'WI']);
    expect(await getThresholds(env.DB, 'UNKNOWN')).toMatchObject({ required_approver_level: 5 });
  });

  it('lets only DCC change it, validates levels, and audits before/after', async () => {
    const body = (r, a) => JSON.stringify({ min_requester_level: 1, required_reviewer_level: r, required_approver_level: a });
    expect((await call('/api/approval-matrix/WI', tokens.pd, { method: 'PUT', body: body(4, 6) })).status).toBe(403);
    expect((await call('/api/approval-matrix/WI', tokens.dcc, { method: 'PUT', body: body(6, 5) })).status).toBe(400);
    expect((await call('/api/approval-matrix/WI', tokens.dcc, { method: 'PUT', body: body(4, 9) })).status).toBe(400);
    expect((await call('/api/approval-matrix/XX', tokens.dcc, { method: 'PUT', body: body(4, 6) })).status).toBe(404);

    const res = await call('/api/approval-matrix/wi', tokens.dcc, { method: 'PUT', body: body(4, 6) });
    expect(res.status).toBe(200);
    expect((await res.json()).entry).toMatchObject({ doc_type: 'WI', required_approver_level: 6, updated_by: 'M-DCC' });
    const log = await env.DB.prepare("SELECT details FROM audit_log WHERE action = 'APPROVAL_MATRIX_UPDATED'").first();
    expect(JSON.parse(log.details)).toMatchObject({ doc_type: 'WI', before: { required_approver_level: 5 }, after: { required_approver_level: 6 } });
  });
});
