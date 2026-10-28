import React, { useState } from 'react';
import {
  SlidersHorizontal,
  Plus,
  History,
  Edit3,
  BookOpen,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  ShieldCheck,
  FileText,
  AlertCircle,
  Sparkles
} from 'lucide-react';

const PLAN_STATUS_TABS = [
  { key: 'DRAFT', label: 'ร่างแผน (DRAFT)', countKey: 'DRAFT' },
  { key: 'PENDING_REVIEW', label: 'รอทบทวน (PENDING_REVIEW)', countKey: 'PENDING_REVIEW' },
  { key: 'PENDING_APPROVAL', label: 'รออนุมัติ (PENDING_APPROVAL)', countKey: 'PENDING_APPROVAL' },
  { key: 'APPROVED', label: 'อนุมัติแล้ว (APPROVED)', countKey: 'APPROVED' },
  { key: 'REJECTED', label: 'ส่งกลับแก้ไข (REJECTED)', countKey: 'REJECTED' }
];

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
  onOpenAddItem,
  onOpenSmartImport,
  onOpenHistory
}) => {
  const [guideOpen, setGuideOpen] = useState(false);

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200/90';
      case 'PENDING_APPROVAL':
        return 'bg-indigo-50 text-indigo-800 border-indigo-200/90';
      case 'PENDING_REVIEW':
        return 'bg-amber-50 text-amber-900 border-amber-200/90';
      case 'REJECTED':
        return 'bg-rose-50 text-rose-800 border-rose-200/90';
      case 'DRAFT':
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="space-y-3">
      {/* Unified Compact Workspace Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs divide-y divide-slate-100">
        {/* Row 1: Document Context & Fast Actions (Notion / Linear Document Header) */}
        <div className="p-3.5 sm:px-5 space-y-2">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Document Badges & Meta Chips */}
            <div className="flex flex-wrap items-center gap-2">
              {activePlan ? (
                <>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/90 text-slate-800 shadow-2xs">
                    {activePlan.document_code} Rev.{activePlan.revision}
                  </span>

                  <span
                    className={`inline-flex items-center gap-1 text-[11.5px] font-bold px-2.5 py-0.5 rounded-md border shadow-2xs ${getStatusBadgeStyle(
                      activePlan.status
                    )}`}
                  >
                    {activePlan.status === 'APPROVED' ? (
                      <ShieldCheck size={12} className="text-emerald-700 shrink-0" />
                    ) : activePlan.status === 'REJECTED' ? (
                      <AlertCircle size={12} className="text-rose-600 shrink-0" />
                    ) : (
                      <Clock size={12} className="shrink-0" />
                    )}
                    <span>สถานะ: {activePlan.status}</span>
                  </span>

                  <span className="text-xs text-slate-600 font-medium">
                    แผนก {activePlan.department}{' '}
                    {activePlan.department_name_th ? `(${activePlan.department_name_th})` : ''}
                  </span>

                  <span className="text-slate-300">•</span>
                  <span className="text-xs text-slate-500 font-medium">
                    {(planItems || []).length} รายการ
                  </span>

                  <span className="text-slate-300">•</span>
                  <span className="text-xs text-slate-500 font-medium">
                    วันครบกำหนด:{' '}
                    {activePlan.due_date_rule === 'START_OF_MONTH'
                      ? 'วันที่ 1 ของเดือน'
                      : 'วันสิ้นเดือน (END_OF_MONTH)'}
                  </span>
                </>
              ) : (
                <div className="text-sm font-semibold text-slate-600 flex items-center gap-2">
                  <FileText size={16} className="text-slate-400" />
                  <span className="text-base font-bold text-slate-800">
                    แผนการทวนสอบและสอบเทียบเครื่องมือประจำปี (FM-QC-46)
                  </span>
                </div>
              )}
            </div>

            {/* Quick Actions (Organized by Intent: Utility -> Plan Setup -> Content Action) */}
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {/* Utilities: QMS Guide, History, Settings */}
              <div className="inline-flex items-center gap-1 border-r border-slate-200 pr-1.5 mr-0.5">
                <button
                  type="button"
                  onClick={() => setGuideOpen(!guideOpen)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200/90 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer shadow-2xs"
                  title="คำแนะนำข้อกำหนด QMS"
                >
                  <BookOpen size={13} className="text-indigo-600" />
                  <span className="hidden sm:inline">เกณฑ์ QMS</span>
                  {guideOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>

                {activePlan && (
                  <button
                    type="button"
                    onClick={onOpenHistory}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200/90 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer shadow-2xs"
                    title="ดูประวัติการบันทึกและอนุมัติ"
                  >
                    <History size={13} className="text-slate-500" />
                    <span className="hidden sm:inline">ประวัติการอนุมัติ</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200/90 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer shadow-2xs"
                  title="ตั้งค่าแผนและเกณฑ์อนุมัติ"
                >
                  <SlidersHorizontal size={13} className="text-slate-500" />
                  <span className="hidden md:inline">ตั้งค่าแผน</span>
                </button>
              </div>

              {/* Plan Setup: Edit Header, New Plan */}
              {canEditPlan && activePlan && (
                <button
                  type="button"
                  onClick={() => onOpenEditPlan(activePlan)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200/90 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer shadow-2xs"
                >
                  <Edit3 size={13} className="text-slate-500" />
                  <span>แก้ไขหัวแผน</span>
                </button>
              )}

              <button
                type="button"
                onClick={onOpenCreatePlan}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                <Plus size={13} className="text-slate-600" />
                <span>สร้างแผนประจำปีใหม่</span>
              </button>

              {/* Primary Content Action */}
              {canEditPlan && activePlan && (
                <button
                  type="button"
                  onClick={() => onOpenAddItem(null)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <Plus size={14} />
                  <span>เพิ่มเครื่องมือเข้าแผน</span>
                </button>
              )}
            </div>
          </div>

          {/* Full-width Plan Title */}
          {activePlan && (
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              {activePlan.title}
            </h2>
          )}
        </div>

        {/* Row 2: Status Tabs (Linear Segmented Control) & Filters */}
        <div className="p-2 sm:px-3 bg-slate-50/60 flex flex-wrap items-center justify-between gap-2.5">
          {/* Status Tabs Segmented Control */}
          <div
            className="inline-flex items-center gap-1 bg-slate-200/60 p-1 rounded-xl"
            role="tablist"
            aria-label="สถานะแผนประจำปี"
          >
            {PLAN_STATUS_TABS.map((t) => {
              const isActive = statusTab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setStatusTab(t.key)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/60'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Filters & Plan Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Dynamic Year Select */}
            <select
              aria-label="กรองตามปีของแผน"
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium bg-white text-slate-700 focus:outline-none focus:border-indigo-600 shadow-2xs"
            >
              <option value="">ทุกปี ค.ศ.</option>
              {availableYears.map((yr) => (
                <option key={yr} value={String(yr)}>
                  ปี {yr} (พ.ศ. {yr + 543})
                </option>
              ))}
            </select>

            {/* Master Data Department Select */}
            <select
              aria-label="กรองแผนตามแผนก"
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium bg-white text-slate-700 focus:outline-none focus:border-indigo-600 shadow-2xs"
            >
              <option value="">ทุกแผนก (Master Data)</option>
              {activeDepartments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} — {d.nameTh}
                </option>
              ))}
            </select>

            {/* Plan Switcher Pills / Dropdown */}
            {plans.length > 0 && (
              <div className="inline-flex items-center gap-1.5 pl-1 border-l border-slate-200">
                {plans.length <= 3 ? (
                  plans.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onSelectPlan(p.id)}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                        selectedPlanId === p.id
                          ? 'bg-indigo-50 border-indigo-400 text-indigo-900 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      ปี {p.plan_year} • {p.department} ({p.document_code} Rev.{p.revision}) — {p.item_count || 0} รายการ
                    </button>
                  ))
                ) : (
                  <select
                    aria-label="เลือกฉบับแผนประจำปีที่ต้องการดู"
                    value={selectedPlanId}
                    onChange={(e) => onSelectPlan(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-indigo-300 bg-white text-xs font-bold text-indigo-950 focus:outline-none focus:border-indigo-600 shadow-2xs"
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        ปี {p.plan_year} • {p.department} ({p.document_code} Rev.{p.revision}) — {p.title} [{p.item_count || 0} รายการ]
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Collapsible Audit Guideline Card (Slim Slide-down Disclosure) */}
      {guideOpen && (
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 text-xs text-slate-700 space-y-1.5 shadow-2xs">
          <div className="flex items-center gap-2 font-bold text-slate-800 text-xs">
            <BookOpen size={14} className="text-indigo-600 shrink-0" />
            <span>คำแนะนำการควบคุมเอกสารและการตรวจสอบแผน FM-QC-46 (Audit Guidelines)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1 text-[11.5px]">
            <div className="flex items-start gap-1.5">
              <CheckCircle2 size={13} className="text-indigo-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-900">Plan vs Act:</strong> แถว Plan แสดงเดือนเป้าหมายเท่านั้น ไม่ใช่หลักฐานว่าเสร็จแล้ว (Act. จะขึ้นเมื่อตรวจรับใบงานเสร็จ)
              </span>
            </div>
            <div className="flex items-start gap-1.5">
              <CheckCircle2 size={13} className="text-indigo-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-900">เครื่องมือแบบกลุ่ม (Group):</strong> กลุ่มแม่ (เช่น GRP-SCALE) ต้องแยกรหัสลูกรายตัวก่อนออกใบสั่งงานจริง
              </span>
            </div>
            <div className="flex items-start gap-1.5">
              <CheckCircle2 size={13} className="text-indigo-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-900">วันครบกำหนด:</strong> คำนวณอัตโนมัติจากเดือนที่วางแผนตามเกณฑ์ที่กำหนด (ค่ามาตรฐาน: วันสิ้นเดือน END_OF_MONTH)
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnualPlanWorkspaceHeader;
