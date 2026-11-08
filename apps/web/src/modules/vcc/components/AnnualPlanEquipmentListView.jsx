import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Info,
  Check,
  Building2,
  MapPin,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  ShieldAlert,
  ListFilter,
  X
} from 'lucide-react';
import { computeDueDateForMonth } from '../api/vccPlanApi';
import { isSavedPlanItem } from '../utils/planLabels';
import AnnualPlanSideInspector from './AnnualPlanSideInspector';

const MONTH_NAMES = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

const MONTH_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * Annual Plan Equipment List View (FM-QC-46)
 * Clean Minimal Luxury / Modern Enterprise SaaS
 * - Primary document-oriented equipment planning workspace
 * - Flat 1-row-per-instrument layout (no complicated 12-column horizontal scroll)
 * - Click-to-schedule 12-month pill bar
 * - Displays planned due dates and ISO 9001 compliance notice: "วางแผนเท่านั้น • ยังไม่มีหลักฐานใบงาน"
 * - Mobile responsive card mode with touch targets >= 44px
 */
export const AnnualPlanEquipmentListView = ({
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
  onOpenAddItem,
  onDeleteItem,
  onOpenGroupWorkOrderCheck,
  onOpenSmartImport,
  onQuickAddMonth,
  onQuickRemoveMonth,
  onCreateWorkOrder,
  onOpenJustificationModal
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL | PLANNED | UNPLANNED
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [inspectorItem, setInspectorItem] = useState(null);
  const [savingKey, setSavingKey] = useState('');
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [bottomSheetItem, setBottomSheetItem] = useState(null);
  const extraFilterCount = (filterYear ? 1 : 0) + (filterDept ? 1 : 0);

  // Close bottom sheet on Escape
  useEffect(() => {
    if (!bottomSheetItem) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setBottomSheetItem(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [bottomSheetItem]);

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set();
    planItems.forEach((item) => {
      if (item.asset_type) set.add(item.asset_type);
    });
    return Array.from(set);
  }, [planItems]);

  // Filter items
  const filteredItems = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();

    return planItems.filter((item) => {
      // 1. Status Filter
      const hasPlan = Array.isArray(item.planned_months) && item.planned_months.length > 0;
      if (statusFilter === 'PLANNED' && !hasPlan) return false;
      if (statusFilter === 'UNPLANNED' && hasPlan) return false;

      // 2. Category Filter
      if (categoryFilter !== 'ALL' && item.asset_type !== categoryFilter) {
        return false;
      }

      // 3. Search Keyword
      if (q) {
        const code = (item.asset_code || '').toLowerCase();
        const name = (item.asset_name || '').toLowerCase();
        const loc = (item.location || '').toLowerCase();
        const provider = (item.provider_name || '').toLowerCase();
        const dept = (item.responsible_dept || item.asset_department || '').toLowerCase();
        const type = (item.asset_type || '').toLowerCase();

        const matches =
          code.includes(q) ||
          name.includes(q) ||
          loc.includes(q) ||
          provider.includes(q) ||
          dept.includes(q) ||
          type.includes(q);

        if (!matches) return false;
      }

      return true;
    });
  }, [planItems, searchTerm, statusFilter, categoryFilter]);

  // Compute work orders map: key = `${plan_item_id}-${planned_month}` or `${asset_id}-${planned_month}`
  const workOrderMap = useMemo(() => {
    const map = new Map();
    (workOrders || []).forEach((wo) => {
      const m = Number(wo.planned_month);
      if (wo.plan_item_id && m) {
        map.set(`${wo.plan_item_id}-${m}`, wo);
      }
      if (wo.asset_id && m) {
        map.set(`${wo.asset_id}-${m}`, wo);
      }
    });
    return map;
  }, [workOrders]);

  const handleToggleMonth = async (item, month) => {
    if (!canEditPlan || !activePlan) return;
    const currentMonths = item.planned_months || [];
    const isSelected = currentMonths.includes(month);
    const key = `${item.id}-${month}`;

    setSavingKey(key);
    try {
      if (isSelected) {
        if (onQuickRemoveMonth) await onQuickRemoveMonth(item, month);
      } else {
        if (onQuickAddMonth) await onQuickAddMonth(item, month);
      }
    } finally {
      setSavingKey('');
    }
  };

  const handleWorkOrderClick = async (item, month) => {
    if (onCreateWorkOrder) {
      await onCreateWorkOrder(item, month);
    }
  };

  return (
    <div
      data-testid="annual-plan-equipment-list-view"
      className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden space-y-0"
    >
      {/* ─────────────────────────────────────────────────────────────
          TOOLBAR: Search + Status Filter + Category Filter + Add Actions
          ───────────────────────────────────────────────────────────── */}
      <div className="p-3.5 sm:p-4 border-b border-slate-200/80 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Search & Filter Tabs */}
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              aria-label="ค้นหารายการเครื่องมือในแผน"
              placeholder="ค้นหารหัส, ชื่อเครื่องมือ, สถานที่..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-8.5 pl-8 pr-3 rounded-lg border border-slate-300 text-xs bg-white text-slate-800 shadow-2xs hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-sans"
            />
          </div>

          {/* Quick Status Filter Pills */}
          <div className="inline-flex items-center gap-1 p-0.5 bg-slate-200/70 rounded-lg text-xs font-semibold">
            <button
              type="button"
              aria-pressed={statusFilter === 'ALL'}
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ทั้งหมด ({planItems.length})
            </button>
            <button
              type="button"
              aria-pressed={statusFilter === 'PLANNED'}
              onClick={() => setStatusFilter('PLANNED')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                statusFilter === 'PLANNED'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              มีแผนแล้ว
            </button>
            <button
              type="button"
              aria-pressed={statusFilter === 'UNPLANNED'}
              onClick={() => setStatusFilter('UNPLANNED')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                statusFilter === 'UNPLANNED'
                  ? 'bg-white text-amber-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ยังไม่กำหนดรอบ
            </button>
          </div>

          {/* กรองปี/แผนก */}
          {(availableYears.length > 0 || activeDepartments.length > 0) && (
            <div className="relative">
              <button
                type="button"
                aria-haspopup="true"
                aria-expanded={filterOpen}
                onClick={() => setFilterOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 h-8.5 px-3 rounded-lg border text-xs font-semibold cursor-pointer shadow-2xs transition-colors ${
                  extraFilterCount > 0
                    ? 'border-indigo-300 bg-indigo-50/70 text-indigo-700'
                    : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <ListFilter size={13} className={extraFilterCount > 0 ? 'text-indigo-600' : 'text-slate-500'} />
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

          {/* Category Filter Dropdown */}
          {categories.length > 0 && (
            <select
              aria-label="กรองประเภทเครื่องมือ"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-8.5 px-2.5 rounded-lg border border-slate-300 text-xs font-medium bg-white text-slate-700 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
            >
              <option value="ALL">ทุกประเภท ({categories.length})</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Right: Add Instrument Action */}
        {canEditPlan && (
          <div className="flex items-center gap-2 shrink-0">
            {onOpenSmartImport && (
              <button
                type="button"
                onClick={onOpenSmartImport}
                className="inline-flex items-center gap-1.5 h-8.5 px-3 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs border border-indigo-200 shadow-2xs transition-colors cursor-pointer"
              >
                <Plus size={13} />
                <span>เพิ่มเครื่องมือจากทะเบียน</span>
              </button>
            )}

            {onOpenAddItem && (
              <button
                type="button"
                onClick={() => onOpenAddItem()}
                className="inline-flex items-center gap-1.5 h-8.5 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
              >
                <Plus size={13} className="text-slate-500" />
                <span>กำหนดเครื่องมือ</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          EMPTY STATE: When no items match filters or plan is empty
          ───────────────────────────────────────────────────────────── */}
      {filteredItems.length === 0 ? (
        <div className="p-12 text-center space-y-2.5">
          <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Calendar size={20} />
          </div>
          <div className="text-sm font-bold text-slate-700">
            {searchTerm || statusFilter !== 'ALL' || categoryFilter !== 'ALL'
              ? 'ไม่พบเครื่องมือที่ตรงกับตัวกรองที่เลือก'
              : 'ยังไม่มีรายการเครื่องมือในแผนการทวนสอบประจำปีนี้'}
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {searchTerm || statusFilter !== 'ALL'
              ? 'ลองปรับเปลี่ยนคำค้นหา หรือล้างตัวกรองเพื่อดูเครื่องมือทั้งหมด'
              : 'คุณสามารถกดปุ่ม "+ เพิ่มจากทะเบียน" ด้านบน เพื่อดึงเครื่องมือที่เปิดใช้งานอยู่เข้าสู่แผนนี้'}
          </p>
          {canEditPlan && onOpenSmartImport && (
            <button
              type="button"
              onClick={onOpenSmartImport}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-2xs cursor-pointer mt-1"
            >
              <Plus size={13} />
              <span>+ เพิ่มเครื่องมือจากทะเบียนเข้าสู่แผน</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* ─────────────────────────────────────────────────────────────
              EQUIPMENT LIST TABLE: Clean Responsive Table with Horizontal Scroll
              ───────────────────────────────────────────────────────────── */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs min-w-[720px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3.5 w-44 sticky left-0 bg-slate-50 z-10">รหัสเครื่องมือ</th>
                  <th className="py-2.5 px-3.5">ชื่อเครื่องมือ / ข้อมูล</th>
                  <th className="py-2.5 px-3 w-32">กำหนดทวนสอบ</th>
                  <th className="py-2.5 px-3 w-72">กำหนดเดือนที่วางแผน (ม.ค. - ธ.ค.)</th>
                  <th className="py-2.5 px-3 w-36">สถานะการวางแผน</th>
                  <th className="py-2.5 px-3 w-24 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredItems.map((item, idx) => {
                  const plannedMonths = item.planned_months || [];
                  const plannedMonthsCount = plannedMonths.length;
                  const isPlanned = plannedMonthsCount > 0;
                  const isEven = idx % 2 === 0;

                  const isGroup = Number(item.is_group) === 1;
                  const isCompositeSet = Boolean(item.is_composite_set || item.group_nature === 'COMPOSITE_SET');
                  const isLogicalGroup = isGroup && !isCompositeSet;

                  const itemWos = (workOrders || []).filter(
                    (w) => w.plan_item_id === item.id || (w.plan_id === activePlan?.id && w.asset_id === item.asset_id)
                  );
                  const hasHoldOrNc = itemWos.some((w) => w.nc_status === 'OPEN' || w.result_status === 'FAIL') || item.asset_status === 'ON_HOLD';
                  const closedPassCount = itemWos.filter((w) => w.status === 'CLOSED' && w.result_status === 'PASS').length;

                  return (
                    <tr
                      key={item.id || item.asset_id}
                      className={`hover:bg-indigo-50/30 transition-colors ${
                        isEven ? 'bg-white' : 'bg-slate-50/40'
                      }`}
                    >
                      {/* 1. Asset Code & Category */}
                      <td className="py-2.5 px-3.5 align-top sticky left-0 bg-inherit z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]">
                        <div className="space-y-0.5">
                          <button
                            type="button"
                            onClick={() => setInspectorItem(item)}
                            className="font-mono font-bold text-indigo-900 hover:text-indigo-600 hover:underline cursor-pointer block text-left"
                            title="คลิกเพื่อดูรายละเอียดเครื่องมือ"
                          >
                            {item.asset_code}
                          </button>
                          <div className="flex items-center gap-1 flex-wrap">
                            {item.asset_type && (
                              <span className="inline-block text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200/60 font-medium">
                                {item.asset_type}
                              </span>
                            )}
                            {isCompositeSet ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-teal-50 border border-teal-200 text-teal-800 font-semibold text-[10px]">
                                <span>ชุดเครื่องมือ (Composite Set)</span>
                              </span>
                            ) : isLogicalGroup ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-purple-50 border border-purple-200 text-purple-900 font-bold text-[10px]">
                                <span>กลุ่มเครื่องมือ (Group)</span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      {/* 2. Asset Name & Location / Model */}
                      <td className="py-2.5 px-3.5 align-top">
                        <div className="space-y-0.5">
                          <div className="font-semibold text-slate-800 leading-tight flex items-center gap-1.5 flex-wrap">
                            <span>{item.asset_name}</span>
                            {item.brand && (
                              <span className="text-slate-500 font-normal text-xs">({item.brand})</span>
                            )}
                          </div>
                          {(item.mpe || item.acceptance_criteria || item.calibration_points) && (
                            <div className="flex items-center gap-1.5 flex-wrap text-[10px] pt-0.5">
                              {item.mpe && (
                                <span className="bg-amber-50 text-amber-900 border border-amber-200/80 px-1.5 py-0.2 rounded font-medium">
                                  MPE: {item.mpe}
                                </span>
                              )}
                              {item.calibration_points && (
                                <span className="bg-blue-50 text-blue-900 border border-blue-200/80 px-1.5 py-0.2 rounded font-medium">
                                  จุดวัด: {item.calibration_points}
                                </span>
                              )}
                              {item.acceptance_criteria && (
                                <span className="bg-emerald-50 text-emerald-900 border border-emerald-200/80 px-1.5 py-0.2 rounded font-medium">
                                  เกณฑ์: {item.acceptance_criteria}
                                </span>
                              )}
                            </div>
                          )}
                          {isCompositeSet && item.composite_details && (
                            <div className="text-xs text-teal-800 leading-snug line-clamp-2">
                              อุปกรณ์ในชุด: {item.composite_details}
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                            {item.location && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin size={11} className="text-slate-400" />
                                <span>{item.location}</span>
                              </span>
                            )}
                            {item.provider_name && (
                              <span className="text-slate-400">· {item.provider_name}</span>
                            )}
                            {item.frequency_label && (
                              <span className="text-slate-400">· รอบ: {item.frequency_label}</span>
                            )}
                          </div>
                          {isLogicalGroup && !canEditPlan && activePlan?.status === 'APPROVED' && onOpenGroupWorkOrderCheck && (
                            <div className="pt-1">
                              <button
                                type="button"
                                onClick={() => onOpenGroupWorkOrderCheck(item)}
                                title="ตรวจรหัสลูกก่อนออกใบงาน"
                                aria-label="ตรวจรหัสลูกก่อนออกใบงาน"
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-100 hover:bg-purple-200 border border-purple-300 text-purple-950 font-bold text-xs transition-colors cursor-pointer"
                              >
                                <ShieldAlert size={12} className="text-purple-700 shrink-0" />
                                <span>ตรวจรหัสลูกก่อนออกใบงาน</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 3. Due Date */}
                      <td className="py-2.5 px-3 align-top">
                        <div className="space-y-0.5">
                          {isPlanned ? (
                            plannedMonths.map((m) => {
                              const calculatedDue = computeDueDateForMonth(
                                activePlan?.plan_year || new Date().getFullYear(),
                                m,
                                activePlan?.due_date_rule || 'END_OF_MONTH'
                              );
                              return (
                                <div key={m} className="font-mono text-[11px] font-semibold text-slate-800">
                                  {calculatedDue}
                                </div>
                              );
                            })
                          ) : (
                            <span className="text-slate-400 text-xs font-mono">-</span>
                          )}
                        </div>
                      </td>

                      {/* 4. Interactive 12-Month Pill Bar */}
                      <td className="py-2.5 px-3 align-top">
                        <div className="space-y-1.5">
                          {/* Desktop Pill Bar (12 Months) */}
                          <div className="hidden sm:flex items-center gap-1 flex-wrap">
                            {MONTH_NUMBERS.map((m) => {
                              const isSelected = plannedMonths.includes(m);
                              const isSaving = savingKey === `${item.id}-${m}`;
                              const wo = workOrderMap.get(`${item.id}-${m}`) || (item.asset_id ? workOrderMap.get(`${item.asset_id}-${m}`) : null);
                              const isClosedPass = wo?.status === 'CLOSED' && wo?.result_status === 'PASS';

                              return isClosedPass ? (
                                <span
                                  key={m}
                                  title={`เดือน ${m} (${MONTH_NAMES[m - 1]}): ทวนสอบผ่านแล้ว ใบรับรอง ${wo.cert_no || wo.id}`}
                                  className="w-7 h-6 rounded text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 shadow-2xs flex items-center justify-center font-mono cursor-default"
                                >
                                  A{m}
                                </span>
                              ) : (
                                <button
                                  key={m}
                                  type="button"
                                  disabled={!canEditPlan || isSaving}
                                  onClick={() => handleToggleMonth(item, m)}
                                  aria-label={`${item.asset_code} ${MONTH_NAMES[m - 1]} ${isSelected ? 'ยกเลิกกำหนดการ' : 'กำหนดการ'}`}
                                  title={`${item.asset_code} - ${MONTH_NAMES[m - 1]} (รอบ P${m}) — ${isSelected ? 'คลิกเพื่อยกเลิก' : 'คลิกเพื่อกำหนดรอบ'}`}
                                  className={`w-7 h-6 rounded text-[10px] font-semibold transition-all flex items-center justify-center cursor-pointer ${
                                    isSelected
                                      ? 'bg-indigo-600 text-white font-bold border border-indigo-600 shadow-2xs hover:bg-indigo-700'
                                      : canEditPlan
                                      ? 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 hover:border-slate-300 font-medium'
                                      : 'bg-slate-50 text-slate-300 border border-slate-100 cursor-not-allowed'
                                  }`}
                                >
                                  {isSaving ? '...' : MONTH_NAMES[m - 1]}
                                </button>
                              );
                            })}
                          </div>

                          {/* Mobile Touch Action Button (min-h-[44px] for Touch Targets) */}
                          <div className="sm:hidden">
                            <button
                              type="button"
                              onClick={() => setBottomSheetItem(item)}
                              aria-label={`กำหนดเดือนสำหรับ ${item.asset_code}`}
                              className="w-full min-h-[44px] inline-flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 hover:bg-indigo-50/60 border border-slate-200 active:bg-indigo-100 text-slate-800 font-semibold text-xs transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-1.5">
                                <Calendar size={14} className="text-indigo-600 shrink-0" />
                                <span>กำหนดเดือน:</span>
                              </div>
                              <span className="font-bold text-indigo-700">
                                {plannedMonths.length > 0
                                  ? plannedMonths.map((m) => MONTH_NAMES[m - 1]).join(', ')
                                  : 'ยังไม่กำหนด'}
                              </span>
                            </button>
                          </div>

                          {/* Compliance Status Notice */}
                          {hasHoldOrNc ? (
                            <div className="flex items-center gap-1.5 text-[10px] text-rose-700 font-semibold">
                              <AlertTriangle size={11} className="text-rose-600 shrink-0" />
                              <span>พบข้อบกพร่อง / ระงับใช้ (NC)</span>
                            </div>
                          ) : plannedMonthsCount > 0 && closedPassCount >= plannedMonthsCount ? (
                            <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 font-semibold">
                              <CheckCircle2 size={11} className="text-emerald-600 shrink-0" />
                              <span>ทวนสอบเสร็จแล้ว • มีใบรับรอง</span>
                            </div>
                          ) : closedPassCount > 0 ? (
                            <div className="flex items-center gap-1.5 text-[10px] text-indigo-700 font-semibold">
                              <CheckCircle2 size={11} className="text-indigo-600 shrink-0" />
                              <span>เสร็จบางรอบ ({closedPassCount}/{plannedMonthsCount})</span>
                            </div>
                          ) : itemWos.some((w) => w.status === 'OPEN' || w.status === 'PENDING_REVIEW') ? (
                            <div className="flex items-center gap-1.5 text-[10px] text-sky-700 font-semibold">
                              <Clock size={11} className="text-sky-600 shrink-0" />
                              <span>มีใบงานกำลังดำเนินการ</span>
                            </div>
                          ) : isPlanned ? (
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                              <span>วางแผนเท่านั้น • ยังไม่มีหลักฐานใบงาน</span>
                            </div>
                          ) : null}

                          {/* Work Order Actions if Plan is APPROVED */}
                          {activePlan?.status === 'APPROVED' && isPlanned && (
                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                              {plannedMonths.map((m) => {
                                const wo = workOrderMap.get(`${item.id}-${m}`) || (item.asset_id ? workOrderMap.get(`${item.asset_id}-${m}`) : null);
                                return (
                                  <div key={m} className="inline-flex items-center gap-1">
                                    {wo ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 font-mono">
                                        <CheckCircle2 size={10} />
                                        <span>WO-{wo.id?.slice(0, 5)} ({MONTH_NAMES[m - 1]})</span>
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleWorkOrderClick(item, m)}
                                        className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded border border-indigo-200 transition-colors cursor-pointer"
                                      >
                                        <FileText size={10} />
                                        <span>ออกใบงาน ({MONTH_NAMES[m - 1]})</span>
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 5. Planning Status */}
                      <td className="py-2.5 px-3 align-top">
                        {isPlanned ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80">
                              <CheckCircle2 size={11} />
                              <span>วางแผนแล้ว ({plannedMonths.length} รอบ)</span>
                            </span>
                            {item.remarks && (
                              <div className="text-[10px] text-slate-500 italic truncate max-w-[140px]" title={item.remarks}>
                                หมายเหตุ: {item.remarks}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                                item.remarks
                                  ? 'text-slate-600 bg-slate-100 border-slate-200'
                                  : 'text-amber-700 bg-amber-50 border-amber-200/80'
                              }`}
                            >
                              <Clock size={11} />
                              <span>ยังไม่กำหนดรอบ</span>
                            </span>
                            {item.remarks ? (
                              <div className="text-[10px] text-slate-600 truncate max-w-[140px]" title={item.remarks}>
                                เหตุผล: {item.remarks}
                              </div>
                            ) : (
                              canEditPlan && onOpenJustificationModal && (
                                <button
                                  type="button"
                                  onClick={onOpenJustificationModal}
                                  className="text-[10px] text-amber-700 underline font-semibold cursor-pointer block hover:text-amber-900"
                                >
                                  + ระบุเหตุผล
                                </button>
                              )
                            )}
                          </div>
                        )}
                      </td>

                      {/* 6. Row Actions */}
                      <td className="py-2.5 px-3 align-top text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setInspectorItem(item)}
                            title="ดูสเปกเครื่องมือ"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 border border-slate-200 cursor-pointer"
                          >
                            สเปก
                          </button>

                          <button
                            type="button"
                            onClick={() => setInspectorItem(item)}
                            title="ดูข้อมูลเครื่องมืออย่างละเอียด"
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                          >
                            <Info size={14} />
                          </button>

                          {canEditPlan && isSavedPlanItem(item) && onDeleteItem && (
                            <button
                              type="button"
                              onClick={() => onDeleteItem(item)}
                              title="นำเครื่องมือนี้ออกจากแผน"
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Side Inspector Drawer */}
      {inspectorItem && (
        <AnnualPlanSideInspector
          item={inspectorItem}
          activePlan={activePlan}
          workOrders={workOrders}
          onClose={() => setInspectorItem(null)}
        />
      )}

      {/* Mobile Bottom Sheet for Month Selection */}
      {bottomSheetItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`กำหนดเดือนทวนสอบ ${bottomSheetItem.asset_code}`}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-2xs transition-opacity cursor-pointer"
            onClick={() => setBottomSheetItem(null)}
            aria-hidden="true"
          />

          {/* Sheet Container */}
          <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 sm:p-5 max-h-[90vh] overflow-y-auto space-y-4 z-10">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <div className="text-xs font-bold text-indigo-700 font-mono">
                  {bottomSheetItem.asset_code}
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  กำหนดเดือนทวนสอบประจำปี {activePlan?.plan_year}
                </h3>
                <p className="text-xs text-slate-500 truncate max-w-[240px]">
                  {bottomSheetItem.asset_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBottomSheetItem(null)}
                aria-label="ปิดหน้าต่างกำหนดเดือน"
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* 12-Month Grid (3 cols x 4 rows) with touch targets >= 48px */}
            <div className="grid grid-cols-3 gap-2">
              {MONTH_NUMBERS.map((m) => {
                const currentMonths = bottomSheetItem.planned_months || [];
                const isSelected = currentMonths.includes(m);
                const isSaving = savingKey === `${bottomSheetItem.id}-${m}`;
                const due = computeDueDateForMonth(
                  activePlan?.plan_year || new Date().getFullYear(),
                  m,
                  activePlan?.due_date_rule || 'END_OF_MONTH'
                );

                return (
                  <button
                    key={m}
                    type="button"
                    disabled={!canEditPlan || isSaving}
                    onClick={async () => {
                      await handleToggleMonth(bottomSheetItem, m);
                      setBottomSheetItem((prev) => {
                        if (!prev) return prev;
                        const curr = prev.planned_months || [];
                        const next = curr.includes(m)
                          ? curr.filter((x) => x !== m)
                          : [...curr, m].sort((a, b) => a - b);
                        return { ...prev, planned_months: next };
                      });
                    }}
                    className={`min-h-[52px] p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">{MONTH_NAMES[m - 1]}</span>
                      {isSelected && <Check size={14} className="text-white" />}
                    </div>
                    <span className={`text-[10px] font-mono ${isSelected ? 'text-indigo-100' : 'text-slate-400'}`}>
                      {due}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Bottom Sheet Close Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setBottomSheetItem(null)}
                className="w-full min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer flex items-center justify-center"
              >
                เสร็จสิ้น
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnualPlanEquipmentListView;
