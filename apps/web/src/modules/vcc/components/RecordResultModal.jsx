import React, { useState, useMemo, useRef, useId, useEffect } from 'react';
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
  ChevronDown
} from 'lucide-react';
import { getResultStatusLabel, getCalibrationMethodLabel, CALIBRATION_METHOD_LABELS } from '../utils/statusLabels';
import { formatVccDate } from '../utils/vccDateUtils';
import { useVccModalAccessibility } from '../hooks/useVccModalAccessibility';
import { useVccMobileViewport } from '../hooks/useVccMobileViewport';
import { VccDiscardConfirmDialog } from './VccDiscardConfirmDialog';

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB

const formatMethodLabel = (val) => {
  if (!val) return '';
  return getCalibrationMethodLabel(val);
};

const serializeResultForm = (f) => JSON.stringify({
  performed_at: f?.performed_at || '',
  result_status: f?.result_status || '',
  verification_type: f?.verification_type || 'QUANTITATIVE',
  actual_result: f?.actual_result || '',
  certificate_no: f?.certificate_no || '',
  certificate_issue_date: f?.certificate_issue_date || '',
  certificate_valid_until: f?.certificate_valid_until || '',
  acceptance_criteria: f?.acceptance_criteria || '',
  result_remarks: f?.result_remarks || '',
  calibration_provider_name: f?.calibration_provider_name || '',
  calibration_method: f?.calibration_method || '',
  traceability_ref: f?.traceability_ref || '',
  environmental_conditions: f?.environmental_conditions || '',
  uncertainty_value: f?.uncertainty_value || '',
  calibration_error_value: f?.calibration_error_value || '',
  hasFile: Boolean(f?.certificate_file)
});

export const RecordResultModal = ({
  workOrder,
  onClose,
  onCancelSwitch,
  form,
  setForm,
  error,
  saving,
  onSubmit,
  criteriaOptions = [],
  providers = []
}) => {
  const titleId = useId();
  const [fileError, setFileError] = useState('');
  const [fileHashPreview, setFileHashPreview] = useState('');
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);

  // Active work order being displayed and edited
  const [activeWorkOrder, setActiveWorkOrder] = useState(workOrder);
  const [initialSnapshot, setInitialSnapshot] = useState(() => (workOrder ? serializeResultForm(form) : null));
  const lastHandledPropRef = useRef(workOrder);
  const pendingSwitchWoRef = useRef(undefined);
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);

  const filteredCriteriaOptions = useMemo(() => {
    const assetCode = activeWorkOrder?.asset_code || '';
    const assetType = activeWorkOrder?.asset_type || '';
    const assetName = activeWorkOrder?.asset_name || '';
    const targetStr = `${assetCode} ${assetType} ${assetName}`.toLowerCase();

    const isTherm = targetStr.includes('เทอร์โม') || targetStr.includes('thermo') || targetStr.includes('temp');
    const isScale = targetStr.includes('เครื่องชั่ง') || targetStr.includes('scale') || targetStr.includes('ตุ้มน้ำหนัก') || targetStr.includes('weight');
    const isVernier = targetStr.includes('เวอร์เนียร์') || targetStr.includes('vernier') || targetStr.includes('caliper');

    return (criteriaOptions || []).filter((c) => {
      const text = String(c || '').toLowerCase();
      const hasTemp = text.includes('°c') || text.includes('อุณหภูมิ');
      const hasScale = text.includes(' g') || text.includes('กรัม') || text.includes('เครื่องชั่ง') || text.includes('พิกัด');
      const hasVernier = text.includes('mm') || text.includes('มม') || text.includes('เวอร์เนียร์') || text.includes('คาลิปเปอร์');

      if (isTherm) {
        if (hasScale || hasVernier) return false;
        return true;
      }
      if (isScale) {
        if (hasTemp || hasVernier) return false;
        return true;
      }
      if (isVernier) {
        if (hasTemp || hasScale) return false;
        return true;
      }
      return true;
    });
  }, [criteriaOptions, activeWorkOrder?.asset_type, activeWorkOrder?.asset_name]);

  useEffect(() => {
    if (!form.acceptance_criteria) {
      const initial = activeWorkOrder?.acceptance_criteria || filteredCriteriaOptions[0] || '';
      if (initial) {
        setForm((prev) => ({ ...prev, acceptance_criteria: initial }));
      }
    }
  }, [activeWorkOrder, filteredCriteriaOptions, form.acceptance_criteria, setForm]);

  const isDirty = useMemo(() => {
    if (!activeWorkOrder || !initialSnapshot || saving) return false;
    return serializeResultForm(form) !== initialSnapshot;
  }, [activeWorkOrder, form, initialSnapshot, saving]);

  // Synchronous prop change detection (Parent-driven close or work order switch)
  if (workOrder !== lastHandledPropRef.current) {
    lastHandledPropRef.current = workOrder;
    const incomingId = workOrder?.id ?? null;
    const activeId = activeWorkOrder?.id ?? null;

    if (incomingId !== activeId) {
      if (!isDirty || saving) {
        // Safe to switch immediately without confirmation
        setActiveWorkOrder(workOrder);
        setInitialSnapshot(workOrder ? serializeResultForm(form) : null);
        pendingSwitchWoRef.current = undefined;
      } else {
        // Form is dirty! Guard against unconfirmed data loss
        pendingSwitchWoRef.current = workOrder;
        setShowSwitchConfirm(true);
      }
    }
  }

  const handleConfirmSwitch = () => {
    const targetWo = pendingSwitchWoRef.current;
    pendingSwitchWoRef.current = undefined;
    setShowSwitchConfirm(false);
    setActiveWorkOrder(targetWo);
    setInitialSnapshot(targetWo ? serializeResultForm(form) : null);
    if (!targetWo) {
      onClose?.();
    }
  };

  const handleCancelSwitch = () => {
    pendingSwitchWoRef.current = undefined;
    setShowSwitchConfirm(false);
    onCancelSwitch?.(activeWorkOrder);
  };

  const handleFormSubmit = async (e) => {
    setInitialSnapshot(serializeResultForm(form));
    await onSubmit?.(e);
  };

  const handleRegularClose = () => {
    setActiveWorkOrder(null);
    onClose?.();
  };

  const {
    dialogRef,
    requestClose,
    handleBackdropClick,
    showConfirmDiscard,
    confirmDiscard,
    cancelDiscard
  } = useVccModalAccessibility({
    isOpen: Boolean(activeWorkOrder),
    onClose: handleRegularClose,
    isDirty,
    discardTitle: 'ข้อมูลผลการสอบเทียบยังไม่ได้บันทึก',
    discardMessage: 'คุณมีข้อมูลผลการสอบเทียบที่กำลังบันทึก ต้องการยกเลิกและปิดหน้าต่างใช่หรือไม่?'
  });

  const {
    isMobile,
    dragOffset,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  } = useVccMobileViewport({
    containerRef: dialogRef,
    isOpen: Boolean(activeWorkOrder),
    onDismiss: requestClose,
    isDirty
  });

  if (!activeWorkOrder) return null;

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

  const isFail = form.result_status === 'FAIL';

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
          aria-labelledby={titleId}
          tabIndex="-1"
          style={isMobile && dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined}
          className="bg-white rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden my-0 sm:my-auto outline-none transition-transform duration-100 ease-out"
        >
          {/* Mobile Drag Handle Bar */}
          <div
            data-testid="vcc-drag-handle"
            className="sm:hidden pt-3 pb-1.5 flex justify-center cursor-grab active:cursor-grabbing select-none shrink-0 bg-slate-50 border-b border-slate-100"
            aria-hidden="true"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="w-12 h-1.5 rounded-full bg-slate-300 active:bg-slate-400 transition-colors" />
          </div>

          {/* Header */}
          <div className="px-5 sm:px-6 py-4 sm:py-4.5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/50">
            <div className="pr-2 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700">
                  {activeWorkOrder.wo_code}
                </span>
                <span className="text-xs text-slate-500 font-medium truncate">({activeWorkOrder.asset_code} — {activeWorkOrder.asset_name})</span>
              </div>
              <h2 id={titleId} className="text-base sm:text-lg font-bold text-slate-900 tracking-tight mt-1 truncate">
                บันทึกผลการสอบเทียบและหลักฐานดิจิทัล (Digital Record)
              </h2>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="ปิดหน้าต่าง"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 motion-safe:active:bg-slate-300 transition-colors cursor-pointer select-none shrink-0"
            >
              <X size={20} />
            </button>
          </div>

          {/* Scrollable Form Body */}
          <form onSubmit={handleFormSubmit} className="p-6 space-y-4.5 overflow-y-auto flex-1 overscroll-y-contain">
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

            {/* Row 1: Execution Date & Segmented Pill for Result */}
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
                {form.performed_at && (
                  <span className="text-xs text-slate-500 font-medium mt-1 block">
                    ตรงกับ: {formatVccDate(form.performed_at)}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  ผลการประเมินการสอบเทียบ <span className="text-rose-600">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 h-10" role="group" aria-label="ผลการทวนสอบ">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, result_status: 'PASS' })}
                    className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer select-none flex items-center justify-center gap-1.5 ${
                      form.result_status === 'PASS'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs ring-2 ring-emerald-600/20'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300'
                    }`}
                    aria-pressed={form.result_status === 'PASS'}
                  >
                    <span>✓ ผ่านเกณฑ์ (PASS)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, result_status: 'FAIL' })}
                    className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer select-none flex items-center justify-center gap-1.5 ${
                      form.result_status === 'FAIL'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs ring-2 ring-rose-600/20'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300'
                    }`}
                    aria-pressed={form.result_status === 'FAIL'}
                  >
                    <span>✕ ไม่ผ่านเกณฑ์ (FAIL)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Hold Policy Alert on FAIL */}
            {isFail && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-rose-700">
                  <ShieldAlert size={15} />
                  <span>แจ้งเตือนการควบคุมเครื่องมือ (Equipment Hold Policy):</span>
                </div>
                <p className="leading-relaxed">
                  เมื่อบันทึกผลเป็น <span className="font-bold">ไม่ผ่านเกณฑ์ (FAIL)</span> เครื่องมือจะถูกเปลี่ยนสถานะเป็น <span className="font-bold">ระงับใช้ (SUSPENDED / ON_HOLD)</span> โดยอัตโนมัติ เพื่อป้องกันการนำไปใช้ในสายการผลิต และจำเป็นต้องระบุสาเหตุในช่องหมายเหตุด้านล่าง
                </p>
              </div>
            )}

            {/* Row 2: Acceptance Criteria & Actual Result (2 columns horizontal) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  เกณฑ์ยอมรับ (Acceptance Criteria) <span className="text-rose-600">*</span>
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
                {filteredCriteriaOptions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {filteredCriteriaOptions.map((c) => (
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

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  ผลที่ตรวจวัดได้จริง (Actual Result)
                </label>
                <input
                  type="text"
                  aria-label="ผลการตรวจสอบจริง"
                  value={form.actual_result || ''}
                  onChange={(e) => setForm({ ...form, actual_result: e.target.value })}
                  placeholder="เช่น ค่าที่วัดได้ 100.02 °C (อยู่ในเกณฑ์ ± 0.5 °C) หรือ สภาพสมบูรณ์"
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600 shadow-2xs"
                />
              </div>
            </div>

            {/* Row 3: Certificate Details & PDF Upload */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
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
                {form.certificate_issue_date && (
                  <span className="text-xs text-slate-500 font-medium mt-1 block">
                    ตรงกับ: {formatVccDate(form.certificate_issue_date)}
                  </span>
                )}
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
                {form.certificate_valid_until && (
                  <span className="text-xs text-slate-500 font-medium mt-1 block">
                    ตรงกับ: {formatVccDate(form.certificate_valid_until)}
                  </span>
                )}
              </div>
            </div>

            {/* Digital PDF Upload Box */}
            <div className="p-4 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-indigo-600" />
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                    แนบไฟล์ใบรับรองดิจิทัล (Digital PDF Attachment)
                  </span>
                </div>
                <span className="text-xs font-semibold text-slate-400">PDF สูงสุด 25 MB</span>
              </div>

              {!form.certificate_file && !activeWorkOrder.certificate_file_name && (
                <label className="flex flex-col items-center justify-center p-4 border border-slate-200 rounded-xl bg-white hover:bg-indigo-50/50 cursor-pointer transition-colors group">
                  <Upload size={22} className="text-slate-400 group-hover:text-indigo-600 mb-1.5" />
                  <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-600">
                    คลิกเพื่อเลือกไฟล์ หรือลากไฟล์ PDF มาวางที่นี่
                  </span>
                  <span className="text-xs text-slate-400 mt-0.5">ระบบจะตรวจสอบ %PDF- และสร้าง SHA-256 Hash อัตโนมัติ</span>
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
                      <span className="text-xs font-mono text-slate-400 shrink-0">
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
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 flex items-center gap-1.5 text-xs font-mono text-slate-600 break-all">
                      <Hash size={13} className="text-indigo-600 shrink-0" />
                      <span>SHA-256: {fileHashPreview}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Existing certificate in work order */}
              {!form.certificate_file && activeWorkOrder.certificate_file_name && (
                <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={16} className="text-indigo-600 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-900 truncate block">
                          {activeWorkOrder.certificate_file_name}
                        </span>
                        <span className="text-xs text-slate-500">
                          เวอร์ชันปัจจุบัน: v{activeWorkOrder.certificate_version || 1} • {formatBytes(activeWorkOrder.certificate_file_size)}
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
                  {activeWorkOrder.certificate_file_hash && (
                    <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100 text-xs font-mono text-slate-500 truncate">
                      Hash: {activeWorkOrder.certificate_file_hash}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Remarks (Mandatory if FAIL) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                หมายเหตุผลการวัดและสภาพเครื่องมือ {isFail && <span className="text-rose-600">* (บังคับระบุสาเหตุเมื่อผลไม่ผ่านเกณฑ์)</span>}
              </label>
              <input
                type="text"
                required={isFail}
                aria-label="หมายเหตุผลการวัด"
                value={form.result_remarks || ''}
                onChange={(e) => setForm({ ...form, result_remarks: e.target.value })}
                placeholder={isFail ? 'ระบุสาเหตุที่ไม่ผ่านเกณฑ์และสภาพเครื่องมือที่พบ...' : 'บันทึกผลการสังเกต ข้อสังเกต หรือสภาพเครื่องมือ...'}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600 shadow-2xs"
              />
            </div>

            {/* Collapsible Accordion: Technical & Traceability Information */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
              <button
                type="button"
                onClick={() => setIsAccordionOpen(!isAccordionOpen)}
                className="w-full px-4 py-3 flex items-center justify-between text-left text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer select-none"
                aria-expanded={isAccordionOpen}
                aria-label="ข้อมูลเพิ่มเติมทางเทคนิคและการสอบกลับได้ (ISO/IEC 17025)"
              >
                <div className="flex items-center gap-2">
                  <Layers size={16} className="text-indigo-600" />
                  <span>ข้อมูลเพิ่มเติมทางเทคนิคและการสอบกลับได้ (ISO/IEC 17025)</span>
                </div>
                <ChevronDown
                  size={16}
                  className={`text-slate-400 transition-transform duration-200 ${
                    isAccordionOpen ? 'rotate-180 text-indigo-600' : ''
                  }`}
                />
              </button>

              {isAccordionOpen && (
                <div className="p-4 pt-2 border-t border-slate-200 bg-white space-y-4">
                  <div className="p-3 rounded-lg bg-indigo-50/50 border border-indigo-100 text-xs text-indigo-900 flex items-start gap-2">
                    <Info size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                    <span>
                      ข้อมูลในส่วนนี้รองรับการตรวจสอบย้อนกลับ (Measurement Traceability) ตามข้อกำหนด ISO 9001 และ ISO/IEC 17025
                    </span>
                  </div>

                  {/* Provider & Method */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label htmlFor="record-provider-input" className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                        สถาบัน / ห้องปฏิบัติการสอบเทียบ (Provider)
                      </label>
                      <input
                        id="record-provider-input"
                        aria-label="สถาบัน / ห้องปฏิบัติการสอบเทียบ"
                        type="text"
                        list="vcc-record-providers-list"
                        value={form.calibration_provider_name || ''}
                        onChange={(e) => setForm({ ...form, calibration_provider_name: e.target.value })}
                        placeholder="เช่น สถาบันมาตรวิทยาแห่งชาติ (NIMT) หรือ Lab ภายนอก"
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600 shadow-2xs"
                      />
                      {providers.length > 0 && (
                        <datalist id="vcc-record-providers-list">
                          {providers.map((p) => (
                            <option key={p} value={p} />
                          ))}
                        </datalist>
                      )}
                      {providers.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2" data-testid="record-provider-quick-chips">
                          {providers.map((p) => {
                            const isSelected = form.calibration_provider_name === p;
                            return (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setForm({ ...form, calibration_provider_name: p })}
                                className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors motion-safe:active:scale-[0.98] select-none ${
                                  isSelected
                                    ? 'bg-indigo-100 text-indigo-800 border border-indigo-300 font-bold'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80'
                                }`}
                                aria-label={`เลือกหน่วยงาน ${p}`}
                              >
                                {p}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                        วิธีการ / ระเบียบปฏิบัติการสอบเทียบ (Method)
                      </label>
                      <input
                        type="text"
                        aria-label="วิธีการสอบเทียบ"
                        list="vcc-record-methods-list"
                        value={formatMethodLabel(form.calibration_method)}
                        onChange={(e) => setForm({ ...form, calibration_method: e.target.value })}
                        placeholder="เช่น ห้องปฏิบัติการภายนอก (External Lab) หรือ WI-CAL-01"
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600 shadow-2xs"
                      />
                      <datalist id="vcc-record-methods-list">
                        {Object.values(CALIBRATION_METHOD_LABELS).map((label) => (
                          <option key={label} value={label} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  {/* Traceability Reference */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                      การสอบกลับได้สู่มาตรฐานแห่งชาติ (Traceability Reference)
                    </label>
                    <input
                      type="text"
                      aria-label="การสอบกลับได้สู่มาตรฐานแห่งชาติ"
                      value={form.traceability_ref || ''}
                      onChange={(e) => setForm({ ...form, traceability_ref: e.target.value })}
                      placeholder="เช่น Standard Weight Set Class E2 (Cert: REF-NIMT-9988)"
                      className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600 shadow-2xs"
                    />
                  </div>

                  {/* Environmental Conditions */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                      สภาวะแวดล้อมขณะสอบเทียบ (Environmental Conditions)
                    </label>
                    <input
                      type="text"
                      aria-label="สภาวะแวดล้อมขณะสอบเทียบ"
                      value={form.environmental_conditions || ''}
                      onChange={(e) => setForm({ ...form, environmental_conditions: e.target.value })}
                      placeholder="เช่น อุณหภูมิ: 23.5 °C ± 1.0 °C, ความชื้น: 52% RH"
                      className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600 shadow-2xs"
                    />
                  </div>

                  {/* Expanded Uncertainty & Calibration Error */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                        ค่าความไม่แน่นอนขยาย (Expanded Uncertainty U)
                      </label>
                      <input
                        type="text"
                        aria-label="ค่าความไม่แน่นอนขยาย"
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
                        aria-label="ค่าความคลาดเคลื่อนที่วัดได้"
                        value={form.calibration_error_value || ''}
                        onChange={(e) => setForm({ ...form, calibration_error_value: e.target.value })}
                        placeholder="เช่น +0.005 g"
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-mono font-medium focus:outline-none focus:border-indigo-600 shadow-2xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
              <span className="text-xs text-slate-400 text-center sm:text-left">
                {isFail
                  ? '* ยืนยันผลไม่ผ่านเกณฑ์ จะปิดใบงานและเปลี่ยนสถานะเครื่องมือเป็นระงับใช้ทันที'
                  : '* บันทึกผลแล้วจะปิดใบงานและอัปเดตสถานะเครื่องมือเป็นพร้อมใช้งานทันที'}
              </span>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={requestClose}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-[40px] px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 motion-safe:active:scale-[0.98] transition-all cursor-pointer select-none order-1 sm:order-1"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={
                    saving ||
                    !form.certificate_no?.trim() ||
                    !form.acceptance_criteria?.trim() ||
                    (isFail && !form.result_remarks?.trim())
                  }
                  className={`w-full sm:w-auto min-h-[44px] sm:min-h-[40px] px-5 rounded-xl text-white text-sm font-semibold motion-safe:active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all cursor-pointer shadow-2xs flex items-center justify-center gap-2 select-none order-2 sm:order-2 ${
                    isFail
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {saving && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />}
                  <span>
                    {saving
                      ? 'กำลังบันทึก...'
                      : isFail
                      ? '⚠️ ยืนยันผลไม่ผ่านเกณฑ์และระงับใช้'
                      : '✓ บันทึกผลและปิดใบงาน'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Discard Confirmation Dialog */}
      <VccDiscardConfirmDialog
        isOpen={showConfirmDiscard || showSwitchConfirm}
        onConfirm={showSwitchConfirm ? handleConfirmSwitch : confirmDiscard}
        onCancel={showSwitchConfirm ? handleCancelSwitch : cancelDiscard}
        title="ข้อมูลผลการสอบเทียบยังไม่ได้บันทึก"
        message={
          pendingSwitchWoRef.current
            ? 'คุณมีข้อมูลผลการสอบเทียบที่กำลังจัดทำ ต้องการยกเลิกและเปลี่ยนไปทำใบสั่งงานอื่นใช่หรือไม่?'
            : 'คุณมีข้อมูลผลการสอบเทียบที่กำลังบันทึก ต้องการยกเลิกและปิดหน้าต่างใช่หรือไม่?'
        }
      />
    </>
  );
};

export default RecordResultModal;
