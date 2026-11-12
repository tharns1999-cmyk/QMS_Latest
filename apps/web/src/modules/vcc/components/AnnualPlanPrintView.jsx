import React, { useRef } from 'react';
import { Printer, Download, X, AlertCircle, ShieldCheck } from 'lucide-react';
import { resolvePlanSignatories } from '../utils/signatoryHelper';
import { toBuddhistYear, formatVccDate } from '../utils/vccDateUtils';
import { resolvePlanCode } from '../utils/planLabels';
import useStore from '../../../store/useStore';

const ITEMS_PER_PAGE = 6;

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

// Safe helper to parse month array
const parseMonths = (val) => {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
};

// Format signatory position cleanly inside parentheses without double parentheses
const formatPosition = (pos) => {
  if (!pos) return '(ตำแหน่ง)';
  const trimmed = String(pos).trim();
  if (!trimmed || trimmed === '-') return '(ตำแหน่ง)';
  return trimmed.startsWith('(') && trimmed.endsWith(')') ? trimmed : `(${trimmed})`;
};

// Format signatory name cleanly (showing dots placeholder if unsigned)
const formatSignatoryName = (person) => {
  if (!person || !person.name || person.name === '-' || (!person.isSigned && (person.name === 'รอการทบทวน' || person.name === 'รอการอนุมัติ'))) {
    return '................................................';
  }
  return person.name;
};

export const AnnualPlanPrintView = ({
  plan = {},
  items = [],
  assets = [],
  onClose,
  onExportExcel
}) => {
  const { masterUsers } = useStore();
  const printRef = useRef(null);

  const { preparer, reviewer, approver, isApproved } = resolvePlanSignatories(plan, masterUsers);

  const handlePrint = () => {
    window.print();
  };

  const planYear = plan.plan_year || new Date().getFullYear();
  const buddhistYear = toBuddhistYear(planYear);
  const deptCode = plan.department || 'GEN';
  const rawDeptName = plan.department_name_th || plan.department || deptCode;
  const deptDisplayName = formatDepartment(rawDeptName);

  const planNo = plan.plan_code || resolvePlanCode(plan);
  const revNumber = parseInt(plan.revision_no ?? plan.revision ?? 1, 10) || 1;
  const revDisplay = `Rev.${String(revNumber).padStart(2, '0')}`;
  const isEffective = !plan.status || plan.status === 'APPROVED';
  const effectiveDateDisplay = isEffective && plan.approved_at
    ? formatVccDate(plan.approved_at, { style: 'slash' })
    : '-';

  const pages = chunkArray(items, ITEMS_PER_PAGE);
  const totalPages = pages.length;

  const signatoryBoxes = [
    { key: 'preparer', title: 'ผู้จัดทำ (Prepared By)', person: preparer, showNameFallback: true },
    { key: 'reviewer', title: 'ผู้ทบทวน (Reviewed By)', person: reviewer, showNameFallback: false },
    { key: 'approver', title: 'ผู้อนุมัติ (Approved By)', person: approver, showNameFallback: false }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex flex-col items-center justify-start p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto">
      {/* Action Toolbar (Hidden during print) */}
      <div className="w-full max-w-[1120px] bg-white rounded-xl shadow-lg border border-slate-200 px-4 py-2.5 mb-4 flex items-center justify-between shrink-0 print:hidden">
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
      <div id="vcc-plan-print-root" ref={printRef} className="w-full print:w-full">
        {pages.map((pageItems, pageIndex) => (
          <section
            key={pageIndex}
            data-testid={`a4-landscape-sheet-${pageIndex + 1}`}
            className={`a4-landscape-sheet relative w-full max-w-[1120px] mx-auto bg-white rounded-xl border border-slate-300 shadow-xl p-6 text-slate-900 mb-6 flex flex-col min-h-[750px] print:min-h-[190mm] print:w-full print:max-w-none print:rounded-none print:border-0 print:shadow-none print:p-0 print:mb-0 ${
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

            {/* 1. Corporate Header Section: Banner Left + 4-Row Plan Control Table Right */}
            <div className="mb-3 bg-white shrink-0">
              <div className="flex flex-col sm:flex-row print:flex-row sm:items-stretch print:items-stretch justify-between gap-3 pb-2 border-b border-slate-900">
                <div className="flex-1 flex items-center min-w-0">
                  <img
                    src="/banner.png"
                    alt="บริษัท เศรษฐชล จำกัด (SETHACHON CO., LTD.)"
                    className="w-full max-h-20 sm:max-h-24 object-contain object-left"
                  />
                </div>

                <div className="shrink-0 w-full sm:w-64 print:w-64">
                  <table className="w-full h-full border-collapse border border-slate-900 text-[10.5px] leading-tight">
                    <tbody>
                      <tr className="border-b border-slate-900">
                        <th className="py-1 px-2 text-left font-bold bg-slate-100 border-r border-slate-900 whitespace-nowrap w-[48%]">
                          เลขที่แผน (Plan No.)
                        </th>
                        <td className="py-1 px-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {planNo}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-900">
                        <th className="py-1 px-2 text-left font-bold bg-slate-100 border-r border-slate-900 whitespace-nowrap">
                          แก้ไขครั้งที่ (Rev.)
                        </th>
                        <td className="py-1 px-2 font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {revDisplay}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-900">
                        <th className="py-1 px-2 text-left font-bold bg-slate-100 border-r border-slate-900 whitespace-nowrap">
                          วันที่บังคับใช้
                        </th>
                        <td className="py-1 px-2 font-mono text-slate-900 whitespace-nowrap">
                          {effectiveDateDisplay}
                        </td>
                      </tr>
                      <tr>
                        <th className="py-1 px-2 text-left font-bold bg-slate-100 border-r border-slate-900 whitespace-nowrap">
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

              {/* Document Title (Centered under Corporate Banner) */}
              <div className="text-center pt-2 pb-0.5">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                  แผนการทวนสอบและสอบเทียบเครื่องมือวัด ประจำปี {planYear} (พ.ศ. {buddhistYear})
                </h1>
                <div className="text-xs font-medium text-slate-600 italic mt-0.5">
                  Annual Equipment Verification &amp; Calibration Plan
                </div>
                <div className="text-xs sm:text-sm font-semibold text-slate-800 mt-1">
                  หน่วยงาน / แผนก: {deptDisplayName}
                </div>
                {revNumber > 1 && plan.revision_reason && (
                  <div className="mt-1 inline-block text-[10.5px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2.5 py-0.5">
                    <span className="font-bold">เหตุผลการแก้ไข ({revDisplay}):</span> {plan.revision_reason}
                  </div>
                )}
              </div>
            </div>

            {/* 2. Matrix Table (table-fixed 100%, Plan & Act. Dual Row per Item) */}
            <div className="border border-slate-900 mb-2 overflow-hidden">
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
                    <th className="py-1.5 px-0.5 text-center font-bold border-r border-slate-900 text-[9px] leading-tight break-words">
                      ลำดับ
                    </th>
                    <th className="py-1.5 px-1.5 font-bold border-r border-slate-900 text-[10px]">
                      รายการเครื่องมือวัด
                    </th>
                    <th className="py-1.5 px-1 font-bold border-r border-slate-900 text-center text-[10px]">
                      เกณฑ์ยอมรับ
                    </th>
                    <th className="py-1.5 px-1 font-bold border-r border-slate-900 text-center text-[9.5px] leading-tight">
                      หน่วยงานที่ทวนสอบ/สอบเทียบ
                    </th>
                    <th className="py-1.5 px-0.5 text-center font-bold border-r border-slate-900 text-[9.5px] leading-tight">
                      ความถี่
                    </th>
                    <th className="py-1.5 px-0.5 text-center font-bold border-r border-slate-900 text-[9px] leading-tight">
                      Plan / Act.
                    </th>
                    {MONTH_NAMES_TH.map((m, idx) => (
                      <th
                        key={idx}
                        className="py-1.5 px-0 text-center font-bold border-r border-slate-900 whitespace-nowrap text-[9px]"
                      >
                        {m}
                      </th>
                    ))}
                    <th className="py-1.5 px-1 font-bold border-r border-slate-900 text-center text-[9.5px] leading-tight">
                      ผู้รับผิดชอบ
                    </th>
                    <th className="py-1.5 px-1.5 font-bold text-center text-[10px]">
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

                    const matchedAsset = assets.find(
                      (a) => (item.asset_id && a.id === item.asset_id) || (item.asset_code && a.asset_code === item.asset_code)
                    );

                    const criteria = resolveFirstValue(
                      item.acceptance_criteria,
                      item.tolerance,
                      item.mpe,
                      matchedAsset?.acceptance_criteria,
                      matchedAsset?.tolerance,
                      matchedAsset?.mpe
                    );
                    const provider = formatProvider(item);
                    const frequency = item.frequency_label || item.frequency || 'ปีละ 1 ครั้ง';
                    const responsible = item.responsible_name || item.responsible_person || item.responsible_label || '-';
                    const remarks = item.remarks || item.remark || '-';

                    const brandModel = [item.brand, item.model]
                      .map((v) => (typeof v === 'string' ? v.trim() : v))
                      .filter(Boolean)
                      .join(' ') || item.model || '-';
                    const serialNo = (item.serial_no && String(item.serial_no).trim()) || '-';
                    const location = item.location || item.location_name || item.installation_location || '-';

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
                            className="py-1 px-0.5 text-center font-mono text-slate-700 border-r border-slate-300 align-middle"
                          >
                            {globalIndex + 1}
                          </td>

                          {/* 2. รายการเครื่องมือวัด */}
                          <td
                            rowSpan={2}
                            className="py-1.5 px-1.5 border-r border-slate-300 align-top leading-tight break-words whitespace-normal"
                          >
                            <div className="font-bold text-slate-900">
                              <span className="font-mono">{item.asset_code || '-'}</span>
                              {(item.asset_name || item.name) && (
                                <span className="ml-1.5">{item.asset_name || item.name}</span>
                              )}
                            </div>
                            <div className="text-[9.5px] text-slate-600 mt-0.5 space-y-0.5 leading-normal">
                              <div>
                                <span className="text-slate-500">ยี่ห้อ/รุ่น: </span>
                                <span>{brandModel}</span>
                                <span className="mx-1 text-slate-300">|</span>
                                <span className="text-slate-500">SN: </span>
                                <span className="font-mono">{serialNo}</span>
                              </div>
                              <div>
                                <span className="text-slate-500">สถานที่ใช้งาน: </span>
                                <span>{location}</span>
                              </div>
                            </div>
                          </td>

                          {/* 3. เกณฑ์ยอมรับ */}
                          <td
                            rowSpan={2}
                            className="py-1 px-1 text-center text-slate-700 border-r border-slate-300 align-middle whitespace-normal break-words"
                          >
                            {criteria}
                          </td>

                          {/* 4. หน่วยงานที่ทวนสอบ/สอบเทียบ */}
                          <td
                            rowSpan={2}
                            className="py-1 px-1 text-center text-slate-700 border-r border-slate-300 align-middle whitespace-normal break-words"
                          >
                            {provider}
                          </td>

                          {/* 5. ความถี่ */}
                          <td
                            rowSpan={2}
                            className="py-1 px-0.5 text-center text-slate-700 border-r border-slate-300 align-middle whitespace-normal break-words leading-tight"
                          >
                            {frequency}
                          </td>

                          {/* 6. Plan / Act. (แถวบน: Plan) */}
                          <td className="py-1 px-0.5 text-center font-bold text-indigo-700 bg-indigo-50/50 border-r border-slate-300 whitespace-nowrap text-[9.5px]">
                            Plan
                          </td>

                          {/* 7. คอลัมน์เดือน 1-12 (แถวบน: P) */}
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((mNum) => {
                            const isPlanned = plannedMonths.includes(mNum);
                            return (
                              <td
                                key={`plan-${mNum}`}
                                className={`py-1 px-0 text-center font-bold border-r border-slate-300 whitespace-nowrap text-[10px] ${
                                  isPlanned ? 'bg-indigo-50/80 font-black text-indigo-900' : 'text-slate-200'
                                }`}
                              >
                                {isPlanned ? 'P' : ''}
                              </td>
                            );
                          })}

                          {/* 8. ผู้รับผิดชอบ */}
                          <td
                            rowSpan={2}
                            className="py-1 px-1 text-center text-slate-700 border-r border-slate-300 align-middle whitespace-normal break-words"
                          >
                            {responsible}
                          </td>

                          {/* 9. หมายเหตุ */}
                          <td
                            rowSpan={2}
                            className="py-1 px-1.5 text-[9.5px] text-slate-600 align-middle whitespace-normal break-words"
                          >
                            {remarks}
                          </td>
                        </tr>

                        {/* Row 2: Act. */}
                        <tr className="hover:bg-slate-50/50">
                          {/* 6. Plan / Act. (แถวล่าง: Act.) */}
                          <td className="py-1 px-0.5 text-center font-bold text-emerald-700 bg-emerald-50/50 border-r border-slate-300 whitespace-nowrap text-[9.5px]">
                            Act.
                          </td>

                          {/* 7. คอลัมน์เดือน 1-12 (แถวล่าง: ✓) */}
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((mNum) => {
                            const isActual = actualMonths.includes(mNum);
                            return (
                              <td
                                key={`act-${mNum}`}
                                className={`py-1 px-0 text-center font-bold border-r border-slate-300 whitespace-nowrap text-[10px] ${
                                  isActual ? 'bg-emerald-50/80 font-black text-emerald-800' : 'text-slate-200'
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

            {/* 3. Legend under table */}
            <div className="text-[10.5px] text-slate-700 mb-3 font-medium shrink-0">
              สัญลักษณ์: P (Plan) = เดือนที่กำหนดตามแผน  |  ✓ (Act.) = เดือนที่ดำเนินการจริง
            </div>

            {/* 4. Signatory Approval Block (3 Columns pushed to bottom of each A4 sheet) */}
            <div className="mt-auto pt-2 shrink-0">
              <div className="border border-slate-900 grid grid-cols-3 divide-x divide-slate-900 text-xs break-inside-avoid page-break-inside-avoid">
                {signatoryBoxes.map(({ key, title, person, showNameFallback }) => (
                  <div key={key} className="p-2.5 flex flex-col justify-between min-h-28">
                    <div>
                      <div className="font-bold text-slate-800 border-b border-slate-300 pb-1 mb-1.5 text-center text-[11px]">
                        {title}
                      </div>
                      <div className="h-11 flex items-center justify-center">
                        {person.signatureAsset ? (
                          <img
                            src={person.signatureAsset}
                            alt={`ลายเซ็น ${person.name}`}
                            className="max-h-10 max-w-full object-contain"
                          />
                        ) : showNameFallback || person.isSigned ? (
                          <span className="font-cursive text-slate-600 text-sm italic">{person.name}</span>
                        ) : (
                          <span className="text-slate-300 text-xs">- ยังไม่มีการลงนาม -</span>
                        )}
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-700 border-t border-slate-200 pt-1.5 text-center space-y-0.5">
                      <div className="font-semibold text-slate-900">
                        ( {formatSignatoryName(person)} )
                      </div>
                      <div className="text-slate-600">
                        {formatPosition(person.position)}
                      </div>
                      <div className="text-slate-500 text-[9.5px]">
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
            margin: 8mm;
          }
          body {
            background: white !important;
            color: black !important;
          }
          body * {
            visibility: hidden;
          }
          #vcc-plan-print-root, #vcc-plan-print-root * {
            visibility: visible;
          }
          #vcc-plan-print-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            max-height: none !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .a4-landscape-sheet {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          thead {
            display: table-header-group !important;
          }
          tbody {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  );
};

export default AnnualPlanPrintView;
