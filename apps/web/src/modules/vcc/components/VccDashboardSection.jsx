import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bell,
  Download,
  Settings,
  Clock,
  RefreshCw,
  FileSpreadsheet,
  ArrowRight,
  LayoutDashboard,
  ShieldAlert,
  FileCheck2
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
import VccOnHoldTrackerTab from './VccOnHoldTrackerTab';
import VccComplianceReportTab from './VccComplianceReportTab';
import VccNotificationAuditTab from './VccNotificationAuditTab';
import MobileCollapsible from './MobileCollapsible';

const MAIN_TABS = [
  { id: 'OVERVIEW', label: 'ภาพรวม', icon: LayoutDashboard },
  { id: 'ON_HOLD', label: 'ระงับใช้และ NC', icon: ShieldAlert },
  { id: 'COMPLIANCE', label: 'รายงานตรวจสอบย้อนกลับ', icon: FileCheck2 },
  { id: 'NOTIFICATIONS', label: 'ประวัติการแจ้งเตือน', icon: Bell }
];

const ALERT_TABS = [
  { key: 'OVERDUE', label: 'เลยกำหนด', alertBadgeClass: 'bg-amber-100 text-amber-900' },
  { key: 'ON_HOLD', label: 'ระงับใช้', alertBadgeClass: 'bg-rose-100 text-rose-900' },
  { key: 'DUE_SOON', label: 'ใกล้ครบกำหนด', alertBadgeClass: 'bg-blue-100 text-blue-900' },
  { key: 'PENDING_REVIEW', label: 'รอตรวจรับ', alertBadgeClass: 'bg-indigo-100 text-indigo-900' }
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
 * Clean, Minimal, Professional Enterprise SaaS QMS Dashboard for VCC (Phase 3.3).
 */
export default function VccDashboardSection({ onNavigateToWorkOrders, onNavigateToAsset }) {
  const [mainTab, setMainTab] = useState('OVERVIEW');
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [year, setYear] = useState(currentYear);
  const [dashboard, setDashboard] = useState(null);
  const [pickedAlertTab, setAlertTab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [exportMsg, setExportMsg] = useState('');

  const availableYears = useMemo(() => {
    const list = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
    if (!list.includes(year)) list.push(year);
    return Array.from(new Set(list)).sort((a, b) => a - b);
  }, [currentYear, year]);

  // Settings Modal State
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [monthlyDueSoonText, setMonthlyDueSoonText] = useState('7, 3');
  const [monthlyOverdueText, setMonthlyOverdueText] = useState('1, 3, 7');
  const [annualDueSoonText, setAnnualDueSoonText] = useState('30, 14, 7');
  const [annualOverdueText, setAnnualOverdueText] = useState('1, 7, 14');
  const [certExpiringDaysText, setCertExpiringDaysText] = useState('60, 30, 15');
  const [reviewSlaDays, setReviewSlaDays] = useState(3);
  const [escalationL1Days, setEscalationL1Days] = useState(1);
  const [escalationL2Days, setEscalationL2Days] = useState(7);
  const [escalationL3Days, setEscalationL3Days] = useState(14);
  const [gracePeriodDays, setGracePeriodDays] = useState(3);
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
        setCertExpiringDaysText((s.cert_expiring_days || [60, 30, 15]).join(', '));
        setReviewSlaDays(s.review_sla_days || 3);
        setEscalationL1Days(s.escalation_l1_days ?? 1);
        setEscalationL2Days(s.escalation_l2_days ?? 7);
        setEscalationL3Days(s.escalation_l3_days ?? 14);
        setGracePeriodDays(s.acknowledgement_grace_period_days ?? 3);
      }
    } catch (err) {
      setDashboard(null);
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
        cert_expiring_days: parseDaysInput(certExpiringDaysText),
        review_sla_days: Number(reviewSlaDays),
        escalation_l1_days: Number(escalationL1Days),
        escalation_l2_days: Number(escalationL2Days),
        escalation_l3_days: Number(escalationL3Days),
        acknowledgement_grace_period_days: Number(gracePeriodDays)
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

  // The dashboard failed to load (server down, error): show that, not KPI cards full of zeros
  const loadFailed = !loading && !dashboard && Boolean(errorMsg);
  const eq = dashboard?.equipment_kpi || {};
  const wo = dashboard?.work_order_kpi || {};
  const certKpi = dashboard?.certificate_kpi || {};
  const allAlerts = useMemo(() => dashboard?.alerts || [], [dashboard?.alerts]);

  const countByAlertTab = useCallback(
    (tabKey) =>
      allAlerts.filter((a) => {
        if (tabKey === 'DUE_SOON') return a.alert_type === 'DUE_SOON' || a.alert_type === 'DUE_TODAY' || a.alert_type === 'CERT_EXPIRING';
        if (tabKey === 'OVERDUE') return a.alert_type === 'OVERDUE' || a.alert_type === 'CERT_EXPIRED';
        return a.alert_type === tabKey;
      }).length,
    [allAlerts]
  );

  // Opens on the first category that has work, unless the user has picked a tab
  const alertTab = pickedAlertTab ?? ALERT_TABS.find((t) => countByAlertTab(t.key) > 0)?.key ?? ALERT_TABS[0].key;

  const filteredAlerts = useMemo(() => {
    return allAlerts.filter((a) => {
      if (alertTab === 'DUE_SOON') return a.alert_type === 'DUE_SOON' || a.alert_type === 'DUE_TODAY' || a.alert_type === 'CERT_EXPIRING';
      if (alertTab === 'OVERDUE') return a.alert_type === 'OVERDUE' || a.alert_type === 'CERT_EXPIRED';
      return a.alert_type === alertTab;
    });
  }, [allAlerts, alertTab]);

  return (
    <div className="space-y-6 text-slate-800 w-full min-w-0" data-testid="vcc-dashboard-section">
      {/* 0. Top-Level Main Dashboard Navigation Tabs (Approach A) */}
      <div className="flex border-b border-slate-200 overflow-x-auto sm:overflow-visible">
        <nav className="-mb-px w-full grid grid-cols-2 gap-x-3 sm:w-auto sm:flex sm:space-x-6" aria-label="Dashboard Tabs">
          {MAIN_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = mainTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMainTab(tab.id)}
                data-testid={`main-tab-${tab.id}`}
                className={`py-3 px-1 inline-flex items-center justify-start gap-1.5 sm:gap-2 text-left leading-tight border-b-2 text-xs sm:text-sm font-semibold transition-colors cursor-pointer min-w-0 ${
                  isActive
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <Icon size={16} className="shrink-0" />
                <span className="truncate">{tab.label}</span>
                {tab.id === 'ON_HOLD' && (eq.on_hold_assets ?? 0) > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-xs font-bold bg-rose-100 text-rose-700 shrink-0">
                    {eq.on_hold_assets}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab 2: ON_HOLD / NC Tracker */}
      {mainTab === 'ON_HOLD' && (
        <VccOnHoldTrackerTab onNavigateToWorkOrder={onNavigateToWorkOrders} />
      )}

      {/* Tab 3: Compliance Report for Auditor */}
      {mainTab === 'COMPLIANCE' && (
        <VccComplianceReportTab />
      )}

      {/* Tab 4: Notification Audit & Escalation */}
      {mainTab === 'NOTIFICATIONS' && (
        <VccNotificationAuditTab />
      )}

      {/* Tab 1: Overview & Alerts */}
      {mainTab === 'OVERVIEW' && (
        <>
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
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y} (พ.ศ. {y + 543})
                    </option>
                  ))}
                </select>
              </div>

              <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 pl-3 border-l border-slate-200">
                <Clock size={13} className="text-slate-400 shrink-0" />
                <span>นับเลยกำหนดจากวันครบกำหนดเดิม ป้องกันประวัติสูญหายจากการเลื่อนกำหนด</span>
              </div>
            </div>

            <MobileCollapsible summary="ส่งออกรายงานและตั้งค่า">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportPlanCsv}
                data-testid="vcc-export-plan-csv-btn"
                className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
              >
                <FileSpreadsheet size={14} className="text-emerald-600 shrink-0" />
                <span>แผนประจำปี (CSV)</span>
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
            </MobileCollapsible>
          </div>

          {errorMsg && !loadFailed && (
            <div role="alert" className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm font-medium text-rose-700">
              {errorMsg}
            </div>
          )}

          {exportMsg && (
            <div data-testid="vcc-export-success-banner" className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-semibold text-emerald-800">
              {exportMsg}
            </div>
          )}

          {loadFailed ? (
            <div
              role="alert"
              data-testid="dashboard-load-failed"
              className="rounded-2xl bg-rose-50 border border-rose-200 px-6 py-10 text-center space-y-3"
            >
              <p className="text-base font-bold text-rose-800">โหลดข้อมูลภาพรวมไม่สำเร็จ</p>
              <p className="text-sm text-rose-700">{errorMsg}</p>
              <p className="text-xs text-rose-600">ตัวเลขบนหน้านี้ยังไม่ใช่ข้อมูลจริง กรุณาลองใหม่อีกครั้ง</p>
              <button
                type="button"
                onClick={loadData}
                className="h-9 px-4 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors cursor-pointer"
              >
                ลองใหม่อีกครั้ง
              </button>
            </div>
          ) : (
          <>
          {/* 2. Executive Metrics Strip (with Certificate & Overdue Invariance KPI) */}
          <VccMetricsStrip
            eq={eq}
            wo={wo}
            certKpi={certKpi}
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
                    className="py-3 px-2 rounded-xl hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-sm"
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
                      <div className="text-right">
                        <span className="text-slate-600 text-xs sm:text-sm font-medium block">{alert.message}</span>
                        {alert.recommended_action && (
                          <span className="text-xs text-indigo-600 font-medium block mt-0.5">
                            แนะนำ: {alert.recommended_action}
                          </span>
                        )}
                      </div>
                      {alert.wo_id || alert.work_order_id ? (
                        onNavigateToWorkOrders && (
                          <button
                            type="button"
                            onClick={() => onNavigateToWorkOrders(alert.wo_id || alert.work_order_id)}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 whitespace-nowrap inline-flex items-center gap-1 cursor-pointer"
                          >
                            จัดการใบงาน <ArrowRight size={12} />
                          </button>
                        )
                      ) : (
                        onNavigateToAsset ? (
                          <button
                            type="button"
                            onClick={() => onNavigateToAsset(alert.asset_id || alert.asset_code)}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 whitespace-nowrap inline-flex items-center gap-1 cursor-pointer"
                          >
                            ดูข้อมูลเครื่องมือ <ArrowRight size={12} />
                          </button>
                        ) : null
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

          </>
          )}

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
            certExpiringDaysText={certExpiringDaysText}
            setCertExpiringDaysText={setCertExpiringDaysText}
            reviewSlaDays={reviewSlaDays}
            setReviewSlaDays={setReviewSlaDays}
            escalationL1Days={escalationL1Days}
            setEscalationL1Days={setEscalationL1Days}
            escalationL2Days={escalationL2Days}
            setEscalationL2Days={setEscalationL2Days}
            escalationL3Days={escalationL3Days}
            setEscalationL3Days={setEscalationL3Days}
            gracePeriodDays={gracePeriodDays}
            setGracePeriodDays={setGracePeriodDays}
            saving={savingSettings}
          />
        </>
      )}
    </div>
  );
}
