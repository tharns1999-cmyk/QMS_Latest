import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bell,
  Download,
  RefreshCw,
  Search,
  CheckCircle,
  AlertTriangle,
  ShieldAlert,
  Clock,
  Play,
  CheckCheck,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import {
  fetchVccNotifications,
  triggerVccNotificationSweep,
  exportVccNotificationsCsv
} from '../api/vccNotificationApi';
import useStore from '../../../store/useStore';
import DepartmentBadge from '../../../shared/components/ui/DepartmentBadge';
import VccNotificationAcknowledgementModal from './VccNotificationAcknowledgementModal';
import { NOTIFICATION_STATUS_LABELS } from '../utils/statusLabels';

const SEVERITY_BADGES = {
  CRITICAL: 'bg-rose-100 text-rose-800 border-rose-200',
  WARNING: 'bg-amber-100 text-amber-800 border-amber-200',
  INFO: 'bg-blue-100 text-blue-800 border-blue-200'
};

const STATUS_BADGES = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  ACKNOWLEDGED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RESOLVED: 'bg-slate-100 text-slate-600 border-slate-200'
};

const ESCALATION_LABELS = {
  1: 'L1: ผู้ดำเนินการ/เจ้าของเครื่องมือ',
  2: 'L2: หัวหน้าแผนก/ผู้จัดการ',
  3: 'L3: ผู้จัดการฝ่ายคุณภาพ/QMR'
};

export default function VccNotificationAuditTab() {
  const currentUser = useStore((state) => state.currentUser);
  const isDcc = Boolean(currentUser?.isDcc || currentUser?.isQmr);

  const [notifications, setNotifications] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filters
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Manual Sweep
  const [runningSweep, setRunningSweep] = useState(false);

  // Acknowledge Modal
  const [ackModalOpen, setAckModalOpen] = useState(false);
  const [selectedNotifForAck, setSelectedNotifForAck] = useState(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetchVccNotifications({
        department: selectedDept === 'ALL' ? undefined : selectedDept,
        status: selectedStatus === 'ALL' ? undefined : selectedStatus,
        severity: selectedSeverity === 'ALL' ? undefined : selectedSeverity,
        limit,
        offset: (page - 1) * limit
      });
      setNotifications(res.notifications || []);
      setTotal(res.total || 0);
    } catch (err) {
      setErrorMsg(err?.message || 'ไม่สามารถโหลดประวัติการแจ้งเตือนได้');
    } finally {
      setLoading(false);
    }
  }, [selectedDept, selectedStatus, selectedSeverity, page, limit]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleManualSweep = async () => {
    setRunningSweep(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await triggerVccNotificationSweep();
      const s = res?.summary || {};
      setSuccessMsg(
        `ประมวลผลการแจ้งเตือนสำเร็จ (สร้างใหม่: ${s.created || 0}, ยกระดับ: ${s.escalated || 0}, ปิดจบ: ${s.resolved || 0})`
      );
      await loadNotifications();
    } catch (err) {
      setErrorMsg(err?.message || 'ประมวลผลการแจ้งเตือนไม่สำเร็จ');
    } finally {
      setRunningSweep(false);
    }
  };

  const handleExportCsv = async () => {
    setErrorMsg('');
    try {
      await exportVccNotificationsCsv({
        department: selectedDept === 'ALL' ? undefined : selectedDept,
        status: selectedStatus === 'ALL' ? undefined : selectedStatus,
        severity: selectedSeverity === 'ALL' ? undefined : selectedSeverity
      });
      setSuccessMsg('ส่งออกรายงานประวัติการแจ้งเตือน (CSV) เรียบร้อยแล้ว');
    } catch (err) {
      setErrorMsg(err?.message || 'ส่งออกรายงานไม่สำเร็จ');
    }
  };

  const openAckModal = (notif) => {
    setSelectedNotifForAck(notif);
    setAckModalOpen(true);
  };

  const handleAckSuccess = () => {
    setSuccessMsg('บันทึกการรับทราบการแจ้งเตือนเรียบร้อยแล้ว');
    loadNotifications();
  };

  const filteredList = useMemo(() => {
    if (!searchTerm.trim()) return notifications;
    const term = searchTerm.toLowerCase();
    return notifications.filter(
      (n) =>
        (n.asset_code && n.asset_code.toLowerCase().includes(term)) ||
        (n.asset_name && n.asset_name.toLowerCase().includes(term)) ||
        (n.wo_code && n.wo_code.toLowerCase().includes(term)) ||
        (n.title && n.title.toLowerCase().includes(term)) ||
        (n.message && n.message.toLowerCase().includes(term))
    );
  }, [notifications, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6 text-slate-800" data-testid="vcc-notification-audit-tab">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200/80">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Bell size={18} className="text-indigo-600" />
            <span>ประวัติการแจ้งเตือนและการยกระดับ (Automated Notification & Escalation Audit)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            บันทึกวงจรการแจ้งเตือน Due Soon, Overdue, Cert Expiry และ NC พร้อมบันทึกการรับทราบและการยกระดับตามสิทธิ์
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isDcc && (
            <button
              type="button"
              onClick={handleManualSweep}
              disabled={runningSweep}
              data-testid="trigger-sweep-btn"
              className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 text-xs font-semibold transition-colors shadow-2xs cursor-pointer disabled:opacity-60"
            >
              <Play size={13} className={runningSweep ? 'animate-spin' : ''} />
              <span>{runningSweep ? 'กำลังประมวลผล...' : 'ประมวลผลแจ้งเตือน (Sweep)'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            data-testid="export-notif-csv-btn"
            className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
          >
            <Download size={13} className="text-sky-600" />
            <span>รายงานการแจ้งเตือน (CSV)</span>
          </button>

          <button
            type="button"
            onClick={loadNotifications}
            title="รีเฟรชข้อมูล"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/90 transition-colors shadow-2xs cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-indigo-600' : ''} />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div role="alert" className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs font-semibold text-rose-700">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs font-semibold text-emerald-800">
          {successMsg}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-wrap items-center gap-3 text-xs">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            aria-label="ค้นหารายการแจ้งเตือน"
            placeholder="ค้นหาตามรหัสเครื่องมือ, ใบงาน, หรือข้อความ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-hidden focus:border-slate-400"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 font-medium">แผนก:</span>
          <select
            aria-label="เลือกแผนก"
            value={selectedDept}
            onChange={(e) => {
              setSelectedDept(e.target.value);
              setPage(1);
            }}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800"
          >
            <option value="ALL">ทุกแผนก</option>
            <option value="QC">QC</option>
            <option value="QA">QA</option>
            <option value="DC">DC</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 font-medium">สถานะ:</span>
          <select
            aria-label="เลือกสถานะแจ้งเตือน"
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800"
          >
            <option value="ALL">ทุกสถานะ</option>
            <option value="PENDING">รอการรับทราบ</option>
            <option value="ACKNOWLEDGED">รับทราบแล้ว</option>
            <option value="RESOLVED">ปิดจบแล้ว</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 font-medium">ความรุนแรง:</span>
          <select
            aria-label="เลือกระดับความรุนแรง"
            value={selectedSeverity}
            onChange={(e) => {
              setSelectedSeverity(e.target.value);
              setPage(1);
            }}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800"
          >
            <option value="ALL">ทุกระดับ</option>
            <option value="CRITICAL">วิกฤต</option>
            <option value="WARNING">เตือน</option>
            <option value="INFO">แจ้งเพื่อทราบ</option>
          </select>
        </div>
      </div>

      {/* Notifications Table / List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-xs text-slate-400 font-medium">
            กำลังโหลดรายการแจ้งเตือน...
          </div>
        ) : filteredList.length === 0 ? (
          <div className="py-16 text-center space-y-1.5" data-testid="notif-empty-state">
            <div className="text-sm font-semibold text-slate-700">ไม่มีรายการแจ้งเตือนตรงตามเงื่อนไข</div>
            <div className="text-xs text-slate-400">การแจ้งเตือนทั้งหมดได้รับการรับทราบหรือแก้ไขเรียบร้อยแล้ว</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-3.5">ความรุนแรง</th>
                  <th className="py-3 px-3.5">ระดับบันได (Level)</th>
                  <th className="py-3 px-3.5">แผนก</th>
                  <th className="py-3 px-3.5">เครื่องมือ / ใบงาน</th>
                  <th className="py-3 px-3.5">หัวข้อ / ข้อความแจ้งเตือน</th>
                  <th className="py-3 px-3.5">สถานะ</th>
                  <th className="py-3 px-3.5">การรับทราบ / วันที่</th>
                  <th className="py-3 px-3.5 text-right">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.map((n) => {
                  const isCritical = n.severity === 'CRITICAL';
                  const isWarning = n.severity === 'WARNING';
                  const isPending = n.status === 'PENDING';
                  const isAck = n.status === 'ACKNOWLEDGED';

                  return (
                    <tr key={n.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                            SEVERITY_BADGES[n.severity] || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {isCritical ? (
                            <ShieldAlert size={12} />
                          ) : isWarning ? (
                            <AlertTriangle size={12} />
                          ) : (
                            <Bell size={12} />
                          )}
                          <span>{n.severity}</span>
                        </span>
                      </td>

                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className="font-semibold text-slate-800 block">
                          Level {n.escalation_level}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {ESCALATION_LABELS[n.escalation_level] || 'ทั่วไป'}
                        </span>
                      </td>

                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <DepartmentBadge department={n.department} />
                      </td>

                      <td className="py-3 px-3.5 whitespace-nowrap font-mono">
                        <div className="font-bold text-slate-900">{n.asset_code || n.asset_id}</div>
                        {n.wo_code && (
                          <div className="text-[11px] text-slate-500">{n.wo_code}</div>
                        )}
                      </td>

                      <td className="py-3 px-3.5 max-w-sm">
                        <div className="font-semibold text-slate-900">{n.title}</div>
                        <div className="text-slate-600 text-[11px] mt-0.5 leading-relaxed line-clamp-2">
                          {n.message}
                        </div>
                      </td>

                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                            STATUS_BADGES[n.status] || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {isPending && <Clock size={11} />}
                          {isAck && <CheckCheck size={11} />}
                          <span>{NOTIFICATION_STATUS_LABELS[n.status] || n.status}</span>
                        </span>
                      </td>

                      <td className="py-3 px-3.5 text-[11px] whitespace-nowrap text-slate-600">
                        {isAck ? (
                          <div>
                            <span className="font-medium text-emerald-800 block">
                              รับทราบโดย: {n.acknowledged_by_name || n.acknowledged_by}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {n.acknowledged_at ? new Date(n.acknowledged_at).toLocaleString('th-TH') : ''}
                            </span>
                            {n.acknowledgement_note && (
                              <div className="text-[10px] text-slate-500 italic mt-0.5 max-w-xs truncate" title={n.acknowledgement_note}>
                                "{n.acknowledgement_note}"
                              </div>
                            )}
                          </div>
                        ) : n.status === 'RESOLVED' ? (
                          <div>
                            <span className="text-slate-500 block">
                              เหตุผล: {n.resolved_reason || 'งานเสร็จสิ้น'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {n.resolved_at ? new Date(n.resolved_at).toLocaleString('th-TH') : ''}
                            </span>
                          </div>
                        ) : (
                          <span className="text-amber-600 font-medium">รอการรับทราบ</span>
                        )}
                      </td>

                      <td className="py-3 px-3.5 whitespace-nowrap text-right">
                        {isPending && (
                          <button
                            type="button"
                            onClick={() => openAckModal(n)}
                            data-testid={`ack-btn-${n.id}`}
                            className="h-7 px-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <CheckCircle size={13} />
                            <span>รับทราบ</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {total > limit && (
          <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <div>
              แสดง {(page - 1) * limit + 1} - {Math.min(page * limit, total)} จากทั้งหมด {total} รายการ
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-7 px-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft size={14} /> ก่อนหน้า
              </button>
              <span className="font-semibold text-slate-700">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-7 px-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1 cursor-pointer"
              >
                ถัดไป <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Acknowledgement Modal */}
      <VccNotificationAcknowledgementModal
        isOpen={ackModalOpen}
        onClose={() => setAckModalOpen(false)}
        notification={selectedNotifForAck}
        onSuccess={handleAckSuccess}
      />
    </div>
  );
}
