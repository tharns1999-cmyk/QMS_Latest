import React, { useRef } from 'react';
import { Printer, Download, X, AlertCircle, ShieldCheck } from 'lucide-react';
import { resolvePlanSignatories } from '../utils/signatoryHelper';
import { getDueDateRuleLabel, resolvePlanCode } from '../utils/planLabels';
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
  const deptName = plan.department_name_th || plan.department || deptCode;
  const docCode = plan.document_code || resolvePlanCode({ dept: deptCode, year: planYear });
  const rev = plan.revision || '01';
  const effectiveDate = plan.effective_date || plan.form_issue_date || '-';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex flex-col items-center justify-start p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto">
      {/* Action Toolbar (Hidden during print) */}
      <div className="w-full max-w-5xl bg-white rounded-xl shadow-lg border border-slate-200 px-4 py-2.5 mb-3 flex items-center justify-between shrink-0 print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">
            เอกสารควบคุม: แผนการทวนสอบและสอบเทียบ {deptName} ประจำปี {buddhistYear}
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
        className="relative w-full max-w-5xl bg-white rounded-xl shadow-xl border border-slate-300 p-6 sm:p-8 text-slate-900 print:shadow-none print:border-0 print:p-0 print:max-w-none print:w-full print:rounded-none overflow-hidden"
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

        {/* 1. Header Section: Corporate Banner & Form Meta Box */}
        <div className="border border-slate-900 grid grid-cols-12 mb-4">
          {/* Logo & Company Title (Col 1-8) */}
          <div className="col-span-8 p-3 border-r border-slate-900 flex flex-col justify-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded border border-slate-400 flex items-center justify-center font-black text-sm tracking-wider text-slate-700 bg-slate-50 shrink-0">
                QMS
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                  บริษัท ควอลิตี้ แมนูแฟคเจอริ่ง ซิสเต็มส์ จำกัด
                </h1>
                <h2 className="text-xs sm:text-sm font-semibold text-slate-700 mt-0.5">
                  แผนการทวนสอบและสอบเทียบเครื่องมือวัดประจำปี {buddhistYear} (ฝ่าย{deptName})
                </h2>
              </div>
            </div>
          </div>

          {/* Controlled Form Details Box (Col 9-12) */}
          <div className="col-span-4 text-[11px] leading-relaxed">
            <div className="border-b border-slate-900 px-2 py-1 flex justify-between">
              <span className="font-semibold text-slate-600">รหัสเอกสาร:</span>
              <span className="font-mono font-bold text-slate-900">{docCode}</span>
            </div>
            <div className="border-b border-slate-900 px-2 py-1 flex justify-between">
              <span className="font-semibold text-slate-600">แก้ไขครั้งที่:</span>
              <span className="font-mono font-bold text-slate-900">Rev.{rev}</span>
            </div>
            <div className="border-b border-slate-900 px-2 py-1 flex justify-between">
              <span className="font-semibold text-slate-600">วันที่มีผลบังคับใช้:</span>
              <span className="font-mono text-slate-900">{effectiveDate}</span>
            </div>
            <div className="px-2 py-1 flex justify-between">
              <span className="font-semibold text-slate-600">แผนก:</span>
              <span className="font-semibold text-slate-900">{deptName} ({deptCode})</span>
            </div>
          </div>
        </div>

        {/* 2. Metadata Sub-strip */}
        <div className="flex items-center justify-between text-xs text-slate-600 mb-3 px-1">
          <div>
            <span className="font-semibold text-slate-700">เกณฑ์วันครบกำหนด: </span>
            <span>{getDueDateRuleLabel(plan.due_date_rule) || 'สิ้นเดือนของรอบที่วางแผน'}</span>
          </div>
          <div>
            <span className="font-semibold text-slate-700">จำนวนเครื่องมือทั้งหมดในแผน: </span>
            <span className="font-bold text-slate-900">{items.length} รายการ</span>
          </div>
        </div>

        {/* 3. Matrix Table (12 Months) */}
        <div className="overflow-x-auto border border-slate-900 mb-4">
          <table className="w-full text-left border-collapse text-[10.5px]">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-900 text-slate-800">
                <th className="py-1.5 px-1 text-center font-bold border-r border-slate-900 w-7">ลำดับ</th>
                <th className="py-1.5 px-2 font-bold border-r border-slate-900 w-24">รหัสเครื่องมือ</th>
                <th className="py-1.5 px-2 font-bold border-r border-slate-900 min-w-32">ชื่อเครื่องมือ</th>
                <th className="py-1.5 px-1.5 font-bold border-r border-slate-900 w-20">ยี่ห้อ/รุ่น</th>
                <th className="py-1.5 px-1.5 font-bold border-r border-slate-900 text-center w-14">ความถี่</th>
                <th className="py-1.5 px-1.5 font-bold border-r border-slate-900 text-center w-16">ผู้ตรวจ</th>
                {MONTH_NAMES_TH.map((m, idx) => (
                  <th
                    key={idx}
                    className="py-1.5 px-0.5 text-center font-bold border-r border-slate-900 last:border-r-0 w-6"
                  >
                    {m}
                  </th>
                ))}
                <th className="py-1.5 px-2 font-bold text-center w-20">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={19} className="py-6 text-center text-slate-400 font-medium">
                    ไม่มีรายการเครื่องมือในแผนฉบับนี้
                  </td>
                </tr>
              ) : (
                items.map((item, index) => {
                  const months = Array.isArray(item.planned_months)
                    ? item.planned_months
                    : (typeof item.planned_months === 'string' ? JSON.parse(item.planned_months || '[]') : []);

                  return (
                    <tr
                      key={item.id || index}
                      className="border-b border-slate-300 last:border-b-0 hover:bg-slate-50/50"
                    >
                      <td className="py-1 px-1 text-center font-mono text-slate-500 border-r border-slate-300">
                        {index + 1}
                      </td>
                      <td className="py-1 px-2 font-mono font-bold text-slate-900 border-r border-slate-300 whitespace-nowrap">
                        {item.asset_code || '-'}
                      </td>
                      <td className="py-1 px-2 font-semibold text-slate-800 border-r border-slate-300">
                        {item.asset_name || item.name || '-'}
                      </td>
                      <td className="py-1 px-1.5 text-slate-600 border-r border-slate-300 text-[10px]">
                        {item.model || item.serial_no ? `${item.model || ''} ${item.serial_no ? `(${item.serial_no})` : ''}` : '-'}
                      </td>
                      <td className="py-1 px-1 text-center text-slate-700 border-r border-slate-300 whitespace-nowrap">
                        {item.frequency_label || 'รายปี'}
                      </td>
                      <td className="py-1 px-1 text-center text-slate-700 border-r border-slate-300 text-[10px] truncate max-w-16">
                        {item.provider_name || item.responsible_label || '-'}
                      </td>

                      {/* 12 Months Checkmarks */}
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((mNum) => {
                        const isPlanned = months.includes(mNum);
                        return (
                          <td
                            key={mNum}
                            className={`py-1 px-0.5 text-center font-bold border-r border-slate-300 last:border-r-0 ${
                              isPlanned ? 'bg-indigo-50/60 font-black text-indigo-900' : 'text-slate-200'
                            }`}
                          >
                            {isPlanned ? '✓' : ''}
                          </td>
                        );
                      })}

                      <td className="py-1 px-2 text-[9.5px] text-slate-500 truncate max-w-20">
                        {item.remarks || '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 4. Signatory Approval Block (3 Columns) */}
        <div className="border border-slate-900 grid grid-cols-3 divide-x divide-slate-900 text-xs">
          {/* Box 1: ผู้จัดทำ (Prepared By) */}
          <div className="p-3 flex flex-col justify-between min-h-32">
            <div>
              <div className="font-bold text-slate-800 border-b border-slate-300 pb-1 mb-2">
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

            <div className="text-[10px] text-slate-600 border-t border-slate-200 pt-1.5 mt-1 space-y-0.5">
              <div><span className="font-semibold text-slate-700">ชื่อ: </span>{preparer.name}</div>
              <div><span className="font-semibold text-slate-700">ตำแหน่ง: </span>{preparer.position}</div>
              <div><span className="font-semibold text-slate-700">วันที่: </span>{preparer.date}</div>
            </div>
          </div>

          {/* Box 2: ผู้ทบทวน (Reviewed By - L4) */}
          <div className="p-3 flex flex-col justify-between min-h-32">
            <div>
              <div className="font-bold text-slate-800 border-b border-slate-300 pb-1 mb-2 flex items-center justify-between">
                <span>ผู้ทบทวน (Reviewed By)</span>
                {reviewer.isSigned && <span className="text-[9px] font-semibold text-emerald-700">ทบทวนแล้ว</span>}
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

            <div className="text-[10px] text-slate-600 border-t border-slate-200 pt-1.5 mt-1 space-y-0.5">
              <div><span className="font-semibold text-slate-700">ชื่อ: </span>{reviewer.name}</div>
              <div><span className="font-semibold text-slate-700">ตำแหน่ง: </span>{reviewer.position}</div>
              <div><span className="font-semibold text-slate-700">วันที่: </span>{reviewer.date}</div>
            </div>
          </div>

          {/* Box 3: ผู้อนุมัติ (Approved By - L5+) */}
          <div className="p-3 flex flex-col justify-between min-h-32">
            <div>
              <div className="font-bold text-slate-800 border-b border-slate-300 pb-1 mb-2 flex items-center justify-between">
                <span>ผู้อนุมัติ (Approved By)</span>
                {approver.isSigned && <span className="text-[9px] font-semibold text-emerald-700">อนุมัติแล้ว</span>}
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

            <div className="text-[10px] text-slate-600 border-t border-slate-200 pt-1.5 mt-1 space-y-0.5">
              <div><span className="font-semibold text-slate-700">ชื่อ: </span>{approver.name}</div>
              <div><span className="font-semibold text-slate-700">ตำแหน่ง: </span>{approver.position}</div>
              <div><span className="font-semibold text-slate-700">วันที่: </span>{approver.date}</div>
            </div>
          </div>
        </div>

        {/* 5. Footer Quality Note */}
        <div className="mt-3 text-[9px] text-slate-400 flex items-center justify-between border-t border-slate-200 pt-1.5 print:mt-2">
          <span>QMS-Portal · Verify and Calibration Center (VCC) · ISO 9001:2015 Clause 7.1.5</span>
          <span>เอกสารควบคุมฉบับอิเล็กทรอนิกส์ พิมพ์เมื่อ {new Date().toLocaleDateString('th-TH')}</span>
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
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default AnnualPlanPrintView;
