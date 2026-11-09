import React, { useMemo } from 'react';
import {
  Calendar,
  Building2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCw,
  Plus,
  ArrowRight,
  BookOpen,
  Layers,
  FileText,
  ShieldCheck,
  History
} from 'lucide-react';
import { toBuddhistYear } from '../utils/vccDateUtils';
import { getPlanStatusLabel, getDueDateRuleLabel } from '../utils/planLabels';

/**
 * Status tone mappings for chips and cards
 */
const getStatusTone = (status, isSuperseded = false) => {
  if (isSuperseded) {
    return {
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      border: 'border-slate-300',
      dot: 'bg-slate-400',
      label: 'ถูกแทนที่แล้ว (SUPERSEDED)'
    };
  }
  switch (status) {
    case 'APPROVED':
      return {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        dot: 'bg-emerald-500',
        label: 'มีผลบังคับใช้ (Effective)'
      };
    case 'PENDING_APPROVAL':
      return {
        bg: 'bg-indigo-50',
        text: 'text-indigo-700',
        border: 'border-indigo-200',
        dot: 'bg-indigo-500',
        label: 'รออนุมัติ (Pending Approval)'
      };
    case 'PENDING_REVIEW':
      return {
        bg: 'bg-amber-50',
        text: 'text-amber-800',
        border: 'border-amber-200',
        dot: 'bg-amber-500',
        label: 'รอทบทวน (In Review)'
      };
    case 'REJECTED':
      return {
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200',
        dot: 'bg-rose-500',
        label: 'รอปรับปรุง (Returned)'
      };
    default:
      return {
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-200',
        dot: 'bg-slate-400',
        label: 'ร่างแผน (Draft)'
      };
  }
};

/**
 * LEVEL 1: ANNUAL PLANNING OVERVIEW
 * High-discoverability Enterprise overview of all plans accessible to current user.
 * - Horizontal Year Navigation with count badges
 * - Department Navigation / Context Label
 * - Status Filter Chips with real data counts
 * - Compact Plan Overview Cards with clear single primary action
 * - Distinct "สร้างแผนประจำปี" action
 */
export const AnnualPlanLevel1Overview = ({
  plans = [],
  availableYears = [],
  filterYear = '',
  setFilterYear,
  filterDept = '',
  setFilterDept,
  activeDepartments = [],
  canReadAll = false,
  userDept = '',
  statusTab = 'ALL',
  setStatusTab,
  selectedPlanId = '',
  onSelectPlan,
  onOpenCreatePlan,
  canRevisePlan = false,
  onOpenRevision,
  onOpenHistory,
  onOpenOfficialPdf
}) => {
  // Compute plan counts per year
  const yearCounts = useMemo(() => {
    const counts = {};
    for (const p of plans) {
      if (p.plan_year) {
        counts[p.plan_year] = (counts[p.plan_year] || 0) + 1;
      }
    }
    return counts;
  }, [plans]);

  // Compute plan counts per department (for multi-department users)
  const deptCounts = useMemo(() => {
    const counts = {};
    for (const p of plans) {
      if (p.department) {
        counts[p.department] = (counts[p.department] || 0) + 1;
      }
    }
    return counts;
  }, [plans]);

  // Compute status counts for plans matching current Year & Dept filters
  const scopedPlans = useMemo(() => {
    return plans.filter((p) => {
      const matchYear = !filterYear || String(p.plan_year) === String(filterYear);
      const matchDept = !filterDept || p.department === filterDept;
      return matchYear && matchDept;
    });
  }, [plans, filterYear, filterDept]);

  const statusCounts = useMemo(() => {
    const counts = {
      ALL: scopedPlans.length,
      DRAFT: 0,
      PENDING_REVIEW: 0,
      PENDING_APPROVAL: 0,
      APPROVED: 0,
      REJECTED: 0,
      SUPERSEDED: 0
    };
    for (const p of scopedPlans) {
      const isSuperseded =
        p.effective_status === 'SUPERSEDED' ||
        (p.status === 'APPROVED' && Number(p.is_current) === 0);

      if (isSuperseded) {
        counts.SUPERSEDED += 1;
      } else if (p.status === 'DRAFT') {
        counts.DRAFT += 1;
      } else if (p.status === 'PENDING_REVIEW') {
        counts.PENDING_REVIEW += 1;
      } else if (p.status === 'PENDING_APPROVAL') {
        counts.PENDING_APPROVAL += 1;
      } else if (p.status === 'APPROVED') {
        counts.APPROVED += 1;
      } else if (p.status === 'REJECTED') {
        counts.REJECTED += 1;
      }
    }
    return counts;
  }, [scopedPlans]);

  // Filter plans to display in cards based on current status chip
  const displayedPlans = useMemo(() => {
    return scopedPlans.filter((p) => {
      if (statusTab === 'ALL' || !statusTab) return true;
      const isSuperseded =
        p.effective_status === 'SUPERSEDED' ||
        (p.status === 'APPROVED' && Number(p.is_current) === 0);

      if (statusTab === 'SUPERSEDED') return isSuperseded;
      if (isSuperseded) return false;
      return p.status === statusTab;
    });
  }, [scopedPlans, statusTab]);

  // Status Filter Chips configuration
  const statusChips = [
    { key: 'ALL', label: 'ทั้งหมด', count: statusCounts.ALL },
    { key: 'DRAFT', label: 'ร่างแผน', count: statusCounts.DRAFT },
    { key: 'PENDING_REVIEW', label: 'รอทบทวน', count: statusCounts.PENDING_REVIEW },
    { key: 'PENDING_APPROVAL', label: 'รออนุมัติ', count: statusCounts.PENDING_APPROVAL },
    { key: 'APPROVED', label: 'อนุมัติแล้ว / บังคับใช้', count: statusCounts.APPROVED },
    { key: 'REJECTED', label: 'รอปรับปรุง', count: statusCounts.REJECTED },
    { key: 'SUPERSEDED', label: 'ถูกแทนที่ (ประวัติ)', count: statusCounts.SUPERSEDED }
  ];

  const userDeptInfo = useMemo(() => {
    return activeDepartments.find((d) => d.code === userDept) || {
      code: userDept,
      nameTh: userDept
    };
  }, [activeDepartments, userDept]);

  return (
    <div
      data-testid="annual-plan-level1-overview"
      className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 space-y-4"
    >
      {/* ─────────────────────────────────────────────────────────────
          1. Page Title & Primary Creation Action
          ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              แผนการทวนสอบเครื่องมือประจำปี
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              ภาพรวมแผนประจำปี (Annual Planning Overview)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            ภาพรวมแผนการสอบเทียบและทวนสอบเครื่องมือประจำปีตามข้อกำหนด ISO 9001 (ข้อ 7.1.5)
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onOpenCreatePlan && onOpenCreatePlan(filterYear)}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
          >
            <Plus size={15} />
            <span>สร้างแผนประจำปี</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. Year & Department Navigation (Horizontal Segmented Tabs)
          ───────────────────────────────────────────────────────────── */}
      <div className="space-y-2.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Year Navigation */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <span className="text-xs font-semibold text-slate-500 shrink-0 flex items-center gap-1 mr-1">
              <Calendar size={13} className="text-slate-400" />
              <span>ปีของแผน:</span>
            </span>

            <button
              type="button"
              onClick={() => setFilterYear && setFilterYear('')}
              className={`h-7 px-3 rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                !filterYear
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
              }`}
            >
              ทุกปี ({plans.length})
            </button>

            {availableYears.map((yr) => {
              const count = yearCounts[yr] || 0;
              const isSelected = String(filterYear) === String(yr);
              return (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setFilterYear && setFilterYear(String(yr))}
                  className={`h-7 px-3 rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                  }`}
                >
                  <span>ปี {yr}</span>
                  <span className="text-[11px] opacity-80">(พ.ศ. {toBuddhistYear(yr)})</span>
                  {count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Department Navigation */}
          <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs font-semibold text-slate-500 shrink-0 flex items-center gap-1 mr-1">
              <Building2 size={13} className="text-slate-400" />
              <span>สังกัด:</span>
            </span>

            {!canReadAll && userDept ? (
              <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                {userDeptInfo.nameTh || userDeptInfo.name || userDept} ({userDept})
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setFilterDept && setFilterDept('')}
                  className={`h-7 px-2.5 rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                    !filterDept
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                  }`}
                >
                  ทุกแผนก ({activeDepartments.length})
                </button>
                {activeDepartments.map((d) => {
                  const count = deptCounts[d.code] || 0;
                  const isSelected = filterDept === d.code;
                  return (
                    <button
                      key={d.code}
                      type="button"
                      onClick={() => setFilterDept && setFilterDept(d.code)}
                      className={`h-7 px-2.5 rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer flex items-center gap-1 ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                      }`}
                    >
                      <span>{d.code}</span>
                      {count > 0 && (
                        <span
                          className={`text-[10px] px-1 rounded-full ${
                            isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            3. Status Filter Chips (with live item counts)
            ───────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-t border-slate-100 scrollbar-none">
          <span className="text-xs font-semibold text-slate-500 shrink-0 mr-1">สถานะ:</span>
          {statusChips.map((chip) => {
            const isSelected = statusTab === chip.key || (chip.key === 'ALL' && (!statusTab || statusTab === 'ALL'));
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setStatusTab && setStatusTab(chip.key)}
                className={`h-7 px-2.5 rounded-full text-xs font-semibold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 border ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200/90 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <span>{chip.label}</span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                    isSelected ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          4. Plan Overview Cards / Grid
          ───────────────────────────────────────────────────────────── */}
      <div>
        {displayedPlans.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-slate-200 text-center space-y-2 bg-slate-50/50">
            <p className="text-xs font-semibold text-slate-600">
              ไม่พบแผนประจำปีตามตัวกรองที่เลือก
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setFilterYear && setFilterYear('');
                  setStatusTab && setStatusTab('ALL');
                }}
                className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
              >
                ล้างตัวกรองทั้งหมด
              </button>
              <span className="text-slate-300">•</span>
              <button
                type="button"
                onClick={() => onOpenCreatePlan && onOpenCreatePlan(filterYear)}
                className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
              >
                สร้างแผนประจำปี
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {displayedPlans.map((plan) => {
              const isSelected = selectedPlanId === plan.id;
              const isSuperseded =
                plan.effective_status === 'SUPERSEDED' ||
                (plan.status === 'APPROVED' && Number(plan.is_current) === 0);
              const tone = getStatusTone(plan.status, isSuperseded);
              const isDraftRevision =
                Boolean(plan.parent_plan_id) &&
                plan.status === 'DRAFT' &&
                Number(plan.revision) > 1;

              return (
                <div
                  key={plan.id}
                  onClick={() => onSelectPlan && onSelectPlan(plan.id)}
                  className={`relative p-3.5 rounded-xl border transition-all cursor-pointer text-left flex flex-col justify-between gap-3 ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/30 ring-2 ring-indigo-500/20 shadow-xs'
                      : 'border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-2xs'
                  }`}
                >
                  <div className="space-y-2">
                    {/* Top Row: Year + Dept + Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-sm text-slate-900">
                            แผนปี {plan.plan_year}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">
                            (พ.ศ. {toBuddhistYear(plan.plan_year)})
                          </span>
                        </div>
                        <span className="inline-block mt-0.5 text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/80">
                          {plan.department_name_th || `แผนก ${plan.department}`} ({plan.department})
                        </span>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border shrink-0 ${tone.bg} ${tone.text} ${tone.border}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                        <span>{tone.label}</span>
                      </span>
                    </div>

                    {/* Revision Identity Tags: Plan Revision vs Template Revision Strictly Separated! */}
                    <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                      <span className="font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                        {plan.document_code || `VCC-PLAN-${plan.department || 'QC'}`}
                      </span>
                      <span className="font-mono font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200" title="ฉบับแก้ไขของแผนประจำปี (Plan Revision)">
                        Plan: Rev.{plan.revision}
                      </span>
                      <span className="font-mono text-slate-600 px-2 py-0.5 rounded bg-slate-50 border border-slate-200" title="ฉบับประกาศใช้แบบฟอร์ม (Form Template Revision)">
                        Template: Rev.{plan.template_revision || plan.form_template_revision || '01'}
                      </span>
                    </div>

                    {/* Draft revision context indicator */}
                    {isDraftRevision && (
                      <div className="p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 font-medium flex items-center gap-1.5">
                        <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                        <span>
                          ฉบับแก้ไขต่อจาก Rev.{plan.parent_revision || '01'} (แผนเดิมยังคงมีผล)
                        </span>
                      </div>
                    )}

                    {/* Metrics Row */}
                    <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-slate-600 border-t border-slate-100">
                      <div>
                        <span className="text-slate-400">เครื่องมือในแผน:</span>{' '}
                        <span className="font-bold text-slate-800">{plan.item_count ?? '-'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">รอบทวนสอบ:</span>{' '}
                        <span className="font-bold text-slate-800">{plan.total_cycles ?? '-'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Primary Action Button (Single clear CTA) */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    {isSelected ? (
                      <span className="text-xs font-bold text-indigo-700 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                        <span>กำลังเปิดดูแผนนี้ใน Workspace</span>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 font-medium">
                        คลิกเพื่อเปิดแผนงาน
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPlan && onSelectPlan(plan.id);
                      }}
                      className={`h-7 px-3 rounded-lg text-xs font-bold shrink-0 inline-flex items-center gap-1 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                      }`}
                    >
                      <span>
                        {plan.status === 'DRAFT'
                          ? 'เปิดแก้ไขแผน'
                          : plan.status === 'PENDING_REVIEW'
                          ? 'ตรวจทบทวน'
                          : plan.status === 'PENDING_APPROVAL'
                          ? 'พิจารณาอนุมัติ'
                          : isSuperseded
                          ? 'ดูฉบับเก่า'
                          : 'เปิด Workspace'}
                      </span>
                      <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnnualPlanLevel1Overview;
