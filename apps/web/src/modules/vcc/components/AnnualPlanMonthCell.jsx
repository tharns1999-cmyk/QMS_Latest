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

  // Popover placement
  const popoverAlignment =
    month <= 3 ? 'left-0' : month >= 10 ? 'right-0' : 'left-1/2 -translate-x-1/2';
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
        if (!isOpen) {
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
                  isCompact ? 'px-1 py-0.5 text-[9.5px]' : 'px-1.5 py-0.5 text-[10.5px]'
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
                    <AlertTriangle size={9} />
                    <span>NC</span>
                  </span>
                ) : cycleWo?.status === 'CLOSED' ? (
                  cycleIsDifferentMonth ? (
                    <span className="flex items-center gap-0.5" title={`ทำจริง ${cycleActualDate}`}>
                      <span>P{month}✓</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5">
                      <CheckCircle2 size={9} />
                      <span>A{month}</span>
                    </span>
                  )
                ) : cycleWo?.status === 'PENDING_REVIEW' ? (
                  <span className="flex items-center gap-0.5">
                    <Clock size={9} />
                    <span>REV</span>
                  </span>
                ) : cycleWo?.status === 'OPEN' ? (
                  <span className="flex items-center gap-0.5">
                    <Clock size={9} />
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
                    isCompact ? 'px-1 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[10px]'
                  } ${
                    isNc
                      ? 'bg-rose-700 text-white ring-1 ring-rose-400'
                      : isClosed
                      ? 'bg-emerald-600 text-white ring-1 ring-emerald-400'
                      : 'bg-amber-600 text-white ring-1 ring-amber-400'
                  }`}
                >
                  {isClosed ? <CheckCircle2 size={9} /> : <Clock size={9} />}
                  <span>A({pMonth ? THAI_MONTH_NAMES_SHORT[pMonth - 1] : 'นอก'})</span>
                </button>
              );
            })}
          </div>
        ) : canEditPlan ? (
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
          className={`absolute top-full ${popoverAlignment} mt-1.5 z-50 w-80 bg-white rounded-xl shadow-xl border border-slate-200/90 p-3.5 text-left animate-in fade-in zoom-in-95 duration-100 text-xs`}
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
          </div>

          {/* Section 1: Planned Cycle of This Month */}
          <div className="py-2 border-t border-slate-100 space-y-2">
            <div className="text-[11px] font-semibold text-slate-700 flex items-center justify-between">
              <span>1. รอบตามแผนประจำปี (Plan)</span>
              {isPlanned ? (
                <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-mono font-bold text-[10px]">
                  P{month}
                </span>
              ) : (
                <span className="text-[10.5px] text-slate-400 font-normal">ไม่มีรอบในแผน</span>
              )}
            </div>

            {isPlanned && (
              <div className="p-2 rounded-lg bg-indigo-50/50 border border-indigo-100 space-y-1.5 text-[11px]">
                {scheduledDueDate && (
                  <div className="text-slate-600 flex items-center gap-1">
                    <Clock size={11} className="text-slate-400 shrink-0" />
                    <span>วันครบกำหนดตามเกณฑ์: <strong className="text-slate-800 font-mono">{scheduledDueDate}</strong></span>
                  </div>
                )}

                {cycleWo ? (
                  <div className={`p-2 rounded border space-y-1 ${
                    cycleWo.nc_status === 'OPEN' || cycleWo.result_status === 'FAIL'
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : cycleWo.status === 'CLOSED'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}>
                    <div className="flex items-center justify-between font-mono font-bold">
                      <span>{cycleWo.wo_code}</span>
                      <span className="text-[10px] uppercase px-1 py-0.2 rounded bg-white/80">
                        {cycleWo.status}
                      </span>
                    </div>

                    {cycleActualDate && (
                      <div className="text-[11px]">
                        <span>วันที่ตรวจจริง: <strong className="font-mono">{cycleActualDate}</strong></span>
                        {cycleIsDifferentMonth && (
                          <span className="block text-[10px] text-indigo-700 font-medium">
                            ↳ เสร็จสิ้นในเดือน {THAI_MONTH_NAMES[cycleActualMonth - 1]} (ล่าช้ากว่ารอบแผน)
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10.5px]">
                      <span>ผล: <strong>{cycleWo.result_status || 'รอดำเนินการ'}</strong></span>
                      {cycleWo.certificate_no && (
                        <span className="font-mono">Cert: {cycleWo.certificate_no}</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-amber-800 bg-amber-50/70 p-1.5 rounded border border-amber-200 flex items-center gap-1 text-[10.5px]">
                    <Clock size={11} className="shrink-0 text-amber-600" />
                    <span>ยังไม่ได้เปิดใบสั่งงานจริงสำหรับรอบนี้</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Actual Events In This Month */}
          {externalActualWos.length > 0 && (
            <div className="py-2 border-t border-slate-100 space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-700 flex items-center justify-between">
                <span>2. การดำเนินงานจริงในเดือนนี้ (Actual)</span>
                <span className="text-[10px] px-1 rounded bg-emerald-50 text-emerald-700 font-bold">
                  {externalActualWos.length} รายการ
                </span>
              </div>

              {externalActualWos.map((extWo) => {
                const pMonth = extWo.planned_month;
                return (
                  <div
                    key={extWo.id}
                    className="p-2 rounded-lg bg-emerald-50/60 border border-emerald-200 text-emerald-950 space-y-1 text-[11px]"
                  >
                    <div className="flex items-center justify-between font-mono font-bold">
                      <span>{extWo.wo_code}</span>
                      <span className="text-[10px] text-emerald-800 bg-white/70 px-1 py-0.2 rounded font-sans">
                        {pMonth ? `จากรอบแผน ${THAI_MONTH_NAMES_SHORT[pMonth - 1]} (P${pMonth})` : 'นอกแผน'}
                      </span>
                    </div>

                    <div className="text-[10.5px] flex items-center justify-between">
                      <span>วันที่ตรวจจริง: <strong className="font-mono">{extWo.performed_at}</strong></span>
                      <span>ผล: <strong>{extWo.result_status}</strong></span>
                    </div>

                    {extWo.certificate_no && (
                      <div className="text-[10px] text-slate-600 font-mono">
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
            <div className="my-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-start gap-1">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-2 border-t border-slate-100 space-y-1.5">
            {/* Quick Add (Draft/Rejected only) */}
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

            {/* Quick Remove (Draft/Rejected only) */}
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

            {/* Approved Plan -> Open Work Order if not created yet */}
            {plan?.status === 'APPROVED' && isPlanned && !cycleWo && (
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
