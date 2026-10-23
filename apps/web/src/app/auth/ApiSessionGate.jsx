import React, { useEffect, useState } from 'react';
import { getToken, SESSION_EXPIRED_EVENT } from '../../api/client';
import { clearSession, finishSignIn, login, restoreSession, verifyTwoFactor } from '../../api/session';
import ChangePasswordForm from './ChangePasswordForm';
import TwoFactorSetup from './TwoFactorSetup';

// What still stands between this user and the app, in the order the server asks for it.
const stateFor = (user) => (user?.mustChangePassword ? 'change' : user?.mustSetUpTwoFactor ? 'setup2fa' : 'in');

// The second step of sign-in: a code from the authenticator app, or a recovery code when the phone is lost.
const TwoFactorStep = ({ challenge, onUser, onBack }) => {
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onUser(await verifyTwoFactor(challenge, { ...(recovery ? { recoveryCode: code } : { code: code.replace(/\s/g, '') }), trustDevice }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center bg-slate-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">ยืนยันตัวตนสองขั้นตอน</h1>
          <p className="text-xs text-slate-500 mt-0.5">{recovery ? 'กรอกรหัสสำรองที่เก็บไว้ (ใช้ได้รหัสละครั้งเดียว)' : 'เปิดแอปยืนยันตัวตนในโทรศัพท์ แล้วกรอกรหัส 6 หลัก'}</p>
        </div>
        <label className="block text-xs font-semibold text-slate-700">
          {recovery ? 'รหัสสำรอง' : 'รหัส 6 หลัก'}
          <input required autoFocus inputMode={recovery ? 'text' : 'numeric'} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)}
            className="mt-1 w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={trustDevice} onChange={(e) => setTrustDevice(e.target.checked)} />จดจำอุปกรณ์นี้ (ไม่ต้องกรอกรหัสอีกระยะหนึ่ง) — ใช้เฉพาะเครื่องส่วนตัว
        </label>
        {error && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
        <button type="submit" disabled={busy}
          className="w-full h-9 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg cursor-pointer">{busy ? 'กำลังตรวจสอบ...' : 'ยืนยัน'}</button>
        <div className="flex justify-between text-xs text-slate-500">
          <button type="button" className="hover:text-slate-800 cursor-pointer" onClick={() => { setRecovery(!recovery); setCode(''); setError(''); }}>{recovery ? 'ใช้รหัสจากแอป' : 'โทรศัพท์หาย? ใช้รหัสสำรอง'}</button>
          <button type="button" className="hover:text-slate-800 cursor-pointer" onClick={onBack}>กลับ</button>
        </div>
      </form>
    </div>
  );
};

const LoginPage = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await login(email.trim(), password);
      if (result.twoFactorChallenge) {
        setChallenge(result.twoFactorChallenge);
        setBusy(false);
      } else {
        onLogin(result);
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (challenge) return <TwoFactorStep challenge={challenge} onUser={onLogin} onBack={() => setChallenge(null)} />;

  return (
    <div className="min-h-full flex items-center justify-center bg-slate-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">QMS Portal</h1>
          <p className="text-xs text-slate-500 mt-0.5">เข้าสู่ระบบควบคุมเอกสาร</p>
        </div>
        <label className="block text-xs font-semibold text-slate-700">
          อีเมล
          <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
        </label>
        <label className="block text-xs font-semibold text-slate-700">
          รหัสผ่าน
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
        </label>
        {error && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
        <button type="submit" disabled={busy}
          className="w-full h-9 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg cursor-pointer">
          {busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  );
};

// API mode only: nothing renders until the server has confirmed who the user is.
const ApiSessionGate = ({ children }) => {
  const [state, setState] = useState(() => (getToken() ? 'loading' : 'out'));

  useEffect(() => {
    const signOut = () => {
      clearSession();
      setState('out');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, signOut);
    if (getToken()) restoreSession().then((user) => setState(stateFor(user)), signOut);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, signOut);
  }, []);

  if (state === 'loading') {
    return <div className="h-full flex items-center justify-center text-sm text-slate-500">กำลังโหลด...</div>;
  }
  if (state === 'out') return <LoginPage onLogin={(user) => setState(stateFor(user))} />;
  if (state === 'change') {
    return (
      <div className="min-h-full flex items-center justify-center bg-slate-50 p-4">
        <ChangePasswordForm forced onDone={(user) => setState(stateFor(user))} onCancel={() => window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))} />
      </div>
    );
  }
  if (state === 'setup2fa') {
    return (
      <div className="min-h-full flex items-center justify-center bg-slate-50 p-4">
        <TwoFactorSetup onDone={() => finishSignIn().then(() => setState('in'), () => window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT)))}
          onCancel={() => window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))} />
      </div>
    );
  }
  return children;
};

export default ApiSessionGate;
