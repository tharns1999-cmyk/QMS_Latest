import useStore from '../store/useStore';
import { apiGet, apiPost, setToken, SESSION_EXPIRED_EVENT } from './client';
import { loadDars } from './dars';
import { loadCopies } from './copies';
import { applyReviews, clearReviews, loadReviews } from './reviews';
import { clearExternal, isExternalRow, setExternalSources } from './external';
import { isDarDraft } from '../modules/dcc/utils/darHelper';
import { deleteFile } from '../modules/dcc/utils/fileStorage';
import { toStoreUser, loadUsers, loadMasterData, loadApprovalMatrix, loadDocumentTypes, loadSla, loadSignatures } from './masterData';

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

// The server sends documents in pages; keep asking until it says there are no more.
const loadAllDocuments = async (status) => {
  const rows = [];
  for (let more = true; more; ) {
    const page = await apiGet(`/api/documents?status=${status}&offset=${rows.length}`);
    rows.push(...page.documents);
    more = page.more && page.documents.length > 0;
  }
  return rows;
};

export const loadDocuments = async () => {
  // The reviews come with the documents because the review flags are laid over them.
  const [lists] = await Promise.all([
    Promise.all(['EFFECTIVE', 'SUPERSEDED', 'OBSOLETE'].map(loadAllDocuments)),
    loadReviews()
  ]);
  const rows = lists.flat();
  useStore.setState({ documents: rows.filter((d) => !isExternalRow(d)).map(toStoreDocument) });
  setExternalSources({ docs: rows.filter(isExternalRow) });
  applyReviews();
};

const start = async (user) => {
  // Kept apart from currentUser, which the people list replaces. The sidebar hides "change password" for Microsoft sign-in.
  useStore.setState({ currentUser: toStoreUser(user), microsoftSignIn: Boolean(user.microsoftSignIn) });
  // Routing previews and pickers read these lists, so they must hold the real people, departments and places, not demo ones.
  await Promise.all([loadUsers(), loadMasterData(), loadApprovalMatrix(), loadDocumentTypes(), loadSla()]);
  await loadSignatures();
  await Promise.all([loadDocuments(), loadDars(), loadCopies()]);
};

// A user whose password was set by an admin must change it first, and one the policy names must set up two-factor; the server
// refuses everything else until then, so no data is loaded yet.
const needsMoreSteps = (user) => user.mustChangePassword || user.mustSetUpTwoFactor;

const signedIn = async ({ token, user }) => {
  setToken(token);
  if (!needsMoreSteps(user)) await start(user);
  return user;
};

// The server hands back a signed token when the person asks to remember this browser; it only skips the code, never the password.
const TRUSTED_DEVICE_KEY = 'qms-trusted-device';
const readTrustedDevice = () => { try { return localStorage.getItem(TRUSTED_DEVICE_KEY); } catch { return null; } };
const keepTrustedDevice = (token) => { try { localStorage.setItem(TRUSTED_DEVICE_KEY, token); } catch { /* the code is simply asked again next time */ } };

// Resolves to the user, or to { twoFactorChallenge } when the server wants the second step (see verifyTwoFactor).
export const login = async (email, password) => {
  const result = await apiPost('/api/auth/login', { email, password, trusted_device: readTrustedDevice() });
  return result.twoFactorRequired ? { twoFactorChallenge: result.challenge } : signedIn(result);
};

export const verifyTwoFactor = async (challenge, { code, recoveryCode, trustDevice = false }) => {
  const result = await apiPost('/api/auth/2fa/verify', { challenge, code, recovery_code: recoveryCode, trust_device: trustDevice });
  if (result.trustedDevice) keepTrustedDevice(result.trustedDevice);
  return signedIn(result);
};

// Which sign-in the server offers: 'entra' (the company Microsoft account) or 'password'. Any failure means the password form.
export const loadAuthMode = async () => {
  try {
    return (await apiGet('/api/auth/mode')).mode === 'entra' ? 'entra' : 'password';
  } catch {
    return 'password';
  }
};

// After Microsoft sign-in the server sends the browser back with the session token in the address fragment (never sent
// to any server). Take it into the session and remove it from the address bar and history at once.
export const takeMicrosoftToken = () => {
  const match = /^#entra_token=([\w.-]+)$/.exec(window.location.hash);
  if (!match) return false;
  setToken(match[1]);
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return true;
};

const LOGIN_ERRORS = {
  entra_no_user: 'บัญชี Microsoft นี้ยังไม่ได้รับสิทธิ์ใช้งาน QMS Portal กรุณาติดต่อ DCC',
  entra_inactive: 'บัญชีนี้ถูกปิดใช้งานหรือถูกล็อก กรุณาติดต่อ DCC',
  entra_denied: 'การเข้าสู่ระบบด้วย Microsoft ถูกยกเลิก',
  entra_not_configured: 'ระบบยังตั้งค่าการเข้าสู่ระบบด้วย Microsoft ไม่ครบ กรุณาแจ้งผู้ดูแลระบบ'
};
const LOGIN_ERROR_FALLBACK = 'เข้าสู่ระบบด้วย Microsoft ไม่สำเร็จ กรุณาลองใหม่ ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ';

// The message for a refused Microsoft sign-in (?login_error=...), taken off the address so a refresh does not repeat it.
export const takeLoginError = () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('login_error');
  if (!code) return '';
  params.delete('login_error');
  const rest = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
  return LOGIN_ERRORS[code] || LOGIN_ERROR_FALLBACK;
};

export const startTwoFactorSetup = () => apiPost('/api/auth/2fa/setup');
export const confirmTwoFactorSetup = (code) => apiPost('/api/auth/2fa/confirm', { code });

// After setting up two-factor the session is the same one, now allowed to load its data.
export const finishSignIn = async () => {
  const { user } = await apiGet('/api/auth/me');
  await start(user);
  return user;
};

export const restoreSession = async () => {
  const { user } = await apiGet('/api/auth/me');
  if (!needsMoreSteps(user)) await start(user);
  return user;
};

// The server signs out every older token on a change and returns a fresh one.
export const changePassword = async (current, next, { loadData = false } = {}) => {
  const { token, user } = await apiPost('/api/auth/change-password', { current_password: current, new_password: next });
  setToken(token);
  if (loadData && !user.mustSetUpTwoFactor) await start(user);
  return user;
};

// Server data must not outlive the session in this browser.
export const clearSession = () => {
  setToken(null);
  // Drafts were typed by the user and never reached the server, so signing out must not throw them away.
  const drafts = (useStore.getState().dars || []).filter(isDarDraft);
  clearExternal();
  clearReviews();
  // The admin page also caches signature images and the people list in IndexedDB. API mode never reads them back
  // (the server owns both), so they are removed here instead of being left on a shared PC.
  const { masterUsers = [], adminUsers = [], formerUsers = [] } = useStore.getState();
  const userIds = new Set([...masterUsers, ...adminUsers, ...formerUsers].map((u) => u?.id).filter(Boolean));
  [...userIds].forEach((id) => deleteFile(`user_sig_${id}`));
  deleteFile('master_users_persistent_data');
  // The people directory (names, emails, levels, signature images) is reloaded at the next sign-in, so it goes too.
  useStore.setState({ adminUsers: [], formerUsers: [], masterUsers: [], requestUsers: [], reviewUsers: [], approveUsers: [], documents: [], periodicReviewSchedules: [], periodicReviewTasks: [], dars: drafts, darRequests: drafts, controlledCopyInstances: [], documentControlledCopies: [], timeline: [], tasks: [] });
};

export const logout = () => window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
