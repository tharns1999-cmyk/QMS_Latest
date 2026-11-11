import { apiGet, apiPost, apiPut, apiDelete, isApiMode } from '../../../api/client';
import useStore from '../../../store/useStore';
import { isSameDepartment } from '../../dcc/utils/taskFilter';
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
import { getLocalNotifications, syncVccNotifications } from './vccNotificationApi';

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
  default_doc_code: 'VCC-PLAN',
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
    document_code: 'VCC-AP-QC-2026',
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
    document_code: 'VCC-AP-QC-2027',
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
  },
  {
    id: 'vcc-plan-2026-lb',
    plan_year: 2026,
    department: 'LB',
    document_code: 'VCC-PLAN-LB',
    revision: '01',
    title: '[ข้อมูลทดสอบ] แผนการสอบเทียบและทวนสอบเครื่องมือห้องปฏิบัติการประจำปี 2026 (พ.ศ. 2569)',
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
    id: 'vcc-plan-2027-lb',
    plan_year: 2027,
    department: 'LB',
    document_code: 'VCC-PLAN-LB',
    revision: '01',
    title: '[ข้อมูลทดสอบ] แผนการสอบเทียบและทวนสอบเครื่องมือห้องปฏิบัติการประจำปี 2027 (พ.ศ. 2570)',
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
    id: 'vcc-pi-2026-pip001',
    plan_id: 'vcc-plan-2026-lb',
    asset_id: 'vcc-seed-lb-pipette',
    provider_name: 'ทวนสอบภายใน',
    frequency_label: 'ทุก 6 เดือน',
    planned_months: [3, 9],
    due_dates: ['2026-03-31', '2026-09-30'],
    responsible_dept: 'LB',
    responsible_label: 'LB Officer',
    remarks: '[ข้อมูลทดสอบ] ทวนสอบปริมาตรประจำรอบ',
    sort_order: 1
  },
  {
    id: 'vcc-pi-2026-ac001',
    plan_id: 'vcc-plan-2026-lb',
    asset_id: 'vcc-seed-lb-autoclave',
    provider_name: 'ห้องปฏิบัติการภายนอก',
    frequency_label: 'รายปี',
    planned_months: [6],
    due_dates: ['2026-06-30'],
    responsible_dept: 'LB',
    responsible_label: 'LB Officer',
    remarks: '[ข้อมูลทดสอบ] สอบเทียบอุณหภูมิและความดัน',
    sort_order: 2
  },
  {
    id: 'vcc-pi-2026-inc001',
    plan_id: 'vcc-plan-2026-lb',
    asset_id: 'vcc-seed-lb-incubator',
    provider_name: 'ห้องปฏิบัติการภายนอก',
    frequency_label: 'รายปี',
    planned_months: [8],
    due_dates: ['2026-08-31'],
    responsible_dept: 'LB',
    responsible_label: 'LB Officer',
    remarks: '[ข้อมูลทดสอบ] สอบเทียบการกระจายอุณหภูมิ',
    sort_order: 3
  }
];

export const getLocalPlans = () => {
  const plans = readJson(STORAGE_PLANS_KEY, () => [...INITIAL_LOCAL_PLANS]);
  let mutated = false;
  for (const p of plans) {
    if (p.department === 'LB' && (p.document_code === 'FM-LB-11' || p.document_code?.startsWith('FM-LB'))) {
      p.document_code = 'VCC-PLAN-LB';
      mutated = true;
    }
  }
  const hasLbPlan = plans.some((p) => p.department === 'LB');
  if (!hasLbPlan) {
    const defaultLbPlans = INITIAL_LOCAL_PLANS.filter((p) => p.department === 'LB');
    plans.push(...defaultLbPlans);
    mutated = true;
  }
  if (mutated) {
    writeJson(STORAGE_PLANS_KEY, plans);
  }
  return plans;
};

export const setLocalPlans = (list) => writeJson(STORAGE_PLANS_KEY, list);

export const getLocalPlanItems = () => {
  const items = readJson(STORAGE_PLAN_ITEMS_KEY, () => [...INITIAL_LOCAL_PLAN_ITEMS]);
  const hasLbItems = items.some((i) => i.plan_id === 'vcc-plan-2026-lb');
  if (!hasLbItems) {
    const defaultLbItems = INITIAL_LOCAL_PLAN_ITEMS.filter((i) => i.plan_id === 'vcc-plan-2026-lb');
    if (defaultLbItems.length > 0) {
      items.push(...defaultLbItems);
      writeJson(STORAGE_PLAN_ITEMS_KEY, items);
    }
  }
  return items;
};
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

export const getUserDepartments = (user) => {
  if (!user) return [];
  const depts = new Set();
  if (user.department) depts.add(String(user.department).toUpperCase());
  if (user.dept) depts.add(String(user.dept).toUpperCase());
  if (user.primary_department) depts.add(String(user.primary_department).toUpperCase());
  if (user.primaryDepartment) depts.add(String(user.primaryDepartment).toUpperCase());

  const parseList = (val) => {
    if (!val) return;
    if (Array.isArray(val)) {
      val.forEach((d) => d && depts.add(String(d).toUpperCase()));
    } else if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) {
          parsed.forEach((d) => d && depts.add(String(d).toUpperCase()));
        } else if (parsed) {
          depts.add(String(parsed).toUpperCase());
        }
      } catch {
        val.split(',').forEach((d) => d.trim() && depts.add(d.trim().toUpperCase()));
      }
    }
  };

  parseList(user.departments);
  parseList(user.depts);
  parseList(user.secondaryDepartments);
  parseList(user.affiliated_departments);
  parseList(user.extra_departments);
  return Array.from(depts);
};

export const isUserAuthorizedForPlanDept = (user, planDepartment) => {
  if (user?.vccReadOnly) return false;
  if (!user) return false;
  const userLevel = Number(user.approval_level ?? user.approvalLevel ?? 1);
  if (user.isDcc || user.isQmr || userLevel >= 6) return true;
  const targetDept = String(planDepartment || '').toUpperCase();
  const userDepts = getUserDepartments(user);
  return userDepts.some((d) => isSameDepartment(d, targetDept));
};

export const isVccAuthorized = (user) => {
  if (!user) return false;
  const userLevel = Number(user.approval_level ?? user.approvalLevel ?? 1);
  if (user.isDcc || user.isQmr || userLevel >= 6) return true;
  const depts = getUserDepartments(user);
  return depts.some((d) => ['DC', 'QC', 'QA', 'MGT', 'LB'].some((allowed) => isSameDepartment(d, allowed)));
};

export const generateLocalVccTasks = (user) => {
  if (!user) return [];
  if (!isVccAuthorized(user)) return [];

  const allPlans = getLocalPlans();
  const settings = getLocalPlanSettings();
  const thresholds = getLocalThresholds(settings.approval_doc_type);
  const userLevel = Number(user.approval_level ?? user.approvalLevel ?? 1);
  const tasks = [];

  for (const p of allPlans) {
    const isDeptAllowed = isUserAuthorizedForPlanDept(user, p.department);
    if (p.status === 'PENDING_REVIEW') {
      const isAssigned = p.assigned_reviewer_id ? (user.id === p.assigned_reviewer_id || user.isDcc || user.isQmr || userLevel >= 6) : true;
      if (isAssigned && isDeptAllowed && user.id !== p.prepared_by && userLevel >= thresholds.required_reviewer_level) {
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
      const isAssigned = p.assigned_approver_id ? (user.id === p.assigned_approver_id || user.isDcc || user.isQmr || userLevel >= 6) : true;
      if (isAssigned && isDeptAllowed && user.id !== p.prepared_by && user.id !== p.reviewed_by && userLevel >= thresholds.required_approver_level) {
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

  // Work Orders awaiting review (VCC_CALIBRATION_REVIEW) and rejected (VCC_CALIBRATION_REVISE)
  const allWos = readJson('qms-vcc-local-work-orders-v1', () => []);
  const allAssets = getLocalAssets();

  for (const wo of allWos) {
    const asset = allAssets.find((a) => a.id === wo.asset_id);
    const woDept = wo.department || asset?.department;
    const isDeptAllowed = isUserAuthorizedForPlanDept(user, woDept);

    if (wo.status === 'PENDING_REVIEW') {
      if (isDeptAllowed && user.id !== wo.performed_by && userLevel >= thresholds.required_reviewer_level) {
        tasks.push({
          id: `api-vcc-wo-${wo.id}-review`,
          woId: wo.id,
          workOrderId: wo.id,
          referenceId: wo.id,
          referenceType: 'VCC_WORK_ORDER',
          docCode: wo.wo_code,
          document_code: wo.wo_code,
          docTitle: `ใบสั่งงาน ${wo.wo_code} (${asset?.code || ''} - ${asset?.name || ''})`,
          docName: `ใบสั่งงาน ${wo.wo_code}`,
          title: `[ตรวจรับผลสอบเทียบ VCC] ${wo.wo_code} (${asset?.code || ''} - ${asset?.name || ''})`,
          type: 'Review',
          taskType: 'VCC_CALIBRATION_REVIEW',
          task_type: 'VCC_CALIBRATION_REVIEW',
          category: 'REVIEW',
          department: woDept,
          target_department: woDept,
          owner_dept: woDept,
          required_approval_level: thresholds.required_reviewer_level,
          requesterId: wo.performed_by,
          prepared_by: wo.performed_by,
          status: 'PENDING',
          statusTab: 'PENDING_REVIEW',
          createdAt: wo.performed_at || wo.created_at
        });
      }
    } else if (wo.status === 'REJECTED') {
      if (user.id === wo.performed_by || user.isDcc || user.isQmr) {
        tasks.push({
          id: `api-vcc-wo-${wo.id}-revise`,
          woId: wo.id,
          workOrderId: wo.id,
          referenceId: wo.id,
          referenceType: 'VCC_WORK_ORDER',
          docCode: wo.wo_code,
          document_code: wo.wo_code,
          docTitle: `ใบสั่งงาน ${wo.wo_code} (${asset?.code || ''} - ${asset?.name || ''})`,
          docName: `ใบสั่งงาน ${wo.wo_code}`,
          title: `[แก้ไขผลสอบเทียบ VCC ส่งกลับ] ${wo.wo_code} (${asset?.code || ''} - ${asset?.name || ''})`,
          type: 'Revise',
          taskType: 'VCC_CALIBRATION_REVISE',
          task_type: 'VCC_CALIBRATION_REVISE',
          category: 'REVISE',
          department: woDept,
          target_department: woDept,
          owner_dept: woDept,
          assigneeId: wo.performed_by,
          assignee_id: wo.performed_by,
          requesterId: wo.performed_by,
          returnReason: wo.rejected_reason,
          status: 'PENDING',
          statusTab: 'REJECTED',
          createdAt: wo.rejected_at
        });
      }
    }
  }

  // Include active notification tasks in local mode
  try {
    const localNotifs = getLocalNotifications();
    for (const n of (localNotifs || [])) {
      if (n.status !== 'PENDING' && n.status !== 'ACKNOWLEDGED') continue;
      if (!isGlobal && !userDepts.includes(n.department)) continue;
      let isEligible = false;
      if (isGlobal) isEligible = true;
      else if (n.escalation_level === 1) isEligible = true;
      else if (n.escalation_level === 2) isEligible = userLevel >= 4;
      else if (n.escalation_level === 3) isEligible = userLevel >= 5;
      if (!isEligible) continue;

      tasks.push({
        id: `api-vcc-notif-${n.id}`,
        notificationId: n.id,
        referenceId: n.reference_id,
        referenceType: n.reference_type,
        workOrderId: n.work_order_id,
        assetId: n.asset_id,
        docCode: n.wo_code || n.asset_code || n.id,
        document_code: n.wo_code || n.asset_code || n.id,
        docTitle: n.title,
        docName: n.asset_name || n.title,
        title: n.title,
        message: n.message,
        type: n.severity === 'CRITICAL' ? 'Critical' : (n.severity === 'WARNING' ? 'Warning' : 'Alert'),
        taskType: 'VCC_NOTIFICATION_ALERT',
        task_type: 'VCC_NOTIFICATION_ALERT',
        category: n.notification_type?.startsWith('OVERDUE') ? 'OVERDUE' : (n.notification_type?.startsWith('CERT') ? 'CERT_EXPIRING' : 'ALERT'),
        department: n.department,
        target_department: n.department,
        owner_dept: n.department,
        severity: n.severity,
        due_date: n.due_date,
        createdAt: n.created_at
      });
    }
  } catch {
    // Ignore dynamic import failure in edge environments
  }

  return tasks;
};

export const fetchVccTasks = async (currentUser) => {
  const user = currentUser || useStore.getState().currentUser;
  if (!user) return [];
  if (isApiMode) {
    try {
      const res = await apiGet('/api/vcc/tasks');
      return res.tasks || [];
    } catch {
      return [];
    }
  }
  return generateLocalVccTasks(user);
};

export const syncVccTasks = async (currentUser) => {
  try {
    const user = currentUser || useStore.getState().currentUser;
    if (!user) return [];
    const vccTasks = await fetchVccTasks(user);
    const state = useStore.getState();
    const existing = state.tasks || [];
    const nonVcc = existing.filter((t) => !String(t.id).startsWith('api-vcc-'));
    const merged = [...nonVcc, ...vccTasks];
    useStore.setState({ tasks: merged });
    return vccTasks;
  } catch (err) {
    console.error('Failed to sync VCC tasks:', err);
    return [];
  }
};

const enrichLocalPlan = (plan, allItems, deptMap) => {
  const planItems = allItems.filter((i) => i.plan_id === plan.id);
  const assets = getLocalAssets();
  const groupCount = planItems.filter((i) => {
    const a = assets.find((x) => x.id === i.asset_id);
    return a && Number(a.is_group) === 1;
  }).length;
  const users = useStore.getState().masterUsers || [];
  const assignedReviewer = users.find((u) => u.id === plan.assigned_reviewer_id);
  const assignedApprover = users.find((u) => u.id === plan.assigned_approver_id);
  return {
    ...plan,
    department_name_th: deptMap[plan.department] || plan.department,
    item_count: planItems.length,
    group_item_count: groupCount,
    assigned_reviewer_name: plan.assigned_reviewer_name || assignedReviewer?.name || null,
    assigned_reviewer_position: plan.assigned_reviewer_position || assignedReviewer?.position || null,
    assigned_approver_name: plan.assigned_approver_name || assignedApprover?.name || null,
    assigned_approver_position: plan.assigned_approver_position || assignedApprover?.position || null
  };
};

const enrichLocalPlanItem = (item, allAssets, deptMap) => {
  const asset = allAssets.find((a) => a.id === item.asset_id) || {};
  const parent = asset.parent_id ? allAssets.find((p) => p.id === asset.parent_id) : null;
  const activeChildren = allAssets.filter((c) => c.parent_id === asset.id && c.status === 'ACTIVE');
  const isGroup = Number(asset.is_group) === 1;
  const groupNature = asset.group_nature || 'LOGICAL_GROUP';
  const isLogicalGroup = isGroup && groupNature !== 'COMPOSITE_SET';
  const isCompositeSet = groupNature === 'COMPOSITE_SET';
  const isCalibratableUnit = !isLogicalGroup;

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
    brand: asset.brand || item.brand || '',
    mpe: item.mpe || '',
    acceptance_criteria: item.acceptance_criteria || '',
    calibration_points: item.calibration_points || '',
    is_group: isGroup ? 1 : 0,
    group_nature: groupNature,
    is_logical_group: isLogicalGroup,
    is_composite_set: isCompositeSet,
    is_calibratable_unit: isCalibratableUnit,
    composite_details: asset.composite_details || '',
    parent_id: asset.parent_id || null,
    asset_status: asset.status || 'ACTIVE',
    parent_asset_code: parent?.asset_code || null,
    parent_name: parent?.name || null,
    parent_group_nature: parent?.group_nature || null,
    responsible_dept_name_th: deptMap[item.responsible_dept] || item.responsible_dept,
    active_child_count: activeChildren.length,
    actual_months: actualMonths,
    has_evidence: hasEvidence,
    completion_status: actualMonths.length > 0 ? 'COMPLETED' : 'PLANNED_ONLY',
    requires_child_selection: isLogicalGroup,
    work_order_ready: isCalibratableUnit && asset.status === 'ACTIVE',
    work_order_block_reason: isLogicalGroup
      ? 'เครื่องมือแบบกลุ่มจัดหมวดหมู่ต้องแยกรหัสเครื่องมือรายตัวก่อนสร้างใบสั่งงาน'
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

const STORAGE_DOCUMENT_PROFILES_KEY = 'qms-vcc-local-document-profiles-v1';
const DEFAULT_LOCAL_DOCUMENT_PROFILES = {
  QC: {
    document_code: 'VCC-AP-QC-2026',
    revision: '01',
    form_issue_date: '2026-06-09',
    title_th: 'แผนการทวนสอบเครื่องมือประจำปี',
    reviewer_dept: 'PD',
    required_reviewer_level: 5,
    required_approver_level: 6,
    min_preparer_level: 4,
    assigned_reviewer_id: null,
    assigned_approver_id: null
  },
  LB: {
    document_code: 'VCC-PLAN-LB',
    revision: '01',
    form_issue_date: '2026-08-10',
    title_th: 'แผนการสอบเทียบเครื่องมือที่ใช้ในห้องปฏิบัติการจุลชีววิทยา ประจำปี',
    reviewer_dept: 'LB',
    required_reviewer_level: 5,
    required_approver_level: 6,
    min_preparer_level: 4,
    assigned_reviewer_id: null,
    assigned_approver_id: null
  }
};

export const fetchVccDocumentProfiles = async () => {
  if (isApiMode) {
    return apiGet('/api/vcc/document-profiles');
  }
  assertLocalVccAccess();
  let profiles = DEFAULT_LOCAL_DOCUMENT_PROFILES;
  try {
    const raw = localStorage.getItem(STORAGE_DOCUMENT_PROFILES_KEY);
    if (raw) profiles = { ...DEFAULT_LOCAL_DOCUMENT_PROFILES, ...JSON.parse(raw) };
  } catch {}
  if (profiles.QC?.document_code === 'FM-QC-46' || profiles.QC?.document_code?.startsWith('FM-QC')) {
    profiles.QC.document_code = 'VCC-AP-QC-2026';
  }
  if (profiles.LB?.document_code === 'FM-LB-11' || profiles.LB?.document_code?.startsWith('FM-LB')) {
    profiles.LB.document_code = 'VCC-PLAN-LB';
  }
  return { profiles, candidates: { qc_reviewers: [], lab_reviewers: [], approvers: [], qc_preparers: [], lab_preparers: [] }, allActiveUsers: [] };
};

export const saveVccDocumentProfile = async (dept, profileData) => {
  const normDept = String(dept || '').toUpperCase().trim();
  if (isApiMode) {
    return apiPut(`/api/vcc/document-profiles/${normDept}`, profileData);
  }
  assertLocalDcc();
  const current = (await fetchVccDocumentProfiles()).profiles;
  const updated = {
    ...current,
    [normDept]: {
      ...(current[normDept] || {}),
      ...profileData
    }
  };
  localStorage.setItem(STORAGE_DOCUMENT_PROFILES_KEY, JSON.stringify(updated));
  appendLocalAudit('VCC_DOCUMENT_PROFILE_UPDATED', {
    department: normDept,
    before: current[normDept] || null,
    after: updated[normDept]
  });
  return { department: normDept, profile: updated[normDept], allProfiles: updated };
};

export const fetchVccPlans = async ({ status = 'DRAFT', year = '', department = '' } = {}) => {
  if (isApiMode) {
    if (status === 'ALL' || !status) {
      const statuses = ['DRAFT', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'];
      const results = await Promise.all(
        statuses.map((st) => fetchVccPlans({ status: st, year, department }).catch(() => []))
      );
      return results.flat();
    }
    const params = new URLSearchParams();
    params.set('status', status);
    if (year !== '' && year !== undefined && year !== null) params.set('year', String(year));
    if (department && department !== 'MY_DEPTS') params.set('department', department);
    const { plans } = await apiGet(`/api/vcc/plans?${params.toString()}`);
    return plans;
  }
  const user = assertLocalVccAccess();
  const allPlans = getLocalPlans();
  const allItems = getLocalPlanItems();
  const deptMap = getDepartmentMap();
  const myDepts = getUserDepartments(user);
  const userLevel = Number(user?.approval_level ?? user?.approvalLevel ?? 1);
  const canReadAll = Boolean(user?.isDcc || user?.isQmr || userLevel >= 6 || myDepts.includes('MGT'));
  const uDept = String(user?.department || user?.dept || '').toUpperCase();
  const deptRank = (d) => {
    const norm = String(d || '').toUpperCase();
    if (uDept && norm === uDept) return 0;
    if (norm === 'QC') return 1;
    if (norm === 'LB') return 2;
    return 3;
  };
  return allPlans
    .filter((p) => isUserAuthorizedForPlanDept(user, p.department))
    .filter((p) => (status === 'ALL' || !status ? true : p.status === status))
    .filter((p) => (year === '' || year === undefined || year === null ? true : Number(p.plan_year) === Number(year)))
    .filter((p) => {
      if (!department || department === 'MY_DEPTS') {
        return canReadAll ? true : myDepts.includes(String(p.department).toUpperCase());
      }
      return p.department === department;
    })
    .map((p) => enrichLocalPlan(p, allItems, deptMap))
    .sort(
      (a, b) =>
        a.plan_year - b.plan_year ||
        deptRank(a.department) - deptRank(b.department) ||
        a.department.localeCompare(b.department)
    );
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
      (a) =>
        a.department === plan.department &&
        a.status !== 'RETIRED' &&
        (Number(a.is_group) === 0 || a.group_nature === 'COMPOSITE_SET')
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

// New revision of an approved plan. Only the server holds the plan data, so the demo (local) mode cannot do it.
export const createVccPlanRevision = async (planId, { revision_reason, title } = {}) => {
  if (!isApiMode) throw new Error('การสร้าง Revision ใช้ได้เมื่อเชื่อมต่อเซิร์ฟเวอร์เท่านั้น');
  const { plan } = await apiPost(`/api/vcc/plans/${encodeURIComponent(planId)}/revisions`, { revision_reason, title });
  await syncVccTasks().catch(() => {});
  return plan;
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

export const deleteVccPlan = async (id, reason = '') => {
  if (isApiMode) {
    return apiDelete(`/api/vcc/plans/${encodeURIComponent(id)}`, { reason });
  }
  const user = assertLocalVccAccess();
  const allPlans = getLocalPlans();
  const existing = allPlans.find((p) => p.id === id);
  if (!existing) throw new Error('ไม่พบแผนการสอบเทียบประจำปี');
  if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED' && existing.status !== 'RETURNED') {
    throw new Error('ไม่อนุญาตให้ลบแผนงานที่อยู่ระหว่างการอนุมัติหรือมีผลบังคับใช้แล้ว');
  }

  const isDccUser = Boolean(user.isDcc || user.is_dcc);
  const userDepts = [user.department, ...(user.extra_departments || [])].map((d) => String(d).toUpperCase());
  const isOwningDept = userDepts.includes(String(existing.department || '').toUpperCase());
  const level = Number(user.approval_level ?? user.approvalLevel ?? 0);
  if (!isDccUser && (!isOwningDept || level < 4)) {
    throw new Error('เฉพาะผู้รับผิดชอบของแผนกนั้น (ระดับ L4 ขึ้นไป) หรือ DCC เท่านั้นที่สามารถลบแผนงานได้');
  }

  const trimmedReason = String(reason || '').trim();
  if (!trimmedReason) throw new Error('กรุณาระบุเหตุผลการลบแผนงาน');

  const nextPlans = allPlans.filter((p) => p.id !== id);
  if (existing.parent_plan_id) {
    const parentIdx = nextPlans.findIndex((p) => p.id === existing.parent_plan_id);
    if (parentIdx !== -1 && nextPlans[parentIdx].status === 'APPROVED') {
      nextPlans[parentIdx] = { ...nextPlans[parentIdx], is_current: 1, effective_status: 'CURRENT' };
    }
  }
  setLocalPlans(nextPlans);

  const nextItems = getLocalPlanItems().filter((it) => it.plan_id !== id);
  setLocalPlanItems(nextItems);

  appendLocalAudit('VCC_PLAN_DELETED', {
    plan_id: id,
    plan_year: existing.plan_year,
    department: existing.department,
    document_code: existing.document_code,
    revision: existing.revision,
    reason: trimmedReason
  });

  return { success: true, message: 'ลบแผนงานฉบับร่างเรียบร้อยแล้ว', deleted_id: id };
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
  if (Number(asset.is_group) === 1 && asset.group_nature !== 'COMPOSITE_SET') {
    throw new Error('ยกเลิกการเพิ่มกลุ่มเครื่องมือแม่เข้าแผนประจำปีแล้ว กรุณาเลือกเครื่องมือวัดรายตัวหรือชุดเครื่องมือจริง');
  }
  // Same rule as the server: a reason with no months is allowed for a paused asset that the plan scope lists
  const reasonOnlyForPausedAsset = (payload.planned_months || []).length === 0 && ['ON_HOLD', 'UNDER_REPAIR'].includes(asset.status);
  if (asset.status !== 'ACTIVE' && !reasonOnlyForPausedAsset) {
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
    mpe: String(payload.mpe || '').trim(),
    acceptance_criteria: String(payload.acceptance_criteria || '').trim(),
    calibration_points: String(payload.calibration_points || '').trim(),
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
  if (!target) {
    throw new Error(String(itemId).startsWith('virtual-')
      ? 'รายการนี้ยังไม่ได้บันทึกเข้าแผน (เครื่องมืออยู่ในทะเบียนอยู่แล้ว) จึงไม่มีรายการให้นำออก'
      : 'ไม่พบรายการเครื่องมือในแผนนี้');
  }
  setLocalPlanItems(allItems.filter((i) => i.id !== itemId));
  appendLocalAudit('VCC_PLAN_ITEM_REMOVED', { plan_id: planId, item_id: itemId, asset_id: target.asset_id });
  const detail = await fetchVccPlanDetail(planId);
  return { items: detail.items };
};

export const convertVccPlanGroupItem = async (planId, itemId, payload = {}) => {
  if (isApiMode) {
    return apiPost(`/api/vcc/plans/${encodeURIComponent(planId)}/items/${encodeURIComponent(itemId)}/convert-group`, payload);
  }
  assertLocalVccAccess();
  const allPlans = getLocalPlans();
  const plan = allPlans.find((p) => p.id === planId);
  if (!plan) throw new Error('ไม่พบแผนการสอบเทียบประจำปี');
  if (plan.status !== 'DRAFT' && plan.status !== 'REJECTED') {
    throw new Error('ปรับรายการกลุ่มเดิมได้เฉพาะแผนในสถานะร่าง (DRAFT) หรือส่งกลับแก้ไข (REJECTED) เท่านั้น ห้ามแก้แผนที่อนุมัติแล้ว');
  }

  const allItems = getLocalPlanItems();
  const allAssets = getLocalAssets();
  const groupItem = allItems.find((i) => i.id === itemId && i.plan_id === planId);
  if (!groupItem) throw new Error('ไม่พบรายการกลุ่มเดิมในแผนนี้');
  const groupAsset = allAssets.find((a) => a.id === groupItem.asset_id);
  if (!groupAsset || Number(groupAsset.is_group) !== 1 || groupAsset.group_nature === 'COMPOSITE_SET') {
    throw new Error('รายการที่ระบุไม่ใช่กลุ่มเครื่องมือเดิม (Logical Group)');
  }

  const rawSelections = Array.isArray(payload.selections)
    ? payload.selections
    : (Array.isArray(payload.items) ? payload.items : []);
  const confirmRemoveEmpty = payload.confirm_remove_empty === true;
  if (rawSelections.length === 0 && !confirmRemoveEmpty) {
    throw new Error('กรุณาเลือกเครื่องมือวัดรายตัวอย่างน้อย 1 รายการ หรือยืนยันการลบรายการกลุ่มเดิมออก');
  }

  const seenAssetIds = new Set();
  const validated = [];
  for (const sel of rawSelections) {
    const targetAssetId = String(sel?.asset_id || '').trim();
    if (!targetAssetId) throw new Error('รหัสเครื่องมือในรายการที่เลือกไม่ถูกต้อง');
    if (seenAssetIds.has(targetAssetId)) throw new Error('พบการเลือกเครื่องมือซ้ำกันในรายการแปลงข้อมูล');
    seenAssetIds.add(targetAssetId);

    const targetAsset = allAssets.find((a) => a.id === targetAssetId);
    if (!targetAsset) throw new Error(`ไม่พบเครื่องมือรหัส ${targetAssetId} ในทะเบียนเครื่องมือ`);
    if (Number(targetAsset.is_group) === 1 && targetAsset.group_nature !== 'COMPOSITE_SET') {
      throw new Error(`ไม่สามารถเลือกกลุ่มเครื่องมือแม่ (${targetAsset.asset_code}) แทนเครื่องมือรายตัวได้`);
    }
    if (targetAsset.status !== 'ACTIVE') {
      throw new Error(`เครื่องมือ ${targetAsset.asset_code} ไม่ได้อยู่ในสถานะใช้งานปกติ (ACTIVE)`);
    }

    const plannedMonths = [...new Set((sel.planned_months || []).map(Number).filter((m) => m >= 1 && m <= 12))].sort((a, b) => a - b);
    const remarks = String(sel.remarks || '').trim();
    if (plannedMonths.length === 0 && !remarks) {
      throw new Error(`กรุณากำหนดเดือนทวนสอบด้วยตนเอง หรือระบุเหตุผลที่ไม่วางแผนของเครื่องมือ ${targetAsset.asset_code}`);
    }

    validated.push({
      asset: targetAsset,
      plannedMonths,
      dueDates: computeDueDates(plan.plan_year, plannedMonths, plan.due_date_rule),
      remarks,
      providerName: String(sel.provider_name || groupItem.provider_name || 'ทวนสอบภายใน').trim(),
      frequencyLabel: String(sel.frequency_label || groupItem.frequency_label || 'รายปี').trim(),
      responsibleDept: String(sel.responsible_dept || targetAsset.department || plan.department).trim().toUpperCase(),
      responsibleLabel: String(sel.responsible_label ?? groupItem.responsible_label ?? '').trim()
    });
  }

  const nextItems = allItems.filter((i) => i.id !== itemId);
  const convertedSummary = [];
  for (const entry of validated) {
    const existingIdx = nextItems.findIndex((i) => i.plan_id === planId && i.asset_id === entry.asset.id);
    const itemObj = {
      id: existingIdx >= 0 ? nextItems[existingIdx].id : `vcc-pi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      plan_id: planId,
      asset_id: entry.asset.id,
      provider_name: entry.providerName,
      frequency_label: entry.frequencyLabel,
      planned_months: entry.plannedMonths,
      due_dates: entry.dueDates,
      responsible_dept: entry.responsibleDept,
      responsible_label: entry.responsibleLabel,
      remarks: entry.remarks,
      sort_order: existingIdx >= 0 ? nextItems[existingIdx].sort_order : (groupItem.sort_order ?? nextItems.length + 1)
    };
    if (existingIdx >= 0) {
      nextItems[existingIdx] = itemObj;
    } else {
      nextItems.push(itemObj);
    }
    convertedSummary.push({
      item_id: itemObj.id,
      asset_id: entry.asset.id,
      asset_code: entry.asset.asset_code,
      planned_months: entry.plannedMonths,
      remarks: entry.remarks
    });
  }

  setLocalPlanItems(nextItems);
  appendLocalAudit('VCC_PLAN_GROUP_CONVERTED', {
    plan_id: planId,
    removed_group_item_id: itemId,
    removed_group_asset_id: groupItem.asset_id,
    removed_group_asset_code: groupAsset.asset_code,
    converted_items: convertedSummary
  });

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
  if (item.is_group === 1 && item.group_nature !== 'COMPOSITE_SET') {
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

/**
 * Dispatches workflow event notifications for VCC Annual Plans into the central notification store.
 */
export const notifyPlanWorkflowEvent = ({
  type,
  plan,
  user,
  comment = '',
  reason = '',
  reviewerId = null,
  approverId = null
}) => {
  if (!plan) return null;
  const store = useStore.getState();
  const currentUser = user || store.currentUser || {};
  const planYear = plan.plan_year || plan.year || '';
  const dept = plan.department || '';
  const rev = plan.revision || '00';
  const creatorName = plan.prepared_by_name || currentUser.name || plan.created_by_name || 'ผู้จัดทำ';
  const creatorId = plan.prepared_by || plan.created_by || null;
  const reviewerName = currentUser.name || plan.reviewed_by_name || 'ผู้ตรวจ';
  const trimmedReason = String(reason || plan.rejected_reason || comment || '').trim();

  let title = '';
  let message = '';
  let severity = 'INFO';
  let targetDepartment = null;
  let targetUserId = null;
  let targetUserIds = [];
  let targetRole = null;
  let minApprovalLevel = null;

  if (type === 'VCC_PLAN_PENDING_REVIEW') {
    title = 'แผนการทวนสอบประจำปีรอการทบทวน';
    message = `แผนประจำปี ${planYear} (${dept}) ส่งเข้าสู่กระบวนการทบทวนโดย ${creatorName}`;
    severity = 'INFO';
    targetDepartment = dept;
    targetRole = 'REVIEWER';
    minApprovalLevel = 5;
    const assignedId = reviewerId || plan.assigned_reviewer_id;
    if (assignedId) {
      targetUserId = assignedId;
      targetUserIds = [assignedId];
    }
  } else if (type === 'VCC_PLAN_PENDING_APPROVAL') {
    title = 'แผนการทวนสอบประจำปีรอการอนุมัติ';
    message = `แผนประจำปี ${planYear} (${dept}) ได้รับการทบทวนแล้ว รอการอนุมัติขั้นสุดท้าย`;
    severity = 'INFO';
    targetDepartment = dept;
    targetRole = 'APPROVER';
    minApprovalLevel = 6;
    const assignedId = approverId || plan.assigned_approver_id;
    if (assignedId) {
      targetUserId = assignedId;
      targetUserIds = [assignedId];
    }
  } else if (type === 'VCC_PLAN_APPROVED') {
    title = 'แผนการทวนสอบประจำปีได้รับการอนุมัติแล้ว';
    message = `แผนประจำปี ${planYear} (${dept}) Rev.${rev} ได้รับการอนุมัติและมีผลบังคับใช้แล้ว`;
    severity = 'SUCCESS';
    targetDepartment = dept;
    targetUserId = creatorId;
    if (creatorId) {
      targetUserIds = [creatorId];
    }
  } else if (type === 'VCC_PLAN_RETURNED' || type === 'VCC_PLAN_REJECTED') {
    title = 'แผนการทวนสอบประจำปีถูกส่งกลับแก้ไข';
    message = `แผนประจำปี ${planYear} (${dept}) ถูกส่งกลับแก้ไขโดย ${reviewerName}: ${trimmedReason}`;
    severity = 'WARNING';
    type = 'VCC_PLAN_RETURNED';
    targetUserId = creatorId;
    targetUserIds = creatorId ? [creatorId] : [];
  }

  const notifObj = {
    id: `notif-vcc-plan-${plan.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    message,
    type,
    category: 'VCC_PLAN',
    module: 'VCC',
    severity,
    link: '/vcc/plans',
    planId: plan.id,
    refId: plan.id,
    targetDepartment,
    targetUserId,
    targetUserIds,
    targetRole,
    minApprovalLevel,
    isGlobal: false,
    timestamp: new Date().toISOString(),
    created_at: new Date().toISOString()
  };

  if (typeof store.addNotification === 'function') {
    store.addNotification(notifObj);
  }

  try {
    syncVccNotifications().catch(() => {});
  } catch {}

  return notifObj;
};

export const submitVccPlan = async (planId, maybeAssignees = {}, maybeApproverId = '') => {
  let reviewerId = '';
  let approverId = '';
  if (typeof maybeAssignees === 'object' && maybeAssignees !== null) {
    reviewerId = maybeAssignees.reviewerId || maybeAssignees.reviewer_id || '';
    approverId = maybeAssignees.approverId || maybeAssignees.approver_id || '';
  } else if (typeof maybeAssignees === 'string') {
    reviewerId = maybeAssignees;
    approverId = typeof maybeApproverId === 'string' ? maybeApproverId : '';
  }
  if (isApiMode) {
    const { plan } = await apiPost(`/api/vcc/plans/${encodeURIComponent(planId)}/submit`, {
      reviewer_id: reviewerId,
      approver_id: approverId
    });
    notifyPlanWorkflowEvent({
      type: 'VCC_PLAN_PENDING_REVIEW',
      plan,
      user: useStore.getState().currentUser,
      reviewerId,
      approverId
    });
    await syncVccTasks().catch(() => {});
    return plan;
  }
  const user = assertLocalVccAccess();
  if (!isVccAuthorized(user)) {
    throw new Error('เฉพาะผู้ใช้งานแผนก DCC, QC, QA, MGT และ LB เท่านั้นที่สามารถเข้าใช้งานส่วนนี้ได้');
  }
  const allPlans = getLocalPlans();
  const idx = allPlans.findIndex((p) => p.id === planId);
  if (idx === -1) throw new Error('ไม่พบแผนการสอบเทียบประจำปี');
  const plan = allPlans[idx];
  if (!isUserAuthorizedForPlanDept(user, plan.department)) {
    throw new Error(`คุณไม่มีสิทธิ์ส่งแผนการสอบเทียบของแผนก ${plan.department}`);
  }
  if (plan.status !== 'DRAFT' && plan.status !== 'REJECTED') {
    throw new Error('ส่งทบทวนได้เฉพาะแผนที่อยู่ในสถานะร่าง (DRAFT) หรือส่งกลับแก้ไข (REJECTED) เท่านั้น');
  }
  const detail = await fetchVccPlanDetail(planId);
  const items = detail.items || [];
  if (items.length === 0) {
    throw new Error('กรุณาเพิ่มรายการเครื่องมือในแผนอย่างน้อย 1 รายการก่อนส่งขออนุมัติ');
  }

  // Submission gate 1: Block submission if any legacy Logical Group items remain unresolved in DRAFT/REJECTED plan
  const groupItems = items.filter((i) => Number(i.is_group) === 1 && i.group_nature !== 'COMPOSITE_SET');
  if (groupItems.length > 0) {
    const groupCodes = groupItems.map((i) => i.asset_code).join(', ');
    throw new Error(`พบรายการกลุ่มเครื่องมือเดิม (${groupCodes}) ค้างอยู่ในแผน กรุณาปรับเป็นเครื่องมือรายตัวก่อนส่งทบทวนแผน`);
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

  const users = useStore.getState().masterUsers || [];
  const assignedReviewer = users.find((u) => u.id === reviewerId);
  const assignedApprover = users.find((u) => u.id === approverId);

  const prevAudit = getLocalAudit().filter(
    (h) => String(h.action || '') === 'VCC_PLAN_SUBMITTED' && h.details?.plan_id === planId
  );
  const workflowRound = prevAudit.length + 1;

  const now = new Date().toISOString();
  const updated = {
    ...plan,
    status: 'PENDING_REVIEW',
    prepared_by: user.id,
    prepared_by_name: user.name,
    prepared_by_position: user.position || 'DCC',
    prepared_at: now,
    assigned_reviewer_id: reviewerId || null,
    assigned_reviewer_name: assignedReviewer?.name || null,
    assigned_reviewer_position: assignedReviewer?.position || null,
    assigned_approver_id: approverId || null,
    assigned_approver_name: assignedApprover?.name || null,
    assigned_approver_position: assignedApprover?.position || null,
    reviewed_by: null,
    reviewed_at: null,
    review_comment: null,
    approved_by: null,
    approved_at: null,
    approval_comment: null,
    rejected_by: null,
    rejected_at: null,
    rejected_reason: null,
    workflow_round: workflowRound,
    updated_at: now,
    updated_by: user.id
  };
  const next = [...allPlans];
  next[idx] = updated;
  setLocalPlans(next);
  appendLocalAudit('VCC_PLAN_SUBMITTED', {
    plan_id: planId,
    plan_year: plan.plan_year,
    department: plan.department,
    revision: plan.revision,
    workflow_round: workflowRound,
    is_resubmission: plan.status === 'REJECTED',
    assigned_reviewer_id: reviewerId || null,
    assigned_approver_id: approverId || null,
    task_reference: `api-vcc-plan-${planId}-review`,
    before: { status: plan.status },
    after: { status: 'PENDING_REVIEW' }
  });
  notifyPlanWorkflowEvent({
    type: 'VCC_PLAN_PENDING_REVIEW',
    plan: updated,
    user,
    reviewerId,
    approverId
  });
  await syncVccTasks(user).catch(() => {});
  return enrichLocalPlan(updated, getLocalPlanItems(), getDepartmentMap());
};

export const reviewVccPlan = async (planId, comment = '') => {
  if (isApiMode) {
    const { plan } = await apiPost(`/api/vcc/plans/${encodeURIComponent(planId)}/review`, { comment });
    notifyPlanWorkflowEvent({
      type: 'VCC_PLAN_PENDING_APPROVAL',
      plan,
      user: useStore.getState().currentUser,
      comment
    });
    await syncVccTasks().catch(() => {});
    return plan;
  }
  const user = useStore.getState().currentUser;
  if (!user) throw new Error('กรุณาเข้าสู่ระบบ');
  if (!isVccAuthorized(user)) {
    throw new Error('เฉพาะผู้ใช้งานแผนก DCC, QC, QA, MGT และ LB เท่านั้นที่สามารถเข้าใช้งานส่วนนี้ได้');
  }
  const allPlans = getLocalPlans();
  const idx = allPlans.findIndex((p) => p.id === planId);
  if (idx === -1) throw new Error('ไม่พบแผนการสอบเทียบประจำปี');
  const plan = allPlans[idx];
  if (!isUserAuthorizedForPlanDept(user, plan.department)) {
    throw new Error(`คุณไม่มีสิทธิ์ทบทวนแผนการสอบเทียบของแผนก ${plan.department}`);
  }
  if (plan.status !== 'PENDING_REVIEW') {
    throw new Error('แผนนี้ไม่อยู่ในสถานะรอทบทวน (PENDING_REVIEW)');
  }
  const settings = getLocalPlanSettings();
  const thresholds = getLocalThresholds(settings.approval_doc_type);
  const userLevel = Number(user.approval_level ?? user.approvalLevel ?? 4);
  if (plan.assigned_reviewer_id && user.id !== plan.assigned_reviewer_id && !user.isDcc && !user.isQmr && userLevel < 6) {
    throw new Error('แผนนี้ถูกมอบหมายให้ผู้ทบทวนรายอื่นดำเนินการ');
  }
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
    plan_year: plan.plan_year,
    department: plan.department,
    revision: plan.revision,
    workflow_round: plan.workflow_round || 1,
    comment: updated.review_comment,
    task_reference: `api-vcc-plan-${planId}-review`,
    next_task_reference: `api-vcc-plan-${planId}-approve`,
    before: { status: 'PENDING_REVIEW' },
    after: { status: 'PENDING_APPROVAL' }
  });
  notifyPlanWorkflowEvent({
    type: 'VCC_PLAN_PENDING_APPROVAL',
    plan: updated,
    user,
    comment
  });
  await syncVccTasks(user).catch(() => {});
  return enrichLocalPlan(updated, getLocalPlanItems(), getDepartmentMap());
};

export const approveVccPlan = async (planId, comment = '') => {
  if (isApiMode) {
    const { plan } = await apiPost(`/api/vcc/plans/${encodeURIComponent(planId)}/approve`, { comment });
    notifyPlanWorkflowEvent({
      type: 'VCC_PLAN_APPROVED',
      plan,
      user: useStore.getState().currentUser,
      comment
    });
    await syncVccTasks().catch(() => {});
    return plan;
  }
  const user = useStore.getState().currentUser;
  if (!user) throw new Error('กรุณาเข้าสู่ระบบ');
  if (!isVccAuthorized(user)) {
    throw new Error('เฉพาะผู้ใช้งานแผนก DCC, QC, QA, MGT และ LB เท่านั้นที่สามารถเข้าใช้งานส่วนนี้ได้');
  }
  const allPlans = getLocalPlans();
  const idx = allPlans.findIndex((p) => p.id === planId);
  if (idx === -1) throw new Error('ไม่พบแผนการสอบเทียบประจำปี');
  const plan = allPlans[idx];
  if (!isUserAuthorizedForPlanDept(user, plan.department)) {
    throw new Error(`คุณไม่มีสิทธิ์อนุมัติแผนการสอบเทียบของแผนก ${plan.department}`);
  }
  if (plan.status !== 'PENDING_APPROVAL') {
    throw new Error('แผนนี้ไม่อยู่ในสถานะรออนุมัติ (PENDING_APPROVAL)');
  }
  const settings = getLocalPlanSettings();
  const thresholds = getLocalThresholds(settings.approval_doc_type);
  const userLevel = Number(user.approval_level ?? user.approvalLevel ?? 4);
  if (plan.assigned_approver_id && user.id !== plan.assigned_approver_id && !user.isDcc && !user.isQmr && userLevel < 6) {
    throw new Error('แผนนี้ถูกมอบหมายให้ผู้อนุมัติรายอื่นดำเนินการ');
  }
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

  // Auto-generate local work orders for all calibratable planned cycles
  try {
    const STORAGE_WO_KEY = 'qms-vcc-local-work-orders-v1';
    const existingWos = readJson(STORAGE_WO_KEY, () => []);
    const planItems = getLocalPlanItems().filter((i) => i.plan_id === planId);
    const calibratableItems = planItems.filter((i) => Number(i.is_group) === 0 || i.group_nature === 'COMPOSITE_SET');
    const newWos = [...existingWos];
    let maxSeq = 0;
    for (const w of newWos) {
      const parts = (w.wo_code || '').split('-');
      if (parts.length >= 3) {
        const num = parseInt(parts[2], 10);
        if (!Number.isNaN(num) && num > maxSeq) maxSeq = num;
      }
    }
    for (const item of calibratableItems) {
      const months = Array.isArray(item.planned_months) ? item.planned_months : [];
      for (const m of months) {
        const cycleKey = `${plan.plan_year}:${plan.department}:${item.asset_id}:${m}`;
        const cycleId = `cyc-${item.id}-${m}`;
        const already = newWos.find((w) => w.cycle_id === cycleId || w.cycle_key === cycleKey || (w.plan_item_id === item.id && w.planned_month === m));
        if (!already) {
          maxSeq += 1;
          const dueDate = computeDueDateForMonth(plan.plan_year, m, plan.due_date_rule || 'END_OF_MONTH');
          newWos.push({
            id: `vcc-wo-${crypto.randomUUID()}`,
            wo_code: `WO-${plan.plan_year}-${String(maxSeq).padStart(3, '0')}`,
            cycle_id: cycleId,
            cycle_key: cycleKey,
            plan_year: plan.plan_year,
            plan_revision: plan.revision || '00',
            plan_id: planId,
            plan_item_id: item.id,
            planned_month: m,
            asset_id: item.asset_id,
            provider_name: item.provider_name || 'ทวนสอบภายใน',
            baseline_planned_date: dueDate,
            scheduled_date: dueDate,
            due_date: dueDate,
            original_due_date: dueDate,
            required_due_date: dueDate,
            is_carryover: 0,
            status: 'SCHEDULED',
            result_status: 'PENDING',
            created_at: now,
            created_by: user.id,
            updated_at: now,
            updated_by: user.id
          });
        }
      }
    }
    writeJson(STORAGE_WO_KEY, newWos);
  } catch {}

  appendLocalAudit('VCC_PLAN_APPROVED', {
    plan_id: planId,
    plan_year: plan.plan_year,
    department: plan.department,
    revision: plan.revision,
    workflow_round: plan.workflow_round || 1,
    comment: updated.approval_comment,
    task_reference: `api-vcc-plan-${planId}-approve`,
    before: { status: 'PENDING_APPROVAL' },
    after: { status: 'APPROVED' }
  });
  notifyPlanWorkflowEvent({
    type: 'VCC_PLAN_APPROVED',
    plan: updated,
    user,
    comment
  });
  await syncVccTasks(user).catch(() => {});
  return enrichLocalPlan(updated, getLocalPlanItems(), getDepartmentMap());
};

export const rejectVccPlan = async (planId, reason = '') => {
  if (isApiMode) {
    const { plan } = await apiPost(`/api/vcc/plans/${encodeURIComponent(planId)}/reject`, { reason });
    notifyPlanWorkflowEvent({
      type: 'VCC_PLAN_RETURNED',
      plan,
      user: useStore.getState().currentUser,
      reason
    });
    await syncVccTasks().catch(() => {});
    return plan;
  }
  const user = useStore.getState().currentUser;
  if (!user) throw new Error('กรุณาเข้าสู่ระบบ');
  if (!isVccAuthorized(user)) {
    throw new Error('เฉพาะผู้ใช้งานแผนก DCC, QC, QA, MGT และ LB เท่านั้นที่สามารถเข้าใช้งานส่วนนี้ได้');
  }
  const trimmedReason = String(reason || '').trim();
  if (!trimmedReason) throw new Error('กรุณาระบุเหตุผลในการส่งกลับแก้ไข');

  const allPlans = getLocalPlans();
  const idx = allPlans.findIndex((p) => p.id === planId);
  if (idx === -1) throw new Error('ไม่พบแผนการสอบเทียบประจำปี');
  const plan = allPlans[idx];
  if (!isUserAuthorizedForPlanDept(user, plan.department)) {
    throw new Error(`คุณไม่มีสิทธิ์ส่งกลับแก้ไขแผนการสอบเทียบของแผนก ${plan.department}`);
  }
  if (plan.status !== 'PENDING_REVIEW' && plan.status !== 'PENDING_APPROVAL') {
    throw new Error('ส่งกลับแก้ไขได้เฉพาะแผนที่รอทบทวนหรือรออนุมัติเท่านั้น');
  }
  const settings = getLocalPlanSettings();
  const thresholds = getLocalThresholds(settings.approval_doc_type);
  const requiredLevel = plan.status === 'PENDING_REVIEW'
    ? thresholds.required_reviewer_level
    : thresholds.required_approver_level;
  const userLevel = Number(user.approval_level ?? user.approvalLevel ?? 4);

  if (plan.status === 'PENDING_REVIEW' && plan.assigned_reviewer_id && user.id !== plan.assigned_reviewer_id && !user.isDcc && !user.isQmr && userLevel < 6) {
    throw new Error('แผนนี้ถูกมอบหมายให้ผู้ทบทวนรายอื่นดำเนินการ');
  }
  if (plan.status === 'PENDING_APPROVAL' && plan.assigned_approver_id && user.id !== plan.assigned_approver_id && !user.isDcc && !user.isQmr && userLevel < 6) {
    throw new Error('แผนนี้ถูกมอบหมายให้ผู้อนุมัติรายอื่นดำเนินการ');
  }
  if (plan.status === 'PENDING_APPROVAL' && user.id === plan.reviewed_by) {
    throw new Error('ผู้ทบทวนไม่สามารถพิจารณาอนุมัติหรือส่งกลับแผนในขั้นตอนอนุมัติได้');
  }
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
    reject_reason: trimmedReason,
    updated_at: now,
    updated_by: user.id
  };
  const next = [...allPlans];
  next[idx] = updated;
  setLocalPlans(next);
  appendLocalAudit('VCC_PLAN_REJECTED', {
    plan_id: planId,
    plan_year: plan.plan_year,
    department: plan.department,
    revision: plan.revision,
    workflow_round: plan.workflow_round || 1,
    reason: trimmedReason,
    return_reason: trimmedReason,
    stage: plan.status,
    task_reference: plan.status === 'PENDING_REVIEW' ? `api-vcc-plan-${planId}-review` : `api-vcc-plan-${planId}-approve`,
    next_task_reference: `api-vcc-plan-${planId}-revise`,
    before: { status: plan.status },
    after: { status: 'REJECTED' }
  });
  notifyPlanWorkflowEvent({
    type: 'VCC_PLAN_RETURNED',
    plan: updated,
    user,
    reason: trimmedReason
  });
  await syncVccTasks(user).catch(() => {});
  return enrichLocalPlan(updated, getLocalPlanItems(), getDepartmentMap());
};

export const getVccPlanPdfUrl = (planId) => `/api/vcc/plans/${encodeURIComponent(planId)}/pdf`;

export const fetchApprovedPlanPdf = async (planId, purpose = 'view') => {
  const token = sessionStorage.getItem('qms-api-token');
  const res = await fetch(`/api/vcc/plans/${encodeURIComponent(planId)}/pdf?purpose=${encodeURIComponent(purpose)}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'ไม่สามารถเปิดเอกสารทางการ PDF ได้');
  }
  return res.blob();
};
