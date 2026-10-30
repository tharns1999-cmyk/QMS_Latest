// VCC (Verify and Calibration Center) — Phase 2: Calibration Schedule Rules, Annual Plan Matrix & Plan Approval API.
import { getThresholds } from './approval.js';
import { requireVccAccess, requireDccOnly } from './vccAuth.js';

const DCC_ONLY = { error: 'เฉพาะ DCC เท่านั้นที่ใช้งานส่วนนี้ได้' };
const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
export const PLAN_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'];
export const DUE_DATE_RULES = ['END_OF_MONTH', 'START_OF_MONTH'];

const DEFAULT_PROVIDERS = ['ห้องปฏิบัติการภายนอก', 'ทวนสอบภายใน', 'บ.ยูโรแพค จำกัด'];
const DEFAULT_PLAN_SETTINGS = {
  default_doc_code: 'FM-QC-46',
  approval_doc_type: 'FM',
  due_date_rule: 'END_OF_MONTH'
};

const clean = (v, max) => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null);
const cleanOpt = (v, max) => {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length <= max ? trimmed : null;
};
const isUnique = (err) => /UNIQUE/.test(String(err?.message));

export const computeDueDateForMonth = (year, month, rule = 'END_OF_MONTH') => {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;
  const mm = String(m).padStart(2, '0');
  if (rule === 'START_OF_MONTH') {
    return `${y}-${mm}-01`;
  }
  // Last day of month in UTC/Gregorian calendar (handles leap years accurately)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${mm}-${String(lastDay).padStart(2, '0')}`;
};

export const computeDueDates = (year, plannedMonths, rule = 'END_OF_MONTH') =>
  (plannedMonths || [])
    .map((m) => computeDueDateForMonth(year, m, rule))
    .filter(Boolean);

const parsePlannedMonths = (raw) => {
  if (!Array.isArray(raw)) return null;
  const nums = raw.map((m) => Number(m));
  if (nums.some((m) => !Number.isInteger(m) || m < 1 || m > 12)) return null;
  return [...new Set(nums)].sort((a, b) => a - b);
};

const loadProviders = async (db) => {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'vcc_calibration_providers'").first();
  if (!row) return DEFAULT_PROVIDERS;
  try {
    return JSON.parse(row.value);
  } catch {
    return DEFAULT_PROVIDERS;
  }
};

const loadPlanSettings = async (db) => {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'vcc_plan_settings'").first();
  if (!row) return { ...DEFAULT_PLAN_SETTINGS };
  try {
    return { ...DEFAULT_PLAN_SETTINGS, ...JSON.parse(row.value) };
  } catch {
    return { ...DEFAULT_PLAN_SETTINGS };
  }
};

export const getUserDepartments = (user) => {
  if (!user) return [];
  const depts = [];
  if (user.department) depts.push(user.department);
  if (user.primary_department) depts.push(user.primary_department);
  if (user.dept) depts.push(user.dept);
  if (user.dept_code) depts.push(user.dept_code);
  if (Array.isArray(user.departments)) depts.push(...user.departments);
  if (Array.isArray(user.secondaryDepartments)) depts.push(...user.secondaryDepartments);
  if (Array.isArray(user.depts)) depts.push(...user.depts);
  if (Array.isArray(user.affiliated_departments)) depts.push(...user.affiliated_departments);
  return [...new Set(depts.filter(Boolean).map((d) => String(d).toUpperCase()))];
};

export const isUserAuthorizedForPlanDept = (user, planDepartment) => {
  if (!user) return false;
  if (user.isDcc || user.isQmr || (user.approval_level && user.approval_level >= 6)) return true;
  const depts = getUserDepartments(user);
  return depts.includes(String(planDepartment || '').toUpperCase());
};

const PLAN_SELECT = `
  SELECT p.*,
    d.name_th AS department_name_th,
    u_prep.name AS prepared_by_name,
    u_prep.position AS prepared_by_position,
    u_rev.name AS reviewed_by_name,
    u_rev.position AS reviewed_by_position,
    u_app.name AS approved_by_name,
    u_app.position AS approved_by_position,
    u_rej.name AS rejected_by_name,
    (SELECT COUNT(*) FROM vcc_annual_plan_items i WHERE i.plan_id = p.id) AS item_count,
    (SELECT COUNT(*) FROM vcc_annual_plan_items i JOIN vcc_assets a ON a.id = i.asset_id WHERE i.plan_id = p.id AND a.is_group = 1) AS group_item_count
  FROM vcc_annual_plans p
  LEFT JOIN departments d ON d.code = p.department
  LEFT JOIN users u_prep ON u_prep.id = p.prepared_by
  LEFT JOIN users u_rev ON u_rev.id = p.reviewed_by
  LEFT JOIN users u_app ON u_app.id = p.approved_by
  LEFT JOIN users u_rej ON u_rej.id = p.rejected_by
`;

const fetchPlan = (db, id) =>
  db.prepare(`${PLAN_SELECT} WHERE p.id = ?`).bind(id).first();

const enrichPlanItem = (row, closedWoRows = []) => {
  const plannedMonths = (() => {
    try {
      return JSON.parse(row.planned_months || '[]');
    } catch {
      return [];
    }
  })();
  const dueDates = (() => {
    try {
      return JSON.parse(row.due_dates || '[]');
    } catch {
      return [];
    }
  })();
  const isGroup = Number(row.is_group) === 1;
  const groupNature = row.group_nature || 'LOGICAL_GROUP';
  const isLogicalGroup = isGroup && groupNature !== 'COMPOSITE_SET';
  const isCompositeSet = groupNature === 'COMPOSITE_SET';
  const isCalibratableUnit = !isLogicalGroup;

  const itemWos = closedWoRows.filter((w) => w.plan_item_id === row.id);
  const actualMonths = [...new Set(itemWos.map((w) => Number(w.planned_month)).filter((m) => m >= 1 && m <= 12))].sort((a, b) => a - b);
  const hasEvidence = itemWos.length > 0 && itemWos.every((w) => Boolean(w.certificate_no));
  return {
    ...row,
    is_group: isGroup ? 1 : 0,
    group_nature: groupNature,
    is_logical_group: isLogicalGroup,
    is_composite_set: isCompositeSet,
    is_calibratable_unit: isCalibratableUnit,
    planned_months: plannedMonths,
    due_dates: dueDates,
    // Highlighted months in the plan are NEVER proof of completion; actual execution requires a CLOSED work order + certificate.
    actual_months: actualMonths,
    has_evidence: hasEvidence,
    completion_status: actualMonths.length > 0 ? 'COMPLETED' : 'PLANNED_ONLY',
    // Logical group rows in the plan must be broken down into individual child assets before generating work orders.
    requires_child_selection: isLogicalGroup,
    work_order_ready: isCalibratableUnit && row.asset_status === 'ACTIVE',
    work_order_block_reason: isLogicalGroup
      ? 'เครื่องมือแบบกลุ่มจัดหมวดหมู่ต้องแยกรหัสเครื่องมือรายตัวก่อนสร้างใบสั่งงาน'
      : row.asset_status !== 'ACTIVE'
        ? 'เครื่องมือไม่ได้อยู่ในสถานะใช้งานปกติ (ACTIVE)'
        : null
  };
};

const fetchPlanItems = async (db, planId, planObj = null) => {
  const plan = planObj || await db.prepare('SELECT id, status, department, plan_year, due_date_rule FROM vcc_annual_plans WHERE id = ?').bind(planId).first();

  const { results } = await db.prepare(`
    SELECT i.*,
      a.asset_code,
      a.name AS asset_name,
      a.asset_type,
      a.serial_no,
      a.model,
      a.location,
      a.department AS asset_department,
      a.is_group,
      a.group_nature,
      a.parent_id,
      a.status AS asset_status,
      p.asset_code AS parent_asset_code,
      p.name AS parent_name,
      p.group_nature AS parent_group_nature,
      rd.name_th AS responsible_dept_name_th,
      (SELECT COUNT(*) FROM vcc_assets c WHERE c.parent_id = a.id AND c.status = 'ACTIVE') AS active_child_count
    FROM vcc_annual_plan_items i
    JOIN vcc_assets a ON a.id = i.asset_id
    LEFT JOIN vcc_assets p ON p.id = a.parent_id
    LEFT JOIN departments rd ON rd.code = i.responsible_dept
    WHERE i.plan_id = ?
    ORDER BY i.sort_order ASC, a.asset_code ASC
  `).bind(planId).all();

  const closedWoRes = await db
    .prepare("SELECT plan_item_id, planned_month, certificate_no FROM vcc_work_orders WHERE plan_id = ? AND status = 'CLOSED' AND result_status = 'PASS'")
    .bind(planId)
    .all()
    .catch(() => ({ results: [] }));
  const closedWoRows = closedWoRes.results || [];

  if (!plan || (plan.status !== 'DRAFT' && plan.status !== 'REJECTED')) {
    return results.map((row) => enrichPlanItem(row, closedWoRows));
  }

  // Registry-driven: combine persisted items with all eligible assets in plan.department
  const { results: eligibleAssets } = await db.prepare(`
    SELECT a.*,
      p.asset_code AS parent_asset_code,
      p.name AS parent_name,
      p.group_nature AS parent_group_nature,
      d.name_th AS department_name_th,
      (SELECT COUNT(*) FROM vcc_assets c WHERE c.parent_id = a.id AND c.status = 'ACTIVE') AS active_child_count
    FROM vcc_assets a
    LEFT JOIN vcc_assets p ON p.id = a.parent_id
    LEFT JOIN departments d ON d.code = a.department
    WHERE a.department = ? AND a.status IN ('ACTIVE', 'ON_HOLD', 'UNDER_REPAIR')
    ORDER BY a.asset_code ASC
  `).bind(plan.department).all();

  const persistedByAssetId = new Map(results.map((r) => [r.asset_id, r]));
  const combined = [];

  for (const item of results) {
    if (item.asset_status !== 'RETIRED') {
      combined.push(enrichPlanItem({ ...item, is_persisted: 1 }, closedWoRows));
    }
  }

  for (const asset of eligibleAssets) {
    if (!persistedByAssetId.has(asset.id)) {
      const virtualRow = {
        id: `virtual-${asset.id}`,
        plan_id: planId,
        asset_id: asset.id,
        provider_name: 'ทวนสอบภายใน',
        frequency_label: 'รายปี',
        planned_months: '[]',
        due_dates: '[]',
        responsible_dept: asset.department,
        responsible_label: '',
        remarks: '',
        sort_order: 9999,
        is_persisted: 0,
        asset_code: asset.asset_code,
        asset_name: asset.name,
        asset_type: asset.asset_type,
        serial_no: asset.serial_no || '',
        model: asset.model || '',
        location: asset.location || '',
        asset_department: asset.department,
        is_group: Number(asset.is_group) === 1 ? 1 : 0,
        group_nature: asset.group_nature || 'LOGICAL_GROUP',
        parent_id: asset.parent_id || null,
        asset_status: asset.status,
        parent_asset_code: asset.parent_asset_code || null,
        parent_name: asset.parent_name || null,
        parent_group_nature: asset.parent_group_nature || null,
        responsible_dept_name_th: asset.department_name_th || asset.department,
        active_child_count: asset.active_child_count || 0
      };
      combined.push(enrichPlanItem(virtualRow, closedWoRows));
    }
  }

  return combined.sort((a, b) => {
    const sA = (a.sort_order ?? 9999) < 9000 ? a.sort_order : 9000;
    const sB = (b.sort_order ?? 9999) < 9000 ? b.sort_order : 9000;
    if (sA !== sB) return sA - sB;
    return (a.asset_code || '').localeCompare(b.asset_code || '');
  });
};

export const registerVccPlanRoutes = (app, { requireAuth, audit }) => {
  // Settings: calibration providers & schedule/approval rules (configurable by DCC)
  app.get('/api/vcc/plan-settings', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const [providers, planSettings] = await Promise.all([
      loadProviders(db),
      loadPlanSettings(db)
    ]);
    const thresholds = await getThresholds(db, planSettings.approval_doc_type);
    return c.json({ providers, planSettings, thresholds });
  });

  app.put('/api/vcc/plan-settings', requireAuth, requireDccOnly, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));

    const beforeProviders = await loadProviders(db);
    const beforeSettings = await loadPlanSettings(db);

    let nextProviders = beforeProviders;
    if (body.providers !== undefined) {
      if (!Array.isArray(body.providers) || body.providers.length === 0 || body.providers.length > 100) {
        return c.json({ error: 'กรุณาระบุหน่วยงาน/วิธีทวนสอบอย่างน้อย 1 รายการ' }, 400);
      }
      const cleaned = body.providers.map((p) => clean(p, 150));
      if (cleaned.some((p) => !p) || new Set(cleaned).size !== cleaned.length) {
        return c.json({ error: 'ชื่อหน่วยงาน/วิธีทวนสอบต้องไม่ว่าง และห้ามซ้ำกัน' }, 400);
      }
      nextProviders = cleaned;
    }

    let nextSettings = { ...beforeSettings };
    if (body.planSettings !== undefined && typeof body.planSettings === 'object' && body.planSettings !== null) {
      const docCode = clean(body.planSettings.default_doc_code ?? nextSettings.default_doc_code, 50);
      const approvalDocType = clean(body.planSettings.approval_doc_type ?? nextSettings.approval_doc_type, 20)?.toUpperCase();
      const dueDateRule = String(body.planSettings.due_date_rule ?? nextSettings.due_date_rule).toUpperCase();
      if (!docCode) return c.json({ error: 'รหัสเอกสารเริ่มต้นไม่ถูกต้อง' }, 400);
      if (!approvalDocType) return c.json({ error: 'รหัสประเภทเอกสารใน Approval Matrix ไม่ถูกต้อง' }, 400);
      if (!DUE_DATE_RULES.includes(dueDateRule)) {
        return c.json({ error: 'กติกาคำนวณวันครบกำหนดไม่ถูกต้อง (ต้องเป็น END_OF_MONTH หรือ START_OF_MONTH)' }, 400);
      }
      const matrixRow = await db.prepare('SELECT doc_type FROM approval_matrix WHERE doc_type = ?').bind(approvalDocType).first();
      if (!matrixRow) {
        return c.json({ error: `ไม่พบรหัสประเภทเอกสาร ${approvalDocType} ในตาราง Approval Matrix` }, 400);
      }
      nextSettings = {
        default_doc_code: docCode,
        approval_doc_type: approvalDocType,
        due_date_rule: dueDateRule
      };
    }

    await db.batch([
      db.prepare(`INSERT INTO settings (key, value, updated_by) VALUES ('vcc_calibration_providers', ?, ?)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = ${NOW}, updated_by = excluded.updated_by`)
        .bind(JSON.stringify(nextProviders), user.id),
      db.prepare(`INSERT INTO settings (key, value, updated_by) VALUES ('vcc_plan_settings', ?, ?)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = ${NOW}, updated_by = excluded.updated_by`)
        .bind(JSON.stringify(nextSettings), user.id),
      audit(db, user.id, 'VCC_PLAN_SETTINGS_UPDATED', {
        before: { providers: beforeProviders, planSettings: beforeSettings },
        after: { providers: nextProviders, planSettings: nextSettings }
      })
    ]);

    const thresholds = await getThresholds(db, nextSettings.approval_doc_type);
    return c.json({ providers: nextProviders, planSettings: nextSettings, thresholds });
  });

  // Strictly separated by status (never mix statuses in one list).
  app.get('/api/vcc/plans', requireAuth, requireVccAccess, async (c) => {
    const status = (c.req.query('status') || 'DRAFT').toUpperCase();
    if (!PLAN_STATUSES.includes(status)) {
      return c.json({ error: 'สถานะแผนประจำปีไม่ถูกต้อง' }, 400);
    }
    const yearParam = c.req.query('year');
    const department = clean(c.req.query('department'), 20)?.toUpperCase();

    const clauses = ['p.status = ?'];
    const args = [status];

    if (yearParam !== undefined && yearParam !== '') {
      const yr = Number(yearParam);
      if (!Number.isInteger(yr) || yr < 2000 || yr > 2100) {
        return c.json({ error: 'ปีของแผนประจำปีไม่ถูกต้อง' }, 400);
      }
      clauses.push('p.plan_year = ?');
      args.push(yr);
    }
    if (department) {
      clauses.push('p.department = ?');
      args.push(department);
    }

    const sql = `${PLAN_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY p.plan_year DESC, p.department ASC, p.revision DESC`;
    const { results } = await c.env.DB.prepare(sql).bind(...args).all();
    return c.json({ plans: results });
  });

  app.get('/api/vcc/plans/:id', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id');
    const plan = await fetchPlan(db, id);
    if (!plan) return c.json({ error: 'ไม่พบแผนการสอบเทียบประจำปี' }, 404);

    const [items, planSettings, { results: rawHistory }] = await Promise.all([
      fetchPlanItems(db, id),
      loadPlanSettings(db),
      db.prepare(`
        SELECT a.id, a.at, a.actor_id, a.action, a.details, u.name AS actor_name
        FROM audit_log a
        LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.action GLOB 'VCC_PLAN_*'
          AND json_extract(a.details, '$.plan_id') = ?
        ORDER BY a.id DESC
      `).bind(id).all()
    ]);

    const thresholds = await getThresholds(db, planSettings.approval_doc_type);
    const history = rawHistory.map((h) => ({
      ...h,
      details: h.details ? JSON.parse(h.details) : null
    }));

    return c.json({ plan, items, thresholds, history });
  });

  app.post('/api/vcc/plans', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));

    const planYear = Number(body.plan_year);
    if (!Number.isInteger(planYear) || planYear < 2000 || planYear > 2100) {
      return c.json({ error: 'กรุณาระบุปีของแผนประจำปีให้ถูกต้อง (ค.ศ. 2000-2100)' }, 400);
    }
    const department = clean(body.department, 20)?.toUpperCase();
    if (!department) return c.json({ error: 'กรุณาระบุแผนกเจ้าของแผน' }, 400);

    const deptRow = await db.prepare("SELECT code FROM departments WHERE code = ? AND status = 'ACTIVE'").bind(department).first();
    if (!deptRow) return c.json({ error: 'ไม่พบแผนกที่ระบุใน Master Data' }, 400);

    const planSettings = await loadPlanSettings(db);
    const documentCode = clean(body.document_code ?? planSettings.default_doc_code, 50);
    const revision = clean(body.revision ?? '00', 10);
    const title = clean(body.title ?? `แผนการทวนสอบเครื่องมือประจำปี ${planYear}`, 300);
    const dueDateRule = String(body.due_date_rule ?? planSettings.due_date_rule).toUpperCase();

    if (!documentCode || !revision || !title) {
      return c.json({ error: 'กรุณาระบุรหัสเอกสาร ครั้งที่แก้ไข และชื่อแผนให้ครบถ้วน' }, 400);
    }
    if (!DUE_DATE_RULES.includes(dueDateRule)) {
      return c.json({ error: 'กติกาคำนวณวันครบกำหนดไม่ถูกต้อง' }, 400);
    }

    const id = crypto.randomUUID();
    const details = {
      plan_id: id,
      plan_year: planYear,
      department,
      document_code: documentCode,
      revision,
      title,
      due_date_rule: dueDateRule,
      status: 'DRAFT'
    };

    try {
      await db.batch([
        db.prepare(`
          INSERT INTO vcc_annual_plans (
            id, plan_year, department, document_code, revision, title, status, due_date_rule, created_by, updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)
        `).bind(id, planYear, department, documentCode, revision, title, dueDateRule, user.id, user.id),
        audit(db, user.id, 'VCC_PLAN_CREATED', details)
      ]);
    } catch (err) {
      if (isUnique(err)) {
        return c.json({ error: `แผนประจำปี ${planYear} ของแผนก ${department} (Rev.${revision}) มีอยู่ในระบบแล้ว` }, 409);
      }
      throw err;
    }

    return c.json({ plan: await fetchPlan(db, id) }, 201);
  });

  app.put('/api/vcc/plans/:id', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const existing = await fetchPlan(db, id);
    if (!existing) return c.json({ error: 'ไม่พบแผนการสอบเทียบประจำปี' }, 404);
    if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
      return c.json({ error: 'แก้ไขข้อมูลแผนได้เฉพาะสถานะร่าง (DRAFT) หรือส่งกลับแก้ไข (REJECTED) เท่านั้น' }, 409);
    }

    const body = await c.req.json().catch(() => ({}));
    const title = body.title !== undefined ? clean(body.title, 300) : existing.title;
    const documentCode = body.document_code !== undefined ? clean(body.document_code, 50) : existing.document_code;
    const revision = body.revision !== undefined ? clean(body.revision, 10) : existing.revision;
    const dueDateRule = body.due_date_rule !== undefined ? String(body.due_date_rule).toUpperCase() : existing.due_date_rule;

    if (!title || !documentCode || !revision) {
      return c.json({ error: 'ข้อมูลหัวแผนไม่ครบถ้วน' }, 400);
    }
    if (!DUE_DATE_RULES.includes(dueDateRule)) {
      return c.json({ error: 'กติกาคำนวณวันครบกำหนดไม่ถูกต้อง' }, 400);
    }

    const statements = [
      db.prepare(`
        UPDATE vcc_annual_plans
        SET title = ?, document_code = ?, revision = ?, due_date_rule = ?, updated_at = ${NOW}, updated_by = ?
        WHERE id = ?
      `).bind(title, documentCode, revision, dueDateRule, user.id, id)
    ];

    // If due_date_rule changed, recalculate due_dates for all items in this plan
    if (dueDateRule !== existing.due_date_rule) {
      const items = await fetchPlanItems(db, id);
      for (const item of items) {
        const recomputed = computeDueDates(existing.plan_year, item.planned_months, dueDateRule);
        statements.push(
          db.prepare(`UPDATE vcc_annual_plan_items SET due_dates = ?, updated_at = ${NOW}, updated_by = ? WHERE id = ?`)
            .bind(JSON.stringify(recomputed), user.id, item.id)
        );
      }
    }

    statements.push(
      audit(db, user.id, 'VCC_PLAN_UPDATED', {
        plan_id: id,
        before: {
          title: existing.title,
          document_code: existing.document_code,
          revision: existing.revision,
          due_date_rule: existing.due_date_rule
        },
        after: { title, document_code: documentCode, revision, due_date_rule: dueDateRule }
      })
    );

    try {
      await db.batch(statements);
    } catch (err) {
      if (isUnique(err)) {
        return c.json({ error: 'ครั้งที่แก้ไข (Revision) ซ้ำกับแผนที่มีอยู่แล้ว' }, 409);
      }
      throw err;
    }

    return c.json({ plan: await fetchPlan(db, id), items: await fetchPlanItems(db, id) });
  });

  // Add or update a schedule item in an annual plan
  app.post('/api/vcc/plans/:id/items', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const planId = c.req.param('id');
    const plan = await fetchPlan(db, planId);
    if (!plan) return c.json({ error: 'ไม่พบแผนการสอบเทียบประจำปี' }, 404);
    if (plan.status !== 'DRAFT' && plan.status !== 'REJECTED') {
      return c.json({ error: 'เพิ่มหรือแก้ไขรายการในแผนได้เฉพาะสถานะร่าง (DRAFT) หรือส่งกลับแก้ไข (REJECTED) เท่านั้น' }, 409);
    }

    const body = await c.req.json().catch(() => ({}));
    const assetId = clean(body.asset_id, 100);
    const providerName = clean(body.provider_name, 150);
    const frequencyLabel = clean(body.frequency_label ?? 'รายปี', 100);
    const plannedMonths = parsePlannedMonths(body.planned_months);
    const responsibleDept = clean(body.responsible_dept, 20)?.toUpperCase();
    const responsibleLabel = cleanOpt(body.responsible_label, 150);
    const remarks = cleanOpt(body.remarks, 500);
    const sortOrder = Number.isInteger(Number(body.sort_order)) ? Number(body.sort_order) : 0;

    if (!assetId) return c.json({ error: 'กรุณาเลือกเครื่องมือจากทะเบียนเครื่องมือ' }, 400);
    if (!providerName) return c.json({ error: 'กรุณาระบุสถาบัน/หน่วยงานที่ทวนสอบ' }, 400);
    if (!frequencyLabel) return c.json({ error: 'กรุณาระบุความถี่ในการทวนสอบ' }, 400);
    if (plannedMonths === null) return c.json({ error: 'ข้อมูลเดือนที่วางแผนไม่ถูกต้อง' }, 400);
    if (plannedMonths.length === 0 && !remarks) {
      return c.json({ error: 'กรุณาเลือกเดือนที่วางแผนอย่างน้อย 1 เดือน (1-12) หรือระบุเหตุผลที่ไม่วางแผน' }, 400);
    }
    if (!responsibleDept) return c.json({ error: 'กรุณาระบุแผนกผู้รับผิดชอบ' }, 400);
    if (responsibleLabel === null || remarks === null) {
      return c.json({ error: 'ข้อมูลผู้รับผิดชอบหรือหมายเหตุยาวเกินกำหนด' }, 400);
    }

    const [asset, deptRow] = await Promise.all([
      db.prepare('SELECT * FROM vcc_assets WHERE id = ?').bind(assetId).first(),
      db.prepare("SELECT code FROM departments WHERE code = ? AND status = 'ACTIVE'").bind(responsibleDept).first()
    ]);
    if (!asset) return c.json({ error: 'ไม่พบเครื่องมือที่ระบุในทะเบียนเครื่องมือ' }, 404);
    if (asset.status !== 'ACTIVE') {
      return c.json({ error: 'ไม่สามารถเพิ่มเครื่องมือที่ไม่ได้ใช้งานปกติ (ACTIVE) เข้าแผนประจำปีได้' }, 400);
    }
    if (!deptRow) return c.json({ error: 'ไม่พบแผนกผู้รับผิดชอบใน Master Data' }, 400);

    const dueDates = computeDueDates(plan.plan_year, plannedMonths, plan.due_date_rule);
    const existingItem = await db.prepare('SELECT * FROM vcc_annual_plan_items WHERE plan_id = ? AND asset_id = ?')
      .bind(planId, assetId)
      .first();

    const itemId = existingItem ? existingItem.id : crypto.randomUUID();
    const auditDetails = {
      plan_id: planId,
      item_id: itemId,
      asset_id: assetId,
      asset_code: asset.asset_code,
      is_group: asset.is_group,
      provider_name: providerName,
      frequency_label: frequencyLabel,
      planned_months: plannedMonths,
      due_dates: dueDates,
      responsible_dept: responsibleDept,
      responsible_label: responsibleLabel,
      remarks
    };

    if (existingItem) {
      await db.batch([
        db.prepare(`
          UPDATE vcc_annual_plan_items
          SET provider_name = ?, frequency_label = ?, planned_months = ?, due_dates = ?,
              responsible_dept = ?, responsible_label = ?, remarks = ?, sort_order = ?,
              updated_at = ${NOW}, updated_by = ?
          WHERE id = ?
        `).bind(
          providerName,
          frequencyLabel,
          JSON.stringify(plannedMonths),
          JSON.stringify(dueDates),
          responsibleDept,
          responsibleLabel,
          remarks,
          sortOrder,
          user.id,
          itemId
        ),
        db.prepare(`UPDATE vcc_annual_plans SET updated_at = ${NOW}, updated_by = ? WHERE id = ?`).bind(user.id, planId),
        audit(db, user.id, 'VCC_PLAN_ITEM_SAVED', auditDetails)
      ]);
    } else {
      await db.batch([
        db.prepare(`
          INSERT INTO vcc_annual_plan_items (
            id, plan_id, asset_id, provider_name, frequency_label, planned_months, due_dates,
            responsible_dept, responsible_label, remarks, sort_order, created_by, updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          itemId,
          planId,
          assetId,
          providerName,
          frequencyLabel,
          JSON.stringify(plannedMonths),
          JSON.stringify(dueDates),
          responsibleDept,
          responsibleLabel,
          remarks,
          sortOrder,
          user.id,
          user.id
        ),
        db.prepare(`UPDATE vcc_annual_plans SET updated_at = ${NOW}, updated_by = ? WHERE id = ?`).bind(user.id, planId),
        audit(db, user.id, 'VCC_PLAN_ITEM_SAVED', auditDetails)
      ]);
    }

    const items = await fetchPlanItems(db, planId, plan);
    const saved = items.find((i) => i.id === itemId || i.asset_id === assetId);
    return c.json({ item: saved, items }, existingItem ? 200 : 201);
  });

  const handleRemoveItem = async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const planId = c.req.param('id');
    const itemId = c.req.param('itemId');

    const plan = await fetchPlan(db, planId);
    if (!plan) return c.json({ error: 'ไม่พบแผนการสอบเทียบประจำปี' }, 404);
    if (plan.status !== 'DRAFT' && plan.status !== 'REJECTED') {
      return c.json({ error: 'ลบรายการในแผนได้เฉพาะสถานะร่าง (DRAFT) หรือส่งกลับแก้ไข (REJECTED) เท่านั้น' }, 409);
    }

    const existingItem = await db.prepare(`
      SELECT i.*, a.asset_code, a.name AS asset_name
      FROM vcc_annual_plan_items i
      JOIN vcc_assets a ON a.id = i.asset_id
      WHERE i.id = ? AND i.plan_id = ?
    `).bind(itemId, planId).first();
    if (!existingItem) return c.json({ error: 'ไม่พบรายการเครื่องมือในแผนนี้' }, 404);

    await db.batch([
      db.prepare('DELETE FROM vcc_annual_plan_items WHERE id = ? AND plan_id = ?').bind(itemId, planId),
      db.prepare(`UPDATE vcc_annual_plans SET updated_at = ${NOW}, updated_by = ? WHERE id = ?`).bind(user.id, planId),
      audit(db, user.id, 'VCC_PLAN_ITEM_REMOVED', {
        plan_id: planId,
        item_id: itemId,
        asset_id: existingItem.asset_id,
        asset_code: existingItem.asset_code,
        asset_name: existingItem.asset_name
      })
    ]);

    return c.json({ items: await fetchPlanItems(db, planId, plan) });
  };

  app.delete('/api/vcc/plans/:id/items/:itemId', requireAuth, requireVccAccess, handleRemoveItem);
  app.post('/api/vcc/plans/:id/items/:itemId/remove', requireAuth, requireVccAccess, handleRemoveItem);

  // Validate whether a plan item can be used to create a Work Order (Group assets must be split into child assets first)
  app.post('/api/vcc/plans/:id/items/:itemId/validate-work-order', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const planId = c.req.param('id');
    const itemId = c.req.param('itemId');
    const body = await c.req.json().catch(() => ({}));

    const items = await fetchPlanItems(db, planId);
    const item = items.find((i) => i.id === itemId);
    if (!item) return c.json({ error: 'ไม่พบรายการในแผนประจำปี' }, 404);

    if (item.is_group === 1 && item.group_nature !== 'COMPOSITE_SET') {
      const childAssetId = clean(body.child_asset_id, 100);
      if (!childAssetId) {
        return c.json({
          error: 'เครื่องมือแบบกลุ่มต้องแยกรหัสเครื่องมือรายตัวก่อนสร้างใบสั่งงาน',
          requires_child_selection: true
        }, 400);
      }
      const child = await db.prepare('SELECT * FROM vcc_assets WHERE id = ? AND parent_id = ?')
        .bind(childAssetId, item.asset_id)
        .first();
      if (!child) {
        return c.json({ error: 'ไม่พบเครื่องมือลูกที่สังกัดกลุ่มนี้' }, 400);
      }
      if (child.status !== 'ACTIVE') {
        return c.json({ error: 'เครื่องมือลูกที่เลือกไม่ได้อยู่ในสถานะใช้งานปกติ (ACTIVE)' }, 400);
      }
      return c.json({
        ready: true,
        target_asset: child,
        due_dates: item.due_dates
      });
    }

    if (item.asset_status !== 'ACTIVE') {
      return c.json({ error: 'เครื่องมือนี้ไม่ได้อยู่ในสถานะใช้งานปกติ (ACTIVE)' }, 400);
    }

    return c.json({
      ready: true,
      target_asset: {
        id: item.asset_id,
        asset_code: item.asset_code,
        name: item.asset_name,
        status: item.asset_status
      },
      due_dates: item.due_dates
    });
  });

  // Submit plan for review (DRAFT or REJECTED -> PENDING_REVIEW)
  app.post('/api/vcc/plans/:id/submit', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');

    const plan = await fetchPlan(db, id);
    if (!plan) return c.json({ error: 'ไม่พบแผนการสอบเทียบประจำปี' }, 404);
    if (plan.status !== 'DRAFT' && plan.status !== 'REJECTED') {
      return c.json({ error: 'ส่งทบทวนได้เฉพาะแผนที่อยู่ในสถานะร่าง (DRAFT) หรือส่งกลับแก้ไข (REJECTED) เท่านั้น' }, 409);
    }

    const planSettings = await loadPlanSettings(db);
    const thresholds = await getThresholds(db, planSettings.approval_doc_type);
    if (!isUserAuthorizedForPlanDept(user, plan.department)) {
      return c.json({ error: 'เฉพาะผู้ใช้งานที่สังกัดแผนกเจ้าของแผน หรือ DCC/QMR เท่านั้นที่สามารถส่งแผนได้' }, 403);
    }
    if (user.approval_level < thresholds.min_requester_level) {
      return c.json({ error: `ผู้จัดทำแผนต้องมีระดับอนุมัติ L${thresholds.min_requester_level} ขึ้นไป` }, 403);
    }

    const items = await fetchPlanItems(db, id, plan);
    if (items.length === 0) {
      return c.json({ error: 'กรุณาเพิ่มรายการเครื่องมือในแผนอย่างน้อย 1 รายการก่อนส่งขออนุมัติ' }, 400);
    }

    // Submission gate: Check for unplanned items without remarks
    const groupItems = items.filter((i) => Number(i.is_group) === 1);
    const standaloneItems = items.filter((i) => Number(i.is_group) === 0 && !i.parent_id);
    const unplannedWithoutJustification = [];

    for (const item of standaloneItems) {
      const hasPlan = Array.isArray(item.planned_months) && item.planned_months.length > 0;
      const hasRemarks = Boolean(item.remarks && item.remarks.trim());
      if (!hasPlan && !hasRemarks) {
        unplannedWithoutJustification.push(item);
      }
    }

    for (const grp of groupItems) {
      const grpHasPlan = Array.isArray(grp.planned_months) && grp.planned_months.length > 0;
      const grpHasRemarks = Boolean(grp.remarks && grp.remarks.trim());
      const children = items.filter((c) => c.parent_id === grp.asset_id || c.parent_id === grp.id);

      if (children.length === 0) {
        if (!grpHasPlan && !grpHasRemarks) {
          unplannedWithoutJustification.push(grp);
        }
      } else if (grpHasPlan || grpHasRemarks) {
        // Group covered at group level
      } else {
        // Must be covered at child level
        for (const ch of children) {
          const chHasPlan = Array.isArray(ch.planned_months) && ch.planned_months.length > 0;
          const chHasRemarks = Boolean(ch.remarks && ch.remarks.trim());
          if (!chHasPlan && !chHasRemarks) {
            unplannedWithoutJustification.push(ch);
          }
        }
      }
    }

    if (unplannedWithoutJustification.length > 0) {
      const codes = unplannedWithoutJustification.map((i) => i.asset_code).join(', ');
      return c.json({
        error: `กรุณาวางแผนเดือนทวนสอบหรือระบุเหตุผลที่ไม่วางแผนสำหรับเครื่องมือ (${codes}) ก่อนส่งทบทวน`,
        unplanned_items: unplannedWithoutJustification.map((i) => ({ id: i.id, asset_code: i.asset_code, asset_name: i.asset_name }))
      }, 400);
    }

    // Freeze scope: persist any virtual items into vcc_annual_plan_items
    const batchStatements = [];
    for (const item of items) {
      if (item.is_persisted === 0 || String(item.id).startsWith('virtual-')) {
        const newId = crypto.randomUUID();
        const dueDates = computeDueDates(plan.plan_year, item.planned_months || [], plan.due_date_rule);
        batchStatements.push(
          db.prepare(`
            INSERT INTO vcc_annual_plan_items (
              id, plan_id, asset_id, provider_name, frequency_label, planned_months, due_dates,
              responsible_dept, responsible_label, remarks, sort_order, created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            newId,
            id,
            item.asset_id,
            item.provider_name || 'ทวนสอบภายใน',
            item.frequency_label || 'รายปี',
            JSON.stringify(item.planned_months || []),
            JSON.stringify(dueDates),
            item.responsible_dept || plan.department,
            item.responsible_label || '',
            item.remarks || '',
            item.sort_order ?? 0,
            user.id,
            user.id
          )
        );
      }
    }

    batchStatements.push(
      db.prepare(`
        UPDATE vcc_annual_plans
        SET status = 'PENDING_REVIEW',
            prepared_by = ?,
            prepared_at = ${NOW},
            reviewed_by = NULL,
            reviewed_at = NULL,
            review_comment = NULL,
            approved_by = NULL,
            approved_at = NULL,
            approval_comment = NULL,
            rejected_by = NULL,
            rejected_at = NULL,
            rejected_reason = NULL,
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ?
      `).bind(user.id, user.id, id),
      audit(db, user.id, 'VCC_PLAN_SUBMITTED', {
        plan_id: id,
        plan_year: plan.plan_year,
        department: plan.department,
        item_count: items.length,
        before: { status: plan.status },
        after: { status: 'PENDING_REVIEW' }
      })
    );

    await db.batch(batchStatements);

    return c.json({ plan: await fetchPlan(db, id) });
  });

  // Review plan (PENDING_REVIEW -> PENDING_APPROVAL) using existing approval_matrix thresholds
  app.post('/api/vcc/plans/:id/review', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const comment = cleanOpt(body.comment, 500) || '';

    const plan = await fetchPlan(db, id);
    if (!plan) return c.json({ error: 'ไม่พบแผนการสอบเทียบประจำปี' }, 404);
    if (plan.status !== 'PENDING_REVIEW') {
      return c.json({ error: 'แผนนี้ไม่อยู่ในสถานะรอทบทวน (PENDING_REVIEW)' }, 409);
    }

    const planSettings = await loadPlanSettings(db);
    const thresholds = await getThresholds(db, planSettings.approval_doc_type);

    if (!isUserAuthorizedForPlanDept(user, plan.department)) {
      return c.json({ error: 'เฉพาะผู้ใช้งานที่สังกัดแผนกของแผน หรือ DCC/QMR เท่านั้นที่สามารถทบทวนแผนได้' }, 403);
    }
    if (user.id === plan.prepared_by) {
      return c.json({ error: 'ผู้จัดทำไม่สามารถทบทวนแผนของตนเองได้' }, 403);
    }
    if (user.approval_level < thresholds.required_reviewer_level) {
      return c.json({ error: `ผู้ทบทวนต้องมีระดับอนุมัติ L${thresholds.required_reviewer_level} ขึ้นไปตาม Approval Matrix` }, 403);
    }

    await db.batch([
      db.prepare(`
        UPDATE vcc_annual_plans
        SET status = 'PENDING_APPROVAL',
            reviewed_by = ?,
            reviewed_at = ${NOW},
            review_comment = ?,
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ? AND status = 'PENDING_REVIEW'
      `).bind(user.id, comment, user.id, id),
      audit(db, user.id, 'VCC_PLAN_REVIEWED', {
        plan_id: id,
        plan_year: plan.plan_year,
        comment,
        required_reviewer_level: thresholds.required_reviewer_level,
        before: { status: 'PENDING_REVIEW' },
        after: { status: 'PENDING_APPROVAL' }
      })
    ]);

    return c.json({ plan: await fetchPlan(db, id) });
  });

  // Approve plan (PENDING_APPROVAL -> APPROVED) using existing approval_matrix thresholds
  app.post('/api/vcc/plans/:id/approve', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const comment = cleanOpt(body.comment, 500) || '';

    const plan = await fetchPlan(db, id);
    if (!plan) return c.json({ error: 'ไม่พบแผนการสอบเทียบประจำปี' }, 404);
    if (plan.status !== 'PENDING_APPROVAL') {
      return c.json({ error: 'แผนนี้ไม่อยู่ในสถานะรออนุมัติ (PENDING_APPROVAL)' }, 409);
    }

    const planSettings = await loadPlanSettings(db);
    const thresholds = await getThresholds(db, planSettings.approval_doc_type);

    if (!isUserAuthorizedForPlanDept(user, plan.department)) {
      return c.json({ error: 'เฉพาะผู้ใช้งานที่สังกัดแผนกของแผน หรือ DCC/QMR เท่านั้นที่สามารถอนุมัติแผนได้' }, 403);
    }
    if (user.id === plan.prepared_by) {
      return c.json({ error: 'ผู้จัดทำไม่สามารถอนุมัติแผนของตนเองได้' }, 403);
    }
    if (user.id === plan.reviewed_by) {
      return c.json({ error: 'ผู้ทบทวนไม่สามารถอนุมัติแผนที่ตนทบทวนได้' }, 403);
    }
    if (user.approval_level < thresholds.required_approver_level) {
      return c.json({ error: `ผู้อนุมัติต้องมีระดับอนุมัติ L${thresholds.required_approver_level} ขึ้นไปตาม Approval Matrix` }, 403);
    }

    await db.batch([
      db.prepare(`
        UPDATE vcc_annual_plans
        SET status = 'APPROVED',
            approved_by = ?,
            approved_at = ${NOW},
            approval_comment = ?,
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ? AND status = 'PENDING_APPROVAL'
      `).bind(user.id, comment, user.id, id),
      audit(db, user.id, 'VCC_PLAN_APPROVED', {
        plan_id: id,
        plan_year: plan.plan_year,
        comment,
        required_approver_level: thresholds.required_approver_level,
        before: { status: 'PENDING_APPROVAL' },
        after: { status: 'APPROVED' }
      })
    ]);

    return c.json({ plan: await fetchPlan(db, id) });
  });

  // Reject / Return plan for revision (PENDING_REVIEW or PENDING_APPROVAL -> REJECTED) with mandatory reason
  app.post('/api/vcc/plans/:id/reject', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const reason = clean(body.reason, 500);
    if (!reason) {
      return c.json({ error: 'กรุณาระบุเหตุผลในการส่งกลับแก้ไข' }, 400);
    }

    const plan = await fetchPlan(db, id);
    if (!plan) return c.json({ error: 'ไม่พบแผนการสอบเทียบประจำปี' }, 404);
    if (plan.status !== 'PENDING_REVIEW' && plan.status !== 'PENDING_APPROVAL') {
      return c.json({ error: 'ส่งกลับแก้ไขได้เฉพาะแผนที่รอทบทวนหรือรออนุมัติเท่านั้น' }, 409);
    }

    const planSettings = await loadPlanSettings(db);
    const thresholds = await getThresholds(db, planSettings.approval_doc_type);
    const requiredLevel = plan.status === 'PENDING_REVIEW'
      ? thresholds.required_reviewer_level
      : thresholds.required_approver_level;

    if (!isUserAuthorizedForPlanDept(user, plan.department)) {
      return c.json({ error: 'เฉพาะผู้ใช้งานที่สังกัดแผนกของแผน หรือ DCC/QMR เท่านั้นที่สามารถส่งกลับแผนได้' }, 403);
    }
    if (user.id === plan.prepared_by) {
      return c.json({ error: 'ผู้จัดทำไม่สามารถพิจารณาแผนของตนเองได้' }, 403);
    }
    if (user.approval_level < requiredLevel) {
      return c.json({ error: `ต้องมีระดับอนุมัติ L${requiredLevel} ขึ้นไปตาม Approval Matrix` }, 403);
    }

    await db.batch([
      db.prepare(`
        UPDATE vcc_annual_plans
        SET status = 'REJECTED',
            rejected_by = ?,
            rejected_at = ${NOW},
            rejected_reason = ?,
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ?
      `).bind(user.id, reason, user.id, id),
      audit(db, user.id, 'VCC_PLAN_REJECTED', {
        plan_id: id,
        plan_year: plan.plan_year,
        reason,
        stage: plan.status,
        before: { status: plan.status },
        after: { status: 'REJECTED' }
      })
    ]);

    return c.json({ plan: await fetchPlan(db, id) });
  });

  // Get active VCC workflow tasks for the authenticated user based on DCC Master Data & Approval Matrix
  app.get('/api/vcc/tasks', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const planSettings = await loadPlanSettings(db);
    const thresholds = await getThresholds(db, planSettings.approval_doc_type);

    const { results: pendingPlans } = await db.prepare(`
      SELECT * FROM vcc_annual_plans
      WHERE status IN ('PENDING_REVIEW', 'PENDING_APPROVAL', 'REJECTED')
      ORDER BY plan_year DESC, department ASC
    `).all();

    const tasks = [];
    for (const p of (pendingPlans || [])) {
      const isDeptAllowed = isUserAuthorizedForPlanDept(user, p.department);
      if (p.status === 'PENDING_REVIEW') {
        if (isDeptAllowed && user.id !== p.prepared_by && user.approval_level >= thresholds.required_reviewer_level) {
          tasks.push({
            id: `api-vcc-plan-${p.id}-review`,
            planId: p.id,
            referenceId: p.id,
            referenceType: 'VCC_PLAN',
            docCode: p.document_code,
            document_code: p.document_code,
            docTitle: p.title,
            docName: p.title,
            title: `[แผนทวนสอบ VCC ทบทวน] ${p.title} (${p.document_code} Rev.${p.revision})`,
            type: 'Review',
            taskType: 'VCC_PLAN_REVIEW',
            task_type: 'VCC_PLAN_REVIEW',
            category: 'REVIEW',
            department: p.department,
            target_department: p.department,
            owner_dept: p.department,
            required_approval_level: thresholds.required_reviewer_level,
            requesterId: p.prepared_by,
            prepared_by: p.prepared_by,
            status: 'PENDING',
            statusTab: 'PENDING_REVIEW',
            createdAt: p.prepared_at || p.created_at
          });
        }
      } else if (p.status === 'PENDING_APPROVAL') {
        if (isDeptAllowed && user.id !== p.prepared_by && user.id !== p.reviewed_by && user.approval_level >= thresholds.required_approver_level) {
          tasks.push({
            id: `api-vcc-plan-${p.id}-approve`,
            planId: p.id,
            referenceId: p.id,
            referenceType: 'VCC_PLAN',
            docCode: p.document_code,
            document_code: p.document_code,
            docTitle: p.title,
            docName: p.title,
            title: `[แผนทวนสอบ VCC อนุมัติ] ${p.title} (${p.document_code} Rev.${p.revision})`,
            type: 'Approve',
            taskType: 'VCC_PLAN_APPROVE',
            task_type: 'VCC_PLAN_APPROVE',
            category: 'APPROVE',
            department: p.department,
            target_department: p.department,
            owner_dept: p.department,
            required_approval_level: thresholds.required_approver_level,
            requesterId: p.prepared_by,
            reviewerId: p.reviewed_by,
            status: 'PENDING',
            statusTab: 'PENDING_APPROVAL',
            createdAt: p.reviewed_at
          });
        }
      } else if (p.status === 'REJECTED') {
        if (user.id === p.prepared_by || user.isDcc || user.isQmr) {
          tasks.push({
            id: `api-vcc-plan-${p.id}-revise`,
            planId: p.id,
            referenceId: p.id,
            referenceType: 'VCC_PLAN',
            docCode: p.document_code,
            document_code: p.document_code,
            docTitle: p.title,
            docName: p.title,
            title: `[แผนทวนสอบ VCC ส่งกลับแก้ไข] ${p.title} (${p.document_code} Rev.${p.revision})`,
            type: 'Revise',
            taskType: 'VCC_PLAN_REVISE',
            task_type: 'VCC_PLAN_REVISE',
            category: 'REVISE',
            department: p.department,
            target_department: p.department,
            owner_dept: p.department,
            assigneeId: p.prepared_by,
            assignee_id: p.prepared_by,
            requesterId: p.prepared_by,
            returnReason: p.rejected_reason,
            status: 'PENDING',
            statusTab: 'REJECTED',
            createdAt: p.rejected_at
          });
        }
      }
    }

    return c.json({ tasks });
  });
};

