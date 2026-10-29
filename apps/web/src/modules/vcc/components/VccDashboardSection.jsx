import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Download,
  Settings,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertTriangle,
  History,
  RefreshCw,
  FileSpreadsheet,
  X,
  Layers,
  Calendar
} from 'lucide-react';
import {
  fetchVccDashboard,
  fetchVccAuditLog,
  saveVccNotificationSettings,
  exportVccAnnualPlanCsv,
  exportVccWorkOrdersCsv
} from '../api/vccDashboardApi';

const MONTH_LABELS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const ALERT_TABS = [
  { key: 'ON_HOLD', label: 'ระงับใช้ (ON_HOLD)', badgeClass: 'bg-rose-100 text-rose-800' },
  { key: 'OVERDUE', label: 'เลยกำหนด (OVERDUE)', badgeClass: 'bg-amber-100 text-amber-800' },
  { key: 'DUE_SOON', label: 'ใกล้ครบกำหนด (DUE_SOON)', badgeClass: 'bg-blue-100 text-blue-800' },
  { key: 'PENDING_REVIEW', label: 'รอตรวจรับ (PENDING_REVIEW)', badgeClass: 'bg-indigo-100 text-indigo-800' }
];

const parseDaysInput = (text) =>
  String(text || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 365);

const triggerCsvDownload = (csvText, filename) => {
  try {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined') {
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  } catch {
    // Safe fallback in test environment
  }
};

export default function VccDashboardSection({ onNavigateToWorkOrders }) {
  const [year, setYear] = useState(2026);
  const [dashboard, setDashboard] = useState(null);
  const [auditHistory, setAuditHistory] = useState([]);
  const [auditCategory, setAuditCategory] = useState('VCC_');
  const [alertTab, setAlertTab] = useState('OVERDUE');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [exportMsg, setExportMsg] = useState('');

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [monthlyDueSoonText, setMonthlyDueSoonText] = useState('7, 3');
  const [monthlyOverdueText, setMonthlyOverdueText] = useState('1, 3, 7');
  const [annualDueSoonText, setAnnualDueSoonText] = useState('30, 14, 7');
  const [annualOverdueText, setAnnualOverdueText] = useState('1, 7, 14');
  const [reviewSlaDays, setReviewSlaDays] = useState(3);
  const [savingSettings, setSavingSettings] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [dashData, logs] = await Promise.all([
        fetchVccDashboard({ year }),
        fetchVccAuditLog(auditCategory)
      ]);
      setDashboard(dashData);
      setAuditHistory(logs || []);
      if (dashData?.notification_settings) {
        const s = dashData.notification_settings;
        setMonthlyDueSoonText((s.monthly_due_soon_days || [7, 3]).join(', '));
        setMonthlyOverdueText((s.monthly_overdue_days || [1, 3, 7]).join(', '));
        setAnnualDueSoonText((s.annual_due_soon_days || [30, 14, 7]).join(', '));
        setAnnualOverdueText((s.annual_overdue_days || [1, 7, 14]).join(', '));
        setReviewSlaDays(s.review_sla_days || 3);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'ไม่สามารถโหลดข้อมูลสรุปภาพรวมได้');
    } finally {
      setLoading(false);
    }
  }, [year, auditCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSavingSettings(true);
    try {
      await saveVccNotificationSettings({
        monthly_due_soon_days: parseDaysInput(monthlyDueSoonText),
        monthly_overdue_days: parseDaysInput(monthlyOverdueText),
        annual_due_soon_days: parseDaysInput(annualDueSoonText),
        annual_overdue_days: parseDaysInput(annualOverdueText),
        review_sla_days: Number(reviewSlaDays)
      });
      setSettingsOpen(false);
      await loadData();
    } catch (err) {
      setErrorMsg(err?.message || 'บันทึกการตั้งค่าแจ้งเตือนไม่สำเร็จ');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleExportPlanCsv = async () => {
    setErrorMsg('');
    setExportMsg('');
    try {
      const csvText = await exportVccAnnualPlanCsv(year);
      triggerCsvDownload(csvText, `FM-QC-46_${year}.csv`);
      setExportMsg(`ส่งออกตารางแผนประจำปี ${year} (FM-QC-46) เรียบร้อยแล้ว`);
      await loadData();
    } catch (err) {
      setErrorMsg(err?.message || 'ส่งออกตารางแผนประจำปีไม่สำเร็จ');
    }
  };

  const handleExportWoCsv = async () => {
    setErrorMsg('');
    setExportMsg('');
    try {
      const csvText = await exportVccWorkOrdersCsv();
      triggerCsvDownload(csvText, `VCC_WorkOrders_${year}.csv`);
      setExportMsg('ส่งออกรายการใบสั่งงานและประวัติใบรับรอง (CSV) เรียบร้อยแล้ว');
      await loadData();
    } catch (err) {
      setErrorMsg(err?.message || 'ส่งออกรายการใบสั่งงานไม่สำเร็จ');
    }
  };

  const eq = dashboard?.equipment_kpi || {};
  const wo = dashboard?.work_order_kpi || {};
  const allAlerts = dashboard?.alerts || [];

  const filteredAlerts = allAlerts.filter((a) => {
    if (alertTab === 'DUE_SOON') return a.alert_type === 'DUE_SOON' || a.alert_type === 'DUE_TODAY';
    return a.alert_type === alertTab;
  });

  const countByAlertTab = (tabKey) =>
    allAlerts.filter((a) => (tabKey === 'DUE_SOON' ? a.alert_type === 'DUE_SOON' || a.alert_type === 'DUE_TODAY' : a.alert_type === tabKey)).length;

  return (
    <div className="space-y-6" data-testid="vcc-dashboard-section">
      {/* Dashboard Toolbar & Quick Actions */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-600 font-medium text-xs sm:text-sm">
            <Clock size={15} className="text-indigo-600 shrink-0" />
            <span>เกณฑ์ On-Time: ปิดงาน (CLOSED) และวันปฏิบัติงานจริงไม่เกินวันครบกำหนด</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200/90 rounded-xl px-3 py-1 text-sm">
            <label htmlFor="vcc-year-select" className="text-xs font-semibold text-slate-600">
              ปีแผน:
            </label>
            <select
              id="vcc-year-select"
              aria-label="เลือกปีแผน Dashboard"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="h-8 rounded-lg border-0 bg-transparent text-sm font-bold text-slate-900 focus:ring-0 cursor-pointer"
            >
              <option value={2026}>2026 (พ.ศ. 2569)</option>
              <option value={2027}>2027 (พ.ศ. 2570)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleExportPlanCsv}
            data-testid="vcc-export-plan-csv-btn"
            className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 text-xs sm:text-sm font-medium transition-colors shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet size={15} className="text-emerald-600 shrink-0" />
            <span>ส่งออกแผน FM-QC-46 (CSV)</span>
          </button>

          <button
            type="button"
            onClick={handleExportWoCsv}
            data-testid="vcc-export-wo-csv-btn"
            className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 text-xs sm:text-sm font-medium transition-colors shadow-2xs cursor-pointer"
          >
            <Download size={15} className="text-sky-600 shrink-0" />
            <span>ส่งออกใบสั่งงาน/ใบรับรอง (CSV)</span>
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            data-testid="vcc-open-notification-settings-btn"
            className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 text-xs sm:text-sm font-medium transition-colors shadow-2xs cursor-pointer"
          >
            <Settings size={15} className="text-slate-500 shrink-0" />
            <span>ตั้งค่าแจ้งเตือน</span>
          </button>

          <button
            type="button"
            onClick={loadData}
            title="รีเฟรชข้อมูล"
            className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-medium transition-colors shadow-2xs cursor-pointer"
          >
            <RefreshCw size={14} className={`text-slate-500 shrink-0 ${loading ? 'animate-spin' : ''}`} />
            <span>รีเฟรช</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div role="alert" className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm font-medium text-rose-700">
          {errorMsg}
        </div>
      )}

      {exportMsg && (
        <div data-testid="vcc-export-success-banner" className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-800">
          {exportMsg}
        </div>
      )}

      {/* KPI Cards — Grouped by Priority */}
      <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-3.5">
        {/* Active Assets */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs hover:border-slate-300 transition-colors flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center justify-between">
              <span>เครื่องมือรายตัว (ใช้งานปกติ)</span>
              <Layers size={14} className="text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-slate-900" data-testid="kpi-active-assets">
              {eq.active_assets ?? 0} <span className="text-xs font-normal text-slate-500 font-sans">/ {eq.total_assets ?? 0}</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500 font-medium">
            กลุ่มแม่: {eq.group_count ?? 0} กลุ่ม | ปลดออก: {eq.retired_assets ?? 0}
          </div>
        </div>

        {/* ON_HOLD — Critical Attention */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs hover:border-rose-200 transition-colors flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold text-rose-700 uppercase tracking-wide flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ShieldAlert size={14} /> ระงับใช้งาน (ON_HOLD)
              </span>
              {(eq.on_hold_assets ?? 0) > 0 && (
                <span className="h-2 w-2 rounded-full bg-rose-500" title="มีเครื่องมือถูกระงับใช้" />
              )}
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-rose-700" data-testid="kpi-on-hold-assets">
              {eq.on_hold_assets ?? 0}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-rose-700 font-medium">
            ผลไม่ผ่าน (FAIL): {wo.fail_count ?? 0} งาน
          </div>
        </div>

        {/* OVERDUE — Compliance Attention */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs hover:border-amber-200 transition-colors flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <AlertTriangle size={14} /> เลยกำหนด (OVERDUE)
              </span>
              {(wo.overdue_count ?? 0) > 0 && (
                <span className="h-2 w-2 rounded-full bg-amber-500" title="มีงานเลยกำหนด" />
              )}
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-amber-700" data-testid="kpi-overdue-count">
              {wo.overdue_count ?? 0}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500 font-medium">
            ใกล้ครบใน 7 วัน: {wo.due_in_7_days ?? 0} งาน
          </div>
        </div>

        {/* DUE IN 30 DAYS */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs hover:border-slate-300 transition-colors flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock size={14} className="text-indigo-600" /> ใกล้ครบกำหนดใน 30 วัน
              </span>
              <Calendar size={14} className="text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-indigo-700" data-testid="kpi-due-30-count">
              {wo.due_in_30_days ?? 0}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500 font-medium">
            ใบสั่งงานทั้งหมด: {wo.total_work_orders ?? 0}
          </div>
        </div>

        {/* PENDING_REVIEW */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs hover:border-slate-300 transition-colors flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center justify-between">
              <span>รอผู้ตรวจรับ (PENDING_REVIEW)</span>
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-slate-900" data-testid="kpi-pending-review-count">
              {wo.pending_review_count ?? 0}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500 font-medium">
            SLA ตรวจรับ: {dashboard?.notification_settings?.review_sla_days ?? 3} วัน
          </div>
        </div>

        {/* COMPLETED & ON-TIME RATE */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs hover:border-emerald-200 transition-colors flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={14} /> ปิดงานแล้ว / ทันกำหนด
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-emerald-700" data-testid="kpi-completed-count">
              {wo.completed_count ?? 0} <span className="text-xs font-semibold font-sans">({wo.on_time_rate ?? 0}%)</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-emerald-700 font-medium">
            ทันกำหนด: {wo.on_time_count ?? 0} งาน | ผ่าน: {wo.pass_count ?? 0}
          </div>
        </div>
      </div>

      {/* Active Alerts Separated by Status Tab */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Bell size={18} className="text-slate-700 shrink-0" />
              <h2 className="text-base font-bold text-slate-900">ศูนย์แจ้งเตือนแยกตามสถานะ (งานที่ปิดแล้วจะไม่แจ้งเตือนซ้ำ)</h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              แสดงเฉพาะรายการที่ต้องติดตามหรือดำเนินการตามสถานะปัจจุบัน
            </p>
          </div>
          {onNavigateToWorkOrders && (
            <button
              type="button"
              onClick={onNavigateToWorkOrders}
              className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer group"
            >
              <span>ไปที่หน้าใบสั่งงานทั้งหมด</span>
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/60">
          {ALERT_TABS.map((t) => {
            const count = countByAlertTab(t.key);
            const isActive = alertTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setAlertTab(t.key)}
                data-testid={`alert-tab-${t.key}`}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-2 cursor-pointer ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold border border-slate-200/70'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <span>{t.label}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                    isActive
                      ? 'bg-slate-100 text-slate-900'
                      : count > 0 && (t.key === 'ON_HOLD' || t.key === 'OVERDUE')
                      ? t.badgeClass
                      : 'bg-slate-200/70 text-slate-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500 font-medium">กำลังประมวลผลรายการแจ้งเตือน...</div>
        ) : filteredAlerts.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500 font-medium" data-testid="alert-empty-state">
            ไม่มีรายการแจ้งเตือนในสถานะนี้
          </div>
        ) : (
          <div className="divide-y divide-slate-100" data-testid={`alert-list-${alertTab}`}>
            {filteredAlerts.map((alert) => (
              <div
                key={alert.dedupe_key}
                className="py-3 px-3 -mx-3 rounded-xl hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 text-sm"
              >
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-mono font-bold text-slate-900">{alert.wo_code}</span>
                  <span className="font-mono text-xs font-semibold text-indigo-700 bg-indigo-50/80 border border-indigo-200/70 px-2 py-0.5 rounded-md">
                    {alert.asset_code}
                  </span>
                  <span className="text-slate-800 font-medium">{alert.asset_name}</span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200/60 text-xs font-medium">
                    {alert.department}
                  </span>
                </div>
                <div className="text-slate-700 font-medium text-xs sm:text-sm">{alert.message}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Monthly Plan vs Act. Comparison & Department Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Plan vs Act Table */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              เปรียบเทียบแผนที่อนุมัติแล้ว (Plan) กับงานที่ปิดแล้ว (Act.) รายเดือน ปี {year}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 mb-3">
              ข้อมูลเปรียบเทียบเป้าหมายประจำปีตามแผน FM-QC-46 กับผลการตรวจจริง
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-600 border-b border-slate-200/80 font-bold uppercase tracking-wider text-xs">
                    <th className="py-2.5 px-2.5 text-left w-24 font-semibold">รายการ</th>
                    {MONTH_LABELS.map((m, idx) => (
                      <th key={idx} className="py-2.5 px-1 text-center font-semibold">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  <tr className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-2.5 px-2.5 font-semibold text-sky-700 font-sans text-xs sm:text-sm whitespace-nowrap">Plan (แผน)</td>
                    {(dashboard?.monthly_comparison || []).map((row) => (
                      <td key={row.month} className="py-2.5 px-1 text-center font-medium text-slate-700">
                        {row.planned || '-'}
                      </td>
                    ))}
                  </tr>
                  <tr className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-2.5 px-2.5 font-semibold text-emerald-700 font-sans text-xs sm:text-sm whitespace-nowrap">Act. (ปิดแล้ว)</td>
                    {(dashboard?.monthly_comparison || []).map((row) => (
                      <td key={row.month} className="py-2.5 px-1 text-center font-bold text-emerald-700">
                        {row.actual_closed || '-'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Department Summary Table */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">สรุปสถานะแยกตามแผนกเจ้าของเครื่องมือ</h2>
            <p className="text-xs text-slate-500 mt-0.5 mb-3">
              แจกแจงจำนวนเครื่องมือและสถานะใบสั่งงานตามแผนกที่รับผิดชอบ
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-600 border-b border-slate-200/80 font-semibold uppercase tracking-wider text-xs">
                    <th className="py-2.5 px-3 text-left">แผนก</th>
                    <th className="py-2.5 px-2 text-right">เครื่องมือ</th>
                    <th className="py-2.5 px-2 text-right">ใบงานทั้งหมด</th>
                    <th className="py-2.5 px-2 text-right">ปิดงานแล้ว</th>
                    <th className="py-2.5 px-2 text-right">เลยกำหนด</th>
                    <th className="py-2.5 px-2 text-right">ระงับใช้ (ON_HOLD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-xs sm:text-sm">
                  {(dashboard?.department_breakdown || []).map((d) => (
                    <tr key={d.department} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-slate-900 font-sans">{d.department}</td>
                      <td className="py-2.5 px-2 text-right font-medium text-slate-700">{d.asset_count}</td>
                      <td className="py-2.5 px-2 text-right font-medium text-slate-700">{d.total_work_orders}</td>
                      <td className="py-2.5 px-2 text-right text-emerald-700 font-bold">{d.closed_work_orders}</td>
                      <td className="py-2.5 px-2 text-right text-amber-700 font-bold">{d.overdue_work_orders}</td>
                      <td className="py-2.5 px-2 text-right text-rose-600 font-bold">{d.on_hold_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* VCC Audit Trail */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <History size={18} className="text-slate-700 shrink-0" />
              <h2 className="text-base font-bold text-slate-900">ประวัติการตรวจสอบย้อนหลัง (VCC Audit Trail)</h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">บันทึกการเปลี่ยนแปลงและกิจกรรมสำคัญทั้งหมดในระบบ VCC</p>
          </div>
          <select
            aria-label="กรองหมวดหมู่ประวัติ VCC"
            value={auditCategory}
            onChange={(e) => setAuditCategory(e.target.value)}
            className="h-9 rounded-xl border border-slate-200/90 bg-white px-3 text-xs sm:text-sm font-medium text-slate-700 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer shadow-2xs"
          >
            <option value="VCC_">ทั้งหมดใน VCC</option>
            <option value="VCC_ASSET">ทะเบียนเครื่องมือ (VCC_ASSET)</option>
            <option value="VCC_PLAN">แผนประจำปี (VCC_PLAN)</option>
            <option value="VCC_WO">ใบสั่งงานและระงับใช้ (VCC_WO)</option>
            <option value="VCC_NOTIFICATION">กติกาแจ้งเตือน (VCC_NOTIFICATION)</option>
            <option value="VCC_EXPORT">การส่งออกรายงาน (VCC_EXPORT)</option>
          </select>
        </div>

        <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 text-sm pr-1" data-testid="vcc-audit-trail-list">
          {auditHistory.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">ยังไม่มีบันทึกประวัติในหมวดหมู่นี้</div>
          ) : (
            auditHistory.slice(0, 30).map((item) => (
              <div key={item.id} className="py-2.5 px-2 hover:bg-slate-50/70 rounded-lg transition-colors flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 font-mono text-xs font-semibold text-slate-700 border border-slate-200/60">
                    {item.action}
                  </span>
                  <span className="font-semibold text-slate-800 text-xs sm:text-sm">{item.actor_name || item.actor_id}</span>
                </div>
                <div className="text-slate-400 font-mono text-xs">{String(item.at || '').slice(0, 19).replace('T', ' ')}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Notification Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 border border-slate-200/80 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">ตั้งค่ากติกาวันแจ้งเตือนล่วงหน้าและเลยกำหนด (DCC)</h3>
                <p className="text-xs text-slate-500 mt-0.5">กำหนดจำนวนวันสำหรับรอบการแจ้งเตือนงานสอบเทียบและ SLA</p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-3.5 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  งานรายเดือน — แจ้งเตือนล่วงหน้า (วัน คั่นด้วยจุลภาค)
                </label>
                <input
                  type="text"
                  aria-label="งานรายเดือน แจ้งเตือนล่วงหน้า"
                  value={monthlyDueSoonText}
                  onChange={(e) => setMonthlyDueSoonText(e.target.value)}
                  placeholder="เช่น 7, 3"
                  className="w-full h-9 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  งานรายเดือน — แจ้งเตือนเมื่อเลยกำหนด (วัน คั่นด้วยจุลภาค)
                </label>
                <input
                  type="text"
                  aria-label="งานรายเดือน แจ้งเตือนเลยกำหนด"
                  value={monthlyOverdueText}
                  onChange={(e) => setMonthlyOverdueText(e.target.value)}
                  placeholder="เช่น 1, 3, 7"
                  className="w-full h-9 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  งานรายปี — แจ้งเตือนล่วงหน้า (วัน คั่นด้วยจุลภาค)
                </label>
                <input
                  type="text"
                  aria-label="งานรายปี แจ้งเตือนล่วงหน้า"
                  value={annualDueSoonText}
                  onChange={(e) => setAnnualDueSoonText(e.target.value)}
                  placeholder="เช่น 30, 14, 7"
                  className="w-full h-9 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  งานรายปี — แจ้งเตือนเมื่อเลยกำหนด (วัน คั่นด้วยจุลภาค)
                </label>
                <input
                  type="text"
                  aria-label="งานรายปี แจ้งเตือนเลยกำหนด"
                  value={annualOverdueText}
                  onChange={(e) => setAnnualOverdueText(e.target.value)}
                  placeholder="เช่น 1, 7, 14"
                  className="w-full h-9 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  SLA รอผู้ตรวจรับ (วัน)
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  aria-label="SLA รอผู้ตรวจรับ"
                  value={reviewSlaDays}
                  onChange={(e) => setReviewSlaDays(e.target.value)}
                  className="w-full h-9 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="h-9 px-4 rounded-xl border border-slate-200 text-slate-700 text-xs sm:text-sm font-medium hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  data-testid="vcc-save-notification-settings-btn"
                  className="h-9 px-5 rounded-xl bg-indigo-600 text-white text-xs sm:text-sm font-medium hover:bg-indigo-700 shadow-xs cursor-pointer disabled:opacity-60 transition-colors"
                >
                  {savingSettings ? 'กำลังบันทึก...' : 'บันทึกกติกาแจ้งเตือน'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
