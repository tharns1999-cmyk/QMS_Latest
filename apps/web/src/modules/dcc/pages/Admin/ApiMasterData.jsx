import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import useStore from '../../../../store/useStore';
import {
  createUser, updateUser, setUserStatus, resetUserPassword,
  createDepartment, updateDepartment, createLocation, updateLocation, saveMatrixEntry
} from '../../../../api/masterData';

const input = 'h-9 px-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30';
const primary = 'h-9 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg cursor-pointer';
const ghost = 'h-8 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer';
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8];
const STATUS_LABEL = { ACTIVE: 'ใช้งาน', INACTIVE: 'ปิดใช้งาน', LOCKED: 'ถูกล็อก' };

const Field = ({ label, children, wide }) => (
  <label className={`text-xs font-semibold text-slate-700 ${wide ? 'sm:col-span-2' : ''}`}>{label}<div className="mt-1 [&>*]:w-full">{children}</div></label>
);

const StatusBadge = ({ status }) => (
  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : status === 'LOCKED' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
    {STATUS_LABEL[status] || status}
  </span>
);

// Shown once: the server never keeps or returns a temporary password again.
const PasswordNotice = ({ notice, onClose }) => (
  <div role="dialog" aria-label="รหัสผ่านชั่วคราว" className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
    <div className="bg-white rounded-xl p-5 max-w-md w-full space-y-3">
      <h2 className="text-base font-bold text-slate-900">รหัสผ่านชั่วคราวของ {notice.name}</h2>
      <p className="text-sm text-slate-700">อีเมลเข้าสู่ระบบ: <b>{notice.email}</b></p>
      <p className="font-mono text-lg bg-slate-100 rounded-lg px-3 py-2 select-all break-all">{notice.password}</p>
      <p className="text-xs text-amber-700">รหัสนี้แสดงครั้งเดียว ปิดหน้าต่างนี้แล้วดูซ้ำไม่ได้ (ถ้าหายให้กดรีเซ็ตรหัสผ่านใหม่) ผู้ใช้ต้องเปลี่ยนรหัสผ่านเองตอนเข้าครั้งแรก</p>
      <div className="flex justify-end gap-2">
        <button type="button" className={ghost} onClick={() => navigator.clipboard?.writeText(notice.password).then(() => toast.success('คัดลอกแล้ว'), () => {})}>คัดลอก</button>
        <button type="button" className={primary} onClick={onClose}>ปิด</button>
      </div>
    </div>
  </div>
);

const emptyUser = { name: '', email: '', empId: '', department: '', depts: [], approval_level: 1, isDcc: false, isQmr: false };

const UsersTab = ({ onPassword }) => {
  const { adminUsers = [], departments = [], currentUser } = useStore();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // user id, or 'new'
  const [form, setForm] = useState(emptyUser);
  const [busy, setBusy] = useState(false);
  const activeDepts = departments.filter((d) => d.status === 'ACTIVE');
  const rows = useMemo(() => adminUsers.filter((u) => `${u.name} ${u.email} ${u.empId || ''} ${u.department}`.toLowerCase().includes(search.toLowerCase())), [adminUsers, search]);

  const open = (u) => {
    setEditing(u ? u.id : 'new');
    setForm(u ? { name: u.name, email: u.email, empId: u.empId || '', department: u.department, depts: u.depts, approval_level: u.approval_level, isDcc: u.isDcc, isQmr: u.isQmr } : { ...emptyUser, department: activeDepts[0]?.code || '' });
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const toggleDept = (code) => setForm((f) => ({ ...f, depts: f.depts.includes(code) ? f.depts.filter((c) => c !== code) : [...f.depts, code] }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const creating = editing === 'new';
    const result = creating ? await createUser(form) : await updateUser(editing, form);
    setBusy(false);
    if (!result) return;
    setEditing(null);
    if (creating) onPassword({ name: form.name, email: form.email.trim().toLowerCase(), password: result.temporaryPassword });
  };

  const reset = async (u) => {
    if (!window.confirm(`รีเซ็ตรหัสผ่านของ ${u.name}? รหัสเดิมและการเข้าระบบอยู่ตอนนี้จะใช้ไม่ได้`)) return;
    const result = await resetUserPassword(u.id);
    if (result) onPassword({ name: u.name, email: u.email, password: result.temporaryPassword });
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="ค้นหาผู้ใช้" placeholder="ค้นหาชื่อ อีเมล รหัสพนักงาน แผนก" value={search} onChange={(e) => setSearch(e.target.value)} className={`${input} flex-1 min-w-48`} />
        <button type="button" className={primary} onClick={() => open(null)}>เพิ่มผู้ใช้</button>
      </div>
      {editing && (
        <form onSubmit={save} className="bg-white border border-slate-200 rounded-xl p-4 grid gap-3 sm:grid-cols-2">
          <h2 className="sm:col-span-2 text-sm font-bold text-slate-900">{editing === 'new' ? 'เพิ่มผู้ใช้ใหม่' : 'แก้ไขผู้ใช้'}</h2>
          <Field label="ชื่อ-สกุล"><input required className={input} value={form.name} onChange={set('name')} /></Field>
          <Field label="อีเมล (ใช้เข้าสู่ระบบ)"><input required type="email" className={input} value={form.email} onChange={set('email')} /></Field>
          <Field label="รหัสพนักงาน (ถ้ามี)"><input className={input} value={form.empId} onChange={set('empId')} /></Field>
          <Field label="ระดับอนุมัติ">
            <select className={input} value={form.approval_level} onChange={(e) => setForm((f) => ({ ...f, approval_level: Number(e.target.value) }))}>{LEVELS.map((l) => <option key={l} value={l}>L{l}</option>)}</select>
          </Field>
          <Field label="แผนกหลัก">
            <select required className={input} value={form.department} onChange={set('department')}>{activeDepts.map((d) => <option key={d.code} value={d.code}>{d.code} - {d.nameTh}</option>)}</select>
          </Field>
          <Field label="แผนกอื่นที่สังกัดด้วย" wide>
            <div className="flex flex-wrap gap-2">
              {activeDepts.filter((d) => d.code !== form.department).map((d) => (
                <label key={d.code} className="flex items-center gap-1 text-xs font-normal"><input type="checkbox" checked={form.depts.includes(d.code)} onChange={() => toggleDept(d.code)} />{d.code}</label>
              ))}
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDcc} onChange={set('isDcc')} disabled={editing === currentUser?.id} />เป็น DCC (ผู้ดูแลระบบเอกสาร)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isQmr} onChange={set('isQmr')} />เป็น QMR (ตัวแทนฝ่ายบริหารด้านคุณภาพ)</label>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" className={ghost} onClick={() => setEditing(null)}>ยกเลิก</button>
            <button type="submit" className={primary} disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึก'}</button>
          </div>
        </form>
      )}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500 text-left"><tr><th className="p-2">ชื่อ</th><th className="p-2">แผนก</th><th className="p-2">ระดับ</th><th className="p-2">สิทธิ์พิเศษ</th><th className="p-2">สถานะ</th><th className="p-2" /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="p-2"><div className="font-semibold text-slate-900">{u.name}</div><div className="text-xs text-slate-500">{u.email}{u.empId ? ` · ${u.empId}` : ''}</div></td>
                <td className="p-2">{u.depts.join(', ')}</td>
                <td className="p-2">L{u.approval_level}</td>
                <td className="p-2">{[u.isDcc && 'DCC', u.isQmr && 'QMR'].filter(Boolean).join(', ') || '-'}</td>
                <td className="p-2"><StatusBadge status={u.status} /></td>
                <td className="p-2 whitespace-nowrap text-right space-x-1">
                  <button type="button" className={ghost} onClick={() => open(u)}>แก้ไข</button>
                  <button type="button" className={ghost} onClick={() => reset(u)}>รีเซ็ตรหัสผ่าน</button>
                  {u.id !== currentUser?.id && (u.status === 'ACTIVE'
                    ? <button type="button" className={ghost} onClick={() => window.confirm(`ปิดบัญชีของ ${u.name}? เขาจะเข้าระบบไม่ได้ทันที`) && setUserStatus(u.id, 'INACTIVE')}>ปิดบัญชี</button>
                    : <button type="button" className={ghost} onClick={() => setUserStatus(u.id, 'ACTIVE')}>{u.status === 'LOCKED' ? 'ปลดล็อก' : 'เปิดใช้งาน'}</button>)}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="p-4 text-center text-xs text-slate-500">ไม่พบผู้ใช้</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const DepartmentsTab = () => {
  const { departments = [] } = useStore();
  const [form, setForm] = useState({ code: '', nameTh: '', nameEn: '' });
  const [edit, setEdit] = useState(null); // { code, nameTh, nameEn }
  const add = async (e) => {
    e.preventDefault();
    if (await createDepartment(form)) setForm({ code: '', nameTh: '', nameEn: '' });
  };
  const rename = async (e) => {
    e.preventDefault();
    if (await updateDepartment(edit.code, { name_th: edit.nameTh, name_en: edit.nameEn })) setEdit(null);
  };
  return (
    <section className="space-y-3">
      <form onSubmit={add} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-2">
        <Field label="รหัสแผนก (A-Z 0-9 ไม่เกิน 12 ตัว)"><input required className={`${input} w-40`} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
        <Field label="ชื่อแผนก (ไทย)"><input required className={`${input} w-56`} value={form.nameTh} onChange={(e) => setForm({ ...form, nameTh: e.target.value })} /></Field>
        <Field label="ชื่อแผนก (อังกฤษ)"><input className={`${input} w-56`} value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></Field>
        <button type="submit" className={primary}>เพิ่มแผนก</button>
      </form>
      <p className="text-xs text-slate-500">รหัสแผนกแก้ไม่ได้หลังสร้าง เพราะผู้ใช้และเอกสารอ้างอิงรหัสนี้ แก้ได้เฉพาะชื่อ ปิดแผนกได้เมื่อไม่มีผู้ใช้สังกัดอยู่</p>
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500 text-left"><tr><th className="p-2">รหัส</th><th className="p-2">ชื่อ</th><th className="p-2">สถานะ</th><th className="p-2" /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {departments.map((d) => (
              <tr key={d.code}>
                <td className="p-2 font-semibold">{d.code}</td>
                <td className="p-2">
                  {edit?.code === d.code ? (
                    <form onSubmit={rename} className="flex flex-wrap gap-2">
                      <input aria-label="ชื่อไทย" required className={input} value={edit.nameTh} onChange={(e) => setEdit({ ...edit, nameTh: e.target.value })} />
                      <input aria-label="ชื่ออังกฤษ" className={input} value={edit.nameEn} onChange={(e) => setEdit({ ...edit, nameEn: e.target.value })} />
                      <button type="submit" className={ghost}>บันทึก</button>
                      <button type="button" className={ghost} onClick={() => setEdit(null)}>ยกเลิก</button>
                    </form>
                  ) : <>{d.nameTh}<span className="text-xs text-slate-500"> {d.nameEn}</span></>}
                </td>
                <td className="p-2"><StatusBadge status={d.status} /></td>
                <td className="p-2 text-right space-x-1 whitespace-nowrap">
                  <button type="button" className={ghost} onClick={() => setEdit({ code: d.code, nameTh: d.nameTh, nameEn: d.nameEn })}>แก้ชื่อ</button>
                  <button type="button" className={ghost} onClick={() => updateDepartment(d.code, { status: d.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}>{d.status === 'ACTIVE' ? 'ปิดแผนก' : 'เปิดแผนก'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const LocationsTab = () => {
  const { departments = [], distributionLocations = [] } = useStore();
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState({ department: '', name: '', description: '' });
  const [edit, setEdit] = useState(null);
  const add = async (e) => {
    e.preventDefault();
    if (await createLocation(form)) setForm({ ...form, name: '', description: '' });
  };
  const save = async (e) => {
    e.preventDefault();
    if (await updateLocation(edit.id, { name: edit.name, description: edit.description })) setEdit(null);
  };
  const rows = distributionLocations.filter((l) => !filter || l.departmentId === filter);
  const activeDepts = departments.filter((d) => d.status === 'ACTIVE');
  return (
    <section className="space-y-3">
      <form onSubmit={add} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-2">
        <Field label="แผนก">
          <select required className={input} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
            <option value="">เลือกแผนก</option>{activeDepts.map((d) => <option key={d.code} value={d.code}>{d.code}</option>)}
          </select>
        </Field>
        <Field label="ชื่อสถานที่ / จุดใช้งาน"><input required className={`${input} w-56`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="รายละเอียด"><input className={`${input} w-64`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <button type="submit" className={primary}>เพิ่มสถานที่</button>
      </form>
      <p className="text-xs text-slate-500">สำเนาควบคุมที่ออกไปแล้วจะจำสถานที่เดิมไว้ ถ้าไม่ใช้แล้วให้ปิดแทนการลบ</p>
      <select aria-label="กรองตามแผนก" className={input} value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="">ทุกแผนก</option>{departments.map((d) => <option key={d.code} value={d.code}>{d.code}</option>)}
      </select>
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500 text-left"><tr><th className="p-2">แผนก</th><th className="p-2">สถานที่</th><th className="p-2">สถานะ</th><th className="p-2" /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="p-2 font-semibold">{l.departmentId}</td>
                <td className="p-2">
                  {edit?.id === l.id ? (
                    <form onSubmit={save} className="flex flex-wrap gap-2">
                      <input aria-label="ชื่อสถานที่" required className={input} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                      <input aria-label="รายละเอียด" className={input} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
                      <button type="submit" className={ghost}>บันทึก</button>
                      <button type="button" className={ghost} onClick={() => setEdit(null)}>ยกเลิก</button>
                    </form>
                  ) : <>{l.name}<span className="text-xs text-slate-500"> {l.description}</span></>}
                </td>
                <td className="p-2"><StatusBadge status={l.status} /></td>
                <td className="p-2 text-right space-x-1 whitespace-nowrap">
                  <button type="button" className={ghost} onClick={() => setEdit({ id: l.id, name: l.name, description: l.description })}>แก้ไข</button>
                  <button type="button" className={ghost} onClick={() => updateLocation(l.id, { status: l.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}>{l.status === 'ACTIVE' ? 'ปิด' : 'เปิด'}</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} className="p-4 text-center text-xs text-slate-500">ยังไม่มีสถานที่ กรอกด้านบนเพื่อเพิ่ม</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const MatrixRow = ({ entry }) => {
  const [v, setV] = useState({ min_requester_level: entry.min_requester_level, required_reviewer_level: entry.required_reviewer_level, required_approver_level: entry.required_approver_level });
  const dirty = Object.keys(v).some((k) => v[k] !== entry[k]);
  const level = (k) => (
    <select aria-label={`${entry.doc_type} ${k}`} className={input} value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })}>{LEVELS.map((l) => <option key={l} value={l}>L{l}</option>)}</select>
  );
  return (
    <tr>
      <td className="p-2"><div className="font-semibold">{entry.doc_type}</div><div className="text-xs text-slate-500">{entry.name_th}</div></td>
      <td className="p-2">{level('min_requester_level')}</td>
      <td className="p-2">{level('required_reviewer_level')}</td>
      <td className="p-2">{level('required_approver_level')}</td>
      <td className="p-2 text-right"><button type="button" className={ghost} disabled={!dirty} onClick={() => saveMatrixEntry(entry.doc_type, v)}>บันทึก</button></td>
    </tr>
  );
};

const MatrixTab = () => {
  const { approvalMatrix = [] } = useStore();
  return (
    <section className="space-y-3">
      <p className="text-xs text-slate-500">ระดับต่ำสุดของผู้ยื่นคำขอ ผู้ทบทวน และผู้อนุมัติ ของเอกสารแต่ละประเภท ผู้อนุมัติต้องไม่ต่ำกว่าผู้ทบทวน มีผลกับคำขอที่ยื่นหลังจากบันทึก</p>
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500 text-left"><tr><th className="p-2">ประเภทเอกสาร</th><th className="p-2">ผู้ยื่นขั้นต่ำ</th><th className="p-2">ผู้ทบทวนขั้นต่ำ</th><th className="p-2">ผู้อนุมัติขั้นต่ำ</th><th className="p-2" /></tr></thead>
          <tbody className="divide-y divide-slate-100">{approvalMatrix.map((e) => <MatrixRow key={`${e.doc_type}-${e.updated_at}`} entry={e} />)}</tbody>
        </table>
      </div>
    </section>
  );
};

const TABS = [['users', 'ผู้ใช้'], ['departments', 'แผนก'], ['locations', 'สถานที่แจกจ่ายสำเนา'], ['matrix', 'ระดับผู้ทบทวน/อนุมัติ']];

// API mode: everything here is saved on the server and shared by everyone. The browser-only demo hub is not used.
const ApiMasterData = () => {
  const [tab, setTab] = useState('users');
  const [notice, setNotice] = useState(null);
  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <h1 className="text-lg font-bold text-slate-900">ข้อมูลหลัก (Master Data)</h1>
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-semibold cursor-pointer border-b-2 -mb-px ${tab === id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
        ))}
      </div>
      {tab === 'users' && <UsersTab onPassword={setNotice} />}
      {tab === 'departments' && <DepartmentsTab />}
      {tab === 'locations' && <LocationsTab />}
      {tab === 'matrix' && <MatrixTab />}
      {notice && <PasswordNotice notice={notice} onClose={() => setNotice(null)} />}
    </div>
  );
};

export default ApiMasterData;
