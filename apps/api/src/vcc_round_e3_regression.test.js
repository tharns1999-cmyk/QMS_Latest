import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('VCC Round E3: Final Business Logic & Workflow Regression Suite', () => {
  let proxy;
  let env;
  const tokens = {};
  const PASSWORD = 'vcc-e3-regression-pass-2026';
  const RUN = Date.now().toString(36).toUpperCase();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

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

  const auditCount = async (action, woId) =>
    env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = ? AND json_extract(details, '$.wo_id') = ?").bind(action, woId).first('n');
  const assetStatus = async (assetId) =>
    env.DB.prepare('SELECT status FROM vcc_assets WHERE id = ?').bind(assetId).first('status');

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword(PASSWORD);

    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('QC', 'ควบคุมคุณภาพ', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('QA', 'ประกันคุณภาพ', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('LB', 'ห้องปฏิบัติการ', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('WH', 'คลังสินค้า', 'ACTIVE')"),
      ...[
        ['e3-dcc', 'E3 DCC Officer', 'e3-dcc@vcc.local', 4, 'QC', 1],
        ['e3-qc-l2', 'E3 QC Tech L2', 'e3-qc-l2@vcc.local', 2, 'QC', 0],
        ['e3-qc-l4', 'E3 QC Lead L4', 'e3-qc-l4@vcc.local', 4, 'QC', 0],
        ['e3-qc-l4b', 'E3 QC Lead L4B', 'e3-qc-l4b@vcc.local', 4, 'QC', 0],
        ['e3-qc-l5', 'E3 QC Manager L5', 'e3-qc-l5@vcc.local', 5, 'QC', 0],
        ['e3-qa-l4', 'E3 QA Lead L4', 'e3-qa-l4@vcc.local', 4, 'QA', 0],
        ['e3-qa-l5', 'E3 QA Manager L5', 'e3-qa-l5@vcc.local', 5, 'QA', 0],
        ['e3-wh-l2', 'E3 WH Staff L2', 'e3-wh-l2@vcc.local', 2, 'WH', 0]
      ].map(([id, name, email, level, dept, dcc]) =>
        env.DB.prepare(`
          INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc, status)
          VALUES (?, ?, ?, ?, 'USER', ?, ?, ?, ?, 'ACTIVE')
          ON CONFLICT(id) DO UPDATE SET approval_level = excluded.approval_level, primary_department = excluded.primary_department,
            departments = excluded.departments, is_dcc = excluded.is_dcc, password_hash = excluded.password_hash
        `).bind(id, name, email, hash, level, dept, JSON.stringify([dept]), dcc)
      ),
      env.DB.prepare("UPDATE settings SET value = ? WHERE key = 'vcc_asset_types'").bind(
        JSON.stringify(['เทอร์โมมิเตอร์', 'เครื่องชั่ง', 'ตุ้มน้ำหนักมาตรฐาน', 'Temperature Controller', 'เครื่องตรวจจับโลหะ', 'นาฬิกาจับเวลา', 'เวอร์เนียร์คาลิปเปอร์', 'เครื่องวัดคุณภาพน้ำ/น้ำมัน'])
      )
    ]);

    for (const [key, email] of [
      ['DCC', 'e3-dcc@vcc.local'],
      ['QC_L2', 'e3-qc-l2@vcc.local'],
      ['QC_L4', 'e3-qc-l4@vcc.local'],
      ['QC_L4B', 'e3-qc-l4b@vcc.local'],
      ['QC_L5', 'e3-qc-l5@vcc.local'],
      ['QA_L4', 'e3-qa-l4@vcc.local'],
      ['QA_L5', 'e3-qa-l5@vcc.local'],
      ['WH_L2', 'e3-wh-l2@vcc.local']
    ]) {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: PASSWORD })
      }, env);
      const json = await res.json();
      tokens[key] = json.token;
      expect(tokens[key]).toBeTruthy();
    }
  });

  afterAll(async () => {
    if (proxy?.dispose) await proxy.dispose();
  });

  describe('1. Asset Lifecycle: Composite Parent-Child Integrity & Status State Machine', () => {
    it('blocks retiring a parent composite set when child assets are still ACTIVE (HTTP 409)', async () => {
      // 1. Create parent composite set
      const parentRes = await call('POST', '/api/vcc/assets', 'DCC', {
        asset_code: `E3-PARENT-${RUN}`,
        name: `[ข้อมูลทดสอบ] ชุดตุ้มน้ำหนักหลัก ${RUN}`,
        asset_type: 'เครื่องชั่ง',
        department: 'QC',
        group_nature: 'COMPOSITE_SET',
        composite_details: 'ชุดตุ้มน้ำหนัก 10 ชิ้น'
      });
      expect(parentRes.status).toBe(201);
      const parentId = parentRes.body.asset.id;

      // 2. Insert child asset tied to parent_id directly in DB (simulating composite member)
      const childId = `e3-child-${RUN}`;
      await env.DB.prepare(`
        INSERT INTO vcc_assets (id, asset_code, name, asset_type, department, parent_id, status, is_group, created_at, updated_at)
        VALUES (?, ?, ?, 'ตุ้มน้ำหนักมาตรฐาน', 'QC', ?, 'ACTIVE', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      `).bind(childId, `E3-CHILD-${RUN}`, `ตุ้มน้ำหนักย่อย ${RUN}`, parentId).run();

      // 3. Attempt to retire parent while child is ACTIVE -> Must return 409 Conflict
      const retireParentFail = await call('POST', `/api/vcc/assets/${parentId}/retire`, 'QC_L4', {
        reason: 'ขอยกเลิกใช้งานชุดเครื่องมือ'
      });
      expect(retireParentFail.status).toBe(409);
      expect(retireParentFail.body.error).toContain('ไม่สามารถปลดออกกลุ่มเครื่องมือได้ เนื่องจากยังมีเครื่องมือลูกที่ใช้งานอยู่ (ACTIVE)');

      // 4. Retire child asset first
      const retireChild = await call('POST', `/api/vcc/assets/${childId}/retire`, 'QC_L4', {
        reason: 'เกจบล็อกชิ้นนี้สึกหรอ'
      });
      expect(retireChild.status).toBe(200);
      expect(await assetStatus(childId)).toBe('RETIRED');

      // 5. Retiring parent now succeeds
      const retireParentSuccess = await call('POST', `/api/vcc/assets/${parentId}/retire`, 'QC_L4', {
        reason: 'ขอยกเลิกใช้งานทั้งชุดเครื่องมือ'
      });
      expect(retireParentSuccess.status).toBe(200);
      expect(await assetStatus(parentId)).toBe('RETIRED');

      // 6. Attempting to retire an already retired asset returns 409
      const retireAgain = await call('POST', `/api/vcc/assets/${parentId}/retire`, 'QC_L4', {
        reason: 'ปลดซ้ำ'
      });
      expect(retireAgain.status).toBe(409);
      expect(retireAgain.body.error).toContain('เครื่องมือนี้ถูกปลดออกไปแล้ว');

      // 7. Reactivate parent
      const reactivateParent = await call('POST', `/api/vcc/assets/${parentId}/reactivate`, 'QC_L4', {
        reason: 'นำกลับมาใช้งานเป็นชุดสำรอง'
      });
      expect(reactivateParent.status).toBe(200);
      expect(await assetStatus(parentId)).toBe('ACTIVE');

      // 8. Attempting to reactivate an ACTIVE asset returns 409
      const reactivateAgain = await call('POST', `/api/vcc/assets/${parentId}/reactivate`, 'QC_L4', {
        reason: 'นำกลับมาใช้งานซ้ำ'
      });
      expect(reactivateAgain.status).toBe(409);
      expect(reactivateAgain.body.error).toContain('เครื่องมือนี้ไม่ได้อยู่ในสถานะปลดออก');
    });
  });

  describe('2. Reschedule Governance: Race Condition & Concurrency Guard', () => {
    it('concurrent approve vs reject on pending reschedule leaves exactly one outcome and one audit row', async () => {
      // 1. Create asset and work order
      const asset = await call('POST', '/api/vcc/assets', 'DCC', {
        asset_code: `E3-RESCHED-${RUN}`,
        name: `[ข้อมูลทดสอบ] เครื่องมือทดสอบเลื่อนวัน ${RUN}`,
        asset_type: 'เวอร์เนียร์คาลิปเปอร์',
        department: 'QC'
      });
      const wo = await call('POST', '/api/vcc/work-orders', 'QC_L4', {
        asset_id: asset.body.asset.id,
        provider_name: 'ห้องแล็บทดสอบ',
        due_date: '2026-11-30'
      });
      const woId = wo.body.workOrder.id;

      // 2. Submit reschedule request
      const reqRes = await call('POST', `/api/vcc/work-orders/${woId}/request-reschedule`, 'QC_L2', {
        proposed_due_date: '2026-12-25',
        reason: 'รอชิ้นส่วนเทียบมาตรฐาน'
      });
      expect(reqRes.status).toBe(200);
      expect(reqRes.body.workOrder.reschedule_status).toBe('REQUESTED');
      expect(reqRes.body.workOrder.due_date).toBe('2026-11-30'); // Due date UNCHANGED until approval

      // 3. Race condition: Approver A approves, Approver B rejects concurrently
      const [decisionA, decisionB] = await Promise.all([
        call('POST', `/api/vcc/work-orders/${woId}/approve-reschedule`, 'QC_L4', { comment: 'อนุมัติเลื่อนกำหนด' }),
        call('POST', `/api/vcc/work-orders/${woId}/reject-reschedule`, 'QC_L4B', { reason: 'ไม่อนุมัติ ต้องส่งซ่อมด่วน' })
      ]);

      expect([decisionA.status, decisionB.status].sort()).toEqual([200, 409]);
      const winner = decisionA.status === 200 ? 'APPROVED' : 'REJECTED';

      const finalWo = (await call('GET', `/api/vcc/work-orders/${woId}`, 'QC_L4')).body.workOrder;
      expect(finalWo.reschedule_status).toBe(winner);
      if (winner === 'APPROVED') {
        expect(finalWo.due_date).toBe('2026-12-25');
        expect(await auditCount('VCC_WO_RESCHEDULE_APPROVED', woId)).toBe(1);
        expect(await auditCount('VCC_WO_RESCHEDULE_REJECTED', woId)).toBe(0);
      } else {
        expect(finalWo.due_date).toBe('2026-11-30');
        expect(await auditCount('VCC_WO_RESCHEDULE_APPROVED', woId)).toBe(0);
        expect(await auditCount('VCC_WO_RESCHEDULE_REJECTED', woId)).toBe(1);
      }
    });
  });

  describe('3. NC & Hold Release: Multi-NC Asset Protection & SoD', () => {
    it('asset remains ON_HOLD if a second work order has an open NC, and performer cannot self-release', async () => {
      // 1. Create asset
      const asset = await call('POST', '/api/vcc/assets', 'DCC', {
        asset_code: `E3-MULTINC-${RUN}`,
        name: `[ข้อมูลทดสอบ] เครื่องวัดความหนา ${RUN}`,
        asset_type: 'นาฬิกาจับเวลา',
        department: 'QC'
      });
      const assetId = asset.body.asset.id;

      // 2. Create TWO work orders for the same asset
      const wo1 = await call('POST', '/api/vcc/work-orders', 'QC_L4', {
        asset_id: assetId,
        provider_name: 'ทวนสอบภายใน',
        due_date: '2026-10-31'
      });
      const wo2 = await call('POST', '/api/vcc/work-orders', 'QC_L4', {
        asset_id: assetId,
        provider_name: 'ทวนสอบภายใน',
        due_date: '2026-11-30'
      });
      const wo1Id = wo1.body.workOrder.id;
      const wo2Id = wo2.body.workOrder.id;

      // 3. Submit FAIL on WO1 and close it -> Asset is ON_HOLD
      await call('POST', `/api/vcc/work-orders/${wo1Id}/submit-result`, 'QC_L2', {
        performed_at: yesterday,
        result_status: 'FAIL',
        certificate_no: `CERT-FAIL1-${RUN}`,
        acceptance_criteria: 'Error <= 0.05 mm'
      });
      await call('POST', `/api/vcc/work-orders/${wo1Id}/approve`, 'QC_L4', { comment: 'รับทราบผลไม่ผ่านเกณฑ์ ปิดงาน NC' });
      expect(await assetStatus(assetId)).toBe('ON_HOLD');

      // 4. Submit FAIL on WO2 and close it as well
      await call('POST', `/api/vcc/work-orders/${wo2Id}/submit-result`, 'QC_L4B', {
        performed_at: yesterday,
        result_status: 'FAIL',
        certificate_no: `CERT-FAIL2-${RUN}`,
        acceptance_criteria: 'Error <= 0.05 mm'
      });
      await call('POST', `/api/vcc/work-orders/${wo2Id}/approve`, 'QC_L4', { comment: 'รับทราบผลไม่ผ่านเกณฑ์ใบที่สอง' });
      expect(await assetStatus(assetId)).toBe('ON_HOLD');

      // 5. Performer self-release check: QC_L2 performed WO1 -> Cannot release WO1
      const selfRelease = await call('POST', `/api/vcc/work-orders/${wo1Id}/release-hold`, 'QC_L2', {
        release_reason: 'ปรับตั้งใหม่แล้ว',
        impact_assessment: 'ประเมินแล้วไม่กระทบผลิตภัณฑ์'
      });
      expect(selfRelease.status).toBe(403);

      // 6. Release hold on WO1 by authorized L5 -> WO1 is RELEASED, but asset MUST STAY ON_HOLD because WO2 still has open NC!
      const releaseWo1 = await call('POST', `/api/vcc/work-orders/${wo1Id}/release-hold`, 'QC_L5', {
        release_reason: 'ปรับตั้งเครื่องและเปลี่ยนหัววัดเรียบร้อย',
        impact_assessment: 'ตรวจสอบชิ้นงานที่ผลิตย้อนหลัง 7 วัน ไม่พบผลกระทบต่อคุณภาพ'
      });
      expect(releaseWo1.status).toBe(200);
      expect((await call('GET', `/api/vcc/work-orders/${wo1Id}`, 'QC_L4')).body.workOrder.nc_status).toBe('RELEASED');

      // Invariant: Asset MUST still be ON_HOLD!
      expect(await assetStatus(assetId)).toBe('ON_HOLD');

      // 7. Now release hold on WO2 by authorized L5 -> Asset now becomes ACTIVE!
      const releaseWo2 = await call('POST', `/api/vcc/work-orders/${wo2Id}/release-hold`, 'QC_L5', {
        release_reason: 'สอบเทียบซ้ำผ่านเกณฑ์เรียบร้อย',
        impact_assessment: 'ยืนยันผลการประเมินความสอดคล้องตามเกณฑ์มาตรฐาน'
      });
      expect(releaseWo2.status).toBe(200);
      expect((await call('GET', `/api/vcc/work-orders/${wo2Id}`, 'QC_L4')).body.workOrder.nc_status).toBe('RELEASED');

      // Invariant: Asset is now ACTIVE!
      expect(await assetStatus(assetId)).toBe('ACTIVE');
    });
  });

  describe('4. RBAC & Department Isolation: Certificate Files & Cross-Department Protection', () => {
    it('blocks cross-department and unauthorized department users from accessing certificate downloads (HTTP 403)', async () => {
      // 1. Create QC asset and work order
      const asset = await call('POST', '/api/vcc/assets', 'DCC', {
        asset_code: `E3-SECDOWN-${RUN}`,
        name: `[ข้อมูลทดสอบ] เครื่องวัดความดัน ${RUN}`,
        asset_type: 'Temperature Controller',
        department: 'QC'
      });
      const wo = await call('POST', '/api/vcc/work-orders', 'QC_L4', {
        asset_id: asset.body.asset.id,
        provider_name: 'แล็บภายนอก',
        due_date: '2026-11-30'
      });
      const woId = wo.body.workOrder.id;

      // 2. Submit PASS result with certificate
      await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'QC_L2', {
        performed_at: yesterday,
        result_status: 'PASS',
        certificate_no: `CERT-SEC-${RUN}`,
        acceptance_criteria: '± 0.5 bar'
      });

      // 3. User from WH (non-VCC department) attempting to list certificates -> HTTP 403 (blocked at module gateway)
      const listWh = await call('GET', `/api/vcc/work-orders/${woId}/certificates`, 'WH_L2');
      expect(listWh.status).toBe(403);
      expect(listWh.body.error).toContain('เฉพาะผู้ใช้งานแผนก DCC, QC, QA, MGT และ LB');

      // 4. User from QA (other VCC department, not DCC/QMR) attempting to list certificates -> HTTP 403
      const listQa = await call('GET', `/api/vcc/work-orders/${woId}/certificates`, 'QA_L4');
      expect(listQa.status).toBe(403);
      expect(listQa.body.error).toContain('ไม่มีสิทธิ์เข้าถึงข้อมูลของแผนกนี้');

      // 5. User from QA attempting to download certificate file -> HTTP 403
      const fileQa = await call('GET', `/api/vcc/work-orders/${woId}/certificate-file`, 'QA_L4');
      expect(fileQa.status).toBe(403);
      expect(fileQa.body.error).toContain('ไม่มีสิทธิ์เข้าถึงไฟล์ใบรับรองของแผนกนี้');

      // 6. Authorized QC user can list certificates -> HTTP 200
      const listQc = await call('GET', `/api/vcc/work-orders/${woId}/certificates`, 'QC_L4');
      expect(listQc.status).toBe(200);

      // 7. DCC user has cross-department read access -> HTTP 200
      const listDcc = await call('GET', `/api/vcc/work-orders/${woId}/certificates`, 'DCC');
      expect(listDcc.status).toBe(200);
    });
  });

  describe('5. Functional Edge Cases: Ad-hoc Work Order Isolation & Qualitative Verification', () => {
    it('ad-hoc work orders do not create phantom plan items or corrupt annual plan matrix', async () => {
      // 1. Create asset
      const asset = await call('POST', '/api/vcc/assets', 'DCC', {
        asset_code: `E3-ADHOC-${RUN}`,
        name: `[ข้อมูลทดสอบ] เทอร์โมมิเตอร์พิเศษ ${RUN}`,
        asset_type: 'เทอร์โมมิเตอร์',
        department: 'QC'
      });
      const assetId = asset.body.asset.id;

      // Count plan items before
      const countBefore = (await env.DB.prepare('SELECT COUNT(*) AS n FROM vcc_annual_plan_items WHERE asset_id = ?').bind(assetId).first('n')) || 0;

      // 2. Create Ad-hoc work order (plan_id is null)
      const adhocWo = await call('POST', '/api/vcc/work-orders', 'QC_L4', {
        asset_id: assetId,
        provider_name: 'ทวนสอบภายใน',
        due_date: '2026-11-15'
      });
      expect(adhocWo.status).toBe(201);
      const woId = adhocWo.body.workOrder.id;

      // 3. Submit Qualitative Result
      const qualResult = await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'QC_L2', {
        performed_at: yesterday,
        result_status: 'PASS',
        certificate_no: `CERT-QUAL-${RUN}`,
        acceptance_criteria: 'การตรวจสอบทางกายภาพและแสดงผลถูกต้อง',
        verification_type: 'QUALITATIVE',
        actual_result: 'หน้าจอแสดงผลชัดเจน ไม่พบรอยร้าว ทวนสอบจุดศูนย์ผ่านเกณฑ์'
      });
      expect(qualResult.status).toBe(200);
      expect(qualResult.body.workOrder.verification_type).toBe('QUALITATIVE');
      expect(qualResult.body.workOrder.uncertainty_value).toContain('N/A');
      expect(qualResult.body.workOrder.calibration_error_value).toContain('N/A');

      // 4. Approve and close ad-hoc work order
      const closeRes = await call('POST', `/api/vcc/work-orders/${woId}/approve`, 'QC_L4', { comment: 'ตรวจรับงานทวนสอบฉบับพิเศษ' });
      expect(closeRes.status).toBe(200);
      expect(closeRes.body.workOrder.status).toBe('CLOSED');

      // 5. Invariant: Plan items count remains identical (0 phantom items created)
      const countAfter = (await env.DB.prepare('SELECT COUNT(*) AS n FROM vcc_annual_plan_items WHERE asset_id = ?').bind(assetId).first('n')) || 0;
      expect(countAfter).toBe(countBefore);
    });

    it('strictly rejects quantitative submission when attempting qualitative N/A waiver (HTTP 400)', async () => {
      const asset = await call('POST', '/api/vcc/assets', 'DCC', {
        asset_code: `E3-QUANT-${RUN}`,
        name: `[ข้อมูลทดสอบ] เครื่องตรวจจับโลหะดิจิตอล ${RUN}`,
        asset_type: 'เครื่องตรวจจับโลหะ',
        department: 'QC'
      });
      const wo = await call('POST', '/api/vcc/work-orders', 'QC_L4', {
        asset_id: asset.body.asset.id,
        provider_name: 'ห้องปฏิบัติการ',
        due_date: '2026-11-20'
      });
      const woId = wo.body.workOrder.id;

      // Quantitative submission with qualitative N/A uncertainty waiver -> Must return 400
      const quantFail = await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'QC_L2', {
        performed_at: yesterday,
        result_status: 'PASS',
        certificate_no: `CERT-QUANT-${RUN}`,
        acceptance_criteria: 'Error <= 0.01 bar',
        verification_type: 'QUANTITATIVE',
        uncertainty_value: 'N/A (การทวนสอบเชิงคุณภาพ ไม่นำมาคำนวณ)'
      });
      expect(quantFail.status).toBe(400);
      expect(quantFail.body.error).toContain('ไม่อนุญาตให้ใช้ข้อยกเว้น N/A');

      // Qualitative submission without actual_result -> Must return 400
      const qualEmptyFail = await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'QC_L2', {
        performed_at: yesterday,
        result_status: 'PASS',
        certificate_no: `CERT-QUANT-EMPTY-${RUN}`,
        acceptance_criteria: 'Error <= 0.01 bar',
        verification_type: 'QUALITATIVE',
        actual_result: '   '
      });
      expect(qualEmptyFail.status).toBe(400);
      expect(qualEmptyFail.body.error).toContain('จำเป็นต้องระบุผลการตรวจสอบจริง');
    });
  });
});
