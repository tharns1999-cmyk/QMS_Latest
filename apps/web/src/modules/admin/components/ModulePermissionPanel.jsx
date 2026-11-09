import React, { useState } from 'react';

export default function ModulePermissionPanel({ users, grants, onReview }) {
  const [userId, setUserId] = useState('');
  const [permission, setPermission] = useState('MODULE_MANAGE');
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <h2 className="text-lg font-semibold">มอบหมายผู้ดูแล</h2>
    <p className="text-sm text-slate-600">สิทธิ์นี้แยกจาก DCC ทั่วไป และไม่เพิ่มสิทธิ์จัดทำหรืออนุมัติงานสอบเทียบ</p>
    <form className="flex flex-col items-start gap-3 lg:flex-row lg:items-end" onSubmit={(e) => { e.preventDefault(); onReview('post', { user_id: userId, permission, module_id: permission === 'PLATFORM_ADMIN' ? '*' : 'vcc' }); }}>
      <label className="w-full text-sm lg:flex-1">บัญชีผู้ใช้งาน<select required value={userId} onChange={(e) => setUserId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"><option value="">เลือกบัญชี</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <label className="w-full text-sm lg:w-64">ขอบเขตสิทธิ์<select value={permission} onChange={(e) => setPermission(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"><option value="MODULE_MANAGE">ผู้ดูแล VCC</option><option value="PLATFORM_ADMIN">ผู้ดูแลแพลตฟอร์ม</option></select></label>
      <button className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">มอบหมายสิทธิ์</button>
    </form>
    <ul className="divide-y divide-slate-200">{grants.map((g) => <li key={`${g.user_id}-${g.permission}`} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
      <div><span className="font-medium">{g.name}</span><span className="ml-3 text-slate-600">{g.permission === 'PLATFORM_ADMIN' ? 'ผู้ดูแลแพลตฟอร์ม' : 'ผู้ดูแล VCC'}</span></div>
      <button onClick={() => onReview('delete', g)} className="rounded-lg border border-slate-300 px-3 py-2 text-red-700 hover:bg-red-50">ถอนสิทธิ์</button>
    </li>)}</ul>
  </section>;
}
