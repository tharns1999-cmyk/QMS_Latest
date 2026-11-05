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
        ['u-hl3', 'H-Senior L3', 'hl3@vcc.local', 3, 'QC', 0],
        ['u-hl4', 'H-Lead L4', 'hl4@vcc.local', 4, 'QC', 0],
        ['u-hl4b', 'H-Lead L4B', 'hl4b@vcc.local', 4, 'QC', 0],
        ['u-hl5', 'H-Manager L5', 'hl5@vcc.local', 5, 'QC', 0],
        ['u-hqmr', 'H-QMR Exec L6', 'hqmr@vcc.local', 6, 'QA', 0],
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
      ['L3', 'hl3@vcc.local'],
      ['L4', 'hl4@vcc.local'],
      ['L4B', 'hl4b@vcc.local'],
      ['L5', 'hl5@vcc.local'],
      ['QMR', 'hqmr@vcc.local'],
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

  describe('DEC-01: Certificate Expiry Notification Reliability & Idempotency', () => {
    it('1. Loads default [60, 30, 15] and saves department-specific threshold overrides', async () => {
      const getRes = await call('GET', '/api/vcc/notification-settings', 'DCC');
      expect(getRes.status).toBe(200);
      expect(getRes.body.settings.cert_expiring_days).toEqual([60, 30, 15]);

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

    it('2. Notification Sweep generates INFO for 60d, WARNING for 30d, and CRITICAL for 15d with Idempotency', async () => {
      const nowStr = '2026-06-01';
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

      const sweep1 = await runVccNotificationSweep(env.DB, { nowDate: nowStr });
      expect(sweep1.created).toBeGreaterThanOrEqual(3);

      // Verify Idempotency: Second sweep must update existing rows without creating duplicates
      const sweep2 = await runVccNotificationSweep(env.DB, { nowDate: nowStr });
      expect(sweep2.created).toBe(0);
      expect(sweep2.updated).toBeGreaterThanOrEqual(3);

      const { results: notifs } = await env.DB.prepare(`
        SELECT * FROM vcc_notifications
        WHERE reference_id IN ('id-ast-60', 'id-ast-30', 'id-ast-15')
      `).all();

      const n60 = notifs.find((n) => n.reference_id === 'id-ast-60');
      const n30 = notifs.find((n) => n.reference_id === 'id-ast-30');
      const n15 = notifs.find((n) => n.reference_id === 'id-ast-15');

      expect(n60.notification_type).toBe('CERT_EXPIRING_60');
      expect(n60.severity).toBe('INFO');

      expect(n30.notification_type).toBe('CERT_EXPIRING_30');
      expect(n30.severity).toBe('WARNING');

      expect(n15.notification_type).toBe('CERT_EXPIRING_15');
      expect(n15.severity).toBe('CRITICAL');
      expect(n15.escalation_level).toBe(2);
    });

    it('3. Department-specific override: QA asset at 50 days is NOT alerted when QA threshold is 45 days', async () => {
      const nowStr = '2026-06-01';
      // 50 days ahead = 2026-07-21
      await env.DB.batch([
        env.DB.prepare(`
          INSERT OR REPLACE INTO vcc_assets (id, asset_code, name, asset_type, department, status, is_group, created_by, updated_by)
          VALUES ('id-ast-qa-50', 'AST-QA-50', 'QA Caliper 50d', 'CALIPER', 'QA', 'ACTIVE', 0, 'u-hdcc', 'u-hdcc')
        `),
        env.DB.prepare(`
          INSERT OR REPLACE INTO vcc_work_orders (
            id, wo_code, asset_id, provider_name, status, result_status, certificate_no,
            certificate_valid_until, due_date, original_due_date, created_by, updated_by
          ) VALUES ('wo-qa-50', 'WO-QA-50', 'id-ast-qa-50', 'NIMT', 'CLOSED', 'PASS', 'CERT-QA-50', '2026-07-21', '2026-07-21', '2026-07-21', 'u-hdcc', 'u-hdcc')
        `)
      ]);

      await runVccNotificationSweep(env.DB, { nowDate: nowStr });
      const qaNotif = await env.DB.prepare(`
        SELECT * FROM vcc_notifications WHERE reference_id = 'id-ast-qa-50' AND status = 'PENDING'
      `).first();
      expect(qaNotif).toBeNull(); // 50 days > QA max threshold (45 days)
    });
  });

  describe('DEC-02: Work Order Rescheduling Governance & 2-Step Approval Workflow', () => {
    let testWoId;

    beforeAll(async () => {
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

    it('1. Step 1 (Request Reschedule): Submits request, due_date remains UNCHANGED, status becomes REQUESTED', async () => {
      const res = await call('POST', `/api/vcc/work-orders/${testWoId}/request-reschedule`, 'L2', {
        proposed_due_date: '2026-06-28',
        reason: 'รอชิ้นส่วนอะไหล่เทียบมาตรฐาน'
      });
      expect(res.status).toBe(200);
      expect(res.body.workOrder.due_date).toBe('2026-06-15'); // UNCHANGED
      expect(res.body.workOrder.proposed_due_date).toBe('2026-06-28');
      expect(res.body.workOrder.reschedule_status).toBe('REQUESTED');
      expect(res.body.workOrder.reschedule_requested_by).toBe('u-hl2');

      // Verify Audit Trail
      const auditRow = await env.DB.prepare(`
        SELECT * FROM audit_log
        WHERE action = 'VCC_WO_RESCHEDULE_REQUESTED' AND json_extract(details, '$.wo_id') = ?
      `).bind(testWoId).first();
      expect(auditRow).toBeDefined();
    });

    it('2. Segregation of Duties: Requester CANNOT approve their own reschedule (Blocks Self-Approval)', async () => {
      // Even if requester had level 4, self-approval is blocked
      const selfRes = await call('POST', `/api/vcc/work-orders/${testWoId}/approve-reschedule`, 'L2', {});
      expect(selfRes.status).toBe(403);
    });

    it('3. Cross-Department & Unauthorized Access: Blocks L4 from QA and unauthorized users', async () => {
      const crossRes = await call('POST', `/api/vcc/work-orders/${testWoId}/approve-reschedule`, 'OTHER4', {});
      expect(crossRes.status).toBe(403);
      expect(crossRes.body.error).toContain('ไม่มีสิทธิ์อนุมัติ');
    });

    it('4. Step 2A (Approve Reschedule): Authorized L4 in department approves; due_date updates, audit recorded', async () => {
      const appRes = await call('POST', `/api/vcc/work-orders/${testWoId}/approve-reschedule`, 'L4', {
        comment: 'อนุมัติให้ขยายเวลาตามเหตุผลความจำเป็น'
      });
      expect(appRes.status).toBe(200);
      expect(appRes.body.workOrder.due_date).toBe('2026-06-28'); // UPDATED
      expect(appRes.body.workOrder.original_due_date).toBe('2026-06-15'); // IMMUTABLE
      expect(appRes.body.workOrder.reschedule_status).toBe('APPROVED');
      expect(appRes.body.workOrder.reschedule_approved_by).toBe('u-hl4');

      // Verify Audit Trail
      const auditRow = await env.DB.prepare(`
        SELECT * FROM audit_log
        WHERE action = 'VCC_WO_RESCHEDULE_APPROVED' AND json_extract(details, '$.wo_id') = ?
      `).bind(testWoId).first();
      expect(auditRow).toBeDefined();
    });

    it('5. Step 2B (Reject Reschedule): If rejected, due_date remains original and audit recorded', async () => {
      const woRejectId = 'wo-resched-reject-01';
      await env.DB.prepare(`
        INSERT OR REPLACE INTO vcc_work_orders (
          id, wo_code, asset_id, provider_name, status, due_date, original_due_date, scheduled_date, created_by, updated_by
        ) VALUES (?, 'WO-RS-REJ', 'ast-resched', 'NIMT', 'OPEN', '2026-07-10', '2026-07-10', '2026-07-10', 'u-hdcc', 'u-hdcc')
      `).bind(woRejectId).run();

      // Request
      await call('POST', `/api/vcc/work-orders/${woRejectId}/request-reschedule`, 'L2', {
        proposed_due_date: '2026-07-25',
        reason: 'ขอเลื่อนกำหนด'
      });

      // Reject
      const rejRes = await call('POST', `/api/vcc/work-orders/${woRejectId}/reject-reschedule`, 'L4', {
        reject_reason: 'ไม่อนุมัติเนื่องจากเครื่องมือจำเป็นต้องใช้งานตามแผนเดิม'
      });
      expect(rejRes.status).toBe(200);
      expect(rejRes.body.workOrder.due_date).toBe('2026-07-10'); // MAINTAINED ORIGINAL
      expect(rejRes.body.workOrder.reschedule_status).toBe('REJECTED');
      expect(rejRes.body.workOrder.reschedule_rejected_reason).toContain('ไม่อนุมัติ');

      const auditRow = await env.DB.prepare(`
        SELECT * FROM audit_log
        WHERE action = 'VCC_WO_RESCHEDULE_REJECTED' AND json_extract(details, '$.wo_id') = ?
      `).bind(woRejectId).first();
      expect(auditRow).toBeDefined();
    });

    it('6. Direct Reschedule API Security: Blocks non-DCC (L2, L3, L4, QMR) with 403; allows DCC with audit', async () => {
      const woDirectId = 'wo-resched-direct-sec';
      await env.DB.prepare(`
        INSERT OR REPLACE INTO vcc_work_orders (
          id, wo_code, asset_id, provider_name, status, due_date, original_due_date, scheduled_date, created_by, updated_by
        ) VALUES (?, 'WO-RS-DIR', 'ast-resched', 'NIMT', 'OPEN', '2026-08-01', '2026-08-01', '2026-08-01', 'u-hdcc', 'u-hdcc')
      `).bind(woDirectId).run();

      // L2 fails direct override
      const l2Direct = await call('POST', `/api/vcc/work-orders/${woDirectId}/reschedule`, 'L2', {
        new_due_date: '2026-08-20',
        reason: 'L2 bypass attempt'
      });
      expect(l2Direct.status).toBe(403);
      expect(l2Direct.body.error).toContain('สงวนสิทธิ์สำหรับเจ้าหน้าที่ DCC เท่านั้น');

      // L3 fails direct override
      const l3Direct = await call('POST', `/api/vcc/work-orders/${woDirectId}/reschedule`, 'L3', {
        new_due_date: '2026-08-20',
        reason: 'L3 bypass attempt'
      });
      expect(l3Direct.status).toBe(403);
      expect(l3Direct.body.error).toContain('สงวนสิทธิ์สำหรับเจ้าหน้าที่ DCC เท่านั้น');

      // L4 in dept fails direct override
      const l4Direct = await call('POST', `/api/vcc/work-orders/${woDirectId}/reschedule`, 'L4', {
        new_due_date: '2026-08-20',
        reason: 'L4 bypass attempt'
      });
      expect(l4Direct.status).toBe(403);
      expect(l4Direct.body.error).toContain('สงวนสิทธิ์สำหรับเจ้าหน้าที่ DCC เท่านั้น');

      // QMR fails direct override (must use workflow or DCC)
      const qmrDirect = await call('POST', `/api/vcc/work-orders/${woDirectId}/reschedule`, 'QMR', {
        new_due_date: '2026-08-20',
        reason: 'QMR direct attempt'
      });
      expect(qmrDirect.status).toBe(403);
      expect(qmrDirect.body.error).toContain('สงวนสิทธิ์สำหรับเจ้าหน้าที่ DCC เท่านั้น');

      // DCC succeeds direct override
      const dccDirect = await call('POST', `/api/vcc/work-orders/${woDirectId}/reschedule`, 'DCC', {
        new_due_date: '2026-08-25',
        reason: 'DCC administrative override per urgent audit policy'
      });
      expect(dccDirect.status).toBe(200);
      expect(dccDirect.body.workOrder.due_date).toBe('2026-08-25');
      expect(dccDirect.body.workOrder.original_due_date).toBe('2026-08-01');

      const auditRow = await env.DB.prepare(`
        SELECT * FROM audit_log
        WHERE action = 'VCC_WO_RESCHEDULED' AND json_extract(details, '$.wo_id') = ?
      `).bind(woDirectId).first();
      expect(auditRow).toBeDefined();
      const details = JSON.parse(auditRow.details);
      expect(details.is_direct_override).toBe(true);
      expect(details.original_due_date).toBe('2026-08-01');
    });

    it('7. Direct Reschedule Guard: Blocks DCC direct override when request is already pending (409)', async () => {
      const woPendingDirectId = 'wo-resched-pending-dir';
      await env.DB.prepare(`
        INSERT OR REPLACE INTO vcc_work_orders (
          id, wo_code, asset_id, provider_name, status, due_date, original_due_date, scheduled_date, created_by, updated_by
        ) VALUES (?, 'WO-RS-PDIR', 'ast-resched', 'NIMT', 'OPEN', '2026-09-01', '2026-09-01', '2026-09-01', 'u-hdcc', 'u-hdcc')
      `).bind(woPendingDirectId).run();

      // Submit request first
      await call('POST', `/api/vcc/work-orders/${woPendingDirectId}/request-reschedule`, 'L2', {
        proposed_due_date: '2026-09-15',
        reason: 'ขอย้ายวัน'
      });

      // DCC tries to bypass pending request with direct reschedule -> 409
      const bypassRes = await call('POST', `/api/vcc/work-orders/${woPendingDirectId}/reschedule`, 'DCC', {
        new_due_date: '2026-09-20',
        reason: 'DCC bypass attempt'
      });
      expect(bypassRes.status).toBe(409);
      expect(bypassRes.body.error).toContain('มีคำขอเลื่อนกำหนดรอการพิจารณาอยู่');

      // Duplicate request also rejected with 409
      const dupReq = await call('POST', `/api/vcc/work-orders/${woPendingDirectId}/request-reschedule`, 'L2', {
        proposed_due_date: '2026-09-18',
        reason: 'ขอย้ำอีกรอบ'
      });
      expect(dupReq.status).toBe(409);
      expect(dupReq.body.error).toContain('มีคำขอเลื่อนวันครบกำหนดรอการอนุมัติอยู่แล้ว');
    });

    it('8. Segregation of Duties Proof: L4 requester CANNOT self-approve, but peer L4B can approve', async () => {
      const woL4SodId = 'wo-resched-l4-sod';
      await env.DB.prepare(`
        INSERT OR REPLACE INTO vcc_work_orders (
          id, wo_code, asset_id, provider_name, status, due_date, original_due_date, scheduled_date, created_by, updated_by
        ) VALUES (?, 'WO-RS-L4SOD', 'ast-resched', 'NIMT', 'OPEN', '2026-10-01', '2026-10-01', '2026-10-01', 'u-hdcc', 'u-hdcc')
      `).bind(woL4SodId).run();

      // L4 requests reschedule
      const reqRes = await call('POST', `/api/vcc/work-orders/${woL4SodId}/request-reschedule`, 'L4', {
        proposed_due_date: '2026-10-20',
        reason: 'หัวหน้างาน L4 ยื่นคำขอเลื่อนเอง'
      });
      expect(reqRes.status).toBe(200);
      expect(reqRes.body.workOrder.reschedule_requested_by).toBe('u-hl4');

      // L4 tries to approve their own request -> 403 Forbidden
      const selfApproveRes = await call('POST', `/api/vcc/work-orders/${woL4SodId}/approve-reschedule`, 'L4', {
        comment: 'พยายามอนุมัติงานตัวเอง'
      });
      expect(selfApproveRes.status).toBe(403);
      expect(selfApproveRes.body.error).toContain('ผู้ขอเลื่อนกำหนดวันไม่สามารถอนุมัติการขอเลื่อนของตนเองได้');

      // Peer L4B in same department approves -> 200 OK
      const peerApproveRes = await call('POST', `/api/vcc/work-orders/${woL4SodId}/approve-reschedule`, 'L4B', {
        comment: 'หัวหน้างานอีกท่าน (L4B) ตรวจสอบและอนุมัติให้ตามระเบียบ'
      });
      expect(peerApproveRes.status).toBe(200);
      expect(peerApproveRes.body.workOrder.reschedule_status).toBe('APPROVED');
      expect(peerApproveRes.body.workOrder.reschedule_approved_by).toBe('u-hl4b');
      expect(peerApproveRes.body.workOrder.due_date).toBe('2026-10-20');
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

    it('1. Rejects invalid verification_type with 400', async () => {
      const res = await call('POST', `/api/vcc/work-orders/${qualWoId}/submit-result`, 'L2', {
        performed_at: '2026-06-10',
        result_status: 'PASS',
        certificate_no: 'CERT-QL-001',
        acceptance_criteria: 'เกณฑ์ทดสอบ',
        verification_type: 'INVALID_TYPE'
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('QUANTITATIVE หรือ QUALITATIVE');
    });

    it('2. Quantitative rejects qualitative N/A waiver', async () => {
      const res = await call('POST', `/api/vcc/work-orders/${qualWoId}/submit-result`, 'L2', {
        performed_at: '2026-06-10',
        result_status: 'PASS',
        certificate_no: 'CERT-QL-001',
        acceptance_criteria: 'เกณฑ์ทดสอบ',
        verification_type: 'QUANTITATIVE',
        uncertainty_value: 'N/A (การทวนสอบเชิงคุณภาพ)'
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('ไม่อนุญาตให้ใช้ข้อยกเว้น N/A');
    });

    it('3. Qualitative verification strictly requires actual_result', async () => {
      const res = await call('POST', `/api/vcc/work-orders/${qualWoId}/submit-result`, 'L2', {
        performed_at: '2026-06-10',
        result_status: 'PASS',
        certificate_no: 'CERT-QL-001',
        acceptance_criteria: 'เกณฑ์ Go ผ่าน No-Go ไม่ผ่าน',
        verification_type: 'QUALITATIVE',
        actual_result: ''
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('จำเป็นต้องระบุผลการตรวจสอบจริง (Actual Result)');
    });

    it('4. Qualitative verification accepts submit without uncertainty/error and populates N/A defaults', async () => {
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

  describe('DEC-04: Composite Set Digital Record & Child Asset Snapshot Integrity', () => {
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
          id, wo_code, asset_id, provider_name, status, due_date, original_due_date, created_by, updated_by
        ) VALUES (?, 'WO-COMP-001', ?, 'NIMT', 'OPEN', '2026-08-01', '2026-08-01', 'u-hdcc', 'u-hdcc')
      `).bind(compositeWoId, parentAssetId).run();
    });

    it('1. Submitting result freezes child assets into immutable snapshot', async () => {
      const subRes = await call('POST', `/api/vcc/work-orders/${compositeWoId}/submit-result`, 'L2', {
        performed_at: '2026-07-20',
        result_status: 'PASS',
        certificate_no: 'CERT-SET-001',
        acceptance_criteria: '± 0.2 °C',
        verification_type: 'QUANTITATIVE',
        uncertainty_value: '0.04',
        calibration_error_value: '0.01'
      });
      expect(subRes.status).toBe(200);

      // Approve to CLOSE
      const appRes = await call('POST', `/api/vcc/work-orders/${compositeWoId}/approve`, 'L4', {
        comment: 'ผ่านเกณฑ์สมบูรณ์ทุกชิ้น'
      });
      expect(appRes.status).toBe(200);
      expect(appRes.body.workOrder.status).toBe('CLOSED');
      expect(appRes.body.workOrder.child_assets.length).toBe(2);

      // Check DB: child_assets_snapshot must be stored as text
      const woDb = await env.DB.prepare('SELECT child_assets_snapshot FROM vcc_work_orders WHERE id = ?').bind(compositeWoId).first();
      expect(woDb.child_assets_snapshot).toBeDefined();
      const snap = JSON.parse(woDb.child_assets_snapshot);
      expect(snap.length).toBe(2);
      expect(snap[0].asset_code).toBe('CHILD-DW-01');
      expect(snap[1].asset_code).toBe('CHILD-RT-01');
    });

    it('2. Subsequent changes to child assets in vcc_assets DO NOT alter the frozen digital record', async () => {
      // Modify child 1 in register, delete child 2 from register, and add a new child 3
      await env.DB.batch([
        env.DB.prepare("UPDATE vcc_assets SET name = 'MODIFIED NAME', serial_no = 'ALTERED-SN' WHERE id = ?").bind(child1Id),
        env.DB.prepare("DELETE FROM vcc_assets WHERE id = ?").bind(child2Id),
        env.DB.prepare(`
          INSERT INTO vcc_assets (
            id, asset_code, name, asset_type, department, status, is_group, parent_id, serial_no, model, location, created_by, updated_by
          ) VALUES ('ast-child-new', 'CHILD-NEW-99', 'New Block Added Later', 'BLOCK', 'QC', 'ACTIVE', 0, ?, 'NEW-999', 'M99', 'Lab 2', 'u-hdcc', 'u-hdcc')
        `).bind(parentAssetId)
      ]);

      // Fetch the closed work order again
      const res = await call('GET', `/api/vcc/work-orders/${compositeWoId}`, 'L2');
      expect(res.status).toBe(200);
      const wo = res.body.workOrder;

      // The digital record child_assets must match the EXACT frozen snapshot at execution time!
      expect(wo.child_assets.length).toBe(2);
      expect(wo.child_assets[0].name).toBe('Dry-well Block'); // Not 'MODIFIED NAME'
      expect(wo.child_assets[0].serial_no).toBe('DW-901'); // Not 'ALTERED-SN'
      expect(wo.child_assets[1].asset_code).toBe('CHILD-RT-01'); // Preserved even though deleted from register!
      expect(wo.child_assets.some((c) => c.asset_code === 'CHILD-NEW-99')).toBe(false); // New equipment not leaked into old record
    });

    it('3. Legacy CLOSED work orders with child_assets_snapshot IS NULL do not query live register and report is_legacy_without_snapshot', async () => {
      const legacyWoId = 'wo-legacy-closed-01';
      await env.DB.prepare(`
        INSERT INTO vcc_work_orders (
          id, wo_code, asset_id, provider_name, due_date, original_due_date, status, result_status, child_assets_snapshot, created_by, updated_by
        ) VALUES (
          ?, 'WO-LEGACY-001', ?, 'Lab External', '2026-03-31', '2026-03-31', 'CLOSED', 'PASS', NULL, 'u-hdcc', 'u-hdcc'
        )
      `).bind(legacyWoId, parentAssetId).run();

      const res = await call('GET', `/api/vcc/work-orders/${legacyWoId}`, 'L2');
      expect(res.status).toBe(200);
      const wo = res.body.workOrder;
      expect(wo.status).toBe('CLOSED');
      expect(wo.child_assets_snapshot).toBeNull();
      // Must not query live register and claim it as historical snapshot
      expect(wo.child_assets).toEqual([]);
      expect(wo.is_legacy_without_snapshot).toBe(true);
    });
  });
});
