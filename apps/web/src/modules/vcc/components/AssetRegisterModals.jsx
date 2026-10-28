import React from 'react';
import { AlertTriangle, X, Trash2 } from 'lucide-react';

const ACTION_LABELS = {
  VCC_ASSET_CREATED: { label: 'เพิ่มเครื่องมือใหม่', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  VCC_ASSET_UPDATED: { label: 'แก้ไขข้อมูลเครื่องมือ', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  VCC_ASSET_RETIRED: { label: 'ปลดออกเครื่องมือ (Retire)', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
  VCC_ASSET_REACTIVATED: { label: 'นำกลับมาใช้งาน (Reactivate)', badge: 'bg-amber-50 text-amber-700 border-amber-200' }
};

const FIELD_LABELS = {
  asset_code: 'รหัสเครื่องมือ',
  name: 'ชื่อเครื่องมือ',
  asset_type: 'ประเภท',
  serial_no: 'Serial No.',
  model: 'รุ่น (Model)',
  location: 'ที่ตั้ง',
  department: 'แผนก',
  is_group: 'รูปแบบกลุ่ม',
  parent_id: 'กลุ่มเครื่องมือแม่'
};

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

export const AssetFormModal = ({
  formOpen,
  setFormOpen,
  editingAsset,
  form,
  setForm,
  formError,
  savingForm,
  handleSaveAsset,
  formTypeOptions,
  assetTypes,
  activeDepartments,
  activeGroups
}) => {
  if (!formOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            {editingAsset ? `แก้ไขข้อมูลเครื่องมือ (${editingAsset.asset_code})` : 'เพิ่มเครื่องมือ / กลุ่มเครื่องมือใหม่'}
          </h2>
          <button
            type="button"
            onClick={() => setFormOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSaveAsset} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {formError && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <label className="block text-xs font-bold text-slate-700">รูปแบบรายการ</label>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="is_group"
                  checked={!form.is_group}
                  disabled={Boolean(editingAsset && editingAsset.child_count > 0)}
                  onChange={() => setForm({ ...form, is_group: false })}
                />
                <span>เครื่องมือรายตัว (ใช้สร้างใบงานจริงในรอบถัดไป)</span>
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="is_group"
                  checked={Boolean(form.is_group)}
                  onChange={() => setForm({ ...form, is_group: true, parent_id: '' })}
                />
                <span>กลุ่มเครื่องมือแม่ (สำหรับรวมเครื่องมือลูก 1 ระดับ)</span>
              </label>
            </div>
            {editingAsset && editingAsset.child_count > 0 && (
              <p className="text-xs text-amber-700 font-medium">
                * กลุ่มนี้มีเครื่องมือลูกผูกอยู่ ({editingAsset.child_count} รายการ) จึงไม่สามารถเปลี่ยนเป็นเครื่องมือรายตัวได้
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                รหัสเครื่องมือ (Asset Code) <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                value={form.asset_code}
                onChange={(e) => setForm({ ...form, asset_code: e.target.value.toUpperCase() })}
                placeholder={form.is_group ? 'เช่น GRP-SCALE' : 'เช่น ST002, SW001, TC001'}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono uppercase focus:outline-none focus:border-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                ประเภทเครื่องมือ <span className="text-rose-600">*</span>
              </label>
              <select
                required
                value={form.asset_type}
                onChange={(e) => setForm({ ...form, asset_type: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-indigo-600"
              >
                <option value="" disabled>
                  -- เลือกประเภทเครื่องมือ --
                </option>
                {formTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t} {!assetTypes.includes(t) ? '(ประเภทเดิม)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ชื่อเครื่องมือ <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ระบุชื่อเครื่องมือวัด หรือชื่อกลุ่มเครื่องมือ"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                แผนกเจ้าของ (Master Data) <span className="text-rose-600">*</span>
              </label>
              <select
                required
                disabled={activeDepartments.length === 0}
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-indigo-600 disabled:bg-slate-100 disabled:text-slate-500"
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

            {!form.is_group && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  กลุ่มเครื่องมือแม่ (ถ้าเป็นเครื่องมือลูก)
                </label>
                <select
                  value={form.parent_id}
                  onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-indigo-600"
                >
                  <option value="">-- ไม่อยู่ในกลุ่ม (เครื่องมือเดี่ยว) --</option>
                  {activeGroups
                    .filter((g) => g.id !== editingAsset?.id)
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.asset_code} — {g.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                หมายเลขเครื่อง (Serial No.) <span className="text-slate-400 font-normal">(ว่างได้)</span>
              </label>
              <input
                type="text"
                value={form.serial_no}
                onChange={(e) => setForm({ ...form, serial_no: e.target.value })}
                placeholder="เช่น 40717388"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:border-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                รุ่น (Model) <span className="text-slate-400 font-normal">(ว่างได้)</span>
              </label>
              <input
                type="text"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="เช่น Testo 176T4, Dixell XR120C"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">สถานที่ตั้ง / จุดใช้งาน</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="เช่น ห้องปฏิบัติการ QC, ห้องเย็น F1, จุดรับวัตถุดิบ WH"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-600"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={savingForm || activeDepartments.length === 0}
              className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              {savingForm ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const AssetStatusModal = ({
  statusModal,
  setStatusModal,
  statusReason,
  setStatusReason,
  statusError,
  savingStatus,
  handleConfirmStatusChange
}) => {
  if (!statusModal) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            {statusModal.mode === 'RETIRE'
              ? `ปลดออกเครื่องมือ (${statusModal.asset.asset_code})`
              : `นำเครื่องมือกลับมาใช้งาน (${statusModal.asset.asset_code})`}
          </h2>
          <button
            type="button"
            onClick={() => setStatusModal(null)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleConfirmStatusChange} className="p-6 space-y-4">
          {statusError && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
              <span>{statusError}</span>
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-sm">
            <div className="font-bold text-slate-900">
              {statusModal.asset.asset_code} — {statusModal.asset.name}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              แผนก: {statusModal.asset.department} • ประเภท: {statusModal.asset.asset_type}
            </div>
          </div>

          {statusModal.mode === 'RETIRE' && statusModal.asset.active_child_count > 0 && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
              ไม่สามารถปลดออกกลุ่มแม่นี้ได้ เนื่องจากยังมีเครื่องมือลูกที่ใช้งานอยู่ (ACTIVE) จำนวน{' '}
              <span className="font-bold">{statusModal.asset.active_child_count} รายการ</span> กรุณาย้ายหรือปลดออกเครื่องมือลูกก่อน
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {statusModal.mode === 'RETIRE' ? 'เหตุผลในการปลดออก' : 'เหตุผลในการนำกลับมาใช้งาน'}{' '}
              <span className="text-rose-600">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder={
                statusModal.mode === 'RETIRE'
                  ? 'ระบุสาเหตุ เช่น ชำรุดไม่สามารถซ่อมได้ / ยกเลิกจุดใช้งาน...'
                  : 'ระบุสาเหตุ เช่น ซ่อมบำรุงและทวนสอบผ่านแล้ว...'
              }
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-600"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setStatusModal(null)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={
                savingStatus ||
                !statusReason.trim() ||
                (statusModal.mode === 'RETIRE' && statusModal.asset.active_child_count > 0)
              }
              className={`px-5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50 cursor-pointer ${
                statusModal.mode === 'RETIRE'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {savingStatus
                ? 'กำลังบันทึก...'
                : statusModal.mode === 'RETIRE'
                  ? 'ยืนยันการปลดออก'
                  : 'ยืนยันการนำกลับมาใช้'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const AssetDetailHistoryModal = ({
  detailModalOpen,
  setDetailModalOpen,
  loadingDetail,
  detailData
}) => {
  if (!detailModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            รายละเอียดและประวัติการแก้ไข (Audit Log)
          </h2>
          <button
            type="button"
            onClick={() => setDetailModalOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 max-h-[80vh] overflow-y-auto space-y-5">
          {loadingDetail || !detailData ? (
            <div className="py-10 text-center text-sm text-slate-500">
              กำลังโหลดประวัติการแก้ไข...
            </div>
          ) : (
            <>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-bold text-base text-slate-900">
                    {detailData.asset.asset_code} — {detailData.asset.name}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      detailData.asset.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    {detailData.asset.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-slate-600 pt-1">
                  <div><span className="font-semibold text-slate-800">ประเภท:</span> {detailData.asset.asset_type}</div>
                  <div><span className="font-semibold text-slate-800">แผนก:</span> {detailData.asset.department}</div>
                  <div><span className="font-semibold text-slate-800">Serial No.:</span> {detailData.asset.serial_no || '-'}</div>
                  <div><span className="font-semibold text-slate-800">รุ่น:</span> {detailData.asset.model || '-'}</div>
                  <div><span className="font-semibold text-slate-800">ที่ตั้ง:</span> {detailData.asset.location || '-'}</div>
                  <div>
                    <span className="font-semibold text-slate-800">กลุ่มแม่:</span>{' '}
                    {detailData.asset.parent_asset_code || (detailData.asset.is_group ? 'เป็นกลุ่มแม่' : '-')}
                  </div>
                </div>
              </div>

              {Boolean(detailData.asset.is_group) && (() => {
                const activeChildren = (detailData.children || []).filter((ch) => ch.status === 'ACTIVE');
                const retiredChildren = (detailData.children || []).filter((ch) => ch.status === 'RETIRED');
                return (
                  <div className="space-y-4">
                    <div className="space-y-2" data-testid="group-children-active">
                      <h3 className="text-xs font-bold uppercase text-emerald-700 tracking-wider">
                        เครื่องมือลูกที่ใช้งานอยู่ ({activeChildren.length} รายการ)
                      </h3>
                      {activeChildren.length > 0 ? (
                        <div className="border border-emerald-200 rounded-xl divide-y divide-emerald-100 bg-emerald-50/30 text-xs">
                          {activeChildren.map((ch) => (
                            <div key={ch.id} className="px-3.5 py-2.5 flex items-center justify-between">
                              <div>
                                <span className="font-mono font-bold text-slate-900">{ch.asset_code}</span>{' '}
                                <span className="text-slate-700">— {ch.name}</span>
                              </div>
                              <span className="px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800">
                                ใช้งานอยู่ (ACTIVE)
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 italic">ไม่มีเครื่องมือลูกที่ใช้งานอยู่</div>
                      )}
                    </div>

                    <div className="space-y-2" data-testid="group-children-retired">
                      <h3 className="text-xs font-bold uppercase text-rose-700 tracking-wider">
                        เครื่องมือลูกที่ปลดออกแล้ว ({retiredChildren.length} รายการ)
                      </h3>
                      {retiredChildren.length > 0 ? (
                        <div className="border border-rose-200 rounded-xl divide-y divide-rose-100 bg-rose-50/30 text-xs">
                          {retiredChildren.map((ch) => (
                            <div key={ch.id} className="px-3.5 py-2.5 flex items-center justify-between">
                              <div>
                                <span className="font-mono font-bold text-slate-900">{ch.asset_code}</span>{' '}
                                <span className="text-slate-700">— {ch.name}</span>
                              </div>
                              <span className="px-2 py-0.5 rounded-full font-bold bg-rose-100 text-rose-800">
                                ปลดออกแล้ว (RETIRED)
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 italic">ไม่มีเครื่องมือลูกที่ปลดออกแล้ว</div>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                  ประวัติการแก้ไข (Audit Log: VCC_ASSET_*)
                </h3>
                {detailData.history?.length === 0 ? (
                  <div className="text-xs text-slate-500">ไม่พบประวัติการแก้ไข</div>
                ) : (
                  <div className="space-y-3">
                    {detailData.history.map((h) => {
                      const meta = ACTION_LABELS[h.action] || {
                        label: h.action,
                        badge: 'bg-slate-100 text-slate-700 border-slate-200'
                      };
                      const details = h.details || {};
                      const changedKeys =
                        h.action === 'VCC_ASSET_UPDATED' && details.before && details.after
                          ? Object.keys(details.after).filter(
                              (k) => String(details.before[k] ?? '') !== String(details.after[k] ?? '')
                            )
                          : [];
                      return (
                        <div key={h.id} className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className={`px-2.5 py-0.5 rounded-md border font-bold ${meta.badge}`}>
                              {meta.label} ({h.action})
                            </span>
                            <span className="text-slate-500 font-medium">
                              {formatThaiDateTime(h.at)} • โดย {h.actor_name || h.actor_id || 'DCC'}
                            </span>
                          </div>

                          {details.reason && (
                            <div className="text-slate-800 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                              <span className="font-bold">เหตุผล:</span> {details.reason}
                            </div>
                          )}

                          {changedKeys.length > 0 && (
                            <div className="space-y-1 pt-1">
                              {changedKeys.map((k) => (
                                <div key={k} className="text-slate-700">
                                  <span className="font-semibold">{FIELD_LABELS[k] || k}:</span>{' '}
                                  <span className="line-through text-rose-600">{String(details.before[k] || '-')}</span>{' '}
                                  → <span className="font-semibold text-emerald-700">{String(details.after[k] || '-')}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const AssetTypesModal = ({
  typesModalOpen,
  setTypesModalOpen,
  newTypeName,
  setNewTypeName,
  handleAddDraftType,
  draftTypes,
  handleRemoveDraftType,
  savingTypes,
  handleSaveTypes
}) => {
  if (!typesModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">ตั้งค่ารายการประเภทเครื่องมือ</h2>
          <button
            type="button"
            onClick={() => setTypesModalOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            เพิ่มหรือลบตัวเลือกประเภทเครื่องมือสำหรับใช้ในหน้าทะเบียนเครื่องมือ การลบประเภทออกจากรายการนี้จะไม่ทำให้เครื่องมือเดิมที่ใช้ประเภทนั้นอยู่เสียหาย
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddDraftType();
                }
              }}
              placeholder="พิมพ์ชื่อประเภทเครื่องมือใหม่..."
              className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-600"
            />
            <button
              type="button"
              onClick={handleAddDraftType}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 cursor-pointer"
            >
              เพิ่มรายการ
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-200">
            {draftTypes.map((t) => (
              <div key={t} className="px-3.5 py-2.5 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-800">{t}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveDraftType(t)}
                  className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                  title={`ลบ ${t}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setTypesModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={savingTypes}
              onClick={handleSaveTypes}
              className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
            >
              {savingTypes ? 'กำลังบันทึก...' : 'บันทึกรายการตั้งค่า'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
