import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';
import { runVccNotificationSweep } from './vccNotifications.js';

describe('VCC Pre-UAT Product Hardening & Refinement Decisions (DEC-01 to DEC-04)', () => {
  let proxy;
  let env;
  const tokens = {};
  const PASSWORD = 'vcc-hardening-pass-123';

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
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('QC', 'แผนกควบคุมคุณภาพ', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('QA', 'แผนกประกันคุณภาพ', 'ACTIVE')"),
      ...[
        ['u-hdcc', 'H-DCC Officer', 'hdcc@vcc.local', 3, 'QC', 1],
        ['u-hl2', 'H-Operator L2', 'hl2@vcc.local', 2, 'QC', 0],
        ['u-hl4', 'H-Lead L4', 'hl4@vcc.local', 4, 'QC', 0],
        ['u-hl5', 'H-Manager L5', 'hl5@vcc.local', 5, 'QC', 0],
        ['u-hother4', 'H-Other L4', 'hother4@vcc.local', 4, 'QA', 0]
      ].map(([id, name, email, level, dept, dcc]) =>
        env.DB.prepare(`
          INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc, status)
          VALUES (?, ?, ?, ?, 'USER', ?, ?, ?, ?, 'ACTIVE')
        `).bind(id, name, email, hash, level, dept, JSON.stringify([dept]), dcc)
      )
    ]);

    for (const [key, email] of [
      ['DCC', 'hdcc@vcc.local'],
      ['L2', 'hl2@vcc.local'],
      ['L4', 'hl4@vcc.local'],
      ['L5', 'hl5@vcc.local'],
      ['OTHER4', 'hother4@vcc.local']
    ]) {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: PASSWORD })
      }, env);
      const json = await res.json();
      tokens[key] = json.token;
    }
  });

  afterAll(async () => {
    if (proxy?.dispose) await proxy.dispose();
  });

  describe('DEC-01: Certificate Expiry Warning 60 / 30 / 15 Days Tiering & Department Overrides', () => {
    it('1. Loads default certificate expiring days [60, 30, 15] and supports PUT with department overrides', async () => {
      const getRes = await call('GET', '/api/vcc/notification-settings', 'DCC');
      expect(getRes.status).toBe(200);
      expect(getRes.body.settings.cert_expiring_days).toEqual([60, 30, 15]);

      // Update notification settings with department-specific overrides
      const putRes = await call('PUT', '/api/vcc/notification-settings', 'DCC', {
        cert_expiring_days: [60, 30, 15],
        department_cert_expiring_days: {
          QC: [60, 30, 15],
          QA: [45, 15]
        }
      });
      expect(putRes.status).toBe(200);
      expect(putRes.body.settings.cert_expiring_days).toEqual([60, 30, 15]);
      expect(putRes.body.settings.department_cert_expiring_days.QC).toEqual([60, 30, 15]);
      expect(putRes.body.settings.department_cert_expiring_days.QA).toEqual([45, 15]);
    });

    it('2. Notification Sweep generates INFO for 60d, WARNING for 30d, and CRITICAL for 15d', async () => {
      const nowStr = '2026-06-01';
      // Create assets with closed work orders matching 60, 30, and 15 days from nowStr
      // 60 days ahead = 2026-07-31
      // 30 days ahead = 2026-07-01
      // 15 days ahead = 2026-06-16
      const asset60 = 'AST-EXP-60';
      const asset30 = 'AST-EXP-30';
      const asset15 = 'AST-EXP-15';

      await env.DB.batch([
        env.DB.prepare(`
          INSERT OR REPLACE INTO vcc_assets (id, asset_code, name, asset_type, department, status, is_group, created_by, updated_by)
          VALUES ('id-ast-60', ?, 'Test Gauge 60', 'GAUGE', 'QC', 'ACTIVE', 0, 'u-hdcc', 'u-hdcc')
        `).bind(asset60),
        env.DB.prepare(`
          INSERT OR REPLACE INTO vcc_assets (id, asset_code, name, asset_type, department, status, is_group, created_by, updated_by)
          VALUES ('id-ast-30', ?, 'Test Gauge 30', 'GAUGE', 'QC', 'ACTIVE', 0, 'u-hdcc', 'u-hdcc')
        `).bind(asset30),
        env.DB.prepare(`
          INSERT OR REPLACE INTO vcc_assets (id, asset_code, name, asset_type, department, status, is_group, created_by, updated_by)
          VALUES ('id-ast-15', ?, 'Test Gauge 15', 'GAUGE', 'QC', 'ACTIVE', 0, 'u-hdcc', 'u-hdcc')
        `).bind(asset15),

        // Closed WOs with certificates
        env.DB.prepare(`
          INSERT OR REPLACE INTO vcc_work_orders (
            id, wo_code, asset_id, provider_name, status, result_status, certificate_no,
            certificate_valid_until, due_date, original_due_date, created_by, updated_by
          ) VALUES ('wo-exp-60', 'WO-EXP-60', 'id-ast-60', 'NIMT', 'CLOSED', 'PASS', 'CERT-60', '2026-07-31', '2026-07-31', '2026-07-31', 'u-hdcc', 'u-hdcc')
        `),
        env.DB.prepare(`
          INSERT OR REPLACE INTO vcc_work_orders (
            id, wo_code, asset_id, provider_name, status, result_status, certificate_no,
            certificate_valid_until, due_date, original_due_date, created_by, updated_by
          ) VALUES ('wo-exp-30', 'WO-EXP-30', 'id-ast-30', 'NIMT', 'CLOSED', 'PASS', 'CERT-30', '2026-07-01', '2026-07-01', '2026-07-01', 'u-hdcc', 'u-hdcc')
        `),
        env.DB.prepare(`
          INSERT OR REPLACE INTO vcc_work_orders (
            id, wo_code, asset_id, provider_name, status, result_status, certificate_no,
            certificate_valid_until, due_date, original_due_date, created_by, updated_by
          ) VALUES ('wo-exp-15', 'WO-EXP-15', 'id-ast-15', 'NIMT', 'CLOSED', 'PASS', 'CERT-15', '2026-06-16', '2026-06-16', '2026-06-16', 'u-hdcc', 'u-hdcc')
        `)
      ]);

      const sweepResult = await runVccNotificationSweep(env.DB, { nowDate: nowStr });
      expect(sweepResult.created).toBeGreaterThanOrEqual(3);

      const { results: notifs } = await env.DB.prepare(`
        SELECT * FROM vcc_notifications
        WHERE reference_id IN ('id-ast-60', 'id-ast-30', 'id-ast-15')
      `).all();

      const n60 = notifs.find((n) => n.reference_id === 'id-ast-60');
      const n30 = notifs.find((n) => n.reference_id === 'id-ast-30');
      const n15 = notifs.find((n) => n.reference_id === 'id-ast-15');

      expect(n60).toBeDefined();
      expect(n60.notification_type).toBe('CERT_EXPIRING_60');
      expect(n60.severity).toBe('INFO');

      expect(n30).toBeDefined();
      expect(n30.notification_type).toBe('CERT_EXPIRING_30');
      expect(n30.severity).toBe('WARNING');

      expect(n15).toBeDefined();
      expect(n15.notification_type).toBe('CERT_EXPIRING_15');
      expect(n15.severity).toBe('CRITICAL');
      expect(n15.escalation_level).toBe(2);
      expect(n15.title).toContain('15 วัน - เร่งด่วน');
    });
  });

  describe('DEC-02: Work Order Rescheduling Governance & Audit Integrity', () => {
    let testWoId;

    beforeAll(async () => {
      // Create a dedicated work order for rescheduling tests
      await env.DB.prepare(`
        INSERT OR REPLACE INTO vcc_assets (id, asset_code, name, asset_type, department, status, is_group, created_by, updated_by)
        VALUES ('ast-resched', 'AST-RS-01', 'Scale for Reschedule Test', 'SCALE', 'QC', 'ACTIVE', 0, 'u-hdcc', 'u-hdcc')
      `).run();

      testWoId = 'wo-resched-01';
      await env.DB.prepare(`
        INSERT OR REPLACE INTO vcc_work_orders (
          id, wo_code, asset_id, provider_name, status, due_date, original_due_date, scheduled_date, created_by, updated_by
        ) VALUES (?, 'WO-RS-001', 'ast-resched', 'NIMT', 'OPEN', '2026-06-15', '2026-06-15', '2026-06-15', 'u-hdcc', 'u-hdcc')
      `).bind(testWoId).run();
    });

    it('1. Blocks unauthorized user (L2 operator) from rescheduling with 403', async () => {
      const res = await call('POST', `/api/vcc/work-orders/${testWoId}/reschedule`, 'L2', {
        new_due_date: '2026-06-25',
        reason: 'ขอเลื่อนกำหนด'
      });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('เฉพาะผู้มีอำนาจอนุมัติ (ระดับ L4 ขึ้นไป)');
    });

    it('2. Blocks L4 from other department with 403', async () => {
      const res = await call('POST', `/api/vcc/work-orders/${testWoId}/reschedule`, 'OTHER4', {
        new_due_date: '2026-06-25',
        reason: 'ขอเลื่อนกำหนดข้ามแผนก'
      });
      expect(res.status).toBe(403);
    });

    it('3. Rejects reschedule without reason with 400', async () => {
      const res = await call('POST', `/api/vcc/work-orders/${testWoId}/reschedule`, 'L4', {
        new_due_date: '2026-06-25',
        reason: ''
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('กรุณาระบุเหตุผลในการขอเลื่อนวันครบกำหนด');
    });

    it('4. Allows authorized L4 in department to reschedule; preserves original_due_date and records audit', async () => {
      const res = await call('POST', `/api/vcc/work-orders/${testWoId}/reschedule`, 'L4', {
        new_due_date: '2026-06-28',
        reason: 'เครื่องมือส่งเข้าสอบเทียบภายนอกล่าช้า ได้รับการอนุมัติแล้ว'
      });
      expect(res.status).toBe(200);
      expect(res.body.workOrder.due_date).toBe('2026-06-28');
      expect(res.body.workOrder.original_due_date).toBe('2026-06-15'); // IMMUTABLE

      // Verify audit trail
      const auditRow = await env.DB.prepare(`
        SELECT * FROM audit_log
        WHERE action = 'VCC_WO_RESCHEDULED' AND json_extract(details, '$.wo_id') = ?
        ORDER BY id DESC LIMIT 1
      `).bind(testWoId).first();
      expect(auditRow).toBeDefined();
      const details = JSON.parse(auditRow.details);
      expect(details.original_due_date).toBe('2026-06-15');
      expect(details.before.due_date).toBe('2026-06-15');
      expect(details.after.due_date).toBe('2026-06-28');
      expect(details.authorized_by).toBe('u-hl4');
    });
  });

  describe('DEC-03: Qualitative vs Quantitative Verification Governance', () => {
    let qualWoId;

    beforeAll(async () => {
      await env.DB.prepare(`
        INSERT OR REPLACE INTO vcc_assets (id, asset_code, name, asset_type, department, status, is_group, created_by, updated_by)
        VALUES ('ast-qual', 'AST-QL-01', 'Go/No-Go Gauge Set', 'GAUGE', 'QC', 'ACTIVE', 0, 'u-hdcc', 'u-hdcc')
      `).run();

      qualWoId = 'wo-qual-01';
      await env.DB.prepare(`
        INSERT OR REPLACE INTO vcc_work_orders (
          id, wo_code, asset_id, provider_name, status, due_date, original_due_date, created_by, updated_by
        ) VALUES (?, 'WO-QL-001', 'ast-qual', 'INTERNAL_LAB', 'OPEN', '2026-07-01', '2026-07-01', 'u-hdcc', 'u-hdcc')
      `).bind(qualWoId).run();
    });

    it('1. Qualitative verification requires actual_result or result_remarks', async () => {
      const res = await call('POST', `/api/vcc/work-orders/${qualWoId}/submit-result`, 'L2', {
        performed_at: '2026-06-10',
        result_status: 'PASS',
        certificate_no: 'CERT-QL-001',
        acceptance_criteria: 'เกณฑ์ Go ผ่าน No-Go ไม่ผ่าน',
        verification_type: 'QUALITATIVE',
        actual_result: '',
        result_remarks: ''
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('สำหรับการทวนสอบเชิงคุณภาพ (Qualitative) กรุณาระบุผลการตรวจสอบจริง');
    });

    it('2. Qualitative verification accepts submit without uncertainty/error and populates N/A defaults', async () => {
      const res = await call('POST', `/api/vcc/work-orders/${qualWoId}/submit-result`, 'L2', {
        performed_at: '2026-06-10',
        result_status: 'PASS',
        certificate_no: 'CERT-QL-001',
        acceptance_criteria: 'เกณฑ์ Go สวมเข้าพอดี No-Go ไม่สามารถสวมเข้าได้',
        verification_type: 'QUALITATIVE',
        actual_result: 'Go สวมผ่าน No-Go ไม่ผ่าน สภาพผิวสมบูรณ์ไม่มีรอยแตกหัก',
        uncertainty_value: '',
        calibration_error_value: ''
      });
      expect(res.status).toBe(200);
      expect(res.body.workOrder.verification_type).toBe('QUALITATIVE');
      expect(res.body.workOrder.actual_result).toBe('Go สวมผ่าน No-Go ไม่ผ่าน สภาพผิวสมบูรณ์ไม่มีรอยแตกหัก');
      expect(res.body.workOrder.uncertainty_value).toContain('N/A (การทวนสอบเชิงคุณภาพ');
      expect(res.body.workOrder.calibration_error_value).toContain('N/A (การทวนสอบเชิงคุณภาพ)');
      expect(res.body.workOrder.status).toBe('PENDING_REVIEW');
    });
  });

  describe('DEC-04: Composite Set Digital Record & Equipment Breakdown', () => {
    let parentAssetId;
    let child1Id;
    let child2Id;
    let compositeWoId;

    beforeAll(async () => {
      parentAssetId = 'ast-parent-set';
      child1Id = 'ast-child-01';
      child2Id = 'ast-child-02';

      await env.DB.batch([
        env.DB.prepare(`
          INSERT OR REPLACE INTO vcc_assets (
            id, asset_code, name, asset_type, department, status, is_group, group_nature, composite_details, created_by, updated_by
          ) VALUES (?, 'SET-CAL-01', 'ชุดเครื่องมือสอบเทียบอุณหภูมิ', 'COMPOSITE', 'QC', 'ACTIVE', 1, 'COMPOSITE_SET', '1. Temp Dry-well (SN: DW-901)\n2. Reference Thermometer (SN: RT-882)', 'u-hdcc', 'u-hdcc')
        `).bind(parentAssetId),
        env.DB.prepare(`
          INSERT OR REPLACE INTO vcc_assets (
            id, asset_code, name, asset_type, department, status, is_group, parent_id, serial_no, model, location, created_by, updated_by
          ) VALUES (?, 'CHILD-DW-01', 'Dry-well Block', 'BLOCK', 'QC', 'ACTIVE', 0, ?, 'DW-901', 'DW-100', 'Lab 2', 'u-hdcc', 'u-hdcc')
        `).bind(child1Id, parentAssetId),
        env.DB.prepare(`
          INSERT OR REPLACE INTO vcc_assets (
            id, asset_code, name, asset_type, department, status, is_group, parent_id, serial_no, model, location, created_by, updated_by
          ) VALUES (?, 'CHILD-RT-01', 'Reference Probe', 'PROBE', 'QC', 'ACTIVE', 0, ?, 'RT-882', 'RT-200', 'Lab 2', 'u-hdcc', 'u-hdcc')
        `).bind(child2Id, parentAssetId)
      ]);

      compositeWoId = 'wo-comp-01';
      await env.DB.prepare(`
        INSERT OR REPLACE INTO vcc_work_orders (
          id, wo_code, asset_id, provider_name, status, result_status, certificate_no,
          acceptance_criteria, due_date, original_due_date, created_by, updated_by
        ) VALUES (?, 'WO-COMP-001', ?, 'NIMT', 'CLOSED', 'PASS', 'CERT-SET-001', '± 0.2 °C', '2026-08-01', '2026-08-01', 'u-hdcc', 'u-hdcc')
      `).bind(compositeWoId, parentAssetId).run();
    });

    it('1. Work Order Detail includes full child_assets breakdown and composite_details for composite sets', async () => {
      const res = await call('GET', `/api/vcc/work-orders/${compositeWoId}`, 'L2');
      expect(res.status).toBe(200);
      const wo = res.body.workOrder;
      expect(wo.group_nature).toBe('COMPOSITE_SET');
      expect(wo.composite_details).toContain('Temp Dry-well');
      expect(wo.child_assets).toBeDefined();
      expect(wo.child_assets.length).toBe(2);
      expect(wo.child_assets[0].asset_code).toBe('CHILD-DW-01');
      expect(wo.child_assets[0].serial_no).toBe('DW-901');
      expect(wo.child_assets[1].asset_code).toBe('CHILD-RT-01');
      expect(wo.child_assets[1].serial_no).toBe('RT-882');
    });
  });
});
