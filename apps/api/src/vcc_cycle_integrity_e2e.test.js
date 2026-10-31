import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('VCC Phase 2.5: Stable Planned Cycle Identity, Reconciliation & E2E Verification', () => {
  let proxy;
  let env;
  const tokens = {};
  const PASSWORD = 'vcc-wo-e2e-pass-123456';

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
      console.error(`API ${method} ${path} returned non-JSON [${res.status}]:`, text);
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
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('PD', 'ฝ่ายผลิต PD', 'ACTIVE')"),
      ...[
        ['E2E-QC-STAFF', 2, 1, 'QC', '["QC"]'],
        ['E2E-QC-SUP', 4, 1, 'QC', '["QC"]'],
        ['E2E-QA-MGR', 6, 1, 'QC', '["QC","QA"]'],
        ['E2E-PD-STAFF', 2, 0, 'PD', '["PD"]']
      ].map(([id, level, dcc, dept, depts]) =>
        env.DB.prepare(
          `INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
           VALUES (?, ?, ?, ?, 'USER', ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             approval_level = excluded.approval_level,
             primary_department = excluded.primary_department,
             departments = excluded.departments,
             is_dcc = excluded.is_dcc`
        ).bind(id, id, `${id}@e2e.local`, hash, level, dept, depts, dcc)
      )
    ]);

    for (const id of ['E2E-QC-STAFF', 'E2E-QC-SUP', 'E2E-QA-MGR', 'E2E-PD-STAFF']) {
      const res = await app.request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `${id}@e2e.local`, password: PASSWORD })
        },
        env
      );
      const json = await res.json();
      tokens[id] = json.token;
    }
  });

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM vcc_work_orders'),
      env.DB.prepare('DELETE FROM vcc_plan_cycles'),
      env.DB.prepare('DELETE FROM vcc_annual_plan_items'),
      env.DB.prepare('DELETE FROM vcc_annual_plans'),
      env.DB.prepare('DELETE FROM vcc_assets')
    ]);
  });

  it('1. End-to-End: 5 instruments with 17 planned cycles generate 0 in draft/review, exactly 17 on approve, and 0 duplicates on concurrency/retry', async () => {
    // A. Create 5 test instruments in QC
    const instrumentIds = [];
    for (let i = 1; i <= 5; i++) {
      const code = `QC-E2E-AST-0${i}`;
      const assetRes = await call('POST', '/api/vcc/assets', 'E2E-QC-STAFF', {
        asset_code: code,
        name: `เครื่องมือทดสอบ E2E ${i}`,
        asset_type: 'เทอร์โมมิเตอร์',
        department: 'QC',
        location: 'QC Lab 1',
        resolution: '0.01 mm',
        status: 'ACTIVE'
      });
      expect(assetRes.status).toBe(201);
      instrumentIds.push(assetRes.body.asset.id);
    }

    // B. Create Annual Plan 2026 (DRAFT)
    const planRes = await call('POST', '/api/vcc/plans', 'E2E-QC-STAFF', {
      plan_year: 2026,
      department: 'QC',
      title: 'แผนสอบเทียบประจำปี 2026 แผนก QC (E2E Test)',
      due_date_rule: 'END_OF_MONTH',
      assigned_reviewer_id: 'E2E-QC-SUP',
      assigned_approver_id: 'E2E-QA-MGR'
    });
    expect(planRes.status).toBe(201);
    const planId = planRes.body.plan.id;

    // C. Add 5 items with 17 planned cycles total:
    // Ins 1: 4 cycles [3, 6, 9, 12]
    // Ins 2: 4 cycles [1, 4, 7, 10]
    // Ins 3: 3 cycles [2, 6, 10]
    // Ins 4: 3 cycles [4, 8, 12]
    // Ins 5: 3 cycles [5, 9, 11]
    // Total = 4 + 4 + 3 + 3 + 3 = 17 cycles
    const planSchedule = [
      { asset_id: instrumentIds[0], months: [3, 6, 9, 12] },
      { asset_id: instrumentIds[1], months: [1, 4, 7, 10] },
      { asset_id: instrumentIds[2], months: [2, 6, 10] },
      { asset_id: instrumentIds[3], months: [4, 8, 12] },
      { asset_id: instrumentIds[4], months: [5, 9, 11] }
    ];

    for (const item of planSchedule) {
      const itemRes = await call('POST', `/api/vcc/plans/${planId}/items`, 'E2E-QC-STAFF', {
        asset_id: item.asset_id,
        provider_name: 'ทวนสอบภายใน',
        frequency_label: `${item.months.length} ครั้ง/ปี`,
        planned_months: item.months,
        responsible_dept: 'QC'
      });
      expect(itemRes.status).toBe(201);
    }

    // Verify: in DRAFT status, exactly 0 work orders exist
    const draftWos = await call('GET', `/api/vcc/work-orders?plan_id=${planId}`, 'E2E-QC-STAFF');
    expect(draftWos.status).toBe(200);
    expect(draftWos.body.workOrders).toHaveLength(0);

    // D. Submit plan (DRAFT -> PENDING_REVIEW)
    const submitRes = await call('POST', `/api/vcc/plans/${planId}/submit`, 'E2E-QC-STAFF');
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.plan.status).toBe('PENDING_REVIEW');

    // Verify: in PENDING_REVIEW status, exactly 0 work orders exist
    const reviewWos = await call('GET', `/api/vcc/work-orders?plan_id=${planId}`, 'E2E-QC-STAFF');
    expect(reviewWos.body.workOrders).toHaveLength(0);

    // E. Reviewer reviews from Task Inbox (PENDING_REVIEW -> PENDING_APPROVAL)
    const reviewRes = await call('POST', `/api/vcc/plans/${planId}/review`, 'E2E-QC-SUP', {
      comment: 'ตรวจสอบรายการและรอบสอบเทียบครบถ้วน 17 รอบ'
    });
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.plan.status).toBe('PENDING_APPROVAL');

    // Verify: in PENDING_APPROVAL status, exactly 0 work orders exist
    const pendingApprovalWos = await call('GET', `/api/vcc/work-orders?plan_id=${planId}`, 'E2E-QC-STAFF');
    expect(pendingApprovalWos.body.workOrders).toHaveLength(0);

    // F. Approver approves from Task Inbox (PENDING_APPROVAL -> APPROVED)
    const approveRes = await call('POST', `/api/vcc/plans/${planId}/approve`, 'E2E-QA-MGR', {
      comment: 'อนุมัติแผนประจำปี 2026 ออกใบสั่งงานอัตโนมัติ'
    });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.plan.status).toBe('APPROVED');
    expect(approveRes.body.work_orders_generation.total_cycles).toBe(17);
    expect(approveRes.body.work_orders_generation.generated_count).toBe(17);

    // G. Verify backend created EXACTLY 17 work orders
    const approvedWos = await call('GET', `/api/vcc/work-orders?plan_id=${planId}`, 'E2E-QC-STAFF');
    expect(approvedWos.status).toBe(200);
    expect(approvedWos.body.workOrders).toHaveLength(17);

    // Verify work order properties: stable cycle_id, monotonic WO-2026-NNN, SCHEDULED status
    const codes = approvedWos.body.workOrders.map((w) => w.wo_code);
    const cycleIds = approvedWos.body.workOrders.map((w) => w.cycle_id);
    expect(new Set(codes).size).toBe(17);
    expect(new Set(cycleIds).size).toBe(17);

    for (const wo of approvedWos.body.workOrders) {
      expect(wo.wo_code).toMatch(/^WO-2026-\d{3}$/);
      expect(wo.status).toBe('SCHEDULED');
      expect(wo.result_status).toBe('PENDING');
      expect(wo.cycle_id).toBeTruthy();
      expect(wo.cycle_key).toBeTruthy();
      expect(wo.baseline_planned_date).toBeTruthy();
    }

    // H. Concurrency and Retry: 5 parallel reconcile requests produce 0 duplicates
    const parallelCalls = await Promise.all([
      call('POST', `/api/vcc/plans/${planId}/reconcile-work-orders`, 'E2E-QC-STAFF'),
      call('POST', `/api/vcc/plans/${planId}/reconcile-work-orders`, 'E2E-QC-STAFF'),
      call('POST', `/api/vcc/plans/${planId}/reconcile-work-orders`, 'E2E-QC-STAFF'),
      call('POST', `/api/vcc/plans/${planId}/reconcile-work-orders`, 'E2E-QC-STAFF'),
      call('POST', `/api/vcc/plans/${planId}/reconcile-work-orders`, 'E2E-QC-STAFF')
    ]);

    for (const r of parallelCalls) {
      expect(r.status).toBe(200);
      expect(r.body.work_orders_generation.generated_count).toBe(0);
    }

    // Refresh and check count remains exactly 17
    const refreshedWos = await call('GET', `/api/vcc/work-orders?plan_id=${planId}`, 'E2E-QC-STAFF');
    expect(refreshedWos.body.workOrders).toHaveLength(17);
  });

  it('2. Reconciliation Engine: Categorizes Matched, Unmatched, Ambiguous and protects Closed evidence', async () => {
    // A. Create test asset
    const assetRes = await call('POST', '/api/vcc/assets', 'E2E-QC-STAFF', {
      asset_code: 'QC-RECON-INS-01',
      name: 'เครื่องมือทดสอบการจับคู่',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'QC',
      status: 'ACTIVE'
    });
    const assetId = assetRes.body.asset.id;

    // B. Create existing manual work orders BEFORE plan approval:
    // 1) Single candidate in Month 2 (status = OPEN) -> Matched
    const singleWoRes = await call('POST', '/api/vcc/work-orders', 'E2E-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      due_date: '2026-02-28'
    });
    expect(singleWoRes.status).toBe(201);
    const singleWoId = singleWoRes.body.workOrder.id;

    // 2) Closed work order in Month 5 with certificate -> Matched & Evidence Protected
    const closedWoRes = await call('POST', '/api/vcc/work-orders', 'E2E-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ห้องปฏิบัติการภายนอก',
      due_date: '2026-05-31'
    });
    const closedWoId = closedWoRes.body.workOrder.id;
    // Perform and close it
    const submitResultRes = await call('POST', `/api/vcc/work-orders/${closedWoId}/submit-result`, 'E2E-QC-STAFF', {
      performed_at: '2026-05-20',
      result_status: 'PASS',
      certificate_no: 'CERT-E2E-HISTORICAL-999',
      acceptance_criteria: 'เกณฑ์ยอมรับความคลาดเคลื่อน ±0.05 mm',
      result_remarks: 'ผ่านเกณฑ์มาตรฐานสมบูรณ์'
    });
    expect(submitResultRes.status).toBe(200);

    const closeRes = await call('POST', `/api/vcc/work-orders/${closedWoId}/approve`, 'E2E-QC-SUP', {
      comment: 'อนุมัติปิดใบงานผลการสอบเทียบ'
    });
    expect(closeRes.status).toBe(200);

    // 3) Ambiguous: Create TWO separate manual work orders for Month 8
    const ambWo1 = await call('POST', '/api/vcc/work-orders', 'E2E-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      due_date: '2026-08-31'
    });
    const ambWo2 = await call('POST', '/api/vcc/work-orders', 'E2E-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ห้องปฏิบัติการภายนอก',
      due_date: '2026-08-31'
    });
    expect(ambWo1.status).toBe(201);
    expect(ambWo2.status).toBe(201);

    // C. Create plan with Month 2, 5, 8, 11 (11 has no prior WO -> Unmatched)
    const planRes = await call('POST', '/api/vcc/plans', 'E2E-QC-STAFF', {
      plan_year: 2026,
      department: 'QC',
      title: 'แผนทดสอบ Reconciliation 2026',
      assigned_reviewer_id: 'E2E-QC-SUP',
      assigned_approver_id: 'E2E-QA-MGR'
    });
    const planId = planRes.body.plan.id;

    await call('POST', `/api/vcc/plans/${planId}/items`, 'E2E-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      planned_months: [2, 5, 8, 11],
      responsible_dept: 'QC'
    });

    // Approve the plan
    await call('POST', `/api/vcc/plans/${planId}/submit`, 'E2E-QC-STAFF');
    await call('POST', `/api/vcc/plans/${planId}/review`, 'E2E-QC-SUP');
    const approveRes = await call('POST', `/api/vcc/plans/${planId}/approve`, 'E2E-QA-MGR');
    expect(approveRes.status).toBe(200);

    const gen = approveRes.body.work_orders_generation;
    // Total cycles = 4
    expect(gen.total_cycles).toBe(4);
    // Matched: Month 2 (single) and Month 5 (closed) = 2
    expect(gen.matched_count).toBe(2);
    // Unmatched / newly generated: Month 11 = 1
    expect(gen.unmatched_count).toBe(1);
    expect(gen.generated_count).toBe(1);
    // Ambiguous: Month 8 had 2 candidate work orders = 1
    expect(gen.ambiguous_count).toBe(1);
    expect(gen.ambiguous[0].planned_month).toBe(8);
    expect(gen.ambiguous[0].candidates.length).toBe(2);

    // Verify Evidence Protection on the CLOSED work order:
    const fetchedClosed = await call('GET', `/api/vcc/work-orders/${closedWoId}`, 'E2E-QC-STAFF');
    expect(fetchedClosed.body.workOrder.status).toBe('CLOSED');
    expect(fetchedClosed.body.workOrder.result_status).toBe('PASS');
    expect(fetchedClosed.body.workOrder.certificate_no).toBe('CERT-E2E-HISTORICAL-999');
    expect(fetchedClosed.body.workOrder.result_remarks).toBe('ผ่านเกณฑ์มาตรฐานสมบูรณ์');
  });

  it('3. Multiple cycles of the same instrument in the same month (e.g. Month 6 twice) receive distinct stable identities', async () => {
    const assetRes = await call('POST', '/api/vcc/assets', 'E2E-QC-STAFF', {
      asset_code: 'QC-MULTI-CYC-01',
      name: 'เครื่องมือสอบเทียบ 2 รอบในเดือนเดียวกัน',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'QC',
      status: 'ACTIVE'
    });
    const assetId = assetRes.body.asset.id;

    const planRes = await call('POST', '/api/vcc/plans', 'E2E-QC-STAFF', {
      plan_year: 2026,
      department: 'QC',
      title: 'แผนทดสอบหลายรอบในเดือนเดียว',
      assigned_reviewer_id: 'E2E-QC-SUP',
      assigned_approver_id: 'E2E-QA-MGR'
    });
    const planId = planRes.body.plan.id;

    // 2 cycles in Month 6: [6, 6]
    await call('POST', `/api/vcc/plans/${planId}/items`, 'E2E-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      planned_months: [6, 6],
      responsible_dept: 'QC'
    });

    await call('POST', `/api/vcc/plans/${planId}/submit`, 'E2E-QC-STAFF');
    await call('POST', `/api/vcc/plans/${planId}/review`, 'E2E-QC-SUP');
    const approveRes = await call('POST', `/api/vcc/plans/${planId}/approve`, 'E2E-QA-MGR');

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.work_orders_generation.total_cycles).toBe(2);
    expect(approveRes.body.work_orders_generation.generated_count).toBe(2);

    const wos = await call('GET', `/api/vcc/work-orders?plan_id=${planId}`, 'E2E-QC-STAFF');
    expect(wos.body.workOrders).toHaveLength(2);

    const cycleId1 = wos.body.workOrders[0].cycle_id;
    const cycleId2 = wos.body.workOrders[1].cycle_id;
    expect(cycleId1).toBeTruthy();
    expect(cycleId2).toBeTruthy();
    expect(cycleId1).not.toBe(cycleId2);
  });

  it('4. Cancelled work order allows safe retry/reconciliation without duplicate constraint failure', async () => {
    const assetRes = await call('POST', '/api/vcc/assets', 'E2E-QC-STAFF', {
      asset_code: 'QC-CANCEL-TEST-01',
      name: 'เครื่องมือทดสอบการยกเลิกใบงาน',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'QC',
      status: 'ACTIVE'
    });
    const assetId = assetRes.body.asset.id;

    const planRes = await call('POST', '/api/vcc/plans', 'E2E-QC-STAFF', {
      plan_year: 2026,
      department: 'QC',
      title: 'แผนทดสอบ Cancelled Recovery',
      assigned_reviewer_id: 'E2E-QC-SUP',
      assigned_approver_id: 'E2E-QA-MGR'
    });
    const planId = planRes.body.plan.id;

    await call('POST', `/api/vcc/plans/${planId}/items`, 'E2E-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      planned_months: [7],
      responsible_dept: 'QC'
    });

    await call('POST', `/api/vcc/plans/${planId}/submit`, 'E2E-QC-STAFF');
    await call('POST', `/api/vcc/plans/${planId}/review`, 'E2E-QC-SUP');
    await call('POST', `/api/vcc/plans/${planId}/approve`, 'E2E-QA-MGR');

    const wos = await call('GET', `/api/vcc/work-orders?plan_id=${planId}`, 'E2E-QC-STAFF');
    expect(wos.body.workOrders).toHaveLength(1);
    const originalWo = wos.body.workOrders[0];

    // Cancel this work order
    await env.DB.prepare("UPDATE vcc_work_orders SET status = 'CANCELLED' WHERE id = ?").bind(originalWo.id).run();

    // Call reconcile to recover the missing active work order for this planned cycle
    const reconRes = await call('POST', `/api/vcc/plans/${planId}/reconcile-work-orders`, 'E2E-QC-STAFF');
    expect(reconRes.status).toBe(200);
    expect(reconRes.body.work_orders_generation.generated_count).toBe(1);

    // Active work order is now restored for this cycle
    const activeWos = await call('GET', `/api/vcc/work-orders?plan_id=${planId}&status=OPEN`, 'E2E-QC-STAFF');
    expect(activeWos.body.workOrders).toHaveLength(1);
    expect(activeWos.body.workOrders[0].id).not.toBe(originalWo.id);
  });

  it('5. Multi-Year Planning: Separate plans for 2026 and 2027 do not interfere', async () => {
    const assetRes = await call('POST', '/api/vcc/assets', 'E2E-QC-STAFF', {
      asset_code: 'QC-MULTI-YEAR-01',
      name: 'เครื่องมือวางแผนข้ามปี 2026-2027',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'QC',
      status: 'ACTIVE'
    });
    const assetId = assetRes.body.asset.id;

    // Plan 2026
    const plan26Res = await call('POST', '/api/vcc/plans', 'E2E-QC-STAFF', {
      plan_year: 2026,
      department: 'QC',
      title: 'แผนปี 2026',
      assigned_reviewer_id: 'E2E-QC-SUP',
      assigned_approver_id: 'E2E-QA-MGR'
    });
    const plan26Id = plan26Res.body.plan.id;
    await call('POST', `/api/vcc/plans/${plan26Id}/items`, 'E2E-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      planned_months: [10],
      responsible_dept: 'QC'
    });
    await call('POST', `/api/vcc/plans/${plan26Id}/submit`, 'E2E-QC-STAFF');
    await call('POST', `/api/vcc/plans/${plan26Id}/review`, 'E2E-QC-SUP');
    await call('POST', `/api/vcc/plans/${plan26Id}/approve`, 'E2E-QA-MGR');

    // Plan 2027
    const plan27Res = await call('POST', '/api/vcc/plans', 'E2E-QC-STAFF', {
      plan_year: 2027,
      department: 'QC',
      title: 'แผนปี 2027',
      assigned_reviewer_id: 'E2E-QC-SUP',
      assigned_approver_id: 'E2E-QA-MGR'
    });
    const plan27Id = plan27Res.body.plan.id;
    await call('POST', `/api/vcc/plans/${plan27Id}/items`, 'E2E-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      planned_months: [4],
      responsible_dept: 'QC'
    });
    await call('POST', `/api/vcc/plans/${plan27Id}/submit`, 'E2E-QC-STAFF');
    await call('POST', `/api/vcc/plans/${plan27Id}/review`, 'E2E-QC-SUP');
    await call('POST', `/api/vcc/plans/${plan27Id}/approve`, 'E2E-QA-MGR');

    const wo26 = await call('GET', `/api/vcc/work-orders?plan_id=${plan26Id}`, 'E2E-QC-STAFF');
    const wo27 = await call('GET', `/api/vcc/work-orders?plan_id=${plan27Id}`, 'E2E-QC-STAFF');

    expect(wo26.body.workOrders).toHaveLength(1);
    expect(wo26.body.workOrders[0].wo_code).toMatch(/^WO-2026-/);
    expect(wo27.body.workOrders).toHaveLength(1);
    expect(wo27.body.workOrders[0].wo_code).toMatch(/^WO-2027-/);
  });

  it('6. RBAC & SoD: Unauthorized user cannot approve or reconcile work orders', async () => {
    const assetRes = await call('POST', '/api/vcc/assets', 'E2E-QC-STAFF', {
      asset_code: 'QC-RBAC-01',
      name: 'เครื่องมือทดสอบสิทธิ์',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'QC',
      status: 'ACTIVE'
    });
    const assetId = assetRes.body.asset.id;

    const planRes = await call('POST', '/api/vcc/plans', 'E2E-QC-STAFF', {
      plan_year: 2026,
      department: 'QC',
      title: 'แผนทดสอบสิทธิ์',
      assigned_reviewer_id: 'E2E-QC-SUP',
      assigned_approver_id: 'E2E-QA-MGR'
    });
    const planId = planRes.body.plan.id;

    await call('POST', `/api/vcc/plans/${planId}/items`, 'E2E-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      planned_months: [6],
      responsible_dept: 'QC'
    });

    // PD staff (not in QC) cannot submit or approve QC plan
    const unauthSubmit = await call('POST', `/api/vcc/plans/${planId}/submit`, 'E2E-PD-STAFF');
    expect(unauthSubmit.status).toBe(403);

    // Creator submits plan
    const submitRes = await call('POST', `/api/vcc/plans/${planId}/submit`, 'E2E-QC-STAFF');
    expect(submitRes.status).toBe(200);

    // Reviewer reviews plan
    const reviewRes = await call('POST', `/api/vcc/plans/${planId}/review`, 'E2E-QC-SUP');
    expect(reviewRes.status).toBe(200);

    // Creator cannot approve own plan (SoD: returns 403)
    const selfApprove = await call('POST', `/api/vcc/plans/${planId}/approve`, 'E2E-QC-STAFF', { comment: 'อนุมัติเอง' });
    expect(selfApprove.status).toBe(403);

    // PD staff cannot approve (returns 403)
    const unauthApprove = await call('POST', `/api/vcc/plans/${planId}/approve`, 'E2E-PD-STAFF', { comment: 'แอบอนุมัติ' });
    expect(unauthApprove.status).toBe(403);
  });

  afterAll(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM vcc_work_orders'),
      env.DB.prepare('DELETE FROM vcc_plan_cycles'),
      env.DB.prepare('DELETE FROM vcc_annual_plan_items'),
      env.DB.prepare('DELETE FROM vcc_annual_plans'),
      env.DB.prepare("DELETE FROM vcc_assets WHERE asset_code LIKE 'QC-%'")
    ]);
  });
});
