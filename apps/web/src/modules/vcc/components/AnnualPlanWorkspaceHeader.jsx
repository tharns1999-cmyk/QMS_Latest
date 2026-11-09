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
  Users,
  Filter,
  FilePlus,
  ArrowLeft
} from 'lucide-react';
import { PLAN_STATUS_OPTIONS, getPlanStatusLabel, getDueDateRuleLabel, formatPlanDocCode } from '../utils/planLabels';
import AnnualPlanApprovalChain from './AnnualPlanApprovalChain';
import AnnualPlanProgressStepper from './AnnualPlanProgressStepper';
import { formatVccDateTime, toBuddhistYear } from '../utils/vccDateUtils';

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

const getNextStepText = (plan, thresholds = {}) => {
  if (!plan) return '';
  if (plan.effective_status === 'SUPERSEDED' || (plan.status === 'APPROVED' && Number(plan.is_current) === 0)) {
    return 'ฉบับประวัติศาสตร์ที่ถูกแทนที่แล้ว (ห้ามแก้ไข)';
  }
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
      const at = formatVccDateTime(plan.approved_at);
      return `พร้อมออกใบสั่งงาน${by ? ` · อนุมัติโดย ${by}` : ''}${at && at !== '-' ? ` · ${at}` : ''}`;
    }
    default:
      return '';
  }
};

const getStatusBadgeStyle = (status) => {
  switch (status) {
    case 'SUPERSEDED':
      return 'text-slate-700 bg-slate-100 border-slate-300';
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
    case 'SUPERSEDED':
      return <Clock size={12} className="text-slate-500 shrink-0" />;
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
 * Compact Executive Planning Header (Paperless ISO 9001 Electronic Record)
 * ออกแบบตามแนวคิด Clean Minimal Luxury + Progress Stepper สไตล์ Enterprise SaaS
 * - Tier 1: Primary Identity & Context (ซ้าย) + Plan Switcher, Filter & Actions (ขวา)
 * - Tier 2: Visual Workflow Progress Stepper (4 ขั้นตอน ร่าง -> ทบทวน -> อนุมัติ -> บังคับใช้)
 * - Tier 3: 4 Inline Metrics (ซ้าย) + Contextual Workflow Guidance (ขวา)
 * - Collapsible Drawers: สายการอนุมัติ 3 ขั้นตอน & ข้อกำหนดการใช้แผน
 */
export const AnnualPlanWorkspaceHeader = ({
  onBackToRegister,
  statusTab,
  setStatusTab,
  filterYear: _filterYear,
  setFilterYear: _setFilterYear,
  availableYears: _availableYears = [],
  filterDept,
  setFilterDept,
  activeDepartments = [],
  plans = [],
  availablePlans = [],
  selectedPlanId,
  onSelectPlan,
  activePlan,
  planItems = [],
  activeAssets = [],
  canEditPlan = false,
  thresholds = {},
  onSubmitPlan,
  onOpenRevision,
  onOpenSettings,
  onOpenCreatePlan,
  onOpenEditPlan,
  onOpenHistory,
  onOpenJustificationModal,
  onOpenSmartImport,
  onOpenOfficialPdf
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const menuRef = useDismiss(menuOpen, () => setMenuOpen(false));

  // Support both `plans` and `availablePlans` prop names
  const rawPlans = plans.length > 0 ? plans : availablePlans;
  const effectivePlans = useMemo(() => {
    if (!filterDept) return rawPlans;
    return rawPlans.filter((p) => p.department === filterDept);
  }, [rawPlans, filterDept]);

  // Compute metrics for flat calibratable units (with de-duplication only if legacy group rows exist)
  const summaryMetrics = useMemo(() => {
    const groupItems = planItems.filter(
      (i) => Number(i.is_group) === 1 && i.group_nature !== 'COMPOSITE_SET'
    );
    const groupAssetIds = new Set(
      groupItems.flatMap((g) => [g.asset_id, g.id]).filter(Boolean)
    );
    const standaloneItems = planItems.filter(
      (i) =>
        (Number(i.is_group) === 0 || i.group_nature === 'COMPOSITE_SET') &&
        (!i.parent_id || !groupAssetIds.has(i.parent_id))
    );

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

  // Compare active calibratable instruments in Register vs. instruments currently in this plan
  const unincludedRegisterSummary = useMemo(() => {
    if (!activePlan || !Array.isArray(activeAssets) || activeAssets.length === 0) {
      return { totalActiveInRegister: 0, unincludedAssets: [], otherDeptAssets: [], sameDeptMissingAssets: [] };
    }
    const calibratableRegisterAssets = activeAssets.filter(
      (a) => a.status === 'ACTIVE' && (Number(a.is_group) === 0 || a.group_nature === 'COMPOSITE_SET')
    );
    const planAssetIds = new Set(planItems.map((i) => i.asset_id).filter(Boolean));
    const unincludedAssets = calibratableRegisterAssets.filter((a) => !planAssetIds.has(a.id));
    const otherDeptAssets = unincludedAssets.filter((a) => a.department !== activePlan.department);
    const sameDeptMissingAssets = unincludedAssets.filter((a) => a.department === activePlan.department);
    return {
      totalActiveInRegister: calibratableRegisterAssets.length,
      unincludedAssets,
      otherDeptAssets,
      sameDeptMissingAssets
    };
  }, [activePlan, activeAssets, planItems]);

  const runMenu = (fn) => () => {
    setMenuOpen(false);
    if (fn) fn();
  };

  const menuItemClass =
    'w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer';

  const isSuperseded = Boolean(
    activePlan &&
    (activePlan.effective_status === 'SUPERSEDED' || (activePlan.status === 'APPROVED' && Number(activePlan.is_current) === 0))
  );

  return (
    <div
      data-testid="annual-plan-workspace-header"
      className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-3 sm:p-4 space-y-3"
    >
      {/* ─────────────────────────────────────────────────────────────
          PAGE B HEADER: Back to Register + Identity & Actions
          ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* ฝั่งซ้าย: ปุ่มย้อนกลับ + ชื่อแผน + รหัสเอกสาร + แผนก + สถานะ */}
        <div className="min-w-0 space-y-1.5">
          {onBackToRegister && (
            <div>
              <button
                type="button"
                onClick={onBackToRegister}
                data-testid="back-to-register-btn"
                aria-label="กลับหน้ารวมแผนประจำปี"
                className="inline-flex items-center gap-1.5 h-7.5 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
              >
                <ArrowLeft size={13} className="text-slate-500" />
                <span>กลับหน้ารวมแผนประจำปี</span>
              </button>
            </div>
          )}

          {activePlan ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  className="text-sm sm:text-base font-bold text-slate-900 tracking-tight flex items-center gap-1.5 flex-wrap"
                  title={activePlan.title}
                >
                  <span>{getShortPlanTitle(activePlan)}</span>
                  {activePlan.plan_year && (
                    <span className="text-slate-500 font-medium text-xs sm:text-sm font-sans">
                      (พ.ศ. {toBuddhistYear(activePlan.plan_year)})
                    </span>
                  )}
                </h2>

                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border shrink-0 ${
                    isSuperseded
                      ? getStatusBadgeStyle('SUPERSEDED')
                      : getStatusBadgeStyle(activePlan.status)
                  }`}
                >
                  <StatusIcon status={isSuperseded ? 'SUPERSEDED' : activePlan.status} />
                  <span>
                    สถานะ: {isSuperseded ? 'ถูกแทนที่แล้ว (SUPERSEDED)' : getPlanStatusLabel(activePlan.status)}
                  </span>
                </span>
              </div>

              {/* Inline Metadata Tags */}
              <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600">
                <span
                  className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/80 shadow-2xs inline-flex items-center gap-1.5"
                  title={`ฉบับแก้ไขแผนงาน (Plan Revision) Rev.${activePlan.revision}`}
                >
                  <span>{formatPlanDocCode(activePlan)}</span>
                  <span className="text-slate-400">·</span>
                  <span>Rev.{activePlan.revision}</span>
                </span>

                <span
                  className="font-mono text-xs text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/60"
                  title="ฉบับประกาศใช้แบบฟอร์มเอกสาร (Form Template Revision)"
                >
                  Template Rev.{activePlan.form_template_revision || activePlan.template_revision || '01'}
                </span>

                {activePlan.form_issue_date && (
                  <span className="font-mono text-xs text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/60" title="วันที่ประกาศใช้แบบฟอร์ม">
                    ประกาศใช้: {activePlan.form_issue_date}
                  </span>
                )}

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

        {/* ฝั่งขวา: Action Buttons (Primary CTA + Secondary Actions) */}
        <div className="flex items-center gap-2 flex-wrap justify-start lg:justify-end shrink-0">
          {/* Primary Action CTA (Planning Only: Submit or Resubmit) */}
          {activePlan && canEditPlan && activePlan.status === 'DRAFT' && onSubmitPlan && (
            <button
              type="button"
              onClick={onSubmitPlan}
              className="inline-flex items-center gap-1.5 h-8.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              <Send size={13} />
              <span>ส่งทบทวนแผน</span>
            </button>
          )}

          {activePlan && canEditPlan && activePlan.status === 'REJECTED' && onSubmitPlan && (
            <button
              type="button"
              onClick={onSubmitPlan}
              className="inline-flex items-center gap-1.5 h-8.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              <Send size={13} />
              <span>ส่งทบทวนอีกครั้ง</span>
            </button>
          )}

          {/* Primary Action for APPROVED / EFFECTIVE plans: "สร้างฉบับแก้ไข (Revision)" */}
          {activePlan && activePlan.status === 'APPROVED' && !isSuperseded && onOpenRevision && (
            <button
              type="button"
              onClick={onOpenRevision}
              aria-label="สร้างฉบับแก้ไข (Revision)"
              title="สร้างฉบับแก้ไขใหม่ (Revision) สำหรับแผนประจำปีนี้"
              className="inline-flex items-center gap-1.5 h-8.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              <FilePlus size={14} />
              <span>สร้างฉบับแก้ไข (Revise Plan)</span>
            </button>
          )}

          {/* Secondary Action: เปิดดู PDF ทางการ */}
          {activePlan && activePlan.status === 'APPROVED' && onOpenOfficialPdf && (
            <button
              type="button"
              onClick={onOpenOfficialPdf}
              title={isSuperseded ? 'เปิดดูเอกสารทางการ PDF ฉบับเดิมที่ได้รับการอนุมัติ' : 'เปิดดูเอกสารทางการ PDF ที่ได้รับการอนุมัติ'}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border font-semibold text-xs shadow-2xs transition-colors cursor-pointer ${
                isSuperseded
                  ? 'border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700'
                  : 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
              }`}
            >
              <BookOpen size={13} className={isSuperseded ? 'text-slate-600' : 'text-emerald-700'} />
              <span>{isSuperseded ? 'เปิดดู PDF ทางการ (ฉบับเดิม)' : 'เปิดดูเอกสาร PDF ทางการ'}</span>
            </button>
          )}

          {/* Secondary Action: ประวัติการอนุมัติ */}
          {activePlan && onOpenHistory && (
            <button
              type="button"
              onClick={onOpenHistory}
              title="ดูประวัติการอนุมัติและฉบับแก้ไขย้อนหลัง"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <History size={13} className="text-slate-500" />
              <span className="hidden sm:inline">ประวัติการอนุมัติ</span>
            </button>
          )}

          {/* Secondary Action: สร้างแผนใหม่ */}
          <button
            type="button"
            onClick={() => onOpenCreatePlan()}
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
                  onClick={runMenu(() => onOpenCreatePlan())}
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
                {activePlan && activePlan.status === 'APPROVED' && onOpenOfficialPdf && (
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemClass}
                    onClick={runMenu(onOpenOfficialPdf)}
                  >
                    <BookOpen size={14} className="text-emerald-600" />
                    <span>เปิดดูเอกสาร PDF ทางการ</span>
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

        {/* Hidden Accessible Inputs for Screen Readers & Automated Tests */}
        <div className="sr-only">
          <label htmlFor="vcc-annual-plan-select">เลือกแผนประจำปี</label>
          <select
            id="vcc-annual-plan-select"
            aria-label="เลือกแผนประจำปี"
            value={selectedPlanId || ''}
            onChange={(e) => onSelectPlan && onSelectPlan(e.target.value)}
          >
            {effectivePlans.length === 0 && <option value="">ไม่มีแผนในสถานะนี้</option>}
            {effectivePlans.map((p) => {
              const deptName =
                p.department_name_th ||
                activeDepartments.find((d) => d.code === p.department)?.nameTh ||
                p.department;
              return (
                <option key={p.id} value={p.id}>
                  ปี {p.plan_year} · {deptName ? `${deptName} (${p.department})` : `แผนก ${p.department}`} · Rev.{p.revision}
                </option>
              );
            })}
          </select>

          <label htmlFor="vcc-annual-plan-status-filter">กรองตามสถานะแผน</label>
          <select
            id="vcc-annual-plan-status-filter"
            aria-label="กรองตามสถานะแผน"
            value={statusTab}
            onChange={(e) => setStatusTab && setStatusTab(e.target.value)}
          >
            {PLAN_STATUS_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          COMPACT INLINE METRICS & GUIDANCE
          ───────────────────────────────────────────────────────────── */}
      {activePlan && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 bg-slate-50/80 px-3 py-1.5 rounded-xl border border-slate-100">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="inline-flex items-center gap-1.5 flex-wrap">
              <span className="text-slate-500">เครื่องมือในขอบเขต:</span>
              <strong className="text-slate-900 font-bold font-mono text-xs">{summaryMetrics.inScopeCount}</strong>
              <span className="text-slate-400">เครื่อง</span>
              {unincludedRegisterSummary.unincludedAssets.length > 0 && (
                <span
                  data-testid="register-vs-plan-scope-note"
                  className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100/80 border border-slate-200/80 px-2 py-0.5 rounded-md ml-0.5"
                >
                  <span>
                    (จากทะเบียนใช้งานปกติ {unincludedRegisterSummary.totalActiveInRegister} เครื่อง — อยู่นอกแผนนี้{' '}
                    {unincludedRegisterSummary.unincludedAssets.length} เครื่อง:{' '}
                    {unincludedRegisterSummary.unincludedAssets
                      .map((a) =>
                        a.department !== activePlan.department
                          ? `${a.asset_code} สังกัดแผนก ${a.department}`
                          : `${a.asset_code} ยังไม่ได้เพิ่มเข้าแผน`
                      )
                      .join(', ')}
                    )
                  </span>
                  {canEditPlan && onOpenSmartImport && (
                    <button
                      type="button"
                      onClick={onOpenSmartImport}
                      className="text-indigo-700 hover:text-indigo-900 underline font-semibold cursor-pointer ml-1"
                    >
                      + เพิ่มเข้าแผนนี้
                    </button>
                  )}
                </span>
              )}
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
              {summaryMetrics.unplannedCount - summaryMetrics.unplannedWithoutReasonCount > 0 && (
                <span className="text-slate-500">· ไม่วางแผนพร้อมเหตุผล {summaryMetrics.unplannedCount - summaryMetrics.unplannedWithoutReasonCount}</span>
              )}
            </div>

            <span className="text-slate-300">·</span>

            <div className="inline-flex items-center gap-1.5">
              <span className="text-slate-500">รอบทวนสอบรวม:</span>
              <strong className="text-emerald-700 font-bold font-mono text-xs">{summaryMetrics.totalCyclesCount}</strong>
              <span className="text-slate-400">รอบ</span>
            </div>
          </div>

          <div className="shrink-0 flex items-center justify-start md:justify-end">
            <div className="inline-flex items-center gap-1.5 text-slate-600 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />
              <span className="font-semibold text-slate-800">ขั้นตอนถัดไป:</span>
              <span className="text-slate-600">{getNextStepText(activePlan, thresholds)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SUPERSEDED HISTORICAL CALLOUT: ชี้แจงว่าเป็นฉบับประวัติศาสตร์ที่ถูกแทนที่แล้ว
          ───────────────────────────────────────────────────────────── */}
      {isSuperseded && (
        <div
          role="status"
          data-testid="plan-superseded-banner"
          className="p-3 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 text-xs flex flex-wrap items-center justify-between gap-3 shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-slate-600 shrink-0" />
            <div>
              <span className="font-bold">ฉบับประวัติศาสตร์ที่ถูกแทนที่แล้ว (SUPERSEDED):</span>{' '}
              <span>
                แผนฉบับนี้ถูกแทนที่โดยฉบับแก้ไขที่ใหม่กว่า ข้อมูลถูกเก็บรักษาไว้เพื่อการตรวจสอบย้อนหลังตามมาตรฐาน ISO 9001 (ห้ามแก้ไข)
              </span>
            </div>
          </div>
          {effectivePlans.find((p) => Number(p.is_current) === 1) && (
            <button
              type="button"
              onClick={() => onSelectPlan && onSelectPlan(effectivePlans.find((p) => Number(p.is_current) === 1).id)}
              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              สลับไปดูฉบับปัจจุบัน
            </button>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          DRAFT REVISION CONTEXT CALLOUT: ชี้แจงสถานะฉบับแก้ไขที่กำลังจัดทำ
          ───────────────────────────────────────────────────────────── */}
      {Boolean(activePlan && activePlan.parent_plan_id && activePlan.status === 'DRAFT') && (
        <div
          role="status"
          data-testid="plan-draft-revision-banner"
          className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex flex-wrap items-center justify-between gap-3 shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-600 shrink-0" />
            <div>
              <span className="font-bold">
                กำลังจัดทำฉบับแก้ไข Rev.{activePlan.revision} — แผนเดิม Rev.{activePlan.parent_revision || '01'} ยังคงมีผลบังคับใช้
              </span>
              <span className="block sm:inline sm:ml-1 text-amber-800">
                (การแก้ไขในฉบับนี้จะไม่กระทบแผนฉบับเดิม จนกว่าฉบับใหม่นี้จะได้รับการอนุมัติอย่างเป็นทางการ)
              </span>
            </div>
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
          className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-1 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-bold text-rose-900">
              <AlertTriangle size={14} className="text-rose-600 shrink-0" />
              <span>ส่งกลับแก้ไข — กรุณาปรับปรุงรายการในตารางแล้วกดปุ่ม &ldquo;ส่งทบทวนอีกครั้ง&rdquo;</span>
            </div>
            {(activePlan.rejected_by_name || activePlan.rejected_by) && (
              <span className="text-rose-700 font-medium text-xs">
                ผู้ส่งกลับ: {activePlan.rejected_by_name || activePlan.rejected_by}
                {activePlan.rejected_at ? ` · ${formatVccDateTime(activePlan.rejected_at)}` : ''}
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
          <div className="font-bold text-slate-800 text-xs">ข้อกำหนดการใช้แผนการทวนสอบประจำปี</div>
          <ul className="space-y-1 text-xs text-slate-600">
            <li className="flex items-start gap-1.5">
              <CheckCircle2 size={13} className="text-indigo-600 shrink-0 mt-0.5" />
              <span>เดือนที่วางแผนไว้ไม่ใช่หลักฐานว่าทำเสร็จ ผลจริงจะขึ้นเมื่อตรวจรับใบสั่งงานเรียบร้อยแล้ว</span>
            </li>
            <li className="flex items-start gap-1.5">
              <CheckCircle2 size={13} className="text-indigo-600 shrink-0 mt-0.5" />
              <span>เครื่องมือ 1 หน่วยสอบเทียบ (รวมถึงชุดเครื่องมือจริง Composite Set) แสดงเป็น 1 แถวอิสระและออกใบสั่งงานได้โดยตรง</span>
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
