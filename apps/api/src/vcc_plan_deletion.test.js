import { installVccTestConfiguration } from './test/vccConfigurationFixture.js';
import { describe, it, expect, beforeAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('VCC: Annual Plan Deletion & Safety Gate Tests (DELETE /api/vcc/plans/:id)', () => {
  let proxy;
  let env;
  const tokens = {};
  const PASSWORD = 'vcc-del-pass-123456';

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
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('DELQC', 'ควบคุมคุณภาพ ลบแผน', 'ACTIVE'), ('DELPD', 'ผลิต ลบแผน', 'ACTIVE')"),
      // DEL-DCC: DCC Admin (L4, is_dcc=1)
      // DEL-QCL4: QC Department Head (L4, DELQC)
      // DEL-QCL2: QC Staff (L2, DELQC)
      // DEL-PDL4: PD Department Head (L4, DELPD)
      ...[
        ['DEL-DCC', 4, 1, 'DELQC'],
        ['DEL-QCL4', 4, 0, 'DELQC'],
        ['DEL-QCL2', 2, 0, 'DELQC'],
        ['DEL-PDL4', 4, 0, 'DELPD']
      ].map(([id, level, dcc, dept]) =>
        env.DB.prepare(
          `INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
           VALUES (?, ?, ?, ?, 'USER', ?, ?, ?, ?)`
        ).bind(id, id, `${id}@vccdel.local`, hash, level, dept, JSON.stringify([dept]), dcc)
      )
    ]);

    await installVccTestConfiguration(env.DB, ['DELQC', 'DELPD'], {
      DELQC: { assigned_reviewer_id: 'DEL-DCC', assigned_approver_id: 'DEL-DCC' },
      DELPD: { assigned_reviewer_id: 'DEL-DCC', assigned_approver_id: 'DEL-DCC' }
    });

    for (const id of ['DEL-DCC', 'DEL-QCL4', 'DEL-QCL2', 'DEL-PDL4']) {
      const res = await app.request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `${id}@vccdel.local`, password: PASSWORD })
        },
        env
      );
      const data = await res.json();
      tokens[id] = data.token;
    }
  });

  it('rejects deletion when reason is missing (HTTP 400)', async () => {
    // Create draft plan
    const create = await call('POST', '/api/vcc/plans', 'DEL-QCL4', {
      plan_year: 2040,
      department: 'DELQC',
      title: 'แผนทดสอบลบไม่มีเหตุผล'
    });
    expect(create.status).toBe(201);
    const planId = create.body.plan.id;

    const del = await call('DELETE', `/api/vcc/plans/${planId}`, 'DEL-QCL4', {});
    expect(del.status).toBe(400);
    expect(del.body.error).toContain('กรุณาระบุเหตุผล');

    // Clean up
    await call('DELETE', `/api/vcc/plans/${planId}`, 'DEL-QCL4', { reason: 'ทำความสะอาด' });
  });

  it('strictly blocks unauthorized users from deleting a plan (HTTP 403)', async () => {
    const create = await call('POST', '/api/vcc/plans', 'DEL-QCL4', {
      plan_year: 2041,
      department: 'DELQC',
      title: 'แผนทดสอบสิทธิ์การลบ'
    });
    expect(create.status).toBe(201);
    const planId = create.body.plan.id;

    // 1. Staff with Level < 4 in same dept is blocked
    const delL2 = await call('DELETE', `/api/vcc/plans/${planId}`, 'DEL-QCL2', { reason: 'Staff พยายามลบ' });
    expect(delL2.status).toBe(403);
    expect(delL2.body.error).toContain('เฉพาะผู้รับผิดชอบของแผนกนั้น');

    // 2. Head of different department (DELPD) is blocked
    const delPD = await call('DELETE', `/api/vcc/plans/${planId}`, 'DEL-PDL4', { reason: 'ต่างแผนกพยายามลบ' });
    expect(delPD.status).toBe(403);
    expect(delPD.body.error).toContain('เฉพาะผู้รับผิดชอบของแผนกนั้น');

    // Clean up by owning department L4
    const delOwn = await call('DELETE', `/api/vcc/plans/${planId}`, 'DEL-QCL4', { reason: 'ลบโดยเจ้าของแผนก' });
    expect(delOwn.status).toBe(200);
  });

  it('strictly blocks deleting an APPROVED plan (HTTP 400)', async () => {
    // Insert an approved plan directly
    const approvedPlanId = 'plan-del-approved-test';
    await env.DB.prepare(`
      INSERT OR REPLACE INTO vcc_annual_plans (id, plan_year, department, document_code, revision, title, status, is_current, effective_status)
      VALUES (?, 2042, 'DELQC', 'VCC-DEL-2042', '01', 'แผนอนุมัติแล้วห้ามลบ', 'APPROVED', 1, 'CURRENT')
    `).bind(approvedPlanId).run();

    const del = await call('DELETE', `/api/vcc/plans/${approvedPlanId}`, 'DEL-DCC', { reason: 'พยายามลบแผนอนุมัติ' });
    expect(del.status).toBe(400);
    expect(del.body.error).toContain('ไม่อนุญาตให้ลบแผนงานที่อยู่ระหว่างการอนุมัติหรือมีผลบังคับใช้แล้ว');
  });

  it('successfully deletes a DRAFT plan with its items and cycles, recording audit trail', async () => {
    const create = await call('POST', '/api/vcc/plans', 'DEL-QCL4', {
      plan_year: 2043,
      department: 'DELQC',
      title: 'แผนที่จะลบสมบูรณ์'
    });
    expect(create.status).toBe(201);
    const planId = create.body.plan.id;

    // Create an asset and add item to plan
    const assetId = 'asset-del-test-1';
    await env.DB.prepare(`
      INSERT OR REPLACE INTO vcc_assets (id, asset_code, name, department, status, asset_type)
      VALUES (?, 'CODE-DEL-01', 'เครื่องมือทดสอบลบแผน', 'DELQC', 'ACTIVE', 'เครื่องชั่ง')
    `).bind(assetId).run();

    const addItem = await call('POST', `/api/vcc/plans/${planId}/items`, 'DEL-QCL4', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      planned_months: [4, 8],
      responsible_dept: 'DELQC'
    });
    expect(addItem.status).toBe(201);
    const planItemId = addItem.body.items[0].id;

    // Insert a cycle for this plan to verify cycle cleanup
    await env.DB.prepare(`
      INSERT INTO vcc_plan_cycles (id, plan_id, plan_item_id, asset_id, planned_month, baseline_planned_date, cycle_status)
      VALUES ('cycle-del-test-1', ?, ?, ?, 4, '2043-04-30', 'PLANNED')
    `).bind(planId, planItemId, assetId).run();

    // Verify item and cycle exist
    const itemsBefore = await env.DB.prepare('SELECT COUNT(*) as c FROM vcc_annual_plan_items WHERE plan_id = ?').bind(planId).first('c');
    expect(itemsBefore).toBeGreaterThan(0);
    const cyclesBefore = await env.DB.prepare('SELECT COUNT(*) as c FROM vcc_plan_cycles WHERE plan_id = ?').bind(planId).first('c');
    expect(cyclesBefore).toBeGreaterThan(0);

    // Delete plan
    const del = await call('DELETE', `/api/vcc/plans/${planId}`, 'DEL-QCL4', {
      reason: 'สร้างแผนปี 2043 ผิดพลาด ขอยกเลิกและสร้างใหม่'
    });
    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);
    expect(del.body.deleted_id).toBe(planId);

    // Verify database cleanup
    const planAfter = await env.DB.prepare('SELECT * FROM vcc_annual_plans WHERE id = ?').bind(planId).first();
    expect(planAfter).toBeNull();
    const itemsAfter = await env.DB.prepare('SELECT COUNT(*) as c FROM vcc_annual_plan_items WHERE plan_id = ?').bind(planId).first('c');
    expect(itemsAfter).toBe(0);
    const cyclesAfter = await env.DB.prepare('SELECT COUNT(*) as c FROM vcc_plan_cycles WHERE plan_id = ?').bind(planId).first('c');
    expect(cyclesAfter).toBe(0);

    // Verify audit log
    const auditRow = await env.DB.prepare(
      "SELECT * FROM audit_log WHERE action = 'VCC_PLAN_DELETED' AND json_extract(details, '$.plan_id') = ?"
    ).bind(planId).first();
    expect(auditRow).not.toBeNull();
    const details = JSON.parse(auditRow.details);
    expect(details.reason).toBe('สร้างแผนปี 2043 ผิดพลาด ขอยกเลิกและสร้างใหม่');
    expect(details.department).toBe('DELQC');

    // Can create new plan for year 2043 after deletion
    const recreate = await call('POST', '/api/vcc/plans', 'DEL-QCL4', {
      plan_year: 2043,
      department: 'DELQC',
      title: 'แผนปี 2043 ฉบับใหม่หลังลบ'
    });
    expect(recreate.status).toBe(201);

    // Clean up
    await call('DELETE', `/api/vcc/plans/${recreate.body.plan.id}`, 'DEL-QCL4', { reason: 'ทำความสะอาด' });
  });

  it('guarantees parent plan remains CURRENT when deleting a child revision DRAFT', async () => {
    const parentPlanId = 'plan-del-parent-rev01';
    await env.DB.prepare(`
      INSERT OR REPLACE INTO vcc_annual_plans (id, plan_year, department, document_code, revision, title, status, is_current, effective_status)
      VALUES (?, 2044, 'DELQC', 'VCC-DEL-2044', '01', 'แผนแม่ Rev.01', 'APPROVED', 1, 'CURRENT')
    `).bind(parentPlanId).run();

    // Create child revision DRAFT
    const childRevId = 'plan-del-child-rev02';
    await env.DB.prepare(`
      INSERT OR REPLACE INTO vcc_annual_plans (id, plan_year, department, document_code, revision, title, status, is_current, effective_status, parent_plan_id)
      VALUES (?, 2044, 'DELQC', 'VCC-DEL-2044', '02', 'แผนลูก Rev.02 ร่าง', 'DRAFT', 0, 'PENDING', ?)
    `).bind(childRevId, parentPlanId).run();

    // Delete child revision
    const del = await call('DELETE', `/api/vcc/plans/${childRevId}`, 'DEL-DCC', {
      reason: 'ยกเลิกการแก้ไข Rev.02'
    });
    expect(del.status).toBe(200);

    // Verify parent plan remains APPROVED, CURRENT and is_current = 1
    const parentAfter = await env.DB.prepare('SELECT * FROM vcc_annual_plans WHERE id = ?').bind(parentPlanId).first();
    expect(parentAfter).not.toBeNull();
    expect(parentAfter.status).toBe('APPROVED');
    expect(parentAfter.effective_status).toBe('CURRENT');
    expect(Number(parentAfter.is_current)).toBe(1);
  });
});
