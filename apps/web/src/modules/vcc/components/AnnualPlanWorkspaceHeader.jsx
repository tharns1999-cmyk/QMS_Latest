import React, { useState, useRef, useEffect } from 'react';
import {
  MoreHorizontal,
  Plus,
  History,
  Edit3,
  BookOpen,
  SlidersHorizontal,
  ListFilter,
  CheckCircle2,
  Send,
  XCircle,
  ShieldCheck,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Users
} from 'lucide-react';
import { PLAN_STATUS_OPTIONS, getPlanStatusLabel, getDueDateRuleLabel } from '../utils/planLabels';

const useDismiss = (open, onClose) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return ref;
};

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

const getNextStepText = (plan, thresholds = {}) => {
  if (!plan) return '';
  switch (plan.status) {
    case 'DRAFT':
      return 'เพิ่มรายการเครื่องมือให้ครบ แล้วส่งทบทวนแผน';
    case 'REJECTED':
      return 'แก้ไขตามเหตุผลที่ส่งกลับ แล้วส่งทบทวนใหม่';
    case 'PENDING_REVIEW':
      return `รอผู้ทบทวน (ระดับ L${thresholds.required_reviewer_level || 4} ขึ้นไป)`;
    case 'PENDING_APPROVAL':
      return `รอผู้อนุมัติ (ระดับ L${thresholds.required_approver_level || 5} ขึ้นไป)`;
    case 'APPROVED': {
      const by = plan.approved_by_name || plan.approved_by;
      const at = formatThaiDateTime(plan.approved_at);
      return `พร้อมออกใบสั่งงาน${by ? ` · อนุมัติโดย ${by}` : ''}${at ? ` · ${at}` : ''}`;
    }
    default:
      return '';
  }
};

const getStatusBadgeStyle = (status) => {
  switch (status) {
    case 'APPROVED':
      return 'text-emerald-700 bg-emerald-50 border-emerald-200/80';
    case 'PENDING_APPROVAL':
      return 'text-indigo-700 bg-indigo-50 border-indigo-200/80';
    case 'PENDING_REVIEW':
      return 'text-amber-800 bg-amber-50 border-amber-200/80';
    case 'REJECTED':
      return 'text-rose-700 bg-rose-50 border-rose-200/80';
    default:
      return 'text-slate-700 bg-slate-100 border-slate-200/80';
  }
};

const StatusIcon = ({ status }) => {
  switch (status) {
    case 'APPROVED':
      return <ShieldCheck size={12} className="text-emerald-600 shrink-0" />;
    case 'PENDING_APPROVAL':
      return <ShieldCheck size={12} className="text-indigo-600 shrink-0" />;
    case 'PENDING_REVIEW':
      return <Clock size={12} className="text-amber-600 shrink-0" />;
    case 'REJECTED':
      return <AlertTriangle size={12} className="text-rose-600 shrink-0" />;
    default:
      return <Edit3 size={12} className="text-slate-500 shrink-0" />;
  }
};

const StepRow = ({ label, name, at, done, current }) => (
  <div className="flex items-start gap-2 text-sm">
    {done ? (
      <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
    ) : (
      <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${current ? 'bg-amber-500 ring-2 ring-amber-200' : 'bg-slate-300'}`} />
    )}
    <div className="min-w-0">
      <span className="text-slate-500 text-xs block sm:inline sm:mr-1">{label}: </span>
      <span className={`font-semibold ${done || current ? 'text-slate-900' : 'text-slate-500'}`}>{name}</span>
      {at && <span className="text-slate-400 text-xs font-mono"> · {at}</span>}
    </div>
  </div>
);

const selectClass =
  'h-9 px-3 rounded-xl border border-slate-300 text-sm font-medium bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600';

/**
 * Modern Executive QMS Workspace Header (FM-QC-46)
 * ออกแบบตามหลัก Balanced Workspace Header + Contextual Action Hierarchy
 * - แถวที่ 1 (Identity & Actions):
 *     - ฝั่งซ้าย: ชื่อทางการของแผน (Title) + ป้ายสถานะ (Status Badge) + รหัสเอกสาร (Doc Code), แผนก, จำนวนรายการ, กติกาวันครบกำหนด
 *     - ฝั่งขวา: ลำดับการกระทำ (Primary Workflow CTA + สร้างแผนใหม่ + ผู้เกี่ยวข้อง + เพิ่มเติม)
 * - แถวที่ 2 (Control & Guidance Deck):
 *     - ฝั่งซ้าย: กล่องสลับเลือกแผน (Plan Switcher) + ตัวกรองค้นหา (สถานะแผน + ปี/แผนก)
 *     - ฝั่งขวา: คำแนะนำขั้นตอนถัดไป (Next Step Guidance) หรือเหตุผลการส่งกลับ (Rejection Notice)
 */
export const AnnualPlanWorkspaceHeader = ({
  statusTab,
  setStatusTab,
  filterYear,
  setFilterYear,
  availableYears = [],
  filterDept,
  setFilterDept,
  activeDepartments = [],
  plans = [],
  selectedPlanId,
  onSelectPlan,
  activePlan,
  planItems = [],
  canEditPlan = false,
  thresholds = {},
  onSubmitPlan,
  onOpenWorkflowModal,
  onOpenSettings,
  onOpenCreatePlan,
  onOpenEditPlan,
  onOpenHistory,
  onOpenJustificationModal
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const menuRef = useDismiss(menuOpen, () => setMenuOpen(false));
  const filterRef = useDismiss(filterOpen, () => setFilterOpen(false));

  const extraFilterCount = (filterYear ? 1 : 0) + (filterDept ? 1 : 0);

  const summaryMetrics = React.useMemo(() => {
    const groupItems = planItems.filter((i) => Number(i.is_group) === 1);
    const standaloneItems = planItems.filter((i) => Number(i.is_group) === 0 && !i.parent_id);

    let inScopeCount = 0;
    let plannedCount = 0;
    let unplannedCount = 0;
    let unplannedWithoutReasonCount = 0;
    let totalCyclesCount = 0;

    // 1. Standalone items
    for (const item of standaloneItems) {
      inScopeCount += 1;
      const cycles = (item.planned_months || []).length;
      if (cycles > 0) {
        plannedCount += 1;
        totalCyclesCount += cycles;
      } else {
        unplannedCount += 1;
        if (!item.remarks?.trim()) {
          unplannedWithoutReasonCount += 1;
        }
      }
    }

    // 2. Groups and their children (Prevent double counting!)
    for (const grp of groupItems) {
      const grpCycles = (grp.planned_months || []).length;
      const children = planItems.filter((c) => c.parent_id === grp.asset_id || c.parent_id === grp.id);

      if (grpCycles > 0) {
        // Group-level planning: count group as 1 instrument in scope
        inScopeCount += 1;
        plannedCount += 1;
        totalCyclesCount += grpCycles;
      } else if (children.length > 0) {
        // Child-level planning: count each child as 1 instrument in scope (do NOT count group separately)
        for (const ch of children) {
          inScopeCount += 1;
          const chCycles = (ch.planned_months || []).length;
          if (chCycles > 0) {
            plannedCount += 1;
            totalCyclesCount += chCycles;
          } else {
            unplannedCount += 1;
            if (!ch.remarks?.trim()) {
              unplannedWithoutReasonCount += 1;
            }
          }
        }
      } else {
        // Empty group
        inScopeCount += 1;
        unplannedCount += 1;
        if (!grp.remarks?.trim()) {
          unplannedWithoutReasonCount += 1;
        }
      }
    }

    return {
      inScopeCount,
      plannedCount,
      unplannedCount,
      unplannedWithoutReasonCount,
      totalCyclesCount
    };
  }, [planItems]);

  const runMenu = (fn) => () => {
    setMenuOpen(false);
    if (fn) fn();
  };

  const menuItemClass =
    'w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer';

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 space-y-3">
      {/* แถวที่ 1: ชื่อแผนและข้อมูลกำกับ (ซ้าย) สมดุลกับ Action Bar (ขวา) */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        {/* ฝั่งซ้าย: เอกลักษณ์และบริบทของแผน (Document Identity & Context) */}
        <div className="min-w-0 flex-1">
          {activePlan ? (
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 tracking-tight" title={activePlan.title}>
                  {activePlan.title}
                </h2>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border shadow-2xs shrink-0 ${getStatusBadgeStyle(
                    activePlan.status
                  )}`}
                >
                  <StatusIcon status={activePlan.status} />
                  <span>สถานะ: {getPlanStatusLabel(activePlan.status)}</span>
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-sm text-slate-600 mt-1">
                <span className="font-mono font-bold text-xs text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/80 shadow-2xs">
                  {activePlan.document_code} Rev.{activePlan.revision}
                </span>
                <span className="text-slate-700 font-medium">
                  {activePlan.department_name_th
                    ? `${activePlan.department_name_th} (${activePlan.department})`
                    : `แผนก ${activePlan.department}`}
                </span>
                <span className="text-slate-300">•</span>
                <span className="font-semibold text-slate-800">{planItems.length} รายการ</span>
                {getDueDateRuleLabel(activePlan.due_date_rule) && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span>{getDueDateRuleLabel(activePlan.due_date_rule)}</span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-700">แผนการทวนสอบเครื่องมือประจำปี</h2>
              <p className="text-xs text-slate-400 mt-0.5">ยังไม่ได้เลือกแผน หรือไม่มีแผนในตัวกรองนี้</p>
            </div>
          )}
        </div>

        {/* ฝั่งขวา: Action Hierarchy ตามบริบท (Primary CTA + Secondary Actions + Quick Tools) */}
        <div className="flex items-center gap-2 flex-wrap shrink-0 justify-end">
          {/* Primary Action ตามสถานะของแผนในปัจจุบัน */}
          {activePlan && canEditPlan && activePlan.status === 'DRAFT' && onSubmitPlan && (
            <button
              type="button"
              onClick={onSubmitPlan}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm shadow-2xs transition-colors cursor-pointer"
            >
              <Send size={14} />
              <span>ส่งทบทวนแผน</span>
            </button>
          )}

          {activePlan && activePlan.status === 'PENDING_REVIEW' && onOpenWorkflowModal && (
            <>
              <button
                type="button"
                onClick={() => onOpenWorkflowModal('REVIEW')}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm shadow-2xs transition-colors cursor-pointer"
              >
                <CheckCircle2 size={15} />
                <span>ยืนยันการทบทวน</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenWorkflowModal('REJECT')}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 font-semibold text-sm transition-colors cursor-pointer"
              >
                <XCircle size={15} />
                <span>ส่งกลับแก้ไข</span>
              </button>
            </>
          )}

          {activePlan && activePlan.status === 'PENDING_APPROVAL' && onOpenWorkflowModal && (
            <>
              <button
                type="button"
                onClick={() => onOpenWorkflowModal('APPROVE')}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm shadow-2xs transition-colors cursor-pointer"
              >
                <ShieldCheck size={15} />
                <span>อนุมัติแผนประจำปี</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenWorkflowModal('REJECT')}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 font-semibold text-sm transition-colors cursor-pointer"
              >
                <XCircle size={15} />
                <span>ส่งกลับแก้ไข</span>
              </button>
            </>
          )}

          {/* Secondary Action: สร้างแผนใหม่ */}
          <button
            type="button"
            onClick={onOpenCreatePlan}
            title="สร้างแผนการทวนสอบเครื่องมือประจำปีใหม่"
            className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <Plus size={15} className="text-slate-500" />
            <span>สร้างแผนใหม่</span>
          </button>

          {/* ตรวจสอบสายการอนุมัติ (ผู้เกี่ยวข้อง) */}
          {activePlan && (
            <button
              type="button"
              aria-expanded={detailOpen}
              onClick={() => setDetailOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium shadow-2xs transition-colors cursor-pointer"
            >
              <Users size={15} className="text-slate-500" />
              <span>ผู้เกี่ยวข้อง</span>
              {detailOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}

          {/* เมนูรองสำหรับงานที่ไม่ได้ใช้บ่อย */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="เมนูเพิ่มเติมของแผน"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-2xs cursor-pointer"
            >
              <MoreHorizontal size={15} />
              <span className="hidden sm:inline">เพิ่มเติม</span>
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1.5 z-40 w-60 bg-white rounded-xl border border-slate-200 shadow-lg py-1.5"
              >
                {canEditPlan && activePlan && (
                  <button type="button" role="menuitem" className={menuItemClass} onClick={runMenu(() => onOpenEditPlan(activePlan))}>
                    <Edit3 size={15} className="text-slate-500" />
                    <span>แก้ไขหัวแผน</span>
                  </button>
                )}
                <button type="button" role="menuitem" className={menuItemClass} onClick={runMenu(onOpenCreatePlan)}>
                  <Plus size={15} className="text-slate-500" />
                  <span>สร้างแผนประจำปีใหม่</span>
                </button>
                {activePlan && (
                  <button type="button" role="menuitem" className={menuItemClass} onClick={runMenu(onOpenHistory)}>
                    <History size={15} className="text-slate-500" />
                    <span>ประวัติการอนุมัติ</span>
                  </button>
                )}
                <button type="button" role="menuitem" className={menuItemClass} onClick={runMenu(onOpenSettings)}>
                  <SlidersHorizontal size={15} className="text-slate-500" />
                  <span>ตั้งค่าแผนและเกณฑ์อนุมัติ</span>
                </button>
                <button type="button" role="menuitem" className={menuItemClass} onClick={runMenu(() => setGuideOpen((v) => !v))}>
                  <BookOpen size={15} className="text-indigo-600" />
                  <span>{guideOpen ? 'ซ่อนข้อกำหนดการใช้แผน' : 'ข้อกำหนดการใช้แผน'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* แถวที่ 2 (Control & Guidance Deck): สลับแผน + ตัวกรอง (ซ้าย) | คำแนะนำขั้นตอน (ขวา) */}
      <div className="pt-3 border-t border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-3 text-sm">
        {/* ฝั่งซ้าย: กลุ่มควบคุมการเลือกและกรองแผน (Plan Selector & Scope Filters) */}
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <span className="text-xs font-semibold text-slate-500">เลือกแผน:</span>
          <select
            aria-label="เลือกแผนประจำปี"
            value={selectedPlanId || ''}
            onChange={(e) => onSelectPlan(e.target.value)}
            disabled={plans.length === 0}
            className="h-9 px-3 rounded-xl border border-slate-300 text-sm font-semibold bg-white text-slate-800 shadow-2xs hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 cursor-pointer min-w-[14rem] max-w-full"
          >
            {plans.length === 0 && <option value="">ไม่มีแผนในสถานะนี้</option>}
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                ปี {p.plan_year} · แผนก {p.department} · {p.document_code} Rev.{p.revision}
              </option>
            ))}
          </select>

          <span className="text-slate-300 hidden sm:inline">|</span>

          {/* กรองตามสถานะของแผน */}
          <select
            aria-label="กรองตามสถานะแผน"
            value={statusTab}
            onChange={(e) => setStatusTab(e.target.value)}
            className="h-9 px-3 rounded-xl border border-slate-300 text-sm font-medium bg-slate-50 hover:bg-white text-slate-700 focus:outline-none focus:border-indigo-600 cursor-pointer"
          >
            {PLAN_STATUS_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                สถานะ: {s.label}
              </option>
            ))}
          </select>

          {/* ป๊อปอัพกรองตามปีและแผนก */}
          <div className="relative" ref={filterRef}>
            <button
              type="button"
              aria-haspopup="true"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-300 bg-slate-50 hover:bg-white text-sm font-medium text-slate-700 cursor-pointer"
            >
              <ListFilter size={14} className="text-slate-500" />
              <span>กรองปี/แผนก{extraFilterCount > 0 ? ` (${extraFilterCount})` : ''}</span>
            </button>
            {filterOpen && (
              <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 z-40 w-64 bg-white rounded-xl border border-slate-200 shadow-lg p-3.5 space-y-2.5">
                <label className="block text-xs font-semibold text-slate-700">
                  ปีของแผน
                  <select
                    aria-label="กรองตามปีของแผน"
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    className={`${selectClass} w-full mt-1`}
                  >
                    <option value="">ทุกปี</option>
                    {availableYears.map((yr) => (
                      <option key={yr} value={String(yr)}>
                        {yr} (พ.ศ. {yr + 543})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  แผนก
                  <select
                    aria-label="กรองแผนตามแผนก"
                    value={filterDept}
                    onChange={(e) => setFilterDept(e.target.value)}
                    className={`${selectClass} w-full mt-1`}
                  >
                    <option value="">ทุกแผนก</option>
                    {activeDepartments.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.code} — {d.nameTh}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* ฝั่งขวา: คำแนะนำขั้นตอนถัดไป หรือ แถบแจ้งเตือนส่งกลับแก้ไข */}
        <div className="min-w-0 flex items-center justify-start xl:justify-end">
          {activePlan?.status === 'REJECTED' && activePlan?.rejected_reason ? (
            <div className="inline-flex items-center gap-2 text-rose-800 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200 text-sm font-medium">
              <AlertTriangle size={15} className="text-rose-600 shrink-0" />
              <span className="font-bold text-rose-900">ส่งกลับแก้ไข:</span>
              <span className="truncate max-w-xs">{activePlan.rejected_reason}</span>
              {activePlan.rejected_by && (
                <span className="text-rose-600 text-xs shrink-0 font-medium">
                  (โดย {activePlan.rejected_by_name || activePlan.rejected_by})
                </span>
              )}
            </div>
          ) : activePlan ? (
            <div className="inline-flex items-center gap-2 text-slate-600 text-sm">
              <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
              <span className="font-bold text-slate-800">ขั้นตอนถัดไป:</span>
              <span className="text-slate-600">{getNextStepText(activePlan, thresholds)}</span>
            </div>
          ) : (
            <span className="text-slate-400 text-xs">เลือกสถานะหรือตัวกรองเพื่อค้นหาแผน</span>
          )}
        </div>
      </div>

      {/* แถวที่ 3: สรุปภาพรวมเครื่องมือในขอบเขตและเป้าหมายตามแผน (Dynamic Summary Metrics) */}
      {activePlan && (
        <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700">
              <span className="text-slate-500 font-medium">เครื่องมือในขอบเขต:</span>
              <strong className="text-slate-900 font-bold font-mono">{summaryMetrics.inScopeCount}</strong>
              <span className="text-slate-500">เครื่อง</span>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800">
              <span className="text-indigo-600 font-medium">มีแผนแล้ว:</span>
              <strong className="text-indigo-950 font-bold font-mono">{summaryMetrics.plannedCount}</strong>
              <span className="text-indigo-600">เครื่อง</span>
            </div>

            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
              summaryMetrics.unplannedCount === 0
                ? 'bg-slate-50 border-slate-200 text-slate-600'
                : summaryMetrics.unplannedWithoutReasonCount > 0
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}>
              <span className="font-medium">ยังไม่มีแผน:</span>
              <strong className="font-bold font-mono">{summaryMetrics.unplannedCount}</strong>
              <span>เครื่อง</span>
              {summaryMetrics.unplannedWithoutReasonCount > 0 ? (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-700 ml-1">
                  (รอระบุเหตุผล {summaryMetrics.unplannedWithoutReasonCount})
                </span>
              ) : summaryMetrics.unplannedCount > 0 ? (
                <span className="text-emerald-700 font-semibold ml-1">(ระบุเหตุผลครบแล้ว)</span>
              ) : null}
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
              <span className="text-emerald-600 font-medium">รอบทวนสอบรวม:</span>
              <strong className="text-emerald-950 font-bold font-mono">{summaryMetrics.totalCyclesCount}</strong>
              <span className="text-emerald-600">รอบ</span>
            </div>
          </div>

          {canEditPlan && summaryMetrics.unplannedWithoutReasonCount > 0 && onOpenJustificationModal && (
            <button
              type="button"
              onClick={onOpenJustificationModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <AlertTriangle size={13} />
              <span>ระบุเหตุผลที่ไม่วางแผน ({summaryMetrics.unplannedWithoutReasonCount})</span>
            </button>
          )}
        </div>
      )}

      {/* กล่องขยาย: รายละเอียดผู้เกี่ยวข้องในการอนุมัติ 3 ขั้นตอน */}
      {detailOpen && activePlan && (
        <div className="pt-2.5 border-t border-slate-100 bg-slate-50/70 p-3 rounded-xl border border-slate-200/60 grid grid-cols-1 md:grid-cols-3 gap-2">
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
      )}

      {/* กล่องขยาย: ข้อกำหนดการใช้แผน */}
      {guideOpen && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-sm text-slate-700 space-y-2">
          <div className="font-bold text-slate-800 text-sm">ข้อกำหนดการใช้แผน (FM-QC-46)</div>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-start gap-2">
              <CheckCircle2 size={15} className="text-indigo-600 shrink-0 mt-0.5" />
              <span>เดือนที่วางแผนไว้ไม่ใช่หลักฐานว่าทำเสร็จ ผลจริงจะขึ้นเมื่อตรวจรับใบสั่งงานเรียบร้อยแล้ว</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={15} className="text-indigo-600 shrink-0 mt-0.5" />
              <span>เครื่องมือแบบกลุ่มต้องเลือกรหัสเครื่องมือรายตัวก่อนออกใบสั่งงาน</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 size={15} className="text-indigo-600 shrink-0 mt-0.5" />
              <span>วันครบกำหนดคำนวณอัตโนมัติจากเดือนที่วางแผน ตามกติกาที่ตั้งค่าไว้ในแผน</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default AnnualPlanWorkspaceHeader;
