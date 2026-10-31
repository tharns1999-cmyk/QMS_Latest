import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  MoreHorizontal,
  Plus,
  History,
  Edit3,
  BookOpen,
  SlidersHorizontal,
  CheckCircle2,
  Send,
  ShieldCheck,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Users
} from 'lucide-react';
import { PLAN_STATUS_OPTIONS, getPlanStatusLabel, getDueDateRuleLabel } from '../utils/planLabels';
import AnnualPlanApprovalChain from './AnnualPlanApprovalChain';

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
      return 'แก้ไขตามเหตุผลที่ส่งกลับ แล้วกดปุ่ม "ส่งทบทวนอีกครั้ง"';
    case 'PENDING_REVIEW': {
      const revName = plan.assigned_reviewer_name;
      return revName
        ? `รอผู้ทบทวน: ${revName} (ดำเนินการผ่านเมนู "งานที่ต้องดำเนินการ")`
        : `รอผู้ทบทวน (ระดับ L${thresholds.required_reviewer_level || 4} ขึ้นไป · ดำเนินการผ่านเมนู "งานที่ต้องดำเนินการ")`;
    }
    case 'PENDING_APPROVAL': {
      const appName = plan.assigned_approver_name;
      return appName
        ? `รอผู้อนุมัติ: ${appName} (ดำเนินการผ่านเมนู "งานที่ต้องดำเนินการ")`
        : `รอผู้อนุมัติ (ระดับ L${thresholds.required_approver_level || 5} ขึ้นไป · ดำเนินการผ่านเมนู "งานที่ต้องดำเนินการ")`;
    }
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

/**
 * Format plan title concisely for clean Enterprise UI
 */
const getShortPlanTitle = (plan) => {
  if (!plan) return 'แผนการทวนสอบประจำปี';
  if (plan.plan_year) {
    return `แผนการทวนสอบประจำปี ${plan.plan_year}`;
  }
  if (plan.title) {
    return plan.title.replace(/^\[ข้อมูลทดสอบ\]\s*/, '').trim();
  }
  return 'แผนการทวนสอบประจำปี';
};

/**
 * Compact Executive Planning Header (FM-QC-46)
 * ออกแบบตามแนวคิด 2-Tier Compact Planning Header สไตล์ Enterprise SaaS
 * - Tier 1: Primary Identity & Context (ซ้าย) + Plan Switcher & Actions (ขวา)
 * - Tier 2: 4 Inline Metrics (ซ้าย) + Contextual Workflow Guidance (ขวา)
 * - Collapsible Drawers: สายการอนุมัติ 3 ขั้นตอน & ข้อกำหนดการใช้แผน
 */
export const AnnualPlanWorkspaceHeader = ({
  statusTab,
  setStatusTab,
  filterYear: _filterYear,
  setFilterYear: _setFilterYear,
  availableYears: _availableYears = [],
  filterDept: _filterDept,
  setFilterDept: _setFilterDept,
  activeDepartments: _activeDepartments = [],
  plans = [],
  availablePlans = [],
  selectedPlanId,
  onSelectPlan,
  activePlan,
  planItems = [],
  canEditPlan = false,
  thresholds = {},
  onSubmitPlan,
  onOpenSettings,
  onOpenCreatePlan,
  onOpenEditPlan,
  onOpenHistory,
  onOpenJustificationModal
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const menuRef = useDismiss(menuOpen, () => setMenuOpen(false));

  // Support both `plans` and `availablePlans` prop names
  const effectivePlans = plans.length > 0 ? plans : availablePlans;

  // Compute de-duplicated metrics for accuracy (Prevents double-counting groups and children)
  const summaryMetrics = useMemo(() => {
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

    // 2. Groups and their children (De-duplicated counting)
    for (const grp of groupItems) {
      const grpCycles = (grp.planned_months || []).length;
      const children = planItems.filter((c) => c.parent_id === grp.asset_id || c.parent_id === grp.id);

      if (grpCycles > 0) {
        inScopeCount += 1;
        plannedCount += 1;
        totalCyclesCount += grpCycles;
      } else if (children.length > 0) {
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
    'w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer';

  return (
    <div
      data-testid="annual-plan-workspace-header"
      className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-3.5 sm:p-4 space-y-2.5"
    >
      {/* ─────────────────────────────────────────────────────────────
          TIER 1: Primary Identity & Context (ซ้าย) + Plan Switcher & Actions (ขวา)
          ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
        {/* ฝั่งซ้าย: ชื่อแผนแบบสั้น + รหัสเอกสาร + แผนก + สถานะ + กติกาวันครบกำหนด */}
        <div className="min-w-0">
          {activePlan ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  className="text-sm sm:text-base font-bold text-slate-900 tracking-tight whitespace-nowrap"
                  title={activePlan.title}
                >
                  {getShortPlanTitle(activePlan)}
                </h2>

                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${getStatusBadgeStyle(
                    activePlan.status
                  )}`}
                >
                  <StatusIcon status={activePlan.status} />
                  <span>สถานะ: {getPlanStatusLabel(activePlan.status)}</span>
                </span>
              </div>

              {/* Inline Metadata Tags */}
              <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600">
                <span className="font-mono font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/80 shadow-2xs">
                  {activePlan.document_code} Rev.{activePlan.revision}
                </span>

                <span className="font-semibold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/60">
                  {activePlan.department_name_th
                    ? `${activePlan.department_name_th} (${activePlan.department})`
                    : `แผนก ${activePlan.department}`}
                </span>

                {getDueDateRuleLabel(activePlan.due_date_rule) && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-500 font-medium">{getDueDateRuleLabel(activePlan.due_date_rule)}</span>
                  </>
                )}

                {activePlan.status === 'PENDING_REVIEW' && activePlan.assigned_reviewer_name && (
                  <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/80 font-medium">
                    ผู้ทบทวน: {activePlan.assigned_reviewer_name}
                  </span>
                )}

                {activePlan.status === 'PENDING_APPROVAL' && activePlan.assigned_approver_name && (
                  <span className="text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200/80 font-medium">
                    ผู้อนุมัติ: {activePlan.assigned_approver_name}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-base font-bold text-slate-700">แผนการทวนสอบเครื่องมือประจำปี</h2>
              <p className="text-xs text-slate-400 mt-0.5">ยังไม่ได้เลือกแผน หรือไม่มีแผนในตัวกรองนี้</p>
            </div>
          )}
        </div>

        {/* ฝั่งขวา: เปลี่ยนแผน + กรองสถานะ + Primary CTA + Secondary Actions */}
        <div className="flex items-center gap-1.5 flex-wrap shrink-0 justify-start xl:justify-end">
          {/* Plan Switcher Dropdown */}
          <div className="flex items-center gap-1 text-xs">
            <select
              aria-label="เลือกแผนประจำปี"
              value={selectedPlanId || ''}
              onChange={(e) => onSelectPlan && onSelectPlan(e.target.value)}
              disabled={effectivePlans.length === 0}
              className="h-8 px-2.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white text-slate-800 shadow-2xs hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 cursor-pointer w-44 sm:w-48 truncate"
            >
              {effectivePlans.length === 0 && <option value="">ไม่มีแผนในสถานะนี้</option>}
              {effectivePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  ปี {p.plan_year} · แผนก {p.department} · {p.document_code} Rev.{p.revision}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Status Selector */}
          <select
            aria-label="กรองตามสถานะแผน"
            value={statusTab}
            onChange={(e) => setStatusTab && setStatusTab(e.target.value)}
            className="h-8 px-2 rounded-lg border border-slate-300 text-xs font-semibold bg-slate-50 hover:bg-white text-slate-700 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
          >
            {PLAN_STATUS_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                สถานะ: {s.label}
              </option>
            ))}
          </select>

          {/* Primary Action CTA (Planning Only: Submit or Resubmit) */}
          {activePlan && canEditPlan && activePlan.status === 'DRAFT' && onSubmitPlan && (
            <button
              type="button"
              onClick={onSubmitPlan}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
            >
              <Send size={12} />
              <span>ส่งทบทวนแผน</span>
            </button>
          )}

          {activePlan && canEditPlan && activePlan.status === 'REJECTED' && onSubmitPlan && (
            <button
              type="button"
              onClick={onSubmitPlan}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
            >
              <Send size={12} />
              <span>ส่งทบทวนอีกครั้ง</span>
            </button>
          )}

          {/* Secondary Action: สร้างแผนใหม่ */}
          <button
            type="button"
            onClick={onOpenCreatePlan}
            title="สร้างแผนการทวนสอบเครื่องมือประจำปีใหม่"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <Plus size={13} className="text-slate-500" />
            <span className="hidden sm:inline">สร้างแผนใหม่</span>
          </button>

          {/* ผู้เกี่ยวข้อง (Approval Chain Toggle) */}
          {activePlan && (
            <button
              type="button"
              aria-expanded={detailOpen}
              onClick={() => setDetailOpen((v) => !v)}
              className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border text-xs font-medium shadow-2xs transition-colors cursor-pointer ${
                detailOpen
                  ? 'border-indigo-300 bg-indigo-50/70 text-indigo-700'
                  : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              <Users size={13} className={detailOpen ? 'text-indigo-600' : 'text-slate-500'} />
              <span>ผู้เกี่ยวข้อง</span>
              {detailOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}

          {/* เมนูเพิ่มเติม (Overflow Menu ...) */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="เมนูเพิ่มเติมของแผน"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs cursor-pointer"
            >
              <MoreHorizontal size={15} />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1.5 z-40 w-56 bg-white rounded-xl border border-slate-200 shadow-lg py-1.5 text-xs"
              >
                {canEditPlan && activePlan && onOpenEditPlan && (
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemClass}
                    onClick={runMenu(() => onOpenEditPlan(activePlan))}
                  >
                    <Edit3 size={14} className="text-slate-500" />
                    <span>แก้ไขหัวแผน</span>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className={menuItemClass}
                  onClick={runMenu(onOpenCreatePlan)}
                >
                  <Plus size={14} className="text-slate-500" />
                  <span>สร้างแผนประจำปีใหม่</span>
                </button>
                {activePlan && onOpenHistory && (
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemClass}
                    onClick={runMenu(onOpenHistory)}
                  >
                    <History size={14} className="text-slate-500" />
                    <span>ประวัติการอนุมัติ</span>
                  </button>
                )}
                {onOpenSettings && (
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemClass}
                    onClick={runMenu(onOpenSettings)}
                  >
                    <SlidersHorizontal size={14} className="text-slate-500" />
                    <span>ตั้งค่าแผนและเกณฑ์อนุมัติ</span>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className={menuItemClass}
                  onClick={runMenu(() => setGuideOpen((v) => !v))}
                >
                  <BookOpen size={14} className="text-indigo-600" />
                  <span>{guideOpen ? 'ซ่อนข้อกำหนดการใช้แผน' : 'ข้อกำหนดการใช้แผน'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TIER 2: 4 Inline Metrics (ซ้าย) + Contextual Workflow Guidance (ขวา)
          ───────────────────────────────────────────────────────────── */}
      {activePlan && (
        <div className="pt-2 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
          {/* ฝั่งซ้าย: 4 Inline Metrics แบบกระชับ สะอาดตา */}
          <div className="flex items-center gap-2.5 flex-wrap text-slate-600">
            <div className="inline-flex items-center gap-1.5">
              <span className="text-slate-500">เครื่องมือในขอบเขต:</span>
              <strong className="text-slate-900 font-bold font-mono text-xs">{summaryMetrics.inScopeCount}</strong>
              <span className="text-slate-400">เครื่อง</span>
            </div>

            <span className="text-slate-300">·</span>

            <div className="inline-flex items-center gap-1.5">
              <span className="text-slate-500">มีแผนแล้ว:</span>
              <strong className="text-indigo-700 font-bold font-mono text-xs">{summaryMetrics.plannedCount}</strong>
              <span className="text-slate-400">เครื่อง</span>
            </div>

            <span className="text-slate-300">·</span>

            <div className="inline-flex items-center gap-1.5">
              <span className="text-slate-500">ยังไม่มีแผน:</span>
              <strong
                className={`font-bold font-mono text-xs ${
                  summaryMetrics.unplannedCount > 0
                    ? summaryMetrics.unplannedWithoutReasonCount > 0
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                    : 'text-slate-900'
                }`}
              >
                {summaryMetrics.unplannedCount}
              </strong>
              <span className="text-slate-400">เครื่อง</span>
              {summaryMetrics.unplannedWithoutReasonCount > 0 ? (
                <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                  (รอระบุเหตุผล {summaryMetrics.unplannedWithoutReasonCount})
                  {canEditPlan && onOpenJustificationModal && (
                    <button
                      type="button"
                      onClick={onOpenJustificationModal}
                      className="underline hover:text-amber-800 font-semibold cursor-pointer ml-0.5"
                    >
                      ระบุเหตุผล
                    </button>
                  )}
                </span>
              ) : summaryMetrics.unplannedCount > 0 ? (
                <span className="text-emerald-600 font-medium">(ระบุครบแล้ว)</span>
              ) : null}
            </div>

            <span className="text-slate-300">·</span>

            <div className="inline-flex items-center gap-1.5">
              <span className="text-slate-500">รอบทวนสอบรวม:</span>
              <strong className="text-emerald-700 font-bold font-mono text-xs">{summaryMetrics.totalCyclesCount}</strong>
              <span className="text-slate-400">รอบ</span>
            </div>
          </div>

          {/* ฝั่งขวา: คำแนะนำขั้นตอนถัดไป */}
          <div className="shrink-0 flex items-center justify-start md:justify-end">
            {activePlan ? (
              <div className="inline-flex items-center gap-1.5 text-slate-600 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />
                <span className="font-semibold text-slate-800">ขั้นตอนถัดไป:</span>
                <span className="text-slate-600">{getNextStepText(activePlan, thresholds)}</span>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          RETURN FOR REVISION CALLOUT: แสดงเหตุผลการส่งกลับแบบเต็ม ไม่ตัดข้อความ
          ───────────────────────────────────────────────────────────── */}
      {activePlan?.status === 'REJECTED' && activePlan?.rejected_reason && (
        <div
          role="status"
          data-testid="plan-rejected-reason-banner"
          className="mt-2 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-1 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-bold text-rose-900">
              <AlertTriangle size={14} className="text-rose-600 shrink-0" />
              <span>ส่งกลับแก้ไข — กรุณาปรับปรุงรายการในตารางแล้วกดปุ่ม &ldquo;ส่งทบทวนอีกครั้ง&rdquo;</span>
            </div>
            {(activePlan.rejected_by_name || activePlan.rejected_by) && (
              <span className="text-rose-700 font-medium text-[11px]">
                ผู้ส่งกลับ: {activePlan.rejected_by_name || activePlan.rejected_by}
                {activePlan.rejected_at ? ` · ${formatThaiDateTime(activePlan.rejected_at)}` : ''}
              </span>
            )}
          </div>
          <div className="pl-5 text-rose-800 font-medium whitespace-pre-wrap break-words leading-relaxed">
            เหตุผลที่ส่งกลับ: {activePlan.rejected_reason}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          COLLAPSIBLE DRAWERS: สายการอนุมัติ & ข้อกำหนดการใช้แผน
          ───────────────────────────────────────────────────────────── */}
      {detailOpen && activePlan && (
        <AnnualPlanApprovalChain activePlan={activePlan} thresholds={thresholds} />
      )}

      {guideOpen && (
        <div className="mt-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 space-y-1.5">
          <div className="font-bold text-slate-800 text-xs">ข้อกำหนดการใช้แผน (FM-QC-46)</div>
          <ul className="space-y-1 text-xs text-slate-600">
            <li className="flex items-start gap-1.5">
              <CheckCircle2 size={13} className="text-indigo-600 shrink-0 mt-0.5" />
              <span>เดือนที่วางแผนไว้ไม่ใช่หลักฐานว่าทำเสร็จ ผลจริงจะขึ้นเมื่อตรวจรับใบสั่งงานเรียบร้อยแล้ว</span>
            </li>
            <li className="flex items-start gap-1.5">
              <CheckCircle2 size={13} className="text-indigo-600 shrink-0 mt-0.5" />
              <span>เครื่องมือแบบกลุ่มต้องเลือกรหัสเครื่องมือรายตัวก่อนออกใบสั่งงาน</span>
            </li>
            <li className="flex items-start gap-1.5">
              <CheckCircle2 size={13} className="text-indigo-600 shrink-0 mt-0.5" />
              <span>วันครบกำหนดคำนวณอัตโนมัติจากเดือนที่วางแผน ตามกติกาที่ตั้งค่าไว้ในแผน</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default AnnualPlanWorkspaceHeader;
