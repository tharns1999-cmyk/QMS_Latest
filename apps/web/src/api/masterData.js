import toast from 'react-hot-toast';
import useStore from '../store/useStore';
import { apiGet, apiPost, apiPatch, apiPut } from './client';

// The pages were built on demo records with many alias fields; server rows get the aliases they read.
export const toStoreUser = (u) => ({
  ...u,
  userId: u.id,
  status: u.status || 'ACTIVE',
  isLocked: u.status === 'LOCKED',
  primary_department: u.department,
  departments: u.depts,
  affiliated_departments: u.depts,
  affiliatedDepartments: u.depts,
  level: u.approval_level
});

const toStoreDepartment = (d) => ({
  id: d.code, code: d.code, deptCode: d.code, name: d.name_th, nameTh: d.name_th, name_th: d.name_th, nameEn: d.name_en, name_en: d.name_en, status: d.status
});

const toStoreLocation = (l) => ({ id: l.id, departmentId: l.department, name: l.name, code: l.name, description: l.description, status: l.status });

// Who can be picked now (ACTIVE) and who only needs to be named on old records (INACTIVE); the admin page also gets locked accounts.
export const setUsers = (users) => {
  const people = users.map(toStoreUser);
  const active = people.filter((u) => u.status === 'ACTIVE');
  useStore.setState({
    currentUser: people.find((u) => u.id === useStore.getState().currentUser?.id) ?? useStore.getState().currentUser,
    masterUsers: active,
    formerUsers: people.filter((u) => u.status === 'INACTIVE'),
    adminUsers: people,
    requestUsers: active,
    reviewUsers: active,
    approveUsers: active
  });
};

export const loadUsers = async () => {
  const { currentUser } = useStore.getState();
  const { users } = await apiGet(currentUser?.isDcc ? '/api/admin/users' : '/api/users');
  setUsers(users);
};

export const loadMasterData = async () => {
  const [{ departments }, { locations }] = await Promise.all([apiGet('/api/departments'), apiGet('/api/distribution-locations')]);
  const mapped = departments.map(toStoreDepartment);
  useStore.setState({ departments: mapped, masterDepartments: mapped, distributionLocations: locations.map(toStoreLocation) });
};

export const loadApprovalMatrix = async () => {
  const { matrix } = await apiGet('/api/approval-matrix');
  useStore.setState({ approvalMatrix: matrix, approval_matrix: matrix });
};

// One call for each button: runs it, tells the person what the server said, refreshes what changed. Resolves to the result or null.
const act = async (run, refresh, success) => {
  try {
    const result = await run();
    if (success) toast.success(success);
    return result ?? true;
  } catch (err) {
    toast.error(err.message, { duration: 8000 });
    return null;
  } finally {
    await Promise.all(refresh.map((f) => f())).catch(() => {});
  }
};

const userBody = (f) => ({ name: f.name, email: f.email, empId: f.empId || undefined, department: f.department, depts: f.depts, approval_level: Number(f.approval_level), isDcc: f.isDcc, isQmr: f.isQmr });

export const createUser = (form) => act(() => apiPost('/api/users', userBody(form)), [loadUsers], 'เพิ่มผู้ใช้แล้ว');
export const updateUser = (id, form, status) => act(() => apiPatch(`/api/users/${id}`, { ...userBody(form), ...(status && { status }) }), [loadUsers], 'บันทึกแล้ว');
export const setUserStatus = (id, status) => act(() => apiPatch(`/api/users/${id}`, { status }), [loadUsers], status === 'ACTIVE' ? 'เปิดใช้งานบัญชีแล้ว' : 'ปิดบัญชีแล้ว');
export const resetUserPassword = (id) => act(() => apiPost(`/api/users/${id}/reset-password`), [loadUsers]);

export const createDepartment = (form) => act(() => apiPost('/api/departments', { code: form.code, name_th: form.nameTh, name_en: form.nameEn }), [loadMasterData], 'เพิ่มแผนกแล้ว');
export const updateDepartment = (code, patch) => act(() => apiPatch(`/api/departments/${encodeURIComponent(code)}`, patch), [loadMasterData], 'บันทึกแล้ว');

export const createLocation = (form) => act(() => apiPost('/api/distribution-locations', form), [loadMasterData], 'เพิ่มสถานที่แล้ว');
export const updateLocation = (id, patch) => act(() => apiPatch(`/api/distribution-locations/${id}`, patch), [loadMasterData], 'บันทึกแล้ว');

export const saveMatrixEntry = (docType, entry) => act(() => apiPut(`/api/approval-matrix/${docType}`, entry), [loadApprovalMatrix], `บันทึกระดับของ ${docType} แล้ว`);
