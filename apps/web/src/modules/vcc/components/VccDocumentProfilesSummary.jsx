import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchVccDocumentProfiles } from '../api/vccPlanApi';

export default function VccDocumentProfilesSummary() {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    fetchVccDocumentProfiles().then((res) => { if (alive) { setData(res); setSelected(Object.keys(res.profiles || {})[0] || ''); } }).catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, []);
  if (error) return <p role="alert" className="text-red-700">{error}</p>;
  if (!data) return <p role="status">กำลังโหลดค่าตั้งค่าแผนก…</p>;
  const profile = data.profiles[selected];
  return <div className="space-y-4">
    <label className="block text-sm font-semibold">แผนกที่ตั้งค่าแล้ว<select value={selected} onChange={(e) => setSelected(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">{Object.keys(data.profiles).map((dept) => <option key={dept} value={dept}>{dept}</option>)}</select></label>
    {profile ? <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm"><dt className="text-slate-600">แบบฟอร์ม</dt><dd>{profile.document_code} · ฉบับ {profile.revision}</dd><dt className="text-slate-600">ชื่อแบบฟอร์ม</dt><dd>{profile.title_th}</dd><dt className="text-slate-600">ผู้ทบทวน</dt><dd>{profile.reviewer_dept} · L{profile.required_reviewer_level} ขึ้นไป</dd><dt className="text-slate-600">ผู้อนุมัติ</dt><dd>{profile.approver_dept || 'ยังไม่ได้ตั้งค่า'} · L{profile.required_approver_level} ขึ้นไป</dd></dl> : <p className="text-sm text-slate-600">ยังไม่มีโปรไฟล์แผนก</p>}
    {data.readiness?.[selected]?.status === 'CONFIGURATION_INCOMPLETE' && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Configuration Incomplete · {data.readiness[selected].issues.join(' · ')}</p>}
    <p className="text-sm leading-6 text-slate-600">การเปลี่ยนแบบฟอร์ม ผู้รับผิดชอบ และการเปิดรับงานใหม่อยู่ที่หน้าจัดการระบบย่อย และต้องได้รับมอบหมายสิทธิ์ก่อน</p>
    {data.canManage && <Link to="/admin/modules" className="inline-block rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">ไปจัดการระบบย่อย</Link>}
  </div>;
}
