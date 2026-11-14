import { getThresholds } from './approval.js';
import { computeDueDateForMonth, isUserAuthorizedForPlanDept, getUserDepartments } from './vccPlans.js';
import { requireVccAccess, requireDccOnly, canReadVccDepartment, vccDeptScopeSql, VCC_DEPT_FORBIDDEN, canManageVccAsset } from './vccAuth.js';
import { woEventNotice, ncHoldNoticeStatements } from './vccNotifications.js';

const NOW = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')";

// Goes right after a status-guarded UPDATE inside db.batch(): when that UPDATE matched no row (a double click, or another
// request changed the state first) json() raises, D1 rolls the whole batch back, so no second or contradicting audit row is kept.
const assertRowUpdated = (db) => db.prepare("SELECT json(CASE WHEN changes() = 0 THEN 'stale' ELSE '1' END)");
const STATE_CHANGED = { error: 'สถานะของรายการนี้ถูกเปลี่ยนไปแล้ว (อาจกดซ้ำหรือมีผู้อื่นดำเนินการก่อน) กรุณารีเฟรชหน้าจอ' };
// Runs a state-transition batch; returns a 409 response when the guard fired, otherwise null.
const runTransition = async (c, db, statements) => {
  try {
    await db.batch(statements);
    return null;
  } catch (err) {
    if (/malformed JSON/.test(String(err?.message))) return c.json(STATE_CHANGED, 409);
    throw err;
  }
};
const DCC_ONLY = { error: 'เฉพาะเจ้าหน้าที่ DCC เท่านั้นที่เข้าถึงระบบ VCC ได้' };

const WORK_ORDER_SETTINGS_KEY = 'vcc_work_order_settings';

export const DEFAULT_WORK_ORDER_SETTINGS = {
  retention_years: 3,
  approval_doc_type: 'FM',
  default_acceptance_criteria: [
    '± 0.5 °C ตามเกณฑ์โรงงาน',
    '± 1.0 g ตามพิกัดเครื่องชั่ง',
    'ผ่านเกณฑ์ตามใบรับรองการสอบเทียบ',
    '± 0.02 mm ตามเกณฑ์เวอร์เนียร์คาลิปเปอร์'
  ]
};

const VALID_WO_STATUSES = new Set(['SCHEDULED', 'OPEN', 'IN_PROGRESS', 'PENDING_REVIEW', 'REJECTED', 'CLOSED', 'CANCELLED']);
export const VALID_CANCELLATION_CATEGORIES = new Set(['PLAN_REVISION', 'MISTAKE_CREATION', 'ASSET_RETIRED', 'AUTHORIZED_CANCEL']);
// A person may only use these; PLAN_REVISION / ASSET_RETIRED drop the plan cycle for good and are set by plan revision itself.
const MANUAL_CANCELLATION_CATEGORIES = new Set(['MISTAKE_CREATION', 'AUTHORIZED_CANCEL']);
const VALID_RESULT_STATUSES = new Set(['PASS', 'FAIL', 'INCONCLUSIVE']);
// FAIL and INCONCLUSIVE both mean the instrument is not confirmed fit: it goes ON_HOLD with an open NC until an L5+ releases it.
const HOLDING_RESULTS = new Set(['FAIL', 'INCONCLUSIVE']);
const AMEND_TO_INCONCLUSIVE_ERROR = 'ใบสั่งงานที่ปิดแล้วต้องมีผล PASS หรือ FAIL เท่านั้น หากต้องตรวจซ้ำให้เปิดใบสั่งงานใหม่';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// A SCHEDULED work order becomes a "record the result" task this many days before its due date.
const WORK_TASK_LEAD_DAYS = 30;

export const getBangkokDateString = (date = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
};

export const readWorkOrderSettings = async (db) => {
  const row = await db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .bind(WORK_ORDER_SETTINGS_KEY)
    .first()
    .catch(() => null);
  if (!row?.value) return { ...DEFAULT_WORK_ORDER_SETTINGS };
  try {
    const parsed = JSON.parse(row.value);
    return {
      retention_years: Number(parsed?.retention_years) > 0 ? Number(parsed.retention_years) : DEFAULT_WORK_ORDER_SETTINGS.retention_years,
      approval_doc_type: String(parsed?.approval_doc_type || DEFAULT_WORK_ORDER_SETTINGS.approval_doc_type).trim().toUpperCase(),
      default_acceptance_criteria:
        Array.isArray(parsed?.default_acceptance_criteria) && parsed.default_acceptance_criteria.length > 0
          ? parsed.default_acceptance_criteria
          : [...DEFAULT_WORK_ORDER_SETTINGS.default_acceptance_criteria]
    };
  } catch {
    return { ...DEFAULT_WORK_ORDER_SETTINGS };
  }
};

export const MAX_CERTIFICATE_PDF_BYTES = 25 * 1024 * 1024; // 25 MB

export const computeSha256 = async (bytes) => {
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const fetchWorkOrder = async (db, id) => {
  const wo = await db.prepare(`
    SELECT w.*,
      a.asset_code,
      a.name AS asset_name,
      a.asset_type,
      a.department,
      a.location,
      a.is_group,
      a.group_nature,
      a.composite_details,
      a.parent_id,
      p.asset_code AS parent_asset_code,
      d.name_th AS department_name_th,
      pl.plan_year,
      pl.document_code AS plan_document_code,
      pl.revision AS plan_revision,
      u_perf.name AS performed_by_name,
      u_rev.name AS reviewed_by_name,
      u_rel.name AS hold_released_by_name,
      u_canc.name AS cancelled_by_name,
      u_cert.name AS certificate_uploaded_by_name,
      u_amend.name AS amended_by_name,
      u_resq.name AS reschedule_requested_by_name,
      u_resapp.name AS reschedule_approved_by_name
    FROM vcc_work_orders w
    JOIN vcc_assets a ON a.id = w.asset_id
    LEFT JOIN vcc_assets p ON p.id = a.parent_id
    LEFT JOIN departments d ON d.code = a.department
    LEFT JOIN vcc_annual_plans pl ON pl.id = w.plan_id
    LEFT JOIN users u_perf ON u_perf.id = w.performed_by
    LEFT JOIN users u_rev ON u_rev.id = w.reviewed_by
    LEFT JOIN users u_rel ON u_rel.id = w.hold_released_by
    LEFT JOIN users u_canc ON u_canc.id = w.cancelled_by
    LEFT JOIN users u_cert ON u_cert.id = w.certificate_uploaded_by
    LEFT JOIN users u_amend ON u_amend.id = w.amended_by
    LEFT JOIN users u_resq ON u_resq.id = w.reschedule_requested_by
    LEFT JOIN users u_resapp ON u_resapp.id = w.reschedule_approved_by
    WHERE w.id = ?
  `).bind(id).first();

  if (!wo) return null;

  let childAssets = [];
  let isLegacyWithoutSnapshot = false;
  if (wo.child_assets_snapshot) {
    try {
      childAssets = JSON.parse(wo.child_assets_snapshot);
    } catch {
      childAssets = [];
    }
  } else if (wo.status === 'CLOSED') {
    // For legacy closed work orders predating snapshot capture:
    // Do NOT query live register and claim it as a verified historical snapshot.
    childAssets = [];
    isLegacyWithoutSnapshot = true;
  } else {
    const { results } = await db.prepare(`
      SELECT id, asset_code, name, asset_type, serial_no, model, location, status
      FROM vcc_assets
      WHERE parent_id = ?
      ORDER BY asset_code ASC
    `).bind(wo.asset_id).all().catch(() => ({ results: [] }));
    childAssets = results || [];
  }

  return {
    ...wo,
    recorded_by: wo.performed_by,
    recorded_by_name: wo.performed_by_name,
    closed_by: wo.status === 'CLOSED' ? (wo.reviewed_by || wo.performed_by) : null,
    closed_by_name: wo.status === 'CLOSED' ? (wo.reviewed_by_name || wo.performed_by_name) : null,
    verified_by: wo.reviewed_by !== wo.performed_by ? wo.reviewed_by : null,
    verified_by_name: wo.reviewed_by !== wo.performed_by ? wo.reviewed_by_name : null,
    child_assets: Array.isArray(childAssets) ? childAssets : [],
    is_legacy_without_snapshot: isLegacyWithoutSnapshot
  };
};

export const generateWorkOrdersForApprovedPlan = async (db, planId, actorId, audit) => {
  const maxRetries = 3;
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await _generateWorkOrdersForApprovedPlan(db, planId, actorId, audit);
    } catch (err) {
      lastError = err;
      const isConcurrency = /UNIQUE|conflict|busy|locked/i.test(String(err?.message));
      if (isConcurrency && attempt < maxRetries) {
        await new Promise((res) => setTimeout(res, 50 * attempt + Math.floor(Math.random() * 50)));
        continue;
      }
      console.error(`generateWorkOrdersForApprovedPlan attempt ${attempt} failed:`, err);
      throw err;
    }
  }
  throw lastError;
};

export const buildWorkOrderReconciliationStatements = async (db, planId, actorId) => {
  const plan = await db
    .prepare('SELECT id, plan_year, department, revision, document_code, status, due_date_rule, effective_status FROM vcc_annual_plans WHERE id = ?')
    .bind(planId)
    .first();

  if (!plan) return { error: 'ไม่พบแผนการสอบเทียบประจำปี', batchStatements: [], generated: [], reconciled: [], skipped: [] };
  if (plan.status !== 'APPROVED' && plan.status !== 'PENDING_APPROVAL') {
    return { error: 'แผนต้องอยู่ในสถานะ APPROVED หรือ PENDING_APPROVAL', batchStatements: [], generated: [], reconciled: [], skipped: [] };
  }
  if (plan.effective_status === 'SUPERSEDED') {
    return { error: 'ไม่สามารถสร้างหรือซิงค์ใบสั่งงานจากแผนที่ถูกแทนที่แล้ว (SUPERSEDED)', batchStatements: [], generated: [], reconciled: [], skipped: [] };
  }

  const planYear = Number(plan.plan_year);
  const planDept = plan.department;
  const planRevision = plan.revision || '00';
  const dueDateRule = plan.due_date_rule || 'END_OF_MONTH';

  const { results: rawItems } = await db
    .prepare(`
      SELECT i.*,
             a.asset_code,
             a.name AS asset_name,
             a.is_group,
             a.group_nature,
             a.status AS asset_status
      FROM vcc_annual_plan_items i
      JOIN vcc_assets a ON a.id = i.asset_id
      WHERE i.plan_id = ?
      ORDER BY i.sort_order ASC, i.id ASC
    `)
    .bind(planId)
    .all();

  const calibratableItems = (rawItems || []).filter(
    (i) => Number(i.is_group) === 0 || i.group_nature === 'COMPOSITE_SET'
  );

  // Retrieve existing cycle records across revisions of this plan year & department
  const { results: existingCycles } = await db
    .prepare(`
      SELECT c.id, c.plan_id, c.plan_item_id, c.asset_id, c.cycle_seq, c.planned_month, c.cycle_status, c.initial_cycle_id
      FROM vcc_plan_cycles c
      JOIN vcc_annual_plans p ON p.id = c.plan_id
      WHERE p.plan_year = ? AND p.department = ?
      ORDER BY p.revision ASC, c.created_at ASC
    `)
    .bind(planYear, planDept)
    .all();

  const existingCyclesById = new Map();
  const existingPlanCyclesMap = new Map();
  const existingAssetSeqCycleMap = new Map();
  for (const c of (existingCycles || [])) {
    existingCyclesById.set(c.id, c);
    if (c.plan_id === planId) {
      existingPlanCyclesMap.set(`${c.plan_item_id}:${c.cycle_seq}`, c);
    }
    existingAssetSeqCycleMap.set(`${c.asset_id}:${c.cycle_seq}`, c);
  }

  // Query permanently cancelled work orders (strictly retired assets)
  const { results: permanentlyCancelledWos } = await db
    .prepare(`
      SELECT cycle_id, cancellation_category
      FROM vcc_work_orders
      WHERE status = 'CANCELLED'
        AND cycle_id IS NOT NULL
        AND cancellation_category = 'ASSET_RETIRED'
    `)
    .all();
  const permanentlyCancelledCycleIds = new Set(
    (permanentlyCancelledWos || []).map((w) => w.cycle_id)
  );

  const targetCycles = [];
  const cycleBatchInserts = [];
  const activeCycleIdsInNewRevision = new Set();

  for (const item of calibratableItems) {
    let months = [];
    try {
      months = Array.isArray(item.planned_months) ? item.planned_months : JSON.parse(item.planned_months || '[]');
    } catch {
      months = [];
    }
    const cleanMonths = months.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12).sort((a, b) => a - b);

    let initialCycleIds = [];
    try {
      initialCycleIds = Array.isArray(item.initial_cycle_ids)
        ? item.initial_cycle_ids
        : JSON.parse(item.initial_cycle_ids || '[]');
    } catch {
      initialCycleIds = [];
    }

    const monthCounts = new Map();
    for (const m of cleanMonths) {
      monthCounts.set(m, (monthCounts.get(m) || 0) + 1);
    }
    const monthSeen = new Map();

    let seq = 0;
    for (let idx = 0; idx < cleanMonths.length; idx++) {
      seq += 1;
      const month = cleanMonths[idx];
      const seen = (monthSeen.get(month) || 0) + 1;
      monthSeen.set(month, seen);

      const existingPlanCycle = existingPlanCyclesMap.get(`${item.id}:${seq}`);
      const existingCrossRevCycle = existingAssetSeqCycleMap.get(`${item.asset_id}:${seq}`);

      // Row ID for vcc_plan_cycles row
      const cycleRowId = existingPlanCycle ? existingPlanCycle.id : crypto.randomUUID();

      // Stable immutable cycle lineage ID
      let stableCycleId = initialCycleIds[idx] || null;
      if (!stableCycleId && existingPlanCycle) {
        stableCycleId = existingPlanCycle.initial_cycle_id || existingPlanCycle.id;
      }
      if (!stableCycleId && initialCycleIds.length === 0 && existingCrossRevCycle) {
        stableCycleId = existingCrossRevCycle.initial_cycle_id || existingCrossRevCycle.id;
      }
      if (!stableCycleId) {
        stableCycleId = cycleRowId;
      }

      activeCycleIdsInNewRevision.add(stableCycleId);
      let itemDueDates = [];
      try {
        itemDueDates = Array.isArray(item.due_dates) ? item.due_dates : JSON.parse(item.due_dates || '[]');
      } catch {
        itemDueDates = [];
      }
      const customItemDueDate = itemDueDates[idx];
      const dueDate = (customItemDueDate && typeof customItemDueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(customItemDueDate))
        ? customItemDueDate
        : computeDueDateForMonth(planYear, month, dueDateRule);
      const cycleKey = (monthCounts.get(month) || 0) > 1
        ? `${planYear}:${planDept}:${item.asset_id}:${month}#${seen}`
        : `${planYear}:${planDept}:${item.asset_id}:${month}`;

      if (!existingPlanCycle) {
        cycleBatchInserts.push(
          db.prepare(`
            INSERT OR REPLACE INTO vcc_plan_cycles (
              id, plan_id, plan_item_id, asset_id, cycle_seq, planned_month, baseline_planned_date, cycle_status, initial_cycle_id, plan_revision, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?, ?)
          `).bind(cycleRowId, planId, item.id, item.asset_id, seq, month, dueDate, stableCycleId, planRevision, actorId)
        );
      } else {
        cycleBatchInserts.push(
          db.prepare(`
            UPDATE vcc_plan_cycles
            SET plan_id = ?,
                plan_item_id = ?,
                cycle_seq = ?,
                planned_month = ?,
                baseline_planned_date = ?,
                cycle_status = CASE WHEN cycle_status = 'CANCELLED' THEN 'SCHEDULED' ELSE cycle_status END,
                initial_cycle_id = ?,
                plan_revision = ?,
                updated_at = ${NOW},
                updated_by = ?
            WHERE id = ?
          `).bind(planId, item.id, seq, month, dueDate, stableCycleId, planRevision, actorId, cycleRowId)
        );
      }

      targetCycles.push({
        cycleId: stableCycleId,
        cycleRowId,
        cycleSeq: seq,
        item,
        month,
        cycleKey,
        dueDate,
        isCancelled: permanentlyCancelledCycleIds.has(stableCycleId)
      });
    }
  }

  // Find all active work orders for this plan year and department (including items removed in newer revisions)
  const { results: existingWos } = await db
    .prepare(`
      SELECT id, wo_code, cycle_id, cycle_key, plan_id, plan_item_id, asset_id, planned_month, plan_year, plan_revision, due_date,
             original_due_date, scheduled_date, baseline_planned_date, required_due_date, reschedule_reason, status, result_status, provider_name
      FROM vcc_work_orders
      WHERE status != 'CANCELLED'
        AND (
          plan_id = ?
          OR plan_id IN (SELECT id FROM vcc_annual_plans WHERE plan_year = ? AND department = ?)
          OR (
            (plan_year = ? OR substr(due_date, 1, 4) = ?)
            AND asset_id IN (
              SELECT i.asset_id
              FROM vcc_annual_plan_items i
              JOIN vcc_annual_plans p ON p.id = i.plan_id
              WHERE p.plan_year = ? AND p.department = ?
            )
          )
        )
    `)
    .bind(planId, planYear, planDept, planYear, String(planYear), planYear, planDept)
    .all();

  // Also query work orders previously soft-cancelled by PLAN_REVISION for Case C reactivation
  const { results: cancelledRevisionWos } = await db
    .prepare(`
      SELECT id, wo_code, cycle_id, cycle_key, plan_id, plan_item_id, asset_id, planned_month, plan_year, plan_revision, due_date,
             original_due_date, scheduled_date, baseline_planned_date, required_due_date, reschedule_reason, status, result_status, provider_name
      FROM vcc_work_orders
      WHERE status = 'CANCELLED'
        AND cancellation_category = 'PLAN_REVISION'
        AND (
          plan_id IN (SELECT id FROM vcc_annual_plans WHERE plan_year = ? AND department = ?)
          OR plan_year = ?
          OR substr(due_date, 1, 4) = ?
        )
      ORDER BY updated_at DESC, created_at DESC
    `)
    .bind(planYear, planDept, planYear, String(planYear))
    .all();

  const byCycleId = new Map();
  const byCycleKey = new Map();
  for (const wo of (existingWos || [])) {
    if (wo.cycle_id) byCycleId.set(wo.cycle_id, wo);
    if (wo.cycle_key) byCycleKey.set(wo.cycle_key, wo);
  }

  const { results: yearWos } = await db
    .prepare('SELECT wo_code FROM vcc_work_orders WHERE wo_code LIKE ?')
    .bind(`WO-${planYear}-%`)
    .all();

  let maxSeq = 0;
  for (const row of (yearWos || [])) {
    const parts = (row.wo_code || '').split('-');
    if (parts.length >= 3) {
      const num = parseInt(parts[2], 10);
      if (!Number.isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }

  const generated = [];
  const reconciled = [];
  const skipped = [];
  const matched = [];
  const unmatched = [];
  const ambiguous = [];
  const batchStatements = [...cycleBatchInserts];
  const boundWoIds = new Set();

  for (const cycle of targetCycles) {
    const { cycleId, cycleRowId, item, month, cycleKey, dueDate, isCancelled } = cycle;

    if (isCancelled) {
      skipped.push({
        cycle_id: cycleId,
        asset_id: item.asset_id,
        planned_month: month,
        reason: 'รอบสอบเทียบนี้ถูกยกเลิกอย่างถาวรแล้ว (CANCELLED)'
      });
      continue;
    }

    // 1. Direct match by immutable cycle_id
    let candidateWos = [];
    const directWo = byCycleId.get(cycleId);

    if (directWo && !boundWoIds.has(directWo.id)) {
      candidateWos = [directWo];
    } else {
      // 2. Match unassigned work orders OR existing work orders for the exact same asset + month + year whose old cycle_id is not claimed by another cycle in this revision
      candidateWos = (existingWos || []).filter((w) => {
        if (boundWoIds.has(w.id)) return false;
        if (w.cycle_id) {
          if (w.cycle_id === cycleId) return true;
          if (!activeCycleIdsInNewRevision.has(w.cycle_id) && w.asset_id === item.asset_id && Number(w.planned_month) === Number(month)) {
            const woYear = w.plan_year || (w.due_date ? parseInt(w.due_date.slice(0, 4), 10) : null);
            return Number(woYear) === Number(planYear);
          }
          return false;
        }
        if (w.plan_item_id && w.plan_item_id === item.id && Number(w.planned_month) === Number(month)) return true;
        if (w.asset_id === item.asset_id) {
          const woMonth = w.planned_month || (w.due_date ? parseInt(w.due_date.slice(5, 7), 10) : null);
          const woYear = w.plan_year || (w.due_date ? parseInt(w.due_date.slice(0, 4), 10) : null);
          return Number(woMonth) === Number(month) && Number(woYear) === Number(planYear);
        }
        return false;
      });
    }

    if (candidateWos.length === 1) {
      // Case A & Case E: Existing active work order matched
      const matchedWo = candidateWos[0];
      boundWoIds.add(matchedWo.id);
      const effectiveCycleId = matchedWo.cycle_id || cycleId;
      activeCycleIdsInNewRevision.add(effectiveCycleId);
      matched.push({ wo_id: matchedWo.id, wo_code: matchedWo.wo_code, cycle_id: effectiveCycleId, cycle_key: cycleKey });

      if (matchedWo.status === 'CLOSED') {
        // Case A (CLOSED): Evidence Protection — NEVER overwrite closure evidence on CLOSED work orders
        if (!matchedWo.cycle_id || !matchedWo.plan_item_id || matchedWo.plan_id !== planId) {
          batchStatements.push(
            db.prepare(`
              UPDATE vcc_work_orders
              SET cycle_id = COALESCE(cycle_id, ?),
                  cycle_key = COALESCE(cycle_key, ?),
                  plan_id = COALESCE(plan_id, ?),
                  plan_item_id = COALESCE(plan_item_id, ?),
                  plan_year = COALESCE(plan_year, ?)
              WHERE id = ?
            `).bind(effectiveCycleId, cycleKey, planId, item.id, planYear, matchedWo.id)
          );
          reconciled.push({ wo_id: matchedWo.id, wo_code: matchedWo.wo_code, cycle_id: effectiveCycleId });
        } else {
          skipped.push({ wo_id: matchedWo.id, wo_code: matchedWo.wo_code, cycle_id: effectiveCycleId });
        }
      } else if (matchedWo.status === 'PENDING_REVIEW' || (matchedWo.status === 'IN_PROGRESS' && matchedWo.result_status && matchedWo.result_status !== 'PENDING' && matchedWo.result_status !== 'NONE')) {
        // Case A (PENDING_REVIEW or IN_PROGRESS with recorded results): Keep active execution state intact, only link plan metadata if needed
        if (matchedWo.plan_id !== planId || matchedWo.plan_item_id !== item.id || matchedWo.plan_revision !== planRevision) {
          batchStatements.push(
            db.prepare(`
              UPDATE vcc_work_orders
              SET cycle_id = COALESCE(cycle_id, ?),
                  cycle_key = COALESCE(cycle_key, ?),
                  plan_id = ?,
                  plan_item_id = ?,
                  plan_year = ?,
                  plan_revision = ?
              WHERE id = ?
            `).bind(effectiveCycleId, cycleKey, planId, item.id, planYear, planRevision, matchedWo.id)
          );
          reconciled.push({ wo_id: matchedWo.id, wo_code: matchedWo.wo_code, cycle_id: effectiveCycleId });
        } else {
          skipped.push({ wo_id: matchedWo.id, wo_code: matchedWo.wo_code, cycle_id: effectiveCycleId });
        }
      } else {
        // Case A & Case E (OPEN / SCHEDULED / IN_PROGRESS without recorded results): Sync metadata (due_date, provider_name, plan_id, plan_item_id, plan_revision)
        const isUserRescheduled = Boolean(matchedWo.reschedule_reason);
        const finalScheduledDate = isUserRescheduled ? (matchedWo.scheduled_date || matchedWo.due_date) : dueDate;
        const finalDueDate = isUserRescheduled ? (matchedWo.due_date || matchedWo.scheduled_date) : dueDate;
        const targetProvider = item.provider_name || matchedWo.provider_name || 'ทวนสอบภายใน';

        const needsUpdate = (
          matchedWo.cycle_id !== effectiveCycleId ||
          matchedWo.plan_id !== planId ||
          matchedWo.plan_item_id !== item.id ||
          matchedWo.plan_revision !== planRevision ||
          Number(matchedWo.planned_month) !== Number(month) ||
          matchedWo.due_date !== finalDueDate ||
          matchedWo.provider_name !== targetProvider
        );

        if (needsUpdate) {
          batchStatements.push(
            db.prepare(`
              UPDATE vcc_work_orders
              SET cycle_id = ?,
                  cycle_key = ?,
                  plan_id = ?,
                  plan_item_id = ?,
                  plan_year = ?,
                  plan_revision = ?,
                  planned_month = ?,
                  provider_name = ?,
                  due_date = ?,
                  baseline_planned_date = COALESCE(baseline_planned_date, original_due_date, ?),
                  scheduled_date = ?,
                  required_due_date = ?,
                  updated_at = ${NOW},
                  updated_by = ?
              WHERE id = ?
            `).bind(
              effectiveCycleId,
              cycleKey,
              planId,
              item.id,
              planYear,
              planRevision,
              month,
              targetProvider,
              finalDueDate,
              dueDate,
              finalScheduledDate,
              dueDate,
              actorId,
              matchedWo.id
            )
          );
          reconciled.push({ wo_id: matchedWo.id, wo_code: matchedWo.wo_code, cycle_id: effectiveCycleId });
        } else {
          skipped.push({ wo_id: matchedWo.id, wo_code: matchedWo.wo_code, cycle_id: effectiveCycleId });
        }
      }
    } else if (candidateWos.length > 1) {
      ambiguous.push({
        cycle_id: cycleId,
        asset_id: item.asset_id,
        asset_code: item.asset_code,
        planned_month: month,
        candidates: candidateWos.map((w) => ({ id: w.id, wo_code: w.wo_code, status: w.status, due_date: w.due_date })),
        reason: 'พบใบสั่งงานเดิมที่อาจตรงกับรอบนี้มากกว่า 1 รายการ ต้องให้ผู้ดูแลระบบตรวจสอบยืนยันก่อนจับคู่'
      });
    } else if (item.asset_status === 'RETIRED') {
      skipped.push({
        cycle_id: cycleId,
        asset_id: item.asset_id,
        planned_month: month,
        reason: 'เครื่องมือถูกปลดออกจากทะเบียนแล้ว (RETIRED) จึงไม่ออกใบสั่งงานใหม่'
      });
    } else {
      // Check Case C: Previously CANCELLED by PLAN_REVISION in this plan_year for this asset + month
      const reactivatedWo = (cancelledRevisionWos || []).find((w) => {
        if (boundWoIds.has(w.id)) return false;
        if (w.cycle_id === cycleId || w.cycle_key === cycleKey) return true;
        return w.asset_id === item.asset_id && Number(w.planned_month) === Number(month);
      });

      if (reactivatedWo) {
        // Case C: Reactivate existing CANCELLED work order back to 'SCHEDULED' without hitting unique constraints
        boundWoIds.add(reactivatedWo.id);
        const reactivatedCycleId = reactivatedWo.cycle_id || cycleId;
        activeCycleIdsInNewRevision.add(reactivatedCycleId);
        const targetProvider = item.provider_name || reactivatedWo.provider_name || 'ทวนสอบภายใน';

        batchStatements.push(
          db.prepare(`
            UPDATE vcc_plan_cycles
            SET initial_cycle_id = ?,
                cycle_status = 'SCHEDULED',
                updated_at = ${NOW},
                updated_by = ?
            WHERE id = ?
          `).bind(reactivatedCycleId, actorId, cycleRowId),
          db.prepare(`
            UPDATE vcc_work_orders
            SET status = 'SCHEDULED',
                cancellation_category = NULL,
                cancellation_reason = NULL,
                cancelled_by = NULL,
                cancelled_at = NULL,
                cycle_id = ?,
                cycle_key = ?,
                plan_id = ?,
                plan_item_id = ?,
                plan_year = ?,
                plan_revision = ?,
                planned_month = ?,
                provider_name = ?,
                due_date = ?,
                scheduled_date = ?,
                required_due_date = ?,
                updated_at = ${NOW},
                updated_by = ?
            WHERE id = ?
          `).bind(
            reactivatedCycleId,
            cycleKey,
            planId,
            item.id,
            planYear,
            planRevision,
            month,
            targetProvider,
            dueDate,
            dueDate,
            dueDate,
            actorId,
            reactivatedWo.id
          )
        );

        matched.push({ wo_id: reactivatedWo.id, wo_code: reactivatedWo.wo_code, cycle_id: reactivatedCycleId, cycle_key: cycleKey, reactivated: true });
        reconciled.push({ wo_id: reactivatedWo.id, wo_code: reactivatedWo.wo_code, cycle_id: reactivatedCycleId, reactivated: true });
      } else {
        // Case B: Unmatched by cycle_id -> Generate new work order. Plan-generated work orders are SCHEDULED, never OPEN:
        // manual activation (201 once, then 409), the 30-day task horizon and the notification sweep all key on it.
        unmatched.push({ cycle_id: cycleId, asset_id: item.asset_id, planned_month: month });
        maxSeq += 1;
        const woCode = `WO-${planYear}-${String(maxSeq).padStart(3, '0')}`;
        const woId = crypto.randomUUID();
        boundWoIds.add(woId);

        batchStatements.push(
          db.prepare(`
            INSERT INTO vcc_work_orders (
              id, wo_code, cycle_id, cycle_key, plan_year, plan_revision, plan_id, plan_item_id,
              planned_month, asset_id, provider_name, baseline_planned_date, scheduled_date,
              due_date, original_due_date, required_due_date, is_carryover, status, result_status,
              created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'SCHEDULED', 'PENDING', ?, ?)
          `).bind(
            woId,
            woCode,
            cycleId,
            cycleKey,
            planYear,
            planRevision,
            planId,
            item.id,
            month,
            item.asset_id,
            item.provider_name || 'ทวนสอบภายใน',
            dueDate,
            dueDate,
            dueDate,
            dueDate,
            dueDate,
            actorId,
            actorId
          )
        );

        generated.push({
          id: woId,
          wo_code: woCode,
          cycle_id: cycleId,
          cycle_key: cycleKey,
          asset_id: item.asset_id,
          asset_code: item.asset_code,
          planned_month: month,
          due_date: dueDate,
          status: 'SCHEDULED'
        });
      }
    }
  }

  // Case D: Controlled soft-cancellation for cycles/instruments removed in this revision
  const autoCancelReason = `ยกเลิกอัตโนมัติจากการอนุมัติแผนฉบับแก้ไข Rev.${planRevision}`;
  const cancelledWoIds = new Set();

  for (const c of (existingCycles || [])) {
    const cycleIdentity = c.initial_cycle_id || c.id;
    if (!activeCycleIdsInNewRevision.has(cycleIdentity)) {
      const existingWo = byCycleId.get(cycleIdentity) || byCycleId.get(c.id);
      const hasRecordedResult = existingWo && existingWo.result_status && existingWo.result_status !== 'PENDING' && existingWo.result_status !== 'NONE';
      if (existingWo && (existingWo.status === 'CLOSED' || existingWo.status === 'PENDING_REVIEW' || hasRecordedResult || boundWoIds.has(existingWo.id))) {
        continue;
      }
      if (c.cycle_status !== 'CANCELLED' && c.cycle_status !== 'CLOSED') {
        batchStatements.push(
          db.prepare(`
            UPDATE vcc_plan_cycles
            SET cycle_status = 'CANCELLED',
                updated_at = ${NOW},
                updated_by = ?
            WHERE id = ?
          `).bind(actorId, c.id)
        );
      }
      if (existingWo && (existingWo.status === 'OPEN' || existingWo.status === 'SCHEDULED' || (existingWo.status === 'IN_PROGRESS' && !hasRecordedResult)) && !cancelledWoIds.has(existingWo.id)) {
        cancelledWoIds.add(existingWo.id);
        batchStatements.push(
          db.prepare(`
            UPDATE vcc_work_orders
            SET status = 'CANCELLED',
                cancellation_category = 'PLAN_REVISION',
                cancellation_reason = ?,
                cancelled_by = ?,
                cancelled_at = ${NOW},
                updated_at = ${NOW},
                updated_by = ?
            WHERE id = ? AND status IN ('OPEN', 'SCHEDULED', 'IN_PROGRESS')
          `).bind(autoCancelReason, actorId, actorId, existingWo.id)
        );
      }
    }
  }

  // Also soft-cancel any remaining plan-originated work orders in existingWos that were not matched to any cycle in the new revision
  for (const wo of (existingWos || [])) {
    if (boundWoIds.has(wo.id) || cancelledWoIds.has(wo.id)) continue;
    if (!wo.plan_id && !wo.cycle_id) continue; // Do not auto-cancel purely manual ad-hoc work orders
    const hasRecordedResult = wo.result_status && wo.result_status !== 'PENDING' && wo.result_status !== 'NONE';
    if (wo.status === 'CLOSED' || wo.status === 'PENDING_REVIEW' || (wo.status === 'IN_PROGRESS' && hasRecordedResult)) {
      continue;
    }
    if (wo.status === 'OPEN' || wo.status === 'SCHEDULED' || (wo.status === 'IN_PROGRESS' && !hasRecordedResult)) {
      cancelledWoIds.add(wo.id);
      batchStatements.push(
        db.prepare(`
          UPDATE vcc_work_orders
          SET status = 'CANCELLED',
              cancellation_category = 'PLAN_REVISION',
              cancellation_reason = ?,
              cancelled_by = ?,
              cancelled_at = ${NOW},
              updated_at = ${NOW},
              updated_by = ?
          WHERE id = ? AND status IN ('OPEN', 'SCHEDULED', 'IN_PROGRESS')
        `).bind(autoCancelReason, actorId, actorId, wo.id)
      );
    }
  }

  if (batchStatements.length > 0) {
    batchStatements.push(
      db.prepare(`
        UPDATE vcc_annual_plans
        SET work_orders_generated_at = ${NOW},
            work_orders_generated_count = work_orders_generated_count + ?,
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ?
      `).bind(generated.length, actorId, planId)
    );
  }

  const reconciliationStatus = ambiguous.length > 0
    ? 'HAS_AMBIGUITIES'
    : (unmatched.length > 0 ? 'INCOMPLETE' : 'COMPLETE');
  const isFullyReconciled = ambiguous.length === 0 && unmatched.length === 0;

  return {
    batchStatements,
    total_cycles: targetCycles.length,
    matched_count: matched.length,
    unmatched_count: unmatched.length,
    ambiguous_count: ambiguous.length,
    generated_count: generated.length,
    reconciled_count: reconciled.length,
    skipped_count: skipped.length,
    reconciliation_status: reconciliationStatus,
    is_fully_reconciled: isFullyReconciled,
    matched,
    unmatched,
    ambiguous,
    generated,
    reconciled,
    skipped
  };
};

const _generateWorkOrdersForApprovedPlan = async (db, planId, actorId, audit) => {
  const result = await buildWorkOrderReconciliationStatements(db, planId, actorId);
  if (result.error) return result;

  if (result.batchStatements.length > 0) {
    if (audit) {
      const plan = await db
        .prepare('SELECT id, plan_year, department, revision FROM vcc_annual_plans WHERE id = ?')
        .bind(planId)
        .first();
      result.batchStatements.push(
        audit(db, actorId, 'VCC_PLAN_WO_AUTO_GENERATED', {
          plan_id: planId,
          plan_year: plan?.plan_year,
          department: plan?.department,
          revision: plan?.revision,
          generated_count: result.generated.length,
          reconciled_count: result.reconciled.length,
          skipped_count: result.skipped.length,
          matched_count: result.matched.length,
          unmatched_count: result.unmatched.length,
          ambiguous_count: result.ambiguous.length,
          total_planned_cycles: result.total_cycles
        })
      );
    }
    await db.batch(result.batchStatements);
  }

  return {
    count: result.generated_count,
    total_cycles: result.total_cycles,
    matched_count: result.matched_count,
    unmatched_count: result.unmatched_count,
    ambiguous_count: result.ambiguous_count,
    generated_count: result.generated_count,
    reconciled_count: result.reconciled_count,
    skipped_count: result.skipped_count,
    reconciliation_status: result.reconciliation_status,
    is_fully_reconciled: result.is_fully_reconciled,
    matched: result.matched,
    unmatched: result.unmatched,
    ambiguous: result.ambiguous,
    generated: result.generated,
    reconciled: result.reconciled,
    skipped: result.skipped
  };
};

export const registerVccWorkOrderRoutes = (app, { requireAuth, audit }) => {
  app.get('/api/vcc/work-order-settings', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const settings = await readWorkOrderSettings(db);
    const thresholds = await getThresholds(db, settings.approval_doc_type);
    return c.json({ settings, thresholds });
  });

  app.put('/api/vcc/work-order-settings', requireAuth, requireDccOnly, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const before = await readWorkOrderSettings(db);

    const retentionYears = body.retention_years !== undefined ? Number(body.retention_years) : before.retention_years;
    if (!Number.isInteger(retentionYears) || retentionYears < 1 || retentionYears > 50) {
      return c.json({ error: 'ระยะเวลาเก็บเอกสารต้องเป็นจำนวนเต็มระหว่าง 1 ถึง 50 ปี' }, 400);
    }

    const approvalDocType = body.approval_doc_type !== undefined
      ? String(body.approval_doc_type || '').trim().toUpperCase()
      : before.approval_doc_type;
    const matrixRow = await db.prepare('SELECT doc_type FROM approval_matrix WHERE doc_type = ?').bind(approvalDocType).first();
    if (!matrixRow) {
      return c.json({ error: `ไม่พบประเภทเอกสาร "${approvalDocType}" ในตาราง Approval Matrix` }, 400);
    }

    let criteria = before.default_acceptance_criteria;
    if (body.default_acceptance_criteria !== undefined) {
      if (!Array.isArray(body.default_acceptance_criteria)) {
        return c.json({ error: 'รายการเกณฑ์ยอมรับต้องเป็น Array' }, 400);
      }
      const cleaned = body.default_acceptance_criteria.map((x) => String(x || '').trim()).filter(Boolean);
      if (cleaned.length === 0 || new Set(cleaned).size !== cleaned.length) {
        return c.json({ error: 'เกณฑ์ยอมรับต้องมีอย่างน้อย 1 รายการ และห้ามซ้ำกัน' }, 400);
      }
      criteria = cleaned;
    }

    const nextSettings = {
      retention_years: retentionYears,
      approval_doc_type: approvalDocType,
      default_acceptance_criteria: criteria
    };

    await db.batch([
      db.prepare(`
        INSERT INTO settings (key, value, updated_at, updated_by)
        VALUES (?, ?, ${NOW}, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = ${NOW},
          updated_by = excluded.updated_by
      `).bind(WORK_ORDER_SETTINGS_KEY, JSON.stringify(nextSettings), user.id),
      audit(db, user.id, 'VCC_WO_SETTINGS_UPDATED', { before, after: nextSettings })
    ]);

    const thresholds = await getThresholds(db, nextSettings.approval_doc_type);
    return c.json({ settings: nextSettings, thresholds });
  });

  // List work orders — strictly separated by status or nc_status (never mixing statuses in one list)
  app.get('/api/vcc/work-orders', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const status = (c.req.query('status') || '').trim().toUpperCase();
    const ncStatus = (c.req.query('nc_status') || '').trim().toUpperCase();
    const department = (c.req.query('department') || '').trim().toUpperCase();
    const planId = (c.req.query('plan_id') || '').trim();
    const planYear = (c.req.query('plan_year') || '').trim();
    const cycleKey = (c.req.query('cycle_key') || '').trim();
    const assetId = (c.req.query('asset_id') || '').trim();

    const where = [];
    const params = [];

    if (ncStatus) {
      if (ncStatus !== 'OPEN' && ncStatus !== 'RELEASED') {
        return c.json({ error: 'สถานะ NC ไม่ถูกต้อง' }, 400);
      }
      where.push('w.nc_status = ?');
      params.push(ncStatus);
    } else {
      const targetStatus = status || 'OPEN';
      if (!VALID_WO_STATUSES.has(targetStatus)) {
        return c.json({ error: 'สถานะใบสั่งงานไม่ถูกต้อง' }, 400);
      }
      if (targetStatus === 'OPEN') {
        where.push("w.status IN ('OPEN', 'SCHEDULED', 'REJECTED', 'RETURNED')");
      } else if (targetStatus === 'CLOSED') {
        where.push("w.status IN ('CLOSED', 'PENDING_REVIEW', 'PENDING_VERIFY')");
      } else {
        where.push('w.status = ?');
        params.push(targetStatus);
      }
    }

    const scope = vccDeptScopeSql(c.get('user'), 'a.department');
    if (scope) {
      where.push(scope.sql);
      params.push(...scope.args);
    }
    if (department) {
      where.push('a.department = ?');
      params.push(department);
    }
    if (planId) {
      where.push('w.plan_id = ?');
      params.push(planId);
    }
    if (planYear) {
      where.push('(w.plan_year = ? OR pl.plan_year = ?)');
      params.push(Number(planYear), Number(planYear));
    }
    if (cycleKey) {
      where.push('w.cycle_key = ?');
      params.push(cycleKey);
    }
    const cycleIdQuery = c.req.query('cycle_id');
    if (cycleIdQuery) {
      where.push('w.cycle_id = ?');
      params.push(cycleIdQuery);
    }
    if (assetId) {
      where.push('w.asset_id = ?');
      params.push(assetId);
    }

    const { results } = await db.prepare(`
      SELECT w.*,
        a.asset_code,
        a.name AS asset_name,
        a.asset_type,
        a.department,
        a.location,
        a.group_nature,
        a.composite_details,
        p.asset_code AS parent_asset_code,
        d.name_th AS department_name_th,
        pl.plan_year,
        u_perf.name AS performed_by_name,
        u_rev.name AS reviewed_by_name,
        u_rel.name AS hold_released_by_name,
        u_resq.name AS reschedule_requested_by_name,
        u_resapp.name AS reschedule_approved_by_name
      FROM vcc_work_orders w
      JOIN vcc_assets a ON a.id = w.asset_id
      LEFT JOIN vcc_assets p ON p.id = a.parent_id
      LEFT JOIN departments d ON d.code = a.department
      LEFT JOIN vcc_annual_plans pl ON pl.id = w.plan_id
      LEFT JOIN users u_perf ON u_perf.id = w.performed_by
      LEFT JOIN users u_rev ON u_rev.id = w.reviewed_by
      LEFT JOIN users u_rel ON u_rel.id = w.hold_released_by
      LEFT JOIN users u_resq ON u_resq.id = w.reschedule_requested_by
      LEFT JOIN users u_resapp ON u_resapp.id = w.reschedule_approved_by
      WHERE ${where.join(' AND ')}
      ORDER BY w.due_date ASC, w.wo_code ASC
    `).bind(...params).all();

    const mapped = (results || []).map((wo) => ({
      ...wo,
      recorded_by: wo.performed_by,
      recorded_by_name: wo.performed_by_name,
      closed_by: wo.status === 'CLOSED' ? (wo.reviewed_by || wo.performed_by) : null,
      closed_by_name: wo.status === 'CLOSED' ? (wo.reviewed_by_name || wo.performed_by_name) : null,
      verified_by: wo.reviewed_by !== wo.performed_by ? wo.reviewed_by : null,
      verified_by_name: wo.reviewed_by !== wo.performed_by ? wo.reviewed_by_name : null
    }));

    return c.json({ workOrders: mapped });
  });

  app.get('/api/vcc/work-orders/:id', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const workOrder = await fetchWorkOrder(db, id);
    if (!workOrder) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);
    if (!canReadVccDepartment(user, workOrder.department)) return c.json(VCC_DEPT_FORBIDDEN, 403);

    const settings = await readWorkOrderSettings(db);
    const thresholds = await getThresholds(db, settings.approval_doc_type);

    const [{ results: auditRows }, { results: certRows }, { results: amendmentRows }, { results: amendmentReqRows }] = await Promise.all([
      db.prepare(`
        SELECT l.id, l.at, l.actor_id, u.name AS actor_name, l.action, l.details
        FROM audit_log l
        LEFT JOIN users u ON u.id = l.actor_id
        WHERE l.action GLOB 'VCC_WO_*'
          AND json_extract(l.details, '$.wo_id') = ?
        ORDER BY l.id DESC
      `).bind(id).all(),
      db.prepare(`
        SELECT c.*, u.name AS uploaded_by_name
        FROM vcc_work_order_certificates c
        LEFT JOIN users u ON u.id = c.uploaded_by
        WHERE c.work_order_id = ?
        ORDER BY c.version DESC
      `).bind(id).all().catch(() => ({ results: [] })),
      db.prepare(`
        SELECT a.*, u.name AS amended_by_name
        FROM vcc_work_order_amendments a
        LEFT JOIN users u ON u.id = a.amended_by
        WHERE a.work_order_id = ?
        ORDER BY a.amendment_seq DESC
      `).bind(id).all().catch(() => ({ results: [] })),
      db.prepare(`
        SELECT r.*, u_req.name AS requester_name, u_rev.name AS reviewer_name
        FROM vcc_work_order_amendment_requests r
        LEFT JOIN users u_req ON u_req.id = r.requested_by
        LEFT JOIN users u_rev ON u_rev.id = r.reviewed_by
        WHERE r.work_order_id = ?
        ORDER BY r.created_at DESC
      `).bind(id).all().catch(() => ({ results: [] }))
    ]);

    const history = auditRows.map((row) => ({
      ...row,
      details: (() => {
        try { return JSON.parse(row.details || '{}'); } catch { return {}; }
      })()
    }));

    const amendments = amendmentRows.map((row) => ({
      ...row,
      snapshot: (() => {
        try { return JSON.parse(row.snapshot_data || '{}'); } catch { return {}; }
      })()
    }));

    const amendmentRequests = (amendmentReqRows || []).map((row) => ({
      ...row,
      proposed_changes: (() => {
        try { return JSON.parse(row.proposed_changes || '{}'); } catch { return {}; }
      })()
    }));

    const pendingAmendmentRequest = amendmentRequests.find((r) => r.status === 'PENDING') || null;

    return c.json({
      workOrder,
      thresholds,
      history,
      certificates: certRows,
      amendments,
      amendmentRequests,
      pendingAmendmentRequest
    });
  });

  app.get('/api/vcc/work-orders/:id/certificates', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');

    const existing = await fetchWorkOrder(db, id);
    if (!existing) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);
    if (!canReadVccDepartment(user, existing.department)) {
      return c.json({ error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลของแผนกนี้' }, 403);
    }

    const { results } = await db.prepare(`
      SELECT c.*, u.name AS uploaded_by_name
      FROM vcc_work_order_certificates c
      LEFT JOIN users u ON u.id = c.uploaded_by
      WHERE c.work_order_id = ?
      ORDER BY c.version DESC
    `).bind(id).all();

    return c.json({ certificates: results });
  });

  app.get('/api/vcc/work-orders/:id/amendments', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');

    const existing = await fetchWorkOrder(db, id);
    if (!existing) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);
    if (!canReadVccDepartment(user, existing.department)) {
      return c.json({ error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลของแผนกนี้' }, 403);
    }

    const { results } = await db.prepare(`
      SELECT a.*, u.name AS amended_by_name
      FROM vcc_work_order_amendments a
      LEFT JOIN users u ON u.id = a.amended_by
      WHERE a.work_order_id = ?
      ORDER BY a.amendment_seq DESC
    `).bind(id).all();

    const amendments = results.map((row) => ({
      ...row,
      snapshot: (() => {
        try { return JSON.parse(row.snapshot_data || '{}'); } catch { return {}; }
      })()
    }));

    return c.json({ amendments });
  });

  app.get('/api/vcc/work-orders/:id/amendment-requests', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');

    const existing = await fetchWorkOrder(db, id);
    if (!existing) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);
    if (!canReadVccDepartment(user, existing.department)) {
      return c.json({ error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลของแผนกนี้' }, 403);
    }

    const { results } = await db.prepare(`
      SELECT r.*, u_req.name AS requester_name, u_rev.name AS reviewer_name
      FROM vcc_work_order_amendment_requests r
      LEFT JOIN users u_req ON u_req.id = r.requested_by
      LEFT JOIN users u_rev ON u_rev.id = r.reviewed_by
      WHERE r.work_order_id = ?
      ORDER BY r.created_at DESC
    `).bind(id).all().catch(() => ({ results: [] }));

    const requests = (results || []).map((row) => ({
      ...row,
      proposed_changes: (() => {
        try { return JSON.parse(row.proposed_changes || '{}'); } catch { return {}; }
      })()
    }));

    return c.json({ requests });
  });

  // Create Work Order (from APPROVED annual plan item OR ad-hoc)
  app.post('/api/vcc/work-orders', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));

    const planId = body.plan_id ? String(body.plan_id).trim() : null;
    const planItemId = body.plan_item_id ? String(body.plan_item_id).trim() : null;
    const plannedMonth = body.planned_month !== undefined && body.planned_month !== null && body.planned_month !== ''
      ? Number(body.planned_month)
      : null;

    let targetAssetId = String(body.asset_id || body.child_asset_id || '').trim();
    let providerName = String(body.provider_name || '').trim();
    let dueDate = String(body.due_date || '').trim();

    if (planId || planItemId) {
      if (!planId || !planItemId || !Number.isInteger(plannedMonth) || plannedMonth < 1 || plannedMonth > 12) {
        return c.json({ error: 'การสร้างใบสั่งงานจากแผนต้องระบุแผน รายการในแผน และเดือนที่วางแผน (1-12) ให้ครบถ้วน' }, 400);
      }
      const plan = await db.prepare('SELECT * FROM vcc_annual_plans WHERE id = ?').bind(planId).first();
      if (!plan) return c.json({ error: 'ไม่พบแผนการสอบเทียบประจำปี' }, 404);
      if (plan.status !== 'APPROVED') {
        return c.json({ error: 'สร้างใบสั่งงานจากแผนได้เฉพาะแผนประจำปีที่อนุมัติแล้ว (APPROVED) เท่านั้น' }, 409);
      }
      if (plan.effective_status === 'SUPERSEDED') {
        return c.json({ error: 'ไม่สามารถสร้างใบสั่งงานจากแผนฉบับเดิมที่ถูกแทนที่แล้ว (SUPERSEDED)' }, 409);
      }
      if (!isUserAuthorizedForPlanDept(user, plan.department)) {
        return c.json({ error: 'ไม่มีสิทธิ์สร้างใบสั่งงานของแผนกนี้' }, 403);
      }

      const planItem = await db.prepare(`
        SELECT i.*, a.is_group, a.group_nature, a.asset_code, a.status AS asset_status
        FROM vcc_annual_plan_items i
        JOIN vcc_assets a ON a.id = i.asset_id
        WHERE i.id = ? AND i.plan_id = ?
      `).bind(planItemId, planId).first();
      if (!planItem) return c.json({ error: 'ไม่พบรายการเครื่องมือในแผนประจำปี' }, 404);

      const plannedMonths = (() => {
        try { return JSON.parse(planItem.planned_months || '[]'); } catch { return []; }
      })();
      if (!plannedMonths.includes(plannedMonth)) {
        return c.json({ error: `เดือน ${plannedMonth} ไม่ได้อยู่ในตารางแผนของรายการนี้` }, 400);
      }

      if (Number(planItem.is_group) === 1 && planItem.group_nature === 'COMPOSITE_SET' && !body.child_asset_id) {
        targetAssetId = planItem.asset_id;
      } else if (Number(planItem.is_group) === 1) {
        const childId = String(body.child_asset_id || '').trim();
        if (!childId) {
          return c.json({ error: 'เครื่องมือแบบกลุ่มต้องแยกรหัสเครื่องมือรายตัวก่อนสร้างใบสั่งงาน' }, 400);
        }
        const child = await db.prepare('SELECT * FROM vcc_assets WHERE id = ? AND parent_id = ?').bind(childId, planItem.asset_id).first();
        if (!child) {
          return c.json({ error: 'รหัสเครื่องมือลูกที่เลือกไม่ได้อยู่ในกลุ่มเครื่องมือนี้' }, 400);
        }
        if (child.status !== 'ACTIVE' || Number(child.is_group) === 1) {
          return c.json({ error: 'เครื่องมือลูกที่เลือกต้องเป็นเครื่องมือรายตัวที่ใช้งานปกติ (ACTIVE)' }, 409);
        }
        if (!isUserAuthorizedForPlanDept(user, child.department || plan.department)) {
          return c.json({ error: 'ไม่มีสิทธิ์สร้างใบสั่งงานของแผนกนี้' }, 403);
        }
        targetAssetId = child.id;
      } else {
        targetAssetId = planItem.asset_id;
      }

      providerName = providerName || planItem.provider_name;
      dueDate = dueDate || computeDueDateForMonth(plan.plan_year, plannedMonth, plan.due_date_rule);
      const cycleKey = plan ? `${plan.plan_year}:${plan.department}:${targetAssetId}:${plannedMonth}` : null;

      const cycleRow = await db.prepare('SELECT id FROM vcc_plan_cycles WHERE plan_item_id = ? AND planned_month = ?').bind(planItemId, plannedMonth).first();
      const cycleId = cycleRow ? cycleRow.id : null;

      const duplicate = await db.prepare(`
        SELECT id, wo_code, status, cycle_id, cycle_key, provider_name, due_date FROM vcc_work_orders
        WHERE status != 'CANCELLED'
          AND (
            (cycle_id IS NOT NULL AND cycle_id = ?)
            OR (cycle_key IS NOT NULL AND cycle_key = ?)
            OR (plan_item_id = ? AND asset_id = ? AND planned_month = ?)
          )
      `).bind(cycleId || '', cycleKey || '', planItemId, targetAssetId, plannedMonth).first();
      if (duplicate) {
        if (duplicate.status === 'SCHEDULED') {
          const targetStatus = body.status && String(body.status).toUpperCase() === 'SCHEDULED' ? 'SCHEDULED' : 'OPEN';
          const nextProvider = providerName || duplicate.provider_name;
          const nextDueDate = dueDate || duplicate.due_date;
          await db.batch([
            db.prepare(`
              UPDATE vcc_work_orders
              SET status = ?,
                  cycle_id = COALESCE(cycle_id, ?),
                  cycle_key = COALESCE(cycle_key, ?),
                  provider_name = ?,
                  due_date = ?,
                  updated_at = ${NOW},
                  updated_by = ?
              WHERE id = ?
            `).bind(targetStatus, cycleId, cycleKey, nextProvider, nextDueDate, user.id, duplicate.id),
            audit(db, user.id, 'VCC_WO_CREATED', {
              wo_id: duplicate.id,
              wo_code: duplicate.wo_code,
              cycle_id: duplicate.cycle_id || cycleId,
              cycle_key: duplicate.cycle_key || cycleKey,
              plan_id: planId,
              plan_item_id: planItemId,
              planned_month: plannedMonth,
              asset_id: targetAssetId,
              due_date: nextDueDate,
              status: targetStatus,
              note: 'Activated from SCHEDULED'
            })
          ]);
          const workOrder = await fetchWorkOrder(db, duplicate.id);
          return c.json({ workOrder }, 201);
        }
        return c.json({ error: `มีใบสั่งงาน (${duplicate.wo_code}) สำหรับเครื่องมือและรอบเดือนนี้อยู่แล้ว` }, 409);
      }
    }

    if (!targetAssetId) return c.json({ error: 'กรุณาเลือกเครื่องมือรายตัวสำหรับสร้างใบสั่งงาน' }, 400);
    const asset = await db.prepare('SELECT * FROM vcc_assets WHERE id = ?').bind(targetAssetId).first();
    if (!asset) return c.json({ error: 'ไม่พบเครื่องมือในทะเบียน' }, 404);
    if (Number(asset.is_group) === 1 && asset.group_nature !== 'COMPOSITE_SET') {
      return c.json({ error: 'เครื่องมือแบบกลุ่มต้องแยกรหัสเครื่องมือรายตัวก่อนสร้างใบสั่งงาน' }, 400);
    }
    if (asset.status === 'RETIRED') {
      return c.json({ error: 'ไม่สามารถเปิดใบสั่งงานให้เครื่องมือที่ปลดออกแล้ว (RETIRED)' }, 409);
    }
    if (!isUserAuthorizedForPlanDept(user, asset.department)) {
      return c.json({ error: 'ไม่มีสิทธิ์สร้างใบสั่งงานของแผนกนี้' }, 403);
    }

    const openHold = await db.prepare(`
      SELECT wo_code FROM vcc_work_orders WHERE asset_id = ? AND nc_status = 'OPEN'
    `).bind(targetAssetId).first();
    if (asset.status === 'ON_HOLD' || openHold) {
      const refWo = openHold ? ` จากใบงาน ${openHold.wo_code}` : '';
      return c.json({ error: `เครื่องมือ ${asset.asset_code} อยู่ระหว่างระงับใช้งาน (ON_HOLD${refWo}) ต้องปลดระงับก่อนเปิดใบงานใหม่` }, 409);
    }
    if (asset.status !== 'ACTIVE') {
      return c.json({ error: `ไม่สามารถเปิดใบสั่งงานให้เครื่องมือที่มีสถานะ ${asset.status}` }, 409);
    }

    const PLACEHOLDER_PROVIDER = '-- เลือกหน่วยงานที่ทวนสอบ --';
    if (!providerName || providerName === PLACEHOLDER_PROVIDER) {
      return c.json({ error: 'กรุณาระบุสถาบัน/หน่วยงานที่ทวนสอบ' }, 400);
    }
    if (!DATE_RE.test(dueDate)) return c.json({ error: 'กรุณาระบุวันครบกำหนดในรูปแบบ YYYY-MM-DD' }, 400);

    const countRow = await db.prepare('SELECT COUNT(*) AS cnt FROM vcc_work_orders').first();
    const seq = String((Number(countRow?.cnt || 0) + 1)).padStart(3, '0');
    const yearPrefix = dueDate.slice(0, 4);
    const woCode = String(body.wo_code || `WO-${yearPrefix}-${seq}`).trim().toUpperCase();

    const planYearNum = planId ? Number(yearPrefix) : null;
    const planRev = '00';
    const computedCycleKey = (planId && plannedMonth) ? `${yearPrefix}:${asset.department}:${targetAssetId}:${plannedMonth}` : null;
    let computedCycleId = null;
    if (planItemId && plannedMonth) {
      const cRow = await db.prepare('SELECT id FROM vcc_plan_cycles WHERE plan_item_id = ? AND planned_month = ?').bind(planItemId, plannedMonth).first();
      computedCycleId = cRow ? cRow.id : null;
    }
    const initialStatus = String(body.status || 'OPEN').toUpperCase();
    const finalStatus = initialStatus === 'SCHEDULED' ? 'SCHEDULED' : 'OPEN';

    const id = crypto.randomUUID();
    const auditDetails = {
      wo_id: id,
      wo_code: woCode,
      cycle_id: computedCycleId,
      cycle_key: computedCycleKey,
      plan_id: planId,
      plan_item_id: planItemId,
      planned_month: plannedMonth,
      asset_id: targetAssetId,
      asset_code: asset.asset_code,
      due_date: dueDate,
      original_due_date: dueDate,
      status: finalStatus
    };

    await db.batch([
      db.prepare(`
        INSERT INTO vcc_work_orders (
          id, wo_code, cycle_id, cycle_key, plan_year, plan_revision, plan_id, plan_item_id, planned_month, asset_id, provider_name,
          baseline_planned_date, scheduled_date, due_date, original_due_date, required_due_date, is_carryover, status, result_status, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'PENDING', ?, ?)
      `).bind(
        id,
        woCode,
        computedCycleId,
        computedCycleKey,
        planYearNum,
        planRev,
        planId,
        planItemId,
        plannedMonth,
        targetAssetId,
        providerName,
        dueDate,
        dueDate,
        dueDate,
        dueDate,
        dueDate,
        finalStatus,
        user.id,
        user.id
      ),
      audit(db, user.id, 'VCC_WO_CREATED', auditDetails)
    ]);

    return c.json({ workOrder: await fetchWorkOrder(db, id) }, 201);
  });

  // Reschedule due date — preserves original_due_date and requires reason
  app.post('/api/vcc/work-orders/:id/reschedule', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const existing = await fetchWorkOrder(db, id);
    if (!existing) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);
    if (existing.status === 'CLOSED' || existing.status === 'CANCELLED') {
      return c.json({ error: 'ไม่สามารถเลื่อนวันครบกำหนดของใบสั่งงานที่ปิดหรือยกเลิกแล้ว' }, 409);
    }
    const isDccUser = Boolean(user.isDcc || user.is_dcc);
    if (!isDccUser) {
      return c.json({
        error: 'ไม่มีสิทธิ์ปรับเปลี่ยนวันกำหนดการโดยตรง: การเลื่อนกำหนดโดยตรง (Direct Override) สงวนสิทธิ์สำหรับเจ้าหน้าที่ DCC เท่านั้น สำหรับแผนกอื่นโปรดยื่นคำขอเลื่อนกำหนด (Request Reschedule)'
      }, 403);
    }
    if (existing.reschedule_status === 'REQUESTED') {
      return c.json({
        error: 'ไม่สามารถปรับเปลี่ยนวันกำหนดการโดยตรงได้เนื่องจากมีคำขอเลื่อนกำหนดรอการพิจารณาอยู่ กรุณาพิจารณาอนุมัติหรือไม่อนุมัติคำขอเดิมผ่านกระบวนการพิจารณา'
      }, 409);
    }

    const newDueDate = String(body.new_due_date || '').trim();
    const reason = String(body.reason || '').trim();
    if (!DATE_RE.test(newDueDate)) return c.json({ error: 'กรุณาระบุวันครบกำหนดใหม่ในรูปแบบ YYYY-MM-DD' }, 400);
    const [dYear, dMonth, dDay] = newDueDate.split('-').map(Number);
    const checkD = new Date(Date.UTC(dYear, dMonth - 1, dDay));
    if (
      isNaN(checkD.getTime()) ||
      checkD.getUTCFullYear() !== dYear ||
      checkD.getUTCMonth() + 1 !== dMonth ||
      checkD.getUTCDate() !== dDay
    ) {
      return c.json({ error: 'วันครบกำหนดใหม่ไม่ถูกต้องตามปฏิทิน' }, 400);
    }
    if (!reason) return c.json({ error: 'กรุณาระบุเหตุผลในการขอเลื่อนวันครบกำหนด' }, 400);
    if (newDueDate === existing.due_date) {
      return c.json({ error: 'วันครบกำหนดใหม่ตรงกับวันครบกำหนดปัจจุบัน ไม่มีการเปลี่ยนแปลง' }, 400);
    }

    // A reschedule leaves the status unchanged, so the guard is the due date this request was based on: a second
    // request built on the same old date (double click, concurrent) finds it already moved and gets 409.
    const conflict = await runTransition(c, db, [
      db.prepare(`
        UPDATE vcc_work_orders
        SET scheduled_date = ?, due_date = ?, reschedule_reason = ?,
            reschedule_status = 'APPROVED',
            proposed_due_date = ?,
            reschedule_requested_by = COALESCE(reschedule_requested_by, ?),
            reschedule_approved_by = ?,
            reschedule_approved_at = ${NOW},
            updated_at = ${NOW}, updated_by = ?
        WHERE id = ? AND status = ? AND due_date IS ?
      `).bind(newDueDate, newDueDate, reason, newDueDate, user.id, user.id, user.id, id, existing.status, existing.due_date),
      assertRowUpdated(db),
      audit(db, user.id, 'VCC_WO_RESCHEDULED', {
        wo_id: id,
        wo_code: existing.wo_code,
        asset_id: existing.asset_id,
        original_due_date: existing.original_due_date || existing.due_date,
        current_due_date: existing.due_date,
        proposed_due_date: newDueDate,
        before: { due_date: existing.due_date },
        after: { due_date: newDueDate },
        reason,
        authorized_by: user.id,
        is_direct_override: true
      })
    ]);
    if (conflict) return conflict;

    return c.json({ workOrder: await fetchWorkOrder(db, id) });
  });

  // 2-Step Reschedule Workflow Step 1: Request Reschedule (due_date unchanged until approved)
  app.post('/api/vcc/work-orders/:id/request-reschedule', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const existing = await fetchWorkOrder(db, id);
    if (!existing) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);
    if (existing.status === 'CLOSED' || existing.status === 'CANCELLED') {
      return c.json({ error: 'ไม่สามารถขอเลื่อนวันครบกำหนดของใบสั่งงานที่ปิดหรือยกเลิกแล้ว' }, 409);
    }
    const userLevel = Number(user.approval_level ?? user.approvalLevel ?? user.level ?? 0);
    if (userLevel < 2) {
      return c.json({ error: 'ไม่มีสิทธิ์ขอเลื่อนวันครบกำหนด: ผู้ยื่นคำขอต้องมีระดับสิทธิ์ตั้งแต่ L2 (ระดับเจ้าหน้าที่/ผู้ปฏิบัติงาน) ขึ้นไป' }, 403);
    }
    const isDccUser = Boolean(user.isDcc || user.is_dcc);
    const woDept = String(existing.department || '').toUpperCase().trim();
    const userDepts = getUserDepartments(user).map((d) => String(d).toUpperCase().trim());
    const inOwningDept = userDepts.includes(woDept);
    if (!inOwningDept && !isDccUser) {
      return c.json({ error: `ไม่มีสิทธิ์ขอเลื่อนวันครบกำหนดของใบสั่งงานในแผนก ${woDept}: ผู้ยื่นคำขอต้องสังกัดแผนกเจ้าของเครื่องมือ (สิทธิ์ผู้บริหาร QMR/L6 ไม่สามารถยื่นขอข้ามแผนกได้)` }, 403);
    }
    if (existing.reschedule_status === 'REQUESTED') {
      return c.json({ error: 'มีคำขอเลื่อนวันครบกำหนดรอการอนุมัติอยู่แล้ว กรุณารอการพิจารณาคำขอเดิม' }, 409);
    }

    const proposedDueDate = String(body.proposed_due_date || body.new_due_date || '').trim();
    const reason = String(body.reason || '').trim();
    if (!DATE_RE.test(proposedDueDate)) return c.json({ error: 'กรุณาระบุวันครบกำหนดใหม่ในรูปแบบ YYYY-MM-DD' }, 400);
    const [dYear, dMonth, dDay] = proposedDueDate.split('-').map(Number);
    const checkD = new Date(Date.UTC(dYear, dMonth - 1, dDay));
    if (
      isNaN(checkD.getTime()) ||
      checkD.getUTCFullYear() !== dYear ||
      checkD.getUTCMonth() + 1 !== dMonth ||
      checkD.getUTCDate() !== dDay
    ) {
      return c.json({ error: 'วันครบกำหนดใหม่ไม่ถูกต้องตามปฏิทิน' }, 400);
    }
    if (!reason) return c.json({ error: 'กรุณาระบุเหตุผลในการขอเลื่อนวันครบกำหนด' }, 400);
    if (proposedDueDate === existing.due_date) {
      return c.json({ error: 'วันครบกำหนดใหม่ตรงกับวันครบกำหนดปัจจุบัน ไม่มีการเปลี่ยนแปลง' }, 400);
    }

    // Due date remains strictly UNCHANGED until approved!
    const conflict = await runTransition(c, db, [
      db.prepare(`
        UPDATE vcc_work_orders
        SET reschedule_status = 'REQUESTED',
            proposed_due_date = ?,
            reschedule_reason = ?,
            reschedule_requested_by = ?,
            reschedule_requested_at = ${NOW},
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ? AND status = ? AND (reschedule_status IS NULL OR reschedule_status != 'REQUESTED')
      `).bind(proposedDueDate, reason, user.id, user.id, id, existing.status),
      assertRowUpdated(db),
      audit(db, user.id, 'VCC_WO_RESCHEDULE_REQUESTED', {
        wo_id: id,
        wo_code: existing.wo_code,
        asset_id: existing.asset_id,
        original_due_date: existing.original_due_date || existing.due_date,
        current_due_date: existing.due_date,
        proposed_due_date: proposedDueDate,
        reason,
        requested_by: user.id,
        requested_by_name: user.name
      })
    ]);
    if (conflict) return conflict;

    return c.json({ workOrder: await fetchWorkOrder(db, id) });
  });

  // 2-Step Reschedule Workflow Step 2A: Approve Reschedule (Separation of Duties enforced)
  app.post('/api/vcc/work-orders/:id/approve-reschedule', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const existing = await fetchWorkOrder(db, id);
    if (!existing) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);
    if (existing.status === 'CLOSED' || existing.status === 'CANCELLED') {
      return c.json({ error: 'ไม่สามารถอนุมัติเลื่อนวันครบกำหนดของใบสั่งงานที่ปิดหรือยกเลิกแล้ว' }, 409);
    }
    if (existing.reschedule_status !== 'REQUESTED') {
      return c.json({ error: 'ไม่มีคำขอเลื่อนวันครบกำหนดที่รอการอนุมัติสำหรับใบสั่งงานนี้' }, 409);
    }

    const isDccUser = Boolean(user.isDcc || user.is_dcc);
    const isQmrUser = Boolean(user.isQmr || user.is_qmr);
    const userLevel = Number(user.approval_level ?? user.approvalLevel ?? 0);
    const inDept = getUserDepartments(user).includes(String(existing.department || '').toUpperCase());
    const isAuthorized = isDccUser || isQmrUser || userLevel >= 6 || (userLevel >= 4 && inDept);

    if (!isAuthorized) {
      return c.json({ error: 'ไม่มีสิทธิ์อนุมัติการเลื่อนกำหนดใบสั่งงาน: เฉพาะผู้มีอำนาจอนุมัติ (ระดับ L4 ขึ้นไป) หรือเจ้าหน้าที่ DCC เท่านั้น' }, 403);
    }

    // Segregation of Duties: Prevent Self-Approval
    if (existing.reschedule_requested_by && (user.id === existing.reschedule_requested_by || user.username === existing.reschedule_requested_by)) {
      return c.json({ error: 'การคัดแยกหน้าที่ (Segregation of Duties): ผู้ขอเลื่อนกำหนดวันไม่สามารถอนุมัติการขอเลื่อนของตนเองได้ (ป้องกัน Self-Approval) ต้องให้หัวหน้างานหรือเจ้าหน้าที่อื่นเป็นผู้อนุมัติ' }, 403);
    }

    const targetDueDate = existing.proposed_due_date;
    if (!targetDueDate) {
      return c.json({ error: 'ไม่พบวันครบกำหนดที่เสนอเลื่อน' }, 400);
    }

    const comment = String(body.comment || '').trim();

    const conflict = await runTransition(c, db, [
      db.prepare(`
        UPDATE vcc_work_orders
        SET due_date = ?,
            scheduled_date = ?,
            reschedule_status = 'APPROVED',
            reschedule_approved_by = ?,
            reschedule_approved_at = ${NOW},
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ? AND status = ? AND reschedule_status = 'REQUESTED'
      `).bind(targetDueDate, targetDueDate, user.id, user.id, id, existing.status),
      assertRowUpdated(db),
      audit(db, user.id, 'VCC_WO_RESCHEDULE_APPROVED', {
        wo_id: id,
        wo_code: existing.wo_code,
        asset_id: existing.asset_id,
        original_due_date: existing.original_due_date || existing.due_date,
        previous_due_date: existing.due_date,
        approved_due_date: targetDueDate,
        reason: existing.reschedule_reason,
        requested_by: existing.reschedule_requested_by,
        approved_by: user.id,
        approved_by_name: user.name,
        comment
      }),
      woEventNotice(db, existing, {
        type: 'EVT_WO_RESCHEDULE_APPROVED', severity: 'SUCCESS', targetUserId: existing.reschedule_requested_by,
        title: `[อนุมัติเลื่อนวัน] ใบสั่งงาน ${existing.wo_code}`,
        message: `วันครบกำหนดของเครื่องมือ ${existing.asset_code} เลื่อนเป็น ${targetDueDate} อนุมัติโดย ${user.name}`
      })
    ]);
    if (conflict) return conflict;

    return c.json({ workOrder: await fetchWorkOrder(db, id) });
  });

  // 2-Step Reschedule Workflow Step 2B: Reject Reschedule (Maintains original due date)
  app.post('/api/vcc/work-orders/:id/reject-reschedule', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const existing = await fetchWorkOrder(db, id);
    if (!existing) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);
    if (existing.reschedule_status !== 'REQUESTED') {
      return c.json({ error: 'ไม่มีคำขอเลื่อนวันครบกำหนดที่รอการอนุมัติสำหรับใบสั่งงานนี้' }, 409);
    }

    const isDccUser = Boolean(user.isDcc || user.is_dcc);
    const isQmrUser = Boolean(user.isQmr || user.is_qmr);
    const userLevel = Number(user.approval_level ?? user.approvalLevel ?? 0);
    const inDept = getUserDepartments(user).includes(String(existing.department || '').toUpperCase());
    const isAuthorized = isDccUser || isQmrUser || userLevel >= 6 || (userLevel >= 4 && inDept);

    if (!isAuthorized) {
      return c.json({ error: 'ไม่มีสิทธิ์ปฏิเสธการขอเลื่อนกำหนดใบสั่งงาน: เฉพาะผู้มีอำนาจอนุมัติ (ระดับ L4 ขึ้นไป) หรือเจ้าหน้าที่ DCC เท่านั้น' }, 403);
    }

    const rejectReason = String(body.reject_reason || body.reason || '').trim();
    if (!rejectReason) {
      return c.json({ error: 'กรุณาระบุเหตุผลในการปฏิเสธการขอเลื่อนวันครบกำหนด' }, 400);
    }

    // Due date remains strictly UNCHANGED!
    const conflict = await runTransition(c, db, [
      db.prepare(`
        UPDATE vcc_work_orders
        SET reschedule_status = 'REJECTED',
            reschedule_rejected_reason = ?,
            reschedule_approved_by = ?,
            reschedule_approved_at = ${NOW},
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ? AND status = ? AND reschedule_status = 'REQUESTED'
      `).bind(rejectReason, user.id, user.id, id, existing.status),
      assertRowUpdated(db),
      audit(db, user.id, 'VCC_WO_RESCHEDULE_REJECTED', {
        wo_id: id,
        wo_code: existing.wo_code,
        asset_id: existing.asset_id,
        current_due_date: existing.due_date,
        proposed_due_date: existing.proposed_due_date,
        requested_by: existing.reschedule_requested_by,
        rejected_by: user.id,
        rejected_by_name: user.name,
        reject_reason: rejectReason
      }),
      woEventNotice(db, existing, {
        type: 'EVT_WO_RESCHEDULE_REJECTED', severity: 'WARNING', targetUserId: existing.reschedule_requested_by,
        title: `[ไม่อนุมัติเลื่อนวัน] ใบสั่งงาน ${existing.wo_code}`,
        message: `คำขอเลื่อนวันของเครื่องมือ ${existing.asset_code} ไม่ได้รับอนุมัติโดย ${user.name}: ${rejectReason}`
      })
    ]);
    if (conflict) return conflict;

    return c.json({ workOrder: await fetchWorkOrder(db, id) });
  });

  // Submit execution result + certificate & acceptance criteria (moves to PENDING_REVIEW, never auto-closes)
  app.post('/api/vcc/work-orders/:id/submit-result', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const existing = await fetchWorkOrder(db, id);
    if (!existing) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);
    if (existing.status !== 'OPEN' && existing.status !== 'SCHEDULED' && existing.status !== 'REJECTED') {
      return c.json({ error: 'บันทึกผลได้เฉพาะใบสั่งงานที่อยู่ในสถานะเปิดงาน (OPEN), ตามแผน (SCHEDULED) หรือส่งกลับแก้ไข (REJECTED) เท่านั้น' }, 409);
    }
    if (!isUserAuthorizedForPlanDept(user, existing.department)) {
      return c.json({ error: 'ไม่มีสิทธิ์บันทึกผลใบสั่งงานของแผนกนี้' }, 403);
    }

    const performedAt = String(body.performed_at || '').trim();
    const resultStatus = String(body.result_status || '').trim().toUpperCase();
    const certificateNo = String(body.certificate_no || '').trim();
    const acceptanceCriteria = String(body.acceptance_criteria || '').trim();
    let resultRemarks = String(body.result_remarks || '').trim();

    if (!DATE_RE.test(performedAt)) return c.json({ error: 'กรุณาระบุวันที่ทวนสอบจริง (YYYY-MM-DD)' }, 400);
    const [pYear, pMonth, pDay] = performedAt.split('-').map(Number);
    const checkDate = new Date(Date.UTC(pYear, pMonth - 1, pDay));
    if (
      isNaN(checkDate.getTime()) ||
      checkDate.getUTCFullYear() !== pYear ||
      checkDate.getUTCMonth() + 1 !== pMonth ||
      checkDate.getUTCDate() !== pDay
    ) {
      return c.json({ error: 'วันที่ทวนสอบจริงไม่ถูกต้องตามปฏิทิน' }, 400);
    }
    const todayBangkok = getBangkokDateString(new Date());
    if (performedAt > todayBangkok) {
      return c.json({ error: 'วันที่ทวนสอบจริงต้องไม่เป็นวันที่ในอนาคต' }, 400);
    }
    if (!VALID_RESULT_STATUSES.has(resultStatus)) {
      return c.json({ error: 'ผลการทวนสอบต้องเป็น PASS, FAIL หรือ INCONCLUSIVE' }, 400);
    }
    if (resultStatus === 'FAIL' && !resultRemarks) {
      resultRemarks = 'ไม่ผ่านเกณฑ์ยอมรับตามที่กำหนด';
    }
    if (!certificateNo) {
      return c.json({ error: 'กรุณาระบุเลขที่ใบรับรอง (Certificate No.) หรืออ้างอิงหลักฐานการทวนสอบก่อนส่งตรวจรับ' }, 400);
    }
    if (!acceptanceCriteria) {
      return c.json({ error: 'กรุณาระบุเกณฑ์ยอมรับ (Acceptance Criteria) ที่ใช้ตรวจเทียบก่อนส่งตรวจรับ' }, 400);
    }

    const rawVerifType = body.verification_type !== undefined ? String(body.verification_type).trim().toUpperCase() : (existing.verification_type || 'QUANTITATIVE');
    if (rawVerifType !== 'QUANTITATIVE' && rawVerifType !== 'QUALITATIVE') {
      return c.json({ error: 'ประเภทการวัด/ทวนสอบต้องเป็น QUANTITATIVE หรือ QUALITATIVE เท่านั้น' }, 400);
    }
    const verificationType = rawVerifType;
    const actualResult = body.actual_result !== undefined ? (String(body.actual_result || '').trim() || null) : (existing.actual_result || null);

    const calibrationProviderName = body.calibration_provider_name !== undefined ? (String(body.calibration_provider_name || '').trim() || null) : existing.calibration_provider_name;
    const calibrationMethod = body.calibration_method !== undefined ? (String(body.calibration_method || '').trim() || null) : existing.calibration_method;
    const traceabilityRef = body.traceability_ref !== undefined ? (String(body.traceability_ref || '').trim() || null) : existing.traceability_ref;
    const environmentalConditions = body.environmental_conditions !== undefined ? (String(body.environmental_conditions || '').trim() || null) : existing.environmental_conditions;
    let uncertaintyValue = body.uncertainty_value !== undefined ? (String(body.uncertainty_value || '').trim() || null) : existing.uncertainty_value;
    let calibrationErrorValue = body.calibration_error_value !== undefined ? (String(body.calibration_error_value || '').trim() || null) : existing.calibration_error_value;

    if (verificationType === 'QUALITATIVE') {
      if (!actualResult) {
        return c.json({ error: 'สำหรับการทวนสอบเชิงคุณภาพ (Qualitative) จำเป็นต้องระบุผลการตรวจสอบจริง (Actual Result) เช่น ผ่านเกณฑ์ตามข้อกำหนด หรือสภาพสมบูรณ์' }, 400);
      }
      if (!uncertaintyValue || !uncertaintyValue.trim()) {
        uncertaintyValue = 'N/A (การทวนสอบเชิงคุณภาพ ไม่นำมาคำนวณ)';
      }
      if (!calibrationErrorValue || !calibrationErrorValue.trim()) {
        calibrationErrorValue = 'N/A (การทวนสอบเชิงคุณภาพ)';
      }
    } else {
      if (uncertaintyValue && uncertaintyValue.includes('การทวนสอบเชิงคุณภาพ')) {
        return c.json({ error: 'การทวนสอบเชิงปริมาณ (Quantitative) ไม่อนุญาตให้ใช้ข้อยกเว้น N/A ของการทวนสอบเชิงคุณภาพ กรุณาระบุค่าความไม่แน่นอนจริงหรือเลือกประเภทการทวนสอบเชิงคุณภาพ' }, 400);
      }
    }

    // Capture child assets snapshot for composite sets (DEC-04)
    let childAssetsSnapshot = existing.child_assets_snapshot;
    if (!childAssetsSnapshot) {
      const { results: currentChildAssets } = await db.prepare(`
        SELECT id, asset_code, name, asset_type, serial_no, model, location, status
        FROM vcc_assets
        WHERE parent_id = ?
        ORDER BY asset_code ASC
      `).bind(existing.asset_id).all().catch(() => ({ results: [] }));
      if (currentChildAssets && currentChildAssets.length > 0) {
        childAssetsSnapshot = JSON.stringify(currentChildAssets);
      }
    }

    let certificateIssueDate = existing.certificate_issue_date;
    if (body.certificate_issue_date !== undefined) {
      certificateIssueDate = String(body.certificate_issue_date || '').trim() || null;
      if (certificateIssueDate) {
        if (!DATE_RE.test(certificateIssueDate)) return c.json({ error: 'วันที่ออกใบรับรองไม่ถูกต้องตามรูปแบบ (YYYY-MM-DD)' }, 400);
        if (certificateIssueDate > todayBangkok) {
          return c.json({ error: 'วันที่ออกใบรับรองต้องไม่เป็นวันที่ในอนาคต' }, 400);
        }
      }
    }

    let certificateValidUntil = existing.certificate_valid_until;
    if (body.certificate_valid_until !== undefined) {
      certificateValidUntil = String(body.certificate_valid_until || '').trim() || null;
      if (certificateValidUntil) {
        if (!DATE_RE.test(certificateValidUntil)) return c.json({ error: 'วันที่ใบรับรองหมดอายุไม่ถูกต้องตามรูปแบบ (YYYY-MM-DD)' }, 400);
        if (certificateIssueDate && certificateValidUntil < certificateIssueDate) {
          return c.json({ error: 'วันที่ใบรับรองหมดอายุต้องไม่มาก่อนวันที่ออกใบรับรอง' }, 400);
        }
      }
    }

    // FAIL or INCONCLUSIVE immediately triggers ON_HOLD / NC control; a later PASS retest keeps the NC open until an L5+ release
    const isPass = resultStatus === 'PASS';
    const isInconclusive = resultStatus === 'INCONCLUSIVE';
    const nextStatus = isInconclusive ? 'PENDING_REVIEW' : 'CLOSED';
    const nextNcStatus = HOLDING_RESULTS.has(resultStatus) ? 'OPEN' : existing.nc_status;
    const reviewerId = null;
    const reviewedAt = null;

    const batchStmts = [
      db.prepare(`
        UPDATE vcc_work_orders
        SET status = ?,
            result_status = ?,
            performed_at = ?,
            certificate_no = ?,
            acceptance_criteria = ?,
            result_remarks = ?,
            calibration_provider_name = ?,
            calibration_method = ?,
            traceability_ref = ?,
            environmental_conditions = ?,
            uncertainty_value = ?,
            calibration_error_value = ?,
            certificate_issue_date = ?,
            certificate_valid_until = ?,
            performed_by = ?,
            reviewed_by = ?,
            reviewed_at = ?,
            nc_status = ?,
            verification_type = ?,
            actual_result = ?,
            child_assets_snapshot = COALESCE(?, child_assets_snapshot),
            rejected_reason = NULL,
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ? AND status IN ('OPEN', 'SCHEDULED', 'REJECTED', 'PENDING_REVIEW')
      `).bind(
        nextStatus,
        resultStatus,
        performedAt,
        certificateNo,
        acceptanceCriteria,
        resultRemarks,
        calibrationProviderName,
        calibrationMethod,
        traceabilityRef,
        environmentalConditions,
        uncertaintyValue,
        calibrationErrorValue,
        certificateIssueDate,
        certificateValidUntil,
        user.id,
        reviewerId,
        reviewedAt,
        nextNcStatus,
        verificationType,
        actualResult,
        childAssetsSnapshot,
        user.id,
        id
      ),
      assertRowUpdated(db),
      audit(db, user.id, 'VCC_WO_RESULT_SUBMITTED', {
        wo_id: id,
        wo_code: existing.wo_code,
        asset_id: existing.asset_id,
        asset_code: existing.asset_code,
        performed_at: performedAt,
        result_status: resultStatus,
        verification_type: verificationType,
        actual_result: actualResult,
        certificate_no: certificateNo,
        acceptance_criteria: acceptanceCriteria,
        calibration_provider_name: calibrationProviderName,
        calibration_method: calibrationMethod,
        traceability_ref: traceabilityRef,
        environmental_conditions: environmentalConditions,
        uncertainty_value: uncertaintyValue,
        calibration_error_value: calibrationErrorValue,
        certificate_issue_date: certificateIssueDate,
        certificate_valid_until: certificateValidUntil,
        nc_status: nextNcStatus,
        before: { status: existing.status },
        after: { status: nextStatus }
      })
    ];

    if (isPass) {
      batchStmts.push(
        woEventNotice(db, existing, {
          type: 'EVT_WO_VERIFIED', severity: 'SUCCESS', targetUserId: user.id,
          title: `[ปิดงานสำเร็จ] ใบสั่งงาน ${existing.wo_code}`,
          message: `ผลทวนสอบ/สอบเทียบของเครื่องมือ ${existing.asset_code} (${existing.asset_name}) ผ่านเกณฑ์และปิดงานเรียบร้อยแล้ว`
        })
      );
    }

    if (isPass && existing.nc_status !== 'OPEN') {
      batchStmts.push(
        db.prepare(`
          UPDATE vcc_assets
          SET status = 'ACTIVE',
              updated_at = ${NOW},
              updated_by = ?
          WHERE id = ?
        `).bind(user.id, existing.asset_id)
      );
      if (existing.cycle_id) {
        batchStmts.push(
          db.prepare(`
            UPDATE vcc_plan_cycles
            SET cycle_status = 'CLOSED'
            WHERE id = ?
          `).bind(existing.cycle_id)
        );
      } else if (existing.plan_item_id && existing.planned_month) {
        batchStmts.push(
          db.prepare(`
            UPDATE vcc_plan_cycles
            SET cycle_status = 'CLOSED'
            WHERE id = (
              SELECT id FROM vcc_plan_cycles
              WHERE plan_item_id = ? AND planned_month = ? AND cycle_status != 'CLOSED'
              LIMIT 1
            )
          `).bind(existing.plan_item_id, existing.planned_month)
        );
      }
    } else if (HOLDING_RESULTS.has(resultStatus)) {
      batchStmts.push(
        db.prepare(`
          UPDATE vcc_assets
          SET status = 'ON_HOLD',
              hold_started_at = COALESCE(hold_started_at, ${NOW}),
              updated_at = ${NOW},
              updated_by = ?
          WHERE id = ?
        `).bind(user.id, existing.asset_id),
        ...ncHoldNoticeStatements(db, existing)
      );
    }

    const conflict = await runTransition(c, db, batchStmts);
    if (conflict) return conflict;

    return c.json({ workOrder: await fetchWorkOrder(db, id) });
  });

  // Reviewer approves result -> status becomes CLOSED (if FAIL, nc_status remains OPEN until L5+ releases hold)
  app.post('/api/vcc/work-orders/:id/approve', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const comment = String(body.comment || '').trim();

    const existing = await fetchWorkOrder(db, id);
    if (!existing) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);
    if (!isUserAuthorizedForPlanDept(user, existing.department)) {
      return c.json({ error: 'ไม่มีสิทธิ์ตรวจรับและอนุมัติใบสั่งงานของแผนกนี้' }, 403);
    }
    if (user.id === existing.performed_by) {
      return c.json({ error: 'ผู้บันทึกผลไม่สามารถตรวจรับและอนุมัติปิดใบสั่งงานของตนเองได้' }, 403);
    }
    if (existing.status === 'CLOSED') {
      // Recording a result closes the work order with nobody having verified it yet; this is the verification by a
      // second person. It happens once: a later verifier must not add a second approval row or replace the first
      // verifier's name, so it is refused, and the update itself only applies while no one has verified.
      if (existing.reviewed_by) return c.json(STATE_CHANGED, 409);
      const conflict = await runTransition(c, db, [
        db.prepare(`
          UPDATE vcc_work_orders
          SET reviewed_by = ?,
              reviewed_at = ${NOW},
              review_comment = COALESCE(?, review_comment),
              updated_at = ${NOW},
              updated_by = ?
          WHERE id = ? AND status = 'CLOSED' AND reviewed_by IS NULL
        `).bind(user.id, comment || null, user.id, id),
        assertRowUpdated(db),
        audit(db, user.id, 'VCC_WO_APPROVED', {
          wo_id: id,
          wo_code: existing.wo_code,
          asset_id: existing.asset_id,
          asset_code: existing.asset_code,
          result_status: existing.result_status,
          nc_status: existing.nc_status,
          comment: comment || 'ตรวจรับและปิดงาน',
          before: { status: 'CLOSED' },
          after: { status: 'CLOSED' }
        }),
        woEventNotice(db, existing, {
          type: 'EVT_WO_VERIFIED', severity: 'SUCCESS', targetUserId: existing.performed_by,
          title: `[ตรวจรับผ่าน] ใบสั่งงาน ${existing.wo_code} ปิดงานแล้ว`,
          message: `ผลทวนสอบ/สอบเทียบของเครื่องมือ ${existing.asset_code} (${existing.asset_name}) ได้รับการตรวจรับโดย ${user.name}`
        })
      ]);
      if (conflict) return conflict;
      return c.json({ workOrder: await fetchWorkOrder(db, id) });
    }
    if (existing.status !== 'PENDING_REVIEW') {
      return c.json({ error: 'อนุมัติปิดงานได้เฉพาะใบสั่งงานที่อยู่ในสถานะรอตรวจรับผล (PENDING_REVIEW) เท่านั้น' }, 409);
    }
    if (existing.result_status === 'INCONCLUSIVE') {
      return c.json({ error: 'ผลรอตรวจซ้ำ (INCONCLUSIVE) ปิดงานไม่ได้ กรุณาส่งกลับเพื่อตรวจซ้ำและบันทึกผลใหม่' }, 409);
    }

    const settings = await readWorkOrderSettings(db);
    const thresholds = await getThresholds(db, settings.approval_doc_type);
    const userLevel = Number(user.approval_level ?? 0);

    if (user.id === existing.performed_by) {
      return c.json({ error: 'ผู้บันทึกผลไม่สามารถตรวจรับและอนุมัติปิดใบสั่งงานของตนเองได้' }, 403);
    }
    if (userLevel < thresholds.required_reviewer_level) {
      return c.json(
        { error: `ผู้ตรวจรับผลต้องมีระดับอนุมัติ L${thresholds.required_reviewer_level} ขึ้นไปตาม Approval Matrix` },
        403
      );
    }

    let childAssetsSnapshot = existing.child_assets_snapshot;
    if (!childAssetsSnapshot) {
      const { results: currentChildAssets } = await db.prepare(`
        SELECT id, asset_code, name, asset_type, serial_no, model, location, status
        FROM vcc_assets
        WHERE parent_id = ?
        ORDER BY asset_code ASC
      `).bind(existing.asset_id).all().catch(() => ({ results: [] }));
      if (currentChildAssets && currentChildAssets.length > 0) {
        childAssetsSnapshot = JSON.stringify(currentChildAssets);
      }
    }

    const conflict = await runTransition(c, db, [
      db.prepare(`
        UPDATE vcc_work_orders
        SET status = 'CLOSED',
            reviewed_by = ?,
            reviewed_at = ${NOW},
            review_comment = ?,
            child_assets_snapshot = COALESCE(?, child_assets_snapshot),
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ? AND status = 'PENDING_REVIEW' AND result_status IS NOT 'INCONCLUSIVE'
      `).bind(user.id, comment, childAssetsSnapshot, user.id, id),
      assertRowUpdated(db),
      audit(db, user.id, 'VCC_WO_APPROVED', {
        wo_id: id,
        wo_code: existing.wo_code,
        asset_id: existing.asset_id,
        asset_code: existing.asset_code,
        result_status: existing.result_status,
        nc_status: existing.nc_status,
        comment,
        before: { status: 'PENDING_REVIEW' },
        after: { status: 'CLOSED' }
      }),
      woEventNotice(db, existing, {
        type: 'EVT_WO_VERIFIED', severity: 'SUCCESS', targetUserId: existing.performed_by,
        title: `[ตรวจรับผ่าน] ใบสั่งงาน ${existing.wo_code} ปิดงานแล้ว`,
        message: `ผลทวนสอบ/สอบเทียบของเครื่องมือ ${existing.asset_code} (${existing.asset_name}) ได้รับการตรวจรับโดย ${user.name}`
      })
    ]);
    if (conflict) return conflict;

    return c.json({ workOrder: await fetchWorkOrder(db, id) });
  });

  // Reviewer rejects result -> mandatory reason, status becomes REJECTED
  app.post('/api/vcc/work-orders/:id/reject', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const reason = String(body.reason || '').trim();

    if (!reason) {
      return c.json({ error: 'กรุณาระบุเหตุผลในการส่งกลับแก้ไขผลทวนสอบ' }, 400);
    }

    const existing = await fetchWorkOrder(db, id);
    if (!existing) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);
    if (existing.status !== 'PENDING_REVIEW') {
      return c.json({ error: 'ส่งกลับแก้ไขได้เฉพาะใบสั่งงานที่รอตรวจรับผล (PENDING_REVIEW) เท่านั้น' }, 409);
    }
    if (!isUserAuthorizedForPlanDept(user, existing.department)) {
      return c.json({ error: 'ไม่มีสิทธิ์ส่งกลับแก้ไขใบสั่งงานของแผนกนี้' }, 403);
    }

    const settings = await readWorkOrderSettings(db);
    const thresholds = await getThresholds(db, settings.approval_doc_type);
    const userLevel = Number(user.approval_level ?? 0);

    if (user.id === existing.performed_by) {
      return c.json({ error: 'ผู้บันทึกผลไม่สามารถพิจารณาใบสั่งงานของตนเองได้' }, 403);
    }
    if (userLevel < thresholds.required_reviewer_level) {
      return c.json(
        { error: `ผู้ตรวจรับผลต้องมีระดับอนุมัติ L${thresholds.required_reviewer_level} ขึ้นไปตาม Approval Matrix` },
        403
      );
    }

    const conflict = await runTransition(c, db, [
      db.prepare(`
        UPDATE vcc_work_orders
        SET status = 'REJECTED',
            rejected_reason = ?,
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ? AND status = 'PENDING_REVIEW'
      `).bind(reason, user.id, id),
      assertRowUpdated(db),
      audit(db, user.id, 'VCC_WO_REJECTED', {
        wo_id: id,
        wo_code: existing.wo_code,
        asset_id: existing.asset_id,
        reason,
        // The sent-back result stays traceable here even after the performer records the retest over it
        rejected_result: {
          result_status: existing.result_status,
          performed_at: existing.performed_at,
          performed_by: existing.performed_by,
          certificate_no: existing.certificate_no
        },
        before: { status: 'PENDING_REVIEW' },
        after: { status: 'REJECTED' }
      }),
      woEventNotice(db, existing, {
        type: 'EVT_WO_RETURNED', severity: 'WARNING', targetUserId: existing.performed_by,
        title: `[ส่งกลับแก้ไข] ใบสั่งงาน ${existing.wo_code}`,
        message: `ผลของเครื่องมือ ${existing.asset_code} ถูกส่งกลับโดย ${user.name}: ${reason}`
      })
    ]);
    if (conflict) return conflict;

    return c.json({ workOrder: await fetchWorkOrder(db, id) });
  });

  // Release ON_HOLD / NC -> requires L5+ (required_approver_level), a reviewed (CLOSED) work order, someone other than
  // the performer, and both a release reason and an impact assessment
  app.post('/api/vcc/work-orders/:id/release-hold', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const impactAssessment = String(body.impact_assessment || '').trim();
    const releaseReason = String(body.release_reason || '').trim();

    if (!releaseReason) {
      return c.json({ error: 'กรุณาระบุเหตุผลการปลดระงับและการแก้ไขที่ทำแล้ว ก่อนปลดระงับเครื่องมือ' }, 400);
    }
    if (!impactAssessment) {
      return c.json({ error: 'กรุณาระบุผลการประเมินผลกระทบและการแก้ไข (NC Impact Assessment) ก่อนปลดระงับเครื่องมือ' }, 400);
    }

    const existing = await fetchWorkOrder(db, id);
    if (!existing) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);
    if (existing.nc_status !== 'OPEN') {
      return c.json({ error: 'รายการนี้ไม่ได้อยู่ในสถานะระงับใช้งาน (ON_HOLD)' }, 409);
    }
    if (!isUserAuthorizedForPlanDept(user, existing.department)) {
      return c.json({ error: 'ไม่มีสิทธิ์ปลดระงับเครื่องมือของแผนกนี้' }, 403);
    }

    const settings = await readWorkOrderSettings(db);
    const thresholds = await getThresholds(db, settings.approval_doc_type);
    const userLevel = Number(user.approval_level ?? 0);

    if (userLevel < thresholds.required_approver_level) {
      return c.json(
        { error: `ผู้สั่งปลดระงับเครื่องมือ (ON_HOLD) ต้องมีระดับอนุมัติ L${thresholds.required_approver_level} ขึ้นไปตาม Approval Matrix` },
        403
      );
    }
    if (user.id === existing.performed_by) {
      return c.json({ error: 'ผู้บันทึกผลไม่สามารถปลดระงับเครื่องมือจากผลที่ตนบันทึกได้ (ต้องให้ผู้อื่นดำเนินการ)' }, 403);
    }
    if (existing.status !== 'CLOSED') {
      return c.json({ error: 'ต้องตรวจรับผลและปิดใบสั่งงานก่อน จึงจะปลดระงับเครื่องมือได้' }, 409);
    }

    const conflict = await runTransition(c, db, [
      db.prepare(`
        UPDATE vcc_work_orders
        SET nc_status = 'RELEASED',
            nc_impact_assessment = ?,
            hold_released_by = ?,
            hold_released_at = ${NOW},
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ? AND nc_status = 'OPEN' AND status = 'CLOSED'
      `).bind(impactAssessment, user.id, user.id, id),
      assertRowUpdated(db),
      db.prepare(`
        UPDATE vcc_assets
        SET status = 'ACTIVE',
            hold_started_at = NULL,
            updated_at = ${NOW}
        WHERE id = ?
          AND status != 'RETIRED'
          AND NOT EXISTS (
            SELECT 1 FROM vcc_work_orders
            WHERE asset_id = ? AND id != ? AND nc_status = 'OPEN'
          )
      `).bind(existing.asset_id, existing.asset_id, id),
      audit(db, user.id, 'VCC_WO_HOLD_RELEASED', {
        wo_id: id,
        wo_code: existing.wo_code,
        asset_id: existing.asset_id,
        asset_code: existing.asset_code,
        result_status: existing.result_status,
        performed_by: existing.performed_by,
        reviewed_by: existing.reviewed_by,
        release_reason: releaseReason,
        impact_assessment: impactAssessment,
        before: { nc_status: 'OPEN' },
        after: { nc_status: 'RELEASED' }
      })
    ]);
    if (conflict) return conflict;

    return c.json({ workOrder: await fetchWorkOrder(db, id) });
  });

  // The VCC task inbox: every work-order step this user can act on right now. Each rule below mirrors the matching POST
  // endpoint (same department, level and Separation-of-Duties checks), so a listed task never ends in a 403 for permissions.
  app.get('/api/vcc/work-tasks', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const settings = await readWorkOrderSettings(db);
    const thresholds = await getThresholds(db, settings.approval_doc_type);
    const userLevel = Number(user.approval_level ?? 0);
    const horizon = getBangkokDateString(new Date(Date.now() + WORK_TASK_LEAD_DAYS * 86400000));

    const { results: wos } = await db.prepare(`
      SELECT w.id, w.wo_code, w.status, w.result_status, w.nc_status, w.due_date, w.performed_by, w.performed_at,
        w.rejected_reason, w.created_at, a.asset_code, a.name AS asset_name, a.department
      FROM vcc_work_orders w
      JOIN vcc_assets a ON a.id = w.asset_id
      WHERE w.status IN ('OPEN', 'SCHEDULED', 'PENDING_REVIEW', 'REJECTED')
         OR (w.status = 'CLOSED' AND w.nc_status = 'OPEN')
    `).all();
    const { results: requests } = await db.prepare(`
      SELECT r.id, r.work_order_id, r.requested_by, r.proposed_changes, r.created_at,
        w.wo_code, w.result_status, w.performed_by, w.due_date, a.asset_code, a.name AS asset_name, a.department
      FROM vcc_work_order_amendment_requests r
      JOIN vcc_work_orders w ON w.id = r.work_order_id
      JOIN vcc_assets a ON a.id = w.asset_id
      WHERE r.status = 'PENDING' AND w.status = 'CLOSED'
    `).all();

    const tasks = [];
    const add = (kind, wo, extra = {}) => tasks.push({
      id: `${kind}:${extra.request_id || wo.id}`,
      kind,
      wo_id: wo.work_order_id || wo.id,
      wo_code: wo.wo_code,
      asset_code: wo.asset_code,
      asset_name: wo.asset_name,
      department: wo.department,
      due_date: wo.due_date,
      result_status: wo.result_status,
      link: `/vcc/work-orders?wo=${encodeURIComponent(wo.work_order_id || wo.id)}`,
      ...extra
    });

    for (const wo of wos || []) {
      if (!isUserAuthorizedForPlanDept(user, wo.department)) continue;
      const isPerformer = user.id === wo.performed_by;
      if (wo.status === 'OPEN' || wo.status === 'SCHEDULED') {
        // a SCHEDULED order is not work yet until its month is near
        if (wo.status === 'OPEN' || (wo.due_date && wo.due_date <= horizon)) add('RECORD_RESULT', wo, { created_at: wo.created_at });
      } else if (wo.status === 'PENDING_REVIEW') {
        if (!isPerformer && userLevel >= thresholds.required_reviewer_level) add('REVIEW_RESULT', wo, { created_at: wo.performed_at || wo.created_at });
      } else if (wo.status === 'REJECTED') {
        if (isPerformer || user.is_dcc || user.isDcc) add('REVISE_RESULT', wo, { reason: wo.rejected_reason, created_at: wo.performed_at || wo.created_at });
      } else if (wo.status === 'CLOSED' && wo.nc_status === 'OPEN') {
        if (!isPerformer && userLevel >= thresholds.required_approver_level) add('RELEASE_HOLD', wo, { created_at: wo.performed_at || wo.created_at });
      }
    }

    for (const r of requests || []) {
      if (!isUserAuthorizedForPlanDept(user, r.department)) continue;
      if (user.id === r.performed_by || user.id === r.requested_by) continue;
      if (userLevel < Math.max(4, thresholds.required_reviewer_level || 4)) continue;
      let proposed = {};
      try { proposed = JSON.parse(r.proposed_changes || '{}'); } catch { proposed = {}; }
      const nextResult = proposed.result_status ? String(proposed.result_status).trim().toUpperCase() : r.result_status;
      if ((r.result_status === 'FAIL' || nextResult === 'FAIL') && userLevel < thresholds.required_approver_level) continue;
      add('APPROVE_AMENDMENT', r, { request_id: r.id, created_at: r.created_at });
    }

    return c.json({ tasks });
  });

  // Cancel work order with mandatory category and reason. Only the work order is cancelled: the plan cycle stays, so
  // reconcile can issue a fresh work order; dropping a cycle for good goes through an approved plan revision.
  app.post('/api/vcc/work-orders/:id/cancel', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const existing = await fetchWorkOrder(db, id);
    if (!existing) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);
    if (existing.status === 'CLOSED') {
      return c.json({ error: 'ไม่สามารถยกเลิกใบสั่งงานที่ปิดงาน (CLOSED) สำเร็จแล้วได้' }, 409);
    }
    if (existing.status === 'CANCELLED') {
      return c.json({ error: 'ใบสั่งงานนี้ถูกยกเลิกไปแล้ว' }, 409);
    }

    // Same rule as managing the department's register: DCC, or L4+ of the work order's own department
    if (!canManageVccAsset(user, existing.department)) {
      return c.json({ error: 'ยกเลิกใบสั่งงานได้เฉพาะหัวหน้าแผนกเจ้าของงาน (L4 ขึ้นไป) หรือ DCC เท่านั้น' }, 403);
    }
    if (existing.nc_status === 'OPEN') {
      return c.json({ error: 'ใบสั่งงานนี้มีผลไม่ผ่าน/รอตรวจซ้ำและเครื่องมือถูกระงับใช้อยู่ ต้องตรวจรับผลและปลดระงับตามขั้นตอนก่อน ยกเลิกไม่ได้' }, 409);
    }

    const category = String(body.cancellation_category || '').trim().toUpperCase();
    const reason = String(body.cancellation_reason || '').trim();

    if (!VALID_CANCELLATION_CATEGORIES.has(category)) {
      return c.json({ error: 'ประเภทการยกเลิกต้องเป็น MISTAKE_CREATION หรือ AUTHORIZED_CANCEL' }, 400);
    }
    if (!MANUAL_CANCELLATION_CATEGORIES.has(category)) {
      return c.json({ error: 'การตัดรอบออกจากแผน (PLAN_REVISION / ASSET_RETIRED) ต้องทำผ่านการปรับปรุงแผนที่ได้รับอนุมัติ ไม่ใช่การยกเลิกใบสั่งงาน' }, 400);
    }
    if (!reason) {
      return c.json({ error: 'กรุณาระบุเหตุผลในการขอยกเลิกใบสั่งงาน' }, 400);
    }

    const batchStmts = [
      db.prepare(`
        UPDATE vcc_work_orders
        SET status = 'CANCELLED',
            cancellation_category = ?,
            cancellation_reason = ?,
            cancelled_by = ?,
            cancelled_at = ${NOW},
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ? AND status = ? AND nc_status IS NOT 'OPEN'
      `).bind(category, reason, user.id, user.id, id, existing.status),
      assertRowUpdated(db),
      audit(db, user.id, 'VCC_WO_CANCELLED', {
        wo_id: id,
        wo_code: existing.wo_code,
        asset_id: existing.asset_id,
        cycle_id: existing.cycle_id,
        cancellation_category: category,
        cancellation_reason: reason,
        before: { status: existing.status },
        after: { status: 'CANCELLED' }
      })
    ];

    const conflict = await runTransition(c, db, batchStmts);
    if (conflict) return conflict;

    return c.json({ workOrder: await fetchWorkOrder(db, id) });
  });

  // Upload Certificate PDF to Cloudflare R2 with SHA-256 integrity hash & versioning
  app.put('/api/vcc/work-orders/:id/certificate-file', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');

    const existing = await fetchWorkOrder(db, id);
    if (!existing) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);
    if (existing.status === 'CLOSED') {
      const isAmendment = c.req.query('amendment') === '1' || c.req.query('purpose') === 'amendment';
      if (!isAmendment) {
        return c.json({ error: 'ใบสั่งงานปิดสมบูรณ์แล้ว การเปลี่ยนหรือแก้ไขไฟล์ใบรับรองต้องทำผ่านกระบวนการขอแก้ไข (Amendment) เท่านั้น' }, 409);
      }
    }
    if (existing.status === 'CANCELLED') {
      return c.json({ error: 'ไม่สามารถแนบไฟล์ใบรับรองในใบสั่งงานที่ยกเลิกไปแล้วได้' }, 409);
    }
    if (!isUserAuthorizedForPlanDept(user, existing.department)) {
      return c.json({ error: 'ไม่มีสิทธิ์แนบไฟล์ใบรับรองสำหรับใบสั่งงานของแผนกนี้' }, 403);
    }

    if (Number(c.req.header('content-length')) > MAX_CERTIFICATE_PDF_BYTES) {
      return c.json({ error: 'ไฟล์ต้องไม่เกิน 25 MB' }, 413);
    }

    const file = await c.req.arrayBuffer();
    if (file.byteLength > MAX_CERTIFICATE_PDF_BYTES) {
      return c.json({ error: 'ไฟล์ต้องไม่เกิน 25 MB' }, 413);
    }
    if (file.byteLength === 0) {
      return c.json({ error: 'กรุณาเลือกไฟล์ PDF ที่ต้องการอัปโหลด' }, 400);
    }
    if (new TextDecoder().decode(file.slice(0, 5)) !== '%PDF-') {
      return c.json({ error: 'ไฟล์ต้องเป็น PDF' }, 400);
    }

    // c.req.query() is already URL-decoded: decoding again corrupts a name with '%' or throws. Only the header is still encoded.
    const q = (name, max) => c.req.query(name)?.trim().slice(0, max) || null;
    let rawFileName = c.req.query('filename');
    if (!rawFileName) {
      try { rawFileName = decodeURIComponent(c.req.header('x-filename') || ''); } catch { rawFileName = ''; }
    }
    const fileName = rawFileName.trim().replace(/[/\\?%*:|"<>]/g, '_').slice(0, 200) || 'certificate.pdf';
    const certificateNo = q('certificate_no', 100) || existing.certificate_no || null;
    const issueDate = q('issue_date', 10);
    const validUntil = q('valid_until', 10);
    const changeReason = q('change_reason', 1000);

    if (issueDate) {
      if (!DATE_RE.test(issueDate)) return c.json({ error: 'วันที่ออกใบรับรองไม่ถูกต้องตามรูปแบบ (YYYY-MM-DD)' }, 400);
      const todayBangkok = getBangkokDateString(new Date());
      if (issueDate > todayBangkok) {
        return c.json({ error: 'วันที่ออกใบรับรองต้องไม่เป็นวันที่ในอนาคต' }, 400);
      }
    }
    if (validUntil) {
      if (!DATE_RE.test(validUntil)) return c.json({ error: 'วันที่ใบรับรองหมดอายุไม่ถูกต้องตามรูปแบบ (YYYY-MM-DD)' }, 400);
      if (issueDate && validUntil < issueDate) {
        return c.json({ error: 'วันที่ใบรับรองหมดอายุต้องไม่มาก่อนวันที่ออกใบรับรอง' }, 400);
      }
    }

    const fileHash = await computeSha256(file);
    const key = `vcc/certificates/${existing.id}/${crypto.randomUUID()}.pdf`;

    if (!c.env.FILES) {
      return c.json({ error: 'ระบบจัดเก็บไฟล์ R2 ยังไม่ได้เชื่อมต่อหรือไม่พร้อมใช้งาน' }, 503);
    }

    try {
      await c.env.FILES.put(key, file, {
        httpMetadata: {
          contentType: 'application/pdf',
          contentDisposition: `inline; filename="${fileName}"`
        },
        customMetadata: {
          work_order_id: existing.id,
          file_hash: fileHash,
          uploaded_by: user.id
        }
      });
    } catch (uploadErr) {
      return c.json({ error: `การอัปโหลดไฟล์ใบรับรองไปยังระบบจัดเก็บ R2 ล้มเหลว: ${uploadErr?.message || 'Upload failed'}` }, 500);
    }

    // Next version in immutable history
    const latestVersionRow = await db
      .prepare('SELECT COALESCE(MAX(version), 0) AS max_v FROM vcc_work_order_certificates WHERE work_order_id = ?')
      .bind(existing.id)
      .first();
    const nextVersion = (latestVersionRow?.max_v || 0) + 1;
    const certRecordId = crypto.randomUUID();

    await db.batch([
      db.prepare(`
        INSERT INTO vcc_work_order_certificates (
          id, work_order_id, version, file_key, file_name, file_size, file_hash,
          certificate_no, issue_date, valid_until, uploaded_by, uploaded_at, change_reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${NOW}, ?, ${NOW})
      `).bind(
        certRecordId,
        existing.id,
        nextVersion,
        key,
        fileName,
        file.byteLength,
        fileHash,
        certificateNo,
        issueDate,
        validUntil,
        user.id,
        changeReason
      ),
      db.prepare(`
        UPDATE vcc_work_orders
        SET certificate_file_key = ?,
            certificate_file_name = ?,
            certificate_file_size = ?,
            certificate_file_hash = ?,
            certificate_version = ?,
            certificate_uploaded_at = ${NOW},
            certificate_uploaded_by = ?,
            certificate_no = COALESCE(?, certificate_no),
            certificate_issue_date = COALESCE(?, certificate_issue_date),
            certificate_valid_until = COALESCE(?, certificate_valid_until),
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ?
      `).bind(
        key,
        fileName,
        file.byteLength,
        fileHash,
        nextVersion,
        user.id,
        certificateNo,
        issueDate,
        validUntil,
        user.id,
        existing.id
      ),
      audit(db, user.id, 'VCC_WO_CERTIFICATE_ATTACHED', {
        wo_id: existing.id,
        wo_code: existing.wo_code,
        asset_id: existing.asset_id,
        version: nextVersion,
        file_key: key,
        file_name: fileName,
        file_size: file.byteLength,
        file_hash: fileHash,
        certificate_no: certificateNo
      })
    ]);

    return c.json({ workOrder: await fetchWorkOrder(db, id), certificate_version: nextVersion, file_hash: fileHash });
  });

  // Stream/Download Certificate PDF from R2
  app.get('/api/vcc/work-orders/:id/certificate-file', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const purpose = c.req.query('purpose') || 'view';
    const versionQuery = c.req.query('version');

    const existing = await fetchWorkOrder(db, id);
    if (!existing) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);
    if (!canReadVccDepartment(user, existing.department)) {
      return c.json({ error: 'ไม่มีสิทธิ์เข้าถึงไฟล์ใบรับรองของแผนกนี้' }, 403);
    }

    let fileKey = existing.certificate_file_key;
    let fileName = existing.certificate_file_name || `${existing.wo_code}_Cert.pdf`;

    if (versionQuery) {
      const vNum = Number(versionQuery);
      const certRow = await db
        .prepare('SELECT file_key, file_name FROM vcc_work_order_certificates WHERE work_order_id = ? AND version = ?')
        .bind(id, vNum)
        .first();
      if (!certRow) return c.json({ error: `ไม่พบประวัติไฟล์ใบรับรองเวอร์ชัน ${vNum}` }, 404);
      fileKey = certRow.file_key;
      fileName = certRow.file_name;
    }

    if (!fileKey) {
      return c.json({ error: 'ยังไม่มีการแนบไฟล์ใบรับรองในใบสั่งงานนี้' }, 404);
    }

    if (!c.env.FILES) {
      return c.json({ error: 'ระบบจัดเก็บไฟล์ R2 ยังไม่ได้เชื่อมต่อ' }, 503);
    }

    const obj = await c.env.FILES.get(fileKey);
    if (!obj) {
      return c.json({ error: 'ไม่พบไฟล์ในระบบจัดเก็บ' }, 404);
    }

    const disposition = purpose === 'download' ? 'attachment' : 'inline';
    const action = purpose === 'download' ? 'VCC_WO_CERTIFICATE_DOWNLOADED' : 'VCC_WO_CERTIFICATE_VIEWED';

    await audit(db, user.id, action, {
      wo_id: existing.id,
      wo_code: existing.wo_code,
      file_key: fileKey,
      file_name: fileName,
      version: versionQuery ? Number(versionQuery) : existing.certificate_version
    }).run();

    return new Response(obj.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'private, no-store'
      }
    });
  });

  // Controlled Amendment for CLOSED work orders (ISO/IEC 17025 clause 7.8.8)
  // Step 1: Submit Amendment Request (Requester authenticated on server, Segregation of Duties)
  const handleRequestAmendment = async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const existing = await fetchWorkOrder(db, id);
    if (!existing) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);
    if (existing.status !== 'CLOSED') {
      return c.json({ error: 'การแก้ไข (Amendment) ทำได้เฉพาะใบสั่งงานที่ปิดงาน (CLOSED) สำเร็จแล้วเท่านั้น หากยังไม่ปิดงานให้แก้ไขในขั้นตอนปกติ' }, 409);
    }
    if (!isUserAuthorizedForPlanDept(user, existing.department)) {
      return c.json({ error: 'ไม่มีสิทธิ์ขอแก้ไขใบสั่งงานของแผนกนี้' }, 403);
    }

    const settings = await readWorkOrderSettings(db);
    const thresholds = await getThresholds(db, settings.approval_doc_type);
    const userLevel = Number(user.approval_level ?? 0);

    // Required requester level: at least L4+ (or reviewer level)
    const requiredLevel = Math.max(4, thresholds.required_reviewer_level || 4);
    if (userLevel < requiredLevel) {
      return c.json({ error: `ผู้มีอำนาจขอแก้ไขใบสั่งงานที่ปิดแล้วต้องมีระดับอนุมัติ L${requiredLevel} ขึ้นไป` }, 403);
    }

    // Check if an amendment request is already pending (the INSERT below re-checks atomically for concurrent requests)
    const pendingExisting = await db
      .prepare("SELECT id FROM vcc_work_order_amendment_requests WHERE work_order_id = ? AND status = 'PENDING'")
      .bind(id)
      .first();
    if (pendingExisting) {
      return c.json({ error: 'มีคำขอแก้ไข (Amendment Request) ที่รอการอนุมัติอยู่แล้ว กรุณารอการตรวจสอบคำขอเดิมก่อนสร้างคำขอใหม่' }, 409);
    }

    const reason = String(body.amendment_reason || body.reason || '').trim();
    if (!reason) {
      return c.json({ error: 'กรุณาระบุเหตุผลและความจำเป็นในการแก้ไขผลใบสั่งงานที่ปิดไปแล้ว (Amendment Reason)' }, 400);
    }

    const todayBangkok = getBangkokDateString(new Date());
    let performedAt = existing.performed_at;
    if (body.performed_at !== undefined) {
      performedAt = String(body.performed_at || '').trim();
      if (!DATE_RE.test(performedAt)) return c.json({ error: 'กรุณาระบุวันที่ทวนสอบจริง (YYYY-MM-DD)' }, 400);
      if (performedAt > todayBangkok) {
        return c.json({ error: 'วันที่ทวนสอบจริงต้องไม่เป็นวันที่ในอนาคต' }, 400);
      }
    }

    const newResultStatus = body.result_status ? String(body.result_status).trim().toUpperCase() : existing.result_status;
    if (newResultStatus && !VALID_RESULT_STATUSES.has(newResultStatus)) {
      return c.json({ error: 'ผลการทวนสอบต้องเป็น PASS, FAIL หรือ INCONCLUSIVE' }, 400);
    }
    if (newResultStatus === 'INCONCLUSIVE') {
      return c.json({ error: AMEND_TO_INCONCLUSIVE_ERROR }, 400);
    }

    let certificateIssueDate = existing.certificate_issue_date;
    if (body.certificate_issue_date !== undefined) {
      certificateIssueDate = String(body.certificate_issue_date || '').trim() || null;
      if (certificateIssueDate) {
        if (!DATE_RE.test(certificateIssueDate)) return c.json({ error: 'วันที่ออกใบรับรองไม่ถูกต้องตามรูปแบบ (YYYY-MM-DD)' }, 400);
        if (certificateIssueDate > todayBangkok) {
          return c.json({ error: 'วันที่ออกใบรับรองต้องไม่เป็นวันที่ในอนาคต' }, 400);
        }
      }
    }

    let certificateValidUntil = existing.certificate_valid_until;
    if (body.certificate_valid_until !== undefined) {
      certificateValidUntil = String(body.certificate_valid_until || '').trim() || null;
      if (certificateValidUntil) {
        if (!DATE_RE.test(certificateValidUntil)) return c.json({ error: 'วันที่ใบรับรองหมดอายุไม่ถูกต้องตามรูปแบบ (YYYY-MM-DD)' }, 400);
        if (certificateIssueDate && certificateValidUntil < certificateIssueDate) {
          return c.json({ error: 'วันที่ใบรับรองหมดอายุต้องไม่มาก่อนวันที่ออกใบรับรอง' }, 400);
        }
      }
    }

    const proposedChanges = {
      result_status: newResultStatus,
      performed_at: performedAt,
      certificate_no: body.certificate_no !== undefined ? String(body.certificate_no || '').trim() : existing.certificate_no,
      acceptance_criteria: body.acceptance_criteria !== undefined ? String(body.acceptance_criteria || '').trim() : existing.acceptance_criteria,
      result_remarks: body.result_remarks !== undefined ? String(body.result_remarks || '').trim() : existing.result_remarks,
      calibration_provider_name: body.calibration_provider_name !== undefined ? (String(body.calibration_provider_name || '').trim() || null) : existing.calibration_provider_name,
      calibration_method: body.calibration_method !== undefined ? (String(body.calibration_method || '').trim() || null) : existing.calibration_method,
      traceability_ref: body.traceability_ref !== undefined ? (String(body.traceability_ref || '').trim() || null) : existing.traceability_ref,
      environmental_conditions: body.environmental_conditions !== undefined ? (String(body.environmental_conditions || '').trim() || null) : existing.environmental_conditions,
      uncertainty_value: body.uncertainty_value !== undefined ? (String(body.uncertainty_value || '').trim() || null) : existing.uncertainty_value,
      calibration_error_value: body.calibration_error_value !== undefined ? (String(body.calibration_error_value || '').trim() || null) : existing.calibration_error_value,
      certificate_issue_date: certificateIssueDate,
      certificate_valid_until: certificateValidUntil,
      verification_type: body.verification_type !== undefined ? String(body.verification_type).trim().toUpperCase() : (existing.verification_type || 'QUANTITATIVE'),
      actual_result: body.actual_result !== undefined ? (String(body.actual_result).trim() || null) : (existing.actual_result || null)
    };

    const requestId = crypto.randomUUID();
    const conflict = await runTransition(c, db, [
      db.prepare(`
        INSERT INTO vcc_work_order_amendment_requests (
          id, work_order_id, requested_by, requested_at, amendment_reason, proposed_changes, status, created_at, updated_at
        )
        SELECT ?, ?, ?, ${NOW}, ?, ?, 'PENDING', ${NOW}, ${NOW}
        WHERE NOT EXISTS (SELECT 1 FROM vcc_work_order_amendment_requests WHERE work_order_id = ? AND status = 'PENDING')
      `).bind(requestId, id, user.id, reason, JSON.stringify(proposedChanges), id),
      assertRowUpdated(db),
      audit(db, user.id, 'VCC_WO_AMENDMENT_REQUESTED', {
        wo_id: id,
        wo_code: existing.wo_code,
        asset_id: existing.asset_id,
        request_id: requestId,
        requested_by: user.id,
        requested_by_name: user.name,
        reason,
        proposed_changes: proposedChanges
      })
    ]);
    if (conflict) return conflict;

    const createdRequest = {
      id: requestId,
      work_order_id: id,
      requested_by: user.id,
      requested_by_name: user.name,
      amendment_reason: reason,
      proposed_changes: proposedChanges,
      status: 'PENDING'
    };

    return c.json({
      message: 'บันทึกคำขอแก้ไข (Amendment Request) เรียบร้อยแล้ว รอการอนุมัติ',
      request: createdRequest
    }, 201);
  };

  // Step 2: Approve Amendment Request (SoD: Requester != Approver and Performer != Approver)
  const handleApproveAmendment = async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const paramRequestId = c.req.param('requestId');
    const body = await c.req.json().catch(() => ({}));
    const targetRequestId = paramRequestId || body.request_id || body.requestId || null;

    const existing = await fetchWorkOrder(db, id);
    if (!existing) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);
    if (existing.status !== 'CLOSED') {
      return c.json({ error: 'การแก้ไข (Amendment) ทำได้เฉพาะใบสั่งงานที่ปิดงาน (CLOSED) สำเร็จแล้วเท่านั้น หากยังไม่ปิดงานให้แก้ไขในขั้นตอนปกติ' }, 409);
    }
    if (!isUserAuthorizedForPlanDept(user, existing.department)) {
      return c.json({ error: 'ไม่มีสิทธิ์ขอแก้ไขใบสั่งงานของแผนกนี้' }, 403);
    }

    // Load request from DB
    let reqRow;
    if (targetRequestId) {
      reqRow = await db
        .prepare('SELECT * FROM vcc_work_order_amendment_requests WHERE id = ? AND work_order_id = ?')
        .bind(targetRequestId, id)
        .first();
    } else {
      reqRow = await db
        .prepare("SELECT * FROM vcc_work_order_amendment_requests WHERE work_order_id = ? AND status = 'PENDING' ORDER BY created_at DESC")
        .bind(id)
        .first();
    }

    if (!reqRow) {
      return c.json({ error: 'ไม่พบคำขอแก้ไข (Amendment Request) ที่รอการอนุมัติ' }, 404);
    }
    if (reqRow.status !== 'PENDING') {
      return c.json({ error: `คำขอแก้ไขนี้ได้รับการดำเนินการไปแล้ว (สถานะ: ${reqRow.status})` }, 409);
    }

    const settings = await readWorkOrderSettings(db);
    const thresholds = await getThresholds(db, settings.approval_doc_type);
    const userLevel = Number(user.approval_level ?? 0);

    // Segregation of Duties 1: Performer cannot approve amendment of their own work order, even with L5+
    if (user.id === existing.performed_by || user.username === existing.performed_by) {
      return c.json({ error: 'การคัดแยกหน้าที่ (Segregation of Duties): ผู้บันทึกผลการสอบเทียบไม่สามารถอนุมัติการแก้ไข (Amendment) ของตนเองได้ แม้จะมีสิทธิ์ระดับ L5+ ขึ้นไป (ต้องให้ผู้อนุมัติอื่นเป็นผู้ดำเนินการ)' }, 403);
    }

    // Segregation of Duties 2: Requester loaded STRICTLY from database row cannot approve their own amendment
    // NOTE: Client body.requested_by is completely ignored and untrusted to prevent spoofing.
    const dbRequesterId = reqRow.requested_by;
    if (user.id === dbRequesterId || user.username === dbRequesterId) {
      return c.json({ error: 'การคัดแยกหน้าที่ (Segregation of Duties): ผู้ร้องขอแก้ไขผลไม่สามารถอนุมัติการแก้ไข (Amendment) ของตนเองได้ (ต้องให้ผู้อนุมัติแยกคนเป็นผู้ดำเนินการ)' }, 403);
    }

    // Minimum requirement: L4+ (or reviewer level)
    const requiredLevel = Math.max(4, thresholds.required_reviewer_level || 4);
    if (userLevel < requiredLevel) {
      return c.json({ error: `ผู้มีอำนาจขอแก้ไขใบสั่งงานที่ปิดแล้วต้องมีระดับอนุมัติ L${requiredLevel} ขึ้นไป` }, 403);
    }

    let proposed = {};
    try {
      proposed = JSON.parse(reqRow.proposed_changes || '{}');
    } catch {
      proposed = {};
    }

    const newResultStatus = proposed.result_status ? String(proposed.result_status).trim().toUpperCase() : existing.result_status;
    if (newResultStatus && !VALID_RESULT_STATUSES.has(newResultStatus)) {
      return c.json({ error: 'ผลการทวนสอบต้องเป็น PASS, FAIL หรือ INCONCLUSIVE' }, 400);
    }
    if (proposed.result_status && newResultStatus === 'INCONCLUSIVE') {
      return c.json({ error: AMEND_TO_INCONCLUSIVE_ERROR }, 400);
    }

    // If changing to FAIL or if existing was FAIL, requires L5+ (approver level)
    if ((existing.result_status === 'FAIL' || newResultStatus === 'FAIL') && userLevel < thresholds.required_approver_level) {
      return c.json({ error: `การแก้ไขผลการสอบเทียบที่เกี่ยวข้องกับสถานะไม่ผ่านเกณฑ์ (FAIL) ต้องได้รับการอนุมัติโดยผู้มีอำนาจระดับ L${thresholds.required_approver_level} ขึ้นไป` }, 403);
    }

    const reason = reqRow.amendment_reason;
    const performedAt = proposed.performed_at !== undefined ? proposed.performed_at : existing.performed_at;
    const certificateNo = proposed.certificate_no !== undefined ? proposed.certificate_no : existing.certificate_no;
    const acceptanceCriteria = proposed.acceptance_criteria !== undefined ? proposed.acceptance_criteria : existing.acceptance_criteria;
    const resultRemarks = proposed.result_remarks !== undefined ? proposed.result_remarks : existing.result_remarks;
    const calibrationProviderName = proposed.calibration_provider_name !== undefined ? proposed.calibration_provider_name : existing.calibration_provider_name;
    const calibrationMethod = proposed.calibration_method !== undefined ? proposed.calibration_method : existing.calibration_method;
    const traceabilityRef = proposed.traceability_ref !== undefined ? proposed.traceability_ref : existing.traceability_ref;
    const environmentalConditions = proposed.environmental_conditions !== undefined ? proposed.environmental_conditions : existing.environmental_conditions;
    const uncertaintyValue = proposed.uncertainty_value !== undefined ? proposed.uncertainty_value : existing.uncertainty_value;
    const calibrationErrorValue = proposed.calibration_error_value !== undefined ? proposed.calibration_error_value : existing.calibration_error_value;
    const certificateIssueDate = proposed.certificate_issue_date !== undefined ? proposed.certificate_issue_date : existing.certificate_issue_date;
    const certificateValidUntil = proposed.certificate_valid_until !== undefined ? proposed.certificate_valid_until : existing.certificate_valid_until;
    const verificationType = proposed.verification_type !== undefined ? proposed.verification_type : (existing.verification_type || 'QUANTITATIVE');
    const actualResult = proposed.actual_result !== undefined ? proposed.actual_result : (existing.actual_result || null);

    // Fetch next amendment sequence
    const seqRow = await db
      .prepare('SELECT COALESCE(MAX(amendment_seq), 0) AS max_seq FROM vcc_work_order_amendments WHERE work_order_id = ?')
      .bind(id)
      .first();
    const nextSeq = (seqRow?.max_seq || 0) + 1;
    const amendmentId = crypto.randomUUID();

    // Snapshot of existing state before changes
    const snapshotJson = JSON.stringify(existing);

    // FAIL -> PASS Amendment must NEVER auto-release NC or remove ON_HOLD.
    // The NC remains OPEN and asset remains ON_HOLD until explicit impact assessment and hold release via /release-hold.
    const nextNcStatus = newResultStatus === 'FAIL' ? 'OPEN' : existing.nc_status;

    const reviewComment = body.comment || body.review_comment || null;

    const batchStmts = [
      db.prepare(`
        INSERT INTO vcc_work_order_amendments (
          id, work_order_id, amendment_seq, snapshot_data, amendment_reason, amended_by, amended_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ${NOW}, ${NOW})
      `).bind(amendmentId, id, nextSeq, snapshotJson, reason, user.id),
      db.prepare(`
        UPDATE vcc_work_order_amendment_requests
        SET status = 'APPROVED',
            reviewed_by = ?,
            reviewed_at = ${NOW},
            review_comment = ?,
            updated_at = ${NOW}
        WHERE id = ? AND status = 'PENDING'
      `).bind(user.id, reviewComment, reqRow.id),
      assertRowUpdated(db),
      db.prepare(`
        UPDATE vcc_work_orders
        SET result_status = ?,
            performed_at = ?,
            certificate_no = ?,
            acceptance_criteria = ?,
            result_remarks = ?,
            calibration_provider_name = ?,
            calibration_method = ?,
            traceability_ref = ?,
            environmental_conditions = ?,
            uncertainty_value = ?,
            calibration_error_value = ?,
            certificate_issue_date = ?,
            certificate_valid_until = ?,
            verification_type = ?,
            actual_result = ?,
            nc_status = ?,
            is_amended = 1,
            amended_at = ${NOW},
            amended_by = ?,
            amendment_reason = ?,
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ? AND status = 'CLOSED'
      `).bind(
        newResultStatus,
        performedAt,
        certificateNo,
        acceptanceCriteria,
        resultRemarks,
        calibrationProviderName,
        calibrationMethod,
        traceabilityRef,
        environmentalConditions,
        uncertaintyValue,
        calibrationErrorValue,
        certificateIssueDate,
        certificateValidUntil,
        verificationType,
        actualResult,
        nextNcStatus,
        user.id,
        reason,
        user.id,
        id
      ),
      assertRowUpdated(db),
      audit(db, user.id, 'VCC_WO_RESULT_AMENDED', {
        wo_id: id,
        wo_code: existing.wo_code,
        asset_id: existing.asset_id,
        request_id: reqRow.id,
        amendment_seq: nextSeq,
        reason,
        amended_by: user.id
      }),
      audit(db, user.id, 'VCC_WO_AMENDED', {
        wo_id: id,
        wo_code: existing.wo_code,
        asset_id: existing.asset_id,
        request_id: reqRow.id,
        amendment_seq: nextSeq,
        reason,
        approved_by: user.id,
        approved_by_name: user.name,
        approver_level: userLevel,
        original_performer: existing.performed_by,
        requested_by: dbRequesterId,
        before: {
          result_status: existing.result_status,
          certificate_no: existing.certificate_no,
          nc_status: existing.nc_status
        },
        after: {
          result_status: newResultStatus,
          certificate_no: certificateNo,
          nc_status: nextNcStatus
        }
      }),
      audit(db, user.id, 'VCC_WO_AMENDMENT_APPROVED', {
        wo_id: id,
        wo_code: existing.wo_code,
        request_id: reqRow.id,
        amendment_seq: nextSeq,
        approved_by: user.id,
        approved_by_name: user.name,
        approver_level: userLevel,
        original_performer: existing.performed_by,
        requested_by: dbRequesterId
      })
    ];

    if (newResultStatus === 'FAIL') {
      batchStmts.push(
        db.prepare(`
          UPDATE vcc_assets
          SET status = 'ON_HOLD',
              hold_started_at = COALESCE(hold_started_at, ${NOW}),
              updated_at = ${NOW}
          WHERE id = ?
        `).bind(existing.asset_id)
      );
    }
    // NOTE: When amending FAIL -> PASS, vcc_assets status MUST NOT be automatically reverted to ACTIVE.
    // It remains ON_HOLD until explicit impact assessment and hold release is approved via POST /api/vcc/work-orders/:id/release-hold.

    const conflict = await runTransition(c, db, batchStmts);
    if (conflict) return conflict;

    return c.json({ workOrder: await fetchWorkOrder(db, id), amendment_seq: nextSeq, request_id: reqRow.id });
  };

  // Reject Amendment Request
  const handleRejectAmendment = async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const paramRequestId = c.req.param('requestId');
    const body = await c.req.json().catch(() => ({}));
    const targetRequestId = paramRequestId || body.request_id || body.requestId || null;

    const existing = await fetchWorkOrder(db, id);
    if (!existing) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);
    if (existing.status !== 'CLOSED') {
      return c.json({ error: 'การแก้ไข (Amendment) ทำได้เฉพาะใบสั่งงานที่ปิดงาน (CLOSED) สำเร็จแล้วเท่านั้น' }, 409);
    }
    if (!isUserAuthorizedForPlanDept(user, existing.department)) {
      return c.json({ error: 'ไม่มีสิทธิ์เข้าถึงใบสั่งงานของแผนกนี้' }, 403);
    }

    let reqRow;
    if (targetRequestId) {
      reqRow = await db
        .prepare('SELECT * FROM vcc_work_order_amendment_requests WHERE id = ? AND work_order_id = ?')
        .bind(targetRequestId, id)
        .first();
    } else {
      reqRow = await db
        .prepare("SELECT * FROM vcc_work_order_amendment_requests WHERE work_order_id = ? AND status = 'PENDING' ORDER BY created_at DESC")
        .bind(id)
        .first();
    }

    if (!reqRow) {
      return c.json({ error: 'ไม่พบคำขอแก้ไข (Amendment Request) ที่รอการอนุมัติ' }, 404);
    }
    if (reqRow.status !== 'PENDING') {
      return c.json({ error: `คำขอแก้ไขนี้ได้รับการดำเนินการไปแล้ว (สถานะ: ${reqRow.status})` }, 409);
    }

    // Segregation of Duties
    if (user.id === existing.performed_by || user.username === existing.performed_by) {
      return c.json({ error: 'การคัดแยกหน้าที่ (Segregation of Duties): ผู้บันทึกผลการสอบเทียบไม่สามารถดำเนินการคำขอแก้ไข (Amendment) ของตนเองได้' }, 403);
    }
    if (user.id === reqRow.requested_by || user.username === reqRow.requested_by) {
      return c.json({ error: 'การคัดแยกหน้าที่ (Segregation of Duties): ผู้ร้องขอแก้ไขผลไม่สามารถดำเนินการคำขอแก้ไข (Amendment) ของตนเองได้' }, 403);
    }

    const settings = await readWorkOrderSettings(db);
    const thresholds = await getThresholds(db, settings.approval_doc_type);
    const userLevel = Number(user.approval_level ?? 0);
    const requiredLevel = Math.max(4, thresholds.required_reviewer_level || 4);
    if (userLevel < requiredLevel) {
      return c.json({ error: `ผู้มีอำนาจปฏิเสธคำขอแก้ไขต้องมีระดับอนุมัติ L${requiredLevel} ขึ้นไป` }, 403);
    }

    const reviewComment = body.comment || body.review_comment || body.reason || null;

    const conflict = await runTransition(c, db, [
      db.prepare(`
        UPDATE vcc_work_order_amendment_requests
        SET status = 'REJECTED',
            reviewed_by = ?,
            reviewed_at = ${NOW},
            review_comment = ?,
            updated_at = ${NOW}
        WHERE id = ? AND status = 'PENDING'
      `).bind(user.id, reviewComment, reqRow.id),
      assertRowUpdated(db),
      audit(db, user.id, 'VCC_WO_AMENDMENT_REJECTED', {
        wo_id: id,
        wo_code: existing.wo_code,
        request_id: reqRow.id,
        rejected_by: user.id,
        rejected_by_name: user.name,
        requested_by: reqRow.requested_by,
        review_comment: reviewComment
      })
    ]);
    if (conflict) return conflict;

    return c.json({ message: 'ปฏิเสธคำขอแก้ไขเรียบร้อยแล้ว', request_id: reqRow.id, status: 'REJECTED' });
  };

  // Route: Submit Amendment Request
  app.post('/api/vcc/work-orders/:id/amendment-requests', requireAuth, requireVccAccess, handleRequestAmendment);
  app.post('/api/vcc/work-orders/:id/amend-request', requireAuth, requireVccAccess, handleRequestAmendment);

  // Route: Approve Amendment Request
  app.post('/api/vcc/work-orders/:id/amendment-requests/:requestId/approve', requireAuth, requireVccAccess, handleApproveAmendment);
  app.post('/api/vcc/work-orders/:id/approve-amendment', requireAuth, requireVccAccess, handleApproveAmendment);

  // Route: Reject Amendment Request
  app.post('/api/vcc/work-orders/:id/amendment-requests/:requestId/reject', requireAuth, requireVccAccess, handleRejectAmendment);
  app.post('/api/vcc/work-orders/:id/reject-amendment', requireAuth, requireVccAccess, handleRejectAmendment);

  // Legacy / Direct route: Dispatches to approve/reject if action is requested, otherwise submits amendment request
  app.post('/api/vcc/work-orders/:id/amend', requireAuth, requireVccAccess, async (c) => {
    const rawBody = await c.req.raw.clone().json().catch(() => ({}));
    const action = String(rawBody.action || c.req.query('action') || '').toLowerCase();
    if (action === 'approve' || rawBody.request_id || rawBody.requestId) {
      return handleApproveAmendment(c);
    }
    if (action === 'reject') {
      return handleRejectAmendment(c);
    }
    if (action === 'direct' || rawBody.direct === true) {
      const db = c.env.DB;
      const user = c.get('user');
      const id = c.req.param('id');
      const existing = await fetchWorkOrder(db, id);
      if (!existing) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);
      if (existing.status !== 'CLOSED') {
        return c.json({ error: 'การแก้ไขทำได้เฉพาะใบสั่งงานที่ปิดงาน (CLOSED) แล้วเท่านั้น' }, 409);
      }
      if (!isUserAuthorizedForPlanDept(user, existing.department)) {
        return c.json({ error: 'ไม่มีสิทธิ์แก้ไขผลของแผนกนี้' }, 403);
      }
      const reason = String(rawBody.amendment_reason || rawBody.reason || '').trim();
      if (!reason) {
        return c.json({ error: 'กรุณาระบุเหตุผลในการแก้ไขผลการสอบเทียบ' }, 400);
      }
      const newResultStatus = rawBody.result_status ? String(rawBody.result_status).trim().toUpperCase() : existing.result_status;
      const certificateNo = rawBody.certificate_no !== undefined ? String(rawBody.certificate_no).trim() : existing.certificate_no;
      const acceptanceCriteria = rawBody.acceptance_criteria !== undefined ? String(rawBody.acceptance_criteria).trim() : existing.acceptance_criteria;
      const actualResult = rawBody.actual_result !== undefined ? (String(rawBody.actual_result || '').trim() || null) : existing.actual_result;
      const resultRemarks = rawBody.result_remarks !== undefined ? (String(rawBody.result_remarks || '').trim() || null) : existing.result_remarks;
      const providerName = rawBody.calibration_provider_name !== undefined ? (String(rawBody.calibration_provider_name || '').trim() || null) : existing.calibration_provider_name;
      const method = rawBody.calibration_method !== undefined ? (String(rawBody.calibration_method || '').trim() || null) : existing.calibration_method;
      const traceability = rawBody.traceability_ref !== undefined ? (String(rawBody.traceability_ref || '').trim() || null) : existing.traceability_ref;
      const env = rawBody.environmental_conditions !== undefined ? (String(rawBody.environmental_conditions || '').trim() || null) : existing.environmental_conditions;
      const uncertainty = rawBody.uncertainty_value !== undefined ? (String(rawBody.uncertainty_value || '').trim() || null) : existing.uncertainty_value;
      const calError = rawBody.calibration_error_value !== undefined ? (String(rawBody.calibration_error_value || '').trim() || null) : existing.calibration_error_value;
      const issueDate = rawBody.certificate_issue_date !== undefined ? (String(rawBody.certificate_issue_date || '').trim() || null) : existing.certificate_issue_date;
      const validUntil = rawBody.certificate_valid_until !== undefined ? (String(rawBody.certificate_valid_until || '').trim() || null) : existing.certificate_valid_until;
      const nextNcStatus = newResultStatus === 'FAIL' ? 'OPEN' : existing.nc_status;

      const batch = [
        db.prepare(`
          UPDATE vcc_work_orders
          SET result_status = ?,
              certificate_no = ?,
              acceptance_criteria = ?,
              actual_result = ?,
              result_remarks = ?,
              calibration_provider_name = ?,
              calibration_method = ?,
              traceability_ref = ?,
              environmental_conditions = ?,
              uncertainty_value = ?,
              calibration_error_value = ?,
              certificate_issue_date = ?,
              certificate_valid_until = ?,
              nc_status = ?,
              is_amended = 1,
              amended_at = ${NOW},
              amended_by = ?,
              amendment_reason = ?,
              updated_at = ${NOW},
              updated_by = ?
          WHERE id = ? AND status = 'CLOSED'
        `).bind(
          newResultStatus,
          certificateNo,
          acceptanceCriteria,
          actualResult,
          resultRemarks,
          providerName,
          method,
          traceability,
          env,
          uncertainty,
          calError,
          issueDate,
          validUntil,
          nextNcStatus,
          user.id,
          reason,
          user.id,
          id
        ),
        assertRowUpdated(db),
        audit(db, user.id, 'VCC_WO_RESULT_AMENDED', {
          wo_id: id,
          wo_code: existing.wo_code,
          asset_id: existing.asset_id,
          reason,
          amended_by: user.id,
          before: {
            result_status: existing.result_status,
            certificate_no: existing.certificate_no,
            nc_status: existing.nc_status
          },
          after: {
            result_status: newResultStatus,
            certificate_no: certificateNo,
            nc_status: nextNcStatus
          }
        }),
        audit(db, user.id, 'VCC_WO_AMENDED', {
          wo_id: id,
          wo_code: existing.wo_code,
          reason,
          amended_by: user.id
        })
      ];

      if (newResultStatus === 'FAIL') {
        batch.push(
          db.prepare(`
            UPDATE vcc_assets
            SET status = 'ON_HOLD',
                hold_started_at = COALESCE(hold_started_at, ${NOW}),
                updated_at = ${NOW},
                updated_by = ?
            WHERE id = ?
          `).bind(user.id, existing.asset_id),
          ...ncHoldNoticeStatements(db, existing)
        );
      } else if (newResultStatus === 'PASS' && existing.result_status === 'FAIL') {
        batch.push(
          db.prepare(`
            UPDATE vcc_assets
            SET status = 'ACTIVE',
                updated_at = ${NOW},
                updated_by = ?
            WHERE id = ?
          `).bind(user.id, existing.asset_id)
        );
      }

      const conflict = await runTransition(c, db, batch);
      if (conflict) return conflict;
      return c.json({ workOrder: await fetchWorkOrder(db, id) });
    }
    return handleRequestAmendment(c);
  });
};

