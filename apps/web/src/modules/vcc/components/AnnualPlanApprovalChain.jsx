import React from 'react';
import { CheckCircle2 } from 'lucide-react';

const formatThaiDateTime = (iso) => {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const StepRow = ({ label, name, at, done, current }) => (
  <div aria-current={current ? "step" : undefined} className="flex items-start gap-2 text-xs">
    {done ? (
      <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
    ) : (
      <span
        className={`w-2 h-2 rounded-full shrink-0 mt-1 ${
          current ? 'bg-amber-500 ring-2 ring-amber-200' : 'bg-slate-300'
        }`}
      />
    )}
    <div className="min-w-0">
      <span className="text-slate-500 text-xs block sm:inline sm:mr-1">{label}: </span>
      <span className={`font-semibold ${done || current ? 'text-slate-900' : 'text-slate-500'}`}>{name}</span>
      {at && <span className="text-slate-400 text-xs font-mono"> · {at}</span>}
    </div>
  </div>
);

// Display recorded decisions and the effective approval policy.
export const AnnualPlanApprovalChain = ({ activePlan, thresholds = {} }) => {
  if (!activePlan) return null;

  const dept = activePlan.department;
  const isDeptProfiled = dept === 'QC' || dept === 'LB';
  const preparerLabel = isDeptProfiled
    ? `ผู้จัดทำ (L${thresholds.min_requester_level || 4}+ · แผนก ${dept})`
    : `ผู้จัดทำ (L${thresholds.min_requester_level || 1}+)`;
  const reviewerLabel = dept === 'QC'
    ? `ผู้ทบทวน (PD L${thresholds.required_reviewer_level || 5})`
    : dept === 'LB'
      ? `ผู้ทบทวน (LB L${thresholds.required_reviewer_level || 5})`
      : `ผู้ทบทวน (L${thresholds.required_reviewer_level || 4}+)`;
  const approverLabel = isDeptProfiled
    ? `ผู้อนุมัติ (MGT L${thresholds.required_approver_level || 6}+)`
    : `ผู้อนุมัติ (L${thresholds.required_approver_level || 5}+)`;

  return (
    <div
      role="region"
      aria-label="ขั้นตอนการอนุมัติแผนประจำปี"
      data-testid="annual-plan-approval-chain"
      className="mt-2.5 pt-2.5 border-t border-slate-100 bg-slate-50/80 p-3 rounded-xl border border-slate-200/60 grid grid-cols-1 md:grid-cols-3 gap-2"
    >
      <StepRow
        current={activePlan.status === "DRAFT" || activePlan.status === "REJECTED"}
        label={preparerLabel}
        name={activePlan.prepared_by_name || activePlan.prepared_by || 'ยังไม่ส่ง'}
        at={formatThaiDateTime(activePlan.prepared_at)}
        done={Boolean(activePlan.prepared_at)}
      />
      <StepRow
        label={reviewerLabel}
        name={
          activePlan.reviewed_by_name ||
          activePlan.reviewed_by ||
          (activePlan.assigned_reviewer_name
            ? `รอการทบทวน (${activePlan.assigned_reviewer_name})`
            : (activePlan.status === 'PENDING_REVIEW' ? 'รอการทบทวน' : '-'))
        }
        at={formatThaiDateTime(activePlan.reviewed_at)}
        done={Boolean(activePlan.reviewed_at)}
        current={activePlan.status === 'PENDING_REVIEW'}
      />
      <StepRow
        label={approverLabel}
        name={
          activePlan.approved_by_name ||
          activePlan.approved_by ||
          (activePlan.assigned_approver_name
            ? `รอการอนุมัติ (${activePlan.assigned_approver_name})`
            : (activePlan.status === 'PENDING_APPROVAL' ? 'รอการอนุมัติ' : '-'))
        }
        at={formatThaiDateTime(activePlan.approved_at)}
        done={Boolean(activePlan.approved_at)}
        current={activePlan.status === 'PENDING_APPROVAL'}
      />
    </div>
  );
};

export default AnnualPlanApprovalChain;
