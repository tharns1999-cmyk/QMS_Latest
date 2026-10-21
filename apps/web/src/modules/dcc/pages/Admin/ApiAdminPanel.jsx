import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { apiBlob, apiGet, apiPost } from '../../../../api/client';

const inputClass = 'h-9 px-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30';

// API mode only: the server's audit trail for auditors, and unlocking accounts locked by failed logins.
const ApiAdminPanel = () => {
  const [from, setFrom] = useState(`${dayjs().year()}-01-01`);
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'));
  const [locked, setLocked] = useState([]);
  const [busy, setBusy] = useState(false);

  const loadLocked = useCallback(() => apiGet('/api/users/locked').then((r) => setLocked(r.users), () => {}), []);
  useEffect(() => { loadLocked(); }, [loadLocked]);

  const download = async () => {
    setBusy(true);
    try {
      const blob = await apiBlob(`/api/audit-log?format=csv&from=${from}&to=${to}&limit=50000`);
      const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `audit-log_${from}_${to}.csv` });
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      toast.error(err.message);
    }
    setBusy(false);
  };

  const unlock = async (user) => {
    try {
      await apiPost(`/api/users/${user.id}/unlock`);
      toast.success(`ปลดล็อกบัญชี ${user.name} แล้ว`);
    } catch (err) {
      toast.error(err.message);
    }
    loadLocked();
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-bold text-slate-900">ดาวน์โหลด Audit Log จากเซิร์ฟเวอร์ (สำหรับผู้ตรวจสอบ)</h2>
        <p className="text-xs text-slate-500">บันทึกจริงของระบบ ลบหรือแก้ไขไม่ได้ ทุกการดาวน์โหลดจะถูกบันทึกไว้ด้วย</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-slate-700">ตั้งแต่<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} block mt-1`} /></label>
          <label className="text-xs font-semibold text-slate-700">ถึง<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} block mt-1`} /></label>
          <button type="button" onClick={download} disabled={busy || !from || !to}
            className="h-9 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg cursor-pointer">
            {busy ? 'กำลังสร้างไฟล์...' : 'ดาวน์โหลด CSV'}
          </button>
        </div>
      </section>
      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-bold text-slate-900">บัญชีที่ถูกล็อก</h2>
        {locked.length === 0 ? <p className="text-xs text-slate-500">ไม่มีบัญชีที่ถูกล็อก</p> : (
          <ul className="divide-y divide-slate-100">
            {locked.map((u) => (
              <li key={u.id} className="py-2 flex items-center justify-between gap-2">
                <span className="text-sm text-slate-800 min-w-0 truncate">{u.name} <span className="text-xs text-slate-500">({u.email})</span></span>
                <button type="button" onClick={() => unlock(u)}
                  className="h-8 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer shrink-0">
                  ปลดล็อก
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default ApiAdminPanel;
