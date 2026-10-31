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

  it('schedules Vernier Caliper V001 (month 2) and V002 (month 9), computes due dates, blocks Logical Groups in new plans, converts legacy draft groups safely, and preserves historical approved group validation', async () => {
    // 1. Register flat operational assets: V001 & V002, SC-VP-01, and a retired asset; seed legacy DB Logical Groups for backward-compatibility checks
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO vcc_assets (id, asset_code, name, asset_type, department, is_group, group_nature, parent_id, status, created_by, updated_by)
         VALUES ('vp-legacy-grp-vernier', 'GRP-VERNIER-VP', '[ข้อมูลทดสอบ] กลุ่มเวอร์เนียร์เดิม', 'เวอร์เนียร์คาลิปเปอร์', 'VPQC', 1, 'LOGICAL_GROUP', NULL, 'ACTIVE', 'VP-DCC', 'VP-DCC')`
      ),
      env.DB.prepare(
        `INSERT INTO vcc_assets (id, asset_code, name, asset_type, department, is_group, group_nature, parent_id, status, created_by, updated_by)
         VALUES ('vp-legacy-grp-scale', 'GRP-SCALE-VP', '[ข้อมูลทดสอบ] กลุ่มเครื่องชั่งเดิม', 'เครื่องชั่ง', 'VPWH', 1, 'LOGICAL_GROUP', NULL, 'ACTIVE', 'VP-DCC', 'VP-DCC')`
      )
    ]);
    const grpScale = { id: 'vp-legacy-grp-scale', asset_code: 'GRP-SCALE-VP' };

    const v001 = (await call('POST', '/api/vcc/assets', 'VP-DCC', {
      asset_code: 'V001',
      name: '[ข้อมูลทดสอบ] เวอร์เนียร์คาลิปเปอร์ V001',
      asset_type: 'เวอร์เนียร์คาลิปเปอร์',
      department: 'VPQC'
    })).body.asset;

    const v002 = (await call('POST', '/api/vcc/assets', 'VP-DCC', {
      asset_code: 'V002',
      name: '[ข้อมูลทดสอบ] เวอร์เนียร์คาลิปเปอร์ V002',
      asset_type: 'เวอร์เนียร์คาลิปเปอร์',
      department: 'VPQC'
    })).body.asset;

    const sc01 = (await call('POST', '/api/vcc/assets', 'VP-DCC', {
      asset_code: 'SC-VP-01',
      name: '[ข้อมูลทดสอบ] เครื่องชั่งคลังสินค้า ตัวที่ 1',
      asset_type: 'เครื่องชั่ง',
      department: 'VPWH'
    })).body.asset;
    // Link legacy parent_id in DB to simulate historical child relationship for historical approved plan test
    await env.DB.prepare("UPDATE vcc_assets SET parent_id = 'vp-legacy-grp-scale' WHERE id = ?").bind(sc01.id).run();

    const retiredAsset = (await call('POST', '/api/vcc/assets', 'VP-DCC', {
      asset_code: 'OLD-VP-01',
      name: '[ข้อมูลทดสอบ] เครื่องมือปลดระวาง',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'VPQC'
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

    // 3. Reject retired asset AND reject Logical Group in operational plan -> 400
    const addRetired = await call('POST', `/api/vcc/plans/${planId}/items`, 'VP-DCC', {
      asset_id: retiredAsset.id,
      provider_name: 'ห้องปฏิบัติการภายนอก',
      planned_months: [5],
      responsible_dept: 'VPQC'
    });
    expect(addRetired.status).toBe(400);

    const addGroupBlocked = await call('POST', `/api/vcc/plans/${planId}/items`, 'VP-DCC', {
      asset_id: grpScale.id,
      provider_name: 'ทวนสอบภายใน',
      planned_months: [1, 2, 3],
      responsible_dept: 'VPWH'
    });
    expect(addGroupBlocked.status).toBe(400);

    // 4. Add V001 (month 2 -> 2026-02-28) and V002 (month 9 -> 2026-09-30) as flat independent rows
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

    // 5. Legacy Draft Group Migration & Submission Gate:
    // Seed a legacy group item in this DRAFT plan; submit MUST block until converted!
    await env.DB.prepare(
      `INSERT INTO vcc_annual_plan_items (id, plan_id, asset_id, provider_name, frequency_label, planned_months, due_dates, responsible_dept, remarks, sort_order, created_by, updated_by)
       VALUES ('vp-legacy-pi-grp', ?, 'vp-legacy-grp-scale', 'ทวนสอบภายใน', 'รายเดือน', '[1,2,3]', '[]', 'VPWH', 'ข้อมูลเดิม', 10, 'VP-DCC', 'VP-DCC')`
    ).bind(planId).run();

    const submitWithLegacyGroup = await call('POST', `/api/vcc/plans/${planId}/submit`, 'VP-DCC');
    expect(submitWithLegacyGroup.status).toBe(400);
    expect(submitWithLegacyGroup.body.unresolved_group_items).toHaveLength(1);
    expect(submitWithLegacyGroup.body.unresolved_group_items[0].asset_code).toBe('GRP-SCALE-VP');

    // Converting without months or remarks is rejected (no silent auto-inheritance!)
    const convertNoMonths = await call('POST', `/api/vcc/plans/${planId}/items/vp-legacy-pi-grp/convert-group`, 'VP-DCC', {
      selections: [{ asset_id: sc01.id, planned_months: [], remarks: '' }]
    });
    expect(convertNoMonths.status).toBe(400);

    // Converting with explicit user-chosen months ([3, 9]) succeeds atomically and removes GRP-SCALE-VP
    const convertOk = await call('POST', `/api/vcc/plans/${planId}/items/vp-legacy-pi-grp/convert-group`, 'VP-DCC', {
      selections: [{
        asset_id: sc01.id,
        planned_months: [3, 9],
        provider_name: 'ทวนสอบภายใน',
        frequency_label: 'ทุก 6 เดือน',
        responsible_dept: 'VPWH',
        remarks: 'แปลงเป็นเครื่องมือรายตัว'
      }]
    });
    expect(convertOk.status).toBe(200);
    expect(convertOk.body.items.some((i) => i.asset_code === 'GRP-SCALE-VP')).toBe(false);
    const convertedSc01 = convertOk.body.items.find((i) => i.asset_code === 'SC-VP-01');
    expect(convertedSc01.planned_months).toEqual([3, 9]);

    // 6. Historical APPROVED plan with a legacy group item remains preserved read-only and still validates child selection for WOs
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO vcc_annual_plans (id, plan_year, department, document_code, revision, title, due_date_rule, status, prepared_by, reviewed_by, approved_by, created_by, updated_by)
         VALUES ('vp-hist-plan-2025', 2025, 'VPWH', 'FM-QC-46', '00', '[ข้อมูลทดสอบ] แผนปี 2025 เดิม', 'END_OF_MONTH', 'APPROVED', 'VP-DCC', 'VP-REV4', 'VP-APP6', 'VP-DCC', 'VP-APP6')`
      ),
      env.DB.prepare(
        `INSERT INTO vcc_annual_plan_items (id, plan_id, asset_id, provider_name, frequency_label, planned_months, due_dates, responsible_dept, remarks, sort_order, created_by, updated_by)
         VALUES ('vp-hist-pi-grp', 'vp-hist-plan-2025', 'vp-legacy-grp-scale', 'ทวนสอบภายใน', 'รายเดือน', '[6]', '["2025-06-30"]', 'VPWH', 'ประวัติเดิม', 1, 'VP-DCC', 'VP-DCC')`
      )
    ]);

    // Cannot run convert-group on an APPROVED historical plan (409)
    const convertApprovedBlocked = await call('POST', '/api/vcc/plans/vp-hist-plan-2025/items/vp-hist-pi-grp/convert-group', 'VP-DCC', {
      confirm_remove_empty: true
    });
    expect(convertApprovedBlocked.status).toBe(409);

    const woBlock = await call('POST', '/api/vcc/plans/vp-hist-plan-2025/items/vp-hist-pi-grp/validate-work-order', 'VP-DCC', {});
    expect(woBlock.status).toBe(400);
    expect(woBlock.body.requires_child_selection).toBe(true);

    const woOk = await call('POST', '/api/vcc/plans/vp-hist-plan-2025/items/vp-hist-pi-grp/validate-work-order', 'VP-DCC', {
      child_asset_id: sc01.id
    });
    expect(woOk.status).toBe(200);
    expect(woOk.body.ready).toBe(true);
    expect(woOk.body.target_asset.asset_code).toBe('SC-VP-01');

    // 7. Changing plan due_date_rule to START_OF_MONTH recalculates item due_dates
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

  it('registry-driven planning: auto-loads eligible assets, enforces submission justification gate, freezes scope, and ignores new assets after submit', async () => {
    // 1. Create 2027 DRAFT plan for VPQC
    const planRes = await call('POST', '/api/vcc/plans', 'VP-DCC', {
      plan_year: 2027,
      department: 'VPQC',
      document_code: 'FM-QC-46',
      revision: '01',
      title: '[ข้อมูลทดสอบ] แผนทวนสอบ 2027'
    });
    expect(planRes.status).toBe(201);
    const plan2027Id = planRes.body.plan.id;

    // 2. Fetch plan detail: all eligible active VPQC assets appear automatically as registry-driven items
    const detailBefore = await call('GET', `/api/vcc/plans/${plan2027Id}`, 'VP-DCC');
    expect(detailBefore.status).toBe(200);
    const assetCodes = detailBefore.body.items.map((i) => i.asset_code);
    expect(assetCodes).toContain('V001');
    expect(assetCodes).toContain('V002');
    // Logical group container must NOT be auto-loaded as a calibratable plan item (flat instrument-centric)
    expect(assetCodes).not.toContain('GRP-VERNIER-VP');
    // Retired asset must NOT appear in draft
    expect(assetCodes).not.toContain('OLD-VP-01');

    // Items are virtual before explicit save
    const v1Item = detailBefore.body.items.find((i) => i.asset_code === 'V001');
    expect(v1Item.planned_months).toEqual([]);

    // 3. Submitting without planning or justification is blocked by submission gate -> 400
    const submitBlocked = await call('POST', `/api/vcc/plans/${plan2027Id}/submit`, 'VP-DCC');
    expect(submitBlocked.status).toBe(400);
    expect(submitBlocked.body.error).toMatch(/กรุณาวางแผนเดือนทวนสอบหรือระบุเหตุผลที่ไม่วางแผน/);

    // 4. Plan V001 for month 4, and record justification for V002
    const v1Asset = detailBefore.body.items.find((i) => i.asset_code === 'V001');
    const v2Asset = detailBefore.body.items.find((i) => i.asset_code === 'V002');

    const planV1 = await call('POST', `/api/vcc/plans/${plan2027Id}/items`, 'VP-DCC', {
      asset_id: v1Asset.asset_id,
      provider_name: 'ห้องปฏิบัติการภายนอก',
      planned_months: [4],
      responsible_dept: 'VPQC'
    });
    expect(planV1.status).toBe(201);

    const justifyV2 = await call('POST', `/api/vcc/plans/${plan2027Id}/items`, 'VP-DCC', {
      asset_id: v2Asset.asset_id,
      provider_name: 'ห้องปฏิบัติการภายนอก',
      planned_months: [],
      remarks: 'ยังไม่ถึงกำหนดตามรอบความถี่ (รอบ 2 ปี)',
      responsible_dept: 'VPQC'
    });
    expect(justifyV2.status).toBe(201);

    // 5. Submit now succeeds and freezes scope -> PENDING_REVIEW
    const submitOk = await call('POST', `/api/vcc/plans/${plan2027Id}/submit`, 'VP-DCC');
    expect(submitOk.status).toBe(200);
    expect(submitOk.body.plan.status).toBe('PENDING_REVIEW');

    // 6. Register a new asset in VPQC after submission
    const newTool = (await call('POST', '/api/vcc/assets', 'VP-DCC', {
      asset_code: 'NEW-QC-999',
      name: '[ข้อมูลทดสอบ] เครื่องมือใหม่หลังส่งแผน',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'VPQC',
      is_group: false
    })).body.asset;

    // 7. Verify the submitted plan scope is frozen: NEW-QC-999 does NOT appear in 2027 plan
    const detailAfter = await call('GET', `/api/vcc/plans/${plan2027Id}`, 'VP-DCC');
    expect(detailAfter.status).toBe(200);
    expect(detailAfter.body.items.some((i) => i.asset_code === 'NEW-QC-999')).toBe(false);

    // 8. But a new DRAFT plan (2028) WILL automatically include NEW-QC-999
    const plan2028 = (await call('POST', '/api/vcc/plans', 'VP-DCC', {
      plan_year: 2028,
      department: 'VPQC',
      document_code: 'FM-QC-46',
      revision: '01',
      title: '[ข้อมูลทดสอบ] แผนทวนสอบ 2028'
    })).body.plan;
    const detail2028 = await call('GET', `/api/vcc/plans/${plan2028.id}`, 'VP-DCC');
    expect(detail2028.body.items.some((i) => i.asset_code === 'NEW-QC-999')).toBe(true);
  });
});

