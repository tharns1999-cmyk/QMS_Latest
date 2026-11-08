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
 * Enterprise Compact Workflow Progress Indicator for Annual Plan (FM-QC-46)
 * High Information Density & Modern Minimal Luxury SaaS Design:
 * - 4 Horizontal Segments (34px height):
 *   1. ร่างแผน (Draft) -> 2. ทบทวนแผน (Review) -> 3. อนุมัติแผน (Approval) -> 4. มีผลบังคับใช้ (Effective)
 * - Micro Visual States: Completed (Emerald), Current (Indigo Focus Ring), Upcoming (Slate Muted), Returned (Rose)
 * - Preserves complete accessibility, actors, and real timestamp traceability.
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
      className="bg-slate-50/70 border border-slate-200/80 rounded-xl px-2 sm:px-3 py-1.5 transition-all shadow-2xs"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-2">
        {steps.map((step) => {
          const isStepCurrent = step.state === 'CURRENT' || step.state === 'RETURNED_EDIT';
          const isStepCompleted = step.state === 'COMPLETED';
          const isStepReturned = step.state === 'RETURNED' || step.state === 'RETURNED_EDIT';

          const StepIcon = step.icon;

          return (
            <div
              key={step.id}
              aria-current={isStepCurrent ? 'step' : undefined}
              className={`flex items-center gap-1.5 sm:gap-2 px-2 py-1 rounded-lg border text-xs min-w-0 transition-all ${
                isStepReturned
                  ? 'bg-rose-50/90 border-rose-300 text-rose-900 ring-1 ring-rose-200/80 font-semibold'
                  : isStepCurrent
                  ? 'bg-white border-indigo-300 text-indigo-900 font-bold shadow-2xs ring-2 ring-indigo-500/10'
                  : isStepCompleted
                  ? 'bg-emerald-50/70 border-emerald-200/80 text-emerald-900 font-medium'
                  : 'bg-white/60 border-slate-200/60 text-slate-500 font-normal'
              }`}
            >
              {/* Micro Status Node */}
              <span
                className={`w-4.5 h-4.5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-mono font-bold ${
                  isStepReturned
                    ? 'bg-rose-600 text-white'
                    : isStepCurrent
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : isStepCompleted
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {isStepCompleted ? (
                  <Check size={11} strokeWidth={3} />
                ) : (
                  <StepIcon size={11} strokeWidth={2.2} />
                )}
              </span>

              {/* Title & Actor Summary in one line */}
              <div className="min-w-0 flex-1 flex items-baseline justify-between gap-1">
                <span className="truncate tracking-tight leading-tight">
                  {step.title}
                </span>

                {step.actor && (
                  <span
                    className={`text-[10px] font-normal truncate max-w-[90px] sm:max-w-[110px] hidden sm:inline ${
                      isStepReturned
                        ? 'text-rose-700 font-medium'
                        : isStepCurrent
                        ? 'text-indigo-700 font-medium'
                        : 'text-slate-500'
                    }`}
                    title={`${step.actor}${step.timestamp && formatVccDateTime(step.timestamp) !== '-' ? ` · ${formatVccDateTime(step.timestamp).split(' ')[0]}` : ''}`}
                  >
                    {step.actor}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AnnualPlanProgressStepper;
