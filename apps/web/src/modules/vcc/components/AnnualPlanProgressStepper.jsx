import React from 'react';
import {
  CheckCircle2,
  Clock,
  ShieldCheck,
  Edit3,
  AlertTriangle,
  Check
} from 'lucide-react';
import { formatVccDateTime } from '../utils/vccDateUtils';

/**
 * Enterprise Workflow Progress Stepper for Annual Plan (FM-QC-46)
 * Clean Minimal Luxury Design:
 * - 4 Stages: 1. ร่างแผน (Draft) -> 2. รอทบทวน (Review) -> 3. รออนุมัติ (Approval) -> 4. อนุมัติแล้ว (Approved)
 * - Visual States: Completed, Current, Upcoming, Returned
 * - Non-fictitious: displays only real actors and timestamps from activePlan
 */
export const AnnualPlanProgressStepper = ({
  activePlan,
  thresholds = {}
}) => {
  if (!activePlan) return null;

  const status = activePlan.status || 'DRAFT';
  const isRejected = status === 'REJECTED';
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

  // Step 4: Approved & Effective
  const step4State = isApproved ? 'COMPLETED' : 'UPCOMING';

  const steps = [
    {
      id: 'step-draft',
      stepNum: 1,
      title: isRejected ? 'ส่งกลับแก้ไข (ร่างแผน)' : 'ร่างแผนประจำปี',
      role: isRejected ? 'ต้องส่งทบทวนใหม่' : 'จัดทำแผน',
      state: step1State,
      actor: activePlan.prepared_by_name || activePlan.prepared_by,
      timestamp: activePlan.prepared_at,
      icon: isRejected ? AlertTriangle : isDraft ? Edit3 : Check
    },
    {
      id: 'step-review',
      stepNum: 2,
      title: isRejected ? 'ส่งกลับแก้ไข' : 'ทบทวนแผน',
      role: isRejected ? 'ส่งกลับแก้ไข' : `ทบทวน (L${thresholds.required_reviewer_level || 4}+)`,
      state: step2State,
      actor: isRejected
        ? (activePlan.rejected_by_name || activePlan.rejected_by)
        : (activePlan.reviewed_by_name || activePlan.reviewed_by || activePlan.assigned_reviewer_name),
      timestamp: isRejected ? activePlan.rejected_at : activePlan.reviewed_at,
      icon: isRejected ? AlertTriangle : isPendingReview ? Clock : Check
    },
    {
      id: 'step-approval',
      stepNum: 3,
      title: 'อนุมัติแผน',
      role: `อนุมัติ (L${thresholds.required_approver_level || 5}+)`,
      state: step3State,
      actor: activePlan.approved_by_name || activePlan.approved_by || activePlan.assigned_approver_name,
      timestamp: activePlan.approved_at,
      icon: isPendingApproval ? ShieldCheck : Check
    },
    {
      id: 'step-approved',
      stepNum: 4,
      title: 'มีผลบังคับใช้',
      role: 'พร้อมออกใบสั่งงาน',
      state: step4State,
      actor: null,
      timestamp: null,
      icon: isApproved ? CheckCircle2 : Check
    }
  ];

  return (
    <div
      data-testid="annual-plan-progress-stepper"
      role="region"
      aria-label="ขั้นตอนการอนุมัติแผนประจำปี"
      className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-3 sm:p-3.5 space-y-2"
    >
      {/* Desktop & Tablet: Horizontal Flow */}
      <div className="hidden sm:flex items-center justify-between relative">
        {/* Background Connecting Track */}
        <div
          className="absolute top-4 left-6 right-6 h-0.5 bg-slate-200/90 -z-0"
          aria-hidden="true"
        />

        {steps.map((step) => {
          const isStepCurrent = step.state === 'CURRENT' || step.state === 'RETURNED_EDIT';
          const isStepCompleted = step.state === 'COMPLETED';
          const isStepReturned = step.state === 'RETURNED' || step.state === 'RETURNED_EDIT';

          const StepIcon = step.icon;

          return (
            <div
              key={step.id}
              className="flex-1 flex flex-col items-center text-center relative z-10 px-1 group"
              aria-current={isStepCurrent ? 'step' : undefined}
            >
              {/* Node Circle */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  isStepReturned
                    ? 'bg-rose-50 text-rose-700 border-2 border-rose-500 ring-4 ring-rose-100 shadow-2xs'
                    : isStepCurrent
                    ? 'bg-indigo-600 text-white ring-4 ring-indigo-100 shadow-2xs font-bold'
                    : isStepCompleted
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-white text-slate-400 border border-slate-300'
                }`}
              >
                {isStepCompleted ? (
                  <Check size={14} strokeWidth={2.5} />
                ) : (
                  <StepIcon size={13} strokeWidth={2.2} />
                )}
              </div>

              {/* Title & Role */}
              <div className="mt-1.5 space-y-0.5">
                <div
                  className={`text-xs tracking-tight ${
                    isStepReturned
                      ? 'font-bold text-rose-800'
                      : isStepCurrent
                      ? 'font-bold text-indigo-900'
                      : isStepCompleted
                      ? 'font-semibold text-slate-800'
                      : 'font-medium text-slate-500'
                  }`}
                >
                  {step.title}
                </div>

                <div className="text-[11px] text-slate-500 leading-tight">
                  {step.role}
                </div>

                {/* Subtext: Actor / Timestamp if exists */}
                {step.actor && (
                  <div
                    className={`text-[10px] font-sans truncate max-w-[130px] mx-auto ${
                      isStepReturned
                        ? 'text-rose-600 font-medium'
                        : isStepCurrent
                        ? 'text-indigo-600 font-medium'
                        : 'text-slate-500'
                    }`}
                    title={step.actor}
                  >
                    {isStepCurrent && !isStepReturned && !step.timestamp ? (
                      <span>{step.actor}</span>
                    ) : (
                      <span>
                        {step.actor}
                        {step.timestamp && formatVccDateTime(step.timestamp) !== '-' ? (
                          <span className="text-slate-400 ml-1">· {formatVccDateTime(step.timestamp).split(' ')[0]}</span>
                        ) : null}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile: Compact Horizontal Stepper Pills */}
      <div className="flex sm:hidden items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        {steps.map((step) => {
          const isStepCurrent = step.state === 'CURRENT' || step.state === 'RETURNED_EDIT';
          const isStepCompleted = step.state === 'COMPLETED';
          const isStepReturned = step.state === 'RETURNED' || step.state === 'RETURNED_EDIT';

          const StepIcon = step.icon;

          return (
            <div
              key={step.id}
              className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all ${
                isStepReturned
                  ? 'bg-rose-50 border-rose-200 text-rose-800 font-bold'
                  : isStepCurrent
                  ? 'bg-white border-indigo-300 text-indigo-900 font-bold shadow-2xs ring-2 ring-indigo-500/10'
                  : isStepCompleted
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800 font-medium'
                  : 'bg-white/80 border-slate-200 text-slate-500 font-normal'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] ${
                  isStepReturned
                    ? 'bg-rose-600 text-white'
                    : isStepCurrent
                    ? 'bg-indigo-600 text-white'
                    : isStepCompleted
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {isStepCompleted ? <Check size={10} strokeWidth={3} /> : <StepIcon size={10} />}
              </span>
              <span className="whitespace-nowrap">{step.title}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AnnualPlanProgressStepper;
