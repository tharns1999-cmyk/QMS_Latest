import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { startTwoFactorSetup, confirmTwoFactorSetup } from '../../api/session';

const inputClass = 'mt-1 w-full h-9 px-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500';

// Shown to someone the policy requires to use an authenticator app and who has not set it up yet. Nothing else loads until it is done.
const TwoFactorSetup = ({ onDone, onCancel }) => {
  const [setup, setSetup] = useState(null); // { secret, qr }
  const [codes, setCodes] = useState(null); // recovery codes, shown once
  const [code, setCode] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    startTwoFactorSetup().then(async ({ secret, otpauthUri }) => {
      const qr = await QRCode.toDataURL(otpauthUri, { width: 220, margin: 1 });
      if (live) setSetup({ secret, qr });
    }, (err) => live && setError(err.message));
    return () => { live = false; };
  }, []);

  const confirm = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setCodes((await confirmTwoFactorSetup(code.replace(/\s/g, ''))).recoveryCodes);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  if (codes) {
    return (
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
        <h1 className="text-lg font-bold text-slate-900">เก็บรหัสสำรองไว้</h1>
        <p className="text-xs text-slate-600">ถ้าโทรศัพท์หาย ใช้รหัสเหล่านี้เข้าระบบแทนรหัสจากแอปได้ รหัสละครั้งเดียว <b>แสดงครั้งเดียวเท่านั้น</b> จดหรือพิมพ์เก็บไว้ในที่ปลอดภัย</p>
        <ul className="grid grid-cols-2 gap-1 font-mono text-sm bg-slate-100 rounded-lg p-3 select-all">
          {codes.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <button type="button" onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}
          className="h-8 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer">คัดลอกทั้งหมด</button>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />ฉันเก็บรหัสสำรองไว้แล้ว</label>
        <button type="button" disabled={!saved} onClick={onDone}
          className="w-full h-9 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg cursor-pointer">เริ่มใช้งาน</button>
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">ตั้งค่าการยืนยันตัวตนสองขั้นตอน</h1>
        <p className="text-xs text-slate-500 mt-0.5">บริษัทกำหนดให้บัญชีของคุณใช้แอปยืนยันตัวตน (เช่น Google Authenticator หรือ Microsoft Authenticator)</p>
      </div>
      <ol className="text-xs text-slate-700 list-decimal pl-4 space-y-1">
        <li>เปิดแอปในโทรศัพท์ เลือกเพิ่มบัญชี แล้วสแกน QR ด้านล่าง</li>
        <li>กรอกรหัส 6 หลักที่แอปแสดง แล้วกดยืนยัน</li>
      </ol>
      {setup ? (
        <div className="flex flex-col items-center gap-2">
          <img src={setup.qr} alt="QR สำหรับแอปยืนยันตัวตน" width="220" height="220" />
          <p className="text-[11px] text-slate-500 text-center">สแกนไม่ได้? ใส่คีย์นี้ในแอปเอง<br /><span className="font-mono text-slate-800 break-all select-all">{setup.secret}</span></p>
        </div>
      ) : !error && <p className="text-xs text-slate-500 text-center">กำลังสร้าง QR...</p>}
      <label className="block text-xs font-semibold text-slate-700">
        รหัส 6 หลักจากแอป
        <input required inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className={inputClass} />
      </label>
      {error && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
      <button type="submit" disabled={busy || !setup}
        className="w-full h-9 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg cursor-pointer">{busy ? 'กำลังตรวจสอบ...' : 'ยืนยัน'}</button>
      <button type="button" onClick={onCancel} className="w-full text-xs text-slate-500 hover:text-slate-800 cursor-pointer">ออกจากระบบ</button>
    </form>
  );
};

export default TwoFactorSetup;
