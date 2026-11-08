import { describe, it, expect, beforeAll } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import app from './index.js';
import { hashPassword } from './password.js';

describe('VCC Phase 1 Step 2: DCC Document Profile Configuration & Central RBAC User Assignment', () => {
  let proxy;
  let env;
  const tokens = {};
  const PASSWORD = 'vcc-profile-pass-123';

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
    return { status: res.status, body: await res.json() };
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

    // 2. Prepare real Central RBAC users:
    // - TEST-DCC: DCC Admin (L4, is_dcc=1)
    // - TEST-NON-DCC: QC Supervisor (L4, is_dcc=0)
    // - TEST-PD-L5: Production Asst. Mgr (L5, dept=PD) -> Valid QC Reviewer
    // - TEST-QA-L5: QA Asst. Mgr (L5, dept=QA) -> Valid QC Reviewer alternative
    // - TEST-LB-L5: LAB Asst. Mgr (L5, dept=LB) -> Valid LAB Reviewer
    // - TEST-MGT-L6: General Manager (L6, dept=MGT) -> Valid Approver
    // - TEST-INACTIVE: Suspended PD L5 (status=INACTIVE)
    // - TEST-PD-L4: Production Supervisor (L4, dept=PD) -> Level too low (<5)
    // - TEST-WH-L5: Warehouse Mgr (L5, dept=WH) -> Wrong department for QC/LAB review
    // - TEST-PD-L6: Production Director (L6, dept=PD) -> Wrong department for Plan Approver (must be MGT)
    const testUsers = [
      ['TEST-DCC', 'DCC Admin User', 'DC', '["DC"]', 4, 1, 'ACTIVE'],
      ['TEST-NON-DCC', 'QC Non-Admin', 'QC', '["QC"]', 4, 0, 'ACTIVE'],
      ['TEST-PD-L5', 'Somchai PD AsstMgr', 'PD', '["PD"]', 5, 0, 'ACTIVE'],
      ['TEST-QA-L5', 'Somsri QA AsstMgr', 'QA', '["QA"]', 5, 0, 'ACTIVE'],
      ['TEST-LB-L5', 'Wallapa Lab AsstMgr', 'LB', '["LB"]', 5, 0, 'ACTIVE'],
      ['TEST-MGT-L6', 'Boonchai GeneralMgr', 'MGT', '["MGT"]', 6, 0, 'ACTIVE'],
      ['TEST-INACTIVE', 'Inactive PD User', 'PD', '["PD"]', 5, 0, 'INACTIVE'],
      ['TEST-PD-L4', 'Prasert PD Sup', 'PD', '["PD"]', 4, 0, 'ACTIVE'],
      ['TEST-WH-L5', 'Wichai WH Mgr', 'WH', '["WH"]', 5, 0, 'ACTIVE'],
      ['TEST-PD-L6', 'Somkiat PD Director', 'PD', '["PD"]', 6, 0, 'ACTIVE']
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
  });

  // 1. Reading Document Profiles & Central RBAC Candidates
  it('allows authorized VCC user to read document profiles and Central RBAC candidate lists', async () => {
    const res = await call('GET', '/api/vcc/document-profiles', 'TEST-NON-DCC');
    expect(res.status).toBe(200);
    expect(res.body.profiles).toBeDefined();
    expect(res.body.profiles.QC).toBeDefined();
    expect(res.body.profiles.QC.document_code).toBe('FM-QC-46');
    expect(res.body.profiles.LB).toBeDefined();
    expect(res.body.profiles.LB.document_code).toBe('FM-LB-11');

    // Verify Central RBAC candidates categorization
    expect(res.body.candidates).toBeDefined();
    expect(res.body.candidates.qc_reviewers.some((u) => u.id === 'TEST-PD-L5')).toBe(true);
    expect(res.body.candidates.lab_reviewers.some((u) => u.id === 'TEST-LB-L5')).toBe(true);
    expect(res.body.candidates.approvers.some((u) => u.id === 'TEST-MGT-L6')).toBe(true);
  });

  // 2. Security: Non-DCC users cannot edit Document Profiles
  it('strictly blocks non-DCC users from modifying department document profiles (HTTP 403)', async () => {
    const res = await call('PUT', '/api/vcc/document-profiles/QC', 'TEST-NON-DCC', {
      document_code: 'FM-QC-46-HACK',
      revision: '99',
      form_issue_date: '2026-06-09',
      title_th: 'แฮกการตั้งค่า'
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('เฉพาะ DCC');
  });

  // 3. Validation: Non-existent User ID rejected with HTTP 422
  it('rejects assigned reviewer or approver that does not exist in Central RBAC (HTTP 422)', async () => {
    const res = await call('PUT', '/api/vcc/document-profiles/QC', 'TEST-DCC', {
      assigned_reviewer_id: 'NON-EXISTENT-UUID-9999',
      assigned_approver_id: 'TEST-MGT-L6'
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain('ไม่พบผู้ใช้งาน');
  });

  // 4. Validation: Inactive user rejected with HTTP 422
  it('rejects assigned reviewer who is INACTIVE / suspended in Central RBAC (HTTP 422)', async () => {
    const res = await call('PUT', '/api/vcc/document-profiles/QC', 'TEST-DCC', {
      assigned_reviewer_id: 'TEST-INACTIVE',
      assigned_approver_id: 'TEST-MGT-L6'
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain('ไม่พร้อมปฏิบัติงาน');
  });

  // 5. Validation: Level below requirement (<5 for reviewer, <6 for approver) rejected with HTTP 422
  it('rejects assigned reviewer whose approval level is < 5 (HTTP 422)', async () => {
    const res = await call('PUT', '/api/vcc/document-profiles/QC', 'TEST-DCC', {
      assigned_reviewer_id: 'TEST-PD-L4', // Level 4 (< 5)
      assigned_approver_id: 'TEST-MGT-L6'
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain('ระดับอนุมัติตั้งแต่ L5 ขึ้นไป');
  });

  // 6. Validation: Wrong Department for Reviewer
  it('rejects QC reviewer who is not from PD or QA department (HTTP 422)', async () => {
    const res = await call('PUT', '/api/vcc/document-profiles/QC', 'TEST-DCC', {
      assigned_reviewer_id: 'TEST-WH-L5', // WH department
      assigned_approver_id: 'TEST-MGT-L6'
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain('ฝ่ายผลิต (PD)');
  });

  it('rejects LAB reviewer who is not from LB department (HTTP 422)', async () => {
    const res = await call('PUT', '/api/vcc/document-profiles/LB', 'TEST-DCC', {
      assigned_reviewer_id: 'TEST-PD-L5', // PD department instead of LB
      assigned_approver_id: 'TEST-MGT-L6'
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain('ห้องปฏิบัติการ (LB)');
  });

  // 7. Validation: Approver must be from MGT department and Level >= 6
  it('rejects plan approver who is Level 6 but not in MGT department (HTTP 422)', async () => {
    const res = await call('PUT', '/api/vcc/document-profiles/QC', 'TEST-DCC', {
      assigned_reviewer_id: 'TEST-PD-L5',
      assigned_approver_id: 'TEST-PD-L6' // PD L6 instead of MGT L6
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain('ฝ่ายบริหาร (MGT)');
  });

  // 8. Segregation of Duties: Reviewer != Approver
  it('rejects assigning the same user as both reviewer and approver (HTTP 422)', async () => {
    // If a user belongs to both PD and MGT with level 6, they still cannot review and approve the same profile
    const res = await call('PUT', '/api/vcc/document-profiles/QC', 'TEST-DCC', {
      assigned_reviewer_id: 'TEST-MGT-L6',
      assigned_approver_id: 'TEST-MGT-L6'
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain('ไม่เป็นบุคคลเดียวกัน (Segregation of Duties)');
  });

  // 9. Successful QC Profile Configuration
  it('allows DCC Admin to configure QC profile with verified PD L5 reviewer and MGT L6 approver', async () => {
    const res = await call('PUT', '/api/vcc/document-profiles/QC', 'TEST-DCC', {
      document_code: 'FM-QC-46',
      revision: '01',
      form_issue_date: '2026-06-09',
      title_th: 'แผนการทวนสอบเครื่องมือประจำปี (QC)',
      min_preparer_level: 4,
      assigned_reviewer_id: 'TEST-PD-L5',
      assigned_approver_id: 'TEST-MGT-L6'
    });

    expect(res.status).toBe(200);
    expect(res.body.profile.document_code).toBe('FM-QC-46');
    expect(res.body.profile.revision).toBe('01');
    expect(res.body.profile.assigned_reviewer_id).toBe('TEST-PD-L5');
    expect(res.body.profile.assigned_approver_id).toBe('TEST-MGT-L6');
  });

  // 10. Department Isolation: Updating QC does NOT affect LAB profile
  it('guarantees per-department isolation: modifying QC profile leaves LAB profile completely unchanged', async () => {
    // 10.1 First configure LAB profile
    const resLab = await call('PUT', '/api/vcc/document-profiles/LB', 'TEST-DCC', {
      document_code: 'FM-LB-11',
      revision: '02',
      form_issue_date: '2026-08-10',
      title_th: 'แผนการสอบเทียบเครื่องมือที่ใช้ในห้องปฏิบัติการจุลชีววิทยา ประจำปี',
      min_preparer_level: 4,
      assigned_reviewer_id: 'TEST-LB-L5',
      assigned_approver_id: 'TEST-MGT-L6'
    });
    expect(resLab.status).toBe(200);
    expect(resLab.body.profile.document_code).toBe('FM-LB-11');
    expect(resLab.body.profile.assigned_reviewer_id).toBe('TEST-LB-L5');

    // 10.2 Now update QC profile only (change title)
    const resQc = await call('PUT', '/api/vcc/document-profiles/QC', 'TEST-DCC', {
      title_th: 'แผนการทวนสอบเครื่องมือประจำปี (QC Updated Title)'
    });
    expect(resQc.status).toBe(200);
    expect(resQc.body.profile.title_th).toBe('แผนการทวนสอบเครื่องมือประจำปี (QC Updated Title)');

    // 10.3 Verify LAB profile is still 100% intact
    const resAll = await call('GET', '/api/vcc/document-profiles', 'TEST-DCC');
    expect(resAll.body.profiles.LB.document_code).toBe('FM-LB-11');
    expect(resAll.body.profiles.LB.revision).toBe('02');
    expect(resAll.body.profiles.LB.assigned_reviewer_id).toBe('TEST-LB-L5');
    expect(resAll.body.profiles.LB.assigned_approver_id).toBe('TEST-MGT-L6');
  });

  // 11. Existing Settings Retention: providers and planSettings are preserved
  it('preserves existing calibration providers and plan settings in settings table', async () => {
    const res = await call('GET', '/api/vcc/plan-settings', 'TEST-DCC');
    expect(res.status).toBe(200);
    expect(res.body.providers).toBeDefined();
    expect(res.body.providers.length).toBeGreaterThan(0);
    expect(res.body.planSettings).toBeDefined();
    expect(res.body.documentProfiles).toBeDefined();
    expect(res.body.documentProfiles.QC).toBeDefined();
    expect(res.body.documentProfiles.LB).toBeDefined();
  });
});
