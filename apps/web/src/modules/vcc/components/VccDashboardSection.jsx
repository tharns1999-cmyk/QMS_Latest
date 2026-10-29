import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bell,
  Download,
  Settings,
  Clock,
  RefreshCw,
  FileSpreadsheet,
  ArrowRight
} from 'lucide-react';
import {
  fetchVccDashboard,
  saveVccNotificationSettings,
  exportVccAnnualPlanCsv,
  exportVccWorkOrdersCsv
} from '../api/vccDashboardApi';
import DepartmentBadge from '../../../shared/components/ui/DepartmentBadge';
import VccMetricsStrip from './VccMetricsStrip';
import VccPlanActualChart from './VccPlanActualChart';
import VccDepartmentSummary from './VccDepartmentSummary';
import VccNotificationSettingsModal from './VccNotificationSettingsModal';

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

/**
 * VccDashboardSection
 * Clean, Minimal, Professional Enterprise SaaS QMS Dashboard for VCC.
 */
export default function VccDashboardSection({ onNavigateToWorkOrders }) {
  const [year, setYear] = useState(2026);
  const [dashboard, setDashboard] = useState(null);
  const [alertTab, setAlertTab] = useState('OVERDUE');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [exportMsg, setExportMsg] = useState('');

  // Settings Modal State
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
  const allAlerts = useMemo(() => dashboard?.alerts || [], [dashboard?.alerts]);

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

  return (
    <div className="space-y-6 text-slate-800" data-testid="vcc-dashboard-section">
      {/* 1. Header Toolbar (Clean Minimalist Action Bar) */}
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

          <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 pl-3 border-l border-slate-200">
            <Clock size={13} className="text-slate-400 shrink-0" />
            <span>เกณฑ์ On-Time: ปิดงาน (CLOSED) และเสร็จภายในกำหนด</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportPlanCsv}
            data-testid="vcc-export-plan-csv-btn"
            className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet size={14} className="text-emerald-600 shrink-0" />
            <span>แผน FM-QC-46 (CSV)</span>
          </button>

          <button
            type="button"
            onClick={handleExportWoCsv}
            data-testid="vcc-export-wo-csv-btn"
            className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
          >
            <Download size={14} className="text-sky-600 shrink-0" />
            <span>ใบงาน/ใบรับรอง (CSV)</span>
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            data-testid="vcc-open-notification-settings-btn"
            className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
          >
            <Settings size={14} className="text-slate-500 shrink-0" />
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

      {/* 2. Executive Metrics Strip */}
      <VccMetricsStrip
        eq={eq}
        wo={wo}
        reviewSlaDays={dashboard?.notification_settings?.review_sla_days ?? 3}
      />

      {/* 3. Actionable Alert Worklist */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <Bell size={17} className="text-slate-900 shrink-0" />
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

        {/* Compact Segmented Tabs with Underline */}
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
                  className={`text-xs font-mono font-medium px-1.5 py-0.2 rounded ${
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
                className="py-3 px-2.5 -mx-2.5 rounded-xl hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-sm"
              >
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-mono font-bold text-slate-900">{alert.wo_code}</span>
                  <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60">
                    {alert.asset_code}
                  </span>
                  <span className="text-slate-800 font-medium text-xs sm:text-sm">{alert.asset_name}</span>
                  <DepartmentBadge department={alert.department} />
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

      {/* 4. Analytics Section (Plan vs Actual Visual Chart & Department Summary) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* 12-Month Plan vs Actual Visual Chart */}
        <VccPlanActualChart
          monthlyComparison={dashboard?.monthly_comparison || []}
          year={year}
        />

        {/* Department Summary Compact Visualization */}
        <VccDepartmentSummary
          departmentBreakdown={dashboard?.department_breakdown || []}
        />
      </div>

      {/* 5. Notification Settings Modal */}
      <VccNotificationSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSubmit={handleSaveSettings}
        monthlyDueSoonText={monthlyDueSoonText}
        setMonthlyDueSoonText={setMonthlyDueSoonText}
        monthlyOverdueText={monthlyOverdueText}
        setMonthlyOverdueText={setMonthlyOverdueText}
        annualDueSoonText={annualDueSoonText}
        setAnnualDueSoonText={setAnnualDueSoonText}
        annualOverdueText={annualOverdueText}
        setAnnualOverdueText={setAnnualOverdueText}
        reviewSlaDays={reviewSlaDays}
        setReviewSlaDays={setReviewSlaDays}
        saving={savingSettings}
      />
    </div>
  );
}
