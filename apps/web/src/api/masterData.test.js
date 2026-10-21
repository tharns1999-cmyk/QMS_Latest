import { describe, it, expect, vi, afterEach } from 'vitest';
import { setUsers, loadMasterData, loadDocumentTypes, loadSla, loadSignatures, createUser, setUserStatus, resetUserPassword, saveMatrixEntry } from './masterData';
import { knownUsers } from './people';
import useStore from '../store/useStore';

const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const user = (id, status, extra = {}) => ({ id, name: id, email: `${id}@x.local`, approval_level: 3, department: 'QC', depts: ['QC'], isDcc: false, isQmr: false, status, ...extra });
const form = { name: 'สมศรี', email: 'a@b.c', empId: '', department: 'QC', depts: ['QC'], approval_level: '4', isDcc: false, isQmr: true };

describe('master data adapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps only active people for pickers, but still knows deactivated ones by name', () => {
    useStore.setState({ currentUser: { id: 'a' } });
    setUsers([user('a', 'ACTIVE'), user('b', 'INACTIVE'), user('c', 'LOCKED')]);
    const s = useStore.getState();
    expect(s.masterUsers.map((u) => u.id)).toEqual(['a']);
    expect(s.reviewUsers.map((u) => u.id)).toEqual(['a']);
    expect(s.formerUsers.map((u) => u.id)).toEqual(['b']);
    expect(s.adminUsers.map((u) => u.id)).toEqual(['a', 'b', 'c']);
    expect(s.adminUsers[2]).toMatchObject({ isLocked: true, level: 3, primary_department: 'QC' });
    expect(knownUsers().map((u) => u.id)).toEqual(['a', 'b']);
  });

  it('loads departments and places into the shapes the pages read', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => (url.endsWith('/api/departments')
      ? json(200, { departments: [{ code: 'QC', name_th: 'คุณภาพ', name_en: 'Quality', status: 'ACTIVE' }] })
      : json(200, { locations: [{ id: 'l1', department: 'QC', name: 'ห้องแล็บ', description: 'ชั้น 2', status: 'ACTIVE' }] }))));
    await loadMasterData();
    const s = useStore.getState();
    expect(s.departments[0]).toMatchObject({ id: 'QC', code: 'QC', nameTh: 'คุณภาพ', status: 'ACTIVE' });
    expect(s.masterDepartments).toBe(s.departments);
    expect(s.distributionLocations[0]).toMatchObject({ id: 'l1', departmentId: 'QC', name: 'ห้องแล็บ' });
  });

  it('creates a user, returns the one-time password, and reloads the list', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn((url, init) => {
      calls.push([init?.method || 'GET', url.replace(/^.*(?=\/api)/, ''), init?.body && JSON.parse(init.body)]);
      return url.endsWith('/api/users') && init?.method === 'POST' ? json(201, { user: user('n', 'ACTIVE'), temporaryPassword: 'Abcdefgh234567' }) : json(200, { users: [user('n', 'ACTIVE')] });
    }));
    useStore.setState({ currentUser: { id: 'a', isDcc: true } });
    const result = await createUser(form);
    expect(result.temporaryPassword).toBe('Abcdefgh234567');
    expect(calls[0]).toEqual(['POST', '/api/users', { name: 'สมศรี', email: 'a@b.c', department: 'QC', depts: ['QC'], approval_level: 4, isDcc: false, isQmr: true }]);
    expect(calls[1][1]).toBe('/api/admin/users'); // DCC reloads the full list
    expect(useStore.getState().adminUsers.map((u) => u.id)).toEqual(['n']);
  });

  it('returns null and still reloads when the server refuses', async () => {
    const fetch = vi.fn((url, init) => (init?.method === 'POST' ? json(409, { error: 'อีเมลหรือรหัสพนักงานนี้มีอยู่แล้ว' }) : json(200, { users: [] })));
    vi.stubGlobal('fetch', fetch);
    useStore.setState({ currentUser: { id: 'a', isDcc: true } });
    expect(await createUser(form)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('sends status changes, password resets and matrix levels to the right routes', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn((url, init) => {
      calls.push([init?.method || 'GET', url.replace(/^.*(?=\/api)/, ''), init?.body && JSON.parse(init.body)]);
      return json(200, url.includes('reset-password') ? { temporaryPassword: 'Zzzzzzzz234567' } : { users: [], matrix: [] });
    }));
    useStore.setState({ currentUser: { id: 'a', isDcc: true } });
    await setUserStatus('u1', 'INACTIVE');
    expect((await resetUserPassword('u1')).temporaryPassword).toBe('Zzzzzzzz234567');
    await saveMatrixEntry('SOP', { min_requester_level: 1, required_reviewer_level: 4, required_approver_level: 6 });
    expect(calls.filter(([m]) => m !== 'GET')).toEqual([
      ['PATCH', '/api/users/u1', { status: 'INACTIVE' }],
      ['POST', '/api/users/u1/reset-password', {}],
      ['PUT', '/api/approval-matrix/SOP', { min_requester_level: 1, required_reviewer_level: 4, required_approver_level: 6 }]
    ]);
  });

  it('takes document types, SLA days and signatures from the server, and keeps signatures on reloaded users', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => json(200, url.endsWith('/document-types') ? { documentTypes: [{ code: 'ZZ', nameTh: 'ทดสอบ' }] }
      : url.endsWith('/sla') ? { sla: { reviewSlaDays: 9 } } : { signatures: [{ user_id: 'a', signature_type: 'DRAWN', initials: 'A', image: 'data:image/png;base64,AA==' }] })));
    useStore.setState({ currentUser: { id: 'a' } });
    setUsers([user('a', 'ACTIVE')]);
    await Promise.all([loadDocumentTypes(), loadSla(), loadSignatures()]);
    expect(useStore.getState().documentTypes.map((t) => t.code)).toEqual(['ZZ']);
    expect(useStore.getState().slaSettings.reviewSlaDays).toBe(9);
    expect(useStore.getState().masterUsers[0]).toMatchObject({ signatureImage: 'data:image/png;base64,AA==', hasRegisteredSignature: true });
    setUsers([user('a', 'ACTIVE')]); // a reload must not drop it
    expect(useStore.getState().adminUsers[0].signatureImage).toBe('data:image/png;base64,AA==');
  });
});
