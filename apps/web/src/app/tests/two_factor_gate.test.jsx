import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import ApiSessionGate from '../auth/ApiSessionGate';
import { getToken, setToken } from '../../api/client';

// The canvas behind QR rendering does not exist in jsdom.
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,AAAA')) } }));

const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const user = { id: 'u1', name: 'สมชาย', email: 'a@b.c', approval_level: 5, department: 'QA', depts: ['QA'], isDcc: false, isQmr: false };

// A server that answers the data routes the gate loads once a user is fully signed in, plus whatever the test adds.
const server = (extra) => vi.fn((url, init) => {
  const handled = extra(url, init);
  if (handled) return handled;
  if (url.endsWith('/api/auth/me')) return json(200, { user });
  if (url.endsWith('/api/users')) return json(200, { users: [user] });
  if (url.endsWith('/api/departments')) return json(200, { departments: [{ code: 'QA', name_th: 'ประกัน', name_en: 'QA', status: 'ACTIVE' }] });
  if (url.endsWith('/api/distribution-locations')) return json(200, { locations: [] });
  if (url.endsWith('/api/approval-matrix')) return json(200, { matrix: [] });
  if (url.endsWith('/api/settings/document-types')) return json(200, { documentTypes: null });
  if (url.endsWith('/api/settings/sla')) return json(200, { sla: null });
  if (url.endsWith('/api/signatures')) return json(200, { signatures: [] });
  if (url.endsWith('/api/dars')) return json(200, { dars: [] });
  if (url.endsWith('/api/controlled-copies')) return json(200, { copies: [] });
  if (url.endsWith('/api/periodic-reviews')) return json(200, { reviews: [] });
  return json(200, { documents: [] });
});

const signIn = () => {
  render(<ApiSessionGate><p>app</p></ApiSessionGate>);
  fireEvent.change(screen.getByLabelText('อีเมล'), { target: { value: 'a@b.c' } });
  fireEvent.change(screen.getByLabelText('รหัสผ่าน'), { target: { value: 'a-good-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
};

describe('two-factor sign-in in the gate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setToken(null);
  });

  it('asks for the app code after the password, and only then loads the app', async () => {
    const fetch = server((url, init) => {
      if (url.endsWith('/api/auth/login')) return json(200, { twoFactorRequired: true, challenge: 'ch1' });
      if (url.endsWith('/api/auth/2fa/verify')) {
        const body = JSON.parse(init.body);
        return body.code === '123456' && body.challenge === 'ch1' ? json(200, { token: 't9', user }) : json(401, { error: 'รหัสยืนยันไม่ถูกต้อง' });
      }
      return null;
    });
    vi.stubGlobal('fetch', fetch);
    signIn();

    const field = await screen.findByLabelText('รหัส 6 หลัก');
    expect(getToken()).toBeNull(); // a password alone is not a session
    expect(screen.queryByText('app')).toBeNull();
    fireEvent.change(field, { target: { value: '111 111' } });
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('รหัสยืนยันไม่ถูกต้อง');

    fireEvent.change(screen.getByLabelText('รหัส 6 หลัก'), { target: { value: '123 456' } }); // spaces are fine
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    expect(await screen.findByText('app')).toBeInTheDocument();
    expect(getToken()).toBe('t9');
  });

  it('takes a recovery code instead when the phone is lost, and can go back to the password', async () => {
    const fetch = server((url, init) => {
      if (url.endsWith('/api/auth/login')) return json(200, { twoFactorRequired: true, challenge: 'ch1' });
      if (url.endsWith('/api/auth/2fa/verify')) return JSON.parse(init.body).recovery_code === 'ABCDE-FGHJK' ? json(200, { token: 't9', user }) : json(401, { error: 'รหัสยืนยันไม่ถูกต้อง' });
      return null;
    });
    vi.stubGlobal('fetch', fetch);
    signIn();
    await screen.findByLabelText('รหัส 6 หลัก');
    fireEvent.click(screen.getByRole('button', { name: /ใช้รหัสสำรอง/ }));
    fireEvent.change(screen.getByLabelText('รหัสสำรอง'), { target: { value: 'ABCDE-FGHJK' } });
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    expect(await screen.findByText('app')).toBeInTheDocument();
  });

  it('goes back to the password form', async () => {
    vi.stubGlobal('fetch', server((url) => (url.endsWith('/api/auth/login') ? json(200, { twoFactorRequired: true, challenge: 'ch1' }) : null)));
    signIn();
    await screen.findByLabelText('รหัส 6 หลัก');
    fireEvent.click(screen.getByRole('button', { name: 'กลับ' }));
    expect(screen.getByLabelText('รหัสผ่าน')).toBeInTheDocument();
  });

  it('makes someone the policy names set it up first: QR, code, recovery codes, and only then the app', async () => {
    const calls = [];
    const fetch = server((url, init) => {
      calls.push(`${init?.method || 'GET'} ${url.replace(/^.*(?=\/api)/, '')}`);
      if (url.endsWith('/api/auth/login')) return json(200, { token: 't1', user: { ...user, mustSetUpTwoFactor: true } });
      if (url.endsWith('/api/auth/2fa/setup')) return json(200, { secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP' });
      if (url.endsWith('/api/auth/2fa/confirm')) {
        return JSON.parse(init.body).code === '654321' ? json(200, { recoveryCodes: ['AAAAA-BBBBB', 'CCCCC-DDDDD'] }) : json(400, { error: 'รหัสไม่ถูกต้อง' });
      }
      return null;
    });
    vi.stubGlobal('fetch', fetch);
    signIn();

    expect(await screen.findByText('ตั้งค่าการยืนยันตัวตนสองขั้นตอน')).toBeInTheDocument();
    expect(await screen.findByAltText('QR สำหรับแอปยืนยันตัวตน')).toBeInTheDocument();
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    // Nothing of the app's data was requested while setup is pending.
    expect(calls.filter((c) => /documents|dars|users|departments/.test(c))).toEqual([]);

    fireEvent.change(screen.getByLabelText('รหัส 6 หลักจากแอป'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('รหัสไม่ถูกต้อง');

    fireEvent.change(screen.getByLabelText('รหัส 6 หลักจากแอป'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));
    expect(await screen.findByText('AAAAA-BBBBB')).toBeInTheDocument();
    const start = screen.getByRole('button', { name: 'เริ่มใช้งาน' });
    expect(start).toBeDisabled(); // until they say they kept the codes
    fireEvent.click(screen.getByLabelText('ฉันเก็บรหัสสำรองไว้แล้ว'));
    fireEvent.click(start);
    expect(await screen.findByText('app')).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.endsWith('/api/dars'))).toBe(true));
  });
});
