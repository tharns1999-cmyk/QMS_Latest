import React, { useState, useMemo } from 'react';
import { BarChart2, Table as TableIcon } from 'lucide-react';

const MONTH_LABELS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/**
 * VccPlanActualChart
 * 12-Month Comparative Progress Visualization (Plan vs Actual Closed)
 * Eliminates horizontal scrollbar on Desktop screens while providing high data density.
 */
export default function VccPlanActualChart({ monthlyComparison = [], year = 2026 }) {
  const [viewMode, setViewMode] = useState('chart'); // 'chart' | 'table'

  const { totalPlanned, totalActual, maxVal, completionRate } = useMemo(() => {
    let planned = 0;
    let actual = 0;
    let peak = 1;

    for (const r of monthlyComparison) {
      const p = Number(r.planned) || 0;
      const a = Number(r.actual_closed) || 0;
      planned += p;
      actual += a;
      if (p > peak) peak = p;
      if (a > peak) peak = a;
    }

    const rate = planned > 0 ? Math.round((actual / planned) * 100) : 0;
    return {
      totalPlanned: planned,
      totalActual: actual,
      maxVal: peak,
      completionRate: rate
    };
  }, [monthlyComparison]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 sm:p-6 flex flex-col justify-between">
      <div>
        {/* Header with Title, Totals & View Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <BarChart2 size={16} className="text-indigo-600 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                เปรียบเทียบแผน (Plan) กับปิดงานจริง (Act.) ปี {year}
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              FM-QC-46 เป้าหมายรายเดือน เทียบกับงานที่ตรวจรับเสร็จสิ้น
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* View Mode Toggle */}
            <div className="flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200/60">
              <button
                type="button"
                onClick={() => setViewMode('chart')}
                title="มุมมองกราฟรายเดือน"
                className={`p-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'chart'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <BarChart2 size={13} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                title="มุมมองตารางสรุป"
                className={`p-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <TableIcon size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* Annual KPI Metrics Badges */}
        <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-50/70 border border-slate-200/60 mb-5 text-center">
          <div>
            <span className="text-[11px] font-medium text-slate-500 block">แผนทั้งปี</span>
            <span className="text-base font-bold font-mono text-slate-900">{totalPlanned}</span>
            <span className="text-[10px] text-slate-400 font-sans ml-1">งาน</span>
          </div>
          <div>
            <span className="text-[11px] font-medium text-emerald-700 block">ปิดจริงแล้ว</span>
            <span className="text-base font-bold font-mono text-emerald-700">{totalActual}</span>
            <span className="text-[10px] text-emerald-600 font-sans ml-1">งาน</span>
          </div>
          <div>
            <span className="text-[11px] font-medium text-indigo-700 block">ความคืบหน้า</span>
            <span className="text-base font-bold font-mono text-indigo-700">{completionRate}%</span>
          </div>
        </div>

        {/* Visual Chart Mode (12-Month Comparative Column Grid) */}
        {viewMode === 'chart' ? (
          <div>
            {/* Chart Legends */}
            <div className="flex items-center justify-end gap-3.5 mb-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-indigo-100 border border-indigo-300" />
                <span className="text-slate-600 font-medium text-[11px]">Plan (แผน)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600" />
                <span className="text-slate-600 font-medium text-[11px]">Act. (ปิดแล้ว)</span>
              </div>
            </div>

            {/* 12-Month Columns Container — Guaranteed No Desktop Scrollbar */}
            <div className="relative pt-4 pb-2 px-1 border-b border-slate-200">
              {/* Background Reference Gridlines */}
              <div className="absolute inset-x-0 top-6 bottom-6 flex flex-col justify-between pointer-events-none opacity-40">
                <div className="border-b border-dashed border-slate-200 w-full" />
                <div className="border-b border-dashed border-slate-200 w-full" />
                <div className="border-b border-dashed border-slate-200 w-full" />
              </div>

              {/* Empty Year Notice (when no plan items approved yet) */}
              {totalPlanned === 0 && totalActual === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                  <span className="text-xs text-slate-400 font-medium bg-white/90 backdrop-blur-xs px-3 py-1 rounded-full border border-slate-200/60 shadow-2xs">
                    ยังไม่มีเป้าหมายแผนที่ได้รับการอนุมัติในปี {year}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-12 gap-1 sm:gap-1.5 h-36 sm:h-40 items-end">
                {MONTH_LABELS.map((label, idx) => {
                  const item = monthlyComparison[idx] || { planned: 0, actual_closed: 0 };
                  const p = Number(item.planned) || 0;
                  const a = Number(item.actual_closed) || 0;

                  const pHeightPct = maxVal > 0 && p > 0 ? Math.max(8, Math.round((p / maxVal) * 100)) : 0;
                  const aHeightPct = maxVal > 0 && a > 0 ? Math.max(8, Math.round((a / maxVal) * 100)) : 0;

                  return (
                    <div
                      key={idx}
                      className="flex flex-col items-center h-full justify-end group relative select-none"
                    >
                      {/* Hover Floating Tooltip */}
                      <div className="opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 absolute -top-10 left-1/2 -translate-x-1/2 z-20 bg-slate-900 text-white text-[10px] font-mono px-2 py-1 rounded shadow-lg whitespace-nowrap">
                        {label}: แผน {p} | ปิด {a}
                      </div>

                      {/* Dual Comparative Bars */}
                      <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1 h-full pb-1">
                        {/* Plan Bar */}
                        <div
                          style={{ height: `${pHeightPct}%` }}
                          className={`w-2 sm:w-3 rounded-t-xs transition-all duration-300 ${
                            p > 0
                              ? 'bg-indigo-100 border border-indigo-200/80 group-hover:bg-indigo-200'
                              : 'h-0.5 bg-slate-100'
                          }`}
                        />
                        {/* Actual Closed Bar */}
                        <div
                          style={{ height: `${aHeightPct}%` }}
                          className={`w-2 sm:w-3 rounded-t-xs transition-all duration-300 ${
                            a > 0
                              ? 'bg-emerald-600 group-hover:bg-emerald-500'
                              : 'h-0.5 bg-slate-100'
                          }`}
                        />
                      </div>

                      {/* Value indicator when non-zero */}
                      <div className="text-[9px] font-mono font-semibold text-slate-500 h-3 leading-none">
                        {a > 0 ? a : p > 0 ? p : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Month Labels Bar */}
            <div className="grid grid-cols-12 gap-1 sm:gap-1.5 pt-1.5 px-1 text-center">
              {MONTH_LABELS.map((m, idx) => (
                <div
                  key={idx}
                  className="text-[10px] sm:text-[11px] font-semibold text-slate-600 truncate"
                >
                  {m}
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Table Mode (when toggled for detailed numeric inspection) */
          <div className="overflow-x-auto rounded-xl border border-slate-200/70">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-slate-600 border-b border-slate-200/70 font-semibold text-[11px]">
                  <th className="py-2 px-2 text-left w-20">รายการ</th>
                  {MONTH_LABELS.map((m, idx) => (
                    <th key={idx} className="py-2 px-1 text-center font-semibold">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                <tr className="hover:bg-slate-50/40">
                  <td className="py-2 px-2 font-semibold text-slate-700 font-sans whitespace-nowrap">Plan (แผน)</td>
                  {(monthlyComparison || []).map((row) => (
                    <td key={row.month} className="py-2 px-1 text-center font-medium text-slate-600">
                      {row.planned || '-'}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-slate-50/40">
                  <td className="py-2 px-2 font-semibold text-emerald-700 font-sans whitespace-nowrap">Act. (ปิดแล้ว)</td>
                  {(monthlyComparison || []).map((row) => (
                    <td key={row.month} className="py-2 px-1 text-center font-bold text-emerald-700">
                      {row.actual_closed || '-'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
