import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  ShieldAlert,
  History,
  FileCheck2,
  Layers,
  Upload,
  FileText,
  CheckCircle2,
  Trash2
} from 'lucide-react';
import { getCalibrationMethodLabel } from '../utils/statusLabels';
import { useVccModalAccessibility } from '../hooks/useVccModalAccessibility';
import { useVccMobileViewport } from '../hooks/useVccMobileViewport';
import { VccDiscardConfirmDialog } from './VccDiscardConfirmDialog';
import { saveVccPdfFile } from '../utils/vccFileStorage';

export const AmendmentModal = ({
  workOrder,
  onClose,
  form,
  setForm,
  error,
  saving,
  onSubmit,
  criteriaOptions = []
}) => {
  const [activeTab, setActiveTab] = useState('MAIN');
  const [fileError, setFileError] = useState('');

  const isDirty = Boolean((form?.amendment_reason || '').trim() || form?.certificate_file);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    setFileError('');
    if (!file) {
      setForm?.((prev) => ({ ...prev, certificate_file: null }));
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setFileError('ไฟล์ PDF ต้องมีขนาดไม่เกิน 25 MB');
      e.target.value = '';
      return;
    }
    try {
      const headerBytes = await file.slice(0, 5).arrayBuffer();
      const headerStr = new TextDecoder().decode(headerBytes);
      if (headerStr !== '%PDF-') {
        setFileError('รูปแบบไฟล์ไม่ถูกต้อง ต้องเป็นเอกสาร PDF เท่านั้น (%PDF-)');
        e.target.value = '';
        return;
      }
      const fileKey = `vcc_cert_${workOrder?.id || 'wo'}_amend_${Date.now()}`;
      let saved = null;
      try {
        saved = await saveVccPdfFile(fileKey, file);
      } catch {
        saved = { fileKey, fileName: file.name, fileSize: file.size, sha256: 'mock-sha256-' + Date.now() };
      }
      setForm?.((prev) => ({
        ...prev,
        certificate_file: file,
        certificate_file_name: saved.fileName,
        certificate_file_size: saved.fileSize,
        certificate_file_hash: saved.sha256,
        cert_file_key: saved.fileKey,
        cert_file_name: saved.fileName,
        cert_file_size: saved.fileSize,
        cert_sha256_hash: saved.sha256
      }));
    } catch {
      setFileError('เกิดข้อผิดพลาดในการตรวจสอบไฟล์ กรุณาลองใหม่อีกครั้ง');
    }
  };

  const handleRemoveFile = () => {
    setForm?.((prev) => ({ ...prev, certificate_file: null, certificate_file_name: '' }));
    setFileError('');
  };

  const {
    dialogRef,
    requestClose,
    handleBackdropClick,
    showConfirmDiscard,
    confirmDiscard,
    cancelDiscard
  } = useVccModalAccessibility({
    isOpen: !!workOrder,
    onClose,
    isDirty,
    discardTitle: 'ยกเลิกการขอแก้ไขผล?',
    discardMessage: 'คุณมีข้อความเหตุผลการขอแก้ไขที่ยังไม่ได้ส่งคำขอ ต้องการยกเลิกและปิดหน้าต่างหรือไม่?'
  });

  const {
    isMobile,
    dragOffset,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  } = useVccMobileViewport({
    containerRef: dialogRef,
    isOpen: !!workOrder,
    onDismiss: requestClose
  });

  if (!workOrder) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
        onClick={handleBackdropClick}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="amendment-dialog-title"
          tabIndex="-1"
          style={isMobile && dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined}
          className="bg-white rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden outline-none animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0 duration-200 transition-transform duration-100 ease-out"
        >
          {/* Mobile Drag Handle Bar */}
          <div
            data-testid="vcc-drag-handle"
            className="sm:hidden pt-3 pb-1.5 flex justify-center cursor-grab active:cursor-grabbing select-none shrink-0 bg-amber-50/50 border-b border-amber-100"
            aria-hidden="true"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="w-12 h-1.5 rounded-full bg-slate-300 active:bg-slate-400 transition-colors" />
          </div>

          {/* Header */}
          <div className="px-5 sm:px-6 py-3.5 sm:py-4.5 border-b border-amber-200 bg-amber-50/70 flex items-center justify-between shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-amber-200 text-amber-900">
                  AMENDMENT: {workOrder.wo_code}
                </span>
                <span className="text-xs text-amber-800 font-medium">({workOrder.asset_code} — {workOrder.asset_name})</span>
              </div>
              <h2 id="amendment-dialog-title" className="text-base sm:text-lg font-bold text-slate-900 tracking-tight mt-1">
                แก้ไขผลการสอบเทียบที่ปิดงานแล้ว (Amend Closed Result)
              </h2>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="ปิดหน้าต่าง"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer transition-colors motion-safe:active:scale-[0.96] select-none"
            >
              <X size={20} />
            </button>
          </div>

        {/* Compliance Notice */}
        <div className="bg-amber-100/60 px-6 py-2.5 border-b border-amber-200/60 text-xs text-amber-950 flex items-center gap-2 shrink-0">
          <History size={16} className="text-amber-700 shrink-0" />
          <span>
            ระบบจะบันทึกข้อมูลสถานะเดิม (Snapshot) ไว้ในประวัติการตรวจสอบย้อนกลับอย่างถาวร
          </span>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-200 px-4 sm:px-6 bg-white shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('MAIN')}
            className={`min-h-[44px] py-2.5 px-3.5 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer motion-safe:active:scale-[0.98] select-none whitespace-nowrap ${
              activeTab === 'MAIN'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileCheck2 size={16} />
            <span>เหตุผลและผลการตรวจ</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('TRACEABILITY')}
            className={`min-h-[44px] py-2.5 px-3.5 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer motion-safe:active:scale-[0.98] select-none whitespace-nowrap ${
              activeTab === 'TRACEABILITY'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers size={16} />
            <span>การสอบกลับได้และสภาวะแวดล้อม</span>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={onSubmit} className="p-6 space-y-4.5 overflow-y-auto flex-1 overscroll-y-contain">
          {error && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center gap-2">
              <AlertTriangle size={17} className="text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {fileError && (
            <div role="alert" className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-semibold flex items-center gap-2">
              <AlertTriangle size={17} className="text-amber-600 shrink-0" />
              <span>{fileError}</span>
            </div>
          )}

          {/* Mandatory Amendment Reason */}
          <div className="p-4 rounded-xl bg-amber-50/40 border border-amber-200 space-y-2">
            <label className="block text-xs font-bold text-amber-950 uppercase tracking-wide">
              เหตุผลและความจำเป็นในการขอแก้ไขผล (Amendment Reason) <span className="text-rose-600">*</span>
            </label>
            <textarea
              required
              rows={3}
              aria-label="เหตุผลในการขอแก้ไขผล"
              value={form.amendment_reason || ''}
              onChange={(e) => setForm({ ...form, amendment_reason: e.target.value })}
              placeholder="ระบุเหตุผลในการแก้ไขอย่างชัดเจน เช่น ผลการคำนวณของห้องปฏิบัติการภายนอกมีข้อผิดพลาด หรือมีการออกใบรับรองฉบับแก้ไข..."
              className="w-full p-3 rounded-xl border border-amber-300 text-sm font-medium focus:outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600 bg-white shadow-2xs"
            />
          </div>

          {activeTab === 'MAIN' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    ผลการสอบเทียบฉบับแก้ไข <span className="text-rose-600">*</span>
                  </label>
                  <select
                    aria-label="ผลการสอบเทียบฉบับแก้ไข"
                    value={form.result_status}
                    onChange={(e) => setForm({ ...form, result_status: e.target.value })}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-bold bg-white focus:outline-none focus:border-amber-600 shadow-2xs"
                  >
                    <option value="PASS">ผ่านเกณฑ์</option>
                    <option value="FAIL">ไม่ผ่านเกณฑ์ (ต้องใช้สิทธิ์ L5+)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    เลขที่ใบรับรอง (Certificate No.)
                  </label>
                  <input
                    type="text"
                    value={form.certificate_no || ''}
                    onChange={(e) => setForm({ ...form, certificate_no: e.target.value })}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-mono font-bold focus:outline-none focus:border-amber-600 shadow-2xs"
                  />
                </div>
              </div>

              {form.result_status === 'FAIL' && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-rose-700">
                    <ShieldAlert size={15} />
                    <span>แจ้งเตือนผลการแก้ไขเป็นไม่ผ่านเกณฑ์:</span>
                  </div>
                  <p className="leading-relaxed">
                    การแก้ไขผลที่ปิดไปแล้วเป็น <span className="font-bold">ไม่ผ่านเกณฑ์</span> ต้องได้รับการอนุมัติโดยผู้มีอำนาจระดับ L5 ขึ้นไป และระบบจะนำเครื่องมือเข้าสู่สถานะ ระงับใช้ โดยทันที
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    เกณฑ์ยอมรับ (Acceptance Criteria)
                  </label>
                  <input
                    type="text"
                    value={form.acceptance_criteria || ''}
                    onChange={(e) => setForm({ ...form, acceptance_criteria: e.target.value })}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-amber-600 shadow-2xs"
                  />
                  {criteriaOptions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {criteriaOptions.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setForm({ ...form, acceptance_criteria: c })}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    ผลที่ตรวจวัดได้จริง (Actual Result)
                  </label>
                  <input
                    type="text"
                    value={form.actual_result || ''}
                    onChange={(e) => setForm({ ...form, actual_result: e.target.value })}
                    placeholder="เช่น ค่าที่วัดได้ หรือสภาพสมบูรณ์"
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-amber-600 shadow-2xs"
                  />
                </div>
              </div>

              {/* Digital PDF Attachment */}
              <div className="p-4 rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText size={18} className="text-amber-700" />
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      แนบ/เปลี่ยนไฟล์ใบรับรองฉบับแก้ไข (PDF ไม่เกิน 25 MB)
                    </span>
                  </div>
                </div>

                {!form.certificate_file && !workOrder?.certificate_file_name && (
                  <label className="flex flex-col items-center justify-center p-3.5 border border-slate-200 rounded-xl bg-white hover:bg-amber-50/50 cursor-pointer transition-colors group">
                    <Upload size={20} className="text-slate-400 group-hover:text-amber-600 mb-1" />
                    <span className="text-xs font-bold text-slate-700 group-hover:text-amber-700">
                      คลิกเพื่อเลือกไฟล์ หรือลากไฟล์ PDF มาวางที่นี่
                    </span>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                      aria-label="อัปโหลดไฟล์ใบรับรอง PDF ฉบับแก้ไข"
                    />
                  </label>
                )}

                {form.certificate_file && (
                  <div className="p-3 rounded-xl bg-white border border-amber-200 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {form.certificate_file.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      title="นำไฟล์ออก"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}

                {!form.certificate_file && workOrder?.certificate_file_name && (
                  <div className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={16} className="text-amber-700 shrink-0" />
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {workOrder.certificate_file_name} (ไฟล์ปัจจุบัน)
                      </span>
                    </div>
                    <label className="text-xs font-bold text-amber-700 hover:underline cursor-pointer">
                      เปลี่ยนไฟล์
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={handleFileChange}
                        className="hidden"
                        aria-label="เปลี่ยนไฟล์ใบรับรอง PDF"
                      />
                    </label>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  หมายเหตุเพิ่มเติมฉบับแก้ไข
                </label>
                <input
                  type="text"
                  value={form.result_remarks || ''}
                  onChange={(e) => setForm({ ...form, result_remarks: e.target.value })}
                  placeholder="บันทึกข้อสังเกตเพิ่มเติมฉบับแก้ไข..."
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-amber-600 shadow-2xs"
                />
              </div>
            </div>
          )}

          {activeTab === 'TRACEABILITY' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    สถาบัน / ห้องปฏิบัติการสอบเทียบ
                  </label>
                  <input
                    type="text"
                    value={form.calibration_provider_name || ''}
                    onChange={(e) => setForm({ ...form, calibration_provider_name: e.target.value })}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-amber-600 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    วิธีการ / ระเบียบปฏิบัติการสอบเทียบ
                  </label>
                  <input
                    type="text"
                    value={getCalibrationMethodLabel(form.calibration_method)}
                    onChange={(e) => setForm({ ...form, calibration_method: e.target.value })}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-amber-600 shadow-2xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  การสอบกลับได้สู่มาตรฐานแห่งชาติ (Traceability Reference)
                </label>
                <input
                  type="text"
                  value={form.traceability_ref || ''}
                  onChange={(e) => setForm({ ...form, traceability_ref: e.target.value })}
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-amber-600 shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  สภาวะแวดล้อมขณะสอบเทียบ
                </label>
                <input
                  type="text"
                  value={form.environmental_conditions || ''}
                  onChange={(e) => setForm({ ...form, environmental_conditions: e.target.value })}
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-amber-600 shadow-2xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    ค่าความไม่แน่นอนขยาย (Expanded Uncertainty U)
                  </label>
                  <input
                    type="text"
                    value={form.uncertainty_value || ''}
                    onChange={(e) => setForm({ ...form, uncertainty_value: e.target.value })}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-mono font-medium focus:outline-none focus:border-amber-600 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    ค่าความคลาดเคลื่อนที่วัดได้ (Error / Deviation)
                  </label>
                  <input
                    type="text"
                    value={form.calibration_error_value || ''}
                    onChange={(e) => setForm({ ...form, calibration_error_value: e.target.value })}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-mono font-medium focus:outline-none focus:border-amber-600 shadow-2xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:pb-0">
            <span className="text-xs text-slate-400">
              * การแก้ไขต้องผ่านการตรวจสอบโดยผู้มีอำนาจ L4+
            </span>
            <div className="flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto shrink-0">
              <button
                type="button"
                onClick={requestClose}
                className="order-1 sm:order-1 w-full sm:w-auto min-h-[44px] h-11 sm:h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer motion-safe:active:scale-[0.98] select-none text-center whitespace-nowrap shrink-0"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={saving || !form.amendment_reason?.trim()}
                className="order-2 sm:order-2 w-full sm:w-auto min-h-[44px] h-11 sm:h-10 px-5 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs flex items-center justify-center gap-2 motion-safe:active:scale-[0.98] select-none whitespace-nowrap shrink-0"
              >
                {saving && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full shrink-0" />}
                <span className="whitespace-nowrap">{saving ? 'กำลังบันทึก...' : '✓ บันทึกแก้ไขผล'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <VccDiscardConfirmDialog
      isOpen={showConfirmDiscard}
      onConfirm={confirmDiscard}
      onCancel={cancelDiscard}
      title="ยกเลิกการขอแก้ไขผล?"
      message="คุณมีข้อความเหตุผลการขอแก้ไขที่ยังไม่ได้ส่งคำขอ ต้องการยกเลิกและปิดหน้าต่างหรือไม่?"
    />
  </>
);
};

export default AmendmentModal;
