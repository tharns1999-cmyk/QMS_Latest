import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Wrench,
  Calendar,
  FileCheck2,
  CalendarClock,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Clock,
  History,
  AlertTriangle,
  FileText,
  Download,
  ExternalLink,
  Layers,
  Printer,
  Ban
} from 'lucide-react';
import { fetchVccWorkOrderDetail } from '../api/vccWorkOrderApi';
import { WorkOrderAmendmentRequests } from './WorkOrderAmendmentRequests';
import useStore from '../../../store/useStore';
import {
  canReviewWorkOrder,
  canReleaseWorkOrderHold,
  canCancelWorkOrder,
  canApproveReschedule,
  canRequestReschedule,
  canDirectReschedule,
  getReschedulePermissionReason
} from '../utils/workOrderPermissions';
import { WORK_ORDER_STATUS_LABELS, getWorkOrderStatusLabel, getCalibrationMethodLabel } from '../utils/statusLabels';
import { formatVccDueDate, formatVccDate, formatVccDateTime } from '../utils/vccDateUtils';
import { useVccModalAccessibility } from '../hooks/useVccModalAccessibility';
import { useVccMobileViewport } from '../hooks/useVccMobileViewport';

export const WorkOrderSideDrawer = ({
  workOrder,
  onClose,
  thresholds = {},
  onRecordResult,
  onReschedule,
  onReviewReschedule,
  onApprove,
  onReject,
  onReleaseHold,
  onCancel,
  onAmend,
  onDownloadCert,
  onViewDigitalRecord: propOnViewDigitalRecord,
  onViewRecord,
  onAmendmentResolved
}) => {
  const onViewDigitalRecord = propOnViewDigitalRecord || onViewRecord;
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const currentUser = useStore((s) => s.currentUser);

  useEffect(() => {
    if (!workOrder?.id) {
      setDetail(null);
      return;
    }
    let isMounted = true;
    setLoading(true);
    fetchVccWorkOrderDetail(workOrder.id)
      .then((res) => {
        if (isMounted) {
          setDetail(res);
        }
      })
      .catch(() => {
        if (isMounted) {
          // Fall back to prop if fetch fails
          setDetail({ workOrder, history: [], thresholds });
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [workOrder?.id]);

  const {
    dialogRef,
    requestClose
  } = useVccModalAccessibility({
    isOpen: !!workOrder,
    onClose
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
  if (typeof document === 'undefined') return null;

  const currentWo = detail?.workOrder || workOrder;
  const historyList = detail?.history || [];
  const reqApproverLevel = thresholds.required_approver_level ?? 5;

  const getStatusBadge = (status, ncStatus) => {
    if (ncStatus === 'OPEN') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
          <ShieldAlert size={13} />
          <span>{WORK_ORDER_STATUS_LABELS.ON_HOLD}</span>
        </span>
      );
    }
    switch (status) {
      case 'OPEN':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">{WORK_ORDER_STATUS_LABELS.OPEN}</span>;
      case 'PENDING_REVIEW':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">{WORK_ORDER_STATUS_LABELS.PENDING_REVIEW}</span>;
      case 'REJECTED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">{WORK_ORDER_STATUS_LABELS.REJECTED}</span>;
      case 'CLOSED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">{WORK_ORDER_STATUS_LABELS.CLOSED}</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">{getWorkOrderStatusLabel(status)}</span>;
    }
  };

  const getResultBadge = (resultStatus) => {
    if (resultStatus === 'PASS') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle2 size={13} /> ผ่านเกณฑ์
        </span>
      );
    }
    if (resultStatus === 'FAIL') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
          <XCircle size={13} /> ไม่ผ่านเกณฑ์
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
        <Clock size={13} /> รอบันทึกผล
      </span>
    );
  };

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="slide-over-title"
      tabIndex="-1"
      className="fixed inset-0 z-50 overflow-hidden outline-none"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={requestClose}
      />

      <div className="fixed inset-x-0 bottom-0 top-auto sm:inset-y-0 sm:right-0 sm:left-auto flex flex-col justify-end sm:justify-start max-w-full sm:pl-10">
        <div
          className="w-full sm:w-screen max-w-full sm:max-w-xl bg-white shadow-2xl flex flex-col rounded-t-3xl sm:rounded-none border-t sm:border-t-0 sm:border-l border-slate-200 overflow-hidden h-[88dvh] max-h-[92dvh] sm:h-full sm:max-h-full transition-transform duration-100 ease-out"
          style={isMobile && dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined}
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
          <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-mono font-bold text-lg text-slate-900 tracking-tight" id="slide-over-title">
                  {currentWo.wo_code}
                </h2>
                {getStatusBadge(currentWo.status, currentWo.nc_status)}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1 truncate">
                {currentWo.plan_year ? `อิงแผนการทวนสอบประจำปี ${currentWo.plan_year} (เดือน ${currentWo.planned_month})` : 'ใบสั่งงานนอกแผน (Ad-hoc)'}
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {(currentWo.status === 'CLOSED' || currentWo.status === 'SUSPENDED' || currentWo.performed_at) && (
                <button
                  type="button"
                  onClick={() => onViewDigitalRecord?.(currentWo)}
                  className="min-h-[44px] sm:min-h-[36px] sm:h-9 inline-flex items-center gap-1.5 px-3 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 motion-safe:active:scale-[0.98] transition-all cursor-pointer shadow-2xs select-none"
                >
                  <FileText size={15} />
                  <span className="hidden sm:inline">ดูผล / ใบรับรอง</span>
                </button>
              )}

              <button
                type="button"
                onClick={requestClose}
                aria-label="ปิดหน้าต่างรายละเอียดใบสั่งงาน"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 motion-safe:active:bg-slate-300 transition-colors cursor-pointer select-none"
                title="ปิด"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto overscroll-y-contain p-5 space-y-5 text-sm text-slate-700">
            {loading && (
              <div className="text-center py-2 text-xs font-medium text-slate-400">
                กำลังดึงข้อมูลประวัติใบสั่งงานล่าสุด...
              </div>
            )}

            {/* Section 1: เครื่องมือวัด */}
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-3">
              <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                <Wrench size={15} className="text-indigo-600" />
                <span>เครื่องมือวัดและอุปกรณ์</span>
              </h4>

              <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                <div>
                  <span className="text-slate-500 text-xs block">รหัสเครื่องมือ:</span>
                  <span className="font-mono font-bold text-indigo-700">{currentWo.asset_code}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-xs block">ประเภทเครื่องมือ:</span>
                  <span className="font-medium text-slate-800">{currentWo.asset_type || '-'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500 text-xs block">ชื่อเครื่องมือ:</span>
                  <span className="font-semibold text-slate-900">{currentWo.asset_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-xs block">แผนกผู้ดูแล:</span>
                  <span className="font-medium text-slate-800">
                    {currentWo.department} {currentWo.department_name_th ? `(${currentWo.department_name_th})` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-xs block">สถานที่ติดตั้ง/จัดเก็บ:</span>
                  <span className="font-medium text-slate-800">{currentWo.location || '-'}</span>
                </div>
                {currentWo.group_nature === 'COMPOSITE_SET' && (
                  <div className="col-span-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-1.5 text-xs text-teal-900">
                    <span className="font-bold">ชุดเครื่องมือ (Composite Set)</span>
                    {currentWo.composite_details ? ` — ${currentWo.composite_details}` : ''}
                  </div>
                )}
              </div>
            </div>

            {/* Section 2: กำหนดการและผู้ให้บริการ */}
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-3">
              <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                <Calendar size={15} className="text-slate-600" />
                <span>ข้อมูลแผนงานและกำหนดการ</span>
              </h4>

              <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                <div>
                  <span className="text-slate-500 text-xs block">ผู้ให้บริการทวนสอบ:</span>
                  <span className="font-semibold text-slate-900">{currentWo.provider_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-xs block">วันครบกำหนด:</span>
                  <div className="font-semibold text-slate-900 font-sans" title={`ค.ศ. ${currentWo.due_date}`}>
                    <span>{formatVccDueDate(currentWo.due_date)}</span>
                    {currentWo.due_date && (
                      <span className="text-slate-400 font-normal font-mono text-xs ml-1.5">
                        ({currentWo.due_date})
                      </span>
                    )}
                  </div>
                </div>
                {currentWo.reschedule_status === 'REQUESTED' && (
                  <div className="col-span-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-amber-800">
                      <CalendarClock size={14} className="text-amber-700" />
                      <span>มีคำขอเลื่อนวันครบกำหนด (รอการพิจารณาอนุมัติ)</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-slate-700 pt-1">
                      <div>
                        <span className="text-slate-500 block text-[11px]">วันครบกำหนดเดิม:</span>
                        <span className="font-semibold text-slate-900 font-sans">{formatVccDueDate(currentWo.original_due_date || currentWo.due_date)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">วันใหม่ที่เสนอ:</span>
                        <span className="font-bold text-indigo-700 font-sans">{formatVccDueDate(currentWo.proposed_due_date)}</span>
                      </div>
                    </div>
                    <div className="pt-1 border-t border-amber-200/60">
                      <span className="text-slate-500 text-[11px]">เหตุผล: </span>
                      <span className="font-medium text-slate-800">{currentWo.reschedule_reason}</span>
                    </div>
                    {(currentWo.reschedule_requested_by_name || currentWo.reschedule_requested_at) && (
                      <div className="text-[10px] text-slate-500">
                        ยื่นโดย: {currentWo.reschedule_requested_by_name || currentWo.reschedule_requested_by} • {formatVccDateTime(currentWo.reschedule_requested_at)}
                      </div>
                    )}
                  </div>
                )}
                {currentWo.reschedule_status === 'REJECTED' && (
                  <div className="col-span-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
                    <div className="flex items-center gap-1 font-semibold text-rose-800">
                      <XCircle size={13} className="text-rose-600" />
                      <span>คำขอเลื่อนกำหนดถูกปฏิเสธ (คงวันเดิม):</span>
                    </div>
                    <div>เหตุผล: <span className="font-medium">{currentWo.reschedule_rejected_reason || '-'}</span></div>
                    {currentWo.reschedule_approved_by_name && (
                      <div className="text-[10px] text-slate-500">
                        โดย: {currentWo.reschedule_approved_by_name} • {formatVccDateTime(currentWo.reschedule_approved_at)}
                      </div>
                    )}
                  </div>
                )}
                {currentWo.due_date !== currentWo.original_due_date && currentWo.reschedule_status !== 'REQUESTED' && (
                  <div className="col-span-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                    <div className="flex items-center gap-1 font-semibold">
                      <Clock size={12} className="text-amber-700" />
                      <span>มีการเลื่อนวันครบกำหนด (อนุมัติแล้ว):</span>
                    </div>
                    <div>
                      วันเดิม:{' '}
                      <span className="line-through text-slate-400 font-sans" title={`ค.ศ. ${currentWo.original_due_date}`}>
                        {formatVccDueDate(currentWo.original_due_date)}
                      </span>
                      {currentWo.original_due_date && (
                        <span className="text-slate-400 font-mono text-xs ml-1.5">
                          ({currentWo.original_due_date})
                        </span>
                      )}
                    </div>
                    <div>เหตุผล: <span className="font-medium">{currentWo.reschedule_reason}</span></div>
                    {currentWo.reschedule_approved_by_name && (
                      <div className="text-[10px] text-slate-500">
                        อนุมัติโดย: {currentWo.reschedule_approved_by_name} • {formatVccDateTime(currentWo.reschedule_approved_at)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Section 3: ผลการทวนสอบและใบรับรอง */}
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-3">
              <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                <FileCheck2 size={15} className="text-emerald-600" />
                <span>ผลการทวนสอบ / สอบเทียบ</span>
              </h4>

              <div className="space-y-2.5 text-xs sm:text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">ผลการตรวจ:</span>
                  <div>{getResultBadge(currentWo.result_status)}</div>
                </div>

                {currentWo.certificate_no && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">เลขที่ใบรับรอง:</span>
                    <span className="font-mono font-bold text-slate-900">{currentWo.certificate_no}</span>
                  </div>
                )}

                {currentWo.acceptance_criteria && (
                  <div>
                    <span className="text-slate-500 text-xs block mb-0.5">เกณฑ์ยอมรับ (Acceptance Criteria):</span>
                    <span className="font-medium text-slate-800 bg-white p-2 rounded-lg border border-slate-200 block">
                      {currentWo.acceptance_criteria}
                    </span>
                  </div>
                )}

                {currentWo.performed_at && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">วันที่ดำเนินการ:</span>
                    <span className="font-semibold text-slate-800 font-sans" title={`ค.ศ. ${currentWo.performed_at}`}>
                      {formatVccDate(currentWo.performed_at)}
                    </span>
                  </div>
                )}

                {currentWo.result_remarks && (
                  <div>
                    <span className="text-slate-500 text-xs block mb-0.5">บันทึกเพิ่มเติม:</span>
                    <p className="text-xs text-slate-700 bg-white p-2 rounded-lg border border-slate-200">
                      {currentWo.result_remarks}
                    </p>
                  </div>
                )}

                {currentWo.rejected_reason && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1 text-rose-900">
                      <AlertTriangle size={13} className="text-rose-600" />
                      <span>เหตุผลที่ส่งกลับแก้ไขผล:</span>
                    </div>
                    <p className="leading-relaxed font-medium">{currentWo.rejected_reason}</p>
                  </div>
                )}

                {/* Digital Certificate File Attachment Card */}
                {currentWo.certificate_file_name && (
                  <div className="p-3 rounded-xl bg-white border border-indigo-200/90 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={16} className="text-indigo-600 shrink-0" />
                        <div className="min-w-0">
                          <span className="font-bold text-xs text-slate-900 truncate block">
                            {currentWo.certificate_file_name}
                          </span>
                          <span className="text-xs text-slate-500">
                            เวอร์ชัน v{currentWo.certificate_version || 1} {currentWo.certificate_file_size ? `• ${(currentWo.certificate_file_size / 1024).toFixed(1)} KB` : ''}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => onDownloadCert?.(currentWo, { purpose: 'view' })}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-indigo-600 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                          title="เปิดดูไฟล์ในแท็บใหม่"
                        >
                          <ExternalLink size={13} />
                          <span>ดูไฟล์</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDownloadCert?.(currentWo, { purpose: 'download' })}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                          title="ดาวน์โหลดไฟล์ PDF"
                        >
                          <Download size={13} />
                          <span>ดาวน์โหลด</span>
                        </button>
                      </div>
                    </div>
                    {currentWo.certificate_file_hash && (
                      <div className="p-1.5 rounded-md bg-slate-50 border border-slate-100 text-xs font-mono text-slate-500 truncate" title={`SHA-256: ${currentWo.certificate_file_hash}`}>
                        SHA-256: {currentWo.certificate_file_hash}
                      </div>
                    )}
                  </div>
                )}

                {/* Measurement Traceability & Environmental Conditions (ISO/IEC 17025) */}
                {(currentWo.calibration_provider_name || currentWo.calibration_method || currentWo.traceability_ref || currentWo.environmental_conditions || currentWo.uncertainty_value || currentWo.calibration_error_value) && (
                  <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <Layers size={14} className="text-indigo-600" />
                      <span>ข้อมูลการสอบกลับได้และสภาวะแวดล้อม (Traceability)</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {currentWo.calibration_provider_name && (
                        <div>
                          <span className="text-slate-400 block text-xs">สถาบัน/แล็บสอบเทียบ:</span>
                          <span className="font-semibold text-slate-800">{currentWo.calibration_provider_name}</span>
                        </div>
                      )}
                      {currentWo.calibration_method && (
                        <div>
                          <span className="text-slate-400 block text-xs">วิธีการสอบเทียบ:</span>
                          <span className="font-semibold text-slate-800">{getCalibrationMethodLabel(currentWo.calibration_method)}</span>
                        </div>
                      )}
                      {currentWo.traceability_ref && (
                        <div className="sm:col-span-2">
                          <span className="text-slate-400 block text-xs">การสอบกลับได้สู่มาตรฐานแห่งชาติ:</span>
                          <span className="font-mono text-slate-800">{currentWo.traceability_ref}</span>
                        </div>
                      )}
                      {currentWo.environmental_conditions && (
                        <div className="sm:col-span-2">
                          <span className="text-slate-400 block text-xs">สภาวะแวดล้อม (Temp / RH):</span>
                          <span className="text-slate-800">{currentWo.environmental_conditions}</span>
                        </div>
                      )}
                      {currentWo.uncertainty_value && (
                        <div>
                          <span className="text-slate-400 block text-xs">ความไม่แน่นอนขยาย (U):</span>
                          <span className="font-mono font-bold text-indigo-700">{currentWo.uncertainty_value}</span>
                        </div>
                      )}
                      {currentWo.calibration_error_value && (
                        <div>
                          <span className="text-slate-400 block text-xs">ค่าความคลาดเคลื่อน (Error):</span>
                          <span className="font-mono font-bold text-slate-800">{currentWo.calibration_error_value}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Controlled Amendment Banner */}
                {Boolean(currentWo.is_amended) && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1">
                    <div className="font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-amber-900">
                        <History size={14} className="text-amber-700" />
                        <span>ใบสั่งงานนี้ผ่านการแก้ไข (Controlled Amendment)</span>
                      </span>
                      <span className="text-xs text-amber-800 font-sans" title={currentWo.amended_at}>
                        {formatVccDateTime(currentWo.amended_at)}
                      </span>
                    </div>
                    {currentWo.amended_by_name && (
                      <div>แก้ไขโดย: <span className="font-bold">{currentWo.amended_by_name}</span></div>
                    )}
                    {currentWo.amendment_reason && (
                      <div className="bg-white/80 p-2 rounded-lg border border-amber-200/60 mt-1">
                        <span className="font-semibold block text-xs text-amber-900">เหตุผลในการแก้ไข:</span>
                        <span>{currentWo.amendment_reason}</span>
                      </div>
                    )}
                  </div>
                )}

                {currentWo.status === 'CLOSED' && (
                  <WorkOrderAmendmentRequests workOrderId={currentWo.id} onResolved={onAmendmentResolved} />
                )}
              </div>
            </div>

            {/* Section 4: กรณีระงับใช้ (ON_HOLD / NC) */}
            {currentWo.nc_status === 'OPEN' && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-2 text-xs sm:text-sm text-rose-950">
                <div className="font-bold flex items-center gap-2 text-rose-900">
                  <ShieldAlert size={16} className="text-rose-600" />
                  <span>เครื่องมืออยู่ในสถานะระงับใช้</span>
                </div>
                <p className="text-xs text-rose-800 leading-relaxed font-medium">
                  เนื่องจากผลการสอบเทียบไม่ผ่านเกณฑ์ เครื่องมือต้องได้รับการตรวจสอบย้อนหลัง
                  และต้องให้ผู้อนุมัติระดับ L{reqApproverLevel}+ บันทึกการประเมินผลกระทบก่อนปลดระงับการใช้งาน
                </p>
              </div>
            )}

            {/* Section 5: ประวัติการดำเนินงาน (Audit Trail) */}
            <div className="space-y-2.5">
              <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                <History size={15} className="text-slate-600" />
                <span>ประวัติกิจกรรม (Audit Trail)</span>
              </h4>

              {historyList.length === 0 ? (
                <div className="text-xs text-slate-400 p-3 bg-slate-50 rounded-xl border border-slate-200/70 text-center">
                  ไม่มีประวัติกิจกรรมเพิ่มเติม
                </div>
              ) : (
                <div className="space-y-2">
                  {historyList.map((h, idx) => (
                    <div
                      key={h.id || idx}
                      className="p-2.5 rounded-xl border border-slate-200/80 bg-white text-xs space-y-1 shadow-2xs"
                    >
                      <div className="flex items-center justify-between text-slate-500">
                        <span className="font-semibold text-slate-700">{h.action}</span>
                        <span className="text-xs text-slate-500 font-sans" title={h.created_at || ''}>
                          {formatVccDateTime(h.created_at)}
                        </span>
                      </div>
                      <div className="text-slate-600 text-xs">
                        โดย: <span className="font-medium text-slate-800">{h.user_name || h.user_id || 'ระบบ'}</span>
                      </div>
                      {h.details?.reason && (
                        <div className="text-slate-700 text-xs mt-1 bg-slate-50 p-1.5 rounded border border-slate-100">
                          เหตุผล: {h.details.reason}
                        </div>
                      )}
                      {h.details?.comment && (
                        <div className="text-slate-700 text-xs mt-1 bg-slate-50 p-1.5 rounded border border-slate-100">
                          ความเห็น: {h.details.comment}
                        </div>
                      )}
                      {h.details?.assessment && (
                        <div className="text-slate-700 text-xs mt-1 bg-indigo-50 p-1.5 rounded border border-indigo-100 text-indigo-900">
                          การประเมินผลกระทบ: {h.details.assessment}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Drawer Footer Actions */}
          <div className="p-4 sm:p-5 pb-[max(1rem,env(safe-area-inset-bottom,0px))] bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center sm:justify-end gap-2.5 shrink-0">
            {(currentWo.status === 'OPEN' || currentWo.status === 'REJECTED') && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRecordResult(currentWo);
                  }}
                  className="min-h-[44px] sm:min-h-[38px] sm:h-9 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 sm:px-3.5 rounded-xl bg-indigo-600 text-white text-xs sm:text-sm font-semibold hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 focus-visible:outline-none motion-safe:active:scale-[0.98] transition-all cursor-pointer shadow-2xs select-none order-last sm:order-none"
                >
                  <FileCheck2 size={15} />
                  <span>บันทึกผลและใบรับรอง</span>
                </button>
                {currentWo.reschedule_status === 'REQUESTED' ? (
                  canApproveReschedule(currentUser, currentWo) && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        if (onReviewReschedule) onReviewReschedule(currentWo);
                        else onReschedule(currentWo);
                      }}
                      className="min-h-[44px] sm:min-h-[38px] sm:h-9 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 sm:px-3.5 rounded-xl bg-amber-600 text-white text-xs sm:text-sm font-semibold hover:bg-amber-700 focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:outline-none motion-safe:active:scale-[0.98] transition-all cursor-pointer shadow-2xs select-none"
                    >
                      <CalendarClock size={15} />
                      <span>พิจารณาคำขอเลื่อนกำหนด</span>
                    </button>
                  )
                ) : (
                  (() => {
                    const allowed = canRequestReschedule(currentUser, currentWo) || canDirectReschedule(currentUser, currentWo);
                    const reason = !allowed ? getReschedulePermissionReason(currentUser, currentWo) : '';
                    return (
                      <button
                        type="button"
                        disabled={!allowed}
                        title={reason || 'ขอเลื่อนวันครบกำหนด'}
                        onClick={() => {
                          if (!allowed) return;
                          onClose();
                          onReschedule(currentWo);
                        }}
                        className={`min-h-[44px] sm:min-h-[38px] sm:h-9 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 sm:px-3.5 rounded-xl border text-xs sm:text-sm font-semibold focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:outline-none transition-all select-none ${
                          allowed
                            ? 'border-slate-300 text-slate-700 hover:bg-slate-100 motion-safe:active:scale-[0.98] cursor-pointer'
                            : 'border-slate-200 text-slate-400 bg-slate-50 opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <CalendarClock size={15} />
                        <span>ขอเลื่อนวันครบกำหนด</span>
                      </button>
                    );
                  })()
                )}
              </>
            )}

            {currentWo.status === 'PENDING_REVIEW' && !canReviewWorkOrder(currentUser, currentWo, thresholds) && (
              <span className="text-xs font-medium text-slate-500 text-center py-2 sm:py-0">รอผู้ตรวจรับ</span>
            )}

            {currentWo.status === 'PENDING_REVIEW' && canReviewWorkOrder(currentUser, currentWo, thresholds) && (
              <>
                {currentWo.result_status !== 'INCONCLUSIVE' && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onApprove(currentWo);
                    }}
                    className="min-h-[44px] sm:min-h-[38px] sm:h-9 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 sm:px-3.5 rounded-xl bg-emerald-600 text-white text-xs sm:text-sm font-semibold hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:outline-none motion-safe:active:scale-[0.98] transition-all cursor-pointer shadow-2xs select-none order-last sm:order-none"
                  >
                    <CheckCircle2 size={15} />
                    <span>ตรวจรับปิดงาน</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onReject(currentWo);
                  }}
                  className="min-h-[44px] sm:min-h-[38px] sm:h-9 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 sm:px-3.5 rounded-xl bg-rose-600 text-white text-xs sm:text-sm font-semibold hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2 focus-visible:outline-none motion-safe:active:scale-[0.98] transition-all cursor-pointer shadow-2xs select-none"
                >
                  <XCircle size={15} />
                  <span>{currentWo.result_status === 'INCONCLUSIVE' ? 'ส่งกลับตรวจซ้ำ' : 'ส่งกลับแก้ไข'}</span>
                </button>
              </>
            )}

            {canCancelWorkOrder(currentUser, currentWo) && onCancel && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCancel(currentWo);
                }}
                className="min-h-[44px] sm:min-h-[38px] sm:h-9 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 sm:px-3.5 rounded-xl border border-rose-200 text-rose-700 text-xs sm:text-sm font-semibold hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2 focus-visible:outline-none motion-safe:active:scale-[0.98] transition-all cursor-pointer select-none"
              >
                <Ban size={15} />
                <span>ยกเลิกใบสั่งงาน</span>
              </button>
            )}

            {canReleaseWorkOrderHold(currentUser, currentWo, thresholds) && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onReleaseHold(currentWo);
                }}
                className="min-h-[44px] sm:min-h-[38px] sm:h-9 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 sm:px-3.5 rounded-xl bg-indigo-600 text-white text-xs sm:text-sm font-semibold hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 focus-visible:outline-none motion-safe:active:scale-[0.98] transition-all cursor-pointer shadow-2xs select-none order-last sm:order-none"
              >
                <ShieldAlert size={15} />
                <span>ปลดระงับใช้ (L{reqApproverLevel}+)</span>
              </button>
            )}

            {currentWo.status === 'CLOSED' && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onAmend?.(currentWo);
                }}
                className="min-h-[44px] sm:min-h-[38px] sm:h-9 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 sm:px-3.5 rounded-xl bg-amber-600 text-white text-xs sm:text-sm font-semibold hover:bg-amber-700 focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 focus-visible:outline-none motion-safe:active:scale-[0.98] transition-all cursor-pointer shadow-2xs select-none"
              >
                <History size={15} />
                <span>✏️ แก้ไขผลบันทึก</span>
              </button>
            )}

            {(currentWo.status === 'CLOSED' || currentWo.status === 'SUSPENDED' || currentWo.performed_at) && (
              <button
                type="button"
                onClick={() => onViewDigitalRecord?.(currentWo)}
                className="min-h-[44px] sm:min-h-[38px] sm:h-9 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 sm:px-3.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs sm:text-sm font-semibold hover:bg-indigo-100 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 focus-visible:outline-none motion-safe:active:scale-[0.98] transition-all cursor-pointer shadow-2xs select-none"
              >
                <FileText size={15} />
                <span>ดูผล / ใบรับรอง</span>
              </button>
            )}

            <button
              type="button"
              onClick={requestClose}
              className="min-h-[44px] sm:min-h-[38px] sm:h-9 w-full sm:w-auto px-4 rounded-xl border border-slate-300 text-slate-700 text-xs sm:text-sm font-semibold hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:outline-none motion-safe:active:scale-[0.98] transition-all cursor-pointer select-none order-first sm:order-last"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default WorkOrderSideDrawer;
