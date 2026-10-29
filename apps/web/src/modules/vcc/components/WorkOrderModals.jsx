import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

export const CreateWorkOrderModal = ({
  open,
  onClose,
  form,
  setForm,
  error,
  saving,
  onSubmit,
  approvedPlans,
  planItems,
  individualAssets,
  providers
}) => {
  if (!open) return null;

  const selectedPlanItem = planItems.find((i) => i.id === form.plan_item_id);
  const isGroupPlanItem = Number(selectedPlanItem?.is_group) === 1;
  const groupChildren = isGroupPlanItem
    ? individualAssets.filter((a) => a.parent_id === selectedPlanItem.asset_id)
    : [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">สร้างใบสั่งงานทวนสอบ/สอบเทียบ (Work Order)</h2>
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

          <div className="flex gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={form.mode === 'ADHOC'}
                onChange={() => setForm({ ...form, mode: 'ADHOC', plan_id: '', plan_item_id: '' })}
              />
              <span>ใบสั่งงานนอกแผน (Ad-hoc)</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={form.mode === 'PLAN'}
                onChange={() => setForm({ ...form, mode: 'PLAN', plan_id: approvedPlans[0]?.id || '' })}
              />
              <span>สร้างจากแผนประจำปี (APPROVED)</span>
            </label>
          </div>

          {form.mode === 'PLAN' ? (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">แผนประจำปีที่อนุมัติแล้ว (APPROVED)</label>
                <select
                  required
                  value={form.plan_id}
                  onChange={(e) => setForm({ ...form, plan_id: e.target.value, plan_item_id: '' })}
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white"
                >
                  <option value="">-- เลือกแผนประจำปีที่อนุมัติแล้ว --</option>
                  {approvedPlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      ปี {p.plan_year} • {p.department} ({p.title})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">รายการในแผนประจำปี</label>
                <select
                  required
                  value={form.plan_item_id}
                  onChange={(e) => {
                    const item = planItems.find((i) => i.id === e.target.value);
                    setForm({
                      ...form,
                      plan_item_id: e.target.value,
                      planned_month: item?.planned_months?.[0] || 1,
                      child_asset_id: ''
                    });
                  }}
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white"
                >
                  <option value="">-- เลือกรายการเครื่องมือในแผน --</option>
                  {planItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.asset_code} — {it.asset_name} {it.is_group ? '(กลุ่มแม่ — ต้องเลือกรหัสลูก)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {selectedPlanItem && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">รอบเดือนตามแผน</label>
                    <select
                      value={form.planned_month}
                      onChange={(e) => setForm({ ...form, planned_month: Number(e.target.value) })}
                      className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white"
                    >
                      {(selectedPlanItem.planned_months || [1]).map((m) => (
                        <option key={m} value={m}>เดือน {m}</option>
                      ))}
                    </select>
                  </div>

                  {isGroupPlanItem && (
                    <div>
                      <label className="block text-sm font-semibold text-purple-900 mb-1.5">
                        เลือกรหัสเครื่องมือลูกรายตัว <span className="text-rose-600">*</span>
                      </label>
                      <select
                        required
                        value={form.child_asset_id}
                        onChange={(e) => setForm({ ...form, child_asset_id: e.target.value })}
                        className="w-full h-10 px-3.5 rounded-xl border border-purple-300 text-sm font-medium bg-white"
                      >
                        <option value="">-- เลือกเครื่องมือลูก --</option>
                        {groupChildren.map((ch) => (
                          <option key={ch.id} value={ch.id}>{ch.asset_code} — {ch.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  เครื่องมือวัดรายตัว (ห้ามเลือกกลุ่มแม่) <span className="text-rose-600">*</span>
                </label>
                <select
                  required
                  aria-label="เลือกเครื่องมือรายตัว"
                  value={form.asset_id}
                  onChange={(e) => setForm({ ...form, asset_id: e.target.value })}
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white"
                >
                  <option value="">-- เลือกเครื่องมือรายตัว (ACTIVE) --</option>
                  {individualAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.asset_code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">หน่วยงานที่ทวนสอบ</label>
                  <select
                    value={form.provider_name}
                    onChange={(e) => setForm({ ...form, provider_name: e.target.value })}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white"
                  >
                    {providers.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">วันครบกำหนด (YYYY-MM-DD)</label>
                  <input
                    type="date"
                    required
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium"
                  />
                </div>
              </div>
            </>
          )}

          <div className="pt-2 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs"
            >
              {saving ? 'กำลังสร้าง...' : 'ยืนยันสร้างใบสั่งงาน'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const RecordResultModal = ({
  workOrder,
  onClose,
  form,
  setForm,
  error,
  saving,
  onSubmit,
  criteriaOptions = []
}) => {
  if (!workOrder) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            บันทึกผลทวนสอบและใบรับรอง ({workOrder.wo_code} — {workOrder.asset_code})
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                วันที่ทวนสอบจริง <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                required
                aria-label="วันที่ทวนสอบจริง"
                value={form.performed_at}
                onChange={(e) => setForm({ ...form, performed_at: e.target.value })}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                ผลการทวนสอบ <span className="text-rose-600">*</span>
              </label>
              <select
                aria-label="ผลการทวนสอบ"
                value={form.result_status}
                onChange={(e) => setForm({ ...form, result_status: e.target.value })}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white"
              >
                <option value="PASS">ผ่านเกณฑ์ (PASS)</option>
                <option value="FAIL">ไม่ผ่านเกณฑ์ (FAIL — ระงับใช้ ON_HOLD ทันที)</option>
                <option value="INCONCLUSIVE">รอตรวจสอบซ้ำ (INCONCLUSIVE)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              เลขที่ใบรับรอง / อ้างอิงหลักฐาน (Certificate No.) <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              aria-label="เลขที่ใบรับรอง"
              value={form.certificate_no}
              onChange={(e) => setForm({ ...form, certificate_no: e.target.value })}
              placeholder="เช่น CERT-2026-001 หรือเลขที่ใบบันทึกผล"
              className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-mono font-medium"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              เกณฑ์ยอมรับที่ใช้ตรวจเทียบ (Acceptance Criteria) <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              aria-label="เกณฑ์ยอมรับ"
              value={form.acceptance_criteria}
              onChange={(e) => setForm({ ...form, acceptance_criteria: e.target.value })}
              placeholder="เลือกจากรายการด้านล่าง หรือระบุเกณฑ์ยอมรับ"
              className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium"
            />
            {criteriaOptions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {criteriaOptions.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, acceptance_criteria: c })}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุผลการวัด</label>
            <input
              type="text"
              value={form.result_remarks}
              onChange={(e) => setForm({ ...form, result_remarks: e.target.value })}
              placeholder="บันทึกค่าความคลาดเคลื่อนหรือหมายเหตุ..."
              className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving || !form.certificate_no.trim() || !form.acceptance_criteria.trim()}
              className="h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs"
            >
              {saving ? 'กำลังส่ง...' : 'ส่งผลให้ผู้ตรวจรับพิจารณา'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const WorkOrderActionModal = ({
  modal,
  onClose,
  form,
  setForm,
  error,
  saving,
  onConfirm
}) => {
  if (!modal) return null;
  const { mode, workOrder } = modal; // RESCHEDULE | APPROVE | REJECT | RELEASE_HOLD
  const requiresText = mode === 'RESCHEDULE' || mode === 'REJECT' || mode === 'RELEASE_HOLD';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {mode === 'RESCHEDULE' && `เลื่อนวันครบกำหนด (${workOrder.wo_code})`}
            {mode === 'APPROVE' && `ตรวจรับผลและอนุมัติปิดใบงาน (${workOrder.wo_code})`}
            {mode === 'REJECT' && `ส่งกลับแก้ไขผลทวนสอบ (${workOrder.wo_code})`}
            {mode === 'RELEASE_HOLD' && `อนุมัติปลดระงับเครื่องมือ ON_HOLD (${workOrder.asset_code})`}
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

          {mode === 'RESCHEDULE' && (
            <div>
              <div className="text-xs sm:text-sm text-slate-600 font-medium mb-2">
                วันครบกำหนดเดิม (เก็บไว้ในประวัติ): <span className="font-mono font-bold text-slate-900">{workOrder.original_due_date}</span>
              </div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">วันครบกำหนดใหม่ <span className="text-rose-600">*</span></label>
              <input
                type="date"
                required
                aria-label="วันครบกำหนดใหม่"
                value={form.new_due_date}
                onChange={(e) => setForm({ ...form, new_due_date: e.target.value })}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              {mode === 'RESCHEDULE' && 'เหตุผลในการขอเลื่อนวันครบกำหนด'}
              {mode === 'APPROVE' && 'ความเห็นผู้ตรวจรับผล (ถ้ามี)'}
              {mode === 'REJECT' && 'เหตุผลในการส่งกลับแก้ไขผล'}
              {mode === 'RELEASE_HOLD' && 'ผลการประเมินผลกระทบและการแก้ไข (NC Impact Assessment)'}
              {requiresText && <span className="text-rose-600"> *</span>}
            </label>
            <textarea
              rows={3}
              required={requiresText}
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              placeholder="ระบุรายละเอียด..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving || (requiresText && !form.text.trim())}
              className="h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs"
            >
              {saving ? 'กำลังบันทึก...' : 'ยืนยันการดำเนินการ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const WorkOrderSettingsModal = ({
  open,
  onClose,
  draftSettings,
  setDraftSettings,
  newCriteria,
  setNewCriteria,
  saving,
  onSave
}) => {
  if (!open) return null;

  const addCriteria = () => {
    const trimmed = newCriteria.trim();
    if (!trimmed || draftSettings.default_acceptance_criteria.includes(trimmed)) return;
    setDraftSettings({
      ...draftSettings,
      default_acceptance_criteria: [...draftSettings.default_acceptance_criteria, trimmed]
    });
    setNewCriteria('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">ตั้งค่าเกณฑ์ยอมรับและระยะเวลาเก็บเอกสาร (DCC)</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">ระยะเวลาเก็บประวัติใบรับรอง (ปี)</label>
            <input
              type="number"
              min={1}
              max={50}
              value={draftSettings.retention_years}
              onChange={(e) => setDraftSettings({ ...draftSettings, retention_years: Number(e.target.value) })}
              className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">ตัวเลือกเกณฑ์ยอมรับมาตรฐาน (Acceptance Criteria)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCriteria}
                onChange={(e) => setNewCriteria(e.target.value)}
                placeholder="เพิ่มเกณฑ์ยอมรับใหม่..."
                className="flex-1 h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium"
              />
              <button type="button" onClick={addCriteria} className="h-10 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors cursor-pointer">
                เพิ่ม
              </button>
            </div>
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-200 max-h-40 overflow-y-auto">
              {(draftSettings.default_acceptance_criteria || []).map((c) => (
                <div key={c} className="px-3.5 py-2.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-800">{c}</span>
                  {draftSettings.default_acceptance_criteria.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDraftSettings({
                          ...draftSettings,
                          default_acceptance_criteria: draftSettings.default_acceptance_criteria.filter((x) => x !== c)
                        })
                      }
                      className="text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 cursor-pointer"
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

