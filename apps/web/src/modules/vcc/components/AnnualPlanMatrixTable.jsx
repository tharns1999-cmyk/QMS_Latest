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
  Info,
  AlertTriangle
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
      <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* งานหลักของผู้ใช้: เลือกเครื่องมือจากทะเบียนเข้าแผน */}
          {canEditPlan && onOpenSmartImport && (
            <button
              type="button"
              onClick={onOpenSmartImport}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors cursor-pointer shadow-2xs"
            >
              <Sparkles size={14} />
              <span>เพิ่มเครื่องมือจากทะเบียน</span>
            </button>
          )}
          {canEditPlan && (
            <button
              type="button"
              onClick={() => onOpenAddItem(null)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100 text-sm font-medium transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>กำหนดรายการเอง</span>
            </button>
          )}

          {/* Quick Table Search */}
          {planItems.length > 2 && (
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="ค้นหารหัส / ชื่อในตาราง..."
                className="h-9 pl-9 pr-7 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 w-48 sm:w-56 text-slate-800 placeholder-slate-400"
              />
              {tableSearch && (
                <button
                  type="button"
                  onClick={() => setTableSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-0.5 cursor-pointer"
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
          {/* Density Switcher */}
          <div className="inline-flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setDensity('comfortable')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
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
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                density === 'compact'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              กะทัดรัด
            </button>
          </div>

          {/* View Mode: 12 Months vs Quarterly */}
          <div className="inline-flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setViewMode('12_MONTHS')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
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
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
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
      <div className="overflow-x-auto max-h-[calc(100vh-210px)]">
        <table className="w-full text-left border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-xs shadow-2xs">
            <tr className="border-b border-slate-200 text-slate-700 text-xs font-bold tracking-wider uppercase">
              {/* Sticky Column: Asset Code & Name */}
              <th className="py-3 px-3.5 sticky left-0 z-30 bg-slate-50 shadow-[1px_0_0_0_#e2e8f0] min-w-[240px]">
                รายการเครื่องมือวัด
              </th>

              {/* Due Date & Evidence Summary (Essential for audit & automated verification) */}
              <th className="py-3 px-3.5 border-l border-slate-200/70 min-w-[180px]">
                วันครบกำหนด / สถานะหลักฐาน
              </th>

              {/* Month or Quarter Columns */}
              {viewMode === '12_MONTHS'
                ? MONTHS.map((m) => (
                    <th
                      key={m}
                      className="py-2.5 px-1.5 text-center min-w-[54px] border-l border-slate-200/70 text-slate-800 font-mono"
                    >
                      <div className="text-[11px] text-slate-500 font-medium">{MONTH_LABELS[m - 1]}</div>
                      <div className="text-xs font-bold">ด.{m}</div>
                    </th>
                  ))
                : QUARTERS.map((q) => (
                    <th
                      key={q.key}
                      className="py-3 px-2 text-center min-w-[100px] border-l border-slate-200/70 text-slate-800 font-mono text-xs font-bold"
                    >
                      {q.label}
                    </th>
                  ))}

              {/* Context Actions Header */}
              <th className="py-3 px-3.5 text-right min-w-[120px]">
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
                          ? canEditPlan
                            ? 'กดปุ่ม “เพิ่มเครื่องมือจากทะเบียน” ด้านบน เพื่อเลือกเครื่องมือและกำหนดรอบการทวนสอบ'
                            : 'แผนในสถานะนี้ไม่สามารถเพิ่มรายการได้'
                          : `ไม่พบข้อมูลที่ตรงกับ "${tableSearch}" ในตาราง`}
                      </p>
                    </div>

                    {planItems.length === 0 ? null : (
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
                const itemWos = (workOrders || []).filter(
                  (w) => w.plan_item_id === item.id || (w.plan_id === activePlan?.id && w.asset_id === item.asset_id)
                );
                const hasHoldOrNc = itemWos.some((w) => w.nc_status === 'OPEN' || w.result_status === 'FAIL');
                const closedPassCount = itemWos.filter((w) => w.status === 'CLOSED' && w.result_status === 'PASS').length;
                const plannedMonthsCount = (item.planned_months || []).length;

                return (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/60 transition-colors group"
                  >
                    {/* Sticky Left: Asset Code & Operation Context */}
                    <td className="py-2.5 px-3.5 align-middle sticky left-0 z-10 bg-white shadow-[1px_0_0_0_#e2e8f0] min-w-[240px]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={() => setInspectorItem(item)}
                            title="คลิกเพื่อดูรายละเอียดและสเปกเครื่องมือ"
                            className="text-left font-mono font-bold text-indigo-700 hover:text-indigo-900 hover:underline text-sm tracking-tight cursor-pointer"
                          >
                            {item.asset_code}
                          </button>
                          <div className="text-sm font-semibold text-slate-900 leading-snug">
                            {item.asset_name}
                          </div>
                          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 pt-0.5">
                            <span className="font-semibold text-slate-700">{item.frequency_label}</span>
                            <span>•</span>
                            <span>{item.provider_name}</span>
                            <span>•</span>
                            <span className="text-slate-600">แผนก {item.responsible_dept}</span>
                          </div>

                          {isGroup ? (
                            <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-purple-900 font-bold text-xs">
                              <FolderTree size={12} className="text-purple-700 shrink-0" />
                              <span>กลุ่มแม่ (ต้องแยกรหัสลูกก่อนสร้างใบงาน)</span>
                            </div>
                          ) : item.parent_asset_code ? (
                            <div className="mt-1 inline-block px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-xs">
                              ลูกของกลุ่ม: <span className="font-mono font-semibold">{item.parent_asset_code}</span>
                            </div>
                          ) : null}
                        </div>

                        {/* Inspector trigger button */}
                        <button
                          type="button"
                          onClick={() => setInspectorItem(item)}
                          title="ดูรายละเอียดข้อมูลเครื่องมือ"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer mt-0.5 shrink-0 opacity-70 group-hover:opacity-100"
                        >
                          <Info size={15} />
                        </button>
                      </div>
                    </td>

                    {/* Due Dates & Completion Evidence Summary */}
                    <td className="py-2.5 px-3.5 align-middle border-l border-slate-100 min-w-[180px]">
                      <div className="font-mono font-bold text-slate-900 text-sm">
                        {(item.due_dates || []).slice(0, 2).join(', ')}
                        {(item.due_dates || []).length > 2
                          ? ` (+${item.due_dates.length - 2} เดือน)`
                          : ''}
                      </div>
                      {hasHoldOrNc ? (
                        <span className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-800 font-bold text-xs">
                          <AlertTriangle size={12} className="text-rose-700 shrink-0" />
                          <span>พบข้อบกพร่อง / ระงับใช้ (NC)</span>
                        </span>
                      ) : plannedMonthsCount > 0 && closedPassCount >= plannedMonthsCount ? (
                        <span className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs">
                          <CheckCircle2 size={12} className="text-emerald-700 shrink-0" />
                          <span>ทวนสอบเสร็จแล้ว • มีใบรับรอง</span>
                        </span>
                      ) : closedPassCount > 0 ? (
                        <span className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-900 font-bold text-xs">
                          <CheckCircle2 size={12} className="text-indigo-700 shrink-0" />
                          <span>เสร็จบางรอบ ({closedPassCount}/{plannedMonthsCount})</span>
                        </span>
                      ) : itemWos.some((w) => w.status === 'OPEN' || w.status === 'PENDING_REVIEW') ? (
                        <span className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-900 font-bold text-xs">
                          <Clock size={12} className="text-sky-700 shrink-0" />
                          <span>มีใบงานกำลังดำเนินการ</span>
                        </span>
                      ) : (
                        <span className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 font-bold text-xs">
                          <Clock size={12} className="text-amber-700 shrink-0" />
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
                                    className="py-0.5 px-1.5 rounded-md bg-indigo-600 text-white font-mono font-bold text-xs shadow-2xs"
                                  >
                                    P{m}
                                  </span>
                                ))}
                                {actualInQ.map((m) => (
                                  <span
                                    key={`act-${m}`}
                                    className="py-0.5 px-1.5 rounded-md bg-emerald-600 text-white font-mono font-bold text-xs shadow-2xs"
                                  >
                                    A{m}
                                  </span>
                                ))}
                                {plannedInQ.length === 0 && actualInQ.length === 0 && (
                                  <span className="text-slate-300 font-mono text-xs">-</span>
                                )}
                              </div>
                            </td>
                          );
                        })}

                    {/* Context Actions */}
                    <td className="py-2.5 px-3.5 align-middle text-right">
                      <div className="flex flex-col items-end gap-1.5">
                        {isGroup && (
                          <button
                            type="button"
                            onClick={() => onOpenGroupWorkOrderCheck(item)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200 hover:bg-purple-100 text-purple-900 font-bold text-xs transition-colors cursor-pointer shadow-2xs"
                          >
                            <ShieldAlert size={13} className="text-purple-700" />
                            <span>ตรวจรหัสลูกก่อนออกใบงาน</span>
                          </button>
                        )}
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setInspectorItem(item)}
                            title="เปิด Side Inspector ดูรายละเอียด"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                          >
                            <Maximize2 size={12} />
                            <span>สเปก</span>
                          </button>
                          {canEditPlan && (
                            <>
                              <button
                                type="button"
                                onClick={() => onOpenAddItem(item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                              >
                                <Edit2 size={12} className="text-slate-500" />
                                <span>แก้ไข</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteItem(item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition-colors cursor-pointer"
                              >
                                <Trash2 size={12} className="text-rose-600" />
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
      <div className="bg-slate-50/90 border-t border-slate-200/80 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div>
          {tableSearch.trim() ? (
            <>
              พบ <strong className="text-slate-900">{filteredItems.length}</strong> จาก {planItems.length} รายการ
            </>
          ) : (
            <span>รวมทั้งหมด <strong className="text-slate-900">{planItems.length}</strong> รายการเครื่องมือวัด</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3.5 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600 inline-block shadow-2xs" />
            <span className="text-slate-700 font-medium">Plan (P): เป้าหมายตามแผน</span>
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
            <FolderTree size={13} className="text-purple-700 shrink-0" />
            <span className="text-purple-900 font-semibold">กลุ่มแม่: ต้องแยกรหัสลูกก่อนออกใบงาน</span>
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
