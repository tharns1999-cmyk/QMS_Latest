import { describe, it, expect, beforeAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('VCC Phase 1-2: Automatic Work Order Generation, Lifecycle & Idempotency', () => {
  let proxy;
  let env;
  const tokens = {};
  const PASSWORD = 'vcc-wo-auto-pass-123456';

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

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword(PASSWORD);

    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('AUTOQC', 'ควบคุมคุณภาพ AutoWO', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('RECONQC', 'ควบคุมคุณภาพ ReconWO', 'ACTIVE')"),
      ...[
        ['AUTO-PREP', 2, 1], // Requester / Preparer (L2, DCC)
        ['AUTO-REV4', 4, 1], // Reviewer (L4, DCC)
        ['AUTO-APP6', 6, 1]  // Approver (L6, DCC)
      ].map(([id, level, dcc]) =>
        env.DB.prepare(
          `INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
           VALUES (?, ?, ?, ?, 'USER', ?, 'AUTOQC', '["AUTOQC","RECONQC"]', ?)`
        ).bind(id, id, `${id}@autowo.local`, hash, level, dcc)
      )
    ]);

    for (const id of ['AUTO-PREP', 'AUTO-REV4', 'AUTO-APP6']) {
      const res = await app.request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `${id}@autowo.local`, password: PASSWORD })
        },
        env
      );
      const json = await res.json();
      tokens[id] = json.token;
    }
  });

  it('verifies 5 instruments with 17 planned cycles generate 0 work orders in DRAFT/REVIEW, exactly 17 work orders on APPROVE, and 0 duplicates on retry', async () => {
    // 1. Create 5 flat calibratable assets in AUTOQC department
    const assetConfigs = [
      { id: 'AST-AUTO-01', code: 'QC-AUTO-01', name: 'ไมโครมิเตอร์ 01', months: [3, 6, 9, 12] }, // 4 cycles
      { id: 'AST-AUTO-02', code: 'QC-AUTO-02', name: 'เวอร์เนียร์ 02', months: [2, 5, 8, 11] }, // 4 cycles
      { id: 'AST-AUTO-03', code: 'QC-AUTO-03', name: 'เกจบล็อก 03', months: [1, 5, 9] },         // 3 cycles
      { id: 'AST-AUTO-04', code: 'QC-AUTO-04', name: 'ไดอัลเกจ 04', months: [4, 10] },            // 2 cycles
      { id: 'AST-AUTO-05', code: 'QC-AUTO-05', name: 'เทอร์โมมิเตอร์ 05', months: [1, 4, 7, 10] } // 4 cycles
    ];
    // Total cycles = 4 + 4 + 3 + 2 + 4 = 17 cycles

    for (const a of assetConfigs) {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO vcc_assets (id, asset_code, name, asset_type, department, status, is_group, group_nature)
        VALUES (?, ?, ?, 'เครื่องมือทั่วไป', 'AUTOQC', 'ACTIVE', 0, 'LOGICAL_GROUP')
      `).bind(a.id, a.code, a.name).run();
    }

    // 2. Create Annual Plan 2026 for AUTOQC
    const planRes = await call('POST', '/api/vcc/plans', 'AUTO-PREP', {
      plan_year: 2026,
      department: 'AUTOQC',
      title: 'แผนการสอบเทียบเครื่องมือวัดประจำปี 2026 [AUTO-WO]',
      document_code: 'FM-QC-46',
      revision: '00',
      due_date_rule: 'END_OF_MONTH'
    });
    expect(planRes.status).toBe(201);
    const planId = planRes.body.plan.id;

    // 3. Add all 5 instruments to the plan with their planned cycles
    for (const a of assetConfigs) {
      const itemRes = await call('POST', `/api/vcc/plans/${planId}/items`, 'AUTO-PREP', {
        asset_id: a.id,
        provider_name: 'ทวนสอบภายใน',
        frequency_label: 'ตามกำหนดการ',
        planned_months: a.months,
        responsible_dept: 'AUTOQC',
        responsible_label: 'จนท.สอบเทียบ',
        remarks: ''
      });
      expect(itemRes.status).toBe(201);
    }

    // 4. Verify in DRAFT status: 0 work orders exist
    const draftWos = await call('GET', `/api/vcc/work-orders?plan_id=${planId}`, 'AUTO-PREP');
    expect(draftWos.status).toBe(200);
    expect(draftWos.body.workOrders.length).toBe(0);

    // Verify /reconcile-work-orders fails on DRAFT plan
    const draftReconcile = await call('POST', `/api/vcc/plans/${planId}/reconcile-work-orders`, 'AUTO-PREP');
    expect(draftReconcile.status).toBe(409);

    // 5. Submit plan (DRAFT -> PENDING_REVIEW)
    const submitRes = await call('POST', `/api/vcc/plans/${planId}/submit`, 'AUTO-PREP', {
      reviewer_id: 'AUTO-REV4',
      approver_id: 'AUTO-APP6'
    });
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.plan.status).toBe('PENDING_REVIEW');

    // Verify in PENDING_REVIEW status: 0 work orders exist
    const reviewWos = await call('GET', `/api/vcc/work-orders?plan_id=${planId}`, 'AUTO-PREP');
    expect(reviewWos.body.workOrders.length).toBe(0);

    // 6. Review plan (PENDING_REVIEW -> PENDING_APPROVAL)
    const reviewRes = await call('POST', `/api/vcc/plans/${planId}/review`, 'AUTO-REV4', {
      comment: 'ผ่านการทวนสอบความครบถ้วน 17 รอบตามแผน'
    });
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.plan.status).toBe('PENDING_APPROVAL');

    // Verify in PENDING_APPROVAL status: 0 work orders exist
    const pendingApproveWos = await call('GET', `/api/vcc/work-orders?plan_id=${planId}`, 'AUTO-PREP');
    expect(pendingApproveWos.body.workOrders.length).toBe(0);

    // 7. Approve plan (PENDING_APPROVAL -> APPROVED)
    const approveRes = await call('POST', `/api/vcc/plans/${planId}/approve`, 'AUTO-APP6', {
      comment: 'อนุมัติแผนประจำปี 2026 พร้อมสร้างใบสั่งงานอัตโนมัติ'
    });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.plan.status).toBe('APPROVED');
    expect(approveRes.body.work_orders_generation).toBeDefined();
    expect(approveRes.body.work_orders_generation.total_cycles).toBe(17);
    expect(approveRes.body.work_orders_generation.generated_count).toBe(17);
    expect(approveRes.body.work_orders_generation.reconciled_count).toBe(0);
    expect(approveRes.body.work_orders_generation.skipped_count).toBe(0);

    // 8. Query Work Orders list: Exactly 17 Work Orders exist!
    const approvedWos = await call('GET', `/api/vcc/work-orders?plan_id=${planId}&status=OPEN`, 'AUTO-PREP');
    expect(approvedWos.status).toBe(200);
    expect(approvedWos.body.workOrders.length).toBe(17);

    // Validate details of generated work orders:
    const codes = approvedWos.body.workOrders.map((w) => w.wo_code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(17); // All 17 codes are distinct
    for (const code of codes) {
      expect(code).toMatch(/^WO-2026-\d{3}$/);
    }

    const cycleKeys = approvedWos.body.workOrders.map((w) => w.cycle_key);
    const uniqueCycleKeys = new Set(cycleKeys);
    expect(uniqueCycleKeys.size).toBe(17); // All 17 cycle_keys are distinct
    for (const ck of cycleKeys) {
      expect(ck).toMatch(/^2026:AUTOQC:AST-AUTO-\d{2}:\d{1,2}$/);
    }

    // Every generated work order has SCHEDULED status and proper due date
    for (const wo of approvedWos.body.workOrders) {
      expect(wo.status).toBe('SCHEDULED');
      expect(wo.plan_year).toBe(2026);
      expect(wo.plan_revision).toBe('00');
      expect(wo.baseline_planned_date).toBe(wo.due_date);
      expect(wo.scheduled_date).toBe(wo.due_date);
      expect(wo.required_due_date).toBe(wo.due_date);
      expect(wo.due_date).toMatch(/^2026-\d{2}-\d{2}$/);
    }

    // 9. Test Idempotency: Calling /reconcile-work-orders again must NOT generate duplicate work orders!
    const reconcileRes = await call('POST', `/api/vcc/plans/${planId}/reconcile-work-orders`, 'AUTO-APP6');
    expect(reconcileRes.status).toBe(200);
    expect(reconcileRes.body.work_orders_generation.generated_count).toBe(0);
    expect(reconcileRes.body.work_orders_generation.skipped_count).toBe(17);

    // Re-verify list count remains exactly 17
    const wosAfterReconcile = await call('GET', `/api/vcc/work-orders?plan_id=${planId}&status=OPEN`, 'AUTO-PREP');
    expect(wosAfterReconcile.body.workOrders.length).toBe(17);

    // 10. Test Concurrency & Parallel Requests: fire 5 parallel reconcile requests
    const parallelResults = await Promise.all([
      call('POST', `/api/vcc/plans/${planId}/reconcile-work-orders`, 'AUTO-APP6'),
      call('POST', `/api/vcc/plans/${planId}/reconcile-work-orders`, 'AUTO-APP6'),
      call('POST', `/api/vcc/plans/${planId}/reconcile-work-orders`, 'AUTO-APP6'),
      call('POST', `/api/vcc/plans/${planId}/reconcile-work-orders`, 'AUTO-APP6'),
      call('POST', `/api/vcc/plans/${planId}/reconcile-work-orders`, 'AUTO-APP6')
    ]);
    for (const pr of parallelResults) {
      expect(pr.status).toBe(200);
      expect(pr.body.work_orders_generation.generated_count).toBe(0);
    }

    // Work Orders count MUST still be exactly 17
    const wosAfterParallel = await call('GET', `/api/vcc/work-orders?plan_id=${planId}&status=OPEN`, 'AUTO-PREP');
    expect(wosAfterParallel.body.workOrders.length).toBe(17);

    // 11. Verify Database Unique Constraint idx_vcc_wo_unique_cycle prevents manual duplicate insert
    const sampleWo = approvedWos.body.workOrders[0];
    let insertDuplicateFailed = false;
    try {
      await env.DB.prepare(`
        INSERT INTO vcc_work_orders (
          id, wo_code, cycle_key, plan_year, plan_id, plan_item_id, planned_month, asset_id, provider_name,
          due_date, original_due_date, status, result_status
        ) VALUES (?, 'WO-2026-DUP', ?, 2026, ?, ?, ?, ?, 'ทดสอบซ้ำ', '2026-12-31', '2026-12-31', 'SCHEDULED', 'PENDING')
      `).bind(
        'dup-id-1234',
        sampleWo.cycle_key,
        planId,
        sampleWo.plan_item_id,
        sampleWo.planned_month,
        sampleWo.asset_id
      ).run();
    } catch (err) {
      insertDuplicateFailed = true;
      expect(err.message).toMatch(/UNIQUE/i);
    }
    expect(insertDuplicateFailed).toBe(true);

    // 12. Check Audit Logs: VCC_PLAN_APPROVED and VCC_PLAN_WO_AUTO_GENERATED exist
    const { results: audits } = await env.DB.prepare(`
      SELECT action, details FROM audit_log
      WHERE details LIKE ?
      ORDER BY at DESC
    `).bind(`%${planId}%`).all();

    const actions = audits.map((a) => a.action);
    expect(actions).toContain('VCC_PLAN_APPROVED');
    expect(actions).toContain('VCC_PLAN_WO_AUTO_GENERATED');
  });

  it('reconciles existing manual work order without duplicate creation', async () => {
    // Create an instrument in RECONQC
    const assetId = 'AST-RECON-01';
    await env.DB.prepare(`
      INSERT OR IGNORE INTO vcc_assets (id, asset_code, name, asset_type, department, status, is_group, group_nature)
      VALUES (?, 'QC-RECON-01', 'เครื่องวัดความดัน 01', 'เครื่องมือทั่วไป', 'RECONQC', 'ACTIVE', 0, 'LOGICAL_GROUP')
    `).bind(assetId).run();

    // Create a plan for 2027 in RECONQC
    const planRes = await call('POST', '/api/vcc/plans', 'AUTO-PREP', {
      plan_year: 2027,
      department: 'RECONQC',
      title: 'แผนการสอบเทียบประจำปี 2027 [RECON]',
      document_code: 'FM-QC-46',
      revision: '00',
      due_date_rule: 'END_OF_MONTH'
    });
    expect(planRes.status).toBe(201);
    const planId = planRes.body.plan.id;

    // Add item with months [4, 8]
    const itemRes = await call('POST', `/api/vcc/plans/${planId}/items`, 'AUTO-PREP', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      frequency_label: 'ราย 4 เดือน',
      planned_months: [4, 8],
      responsible_dept: 'RECONQC',
      responsible_label: 'จนท.',
      remarks: ''
    });
    expect(itemRes.status).toBe(201);
    const itemId = itemRes.body.item.id;

    // Manually create a work order for month 4 before approval
    const manualWoId = 'wo-manual-recon-001';
    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, plan_id, plan_item_id, planned_month, asset_id, provider_name,
        due_date, original_due_date, status, result_status
      ) VALUES (?, 'WO-2027-MANUAL', ?, ?, 4, ?, 'ทวนสอบภายใน', '2027-04-30', '2027-04-30', 'OPEN', 'PENDING')
    `).bind(manualWoId, planId, itemId, assetId).run();

    // Advance and approve plan
    const submitRes = await call('POST', `/api/vcc/plans/${planId}/submit`, 'AUTO-PREP', {
      reviewer_id: 'AUTO-REV4',
      approver_id: 'AUTO-APP6'
    });
    if (submitRes.status !== 200) console.error('Submit error:', submitRes.body);
    expect(submitRes.status).toBe(200);

    const reviewRes = await call('POST', `/api/vcc/plans/${planId}/review`, 'AUTO-REV4', { comment: 'ทบทวนแล้ว' });
    if (reviewRes.status !== 200) console.error('Review error:', reviewRes.body);
    expect(reviewRes.status).toBe(200);

    const approveRes = await call('POST', `/api/vcc/plans/${planId}/approve`, 'AUTO-APP6', { comment: 'อนุมัติ' });
    if (approveRes.status !== 200) console.error('Approve error:', approveRes.body);
    expect(approveRes.status).toBe(200);
    // Month 4 is reconciled, Month 8 is newly generated: Total = 2, Generated = 1, Reconciled = 1
    expect(approveRes.body.work_orders_generation.total_cycles).toBe(2);
    expect(approveRes.body.work_orders_generation.generated_count).toBe(1);
    expect(approveRes.body.work_orders_generation.reconciled_count).toBe(1);

    // Verify existing manual work order now has cycle_key assigned
    const updatedManual = await env.DB.prepare('SELECT * FROM vcc_work_orders WHERE id = ?').bind(manualWoId).first();
    expect(updatedManual.cycle_key).toBe(`2027:RECONQC:${assetId}:4`);
    expect(updatedManual.plan_year).toBe(2027);

    // Total work orders for this plan is exactly 2 (no duplicate for month 4)
    const allWos = await call('GET', `/api/vcc/work-orders?plan_id=${planId}&status=OPEN`, 'AUTO-PREP');
    expect(allWos.body.workOrders.length).toBe(2);
  });
});
