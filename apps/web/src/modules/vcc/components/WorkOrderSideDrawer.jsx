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
  FolderTree
} from 'lucide-react';
import { fetchVccWorkOrderDetail } from '../api/vccWorkOrderApi';

export const WorkOrderSideDrawer = ({
  workOrder,
  onClose,
  thresholds = {},
  onRecordResult,
  onReschedule,
  onApprove,
  onReject,
  onReleaseHold
}) => {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    if (!workOrder) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [workOrder, onClose]);

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
          <span>ON_HOLD (ระงับใช้)</span>
        </span>
      );
    }
    switch (status) {
      case 'OPEN':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">OPEN (เปิดงาน)</span>;
      case 'PENDING_REVIEW':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">PENDING_REVIEW (รอตรวจรับ)</span>;
      case 'REJECTED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">REJECTED (ส่งกลับแก้ไข)</span>;
      case 'CLOSED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">CLOSED (ปิดงานแล้ว)</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">{status}</span>;
    }
  };

  const getResultBadge = (resultStatus) => {
    if (resultStatus === 'PASS') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle2 size={13} /> ผ่านเกณฑ์ (PASS)
        </span>
      );
    }
    if (resultStatus === 'FAIL') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
          <XCircle size={13} /> ไม่ผ่าน (FAIL)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
        <Clock size={13} /> รอบันทึกผล (PENDING)
      </span>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
        <div className="w-screen max-w-xl bg-white shadow-2xl flex flex-col border-l border-slate-200">
          {/* Header */}
          <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-mono font-bold text-lg text-slate-900 tracking-tight" id="slide-over-title">
                  {currentWo.wo_code}
                </h2>
                {getStatusBadge(currentWo.status, currentWo.nc_status)}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">
                {currentWo.plan_year ? `อิงแผนการทวนสอบประจำปี ${currentWo.plan_year} (เดือน ${currentWo.planned_month})` : 'ใบสั่งงานนอกแผน (Ad-hoc)'}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดหน้าต่างรายละเอียดใบสั่งงาน"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
              title="ปิด"
            >
              <X size={20} />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm text-slate-700">
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
                {currentWo.parent_asset_code && (
                  <div className="col-span-2 flex items-center gap-1.5 text-xs text-purple-700 font-medium">
                    <FolderTree size={13} />
                    <span>สังกัดกลุ่มแม่: {currentWo.parent_asset_code}</span>
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
                  <span className="font-mono font-bold text-slate-900">{currentWo.due_date}</span>
                </div>
                {currentWo.due_date !== currentWo.original_due_date && (
                  <div className="col-span-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                    <div className="flex items-center gap-1 font-semibold">
                      <Clock size={12} className="text-amber-700" />
                      <span>มีการเลื่อนวันครบกำหนด:</span>
                    </div>
                    <div>
                      วันเดิม: <span className="font-mono line-through text-slate-400">{currentWo.original_due_date}</span>
                    </div>
                    <div>เหตุผล: <span className="font-medium">{currentWo.reschedule_reason}</span></div>
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
                    <span className="font-mono font-medium text-slate-700">{currentWo.performed_at}</span>
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
              </div>
            </div>

            {/* Section 4: กรณีระงับใช้ (ON_HOLD / NC) */}
            {currentWo.nc_status === 'OPEN' && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-2 text-xs sm:text-sm text-rose-950">
                <div className="font-bold flex items-center gap-2 text-rose-900">
                  <ShieldAlert size={16} className="text-rose-600" />
                  <span>เครื่องมืออยู่ในสถานะระงับใช้ (ON_HOLD)</span>
                </div>
                <p className="text-xs text-rose-800 leading-relaxed font-medium">
                  เนื่องจากผลการสอบเทียบไม่ผ่านเกณฑ์ (FAIL) เครื่องมือต้องได้รับการตรวจสอบย้อนหลัง
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
                        <span className="font-mono text-[11px]">{h.created_at || '-'}</span>
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
                        <div className="text-slate-700 text-xs mt-1 bg-purple-50 p-1.5 rounded border border-purple-100 text-purple-900">
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
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">
            {(currentWo.status === 'OPEN' || currentWo.status === 'REJECTED') && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRecordResult(currentWo);
                  }}
                  className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors cursor-pointer shadow-2xs"
                >
                  <FileCheck2 size={14} />
                  <span>บันทึกผลและใบรับรอง</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onReschedule(currentWo);
                  }}
                  className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <CalendarClock size={14} />
                  <span>เลื่อนวันครบกำหนด</span>
                </button>
              </>
            )}

            {currentWo.status === 'PENDING_REVIEW' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onApprove(currentWo);
                  }}
                  className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors cursor-pointer shadow-2xs"
                >
                  <CheckCircle2 size={14} />
                  <span>ตรวจรับปิดงาน</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onReject(currentWo);
                  }}
                  className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors cursor-pointer shadow-2xs"
                >
                  <XCircle size={14} />
                  <span>ส่งกลับแก้ไข</span>
                </button>
              </>
            )}

            {currentWo.nc_status === 'OPEN' && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onReleaseHold(currentWo);
                }}
                className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-purple-700 text-white text-xs font-semibold hover:bg-purple-800 transition-colors cursor-pointer shadow-2xs"
              >
                <ShieldAlert size={14} />
                <span>ปลดระงับ ON_HOLD (L{reqApproverLevel}+)</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3.5 rounded-xl border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
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
