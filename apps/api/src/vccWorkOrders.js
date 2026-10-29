import { getThresholds } from './approval.js';
import { computeDueDateForMonth } from './vccPlans.js';
import { requireVccAccess, requireDccOnly } from './vccAuth.js';

const NOW = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')";
const DCC_ONLY = { error: 'เฉพาะเจ้าหน้าที่ DCC เท่านั้นที่เข้าถึงระบบ VCC ได้' };

const WORK_ORDER_SETTINGS_KEY = 'vcc_work_order_settings';

export const DEFAULT_WORK_ORDER_SETTINGS = {
  retention_years: 3,
  approval_doc_type: 'FM',
  default_acceptance_criteria: [
    '± 0.5 °C ตามเกณฑ์โรงงาน',
    '± 1.0 g ตามพิกัดเครื่องชั่ง',
    'ผ่านเกณฑ์มาตรฐานห้องปฏิบัติการ ISO/IEC 17025',
    '± 0.02 mm ตามเกณฑ์เวอร์เนียร์คาลิปเปอร์'
  ]
};

const VALID_WO_STATUSES = new Set(['OPEN', 'PENDING_REVIEW', 'REJECTED', 'CLOSED', 'CANCELLED']);
const VALID_RESULT_STATUSES = new Set(['PASS', 'FAIL', 'INCONCLUSIVE']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const readWorkOrderSettings = async (db) => {
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

const fetchWorkOrder = async (db, id) =>
  db.prepare(`
    SELECT w.*,
      a.asset_code,
      a.name AS asset_name,
      a.asset_type,
      a.department,
      a.location,
      a.is_group,
      a.parent_id,
      p.asset_code AS parent_asset_code,
      d.name_th AS department_name_th,
      pl.plan_year,
      pl.document_code AS plan_document_code,
      pl.revision AS plan_revision,
      u_perf.name AS performed_by_name,
      u_rev.name AS reviewed_by_name,
      u_rel.name AS hold_released_by_name
    FROM vcc_work_orders w
    JOIN vcc_assets a ON a.id = w.asset_id
    LEFT JOIN vcc_assets p ON p.id = a.parent_id
    LEFT JOIN departments d ON d.code = a.department
    LEFT JOIN vcc_annual_plans pl ON pl.id = w.plan_id
    LEFT JOIN users u_perf ON u_perf.id = w.performed_by
    LEFT JOIN users u_rev ON u_rev.id = w.reviewed_by
    LEFT JOIN users u_rel ON u_rel.id = w.hold_released_by
    WHERE w.id = ?
  `).bind(id).first();

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
      where.push('w.status = ?');
      params.push(targetStatus);
    }

    if (department) {
      where.push('a.department = ?');
      params.push(department);
    }
    if (planId) {
      where.push('w.plan_id = ?');
      params.push(planId);
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
        p.asset_code AS parent_asset_code,
        d.name_th AS department_name_th,
        pl.plan_year,
        u_perf.name AS performed_by_name,
        u_rev.name AS reviewed_by_name,
        u_rel.name AS hold_released_by_name
      FROM vcc_work_orders w
      JOIN vcc_assets a ON a.id = w.asset_id
      LEFT JOIN vcc_assets p ON p.id = a.parent_id
      LEFT JOIN departments d ON d.code = a.department
      LEFT JOIN vcc_annual_plans pl ON pl.id = w.plan_id
      LEFT JOIN users u_perf ON u_perf.id = w.performed_by
      LEFT JOIN users u_rev ON u_rev.id = w.reviewed_by
      LEFT JOIN users u_rel ON u_rel.id = w.hold_released_by
      WHERE ${where.join(' AND ')}
      ORDER BY w.due_date ASC, w.wo_code ASC
    `).bind(...params).all();

    return c.json({ workOrders: results });
  });

  app.get('/api/vcc/work-orders/:id', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id');
    const workOrder = await fetchWorkOrder(db, id);
    if (!workOrder) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);

    const settings = await readWorkOrderSettings(db);
    const thresholds = await getThresholds(db, settings.approval_doc_type);

    const { results: auditRows } = await db.prepare(`
      SELECT l.id, l.at, l.actor_id, u.name AS actor_name, l.action, l.details
      FROM audit_log l
      LEFT JOIN users u ON u.id = l.actor_id
      WHERE l.action GLOB 'VCC_WO_*'
        AND json_extract(l.details, '$.wo_id') = ?
      ORDER BY l.id DESC
    `).bind(id).all();

    const history = auditRows.map((row) => ({
      ...row,
      details: (() => {
        try { return JSON.parse(row.details || '{}'); } catch { return {}; }
      })()
    }));

    return c.json({ workOrder, thresholds, history });
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

      const planItem = await db.prepare(`
        SELECT i.*, a.is_group, a.asset_code, a.status AS asset_status
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

      if (Number(planItem.is_group) === 1) {
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
        targetAssetId = child.id;
      } else {
        targetAssetId = planItem.asset_id;
      }

      providerName = providerName || planItem.provider_name;
      dueDate = dueDate || computeDueDateForMonth(plan.plan_year, plannedMonth, plan.due_date_rule);

      const duplicate = await db.prepare(`
        SELECT id, wo_code FROM vcc_work_orders
        WHERE plan_item_id = ? AND asset_id = ? AND planned_month = ? AND status != 'CANCELLED'
      `).bind(planItemId, targetAssetId, plannedMonth).first();
      if (duplicate) {
        return c.json({ error: `มีใบสั่งงาน (${duplicate.wo_code}) สำหรับเครื่องมือและรอบเดือนนี้อยู่แล้ว` }, 409);
      }
    }

    if (!targetAssetId) return c.json({ error: 'กรุณาเลือกเครื่องมือรายตัวสำหรับสร้างใบสั่งงาน' }, 400);
    const asset = await db.prepare('SELECT * FROM vcc_assets WHERE id = ?').bind(targetAssetId).first();
    if (!asset) return c.json({ error: 'ไม่พบเครื่องมือในทะเบียน' }, 404);
    if (Number(asset.is_group) === 1) {
      return c.json({ error: 'เครื่องมือแบบกลุ่มต้องแยกรหัสเครื่องมือรายตัวก่อนสร้างใบสั่งงาน' }, 400);
    }
    if (asset.status !== 'ACTIVE') {
      return c.json({ error: 'ไม่สามารถเปิดใบสั่งงานให้เครื่องมือที่ปลดออกแล้ว (RETIRED)' }, 409);
    }

    const openHold = await db.prepare(`
      SELECT wo_code FROM vcc_work_orders WHERE asset_id = ? AND nc_status = 'OPEN'
    `).bind(targetAssetId).first();
    if (openHold) {
      return c.json({ error: `เครื่องมือ ${asset.asset_code} อยู่ระหว่างระงับใช้งาน (ON_HOLD จากใบงาน ${openHold.wo_code}) ต้องปลดระงับก่อนเปิดใบงานใหม่` }, 409);
    }

    if (!providerName) return c.json({ error: 'กรุณาระบุสถาบัน/หน่วยงานที่ทวนสอบ' }, 400);
    if (!DATE_RE.test(dueDate)) return c.json({ error: 'กรุณาระบุวันครบกำหนดในรูปแบบ YYYY-MM-DD' }, 400);

    const countRow = await db.prepare('SELECT COUNT(*) AS cnt FROM vcc_work_orders').first();
    const seq = String((Number(countRow?.cnt || 0) + 1)).padStart(3, '0');
    const yearPrefix = dueDate.slice(0, 4);
    const woCode = String(body.wo_code || `WO-${yearPrefix}-${seq}`).trim().toUpperCase();

    const id = crypto.randomUUID();
    const auditDetails = {
      wo_id: id,
      wo_code: woCode,
      plan_id: planId,
      plan_item_id: planItemId,
      planned_month: plannedMonth,
      asset_id: targetAssetId,
      asset_code: asset.asset_code,
      due_date: dueDate,
      original_due_date: dueDate,
      status: 'OPEN'
    };

    await db.batch([
      db.prepare(`
        INSERT INTO vcc_work_orders (
          id, wo_code, plan_id, plan_item_id, planned_month, asset_id, provider_name,
          due_date, original_due_date, status, result_status, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', 'PENDING', ?, ?)
      `).bind(id, woCode, planId, planItemId, plannedMonth, targetAssetId, providerName, dueDate, dueDate, user.id, user.id),
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

    const newDueDate = String(body.new_due_date || '').trim();
    const reason = String(body.reason || '').trim();
    if (!DATE_RE.test(newDueDate)) return c.json({ error: 'กรุณาระบุวันครบกำหนดใหม่ในรูปแบบ YYYY-MM-DD' }, 400);
    if (!reason) return c.json({ error: 'กรุณาระบุเหตุผลในการขอเลื่อนวันครบกำหนด' }, 400);

    await db.batch([
      db.prepare(`
        UPDATE vcc_work_orders
        SET due_date = ?, reschedule_reason = ?, updated_at = ${NOW}, updated_by = ?
        WHERE id = ?
      `).bind(newDueDate, reason, user.id, id),
      audit(db, user.id, 'VCC_WO_RESCHEDULED', {
        wo_id: id,
        wo_code: existing.wo_code,
        asset_id: existing.asset_id,
        original_due_date: existing.original_due_date,
        before: { due_date: existing.due_date },
        after: { due_date: newDueDate },
        reason
      })
    ]);

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
    if (existing.status !== 'OPEN' && existing.status !== 'REJECTED') {
      return c.json({ error: 'บันทึกผลได้เฉพาะใบสั่งงานที่อยู่ในสถานะเปิดงาน (OPEN) หรือส่งกลับแก้ไข (REJECTED) เท่านั้น' }, 409);
    }

    const performedAt = String(body.performed_at || '').trim();
    const resultStatus = String(body.result_status || '').trim().toUpperCase();
    const certificateNo = String(body.certificate_no || '').trim();
    const acceptanceCriteria = String(body.acceptance_criteria || '').trim();
    const resultRemarks = String(body.result_remarks || '').trim();

    if (!DATE_RE.test(performedAt)) return c.json({ error: 'กรุณาระบุวันที่ทวนสอบจริง (YYYY-MM-DD)' }, 400);
    if (!VALID_RESULT_STATUSES.has(resultStatus)) {
      return c.json({ error: 'ผลการทวนสอบต้องเป็น PASS, FAIL หรือ INCONCLUSIVE' }, 400);
    }
    if (!certificateNo) {
      return c.json({ error: 'กรุณาระบุเลขที่ใบรับรอง (Certificate No.) หรืออ้างอิงหลักฐานการทวนสอบก่อนส่งตรวจรับ' }, 400);
    }
    if (!acceptanceCriteria) {
      return c.json({ error: 'กรุณาระบุเกณฑ์ยอมรับ (Acceptance Criteria) ที่ใช้ตรวจเทียบก่อนส่งตรวจรับ' }, 400);
    }

    // If result is FAIL, immediately trigger ON_HOLD / NC control
    const nextNcStatus = resultStatus === 'FAIL' ? 'OPEN' : existing.nc_status;

    await db.batch([
      db.prepare(`
        UPDATE vcc_work_orders
        SET status = 'PENDING_REVIEW',
            result_status = ?,
            performed_at = ?,
            certificate_no = ?,
            acceptance_criteria = ?,
            result_remarks = ?,
            performed_by = ?,
            nc_status = ?,
            rejected_reason = NULL,
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ?
      `).bind(
        resultStatus,
        performedAt,
        certificateNo,
        acceptanceCriteria,
        resultRemarks,
        user.id,
        nextNcStatus,
        user.id,
        id
      ),
      audit(db, user.id, 'VCC_WO_RESULT_SUBMITTED', {
        wo_id: id,
        wo_code: existing.wo_code,
        asset_id: existing.asset_id,
        asset_code: existing.asset_code,
        performed_at: performedAt,
        result_status: resultStatus,
        certificate_no: certificateNo,
        acceptance_criteria: acceptanceCriteria,
        nc_status: nextNcStatus,
        before: { status: existing.status },
        after: { status: 'PENDING_REVIEW' }
      })
    ]);

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
    if (existing.status !== 'PENDING_REVIEW') {
      return c.json({ error: 'อนุมัติปิดงานได้เฉพาะใบสั่งงานที่อยู่ในสถานะรอตรวจรับผล (PENDING_REVIEW) เท่านั้น' }, 409);
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

    await db.batch([
      db.prepare(`
        UPDATE vcc_work_orders
        SET status = 'CLOSED',
            reviewed_by = ?,
            reviewed_at = ${NOW},
            review_comment = ?,
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ?
      `).bind(user.id, comment, user.id, id),
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
      })
    ]);

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

    await db.batch([
      db.prepare(`
        UPDATE vcc_work_orders
        SET status = 'REJECTED',
            rejected_reason = ?,
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ?
      `).bind(reason, user.id, id),
      audit(db, user.id, 'VCC_WO_REJECTED', {
        wo_id: id,
        wo_code: existing.wo_code,
        asset_id: existing.asset_id,
        reason,
        before: { status: 'PENDING_REVIEW' },
        after: { status: 'REJECTED' }
      })
    ]);

    return c.json({ workOrder: await fetchWorkOrder(db, id) });
  });

  // Release ON_HOLD / NC -> requires L5+ (required_approver_level) and mandatory impact_assessment
  app.post('/api/vcc/work-orders/:id/release-hold', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const impactAssessment = String(body.impact_assessment || '').trim();

    if (!impactAssessment) {
      return c.json({ error: 'กรุณาระบุผลการประเมินผลกระทบและการแก้ไข (NC Impact Assessment) ก่อนปลดระงับเครื่องมือ' }, 400);
    }

    const existing = await fetchWorkOrder(db, id);
    if (!existing) return c.json({ error: 'ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ' }, 404);
    if (existing.nc_status !== 'OPEN') {
      return c.json({ error: 'รายการนี้ไม่ได้อยู่ในสถานะระงับใช้งาน (ON_HOLD)' }, 409);
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

    await db.batch([
      db.prepare(`
        UPDATE vcc_work_orders
        SET nc_status = 'RELEASED',
            nc_impact_assessment = ?,
            hold_released_by = ?,
            hold_released_at = ${NOW},
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ?
      `).bind(impactAssessment, user.id, user.id, id),
      audit(db, user.id, 'VCC_WO_HOLD_RELEASED', {
        wo_id: id,
        wo_code: existing.wo_code,
        asset_id: existing.asset_id,
        asset_code: existing.asset_code,
        impact_assessment: impactAssessment,
        before: { nc_status: 'OPEN' },
        after: { nc_status: 'RELEASED' }
      })
    ]);

    return c.json({ workOrder: await fetchWorkOrder(db, id) });
  });
};

