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
  <div className="flex items-start gap-2 text-xs">
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
      <span className="text-slate-500 text-[11px] block sm:inline sm:mr-1">{label}: </span>
      <span className={`font-semibold ${done || current ? 'text-slate-900' : 'text-slate-500'}`}>{name}</span>
      {at && <span className="text-slate-400 text-[11px] font-mono"> · {at}</span>}
    </div>
  </div>
);

/**
 * AnnualPlanApprovalChain - Collapsible 3-tier approval hierarchy drawer
 * Shows: ผู้จัดทำ (L1+), ผู้ทบทวน (L4+), ผู้อนุมัติ (L5+)
 */
export const AnnualPlanApprovalChain = ({ activePlan, thresholds = {} }) => {
  if (!activePlan) return null;

  return (
    <div
      data-testid="annual-plan-approval-chain"
      className="mt-2.5 pt-2.5 border-t border-slate-100 bg-slate-50/80 p-3 rounded-xl border border-slate-200/60 grid grid-cols-1 md:grid-cols-3 gap-2"
    >
      <StepRow
        label={`ผู้จัดทำ (L${thresholds.min_requester_level || 1}+)`}
        name={activePlan.prepared_by_name || activePlan.prepared_by || 'ยังไม่ส่ง'}
        at={formatThaiDateTime(activePlan.prepared_at)}
        done={Boolean(activePlan.prepared_at)}
      />
      <StepRow
        label={`ผู้ทบทวน (L${thresholds.required_reviewer_level || 4}+)`}
        name={
          activePlan.reviewed_by_name ||
          activePlan.reviewed_by ||
          (activePlan.status === 'PENDING_REVIEW' ? 'รอการทบทวน' : '-')
        }
        at={formatThaiDateTime(activePlan.reviewed_at)}
        done={Boolean(activePlan.reviewed_at)}
        current={activePlan.status === 'PENDING_REVIEW'}
      />
      <StepRow
        label={`ผู้อนุมัติ (L${thresholds.required_approver_level || 5}+)`}
        name={
          activePlan.approved_by_name ||
          activePlan.approved_by ||
          (activePlan.status === 'PENDING_APPROVAL' ? 'รอการอนุมัติ' : '-')
        }
        at={formatThaiDateTime(activePlan.approved_at)}
        done={Boolean(activePlan.approved_at)}
        current={activePlan.status === 'PENDING_APPROVAL'}
      />
    </div>
  );
};

export default AnnualPlanApprovalChain;
