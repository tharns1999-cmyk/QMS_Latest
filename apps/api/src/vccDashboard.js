const NOW = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')";
const DCC_ONLY = { error: 'เฉพาะเจ้าหน้าที่ DCC เท่านั้นที่ได้รับอนุญาตให้ใช้งานส่วนนี้' };

export const DEFAULT_NOTIFICATION_SETTINGS = {
  monthly_due_soon_days: [7, 3],
  monthly_overdue_days: [1, 3, 7],
  annual_due_soon_days: [30, 14, 7],
  annual_overdue_days: [1, 7, 14],
  review_sla_days: 3
};

const loadNotificationSettings = async (db) => {
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
  const requireDcc = async (c, next) => {
    if (!c.get('user')?.isDcc) return c.json(DCC_ONLY, 403);
    await next();
  };

  app.get('/api/vcc/notification-settings', requireAuth, requireDcc, async (c) => {
    const settings = await loadNotificationSettings(c.env.DB);
    return c.json({ settings });
  });

  app.put('/api/vcc/notification-settings', requireAuth, requireDcc, async (c) => {
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

    if (!monthlyDueSoon || !monthlyOverdue || !annualDueSoon || !annualOverdue) {
      return c.json({ error: 'รายการวันแจ้งเตือนต้องเป็นตัวเลขจำนวนเต็มระหว่าง 1 ถึง 365 วัน' }, 400);
    }
    if (!Number.isInteger(reviewSlaDays) || reviewSlaDays < 1 || reviewSlaDays > 60) {
      return c.json({ error: 'ระยะเวลา SLA รอตรวจรับต้องอยู่ระหว่าง 1 ถึง 60 วัน' }, 400);
    }

    const updated = {
      monthly_due_soon_days: monthlyDueSoon,
      monthly_overdue_days: monthlyOverdue,
      annual_due_soon_days: annualDueSoon,
      annual_overdue_days: annualOverdue,
      review_sla_days: reviewSlaDays
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

  app.get('/api/vcc/dashboard', requireAuth, requireDcc, async (c) => {
    const db = c.env.DB;
    const year = Number(c.req.query('year') || 2026);
    const refDateQuery = c.req.query('reference_date');
    const refDate = refDateQuery && /^\d{4}-\d{2}-\d{2}$/.test(refDateQuery)
      ? refDateQuery
      : new Date().toISOString().slice(0, 10);

    const notificationSettings = await loadNotificationSettings(db);

    const { results: assetRows } = await db.prepare('SELECT id, department, is_group, status FROM vcc_assets').all();
    const { results: woRows } = await db
      .prepare(
        `SELECT w.*, a.asset_code, a.name AS asset_name, a.department,
                pi.frequency_label
         FROM vcc_work_orders w
         JOIN vcc_assets a ON a.id = w.asset_id
         LEFT JOIN vcc_annual_plan_items pi ON pi.id = w.plan_item_id
         ORDER BY w.due_date ASC, w.wo_code ASC`
      )
      .all();

    const onHoldAssetIds = new Set(woRows.filter((w) => w.nc_status === 'OPEN').map((w) => w.asset_id));
    const individualAssets = assetRows.filter((a) => a.is_group === 0);
    const activeGroups = assetRows.filter((a) => a.is_group === 1 && a.status === 'ACTIVE');

    const equipmentKpi = {
      total_assets: individualAssets.length,
      active_assets: individualAssets.filter((a) => a.status === 'ACTIVE' && !onHoldAssetIds.has(a.id)).length,
      on_hold_assets: onHoldAssetIds.size,
      retired_assets: individualAssets.filter((a) => a.status === 'RETIRED').length,
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

    for (const wo of woRows) {
      if (wo.result_status === 'FAIL') failCount += 1;

      if (wo.nc_status === 'OPEN') {
        pushAlert({
          dedupe_key: `${wo.id}:ON_HOLD`,
          alert_type: 'ON_HOLD',
          severity: 'CRITICAL',
          wo_id: wo.id,
          wo_code: wo.wo_code,
          asset_code: wo.asset_code,
          asset_name: wo.asset_name,
          department: wo.department,
          due_date: wo.due_date,
          message: `ระงับใช้งานชั่วคราว (ON_HOLD) — ผลตรวจไม่ผ่านเกณฑ์ รอผู้อนุมัติ L5+ ประเมินผลกระทบ`
        });
      }

      if (wo.status === 'CLOSED') {
        completedCount += 1;
        if (wo.result_status === 'PASS') passCount += 1;
        if (wo.performed_at && String(wo.performed_at).slice(0, 10) <= String(wo.due_date).slice(0, 10)) {
          onTimeCount += 1;
        }
        // Closed work orders never receive due/overdue reminders
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
          asset_code: wo.asset_code,
          asset_name: wo.asset_name,
          department: wo.department,
          due_date: wo.due_date,
          sla_exceeded: slaExceeded,
          message: slaExceeded
            ? `รอผู้ตรวจรับเกิน SLA (${waitDays} วัน / เกณฑ์ ${notificationSettings.review_sla_days} วัน)`
            : `รอผู้ตรวจรับตรวจสอบผลและใบรับรอง (${wo.certificate_no || '-'})`
        });
        continue;
      }

      // Active work orders: OPEN, REJECTED
      const daysUntilDue = diffDays(wo.due_date, refDate);
      if (daysUntilDue === null) continue;

      const isMonthly = String(wo.frequency_label || '').includes('เดือน');
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
          asset_code: wo.asset_code,
          asset_name: wo.asset_name,
          department: wo.department,
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
            asset_code: wo.asset_code,
            asset_name: wo.asset_name,
            department: wo.department,
            due_date: wo.due_date,
            days_until_due: daysUntilDue,
            message: daysUntilDue === 0
              ? `ครบกำหนดสอบเทียบวันนี้ (${wo.due_date})`
              : `ใกล้ครบกำหนดในอีก ${daysUntilDue} วัน (ครบกำหนด ${wo.due_date})`
          });
        }
      }
    }

    // Monthly Plan vs Act for selected year (only APPROVED plans count toward official Plan)
    const { results: approvedPlans } = await db
      .prepare("SELECT id, plan_year, department, revision, status FROM vcc_annual_plans WHERE plan_year = ? AND status = 'APPROVED'")
      .bind(year)
      .all();

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

    // Department summary
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
      if (wo.status === 'CLOSED') d.closed_work_orders += 1;
      else if (wo.status !== 'CANCELLED' && wo.status !== 'PENDING_REVIEW') {
        const days = diffDays(wo.due_date, refDate);
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
    });
  });

  app.get('/api/vcc/audit-log', requireAuth, requireDcc, async (c) => {
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

  app.get('/api/vcc/export/annual-plan', requireAuth, requireDcc, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const year = Number(c.req.query('year') || 2026);

    const plan = await db
      .prepare('SELECT * FROM vcc_annual_plans WHERE plan_year = ? ORDER BY revision DESC LIMIT 1')
      .bind(year)
      .first();
    if (!plan) return c.json({ error: `ไม่พบแผนประจำปี ${year}` }, 404);

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

  app.get('/api/vcc/export/work-orders', requireAuth, requireDcc, async (c) => {
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
