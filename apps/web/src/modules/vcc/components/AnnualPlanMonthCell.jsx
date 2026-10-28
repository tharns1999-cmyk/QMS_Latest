import React, { useState, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  FileText,
  ShieldAlert,
  Loader2,
  X,
  Trash2
} from 'lucide-react';
import { computeDueDateForMonth } from '../api/vccPlanApi';

const THAI_MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

export const AnnualPlanMonthCell = ({
  month,
  item,
  plan,
  workOrders = [],
  canEditPlan = false,
  isSaving = false,
  onQuickAddMonth,
  onQuickRemoveMonth,
  onCreateWorkOrder,
  onOpenGroupCheck,
  onOpenFullEdit,
  density = 'comfortable'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState('');
  const popoverRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false);
        setConfirmDelete(false);
        setActionError('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const isPlanned = (item.planned_months || []).includes(month);
  const isActualFromPlan = (item.actual_months || []).includes(month);

  // Matching work orders for this item in this month
  const matchingWos = workOrders.filter((w) => {
    if (w.plan_item_id && w.plan_item_id === item.id) {
      if (Number(w.planned_month) === month) return true;
      if (!w.planned_month && w.due_date) {
        return new Date(w.due_date).getMonth() + 1 === month;
      }
    }
    // Also match if asset matches and plan_id matches
    if (w.plan_id === plan?.id && w.asset_id === item.asset_id && Number(w.planned_month) === month) {
      return true;
    }
    return false;
  });

  const hasHoldOrNc = matchingWos.some((w) => w.nc_status === 'OPEN' || w.result_status === 'FAIL');
  const hasClosedPass = isActualFromPlan || matchingWos.some((w) => w.status === 'CLOSED' && w.result_status === 'PASS');
  const hasOpenWo = matchingWos.some((w) => w.status === 'OPEN' || w.status === 'PENDING_REVIEW');
  const hasEvidence = matchingWos.some((w) => w.status === 'CLOSED' && Boolean(w.certificate_no)) || (isActualFromPlan && item.has_evidence);

  const hasAnyActivity = isPlanned || isActualFromPlan || matchingWos.length > 0;

  // Due date calculation for preview
  const scheduledDueDate = plan?.plan_year
    ? computeDueDateForMonth(plan.plan_year, month, plan.due_date_rule || 'END_OF_MONTH')
    : null;

  // Handle Quick Add
  const handleAddConfirm = async () => {
    if (!onQuickAddMonth || isSaving) return;
    setActionError('');
    try {
      await onQuickAddMonth(item, month);
      setIsOpen(false);
    } catch (err) {
      setActionError(err.message || 'ไม่สามารถเพิ่มเดือนได้');
    }
  };

  // Handle Quick Remove
  const handleRemoveConfirm = async () => {
    if (!onQuickRemoveMonth || isSaving) return;
    setActionError('');
    try {
      await onQuickRemoveMonth(item, month);
      setIsOpen(false);
      setConfirmDelete(false);
    } catch (err) {
      setActionError(err.message || 'ไม่สามารถยกเลิกเดือนได้');
    }
  };

  // Handle Create Work Order
  const handleCreateWo = async () => {
    if (Number(item.is_group) === 1) {
      setIsOpen(false);
      if (onOpenGroupCheck) onOpenGroupCheck(item);
      return;
    }
    if (!onCreateWorkOrder || isSaving) return;
    setActionError('');
    try {
      await onCreateWorkOrder(item, month);
      setIsOpen(false);
    } catch (err) {
      setActionError(err.message || 'ไม่สามารถเปิดใบสั่งงานได้');
    }
  };

  // Dynamic popover positioning based on month column index
  const popoverAlignment =
    month <= 3
      ? 'left-0'
      : month >= 10
      ? 'right-0'
      : 'left-1/2 -translate-x-1/2';

  const isCompact = density === 'compact';

  return (
    <td
      className={`relative text-center border-l border-b border-slate-100 transition-colors select-none ${
        isCompact ? 'py-1 px-0.5' : 'py-2 px-1'
      } ${
        hasHoldOrNc
          ? 'bg-rose-50/40'
          : hasClosedPass
          ? 'bg-emerald-50/40'
          : hasOpenWo
          ? 'bg-amber-50/40'
          : isPlanned
          ? 'bg-indigo-50/30'
          : canEditPlan
          ? 'hover:bg-slate-50/80 cursor-pointer'
          : 'bg-white'
      }`}
      onClick={(e) => {
        // If clicking cell body (not popover), toggle open
        if (!isOpen) {
          e.stopPropagation();
          setIsOpen(true);
        }
      }}
    >
      {/* Cell Badge Trigger */}
      <div className="flex items-center justify-center gap-1 min-h-[26px]">
        {hasAnyActivity ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen((prev) => !prev);
            }}
            aria-label={`เป้าหมายทวนสอบเดือน ${month} (P${month})`}
            title={`เดือน ${month}: ${
              hasHoldOrNc
                ? 'ตรวจไม่ผ่าน / ระงับใช้ (NC)'
                : hasClosedPass
                ? 'ตรวจรับปิดงานแล้ว (มีหลักฐาน)'
                : hasOpenWo
                ? 'มีใบสั่งงานกำลังดำเนินการ'
                : 'รอบตามแผนประจำปี'
            } (คลิกดูรายละเอียด/จัดการ)`}
            className={`inline-flex items-center justify-center gap-0.5 rounded font-mono font-bold transition-transform cursor-pointer shadow-2xs hover:scale-105 active:scale-95 ${
              isCompact ? 'px-1 py-0.5 text-[9.5px]' : 'px-1.5 py-0.5 text-[10.5px]'
            } ${
              hasHoldOrNc
                ? 'bg-rose-600 text-white ring-1 ring-rose-400'
                : hasClosedPass
                ? 'bg-emerald-600 text-white ring-1 ring-emerald-400'
                : hasOpenWo
                ? 'bg-amber-500 text-white ring-1 ring-amber-300'
                : 'bg-indigo-600 text-white ring-1 ring-indigo-400'
            }`}
          >
            {hasHoldOrNc ? (
              <span className="flex items-center gap-0.5">
                <AlertTriangle size={9} />
                <span>NC</span>
              </span>
            ) : hasClosedPass ? (
              <span className="flex items-center gap-0.5">
                <CheckCircle2 size={9} />
                <span>A{month}</span>
              </span>
            ) : hasOpenWo ? (
              <span className="flex items-center gap-0.5">
                <Clock size={9} />
                <span>WO</span>
              </span>
            ) : (
              <span>P{month}</span>
            )}

            {/* If there are multiple active work orders, show count */}
            {matchingWos.length > 1 && (
              <span className="ml-0.5 px-0.5 py-0 rounded bg-white/30 text-[8.5px]">
                {matchingWos.length}
              </span>
            )}
          </button>
        ) : canEditPlan ? (
          /* Empty Cell in Draft/Rejected mode -> quick add affordance */
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(true);
            }}
            title={`คลิกเพื่อเพิ่มเป้าหมายทวนสอบเดือน ${month}`}
            className="w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-indigo-600 hover:bg-indigo-100/70 transition-all opacity-0 hover:opacity-100 cursor-pointer"
          >
            <Plus size={11} />
          </button>
        ) : (
          <span className="text-slate-300 font-mono text-[10px]">-</span>
        )}
      </div>

      {/* Contextual Popover */}
      {isOpen && (
        <div
          ref={popoverRef}
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-full ${popoverAlignment} mt-1.5 z-50 w-72 bg-white rounded-xl shadow-xl border border-slate-200/90 p-3 text-left animate-in fade-in zoom-in-95 duration-100 text-xs`}
        >
          {/* Popover Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-600" />
              <h4 className="font-bold text-slate-800 text-xs">
                เดือนที่ {month} ({THAI_MONTH_NAMES[month - 1]})
              </h4>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setConfirmDelete(false);
                setActionError('');
              }}
              className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <X size={13} />
            </button>
          </div>

          {/* Asset Context */}
          <div className="py-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-indigo-700">{item.asset_code}</span>
              <span className="text-[11px] text-slate-500">แผนก {item.responsible_dept}</span>
            </div>
            <div className="text-[11.5px] text-slate-700 font-medium line-clamp-1">
              {item.asset_name}
            </div>
            {scheduledDueDate && (
              <div className="text-[11px] text-slate-500 flex items-center gap-1 pt-0.5">
                <Clock size={11} className="text-slate-400" />
                <span>วันครบกำหนดตามเกณฑ์: <strong className="text-slate-700 font-mono">{scheduledDueDate}</strong></span>
              </div>
            )}
          </div>

          {/* Activity Breakdown List */}
          {hasAnyActivity ? (
            <div className="py-2 border-t border-slate-100 space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-600">สถานะและประวัติในเดือนนี้:</div>

              {isPlanned && (
                <div className="p-1.5 rounded-lg bg-indigo-50/70 border border-indigo-100 text-[11px] flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-indigo-900 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                    <span>รอบตามแผนประจำปี (Plan)</span>
                  </div>
                  <span className="text-[10px] text-indigo-600 font-mono">P{month}</span>
                </div>
              )}

              {matchingWos.map((wo) => (
                <div
                  key={wo.id}
                  className={`p-2 rounded-lg border text-[11px] space-y-0.5 ${
                    wo.nc_status === 'OPEN' || wo.result_status === 'FAIL'
                      ? 'bg-rose-50/60 border-rose-200 text-rose-900'
                      : wo.status === 'CLOSED'
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50/60 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono font-bold">
                    <span>{wo.wo_code}</span>
                    <span className="text-[10px] uppercase px-1 py-0.2 rounded bg-white/70">
                      {wo.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10.5px]">
                    <span>ผล: <strong>{wo.result_status || 'รอดำเนินการ'}</strong></span>
                    {wo.certificate_no && (
                      <span className="font-mono">Cert: {wo.certificate_no}</span>
                    )}
                  </div>
                  {wo.performed_at && (
                    <div className="text-[10px] text-slate-500">
                      วันที่ตรวจจริง: {wo.performed_at}
                    </div>
                  )}
                </div>
              ))}

              {matchingWos.length === 0 && !hasClosedPass && (
                <div className="text-[11px] text-amber-700 bg-amber-50/60 p-1.5 rounded-lg border border-amber-100 flex items-center gap-1">
                  <Clock size={11} className="shrink-0" />
                  <span>ยังไม่มีการเปิดใบสั่งงานจริง (วางแผนเท่านั้น)</span>
                </div>
              )}
            </div>
          ) : (
            <div className="py-2 border-t border-slate-100 text-[11.5px] text-slate-500">
              ยังไม่มีกำหนดการทวนสอบในเดือน {THAI_MONTH_NAMES[month - 1]}
            </div>
          )}

          {/* Action Error Alert */}
          {actionError && (
            <div className="my-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-start gap-1">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-2 border-t border-slate-100 space-y-1.5">
            {/* If cell is NOT planned & plan is editable -> Quick Add */}
            {!isPlanned && canEditPlan && (
              <button
                type="button"
                disabled={isSaving}
                onClick={handleAddConfirm}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
              >
                {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                <span>+ ยืนยันเพิ่มเดือน {month} เข้าแผน</span>
              </button>
            )}

            {/* If cell IS planned & plan is editable -> Quick Remove with confirmation */}
            {isPlanned && canEditPlan && (
              <>
                {confirmDelete ? (
                  <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 space-y-1.5">
                    <div className="text-[11px] text-rose-800 font-semibold">
                      ยืนยันยกเลิกรอบเดือน {month} ออกจากแผน?
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={handleRemoveConfirm}
                        className="flex-1 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold shadow-2xs cursor-pointer disabled:opacity-60"
                      >
                        {isSaving ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-medium cursor-pointer"
                      >
                        ไม่ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="w-full inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50/40 hover:bg-rose-50 text-rose-700 text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    <Trash2 size={11} />
                    <span>ยกเลิกรอบแผนเดือน {month}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    if (onOpenFullEdit) onOpenFullEdit(item);
                  }}
                  className="w-full inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-[11px] font-medium transition-colors cursor-pointer"
                >
                  <FileText size={11} />
                  <span>แก้ไขรายละเอียดรายการเต็ม</span>
                </button>
              </>
            )}

            {/* If plan is APPROVED -> Create Work Order or Group Check */}
            {plan?.status === 'APPROVED' && (
              <>
                {Number(item.is_group) === 1 ? (
                  <button
                    type="button"
                    onClick={handleCreateWo}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                  >
                    <ShieldAlert size={12} />
                    <span>ตรวจรหัสลูกก่อนออกใบงาน</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleCreateWo}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    <span>ออกใบสั่งงานสำหรับเดือน {month}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </td>
  );
};

export default AnnualPlanMonthCell;
