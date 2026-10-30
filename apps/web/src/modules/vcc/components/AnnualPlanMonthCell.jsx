import React, { useState, useRef } from 'react';
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
import { FloatingOverlay } from '../../../shared/components/ui/FloatingOverlay';

export const THAI_MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

export const THAI_MONTH_NAMES_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
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
  const cellRef = useRef(null);

  const handleClose = () => {
    setIsOpen(false);
    setConfirmDelete(false);
    setActionError('');
  };

  const isPlanned = (item.planned_months || []).includes(month);

  // 1. Work Order assigned to this planned cycle (source cycle P{month})
  const cycleWo = workOrders.find((w) => {
    if (w.status === 'CANCELLED') return false;
    const matchesItem = w.plan_item_id === item.id || (w.plan_id === plan?.id && w.asset_id === item.asset_id);
    return matchesItem && Number(w.planned_month) === month;
  });

  const cycleActualDate = cycleWo?.performed_at || null;
  const cycleActualMonth = cycleActualDate ? Number(cycleActualDate.slice(5, 7)) : null;
  const cycleIsDifferentMonth = Boolean(cycleActualMonth && cycleActualMonth !== month);

  // 2. Work Orders whose ACTUAL execution occurred IN this calendar month, but originated from another plan cycle (or ad-hoc)
  const externalActualWos = workOrders.filter((w) => {
    if (w.status === 'CANCELLED') return false;
    const matchesItem = w.plan_item_id === item.id || (w.plan_id === plan?.id && w.asset_id === item.asset_id);
    if (!matchesItem || !w.performed_at) return false;
    const perfMonth = Number(w.performed_at.slice(5, 7));
    return perfMonth === month && Number(w.planned_month) !== month;
  });

  const allCellWos = [
    ...(cycleWo ? [cycleWo] : []),
    ...externalActualWos
  ];

  const hasHoldOrNc = allCellWos.some((w) => w.nc_status === 'OPEN' || w.result_status === 'FAIL');
  const hasClosedPass = (cycleWo?.status === 'CLOSED' && cycleWo?.result_status === 'PASS') ||
    externalActualWos.some((w) => w.status === 'CLOSED' && w.result_status === 'PASS');
  const hasOpenWo = allCellWos.some((w) => w.status === 'OPEN' || w.status === 'PENDING_REVIEW');
  const hasAnyActivity = isPlanned || allCellWos.length > 0;

  // Due date preview
  const scheduledDueDate = plan?.plan_year
    ? computeDueDateForMonth(plan.plan_year, month, plan.due_date_rule || 'END_OF_MONTH')
    : null;

  // Quick Add
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

  // Quick Remove
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

  // Create Work Order
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

  const isCompact = density === 'compact';

  return (
    <td
      ref={cellRef}
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
        if (!hasAnyActivity) {
          if (canEditPlan && !isSaving) {
            e.stopPropagation();
            handleAddConfirm();
          }
        } else if (!isOpen) {
          e.stopPropagation();
          setIsOpen(true);
        }
      }}
    >
      {/* Cell Badge Trigger */}
      <div className="flex items-center justify-center gap-1 min-h-[26px] flex-wrap">
        {hasAnyActivity ? (
          <div className="inline-flex items-center gap-1 flex-wrap justify-center">
            {/* Planned Cycle Badge */}
            {isPlanned && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen((prev) => !prev);
                }}
                aria-label={`เป้าหมายทวนสอบเดือน ${month} (P${month})`}
                title={`รอบแผนเดือน ${month}: ${
                  cycleWo?.nc_status === 'OPEN' || cycleWo?.result_status === 'FAIL'
                    ? 'ตรวจไม่ผ่าน / ระงับใช้ (NC)'
                    : cycleWo?.status === 'CLOSED'
                    ? cycleIsDifferentMonth
                      ? `ตรวจจริง ${cycleActualDate} (${THAI_MONTH_NAMES[cycleActualMonth - 1]} - ล่าช้ากว่าแผน)`
                      : 'ตรวจรับปิดงานแล้วตามกำหนด'
                    : cycleWo?.status === 'PENDING_REVIEW'
                    ? 'ส่งผลแล้ว รอผู้ตรวจรับ'
                    : cycleWo?.status === 'OPEN'
                    ? 'มีใบสั่งงานกำลังดำเนินการ'
                    : 'รอบตามแผนประจำปี'
                }`}
                className={`inline-flex items-center justify-center gap-0.5 rounded font-mono font-bold transition-transform cursor-pointer shadow-2xs hover:scale-105 active:scale-95 ${
                  isCompact ? 'px-1 py-0.5 text-[10px]' : 'px-1.5 py-0.5 text-xs'
                } ${
                  cycleWo?.nc_status === 'OPEN' || cycleWo?.result_status === 'FAIL'
                    ? 'bg-rose-600 text-white ring-1 ring-rose-400'
                    : cycleWo?.status === 'CLOSED' && !cycleIsDifferentMonth
                    ? 'bg-emerald-600 text-white ring-1 ring-emerald-400'
                    : cycleWo?.status === 'CLOSED' && cycleIsDifferentMonth
                    ? 'bg-indigo-700 text-white ring-1 ring-indigo-400'
                    : cycleWo?.status === 'PENDING_REVIEW'
                    ? 'bg-amber-500 text-white ring-1 ring-amber-300'
                    : cycleWo?.status === 'OPEN'
                    ? 'bg-sky-600 text-white ring-1 ring-sky-400'
                    : 'bg-indigo-600 text-white ring-1 ring-indigo-400'
                }`}
              >
                {cycleWo?.nc_status === 'OPEN' || cycleWo?.result_status === 'FAIL' ? (
                  <span className="flex items-center gap-0.5">
                    <AlertTriangle size={11} />
                    <span>NC</span>
                  </span>
                ) : cycleWo?.status === 'CLOSED' ? (
                  cycleIsDifferentMonth ? (
                    <span className="flex items-center gap-0.5" title={`ทำจริง ${cycleActualDate}`}>
                      <span>P{month}✓</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5">
                      <CheckCircle2 size={11} />
                      <span>A{month}</span>
                    </span>
                  )
                ) : cycleWo?.status === 'PENDING_REVIEW' ? (
                  <span className="flex items-center gap-0.5">
                    <Clock size={11} />
                    <span>REV</span>
                  </span>
                ) : cycleWo?.status === 'OPEN' ? (
                  <span className="flex items-center gap-0.5">
                    <Clock size={11} />
                    <span>WO</span>
                  </span>
                ) : (
                  <span>P{month}</span>
                )}
              </button>
            )}

            {/* External Actual Event Badge (Executed in this month from a different cycle) */}
            {externalActualWos.map((extWo) => {
              const pMonth = extWo.planned_month;
              const isClosed = extWo.status === 'CLOSED';
              const isNc = extWo.nc_status === 'OPEN' || extWo.result_status === 'FAIL';

              return (
                <button
                  key={extWo.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen((prev) => !prev);
                  }}
                  title={`ทำจริง ${extWo.performed_at} (${pMonth ? `จากรอบแผนเดือน ${pMonth}` : 'นอกแผน'})`}
                  className={`inline-flex items-center justify-center gap-0.5 rounded font-mono font-bold transition-transform cursor-pointer shadow-2xs hover:scale-105 active:scale-95 ${
                    isCompact ? 'px-1 py-0.5 text-[10px]' : 'px-1.5 py-0.5 text-xs'
                  } ${
                    isNc
                      ? 'bg-rose-700 text-white ring-1 ring-rose-400'
                      : isClosed
                      ? 'bg-emerald-600 text-white ring-1 ring-emerald-400'
                      : 'bg-amber-600 text-white ring-1 ring-amber-400'
                  }`}
                >
                  {isClosed ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                  <span>A({pMonth ? THAI_MONTH_NAMES_SHORT[pMonth - 1] : 'นอก'})</span>
                </button>
              );
            })}
          </div>
        ) : isSaving ? (
          <span className="w-5 h-5 flex items-center justify-center text-indigo-600 animate-spin">
            <Loader2 size={12} />
          </span>
        ) : canEditPlan ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleAddConfirm();
            }}
            title={`คลิกเพื่อกำหนดเป้าหมายทวนสอบเดือน ${month}`}
            aria-label={`กำหนดเป้าหมายเดือน ${month}`}
            className="w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 hover:border hover:border-indigo-200 transition-all opacity-40 hover:opacity-100 cursor-pointer"
          >
            <Plus size={12} />
          </button>
        ) : (
          <span className="text-slate-300 font-mono text-xs">-</span>
        )}
      </div>

      {/* Contextual Popover rendered via FloatingPortal into document.body */}
      <FloatingOverlay
        isOpen={isOpen}
        onClose={handleClose}
        triggerRef={cellRef}
        placement={month <= 3 ? 'bottom-start' : month >= 10 ? 'bottom-end' : 'bottom-center'}
        offset={6}
        viewportPadding={12}
        zIndex={9999}
        role="dialog"
        ariaLabel={`รายละเอียดการทวนสอบเดือน ${month}`}
        className="w-84 sm:w-96 max-w-[calc(100vw-24px)] bg-white rounded-xl shadow-2xl border border-slate-200/90 p-4 text-left animate-in fade-in zoom-in-95 duration-100 max-h-[85vh] overflow-y-auto"
      >
          {/* Popover Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
              <h4 className="font-bold text-slate-900 text-sm">
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
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>

          {/* Asset Context */}
          <div className="py-2.5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-sm text-indigo-700">{item.asset_code}</span>
              <span className="text-xs font-semibold text-slate-500">แผนก {item.responsible_dept}</span>
            </div>
            <div className="text-xs sm:text-sm text-slate-800 font-medium line-clamp-2">
              {item.asset_name}
            </div>
          </div>

          {/* Section 1: Planned Cycle of This Month */}
          <div className="py-2.5 border-t border-slate-100 space-y-2">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>1. รอบตามแผนประจำปี (Plan)</span>
              {isPlanned ? (
                <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-mono font-bold text-xs">
                  P{month}
                </span>
              ) : (
                <span className="text-xs text-slate-400 font-normal">ไม่มีรอบในแผน</span>
              )}
            </div>

            {isPlanned && (
              <div className="p-2.5 rounded-lg bg-indigo-50/50 border border-indigo-100 space-y-2 text-xs">
                {scheduledDueDate && (
                  <div className="text-slate-700 flex items-center gap-1.5 font-medium">
                    <Clock size={13} className="text-slate-400 shrink-0" />
                    <span>วันครบกำหนดตามเกณฑ์: <strong className="text-slate-900 font-mono font-bold">{scheduledDueDate}</strong></span>
                  </div>
                )}

                {cycleWo ? (
                  <div className={`p-2.5 rounded-lg border space-y-1.5 ${
                    cycleWo.nc_status === 'OPEN' || cycleWo.result_status === 'FAIL'
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : cycleWo.status === 'CLOSED'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}>
                    <div className="flex items-center justify-between font-mono font-bold text-xs sm:text-sm">
                      <span>{cycleWo.wo_code}</span>
                      <span className="text-xs uppercase px-1.5 py-0.5 rounded bg-white/80 font-bold">
                        {cycleWo.status}
                      </span>
                    </div>

                    {cycleActualDate && (
                      <div className="text-xs font-medium">
                        <span>วันที่ตรวจจริง: <strong className="font-mono font-bold">{cycleActualDate}</strong></span>
                        {cycleIsDifferentMonth && (
                          <span className="block text-xs text-indigo-700 font-semibold mt-0.5">
                            ↳ เสร็จสิ้นในเดือน {THAI_MONTH_NAMES[cycleActualMonth - 1]} (ล่าช้ากว่ารอบแผน)
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs font-medium">
                      <span>ผล: <strong className="font-bold">{cycleWo.result_status || 'รอดำเนินการ'}</strong></span>
                      {cycleWo.certificate_no && (
                        <span className="font-mono font-semibold">Cert: {cycleWo.certificate_no}</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-amber-900 bg-amber-50/70 p-2 rounded-lg border border-amber-200 flex items-center gap-1.5 text-xs font-medium">
                    <Clock size={13} className="shrink-0 text-amber-600" />
                    <span>ยังไม่ได้เปิดใบสั่งงานจริงสำหรับรอบนี้</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Actual Events In This Month */}
          {externalActualWos.length > 0 && (
            <div className="py-2.5 border-t border-slate-100 space-y-2">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>2. การดำเนินงานจริงในเดือนนี้ (Actual)</span>
                <span className="text-xs px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold">
                  {externalActualWos.length} รายการ
                </span>
              </div>

              {externalActualWos.map((extWo) => {
                const pMonth = extWo.planned_month;
                return (
                  <div
                    key={extWo.id}
                    className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200 text-emerald-950 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between font-mono font-bold text-xs sm:text-sm">
                      <span>{extWo.wo_code}</span>
                      <span className="text-xs text-emerald-800 bg-white/70 px-1.5 py-0.5 rounded font-sans font-bold">
                        {pMonth ? `จากรอบแผน ${THAI_MONTH_NAMES_SHORT[pMonth - 1]} (P${pMonth})` : 'นอกแผน'}
                      </span>
                    </div>

                    <div className="text-xs font-medium flex items-center justify-between">
                      <span>วันที่ตรวจจริง: <strong className="font-mono font-bold">{extWo.performed_at}</strong></span>
                      <span>ผล: <strong className="font-bold">{extWo.result_status}</strong></span>
                    </div>

                    {extWo.certificate_no && (
                      <div className="text-xs text-slate-600 font-mono font-semibold">
                        เลขที่ใบรับรอง: {extWo.certificate_no}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Action Error Alert */}
          {actionError && (
            <div className="my-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start gap-1.5">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-2.5 border-t border-slate-100 space-y-2">
            {/* Quick Add (Draft/Rejected only) */}
            {!isPlanned && canEditPlan && (
              <button
                type="button"
                disabled={isSaving}
                onClick={handleAddConfirm}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                <span>+ ยืนยันเพิ่มเดือน {month} เข้าแผน</span>
              </button>
            )}

            {/* Quick Remove (Draft/Rejected only) */}
            {isPlanned && canEditPlan && (
              <>
                {confirmDelete ? (
                  <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 space-y-2">
                    <div className="text-xs text-rose-800 font-semibold">
                      ยืนยันยกเลิกรอบเดือน {month} ออกจากแผน?
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={handleRemoveConfirm}
                        className="flex-1 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-2xs cursor-pointer disabled:opacity-60"
                      >
                        {isSaving ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium cursor-pointer"
                      >
                        ไม่ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50/40 hover:bg-rose-50 text-rose-700 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>ยกเลิกรอบแผนเดือน {month}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    if (onOpenFullEdit) onOpenFullEdit(item);
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs sm:text-sm font-medium transition-colors cursor-pointer"
                >
                  <FileText size={13} />
                  <span>แก้ไขรายละเอียดรายการเต็ม</span>
                </button>
              </>
            )}

            {/* Approved Plan -> Open Work Order if not created yet */}
            {plan?.status === 'APPROVED' && isPlanned && !cycleWo && (
              <>
                {Number(item.is_group) === 1 ? (
                  <button
                    type="button"
                    onClick={handleCreateWo}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs sm:text-sm font-semibold shadow-2xs transition-colors cursor-pointer"
                  >
                    <ShieldAlert size={14} />
                    <span>ตรวจรหัสลูกก่อนออกใบงาน</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleCreateWo}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    <span>ออกใบสั่งงานสำหรับเดือน {month}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </FloatingOverlay>
    </td>
  );
};

export default AnnualPlanMonthCell;
