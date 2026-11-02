import { requireVccAccess, requireDccOnly } from './vccAuth.js';
import { isUserAuthorizedForPlanDept, getUserDepartments } from './vccPlans.js';

// Same range the plan list accepts. Empty means "use the current year in Bangkok" (a plain getFullYear() lags a day behind New Year there).
const parseYearParam = (raw) => {
  if (raw === undefined || raw === '') return new Date(Date.now() + 7 * 3600 * 1000).getUTCFullYear();
  const y = Number(raw);
  return Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : null;
};
const INVALID_YEAR = { error: 'ปีไม่ถูกต้อง (ต้องเป็นตัวเลขปี ค.ศ. 2000–2100)' };

const NOW = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')";
const DCC_ONLY = { error: 'เฉพาะเจ้าหน้าที่ DCC เท่านั้นที่ได้รับอนุญาตให้ใช้งานส่วนนี้' };

export const DEFAULT_NOTIFICATION_SETTINGS = {
  monthly_due_soon_days: [7, 3],
  monthly_overdue_days: [1, 3, 7],
  annual_due_soon_days: [30, 14, 7],
  annual_overdue_days: [1, 7, 14],
  review_sla_days: 3,
  overdue_escalation_days_l2: 7,
  overdue_escalation_days_l3: 14,
  on_hold_escalation_days: 14,
  acknowledgement_grace_days: 3,
  cert_expiring_days: [60, 30]
};

export const loadNotificationSettings = async (db) => {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = 'vcc_notification_settings'")
    .first()
    .catch(() => null);
  if (!row?.value) return { ...DEFAULT_NOTIFICATION_SETTINGS };
  try {
    const parsed = JSON.parse(row.value);
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
};

const sanitizeDaysArray = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0 || arr.length > 10) return null;
  const nums = arr.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 365);
  if (nums.length !== arr.length) return null;
  return [...new Set(nums)].sort((a, b) => b - a);
};

// Escape CSV cell and guard against spreadsheet formula injection (=, +, -, @)
const csvCell = (val) => {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  if (/^[=+\-@]/.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
};

const diffDays = (targetDateStr, refDateStr) => {
  const t = Date.parse(`${String(targetDateStr).slice(0, 10)}T00:00:00Z`);
  const r = Date.parse(`${String(refDateStr).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t) || Number.isNaN(r)) return null;
  return Math.round((t - r) / 86400000);
};

export const registerVccDashboardRoutes = (app, { requireAuth, audit }) => {
  app.get('/api/vcc/notification-settings', requireAuth, requireVccAccess, async (c) => {
    const settings = await loadNotificationSettings(c.env.DB);
    return c.json({ settings });
  });

  app.put('/api/vcc/notification-settings', requireAuth, requireDccOnly, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const before = await loadNotificationSettings(db);

    const monthlyDueSoon = body.monthly_due_soon_days !== undefined
      ? sanitizeDaysArray(body.monthly_due_soon_days)
      : before.monthly_due_soon_days;
    const monthlyOverdue = body.monthly_overdue_days !== undefined
      ? sanitizeDaysArray(body.monthly_overdue_days)?.sort((a, b) => a - b)
      : before.monthly_overdue_days;
    const annualDueSoon = body.annual_due_soon_days !== undefined
      ? sanitizeDaysArray(body.annual_due_soon_days)
      : before.annual_due_soon_days;
    const annualOverdue = body.annual_overdue_days !== undefined
      ? sanitizeDaysArray(body.annual_overdue_days)?.sort((a, b) => a - b)
      : before.annual_overdue_days;
    const reviewSlaDays = body.review_sla_days !== undefined ? Number(body.review_sla_days) : before.review_sla_days;
    const l2Escalation = body.overdue_escalation_days_l2 !== undefined ? Number(body.overdue_escalation_days_l2) : (before.overdue_escalation_days_l2 || 7);
    const l3Escalation = body.overdue_escalation_days_l3 !== undefined ? Number(body.overdue_escalation_days_l3) : (before.overdue_escalation_days_l3 || 14);
    const onHoldEscalation = body.on_hold_escalation_days !== undefined ? Number(body.on_hold_escalation_days) : (before.on_hold_escalation_days || 14);
    const graceDays = body.acknowledgement_grace_days !== undefined ? Number(body.acknowledgement_grace_days) : (before.acknowledgement_grace_days || 3);
    const certExpiring = body.cert_expiring_days !== undefined
      ? sanitizeDaysArray(body.cert_expiring_days)
      : (before.cert_expiring_days || [60, 30]);

    if (!monthlyDueSoon || !monthlyOverdue || !annualDueSoon || !annualOverdue || !certExpiring) {
      return c.json({ error: 'รายการวันแจ้งเตือนต้องเป็นตัวเลขจำนวนเต็มระหว่าง 1 ถึง 365 วัน' }, 400);
    }
    if (!Number.isInteger(reviewSlaDays) || reviewSlaDays < 1 || reviewSlaDays > 60) {
      return c.json({ error: 'ระยะเวลา SLA รอตรวจรับต้องอยู่ระหว่าง 1 ถึง 60 วัน' }, 400);
    }
    if (!Number.isInteger(l2Escalation) || l2Escalation < 1 || l2Escalation > 60) {
      return c.json({ error: 'เกณฑ์ยกระดับ Overdue L2 ต้องเป็นตัวเลขจำนวนเต็มระหว่าง 1 ถึง 60 วัน' }, 400);
    }
    if (!Number.isInteger(l3Escalation) || l3Escalation < l2Escalation || l3Escalation > 180) {
      return c.json({ error: 'เกณฑ์ยกระดับ Overdue L3 ต้องมากกว่าหรือเท่ากับเกณฑ์ L2 และไม่เกิน 180 วัน' }, 400);
    }
    if (!Number.isInteger(onHoldEscalation) || onHoldEscalation < 1 || onHoldEscalation > 90) {
      return c.json({ error: 'เกณฑ์ยกระดับ ON_HOLD ต้องเป็นตัวเลขจำนวนเต็มระหว่าง 1 ถึง 90 วัน' }, 400);
    }
    if (!Number.isInteger(graceDays) || graceDays < 1 || graceDays > 30) {
      return c.json({ error: 'ระยะเวลาผ่อนผันการรับทราบต้องอยู่ระหว่าง 1 ถึง 30 วัน' }, 400);
    }

    const updated = {
      monthly_due_soon_days: monthlyDueSoon,
      monthly_overdue_days: monthlyOverdue,
      annual_due_soon_days: annualDueSoon,
      annual_overdue_days: annualOverdue,
      review_sla_days: reviewSlaDays,
      overdue_escalation_days_l2: l2Escalation,
      overdue_escalation_days_l3: l3Escalation,
      on_hold_escalation_days: onHoldEscalation,
      acknowledgement_grace_days: graceDays,
      cert_expiring_days: certExpiring
    };

    await db.batch([
      db.prepare(`
        INSERT INTO settings (key, value, updated_at, updated_by)
        VALUES ('vcc_notification_settings', ?, ${NOW}, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = ${NOW},
          updated_by = excluded.updated_by
      `).bind(JSON.stringify(updated), user.id),
      audit(db, user.id, 'VCC_NOTIFICATION_SETTINGS_UPDATED', { before, after: updated })
    ]);

    return c.json({ settings: updated });
  });

  app.get('/api/vcc/dashboard', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const year = parseYearParam(c.req.query('year'));
    if (year === null) return c.json(INVALID_YEAR, 400);
    const refDateQuery = c.req.query('reference_date');
    const refDate = refDateQuery && /^\d{4}-\d{2}-\d{2}$/.test(refDateQuery)
      ? refDateQuery
      : new Date().toISOString().slice(0, 10);

    const isDccUser = Boolean(user.isDcc || user.is_dcc);
    const isQmrUser = Boolean(user.isQmr || user.is_qmr);
    const userLevel = Number(user.approval_level ?? user.approvalLevel ?? 0);
    const hasGlobalAccess = isDccUser || isQmrUser || userLevel >= 6;
    const userDepts = getUserDepartments(user);

    const queryDept = c.req.query('department') ? String(c.req.query('department')).trim().toUpperCase() : null;
    if (queryDept && !isUserAuthorizedForPlanDept(user, queryDept)) {
      return c.json({ error: `ไม่มีสิทธิ์เข้าถึงข้อมูลแผนก ${queryDept}` }, 403);
    }

    const isDeptAllowed = (d) => {
      const deptUpper = String(d || '').trim().toUpperCase();
      if (queryDept) return deptUpper === queryDept;
      if (hasGlobalAccess) return true;
      return userDepts.includes(deptUpper);
    };

    const notificationSettings = await loadNotificationSettings(db);

    const { results: rawAssetRows } = await db.prepare('SELECT id, asset_code, name, department, is_group, group_nature, status, location, asset_type FROM vcc_assets').all();
    const assetRows = rawAssetRows.filter((a) => isDeptAllowed(a.department));

    const { results: rawWoRows } = await db
      .prepare(
        `SELECT w.*, a.asset_code, a.name AS asset_name, a.department, a.status AS asset_status,
                a.location, a.asset_type, pi.frequency_label
         FROM vcc_work_orders w
         JOIN vcc_assets a ON a.id = w.asset_id
         LEFT JOIN vcc_annual_plan_items pi ON pi.id = w.plan_item_id
         ORDER BY w.due_date ASC, w.wo_code ASC`
      )
      .all();
    const woRows = rawWoRows.filter((w) => isDeptAllowed(w.department));

    const onHoldAssetIds = new Set(woRows.filter((w) => w.nc_status === 'OPEN').map((w) => w.asset_id));
    for (const a of assetRows) {
      if (a.status === 'ON_HOLD') onHoldAssetIds.add(a.id);
    }

    const calibratableAssets = assetRows.filter((a) => a.is_group === 0 || a.group_nature === 'COMPOSITE_SET');
    const activeGroups = assetRows.filter((a) => a.is_group === 1 && a.group_nature !== 'COMPOSITE_SET' && a.status === 'ACTIVE');

    // Distinct tracking for Equipment vs Work Orders
    const assetsWithOverdue = new Set();
    const assetsWithDueSoon = new Set();
    const assetsCompletedPass = new Set();
    const latestCertPerAsset = new Map();

    // Non-overlapping Due Soon buckets (0-7, 8-15, 16-30 days)
    let due0To7Days = 0;
    let due8To15Days = 0;
    let due16To30Days = 0;

    let overdueCount = 0;
    let overdueCurrentCount = 0;
    let rescheduledOverdueCount = 0;
    let pendingReviewCount = 0;
    let completedCount = 0;
    let passCount = 0;
    let failCount = 0;
    let onHoldWoCount = 0;
    let onTimeCount = 0;

    const alerts = [];
    const seenDedupeKeys = new Set();

    const pushAlert = (alert) => {
      if (seenDedupeKeys.has(alert.dedupe_key)) return;
      seenDedupeKeys.add(alert.dedupe_key);
      alerts.push(alert);
    };

    for (const wo of woRows) {
      if (wo.result_status === 'FAIL') failCount += 1;

      if (wo.nc_status === 'OPEN') {
        onHoldWoCount += 1;
        pushAlert({
          dedupe_key: `${wo.id}:ON_HOLD`,
          alert_type: 'ON_HOLD',
          severity: 'CRITICAL',
          wo_id: wo.id,
          wo_code: wo.wo_code,
          asset_id: wo.asset_id,
          asset_code: wo.asset_code,
          asset_name: wo.asset_name,
          department: wo.department,
          due_date: wo.due_date,
          required_due_date: wo.required_due_date || wo.original_due_date || wo.due_date,
          message: 'ระงับใช้งานชั่วคราว (ON_HOLD) — ผลตรวจไม่ผ่านเกณฑ์ รอผู้อนุมัติ L5+ ประเมินผลกระทบ',
          recommended_action: 'ผู้มีอำนาจระดับ L5+ ทำการประเมินผลกระทบย้อนหลังและดำเนินการปลดระงับ หรือเปิดใบสั่งงานแก้ไข'
        });
      }

      // Track latest certificate validity per asset
      if (wo.certificate_valid_until) {
        const existingCert = latestCertPerAsset.get(wo.asset_id);
        if (!existingCert || (wo.performed_at && (!existingCert.performed_at || wo.performed_at > existingCert.performed_at))) {
          latestCertPerAsset.set(wo.asset_id, {
            asset_id: wo.asset_id,
            asset_code: wo.asset_code,
            asset_name: wo.asset_name,
            department: wo.department,
            certificate_no: wo.certificate_no,
            certificate_valid_until: wo.certificate_valid_until,
            performed_at: wo.performed_at
          });
        }
      }

      if (wo.status === 'CLOSED') {
        completedCount += 1;
        if (wo.result_status === 'PASS') {
          passCount += 1;
          assetsCompletedPass.add(wo.asset_id);
        }
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
          asset_id: wo.asset_id,
          asset_code: wo.asset_code,
          asset_name: wo.asset_name,
          department: wo.department,
          due_date: wo.due_date,
          required_due_date: wo.required_due_date || wo.original_due_date || wo.due_date,
          sla_exceeded: slaExceeded,
          message: slaExceeded
            ? `รอผู้ตรวจรับเกิน SLA (${waitDays} วัน / เกณฑ์ ${notificationSettings.review_sla_days} วัน)`
            : `รอผู้ตรวจรับตรวจสอบผลและใบรับรอง (${wo.certificate_no || '-'})`,
          recommended_action: 'ผู้ตรวจรับระดับ L4+ ดำเนินการตรวจสอบผลและลงนามปิดงาน'
        });
        continue;
      }

      // Active work orders: SCHEDULED, OPEN, IN_PROGRESS, REJECTED
      const requiredDueDate = wo.required_due_date || wo.original_due_date || wo.due_date;
      const currentDueDate = wo.due_date;
      const daysUntilRequired = diffDays(requiredDueDate, refDate);
      const daysUntilCurrent = diffDays(currentDueDate, refDate);
      const isRescheduled = String(currentDueDate) !== String(requiredDueDate);

      // Overdue is strictly evaluated against required_due_date (standard baseline)
      if (daysUntilRequired !== null && daysUntilRequired < 0) {
        overdueCount += 1;
        assetsWithOverdue.add(wo.asset_id);
        const daysOverdue = Math.abs(daysUntilRequired);

        if (isRescheduled) {
          rescheduledOverdueCount += 1;
          pushAlert({
            dedupe_key: `${wo.id}:OVERDUE_REQUIRED`,
            alert_type: 'OVERDUE',
            severity: 'HIGH',
            wo_id: wo.id,
            wo_code: wo.wo_code,
            asset_id: wo.asset_id,
            asset_code: wo.asset_code,
            asset_name: wo.asset_name,
            department: wo.department,
            due_date: currentDueDate,
            required_due_date: requiredDueDate,
            days_overdue: daysOverdue,
            is_rescheduled: true,
            message: `เลยกำหนดตามรอบมาตรฐาน ${daysOverdue} วัน (เกณฑ์เดิม ${requiredDueDate}, กำหนดเลื่อน ${currentDueDate})`,
            recommended_action: 'เร่งดำเนินการสอบเทียบเครื่องมือ เนื่องจากเลยรอบมาตรฐานประจำปี'
          });
        } else {
          pushAlert({
            dedupe_key: `${wo.id}:OVERDUE`,
            alert_type: 'OVERDUE',
            severity: 'HIGH',
            wo_id: wo.id,
            wo_code: wo.wo_code,
            asset_id: wo.asset_id,
            asset_code: wo.asset_code,
            asset_name: wo.asset_name,
            department: wo.department,
            due_date: currentDueDate,
            required_due_date: requiredDueDate,
            days_overdue: daysOverdue,
            is_rescheduled: false,
            message: `เลยกำหนดสอบเทียบ ${daysOverdue} วัน (ครบกำหนด ${requiredDueDate})`,
            recommended_action: 'เร่งส่งเครื่องมือสอบเทียบหรือบันทึกผลการสอบเทียบทันที'
          });
        }
      } else if (daysUntilCurrent !== null && daysUntilCurrent < 0) {
        overdueCount += 1;
        overdueCurrentCount += 1;
        assetsWithOverdue.add(wo.asset_id);
        const daysOverdue = Math.abs(daysUntilCurrent);
        pushAlert({
          dedupe_key: `${wo.id}:OVERDUE_CURRENT`,
          alert_type: 'OVERDUE',
          severity: 'HIGH',
          wo_id: wo.id,
          wo_code: wo.wo_code,
          asset_id: wo.asset_id,
          asset_code: wo.asset_code,
          asset_name: wo.asset_name,
          department: wo.department,
          due_date: currentDueDate,
          required_due_date: requiredDueDate,
          days_overdue: daysOverdue,
          is_rescheduled: isRescheduled,
          message: `เลยกำหนดสอบเทียบตามวันนัดหมาย ${daysOverdue} วัน (กำหนดส่ง ${currentDueDate})`,
          recommended_action: 'เร่งติดตามห้องปฏิบัติการหรือผู้สอบเทียบเพื่อนำส่งผลตรวจ'
        });
      } else if (daysUntilCurrent !== null) {
        // Non-overlapping Due Soon buckets (0-7, 8-15, 16-30 days)
        if (daysUntilCurrent >= 0 && daysUntilCurrent <= 7) {
          due0To7Days += 1;
          assetsWithDueSoon.add(wo.asset_id);
          pushAlert({
            dedupe_key: `${wo.id}:DUE_SOON:0_7`,
            alert_type: daysUntilCurrent === 0 ? 'DUE_TODAY' : 'DUE_SOON',
            severity: daysUntilCurrent <= 3 ? 'HIGH' : 'MEDIUM',
            wo_id: wo.id,
            wo_code: wo.wo_code,
            asset_id: wo.asset_id,
            asset_code: wo.asset_code,
            asset_name: wo.asset_name,
            department: wo.department,
            due_date: currentDueDate,
            required_due_date: requiredDueDate,
            days_until_due: daysUntilCurrent,
            time_bucket: '0_7',
            message: daysUntilCurrent === 0
              ? `ครบกำหนดสอบเทียบวันนี้ (${currentDueDate})`
              : `ใกล้ครบกำหนดในอีก ${daysUntilCurrent} วัน (ครบกำหนด ${currentDueDate})`,
            recommended_action: 'เตรียมความพร้อมเครื่องมือวัดและส่งสอบเทียบตามแผน'
          });
        } else if (daysUntilCurrent >= 8 && daysUntilCurrent <= 15) {
          due8To15Days += 1;
          assetsWithDueSoon.add(wo.asset_id);
          pushAlert({
            dedupe_key: `${wo.id}:DUE_SOON:8_15`,
            alert_type: 'DUE_SOON',
            severity: 'MEDIUM',
            wo_id: wo.id,
            wo_code: wo.wo_code,
            asset_id: wo.asset_id,
            asset_code: wo.asset_code,
            asset_name: wo.asset_name,
            department: wo.department,
            due_date: currentDueDate,
            required_due_date: requiredDueDate,
            days_until_due: daysUntilCurrent,
            time_bucket: '8_15',
            message: `ครบกำหนดสอบเทียบในอีก ${daysUntilCurrent} วัน (ครบกำหนด ${currentDueDate})`,
            recommended_action: 'ประสานงานห้องปฏิบัติการหรือช่างสอบเทียบเพื่อเตรียมการ'
          });
        } else if (daysUntilCurrent >= 16 && daysUntilCurrent <= 30) {
          due16To30Days += 1;
          assetsWithDueSoon.add(wo.asset_id);
          pushAlert({
            dedupe_key: `${wo.id}:DUE_SOON:16_30`,
            alert_type: 'DUE_SOON',
            severity: 'LOW',
            wo_id: wo.id,
            wo_code: wo.wo_code,
            asset_id: wo.asset_id,
            asset_code: wo.asset_code,
            asset_name: wo.asset_name,
            department: wo.department,
            due_date: currentDueDate,
            required_due_date: requiredDueDate,
            days_until_due: daysUntilCurrent,
            time_bucket: '16_30',
            message: `มีแผนสอบเทียบในอีก ${daysUntilCurrent} วัน (ครบกำหนด ${currentDueDate})`,
            recommended_action: 'ตรวจสอบความพร้อมของเครื่องมือตามแผนงานล่วงหน้า'
          });
        }
      }
    }

    // Process Certificate Expiry separately from Calibration Due Date
    let certValidCount = 0;
    let certExpiring0To30Days = 0;
    let certExpiring31To60Days = 0;
    let certExpiredCount = 0;

    for (const [assetId, certInfo] of latestCertPerAsset.entries()) {
      const daysCert = diffDays(certInfo.certificate_valid_until, refDate);
      if (daysCert === null) continue;

      if (daysCert < 0) {
        certExpiredCount += 1;
        pushAlert({
          dedupe_key: `${assetId}:CERT_EXPIRED:${certInfo.certificate_no || 'NA'}`,
          alert_type: 'CERT_EXPIRED',
          severity: 'CRITICAL',
          asset_id: assetId,
          asset_code: certInfo.asset_code,
          asset_name: certInfo.asset_name,
          department: certInfo.department,
          certificate_no: certInfo.certificate_no,
          certificate_valid_until: certInfo.certificate_valid_until,
          days_until_cert_expiry: daysCert,
          message: `ใบรับรองการสอบเทียบ (${certInfo.certificate_no || '-'}) หมดอายุแล้ว ${Math.abs(daysCert)} วัน (หมดอายุ ${certInfo.certificate_valid_until})`,
          recommended_action: 'ต้องดำเนินการสอบเทียบใหม่และขอใบรับรองฉบับปัจจุบันทันที'
        });
      } else if (daysCert >= 0 && daysCert <= 30) {
        certExpiring0To30Days += 1;
        pushAlert({
          dedupe_key: `${assetId}:CERT_EXPIRING_30:${certInfo.certificate_no || 'NA'}`,
          alert_type: 'CERT_EXPIRING',
          severity: 'HIGH',
          asset_id: assetId,
          asset_code: certInfo.asset_code,
          asset_name: certInfo.asset_name,
          department: certInfo.department,
          certificate_no: certInfo.certificate_no,
          certificate_valid_until: certInfo.certificate_valid_until,
          days_until_cert_expiry: daysCert,
          message: `ใบรับรองการสอบเทียบ (${certInfo.certificate_no || '-'}) จะหมดอายุในอีก ${daysCert} วัน (หมดอายุ ${certInfo.certificate_valid_until})`,
          recommended_action: 'วางแผนส่งสอบเทียบเพื่อต่ออายุใบรับรองก่อนหมดอายุ'
        });
      } else if (daysCert >= 31 && daysCert <= 60) {
        certExpiring31To60Days += 1;
        pushAlert({
          dedupe_key: `${assetId}:CERT_EXPIRING_60:${certInfo.certificate_no || 'NA'}`,
          alert_type: 'CERT_EXPIRING',
          severity: 'MEDIUM',
          asset_id: assetId,
          asset_code: certInfo.asset_code,
          asset_name: certInfo.asset_name,
          department: certInfo.department,
          certificate_no: certInfo.certificate_no,
          certificate_valid_until: certInfo.certificate_valid_until,
          days_until_cert_expiry: daysCert,
          message: `ใบรับรองการสอบเทียบ (${certInfo.certificate_no || '-'}) จะหมดอายุในอีก ${daysCert} วัน (หมดอายุ ${certInfo.certificate_valid_until})`,
          recommended_action: 'เตรียมการจัดทำแผนหรือติดต่อห้องแล็บล่วงหน้า'
        });
      } else {
        certValidCount += 1;
      }
    }

    const equipmentKpi = {
      total_assets: calibratableAssets.length,
      active_assets: calibratableAssets.filter((a) => a.status === 'ACTIVE' && !onHoldAssetIds.has(a.id)).length,
      on_hold_assets: onHoldAssetIds.size,
      retired_assets: calibratableAssets.filter((a) => a.status === 'RETIRED').length,
      composite_set_count: calibratableAssets.filter((a) => a.status === 'ACTIVE' && a.group_nature === 'COMPOSITE_SET').length,
      group_count: activeGroups.length,
      equipment_overdue_count: assetsWithOverdue.size,
      equipment_due_soon_count: Array.from(assetsWithDueSoon).filter((id) => !assetsWithOverdue.has(id)).length,
      equipment_compliant_count: calibratableAssets.filter((a) => a.status === 'ACTIVE' && !onHoldAssetIds.has(a.id) && !assetsWithOverdue.has(a.id) && assetsCompletedPass.has(a.id)).length
    };

    // Monthly Plan vs Act for selected year (only CURRENT APPROVED plans count toward official Plan)
    const { results: rawApprovedPlans } = await db
      .prepare("SELECT id, plan_year, department, revision, status FROM vcc_annual_plans WHERE plan_year = ? AND status = 'APPROVED' AND (effective_status = 'CURRENT' OR (effective_status IS NULL AND is_current = 1))")
      .bind(year)
      .all();
    const approvedPlans = rawApprovedPlans.filter((p) => isDeptAllowed(p.department));

    const monthlyComparison = Array.from({ length: 12 }, (_, idx) => ({
      month: idx + 1,
      planned: 0,
      actual_closed: 0
    }));

    for (const plan of approvedPlans) {
      const { results: planItems } = await db
        .prepare('SELECT id, planned_months FROM vcc_annual_plan_items WHERE plan_id = ?')
        .bind(plan.id)
        .all();

      for (const item of planItems) {
        let months = [];
        try {
          months = JSON.parse(item.planned_months || '[]');
        } catch {
          months = [];
        }
        for (const m of months) {
          if (m >= 1 && m <= 12) monthlyComparison[m - 1].planned += 1;
        }
      }
    }

    for (const wo of woRows) {
      const woYear = Number(String(wo.due_date || '').slice(0, 4));
      const m = wo.planned_month || Number(String(wo.due_date || '').slice(5, 7));
      if (woYear === year && m >= 1 && m <= 12 && wo.status === 'CLOSED' && wo.result_status === 'PASS') {
        monthlyComparison[m - 1].actual_closed += 1;
      }
    }

    // Department summary (calibratable units)
    const deptMap = new Map();
    for (const a of calibratableAssets) {
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

    for (const wo of woRows) {
      if (!deptMap.has(wo.department)) {
        deptMap.set(wo.department, {
          department: wo.department,
          asset_count: 0,
          total_work_orders: 0,
          closed_work_orders: 0,
          overdue_work_orders: 0,
          on_hold_count: 0
        });
      }
      const d = deptMap.get(wo.department);
      d.total_work_orders += 1;
      if (wo.status === 'CLOSED') {
        d.closed_work_orders += 1;
      } else if (wo.status !== 'CANCELLED' && wo.status !== 'PENDING_REVIEW') {
        const reqDue = wo.required_due_date || wo.original_due_date || wo.due_date;
        const days = diffDays(reqDue, refDate);
        if (days !== null && days < 0) d.overdue_work_orders += 1;
      }
    }

    return c.json({
      reference_date: refDate,
      year,
      approved_plan_count: approvedPlans.length,
      equipment_kpi: equipmentKpi,
      work_order_kpi: {
        total_work_orders: woRows.length,
        due_0_7_days: due0To7Days,
        due_8_15_days: due8To15Days,
        due_16_30_days: due16To30Days,
        due_in_7_days: due0To7Days,
        due_in_30_days: due0To7Days + due8To15Days + due16To30Days,
        total_due_soon_30_days: due0To7Days + due8To15Days + due16To30Days,
        overdue_count: overdueCount,
        overdue_current_count: overdueCurrentCount,
        rescheduled_overdue_count: rescheduledOverdueCount,
        pending_review_count: pendingReviewCount,
        completed_count: completedCount,
        pass_count: passCount,
        fail_count: failCount,
        on_hold_wo_count: onHoldWoCount,
        on_time_count: onTimeCount,
        on_time_rate: completedCount > 0 ? Math.round((onTimeCount / completedCount) * 100) : 0
      },
      certificate_kpi: {
        total_monitored_certificates: latestCertPerAsset.size,
        cert_valid_count: certValidCount,
        cert_expiring_0_30_days: certExpiring0To30Days,
        cert_expiring_31_60_days: certExpiring31To60Days,
        cert_expired_count: certExpiredCount,
        total_expiring_soon: certExpiring0To30Days + certExpiring31To60Days
      },
      monthly_comparison: monthlyComparison,
      department_breakdown: Array.from(deptMap.values()),
      alerts,
      notification_settings: notificationSettings
    });
  });

  // Tracking endpoint for ON_HOLD equipment and NC work orders
  app.get('/api/vcc/on-hold-tracker', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const filterDept = c.req.query('department') ? String(c.req.query('department')).trim().toUpperCase() : null;
    const refDate = c.req.query('reference_date') || new Date().toISOString().slice(0, 10);

    const { results } = await db.prepare(`
      SELECT
        w.id AS wo_id, w.wo_code, w.status AS wo_status, w.result_status, w.result_remarks,
        w.acceptance_criteria, w.due_date, w.performed_at, w.performed_by, w.nc_status,
        w.nc_impact_assessment,
        w.is_amended, w.amendment_reason,
        a.id AS asset_id, a.asset_code, a.name AS asset_name, a.asset_type,
        a.department, a.location, a.status AS asset_status,
        u_perf.name AS performed_by_name,
        u_rev.name AS reviewed_by_name
      FROM vcc_assets a
      LEFT JOIN vcc_work_orders w ON w.asset_id = a.id AND (w.nc_status = 'OPEN' OR w.result_status = 'FAIL')
      LEFT JOIN users u_perf ON u_perf.id = w.performed_by
      LEFT JOIN users u_rev ON u_rev.id = w.reviewed_by
      WHERE a.status = 'ON_HOLD' OR w.nc_status = 'OPEN'
      ORDER BY COALESCE(w.performed_at, a.updated_at) DESC
    `).all();

    const auditMap = new Map();
    const { results: auditRows } = await db.prepare(`
      SELECT actor_id, u.name AS actor_name, action, details, at
      FROM audit_log
      LEFT JOIN users u ON u.id = audit_log.actor_id
      WHERE action IN ('VCC_WO_HOLD_RELEASED', 'VCC_WO_RESULT_SUBMITTED', 'VCC_WO_AMENDED')
      ORDER BY at DESC
    `).all().catch(() => ({ results: [] }));

    for (const row of auditRows) {
      try {
        const details = JSON.parse(row.details || '{}');
        if (details.wo_id && !auditMap.has(details.wo_id)) {
          auditMap.set(details.wo_id, {
            actor_name: row.actor_name,
            action: row.action,
            at: row.at,
            impact_assessment: details.impact_assessment || null
          });
        }
      } catch {
        // ignore JSON parse error
      }
    }

    const userLevel = Number(user.approval_level ?? 0);

    const items = results
      .filter((r) => {
        if (filterDept && r.department !== filterDept) return false;
        return isUserAuthorizedForPlanDept(user, r.department);
      })
      .map((r) => {
        const auditInfo = r.wo_id ? auditMap.get(r.wo_id) : null;
        const daysOnHold = r.performed_at ? Math.max(0, -diffDays(r.performed_at, refDate)) : 0;
        const canRelease = userLevel >= 5 && isUserAuthorizedForPlanDept(user, r.department);

        return {
          asset_id: r.asset_id,
          asset_code: r.asset_code,
          asset_name: r.asset_name,
          asset_type: r.asset_type,
          department: r.department,
          location: r.location,
          asset_status: r.asset_status,
          wo_id: r.wo_id,
          wo_code: r.wo_code,
          wo_status: r.wo_status,
          result_status: r.result_status,
          result_remarks: r.result_remarks,
          acceptance_criteria: r.acceptance_criteria,
          nc_status: r.nc_status || (r.asset_status === 'ON_HOLD' ? 'OPEN' : 'RELEASED'),
          performed_at: r.performed_at,
          performed_by_name: r.performed_by_name || r.performed_by || '-',
          reviewed_by_name: r.reviewed_by_name || '-',
          impact_assessment: r.nc_impact_assessment || auditInfo?.impact_assessment || null,
          days_on_hold: daysOnHold,
          can_release_hold: canRelease,
          recommendation: canRelease
            ? 'ผู้มีอำนาจระดับ L5+ สามารถประเมินผลกระทบและกดปลดระงับการใช้งานได้'
            : 'รอผู้มีอำนาจระดับ L5+ ของแผนกประเมินผลกระทบและอนุมัติปลดระงับ'
        };
      });

    return c.json({
      reference_date: refDate,
      total_items: items.length,
      open_nc_count: items.filter((i) => i.nc_status === 'OPEN').length,
      items
    });
  });

  // Compliance Report endpoint specifically designed for Auditors (ISO 9001 / ISO/IEC 17025 / FSSC 22000)
  app.get('/api/vcc/compliance-report', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const year = parseYearParam(c.req.query('year'));
    if (year === null) return c.json(INVALID_YEAR, 400);
    const filterDept = c.req.query('department') ? String(c.req.query('department')).trim().toUpperCase() : null;
    const filterStatus = c.req.query('status') ? String(c.req.query('status')).trim().toUpperCase() : null;
    const filterResult = c.req.query('result_status') ? String(c.req.query('result_status')).trim().toUpperCase() : null;
    const filterVerdict = c.req.query('verdict') ? String(c.req.query('verdict')).trim().toUpperCase() : null;
    const filterAsset = c.req.query('asset_code') ? String(c.req.query('asset_code')).trim() : null;
    const refDate = c.req.query('reference_date') || new Date().toISOString().slice(0, 10);

    if (filterDept && !isUserAuthorizedForPlanDept(user, filterDept)) {
      return c.json({ error: `ไม่มีสิทธิ์เข้าถึงข้อมูลแผนก ${filterDept}` }, 403);
    }

    const { results } = await db.prepare(`
      SELECT
        w.*,
        a.asset_code, a.name AS asset_name, a.asset_type, a.department, a.department AS asset_department, a.location, a.status AS asset_status,
        p.name AS performed_by_name,
        r.name AS reviewed_by_name,
        am.name AS amended_by_name,
        pi.frequency_label,
        ap.document_code AS plan_doc_code, ap.revision AS plan_revision,
        (SELECT c.file_name FROM vcc_work_order_certificates c WHERE c.work_order_id = w.id ORDER BY c.version DESC LIMIT 1) AS cert_file_name,
        (SELECT c.file_hash FROM vcc_work_order_certificates c WHERE c.work_order_id = w.id ORDER BY c.version DESC LIMIT 1) AS cert_sha256_hash,
        (SELECT c.version FROM vcc_work_order_certificates c WHERE c.work_order_id = w.id ORDER BY c.version DESC LIMIT 1) AS cert_file_version
      FROM vcc_work_orders w
      JOIN vcc_assets a ON a.id = w.asset_id
      LEFT JOIN vcc_annual_plans ap ON ap.id = w.plan_id
      LEFT JOIN vcc_annual_plan_items pi ON pi.id = w.plan_item_id
      LEFT JOIN users p ON p.id = w.performed_by
      LEFT JOIN users r ON r.id = w.reviewed_by
      LEFT JOIN users am ON am.id = w.amended_by
      ORDER BY w.due_date ASC, w.wo_code ASC
    `).all();

    const records = [];

    for (const w of results) {
      const woYear = Number(String(w.due_date || '').slice(0, 4)) || w.plan_year;
      if (year && woYear !== year) continue;

      if (filterDept && w.department !== filterDept) continue;
      if (!isUserAuthorizedForPlanDept(user, w.department)) continue;

      if (filterStatus && w.status !== filterStatus) continue;
      if (filterResult && w.result_status !== filterResult) continue;
      if (filterAsset && !w.asset_code.toLowerCase().includes(filterAsset.toLowerCase()) && !w.asset_name.toLowerCase().includes(filterAsset.toLowerCase())) continue;

      const requiredDueDate = w.required_due_date || w.original_due_date || w.due_date;
      const currentDueDate = w.due_date;
      const isRescheduled = String(currentDueDate) !== String(requiredDueDate);
      const daysUntilRequired = diffDays(requiredDueDate, refDate);

      let verdict = 'IN_PROGRESS';
      if (w.status === 'CANCELLED') {
        verdict = 'CANCELLED';
      } else if (w.nc_status === 'OPEN' || w.asset_status === 'ON_HOLD') {
        verdict = 'NON_COMPLIANT_HOLD';
      } else if (w.status === 'CLOSED' && w.result_status === 'PASS') {
        verdict = w.is_amended === 1 ? 'COMPLIANT_AMENDED' : 'COMPLIANT';
      } else if (daysUntilRequired !== null && daysUntilRequired < 0) {
        verdict = 'NON_COMPLIANT_OVERDUE';
      } else if (w.status === 'CLOSED' && w.result_status === 'FAIL') {
        verdict = 'NON_COMPLIANT_HOLD';
      } else {
        verdict = 'IN_PROGRESS';
      }

      if (filterVerdict && verdict !== filterVerdict) continue;

      records.push({
        wo_id: w.id,
        wo_code: w.wo_code,
        asset_id: w.asset_id,
        asset_code: w.asset_code,
        asset_name: w.asset_name,
        asset_type: w.asset_type,
        department: w.department,
        location: w.location,
        asset_status: w.asset_status,
        plan_year: w.plan_year,
        plan_revision: w.plan_revision,
        plan_doc_code: w.plan_doc_code,
        planned_month: w.planned_month,
        frequency_label: w.frequency_label,
        provider_name: w.provider_name || 'ทวนสอบภายใน',
        calibration_provider_name: w.calibration_provider_name,
        calibration_method: w.calibration_method,
        traceability_ref: w.traceability_ref,
        environmental_conditions: w.environmental_conditions,
        uncertainty_value: w.uncertainty_value,
        calibration_error_value: w.calibration_error_value,
        required_due_date: requiredDueDate,
        scheduled_date: currentDueDate,
        is_rescheduled: isRescheduled,
        days_until_required: daysUntilRequired,
        performed_at: w.performed_at,
        performed_by_name: w.performed_by_name || w.performed_by || '-',
        reviewed_at: w.reviewed_at,
        reviewed_by_name: w.reviewed_by_name || w.reviewed_by || '-',
        review_comment: w.review_comment,
        result_status: w.result_status,
        acceptance_criteria: w.acceptance_criteria,
        result_remarks: w.result_remarks,
        certificate_no: w.certificate_no,
        certificate_issue_date: w.certificate_issue_date,
        certificate_valid_until: w.certificate_valid_until,
        has_certificate_file: Boolean(w.cert_file_name),
        cert_file_name: w.cert_file_name || null,
        cert_sha256_hash: w.cert_sha256_hash || null,
        cert_version: w.cert_file_version || null,
        is_amended: Boolean(w.is_amended),
        amended_at: w.amended_at,
        amended_by_name: w.amended_by_name,
        amendment_reason: w.amendment_reason,
        nc_status: w.nc_status,
        verdict,
        compliance_verdict: verdict
      });
    }

    let compliantCount = 0;
    let compliantAmendedCount = 0;
    let nonCompliantOverdueCount = 0;
    let nonCompliantHoldCount = 0;
    let inProgressCount = 0;
    let cancelledCount = 0;

    for (const r of records) {
      if (r.verdict === 'COMPLIANT') compliantCount += 1;
      else if (r.verdict === 'COMPLIANT_AMENDED') compliantAmendedCount += 1;
      else if (r.verdict === 'NON_COMPLIANT_OVERDUE') nonCompliantOverdueCount += 1;
      else if (r.verdict === 'NON_COMPLIANT_HOLD') nonCompliantHoldCount += 1;
      else if (r.verdict === 'CANCELLED') cancelledCount += 1;
      else inProgressCount += 1;
    }

    const totalAudited = records.length;
    const compliantTotal = compliantCount + compliantAmendedCount;
    const complianceRate = totalAudited > 0 ? Math.round((compliantTotal / totalAudited) * 100) : null;
    const complianceRateLabel = totalAudited > 0 ? `${complianceRate}%` : 'N/A';

    return c.json({
      reference_date: refDate,
      year,
      summary: {
        total_records: totalAudited,
        compliant_count: compliantCount,
        compliant_amended_count: compliantAmendedCount,
        non_compliant_overdue_count: nonCompliantOverdueCount,
        non_compliant_hold_count: nonCompliantHoldCount,
        in_progress_count: inProgressCount,
        cancelled_count: cancelledCount,
        compliance_rate: complianceRate,
        compliance_rate_label: complianceRateLabel
      },
      records
    });
  });

  // Export Compliance Report (Audit-Ready CSV with UTF-8 BOM and Formula Injection Prevention)
  app.get('/api/vcc/export/compliance-report', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const year = parseYearParam(c.req.query('year'));
    if (year === null) return c.json(INVALID_YEAR, 400);
    const filterDept = c.req.query('department') ? String(c.req.query('department')).trim().toUpperCase() : null;
    const filterStatus = c.req.query('status') ? String(c.req.query('status')).trim().toUpperCase() : null;
    const filterResult = c.req.query('result_status') ? String(c.req.query('result_status')).trim().toUpperCase() : null;
    const filterVerdict = c.req.query('verdict') ? String(c.req.query('verdict')).trim().toUpperCase() : null;
    const filterAsset = c.req.query('asset_code') ? String(c.req.query('asset_code')).trim() : null;
    const refDate = c.req.query('reference_date') || new Date().toISOString().slice(0, 10);

    if (filterDept && !isUserAuthorizedForPlanDept(user, filterDept)) {
      return c.json({ error: `ไม่มีสิทธิ์เข้าถึงข้อมูลแผนก ${filterDept}` }, 403);
    }

    const { results } = await db.prepare(`
      SELECT
        w.*,
        a.asset_code, a.name AS asset_name, a.asset_type, a.department, a.department AS asset_department, a.location, a.status AS asset_status,
        p.name AS performed_by_name,
        r.name AS reviewed_by_name,
        am.name AS amended_by_name,
        (SELECT c.file_name FROM vcc_work_order_certificates c WHERE c.work_order_id = w.id ORDER BY c.version DESC LIMIT 1) AS cert_file_name,
        (SELECT c.file_hash FROM vcc_work_order_certificates c WHERE c.work_order_id = w.id ORDER BY c.version DESC LIMIT 1) AS cert_sha256_hash
      FROM vcc_work_orders w
      JOIN vcc_assets a ON a.id = w.asset_id
      LEFT JOIN users p ON p.id = w.performed_by
      LEFT JOIN users r ON r.id = w.reviewed_by
      LEFT JOIN users am ON am.id = w.amended_by
      ORDER BY w.due_date ASC, w.wo_code ASC
    `).all();

    const header = [
      'เลขที่ใบสั่งงาน',
      'รหัสเครื่องมือ',
      'ชื่อเครื่องมือวัด',
      'ประเภทเครื่องมือ',
      'แผนก',
      'สถานที่ติดตั้ง',
      'หน่วยงานสอบเทียบ/ทวนสอบ',
      'วิธีการสอบเทียบ',
      'มาตรฐานอ้างอิง (Traceability)',
      'วันครบกำหนดตามเกณฑ์ (Required Due Date)',
      'วันครบกำหนดปัจจุบัน (Scheduled Date)',
      'มีการเลื่อนกำหนด',
      'วันที่ปฏิบัติงานจริง',
      'ผลการตรวจ',
      'เลขที่ใบรับรอง',
      'วันหมดอายุใบรับรอง',
      'ไฟล์ใบรับรองแนบ',
      'SHA-256 Hash',
      'ผู้บันทึกผล',
      'ผู้ตรวจรับ/ปิดงาน',
      'สถานะใบสั่งงาน',
      'สถานะระงับใช้ (NC)',
      'มีการแก้ไขผล (Amendment)',
      'ผลการประเมินการปฏิบัติตามมาตรฐาน (Verdict)'
    ];

    const lines = [header.map(csvCell).join(',')];

    for (const w of results) {
      const woYear = Number(String(w.due_date || '').slice(0, 4)) || w.plan_year;
      if (year && woYear !== year) continue;
      if (filterDept && w.department !== filterDept) continue;
      if (!isUserAuthorizedForPlanDept(user, w.department)) continue;

      if (filterStatus && w.status !== filterStatus) continue;
      if (filterResult && w.result_status !== filterResult) continue;
      if (filterAsset && !w.asset_code.toLowerCase().includes(filterAsset.toLowerCase()) && !w.asset_name.toLowerCase().includes(filterAsset.toLowerCase())) continue;

      const requiredDueDate = w.required_due_date || w.original_due_date || w.due_date;
      const currentDueDate = w.due_date;
      const isRescheduled = String(currentDueDate) !== String(requiredDueDate);
      const daysUntilRequired = diffDays(requiredDueDate, refDate);

      let verdict = 'IN_PROGRESS';
      if (w.status === 'CANCELLED') verdict = 'CANCELLED';
      else if (w.nc_status === 'OPEN' || w.asset_status === 'ON_HOLD') verdict = 'NON_COMPLIANT_HOLD';
      else if (w.status === 'CLOSED' && w.result_status === 'PASS') verdict = w.is_amended === 1 ? 'COMPLIANT_AMENDED' : 'COMPLIANT';
      else if (daysUntilRequired !== null && daysUntilRequired < 0) verdict = 'NON_COMPLIANT_OVERDUE';
      else if (w.status === 'CLOSED' && w.result_status === 'FAIL') verdict = 'NON_COMPLIANT_HOLD';

      if (filterVerdict && verdict !== filterVerdict) continue;

      lines.push(
        [
          w.wo_code,
          w.asset_code,
          w.asset_name,
          w.asset_type,
          w.department,
          w.location,
          w.calibration_provider_name || w.provider_name || 'ทวนสอบภายใน',
          w.calibration_method || '-',
          w.traceability_ref || '-',
          requiredDueDate,
          currentDueDate,
          isRescheduled ? 'YES' : 'NO',
          w.performed_at || '-',
          w.result_status,
          w.certificate_no || '-',
          w.certificate_valid_until || '-',
          w.cert_file_name ? 'YES' : 'NO',
          w.cert_sha256_hash || '-',
          w.performed_by_name || w.performed_by || '-',
          w.reviewed_by_name || w.reviewed_by || '-',
          w.status,
          w.nc_status || '-',
          w.is_amended === 1 ? 'YES' : 'NO',
          verdict
        ]
          .map(csvCell)
          .join(',')
      );
    }

    await audit(db, user.id, 'VCC_EXPORT_COMPLIANCE_REPORT', {
      year,
      department: filterDept,
      record_count: lines.length - 1
    }).run();

    const csvContent = `\uFEFF${lines.join('\r\n')}`;
    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="VCC_Compliance_Report_${year}.csv"`
      }
    });
  });

  app.get('/api/vcc/audit-log', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const prefix = c.req.query('category') || 'VCC_';
    const safePrefix = ['VCC_', 'VCC_ASSET', 'VCC_PLAN', 'VCC_WO', 'VCC_NOTIFICATION', 'VCC_EXPORT'].includes(prefix)
      ? prefix
      : 'VCC_';

    const { results } = await db
      .prepare(
        `SELECT a.id, a.at, a.actor_id, u.name AS actor_name, a.action, a.details
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_id
         WHERE a.action LIKE ?
         ORDER BY a.at DESC, a.id DESC
         LIMIT 200`
      )
      .bind(`${safePrefix}%`)
      .all();

    const history = results.map((r) => {
      let parsed = {};
      try {
        parsed = JSON.parse(r.details || '{}');
      } catch {
        parsed = {};
      }
      return {
        id: r.id,
        at: r.at,
        actor_id: r.actor_id,
        actor_name: r.actor_name || r.actor_id,
        action: r.action,
        details: parsed
      };
    });

    return c.json({ history });
  });

  app.get('/api/vcc/export/annual-plan', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const year = parseYearParam(c.req.query('year'));
    if (year === null) return c.json(INVALID_YEAR, 400);
    const department = c.req.query('department') ? String(c.req.query('department')).trim().toUpperCase() : null;
    const revision = c.req.query('revision') ? String(c.req.query('revision')).trim() : null;
    const effectiveStatus = c.req.query('effective_status') ? String(c.req.query('effective_status')).trim().toUpperCase() : null;

    let query = 'SELECT * FROM vcc_annual_plans WHERE plan_year = ?';
    const params = [year];

    if (department) {
      query += ' AND department = ?';
      params.push(department);
    }
    if (revision) {
      query += ' AND revision = ?';
      params.push(revision);
    }
    if (effectiveStatus) {
      query += ' AND effective_status = ?';
      params.push(effectiveStatus);
    } else if (!revision) {
      query += " AND (effective_status = 'CURRENT' OR status = 'APPROVED')";
    }

    query += ' ORDER BY CAST(revision AS INTEGER) DESC, revision DESC LIMIT 1';

    const plan = await db.prepare(query).bind(...params).first();
    if (!plan) return c.json({ error: `ไม่พบแผนประจำปี ${year}` }, 404);

    if (!isUserAuthorizedForPlanDept(user, plan.department)) {
      return c.json({ error: 'ไม่มีสิทธิ์ดาวน์โหลดแผนประจำปีของแผนกนี้' }, 403);
    }

    const { results: items } = await db
      .prepare(
        `SELECT i.*, a.asset_code, a.name AS asset_name, a.asset_type, a.department, a.location
         FROM vcc_annual_plan_items i
         JOIN vcc_assets a ON a.id = i.asset_id
         WHERE i.plan_id = ?
         ORDER BY i.sort_order ASC, i.id ASC`
      )
      .bind(plan.id)
      .all();

    const { results: closedWos } = await db
      .prepare(
        `SELECT plan_item_id, planned_month, certificate_no
         FROM vcc_work_orders
         WHERE plan_id = ? AND status = 'CLOSED' AND result_status = 'PASS'`
      )
      .bind(plan.id)
      .all();

    const actMap = new Map();
    const certMap = new Map();
    for (const w of closedWos) {
      if (!w.plan_item_id || !w.planned_month) continue;
      if (!actMap.has(w.plan_item_id)) actMap.set(w.plan_item_id, new Set());
      actMap.get(w.plan_item_id).add(Number(w.planned_month));
      if (w.certificate_no) {
        const list = certMap.get(w.plan_item_id) || [];
        list.push(w.certificate_no);
        certMap.set(w.plan_item_id, list);
      }
    }

    const header = [
      'เอกสาร',
      'ปี',
      'Rev',
      'สถานะแผน',
      'ลำดับ',
      'รหัสเครื่องมือ',
      'ชื่อเครื่องมือวัด',
      'แผนก',
      'หน่วยงานสอบเทียบ/ทวนสอบ',
      'ความถี่',
      'ผู้รับผิดชอบ',
      'แถว (Plan/Act)',
      'ม.ค.',
      'ก.พ.',
      'มี.ค.',
      'เม.ย.',
      'พ.ค.',
      'มิ.ย.',
      'ก.ค.',
      'ส.ค.',
      'ก.ย.',
      'ต.ค.',
      'พ.ย.',
      'ธ.ค.',
      'เลขที่ใบรับรอง (เมื่อปิดงานแล้ว)',
      'หมายเหตุ'
    ];

    const lines = [header.map(csvCell).join(',')];

    items.forEach((item, index) => {
      let plannedMonths = [];
      try {
        plannedMonths = JSON.parse(item.planned_months || '[]');
      } catch {
        plannedMonths = [];
      }
      const actualMonths = actMap.get(item.id) || new Set();
      const certs = (certMap.get(item.id) || []).join('; ');

      const commonCols = [
        plan.document_code,
        plan.plan_year,
        plan.revision,
        plan.status,
        index + 1,
        item.asset_code,
        item.asset_name,
        item.department,
        item.provider_name,
        item.frequency_label,
        item.responsible_label || item.responsible_dept
      ];

      const planMonthCells = Array.from({ length: 12 }, (_, idx) => (plannedMonths.includes(idx + 1) ? 'P' : ''));
      const actMonthCells = Array.from({ length: 12 }, (_, idx) => (actualMonths.has(idx + 1) ? 'A' : ''));

      lines.push([...commonCols, 'Plan', ...planMonthCells, '', item.remarks || ''].map(csvCell).join(','));
      lines.push([...commonCols, 'Act.', ...actMonthCells, certs, item.remarks || ''].map(csvCell).join(','));
    });

    await audit(db, user.id, 'VCC_EXPORT_ANNUAL_PLAN', { year, plan_id: plan.id, item_count: items.length }).run();

    const csvContent = `\uFEFF${lines.join('\r\n')}`;
    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="FM-QC-46_${year}_Rev${plan.revision}.csv"`
      }
    });
  });

  app.get('/api/vcc/export/work-orders', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');

    const { results } = await db
      .prepare(
        `SELECT w.*, a.asset_code, a.name AS asset_name, a.department,
                p.name AS performed_by_name, r.name AS reviewed_by_name
         FROM vcc_work_orders w
         JOIN vcc_assets a ON a.id = w.asset_id
         LEFT JOIN users p ON p.id = w.performed_by
         LEFT JOIN users r ON r.id = w.reviewed_by
         ORDER BY w.due_date DESC, w.wo_code DESC`
      )
      .all();

    const header = [
      'เลขที่ใบสั่งงาน',
      'รหัสเครื่องมือ',
      'ชื่อเครื่องมือวัด',
      'แผนก',
      'หน่วยงานสอบเทียบ/ทวนสอบ',
      'เดือนตามแผน',
      'วันครบกำหนดเดิม',
      'วันครบกำหนดปัจจุบัน',
      'วันที่ปฏิบัติงานจริง',
      'ผลการตรวจ',
      'เลขที่ใบรับรอง',
      'เกณฑ์ยอมรับ',
      'สถานะใบสั่งงาน',
      'สถานะระงับใช้ (NC)',
      'ผู้บันทึกผล',
      'ผู้ตรวจรับ',
      'วันที่ตรวจรับ'
    ];

    const lines = [header.map(csvCell).join(',')];
    for (const w of results) {
      lines.push(
        [
          w.wo_code,
          w.asset_code,
          w.asset_name,
          w.department,
          w.provider_name,
          w.planned_month || '',
          w.original_due_date,
          w.due_date,
          w.performed_at || '',
          w.result_status,
          w.certificate_no || '',
          w.acceptance_criteria || '',
          w.status,
          w.nc_status || '',
          w.performed_by_name || w.performed_by || '',
          w.reviewed_by_name || w.reviewed_by || '',
          w.reviewed_at || ''
        ]
          .map(csvCell)
          .join(',')
      );
    }

    await audit(db, user.id, 'VCC_EXPORT_WORK_ORDERS', { count: results.length }).run();

    const csvContent = `\uFEFF${lines.join('\r\n')}`;
    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="VCC_WorkOrders_Certificates.csv"'
      }
    });
  });
};
