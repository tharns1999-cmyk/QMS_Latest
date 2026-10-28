// ป้ายข้อความภาษาไทยของสถานะแผนและกติกาวันครบกำหนด (ค่า enum ภายในไม่แสดงต่อผู้ใช้)
export const PLAN_STATUS_OPTIONS = [
  { key: 'DRAFT', label: 'ร่างแผน' },
  { key: 'PENDING_REVIEW', label: 'รอทบทวน' },
  { key: 'PENDING_APPROVAL', label: 'รออนุมัติ' },
  { key: 'APPROVED', label: 'อนุมัติแล้ว' },
  { key: 'REJECTED', label: 'ส่งกลับแก้ไข' }
];

export const getPlanStatusLabel = (status) =>
  PLAN_STATUS_OPTIONS.find((s) => s.key === status)?.label || status || '-';

export const getDueDateRuleLabel = (rule) => {
  if (rule === 'START_OF_MONTH') return 'ครบกำหนดวันที่ 1 ของเดือน';
  if (rule === 'END_OF_MONTH') return 'ครบกำหนดวันสิ้นเดือน';
  return rule ? `ครบกำหนดตามกติกา ${rule}` : '';
};

export const getPlanStatusTone = (status) => {
  switch (status) {
    case 'APPROVED':
      return 'text-emerald-700 bg-emerald-50';
    case 'PENDING_APPROVAL':
      return 'text-indigo-700 bg-indigo-50';
    case 'PENDING_REVIEW':
      return 'text-amber-800 bg-amber-50';
    case 'REJECTED':
      return 'text-rose-700 bg-rose-50';
    default:
      return 'text-slate-700 bg-slate-100';
  }
};

