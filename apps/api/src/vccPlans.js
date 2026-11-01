// VCC (Verify and Calibration Center) — Phase 2: Calibration Schedule Rules, Annual Plan Matrix & Plan Approval API.
import { getThresholds } from './approval.js';
import { requireVccAccess, requireDccOnly } from './vccAuth.js';
import { generateWorkOrdersForApprovedPlan } from './vccWorkOrders.js';

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
  return nums.sort((a, b) => a - b);
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
  let parsedDepts = user.departments;
  if (typeof parsedDepts === 'string' && parsedDepts.startsWith('[')) {
    try { parsedDepts = JSON.parse(parsedDepts); } catch {}
  }
  if (Array.isArray(parsedDepts)) depts.push(...parsedDepts);
  if (Array.isArray(user.secondaryDepartments)) depts.push(...user.secondaryDepartments);
  if (Array.isArray(user.depts)) depts.push(...user.depts);
  if (Array.isArray(user.affiliated_departments)) depts.push(...user.affiliated_departments);
  return [...new Set(depts.filter(Boolean).map((d) => String(d).toUpperCase()))];
};

export const isUserAuthorizedForPlanDept = (user, planDepartment) => {
  if (!user) return false;
  const isDccUser = Boolean(user.isDcc || user.is_dcc);
  const isQmrUser = Boolean(user.isQmr || user.is_qmr);
  const level = Number(user.approval_level ?? user.approvalLevel ?? 0);
  if (isDccUser || isQmrUser || level >= 6) return true;
  const depts = getUserDepartments(user);
  return depts.includes(String(planDepartment || '').toUpperCase());
};

const PLAN_SELECT = `
  SELECT p.*,
    p_parent.revision AS parent_revision,
    d.name_th AS department_name_th,
    u_prep.name AS prepared_by_name,
    u_prep.position AS prepared_by_position,
    u_rev.name AS reviewed_by_name,
    u_rev.position AS reviewed_by_position,
    u_app.name AS approved_by_name,
    u_app.position AS approved_by_position,
    u_rej.name AS rejected_by_name,
    u_ass_rev.name AS assigned_reviewer_name,
    u_ass_rev.position AS assigned_reviewer_position,
    u_ass_app.name AS assigned_approver_name,
    u_ass_app.position AS assigned_approver_position,
    (SELECT COUNT(*) FROM vcc_annual_plan_items i WHERE i.plan_id = p.id) AS item_count,
    (SELECT COUNT(*) FROM vcc_annual_plan_items i JOIN vcc_assets a ON a.id = i.asset_id WHERE i.plan_id = p.id AND a.is_group = 1) AS group_item_count
  FROM vcc_annual_plans p
  LEFT JOIN vcc_annual_plans p_parent ON p_parent.id = p.parent_plan_id
  LEFT JOIN departments d ON d.code = p.department
  LEFT JOIN users u_prep ON u_prep.id = p.prepared_by
  LEFT JOIN users u_rev ON u_rev.id = p.reviewed_by
  LEFT JOIN users u_app ON u_app.id = p.approved_by
  LEFT JOIN users u_rej ON u_rej.id = p.rejected_by
  LEFT JOIN users u_ass_rev ON u_ass_rev.id = p.assigned_reviewer_id
  LEFT JOIN users u_ass_app ON u_ass_app.id = p.assigned_approver_id
`;

export const getNextRevision = (curRev) => {
  const curNum = parseInt(curRev, 10);
  const nextNum = Number.isInteger(curNum) && curNum >= 0 ? curNum + 1 : 1;
  return String(nextNum).padStart(2, '0');
};

export const getCyclesForPlan = async (db, plan) => {
  if (!plan) return [];

  // For non-draft plans that already have persisted cycles in vcc_plan_cycles, use them directly
  if (plan.status !== 'DRAFT' && plan.status !== 'REJECTED') {
    const { results: persistedCycles } = await db.prepare(`
      SELECT c.id, c.plan_id, c.plan_item_id, c.asset_id, c.cycle_seq, c.planned_month,
             c.baseline_planned_date, c.cycle_status, c.initial_cycle_id, c.plan_revision,
             a.asset_code, a.name AS asset_name, a.model, a.serial_no,
             i.provider_name, i.responsible_dept, i.frequency_label
      FROM vcc_plan_cycles c
      JOIN vcc_assets a ON a.id = c.asset_id
      JOIN vcc_annual_plan_items i ON i.id = c.plan_item_id
      WHERE c.plan_id = ?
      ORDER BY a.asset_code ASC, c.cycle_seq ASC
    `).bind(plan.id).all();

    if (persistedCycles && persistedCycles.length > 0) {
      return persistedCycles;
    }
  }

  // Registry & plan items driven (combines persisted items with accurate cross-revision cycle identity)
  const { results: items } = await db.prepare(`
    SELECT i.*,
           a.asset_code, a.name AS asset_name, a.model, a.serial_no
    FROM vcc_annual_plan_items i
    JOIN vcc_assets a ON a.id = i.asset_id
    WHERE i.plan_id = ?
    ORDER BY i.sort_order ASC, a.asset_code ASC
  `).bind(plan.id).all();

  // Find existing cross-revision cycles for this year & department to preserve cycle identity
  const { results: existingCrossCycles } = await db.prepare(`
    SELECT c.id, c.asset_id, c.cycle_seq, c.initial_cycle_id, c.baseline_planned_date
    FROM vcc_plan_cycles c
    JOIN vcc_annual_plans p ON p.id = c.plan_id
    WHERE p.plan_year = ? AND p.department = ?
    ORDER BY p.revision ASC, c.created_at ASC
  `).bind(plan.plan_year, plan.department).all();

  const crossMap = new Map();
  for (const cc of (existingCrossCycles || [])) {
    crossMap.set(`${cc.asset_id}:${cc.cycle_seq}`, cc);
  }

  const cycles = [];
  for (const item of (items || [])) {
    let months = [];
    try {
      months = typeof item.planned_months === 'string' ? JSON.parse(item.planned_months) : (item.planned_months || []);
    } catch {
      months = [];
    }
    const cleanMonths = months.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12).sort((a, b) => a - b);
    let seq = 0;
    for (const m of cleanMonths) {
      seq += 1;
      const cross = crossMap.get(`${item.asset_id}:${seq}`);
      const cycleId = cross ? cross.id : `${plan.plan_year}:${plan.department}:${item.asset_id}:${m}:${seq}`;
      const initialCycleId = cross ? (cross.initial_cycle_id || cross.id) : cycleId;
      const dueDate = computeDueDateForMonth(plan.plan_year, m, plan.due_date_rule);
      cycles.push({
        id: cycleId,
        plan_id: plan.id,
        plan_item_id: item.id,
        asset_id: item.asset_id,
        cycle_seq: seq,
        planned_month: m,
        baseline_planned_date: dueDate,
        cycle_status: 'PLANNED',
        initial_cycle_id: initialCycleId,
        plan_revision: plan.revision,
        asset_code: item.asset_code,
        asset_name: item.asset_name,
        model: item.model,
        serial_no: item.serial_no,
        provider_name: item.provider_name,
        responsible_dept: item.responsible_dept,
        frequency_label: item.frequency_label
      });
    }
  }

  return cycles;
};

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
      a.composite_details,
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
      AND (a.is_group = 0 OR a.group_nature = 'COMPOSITE_SET')
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
        composite_details: asset.composite_details || '',
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
            id, plan_year, department, document_code, revision, title, status, effective_status, is_current, due_date_rule, created_by, updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', 'PENDING', 0, ?, ?, ?)
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
    if (!isUserAuthorizedForPlanDept(user, existing.department)) {
      return c.json({ error: 'เฉพาะผู้ใช้งานที่สังกัดแผนกของแผน หรือ DCC/QMR เท่านั้นที่สามารถแก้ไขข้อมูลแผนได้' }, 403);
    }
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
    if (!isUserAuthorizedForPlanDept(user, plan.department)) {
      return c.json({ error: 'เฉพาะผู้ใช้งานที่สังกัดแผนกของแผน หรือ DCC/QMR เท่านั้นที่สามารถแก้ไขรายการในแผนได้' }, 403);
    }
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
    if (Number(asset.is_group) === 1 && asset.group_nature !== 'COMPOSITE_SET') {
      return c.json({ error: 'ยกเลิกการเพิ่มกลุ่มเครื่องมือแม่เข้าแผนประจำปีแล้ว กรุณาเลือกเครื่องมือวัดรายตัวหรือชุดเครื่องมือจริง' }, 400);
    }
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
    if (!isUserAuthorizedForPlanDept(user, plan.department)) {
      return c.json({ error: 'เฉพาะผู้ใช้งานที่สังกัดแผนกของแผน หรือ DCC/QMR เท่านั้นที่สามารถลบรายการในแผนได้' }, 403);
    }
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
      db.prepare('DELETE FROM vcc_plan_cycles WHERE plan_item_id = ? AND plan_id = ?').bind(itemId, planId),
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

  // Convert a legacy Logical Group item in a DRAFT or REJECTED plan into flat individual instruments (atomic, never auto-inheriting months)
  app.post('/api/vcc/plans/:id/items/:itemId/convert-group', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const planId = c.req.param('id');
    const itemId = c.req.param('itemId');

    const plan = await fetchPlan(db, planId);
    if (!plan) return c.json({ error: 'ไม่พบแผนการสอบเทียบประจำปี' }, 404);
    if (plan.status !== 'DRAFT' && plan.status !== 'REJECTED') {
      return c.json({ error: 'ปรับรายการกลุ่มเดิมได้เฉพาะแผนในสถานะร่าง (DRAFT) หรือส่งกลับแก้ไข (REJECTED) เท่านั้น ห้ามแก้แผนที่อนุมัติแล้ว' }, 409);
    }

    const groupItem = await db.prepare(`
      SELECT i.*, a.asset_code, a.name AS asset_name, a.is_group, a.group_nature
      FROM vcc_annual_plan_items i
      JOIN vcc_assets a ON a.id = i.asset_id
      WHERE i.id = ? AND i.plan_id = ?
    `).bind(itemId, planId).first();
    if (!groupItem) return c.json({ error: 'ไม่พบรายการกลุ่มเดิมในแผนนี้' }, 404);
    if (Number(groupItem.is_group) !== 1 || groupItem.group_nature === 'COMPOSITE_SET') {
      return c.json({ error: 'รายการที่ระบุไม่ใช่กลุ่มเครื่องมือเดิม (Logical Group)' }, 400);
    }

    const body = await c.req.json().catch(() => ({}));
    const rawSelections = Array.isArray(body.selections) ? body.selections : [];
    const confirmRemoveEmpty = body.confirm_remove_empty === true;

    if (rawSelections.length === 0 && !confirmRemoveEmpty) {
      return c.json({ error: 'กรุณาเลือกเครื่องมือวัดรายตัวอย่างน้อย 1 รายการ หรือยืนยันการลบรายการกลุ่มเดิมออก' }, 400);
    }

    const seenAssetIds = new Set();
    const validatedSelections = [];

    for (const sel of rawSelections) {
      const targetAssetId = clean(sel?.asset_id, 100);
      if (!targetAssetId) {
        return c.json({ error: 'รหัสเครื่องมือในรายการที่เลือกไม่ถูกต้อง' }, 400);
      }
      if (seenAssetIds.has(targetAssetId)) {
        return c.json({ error: 'พบการเลือกเครื่องมือซ้ำกันในรายการแปลงข้อมูล' }, 400);
      }
      seenAssetIds.add(targetAssetId);

      const targetAsset = await db.prepare('SELECT * FROM vcc_assets WHERE id = ?').bind(targetAssetId).first();
      if (!targetAsset) {
        return c.json({ error: `ไม่พบเครื่องมือรหัส ${targetAssetId} ในทะเบียนเครื่องมือ` }, 404);
      }
      if (Number(targetAsset.is_group) === 1 && targetAsset.group_nature !== 'COMPOSITE_SET') {
        return c.json({ error: `ไม่สามารถเลือกกลุ่มเครื่องมือแม่ (${targetAsset.asset_code}) แทนเครื่องมือรายตัวได้` }, 400);
      }
      if (targetAsset.status !== 'ACTIVE') {
        return c.json({ error: `เครื่องมือ ${targetAsset.asset_code} ไม่ได้อยู่ในสถานะใช้งานปกติ (ACTIVE)` }, 400);
      }

      const plannedMonths = parsePlannedMonths(sel.planned_months);
      const remarks = cleanOpt(sel.remarks, 500);
      const providerName = clean(sel.provider_name ?? groupItem.provider_name ?? 'ทวนสอบภายใน', 150);
      const frequencyLabel = clean(sel.frequency_label ?? groupItem.frequency_label ?? 'รายปี', 100);
      const responsibleDept = clean(sel.responsible_dept ?? targetAsset.department ?? plan.department, 20)?.toUpperCase();
      const responsibleLabel = cleanOpt(sel.responsible_label ?? groupItem.responsible_label ?? '', 150);

      if (plannedMonths === null) {
        return c.json({ error: `เดือนที่วางแผนของเครื่องมือ ${targetAsset.asset_code} ไม่ถูกต้อง` }, 400);
      }
      if (plannedMonths.length === 0 && !remarks) {
        return c.json({ error: `กรุณากำหนดเดือนทวนสอบด้วยตนเอง หรือระบุเหตุผลที่ไม่วางแผนของเครื่องมือ ${targetAsset.asset_code}` }, 400);
      }
      if (!providerName || !frequencyLabel || !responsibleDept || remarks === null || responsibleLabel === null) {
        return c.json({ error: `ข้อมูลรายละเอียดแผนของเครื่องมือ ${targetAsset.asset_code} ไม่ครบถ้วนหรือยาวเกินกำหนด` }, 400);
      }

      const existingTargetItem = await db.prepare(
        'SELECT id, sort_order FROM vcc_annual_plan_items WHERE plan_id = ? AND asset_id = ?'
      ).bind(planId, targetAssetId).first();

      validatedSelections.push({
        existingId: existingTargetItem?.id || null,
        itemId: existingTargetItem?.id || crypto.randomUUID(),
        sortOrder: existingTargetItem?.sort_order ?? groupItem.sort_order ?? 0,
        asset: targetAsset,
        plannedMonths,
        dueDates: computeDueDates(plan.plan_year, plannedMonths, plan.due_date_rule),
        remarks,
        providerName,
        frequencyLabel,
        responsibleDept,
        responsibleLabel
      });
    }

    const stmts = [];
    for (const entry of validatedSelections) {
      if (entry.existingId) {
        stmts.push(
          db.prepare(`
            UPDATE vcc_annual_plan_items
            SET provider_name = ?, frequency_label = ?, planned_months = ?, due_dates = ?,
                responsible_dept = ?, responsible_label = ?, remarks = ?, updated_at = ${NOW}, updated_by = ?
            WHERE id = ?
          `).bind(
            entry.providerName,
            entry.frequencyLabel,
            JSON.stringify(entry.plannedMonths),
            JSON.stringify(entry.dueDates),
            entry.responsibleDept,
            entry.responsibleLabel,
            entry.remarks,
            user.id,
            entry.itemId
          )
        );
      } else {
        stmts.push(
          db.prepare(`
            INSERT INTO vcc_annual_plan_items (
              id, plan_id, asset_id, provider_name, frequency_label, planned_months, due_dates,
              responsible_dept, responsible_label, remarks, sort_order, created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            entry.itemId,
            planId,
            entry.asset.id,
            entry.providerName,
            entry.frequencyLabel,
            JSON.stringify(entry.plannedMonths),
            JSON.stringify(entry.dueDates),
            entry.responsibleDept,
            entry.responsibleLabel,
            entry.remarks,
            entry.sortOrder,
            user.id,
            user.id
          )
        );
      }
    }

    stmts.push(
      db.prepare('DELETE FROM vcc_annual_plan_items WHERE id = ? AND plan_id = ?').bind(itemId, planId),
      db.prepare(`UPDATE vcc_annual_plans SET updated_at = ${NOW}, updated_by = ? WHERE id = ?`).bind(user.id, planId),
      audit(db, user.id, 'VCC_PLAN_GROUP_CONVERTED', {
        plan_id: planId,
        removed_group_item_id: itemId,
        removed_group_asset_id: groupItem.asset_id,
        removed_group_asset_code: groupItem.asset_code,
        converted_items: validatedSelections.map((s) => ({
          item_id: s.itemId,
          asset_id: s.asset.id,
          asset_code: s.asset.asset_code,
          planned_months: s.plannedMonths,
          remarks: s.remarks
        }))
      })
    );

    await db.batch(stmts);
    return c.json({ items: await fetchPlanItems(db, planId, plan) });
  });

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

    const body = await c.req.json().catch(() => ({}));
    const reviewerId = cleanOpt(body.reviewer_id || body.reviewerId, 100);
    const approverId = cleanOpt(body.approver_id || body.approverId, 100);

    if (reviewerId) {
      const reviewerUser = await db.prepare('SELECT * FROM users WHERE id = ? AND status = "ACTIVE"').bind(reviewerId).first();
      if (!reviewerUser) {
        return c.json({ error: 'ไม่พบผู้ทบทวนที่เลือก หรือบัญชีผู้ใช้ถูกระงับ' }, 400);
      }
      if (reviewerUser.id === user.id) {
        return c.json({ error: 'ผู้จัดทำไม่สามารถเป็นผู้ทบทวนแผนของตนเองได้' }, 400);
      }
      if (reviewerUser.approval_level < thresholds.required_reviewer_level) {
        return c.json({ error: `ผู้ทบทวนต้องมีระดับอนุมัติ L${thresholds.required_reviewer_level} ขึ้นไปตาม Approval Matrix` }, 400);
      }
      if (!isUserAuthorizedForPlanDept(reviewerUser, plan.department)) {
        return c.json({ error: `ผู้ทบทวนต้องสังกัดแผนก ${plan.department} หรือมีสิทธิ์ครอบคลุมข้ามแผนก` }, 400);
      }
    }

    if (approverId) {
      const approverUser = await db.prepare('SELECT * FROM users WHERE id = ? AND status = "ACTIVE"').bind(approverId).first();
      if (!approverUser) {
        return c.json({ error: 'ไม่พบผู้อนุมัติที่เลือก หรือบัญชีผู้ใช้ถูกระงับ' }, 400);
      }
      if (approverUser.id === user.id) {
        return c.json({ error: 'ผู้จัดทำไม่สามารถเป็นผู้อนุมัติแผนของตนเองได้' }, 400);
      }
      if (reviewerId && approverUser.id === reviewerId) {
        return c.json({ error: 'ผู้ทบทวนไม่สามารถเป็นผู้อนุมัติแผนที่ตนทบทวนได้' }, 400);
      }
      if (approverUser.approval_level < thresholds.required_approver_level) {
        return c.json({ error: `ผู้อนุมัติต้องมีระดับอนุมัติ L${thresholds.required_approver_level} ขึ้นไปตาม Approval Matrix` }, 400);
      }
      if (!isUserAuthorizedForPlanDept(approverUser, plan.department)) {
        return c.json({ error: `ผู้อนุมัติต้องสังกัดแผนก ${plan.department} หรือมีสิทธิ์ครอบคลุมข้ามแผนก` }, 400);
      }
    }

    const items = await fetchPlanItems(db, id, plan);
    if (items.length === 0) {
      return c.json({ error: 'กรุณาเพิ่มรายการเครื่องมือในแผนอย่างน้อย 1 รายการก่อนส่งขออนุมัติ' }, 400);
    }

    // Submission gate 1: Block submission if any legacy Logical Group items remain unresolved in DRAFT/REJECTED plan
    const groupItems = items.filter((i) => Number(i.is_group) === 1 && i.group_nature !== 'COMPOSITE_SET');
    if (groupItems.length > 0) {
      const groupCodes = groupItems.map((i) => i.asset_code).join(', ');
      return c.json({
        error: `พบรายการกลุ่มเครื่องมือเดิม (${groupCodes}) ค้างอยู่ในแผน กรุณาปรับเป็นเครื่องมือรายตัวก่อนส่งทบทวนแผน`,
        unresolved_group_items: groupItems.map((i) => ({ id: i.id, asset_id: i.asset_id, asset_code: i.asset_code, asset_name: i.asset_name }))
      }, 400);
    }

    // Submission gate 2: Every independent Calibratable Unit must have planned months or an unplanned justification
    const calibratableUnits = items.filter((i) => Number(i.is_group) === 0 || i.group_nature === 'COMPOSITE_SET');
    const unplannedWithoutJustification = [];

    for (const item of calibratableUnits) {
      const hasPlan = Array.isArray(item.planned_months) && item.planned_months.length > 0;
      const hasRemarks = Boolean(item.remarks && item.remarks.trim());
      if (!hasPlan && !hasRemarks) {
        unplannedWithoutJustification.push(item);
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
            assigned_reviewer_id = ?,
            assigned_approver_id = ?,
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
      `).bind(user.id, reviewerId || null, approverId || null, user.id, id),
      audit(db, user.id, 'VCC_PLAN_SUBMITTED', {
        plan_id: id,
        plan_year: plan.plan_year,
        department: plan.department,
        revision: plan.revision,
        item_count: items.length,
        assigned_reviewer_id: reviewerId || null,
        assigned_approver_id: approverId || null,
        task_reference: `api-vcc-plan-${id}-review`,
        is_resubmission: plan.status === 'REJECTED',
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

    if (plan.assigned_reviewer_id && user.id !== plan.assigned_reviewer_id && !user.isDcc && !user.isQmr && user.approval_level < 6) {
      return c.json({ error: 'แผนนี้ถูกมอบหมายให้ผู้ทบทวนรายอื่นดำเนินการ' }, 403);
    }
    if (!isUserAuthorizedForPlanDept(user, plan.department)) {
      return c.json({ error: 'เฉพาะผู้ใช้งานที่สังกัดแผนกของแผน หรือ DCC/QMR เท่านั้นที่สามารถทบทวนแผนได้' }, 403);
    }
    if (user.id === plan.prepared_by) {
      return c.json({ error: 'ผู้จัดทำไม่สามารถทบทวนแผนของตนเองได้' }, 403);
    }
    if (user.approval_level < thresholds.required_reviewer_level) {
      return c.json({ error: `ผู้ทบทวนต้องมีระดับอนุมัติ L${thresholds.required_reviewer_level} ขึ้นไปตาม Approval Matrix` }, 403);
    }

    const batchRes = await db.batch([
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
        department: plan.department,
        revision: plan.revision,
        comment,
        required_reviewer_level: thresholds.required_reviewer_level,
        task_reference: `api-vcc-plan-${id}-review`,
        next_task_reference: `api-vcc-plan-${id}-approve`,
        before: { status: 'PENDING_REVIEW' },
        after: { status: 'PENDING_APPROVAL' }
      })
    ]);
    if (batchRes?.[0]?.meta?.changes === 0) {
      return c.json({ error: 'แผนนี้ถูกดำเนินการไปแล้ว กรุณารีเฟรชหน้าจอ' }, 409);
    }

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

    if (plan.assigned_approver_id && user.id !== plan.assigned_approver_id && !user.isDcc && !user.isQmr && user.approval_level < 6) {
      return c.json({ error: 'แผนนี้ถูกมอบหมายให้ผู้อนุมัติรายอื่นดำเนินการ' }, 403);
    }
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

    const batchRes = await db.batch([
      db.prepare(`
        UPDATE vcc_annual_plans
        SET status = 'APPROVED',
            effective_status = 'CURRENT',
            is_current = 1,
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
        department: plan.department,
        revision: plan.revision,
        comment,
        required_approver_level: thresholds.required_approver_level,
        task_reference: `api-vcc-plan-${id}-approve`,
        before: { status: 'PENDING_APPROVAL' },
        after: { status: 'APPROVED' }
      })
    ]);
    if (batchRes?.[0]?.meta?.changes === 0) {
      return c.json({ error: 'แผนนี้ถูกดำเนินการไปแล้ว กรุณารีเฟรชหน้าจอ' }, 409);
    }

    const generationResult = await generateWorkOrdersForApprovedPlan(db, id, user.id, audit);

    return c.json({
      plan: await fetchPlan(db, id),
      work_orders_generation: generationResult
    });
  });

  // Reconcile and auto-generate any missing work orders for an approved plan (Idempotent Retry)
  app.post('/api/vcc/plans/:id/reconcile-work-orders', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const plan = await fetchPlan(db, id);
    if (!plan) return c.json({ error: 'ไม่พบแผนการสอบเทียบประจำปี' }, 404);
    if (plan.status !== 'APPROVED') {
      return c.json({ error: 'สร้างหรือซิงค์ใบสั่งงานได้เฉพาะแผนที่ได้รับการอนุมัติแล้วเท่านั้น' }, 409);
    }
    if (!isUserAuthorizedForPlanDept(user, plan.department)) {
      return c.json({ error: 'ไม่มีสิทธิ์จัดการใบสั่งงานของแผนกนี้' }, 403);
    }

    const result = await generateWorkOrdersForApprovedPlan(db, id, user.id, audit);
    return c.json({
      plan: await fetchPlan(db, id),
      work_orders_generation: result
    });
  });

  // Explicit resolution for ambiguous work order candidates during reconciliation
  app.post('/api/vcc/plans/:id/reconcile-work-orders/resolve-ambiguous', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const planId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const cycleId = clean(body.cycle_id, 100);
    const chosenWoId = clean(body.chosen_work_order_id, 100);
    const reason = clean(body.reason, 500);

    if (!cycleId || !chosenWoId) {
      return c.json({ error: 'กรุณาระบุ cycle_id และ chosen_work_order_id' }, 400);
    }
    if (!reason) {
      return c.json({ error: 'กรุณาระบุเหตุผลในการตัดสินใจจับคู่ใบสั่งงาน' }, 400);
    }

    const plan = await fetchPlan(db, planId);
    if (!plan) return c.json({ error: 'ไม่พบแผนการสอบเทียบประจำปี' }, 404);
    if (plan.status !== 'APPROVED') {
      return c.json({ error: 'จัดการใบสั่งงานได้เฉพาะแผนที่ได้รับการอนุมัติแล้วเท่านั้น' }, 409);
    }
    if (!isUserAuthorizedForPlanDept(user, plan.department)) {
      return c.json({ error: 'ไม่มีสิทธิ์จัดการใบสั่งงานของแผนกนี้' }, 403);
    }

    const cycle = await db.prepare('SELECT * FROM vcc_plan_cycles WHERE id = ? AND plan_id = ?').bind(cycleId, planId).first();
    if (!cycle) return c.json({ error: 'ไม่พบรอบสอบเทียบที่ระบุในแผนนี้' }, 404);

    const wo = await db.prepare('SELECT * FROM vcc_work_orders WHERE id = ?').bind(chosenWoId).first();
    if (!wo) return c.json({ error: 'ไม่พบใบสั่งงานที่เลือก' }, 404);

    if (wo.asset_id !== cycle.asset_id) {
      return c.json({ error: 'ใบสั่งงานที่เลือกไม่ตรงกับเครื่องมือของรอบสอบเทียบนี้' }, 400);
    }

    if (wo.cycle_id && wo.cycle_id !== cycleId && wo.status !== 'CANCELLED') {
      return c.json({ error: `ใบสั่งงานนี้ถูกจับคู่กับรอบสอบเทียบ ${wo.cycle_id} อยู่แล้ว` }, 409);
    }

    await db.batch([
      db.prepare(`
        UPDATE vcc_work_orders
        SET cycle_id = ?,
            plan_id = ?,
            plan_item_id = ?,
            plan_year = ?,
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ?
      `).bind(cycleId, planId, cycle.plan_item_id, plan.plan_year, user.id, chosenWoId),
      audit(db, user.id, 'VCC_RECON_AMBIGUOUS_RESOLVED', {
        plan_id: planId,
        cycle_id: cycleId,
        chosen_work_order_id: chosenWoId,
        wo_code: wo.wo_code,
        asset_id: cycle.asset_id,
        reason
      })
    ]);

    const reconResult = await generateWorkOrdersForApprovedPlan(db, planId, user.id, audit);

    return c.json({
      success: true,
      resolved: {
        cycle_id: cycleId,
        work_order_id: chosenWoId,
        wo_code: wo.wo_code,
        reason
      },
      plan: await fetchPlan(db, planId),
      work_orders_generation: reconResult
    });
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

    if (plan.status === 'PENDING_REVIEW' && plan.assigned_reviewer_id && user.id !== plan.assigned_reviewer_id && !user.isDcc && !user.isQmr && user.approval_level < 6) {
      return c.json({ error: 'แผนนี้ถูกมอบหมายให้ผู้ทบทวนรายอื่นดำเนินการ' }, 403);
    }
    if (plan.status === 'PENDING_APPROVAL' && plan.assigned_approver_id && user.id !== plan.assigned_approver_id && !user.isDcc && !user.isQmr && user.approval_level < 6) {
      return c.json({ error: 'แผนนี้ถูกมอบหมายให้ผู้อนุมัติรายอื่นดำเนินการ' }, 403);
    }
    if (plan.status === 'PENDING_APPROVAL' && user.id === plan.reviewed_by) {
      return c.json({ error: 'ผู้ทบทวนไม่สามารถพิจารณาอนุมัติหรือส่งกลับแผนในขั้นตอนอนุมัติได้' }, 403);
    }

    if (!isUserAuthorizedForPlanDept(user, plan.department)) {
      return c.json({ error: 'เฉพาะผู้ใช้งานที่สังกัดแผนกของแผน หรือ DCC/QMR เท่านั้นที่สามารถส่งกลับแผนได้' }, 403);
    }
    if (user.id === plan.prepared_by) {
      return c.json({ error: 'ผู้จัดทำไม่สามารถพิจารณาแผนของตนเองได้' }, 403);
    }
    if (user.approval_level < requiredLevel) {
      return c.json({ error: `ต้องมีระดับอนุมัติ L${requiredLevel} ขึ้นไปตาม Approval Matrix` }, 403);
    }

    const batchRes = await db.batch([
      db.prepare(`
        UPDATE vcc_annual_plans
        SET status = 'REJECTED',
            rejected_by = ?,
            rejected_at = ${NOW},
            rejected_reason = ?,
            updated_at = ${NOW},
            updated_by = ?
        WHERE id = ? AND status IN ('PENDING_REVIEW', 'PENDING_APPROVAL')
      `).bind(user.id, reason, user.id, id),
      audit(db, user.id, 'VCC_PLAN_REJECTED', {
        plan_id: id,
        plan_year: plan.plan_year,
        department: plan.department,
        revision: plan.revision,
        reason,
        stage: plan.status,
        task_reference: plan.status === 'PENDING_REVIEW' ? `api-vcc-plan-${id}-review` : `api-vcc-plan-${id}-approve`,
        next_task_reference: `api-vcc-plan-${id}-revise`,
        before: { status: plan.status },
        after: { status: 'REJECTED' }
      })
    ]);
    if (batchRes?.[0]?.meta?.changes === 0) {
      return c.json({ error: 'แผนนี้ถูกดำเนินการไปแล้ว กรุณารีเฟรชหน้าจอ' }, 409);
    }

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
        const isAssigned = p.assigned_reviewer_id ? (user.id === p.assigned_reviewer_id || user.isDcc || user.isQmr || user.approval_level >= 6) : true;
        if (isAssigned && isDeptAllowed && user.id !== p.prepared_by && user.approval_level >= thresholds.required_reviewer_level) {
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
            assigneeId: p.assigned_reviewer_id,
            assignee_id: p.assigned_reviewer_id,
            status: 'PENDING',
            statusTab: 'PENDING_REVIEW',
            createdAt: p.prepared_at || p.created_at
          });
        }
      } else if (p.status === 'PENDING_APPROVAL') {
        const isAssigned = p.assigned_approver_id ? (user.id === p.assigned_approver_id || user.isDcc || user.isQmr || user.approval_level >= 6) : true;
        if (isAssigned && isDeptAllowed && user.id !== p.prepared_by && user.id !== p.reviewed_by && user.approval_level >= thresholds.required_approver_level) {
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
            assigneeId: p.assigned_approver_id,
            assignee_id: p.assigned_approver_id,
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

  // Phase 3.1: Plan Revision Foundation
  // Create a new revision (e.g. Rev.01) from an APPROVED plan (Rev.00)
  app.post('/api/vcc/plans/:id/revisions', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const sourcePlanId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    const sourcePlan = await fetchPlan(db, sourcePlanId);
    if (!sourcePlan) return c.json({ error: 'ไม่พบแผนการสอบเทียบประจำปี' }, 404);

    if (!isUserAuthorizedForPlanDept(user, sourcePlan.department)) {
      return c.json({ error: 'ไม่มีสิทธิ์จัดการแผนของแผนกนี้' }, 403);
    }

    if (sourcePlan.status !== 'APPROVED') {
      return c.json({ error: 'สร้าง Revision ใหม่ได้เฉพาะจากแผนที่ได้รับอนุมัติแล้ว (APPROVED) เท่านั้น' }, 409);
    }

    if (Number(sourcePlan.is_current) !== 1 || sourcePlan.effective_status === 'SUPERSEDED') {
      return c.json({ error: 'สร้าง Revision ใหม่ได้จากแผนฉบับที่มีผลใช้งาน (CURRENT) เท่านั้น' }, 409);
    }

    const revisionReason = clean(body.revision_reason, 1000);
    if (!revisionReason) {
      return c.json({ error: 'กรุณาระบุเหตุผลการขอปรับปรุงแผน (Revision Reason)' }, 400);
    }

    // Check for in-flight active draft revision for the same year and department
    const inFlight = await db.prepare(`
      SELECT id, revision, status
      FROM vcc_annual_plans
      WHERE plan_year = ? AND department = ? AND status IN ('DRAFT', 'PENDING_REVIEW', 'PENDING_APPROVAL')
    `).bind(sourcePlan.plan_year, sourcePlan.department).first();

    if (inFlight) {
      return c.json({
        error: `มีแผนประจำปี ${sourcePlan.plan_year} แผนก ${sourcePlan.department} (Rev.${inFlight.revision}) อยู่ในสถานะ ${inFlight.status} แล้ว กรุณาดำเนินการแผนฉบับนั้นให้เสร็จสิ้นก่อนสร้าง Revision ใหม่`,
        in_flight_plan_id: inFlight.id
      }, 409);
    }

    const nextRevision = getNextRevision(sourcePlan.revision);

    // Verify nextRevision doesn't clash with an existing plan
    const existingRev = await db.prepare(`
      SELECT id FROM vcc_annual_plans
      WHERE plan_year = ? AND department = ? AND revision = ?
    `).bind(sourcePlan.plan_year, sourcePlan.department, nextRevision).first();

    if (existingRev) {
      return c.json({ error: `Revision ${nextRevision} มีอยู่ในระบบแล้ว` }, 409);
    }

    const title = clean(body.title, 300) || sourcePlan.title;
    const newPlanId = crypto.randomUUID();

    // Fetch source plan items
    const { results: sourceItems } = await db.prepare(`
      SELECT * FROM vcc_annual_plan_items
      WHERE plan_id = ?
      ORDER BY sort_order ASC, id ASC
    `).bind(sourcePlanId).all();

    // Fetch source plan cycles
    const { results: rawSourceCycles } = await db.prepare(`
      SELECT * FROM vcc_plan_cycles
      WHERE plan_id = ?
      ORDER BY cycle_seq ASC, id ASC
    `).bind(sourcePlanId).all();

    let sourceCycles = rawSourceCycles || [];

    // If source plan didn't have cycles in vcc_plan_cycles (legacy), derive and backfill them
    if (sourceCycles.length === 0 && sourceItems && sourceItems.length > 0) {
      const derived = [];
      const backfillStmts = [];
      for (const item of sourceItems) {
        let months = [];
        try { months = JSON.parse(item.planned_months || '[]'); } catch { months = []; }
        let seq = 0;
        for (const m of months) {
          seq += 1;
          const cId = `${sourcePlan.plan_year}:${sourcePlan.department}:${item.asset_id}:${m}`;
          const dueDate = computeDueDateForMonth(sourcePlan.plan_year, m, sourcePlan.due_date_rule);
          const cRow = {
            id: cId,
            plan_id: sourcePlan.id,
            plan_item_id: item.id,
            asset_id: item.asset_id,
            cycle_seq: seq,
            planned_month: m,
            baseline_planned_date: dueDate,
            cycle_status: 'SCHEDULED',
            initial_cycle_id: cId,
            plan_revision: sourcePlan.revision
          };
          derived.push(cRow);
          backfillStmts.push(
            db.prepare(`
              INSERT OR IGNORE INTO vcc_plan_cycles (
                id, plan_id, plan_item_id, asset_id, cycle_seq, planned_month,
                baseline_planned_date, cycle_status, initial_cycle_id, plan_revision, created_by
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?, ?)
            `).bind(cId, sourcePlan.id, item.id, item.asset_id, seq, m, dueDate, cId, sourcePlan.revision, user.id)
          );
        }
      }
      if (backfillStmts.length > 0) {
        await db.batch(backfillStmts);
      }
      sourceCycles = derived;
    }

    const itemMap = new Map(); // oldItemId -> newItemId
    const itemInserts = [];
    for (const item of (sourceItems || [])) {
      const newItemId = crypto.randomUUID();
      itemMap.set(item.id, newItemId);
      itemInserts.push(
        db.prepare(`
          INSERT INTO vcc_annual_plan_items (
            id, plan_id, asset_id, provider_name, frequency_label, planned_months, due_dates,
            responsible_dept, responsible_label, remarks, sort_order, created_by, updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          newItemId,
          newPlanId,
          item.asset_id,
          item.provider_name,
          item.frequency_label,
          item.planned_months,
          item.due_dates,
          item.responsible_dept,
          item.responsible_label,
          item.remarks,
          item.sort_order,
          user.id,
          user.id
        )
      );
    }

    const planInsert = db.prepare(`
      INSERT INTO vcc_annual_plans (
        id, plan_year, department, document_code, revision, title, status,
        effective_status, is_current, due_date_rule, prepared_by, parent_plan_id,
        revision_reason, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', 'PENDING', 0, ?, ?, ?, ?, ?, ?)
    `).bind(
      newPlanId,
      sourcePlan.plan_year,
      sourcePlan.department,
      sourcePlan.document_code,
      nextRevision,
      title,
      sourcePlan.due_date_rule,
      user.id,
      sourcePlan.id,
      revisionReason,
      user.id,
      user.id
    );

    const auditEntry = audit(db, user.id, 'VCC_PLAN_REVISION_CREATED', {
      plan_id: newPlanId,
      plan_year: sourcePlan.plan_year,
      department: sourcePlan.department,
      revision: nextRevision,
      parent_plan_id: sourcePlan.id,
      parent_revision: sourcePlan.revision,
      revision_reason: revisionReason,
      items_cloned: itemInserts.length
    });

    try {
      await db.batch([
        planInsert,
        ...itemInserts,
        auditEntry
      ]);
    } catch (err) {
      if (isUnique(err)) {
        return c.json({ error: `Revision ${nextRevision} ของแผนประจำปี ${sourcePlan.plan_year} มีอยู่ในระบบแล้ว` }, 409);
      }
      throw err;
    }

    return c.json({
      plan: await fetchPlan(db, newPlanId),
      parent_plan: sourcePlan,
      cloned_items_count: itemInserts.length
    }, 201);
  });

  // Get revision history for a plan (all revisions for plan_year & department)
  app.get('/api/vcc/plans/:id/revisions', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id');
    const plan = await fetchPlan(db, id);
    if (!plan) return c.json({ error: 'ไม่พบแผนการสอบเทียบประจำปี' }, 404);

    const { results } = await db.prepare(`
      SELECT p.*,
        p_parent.revision AS parent_revision,
        d.name_th AS department_name_th,
        u_prep.name AS prepared_by_name,
        u_app.name AS approved_by_name,
        (SELECT COUNT(*) FROM vcc_annual_plan_items i WHERE i.plan_id = p.id) AS item_count,
        (SELECT COUNT(*) FROM vcc_plan_cycles c WHERE c.plan_id = p.id) AS cycle_count
      FROM vcc_annual_plans p
      LEFT JOIN vcc_annual_plans p_parent ON p_parent.id = p.parent_plan_id
      LEFT JOIN departments d ON d.code = p.department
      LEFT JOIN users u_prep ON u_prep.id = p.prepared_by
      LEFT JOIN users u_app ON u_app.id = p.approved_by
      WHERE p.plan_year = ? AND p.department = ?
      ORDER BY p.revision ASC
    `).bind(plan.plan_year, plan.department).all();

    return c.json({
      plan_year: plan.plan_year,
      department: plan.department,
      current_plan_id: plan.id,
      revisions: results || []
    });
  });

  // Phase 3.1: Revision Snapshot & Diff Engine
  // Pure comparison between target plan revision and base plan revision (zero mutation of work orders)
  app.get('/api/vcc/plans/:id/diff', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id');
    const targetPlan = await fetchPlan(db, id);
    if (!targetPlan) return c.json({ error: 'ไม่พบแผนการสอบเทียบประจำปี' }, 404);

    const compareToId = c.req.query('compare_to') || targetPlan.parent_plan_id;
    let basePlan = null;
    if (compareToId) {
      basePlan = await fetchPlan(db, compareToId);
    }

    const targetList = await getCyclesForPlan(db, targetPlan);

    if (!basePlan) {
      // No base plan: all cycles are baseline initial
      return c.json({
        target_plan: {
          id: targetPlan.id,
          plan_year: targetPlan.plan_year,
          department: targetPlan.department,
          revision: targetPlan.revision,
          status: targetPlan.status,
          effective_status: targetPlan.effective_status,
          revision_reason: targetPlan.revision_reason,
          title: targetPlan.title
        },
        base_plan: null,
        summary: {
          total_base_cycles: 0,
          total_target_cycles: targetList.length,
          added_count: targetList.length,
          removed_count: 0,
          modified_count: 0,
          unchanged_count: 0,
          has_changes: false
        },
        added: targetList.map((tc) => ({
          cycle_id: tc.id,
          initial_cycle_id: tc.initial_cycle_id || tc.id,
          asset_id: tc.asset_id,
          asset_code: tc.asset_code,
          asset_name: tc.asset_name,
          cycle_seq: tc.cycle_seq,
          diff_type: 'ADDED',
          planned_month: tc.planned_month,
          due_date: tc.baseline_planned_date,
          provider_name: tc.provider_name
        })),
        removed: [],
        modified: [],
        unchanged: []
      });
    }

    const baseList = await getCyclesForPlan(db, basePlan);

    const baseCycleById = new Map();
    const baseCycleByInitialId = new Map();
    const baseCycleByAssetSeq = new Map();

    for (const bc of baseList) {
      baseCycleById.set(bc.id, bc);
      if (bc.initial_cycle_id) {
        baseCycleByInitialId.set(bc.initial_cycle_id, bc);
      }
      baseCycleByAssetSeq.set(`${bc.asset_id}:${bc.cycle_seq}`, bc);
    }

    const matchedBaseIds = new Set();
    const added = [];
    const modified = [];
    const unchanged = [];

    for (const tc of targetList) {
      let matchedBase = null;
      if (tc.initial_cycle_id && baseCycleByInitialId.has(tc.initial_cycle_id)) {
        matchedBase = baseCycleByInitialId.get(tc.initial_cycle_id);
      } else if (tc.initial_cycle_id && baseCycleById.has(tc.initial_cycle_id)) {
        matchedBase = baseCycleById.get(tc.initial_cycle_id);
      } else if (baseCycleByAssetSeq.has(`${tc.asset_id}:${tc.cycle_seq}`)) {
        matchedBase = baseCycleByAssetSeq.get(`${tc.asset_id}:${tc.cycle_seq}`);
      }

      if (matchedBase) {
        matchedBaseIds.add(matchedBase.id);
        const isMonthChanged = matchedBase.planned_month !== tc.planned_month;
        const isDateChanged = matchedBase.baseline_planned_date !== tc.baseline_planned_date;
        const isProviderChanged = matchedBase.provider_name !== tc.provider_name;

        if (isMonthChanged || isDateChanged || isProviderChanged) {
          modified.push({
            cycle_id: tc.id,
            initial_cycle_id: tc.initial_cycle_id || matchedBase.initial_cycle_id || matchedBase.id,
            asset_id: tc.asset_id,
            asset_code: tc.asset_code,
            asset_name: tc.asset_name,
            cycle_seq: tc.cycle_seq,
            diff_type: 'MODIFIED',
            before: {
              planned_month: matchedBase.planned_month,
              due_date: matchedBase.baseline_planned_date,
              provider_name: matchedBase.provider_name
            },
            after: {
              planned_month: tc.planned_month,
              due_date: tc.baseline_planned_date,
              provider_name: tc.provider_name
            },
            changes: {
              planned_month: isMonthChanged ? { before: matchedBase.planned_month, after: tc.planned_month } : null,
              due_date: isDateChanged ? { before: matchedBase.baseline_planned_date, after: tc.baseline_planned_date } : null,
              provider_name: isProviderChanged ? { before: matchedBase.provider_name, after: tc.provider_name } : null
            }
          });
        } else {
          unchanged.push({
            cycle_id: tc.id,
            initial_cycle_id: tc.initial_cycle_id || matchedBase.initial_cycle_id || matchedBase.id,
            asset_id: tc.asset_id,
            asset_code: tc.asset_code,
            asset_name: tc.asset_name,
            cycle_seq: tc.cycle_seq,
            diff_type: 'UNCHANGED',
            planned_month: tc.planned_month,
            due_date: tc.baseline_planned_date,
            provider_name: tc.provider_name
          });
        }
      } else {
        added.push({
          cycle_id: tc.id,
          initial_cycle_id: tc.initial_cycle_id || tc.id,
          asset_id: tc.asset_id,
          asset_code: tc.asset_code,
          asset_name: tc.asset_name,
          cycle_seq: tc.cycle_seq,
          diff_type: 'ADDED',
          planned_month: tc.planned_month,
          due_date: tc.baseline_planned_date,
          provider_name: tc.provider_name
        });
      }
    }

    const removed = [];
    for (const bc of baseList) {
      if (!matchedBaseIds.has(bc.id)) {
        removed.push({
          cycle_id: bc.id,
          initial_cycle_id: bc.initial_cycle_id || bc.id,
          asset_id: bc.asset_id,
          asset_code: bc.asset_code,
          asset_name: bc.asset_name,
          cycle_seq: bc.cycle_seq,
          diff_type: 'REMOVED',
          planned_month: bc.planned_month,
          due_date: bc.baseline_planned_date,
          provider_name: bc.provider_name
        });
      }
    }

    const summary = {
      total_base_cycles: baseList.length,
      total_target_cycles: targetList.length,
      added_count: added.length,
      removed_count: removed.length,
      modified_count: modified.length,
      unchanged_count: unchanged.length,
      has_changes: added.length > 0 || removed.length > 0 || modified.length > 0
    };

    return c.json({
      target_plan: {
        id: targetPlan.id,
        plan_year: targetPlan.plan_year,
        department: targetPlan.department,
        revision: targetPlan.revision,
        status: targetPlan.status,
        effective_status: targetPlan.effective_status,
        revision_reason: targetPlan.revision_reason,
        title: targetPlan.title
      },
      base_plan: {
        id: basePlan.id,
        plan_year: basePlan.plan_year,
        department: basePlan.department,
        revision: basePlan.revision,
        status: basePlan.status,
        effective_status: basePlan.effective_status,
        title: basePlan.title
      },
      summary,
      added,
      removed,
      modified,
      unchanged
    });
  });
};

