import React, { useState } from 'react';
import {
  Send,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { getPlanStatusLabel, getPlanStatusTone } from '../utils/planLabels';

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

const getNextStepText = (plan, thresholds) => {
  switch (plan.status) {
    case 'DRAFT':
      return 'เพิ่มรายการเครื่องมือให้ครบ แล้วส่งทบทวนแผน';
    case 'REJECTED':
      return 'แก้ไขตามเหตุผลที่ส่งกลับ แล้วส่งทบทวนใหม่';
    case 'PENDING_REVIEW':
      return `รอผู้ทบทวน (ระดับ L${thresholds.required_reviewer_level} ขึ้นไป)`;
    case 'PENDING_APPROVAL':
      return `รอผู้อนุมัติ (ระดับ L${thresholds.required_approver_level} ขึ้นไป)`;
    case 'APPROVED': {
      const by = plan.approved_by_name || plan.approved_by;
      const at = formatThaiDateTime(plan.approved_at);
      return `พร้อมออกใบสั่งงาน${by ? ` · อนุมัติโดย ${by}` : ''}${at ? ` · ${at}` : ''}`;
    }
    default:
      return '';
  }
};

const StepRow = ({ label, name, at, done, current }) => (
  <div className="flex items-start gap-2 text-xs">
    {done ? (
      <CheckCircle2 size={13} className="text-emerald-600 shrink-0 mt-0.5" />
    ) : (
      <span
        className={`w-2 h-2 rounded-full shrink-0 mt-1 ${current ? 'bg-amber-500' : 'bg-slate-300'}`}
      />
    )}
    <div className="min-w-0">
      <span className="text-slate-500">{label}: </span>
      <span className={`font-semibold ${done || current ? 'text-slate-900' : 'text-slate-500'}`}>{name}</span>
      {at && <span className="text-slate-400"> · {at}</span>}
    </div>
  </div>
);

/**
 * สรุปสถานะอนุมัติแบบกะทัดรัด 1 บรรทัด: สถานะ + ขั้นตอนถัดไป + ปุ่มที่ทำได้
 * รายละเอียดผู้ทบทวน/ผู้อนุมัติและเวลา ขยายดูได้ ส่วนเหตุผลที่ส่งกลับแสดงตลอด
 */
export const AnnualPlanApprovalStepper = ({
  activePlan,
  thresholds,
  canEditPlan,
  onSubmitPlan,
  onOpenWorkflowModal
}) => {
  const [detailOpen, setDetailOpen] = useState(false);
  if (!activePlan) return null;

  return (
    <div className="space-y-2">
      {activePlan.status === 'REJECTED' && activePlan.rejected_reason && (
        <div
          role="status"
          className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-rose-600 shrink-0" />
            <div>
              <span className="font-bold text-rose-800">ส่งกลับแก้ไข:</span> <span>{activePlan.rejected_reason}</span>
            </div>
          </div>
          {activePlan.rejected_by && (
            <div className="text-[11px] text-rose-600 shrink-0 pl-6 sm:pl-0">
              โดย {activePlan.rejected_by_name || activePlan.rejected_by}
              {activePlan.rejected_at && ` · ${formatThaiDateTime(activePlan.rejected_at)}`}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs border-y border-slate-200/80 py-2">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold ${getPlanStatusTone(activePlan.status)}`}
        >
          สถานะ: {getPlanStatusLabel(activePlan.status)}
        </span>
        <span className="text-slate-600 min-w-0">{getNextStepText(activePlan, thresholds)}</span>

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {canEditPlan && (
            <button
              type="button"
              onClick={onSubmitPlan}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              <Send size={12} />
              <span>ส่งทบทวนแผน</span>
            </button>
          )}

          {activePlan.status === 'PENDING_REVIEW' && (
            <>
              <button
                type="button"
                onClick={() => onOpenWorkflowModal('REVIEW')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors cursor-pointer"
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
            </>
          )}

          {activePlan.status === 'PENDING_APPROVAL' && (
            <>
              <button
                type="button"
                onClick={() => onOpenWorkflowModal('APPROVE')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors cursor-pointer"
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
            </>
          )}

          <button
            type="button"
            aria-expanded={detailOpen}
            onClick={() => setDetailOpen((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-[11.5px] font-medium cursor-pointer"
          >
            <span>ผู้เกี่ยวข้อง</span>
            {detailOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {detailOpen && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 px-1 pb-1">
          <StepRow
            label={`ผู้จัดทำ (L${thresholds.min_requester_level}+)`}
            name={activePlan.prepared_by_name || activePlan.prepared_by || 'ยังไม่ส่ง'}
            at={formatThaiDateTime(activePlan.prepared_at)}
            done={Boolean(activePlan.prepared_at)}
          />
          <StepRow
            label={`ผู้ทบทวน (L${thresholds.required_reviewer_level}+)`}
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
            label={`ผู้อนุมัติ (L${thresholds.required_approver_level}+)`}
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
      )}
    </div>
  );
};

export default AnnualPlanApprovalStepper;
