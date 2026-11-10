import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  FolderTree,
  Trash2,
  ShieldAlert,
  Plus,
  Sparkles,
  Search,
  AlertTriangle,
  ListFilter,
  Settings,
  ChevronDown,
  X
} from 'lucide-react';
import AnnualPlanMonthCell from './AnnualPlanMonthCell';
import { isSavedPlanItem } from '../utils/planLabels';
import AnnualPlanSideInspector from './AnnualPlanSideInspector';
import { VccScrollIndicator } from './VccDesignSystem';

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

const formatCleanAssetName = (rawName) => {
  if (!rawName) return '-';
  return String(rawName).replace(/^\[ข้อมูลทดสอบ\]\s*/g, '').trim();
};

const formatCleanSecondLine = (item) => {
  const rawProvider = String(item?.provider_name || 'ทวนสอบภายใน').trim();
  const isExternal =
    Boolean(rawProvider) &&
    !rawProvider.includes('ภายใน') &&
    rawProvider.toLowerCase() !== 'internal';
  const providerDisplay = isExternal
    ? rawProvider.includes('ภายนอก')
      ? rawProvider
      : `สอบเทียบภายนอก (${rawProvider})`
    : rawProvider || 'ทวนสอบภายใน';

  const rawFreq = String(item?.frequency_label || 'รายปี').trim();
  const freqDisplay = rawFreq.startsWith('ความถี่') ? rawFreq : `ความถี่${rawFreq}`;

  return `${providerDisplay} · ${freqDisplay}`;
};

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
  onToggleProvider,
  onCreateWorkOrder
}) => {
  const [tableSearch, setTableSearch] = useState('');
  const [localCategory, setLocalCategory] = useState('');
  const [inspectorItem, setInspectorItem] = useState(null);
  const [savingCellKey, setSavingCellKey] = useState('');
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const filterRef = useDismiss(filterOpen, () => setFilterOpen(false));
  const addMenuRef = useDismiss(addMenuOpen, () => setAddMenuOpen(false));

  const extraFilterCount = (filterYear ? 1 : 0) + (filterDept ? 1 : 0);
  const activeCategory = (categoryFilter || selectedCategory || localCategory || '').trim();

  const availableCategories = useMemo(() => {
    const set = new Set();
    planItems.forEach((item) => {
      if (item?.asset_type) set.add(item.asset_type);
    });
    return Array.from(set);
  }, [planItems]);

  const tableContainerRef = useRef(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);

  const checkScroll = useCallback(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 5);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 5);
  }, []);

  // 1 row = 1 Calibratable Instrument Unit (Flat Table)
  const flatInstrumentRows = useMemo(() => {
    const q = tableSearch.toLowerCase().trim();

    return planItems.filter((item) => {
      if (activeCategory) {
        const itemCat = item.asset_type || 'ไม่ระบุประเภท';
        if (itemCat !== activeCategory) return false;
      }

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

  const handleCellAddMonth = async (item, month, options = {}) => {
    const key = `${item.id}-${month}`;
    setSavingCellKey(key);
    try {
      if (onQuickAddMonth) {
        await onQuickAddMonth(item, month, options);
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

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [checkScroll, flatInstrumentRows.length]);

  return (
    <div
      data-testid="annual-plan-matrix-table"
      className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden"
    >
      {/* Clean Enterprise Toolbar: Left = Search + Filters, Right = Primary Import CTA */}
      <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-sm">
        {/* Left: Search + Category Filter + Year/Dept Filter */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="ค้นหารหัส / ชื่อเครื่องมือ..."
              aria-label="ค้นหารหัสหรือชื่อเครื่องมือในตาราง"
              className="h-9 pl-9 pr-7 rounded-xl border border-slate-300 text-xs sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 w-52 sm:w-64 text-slate-800 placeholder-slate-400 shadow-2xs"
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

          {availableCategories.length > 0 && (
            <select
              aria-label="กรองตามประเภทเครื่องมือ"
              value={activeCategory}
              onChange={(e) => setLocalCategory(e.target.value)}
              className="h-9 px-3 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 shadow-2xs cursor-pointer"
            >
              <option value="">ทุกประเภทเครื่องมือ</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          )}

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
                <div className="absolute left-0 top-full mt-1.5 z-40 w-64 max-w-[calc(100vw-2rem)] bg-white rounded-xl border border-slate-200 shadow-lg p-3.5 space-y-2.5">
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
                          {yr} (พ.ศ. {Number(yr) + 543})
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
                          {d.code} — {d.nameTh || d.name_th}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Single Primary Action Button (+ เพิ่มเครื่องมือจากทะเบียน) with Secondary Dropdown */}
        {canEditPlan && (onOpenSmartImport || onOpenAddItem) && (
          <div className="relative inline-flex items-center" ref={addMenuRef}>
            {onOpenSmartImport ? (
              <button
                type="button"
                onClick={onOpenSmartImport}
                className={`inline-flex items-center justify-center gap-1.5 h-9 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                  onOpenAddItem ? 'rounded-l-xl' : 'rounded-xl'
                }`}
              >
                <Plus size={15} />
                <span>เพิ่มเครื่องมือจากทะเบียน</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAddItem(null)}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer shadow-2xs"
              >
                <Plus size={15} />
                <span>เพิ่มเครื่องมือจากทะเบียน</span>
              </button>
            )}

            {onOpenSmartImport && onOpenAddItem && (
              <>
                <button
                  type="button"
                  aria-label="ตัวเลือกการเพิ่มเครื่องมือเพิ่มเติม"
                  aria-expanded={addMenuOpen}
                  onClick={() => setAddMenuOpen((v) => !v)}
                  className="inline-flex items-center justify-center h-9 px-2 rounded-r-xl bg-indigo-700 hover:bg-indigo-800 text-white border-l border-indigo-500 transition-colors cursor-pointer"
                >
                  <ChevronDown size={14} />
                </button>
                {addMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-1.5 z-40 w-48 bg-white rounded-xl border border-slate-200 shadow-lg py-1.5 text-xs"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAddMenuOpen(false);
                        onOpenAddItem(null);
                      }}
                      className="w-full flex items-center gap-2 px-3.5 py-2 text-left font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <Plus size={14} className="text-indigo-600" />
                      <span>กำหนดรายการเอง</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Main 12-Month Interactive Matrix Table (No middle Due Date column) */}
      <div className="relative">
        <div
          ref={tableContainerRef}
          onScroll={checkScroll}
          className="overflow-x-auto max-h-[calc(100vh-210px)]"
        >
          <table className="w-full text-left border-collapse text-sm border-t border-slate-200">
            <thead className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-xs shadow-2xs">
              <tr className="border-b border-slate-200 text-slate-700 text-xs font-bold tracking-wider uppercase">
                {/* Column 1: Sticky Asset Code & Name */}
                <th className="py-3 px-3.5 sticky left-0 z-30 bg-slate-50 border-r border-slate-200 shadow-[1px_0_0_0_#e2e8f0] min-w-[230px] sm:min-w-[280px] xl:min-w-[320px]">
                  รายการเครื่องมือวัด
                </th>

                {/* Columns 2-13: 12 Months (ม.ค. - ธ.ค.) */}
                {MONTHS.map((m) => (
                  <th
                    key={m}
                    className="py-3 px-1.5 text-center min-w-[68px] border-r border-slate-200 text-slate-700 font-semibold whitespace-nowrap bg-slate-50"
                  >
                    {MONTH_LABELS[m - 1]}
                  </th>
                ))}

                {/* Column 14: Actions */}
                <th className="py-3 px-3.5 text-right w-auto min-w-[156px] text-xs font-bold tracking-wider uppercase text-slate-700 whitespace-nowrap">
                  การจัดการ
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 bg-white">
              {flatInstrumentRows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-slate-500 bg-white">
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
                            onClick={() => {
                              setTableSearch('');
                              setLocalCategory('');
                            }}
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
                  const plannedMonthsCount = (item.planned_months || []).length;
                  const cleanName = formatCleanAssetName(item.asset_name);

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors group hover:bg-slate-50/70 ${
                        isLogicalGroup ? 'bg-slate-50/50' : 'bg-white'
                      }`}
                    >
                      {/* Column 1: Clean 2-Line Instrument Identity */}
                      <td
                        className={`py-3 px-3.5 align-middle sticky left-0 z-10 border-r border-slate-200 shadow-[1px_0_0_0_#e2e8f0] min-w-[230px] sm:min-w-[280px] xl:min-w-[320px] ${
                          isLogicalGroup ? 'bg-slate-50 group-hover:bg-slate-100' : 'bg-white group-hover:bg-slate-50'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          {/* Line 1: Monospace Bold Asset Code + Instrument Name + Essential Status Badges */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setInspectorItem(item)}
                              title="คลิกเพื่อดูรายละเอียดและสเปกเครื่องมือ"
                              aria-label={`ดูสเปกและรายละเอียดเครื่องมือ ${item.asset_code}`}
                              className="inline-flex items-baseline gap-2 text-left group/title cursor-pointer max-w-full"
                            >
                              <span className="font-mono font-bold text-indigo-700 group-hover/title:text-indigo-900 group-hover/title:underline text-xs sm:text-sm tracking-tight shrink-0">
                                {item.asset_code}
                              </span>
                              <span className="text-xs sm:text-sm font-semibold text-slate-900 group-hover/title:text-indigo-900 truncate">
                                {cleanName}
                              </span>
                            </button>

                            {item.asset_status === 'ON_HOLD' && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[11px] font-bold border border-rose-200 whitespace-nowrap">
                                ระงับใช้งาน
                              </span>
                            )}

                            {isCompositeSet ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-800 font-semibold text-[11px] whitespace-nowrap">
                                ชุดเครื่องมือ
                              </span>
                            ) : isLogicalGroup ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-purple-900 font-bold text-[11px] whitespace-nowrap">
                                <FolderTree size={11} className="text-purple-600 shrink-0" />
                                <span>กลุ่มเครื่องมือ</span>
                              </span>
                            ) : null}
                          </div>

                          {/* Line 2: Single-line Method & Frequency + Unplanned / Unsaved Note */}
                          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                            <span className="font-medium text-slate-600">
                              {formatCleanSecondLine(item)}
                            </span>

                            {plannedMonthsCount === 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-medium">
                                {item.remarks ? `ไม่วางแผน (${item.remarks})` : 'ยังไม่ได้วางแผน'}
                              </span>
                            )}

                            {!isSavedPlanItem(item) && (
                              <span className="text-[11px] text-slate-400">
                                อยู่ในทะเบียนเครื่องมือ • ยังไม่บันทึกเข้าแผน
                              </span>
                            )}
                          </div>

                          {isLogicalGroup && !canEditPlan && activePlan?.status === 'APPROVED' && onOpenGroupWorkOrderCheck && (
                            <div className="pt-0.5">
                              <button
                                type="button"
                                onClick={() => onOpenGroupWorkOrderCheck(item)}
                                title="ตรวจรหัสลูกก่อนออกใบงาน"
                                aria-label="ตรวจรหัสลูกก่อนออกใบงาน"
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-100/70 hover:bg-purple-200 border border-purple-300 text-purple-950 font-bold text-xs transition-colors cursor-pointer"
                              >
                                <ShieldAlert size={12} className="text-purple-700 shrink-0" />
                                <span>ตรวจรหัสลูกก่อนออกใบงาน</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Columns 2-13: 12-Month Cells */}
                      {MONTHS.map((m) => (
                        <AnnualPlanMonthCell
                          key={`${item.id}-${m}`}
                          month={m}
                          item={item}
                          plan={activePlan}
                          workOrders={workOrders}
                          canEditPlan={canEditPlan && (item.asset_status || 'ACTIVE') === 'ACTIVE'}
                          isSaving={savingCellKey === `${item.id}-${m}`}
                          onQuickAddMonth={handleCellAddMonth}
                          onQuickRemoveMonth={handleCellRemoveMonth}
                          onToggleProvider={onToggleProvider}
                          onCreateWorkOrder={handleCellCreateWo}
                          onOpenGroupCheck={onOpenGroupWorkOrderCheck}
                          onOpenFullEdit={onOpenAddItem}
                          density="compact"
                        />
                      ))}

                      {/* Column 14: Spaced-Out Actions ([⚙️ ตั้งค่ารอบ] + [🗑️]) */}
                      <td className="py-3 px-3.5 align-middle text-right w-auto min-w-[156px] whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2 flex-nowrap">
                          {canEditPlan ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onOpenAddItem && onOpenAddItem(item)}
                                title="แก้ไขข้อมูลในแผน"
                                aria-label="ตั้งค่ารอบ / แก้ไขข้อมูลในแผน"
                                className="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-200 text-slate-700 hover:text-indigo-700 text-xs font-semibold transition-colors cursor-pointer shadow-2xs shrink-0"
                              >
                                <Settings size={13} className="text-slate-500 shrink-0" />
                                <span>ตั้งค่ารอบ</span>
                              </button>

                              {isSavedPlanItem(item) && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteItem(item)}
                                  title="นำออกจากแผน (เครื่องมือยังอยู่ในทะเบียน)"
                                  aria-label="นำออกจากแผน"
                                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-colors cursor-pointer shrink-0"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setInspectorItem(item)}
                              title="ดูสเปกและรายละเอียดเครื่องมือ"
                              aria-label="ดูสเปกและรายละเอียดเครื่องมือ"
                              className="whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 text-xs font-medium transition-colors cursor-pointer shrink-0"
                            >
                              <span>ดูรายละเอียด</span>
                            </button>
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
        <VccScrollIndicator canScrollLeft={canScrollLeft} canScrollRight={canScrollRight} />
      </div>

      {/* Discrete Table Footer with Clean Legend */}
      <div className="bg-slate-50/90 border-t border-slate-200/80 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div>
          {tableSearch.trim() || activeCategory ? (
            <>
              พบ <strong className="text-slate-900">{flatInstrumentRows.length}</strong> จาก {planItems.length} รายการ
              {activeCategory && <span className="ml-1.5 text-slate-500">(ประเภท: “{activeCategory}”)</span>}
            </>
          ) : (
            <span>
              รวมทั้งหมด <strong className="text-slate-900">{planItems.length}</strong> รายการเครื่องมือวัด
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3.5 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
            <span className="text-slate-700 font-medium">ภายใน: ทวนสอบภายในตามแผน</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-500 inline-block" />
            <span className="text-slate-700 font-medium">ภายนอก: สอบเทียบภายนอกตามแผน</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
            <span className="text-slate-700 font-medium">✓: ตรวจรับเสร็จสิ้นแล้ว</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-600 inline-block" />
            <span className="text-slate-700 font-medium">NC: พบข้อบกพร่อง / ระงับใช้</span>
          </span>
        </div>
      </div>

      {/* Confirmation Modal for Removing an Instrument from the Plan */}
      {confirmDeleteItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="ยืนยันการนำเครื่องมือออกจากแผน"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">ยืนยันนำเครื่องมือออกจากแผนประจำปี</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    ข้อมูลเครื่องมือจะยังคงอยู่ในทะเบียนเครื่องมือวัดตามปกติ
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDeleteItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200/80 px-3.5 py-2.5 text-xs text-slate-700">
              <span className="font-mono font-bold text-indigo-700">{confirmDeleteItem.asset_code}</span>{' '}
              <span className="font-semibold text-slate-900">
                {formatCleanAssetName(confirmDeleteItem.asset_name)}
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmDeleteItem(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = confirmDeleteItem;
                  setConfirmDeleteItem(null);
                  if (onDeleteItem) onDeleteItem(target);
                }}
                aria-label="ยืนยันนำออกจากแผน"
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-2xs cursor-pointer"
              >
                ยืนยันนำออกจากแผน
              </button>
            </div>
          </div>
        </div>
      )}

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
