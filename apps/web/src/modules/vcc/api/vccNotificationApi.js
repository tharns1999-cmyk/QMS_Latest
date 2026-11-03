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
  // Generate local mock notifications if none exist
  const assets = getLocalAssets();
  const wos = getLocalWos();
  const existing = getLocalNotifications();

  // Basic mock sweep logic for local fallback
  return {
    success: true,
    summary: {
      created: existing.length,
      updated: 0,
      escalated: 0,
      resolved: 0
    }
  };
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
