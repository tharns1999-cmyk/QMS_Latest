import React, { useState, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  ShieldAlert,
  Loader2,
  X,
  Trash2,
  Building2,
  Wrench,
  ArrowLeftRight,
  Settings
} from 'lucide-react';
import { computeDueDateForMonth } from '../api/vccPlanApi';
import { FloatingOverlay } from '../../../shared/components/ui/FloatingOverlay';
import { getWorkOrderStatusLabel, getResultStatusLabel } from '../utils/statusLabels';
import { formatVccDueDate } from '../utils/vccDateUtils';

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
  onToggleProvider,
  onUpdateDueDate,
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

  // 1. Work Order assigned to this planned cycle (source cycle P{month}) across revisions of the same plan year
  const cycleWo = workOrders.find((w) => {
    if (w.status === 'CANCELLED') return false;
    const matchesAssetAndYear =
      w.asset_id &&
      item.asset_id &&
      w.asset_id === item.asset_id &&
      (!w.plan_year || !plan?.plan_year || Number(w.plan_year) === Number(plan.plan_year));
    const matchesItem =
      w.plan_item_id === item.id ||
      (w.plan_id === plan?.id && w.asset_id === item.asset_id) ||
      matchesAssetAndYear;
    return matchesItem && Number(w.planned_month) === month;
  });

  const isLockedByExecution = Boolean(
    cycleWo &&
      (cycleWo.status === 'CLOSED' ||
        cycleWo.status === 'IN_PROGRESS' ||
        cycleWo.status === 'PENDING_REVIEW')
  );

  const cycleActualDate = cycleWo?.performed_at || null;
  const cycleActualMonth = cycleActualDate ? Number(cycleActualDate.slice(5, 7)) : null;
  const cycleIsDifferentMonth = Boolean(cycleActualMonth && cycleActualMonth !== month);

  // 2. Work Orders whose ACTUAL execution occurred IN this calendar month, but originated from another plan cycle (or ad-hoc)
  const externalActualWos = workOrders.filter((w) => {
    if (w.status === 'CANCELLED') return false;
    const matchesAssetAndYear =
      w.asset_id &&
      item.asset_id &&
      w.asset_id === item.asset_id &&
      (!w.plan_year || !plan?.plan_year || Number(w.plan_year) === Number(plan.plan_year));
    const matchesItem =
      w.plan_item_id === item.id ||
      (w.plan_id === plan?.id && w.asset_id === item.asset_id) ||
      matchesAssetAndYear;
    if (!matchesItem || !w.performed_at) return false;
    const perfMonth = Number(w.performed_at.slice(5, 7));
    return perfMonth === month && Number(w.planned_month) !== month;
  });

  const allCellWos = [
    ...(cycleWo ? [cycleWo] : []),
    ...externalActualWos
  ];

  const hasHoldOrNc = allCellWos.some((w) => w.nc_status === 'OPEN' || w.result_status === 'FAIL');
  const hasClosedPass = (cycleWo?.status === 'CLOSED' && cycleWo?.result_status === 'PASS' && !cycleIsDifferentMonth) ||
    externalActualWos.some((w) => w.status === 'CLOSED' && w.result_status === 'PASS');
  const hasOpenWo = allCellWos.some((w) => w.status === 'OPEN' || w.status === 'PENDING_REVIEW');
  const hasAnyActivity = isPlanned || allCellWos.length > 0;

  // Due date preview & custom due date resolution
  const monthIdx = (item?.planned_months || []).indexOf(month);
  const rawDueDates = (() => {
    try {
      return Array.isArray(item?.due_dates) ? item.due_dates : JSON.parse(item?.due_dates || '[]');
    } catch {
      return [];
    }
  })();
  const customDueDate = monthIdx !== -1 && rawDueDates[monthIdx] ? rawDueDates[monthIdx] : null;
  const defaultDueDate = plan?.plan_year
    ? computeDueDateForMonth(plan.plan_year, month, plan.due_date_rule || 'END_OF_MONTH')
    : null;
  const scheduledDueDate = customDueDate || defaultDueDate;

  const planYear = plan?.plan_year;
  const mm = String(month).padStart(2, '0');
  const startOfMonth = planYear ? `${planYear}-${mm}-01` : '';
  const midOfMonth = planYear ? `${planYear}-${mm}-15` : '';
  const lastDayNum = planYear ? new Date(Date.UTC(planYear, month, 0)).getUTCDate() : 30;
  const endOfMonth = planYear ? `${planYear}-${mm}-${String(lastDayNum).padStart(2, '0')}` : '';

  const [inputDueDate, setInputDueDate] = useState(scheduledDueDate || '');

  useEffect(() => {
    if (scheduledDueDate) {
      setInputDueDate(scheduledDueDate);
    }
  }, [scheduledDueDate, isOpen]);

  const rawProvider = String(item?.provider_name || item?.calibration_type || '').trim();
  const isExternalProvider =
    Boolean(rawProvider) &&
    !rawProvider.includes('ภายใน') &&
    rawProvider.toLowerCase() !== 'internal';

  const cleanAssetName = String(item?.asset_name || '').replace(/^\[ข้อมูลทดสอบ\]\s*/g, '').trim();

  // Quick Add with chosen provider type
  const handleAddWithProvider = async (providerType) => {
    if (!onQuickAddMonth || isSaving) return;
    setActionError('');
    try {
      const providerName = providerType === 'EXTERNAL' ? 'ห้องปฏิบัติการภายนอก' : 'ทวนสอบภายใน';
      await onQuickAddMonth(item, month, { providerType, provider_name: providerName });
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

  // Toggle Provider
  const handleToggleProviderAction = async () => {
    if (!onToggleProvider || isSaving) return;
    setActionError('');
    try {
      const targetProvider = isExternalProvider ? 'ทวนสอบภายใน' : 'ห้องปฏิบัติการภายนอก';
      await onToggleProvider(item, targetProvider);
      setIsOpen(false);
    } catch (err) {
      setActionError(err.message || 'ไม่สามารถสลับวิธีดำเนินการได้');
    }
  };

  // Custom Due Date Update
  const handleApplyDueDate = async (targetDate) => {
    if (!onUpdateDueDate || isSaving || !canEditPlan) return;
    if (!targetDate || targetDate < startOfMonth || targetDate > endOfMonth) return;
    setActionError('');
    try {
      setInputDueDate(targetDate);
      await onUpdateDueDate(item, month, targetDate);
    } catch (err) {
      setActionError(err.message || 'ไม่สามารถบันทึกวันครบกำหนดได้');
    }
  };

  // Create Work Order
  const isLogicalGroup = Number(item.is_group) === 1 && item.group_nature !== 'COMPOSITE_SET';
  const handleCreateWo = async () => {
    if (isLogicalGroup) {
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
      className={`group/cell relative text-center border-r border-slate-200 transition-all select-none align-middle ${
        isCompact ? 'py-2 px-1' : 'py-2.5 px-1.5'
      } ${
        hasHoldOrNc
          ? 'bg-rose-50/30'
          : hasClosedPass
          ? 'bg-emerald-50/30'
          : hasOpenWo
          ? 'bg-amber-50/30'
          : isPlanned
          ? isExternalProvider
            ? 'bg-sky-50/25'
            : 'bg-indigo-50/25'
          : canEditPlan
          ? 'bg-transparent hover:bg-indigo-50/40 hover:ring-1 hover:ring-indigo-300 cursor-pointer'
          : 'bg-transparent'
      }`}
      onClick={(e) => {
        if (canEditPlan || hasAnyActivity) {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }
      }}
    >
      {/* Cell Badge Trigger */}
      <div className="flex items-center justify-center gap-1 min-h-[44px] sm:min-h-[30px] flex-wrap">
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
                      ? `รอบแผนเดือน ${month} ➔ ตรวจจริง ${cycleActualDate} (${THAI_MONTH_NAMES_SHORT[cycleActualMonth - 1]})`
                      : 'ตรวจรับปิดงานแล้วตามกำหนด'
                    : cycleWo?.status === 'PENDING_REVIEW'
                    ? 'ส่งผลแล้ว รอผู้ตรวจรับ'
                    : cycleWo?.status === 'OPEN'
                    ? 'มีใบสั่งงานกำลังดำเนินการ'
                    : isExternalProvider
                    ? 'รอบสอบเทียบภายนอกตามแผน'
                    : 'รอบทวนสอบภายในตามแผน'
                }`}
                className={`inline-flex items-center justify-center gap-1 min-h-[44px] sm:min-h-[24px] min-w-[44px] rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap border transition-all cursor-pointer shadow-2xs hover:scale-105 motion-safe:active:scale-95 select-none ${
                  cycleWo?.nc_status === 'OPEN' || cycleWo?.result_status === 'FAIL'
                    ? 'bg-rose-50 text-rose-700 border-rose-300 font-bold'
                    : cycleWo?.status === 'CLOSED'
                    ? cycleIsDifferentMonth
                      ? 'border-dashed border-slate-300 bg-slate-50/90 text-slate-600 hover:bg-slate-100/90'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold'
                    : cycleWo?.status === 'PENDING_REVIEW'
                    ? 'bg-amber-50 text-amber-800 border-amber-300 font-semibold'
                    : cycleWo?.status === 'OPEN'
                    ? 'bg-sky-100 text-sky-800 border-sky-300 font-semibold'
                    : isExternalProvider
                    ? 'bg-sky-50 text-sky-700 border-sky-200/90 hover:bg-sky-100/80'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200/90 hover:bg-indigo-100/80'
                }`}
              >
                {cycleWo?.nc_status === 'OPEN' || cycleWo?.result_status === 'FAIL' ? (
                  <span className="inline-flex items-center gap-0.5">
                    <AlertTriangle size={11} className="text-rose-600 shrink-0" />
                    <span>NC</span>
                  </span>
                ) : cycleWo?.status === 'CLOSED' ? (
                  cycleIsDifferentMonth ? (
                    <span className="inline-flex items-center gap-0.5" title={`ทำจริง ${cycleActualDate}`}>
                      <span>แผน ➔ {THAI_MONTH_NAMES_SHORT[cycleActualMonth - 1]}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5">
                      <CheckCircle2 size={11} className="text-emerald-600 shrink-0" />
                      <span>✓ เสร็จสิ้น</span>
                    </span>
                  )
                ) : cycleWo?.status === 'PENDING_REVIEW' ? (
                  <span className="inline-flex items-center gap-0.5">
                    <Clock size={11} className="text-amber-600 shrink-0" />
                    <span>รอตรวจ</span>
                  </span>
                ) : cycleWo?.status === 'OPEN' ? (
                  <span className="inline-flex items-center gap-0.5">
                    <Clock size={11} className="text-sky-600 shrink-0" />
                    <span>ใบงาน</span>
                  </span>
                ) : isExternalProvider ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
                    <span>ภายนอก</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                    <span>ภายใน</span>
                  </span>
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
                  className={`inline-flex items-center justify-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold border transition-transform cursor-pointer shadow-2xs hover:scale-105 motion-safe:active:scale-95 select-none ${
                    isNc
                      ? 'bg-rose-50 text-rose-700 border-rose-300 font-bold'
                      : isClosed
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold'
                      : 'bg-amber-50 text-amber-800 border-amber-300'
                  }`}
                >
                  {isClosed ? <CheckCircle2 size={11} className="text-emerald-600 shrink-0" /> : <Clock size={11} />}
                  <span>✓ ทำจริง {pMonth ? `(แผน ${THAI_MONTH_NAMES_SHORT[pMonth - 1]})` : '(นอกแผน)'}</span>
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
              setIsOpen(true);
            }}
            title={`คลิกเพื่อกำหนดเป้าหมายทวนสอบเดือน ${month}`}
            aria-label={`กำหนดเป้าหมายเดือน ${month}`}
            className="w-full min-w-[44px] min-h-[44px] sm:min-h-[26px] px-1.5 rounded-lg border border-transparent group-hover/cell:border-dashed group-hover/cell:border-indigo-300 hover:border-dashed hover:border-indigo-400 flex items-center justify-center text-slate-300 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all opacity-0 group-hover/cell:opacity-100 focus:opacity-100 hover:opacity-100 cursor-pointer motion-safe:active:scale-95"
          >
            <Plus size={13} />
          </button>
        ) : (
          <span className="text-slate-200 font-mono text-xs">·</span>
        )}
      </div>

      {/* Mini Contextual Popover rendered via FloatingPortal into document.body */}
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
        className="w-80 sm:w-92 max-w-[calc(100vw-24px)] bg-white rounded-2xl shadow-2xl border border-slate-200/90 p-4 text-left animate-in fade-in zoom-in-95 duration-100 max-h-[85vh] overflow-y-auto"
      >
        {/* Popover Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${!isPlanned ? 'bg-indigo-500 ring-2 ring-indigo-200' : isExternalProvider ? 'bg-sky-500 ring-2 ring-sky-200' : 'bg-indigo-600 ring-2 ring-indigo-200'}`} />
            <h4 className="font-bold text-slate-900 text-sm">
              {!isPlanned
                ? `กำหนดรอบ: ${THAI_MONTH_NAMES[month - 1]} ${plan?.plan_year || ''}`
                : `เดือนที่ ${month} (${THAI_MONTH_NAMES[month - 1]})`}
            </h4>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
            title="ปิดหน้าต่าง"
          >
            <X size={15} />
          </button>
        </div>

        {/* Asset Context */}
        <div className="py-2.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-mono font-bold text-sm text-indigo-700">{item.asset_code}</span>
            <span className="text-xs font-semibold text-slate-500">แผนก {item.responsible_dept || item.asset_department || '-'}</span>
          </div>
          <div className="text-xs sm:text-sm text-slate-800 font-medium line-clamp-2">
            {cleanAssetName}
          </div>
        </div>

        {/* Action Error Alert */}
        {actionError && (
          <div className="my-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start gap-1.5">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>{actionError}</span>
          </div>
        )}

        {/* CASE 1: Unplanned Month Cell (Add New Cycle with Choice) */}
        {!isPlanned && canEditPlan && (
          <div className="py-2.5 border-t border-slate-100 space-y-2.5">
            <div className="text-xs font-semibold text-slate-600">
              เลือกประเภทการดำเนินการสำหรับรอบเดือน {THAI_MONTH_NAMES_SHORT[month - 1]}:
            </div>

            <div className="space-y-2">
              {/* Option 1: External Calibration */}
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleAddWithProvider('EXTERNAL')}
                className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-sky-200 bg-sky-50/60 hover:bg-sky-100/80 hover:border-sky-300 text-sky-950 transition-all text-left cursor-pointer group/ext disabled:opacity-60"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shrink-0 group-hover/ext:bg-sky-200/80 transition-colors">
                    <Building2 size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-sky-900">
                      🏢 สอบเทียบภายนอก (External)
                    </div>
                    <div className="text-[11px] text-sky-700 line-clamp-1">
                      ส่งตรวจรับรองโดยห้องปฏิบัติการภายนอก
                    </div>
                  </div>
                </div>
                {isExternalProvider && (
                  <span className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-200/90 text-sky-900 border border-sky-300 whitespace-nowrap">
                    ค่ามาตรฐานเครื่องมือ
                  </span>
                )}
              </button>

              {/* Option 2: Internal Verification */}
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleAddWithProvider('INTERNAL')}
                className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-indigo-200 bg-indigo-50/60 hover:bg-indigo-100/80 hover:border-indigo-300 text-indigo-950 transition-all text-left cursor-pointer group/int disabled:opacity-60"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 group-hover/int:bg-indigo-200/80 transition-colors">
                    <Wrench size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-indigo-900">
                      🔧 ทวนสอบภายใน (Internal)
                    </div>
                    <div className="text-[11px] text-indigo-700 line-clamp-1">
                      ทวนสอบความถูกต้องโดยบุคลากรภายใน
                    </div>
                  </div>
                </div>
                {!isExternalProvider && (
                  <span className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-200/90 text-indigo-900 border border-indigo-300 whitespace-nowrap">
                    ค่ามาตรฐานเครื่องมือ
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* CASE 2: Planned Cycle Information & Edit Actions */}
        {isPlanned && (
          <>
            <div className="py-2.5 border-t border-slate-100 space-y-2">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>1. รอบตามแผนประจำปี (Plan)</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${isExternalProvider ? 'bg-sky-50 text-sky-800 border-sky-200' : 'bg-indigo-50 text-indigo-800 border-indigo-200'}`}>
                  {isExternalProvider ? '● สอบเทียบภายนอก' : '● ทวนสอบภายใน'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
                {canEditPlan ? (
                  <div className="space-y-1.5 pt-0.5">
                    <div className="flex items-center justify-between text-slate-700 font-medium">
                      <span className="flex items-center gap-1.5 text-xs font-semibold">
                        <Clock size={13} className="text-indigo-600 shrink-0" />
                        <span>วันครบกำหนดรอบ (Due Date):</span>
                      </span>
                      {scheduledDueDate && (
                        <span className="text-[11px] font-bold text-slate-600 font-sans" title={`ค.ศ. ${scheduledDueDate}`}>
                          {formatVccDueDate(scheduledDueDate)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        aria-label="กำหนดวันครบกำหนดรอบ"
                        value={inputDueDate || scheduledDueDate || ''}
                        min={startOfMonth}
                        max={endOfMonth}
                        disabled={isSaving}
                        onChange={(e) => {
                          const val = e.target.value;
                          setInputDueDate(val);
                          if (val && val >= startOfMonth && val <= endOfMonth) {
                            handleApplyDueDate(val);
                          }
                        }}
                        className="w-full h-8 px-2.5 py-1 text-xs font-mono font-medium rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-slate-800 disabled:opacity-60 shadow-2xs"
                      />
                    </div>

                    {/* Quick Preset Chips */}
                    <div className="flex items-center gap-1 pt-0.5 flex-wrap">
                      <span className="text-[10px] text-slate-400 font-medium shrink-0">ลัด:</span>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleApplyDueDate(startOfMonth)}
                        className={`px-1.5 py-0.5 rounded text-[11px] transition-colors cursor-pointer border ${
                          (scheduledDueDate || inputDueDate) === startOfMonth
                            ? 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold'
                            : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200 font-medium'
                        }`}
                      >
                        ต้นเดือน (1)
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleApplyDueDate(midOfMonth)}
                        className={`px-1.5 py-0.5 rounded text-[11px] transition-colors cursor-pointer border ${
                          (scheduledDueDate || inputDueDate) === midOfMonth
                            ? 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold'
                            : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200 font-medium'
                        }`}
                      >
                        กลางเดือน (15)
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleApplyDueDate(endOfMonth)}
                        className={`px-1.5 py-0.5 rounded text-[11px] transition-colors cursor-pointer border ${
                          (scheduledDueDate || inputDueDate) === endOfMonth
                            ? 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold'
                            : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200 font-medium'
                        }`}
                      >
                        สิ้นเดือน (Default)
                      </button>
                    </div>
                  </div>
                ) : (
                  scheduledDueDate && (
                    <div className="text-slate-700 flex items-center justify-between font-medium">
                      <span className="flex items-center gap-1.5">
                        <Clock size={13} className="text-slate-400 shrink-0" />
                        <span>วันครบกำหนดตามเกณฑ์:</span>
                      </span>
                      <strong className="text-slate-900 font-bold font-sans" title={`ค.ศ. ${scheduledDueDate}`}>
                        {formatVccDueDate(scheduledDueDate)}
                      </strong>
                    </div>
                  )
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
                        {getWorkOrderStatusLabel(cycleWo.status)}
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
                      <span>ผล: <strong className="font-bold">{cycleWo.result_status ? getResultStatusLabel(cycleWo.result_status) : 'รอดำเนินการ'}</strong></span>
                      {cycleWo.certificate_no && (
                        <span className="font-mono font-semibold">Cert: {cycleWo.certificate_no}</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-600 bg-white p-2 rounded-lg border border-slate-200 flex items-center gap-1.5 text-xs font-medium">
                    <Clock size={13} className="shrink-0 text-slate-400" />
                    <span>ยังไม่ได้เปิดใบสั่งงานจริงสำหรับรอบนี้</span>
                  </div>
                )}
              </div>
            </div>

            {/* External Actual Event Section */}
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
                        <span>ผล: <strong className="font-bold">{getResultStatusLabel(extWo.result_status)}</strong></span>
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

            {/* Action Buttons for Planned Cycle */}
            <div className="pt-2.5 border-t border-slate-100 space-y-2">
              {canEditPlan && (
                <>
                  {/* Action 1: Toggle Provider (External <-> Internal) */}
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleToggleProviderAction}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-800 text-slate-700 text-xs sm:text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60"
                  >
                    <ArrowLeftRight size={14} className="text-indigo-600 shrink-0" />
                    <span>
                      {isExternalProvider
                        ? 'สลับเป็นทวนสอบภายใน (Internal)'
                        : 'สลับเป็นสอบเทียบภายนอก (External)'}
                    </span>
                  </button>

                  {/* Action 2: Open Full Edit Modal */}
                  <button
                    type="button"
                    aria-label="แก้ไขรายละเอียดรายการเต็ม"
                    onClick={() => {
                      setIsOpen(false);
                      if (onOpenFullEdit) onOpenFullEdit(item);
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-medium transition-colors cursor-pointer"
                  >
                    <Settings size={14} className="text-slate-500 shrink-0" />
                    <span>แก้ไขรายละเอียดรอบ (รายการเต็ม)</span>
                  </button>

                  {/* Action 3: Quick Remove Month */}
                  {isLockedByExecution ? (
                    <div
                      data-testid={`locked-cycle-month-${month}`}
                      className="p-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold flex items-start gap-2"
                    >
                      <ShieldAlert size={14} className="text-slate-600 shrink-0 mt-0.5" />
                      <span>
                        ล็อกการแก้ไข: รอบเดือนนี้มีใบสั่งงานดำเนินการแล้วหรือกำลังดำเนินการ ({cycleWo?.wo_code || cycleWo?.status}) ห้ามถอดออกจากแผน
                      </span>
                    </div>
                  ) : confirmDelete ? (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
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
                      aria-label={`ยกเลิกรอบแผนเดือน ${month}`}
                      onClick={() => setConfirmDelete(true)}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50/40 hover:bg-rose-50 text-rose-700 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                    >
                      <Trash2 size={13} />
                      <span>ยกเลิกรอบแผนเดือน {month}</span>
                    </button>
                  )}
                </>
              )}

              {/* Approved Plan -> Open Work Order if not created yet */}
              {plan?.status === 'APPROVED' && isPlanned && !cycleWo && (
                <>
                  {isLogicalGroup ? (
                    <button
                      type="button"
                      onClick={handleCreateWo}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold shadow-2xs transition-colors cursor-pointer"
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
          </>
        )}
      </FloatingOverlay>
    </td>
  );
};

export default AnnualPlanMonthCell;
