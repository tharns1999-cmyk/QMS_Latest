// How the VCC task inbox describes each kind of work-order task (kinds come from GET /api/vcc/work-tasks).
// `tab` is the inbox tab the task is counted under, so the tab counts always add up to "my tasks".
export const WORK_TASK_KINDS = {
  RECORD_RESULT: {
    tab: 'RECORD_RESULT',
    label: 'บันทึกผลทวนสอบ/สอบเทียบ',
    next: 'บันทึกผลการทวนสอบ แนบเลขที่ใบรับรอง แล้วส่งตรวจรับ',
    button: 'เปิดใบสั่งงานเพื่อบันทึกผล',
    tone: 'bg-sky-50 text-sky-800 border-sky-200'
  },
  REVIEW_RESULT: {
    tab: 'PENDING_REVIEW',
    label: 'ตรวจรับผลทวนสอบ',
    next: 'ตรวจผลที่บันทึกแล้วกดตรวจรับปิดงาน หรือส่งกลับแก้ไข',
    button: 'เปิดใบสั่งงานเพื่อตรวจรับ',
    tone: 'bg-amber-50 text-amber-800 border-amber-200'
  },
  REVISE_RESULT: {
    tab: 'REJECTED',
    label: 'แก้ไขผลที่ถูกส่งกลับ',
    next: 'แก้ไขผลตามเหตุผลที่ส่งกลับ แล้วส่งตรวจรับอีกครั้ง',
    button: 'เปิดใบสั่งงานเพื่อแก้ไข',
    tone: 'bg-rose-50 text-rose-800 border-rose-200'
  },
  RELEASE_HOLD: {
    tab: 'PENDING_APPROVAL',
    label: 'ปลดระงับเครื่องมือ (ON_HOLD)',
    next: 'ประเมินผลกระทบ ระบุเหตุผลและการแก้ไข แล้วปลดระงับ',
    button: 'เปิดใบสั่งงานเพื่อปลดระงับ',
    tone: 'bg-indigo-50 text-indigo-800 border-indigo-200'
  },
  APPROVE_AMENDMENT: {
    tab: 'PENDING_APPROVAL',
    label: 'อนุมัติคำขอแก้ไขผลที่ปิดแล้ว',
    next: 'พิจารณาคำขอแก้ไขผล แล้วอนุมัติหรือปฏิเสธ',
    button: 'เปิดใบสั่งงานเพื่อพิจารณา',
    tone: 'bg-indigo-50 text-indigo-800 border-indigo-200'
  }
};

// A result that needs a retest cannot be closed, so its reviewer's only move is to send it back.
export const describeWorkTask = (task) =>
  task.kind === 'REVIEW_RESULT' && task.result_status === 'INCONCLUSIVE'
    ? { ...WORK_TASK_KINDS.REVIEW_RESULT, label: 'ส่งกลับตรวจซ้ำ (ผลรอตรวจซ้ำ)', next: 'ผลรอตรวจซ้ำปิดงานไม่ได้ ให้ส่งกลับเพื่อตรวจซ้ำและบันทึกผลใหม่' }
    : WORK_TASK_KINDS[task.kind];

// Oldest due date first; no due date last.
export const sortWorkTasks = (tasks) =>
  [...tasks].sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')) || String(a.wo_code).localeCompare(String(b.wo_code)));
