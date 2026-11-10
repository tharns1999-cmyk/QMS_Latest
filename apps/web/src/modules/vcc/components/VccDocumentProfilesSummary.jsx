import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, FileText, Shield, UserCheck, Edit3, Save, X, ExternalLink } from 'lucide-react';
import { fetchVccDocumentProfiles, saveVccDocumentProfile } from '../api/vccPlanApi';

export default function VccDocumentProfilesSummary() {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');

  const [draft, setDraft] = useState({
    document_code: '',
    revision: '',
    min_preparer_level: 4,
    reviewer_dept: '',
    required_reviewer_level: 5,
    assigned_reviewer_id: '',
    approver_dept: '',
    required_approver_level: 6,
    assigned_approver_id: '',
    reason: ''
  });

  const loadData = useCallback(() => {
    let alive = true;
    fetchVccDocumentProfiles()
      .then((res) => {
        if (!alive) return;
        setData(res);
        if (!selected) {
          const firstDept = Object.keys(res.profiles || {})[0] || (res.departments?.[0]?.code) || '';
          setSelected(firstDept);
        }
      })
      .catch((err) => {
        if (alive) setError(err.message);
      });
    return () => { alive = false; };
  }, [selected]);

  useEffect(() => {
    return loadData();
  }, [loadData]);

  const profile = data?.profiles?.[selected] || null;

  const startEdit = () => {
    if (!profile) return;
    setDraft({
      document_code: profile.document_code || '',
      revision: profile.revision || '',
      min_preparer_level: Number(profile.min_preparer_level || 4),
      reviewer_dept: profile.reviewer_dept || '',
      required_reviewer_level: Number(profile.required_reviewer_level || 5),
      assigned_reviewer_id: profile.assigned_reviewer_id || '',
      approver_dept: profile.approver_dept || '',
      required_approver_level: Number(profile.required_approver_level || 6),
      assigned_approver_id: profile.assigned_approver_id || '',
      reason: 'ปรับปรุงการตั้งค่าแบบฟอร์มและผู้รับผิดชอบ'
    });
    setEditing(true);
    setSaveSuccess('');
    setError('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!selected) return;

    if (draft.assigned_reviewer_id && draft.assigned_reviewer_id === draft.assigned_approver_id) {
      setError('ผู้ทบทวนและผู้อนุมัติต้องไม่เป็นบุคคลเดียวกัน (Segregation of Duties)');
      return;
    }

    setSaving(true);
    setError('');
    setSaveSuccess('');

    try {
      await saveVccDocumentProfile(selected, draft);
      setEditing(false);
      setSaveSuccess(`บันทึกการตั้งค่าแผนก ${selected} เรียบร้อยแล้ว`);
      loadData();
    } catch (err) {
      setError(err.message || 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  if (error && !data) return <p role="alert" className="text-sm text-red-700 bg-red-50 p-3 rounded-xl">{error}</p>;
  if (!data) return <p role="status" className="text-sm text-slate-500 py-4">กำลังโหลดค่าตั้งค่าแผนก…</p>;

  const availableDepts = Object.keys(data.profiles || {});
  const forms = data.forms || [];
  const users = data.allActiveUsers || [];
  const activeDepts = data.departments || [];
  const isReady = data.readiness?.[selected]?.status === 'READY';
  const issues = data.readiness?.[selected]?.issues || [];

  return (
    <div className="space-y-4">
      {/* Department Selector */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          แผนกที่ตั้งค่าแล้ว
          <select
            value={selected}
            onChange={(e) => { setSelected(e.target.value); setEditing(false); setError(''); setSaveSuccess(''); }}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600"
          >
            {availableDepts.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </label>
      </div>

      {saveSuccess && (
        <div role="status" className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Profile Card */}
      <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4.5 space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100/70 text-indigo-700 flex items-center justify-center font-bold text-sm">
              {selected}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                โปรไฟล์เอกสารและสายอนุมัติประจำแผนก {selected}
              </h3>
              <p className="text-xs text-slate-500">
                {activeDepts.find((d) => d.code === selected)?.name_th || 'แผนกในระบบ'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                isReady
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              {isReady ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              {isReady ? 'พร้อมใช้งาน (Ready)' : 'Configuration Incomplete'}
            </span>

            {data.canManage && !editing && profile && (
              <button
                type="button"
                onClick={startEdit}
                className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Edit3 size={14} />
                แก้ไข
              </button>
            )}
          </div>
        </div>

        {/* Issues Warning */}
        {!isReady && issues.length > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertTriangle size={14} />
              เงื่อนไขที่ยังตั้งค่าไม่ครบ:
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-700 pl-1">
              {issues.map((iss, idx) => (
                <li key={idx}>{iss}</li>
              ))}
            </ul>
          </div>
        )}

        {/* View Mode */}
        {!editing ? (
          profile ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
              {/* Box 1: Document */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-slate-800">
                  <FileText size={15} className="text-indigo-600" />
                  แบบฟอร์มควบคุม DCC
                </div>
                <div className="space-y-1 text-slate-600">
                  <p className="font-mono font-bold text-slate-900 text-sm">{profile.document_code} · Rev.{profile.revision}</p>
                  <p className="line-clamp-2">{profile.title_th || '-'}</p>
                  <p className="text-[11px] text-slate-400">วันประกาศใช้: {profile.form_issue_date || '-'}</p>
                </div>
              </div>

              {/* Box 2: Reviewer */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-slate-800">
                  <Shield size={15} className="text-indigo-600" />
                  ผู้ทบทวนแผน (Reviewer)
                </div>
                <div className="space-y-1 text-slate-600">
                  <p className="font-semibold text-slate-900">
                    แผนก {profile.reviewer_dept} · L{profile.required_reviewer_level}+
                  </p>
                  <p className="text-slate-700">
                    {profile.assigned_reviewer_id
                      ? (users.find((u) => u.id === profile.assigned_reviewer_id)?.name || profile.assigned_reviewer_id)
                      : 'ผู้มีสิทธิ์ตามระดับในแผนก'}
                  </p>
                </div>
              </div>

              {/* Box 3: Approver */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-slate-800">
                  <UserCheck size={15} className="text-indigo-600" />
                  ผู้อนุมัติแผน (Approver)
                </div>
                <div className="space-y-1 text-slate-600">
                  <p className="font-semibold text-slate-900">
                    แผนก {profile.approver_dept || 'MGT'} · L{profile.required_approver_level}+
                  </p>
                  <p className="text-slate-700">
                    {profile.assigned_approver_id
                      ? (users.find((u) => u.id === profile.assigned_approver_id)?.name || profile.assigned_approver_id)
                      : 'ผู้มีสิทธิ์ตามระดับในแผนก'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 py-3">ยังไม่มีข้อมูลโปรไฟล์เอกสารของแผนก {selected}</p>
          )
        ) : (
          /* Edit Mode Form */
          <form onSubmit={handleSave} className="space-y-4 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">แบบฟอร์ม DCC ควบคุม</label>
                <select
                  value={forms.find((f) => f.doc_code === draft.document_code && f.revision === draft.revision)?.id || ''}
                  onChange={(e) => {
                    const form = forms.find((f) => f.id === e.target.value);
                    if (form) {
                      setDraft((d) => ({
                        ...d,
                        document_code: form.doc_code,
                        revision: form.revision
                      }));
                    }
                  }}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white font-medium text-slate-800 text-xs"
                >
                  <option value="">-- เลือกจากแบบฟอร์มที่มีผลบังคับใช้ --</option>
                  {forms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.doc_code} Rev.{f.revision} — {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">ระดับขั้นต่ำผู้จัดทำแผน (L4-L8)</label>
                <input
                  type="number"
                  min="4"
                  max="8"
                  value={draft.min_preparer_level}
                  onChange={(e) => setDraft({ ...draft, min_preparer_level: Number(e.target.value) })}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">แผนกผู้ทบทวน</label>
                <select
                  value={draft.reviewer_dept}
                  onChange={(e) => setDraft({ ...draft, reviewer_dept: e.target.value, assigned_reviewer_id: '' })}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium"
                >
                  <option value="">-- เลือกแผนก --</option>
                  {activeDepts.map((d) => (
                    <option key={d.code} value={d.code}>{d.code} · {d.name_th}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">ผู้ทบทวนที่มอบหมาย</label>
                <select
                  value={draft.assigned_reviewer_id}
                  onChange={(e) => setDraft({ ...draft, assigned_reviewer_id: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium"
                >
                  <option value="">-- ไม่เจาะจงบุคคล (ใช้ระดับตามแผนก) --</option>
                  {users
                    .filter((u) => u.departments?.includes(draft.reviewer_dept) && u.approval_level >= draft.required_reviewer_level)
                    .map((u) => (
                      <option key={u.id} value={u.id}>{u.name} (L{u.approval_level})</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">แผนกผู้อนุมัติ</label>
                <select
                  value={draft.approver_dept}
                  onChange={(e) => setDraft({ ...draft, approver_dept: e.target.value, assigned_approver_id: '' })}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium"
                >
                  <option value="">-- เลือกแผนก --</option>
                  {activeDepts.map((d) => (
                    <option key={d.code} value={d.code}>{d.code} · {d.name_th}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">ผู้อนุมัติที่มอบหมาย</label>
                <select
                  value={draft.assigned_approver_id}
                  onChange={(e) => setDraft({ ...draft, assigned_approver_id: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-medium"
                >
                  <option value="">-- ไม่เจาะจงบุคคล (ใช้ระดับตามแผนก) --</option>
                  {users
                    .filter((u) => u.departments?.includes(draft.approver_dept) && u.approval_level >= draft.required_approver_level)
                    .map((u) => (
                      <option key={u.id} value={u.id}>{u.name} (L{u.approval_level})</option>
                    ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <X size={14} />
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                <Save size={14} />
                {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่าแผนก'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Footer Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-slate-500 border-t border-slate-100">
        <span>การเปิด/ปิดรับงานของแผนก และการเปลี่ยนสถานะซ่อมบำรุงโมดูล ดำเนินการผ่านศูนย์จัดการระบบย่อย</span>
        {data.canManage && (
          <Link
            to="/admin/modules"
            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold"
          >
            <span>เปิดหน้าจัดการระบบย่อย (Module Governance)</span>
            <ExternalLink size={13} />
          </Link>
        )}
      </div>
    </div>
  );
}
