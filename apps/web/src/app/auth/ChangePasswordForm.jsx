import React, { useState } from 'react';
import { changePassword } from '../../api/session';

const MIN_LENGTH = 12;
const inputClass = 'mt-1 w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500';

// `forced`: first login with an admin-set password; the data is only loaded once the new password is in.
const ChangePasswordForm = ({ forced = false, onDone, onCancel }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < MIN_LENGTH) return setError(`รหัสผ่านใหม่ต้องยาวอย่างน้อย ${MIN_LENGTH} ตัวอักษร`);
    if (next !== confirm) return setError('ยืนยันรหัสผ่านใหม่ไม่ตรงกัน');
    setBusy(true);
    setError('');
    try {
      onDone(await changePassword(current, next, { loadData: forced }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">เปลี่ยนรหัสผ่าน</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {forced ? 'กรุณาตั้งรหัสผ่านใหม่ของคุณเองก่อนเริ่มใช้งาน' : 'หลังเปลี่ยนแล้ว อุปกรณ์อื่นที่เข้าสู่ระบบอยู่จะถูกออกจากระบบ'}
        </p>
      </div>
      <label className="block text-xs font-semibold text-slate-700">
        รหัสผ่านปัจจุบัน
        <input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
      </label>
      <label className="block text-xs font-semibold text-slate-700">
        รหัสผ่านใหม่ (อย่างน้อย {MIN_LENGTH} ตัวอักษร)
        <input type="password" required autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
      </label>
      <label className="block text-xs font-semibold text-slate-700">
        ยืนยันรหัสผ่านใหม่
        <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
      </label>
      {error && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel}
          className="h-9 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer">
          {forced ? 'ออกจากระบบ' : 'ยกเลิก'}
        </button>
        <button type="submit" disabled={busy}
          className="flex-1 h-9 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg cursor-pointer">
          {busy ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
        </button>
      </div>
    </form>
  );
};

export default ChangePasswordForm;
