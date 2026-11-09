// apps/api/src/test/vccConfigurationFixture.js
// Isolated Vitest data fixture helper for dynamic module governance tests.

export const OFFICIAL_TEST_PROFILES = {
  QC: {
    document_code: 'FM-QC-46',
    revision: '01',
    form_issue_date: '2026-06-09',
    title_th: 'แผนการทวนสอบเครื่องมือประจำปี',
    reviewer_dept: 'PD',
    approver_dept: 'MGT',
    required_reviewer_level: 5,
    required_approver_level: 6,
    min_preparer_level: 4,
    assigned_reviewer_id: 'PD-REV-L5',
    assigned_approver_id: 'MGT-APP-L6'
  },
  LB: {
    document_code: 'FM-LB-11',
    revision: '02',
    form_issue_date: '2026-08-10',
    title_th: 'แผนการสอบเทียบเครื่องมือที่ใช้ในห้องปฏิบัติการจุลชีววิทยา ประจำปี',
    reviewer_dept: 'LB',
    approver_dept: 'MGT',
    required_reviewer_level: 5,
    required_approver_level: 6,
    min_preparer_level: 4,
    assigned_reviewer_id: 'LB-REV-L5',
    assigned_approver_id: 'MGT-APP-L6'
  }
};

export async function installVccTestConfiguration(db, departments = ['QC', 'LB'], overrides = {}) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'vcc_document_profiles'").first();
  const profiles = row?.value ? JSON.parse(row.value) : {};
  const matrix = await db.prepare("SELECT * FROM approval_matrix WHERE doc_type = 'FM'").first();

  for (const department of departments) {
    const override = overrides[department] || {};
    const official = OFFICIAL_TEST_PROFILES[department] || {};
    const existing = profiles[department] || {};

    const profile = {
      document_code: override.document_code || existing.document_code || official.document_code || `TEST-FM-${department}`,
      revision: override.revision || existing.revision || official.revision || '01',
      form_issue_date: override.form_issue_date || existing.form_issue_date || official.form_issue_date || '2026-06-09',
      title_th: override.title_th || existing.title_th || official.title_th || `[ข้อมูลทดสอบ] แบบฟอร์ม ${department}`,
      min_preparer_level: override.min_preparer_level ?? existing.min_preparer_level ?? official.min_preparer_level ?? matrix?.min_requester_level ?? 4,
      required_reviewer_level: override.required_reviewer_level ?? existing.required_reviewer_level ?? official.required_reviewer_level ?? matrix?.required_reviewer_level ?? 5,
      required_approver_level: override.required_approver_level ?? existing.required_approver_level ?? official.required_approver_level ?? matrix?.required_approver_level ?? 6,
      reviewer_dept: override.reviewer_dept || existing.reviewer_dept || official.reviewer_dept || department,
      approver_dept: override.approver_dept || existing.approver_dept || official.approver_dept || department,
      assigned_reviewer_id: override.assigned_reviewer_id ?? existing.assigned_reviewer_id ?? official.assigned_reviewer_id ?? null,
      assigned_approver_id: override.assigned_approver_id ?? existing.assigned_approver_id ?? official.assigned_approver_id ?? null
    };

    profiles[department] = profile;

    await db.batch([
      db.prepare("INSERT OR IGNORE INTO module_departments(module_id, department, enabled) SELECT 'vcc', code, 1 FROM departments WHERE code = ? AND status = 'ACTIVE'").bind(department),
      db.prepare(`
        INSERT INTO documents(id, doc_code, revision, name, doc_type, department, status, effective_date)
        VALUES(?, ?, ?, ?, 'FM', ?, 'EFFECTIVE', ?)
        ON CONFLICT(id) DO UPDATE SET
          effective_date = excluded.effective_date,
          status = 'EFFECTIVE',
          name = excluded.name
      `).bind(
        `TEST-VCC-FORM-${profile.document_code}-${profile.revision}`,
        profile.document_code,
        profile.revision,
        `[ข้อมูลทดสอบ] ${profile.title_th || department}`,
        department,
        profile.form_issue_date || '2026-06-09'
      )
    ]);
  }

  await db.prepare("UPDATE settings SET value = ? WHERE key = 'vcc_document_profiles'").bind(JSON.stringify(profiles)).run();
}
