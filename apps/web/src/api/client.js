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
  // fetch rejects with a bare TypeError("Failed to fetch") when the server is down or the network drops
  const res = await fetch(`${API_URL}${path}`, { method, body, headers: { ...headers, ...(token && { Authorization: `Bearer ${token}` }) } })
    .catch(() => { throw new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบเครือข่ายหรือว่าเซิร์ฟเวอร์ API ทำงานอยู่ แล้วลองใหม่'); });
  if (res.status === 401 && token) {
    setToken(null);
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    // Server faults carry a reference id (X-Request-Id) so the person can quote it when reporting the problem.
    const requestId = data.requestId || res.headers?.get?.('X-Request-Id') || null;
    let message = data.error || `HTTP ${res.status}`;
    if (res.status >= 500 && requestId && !message.includes(requestId)) message = `${message} (รหัสอ้างอิง: ${requestId})`;
    const error = new Error(message);
    error.status = res.status;
    error.requestId = requestId;
    if (data.code) error.code = data.code;
    throw error;
  }
  return res;
};

// Fire-and-forget report for error tracking. It bypasses request() on purpose: a failed report must never sign the
// person out or raise another error. Only in API mode and only when signed in.
export const sendErrorReport = (body) => {
  const token = getToken();
  if (!isApiMode || !token) return false;
  try {
    fetch(`${API_URL}/api/client-errors`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
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
