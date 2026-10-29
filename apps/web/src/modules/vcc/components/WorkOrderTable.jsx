import React, { useState, useEffect, useRef } from 'react';
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
  FilterX,
  MoreHorizontal
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
  const [activeMenuWoId, setActiveMenuWoId] = useState(null);
  const menuRef = useRef(null);

  // Close more menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMenuWoId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const toggleMenu = (woId) => {
    setActiveMenuWoId((prev) => (prev === woId ? null : woId));
  };

  if (loading) {
    return (
      <div className="w-full bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
          <span>กำลังโหลดข้อมูลใบสั่งงาน...</span>
          <div className="flex items-center gap-1.5 text-purple-700 font-semibold">
            <Clock size={14} className="animate-spin" />
            <span>เชื่อมต่อระบบ</span>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {[1, 2, 3].map((n) => (
            <div key={n} className="p-4 flex items-center justify-between gap-4 animate-pulse">
              <div className="space-y-2 w-1/5">
                <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                <div className="h-3 bg-slate-100 rounded w-1/2"></div>
              </div>
              <div className="space-y-2 w-2/5">
                <div className="h-4 bg-slate-200 rounded w-4/5"></div>
                <div className="h-3 bg-slate-100 rounded w-2/3"></div>
              </div>
              <div className="h-4 bg-slate-200 rounded w-1/6"></div>
              <div className="h-8 bg-slate-200 rounded w-28 shrink-0"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full bg-white rounded-xl border border-rose-200 shadow-2xs p-8 text-center space-y-3">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-rose-50 text-rose-600">
          <AlertCircle size={22} />
        </div>
        <div className="text-sm font-bold text-rose-800">{error}</div>
        <button
          type="button"
          onClick={onResetFilters}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 transition-colors cursor-pointer"
        >
          <span>ลองใหม่อีกครั้ง</span>
        </button>
      </div>
    );
  }

  if (workOrders.length === 0) {
    const isFiltered = Boolean(searchTerm || filterDept);
    return (
      <div className="w-full bg-white rounded-xl border border-slate-200 shadow-2xs p-10 text-center space-y-3">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 text-slate-400">
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
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <FilterX size={14} />
              <span>ล้างตัวกรอง</span>
            </button>
          )}
          {onOpenCreate && (
            <button
              type="button"
              onClick={onOpenCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-purple-700 text-white text-xs font-semibold hover:bg-purple-800 transition-colors cursor-pointer shadow-2xs"
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
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 size={12} className="text-emerald-600" />
          <span>PASS</span>
        </span>
      );
    }
    if (resultStatus === 'FAIL') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <XCircle size={12} className="text-rose-600" />
          <span>FAIL</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
        <Clock size={12} />
        <span>{resultStatus || 'PENDING'}</span>
      </span>
    );
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'OPEN':
        return <span className="inline-block px-2.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-xs font-semibold">OPEN</span>;
      case 'PENDING_REVIEW':
        return <span className="inline-block px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-300 text-xs font-semibold">PENDING_REVIEW</span>;
      case 'REJECTED':
        return <span className="inline-block px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold">REJECTED</span>;
      case 'CLOSED':
        return <span className="inline-block px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-semibold">CLOSED</span>;
      default:
        return <span className="inline-block px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold">{status}</span>;
    }
  };

  return (
    <div className="w-full bg-white rounded-xl border border-slate-200 shadow-2xs overflow-x-auto min-h-[300px]" ref={menuRef}>
      <table className="w-full text-left border-collapse min-w-[960px]">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-semibold uppercase tracking-wider select-none">
            <th className="py-3 px-4 w-[16%] min-w-[130px]">เลขที่ใบงาน</th>
            <th className="py-3 px-4 w-[26%] min-w-[210px]">เครื่องมือวัด (รายตัว)</th>
            <th className="py-3 px-4 w-[14%] min-w-[130px]">วันครบกำหนด</th>
            <th className="py-3 px-4 w-[22%] min-w-[190px]">ผลตรวจ / ใบรับรอง / เกณฑ์ยอมรับ</th>
            <th className="py-3 px-4 w-[10%] min-w-[120px]">สถานะงาน</th>
            <th className="py-3 px-4 w-[12%] min-w-[160px] text-right">การจัดการ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {workOrders.map((wo, index) => {
            const isMenuOpen = activeMenuWoId === wo.id;
            const isNearBottom = index >= workOrders.length - 2 && workOrders.length > 2;

            return (
              <tr
                key={wo.id}
                onClick={() => onRowClick && onRowClick(wo)}
                className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
              >
                {/* Column 1: เลขที่ใบงาน */}
                <td className="py-3 px-4 align-middle">
                  <div className="font-mono font-bold text-slate-900 group-hover:text-purple-700 transition-colors text-sm">
                    {wo.wo_code}
                  </div>
                  <div className="text-xs text-slate-500 font-medium mt-0.5">
                    {wo.plan_year ? (
                      <span className="text-slate-600">แผนปี {wo.plan_year} (ด.{wo.planned_month})</span>
                    ) : (
                      <span className="text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 font-medium text-[11px]">
                        นอกแผน (Ad-hoc)
                      </span>
                    )}
                  </div>
                </td>

                {/* Column 2: เครื่องมือวัด */}
                <td className="py-3 px-4 align-middle">
                  <div className="font-mono font-bold text-purple-700 text-sm">
                    {wo.asset_code}
                  </div>
                  <div className="font-semibold text-slate-900 line-clamp-1 text-sm mt-0.5" title={wo.asset_name}>
                    {wo.asset_name}
                  </div>
                  <div className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded text-[11px] font-semibold">
                      {wo.department}
                    </span>
                    <span>•</span>
                    <span className="truncate max-w-[140px] text-[11px]" title={wo.provider_name}>
                      {wo.provider_name}
                    </span>
                  </div>
                </td>

                {/* Column 3: วันครบกำหนด */}
                <td className="py-3 px-4 align-middle">
                  <div className="font-mono font-semibold text-slate-900 text-sm">
                    {wo.due_date}
                  </div>
                  {wo.due_date !== wo.original_due_date && (
                    <div className="text-[11px] text-amber-900 bg-amber-50 p-1 rounded border border-amber-200 font-medium mt-1 leading-tight">
                      <div>
                        วันเดิม: <span className="font-mono line-through text-slate-400">{wo.original_due_date}</span>
                      </div>
                      <div className="truncate max-w-[130px]" title={wo.reschedule_reason}>
                        ({wo.reschedule_reason})
                      </div>
                    </div>
                  )}
                </td>

                {/* Column 4: ผลตรวจ / ใบรับรอง / เกณฑ์ยอมรับ */}
                <td className="py-3 px-4 align-middle space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">ผล:</span>
                    {getResultBadge(wo.result_status)}
                  </div>

                  {wo.certificate_no && (
                    <div className="text-xs">
                      <span className="text-slate-500 font-medium">ใบรับรอง:</span>{' '}
                      <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.2 rounded text-xs">
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
                    <div className="p-1.5 rounded bg-rose-50 border border-rose-200 text-rose-800 font-medium text-xs">
                      <span className="font-bold">ส่งกลับ:</span> {wo.rejected_reason}
                    </div>
                  )}
                </td>

                {/* Column 5: สถานะ / NC */}
                <td className="py-3 px-4 align-middle space-y-1.5">
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

                {/* Column 6: การจัดการ (Single Primary Action + More Menu) */}
                <td className="py-3 px-4 align-middle text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="relative inline-flex items-center justify-end gap-1.5">
                    
                    {/* Primary Row Action (ตามสถานะงาน) */}
                    {(wo.status === 'OPEN' || wo.status === 'REJECTED') && (
                      <button
                        type="button"
                        onClick={() => onRecordResult(wo)}
                        className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-purple-700 text-white font-medium hover:bg-purple-800 transition-colors cursor-pointer text-xs shadow-2xs whitespace-nowrap"
                      >
                        <FileCheck2 size={13} />
                        <span>บันทึกผลและใบรับรอง</span>
                      </button>
                    )}

                    {wo.status === 'PENDING_REVIEW' && (
                      <button
                        type="button"
                        onClick={() => onApprove(wo)}
                        className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-emerald-700 text-white font-medium hover:bg-emerald-800 transition-colors cursor-pointer text-xs shadow-2xs whitespace-nowrap"
                      >
                        <CheckCircle2 size={13} />
                        <span>ตรวจรับปิดงาน</span>
                      </button>
                    )}

                    {wo.nc_status === 'OPEN' && (
                      <button
                        type="button"
                        onClick={() => onReleaseHold(wo)}
                        className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-purple-700 text-white font-medium hover:bg-purple-800 transition-colors cursor-pointer text-xs shadow-2xs whitespace-nowrap"
                      >
                        <ShieldAlert size={13} />
                        <span>ปลดระงับ ON_HOLD (L{reqApproverLevel}+)</span>
                      </button>
                    )}

                    {/* Secondary Actions Trigger (More Menu Icon) */}
                    <button
                      type="button"
                      onClick={() => toggleMenu(wo.id)}
                      aria-label={`การจัดการเพิ่มเติมสำหรับ ${wo.wo_code}`}
                      title="ตัวเลือกเพิ่มเติม"
                      className="h-8 w-8 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <MoreHorizontal size={15} />
                    </button>

                    {/* Secondary Action Dropdown Menu */}
                    <div
                      className={`absolute right-0 z-50 min-w-[170px] bg-white rounded-xl shadow-lg border border-slate-200 py-1 transition-all text-left ${
                        isNearBottom ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                      } ${
                        isMenuOpen ? 'opacity-100 pointer-events-auto scale-100' : 'opacity-0 pointer-events-none scale-95'
                      }`}
                    >
                      {(wo.status === 'OPEN' || wo.status === 'REJECTED') && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuWoId(null);
                            onReschedule(wo);
                          }}
                          className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <CalendarClock size={13} className="text-slate-500" />
                          <span>เลื่อนวันครบกำหนด</span>
                        </button>
                      )}

                      {wo.status === 'PENDING_REVIEW' && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuWoId(null);
                            onReject(wo);
                          }}
                          className="w-full text-left px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <XCircle size={13} className="text-rose-500" />
                          <span>ส่งกลับแก้ไข</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setActiveMenuWoId(null);
                          onRowClick(wo);
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 border-t border-slate-100 transition-colors cursor-pointer"
                      >
                        <Eye size={13} className="text-slate-500" />
                        <span>ดูรายละเอียดใบสั่งงาน</span>
                      </button>
                    </div>

                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default WorkOrderTable;
