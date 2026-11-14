import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import ApiSessionGate from '../auth/ApiSessionGate';
import { getToken, setToken } from '../../api/client';
import useStore from '../../store/useStore';

const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const user = { id: 'u1', name: 'สมชาย', email: 'a@company.example', approval_level: 4, department: 'QA', depts: ['QA'], isDcc: false, isQmr: false, microsoftSignIn: true };

const serverFor = (mode, extra = {}) => vi.fn((url) => {
  if (url.endsWith('/api/auth/mode')) return json(200, { mode });
  if (url.endsWith('/api/auth/me')) return json(200, { user });
  if (url.endsWith('/api/users')) return json(200, { users: [user] });
  if (url.endsWith('/api/departments')) return json(200, { departments: [] });
  if (url.endsWith('/api/distribution-locations')) return json(200, { locations: [] });
  if (url.endsWith('/api/approval-matrix')) return json(200, { matrix: [] });
  if (url.endsWith('/api/settings/document-types')) return json(200, { documentTypes: null });
  if (url.endsWith('/api/settings/sla')) return json(200, { sla: null });
  if (url.endsWith('/api/signatures')) return json(200, { signatures: [] });
  if (url.endsWith('/api/dars')) return json(200, { dars: [] });
  if (url.endsWith('/api/controlled-copies')) return json(200, { copies: [] });
  if (url.endsWith('/api/periodic-reviews')) return json(200, { reviews: [] });
  return extra[url] ?? json(200, { documents: [] });
});

const at = (path) => window.history.replaceState(null, '', path);

describe('sign-in with the company Microsoft account', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setToken(null);
    at('/');
  });

  it('offers one button to Microsoft, and no e-mail or password form, when the server is in that mode', async () => {
    vi.stubGlobal('fetch', serverFor('entra'));
    render(<ApiSessionGate><p>app</p></ApiSessionGate>);
    const link = await screen.findByRole('link', { name: 'เข้าสู่ระบบด้วย Microsoft' });
    expect(link.getAttribute('href')).toMatch(/\/api\/auth\/entra\/login$/);
    expect(screen.queryByLabelText('รหัสผ่าน')).toBeNull();
    expect(screen.queryByLabelText('อีเมล')).toBeNull();
  });

  it('keeps the e-mail and password form when the server is not in that mode', async () => {
    vi.stubGlobal('fetch', serverFor('password'));
    render(<ApiSessionGate><p>app</p></ApiSessionGate>);
    expect(screen.getByLabelText('รหัสผ่าน')).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'เข้าสู่ระบบด้วย Microsoft' })).toBeNull();
  });

  it('keeps the password form when the server cannot say which mode it is in', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(500, { error: 'down' })));
    render(<ApiSessionGate><p>app</p></ApiSessionGate>);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByLabelText('รหัสผ่าน')).toBeInTheDocument();
  });

  it('takes the session token from the address when Microsoft sends the person back, removes it from the address, and opens the app', async () => {
    at('/#entra_token=header.payload.signature');
    vi.stubGlobal('fetch', serverFor('entra'));
    render(<ApiSessionGate><p>app</p></ApiSessionGate>);
    expect(await screen.findByText('app')).toBeInTheDocument();
    expect(getToken()).toBe('header.payload.signature');
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('entra_token');
    // The sidebar hides "change password" from this flag; the people list replacing the current user must not lose it.
    expect(useStore.getState().microsoftSignIn).toBe(true);
  });

  it('ignores a fragment that is not a token', async () => {
    at('/#entra_token=<script>');
    vi.stubGlobal('fetch', serverFor('entra'));
    render(<ApiSessionGate><p>app</p></ApiSessionGate>);
    await screen.findByRole('link', { name: 'เข้าสู่ระบบด้วย Microsoft' });
    expect(getToken()).toBeNull();
  });

  it.each([
    ['entra_no_user', 'ยังไม่ได้รับสิทธิ์ใช้งาน'],
    ['entra_inactive', 'ปิดใช้งานหรือถูกล็อก'],
    ['entra_denied', 'ถูกยกเลิก'],
    ['entra_not_configured', 'ตั้งค่าการเข้าสู่ระบบด้วย Microsoft ไม่ครบ'],
    ['entra_failed', 'ไม่สำเร็จ']
  ])('tells the person why Microsoft sign-in was refused (%s) and clears it from the address', async (code, words) => {
    at(`/?login_error=${code}`);
    vi.stubGlobal('fetch', serverFor('entra'));
    render(<ApiSessionGate><p>app</p></ApiSessionGate>);
    expect(await screen.findByRole('alert')).toHaveTextContent(words);
    expect(window.location.search).toBe('');
    expect(screen.queryByText('app')).toBeNull();
  });
});
