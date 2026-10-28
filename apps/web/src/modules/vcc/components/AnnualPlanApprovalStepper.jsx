import React from 'react';
import {
  Send,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  AlertTriangle,
  UserCheck
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
    <div className="space-y-3.5">
      {/* Rejection Notice Banner */}
      {activePlan.status === 'REJECTED' && activePlan.rejected_reason && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-1 shadow-2xs">
          <div className="flex items-center gap-2 font-bold text-rose-800 text-sm">
            <AlertTriangle size={16} className="text-rose-600 shrink-0" />
            <span>แผนถูกส่งกลับแก้ไข (Returned for Revision)</span>
          </div>
          <div className="pl-6">
            <span className="font-semibold text-rose-800">เหตุผลที่ส่งกลับแก้ไข:</span> {activePlan.rejected_reason}
          </div>
          {activePlan.rejected_by && (
            <div className="pl-6 text-[11px] text-rose-700">
              โดย {activePlan.rejected_by_name || activePlan.rejected_by} • {formatThaiDateTime(activePlan.rejected_at)}
            </div>
          )}
        </div>
      )}

      {/* 3-Stage Sign-off & Approval Stepper */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <UserCheck size={16} className="text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">
              ขั้นตอนการควบคุมและอนุมัติแผนงานประจำปี (3-Stage QMS Approval Workflow)
            </h3>
          </div>
          <div className="text-xs font-medium text-slate-500">
            เกณฑ์อนุมัติเอกสาร FM: ระดับ L{thresholds.required_reviewer_level}+ ทบทวน และ L{thresholds.required_approver_level}+ อนุมัติ
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Stage 1: จัดทำแผน */}
          <div className={`p-4 rounded-xl border text-xs space-y-1.5 transition-colors ${
            activePlan.prepared_at
              ? 'bg-emerald-50/40 border-emerald-200/70'
              : 'bg-slate-50/70 border-slate-200/80'
          }`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800">1. ผู้จัดทำแผน (Requester L{thresholds.min_requester_level}+)</span>
              {activePlan.prepared_at ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10.5px] font-bold">
                  จัดทำแล้ว
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10.5px] font-bold">
                  กำลังร่าง
                </span>
              )}
            </div>

            <div className="text-sm font-bold text-slate-900 pt-0.5">
              {activePlan.prepared_by_name || activePlan.prepared_by || 'ยังไม่ได้ส่งทบทวน'}
            </div>

            {activePlan.prepared_at && (
              <div className="text-[11px] text-slate-600">
                เมื่อ {formatThaiDateTime(activePlan.prepared_at)}
              </div>
            )}

            {canEditPlan && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onSubmitPlan}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700 transition-colors shadow-xs cursor-pointer"
                >
                  <Send size={13} />
                  <span>ส่งทบทวนแผน (Submit)</span>
                </button>
              </div>
            )}
          </div>

          {/* Stage 2: ทบทวนแผน */}
          <div className={`p-4 rounded-xl border text-xs space-y-1.5 transition-colors ${
            activePlan.reviewed_at
              ? 'bg-emerald-50/40 border-emerald-200/70'
              : activePlan.status === 'PENDING_REVIEW'
              ? 'bg-amber-50/40 border-amber-300'
              : 'bg-slate-50/70 border-slate-200/80'
          }`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800">2. ผู้ทบทวนแผน (Reviewer L{thresholds.required_reviewer_level}+)</span>
              {activePlan.reviewed_at ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10.5px] font-bold">
                  ทบทวนแล้ว
                </span>
              ) : activePlan.status === 'PENDING_REVIEW' ? (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10.5px] font-bold animate-pulse">
                  รอทบทวน
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10.5px] font-bold">
                  รอลำดับถัดไป
                </span>
              )}
            </div>

            <div className="text-sm font-bold text-slate-900 pt-0.5">
              {activePlan.reviewed_by_name || activePlan.reviewed_by || (activePlan.status === 'PENDING_REVIEW' ? 'รอการทบทวน' : '-')}
            </div>

            {activePlan.reviewed_at && (
              <div className="text-[11px] text-slate-600">
                เมื่อ {formatThaiDateTime(activePlan.reviewed_at)}
              </div>
            )}

            {activePlan.review_comment && (
              <div className="text-[11px] text-slate-700 italic bg-white/80 p-2 rounded-lg border border-slate-200/60 mt-1">
                &ldquo;{activePlan.review_comment}&rdquo;
              </div>
            )}

            {activePlan.status === 'PENDING_REVIEW' && (
              <div className="pt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onOpenWorkflowModal('REVIEW')}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-sky-700 text-white font-bold hover:bg-sky-800 transition-colors shadow-xs cursor-pointer"
                >
                  <CheckCircle2 size={13} />
                  <span>ยืนยันการทบทวน</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenWorkflowModal('REJECT')}
                  className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl border border-rose-300 text-rose-700 font-bold hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <XCircle size={13} />
                  <span>ส่งกลับแก้ไข</span>
                </button>
              </div>
            )}
          </div>

          {/* Stage 3: อนุมัติแผน */}
          <div className={`p-4 rounded-xl border text-xs space-y-1.5 transition-colors ${
            activePlan.approved_at
              ? 'bg-emerald-50/50 border-emerald-300'
              : activePlan.status === 'PENDING_APPROVAL'
              ? 'bg-indigo-50/40 border-indigo-300'
              : 'bg-slate-50/70 border-slate-200/80'
          }`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800">3. ผู้อนุมัติแผน (Approver L{thresholds.required_approver_level}+)</span>
              {activePlan.approved_at ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10.5px] font-bold">
                  อนุมัติแล้ว
                </span>
              ) : activePlan.status === 'PENDING_APPROVAL' ? (
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10.5px] font-bold animate-pulse">
                  รออนุมัติ
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10.5px] font-bold">
                  รอลำดับถัดไป
                </span>
              )}
            </div>

            <div className="text-sm font-bold text-slate-900 pt-0.5">
              {activePlan.approved_by_name || activePlan.approved_by || (activePlan.status === 'PENDING_APPROVAL' ? 'รอการอนุมัติ' : '-')}
            </div>

            {activePlan.approved_at && (
              <div className="text-[11px] text-slate-600">
                เมื่อ {formatThaiDateTime(activePlan.approved_at)}
              </div>
            )}

            {activePlan.approval_comment && (
              <div className="text-[11px] text-slate-700 italic bg-white/80 p-2 rounded-lg border border-slate-200/60 mt-1">
                &ldquo;{activePlan.approval_comment}&rdquo;
              </div>
            )}

            {activePlan.status === 'PENDING_APPROVAL' && (
              <div className="pt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onOpenWorkflowModal('APPROVE')}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-emerald-700 text-white font-bold hover:bg-emerald-800 transition-colors shadow-xs cursor-pointer"
                >
                  <ShieldCheck size={13} />
                  <span>อนุมัติแผนประจำปี</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenWorkflowModal('REJECT')}
                  className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl border border-rose-300 text-rose-700 font-bold hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <XCircle size={13} />
                  <span>ส่งกลับแก้ไข</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnualPlanApprovalStepper;
