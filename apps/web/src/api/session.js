import useStore from '../store/useStore';
import { apiGet, apiPost, setToken, SESSION_EXPIRED_EVENT } from './client';
import { loadDars } from './dars';
import { loadCopies } from './copies';
import { applyReviews, clearReviews, loadReviews } from './reviews';
import { clearExternal, isExternalRow, setExternalSources } from './external';
import { isDarDraft } from '../modules/dcc/utils/darHelper';
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
  useStore.setState({ currentUser: toStoreUser(user) });
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

// Resolves to the user, or to { twoFactorChallenge } when the server wants the second step (see verifyTwoFactor).
export const login = async (email, password) => {
  const result = await apiPost('/api/auth/login', { email, password });
  return result.twoFactorRequired ? { twoFactorChallenge: result.challenge } : signedIn(result);
};

export const verifyTwoFactor = async (challenge, { code, recoveryCode }) =>
  signedIn(await apiPost('/api/auth/2fa/verify', { challenge, code, recovery_code: recoveryCode }));

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
  useStore.setState({ adminUsers: [], formerUsers: [], documents: [], periodicReviewSchedules: [], periodicReviewTasks: [], dars: drafts, darRequests: drafts, controlledCopyInstances: [], documentControlledCopies: [], timeline: [], tasks: [] });
};

export const logout = () => window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
