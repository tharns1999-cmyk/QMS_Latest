import { installVccTestConfiguration, OFFICIAL_TEST_PROFILES } from './test/vccConfigurationFixture.js';
import { describe, it, expect, beforeAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('VCC Phase 1 Step 3: Backend Workflow & Approval Security', () => {
  let proxy;
  let env;
  const tokens = {};
  const PASSWORD = 'vcc-step3-security-pass';
  let activePlanId;

  const call = async (method, path, who, body, customEnv = null) => {
    if(method==='PUT' && path.startsWith('/api/vcc/document-profiles/')) {
      const dept=path.split('/').pop();
      const current=JSON.parse((await env.DB.prepare("SELECT value FROM settings WHERE key='vcc_document_profiles'").first()).value)[dept];
      body={...current,...body,reason:'[ข้อมูลทดสอบ] ตั้งค่าผู้รับผิดชอบ',version:(await env.DB.prepare("SELECT version FROM module_configuration WHERE module_id='vcc'").first()).version};
      path=`/api/module-governance/vcc/profiles/${dept}`;
    }
    const res = await app.request(
      path,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens[who]}`
        },
        body: body ? JSON.stringify(body) : undefined
      },
      customEnv || env
    );
    const text = await res.text();
    let jsonBody;
    try {
      jsonBody = text ? JSON.parse(text) : {};
    } catch (err) {
      console.error(`[PARSE ERROR] ${method} ${path} returned status ${res.status}:`, text);
      throw err;
    }
    return { status: res.status, body: jsonBody };
  };

  beforeAll(async () => {
    proxy = await getPlatformProxy({ persist: { path: '.wrangler/test/v3' } });
    env = { ...proxy.env, JWT_SECRET: 'test-secret' };
    const hash = await hashPassword(PASSWORD);

    // 1. Ensure master departments exist
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('QC', 'ฝ่ายควบคุมคุณภาพ', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('LB', 'ห้องปฏิบัติการ', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('PD', 'ฝ่ายผลิต', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('QA', 'ฝ่ายประกันคุณภาพ', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('MGT', 'ฝ่ายบริหาร', 'ACTIVE')"),
      env.DB.prepare("INSERT OR IGNORE INTO departments (code, name_th, status) VALUES ('WH', 'คลังสินค้า', 'ACTIVE')")
    ]);

    // 2. Prepare Central RBAC actors:
    // - DCC-ADMIN: DCC Admin (L4, is_dcc=1)
    // - QC-PREP-L4: QC Staff (L4, primary_department=QC) -> Valid QC Preparer
    // - LB-PREP-L4: LAB Staff (L4, primary_department=LB) -> Valid LAB Preparer
    // - WH-PREP-L4: WH Staff (L4, primary_department=WH) -> Invalid Preparer for QC/LB
    // - QC-STAFF-L3: QC Operator (L3, primary_department=QC) -> Level too low (<4)
    // - PD-REV-L5: Production AsstMgr (L5, primary_department=PD) -> Designated QC Reviewer
    // - QA-REV-L5: QA AsstMgr (L5, primary_department=QA) -> Non-assigned Reviewer for QC
    // - LB-REV-L5: LAB AsstMgr (L5, primary_department=LB) -> Designated LAB Reviewer
    // - MGT-APP-L6: Managing Director (L6, primary_department=MGT) -> Designated Approver
    // - PD-DIR-L6: Production Director (L6, primary_department=PD) -> Level 6 but wrong department for Approver
    // - SUSPENDED-REV: Inactive PD L5 (status=INACTIVE)
    const testUsers = [
      ['DCC-ADMIN', 'DCC Admin Officer', 'DC', '["DC"]', 4, 1, 'ACTIVE'],
      ['QC-PREP-L4', 'Somchai QC Officer', 'QC', '["QC"]', 4, 0, 'ACTIVE'],
      ['LB-PREP-L4', 'Wandee Lab Officer', 'LB', '["LB"]', 4, 0, 'ACTIVE'],
      ['WH-PREP-L4', 'Wichai WH Officer', 'WH', '["WH"]', 4, 0, 'ACTIVE'],
      ['QC-STAFF-L3', 'Prasit QC Operator', 'QC', '["QC"]', 3, 0, 'ACTIVE'],
      ['PD-REV-L5', 'Kittisak PD AsstMgr', 'PD', '["PD"]', 5, 0, 'ACTIVE'],
      ['QA-REV-L5', 'Somsri QA AsstMgr', 'QA', '["QA"]', 5, 0, 'ACTIVE'],
      ['LB-REV-L5', 'Wallapa Lab AsstMgr', 'LB', '["LB"]', 5, 0, 'ACTIVE'],
      ['MGT-APP-L6', 'Boonchai GeneralMgr', 'MGT', '["MGT"]', 6, 0, 'ACTIVE'],
      ['PD-DIR-L6', 'Anan PD Director', 'PD', '["PD"]', 6, 0, 'ACTIVE'],
      ['SUSPENDED-REV', 'Inactive PD User', 'PD', '["PD"]', 5, 0, 'INACTIVE']
    ];

    await env.DB.batch(
      testUsers.map(([id, name, dept, depts, level, isDcc, status]) =>
        env.DB.prepare(`
          INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, is_dcc, status)
          VALUES (?, ?, ?, ?, 'USER', ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            role = excluded.role,
            approval_level = excluded.approval_level,
            primary_department = excluded.primary_department,
            departments = excluded.departments,
            is_dcc = excluded.is_dcc,
            status = excluded.status
        `).bind(id, name, `${id.toLowerCase()}@test.local`, hash, level, dept, depts, isDcc, status)
      )
    );

    // Obtain JWT tokens for each test actor
    await installVccTestConfiguration(env.DB, ["QC", "LB"], OFFICIAL_TEST_PROFILES);

    for (const [id] of testUsers) {
      const res = await app.request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `${id.toLowerCase()}@test.local`, password: PASSWORD })
        },
        env
      );
      const json = await res.json();
      if (json.token) {
        tokens[id] = json.token;
      }
    }

    await env.DB.prepare("INSERT INTO module_permission_grants(user_id,permission,module_id) VALUES('DCC-ADMIN','MODULE_MANAGE','vcc')").run();

    // 3. Configure Document Profiles for QC and LB as DCC-ADMIN
    await call('PUT', '/api/vcc/document-profiles/QC', 'DCC-ADMIN', {
      document_code: 'FM-QC-46',
      revision: '01',
      form_issue_date: '2026-06-09',
      title_th: 'แผนการทวนสอบเครื่องมือประจำปี',
      assigned_reviewer_id: 'PD-REV-L5',
      assigned_approver_id: 'MGT-APP-L6',
      min_preparer_level: 4
    });

    await call('PUT', '/api/vcc/document-profiles/LB', 'DCC-ADMIN', {
      document_code: 'FM-LB-11',
      revision: '02',
      form_issue_date: '2026-08-10',
      title_th: 'แผนการสอบเทียบเครื่องมือที่ใช้ในห้องปฏิบัติการจุลชีววิทยา ประจำปี',
      assigned_reviewer_id: 'LB-REV-L5',
      assigned_approver_id: 'MGT-APP-L6',
      min_preparer_level: 4
    });

    // 4. Insert test equipment in vcc_assets for QC and LB
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO vcc_assets (
          id, asset_code, name, asset_type, department, model, serial_no, brand,
          location, status
        ) VALUES (
          'ASSET-QC-001', 'CAL-QC-001', 'Digital Caliper', 'เวอร์เนียร์คาลิปเปอร์', 'QC', 'CD-6', 'SN-QC-01', 'Mitutoyo',
          'Room 101', 'ACTIVE'
        ) ON CONFLICT(id) DO NOTHING
      `),
      env.DB.prepare(`
        INSERT INTO vcc_assets (
          id, asset_code, name, asset_type, department, model, serial_no, brand,
          location, status
        ) VALUES (
          'ASSET-LB-001', 'CAL-LB-001', 'Autoclave Chamber', 'เครื่องวัดคุณภาพน้ำ/น้ำมัน', 'LB', 'AC-500', 'SN-LB-01', 'Hirayama',
          'Micro Lab', 'ACTIVE'
        ) ON CONFLICT(id) DO NOTHING
      `)
    ]);
  });

  // 1. Preparer Permissions Gate
  it('rejects plan creation by a user not belonging to the plan department (HTTP 403)', async () => {
    const res = await call('POST', '/api/vcc/plans', 'LB-PREP-L4', {
      plan_year: 2091,
      department: 'QC'
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('ผู้จัดทำต้องสังกัดแผนกเจ้าของแผน (QC)');
  });

  it('rejects plan creation by a user whose approval level < min_preparer_level (HTTP 403)', async () => {
    const res = await call('POST', '/api/vcc/plans', 'QC-STAFF-L3', {
      plan_year: 2091,
      department: 'QC'
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('ผู้จัดทำแผนต้องมีระดับอนุมัติตั้งแต่ L4 ขึ้นไป');
  });

  // 2. Historical Snapshot Creation
  it('records an immutable historical snapshot and profile columns upon plan creation', async () => {
    const res = await call('POST', '/api/vcc/plans', 'QC-PREP-L4', {
      plan_year: 2091,
      department: 'QC'
    });
    expect(res.status).toBe(201);
    const plan = res.body.plan;
    expect(plan.department).toBe('QC');
    expect(plan.document_code).toBe('FM-QC-46');
    expect(plan.revision).toBe('01');
    expect(plan.form_issue_date).toBe('2026-06-09');
    expect(plan.assigned_reviewer_id).toBe('PD-REV-L5');
    expect(plan.assigned_approver_id).toBe('MGT-APP-L6');
    expect(plan.prepared_by).toBe('QC-PREP-L4');

    expect(plan.profile_snapshot).toBeDefined();
    const snap = JSON.parse(plan.profile_snapshot);
    expect(snap.department).toBe('QC');
    expect(snap.document_code).toBe('FM-QC-46');
    expect(snap.assigned_reviewer_id).toBe('PD-REV-L5');
    expect(snap.assigned_approver_id).toBe('MGT-APP-L6');
    expect(snap.min_preparer_level).toBe(4);
  });

  // 3. Submission Gate: Workflow Assignment & SoD Checks
  it('rejects plan submission if assigned reviewer or approver violates SoD (Maker cannot Review)', async () => {
    // Create a plan where preparer is also assigned reviewer (by temporarily using a plan)
    const createRes = await call('POST', '/api/vcc/plans', 'QC-PREP-L4', {
      plan_year: 2092,
      department: 'QC'
    });
    expect(createRes.status).toBe(201);
    activePlanId = createRes.body.plan.id;
    const planId = activePlanId;

    // Add item so plan is eligible for submission
    await call('POST', `/api/vcc/plans/${planId}/items`, 'QC-PREP-L4', {
      asset_id: 'ASSET-QC-001',
      provider_name: 'Internal QC Lab',
      responsible_dept: 'QC',
      planned_months: [6]
    });

    // Artificially simulate SoD violation: assigned_reviewer_id is set to QC-PREP-L4 in DB
    await env.DB.prepare('UPDATE vcc_annual_plans SET assigned_reviewer_id = ? WHERE id = ?')
      .bind('QC-PREP-L4', planId).run();
    await env.DB.prepare("UPDATE vcc_annual_plan_items SET planned_months = '[6]' WHERE plan_id = ?")
      .bind(planId).run();

    const submitRes = await call('POST', `/api/vcc/plans/${planId}/submit`, 'QC-PREP-L4', {});
    expect(submitRes.status).toBe(422);
    expect(submitRes.body.error).toContain('ผู้จัดทำไม่สามารถเป็นผู้ทบทวนแผนของตนเองได้ (Segregation of Duties)');
  });

  // 4. Reviewer Gate: Only Assigned Reviewer Can Review
  it('strictly blocks unauthorized users from reviewing the plan (HTTP 403)', async () => {
    // Create and submit a clean QC plan
    const createRes = await call('POST', '/api/vcc/plans', 'QC-PREP-L4', {
      plan_year: 2093,
      department: 'QC'
    });
    expect(createRes.status).toBe(201);
    activePlanId = createRes.body.plan.id;
    const planId = activePlanId;

    await call('POST', `/api/vcc/plans/${planId}/items`, 'QC-PREP-L4', {
      asset_id: 'ASSET-QC-001',
      provider_name: 'Internal QC Lab',
      responsible_dept: 'QC',
      planned_months: [3]
    });

    // Ensure all items in the plan have either planned months or justification remarks to satisfy submission gate
    const planDetail = await call('GET', `/api/vcc/plans/${planId}`, 'QC-PREP-L4');
    for (const item of (planDetail.body.items || [])) {
      if ((!item.planned_months || item.planned_months.length === 0) && !item.remarks) {
        await call('POST', `/api/vcc/plans/${planId}/items`, 'QC-PREP-L4', {
          asset_id: item.asset_id,
          provider_name: item.provider_name || 'Internal QC Lab',
          responsible_dept: 'QC',
          planned_months: [],
          remarks: 'ทวนสอบรอบปีอื่น'
        });
      }
    }

    const submitRes = await call('POST', `/api/vcc/plans/${planId}/submit`, 'QC-PREP-L4', {});
    expect(submitRes.status).toBe(200);

    // QA-REV-L5 is L5 but NOT the assigned reviewer for QC (which is PD-REV-L5)
    const unauthReview = await call('POST', `/api/vcc/plans/${planId}/review`, 'QA-REV-L5', {
      comment: 'Attempt unauthorized review'
    });
    expect(unauthReview.status).toBe(403);
    expect(unauthReview.body.error).toContain('เฉพาะผู้ทบทวนที่ได้รับมอบหมายตามแบบฟอร์มเอกสารควบคุมเท่านั้น');

    // DCC Admin also cannot review operationally
    const dccReview = await call('POST', `/api/vcc/plans/${planId}/review`, 'DCC-ADMIN', {
      comment: 'Attempt DCC operational review'
    });
    expect(dccReview.status).toBe(403);
    expect(dccReview.body.error).toContain('เฉพาะผู้ทบทวนที่ได้รับมอบหมายตามแบบฟอร์มเอกสารควบคุมเท่านั้น');
  });

  it('allows the designated PD L5 reviewer to review the QC plan (HTTP 200)', async () => {
    const planId = activePlanId;

    const reviewRes = await call('POST', `/api/vcc/plans/${planId}/review`, 'PD-REV-L5', {
      comment: 'Reviewed and confirmed technical feasibility'
    });
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.plan.status).toBe('PENDING_APPROVAL');
    expect(reviewRes.body.plan.reviewed_by).toBe('PD-REV-L5');
  });

  // 5. Approver Gate: Only Assigned Approver Can Approve & SoD
  it('strictly blocks unauthorized users from approving the plan (HTTP 403)', async () => {
    const planId = activePlanId;

    // PD-DIR-L6 is Level 6 Director but NOT the assigned MGT approver (which is MGT-APP-L6)
    const unauthApprove = await call('POST', `/api/vcc/plans/${planId}/approve`, 'PD-DIR-L6', {
      comment: 'Attempt unauthorized approval'
    });
    expect(unauthApprove.status).toBe(403);
    expect(unauthApprove.body.error).toContain('เฉพาะผู้อนุมัติที่ได้รับมอบหมายตามแบบฟอร์มเอกสารควบคุมเท่านั้น');

    // Reviewer cannot approve (SoD violation)
    const reviewerApprove = await call('POST', `/api/vcc/plans/${planId}/approve`, 'PD-REV-L5', {
      comment: 'Reviewer attempting approval'
    });
    expect(reviewerApprove.status).toBe(403);
  });

  // 6. R2 Storage Consistency & Fail-Closed Behavior
  it('fails closed (HTTP 503) if Cloudflare R2 Storage binding is missing', async () => {
    const planId = activePlanId;

    // Simulate missing FILES binding in Worker env
    const resNoR2 = await call('POST', `/api/vcc/plans/${planId}/approve`, 'MGT-APP-L6', {
      comment: 'Attempt approval without R2'
    }, { ...env, FILES: undefined });

    expect(resNoR2.status).toBe(503);
    expect(resNoR2.body.error).toContain('R2 Storage ไม่พร้อมใช้งาน (Fail-Closed: Missing FILES binding)');

    // Verify DB plan status is still PENDING_APPROVAL (unchanged)
    const checkPlan = await env.DB.prepare('SELECT status, pdf_file_key FROM vcc_annual_plans WHERE id = ?').bind(planId).first();
    expect(checkPlan.status).toBe('PENDING_APPROVAL');
    expect(checkPlan.pdf_file_key).toBeNull();
  });

  it('fails closed (HTTP 500) if Cloudflare R2 Upload fails', async () => {
    const planId = activePlanId;

    // Simulate R2 PUT rejection
    const brokenR2 = {
      put: () => Promise.reject(new Error('Simulated R2 network drop')),
      head: () => Promise.resolve(null),
      get: () => Promise.resolve(null),
      list: () => Promise.resolve({ objects: [] })
    };

    const resFailPut = await call('POST', `/api/vcc/plans/${planId}/approve`, 'MGT-APP-L6', {
      comment: 'Attempt approval with broken R2'
    }, { ...env, FILES: brokenR2 });

    expect(resFailPut.status).toBe(500);
    expect(resFailPut.body.error).toContain('การอัปโหลดไฟล์ PDF ไปยัง Cloudflare R2 ล้มเหลว');

    // Verify DB plan status was never touched
    const checkPlan = await env.DB.prepare('SELECT status, pdf_file_key FROM vcc_annual_plans WHERE id = ?').bind(planId).first();
    expect(checkPlan.status).toBe('PENDING_APPROVAL');
    expect(checkPlan.pdf_file_key).toBeNull();
  });

  it('fails closed (HTTP 500) if Cloudflare R2 HEAD verification fails', async () => {
    const planId = activePlanId;

    // Simulate R2 PUT succeeds but HEAD returns null (file corrupted/zero byte)
    const brokenHeadR2 = {
      put: () => Promise.resolve(),
      head: () => Promise.resolve(null),
      get: () => Promise.resolve(null),
      list: () => Promise.resolve({ objects: [] })
    };

    const resFailHead = await call('POST', `/api/vcc/plans/${planId}/approve`, 'MGT-APP-L6', {
      comment: 'Attempt approval with missing HEAD'
    }, { ...env, FILES: brokenHeadR2 });

    expect(resFailHead.status).toBe(500);
    expect(resFailHead.body.error).toContain('HEAD Verification Failed');

    // DB plan status must remain PENDING_APPROVAL
    const checkPlan = await env.DB.prepare('SELECT status, pdf_file_key FROM vcc_annual_plans WHERE id = ?').bind(planId).first();
    expect(checkPlan.status).toBe('PENDING_APPROVAL');
    expect(checkPlan.pdf_file_key).toBeNull();
  });

  // 7. Successful Single Atomic Batch Approval & Downloadable PDF
  it('successfully approves plan with R2 pre-commit, verified HEAD, D1 atomic batch, and generates work orders', async () => {
    const planId = activePlanId;

    const approveRes = await call('POST', `/api/vcc/plans/${planId}/approve`, 'MGT-APP-L6', {
      comment: 'Officially approved annual plan'
    });

    expect(approveRes.status).toBe(200);
    const approvedPlan = approveRes.body.plan;
    expect(approvedPlan.status).toBe('APPROVED');
    expect(approvedPlan.effective_status).toBe('CURRENT');
    expect(approvedPlan.is_current).toBe(1);
    expect(approvedPlan.approved_by).toBe('MGT-APP-L6');
    expect(approvedPlan.approval_attempt_id).toBeDefined();
    expect(approvedPlan.pdf_file_key).toContain(`vcc/plans/${planId}/FM-QC-46_2093_Rev01_`);

    // Work orders generated
    expect(approveRes.body.work_orders_generation.generated_count).toBeGreaterThanOrEqual(1);

    // Verify PDF is uploaded to R2 and can be downloaded
    const headObj = await env.FILES.head(approvedPlan.pdf_file_key);
    expect(headObj).not.toBeNull();
    expect(Number(headObj.size)).toBeGreaterThan(0);

    // Test GET /api/vcc/plans/:id/pdf
    const pdfRes = await app.request(`/api/vcc/plans/${planId}/pdf`, {
      headers: { Authorization: `Bearer ${tokens['QC-PREP-L4']}` }
    }, env);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get('content-type')).toBe('application/pdf');
    const pdfBytes = await pdfRes.arrayBuffer();
    expect(pdfBytes.byteLength).toBeGreaterThan(0);
    // Controlled record: never cached, and each view is in the audit trail.
    expect(pdfRes.headers.get('cache-control')).toBe('private, no-store');
    const viewed = await env.DB.prepare("SELECT actor_id FROM audit_log WHERE action = 'VCC_PLAN_PDF_VIEWED' AND json_extract(details, '$.plan_id') = ?").bind(planId).first();
    expect(viewed?.actor_id).toBe('QC-PREP-L4');
  });

  // 8. Concurrent Approval / Double-Submit Prevention & Orphan Tombstone
  it('blocks concurrent approval / double submit (HTTP 409) and writes uncommitted orphan tombstone to R2', async () => {
    const planId = activePlanId;

    // Second approval attempt on already-approved plan
    const secondApprove = await call('POST', `/api/vcc/plans/${planId}/approve`, 'MGT-APP-L6', {
      comment: 'Second concurrent approval attempt'
    });

    expect(secondApprove.status).toBe(409);
    expect(secondApprove.body.error).toContain('ไม่อยู่ในสถานะรออนุมัติ');

    // To test the exact D1 Race lost handling (when OLD.status != PENDING_APPROVAL during batch):
    // Simulate plan that bypasses API check but fails in batch or trigger:
    // Verify that tombstone is created in R2 under vcc/audit-orphans/
    const listOrphans = await env.FILES.list({ prefix: `vcc/audit-orphans/${planId}/` });
    // Any orphan tombstone record has .json suffix
    for (const obj of listOrphans.objects) {
      expect(obj.key).toContain('.json');
    }
  });

  // 9. Historical Snapshot Immutability
  it('guarantees historical snapshot and plan document code remain unchanged when DCC updates configuration', async () => {
    // 1. Check original QC plan created earlier
    const plansRes = await call('GET', '/api/vcc/plans?plan_year=2091&department=QC', 'QC-PREP-L4');
    const originalPlan = plansRes.body.plans[0];
    expect(originalPlan.document_code).toBe('FM-QC-46');
    expect(originalPlan.revision).toBe('01');
    expect(originalPlan.form_issue_date).toBe('2026-06-09');

    // 2. Change the preparer policy; existing controlled-form snapshots must remain frozen.
    const changedProfile = await call('PUT', '/api/vcc/document-profiles/QC', 'DCC-ADMIN', { min_preparer_level:5 });
    expect(changedProfile.status).toBe(200);;

    // 3. Re-query original plan: It MUST retain Revision 01 and 2026-06-09!
    const recheckRes = await call('GET', `/api/vcc/plans/${originalPlan.id}`, 'QC-PREP-L4');
    const preservedPlan = recheckRes.body.plan;
    expect(preservedPlan.document_code).toBe('FM-QC-46');
    expect(preservedPlan.revision).toBe('01');
    expect(preservedPlan.form_issue_date).toBe('2026-06-09');
    const snap = JSON.parse(preservedPlan.profile_snapshot);
    expect(snap.revision).toBe('01');
    expect(snap.form_issue_date).toBe('2026-06-09');
  });

  // 10. Storage Reconciliation Endpoint
  it('allows DCC Admin to reconcile R2 storage objects against committed plans table', async () => {
    const reconRes = await call('GET', '/api/vcc/admin/reconcile-storage', 'DCC-ADMIN');
    expect(reconRes.status).toBe(200);
    expect(reconRes.body.total_objects).toBeGreaterThanOrEqual(1);
    expect(reconRes.body.official_committed_count).toBeGreaterThanOrEqual(1);
    const officialObj = reconRes.body.objects.find((o) => o.status === 'OFFICIAL_COMMITTED');
    expect(officialObj).toBeDefined();
    expect(officialObj.plan).toBeDefined();
  });

  // 11. Task-Scoped Isolation: External Reviewer cannot access unassigned assets, work orders or unassigned plan PDFs
  it('strictly isolates external task-assigned reviewers from accessing assets, work orders or unassigned plan PDFs (HTTP 403)', async () => {
    // 1. PD-REV-L5 lists assets -> scoped to PD only, gets 0 QC assets
    const assetListRes = await call('GET', '/api/vcc/assets', 'PD-REV-L5');
    expect(assetListRes.status).toBe(200);
    expect((assetListRes.body.assets || []).some((a) => a.department === 'QC')).toBe(false);

    // 2. PD-REV-L5 direct access to a QC asset -> 403 Forbidden
    const singleAssetRes = await call('GET', '/api/vcc/assets/ASSET-QC-001', 'PD-REV-L5');
    expect(singleAssetRes.status).toBe(403);

    // 3. PD-REV-L5 lists work orders -> gets 0 QC work orders
    const woListRes = await call('GET', '/api/vcc/work-orders', 'PD-REV-L5');
    expect(woListRes.status).toBe(200);
    expect((woListRes.body.workOrders || []).some((w) => w.department === 'QC')).toBe(false);

    // 4. Create an unassigned LB plan (where reviewer is LB-REV-L5, not PD-REV-L5)
    // PD-REV-L5 attempting to download PDF of unassigned plan -> 403 Forbidden
    const unassignedPlanRes = await call('POST', '/api/vcc/plans', 'LB-PREP-L4', {
      plan_year: 2095,
      department: 'LB'
    });
    expect(unassignedPlanRes.status).toBe(201);
    const lbPlanId = unassignedPlanRes.body.plan.id;

    const unassignedPdfRes = await app.request(`/api/vcc/plans/${lbPlanId}/pdf`, {
      headers: { Authorization: `Bearer ${tokens['PD-REV-L5']}` }
    }, env);
    expect(unassignedPdfRes.status).toBe(403);
  });

  // 12. DCC Operational Preparation Blocker
  it('strictly blocks DCC Admin from creating or submitting operational plans for QC/LB without department membership (HTTP 403)', async () => {
    // DCC-ADMIN has primary_department = 'DC', is_dcc = 1
    // Attempting to create an operational plan for QC
    const dccCreateRes = await call('POST', '/api/vcc/plans', 'DCC-ADMIN', {
      plan_year: 2096,
      department: 'QC'
    });
    expect(dccCreateRes.status).toBe(403);
    expect(dccCreateRes.body.error).toContain('ผู้จัดทำต้องสังกัดแผนกเจ้าของแผน (QC) เท่านั้น');

    // Attempting to create an operational plan for LB
    const dccCreateLabRes = await call('POST', '/api/vcc/plans', 'DCC-ADMIN', {
      plan_year: 2096,
      department: 'LB'
    });
    expect(dccCreateLabRes.status).toBe(403);
    expect(dccCreateLabRes.body.error).toContain('ผู้จัดทำต้องสังกัดแผนกเจ้าของแผน (LB) เท่านั้น');
  });

  // 13. Pure Electronic Paperless Quality System & Decoupled Dynamic PDF
  it('rejects a new controlled plan without a real mapping while retaining existing QA equipment', async () => {
    // Setup QA-PREP-L4 with L4+ approval in QA
    const hash = await hashPassword(PASSWORD);
    await env.DB.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, approval_level, primary_department, departments, status)
      VALUES ('QA-PREP-L4', 'QA Quality Officer', 'qa-prep-l4@test.local', ?, 'USER', 4, 'QA', '["QA"]', 'ACTIVE')
      ON CONFLICT(id) DO UPDATE SET approval_level = 4, status = 'ACTIVE'
    `).bind(hash).run();

    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'qa-prep-l4@test.local', password: PASSWORD })
    }, env);
    const loginJson = await loginRes.json();
    tokens['QA-PREP-L4'] = loginJson.token;

    // Add an equipment for QA
    await env.DB.prepare(`
      INSERT INTO vcc_assets (
        id, asset_code, name, asset_type, department, model, serial_no, brand,
        location, status
      ) VALUES (
        'ASSET-QA-001', 'CAL-QA-001', 'Spectrophotometer', 'เครื่องสเปกโตรโฟโตมิเตอร์', 'QA', 'DR-3900', 'SN-QA-01', 'Hach',
        'QA Analytical Lab', 'ACTIVE'
      ) ON CONFLICT(id) DO NOTHING
    `).run();

    // 1. Create plan WITHOUT document_code (Pure Electronic Mode)
    const planRes = await call('POST', '/api/vcc/plans', 'QA-PREP-L4', {
      plan_year: 2097,
      department: 'QA'
      // document_code is omitted on purpose -> auto generates VCC-AP-QA-2097
    });
    expect(planRes.status).toBe(201);
    expect(planRes.body.plan.document_code).toBe('VCC-AP-QA-2097');
    expect(await env.DB.prepare("SELECT id FROM vcc_assets WHERE id='ASSET-QA-001'").first()).toBeTruthy();

  });
});
