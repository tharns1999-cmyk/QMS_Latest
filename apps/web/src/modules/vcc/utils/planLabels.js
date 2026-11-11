// ศูนย์กลางการตั้งค่าสถานะแผนการทวนสอบ รหัสแผนดิจิทัล และกติกาวันครบกำหนด (Single Source of Truth)
export const PLAN_CODE_PREFIX = 'VCC-AP';

export const PLAN_STATUS_CONFIG = {
  DRAFT: {
    key: 'DRAFT',
    label: 'ร่างแผน',
    badgeLabel: 'ฉบับร่าง (Draft)',
    tone: 'text-slate-700 bg-slate-100',
    badgeClass: 'text-blue-800 bg-blue-50 border-blue-200/80',
    workspaceBadgeClass: 'text-slate-700 bg-slate-100 border-slate-200/80',
    iconColorClass: 'text-blue-600',
    workspaceIconColorClass: 'text-slate-500',
    iconName: 'Edit3',
    workspaceIconName: 'Edit3'
  },
  PENDING_REVIEW: {
    key: 'PENDING_REVIEW',
    label: 'รอทบทวน',
    badgeLabel: 'รอทบทวน (L4)',
    tone: 'text-amber-800 bg-amber-50',
    badgeClass: 'text-amber-800 bg-amber-50 border-amber-200/80',
    workspaceBadgeClass: 'text-amber-800 bg-amber-50 border-amber-200/80',
    iconColorClass: 'text-amber-600',
    workspaceIconColorClass: 'text-amber-600',
    iconName: 'Clock',
    workspaceIconName: 'Clock'
  },
  PENDING_APPROVAL: {
    key: 'PENDING_APPROVAL',
    label: 'รออนุมัติ',
    badgeLabel: 'รออนุมัติ (L5+)',
    tone: 'text-indigo-700 bg-indigo-50',
    badgeClass: 'text-indigo-800 bg-indigo-50 border-indigo-200/80',
    workspaceBadgeClass: 'text-indigo-700 bg-indigo-50 border-indigo-200/80',
    iconColorClass: 'text-indigo-600',
    workspaceIconColorClass: 'text-indigo-600',
    iconName: 'Clock',
    workspaceIconName: 'ShieldCheck'
  },
  APPROVED: {
    key: 'APPROVED',
    label: 'อนุมัติแล้ว',
    badgeLabel: 'บังคับใช้ (Active)',
    tone: 'text-emerald-700 bg-emerald-50',
    badgeClass: 'text-emerald-800 bg-emerald-50 border-emerald-200/80',
    workspaceBadgeClass: 'text-emerald-800 bg-emerald-50 border-emerald-300/90',
    iconColorClass: 'text-emerald-600',
    workspaceIconColorClass: 'text-emerald-600',
    iconName: 'ShieldCheck',
    workspaceIconName: 'ShieldCheck'
  },
  REJECTED: {
    key: 'REJECTED',
    label: 'ส่งกลับแก้ไข',
    badgeLabel: 'ถูกส่งกลับ',
    tone: 'text-rose-700 bg-rose-50',
    badgeClass: 'text-rose-800 bg-rose-50 border-rose-200/80',
    workspaceBadgeClass: 'text-rose-700 bg-rose-50 border-rose-200/80',
    iconColorClass: 'text-rose-600',
    workspaceIconColorClass: 'text-rose-600',
    iconName: 'AlertTriangle',
    workspaceIconName: 'AlertTriangle'
  },
  RETURNED: {
    key: 'RETURNED',
    label: 'ส่งกลับแก้ไข',
    badgeLabel: 'ถูกส่งกลับ',
    tone: 'text-rose-700 bg-rose-50',
    badgeClass: 'text-rose-800 bg-rose-50 border-rose-200/80',
    workspaceBadgeClass: 'text-rose-700 bg-rose-50 border-rose-200/80',
    iconColorClass: 'text-rose-600',
    workspaceIconColorClass: 'text-rose-600',
    iconName: 'AlertTriangle',
    workspaceIconName: 'AlertTriangle'
  }
};

export const PLAN_STATUS_OPTIONS = [
  'DRAFT',
  'PENDING_REVIEW',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED'
].map((key) => ({
  key,
  label: PLAN_STATUS_CONFIG[key].label,
  badgeLabel: PLAN_STATUS_CONFIG[key].badgeLabel
}));

export const getPlanStatusConfig = (status) =>
  PLAN_STATUS_CONFIG[status] || PLAN_STATUS_CONFIG.DRAFT;

export const getPlanStatusLabel = (status) =>
  PLAN_STATUS_CONFIG[status]?.label || status || '-';

export const getPlanStatusBadgeLabel = (status) =>
  getPlanStatusConfig(status).badgeLabel;

export const getDueDateRuleLabel = (rule) => {
  if (rule === 'START_OF_MONTH') return 'ครบกำหนดวันที่ 1 ของเดือน';
  if (rule === 'END_OF_MONTH') return 'ครบกำหนดวันสิ้นเดือน';
  return rule ? `ครบกำหนดตามกติกา ${rule}` : '';
};

export const getPlanStatusTone = (status) =>
  getPlanStatusConfig(status).tone;

/**
 * สร้างรหัสแผนงานดิจิทัลตามสูตรกลาง VCC-AP-[DEPT]-[YEAR]
 * รองรับทั้งออบเจกต์ { dept, year } และออบเจกต์ plan ({ department, plan_year, document_code })
 */
export const resolvePlanCode = (input) => {
  const currentYear = new Date().getFullYear();
  if (!input) {
    return `${PLAN_CODE_PREFIX}-GEN-${currentYear}`;
  }
  const existingCode = String(input.documentCode || input.document_code || input.form_code || '').trim();
  if (existingCode && existingCode.startsWith(`${PLAN_CODE_PREFIX}-`)) {
    return existingCode;
  }
  const rawDept = input.dept ?? input.department ?? input.department_code ?? 'GEN';
  const dept = String(rawDept || 'GEN').toUpperCase().trim();
  const year = input.year ?? input.plan_year ?? currentYear;
  return `${PLAN_CODE_PREFIX}-${dept}-${year}`;
};

// Backward-compatible alias
export const resolveDigitalPlanCode = resolvePlanCode;

// The plan scope lists every eligible asset of the department. Until someone plans months or gives a reason for it, a row is only
// the register entry (id "virtual-…", is_persisted 0): there is nothing saved in the plan to remove.
export const isSavedPlanItem = (item) => Boolean(item) && Number(item.is_persisted) !== 0 && !String(item.id || '').startsWith('virtual-');
