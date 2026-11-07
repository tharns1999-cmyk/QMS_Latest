import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApiModeStorage } from './persistConfig';

describe('persistConfig wiring', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('in API mode the store goes to sessionStorage and localStorage keeps drafts only', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.test');
    vi.resetModules();
    const { persistConfig } = await import('./persistConfig');
    expect(persistConfig.name).toBe('qms-api-mode-storage');
    persistConfig.storage.setItem('qms-api-mode-storage', { state: { documents: [{ id: 'D1', doc_code: 'SOP-QA-01' }], dars: [] }, version: 5 });
    expect(sessionStorage.getItem('qms-api-mode-storage')).toContain('SOP-QA-01');
    expect(localStorage.getItem('qms-api-mode-storage')).not.toContain('SOP-QA-01');
  });

  it('demo mode keeps its existing localStorage behaviour', async () => {
    vi.resetModules();
    const { persistConfig } = await import('./persistConfig');
    expect(persistConfig.name).toBe('qms-enterprise-storage');
    persistConfig.storage.setItem('qms-enterprise-storage', { state: { documents: [{ id: 'D1' }] }, version: 5 });
    expect(localStorage.getItem('qms-enterprise-storage')).toContain('D1');
  });
});

const KEY = 'qms-api-mode-storage';
const fakeStorage = () => {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k)
  };
};
const throwingStorage = () => ({
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('SecurityError'); },
  removeItem: () => { throw new Error('SecurityError'); }
});

const draft = { id: 'DAR-DRAFT-1', isDraft: true, status: 'DRAFT', title: 'ร่างที่ยังไม่ส่ง' };
const submitted = { id: 'DAR-26-001', status: 'PENDING_REVIEW', title: 'ส่งแล้ว' };
const fullState = JSON.stringify({
  state: {
    currentUser: { id: 'U1', email: 'person@company.test' },
    masterUsers: [{ id: 'U1', email: 'person@company.test', signatureImage: 'data:image/png;base64,AAAA' }],
    documents: [{ id: 'D1', doc_code: 'SOP-QA-01' }],
    actionLog: [{ id: 1, action: 'LOGIN' }],
    dars: [draft, submitted],
    darRequests: [draft, submitted]
  },
  version: 5
});

describe('API-mode persisted store (browser session security)', () => {
  it('keeps the full store only for this tab and leaves just DAR drafts in localStorage', () => {
    const local = fakeStorage();
    const session = fakeStorage();
    const storage = createApiModeStorage(local, session);
    storage.setItem(KEY, fullState);

    expect(session.getItem(KEY)).toBe(fullState);
    const kept = JSON.parse(local.getItem(KEY));
    expect(kept).toEqual({ state: { dars: [draft], darRequests: [draft] }, version: 5 });
    expect(local.getItem(KEY)).not.toMatch(/person@company\.test|SOP-QA-01|LOGIN|signatureImage/);
  });

  it('reads this tab\'s copy first, so a page reload keeps working as before', () => {
    const local = fakeStorage();
    const session = fakeStorage();
    const storage = createApiModeStorage(local, session);
    storage.setItem(KEY, fullState);
    expect(storage.getItem(KEY)).toBe(fullState);
  });

  it('after the tab or browser was closed, only drafts come back', () => {
    const local = fakeStorage();
    createApiModeStorage(local, fakeStorage()).setItem(KEY, fullState);
    const nextTab = createApiModeStorage(local, fakeStorage());
    expect(JSON.parse(nextTab.getItem(KEY)).state).toEqual({ dars: [draft], darRequests: [draft] });
  });

  it('scrubs a full store left in localStorage by an older build, even if nobody signs in', () => {
    const local = fakeStorage();
    local.setItem(KEY, fullState);
    const storage = createApiModeStorage(local, fakeStorage());
    storage.getItem(KEY);
    expect(local.getItem(KEY)).not.toMatch(/person@company\.test|SOP-QA-01/);
    expect(JSON.parse(local.getItem(KEY)).state.dars).toEqual([draft]);
  });

  it('drops an unreadable stored value instead of failing', () => {
    const local = fakeStorage();
    local.setItem(KEY, '{not json');
    expect(createApiModeStorage(local, fakeStorage()).getItem(KEY)).toBeNull();
    expect(local.getItem(KEY)).toBeNull();
  });

  it('works when sessionStorage is blocked (private mode): memory for the tab, drafts still kept', () => {
    const local = fakeStorage();
    const storage = createApiModeStorage(local, throwingStorage());
    storage.setItem(KEY, fullState);
    expect(storage.getItem(KEY)).toBe(fullState);
    expect(JSON.parse(local.getItem(KEY)).state.dars).toEqual([draft]);
    storage.removeItem(KEY);
    expect(local.getItem(KEY)).toBeNull();
  });
});
