import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  ShieldAlert,
  History,
  FileCheck2,
  Layers
} from 'lucide-react';
import { useVccModalAccessibility } from '../hooks/useVccModalAccessibility';
import { VccDiscardConfirmDialog } from './VccDiscardConfirmDialog';

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

  const isDirty = Boolean((form?.amendment_reason || '').trim());

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

  if (!workOrder) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
        onClick={handleBackdropClick}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="amendment-dialog-title"
          tabIndex="-1"
          className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden outline-none"
        >
          {/* Header */}
          <div className="px-6 py-4.5 border-b border-amber-200 bg-amber-50/70 flex items-center justify-between shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-amber-200 text-amber-900">
                  AMENDMENT: {workOrder.wo_code}
                </span>
                <span className="text-xs text-amber-800 font-medium">({workOrder.asset_code} — {workOrder.asset_name})</span>
              </div>
              <h2 id="amendment-dialog-title" className="text-lg font-bold text-slate-900 tracking-tight mt-1">
                ขอแก้ไขผลการสอบเทียบที่ปิดงานแล้ว (Controlled Amendment)
              </h2>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="ปิดหน้าต่าง"
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer transition-colors"
            >
              <X size={20} />
            </button>
          </div>

        {/* Compliance Notice */}
        <div className="bg-amber-100/60 px-6 py-2.5 border-b border-amber-200/60 text-xs text-amber-950 flex items-center gap-2 shrink-0">
          <History size={16} className="text-amber-700 shrink-0" />
          <span>
            ตามข้อกำหนด <strong>ISO/IEC 17025 ข้อ 7.8.8</strong> ระบบจะบันทึกภาพถ่ายสถานะเดิม (Snapshot) ไว้ในประวัติการตรวจสอบย้อนกลับอย่างถาวร
          </span>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-200 px-6 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('MAIN')}
            className={`py-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
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
            className={`py-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
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
        <form onSubmit={onSubmit} className="p-6 space-y-4.5 overflow-y-auto flex-1">
          {error && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center gap-2">
              <AlertTriangle size={17} className="text-rose-600 shrink-0" />
              <span>{error}</span>
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
                    value={form.calibration_method || ''}
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
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              * การแก้ไขต้องผ่านการตรวจสอบโดยผู้มีอำนาจ L4+
            </span>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={requestClose}
                className="h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={saving || !form.amendment_reason?.trim()}
                className="h-10 px-5 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs flex items-center gap-2"
              >
                {saving && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />}
                <span>{saving ? 'กำลังบันทึกการแก้ไข...' : 'บันทึกการขอแก้ไข (Amendment)'}</span>
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
