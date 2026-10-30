import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertTriangle,
  X,
  Trash2,
  FolderTree,
  Plus,
  Search,
  Building2,
  Wrench,
  Users,
  CheckCircle2,
  Layers,
  Settings2,
  Edit3,
  Archive,
  Info,
  History
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  fetchVccAssets,
  fetchVccAssetDetail,
  createVccAsset,
  updateVccAsset,
  retireVccAsset
} from '../api/vccApi';

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

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <label className="block text-sm font-bold text-slate-800">ลักษณะเครื่องมือ (Calibratable Unit)</label>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="unit_type"
                  checked={!form.is_group && form.group_nature !== 'COMPOSITE_SET'}
                  disabled={Boolean(editingAsset && editingAsset.is_group)}
                  onChange={() => setForm({ ...form, is_group: false, group_nature: 'LOGICAL_GROUP' })}
                />
                <span>เครื่องมือเดี่ยว (Single Instrument)</span>
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                <input
                  type="radio"
                  name="unit_type"
                  checked={form.group_nature === 'COMPOSITE_SET'}
                  disabled={Boolean(editingAsset && editingAsset.is_group)}
                  onChange={() => setForm({ ...form, is_group: false, group_nature: 'COMPOSITE_SET' })}
                />
                <span>ชุดเครื่องมือจริง (Composite Set — สอบเทียบรวม 1 หน่วยทั้งชุด)</span>
              </label>
              {Boolean(editingAsset && editingAsset.is_group) && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 bg-purple-100 px-2.5 py-1 rounded-md">
                  กลุ่มจัดหมวดหมู่เสมือน (Logical Group)
                </span>
              )}
            </div>
            {editingAsset && editingAsset.is_group === 1 && (
              <p className="text-xs text-purple-800 font-medium">
                * รายการนี้เป็นกลุ่มเครื่องมือเดิมในประวัติ (มีเครื่องมือลูก {editingAsset.child_count || 0} รายการ)
              </p>
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
                placeholder={form.is_group ? 'เช่น GRP-SCALE' : 'เช่น ST002, SW001, TC001'}
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
              placeholder="ระบุชื่อเครื่องมือวัด หรือชื่อกลุ่มเครื่องมือ"
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

            {!form.is_group && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  กลุ่มเครื่องมือที่สังกัด <span className="text-slate-400 font-normal">(ถ้ามี)</span>
                </label>
                <select
                  value={form.parent_id || ''}
                  onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white focus:outline-none focus:border-indigo-600"
                >
                  <option value="">-- ไม่สังกัดกลุ่ม (เครื่องมืออิสระ) --</option>
                  {activeGroups
                    .filter((g) => !form.department || g.department === form.department)
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

          {statusModal.mode === 'RETIRE' && statusModal.asset.active_child_count > 0 && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm font-medium">
              ไม่สามารถปลดออกกลุ่มแม่นี้ได้ เนื่องจากยังมีเครื่องมือลูกที่ใช้งานอยู่ (ACTIVE) จำนวน{' '}
              <span className="font-bold">{statusModal.asset.active_child_count} รายการ</span> กรุณาย้ายหรือปลดออกเครื่องมือลูกก่อน
            </div>
          )}

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
              disabled={
                savingStatus ||
                !statusReason.trim() ||
                (statusModal.mode === 'RETIRE' && statusModal.asset.active_child_count > 0)
              }
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
                    <span className="font-semibold text-slate-900">กลุ่มเครื่องมือที่สังกัด:</span>{' '}
                    {detailData.asset.parent_asset_code ? (
                      <span className="font-mono text-indigo-700 font-bold">{detailData.asset.parent_asset_code}</span>
                    ) : detailData.asset.is_group ? (
                      <span className="text-purple-700 font-bold">กลุ่มแม่ (Logical Group)</span>
                    ) : (
                      '-'
                    )}
                  </div>
                  {detailData.asset.group_nature === 'COMPOSITE_SET' && (
                    <div className="col-span-2 sm:col-span-3 text-teal-800 bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-lg text-xs font-semibold">
                      ลักษณะ: ชุดเครื่องมือสอบเทียบร่วมกัน 1 หน่วย (Physical Composite Set)
                    </div>
                  )}
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

export const LogicalGroupAdminModal = ({
  isOpen,
  onClose,
  activeDepartments = [],
  assetTypes = [],
  onReload,
  onOpenHistory
}) => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroup, setNewGroup] = useState({
    asset_code: '',
    name: '',
    department: '',
    asset_type: ''
  });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');

  // Selected group for child management
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [selectedGroupDetail, setSelectedGroupDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [availableAssets, setAvailableAssets] = useState([]);
  const [candidateChildId, setCandidateChildId] = useState('');
  const [updatingChild, setUpdatingChild] = useState(false);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchVccAssets({ status: 'ACTIVE', logical_groups_only: true });
      setGroups(list);
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถโหลดรายการกลุ่มเครื่องมือได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadGroups();
      setShowCreateForm(false);
      setSelectedGroupId(null);
      setSelectedGroupDetail(null);
      setNewGroup({
        asset_code: '',
        name: '',
        department: activeDepartments[0]?.code || '',
        asset_type: assetTypes[0] || ''
      });
    }
  }, [isOpen, loadGroups, activeDepartments, assetTypes]);

  const loadGroupDetail = useCallback(async (groupId) => {
    if (!groupId) return;
    setLoadingDetail(true);
    try {
      const detail = await fetchVccAssetDetail(groupId);
      setSelectedGroupDetail(detail);

      // Load unassigned calibratable assets in the same department
      const unassigned = await fetchVccAssets({
        status: 'ACTIVE',
        calibratable_only: true,
        department: detail.asset?.department || ''
      });
      setAvailableAssets(unassigned.filter((a) => !a.parent_id && a.id !== groupId));
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถดึงข้อมูลเครื่องมือลูกในกลุ่มได้');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const handleToggleSelectGroup = (group) => {
    if (selectedGroupId === group.id) {
      setSelectedGroupId(null);
      setSelectedGroupDetail(null);
    } else {
      setSelectedGroupId(group.id);
      loadGroupDetail(group.id);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setCreating(true);
    setFormError('');
    try {
      await createVccAsset({
        asset_code: newGroup.asset_code,
        name: newGroup.name,
        department: newGroup.department,
        asset_type: newGroup.asset_type,
        is_group: true,
        group_nature: 'LOGICAL_GROUP'
      });
      toast.success(`สร้างกลุ่มเครื่องมือ ${newGroup.asset_code.toUpperCase()} แล้ว`);
      setShowCreateForm(false);
      setNewGroup({
        asset_code: '',
        name: '',
        department: activeDepartments[0]?.code || '',
        asset_type: assetTypes[0] || ''
      });
      await loadGroups();
      if (onReload) onReload();
    } catch (err) {
      const msg = err.message || 'ไม่สามารถสร้างกลุ่มเครื่องมือได้';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleAttachChild = async () => {
    if (!candidateChildId || !selectedGroupId) return;
    setUpdatingChild(true);
    try {
      await updateVccAsset(candidateChildId, { parent_id: selectedGroupId });
      toast.success('เพิ่มเครื่องมือเข้ากลุ่มเรียบร้อยแล้ว');
      setCandidateChildId('');
      await loadGroupDetail(selectedGroupId);
      await loadGroups();
      if (onReload) onReload();
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถเพิ่มเครื่องมือเข้ากลุ่มได้');
    } finally {
      setUpdatingChild(false);
    }
  };

  const handleDetachChild = async (childId, childCode) => {
    setUpdatingChild(true);
    try {
      await updateVccAsset(childId, { parent_id: null });
      toast.success(`ปลด ${childCode} ออกจากกลุ่มแล้ว`);
      await loadGroupDetail(selectedGroupId);
      await loadGroups();
      if (onReload) onReload();
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถปลดเครื่องมือออกจากกลุ่มได้');
    } finally {
      setUpdatingChild(false);
    }
  };

  const handleRetireGroup = async (group) => {
    if (group.active_child_count > 0) {
      toast.error(`ไม่สามารถปลดออกกลุ่มนี้ได้เนื่องจากยังมีเครื่องมือลูกที่ใช้งานอยู่ (${group.active_child_count} รายการ)`);
      return;
    }
    const reason = window.prompt(`ระบุเหตุผลในการปลดออกกลุ่ม ${group.asset_code}:`);
    if (!reason || !reason.trim()) return;

    try {
      await retireVccAsset(group.id, reason.trim());
      toast.success(`ปลดออกกลุ่ม ${group.asset_code} แล้ว`);
      if (selectedGroupId === group.id) {
        setSelectedGroupId(null);
        setSelectedGroupDetail(null);
      }
      await loadGroups();
      if (onReload) onReload();
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถปลดออกกลุ่มได้');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
              <FolderTree size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                จัดการกลุ่มเครื่องมือเชิงตรรกะ (Logical Group Admin)
              </h2>
              <p className="text-xs text-slate-500">
                เฉพาะเจ้าหน้าที่ DCC: สำหรับจัดหมวดหมู่เครื่องมือภายในแผนก (เครื่องมือลูกยังคงเป็นหน่วยสอบเทียบจริงในทะเบียน)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="ปิด"
            aria-label="ปิดหน้าต่างจัดการกลุ่ม"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Action Bar */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-700">
              กลุ่มเครื่องมือทั้งหมด ({groups.length} กลุ่ม)
            </span>
            <button
              type="button"
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-700 text-white text-xs font-semibold hover:bg-purple-800 transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>{showCreateForm ? 'ปิดแบบฟอร์ม' : 'สร้างกลุ่มใหม่'}</span>
            </button>
          </div>

          {/* Create Group Form */}
          {showCreateForm && (
            <form onSubmit={handleCreateGroup} className="p-4 rounded-xl bg-purple-50/50 border border-purple-200 space-y-3 text-sm">
              <h3 className="font-bold text-purple-950 text-sm flex items-center gap-2">
                <FolderTree size={16} className="text-purple-700" />
                <span>สร้างกลุ่มจัดหมวดหมู่เสมือนใหม่ (Logical Group)</span>
              </h3>

              {formError && (
                <div role="alert" className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    รหัสกลุ่ม (เช่น GRP-SCALE) <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newGroup.asset_code}
                    onChange={(e) => setNewGroup({ ...newGroup, asset_code: e.target.value.toUpperCase() })}
                    placeholder="GRP-..."
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs font-mono uppercase focus:outline-none focus:border-purple-600 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ชื่อกลุ่มเครื่องมือ <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newGroup.name}
                    onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                    placeholder="เช่น กลุ่มเครื่องชั่งฝ่ายผลิต..."
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs focus:outline-none focus:border-purple-600 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    แผนก <span className="text-rose-600">*</span>
                  </label>
                  <select
                    required
                    value={newGroup.department}
                    onChange={(e) => setNewGroup({ ...newGroup, department: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:border-purple-600"
                  >
                    {activeDepartments.map((d) => (
                      <option key={d.code} value={d.code}>{d.code} — {d.nameTh}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ประเภทเครื่องมือหลัก <span className="text-rose-600">*</span>
                  </label>
                  <select
                    required
                    value={newGroup.asset_type}
                    onChange={(e) => setNewGroup({ ...newGroup, asset_type: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:border-purple-600"
                  >
                    {assetTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-1.5 rounded-lg bg-purple-700 text-white text-xs font-semibold hover:bg-purple-800 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {creating ? 'กำลังสร้าง...' : 'บันทึกกลุ่ม'}
                </button>
              </div>
            </form>
          )}

          {/* Groups List */}
          {loading ? (
            <div className="py-8 text-center text-sm text-slate-500 font-medium">กำลังโหลดข้อมูลกลุ่ม...</div>
          ) : groups.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl">
              ยังไม่มีกลุ่มเครื่องมือเชิงตรรกะในระบบ สามารถกดปุ่ม &ldquo;สร้างกลุ่มใหม่&rdquo; ด้านบนเพื่อเริ่มต้น
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => {
                const isSelected = selectedGroupId === group.id;
                return (
                  <div
                    key={group.id}
                    className={`border rounded-xl transition-all ${
                      isSelected ? 'border-purple-300 bg-purple-50/20 shadow-xs' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1 min-w-[200px]">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-purple-950">{group.asset_code}</span>
                          <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 text-xs font-bold">
                            Logical Group
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">
                            แผนก {group.department}
                          </span>
                        </div>
                        <div className="font-semibold text-slate-900 text-sm">{group.name}</div>
                        <div className="text-xs text-slate-500">
                          ประเภท: {group.asset_type} • เครื่องมือลูก: <strong className="text-slate-800">{group.active_child_count || 0} รายการ</strong>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleSelectGroup(group)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-purple-700 text-white border-purple-700'
                              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {isSelected ? 'ปิดเครื่องมือลูก' : `จัดการเครื่องมือลูก (${group.active_child_count || 0})`}
                        </button>
                        {onOpenHistory && (
                          <button
                            type="button"
                            onClick={() => onOpenHistory(group.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                            title="ดูประวัติกลุ่ม"
                          >
                            <History size={13} />
                            <span>ประวัติ</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRetireGroup(group)}
                          disabled={group.active_child_count > 0}
                          title={group.active_child_count > 0 ? 'ต้องปลดหรือย้ายเครื่องมือลูกออกก่อน' : 'ปลดออกกลุ่มนี้'}
                          className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <Archive size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Child Management */}
                    {isSelected && (
                      <div className="px-4 pb-4 pt-2 border-t border-purple-100 bg-white/70 rounded-b-xl space-y-4">
                        {loadingDetail ? (
                          <div className="py-4 text-center text-xs text-slate-500 font-medium">กำลังโหลดข้อมูลเครื่องมือลูก...</div>
                        ) : (
                          <>
                            {/* Children Table */}
                            <div className="space-y-2">
                              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                เครื่องมือที่สังกัดกลุ่มนี้ ({selectedGroupDetail?.children?.length || 0} รายการ)
                              </h4>
                              {(selectedGroupDetail?.children || []).length === 0 ? (
                                <div className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-lg border border-slate-100">
                                  ยังไม่มีเครื่องมือลูกในกลุ่มนี้ สามารถเลือกเพิ่มจากรายการด้านล่าง
                                </div>
                              ) : (
                                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs bg-white">
                                  {selectedGroupDetail.children.map((child) => (
                                    <div key={child.id} className="p-2.5 flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono font-bold text-slate-900">{child.asset_code}</span>
                                        <span className="text-slate-700">— {child.name}</span>
                                        <span className="text-slate-400">({child.asset_type})</span>
                                        {child.status === 'RETIRED' && (
                                          <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold">RETIRED</span>
                                        )}
                                      </div>
                                      <button
                                        type="button"
                                        disabled={updatingChild}
                                        onClick={() => handleDetachChild(child.id, child.asset_code)}
                                        className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                                      >
                                        ปลดออกจากกลุ่ม
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Add Child to Group */}
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-wrap items-center gap-2">
                              <label className="text-xs font-bold text-slate-700 shrink-0">
                                เพิ่มเครื่องมือเข้ากลุ่ม:
                              </label>
                              <select
                                value={candidateChildId}
                                onChange={(e) => setCandidateChildId(e.target.value)}
                                className="flex-1 min-w-[200px] h-8 px-2.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:border-purple-600"
                              >
                                <option value="">-- เลือกเครื่องมือในแผนก {group.department} ที่ยังไม่มีกลุ่ม --</option>
                                {availableAssets.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.asset_code} — {a.name} ({a.asset_type})
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={!candidateChildId || updatingChild}
                                onClick={handleAttachChild}
                                className="h-8 px-3 rounded-lg bg-purple-700 text-white text-xs font-semibold hover:bg-purple-800 disabled:opacity-50 transition-colors cursor-pointer"
                              >
                                {updatingChild ? 'กำลังเพิ่ม...' : 'เพิ่มเข้ากลุ่ม'}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-900 transition-colors cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};
