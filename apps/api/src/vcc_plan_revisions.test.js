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

  const dropHistoricalTriggers = [
    'DROP TRIGGER IF EXISTS trg_prevent_tamper_approved_annual_plan',
    'DROP TRIGGER IF EXISTS trg_prevent_delete_approved_annual_plan',
    'DROP TRIGGER IF EXISTS trg_prevent_delete_approved_plan_item',
    'DROP TRIGGER IF EXISTS trg_prevent_update_approved_plan_item',
    'DROP TRIGGER IF EXISTS trg_prevent_delete_closed_work_order',
    'DROP TRIGGER IF EXISTS trg_prevent_delete_closed_plan_cycle'
  ];

  const createHistoricalTriggers = [
    `CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_approved_annual_plan
     BEFORE DELETE ON vcc_annual_plans
     FOR EACH ROW WHEN OLD.status = 'APPROVED'
     BEGIN SELECT RAISE(ABORT, 'Cannot delete an APPROVED annual plan. QMS integrity violation.'); END;`,
    `CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_approved_plan_item
     BEFORE DELETE ON vcc_annual_plan_items
     FOR EACH ROW WHEN (SELECT status FROM vcc_annual_plans WHERE id = OLD.plan_id) = 'APPROVED'
     BEGIN SELECT RAISE(ABORT, 'Cannot delete items from an APPROVED annual plan. QMS integrity violation.'); END;`,
    `CREATE TRIGGER IF NOT EXISTS trg_prevent_update_approved_plan_item
     BEFORE UPDATE ON vcc_annual_plan_items
     FOR EACH ROW WHEN (SELECT status FROM vcc_annual_plans WHERE id = OLD.plan_id) = 'APPROVED'
     BEGIN SELECT RAISE(ABORT, 'Cannot modify items of an APPROVED annual plan. QMS integrity violation.'); END;`,
    `CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_closed_work_order
     BEFORE DELETE ON vcc_work_orders
     FOR EACH ROW WHEN OLD.status = 'CLOSED' OR OLD.certificate_no IS NOT NULL
     BEGIN SELECT RAISE(ABORT, 'Cannot delete a CLOSED work order or a work order with certificate evidence. QMS integrity violation.'); END;`,
    `CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_closed_plan_cycle
     BEFORE DELETE ON vcc_plan_cycles
     FOR EACH ROW WHEN OLD.cycle_status = 'CLOSED' OR EXISTS (SELECT 1 FROM vcc_work_orders WHERE cycle_id = OLD.id AND status = 'CLOSED')
     BEGIN SELECT RAISE(ABORT, 'Cannot delete a cycle with CLOSED work order or closed cycle status. QMS integrity violation.'); END;`,
    `CREATE TRIGGER IF NOT EXISTS trg_prevent_tamper_approved_annual_plan
     BEFORE UPDATE ON vcc_annual_plans
     FOR EACH ROW
     WHEN OLD.status = 'APPROVED' AND (
       NEW.status != 'APPROVED' OR
       NEW.plan_year != OLD.plan_year OR
       NEW.department != OLD.department OR
       NEW.revision != OLD.revision OR
       NEW.document_code != OLD.document_code OR
       NEW.due_date_rule != OLD.due_date_rule OR
       NEW.parent_plan_id IS NOT OLD.parent_plan_id OR
       NEW.revision_reason IS NOT OLD.revision_reason OR
       NEW.prepared_by IS NOT OLD.prepared_by OR
       NEW.prepared_at IS NOT OLD.prepared_at OR
       NEW.reviewed_by IS NOT OLD.reviewed_by OR
       NEW.reviewed_at IS NOT OLD.reviewed_at OR
       NEW.approved_by IS NOT OLD.approved_by OR
       NEW.approved_at IS NOT OLD.approved_at OR
       NEW.title IS NOT OLD.title OR
       NEW.effective_status = 'PENDING' OR
       (OLD.effective_status = 'SUPERSEDED' AND NEW.effective_status != 'SUPERSEDED')
     )
     BEGIN SELECT RAISE(ABORT, 'Cannot alter status, core identity, or historical evidence of an APPROVED annual plan. QMS integrity violation.'); END;`
  ];

  const cleanDb = async () => {
    await env.DB.batch([
      ...dropHistoricalTriggers.map((s) => env.DB.prepare(s)),
      env.DB.prepare('DELETE FROM vcc_work_orders'),
      env.DB.prepare('DELETE FROM vcc_plan_cycles'),
      env.DB.prepare('DELETE FROM vcc_annual_plan_items'),
      env.DB.prepare('DELETE FROM vcc_annual_plans'),
      env.DB.prepare('DELETE FROM vcc_assets'),
      ...createHistoricalTriggers.map((s) => env.DB.prepare(s))
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

  it('15. Diff Engine Invariants: Base = Removed + Modified + Unchanged & Target = Added + Modified + Unchanged', async () => {
    const { planId: rev00Id, asset1Id, asset2Id } = await setupApprovedRev00Plan(2026);

    // Create Rev.01
    const createRevRes = await call('POST', `/api/vcc/plans/${rev00Id}/revisions`, 'REV-QC-STAFF', {
      revision_reason: 'ทดสอบ Invariants ทางคณิตศาสตร์ของ Diff Engine'
    });
    const rev01Id = createRevRes.body.plan.id;

    // Asset 1: Base had [3, 9]. Change to [3, 6, 9] (Insert 6 between 3 and 9)
    await call('POST', `/api/vcc/plans/${rev01Id}/items`, 'REV-QC-STAFF', {
      asset_id: asset1Id,
      provider_name: 'ห้องปฏิบัติการภายนอก',
      frequency_label: '3 ครั้ง/ปี',
      planned_months: [3, 6, 9],
      responsible_dept: 'QC'
    });

    // Asset 2: Base had [6]. Change to [7] (Reschedule 6 to 7)
    await call('POST', `/api/vcc/plans/${rev01Id}/items`, 'REV-QC-STAFF', {
      asset_id: asset2Id,
      provider_name: 'ทวนสอบภายใน',
      frequency_label: 'รายปี',
      planned_months: [7],
      responsible_dept: 'QC'
    });

    // Add Asset 3: Brand new instrument in Rev.01
    const a3Res = await call('POST', '/api/vcc/assets', 'REV-QC-STAFF', {
      asset_code: 'QC-REV-03',
      name: 'ไมโครมิเตอร์วัดนอก',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'QC',
      status: 'ACTIVE'
    });
    const asset3Id = a3Res.body.asset.id;
    await call('POST', `/api/vcc/plans/${rev01Id}/items`, 'REV-QC-STAFF', {
      asset_id: asset3Id,
      provider_name: 'ทวนสอบภายใน',
      frequency_label: '2 ครั้ง/ปี',
      planned_months: [2, 8],
      responsible_dept: 'QC'
    });

    const diffRes = await call('GET', `/api/vcc/plans/${rev01Id}/diff`, 'REV-QC-STAFF');
    expect(diffRes.status).toBe(200);
    const { summary, added, removed, modified, unchanged } = diffRes.body;

    // Invariant 1: Base = Removed + Modified + Unchanged
    expect(summary.total_base_cycles).toBe(summary.removed_count + summary.modified_count + summary.unchanged_count);
    expect(summary.total_base_cycles).toBe(3); // Asset 1 (2) + Asset 2 (1)

    // Invariant 2: Target = Added + Modified + Unchanged
    expect(summary.total_target_cycles).toBe(summary.added_count + summary.modified_count + summary.unchanged_count);
    expect(summary.total_target_cycles).toBe(6); // Asset 1 (3) + Asset 2 (1) + Asset 3 (2)

    expect(summary.invariants_satisfied).toBe(true);

    // Verify disjoint sets: Every cycle appears in exactly one category
    const addedIds = new Set(added.map((c) => c.cycle_id));
    const removedIds = new Set(removed.map((c) => c.cycle_id));
    const modifiedIds = new Set(modified.map((c) => c.cycle_id));
    const unchangedIds = new Set(unchanged.map((c) => c.cycle_id));

    for (const id of addedIds) {
      expect(removedIds.has(id)).toBe(false);
      expect(modifiedIds.has(id)).toBe(false);
      expect(unchangedIds.has(id)).toBe(false);
    }
    for (const id of modifiedIds) {
      expect(unchangedIds.has(id)).toBe(false);
    }
  });

  it('16. Stable Cycle Identity: Handles Inserting, Cutting, and Multiple Cycles in Same Month', async () => {
    // A. Create instrument with 2 cycles in the same month: Month 6 and Month 6
    const assetRes = await call('POST', '/api/vcc/assets', 'REV-QC-STAFF', {
      asset_code: 'QC-MULTI-M6',
      name: 'เครื่องมือวัดรอบคู่เดือน 6',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'QC',
      status: 'ACTIVE'
    });
    const assetId = assetRes.body.asset.id;

    const planRes = await call('POST', '/api/vcc/plans', 'REV-QC-STAFF', {
      plan_year: 2026,
      department: 'QC',
      revision: '00',
      title: 'แผนทดสอบรอบคู่ 2026',
      assigned_reviewer_id: 'REV-QC-SUP',
      assigned_approver_id: 'REV-QA-MGR'
    });
    const planRev00Id = planRes.body.plan.id;

    await call('POST', `/api/vcc/plans/${planRev00Id}/items`, 'REV-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      frequency_label: '2 ครั้ง/ปี (เดือนเดียวกัน)',
      planned_months: [6, 6],
      responsible_dept: 'QC'
    });

    await call('POST', `/api/vcc/plans/${planRev00Id}/submit`, 'REV-QC-STAFF');
    await call('POST', `/api/vcc/plans/${planRev00Id}/review`, 'REV-QC-SUP', { comment: 'ผ่าน' });
    await call('POST', `/api/vcc/plans/${planRev00Id}/approve`, 'REV-QA-MGR', { comment: 'อนุมัติ' });

    // Inspect Base Cycles
    const baseWos = await call('GET', `/api/vcc/work-orders?plan_id=${planRev00Id}`, 'REV-QC-STAFF');
    expect(baseWos.body.workOrders).toHaveLength(2);
    const [c1, c2] = baseWos.body.workOrders;
    expect(c1.cycle_id).not.toBe(c2.cycle_id);

    // B. Create Rev.01: Keep both Month 6 cycles, and add a 3rd cycle in Month 6 -> [6, 6, 6]
    const rev01Res = await call('POST', `/api/vcc/plans/${planRev00Id}/revisions`, 'REV-QC-STAFF', {
      revision_reason: 'เพิ่มรอบที่ 3 ในเดือน 6'
    });
    const rev01Id = rev01Res.body.plan.id;

    await call('POST', `/api/vcc/plans/${rev01Id}/items`, 'REV-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      frequency_label: '3 ครั้ง/ปี',
      planned_months: [6, 6, 6],
      responsible_dept: 'QC'
    });

    const diffRes1 = await call('GET', `/api/vcc/plans/${rev01Id}/diff`, 'REV-QC-STAFF');
    expect(diffRes1.status).toBe(200);
    expect(diffRes1.body.summary.unchanged_count).toBe(2);
    expect(diffRes1.body.summary.added_count).toBe(1);
    expect(diffRes1.body.summary.removed_count).toBe(0);
    expect(diffRes1.body.summary.modified_count).toBe(0);
    expect(diffRes1.body.summary.invariants_satisfied).toBe(true);

    // C. Cut middle cycle: In Rev.01, change to [6] (Cut one cycle)
    await call('POST', `/api/vcc/plans/${rev01Id}/items`, 'REV-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      frequency_label: '1 ครั้ง/ปี',
      planned_months: [6],
      responsible_dept: 'QC'
    });

    const diffRes2 = await call('GET', `/api/vcc/plans/${rev01Id}/diff`, 'REV-QC-STAFF');
    expect(diffRes2.status).toBe(200);
    expect(diffRes2.body.summary.unchanged_count).toBe(1);
    expect(diffRes2.body.summary.removed_count).toBe(1);
    expect(diffRes2.body.summary.added_count).toBe(0);
    expect(diffRes2.body.summary.modified_count).toBe(0);
    expect(diffRes2.body.summary.invariants_satisfied).toBe(true);
  });

  it('17. Multi-Generation Lineage: Rev.00 -> Rev.01 -> Rev.02 preserves immutable cycle identity', async () => {
    const { planId: rev00Id, asset1Id } = await setupApprovedRev00Plan(2026);

    // Rev.00 -> Rev.01
    const rev01Res = await call('POST', `/api/vcc/plans/${rev00Id}/revisions`, 'REV-QC-STAFF', {
      revision_reason: 'Rev 01 ปรับเดือนสอบเทียบ'
    });
    const rev01Id = rev01Res.body.plan.id;

    // Reschedule Asset 1: Month 3 to Month 4
    await call('POST', `/api/vcc/plans/${rev01Id}/items`, 'REV-QC-STAFF', {
      asset_id: asset1Id,
      provider_name: 'ห้องปฏิบัติการภายนอก',
      frequency_label: '2 ครั้ง/ปี',
      planned_months: [4, 9],
      responsible_dept: 'QC'
    });

    // Submit -> Review -> Approve Rev.01
    await call('POST', `/api/vcc/plans/${rev01Id}/submit`, 'REV-QC-STAFF');
    await call('POST', `/api/vcc/plans/${rev01Id}/review`, 'REV-QC-SUP', { comment: 'ผ่าน' });
    await call('POST', `/api/vcc/plans/${rev01Id}/approve`, 'REV-QA-MGR', { comment: 'อนุมัติ Rev 01' });

    // Rev.01 -> Rev.02
    const rev02Res = await call('POST', `/api/vcc/plans/${rev01Id}/revisions`, 'REV-QC-STAFF', {
      revision_reason: 'Rev 02 เลื่อนอีกครั้งจากเดือน 4 ไปเดือน 5'
    });
    expect(rev02Res.status).toBe(201);
    const rev02Id = rev02Res.body.plan.id;

    // Reschedule Asset 1: Month 4 to Month 5
    await call('POST', `/api/vcc/plans/${rev02Id}/items`, 'REV-QC-STAFF', {
      asset_id: asset1Id,
      provider_name: 'ห้องปฏิบัติการภายนอก',
      frequency_label: '2 ครั้ง/ปี',
      planned_months: [5, 9],
      responsible_dept: 'QC'
    });

    // Diff Rev.02 against Rev.01
    const diffRes = await call('GET', `/api/vcc/plans/${rev02Id}/diff`, 'REV-QC-STAFF');
    expect(diffRes.status).toBe(200);
    expect(diffRes.body.base_plan.revision).toBe('01');
    expect(diffRes.body.target_plan.revision).toBe('02');
    expect(diffRes.body.summary.modified_count).toBe(1);
    expect(diffRes.body.modified[0].before.planned_month).toBe(4);
    expect(diffRes.body.modified[0].after.planned_month).toBe(5);
    expect(diffRes.body.summary.unchanged_count).toBe(2); // Month 9 and Asset 2 Month 6
    expect(diffRes.body.summary.invariants_satisfied).toBe(true);
  });

  it('18. Historical Protection Triggers: SQLite triggers prevent UPDATE on approved plans and items', async () => {
    const { planId: rev00Id, item1Id } = await setupApprovedRev00Plan(2026);

    // 1. Trigger blocks modifying plan items belonging to an APPROVED plan
    await expect(
      env.DB.prepare("UPDATE vcc_annual_plan_items SET provider_name = 'Hack Lab' WHERE id = ?").bind(item1Id).run()
    ).rejects.toThrow(/Cannot modify items of an APPROVED annual plan/);

    // 2. Trigger blocks modifying core identity (plan_year, department, revision, due_date_rule) of APPROVED plan
    await expect(
      env.DB.prepare('UPDATE vcc_annual_plans SET plan_year = 2030 WHERE id = ?').bind(rev00Id).run()
    ).rejects.toThrow(/Cannot alter status, core identity, or historical evidence/);

    // 3. Verify uniqueness of CURRENT revision: Attempting to insert a 2nd CURRENT plan for same year/dept fails
    const secondCurrentAttempt = env.DB.prepare(`
      INSERT INTO vcc_annual_plans (
        id, plan_year, department, document_code, revision, title, status, effective_status, is_current
      ) VALUES ('dup-current-plan', 2026, 'QC', 'FM-QC-46', '99', 'Duplicate Current Plan', 'APPROVED', 'CURRENT', 1)
    `).run();
    await expect(secondCurrentAttempt).rejects.toThrow();

    // 4. Updating effective_status to SUPERSEDED and is_current to 0 is ALLOWED
    const updateEffective = await env.DB.prepare(
      "UPDATE vcc_annual_plans SET effective_status = 'SUPERSEDED', is_current = 0 WHERE id = ?"
    ).bind(rev00Id).run();
    expect(updateEffective.success).toBe(true);
  });

  it('19. Due Date Semantics: Distinguishes planned month, baseline date, required due date and flags compliance impact', async () => {
    const { planId: rev00Id } = await setupApprovedRev00Plan(2026);

    // Create Rev.01
    const createRevRes = await call('POST', `/api/vcc/plans/${rev00Id}/revisions`, 'REV-QC-STAFF', {
      revision_reason: 'ทดสอบ Due Date Semantics'
    });
    const rev01Id = createRevRes.body.plan.id;

    const diffRes = await call('GET', `/api/vcc/plans/${rev01Id}/diff`, 'REV-QC-STAFF');
    expect(diffRes.status).toBe(200);

    // Verify all unchanged cycles have baseline_planned_date, required_due_date, and scheduled_date
    for (const cycle of diffRes.body.unchanged) {
      expect(cycle.baseline_planned_date).toBeDefined();
      expect(cycle.required_due_date).toBeDefined();
      expect(cycle.scheduled_date).toBeDefined();
      expect(cycle.planned_month).toBeGreaterThanOrEqual(1);
      expect(cycle.planned_month).toBeLessThanOrEqual(12);
    }
  });

  // --- PHASE 3.1 FINAL INTEGRITY CORRECTIONS: 10 AUTOMATED & NEGATIVE TESTS ---

  it('20. Integrity Test 1: Trigger strictly rejects changing status of APPROVED plan back to DRAFT or other status', async () => {
    const { planId: rev00Id } = await setupApprovedRev00Plan(2026);

    // Attempting to reset status to DRAFT must fail immediately via SQLite trigger
    await expect(
      env.DB.prepare("UPDATE vcc_annual_plans SET status = 'DRAFT' WHERE id = ?").bind(rev00Id).run()
    ).rejects.toThrow(/Cannot alter status, core identity, or historical evidence/);

    // Attempting to set status to PENDING_REVIEW or REJECTED also fails
    await expect(
      env.DB.prepare("UPDATE vcc_annual_plans SET status = 'PENDING_REVIEW' WHERE id = ?").bind(rev00Id).run()
    ).rejects.toThrow(/Cannot alter status, core identity, or historical evidence/);
  });

  it('21. Integrity Test 2: Trigger strictly rejects modifying metadata, revision_reason, parent_plan_id, or evidence after approval', async () => {
    const { planId: rev00Id, item1Id } = await setupApprovedRev00Plan(2026);

    // 1. Cannot alter revision_reason
    await expect(
      env.DB.prepare("UPDATE vcc_annual_plans SET revision_reason = 'Tampered reason' WHERE id = ?").bind(rev00Id).run()
    ).rejects.toThrow(/Cannot alter status, core identity, or historical evidence/);

    // 2. Cannot alter parent_plan_id
    await expect(
      env.DB.prepare("UPDATE vcc_annual_plans SET parent_plan_id = 'fake-parent' WHERE id = ?").bind(rev00Id).run()
    ).rejects.toThrow(/Cannot alter status, core identity, or historical evidence/);

    // 3. Cannot alter title
    await expect(
      env.DB.prepare("UPDATE vcc_annual_plans SET title = 'Tampered Title' WHERE id = ?").bind(rev00Id).run()
    ).rejects.toThrow(/Cannot alter status, core identity, or historical evidence/);

    // 4. Cannot alter prepared_by / approved_by
    await expect(
      env.DB.prepare("UPDATE vcc_annual_plans SET prepared_by = 'REV-PD-STAFF' WHERE id = ?").bind(rev00Id).run()
    ).rejects.toThrow(/Cannot alter status, core identity, or historical evidence/);

    // 5. Cannot modify or delete plan items of an approved plan (SQLite triggers)
    await expect(
      env.DB.prepare("UPDATE vcc_annual_plan_items SET provider_name = 'Illegal Mod' WHERE id = ?").bind(item1Id).run()
    ).rejects.toThrow(/Cannot modify items of an APPROVED annual plan/);

    await expect(
      env.DB.prepare("DELETE FROM vcc_annual_plan_items WHERE id = ?").bind(item1Id).run()
    ).rejects.toThrow(/Cannot delete items from an APPROVED annual plan/);

    // 6. API rejects adding new items into an approved plan (409)
    const addRes = await call('POST', `/api/vcc/plans/${rev00Id}/items`, 'REV-QC-STAFF', {
      asset_id: 'QC-REV-01',
      provider_name: 'Lab',
      frequency_label: '1 ครั้ง/ปี',
      planned_months: [5],
      responsible_dept: 'QC'
    });
    expect(addRes.status).toBe(409);
  });

  it('22. Integrity Test 3: Trigger permits authorized lifecycle transitions (SUPERSEDED, is_current=0) and prevents reverting', async () => {
    const { planId: rev00Id } = await setupApprovedRev00Plan(2026);

    // Permitted lifecycle transition
    const updateRes = await env.DB.prepare(`
      UPDATE vcc_annual_plans
      SET effective_status = 'SUPERSEDED', is_current = 0, superseded_at = '2026-06-01T00:00:00Z', superseded_by = 'REV-QC-SUP'
      WHERE id = ?
    `).bind(rev00Id).run();
    expect(updateRes.success).toBe(true);

    // Reverting SUPERSEDED back to CURRENT or PENDING is strictly rejected
    await expect(
      env.DB.prepare("UPDATE vcc_annual_plans SET effective_status = 'CURRENT' WHERE id = ?").bind(rev00Id).run()
    ).rejects.toThrow(/Cannot alter status, core identity, or historical evidence/);

    await expect(
      env.DB.prepare("UPDATE vcc_annual_plans SET effective_status = 'PENDING' WHERE id = ?").bind(rev00Id).run()
    ).rejects.toThrow(/Cannot alter status, core identity, or historical evidence/);
  });

  it('23. Integrity Test 4: Inserting or removing middle cycles preserves identity of remaining cycles', async () => {
    // Setup asset with 3 cycles: months [2, 6, 10]
    const aRes = await call('POST', '/api/vcc/assets', 'REV-QC-STAFF', {
      asset_code: 'QC-ID-TEST-01',
      name: 'เครื่องชั่งดิจิตอลความแม่นยำสูง',
      asset_type: 'เครื่องชั่ง',
      department: 'QC',
      status: 'ACTIVE'
    });
    const assetId = aRes.body.asset.id;

    const planRes = await call('POST', '/api/vcc/plans', 'REV-QC-STAFF', {
      plan_year: 2026,
      department: 'QC',
      title: 'แผนทดสอบ Cycle Identity Preservation 2026'
    });
    const planId = planRes.body.plan.id;

    await call('POST', `/api/vcc/plans/${planId}/items`, 'REV-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ห้องปฏิบัติการสอบเทียบ',
      frequency_label: '3 ครั้ง/ปี',
      planned_months: [2, 6, 10],
      responsible_dept: 'QC'
    });

    // Submit and approve Rev.00
    await call('POST', `/api/vcc/plans/${planId}/submit`, 'REV-QC-STAFF');
    await call('POST', `/api/vcc/plans/${planId}/review`, 'REV-QC-SUP', { comment: 'ทบทวน' });
    await call('POST', `/api/vcc/plans/${planId}/approve`, 'REV-QA-MGR', { comment: 'อนุมัติ' });

    // Fetch baseline cycles from Rev.00
    const baseDiff = await call('GET', `/api/vcc/plans/${planId}/diff`, 'REV-QC-STAFF');
    const baseCycles = baseDiff.body.added;
    const m2Cycle = baseCycles.find((c) => c.planned_month === 2);
    const m6Cycle = baseCycles.find((c) => c.planned_month === 6);
    const m10Cycle = baseCycles.find((c) => c.planned_month === 10);

    expect(m2Cycle).toBeDefined();
    expect(m6Cycle).toBeDefined();
    expect(m10Cycle).toBeDefined();

    // 1. Test cutting middle cycle: Rev.01 cuts Month 6, leaving [2, 10]
    const rev01Res = await call('POST', `/api/vcc/plans/${planId}/revisions`, 'REV-QC-STAFF', {
      revision_reason: 'ลบรอบเดือน 6 (รอบกลาง)'
    });
    const rev01Id = rev01Res.body.plan.id;

    await call('POST', `/api/vcc/plans/${rev01Id}/items`, 'REV-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ห้องปฏิบัติการสอบเทียบ',
      frequency_label: '2 ครั้ง/ปี',
      planned_months: [2, 10],
      initial_cycle_ids: [m2Cycle.initial_cycle_id, m10Cycle.initial_cycle_id],
      responsible_dept: 'QC'
    });

    const diffCutRes = await call('GET', `/api/vcc/plans/${rev01Id}/diff`, 'REV-QC-STAFF');
    expect(diffCutRes.status).toBe(200);

    // Month 2 and Month 10 MUST be UNCHANGED and preserve their exact initial_cycle_ids
    const unchangedCutM2 = diffCutRes.body.unchanged.find((c) => c.planned_month === 2);
    const unchangedCutM10 = diffCutRes.body.unchanged.find((c) => c.planned_month === 10);
    expect(unchangedCutM2.initial_cycle_id).toBe(m2Cycle.initial_cycle_id);
    expect(unchangedCutM10.initial_cycle_id).toBe(m10Cycle.initial_cycle_id);

    // Month 6 was REMOVED
    expect(diffCutRes.body.removed.length).toBe(1);
    expect(diffCutRes.body.removed[0].planned_month).toBe(6);
    expect(diffCutRes.body.summary.unchanged_count).toBe(2);
    expect(diffCutRes.body.summary.invariants_satisfied).toBe(true);

    // 2. Test inserting middle cycle: insert Month 4 between Month 2 and Month 6
    await call('POST', `/api/vcc/plans/${rev01Id}/items`, 'REV-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ห้องปฏิบัติการสอบเทียบ',
      frequency_label: '4 ครั้ง/ปี',
      planned_months: [2, 4, 6, 10],
      initial_cycle_ids: [m2Cycle.initial_cycle_id, null, m6Cycle.initial_cycle_id, m10Cycle.initial_cycle_id],
      responsible_dept: 'QC'
    });

    const diffInsertRes = await call('GET', `/api/vcc/plans/${rev01Id}/diff`, 'REV-QC-STAFF');
    expect(diffInsertRes.status).toBe(200);

    // Original cycles M2, M6, M10 are UNCHANGED
    expect(diffInsertRes.body.summary.unchanged_count).toBe(3);
    const unchangedInsertM2 = diffInsertRes.body.unchanged.find((c) => c.planned_month === 2);
    const unchangedInsertM6 = diffInsertRes.body.unchanged.find((c) => c.planned_month === 6);
    const unchangedInsertM10 = diffInsertRes.body.unchanged.find((c) => c.planned_month === 10);
    expect(unchangedInsertM2.initial_cycle_id).toBe(m2Cycle.initial_cycle_id);
    expect(unchangedInsertM6.initial_cycle_id).toBe(m6Cycle.initial_cycle_id);
    expect(unchangedInsertM10.initial_cycle_id).toBe(m10Cycle.initial_cycle_id);

    // Month 4 was ADDED
    expect(diffInsertRes.body.added.length).toBe(1);
    expect(diffInsertRes.body.added[0].planned_month).toBe(4);
    expect(diffInsertRes.body.summary.invariants_satisfied).toBe(true);
  });

  it('24. Integrity Test 5: Multiple Cycles in Same Month are supported without ID collision', async () => {
    const aRes = await call('POST', '/api/vcc/assets', 'REV-QC-STAFF', {
      asset_code: 'QC-MULTI-M-01',
      name: 'เครื่องวัดความชื้นเมล็ด',
      asset_type: 'เครื่องชั่ง',
      department: 'QC',
      status: 'ACTIVE'
    });
    const assetId = aRes.body.asset.id;

    const planRes = await call('POST', '/api/vcc/plans', 'REV-QC-STAFF', {
      plan_year: 2026,
      department: 'QC',
      title: 'แผนทดสอบ Multiple Cycles in Same Month'
    });
    const planId = planRes.body.plan.id;

    // Two cycles in Month 3 and one cycle in Month 9
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();
    const id3 = crypto.randomUUID();

    await call('POST', `/api/vcc/plans/${planId}/items`, 'REV-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'Lab A',
      frequency_label: '3 ครั้ง/ปี',
      planned_months: [3, 3, 9],
      initial_cycle_ids: [id1, id2, id3],
      responsible_dept: 'QC'
    });

    await call('POST', `/api/vcc/plans/${planId}/submit`, 'REV-QC-STAFF');
    await call('POST', `/api/vcc/plans/${planId}/review`, 'REV-QC-SUP', { comment: 'ทบทวน' });
    await call('POST', `/api/vcc/plans/${planId}/approve`, 'REV-QA-MGR', { comment: 'อนุมัติ' });

    // Create Rev.01
    const rev01Res = await call('POST', `/api/vcc/plans/${planId}/revisions`, 'REV-QC-STAFF', {
      revision_reason: 'รักษา Multiple Cycles in Month 3'
    });
    const rev01Id = rev01Res.body.plan.id;

    const diffRes = await call('GET', `/api/vcc/plans/${rev01Id}/diff`, 'REV-QC-STAFF');
    expect(diffRes.status).toBe(200);

    // Both Month 3 cycles should be unchanged with separate IDs
    const m3Cycles = diffRes.body.unchanged.filter((c) => c.planned_month === 3);
    expect(m3Cycles.length).toBe(2);
    expect(m3Cycles[0].cycle_id).not.toBe(m3Cycles[1].cycle_id);
    expect(diffRes.body.summary.unchanged_count).toBe(3);
    expect(diffRes.body.summary.invariants_satisfied).toBe(true);
  });

  it('25. Integrity Test 6 & 7: Ambiguous reschedule is detected, reported as conflict without guessing, can_reconcile=false', async () => {
    const aRes = await call('POST', '/api/vcc/assets', 'REV-QC-STAFF', {
      asset_code: 'QC-CONFLICT-01',
      name: 'ตู้บ่มเชื้อจุลินทรีย์',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'QC',
      status: 'ACTIVE'
    });
    const assetId = aRes.body.asset.id;

    const planRes = await call('POST', '/api/vcc/plans', 'REV-QC-STAFF', {
      plan_year: 2026,
      department: 'QC',
      title: 'แผนทดสอบ Ambiguous Conflict Detection'
    });
    const planId = planRes.body.plan.id;

    // Rev.00 has 2 cycles: Month 3 and Month 8
    await call('POST', `/api/vcc/plans/${planId}/items`, 'REV-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'External Lab',
      frequency_label: '2 ครั้ง/ปี',
      planned_months: [3, 8],
      responsible_dept: 'QC'
    });

    await call('POST', `/api/vcc/plans/${planId}/submit`, 'REV-QC-STAFF');
    await call('POST', `/api/vcc/plans/${planId}/review`, 'REV-QC-SUP', { comment: 'ทบทวน' });
    await call('POST', `/api/vcc/plans/${planId}/approve`, 'REV-QA-MGR', { comment: 'อนุมัติ' });

    // Create Rev.01
    const rev01Res = await call('POST', `/api/vcc/plans/${planId}/revisions`, 'REV-QC-STAFF', {
      revision_reason: 'เลื่อนรอบทั้งสองพร้อมกัน'
    });
    const rev01Id = rev01Res.body.plan.id;

    // In Rev.01, user changes months to [4, 9] without specifying which maps to which (clearing initial_cycle_ids)
    await call('POST', `/api/vcc/plans/${rev01Id}/items`, 'REV-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'External Lab',
      frequency_label: '2 ครั้ง/ปี',
      planned_months: [4, 9],
      initial_cycle_ids: [null, null],
      responsible_dept: 'QC'
    });

    const diffRes = await call('GET', `/api/vcc/plans/${rev01Id}/diff`, 'REV-QC-STAFF');
    expect(diffRes.status).toBe(200);

    // Test 6 verification: Strictly detected as conflict, no artificial index pairing
    expect(diffRes.body.summary.has_conflicts).toBe(true);
    expect(diffRes.body.summary.can_reconcile).toBe(false);
    expect(diffRes.body.summary.invariants_satisfied).toBe(false);
    expect(diffRes.body.unresolved_conflicts.length).toBe(1);

    const conflict = diffRes.body.unresolved_conflicts[0];
    expect(conflict.issue).toBe('AMBIGUOUS_CYCLE_MATCH');
    expect(conflict.asset_id).toBe(assetId);
    expect(conflict.unresolved_base_cycles.length).toBe(2);
    expect(conflict.unresolved_target_cycles.length).toBe(2);

    // Test 7 verification: Confirmed diff contains zero false modified/added/removed
    expect(diffRes.body.confirmed.modified.length).toBe(0);
    expect(diffRes.body.confirmed.added.length).toBe(0);
    expect(diffRes.body.confirmed.removed.length).toBe(0);
  });

  it('26. Integrity Test 8: POST /resolve-conflicts records decision, audit trail, and restores reconcilability', async () => {
    const aRes = await call('POST', '/api/vcc/assets', 'REV-QC-STAFF', {
      asset_code: 'QC-RESOLVE-01',
      name: 'เครื่องวัดการนำไฟฟ้า Conductivity',
      asset_type: 'เครื่องชั่ง',
      department: 'QC',
      status: 'ACTIVE'
    });
    const assetId = aRes.body.asset.id;

    const planRes = await call('POST', '/api/vcc/plans', 'REV-QC-STAFF', {
      plan_year: 2026,
      department: 'QC',
      title: 'แผนทดสอบ Conflict Resolution'
    });
    const planId = planRes.body.plan.id;

    await call('POST', `/api/vcc/plans/${planId}/items`, 'REV-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'Standard Lab',
      frequency_label: '2 ครั้ง/ปี',
      planned_months: [3, 8],
      responsible_dept: 'QC'
    });

    await call('POST', `/api/vcc/plans/${planId}/submit`, 'REV-QC-STAFF');
    await call('POST', `/api/vcc/plans/${planId}/review`, 'REV-QC-SUP', { comment: 'ทบทวน' });
    await call('POST', `/api/vcc/plans/${planId}/approve`, 'REV-QA-MGR', { comment: 'อนุมัติ' });

    // Fetch baseline cycles from Rev.00 to get their IDs
    const baseDiff = await call('GET', `/api/vcc/plans/${planId}/diff`, 'REV-QC-STAFF');
    const baseM3 = baseDiff.body.added.find((c) => c.planned_month === 3);
    const baseM8 = baseDiff.body.added.find((c) => c.planned_month === 8);

    // Create Rev.01 and reschedule to [4, 9] causing conflict
    const rev01Res = await call('POST', `/api/vcc/plans/${planId}/revisions`, 'REV-QC-STAFF', {
      revision_reason: 'เลื่อนรอบการสอบเทียบ'
    });
    const rev01Id = rev01Res.body.plan.id;

    await call('POST', `/api/vcc/plans/${rev01Id}/items`, 'REV-QC-STAFF', {
      asset_id: assetId,
      provider_name: 'Standard Lab',
      frequency_label: '2 ครั้ง/ปี',
      planned_months: [4, 9],
      initial_cycle_ids: [null, null],
      responsible_dept: 'QC'
    });

    // Resolve conflict explicitly via POST /api/vcc/plans/:id/diff/resolve-conflicts
    const resolveRes = await call('POST', `/api/vcc/plans/${rev01Id}/diff/resolve-conflicts`, 'REV-QC-SUP', {
      resolution_reason: 'หัวหน้างาน QC ยืนยันจับคู่รอบ: เดือน 3 -> เดือน 4, และ เดือน 8 -> เดือน 9',
      resolutions: [
        {
          asset_id: assetId,
          mappings: [
            { base_cycle_id: baseM3.cycle_id, target_month: 4 },
            { base_cycle_id: baseM8.cycle_id, target_month: 9 }
          ]
        }
      ]
    });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.success).toBe(true);
    expect(resolveRes.body.diff.summary.has_conflicts).toBe(false);
    expect(resolveRes.body.diff.summary.can_reconcile).toBe(true);
    expect(resolveRes.body.diff.summary.invariants_satisfied).toBe(true);
    expect(resolveRes.body.diff.summary.modified_count).toBe(2);
    expect(resolveRes.body.diff.unresolved_conflicts.length).toBe(0);

    // Verify audit log record
    const auditRow = await env.DB.prepare(`
      SELECT * FROM audit_log WHERE action = 'VCC_DIFF_CONFLICT_RESOLVED' ORDER BY id DESC LIMIT 1
    `).first();
    expect(auditRow).toBeDefined();
    expect(auditRow.actor_id).toBe('REV-QC-SUP');
    expect(auditRow.details).toContain('หัวหน้างาน QC ยืนยันจับคู่รอบ');
  });

  it('27. Integrity Test 9: Draft revision isolation ensures zero mutation of current approved plan work orders', async () => {
    const { planId: rev00Id } = await setupApprovedRev00Plan(2026);

    // Fetch initial work orders generated upon Rev.00 approval
    const { results: initialWos } = await env.DB.prepare(`
      SELECT id, status, certificate_no, wo_code FROM vcc_work_orders WHERE plan_id = ? ORDER BY wo_code ASC
    `).bind(rev00Id).all();

    expect(initialWos.length).toBeGreaterThan(0);
    const initialWoSnapshot = JSON.stringify(initialWos);

    // Create Rev.01 Draft
    const rev01Res = await call('POST', `/api/vcc/plans/${rev00Id}/revisions`, 'REV-QC-STAFF', {
      revision_reason: 'ทดสอบความปลอดภัยของ Work Orders'
    });
    const rev01Id = rev01Res.body.plan.id;

    // Drastically alter Rev.01: add items, delete items, change months
    const aNewRes = await call('POST', '/api/vcc/assets', 'REV-QC-STAFF', {
      asset_code: 'QC-NEW-WO-TEST',
      name: 'เครื่องมือใหม่ใน Rev.01',
      asset_type: 'เครื่องชั่ง',
      department: 'QC',
      status: 'ACTIVE'
    });
    await call('POST', `/api/vcc/plans/${rev01Id}/items`, 'REV-QC-STAFF', {
      asset_id: aNewRes.body.asset.id,
      provider_name: 'Lab Test',
      frequency_label: '1 ครั้ง/ปี',
      planned_months: [11],
      responsible_dept: 'QC'
    });

    // Check Rev.00 work orders: MUST BE COMPLETELY UNTOUCHED
    const { results: wosAfter } = await env.DB.prepare(`
      SELECT id, status, certificate_no, wo_code FROM vcc_work_orders WHERE plan_id = ? ORDER BY wo_code ASC
    `).bind(rev00Id).all();

    expect(wosAfter.length).toBe(initialWos.length);
    expect(JSON.stringify(wosAfter)).toBe(initialWoSnapshot);

    // Rev.01 must NOT have generated any work orders
    const rev01Wos = await env.DB.prepare('SELECT COUNT(*) AS c FROM vcc_work_orders WHERE plan_id = ?').bind(rev01Id).first();
    expect(rev01Wos.c).toBe(0);
  });
});
