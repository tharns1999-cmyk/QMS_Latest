import React, { useState } from 'react';
import { Building2, AlertTriangle, ShieldAlert, CheckCircle2, Table as TableIcon, LayoutGrid } from 'lucide-react';
import DepartmentBadge from '../../../shared/components/ui/DepartmentBadge';

/**
 * VccDepartmentSummary
 * Compact Visualization for Department Breakdown
 * Balances visual hierarchy with real operational data, eliminating empty tabular whitespace.
 */
export default function VccDepartmentSummary({ departmentBreakdown = [] }) {
  const [viewMode, setViewMode] = useState('visual'); // 'visual' | 'table'

  const totalAssets = departmentBreakdown.reduce((sum, d) => sum + (Number(d.asset_count) || 0), 0);
  const totalWos = departmentBreakdown.reduce((sum, d) => sum + (Number(d.total_work_orders) || 0), 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 sm:p-6 flex flex-col justify-between">
      <div>
        {/* Header with Title and Mode Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-slate-700 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                สรุปสถานะแยกตามแผนกเจ้าของเครื่องมือ
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              แจกแจงจำนวนเครื่องมือและสถานะใบงานตามแผนกรับผิดชอบ
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-[11px] font-medium text-slate-400">
              {departmentBreakdown.length} แผนก · รวม {totalAssets} เครื่องมือ
            </span>

            {/* View Mode Toggle */}
            <div className="flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200/60">
              <button
                type="button"
                onClick={() => setViewMode('visual')}
                title="มุมมองสรุปความคืบหน้า"
                className={`p-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'visual'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <LayoutGrid size={13} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                title="มุมมองตารางรายละเอียด"
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

        {departmentBreakdown.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 font-medium">
            ไม่มีข้อมูลแผนกในระบบ
          </div>
        ) : viewMode === 'visual' ? (
          /* Visual Progress Cards */
          <div className="space-y-3">
            {departmentBreakdown.map((d) => {
              const total = Number(d.total_work_orders) || 0;
              const closed = Number(d.closed_work_orders) || 0;
              const overdue = Number(d.overdue_work_orders) || 0;
              const onHold = Number(d.on_hold_count) || 0;
              const completionPct = total > 0 ? Math.round((closed / total) * 100) : 0;
              const overduePct = total > 0 ? Math.round((overdue / total) * 100) : 0;

              return (
                <div
                  key={d.department}
                  className="p-3.5 rounded-xl border border-slate-200/70 bg-slate-50/50 hover:bg-slate-50 transition-colors space-y-2.5"
                >
                  {/* Top Bar: Dept Badge + Asset Count + WO Ratio */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <DepartmentBadge department={d.department} />
                      <span className="text-xs text-slate-500 font-medium font-mono">
                        {d.asset_count} เครื่องมือ
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-slate-900">
                        {closed} <span className="font-normal text-slate-400 font-sans">/ {total} งาน</span>
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-700 ml-1.5 font-sans">
                        ({completionPct}%)
                      </span>
                    </div>
                  </div>

                  {/* Segmented Progress Bar */}
                  <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden flex">
                    <div
                      style={{ width: `${completionPct}%` }}
                      className="bg-emerald-500 h-full transition-all duration-300"
                      title={`ปิดแล้ว: ${closed} งาน (${completionPct}%)`}
                    />
                    <div
                      style={{ width: `${overduePct}%` }}
                      className="bg-amber-500 h-full transition-all duration-300"
                      title={`เลยกำหนด: ${overdue} งาน (${overduePct}%)`}
                    />
                  </div>

                  {/* Bottom Operational Badges */}
                  <div className="flex items-center justify-between text-[11px] pt-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      {overdue > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold bg-amber-100 text-amber-800">
                          <AlertTriangle size={11} className="shrink-0" />
                          <span>{overdue} เลยกำหนด</span>
                        </span>
                      ) : null}

                      {onHold > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold bg-rose-100 text-rose-800">
                          <ShieldAlert size={11} className="shrink-0" />
                          <span>{onHold} ระงับใช้</span>
                        </span>
                      ) : null}

                      {overdue === 0 && onHold === 0 && (
                        <span className="inline-flex items-center gap-1 text-slate-400 font-medium">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          <span>ไม่มีงานค้างเกินกำหนด</span>
                        </span>
                      )}
                    </div>

                    <span className="text-slate-400 font-mono text-[10px]">
                      คิดเป็น {totalWos > 0 ? Math.round((total / totalWos) * 100) : 0}% ของงานทั้งระบบ
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table Mode */
          <div className="overflow-x-auto rounded-xl border border-slate-200/70">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-slate-600 border-b border-slate-200/70 font-semibold text-[11px]">
                  <th className="py-2.5 px-3 text-left">แผนก</th>
                  <th className="py-2.5 px-2 text-right">เครื่องมือ</th>
                  <th className="py-2.5 px-2 text-right">ใบงานทั้งหมด</th>
                  <th className="py-2.5 px-2 text-right">ปิดแล้ว</th>
                  <th className="py-2.5 px-2 text-right">เลยกำหนด</th>
                  <th className="py-2.5 px-2 text-right">ระงับใช้</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-xs">
                {departmentBreakdown.map((d) => (
                  <tr key={d.department} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-slate-900 font-sans">
                      <DepartmentBadge department={d.department} />
                    </td>
                    <td className="py-2.5 px-2 text-right font-medium text-slate-700">{d.asset_count}</td>
                    <td className="py-2.5 px-2 text-right font-medium text-slate-700">{d.total_work_orders}</td>
                    <td className="py-2.5 px-2 text-right text-emerald-700 font-bold">{d.closed_work_orders}</td>
                    <td className="py-2.5 px-2 text-right text-amber-700 font-bold">{d.overdue_work_orders}</td>
                    <td className="py-2.5 px-2 text-right text-rose-600 font-bold">{d.on_hold_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
