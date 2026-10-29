import React from 'react';
import {
  FileCheck2,
  CalendarClock,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Clock,
  Eye,
  AlertCircle,
  Plus,
  FilterX
} from 'lucide-react';

export const WorkOrderTable = ({
  workOrders = [],
  loading = false,
  error = null,
  activeTab = 'OPEN',
  searchTerm = '',
  filterDept = '',
  thresholds = {},
  onRowClick,
  onRecordResult,
  onReschedule,
  onApprove,
  onReject,
  onReleaseHold,
  onResetFilters,
  onOpenCreate
}) => {
  const reqApproverLevel = thresholds.required_approver_level ?? 5;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-12 text-center space-y-3">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 animate-pulse">
          <Clock size={20} className="animate-spin" />
        </div>
        <div className="text-sm font-semibold text-slate-700">กำลังโหลดข้อมูลใบสั่งงาน...</div>
        <div className="text-xs text-slate-400">กรุณารอสักครู่ ระบบกำลังดึงข้อมูลใบสั่งงานและสถานะล่าสุด</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 shadow-xs p-8 text-center space-y-3">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-rose-50 text-rose-600">
          <AlertCircle size={22} />
        </div>
        <div className="text-sm font-bold text-rose-800">{error}</div>
        <button
          type="button"
          onClick={onResetFilters}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors cursor-pointer"
        >
          <span>ลองใหม่อีกครั้ง</span>
        </button>
      </div>
    );
  }

  if (workOrders.length === 0) {
    const isFiltered = Boolean(searchTerm || filterDept);
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-12 text-center space-y-3">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 text-slate-400">
          <FileCheck2 size={24} />
        </div>
        <div className="font-bold text-slate-800 text-base">
          ไม่พบรายการใบสั่งงานในแท็บ {activeTab}
        </div>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          {isFiltered
            ? 'ไม่มีรายการใบสั่งงานที่ตรงกับคำค้นหาหรือตัวกรองแผนกที่คุณเลือก'
            : 'เลือกแท็บสถานะอื่น หรือกดปุ่ม "สร้างใบสั่งงานใหม่" ด้านบนเพื่อเปิดใบงาน'}
        </p>
        <div className="flex items-center justify-center gap-2 pt-1">
          {isFiltered && (
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <FilterX size={14} />
              <span>ล้างตัวกรอง</span>
            </button>
          )}
          {onOpenCreate && (
            <button
              type="button"
              onClick={onOpenCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors cursor-pointer shadow-2xs"
            >
              <Plus size={14} />
              <span>สร้างใบสั่งงานใหม่</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const getResultBadge = (resultStatus) => {
    if (resultStatus === 'PASS') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 size={12} /> PASS
        </span>
      );
    }
    if (resultStatus === 'FAIL') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <XCircle size={12} /> FAIL
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
        <Clock size={12} /> {resultStatus || 'PENDING'}
      </span>
    );
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'OPEN':
        return <span className="inline-block px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold">OPEN</span>;
      case 'PENDING_REVIEW':
        return <span className="inline-block px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-300 text-xs font-bold">PENDING_REVIEW</span>;
      case 'REJECTED':
        return <span className="inline-block px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">REJECTED</span>;
      case 'CLOSED':
        return <span className="inline-block px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold">CLOSED</span>;
      default:
        return <span className="inline-block px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold">{status}</span>;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-600 text-[11px] sm:text-xs font-bold uppercase tracking-wider select-none">
              <th className="py-3 px-4 min-w-[150px]">เลขที่ใบงาน</th>
              <th className="py-3 px-4 min-w-[210px]">เครื่องมือวัด (รายตัว)</th>
              <th className="py-3 px-4 min-w-[150px]">วันครบกำหนด</th>
              <th className="py-3 px-4 min-w-[240px]">ผลทวนสอบ / ใบรับรอง / เกณฑ์ยอมรับ</th>
              <th className="py-3 px-4 min-w-[140px]">สถานะ / การระงับใช้</th>
              <th className="py-3 px-4 min-w-[170px] text-right">การจัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {workOrders.map((wo) => {
              return (
                <tr
                  key={wo.id}
                  onClick={() => onRowClick && onRowClick(wo)}
                  className="hover:bg-slate-50/90 transition-colors cursor-pointer group"
                >
                  {/* Column 1: เลขที่ใบงาน */}
                  <td className="py-3.5 px-4 align-top">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                        {wo.wo_code}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                      {wo.plan_year ? (
                        <span className="text-slate-600">แผนปี {wo.plan_year} (ด.{wo.planned_month})</span>
                      ) : (
                        <span className="text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200/60 font-medium">
                          นอกแผน (Ad-hoc)
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Column 2: เครื่องมือวัด */}
                  <td className="py-3.5 px-4 align-top">
                    <div className="font-mono font-bold text-indigo-700 text-xs sm:text-sm">
                      {wo.asset_code}
                    </div>
                    <div className="font-semibold text-slate-900 line-clamp-1 mt-0.5" title={wo.asset_name}>
                      {wo.asset_name}
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-semibold">
                        {wo.department}
                      </span>
                      <span>•</span>
                      <span className="truncate max-w-[130px]" title={wo.provider_name}>
                        {wo.provider_name}
                      </span>
                    </div>
                  </td>

                  {/* Column 3: วันครบกำหนด */}
                  <td className="py-3.5 px-4 align-top">
                    <div className="font-mono font-bold text-slate-900">
                      {wo.due_date}
                    </div>
                    {wo.due_date !== wo.original_due_date && (
                      <div className="text-[11px] text-amber-900 bg-amber-50/80 p-1.5 rounded-lg border border-amber-200/70 font-medium mt-1 leading-snug">
                        <div>
                          วันเดิม:{' '}
                          <span className="font-mono line-through text-slate-400">{wo.original_due_date}</span>
                        </div>
                        <div className="truncate max-w-[150px]" title={wo.reschedule_reason}>
                          ({wo.reschedule_reason})
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Column 4: ผลทวนสอบ / ใบรับรอง / เกณฑ์ยอมรับ */}
                  <td className="py-3.5 px-4 align-top space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium">ผล:</span>
                      {getResultBadge(wo.result_status)}
                    </div>

                    {wo.certificate_no && (
                      <div className="text-xs">
                        <span className="text-slate-500 font-medium">ใบรับรอง:</span>{' '}
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded">
                          {wo.certificate_no}
                        </span>
                      </div>
                    )}

                    {wo.acceptance_criteria && (
                      <div className="text-xs text-slate-700 line-clamp-1" title={wo.acceptance_criteria}>
                        <span className="text-slate-500 font-medium">เกณฑ์:</span>{' '}
                        <span className="text-slate-800">{wo.acceptance_criteria}</span>
                      </div>
                    )}

                    {wo.rejected_reason && (
                      <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-medium text-xs">
                        <span className="font-bold">เหตุผลส่งกลับ:</span> {wo.rejected_reason}
                      </div>
                    )}
                  </td>

                  {/* Column 5: สถานะ / NC */}
                  <td className="py-3.5 px-4 align-top space-y-1.5">
                    <div>{getStatusBadge(wo.status)}</div>
                    {wo.nc_status === 'OPEN' && (
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-xs font-bold">
                          <ShieldAlert size={13} />
                          <span>ON_HOLD (ระงับใช้ชั่วคราว)</span>
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Column 6: การจัดการ */}
                  <td className="py-3.5 px-4 align-top text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex flex-wrap justify-end gap-1.5">
                      {(wo.status === 'OPEN' || wo.status === 'REJECTED') && (
                        <>
                          <button
                            type="button"
                            onClick={() => onRecordResult(wo)}
                            className="h-8 inline-flex items-center gap-1 px-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors cursor-pointer text-xs shadow-2xs"
                          >
                            <FileCheck2 size={13} />
                            <span>บันทึกผลและใบรับรอง</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onReschedule(wo)}
                            className="h-8 inline-flex items-center gap-1 px-2.5 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors cursor-pointer text-xs"
                          >
                            <CalendarClock size={13} />
                            <span>เลื่อนวันครบกำหนด</span>
                          </button>
                        </>
                      )}

                      {wo.status === 'PENDING_REVIEW' && (
                        <>
                          <button
                            type="button"
                            onClick={() => onApprove(wo)}
                            className="h-8 inline-flex items-center gap-1 px-2.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors cursor-pointer text-xs shadow-2xs"
                          >
                            <CheckCircle2 size={13} />
                            <span>ตรวจรับปิดงาน</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onReject(wo)}
                            className="h-8 inline-flex items-center gap-1 px-2.5 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 transition-colors cursor-pointer text-xs shadow-2xs"
                          >
                            <XCircle size={13} />
                            <span>ส่งกลับแก้ไข</span>
                          </button>
                        </>
                      )}

                      {wo.nc_status === 'OPEN' && (
                        <button
                          type="button"
                          onClick={() => onReleaseHold(wo)}
                          className="h-8 inline-flex items-center gap-1 px-2.5 rounded-lg bg-purple-700 text-white font-semibold hover:bg-purple-800 transition-colors cursor-pointer text-xs shadow-2xs"
                        >
                          <ShieldAlert size={13} />
                          <span>ปลดระงับ ON_HOLD (L{reqApproverLevel}+)</span>
                        </button>
                      )}

                      {/* View Detail button */}
                      <button
                        type="button"
                        onClick={() => onRowClick && onRowClick(wo)}
                        title="ดูรายละเอียดใบสั่งงาน"
                        aria-label={`ดูรายละเอียดใบสั่งงาน ${wo.wo_code}`}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <Eye size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WorkOrderTable;
