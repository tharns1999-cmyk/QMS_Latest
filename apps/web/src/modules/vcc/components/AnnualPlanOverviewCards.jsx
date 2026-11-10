import React, { useMemo } from 'react';
import {
  Layers,
  CheckCircle2,
  Clock,
  RotateCw,
  AlertTriangle,
  Plus
} from 'lucide-react';

/**
 * Annual Plan Overview KPI Cards (FM-QC-46)
 * Clean Minimal Luxury Design:
 * - 4 Essential Metrics: In Scope, Scheduled, Unscheduled, Total Planned Rounds
 * - Actionable warning banner when unscheduled instruments lack remarks
 */
export const AnnualPlanOverviewCards = ({
  planItems = [],
  activePlan = null,
  activeAssets = [],
  summaryMetrics: propMetrics,
  unincludedRegisterSummary: propUnincluded,
  canEditPlan = false,
  onOpenJustificationModal,
  onOpenSmartImport
}) => {
  // Compute summary metrics if not passed in as prop
  const computedMetrics = useMemo(() => {
    if (propMetrics) return propMetrics;

    const groupItems = planItems.filter(
      (i) => Number(i.is_group) === 1 && i.group_nature !== 'COMPOSITE_SET'
    );
    const groupAssetIds = new Set(
      groupItems.flatMap((g) => [g.asset_id, g.id]).filter(Boolean)
    );
    const standaloneItems = planItems.filter(
      (i) =>
        (Number(i.is_group || 0) === 0 || i.group_nature === 'COMPOSITE_SET') &&
        (!i.parent_id || !groupAssetIds.has(i.parent_id))
    );

    let inScopeCount = 0;
    let plannedCount = 0;
    let unplannedCount = 0;
    let unplannedWithoutReasonCount = 0;
    let totalCyclesCount = 0;

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
  }, [propMetrics, planItems]);

  const computedUnincluded = useMemo(() => {
    if (propUnincluded) return propUnincluded;
    if (!activePlan || !Array.isArray(activeAssets) || activeAssets.length === 0) {
      return { totalActiveInRegister: 0, unincludedAssets: [] };
    }
    const calibratable = activeAssets.filter(
      (a) => a.status === 'ACTIVE' && (Number(a.is_group || 0) === 0 || a.group_nature === 'COMPOSITE_SET')
    );
    const planAssetIds = new Set(planItems.map((i) => i.asset_id).filter(Boolean));
    const unincludedAssets = calibratable.filter((a) => !planAssetIds.has(a.id));
    return {
      totalActiveInRegister: calibratable.length,
      unincludedAssets
    };
  }, [propUnincluded, activePlan, activeAssets, planItems]);

  const {
    inScopeCount = 0,
    plannedCount = 0,
    unplannedCount = 0,
    unplannedWithoutReasonCount = 0,
    totalCyclesCount = 0
  } = computedMetrics;

  const unincludedCount = computedUnincluded?.unincludedAssets?.length || 0;

  return (
    <div className="space-y-2.5" data-testid="annual-plan-overview-cards">
      {/* 4 Clean Minimal KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* Card 1: In Scope */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 sm:p-3.5 shadow-2xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block truncate">
              เครื่องมือในขอบเขต
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xl sm:text-2xl font-bold font-mono text-slate-900">
                {inScopeCount}
              </span>
              <span className="text-xs text-slate-400 font-medium">เครื่อง</span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
            <Layers size={16} />
          </div>
        </div>

        {/* Card 2: Planned */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 sm:p-3.5 shadow-2xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block truncate">
              มีแผนทวนสอบแล้ว
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xl sm:text-2xl font-bold font-mono text-indigo-600">
                {plannedCount}
              </span>
              <span className="text-xs text-slate-400 font-medium">เครื่อง</span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <CheckCircle2 size={16} />
          </div>
        </div>

        {/* Card 3: Unplanned */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 sm:p-3.5 shadow-2xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block truncate">
              ยังไม่ได้วางแผน
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span
                className={`text-xl sm:text-2xl font-bold font-mono ${
                  unplannedCount > 0
                    ? unplannedWithoutReasonCount > 0
                      ? 'text-amber-600'
                      : 'text-emerald-600'
                    : 'text-slate-900'
                }`}
              >
                {unplannedCount}
              </span>
              <span className="text-xs text-slate-400 font-medium">เครื่อง</span>
            </div>
            {unplannedCount > 0 && (
              <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                รอระบุเหตุผล {unplannedWithoutReasonCount} · ไม่วางแผนพร้อมเหตุผล {Math.max(0, unplannedCount - unplannedWithoutReasonCount)}
              </div>
            )}
          </div>
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              unplannedCount > 0 && unplannedWithoutReasonCount > 0
                ? 'bg-amber-50 border border-amber-200 text-amber-700'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            <Clock size={16} />
          </div>
        </div>

        {/* Card 4: Total Cycles */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 sm:p-3.5 shadow-2xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block truncate">
              รอบวางแผนรวม
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-600">
                {totalCyclesCount}
              </span>
              <span className="text-xs text-slate-400 font-medium">รอบ</span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <RotateCw size={16} />
          </div>
        </div>
      </div>

      {/* Actionable Prompt Banner for Unplanned items without justification */}
      {unplannedWithoutReasonCount > 0 && (
        <div
          role="alert"
          data-testid="unplanned-justification-banner"
          className="p-3 sm:p-3.5 rounded-xl bg-amber-50/90 border border-amber-200/90 text-amber-900 text-xs flex flex-wrap items-center justify-between gap-2 shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-600 shrink-0" />
            <span className="font-medium">
              ยังมีเครื่องมืออีก <strong>{unplannedWithoutReasonCount}</strong> รายการที่ยังไม่ได้กำหนดรอบทวนสอบและยังไม่ได้ระบุเหตุผล (ต้องระบุเหตุผลก่อนส่งทบทวนแผน)
            </span>
          </div>
          {canEditPlan && onOpenJustificationModal && (
            <button
              type="button"
              onClick={onOpenJustificationModal}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer shrink-0"
            >
              <span>ระบุเหตุผล</span>
            </button>
          )}
        </div>
      )}

      {/* Unincluded Register Assets Callout */}
      {unincludedCount > 0 && canEditPlan && onOpenSmartImport && (
        <div
          data-testid="unincluded-assets-banner"
          className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200/70 text-slate-600 text-xs flex flex-wrap items-center justify-between gap-2"
        >
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
            <span>
              พบเครื่องมือใช้งานในทะเบียนที่ยังไม่ได้รวมอยู่ในแผนนี้จำนวน <strong>{unincludedCount}</strong> รายการ
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenSmartImport}
            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer text-xs"
          >
            <Plus size={12} />
            <span>เพิ่มเข้าแผนจากทะเบียน</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default AnnualPlanOverviewCards;
