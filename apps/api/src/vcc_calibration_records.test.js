import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';
import { computeSha256 } from './vccWorkOrders.js';

describe('VCC Phase 3.2: Calibration Execution, Digital Certificates & Controlled Amendments (Milestone M1)', () => {
  let proxy;
  let env;
  const tokens = {};
  const PASSWORD = 'vcc-m1-pass-123456';
  const SAMPLE_PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Title (Calibration Certificate) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');

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

  const uploadCert = async (woId, who, body = SAMPLE_PDF, query = '', customEnv = env) => {
    const res = await app.request(
      `/api/vcc/work-orders/${woId}/certificate-file${query}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf', Authorization: `Bearer ${tokens[who]}` },
        body
      },
      customEnv
    );
    return { status: res.status, body: await res.json() };
  };

  const downloadCert = async (woId, who, query = '') => {
    return app.request(
      `/api/vcc/work-orders/${woId}/certificate-file${query}`,
      {
        headers: { Authorization: `Bearer ${tokens[who]}` }
      },
      env
    );
  };

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword(PASSWORD);

    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('M1QC', 'แผนก QC M1', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('M1OTHER', 'แผนกอื่น M1', 'ACTIVE')"),
      ...[
        ['M1-PERF', 2, 1, 'M1QC'],
        ['M1-REV4', 4, 1, 'M1QC'],
        ['M1-APP5', 5, 1, 'M1QC'],
        ['M1-APP5-2', 5, 1, 'M1QC'],
        ['M1-PERF5', 5, 1, 'M1QC'],
        ['M1-OTHER', 4, 1, 'M1OTHER'],
        ['M1-NONDCC', 4, 0, 'M1QC']
      ].map(([id, level, dcc, dept]) =>
        env.DB.prepare(
          `INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
           VALUES (?, ?, ?, ?, 'USER', ?, ?, ?, ?)`
        ).bind(id, id, `${id}@vccm1.local`, hash, level, dept, JSON.stringify([dept]), dcc)
      )
    ]);

    for (const id of ['M1-PERF', 'M1-REV4', 'M1-APP5', 'M1-APP5-2', 'M1-PERF5', 'M1-OTHER', 'M1-NONDCC']) {
      const res = await app.request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `${id}@vccm1.local`, password: PASSWORD })
        },
        env
      );
      tokens[id] = (await res.json()).token;
    }
  });

  afterAll(async () => {
    try {
      await env.DB.batch([
        // Derived alerts point at assets and work orders; clear them first or the wipe below hits a foreign key.
        env.DB.prepare('DELETE FROM vcc_notifications'),
        env.DB.prepare('DELETE FROM vcc_work_order_amendment_requests'),
        env.DB.prepare('DELETE FROM vcc_work_order_amendments'),
        env.DB.prepare('DELETE FROM vcc_work_order_certificates'),
        env.DB.prepare('DELETE FROM vcc_work_orders'),
        env.DB.prepare('DELETE FROM vcc_plan_cycles'),
        env.DB.prepare('DELETE FROM vcc_annual_plan_items'),
        env.DB.prepare('DELETE FROM vcc_annual_plans'),
        env.DB.prepare('DELETE FROM vcc_assets')
      ]);
    } catch (_) {}
    await proxy?.dispose();
  });

  it('computes correct SHA-256 hash for raw certificate bytes', async () => {
    const hash = await computeSha256(SAMPLE_PDF);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(64);
  });

  it('submits calibration result with full measurement traceability & environmental metadata', async () => {
    // 1. Create asset
    const assetRes = await call('POST', '/api/vcc/assets', 'M1-REV4', {
      asset_code: 'BAL-M1-01',
      name: '[ข้อมูลทดสอบ] เครื่องชั่งความละเอียดสูง M1-01',
      asset_type: 'เครื่องชั่ง',
      department: 'M1QC'
    });
    const assetId = assetRes.body.asset.id;

    // 2. Insert work order
    const woId = 'WO-M1-TEST-01';
    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, asset_id, provider_name, planned_month, baseline_planned_date,
        scheduled_date, due_date, original_due_date, required_due_date, status, result_status,
        created_by, updated_by
      ) VALUES (?, ?, ?, 'ทวนสอบภายใน', 1, '2026-01-15', '2026-01-15', '2026-01-15', '2026-01-15', '2026-01-15', 'OPEN', 'PENDING', 'M1-PERF', 'M1-PERF')
    `).bind(woId, 'WO-2026-01-BAL01', assetId).run();

    // 3. Validation: rejects invalid date format and future dates
    const invalidDateRes = await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'M1-PERF', {
      performed_at: '2026-99-99',
      result_status: 'PASS',
      certificate_no: 'CERT-2026-001',
      acceptance_criteria: '± 0.05 g'
    });
    expect(invalidDateRes.status).toBe(400);

    const futureDateRes = await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'M1-PERF', {
      performed_at: '2099-01-01',
      result_status: 'PASS',
      certificate_no: 'CERT-2026-001',
      acceptance_criteria: '± 0.05 g'
    });
    expect(futureDateRes.status).toBe(400);

    // 4. Submit valid execution record with full metadata
    const submitRes = await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'M1-PERF', {
      performed_at: '2026-01-10',
      result_status: 'PASS',
      certificate_no: 'CERT-M1-2026-001',
      acceptance_criteria: '± 0.05 g',
      result_remarks: 'การสอบเทียบเรียบร้อย ค่าความเที่ยงตรงผ่านเกณฑ์',
      calibration_provider_name: 'ห้องปฏิบัติการสอบเทียบมาตรฐาน ISO/IEC 17025',
      calibration_method: 'WI-CAL-01 In-house Calibration Method',
      traceability_ref: 'Standard Weight Set Class E2 (Cert: REF-NIMT-9988)',
      environmental_conditions: 'Temp: 22.5 °C, Humidity: 50% RH',
      uncertainty_value: '± 0.012 g (k=2, 95% CL)',
      calibration_error_value: '+0.005 g',
      certificate_issue_date: '2026-01-10',
      certificate_valid_until: '2027-01-09'
    });

    expect(submitRes.status).toBe(200);
    const wo = submitRes.body.workOrder;
    expect(wo.status).toBe('PENDING_REVIEW');
    expect(wo.result_status).toBe('PASS');
    expect(wo.certificate_no).toBe('CERT-M1-2026-001');
    expect(wo.calibration_provider_name).toBe('ห้องปฏิบัติการสอบเทียบมาตรฐาน ISO/IEC 17025');
    expect(wo.calibration_method).toBe('WI-CAL-01 In-house Calibration Method');
    expect(wo.traceability_ref).toBe('Standard Weight Set Class E2 (Cert: REF-NIMT-9988)');
    expect(wo.environmental_conditions).toBe('Temp: 22.5 °C, Humidity: 50% RH');
    expect(wo.uncertainty_value).toBe('± 0.012 g (k=2, 95% CL)');
    expect(wo.calibration_error_value).toBe('+0.005 g');
    expect(wo.certificate_issue_date).toBe('2026-01-10');
    expect(wo.certificate_valid_until).toBe('2027-01-09');
    expect(wo.performed_by_name).toBe('M1-PERF');

    // Asset status remains ACTIVE
    const assetRow = await env.DB.prepare('SELECT status FROM vcc_assets WHERE id = ?').bind(assetId).first();
    expect(assetRow.status).toBe('ACTIVE');
  });

  it('automatically sets equipment status to ON_HOLD when calibration result is FAIL and restores to ACTIVE upon L5+ release with impact assessment', async () => {
    // 1. Create asset
    const assetRes = await call('POST', '/api/vcc/assets', 'M1-REV4', {
      asset_code: 'OVEN-M1-01',
      name: '[ข้อมูลทดสอบ] เครื่องควบคุมอุณหภูมิตู้อบ M1-01',
      asset_type: 'Temperature Controller',
      department: 'M1QC'
    });
    const assetId = assetRes.body.asset.id;

    // 2. Insert work order
    const woId = 'WO-M1-FAIL-01';
    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, asset_id, provider_name, planned_month, baseline_planned_date,
        scheduled_date, due_date, original_due_date, required_due_date, status, result_status,
        created_by, updated_by
      ) VALUES (?, ?, ?, 'ภายนอก', 2, '2026-02-15', '2026-02-15', '2026-02-15', '2026-02-15', '2026-02-15', 'OPEN', 'PENDING', 'M1-PERF', 'M1-PERF')
    `).bind(woId, 'WO-2026-02-OVEN01', assetId).run();

    // 3. Submit FAIL result
    const failRes = await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'M1-PERF', {
      performed_at: '2026-02-10',
      result_status: 'FAIL',
      certificate_no: 'CERT-OVEN-FAIL-01',
      acceptance_criteria: '± 2.0 °C',
      result_remarks: 'อุณหภูมิจริงเบี่ยงเบน +5.5 °C เกินเกณฑ์ยอมรับ',
      calibration_error_value: '+5.5 °C'
    });

    expect(failRes.status).toBe(200);
    expect(failRes.body.workOrder.result_status).toBe('FAIL');
    expect(failRes.body.workOrder.nc_status).toBe('OPEN');

    // Equipment must be automatically marked ON_HOLD
    const heldAsset = await env.DB.prepare('SELECT status FROM vcc_assets WHERE id = ?').bind(assetId).first();
    expect(heldAsset.status).toBe('ON_HOLD');

    // 4. Release Hold authorization checks
    // Non-L5 (L4) cannot release hold
    const unauthorizedRelease = await call('POST', `/api/vcc/work-orders/${woId}/release-hold`, 'M1-REV4', {
      impact_assessment: 'ทดสอบการปลดระงับโดย L4'
    });
    expect(unauthorizedRelease.status).toBe(403);

    // Missing impact assessment rejected
    const missingAssessment = await call('POST', `/api/vcc/work-orders/${woId}/release-hold`, 'M1-APP5', {
      impact_assessment: ''
    });
    expect(missingAssessment.status).toBe(400);

    // L5 authorized release with mandatory impact assessment
    const validRelease = await call('POST', `/api/vcc/work-orders/${woId}/release-hold`, 'M1-APP5', {
      impact_assessment: 'ตรวจสอบย้อนหลังผลิตภัณฑ์รุ่น Batch 2026-01 แล้ว พบว่าไม่มีผลกระทบต่อความปลอดภัยอาหาร ทำการปรับแต่ง Temperature Controller และสอบเทียบซ้ำผ่านเรียบร้อย'
    });
    expect(validRelease.status).toBe(200);
    expect(validRelease.body.workOrder.nc_status).toBe('RELEASED');
    expect(validRelease.body.workOrder.hold_released_by_name).toBe('M1-APP5');

    // Equipment status restored to ACTIVE
    const releasedAsset = await env.DB.prepare('SELECT status FROM vcc_assets WHERE id = ?').bind(assetId).first();
    expect(releasedAsset.status).toBe('ACTIVE');
  });

  it('manages digital certificate uploads with SHA-256 integrity hash, multi-version history, and streaming download', async () => {
    // 1. Create asset and work order
    const assetRes = await call('POST', '/api/vcc/assets', 'M1-REV4', {
      asset_code: 'CAL-M1-CERT',
      name: '[ข้อมูลทดสอบ] เครื่องมือวัดสำหรับทดสอบใบรับรอง',
      asset_type: 'เวอร์เนียร์คาลิปเปอร์',
      department: 'M1QC'
    });
    const assetId = assetRes.body.asset.id;
    const woId = 'WO-M1-CERT-01';

    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, asset_id, provider_name, planned_month, baseline_planned_date,
        scheduled_date, due_date, original_due_date, required_due_date, status, result_status,
        created_by, updated_by
      ) VALUES (?, ?, ?, 'ทวนสอบภายใน', 1, '2026-01-15', '2026-01-15', '2026-01-15', '2026-01-15', '2026-01-15', 'OPEN', 'PENDING', 'M1-PERF', 'M1-PERF')
    `).bind(woId, 'WO-2026-01-CERT01', assetId).run();

    // 2. Reject non-PDF file
    const textBytes = new TextEncoder().encode('Hello, this is not a PDF file');
    const badUpload = await uploadCert(woId, 'M1-PERF', textBytes);
    expect(badUpload.status).toBe(400);
    expect(badUpload.body.error).toContain('PDF');

    // 2.1 R2 Unavailable: When c.env.FILES is missing, returns 503 and does NOT write metadata
    const certV1Bytes = new TextEncoder().encode('%PDF-1.4\nCertificate Version 1 Data\n%%EOF');
    const noR2Upload = await uploadCert(
      woId,
      'M1-PERF',
      certV1Bytes,
      '?filename=cert-nor2.pdf&certificate_no=CERT-NOR2',
      { ...env, FILES: undefined }
    );
    expect(noR2Upload.status).toBe(503);
    expect(noR2Upload.body.error).toContain('R2');
    const certCountNoR2 = await env.DB.prepare('SELECT COUNT(*) as c FROM vcc_work_order_certificates WHERE work_order_id = ?').bind(woId).first();
    expect(certCountNoR2.c).toBe(0);
    const woNoR2 = await env.DB.prepare('SELECT certificate_file_name FROM vcc_work_orders WHERE id = ?').bind(woId).first();
    expect(woNoR2.certificate_file_name).toBeNull();

    // 2.2 R2 Put Failure: When c.env.FILES.put throws an error, returns 500 and does NOT write metadata
    const mockBrokenR2 = { put: () => Promise.reject(new Error('Simulated R2 connection reset')) };
    const failPutUpload = await uploadCert(
      woId,
      'M1-PERF',
      certV1Bytes,
      '?filename=cert-fail.pdf&certificate_no=CERT-FAIL',
      { ...env, FILES: mockBrokenR2 }
    );
    expect(failPutUpload.status).toBe(500);
    expect(failPutUpload.body.error).toContain('การอัปโหลดไฟล์ใบรับรองไปยังระบบจัดเก็บ R2 ล้มเหลว');
    const certCountFail = await env.DB.prepare('SELECT COUNT(*) as c FROM vcc_work_order_certificates WHERE work_order_id = ?').bind(woId).first();
    expect(certCountFail.c).toBe(0);
    const woFail = await env.DB.prepare('SELECT certificate_file_name FROM vcc_work_orders WHERE id = ?').bind(woId).first();
    expect(woFail.certificate_file_name).toBeNull();

    // 3. Upload Version 1 Certificate
    const v1Hash = await computeSha256(certV1Bytes);

    const up1 = await uploadCert(
      woId,
      'M1-PERF',
      certV1Bytes,
      '?filename=cert-v1.pdf&certificate_no=CERT-V1-001&issue_date=2026-01-10&valid_until=2027-01-09'
    );
    expect(up1.status).toBe(200);
    expect(up1.body.certificate_version).toBe(1);
    expect(up1.body.file_hash).toBe(v1Hash);

    const woAfterV1 = up1.body.workOrder;
    expect(woAfterV1.certificate_file_name).toBe('cert-v1.pdf');
    expect(woAfterV1.certificate_file_hash).toBe(v1Hash);
    expect(woAfterV1.certificate_version).toBe(1);
    expect(woAfterV1.certificate_uploaded_by_name).toBe('M1-PERF');

    // 4. Upload Version 2 Certificate (Revision / Re-issue)
    const certV2Bytes = new TextEncoder().encode('%PDF-1.4\nCertificate Version 2 Corrected Lab Data\n%%EOF');
    const v2Hash = await computeSha256(certV2Bytes);

    const up2 = await uploadCert(
      woId,
      'M1-PERF',
      certV2Bytes,
      '?filename=cert-v2-corrected.pdf&certificate_no=CERT-V2-002&change_reason=แก้ไขเลขอ้างอิงจากแล็บ'
    );
    expect(up2.status).toBe(200);
    expect(up2.body.certificate_version).toBe(2);
    expect(up2.body.file_hash).toBe(v2Hash);

    // 5. Query Certificate Version History
    const certListRes = await call('GET', `/api/vcc/work-orders/${woId}/certificates`, 'M1-PERF');
    expect(certListRes.status).toBe(200);
    const certs = certListRes.body.certificates;
    expect(certs.length).toBe(2);
    expect(certs[0].version).toBe(2);
    expect(certs[0].file_name).toBe('cert-v2-corrected.pdf');
    expect(certs[0].file_hash).toBe(v2Hash);
    expect(certs[1].version).toBe(1);
    expect(certs[1].file_name).toBe('cert-v1.pdf');
    expect(certs[1].file_hash).toBe(v1Hash);

    // 6. Stream/Download Certificate from R2
    // Download latest (version 2)
    const dlLatest = await downloadCert(woId, 'M1-REV4', '?purpose=view');
    expect(dlLatest.status).toBe(200);
    expect(dlLatest.headers.get('content-type')).toBe('application/pdf');
    const dlLatestBytes = new Uint8Array(await dlLatest.arrayBuffer());
    expect(new TextDecoder().decode(dlLatestBytes)).toContain('Certificate Version 2');

    // Download historical version 1
    const dlV1 = await downloadCert(woId, 'M1-REV4', '?version=1&purpose=download');
    expect(dlV1.status).toBe(200);
    expect(dlV1.headers.get('content-disposition')).toContain('attachment');
    const dlV1Bytes = new Uint8Array(await dlV1.arrayBuffer());
    expect(new TextDecoder().decode(dlV1Bytes)).toContain('Certificate Version 1');
  });

  it('enforces controlled amendment with snapshot history, RBAC, and Segregation of Duties on CLOSED work orders', async () => {
    // 1. Create asset and work order
    const assetRes = await call('POST', '/api/vcc/assets', 'M1-REV4', {
      asset_code: 'TEMP-M1-AMEND',
      name: '[ข้อมูลทดสอบ] เทอร์โมมิเตอร์สำหรับทดสอบการขอแก้ไข (Amendment)',
      asset_type: 'เทอร์โมมิเตอร์',
      department: 'M1QC'
    });
    const assetId = assetRes.body.asset.id;
    const woId = 'WO-M1-AMEND-01';

    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, asset_id, provider_name, planned_month, baseline_planned_date,
        scheduled_date, due_date, original_due_date, required_due_date, status, result_status,
        created_by, updated_by
      ) VALUES (?, ?, ?, 'ทวนสอบภายใน', 1, '2026-01-15', '2026-01-15', '2026-01-15', '2026-01-15', '2026-01-15', 'OPEN', 'PENDING', 'M1-PERF', 'M1-PERF')
    `).bind(woId, 'WO-2026-01-AMEND01', assetId).run();

    // 2. Submit result
    await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'M1-PERF', {
      performed_at: '2026-01-12',
      result_status: 'PASS',
      certificate_no: 'CERT-AMEND-INITIAL',
      acceptance_criteria: '± 0.5 °C',
      result_remarks: 'ค่าแรกเริ่มผ่านเกณฑ์'
    });

    // 3. Amendment rejected before CLOSE
    const amendBeforeClose = await call('POST', `/api/vcc/work-orders/${woId}/amendment-requests`, 'M1-REV4', {
      amendment_reason: 'พยายามแก้ไขก่อนปิดงาน',
      result_remarks: 'แก้ก่อนปิด'
    });
    expect(amendBeforeClose.status).toBe(409);

    // 4. Reviewer approves -> work order becomes CLOSED
    const approveRes = await call('POST', `/api/vcc/work-orders/${woId}/approve`, 'M1-REV4', {
      comment: 'ตรวจรับและปิดงานเรียบร้อย'
    });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.workOrder.status).toBe('CLOSED');

    // 5. Direct file upload is now blocked on CLOSED work order
    const uploadOnClosed = await uploadCert(woId, 'M1-PERF', SAMPLE_PDF);
    expect(uploadOnClosed.status).toBe(409);
    expect(uploadOnClosed.body.error).toContain('Amendment');

    // 6. Validation: Empty amendment reason is rejected
    const noReasonAmend = await call('POST', `/api/vcc/work-orders/${woId}/amendment-requests`, 'M1-REV4', {
      amendment_reason: ''
    });
    expect(noReasonAmend.status).toBe(400);

    // 7. Validation: Requester level < 4 is rejected
    const l2Requester = await call('POST', `/api/vcc/work-orders/${woId}/amendment-requests`, 'M1-PERF', {
      amendment_reason: 'ช่าง L2 พยายามยื่นขอแก้ไข'
    });
    expect(l2Requester.status).toBe(403);
    expect(l2Requester.body.error).toContain('L4');

    // 8. Segregation of Duties Testing on work order woL5Id (performer is M1-PERF5 with L5)
    const woL5Id = 'WO-M1-AMEND-L5PERF';
    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, asset_id, provider_name, planned_month, baseline_planned_date,
        scheduled_date, due_date, original_due_date, required_due_date, status, result_status,
        performed_by, performed_at, created_by, updated_by
      ) VALUES (?, 'WO-2026-01-AMENDL5', ?, 'ทวนสอบภายใน', 1, '2026-01-15', '2026-01-15', '2026-01-15', '2026-01-15', '2026-01-15', 'CLOSED', 'PASS', 'M1-PERF5', '2026-01-12', 'M1-PERF5', 'M1-PERF5')
    `).bind(woL5Id, assetId).run();

    // Step 8.1: M1-APP5 submits amendment request (recorded on server as requested_by: M1-APP5)
    const reqL5Res = await call('POST', `/api/vcc/work-orders/${woL5Id}/amendment-requests`, 'M1-APP5', {
      amendment_reason: 'ขอแก้ไขค่าความผิดพลาดตามใบรับรองฉบับใหม่'
    });
    expect(reqL5Res.status).toBe(201);
    const reqL5Id = reqL5Res.body.request.id;
    expect(reqL5Res.body.request.requested_by).toBe('M1-APP5');

    // Negative Test 8.2: Performer with L5+ cannot approve their own amendment
    const perf5Approve = await call('POST', `/api/vcc/work-orders/${woL5Id}/amendment-requests/${reqL5Id}/approve`, 'M1-PERF5', {});
    expect(perf5Approve.status).toBe(403);
    expect(perf5Approve.body.error).toContain('การคัดแยกหน้าที่');

    // Negative Test 8.3: Requester cannot approve their own amendment when omitting requested_by from client body
    const reqOmitApprove = await call('POST', `/api/vcc/work-orders/${woL5Id}/amendment-requests/${reqL5Id}/approve`, 'M1-APP5', {});
    expect(reqOmitApprove.status).toBe(403);
    expect(reqOmitApprove.body.error).toContain('ผู้ร้องขอแก้ไขผลไม่สามารถอนุมัติ');

    // Negative Test 8.4: Requester cannot approve by spoofing requested_by in client body (Server loads requested_by from DB)
    const reqSpoofApprove = await call('POST', `/api/vcc/work-orders/${woL5Id}/amendment-requests/${reqL5Id}/approve`, 'M1-APP5', {
      requested_by: 'M1-OTHER'
    });
    expect(reqSpoofApprove.status).toBe(403);
    expect(reqSpoofApprove.body.error).toContain('ผู้ร้องขอแก้ไขผลไม่สามารถอนุมัติ');

    // Positive Test 8.5: Separate authorized L5 approver approves the amendment request
    const separateL5Approve = await call('POST', `/api/vcc/work-orders/${woL5Id}/amendment-requests/${reqL5Id}/approve`, 'M1-APP5-2', {
      comment: 'ผู้อนุมัติแยกคนอนุมัติการแก้ไขอย่างถูกต้อง'
    });
    expect(separateL5Approve.status).toBe(200);

    // 9. Authorized Amendment Workflow on woId (Seq 1: changing PASS to FAIL)
    // Step 9.1: M1-REV4 submits request to amend result to FAIL
    const reqFailRes = await call('POST', `/api/vcc/work-orders/${woId}/amendment-requests`, 'M1-REV4', {
      result_status: 'FAIL',
      certificate_no: 'CERT-AMEND-REV-01',
      result_remarks: 'แก้ไขผลเป็น FAIL เนื่องจากผลทดสอบ Drift เกินค่ามาตรฐานที่กำหนด',
      amendment_reason: 'พบข้อผิดพลาดในการคำนวณ Drift ของแล็บภายนอก จึงขอแก้ไขผลเป็นไม่ผ่านตาม ISO/IEC 17025 clause 7.8.8'
    });
    expect(reqFailRes.status).toBe(201);
    const reqFailId = reqFailRes.body.request.id;

    // Negative Test 9.2: Amendment changing status to FAIL requires L5+ (L4 blocked)
    const l4FailApprove = await call('POST', `/api/vcc/work-orders/${woId}/amendment-requests/${reqFailId}/approve`, 'M1-REV4', {});
    expect(l4FailApprove.status).toBe(403);
    expect(l4FailApprove.body.error).toContain('การคัดแยกหน้าที่');

    // Positive Test 9.3: Authorized L5 Approver approves changing to FAIL
    const validAmend1 = await call('POST', `/api/vcc/work-orders/${woId}/amendment-requests/${reqFailId}/approve`, 'M1-APP5', {
      comment: 'อนุมัติการแก้ไขเป็น FAIL ตามผลแล็บ'
    });
    expect(validAmend1.status).toBe(200);
    expect(validAmend1.body.amendment_seq).toBe(1);
    const woAmended = validAmend1.body.workOrder;
    expect(woAmended.is_amended).toBe(1);
    expect(woAmended.result_status).toBe('FAIL');
    expect(woAmended.nc_status).toBe('OPEN');
    expect(woAmended.amended_by_name).toBe('M1-APP5');

    // Asset status automatically shifted to ON_HOLD
    const heldAfterAmend = await env.DB.prepare('SELECT status FROM vcc_assets WHERE id = ?').bind(assetId).first();
    expect(heldAfterAmend.status).toBe('ON_HOLD');

    // 10. FAIL -> PASS Amendment must NEVER auto-release NC or auto-clear ON_HOLD (Issue 2)
    // Step 10.1: M1-REV4 submits request to amend back to PASS
    const reqPassRes = await call('POST', `/api/vcc/work-orders/${woId}/amendment-requests`, 'M1-REV4', {
      result_status: 'PASS',
      certificate_no: 'CERT-AMEND-REV-02',
      result_remarks: 'แล็บส่งใบรับรองฉบับแก้ไข ผลสอบเทียบผ่านเกณฑ์แล้ว',
      amendment_reason: 'สถาบันสอบเทียบได้ดำเนินการสอบเทียบซ้ำและออกใบรับรองที่ถูกต้อง ผลการวัดผ่านเกณฑ์ยอมรับ'
    });
    expect(reqPassRes.status).toBe(201);
    const reqPassId = reqPassRes.body.request.id;

    // Step 10.2: L5 Approver (M1-APP5-2) approves PASS amendment
    const validAmend2 = await call('POST', `/api/vcc/work-orders/${woId}/amendment-requests/${reqPassId}/approve`, 'M1-APP5-2', {
      comment: 'อนุมัติผลฉบับแก้ไขเป็น PASS'
    });
    expect(validAmend2.status).toBe(200);
    expect(validAmend2.body.amendment_seq).toBe(2);
    const woAmended2 = validAmend2.body.workOrder;
    expect(woAmended2.result_status).toBe('PASS');
    expect(woAmended2.nc_status).toBe('OPEN'); // NC MUST remain OPEN, NOT auto-released!

    const assetStillHeld = await env.DB.prepare('SELECT status FROM vcc_assets WHERE id = ?').bind(assetId).first();
    expect(assetStillHeld.status).toBe('ON_HOLD'); // Asset MUST remain ON_HOLD, NOT auto-reverted to ACTIVE!

    // 11. Hold Release Workflow: To release ON_HOLD, authorized L5+ must submit impact assessment
    const releaseRes = await call('POST', `/api/vcc/work-orders/${woId}/release-hold`, 'M1-APP5', {
      impact_assessment: 'ประเมินผลกระทบย้อนหลังต่อผลิตภัณฑ์ล็อตที่ใช้เครื่องมือนี้แล้ว ไม่พบความเสี่ยงเนื่องจากค่าเบี่ยงเบนอยู่ในขอบเขตปลอดภัย'
    });
    expect(releaseRes.status).toBe(200);
    expect(releaseRes.body.workOrder.nc_status).toBe('RELEASED');

    const assetReleased = await env.DB.prepare('SELECT status FROM vcc_assets WHERE id = ?').bind(assetId).first();
    expect(assetReleased.status).toBe('ACTIVE');

    // 12. Verify Audit Trail for Amendment Request & Approval
    const auditReqRes = await env.DB.prepare(
      "SELECT action, details FROM audit_log WHERE action = 'VCC_WO_AMENDMENT_REQUESTED' AND details LIKE ?"
    ).bind(`%${woId}%`).all();
    expect(auditReqRes.results.length).toBeGreaterThanOrEqual(1);

    const auditAppRes = await env.DB.prepare(
      "SELECT action, details FROM audit_log WHERE action = 'VCC_WO_AMENDMENT_APPROVED' AND details LIKE ? ORDER BY id ASC"
    ).bind(`%${woId}%`).all();
    expect(auditAppRes.results.length).toBe(2);
    const parsedAudit1 = JSON.parse(auditAppRes.results[0].details);
    expect(parsedAudit1.approved_by).toBe('M1-APP5');
    expect(parsedAudit1.original_performer).toBe('M1-PERF');
    expect(parsedAudit1.requested_by).toBe('M1-REV4');

    const parsedAudit2 = JSON.parse(auditAppRes.results[1].details);
    expect(parsedAudit2.approved_by).toBe('M1-APP5-2');
    expect(parsedAudit2.original_performer).toBe('M1-PERF');
    expect(parsedAudit2.requested_by).toBe('M1-REV4');

    // 13. Query Amendment History
    const amendListRes = await call('GET', `/api/vcc/work-orders/${woId}/amendments`, 'M1-REV4');
    expect(amendListRes.status).toBe(200);
    const amendments = amendListRes.body.amendments;
    expect(amendments.length).toBe(2);
    expect(amendments[0].amendment_seq).toBe(2);
    expect(amendments[0].amended_by_name).toBe('M1-APP5-2');
    expect(amendments[0].snapshot.result_status).toBe('FAIL'); // Pre-amendment state before Seq 2
    expect(amendments[1].amendment_seq).toBe(1);
    expect(amendments[1].amended_by_name).toBe('M1-APP5');
    expect(amendments[1].snapshot.result_status).toBe('PASS'); // Original state was preserved in Seq 1
    expect(amendments[1].amendment_reason).toContain('ISO/IEC 17025 clause 7.8.8');

    // 14. Query Amendment Requests
    const amendReqListRes = await call('GET', `/api/vcc/work-orders/${woId}/amendment-requests`, 'M1-REV4');
    expect(amendReqListRes.status).toBe(200);
    expect(amendReqListRes.body.requests.length).toBe(2);
    expect(amendReqListRes.body.requests[0].status).toBe('APPROVED');

    // 15. Work Order Full Detail View includes certificates, amendments, and amendment requests
    const detailRes = await call('GET', `/api/vcc/work-orders/${woId}`, 'M1-REV4');
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.workOrder.is_amended).toBe(1);
    expect(Array.isArray(detailRes.body.certificates)).toBe(true);
    expect(Array.isArray(detailRes.body.amendments)).toBe(true);
    expect(detailRes.body.amendments.length).toBe(2);
    expect(detailRes.body.amendments[1].snapshot.wo_code).toBe('WO-2026-01-AMEND01');
    expect(Array.isArray(detailRes.body.amendmentRequests)).toBe(true);
    expect(detailRes.body.amendmentRequests.length).toBe(2);
  });

  it('generates VCC_CALIBRATION_REVIEW tasks in GET /api/vcc/tasks when result is submitted, enforcing Segregation of Duties', async () => {
    // 1. Create asset and work order
    const assetRes = await call('POST', '/api/vcc/assets', 'M1-REV4', {
      asset_code: 'CAL-M1-TASK',
      name: '[ข้อมูลทดสอบ] เครื่องมือวัดสำหรับทดสอบ Task Inbox',
      asset_type: 'Temperature Controller',
      department: 'M1QC'
    });
    const assetId = assetRes.body.asset.id;
    const woId = 'WO-M1-TASK-01';

    await env.DB.prepare(`
      INSERT INTO vcc_work_orders (
        id, wo_code, asset_id, provider_name, planned_month, baseline_planned_date,
        scheduled_date, due_date, original_due_date, required_due_date, status, result_status,
        created_by, updated_by
      ) VALUES (?, ?, ?, 'ทวนสอบภายใน', 2, '2026-02-15', '2026-02-15', '2026-02-15', '2026-02-15', '2026-02-15', 'OPEN', 'PENDING', 'M1-PERF', 'M1-PERF')
    `).bind(woId, 'WO-2026-TASK-01', assetId).run();

    // 2. Submit result by M1-PERF -> PENDING_REVIEW
    const submitRes = await call('POST', `/api/vcc/work-orders/${woId}/submit-result`, 'M1-PERF', {
      performed_at: '2026-02-12',
      result_status: 'PASS',
      certificate_no: 'CERT-TASK-01',
      acceptance_criteria: '± 0.5 °C',
      result_remarks: 'ผลการสอบเทียบเป็นไปตามเกณฑ์ยอมรับ'
    });
    expect(submitRes.status).toBe(200);

    // 3. Performer (M1-PERF) queries tasks -> must NOT see review task (SoD)
    const perfTasksRes = await call('GET', '/api/vcc/tasks', 'M1-PERF');
    expect(perfTasksRes.status).toBe(200);
    const perfWoTask = (perfTasksRes.body.tasks || []).find((t) => t.woId === woId);
    expect(perfWoTask).toBeUndefined();

    // 4. Reviewer L4 (M1-REV4) queries tasks -> MUST see review task
    const revTasksRes = await call('GET', '/api/vcc/tasks', 'M1-REV4');
    expect(revTasksRes.status).toBe(200);
    const revWoTask = (revTasksRes.body.tasks || []).find((t) => t.woId === woId);
    expect(revWoTask).toBeDefined();
    expect(revWoTask.taskType).toBe('VCC_CALIBRATION_REVIEW');
    expect(revWoTask.docCode).toBe('WO-2026-TASK-01');

    // 5. Reviewer approves work order -> moves to CLOSED
    const approveRes = await call('POST', `/api/vcc/work-orders/${woId}/approve`, 'M1-REV4', {
      comment: 'ตรวจรับผลสอบเทียบเรียบร้อย ครบถ้วนตามมาตรฐาน'
    });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.workOrder.status).toBe('CLOSED');

    // 6. Reviewer queries tasks again -> task must be cleared
    const postApproveTasks = await call('GET', '/api/vcc/tasks', 'M1-REV4');
    const clearedWoTask = (postApproveTasks.body.tasks || []).find((t) => t.woId === woId);
    expect(clearedWoTask).toBeUndefined();
  });
});
