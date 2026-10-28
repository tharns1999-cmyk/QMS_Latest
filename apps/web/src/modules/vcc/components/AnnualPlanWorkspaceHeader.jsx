import React, { useState, useRef, useEffect } from 'react';
import {
  MoreHorizontal,
  Plus,
  History,
  Edit3,
  BookOpen,
  SlidersHorizontal,
  ListFilter,
  CheckCircle2
} from 'lucide-react';
import { PLAN_STATUS_OPTIONS, getDueDateRuleLabel } from '../utils/planLabels';

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

const selectClass =
  'px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium bg-white text-slate-700 focus:outline-none focus:border-indigo-600';

/**
 * พื้นที่บริบทของแผน: เลือกแผน + กรอง + เมนูรอง (แทนปุ่มและแถบสถานะเดิมหลายชั้น)
 * ข้อมูลทุกอย่างมาจากแผนที่เลือกจริง ไม่มีค่าตายตัว
 */
export const AnnualPlanWorkspaceHeader = ({
  statusTab,
  setStatusTab,
  filterYear,
  setFilterYear,
  availableYears = [],
  filterDept,
  setFilterDept,
  activeDepartments = [],
  plans = [],
  selectedPlanId,
  onSelectPlan,
  activePlan,
  planItems = [],
  canEditPlan = false,
  onOpenSettings,
  onOpenCreatePlan,
  onOpenEditPlan,
  onOpenHistory
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const menuRef = useDismiss(menuOpen, () => setMenuOpen(false));
  const filterRef = useDismiss(filterOpen, () => setFilterOpen(false));

  const extraFilterCount = (filterYear ? 1 : 0) + (filterDept ? 1 : 0);

  const runMenu = (fn) => () => {
    setMenuOpen(false);
    if (fn) fn();
  };

  const menuItemClass =
    'w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* ตัวเลือกแผน: ระบุปี แผนก และฉบับของแผนที่เลือกในที่เดียว */}
        <select
          aria-label="เลือกแผนประจำปี"
          value={selectedPlanId || ''}
          onChange={(e) => onSelectPlan(e.target.value)}
          disabled={plans.length === 0}
          className={`${selectClass} font-bold text-slate-900 w-full sm:w-auto sm:min-w-[15rem] max-w-full`}
        >
          {plans.length === 0 && <option value="">ไม่มีแผนในสถานะนี้</option>}
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              ปี {p.plan_year} · แผนก {p.department} · {p.document_code} Rev.{p.revision}
            </option>
          ))}
        </select>

        {/* กรองตามสถานะของแผน (แทนแท็บสถานะ 5 ปุ่ม) */}
        <select
          aria-label="กรองตามสถานะแผน"
          value={statusTab}
          onChange={(e) => setStatusTab(e.target.value)}
          className={selectClass}
        >
          {PLAN_STATUS_OPTIONS.map((s) => (
            <option key={s.key} value={s.key}>
              สถานะ: {s.label}
            </option>
          ))}
        </select>

        {/* ปี/แผนก รวมเป็นตัวกรองเสริมตัวเดียว */}
        <div className="relative" ref={filterRef}>
          <button
            type="button"
            aria-haspopup="true"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            <ListFilter size={13} className="text-slate-500" />
            <span>กรองปี/แผนก{extraFilterCount > 0 ? ` (${extraFilterCount})` : ''}</span>
          </button>
          {filterOpen && (
            <div className="absolute left-0 top-full mt-1 z-40 w-64 bg-white rounded-xl border border-slate-200 shadow-lg p-3 space-y-2">
              <label className="block text-[11px] font-semibold text-slate-500">
                ปีของแผน
                <select
                  aria-label="กรองตามปีของแผน"
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className={`${selectClass} w-full mt-1`}
                >
                  <option value="">ทุกปี</option>
                  {availableYears.map((yr) => (
                    <option key={yr} value={String(yr)}>
                      {yr} (พ.ศ. {yr + 543})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] font-semibold text-slate-500">
                แผนก
                <select
                  aria-label="กรองแผนตามแผนก"
                  value={filterDept}
                  onChange={(e) => setFilterDept(e.target.value)}
                  className={`${selectClass} w-full mt-1`}
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

        {/* เมนูรอง: งานที่ไม่ได้ใช้บ่อย */}
        <div className="relative ml-auto" ref={menuRef}>
          <button
            type="button"
            aria-label="เมนูเพิ่มเติมของแผน"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            <MoreHorizontal size={15} />
            <span className="hidden sm:inline">เพิ่มเติม</span>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 z-40 w-56 bg-white rounded-xl border border-slate-200 shadow-lg py-1"
            >
              {canEditPlan && activePlan && (
                <button type="button" role="menuitem" className={menuItemClass} onClick={runMenu(() => onOpenEditPlan(activePlan))}>
                  <Edit3 size={13} className="text-slate-500" />
                  <span>แก้ไขหัวแผน</span>
                </button>
              )}
              <button type="button" role="menuitem" className={menuItemClass} onClick={runMenu(onOpenCreatePlan)}>
                <Plus size={13} className="text-slate-500" />
                <span>สร้างแผนประจำปีใหม่</span>
              </button>
              {activePlan && (
                <button type="button" role="menuitem" className={menuItemClass} onClick={runMenu(onOpenHistory)}>
                  <History size={13} className="text-slate-500" />
                  <span>ประวัติการอนุมัติ</span>
                </button>
              )}
              <button type="button" role="menuitem" className={menuItemClass} onClick={runMenu(onOpenSettings)}>
                <SlidersHorizontal size={13} className="text-slate-500" />
                <span>ตั้งค่าแผนและเกณฑ์อนุมัติ</span>
              </button>
              <button type="button" role="menuitem" className={menuItemClass} onClick={runMenu(() => setGuideOpen((v) => !v))}>
                <BookOpen size={13} className="text-indigo-600" />
                <span>{guideOpen ? 'ซ่อนข้อกำหนดการใช้แผน' : 'ข้อกำหนดการใช้แผน'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ข้อมูลของแผนที่เลือก แสดงครั้งเดียว */}
      {activePlan && (
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900 tracking-tight truncate" title={activePlan.title}>
            {activePlan.title}
          </h2>
          <p className="text-xs text-slate-500">
            {activePlan.department_name_th
              ? `${activePlan.department_name_th} (${activePlan.department})`
              : `แผนก ${activePlan.department}`}
            {' · '}
            {planItems.length} รายการ
            {getDueDateRuleLabel(activePlan.due_date_rule) && ` · ${getDueDateRuleLabel(activePlan.due_date_rule)}`}
          </p>
        </div>
      )}

      {guideOpen && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 space-y-1.5">
          <div className="font-bold text-slate-800">ข้อกำหนดการใช้แผน (FM-QC-46)</div>
          <ul className="space-y-1 text-[11.5px]">
            <li className="flex items-start gap-1.5">
              <CheckCircle2 size={13} className="text-indigo-600 shrink-0 mt-0.5" />
              <span>เดือนที่วางแผนไว้ไม่ใช่หลักฐานว่าทำเสร็จ ผลจริงจะขึ้นเมื่อตรวจรับใบสั่งงานเรียบร้อยแล้ว</span>
            </li>
            <li className="flex items-start gap-1.5">
              <CheckCircle2 size={13} className="text-indigo-600 shrink-0 mt-0.5" />
              <span>เครื่องมือแบบกลุ่มต้องเลือกรหัสเครื่องมือรายตัวก่อนออกใบสั่งงาน</span>
            </li>
            <li className="flex items-start gap-1.5">
              <CheckCircle2 size={13} className="text-indigo-600 shrink-0 mt-0.5" />
              <span>วันครบกำหนดคำนวณอัตโนมัติจากเดือนที่วางแผน ตามกติกาที่ตั้งค่าไว้ในแผน</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default AnnualPlanWorkspaceHeader;
