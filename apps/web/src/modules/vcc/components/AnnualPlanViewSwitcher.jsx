import React from 'react';
import {
  CalendarRange,
  Table
} from 'lucide-react';

/**
 * Segmented View Switcher for Annual Plan (FM-QC-46)
 * Modes:
 * - MATRIX: ตารางแผน 12 เดือน (Primary / Recommended view - full 12-month calendar grid)
 * - QUARTERLY: มุมมองรายไตรมาส (Quarterly grouped view)
 */
export const AnnualPlanViewSwitcher = ({
  viewMode = 'MATRIX',
  onViewModeChange
}) => {
  const views = [
    {
      id: 'MATRIX',
      label: 'ตารางแผน 12 เดือน',
      badge: 'แนะนำ',
      icon: Table
    },
    {
      id: 'QUARTERLY',
      label: 'มุมมองรายไตรมาส',
      badge: null,
      icon: CalendarRange
    }
  ];

  const currentMode = String(viewMode || 'MATRIX').toUpperCase();

  return (
    <div
      role="group"
      aria-label="รูปแบบมุมมองการวางแผน"
      data-testid="annual-plan-view-switcher"
      className="inline-flex items-center gap-1 p-1 bg-slate-100/90 border border-slate-200/80 rounded-xl text-xs font-semibold shadow-2xs"
    >
      {views.map((v) => {
        const isSelected = currentMode === v.id;
        const Icon = v.icon;

        return (
          <button
            key={v.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onViewModeChange && onViewModeChange(v.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap min-h-[34px] ${
              isSelected
                ? 'bg-white text-indigo-900 shadow-2xs font-bold border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-medium'
            }`}
          >
            <Icon size={14} className={isSelected ? 'text-indigo-600' : 'text-slate-500'} />
            <span>{v.label}</span>
            {v.badge && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-sans ${
                isSelected ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-200 text-slate-600'
              }`}>
                {v.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default AnnualPlanViewSwitcher;
