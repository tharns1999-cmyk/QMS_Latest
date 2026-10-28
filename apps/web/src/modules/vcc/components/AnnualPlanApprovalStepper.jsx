import React from 'react';
import {
  Send,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ArrowRight
} from 'lucide-react';

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

export const AnnualPlanApprovalStepper = ({
  activePlan,
  thresholds,
  canEditPlan,
  onSubmitPlan,
  onOpenWorkflowModal
}) => {
  if (!activePlan) return null;

  return (
    <div className="space-y-2">
      {/* Rejection Notice Banner */}
      {activePlan.status === 'REJECTED' && activePlan.rejected_reason && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-rose-600 shrink-0" />
            <div>
              <span className="font-bold text-rose-800">ส่งกลับแก้ไข:</span>{' '}
              <span>{activePlan.rejected_reason}</span>
            </div>
          </div>
          {activePlan.rejected_by && (
            <div className="text-[11px] text-rose-600 shrink-0 pl-6 sm:pl-0">
              โดย {activePlan.rejected_by_name || activePlan.rejected_by}{' '}
              {activePlan.rejected_at && `• ${formatThaiDateTime(activePlan.rejected_at)}`}
            </div>
          )}
        </div>
      )}

      {/* Sleek Linear-style Workflow Strip */}
      <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-2.5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        {/* Pipeline Nodes */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
            Sign-off:
          </span>

          {/* Node 1: Requester */}
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
              activePlan.prepared_at
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            {activePlan.prepared_at ? (
              <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
            )}
            <span className="font-medium">
              1. ผู้จัดทำแผน (Requester L{thresholds.min_requester_level}+):{' '}
              <strong className="text-slate-900">
                {activePlan.prepared_by_name || activePlan.prepared_by || 'ยังไม่ส่ง'}
              </strong>
            </span>
          </div>

          <ArrowRight size={12} className="text-slate-300 shrink-0" />

          {/* Node 2: Reviewer */}
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
              activePlan.reviewed_at
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                : activePlan.status === 'PENDING_REVIEW'
                ? 'bg-amber-50 border-amber-300 text-amber-950 font-bold shadow-2xs'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            {activePlan.reviewed_at ? (
              <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
            ) : activePlan.status === 'PENDING_REVIEW' ? (
              <Clock size={13} className="text-amber-700 shrink-0" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
            )}
            <span>
              2. ผู้ทบทวนแผน (Reviewer L{thresholds.required_reviewer_level}+):{' '}
              <strong className="text-slate-900">
                {activePlan.reviewed_by_name ||
                  activePlan.reviewed_by ||
                  (activePlan.status === 'PENDING_REVIEW' ? 'รอการทบทวน' : '-')}
              </strong>
            </span>
          </div>

          <ArrowRight size={12} className="text-slate-300 shrink-0" />

          {/* Node 3: Approver */}
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
              activePlan.approved_at
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                : activePlan.status === 'PENDING_APPROVAL'
                ? 'bg-indigo-50 border-indigo-300 text-indigo-950 font-bold shadow-2xs'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            {activePlan.approved_at ? (
              <ShieldCheck size={13} className="text-emerald-600 shrink-0" />
            ) : activePlan.status === 'PENDING_APPROVAL' ? (
              <Clock size={13} className="text-indigo-700 shrink-0" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
            )}
            <span>
              3. ผู้อนุมัติแผน (Approver L{thresholds.required_approver_level}+):{' '}
              <strong className="text-slate-900">
                {activePlan.approved_by_name ||
                  activePlan.approved_by ||
                  (activePlan.status === 'PENDING_APPROVAL' ? 'รอการอนุมัติ' : '-')}
              </strong>
            </span>
          </div>
        </div>

        {/* Workflow Actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canEditPlan && (
            <button
              type="button"
              onClick={onSubmitPlan}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition-colors shadow-2xs cursor-pointer"
            >
              <Send size={12} />
              <span>ส่งทบทวนแผน (Submit)</span>
            </button>
          )}

          {activePlan.status === 'PENDING_REVIEW' && (
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpenWorkflowModal('REVIEW')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white font-semibold text-xs transition-colors shadow-2xs cursor-pointer"
              >
                <CheckCircle2 size={13} />
                <span>ยืนยันการทบทวน</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenWorkflowModal('REJECT')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 font-semibold text-xs transition-colors cursor-pointer"
              >
                <XCircle size={13} />
                <span>ส่งกลับแก้ไข</span>
              </button>
            </div>
          )}

          {activePlan.status === 'PENDING_APPROVAL' && (
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpenWorkflowModal('APPROVE')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs transition-colors shadow-2xs cursor-pointer"
              >
                <ShieldCheck size={13} />
                <span>อนุมัติแผนประจำปี</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenWorkflowModal('REJECT')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 font-semibold text-xs transition-colors cursor-pointer"
              >
                <XCircle size={13} />
                <span>ส่งกลับแก้ไข</span>
              </button>
            </div>
          )}

          {activePlan.status === 'APPROVED' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs shadow-2xs">
              <ShieldCheck size={13} className="text-emerald-700" />
              <span>อนุมัติแล้ว พร้อมบังคับใช้</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnnualPlanApprovalStepper;
