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

  const uploadCert = async (woId, who, body = SAMPLE_PDF, query = '') => {
    const res = await app.request(
      `/api/vcc/work-orders/${woId}/certificate-file${query}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf', Authorization: `Bearer ${tokens[who]}` },
        body
      },
      env
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
        ['M1-OTHER', 4, 1, 'M1OTHER'],
        ['M1-NONDCC', 4, 0, 'M1QC']
      ].map(([id, level, dcc, dept]) =>
        env.DB.prepare(
          `INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc)
           VALUES (?, ?, ?, ?, 'USER', ?, ?, ?, ?)`
        ).bind(id, id, `${id}@vccm1.local`, hash, level, dept, JSON.stringify([dept]), dcc)
      )
    ]);

    for (const id of ['M1-PERF', 'M1-REV4', 'M1-APP5', 'M1-OTHER', 'M1-NONDCC']) {
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

    // 3. Upload Version 1 Certificate
    const certV1Bytes = new TextEncoder().encode('%PDF-1.4\nCertificate Version 1 Data\n%%EOF');
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
    const amendBeforeClose = await call('POST', `/api/vcc/work-orders/${woId}/amend`, 'M1-REV4', {
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

    // 6. Amendment RBAC & SoD validations
    // L2 performer alone cannot amend closed work order (SoD)
    const perfAloneAmend = await call('POST', `/api/vcc/work-orders/${woId}/amend`, 'M1-PERF', {
      amendment_reason: 'ผู้บันทึกผลพยายามแก้เอง'
    });
    expect(perfAloneAmend.status).toBe(403);

    // Missing reason rejected
    const noReasonAmend = await call('POST', `/api/vcc/work-orders/${woId}/amend`, 'M1-REV4', {
      amendment_reason: ''
    });
    expect(noReasonAmend.status).toBe(400);

    // Amendment changing status to FAIL requires L5+ (L4 blocked)
    const l4FailAmend = await call('POST', `/api/vcc/work-orders/${woId}/amend`, 'M1-REV4', {
      result_status: 'FAIL',
      amendment_reason: 'พบว่าข้อมูลแล็บคำนวณผิดพลาด เครื่องมือวัดไม่ผ่านเกณฑ์จริง'
    });
    expect(l4FailAmend.status).toBe(403);
    expect(l4FailAmend.body.error).toContain('L5');

    // 7. Authorized Amendment by L5 Approver (Seq 1: changing PASS to FAIL)
    const validAmend1 = await call('POST', `/api/vcc/work-orders/${woId}/amend`, 'M1-APP5', {
      result_status: 'FAIL',
      certificate_no: 'CERT-AMEND-REV-01',
      result_remarks: 'แก้ไขผลเป็น FAIL เนื่องจากผลทดสอบ Drift เกินค่ามาตรฐานที่กำหนด',
      amendment_reason: 'พบข้อผิดพลาดในการคำนวณ Drift ของแล็บภายนอก จึงขอแก้ไขผลเป็นไม่ผ่านตาม ISO/IEC 17025 clause 7.8.8'
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

    // 8. Query Amendment History
    const amendListRes = await call('GET', `/api/vcc/work-orders/${woId}/amendments`, 'M1-REV4');
    expect(amendListRes.status).toBe(200);
    const amendments = amendListRes.body.amendments;
    expect(amendments.length).toBe(1);
    expect(amendments[0].amendment_seq).toBe(1);
    expect(amendments[0].amended_by_name).toBe('M1-APP5');
    expect(amendments[0].snapshot.result_status).toBe('PASS'); // Original state was preserved
    expect(amendments[0].amendment_reason).toContain('ISO/IEC 17025 clause 7.8.8');

    // 9. Work Order Full Detail View includes certificates and amendments
    const detailRes = await call('GET', `/api/vcc/work-orders/${woId}`, 'M1-REV4');
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.workOrder.is_amended).toBe(1);
    expect(Array.isArray(detailRes.body.certificates)).toBe(true);
    expect(Array.isArray(detailRes.body.amendments)).toBe(true);
    expect(detailRes.body.amendments.length).toBe(1);
    expect(detailRes.body.amendments[0].snapshot.wo_code).toBe('WO-2026-01-AMEND01');
  });
});
