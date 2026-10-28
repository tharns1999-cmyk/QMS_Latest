import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('VCC Phase 2: Calibration Schedule Rules, Annual Plan Matrix & Plan Approval', () => {
  let proxy;
  let env;
  const tokens = {};
  const PASSWORD = 'vcc-plan-pass-123456';

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
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('VPQC', 'ควบคุมคุณภาพ VCC Plan', 'ACTIVE'), ('VPWH', 'คลังสินค้า VCC Plan', 'ACTIVE')"),
      // Prepare users across approval levels:
      // VP-DCC: DCC preparer (L4, is_dcc=1)
      // VP-L2: General staff (L2, is_dcc=0)
      // VP-REV4: Reviewer (L4, is_dcc=1)
      // VP-APP6: Approver (L6, is_dcc=1)
      ...[
        ['VP-DCC', 4, 1],
        ['VP-L2', 2, 0],
        ['VP-REV4', 4, 1],
        ['VP-APP6', 6, 1]
      ].map(([id, level, dcc]) =>
        env.DB.prepare(
          `INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
           VALUES (?, ?, ?, ?, 'USER', ?, 'VPQC', '["VPQC"]', ?)`
        ).bind(id, id, `${id}@vccplan.local`, hash, level, dcc)
      )
    ]);

    for (const id of ['VP-DCC', 'VP-L2', 'VP-REV4', 'VP-APP6']) {
      const res = await app.request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `${id}@vccplan.local`, password: PASSWORD })
        },
        env
      );
      tokens[id] = (await res.json()).token;
    }
  });

  afterAll(async () => {
    await proxy?.dispose();
  });

  it('rejects non-DCC users on plan management and settings endpoints with 403', async () => {
    expect((await call('GET', '/api/vcc/plan-settings', 'VP-L2')).status).toBe(403);
    expect((await call('PUT', '/api/vcc/plan-settings', 'VP-L2', { providers: ['ภายใน'] })).status).toBe(403);
    expect((await call('GET', '/api/vcc/plans', 'VP-L2')).status).toBe(403);
    expect((await call('POST', '/api/vcc/plans', 'VP-L2', { plan_year: 2026, department: 'VPQC' })).status).toBe(403);
  });

  it('loads and updates plan settings and validates approval_doc_type against approval_matrix', async () => {
    const initial = await call('GET', '/api/vcc/plan-settings', 'VP-DCC');
    expect(initial.status).toBe(200);
    expect(initial.body.providers).toContain('ห้องปฏิบัติการภายนอก');
    expect(initial.body.planSettings.approval_doc_type).toBe('FM');
    expect(initial.body.thresholds).toMatchObject({
      min_requester_level: 1,
      required_reviewer_level: 4,
      required_approver_level: 5
    });

    // Reject unknown approval_matrix doc_type
    const invalidMatrix = await call('PUT', '/api/vcc/plan-settings', 'VP-DCC', {
      planSettings: { approval_doc_type: 'UNKNOWN_TYPE' }
    });
    expect(invalidMatrix.status).toBe(400);

    // Update providers and restore
    const updated = await call('PUT', '/api/vcc/plan-settings', 'VP-DCC', {
      providers: ['ห้องปฏิบัติการภายนอก', 'ทวนสอบภายใน', 'บ.ยูโรแพค จำกัด', 'ห้องแล็บสอบเทียบ ISO 17025']
    });
    expect(updated.status).toBe(200);
    expect(updated.body.providers).toContain('ห้องแล็บสอบเทียบ ISO 17025');
  });

  it('schedules Vernier Caliper V001 (month 2) and V002 (month 9), computes due dates, never treats plan as completion evidence, and enforces group child selection for work orders', async () => {
    // 1. Register assets: Vernier group + V001 & V002, Scale group + SC-01, and a retired asset
    const grpVernier = (await call('POST', '/api/vcc/assets', 'VP-DCC', {
      asset_code: 'GRP-VERNIER-VP',
      name: '[ข้อมูลทดสอบ] กลุ่มเวอร์เนียร์คาลิปเปอร์',
      asset_type: 'เวอร์เนียร์คาลิปเปอร์',
      department: 'VPQC',
      is_group: true
    })).body.asset;

    const v001 = (await call('POST', '/api/vcc/assets', 'VP-DCC', {
      asset_code: 'V001',
      name: '[ข้อมูลทดสอบ] เวอร์เนียร์คาลิปเปอร์ V001',
      asset_type: 'เวอร์เนียร์คาลิปเปอร์',
      department: 'VPQC',
      is_group: false,
      parent_id: grpVernier.id
    })).body.asset;

    const v002 = (await call('POST', '/api/vcc/assets', 'VP-DCC', {
      asset_code: 'V002',
      name: '[ข้อมูลทดสอบ] เวอร์เนียร์คาลิปเปอร์ V002',
      asset_type: 'เวอร์เนียร์คาลิปเปอร์',
      department: 'VPQC',
      is_group: false,
      parent_id: grpVernier.id
    })).body.asset;

    const grpScale = (await call('POST', '/api/vcc/assets', 'VP-DCC', {
      asset_code: 'GRP-SCALE-VP',
      name: '[ข้อมูลทดสอบ] กลุ่มเครื่องชั่งฝ่ายคลังสินค้า',
      asset_type: 'เครื่องชั่ง',
      department: 'VPWH',
      is_group: true
    })).body.asset;

    const sc01 = (await call('POST', '/api/vcc/assets', 'VP-DCC', {
      asset_code: 'SC-VP-01',
      name: '[ข้อมูลทดสอบ] เครื่องชั่งคลังสินค้า ตัวที่ 1',
      asset_type: 'เครื่องชั่ง',
      department: 'VPWH',
      is_group: false,
      parent_id: grpScale.id
    })).body.asset;

    const retiredAsset = (await call('POST', '/api/vcc/assets', 'VP-DCC', {
      asset_code: 'OLD-VP-01',
      name: '[ข้อมูลทดสอบ] เครื่องมือปลดระวาง',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'VPQC',
      is_group: false
    })).body.asset;
    await call('POST', `/api/vcc/assets/${retiredAsset.id}/retire`, 'VP-DCC', { reason: 'ชำรุด' });

    // 2. Create 2026 Annual Plan (END_OF_MONTH due date rule)
    const createPlan = await call('POST', '/api/vcc/plans', 'VP-DCC', {
      plan_year: 2026,
      department: 'VPQC',
      document_code: 'FM-QC-46',
      revision: '01',
      title: '[ข้อมูลทดสอบ] แผนการทวนสอบเครื่องมือประจำปี 2026',
      due_date_rule: 'END_OF_MONTH'
    });
    expect(createPlan.status).toBe(201);
    const planId = createPlan.body.plan.id;

    // Duplicate plan_year + department + revision -> 409
    const dupPlan = await call('POST', '/api/vcc/plans', 'VP-DCC', {
      plan_year: 2026,
      department: 'VPQC',
      revision: '01',
      title: 'ซ้ำ'
    });
    expect(dupPlan.status).toBe(409);

    // 3. Reject retired asset in plan -> 400
    const addRetired = await call('POST', `/api/vcc/plans/${planId}/items`, 'VP-DCC', {
      asset_id: retiredAsset.id,
      provider_name: 'ห้องปฏิบัติการภายนอก',
      planned_months: [5],
      responsible_dept: 'VPQC'
    });
    expect(addRetired.status).toBe(400);

    // 4. Add V001 (month 2 -> 2026-02-28) and V002 (month 9 -> 2026-09-30)
    const itemV1 = await call('POST', `/api/vcc/plans/${planId}/items`, 'VP-DCC', {
      asset_id: v001.id,
      provider_name: 'ห้องปฏิบัติการภายนอก',
      frequency_label: 'รายปี',
      planned_months: [2],
      responsible_dept: 'VPQC',
      responsible_label: 'QC Sup.',
      remarks: 'V001 ทวนสอบเดือน 2'
    });
    expect(itemV1.status).toBe(201);
    expect(itemV1.body.item.planned_months).toEqual([2]);
    expect(itemV1.body.item.due_dates).toEqual(['2026-02-28']);
    // Highlighted month in plan is NEVER proof of completion
    expect(itemV1.body.item.completion_status).toBe('PLANNED_ONLY');
    expect(itemV1.body.item.actual_months).toEqual([]);
    expect(itemV1.body.item.has_evidence).toBe(false);

    const itemV2 = await call('POST', `/api/vcc/plans/${planId}/items`, 'VP-DCC', {
      asset_id: v002.id,
      provider_name: 'ห้องปฏิบัติการภายนอก',
      frequency_label: 'รายปี',
      planned_months: [9],
      responsible_dept: 'VPQC',
      responsible_label: 'QC Sup.',
      remarks: 'V002 ทวนสอบเดือน 9'
    });
    expect(itemV2.status).toBe(201);
    expect(itemV2.body.item.due_dates).toEqual(['2026-09-30']);

    // 5. Add Group asset (GRP-SCALE-VP) and verify work order validation blocks group unless child asset is specified
    const itemGrp = await call('POST', `/api/vcc/plans/${planId}/items`, 'VP-DCC', {
      asset_id: grpScale.id,
      provider_name: 'ทวนสอบภายใน',
      frequency_label: 'รายเดือน',
      planned_months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      responsible_dept: 'VPWH',
      responsible_label: 'เจ้าหน้าที่ Store',
      remarks: 'ฝ่าย Store เป็นฝ่ายสอบเทียบ FM-ST-31'
    });
    expect(itemGrp.status).toBe(201);
    expect(itemGrp.body.item.requires_child_selection).toBe(true);
    expect(itemGrp.body.item.work_order_ready).toBe(false);

    // Attempt work order validation on group item without child_asset_id -> 400
    const woBlock = await call(
      'POST',
      `/api/vcc/plans/${planId}/items/${itemGrp.body.item.id}/validate-work-order`,
      'VP-DCC',
      {}
    );
    expect(woBlock.status).toBe(400);
    expect(woBlock.body.requires_child_selection).toBe(true);

    // With active child_asset_id -> 200 ready
    const woOk = await call(
      'POST',
      `/api/vcc/plans/${planId}/items/${itemGrp.body.item.id}/validate-work-order`,
      'VP-DCC',
      { child_asset_id: sc01.id }
    );
    expect(woOk.status).toBe(200);
    expect(woOk.body.ready).toBe(true);
    expect(woOk.body.target_asset.asset_code).toBe('SC-VP-01');

    // 6. Changing plan due_date_rule to START_OF_MONTH recalculates item due_dates
    const switchRule = await call('PUT', `/api/vcc/plans/${planId}`, 'VP-DCC', {
      due_date_rule: 'START_OF_MONTH'
    });
    expect(switchRule.status).toBe(200);
    const updatedV1 = switchRule.body.items.find((i) => i.asset_code === 'V001');
    expect(updatedV1.due_dates).toEqual(['2026-02-01']);

    // Switch back to END_OF_MONTH
    await call('PUT', `/api/vcc/plans/${planId}`, 'VP-DCC', {
      due_date_rule: 'END_OF_MONTH'
    });
  });

  it('enforces approval_matrix levels, separation of duties, status separation, and audit_log trail', async () => {
    // Get the 2026 DRAFT plan created earlier
    const draftList = await call('GET', '/api/vcc/plans?status=DRAFT&year=2026', 'VP-DCC');
    expect(draftList.status).toBe(200);
    expect(draftList.body.plans.length).toBeGreaterThanOrEqual(1);
    const plan = draftList.body.plans.find((p) => p.department === 'VPQC');

    // Status separation: must not appear in APPROVED list
    const approvedListBefore = await call('GET', '/api/vcc/plans?status=APPROVED&year=2026', 'VP-DCC');
    expect(approvedListBefore.body.plans.some((p) => p.id === plan.id)).toBe(false);

    // 1. Submit plan by VP-DCC (DRAFT -> PENDING_REVIEW)
    const submitRes = await call('POST', `/api/vcc/plans/${plan.id}/submit`, 'VP-DCC');
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.plan.status).toBe('PENDING_REVIEW');
    expect(submitRes.body.plan.prepared_by).toBe('VP-DCC');

    // Once PENDING_REVIEW, cannot edit plan directly -> 409
    const editLocked = await call('PUT', `/api/vcc/plans/${plan.id}`, 'VP-DCC', { title: 'แก้ไม่ได้' });
    expect(editLocked.status).toBe(409);

    // 2. Self-review by preparer (VP-DCC) -> 403
    const selfReview = await call('POST', `/api/vcc/plans/${plan.id}/review`, 'VP-DCC', { comment: 'ทบทวนเอง' });
    expect(selfReview.status).toBe(403);

    // 3. Review by low-level user (VP-L2 < L4 required by FM matrix) -> 403
    const lowReview = await call('POST', `/api/vcc/plans/${plan.id}/review`, 'VP-L2', { comment: 'ระดับไม่ถึง' });
    expect(lowReview.status).toBe(403);

    // 4. Reject / Return by valid reviewer (VP-REV4) requires reason
    const rejectNoReason = await call('POST', `/api/vcc/plans/${plan.id}/reject`, 'VP-REV4', { reason: '   ' });
    expect(rejectNoReason.status).toBe(400);

    const rejectOk = await call('POST', `/api/vcc/plans/${plan.id}/reject`, 'VP-REV4', {
      reason: 'กรุณาตรวจสอบหมายเหตุเครื่องชั่งอีกครั้ง'
    });
    expect(rejectOk.status).toBe(200);
    expect(rejectOk.body.plan.status).toBe('REJECTED');

    // Resubmit after rejection (REJECTED -> PENDING_REVIEW)
    const resubmit = await call('POST', `/api/vcc/plans/${plan.id}/submit`, 'VP-DCC');
    expect(resubmit.status).toBe(200);
    expect(resubmit.body.plan.status).toBe('PENDING_REVIEW');

    // 5. Valid review by VP-REV4 (L4 >= required_reviewer_level 4) -> PENDING_APPROVAL
    const reviewOk = await call('POST', `/api/vcc/plans/${plan.id}/review`, 'VP-REV4', {
      comment: 'ตรวจสอบความถี่และรายการเครื่องมือครบถ้วน'
    });
    expect(reviewOk.status).toBe(200);
    expect(reviewOk.body.plan.status).toBe('PENDING_APPROVAL');
    expect(reviewOk.body.plan.reviewed_by).toBe('VP-REV4');

    // 6. Reviewer cannot also approve (separation of duties) -> 403
    const reviewerApprove = await call('POST', `/api/vcc/plans/${plan.id}/approve`, 'VP-REV4', { comment: 'อนุมัติซ้ำ' });
    expect(reviewerApprove.status).toBe(403);

    // 7. Preparer cannot approve -> 403
    const preparerApprove = await call('POST', `/api/vcc/plans/${plan.id}/approve`, 'VP-DCC', { comment: 'อนุมัติเอง' });
    expect(preparerApprove.status).toBe(403);

    // 8. Valid approval by VP-APP6 (L6 >= required_approver_level 5) -> APPROVED
    const approveOk = await call('POST', `/api/vcc/plans/${plan.id}/approve`, 'VP-APP6', {
      comment: 'อนุมัติแผนการทวนสอบประจำปี 2026'
    });
    expect(approveOk.status).toBe(200);
    expect(approveOk.body.plan.status).toBe('APPROVED');
    expect(approveOk.body.plan.approved_by).toBe('VP-APP6');

    // 9. Verify audit trail in detail endpoint
    const detail = await call('GET', `/api/vcc/plans/${plan.id}`, 'VP-DCC');
    expect(detail.status).toBe(200);
    const actions = detail.body.history.map((h) => h.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'VCC_PLAN_CREATED',
        'VCC_PLAN_ITEM_SAVED',
        'VCC_PLAN_SUBMITTED',
        'VCC_PLAN_REJECTED',
        'VCC_PLAN_REVIEWED',
        'VCC_PLAN_APPROVED'
      ])
    );
  });
});

