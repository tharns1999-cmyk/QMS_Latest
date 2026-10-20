// Server-side twin of apps/web/src/modules/dcc/utils/workflowResolver.js eligibility rules.
const CROSS_ORG_DEPTS = ['MGMT', 'EXEC', 'QMR'];
// Unknown document types fall back to the same levels as the web registry.
const DEFAULT_THRESHOLDS = { min_requester_level: 1, required_reviewer_level: 4, required_approver_level: 5 };

export const getThresholds = async (db, docType) =>
  (await db.prepare('SELECT * FROM approval_matrix WHERE doc_type = ?').bind(String(docType || '').toUpperCase().trim()).first())
  ?? DEFAULT_THRESHOLDS;

const isCrossOrgAuthority = (user) =>
  user.isQmr || user.approval_level >= 6 || user.depts.some((d) => CROSS_ORG_DEPTS.includes(d));

/**
 * Returns null when `user` may record a REVIEW or APPROVE decision on a document, otherwise the reason in Thai.
 * `user` is the shape returned by requireAuth; `thresholds` is a getThresholds() row.
 */
export function checkDecisionRights(user, { stage, department, requesterId, reviewerId }, thresholds) {
  if (stage !== 'REVIEW' && stage !== 'APPROVE') return 'ขั้นตอนไม่ถูกต้อง';
  if (user.id === requesterId) return 'ผู้ขอไม่สามารถทบทวนหรืออนุมัติคำขอของตนเองได้';
  if (stage === 'APPROVE' && user.id === reviewerId) return 'ผู้ทบทวนไม่สามารถอนุมัติเอกสารที่ตนทบทวนได้';
  if (user.isDcc && department !== 'DC') return 'DCC ไม่สามารถทบทวนหรืออนุมัติเอกสารของแผนกอื่นได้';

  const required = stage === 'REVIEW' ? thresholds.required_reviewer_level : thresholds.required_approver_level;
  if (user.approval_level < required) return `ต้องมีระดับอนุมัติ L${required} ขึ้นไป`;

  if (!user.depts.includes(department) && user.department !== department && !isCrossOrgAuthority(user)) {
    return 'ต้องเป็นสมาชิกแผนกเจ้าของเอกสาร';
  }
  return null;
}
