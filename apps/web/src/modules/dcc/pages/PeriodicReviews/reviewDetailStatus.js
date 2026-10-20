import { getDueState, getReviewStatusLabel } from '../../services/PeriodicReviewService';

export const getDetailStatusLabel = (schedule, document, effectiveOutcome, isPendingApproval, effectiveToday) => {
  if (isPendingApproval) return { label: 'รออนุมัติผล', color: 'bg-amber-100 text-amber-800' };
  if (['REVISION_REQUIRED', 'REVISE'].includes(effectiveOutcome)) return { label: 'ต้องแก้ไขเอกสาร', color: 'bg-amber-100 text-amber-800' };
  if (['OBSOLETE_REQUIRED', 'OBSOLETE'].includes(effectiveOutcome)) return { label: 'ต้องยกเลิกเอกสาร', color: 'bg-rose-100 text-rose-800' };
  if (schedule?.status === 'AWAITING_ACTION' || document?.review_status === 'AWAITING_ACTION') return getReviewStatusLabel('AWAITING_ACTION');
  if (schedule?.status === 'COMPLETED' || ['COMPLETED', 'UP_TO_DATE'].includes(document?.review_status)) return { label: 'ทบทวนเสร็จแล้ว', color: 'bg-green-100 text-green-800' };

  const dueState = schedule?.nextReviewDate ? getDueState(schedule.nextReviewDate, effectiveToday) : null;
  if (['NOT_YET_DUE', 'UPCOMING', 'UP_TO_DATE', 'DUE_SOON', 'DUE', 'OVERDUE', 'ESCALATED', 'SCHEDULED'].includes(schedule?.status) && dueState) {
    return getReviewStatusLabel(dueState === 'OVERDUE' || dueState === 'ESCALATED' ? 'OVERDUE' : dueState === 'DUE_TODAY' ? 'DUE' : dueState.startsWith('DUE_SOON') ? 'DUE_SOON' : 'NOT_YET_DUE');
  }
  return getReviewStatusLabel(schedule?.status);
};
