import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  AlertTriangle,
  Check,
  X,
  ListFilter
} from 'lucide-react';
import AnnualPlanMonthCell from './AnnualPlanMonthCell';
import AnnualPlanSideInspector from './AnnualPlanSideInspector';

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
  filterYear = '',
  setFilterYear,
  availableYears = [],
  filterDept = '',
  setFilterDept,
  activeDepartments = [],
  categoryFilter = '',
  selectedCategory = '',
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
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const filterRef = useDismiss(filterOpen, () => setFilterOpen(false));
  const extraFilterCount = (filterYear ? 1 : 0) + (filterDept ? 1 : 0);
  const activeCategory = (categoryFilter || selectedCategory || '').trim();

  // 1 row = 1 Calibratable Instrument Unit (Flat Table)
  const flatInstrumentRows = useMemo(() => {
    const q = tableSearch.toLowerCase().trim();

    return planItems.filter((item) => {
      // 1. Category Filter
      if (activeCategory) {
        const itemCat = item.asset_type || 'ไม่ระบุประเภท';
        if (itemCat !== activeCategory) return false;
      }

      // 2. Search Query Filter
      if (q) {
        const code = (item.asset_code || '').toLowerCase();
        const name = (item.asset_name || '').toLowerCase();
        const provider = (item.provider_name || '').toLowerCase();
        const dept = (item.responsible_dept || item.asset_department || '').toLowerCase();
        const parentCode = (item.parent_asset_code || '').toLowerCase();
        const itemType = (item.asset_type || '').toLowerCase();
        const matches =
          code.includes(q) ||
          name.includes(q) ||
          provider.includes(q) ||
          dept.includes(q) ||
          parentCode.includes(q) ||
          itemType.includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [planItems, tableSearch, activeCategory]);

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
              className="inline-flex items-center justify-center h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors cursor-pointer shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
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

          {/* กรองปี/แผนก ใน Table Toolbar */}
          {(availableYears.length > 0 || activeDepartments.length > 0) && (
            <div className="relative" ref={filterRef}>
              <button
                type="button"
                aria-haspopup="true"
                aria-expanded={filterOpen}
                onClick={() => setFilterOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-semibold cursor-pointer shadow-2xs transition-colors ${
                  extraFilterCount > 0
                    ? 'border-indigo-300 bg-indigo-50/70 text-indigo-700'
                    : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <ListFilter size={14} className={extraFilterCount > 0 ? 'text-indigo-600' : 'text-slate-500'} />
                <span>กรองปี/แผนก{extraFilterCount > 0 ? ` (${extraFilterCount})` : ''}</span>
              </button>
              {filterOpen && (
                <div className="absolute left-0 top-full mt-1.5 z-40 w-64 bg-white rounded-xl border border-slate-200 shadow-lg p-3.5 space-y-2.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    ปีของแผน
                    <select
                      aria-label="กรองตามปีของแผน"
                      value={filterYear || ''}
                      onChange={(e) => setFilterYear && setFilterYear(e.target.value)}
                      className="w-full mt-1 h-9 px-3 rounded-xl border border-slate-300 text-xs font-medium bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="">ทุกปี</option>
                      {availableYears.map((yr) => (
                        <option key={yr} value={String(yr)}>
                          {yr} (พ.ศ. {yr + 543})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    แผนก
                    <select
                      aria-label="กรองแผนตามแผนก"
                      value={filterDept || ''}
                      onChange={(e) => setFilterDept && setFilterDept(e.target.value)}
                      className="w-full mt-1 h-9 px-3 rounded-xl border border-slate-300 text-xs font-medium bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="">ทุกแผนก</option>
                      {activeDepartments.map((d) => (
                        <option key={d.code} value={d.code}>
                          {d.code} — {d.nameTh}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
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
              {/* Sticky Column: Asset Code & Name (absorbs excess space to keep instrument identification readable) */}
              <th className="py-3 px-3.5 sticky left-0 z-30 bg-slate-50 shadow-[1px_0_0_0_#e2e8f0] min-w-[260px] w-full">
                รายการเครื่องมือวัด
              </th>

              {/* Due Date & Evidence Summary (Essential for audit & automated verification) */}
              <th className="py-3 px-3.5 border-l border-slate-200/70 min-w-[180px] w-[180px] whitespace-nowrap">
                วันครบกำหนด / สถานะหลักฐาน
              </th>

              {/* Month or Quarter Columns */}
              {viewMode === '12_MONTHS'
                ? MONTHS.map((m) => (
                    <th
                      key={m}
                      className="py-2.5 px-1.5 text-center min-w-[56px] w-[56px] border-l border-slate-200/70 text-slate-800 font-mono whitespace-nowrap"
                    >
                      <div className="text-[11px] text-slate-500 font-medium">{MONTH_LABELS[m - 1]}</div>
                      <div className="text-xs font-bold">ด.{m}</div>
                    </th>
                  ))
                : QUARTERS.map((q) => (
                    <th
                      key={q.key}
                      className="py-3 px-2 text-center min-w-[100px] w-[100px] border-l border-slate-200/70 text-slate-800 font-mono text-xs font-bold whitespace-nowrap"
                    >
                      {q.label}
                    </th>
                  ))}

              {/* Context Actions Header (Compact 104px) */}
              <th className="py-3 px-2.5 text-right w-[104px] min-w-[104px] max-w-[104px] text-xs font-bold tracking-wider uppercase text-slate-700 whitespace-nowrap">
                การจัดการ
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {flatInstrumentRows.length === 0 ? (
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
                          : activeCategory
                          ? `ไม่พบเครื่องมือในประเภท “${activeCategory}”`
                          : 'ไม่พบเครื่องมือที่ตรงกับคำค้นหา'}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1">
                        {planItems.length === 0
                          ? canEditPlan
                            ? 'กดปุ่ม “เพิ่มเครื่องมือจากทะเบียน” ด้านบน เพื่อเลือกเครื่องมือและกำหนดรอบการทวนสอบ'
                            : 'แผนในสถานะนี้ไม่สามารถเพิ่มรายการได้'
                          : activeCategory
                          ? `ไม่พบเครื่องมือประเภท "${activeCategory}" ในแผนฉบับนี้`
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
              flatInstrumentRows.map((item) => {
                const isGroup = Number(item.is_group) === 1;
                const isCompositeSet = item.is_composite_set || item.group_nature === 'COMPOSITE_SET';
                const isLogicalGroup = isGroup && !isCompositeSet;
                const isChild = Boolean(item.parent_id || item.parent_asset_code);

                const itemWos = (workOrders || []).filter(
                  (w) => w.plan_item_id === item.id || (w.plan_id === activePlan?.id && w.asset_id === item.asset_id)
                );
                const hasHoldOrNc = itemWos.some((w) => w.nc_status === 'OPEN' || w.result_status === 'FAIL') || item.asset_status === 'ON_HOLD';
                const closedPassCount = itemWos.filter((w) => w.status === 'CLOSED' && w.result_status === 'PASS').length;
                const plannedMonthsCount = (item.planned_months || []).length;

                return (
                  <tr
                    key={item.id}
                    className={`transition-colors group hover:bg-slate-50/60 ${
                      isLogicalGroup ? 'bg-slate-50/50' : 'bg-white'
                    }`}
                  >
                    {/* Sticky Left: Asset Code & Operation Context (Flat Row, Zero Indentation) */}
                    <td className={`py-2.5 px-3.5 align-middle sticky left-0 z-10 shadow-[1px_0_0_0_#e2e8f0] min-w-[240px] ${
                      isLogicalGroup ? 'bg-slate-50/95' : 'bg-white'
                    }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setInspectorItem(item)}
                              title="คลิกเพื่อดูรายละเอียดและสเปกเครื่องมือ"
                              className="text-left font-mono font-bold text-indigo-700 hover:text-indigo-900 hover:underline text-sm tracking-tight cursor-pointer"
                            >
                              {item.asset_code}
                            </button>

                            {item.asset_status === 'ON_HOLD' && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[11px] font-bold border border-rose-200">
                                ระงับใช้งาน
                              </span>
                            )}

                            {/* Clean Badges: Composite Set / Historical Frozen Group */}
                            {isCompositeSet ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-800 font-semibold text-xs">
                                ชุดเครื่องมือ (Composite Set)
                              </span>
                            ) : isLogicalGroup ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-purple-900 font-bold text-xs">
                                <FolderTree size={12} className="text-purple-600 shrink-0" />
                                <span>กลุ่มเครื่องมือ (Group)</span>
                              </span>
                            ) : null}
                          </div>

                          <div className="text-sm font-semibold text-slate-900 leading-snug">
                            {item.asset_name}
                          </div>
                          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 pt-0.5">
                            <span className="font-semibold text-slate-700">{item.frequency_label || 'รายปี'}</span>
                            <span>•</span>
                            <span>{item.provider_name || 'ทวนสอบภายใน'}</span>
                            <span>•</span>
                            <span className="text-slate-600">แผนก {item.responsible_dept || item.asset_department}</span>
                            {item.asset_type && (
                              <>
                                <span>•</span>
                                <span className="text-slate-500 font-medium">{item.asset_type}</span>
                              </>
                            )}
                          </div>

                          {isLogicalGroup && onOpenGroupWorkOrderCheck && (
                            <div className="flex flex-wrap items-center gap-2 pt-0.5">
                              <button
                                type="button"
                                onClick={() => onOpenGroupWorkOrderCheck(item)}
                                title="ตรวจรหัสลูกก่อนออกใบงาน"
                                aria-label="ตรวจรหัสลูกก่อนออกใบงาน"
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-100/70 hover:bg-purple-200 border border-purple-300 text-purple-950 font-bold text-xs transition-colors cursor-pointer text-left"
                              >
                                <ShieldAlert size={12} className="text-purple-700 shrink-0" />
                                <span>ตรวจรหัสลูกก่อนออกใบงาน</span>
                              </button>
                            </div>
                          )}

                          {plannedMonthsCount === 0 && item.remarks && (
                            <div className="text-xs text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 mt-1 inline-block">
                              เหตุผลไม่วางแผน: {item.remarks}
                            </div>
                          )}
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
                        {(item.due_dates || []).length > 0
                          ? `${(item.due_dates || []).slice(0, 2).join(', ')}${(item.due_dates || []).length > 2 ? ` (+${item.due_dates.length - 2} เดือน)` : ''}`
                          : <span className="text-slate-400 font-sans text-xs">ไม่มีรอบวางแผน</span>}
                      </div>
                      {hasHoldOrNc ? (
                        <span className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-800 font-bold text-xs">
                          <AlertTriangle size={12} className="text-rose-700 shrink-0" />
                          <span>{item.asset_status === 'ON_HOLD' ? 'ระงับใช้งาน (ON_HOLD)' : 'พบข้อบกพร่อง / ระงับใช้ (NC)'}</span>
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
                      ) : plannedMonthsCount > 0 ? (
                        <span className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 font-bold text-xs">
                          <Clock size={12} className="text-amber-700 shrink-0" />
                          <span>วางแผนเท่านั้น • ยังไม่มีหลักฐานใบงาน</span>
                        </span>
                      ) : (
                        <span className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-xs">
                          <span>{item.remarks ? `ไม่วางแผน (${item.remarks})` : 'ยังไม่ได้วางแผน'}</span>
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

                    {/* Context Actions (Compact 104px) */}
                    <td className="py-2 px-2.5 align-middle text-right w-[104px] min-w-[104px] max-w-[104px] whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setInspectorItem(item)}
                          title="ดูสเปกและรายละเอียดเครื่องมือ"
                          aria-label="ดูสเปกและรายละเอียดเครื่องมือ"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-300 shrink-0"
                        >
                          <Maximize2 size={15} />
                        </button>

                        {canEditPlan && (
                          <>
                            <button
                              type="button"
                              onClick={() => onOpenAddItem(item)}
                              title="แก้ไขข้อมูลในแผน"
                              aria-label="แก้ไขข้อมูลในแผน"
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shrink-0"
                            >
                              <Edit2 size={15} />
                            </button>

                            {confirmDeleteId === item.id ? (
                              <div className="inline-flex items-center gap-0.5 bg-rose-50 border border-rose-200 rounded-lg p-0.5 animate-in fade-in duration-150 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteItem(item);
                                    setConfirmDeleteId(null);
                                  }}
                                  title="ยืนยันลบรายการ"
                                  aria-label="ยืนยันลบ"
                                  className="w-7 h-7 rounded-md flex items-center justify-center text-white bg-rose-600 hover:bg-rose-700 transition-colors cursor-pointer shadow-2xs"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  title="ยกเลิก"
                                  aria-label="ยกเลิก"
                                  className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors cursor-pointer"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(item.id)}
                                title="ลบรายการออกจากแผน"
                                aria-label="ลบรายการออกจากแผน"
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500/20 shrink-0"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </>
                        )}
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
          {tableSearch.trim() || activeCategory ? (
            <>
              พบ <strong className="text-slate-900">{flatInstrumentRows.length}</strong> จาก {planItems.length} รายการ
              {activeCategory && <span className="ml-1.5 text-slate-500">(ประเภท: “{activeCategory}”)</span>}
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
            <span className="px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 text-[10px] font-bold">ชุดเครื่องมือ</span>
            <span className="text-slate-700 font-medium">Composite Set (1 ใบรับรอง)</span>
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
