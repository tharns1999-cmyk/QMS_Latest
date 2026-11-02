import { requireVccAccess, requireDccOnly } from './vccAuth.js';
import { isUserAuthorizedForPlanDept, getUserDepartments } from './vccPlans.js';
import { DEFAULT_NOTIFICATION_SETTINGS } from './vccDashboard.js';

const NOW = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')";

/**
 * Returns YYYY-MM-DD anchored in Bangkok timezone (Asia/Bangkok, UTC+7)
 */
export const getBangkokDate = (ref = new Date()) => {
  const d = typeof ref === 'string' ? new Date(ref) : ref;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(d);
};

export const diffDays = (targetDateStr, refDateStr) => {
  if (!targetDateStr || !refDateStr) return 0;
  const t = Date.parse(`${String(targetDateStr).slice(0, 10)}T00:00:00Z`);
  const r = Date.parse(`${String(refDateStr).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t) || Number.isNaN(r)) return 0;
  return Math.round((t - r) / 86400000);
};

// Escape CSV cell and guard against spreadsheet formula injection (=, +, -, @)
const csvCell = (val) => {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  if (/^[=+\-@]/.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
};

// A RESOLVED row whose condition has come back belongs to a finished episode: park it under a
// unique key (history kept) so the live key starts a new episode. Concurrent sweeps stay safe
// because the live key is still UNIQUE and inserts use ON CONFLICT.
const archiveResolved = (db, dedupKey) =>
  db.prepare("UPDATE vcc_notifications SET dedup_key = dedup_key || '#' || id WHERE dedup_key = ? AND status = 'RESOLVED'")
    .bind(dedupKey).run();

// Stored timestamps are UTC ISO; compare calendar days in Bangkok like `today`.
const toBangkokDay = (v) => (String(v).includes('T') ? getBangkokDate(String(v)) : String(v).slice(0, 10));

const hasGlobalAccess = (user) => Boolean(user.isDcc || user.isQmr || Number(user.approval_level || 0) >= 6);

// shortcut: minimum approval level per escalation tier is fixed here (was inline), move to
// approval_matrix settings when DCC defines tiers.
const MIN_LEVEL_BY_TIER = { 1: 0, 2: 4, 3: 5 };

// Single rule for who may see or acknowledge a notification: department + tier level.
const canActOnNotification = (user, n) => {
  if (hasGlobalAccess(user)) return true;
  if (!getUserDepartments(user).includes(n.department)) return false;
  return Number(user.approval_level || 0) >= (MIN_LEVEL_BY_TIER[n.escalation_level] ?? 0);
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

/**
 * Core Automated Notification & Escalation Sweep Engine
 * Evaluates Work Orders, Certificate Expiration, and ON_HOLD/NC.
 * Idempotent: safe to run multiple times concurrently or repeatedly on same day.
 */
export const runVccNotificationSweep = async (db, options = {}) => {
  const settings = await loadNotificationSettings(db);
  const today = options.nowDate ? String(options.nowDate).slice(0, 10) : getBangkokDate();
  const summary = { created: 0, updated: 0, escalated: 0, resolved: 0 };

  const annualDueSoonDays = [...(settings.annual_due_soon_days || [30, 14, 7])].sort((a, b) => b - a);
  const l2EscalationDays = Number(settings.overdue_escalation_days_l2 || 7);
  const l3EscalationDays = Number(settings.overdue_escalation_days_l3 || 14);
  const onHoldEscalationDays = Number(settings.on_hold_escalation_days || 14);
  const graceDays = Number(settings.acknowledgement_grace_days || 3);
  const certExpiringDays = [...(settings.cert_expiring_days || [60, 30])].sort((a, b) => a - b);

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. WORK ORDERS: Due Soon & Overdue Lifecycle (with Overdue Invariance)
  // ─────────────────────────────────────────────────────────────────────────────
  const { results: activeWos } = await db.prepare(`
    SELECT wo.*, a.asset_code, a.name AS asset_name, a.department AS asset_dept, a.location AS asset_location
    FROM vcc_work_orders wo
    JOIN vcc_assets a ON a.id = wo.asset_id
    WHERE wo.status IN ('SCHEDULED', 'IN_PROGRESS', 'PENDING_REVIEW', 'DRAFT')
  `).all();

  for (const wo of (activeWos || [])) {
    const targetDept = wo.department || wo.asset_dept;
    const requiredDueDate = String(wo.required_due_date || wo.original_due_date || wo.due_date || '').slice(0, 10);
    if (!requiredDueDate) continue;

    const diff = diffDays(requiredDueDate, today);

    if (diff < 0) {
      // ── OVERDUE LIFECYCLE ──
      const daysOverdue = Math.abs(diff);
      let notifType = 'OVERDUE_L1';
      let escalationLevel = 1;
      let targetRole = 'PERFORMER';
      let severity = 'WARNING';
      let title = `[แจ้งเตือน/เลยกำหนด L1] เครื่องมือ ${wo.asset_code} เกินกำหนด ${daysOverdue} วัน`;
      let message = `เครื่องมือ ${wo.asset_code} (${wo.asset_name}) ใบสั่งงาน ${wo.wo_code} เกินกำหนดทวนสอบแล้ว ${daysOverdue} วัน (ครบกำหนด ${requiredDueDate}) กรุณาดำเนินการโดยเร็ว`;

      if (daysOverdue >= l3EscalationDays) {
        notifType = 'OVERDUE_L3_CRITICAL';
        escalationLevel = 3;
        targetRole = 'QMR_L6';
        severity = 'CRITICAL';
        title = `[วิกฤต/เลยกำหนด L3] เครื่องมือ ${wo.asset_code} เกินกำหนด ${daysOverdue} วัน (เสนอติดป้าย ON_HOLD)`;
        message = `เครื่องมือ ${wo.asset_code} (${wo.asset_name}) ใบสั่งงาน ${wo.wo_code} เกินกำหนดทวนสอบ ${daysOverdue} วัน เกินเกณฑ์วิกฤต ${l3EscalationDays} วัน ขอให้ฝ่ายคุณภาพพิจารณาติดป้ายระงับใช้เครื่องมือ (ON_HOLD) เพื่อป้องกันการนำไปใช้งาน`;
      } else if (daysOverdue >= l2EscalationDays) {
        notifType = 'OVERDUE_L2_ESCALATED';
        escalationLevel = 2;
        targetRole = 'MANAGER_L5';
        severity = 'CRITICAL';
        title = `[ยกระดับ/เลยกำหนด L2] เครื่องมือ ${wo.asset_code} เกินกำหนด ${daysOverdue} วัน`;
        message = `เครื่องมือ ${wo.asset_code} (${wo.asset_name}) ใบสั่งงาน ${wo.wo_code} เกินกำหนดทวนสอบ ${daysOverdue} วัน ขอให้หัวหน้าแผนก/ผู้จัดการเร่งรัดติดตามการสอบเทียบ`;
      }

      // Auto-resolve any previous Due Soon alerts for this work order
      await db.prepare(`
        UPDATE vcc_notifications
        SET status = 'RESOLVED', resolved_at = ${NOW}, resolved_reason = 'SUPERSEDED_BY_OVERDUE', updated_at = ${NOW}
        WHERE reference_type = 'VCC_WORK_ORDER' AND reference_id = ? AND notification_type LIKE 'DUE_SOON_%' AND status != 'RESOLVED'
      `).bind(wo.id).run();

      const dedupKey = `WO:${wo.id}:${notifType}`;
      await archiveResolved(db, dedupKey);
      const existing = await db.prepare("SELECT * FROM vcc_notifications WHERE dedup_key = ?").bind(dedupKey).first();

      if (existing) {
        let nextStatus = existing.status;
        // If acknowledged, check grace period unless Critical Escalation (L3)
        if (existing.status === 'ACKNOWLEDGED') {
          if (notifType === 'OVERDUE_L3_CRITICAL') {
            // Rule: "ห้ามชะลอ Critical Escalation"
            // Critical L3 retains urgent visibility and is active
            nextStatus = 'ACKNOWLEDGED'; // keep acknowledgement record, but offset keeps advancing
          } else {
            const daysSinceAck = existing.acknowledged_at ? diffDays(today, toBangkokDay(existing.acknowledged_at)) : 999;
            if (daysSinceAck > graceDays) {
              nextStatus = 'PENDING'; // grace period expired -> re-alert
            }
          }
        }

        await db.prepare(`
          UPDATE vcc_notifications
          SET days_offset = ?, due_date = ?, status = ?, title = ?, message = ?, updated_at = ${NOW}
          WHERE dedup_key = ?
        `).bind(daysOverdue, requiredDueDate, nextStatus, title, message, dedupKey).run();
        summary.updated++;
      } else {
        // Insert new overdue notification
        const notifId = `NTF-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        await db.prepare(`
          INSERT INTO vcc_notifications (
            id, dedup_key, notification_type, reference_type, reference_id,
            asset_id, work_order_id, department, target_role, escalation_level,
            severity, title, message, due_date, days_offset, status
          ) VALUES (?, ?, ?, 'VCC_WORK_ORDER', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
          ON CONFLICT(dedup_key) DO UPDATE SET
            days_offset = excluded.days_offset,
            due_date = excluded.due_date,
            title = excluded.title,
            message = excluded.message,
            updated_at = ${NOW}
        `).bind(
          notifId, dedupKey, notifType, wo.id, wo.asset_id, wo.id,
          targetDept, targetRole, escalationLevel, severity, title, message, requiredDueDate, daysOverdue
        ).run();
        summary.created++;
        if (escalationLevel > 1) summary.escalated++;

        // Supersede lower-tier overdue notifications for this work order
        await db.prepare(`
          UPDATE vcc_notifications
          SET status = 'RESOLVED', resolved_at = ${NOW}, resolved_reason = 'SUPERSEDED_BY_ESCALATION', updated_at = ${NOW}
          WHERE reference_type = 'VCC_WORK_ORDER' AND reference_id = ?
            AND notification_type LIKE 'OVERDUE_%' AND notification_type != ? AND status != 'RESOLVED'
        `).bind(wo.id, notifType).run();
      }
    } else {
      // ── DUE SOON LIFECYCLE ──
      // Match against thresholds (e.g. 7, 14, 30)
      let matchedThreshold = null;
      for (const t of annualDueSoonDays) {
        if (diff <= t) {
          matchedThreshold = t;
        }
      }

      if (matchedThreshold !== null) {
        const notifType = `DUE_SOON_${matchedThreshold}`;
        const severity = matchedThreshold <= 7 ? 'CRITICAL' : (matchedThreshold <= 14 ? 'WARNING' : 'INFO');
        const title = `[ใกล้ครบกำหนด ${matchedThreshold} วัน] เครื่องมือ ${wo.asset_code} เหลือเวลา ${diff} วัน`;
        const message = `เครื่องมือ ${wo.asset_code} (${wo.asset_name}) ใบสั่งงาน ${wo.wo_code} มีกำหนดทวนสอบในวันที่ ${requiredDueDate} (เหลือเวลาอีก ${diff} วัน)`;
        const dedupKey = `WO:${wo.id}:${notifType}`;

        await archiveResolved(db, dedupKey);

        const existing = await db.prepare("SELECT * FROM vcc_notifications WHERE dedup_key = ?").bind(dedupKey).first();
        if (existing) {
          let nextStatus = existing.status;
          if (existing.status === 'ACKNOWLEDGED') {
            const daysSinceAck = existing.acknowledged_at ? diffDays(today, toBangkokDay(existing.acknowledged_at)) : 999;
            if (daysSinceAck > graceDays && matchedThreshold <= 7) {
              nextStatus = 'PENDING';
            }
          }
          await db.prepare(`
            UPDATE vcc_notifications
            SET days_offset = ?, due_date = ?, status = ?, title = ?, message = ?, updated_at = ${NOW}
            WHERE dedup_key = ?
          `).bind(diff, requiredDueDate, nextStatus, title, message, dedupKey).run();
          summary.updated++;
        } else {
          const notifId = `NTF-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
          await db.prepare(`
            INSERT INTO vcc_notifications (
              id, dedup_key, notification_type, reference_type, reference_id,
              asset_id, work_order_id, department, target_role, escalation_level,
              severity, title, message, due_date, days_offset, status
            ) VALUES (?, ?, ?, 'VCC_WORK_ORDER', ?, ?, ?, ?, 'PERFORMER', 1, ?, ?, ?, ?, ?, 'PENDING')
            ON CONFLICT(dedup_key) DO UPDATE SET
              days_offset = excluded.days_offset,
              due_date = excluded.due_date,
              title = excluded.title,
              message = excluded.message,
              updated_at = ${NOW}
          `).bind(
            notifId, dedupKey, notifType, wo.id, wo.asset_id, wo.id,
            targetDept, severity, title, message, requiredDueDate, diff
          ).run();
          summary.created++;

          // Supersede larger due soon thresholds if advancing (e.g. at 7 days, resolve 30 and 14)
          await db.prepare(`
            UPDATE vcc_notifications
            SET status = 'RESOLVED', resolved_at = ${NOW}, resolved_reason = 'SUPERSEDED_BY_CLOSER_DEADLINE', updated_at = ${NOW}
            WHERE reference_type = 'VCC_WORK_ORDER' AND reference_id = ?
              AND notification_type LIKE 'DUE_SOON_%' AND notification_type != ? AND status != 'RESOLVED'
          `).bind(wo.id, notifType).run();
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. CERTIFICATE EXPIRATION: Independent Lifecycle (Assets & Closed WOs)
  // ─────────────────────────────────────────────────────────────────────────────
  const { results: certAssets } = await db.prepare(`
    SELECT a.id AS asset_id, a.asset_code, a.name AS asset_name, a.department,
           wo.certificate_no, wo.certificate_valid_until, wo.id AS wo_id
    FROM vcc_assets a
    JOIN vcc_work_orders wo ON wo.asset_id = a.id
    WHERE a.status != 'RETIRED' AND wo.status = 'CLOSED' AND wo.result_status = 'PASS'
      AND wo.certificate_valid_until IS NOT NULL
    GROUP BY a.id
    HAVING wo.certificate_valid_until = MAX(wo.certificate_valid_until)
  `).all();

  for (const row of (certAssets || [])) {
    const validUntil = String(row.certificate_valid_until).slice(0, 10);
    const certDiff = diffDays(validUntil, today);

    let notifType = null;
    let severity = 'INFO';
    let escalationLevel = 1;
    let targetRole = 'DCC';
    let title = '';
    let message = '';

    if (certDiff < 0) {
      notifType = 'CERT_EXPIRED';
      severity = 'CRITICAL';
      escalationLevel = 2;
      title = `[ใบรับรองหมดอายุ] เครื่องมือ ${row.asset_code} ใบรับรองหมดอายุแล้ว`;
      message = `เครื่องมือ ${row.asset_code} (${row.asset_name}) ใบรับรองเลขที่ ${row.certificate_no} หมดอายุเมื่อวันที่ ${validUntil} (หมดอายุมาแล้ว ${Math.abs(certDiff)} วัน) ห้ามนำเครื่องมือไปใช้งานในกระบวนการผลิต`;
    } else {
      for (const t of certExpiringDays) {
        if (certDiff <= t) {
          notifType = `CERT_EXPIRING_${t}`;
          severity = t <= 30 ? 'WARNING' : 'INFO';
          title = `[ใบรับรองใกล้หมดอายุ ${t} วัน] เครื่องมือ ${row.asset_code} เหลือ ${certDiff} วัน`;
          message = `เครื่องมือ ${row.asset_code} (${row.asset_name}) ใบรับรองเลขที่ ${row.certificate_no} จะหมดอายุในวันที่ ${validUntil} (เหลือเวลาอีก ${certDiff} วัน) กรุณาประสานงานส่งสอบเทียบ`;
          break;
        }
      }
    }

    if (notifType) {
      const dedupKey = `CERT:${row.asset_id}:${notifType}`;
      await archiveResolved(db, dedupKey);
      const existing = await db.prepare("SELECT * FROM vcc_notifications WHERE dedup_key = ?").bind(dedupKey).first();

      if (existing) {
        let nextStatus = existing.status;
        if (existing.status === 'ACKNOWLEDGED' && notifType !== 'CERT_EXPIRED') {
          const daysSinceAck = existing.acknowledged_at ? diffDays(today, toBangkokDay(existing.acknowledged_at)) : 999;
          if (daysSinceAck > graceDays && certDiff <= 15) {
            nextStatus = 'PENDING';
          }
        }
        await db.prepare(`
          UPDATE vcc_notifications
          SET days_offset = ?, due_date = ?, status = ?, title = ?, message = ?, updated_at = ${NOW}
          WHERE dedup_key = ?
        `).bind(certDiff, validUntil, nextStatus, title, message, dedupKey).run();
        summary.updated++;
      } else {
        const notifId = `NTF-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        await db.prepare(`
          INSERT INTO vcc_notifications (
            id, dedup_key, notification_type, reference_type, reference_id,
            asset_id, work_order_id, department, target_role, escalation_level,
            severity, title, message, due_date, days_offset, status
          ) VALUES (?, ?, ?, 'VCC_ASSET', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
          ON CONFLICT(dedup_key) DO UPDATE SET
            days_offset = excluded.days_offset,
            due_date = excluded.due_date,
            title = excluded.title,
            message = excluded.message,
            updated_at = ${NOW}
        `).bind(
          notifId, dedupKey, notifType, row.asset_id, row.asset_id, row.wo_id,
          row.department, targetRole, escalationLevel, severity, title, message, validUntil, certDiff
        ).run();
        summary.created++;
        if (escalationLevel > 1) summary.escalated++;

        // Supersede earlier cert expiring warnings
        await db.prepare(`
          UPDATE vcc_notifications
          SET status = 'RESOLVED', resolved_at = ${NOW}, resolved_reason = 'SUPERSEDED_BY_EXPIRATION_ADVANCEMENT', updated_at = ${NOW}
          WHERE reference_type = 'VCC_ASSET' AND reference_id = ?
            AND notification_type LIKE 'CERT_EXPIRING_%' AND notification_type != ? AND status != 'RESOLVED'
        `).bind(row.asset_id, notifType).run();
      }
    } else {
      // If certificate is renewed (> 60 days remaining), auto-resolve old cert alerts
      if (certDiff > Math.max(...certExpiringDays)) {
        const res = await db.prepare(`
          UPDATE vcc_notifications
          SET status = 'RESOLVED', resolved_at = ${NOW}, resolved_reason = 'CERTIFICATE_RENEWED', updated_at = ${NOW}
          WHERE reference_type = 'VCC_ASSET' AND reference_id = ?
            AND (notification_type LIKE 'CERT_%') AND status != 'RESOLVED'
        `).bind(row.asset_id).run();
        summary.resolved += (res.meta?.changes || 0);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. ON_HOLD & NC: Independent Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────
  const { results: onHoldItems } = await db.prepare(`
    SELECT a.id AS asset_id, a.asset_code, a.name AS asset_name, a.department, a.status AS asset_status, a.hold_started_at,
           wo.id AS wo_id, wo.wo_code, wo.nc_status, wo.performed_at, wo.updated_at
    FROM vcc_assets a
    LEFT JOIN vcc_work_orders wo ON wo.asset_id = a.id AND wo.result_status = 'FAIL' AND wo.nc_status != 'RELEASED'
    WHERE a.status = 'ON_HOLD' OR (wo.id IS NOT NULL AND wo.nc_status = 'OPEN')
  `).all();

  for (const item of (onHoldItems || [])) {
    const startDate = toBangkokDay(item.hold_started_at || item.performed_at || item.updated_at || today);
    const daysOnHold = Math.max(0, diffDays(today, startDate));

    let notifType = 'NC_ON_HOLD_ACTION';
    let escalationLevel = 1;
    let targetRole = 'PERFORMER';
    let severity = 'CRITICAL';
    let title = `[เครื่องมือถูกระงับใช้/NC] เครื่องมือ ${item.asset_code} ติดสถานะ ON_HOLD (${daysOnHold} วัน)`;
    let message = `เครื่องมือ ${item.asset_code} (${item.asset_name}) ถูกระงับการใช้งานเนื่องจากผลสอบเทียบไม่ผ่านเกณฑ์ อยู่ระหว่างรอการประเมินผลกระทบต่อผลิตภัณฑ์ (ติดสถานะมาแล้ว ${daysOnHold} วัน)`;

    if (daysOnHold >= onHoldEscalationDays) {
      notifType = 'NC_ON_HOLD_ESCALATED';
      escalationLevel = 3;
      targetRole = 'QMR_L6';
      title = `[ยกระดับ NC/ON_HOLD] เครื่องมือ ${item.asset_code} ระงับการใช้งานเกิน ${daysOnHold} วัน`;
      message = `เครื่องมือ ${item.asset_code} (${item.asset_name}) ติดสถานะ ON_HOLD เกินเกณฑ์ควบคุม ${onHoldEscalationDays} วัน ขอให้ผู้จัดการฝ่าย QA และ QMR เร่งรัดการประเมินความเสี่ยงและกำหนดแนวทางจัดการ`;
    }

    const dedupKey = `NC:${item.asset_id}:${notifType}`;
    await archiveResolved(db, dedupKey);
    const existing = await db.prepare("SELECT * FROM vcc_notifications WHERE dedup_key = ?").bind(dedupKey).first();

    if (existing) {
      let nextStatus = existing.status;
      if (existing.status === 'ACKNOWLEDGED' && notifType === 'NC_ON_HOLD_ESCALATED') {
        const daysSinceAck = existing.acknowledged_at ? diffDays(today, toBangkokDay(existing.acknowledged_at)) : 999;
        if (daysSinceAck > graceDays) {
          nextStatus = 'PENDING';
        }
      }
      await db.prepare(`
        UPDATE vcc_notifications
        SET days_offset = ?, status = ?, title = ?, message = ?, updated_at = ${NOW}
        WHERE dedup_key = ?
      `).bind(daysOnHold, nextStatus, title, message, dedupKey).run();
      summary.updated++;
    } else {
      const notifId = `NTF-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      await db.prepare(`
        INSERT INTO vcc_notifications (
          id, dedup_key, notification_type, reference_type, reference_id,
          asset_id, work_order_id, department, target_role, escalation_level,
          severity, title, message, days_offset, status
        ) VALUES (?, ?, ?, 'VCC_ASSET', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        ON CONFLICT(dedup_key) DO UPDATE SET
          days_offset = excluded.days_offset,
          title = excluded.title,
          message = excluded.message,
          updated_at = ${NOW}
      `).bind(
        notifId, dedupKey, notifType, item.asset_id, item.asset_id, item.wo_id,
        item.department, targetRole, escalationLevel, severity, title, message, daysOnHold
      ).run();
      summary.created++;
      if (escalationLevel > 1) summary.escalated++;

      // Supersede lower tier NC action
      await db.prepare(`
        UPDATE vcc_notifications
        SET status = 'RESOLVED', resolved_at = ${NOW}, resolved_reason = 'SUPERSEDED_BY_ESCALATION', updated_at = ${NOW}
        WHERE reference_type = 'VCC_ASSET' AND reference_id = ?
          AND notification_type = 'NC_ON_HOLD_ACTION' AND notification_type != ? AND status != 'RESOLVED'
      `).bind(item.asset_id, notifType).run();
    }
  }

  // Auto-resolve ON_HOLD notifications only for assets that are ACTIVE and have no open NC
  const releasedRes = await db.prepare(`
    UPDATE vcc_notifications
    SET status = 'RESOLVED', resolved_at = ${NOW}, resolved_reason = 'HOLD_RELEASED', updated_at = ${NOW}
    WHERE reference_type = 'VCC_ASSET' AND notification_type LIKE 'NC_ON_HOLD_%' AND status != 'RESOLVED'
      AND reference_id IN (
        SELECT a.id FROM vcc_assets a
        WHERE a.status = 'ACTIVE'
          AND NOT EXISTS (
            SELECT 1 FROM vcc_work_orders w
            WHERE w.asset_id = a.id AND w.result_status = 'FAIL' AND w.nc_status = 'OPEN'
          )
      )
  `).run();
  summary.resolved += (releasedRes.meta?.changes || 0);

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. AUTO-RESOLVE: Work Order CLOSED/CANCELLED only resolves WO notifications
  // Rule: "Work Order CLOSED ต้องไม่ปิด NC หรือ Certificate Alerts ที่ยังมีความเสี่ยง"
  // ─────────────────────────────────────────────────────────────────────────────
  const closedRes = await db.prepare(`
    UPDATE vcc_notifications
    SET status = 'RESOLVED', resolved_at = ${NOW}, resolved_reason = 'WORK_ORDER_COMPLETED', updated_at = ${NOW}
    WHERE reference_type = 'VCC_WORK_ORDER' AND status != 'RESOLVED'
      AND reference_id IN (SELECT id FROM vcc_work_orders WHERE status IN ('CLOSED', 'CANCELLED'))
  `).run();
  summary.resolved += (closedRes.meta?.changes || 0);

  return summary;
};

/**
 * Maps active notifications to Task Inbox tasks for a given user
 */
export const fetchNotificationTasks = async (db, user) => {
  if (!user) return [];
  const { results: notifs } = await db.prepare(`
    SELECT n.*, a.asset_code, a.name AS asset_name, wo.wo_code
    FROM vcc_notifications n
    JOIN vcc_assets a ON a.id = n.asset_id
    LEFT JOIN vcc_work_orders wo ON wo.id = n.work_order_id
    WHERE n.status IN ('PENDING', 'ACKNOWLEDGED')
    ORDER BY n.escalation_level DESC, n.created_at DESC
  `).all();

  const tasks = [];

  for (const n of (notifs || [])) {
    if (!canActOnNotification(user, n)) continue;

    const docCode = n.wo_code || n.asset_code;
    const isOverdue = n.notification_type.startsWith('OVERDUE');
    const isCert = n.notification_type.startsWith('CERT');
    const isNc = n.notification_type.startsWith('NC');

    tasks.push({
      id: `api-vcc-notif-${n.id}`,
      notificationId: n.id,
      referenceId: n.reference_id,
      referenceType: n.reference_type,
      workOrderId: n.work_order_id,
      assetId: n.asset_id,
      docCode,
      document_code: docCode,
      docTitle: n.title,
      docName: `${n.asset_code} - ${n.asset_name}`,
      title: n.title,
      message: n.message,
      type: n.severity === 'CRITICAL' ? 'Critical' : (n.severity === 'WARNING' ? 'Warning' : 'Alert'),
      taskType: 'VCC_NOTIFICATION_ALERT',
      task_type: 'VCC_NOTIFICATION_ALERT',
      category: isOverdue ? 'OVERDUE' : (isCert ? 'CERT_EXPIRING' : (isNc ? 'ON_HOLD_NC' : 'ALERT')),
      department: n.department,
      target_department: n.department,
      owner_dept: n.department,
      severity: n.severity,
      escalation_level: n.escalation_level,
      days_offset: n.days_offset,
      due_date: n.due_date,
      notification_status: n.status,
      is_acknowledged: n.status === 'ACKNOWLEDGED',
      acknowledged_by: n.acknowledged_by,
      acknowledged_at: n.acknowledged_at,
      acknowledgement_note: n.acknowledgement_note,
      createdAt: n.created_at
    });
  }

  return tasks;
};

/**
 * Register VCC Notification routes
 */
export const registerVccNotificationRoutes = (app, { requireAuth, audit }) => {
  // 1. GET /api/vcc/notifications — query notification audit logs with multi-dept RBAC
  app.get('/api/vcc/notifications', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const hasGlobalAccess = Boolean(user.isDcc || user.isQmr || Number(user.approval_level || 0) >= 6);
    const userDepts = getUserDepartments(user);

    const requestedDept = c.req.query('department');
    if (requestedDept) {
      if (!hasGlobalAccess && !userDepts.includes(requestedDept)) {
        return c.json({ error: `คุณไม่มีสิทธิ์เข้าถึงข้อมูลการแจ้งเตือนของแผนก ${requestedDept}` }, 403);
      }
    }

    const status = c.req.query('status'); // PENDING, ACKNOWLEDGED, RESOLVED, ALL
    const type = c.req.query('type');
    const level = c.req.query('escalation_level');
    const severity = c.req.query('severity');
    const limit = Math.min(200, Math.max(1, Number(c.req.query('limit')) || 50));
    const offset = Math.max(0, Number(c.req.query('offset')) || 0);

    const conditions = [];
    const bindings = [];

    if (!hasGlobalAccess && !requestedDept) {
      if (userDepts.length === 0) {
        return c.json({ notifications: [], total: 0 });
      }
      conditions.push(`n.department IN (${userDepts.map(() => '?').join(',')})`);
      bindings.push(...userDepts);
    } else if (requestedDept) {
      conditions.push('n.department = ?');
      bindings.push(requestedDept);
    }

    if (status && status !== 'ALL') {
      conditions.push('n.status = ?');
      bindings.push(status);
    }
    if (type) {
      conditions.push('n.notification_type = ?');
      bindings.push(type);
    }
    if (level) {
      conditions.push('n.escalation_level = ?');
      bindings.push(Number(level));
    }
    if (severity) {
      conditions.push('n.severity = ?');
      bindings.push(severity);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = await db.prepare(`
      SELECT COUNT(*) AS total
      FROM vcc_notifications n
      ${whereClause}
    `).bind(...bindings).first();

    const { results: rows } = await db.prepare(`
      SELECT n.*, a.asset_code, a.name AS asset_name, wo.wo_code, u.name AS acknowledged_by_name
      FROM vcc_notifications n
      JOIN vcc_assets a ON a.id = n.asset_id
      LEFT JOIN vcc_work_orders wo ON wo.id = n.work_order_id
      LEFT JOIN users u ON u.id = n.acknowledged_by
      ${whereClause}
      ORDER BY n.created_at DESC, n.escalation_level DESC
      LIMIT ? OFFSET ?
    `).bind(...bindings, limit, offset).all();

    return c.json({
      notifications: rows || [],
      total: countRow?.total || 0,
      limit,
      offset
    });
  });

  // 2. POST /api/vcc/notifications/:id/acknowledge — Acknowledge an alert without altering Work Order/Asset state
  app.post('/api/vcc/notifications/:id/acknowledge', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const note = body.note ? String(body.note).trim() : null;

    const notif = await db.prepare("SELECT * FROM vcc_notifications WHERE id = ?").bind(id).first();
    if (!notif) {
      return c.json({ error: 'ไม่พบรายการแจ้งเตือนที่ระบุ' }, 404);
    }

    // RBAC: same department/tier rule that decides who the alert is routed to
    if (!canActOnNotification(user, notif)) {
      return c.json({ error: `คุณไม่มีสิทธิ์รับทราบการแจ้งเตือนนี้ (แผนก ${notif.department} ระดับยกระดับ L${notif.escalation_level})` }, 403);
    }

    if (notif.status === 'RESOLVED') {
      return c.json({ error: 'รายการแจ้งเตือนนี้เสร็จสิ้นหรือถูกยกเลิกแล้ว ไม่สามารถรับทราบซ้ำได้' }, 400);
    }
    // A second acknowledgement would restart the grace period and delay the next alert
    if (notif.status === 'ACKNOWLEDGED') {
      return c.json({ error: 'รายการแจ้งเตือนนี้ถูกรับทราบแล้ว' }, 409);
    }

    // Rule: "Acknowledgement ห้ามเปลี่ยนสถานะ Work Order, Asset, NC หรือ Approval"
    // We update ONLY vcc_notifications
    const [ackResult] = await db.batch([
      db.prepare(`
        UPDATE vcc_notifications
        SET status = 'ACKNOWLEDGED',
            acknowledged_at = ${NOW},
            acknowledged_by = ?,
            acknowledgement_note = ?,
            updated_at = ${NOW}
        WHERE id = ? AND status = 'PENDING'
      `).bind(user.id, note, id),
      audit(db, user.id, 'VCC_NOTIFICATION_ACKNOWLEDGED', {
        notification_id: id,
        notification_type: notif.notification_type,
        reference_type: notif.reference_type,
        reference_id: notif.reference_id,
        asset_id: notif.asset_id,
        department: notif.department,
        note
      })
    ]);
    // Lost a race (swept/acknowledged between the read above and the write)
    if (!ackResult.meta?.changes) {
      return c.json({ error: 'สถานะการแจ้งเตือนเปลี่ยนไปแล้ว กรุณารีเฟรชแล้วลองอีกครั้ง' }, 409);
    }

    const updated = await db.prepare(`
      SELECT n.*, a.asset_code, a.name AS asset_name, u.name AS acknowledged_by_name
      FROM vcc_notifications n
      JOIN vcc_assets a ON a.id = n.asset_id
      LEFT JOIN users u ON u.id = n.acknowledged_by
      WHERE n.id = ?
    `).bind(id).first();

    return c.json({ success: true, notification: updated });
  });

  // 3. POST /api/vcc/notifications/sweep — Manual On-Demand trigger for DCC / testing
  app.post('/api/vcc/notifications/sweep', requireAuth, requireDccOnly, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const nowDate = body.now_date ? String(body.now_date).slice(0, 10) : undefined;

    const summary = await runVccNotificationSweep(db, { nowDate, actorId: user.id });

    await audit(db, user.id, 'VCC_MANUAL_NOTIFICATION_SWEEP_EXECUTED', {
      now_date: nowDate || getBangkokDate(),
      ...summary
    }).run().catch(() => {});

    return c.json({
      success: true,
      sweep_date: nowDate || getBangkokDate(),
      summary
    });
  });

  // 4. GET /api/vcc/export/notifications-audit — Paperless Auditor CSV Export
  app.get('/api/vcc/export/notifications-audit', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const hasGlobalAccess = Boolean(user.isDcc || user.isQmr || Number(user.approval_level || 0) >= 6);
    const userDepts = getUserDepartments(user);

    const requestedDept = c.req.query('department');
    if (requestedDept) {
      if (!hasGlobalAccess && !userDepts.includes(requestedDept)) {
        return c.json({ error: `คุณไม่มีสิทธิ์ส่งออกข้อมูลของแผนก ${requestedDept}` }, 403);
      }
    }

    const conditions = [];
    const bindings = [];

    if (!hasGlobalAccess && !requestedDept) {
      if (userDepts.length === 0) {
        return new Response('\uFEFF', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
      }
      conditions.push(`n.department IN (${userDepts.map(() => '?').join(',')})`);
      bindings.push(...userDepts);
    } else if (requestedDept) {
      conditions.push('n.department = ?');
      bindings.push(requestedDept);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { results: rows } = await db.prepare(`
      SELECT n.*, a.asset_code, a.name AS asset_name, wo.wo_code, u.name AS acknowledged_by_name
      FROM vcc_notifications n
      JOIN vcc_assets a ON a.id = n.asset_id
      LEFT JOIN vcc_work_orders wo ON wo.id = n.work_order_id
      LEFT JOIN users u ON u.id = n.acknowledged_by
      ${whereClause}
      ORDER BY n.created_at DESC
    `).bind(...bindings).all();

    await audit(db, user.id, 'VCC_EXPORT_NOTIFICATION_AUDIT', {
      department: requestedDept || (hasGlobalAccess ? 'ALL' : userDepts.join(',')),
      records_count: rows ? rows.length : 0
    }).run().catch(() => {});

    const headers = [
      'Notification ID',
      'Created Date',
      'Department',
      'Asset Code',
      'Asset Name',
      'Work Order',
      'Type',
      'Severity',
      'Escalation Level',
      'Due Date',
      'Days Offset',
      'Status',
      'Acknowledged By',
      'Acknowledged At',
      'Acknowledgement Note',
      'Resolved At',
      'Resolved Reason'
    ];

    const lines = [
      headers.join(','),
      ...(rows || []).map((r) => [
        csvCell(r.id),
        csvCell(r.created_at),
        csvCell(r.department),
        csvCell(r.asset_code),
        csvCell(r.asset_name),
        csvCell(r.wo_code || '-'),
        csvCell(r.notification_type),
        csvCell(r.severity),
        csvCell(r.escalation_level),
        csvCell(r.due_date || '-'),
        csvCell(r.days_offset),
        csvCell(r.status),
        csvCell(r.acknowledged_by_name || '-'),
        csvCell(r.acknowledged_at || '-'),
        csvCell(r.acknowledgement_note || '-'),
        csvCell(r.resolved_at || '-'),
        csvCell(r.resolved_reason || '-')
      ].join(','))
    ];

    return new Response(`\uFEFF${lines.join('\r\n')}\r\n`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="VCC_Notification_Audit_${getBangkokDate()}.csv"`,
        'Cache-Control': 'no-store'
      }
    });
  });
};

