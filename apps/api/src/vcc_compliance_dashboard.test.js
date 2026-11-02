import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('VCC Phase 3.3: Calibration Monitoring & Compliance Dashboard Tests', () => {
  let proxy;
  let env;
  const tokens = {};
  const PASSWORD = 'dash-test-pass-123456';

  const cleanupTestData = async (db) => {
    if (!db) return;
    try {
      await db.prepare("DELETE FROM vcc_work_order_certificates WHERE work_order_id LIKE 'WO-M3-%'").run();
      await db.prepare("UPDATE vcc_work_orders SET status = 'CANCELLED', certificate_no = NULL WHERE id LIKE 'WO-M3-%'").run();
      await db.prepare("DELETE FROM vcc_work_orders WHERE id LIKE 'WO-M3-%'").run();
      await db.prepare("DELETE FROM vcc_assets WHERE id LIKE 'AST-M3-%'").run();
      await db.prepare("DELETE FROM users WHERE id LIKE '%-M3'").run();
    } catch (err) {
      console.error('cleanupTestData error:', err);
    }
  };

  const call = async (method, path, who, body) => {
    const res = await app.request(
      path,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens[who]}`
        },
        body: body && JSON.stringify(body)
      },
      env
    );
    const contentType = res.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      return { status: res.status, body: await res.json(), headers: res.headers };
    }
    const buf = await res.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buf);
    return { status: res.status, text, bytes: new Uint8Array(buf), headers: res.headers };
  };

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    await cleanupTestData(env.DB);
    const hash = await hashPassword(PASSWORD);

    // Seed departments and users
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('QC', 'ควบคุมคุณภาพ QC', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('QA', 'ประกันคุณภาพ QA', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('PD', 'ฝ่ายผลิต PD', 'ACTIVE')"),

      // DCC user (admin)
      env.DB.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
        VALUES ('DCC-M3', 'DCC Master', 'dcc.m3@vcc.local', ?, 'DCC', 5, 'QC', '["QC","QA","PD"]', 1)
      `).bind(hash),

      // QC L4 user (Inspector/Performer)
      env.DB.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
        VALUES ('QC-L4-M3', 'QC Performer', 'qc.l4.m3@vcc.local', ?, 'USER', 4, 'QC', '["QC"]', 1)
      `).bind(hash),

      // QA L5 user (Manager / Approver)
      env.DB.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
        VALUES ('QA-L5-M3', 'QA Manager', 'qa.l5.m3@vcc.local', ?, 'MANAGER', 5, 'QA', '["QA"]', 1)
      `).bind(hash),

      // QA L4 user (non-DCC, authorized for QA department only)
      env.DB.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
        VALUES ('QA-L4-M3', 'QA Officer', 'qa.l4.m3@vcc.local', ?, 'USER', 4, 'QA', '["QA"]', 0)
      `).bind(hash)
    ]);

    for (const id of ['DCC-M3', 'QC-L4-M3', 'QA-L5-M3', 'QA-L4-M3']) {
      const email = id === 'DCC-M3' ? 'dcc.m3@vcc.local' : `${id.toLowerCase().replace(/-/g, '.')}@vcc.local`;
      const res = await app.request(
        '/api/auth/login',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) },
        env
      );
      const data = await res.json();
      tokens[id] = data.token;
    }
  });

  afterAll(async () => {
    // Cleanup test data safely (bypassing CLOSED work orders deletion trigger)
    await cleanupTestData(env.DB);
    await proxy?.dispose();
  });

  it('1. Overdue Invariance: detect overdue strictly from required_due_date even when rescheduled into the future', async () => {
    // Today anchor reference
    const now = new Date();
    const pastDate = new Date(now.getTime() - 10 * 86400000).toISOString().slice(0, 10);
    const futureDate = new Date(now.getTime() + 20 * 86400000).toISOString().slice(0, 10);

    // Create an asset
    await env.DB.prepare(`
      INSERT INTO vcc_assets (id, asset_code, name, department, status, is_group, location, asset_type)
      VALUES ('AST-M3-OVR1', 'CAL-M3-001', 'Vernier Caliper Invariance', 'QC', 'ACTIVE', 0, 'Lab A', 'MEASURING_TOOL')
    `).run();

    // Create a work order where required_due_date is in the past, but due_date has been rescheduled to future
    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, asset_id, plan_year, cycle_id, status,
        provider_name,
        required_due_date, original_due_date, due_date,
        result_status
      ) VALUES (
        'WO-M3-OVR1', 'WO-M3-001', 'AST-M3-OVR1', 2026, 'AST-M3-OVR1-C1', 'SCHEDULED',
        'ห้องปฏิบัติการทวนสอบภายใน',
        ?, ?, ?,
        'PENDING'
      )
    `).bind(pastDate, pastDate, futureDate).run();

    const res = await call('GET', '/api/vcc/dashboard', 'DCC-M3');
    expect(res.status).toBe(200);

    // Overdue count must identify the work order as overdue based on required_due_date
    expect(res.body.work_order_kpi.overdue_count).toBeGreaterThanOrEqual(1);
    expect(res.body.work_order_kpi.rescheduled_overdue_count).toBeGreaterThanOrEqual(1);
    expect(res.body.equipment_kpi.equipment_overdue_count).toBeGreaterThanOrEqual(1);

    // Check alert
    const overdueAlert = res.body.alerts.find(
      (a) => a.wo_id === 'WO-M3-OVR1' && a.alert_type === 'OVERDUE' && a.is_rescheduled === true
    );
    expect(overdueAlert).toBeDefined();
    expect(overdueAlert.severity).toBe('HIGH');
    expect(overdueAlert.required_due_date).toBe(pastDate);
    expect(overdueAlert.due_date).toBe(futureDate);
    expect(overdueAlert.recommended_action).toContain('เลยรอบมาตรฐานประจำปี');
  });

  it('2. Non-overlapping Due Soon Buckets (0-7, 8-15, 16-30 days) and separate Equipment vs Work Order KPIs', async () => {
    const now = new Date();
    const datePlus3 = new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 10);
    const datePlus10 = new Date(now.getTime() + 10 * 86400000).toISOString().slice(0, 10);
    const datePlus25 = new Date(now.getTime() + 25 * 86400000).toISOString().slice(0, 10);
    const datePlus50 = new Date(now.getTime() + 50 * 86400000).toISOString().slice(0, 10);

    // Insert 2 assets
    await env.DB.prepare(`
      INSERT INTO vcc_assets (id, asset_code, name, department, status, is_group, location, asset_type)
      VALUES
        ('AST-M3-BK1', 'CAL-M3-002', 'Micrometer Bucket 1', 'QC', 'ACTIVE', 0, 'Lab B', 'MEASURING_TOOL'),
        ('AST-M3-BK2', 'CAL-M3-003', 'Gauge Bucket 2', 'QC', 'ACTIVE', 0, 'Lab B', 'MEASURING_TOOL')
    `).run();

    // Work orders distributed across non-overlapping intervals
    // Asset BK1 has TWO work orders (due in 3 days, and due in 10 days) -> tests equipment deduplication
    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (id, wo_code, asset_id, plan_year, cycle_id, status, provider_name, original_due_date, required_due_date, due_date, result_status)
      VALUES
        ('WO-M3-BK1A', 'WO-M3-002A', 'AST-M3-BK1', 2026, 'AST-M3-BK1-C1', 'SCHEDULED', 'ห้องปฏิบัติการทวนสอบภายใน', ?, ?, ?, 'PENDING'),
        ('WO-M3-BK1B', 'WO-M3-002B', 'AST-M3-BK1', 2026, 'AST-M3-BK1-C2', 'SCHEDULED', 'ห้องปฏิบัติการทวนสอบภายใน', ?, ?, ?, 'PENDING'),
        ('WO-M3-BK2A', 'WO-M3-003A', 'AST-M3-BK2', 2026, 'AST-M3-BK2-C1', 'SCHEDULED', 'ห้องปฏิบัติการทวนสอบภายใน', ?, ?, ?, 'PENDING'),
        ('WO-M3-BK2B', 'WO-M3-003B', 'AST-M3-BK2', 2026, 'AST-M3-BK2-C2', 'SCHEDULED', 'ห้องปฏิบัติการทวนสอบภายใน', ?, ?, ?, 'PENDING')
    `).bind(
      datePlus3, datePlus3, datePlus3,
      datePlus10, datePlus10, datePlus10,
      datePlus25, datePlus25, datePlus25,
      datePlus50, datePlus50, datePlus50
    ).run();

    const res = await call('GET', '/api/vcc/dashboard', 'DCC-M3');
    expect(res.status).toBe(200);

    const kpi = res.body.work_order_kpi;
    expect(kpi.due_0_7_days).toBeGreaterThanOrEqual(1);
    expect(kpi.due_8_15_days).toBeGreaterThanOrEqual(1);
    expect(kpi.due_16_30_days).toBeGreaterThanOrEqual(1);
    expect(kpi.total_due_soon_30_days).toBe(kpi.due_0_7_days + kpi.due_8_15_days + kpi.due_16_30_days);

    // Verify equipment deduplication: Asset BK1 is due soon, Asset BK2 is due soon
    // Equipment due soon count must count unique instruments
    expect(res.body.equipment_kpi.equipment_due_soon_count).toBeGreaterThanOrEqual(2);
  });

  it('3. Certificate Expiry Monitoring: validates expired, 0-30 days, 31-60 days and valid counts', async () => {
    const now = new Date();
    const expiredCertDate = new Date(now.getTime() - 5 * 86400000).toISOString().slice(0, 10);
    const expiringCertDate1 = new Date(now.getTime() + 15 * 86400000).toISOString().slice(0, 10);
    const expiringCertDate2 = new Date(now.getTime() + 45 * 86400000).toISOString().slice(0, 10);
    const validCertDate = new Date(now.getTime() + 120 * 86400000).toISOString().slice(0, 10);

    // Insert 4 assets
    await env.DB.prepare(`
      INSERT INTO vcc_assets (id, asset_code, name, department, status, is_group, location, asset_type)
      VALUES
        ('AST-M3-CRT1', 'CRT-M3-001', 'Balance Cert Expired', 'QC', 'ACTIVE', 0, 'Lab C', 'MEASURING_TOOL'),
        ('AST-M3-CRT2', 'CRT-M3-002', 'Balance Cert Expiring 15d', 'QC', 'ACTIVE', 0, 'Lab C', 'MEASURING_TOOL'),
        ('AST-M3-CRT3', 'CRT-M3-003', 'Balance Cert Expiring 45d', 'QC', 'ACTIVE', 0, 'Lab C', 'MEASURING_TOOL'),
        ('AST-M3-CRT4', 'CRT-M3-004', 'Balance Cert Valid', 'QC', 'ACTIVE', 0, 'Lab C', 'MEASURING_TOOL')
    `).run();

    // Create completed work orders with certificates
    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, asset_id, plan_year, cycle_id, status, provider_name, original_due_date, due_date,
        result_status, certificate_no, certificate_valid_until, performed_at
      ) VALUES
        ('WO-M3-CRT1', 'WO-M3-C01', 'AST-M3-CRT1', 2026, 'CYC-M3-CRT1', 'CLOSED', 'สถาบันมาตรวิทยาแห่งชาติ', '2026-01-01', '2026-01-01', 'PASS', 'CERT-001', ?, '2026-01-02'),
        ('WO-M3-CRT2', 'WO-M3-C02', 'AST-M3-CRT2', 2026, 'CYC-M3-CRT2', 'CLOSED', 'สถาบันมาตรวิทยาแห่งชาติ', '2026-01-01', '2026-01-01', 'PASS', 'CERT-002', ?, '2026-01-02'),
        ('WO-M3-CRT3', 'WO-M3-C03', 'AST-M3-CRT3', 2026, 'CYC-M3-CRT3', 'CLOSED', 'สถาบันมาตรวิทยาแห่งชาติ', '2026-01-01', '2026-01-01', 'PASS', 'CERT-003', ?, '2026-01-02'),
        ('WO-M3-CRT4', 'WO-M3-C04', 'AST-M3-CRT4', 2026, 'CYC-M3-CRT4', 'CLOSED', 'สถาบันมาตรวิทยาแห่งชาติ', '2026-01-01', '2026-01-01', 'PASS', 'CERT-004', ?, '2026-01-02')
    `).bind(expiredCertDate, expiringCertDate1, expiringCertDate2, validCertDate).run();

    const res = await call('GET', '/api/vcc/dashboard', 'DCC-M3');
    expect(res.status).toBe(200);

    const certKpi = res.body.certificate_kpi;
    expect(certKpi).toBeDefined();
    expect(certKpi.cert_expired_count).toBeGreaterThanOrEqual(1);
    expect(certKpi.cert_expiring_0_30_days).toBeGreaterThanOrEqual(1);
    expect(certKpi.cert_expiring_31_60_days).toBeGreaterThanOrEqual(1);
    expect(certKpi.cert_valid_count).toBeGreaterThanOrEqual(1);
    expect(certKpi.total_expiring_soon).toBe(certKpi.cert_expiring_0_30_days + certKpi.cert_expiring_31_60_days);

    // Alerts must contain CERT_EXPIRED and CERT_EXPIRING
    const expiredAlert = res.body.alerts.find((a) => a.asset_id === 'AST-M3-CRT1' && a.alert_type === 'CERT_EXPIRED');
    expect(expiredAlert).toBeDefined();
    expect(expiredAlert.severity).toBe('CRITICAL');

    const expiringAlert = res.body.alerts.find((a) => a.asset_id === 'AST-M3-CRT2' && a.alert_type === 'CERT_EXPIRING');
    expect(expiringAlert).toBeDefined();
  });

  it('4. ON_HOLD & NC Tracker: returns on-hold equipment, days on hold, impact assessment, and L5+ release permission', async () => {
    // Insert ON_HOLD asset with OPEN NC work order
    await env.DB.prepare(`
      INSERT INTO vcc_assets (id, asset_code, name, department, status, is_group, location, asset_type)
      VALUES ('AST-M3-HLD1', 'HLD-M3-001', 'Thermometer On Hold', 'QC', 'ON_HOLD', 0, 'Lab D', 'MEASURING_TOOL')
    `).run();

    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, asset_id, plan_year, cycle_id, status, provider_name, original_due_date, due_date,
        result_status, nc_status, performed_by, reviewed_by, updated_at
      ) VALUES (
        'WO-M3-HLD1', 'WO-M3-H01', 'AST-M3-HLD1', 2026, 'CYC-M3-HLD1', 'CLOSED', 'ห้องปฏิบัติการทวนสอบภายใน', '2026-02-01', '2026-02-01',
        'FAIL', 'OPEN', 'QC-L4-M3', 'QA-L5-M3', datetime('now', '-5 days')
      )
    `).run();

    // Also insert an audit log simulating impact assessment
    await env.DB.prepare(`
      INSERT INTO audit_log (actor_id, action, details)
      VALUES ('QA-L5-M3', 'VCC_WO_HOLD_RELEASED', '{"wo_id":"WO-M3-HLD1","impact_assessment":"Assessed past production batch A102 - no defect detected"}')
    `).run();

    // Call with L4 user (cannot release hold)
    const l4Res = await call('GET', '/api/vcc/on-hold-tracker', 'QC-L4-M3');
    expect(l4Res.status).toBe(200);
    const itemForL4 = l4Res.body.items.find((i) => i.asset_id === 'AST-M3-HLD1');
    expect(itemForL4).toBeDefined();
    expect(itemForL4.asset_code).toBe('HLD-M3-001');
    expect(itemForL4.nc_status).toBe('OPEN');
    expect(itemForL4.can_release_hold).toBe(false);
    expect(itemForL4.days_on_hold).toBeGreaterThanOrEqual(0);
    expect(itemForL4.impact_assessment).toContain('Assessed past production batch A102');

    // Call with L5 user (can release hold)
    const l5Res = await call('GET', '/api/vcc/on-hold-tracker', 'QA-L5-M3');
    expect(l5Res.status).toBe(200);
    const itemForL5 = l5Res.body.items.find((i) => i.asset_id === 'AST-M3-HLD1');
    expect(itemForL5).toBeDefined();
    expect(itemForL5.can_release_hold).toBe(true);
  });

  it('5. Compliance Report: filters by year, department, and verdict with full traceability', async () => {
    // Insert an amended pass work order
    await env.DB.prepare(`
      INSERT INTO vcc_assets (id, asset_code, name, department, status, is_group, location, asset_type)
      VALUES ('AST-M3-CMP1', 'CMP-M3-001', 'Pressure Transmitter Compliant', 'QC', 'ACTIVE', 0, 'Boiler Room', 'INSTRUMENT')
    `).run();

    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, asset_id, plan_year, cycle_id, status, provider_name, original_due_date, required_due_date, due_date,
        result_status, nc_status, is_amended, calibration_method, traceability_ref,
        certificate_no, certificate_valid_until, performed_at, performed_by, reviewed_by
      ) VALUES (
        'WO-M3-CMP1', 'WO-M3-P01', 'AST-M3-CMP1', 2026, 'CYC-M3-CMP1', 'CLOSED', 'ห้องปฏิบัติการทวนสอบภายใน', '2026-03-01', '2026-03-01', '2026-03-01',
        'PASS', 'RELEASED', 1, 'In-house WI-CAL-04', 'NIMT Standard Calibrator #TR-99',
        'CERT-CMP-001', '2027-03-01', '2026-03-01', 'QC-L4-M3', 'QA-L5-M3'
      )
    `).run();

    await env.DB.prepare(`
      INSERT INTO vcc_work_order_certificates (
        id, work_order_id, file_name, file_key, file_hash, file_size, version, uploaded_by
      ) VALUES (
        'WOC-M3-01', 'WO-M3-CMP1', 'cert_cmp_001.pdf', 'vcc/certs/WO-M3-CMP1/v1.pdf',
        '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', 12345, 1, 'QC-L4-M3'
      )
    `).run();

    // Query compliance report as DCC
    const res = await call('GET', '/api/vcc/compliance-report?year=2026&department=QC', 'DCC-M3');
    expect(res.status).toBe(200);

    const record = res.body.records.find((r) => r.wo_code === 'WO-M3-P01');
    expect(record).toBeDefined();
    expect(record.asset_code).toBe('CMP-M3-001');
    expect(record.verdict).toBe('COMPLIANT_AMENDED');
    expect(record.calibration_method).toBe('In-house WI-CAL-04');
    expect(record.traceability_ref).toBe('NIMT Standard Calibrator #TR-99');
    expect(record.cert_sha256_hash).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
    expect(record.performed_by_name).toBe('QC Performer');
    expect(record.reviewed_by_name).toBe('QA Manager');

    // Summary counts
    expect(res.body.summary.total_records).toBeGreaterThanOrEqual(1);
    expect(res.body.summary.compliant_count).toBeGreaterThanOrEqual(1);
    expect(res.body.summary.compliance_rate).toBeGreaterThan(0);
  });

  it('6. Compliance Report RBAC: Department isolation strictly prevents non-DCC user from seeing unauthorized departments', async () => {
    // QA-L4-M3 user (department QA only) queries QC department
    const res = await call('GET', '/api/vcc/compliance-report?year=2026&department=QC', 'QA-L4-M3');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('แผนก QC');
  });

  it('7. CSV Export: returns UTF-8 BOM, sanitizes formula injection, and records audit trail', async () => {
    // Insert a work order with potential formula injection in asset name or calibration method
    await env.DB.prepare(`
      INSERT INTO vcc_assets (id, asset_code, name, department, status, is_group, location, asset_type)
      VALUES ('AST-M3-INJ1', 'INJ-M3-001', '=HYPERLINK("evil.com")', 'QC', 'ACTIVE', 0, 'Lab E', 'MEASURING_TOOL')
    `).run();

    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, asset_id, plan_year, cycle_id, status, provider_name, original_due_date, due_date,
        result_status, calibration_method
      ) VALUES (
        'WO-M3-INJ1', 'WO-M3-I01', 'AST-M3-INJ1', 2026, 'CYC-M3-INJ1', 'SCHEDULED', 'ห้องปฏิบัติการทวนสอบภายใน', '2026-04-01', '2026-04-01',
        'PENDING', '+CMD|'' /C calc''!A0'
      )
    `).run();

    const res = await call('GET', '/api/vcc/export/compliance-report?year=2026&department=QC', 'DCC-M3');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('VCC_Compliance_Report_2026.csv');

    // Check UTF-8 BOM in binary bytes
    expect(res.bytes[0]).toBe(0xEF);
    expect(res.bytes[1]).toBe(0xBB);
    expect(res.bytes[2]).toBe(0xBF);

    const csvText = res.text;
    // Formula injection must be prefixed with single quote
    expect(csvText).toContain("\"'=HYPERLINK(\"\"evil.com\"\")\"");
    expect(csvText).toContain("\"'+CMD|' /C calc'!A0\"");

    // Audit log entry must be present
    const auditRow = await env.DB.prepare(`
      SELECT * FROM audit_log WHERE action = 'VCC_EXPORT_COMPLIANCE_REPORT' ORDER BY id DESC LIMIT 1
    `).first();
    expect(auditRow).toBeDefined();
    expect(auditRow.actor_id).toBe('DCC-M3');
  });

  it('8. Read-Only Safety Guarantee: Dashboard and Compliance Report requests execute 0 database mutations', async () => {
    const assetCountBefore = (await env.DB.prepare('SELECT COUNT(*) as c FROM vcc_assets').first()).c;
    const woCountBefore = (await env.DB.prepare('SELECT COUNT(*) as c FROM vcc_work_orders').first()).c;

    // Call dashboard, on-hold tracker, compliance report
    await call('GET', '/api/vcc/dashboard', 'DCC-M3');
    await call('GET', '/api/vcc/on-hold-tracker', 'DCC-M3');
    await call('GET', '/api/vcc/compliance-report?year=2026', 'DCC-M3');

    const assetCountAfter = (await env.DB.prepare('SELECT COUNT(*) as c FROM vcc_assets').first()).c;
    const woCountAfter = (await env.DB.prepare('SELECT COUNT(*) as c FROM vcc_work_orders').first()).c;

    expect(assetCountAfter).toBe(assetCountBefore);
    expect(woCountAfter).toBe(woCountBefore);
  });

  it('9. Dashboard RBAC: non-DCC user is strictly isolated to authorized department with negative checks', async () => {
    // Insert QA-specific asset and work order
    await env.DB.prepare(`
      INSERT INTO vcc_assets (id, asset_code, name, department, status, is_group, location, asset_type)
      VALUES ('AST-M3-QA01', 'QA-M3-001', 'QA Standard Block', 'QA', 'ACTIVE', 0, 'QA Lab', 'STANDARD_GAUGE')
    `).run();

    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, asset_id, plan_year, cycle_id, status, provider_name, original_due_date, due_date,
        result_status
      ) VALUES (
        'WO-M3-QA01', 'WO-M3-QA1', 'AST-M3-QA01', 2026, 'CYC-M3-QA1', 'SCHEDULED', 'ห้องปฏิบัติการทวนสอบภายใน', '2026-05-01', '2026-05-01',
        'PENDING'
      )
    `).run();

    // 1. QA-L4-M3 (department QA only) calls dashboard
    const qaRes = await call('GET', '/api/vcc/dashboard', 'QA-L4-M3');
    expect(qaRes.status).toBe(200);

    // Negative check: alerts must NEVER contain any QC item for QA user
    expect(qaRes.body.alerts.length).toBeGreaterThan(0);
    for (const a of qaRes.body.alerts) {
      expect(a.department).toBe('QA');
    }

    // Negative check: department_breakdown must only contain QA, never QC
    const deptCodes = qaRes.body.department_breakdown.map((d) => d.department);
    expect(deptCodes).toContain('QA');
    expect(deptCodes).not.toContain('QC');

    // Negative check: QA user querying QC explicitly receives 403 Forbidden
    const forbiddenRes = await call('GET', '/api/vcc/dashboard?department=QC', 'QA-L4-M3');
    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.error).toContain('แผนก QC');

    // 2. DCC user calls dashboard: sees consolidated cross-department data
    const dccRes = await call('GET', '/api/vcc/dashboard', 'DCC-M3');
    expect(dccRes.status).toBe(200);
    const dccDeptCodes = dccRes.body.department_breakdown.map((d) => d.department);
    expect(dccDeptCodes).toContain('QC');
    expect(dccDeptCodes).toContain('QA');

    // DCC can filter department without error
    const dccQcRes = await call('GET', '/api/vcc/dashboard?department=QC', 'DCC-M3');
    expect(dccQcRes.status).toBe(200);
  });

  it('10. Compliance Report Summary: accurately calculated post-filters and reports N/A when zero records match', async () => {
    // 1. Filter by verdict=COMPLIANT_AMENDED (matches WO-M3-P01)
    const amendedRes = await call('GET', '/api/vcc/compliance-report?year=2026&verdict=COMPLIANT_AMENDED', 'DCC-M3');
    expect(amendedRes.status).toBe(200);
    expect(amendedRes.body.records.length).toBeGreaterThanOrEqual(1);
    expect(amendedRes.body.summary.total_records).toBe(amendedRes.body.records.length);
    expect(amendedRes.body.summary.compliant_amended_count).toBe(amendedRes.body.records.length);
    expect(amendedRes.body.summary.non_compliant_overdue_count).toBe(0);
    expect(amendedRes.body.summary.non_compliant_hold_count).toBe(0);
    expect(amendedRes.body.summary.compliance_rate).toBe(100);

    // 2. Filter with criteria that yields 0 records (e.g. year=2099)
    const zeroRes = await call('GET', '/api/vcc/compliance-report?year=2099', 'DCC-M3');
    expect(zeroRes.status).toBe(200);
    expect(zeroRes.body.records.length).toBe(0);
    expect(zeroRes.body.summary.total_records).toBe(0);
    expect(zeroRes.body.summary.compliant_count).toBe(0);
    expect(zeroRes.body.summary.compliance_rate).toBeNull();
    expect(zeroRes.body.summary.compliance_rate_label).toBe('N/A');
  });
});
