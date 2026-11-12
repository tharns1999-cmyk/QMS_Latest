import React from 'react';
import {
  Clock,
  ShieldCheck,
  Edit3,
  AlertTriangle,
  Check
} from 'lucide-react';
import { formatVccDateTime } from '../utils/vccDateUtils';

/**
 * Strips trailing numbers/IDs from actor names (e.g., "ประเสริฐ 12" -> "ประเสริฐ")
 */
export const cleanActorName = (name) => {
  if (!name || typeof name !== 'string') return '';
  return name.replace(/\s+\d+$/, '').trim();
};

/**
 * Minimal Horizontal Stepper (Row 2 of Workspace Header)
 * แสดงสายอนุมัติแนวนอนเรียบง่าย 3 ขั้นตอน: ผู้จัดทำ -> ผู้ทบทวน -> ผู้อนุมัติ
 */
export const AnnualPlanProgressStepper = ({
  activePlan,
  thresholds = {}
}) => {
  if (!activePlan) return null;

  const status = activePlan.status || 'DRAFT';
  const isRejected = status === 'REJECTED' || status === 'RETURNED';
  const isDraft = status === 'DRAFT';
  const isPendingReview = status === 'PENDING_REVIEW';
  const isPendingApproval = status === 'PENDING_APPROVAL';
  const isApproved = status === 'APPROVED';

  // Step 1: Draft
  const step1State = isRejected
    ? 'RETURNED_EDIT'
    : isDraft
    ? 'CURRENT'
    : 'COMPLETED';

  // Step 2: Review
  const step2State = isRejected
    ? 'RETURNED'
    : isPendingReview
    ? 'CURRENT'
    : isPendingApproval || isApproved
    ? 'COMPLETED'
    : 'UPCOMING';

  // Step 3: Approval
  const step3State = isPendingApproval
    ? 'CURRENT'
    : isApproved
    ? 'COMPLETED'
    : 'UPCOMING';

  const rawPreparer = activePlan.prepared_by_name || activePlan.prepared_by;
  const preparerActor = rawPreparer ? cleanActorName(rawPreparer) : null;

  const rawReviewer = isRejected
    ? (activePlan.rejected_by_name || activePlan.rejected_by || activePlan.reviewed_by_name || activePlan.assigned_reviewer_name)
    : (activePlan.reviewed_by_name || activePlan.reviewed_by || activePlan.assigned_reviewer_name);
  const reviewerActor = rawReviewer ? cleanActorName(rawReviewer) : null;

  const rawApprover = activePlan.approved_by_name || activePlan.approved_by || activePlan.assigned_approver_name;
  const approverActor = rawApprover ? cleanActorName(rawApprover) : null;

  const steps = [
    {
      id: 'step-draft',
      stepNum: 1,
      stageTitle: 'ร่างแผนประจำปี',
      prefix: isRejected ? 'ส่งกลับแก้ไข' : 'ผู้จัดทำ',
      actorName: preparerActor || 'กำลังจัดทำร่างแผน',
      state: step1State,
      timestamp: activePlan.prepared_at,
      icon: isRejected ? AlertTriangle : isDraft ? Edit3 : Check
    },
    {
      id: 'step-review',
      stepNum: 2,
      stageTitle: 'ทบทวนแผน',
      prefix: isRejected ? 'ผู้ส่งกลับ' : 'ผู้ทบทวน',
      actorName: reviewerActor || `รอระบุ (L${thresholds.required_reviewer_level || 4}+)`,
      state: step2State,
      timestamp: isRejected ? activePlan.rejected_at : activePlan.reviewed_at,
      icon: isRejected ? AlertTriangle : isPendingReview ? Clock : Check
    },
    {
      id: 'step-approval',
      stepNum: 3,
      stageTitle: 'อนุมัติแผน',
      prefix: 'ผู้อนุมัติ',
      actorName: approverActor || `รอระบุ (L${thresholds.required_approver_level || 5}+)`,
      state: step3State,
      timestamp: activePlan.approved_at,
      icon: isPendingApproval ? ShieldCheck : Check
    }
  ];

  return (
    <div
      data-testid="annual-plan-progress-stepper"
      role="region"
      aria-label="ขั้นตอนการอนุมัติแผนประจำปี"
      className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200/70 bg-slate-50/50 px-3.5 py-2 text-xs"
    >
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {steps.map((step, idx) => {
          const isStepCurrent = step.state === 'CURRENT' || step.state === 'RETURNED_EDIT';
          const isStepCompleted = step.state === 'COMPLETED';
          const isStepReturned = step.state === 'RETURNED' || step.state === 'RETURNED_EDIT';
          const StepIcon = step.icon;
          const dateShort =
            step.timestamp && formatVccDateTime(step.timestamp) !== '-'
              ? formatVccDateTime(step.timestamp).split(' ')[0]
              : null;

          return (
            <React.Fragment key={step.id}>
              <div
                aria-current={isStepCurrent ? 'step' : undefined}
                className={`inline-flex items-center gap-2 transition-all ${
                  isStepReturned
                    ? 'text-rose-900 font-semibold'
                    : isStepCurrent
                    ? 'text-indigo-950 font-semibold'
                    : isStepCompleted
                    ? 'text-slate-800 font-medium'
                    : 'text-slate-400 font-normal opacity-80'
                }`}
              >
                <span className="sr-only">{step.stageTitle}</span>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                    isStepReturned
                      ? 'bg-rose-100 text-rose-700 border border-rose-200'
                      : isStepCurrent
                      ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500/20 border border-indigo-300'
                      : isStepCompleted
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-400 border border-slate-200'
                  }`}
                >
                  {isStepCompleted ? (
                    <Check size={11} strokeWidth={3} className="text-emerald-700" />
                  ) : (
                    <StepIcon size={11} strokeWidth={2.5} />
                  )}
                </span>

                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={isStepCurrent ? 'text-indigo-900 font-bold' : isStepReturned ? 'text-rose-900 font-bold' : isStepCompleted ? 'text-slate-600 font-semibold' : 'text-slate-400 font-medium'}>
                    {step.prefix}:
                  </span>
                  <span className="max-w-[180px] truncate" title={`${step.prefix}: ${step.actorName}`}>
                    {step.actorName}
                  </span>
                  {dateShort && (
                    <span className="text-[10px] font-mono text-slate-400">
                      ({dateShort})
                    </span>
                  )}
                </div>
              </div>

              {idx < steps.length - 1 && (
                <span className="text-slate-300 select-none text-xs font-light" aria-hidden="true">
                  →
                </span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Accessible text for test/a11y compatibility */}
      <span className="sr-only">มีผลบังคับใช้</span>

      {activePlan.revision_reason && (
        <div
          className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50/90 px-2.5 py-0.5 text-[11px] text-indigo-900"
          title={activePlan.revision_reason}
        >
          <span className="font-bold">เหตุผลขอแก้ไข Rev.{activePlan.revision || '01'}:</span>
          <span className="max-w-[260px] truncate font-medium">{activePlan.revision_reason}</span>
        </div>
      )}
    </div>
  );
};

export default AnnualPlanProgressStepper;
