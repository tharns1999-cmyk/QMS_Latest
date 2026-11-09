import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Building2,
  Plus,
  Search,
  X,
  FileText,
  Clock,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Filter,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { toBuddhistYear, formatVccDateTime } from '../utils/vccDateUtils';
import { getPlanStatusLabel, formatPlanDocCode } from '../utils/planLabels';

/**
 * Status tone mapping for enterprise badge presentation
 */
const getStatusTone = (plan) => {
  const isSuperseded =
    plan.effective_status === 'SUPERSEDED' ||
    (plan.status === 'APPROVED' && Number(plan.is_current) === 0);

  if (isSuperseded) {
    return {
      bg: 'bg-slate-100',
      text: 'text-slate-600',
      border: 'border-slate-200',
      label: 'ถูกแทนที่แล้ว (SUPERSEDED)'
    };
  }

  switch (plan.status) {
    case 'APPROVED':
      return {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        label: 'มีผลบังคับใช้ (Effective)'
      };
    case 'PENDING_APPROVAL':
      return {
        bg: 'bg-indigo-50',
        text: 'text-indigo-700',
        border: 'border-indigo-200',
        label: 'รออนุมัติ (Pending Approval)'
      };
    case 'PENDING_REVIEW':
      return {
        bg: 'bg-amber-50',
        text: 'text-amber-800',
        border: 'border-amber-200',
        label: 'รอทบทวน (In Review)'
      };
    case 'REJECTED':
      return {
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200',
        label: 'รอปรับปรุง (Returned)'
      };
    default:
      return {
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-200',
        label: 'ร่างแผน (Draft)'
      };
  }
};

const getActionButtonText = (plan) => {
  const isSuperseded =
    plan.effective_status === 'SUPERSEDED' ||
    (plan.status === 'APPROVED' && Number(plan.is_current) === 0);

  if (isSuperseded) return 'ดูประวัติ';
  switch (plan.status) {
    case 'DRAFT':
      return 'ดำเนินการต่อ';
    case 'PENDING_REVIEW':
      return 'ตรวจทบทวน';
    case 'PENDING_APPROVAL':
      return 'พิจารณาอนุมัติ';
    case 'APPROVED':
      return 'เปิดแผนงาน';
    case 'REJECTED':
      return 'แก้ไขตามส่งกลับ';
    default:
      return 'เปิดแผนงาน';
  }
};

/**
 * PAGE A: ANNUAL PLAN REGISTER
 * Structured Data Table view of all annual plans accessible to the user.
 * Sorted by latest year first, discoverable search and status filtering.
 */
export const AnnualPlanRegisterTable = ({
  plans = [],
  activeDepartments = [],
  canReadAll = false,
  userDept = '',
  filterYear = '',
  setFilterYear,
  filterDept = '',
  setFilterDept,
  statusTab = 'ALL',
  setStatusTab,
  onSelectPlan,
  onOpenCreatePlan,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Extract all available years from plans (descending order)
  const availableYears = useMemo(() => {
    const yrs = Array.from(new Set(plans.map((p) => p.plan_year).filter(Boolean)));
    return yrs.sort((a, b) => Number(b) - Number(a));
  }, [plans]);

  // Department name lookup
  const userDeptInfo = useMemo(() => {
    return activeDepartments.find((d) => d.code === userDept) || {
      code: userDept,
      nameTh: userDept
    };
  }, [activeDepartments, userDept]);

  // Sort plans: latest year first, then department, then revision descending
  const sortedPlans = useMemo(() => {
    return [...plans].sort((a, b) => {
      const yearDiff = Number(b.plan_year || 0) - Number(a.plan_year || 0);
      if (yearDiff !== 0) return yearDiff;
      const deptDiff = String(a.department || '').localeCompare(String(b.department || ''));
      if (deptDiff !== 0) return deptDiff;
      return Number(b.revision || 1) - Number(a.revision || 1);
    });
  }, [plans]);

  // Filtered plans based on search, year, department, and status
  const filteredPlans = useMemo(() => {
    return sortedPlans.filter((p) => {
      // 1. Year filter
      if (filterYear && String(p.plan_year) !== String(filterYear)) return false;

      // 2. Department filter
      if (filterDept && p.department !== filterDept) return false;

      // 3. Status filter
      if (statusTab && statusTab !== 'ALL') {
        const isSuperseded =
          p.effective_status === 'SUPERSEDED' ||
          (p.status === 'APPROVED' && Number(p.is_current) === 0);
        if (statusTab === 'SUPERSEDED') {
          if (!isSuperseded) return false;
        } else {
          if (isSuperseded) return false;
          if (p.status !== statusTab) return false;
        }
      }

      // 4. Text search
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const docCode = formatPlanDocCode(p).toLowerCase();
        const title = String(p.title || '').toLowerCase();
        const dept = String(p.department || '').toLowerCase();
        const deptTh = String(p.department_name_th || '').toLowerCase();
        const yr = String(p.plan_year || '');
        const thYr = String(Number(p.plan_year || 0) + 543);
        const rev = `rev.${p.revision || ''}`.toLowerCase();

        return (
          docCode.includes(query) ||
          title.includes(query) ||
          dept.includes(query) ||
          deptTh.includes(query) ||
          yr.includes(query) ||
          thYr.includes(query) ||
          rev.includes(query)
        );
      }

      return true;
    });
  }, [sortedPlans, filterYear, filterDept, statusTab, searchQuery]);

  const hasActiveFilters = Boolean(filterYear || (filterDept && canReadAll) || (statusTab && statusTab !== 'ALL') || searchQuery);

  const resetFilters = () => {
    if (setFilterYear) setFilterYear('');
    if (canReadAll && setFilterDept) setFilterDept('');
    if (setStatusTab) setStatusTab('ALL');
    setSearchQuery('');
  };

  return (
    <div data-testid="annual-plan-register-page" className="space-y-4">
      {/* ─────────────────────────────────────────────────────────────
          1. Page Header (Clean, minimal, 1 primary action)
          ───────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              แผนการทวนสอบเครื่องมือประจำปี
            </h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
              ทะเบียนแผนประจำปี (Annual Plan Register)
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            จัดการและติดตามแผนการทวนสอบและสอบเทียบประจำปีตามข้อกำหนด ISO 9001:2015 (ข้อ 7.1.5)
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onOpenCreatePlan && onOpenCreatePlan()}
            aria-label="สร้างแผนประจำปี"
            className="inline-flex items-center gap-1.5 h-9.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs sm:text-sm shadow-xs transition-colors cursor-pointer"
          >
            <Plus size={16} />
            <span>สร้างแผนประจำปี</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. Search & Filter Bar (Compact, unobtrusive, non-blocking)
          ───────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3 space-y-2.5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหารหัสแผน, แผนก, ปี, หรือฉบับแก้ไข..."
              aria-label="ค้นหาแผนประจำปี"
              className="w-full h-8.5 pl-8.5 pr-8 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Filters Group */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Year Quick Filter */}
            <div className="flex items-center gap-1 text-xs">
              <label htmlFor="filter-year-select" className="text-slate-500 font-medium whitespace-nowrap">
                ปี:
              </label>
              <select
                id="filter-year-select"
                aria-label="กรองตามปี"
                value={filterYear}
                onChange={(e) => setFilterYear && setFilterYear(e.target.value)}
                className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-semibold bg-white text-slate-700 hover:border-slate-300 focus:outline-none focus:border-indigo-600 cursor-pointer"
              >
                <option value="">ทุกปี ({availableYears.length})</option>
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    ปี {yr} (พ.ศ. {toBuddhistYear(yr)})
                  </option>
                ))}
              </select>
            </div>

            {/* Department Filter (Only for multi-department/DCC/QMR) */}
            {canReadAll ? (
              <div className="flex items-center gap-1 text-xs">
                <label htmlFor="filter-dept-select" className="text-slate-500 font-medium whitespace-nowrap">
                  สังกัด:
                </label>
                <select
                  id="filter-dept-select"
                  aria-label="กรองตามแผนก"
                  value={filterDept}
                  onChange={(e) => setFilterDept && setFilterDept(e.target.value)}
                  className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-semibold bg-white text-slate-700 hover:border-slate-300 focus:outline-none focus:border-indigo-600 cursor-pointer"
                >
                  <option value="">ทุกแผนก ({activeDepartments.length})</option>
                  {activeDepartments.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.code} - {d.nameTh || d.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : userDept ? (
              <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/80">
                {userDeptInfo.nameTh || userDeptInfo.name || userDept} ({userDept})
              </span>
            ) : null}

            {/* Status Filter */}
            <div className="flex items-center gap-1 text-xs">
              <label htmlFor="filter-status-select" className="text-slate-500 font-medium whitespace-nowrap">
                สถานะ:
              </label>
              <select
                id="filter-status-select"
                aria-label="กรองตามสถานะ"
                value={statusTab}
                onChange={(e) => setStatusTab && setStatusTab(e.target.value)}
                className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-semibold bg-white text-slate-700 hover:border-slate-300 focus:outline-none focus:border-indigo-600 cursor-pointer"
              >
                <option value="ALL">ทุกสถานะ</option>
                <option value="DRAFT">ร่างแผน (Draft)</option>
                <option value="PENDING_REVIEW">รอทบทวน (In Review)</option>
                <option value="PENDING_APPROVAL">รออนุมัติ (Pending Approval)</option>
                <option value="APPROVED">มีผลบังคับใช้ (Effective)</option>
                <option value="REJECTED">รอปรับปรุง (Returned)</option>
                <option value="SUPERSEDED">ถูกแทนที่แล้ว (SUPERSEDED)</option>
              </select>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="h-8 px-2.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ล้างตัวกรอง
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. Plan Listing Table (Desktop & Tablet) / Cards (Mobile)
          ───────────────────────────────────────────────────────────── */}
      {filteredPlans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center space-y-3 shadow-2xs">
          <div className="text-sm font-bold text-slate-700">
            ไม่พบแผนประจำปีตามตัวกรองที่เลือก
          </div>
          <p className="text-xs text-slate-500">
            ลองปรับเปลี่ยนคำค้นหา หรือล้างตัวกรองเพื่อดูแผนทั้งหมด
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                ล้างตัวกรองทั้งหมด
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenCreatePlan && onOpenCreatePlan()}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer"
            >
              สร้างแผนประจำปีใหม่
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          {/* Header count summary */}
          <div className="px-4 py-2.5 bg-slate-50/60 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>
              พบทั้งหมด <strong className="text-slate-800 font-bold">{filteredPlans.length}</strong> ฉบับ
            </span>
            <span className="text-[11px] text-slate-400">
              คลิกที่แถวหรือกดปุ่มเพื่อเปิดเข้าสู่ Workspace
            </span>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th scope="col" className="py-3 px-3.5 whitespace-nowrap">ปีของแผน</th>
                  <th scope="col" className="py-3 px-3 whitespace-nowrap">แผนก</th>
                  <th scope="col" className="py-3 px-3 whitespace-nowrap">รหัสเอกสาร</th>
                  <th scope="col" className="py-3 px-3 whitespace-nowrap">ฉบับแก้ไขแผน</th>
                  <th scope="col" className="py-3 px-3 whitespace-nowrap">ฉบับฟอร์ม</th>
                  <th scope="col" className="py-3 px-3.5 whitespace-nowrap">สถานะ</th>
                  <th scope="col" className="py-3 px-3 text-right whitespace-nowrap">เครื่องมือ</th>
                  <th scope="col" className="py-3 px-3 text-right whitespace-nowrap">รอบทวนสอบ</th>
                  <th scope="col" className="py-3 px-3.5 whitespace-nowrap">วันที่มีผล</th>
                  <th scope="col" className="py-3 px-3.5 text-right whitespace-nowrap">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPlans.map((plan) => {
                  const tone = getStatusTone(plan);
                  const actionText = getActionButtonText(plan);
                  const isEffective = plan.status === 'APPROVED' && (plan.effective_status === 'EFFECTIVE' || Number(plan.is_current) === 1);

                  return (
                    <tr
                      key={plan.id}
                      onClick={() => onSelectPlan && onSelectPlan(plan.id)}
                      className="hover:bg-indigo-50/20 transition-colors cursor-pointer group"
                    >
                      {/* 1. Year */}
                      <td className="py-3 px-3.5 whitespace-nowrap font-semibold text-slate-900">
                        <span>ปี {plan.plan_year}</span>
                        <span className="text-slate-400 text-[11px] font-normal ml-1">
                          ({toBuddhistYear(plan.plan_year)})
                        </span>
                      </td>

                      {/* 2. Department */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/70 text-[11px]">
                          {plan.department}
                        </span>
                      </td>

                      {/* 3. Plan Code */}
                      <td className="py-3 px-3 whitespace-nowrap font-mono font-semibold text-slate-800">
                        {formatPlanDocCode(plan)}
                      </td>

                      {/* 4. Plan Revision */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-[11px]" title="Plan Revision">
                          Rev.{plan.revision}
                        </span>
                      </td>

                      {/* 5. Form Template Revision */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-mono text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-[11px]" title="Form Template Revision">
                          Rev.{plan.form_template_revision || plan.template_revision || '01'}
                        </span>
                      </td>

                      {/* 6. Status Badge */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${tone.bg} ${tone.text} ${tone.border}`}>
                          <span>{tone.label}</span>
                        </span>
                      </td>

                      {/* 7. Assets Count */}
                      <td className="py-3 px-3 text-right whitespace-nowrap font-mono font-bold text-slate-700">
                        {plan.item_count ?? '-'}
                      </td>

                      {/* 8. Total Cycles */}
                      <td className="py-3 px-3 text-right whitespace-nowrap font-mono font-bold text-slate-700">
                        {plan.total_cycles ?? plan.cycle_count ?? '-'}
                      </td>

                      {/* 9. Effective Date */}
                      <td className="py-3 px-3.5 whitespace-nowrap font-mono text-slate-500 text-[11px]">
                        {plan.effective_date ? formatVccDateTime(plan.effective_date) : '-'}
                      </td>

                      {/* 10. Action Button */}
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectPlan && onSelectPlan(plan.id);
                          }}
                          className={`inline-flex items-center gap-1 h-7.5 px-3 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                            isEffective
                              ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                          }`}
                        >
                          <span>{actionText}</span>
                          <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View (<768px) */}
          <div className="md:hidden divide-y divide-slate-100">
            {filteredPlans.map((plan) => {
              const tone = getStatusTone(plan);
              const actionText = getActionButtonText(plan);
              const isEffective = plan.status === 'APPROVED' && (plan.effective_status === 'EFFECTIVE' || Number(plan.is_current) === 1);

              return (
                <div
                  key={plan.id}
                  onClick={() => onSelectPlan && onSelectPlan(plan.id)}
                  className="p-3.5 space-y-2 hover:bg-slate-50/80 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-sm text-slate-900">
                          ปี {plan.plan_year}
                        </span>
                        <span className="text-xs text-slate-400">
                          (พ.ศ. {toBuddhistYear(plan.plan_year)})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="font-semibold text-xs text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                          {plan.department}
                        </span>
                        <span className="font-mono text-xs font-semibold text-slate-800">
                          {formatPlanDocCode(plan)}
                        </span>
                      </div>
                    </div>

                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${tone.bg} ${tone.text} ${tone.border}`}>
                      <span>{tone.label}</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200 font-bold">
                        Plan Rev.{plan.revision}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 bg-slate-50 px-1.5 py-0.2 rounded border border-slate-200">
                        Template Rev.{plan.form_template_revision || plan.template_revision || '01'}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500">
                      เครื่องมือ: <strong className="text-slate-800">{plan.item_count ?? '-'}</strong> | รอบ:{' '}
                      <strong className="text-slate-800">{plan.total_cycles ?? plan.cycle_count ?? '-'}</strong>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPlan && onSelectPlan(plan.id);
                      }}
                      className={`inline-flex items-center gap-1 h-7.5 px-3 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                        isEffective
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      <span>{actionText}</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnualPlanRegisterTable;
