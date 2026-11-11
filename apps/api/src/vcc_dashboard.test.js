import { installVccTestConfiguration } from './test/vccConfigurationFixture.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('VCC Phase 4: Dashboard KPI, Notification Policy, Audit Log & CSV Export', () => {
  let proxy;
  let env;
  const tokens = {};
  const PASSWORD = 'vcc-dash-pass-123456';

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
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/csv')) {
      return { status: res.status, text: await res.text(), headers: res.headers };
    }
    return { status: res.status, body: await res.json() };
  };

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword(PASSWORD);
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('VDSQC', 'ควบคุมคุณภาพ Dash', 'ACTIVE')"),
      ...[
        ['VDS-DCC', 4, 1],
        ['VDS-L2', 2, 0],
        ['VDS-REV4', 4, 1],
        ['VDS-APP6', 6, 1]
      ].map(([id, level, dcc]) =>
        env.DB.prepare(
          `INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
           VALUES (?, ?, ?, ?, 'USER', ?, ?, ?, ?)`
        ).bind(id, id, `${id}@vccdash.local`, hash, level, dcc ? 'VDSQC' : 'WH', JSON.stringify([dcc ? 'VDSQC' : 'WH']), dcc)
      )
    ]);

    await installVccTestConfiguration(env.DB, ["VDSQC"]);

    for (const id of ['VDS-DCC', 'VDS-L2', 'VDS-REV4', 'VDS-APP6']) {
      const res = await app.request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `${id}@vccdash.local`, password: PASSWORD })
        },
        env
      );
      tokens[id] = (await res.json()).token;
    }
  });

  afterAll(async () => {
    await proxy?.dispose();
  });

  it('blocks users from an unconfigured department from dashboard, notification settings, audit log, and exports', async () => {
    expect((await call('GET', '/api/vcc/dashboard', 'VDS-L2')).status).toBe(403);
    expect((await call('GET', '/api/vcc/notification-settings', 'VDS-L2')).status).toBe(403);
    expect((await call('PUT', '/api/vcc/notification-settings', 'VDS-L2', {})).status).toBe(403);
    expect((await call('GET', '/api/vcc/audit-log', 'VDS-L2')).status).toBe(403);
    expect((await call('GET', '/api/vcc/export/work-orders', 'VDS-L2')).status).toBe(403);
  });

  it('updates configurable notification policy, computes KPIs & deduplicated alerts, stops reminders once CLOSED, and exports CSV', async () => {
    // 1. Update notification policy
    const putSet = await call('PUT', '/api/vcc/notification-settings', 'VDS-DCC', {
      monthly_due_soon_days: [7, 3],
      monthly_overdue_days: [1, 3, 7],
      annual_due_soon_days: [30, 14, 7],
      annual_overdue_days: [1, 7, 14],
      review_sla_days: 3
    });
    expect(putSet.status).toBe(200);
    expect(putSet.body.settings.annual_due_soon_days).toEqual([30, 14, 7]);

    // 2. Create assets and a work order due on 2026-06-30
    const asset1 = await call('POST', '/api/vcc/assets', 'VDS-DCC', {
      asset_code: 'DS-001',
      name: '[ข้อมูลทดสอบ] เวอร์เนียร์คาลิปเปอร์ DS-001',
      asset_type: 'เวอร์เนียร์คาลิปเปอร์',
      department: 'VDSQC',
      is_group: false
    });
    expect(asset1.status).toBe(201);

    const woCreate = await call('POST', '/api/vcc/work-orders', 'VDS-DCC', {
      asset_id: asset1.body.asset.id,
      provider_name: 'ห้องปฏิบัติการภายนอก',
      planned_month: 6,
      due_date: '2026-06-30'
    });
    expect(woCreate.status).toBe(201);
    const woId = woCreate.body.workOrder.id;

    // 3. Check dashboard on 2026-06-25 (5 days before due date -> DUE_SOON)
    const dashBefore = await call('GET', '/api/vcc/dashboard?year=2026&reference_date=2026-06-25', 'VDS-DCC');
    expect(dashBefore.status).toBe(200);
    expect(dashBefore.body.alerts.some((a) => a.wo_id === woId && a.alert_type === 'DUE_SOON')).toBe(true);

    // 4. Check dashboard on 2026-07-05 (5 days after due date -> OVERDUE)
    const dashOverdue = await call('GET', '/api/vcc/dashboard?year=2026&reference_date=2026-07-05', 'VDS-DCC');
    expect(dashOverdue.status).toBe(200);
    expect(dashOverdue.body.alerts.some((a) => a.wo_id === woId && a.alert_type === 'OVERDUE')).toBe(true);

    // 5. Submit result performed on time (2026-06-28 <= 2026-06-30) and close via reviewer
    await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'VDS-DCC', {
      performed_at: '2026-06-28',
      result_status: 'PASS',
      certificate_no: 'CERT-DS-2026-01',
      acceptance_criteria: '± 0.02 mm'
    });
    const closeRes = await call('POST', `/api/vcc/work-orders/${woId}/approve`, 'VDS-REV4', {
      review_comment: 'ตรวจรับเรียบร้อย'
    });
    expect(closeRes.status).toBe(200);

    // 6. Closed work order no longer triggers OVERDUE or DUE_SOON alerts, and increments on_time_count
    const dashAfterClose = await call('GET', '/api/vcc/dashboard?year=2026&reference_date=2026-07-05', 'VDS-DCC');
    expect(dashAfterClose.status).toBe(200);
    expect(dashAfterClose.body.alerts.some((a) => a.wo_id === woId)).toBe(false);
    expect(dashAfterClose.body.work_order_kpi.on_time_count).toBeGreaterThanOrEqual(1);

    // 7. Export work orders CSV and check audit log
    const csvRes = await call('GET', '/api/vcc/export/work-orders', 'VDS-DCC');
    expect(csvRes.status).toBe(200);
    expect(csvRes.text).toContain('CERT-DS-2026-01');
    expect(csvRes.text).toContain('DS-001');

    const auditRes = await call('GET', '/api/vcc/audit-log?category=VCC_', 'VDS-DCC');
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.history.some((h) => h.action === 'VCC_EXPORT_WORK_ORDERS')).toBe(true);
    expect(auditRes.body.history.some((h) => h.action === 'VCC_NOTIFICATION_SETTINGS_UPDATED')).toBe(true);
  });

  it('rejects an invalid year with HTTP 400 on every year-filtered dashboard endpoint, and still serves valid or default years', async () => {
    const paths = ['/api/vcc/dashboard', '/api/vcc/compliance-report', '/api/vcc/export/compliance-report', '/api/vcc/export/annual-plan'];
    for (const path of paths) {
      for (const bad of ['abc', '1999', '2101', '2026.5', '-1', '20x6']) {
        expect((await call('GET', `${path}?year=${bad}`, 'VDS-DCC')).status, `${path}?year=${bad}`).toBe(400);
      }
      // The annual-plan export answers 404 when that year has no plan yet; anything but 400/5xx proves the year was accepted
      const accepted = path.endsWith('/annual-plan') ? [200, 404] : [200];
      for (const q of ['?year=2026', '', '?year=']) {
        expect(accepted, `${path}${q}`).toContain((await call('GET', path + q, 'VDS-DCC')).status);
      }
    }
  });

  it('detects due plan cycles in the current month (PLAN_DUE alert) when approved and not yet opened, and clears alert upon work order opening', async () => {
    // 1. Create an asset in VDSQC
    const assetRes = await call('POST', '/api/vcc/assets', 'VDS-DCC', {
      asset_code: 'TC-DASH-001',
      name: '[ข้อมูลทดสอบ] เทอร์โมคัปเปิล TC-001',
      asset_type: 'เวอร์เนียร์คาลิปเปอร์',
      department: 'VDSQC',
      is_group: false
    });
    expect(assetRes.status).toBe(201);
    const assetId = assetRes.body.asset.id;

    // 2. Insert an approved annual plan for 2026 with a cycle in month 11 (November)
    const planId = 'plan-due-alert-' + crypto.randomUUID();
    const itemId = 'item-due-alert-' + crypto.randomUUID();
    const cycleId = 'cycle-due-alert-' + crypto.randomUUID();

    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO vcc_annual_plans (id, plan_year, department, revision, title, status, effective_status, is_current, prepared_by, approved_by, approved_at)
        VALUES (?, 2026, 'VDSQC', '00', 'แผนทดสอบแจ้งเตือนรอบประจำเดือน', 'APPROVED', 'CURRENT', 1, 'VDS-DCC', 'VDS-APP6', '2026-11-01T00:00:00Z')
      `).bind(planId),
      env.DB.prepare(`
        INSERT INTO vcc_annual_plan_items (id, plan_id, asset_id, frequency_label, provider_name, planned_months, responsible_dept)
        VALUES (?, ?, ?, 'รายปี', 'ทวนสอบภายใน', ?, 'VDSQC')
      `).bind(itemId, planId, assetId, JSON.stringify([11])),
      env.DB.prepare(`
        INSERT INTO vcc_plan_cycles (id, plan_id, plan_item_id, asset_id, cycle_seq, planned_month, baseline_planned_date, cycle_status, initial_cycle_id)
        VALUES (?, ?, ?, ?, 1, 11, '2026-11-30', 'SCHEDULED', ?)
      `).bind(cycleId, planId, itemId, assetId, cycleId)
    ]);

    // 3. Query dashboard with reference_date in month 11 (2026-11-15)
    const dashRes = await call('GET', '/api/vcc/dashboard?year=2026&reference_date=2026-11-15', 'VDS-DCC');
    expect(dashRes.status).toBe(200);

    const planAlert = dashRes.body.alerts.find((a) => a.alert_type === 'PLAN_DUE' && a.asset_code === 'TC-DASH-001');
    expect(planAlert).toBeTruthy();
    expect(planAlert.planned_month).toBe(11);
    expect(planAlert.department).toBe('VDSQC');
    expect(planAlert.recommended_action).toContain('เปิดใบสั่งงาน');

    // 4. In a different month (e.g. October 2026-10-15), this cycle does NOT trigger
    const octRes = await call('GET', '/api/vcc/dashboard?year=2026&reference_date=2026-10-15', 'VDS-DCC');
    expect(octRes.body.alerts.some((a) => a.alert_type === 'PLAN_DUE' && a.asset_code === 'TC-DASH-001')).toBe(false);

    // 5. Create / Activate a work order for this cycle -> status becomes OPEN
    const createWo = await call('POST', '/api/vcc/work-orders', 'VDS-DCC', {
      plan_id: planId,
      plan_item_id: itemId,
      planned_month: 11,
      asset_id: assetId,
      provider_name: 'ทวนสอบภายใน',
      due_date: '2026-11-30'
    });
    expect(createWo.status).toBe(201);
    expect(createWo.body.workOrder.status).toBe('OPEN');

    // 6. Once opened, dashboard in month 11 no longer alerts for this cycle
    const dashAfterWo = await call('GET', '/api/vcc/dashboard?year=2026&reference_date=2026-11-15', 'VDS-DCC');
    expect(dashAfterWo.body.alerts.some((a) => a.alert_type === 'PLAN_DUE' && a.asset_code === 'TC-DASH-001')).toBe(false);
  });

  it('custom due date in vcc_plan_cycles is reflected in PLAN_DUE alert due_date', async () => {
    const assetRes = await call('POST', '/api/vcc/assets', 'VDS-DCC', {
      asset_code: 'TC-CUSTOM-001',
      name: '[ข้อมูลทดสอบ] เทอร์โมมิเตอร์ Custom Date',
      asset_type: 'เวอร์เนียร์คาลิปเปอร์',
      department: 'VDSQC',
      is_group: false
    });
    expect(assetRes.status).toBe(201);
    const assetId = assetRes.body.asset.id;

    const planId = 'plan-custom-due-' + crypto.randomUUID();
    const itemId = 'item-custom-due-' + crypto.randomUUID();
    const cycleId = 'cycle-custom-due-' + crypto.randomUUID();
    const customDate = '2028-11-15';

    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO vcc_annual_plans (id, plan_year, department, revision, title, status, effective_status, is_current, prepared_by, approved_by, approved_at)
        VALUES (?, 2028, 'VDSQC', '00', 'แผนทดสอบ Custom Due Date', 'APPROVED', 'CURRENT', 1, 'VDS-DCC', 'VDS-APP6', '2028-11-01T00:00:00Z')
      `).bind(planId),
      env.DB.prepare(`
        INSERT INTO vcc_annual_plan_items (id, plan_id, asset_id, frequency_label, provider_name, planned_months, due_dates, responsible_dept)
        VALUES (?, ?, ?, 'รายปี', 'ทวนสอบภายใน', ?, ?, 'VDSQC')
      `).bind(itemId, planId, assetId, JSON.stringify([11]), JSON.stringify([customDate])),
      env.DB.prepare(`
        INSERT INTO vcc_plan_cycles (id, plan_id, plan_item_id, asset_id, cycle_seq, planned_month, baseline_planned_date, cycle_status, initial_cycle_id)
        VALUES (?, ?, ?, ?, 1, 11, ?, 'SCHEDULED', ?)
      `).bind(cycleId, planId, itemId, assetId, customDate, cycleId)
    ]);

    const dashRes = await call('GET', '/api/vcc/dashboard?year=2028&reference_date=2028-11-05', 'VDS-DCC');
    expect(dashRes.status).toBe(200);

    const alert = dashRes.body.alerts.find((a) => a.alert_type === 'PLAN_DUE' && a.asset_code === 'TC-CUSTOM-001');
    expect(alert).toBeTruthy();
    expect(alert.due_date).toBe(customDate);
  });
});
