// API mode is on when VITE_API_URL is set at build time; without it the app runs on its built-in demo data.
const API_URL = import.meta.env.VITE_API_URL;
export const isApiMode = Boolean(API_URL);

const TOKEN_KEY = 'qms-api-token';
let memoryToken = null;

// sessionStorage: the token dies with the tab, which suits shared shop-floor PCs. It can throw in private mode.
export const getToken = () => {
  try { return sessionStorage.getItem(TOKEN_KEY) ?? memoryToken; } catch { return memoryToken; }
};
export const setToken = (token) => {
  memoryToken = token;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* memory only */ }
};

export const SESSION_EXPIRED_EVENT = 'qms:session-expired';

const request = async (path, { method = 'GET', body, headers = {} } = {}) => {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, { method, body, headers: { ...headers, ...(token && { Authorization: `Bearer ${token}` }) } });
  if (res.status === 401 && token) {
    setToken(null);
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res;
};

export const apiGet = async (path) => (await request(path)).json();
export const apiPost = async (path, body = {}) =>
  (await request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })).json();
const sendJson = (method) => async (path, body) =>
  (await request(path, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })).json();
export const apiPatch = sendJson('PATCH');
export const apiPut = sendJson('PUT');
export const apiUpload = async (path, file) =>
  (await request(path, { method: 'PUT', body: file, headers: { 'Content-Type': 'application/pdf' } })).json();
// Why a file is being read; the server writes it to the audit log. Anything else is refused.
export const FILE_PURPOSE = { VIEW: 'view', DOWNLOAD: 'download' };
export const apiBlob = async (path, { purpose } = {}) => (await request(purpose ? `${path}${path.includes('?') ? '&' : '?'}purpose=${purpose}` : path)).blob();
