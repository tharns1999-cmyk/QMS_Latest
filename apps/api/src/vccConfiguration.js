import { getThresholds } from './approval.js';
import { getUserDepartments } from './vccAuth.js';

export const loadVccProfiles = async (db) => {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'vcc_document_profiles'").first();
  return row ? JSON.parse(row.value) : {};
};

export const vccProfileThresholds = async (db, profile = {}) => {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'vcc_plan_settings'").first();
  const settings = row ? JSON.parse(row.value) : {};
  const matrix = await getThresholds(db, settings.approval_doc_type || 'FM');
  return {
    ...matrix,
    min_requester_level: Math.max(matrix.min_requester_level, Number(profile.min_preparer_level || 0)),
    required_reviewer_level: Math.max(matrix.required_reviewer_level, Number(profile.required_reviewer_level || 0)),
    required_approver_level: Math.max(matrix.required_approver_level, Number(profile.required_approver_level || 0))
  };
};

export const controlledVccForm = (db, profile) => profile?.document_code && profile?.revision
  ? db.prepare(`SELECT id, doc_code, revision, name, effective_date FROM documents
      WHERE doc_code = ? AND revision = ? AND doc_type = 'FM' AND status = 'EFFECTIVE'
      AND effective_date IS NOT NULL AND date(effective_date) <= date('now', '+7 hours')`).bind(profile.document_code, profile.revision).first()
  : null;

export const vccProfileReadiness = async (db, profile) => {
  if (!profile) return { status: 'CONFIGURATION_INCOMPLETE', issues: ['ยังไม่ได้ตั้งค่าแบบฟอร์มและผู้รับผิดชอบ'] };
  const issues = [];
  if (!await controlledVccForm(db, profile)) issues.push('ไม่พบแบบฟอร์ม DCC ที่มีผลบังคับใช้ตรงกับรหัสและฉบับที่กำหนด');
  const levels = await vccProfileThresholds(db, profile);
  for (const stage of ['reviewer', 'approver']) {
    const person = profile[`assigned_${stage}_id`] && await db.prepare("SELECT * FROM users WHERE id = ? AND status = 'ACTIVE'").bind(profile[`assigned_${stage}_id`]).first();
    const label = stage === 'reviewer' ? 'ผู้ทบทวน' : 'ผู้อนุมัติ';
    if (!person) issues.push(`ไม่พบผู้ใช้งาน${label} หรือบัญชีไม่พร้อมปฏิบัติงาน`);
    else if (person.approval_level < levels[`required_${stage}_level`]) issues.push(`${label}ต้องมีระดับอนุมัติตั้งแต่ L${levels[`required_${stage}_level`]} ขึ้นไป`);
    else if (!getUserDepartments(person).includes(profile[`${stage}_dept`])) issues.push(`${label}ต้องสังกัดแผนก ${profile[`${stage}_dept`] || '(ยังไม่ได้ตั้งค่า)'}`);
  }
  if (profile.assigned_reviewer_id && profile.assigned_reviewer_id === profile.assigned_approver_id) issues.push('ผู้ทบทวนและผู้อนุมัติต้องไม่เป็นบุคคลเดียวกัน (Segregation of Duties)');
  return { status: issues.length ? 'CONFIGURATION_INCOMPLETE' : 'READY', issues };
};

export const configurationIncomplete = { code: 'CONFIGURATION_INCOMPLETE', error: 'ยังไม่พบแบบฟอร์ม DCC ที่มีผลบังคับใช้ตรงกับค่าตั้งค่า กรุณาให้ผู้ดูแลตรวจสอบการเชื่อมโยงเอกสาร' };
