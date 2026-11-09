import { installVccTestConfiguration } from './test/vccConfigurationFixture.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';
import { runVccNotificationSweep } from './vccNotifications.js';

describe('VCC Phase 3.4: Automated Notification & Escalation Engine Tests', () => {
  let proxy;
  let env;
  const tokens = {};
  const PASSWORD = 'notif-test-pass-123456';

  const cleanupTestData = async (db) => {
    if (!db) return;
    try {
      await db.prepare("DELETE FROM vcc_notifications WHERE id LIKE 'NTF-N4-%' OR dedup_key LIKE '%N4%'").run();
      await db.prepare("DELETE FROM vcc_work_order_certificates WHERE work_order_id LIKE 'WO-N4-%'").run();
      await db.prepare("UPDATE vcc_work_orders SET status = 'CANCELLED', certificate_no = NULL WHERE id LIKE 'WO-N4-%'").run();
      await db.prepare("DELETE FROM vcc_work_orders WHERE id LIKE 'WO-N4-%'").run();
      await db.prepare("DELETE FROM vcc_assets WHERE id LIKE 'AST-N4-%'").run();
      await db.prepare("DELETE FROM users WHERE id LIKE '%-N4'").run();
      await db.prepare("DELETE FROM departments WHERE code LIKE 'N4%'").run();
    } catch {
      // ignore
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

    // Seed dedicated isolated departments and users for N4 tests
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('N4QC', 'ควบคุมคุณภาพ N4QC', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('N4QA', 'ประกันคุณภาพ N4QA', 'ACTIVE')"),

      // DCC user (admin)
      env.DB.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
        VALUES ('DCC-N4', 'DCC Master', 'dcc.n4@vcc.local', ?, 'DCC', 5, 'QC', '["QC","N4QC","N4QA"]', 1)
      `).bind(hash),

      // QC L4 user (Performer / Lead)
      env.DB.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
        VALUES ('QC-L4-N4', 'QC Performer', 'qc.l4.n4@vcc.local', ?, 'USER', 4, 'QC', '["QC","N4QC"]', 0)
      `).bind(hash),

      // QC L5 user (Manager / Approver)
      env.DB.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
        VALUES ('QC-L5-N4', 'QC Manager', 'qc.l5.n4@vcc.local', ?, 'MANAGER', 5, 'QC', '["QC","N4QC"]', 0)
      `).bind(hash),

      // QA L5 user (Manager / Approver)
      env.DB.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
        VALUES ('QA-L5-N4', 'QA Manager', 'qa.l5.n4@vcc.local', ?, 'MANAGER', 5, 'QA', '["QA","N4QA"]', 0)
      `).bind(hash),

      // QMR L6 user (Executive / Final Escalation)
      env.DB.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc, is_qmr)
        VALUES ('QMR-L6-N4', 'QMR Executive', 'qmr.l6.n4@vcc.local', ?, 'EXECUTIVE', 6, 'QA', '["QA","N4QC","N4QA"]', 0, 1)
      `).bind(hash),

      // QA L4 user (non-DCC, authorized for QA department only)
      env.DB.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
        VALUES ('QA-L4-N4', 'QA Officer', 'qa.l4.n4@vcc.local', ?, 'USER', 4, 'QA', '["QA","N4QA"]', 0)
      `).bind(hash)
    ]);

    await installVccTestConfiguration(env.DB, ["N4QC", "N4QA"]);

    for (const id of ['DCC-N4', 'QC-L4-N4', 'QC-L5-N4', 'QA-L5-N4', 'QMR-L6-N4', 'QA-L4-N4']) {
      const email = `${id.toLowerCase().replace(/-/g, '.')}@vcc.local`;
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
    await cleanupTestData(env.DB);
    await proxy?.dispose();
  });

  it('1. Deduplication Invariance: Concurrent sweeps produce 0 duplicate notifications', async () => {
    const today = '2026-11-01';

    // Insert asset & work order due in 5 days (DUE_SOON_7)
    await env.DB.prepare(`
      INSERT INTO vcc_assets (id, asset_code, name, department, status, is_group, location, asset_type)
      VALUES ('AST-N4-DEDUP1', 'CAL-N4-001', 'Vernier Caliper Dedup', 'N4QC', 'ACTIVE', 0, 'Lab 1', 'MEASURING_TOOL')
    `).run();

    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, asset_id, plan_year, cycle_id, status, provider_name, original_due_date, required_due_date, due_date, result_status
      ) VALUES (
        'WO-N4-DEDUP1', 'WO-N4-D01', 'AST-N4-DEDUP1', 2026, 'CYC-N4-001', 'SCHEDULED', 'ห้องปฏิบัติการทวนสอบภายใน',
        '2026-11-06', '2026-11-06', '2026-11-06', 'PENDING'
      )
    `).run();

    // Run 5 sweeps concurrently
    const sweeps = await Promise.all([
      runVccNotificationSweep(env.DB, { nowDate: today }),
      runVccNotificationSweep(env.DB, { nowDate: today }),
      runVccNotificationSweep(env.DB, { nowDate: today }),
      runVccNotificationSweep(env.DB, { nowDate: today }),
      runVccNotificationSweep(env.DB, { nowDate: today })
    ]);

    // Check count in DB
    const { results: notifs } = await env.DB.prepare(`
      SELECT * FROM vcc_notifications WHERE work_order_id = 'WO-N4-DEDUP1'
    `).all();

    expect(notifs.length).toBe(1);
    expect(notifs[0].notification_type).toBe('DUE_SOON_7');
    expect(notifs[0].status).toBe('PENDING');
    expect(notifs[0].severity).toBe('CRITICAL');
  });

  it('2. Multi-tier Due Soon: classifies thresholds and supersedes earlier alerts as deadline approaches', async () => {
    await env.DB.prepare(`
      INSERT INTO vcc_assets (id, asset_code, name, department, status, is_group, location, asset_type)
      VALUES
        ('AST-N4-DS30', 'DS-N4-001', 'Micrometer DS30', 'N4QC', 'ACTIVE', 0, 'Lab 2', 'MEASURING_TOOL'),
        ('AST-N4-DS14', 'DS-N4-002', 'Micrometer DS14', 'N4QC', 'ACTIVE', 0, 'Lab 2', 'MEASURING_TOOL')
    `).run();

    // 25 days left -> DUE_SOON_30, 10 days left -> DUE_SOON_14
    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, asset_id, plan_year, cycle_id, status, provider_name, original_due_date, required_due_date, due_date, result_status
      ) VALUES
        ('WO-N4-DS30', 'WO-N4-S30', 'AST-N4-DS30', 2026, 'CYC-N4-S30', 'SCHEDULED', 'แล็บภายใน', '2026-11-26', '2026-11-26', '2026-11-26', 'PENDING'),
        ('WO-N4-DS14', 'WO-N4-S14', 'AST-N4-DS14', 2026, 'CYC-N4-S14', 'SCHEDULED', 'แล็บภายใน', '2026-11-11', '2026-11-11', '2026-11-11', 'PENDING')
    `).run();

    await runVccNotificationSweep(env.DB, { nowDate: '2026-11-01' });

    const n30 = await env.DB.prepare("SELECT * FROM vcc_notifications WHERE work_order_id = 'WO-N4-DS30'").first();
    expect(n30.notification_type).toBe('DUE_SOON_30');
    expect(n30.severity).toBe('INFO');

    const n14 = await env.DB.prepare("SELECT * FROM vcc_notifications WHERE work_order_id = 'WO-N4-DS14'").first();
    expect(n14.notification_type).toBe('DUE_SOON_14');
    expect(n14.severity).toBe('WARNING');

    // Fast-forward date so WO-N4-DS14 is now 5 days left -> should advance to DUE_SOON_7 and resolve DUE_SOON_14
    await runVccNotificationSweep(env.DB, { nowDate: '2026-11-06' });

    const activeN14 = await env.DB.prepare("SELECT * FROM vcc_notifications WHERE work_order_id = 'WO-N4-DS14' AND status = 'PENDING'").first();
    expect(activeN14.notification_type).toBe('DUE_SOON_7');
    expect(activeN14.severity).toBe('CRITICAL');

    const resolvedN14 = await env.DB.prepare("SELECT * FROM vcc_notifications WHERE work_order_id = 'WO-N4-DS14' AND notification_type = 'DUE_SOON_14'").first();
    expect(resolvedN14.status).toBe('RESOLVED');
    expect(resolvedN14.resolved_reason).toBe('SUPERSEDED_BY_CLOSER_DEADLINE');
  });

  it('3. Overdue Invariance & Multi-tier Escalation: L1 -> L2 -> L3 with ON_HOLD recommendation (no auto status change)', async () => {
    // Required due date 2026-10-15, but rescheduled to 2026-11-20 in future
    await env.DB.prepare(`
      INSERT INTO vcc_assets (id, asset_code, name, department, status, is_group, location, asset_type)
      VALUES ('AST-N4-OVR1', 'OVR-N4-001', 'Pressure Gauge Overdue', 'N4QC', 'ACTIVE', 0, 'Boiler', 'MEASURING_TOOL')
    `).run();

    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, asset_id, plan_year, cycle_id, status, provider_name, original_due_date, required_due_date, due_date, result_status
      ) VALUES (
        'WO-N4-OVR1', 'WO-N4-O01', 'AST-N4-OVR1', 2026, 'CYC-N4-O01', 'SCHEDULED', 'แล็บภายใน',
        '2026-10-15', '2026-10-15', '2026-11-20', 'PENDING'
      )
    `).run();

    // 1. Day 2026-10-18: 3 days overdue -> OVERDUE_L1 (WARNING, Performer)
    await runVccNotificationSweep(env.DB, { nowDate: '2026-10-18' });
    const notifL1 = await env.DB.prepare("SELECT * FROM vcc_notifications WHERE work_order_id = 'WO-N4-OVR1' AND status = 'PENDING'").first();
    expect(notifL1.notification_type).toBe('OVERDUE_L1');
    expect(notifL1.escalation_level).toBe(1);
    expect(notifL1.severity).toBe('WARNING');
    expect(notifL1.target_role).toBe('PERFORMER');

    // 2. Day 2026-10-25: 10 days overdue -> OVERDUE_L2_ESCALATED (CRITICAL, Manager L5, DCC)
    await runVccNotificationSweep(env.DB, { nowDate: '2026-10-25' });
    const notifL2 = await env.DB.prepare("SELECT * FROM vcc_notifications WHERE work_order_id = 'WO-N4-OVR1' AND status = 'PENDING'").first();
    expect(notifL2.notification_type).toBe('OVERDUE_L2_ESCALATED');
    expect(notifL2.escalation_level).toBe(2);
    expect(notifL2.severity).toBe('CRITICAL');
    expect(notifL2.target_role).toBe('MANAGER_L5');

    // 3. Day 2026-10-31: 16 days overdue -> OVERDUE_L3_CRITICAL (CRITICAL, QMR L6, recommends ON_HOLD)
    await runVccNotificationSweep(env.DB, { nowDate: '2026-10-31' });
    const notifL3 = await env.DB.prepare("SELECT * FROM vcc_notifications WHERE work_order_id = 'WO-N4-OVR1' AND status = 'PENDING'").first();
    expect(notifL3.notification_type).toBe('OVERDUE_L3_CRITICAL');
    expect(notifL3.escalation_level).toBe(3);
    expect(notifL3.severity).toBe('CRITICAL');
    expect(notifL3.target_role).toBe('QMR_L6');
    expect(notifL3.title).toContain('เสนอติดป้าย ON_HOLD');

    // Rule 2 verification: Asset status MUST REMAIN 'ACTIVE' (no auto status mutation from escalation)
    const assetRow = await env.DB.prepare("SELECT status FROM vcc_assets WHERE id = 'AST-N4-OVR1'").first();
    expect(assetRow.status).toBe('ACTIVE');
  });

  it('4. Acknowledgement Flow & Grace Period Safety: suppresses repeat alerting but protects Critical Escalation', async () => {
    // Dedicated work order for acknowledgement testing
    await env.DB.prepare(`
      INSERT INTO vcc_assets (id, asset_code, name, department, status, is_group, location, asset_type)
      VALUES ('AST-N4-ACK1', 'ACK-N4-001', 'Scale for Acknowledgement', 'N4QC', 'ACTIVE', 0, 'Lab 4', 'MEASURING_TOOL')
    `).run();

    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, asset_id, plan_year, cycle_id, status, provider_name, original_due_date, required_due_date, due_date, result_status
      ) VALUES (
        'WO-N4-ACK1', 'WO-N4-A01', 'AST-N4-ACK1', 2026, 'CYC-N4-A01', 'SCHEDULED', 'แล็บภายใน',
        '2026-10-15', '2026-10-15', '2026-10-15', 'PENDING'
      )
    `).run();

    // 1. Day 2026-10-18: 3 days overdue -> OVERDUE_L1 (PENDING)
    await runVccNotificationSweep(env.DB, { nowDate: '2026-10-18' });

    const pendingNotif = await env.DB.prepare("SELECT * FROM vcc_notifications WHERE work_order_id = 'WO-N4-ACK1' AND status = 'PENDING'").first();
    expect(pendingNotif).toBeDefined();

    const ackRes = await call('POST', `/api/vcc/notifications/${pendingNotif.id}/acknowledge`, 'QC-L4-N4', {
      note: 'ติดต่อห้องปฏิบัติการสอบเทียบแล้ว นัดส่งเครื่องมือ 22 ต.ค.'
    });
    expect(ackRes.status).toBe(200);
    expect(ackRes.body.notification.status).toBe('ACKNOWLEDGED');
    expect(ackRes.body.notification.acknowledged_by_name).toBe('QC Performer');
    expect(ackRes.body.notification.acknowledgement_note).toContain('นัดส่งเครื่องมือ');

    // Constraint verification: Work Order and Asset state remain UNCHANGED
    const woCheck = await env.DB.prepare("SELECT status FROM vcc_work_orders WHERE id = 'WO-N4-ACK1'").first();
    expect(woCheck.status).toBe('SCHEDULED');

    // 2. Audit log entry recorded
    const auditRow = await env.DB.prepare(`
      SELECT * FROM audit_log WHERE action = 'VCC_NOTIFICATION_ACKNOWLEDGED' ORDER BY id DESC LIMIT 1
    `).first();
    expect(auditRow).toBeDefined();
    expect(auditRow.actor_id).toBe('QC-L4-N4');

    // 3. Sweep on Day 2026-10-20 (2 days after ack, within 3 days grace period) -> remains ACKNOWLEDGED
    await runVccNotificationSweep(env.DB, { nowDate: '2026-10-20' });
    const ackNotifCheck = await env.DB.prepare("SELECT status FROM vcc_notifications WHERE id = ?").bind(pendingNotif.id).first();
    expect(ackNotifCheck.status).toBe('ACKNOWLEDGED');

    // 4. Critical Escalation Invariance: When Overdue reaches 16 days (L3 Critical), escalation occurs regardless of previous acks
    await runVccNotificationSweep(env.DB, { nowDate: '2026-10-31' });
    const l3Notif = await env.DB.prepare("SELECT * FROM vcc_notifications WHERE work_order_id = 'WO-N4-ACK1' AND notification_type = 'OVERDUE_L3_CRITICAL'").first();
    expect(l3Notif).toBeDefined();
    expect(l3Notif.severity).toBe('CRITICAL');
  });

  it('5. Separation of Lifecycles: Work Order CLOSED resolves WO alerts but leaves active NC and Cert Expiry alerts intact', async () => {
    // Insert asset with:
    // (a) Scheduled work order (Due soon)
    // (b) Expired certificate from past work order
    // (c) ON_HOLD status with open NC
    await env.DB.prepare(`
      INSERT INTO vcc_assets (id, asset_code, name, department, status, is_group, location, asset_type)
      VALUES ('AST-N4-SEP1', 'SEP-N4-001', 'Multi Risk Instrument', 'N4QC', 'ON_HOLD', 0, 'Lab 3', 'MEASURING_TOOL')
    `).run();

    // Work order 1: Closed with expired certificate
    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, asset_id, plan_year, cycle_id, status, provider_name, original_due_date, due_date,
        result_status, nc_status, certificate_no, certificate_valid_until, performed_at
      ) VALUES (
        'WO-N4-PAST1', 'WO-N4-P01', 'AST-N4-SEP1', 2025, 'CYC-N4-P01', 'CLOSED', 'แล็บเดิม',
        '2025-01-01', '2025-01-01', 'PASS', 'RELEASED', 'CERT-OLD-01', '2026-10-01', '2025-01-02'
      )
    `).run();

    // Work order 2: Scheduled in progress with open NC
    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, asset_id, plan_year, cycle_id, status, provider_name, original_due_date, required_due_date, due_date,
        result_status, nc_status, performed_at
      ) VALUES (
        'WO-N4-CURR1', 'WO-N4-C01', 'AST-N4-SEP1', 2026, 'CYC-N4-C01', 'IN_PROGRESS', 'แล็บปัจจุบัน',
        '2026-11-05', '2026-11-05', '2026-11-05', 'FAIL', 'OPEN', '2026-10-20'
      )
    `).run();

    // Run sweep on 2026-11-01 -> generates Due Soon 7d, Cert Expired, and NC On Hold Action
    await runVccNotificationSweep(env.DB, { nowDate: '2026-11-01' });

    const woNotif = await env.DB.prepare("SELECT * FROM vcc_notifications WHERE work_order_id = 'WO-N4-CURR1' AND status = 'PENDING'").first();
    expect(woNotif.notification_type).toBe('DUE_SOON_7');

    const certNotif = await env.DB.prepare("SELECT * FROM vcc_notifications WHERE asset_id = 'AST-N4-SEP1' AND notification_type = 'CERT_EXPIRED' AND status = 'PENDING'").first();
    expect(certNotif).toBeDefined();

    const ncNotif = await env.DB.prepare("SELECT * FROM vcc_notifications WHERE asset_id = 'AST-N4-SEP1' AND notification_type LIKE 'NC_ON_HOLD_%' AND status = 'PENDING'").first();
    expect(ncNotif).toBeDefined();

    // Step B: Work Order WO-N4-CURR1 is CLOSED
    await env.DB.prepare("UPDATE vcc_work_orders SET status = 'CLOSED' WHERE id = 'WO-N4-CURR1'").run();

    // Run sweep again
    await runVccNotificationSweep(env.DB, { nowDate: '2026-11-02' });

    // WO alert MUST BE RESOLVED
    const woNotifAfter = await env.DB.prepare("SELECT * FROM vcc_notifications WHERE id = ?").bind(woNotif.id).first();
    expect(woNotifAfter.status).toBe('RESOLVED');
    expect(woNotifAfter.resolved_reason).toBe('WORK_ORDER_COMPLETED');

    // Rule verification: CERT alert and NC alert MUST STILL BE PENDING!
    const certNotifAfter = await env.DB.prepare("SELECT * FROM vcc_notifications WHERE id = ?").bind(certNotif.id).first();
    expect(certNotifAfter.status).toBe('PENDING');

    const ncNotifAfter = await env.DB.prepare("SELECT * FROM vcc_notifications WHERE id = ?").bind(ncNotif.id).first();
    expect(ncNotifAfter.status).toBe('PENDING');
  });

  it('6. Multi-Department RBAC & Task Inbox Slicing: strictly enforces department boundaries and approval levels', async () => {
    // 1. QA-L4-N4 (department N4QA only) queries notifications
    const qaRes = await call('GET', '/api/vcc/notifications', 'QA-L4-N4');
    expect(qaRes.status).toBe(200);
    // Negative check: alerts must NEVER contain N4QC items for QA user
    for (const n of qaRes.body.notifications) {
      expect(n.department).not.toBe('N4QC');
    }

    // Negative check: QA user querying N4QC explicitly receives 403 Forbidden
    const forbiddenRes = await call('GET', '/api/vcc/notifications?department=N4QC', 'QA-L4-N4');
    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.error).toContain('แผนก N4QC');

    // 2. Task Inbox integration via GET /api/vcc/tasks
    // Insert an active L3 Critical notification in N4QC
    const notifL3 = await env.DB.prepare("SELECT * FROM vcc_notifications WHERE notification_type = 'OVERDUE_L3_CRITICAL' AND status != 'RESOLVED'").first();
    expect(notifL3).toBeDefined();

    // Performer in N4QC sees Level 1 alerts, but does NOT see L3 Critical Escalation task
    const perfTasksRes = await call('GET', '/api/vcc/tasks', 'QC-L4-N4');
    const perfL3Task = perfTasksRes.body.tasks.find((t) => t.notificationId === notifL3.id);
    expect(perfL3Task).toBeUndefined();

    // Manager / QMR (QMR-L6-N4) sees L3 Critical Escalation task in Task Inbox!
    const qmrTasksRes = await call('GET', '/api/vcc/tasks', 'QMR-L6-N4');
    const qmrL3Task = qmrTasksRes.body.tasks.find((t) => t.notificationId === notifL3.id);
    expect(qmrL3Task).toBeDefined();
    expect(qmrL3Task.taskType).toBe('VCC_NOTIFICATION_ALERT');
    expect(qmrL3Task.severity).toBe('CRITICAL');
    expect(qmrL3Task.escalation_level).toBe(3);
  });

  it('7. Paperless CSV Export: returns UTF-8 BOM, sanitizes formula injection, and records audit trail', async () => {
    // Insert notification with formula injection characters in asset name or note
    const notifId = `NTF-N4-INJ-${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO vcc_notifications (
        id, dedup_key, notification_type, reference_type, reference_id,
        asset_id, department, title, message, status, acknowledgement_note
      ) VALUES (
        ?, 'INJ:N4:01', 'OVERDUE_L1', 'VCC_ASSET', 'AST-N4-OVR1',
        'AST-N4-OVR1', 'N4QC', '=HYPERLINK("evil.com")', '+CMD|'' /C calc''!A0', 'ACKNOWLEDGED', '@EVIL_NOTE'
      )
    `).bind(notifId).run();

    const exportRes = await call('GET', '/api/vcc/export/notifications-audit?department=N4QC', 'DCC-N4');
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get('Content-Type')).toContain('text/csv');
    expect(exportRes.headers.get('Content-Disposition')).toContain('VCC_Notification_Audit_');

    // UTF-8 BOM
    expect(exportRes.bytes[0]).toBe(0xEF);
    expect(exportRes.bytes[1]).toBe(0xBB);
    expect(exportRes.bytes[2]).toBe(0xBF);

    // Formula injection sanitization check
    expect(exportRes.text).toContain("\"'@EVIL_NOTE\"");

    // Audit log verification
    const auditRow = await env.DB.prepare(`
      SELECT * FROM audit_log WHERE action = 'VCC_EXPORT_NOTIFICATION_AUDIT' ORDER BY id DESC LIMIT 1
    `).first();
    expect(auditRow).toBeDefined();
    expect(auditRow.actor_id).toBe('DCC-N4');
  });

  const insertAsset = (id, code, status = 'ACTIVE', holdStartedAt = null) =>
    env.DB.prepare(`
      INSERT INTO vcc_assets (id, asset_code, name, department, status, is_group, location, asset_type, hold_started_at)
      VALUES (?, ?, ?, 'N4QC', ?, 0, 'Lab R', 'MEASURING_TOOL', ?)
    `).bind(id, code, `Remediation ${code}`, status, holdStartedAt).run();

  const pendingOf = (assetId, like) =>
    env.DB.prepare("SELECT * FROM vcc_notifications WHERE asset_id = ? AND notification_type LIKE ? AND status != 'RESOLVED'")
      .bind(assetId, like).all().then((r) => r.results);

  it('9. P1-1 Certificate renewal: next expiry cycle re-alerts, old episode kept, no duplicates within an episode', async () => {
    await insertAsset('AST-N4-CERT2', 'CERT-N4-002');
    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, asset_id, plan_year, cycle_id, status, provider_name, original_due_date, due_date,
        result_status, nc_status, certificate_no, certificate_valid_until, performed_at
      ) VALUES ('WO-N4-CERT2', 'WO-N4-CT2', 'AST-N4-CERT2', 2026, 'CYC-N4-CT2', 'CLOSED', 'แล็บ', '2026-01-01', '2026-01-01',
        'PASS', 'RELEASED', 'CERT-R-1', '2026-12-01', '2026-01-02')
    `).run();

    // 30 days left -> the 30-day tier (smallest matching threshold), not the 60-day tier
    await runVccNotificationSweep(env.DB, { nowDate: '2026-11-01' });
    const first = await pendingOf('AST-N4-CERT2', 'CERT_EXPIRING_%');
    expect(first.map((n) => n.notification_type)).toEqual(['CERT_EXPIRING_30']);

    // Certificate renewed for a year -> alert resolved
    await env.DB.prepare("UPDATE vcc_work_orders SET certificate_valid_until = '2027-12-01' WHERE id = 'WO-N4-CERT2'").run();
    await runVccNotificationSweep(env.DB, { nowDate: '2026-11-02' });
    const resolved = await env.DB.prepare('SELECT * FROM vcc_notifications WHERE id = ?').bind(first[0].id).first();
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolved_reason).toBe('CERTIFICATE_RENEWED');

    // A year later the renewed certificate nears expiry -> NEW alert, even under concurrent sweeps
    await Promise.all([1, 2, 3, 4].map(() => runVccNotificationSweep(env.DB, { nowDate: '2027-11-10' })));
    const reopened = await pendingOf('AST-N4-CERT2', 'CERT_EXPIRING_%');
    expect(reopened.length).toBe(1);
    expect(reopened[0].notification_type).toBe('CERT_EXPIRING_30');
    expect(reopened[0].id).not.toBe(first[0].id);

    // History of the old episode is preserved
    const all = await env.DB.prepare("SELECT status FROM vcc_notifications WHERE asset_id = 'AST-N4-CERT2'").all();
    expect(all.results.filter((n) => n.status === 'RESOLVED').length).toBe(1);
  });

  it('10. P1-1 ON_HOLD/NC second episode: re-hold after release alerts again and keeps the first episode', async () => {
    await insertAsset('AST-N4-NC2', 'NC-N4-002', 'ON_HOLD', '2026-10-01');
    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (id, wo_code, asset_id, plan_year, cycle_id, status, provider_name, original_due_date, due_date,
        result_status, nc_status, performed_at)
      VALUES ('WO-N4-NC2A', 'WO-N4-N2A', 'AST-N4-NC2', 2026, 'CYC-N4-N2A', 'PENDING_REVIEW', 'แล็บ', '2026-10-01', '2026-10-01',
        'FAIL', 'OPEN', '2026-10-01')
    `).run();
    await runVccNotificationSweep(env.DB, { nowDate: '2026-10-05' });
    const ep1 = await pendingOf('AST-N4-NC2', 'NC_ON_HOLD_%');
    expect(ep1.length).toBe(1);

    // Hold released
    await env.DB.prepare("UPDATE vcc_work_orders SET nc_status = 'RELEASED' WHERE id = 'WO-N4-NC2A'").run();
    await env.DB.prepare("UPDATE vcc_assets SET status = 'ACTIVE', hold_started_at = NULL WHERE id = 'AST-N4-NC2'").run();
    await runVccNotificationSweep(env.DB, { nowDate: '2026-10-06' });
    expect((await pendingOf('AST-N4-NC2', 'NC_ON_HOLD_%')).length).toBe(0);

    // Held again (new FAIL) -> a fresh alert
    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (id, wo_code, asset_id, plan_year, cycle_id, status, provider_name, original_due_date, due_date,
        result_status, nc_status, performed_at)
      VALUES ('WO-N4-NC2B', 'WO-N4-N2B', 'AST-N4-NC2', 2026, 'CYC-N4-N2B', 'PENDING_REVIEW', 'แล็บ', '2026-10-20', '2026-10-20',
        'FAIL', 'OPEN', '2026-10-20')
    `).run();
    await env.DB.prepare("UPDATE vcc_assets SET status = 'ON_HOLD', hold_started_at = '2026-10-20' WHERE id = 'AST-N4-NC2'").run();
    await runVccNotificationSweep(env.DB, { nowDate: '2026-10-21' });
    const ep2 = await pendingOf('AST-N4-NC2', 'NC_ON_HOLD_%');
    expect(ep2.length).toBe(1);
    expect(ep2[0].id).not.toBe(ep1[0].id);
    const old = await env.DB.prepare('SELECT status FROM vcc_notifications WHERE id = ?').bind(ep1[0].id).first();
    expect(old.status).toBe('RESOLVED');
  });

  it('11. P1-2 ON_HOLD duration counts from hold_started_at, not from work-order edits or today', async () => {
    await insertAsset('AST-N4-NC3', 'NC-N4-003', 'ON_HOLD', '2026-10-01');
    // A FAIL work order that was edited recently must not restart the clock
    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (id, wo_code, asset_id, plan_year, cycle_id, status, provider_name, original_due_date, due_date,
        result_status, nc_status, performed_at, updated_at)
      VALUES ('WO-N4-NC3A', 'WO-N4-N3A', 'AST-N4-NC3', 2026, 'CYC-N4-N3A', 'PENDING_REVIEW', 'แล็บ', '2026-10-15', '2026-10-15',
        'FAIL', 'OPEN', NULL, '2026-10-19T08:00:00Z')
    `).run();
    // Manually held asset without any FAIL work order must still escalate
    await insertAsset('AST-N4-NC4', 'NC-N4-004', 'ON_HOLD', '2026-10-01');

    await runVccNotificationSweep(env.DB, { nowDate: '2026-10-20' });
    for (const assetId of ['AST-N4-NC3', 'AST-N4-NC4']) {
      const n = await pendingOf(assetId, 'NC_ON_HOLD_%');
      expect(n.length).toBe(1);
      expect(n[0].notification_type).toBe('NC_ON_HOLD_ESCALATED');
      expect(n[0].days_offset).toBe(19);
    }
  });

  it('12. P2-4 Acknowledge enforces department and escalation level at the backend', async () => {
    await insertAsset('AST-N4-ACK2', 'ACK-N4-002');
    await env.DB.prepare(`
      INSERT INTO vcc_notifications (id, dedup_key, notification_type, reference_type, reference_id, asset_id, department,
        target_role, escalation_level, severity, title, message, status)
      VALUES ('NTF-N4-L3', 'N4:ACK2:L3', 'OVERDUE_L3_CRITICAL', 'VCC_ASSET', 'AST-N4-ACK2', 'AST-N4-ACK2', 'N4QC',
        'QMR_L6', 3, 'CRITICAL', 't', 'm', 'PENDING')
    `).run();

    // Other department -> 403; same department but too low a level for an L3 alert -> 403
    expect((await call('POST', '/api/vcc/notifications/NTF-N4-L3/acknowledge', 'QA-L5-N4', { note: 'x' })).status).toBe(403);
    expect((await call('POST', '/api/vcc/notifications/NTF-N4-L3/acknowledge', 'QC-L4-N4', { note: 'x' })).status).toBe(403);
    const untouched = await env.DB.prepare("SELECT status FROM vcc_notifications WHERE id = 'NTF-N4-L3'").first();
    expect(untouched.status).toBe('PENDING');

    // Same department with sufficient level -> allowed
    expect((await call('POST', '/api/vcc/notifications/NTF-N4-L3/acknowledge', 'QC-L5-N4', { note: 'รับทราบ' })).status).toBe(200);
  });

  it('13. P2-5 Duplicate acknowledgement cannot extend the grace period; resolved alerts cannot be acknowledged', async () => {
    const before = await env.DB.prepare("SELECT acknowledged_at, acknowledged_by FROM vcc_notifications WHERE id = 'NTF-N4-L3'").first();
    expect(before.acknowledged_by).toBe('QC-L5-N4');

    const again = await call('POST', '/api/vcc/notifications/NTF-N4-L3/acknowledge', 'DCC-N4', { note: 'ซ้ำ' });
    expect(again.status).toBe(409);
    const after = await env.DB.prepare("SELECT acknowledged_at, acknowledged_by FROM vcc_notifications WHERE id = 'NTF-N4-L3'").first();
    expect(after.acknowledged_at).toBe(before.acknowledged_at);
    expect(after.acknowledged_by).toBe('QC-L5-N4');

    await env.DB.prepare("UPDATE vcc_notifications SET status = 'RESOLVED' WHERE id = 'NTF-N4-L3'").run();
    expect((await call('POST', '/api/vcc/notifications/NTF-N4-L3/acknowledge', 'QC-L5-N4', {})).status).toBe(400);
  });

  it('8. Scheduled Cron Integration: runs fail-safe without breaking existing tasks', async () => {
    // Verify runVccNotificationSweep executes cleanly on live database
    const sweepRes = await runVccNotificationSweep(env.DB);
    expect(sweepRes).toBeDefined();
    expect(typeof sweepRes.created).toBe('number');
    expect(typeof sweepRes.updated).toBe('number');
    expect(typeof sweepRes.resolved).toBe('number');
  });
});

