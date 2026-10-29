import React from 'react';
import { AlertTriangle, CheckCircle2, FolderTree, Trash2, X } from 'lucide-react';
import { computeDueDates, computeDueDateForMonth } from '../api/vccPlanApi';

const formatThaiDateTime = (iso) => {
  if (!iso) return '-';
  try {
    return new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const PLAN_AUDIT_LABELS = {
  VCC_PLAN_CREATED: { label: 'สร้างแผนประจำปีใหม่', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  VCC_PLAN_UPDATED: { label: 'แก้ไขข้อมูลหัวแผน', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  VCC_PLAN_ITEM_SAVED: { label: 'เพิ่ม/แก้ไขเครื่องมือในแผน', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  VCC_PLAN_ITEM_REMOVED: { label: 'ลบเครื่องมือออกจากแผน', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
  VCC_PLAN_SUBMITTED: { label: 'ส่งทบทวนแผน (Submit)', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  VCC_PLAN_REVIEWED: { label: 'ยืนยันการทบทวนแผน (Review)', badge: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  VCC_PLAN_APPROVED: { label: 'อนุมัติแผนประจำปี (Approve)', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  VCC_PLAN_REJECTED: { label: 'ส่งกลับแก้ไข (Reject)', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
  VCC_PLAN_SETTINGS_UPDATED: { label: 'แก้ไขตั้งค่าแผนประจำปี', badge: 'bg-slate-100 text-slate-700 border-slate-200' }
};

export const PlanFormModal = ({
  open,
  onClose,
  editingPlan,
  form,
  setForm,
  error,
  saving,
  onSubmit,
  activeDepartments
}) => {
  if (!open) return null;

  const previewYear = form.plan_year && Number.isInteger(Number(form.plan_year)) && Number(form.plan_year) >= 2000 && Number(form.plan_year) <= 2100
    ? Number(form.plan_year)
    : new Date().getFullYear();
  const endOfMonthPreview = computeDueDateForMonth(previewYear, 2, 'END_OF_MONTH');
  const startOfMonthPreview = computeDueDateForMonth(previewYear, 2, 'START_OF_MONTH');

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {editingPlan ? `แก้ไขหัวแผนประจำปี ${editingPlan.plan_year}` : 'สร้างแผนการทวนสอบเครื่องมือประจำปีใหม่'}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          {error && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center gap-2">
              <AlertTriangle size={17} className="text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="plan_year" className="block text-sm font-semibold text-slate-700 mb-1.5">
                ปี ค.ศ. ของแผน <span className="text-rose-600">*</span>
              </label>
              <input
                id="plan_year"
                type="number"
                required
                min={2000}
                max={2100}
                disabled={Boolean(editingPlan)}
                value={form.plan_year || ''}
                onChange={(e) => {
                  const yr = Number(e.target.value);
                  const isDefaultTitle = !form.title || form.title.startsWith('แผนการทวนสอบเครื่องมือประจำปี');
                  setForm({
                    ...form,
                    plan_year: yr,
                    title: isDefaultTitle && yr ? `แผนการทวนสอบเครื่องมือประจำปี ${yr}` : form.title
                  });
                }}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium disabled:bg-slate-100"
              />
              <p className="mt-1 text-xs text-slate-500 font-medium">
                {form.plan_year && Number.isInteger(Number(form.plan_year)) && Number(form.plan_year) >= 2000 && Number(form.plan_year) <= 2100
                  ? `ตรงกับ พ.ศ. ${Number(form.plan_year) + 543}`
                  : 'รองรับ ค.ศ. 2000–2100'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                แผนกเจ้าของแผน (Master Data) <span className="text-rose-600">*</span>
              </label>
              <select
                required
                disabled={Boolean(editingPlan) || activeDepartments.length === 0}
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white disabled:bg-slate-100"
              >
                <option value="" disabled>
                  {activeDepartments.length === 0 ? '-- โหลดแผนกไม่ได้ --' : '-- เลือกแผนก --'}
                </option>
                {activeDepartments.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} — {d.nameTh}
                  </option>
                ))}
              </select>
              {activeDepartments.length === 0 && (
                <p className="mt-1.5 text-xs text-rose-600 font-semibold">
                  ไม่สามารถโหลดแผนกจาก Master Data ได้ กรุณาตรวจสอบข้อมูลแผนกก่อนบันทึก
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">รหัสแบบฟอร์มเอกสาร</label>
              <input
                type="text"
                required
                value={form.document_code}
                onChange={(e) => setForm({ ...form, document_code: e.target.value })}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-mono font-medium"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Revision (ครั้งที่แก้ไข)</label>
              <input
                type="text"
                required
                value={form.revision}
                onChange={(e) => setForm({ ...form, revision: e.target.value })}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-mono font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อแผนประจำปี</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              กติกาคำนวณวันครบกำหนด (เมื่อแผนระบุเฉพาะเดือน)
            </label>
            <select
              value={form.due_date_rule}
              onChange={(e) => setForm({ ...form, due_date_rule: e.target.value })}
              className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white"
            >
              <option value="END_OF_MONTH">วันสิ้นเดือนของเดือนที่วางแผน (END_OF_MONTH เช่น {endOfMonthPreview})</option>
              <option value="START_OF_MONTH">วันที่ 1 ของเดือนที่วางแผน (START_OF_MONTH เช่น {startOfMonthPreview})</option>
            </select>
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving || activeDepartments.length === 0}
              className="h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกแผนประจำปี'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const PlanItemModal = ({
  open,
  onClose,
  plan,
  itemForm,
  setItemForm,
  error,
  saving,
  onSubmit,
  activeAssets,
  providers,
  activeDepartments
}) => {
  if (!open || !plan) return null;

  const handleAssetChange = (newAssetId) => {
    const chosen = activeAssets.find((a) => a.id === newAssetId);
    setItemForm((prev) => ({
      ...prev,
      asset_id: newAssetId,
      responsible_dept: chosen?.department || prev.responsible_dept || plan.department
    }));
  };

  const handleFrequencyChange = (newFreq) => {
    let defaultMonths = itemForm.planned_months;
    if (newFreq === 'รายเดือน') {
      defaultMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    } else if (newFreq === 'รายไตรมาส') {
      defaultMonths = [1, 4, 7, 10];
    } else if (newFreq === 'รายครึ่งปี') {
      defaultMonths = [1, 7];
    } else if (newFreq === 'รายปี' && defaultMonths.length > 2) {
      defaultMonths = [defaultMonths[0] || 1];
    }
    setItemForm((prev) => ({
      ...prev,
      frequency_label: newFreq,
      planned_months: defaultMonths
    }));
  };

  const toggleMonth = (m) => {
    const exists = itemForm.planned_months.includes(m);
    const next = exists
      ? itemForm.planned_months.filter((x) => x !== m)
      : [...itemForm.planned_months, m].sort((a, b) => a - b);
    setItemForm({ ...itemForm, planned_months: next });
  };

  const previewDueDates = computeDueDates(plan.plan_year, itemForm.planned_months, plan.due_date_rule);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            กำหนดตารางทวนสอบเครื่องมือในแผนปี {plan.plan_year}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center gap-2">
              <AlertTriangle size={17} className="text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              เครื่องมือวัด / กลุ่มเครื่องมือ (เฉพาะสถานะ ACTIVE) <span className="text-rose-600">*</span>
            </label>
            <select
              required
              value={itemForm.asset_id}
              onChange={(e) => handleAssetChange(e.target.value)}
              className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white"
            >
              <option value="" disabled>-- เลือกเครื่องมือจากทะเบียน --</option>
              {activeAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.asset_code} — {a.name} {a.is_group ? '(กลุ่มเครื่องมือแม่)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                สถาบัน / หน่วยงานที่ทวนสอบ <span className="text-rose-600">*</span>
              </label>
              <select
                required
                value={itemForm.provider_name}
                onChange={(e) => setItemForm({ ...itemForm, provider_name: e.target.value })}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white"
              >
                {providers.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">ความถี่การทวนสอบ</label>
              <select
                value={itemForm.frequency_label}
                onChange={(e) => handleFrequencyChange(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white"
              >
                <option value="รายปี">รายปี</option>
                <option value="รายครึ่งปี">รายครึ่งปี</option>
                <option value="รายไตรมาส">รายไตรมาส</option>
                <option value="รายเดือน">รายเดือน</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              เดือนที่วางแผนทวนสอบ (Plan เดือน 1 - 12) <span className="text-rose-600">*</span>
            </label>
            <div className="grid grid-cols-6 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => {
                const selected = itemForm.planned_months.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMonth(m)}
                    className={`py-2 rounded-xl border text-sm font-bold transition-colors cursor-pointer ${
                      selected
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    เดือน {m}
                  </button>
                );
              })}
            </div>
            <div className="mt-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-700 font-medium">
              <span className="font-bold text-slate-900">วันครบกำหนดตามกติกา ({plan.due_date_rule}):</span>{' '}
              <span className="font-mono text-slate-900 font-bold">{previewDueDates.length > 0 ? previewDueDates.join(', ') : 'กรุณาเลือกอย่างน้อย 1 เดือน'}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                แผนกผู้รับผิดชอบ (Master Data) <span className="text-rose-600">*</span>
              </label>
              <select
                required
                disabled={activeDepartments.length === 0}
                value={itemForm.responsible_dept}
                onChange={(e) => setItemForm({ ...itemForm, responsible_dept: e.target.value })}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white disabled:bg-slate-100"
              >
                {activeDepartments.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} — {d.nameTh}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">ตำแหน่ง/ผู้รับผิดชอบ</label>
              <input
                type="text"
                value={itemForm.responsible_label}
                onChange={(e) => setItemForm({ ...itemForm, responsible_label: e.target.value })}
                placeholder="เช่น QC Sup., เจ้าหน้าที่ Store"
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุ</label>
            <input
              type="text"
              value={itemForm.remarks}
              onChange={(e) => setItemForm({ ...itemForm, remarks: e.target.value })}
              placeholder="เช่น ฝ่าย Store เป็นฝ่ายสอบเทียบ FM-ST-31"
              className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving || itemForm.planned_months.length === 0 || activeDepartments.length === 0}
              className="h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกรายการในแผน'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const PlanWorkflowModal = ({
  modalState,
  onClose,
  commentOrReason,
  setCommentOrReason,
  error,
  saving,
  onConfirm
}) => {
  if (!modalState) return null;
  const isReject = modalState.mode === 'REJECT';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {isReject
              ? 'ส่งกลับแก้ไขแผนประจำปี (Reject)'
              : modalState.mode === 'REVIEW'
                ? 'ยืนยันการทบทวนแผนประจำปี (Review)'
                : 'ยืนยันการอนุมัติแผนประจำปี (Approve)'}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onConfirm} className="p-6 space-y-4">
          {error && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center gap-2">
              <AlertTriangle size={17} className="text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              {isReject ? 'เหตุผลในการส่งกลับแก้ไข' : 'ความเห็นเพิ่มเติม (ถ้ามี)'}{' '}
              {isReject && <span className="text-rose-600">*</span>}
            </label>
            <textarea
              rows={3}
              required={isReject}
              value={commentOrReason}
              onChange={(e) => setCommentOrReason(e.target.value)}
              placeholder={isReject ? 'ระบุสิ่งที่ต้องแก้ไขในแผนประจำปี...' : 'ความเห็นประกอบการทบทวน/อนุมัติ...'}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving || (isReject && !commentOrReason.trim())}
              className={`h-10 px-5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-colors cursor-pointer shadow-2xs ${
                isReject ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {saving
                ? 'กำลังบันทึก...'
                : isReject
                  ? 'ยืนยันส่งกลับแก้ไข'
                  : modalState.mode === 'REVIEW'
                    ? 'บันทึกผลการทบทวน'
                    : 'บันทึกการอนุมัติแผน'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const GroupWorkOrderModal = ({
  modalData,
  onClose,
  selectedChildId,
  setSelectedChildId,
  checkResult,
  checkError,
  onValidate
}) => {
  if (!modalData) return null;
  const { item, childAssets } = modalData;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            ตรวจสอบความพร้อมก่อนออกใบสั่งงาน ({item.asset_code})
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 text-sm text-purple-900 space-y-1.5">
            <div className="font-bold flex items-center gap-2">
              <FolderTree size={16} />
              <span>กติกาเครื่องมือแบบกลุ่ม ({item.asset_code} — {item.asset_name})</span>
            </div>
            <p className="leading-relaxed">
              รายการในตารางแผนประจำปีเป็นกลุ่มเครื่องมือแม่ ห้ามออกใบสั่งงานในนามกลุ่มโดยตรง ต้องแยกรหัสเครื่องมือลูก (รายตัว) ที่ใช้งานอยู่ก่อนเสมอ
            </p>
          </div>

          {checkError && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center gap-2">
              <AlertTriangle size={17} className="text-rose-600 shrink-0" />
              <span>{checkError}</span>
            </div>
          )}

          {checkResult && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm space-y-1.5 font-medium">
              <div className="font-bold flex items-center gap-2">
                <CheckCircle2 size={17} className="text-emerald-600" />
                <span>พร้อมสร้างใบสั่งงานสำหรับเครื่องมือรายตัว: {checkResult.target_asset.asset_code}</span>
              </div>
              <div>ชื่อเครื่องมือ: {checkResult.target_asset.name}</div>
              <div>วันครบกำหนดตามแผน: <span className="font-mono font-bold">{(checkResult.due_dates || []).join(', ')}</span></div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              เลือกรหัสเครื่องมือลูก (ACTIVE) ในกลุ่ม {item.asset_code}
            </label>
            <select
              aria-label="เลือกรหัสเครื่องมือลูก"
              value={selectedChildId}
              onChange={(e) => setSelectedChildId(e.target.value)}
              className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white"
            >
              <option value="">-- ยังไม่ได้เลือกรหัสเครื่องมือรายตัว --</option>
              {childAssets.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.asset_code} — {ch.name}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">
              ปิดหน้าต่าง
            </button>
            <button
              type="button"
              onClick={onValidate}
              className="h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors cursor-pointer shadow-2xs"
            >
              ตรวจสอบการออกใบสั่งงาน
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const PlanSettingsModal = ({
  open,
  onClose,
  draftProviders,
  setDraftProviders,
  newProvider,
  setNewProvider,
  draftSettings,
  setDraftSettings,
  saving,
  onSave
}) => {
  if (!open) return null;

  const addProvider = () => {
    const trimmed = newProvider.trim();
    if (!trimmed || draftProviders.includes(trimmed)) return;
    setDraftProviders([...draftProviders, trimmed]);
    setNewProvider('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">ตั้งค่าแผนประจำปีและเกณฑ์อนุมัติ (DCC)</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">ประเภทเอกสารใน Approval Matrix</label>
              <select
                value={draftSettings.approval_doc_type}
                onChange={(e) => setDraftSettings({ ...draftSettings, approval_doc_type: e.target.value })}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white"
              >
                <option value="FM">FM (แบบฟอร์ม)</option>
                <option value="WI">WI (วิธีปฏิบัติงาน)</option>
                <option value="SOP">SOP (ระเบียบปฏิบัติ)</option>
                <option value="QM">QM (คู่มือคุณภาพ)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">กติกาวันครบกำหนดเริ่มต้น</label>
              <select
                value={draftSettings.due_date_rule}
                onChange={(e) => setDraftSettings({ ...draftSettings, due_date_rule: e.target.value })}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white"
              >
                <option value="END_OF_MONTH">วันสิ้นเดือน (END_OF_MONTH)</option>
                <option value="START_OF_MONTH">วันที่ 1 ของเดือน (START_OF_MONTH)</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">รายชื่อสถาบัน / หน่วยงานที่ทวนสอบ</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newProvider}
                onChange={(e) => setNewProvider(e.target.value)}
                placeholder="เพิ่มชื่อหน่วยงานทวนสอบ..."
                className="flex-1 h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium"
              />
              <button type="button" onClick={addProvider} className="h-10 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors cursor-pointer">
                เพิ่ม
              </button>
            </div>
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-200 max-h-40 overflow-y-auto">
              {draftProviders.map((p) => (
                <div key={p} className="px-3.5 py-2.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-800">{p}</span>
                  {draftProviders.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setDraftProviders(draftProviders.filter((x) => x !== p))}
                      className="text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg cursor-pointer"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onSave}
              className="h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const PlanHistoryModal = ({ open, onClose, history = [] }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">ประวัติการอนุมัติและแก้ไขแผน (Audit Log)</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-3.5">
          {history.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-8 font-medium">ยังไม่มีประวัติการดำเนินการ</div>
          ) : (
            history.map((h) => {
              const meta = PLAN_AUDIT_LABELS[h.action] || { label: h.action, badge: 'bg-slate-100 text-slate-700 border-slate-200' };
              return (
                <div key={h.id} className="p-4 rounded-xl border border-slate-200 text-sm space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`px-2.5 py-0.5 rounded-md border text-xs font-bold ${meta.badge}`}>{meta.label}</span>
                    <span className="text-xs text-slate-500 font-mono">{formatThaiDateTime(h.at)} • {h.actor_name || h.actor_id}</span>
                  </div>
                  {h.details?.reason && <div className="text-rose-700 font-semibold text-sm">เหตุผล: {h.details.reason}</div>}
                  {h.details?.comment && <div className="text-slate-700 font-medium text-sm">ความเห็น: {h.details.comment}</div>}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export const STANDARD_UNPLANNED_REASONS = [
  'ยังไม่ถึงกำหนดตามรอบความถี่',
  'อยู่ระหว่างส่งซ่อมภายนอก',
  'พักการใช้งานชั่วคราว'
];

export const UnplannedJustificationModal = ({
  open,
  onClose,
  unplannedItems = [],
  onSaveJustifications,
  saving = false
}) => {
  const [reasons, setReasons] = React.useState({});
  const [customReasons, setCustomReasons] = React.useState({});
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    const initial = {};
    const initialCustom = {};
    for (const item of unplannedItems) {
      const existing = (item.remarks || '').trim();
      if (STANDARD_UNPLANNED_REASONS.includes(existing)) {
        initial[item.asset_id] = existing;
      } else if (existing) {
        initial[item.asset_id] = 'CUSTOM';
        initialCustom[item.asset_id] = existing;
      } else {
        initial[item.asset_id] = STANDARD_UNPLANNED_REASONS[0];
      }
    }
    setReasons(initial);
    setCustomReasons(initialCustom);
    setError('');
  }, [open, unplannedItems]);

  if (!open) return null;

  const handleApplyAll = (standardReason) => {
    const next = { ...reasons };
    for (const item of unplannedItems) {
      next[item.asset_id] = standardReason;
    }
    setReasons(next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const updates = [];
    for (const item of unplannedItems) {
      const selected = reasons[item.asset_id];
      const finalReason = selected === 'CUSTOM' ? (customReasons[item.asset_id] || '').trim() : selected;
      if (!finalReason) {
        setError(`กรุณาระบุเหตุผลสำหรับ ${item.asset_code}`);
        return;
      }
      updates.push({
        asset_id: item.asset_id,
        remarks: finalReason
      });
    }

    try {
      await onSaveJustifications(updates);
      onClose();
    } catch (err) {
      setError(err.message || 'ไม่สามารถบันทึกเหตุผลได้');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              ระบุเหตุผลที่ไม่วางแผนทวนสอบในปีนี้
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              เครื่องมือที่ไม่มีรอบทวนสอบ ต้องระบุเหตุผลประกอบก่อนส่งขออนุมัติแผนตามข้อกำหนด QMS
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 overflow-hidden">
          <div className="p-6 overflow-y-auto space-y-4">
            {error && (
              <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center gap-2">
                <AlertTriangle size={17} className="text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <span className="text-slate-600 font-medium">ตัวช่วยกรอกด่วน:</span>
              <button
                type="button"
                onClick={() => handleApplyAll('ยังไม่ถึงกำหนดตามรอบความถี่')}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-indigo-700 hover:bg-indigo-50 font-semibold cursor-pointer shadow-2xs transition-colors"
              >
                เลือก &ldquo;ยังไม่ถึงกำหนดตามรอบความถี่&rdquo; ให้ทั้งหมด
              </button>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {unplannedItems.map((item) => {
                const selected = reasons[item.asset_id] || STANDARD_UNPLANNED_REASONS[0];
                return (
                  <div key={item.id || item.asset_id} className="p-4 bg-white hover:bg-slate-50/50 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 text-sm">{item.asset_code}</span>
                        <span className="text-xs text-slate-500">•</span>
                        <span className="text-sm font-semibold text-slate-800">{item.asset_name}</span>
                      </div>
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                        {item.asset_type || item.frequency_label || 'รายปี'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {STANDARD_UNPLANNED_REASONS.map((reason) => (
                        <label
                          key={reason}
                          className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                            selected === reason
                              ? 'bg-indigo-50 border-indigo-300 text-indigo-950 font-semibold'
                              : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`reason-${item.asset_id}`}
                            checked={selected === reason}
                            onChange={() => setReasons({ ...reasons, [item.asset_id]: reason })}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>{reason}</span>
                        </label>
                      ))}

                      <label
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                          selected === 'CUSTOM'
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-950 font-semibold'
                            : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`reason-${item.asset_id}`}
                          checked={selected === 'CUSTOM'}
                          onChange={() => setReasons({ ...reasons, [item.asset_id]: 'CUSTOM' })}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>ระบุเหตุผลเอง...</span>
                      </label>
                    </div>

                    {selected === 'CUSTOM' && (
                      <input
                        type="text"
                        value={customReasons[item.asset_id] || ''}
                        onChange={(e) => setCustomReasons({ ...customReasons, [item.asset_id]: e.target.value })}
                        placeholder="กรอกเหตุผลที่ไม่วางแผนทวนสอบ..."
                        className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-slate-800"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-9 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-sm font-semibold cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกเหตุผล'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
