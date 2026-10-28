import React, { useState, useMemo } from 'react';
import {
  FolderTree,
  CheckCircle2,
  Clock,
  Edit2,
  Trash2,
  ShieldAlert,
  Plus,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Search
} from 'lucide-react';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const QUARTERS = [
  { key: 'Q1', label: 'Q1 (ม.ค.-มี.ค.)', months: [1, 2, 3] },
  { key: 'Q2', label: 'Q2 (เม.ย.-มิ.ย.)', months: [4, 5, 6] },
  { key: 'Q3', label: 'Q3 (ก.ค.-ก.ย.)', months: [7, 8, 9] },
  { key: 'Q4', label: 'Q4 (ต.ค.-ธ.ค.)', months: [10, 11, 12] }
];

export const AnnualPlanMatrixTable = ({
  planItems = [],
  canEditPlan = false,
  onOpenAddItem,
  onDeleteItem,
  onOpenGroupWorkOrderCheck,
  onOpenSmartImport
}) => {
  const [viewMode, setViewMode] = useState('12_MONTHS'); // '12_MONTHS' | 'QUARTERLY'
  const [expandedRowIds, setExpandedRowIds] = useState(new Set());
  const [tableSearch, setTableSearch] = useState('');

  const toggleRowExpanded = (id) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredItems = useMemo(() => {
    if (!tableSearch.trim()) return planItems;
    const q = tableSearch.toLowerCase().trim();
    return planItems.filter((item) => {
      const code = (item.asset_code || '').toLowerCase();
      const name = (item.asset_name || '').toLowerCase();
      const provider = (item.provider_name || '').toLowerCase();
      const dept = (item.responsible_dept || '').toLowerCase();
      return code.includes(q) || name.includes(q) || provider.includes(q) || dept.includes(q);
    });
  }, [planItems, tableSearch]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
      {/* Table Control & Minimal View Bar */}
      <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-slate-800 text-xs flex items-center gap-2">
            <span>ตารางแผนการทวนสอบและสอบเทียบ (FM-QC-46 Matrix)</span>
            <span className="text-slate-400 font-normal">•</span>
            <span className="text-slate-500 font-medium">{planItems.length} รายการ</span>
          </h3>

          {/* Quick Table Search */}
          {planItems.length > 2 && (
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-2 text-slate-400" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="ค้นหารหัส / ชื่อในตาราง..."
                className="pl-7 pr-6 py-1 rounded-lg border border-slate-200 text-xs bg-white focus:outline-none focus:border-indigo-600 w-40 sm:w-48 text-slate-800 placeholder-slate-400"
              />
              {tableSearch && (
                <button
                  type="button"
                  onClick={() => setTableSearch('')}
                  className="absolute right-1.5 top-1.5 text-slate-400 hover:text-slate-600 text-[11px] p-0.5 cursor-pointer"
                  title="ล้างคำค้นหา"
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </div>

        {/* View Mode Toggle & Smart Import CTA */}
        <div className="flex items-center gap-2">
          {canEditPlan && onOpenSmartImport && planItems.length > 0 && (
            <button
              type="button"
              onClick={onOpenSmartImport}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
            >
              <Sparkles size={12} />
              <span>เลือกจากทะเบียน (Smart Import)</span>
            </button>
          )}

          {/* View Mode: 12 Months vs Quarterly */}
          <div className="inline-flex items-center gap-0.5 bg-slate-200/60 p-0.5 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setViewMode('12_MONTHS')}
              className={`px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
                viewMode === '12_MONTHS'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              12 เดือน (เต็ม)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('QUARTERLY')}
              className={`px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
                viewMode === 'QUARTERLY'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              รายไตรมาส (Q1-Q4)
            </button>
          </div>
        </div>
      </div>

      {/* Main Table Container with Sticky Headings */}
      <div className="overflow-x-auto max-h-[calc(100vh-280px)]">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-xs shadow-2xs">
            <tr className="border-b border-slate-200 text-slate-600 text-[11px] font-bold tracking-wider uppercase">
              {/* Consolidated Equipment & Context Header */}
              <th className="py-2.5 px-3.5 sticky left-0 z-30 bg-slate-50 shadow-[1px_0_0_0_#e2e8f0] min-w-[240px]">
                รายการเครื่องมือวัดและการดำเนินงาน
              </th>
              <th className="py-2.5 px-2 text-center w-12 text-slate-500 font-mono">
                Type
              </th>

              {/* Month or Quarter Columns */}
              {viewMode === '12_MONTHS'
                ? MONTHS.map((m) => (
                    <th
                      key={m}
                      className="py-2.5 px-1 text-center w-8 border-l border-slate-200/70 text-slate-700 font-mono"
                    >
                      ด.{m}
                    </th>
                  ))
                : QUARTERS.map((q) => (
                    <th
                      key={q.key}
                      className="py-2.5 px-2 text-center w-24 border-l border-slate-200/70 text-slate-700 font-mono"
                    >
                      {q.label}
                    </th>
                  ))}

              <th className="py-2.5 px-3 border-l border-slate-200/70 min-w-[170px]">
                วันครบกำหนด / สถานะหลักฐาน
              </th>

              <th className="py-2.5 px-3 text-right min-w-[120px]">
                การจัดการ
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={viewMode === '12_MONTHS' ? 16 : 8} className="py-12 text-center text-slate-500 bg-white">
                  <div className="max-w-md mx-auto space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto text-indigo-600">
                      <Sparkles size={22} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">
                        {planItems.length === 0
                          ? 'แผนประจำปีฉบับนี้ยังไม่มีรายการเครื่องมือวัด'
                          : 'ไม่พบเครื่องมือที่ตรงกับคำค้นหา'}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1">
                        {planItems.length === 0
                          ? 'เลือกและนำเข้าเครื่องมือจากทะเบียน (Asset Register) พร้อมกำหนดรอบความถี่และวันครบกำหนดได้ในคลิกเดียว'
                          : `ไม่พบข้อมูลที่ตรงกับ "${tableSearch}" ในตาราง`}
                      </p>
                    </div>

                    {planItems.length === 0 ? (
                      canEditPlan && (
                        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                          {onOpenSmartImport && (
                            <button
                              type="button"
                              onClick={onOpenSmartImport}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors shadow-2xs cursor-pointer"
                            >
                              <Sparkles size={13} />
                              <span>เลือกเครื่องมือจากทะเบียน (Smart Import)</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenAddItem(null)}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                          >
                            <Plus size={13} />
                            <span>กำหนดรายการเอง</span>
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setTableSearch('')}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                        >
                          ล้างคำค้นหา
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const isGroup = Number(item.is_group) === 1;
                const isExpanded = expandedRowIds.has(item.id);

                return (
                  <React.Fragment key={item.id}>
                    {/* Row 1: Plan Row */}
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      {/* Asset & Operation Context (Sticky Left Column) */}
                      <td
                        className="py-2 px-3.5 align-top sticky left-0 z-10 bg-white shadow-[1px_0_0_0_#e2e8f0] min-w-[240px]"
                        rowSpan={2}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="space-y-0.5">
                            <div className="font-mono font-bold text-slate-900 text-xs tracking-tight">
                              {item.asset_code}
                            </div>
                            <div className="text-xs font-medium text-slate-700 leading-snug">
                              {item.asset_name}
                            </div>
                            {/* Consolidated metadata line */}
                            <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1 pt-0.5">
                              <span className="font-medium text-slate-700">{item.frequency_label}</span>
                              <span>•</span>
                              <span>{item.provider_name}</span>
                              <span>•</span>
                              <span className="text-slate-600">แผนก {item.responsible_dept}</span>
                            </div>

                            {isGroup ? (
                              <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 border border-purple-200 text-purple-900 font-semibold text-[10.5px]">
                                <FolderTree size={11} className="text-purple-700 shrink-0" />
                                <span>กลุ่มแม่ (ต้องแยกรหัสลูกก่อนสร้างใบงาน)</span>
                              </div>
                            ) : item.parent_asset_code ? (
                              <div className="mt-1 inline-block px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[10.5px]">
                                ลูกของกลุ่ม: <span className="font-mono font-semibold">{item.parent_asset_code}</span>
                              </div>
                            ) : null}
                          </div>

                          {/* Row Details Chevron */}
                          <button
                            type="button"
                            onClick={() => toggleRowExpanded(item.id)}
                            title="ดูรายละเอียดข้อมูลเครื่องมือ"
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer mt-0.5 shrink-0"
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </div>
                      </td>

                      {/* Type: Plan */}
                      <td className="py-1.5 px-1.5 text-center font-bold font-mono text-[10.5px] bg-indigo-50/50 text-indigo-700 border-b border-slate-100">
                        Plan
                      </td>

                      {/* Planning Grid (12 Months or Quarterly) */}
                      {viewMode === '12_MONTHS'
                        ? MONTHS.map((m) => {
                            const isPlanned = (item.planned_months || []).includes(m);
                            return (
                              <td
                                key={`plan-${item.id}-${m}`}
                                className={`py-1 px-0.5 text-center border-l border-b border-slate-100 ${
                                  isPlanned ? 'bg-indigo-50/40' : 'bg-white'
                                }`}
                              >
                                {isPlanned ? (
                                  <span className="inline-block min-w-[20px] py-0.5 px-1 rounded bg-indigo-600 text-white font-mono font-bold text-[10px] shadow-2xs">
                                    P{m}
                                  </span>
                                ) : (
                                  <span className="text-slate-300 font-mono text-[10.5px]">-</span>
                                )}
                              </td>
                            );
                          })
                        : QUARTERS.map((q) => {
                            const plannedInQ = q.months.filter((m) =>
                              (item.planned_months || []).includes(m)
                            );
                            return (
                              <td
                                key={`plan-q-${item.id}-${q.key}`}
                                className={`py-1 px-1.5 text-center border-l border-b border-slate-100 ${
                                  plannedInQ.length > 0 ? 'bg-indigo-50/30' : 'bg-white'
                                }`}
                              >
                                {plannedInQ.length > 0 ? (
                                  <div className="flex flex-wrap items-center justify-center gap-1">
                                    {plannedInQ.map((m) => (
                                      <span
                                        key={m}
                                        className="py-0.5 px-1 rounded bg-indigo-600 text-white font-mono font-bold text-[10px] shadow-2xs"
                                      >
                                        P{m}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-slate-300 font-mono text-[10.5px]">-</span>
                                )}
                              </td>
                            );
                          })}

                      {/* Due Dates & Evidence (rowSpan 2) */}
                      <td className="py-2 px-3 align-top border-l border-slate-100" rowSpan={2}>
                        <div className="font-mono font-bold text-slate-900 text-xs">
                          {(item.due_dates || []).slice(0, 2).join(', ')}
                          {(item.due_dates || []).length > 2
                            ? ` (+${item.due_dates.length - 2} เดือน)`
                            : ''}
                        </div>
                        {item.completion_status === 'COMPLETED' ? (
                          <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold text-[10.5px]">
                            <CheckCircle2 size={11} className="text-emerald-700 shrink-0" />
                            <span>ทวนสอบเสร็จแล้ว • มีใบรับรอง</span>
                          </span>
                        ) : (
                          <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900 font-semibold text-[10.5px]">
                            <Clock size={11} className="text-amber-700 shrink-0" />
                            <span>วางแผนเท่านั้น • ยังไม่มีหลักฐานใบงาน</span>
                          </span>
                        )}
                      </td>

                      {/* Actions (rowSpan 2) */}
                      <td className="py-2 px-3 align-top text-right" rowSpan={2}>
                        <div className="flex flex-col items-end gap-1">
                          {isGroup && (
                            <button
                              type="button"
                              onClick={() => onOpenGroupWorkOrderCheck(item)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-purple-50 border border-purple-200 hover:bg-purple-100 text-purple-900 font-bold text-[11px] transition-colors cursor-pointer shadow-2xs"
                            >
                              <ShieldAlert size={11} className="text-purple-700" />
                              <span>ตรวจรหัสลูกก่อนออกใบงาน</span>
                            </button>
                          )}
                          {canEditPlan && (
                            <div className="inline-flex gap-1">
                              <button
                                type="button"
                                onClick={() => onOpenAddItem(item)}
                                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-medium transition-colors cursor-pointer"
                              >
                                <Edit2 size={11} className="text-slate-500" />
                                <span>แก้ไข</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteItem(item)}
                                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded border border-rose-200 bg-rose-50/50 hover:bg-rose-50 text-rose-700 text-[11px] font-medium transition-colors cursor-pointer"
                              >
                                <Trash2 size={11} className="text-rose-600" />
                                <span>ลบ</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Row 2: Act. Row */}
                    <tr className="bg-slate-50/40 hover:bg-slate-50/70 transition-colors">
                      <td className="py-1 px-1.5 text-center font-bold font-mono text-[10.5px] text-slate-500">
                        Act.
                      </td>

                      {/* Act. Grid (12 Months or Quarterly) */}
                      {viewMode === '12_MONTHS'
                        ? MONTHS.map((m) => {
                            const isActual = (item.actual_months || []).includes(m);
                            return (
                              <td
                                key={`act-${item.id}-${m}`}
                                className={`py-1 px-0.5 text-center border-l border-slate-100 ${
                                  isActual ? 'bg-emerald-50/40' : ''
                                }`}
                              >
                                {isActual ? (
                                  <span className="inline-block min-w-[20px] py-0.5 px-1 rounded bg-emerald-600 text-white font-mono font-bold text-[10px] shadow-2xs">
                                    A{m}
                                  </span>
                                ) : (
                                  <span className="text-slate-300 font-mono text-[10.5px]">-</span>
                                )}
                              </td>
                            );
                          })
                        : QUARTERS.map((q) => {
                            const actualInQ = q.months.filter((m) =>
                              (item.actual_months || []).includes(m)
                            );
                            return (
                              <td
                                key={`act-q-${item.id}-${q.key}`}
                                className={`py-1 px-1.5 text-center border-l border-slate-100 ${
                                  actualInQ.length > 0 ? 'bg-emerald-50/30' : ''
                                }`}
                              >
                                {actualInQ.length > 0 ? (
                                  <div className="flex flex-wrap items-center justify-center gap-1">
                                    {actualInQ.map((m) => (
                                      <span
                                        key={m}
                                        className="py-0.5 px-1 rounded bg-emerald-600 text-white font-mono font-bold text-[10px] shadow-2xs"
                                      >
                                        A{m}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-slate-300 font-mono text-[10.5px]">-</span>
                                )}
                              </td>
                            );
                          })}
                    </tr>

                    {/* Row Detail Drawer (Notion Expanded Row) */}
                    {isExpanded && (
                      <tr className="bg-slate-50/90 border-b border-slate-200/80">
                        <td
                          colSpan={viewMode === '12_MONTHS' ? 16 : 8}
                          className="p-3.5 pl-6 text-xs text-slate-700"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                            <div>
                              <span className="text-slate-400 block text-[10.5px]">รุ่น / Serial No.</span>
                              <span className="font-medium text-slate-800">
                                {item.model || '-'} / {item.serial_no || '-'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10.5px]">ตำแหน่งที่ตั้ง</span>
                              <span className="font-medium text-slate-800">{item.location || '-'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10.5px]">ผู้รับผิดชอบเครื่องมือ</span>
                              <span className="font-medium text-slate-800">
                                แผนก {item.responsible_dept} ({item.responsible_label || '-'})
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10.5px]">หมายเหตุ</span>
                              <span className="font-medium text-slate-800">{item.remarks || '-'}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Discrete Table Footer with Legend & Summary (Linear style) */}
      <div className="bg-slate-50/90 border-t border-slate-200/80 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <div>
          รวมเครื่องมือวัดในแผน: <strong className="text-slate-800">{planItems.length}</strong> รายการ
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600 inline-block shadow-2xs" />
            <span className="text-slate-700 font-medium">Plan (P): เดือนเป้าหมาย (วางแผนเท่านั้น)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block shadow-2xs" />
            <span className="text-slate-700 font-medium">Act. (A): มีผลตรวจรับเสร็จสิ้น</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FolderTree size={12} className="text-purple-700" />
            <span className="text-purple-900 font-medium">กลุ่มแม่: ต้องแยกรหัสลูกก่อนออกใบงาน</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default AnnualPlanMatrixTable;
