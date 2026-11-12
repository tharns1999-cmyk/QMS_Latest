import React, { useState, useMemo } from 'react';
import {
  CalendarRange,
  ChevronDown,
  ChevronUp,
  MapPin,
  FileText,
  AlertTriangle,
  Info
} from 'lucide-react';
import { computeDueDateForMonth } from '../api/vccPlanApi';
import AnnualPlanSideInspector from './AnnualPlanSideInspector';
import { DigitalRecordModal } from './DigitalRecordModal';

const MONTH_NAMES = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

const QUARTER_DEFINITIONS = [
  {
    key: 'Q1',
    title: 'ไตรมาส 1: มกราคม – มีนาคม',
    months: [1, 2, 3],
    badgeColor: 'text-blue-700 bg-blue-50 border-blue-200'
  },
  {
    key: 'Q2',
    title: 'ไตรมาส 2: เมษายน – มิถุนายน',
    months: [4, 5, 6],
    badgeColor: 'text-emerald-700 bg-emerald-50 border-emerald-200'
  },
  {
    key: 'Q3',
    title: 'ไตรมาส 3: กรกฎาคม – กันยายน',
    months: [7, 8, 9],
    badgeColor: 'text-indigo-700 bg-indigo-50 border-indigo-200'
  },
  {
    key: 'Q4',
    title: 'ไตรมาส 4: ตุลาคม – ธันวาคม',
    months: [10, 11, 12],
    badgeColor: 'text-purple-700 bg-purple-50 border-purple-200'
  }
];

/**
 * Annual Plan Quarterly Grouped View (FM-QC-46)
 * Groups scheduled instruments into 4 collapsible quarter sections:
 * - Q1 (ม.ค. - มี.ค.), Q2 (เม.ย. - มิ.ย.), Q3 (ก.ค. - ก.ย.), Q4 (ต.ค. - ธ.ค.)
 * - Plus an Unscheduled Instruments section
 * - Displays empty state when a quarter has 0 instruments
 */
export const AnnualPlanQuarterlyView = ({
  planItems = [],
  activePlan = null,
  workOrders = [],
  canEditPlan = false,
  onCreateWorkOrder,
  onOpenJustificationModal
}) => {
  const [collapsedQuarters, setCollapsedQuarters] = useState({});
  const [inspectorItem, setInspectorItem] = useState(null);
  const [digitalRecordWo, setDigitalRecordWo] = useState(null);

  const toggleQuarter = (qKey) => {
    setCollapsedQuarters((prev) => ({
      ...prev,
      [qKey]: !prev[qKey]
    }));
  };

  // Group items by quarters
  const { quarterGroups, unscheduledItems } = useMemo(() => {
    const groups = {
      Q1: [],
      Q2: [],
      Q3: [],
      Q4: []
    };
    const unscheduled = [];

    planItems.forEach((item) => {
      const months = item.planned_months || [];
      if (months.length === 0) {
        unscheduled.push(item);
      } else {
        if (months.some((m) => [1, 2, 3].includes(m))) {
          groups.Q1.push(item);
        }
        if (months.some((m) => [4, 5, 6].includes(m))) {
          groups.Q2.push(item);
        }
        if (months.some((m) => [7, 8, 9].includes(m))) {
          groups.Q3.push(item);
        }
        if (months.some((m) => [10, 11, 12].includes(m))) {
          groups.Q4.push(item);
        }
      }
    });

    return { quarterGroups: groups, unscheduledItems: unscheduled };
  }, [planItems]);

  return (
    <div
      data-testid="annual-plan-quarterly-view"
      className="space-y-3 font-sans"
    >
      {/* 4 Quarter Accordion Sections */}
      {QUARTER_DEFINITIONS.map((q) => {
        const items = quarterGroups[q.key] || [];
        const isCollapsed = Boolean(collapsedQuarters[q.key]);

        // Compute total cycles in this quarter
        const totalCyclesInQuarter = items.reduce((acc, item) => {
          const matching = (item.planned_months || []).filter((m) => q.months.includes(m)).length;
          return acc + matching;
        }, 0);

        return (
          <div
            key={q.key}
            className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden"
          >
            {/* Quarter Header */}
            <button
              type="button"
              onClick={() => toggleQuarter(q.key)}
              className="w-full px-4 py-3.5 bg-slate-50/70 hover:bg-slate-100/60 border-b border-slate-200/60 flex items-center justify-between text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5 flex-wrap">
                <CalendarRange size={16} className="text-slate-500" />
                <span className="font-bold text-sm text-slate-800">{q.title}</span>
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${q.badgeColor}`}>
                  {items.length} เครื่อง · {totalCyclesInQuarter} รอบทวนสอบ
                </span>
              </div>

              <div className="flex items-center gap-2 text-slate-400">
                <span className="text-xs font-medium hidden sm:inline">
                  {isCollapsed ? 'แสดงรายการ' : 'ย่อรายการ'}
                </span>
                {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </div>
            </button>

            {/* Quarter Body */}
            {!isCollapsed && (
              <div className="p-3.5 sm:p-4">
                {items.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400 space-y-1">
                    <p>ไม่มีเครื่องมือที่กำหนดสอบเทียบหรือทวนสอบในไตรมาสนี้</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {items.map((item) => {
                      const matchingMonths = (item.planned_months || []).filter((m) =>
                        q.months.includes(m)
                      );

                      return (
                        <div
                          key={`${q.key}-${item.id || item.asset_id}`}
                          className="bg-white rounded-xl border border-slate-200/70 p-3 hover:border-slate-300 transition-colors shadow-2xs space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <button
                                type="button"
                                onClick={() => setInspectorItem(item)}
                                className="font-mono font-bold text-xs text-indigo-900 hover:underline block text-left"
                              >
                                {item.asset_code}
                              </button>
                              <div className="font-semibold text-xs text-slate-800 line-clamp-1 mt-0.5">
                                {item.asset_name}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setInspectorItem(item)}
                              title="ดูรายละเอียด"
                              className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                            >
                              <Info size={13} />
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 flex-wrap">
                            {item.location && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin size={10} className="text-slate-400" />
                                <span>{item.location}</span>
                              </span>
                            )}
                            {item.provider_name && <span>· {item.provider_name}</span>}
                          </div>

                          {/* Planned Month Badges in this Quarter */}
                          <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-1 flex-wrap">
                            <div className="flex items-center gap-1 flex-wrap">
                              {matchingMonths.map((m) => {
                                const due = computeDueDateForMonth(
                                  activePlan?.plan_year || new Date().getFullYear(),
                                  m,
                                  activePlan?.due_date_rule || 'END_OF_MONTH'
                                );
                                return (
                                  <span
                                    key={m}
                                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200/80"
                                    title={`วันครบกำหนด: ${due}`}
                                  >
                                    <span>{MONTH_NAMES[m - 1]}</span>
                                    <span className="text-indigo-400 font-mono">({due})</span>
                                  </span>
                                );
                              })}
                            </div>

                            {/* Work Order Action if Plan is APPROVED */}
                            {activePlan?.status === 'APPROVED' && (
                              <div className="flex items-center gap-1">
                                {matchingMonths.map((m) => (
                                  <button
                                    key={m}
                                    type="button"
                                    onClick={() => onCreateWorkOrder && onCreateWorkOrder(item, m)}
                                    className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded border border-indigo-200 cursor-pointer"
                                  >
                                    <FileText size={10} />
                                    <span>ออกใบงาน {MONTH_NAMES[m - 1]}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Unscheduled Section */}
      {unscheduledItems.length > 0 && (
        <div className="bg-amber-50/50 rounded-2xl border border-amber-200/80 shadow-2xs overflow-hidden">
          <div className="px-4 py-3 bg-amber-50/90 border-b border-amber-200/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-600" />
              <span className="font-bold text-sm text-amber-900">
                เครื่องมือที่ยังไม่ได้วางแผนในไตรมาสใด ๆ ({unscheduledItems.length} เครื่อง)
              </span>
            </div>

            {canEditPlan && onOpenJustificationModal && (
              <button
                type="button"
                onClick={onOpenJustificationModal}
                className="text-xs font-semibold text-amber-800 underline hover:text-amber-950 cursor-pointer"
              >
                ระบุเหตุผลไม่วางแผน
              </button>
            )}
          </div>

          <div className="p-3.5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {unscheduledItems.map((item) => (
              <div
                key={item.id || item.asset_id}
                className="bg-white rounded-xl border border-slate-200/80 p-3 space-y-1.5 shadow-2xs"
              >
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <span className="font-mono font-bold text-xs text-slate-800">
                      {item.asset_code}
                    </span>
                    <div className="font-semibold text-xs text-slate-700 line-clamp-1">
                      {item.asset_name}
                    </div>
                  </div>
                  <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                    รอวางแผน
                  </span>
                </div>

                {item.remarks && (
                  <p className="text-[11px] text-slate-500 italic truncate" title={item.remarks}>
                    เหตุผล: {item.remarks}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Side Inspector Drawer */}
      {inspectorItem && (
        <AnnualPlanSideInspector
          item={inspectorItem}
          activePlan={activePlan}
          workOrders={workOrders}
          onClose={() => setInspectorItem(null)}
          onViewDigitalRecord={(wo) => setDigitalRecordWo(wo)}
        />
      )}

      {/* Digital Record Inspector Modal */}
      {digitalRecordWo && (
        <DigitalRecordModal
          workOrder={digitalRecordWo}
          onClose={() => setDigitalRecordWo(null)}
        />
      )}
    </div>
  );
};

export default AnnualPlanQuarterlyView;
