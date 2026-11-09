import React, { useState } from 'react';

const input = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600';

export default function ModuleProfileEditor({ department, data, onReview, onClose }) {
  const current = data.profiles[department] || {};
  const [draft, setDraft] = useState({ ...current,
    min_preparer_level: current.min_preparer_level || data.policy.min_requester_level,
    required_reviewer_level: current.required_reviewer_level || data.policy.required_reviewer_level,
    required_approver_level: current.required_approver_level || data.policy.required_approver_level
  });
  const update = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const activeDepartments = data.departments.filter((d) => d.status === 'ACTIVE');
  return (
    <form onSubmit={(e) => { e.preventDefault(); onReview(draft); }} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4"><h2 className="text-lg font-semibold">แบบฟอร์มและผู้รับผิดชอบ · {department}</h2><button type="button" onClick={onClose} className="text-sm text-slate-600 underline underline-offset-4">ปิดการตั้งค่า</button></div>
      {!data.forms.length && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Configuration Incomplete — ยังไม่มีแบบฟอร์ม DCC ที่มีผลบังคับใช้ให้เลือก กรุณาตรวจทะเบียนเอกสารก่อน</p>}
      <label className="block text-sm font-medium">แบบฟอร์มควบคุมที่มีผลบังคับใช้
        <select required className={input} value={data.forms.find((f) => f.doc_code === draft.document_code && f.revision === draft.revision)?.id || ''}
          onChange={(e) => { const form = data.forms.find((f) => f.id === e.target.value); setDraft((d) => ({ ...d, document_code: form?.doc_code || '', revision: form?.revision || '' })); }}>
          <option value="">เลือกจากทะเบียน DCC</option>{data.forms.map((f) => <option key={f.id} value={f.id}>{f.doc_code} · ฉบับ {f.revision} · {f.name}</option>)}
        </select>
      </label>
      <label className="block max-w-sm text-sm font-medium">ระดับขั้นต่ำของผู้จัดทำในแผนกนี้
        <input type="number" required min={data.policy.min_requester_level} max={8} className={input} value={draft.min_preparer_level} onChange={(e) => update('min_preparer_level', Number(e.target.value))} />
      </label>
      <p className="text-sm text-slate-600">ผู้จัดทำต้องสังกัดแผนก {department} และมีระดับตามเกณฑ์ ผู้จัดทำ ผู้ทบทวน และผู้อนุมัติต้องเป็นคนละคน</p>
      <div className="grid gap-6 md:grid-cols-2">
        {['reviewer', 'approver'].map((stage) => {
          const label = stage === 'reviewer' ? 'ผู้ทบทวน' : 'ผู้อนุมัติ';
          const candidates = data.users.filter((u) => u.departments.includes(draft[`${stage}_dept`]) && u.approval_level >= draft[`required_${stage}_level`]
            && u.id !== draft[`assigned_${stage === 'reviewer' ? 'approver' : 'reviewer'}_id`]);
          return <fieldset key={stage} className="min-w-0 space-y-3"><legend className="font-semibold">{label}</legend>
            <label className="block text-sm">แผนก{label}<select required className={input} value={draft[`${stage}_dept`] || ''}
              onChange={(e) => setDraft((d) => ({ ...d, [`${stage}_dept`]: e.target.value, [`assigned_${stage}_id`]: '' }))}>
              <option value="">เลือกแผนก</option>{activeDepartments.map((d) => <option key={d.code} value={d.code}>{d.code} · {d.name_th}</option>)}
            </select></label>
            <label className="block text-sm">ระดับขั้นต่ำ{label}<input type="number" required min={data.policy[`required_${stage}_level`]} max={8} className={input}
              value={draft[`required_${stage}_level`]} onChange={(e) => setDraft((d) => ({ ...d, [`required_${stage}_level`]: Number(e.target.value), [`assigned_${stage}_id`]: '' }))} /></label>
            <label className="block text-sm">ชื่อ{label}<select required className={input} value={draft[`assigned_${stage}_id`] || ''} onChange={(e) => update(`assigned_${stage}_id`, e.target.value)}>
              <option value="">เลือกผู้มีสิทธิ์</option>{candidates.map((u) => <option key={u.id} value={u.id}>{u.name} · L{u.approval_level}</option>)}
            </select></label>
            {!candidates.length && <p className="text-sm text-amber-900">ยังไม่มีผู้ใช้งานที่ผ่านเกณฑ์นี้</p>}
          </fieldset>;
        })}
      </div>
      <button disabled={!data.forms.length} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">ตรวจสอบและบันทึกค่าของแผนก</button>
    </form>
  );
}
