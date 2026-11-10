import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Plus,
  Download,
  Search,
  Filter,
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
import { getPlanStatusLabel } from '../utils/planLabels';
import { formatVccDateTime, toBuddhistYear } from '../utils/vccDateUtils';
import DepartmentBadge from '../../../shared/components/ui/DepartmentBadge';

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

  // Fallback departments if empty
  const departments = useMemo(() => {
    if (activeDepartments && activeDepartments.length > 0) return activeDepartments;
    return [
      { code: 'DC', nameTh: 'ศูนย์ควบคุมเอกสาร' },
      { code: 'QC', nameTh: 'ควบคุมคุณภาพ' },
      { code: 'QA', nameTh: 'ประกันคุณภาพ' },
      { code: 'MGT', nameTh: 'ฝ่ายบริหาร' },
      { code: 'LB', nameTh: 'ห้องปฏิบัติการ' }
    ];
  }, [activeDepartments]);

  // Unique years from plans + current & next year
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
      if (statusFilter === 'DRAFT' && !['DRAFT', 'REJECTED'].includes(plan.status)) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const deptMatch = String(plan.department || '').toLowerCase().includes(q) ||
                          String(plan.department_name_th || '').toLowerCase().includes(q);
        const codeMatch = String(plan.document_code || '').toLowerCase().includes(q);
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
    const draftCount = plans.filter((p) => ['DRAFT', 'REJECTED'].includes(p.status)).length;

    // Coverage calculation
    const totalCalibratable = activeAssets.length;
    const plannedAssetCount = plans.reduce((acc, p) => acc + Number(p.planned_items_count || p.item_count || 0), 0);
    const coveragePct = totalCalibratable > 0 ? Math.min(100, Math.round((plannedAssetCount / totalCalibratable) * 100)) : 100;

    return { totalPlans, activeCount, pendingCount, draftCount, coveragePct, totalCalibratable, plannedAssetCount };
  }, [plans, activeAssets]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
            <ShieldCheck size={11} className="text-emerald-600" /> บังคับใช้ (Active)
          </span>
        );
      case 'PENDING_APPROVAL':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-full">
            <Clock size={11} className="text-indigo-600" /> รออนุมัติ (L5+)
          </span>
        );
      case 'PENDING_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full">
            <Clock size={11} className="text-amber-600" /> รอทบทวน (L4)
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-full">
            <AlertTriangle size={11} className="text-rose-600" /> ถูกส่งกลับ
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded-full">
            <Edit3 size={11} className="text-slate-500" /> ฉบับร่าง (Draft)
          </span>
        );
    }
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
        {/* Active Plans */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>มีผลบังคับใช้ (Active)</span>
            <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck size={14} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900">{kpiStats.activeCount}</span>
            <span className="text-xs text-slate-400">/ {kpiStats.totalPlans} แผน</span>
          </div>
          <p className="text-[11px] text-emerald-700 font-medium mt-1">พร้อมออกใบสั่งงานตามรอบ</p>
        </div>

        {/* Pending Approval */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>รอการอนุมัติ (Pending)</span>
            <div className="w-6 h-6 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock size={14} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900">{kpiStats.pendingCount}</span>
            <span className="text-xs text-slate-400">แผน</span>
          </div>
          <p className="text-[11px] text-amber-700 font-medium mt-1">อยู่ในขั้นตอนทบทวน / อนุมัติ</p>
        </div>

        {/* Drafting */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>กำลังจัดทำ (Draft)</span>
            <div className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center">
              <Edit3 size={14} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900">{kpiStats.draftCount}</span>
            <span className="text-xs text-slate-400">แผน</span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-1">ฉบับร่าง หรือรอส่งทบทวนใหม่</p>
        </div>

        {/* Total Coverage */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>ความครอบคลุมเครื่องมือ</span>
            <div className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <CheckCircle2 size={14} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900">{kpiStats.coveragePct}%</span>
            <span className="text-xs text-slate-400">({kpiStats.plannedAssetCount} รายการ)</span>
          </div>
          <div className="mt-1.5 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${kpiStats.coveragePct}%` }}
            />
          </div>
        </div>
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
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-white text-slate-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ทั้งหมด
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                statusFilter === 'ACTIVE'
                  ? 'bg-white text-emerald-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              บังคับใช้ (Active)
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('PENDING')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                statusFilter === 'PENDING'
                  ? 'bg-white text-amber-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              รออนุมัติ (Pending)
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('DRAFT')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                statusFilter === 'DRAFT'
                  ? 'bg-white text-slate-800 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ฉบับร่าง (Draft)
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-60">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="ค้นหาแผนก, รหัสแบบฟอร์ม..."
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
                <th className="py-2.5 px-3.5 w-16">ปี</th>
                <th className="py-2.5 px-3.5 w-32">แผนก</th>
                <th className="py-2.5 px-3.5 min-w-40">รหัสแบบฟอร์ม / Rev</th>
                <th className="py-2.5 px-3.5 w-36">สถานะ</th>
                <th className="py-2.5 px-3.5 w-32 text-center">สัดส่วนรายการ</th>
                <th className="py-2.5 px-3.5 w-36">ปรับปรุงล่าสุด</th>
                <th className="py-2.5 px-3.5 w-48 text-right">การจัดการ</th>
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
                  const docCode = plan.document_code || `FM-${dept}-42`;
                  const plannedCount = Number(plan.planned_items_count || plan.item_count || 0);

                  return (
                    <tr key={plan.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Year */}
                      <td className="py-3 px-3.5 font-bold font-mono text-slate-800">
                        {plan.plan_year}
                      </td>

                      {/* Department */}
                      <td className="py-3 px-3.5">
                        <DepartmentBadge department={dept} label={`${deptName} (${dept})`} />
                      </td>

                      {/* Document Code & Revision */}
                      <td className="py-3 px-3.5">
                        <div className="font-mono font-semibold text-slate-900 flex items-center gap-1.5">
                          <span>{docCode}</span>
                          <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200">
                            Rev.{plan.revision || '01'}
                          </span>
                        </div>
                        {plan.title && (
                          <div className="text-[11px] text-slate-400 truncate max-w-64 mt-0.5">{plan.title}</div>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-3.5">
                        {getStatusBadge(plan.status)}
                      </td>

                      {/* Items Ratio */}
                      <td className="py-3 px-3.5 text-center">
                        <span className="font-semibold text-slate-800">{plannedCount}</span>
                        <span className="text-slate-400 text-[11px]"> รายการ</span>
                      </td>

                      {/* Last Updated */}
                      <td className="py-3 px-3.5 text-slate-500 text-[11px]">
                        {formatVccDateTime(plan.updated_at || plan.created_at)}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Print Icon Button */}
                          <button
                            type="button"
                            onClick={() => onPrintPlan && onPrintPlan(plan)}
                            title="พิมพ์แบบฟอร์มเอกสารควบคุม (A4 แนวนอน)"
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <Printer size={13} />
                          </button>

                          {/* Revisions History Icon Button */}
                          <button
                            type="button"
                            onClick={() => onOpenHistory && onOpenHistory(plan)}
                            title="ดูประวัติการแก้ไขและเวอร์ชัน (Revisions)"
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <History size={13} />
                          </button>

                          {/* Primary CTA: Open Plan Workspace */}
                          <button
                            type="button"
                            onClick={() => onOpenPlan && onOpenPlan(plan.id)}
                            className="inline-flex items-center gap-1 h-7.5 px-3 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs transition-colors cursor-pointer"
                          >
                            <span>เปิดแผนงาน</span>
                            <ArrowRight size={12} />
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
