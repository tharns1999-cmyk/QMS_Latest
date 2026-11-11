import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Plus,
  Search,
  ShieldCheck,
  Clock,
  Edit3,
  AlertTriangle,
  ArrowRight,
  Printer,
  History,
  FileSpreadsheet,
  CheckCircle2
} from 'lucide-react';
import { formatVccDateTime, toBuddhistYear } from '../utils/vccDateUtils';
import {
  resolvePlanCode,
  resolveDigitalPlanCode,
  getPlanStatusConfig
} from '../utils/planLabels';
import { VCC_DEPARTMENTS } from '../utils/departmentScope';
import DepartmentBadge from '../../../shared/components/ui/DepartmentBadge';
import useStore from '../../../store/useStore';

export { resolvePlanCode, resolveDigitalPlanCode };

const STATUS_ICON_MAP = {
  ShieldCheck,
  Clock,
  AlertTriangle,
  Edit3
};

const HUB_STATUS_FILTER_TABS = [
  { key: 'ALL', label: 'ทั้งหมด', activeClass: 'bg-white text-slate-800 shadow-2xs' },
  { key: 'ACTIVE', label: 'บังคับใช้ (Active)', activeClass: 'bg-white text-emerald-700 shadow-2xs font-bold' },
  { key: 'PENDING', label: 'รออนุมัติ (Pending)', activeClass: 'bg-white text-amber-700 shadow-2xs font-bold' },
  { key: 'DRAFT', label: 'ฉบับร่าง (Draft)', activeClass: 'bg-white text-slate-800 shadow-2xs font-bold' }
];

export const AnnualPlansHub = ({
  plans = [],
  activeAssets = [],
  activeDepartments = [],
  filterYear = '',
  setFilterYear,
  filterDept = '',
  setFilterDept,
  onOpenPlan,
  onOpenCreatePlan,
  onExportSummary,
  onPrintPlan,
  _onExportPlanExcel,
  onOpenHistory,
  canCreatePlan = true
}) => {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const storeDepartments = useStore((s) => s.masterDepartments || s.departments || []);

  // Derive departments dynamically from activeDepartments prop, or VCC_DEPARTMENTS + store masterDepartments
  const departments = useMemo(() => {
    if (activeDepartments && activeDepartments.length > 0) return activeDepartments;
    const deptLookup = new Map();
    if (Array.isArray(storeDepartments)) {
      storeDepartments.forEach((d) => {
        const code = d.code || d.id;
        if (code) {
          deptLookup.set(code, d.nameTh || d.name_th || d.name || code);
        }
      });
    }
    plans.forEach((p) => {
      if (p?.department && !deptLookup.has(p.department)) {
        deptLookup.set(p.department, p.department_name_th || p.department);
      }
    });
    return VCC_DEPARTMENTS.map((code) => ({
      code,
      nameTh: deptLookup.get(code) || code
    }));
  }, [activeDepartments, storeDepartments, plans]);

  // Unique years from plans + current & adjacent years dynamically
  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set([currentYear, currentYear - 1, currentYear + 1]);
    plans.forEach((p) => {
      if (p.plan_year) years.add(Number(p.plan_year));
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [plans]);

  // Filter plans based on toolbar criteria
  const filteredPlans = useMemo(() => {
    return plans.filter((plan) => {
      // Year filter
      if (filterYear && String(plan.plan_year) !== String(filterYear)) return false;

      // Dept filter
      if (filterDept && plan.department !== filterDept) return false;

      // Status filter
      if (statusFilter === 'ACTIVE' && plan.status !== 'APPROVED') return false;
      if (statusFilter === 'PENDING' && !['PENDING_REVIEW', 'PENDING_APPROVAL'].includes(plan.status)) return false;
      if (statusFilter === 'DRAFT' && !['DRAFT', 'REJECTED', 'RETURNED'].includes(plan.status)) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const deptMatch = String(plan.department || '').toLowerCase().includes(q) ||
                          String(plan.department_name_th || '').toLowerCase().includes(q);
        const digitalCode = resolvePlanCode(plan).toLowerCase();
        const rawCode = String(plan.document_code || '').toLowerCase();
        const codeMatch = digitalCode.includes(q) || rawCode.includes(q);
        const titleMatch = String(plan.title || '').toLowerCase().includes(q);
        const yearMatch = String(plan.plan_year || '').includes(q);
        if (!deptMatch && !codeMatch && !titleMatch && !yearMatch) return false;
      }

      return true;
    });
  }, [plans, filterYear, filterDept, statusFilter, searchQuery]);

  // KPI calculations
  const kpiStats = useMemo(() => {
    const totalPlans = plans.length;
    const activeCount = plans.filter((p) => p.status === 'APPROVED').length;
    const pendingCount = plans.filter((p) => ['PENDING_REVIEW', 'PENDING_APPROVAL'].includes(p.status)).length;
    const draftCount = plans.filter((p) => ['DRAFT', 'REJECTED', 'RETURNED'].includes(p.status)).length;

    // Coverage calculation
    const totalCalibratable = activeAssets.length;
    const plannedAssetCount = plans.reduce((acc, p) => acc + Number(p.planned_items_count || p.item_count || 0), 0);
    const coveragePct = totalCalibratable > 0 ? Math.min(100, Math.round((plannedAssetCount / totalCalibratable) * 100)) : 100;

    return { totalPlans, activeCount, pendingCount, draftCount, coveragePct, totalCalibratable, plannedAssetCount };
  }, [plans, activeAssets]);

  const kpiCards = useMemo(() => [
    {
      key: 'active',
      title: 'มีผลบังคับใช้ (Active)',
      icon: ShieldCheck,
      iconWrapClass: 'bg-emerald-50 text-emerald-600',
      value: kpiStats.activeCount,
      suffix: `/ ${kpiStats.totalPlans} แผน`,
      subtitle: 'พร้อมออกใบสั่งงานตามรอบ',
      subtitleClass: 'text-emerald-700'
    },
    {
      key: 'pending',
      title: 'รอการอนุมัติ (Pending)',
      icon: Clock,
      iconWrapClass: 'bg-amber-50 text-amber-600',
      value: kpiStats.pendingCount,
      suffix: 'แผน',
      subtitle: 'อยู่ในขั้นตอนทบทวน / อนุมัติ',
      subtitleClass: 'text-amber-700'
    },
    {
      key: 'draft',
      title: 'กำลังจัดทำ (Draft)',
      icon: Edit3,
      iconWrapClass: 'bg-slate-100 text-slate-600',
      value: kpiStats.draftCount,
      suffix: 'แผน',
      subtitle: 'ฉบับร่าง หรือรอส่งทบทวนใหม่',
      subtitleClass: 'text-slate-500'
    },
    {
      key: 'coverage',
      title: 'ความครอบคลุมเครื่องมือ',
      icon: CheckCircle2,
      iconWrapClass: 'bg-indigo-50 text-indigo-600',
      value: `${kpiStats.coveragePct}%`,
      suffix: `(${kpiStats.plannedAssetCount} รายการ)`,
      progressPct: kpiStats.coveragePct
    }
  ], [kpiStats]);

  const getStatusBadge = (status) => {
    const cfg = getPlanStatusConfig(status);
    const IconComponent = STATUS_ICON_MAP[cfg.iconName] || Edit3;
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold border px-2.5 py-0.5 rounded-full ${cfg.badgeClass}`}>
        <IconComponent size={12} className={cfg.iconColorClass} /> {cfg.badgeLabel}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. Header & Primary CTA Strip */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Calendar size={18} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                สารบัญแผนการทวนสอบและสอบเทียบประจำปี
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                ศูนย์กลางบริหารจัดการแผนงานตามรอบประจำปีของทุกแผนก (Enterprise Hub Directory)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onExportSummary}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
            title="ส่งออกรายงานสรุปสถานะทุกแผนกเป็นไฟล์ Excel หลายแท็บ"
          >
            <FileSpreadsheet size={14} className="text-emerald-600" />
            <span>ส่งออกภาพรวมทุกแผนก</span>
          </button>

          {canCreatePlan && (
            <button
              type="button"
              onClick={onOpenCreatePlan}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-xs shadow-xs transition-all cursor-pointer"
            >
              <Plus size={14} />
              <span>สร้างแผนการทวนสอบประจำปีใหม่</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map((card) => {
          const CardIcon = card.icon;
          return (
            <div key={card.key} className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>{card.title}</span>
                <div className={`w-6 h-6 rounded-md flex items-center justify-center ${card.iconWrapClass}`}>
                  <CardIcon size={14} />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-900">{card.value}</span>
                <span className="text-xs text-slate-400">{card.suffix}</span>
              </div>
              {typeof card.progressPct === 'number' ? (
                <div className="mt-1.5 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${card.progressPct}%` }}
                  />
                </div>
              ) : (
                <p className={`text-[11px] font-medium mt-1 ${card.subtitleClass}`}>{card.subtitle}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* 3. Filter Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[280px]">
          {/* Year Selector */}
          <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
            <span className="text-xs font-semibold text-slate-500">ปีแผนงาน:</span>
            <select
              aria-label="เลือกปีแผนงาน"
              value={filterYear || ''}
              onChange={(e) => setFilterYear && setFilterYear(e.target.value)}
              className="bg-transparent border-0 text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="">ทุกปี ({availableYears.length})</option>
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  ปี {yr} (พ.ศ. {toBuddhistYear(yr)})
                </option>
              ))}
            </select>
          </div>

          {/* Department Selector */}
          <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
            <span className="text-xs font-semibold text-slate-500">แผนก:</span>
            <select
              aria-label="เลือกแผนก"
              value={filterDept || ''}
              onChange={(e) => setFilterDept && setFilterDept(e.target.value)}
              className="bg-transparent border-0 text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="">ทุกแผนก ({departments.length})</option>
              {departments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.nameTh || d.code} ({d.code})
                </option>
              ))}
            </select>
          </div>

          {/* Status Tabs */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200/70 text-xs font-semibold">
            {HUB_STATUS_FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  statusFilter === tab.key
                    ? tab.activeClass
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="ค้นหารหัสแผน, ชื่อฝ่าย/แผนก, ปี..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* 4. Plans Directory Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-semibold">
                <th className="py-2.5 px-3.5 w-16 text-center">ปี</th>
                <th className="py-2.5 px-3.5 w-36">ฝ่าย/แผนก</th>
                <th className="py-2.5 px-3.5 min-w-[200px]">รหัสแผนงานดิจิทัล / ฉบับแก้ไข</th>
                <th className="py-2.5 px-3.5 w-36">สถานะ</th>
                <th className="py-2.5 px-3.5 w-40 text-center">ความครอบคลุม</th>
                <th className="py-2.5 px-3.5 w-40">ปรับปรุงล่าสุด</th>
                <th className="py-2.5 px-3.5 w-auto min-w-[170px] text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPlans.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Calendar size={28} className="mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">ไม่พบแผนการทวนสอบประจำปีตามเงื่อนไขที่เลือก</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">ลองปรับตัวกรองปี แผนก หรือสถานะ หรือกดสร้างแผนใหม่</p>
                  </td>
                </tr>
              ) : (
                filteredPlans.map((plan) => {
                  const dept = plan.department || 'GEN';
                  const deptObj = departments.find((d) => d.code === dept);
                  const deptName = plan.department_name_th || deptObj?.nameTh || dept;
                  const digitalCode = resolvePlanCode(plan);
                  const plannedCount = Number(plan.planned_items_count || plan.item_count || 0);

                  // Calculate department coverage against activeAssets
                  const deptCalibratable = activeAssets.filter((a) => {
                    if (a.status && a.status !== 'ACTIVE') return false;
                    if (a.is_group && (Number(a.is_group) !== 0 && a.group_nature !== 'COMPOSITE_SET')) return false;
                    return a.department === dept;
                  });

                  const totalDeptAssets = deptCalibratable.length > 0
                    ? deptCalibratable.length
                    : (Number(plan.total_items_count || plan.total_assets || plannedCount) || plannedCount);

                  const coveragePct = totalDeptAssets > 0
                    ? Math.min(100, Math.round((plannedCount / totalDeptAssets) * 100))
                    : 100;

                  return (
                    <tr key={plan.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Year */}
                      <td className="align-middle py-3.5 px-3.5 text-center font-bold font-mono text-slate-800">
                        {plan.plan_year}
                      </td>

                      {/* Department */}
                      <td className="align-middle py-3.5 px-3.5">
                        <DepartmentBadge department={dept} label={`${deptName} (${dept})`} />
                      </td>

                      {/* Digital Plan Code & Revision */}
                      <td className="align-middle py-3.5 px-3.5">
                        <div className="inline-flex items-center gap-2">
                          <span className="whitespace-nowrap font-mono font-bold tracking-tight text-slate-900">{digitalCode}</span>
                          <span className="whitespace-nowrap text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                            Rev.{plan.revision || '01'}
                          </span>
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="align-middle py-3.5 px-3.5">
                        {getStatusBadge(plan.status)}
                      </td>

                      {/* Coverage with sleek Mini Progress Bar */}
                      <td className="align-middle py-3.5 px-3.5">
                        <div className="flex flex-col items-center gap-1">
                          <div className="font-semibold text-slate-800 text-center">
                            <span>{plannedCount}</span>
                            <span className="text-slate-400 font-normal"> / {totalDeptAssets} เครื่อง</span>
                            <span className={`ml-1 text-[11px] font-bold ${coveragePct === 100 ? 'text-emerald-600' : 'text-indigo-600'}`}>
                              ({coveragePct}%)
                            </span>
                          </div>
                          <div className="w-24 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full transition-all duration-300 ${coveragePct === 100 ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                              style={{ width: `${coveragePct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Last Updated */}
                      <td className="align-middle py-3.5 px-3.5">
                        <div className="text-[11px]">
                          <div className="text-slate-700 font-medium">
                            {formatVccDateTime(plan.updated_at || plan.created_at)}
                          </div>
                          {(plan.updated_by || plan.approved_by || plan.reviewed_by || plan.prepared_by || plan.actor_name) && (
                            <div className="text-slate-400 text-[10px] mt-0.5">
                              โดย {plan.updated_by || plan.approved_by || plan.reviewed_by || plan.prepared_by || plan.actor_name}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="align-middle py-3.5 px-3.5 text-right w-auto min-w-[170px]">
                        <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                          {/* Print Icon Button */}
                          <button
                            type="button"
                            onClick={() => onPrintPlan && onPrintPlan(plan)}
                            title="พิมพ์แบบฟอร์มเอกสารควบคุม (A4 แนวนอน)"
                            className="shrink-0 p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <Printer size={13} />
                          </button>

                          {/* Revisions History Icon Button */}
                          <button
                            type="button"
                            onClick={() => onOpenHistory && onOpenHistory(plan)}
                            title="ดูประวัติการแก้ไขและเวอร์ชัน (Revisions)"
                            className="shrink-0 p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <History size={13} />
                          </button>

                          {/* Primary CTA: Open Plan Workspace */}
                          <button
                            type="button"
                            onClick={() => onOpenPlan && onOpenPlan(plan.id)}
                            className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg shrink-0 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors cursor-pointer"
                          >
                            <span>เปิดแผนงาน</span>
                            <ArrowRight size={12} className="shrink-0" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AnnualPlansHub;
