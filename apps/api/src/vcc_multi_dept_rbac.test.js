import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

const PASSWORD = 'test-password-123';

describe('VCC Multi-Department Access & Approval Workflow (RBAC & SoD)', () => {
  let proxy;
  let env;
  const tokens = {};

  const call = async (method, path, asUser, body) => {
    const res = await app.request(
      path,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(asUser ? { Authorization: `Bearer ${tokens[asUser]}` } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
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
      // Ensure departments exist
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('DC', 'ฝ่ายควบคุมเอกสาร', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('QC', 'ฝ่ายควบคุมคุณภาพ', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('QA', 'ฝ่ายประกันคุณภาพ', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('PD', 'ฝ่ายผลิต', 'ACTIVE')"),

      // Test users:
      // DCC-USER: DC Head (L4, is_dcc = 1)
      // QC-STAFF: QC Staff (L2, is_dcc = 0)
      // QC-LEAD:  QC Supervisor (L4, is_dcc = 0)
      // QA-MGR:   QA Manager (L6, is_dcc = 0)
      // PD-USER:  PD Staff (L2, is_dcc = 0) - unauthorized department
      ...[
        ['DCC-USER', 'DC', 4, 1, 'DCC_ADMIN'],
        ['QC-STAFF', 'QC', 2, 0, 'GENERAL_USER'],
        ['QC-LEAD',  'QC', 4, 0, 'GENERAL_USER'],
        ['QA-MGR',   'QA', 6, 0, 'GENERAL_USER'],
        ['PD-USER',  'PD', 2, 0, 'GENERAL_USER']
      ].map(([id, dept, level, dcc, role]) =>
        env.DB.prepare(
          `INSERT OR REPLACE INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`
        ).bind(id, id, `${id}@vcc-rbac.local`, hash, role, level, dept, JSON.stringify([dept]), dcc)
      )
    ]);

    for (const id of ['DCC-USER', 'QC-STAFF', 'QC-LEAD', 'QA-MGR', 'PD-USER']) {
      const res = await app.request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `${id}@vcc-rbac.local`, password: PASSWORD })
        },
        env
      );
      tokens[id] = (await res.json()).token;
    }
  });

  afterAll(async () => {
    await proxy?.dispose();
  });

  it('1. Blocks unauthorized department (PD) from accessing VCC endpoints with HTTP 403', async () => {
    expect((await call('GET', '/api/vcc/assets', 'PD-USER')).status).toBe(403);
    expect((await call('GET', '/api/vcc/plans', 'PD-USER')).status).toBe(403);
    expect((await call('GET', '/api/vcc/work-orders', 'PD-USER')).status).toBe(403);
    expect((await call('GET', '/api/vcc/dashboard', 'PD-USER')).status).toBe(403);
    expect((await call('GET', '/api/vcc/audit-log', 'PD-USER')).status).toBe(403);
  });

  it('2. Grants Read access to DCC, QC, and QA users across VCC resources', async () => {
    // QC Staff can read assets, plans, work orders, dashboard
    expect((await call('GET', '/api/vcc/assets', 'QC-STAFF')).status).toBe(200);
    expect((await call('GET', '/api/vcc/plans', 'QC-STAFF')).status).toBe(200);
    expect((await call('GET', '/api/vcc/work-orders', 'QC-STAFF')).status).toBe(200);
    expect((await call('GET', '/api/vcc/dashboard', 'QC-STAFF')).status).toBe(200);

    // QA Manager can read assets, plans, work orders, dashboard
    expect((await call('GET', '/api/vcc/assets', 'QA-MGR')).status).toBe(200);
    expect((await call('GET', '/api/vcc/plans', 'QA-MGR')).status).toBe(200);
    expect((await call('GET', '/api/vcc/work-orders', 'QA-MGR')).status).toBe(200);

    // DCC can read
    expect((await call('GET', '/api/vcc/assets', 'DCC-USER')).status).toBe(200);
  });

  it('3. Restricts master data and settings updates to DCC only (QC/QA get 403)', async () => {
    // QC and QA cannot modify asset types
    expect((await call('PUT', '/api/vcc/asset-types', 'QC-STAFF', { assetTypes: ['เวอร์เนียร์'] })).status).toBe(403);
    expect((await call('PUT', '/api/vcc/asset-types', 'QA-MGR', { assetTypes: ['เวอร์เนียร์'] })).status).toBe(403);

    // QC and QA cannot modify plan settings
    expect((await call('PUT', '/api/vcc/plan-settings', 'QC-LEAD', { providers: ['แล็บใหม่'] })).status).toBe(403);

    // QC and QA cannot modify work order settings
    expect((await call('PUT', '/api/vcc/work-order-settings', 'QC-LEAD', { retention_years: 5 })).status).toBe(403);

    // QC and QA cannot modify notification settings
    expect((await call('PUT', '/api/vcc/notification-settings', 'QA-MGR', { review_sla_days: 5 })).status).toBe(403);

    // DCC can modify asset types
    const dccRes = await call('PUT', '/api/vcc/asset-types', 'DCC-USER', { assetTypes: ['เทอร์โมมิเตอร์', 'เวอร์เนียร์'] });
    expect(dccRes.status).toBe(200);
  });

  it('4. Multi-Department Annual Plan Workflow (QC Draft -> QC Review -> QA Approve) with strict SoD', async () => {
    // Step A: DCC registers an active tool for QC
    const assetRes = await call('POST', '/api/vcc/assets', 'DCC-USER', {
      asset_code: 'QC-CAL-001',
      name: '[ข้อมูลทดสอบ] ไมโครมิเตอร์ QC',
      asset_type: 'เวอร์เนียร์',
      department: 'QC',
      is_group: 0
    });
    expect(assetRes.status).toBe(201);
    const assetId = assetRes.body.asset.id;

    // Step B: QC Staff (L2) drafts annual plan for QC
    const createPlanRes = await call('POST', '/api/vcc/plans', 'QC-STAFF', {
      plan_year: 2026,
      department: 'QC',
      title: 'แผนการทวนสอบเครื่องมือ QC 2026'
    });
    expect(createPlanRes.status).toBe(201);
    const planId = createPlanRes.body.plan.id;

    // Add item to plan
    const addItemRes = await call('POST', `/api/vcc/plans/${planId}/items`, 'QC-STAFF', {
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      planned_months: [3, 9],
      responsible_dept: 'QC'
    });
    expect(addItemRes.status).toBe(201);
    const planItemId = addItemRes.body.items[0].id;

    // Submit plan
    const submitRes = await call('POST', `/api/vcc/plans/${planId}/submit`, 'QC-STAFF', {});
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.plan.status).toBe('PENDING_REVIEW');
    expect(submitRes.body.plan.prepared_by).toBe('QC-STAFF');

    // SoD Check: QC-STAFF cannot review their own plan
    const staffSelfReview = await call('POST', `/api/vcc/plans/${planId}/review`, 'QC-STAFF', { comment: 'ทบทวนตนเอง' });
    expect(staffSelfReview.status).toBe(403);
    expect(staffSelfReview.body.error).toMatch(/ผู้จัดทำไม่สามารถทบทวนแผนของตนเองได้/);

    // Step C: QC Supervisor (QC-LEAD, L4) reviews plan
    const leadReviewRes = await call('POST', `/api/vcc/plans/${planId}/review`, 'QC-LEAD', { comment: 'ผ่านการทบทวนโดยหัวหน้า QC' });
    expect(leadReviewRes.status).toBe(200);
    expect(leadReviewRes.body.plan.status).toBe('PENDING_APPROVAL');
    expect(leadReviewRes.body.plan.reviewed_by).toBe('QC-LEAD');

    // SoD Check: QC-LEAD cannot approve the plan they reviewed
    const leadSelfApprove = await call('POST', `/api/vcc/plans/${planId}/approve`, 'QC-LEAD', { comment: 'อนุมัติเอง' });
    expect(leadSelfApprove.status).toBe(403);
    expect(leadSelfApprove.body.error).toMatch(/ผู้ทบทวนไม่สามารถอนุมัติแผนที่ตนทบทวนได้/);

    // Step D: QA Manager (QA-MGR, L6) approves plan
    const mgrApproveRes = await call('POST', `/api/vcc/plans/${planId}/approve`, 'QA-MGR', { comment: 'อนุมัติโดยผู้จัดการ QA' });
    expect(mgrApproveRes.status).toBe(200);
    expect(mgrApproveRes.body.plan.status).toBe('APPROVED');
    expect(mgrApproveRes.body.plan.approved_by).toBe('QA-MGR');

    // Step E: Work Order creation from approved plan
    const woRes = await call('POST', '/api/vcc/work-orders', 'QC-STAFF', {
      mode: 'FROM_PLAN',
      plan_id: planId,
      plan_item_id: planItemId,
      planned_month: 3,
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      due_date: '2026-03-31'
    });
    expect(woRes.status).toBe(201);
    const woId = woRes.body.workOrder.id;

    // Step F: QC Staff records result (PASS)
    const resultRes = await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'QC-STAFF', {
      performed_at: '2026-03-15',
      result_status: 'PASS',
      certificate_no: 'CERT-QC-2026-001',
      acceptance_criteria: '± 0.02 mm ตามเกณฑ์'
    });
    expect(resultRes.status).toBe(200);
    expect(resultRes.body.workOrder.status).toBe('PENDING_REVIEW');
    expect(resultRes.body.workOrder.performed_by).toBe('QC-STAFF');

    // SoD Check: QC Staff cannot inspect/approve their own work order result
    const staffSelfApproveWo = await call('POST', `/api/vcc/work-orders/${woId}/approve`, 'QC-STAFF', { comment: 'ตรวจรับเอง' });
    expect(staffSelfApproveWo.status).toBe(403);
    expect(staffSelfApproveWo.body.error).toMatch(/ผู้บันทึกผลไม่สามารถตรวจรับและอนุมัติปิดใบสั่งงานของตนเองได้/);

    // Step G: QC Supervisor (QC-LEAD, L4) inspects and closes work order
    const leadApproveWo = await call('POST', `/api/vcc/work-orders/${woId}/approve`, 'QC-LEAD', { comment: 'ตรวจรับถูกต้อง ใบเซอร์ครบถ้วน' });
    expect(leadApproveWo.status).toBe(200);
    expect(leadApproveWo.body.workOrder.status).toBe('CLOSED');
    expect(leadApproveWo.body.workOrder.reviewed_by).toBe('QC-LEAD');

    // Verify audit log has complete trail
    const auditRes = await call('GET', `/api/vcc/work-orders/${woId}`, 'QC-LEAD');
    expect(auditRes.status).toBe(200);
    const actions = auditRes.body.history.map((h) => h.action);
    expect(actions).toContain('VCC_WO_CREATED');
    expect(actions).toContain('VCC_WO_RESULT_SUBMITTED');
    expect(actions).toContain('VCC_WO_APPROVED');
  });

  it('5. Enforces L5+ requirement for NC Hold Release (QC Supervisor cannot release, QA Manager can)', async () => {
    // Create tool and ad-hoc work order
    const assetRes = await call('POST', '/api/vcc/assets', 'DCC-USER', {
      asset_code: 'QC-FAIL-001',
      name: '[ข้อมูลทดสอบ] เครื่องวัดอุณหภูมิ QC',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'QC',
      is_group: 0
    });
    const assetId = assetRes.body.asset.id;

    const woRes = await call('POST', '/api/vcc/work-orders', 'QC-STAFF', {
      mode: 'ADHOC',
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      due_date: '2026-04-30'
    });
    const woId = woRes.body.workOrder.id;

    // Submit FAIL result
    await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'QC-STAFF', {
      performed_at: '2026-04-10',
      result_status: 'FAIL',
      certificate_no: 'CERT-FAIL-001',
      acceptance_criteria: '± 0.5 °C',
      result_remarks: 'ค่าคลาดเคลื่อนเกินเกณฑ์ ±1.8 °C'
    });

    // Close work order -> triggers ON_HOLD with open NC
    await call('POST', `/api/vcc/work-orders/${woId}/approve`, 'QC-LEAD', { comment: 'รับทราบผลไม่ผ่าน เข้าสู่กระบวนการระงับใช้' });
    const closedWo = await call('GET', `/api/vcc/work-orders/${woId}`, 'QC-LEAD');
    expect(closedWo.body.workOrder.status).toBe('CLOSED');
    expect(closedWo.body.workOrder.nc_status).toBe('OPEN');

    // QC Supervisor (L4) tries to release hold -> 403 (requires L5+)
    const leadRelease = await call('POST', `/api/vcc/work-orders/${woId}/release-hold`, 'QC-LEAD', {
      impact_assessment: 'ประเมินแล้ว'
    });
    expect(leadRelease.status).toBe(403);
    expect(leadRelease.body.error).toMatch(/ต้องมีระดับอนุมัติ L5 ขึ้นไป/);

    // QA Manager (L6) releases hold with mandatory impact assessment -> 200
    const mgrRelease = await call('POST', `/api/vcc/work-orders/${woId}/release-hold`, 'QA-MGR', {
      impact_assessment: 'ปรับเทียบชดเชยค่าเรียบร้อย และตรวจสอบย้อนกลับชิ้นงานผลิตแล้วไม่มีผลกระทบ'
    });
    expect(mgrRelease.status).toBe(200);
    expect(mgrRelease.body.workOrder.nc_status).toBe('RELEASED');
    expect(mgrRelease.body.workOrder.hold_released_by).toBe('QA-MGR');
  });
});
