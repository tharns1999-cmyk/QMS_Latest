import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, ShieldCheck, Wrench, LockKeyhole } from 'lucide-react';
import { apiGet, apiPut, apiPost, apiDelete, isApiMode } from '../../../api/client';
import { useModuleAccess } from '../../../shared/components/ModuleAccessProvider';
import GovernanceConfirmation from '../components/GovernanceConfirmation';
import ModuleProfileEditor from '../components/ModuleProfileEditor';
import ModulePermissionPanel from '../components/ModulePermissionPanel';

const statuses = { ACTIVE: 'เปิดใช้งาน', READ_ONLY: 'อ่านอย่างเดียว', MAINTENANCE: 'ปรับปรุงระบบ', DISABLED: 'ปิดใช้งาน' };
const statusStyle = { ACTIVE: 'bg-emerald-50 text-emerald-800', READ_ONLY: 'bg-blue-50 text-blue-800', MAINTENANCE: 'bg-amber-50 text-amber-900', DISABLED: 'bg-slate-100 text-slate-700' };
const actionLabels = { MODULE_STATUS_CHANGED: 'เปลี่ยนสถานะ VCC', MODULE_DEPARTMENT_CHANGED: 'เปลี่ยนการเปิดรับงานของแผนก', VCC_DOCUMENT_PROFILE_UPDATED: 'เปลี่ยนแบบฟอร์มและผู้รับผิดชอบ', MODULE_PERMISSION_GRANTED: 'มอบหมายสิทธิ์', MODULE_PERMISSION_REVOKED: 'ถอนสิทธิ์' };

export default function ModuleGovernancePage() {
  const { refresh } = useModuleAccess();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState('ACTIVE');
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('departments');
  const [departmentFilter, setDepartmentFilter] = useState('enabled');
  const [alertFilter, setAlertFilter] = useState('PENDING');
  const [editingDepartment, setEditingDepartment] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const load = useCallback(async () => {
    if (!isApiMode) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [config, history, alerts] = await Promise.all([apiGet('/api/module-governance/vcc'), apiGet('/api/module-governance/vcc/history'), apiGet('/api/module-governance/vcc/alerts')]);
      const grants = config.platformAdmin ? (await apiGet('/api/module-governance/permissions')).grants : [];
      setData({ ...config, history: history.history, alerts: alerts.alerts, grants });
      setSelectedStatus(config.module.status); setMessage(config.module.maintenance_message);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const review = async (title, path, body, department, method = 'put') => {
    setError('');
    try {
      const impact = await apiGet(`/api/module-governance/vcc/impact${department ? `?department=${encodeURIComponent(department)}` : ''}`);
      setSaveError(''); setConfirmation({ title, path, body, impact, method });
    } catch (err) { setError(err.message); }
  };
  const confirm = async (reason) => {
    setBusy(true); setSaveError('');
    try {
      const send = confirmation.method === 'post' ? apiPost : confirmation.method === 'delete' ? apiDelete : apiPut;
      await send(confirmation.path, { ...confirmation.body, version: data.module.version, reason });
      setConfirmation(null); setEditingDepartment('');
      await load(); await refresh();
    } catch (err) { setSaveError(err.message); }
    finally { setBusy(false); }
  };

  if (!isApiMode) return <div className="space-y-4 p-6"><h1 className="text-2xl font-semibold">จัดการระบบย่อย</h1><p role="status">โหมดสาธิต — การควบคุมสิทธิ์และสถานะต้องเชื่อมต่อระบบหลังบ้านจริง หน้านี้ไม่บันทึกการเปลี่ยนแปลงในโหมดสาธิต</p><Link to="/portal" className="text-indigo-700 underline">กลับพอร์ทัล</Link></div>;

  return <div className="mx-auto w-full max-w-6xl space-y-6 pb-8 text-slate-900">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><Link to="/portal" className="mb-3 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-700"><ArrowLeft size={16} />กลับพอร์ทัล</Link>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">จัดการระบบย่อย</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">ควบคุมสถานะ VCC แผนกที่เปิดรับงาน และผู้รับผิดชอบ พร้อมตรวจผลกระทบและประวัติทุกครั้ง</p></div>
      <button disabled={loading || busy} onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={16} />โหลดข้อมูลล่าสุด</button>
    </header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {loading && <p role="status" className="py-8 text-slate-600">กำลังตรวจสอบค่าตั้งค่าและสิทธิ์…</p>}
    {data && <>
      <section aria-label="สถานะระบบย่อย" className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6"><div className="flex items-center gap-3"><LockKeyhole size={20} className="text-slate-500" /><div><h2 className="font-semibold">ระบบควบคุมเอกสาร · DCC</h2><p className="mt-1 text-sm text-slate-600">รักษาการทำงานเดิม การควบคุมสถานะ DCC ยังไม่เปิดในหน้านี้</p></div></div><span className="rounded-lg bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">เปิดใช้งาน</span></div>
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-3 font-semibold"><Wrench size={20} className="text-indigo-600" />ศูนย์ทวนสอบและสอบเทียบ · VCC</h2><span className={`rounded-lg px-3 py-1 text-sm font-medium ${statusStyle[data.module.status]}`}>{statuses[data.module.status]}</span></div>
          <div className="grid items-end gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
            <label className="text-sm font-medium">เปลี่ยนสถานะ<select disabled={loading || busy} value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2">{Object.entries(statuses).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className="text-sm font-medium">ข้อความแจ้งผู้ใช้งาน<input disabled={loading || busy} value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} placeholder="ระบุเมื่อปรับปรุงระบบ" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
            <button disabled={loading || busy || selectedStatus === data.module.status && message === data.module.maintenance_message || selectedStatus === 'MAINTENANCE' && !message.trim()} onClick={() => review(`เปลี่ยน VCC เป็น${statuses[selectedStatus]}`, '/api/module-governance/vcc/status', { status: selectedStatus, maintenance_message: message })} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">ตรวจผลกระทบ</button>
          </div>
          <p className="text-sm leading-6 text-slate-600">อ่านอย่างเดียว: ดูข้อมูลได้แต่บันทึกไม่ได้ · ปรับปรุงระบบ: พักการเข้าใช้งานและการอนุมัติ การติดตามกำหนดและเก็บการแจ้งเตือนยังทำงานต่อ · ปิดใช้งาน: ระงับการเข้า VCC โดยเก็บข้อมูลเดิม</p>
        </div>
      </section>
      <div role="tablist" aria-label="การจัดการ VCC" className="flex gap-1 overflow-x-auto border-b border-slate-200">{[['departments','แผนกและแบบฟอร์ม'],['alerts',`การแจ้งเตือนค้าง (${data.alerts.length})`],['history','ประวัติการตั้งค่า'],...(data.platformAdmin ? [['permissions','ผู้ดูแลที่ได้รับมอบหมาย']] : [])].map(([key,label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${tab === key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>{label}</button>)}</div>
      {tab === 'departments' && <section aria-label="แผนกและแบบฟอร์ม" className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">การเปิดรับงานของแผนก</h2><p className="mt-1 text-sm text-slate-600">เลือกจากข้อมูลแผนกกลาง การปิดรับงานไม่หยุดใบสั่งงานเดิม</p></div><label className="text-sm">แสดงแผนก<select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="ml-2 rounded-xl border border-slate-300 bg-white px-3 py-2"><option value="enabled">เปิดรับงานใหม่</option><option value="disabled">ปิดรับงานใหม่</option></select></label></div>
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">{data.departments.filter((d) => Boolean(d.enabled) === (departmentFilter === 'enabled')).map((d) => <li key={d.code} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0"><h3 className="font-semibold">{d.code} · {d.name_th}</h3><p className={`mt-1 text-sm ${data.readiness[d.code].status === 'READY' ? 'text-emerald-800' : 'text-amber-900'}`}>{data.readiness[d.code].status === 'READY' ? 'พร้อมใช้งาน' : 'Configuration Incomplete · ตั้งค่ายังไม่ครบ'}</p><p className="mt-1 break-words text-xs leading-5 text-slate-600">{data.readiness[d.code].issues.join(' · ') || `${data.profiles[d.code].document_code} · ฉบับ ${data.profiles[d.code].revision}`}</p></div>
          <div className="flex shrink-0 flex-wrap gap-2"><button onClick={() => setEditingDepartment(d.code)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">ตั้งค่า {d.code}</button><button disabled={busy || !d.enabled && (d.status !== 'ACTIVE' || data.readiness[d.code].status !== 'READY')} onClick={() => review(`${d.enabled ? 'ปิด' : 'เปิด'}รับงานใหม่ของ ${d.code}`, `/api/module-governance/vcc/departments/${encodeURIComponent(d.code)}`, { enabled: !d.enabled }, d.code)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">{d.enabled ? 'ปิดรับงานใหม่' : 'เปิดรับงานใหม่'}</button></div>
        </li>)}</ul>
        {editingDepartment && <ModuleProfileEditor key={editingDepartment} department={editingDepartment} data={data} onClose={() => setEditingDepartment('')} onReview={(profile) => review(`บันทึกแบบฟอร์มและผู้รับผิดชอบของ ${editingDepartment}`, `/api/module-governance/vcc/profiles/${encodeURIComponent(editingDepartment)}`, profile, editingDepartment)} />}
      </section>}
      {tab === 'alerts' && <section className="space-y-4"><h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck size={20} />ติดตามกำหนดระหว่างปรับปรุงระบบ</h2><p className="text-sm text-slate-600">รายการยังคงอยู่จนดำเนินการตามขั้นตอนเดิม ไม่มีการเลื่อนวันครบกำหนดหรือยืนยันรับทราบแทนผู้รับผิดชอบ</p><label className="block text-sm">สถานะการแจ้งเตือน<select value={alertFilter} onChange={(e) => setAlertFilter(e.target.value)} className="ml-2 rounded-xl border border-slate-300 px-3 py-2"><option value="PENDING">ยังไม่รับทราบ</option><option value="ACKNOWLEDGED">รับทราบแล้ว</option></select></label><ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">{data.alerts.filter((a) => a.status === alertFilter).map((a) => <li key={a.id} className="space-y-1 p-4"><p className="font-medium">{a.title}</p><p className="text-sm text-slate-600">{a.department} · {a.asset_code} · ครบกำหนด {a.due_date || '—'} · ระดับแจ้งเตือน {a.escalation_level}</p><p className="text-sm">{a.message}</p></li>)}</ul>{!data.alerts.some((a) => a.status === alertFilter) && <p className="py-6 text-sm text-slate-600">ไม่มีการแจ้งเตือนในสถานะนี้</p>}</section>}
      {tab === 'history' && <section><h2 className="mb-4 text-lg font-semibold">ประวัติการตั้งค่า</h2><ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">{data.history.map((row) => { const details = JSON.parse(row.details || '{}'); return <li key={row.id} className="space-y-1 p-4 text-sm"><p className="font-medium">{actionLabels[row.action] || row.action}{details.department ? ` · ${details.department}` : ''}</p><p>{details.reason || 'ไม่ได้ระบุเหตุผลในประวัติเดิม'}</p><p className="text-slate-600">{row.actor_name || row.actor_id || 'ระบบ'} · {new Date(row.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</p>{details.after?.status && <p>{statuses[details.before?.status] || '—'} → {statuses[details.after.status]}</p>}</li>; })}</ul>{!data.history.length && <p className="py-6 text-sm text-slate-600">ยังไม่มีประวัติการเปลี่ยนค่าตั้งค่า</p>}</section>}
      {tab === 'permissions' && data.platformAdmin && <ModulePermissionPanel users={data.users} grants={data.grants} onReview={(method,grant) => review(method === 'post' ? 'มอบหมายสิทธิ์ผู้ดูแล' : 'ถอนสิทธิ์ผู้ดูแล', '/api/module-governance/permissions', grant, null, method)} />}
    </>}
    {confirmation && <GovernanceConfirmation {...confirmation} error={saveError} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={confirm} />}
  </div>;
}
