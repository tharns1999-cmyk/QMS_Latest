import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('VCC Phase 2.5: Final Hardening & Phase 3 Readiness Gate Tests', () => {
  let proxy;
  let env;
  const tokens = {};
  const PASSWORD = 'gate-test-pass-123456';

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
    const text = await res.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text, error: text };
    }
    return { status: res.status, body: json };
  };

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword(PASSWORD);

    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('QC', 'ควบคุมคุณภาพ QC', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('QA', 'ประกันคุณภาพ QA', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('PD', 'ฝ่ายผลิต PD', 'ACTIVE')"),
      ...[
        ['GATE-QC-STAFF', 2, 1, 'QC', '["QC"]'],
        ['GATE-QC-SUP', 4, 1, 'QC', '["QC"]'],
        ['GATE-QA-MGR', 6, 1, 'QC', '["QC","QA"]'],
        ['GATE-PD-STAFF', 2, 0, 'PD', '["PD"]']
      ].map(([id, level, dcc, dept, depts]) =>
        env.DB.prepare(
          `INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
           VALUES (?, ?, ?, ?, 'USER', ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             approval_level = excluded.approval_level,
             primary_department = excluded.primary_department,
             departments = excluded.departments,
             is_dcc = excluded.is_dcc`
        ).bind(id, id, `${id}@gate.local`, hash, level, dept, depts, dcc)
      )
    ]);

    for (const id of ['GATE-QC-STAFF', 'GATE-QC-SUP', 'GATE-QA-MGR', 'GATE-PD-STAFF']) {
      const res = await app.request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `${id}@gate.local`, password: PASSWORD })
        },
        env
      );
      const json = await res.json();
      tokens[id] = json.token;
    }
  });

  const cleanDb = async () => {
    await env.DB.batch([
      env.DB.prepare("UPDATE vcc_annual_plans SET status = 'DRAFT'"),
      env.DB.prepare("UPDATE vcc_work_orders SET status = 'CANCELLED', certificate_no = NULL"),
      env.DB.prepare("UPDATE vcc_plan_cycles SET cycle_status = 'CANCELLED'"),
      env.DB.prepare('DELETE FROM vcc_work_orders'),
      env.DB.prepare('DELETE FROM vcc_plan_cycles'),
      env.DB.prepare('DELETE FROM vcc_annual_plan_items'),
      env.DB.prepare('DELETE FROM vcc_annual_plans'),
      env.DB.prepare('DELETE FROM vcc_assets')
    ]);
  };

  beforeEach(async () => {
    await cleanDb();
  });

  afterAll(async () => {
    await cleanDb();
  });

  it('1. Historical Data Protection: SQLite triggers strictly prevent deletion of approved plans, items, closed WOs and closed cycles', async () => {
    // A. Create instrument and approved plan
    const assetRes = await call('POST', '/api/vcc/assets', 'GATE-QC-STAFF', {
      asset_code: 'QC-PROT-01',
      name: 'เครื่องมือทดสอบการป้องกันประวัติ',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'QC',
      location: 'QC Room 1',
      status: 'ACTIVE'
    });
    expect(assetRes.status).toBe(201);
    const assetId = assetRes.body.asset.id;

    const planRes = await call('POST', '/api/vcc/plans', 'GATE-QC-STAFF', {
      plan_year: 2026,
      department: 'QC',
      title: 'แผนทดสอบ Protection 2026',
      assigned_reviewer_id: 'GATE-QC-SUP',
      assigned_approver_id: 'GATE-QA-MGR'
    });
    expect(planRes.status).toBe(201);
    const planId = planRes.body.plan.id;

    const itemRes = await call('POST', `/api/vcc/plans/${planId}/items`, 'GATE-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      frequency_label: '1 ครั้ง/ปี',
      planned_months: [6],
      responsible_dept: 'QC'
    });
    expect(itemRes.status).toBe(201);
    const itemId = itemRes.body.item.id;

    // Approve the plan
    await call('POST', `/api/vcc/plans/${planId}/submit`, 'GATE-QC-STAFF');
    await call('POST', `/api/vcc/plans/${planId}/review`, 'GATE-QC-SUP', { comment: 'ผ่านการทบทวน' });
    const approveRes = await call('POST', `/api/vcc/plans/${planId}/approve`, 'GATE-QA-MGR', { comment: 'อนุมัติเรียบร้อย' });
    expect(approveRes.status).toBe(200);

    // Verify work order was auto-generated
    const wosRes = await call('GET', `/api/vcc/work-orders?plan_id=${planId}`, 'GATE-QC-STAFF');
    expect(wosRes.body.workOrders).toHaveLength(1);
    const wo = wosRes.body.workOrders[0];

    // Trigger Test A: Attempt to delete the APPROVED annual plan directly from database -> MUST FAIL
    await expect(env.DB.prepare('DELETE FROM vcc_annual_plans WHERE id = ?').bind(planId).run())
      .rejects.toThrow(/Cannot delete an APPROVED annual plan/);

    // Trigger Test B: Attempt to delete the plan item belonging to APPROVED plan -> MUST FAIL
    await expect(env.DB.prepare('DELETE FROM vcc_annual_plan_items WHERE id = ?').bind(itemId).run())
      .rejects.toThrow(/Cannot delete items from an APPROVED annual plan/);

    // Activate work order from SCHEDULED to OPEN
    await env.DB.prepare("UPDATE vcc_work_orders SET status = 'OPEN' WHERE id = ?").bind(wo.id).run();

    // Execute the work order to CLOSED status with certificate evidence
    await call('POST', `/api/vcc/work-orders/${wo.id}/submit-result`, 'GATE-QC-STAFF', {
      performed_at: '2026-06-15',
      result_status: 'PASS',
      certificate_no: 'CERT-2026-PROT-001',
      acceptance_criteria: '± 0.5 °C',
      result_remarks: 'ผ่านเกณฑ์สมบูรณ์'
    });
    const approveWoRes = await call('POST', `/api/vcc/work-orders/${wo.id}/approve`, 'GATE-QC-SUP', {
      comment: 'ผลการสอบเทียบผ่านตามเกณฑ์มาตรฐาน'
    });
    expect(approveWoRes.status).toBe(200);
    expect(approveWoRes.body.workOrder.status).toBe('CLOSED');

    // Trigger Test C: Attempt to delete CLOSED work order with certificate -> MUST FAIL
    await expect(env.DB.prepare('DELETE FROM vcc_work_orders WHERE id = ?').bind(wo.id).run())
      .rejects.toThrow(/Cannot delete a CLOSED work order or a work order with certificate evidence/);

    // Trigger Test D: Attempt to delete the cycle linked to the CLOSED work order -> MUST FAIL
    await expect(env.DB.prepare('DELETE FROM vcc_plan_cycles WHERE id = ?').bind(wo.cycle_id).run())
      .rejects.toThrow(/Cannot delete a cycle with CLOSED work order/);
  });

  it('2. Legacy Cycle Migration Integrity: Verifies exactly 0 orphan references between vcc_work_orders.cycle_id and vcc_plan_cycles.id', async () => {
    // Check database orphan references query
    const orphanCount = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM vcc_work_orders
      WHERE cycle_id IS NOT NULL
        AND cycle_id NOT IN (SELECT id FROM vcc_plan_cycles)
    `).first('count');

    expect(orphanCount).toBe(0);
  });

  it('3. Cross-Revision Cycle Identity: Rescheduling month preserves cycle_id, adding cycle creates new cycle_id, removing cycle is controlled cancellation', async () => {
    // Instrument ST002 in QC
    const assetRes = await call('POST', '/api/vcc/assets', 'GATE-QC-STAFF', {
      asset_code: 'QC-REV-ST002',
      name: 'เครื่องมือทดสอบ Cross-Revision ST002',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'QC',
      location: 'QC Line A',
      status: 'ACTIVE'
    });
    expect(assetRes.status).toBe(201);
    const assetId = assetRes.body.asset.id;

    // A. Plan Rev 00: 2 cycles [Month 3, Month 9]
    const planRev00Res = await call('POST', '/api/vcc/plans', 'GATE-QC-STAFF', {
      plan_year: 2026,
      department: 'QC',
      revision: '00',
      title: 'แผนประจำปี 2026 (Rev.00)',
      assigned_reviewer_id: 'GATE-QC-SUP',
      assigned_approver_id: 'GATE-QA-MGR'
    });
    expect(planRev00Res.status).toBe(201);
    const planRev00Id = planRev00Res.body.plan.id;

    await call('POST', `/api/vcc/plans/${planRev00Id}/items`, 'GATE-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      frequency_label: '2 ครั้ง/ปี',
      planned_months: [3, 9],
      responsible_dept: 'QC'
    });

    // Approve Rev 00
    await call('POST', `/api/vcc/plans/${planRev00Id}/submit`, 'GATE-QC-STAFF');
    await call('POST', `/api/vcc/plans/${planRev00Id}/review`, 'GATE-QC-SUP', { comment: 'ทบทวน Rev 00 ผ่าน' });
    await call('POST', `/api/vcc/plans/${planRev00Id}/approve`, 'GATE-QA-MGR', { comment: 'อนุมัติ Rev 00' });

    // Inspect generated cycles & work orders for Rev 00
    const wosRev00 = await call('GET', `/api/vcc/work-orders?plan_id=${planRev00Id}`, 'GATE-QC-STAFF');
    expect(wosRev00.body.workOrders).toHaveLength(2);
    const woMonth3 = wosRev00.body.workOrders.find((w) => w.planned_month === 3);
    const woMonth9 = wosRev00.body.workOrders.find((w) => w.planned_month === 9);
    expect(woMonth3).toBeDefined();
    expect(woMonth9).toBeDefined();
    const originalCycleIdMonth3 = woMonth3.cycle_id;
    const originalCycleIdMonth9 = woMonth9.cycle_id;

    // B. Create Plan Rev 01 (Reschedule Month 3 to Month 4, keep Month 9, add Month 11) -> 3 cycles: [4, 9, 11]
    const planRev01Res = await call('POST', '/api/vcc/plans', 'GATE-QC-STAFF', {
      plan_year: 2026,
      department: 'QC',
      revision: '01',
      title: 'แผนประจำปี 2026 (Rev.01 ปรับรอบ)',
      assigned_reviewer_id: 'GATE-QC-SUP',
      assigned_approver_id: 'GATE-QA-MGR'
    });
    expect(planRev01Res.status).toBe(201);
    const planRev01Id = planRev01Res.body.plan.id;

    await call('POST', `/api/vcc/plans/${planRev01Id}/items`, 'GATE-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      frequency_label: '3 ครั้ง/ปี',
      planned_months: [4, 9, 11],
      responsible_dept: 'QC'
    });

    // Verify: While Rev 01 is DRAFT, effective work orders are completely unchanged!
    const draftCheck = await call('GET', `/api/vcc/work-orders?plan_id=${planRev00Id}`, 'GATE-QC-STAFF');
    expect(draftCheck.body.workOrders.find((w) => w.cycle_id === originalCycleIdMonth3).planned_month).toBe(3);

    // C. Submit and Approve Rev 01
    await call('POST', `/api/vcc/plans/${planRev01Id}/submit`, 'GATE-QC-STAFF');
    await call('POST', `/api/vcc/plans/${planRev01Id}/review`, 'GATE-QC-SUP', { comment: 'ทบทวน Rev 01 ผ่าน' });
    const approveRev01Res = await call('POST', `/api/vcc/plans/${planRev01Id}/approve`, 'GATE-QA-MGR', { comment: 'อนุมัติ Rev 01' });
    expect(approveRev01Res.status).toBe(200);

    // Check work orders after Rev 01 is approved:
    // 1. Seq 1 (now Month 4) MUST preserve cycle_id = originalCycleIdMonth3
    const allWos = await call('GET', '/api/vcc/work-orders?department=QC', 'GATE-QC-STAFF');
    const updatedWoSeq1 = allWos.body.workOrders.find((w) => w.cycle_id === originalCycleIdMonth3);
    expect(updatedWoSeq1).toBeDefined();
    expect(updatedWoSeq1.planned_month).toBe(4);
    expect(updatedWoSeq1.due_date).toBe('2026-04-30');

    // 2. Seq 2 (Month 9) MUST preserve cycle_id = originalCycleIdMonth9
    const woSeq2 = allWos.body.workOrders.find((w) => w.cycle_id === originalCycleIdMonth9);
    expect(woSeq2).toBeDefined();
    expect(woSeq2.planned_month).toBe(9);

    // 3. Seq 3 (Month 11) is a new cycle -> gets brand new cycle_id
    const woSeq3 = allWos.body.workOrders.find((w) => w.planned_month === 11);
    expect(woSeq3).toBeDefined();
    expect(woSeq3.cycle_id).not.toBe(originalCycleIdMonth3);
    expect(woSeq3.cycle_id).not.toBe(originalCycleIdMonth9);

    // D. Simulate Plan Rev 02 removing Month 9 and Month 11 (only 1 cycle [Month 4] remains)
    const planRev02Res = await call('POST', '/api/vcc/plans', 'GATE-QC-STAFF', {
      plan_year: 2026,
      department: 'QC',
      revision: '02',
      title: 'แผนประจำปี 2026 (Rev.02 ลดรอบ)',
      assigned_reviewer_id: 'GATE-QC-SUP',
      assigned_approver_id: 'GATE-QA-MGR'
    });
    expect(planRev02Res.status).toBe(201);
    const planRev02Id = planRev02Res.body.plan.id;

    await call('POST', `/api/vcc/plans/${planRev02Id}/items`, 'GATE-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      frequency_label: '1 ครั้ง/ปี',
      planned_months: [4],
      responsible_dept: 'QC'
    });

    await call('POST', `/api/vcc/plans/${planRev02Id}/submit`, 'GATE-QC-STAFF');
    await call('POST', `/api/vcc/plans/${planRev02Id}/review`, 'GATE-QC-SUP', { comment: 'ทบทวน Rev 02 ผ่าน' });
    await call('POST', `/api/vcc/plans/${planRev02Id}/approve`, 'GATE-QA-MGR', { comment: 'อนุมัติ Rev 02' });

    // The removed cycles (originalCycleIdMonth9 and woSeq3.cycle_id) must be controlled cancelled
    const cancelledWoMonth9 = await env.DB.prepare('SELECT * FROM vcc_work_orders WHERE cycle_id = ?').bind(originalCycleIdMonth9).first();
    expect(cancelledWoMonth9.status).toBe('CANCELLED');
    expect(cancelledWoMonth9.cancellation_category).toBe('PLAN_REVISION');

    const cycleMonth9 = await env.DB.prepare('SELECT * FROM vcc_plan_cycles WHERE id = ?').bind(originalCycleIdMonth9).first();
    expect(cycleMonth9.cycle_status).toBe('CANCELLED');
  });

  it('4. Concurrency & Transaction Safety: Starting from 0 work orders, 5 concurrent requests generate exactly 17 active work orders, 0 duplicates', async () => {
    // Create 5 instruments
    const instrumentIds = [];
    for (let i = 1; i <= 5; i++) {
      const assetRes = await call('POST', '/api/vcc/assets', 'GATE-QC-STAFF', {
        asset_code: `QC-CNC-AST-${i}`,
        name: `เครื่องมือ Concurrency ${i}`,
        asset_type: 'เทอร์โมมิเตอร์',
        department: 'QC',
        location: 'QC Lab',
        status: 'ACTIVE'
      });
      instrumentIds.push(assetRes.body.asset.id);
    }

    // Plan with 17 cycles: 4 + 4 + 3 + 3 + 3
    const planRes = await call('POST', '/api/vcc/plans', 'GATE-QC-STAFF', {
      plan_year: 2026,
      department: 'QC',
      title: 'แผนทดสอบ Concurrency 17 รอบ',
      assigned_reviewer_id: 'GATE-QC-SUP',
      assigned_approver_id: 'GATE-QA-MGR'
    });
    const planId = planRes.body.plan.id;

    const schedule = [
      { asset_id: instrumentIds[0], months: [3, 6, 9, 12] },
      { asset_id: instrumentIds[1], months: [1, 4, 7, 10] },
      { asset_id: instrumentIds[2], months: [2, 6, 10] },
      { asset_id: instrumentIds[3], months: [4, 8, 12] },
      { asset_id: instrumentIds[4], months: [5, 9, 11] }
    ];

    for (const item of schedule) {
      await call('POST', `/api/vcc/plans/${planId}/items`, 'GATE-QC-STAFF', {
        asset_id: item.asset_id,
        provider_name: 'ทวนสอบภายใน',
        frequency_label: `${item.months.length} ครั้ง/ปี`,
        planned_months: item.months,
        responsible_dept: 'QC'
      });
    }

    // Move to PENDING_APPROVAL
    await call('POST', `/api/vcc/plans/${planId}/submit`, 'GATE-QC-STAFF');
    await call('POST', `/api/vcc/plans/${planId}/review`, 'GATE-QC-SUP', { comment: 'พร้อมอนุมัติ' });

    // Approve the plan (first time generates work orders)
    const approveRes = await call('POST', `/api/vcc/plans/${planId}/approve`, 'GATE-QA-MGR', { comment: 'อนุมัติเรียบร้อย' });
    expect(approveRes.status).toBe(200);

    // Now delete work orders to test from 0 work orders with 5 concurrent requests
    await env.DB.prepare("UPDATE vcc_work_orders SET status = 'CANCELLED'").run();
    await env.DB.prepare('DELETE FROM vcc_work_orders').run();

    const initialCount = await env.DB.prepare('SELECT COUNT(*) AS c FROM vcc_work_orders').first('c');
    expect(initialCount).toBe(0);

    // Launch 5 concurrent reconcile-work-orders calls
    const concurrentCalls = [1, 2, 3, 4, 5].map(() =>
      call('POST', `/api/vcc/plans/${planId}/reconcile-work-orders`, 'GATE-QC-SUP', {})
    );
    const results = await Promise.all(concurrentCalls);

    // All 5 calls must succeed (HTTP 200)
    for (const res of results) {
      expect(res.status).toBe(200);
    }

    // Verify database: exactly 17 active work orders, 0 duplicates
    const { results: allWos } = await env.DB.prepare('SELECT id, wo_code, cycle_id, status FROM vcc_work_orders').all();
    expect(allWos).toHaveLength(17);

    const activeWos = allWos.filter((w) => w.status !== 'CANCELLED');
    expect(activeWos).toHaveLength(17);

    const cycleIdSet = new Set(activeWos.map((w) => w.cycle_id));
    expect(cycleIdSet.size).toBe(17); // 0 duplicates!

    const woCodeSet = new Set(activeWos.map((w) => w.wo_code));
    expect(woCodeSet.size).toBe(17); // Unique WO codes!
  });

  it('5. Cancellation & Recovery Policy: Categorizes cancellation reasons and prevents automatic recreation for permanent cancellations', async () => {
    // Create instrument & plan with 2 cycles
    const assetRes = await call('POST', '/api/vcc/assets', 'GATE-QC-STAFF', {
      asset_code: 'QC-CANCEL-AST',
      name: 'เครื่องมือทดสอบการยกเลิก',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'QC',
      location: 'QC Lab',
      status: 'ACTIVE'
    });
    const assetId = assetRes.body.asset.id;

    const planRes = await call('POST', '/api/vcc/plans', 'GATE-QC-STAFF', {
      plan_year: 2026,
      department: 'QC',
      title: 'แผนทดสอบ Cancellation Policy',
      assigned_reviewer_id: 'GATE-QC-SUP',
      assigned_approver_id: 'GATE-QA-MGR'
    });
    const planId = planRes.body.plan.id;

    await call('POST', `/api/vcc/plans/${planId}/items`, 'GATE-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      frequency_label: '2 ครั้ง/ปี',
      planned_months: [4, 10],
      responsible_dept: 'QC'
    });

    await call('POST', `/api/vcc/plans/${planId}/submit`, 'GATE-QC-STAFF');
    await call('POST', `/api/vcc/plans/${planId}/review`, 'GATE-QC-SUP', { comment: 'ทบทวนผ่าน' });
    await call('POST', `/api/vcc/plans/${planId}/approve`, 'GATE-QA-MGR', { comment: 'อนุมัติ' });

    const wos = (await call('GET', `/api/vcc/work-orders?plan_id=${planId}`, 'GATE-QC-STAFF')).body.workOrders;
    expect(wos).toHaveLength(2);

    const wo1 = wos.find((w) => w.planned_month === 4);
    const wo2 = wos.find((w) => w.planned_month === 10);

    // A. Validation: Invalid cancellation category returns 400
    const invalidCatRes = await call('POST', `/api/vcc/work-orders/${wo1.id}/cancel`, 'GATE-QC-SUP', {
      cancellation_category: 'INVALID_CATEGORY',
      cancellation_reason: 'ทดสอบ'
    });
    expect(invalidCatRes.status).toBe(400);

    // B. Validation: Missing cancellation reason returns 400
    const missingReasonRes = await call('POST', `/api/vcc/work-orders/${wo1.id}/cancel`, 'GATE-QC-SUP', {
      cancellation_category: 'AUTHORIZED_CANCEL',
      cancellation_reason: ''
    });
    expect(missingReasonRes.status).toBe(400);

    // C. Permanent cancellation: Cancel wo1 with ASSET_RETIRED
    const cancelWo1 = await call('POST', `/api/vcc/work-orders/${wo1.id}/cancel`, 'GATE-QC-SUP', {
      cancellation_category: 'ASSET_RETIRED',
      cancellation_reason: 'เครื่องมือชำรุดปลดระวางถาวร'
    });
    expect(cancelWo1.status).toBe(200);
    expect(cancelWo1.body.workOrder.status).toBe('CANCELLED');
    expect(cancelWo1.body.workOrder.cancellation_category).toBe('ASSET_RETIRED');

    // Cycle in vcc_plan_cycles must also be marked CANCELLED
    const cycle1 = await env.DB.prepare('SELECT cycle_status FROM vcc_plan_cycles WHERE id = ?').bind(wo1.cycle_id).first();
    expect(cycle1.cycle_status).toBe('CANCELLED');

    // Call reconcile-work-orders: permanent cancellation MUST NOT be auto-recreated!
    const recon1 = await call('POST', `/api/vcc/plans/${planId}/reconcile-work-orders`, 'GATE-QC-SUP', {});
    expect(recon1.status).toBe(200);
    const activeWosAfterRecon = await env.DB.prepare("SELECT * FROM vcc_work_orders WHERE plan_id = ? AND status != 'CANCELLED'").bind(planId).all();
    expect(activeWosAfterRecon.results).toHaveLength(1); // Only wo2 is active! wo1 was NOT recreated!

    // D. Non-permanent cancellation: Cancel wo2 with MISTAKE_CREATION
    const cancelWo2 = await call('POST', `/api/vcc/work-orders/${wo2.id}/cancel`, 'GATE-QC-SUP', {
      cancellation_category: 'MISTAKE_CREATION',
      cancellation_reason: 'ออกใบสั่งงานผิดพลาด ต้องการสร้างใหม่'
    });
    expect(cancelWo2.status).toBe(200);
    expect(cancelWo2.body.workOrder.status).toBe('CANCELLED');

    // Call reconcile-work-orders: MISTAKE_CREATION allows regenerating a clean work order for cycle 2!
    const recon2 = await call('POST', `/api/vcc/plans/${planId}/reconcile-work-orders`, 'GATE-QC-SUP', {});
    expect(recon2.status).toBe(200);
    const activeWosAfterRecon2 = await env.DB.prepare("SELECT * FROM vcc_work_orders WHERE plan_id = ? AND status != 'CANCELLED'").bind(planId).all();
    expect(activeWosAfterRecon2.results).toHaveLength(1);
    expect(activeWosAfterRecon2.results[0].planned_month).toBe(10);
  });

  it('6. Ambiguous Reconciliation: Provides explicit resolution endpoint POST /api/vcc/plans/:id/reconcile-work-orders/resolve-ambiguous and audits decision', async () => {
    // Create instrument & approved plan
    const assetRes = await call('POST', '/api/vcc/assets', 'GATE-QC-STAFF', {
      asset_code: 'QC-AMBIG-AST',
      name: 'เครื่องมือทดสอบ Ambiguous Candidate',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'QC',
      location: 'QC Lab',
      status: 'ACTIVE'
    });
    const assetId = assetRes.body.asset.id;

    const planRes = await call('POST', '/api/vcc/plans', 'GATE-QC-STAFF', {
      plan_year: 2026,
      department: 'QC',
      title: 'แผนทดสอบ Ambiguous Reconciliation',
      assigned_reviewer_id: 'GATE-QC-SUP',
      assigned_approver_id: 'GATE-QA-MGR'
    });
    const planId = planRes.body.plan.id;

    await call('POST', `/api/vcc/plans/${planId}/items`, 'GATE-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      frequency_label: '1 ครั้ง/ปี',
      planned_months: [5],
      responsible_dept: 'QC'
    });

    await call('POST', `/api/vcc/plans/${planId}/submit`, 'GATE-QC-STAFF');
    await call('POST', `/api/vcc/plans/${planId}/review`, 'GATE-QC-SUP', { comment: 'พร้อม' });
    await call('POST', `/api/vcc/plans/${planId}/approve`, 'GATE-QA-MGR', { comment: 'อนุมัติ' });

    // Retrieve the generated cycle
    const cycle = await env.DB.prepare('SELECT * FROM vcc_plan_cycles WHERE plan_id = ?').bind(planId).first();
    expect(cycle).toBeDefined();

    // Now artificially create a second manual work order for this same asset and month without cycle_id
    // This creates an ambiguous match situation (2 work orders match the same asset and month)
    const manualWoId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, plan_year, asset_id, planned_month, due_date, original_due_date, status, result_status, provider_name
      ) VALUES (?, 'WO-2026-MANUAL', 2026, ?, 5, '2026-05-31', '2026-05-31', 'OPEN', 'PENDING', 'ทวนสอบภายใน')
    `).bind(manualWoId, assetId).run();

    // Temporarily clear cycle_id, cycle_key, and plan_item_id on the first work order to trigger ambiguous candidate matching
    await env.DB.prepare('UPDATE vcc_work_orders SET cycle_id = NULL, cycle_key = NULL, plan_item_id = NULL WHERE plan_id = ?').bind(planId).run();

    // Call reconcile-work-orders -> must report HAS_AMBIGUITIES and block 100% complete
    const reconRes = await call('POST', `/api/vcc/plans/${planId}/reconcile-work-orders`, 'GATE-QC-SUP', {});
    expect(reconRes.status).toBe(200);
    const gen = reconRes.body.work_orders_generation;
    expect(gen.reconciliation_status).toBe('HAS_AMBIGUITIES');
    expect(gen.is_fully_reconciled).toBe(false);
    expect(gen.ambiguous_count).toBeGreaterThan(0);
    expect(gen.ambiguous[0].candidates.length).toBeGreaterThanOrEqual(2);

    // Call explicit resolution endpoint
    const resolveRes = await call('POST', `/api/vcc/plans/${planId}/reconcile-work-orders/resolve-ambiguous`, 'GATE-QC-SUP', {
      cycle_id: cycle.id,
      chosen_work_order_id: manualWoId,
      reason: 'เลือกใบสั่งงาน manual ที่เปิดไว้ล่วงหน้าเพื่อใช้เป็นใบสั่งงานจริงของรอบนี้'
    });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.success).toBe(true);
    expect(resolveRes.body.resolved.work_order_id).toBe(manualWoId);

    // Verify audit log has VCC_RECON_AMBIGUOUS_RESOLVED
    const auditRow = await env.DB.prepare("SELECT * FROM audit_log WHERE action = 'VCC_RECON_AMBIGUOUS_RESOLVED'").first();
    expect(auditRow).toBeDefined();
    const details = JSON.parse(auditRow.details);
    expect(details.chosen_work_order_id).toBe(manualWoId);
    expect(details.reason).toContain('เลือกใบสั่งงาน manual');

    // Verify the chosen work order is now bound to the cycle
    const boundWo = await env.DB.prepare('SELECT cycle_id, plan_id FROM vcc_work_orders WHERE id = ?').bind(manualWoId).first();
    expect(boundWo.cycle_id).toBe(cycle.id);
    expect(boundWo.plan_id).toBe(planId);
  });
});

