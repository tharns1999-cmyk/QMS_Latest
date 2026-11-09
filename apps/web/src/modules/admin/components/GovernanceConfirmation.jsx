import React, { useEffect, useId, useRef, useState } from 'react';

export default function GovernanceConfirmation({ title, impact, onCancel, onConfirm, busy, error }) {
  const ref = useRef(null);
  const titleId = useId();
  const [reason, setReason] = useState('');
  useEffect(() => { ref.current.showModal?.(); }, []);
  return (
    <dialog ref={ref} aria-labelledby={titleId} onCancel={(e) => { if (busy) e.preventDefault(); else onCancel(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-2xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-900/40">
      <form onSubmit={(e) => { e.preventDefault(); if (reason.trim()) onConfirm(reason.trim()); }} className="space-y-5">
        <h2 id={titleId} className="text-xl font-semibold">{title}</h2>
        {impact && <div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
          <p className="font-semibold">ผลกระทบก่อนเปลี่ยนแปลง</p>
          <p>แผน {impact.plans.reduce((n, r) => n + r.count, 0)} รายการ · ใบสั่งงาน {impact.workOrders.reduce((n, r) => n + r.count, 0)} รายการ · การแจ้งเตือนค้าง {impact.pendingAlerts} รายการ</p>
          <p>การปิดแผนกหยุดรับทะเบียนและแผนใหม่ งานเดิมยังดำเนินการต่อได้ ไม่มีการลบข้อมูลหรือเลื่อนวันครบกำหนด</p>
        </div>}
        <label className="block text-sm font-medium">เหตุผลในการเปลี่ยนแปลง
          <textarea autoFocus required maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600" />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" disabled={busy} onClick={onCancel} className="rounded-xl border border-slate-300 px-4 py-2 disabled:opacity-50">ยกเลิก</button>
          <button type="submit" disabled={busy || !reason.trim()} className="rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? 'กำลังบันทึก…' : 'ยืนยันการเปลี่ยนแปลง'}</button>
        </div>
      </form>
    </dialog>
  );
}
