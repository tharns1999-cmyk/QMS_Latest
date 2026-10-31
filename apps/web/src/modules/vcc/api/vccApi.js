import { apiGet, apiPost, apiPut, isApiMode } from '../../../api/client';
import useStore from '../../../store/useStore';

const STORAGE_ASSETS_KEY = 'qms-vcc-local-assets-v1';
const STORAGE_TYPES_KEY = 'qms-vcc-local-types-v1';
const STORAGE_AUDIT_KEY = 'qms-vcc-local-audit-v1';

export const DEFAULT_VCC_ASSET_TYPES = [
  'เทอร์โมมิเตอร์',
  'เครื่องชั่ง',
  'ตุ้มน้ำหนักมาตรฐาน',
  'Temperature Controller',
  'เครื่องตรวจจับโลหะ',
  'นาฬิกาจับเวลา',
  'เวอร์เนียร์คาลิปเปอร์',
  'เครื่องวัดคุณภาพน้ำ/น้ำมัน'
];

const INITIAL_LOCAL_ASSETS = [
  {
    id: 'vcc-seed-st002',
    asset_code: 'ST002',
    name: '[ข้อมูลทดสอบ] เทอร์โมมิเตอร์มาตรฐาน ST002',
    asset_type: 'เทอร์โมมิเตอร์',
    serial_no: '40717388',
    model: 'Testo 176T4',
    location: 'ห้องปฏิบัติการ QC',
    department: 'QC',
    is_group: 0,
    group_nature: 'LOGICAL_GROUP',
    parent_id: null,
    status: 'ACTIVE',
    retired_reason: null,
    retired_at: null,
    retired_by: null,
    created_at: '2026-10-28T02:00:00.000Z',
    created_by: 'dc4',
    updated_at: '2026-10-28T02:00:00.000Z',
    updated_by: 'dc4'
  },
  {
    id: 'vcc-seed-sw001',
    asset_code: 'SW001',
    name: '[ข้อมูลทดสอบ] ตุ้มน้ำหนักมาตรฐานชุด 100 mg - 500 g (Class E2)',
    asset_type: 'ตุ้มน้ำหนักมาตรฐาน',
    serial_no: '',
    model: 'Class E2',
    location: 'ห้องปฏิบัติการ QC',
    department: 'QC',
    is_group: 0,
    group_nature: 'COMPOSITE_SET',
    parent_id: null,
    composite_details: 'ตุ้มน้ำหนักมาตรฐาน 100 mg - 500 g (Class E2)',
    status: 'ACTIVE',
    retired_reason: null,
    retired_at: null,
    retired_by: null,
    created_at: '2026-10-28T02:00:00.000Z',
    created_by: 'dc4',
    updated_at: '2026-10-28T02:00:00.000Z',
    updated_by: 'dc4'
  },
  {
    id: 'vcc-seed-tc001',
    asset_code: 'TC001',
    name: '[ข้อมูลทดสอบ] Temperature Controller ห้องเย็น F1',
    asset_type: 'Temperature Controller',
    serial_no: '',
    model: 'Dixell (Xweb) / XR120C',
    location: 'ห้องเย็น F1',
    department: 'QC',
    is_group: 0,
    group_nature: 'LOGICAL_GROUP',
    parent_id: null,
    status: 'ACTIVE',
    retired_reason: null,
    retired_at: null,
    retired_by: null,
    created_at: '2026-10-28T02:00:00.000Z',
    created_by: 'dc4',
    updated_at: '2026-10-28T02:00:00.000Z',
    updated_by: 'dc4'
  },
  {
    id: 'vcc-seed-grp-scale',
    asset_code: 'GRP-SCALE',
    name: '[ข้อมูลทดสอบ] กลุ่มเครื่องชั่งฝ่ายคลังสินค้า',
    asset_type: 'เครื่องชั่ง',
    serial_no: '',
    model: '',
    location: 'คลังสินค้า (WH)',
    department: 'WH',
    is_group: 1,
    group_nature: 'LOGICAL_GROUP',
    parent_id: null,
    status: 'ACTIVE',
    retired_reason: null,
    retired_at: null,
    retired_by: null,
    created_at: '2026-10-28T02:00:00.000Z',
    created_by: 'dc4',
    updated_at: '2026-10-28T02:00:00.000Z',
    updated_by: 'dc4'
  },
  {
    id: 'vcc-seed-sc001',
    asset_code: 'SC-WH-001',
    name: '[ข้อมูลทดสอบ] เครื่องชั่งดิจิทัล จุดรับวัตถุดิบ 1',
    asset_type: 'เครื่องชั่ง',
    serial_no: 'SN-WH-001',
    model: 'Mettler Toledo',
    location: 'จุดรับวัตถุดิบ WH',
    department: 'WH',
    is_group: 0,
    parent_id: 'vcc-seed-grp-scale',
    status: 'ACTIVE',
    retired_reason: null,
    retired_at: null,
    retired_by: null,
    created_at: '2026-10-28T02:00:00.000Z',
    created_by: 'dc4',
    updated_at: '2026-10-28T02:00:00.000Z',
    updated_by: 'dc4'
  },
  {
    id: 'vcc-seed-retired',
    asset_code: 'T-OLD-01',
    name: '[ข้อมูลทดสอบ] เทอร์โมมิเตอร์รุ่นเก่า (ตัวอย่างปลดออก)',
    asset_type: 'เทอร์โมมิเตอร์',
    serial_no: 'SN-OLD-99',
    model: 'Testo รุ่นเดิม',
    location: 'คลังเก็บเครื่องมือปลดระวาง',
    department: 'QC',
    is_group: 0,
    group_nature: 'LOGICAL_GROUP',
    parent_id: null,
    status: 'RETIRED',
    retired_reason: '[ข้อมูลทดสอบ] หน้าจอชำรุด ไม่คุ้มซ่อม',
    retired_at: '2026-10-28T02:30:00.000Z',
    retired_by: 'dc4',
    created_at: '2026-10-28T02:00:00.000Z',
    created_by: 'dc4',
    updated_at: '2026-10-28T02:30:00.000Z',
    updated_by: 'dc4'
  },
  {
    id: 'vcc-seed-grp-vernier',
    asset_code: 'GRP-VERNIER',
    name: '[ข้อมูลทดสอบ] กลุ่มเวอร์เนียร์คาลิปเปอร์ (Vernier Caliper)',
    asset_type: 'เวอร์เนียร์คาลิปเปอร์',
    serial_no: '',
    model: '',
    location: 'ห้องปฏิบัติการ QC',
    department: 'QC',
    is_group: 1,
    group_nature: 'LOGICAL_GROUP',
    parent_id: null,
    status: 'ACTIVE',
    retired_reason: null,
    retired_at: null,
    retired_by: null,
    created_at: '2026-10-28T02:00:00.000Z',
    created_by: 'dc4',
    updated_at: '2026-10-28T02:00:00.000Z',
    updated_by: 'dc4'
  },
  {
    id: 'vcc-seed-v001',
    asset_code: 'V001',
    name: '[ข้อมูลทดสอบ] เวอร์เนียร์คาลิปเปอร์ V001 (ทวนสอบเดือน 2)',
    asset_type: 'เวอร์เนียร์คาลิปเปอร์',
    serial_no: 'VN-001',
    model: 'Mitutoyo',
    location: 'ห้องปฏิบัติการ QC',
    department: 'QC',
    is_group: 0,
    parent_id: 'vcc-seed-grp-vernier',
    status: 'ACTIVE',
    retired_reason: null,
    retired_at: null,
    retired_by: null,
    created_at: '2026-10-28T02:00:00.000Z',
    created_by: 'dc4',
    updated_at: '2026-10-28T02:00:00.000Z',
    updated_by: 'dc4'
  },
  {
    id: 'vcc-seed-v002',
    asset_code: 'V002',
    name: '[ข้อมูลทดสอบ] เวอร์เนียร์คาลิปเปอร์ V002 (ทวนสอบเดือน 9)',
    asset_type: 'เวอร์เนียร์คาลิปเปอร์',
    serial_no: 'VN-002',
    model: 'Mitutoyo',
    location: 'ห้องปฏิบัติการ QC',
    department: 'QC',
    is_group: 0,
    parent_id: 'vcc-seed-grp-vernier',
    status: 'ACTIVE',
    retired_reason: null,
    retired_at: null,
    retired_by: null,
    created_at: '2026-10-28T02:00:00.000Z',
    created_by: 'dc4',
    updated_at: '2026-10-28T02:00:00.000Z',
    updated_by: 'dc4'
  }
];

const memoryStore = new Map();

export const resetVccLocalStore = () => {
  memoryStore.clear();
  try {
    localStorage.removeItem(STORAGE_ASSETS_KEY);
    localStorage.removeItem(STORAGE_TYPES_KEY);
    localStorage.removeItem(STORAGE_AUDIT_KEY);
    localStorage.removeItem('qms-vcc-local-plans-v1');
    localStorage.removeItem('qms-vcc-local-plan-items-v1');
    localStorage.removeItem('qms-vcc-local-providers-v1');
    localStorage.removeItem('qms-vcc-local-plan-settings-v1');
    localStorage.removeItem('qms-vcc-local-work-orders-v1');
    localStorage.removeItem('qms-vcc-local-wo-settings-v1');
    localStorage.removeItem('qms-vcc-local-notification-settings-v1');
  } catch {
    // ignore storage errors in test environments
  }
};

export const readJson = (key, fallback) => {
  try {
    const raw = typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function' ? localStorage.getItem(key) : null;
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback to memoryStore
  }
  if (memoryStore.has(key)) return JSON.parse(memoryStore.get(key));
  const initial = fallback();
  memoryStore.set(key, JSON.stringify(initial));
  return initial;
};

export const writeJson = (key, value) => {
  const serialized = JSON.stringify(value);
  memoryStore.set(key, serialized);
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
      localStorage.setItem(key, serialized);
    }
  } catch {
    // ignore storage errors in test environments
  }
};

const buildSeedAudit = () =>
  INITIAL_LOCAL_ASSETS.flatMap((a, idx) => {
    const createdEntry = {
      id: idx * 2 + 1,
      at: a.created_at,
      actor_id: 'dc4',
      actor_name: 'DC หัวหน้า (DCC)',
      action: 'VCC_ASSET_CREATED',
      details: {
        asset_id: a.id,
        asset_code: a.asset_code,
        name: a.name,
        asset_type: a.asset_type,
        department: a.department,
        is_group: a.is_group,
        parent_id: a.parent_id,
        status: 'ACTIVE'
      }
    };
    if (a.status !== 'RETIRED') return [createdEntry];
    return [
      createdEntry,
      {
        id: idx * 2 + 2,
        at: a.retired_at,
        actor_id: 'dc4',
        actor_name: 'DC หัวหน้า (DCC)',
        action: 'VCC_ASSET_RETIRED',
        details: {
          asset_id: a.id,
          asset_code: a.asset_code,
          name: a.name,
          reason: a.retired_reason,
          before: { status: 'ACTIVE' },
          after: { status: 'RETIRED' }
        }
      }
    ];
  });

export const getLocalAssets = () => readJson(STORAGE_ASSETS_KEY, () => [...INITIAL_LOCAL_ASSETS]);
const setLocalAssets = (list) => writeJson(STORAGE_ASSETS_KEY, list);
const getLocalTypes = () => readJson(STORAGE_TYPES_KEY, () => [...DEFAULT_VCC_ASSET_TYPES]);
const setLocalTypes = (list) => writeJson(STORAGE_TYPES_KEY, list);
export const getLocalAudit = () => readJson(STORAGE_AUDIT_KEY, buildSeedAudit);
export const appendLocalAudit = (action, details) => {
  const user = useStore.getState().currentUser;
  const list = getLocalAudit();
  const nextId = list.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;
  list.push({
    id: nextId,
    at: new Date().toISOString(),
    actor_id: user?.id || 'dcc',
    actor_name: user?.name || 'DCC',
    actor_email: user?.email || '',
    action,
    details
  });
  writeJson(STORAGE_AUDIT_KEY, list);
};

export const isVccAuthorized = (user) => {
  if (!user) return false;
  if (user.isDcc || user.isQmr) return true;
  const userDepts = [user.department, ...(user.depts || [])]
    .filter(Boolean)
    .map((d) => String(d).toUpperCase());
  return userDepts.some((d) => ['DC', 'QC', 'QA'].includes(d));
};

export const assertLocalVccAccess = () => {
  const user = useStore.getState().currentUser;
  if (!isVccAuthorized(user)) {
    throw new Error('เฉพาะผู้ใช้งานแผนก DCC, QC และ QA เท่านั้นที่สามารถเข้าใช้งานส่วนนี้ได้');
  }
  return user;
};

export const assertLocalDcc = () => {
  const user = useStore.getState().currentUser;
  const isDcc = Boolean(user?.isDcc);
  if (!isDcc) throw new Error('เฉพาะ DCC เท่านั้นที่สามารถตั้งค่าหรือจัดการข้อมูลส่วนนี้ได้');
  return user;
};

export const getDepartmentMap = () => {
  const state = useStore.getState();
  const depts = state.masterDepartments || state.departments || [];
  const map = {};
  for (const d of depts) {
    const code = d.code || d.deptCode || d.id;
    if (code) map[code] = d.name_th || d.nameTh || d.name || code;
  }
  return map;
};

const enrichLocalAsset = (asset, allAssets, deptMap) => {
  const parent = asset.parent_id ? allAssets.find((p) => p.id === asset.parent_id) : null;
  const children = allAssets.filter((c) => c.parent_id === asset.id);
  const activeChildren = children.filter((c) => c.status === 'ACTIVE');
  return {
    ...asset,
    composite_details: asset.composite_details || '',
    department_name_th: deptMap[asset.department] || asset.department,
    parent_asset_code: parent?.asset_code || null,
    parent_name: parent?.name || null,
    parent_status: parent?.status || null,
    child_count: children.length,
    active_child_count: activeChildren.length
  };
};

export const fetchVccAssetTypes = async () => {
  if (isApiMode) {
    const { assetTypes } = await apiGet('/api/vcc/asset-types');
    return assetTypes || DEFAULT_VCC_ASSET_TYPES;
  }
  assertLocalVccAccess();
  return getLocalTypes();
};

export const saveVccAssetTypes = async (assetTypes) => {
  if (isApiMode) {
    const res = await apiPut('/api/vcc/asset-types', { assetTypes });
    return res.assetTypes;
  }
  assertLocalDcc();
  const cleaned = (assetTypes || []).map((t) => String(t || '').trim()).filter(Boolean);
  if (cleaned.length === 0 || new Set(cleaned).size !== cleaned.length) {
    throw new Error('ชื่อประเภทเครื่องมือต้องไม่ว่าง และห้ามซ้ำกัน');
  }
  const before = getLocalTypes();
  setLocalTypes(cleaned);
  appendLocalAudit('VCC_ASSET_TYPES_UPDATED', { before, after: cleaned });
  return cleaned;
};

export const fetchVccAssets = async ({
  status = 'ACTIVE',
  department = '',
  asset_type = '',
  parent_id = '',
  is_group = '',
  calibratable_only = false,
  include_logical_groups = false,
  logical_groups_only = false,
  q = ''
} = {}) => {
  if (isApiMode) {
    const params = new URLSearchParams();
    params.set('status', status);
    if (department) params.set('department', department);
    if (asset_type) params.set('asset_type', asset_type);
    if (parent_id) params.set('parent_id', parent_id);
    if (calibratable_only) params.set('calibratable_only', '1');
    if (include_logical_groups) params.set('include_logical_groups', '1');
    if (logical_groups_only) params.set('logical_groups_only', '1');
    if (is_group !== '' && is_group !== undefined && is_group !== null) params.set('is_group', String(is_group));
    if (q) params.set('q', q);
    const { assets } = await apiGet(`/api/vcc/assets?${params.toString()}`);
    return assets;
  }
  assertLocalVccAccess();
  const all = getLocalAssets();
  const deptMap = getDepartmentMap();
  const needle = String(q || '').trim().toLowerCase();
  return all
    .filter((a) => a.status === status)
    .filter((a) => (!department ? true : a.department === department))
    .filter((a) => (!asset_type ? true : a.asset_type === asset_type))
    .filter((a) => (!parent_id ? true : a.parent_id === parent_id))
    .filter((a) => {
      if (logical_groups_only) {
        return a.is_group === 1 && (a.group_nature === 'LOGICAL_GROUP' || !a.group_nature);
      }
      if (String(is_group) === '1') {
        return a.is_group === 1;
      }
      if (!include_logical_groups) {
        return a.is_group === 0 || a.group_nature === 'COMPOSITE_SET';
      }
      return true;
    })
    .filter((a) => {
      if (!needle) return true;
      return [a.asset_code, a.name, a.serial_no, a.model, a.location, a.department, a.asset_type, a.composite_details]
        .some((f) => String(f || '').toLowerCase().includes(needle));
    })
    .map((a) => enrichLocalAsset(a, all, deptMap))
    .sort((a, b) => {
      if (include_logical_groups) {
        return (b.is_group - a.is_group) || a.asset_code.localeCompare(b.asset_code);
      }
      return a.asset_code.localeCompare(b.asset_code);
    });
};

export const fetchVccAssetDetail = async (id) => {
  if (isApiMode) {
    return apiGet(`/api/vcc/assets/${encodeURIComponent(id)}`);
  }
  assertLocalVccAccess();
  const all = getLocalAssets();
  const deptMap = getDepartmentMap();
  const target = all.find((a) => a.id === id);
  if (!target) throw new Error('ไม่พบเครื่องมือ');
  const asset = enrichLocalAsset(target, all, deptMap);
  const children = all
    .filter((c) => c.parent_id === id)
    .map((c) => enrichLocalAsset(c, all, deptMap))
    .sort((a, b) => a.asset_code.localeCompare(b.asset_code));
  const history = getLocalAudit()
    .filter((h) => String(h.action || '').startsWith('VCC_ASSET_') && h.details?.asset_id === id)
    .sort((a, b) => b.id - a.id);
  return { asset, children, history };
};

export const createVccAsset = async (payload) => {
  if (isApiMode) {
    const { asset } = await apiPost('/api/vcc/assets', payload);
    return asset;
  }
  const user = assertLocalDcc();
  const all = getLocalAssets();
  const assetCode = String(payload.asset_code || '').trim().toUpperCase();
  const name = String(payload.name || '').trim();
  const assetType = String(payload.asset_type || '').trim();
  const department = String(payload.department || '').trim().toUpperCase();
  const serialNo = String(payload.serial_no || '').trim();
  const model = String(payload.model || '').trim();
  const location = String(payload.location || '').trim();
  const compositeDetails = String(payload.composite_details || '').trim();
  const wantsLogicalGroup = Boolean(payload.is_group) && payload.group_nature !== 'COMPOSITE_SET';
  const hasParentInput = payload.parent_id !== undefined && payload.parent_id !== null && String(payload.parent_id).trim() !== '';
  const isGroup = 0;
  const groupNature = payload.group_nature === 'COMPOSITE_SET' ? 'COMPOSITE_SET' : 'LOGICAL_GROUP';
  const parentId = null;

  if (wantsLogicalGroup) {
    throw new Error('ยกเลิกการสร้างกลุ่มเครื่องมือแม่ (Logical Group) แล้ว กรุณาขึ้นทะเบียนเป็นเครื่องมือรายตัว หรือชุดเครื่องมือจริง (Composite Set)');
  }
  if (hasParentInput) {
    throw new Error('ยกเลิกการผูกเครื่องมือเข้ากับกลุ่มแม่ (Parent-Child) แล้ว กรุณาขึ้นทะเบียนเป็นเครื่องมืออิสระ');
  }
  if (!assetCode || !/^[A-Z0-9._/-]{1,50}$/.test(assetCode)) {
    throw new Error('รหัสเครื่องมือไม่ถูกต้อง (ใช้ A-Z, 0-9, ., _, /, - ไม่เกิน 50 ตัวอักษร)');
  }
  if (!name) throw new Error('กรุณาระบุชื่อเครื่องมือ');
  if (!assetType) throw new Error('กรุณาระบุประเภทเครื่องมือ');
  if (!department) throw new Error('กรุณาระบุแผนกเจ้าของเครื่องมือ');
  if (all.some((a) => a.asset_code.toUpperCase() === assetCode)) {
    throw new Error(`รหัสเครื่องมือ ${assetCode} มีอยู่ในระบบแล้ว`);
  }

  const now = new Date().toISOString();
  const created = {
    id: `vcc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
    status: 'ACTIVE',
    retired_reason: null,
    retired_at: null,
    retired_by: null,
    created_at: now,
    created_by: user?.id || 'dcc',
    updated_at: now,
    updated_by: user?.id || 'dcc'
  };
  const next = [...all, created];
  setLocalAssets(next);
  appendLocalAudit('VCC_ASSET_CREATED', {
    asset_id: created.id,
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
  });
  return enrichLocalAsset(created, next, getDepartmentMap());
};

export const updateVccAsset = async (id, payload) => {
  if (isApiMode) {
    const { asset } = await apiPut(`/api/vcc/assets/${encodeURIComponent(id)}`, payload);
    return asset;
  }
  const user = assertLocalDcc();
  const all = getLocalAssets();
  const index = all.findIndex((a) => a.id === id);
  if (index === -1) throw new Error('ไม่พบเครื่องมือ');
  const before = all[index];
  if (before.status === 'RETIRED') {
    throw new Error('เครื่องมือที่ปลดออกแล้วไม่สามารถแก้ไขได้ กรุณานำกลับมาใช้งานก่อน');
  }

  const assetCode = payload.asset_code === undefined ? before.asset_code : String(payload.asset_code || '').trim().toUpperCase();
  const name = payload.name === undefined ? before.name : String(payload.name || '').trim();
  const assetType = payload.asset_type === undefined ? before.asset_type : String(payload.asset_type || '').trim();
  const department = payload.department === undefined ? before.department : String(payload.department || '').trim().toUpperCase();
  const serialNo = payload.serial_no === undefined ? before.serial_no : String(payload.serial_no || '').trim();
  const model = payload.model === undefined ? before.model : String(payload.model || '').trim();
  const location = payload.location === undefined ? before.location : String(payload.location || '').trim();
  const compositeDetails = payload.composite_details === undefined ? (before.composite_details || '') : String(payload.composite_details || '').trim();
  const groupNature = payload.group_nature === undefined ? (before.group_nature || 'LOGICAL_GROUP') : (payload.group_nature === 'COMPOSITE_SET' ? 'COMPOSITE_SET' : 'LOGICAL_GROUP');

  const requestedIsGroup = payload.is_group === undefined ? before.is_group : (payload.is_group ? 1 : 0);
  if (before.is_group === 0 && requestedIsGroup === 1 && groupNature !== 'COMPOSITE_SET') {
    throw new Error('ไม่สามารถแปลงเครื่องมือรายตัวเป็นกลุ่มเครื่องมือแม่ (Logical Group) ได้');
  }
  const isGroup = before.is_group === 1 && groupNature !== 'COMPOSITE_SET' ? requestedIsGroup : 0;

  const hasNewParentInput = payload.parent_id !== undefined && payload.parent_id !== null && String(payload.parent_id).trim() !== '' && payload.parent_id !== before.parent_id;
  if (hasNewParentInput) {
    throw new Error('ยกเลิกการผูกเครื่องมือเข้ากับกลุ่มแม่ (Parent-Child) แล้ว');
  }
  const parentId = payload.parent_id === undefined ? before.parent_id : (payload.parent_id ? String(payload.parent_id).trim() : null);

  if (!assetCode || !/^[A-Z0-9._/-]{1,50}$/.test(assetCode)) {
    throw new Error('รหัสเครื่องมือไม่ถูกต้อง (ใช้ A-Z, 0-9, ., _, /, - ไม่เกิน 50 ตัวอักษร)');
  }
  if (!name) throw new Error('กรุณาระบุชื่อเครื่องมือ');
  if (!assetType) throw new Error('กรุณาระบุประเภทเครื่องมือ');
  if (!department) throw new Error('กรุณาระบุแผนกเจ้าของเครื่องมือ');
  if (all.some((a) => a.id !== id && a.asset_code.toUpperCase() === assetCode)) {
    throw new Error(`รหัสเครื่องมือ ${assetCode} มีอยู่ในระบบแล้ว`);
  }
  if (before.is_group !== isGroup && all.some((c) => c.parent_id === id)) {
    throw new Error('ไม่สามารถเปลี่ยนสถานะกลุ่มได้ เนื่องจากยังมีเครื่องมือลูกผูกอยู่');
  }

  const updated = {
    ...before,
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
    updated_at: new Date().toISOString(),
    updated_by: user?.id || 'dcc'
  };
  const next = [...all];
  next[index] = updated;
  setLocalAssets(next);
  appendLocalAudit('VCC_ASSET_UPDATED', {
    asset_id: id,
    asset_code: assetCode,
    before: {
      asset_code: before.asset_code,
      name: before.name,
      asset_type: before.asset_type,
      serial_no: before.serial_no,
      model: before.model,
      location: before.location,
      department: before.department,
      is_group: before.is_group,
      group_nature: before.group_nature || 'LOGICAL_GROUP',
      parent_id: before.parent_id,
      composite_details: before.composite_details || ''
    },
    after: {
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
    }
  });
  return enrichLocalAsset(updated, next, getDepartmentMap());
};

export const retireVccAsset = async (id, reason) => {
  if (isApiMode) {
    const { asset } = await apiPost(`/api/vcc/assets/${encodeURIComponent(id)}/retire`, { reason });
    return asset;
  }
  const user = assertLocalDcc();
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw new Error('กรุณาระบุเหตุผลในการปลดออกเครื่องมือ');
  const all = getLocalAssets();
  const index = all.findIndex((a) => a.id === id);
  if (index === -1) throw new Error('ไม่พบเครื่องมือ');
  const before = all[index];
  if (before.status === 'RETIRED') throw new Error('เครื่องมือนี้ถูกปลดออกไปแล้ว');
  if (all.some((c) => c.parent_id === id && c.status === 'ACTIVE')) {
    throw new Error('ไม่สามารถปลดออกกลุ่มเครื่องมือได้ เนื่องจากยังมีเครื่องมือลูกที่ใช้งานอยู่ (ACTIVE)');
  }
  const now = new Date().toISOString();
  const updated = {
    ...before,
    status: 'RETIRED',
    retired_reason: cleanReason,
    retired_at: now,
    retired_by: user?.id || 'dcc',
    updated_at: now,
    updated_by: user?.id || 'dcc'
  };
  const next = [...all];
  next[index] = updated;
  setLocalAssets(next);
  appendLocalAudit('VCC_ASSET_RETIRED', {
    asset_id: id,
    asset_code: before.asset_code,
    name: before.name,
    reason: cleanReason,
    before: { status: before.status },
    after: { status: 'RETIRED' }
  });
  return enrichLocalAsset(updated, next, getDepartmentMap());
};

export const reactivateVccAsset = async (id, reason) => {
  if (isApiMode) {
    const { asset } = await apiPost(`/api/vcc/assets/${encodeURIComponent(id)}/reactivate`, { reason });
    return asset;
  }
  const user = assertLocalDcc();
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw new Error('กรุณาระบุเหตุผลในการนำเครื่องมือกลับมาใช้งาน');
  const all = getLocalAssets();
  const index = all.findIndex((a) => a.id === id);
  if (index === -1) throw new Error('ไม่พบเครื่องมือ');
  const before = all[index];
  if (before.status !== 'RETIRED') throw new Error('เครื่องมือนี้ไม่ได้อยู่ในสถานะปลดออก');
  const now = new Date().toISOString();
  const updated = {
    ...before,
    status: 'ACTIVE',
    retired_reason: null,
    retired_at: null,
    retired_by: null,
    updated_at: now,
    updated_by: user?.id || 'dcc'
  };
  const next = [...all];
  next[index] = updated;
  setLocalAssets(next);
  appendLocalAudit('VCC_ASSET_REACTIVATED', {
    asset_id: id,
    asset_code: before.asset_code,
    name: before.name,
    reason: cleanReason,
    before: { status: before.status, retired_reason: before.retired_reason },
    after: { status: 'ACTIVE' }
  });
  return enrichLocalAsset(updated, next, getDepartmentMap());
};
