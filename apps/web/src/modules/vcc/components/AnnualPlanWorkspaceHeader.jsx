import React, { useState } from 'react';
import {
  SlidersHorizontal,
  Plus,
  History,
  Edit3,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle2,
  Clock,
  ShieldCheck,
  FileText
} from 'lucide-react';

const PLAN_STATUS_TABS = [
  { key: 'DRAFT', label: 'ร่างแผน (DRAFT)', color: 'bg-slate-900 text-white shadow-xs' },
  { key: 'PENDING_REVIEW', label: 'รอทบทวน (PENDING_REVIEW)', color: 'bg-amber-700 text-white shadow-xs' },
  { key: 'PENDING_APPROVAL', label: 'รออนุมัติ (PENDING_APPROVAL)', color: 'bg-indigo-700 text-white shadow-xs' },
  { key: 'APPROVED', label: 'อนุมัติแล้ว (APPROVED)', color: 'bg-emerald-700 text-white shadow-xs' },
  { key: 'REJECTED', label: 'ส่งกลับแก้ไข (REJECTED)', color: 'bg-rose-700 text-white shadow-xs' }
];

export const AnnualPlanWorkspaceHeader = ({
  statusTab,
  setStatusTab,
  filterYear,
  setFilterYear,
  availableYears,
  filterDept,
  setFilterDept,
  activeDepartments,
  plans,
  selectedPlanId,
  onSelectPlan,
  activePlan,
  planItems,
  canEditPlan,
  onOpenSettings,
  onOpenCreatePlan,
  onOpenEditPlan,
  onOpenAddItem,
  onOpenHistory
}) => {
  const [guideOpen, setGuideOpen] = useState(false);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'APPROVED':
        return {
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          label: 'อนุมัติแล้ว พร้อมบังคับใช้ (APPROVED)',
          Icon: ShieldCheck
        };
      case 'PENDING_APPROVAL':
        return {
          bg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
          label: 'รออนุมัติโดยผู้จัดการ/QMR (PENDING_APPROVAL)',
          Icon: Clock
        };
      case 'PENDING_REVIEW':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          label: 'รอทบทวนโดยหัวหน้างาน (PENDING_REVIEW)',
          Icon: Clock
        };
      case 'REJECTED':
        return {
          bg: 'bg-rose-50 text-rose-800 border-rose-200',
          label: 'ส่งกลับแก้ไข (REJECTED)',
          Icon: Info
        };
      case 'DRAFT':
      default:
        return {
          bg: 'bg-slate-100 text-slate-800 border-slate-200',
          label: 'แบบร่าง กำลังจัดทำ (DRAFT)',
          Icon: FileText
        };
    }
  };

  const statusBadge = activePlan ? getStatusBadge(activePlan.status) : null;

  return (
    <div className="space-y-4">
      {/* Workspace Control Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="สถานะแผนประจำปี">
            {PLAN_STATUS_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={statusTab === t.key}
                onClick={() => setStatusTab(t.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  statusTab === t.key ? t.color : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            >
              <SlidersHorizontal size={14} className="text-slate-500" />
              <span>ตั้งค่าแผนและเกณฑ์อนุมัติ</span>
            </button>
            <button
              type="button"
              onClick={onOpenCreatePlan}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
            >
              <Plus size={15} />
              <span>สร้างแผนประจำปีใหม่</span>
            </button>
          </div>
        </div>

        {/* Dynamic Filters & Plan Selector Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
          {/* Dynamic Year Select */}
          <select
            aria-label="กรองตามปีของแผน"
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium bg-white focus:outline-none focus:border-indigo-600"
          >
            <option value="">ทุกปี ค.ศ. (ทั้งหมด)</option>
            {availableYears.map((yr) => (
              <option key={yr} value={String(yr)}>
                ปี {yr} (พ.ศ. {yr + 543})
              </option>
            ))}
          </select>

          {/* Dynamic Department Select from Master Data */}
          <select
            aria-label="กรองแผนตามแผนก"
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium bg-white focus:outline-none focus:border-indigo-600"
          >
            <option value="">ทุกแผนก (Master Data)</option>
            {activeDepartments.map((d) => (
              <option key={d.code} value={d.code}>
                {d.code} — {d.nameTh}
              </option>
            ))}
          </select>

          {/* Active Plan Switcher */}
          <div className="md:col-span-2">
            {plans.length === 0 ? (
              <div className="text-xs text-slate-500 italic py-1.5">
                ไม่มีฉบับแผนงานในหมวดนี้
              </div>
            ) : plans.length <= 3 ? (
              <div className="flex flex-wrap gap-2">
                {plans.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelectPlan(p.id)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      selectedPlanId === p.id
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-900 shadow-2xs ring-1 ring-indigo-400/30'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    ปี {p.plan_year} • {p.department} ({p.document_code} Rev.{p.revision}) — {p.item_count || 0} รายการ
                  </button>
                ))}
              </div>
            ) : (
              <select
                aria-label="เลือกฉบับแผนประจำปีที่ต้องการดู"
                value={selectedPlanId}
                onChange={(e) => onSelectPlan(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-indigo-300 bg-indigo-50/40 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-600"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    ปี {p.plan_year} • {p.department} ({p.document_code} Rev.{p.revision}) — {p.title} [{p.item_count || 0} รายการ]
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Collapsible Audit Guideline Card */}
      <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => setGuideOpen(!guideOpen)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-left text-xs font-semibold text-slate-700 hover:bg-slate-100/70 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <BookOpen size={15} className="text-indigo-600" />
            <span>คำแนะนำการควบคุมเอกสารและการตรวจสอบแผน FM-QC-46 (Audit Guidelines)</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <span>{guideOpen ? 'ซ่อนคำแนะนำ' : 'ดูข้อกำหนด QMS'}</span>
            {guideOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </button>

        {guideOpen && (
          <div className="px-5 py-3 border-t border-slate-200/60 bg-white/70 text-xs text-slate-700 space-y-1.5">
            <div className="flex items-start gap-2">
              <CheckCircle2 size={14} className="text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900">แถวเป้าหมาย (Plan) vs แถวผลจริง (Act.):</span> แถว Plan สีน้ำเงินแสดงเดือนที่วางแผนเป้าหมายเท่านั้น จะยังไม่ถือว่าผ่านการตรวจจนกว่าจะมีการปิดใบสั่งงานจริงและได้รับการตรวจรับในแถว Act. สีเขียว
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 size={14} className="text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900">การควบคุมเครื่องมือแบบกลุ่ม (Group Equipment):</span> เครื่องมือกลุ่มแม่ (เช่น เครื่องชั่ง GRP-SCALE) มีไว้สำหรับวางแผนภาพรวม แต่ก่อนสร้างใบสั่งงานจริงต้องระบุรหัสเครื่องมือลูกรายตัวเสมอ
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 size={14} className="text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900">เกณฑ์การคำนวณวันครบกำหนด (Due Date Rule):</span> วันครบกำหนดจะคำนวณอัตโนมัติตามกติกาของแผน (ค่ามาตรฐานคือวันสิ้นเดือนของเดือนที่วางแผน)
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Active Plan Summary Hero Card */}
      {activePlan && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-3.5">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 font-mono text-xs font-bold">
                  {activePlan.document_code} Rev.{activePlan.revision}
                </span>

                {statusBadge && (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border text-xs font-bold ${statusBadge.bg}`}>
                    <statusBadge.Icon size={13} />
                    <span>สถานะ: {activePlan.status} ({statusBadge.label.split(' ')[0]})</span>
                  </span>
                )}

                <span className="px-2.5 py-0.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold">
                  กติกาวันครบกำหนด: {activePlan.due_date_rule === 'START_OF_MONTH' ? 'วันแรกของเดือนที่วางแผน (START_OF_MONTH)' : 'วันสิ้นเดือน (END_OF_MONTH)'}
                </span>
              </div>

              <h2 className="text-base md:text-lg font-bold text-slate-900 tracking-tight">
                {activePlan.title} — แผนก {activePlan.department} {activePlan.department_name_th ? `(${activePlan.department_name_th})` : ''}
              </h2>
            </div>

            {/* Contextual Actions */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onOpenHistory}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <History size={14} className="text-slate-500" />
                <span>ประวัติการอนุมัติ</span>
              </button>

              {canEditPlan && (
                <>
                  <button
                    type="button"
                    onClick={() => onOpenEditPlan(activePlan)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <Edit3 size={14} className="text-slate-500" />
                    <span>แก้ไขหัวแผน</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAddItem(null)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>เพิ่มเครื่องมือเข้าแผน</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 pt-0.5">
            <div>
              เครื่องมือในแผน: <span className="font-bold text-slate-900">{planItems.length}</span> รายการ
            </div>
            <div className="text-slate-300">•</div>
            <div>
              เครื่องมือรายตัว: <span className="font-bold text-slate-900">{planItems.filter((i) => Number(i.is_group) !== 1).length}</span> รายการ
            </div>
            <div className="text-slate-300">•</div>
            <div>
              กลุ่มเครื่องมือแม่: <span className="font-bold text-slate-900">{planItems.filter((i) => Number(i.is_group) === 1).length}</span> กลุ่ม
            </div>
            <div className="text-slate-300">•</div>
            <div>
              ปีแผนงาน: <span className="font-bold text-slate-900">{activePlan.plan_year} (พ.ศ. {activePlan.plan_year + 543})</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnualPlanWorkspaceHeader;
