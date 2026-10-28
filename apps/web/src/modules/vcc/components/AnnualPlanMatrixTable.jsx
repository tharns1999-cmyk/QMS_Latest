import React, { useState, useMemo } from 'react';
import {
  FolderTree,
  CheckCircle2,
  Clock,
  Edit2,
  Trash2,
  ShieldAlert,
  Plus,
  Sparkles,
  Search,
  Maximize2,
  Info
} from 'lucide-react';
import AnnualPlanMonthCell from './AnnualPlanMonthCell';
import AnnualPlanSideInspector from './AnnualPlanSideInspector';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const MONTH_LABELS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

const QUARTERS = [
  { key: 'Q1', label: 'Q1 (ม.ค.-มี.ค.)', months: [1, 2, 3] },
  { key: 'Q2', label: 'Q2 (เม.ย.-มิ.ย.)', months: [4, 5, 6] },
  { key: 'Q3', label: 'Q3 (ก.ค.-ก.ย.)', months: [7, 8, 9] },
  { key: 'Q4', label: 'Q4 (ต.ค.-ธ.ค.)', months: [10, 11, 12] }
];

export const AnnualPlanMatrixTable = ({
  planItems = [],
  activePlan = null,
  workOrders = [],
  canEditPlan = false,
  onOpenAddItem,
  onDeleteItem,
  onOpenGroupWorkOrderCheck,
  onOpenSmartImport,
  onQuickAddMonth,
  onQuickRemoveMonth,
  onCreateWorkOrder
}) => {
  const [viewMode, setViewMode] = useState('12_MONTHS'); // '12_MONTHS' | 'QUARTERLY'
  const [density, setDensity] = useState('comfortable'); // 'comfortable' | 'compact'
  const [tableSearch, setTableSearch] = useState('');
  const [inspectorItem, setInspectorItem] = useState(null);
  const [savingCellKey, setSavingCellKey] = useState('');

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

  const handleCellAddMonth = async (item, month) => {
    const key = `${item.id}-${month}`;
    setSavingCellKey(key);
    try {
      if (onQuickAddMonth) {
        await onQuickAddMonth(item, month);
      }
    } finally {
      setSavingCellKey('');
    }
  };

  const handleCellRemoveMonth = async (item, month) => {
    const key = `${item.id}-${month}`;
    setSavingCellKey(key);
    try {
      if (onQuickRemoveMonth) {
        await onQuickRemoveMonth(item, month);
      }
    } finally {
      setSavingCellKey('');
    }
  };

  const handleCellCreateWo = async (item, month) => {
    const key = `${item.id}-${month}`;
    setSavingCellKey(key);
    try {
      if (onCreateWorkOrder) {
        await onCreateWorkOrder(item, month);
      }
    } finally {
      setSavingCellKey('');
    }
  };



  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
      {/* Table Control Toolbar */}
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

        {/* View & Density Controls & Smart Import */}
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

          {/* Density Switcher */}
          <div className="inline-flex items-center gap-0.5 bg-slate-200/60 p-0.5 rounded-lg text-[11px]">
            <button
              type="button"
              onClick={() => setDensity('comfortable')}
              className={`px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
                density === 'comfortable'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              สบายตา
            </button>
            <button
              type="button"
              onClick={() => setDensity('compact')}
              className={`px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
                density === 'compact'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              กะทัดรัด
            </button>
          </div>

          {/* View Mode: 12 Months vs Quarterly */}
          <div className="inline-flex items-center gap-0.5 bg-slate-200/60 p-0.5 rounded-lg text-[11px]">
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

      {/* Main Single-Row Interactive Matrix Table */}
      <div className="overflow-x-auto max-h-[calc(100vh-270px)]">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-xs shadow-2xs">
            <tr className="border-b border-slate-200 text-slate-600 text-[11px] font-bold tracking-wider uppercase">
              {/* Sticky Column: Asset Code & Name */}
              <th className="py-2.5 px-3.5 sticky left-0 z-30 bg-slate-50 shadow-[1px_0_0_0_#e2e8f0] min-w-[220px]">
                รายการเครื่องมือวัด
              </th>

              {/* Due Date & Evidence Summary (Essential for audit & automated verification) */}
              <th className="py-2.5 px-3 border-l border-slate-200/70 min-w-[170px]">
                วันครบกำหนด / สถานะหลักฐาน
              </th>

              {/* Month or Quarter Columns */}
              {viewMode === '12_MONTHS'
                ? MONTHS.map((m) => (
                    <th
                      key={m}
                      className="py-2.5 px-1 text-center min-w-[50px] border-l border-slate-200/70 text-slate-700 font-mono"
                    >
                      <div className="text-[10px] text-slate-400 font-normal">{MONTH_LABELS[m - 1]}</div>
                      <div>ด.{m}</div>
                    </th>
                  ))
                : QUARTERS.map((q) => (
                    <th
                      key={q.key}
                      className="py-2.5 px-2 text-center min-w-[90px] border-l border-slate-200/70 text-slate-700 font-mono"
                    >
                      {q.label}
                    </th>
                  ))}

              {/* Context Actions Header */}
              <th className="py-2.5 px-3 text-right min-w-[110px]">
                การจัดการ
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={viewMode === '12_MONTHS' ? 15 : 7} className="py-12 text-center text-slate-500 bg-white">
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

                return (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/60 transition-colors group"
                  >
                    {/* Sticky Left: Asset Code & Operation Context */}
                    <td className="py-2 px-3.5 align-middle sticky left-0 z-10 bg-white shadow-[1px_0_0_0_#e2e8f0] min-w-[220px]">
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="space-y-0.5">
                          <button
                            type="button"
                            onClick={() => setInspectorItem(item)}
                            title="คลิกเพื่อดูรายละเอียดและสเปกเครื่องมือ"
                            className="text-left font-mono font-bold text-indigo-700 hover:text-indigo-900 hover:underline text-xs tracking-tight cursor-pointer"
                          >
                            {item.asset_code}
                          </button>
                          <div className="text-xs font-medium text-slate-800 leading-snug">
                            {item.asset_name}
                          </div>
                          <div className="text-[10.5px] text-slate-500 flex flex-wrap items-center gap-1 pt-0.5">
                            <span className="font-medium text-slate-700">{item.frequency_label}</span>
                            <span>•</span>
                            <span>{item.provider_name}</span>
                            <span>•</span>
                            <span className="text-slate-600">แผนก {item.responsible_dept}</span>
                          </div>

                          {isGroup ? (
                            <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 border border-purple-200 text-purple-900 font-semibold text-[10px]">
                              <FolderTree size={10} className="text-purple-700 shrink-0" />
                              <span>กลุ่มแม่ (ต้องแยกรหัสลูกก่อนสร้างใบงาน)</span>
                            </div>
                          ) : item.parent_asset_code ? (
                            <div className="mt-1 inline-block px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[10px]">
                              ลูกของกลุ่ม: <span className="font-mono font-semibold">{item.parent_asset_code}</span>
                            </div>
                          ) : null}
                        </div>

                        {/* Inspector trigger button */}
                        <button
                          type="button"
                          onClick={() => setInspectorItem(item)}
                          title="ดูรายละเอียดข้อมูลเครื่องมือ"
                          className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer mt-0.5 shrink-0 opacity-60 group-hover:opacity-100"
                        >
                          <Info size={13} />
                        </button>
                      </div>
                    </td>

                    {/* Due Dates & Completion Evidence Summary */}
                    <td className="py-2 px-3 align-middle border-l border-slate-100 min-w-[170px]">
                      <div className="font-mono font-bold text-slate-900 text-xs">
                        {(item.due_dates || []).slice(0, 2).join(', ')}
                        {(item.due_dates || []).length > 2
                          ? ` (+${item.due_dates.length - 2} เดือน)`
                          : ''}
                      </div>
                      {item.completion_status === 'COMPLETED' ? (
                        <span className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold text-[10.5px]">
                          <CheckCircle2 size={11} className="text-emerald-700 shrink-0" />
                          <span>ทวนสอบเสร็จแล้ว • มีใบรับรอง</span>
                        </span>
                      ) : (
                        <span className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900 font-semibold text-[10.5px]">
                          <Clock size={11} className="text-amber-700 shrink-0" />
                          <span>วางแผนเท่านั้น • ยังไม่มีหลักฐานใบงาน</span>
                        </span>
                      )}
                    </td>

                    {/* Month Columns: 12-Month Single-Row Interactive Grid */}
                    {viewMode === '12_MONTHS'
                      ? MONTHS.map((m) => (
                          <AnnualPlanMonthCell
                            key={`${item.id}-${m}`}
                            month={m}
                            item={item}
                            plan={activePlan}
                            workOrders={workOrders}
                            canEditPlan={canEditPlan}
                            isSaving={savingCellKey === `${item.id}-${m}`}
                            onQuickAddMonth={handleCellAddMonth}
                            onQuickRemoveMonth={handleCellRemoveMonth}
                            onCreateWorkOrder={handleCellCreateWo}
                            onOpenGroupCheck={onOpenGroupWorkOrderCheck}
                            onOpenFullEdit={onOpenAddItem}
                            density={density}
                          />
                        ))
                      : QUARTERS.map((q) => {
                          const plannedInQ = q.months.filter((m) =>
                            (item.planned_months || []).includes(m)
                          );
                          const actualInQ = q.months.filter((m) =>
                            (item.actual_months || []).includes(m)
                          );

                          return (
                            <td
                              key={`q-${item.id}-${q.key}`}
                              className={`py-1.5 px-2 text-center border-l border-slate-100 ${
                                actualInQ.length > 0
                                  ? 'bg-emerald-50/30'
                                  : plannedInQ.length > 0
                                  ? 'bg-indigo-50/20'
                                  : 'bg-white'
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-center gap-1">
                                {plannedInQ.map((m) => (
                                  <span
                                    key={`plan-${m}`}
                                    className="py-0.5 px-1 rounded bg-indigo-600 text-white font-mono font-bold text-[10px] shadow-2xs"
                                  >
                                    P{m}
                                  </span>
                                ))}
                                {actualInQ.map((m) => (
                                  <span
                                    key={`act-${m}`}
                                    className="py-0.5 px-1 rounded bg-emerald-600 text-white font-mono font-bold text-[10px] shadow-2xs"
                                  >
                                    A{m}
                                  </span>
                                ))}
                                {plannedInQ.length === 0 && actualInQ.length === 0 && (
                                  <span className="text-slate-300 font-mono text-[10.5px]">-</span>
                                )}
                              </div>
                            </td>
                          );
                        })}

                    {/* Context Actions */}
                    <td className="py-2 px-3 align-middle text-right">
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
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => setInspectorItem(item)}
                            title="เปิด Side Inspector ดูรายละเอียด"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-[11px] font-medium transition-colors cursor-pointer"
                          >
                            <Maximize2 size={11} />
                            <span>สเปก</span>
                          </button>
                          {canEditPlan && (
                            <>
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
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
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
            <span className="text-slate-700 font-medium">Plan (P): เป้าหมายตามแผน (คลิกเพื่อแก้ไข/จัดการ)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block shadow-2xs" />
            <span className="text-slate-700 font-medium">WO: มีใบสั่งงานกำลังดำเนินการ</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block shadow-2xs" />
            <span className="text-slate-700 font-medium">✓ (PASS): ปิดงานตรวจรับเสร็จสิ้นแล้ว</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FolderTree size={12} className="text-purple-700" />
            <span className="text-purple-900 font-medium">กลุ่มแม่: ต้องแยกรหัสลูกก่อนออกใบงาน</span>
          </span>
        </div>
      </div>

      {/* Side Inspector Drawer */}
      {inspectorItem && (
        <AnnualPlanSideInspector
          item={inspectorItem}
          plan={activePlan}
          workOrders={workOrders}
          canEditPlan={canEditPlan}
          onClose={() => setInspectorItem(null)}
          onOpenAddItem={onOpenAddItem}
          onDeleteItem={onDeleteItem}
          onOpenGroupWorkOrderCheck={onOpenGroupWorkOrderCheck}
        />
      )}
    </div>
  );
};

export default AnnualPlanMatrixTable;
