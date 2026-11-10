import React from 'react';
import {
  CheckCircle2,
  Clock,
  ShieldCheck,
  Edit3,
  AlertTriangle,
  Check,
  ArrowRight
} from 'lucide-react';
import { formatVccDateTime } from '../utils/vccDateUtils';

/**
 * Compact Single-Row Inline Approval Stepper (Row 2 of Workspace Header)
 * แสดงสายอนุมัติแนวนอนบรรทัดเดียว: ผู้จัดทำ -> ผู้ทบทวน -> ผู้อนุมัติ -> มีผลบังคับใช้
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
  const isSuperseded =
    String(activePlan.effective_status || '').toUpperCase() === 'SUPERSEDED' ||
    (isApproved && Number(activePlan.is_current ?? 1) === 0);

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

  // Step 4: Approved & Effective
  const step4State = isApproved ? 'COMPLETED' : 'UPCOMING';

  const preparerActor = activePlan.prepared_by_name || activePlan.prepared_by;
  const reviewerActor = isRejected
    ? (activePlan.rejected_by_name || activePlan.rejected_by || activePlan.reviewed_by_name || activePlan.assigned_reviewer_name)
    : (activePlan.reviewed_by_name || activePlan.reviewed_by || activePlan.assigned_reviewer_name);
  const approverActor = activePlan.approved_by_name || activePlan.approved_by || activePlan.assigned_approver_name;

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
    },
    {
      id: 'step-approved',
      stepNum: 4,
      stageTitle: 'มีผลบังคับใช้',
      prefix: 'สถานะผลบังคับใช้',
      actorName: isApproved
        ? isSuperseded
          ? 'ถูกแทนที่ด้วยฉบับใหม่ (SUPERSEDED)'
          : 'มีผลบังคับใช้แล้ว (Effective)'
        : 'มีผลบังคับใช้',
      state: step4State,
      timestamp: activePlan.effective_date || activePlan.approved_at,
      icon: isApproved ? CheckCircle2 : Check
    }
  ];

  return (
    <div
      data-testid="annual-plan-progress-stepper"
      role="region"
      aria-label="ขั้นตอนการอนุมัติแผนประจำปี"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-1.5"
    >
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] transition-all ${
                  isStepReturned
                    ? 'border-rose-300 bg-rose-50 text-rose-900 font-semibold'
                    : isStepCurrent
                    ? 'border-indigo-300 bg-white text-indigo-950 font-semibold shadow-2xs ring-1 ring-indigo-500/15'
                    : isStepCompleted
                    ? 'border-emerald-200/90 bg-emerald-50/70 text-emerald-900 font-medium'
                    : 'border-slate-200/80 bg-white/70 text-slate-500'
                }`}
              >
                <span className="sr-only">{step.stageTitle}</span>
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                    isStepReturned
                      ? 'bg-rose-600 text-white'
                      : isStepCurrent
                      ? 'bg-indigo-600 text-white'
                      : isStepCompleted
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {isStepCompleted ? (
                    <Check size={10} strokeWidth={3} />
                  ) : (
                    <StepIcon size={10} strokeWidth={2.4} />
                  )}
                </span>

                <span className="opacity-75 font-semibold">{step.prefix}:</span>
                <span className="max-w-[180px] truncate" title={`${step.prefix}: ${step.actorName}`}>
                  {step.actorName}
                </span>

                {dateShort && (
                  <span className="rounded bg-black/5 px-1 py-0.2 font-mono text-[10px] text-slate-600">
                    {dateShort}
                  </span>
                )}
              </div>

              {idx < steps.length - 1 && (
                <ArrowRight className="h-3 w-3 shrink-0 text-slate-300" aria-hidden="true" />
              )}
            </React.Fragment>
          );
        })}
      </div>

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

