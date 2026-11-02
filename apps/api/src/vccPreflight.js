/**
 * VCC Migration Preflight Validation Engine (Fail-Closed Architecture)
 * 
 * Inspects database health, target validity, and historical evidence integrity prior to applying schema migrations.
 * Detects anomalies (missing approver, missing timestamp, duplicate CURRENT plans, incomplete superseded evidence).
 * 
 * Guarantees:
 * 1. Strictly Read-Only: Rejects any DDL/DML statements.
 * 2. Fail-Closed: Any query or connection failure yields an explicit ERROR status with isValid: false.
 * 3. Differentiates TABLE_NOT_FOUND from DATABASE_QUERY_FAILED.
 * 4. Never reports READY if checks were skipped or incomplete.
 */

export const PREFLIGHT_STATUS = {
  READY: 'READY',
  VIOLATIONS_FOUND: 'VIOLATIONS_FOUND',
  TABLE_NOT_FOUND: 'TABLE_NOT_FOUND',
  DATABASE_QUERY_FAILED: 'DATABASE_QUERY_FAILED'
};

export const PREFLIGHT_VIOLATION_TYPES = {
  DUPLICATE_CURRENT_PLANS: 'DUPLICATE_CURRENT_PLANS',
  APPROVED_MISSING_APPROVER: 'APPROVED_MISSING_APPROVER',
  APPROVED_MISSING_TIMESTAMP: 'APPROVED_MISSING_TIMESTAMP',
  SUPERSEDED_INCOMPLETE_EVIDENCE: 'SUPERSEDED_INCOMPLETE_EVIDENCE'
};

const READ_ONLY_REGEX = /^\s*(SELECT|PRAGMA)\b/i;
const MUTATION_REGEX = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE)\b/i;

function assertReadOnly(sql) {
  if (!READ_ONLY_REGEX.test(sql) || MUTATION_REGEX.test(sql)) {
    throw new Error(`Security Violation: Preflight validation must be strictly read-only. Disallowed query: ${sql.slice(0, 40)}...`);
  }
}

export async function validateVccMigrationPreflight(db) {
  const stepsCompleted = [];
  const violations = [];

  try {
    // Step 1: Verify Connection & Target Schema Check
    assertReadOnly("SELECT 1 FROM sqlite_master LIMIT 1");
    await db.prepare("SELECT 1 FROM sqlite_master LIMIT 1").first();
    stepsCompleted.push('CONNECTION_VERIFIED');

    // Step 2: Explicit Table Existence Check
    assertReadOnly("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vcc_annual_plans'");
    const tableCheck = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vcc_annual_plans'")
      .first();

    if (!tableCheck || !tableCheck.name) {
      stepsCompleted.push('TABLE_CHECK_COMPLETED');
      const msg = '❌ ไม่พบตาราง vcc_annual_plans ในฐานข้อมูลเป้าหมาย (TABLE_NOT_FOUND): กรุณาตรวจสอบว่าระบุฐานข้อมูลเป้าหมายถูกต้อง และติดตั้ง Migration พื้นฐาน (0025) ก่อนดำเนินการ';
      return {
        status: PREFLIGHT_STATUS.TABLE_NOT_FOUND,
        isValid: false,
        targetChecked: true,
        stepsCompleted,
        summary: { totalPlans: 0, violationsCount: 0, criticalCount: 1, warningCount: 0 },
        violations: [{
          type: 'TABLE_NOT_FOUND',
          severity: 'CRITICAL',
          issue: 'ไม่พบตาราง vcc_annual_plans ในฐานข้อมูลเป้าหมาย (Wrong Target Database หรือฐานข้อมูลยังไม่ได้รับการติดตั้ง Migration 0025)',
          remediationGuide: 'ตรวจสอบพารามิเตอร์ฐานข้อมูลเป้าหมาย (--local, --remote, --persist-to) และรัน Migration พื้นฐานให้เรียบร้อย'
        }],
        reportText: `=== รายงานผลการตรวจประเมินความพร้อมก่อนรัน Migration (VCC Preflight Diagnostic Report) ===\n\nสถานะ: ❌ TABLE_NOT_FOUND (FAIL-CLOSED)\nรายละเอียด: ${msg}\n`
      };
    }
    stepsCompleted.push('TABLE_VERIFIED');

    // Step 3: Column Introspection
    assertReadOnly("PRAGMA table_info(vcc_annual_plans)");
    const cols = await db.prepare("PRAGMA table_info(vcc_annual_plans)").all();
    const colList = cols.results || cols || [];
    const colNames = new Set(colList.map((c) => c.name));
    const hasEffectiveStatus = colNames.has('effective_status');
    stepsCompleted.push('COLUMNS_INSPECTED');

    // Step 4: Overall Counts
    assertReadOnly(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN is_current = 1 THEN 1 ELSE 0 END) as current_count
      FROM vcc_annual_plans
    `);
    const countStats = await db
      .prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved_count,
          SUM(CASE WHEN is_current = 1 THEN 1 ELSE 0 END) as current_count
        FROM vcc_annual_plans
      `)
      .first();

    const totalPlans = countStats?.total || 0;
    const approvedPlans = countStats?.approved_count || 0;
    const currentPlans = countStats?.current_count || 0;
    stepsCompleted.push('STATISTICS_GATHERED');

    // Step 5: Duplicate CURRENT Plans Check
    const duplicateQuery = hasEffectiveStatus
      ? `
        SELECT plan_year, department, COUNT(*) as cnt, GROUP_CONCAT(id) as ids, GROUP_CONCAT(revision) as revs
        FROM vcc_annual_plans
        WHERE is_current = 1 OR effective_status = 'CURRENT'
        GROUP BY plan_year, department
        HAVING cnt > 1
      `
      : `
        SELECT plan_year, department, COUNT(*) as cnt, GROUP_CONCAT(id) as ids, GROUP_CONCAT(revision) as revs
        FROM vcc_annual_plans
        WHERE is_current = 1
        GROUP BY plan_year, department
        HAVING cnt > 1
      `;
    assertReadOnly(duplicateQuery);
    const duplicateRows = await db.prepare(duplicateQuery).all();
    const dupList = duplicateRows.results || duplicateRows || [];

    for (const dup of dupList) {
      violations.push({
        type: PREFLIGHT_VIOLATION_TYPES.DUPLICATE_CURRENT_PLANS,
        severity: 'CRITICAL',
        planYear: dup.plan_year,
        department: dup.department,
        collidingIds: dup.ids ? dup.ids.split(',') : [],
        revisions: dup.revs ? dup.revs.split(',') : [],
        issue: `พบแผนงานสถานะใช้งานจริง (CURRENT / is_current=1) ซ้ำซ้อนจำนวน ${dup.cnt} ฉบับ ในปี ${dup.plan_year} แผนก ${dup.department}`,
        remediationGuide: 'ต้องให้ DCC / ผู้ดูแลระบบตรวจสอบประวัติการอนุมัติเพื่อยืนยันฉบับที่มีผลใช้งานจริงเพียงฉบับเดียว ก่อนดำเนินการรัน Migration'
      });
    }
    stepsCompleted.push('DUPLICATE_CHECK_COMPLETED');

    // Step 6: Missing Approver Check
    const missingApproverSql = `
      SELECT id, plan_year, department, revision, title, status, approved_at, approved_by
      FROM vcc_annual_plans
      WHERE status = 'APPROVED' AND (approved_by IS NULL OR trim(approved_by) = '')
    `;
    assertReadOnly(missingApproverSql);
    const missingApproverRows = await db.prepare(missingApproverSql).all();
    const missingApprovers = missingApproverRows.results || missingApproverRows || [];

    for (const p of missingApprovers) {
      violations.push({
        type: PREFLIGHT_VIOLATION_TYPES.APPROVED_MISSING_APPROVER,
        severity: 'CRITICAL',
        planId: p.id,
        planYear: p.plan_year,
        department: p.department,
        revision: p.revision,
        title: p.title,
        issue: `แผนงาน ${p.id} (ปี ${p.plan_year} แผนก ${p.department} Rev.${p.revision}) ได้รับสถานะ APPROVED แต่ขาดข้อมูลผู้อนุมัติ (approved_by เป็นค่าว่าง)`,
        remediationGuide: 'ห้ามระบบเปลี่ยนสถานะโดยอัตโนมัติ ต้องให้ฝ่ายกำกับดูแลคุณภาพ (QMR/DCC) ตรวจสอบเอกสารอนุมัติทางกายภาพหรือลงนามรับรองตามขั้นตอน QMS'
      });
    }
    stepsCompleted.push('APPROVER_CHECK_COMPLETED');

    // Step 7: Missing Timestamp Check
    const missingTimestampSql = `
      SELECT id, plan_year, department, revision, title, status, approved_at, approved_by
      FROM vcc_annual_plans
      WHERE status = 'APPROVED' AND (approved_at IS NULL OR trim(approved_at) = '')
    `;
    assertReadOnly(missingTimestampSql);
    const missingTimestampRows = await db.prepare(missingTimestampSql).all();
    const missingTimestamps = missingTimestampRows.results || missingTimestampRows || [];

    for (const p of missingTimestamps) {
      violations.push({
        type: PREFLIGHT_VIOLATION_TYPES.APPROVED_MISSING_TIMESTAMP,
        severity: 'CRITICAL',
        planId: p.id,
        planYear: p.plan_year,
        department: p.department,
        revision: p.revision,
        title: p.title,
        issue: `แผนงาน ${p.id} (ปี ${p.plan_year} แผนก ${p.department} Rev.${p.revision}) ได้รับสถานะ APPROVED แต่ขาดวันเวลาที่อนุมัติ (approved_at เป็นค่าว่าง)`,
        remediationGuide: 'ห้ามคาดเดาวันที่อนุมัติ ต้องตรวจสอบบันทึก Audit Log หรือหลักฐานการประชุมทบทวนเพื่อลงวันที่ตามข้อเท็จจริง'
      });
    }
    stepsCompleted.push('TIMESTAMP_CHECK_COMPLETED');

    // Step 8: Superseded Incomplete Evidence Check
    const supersededQuery = hasEffectiveStatus
      ? `
        SELECT id, plan_year, department, revision, title, status, effective_status, approved_at, approved_by
        FROM vcc_annual_plans
        WHERE effective_status = 'SUPERSEDED' AND (approved_by IS NULL OR approved_at IS NULL OR status != 'APPROVED')
      `
      : `
        SELECT id, plan_year, department, revision, title, status, approved_at, approved_by
        FROM vcc_annual_plans
        WHERE is_current = 0 AND status = 'APPROVED' AND (approved_by IS NULL OR approved_at IS NULL)
      `;
    assertReadOnly(supersededQuery);
    const supersededRows = await db.prepare(supersededQuery).all();
    const supersededList = supersededRows.results || supersededRows || [];

    for (const p of supersededList) {
      violations.push({
        type: PREFLIGHT_VIOLATION_TYPES.SUPERSEDED_INCOMPLETE_EVIDENCE,
        severity: 'WARNING',
        planId: p.id,
        planYear: p.plan_year,
        department: p.department,
        revision: p.revision,
        title: p.title,
        issue: `แผนงานประวัติเดิม ${p.id} (ปี ${p.plan_year} แผนก ${p.department} Rev.${p.revision}) มีสถานะประวัติเก่าแต่หลักฐานการอนุมัติไม่สมบูรณ์`,
        remediationGuide: 'ตรวจสอบประวัติเอกสารเดิมในคลังเอกสาร DCC เพื่อยืนยันความสมบูรณ์ของหลักฐานคุณภาพ'
      });
    }
    stepsCompleted.push('SUPERSEDED_CHECK_COMPLETED');

    // Format Diagnostic Report Text
    const criticalCount = violations.filter((v) => v.severity === 'CRITICAL').length;
    const warningCount = violations.filter((v) => v.severity === 'WARNING').length;
    const isValid = criticalCount === 0;
    const status = isValid ? PREFLIGHT_STATUS.READY : PREFLIGHT_STATUS.VIOLATIONS_FOUND;

    let report = '=== รายงานผลการตรวจประเมินความพร้อมก่อนรัน Migration (VCC Preflight Diagnostic Report) ===\n\n';
    report += `สรุปภาพรวมฐานข้อมูล:\n`;
    report += `- สถานะการประเมิน: ${isValid ? '✅ READY (ผ่านเกณฑ์ความสมบูรณ์)' : '❌ VIOLATIONS_FOUND (พบข้อบกพร่อง ห้ามรัน Migration)'}\n`;
    report += `- ขั้นตอนที่ดำเนินการสำเร็จ: ${stepsCompleted.length} ขั้นตอน (${stepsCompleted.join(', ')})\n`;
    report += `- จำนวนแผนทั้งหมด: ${totalPlans} แผน\n`;
    report += `- จำนวนแผนสถานะ APPROVED: ${approvedPlans} แผน\n`;
    report += `- จำนวนแผนสถานะใช้งานจริง (is_current=1): ${currentPlans} แผน\n`;
    report += `- รายการข้อบกพร่อง: วิกฤต ${criticalCount} รายการ, แจ้งเตือน ${warningCount} รายการ\n\n`;

    if (violations.length > 0) {
      report += 'รายละเอียดข้อบกพร่องและการดำเนินการแก้ไข:\n';
      violations.forEach((v, idx) => {
        report += `[${idx + 1}] ความรุนแรง: ${v.severity} | ประเภท: ${v.type}\n`;
        report += `    ปัญหา: ${v.issue}\n`;
        report += `    แนวทางแก้ไขที่ถูกต้อง: ${v.remediationGuide}\n`;
        if (v.collidingIds) {
          report += `    รหัสแผนงานที่ขัดแย้ง: ${v.collidingIds.join(', ')} (Revisions: ${v.revisions?.join(', ')})\n`;
        }
        report += '\n';
      });
    } else {
      report += ' ข้อมูลประวัติและสถานะการอนุมัติมีความสมบูรณ์ 100% ไม่พบข้อขัดแย้งเชิงโครงสร้าง สามารถรัน Migration ได้อย่างปลอดภัย\n';
    }

    return {
      status,
      isValid,
      targetChecked: true,
      stepsCompleted,
      summary: {
        totalPlans,
        approvedPlans,
        currentPlans,
        violationsCount: violations.length,
        criticalCount,
        warningCount
      },
      violations,
      reportText: report
    };
  } catch (err) {
    // FAIL-CLOSED: Any error during query execution or connection causes immediate failure
    const errorMsg = `เกิดข้อผิดพลาดระหว่างตรวจสอบฐานข้อมูล (DATABASE_QUERY_FAILED): ${err.message}`;
    return {
      status: PREFLIGHT_STATUS.DATABASE_QUERY_FAILED,
      isValid: false,
      targetChecked: stepsCompleted.includes('CONNECTION_VERIFIED'),
      stepsCompleted,
      summary: { totalPlans: 0, violationsCount: 0, criticalCount: 1, warningCount: 0 },
      violations: [{
        type: 'DATABASE_QUERY_FAILED',
        severity: 'CRITICAL',
        issue: errorMsg,
        remediationGuide: 'ตรวจสอบการเชื่อมต่อฐานข้อมูล สิทธิ์การเข้าถึง และความถูกต้องของคำสั่ง SQL'
      }],
      reportText: `=== รายงานผลการตรวจประเมินความพร้อมก่อนรัน Migration (VCC Preflight Diagnostic Report) ===\n\nสถานะ: ❌ DATABASE_QUERY_FAILED (FAIL-CLOSED)\nรายละเอียด: ${errorMsg}\nขั้นตอนที่ทำเสร็จก่อนล้มเหลว: ${stepsCompleted.join(', ') || 'ไม่มี'}\n`,
      error: err.message
    };
  }
}
