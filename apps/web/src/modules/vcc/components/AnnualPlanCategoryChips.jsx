import React, { useMemo } from 'react';
import { Layers } from 'lucide-react';

/**
 * AnnualPlanCategoryChips
 * Clean & Minimal Category-Based Overview & Compact Filters
 * - Displays horizontal filter chips with instrument count, planned count, and completed count.
 * - Separates instrument units from verification cycle counts to avoid double counting.
 */
export const AnnualPlanCategoryChips = ({
  planItems = [],
  workOrders = [],
  selectedCategory = '',
  onSelectCategory
}) => {
  // 1. Identify calibratable instruments (filters out logical group containers)
  const calibratableItems = useMemo(() => {
    return planItems.filter((i) => {
      // In historical approved plans, if a group item was planned and has no children in plan, keep it as calibratable
      if (Number(i.is_group) === 1 && (i.group_nature === 'LOGICAL_GROUP' || !i.group_nature)) {
        const hasChildrenInPlan = planItems.some(
          (c) => (c.parent_id === i.asset_id || c.parent_id === i.id) && Number(c.is_group) === 0
        );
        if (hasChildrenInPlan) return false; // Child instruments represent the real units
      }
      return true;
    });
  }, [planItems]);

  // 2. Compute category-level counts
  const categoryStats = useMemo(() => {
    const statsMap = new Map();

    for (const item of calibratableItems) {
      const cat = item.asset_type || 'ไม่ระบุประเภท';
      if (!statsMap.has(cat)) {
        statsMap.set(cat, {
          name: cat,
          totalInstruments: 0,
          plannedInstruments: 0,
          completedInstruments: 0,
          plannedCycles: 0,
          completedCycles: 0
        });
      }
      const st = statsMap.get(cat);
      st.totalInstruments += 1;

      const plannedMonths = Array.isArray(item.planned_months) ? item.planned_months : [];
      if (plannedMonths.length > 0) {
        st.plannedInstruments += 1;
        st.plannedCycles += plannedMonths.length;
      }

      // Check completed work orders for this item
      const itemWos = (workOrders || []).filter(
        (w) => (w.plan_item_id === item.id || w.asset_id === item.asset_id) &&
               w.status === 'CLOSED' &&
               w.result_status === 'PASS'
      );
      const uniquePassMonths = new Set(itemWos.map((w) => Number(w.planned_month)));
      st.completedCycles += uniquePassMonths.size;

      if (plannedMonths.length > 0 && plannedMonths.every((m) => uniquePassMonths.has(m))) {
        st.completedInstruments += 1;
      }
    }

    return Array.from(statsMap.values()).sort((a, b) => b.totalInstruments - a.totalInstruments);
  }, [calibratableItems, workOrders]);

  // 3. Compute overall totals
  const overallTotals = useMemo(() => {
    let totalInstruments = 0;
    let plannedInstruments = 0;
    let completedInstruments = 0;
    let totalPlannedCycles = 0;
    let totalCompletedCycles = 0;

    for (const st of categoryStats) {
      totalInstruments += st.totalInstruments;
      plannedInstruments += st.plannedInstruments;
      completedInstruments += st.completedInstruments;
      totalPlannedCycles += st.plannedCycles;
      totalCompletedCycles += st.completedCycles;
    }

    const pendingCycles = Math.max(0, totalPlannedCycles - totalCompletedCycles);

    return {
      totalInstruments,
      plannedInstruments,
      completedInstruments,
      totalPlannedCycles,
      totalCompletedCycles,
      pendingCycles
    };
  }, [categoryStats]);

  if (calibratableItems.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-2xs space-y-2.5">
      {/* Top: Compact Metrics Strip (Instrument Count separated from Cycle Count) */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-100 pb-2.5 px-1">
        <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-slate-600">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span>เครื่องมือในขอบเขต:</span>
            <strong className="text-slate-900 font-bold">{overallTotals.totalInstruments}</strong> เครื่อง
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <span>มีแผนแล้ว:</span>
            <strong className="text-indigo-700 font-bold">{overallTotals.plannedInstruments}</strong> เครื่อง
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>ดำเนินการเสร็จสิ้น:</span>
            <strong className="text-emerald-700 font-bold">{overallTotals.completedInstruments}</strong> เครื่อง
          </span>
        </div>

        {/* Cycle Count Distinction */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] text-slate-500">
          <span className="px-2 py-0.5 rounded-md bg-slate-100 font-medium">
            รอบตามแผน: <strong className="text-slate-800">{overallTotals.totalPlannedCycles}</strong> รอบ
          </span>
          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-medium border border-emerald-100">
            ปิดงานแล้ว: <strong className="font-bold">{overallTotals.totalCompletedCycles}</strong> รอบ
          </span>
          {overallTotals.pendingCycles > 0 && (
            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-medium border border-amber-100">
              ค้างดำเนินการ: <strong className="font-bold">{overallTotals.pendingCycles}</strong> รอบ
            </span>
          )}
        </div>
      </div>

      {/* Bottom: Clean & Minimal Horizontal Category Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
        {/* All Categories Chip */}
        <button
          type="button"
          onClick={() => onSelectCategory && onSelectCategory('')}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs transition-colors cursor-pointer ${
            !selectedCategory
              ? 'bg-indigo-50 border-indigo-300 text-indigo-950 font-bold shadow-2xs'
              : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Layers size={13} className={!selectedCategory ? 'text-indigo-600' : 'text-slate-400'} />
          <span>ทุกประเภท</span>
          <span
            className={`px-1.5 py-0.2 rounded-md text-[11px] font-mono ${
              !selectedCategory ? 'bg-indigo-200/60 text-indigo-900' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {overallTotals.totalInstruments}
          </span>
        </button>

        {/* Individual Category Chips */}
        {categoryStats.map((st) => {
          const isSelected = selectedCategory === st.name;
          return (
            <button
              key={st.name}
              type="button"
              onClick={() => onSelectCategory && onSelectCategory(isSelected ? '' : st.name)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-950 font-bold shadow-2xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span>{st.name}</span>
              <span
                className={`px-1.5 py-0.2 rounded-md text-[11px] font-mono ${
                  isSelected ? 'bg-indigo-200/60 text-indigo-900' : 'bg-slate-100 text-slate-600'
                }`}
                title={`เครื่องมือ ${st.totalInstruments} · มีแผน ${st.plannedInstruments} · ตรวจเสร็จ ${st.completedInstruments}`}
              >
                {st.totalInstruments}
              </span>
              {st.completedInstruments > 0 && (
                <span className="text-[10px] text-emerald-600 font-bold">
                  ✓{st.completedInstruments}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AnnualPlanCategoryChips;

