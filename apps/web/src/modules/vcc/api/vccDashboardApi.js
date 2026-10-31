import { apiGet, apiPut, apiBlob, isApiMode } from '../../../api/client';
import {
  readJson,
  writeJson,
  getLocalAssets,
  assertLocalDcc,
  assertLocalVccAccess,
  getLocalAudit,
  appendLocalAudit
} from './vccApi';
import { getLocalPlans, getLocalPlanItems } from './vccPlanApi';
import { getLocalWos } from './vccWorkOrderApi';

const STORAGE_NOTIFICATION_SETTINGS_KEY = 'qms-vcc-local-notification-settings-v1';

export const DEFAULT_VCC_NOTIFICATION_SETTINGS = {
  monthly_due_soon_days: [7, 3],
  monthly_overdue_days: [1, 3, 7],
  annual_due_soon_days: [30, 14, 7],
  annual_overdue_days: [1, 7, 14],
  review_sla_days: 3
};

const getLocalNotificationSettings = () =>
  readJson(STORAGE_NOTIFICATION_SETTINGS_KEY, () => ({ ...DEFAULT_VCC_NOTIFICATION_SETTINGS }));
const setLocalNotificationSettings = (obj) => writeJson(STORAGE_NOTIFICATION_SETTINGS_KEY, obj);

const sanitizeDaysArray = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0 || arr.length > 10) return null;
  const nums = arr.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 365);
  if (nums.length !== arr.length) return null;
  return [...new Set(nums)].sort((a, b) => b - a);
};

const diffDays = (targetDateStr, refDateStr) => {
  const t = Date.parse(`${String(targetDateStr).slice(0, 10)}T00:00:00Z`);
  const r = Date.parse(`${String(refDateStr).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t) || Number.isNaN(r)) return null;
  return Math.round((t - r) / 86400000);
};

const csvCell = (val) => {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  if (/^[=+\-@]/.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
};

export const fetchVccNotificationSettings = async () => {
  if (isApiMode) {
    const { settings } = await apiGet('/api/vcc/notification-settings');
    return settings;
  }
  assertLocalVccAccess();
  return getLocalNotificationSettings();
};

export const saveVccNotificationSettings = async (payload = {}) => {
  if (isApiMode) {
    const { settings } = await apiPut('/api/vcc/notification-settings', payload);
    return settings;
  }
  assertLocalDcc();
  const before = getLocalNotificationSettings();
  const monthlyDueSoon = payload.monthly_due_soon_days !== undefined
    ? sanitizeDaysArray(payload.monthly_due_soon_days)
    : before.monthly_due_soon_days;
  const monthlyOverdue = payload.monthly_overdue_days !== undefined
    ? sanitizeDaysArray(payload.monthly_overdue_days)?.sort((a, b) => a - b)
    : before.monthly_overdue_days;
  const annualDueSoon = payload.annual_due_soon_days !== undefined
    ? sanitizeDaysArray(payload.annual_due_soon_days)
    : before.annual_due_soon_days;
  const annualOverdue = payload.annual_overdue_days !== undefined
    ? sanitizeDaysArray(payload.annual_overdue_days)?.sort((a, b) => a - b)
    : before.annual_overdue_days;
  const reviewSlaDays = payload.review_sla_days !== undefined ? Number(payload.review_sla_days) : before.review_sla_days;

  if (!monthlyDueSoon || !monthlyOverdue || !annualDueSoon || !annualOverdue) {
    throw new Error('รายการวันแจ้งเตือนต้องเป็นตัวเลขจำนวนเต็มระหว่าง 1 ถึง 365 วัน');
  }
  if (!Number.isInteger(reviewSlaDays) || reviewSlaDays < 1 || reviewSlaDays > 60) {
    throw new Error('ระยะเวลา SLA รอตรวจรับต้องอยู่ระหว่าง 1 ถึง 60 วัน');
  }

  const next = {
    monthly_due_soon_days: monthlyDueSoon,
    monthly_overdue_days: monthlyOverdue,
    annual_due_soon_days: annualDueSoon,
    annual_overdue_days: annualOverdue,
    review_sla_days: reviewSlaDays
  };
  setLocalNotificationSettings(next);
  appendLocalAudit('VCC_NOTIFICATION_SETTINGS_UPDATED', { before, after: next });
  return next;
};

export const fetchVccDashboard = async ({ year = 2026, reference_date } = {}) => {
  if (isApiMode) {
    const params = new URLSearchParams({ year: String(year) });
    if (reference_date) params.set('reference_date', reference_date);
    return apiGet(`/api/vcc/dashboard?${params.toString()}`);
  }
  assertLocalVccAccess();
  const refDate = reference_date && /^\d{4}-\d{2}-\d{2}$/.test(reference_date)
    ? reference_date
    : new Date().toISOString().slice(0, 10);

  const notificationSettings = getLocalNotificationSettings();
  const allAssets = getLocalAssets();
  const allWos = getLocalWos();
  const allPlans = getLocalPlans();
  const allPlanItems = getLocalPlanItems();

  const assetMap = new Map(allAssets.map((a) => [a.id, a]));
  const planItemMap = new Map(allPlanItems.map((i) => [i.id, i]));

  const onHoldAssetIds = new Set(allWos.filter((w) => w.nc_status === 'OPEN').map((w) => w.asset_id));
  const individualAssets = allAssets.filter((a) => Number(a.is_group) === 0 || a.group_nature === 'COMPOSITE_SET');
  const activeGroups = allAssets.filter((a) => Number(a.is_group) === 1 && a.group_nature !== 'COMPOSITE_SET' && a.status === 'ACTIVE');

  const equipmentKpi = {
    total_assets: individualAssets.length,
    active_assets: individualAssets.filter((a) => a.status === 'ACTIVE' && !onHoldAssetIds.has(a.id)).length,
    on_hold_assets: onHoldAssetIds.size,
    retired_assets: individualAssets.filter((a) => a.status === 'RETIRED').length,
    composite_set_count: individualAssets.filter((a) => a.status === 'ACTIVE' && a.group_nature === 'COMPOSITE_SET').length,
    group_count: activeGroups.length
  };

  let dueIn7Days = 0;
  let dueIn30Days = 0;
  let overdueCount = 0;
  let pendingReviewCount = 0;
  let completedCount = 0;
  let passCount = 0;
  let failCount = 0;
  let onTimeCount = 0;

  const alerts = [];
  const seenDedupeKeys = new Set();
  const pushAlert = (alert) => {
    if (seenDedupeKeys.has(alert.dedupe_key)) return;
    seenDedupeKeys.add(alert.dedupe_key);
    alerts.push(alert);
  };

  for (const wo of allWos) {
    const asset = assetMap.get(wo.asset_id) || {};
    const planItem = planItemMap.get(wo.plan_item_id);

    if (wo.result_status === 'FAIL') failCount += 1;

    if (wo.nc_status === 'OPEN') {
      pushAlert({
        dedupe_key: `${wo.id}:ON_HOLD`,
        alert_type: 'ON_HOLD',
        severity: 'CRITICAL',
        wo_id: wo.id,
        wo_code: wo.wo_code,
        asset_code: asset.asset_code || '-',
        asset_name: asset.name || '-',
        department: asset.department || '-',
        due_date: wo.due_date,
        message: 'ระงับใช้งานชั่วคราว (ON_HOLD) — ผลตรวจไม่ผ่านเกณฑ์ รอผู้อนุมัติ L5+ ประเมินผลกระทบ'
      });
    }

    if (wo.status === 'CLOSED') {
      completedCount += 1;
      if (wo.result_status === 'PASS') passCount += 1;
      if (wo.performed_at && String(wo.performed_at).slice(0, 10) <= String(wo.due_date).slice(0, 10)) {
        onTimeCount += 1;
      }
      continue;
    }

    if (wo.status === 'CANCELLED') continue;

    if (wo.status === 'PENDING_REVIEW') {
      pendingReviewCount += 1;
      const waitDays = wo.performed_at ? Math.max(0, -diffDays(wo.performed_at, refDate)) : 0;
      const slaExceeded = waitDays >= notificationSettings.review_sla_days;
      pushAlert({
        dedupe_key: `${wo.id}:PENDING_REVIEW`,
        alert_type: 'PENDING_REVIEW',
        severity: slaExceeded ? 'HIGH' : 'MEDIUM',
        wo_id: wo.id,
        wo_code: wo.wo_code,
        asset_code: asset.asset_code || '-',
        asset_name: asset.name || '-',
        department: asset.department || '-',
        due_date: wo.due_date,
        sla_exceeded: slaExceeded,
        message: slaExceeded
          ? `รอผู้ตรวจรับเกิน SLA (${waitDays} วัน / เกณฑ์ ${notificationSettings.review_sla_days} วัน)`
          : `รอผู้ตรวจรับตรวจสอบผลและใบรับรอง (${wo.certificate_no || '-'})`
      });
      continue;
    }

    const daysUntilDue = diffDays(wo.due_date, refDate);
    if (daysUntilDue === null) continue;

    const isMonthly = String(planItem?.frequency_label || '').includes('เดือน');
    const dueSoonThresholds = isMonthly
      ? notificationSettings.monthly_due_soon_days
      : notificationSettings.annual_due_soon_days;
    const maxDueSoonWindow = Math.max(...dueSoonThresholds, 7);

    if (daysUntilDue < 0) {
      overdueCount += 1;
      const daysOverdue = Math.abs(daysUntilDue);
      pushAlert({
        dedupe_key: `${wo.id}:OVERDUE`,
        alert_type: 'OVERDUE',
        severity: 'HIGH',
        wo_id: wo.id,
        wo_code: wo.wo_code,
        asset_code: asset.asset_code || '-',
        asset_name: asset.name || '-',
        department: asset.department || '-',
        due_date: wo.due_date,
        days_overdue: daysOverdue,
        message: `เลยกำหนดสอบเทียบ ${daysOverdue} วัน (ครบกำหนด ${wo.due_date})`
      });
    } else {
      if (daysUntilDue <= 7) dueIn7Days += 1;
      if (daysUntilDue <= 30) dueIn30Days += 1;
      if (daysUntilDue <= maxDueSoonWindow) {
        pushAlert({
          dedupe_key: `${wo.id}:DUE_SOON`,
          alert_type: daysUntilDue === 0 ? 'DUE_TODAY' : 'DUE_SOON',
          severity: daysUntilDue <= 3 ? 'MEDIUM' : 'LOW',
          wo_id: wo.id,
          wo_code: wo.wo_code,
          asset_code: asset.asset_code || '-',
          asset_name: asset.name || '-',
          department: asset.department || '-',
          due_date: wo.due_date,
          days_until_due: daysUntilDue,
          message: daysUntilDue === 0
            ? `ครบกำหนดสอบเทียบวันนี้ (${wo.due_date})`
            : `ใกล้ครบกำหนดในอีก ${daysUntilDue} วัน (ครบกำหนด ${wo.due_date})`
        });
      }
    }
  }

  const approvedPlans = allPlans.filter((p) => Number(p.plan_year) === Number(year) && p.status === 'APPROVED');
  const approvedPlanIds = new Set(approvedPlans.map((p) => p.id));

  const monthlyComparison = Array.from({ length: 12 }, (_, idx) => ({
    month: idx + 1,
    planned: 0,
    actual_closed: 0
  }));

  for (const item of allPlanItems) {
    if (!approvedPlanIds.has(item.plan_id)) continue;
    for (const m of item.planned_months || []) {
      if (m >= 1 && m <= 12) monthlyComparison[m - 1].planned += 1;
    }
  }

  for (const wo of allWos) {
    const woYear = Number(String(wo.due_date || '').slice(0, 4));
    const m = wo.planned_month || Number(String(wo.due_date || '').slice(5, 7));
    if (woYear === Number(year) && m >= 1 && m <= 12 && wo.status === 'CLOSED' && wo.result_status === 'PASS') {
      monthlyComparison[m - 1].actual_closed += 1;
    }
  }

  const deptMap = new Map();
  for (const a of individualAssets) {
    if (!deptMap.has(a.department)) {
      deptMap.set(a.department, {
        department: a.department,
        asset_count: 0,
        total_work_orders: 0,
        closed_work_orders: 0,
        overdue_work_orders: 0,
        on_hold_count: 0
      });
    }
    const d = deptMap.get(a.department);
    d.asset_count += 1;
    if (onHoldAssetIds.has(a.id)) d.on_hold_count += 1;
  }

  for (const wo of allWos) {
    const asset = assetMap.get(wo.asset_id) || {};
    const dept = asset.department || 'QC';
    if (!deptMap.has(dept)) {
      deptMap.set(dept, {
        department: dept,
        asset_count: 0,
        total_work_orders: 0,
        closed_work_orders: 0,
        overdue_work_orders: 0,
        on_hold_count: 0
      });
    }
    const d = deptMap.get(dept);
    d.total_work_orders += 1;
    if (wo.status === 'CLOSED') d.closed_work_orders += 1;
    else if (wo.status !== 'CANCELLED' && wo.status !== 'PENDING_REVIEW') {
      const days = diffDays(wo.due_date, refDate);
      if (days !== null && days < 0) d.overdue_work_orders += 1;
    }
  }

  return {
    reference_date: refDate,
    year: Number(year),
    approved_plan_count: approvedPlans.length,
    equipment_kpi: equipmentKpi,
    work_order_kpi: {
      total_work_orders: allWos.length,
      due_in_7_days: dueIn7Days,
      due_in_30_days: dueIn30Days,
      overdue_count: overdueCount,
      pending_review_count: pendingReviewCount,
      completed_count: completedCount,
      pass_count: passCount,
      fail_count: failCount,
      on_time_count: onTimeCount,
      on_time_rate: completedCount > 0 ? Math.round((onTimeCount / completedCount) * 100) : 0
    },
    monthly_comparison: monthlyComparison,
    department_breakdown: Array.from(deptMap.values()),
    alerts,
    notification_settings: notificationSettings
  };
};

export const fetchVccAuditLog = async (category = 'VCC_') => {
  if (isApiMode) {
    const { history } = await apiGet(`/api/vcc/audit-log?category=${encodeURIComponent(category)}`);
    return history || [];
  }
  assertLocalVccAccess();
  const all = getLocalAudit();
  return all.filter((entry) => String(entry.action || '').startsWith(category));
};

export const exportVccAnnualPlanCsv = async (year = 2026) => {
  if (isApiMode) {
    const blob = await apiBlob(`/api/vcc/export/annual-plan?year=${encodeURIComponent(year)}`);
    return blob.text();
  }
  assertLocalVccAccess();
  const plans = getLocalPlans().filter((p) => Number(p.plan_year) === Number(year));
  if (plans.length === 0) throw new Error(`ไม่พบแผนประจำปี ${year}`);
  const plan = plans[0];
  const allAssets = new Map(getLocalAssets().map((a) => [a.id, a]));
  const items = getLocalPlanItems().filter((i) => i.plan_id === plan.id);
  const wos = getLocalWos().filter((w) => w.plan_id === plan.id && w.status === 'CLOSED' && w.result_status === 'PASS');

  const header = [
    'เอกสาร', 'ปี', 'Rev', 'สถานะแผน', 'ลำดับ', 'รหัสเครื่องมือ', 'ชื่อเครื่องมือวัด',
    'แผนก', 'หน่วยงานสอบเทียบ/ทวนสอบ', 'ความถี่', 'แถว (Plan/Act)',
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
    'เลขที่ใบรับรอง (เมื่อปิดงานแล้ว)', 'หมายเหตุ'
  ];
  const lines = [header.map(csvCell).join(',')];

  items.forEach((item, idx) => {
    const asset = allAssets.get(item.asset_id) || {};
    const matchedWos = wos.filter((w) => w.plan_item_id === item.id);
    const actMonths = new Set(matchedWos.map((w) => Number(w.planned_month)));
    const certs = matchedWos.map((w) => w.certificate_no).filter(Boolean).join('; ');
    const common = [
      plan.document_code, plan.plan_year, plan.revision, plan.status, idx + 1,
      asset.asset_code || '', asset.name || '', asset.department || '',
      item.provider_name, item.frequency_label
    ];
    const planCells = Array.from({ length: 12 }, (_, m) => ((item.planned_months || []).includes(m + 1) ? 'P' : ''));
    const actCells = Array.from({ length: 12 }, (_, m) => (actMonths.has(m + 1) ? 'A' : ''));
    lines.push([...common, 'Plan', ...planCells, '', item.remarks || ''].map(csvCell).join(','));
    lines.push([...common, 'Act.', ...actCells, certs, item.remarks || ''].map(csvCell).join(','));
  });

  appendLocalAudit('VCC_EXPORT_ANNUAL_PLAN', { year, plan_id: plan.id, item_count: items.length });
  return `\uFEFF${lines.join('\r\n')}`;
};

export const exportVccWorkOrdersCsv = async () => {
  if (isApiMode) {
    const blob = await apiBlob('/api/vcc/export/work-orders');
    return blob.text();
  }
  assertLocalVccAccess();
  const allAssets = new Map(getLocalAssets().map((a) => [a.id, a]));
  const wos = getLocalWos();
  const header = [
    'เลขที่ใบสั่งงาน', 'รหัสเครื่องมือ', 'ชื่อเครื่องมือวัด', 'แผนก', 'หน่วยงานสอบเทียบ/ทวนสอบ',
    'เดือนตามแผน', 'วันครบกำหนดเดิม', 'วันครบกำหนดปัจจุบัน', 'วันที่ปฏิบัติงานจริง',
    'ผลการตรวจ', 'เลขที่ใบรับรอง', 'เกณฑ์ยอมรับ', 'สถานะใบสั่งงาน', 'สถานะระงับใช้ (NC)'
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const w of wos) {
    const asset = allAssets.get(w.asset_id) || {};
    lines.push([
      w.wo_code, asset.asset_code || '', asset.name || '', asset.department || '',
      w.provider_name, w.planned_month || '', w.original_due_date, w.due_date,
      w.performed_at || '', w.result_status, w.certificate_no || '',
      w.acceptance_criteria || '', w.status, w.nc_status || ''
    ].map(csvCell).join(','));
  }
  appendLocalAudit('VCC_EXPORT_WORK_ORDERS', { count: wos.length });
  return `\uFEFF${lines.join('\r\n')}`;
};
