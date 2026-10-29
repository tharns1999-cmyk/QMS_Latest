import { apiGet, apiPost, apiPut, isApiMode } from '../../../api/client';
import useStore from '../../../store/useStore';
import {
  readJson,
  writeJson,
  getLocalAssets,
  getDepartmentMap,
  assertLocalDcc,
  assertLocalVccAccess,
  getLocalAudit,
  appendLocalAudit
} from './vccApi';

const STORAGE_PLANS_KEY = 'qms-vcc-local-plans-v1';
const STORAGE_PLAN_ITEMS_KEY = 'qms-vcc-local-plan-items-v1';
const STORAGE_PROVIDERS_KEY = 'qms-vcc-local-providers-v1';
const STORAGE_PLAN_SETTINGS_KEY = 'qms-vcc-local-plan-settings-v1';

export const DEFAULT_VCC_PROVIDERS = [
  'ห้องปฏิบัติการภายนอก',
  'ทวนสอบภายใน',
  'บ.ยูโรแพค จำกัด'
];

export const DEFAULT_VCC_PLAN_SETTINGS = {
  default_doc_code: 'FM-QC-46',
  approval_doc_type: 'FM',
  due_date_rule: 'END_OF_MONTH'
};

export const computeDueDateForMonth = (year, month, rule = 'END_OF_MONTH') => {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;
  const mm = String(m).padStart(2, '0');
  if (rule === 'START_OF_MONTH') {
    return `${y}-${mm}-01`;
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${mm}-${String(lastDay).padStart(2, '0')}`;
};

export const computeDueDates = (year, plannedMonths, rule = 'END_OF_MONTH') =>
  (plannedMonths || [])
    .map((m) => computeDueDateForMonth(year, m, rule))
    .filter(Boolean);

const INITIAL_LOCAL_PLANS = [
  {
    id: 'vcc-plan-2026-qc',
    plan_year: 2026,
    department: 'QC',
    document_code: 'FM-QC-46',
    revision: '01',
    title: '[ข้อมูลทดสอบ] แผนการทวนสอบเครื่องมือประจำปี 2026 (พ.ศ. 2569)',
    status: 'DRAFT',
    due_date_rule: 'END_OF_MONTH',
    prepared_by: null,
    prepared_at: null,
    reviewed_by: null,
    reviewed_at: null,
    review_comment: null,
    approved_by: null,
    approved_at: null,
    approval_comment: null,
    rejected_by: null,
    rejected_at: null,
    rejected_reason: null,
    created_at: '2026-10-28T03:00:00.000Z',
    created_by: 'dc4',
    updated_at: '2026-10-28T03:00:00.000Z',
    updated_by: 'dc4'
  },
  {
    id: 'vcc-plan-2027-qc',
    plan_year: 2027,
    department: 'QC',
    document_code: 'FM-QC-46',
    revision: '01',
    title: '[ข้อมูลทดสอบ] แผนการทวนสอบเครื่องมือประจำปี 2027 (พ.ศ. 2570)',
    status: 'DRAFT',
    due_date_rule: 'END_OF_MONTH',
    prepared_by: null,
    prepared_at: null,
    reviewed_by: null,
    reviewed_at: null,
    review_comment: null,
    approved_by: null,
    approved_at: null,
    approval_comment: null,
    rejected_by: null,
    rejected_at: null,
    rejected_reason: null,
    created_at: '2026-10-28T03:00:00.000Z',
    created_by: 'dc4',
    updated_at: '2026-10-28T03:00:00.000Z',
    updated_by: 'dc4'
  }
];

const INITIAL_LOCAL_PLAN_ITEMS = [
  {
    id: 'vcc-pi-2026-st002',
    plan_id: 'vcc-plan-2026-qc',
    asset_id: 'vcc-seed-st002',
    provider_name: 'ห้องปฏิบัติการภายนอก',
    frequency_label: 'รายปี',
    planned_months: [3],
    due_dates: ['2026-03-31'],
    responsible_dept: 'QC',
    responsible_label: 'QC Sup.',
    remarks: '[ข้อมูลทดสอบ] ทวนสอบประจำปี',
    sort_order: 1
  },
  {
    id: 'vcc-pi-2026-sw001',
    plan_id: 'vcc-plan-2026-qc',
    asset_id: 'vcc-seed-sw001',
    provider_name: 'ห้องปฏิบัติการภายนอก',
    frequency_label: 'รายปี',
    planned_months: [5],
    due_dates: ['2026-05-31'],
    responsible_dept: 'QC',
    responsible_label: 'QC Sup.',
    remarks: '[ข้อมูลทดสอบ] ตุ้มน้ำหนักมาตรฐาน Class E2',
    sort_order: 2
  },
  {
    id: 'vcc-pi-2026-tc001',
    plan_id: 'vcc-plan-2026-qc',
    asset_id: 'vcc-seed-tc001',
    provider_name: 'ห้องปฏิบัติการภายนอก',
    frequency_label: 'รายปี',
    planned_months: [6],
    due_dates: ['2026-06-30'],
    responsible_dept: 'QC',
    responsible_label: 'QC Sup.',
    remarks: '[ข้อมูลทดสอบ] ห้องเย็น F1',
    sort_order: 3
  },
  {
    id: 'vcc-pi-2026-v001',
    plan_id: 'vcc-plan-2026-qc',
    asset_id: 'vcc-seed-v001',
    provider_name: 'ห้องปฏิบัติการภายนอก',
    frequency_label: 'รายปี',
    planned_months: [2],
    due_dates: ['2026-02-28'],
    responsible_dept: 'QC',
    responsible_label: 'QC Sup.',
    remarks: '[ข้อมูลทดสอบ] V001 ทวนสอบเดือน 2 (ยึดตามหมายเหตุ)',
    sort_order: 4
  },
  {
    id: 'vcc-pi-2026-v002',
    plan_id: 'vcc-plan-2026-qc',
    asset_id: 'vcc-seed-v002',
    provider_name: 'ห้องปฏิบัติการภายนอก',
    frequency_label: 'รายปี',
    planned_months: [9],
    due_dates: ['2026-09-30'],
    responsible_dept: 'QC',
    responsible_label: 'QC Sup.',
    remarks: '[ข้อมูลทดสอบ] V002 ทวนสอบเดือน 9 (ยึดตามหมายเหตุ)',
    sort_order: 5
  },
  {
    id: 'vcc-pi-2026-grp-scale',
    plan_id: 'vcc-plan-2026-qc',
    asset_id: 'vcc-seed-grp-scale',
    provider_name: 'ทวนสอบภายใน',
    frequency_label: 'รายเดือน',
    planned_months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    due_dates: computeDueDates(2026, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'END_OF_MONTH'),
    responsible_dept: 'WH',
    responsible_label: 'เจ้าหน้าที่ Store',
    remarks: '[ข้อมูลทดสอบ] ฝ่าย Store เป็นฝ่ายสอบเทียบ FM-ST-31',
    sort_order: 6
  }
];

export const getLocalPlans = () => readJson(STORAGE_PLANS_KEY, () => [...INITIAL_LOCAL_PLANS]);
const setLocalPlans = (list) => writeJson(STORAGE_PLANS_KEY, list);
export const getLocalPlanItems = () => readJson(STORAGE_PLAN_ITEMS_KEY, () => [...INITIAL_LOCAL_PLAN_ITEMS]);
const setLocalPlanItems = (list) => writeJson(STORAGE_PLAN_ITEMS_KEY, list);
const getLocalProviders = () => readJson(STORAGE_PROVIDERS_KEY, () => [...DEFAULT_VCC_PROVIDERS]);
const setLocalProviders = (list) => writeJson(STORAGE_PROVIDERS_KEY, list);
const getLocalPlanSettings = () => readJson(STORAGE_PLAN_SETTINGS_KEY, () => ({ ...DEFAULT_VCC_PLAN_SETTINGS }));
const setLocalPlanSettings = (obj) => writeJson(STORAGE_PLAN_SETTINGS_KEY, obj);

const getLocalThresholds = (docType = 'FM') => {
  const state = useStore.getState();
  const matrix = state.approvalMatrix || [];
  const found = matrix.find((m) => (m.docType || m.doc_type) === docType);
  if (found) {
    return {
      min_requester_level: Number(found.minRequesterLevel ?? found.min_requester_level ?? 1),
      required_reviewer_level: Number(found.requiredReviewerLevel ?? found.required_reviewer_level ?? 4),
      required_approver_level: Number(found.requiredApproverLevel ?? found.required_approver_level ?? 5)
    };
  }
  const mapByType = {
    QM: { min_requester_level: 4, required_reviewer_level: 6, required_approver_level: 8 },
    SOP: { min_requester_level: 1, required_reviewer_level: 4, required_approver_level: 6 },
    WI: { min_requester_level: 1, required_reviewer_level: 4, required_approver_level: 5 },
    FM: { min_requester_level: 1, required_reviewer_level: 4, required_approver_level: 5 }
  };
  return mapByType[docType] || { min_requester_level: 1, required_reviewer_level: 4, required_approver_level: 5 };
};

const enrichLocalPlan = (plan, allItems, deptMap) => {
  const planItems = allItems.filter((i) => i.plan_id === plan.id);
  const assets = getLocalAssets();
  const groupCount = planItems.filter((i) => {
    const a = assets.find((x) => x.id === i.asset_id);
    return a && Number(a.is_group) === 1;
  }).length;
  return {
    ...plan,
    department_name_th: deptMap[plan.department] || plan.department,
    item_count: planItems.length,
    group_item_count: groupCount
  };
};

const enrichLocalPlanItem = (item, allAssets, deptMap) => {
  const asset = allAssets.find((a) => a.id === item.asset_id) || {};
  const parent = asset.parent_id ? allAssets.find((p) => p.id === asset.parent_id) : null;
  const activeChildren = allAssets.filter((c) => c.parent_id === asset.id && c.status === 'ACTIVE');
  const isGroup = Number(asset.is_group) === 1;
  const closedWos = readJson('qms-vcc-local-work-orders-v1', () => []).filter(
    (w) => w.plan_item_id === item.id && w.status === 'CLOSED' && w.result_status === 'PASS'
  );
  const actualMonths = [...new Set(closedWos.map((w) => Number(w.planned_month)).filter((m) => m >= 1 && m <= 12))].sort((a, b) => a - b);
  const hasEvidence = closedWos.length > 0 && closedWos.every((w) => Boolean(w.certificate_no));
  return {
    ...item,
    asset_code: asset.asset_code || '-',
    asset_name: asset.name || '-',
    asset_type: asset.asset_type || '-',
    serial_no: asset.serial_no || '',
    model: asset.model || '',
    location: asset.location || '',
    asset_department: asset.department || '',
    is_group: isGroup ? 1 : 0,
    parent_id: asset.parent_id || null,
    asset_status: asset.status || 'ACTIVE',
    parent_asset_code: parent?.asset_code || null,
    parent_name: parent?.name || null,
    responsible_dept_name_th: deptMap[item.responsible_dept] || item.responsible_dept,
    active_child_count: activeChildren.length,
    actual_months: actualMonths,
    has_evidence: hasEvidence,
    completion_status: actualMonths.length > 0 ? 'COMPLETED' : 'PLANNED_ONLY',
    requires_child_selection: isGroup,
    work_order_ready: !isGroup && asset.status === 'ACTIVE',
    work_order_block_reason: isGroup
      ? 'เครื่องมือแบบกลุ่มต้องแยกรหัสเครื่องมือรายตัวก่อนสร้างใบสั่งงาน'
      : asset.status !== 'ACTIVE'
        ? 'เครื่องมือไม่ได้อยู่ในสถานะใช้งานปกติ (ACTIVE)'
        : null
  };
};

export const fetchVccPlanSettings = async () => {
  if (isApiMode) {
    return apiGet('/api/vcc/plan-settings');
  }
  assertLocalVccAccess();
  const providers = getLocalProviders();
  const planSettings = getLocalPlanSettings();
  const thresholds = getLocalThresholds(planSettings.approval_doc_type);
  return { providers, planSettings, thresholds };
};

export const saveVccPlanSettings = async ({ providers, planSettings }) => {
  if (isApiMode) {
    return apiPut('/api/vcc/plan-settings', { providers, planSettings });
  }
  assertLocalDcc();
  const beforeProviders = getLocalProviders();
  const beforeSettings = getLocalPlanSettings();

  let nextProviders = beforeProviders;
  if (providers !== undefined) {
    const cleaned = (providers || []).map((p) => String(p || '').trim()).filter(Boolean);
    if (cleaned.length === 0 || new Set(cleaned).size !== cleaned.length) {
      throw new Error('ชื่อหน่วยงาน/วิธีทวนสอบต้องไม่ว่าง และห้ามซ้ำกัน');
    }
    nextProviders = cleaned;
    setLocalProviders(nextProviders);
  }

  let nextSettings = { ...beforeSettings };
  if (planSettings) {
    nextSettings = {
      default_doc_code: String(planSettings.default_doc_code || nextSettings.default_doc_code).trim(),
      approval_doc_type: String(planSettings.approval_doc_type || nextSettings.approval_doc_type).trim().toUpperCase(),
      due_date_rule: String(planSettings.due_date_rule || nextSettings.due_date_rule).trim().toUpperCase()
    };
    setLocalPlanSettings(nextSettings);
  }

  appendLocalAudit('VCC_PLAN_SETTINGS_UPDATED', {
    before: { providers: beforeProviders, planSettings: beforeSettings },
    after: { providers: nextProviders, planSettings: nextSettings }
  });

  return {
    providers: nextProviders,
    planSettings: nextSettings,
    thresholds: getLocalThresholds(nextSettings.approval_doc_type)
  };
};

export const fetchVccPlans = async ({ status = 'DRAFT', year = '', department = '' } = {}) => {
  if (isApiMode) {
    const params = new URLSearchParams();
    params.set('status', status);
    if (year !== '' && year !== undefined && year !== null) params.set('year', String(year));
    if (department) params.set('department', department);
    const { plans } = await apiGet(`/api/vcc/plans?${params.toString()}`);
    return plans;
  }
  assertLocalVccAccess();
  const allPlans = getLocalPlans();
  const allItems = getLocalPlanItems();
  const deptMap = getDepartmentMap();
  return allPlans
    .filter((p) => p.status === status)
    .filter((p) => (year === '' || year === undefined || year === null ? true : Number(p.plan_year) === Number(year)))
    .filter((p) => (!department ? true : p.department === department))
    .map((p) => enrichLocalPlan(p, allItems, deptMap))
    .sort((a, b) => a.plan_year - b.plan_year || a.department.localeCompare(b.department));
};

export const fetchVccPlanDetail = async (id) => {
  if (isApiMode) {
    return apiGet(`/api/vcc/plans/${encodeURIComponent(id)}`);
  }
  assertLocalVccAccess();
  const allPlans = getLocalPlans();
  const allItems = getLocalPlanItems();
  const allAssets = getLocalAssets();
  const deptMap = getDepartmentMap();
  const rawPlan = allPlans.find((p) => p.id === id);
  if (!rawPlan) throw new Error('ไม่พบแผนการสอบเทียบประจำปี');

  const plan = enrichLocalPlan(rawPlan, allItems, deptMap);
  let items = [];
  if (plan.status === 'DRAFT' || plan.status === 'REJECTED') {
    const eligibleAssets = allAssets.filter(
      (a) => a.department === plan.department && a.status !== 'RETIRED'
    );
    const persistedForPlan = allItems.filter((i) => i.plan_id === id);
    const persistedByAssetId = new Map(persistedForPlan.map((i) => [i.asset_id, i]));

    for (const item of persistedForPlan) {
      const asset = allAssets.find((a) => a.id === item.asset_id);
      if (asset && asset.status !== 'RETIRED') {
        items.push(enrichLocalPlanItem({ ...item, is_persisted: 1 }, allAssets, deptMap));
      }
    }

    for (const asset of eligibleAssets) {
      if (!persistedByAssetId.has(asset.id)) {
        const virtualItem = {
          id: `virtual-${asset.id}`,
          plan_id: id,
          asset_id: asset.id,
          provider_name: 'ทวนสอบภายใน',
          frequency_label: 'รายปี',
          planned_months: [],
          due_dates: [],
          responsible_dept: asset.department,
          responsible_label: '',
          remarks: '',
          sort_order: 9999,
          is_persisted: 0
        };
        items.push(enrichLocalPlanItem(virtualItem, allAssets, deptMap));
      }
    }

    items.sort((a, b) => {
      const sortA = (a.sort_order ?? 9999) < 9000 ? a.sort_order : 9000;
      const sortB = (b.sort_order ?? 9999) < 9000 ? b.sort_order : 9000;
      if (sortA !== sortB) return sortA - sortB;
      return (a.asset_code || '').localeCompare(b.asset_code || '');
    });
  } else {
    items = allItems
      .filter((i) => i.plan_id === id)
      .map((i) => enrichLocalPlanItem({ ...i, is_persisted: 1 }, allAssets, deptMap))
      .sort((a, b) => (a.sort_order - b.sort_order) || a.asset_code.localeCompare(b.asset_code));
  }
  const settings = getLocalPlanSettings();
  const thresholds = getLocalThresholds(settings.approval_doc_type);
  const history = getLocalAudit()
    .filter((h) => String(h.action || '').startsWith('VCC_PLAN_') && h.details?.plan_id === id)
    .sort((a, b) => b.id - a.id);

  return { plan, items, thresholds, history };
};

export const createVccPlan = async (payload) => {
  if (isApiMode) {
    const { plan } = await apiPost('/api/vcc/plans', payload);
    return plan;
  }
  const user = assertLocalVccAccess();
  const allPlans = getLocalPlans();
  const planYear = Number(payload.plan_year);
  const department = String(payload.department || '').trim().toUpperCase();
  const settings = getLocalPlanSettings();
  const documentCode = String(payload.document_code || settings.default_doc_code).trim();
  const revision = String(payload.revision || '00').trim();
  const title = String(payload.title || `แผนการทวนสอบเครื่องมือประจำปี ${planYear}`).trim();
  const dueDateRule = String(payload.due_date_rule || settings.due_date_rule).trim().toUpperCase();

  if (!Number.isInteger(planYear) || planYear < 2000 || planYear > 2100) {
    throw new Error('กรุณาระบุปีของแผนประจำปีให้ถูกต้อง');
  }
  if (!department) throw new Error('กรุณาระบุแผนกเจ้าของแผน');
  if (allPlans.some((p) => p.plan_year === planYear && p.department === department && p.revision === revision)) {
    throw new Error(`แผนประจำปี ${planYear} ของแผนก ${department} (Rev.${revision}) มีอยู่ในระบบแล้ว`);
  }

  const now = new Date().toISOString();
  const created = {
    id: `vcc-plan-${Date.now()}`,
    plan_year: planYear,
    department,
    document_code: documentCode,
    revision,
    title,
    status: 'DRAFT',
    due_date_rule: dueDateRule,
    prepared_by: null,
    prepared_at: null,
    reviewed_by: null,
    reviewed_at: null,
    review_comment: null,
    approved_by: null,
    approved_at: null,
    approval_comment: null,
    rejected_by: null,
    rejected_at: null,
    rejected_reason: null,
    created_at: now,
    created_by: user.id,
    updated_at: now,
    updated_by: user.id
  };
  setLocalPlans([...allPlans, created]);
  appendLocalAudit('VCC_PLAN_CREATED', {
    plan_id: created.id,
    plan_year: planYear,
    department,
    document_code: documentCode,
    revision,
    title,
    due_date_rule: dueDateRule,
    status: 'DRAFT'
  });
  return enrichLocalPlan(created, getLocalPlanItems(), getDepartmentMap());
};

export const updateVccPlan = async (id, payload) => {
  if (isApiMode) {
    return apiPut(`/api/vcc/plans/${encodeURIComponent(id)}`, payload);
  }
  const user = assertLocalVccAccess();
  const allPlans = getLocalPlans();
  const idx = allPlans.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error('ไม่พบแผนการสอบเทียบประจำปี');
  const existing = allPlans[idx];
  if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
    throw new Error('แก้ไขข้อมูลแผนได้เฉพาะสถานะร่าง (DRAFT) หรือส่งกลับแก้ไข (REJECTED) เท่านั้น');
  }

  const title = payload.title !== undefined ? String(payload.title).trim() : existing.title;
  const documentCode = payload.document_code !== undefined ? String(payload.document_code).trim() : existing.document_code;
  const revision = payload.revision !== undefined ? String(payload.revision).trim() : existing.revision;
  const dueDateRule = payload.due_date_rule !== undefined ? String(payload.due_date_rule).toUpperCase() : existing.due_date_rule;

  const updated = {
    ...existing,
    title,
    document_code: documentCode,
    revision,
    due_date_rule: dueDateRule,
    updated_at: new Date().toISOString(),
    updated_by: user.id
  };
  const nextPlans = [...allPlans];
  nextPlans[idx] = updated;
  setLocalPlans(nextPlans);

  if (dueDateRule !== existing.due_date_rule) {
    const allItems = getLocalPlanItems().map((it) =>
      it.plan_id === id
        ? { ...it, due_dates: computeDueDates(updated.plan_year, it.planned_months, dueDateRule) }
        : it
    );
    setLocalPlanItems(allItems);
  }

  appendLocalAudit('VCC_PLAN_UPDATED', {
    plan_id: id,
    before: { title: existing.title, due_date_rule: existing.due_date_rule },
    after: { title, due_date_rule: dueDateRule }
  });

  return fetchVccPlanDetail(id);
};

export const saveVccPlanItem = async (planId, payload) => {
  if (isApiMode) {
    return apiPost(`/api/vcc/plans/${encodeURIComponent(planId)}/items`, payload);
  }
  assertLocalVccAccess();
  const allPlans = getLocalPlans();
  const plan = allPlans.find((p) => p.id === planId);
  if (!plan) throw new Error('ไม่พบแผนการสอบเทียบประจำปี');
  if (plan.status !== 'DRAFT' && plan.status !== 'REJECTED') {
    throw new Error('เพิ่มหรือแก้ไขรายการในแผนได้เฉพาะสถานะร่าง (DRAFT) หรือส่งกลับแก้ไข (REJECTED) เท่านั้น');
  }

  const allAssets = getLocalAssets();
  const asset = allAssets.find((a) => a.id === payload.asset_id);
  if (!asset) throw new Error('ไม่พบเครื่องมือที่ระบุในทะเบียนเครื่องมือ');
  if (asset.status !== 'ACTIVE') {
    throw new Error('ไม่สามารถเพิ่มเครื่องมือที่ไม่ได้ใช้งานปกติ (ACTIVE) เข้าแผนประจำปีได้');
  }

  const plannedMonths = [...new Set((payload.planned_months || []).map(Number).filter((m) => m >= 1 && m <= 12))].sort((a, b) => a - b);
  const remarks = String(payload.remarks || '').trim();
  if (plannedMonths.length === 0 && !remarks) {
    throw new Error('กรุณาเลือกเดือนที่วางแผนอย่างน้อย 1 เดือน (1-12) หรือระบุเหตุผลที่ไม่วางแผน');
  }
  const providerName = String(payload.provider_name || '').trim();
  if (!providerName) throw new Error('กรุณาระบุสถาบัน/หน่วยงานที่ทวนสอบ');
  const responsibleDept = String(payload.responsible_dept || '').trim().toUpperCase();
  if (!responsibleDept) throw new Error('กรุณาระบุแผนกผู้รับผิดชอบ');

  const dueDates = computeDueDates(plan.plan_year, plannedMonths, plan.due_date_rule);
  const allItems = getLocalPlanItems();
  const existingIdx = allItems.findIndex((i) => i.plan_id === planId && i.asset_id === asset.id);

  const itemObj = {
    id: existingIdx >= 0 ? allItems[existingIdx].id : `vcc-pi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    plan_id: planId,
    asset_id: asset.id,
    provider_name: providerName,
    frequency_label: String(payload.frequency_label || 'รายปี').trim(),
    planned_months: plannedMonths,
    due_dates: dueDates,
    responsible_dept: responsibleDept,
    responsible_label: String(payload.responsible_label || '').trim(),
    remarks: String(payload.remarks || '').trim(),
    sort_order: existingIdx >= 0 ? allItems[existingIdx].sort_order : allItems.length + 1
  };

  const nextItems = [...allItems];
  if (existingIdx >= 0) {
    nextItems[existingIdx] = itemObj;
  } else {
    nextItems.push(itemObj);
  }
  setLocalPlanItems(nextItems);
  appendLocalAudit('VCC_PLAN_ITEM_SAVED', {
    plan_id: planId,
    item_id: itemObj.id,
    asset_id: asset.id,
    asset_code: asset.asset_code,
    planned_months: plannedMonths,
    due_dates: dueDates
  });

  const detail = await fetchVccPlanDetail(planId);
  return { item: detail.items.find((i) => i.id === itemObj.id), items: detail.items };
};

export const deleteVccPlanItem = async (planId, itemId) => {
  if (isApiMode) {
    return apiPost(`/api/vcc/plans/${encodeURIComponent(planId)}/items/${encodeURIComponent(itemId)}/remove`, {});
  }
  assertLocalVccAccess();
  const allPlans = getLocalPlans();
  const plan = allPlans.find((p) => p.id === planId);
  if (!plan) throw new Error('ไม่พบแผนการสอบเทียบประจำปี');
  if (plan.status !== 'DRAFT' && plan.status !== 'REJECTED') {
    throw new Error('ลบรายการในแผนได้เฉพาะสถานะร่าง (DRAFT) หรือส่งกลับแก้ไข (REJECTED) เท่านั้น');
  }
  const allItems = getLocalPlanItems();
  const target = allItems.find((i) => i.id === itemId && i.plan_id === planId);
  if (!target) throw new Error('ไม่พบรายการเครื่องมือในแผนนี้');
  setLocalPlanItems(allItems.filter((i) => i.id !== itemId));
  appendLocalAudit('VCC_PLAN_ITEM_REMOVED', { plan_id: planId, item_id: itemId, asset_id: target.asset_id });
  const detail = await fetchVccPlanDetail(planId);
  return { items: detail.items };
};

export const validateVccPlanItemWorkOrder = async (planId, itemId, childAssetId = '') => {
  if (isApiMode) {
    return apiPost(`/api/vcc/plans/${encodeURIComponent(planId)}/items/${encodeURIComponent(itemId)}/validate-work-order`, {
      child_asset_id: childAssetId || undefined
    });
  }
  assertLocalVccAccess();
  const detail = await fetchVccPlanDetail(planId);
  const item = detail.items.find((i) => i.id === itemId);
  if (!item) throw new Error('ไม่พบรายการในแผนประจำปี');
  if (item.is_group === 1) {
    if (!childAssetId) {
      throw new Error('เครื่องมือแบบกลุ่มต้องแยกรหัสเครื่องมือรายตัวก่อนสร้างใบสั่งงาน');
    }
    const allAssets = getLocalAssets();
    const child = allAssets.find((a) => a.id === childAssetId && a.parent_id === item.asset_id);
    if (!child || child.status !== 'ACTIVE') {
      throw new Error('ไม่พบเครื่องมือลูกที่ใช้งานปกติ (ACTIVE) ในกลุ่มนี้');
    }
    return { ready: true, target_asset: child, due_dates: item.due_dates };
  }
  return {
    ready: true,
    target_asset: { id: item.asset_id, asset_code: item.asset_code, name: item.asset_name, status: item.asset_status },
    due_dates: item.due_dates
  };
};

export const submitVccPlan = async (planId) => {
  if (isApiMode) {
    const { plan } = await apiPost(`/api/vcc/plans/${encodeURIComponent(planId)}/submit`, {});
    return plan;
  }
  const user = assertLocalVccAccess();
  const allPlans = getLocalPlans();
  const idx = allPlans.findIndex((p) => p.id === planId);
  if (idx === -1) throw new Error('ไม่พบแผนการสอบเทียบประจำปี');
  const plan = allPlans[idx];
  if (plan.status !== 'DRAFT' && plan.status !== 'REJECTED') {
    throw new Error('ส่งทบทวนได้เฉพาะแผนที่อยู่ในสถานะร่าง (DRAFT) หรือส่งกลับแก้ไข (REJECTED) เท่านั้น');
  }
  const detail = await fetchVccPlanDetail(planId);
  const items = detail.items || [];
  if (items.length === 0) {
    throw new Error('กรุณาเพิ่มรายการเครื่องมือในแผนอย่างน้อย 1 รายการก่อนส่งขออนุมัติ');
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
    throw new Error(`กรุณาวางแผนเดือนทวนสอบหรือระบุเหตุผลที่ไม่วางแผนสำหรับเครื่องมือ (${codes}) ก่อนส่งทบทวน`);
  }

  // Freeze scope: persist any virtual items into local plan items
  const allPlanItems = getLocalPlanItems();
  const nextPlanItems = [...allPlanItems];
  for (const item of items) {
    if (String(item.id).startsWith('virtual-') || !allPlanItems.some((pi) => pi.plan_id === planId && pi.asset_id === item.asset_id)) {
      const newId = `vcc-pi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const dueDates = computeDueDates(plan.plan_year, item.planned_months || [], plan.due_date_rule);
      nextPlanItems.push({
        id: newId,
        plan_id: planId,
        asset_id: item.asset_id,
        provider_name: item.provider_name || 'ทวนสอบภายใน',
        frequency_label: item.frequency_label || 'รายปี',
        planned_months: item.planned_months || [],
        due_dates: dueDates,
        responsible_dept: item.responsible_dept || plan.department,
        responsible_label: item.responsible_label || '',
        remarks: item.remarks || '',
        sort_order: item.sort_order ?? 9999
      });
    }
  }
  setLocalPlanItems(nextPlanItems);

  const now = new Date().toISOString();
  const updated = {
    ...plan,
    status: 'PENDING_REVIEW',
    prepared_by: user.id,
    prepared_by_name: user.name,
    prepared_by_position: user.position || 'DCC',
    prepared_at: now,
    reviewed_by: null,
    reviewed_at: null,
    review_comment: null,
    approved_by: null,
    approved_at: null,
    approval_comment: null,
    rejected_by: null,
    rejected_at: null,
    rejected_reason: null,
    updated_at: now,
    updated_by: user.id
  };
  const next = [...allPlans];
  next[idx] = updated;
  setLocalPlans(next);
  appendLocalAudit('VCC_PLAN_SUBMITTED', {
    plan_id: planId,
    plan_year: plan.plan_year,
    before: { status: plan.status },
    after: { status: 'PENDING_REVIEW' }
  });
  return enrichLocalPlan(updated, getLocalPlanItems(), getDepartmentMap());
};

export const reviewVccPlan = async (planId, comment = '') => {
  if (isApiMode) {
    const { plan } = await apiPost(`/api/vcc/plans/${encodeURIComponent(planId)}/review`, { comment });
    return plan;
  }
  const user = useStore.getState().currentUser;
  if (!user) throw new Error('กรุณาเข้าสู่ระบบ');
  const allPlans = getLocalPlans();
  const idx = allPlans.findIndex((p) => p.id === planId);
  if (idx === -1) throw new Error('ไม่พบแผนการสอบเทียบประจำปี');
  const plan = allPlans[idx];
  if (plan.status !== 'PENDING_REVIEW') {
    throw new Error('แผนนี้ไม่อยู่ในสถานะรอทบทวน (PENDING_REVIEW)');
  }
  const settings = getLocalPlanSettings();
  const thresholds = getLocalThresholds(settings.approval_doc_type);
  const userLevel = Number(user.approval_level ?? user.approvalLevel ?? 4);
  if (user.id === plan.prepared_by) {
    throw new Error('ผู้จัดทำไม่สามารถทบทวนแผนของตนเองได้');
  }
  if (userLevel < thresholds.required_reviewer_level) {
    throw new Error(`ผู้ทบทวนต้องมีระดับอนุมัติ L${thresholds.required_reviewer_level} ขึ้นไปตาม Approval Matrix`);
  }
  const now = new Date().toISOString();
  const updated = {
    ...plan,
    status: 'PENDING_APPROVAL',
    reviewed_by: user.id,
    reviewed_by_name: user.name,
    reviewed_by_position: user.position || '',
    reviewed_at: now,
    review_comment: String(comment || '').trim(),
    updated_at: now,
    updated_by: user.id
  };
  const next = [...allPlans];
  next[idx] = updated;
  setLocalPlans(next);
  appendLocalAudit('VCC_PLAN_REVIEWED', {
    plan_id: planId,
    comment: updated.review_comment,
    before: { status: 'PENDING_REVIEW' },
    after: { status: 'PENDING_APPROVAL' }
  });
  return enrichLocalPlan(updated, getLocalPlanItems(), getDepartmentMap());
};

export const approveVccPlan = async (planId, comment = '') => {
  if (isApiMode) {
    const { plan } = await apiPost(`/api/vcc/plans/${encodeURIComponent(planId)}/approve`, { comment });
    return plan;
  }
  const user = useStore.getState().currentUser;
  if (!user) throw new Error('กรุณาเข้าสู่ระบบ');
  const allPlans = getLocalPlans();
  const idx = allPlans.findIndex((p) => p.id === planId);
  if (idx === -1) throw new Error('ไม่พบแผนการสอบเทียบประจำปี');
  const plan = allPlans[idx];
  if (plan.status !== 'PENDING_APPROVAL') {
    throw new Error('แผนนี้ไม่อยู่ในสถานะรออนุมัติ (PENDING_APPROVAL)');
  }
  const settings = getLocalPlanSettings();
  const thresholds = getLocalThresholds(settings.approval_doc_type);
  const userLevel = Number(user.approval_level ?? user.approvalLevel ?? 4);
  if (user.id === plan.prepared_by) {
    throw new Error('ผู้จัดทำไม่สามารถอนุมัติแผนของตนเองได้');
  }
  if (user.id === plan.reviewed_by) {
    throw new Error('ผู้ทบทวนไม่สามารถอนุมัติแผนที่ตนทบทวนได้');
  }
  if (userLevel < thresholds.required_approver_level) {
    throw new Error(`ผู้อนุมัติต้องมีระดับอนุมัติ L${thresholds.required_approver_level} ขึ้นไปตาม Approval Matrix`);
  }
  const now = new Date().toISOString();
  const updated = {
    ...plan,
    status: 'APPROVED',
    approved_by: user.id,
    approved_by_name: user.name,
    approved_by_position: user.position || '',
    approved_at: now,
    approval_comment: String(comment || '').trim(),
    updated_at: now,
    updated_by: user.id
  };
  const next = [...allPlans];
  next[idx] = updated;
  setLocalPlans(next);
  appendLocalAudit('VCC_PLAN_APPROVED', {
    plan_id: planId,
    comment: updated.approval_comment,
    before: { status: 'PENDING_APPROVAL' },
    after: { status: 'APPROVED' }
  });
  return enrichLocalPlan(updated, getLocalPlanItems(), getDepartmentMap());
};

export const rejectVccPlan = async (planId, reason = '') => {
  if (isApiMode) {
    const { plan } = await apiPost(`/api/vcc/plans/${encodeURIComponent(planId)}/reject`, { reason });
    return plan;
  }
  const user = useStore.getState().currentUser;
  if (!user) throw new Error('กรุณาเข้าสู่ระบบ');
  const trimmedReason = String(reason || '').trim();
  if (!trimmedReason) throw new Error('กรุณาระบุเหตุผลในการส่งกลับแก้ไข');

  const allPlans = getLocalPlans();
  const idx = allPlans.findIndex((p) => p.id === planId);
  if (idx === -1) throw new Error('ไม่พบแผนการสอบเทียบประจำปี');
  const plan = allPlans[idx];
  if (plan.status !== 'PENDING_REVIEW' && plan.status !== 'PENDING_APPROVAL') {
    throw new Error('ส่งกลับแก้ไขได้เฉพาะแผนที่รอทบทวนหรือรออนุมัติเท่านั้น');
  }
  const settings = getLocalPlanSettings();
  const thresholds = getLocalThresholds(settings.approval_doc_type);
  const requiredLevel = plan.status === 'PENDING_REVIEW'
    ? thresholds.required_reviewer_level
    : thresholds.required_approver_level;
  const userLevel = Number(user.approval_level ?? user.approvalLevel ?? 4);

  if (user.id === plan.prepared_by) {
    throw new Error('ผู้จัดทำไม่สามารถพิจารณาแผนของตนเองได้');
  }
  if (userLevel < requiredLevel) {
    throw new Error(`ต้องมีระดับอนุมัติ L${requiredLevel} ขึ้นไปตาม Approval Matrix`);
  }

  const now = new Date().toISOString();
  const updated = {
    ...plan,
    status: 'REJECTED',
    rejected_by: user.id,
    rejected_by_name: user.name,
    rejected_at: now,
    rejected_reason: trimmedReason,
    updated_at: now,
    updated_by: user.id
  };
  const next = [...allPlans];
  next[idx] = updated;
  setLocalPlans(next);
  appendLocalAudit('VCC_PLAN_REJECTED', {
    plan_id: planId,
    reason: trimmedReason,
    before: { status: plan.status },
    after: { status: 'REJECTED' }
  });
  return enrichLocalPlan(updated, getLocalPlanItems(), getDepartmentMap());
};
