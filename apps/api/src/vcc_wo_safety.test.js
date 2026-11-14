import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

// Work-order state safety: one winner per transition under double clicks / concurrent requests, the INCONCLUSIVE retest path,
// who may cancel a work order, and when an ON_HOLD instrument may be released.
describe('VCC work-order safety (atomic transitions, INCONCLUSIVE, cancellation, hold release)', () => {
  let proxy;
  let env;
  const tokens = {};
  const PASSWORD = 'vcc-safety-pass-123456';
  const RUN = Date.now().toString(36).toUpperCase();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const call = async (method, path, who, body) => {
    const res = await app.request(
      path,
      {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` },
        body: body && JSON.stringify(body)
      },
      env
    );
    return { status: res.status, body: await res.json() };
  };
  const auditCount = async (action, woId) =>
    env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = ? AND json_extract(details, '$.wo_id') = ?").bind(action, woId).first('n');
  const assetStatus = async (assetId) => env.DB.prepare('SELECT status FROM vcc_assets WHERE id = ?').bind(assetId).first('status');

  // [id, level, is_dcc, department]
  const USERS = [
    ['SF-DCC', 2, 1, 'DC'],
    ['SF-DCC2', 2, 1, 'DC'],
    ['SF-L2', 2, 0, 'QC'],
    ['SF-REV4', 4, 0, 'QC'],
    ['SF-REV4B', 4, 0, 'QC'],
    ['SF-APP5', 5, 0, 'QC'],
    ['SF-PERF5', 5, 0, 'QC'],
    ['SF-LB4', 4, 0, 'LB'],
    ['SF-LB6', 6, 0, 'LB']
  ];

  const newWorkOrder = async (label) => {
    const asset = await call('POST', '/api/vcc/assets', 'SF-DCC', {
      asset_code: `SF-${label}-${RUN}`,
      name: `[ข้อมูลทดสอบ] เครื่องมือ ${label}`,
      asset_type: 'เครื่องชั่ง',
      department: 'QC'
    });
    expect(asset.status).toBe(201);
    const wo = await call('POST', '/api/vcc/work-orders', 'SF-REV4', {
      asset_id: asset.body.asset.id,
      provider_name: 'ทวนสอบภายใน',
      due_date: '2026-12-31'
    });
    expect(wo.status).toBe(201);
    return { assetId: asset.body.asset.id, woId: wo.body.workOrder.id };
  };
  const result = (result_status, certificate_no = `CERT-${RUN}`) => ({
    performed_at: yesterday,
    result_status,
    certificate_no,
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
        ).bind(id, id, `${id.toLowerCase()}@safety.local`, hash, level, dept, JSON.stringify([dept]), dcc)
      )
    );
    for (const [id] of USERS) {
      const res = await app.request(
        '/api/auth/login',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${id.toLowerCase()}@safety.local`, password: PASSWORD }) },
        env
      );
      tokens[id] = (await res.json()).token;
      expect(tokens[id]).toBeTruthy();
    }
  });

  afterAll(async () => {
    await proxy?.dispose();
  });

  it('B1: concurrent approvals and approve-vs-reject leave exactly one outcome and one matching audit row', async () => {
    const { woId } = await newWorkOrder('APPROVE');
    expect((await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'SF-L2', result('PASS'))).status).toBe(200);
    // Put in PENDING_REVIEW to test atomic race condition on approval
    await env.DB.prepare("UPDATE vcc_work_orders SET status = 'PENDING_REVIEW' WHERE id = ?").bind(woId).run();

    const [a, b] = await Promise.all([
      call('POST', `/api/vcc/work-orders/${woId}/approve`, 'SF-REV4', { comment: 'ตรวจรับ' }),
      call('POST', `/api/vcc/work-orders/${woId}/approve`, 'SF-REV4B', { comment: 'ตรวจรับเช่นกัน' })
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await auditCount('VCC_WO_APPROVED', woId)).toBe(1);

    const { woId: raceId } = await newWorkOrder('RACE');
    await call('POST', `/api/vcc/work-orders/${raceId}/submit-result`, 'SF-L2', result('PASS'));
    await env.DB.prepare("UPDATE vcc_work_orders SET status = 'PENDING_REVIEW' WHERE id = ?").bind(raceId).run();
    const [approve, reject] = await Promise.all([
      call('POST', `/api/vcc/work-orders/${raceId}/approve`, 'SF-REV4', { comment: 'ตรวจรับ' }),
      call('POST', `/api/vcc/work-orders/${raceId}/reject`, 'SF-REV4B', { reason: 'แนบใบรับรองผิด' })
    ]);
    expect([approve.status, reject.status].sort()).toEqual([200, 409]);
    const final = (await call('GET', `/api/vcc/work-orders/${raceId}`, 'SF-REV4')).body.workOrder.status;
    expect(final).toBe(approve.status === 200 ? 'CLOSED' : 'REJECTED');
    expect(await auditCount('VCC_WO_APPROVED', raceId)).toBe(approve.status === 200 ? 1 : 0);
    expect(await auditCount('VCC_WO_REJECTED', raceId)).toBe(reject.status === 200 ? 1 : 0);
  });

  it('B1: a result closes the work order, one other person verifies it once, and a later verifier is refused', async () => {
    const { woId } = await newWorkOrder('VERIFY-ONCE');
    expect((await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'SF-L2', result('PASS'))).status).toBe(200);
    const closed = (await call('GET', `/api/vcc/work-orders/${woId}`, 'SF-REV4')).body.workOrder;
    expect(closed.status).toBe('CLOSED');
    expect(closed.reviewed_by).toBeNull();

    const first = await call('POST', `/api/vcc/work-orders/${woId}/approve`, 'SF-REV4', { comment: 'ตรวจรับ' });
    expect(first.status).toBe(200);
    expect(first.body.workOrder.reviewed_by).toBe('SF-REV4');

    const late = await call('POST', `/api/vcc/work-orders/${woId}/approve`, 'SF-REV4B', { comment: 'ตรวจรับซ้ำ' });
    expect(late.status).toBe(409);
    const after = (await call('GET', `/api/vcc/work-orders/${woId}`, 'SF-REV4')).body.workOrder;
    expect(after.reviewed_by).toBe('SF-REV4');
    expect(await auditCount('VCC_WO_APPROVED', woId)).toBe(1);
  });

  it('B1: two people verifying a closed work order at the same moment leave one verifier and one audit row', async () => {
    const { woId } = await newWorkOrder('VERIFY-RACE');
    expect((await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'SF-L2', result('PASS'))).status).toBe(200);
    const [a, b] = await Promise.all([
      call('POST', `/api/vcc/work-orders/${woId}/approve`, 'SF-REV4', { comment: 'ตรวจรับ' }),
      call('POST', `/api/vcc/work-orders/${woId}/approve`, 'SF-REV4B', { comment: 'ตรวจรับเช่นกัน' })
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = a.status === 200 ? 'SF-REV4' : 'SF-REV4B';
    expect((await call('GET', `/api/vcc/work-orders/${woId}`, 'SF-REV4')).body.workOrder.reviewed_by).toBe(winner);
    expect(await auditCount('VCC_WO_APPROVED', woId)).toBe(1);
  });

  it('B1: approving a work order that is already closed is refused and changes nothing, whoever asks', async () => {
    const { woId } = await newWorkOrder('APPROVE-AGAIN');
    expect((await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'SF-L2', result('PASS'))).status).toBe(200);
    await env.DB.prepare("UPDATE vcc_work_orders SET status = 'PENDING_REVIEW' WHERE id = ?").bind(woId).run();
    expect((await call('POST', `/api/vcc/work-orders/${woId}/approve`, 'SF-REV4', { comment: 'ตรวจรับ' })).status).toBe(200);

    const before = (await call('GET', `/api/vcc/work-orders/${woId}`, 'SF-REV4')).body.workOrder;
    expect(before.status).toBe('CLOSED');

    // A second approver, and the first one again: both arrive after the work order closed.
    for (const who of ['SF-REV4B', 'SF-REV4']) {
      const again = await call('POST', `/api/vcc/work-orders/${woId}/approve`, who, { comment: 'ตรวจรับซ้ำ' });
      expect(again.status).toBe(409);
    }

    const after = (await call('GET', `/api/vcc/work-orders/${woId}`, 'SF-REV4')).body.workOrder;
    expect(after.reviewed_by).toBe(before.reviewed_by);
    expect(after.reviewed_at).toBe(before.reviewed_at);
    expect(after.review_comment).toBe(before.review_comment);
    expect(await auditCount('VCC_WO_APPROVED', woId)).toBe(1);
  });

  it('B1: a double-clicked result submission records one result and one audit row', async () => {
    const { woId } = await newWorkOrder('SUBMIT');
    const [a, b] = await Promise.all([
      call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'SF-L2', result('PASS')),
      call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'SF-L2', result('PASS'))
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await auditCount('VCC_WO_RESULT_SUBMITTED', woId)).toBe(1);
  });

  it('D1: INCONCLUSIVE holds the instrument, cannot be closed, is retested on the same work order and keeps its history', async () => {
    const { assetId, woId } = await newWorkOrder('INCON');
    const first = await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'SF-PERF5', result('INCONCLUSIVE', `CERT-INC-${RUN}`));
    expect(first.status).toBe(200);
    expect(first.body.workOrder.nc_status).toBe('OPEN');
    expect(await assetStatus(assetId)).toBe('ON_HOLD');

    const closeAttempt = await call('POST', `/api/vcc/work-orders/${woId}/approve`, 'SF-REV4', { comment: 'ปิดงาน' });
    expect(closeAttempt.status).toBe(409);
    expect(closeAttempt.body.error).toMatch(/INCONCLUSIVE/);
    // Not reviewed yet, so no one can release the hold
    expect((await call('POST', `/api/vcc/work-orders/${woId}/release-hold`, 'SF-APP5', release)).status).toBe(409);

    expect((await call('POST', `/api/vcc/work-orders/${woId}/reject`, 'SF-REV4', { reason: 'ส่งตรวจซ้ำ' })).status).toBe(200);
    const rejectAudit = await env.DB.prepare("SELECT details FROM audit_log WHERE action = 'VCC_WO_REJECTED' AND json_extract(details, '$.wo_id') = ?").bind(woId).first('details');
    expect(JSON.parse(rejectAudit).rejected_result).toMatchObject({ result_status: 'INCONCLUSIVE', certificate_no: `CERT-INC-${RUN}` });

    const retest = await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'SF-PERF5', result('PASS', `CERT-RETEST-${RUN}`));
    expect(retest.status).toBe(200);
    expect(retest.body.workOrder.nc_status).toBe('OPEN');
    expect(await assetStatus(assetId)).toBe('ON_HOLD');
    expect((await call('POST', `/api/vcc/work-orders/${woId}/approve`, 'SF-REV4', { comment: 'ตรวจซ้ำผ่าน' })).status).toBe(200);
    // Approving the PASS retest does not release the hold by itself
    expect(await assetStatus(assetId)).toBe('ON_HOLD');

    // D3: the performer (even at L5) cannot release; another L5 can, with reason and impact assessment
    expect((await call('POST', `/api/vcc/work-orders/${woId}/release-hold`, 'SF-PERF5', release)).status).toBe(403);
    expect((await call('POST', `/api/vcc/work-orders/${woId}/release-hold`, 'SF-APP5', { impact_assessment: 'ประเมินแล้ว' })).status).toBe(400);
    // Two approvers release at the same moment: one wins, one audit row
    const [r1, r2] = await Promise.all([
      call('POST', `/api/vcc/work-orders/${woId}/release-hold`, 'SF-APP5', release),
      call('POST', `/api/vcc/work-orders/${woId}/release-hold`, 'SF-LB6', release)
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect(await auditCount('VCC_WO_HOLD_RELEASED', woId)).toBe(1);
    expect(await assetStatus(assetId)).toBe('ACTIVE');
    const releaseAudit = await env.DB.prepare("SELECT details FROM audit_log WHERE action = 'VCC_WO_HOLD_RELEASED' AND json_extract(details, '$.wo_id') = ?").bind(woId).first('details');
    expect(JSON.parse(releaseAudit)).toMatchObject({ release_reason: release.release_reason, impact_assessment: release.impact_assessment, performed_by: 'SF-PERF5' });

    // Both results stay traceable and no extra work order was issued
    expect(await auditCount('VCC_WO_RESULT_SUBMITTED', woId)).toBe(2);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM vcc_work_orders WHERE asset_id = ?').bind(assetId).first('n')).toBe(1);

    // A closed record cannot be amended to INCONCLUSIVE
    const amend = await call('POST', `/api/vcc/work-orders/${woId}/amendment-requests`, 'SF-REV4', { amendment_reason: 'ทดสอบ', result_status: 'INCONCLUSIVE' });
    expect(amend.status).toBe(400);
  });

  it('D2: only DCC or L4+ of the owning department may cancel; the reason is required and the plan cycle is untouched', async () => {
    const { woId } = await newWorkOrder('CANCEL');
    const body = { cancellation_category: 'MISTAKE_CREATION', cancellation_reason: 'ออกใบงานผิดเครื่อง' };
    expect((await call('POST', `/api/vcc/work-orders/${woId}/cancel`, 'SF-L2', body)).status).toBe(403);
    expect((await call('POST', `/api/vcc/work-orders/${woId}/cancel`, 'SF-LB4', body)).status).toBe(403);
    // L6 of another department may read and approve plans, but cancelling stays with the owning department or DCC
    expect((await call('POST', `/api/vcc/work-orders/${woId}/cancel`, 'SF-LB6', body)).status).toBe(403);
    expect((await call('POST', `/api/vcc/work-orders/${woId}/cancel`, 'SF-REV4', { ...body, cancellation_reason: '' })).status).toBe(400);

    const [a, b] = await Promise.all([
      call('POST', `/api/vcc/work-orders/${woId}/cancel`, 'SF-REV4', body),
      call('POST', `/api/vcc/work-orders/${woId}/cancel`, 'SF-REV4B', body)
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await auditCount('VCC_WO_CANCELLED', woId)).toBe(1);

    const { woId: dccWo } = await newWorkOrder('CANCEL-DCC');
    expect((await call('POST', `/api/vcc/work-orders/${dccWo}/cancel`, 'SF-DCC', { cancellation_category: 'AUTHORIZED_CANCEL', cancellation_reason: 'DCC ยกเลิก' })).status).toBe(200);
  });

  it('D2: a work order with an open NC cannot be cancelled, so its ON_HOLD instrument is never stranded', async () => {
    const { assetId, woId } = await newWorkOrder('CANCEL-NC');
    await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'SF-L2', result('FAIL'));
    const cancel = await call('POST', `/api/vcc/work-orders/${woId}/cancel`, 'SF-REV4', { cancellation_category: 'MISTAKE_CREATION', cancellation_reason: 'ยกเลิก' });
    expect(cancel.status).toBe(409);
    expect(await assetStatus(assetId)).toBe('ON_HOLD');
  });

  it('B1: reschedule — direct override is DCC only, no-op refused, double click and concurrent requests (same or different dates) move the date once, with one audit row', async () => {
    const { woId } = await newWorkOrder('RESCHED');
    const reschedule = (who, date, reason = 'รอคิวห้องแล็บ') => call('POST', `/api/vcc/work-orders/${woId}/reschedule`, who, { new_due_date: date, reason });
    const dueDate = async () => (await call('GET', `/api/vcc/work-orders/${woId}`, 'SF-DCC')).body.workOrder;

    // Non-DCC user (L4 in department) is strictly refused with 403 (Direct Override requires DCC)
    expect((await reschedule('SF-REV4', '2027-01-15')).status).toBe(403);

    // Same date as today: refused, nothing written
    const noop = await reschedule('SF-DCC', '2026-12-31');
    expect(noop.status).toBe(400);
    expect(await auditCount('VCC_WO_RESCHEDULED', woId)).toBe(0);

    // Same date from two requests at once: one moves it, the other built on the old date gets 409
    const [a, b] = await Promise.all([reschedule('SF-DCC', '2027-01-15'), reschedule('SF-DCC2', '2027-01-15')]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await auditCount('VCC_WO_RESCHEDULED', woId)).toBe(1);
    expect((await dueDate()).due_date).toBe('2027-01-15');

    // Double click afterwards (the page now shows the new date): refused as a no-op, still one audit row
    expect((await reschedule('SF-DCC', '2027-01-15')).status).toBe(400);
    expect(await auditCount('VCC_WO_RESCHEDULED', woId)).toBe(1);

    // Different dates at once: exactly one wins, the loser leaves no trace
    const [c1, c2] = await Promise.all([reschedule('SF-DCC', '2027-02-10', 'เหตุผล A'), reschedule('SF-DCC2', '2027-03-10', 'เหตุผล B')]);
    expect([c1.status, c2.status].sort()).toEqual([200, 409]);
    const winner = c1.status === 200 ? { date: '2027-02-10', reason: 'เหตุผล A' } : { date: '2027-03-10', reason: 'เหตุผล B' };
    const after = await dueDate();
    expect(after).toMatchObject({ due_date: winner.date, reschedule_reason: winner.reason, original_due_date: '2026-12-31' });
    expect(await auditCount('VCC_WO_RESCHEDULED', woId)).toBe(2);

    // Closed / cancelled work order is still refused 409
    await call('POST', `/api/vcc/work-orders/${woId}/cancel`, 'SF-REV4', { cancellation_category: 'MISTAKE_CREATION', cancellation_reason: 'ปิดทดสอบ' });
    expect((await reschedule('SF-DCC', '2027-04-10')).status).toBe(409);
  });

  it('B1: concurrent amendment requests leave one pending request; concurrent decisions leave one outcome', async () => {
    const { woId } = await newWorkOrder('AMEND');
    await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'SF-L2', result('PASS'));
    await call('POST', `/api/vcc/work-orders/${woId}/approve`, 'SF-REV4', { comment: 'ตรวจรับ' });

    const req = { amendment_reason: 'แก้เลขใบรับรองพิมพ์ผิด', certificate_no: `CERT-FIX-${RUN}` };
    const [a, b] = await Promise.all([
      call('POST', `/api/vcc/work-orders/${woId}/amendment-requests`, 'SF-REV4', req),
      call('POST', `/api/vcc/work-orders/${woId}/amendment-requests`, 'SF-REV4B', req)
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const pending = await env.DB.prepare("SELECT id FROM vcc_work_order_amendment_requests WHERE work_order_id = ? AND status = 'PENDING'").bind(woId).all();
    expect(pending.results).toHaveLength(1);

    const requestId = pending.results[0].id;
    const requester = a.status === 201 ? 'SF-REV4' : 'SF-REV4B';
    const decider = requester === 'SF-REV4' ? 'SF-REV4B' : 'SF-REV4';
    const [approve, reject] = await Promise.all([
      call('POST', `/api/vcc/work-orders/${woId}/amendment-requests/${requestId}/approve`, decider, {}),
      call('POST', `/api/vcc/work-orders/${woId}/amendment-requests/${requestId}/reject`, 'SF-APP5', { comment: 'ไม่อนุมัติ' })
    ]);
    expect([approve.status, reject.status].sort()).toEqual([200, 409]);
    const amendments = await env.DB.prepare('SELECT COUNT(*) AS n FROM vcc_work_order_amendments WHERE work_order_id = ?').bind(woId).first('n');
    expect(amendments).toBe(approve.status === 200 ? 1 : 0);
  });

  it('B2: strictly blocks unauthorized user from creating work orders for another department (403 Forbidden)', async () => {
    const { assetId } = await newWorkOrder('CROSSDEPT');
    // SF-LB4 is in LB department (approval_level 4, is_dcc 0), asset is in QC
    const crossWo = await call('POST', '/api/vcc/work-orders', 'SF-LB4', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      due_date: '2026-12-31'
    });
    expect(crossWo.status).toBe(403);
    expect(crossWo.body.error).toContain('ไม่มีสิทธิ์สร้างใบสั่งงานของแผนกนี้');

    // DCC can create for QC
    const dccWo = await call('POST', '/api/vcc/work-orders', 'SF-DCC', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      due_date: '2026-12-31'
    });
    expect(dccWo.status).toBe(201);
  });
});
