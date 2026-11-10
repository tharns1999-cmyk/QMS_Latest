import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  MoreHorizontal,
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
  Printer,
  FileEdit,
  Plus
} from 'lucide-react';
import { PLAN_STATUS_OPTIONS, getPlanStatusLabel, getDueDateRuleLabel } from '../utils/planLabels';
import AnnualPlanApprovalChain from './AnnualPlanApprovalChain';
import AnnualPlanProgressStepper from './AnnualPlanProgressStepper';
import { resolveDigitalPlanCode } from './AnnualPlansHub';
import { formatVccDateTime, toBuddhistYear } from '../utils/vccDateUtils';
import useStore from '../../../store/useStore';

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

const getStatusBadgeStyle = (status, isSuperseded = false) => {
  if (isSuperseded) {
    return 'text-slate-600 bg-slate-100 border-slate-300';
  }
  switch (status) {
    case 'APPROVED':
      return 'text-emerald-800 bg-emerald-50 border-emerald-300/90';
    case 'PENDING_APPROVAL':
      return 'text-indigo-700 bg-indigo-50 border-indigo-200/80';
    case 'PENDING_REVIEW':
      return 'text-amber-800 bg-amber-50 border-amber-200/80';
    case 'REJECTED':
    case 'RETURNED':
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
    case 'RETURNED':
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
 * 2-Row Compact Enterprise Workspace Header
 * - Row 1: Back to Hub + Title + Digital Code Badge (VCC-AP-[DEPT]-[YEAR]) + Rev.XX + Status Badge + Revision Switcher + [🖨️ พิมพ์ / ส่งออก PDF] + Primary CTA + Overflow Menu (...)
 * - Row 2: Compact Horizontal Inline Approval Stepper (ผู้จัดทำ -> ผู้ทบทวน -> ผู้อนุมัติ -> มีผลบังคับใช้)
 */
export const AnnualPlanWorkspaceHeader = ({
  statusTab,
  setStatusTab,
  filterYear,
  setFilterYear: _setFilterYear,
  availableYears: _availableYears = [],
  filterDept,
  setFilterDept: _setFilterDept,
  activeDepartments = [],
  plans = [],
  planRevisions = [],
  availablePlans = [],
  selectedPlanId,
  onSelectPlan,
  activePlan,
  planItems = [],
  activeAssets = [],
  canEditPlan = false,
  canCreatePlan = true,
  canManageSettings,
  thresholds = {},
  onSubmitPlan,
  onOpenRevision,
  onOpenSettings,
  onOpenCreatePlan,
  onOpenEditPlan,
  onOpenHistory,
  onOpenSmartImport,
  onOpenOfficialPdf,
  onBackToHub,
  onPrintPlan
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const storeUser = useStore((s) => s.currentUser);
  const isAllowedSettings = canManageSettings !== undefined
    ? Boolean(canManageSettings)
    : Boolean(storeUser?.isDcc || storeUser?.isQmr || Number(storeUser?.approval_level ?? storeUser?.approvalLevel ?? 1) >= 6);

  const menuRef = useDismiss(menuOpen, () => setMenuOpen(false));

  // Support both `plans` and `availablePlans` prop names
  const rawPlans = plans.length > 0 ? plans : availablePlans;
  const effectivePlans = useMemo(() => {
    if (!filterDept) return rawPlans;
    return rawPlans.filter((p) => p.department === filterDept);
  }, [rawPlans, filterDept]);

  const samePlanRevisions = useMemo(() => {
    const sourceRevisions = planRevisions.length > 0 ? planRevisions : rawPlans;
    const map = new Map();
    effectivePlans.forEach((p) => {
      if (p && p.id) map.set(p.id, p);
    });
    if (activePlan) {
      sourceRevisions
        .filter(
          (p) =>
            p &&
            p.department === activePlan.department &&
            String(p.plan_year) === String(activePlan.plan_year)
        )
        .forEach((p) => {
          if (p.id) map.set(p.id, p);
        });
      if (activePlan.id && !map.has(activePlan.id)) {
        map.set(activePlan.id, activePlan);
      }
    }
    const list = Array.from(map.values());
    return list.sort((a, b) => {
      if (Number(b.plan_year || 0) !== Number(a.plan_year || 0)) {
        return Number(b.plan_year || 0) - Number(a.plan_year || 0);
      }
      return Number(a.revision || 0) - Number(b.revision || 0);
    });
  }, [rawPlans, planRevisions, activePlan, effectivePlans]);

  // Compare active calibratable instruments in Register vs. instruments currently in this plan
  const unincludedRegisterSummary = useMemo(() => {
    if (!activePlan || !Array.isArray(activeAssets) || activeAssets.length === 0) {
      return { totalActiveInRegister: 0, unincludedAssets: [] };
    }
    const calibratableRegisterAssets = activeAssets.filter(
      (a) => a.status === 'ACTIVE' && (Number(a.is_group) === 0 || a.group_nature === 'COMPOSITE_SET')
    );
    const planAssetIds = new Set(planItems.map((i) => i.asset_id).filter(Boolean));
    const unincludedAssets = calibratableRegisterAssets.filter((a) => !planAssetIds.has(a.id));
    return {
      totalActiveInRegister: calibratableRegisterAssets.length,
      unincludedAssets
    };
  }, [activePlan, activeAssets, planItems]);

  const isSuperseded = Boolean(
    activePlan &&
      (String(activePlan.effective_status || '').toUpperCase() === 'SUPERSEDED' ||
        (activePlan.status === 'APPROVED' && Number(activePlan.is_current ?? 1) === 0))
  );

  const canRequestRevision = Boolean(
    activePlan &&
      activePlan.status === 'APPROVED' &&
      !isSuperseded &&
      onOpenRevision &&
      canCreatePlan !== false
  );

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
          ROW 1: Primary Identity & Badges (Left) + Switcher & Actions (Right)
          ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        {/* Left: Back Button + Plan Title + Digital Code + Rev + Status + Metadata */}
        <div className="min-w-0 space-y-1.5">
          {activePlan ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                {onBackToHub && (
                  <button
                    type="button"
                    onClick={onBackToHub}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer shrink-0"
                  >
                    <span>← กลับหน้ารวมสารบัญแผน</span>
                  </button>
                )}

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

                {/* Digital Plan Code Badge */}
                <span className="font-mono text-xs font-bold text-indigo-800 bg-indigo-50/90 px-2 py-0.5 rounded-md border border-indigo-200/80 shadow-2xs">
                  {resolveDigitalPlanCode(activePlan)}
                </span>

                {/* Revision Badge */}
                <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/90 shadow-2xs">
                  Rev.{activePlan.revision || '01'}
                </span>

                {/* Status Badge */}
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border shrink-0 ${getStatusBadgeStyle(
                    activePlan.status,
                    isSuperseded
                  )}`}
                >
                  <StatusIcon status={activePlan.status} />
                  <span>
                    สถานะ: {getPlanStatusLabel(activePlan.status)}
                    {activePlan.status === 'APPROVED' && !isSuperseded ? ' · มีผลบังคับใช้' : ''}
                  </span>
                </span>

                {isSuperseded && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    SUPERSEDED · ฉบับเก่าถูกแทนที่แล้ว
                  </span>
                )}
              </div>

              {/* Compact Sub-row Metadata */}
              <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600">
                <span className="font-semibold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/60">
                  {activePlan.department_name_th
                    ? `${activePlan.department_name_th} (${activePlan.department})`
                    : `แผนก ${activePlan.department}`}
                </span>

                {activePlan.form_issue_date && (
                  <span
                    className="font-mono text-xs text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/60"
                    title="วันที่ประกาศใช้แบบฟอร์ม"
                  >
                    ประกาศใช้: {activePlan.form_issue_date}
                  </span>
                )}

                {getDueDateRuleLabel(activePlan.due_date_rule) && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-500 font-medium">{getDueDateRuleLabel(activePlan.due_date_rule)}</span>
                  </>
                )}

                {unincludedRegisterSummary.unincludedAssets.length > 0 && (
                  <span
                    data-testid="register-vs-plan-scope-note"
                    className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100/80 border border-slate-200/80 px-2 py-0.5 rounded-md"
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
            </>
          ) : (
            <div className="flex items-center gap-2">
              {onBackToHub && (
                <button
                  type="button"
                  onClick={onBackToHub}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                >
                  <span>← กลับหน้ารวมสารบัญแผน</span>
                </button>
              )}
              <div>
                <h2 className="text-base font-bold text-slate-700">แผนการทวนสอบเครื่องมือประจำปี</h2>
                <p className="text-xs text-slate-400 mt-0.5">ยังไม่ได้เลือกแผน หรือไม่มีแผนในตัวกรองนี้</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Revision Switcher + Single Print/PDF Button + Primary CTA + Overflow Menu (...) */}
        <div className="flex items-center gap-2 flex-wrap justify-start xl:justify-end shrink-0">
          {/* Revision Switcher */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="vcc-annual-plan-select" className="text-xs font-semibold text-slate-500 whitespace-nowrap">
              ฉบับแก้ไข:
            </label>
            <select
              id="vcc-annual-plan-select"
              aria-label="เลือกแผนประจำปี"
              value={selectedPlanId || ''}
              onChange={(e) => onSelectPlan && onSelectPlan(e.target.value)}
              disabled={samePlanRevisions.length === 0}
              className="h-8 px-2.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white text-slate-800 shadow-2xs hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 cursor-pointer max-w-[240px] truncate"
            >
              {samePlanRevisions.length === 0 && <option value="">ไม่มีแผนในสถานะนี้</option>}
              {samePlanRevisions.map((p) => {
                const revSuperseded =
                  String(p.effective_status || '').toUpperCase() === 'SUPERSEDED' ||
                  (p.status === 'APPROVED' && Number(p.is_current ?? 1) === 0);
                const statusSuffix = revSuperseded
                  ? 'SUPERSEDED'
                  : getPlanStatusLabel(p.status);
                const deptName =
                  p.department_name_th ||
                  activeDepartments.find((d) => d.code === p.department)?.name_th;
                const deptLabel = deptName ? `${deptName} (${p.department})` : p.department;
                return (
                  <option key={p.id} value={p.id}>
                    ปี {p.plan_year} · {deptLabel} · Rev.{p.revision || '01'} ({statusSuffix})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Single Unified Print / Export PDF Button */}
          {activePlan && onPrintPlan && (
            <button
              type="button"
              onClick={onPrintPlan}
              title="พิมพ์แบบฟอร์มเอกสารควบคุม (A4 แนวนอน)"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
            >
              <Printer size={13} className="text-slate-600" />
              <span>พิมพ์ / ส่งออก PDF</span>
            </button>
          )}

          {/* Primary Action CTA: Submit / Resubmit / Revise Plan */}
          {activePlan && canEditPlan && activePlan.status === 'DRAFT' && onSubmitPlan && (
            <button
              type="button"
              onClick={onSubmitPlan}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
            >
              <Send size={12} />
              <span>ส่งทบทวนแผน</span>
            </button>
          )}

          {activePlan && canEditPlan && (activePlan.status === 'REJECTED' || activePlan.status === 'RETURNED') && onSubmitPlan && (
            <button
              type="button"
              onClick={onSubmitPlan}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
            >
              <Send size={12} />
              <span>ส่งทบทวนอีกครั้ง</span>
            </button>
          )}

          {canRequestRevision && (
            <button
              type="button"
              onClick={onOpenRevision}
              aria-label="ขอแก้ไขแผน (Revise Plan) / ขอจัดทำฉบับแก้ไข / สร้างฉบับแก้ไข (Revision)"
              title="ขอแก้ไขแผนประจำปี (สร้างฉบับร่าง Rev ถัดไป)"
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
            >
              <FileEdit size={13} />
              <span>ขอแก้ไขแผน (Revise Plan)</span>
            </button>
          )}

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

          {/* Overflow Menu (...) */}
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
                className="absolute right-0 top-full mt-1.5 z-40 w-60 bg-white rounded-xl border border-slate-200 shadow-lg py-1.5 text-xs"
              >
                {activePlan && activePlan.status === 'APPROVED' && onOpenOfficialPdf && (
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemClass}
                    onClick={runMenu(onOpenOfficialPdf)}
                  >
                    <BookOpen size={14} className="text-emerald-600" />
                    <span>เปิดดูเอกสาร PDF ทางการ (R2)</span>
                  </button>
                )}
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
                {canCreatePlan && onOpenCreatePlan && (
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemClass}
                    onClick={runMenu(() => onOpenCreatePlan(filterYear))}
                  >
                    <Plus size={14} className="text-indigo-600" />
                    <span>สร้างแผนประจำปีใหม่</span>
                  </button>
                )}
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
                {onOpenSettings && isAllowedSettings && (
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

      {/* Hidden/accessible status select for backward test compatibility */}
      <select
        aria-label="กรองตามสถานะแผน"
        value={statusTab}
        onChange={(e) => setStatusTab && setStatusTab(e.target.value)}
        className="sr-only"
        tabIndex={-1}
      >
        {PLAN_STATUS_OPTIONS.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>

      {/* ─────────────────────────────────────────────────────────────
          ROW 2: Compact Horizontal Inline Approval Stepper
          ───────────────────────────────────────────────────────────── */}
      {activePlan && (
        <AnnualPlanProgressStepper activePlan={activePlan} thresholds={thresholds} />
      )}

      {/* ─────────────────────────────────────────────────────────────
          RETURN FOR REVISION CALLOUT: แสดงเหตุผลการส่งกลับแบบเต็ม ไม่ตัดข้อความ
          ───────────────────────────────────────────────────────────── */}
      {(activePlan?.status === 'REJECTED' || activePlan?.status === 'RETURNED') && activePlan?.rejected_reason && (
        <div
          role="status"
          data-testid="plan-rejected-reason-banner"
          className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-1 shadow-2xs"
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
        <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 space-y-1.5">
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

