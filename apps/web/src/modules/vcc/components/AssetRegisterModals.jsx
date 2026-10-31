import React from 'react';
import {
  AlertTriangle,
  X,
  Trash2
} from 'lucide-react';

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
  parent_id: 'กลุ่มเครื่องมือเดิม',
  group_nature: 'ลักษณะหน่วยสอบเทียบ',
  composite_details: 'รายละเอียดอุปกรณ์ในชุด'
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
  activeDepartments
}) => {
  if (!formOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {editingAsset ? `แก้ไขข้อมูลเครื่องมือ (${editingAsset.asset_code})` : 'เพิ่มเครื่องมือวัดใหม่'}
          </h2>
          <button
            type="button"
            onClick={() => setFormOpen(false)}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSaveAsset} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {formError && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center gap-2">
              <AlertTriangle size={17} className="text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <label className="block text-sm font-bold text-slate-800">ลักษณะเครื่องมือ (Calibratable Unit)</label>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="unit_type"
                  checked={form.group_nature !== 'COMPOSITE_SET'}
                  onChange={() => setForm({ ...form, is_group: false, group_nature: 'LOGICAL_GROUP' })}
                />
                <span>เครื่องมือเดี่ยว (Single Instrument)</span>
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="unit_type"
                  checked={form.group_nature === 'COMPOSITE_SET'}
                  onChange={() => setForm({ ...form, is_group: false, group_nature: 'COMPOSITE_SET' })}
                />
                <span>ชุดเครื่องมือจริง (Composite Set — สอบเทียบรวม 1 หน่วยทั้งชุด)</span>
              </label>
            </div>

            {form.group_nature === 'COMPOSITE_SET' && (
              <div className="pt-1">
                <label className="block text-xs font-semibold text-teal-900 mb-1">
                  รายละเอียดอุปกรณ์ในชุด (Composite Components){' '}
                  <span className="text-slate-500 font-normal">(ระบุรายการลูกตุ้มหรือชิ้นส่วนที่สอบเทียบร่วมกัน)</span>
                </label>
                <textarea
                  rows={2}
                  value={form.composite_details || ''}
                  onChange={(e) => setForm({ ...form, composite_details: e.target.value })}
                  placeholder="เช่น ลูกตุ้ม 1g, 2g, 5g, 10g, 20g, 50g, 100g, 200g, 500g, 1kg, 2kg, 5kg พร้อมกล่อง"
                  className="w-full px-3.5 py-2 rounded-xl border border-teal-300 bg-white text-sm font-medium focus:outline-none focus:border-teal-600"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                รหัสเครื่องมือ (Asset Code) <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                value={form.asset_code}
                onChange={(e) => setForm({ ...form, asset_code: e.target.value.toUpperCase() })}
                placeholder="เช่น ST002, SW001, TC001, V001"
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-mono uppercase focus:outline-none focus:border-indigo-600"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                ประเภทเครื่องมือ <span className="text-rose-600">*</span>
              </label>
              <select
                required
                value={form.asset_type}
                onChange={(e) => setForm({ ...form, asset_type: e.target.value })}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white focus:outline-none focus:border-indigo-600"
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
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              ชื่อเครื่องมือ <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ระบุชื่อเครื่องมือวัด หรือชื่อชุดเครื่องมือมาตรฐาน"
              className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                แผนกเจ้าของ (Master Data) <span className="text-rose-600">*</span>
              </label>
              <select
                required
                disabled={activeDepartments.length === 0}
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white focus:outline-none focus:border-indigo-600 disabled:bg-slate-100 disabled:text-slate-500"
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

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">สถานที่ตั้ง / จุดใช้งาน</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="เช่น ห้องปฏิบัติการ QC, ห้องเย็น F1, จุดรับวัตถุดิบ WH"
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                หมายเลขเครื่อง (Serial No.) <span className="text-slate-400 font-normal">(ว่างได้)</span>
              </label>
              <input
                type="text"
                value={form.serial_no}
                onChange={(e) => setForm({ ...form, serial_no: e.target.value })}
                placeholder="เช่น 40717388"
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:border-indigo-600"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                รุ่น (Model) <span className="text-slate-400 font-normal">(ว่างได้)</span>
              </label>
              <input
                type="text"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="เช่น Testo 176T4, Dixell XR120C"
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="h-10 px-4 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={savingForm || activeDepartments.length === 0}
              className="h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs"
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
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {statusModal.mode === 'RETIRE'
              ? `ปลดออกเครื่องมือ (${statusModal.asset.asset_code})`
              : `นำเครื่องมือกลับมาใช้งาน (${statusModal.asset.asset_code})`}
          </h2>
          <button
            type="button"
            onClick={() => setStatusModal(null)}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleConfirmStatusChange} className="p-6 space-y-4">
          {statusError && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center gap-2">
              <AlertTriangle size={17} className="text-rose-600 shrink-0" />
              <span>{statusError}</span>
            </div>
          )}

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm">
            <div className="font-bold text-slate-900 text-base">
              {statusModal.asset.asset_code} — {statusModal.asset.name}
            </div>
            <div className="text-xs text-slate-500 font-medium mt-1">
              แผนก: {statusModal.asset.department} • ประเภท: {statusModal.asset.asset_type}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
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
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setStatusModal(null)}
              className="h-10 px-4 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={savingStatus || !statusReason.trim()}
              className={`h-10 px-5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-colors cursor-pointer shadow-2xs ${
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
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            รายละเอียดและประวัติการแก้ไข (Audit Log)
          </h2>
          <button
            type="button"
            onClick={() => setDetailModalOpen(false)}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 max-h-[80vh] overflow-y-auto space-y-5">
          {loadingDetail || !detailData ? (
            <div className="py-10 text-center text-sm text-slate-500 font-medium">
              กำลังโหลดประวัติการแก้ไข...
            </div>
          ) : (
            <>
              <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-bold text-lg text-slate-900">
                    {detailData.asset.asset_code} — {detailData.asset.name}
                  </span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold border ${
                      detailData.asset.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    {detailData.asset.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs sm:text-sm text-slate-600 pt-1.5">
                  <div><span className="font-semibold text-slate-900">ประเภท:</span> {detailData.asset.asset_type}</div>
                  <div><span className="font-semibold text-slate-900">แผนก:</span> {detailData.asset.department}</div>
                  <div><span className="font-semibold text-slate-900">Serial No.:</span> {detailData.asset.serial_no || '-'}</div>
                  <div><span className="font-semibold text-slate-900">รุ่น:</span> {detailData.asset.model || '-'}</div>
                  <div><span className="font-semibold text-slate-900">ที่ตั้ง:</span> {detailData.asset.location || '-'}</div>
                  <div>
                    <span className="font-semibold text-slate-900">ลักษณะหน่วย:</span>{' '}
                    {detailData.asset.group_nature === 'COMPOSITE_SET' ? (
                      <span className="text-teal-700 font-bold">ชุดเครื่องมือ (Composite Set)</span>
                    ) : (
                      <span>เครื่องมือเดี่ยว</span>
                    )}
                  </div>
                  {detailData.asset.group_nature === 'COMPOSITE_SET' && (
                    <div className="col-span-2 sm:col-span-3 text-teal-800 bg-teal-50 border border-teal-200 px-3 py-2 rounded-lg text-xs space-y-1">
                      <div className="font-bold">ลักษณะ: ชุดเครื่องมือสอบเทียบร่วมกัน 1 หน่วย (Physical Composite Set)</div>
                      {detailData.asset.composite_details && (
                        <div>
                          <span className="font-semibold">อุปกรณ์ในชุด:</span> {detailData.asset.composite_details}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

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
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">ตั้งค่ารายการประเภทเครื่องมือ</h2>
          <button
            type="button"
            onClick={() => setTypesModalOpen(false)}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed font-medium">
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
              className="flex-1 h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600"
            />
            <button
              type="button"
              onClick={handleAddDraftType}
              className="h-10 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              เพิ่มรายการ
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-200">
            {draftTypes.map((t) => (
              <div key={t} className="px-3.5 py-2.5 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-900">{t}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveDraftType(t)}
                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                  title={`ลบ ${t}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setTypesModalOpen(false)}
              className="h-10 px-4 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={savingTypes}
              onClick={handleSaveTypes}
              className="h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs"
            >
              {savingTypes ? 'กำลังบันทึก...' : 'บันทึกรายการตั้งค่า'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
