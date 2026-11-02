/**
 * VCC Migration Preflight Validation Engine
 * 
 * Inspects database health and historical evidence integrity prior to applying schema migrations.
 * Detects anomalies (missing approver, missing timestamp, duplicate CURRENT plans, incomplete superseded evidence)
 * and generates a comprehensive Diagnostic Report without mutating or guessing historical quality records.
 */

export const PREFLIGHT_VIOLATION_TYPES = {
  DUPLICATE_CURRENT_PLANS: 'DUPLICATE_CURRENT_PLANS',
  APPROVED_MISSING_APPROVER: 'APPROVED_MISSING_APPROVER',
  APPROVED_MISSING_TIMESTAMP: 'APPROVED_MISSING_TIMESTAMP',
  SUPERSEDED_INCOMPLETE_EVIDENCE: 'SUPERSEDED_INCOMPLETE_EVIDENCE'
};

export async function validateVccMigrationPreflight(db) {
  const violations = [];

  // Check if vcc_annual_plans table exists
  const tableCheck = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vcc_annual_plans'")
    .first();

  if (!tableCheck) {
    return {
      isValid: true,
      summary: { totalPlans: 0, violationsCount: 0 },
      violations: [],
      reportText: 'ไม่พบตาราง vcc_annual_plans (ฐานข้อมูลใหม่ ยังไม่มีข้อมูลแผน)'
    };
  }

  // Check which columns exist in vcc_annual_plans
  const cols = await db.prepare("PRAGMA table_info(vcc_annual_plans)").all();
  const colNames = new Set((cols.results || cols || []).map((c) => c.name));
  const hasEffectiveStatus = colNames.has('effective_status');

  // Query overall statistics
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

  // 1. Check for Duplicate Active/Current Plans (before 0033 or in current state)
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

  // 2. Check for APPROVED plans missing approved_by
  const missingApproverRows = await db
    .prepare(`
      SELECT id, plan_year, department, revision, title, status, approved_at, approved_by
      FROM vcc_annual_plans
      WHERE status = 'APPROVED' AND (approved_by IS NULL OR trim(approved_by) = '')
    `)
    .all();
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

  // 3. Check for APPROVED plans missing approved_at
  const missingTimestampRows = await db
    .prepare(`
      SELECT id, plan_year, department, revision, title, status, approved_at, approved_by
      FROM vcc_annual_plans
      WHERE status = 'APPROVED' AND (approved_at IS NULL OR trim(approved_at) = '')
    `)
    .all();
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

  // 4. Check for SUPERSEDED plans with incomplete evidence
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

  // Format Diagnostic Report Text (in simple, structured Thai)
  const isValid = violations.filter((v) => v.severity === 'CRITICAL').length === 0;

  let report = '=== รายงานผลการตรวจประเมินความพร้อมก่อนรัน Migration (VCC Preflight Diagnostic Report) ===\n\n';
  report += `สรุปภาพรวมฐานข้อมูล:\n`;
  report += `- จำนวนแผนทั้งหมด: ${totalPlans} แผน\n`;
  report += `- จำนวนแผนสถานะ APPROVED: ${approvedPlans} แผน\n`;
  report += `- จำนวนแผนสถานะใช้งานจริง (is_current=1): ${currentPlans} แผน\n`;
  report += `- ผลการตรวจประเมิน: ${isValid ? ' ผ่านเกณฑ์ความสมบูรณ์ของข้อมูล (READY)' : ' ตรวจพบความผิดปกติของข้อมูลประวัติ (FAIL SAFELY)'}\n`;
  report += `- รายการข้อบกพร่องที่ตรวจพบ: ${violations.length} รายการ\n\n`;

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
    isValid,
    summary: {
      totalPlans,
      approvedPlans,
      currentPlans,
      violationsCount: violations.length,
      criticalCount: violations.filter((v) => v.severity === 'CRITICAL').length,
      warningCount: violations.filter((v) => v.severity === 'WARNING').length
    },
    violations,
    reportText: report
  };
}
