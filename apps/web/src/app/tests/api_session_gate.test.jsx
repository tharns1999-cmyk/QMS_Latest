import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import ApiSessionGate from '../auth/ApiSessionGate';
import useStore from '../../store/useStore';
import { getToken, setToken } from '../../api/client';

const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const user = { id: 'u1', name: 'สมชาย', email: 'a@b.c', approval_level: 4, department: 'QA', depts: ['QA'], isDcc: false, isQmr: false };
const doc = { id: 'd1', doc_code: 'SOP-QA-001', revision: '01', name: 'การควบคุมเอกสาร', doc_type: 'SOP', department: 'QA', status: 'EFFECTIVE', access_scope: 'DEPT', file_key: 'dars/1/x.pdf' };

describe('ApiSessionGate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setToken(null);
  });

  it('logs in, loads the register into the store, then renders the app', async () => {
    const fetch = vi.fn((url) => {
      if (url.endsWith('/api/auth/login')) return json(200, { token: 't1', user });
      return json(200, { documents: url.endsWith('EFFECTIVE') ? [doc] : [] });
    });
    vi.stubGlobal('fetch', fetch);
    render(<ApiSessionGate><p>app</p></ApiSessionGate>);

    fireEvent.change(screen.getByLabelText('อีเมล'), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText('รหัสผ่าน'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));

    expect(await screen.findByText('app')).toBeInTheDocument();
    expect(getToken()).toBe('t1');
    expect(fetch.mock.calls.at(-1)[1].headers.Authorization).toBe('Bearer t1');
    expect(useStore.getState().currentUser).toMatchObject({ id: 'u1', primary_department: 'QA', level: 4 });
    expect(useStore.getState().documents[0]).toMatchObject({ document_code: 'SOP-QA-001', is_active: true, access_control: { scope: 'DEPT_ONLY' }, apiFilePath: '/api/documents/d1/file' });
  });

  it('shows the server error and stays on the login form', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(401, { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })));
    render(<ApiSessionGate><p>app</p></ApiSessionGate>);
    fireEvent.change(screen.getByLabelText('อีเมล'), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText('รหัสผ่าน'), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    expect(screen.queryByText('app')).toBeNull();
  });

  it('drops an expired session back to the login form', async () => {
    setToken('old');
    vi.stubGlobal('fetch', vi.fn(() => json(401, { error: 'expired' })));
    render(<ApiSessionGate><p>app</p></ApiSessionGate>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeInTheDocument());
    expect(getToken()).toBeNull();
  });
});
