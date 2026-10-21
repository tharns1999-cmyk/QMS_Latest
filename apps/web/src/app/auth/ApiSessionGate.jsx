import React, { useEffect, useState } from 'react';
import { getToken, SESSION_EXPIRED_EVENT } from '../../api/client';
import { clearSession, login, restoreSession } from '../../api/session';
import ChangePasswordForm from './ChangePasswordForm';

const stateFor = (user) => (user?.mustChangePassword ? 'change' : 'in');

const LoginPage = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin(await login(email.trim(), password));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

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
        <ChangePasswordForm forced onDone={() => setState('in')} onCancel={() => window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))} />
      </div>
    );
  }
  return children;
};

export default ApiSessionGate;
