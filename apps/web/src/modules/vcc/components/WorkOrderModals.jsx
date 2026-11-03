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
  const isGroupPlanItem =
    Number(selectedPlanItem?.is_group) === 1 && selectedPlanItem?.group_nature !== 'COMPOSITE_SET';
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
              <span>สร้างจากแผนประจำปีที่อนุมัติแล้ว</span>
            </label>
          </div>

          {form.mode === 'PLAN' ? (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">แผนประจำปีที่อนุมัติแล้ว</label>
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
                  {planItems.map((it) => {
                    const isLegacyGroup = Number(it.is_group) === 1 && it.group_nature !== 'COMPOSITE_SET';
                    return (
                      <option key={it.id} value={it.id}>
                        {it.asset_code} — {it.asset_name} {isLegacyGroup ? '(กลุ่มเดิมในประวัติ — ต้องเลือกรหัสเครื่องมือจริง)' : it.group_nature === 'COMPOSITE_SET' ? '(ชุดเครื่องมือ)' : ''}
                      </option>
                    );
                  })}
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
                  เครื่องมือวัด / ชุดเครื่องมือที่ใช้งานปกติ <span className="text-rose-600">*</span>
                </label>
                <select
                  required
                  aria-label="เลือกเครื่องมือรายตัว"
                  value={form.asset_id}
                  onChange={(e) => setForm({ ...form, asset_id: e.target.value })}
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white"
                >
                  <option value="">-- เลือกเครื่องมือหรือชุดเครื่องมือที่ใช้งานปกติ --</option>
                  {individualAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.asset_code} — {a.name} {a.group_nature === 'COMPOSITE_SET' ? '(ชุดเครื่องมือ)' : ''}
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

export { RecordResultModal } from './RecordResultModal';
export { AmendmentModal } from './AmendmentModal';
export { DigitalRecordModal } from './DigitalRecordModal';

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
  const { mode, workOrder } = modal; // RESCHEDULE | APPROVE | REJECT | RELEASE_HOLD | CANCEL
  const requiresText = mode !== 'APPROVE';
  const missingReason = mode === 'RELEASE_HOLD' && !form.reason?.trim();

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {mode === 'RESCHEDULE' && `เลื่อนวันครบกำหนด (${workOrder.wo_code})`}
            {mode === 'APPROVE' && `ตรวจรับผลและอนุมัติปิดใบงาน (${workOrder.wo_code})`}
            {mode === 'REJECT' && `ส่งกลับแก้ไขผลทวนสอบ (${workOrder.wo_code})`}
            {mode === 'RELEASE_HOLD' && `อนุมัติปลดระงับเครื่องมือ (${workOrder.asset_code})`}
            {mode === 'CANCEL' && `ยกเลิกใบสั่งงาน (${workOrder.wo_code})`}
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

          {mode === 'CANCEL' && (
            <div>
              <p className="text-xs sm:text-sm text-slate-600 mb-3">
                ยกเลิกเฉพาะใบสั่งงานนี้ รอบในแผนประจำปียังอยู่ และออกใบสั่งงานใหม่ได้ หากต้องตัดรอบออกจากแผนให้ทำผ่านการปรับปรุงแผน
              </p>
              <label htmlFor="wo-cancel-category" className="block text-sm font-semibold text-slate-700 mb-1.5">ประเภทการยกเลิก <span className="text-rose-600">*</span></label>
              <select
                id="wo-cancel-category"
                value={form.category || 'MISTAKE_CREATION'}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white"
              >
                <option value="MISTAKE_CREATION">ออกใบสั่งงานผิดพลาด</option>
                <option value="AUTHORIZED_CANCEL">ยกเลิกตามการอนุมัติของหัวหน้า</option>
              </select>
            </div>
          )}

          {mode === 'RELEASE_HOLD' && (
            <div>
              <label htmlFor="wo-release-reason" className="block text-sm font-semibold text-slate-700 mb-1.5">
                เหตุผลการปลดระงับและการแก้ไขที่ทำแล้ว <span className="text-rose-600">*</span>
              </label>
              <textarea
                id="wo-release-reason"
                rows={2}
                required
                value={form.reason || ''}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="เช่น ซ่อมและสอบเทียบซ้ำผ่าน ใบรับรองเลขที่..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium"
              />
            </div>
          )}

          <div>
            <label htmlFor="wo-action-text" className="block text-sm font-semibold text-slate-700 mb-1.5">
              {mode === 'RESCHEDULE' && 'เหตุผลในการขอเลื่อนวันครบกำหนด'}
              {mode === 'APPROVE' && 'ความเห็นผู้ตรวจรับผล (ถ้ามี)'}
              {mode === 'REJECT' && (workOrder.result_status === 'INCONCLUSIVE' ? 'สิ่งที่ต้องตรวจซ้ำ' : 'เหตุผลในการส่งกลับแก้ไขผล')}
              {mode === 'RELEASE_HOLD' && 'ผลการประเมินผลกระทบและการแก้ไข (NC Impact Assessment)'}
              {mode === 'CANCEL' && 'เหตุผลในการยกเลิก'}
              {requiresText && <span className="text-rose-600"> *</span>}
            </label>
            <textarea
              id="wo-action-text"
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
              ปิด
            </button>
            <button
              type="submit"
              disabled={saving || (requiresText && !form.text.trim()) || missingReason}
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

