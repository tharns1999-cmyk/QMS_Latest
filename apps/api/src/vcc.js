// VCC (Verify and Calibration Center) — Phase 1: Asset Register API.
import { registerVccPlanRoutes } from './vccPlans.js';
import { registerVccWorkOrderRoutes } from './vccWorkOrders.js';
import { registerVccDashboardRoutes } from './vccDashboard.js';
import { requireVccAccess, requireDccOnly } from './vccAuth.js';

const DCC_ONLY = { error: 'เฉพาะ DCC เท่านั้นที่ใช้งานส่วนนี้ได้' };
const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
const PHASE1_STATUSES = ['ACTIVE', 'RETIRED'];
const ASSET_CODE_RE = /^[A-Z0-9._/-]{1,50}$/;

const clean = (v, max) => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null);
const cleanOpt = (v, max) => {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length <= max ? trimmed : null;
};
const isUnique = (err) => /UNIQUE/.test(String(err?.message));

const loadAssetTypes = async (db) => {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'vcc_asset_types'").first();
  return row ? JSON.parse(row.value) : [];
};

const ASSET_SELECT = `
  SELECT a.*,
    d.name_th AS department_name_th,
    d.name_en AS department_name_en,
    p.asset_code AS parent_asset_code,
    p.name AS parent_name,
    p.status AS parent_status,
    p.group_nature AS parent_group_nature,
    (SELECT COUNT(*) FROM vcc_assets c WHERE c.parent_id = a.id) AS child_count,
    (SELECT COUNT(*) FROM vcc_assets c WHERE c.parent_id = a.id AND c.status = 'ACTIVE') AS active_child_count
  FROM vcc_assets a
  LEFT JOIN departments d ON d.code = a.department
  LEFT JOIN vcc_assets p ON p.id = a.parent_id
`;

const fetchAsset = (db, id) =>
  db.prepare(`${ASSET_SELECT} WHERE a.id = ?`).bind(id).first();

export const registerVccRoutes = (app, { requireAuth, audit }) => {
  app.get('/api/vcc/asset-types', requireAuth, requireVccAccess, async (c) => {
    return c.json({ assetTypes: await loadAssetTypes(c.env.DB) });
  });

  app.put('/api/vcc/asset-types', requireAuth, requireDccOnly, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const raw = body.assetTypes;
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) {
      return c.json({ error: 'กรุณาระบุรายการประเภทเครื่องมืออย่างน้อย 1 รายการ (ไม่เกิน 100 รายการ)' }, 400);
    }
    const cleaned = raw.map((t) => clean(t, 100));
    if (cleaned.some((t) => !t) || new Set(cleaned).size !== cleaned.length) {
      return c.json({ error: 'ชื่อประเภทเครื่องมือต้องไม่ว่าง ไม่เกิน 100 ตัวอักษร และห้ามซ้ำกัน' }, 400);
    }
    const db = c.env.DB;
    const user = c.get('user');
    const before = await loadAssetTypes(db);
    await db.batch([
      db.prepare(`INSERT INTO settings (key, value, updated_by) VALUES ('vcc_asset_types', ?, ?)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = ${NOW}, updated_by = excluded.updated_by`)
        .bind(JSON.stringify(cleaned), user.id),
      audit(db, user.id, 'VCC_ASSET_TYPES_UPDATED', { before, after: cleaned })
    ]);
    return c.json({ assetTypes: cleaned });
  });

  // Never mix statuses in a single list response.
  app.get('/api/vcc/assets', requireAuth, requireVccAccess, async (c) => {
    const status = (c.req.query('status') || 'ACTIVE').toUpperCase();
    if (!PHASE1_STATUSES.includes(status)) {
      return c.json({ error: 'สถานะเครื่องมือไม่ถูกต้อง' }, 400);
    }
    const department = clean(c.req.query('department'), 20)?.toUpperCase();
    const assetType = clean(c.req.query('asset_type'), 100);
    const parentId = clean(c.req.query('parent_id'), 100);
    const isGroupParam = c.req.query('is_group');
    const includeLogicalGroups = c.req.query('include_logical_groups') === '1' || c.req.query('include_logical_groups') === 'true';
    const logicalGroupsOnly = c.req.query('logical_groups_only') === '1' || c.req.query('logical_groups_only') === 'true';
    const q = clean(c.req.query('q'), 200);

    const clauses = ['a.status = ?'];
    const args = [status];

    if (department) {
      clauses.push('a.department = ?');
      args.push(department);
    }
    if (assetType) {
      clauses.push('a.asset_type = ?');
      args.push(assetType);
    }
    if (parentId) {
      clauses.push('a.parent_id = ?');
      args.push(parentId);
    }
    if (logicalGroupsOnly) {
      clauses.push("(a.is_group = 1 AND (a.group_nature = 'LOGICAL_GROUP' OR a.group_nature IS NULL))");
    } else if (isGroupParam === '1') {
      clauses.push('a.is_group = 1');
    } else if (!includeLogicalGroups) {
      // Operational default: flat calibratable units only (single instruments + physical composite sets)
      clauses.push("(a.is_group = 0 OR a.group_nature = 'COMPOSITE_SET')");
    }
    if (q) {
      const like = `%${q}%`;
      clauses.push('(a.asset_code LIKE ? COLLATE NOCASE OR a.name LIKE ? COLLATE NOCASE OR a.serial_no LIKE ? COLLATE NOCASE OR a.model LIKE ? COLLATE NOCASE OR a.location LIKE ? COLLATE NOCASE OR a.composite_details LIKE ? COLLATE NOCASE)');
      args.push(like, like, like, like, like, like);
    }

    const orderBy = includeLogicalGroups ? 'a.is_group DESC, a.asset_code ASC' : 'a.asset_code ASC';
    const sql = `${ASSET_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY ${orderBy}`;
    const { results } = await c.env.DB.prepare(sql).bind(...args).all();
    return c.json({ assets: results });
  });

  app.get('/api/vcc/assets/:id', requireAuth, requireVccAccess, async (c) => {
    const db = c.env.DB;
    const id = c.req.param('id');
    const asset = await fetchAsset(db, id);
    if (!asset) return c.json({ error: 'ไม่พบเครื่องมือ' }, 404);

    const { results: children } = await db.prepare(
      `${ASSET_SELECT} WHERE a.parent_id = ? ORDER BY a.asset_code ASC`
    ).bind(id).all();

    const { results: rawHistory } = await db.prepare(
      `SELECT a.id, a.at, a.actor_id, u.name AS actor_name, u.email AS actor_email, a.action, a.details
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.action GLOB 'VCC_ASSET_*' AND json_extract(a.details, '$.asset_id') = ?
       ORDER BY a.id DESC`
    ).bind(id).all();

    const history = rawHistory.map((row) => ({
      ...row,
      details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details
    }));

    return c.json({ asset, children, history });
  });

  app.post('/api/vcc/assets', requireAuth, requireDccOnly, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));

    const assetCode = clean(body.asset_code, 50)?.toUpperCase();
    const name = clean(body.name, 200);
    const assetType = clean(body.asset_type, 100);
    const department = clean(body.department, 20)?.toUpperCase();
    const serialNo = cleanOpt(body.serial_no, 100);
    const model = cleanOpt(body.model, 200);
    const location = cleanOpt(body.location, 200);
    const compositeDetails = cleanOpt(body.composite_details, 1000);
    const wantsLogicalGroup = (body.is_group === true || body.is_group === 1) && body.group_nature !== 'COMPOSITE_SET';
    const hasParentInput = body.parent_id !== undefined && body.parent_id !== null && String(body.parent_id).trim() !== '';
    const isGroup = 0;
    const groupNature = body.group_nature === 'COMPOSITE_SET' ? 'COMPOSITE_SET' : 'LOGICAL_GROUP';
    const parentId = null;

    if (wantsLogicalGroup) {
      return c.json({ error: 'ยกเลิกการสร้างกลุ่มเครื่องมือแม่ (Logical Group) แล้ว กรุณาขึ้นทะเบียนเป็นเครื่องมือรายตัว หรือชุดเครื่องมือจริง (Composite Set)' }, 400);
    }
    if (hasParentInput) {
      return c.json({ error: 'ยกเลิกการผูกเครื่องมือเข้ากับกลุ่มแม่ (Parent-Child) แล้ว กรุณาขึ้นทะเบียนเป็นเครื่องมืออิสระ' }, 400);
    }
    if (!assetCode || !ASSET_CODE_RE.test(assetCode)) {
      return c.json({ error: 'รหัสเครื่องมือไม่ถูกต้อง (ใช้ A-Z, 0-9, ., _, /, - ไม่เกิน 50 ตัวอักษร)' }, 400);
    }
    if (!name) return c.json({ error: 'กรุณาระบุชื่อเครื่องมือ' }, 400);
    if (!assetType) return c.json({ error: 'กรุณาระบุประเภทเครื่องมือ' }, 400);
    if (!department) return c.json({ error: 'กรุณาระบุแผนกเจ้าของเครื่องมือ' }, 400);
    if (serialNo === null || model === null || location === null || compositeDetails === null) {
      return c.json({ error: 'ข้อมูลหมายเลขเครื่อง รุ่น ที่ตั้ง หรือรายละเอียดชุดเครื่องมือยาวเกินกำหนด' }, 400);
    }

    const types = await loadAssetTypes(db);
    if (types.length > 0 && !types.includes(assetType)) {
      return c.json({ error: `ไม่พบประเภทเครื่องมือ "${assetType}" ในรายการตั้งค่า` }, 400);
    }

    const deptRow = await db.prepare("SELECT 1 FROM departments WHERE code = ? AND status = 'ACTIVE'").bind(department).first();
    if (!deptRow) return c.json({ error: 'ไม่พบแผนกที่ใช้งานอยู่ในระบบ' }, 400);

    const id = crypto.randomUUID();
    try {
      await db.batch([
        db.prepare(
          `INSERT INTO vcc_assets (id, asset_code, name, asset_type, serial_no, model, location, department, is_group, group_nature, parent_id, composite_details, status, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
        ).bind(id, assetCode, name, assetType, serialNo, model, location, department, isGroup, groupNature, parentId, compositeDetails, user.id, user.id),
        audit(db, user.id, 'VCC_ASSET_CREATED', {
          asset_id: id,
          asset_code: assetCode,
          name,
          asset_type: assetType,
          serial_no: serialNo,
          model,
          location,
          department,
          is_group: isGroup,
          group_nature: groupNature,
          parent_id: parentId,
          composite_details: compositeDetails,
          status: 'ACTIVE'
        })
      ]);
    } catch (err) {
      if (isUnique(err)) return c.json({ error: `รหัสเครื่องมือ ${assetCode} มีอยู่ในระบบแล้ว` }, 409);
      throw err;
    }

    return c.json({ asset: await fetchAsset(db, id) }, 201);
  });

  const updateAsset = async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const before = await db.prepare('SELECT * FROM vcc_assets WHERE id = ?').bind(id).first();
    if (!before) return c.json({ error: 'ไม่พบเครื่องมือ' }, 404);
    if (before.status === 'RETIRED') {
      return c.json({ error: 'เครื่องมือที่ปลดออกแล้วไม่สามารถแก้ไขได้ กรุณานำกลับมาใช้งานก่อน' }, 409);
    }

    const body = await c.req.json().catch(() => ({}));
    const assetCode = body.asset_code === undefined ? before.asset_code : clean(body.asset_code, 50)?.toUpperCase();
    const name = body.name === undefined ? before.name : clean(body.name, 200);
    const assetType = body.asset_type === undefined ? before.asset_type : clean(body.asset_type, 100);
    const department = body.department === undefined ? before.department : clean(body.department, 20)?.toUpperCase();
    const serialNo = body.serial_no === undefined ? before.serial_no : cleanOpt(body.serial_no, 100);
    const model = body.model === undefined ? before.model : cleanOpt(body.model, 200);
    const location = body.location === undefined ? before.location : cleanOpt(body.location, 200);
    const compositeDetails = body.composite_details === undefined ? (before.composite_details || '') : cleanOpt(body.composite_details, 1000);
    const groupNature = body.group_nature === undefined
      ? (before.group_nature || 'LOGICAL_GROUP')
      : (body.group_nature === 'COMPOSITE_SET' ? 'COMPOSITE_SET' : 'LOGICAL_GROUP');

    const requestedIsGroup = body.is_group === undefined ? before.is_group : (body.is_group === true || body.is_group === 1 ? 1 : 0);
    if (before.is_group === 0 && requestedIsGroup === 1 && groupNature !== 'COMPOSITE_SET') {
      return c.json({ error: 'ไม่สามารถแปลงเครื่องมือรายตัวเป็นกลุ่มเครื่องมือแม่ (Logical Group) ได้' }, 400);
    }
    const isGroup = before.is_group === 1 && groupNature !== 'COMPOSITE_SET' ? requestedIsGroup : 0;

    const hasNewParentInput = body.parent_id !== undefined && body.parent_id !== null && String(body.parent_id).trim() !== '' && body.parent_id !== before.parent_id;
    if (hasNewParentInput) {
      return c.json({ error: 'ยกเลิกการผูกเครื่องมือเข้ากับกลุ่มแม่ (Parent-Child) แล้ว' }, 400);
    }
    const parentId = body.parent_id === undefined ? before.parent_id : (body.parent_id ? clean(body.parent_id, 100) : null);

    if (!assetCode || !ASSET_CODE_RE.test(assetCode)) {
      return c.json({ error: 'รหัสเครื่องมือไม่ถูกต้อง (ใช้ A-Z, 0-9, ., _, /, - ไม่เกิน 50 ตัวอักษร)' }, 400);
    }
    if (!name) return c.json({ error: 'กรุณาระบุชื่อเครื่องมือ' }, 400);
    if (!assetType) return c.json({ error: 'กรุณาระบุประเภทเครื่องมือ' }, 400);
    if (!department) return c.json({ error: 'กรุณาระบุแผนกเจ้าของเครื่องมือ' }, 400);
    if (serialNo === null || model === null || location === null || compositeDetails === null) {
      return c.json({ error: 'ข้อมูลหมายเลขเครื่อง รุ่น ที่ตั้ง หรือรายละเอียดชุดเครื่องมือยาวเกินกำหนด' }, 400);
    }

    // Cannot change is_group if this legacy group asset still has children.
    if (before.is_group !== isGroup) {
      const { n } = await db.prepare('SELECT COUNT(*) AS n FROM vcc_assets WHERE parent_id = ?').bind(id).first();
      if (n > 0) {
        return c.json({ error: 'ไม่สามารถเปลี่ยนสถานะกลุ่มได้ เนื่องจากยังมีเครื่องมือลูกผูกอยู่' }, 409);
      }
    }

    // Removing a type from settings must not break existing assets that already use that type.
    if (assetType !== before.asset_type) {
      const types = await loadAssetTypes(db);
      if (types.length > 0 && !types.includes(assetType)) {
        return c.json({ error: `ไม่พบประเภทเครื่องมือ "${assetType}" ในรายการตั้งค่า` }, 400);
      }
    }

    if (department !== before.department) {
      const deptRow = await db.prepare("SELECT 1 FROM departments WHERE code = ? AND status = 'ACTIVE'").bind(department).first();
      if (!deptRow) return c.json({ error: 'ไม่พบแผนกที่ใช้งานอยู่ในระบบ' }, 400);
    }

    const snapshot = (r) => ({
      asset_code: r.asset_code,
      name: r.name,
      asset_type: r.asset_type,
      serial_no: r.serial_no,
      model: r.model,
      location: r.location,
      department: r.department,
      is_group: r.is_group,
      group_nature: r.group_nature || 'LOGICAL_GROUP',
      parent_id: r.parent_id,
      composite_details: r.composite_details || ''
    });
    const afterSnap = {
      asset_code: assetCode,
      name,
      asset_type: assetType,
      serial_no: serialNo,
      model,
      location,
      department,
      is_group: isGroup,
      group_nature: groupNature,
      parent_id: parentId,
      composite_details: compositeDetails
    };

    try {
      await db.batch([
        db.prepare(
          `UPDATE vcc_assets
           SET asset_code = ?, name = ?, asset_type = ?, serial_no = ?, model = ?, location = ?,
               department = ?, is_group = ?, group_nature = ?, parent_id = ?, composite_details = ?, updated_at = ${NOW}, updated_by = ?
           WHERE id = ?`
        ).bind(assetCode, name, assetType, serialNo, model, location, department, isGroup, groupNature, parentId, compositeDetails, user.id, id),
        audit(db, user.id, 'VCC_ASSET_UPDATED', {
          asset_id: id,
          asset_code: assetCode,
          before: snapshot(before),
          after: afterSnap
        })
      ]);
    } catch (err) {
      if (isUnique(err)) return c.json({ error: `รหัสเครื่องมือ ${assetCode} มีอยู่ในระบบแล้ว` }, 409);
      throw err;
    }

    return c.json({ asset: await fetchAsset(db, id) });
  };

  app.put('/api/vcc/assets/:id', requireAuth, requireDccOnly, updateAsset);
  app.patch('/api/vcc/assets/:id', requireAuth, requireDccOnly, updateAsset);

  app.post('/api/vcc/assets/:id/retire', requireAuth, requireDccOnly, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const reason = clean(body.reason, 500);
    if (!reason) return c.json({ error: 'กรุณาระบุเหตุผลในการปลดออกเครื่องมือ' }, 400);

    const before = await db.prepare('SELECT * FROM vcc_assets WHERE id = ?').bind(id).first();
    if (!before) return c.json({ error: 'ไม่พบเครื่องมือ' }, 404);
    if (before.status === 'RETIRED') return c.json({ error: 'เครื่องมือนี้ถูกปลดออกไปแล้ว' }, 409);

    const { n: activeChildren } = await db.prepare(
      "SELECT COUNT(*) AS n FROM vcc_assets WHERE parent_id = ? AND status = 'ACTIVE'"
    ).bind(id).first();
    if (activeChildren > 0) {
      return c.json({ error: 'ไม่สามารถปลดออกกลุ่มเครื่องมือได้ เนื่องจากยังมีเครื่องมือลูกที่ใช้งานอยู่ (ACTIVE)' }, 409);
    }

    await db.batch([
      db.prepare(
        `UPDATE vcc_assets
         SET status = 'RETIRED', retired_reason = ?, retired_at = ${NOW}, retired_by = ?, updated_at = ${NOW}, updated_by = ?
         WHERE id = ?`
      ).bind(reason, user.id, user.id, id),
      audit(db, user.id, 'VCC_ASSET_RETIRED', {
        asset_id: id,
        asset_code: before.asset_code,
        name: before.name,
        reason,
        before: { status: before.status },
        after: { status: 'RETIRED' }
      })
    ]);

    return c.json({ asset: await fetchAsset(db, id) });
  });

  app.post('/api/vcc/assets/:id/reactivate', requireAuth, requireDccOnly, async (c) => {
    const db = c.env.DB;
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const reason = clean(body.reason, 500);
    if (!reason) return c.json({ error: 'กรุณาระบุเหตุผลในการนำเครื่องมือกลับมาใช้งาน' }, 400);

    const before = await db.prepare('SELECT * FROM vcc_assets WHERE id = ?').bind(id).first();
    if (!before) return c.json({ error: 'ไม่พบเครื่องมือ' }, 404);
    if (before.status !== 'RETIRED') return c.json({ error: 'เครื่องมือนี้ไม่ได้อยู่ในสถานะปลดออก' }, 409);

    await db.batch([
      db.prepare(
        `UPDATE vcc_assets
         SET status = 'ACTIVE', retired_reason = NULL, retired_at = NULL, retired_by = NULL, updated_at = ${NOW}, updated_by = ?
         WHERE id = ?`
      ).bind(user.id, id),
      audit(db, user.id, 'VCC_ASSET_REACTIVATED', {
        asset_id: id,
        asset_code: before.asset_code,
        name: before.name,
        reason,
        before: { status: before.status, retired_reason: before.retired_reason },
        after: { status: 'ACTIVE' }
      })
    ]);

    return c.json({ asset: await fetchAsset(db, id) });
  });

  registerVccPlanRoutes(app, { requireAuth, audit });
  registerVccWorkOrderRoutes(app, { requireAuth, audit });
  registerVccDashboardRoutes(app, { requireAuth, audit });
};

