import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  Upload,
  FileText,
  CheckCircle2,
  ShieldAlert,
  Info,
  Hash,
  Trash2,
  Layers,
  FileCheck2
} from 'lucide-react';
import { getResultStatusLabel } from '../utils/statusLabels';

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB

export const RecordResultModal = ({
  workOrder,
  onClose,
  form,
  setForm,
  error,
  saving,
  onSubmit,
  criteriaOptions = []
}) => {
  const [fileError, setFileError] = useState('');
  const [fileHashPreview, setFileHashPreview] = useState('');
  const [activeTab, setActiveTab] = useState('MAIN'); // 'MAIN' | 'TRACEABILITY'

  if (!workOrder) return null;

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    setFileError('');
    setFileHashPreview('');

    if (!file) {
      setForm({ ...form, certificate_file: null });
      return;
    }

    if (file.size > MAX_PDF_BYTES) {
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

      // Compute client-side SHA-256 for instant verification
      if (window.crypto?.subtle) {
        const fullBytes = await file.arrayBuffer();
        const hashBuf = await window.crypto.subtle.digest('SHA-256', fullBytes);
        const hashHex = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        setFileHashPreview(hashHex);
      }

      setForm({
        ...form,
        certificate_file: file,
        certificate_file_name: file.name
      });
    } catch {
      setFileError('เกิดข้อผิดพลาดในการตรวจสอบไฟล์ กรุณาลองใหม่อีกครั้ง');
    }
  };

  const handleRemoveFile = () => {
    setForm({ ...form, certificate_file: null, certificate_file_name: '' });
    setFileHashPreview('');
    setFileError('');
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700">
                {workOrder.wo_code}
              </span>
              <span className="text-xs text-slate-500 font-medium">({workOrder.asset_code} — {workOrder.asset_name})</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight mt-1">
              บันทึกผลการสอบเทียบและหลักฐานดิจิทัล (Digital Record)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-200 px-6 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('MAIN')}
            className={`py-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'MAIN'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileCheck2 size={16} />
            <span>ผลการตรวจและใบรับรอง</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('TRACEABILITY')}
            className={`py-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'TRACEABILITY'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers size={16} />
            <span>การสอบกลับได้และสภาวะแวดล้อม (ISO/IEC 17025)</span>
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

          {fileError && (
            <div role="alert" className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-semibold flex items-center gap-2">
              <AlertTriangle size={17} className="text-amber-600 shrink-0" />
              <span>{fileError}</span>
            </div>
          )}

          {activeTab === 'MAIN' && (
            <div className="space-y-4">
              {/* Row 1: Execution Date & Result Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    วันที่ทวนสอบ/สอบเทียบจริง <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    aria-label="วันที่ทวนสอบจริง"
                    value={form.performed_at}
                    onChange={(e) => setForm({ ...form, performed_at: e.target.value })}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    ผลการสอบเทียบ <span className="text-rose-600">*</span>
                  </label>
                  <select
                    aria-label="ผลการทวนสอบ"
                    value={form.result_status}
                    onChange={(e) => setForm({ ...form, result_status: e.target.value })}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-bold bg-white focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 shadow-2xs"
                  >
                    <option value="PASS">ผ่านเกณฑ์</option>
                    <option value="FAIL">ไม่ผ่านเกณฑ์ (ระงับใช้ทันที)</option>
                    <option value="INCONCLUSIVE">รอผลตรวจซ้ำ (ระงับใช้จนตรวจซ้ำและปลดระงับ)</option>
                  </select>
                </div>
              </div>

              {(form.result_status === 'FAIL' || form.result_status === 'INCONCLUSIVE') && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-rose-700">
                    <ShieldAlert size={15} />
                    <span>แจ้งเตือนการควบคุมเครื่องมือ (Equipment Hold Policy):</span>
                  </div>
                  <p className="leading-relaxed">
                    เมื่อบันทึกผลเป็น <span className="font-bold">{getResultStatusLabel(form.result_status)}</span> เครื่องมือจะถูกเปลี่ยนสถานะเป็น <span className="font-bold">ระงับใช้</span> โดยอัตโนมัติ เพื่อป้องกันการนำไปใช้ในสายการผลิต จนกว่าผู้อนุมัติระดับ L5+ จะทำการประเมินผลกระทบย้อนหลัง
                    {form.result_status === 'INCONCLUSIVE' && ' ผลรอตรวจซ้ำปิดงานไม่ได้ ผู้ตรวจรับจะส่งกลับให้ตรวจซ้ำและบันทึกผลใหม่ในใบสั่งงานนี้'}
                  </p>
                </div>
              )}

              {/* Row 2: Certificate Number & Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    เลขที่ใบรับรอง (Cert No.) <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    aria-label="เลขที่ใบรับรอง"
                    value={form.certificate_no}
                    onChange={(e) => setForm({ ...form, certificate_no: e.target.value })}
                    placeholder="เช่น CERT-2026-001"
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-600 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    วันที่ออกใบรับรอง
                  </label>
                  <input
                    type="date"
                    aria-label="วันที่ออกใบรับรอง"
                    value={form.certificate_issue_date || ''}
                    onChange={(e) => setForm({ ...form, certificate_issue_date: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    วันที่หมดอายุใบรับรอง
                  </label>
                  <input
                    type="date"
                    aria-label="วันที่หมดอายุใบรับรอง"
                    value={form.certificate_valid_until || ''}
                    onChange={(e) => setForm({ ...form, certificate_valid_until: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600 shadow-2xs"
                  />
                </div>
              </div>

              {/* Row 3: Acceptance Criteria */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  เกณฑ์ยอมรับที่ใช้ตรวจเทียบ (Acceptance Criteria) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  aria-label="เกณฑ์ยอมรับ"
                  value={form.acceptance_criteria}
                  onChange={(e) => setForm({ ...form, acceptance_criteria: e.target.value })}
                  placeholder="เช่น ± 0.5 °C หรือเลือกจากรายการที่กำหนด"
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600 shadow-2xs"
                />
                {criteriaOptions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {criteriaOptions.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setForm({ ...form, acceptance_criteria: c })}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer transition-colors"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Digital PDF Upload Area */}
              <div className="p-4 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText size={18} className="text-indigo-600" />
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                      แนบไฟล์ใบรับรองดิจิทัล (Digital PDF Attachment)
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">PDF สูงสุด 25 MB</span>
                </div>

                {!form.certificate_file && !workOrder.certificate_file_name && (
                  <label className="flex flex-col items-center justify-center p-4 border border-slate-200 rounded-xl bg-white hover:bg-indigo-50/50 cursor-pointer transition-colors group">
                    <Upload size={22} className="text-slate-400 group-hover:text-indigo-600 mb-1.5" />
                    <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-600">
                      คลิกเพื่อเลือกไฟล์ หรือลากไฟล์ PDF มาวางที่นี่
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">ระบบจะตรวจสอบ %PDF- และสร้าง SHA-256 Hash อัตโนมัติ</span>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                      aria-label="อัปโหลดไฟล์ใบรับรอง PDF"
                    />
                  </label>
                )}

                {/* Selected File Card */}
                {form.certificate_file && (
                  <div className="p-3 rounded-xl bg-white border border-indigo-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {form.certificate_file.name}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 shrink-0">
                          ({formatBytes(form.certificate_file.size)})
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

                    {fileHashPreview && (
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 flex items-center gap-1.5 text-[11px] font-mono text-slate-600 break-all">
                        <Hash size={13} className="text-indigo-600 shrink-0" />
                        <span>SHA-256: {fileHashPreview}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Existing certificate in work order */}
                {!form.certificate_file && workOrder.certificate_file_name && (
                  <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={16} className="text-indigo-600 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-slate-900 truncate block">
                            {workOrder.certificate_file_name}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            เวอร์ชันปัจจุบัน: v{workOrder.certificate_version || 1} • {formatBytes(workOrder.certificate_file_size)}
                          </span>
                        </div>
                      </div>
                      <label className="text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:underline cursor-pointer">
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
                    {workOrder.certificate_file_hash && (
                      <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100 text-[11px] font-mono text-slate-500 truncate">
                        Hash: {workOrder.certificate_file_hash}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  หมายเหตุผลการวัดและสภาพเครื่องมือ
                </label>
                <input
                  type="text"
                  value={form.result_remarks || ''}
                  onChange={(e) => setForm({ ...form, result_remarks: e.target.value })}
                  placeholder="บันทึกผลการสังเกต ข้อสังเกต หรือสภาพเครื่องมือ..."
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600 shadow-2xs"
                />
              </div>
            </div>
          )}

          {activeTab === 'TRACEABILITY' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-100 text-xs text-indigo-900 flex items-start gap-2">
                <Info size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                <span>
                  ข้อมูลในส่วนนี้รองรับการตรวจสอบย้อนกลับ (Measurement Traceability) ตามข้อกำหนด ISO 9001 และ ISO/IEC 17025
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    สถาบัน / ห้องปฏิบัติการสอบเทียบ (Provider)
                  </label>
                  <input
                    type="text"
                    value={form.calibration_provider_name || ''}
                    onChange={(e) => setForm({ ...form, calibration_provider_name: e.target.value })}
                    placeholder="เช่น สถาบันมาตรวิทยาแห่งชาติ (NIMT) หรือ Lab ภายนอก"
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    วิธีการ / ระเบียบปฏิบัติการสอบเทียบ (Method)
                  </label>
                  <input
                    type="text"
                    value={form.calibration_method || ''}
                    onChange={(e) => setForm({ ...form, calibration_method: e.target.value })}
                    placeholder="เช่น WI-CAL-01 หรือ ASTM E203"
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600 shadow-2xs"
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
                  placeholder="เช่น Standard Weight Set Class E2 (Cert: REF-NIMT-9988)"
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600 shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  สภาวะแวดล้อมขณะสอบเทียบ (Environmental Conditions)
                </label>
                <input
                  type="text"
                  value={form.environmental_conditions || ''}
                  onChange={(e) => setForm({ ...form, environmental_conditions: e.target.value })}
                  placeholder="เช่น อุณหภูมิ: 23.5 °C ± 1.0 °C, ความชื้น: 52% RH"
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600 shadow-2xs"
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
                    placeholder="เช่น ± 0.015 g (k=2, 95% CL)"
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-mono font-medium focus:outline-none focus:border-indigo-600 shadow-2xs"
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
                    placeholder="เช่น +0.005 g"
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-mono font-medium focus:outline-none focus:border-indigo-600 shadow-2xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              * ข้อมูลจะถูกจัดเก็บเข้าสู่คิวรอตรวจรับ (PENDING_REVIEW)
            </span>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={saving || !form.certificate_no?.trim() || !form.acceptance_criteria?.trim()}
                className="h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs flex items-center gap-2"
              >
                {saving && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />}
                <span>{saving ? 'กำลังส่งข้อมูล...' : 'ส่งผลให้ผู้ตรวจรับพิจารณา'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RecordResultModal;
