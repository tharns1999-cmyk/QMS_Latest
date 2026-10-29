import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bell,
  Download,
  Settings,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  X,
  ArrowRight,
  Info
} from 'lucide-react';
import {
  fetchVccDashboard,
  saveVccNotificationSettings,
  exportVccAnnualPlanCsv,
  exportVccWorkOrdersCsv
} from '../api/vccDashboardApi';

const MONTH_LABELS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const ALERT_TABS = [
  { key: 'OVERDUE', label: 'เลยกำหนด (OVERDUE)', alertBadgeClass: 'bg-amber-100 text-amber-900' },
  { key: 'ON_HOLD', label: 'ระงับใช้ (ON_HOLD)', alertBadgeClass: 'bg-rose-100 text-rose-900' },
  { key: 'DUE_SOON', label: 'ใกล้ครบกำหนด (DUE_SOON)', alertBadgeClass: 'bg-blue-100 text-blue-900' },
  { key: 'PENDING_REVIEW', label: 'รอตรวจรับ (PENDING_REVIEW)', alertBadgeClass: 'bg-indigo-100 text-indigo-900' }
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
      const dashData = await fetchVccDashboard({ year });
      setDashboard(dashData);
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
  }, [year]);

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

  const filteredAlerts = useMemo(() => {
    return allAlerts.filter((a) => {
      if (alertTab === 'DUE_SOON') return a.alert_type === 'DUE_SOON' || a.alert_type === 'DUE_TODAY';
      return a.alert_type === alertTab;
    });
  }, [allAlerts, alertTab]);

  const countByAlertTab = useCallback(
    (tabKey) =>
      allAlerts.filter((a) =>
        tabKey === 'DUE_SOON' ? a.alert_type === 'DUE_SOON' || a.alert_type === 'DUE_TODAY' : a.alert_type === tabKey
      ).length,
    [allAlerts]
  );

  // Plan vs Act Aggregation
  const { totalPlanned, totalActual } = useMemo(() => {
    const list = dashboard?.monthly_comparison || [];
    return list.reduce(
      (acc, r) => ({
        totalPlanned: acc.totalPlanned + (Number(r.planned) || 0),
        totalActual: acc.totalActual + (Number(r.actual_closed) || 0)
      }),
      { totalPlanned: 0, totalActual: 0 }
    );
  }, [dashboard?.monthly_comparison]);

  return (
    <div className="space-y-6 text-slate-800" data-testid="vcc-dashboard-section">
      {/* 1. Header Toolbar (Swiss Minimalist Action Bar) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200/80">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span className="text-slate-500 font-normal">ปีแผน:</span>
            <select
              aria-label="เลือกปีแผน Dashboard"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-900 focus:outline-hidden focus:border-slate-400 cursor-pointer shadow-2xs"
            >
              <option value={2026}>2026 (พ.ศ. 2569)</option>
              <option value={2027}>2027 (พ.ศ. 2570)</option>
            </select>
          </div>

          <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 pl-2 border-l border-slate-200">
            <Clock size={13} className="text-slate-400 shrink-0" />
            <span>เกณฑ์ On-Time: ปิดงาน (CLOSED) และทำจริงไม่เกินกำหนด</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleExportPlanCsv}
            data-testid="vcc-export-plan-csv-btn"
            className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 text-xs font-medium transition-colors shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet size={14} className="text-emerald-600 shrink-0" />
            <span>แผน FM-QC-46 (CSV)</span>
          </button>

          <button
            type="button"
            onClick={handleExportWoCsv}
            data-testid="vcc-export-wo-csv-btn"
            className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 text-xs font-medium transition-colors shadow-2xs cursor-pointer"
          >
            <Download size={14} className="text-sky-600 shrink-0" />
            <span>ใบงาน/ใบรับรอง (CSV)</span>
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            data-testid="vcc-open-notification-settings-btn"
            className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 text-xs font-medium transition-colors shadow-2xs cursor-pointer"
          >
            <Settings size={14} className="text-slate-400 shrink-0" />
            <span>ตั้งค่าแจ้งเตือน</span>
          </button>

          <button
            type="button"
            onClick={loadData}
            title="รีเฟรชข้อมูล"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/90 transition-colors shadow-2xs cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-indigo-600' : ''} />
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

      {/* 2. Compact Swiss Metrics Strip */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          {/* Active Assets */}
          <div className="p-4 sm:p-5 flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              เครื่องมือปกติ
            </span>
            <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono tracking-tight text-slate-900" data-testid="kpi-active-assets">
              {eq.active_assets ?? 0} <span className="text-xs font-normal text-slate-400 font-sans">/ {eq.total_assets ?? 0}</span>
            </div>
            <div className="mt-2 text-xs text-slate-400 font-medium truncate">
              กลุ่มแม่ {eq.group_count ?? 0} | ปลดออก {eq.retired_assets ?? 0}
            </div>
          </div>

          {/* ON_HOLD */}
          <div className={`p-4 sm:p-5 flex flex-col justify-between transition-colors ${
            (eq.on_hold_assets ?? 0) > 0 ? 'bg-rose-50/40' : ''
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold uppercase tracking-wider ${
                (eq.on_hold_assets ?? 0) > 0 ? 'text-rose-700' : 'text-slate-500'
              }`}>
                ระงับใช้ (ON_HOLD)
              </span>
              {(eq.on_hold_assets ?? 0) > 0 && <span className="h-2 w-2 rounded-full bg-rose-500" />}
            </div>
            <div className={`mt-2 text-2xl sm:text-3xl font-mono tracking-tight ${
              (eq.on_hold_assets ?? 0) > 0 ? 'font-bold text-rose-600' : 'font-medium text-slate-300'
            }`} data-testid="kpi-on-hold-assets">
              {eq.on_hold_assets ?? 0}
            </div>
            <div className={`mt-2 text-xs font-medium truncate ${
              (eq.on_hold_assets ?? 0) > 0 ? 'text-rose-600' : 'text-slate-400'
            }`}>
              ผลไม่ผ่าน (FAIL): {wo.fail_count ?? 0} งาน
            </div>
          </div>

          {/* OVERDUE */}
          <div className={`p-4 sm:p-5 flex flex-col justify-between transition-colors ${
            (wo.overdue_count ?? 0) > 0 ? 'bg-amber-50/40' : ''
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold uppercase tracking-wider ${
                (wo.overdue_count ?? 0) > 0 ? 'text-amber-800' : 'text-slate-500'
              }`}>
                เลยกำหนด (OVERDUE)
              </span>
              {(wo.overdue_count ?? 0) > 0 && <span className="h-2 w-2 rounded-full bg-amber-500" />}
            </div>
            <div className={`mt-2 text-2xl sm:text-3xl font-mono tracking-tight ${
              (wo.overdue_count ?? 0) > 0 ? 'font-bold text-amber-700' : 'font-medium text-slate-300'
            }`} data-testid="kpi-overdue-count">
              {wo.overdue_count ?? 0}
            </div>
            <div className={`mt-2 text-xs font-medium truncate ${
              (wo.overdue_count ?? 0) > 0 ? 'text-amber-700' : 'text-slate-400'
            }`}>
              ใกล้ครบ 7 วัน: {wo.due_in_7_days ?? 0} งาน
            </div>
          </div>

          {/* DUE IN 30 DAYS */}
          <div className="p-4 sm:p-5 flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              ครบใน 30 วัน
            </span>
            <div className={`mt-2 text-2xl sm:text-3xl font-mono tracking-tight ${
              (wo.due_in_30_days ?? 0) > 0 ? 'font-bold text-slate-800' : 'font-medium text-slate-300'
            }`} data-testid="kpi-due-30-count">
              {wo.due_in_30_days ?? 0}
            </div>
            <div className="mt-2 text-xs text-slate-400 font-medium truncate">
              ใบงานทั้งหมด {wo.total_work_orders ?? 0}
            </div>
          </div>

          {/* PENDING_REVIEW */}
          <div className="p-4 sm:p-5 flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              รอตรวจรับ
            </span>
            <div className={`mt-2 text-2xl sm:text-3xl font-mono tracking-tight ${
              (wo.pending_review_count ?? 0) > 0 ? 'font-bold text-indigo-700' : 'font-medium text-slate-300'
            }`} data-testid="kpi-pending-review-count">
              {wo.pending_review_count ?? 0}
            </div>
            <div className="mt-2 text-xs text-slate-400 font-medium truncate">
              SLA: {dashboard?.notification_settings?.review_sla_days ?? 3} วัน
            </div>
          </div>

          {/* COMPLETED / ON-TIME */}
          <div className="p-4 sm:p-5 flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              ปิดงานแล้ว / ทันกำหนด
            </span>
            <div className={`mt-2 text-2xl sm:text-3xl font-mono tracking-tight ${
              (wo.completed_count ?? 0) > 0 ? 'font-bold text-emerald-700' : 'font-medium text-slate-300'
            }`} data-testid="kpi-completed-count">
              {wo.completed_count ?? 0} <span className="text-xs font-semibold font-sans">({wo.on_time_rate ?? 0}%)</span>
            </div>
            <div className="mt-2 text-xs text-slate-400 font-medium truncate">
              ทันกำหนด: {wo.on_time_count ?? 0} | ผ่าน: {wo.pass_count ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Actionable Alert Worklist */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <Bell size={18} className="text-slate-900 shrink-0" />
              <h2 className="text-base font-bold text-slate-900 tracking-tight">ศูนย์แจ้งเตือนตามกติกา QMS</h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              แสดงเฉพาะงานที่ต้องดำเนินการตามเงื่อนไข (งานที่ปิดแล้วจะไม่แจ้งเตือนซ้ำ)
            </p>
          </div>
          {onNavigateToWorkOrders && (
            <button
              type="button"
              onClick={onNavigateToWorkOrders}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors group cursor-pointer self-start sm:self-auto"
            >
              <span>ไปที่หน้าใบสั่งงานทั้งหมด</span>
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}
        </div>

        {/* Minimal Swiss Underline Tabs */}
        <div className="flex flex-wrap gap-4 sm:gap-6 border-b border-slate-100 pt-1">
          {ALERT_TABS.map((t) => {
            const count = countByAlertTab(t.key);
            const isActive = alertTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setAlertTab(t.key)}
                data-testid={`alert-tab-${t.key}`}
                className={`pb-3 text-xs sm:text-sm font-medium transition-all flex items-center gap-2 cursor-pointer border-b-2 -mb-px ${
                  isActive
                    ? 'border-slate-900 text-slate-900 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{t.label}</span>
                <span
                  className={`text-xs font-mono font-medium px-1.5 py-0.5 rounded ${
                    count > 0 && (t.key === 'OVERDUE' || t.key === 'ON_HOLD')
                      ? t.alertBadgeClass
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Worklist Items */}
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400 font-medium">กำลังประมวลผลรายการแจ้งเตือน...</div>
        ) : filteredAlerts.length === 0 ? (
          <div className="py-12 text-center space-y-1.5" data-testid="alert-empty-state">
            <div className="text-sm font-medium text-slate-600">ไม่มีรายการแจ้งเตือนในสถานะนี้</div>
            <div className="text-xs text-slate-400">ทุกรายการได้รับการบันทึกและจัดการเรียบร้อยตามเกณฑ์</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100" data-testid={`alert-list-${alertTab}`}>
            {filteredAlerts.map((alert) => (
              <div
                key={alert.dedupe_key}
                className="py-3.5 px-3 -mx-3 rounded-xl hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-sm"
              >
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-mono font-bold text-slate-900">{alert.wo_code}</span>
                  <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                    {alert.asset_code}
                  </span>
                  <span className="text-slate-800 font-medium">{alert.asset_name}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-xs font-medium">
                    {alert.department}
                  </span>
                </div>
                <div className="flex items-center gap-4 justify-between md:justify-end">
                  <span className="text-slate-600 text-xs sm:text-sm font-medium">{alert.message}</span>
                  {onNavigateToWorkOrders && (
                    <button
                      type="button"
                      onClick={onNavigateToWorkOrders}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 whitespace-nowrap inline-flex items-center gap-1 cursor-pointer"
                    >
                      จัดการใบงาน <ArrowRight size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Analytics Section (Plan vs Actual & Department Breakdown) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Monthly Plan vs Actual Matrix */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  เปรียบเทียบแผน (Plan) กับปิดงานจริง (Act.) ปี {year}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">FM-QC-46 เป้าหมายรายเดือน เทียบกับงานที่ตรวจเสร็จสิ้น</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400">เป้าหมายทั้งปี: </span>
                <span className="text-xs font-mono font-bold text-slate-700">{totalPlanned} งาน</span>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200/70">
              <table className="w-full text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-600 border-b border-slate-200/70 font-semibold uppercase tracking-wider text-xs">
                    <th className="py-2.5 px-3 text-left w-24">รายการ</th>
                    {MONTH_LABELS.map((m, idx) => (
                      <th key={idx} className="py-2.5 px-1 text-center font-semibold">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  <tr className="hover:bg-slate-50/40 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-700 font-sans text-xs whitespace-nowrap">Plan (แผน)</td>
                    {(dashboard?.monthly_comparison || []).map((row) => (
                      <td key={row.month} className="py-2.5 px-1 text-center font-medium text-slate-600">
                        {row.planned || '-'}
                      </td>
                    ))}
                  </tr>
                  <tr className="hover:bg-slate-50/40 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-emerald-700 font-sans text-xs whitespace-nowrap">Act. (ปิดแล้ว)</td>
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
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  สรุปสถานะแยกตามแผนกเจ้าของเครื่องมือ
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">แจกแจงจำนวนเครื่องมือและสถานะใบงานตามแผนกรับผิดชอบ</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200/70">
              <table className="w-full text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-600 border-b border-slate-200/70 font-semibold uppercase tracking-wider text-xs">
                    <th className="py-2.5 px-3 text-left">แผนก</th>
                    <th className="py-2.5 px-2 text-right">เครื่องมือ</th>
                    <th className="py-2.5 px-2 text-right">ใบงานทั้งหมด</th>
                    <th className="py-2.5 px-2 text-right">ปิดแล้ว</th>
                    <th className="py-2.5 px-2 text-right">เลยกำหนด</th>
                    <th className="py-2.5 px-2 text-right">ระงับใช้</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-xs sm:text-sm">
                  {(dashboard?.department_breakdown || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-slate-400 font-sans">
                        ไม่มีข้อมูลแผนก
                      </td>
                    </tr>
                  ) : (
                    (dashboard?.department_breakdown || []).map((d) => (
                      <tr key={d.department} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-slate-900 font-sans">{d.department}</td>
                        <td className="py-2.5 px-2 text-right font-medium text-slate-700">{d.asset_count}</td>
                        <td className="py-2.5 px-2 text-right font-medium text-slate-700">{d.total_work_orders}</td>
                        <td className="py-2.5 px-2 text-right text-emerald-700 font-bold">{d.closed_work_orders}</td>
                        <td className="py-2.5 px-2 text-right text-amber-700 font-bold">{d.overdue_work_orders}</td>
                        <td className="py-2.5 px-2 text-right text-rose-600 font-bold">{d.on_hold_count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Notification Settings Modal */}
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
