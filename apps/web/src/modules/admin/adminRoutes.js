export const ADMIN_ROOT = '/admin';
export const ADMIN_MASTER_DATA = '/admin/master-data';
export const ADMIN_AUDIT_LOG = '/admin/audit-log';

export const isAdminPath = (pathname = '') => pathname === ADMIN_ROOT || pathname.startsWith(`${ADMIN_ROOT}/`);
