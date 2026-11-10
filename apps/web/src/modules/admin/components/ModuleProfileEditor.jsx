import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, Save, Users, UserCheck } from 'lucide-react';

const selectClass =
  'mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs';

export default function ModuleProfileEditor({ department, data, onReview, onClose }) {
  const current = data?.profiles?.[department] || {};
  const [draft, setDraft] = useState({
    document_code: current.document_code || `VCC-AP-${department}-2026`,
    revision: current.revision || '01',
    reviewer_dept: current.reviewer_dept || department,
    approver_dept: current.approver_dept || 'QA',
    min_preparer_level: current.min_preparer_level || data?.policy?.min_requester_level || 4,
    required_reviewer_level: current.required_reviewer_level || data?.policy?.required_reviewer_level || 4,
    required_approver_level: current.required_approver_level || data?.policy?.required_approver_level || 5,
    assigned_reviewer_id: current.assigned_reviewer_id || '',
    assigned_approver_id: current.assigned_approver_id || ''
  });

  const activeDepartments = (data?.departments || []).filter((d) => d.status === 'ACTIVE');
  const allUsers = data?.users || [];

  // Reviewer candidates: department match, approval level >= required, and not the selected approver (SoD)
  const reviewerCandidates = allUsers.filter(
    (u) =>
      u.departments?.includes(draft.reviewer_dept) &&
      u.approval_level >= draft.required_reviewer_level &&
      u.id !== draft.assigned_approver_id
  );

  // Approver candidates: department match, approval level >= required, and not the selected reviewer (SoD)
  const approverCandidates = allUsers.filter(
    (u) =>
      u.departments?.includes(draft.approver_dept) &&
      u.approval_level >= draft.required_approver_level &&
      u.id !== draft.assigned_reviewer_id
  );

  // Close drawer on ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onReview(draft);
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      {/* Semi-transparent Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Slide-over Drawer (Right Drawer) */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <form
          onSubmit={handleSubmit}
          className="w-screen max-w-lg bg-white shadow-2xl flex flex-col transform transition ease-in-out duration-300 animate-in slide-in-from-right"
        >
          {/* STICKY HEADER */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/80 shrink-0">
            <div>
              <h2 id="drawer-title" className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Users size={18} className="text-indigo-600" />
                แบบฟอร์มและผู้รับผิดชอบ · {department}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                กำหนดสายการอนุมัติดิจิทัลตามมาตรฐาน ISO 9001:2015 Clause 7.5
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดการตั้งค่า"
              className="rounded-lg p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* SCROLLABLE BODY */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Blue SoD Policy Banner */}
            <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50/80 p-4 text-xs text-sky-900 shadow-2xs">
              <ShieldCheck size={20} className="text-sky-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-sky-950">หลักการควบคุมภายในตามมาตรฐานคุณภาพ (ISO 9001:2015 Clause 7.5)</div>
                <p className="mt-1 text-sky-800 leading-relaxed">
                  บังคับใช้กฎ Segregation of Duties (SoD): ผู้จัดทำ ผู้ทบทวน และผู้อนุมัติ ต้องไม่ใช่บุคคลเดียวกัน เพื่อความโปร่งใสและตรวจสอบย้อนกลับได้สมบูรณ์
                </p>
              </div>
            </div>

            {/* Standard Digital Identifier Badge */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-600 font-medium">รหัสบันทึกดิจิทัลมาตรฐาน:</span>
              <span className="font-mono font-semibold px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                VCC-AP-{department}-2026
              </span>
            </div>

            {/* SECTION 1: ผู้ทบทวน (Reviewer) */}
            <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-2xs">
              <legend className="px-2 text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <UserCheck size={16} className="text-indigo-600" />
                ส่วนที่ 1: ผู้ทบทวนแผนงาน (Reviewer)
              </legend>

              {/* แผนกผู้ทบทวน */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  แผนกผู้ทบทวน
                  <select
                    required
                    value={draft.reviewer_dept || ''}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, reviewer_dept: e.target.value, assigned_reviewer_id: '' }))
                    }
                    className={selectClass}
                  >
                    <option value="">เลือกแผนกผู้ทบทวน</option>
                    {activeDepartments.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.code} · {d.name_th}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* ระดับขั้นต่ำของผู้ทบทวน */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  ระดับขั้นต่ำของผู้ทบทวน
                  <select
                    value={draft.required_reviewer_level}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        required_reviewer_level: Number(e.target.value),
                        assigned_reviewer_id: ''
                      }))
                    }
                    className={selectClass}
                  >
                    <option value={4}>[L4] หัวหน้างาน / Supervisor ขึ้นไป (มาตรฐาน)</option>
                    <option value={5}>[L5] ผู้ช่วยผู้จัดการ / Assistant Manager ขึ้นไป</option>
                    <option value={6}>[L6] ผู้จัดการทั่วไป / General Manager ขึ้นไป</option>
                    <option value={7}>[L7] ผู้อำนวยการ / Director ขึ้นไป</option>
                    <option value={8}>[L8] กรรมการผู้จัดการ / Managing Director</option>
                  </select>
                </label>
              </div>

              {/* ชื่อผู้ทบทวน (Candidate Select) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700" htmlFor="assigned_reviewer">
                  ชื่อผู้ทบทวน
                  <select
                    id="assigned_reviewer"
                    value={draft.assigned_reviewer_id || ''}
                    onChange={(e) => setDraft((d) => ({ ...d, assigned_reviewer_id: e.target.value }))}
                    className={selectClass}
                  >
                    <option value="">กำหนดตามระดับขั้นต่ำอัตโนมัติ (หรือเลือกเฉพาะบุคคล)</option>
                    {reviewerCandidates.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · L{u.approval_level}
                      </option>
                    ))}
                  </select>
                </label>
                {draft.reviewer_dept && !reviewerCandidates.length && (
                  <p className="mt-1.5 text-xs text-amber-700">
                    ยังไม่มีผู้ใช้งานในแผนก {draft.reviewer_dept} ที่มีระดับ L{draft.required_reviewer_level} ขึ้นไป
                  </p>
                )}
              </div>
            </fieldset>

            {/* SECTION 2: ผู้อนุมัติ (Approver) */}
            <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-2xs">
              <legend className="px-2 text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <ShieldCheck size={16} className="text-emerald-600" />
                ส่วนที่ 2: ผู้อนุมัติแผนงาน (Approver)
              </legend>

              {/* แผนกผู้อนุมัติ */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  แผนกผู้อนุมัติ
                  <select
                    required
                    value={draft.approver_dept || ''}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, approver_dept: e.target.value, assigned_approver_id: '' }))
                    }
                    className={selectClass}
                  >
                    <option value="">เลือกแผนกผู้อนุมัติ</option>
                    {activeDepartments.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.code} · {d.name_th}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* ระดับขั้นต่ำของผู้อนุมัติ */}
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  ระดับขั้นต่ำของผู้อนุมัติ
                  <select
                    value={draft.required_approver_level}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        required_approver_level: Number(e.target.value),
                        assigned_approver_id: ''
                      }))
                    }
                    className={selectClass}
                  >
                    <option value={5}>[L5] ผู้ช่วยผู้จัดการ / Assistant Manager ขึ้นไป (มาตรฐาน)</option>
                    <option value={6}>[L6] ผู้จัดการทั่วไป / General Manager ขึ้นไป</option>
                    <option value={7}>[L7] ผู้อำนวยการ / Director ขึ้นไป</option>
                    <option value={8}>[L8] กรรมการผู้จัดการ / Managing Director</option>
                  </select>
                </label>
              </div>

              {/* ชื่อผู้อนุมัติ (Candidate Select) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700" htmlFor="assigned_approver">
                  ชื่อผู้อนุมัติ
                  <select
                    id="assigned_approver"
                    value={draft.assigned_approver_id || ''}
                    onChange={(e) => setDraft((d) => ({ ...d, assigned_approver_id: e.target.value }))}
                    className={selectClass}
                  >
                    <option value="">กำหนดตามระดับขั้นต่ำอัตโนมัติ (หรือเลือกเฉพาะบุคคล)</option>
                    {approverCandidates.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · L{u.approval_level}
                      </option>
                    ))}
                  </select>
                </label>
                {draft.approver_dept && !approverCandidates.length && (
                  <p className="mt-1.5 text-xs text-amber-700">
                    ยังไม่มีผู้ใช้งานในแผนก {draft.approver_dept} ที่มีระดับ L{draft.required_approver_level} ขึ้นไป
                  </p>
                )}
              </div>
            </fieldset>
          </div>

          {/* STICKY FOOTER */}
          <div className="border-t border-slate-200 bg-slate-50/80 px-6 py-4 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer shadow-2xs"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              aria-label="ตรวจสอบและบันทึกค่าของแผนก"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 shadow-2xs transition-colors cursor-pointer"
            >
              <Save size={16} />
              <span>บันทึกสายอนุมัติ</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
