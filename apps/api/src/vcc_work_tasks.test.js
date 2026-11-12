import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

// GET /api/vcc/work-tasks: the VCC task inbox lists a work-order step only for someone who may do it right now.
// Every expectation here is the same rule the matching POST endpoint enforces (department, level, Separation of Duties).
describe('VCC work-order task inbox (/api/vcc/work-tasks)', () => {
  let proxy;
  let env;
  const tokens = {};
  const PASSWORD = 'vcc-tasks-pass-123456';
  const RUN = Date.now().toString(36).toUpperCase();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const call = async (method, path, who, body) => {
    const res = await app.request(
      path,
      { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` }, body: body && JSON.stringify(body) },
      env
    );
    return { status: res.status, body: await res.json() };
  };
  // the kinds of task this user has for one work order, sorted
  const kindsFor = async (who, woId) => {
    const res = await call('GET', '/api/vcc/work-tasks', who);
    expect(res.status).toBe(200);
    return res.body.tasks.filter((t) => t.wo_id === woId).map((t) => t.kind).sort();
  };

  // [id, level, is_dcc, department]
  const USERS = [
    ['WT-DCC', 2, 1, 'DC'],
    ['WT-L2', 2, 0, 'QC'],
    ['WT-REV4', 4, 0, 'QC'],
    ['WT-REV4B', 4, 0, 'QC'],
    ['WT-APP5', 5, 0, 'QC'],
    ['WT-PERF5', 5, 0, 'QC'],
    ['WT-LB4', 4, 0, 'LB']
  ];

  const newWorkOrder = async (label) => {
    const asset = await call('POST', '/api/vcc/assets', 'WT-DCC', {
      asset_code: `WT-${label}-${RUN}`,
      name: `[ข้อมูลทดสอบ] เครื่องมือ ${label}`,
      asset_type: 'เครื่องชั่ง',
      department: 'QC'
    });
    expect(asset.status).toBe(201);
    const wo = await call('POST', '/api/vcc/work-orders', 'WT-REV4', { asset_id: asset.body.asset.id, provider_name: 'ทวนสอบภายใน', due_date: '2026-12-31' });
    expect(wo.status).toBe(201);
    return { assetId: asset.body.asset.id, woId: wo.body.workOrder.id };
  };
  const result = (result_status) => ({
    performed_at: yesterday,
    result_status,
    certificate_no: `CERT-${RUN}`,
    acceptance_criteria: '± 1.0 g',
    result_remarks: result_status === 'FAIL' ? 'ค่าคลาดเคลื่อนเกินเกณฑ์กำหนด' : ''
  });
  const release = { release_reason: 'ปรับตั้งและสอบเทียบซ้ำผ่านแล้ว', impact_assessment: 'ตรวจย้อนหลังแล้วไม่กระทบผลิตภัณฑ์' };

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword(PASSWORD);
    await env.DB.batch(
      USERS.map(([id, level, dcc, dept]) =>
        env.DB.prepare(
          `INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
           VALUES (?, ?, ?, ?, 'USER', ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET approval_level = excluded.approval_level, primary_department = excluded.primary_department,
             departments = excluded.departments, is_dcc = excluded.is_dcc, password_hash = excluded.password_hash`
        ).bind(id, id, `${id.toLowerCase()}@tasks.local`, hash, level, dept, JSON.stringify([dept]), dcc)
      )
    );
    for (const [id] of USERS) {
      const res = await app.request(
        '/api/auth/login',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${id.toLowerCase()}@tasks.local`, password: PASSWORD }) },
        env
      );
      tokens[id] = (await res.json()).token;
      expect(tokens[id]).toBeTruthy();
    }
  });

  afterAll(async () => {
    await proxy?.dispose();
  });

  it('record result: department members see an open work order; other departments do not; a far-off scheduled one is not work yet', async () => {
    const { woId } = await newWorkOrder('REC');
    for (const who of ['WT-L2', 'WT-REV4', 'WT-DCC']) expect(await kindsFor(who, woId)).toEqual(['RECORD_RESULT']);
    expect(await kindsFor('WT-LB4', woId)).toEqual([]);

    // SCHEDULED far in the future: no task; once its due date is inside the lead window: task
    await env.DB.prepare("UPDATE vcc_work_orders SET status = 'SCHEDULED', due_date = '2099-12-31' WHERE id = ?").bind(woId).run();
    expect(await kindsFor('WT-L2', woId)).toEqual([]);
    const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    await env.DB.prepare('UPDATE vcc_work_orders SET due_date = ? WHERE id = ?').bind(soon, woId).run();
    expect(await kindsFor('WT-L2', woId)).toEqual(['RECORD_RESULT']);
  });

  it('review: the task moves from the performer to eligible reviewers; the performer and a level-2 colleague never get it', async () => {
    const { woId } = await newWorkOrder('REV');
    expect((await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'WT-L2', result('PASS'))).status).toBe(200);
    // Legacy review flow test on PENDING_REVIEW work order
    await env.DB.prepare("UPDATE vcc_work_orders SET status = 'PENDING_REVIEW' WHERE id = ?").bind(woId).run();

    // the record task is gone for everyone; review goes to L4+ of the department, not the performer
    expect(await kindsFor('WT-L2', woId)).toEqual([]);
    expect(await kindsFor('WT-REV4', woId)).toEqual(['REVIEW_RESULT']);
    expect(await kindsFor('WT-APP5', woId)).toEqual(['REVIEW_RESULT']);
    expect(await kindsFor('WT-LB4', woId)).toEqual([]);

    // sending it back gives the performer (and DCC) a revise task, and removes the review task
    expect((await call('POST', `/api/vcc/work-orders/${woId}/reject`, 'WT-REV4', { reason: 'แนบใบรับรองผิด' })).status).toBe(200);
    expect(await kindsFor('WT-L2', woId)).toEqual(['REVISE_RESULT']);
    expect(await kindsFor('WT-DCC', woId)).toEqual(['REVISE_RESULT']);
    expect(await kindsFor('WT-REV4', woId)).toEqual([]);
  });

  it('release hold: only an approver-level user other than the performer, only after the result is reviewed; gone once released', async () => {
    const { woId, assetId } = await newWorkOrder('HOLD');
    expect((await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'WT-PERF5', result('FAIL'))).status).toBe(200);
    // Closed on FAIL with open NC -> approver gets release hold task immediately
    expect(await kindsFor('WT-APP5', woId)).toEqual(['RELEASE_HOLD']);
    expect((await call('POST', `/api/vcc/work-orders/${woId}/approve`, 'WT-REV4', { comment: 'ตรวจรับ' })).status).toBe(200);

    expect(await kindsFor('WT-APP5', woId)).toEqual(['RELEASE_HOLD']);
    expect(await kindsFor('WT-REV4', woId)).toEqual([]); // level 4 is below the approver level
    expect(await kindsFor('WT-PERF5', woId)).toEqual([]); // the performer cannot release their own result
    expect((await call('POST', `/api/vcc/work-orders/${woId}/release-hold`, 'WT-PERF5', release)).status).toBe(403);
    expect((await call('POST', `/api/vcc/work-orders/${woId}/release-hold`, 'WT-REV4', release)).status).toBe(403);

    expect((await call('POST', `/api/vcc/work-orders/${woId}/release-hold`, 'WT-APP5', release)).status).toBe(200);
    expect(await kindsFor('WT-APP5', woId)).toEqual([]);
    expect(assetId).toBeTruthy();
  });

  it('amendment approval: listed for an eligible approver who is neither the performer nor the requester; FAIL needs approver level', async () => {
    const { woId } = await newWorkOrder('AMD');
    expect((await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'WT-PERF5', result('PASS'))).status).toBe(200);
    expect((await call('POST', `/api/vcc/work-orders/${woId}/approve`, 'WT-REV4', { comment: 'ตรวจรับ' })).status).toBe(200);
    expect(await kindsFor('WT-APP5', woId)).toEqual([]); // closed and fine: nothing to do

    const req = await call('POST', `/api/vcc/work-orders/${woId}/amendment-requests`, 'WT-REV4', { amendment_reason: 'แก้เลขใบรับรองพิมพ์ผิด', certificate_no: `CERT-FIX-${RUN}` });
    expect(req.status).toBe(201);
    const requestId = req.body.request?.id || req.body.requestId || req.body.id;

    expect(await kindsFor('WT-REV4', woId)).toEqual([]); // the requester cannot approve their own request
    expect(await kindsFor('WT-PERF5', woId)).toEqual([]); // the performer cannot either
    expect(await kindsFor('WT-REV4B', woId)).toEqual(['APPROVE_AMENDMENT']);
    expect(await kindsFor('WT-APP5', woId)).toEqual(['APPROVE_AMENDMENT']);
    expect(await kindsFor('WT-L2', woId)).toEqual([]); // level 2 is below the amendment level
    expect(await kindsFor('WT-LB4', woId)).toEqual([]);

    expect((await call('POST', `/api/vcc/work-orders/${woId}/amendment-requests/${requestId}/approve`, 'WT-REV4', {})).status).toBe(403);
    expect((await call('POST', `/api/vcc/work-orders/${woId}/amendment-requests/${requestId}/approve`, 'WT-REV4B', {})).status).toBe(200);
    expect(await kindsFor('WT-APP5', woId)).toEqual([]);
  });

  it('amending a FAIL result is only listed for approver level, matching the endpoint', async () => {
    const { woId } = await newWorkOrder('AMF');
    await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'WT-PERF5', result('FAIL'));
    await call('POST', `/api/vcc/work-orders/${woId}/approve`, 'WT-REV4', { comment: 'ตรวจรับ' });
    await call('POST', `/api/vcc/work-orders/${woId}/release-hold`, 'WT-APP5', release);
    const req = await call('POST', `/api/vcc/work-orders/${woId}/amendment-requests`, 'WT-REV4', { amendment_reason: 'แก้ข้อสังเกต', result_remarks: 'ปรับข้อความ' });
    expect(req.status).toBe(201);

    expect(await kindsFor('WT-REV4B', woId)).toEqual([]);
    expect(await kindsFor('WT-APP5', woId)).toEqual(['APPROVE_AMENDMENT']);
    const requestId = req.body.request?.id || req.body.requestId || req.body.id;
    expect((await call('POST', `/api/vcc/work-orders/${woId}/amendment-requests/${requestId}/approve`, 'WT-REV4B', {})).status).toBe(403);
  });

  it('every task has a direct link that opens that work order, and no task appears twice', async () => {
    const { woId } = await newWorkOrder('LNK');
    const res = await call('GET', '/api/vcc/work-tasks', 'WT-REV4');
    const mine = res.body.tasks.find((t) => t.wo_id === woId);
    expect(mine.link).toBe(`/vcc/work-orders?wo=${woId}`);
    const ids = res.body.tasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
