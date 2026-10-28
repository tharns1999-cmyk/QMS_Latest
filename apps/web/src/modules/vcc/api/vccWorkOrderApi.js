import { apiGet, apiPost, apiPut, isApiMode } from '../../../api/client';
import useStore from '../../../store/useStore';
import {
  readJson,
  writeJson,
  getLocalAssets,
  getDepartmentMap,
  assertLocalDcc,
  getLocalAudit,
  appendLocalAudit
} from './vccApi';
import { computeDueDateForMonth, getLocalPlans, getLocalPlanItems } from './vccPlanApi';

const STORAGE_WO_KEY = 'qms-vcc-local-work-orders-v1';
const STORAGE_WO_SETTINGS_KEY = 'qms-vcc-local-wo-settings-v1';

export const DEFAULT_VCC_WO_SETTINGS = {
  retention_years: 3,
  approval_doc_type: 'FM',
  default_acceptance_criteria: [
    '± 0.5 °C ตามเกณฑ์โรงงาน',
    '± 1.0 g ตามพิกัดเครื่องชั่ง',
    'ผ่านเกณฑ์มาตรฐานห้องปฏิบัติการ ISO/IEC 17025',
    '± 0.02 mm ตามเกณฑ์เวอร์เนียร์คาลิปเปอร์'
  ]
};

const INITIAL_LOCAL_WORK_ORDERS = [
  {
    id: 'vcc-wo-seed-st002',
    wo_code: 'WO-2026-001',
    plan_id: 'vcc-plan-2026-qc',
    plan_item_id: 'vcc-pi-2026-st002',
    planned_month: 3,
    asset_id: 'vcc-seed-st002',
    provider_name: 'ห้องปฏิบัติการภายนอก',
    due_date: '2026-03-31',
    original_due_date: '2026-03-31',
    reschedule_reason: null,
    status: 'OPEN',
    result_status: 'PENDING',
    performed_at: null,
    certificate_no: null,
    acceptance_criteria: null,
    result_remarks: '[ข้อมูลทดสอบ] ใบสั่งงานทวนสอบเทอร์โมมิเตอร์มาตรฐาน ST002',
    performed_by: null,
    reviewed_by: null,
    reviewed_at: null,
    review_comment: null,
    rejected_reason: null,
    nc_status: null,
    nc_impact_assessment: null,
    hold_released_by: null,
    hold_released_at: null,
    created_at: '2026-10-28T04:00:00.000Z',
    created_by: 'dc4',
    updated_at: '2026-10-28T04:00:00.000Z',
    updated_by: 'dc4'
  }
];

export const getLocalWos = () => readJson(STORAGE_WO_KEY, () => [...INITIAL_LOCAL_WORK_ORDERS]);
const setLocalWos = (list) => writeJson(STORAGE_WO_KEY, list);
const getLocalWoSettings = () => readJson(STORAGE_WO_SETTINGS_KEY, () => ({ ...DEFAULT_VCC_WO_SETTINGS }));
const setLocalWoSettings = (obj) => writeJson(STORAGE_WO_SETTINGS_KEY, obj);

const getLocalThresholds = (docType = 'FM') => {
  const matrix = useStore.getState().approvalMatrix || [];
  const found = matrix.find((m) => (m.docType || m.doc_type) === docType);
  if (found) {
    return {
      min_requester_level: Number(found.minRequesterLevel ?? found.min_requester_level ?? 1),
      required_reviewer_level: Number(found.requiredReviewerLevel ?? found.required_reviewer_level ?? 4),
      required_approver_level: Number(found.requiredApproverLevel ?? found.required_approver_level ?? 5)
    };
  }
  return { min_requester_level: 1, required_reviewer_level: 4, required_approver_level: 5 };
};

const enrichLocalWo = (wo, allAssets, deptMap, allPlans) => {
  const asset = allAssets.find((a) => a.id === wo.asset_id) || {};
  const parent = asset.parent_id ? allAssets.find((p) => p.id === asset.parent_id) : null;
  const plan = wo.plan_id ? allPlans.find((pl) => pl.id === wo.plan_id) : null;
  return {
    ...wo,
    asset_code: asset.asset_code || '-',
    asset_name: asset.name || '-',
    asset_type: asset.asset_type || '-',
    department: asset.department || '',
    location: asset.location || '',
    parent_asset_code: parent?.asset_code || null,
    department_name_th: deptMap[asset.department] || asset.department,
    plan_year: plan?.plan_year || null
  };
};

export const fetchVccWorkOrderSettings = async () => {
  if (isApiMode) return apiGet('/api/vcc/work-order-settings');
  assertLocalDcc();
  const settings = getLocalWoSettings();
  return { settings, thresholds: getLocalThresholds(settings.approval_doc_type) };
};

export const saveVccWorkOrderSettings = async (payload) => {
  if (isApiMode) return apiPut('/api/vcc/work-order-settings', payload);
  assertLocalDcc();
  const before = getLocalWoSettings();
  const retentionYears = Number(payload.retention_years ?? before.retention_years);
  if (!Number.isInteger(retentionYears) || retentionYears < 1 || retentionYears > 50) {
    throw new Error('ระยะเวลาเก็บเอกสารต้องเป็นจำนวนเต็มระหว่าง 1 ถึง 50 ปี');
  }
  const criteria = (payload.default_acceptance_criteria || before.default_acceptance_criteria || [])
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  if (criteria.length === 0 || new Set(criteria).size !== criteria.length) {
    throw new Error('เกณฑ์ยอมรับต้องมีอย่างน้อย 1 รายการ และห้ามซ้ำกัน');
  }
  const next = {
    retention_years: retentionYears,
    approval_doc_type: String(payload.approval_doc_type || before.approval_doc_type || 'FM').toUpperCase(),
    default_acceptance_criteria: criteria
  };
  setLocalWoSettings(next);
  appendLocalAudit('VCC_WO_SETTINGS_UPDATED', { before, after: next });
  return { settings: next, thresholds: getLocalThresholds(next.approval_doc_type) };
};

export const fetchVccWorkOrders = async ({ status = 'OPEN', nc_status = '', department = '', plan_id = '', asset_id = '' } = {}) => {
  if (isApiMode) {
    const params = new URLSearchParams();
    if (nc_status) params.set('nc_status', nc_status);
    else params.set('status', status);
    if (department) params.set('department', department);
    if (plan_id) params.set('plan_id', plan_id);
    if (asset_id) params.set('asset_id', asset_id);
    const { workOrders } = await apiGet(`/api/vcc/work-orders?${params.toString()}`);
    return workOrders;
  }
  assertLocalDcc();
  const allWos = getLocalWos();
  const allAssets = getLocalAssets();
  const deptMap = getDepartmentMap();
  const allPlans = getLocalPlans();

  return allWos
    .filter((w) => (nc_status ? w.nc_status === nc_status : w.status === status))
    .filter((w) => (!plan_id ? true : w.plan_id === plan_id))
    .filter((w) => (!asset_id ? true : w.asset_id === asset_id))
    .map((w) => enrichLocalWo(w, allAssets, deptMap, allPlans))
    .filter((w) => (!department ? true : w.department === department))
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.wo_code.localeCompare(b.wo_code));
};

export const fetchVccWorkOrderDetail = async (id) => {
  if (isApiMode) return apiGet(`/api/vcc/work-orders/${encodeURIComponent(id)}`);
  assertLocalDcc();
  const raw = getLocalWos().find((w) => w.id === id);
  if (!raw) throw new Error('ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ');
  const workOrder = enrichLocalWo(raw, getLocalAssets(), getDepartmentMap(), getLocalPlans());
  const settings = getLocalWoSettings();
  const thresholds = getLocalThresholds(settings.approval_doc_type);
  const history = getLocalAudit()
    .filter((h) => String(h.action || '').startsWith('VCC_WO_') && h.details?.wo_id === id)
    .sort((a, b) => b.id - a.id);
  return { workOrder, thresholds, history };
};

export const createVccWorkOrder = async (payload) => {
  if (isApiMode) {
    const { workOrder } = await apiPost('/api/vcc/work-orders', payload);
    return workOrder;
  }
  const user = assertLocalDcc();
  const allWos = getLocalWos();
  const allAssets = getLocalAssets();
  const allPlans = getLocalPlans();
  const allPlanItems = getLocalPlanItems();

  const planId = payload.plan_id ? String(payload.plan_id).trim() : null;
  const planItemId = payload.plan_item_id ? String(payload.plan_item_id).trim() : null;
  const plannedMonth = payload.planned_month ? Number(payload.planned_month) : null;

  let targetAssetId = String(payload.asset_id || payload.child_asset_id || '').trim();
  let providerName = String(payload.provider_name || '').trim();
  let dueDate = String(payload.due_date || '').trim();

  if (planId || planItemId) {
    const plan = allPlans.find((p) => p.id === planId);
    if (!plan) throw new Error('ไม่พบแผนการสอบเทียบประจำปี');
    if (plan.status !== 'APPROVED') {
      throw new Error('สร้างใบสั่งงานจากแผนได้เฉพาะแผนประจำปีที่อนุมัติแล้ว (APPROVED) เท่านั้น');
    }
    const planItem = allPlanItems.find((i) => i.id === planItemId && i.plan_id === planId);
    if (!planItem) throw new Error('ไม่พบรายการเครื่องมือในแผนประจำปี');
    const itemAsset = allAssets.find((a) => a.id === planItem.asset_id);
    if (Number(itemAsset?.is_group) === 1) {
      const childId = String(payload.child_asset_id || '').trim();
      if (!childId) {
        throw new Error('เครื่องมือแบบกลุ่มต้องแยกรหัสเครื่องมือรายตัวก่อนสร้างใบสั่งงาน');
      }
      const child = allAssets.find((a) => a.id === childId && a.parent_id === itemAsset.id);
      if (!child || child.status !== 'ACTIVE' || Number(child.is_group) === 1) {
        throw new Error('เครื่องมือลูกที่เลือกต้องเป็นเครื่องมือรายตัวที่ใช้งานปกติ (ACTIVE)');
      }
      targetAssetId = child.id;
    } else {
      targetAssetId = planItem.asset_id;
    }
    providerName = providerName || planItem.provider_name;
    dueDate = dueDate || computeDueDateForMonth(plan.plan_year, plannedMonth, plan.due_date_rule);

    const dup = allWos.find(
      (w) => w.plan_item_id === planItemId && w.asset_id === targetAssetId && Number(w.planned_month) === plannedMonth && w.status !== 'CANCELLED'
    );
    if (dup) {
      throw new Error(`มีใบสั่งงาน (${dup.wo_code}) สำหรับเครื่องมือและรอบเดือนนี้อยู่แล้ว`);
    }
  }

  if (!targetAssetId) throw new Error('กรุณาเลือกเครื่องมือรายตัวสำหรับสร้างใบสั่งงาน');
  const asset = allAssets.find((a) => a.id === targetAssetId);
  if (!asset) throw new Error('ไม่พบเครื่องมือในทะเบียน');
  if (Number(asset.is_group) === 1) {
    throw new Error('เครื่องมือแบบกลุ่มต้องแยกรหัสเครื่องมือรายตัวก่อนสร้างใบสั่งงาน');
  }
  if (asset.status !== 'ACTIVE') {
    throw new Error('ไม่สามารถเปิดใบสั่งงานให้เครื่องมือที่ปลดออกแล้ว (RETIRED)');
  }

  const openHold = allWos.find((w) => w.asset_id === targetAssetId && w.nc_status === 'OPEN');
  if (openHold) {
    throw new Error(`เครื่องมือ ${asset.asset_code} อยู่ระหว่างระงับใช้งาน (ON_HOLD จากใบงาน ${openHold.wo_code}) ต้องปลดระงับก่อนเปิดใบงานใหม่`);
  }
  if (!providerName) throw new Error('กรุณาระบุสถาบัน/หน่วยงานที่ทวนสอบ');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error('กรุณาระบุวันครบกำหนดในรูปแบบ YYYY-MM-DD');

  const seq = String(allWos.length + 1).padStart(3, '0');
  const woCode = `WO-${dueDate.slice(0, 4)}-${seq}`;
  const now = new Date().toISOString();
  const created = {
    id: `vcc-wo-${Date.now()}`,
    wo_code: woCode,
    plan_id: planId,
    plan_item_id: planItemId,
    planned_month: plannedMonth,
    asset_id: targetAssetId,
    provider_name: providerName,
    due_date: dueDate,
    original_due_date: dueDate,
    reschedule_reason: null,
    status: 'OPEN',
    result_status: 'PENDING',
    performed_at: null,
    certificate_no: null,
    acceptance_criteria: null,
    result_remarks: null,
    performed_by: null,
    reviewed_by: null,
    reviewed_at: null,
    review_comment: null,
    rejected_reason: null,
    nc_status: null,
    nc_impact_assessment: null,
    hold_released_by: null,
    hold_released_at: null,
    created_at: now,
    created_by: user.id,
    updated_at: now,
    updated_by: user.id
  };
  setLocalWos([...allWos, created]);
  appendLocalAudit('VCC_WO_CREATED', {
    wo_id: created.id,
    wo_code: woCode,
    asset_id: targetAssetId,
    asset_code: asset.asset_code,
    due_date: dueDate,
    original_due_date: dueDate
  });
  return enrichLocalWo(created, allAssets, getDepartmentMap(), allPlans);
};

export const rescheduleVccWorkOrder = async (id, { new_due_date, reason }) => {
  if (isApiMode) {
    const { workOrder } = await apiPost(`/api/vcc/work-orders/${encodeURIComponent(id)}/reschedule`, { new_due_date, reason });
    return workOrder;
  }
  const user = assertLocalDcc();
  const allWos = getLocalWos();
  const idx = allWos.findIndex((w) => w.id === id);
  if (idx === -1) throw new Error('ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ');
  const existing = allWos[idx];
  const trimmedReason = String(reason || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(new_due_date || '').trim())) {
    throw new Error('กรุณาระบุวันครบกำหนดใหม่ในรูปแบบ YYYY-MM-DD');
  }
  if (!trimmedReason) throw new Error('กรุณาระบุเหตุผลในการขอเลื่อนวันครบกำหนด');

  const updated = {
    ...existing,
    due_date: String(new_due_date).trim(),
    reschedule_reason: trimmedReason,
    updated_at: new Date().toISOString(),
    updated_by: user.id
  };
  const next = [...allWos];
  next[idx] = updated;
  setLocalWos(next);
  appendLocalAudit('VCC_WO_RESCHEDULED', {
    wo_id: id,
    wo_code: existing.wo_code,
    original_due_date: existing.original_due_date,
    before: { due_date: existing.due_date },
    after: { due_date: updated.due_date },
    reason: trimmedReason
  });
  return enrichLocalWo(updated, getLocalAssets(), getDepartmentMap(), getLocalPlans());
};

export const submitVccWorkOrderResult = async (id, payload) => {
  if (isApiMode) {
    const { workOrder } = await apiPost(`/api/vcc/work-orders/${encodeURIComponent(id)}/submit-result`, payload);
    return workOrder;
  }
  const user = assertLocalDcc();
  const allWos = getLocalWos();
  const idx = allWos.findIndex((w) => w.id === id);
  if (idx === -1) throw new Error('ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ');
  const existing = allWos[idx];

  const performedAt = String(payload.performed_at || '').trim();
  const resultStatus = String(payload.result_status || '').trim().toUpperCase();
  const certificateNo = String(payload.certificate_no || '').trim();
  const acceptanceCriteria = String(payload.acceptance_criteria || '').trim();
  const resultRemarks = String(payload.result_remarks || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(performedAt)) throw new Error('กรุณาระบุวันที่ทวนสอบจริง (YYYY-MM-DD)');
  if (!['PASS', 'FAIL', 'INCONCLUSIVE'].includes(resultStatus)) {
    throw new Error('ผลการทวนสอบต้องเป็น PASS, FAIL หรือ INCONCLUSIVE');
  }
  if (!certificateNo) {
    throw new Error('กรุณาระบุเลขที่ใบรับรอง (Certificate No.) หรืออ้างอิงหลักฐานการทวนสอบก่อนส่งตรวจรับ');
  }
  if (!acceptanceCriteria) {
    throw new Error('กรุณาระบุเกณฑ์ยอมรับ (Acceptance Criteria) ที่ใช้ตรวจเทียบก่อนส่งตรวจรับ');
  }

  const nextNcStatus = resultStatus === 'FAIL' ? 'OPEN' : existing.nc_status;
  const updated = {
    ...existing,
    status: 'PENDING_REVIEW',
    result_status: resultStatus,
    performed_at: performedAt,
    certificate_no: certificateNo,
    acceptance_criteria: acceptanceCriteria,
    result_remarks: resultRemarks,
    performed_by: user.id,
    performed_by_name: user.name,
    nc_status: nextNcStatus,
    rejected_reason: null,
    updated_at: new Date().toISOString(),
    updated_by: user.id
  };
  const next = [...allWos];
  next[idx] = updated;
  setLocalWos(next);
  appendLocalAudit('VCC_WO_RESULT_SUBMITTED', {
    wo_id: id,
    wo_code: existing.wo_code,
    result_status: resultStatus,
    certificate_no: certificateNo,
    acceptance_criteria: acceptanceCriteria,
    nc_status: nextNcStatus
  });
  return enrichLocalWo(updated, getLocalAssets(), getDepartmentMap(), getLocalPlans());
};

export const approveVccWorkOrder = async (id, comment = '') => {
  if (isApiMode) {
    const { workOrder } = await apiPost(`/api/vcc/work-orders/${encodeURIComponent(id)}/approve`, { comment });
    return workOrder;
  }
  const user = assertLocalDcc();
  const allWos = getLocalWos();
  const idx = allWos.findIndex((w) => w.id === id);
  if (idx === -1) throw new Error('ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ');
  const existing = allWos[idx];
  if (existing.status !== 'PENDING_REVIEW') {
    throw new Error('อนุมัติปิดงานได้เฉพาะใบสั่งงานที่อยู่ในสถานะรอตรวจรับผล (PENDING_REVIEW) เท่านั้น');
  }

  const settings = getLocalWoSettings();
  const thresholds = getLocalThresholds(settings.approval_doc_type);
  const userLevel = Number(user.approval_level ?? user.approvalLevel ?? 4);

  if (user.id === existing.performed_by) {
    throw new Error('ผู้บันทึกผลไม่สามารถตรวจรับและอนุมัติปิดใบสั่งงานของตนเองได้');
  }
  if (userLevel < thresholds.required_reviewer_level) {
    throw new Error(`ผู้ตรวจรับผลต้องมีระดับอนุมัติ L${thresholds.required_reviewer_level} ขึ้นไปตาม Approval Matrix`);
  }

  const now = new Date().toISOString();
  const updated = {
    ...existing,
    status: 'CLOSED',
    reviewed_by: user.id,
    reviewed_by_name: user.name,
    reviewed_at: now,
    review_comment: String(comment || '').trim(),
    updated_at: now,
    updated_by: user.id
  };
  const next = [...allWos];
  next[idx] = updated;
  setLocalWos(next);
  appendLocalAudit('VCC_WO_APPROVED', {
    wo_id: id,
    wo_code: existing.wo_code,
    comment: updated.review_comment
  });
  return enrichLocalWo(updated, getLocalAssets(), getDepartmentMap(), getLocalPlans());
};

export const rejectVccWorkOrder = async (id, reason = '') => {
  if (isApiMode) {
    const { workOrder } = await apiPost(`/api/vcc/work-orders/${encodeURIComponent(id)}/reject`, { reason });
    return workOrder;
  }
  const user = assertLocalDcc();
  const trimmedReason = String(reason || '').trim();
  if (!trimmedReason) throw new Error('กรุณาระบุเหตุผลในการส่งกลับแก้ไขผลทวนสอบ');

  const allWos = getLocalWos();
  const idx = allWos.findIndex((w) => w.id === id);
  if (idx === -1) throw new Error('ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ');
  const existing = allWos[idx];

  const settings = getLocalWoSettings();
  const thresholds = getLocalThresholds(settings.approval_doc_type);
  const userLevel = Number(user.approval_level ?? user.approvalLevel ?? 4);
  if (user.id === existing.performed_by) {
    throw new Error('ผู้บันทึกผลไม่สามารถพิจารณาใบสั่งงานของตนเองได้');
  }
  if (userLevel < thresholds.required_reviewer_level) {
    throw new Error(`ผู้ตรวจรับผลต้องมีระดับอนุมัติ L${thresholds.required_reviewer_level} ขึ้นไปตาม Approval Matrix`);
  }

  const updated = {
    ...existing,
    status: 'REJECTED',
    rejected_reason: trimmedReason,
    updated_at: new Date().toISOString(),
    updated_by: user.id
  };
  const next = [...allWos];
  next[idx] = updated;
  setLocalWos(next);
  appendLocalAudit('VCC_WO_REJECTED', { wo_id: id, wo_code: existing.wo_code, reason: trimmedReason });
  return enrichLocalWo(updated, getLocalAssets(), getDepartmentMap(), getLocalPlans());
};

export const releaseVccWorkOrderHold = async (id, impact_assessment = '') => {
  if (isApiMode) {
    const { workOrder } = await apiPost(`/api/vcc/work-orders/${encodeURIComponent(id)}/release-hold`, { impact_assessment });
    return workOrder;
  }
  const user = assertLocalDcc();
  const trimmedImpact = String(impact_assessment || '').trim();
  if (!trimmedImpact) {
    throw new Error('กรุณาระบุผลการประเมินผลกระทบและการแก้ไข (NC Impact Assessment) ก่อนปลดระงับเครื่องมือ');
  }

  const allWos = getLocalWos();
  const idx = allWos.findIndex((w) => w.id === id);
  if (idx === -1) throw new Error('ไม่พบใบสั่งงานทวนสอบ/สอบเทียบ');
  const existing = allWos[idx];
  if (existing.nc_status !== 'OPEN') {
    throw new Error('รายการนี้ไม่ได้อยู่ในสถานะระงับใช้งาน (ON_HOLD)');
  }

  const settings = getLocalWoSettings();
  const thresholds = getLocalThresholds(settings.approval_doc_type);
  const userLevel = Number(user.approval_level ?? user.approvalLevel ?? 4);
  if (userLevel < thresholds.required_approver_level) {
    throw new Error(`ผู้สั่งปลดระงับเครื่องมือ (ON_HOLD) ต้องมีระดับอนุมัติ L${thresholds.required_approver_level} ขึ้นไปตาม Approval Matrix`);
  }

  const now = new Date().toISOString();
  const updated = {
    ...existing,
    nc_status: 'RELEASED',
    nc_impact_assessment: trimmedImpact,
    hold_released_by: user.id,
    hold_released_by_name: user.name,
    hold_released_at: now,
    updated_at: now,
    updated_by: user.id
  };
  const next = [...allWos];
  next[idx] = updated;
  setLocalWos(next);
  appendLocalAudit('VCC_WO_HOLD_RELEASED', {
    wo_id: id,
    wo_code: existing.wo_code,
    impact_assessment: trimmedImpact
  });
  return enrichLocalWo(updated, getLocalAssets(), getDepartmentMap(), getLocalPlans());
};

