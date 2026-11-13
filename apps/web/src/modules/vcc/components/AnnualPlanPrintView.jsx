import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Printer, Download, X, AlertCircle, ShieldCheck } from 'lucide-react';
import { resolvePlanSignatories } from '../utils/signatoryHelper';
import { toBuddhistYear, formatVccDate } from '../utils/vccDateUtils';
import { resolvePlanCode } from '../utils/planLabels';
import useStore from '../../../store/useStore';

const ITEMS_PER_PAGE = 10;

const MONTH_NAMES_TH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

const chunkArray = (arr, size) => {
  if (!Array.isArray(arr) || arr.length === 0) return [[]];
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

const resolveFirstValue = (...vals) => {
  for (const v of vals) {
    if (v != null && String(v).trim() !== '') return v;
  }
  return '-';
};

// Clean department name: prevent "ฝ่ายฝ่าย..." duplicate if name already starts with "ฝ่าย"
const formatDepartment = (name) => {
  if (!name || name === '-' || name === 'GEN') return '-';
  let s = String(name).trim();
  if (!s || s === '-') return '-';
  s = s.replace(/^(?:ฝ่าย\s*)+/, 'ฝ่าย');
  if (s.startsWith('ฝ่าย') || s.startsWith('แผนก')) return s;
  return `ฝ่าย${s}`;
};

// Safe helper for provider name display (avoiding raw 'INTERNAL' / 'EXTERNAL')
const formatProvider = (item) => {
  const raw = item.provider_name || item.responsible_label || item.provider_type || item.calibration_type;
  if (!raw) return '-';
  const s = String(raw).trim();
  const upper = s.toUpperCase();
  if (upper === 'INTERNAL' || upper === 'INTERNAL_LAB' || upper === 'IN_HOUSE') return 'ทวนสอบภายใน';
  if (upper === 'EXTERNAL' || upper === 'EXTERNAL_LAB') return 'ห้องปฏิบัติการภายนอก';
  return s;
};

// Safe helper to parse month array (handles array, number, JSON string, or comma-separated string)
export const parseMonths = (val) => {
  if (val == null) return [];
  if (Array.isArray(val)) {
    return val.map((v) => Number(v)).filter((v) => !isNaN(v) && v >= 1 && v <= 12);
  }
  if (typeof val === 'number') {
    return val >= 1 && val <= 12 ? [val] : [];
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => Number(v)).filter((v) => !isNaN(v) && v >= 1 && v <= 12);
      }
      if (typeof parsed === 'number' && parsed >= 1 && parsed <= 12) {
        return [parsed];
      }
    } catch {
      // not JSON, fall through to delimited parsing
    }
    const parts = trimmed.split(',').map((s) => Number(s.trim())).filter((v) => !isNaN(v) && v >= 1 && v <= 12);
    if (parts.length > 0) return parts;
  }
  return [];
};

// Safe helper to parse month (1-12) from date string (YYYY-MM-DD or ISO)
const parseMonthFromDateStr = (dateStr) => {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  const match = s.match(/^\d{4}[-/](\d{1,2})/);
  if (match) return Number(match[1]);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.getMonth() + 1;
  return null;
};

// Format signatory position cleanly without outer parentheses
const formatPosition = (pos) => {
  if (!pos) return '-';
  const trimmed = String(pos).trim();
  if (!trimmed || trimmed === '-' || trimmed === 'ตำแหน่ง') return '-';
  return trimmed.replace(/^\((.*)\)$/, '$1').trim() || '-';
};

// Format signatory name cleanly (showing dots placeholder if unsigned)
const formatSignatoryName = (person) => {
  if (!person || !person.name || person.name === '-' || (!person.isSigned && (person.name === 'รอการทบทวน' || person.name === 'รอการอนุมัติ'))) {
    return '................................................';
  }
  const s = String(person.name).trim();
  const unparenthesized = s.replace(/^\((.*)\)$/, '$1').trim();
  return unparenthesized || '................................................';
};

export const AnnualPlanPrintView = ({
  plan = {},
  items = [],
  assets = [],
  workOrders = [],
  onClose,
  onExportExcel
}) => {
  const { masterUsers, masterDepartments = [] } = useStore();
  const printRef = useRef(null);

  const { preparer, reviewer, approver, isApproved } = resolvePlanSignatories(plan, masterUsers);

  const handlePrint = () => {
    window.print();
  };

  const planYear = plan.plan_year || new Date().getFullYear();
  const buddhistYear = toBuddhistYear(planYear);
  const deptCode = plan.department || 'GEN';
  const matchedDept = (masterDepartments || []).find((d) => d.code === deptCode || d.id === deptCode);
  const rawDeptName = plan.department_name_th || matchedDept?.name_th || plan.department || deptCode;
  const deptDisplayName = formatDepartment(rawDeptName);

  const planNo = plan.plan_code || resolvePlanCode(plan);
  const rawRev = plan.revision_no ?? plan.revision;
  let revNumber = 1;
  if (rawRev != null && String(rawRev).trim() !== '') {
    const cleaned = String(rawRev).replace(/\D+/g, '');
    if (cleaned !== '') {
      revNumber = parseInt(cleaned, 10);
    }
  }
  const revDisplay = `Rev.${String(revNumber).padStart(2, '0')}`;
  const isEffective = !plan.status || plan.status === 'APPROVED';
  const effectiveDate = plan.approved_at || plan.effective_date;
  const effectiveDateDisplay = isEffective && effectiveDate
    ? formatVccDate(effectiveDate, { style: 'slash' })
    : '-';
  const hasRevReason = Boolean(
    plan.revision_reason &&
    String(plan.revision_reason).trim() !== '' &&
    (revNumber > 1 || (revNumber >= 1 && (plan.parent_plan_id || String(plan.revision || '').trim() !== '00')))
  );

  const pages = chunkArray(items, ITEMS_PER_PAGE);
  const totalPages = pages.length;

  const signatoryBoxes = [
    { key: 'preparer', title: 'ผู้จัดทำ (Prepared By)', person: preparer, showNameFallback: true },
    { key: 'reviewer', title: 'ผู้ทบทวน (Reviewed By)', person: reviewer, showNameFallback: false },
    { key: 'approver', title: 'ผู้อนุมัติ (Approved By)', person: approver, showNameFallback: false }
  ];

  const content = (
    <div
      id="vcc-print-portal"
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex flex-col items-center justify-start p-2 sm:p-4 overflow-auto print:p-0 print:bg-white print:static print:inset-auto"
    >
      {/* Action Toolbar (Hidden during print) */}
      <div className="no-print w-full max-w-[1120px] bg-white rounded-xl shadow-lg border border-slate-200 px-4 py-2.5 mb-4 flex items-center justify-between shrink-0 print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">
            ตัวอย่างก่อนพิมพ์: แผนการทวนสอบและสอบเทียบประจำปี {buddhistYear}
          </span>
          {isApproved ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              <ShieldCheck size={12} /> มีผลบังคับใช้ (พร้อมลายเซ็น)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              <AlertCircle size={12} /> ฉบับร่าง (ห้ามใช้ปฏิบัติงาน)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onExportExcel && (
            <button
              type="button"
              onClick={onExportExcel}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Download size={13} className="text-slate-500" />
              <span>ส่งออก Excel</span>
            </button>
          )}

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
          >
            <Printer size={13} />
            <span>พิมพ์เอกสาร (Print)</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              aria-label="ปิดหน้าพิมพ์"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Multi-Page A4 Landscape Container */}
      <div
        id="vcc-plan-print-root"
        ref={printRef}
        className="print-scroll-container w-full overflow-x-auto print:overflow-visible print:w-full"
      >
        {pages.map((pageItems, pageIndex) => (
          <section
            key={pageIndex}
            data-testid={`a4-landscape-sheet-${pageIndex + 1}`}
            className={`a4-landscape-sheet relative w-[297mm] min-h-[208mm] mx-auto bg-white rounded-xl border border-slate-300 shadow-xl p-[8mm_10mm] text-slate-900 mb-6 flex flex-col justify-between print:overflow-visible print:w-full print:max-w-none print:rounded-none print:border-0 print:shadow-none print:mb-0 ${
              pageIndex < totalPages - 1 ? 'print:break-after-page' : 'print:break-after-auto'
            }`}
            style={{ fontFamily: "Sarabun, 'Noto Sans Thai', -apple-system, BlinkMacSystemFont, sans-serif" }}
          >
            {/* Diagonal Watermark for Draft Plans */}
            {!isApproved && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center justify-center select-none z-10 overflow-hidden"
              >
                <div className="transform -rotate-30 text-rose-500/15 border-8 border-dashed border-rose-500/20 font-black text-4xl sm:text-6xl tracking-widest px-12 py-6 rounded-2xl text-center uppercase">
                  DRAFT / ฉบับร่าง<br />
                  <span className="text-xl sm:text-2xl font-bold tracking-normal text-rose-500/20">
                    (ห้ามใช้ปฏิบัติงาน — ร่างแบบฟอร์มยังไม่ได้รับการอนุมัติ)
                  </span>
                </div>
              </div>
            )}

            {/* Top Block: 1. Header + 2. Table + 3. Legend */}
            <div>
              {/* 1. Unified ISO Header Box: Banner Left + 4-Row Plan Control Table Right + Title Bar Bottom */}
              <div className="border border-slate-800 mb-2 bg-white">
                {/* Upper: 2 Columns (Banner Left, Plan Control Table Right) */}
                <div className="flex items-stretch border-b border-slate-800">
                  <div className="w-[72%] p-2 flex items-center min-w-0">
                    <img
                      src="/banner.png"
                      alt="บริษัท เศรษฐชล จำกัด (SETHACHON CO., LTD.)"
                      className="h-16 w-auto max-w-full object-contain object-left"
                    />
                  </div>

                  <div className="w-[28%] border-l border-slate-800 flex flex-col justify-stretch">
                    <table className="w-full h-full border-collapse text-[10px] leading-tight">
                      <tbody>
                        <tr className="border-b border-slate-800 h-1/4">
                          <th className="py-1 px-2 text-left font-bold bg-slate-100 border-r border-slate-800 whitespace-nowrap w-[48%]">
                            เลขที่แผน (Plan No.)
                          </th>
                          <td className="py-1 px-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {planNo}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-800 h-1/4">
                          <th className="py-1 px-2 text-left font-bold bg-slate-100 border-r border-slate-800 whitespace-nowrap">
                            แก้ไขครั้งที่ (Rev.)
                          </th>
                          <td className="py-1 px-2 font-mono font-semibold text-slate-900 whitespace-nowrap">
                            {revDisplay}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-800 h-1/4">
                          <th className="py-1 px-2 text-left font-bold bg-slate-100 border-r border-slate-800 whitespace-nowrap">
                            วันที่บังคับใช้
                          </th>
                          <td className="py-1 px-2 font-mono text-slate-900 whitespace-nowrap">
                            {effectiveDateDisplay}
                          </td>
                        </tr>
                        <tr className="h-1/4">
                          <th className="py-1 px-2 text-left font-bold bg-slate-100 border-r border-slate-800 whitespace-nowrap">
                            แผ่นที่ (Page)
                          </th>
                          <td className="py-1 px-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {pageIndex + 1} / {totalPages}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Lower: Title Bar (Centered) */}
                <div className="bg-slate-50/60 py-1.5 px-3 text-center">
                  <div className="text-sm font-bold text-slate-900">
                    แผนการทวนสอบและสอบเทียบเครื่องมือวัด ประจำปี {planYear} (พ.ศ. {buddhistYear})
                  </div>
                  <div className="text-xs font-semibold text-slate-700 mt-0.5">
                    หน่วยงาน / แผนก: {deptDisplayName}
                  </div>
                </div>
              </div>

              {/* 2. Matrix Table (table-fixed 100%, Plan & Act. Dual Row per Item) */}
              <div className="table-container border border-slate-800 mb-1 overflow-visible print:overflow-visible">
                <table className="table-fixed w-full text-left border-collapse text-[10px]">
                  <colgroup>
                    <col style={{ width: '3%' }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '5%' }} />
                    {MONTH_NAMES_TH.map((_, idx) => (
                      <col key={`col-m-${idx}`} style={{ width: '2.2%' }} />
                    ))}
                    <col style={{ width: '7.6%' }} />
                    <col style={{ width: '13%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-900 text-slate-800">
                      <th className="py-0.5 px-0.5 text-center font-bold border-r border-slate-900 text-[9px] leading-tight break-words">
                        ลำดับ
                      </th>
                      <th className="py-0.5 px-1.5 font-bold border-r border-slate-900 text-[10px]">
                        รายการเครื่องมือวัด
                      </th>
                      <th className="py-0.5 px-1 font-bold border-r border-slate-900 text-center text-[9.5px]">
                        เกณฑ์ยอมรับ
                      </th>
                      <th className="py-0.5 px-1 font-bold border-r border-slate-900 text-center text-[9.5px] leading-tight">
                        หน่วยงานที่ทวนสอบ/สอบเทียบ
                      </th>
                      <th className="py-0.5 px-0.5 text-center font-bold border-r border-slate-900 text-[9.5px] leading-tight">
                        ความถี่
                      </th>
                      <th className="py-0.5 px-0.5 text-center font-bold border-r border-slate-900 text-[9px] leading-tight">
                        Plan / Act.
                      </th>
                      {MONTH_NAMES_TH.map((m, idx) => (
                        <th
                          key={idx}
                          className="py-0.5 px-0 text-center font-bold border-r border-slate-900 whitespace-nowrap text-[9px]"
                        >
                          {m}
                        </th>
                      ))}
                      <th className="py-0.5 px-1 font-bold border-r border-slate-900 text-center text-[9.5px] leading-tight">
                        ผู้รับผิดชอบ
                      </th>
                      <th className="py-0.5 px-1.5 font-bold text-center text-[9.5px]">
                        หมายเหตุ
                      </th>
                    </tr>
                  </thead>
                  {pageItems.length === 0 ? (
                    <tbody>
                      <tr>
                        <td colSpan={20} className="py-6 text-center text-slate-400 font-medium">
                          ไม่มีรายการเครื่องมือในแผนฉบับนี้
                        </td>
                      </tr>
                    </tbody>
                  ) : (
                    pageItems.map((item, index) => {
                      const globalIndex = pageIndex * ITEMS_PER_PAGE + index;
                      const plannedMonths = parseMonths(item.planned_months);
                      const actualMonths = parseMonths(item.actual_months);

                      const normCode = (code) => String(code || '').trim().toUpperCase();

                      const matchedAsset = assets.find(
                        (a) =>
                          (item.asset_id && a.id === item.asset_id) ||
                          (item.asset_code && a.asset_code && normCode(a.asset_code) === normCode(item.asset_code))
                      );

                      const matchedWorkOrders = (workOrders || []).filter(
                        (w) =>
                          (item.id && w.plan_item_id === item.id) ||
                          (item.asset_id && w.asset_id === item.asset_id) ||
                          (item.asset_code && w.asset_code && normCode(w.asset_code) === normCode(item.asset_code))
                      );

                      const latestWorkOrderWithCriteria = [...matchedWorkOrders]
                        .filter((w) => w.acceptance_criteria && String(w.acceptance_criteria).trim() !== '')
                        .sort((a, b) => {
                          const dateA = a.performed_at || a.due_date || a.created_at || '';
                          const dateB = b.performed_at || b.due_date || b.created_at || '';
                          return String(dateB).localeCompare(String(dateA));
                        })[0];

                      const latestWorkOrder = matchedWorkOrders.length > 0
                        ? [...matchedWorkOrders].sort((a, b) => {
                            const dateA = a.performed_at || a.due_date || a.created_at || '';
                            const dateB = b.performed_at || b.due_date || b.created_at || '';
                            return String(dateB).localeCompare(String(dateA));
                          })[0]
                        : null;

                      const criteria = resolveFirstValue(
                        item.acceptance_criteria,
                        item.tolerance,
                        item.mpe,
                        matchedAsset?.acceptance_criteria,
                        matchedAsset?.tolerance,
                        matchedAsset?.mpe,
                        latestWorkOrderWithCriteria?.acceptance_criteria,
                        latestWorkOrder?.acceptance_criteria
                      );
                      const provider = formatProvider(item);
                      const frequency = item.frequency_label || item.frequency || 'ปีละ 1 ครั้ง';
                      const responsible = item.responsible_name || item.responsible_person || item.responsible_label || '-';
                      const rawRemarks = item.remarks || item.remark || '-';
                      const remarks = String(rawRemarks).replace(/\[ข้อมูลทดสอบ\]\s*/g, '').trim() || '-';

                      const rawAssetName = item.asset_name || item.name || matchedAsset?.asset_name || matchedAsset?.name || '';
                      const cleanAssetName = String(rawAssetName).replace(/\[ข้อมูลทดสอบ\]\s*/g, '').trim();

                      const rawAssetCode = item.asset_code || matchedAsset?.asset_code || '-';
                      const cleanAssetCode = String(rawAssetCode).replace(/\[ข้อมูลทดสอบ\]\s*/g, '').trim() || '-';

                      const brand = item.brand || matchedAsset?.brand;
                      const model = item.model || matchedAsset?.model;
                      const brandModel = [brand, model]
                        .map((v) => (typeof v === 'string' ? v.trim() : v))
                        .filter(Boolean)
                        .join(' ') || model || brand || '-';
                      const serialNo = (item.serial_no && String(item.serial_no).trim()) ||
                        (matchedAsset?.serial_no && String(matchedAsset.serial_no).trim()) || '-';
                      const location = item.location || item.location_name || item.installation_location ||
                        matchedAsset?.location || matchedAsset?.location_name || matchedAsset?.installation_location || '-';

                      const targetPlanYear = Number(planYear);

                      const isMonthActual = (mNum) => {
                        if (actualMonths.includes(mNum)) return true;
                        return matchedWorkOrders.some((w) => {
                          if (String(w.status || '').toUpperCase() !== 'CLOSED') return false;

                          // Check that the closed work order belongs to the same plan year
                          const performedYear = w.performed_at ? Number(String(w.performed_at).slice(0, 4)) : null;
                          const woYear = w.plan_year
                            ? Number(w.plan_year)
                            : w.due_date
                              ? Number(String(w.due_date).slice(0, 4))
                              : targetPlanYear;

                          if (performedYear != null) {
                            if (performedYear !== targetPlanYear) return false;
                          } else {
                            if (woYear !== targetPlanYear && (!w.plan_id || w.plan_id !== plan.id)) return false;
                          }

                          let woMonth = 0;
                          const parsedPerformedMonth = parseMonthFromDateStr(w.performed_at);
                          if (parsedPerformedMonth != null) {
                            woMonth = parsedPerformedMonth;
                          } else if (w.planned_month != null) {
                            woMonth = Number(w.planned_month);
                          }
                          return woMonth === mNum;
                        });
                      };

                      return (
                        <tbody
                          key={item.id || globalIndex}
                          className="border-b border-slate-400 break-inside-avoid page-break-inside-avoid"
                        >
                          {/* Row 1: Plan */}
                          <tr className="border-b border-slate-300 hover:bg-slate-50/50">
                            {/* 1. ลำดับ */}
                            <td
                              rowSpan={2}
                              className="py-0.5 px-1 text-center font-mono text-slate-700 border-r border-slate-300 align-middle text-[9.5px] leading-tight"
                            >
                              {globalIndex + 1}
                            </td>

                            {/* 2. รายการเครื่องมือวัด */}
                            <td
                              rowSpan={2}
                              className="py-0.5 px-1 border-r border-slate-300 align-middle text-[10px] leading-tight break-words whitespace-normal"
                            >
                              <div className="text-[10px] leading-tight">
                                <span className="font-bold text-slate-900 font-mono">{cleanAssetCode}</span>
                                {cleanAssetName ? (
                                  <span className="font-semibold text-slate-800 ml-1">{cleanAssetName}</span>
                                ) : null}
                              </div>
                              <div className="text-[9px] text-slate-600 leading-tight mt-0.5">
                                รุ่น: {brandModel} • SN: {serialNo} • สถานที่: {location}
                              </div>
                            </td>

                            {/* 3. เกณฑ์ยอมรับ */}
                            <td
                              rowSpan={2}
                              className="py-0.5 px-1 text-center text-slate-800 border-r border-slate-300 align-middle whitespace-normal break-words text-[9.5px] leading-tight font-medium"
                            >
                              {criteria}
                            </td>

                            {/* 4. หน่วยงานที่ทวนสอบ/สอบเทียบ */}
                            <td
                              rowSpan={2}
                              className="py-0.5 px-1 text-center text-slate-700 border-r border-slate-300 align-middle whitespace-normal break-words text-[9.5px] leading-tight"
                            >
                              {provider}
                            </td>

                            {/* 5. ความถี่ */}
                            <td
                              rowSpan={2}
                              className="py-0.5 px-1 text-center text-slate-700 border-r border-slate-300 align-middle whitespace-normal break-words text-[9.5px] leading-tight"
                            >
                              {frequency}
                            </td>

                            {/* 6. Plan / Act. (แถวบน: Plan) */}
                            <td className="h-[15px] py-0 px-0.5 text-center font-bold text-indigo-700 bg-indigo-50/50 border-r border-slate-300 whitespace-nowrap text-[9px] leading-none align-middle">
                              Plan
                            </td>

                            {/* 7. คอลัมน์เดือน 1-12 (แถวบน: P) */}
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((mNum) => {
                              const isPlanned = plannedMonths.includes(mNum) || plannedMonths.includes(String(mNum));
                              return (
                                <td
                                  key={`plan-${mNum}`}
                                  className={`h-[15px] py-0 px-0.5 text-center font-bold border-r border-slate-300 whitespace-nowrap text-[9px] leading-none align-middle ${
                                    isPlanned ? 'bg-indigo-50/80 font-black text-indigo-900 print:text-black' : 'text-slate-200'
                                  }`}
                                >
                                  {isPlanned ? 'P' : ''}
                                </td>
                              );
                            })}

                            {/* 8. ผู้รับผิดชอบ */}
                            <td
                              rowSpan={2}
                              className="py-0.5 px-1 text-center text-slate-700 border-r border-slate-300 align-middle whitespace-normal break-words text-[9.5px] leading-tight"
                            >
                              {responsible}
                            </td>

                            {/* 9. หมายเหตุ */}
                            <td
                              rowSpan={2}
                              className="py-0.5 px-1 text-[9.5px] text-slate-600 align-middle whitespace-normal break-words leading-tight"
                            >
                              {remarks}
                            </td>
                          </tr>

                          {/* Row 2: Act. */}
                          <tr className="hover:bg-slate-50/50">
                            {/* 6. Plan / Act. (แถวล่าง: Act.) */}
                            <td className="h-[15px] py-0 px-0.5 text-center font-bold text-emerald-700 bg-emerald-50/50 border-r border-slate-300 whitespace-nowrap text-[9px] leading-none align-middle">
                              Act.
                            </td>

                            {/* 7. คอลัมน์เดือน 1-12 (แถวล่าง: ✓) */}
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((mNum) => {
                              const isActual = isMonthActual(mNum);
                              return (
                                <td
                                  key={`act-${mNum}`}
                                  className={`h-[15px] py-0 px-0.5 text-center font-bold border-r border-slate-300 whitespace-nowrap text-[9px] leading-none align-middle ${
                                    isActual ? 'bg-emerald-50/80 font-black text-emerald-950 print:text-black' : 'text-slate-200'
                                  }`}
                                >
                                  {isActual ? '✓' : ''}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      );
                    })
                  )}
                </table>
              </div>

              {/* 3. Legend & Revision Reason under table */}
              <div className="flex items-center justify-between text-[10px] text-slate-600 mb-1 font-medium">
                <div>
                  สัญลักษณ์: P (Plan) = เดือนที่กำหนดตามแผน  |  ✓ (Act.) = เดือนที่ดำเนินการจริง
                </div>
                {hasRevReason && (
                  <div className="inline-flex items-center gap-1 text-[9.5px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 font-normal">
                    <span className="font-bold">เหตุผลการแก้ไข ({revDisplay}):</span> {plan.revision_reason}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Block: 4. Signatory Approval Block (3 Columns pushed to bottom of each A4 sheet) */}
            <div className="mt-4 shrink-0">
              <div className="min-h-[105px] border border-slate-800 grid grid-cols-3 divide-x divide-slate-800 text-xs break-inside-avoid page-break-inside-avoid bg-white">
                {signatoryBoxes.map(({ key, title, person, showNameFallback }) => (
                  <div key={key} className="flex flex-col justify-between">
                    {/* 1. แถบหัวข้อ (Header Bar) */}
                    <div className="bg-slate-100 border-b border-slate-800 py-1 px-2 text-center text-[10.5px] font-bold text-slate-900">
                      {title}
                    </div>

                    {/* 2. พื้นที่ลงลายมือชื่อ (Signature Area) */}
                    <div className="h-12 flex flex-col items-center justify-end pb-1 px-3">
                      <div className="flex-1 flex items-center justify-center w-full min-h-0">
                        {person.signatureAsset ? (
                          <img
                            src={person.signatureAsset}
                            alt={`ลายเซ็น ${person.name}`}
                            className="max-h-9 max-w-full object-contain"
                          />
                        ) : showNameFallback || person.isSigned ? (
                          <span
                            className="font-cursive text-slate-700 text-xs italic"
                            style={{ fontFamily: "'Brush Script MT', 'Segoe Script', 'Caveat', cursive, sans-serif" }}
                          >
                            {person.name}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-[9.5px]">- ยังไม่มีการลงนาม -</span>
                        )}
                      </div>
                      <div className="w-full text-center text-slate-400 text-[9px] tracking-widest leading-none mt-0.5 select-none overflow-hidden">
                        .......................................................
                      </div>
                    </div>

                    {/* 3. รายละเอียดผู้ลงนาม (Footer Info — แยก 3 บรรทัดชัดเจน) */}
                    <div className="py-1.5 px-2 text-center text-[10px] leading-snug">
                      <div className="font-semibold text-slate-900">
                        ( {formatSignatoryName(person)} )
                      </div>
                      <div className="text-slate-700">
                        ตำแหน่ง: {formatPosition(person.position)}
                      </div>
                      <div className="text-slate-600">
                        วันที่: {person.date || '-'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* Scoped Print Media Styles */}
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 0mm !important;
          }
          html, body {
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* ซ่อนแอปหลัก (#root) ทั้งหมดตอนพิมพ์ เหลือเฉพาะ Portal พิมพ์เอกสาร */
          body > *:not(#vcc-print-portal) {
            display: none !important;
          }
          #vcc-print-portal {
            position: static !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          #vcc-print-portal .no-print {
            display: none !important;
          }
          #vcc-print-portal .print-scroll-container {
            position: static !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
            border: none !important;
            box-shadow: none !important;
          }
          #vcc-print-portal .a4-landscape-sheet {
            width: 100% !important;
            height: 208mm !important;
            min-height: 0 !important;
            max-width: none !important;
            padding: 8mm 10mm !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            overflow: visible !important;
            background: #ffffff !important;
          }
          #vcc-print-portal .table-container {
            overflow: visible !important;
          }
          #vcc-print-portal thead {
            display: table-header-group !important;
          }
          #vcc-print-portal tbody {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          #vcc-print-portal .a4-landscape-sheet:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
        }
      `}</style>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};

export default AnnualPlanPrintView;
