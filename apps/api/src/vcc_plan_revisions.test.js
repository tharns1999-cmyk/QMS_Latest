import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('VCC Phase 3.1: Plan Revision Foundation & Diff Engine Tests', () => {
  let proxy;
  let env;
  const tokens = {};
  const PASSWORD = 'rev-test-pass-123456';

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
        ['REV-QC-STAFF', 2, 1, 'QC', '["QC"]'],
        ['REV-QC-SUP', 4, 1, 'QC', '["QC"]'],
        ['REV-QA-MGR', 6, 1, 'QC', '["QC","QA"]'],
        ['REV-QA-STAFF', 2, 0, 'QA', '["QA"]'],
        ['REV-PD-STAFF', 2, 0, 'PD', '["PD"]']
      ].map(([id, level, dcc, dept, depts]) =>
        env.DB.prepare(
          `INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
           VALUES (?, ?, ?, ?, 'USER', ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             approval_level = excluded.approval_level,
             primary_department = excluded.primary_department,
             departments = excluded.departments,
             is_dcc = excluded.is_dcc`
        ).bind(id, id, `${id}@rev.local`, hash, level, dept, depts, dcc)
      )
    ]);

    for (const id of ['REV-QC-STAFF', 'REV-QC-SUP', 'REV-QA-MGR', 'REV-QA-STAFF', 'REV-PD-STAFF']) {
      const res = await app.request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `${id}@rev.local`, password: PASSWORD })
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

  // Helper to create an approved Rev.00 plan with 2 instruments
  const setupApprovedRev00Plan = async (year = 2026) => {
    const a1Res = await call('POST', '/api/vcc/assets', 'REV-QC-STAFF', {
      asset_code: 'QC-REV-01',
      name: 'เครื่องชั่งวิเคราะห์ 4 ตำแหน่ง',
      asset_type: 'เครื่องชั่ง',
      department: 'QC',
      status: 'ACTIVE'
    });
    const a2Res = await call('POST', '/api/vcc/assets', 'REV-QC-STAFF', {
      asset_code: 'QC-REV-02',
      name: 'ตู้ควบคุมอุณหภูมิและความชื้น',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'QC',
      status: 'ACTIVE'
    });

    const asset1Id = a1Res.body.asset.id;
    const asset2Id = a2Res.body.asset.id;

    const planRes = await call('POST', '/api/vcc/plans', 'REV-QC-STAFF', {
      plan_year: year,
      department: 'QC',
      revision: '00',
      title: `แผนสอบเทียบประจำปี ${year} (Rev.00 ฉบับแรกเริ่ม)`,
      assigned_reviewer_id: 'REV-QC-SUP',
      assigned_approver_id: 'REV-QA-MGR'
    });
    const planId = planRes.body.plan.id;

    // Asset 1 has 2 cycles: Month 3 and Month 9
    const item1Res = await call('POST', `/api/vcc/plans/${planId}/items`, 'REV-QC-STAFF', {
      asset_id: asset1Id,
      provider_name: 'ห้องปฏิบัติการภายนอก',
      frequency_label: '2 ครั้ง/ปี',
      planned_months: [3, 9],
      responsible_dept: 'QC'
    });

    // Asset 2 has 1 cycle: Month 6
    const item2Res = await call('POST', `/api/vcc/plans/${planId}/items`, 'REV-QC-STAFF', {
      asset_id: asset2Id,
      provider_name: 'ทวนสอบภายใน',
      frequency_label: 'รายปี',
      planned_months: [6],
      responsible_dept: 'QC'
    });

    // Submit -> Review -> Approve
    await call('POST', `/api/vcc/plans/${planId}/submit`, 'REV-QC-STAFF');
    await call('POST', `/api/vcc/plans/${planId}/review`, 'REV-QC-SUP', { comment: 'ทบทวนผ่าน' });
    const approveRes = await call('POST', `/api/vcc/plans/${planId}/approve`, 'REV-QA-MGR', { comment: 'อนุมัติแผน Rev.00' });
    expect(approveRes.status).toBe(200);

    return {
      planId,
      asset1Id,
      asset2Id,
      item1Id: item1Res.body.item.id,
      item2Id: item2Res.body.item.id,
      generation: approveRes.body.work_orders_generation
    };
  };

  it('1 & 2. Creates Rev.01 from Approved Rev.00, keeping Rev.00 Current while Rev.01 is Draft', async () => {
    const { planId: rev00Id } = await setupApprovedRev00Plan(2026);

    // Create Rev.01
    const createRevRes = await call('POST', `/api/vcc/plans/${rev00Id}/revisions`, 'REV-QC-STAFF', {
      revision_reason: 'ปรับรอบสอบเทียบให้สอดคล้องกับแผนหยุดซ่อมบำรุงประจำปี'
    });

    expect(createRevRes.status).toBe(201);
    const rev01 = createRevRes.body.plan;
    expect(rev01.revision).toBe('01');
    expect(rev01.status).toBe('DRAFT');
    expect(rev01.effective_status).toBe('PENDING');
    expect(rev01.is_current).toBe(0);
    expect(rev01.parent_plan_id).toBe(rev00Id);
    expect(rev01.parent_revision).toBe('00');
    expect(rev01.revision_reason).toBe('ปรับรอบสอบเทียบให้สอดคล้องกับแผนหยุดซ่อมบำรุงประจำปี');
    expect(createRevRes.body.cloned_items_count).toBe(2);

    // Verify Rev.00 remains CURRENT and untouched
    const getRev00 = await call('GET', `/api/vcc/plans/${rev00Id}`, 'REV-QC-STAFF');
    expect(getRev00.body.plan.status).toBe('APPROVED');
    expect(getRev00.body.plan.is_current).toBe(1);
    expect(getRev00.body.plan.effective_status).toBe('CURRENT');

    // Revision list should show both revisions
    const revListRes = await call('GET', `/api/vcc/plans/${rev01.id}/revisions`, 'REV-QC-STAFF');
    expect(revListRes.status).toBe(200);
    expect(revListRes.body.revisions.length).toBe(2);
    expect(revListRes.body.revisions[0].revision).toBe('00');
    expect(revListRes.body.revisions[1].revision).toBe('01');
  });

  it('3. Snapshot of Rev.00 is immutable and protected from modifications', async () => {
    const { planId: rev00Id, asset1Id } = await setupApprovedRev00Plan(2026);

    // Attempt to update Rev.00 via PUT returns 409
    const updateRes = await call('PUT', `/api/vcc/plans/${rev00Id}`, 'REV-QC-STAFF', {
      title: 'พยายามแก้ไขชื่อแผนที่อนุมัติแล้ว'
    });
    expect(updateRes.status).toBe(409);

    // Attempt to add item to Rev.00 returns 409
    const addItemRes = await call('POST', `/api/vcc/plans/${rev00Id}/items`, 'REV-QC-STAFF', {
      asset_id: asset1Id,
      provider_name: 'ทวนสอบภายใน',
      frequency_label: 'รายปี',
      planned_months: [5],
      responsible_dept: 'QC'
    });
    expect(addItemRes.status).toBe(409);

    // Attempt to delete Rev.00 directly via SQL is blocked by trigger
    const deleteAttempt = env.DB.prepare('DELETE FROM vcc_annual_plans WHERE id = ?').bind(rev00Id).run();
    await expect(deleteAttempt).rejects.toThrow(/Cannot delete an APPROVED annual plan/);
  });

  it('4. Diff Engine: Adding cycle in Rev.01 accurately reflects as Added', async () => {
    const { planId: rev00Id, asset1Id } = await setupApprovedRev00Plan(2026);

    // Create Rev.01
    const createRevRes = await call('POST', `/api/vcc/plans/${rev00Id}/revisions`, 'REV-QC-STAFF', {
      revision_reason: 'เพิ่มรอบสอบเทียบ Asset 1 ในเดือน 11'
    });
    const rev01Id = createRevRes.body.plan.id;

    // In Rev.01, update Asset 1 to have 3 cycles: [3, 9, 11] (adds month 11)
    await call('POST', `/api/vcc/plans/${rev01Id}/items`, 'REV-QC-STAFF', {
      asset_id: asset1Id,
      provider_name: 'ห้องปฏิบัติการภายนอก',
      frequency_label: '3 ครั้ง/ปี',
      planned_months: [3, 9, 11],
      responsible_dept: 'QC'
    });

    // Run Diff Engine
    const diffRes = await call('GET', `/api/vcc/plans/${rev01Id}/diff`, 'REV-QC-STAFF');
    expect(diffRes.status).toBe(200);
    const diff = diffRes.body;

    expect(diff.summary.added_count).toBe(1);
    expect(diff.summary.modified_count).toBe(0);
    expect(diff.summary.removed_count).toBe(0);
    expect(diff.summary.unchanged_count).toBe(3); // Asset 1 (m3, m9) + Asset 2 (m6)
    expect(diff.added[0].asset_code).toBe('QC-REV-01');
    expect(diff.added[0].planned_month).toBe(11);
    expect(diff.added[0].diff_type).toBe('ADDED');
  });

  it('5. Diff Engine: Removing cycle from Draft reflects as Removed without destroying Rev.00 history', async () => {
    const { planId: rev00Id, asset2Id } = await setupApprovedRev00Plan(2026);

    // Create Rev.01
    const createRevRes = await call('POST', `/api/vcc/plans/${rev00Id}/revisions`, 'REV-QC-STAFF', {
      revision_reason: 'ยกเลิกการสอบเทียบ Asset 2 ในแผนปี 2026'
    });
    const rev01Id = createRevRes.body.plan.id;

    // In Rev.01, find and remove item for Asset 2
    const itemsRes = await call('GET', `/api/vcc/plans/${rev01Id}`, 'REV-QC-STAFF');
    const item2InRev01 = itemsRes.body.items.find((i) => i.asset_id === asset2Id);
    expect(item2InRev01).toBeDefined();

    const removeRes = await call('DELETE', `/api/vcc/plans/${rev01Id}/items/${item2InRev01.id}`, 'REV-QC-STAFF');
    expect(removeRes.status).toBe(200);

    // Run Diff Engine
    const diffRes = await call('GET', `/api/vcc/plans/${rev01Id}/diff`, 'REV-QC-STAFF');
    expect(diffRes.status).toBe(200);
    const diff = diffRes.body;

    expect(diff.summary.removed_count).toBe(1);
    expect(diff.summary.added_count).toBe(0);
    expect(diff.summary.modified_count).toBe(0);
    expect(diff.summary.unchanged_count).toBe(2); // Asset 1 (m3, m9)
    expect(diff.removed[0].asset_code).toBe('QC-REV-02');
    expect(diff.removed[0].planned_month).toBe(6);
    expect(diff.removed[0].diff_type).toBe('REMOVED');

    // Confirm Rev.00 still has Asset 2 and its active work order
    const rev00Wos = await call('GET', `/api/vcc/work-orders?plan_id=${rev00Id}`, 'REV-QC-STAFF');
    const asset2Wo = rev00Wos.body.workOrders.find((w) => w.asset_id === asset2Id);
    expect(asset2Wo).toBeDefined();
    expect(asset2Wo.status).toBe('SCHEDULED');
  });

  it('6 & 7. Diff Engine: Modifying cycle date/month reflects as Modified while identical cycles reflect as Unchanged', async () => {
    const { planId: rev00Id, asset1Id } = await setupApprovedRev00Plan(2026);

    // Create Rev.01
    const createRevRes = await call('POST', `/api/vcc/plans/${rev00Id}/revisions`, 'REV-QC-STAFF', {
      revision_reason: 'เลื่อนรอบสอบเทียบ Asset 1 จากเดือน 3 ไปเดือน 4'
    });
    const rev01Id = createRevRes.body.plan.id;

    // In Rev.01, change Asset 1 months from [3, 9] to [4, 9]
    await call('POST', `/api/vcc/plans/${rev01Id}/items`, 'REV-QC-STAFF', {
      asset_id: asset1Id,
      provider_name: 'ห้องปฏิบัติการภายนอก',
      frequency_label: '2 ครั้ง/ปี',
      planned_months: [4, 9],
      responsible_dept: 'QC'
    });

    // Run Diff Engine
    const diffRes = await call('GET', `/api/vcc/plans/${rev01Id}/diff`, 'REV-QC-STAFF');
    expect(diffRes.status).toBe(200);
    const diff = diffRes.body;

    expect(diff.summary.modified_count).toBe(1);
    expect(diff.summary.added_count).toBe(0);
    expect(diff.summary.removed_count).toBe(0);
    expect(diff.summary.unchanged_count).toBe(2); // Asset 1 (m9) and Asset 2 (m6)

    const mod = diff.modified[0];
    expect(mod.asset_code).toBe('QC-REV-01');
    expect(mod.diff_type).toBe('MODIFIED');
    expect(mod.before.planned_month).toBe(3);
    expect(mod.after.planned_month).toBe(4);
    expect(mod.changes.planned_month.before).toBe(3);
    expect(mod.changes.planned_month.after).toBe(4);
    expect(mod.before.due_date).toBe('2026-03-31');
    expect(mod.after.due_date).toBe('2026-04-30');

    // Check unchanged cycles
    const unchangedMonths = diff.unchanged.map((u) => u.planned_month).sort((a, b) => a - b);
    expect(unchangedMonths).toEqual([6, 9]);
  });

  it('8 & 9. Concurrency & Business Guard: Blocks duplicate revision creation and concurrent duplicate draft requests', async () => {
    const { planId: rev00Id } = await setupApprovedRev00Plan(2026);

    // 1. Send 5 concurrent revision creation requests simultaneously
    const requests = Array.from({ length: 5 }).map((_, i) =>
      call('POST', `/api/vcc/plans/${rev00Id}/revisions`, 'REV-QC-STAFF', {
        revision_reason: `Concurrent test attempt ${i + 1}`
      })
    );

    const results = await Promise.all(requests);
    const successCount = results.filter((r) => r.status === 201).length;
    const conflictCount = results.filter((r) => r.status === 409).length;

    // Exactly 1 request succeeds, exactly 4 receive 409 Conflict
    expect(successCount).toBe(1);
    expect(conflictCount).toBe(4);

    // Verify only ONE Rev.01 exists in database
    const revsRes = await call('GET', `/api/vcc/plans/${rev00Id}/revisions`, 'REV-QC-STAFF');
    const rev01Count = revsRes.body.revisions.filter((r) => r.revision === '01').length;
    expect(rev01Count).toBe(1);

    // 2. Sequential attempt while draft is in-flight returns 409
    const seqAttempt = await call('POST', `/api/vcc/plans/${rev00Id}/revisions`, 'REV-QC-STAFF', {
      revision_reason: 'พยายามสร้าง Revision ขณะมีฉบับร่างค้างอยู่'
    });
    expect(seqAttempt.status).toBe(409);
    expect(seqAttempt.body.error).toContain('อยู่ในสถานะ DRAFT');
  });

  it('10. RBAC & Security: Unauthorized users are blocked from creating or modifying revisions', async () => {
    const { planId: rev00Id } = await setupApprovedRev00Plan(2026);

    // 1. PD staff (no VCC access) is blocked by module access gate
    const pdAttempt = await call('POST', `/api/vcc/plans/${rev00Id}/revisions`, 'REV-PD-STAFF', {
      revision_reason: 'ข้ามสายงานพยายามสร้าง Revision'
    });
    expect(pdAttempt.status).toBe(403);

    // 2. QA staff (has VCC access, but not authorized for QC plans) is blocked by department authorization gate
    const unauthCreate = await call('POST', `/api/vcc/plans/${rev00Id}/revisions`, 'REV-QA-STAFF', {
      revision_reason: 'ต่างแผนกพยายามสร้าง Revision'
    });
    expect(unauthCreate.status).toBe(403);
    expect(unauthCreate.body.error).toContain('ไม่มีสิทธิ์');

    // 3. Create Rev.01 legitimately by authorized QC staff
    const rev01Res = await call('POST', `/api/vcc/plans/${rev00Id}/revisions`, 'REV-QC-STAFF', {
      revision_reason: 'ปรับปรุงแผนตามวงรอบ'
    });
    const rev01Id = rev01Res.body.plan.id;

    // QA staff tries to modify items in Rev.01
    const unauthModify = await call('PUT', `/api/vcc/plans/${rev01Id}`, 'REV-QA-STAFF', {
      title: 'แอบเปลี่ยนชื่อแผน'
    });
    expect(unauthModify.status).toBe(403);
  });

  it('11 & 12. Historical Protection & Zero Premature WO Mutation during Draft Revision', async () => {
    const { planId: rev00Id } = await setupApprovedRev00Plan(2026);

    // Count work orders before revision
    const initialWosRes = await call('GET', `/api/vcc/work-orders?plan_id=${rev00Id}`, 'REV-QC-STAFF');
    const initialCount = initialWosRes.body.workOrders.length;
    expect(initialCount).toBe(3); // 2 cycles for asset 1, 1 cycle for asset 2

    // Create Rev.01
    const rev01Res = await call('POST', `/api/vcc/plans/${rev00Id}/revisions`, 'REV-QC-STAFF', {
      revision_reason: 'ทดสอบว่าฉบับร่างไม่กระทบ Work Orders เดิม'
    });
    const rev01Id = rev01Res.body.plan.id;

    // Verify ZERO work orders belong to Rev.01 while it is DRAFT
    const rev01WosRes = await call('GET', `/api/vcc/work-orders?plan_id=${rev01Id}`, 'REV-QC-STAFF');
    expect(rev01WosRes.body.workOrders.length).toBe(0);

    // Verify all work orders for Rev.00 are still SCHEDULED and intact
    const currentWosRes = await call('GET', `/api/vcc/work-orders?plan_id=${rev00Id}`, 'REV-QC-STAFF');
    expect(currentWosRes.body.workOrders.length).toBe(3);
    expect(currentWosRes.body.workOrders.every((w) => w.plan_revision === '00')).toBe(true);
  });

  it('13 & 14. Validation Rules & Mandatory Revision Reason', async () => {
    const { planId: rev00Id } = await setupApprovedRev00Plan(2026);

    // Missing revision_reason returns 400
    const emptyReasonRes = await call('POST', `/api/vcc/plans/${rev00Id}/revisions`, 'REV-QC-STAFF', {
      revision_reason: '   '
    });
    expect(emptyReasonRes.status).toBe(400);
    expect(emptyReasonRes.body.error).toContain('เหตุผลการขอปรับปรุงแผน');

    // Attempting to create revision from a DRAFT plan returns 409
    const draftPlanRes = await call('POST', '/api/vcc/plans', 'REV-QC-STAFF', {
      plan_year: 2027,
      department: 'QC',
      revision: '00',
      title: 'แผนร่างปี 2027'
    });
    const draftPlanId = draftPlanRes.body.plan.id;

    const fromDraftRes = await call('POST', `/api/vcc/plans/${draftPlanId}/revisions`, 'REV-QC-STAFF', {
      revision_reason: 'พยายามสร้าง Revision จาก Draft'
    });
    expect(fromDraftRes.status).toBe(409);
    expect(fromDraftRes.body.error).toContain('APPROVED');
  });
});
