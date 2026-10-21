import useStore from '../store/useStore';
import { apiGet, apiPost, setToken, SESSION_EXPIRED_EVENT } from './client';
import { loadDars } from './dars';

// The pages were built on demo records with many alias fields; API rows get the aliases they read.
export const toStoreUser = (u) => ({
  ...u,
  userId: u.id,
  status: 'ACTIVE',
  primary_department: u.department,
  departments: u.depts,
  affiliated_departments: u.depts,
  affiliatedDepartments: u.depts,
  level: u.approval_level
});

export const toStoreDocument = (d) => ({
  ...d,
  code: d.doc_code,
  docNo: d.doc_code,
  document_code: d.doc_code,
  title: d.doc_code,
  docTitle: d.doc_code,
  document_title: d.name,
  docName: d.name,
  docType: d.doc_type,
  type: d.doc_type,
  rev: d.revision,
  doc_version: d.revision,
  dept: d.department,
  ownerId: d.owner_id,
  effectiveDate: d.effective_date,
  is_active: d.status === 'EFFECTIVE',
  is_superseded: d.status === 'SUPERSEDED',
  is_obsolete: d.status === 'OBSOLETE',
  access_control: { scope: d.access_scope === 'DEPT' ? 'DEPT_ONLY' : d.access_scope, authorized_depts: [], authorized_users: [], min_access_level: 1 },
  distributions: [],
  // Read by resolveFileBlob, so every viewer and download path fetches the controlled PDF from the API.
  apiFilePath: d.file_key ? `/api/documents/${d.id}/file` : null
});

export const loadDocuments = async () => {
  const lists = await Promise.all(['EFFECTIVE', 'SUPERSEDED', 'OBSOLETE'].map((s) => apiGet(`/api/documents?status=${s}`)));
  useStore.setState({ documents: lists.flatMap((l) => l.documents).map(toStoreDocument) });
};

const start = async (user) => {
  const [{ users }, { matrix }] = await Promise.all([apiGet('/api/users'), apiGet('/api/approval-matrix')]);
  const people = users.map(toStoreUser);
  // Routing previews and pickers read these lists, so they must hold the real signers, not demo users.
  useStore.setState({
    currentUser: toStoreUser(user),
    masterUsers: people,
    requestUsers: people,
    reviewUsers: people,
    approveUsers: people,
    approvalMatrix: matrix,
    approval_matrix: matrix
  });
  await Promise.all([loadDocuments(), loadDars()]);
};

// A user whose password was set by an admin must change it first; the server refuses everything else until then.
export const login = async (email, password) => {
  const { token, user } = await apiPost('/api/auth/login', { email, password });
  setToken(token);
  if (!user.mustChangePassword) await start(user);
  return user;
};

export const restoreSession = async () => {
  const { user } = await apiGet('/api/auth/me');
  if (!user.mustChangePassword) await start(user);
  return user;
};

// The server signs out every older token on a change and returns a fresh one.
export const changePassword = async (current, next, { loadData = false } = {}) => {
  const { token, user } = await apiPost('/api/auth/change-password', { current_password: current, new_password: next });
  setToken(token);
  if (loadData) await start(user);
};

// Server data must not outlive the session in this browser.
export const clearSession = () => {
  setToken(null);
  useStore.setState({ documents: [], dars: [], darRequests: [], timeline: [], tasks: [] });
};

export const logout = () => window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
