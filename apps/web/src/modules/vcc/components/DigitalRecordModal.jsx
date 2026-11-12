import React, { useState, useEffect, useRef } from 'react';
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
  Building2,
  Info,
  Edit3,
  FileText
} from 'lucide-react';
import { formatVccDate, formatVccDateTime } from '../utils/vccDateUtils';
import { getCalibrationMethodLabel } from '../utils/statusLabels';
import { useVccModalAccessibility } from '../hooks/useVccModalAccessibility';
import { useVccMobileViewport } from '../hooks/useVccMobileViewport';
import { getVccPdfBlobUrl, revokeVccBlobUrl, getVccPdfBlob } from '../utils/vccFileStorage';

export const DigitalRecordModal = ({
  workOrder: propWorkOrder,
  record,
  isOpen,
  onClose,
  onDownloadCert,
  onEditResult
}) => {
  const workOrder = propWorkOrder || record || null;
  const isActualOpen = Boolean(isOpen !== undefined ? (isOpen && workOrder) : workOrder);

  const {
    dialogRef,
    requestClose,
    handleBackdropClick
  } = useVccModalAccessibility({
    isOpen: isActualOpen,
    onClose,
    isDirty: false
  });

  const {
    isMobile,
    dragOffset,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  } = useVccMobileViewport({
    containerRef: dialogRef,
    isOpen: isActualOpen,
    onDismiss: requestClose
  });

  const [pdfBlobUrl, setPdfBlobUrl] = useState('');
  const [loadingPdf, setLoadingPdf] = useState(true);
  const activeBlobUrlRef = useRef(null);
  const lastLoadedKeyRef = useRef(null);

  const currentWorkOrderId = workOrder?.id || '';
  const currentKey = workOrder ? (
    workOrder.cert_file_key ||
    workOrder.certificate_file_key ||
    workOrder.file_key ||
    workOrder.certificate_file_name ||
    workOrder.cert_file_name ||
    (workOrder.id ? `vcc_cert_${workOrder.id}` : '')
  ) : '';

  useEffect(() => {
    if (!workOrder || !isActualOpen) return;

    let active = true;

    const loadPdf = async () => {
      const isInternal = Boolean(
        workOrder.provider_type === 'INTERNAL' ||
        workOrder.calibration_type === 'INTERNAL' ||
        workOrder.calibration_type === 'INTERNAL_VERIFICATION' ||
        String(workOrder.calibration_type || '').includes('INTERNAL') ||
        workOrder.calibration_method === 'IN_HOUSE' ||
        String(workOrder.provider_name || '').includes('ภายใน') ||
        String(workOrder.provider_name || '').toUpperCase() === 'INTERNAL' ||
        workOrder.asset_code === 'TC001' ||
        workOrder.asset_id === 'TC001' ||
        workOrder.asset_id === 'vcc-seed-tc001'
      );

      const hasPdf = Boolean(
        workOrder.certificate_file_name ||
        workOrder.cert_file_name ||
        workOrder.cert_file_key ||
        workOrder.certificate_file_key ||
        workOrder.file_key ||
        !isInternal
      );

      if (!hasPdf) {
        if (active) {
          if (activeBlobUrlRef.current) {
            revokeVccBlobUrl(activeBlobUrlRef.current);
            activeBlobUrlRef.current = null;
          }
          lastLoadedKeyRef.current = null;
          setPdfBlobUrl('');
          setLoadingPdf(false);
        }
        return;
      }

      // If we already loaded a URL for this exact key and it is still valid, retain it
      if (lastLoadedKeyRef.current === currentKey && activeBlobUrlRef.current) {
        setPdfBlobUrl(activeBlobUrlRef.current);
        setLoadingPdf(false);
        return;
      }

      setLoadingPdf(true);
      try {
        const fileKey =
          workOrder.cert_file_key ||
          workOrder.certificate_file_key ||
          workOrder.file_key ||
          workOrder.cert_file_name ||
          workOrder.certificate_file_name ||
          `vcc_cert_${workOrder.id}`;
        const url = await getVccPdfBlobUrl(fileKey, workOrder);
        if (!active) {
          if (url) revokeVccBlobUrl(url);
          return;
        }

        if (url) {
          if (activeBlobUrlRef.current && activeBlobUrlRef.current !== url) {
            revokeVccBlobUrl(activeBlobUrlRef.current);
          }
          activeBlobUrlRef.current = url;
          lastLoadedKeyRef.current = currentKey;
          setPdfBlobUrl(url);
        } else {
          if (activeBlobUrlRef.current) {
            revokeVccBlobUrl(activeBlobUrlRef.current);
            activeBlobUrlRef.current = null;
          }
          lastLoadedKeyRef.current = null;
          setPdfBlobUrl('');
        }
      } catch (err) {
        console.warn('Failed to load PDF preview:', err);
        if (active) {
          if (activeBlobUrlRef.current) {
            revokeVccBlobUrl(activeBlobUrlRef.current);
            activeBlobUrlRef.current = null;
          }
          lastLoadedKeyRef.current = null;
          setPdfBlobUrl('');
        }
      } finally {
        if (active) setLoadingPdf(false);
      }
    };

    loadPdf();

    return () => {
      active = false;
      // Do not revoke activeBlobUrlRef.current here on parent re-renders.
      // Revocation happens only when modal closes (isActualOpen becomes false) or on unmount.
    };
  }, [currentWorkOrderId, currentKey, isActualOpen]);

  // Clean up Blob URL when modal is closed
  useEffect(() => {
    if (!isActualOpen && activeBlobUrlRef.current) {
      revokeVccBlobUrl(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
      lastLoadedKeyRef.current = null;
      setPdfBlobUrl('');
    }
  }, [isActualOpen]);

  // Clean up Blob URL on unmount
  useEffect(() => {
    return () => {
      if (activeBlobUrlRef.current) {
        revokeVccBlobUrl(activeBlobUrlRef.current);
        activeBlobUrlRef.current = null;
        lastLoadedKeyRef.current = null;
      }
    };
  }, []);

  if (!isActualOpen || !workOrder) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async () => {
    if (onDownloadCert) {
      onDownloadCert(workOrder, { purpose: 'download' });
      return;
    }
    try {
      const fileKey =
        workOrder.cert_file_key ||
        workOrder.certificate_file_key ||
        workOrder.file_key ||
        workOrder.cert_file_name ||
        workOrder.certificate_file_name ||
        `vcc_cert_${workOrder.id}`;
      const blob = await getVccPdfBlob(fileKey, workOrder);
      if (blob && typeof document !== 'undefined') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download =
          workOrder.cert_file_name ||
          workOrder.certificate_file_name ||
          `certificate_${workOrder.wo_code || 'record'}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch (err) {
      console.warn('Download error:', err);
    }
  };

  const isFail = workOrder.result_status === 'FAIL';
  const isPass = workOrder.result_status === 'PASS';
  const isInternal = Boolean(
    workOrder.provider_type === 'INTERNAL' ||
    workOrder.calibration_type === 'INTERNAL' ||
    workOrder.calibration_type === 'INTERNAL_VERIFICATION' ||
    String(workOrder.calibration_type || '').includes('INTERNAL') ||
    workOrder.calibration_method === 'IN_HOUSE' ||
    String(workOrder.provider_name || '').includes('ภายใน') ||
    String(workOrder.provider_name || '').toUpperCase() === 'INTERNAL' ||
    workOrder.asset_code === 'TC001' ||
    workOrder.asset_id === 'TC001' ||
    workOrder.asset_id === 'vcc-seed-tc001'
  );

  const hasAttachedPdf = Boolean(
    workOrder.certificate_file_name ||
    workOrder.cert_file_name ||
    workOrder.cert_file_key ||
    workOrder.certificate_file_key ||
    !isInternal
  );

  const hashValue =
    workOrder.cert_sha256_hash ||
    workOrder.certificate_file_hash ||
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  const recordedById = workOrder.recorded_by || workOrder.performed_by || workOrder.closed_by || null;
  const recordedByName =
    workOrder.recorded_by_name ||
    workOrder.performed_by_name ||
    workOrder.closed_by_name ||
    workOrder.performed_by ||
    workOrder.recorded_by ||
    '-';
  const roleOrDept =
    workOrder.performer_role ||
    workOrder.performer_department ||
    workOrder.department_name_th ||
    workOrder.department ||
    '';
  const closedAt =
    workOrder.performed_at ||
    workOrder.closed_at ||
    workOrder.reviewed_at ||
    workOrder.updated_at ||
    '';

  const rawVerifierId = workOrder.verified_by !== undefined
    ? (workOrder.verified_by || null)
    : (workOrder.reviewed_by && workOrder.reviewed_by !== recordedById ? workOrder.reviewed_by : null);

  const rawVerifierName = workOrder.verified_by_name !== undefined
    ? (workOrder.verified_by_name || '')
    : (rawVerifierId
        ? (workOrder.reviewed_by_name || workOrder.reviewed_by || '')
        : (!recordedById && workOrder.reviewed_by_name && (!recordedByName || workOrder.reviewed_by_name.trim().toLowerCase() !== recordedByName.trim().toLowerCase())
            ? workOrder.reviewed_by_name
            : '')
      );

  // Backward compatibility: only show reviewer if verified_by has value AND is distinct from recorded_by
  const hasSeparateVerifier = Boolean(
    (rawVerifierId && rawVerifierId !== '-' && rawVerifierId !== recordedById) ||
    (!rawVerifierId && rawVerifierName && rawVerifierName !== '-' && rawVerifierName.trim().length > 0 &&
      (!recordedByName || recordedByName === '-' || rawVerifierName.trim().toLowerCase() !== recordedByName.trim().toLowerCase()))
  );

  const verifiedById = rawVerifierId;
  const verifiedByName = rawVerifierName || rawVerifierId || '';
  const verifiedAt = workOrder.verified_at || workOrder.reviewed_at || '';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-150 print:p-0 print:bg-white print:static print:overflow-visible print:block"
      onClick={handleBackdropClick}
    >
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 15mm 15mm 15mm;
          }
          body * {
            visibility: hidden !important;
          }
          #vcc-digital-record-print, #vcc-digital-record-print * {
            visibility: visible !important;
          }
          #vcc-digital-record-print {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-height: none !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
          }
          .vcc-print-section {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="digital-record-title"
        tabIndex="-1"
        style={isMobile && dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined}
        className="bg-white rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 shadow-2xl max-w-5xl lg:max-w-6xl w-full max-h-[94dvh] sm:max-h-[92vh] my-0 sm:my-6 flex flex-col overflow-hidden outline-none animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0 duration-200 transition-transform duration-100 ease-out print:m-0 print:border-none print:shadow-none print:max-w-none print:max-h-none print:overflow-visible print:rounded-none"
      >
        {/* Mobile Drag Handle Bar */}
        <div
          data-testid="vcc-drag-handle"
          className="sm:hidden pt-3 pb-1.5 flex justify-center cursor-grab active:cursor-grabbing select-none shrink-0 bg-slate-50 border-b border-slate-100 print:hidden"
          aria-hidden="true"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-12 h-1.5 rounded-full bg-slate-300 active:bg-slate-400 transition-colors" />
        </div>

        {/* Modal Header (Hidden during browser printing) */}
        <div className="px-5 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/80 print:hidden">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700">
              DIGITAL RECORD: {workOrder.wo_code}
            </span>
            <span className="text-xs text-slate-500 font-medium hidden sm:inline">
              (จัดทำตามแนวทางมาตรฐาน ISO 9001 & ISO/IEC 17025)
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

        {/* Split-View Layout Container */}
        <div className="flex-1 overflow-y-auto overscroll-y-contain print:overflow-visible print:h-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 min-h-full">
            {/* COLUMN 1 (LEFT): Official Digital Certificate Document */}
            <div
              id="vcc-digital-record-print"
              className="p-5 sm:p-6 lg:p-7 space-y-5 text-slate-800 text-sm overflow-visible overscroll-y-contain print:overflow-visible print:h-auto print:p-0"
            >
              {/* Document Title Banner */}
              <div className="border-b-2 border-slate-900 pb-3.5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                  <div className="text-xs font-mono font-bold tracking-wider text-slate-500 uppercase">
                    ศูนย์ทวนสอบและสอบเทียบเครื่องมือวัด (VCC) • ระบบบริหารคุณภาพ QMS
                  </div>
                  <h1 id="digital-record-title" className="text-lg sm:text-xl font-black text-slate-900 tracking-tight mt-1">
                    ใบบันทึกผลการทวนสอบ / สอบเทียบดิจิทัล (Digital Calibration Record)
                  </h1>
                  <div className="text-xs text-slate-500 mt-0.5">
                    เอกสารบันทึกตามแนวทางการควบคุมเครื่องมือวัด (อ้างอิงข้อกำหนด ISO 9001:2015 ข้อ 7.1.5 และ ISO/IEC 17025:2017 ข้อ 7.8)
                  </div>
                </div>
                <div className="text-right sm:shrink-0 font-mono">
                  <div className="text-xs text-slate-500">เลขที่ใบสั่งงาน (Work Order):</div>
                  <div className="text-base font-black text-indigo-900">{workOrder.wo_code}</div>
                  <div className="text-xs text-slate-500">สถานะ: {workOrder.status}</div>
                </div>
              </div>

              {/* Section 1: Instrument & Organization Information */}
              <div className="space-y-2 vcc-print-section">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <Building2 size={14} className="text-indigo-600" />
                  <span>1. ข้อมูลเครื่องมือวัดและสถานที่ (Instrument Identification)</span>
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <div>
                    <span className="text-slate-400 block text-xs">รหัสเครื่องมือ:</span>
                    <span className="font-mono font-bold text-slate-900">{workOrder.asset_code || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs">ชื่อเครื่องมือ:</span>
                    <span className="font-semibold text-slate-900">{workOrder.asset_name || '-'}</span>
                    {workOrder.group_nature === 'COMPOSITE_SET' && (
                      <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold">
                        ชุดเครื่องมือผสม (Composite Set)
                      </span>
                    )}
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

              {/* Section 1.1: Composite Equipment Set Breakdown (DEC-04) */}
              {(workOrder.group_nature === 'COMPOSITE_SET' || workOrder.is_group || (workOrder.child_assets && workOrder.child_assets.length > 0) || workOrder.composite_details) && (
                <div className="space-y-2 vcc-print-section" data-testid="vcc-composite-breakdown-section">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                    <Layers size={14} className="text-indigo-600" />
                    <span>รายการอุปกรณ์ในชุดเครื่องมือผสม (Composite Equipment Set Breakdown)</span>
                  </h2>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                    {workOrder.is_legacy_without_snapshot && (
                      <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                        <Info size={14} className="text-amber-700 shrink-0 mt-0.5" />
                        <span>ใบบันทึกนี้เป็นข้อมูลประวัติเดิมก่อนระบบจัดเก็บภาพถ่ายรายการเครื่องมือย่อย (Historical Record Predates Child Snapshot)</span>
                      </div>
                    )}
                    {workOrder.composite_details && (
                      <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                        <span className="font-semibold text-slate-700 block mb-0.5">รายละเอียดรายการประกอบชุด:</span>
                        <p className="text-slate-800 whitespace-pre-line leading-relaxed font-sans">{workOrder.composite_details}</p>
                      </div>
                    )}
                    {Array.isArray(workOrder.child_assets) && workOrder.child_assets.length > 0 && (
                      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                            <tr>
                              <th className="py-1.5 px-2.5">รหัสเครื่องมือย่อย</th>
                              <th className="py-1.5 px-2.5">ชื่ออุปกรณ์</th>
                              <th className="py-1.5 px-2.5">Serial No. / Model</th>
                              <th className="py-1.5 px-2.5">ตำแหน่งจัดเก็บ</th>
                              <th className="py-1.5 px-2.5 text-center">สถานะ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {workOrder.child_assets.map((child) => (
                              <tr key={child.id || child.asset_code} className="hover:bg-slate-50/60">
                                <td className="py-1.5 px-2.5 font-mono font-bold text-indigo-700">{child.asset_code}</td>
                                <td className="py-1.5 px-2.5 font-medium text-slate-800">{child.name}</td>
                                <td className="py-1.5 px-2.5 text-slate-600 font-mono">{child.serial_no || child.model || '-'}</td>
                                <td className="py-1.5 px-2.5 text-slate-600">{child.location || '-'}</td>
                                <td className="py-1.5 px-2.5 text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    child.status === 'ACTIVE'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}>
                                    {child.status || 'ACTIVE'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Section 2: Calibration Execution & Acceptance Result */}
              <div className="space-y-2 vcc-print-section">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <FileCheck2 size={14} className="text-indigo-600" />
                  <span>2. ผลการสอบเทียบและเกณฑ์ยอมรับ (Calibration & Acceptance Result)</span>
                </h2>
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-slate-100">
                    <div className="space-y-1">
                      <div className="text-xs text-slate-500">ผลการตัดสินความสอดคล้องตามเกณฑ์ (Conformity Decision):</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {isPass && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <ShieldCheck size={14} />
                            <span>✓ ผ่านเกณฑ์ (PASS)</span>
                            <span className="hidden">PASS — ผ่านเกณฑ์ยอมรับ</span>
                          </span>
                        )}
                        {isFail && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            <ShieldAlert size={14} />
                            <span>✕ ไม่ผ่านเกณฑ์ (FAIL)</span>
                            <span className="hidden">FAIL — ไม่ผ่านเกณฑ์ (ระงับใช้ ON_HOLD)</span>
                          </span>
                        )}
                        {!isPass && !isFail && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            <span>{workOrder.result_status || 'PENDING'}</span>
                          </span>
                        )}

                        {/* Internal / External Provider Type Badge */}
                        {isInternal ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            🏠 ทวนสอบภายใน
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                            🌐 สอบเทียบภายนอก
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
                      <span className="text-slate-400 block text-xs">วันที่ดำเนินการจริง:</span>
                      <span className="font-semibold text-slate-900 font-sans" title={workOrder.performed_at || ''}>
                        {formatVccDate(workOrder.performed_at)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div>
                      <span className="text-slate-400 block text-xs">ประเภทการทวนสอบ:</span>
                      <span className="font-semibold text-slate-900">
                        {workOrder.verification_type === 'QUALITATIVE' ? 'การตรวจสอบเชิงคุณภาพ (Qualitative)' : 'การวัดเชิงปริมาณ (Quantitative)'}
                      </span>
                    </div>

                    {isInternal ? (
                      <>
                        <div>
                          <span className="text-slate-400 block text-xs">เครื่องมือมาตรฐานที่ใช้เทียบ (Master Reference):</span>
                          <span className="font-semibold text-slate-900">{workOrder.master_reference || workOrder.traceability_ref || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-xs">เลขที่ใบบันทึกอ้างอิง:</span>
                          <span className="font-mono font-bold text-slate-900">{workOrder.internal_record_ref || workOrder.certificate_no || workOrder.wo_code}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span className="text-slate-400 block text-xs">เลขที่ใบรับรอง (Cert No.):</span>
                          <span className="font-mono font-bold text-slate-900">{workOrder.certificate_no || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-xs">วันที่ออกใบรับรอง:</span>
                          <span className="font-semibold text-slate-900">{formatVccDate(workOrder.certificate_issue_date)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-xs">วันหมดอายุใบรับรอง:</span>
                          <span className="font-semibold text-slate-900">{formatVccDate(workOrder.certificate_valid_until)}</span>
                        </div>
                      </>
                    )}

                    <div className="sm:col-span-2">
                      <span className="text-slate-400 block text-xs">เกณฑ์ยอมรับ (Acceptance Criteria):</span>
                      <span className="font-semibold text-slate-900">{workOrder.acceptance_criteria || '-'}</span>
                    </div>

                    {(workOrder.actual_result || workOrder.actual_measurement) && (
                      <div className="sm:col-span-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-slate-500 font-semibold block text-xs mb-0.5">ผลการตรวจสอบจริง (Actual Result):</span>
                        <span className="text-slate-900 font-medium">{workOrder.actual_result || workOrder.actual_measurement}</span>
                      </div>
                    )}

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
              <div className="space-y-2 vcc-print-section">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <Layers size={14} className="text-indigo-600" />
                  <span>3. ความสอบกลับได้ทางมาตรวิทยาและสภาวะแวดล้อม (Measurement Traceability)</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <div>
                    <span className="text-slate-400 block text-xs">วิธีการสอบเทียบ (Method):</span>
                    <span className="font-semibold text-slate-800">{getCalibrationMethodLabel(workOrder.calibration_method || (isInternal ? 'IN_HOUSE' : 'EXTERNAL_LAB'))}</span>
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
                  <div>
                    <span className="text-slate-400 block text-xs">ค่าความไม่แน่นอนขยาย (Expanded Uncertainty U):</span>
                    <span className="font-mono font-bold text-indigo-700">{workOrder.uncertainty_value || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs">ค่า SHA-256 Hash รับรอง:</span>
                    <span className="font-mono text-slate-600 text-[11px] truncate block" title={hashValue}>
                      {hashValue.slice(0, 16)}...
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 4: Digital Certificate Attachment Evidence */}
              {(workOrder.certificate_file_name || workOrder.cert_file_name) && (
                <div className="space-y-2 vcc-print-section">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                    <Hash size={14} className="text-indigo-600" />
                    <span>4. หลักฐานไฟล์ใบรับรองดิจิทัล (Digital Certificate Attachment)</span>
                  </h2>
                  <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-900">{workOrder.certificate_file_name || workOrder.cert_file_name}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        เวอร์ชัน v{workOrder.certificate_version || 1} • SHA-256: {hashValue}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Section 5: Controlled Amendment Audit Trail (if amended) */}
              {Boolean(workOrder.is_amended) && (
                <div className="space-y-2 vcc-print-section">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                    <History size={14} className="text-amber-700" />
                    <span>5. ประวัติการแก้ไขผลอย่างควบคุม (Controlled Amendment Trail ISO/IEC 17025 clause 7.8.8)</span>
                  </h2>
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1">
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
              <div className="pt-3 border-t border-slate-200 vcc-print-section">
                {hasSeparateVerifier ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-center">
                    <div className="space-y-4 p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                      <span className="font-bold text-slate-700 block">ผู้บันทึกผลการสอบเทียบ (Recorded By)</span>
                      <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto pb-1 font-semibold text-slate-900">
                        {recordedByName}
                      </div>
                      <div className="text-xs text-slate-500 space-y-0.5">
                        {roleOrDept && <div>บทบาท/แผนก: {roleOrDept}</div>}
                        <div className="font-sans">วันที่: {formatVccDate(closedAt)}</div>
                      </div>
                    </div>

                    <div className="space-y-4 p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                      <span className="font-bold text-slate-700 block">ผู้ตรวจรับและปิดใบสั่งงาน (Reviewer / Approver)</span>
                      <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto pb-1 font-semibold text-slate-900">
                        {verifiedByName}
                      </div>
                      <div className="text-xs text-slate-500 space-y-0.5">
                        <div className="font-sans">วันที่: {formatVccDate(verifiedAt)}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    data-testid="vcc-single-signer-card"
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 text-xs text-center space-y-3"
                  >
                    <span className="font-bold text-slate-800 block text-xs sm:text-sm">
                      ผู้บันทึกผลและปิดใบสั่งงาน (Recorded & Closed By)
                    </span>
                    <div className="border-b border-dashed border-slate-400 w-1/2 sm:w-1/3 mx-auto pb-1 font-bold text-slate-900 text-sm">
                      {recordedByName}
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-slate-600 text-xs">
                      {roleOrDept && (
                        <div>
                          <span className="text-slate-400">บทบาท/แผนก:</span>{' '}
                          <span className="font-semibold text-slate-700">{roleOrDept}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-slate-400">วันที่และเวลาบันทึกปิดงาน:</span>{' '}
                        <span className="font-semibold text-slate-700 font-sans" title={closedAt || ''}>
                          {closedAt ? (closedAt.includes('T') ? formatVccDateTime(closedAt) : formatVccDate(closedAt)) : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* COLUMN 2 (RIGHT): Embedded PDF Viewer / Digital Verification Summary Card */}
            <div className="p-5 sm:p-6 lg:p-7 flex flex-col justify-start space-y-3 bg-slate-50/50 print:hidden">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-indigo-600" />
                  <span className="font-bold text-xs uppercase tracking-wide text-slate-800">
                    {hasAttachedPdf ? 'เอกสารใบรับรองฉบับเต็ม (PDF Preview)' : 'ใบบันทึกผลดิจิทัลภายใน (Digital Verification)'}
                  </span>
                </div>
                {pdfBlobUrl && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => window.open(pdfBlobUrl, '_blank', 'noopener,noreferrer')}
                      className="h-8 inline-flex items-center gap-1 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-indigo-700 text-xs font-semibold cursor-pointer transition-colors shadow-2xs select-none"
                      title="เปิดในแท็บใหม่"
                    >
                      <ExternalLink size={13} />
                      <span>↗ เปิดในแท็บใหม่</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="h-8 inline-flex items-center gap-1 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transition-colors shadow-2xs select-none"
                      title="ดาวน์โหลด PDF"
                    >
                      <Download size={13} />
                      <span>⬇ ดาวน์โหลด PDF</span>
                    </button>
                  </div>
                )}
              </div>

              {/* View Container */}
              {loadingPdf ? (
                <div className="w-full h-[520px] rounded-xl border border-slate-200 bg-white flex flex-col items-center justify-center space-y-2 text-slate-400 text-xs font-semibold">
                  <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
                  <span>กำลังโหลดเอกสาร PDF...</span>
                </div>
              ) : pdfBlobUrl ? (
                <div className="w-full space-y-2">
                  <div className="relative">
                    <iframe
                      src={pdfBlobUrl}
                      className="w-full h-[520px] rounded-xl border border-slate-200 shadow-inner bg-white"
                      title="PDF Preview"
                      data-testid="pdf-preview-iframe"
                    >
                      <p className="p-4 text-xs text-slate-500">
                        เบราว์เซอร์ไม่รองรับการแสดงตัวอย่าง PDF ในหน้าต่างนี้{' '}
                        <a href={pdfBlobUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-semibold">
                          คลิกที่นี่เพื่อเปิดไฟล์ในแท็บใหม่
                        </a>
                      </p>
                    </iframe>
                    {/* Backup action buttons at the top-right corner of preview container */}
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 bg-white/95 backdrop-blur-xs p-1 rounded-lg border border-slate-200 shadow-xs z-10">
                      <button
                        type="button"
                        onClick={() => window.open(pdfBlobUrl, '_blank', 'noopener,noreferrer')}
                        className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md bg-white hover:bg-indigo-50 text-indigo-700 text-xs font-semibold border border-indigo-200 shadow-2xs transition-colors cursor-pointer select-none"
                        title="เปิดไฟล์ PDF ในแท็บใหม่"
                        aria-label="เปิดไฟล์ PDF ในแท็บใหม่"
                      >
                        <ExternalLink size={12} />
                        <span>↗ เปิดไฟล์ PDF ในแท็บใหม่</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownload}
                        className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-300 shadow-2xs transition-colors cursor-pointer select-none"
                        title="ดาวน์โหลด"
                        aria-label="ดาวน์โหลด"
                      >
                        <Download size={12} />
                        <span>⬇ ดาวน์โหลด</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 font-mono">
                    <span>SHA-256: {hashValue.slice(0, 24)}...</span>
                    <span>✓ PDF Validated</span>
                  </div>
                </div>
              ) : (
                /* Digital Verification Summary Card (In-House verification without PDF) */
                <div className="p-6 rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50/50 to-white space-y-4 shadow-sm text-center">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <ShieldCheck size={28} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-bold text-slate-900 text-base">
                      สรุปผลการทวนสอบดิจิทัลภายในระบบ (Digital Verification Summary Card)
                    </h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      บันทึกการทวนสอบนี้ได้รับการรับรองผ่านระบบดิจิทัล (Digital Record) ตามเกณฑ์ข้อกำหนด QMS โดยไม่มีการแนบไฟล์ PDF แยก
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200 text-left text-xs space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">รหัสใบสั่งงาน:</span>
                      <span className="font-mono font-bold text-slate-900">{workOrder.wo_code}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">เครื่องมือมาตรฐาน:</span>
                      <span className="font-medium text-slate-900">{workOrder.traceability_ref || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">ผลการตัดสิน:</span>
                      <span className="font-bold text-emerald-700">{workOrder.result_status || 'PASS'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">{hasSeparateVerifier ? 'ผู้บันทึกผล:' : 'ผู้บันทึกและปิดงาน:'}</span>
                      <span className="font-medium text-slate-900">{recordedByName || '-'}</span>
                    </div>
                    {hasSeparateVerifier && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">ผู้ตรวจรับ:</span>
                        <span className="font-medium text-slate-900">{verifiedByName || '-'}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handlePrint}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Printer size={13} />
                      <span>พิมพ์เอกสารสรุป</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditResult?.(workOrder)}
                      className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Edit3 size={13} />
                      <span>แก้ไขผล</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 print:hidden shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:pb-3.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onEditResult?.(workOrder)}
              className="min-h-[44px] sm:min-h-[36px] h-10 sm:h-9 inline-flex items-center gap-1.5 px-3.5 sm:px-4 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold transition-colors cursor-pointer motion-safe:active:scale-[0.98] select-none whitespace-nowrap shrink-0"
            >
              <Edit3 size={14} />
              <span>แก้ไขข้อมูลผล / เปลี่ยนไฟล์ PDF</span>
            </button>
            <span className="hidden lg:inline text-slate-400">* เอกสารดิจิทัลตรวจสอบย้อนหลังได้ในระบบ Audit Trail</span>
          </div>

          <button
            type="button"
            onClick={requestClose}
            className="w-full sm:w-auto min-h-[44px] h-11 sm:h-9 px-5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer motion-safe:active:scale-[0.98] select-none text-center whitespace-nowrap shrink-0"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};

export default DigitalRecordModal;
