import React, { useRef } from 'react';
import { Printer, Download, X, AlertCircle, ShieldCheck } from 'lucide-react';
import { resolvePlanSignatories } from '../utils/signatoryHelper';
import { toBuddhistYear } from '../utils/vccDateUtils';
import useStore from '../../../store/useStore';

const MONTH_NAMES_TH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

export const AnnualPlanPrintView = ({
  plan = {},
  items = [],
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

  // Clean department name: prevent "ฝ่ายฝ่าย..." duplicate if name already starts with "ฝ่าย"
  const formatDepartment = (name) => {
    if (!name || name === '-' || name === 'GEN') return '-';
    let s = String(name).trim();
    if (!s || s === '-') return '-';
    // Remove repeated "ฝ่าย" prefixes (e.g. "ฝ่ายฝ่าย...", "ฝ่าย ฝ่าย...")
    s = s.replace(/^(?:ฝ่าย\s*)+/, 'ฝ่าย');
    // If it already starts with ฝ่าย or แผนก, keep as-is
    if (s.startsWith('ฝ่าย') || s.startsWith('แผนก')) return s;
    return `ฝ่าย${s}`;
  };
  const deptDisplayName = formatDepartment(rawDeptName);

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

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex flex-col items-center justify-start p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto">
      {/* Action Toolbar (Hidden during print) */}
      <div className="w-full max-w-5xl bg-white rounded-xl shadow-lg border border-slate-200 px-4 py-2.5 mb-3 flex items-center justify-between shrink-0 print:hidden">
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

      {/* Printable Sheet (Landscape A4 styled) */}
      <div
        id="vcc-plan-print-root"
        ref={printRef}
        className="relative w-full max-w-5xl bg-white rounded-xl shadow-xl border border-slate-300 p-6 sm:p-8 text-slate-900 print:shadow-none print:border-0 print:p-0 print:max-w-none print:w-full print:rounded-none overflow-hidden print:overflow-visible"
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

        {/* 1. Corporate Header Section: Sethachon Corporate Banner & Title */}
        <div className="mb-4 bg-white">
          <div className="pb-2">
            <img
              src="/banner.png"
              alt="บริษัท เศรษฐชล จำกัด (SETHACHON CO., LTD.)"
              className="w-full max-h-24 object-contain object-left"
            />
          </div>

          {/* Document Title (Centered under Corporate Banner) */}
          <div className="text-center pt-2 pb-1">
            <h1 className="text-base sm:text-lg font-bold text-slate-900">
              แผนการทวนสอบและสอบเทียบเครื่องมือวัด ประจำปี {planYear} (พ.ศ. {buddhistYear})
            </h1>
            <div className="text-xs font-medium text-slate-600 italic mt-0.5">
              Annual Equipment Verification & Calibration Plan
            </div>
            <div className="text-xs sm:text-sm font-semibold text-slate-800 mt-1.5">
              หน่วยงาน / แผนก: {deptDisplayName}
            </div>
          </div>
        </div>

        {/* 2. Matrix Table (Plan & Act. Dual Row per Item) */}
        <div className="overflow-x-auto border border-slate-900 mb-2">
          <table className="w-full text-left border-collapse text-[10.5px]">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-900 text-slate-800">
                <th className="py-2 px-1 text-center font-bold border-r border-slate-900 w-8 whitespace-nowrap">
                  ลำดับ
                </th>
                <th className="py-2 px-2 font-bold border-r border-slate-900 min-w-44">
                  รายการเครื่องมือวัด
                </th>
                <th className="py-2 px-1.5 font-bold border-r border-slate-900 text-center min-w-24">
                  เกณฑ์ยอมรับ
                </th>
                <th className="py-2 px-1.5 font-bold border-r border-slate-900 text-center min-w-28">
                  หน่วยงานที่ทวนสอบ/สอบเทียบ
                </th>
                <th className="py-2 px-1 text-center font-bold border-r border-slate-900 w-16 whitespace-nowrap">
                  ความถี่
                </th>
                <th className="py-2 px-1 text-center font-bold border-r border-slate-900 w-14 whitespace-nowrap">
                  Plan / Act.
                </th>
                {MONTH_NAMES_TH.map((m, idx) => (
                  <th
                    key={idx}
                    className="py-2 px-0.5 text-center font-bold border-r border-slate-900 w-7 whitespace-nowrap text-[10px]"
                  >
                    {m}
                  </th>
                ))}
                <th className="py-2 px-1.5 font-bold border-r border-slate-900 text-center min-w-20">
                  ผู้รับผิดชอบ
                </th>
                <th className="py-2 px-2 font-bold text-center min-w-24">
                  หมายเหตุ
                </th>
              </tr>
            </thead>
            {items.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={20} className="py-6 text-center text-slate-400 font-medium">
                    ไม่มีรายการเครื่องมือในแผนฉบับนี้
                  </td>
                </tr>
              </tbody>
            ) : (
              items.map((item, index) => {
                const plannedMonths = parseMonths(item.planned_months);
                const actualMonths = parseMonths(item.actual_months);

                const criteria = (item.acceptance_criteria != null && item.acceptance_criteria !== '')
                  ? item.acceptance_criteria
                  : ((item.mpe != null && item.mpe !== '') ? item.mpe : '-');
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
                    key={item.id || index}
                    className="border-b border-slate-400 break-inside-avoid page-break-inside-avoid"
                  >
                    {/* Row 1: Plan */}
                    <tr className="border-b border-slate-300 hover:bg-slate-50/50">
                      {/* 1. ลำดับ */}
                      <td
                        rowSpan={2}
                        className="py-1 px-1 text-center font-mono text-slate-700 border-r border-slate-300 align-middle"
                      >
                        {index + 1}
                      </td>

                      {/* 2. รายการเครื่องมือวัด */}
                      <td
                        rowSpan={2}
                        className="py-1.5 px-2 border-r border-slate-300 align-top leading-tight"
                      >
                        <div className="font-bold text-slate-900">
                          <span className="font-mono">{item.asset_code || '-'}</span>
                          {(item.asset_name || item.name) && (
                            <span className="ml-1.5">{item.asset_name || item.name}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-600 mt-1 space-y-0.5 leading-normal">
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
                        className="py-1 px-2 text-center text-slate-700 border-r border-slate-300 align-middle whitespace-normal break-words"
                      >
                        {criteria}
                      </td>

                      {/* 4. หน่วยงานที่ทวนสอบ/สอบเทียบ */}
                      <td
                        rowSpan={2}
                        className="py-1 px-2 text-center text-slate-700 border-r border-slate-300 align-middle whitespace-normal break-words"
                      >
                        {provider}
                      </td>

                      {/* 5. ความถี่ */}
                      <td
                        rowSpan={2}
                        className="py-1 px-1 text-center text-slate-700 border-r border-slate-300 align-middle whitespace-nowrap"
                      >
                        {frequency}
                      </td>

                      {/* 6. Plan / Act. (แถวบน: Plan) */}
                      <td className="py-1 px-1 text-center font-bold text-indigo-700 bg-indigo-50/50 border-r border-slate-300 whitespace-nowrap text-[10px]">
                        Plan
                      </td>

                      {/* 7. คอลัมน์เดือน 1-12 (แถวบน: P) */}
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((mNum) => {
                        const isPlanned = plannedMonths.includes(mNum);
                        return (
                          <td
                            key={`plan-${mNum}`}
                            className={`py-1 px-0.5 text-center font-bold border-r border-slate-300 whitespace-nowrap text-[11px] ${
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
                        className="py-1 px-1.5 text-center text-slate-700 border-r border-slate-300 align-middle whitespace-normal break-words"
                      >
                        {responsible}
                      </td>

                      {/* 9. หมายเหตุ */}
                      <td
                        rowSpan={2}
                        className="py-1 px-2 text-[10px] text-slate-600 align-middle whitespace-normal break-words"
                      >
                        {remarks}
                      </td>
                    </tr>

                    {/* Row 2: Act. */}
                    <tr className="hover:bg-slate-50/50">
                      {/* 6. Plan / Act. (แถวล่าง: Act.) */}
                      <td className="py-1 px-1 text-center font-bold text-emerald-700 bg-emerald-50/50 border-r border-slate-300 whitespace-nowrap text-[10px]">
                        Act.
                      </td>

                      {/* 7. คอลัมน์เดือน 1-12 (แถวล่าง: ✓) */}
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((mNum) => {
                        const isActual = actualMonths.includes(mNum);
                        return (
                          <td
                            key={`act-${mNum}`}
                            className={`py-1 px-0.5 text-center font-bold border-r border-slate-300 whitespace-nowrap text-[11px] ${
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

        {/* Legend under table */}
        <div className="text-[11px] text-slate-700 mb-4 font-medium">
          สัญลักษณ์: P (Plan) = เดือนที่กำหนดตามแผน  |  ✓ (Act.) = เดือนที่ดำเนินการจริง
        </div>

        {/* 3. Signatory Approval Block (3 Columns) */}
        <div className="border border-slate-900 grid grid-cols-3 divide-x divide-slate-900 text-xs break-inside-avoid page-break-inside-avoid">
          {/* Box 1: ผู้จัดทำ (Prepared By) */}
          <div className="p-3 flex flex-col justify-between min-h-32">
            <div>
              <div className="font-bold text-slate-800 border-b border-slate-300 pb-1 mb-2 text-center">
                ผู้จัดทำ (Prepared By)
              </div>
              <div className="h-12 flex items-center justify-center">
                {preparer.signatureAsset ? (
                  <img
                    src={preparer.signatureAsset}
                    alt={`ลายเซ็น ${preparer.name}`}
                    className="max-h-11 max-w-full object-contain"
                  />
                ) : (
                  <span className="font-cursive text-slate-600 text-sm italic">{preparer.name}</span>
                )}
              </div>
            </div>

            <div className="text-[10.5px] text-slate-700 border-t border-slate-200 pt-2 text-center space-y-0.5">
              <div className="font-semibold text-slate-900">
                ( {formatSignatoryName(preparer)} )
              </div>
              <div className="text-slate-600">
                {formatPosition(preparer.position)}
              </div>
              <div className="text-slate-500 text-[10px]">
                วันที่: {preparer.date || '-'}
              </div>
            </div>
          </div>

          {/* Box 2: ผู้ทบทวน (Reviewed By) */}
          <div className="p-3 flex flex-col justify-between min-h-32">
            <div>
              <div className="font-bold text-slate-800 border-b border-slate-300 pb-1 mb-2 text-center">
                ผู้ทบทวน (Reviewed By)
              </div>
              <div className="h-12 flex items-center justify-center">
                {reviewer.signatureAsset ? (
                  <img
                    src={reviewer.signatureAsset}
                    alt={`ลายเซ็น ${reviewer.name}`}
                    className="max-h-11 max-w-full object-contain"
                  />
                ) : reviewer.isSigned ? (
                  <span className="font-cursive text-slate-600 text-sm italic">{reviewer.name}</span>
                ) : (
                  <span className="text-slate-300 text-xs">- ยังไม่มีการลงนาม -</span>
                )}
              </div>
            </div>

            <div className="text-[10.5px] text-slate-700 border-t border-slate-200 pt-2 text-center space-y-0.5">
              <div className="font-semibold text-slate-900">
                ( {formatSignatoryName(reviewer)} )
              </div>
              <div className="text-slate-600">
                {formatPosition(reviewer.position)}
              </div>
              <div className="text-slate-500 text-[10px]">
                วันที่: {reviewer.date || '-'}
              </div>
            </div>
          </div>

          {/* Box 3: ผู้อนุมัติ (Approved By) */}
          <div className="p-3 flex flex-col justify-between min-h-32">
            <div>
              <div className="font-bold text-slate-800 border-b border-slate-300 pb-1 mb-2 text-center">
                ผู้อนุมัติ (Approved By)
              </div>
              <div className="h-12 flex items-center justify-center">
                {approver.signatureAsset ? (
                  <img
                    src={approver.signatureAsset}
                    alt={`ลายเซ็น ${approver.name}`}
                    className="max-h-11 max-w-full object-contain"
                  />
                ) : approver.isSigned ? (
                  <span className="font-cursive text-slate-600 text-sm italic">{approver.name}</span>
                ) : (
                  <span className="text-slate-300 text-xs">- ยังไม่มีการลงนาม -</span>
                )}
              </div>
            </div>

            <div className="text-[10.5px] text-slate-700 border-t border-slate-200 pt-2 text-center space-y-0.5">
              <div className="font-semibold text-slate-900">
                ( {formatSignatoryName(approver)} )
              </div>
              <div className="text-slate-600">
                {formatPosition(approver.position)}
              </div>
              <div className="text-slate-500 text-[10px]">
                วันที่: {approver.date || '-'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scoped Print Media Styles */}
      <style>{`
        @media print {
          @page {
            size: landscape;
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
            border: 0 !important;
            box-shadow: none !important;
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
