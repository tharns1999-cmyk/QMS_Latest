import React from 'react';
import {
  FileCheck2,
  FileText,
  CalendarClock,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Clock,
  Eye,
  AlertCircle,
  Plus,
  FilterX,
  MoreHorizontal,
  History,
  Printer,
  Ban,
  Edit3
} from 'lucide-react';
import { FloatingOverlay } from '../../../shared/components/ui/FloatingOverlay';
import { TablePagination } from '../../../shared/components/common/TablePagination';
import useStore from '../../../store/useStore';
import {
  canReviewWorkOrder,
  canReleaseWorkOrderHold,
  canCancelWorkOrder,
  canApproveReschedule,
  canRequestReschedule,
  canDirectReschedule,
  getReschedulePermissionReason
} from '../utils/workOrderPermissions';
import { WORK_ORDER_STATUS_LABELS, RESULT_STATUS_LABELS, getWorkOrderStatusLabel, getResultStatusLabel } from '../utils/statusLabels';
import { formatVccDueDate } from '../utils/vccDateUtils';
import { useVccMobileViewport } from '../hooks/useVccMobileViewport';

/**
 * WorkOrderRowActions - Renders primary action and floating overflow menu for each row
 * Uses FloatingOverlay (React Portal) to completely eliminate table overflow clipping and layout shift.
 */
export const WorkOrderRowActions = ({
  wo,
  reqApproverLevel,
  thresholds,
  onRecordResult,
  onApprove,
  onReleaseHold,
  onReschedule,
  onReviewReschedule,
  onReject,
  onRowClick,
  onAmend,
  onCancel,
  onViewDigitalRecord
}) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const triggerRef = React.useRef(null);
  const currentUser = useStore((s) => s.currentUser);
  const canReview = canReviewWorkOrder(currentUser, wo, thresholds);

  const handleClose = () => setIsMenuOpen(false);

  return (
    <div className="relative inline-flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
      {/* Primary Row Action (ตามสถานะงาน) */}
      {(wo.status === 'OPEN' || wo.status === 'SCHEDULED' || wo.status === 'REJECTED') && (
        <button
          type="button"
          onClick={() => onRecordResult(wo)}
          className="min-h-[44px] sm:min-h-[32px] h-10 sm:h-8 inline-flex items-center gap-1.5 px-3.5 sm:px-3 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors cursor-pointer text-xs shadow-2xs whitespace-nowrap motion-safe:active:scale-[0.98] select-none"
        >
          <FileCheck2 size={13} />
          <span>บันทึกผลและใบรับรอง</span>
        </button>
      )}

      {wo.status === 'CLOSED' && onAmend && (
        <button
          type="button"
          onClick={() => onAmend(wo)}
          className="min-h-[44px] sm:min-h-[32px] h-10 sm:h-8 inline-flex items-center gap-1.5 px-3.5 sm:px-3 rounded-lg border border-slate-200 bg-white text-slate-600 font-medium hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer text-xs shadow-2xs whitespace-nowrap motion-safe:active:scale-[0.98] select-none"
        >
          <Edit3 size={13} className="text-slate-500" />
          <span>แก้ไขผลบันทึก</span>
        </button>
      )}

      {wo.status === 'PENDING_REVIEW' && !canReview && (
        <span className="text-xs font-medium text-slate-500 whitespace-nowrap">รอผู้ตรวจรับ</span>
      )}

      {wo.status === 'PENDING_REVIEW' && canReview && wo.result_status !== 'INCONCLUSIVE' && (
        <button
          type="button"
          onClick={() => onApprove(wo)}
          className="min-h-[44px] sm:min-h-[32px] h-10 sm:h-8 inline-flex items-center gap-1.5 px-3.5 sm:px-3 rounded-lg bg-emerald-700 text-white font-medium hover:bg-emerald-800 transition-colors cursor-pointer text-xs shadow-2xs whitespace-nowrap motion-safe:active:scale-[0.98] select-none"
        >
          <CheckCircle2 size={13} />
          <span>ตรวจรับปิดงาน</span>
        </button>
      )}

      {/* An INCONCLUSIVE result cannot be closed: the reviewer's one action is to send it back for a retest */}
      {wo.status === 'PENDING_REVIEW' && canReview && wo.result_status === 'INCONCLUSIVE' && (
        <button
          type="button"
          onClick={() => onReject(wo)}
          className="min-h-[44px] sm:min-h-[32px] h-10 sm:h-8 inline-flex items-center gap-1.5 px-3.5 sm:px-3 rounded-lg bg-rose-700 text-white font-medium hover:bg-rose-800 transition-colors cursor-pointer text-xs shadow-2xs whitespace-nowrap motion-safe:active:scale-[0.98] select-none"
        >
          <XCircle size={13} />
          <span>ส่งกลับตรวจซ้ำ</span>
        </button>
      )}

      {canReleaseWorkOrderHold(currentUser, wo, thresholds) && (
        <button
          type="button"
          onClick={() => onReleaseHold(wo)}
          className="min-h-[44px] sm:min-h-[32px] h-10 sm:h-8 inline-flex items-center gap-1.5 px-3.5 sm:px-3 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors cursor-pointer text-xs shadow-2xs whitespace-nowrap motion-safe:active:scale-[0.98] select-none"
        >
          <ShieldAlert size={13} />
          <span>ปลดระงับใช้ (L{reqApproverLevel}+)</span>
        </button>
      )}

      {/* Secondary Actions Trigger (More Menu Icon with 44px min touch target on mobile) */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsMenuOpen((prev) => !prev)}
        aria-label={`การจัดการเพิ่มเติมสำหรับ ${wo.wo_code}`}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        title="ตัวเลือกเพิ่มเติม"
        className={`min-w-[44px] min-h-[44px] h-11 w-11 sm:h-8 sm:w-8 sm:min-w-0 sm:min-h-0 rounded-lg border text-slate-500 hover:text-slate-800 hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors motion-safe:active:scale-[0.96] select-none ${
          isMenuOpen ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200'
        }`}
      >
        <MoreHorizontal size={15} />
      </button>

      {/* Floating Action Menu rendered outside table overflow via FloatingOverlay */}
      <FloatingOverlay
        isOpen={isMenuOpen}
        onClose={handleClose}
        triggerRef={triggerRef}
        placement="bottom-end"
        offset={4}
        viewportPadding={8}
        zIndex={9999}
        role=""
        ariaLabel={`การจัดการเพิ่มเติมสำหรับ ${wo.wo_code}`}
        keepMounted={true}
        className="min-w-[170px] bg-white rounded-xl shadow-xl border border-slate-200 py-1 text-left animate-in fade-in zoom-in-95 duration-100"
      >
        {wo.reschedule_status === 'REQUESTED' ? (
          canApproveReschedule(currentUser, wo) && (
            <button
              type="button"
              onClick={() => {
                handleClose();
                if (onReviewReschedule) onReviewReschedule(wo);
                else onReschedule(wo);
              }}
              className="w-full text-left px-3.5 sm:px-3 py-3 sm:py-2 min-h-[44px] sm:min-h-[36px] text-xs font-semibold text-amber-800 hover:bg-amber-50 flex items-center gap-2 transition-colors cursor-pointer motion-safe:active:bg-amber-100 select-none"
            >
              <CalendarClock size={13} className="text-amber-600" />
              <span>พิจารณาคำขอเลื่อนกำหนด</span>
            </button>
          )
        ) : (
          (wo.status === 'OPEN' || wo.status === 'SCHEDULED' || wo.status === 'REJECTED') && (() => {
            const allowed = canRequestReschedule(currentUser, wo) || canDirectReschedule(currentUser, wo);
            const reason = !allowed ? getReschedulePermissionReason(currentUser, wo) : '';
            return (
              <button
                type="button"
                disabled={!allowed}
                title={reason || 'ขอเลื่อนวันครบกำหนด'}
                onClick={() => {
                  if (!allowed) return;
                  handleClose();
                  onReschedule(wo);
                }}
                className={`w-full text-left px-3.5 sm:px-3 py-3 sm:py-2 min-h-[44px] sm:min-h-[36px] text-xs font-semibold flex items-center gap-2 transition-colors select-none ${
                  allowed
                    ? 'text-slate-700 hover:bg-slate-50 cursor-pointer motion-safe:active:bg-slate-100'
                    : 'text-slate-400 opacity-60 cursor-not-allowed bg-slate-50/50'
                }`}
              >
                <CalendarClock size={13} className={allowed ? 'text-slate-500' : 'text-slate-400'} />
                <span>ขอเลื่อนวันครบกำหนด</span>
              </button>
            );
          })()
        )}

        {wo.status === 'PENDING_REVIEW' && canReview && wo.result_status !== 'INCONCLUSIVE' && (
          <button
            type="button"
            onClick={() => {
              handleClose();
              onReject(wo);
            }}
            className="w-full text-left px-3.5 sm:px-3 py-3 sm:py-2 min-h-[44px] sm:min-h-[36px] text-xs font-semibold text-rose-700 hover:bg-rose-50 flex items-center gap-2 transition-colors cursor-pointer motion-safe:active:bg-rose-100 select-none"
          >
            <XCircle size={13} className="text-rose-500" />
            <span>ส่งกลับแก้ไข</span>
          </button>
        )}

        {wo.status === 'CLOSED' && onAmend && (
          <button
            type="button"
            onClick={() => {
              handleClose();
              onAmend(wo);
            }}
            className="w-full text-left px-3.5 sm:px-3 py-3 sm:py-2 min-h-[44px] sm:min-h-[36px] text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer motion-safe:active:bg-slate-100 select-none"
          >
            <Edit3 size={13} className="text-slate-500" />
            <span>แก้ไขผลบันทึก</span>
          </button>
        )}

        {onCancel && canCancelWorkOrder(currentUser, wo) && (
          <button
            type="button"
            onClick={() => {
              handleClose();
              onCancel(wo);
            }}
            className="w-full text-left px-3.5 sm:px-3 py-3 sm:py-2 min-h-[44px] sm:min-h-[36px] text-xs font-semibold text-rose-700 hover:bg-rose-50 flex items-center gap-2 transition-colors cursor-pointer motion-safe:active:bg-rose-100 select-none"
          >
            <Ban size={13} className="text-rose-500" />
            <span>ยกเลิกใบสั่งงาน</span>
          </button>
        )}

        {wo.performed_at && onViewDigitalRecord && (
          <button
            type="button"
            onClick={() => {
              handleClose();
              onViewDigitalRecord(wo);
            }}
            className="w-full text-left px-3.5 sm:px-3 py-3 sm:py-2 min-h-[44px] sm:min-h-[36px] text-xs font-semibold text-indigo-700 hover:bg-indigo-50 flex items-center gap-2 transition-colors cursor-pointer motion-safe:active:bg-indigo-100 select-none"
          >
            <FileText size={13} className="text-indigo-600" />
            <span>ดูผล / ใบรับรอง</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            handleClose();
            onRowClick(wo);
          }}
          className="w-full text-left px-3.5 sm:px-3 py-3 sm:py-2 min-h-[44px] sm:min-h-[36px] text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 border-t border-slate-100 transition-colors cursor-pointer motion-safe:active:bg-slate-100 select-none"
        >
          <Eye size={13} className="text-slate-500" />
          <span>ดูรายละเอียดใบสั่งงาน</span>
        </button>
      </FloatingOverlay>
    </div>
  );
};

export const WorkOrderTable = ({
  workOrders = [],
  pagination,
  loading = false,
  error = null,
  activeTab = 'OPEN',
  searchTerm = '',
  filterDept = '',
  isFiltered: isFilteredProp,
  thresholds = {},
  onRowClick,
  onRecordResult,
  onReschedule,
  onReviewReschedule,
  onApprove,
  onReject,
  onReleaseHold,
  onResetFilters,
  onOpenCreate,
  onAmend,
  onCancel,
  onViewDigitalRecord: propOnViewDigitalRecord,
  onViewRecord
}) => {
  const onViewDigitalRecord = propOnViewDigitalRecord || onViewRecord;
  const reqApproverLevel = thresholds.required_approver_level ?? 5;
  const { isMobile } = useVccMobileViewport();

  if (loading) {
    return (
      <div className="w-full bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
          <span>กำลังโหลดข้อมูลใบสั่งงาน...</span>
          <div className="flex items-center gap-1.5 text-indigo-700 font-semibold">
            <Clock size={14} className="animate-spin" />
            <span>เชื่อมต่อระบบ</span>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {[1, 2, 3].map((n) => (
            <div key={n} className="p-4 flex items-center justify-between gap-4 animate-pulse">
              <div className="space-y-2 w-1/5">
                <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                <div className="h-3 bg-slate-100 rounded w-1/2"></div>
              </div>
              <div className="space-y-2 w-2/5">
                <div className="h-4 bg-slate-200 rounded w-4/5"></div>
                <div className="h-3 bg-slate-100 rounded w-2/3"></div>
              </div>
              <div className="h-4 bg-slate-200 rounded w-1/6"></div>
              <div className="h-8 bg-slate-200 rounded w-28 shrink-0"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full bg-white rounded-xl border border-rose-200 shadow-2xs p-8 text-center space-y-3">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-rose-50 text-rose-600">
          <AlertCircle size={22} />
        </div>
        <div className="text-sm font-bold text-rose-800">{error}</div>
        <button
          type="button"
          onClick={onResetFilters}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors cursor-pointer"
        >
          <span>ลองใหม่อีกครั้ง</span>
        </button>
      </div>
    );
  }

  if (workOrders.length === 0) {
    const isFiltered = isFilteredProp !== undefined ? isFilteredProp : Boolean(searchTerm || filterDept);
    return (
      <div className="w-full bg-white rounded-xl border border-slate-200 shadow-2xs p-10 text-center space-y-3">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 text-slate-400">
          <FileCheck2 size={24} />
        </div>
        <div className="font-bold text-slate-800 text-base">
          ไม่พบรายการใบสั่งงานในแท็บ{getWorkOrderStatusLabel(activeTab)}
        </div>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          {isFiltered
            ? 'ไม่มีรายการใบสั่งงานที่ตรงกับคำค้นหาหรือตัวกรองที่คุณเลือก'
            : 'เลือกแท็บสถานะอื่น หรือกดปุ่ม "สร้างใบสั่งงานใหม่" ด้านบนเพื่อเปิดใบงาน'}
        </p>
        <div className="flex items-center justify-center gap-2 pt-1">
          {isFiltered && (
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <FilterX size={14} />
              <span>ล้างตัวกรอง</span>
            </button>
          )}
          {onOpenCreate && (
            <button
              type="button"
              onClick={onOpenCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer shadow-2xs"
            >
              <Plus size={14} />
              <span>สร้างใบสั่งงานใหม่</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const getResultBadge = (resultStatus) => {
    if (resultStatus === 'PASS') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 size={12} className="text-emerald-600" />
          <span>{RESULT_STATUS_LABELS.PASS}</span>
        </span>
      );
    }
    if (resultStatus === 'FAIL') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <XCircle size={12} className="text-rose-600" />
          <span>{RESULT_STATUS_LABELS.FAIL}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
        <Clock size={12} />
        <span>{getResultStatusLabel(resultStatus || 'PENDING')}</span>
      </span>
    );
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'SCHEDULED':
        return <span className="inline-block px-2.5 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 text-xs font-semibold">{WORK_ORDER_STATUS_LABELS.SCHEDULED}</span>;
      case 'OPEN':
        return <span className="inline-block px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold">{WORK_ORDER_STATUS_LABELS.OPEN}</span>;
      case 'PENDING_REVIEW':
        return <span className="inline-block px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-300 text-xs font-semibold">{WORK_ORDER_STATUS_LABELS.PENDING_REVIEW}</span>;
      case 'REJECTED':
        return <span className="inline-block px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold">{WORK_ORDER_STATUS_LABELS.REJECTED}</span>;
      case 'CLOSED':
        return <span className="inline-block px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-semibold">{WORK_ORDER_STATUS_LABELS.CLOSED}</span>;
      default:
        return <span className="inline-block px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold">{getWorkOrderStatusLabel(status)}</span>;
    }
  };

  if (isMobile) {
    return (
      <div className="space-y-3 p-1 sm:p-0" data-testid="vcc-wo-mobile-card-list">
        {workOrders.map((wo) => (
          <div
            key={wo.id}
            onClick={() => onRowClick && onRowClick(wo)}
            className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 space-y-3 transition-colors active:bg-slate-50 cursor-pointer"
          >
            {/* Header: WO Code + Plan/Ad-hoc + Status Badge */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono font-bold text-slate-900 text-sm">
                  {wo.wo_code}
                </div>
                <div className="text-xs text-slate-500 font-medium mt-0.5">
                  {wo.plan_year ? (
                    <span className="text-slate-600">แผนปี {wo.plan_year} (ด.{wo.planned_month})</span>
                  ) : (
                    <span className="text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 font-medium text-xs">
                      นอกแผน (Ad-hoc)
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {getStatusBadge(wo.status)}
                {wo.nc_status === 'OPEN' && (
                  <div data-testid="wo-hold-badge" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-bold">
                    <ShieldAlert size={12} />
                    <span>{WORK_ORDER_STATUS_LABELS.ON_HOLD}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Instrument Context */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono font-bold text-indigo-700 text-sm">{wo.asset_code}</span>
                <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded text-[11px] font-semibold">
                  {wo.department}
                </span>
              </div>
              <div className="font-semibold text-slate-800 text-sm mt-0.5">{wo.asset_name}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                ผู้ดำเนินการ: <span className="text-slate-700 font-medium">{wo.provider_name}</span>
              </div>
            </div>

            {/* Due Date & Result */}
            <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100">
              <div>
                <span className="text-slate-500 block text-[11px]">วันครบกำหนด:</span>
                <span className="font-semibold text-slate-900 font-sans" title={`วันครบกำหนด: ${wo.due_date}`}>
                  {formatVccDueDate(wo.due_date)}
                </span>
                {wo.reschedule_status === 'REQUESTED' && (
                  <div className="text-[11px] text-amber-900 bg-amber-50 p-1.5 rounded-lg border border-amber-200 font-medium mt-1 leading-tight flex flex-col gap-0.5">
                    <div className="flex items-center gap-1 font-bold text-amber-800">
                      <CalendarClock size={11} className="shrink-0" />
                      <span>รออนุมัติเลื่อนกำหนด</span>
                    </div>
                    <div className="text-[10px] text-slate-700">
                      เสนอ: <span className="font-semibold text-amber-900" title={`เสนอเลื่อนเป็น: ${wo.proposed_due_date}`}>{formatVccDueDate(wo.proposed_due_date)}</span>
                    </div>
                    {wo.reschedule_reason && (
                      <div className="truncate max-w-[140px] text-[10px] text-slate-500" title={wo.reschedule_reason}>
                        เหตุผล: {wo.reschedule_reason}
                      </div>
                    )}
                  </div>
                )}
                {Boolean(wo.original_due_date) && wo.due_date !== wo.original_due_date && wo.reschedule_status !== 'REQUESTED' && (
                  <div className="text-[11px] text-amber-900 bg-amber-50 p-1 rounded border border-amber-200 font-medium mt-1 leading-tight">
                    <div>
                      วันเดิม: <span className="line-through text-slate-400 font-sans" title={`วันครบกำหนดเดิม: ${wo.original_due_date}`}>{formatVccDueDate(wo.original_due_date)}</span>
                    </div>
                    {wo.reschedule_reason && wo.reschedule_reason.trim() ? (
                      <div className="truncate max-w-[130px]" title={wo.reschedule_reason}>
                        ({wo.reschedule_reason})
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">ผลตรวจ / รับรอง:</span>
                <div className="mt-0.5">{getResultBadge(wo.result_status)}</div>
                {(wo.actual_result || wo.actual_measurement) && (
                  <div className="text-[11px] text-slate-700 mt-0.5 line-clamp-1">
                    <span className="text-slate-500 font-medium">ผลวัดจริง:</span> {wo.actual_result || wo.actual_measurement}
                  </div>
                )}
                {wo.certificate_no && (
                  <div className="font-mono text-slate-800 font-semibold text-[11px] mt-1 flex items-center gap-1 flex-wrap">
                    <span>{wo.certificate_no}</span>
                    {wo.certificate_file_name && (
                      <span className="text-[10px] text-indigo-700 font-bold bg-indigo-50 px-1 rounded border border-indigo-200">
                        PDF v{wo.certificate_version || 1}
                      </span>
                    )}
                    {Boolean(wo.is_amended) && (
                      <span className="text-[10px] text-amber-800 font-bold bg-amber-100 px-1 rounded border border-amber-300">
                        AMENDED
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {wo.acceptance_criteria && (
              <div className="text-xs text-slate-600 line-clamp-1 pt-1 border-t border-slate-50" title={wo.acceptance_criteria}>
                <span className="text-slate-400 font-medium">เกณฑ์:</span> {wo.acceptance_criteria}
              </div>
            )}

            {wo.rejected_reason && (
              <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-medium text-xs">
                <span className="font-bold">ส่งกลับ:</span> {wo.rejected_reason}
              </div>
            )}

            {/* Action Row */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
              {(wo.status === 'CLOSED' || wo.status === 'SUSPENDED' || wo.performed_at) && onViewDigitalRecord ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewDigitalRecord(wo);
                  }}
                  className="min-h-[36px] h-9 px-3 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 inline-flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                >
                  <FileText size={13} className="text-indigo-600" />
                  <span>ดูผล / ใบรับรอง</span>
                </button>
              ) : <div />}
              <WorkOrderRowActions
                wo={wo}
                reqApproverLevel={reqApproverLevel}
                thresholds={thresholds}
                onRecordResult={onRecordResult}
                onApprove={onApprove}
                onReleaseHold={onReleaseHold}
                onReschedule={onReschedule}
                onReviewReschedule={onReviewReschedule}
                onReject={onReject}
                onRowClick={onRowClick}
                onAmend={onAmend}
                onCancel={onCancel}
                onViewDigitalRecord={onViewDigitalRecord}
              />
            </div>
          </div>
        ))}
        {pagination && pagination.totalItems > 0 && (
          <TablePagination
            currentPage={pagination.currentPage}
            totalItems={pagination.totalItems}
            pageSize={pagination.pageSize}
            onPageChange={pagination.onPageChange || pagination.setCurrentPage}
            onPageSizeChange={pagination.onPageSizeChange || pagination.setPageSize}
            pageSizeOptions={pagination.pageSizeOptions || [15, 25, 50, 100]}
            className="rounded-xl border border-slate-200 mt-3"
          />
        )}
      </div>
    );
  }

  return (
    <div className="w-full bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden min-h-[300px] flex flex-col justify-between">
      <div className="overflow-x-auto w-full">
        <table className="w-full text-left border-collapse min-w-[960px]">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-semibold uppercase tracking-wider select-none">
            <th className="py-3 px-4 w-[16%] min-w-[130px]">เลขที่ใบงาน</th>
            <th className="py-3 px-4 w-[26%] min-w-[210px]">เครื่องมือวัด (รายตัว)</th>
            <th className="py-3 px-4 w-[14%] min-w-[130px]">วันครบกำหนด</th>
            <th className="py-3 px-4 w-[22%] min-w-[190px]">ผลตรวจ / ใบรับรอง / เกณฑ์ยอมรับ</th>
            <th className="py-3 px-4 w-[10%] min-w-[120px]">สถานะงาน</th>
            <th className="py-3 px-4 w-[12%] min-w-[160px] text-right">การจัดการ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {workOrders.map((wo) => {
            return (
              <tr
                key={wo.id}
                onClick={() => onRowClick && onRowClick(wo)}
                className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
              >
                {/* Column 1: เลขที่ใบงาน */}
                <td className="py-3 px-4 align-middle">
                  <div className="font-mono font-bold text-slate-900 group-hover:text-indigo-700 transition-colors text-sm">
                    {wo.wo_code}
                  </div>
                  <div className="text-xs text-slate-500 font-medium mt-0.5">
                    {wo.plan_year ? (
                      <span className="text-slate-600">แผนปี {wo.plan_year} (ด.{wo.planned_month})</span>
                    ) : (
                      <span className="text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 font-medium text-xs">
                        นอกแผน (Ad-hoc)
                      </span>
                    )}
                  </div>
                </td>

                {/* Column 2: เครื่องมือวัด */}
                <td className="py-3 px-4 align-middle">
                  <div className="font-mono font-bold text-indigo-700 text-sm">
                    {wo.asset_code}
                  </div>
                  <div className="font-semibold text-slate-900 line-clamp-1 text-sm mt-0.5" title={wo.asset_name}>
                    {wo.asset_name}
                  </div>
                  <div className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded text-xs font-semibold">
                      {wo.department}
                    </span>
                    <span>•</span>
                    <span className="truncate max-w-[140px] text-xs" title={wo.provider_name}>
                      {wo.provider_name}
                    </span>
                  </div>
                </td>

                {/* Column 3: วันครบกำหนด */}
                <td className="py-3 px-4 align-middle">
                  <div className="font-semibold text-slate-900 text-xs sm:text-sm font-sans" title={`วันครบกำหนด: ${wo.due_date}`}>
                    <span>{formatVccDueDate(wo.due_date)}</span>
                    <span className="block sm:inline text-slate-400 font-normal font-mono text-[11px] sm:text-xs sm:ml-1">
                      (<span>{wo.due_date}</span>)
                    </span>
                  </div>
                  {wo.reschedule_status === 'REQUESTED' && (
                    <div className="text-xs text-amber-900 bg-amber-50 p-1.5 rounded-lg border border-amber-200 font-medium mt-1 leading-tight flex flex-col gap-0.5">
                      <div className="flex items-center gap-1 font-bold text-amber-800">
                        <CalendarClock size={12} className="shrink-0" />
                        <span>รออนุมัติเลื่อนกำหนด</span>
                      </div>
                      <div className="text-[11px] text-slate-700">
                        เสนอ:{' '}
                        <span className="font-semibold text-amber-900" title={`เสนอเลื่อนเป็น: ${wo.proposed_due_date}`}>
                          {formatVccDueDate(wo.proposed_due_date)}
                        </span>
                      </div>
                      {wo.reschedule_reason && (
                        <div className="truncate max-w-[140px] text-[10px] text-slate-500" title={wo.reschedule_reason}>
                          เหตุผล: {wo.reschedule_reason}
                        </div>
                      )}
                    </div>
                  )}
                  {Boolean(wo.original_due_date) && wo.due_date !== wo.original_due_date && wo.reschedule_status !== 'REQUESTED' && (
                    <div className="text-xs text-amber-900 bg-amber-50 p-1 rounded border border-amber-200 font-medium mt-1 leading-tight">
                      <div>
                        วันเดิม:{' '}
                        <span className="line-through text-slate-400 font-sans" title={`วันครบกำหนดเดิม: ${wo.original_due_date}`}>
                          {formatVccDueDate(wo.original_due_date)}
                          {wo.original_due_date && (
                            <span className="block sm:inline text-slate-400 font-normal font-mono text-[11px] sm:text-xs sm:ml-1">
                              (<span>{wo.original_due_date}</span>)
                            </span>
                          )}
                        </span>
                      </div>
                      {wo.reschedule_reason && wo.reschedule_reason.trim() ? (
                        <div className="truncate max-w-[130px]" title={wo.reschedule_reason}>
                          ({wo.reschedule_reason})
                        </div>
                      ) : null}
                    </div>
                  )}
                </td>

                {/* Column 4: ผลตรวจ / ใบรับรอง / เกณฑ์ยอมรับ */}
                <td className="py-3 px-4 align-middle space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">ผล:</span>
                    {getResultBadge(wo.result_status)}
                  </div>

                  {(wo.actual_result || wo.actual_measurement) && (
                    <div className="text-xs text-slate-800 line-clamp-1" title={`ผลวัดจริง: ${wo.actual_result || wo.actual_measurement}`}>
                      <span className="text-slate-500 font-medium">ผลวัดจริง:</span> {wo.actual_result || wo.actual_measurement}
                    </div>
                  )}

                  {wo.certificate_no && (
                    <div className="text-xs flex items-center gap-1.5 flex-wrap">
                      <span className="text-slate-500 font-medium">ใบรับรอง:</span>{' '}
                      <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded text-xs">
                        {wo.certificate_no}
                      </span>
                      {wo.certificate_file_name && (
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded-md bg-indigo-50 text-indigo-700 font-bold text-xs border border-indigo-200" title={`ไฟล์ PDF: ${wo.certificate_file_name} (v${wo.certificate_version || 1})`}>
                          PDF v{wo.certificate_version || 1}
                        </span>
                      )}
                      {Boolean(wo.is_amended) && (
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-800 font-bold text-xs border border-amber-300" title={`แก้ไขแล้ว: ${wo.amendment_reason || ''}`}>
                          AMENDED
                        </span>
                      )}
                    </div>
                  )}

                  {wo.traceability_ref && !wo.certificate_no && (
                    <div className="text-xs text-slate-600 line-clamp-1" title={wo.traceability_ref}>
                      <span className="text-slate-500 font-medium">Master:</span> {wo.traceability_ref}
                    </div>
                  )}

                  {wo.acceptance_criteria && (
                    <div className="text-xs text-slate-700 line-clamp-1" title={wo.acceptance_criteria}>
                      <span className="text-slate-500 font-medium">เกณฑ์:</span>{' '}
                      <span className="text-slate-800">{wo.acceptance_criteria}</span>
                    </div>
                  )}

                  {wo.rejected_reason && (
                    <div className="p-1.5 rounded bg-rose-50 border border-rose-200 text-rose-800 font-medium text-xs">
                      <span className="font-bold">ส่งกลับ:</span> {wo.rejected_reason}
                    </div>
                  )}
                </td>

                {/* Column 5: สถานะ / NC */}
                <td className="py-3 px-4 align-middle space-y-1.5">
                  <div>{getStatusBadge(wo.status)}</div>
                  {wo.nc_status === 'OPEN' && (
                    <div>
                      <div data-testid="wo-hold-badge" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-xs font-bold">
                        <ShieldAlert size={13} />
                        <span>{WORK_ORDER_STATUS_LABELS.ON_HOLD}</span>
                      </div>
                    </div>
                  )}
                </td>

                {/* Column 6: การจัดการ (Single Primary Action + More Menu via FloatingOverlay) */}
                <td className="py-3 px-4 align-middle text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex items-center justify-end gap-2">
                    {(wo.status === 'CLOSED' || wo.status === 'SUSPENDED' || wo.performed_at) && onViewDigitalRecord && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewDigitalRecord(wo);
                        }}
                        className="min-h-[32px] h-8 inline-flex items-center gap-1.5 px-3 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition-colors cursor-pointer motion-safe:active:scale-[0.98] select-none shadow-2xs whitespace-nowrap"
                        title="ดูผล / ใบรับรอง"
                      >
                        <FileText size={13} className="text-indigo-600" />
                        <span>ดูผล / ใบรับรอง</span>
                      </button>
                    )}
                    <WorkOrderRowActions
                      wo={wo}
                      reqApproverLevel={reqApproverLevel}
                      thresholds={thresholds}
                      onRecordResult={onRecordResult}
                      onApprove={onApprove}
                      onReleaseHold={onReleaseHold}
                      onReschedule={onReschedule}
                      onReviewReschedule={onReviewReschedule}
                      onReject={onReject}
                      onRowClick={onRowClick}
                      onAmend={onAmend}
                      onCancel={onCancel}
                      onViewDigitalRecord={onViewDigitalRecord}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {pagination && pagination.totalItems > 0 && (
        <TablePagination
          currentPage={pagination.currentPage}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          onPageChange={pagination.onPageChange || pagination.setCurrentPage}
          onPageSizeChange={pagination.onPageSizeChange || pagination.setPageSize}
          pageSizeOptions={pagination.pageSizeOptions || [15, 25, 50, 100]}
        />
      )}
    </div>
  );
};

export default WorkOrderTable;
