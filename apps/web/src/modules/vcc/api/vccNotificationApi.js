import { apiGet, apiPost, apiBlob, isApiMode } from '../../../api/client';
import useStore from '../../../store/useStore';
import {
  readJson,
  writeJson,
  getLocalAssets,
  assertLocalVccAccess,
  getLocalAudit,
  appendLocalAudit
} from './vccApi';
import { getLocalWos } from './vccWorkOrderApi';

const STORAGE_NOTIFICATIONS_KEY = 'qms-vcc-local-notifications-v1';

export const getLocalNotifications = () => readJson(STORAGE_NOTIFICATIONS_KEY, () => []);
export const setLocalNotifications = (list) => writeJson(STORAGE_NOTIFICATIONS_KEY, list);

const csvCell = (val) => {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  if (/^[=+\-@]/.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
};

/**
 * Fetch VCC notifications with filtering & pagination
 */
export const fetchVccNotifications = async (params = {}) => {
  if (isApiMode) {
    const query = new URLSearchParams();
    if (params.department) query.set('department', params.department);
    if (params.status) query.set('status', params.status);
    if (params.type) query.set('type', params.type);
    if (params.level) query.set('level', params.level);
    if (params.severity) query.set('severity', params.severity);
    if (params.limit) query.set('limit', params.limit);
    if (params.offset) query.set('offset', params.offset);

    const queryString = query.toString();
    const url = `/api/vcc/notifications${queryString ? `?${queryString}` : ''}`;
    return await apiGet(url);
  }

  assertLocalVccAccess();
  let list = getLocalNotifications();
  const user = useStore.getState().currentUser;
  const userDepts = [user?.department, user?.primary_department, ...(user?.departments || [])].filter(Boolean);
  const isGlobal = Boolean(user?.isDcc || user?.isQmr || Number(user?.approval_level || 0) >= 6);

  if (!isGlobal) {
    list = list.filter((n) => userDepts.includes(n.department));
  }

  if (params.department && params.department !== 'ALL') {
    list = list.filter((n) => n.department === params.department);
  }
  if (params.status && params.status !== 'ALL') {
    list = list.filter((n) => n.status === params.status);
  }
  if (params.type) {
    list = list.filter((n) => n.notification_type === params.type);
  }
  if (params.level) {
    list = list.filter((n) => n.escalation_level === Number(params.level));
  }
  if (params.severity) {
    list = list.filter((n) => n.severity === params.severity);
  }

  const total = list.length;
  const offset = Number(params.offset || 0);
  const limit = Number(params.limit || 50);
  const sliced = list.slice(offset, offset + limit);

  return {
    notifications: sliced,
    total,
    limit,
    offset
  };
};

/**
 * Acknowledge a notification
 */
export const acknowledgeVccNotification = async (id, note = '') => {
  if (isApiMode) {
    return await apiPost(`/api/vcc/notifications/${id}/acknowledge`, { note });
  }

  assertLocalVccAccess();
  const user = useStore.getState().currentUser;
  const list = getLocalNotifications();
  const notif = list.find((n) => n.id === id);
  if (!notif) {
    throw new Error('ไม่พบรายการแจ้งเตือน');
  }

  const updated = {
    ...notif,
    status: 'ACKNOWLEDGED',
    acknowledged_at: new Date().toISOString(),
    acknowledged_by: user?.id || 'local-user',
    acknowledged_by_name: user?.name || 'Local User',
    acknowledgement_note: note || null,
    updated_at: new Date().toISOString()
  };

  setLocalNotifications(list.map((n) => (n.id === id ? updated : n)));

  appendLocalAudit({
    action: 'VCC_NOTIFICATION_ACKNOWLEDGED',
    target_id: id,
    details: {
      notification_id: id,
      notification_type: notif.notification_type,
      note
    }
  });

  return {
    notification: updated,
    message: 'รับทราบการแจ้งเตือนเรียบร้อยแล้ว'
  };
};

/**
 * Trigger manual notification sweep (DCC only)
 */
export const triggerVccNotificationSweep = async (nowDate = null) => {
  if (isApiMode) {
    return await apiPost('/api/vcc/notifications/sweep', { now_date: nowDate });
  }

  assertLocalVccAccess();
  return { success: true, summary: runLocalSweep(nowDate) };
};

const ACTIVE_WO_STATUSES = ['SCHEDULED', 'OPEN', 'IN_PROGRESS', 'PENDING_REVIEW', 'REJECTED'];
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

// shortcut: demo-mode copy of the server sweep with fixed tiers (overdue 7/14 days, due soon 30/7 days, on hold);
// the API sweep in vccNotifications.js is the real rule and reads its day counts from settings.
const runLocalSweep = (nowDate = null) => {
  const ref = useStore.getState().getEffectiveToday?.() || new Date();
  const today = nowDate ? String(nowDate).slice(0, 10) : new Date(ref.getTime() - ref.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const wanted = new Map();
  const want = (key, fields) => wanted.set(key, { dedup_key: key, target_role: 'PERFORMER', escalation_level: 1, ...fields });

  // Stored work orders hold only the asset id; code, name and department come from the asset register.
  const assets = getLocalAssets();
  const assetById = new Map(assets.map((x) => [x.id, x]));
  for (const row of getLocalWos()) {
    const asset = assetById.get(row.asset_id) || {};
    const wo = { ...row, asset_code: row.asset_code || asset.asset_code, asset_name: row.asset_name || asset.name, department: row.department || asset.department };
    if (!ACTIVE_WO_STATUSES.includes(wo.status)) continue;
    const due = String(wo.required_due_date || wo.original_due_date || wo.due_date || '').slice(0, 10);
    if (!due) continue;
    const diff = dayDiff(due, today);
    if (diff > 30) continue;
    const base = {
      reference_type: 'VCC_WORK_ORDER', reference_id: wo.id, work_order_id: wo.id, wo_code: wo.wo_code, asset_id: wo.asset_id,
      asset_code: wo.asset_code, asset_name: wo.asset_name, department: wo.department, due_date: due, days_offset: Math.abs(diff)
    };
    if (diff < 0) {
      const tier = -diff >= 14 ? 3 : (-diff >= 7 ? 2 : 1);
      const type = ['OVERDUE_L1', 'OVERDUE_L2_ESCALATED', 'OVERDUE_L3_CRITICAL'][tier - 1];
      want(`WO:${wo.id}:${type}`, {
        ...base, notification_type: type, escalation_level: tier, severity: tier === 1 ? 'WARNING' : 'CRITICAL',
        title: `[เลยกำหนด L${tier}] เครื่องมือ ${wo.asset_code} เกินกำหนด ${-diff} วัน`,
        message: `ใบสั่งงาน ${wo.wo_code} ของเครื่องมือ ${wo.asset_code} (${wo.asset_name}) เกินกำหนดทวนสอบแล้ว ${-diff} วัน (ครบกำหนด ${due})`
      });
    } else {
      const type = diff <= 7 ? 'DUE_SOON_7' : 'DUE_SOON_30';
      want(`WO:${wo.id}:${type}`, {
        ...base, notification_type: type, severity: diff <= 7 ? 'WARNING' : 'INFO',
        title: `[ใกล้ครบกำหนด] เครื่องมือ ${wo.asset_code} อีก ${diff} วัน`,
        message: `ใบสั่งงาน ${wo.wo_code} ของเครื่องมือ ${wo.asset_code} (${wo.asset_name}) จะครบกำหนดวันที่ ${due}`
      });
    }
  }
  for (const asset of assets) {
    if (asset.status !== 'ON_HOLD') continue;
    want(`NC:${asset.id}:NC_ON_HOLD_ACTION`, {
      notification_type: 'NC_ON_HOLD_ACTION', reference_type: 'VCC_ASSET', reference_id: asset.id, asset_id: asset.id,
      asset_code: asset.asset_code, asset_name: asset.name, department: asset.department, severity: 'CRITICAL', days_offset: 0,
      title: `[เครื่องมือถูกระงับใช้/NC] เครื่องมือ ${asset.asset_code} ติดสถานะ ON_HOLD`,
      message: `เครื่องมือ ${asset.asset_code} (${asset.name}) ถูกระงับการใช้งาน อยู่ระหว่างรอการประเมินผลกระทบต่อผลิตภัณฑ์`
    });
  }

  const summary = { created: 0, updated: 0, escalated: 0, resolved: 0 };
  const now = new Date().toISOString();
  const list = getLocalNotifications().map((n) => {
    if (n.status === 'RESOLVED') return n;
    const next = wanted.get(n.dedup_key);
    if (next) {
      wanted.delete(n.dedup_key);
      summary.updated++;
      return { ...n, ...next, updated_at: now };
    }
    summary.resolved++;
    return { ...n, status: 'RESOLVED', resolved_at: now, resolved_reason: 'CONDITION_CLEARED', updated_at: now };
  });
  for (const n of wanted.values()) {
    list.unshift({ id: `NTF-${n.dedup_key}-${Date.now().toString(36)}`, status: 'PENDING', created_at: now, updated_at: now, ...n });
    summary.created++;
    if (n.escalation_level > 1) summary.escalated++;
  }
  setLocalNotifications(list);
  return summary;
};

const bellLink = (n) => {
  if (n.reference_type === 'VCC_PLAN' || (n.notification_type && n.notification_type.startsWith('VCC_PLAN_'))) {
    return '/vcc/plans';
  }
  return n.work_order_id ? `/vcc/work-orders?wo=${encodeURIComponent(n.work_order_id)}` : '/vcc/assets';
};

/**
 * Loads what is waiting for the current user into the store, where the shared bell reads it next to the DCC
 * notifications. A user without VCC access simply gets an empty list.
 */
export const syncVccNotifications = async () => {
  let rows = [];
  try {
    if (isApiMode) {
      rows = (await apiGet('/api/vcc/notifications/inbox')).notifications || [];
    } else {
      assertLocalVccAccess();
      runLocalSweep();
      rows = (await fetchVccNotifications({ status: 'PENDING', limit: 200 })).notifications;
    }
  } catch {
    rows = [];
  }
  useStore.setState({
    vccNotifications: rows.map((n) => ({
      id: `vcc-${n.id}`, vccId: n.id, module: 'VCC', isEvent: n.reference_type === 'VCC_WO_EVENT', severity: n.severity,
      title: n.title, message: n.message, created_at: n.created_at, link: bellLink(n)
    }))
  });
};

/**
 * Export notifications audit log as CSV
 */
export const exportVccNotificationsCsv = async (params = {}) => {
  if (isApiMode) {
    const query = new URLSearchParams();
    if (params.department) query.set('department', params.department);
    if (params.status) query.set('status', params.status);
    if (params.type) query.set('type', params.type);
    if (params.level) query.set('level', params.level);
    if (params.severity) query.set('severity', params.severity);

    const queryString = query.toString();
    const url = `/api/vcc/export/notifications-audit${queryString ? `?${queryString}` : ''}`;
    const blob = await apiBlob(url);
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `vcc_notifications_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
    return;
  }

  assertLocalVccAccess();
  const res = await fetchVccNotifications({ ...params, limit: 10000, offset: 0 });
  const rows = res.notifications || [];

  const headers = [
    'Notification ID',
    'Created At',
    'Type',
    'Severity',
    'Escalation Level',
    'Department',
    'Asset Code',
    'Asset Name',
    'Work Order Code',
    'Title',
    'Message',
    'Days Offset',
    'Status',
    'Acknowledged At',
    'Acknowledged By',
    'Acknowledgement Note',
    'Resolved At',
    'Resolved Reason'
  ];

  const csvRows = [headers.map(csvCell).join(',')];
  for (const r of rows) {
    csvRows.push(
      [
        r.id,
        r.created_at,
        r.notification_type,
        r.severity,
        r.escalation_level,
        r.department,
        r.asset_code || r.asset_id,
        r.asset_name || '',
        r.wo_code || r.work_order_id || '',
        r.title,
        r.message,
        r.days_offset,
        r.status,
        r.acknowledged_at || '',
        r.acknowledged_by_name || r.acknowledged_by || '',
        r.acknowledgement_note || '',
        r.resolved_at || '',
        r.resolved_reason || ''
      ].map(csvCell).join(',')
    );
  }

  const csvContent = '\uFEFF' + csvRows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `vcc_notifications_audit_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
};
