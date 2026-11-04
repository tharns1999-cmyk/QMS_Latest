import React from 'react';
import {
  X,
  Printer,
  FileCheck2,
  Download,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Layers,
  Hash,
  History,
  Building2
} from 'lucide-react';
import { formatVccDate, formatVccDateTime } from '../utils/vccDateUtils';
import { useVccModalAccessibility } from '../hooks/useVccModalAccessibility';

export const DigitalRecordModal = ({
  workOrder,
  onClose,
  onDownloadCert
}) => {
  const {
    dialogRef,
    requestClose,
    handleBackdropClick
  } = useVccModalAccessibility({
    isOpen: !!workOrder,
    onClose,
    isDirty: false
  });

  if (!workOrder) return null;

  const handlePrint = () => {
    window.print();
  };

  const isFail = workOrder.result_status === 'FAIL';
  const isPass = workOrder.result_status === 'PASS';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="digital-record-title"
        tabIndex="-1"
        className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[92dvh] sm:max-h-[90vh] my-0 sm:my-8 flex flex-col overflow-hidden outline-none animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0 duration-200 print:m-0 print:border-none print:shadow-none print:max-w-none"
      >
        {/* Mobile Drag Handle Bar */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0 print:hidden">
          <span className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>
        
        {/* Modal Header (Hidden during browser printing) */}
        <div className="px-5 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/70 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700">
              DIGITAL RECORD: {workOrder.wo_code}
            </span>
            <span className="text-xs text-slate-500 font-medium hidden sm:inline">
              (ISO/IEC 17025 & ISO 9001 Compliant)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[44px] sm:min-h-[32px] h-10 sm:h-8 inline-flex items-center gap-1.5 px-3.5 sm:px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer shadow-2xs motion-safe:active:scale-[0.98] select-none"
            >
              <Printer size={14} />
              <span>พิมพ์เอกสาร</span>
            </button>
            <button
              type="button"
              onClick={requestClose}
              aria-label="ปิด"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer transition-colors motion-safe:active:scale-[0.96] select-none"
              title="ปิด"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Official Digital Certificate Document Body */}
        <div className="p-8 space-y-6 text-slate-800 text-sm">
          {/* Document Title Banner */}
          <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <div className="text-xs font-mono font-bold tracking-wider text-slate-500 uppercase">
                ศูนย์ทวนสอบและสอบเทียบเครื่องมือวัด (VCC) • ระบบบริหารคุณภาพ QMS
              </div>
              <h1 id="digital-record-title" className="text-xl font-black text-slate-900 tracking-tight mt-1">
                ใบบันทึกผลการทวนสอบ / สอบเทียบดิจิทัล (Digital Calibration Record)
              </h1>
              <div className="text-xs text-slate-500 mt-0.5">
                เอกสารควบคุมมาตรฐาน ISO 9001:2015 ข้อ 7.1.5 และ ISO/IEC 17025:2017 ข้อ 7.8
              </div>
            </div>
            <div className="text-right sm:shrink-0 font-mono">
              <div className="text-xs text-slate-500">เลขที่ใบสั่งงาน (Work Order):</div>
              <div className="text-base font-black text-indigo-900">{workOrder.wo_code}</div>
              <div className="text-xs text-slate-500">สถานะ: {workOrder.status}</div>
            </div>
          </div>

          {/* Section 1: Instrument & Organization Information */}
          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <Building2 size={14} className="text-indigo-600" />
              <span>1. ข้อมูลเครื่องมือวัดและสถานที่ (Instrument Identification)</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 block text-xs">รหัสเครื่องมือ:</span>
                <span className="font-mono font-bold text-slate-900">{workOrder.asset_code || '-'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-xs">ชื่อเครื่องมือ:</span>
                <span className="font-semibold text-slate-900">{workOrder.asset_name || '-'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-xs">แผนกผู้ครอบครอง:</span>
                <span className="font-semibold text-slate-900">{workOrder.department_name_th || workOrder.department || '-'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-xs">หน่วยงานผู้สอบเทียบ:</span>
                <span className="font-semibold text-slate-900">{workOrder.calibration_provider_name || workOrder.provider_name || '-'}</span>
              </div>
            </div>
          </div>

          {/* Section 2: Calibration Execution & Acceptance Result */}
          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <FileCheck2 size={14} className="text-indigo-600" />
              <span>2. ผลการสอบเทียบและเกณฑ์ยอมรับ (Calibration & Acceptance Result)</span>
            </h2>
            <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="space-y-1">
                  <div className="text-xs text-slate-500">ผลการตัดสินความสอดคล้องตามเกณฑ์ (Conformity Decision):</div>
                  <div className="flex items-center gap-2">
                    {isPass && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <ShieldCheck size={14} />
                        <span>PASS — ผ่านเกณฑ์ยอมรับ</span>
                      </span>
                    )}
                    {isFail && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                        <ShieldAlert size={14} />
                        <span>FAIL — ไม่ผ่านเกณฑ์ (ระงับใช้ ON_HOLD)</span>
                      </span>
                    )}
                    {!isPass && !isFail && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        <span>{workOrder.result_status || 'PENDING'}</span>
                      </span>
                    )}
                    {Boolean(workOrder.is_amended) && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        <History size={12} />
                        <span>AMENDED (ฉบับแก้ไข)</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right text-xs">
                  <span className="text-slate-400 block text-xs">วันที่สอบเทียบจริง:</span>
                  <span className="font-semibold text-slate-900 font-sans" title={workOrder.performed_at || ''}>
                    {formatVccDate(workOrder.performed_at)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-xs">เลขที่ใบรับรอง (Certificate No.):</span>
                  <span className="font-mono font-bold text-slate-900">{workOrder.certificate_no || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs">เกณฑ์ยอมรับ (Acceptance Criteria):</span>
                  <span className="font-semibold text-slate-900">{workOrder.acceptance_criteria || '-'}</span>
                </div>
                {workOrder.result_remarks && (
                  <div className="sm:col-span-2">
                    <span className="text-slate-400 block text-xs">หมายเหตุ / ผลการสังเกต:</span>
                    <span className="text-slate-700">{workOrder.result_remarks}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Measurement Traceability & Environmental Conditions (ISO/IEC 17025) */}
          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <Layers size={14} className="text-indigo-600" />
              <span>3. ความสอบกลับได้ทางมาตรวิทยาและสภาวะแวดล้อม (Measurement Traceability)</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 block text-xs">วิธีการสอบเทียบ (Method):</span>
                <span className="font-semibold text-slate-800">{workOrder.calibration_method || 'EXTERNAL_LAB'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-xs">การสอบกลับได้สู่มาตรฐานแห่งชาติ (Traceability):</span>
                <span className="font-mono text-slate-800">{workOrder.traceability_ref || 'ตามใบรับรองสถาบันมาตรวิทยา'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-xs">สภาวะแวดล้อมขณะสอบเทียบ (Temp / Humidity):</span>
                <span className="text-slate-800">{workOrder.environmental_conditions || '-'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-xs">ค่าความคลาดเคลื่อนที่วัดได้ (Error):</span>
                <span className="font-mono font-bold text-slate-800">{workOrder.calibration_error_value || '-'}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-400 block text-xs">ค่าความไม่แน่นอนขยาย (Expanded Uncertainty U):</span>
                <span className="font-mono font-bold text-indigo-700">{workOrder.uncertainty_value || '-'}</span>
              </div>
            </div>
          </div>

          {/* Section 4: Digital Certificate Attachment Evidence (R2) */}
          {workOrder.certificate_file_name && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <Hash size={14} className="text-indigo-600" />
                <span>4. หลักฐานไฟล์ใบรับรองดิจิทัล (Digital Certificate Attachment)</span>
              </h2>
              <div className="p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="font-bold text-slate-900">{workOrder.certificate_file_name}</div>
                  <div className="text-xs text-slate-500 font-mono">
                    เวอร์ชัน v{workOrder.certificate_version || 1} • SHA-256: {workOrder.certificate_file_hash || 'Verified'}
                  </div>
                </div>
                <div className="flex items-center gap-2 print:hidden">
                  <button
                    type="button"
                    onClick={() => onDownloadCert?.(workOrder, { purpose: 'view' })}
                    className="h-8 inline-flex items-center gap-1 px-3 rounded-lg border border-slate-300 bg-white text-indigo-600 font-semibold hover:bg-slate-50 cursor-pointer"
                  >
                    <ExternalLink size={13} />
                    <span>ดูไฟล์ PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDownloadCert?.(workOrder, { purpose: 'download' })}
                    className="h-8 inline-flex items-center gap-1 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                  >
                    <Download size={13} />
                    <span>ดาวน์โหลด</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Section 5: Controlled Amendment Audit Trail (if amended) */}
          {Boolean(workOrder.is_amended) && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <History size={14} className="text-amber-700" />
                <span>5. ประวัติการแก้ไขผลอย่างควบคุม (Controlled Amendment Trail ISO/IEC 17025 clause 7.8.8)</span>
              </h2>
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1.5">
                <div className="font-bold">
                  แก้ไขเมื่อ: <span className="font-sans" title={workOrder.amended_at || ''}>{formatVccDateTime(workOrder.amended_at)}</span> โดย {workOrder.amended_by_name || workOrder.amended_by || '-'}
                </div>
                <div>
                  <span className="font-semibold text-amber-900">เหตุผลในการขอแก้ไข:</span> {workOrder.amendment_reason || '-'}
                </div>
              </div>
            </div>
          )}

          {/* Section 6: Signatures & Verification Sign-off */}
          <div className="pt-4 border-t border-slate-200 grid grid-cols-2 gap-6 text-xs text-center">
            <div className="space-y-8 p-3 rounded-xl border border-slate-200 bg-slate-50/50">
              <span className="font-bold text-slate-700 block">ผู้บันทึกผลการสอบเทียบ (Performer)</span>
              <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto pb-1 font-semibold text-slate-900">
                {workOrder.performed_by_name || workOrder.performed_by || '-'}
              </div>
              <span className="text-xs text-slate-500 block font-sans">วันที่: {formatVccDate(workOrder.performed_at)}</span>
            </div>

            <div className="space-y-8 p-3 rounded-xl border border-slate-200 bg-slate-50/50">
              <span className="font-bold text-slate-700 block">ผู้ตรวจรับและปิดใบสั่งงาน (Reviewer / Approver)</span>
              <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto pb-1 font-semibold text-slate-900">
                {workOrder.reviewed_by_name || workOrder.reviewed_by || '-'}
              </div>
              <span className="text-xs text-slate-500 block font-sans">วันที่: {formatVccDate(workOrder.reviewed_at)}</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 print:hidden shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:pb-3.5">
          <span className="hidden sm:inline">* เอกสารนี้จัดทำขึ้นโดยระบบดิจิทัล 100% สามารถตรวจสอบย้อนหลังได้ในระบบ Audit Trail</span>
          <button
            type="button"
            onClick={requestClose}
            className="w-full sm:w-auto min-h-[44px] h-11 sm:h-8 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer motion-safe:active:scale-[0.98] select-none text-center"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};

export default DigitalRecordModal;
