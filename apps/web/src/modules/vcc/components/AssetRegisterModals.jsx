import React from 'react';
import {
  AlertTriangle,
  X,
  Trash2
} from 'lucide-react';
import { useVccModalAccessibility } from '../hooks/useVccModalAccessibility';
import { VccDiscardConfirmDialog } from './VccDiscardConfirmDialog';

const serializeAssetForm = (f) => JSON.stringify({
  asset_code: (f?.asset_code || '').trim().toUpperCase(),
  name: (f?.name || '').trim(),
  asset_type: f?.asset_type || '',
  serial_no: (f?.serial_no || '').trim(),
  model: (f?.model || '').trim(),
  location: (f?.location || '').trim(),
  department: f?.department || '',
  is_group: Boolean(f?.is_group),
  group_nature: f?.group_nature || 'LOGICAL_GROUP',
  composite_details: (f?.composite_details || '').trim()
});

export const AssetFormModal = ({
  formOpen,
  setFormOpen,
  editingAsset,
  form,
  setForm,
  formError,
  savingForm,
  handleSaveAsset,
  formTypeOptions = [],
  assetTypes = [],
  loadingAssetTypes = false,
  activeDepartments = [],
  canTransfer = true,
  isDepartmentLocked = false
}) => {
  const isCurrentlyOpen = Boolean(formOpen);
  const [prevOpen, setPrevOpen] = React.useState(isCurrentlyOpen);
  const [prevAssetId, setPrevAssetId] = React.useState(editingAsset?.id ?? null);
  const [initialSnapshot, setInitialSnapshot] = React.useState(() => (isCurrentlyOpen && form ? serializeAssetForm(form) : null));

  if (isCurrentlyOpen !== prevOpen || (editingAsset?.id ?? null) !== prevAssetId) {
    setPrevOpen(isCurrentlyOpen);
    setPrevAssetId(editingAsset?.id ?? null);
    setInitialSnapshot(isCurrentlyOpen && form ? serializeAssetForm(form) : null);
  }

  const isDirty = React.useMemo(() => {
    if (!isCurrentlyOpen || !initialSnapshot || !form || savingForm) return false;
    return serializeAssetForm(form) !== initialSnapshot;
  }, [isCurrentlyOpen, form, initialSnapshot, savingForm]);

  const {
    dialogRef,
    requestClose,
    handleBackdropClick,
    showConfirmDiscard,
    confirmDiscard,
    cancelDiscard
  } = useVccModalAccessibility({
    isOpen: formOpen,
    onClose: () => setFormOpen(false),
    isDirty,
    discardTitle: 'ข้อมูลเครื่องมือวัดยังไม่ได้บันทึก',
    discardMessage: 'คุณมีข้อมูลเครื่องมือวัดที่กำลังจัดทำ ต้องการยกเลิกและปิดหน้าต่างใช่หรือไม่?'
  });

  if (!formOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
        onClick={handleBackdropClick}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="asset-form-title"
          tabIndex="-1"
          className="bg-white rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 shadow-2xl max-w-xl w-full max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden my-0 sm:my-auto outline-none transition-transform duration-100 ease-out"
        >
          <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/50">
            <h2 id="asset-form-title" className="text-xl font-bold text-slate-900 tracking-tight">
              {editingAsset ? `แก้ไขข้อมูลเครื่องมือ (${editingAsset.asset_code})` : 'เพิ่มเครื่องมือวัดใหม่'}
            </h2>
            <button
              type="button"
              onClick={requestClose}
              aria-label="ปิดหน้าต่าง"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 motion-safe:active:bg-slate-300 transition-colors cursor-pointer select-none"
            >
              <X size={20} />
            </button>
          </div>

        <form onSubmit={handleSaveAsset} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-y-contain">
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
                disabled={loadingAssetTypes || formTypeOptions.length === 0}
                value={form.asset_type}
                onChange={(e) => setForm({ ...form, asset_type: e.target.value })}
                className="w-full h-10 px-3 pr-8 truncate rounded-xl border border-slate-300 text-sm font-medium bg-white focus:outline-none focus:border-indigo-600 disabled:bg-slate-100 disabled:text-slate-500"
              >
                <option value="" disabled>
                  {loadingAssetTypes
                    ? '-- กำลังโหลดประเภทเครื่องมือ... --'
                    : formTypeOptions.length === 0
                      ? '-- ไม่มีรายการประเภทเครื่องมือในระบบ --'
                      : '-- เลือกประเภทเครื่องมือ --'}
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
                disabled={activeDepartments.length === 0 || isDepartmentLocked || (Boolean(editingAsset) && !canTransfer)}
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full h-10 px-3 pr-8 truncate rounded-xl border border-slate-300 text-sm font-medium bg-white focus:outline-none focus:border-indigo-600 disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
              >
                <option value="" disabled>
                  {activeDepartments.length === 0 ? '-- โหลดแผนกไม่ได้ --' : '-- เลือกแผนก --'}
                </option>
                {activeDepartments.map((d) => (
                  <option key={d.code} value={d.code}>
                    [{d.code}] {d.nameTh}
                  </option>
                ))}
              </select>
              {isDepartmentLocked && !editingAsset && activeDepartments.length > 0 && (
                <p className="mt-1.5 text-xs text-slate-500">ล็อกตามแผนกของผู้ใช้งาน (การเลือกแผนกอื่นทำได้เฉพาะ DCC)</p>
              )}
              {Boolean(editingAsset) && !canTransfer && (
                <p className="mt-1.5 text-xs text-slate-500">การโอนเครื่องมือข้ามแผนกทำได้เฉพาะ DCC</p>
              )}
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

          <div className="pt-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-0 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={requestClose}
              className="order-1 sm:order-1 w-full sm:w-auto min-h-[44px] sm:min-h-[40px] px-4 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer select-none motion-safe:active:scale-[0.98]"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={savingForm || activeDepartments.length === 0}
              className="order-2 sm:order-2 w-full sm:w-auto min-h-[44px] sm:min-h-[40px] px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs select-none motion-safe:active:scale-[0.98]"
            >
              {savingForm ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
            </button>
          </div>
        </form>
      </div>
    </div>

    <VccDiscardConfirmDialog
      isOpen={showConfirmDiscard}
      title="ข้อมูลเครื่องมือวัดยังไม่ได้บันทึก"
      message="คุณมีข้อมูลเครื่องมือวัดที่กำลังจัดทำ ต้องการยกเลิกและปิดหน้าต่างใช่หรือไม่?"
      onConfirm={confirmDiscard}
      onCancel={cancelDiscard}
    />
  </>
);
};

export const AssetStatusModal = ({
  statusModal,
  setStatusModal,
  statusReason,
  setStatusReason,
  statusError,
  statusImpact,
  savingStatus,
  handleConfirmStatusChange
}) => {
  const isDirty = Boolean(statusReason?.trim());
  const isRetire = statusModal?.mode === 'RETIRE';

  const {
    dialogRef,
    requestClose,
    handleBackdropClick,
    showConfirmDiscard,
    confirmDiscard,
    cancelDiscard
  } = useVccModalAccessibility({
    isOpen: !!statusModal,
    onClose: () => setStatusModal(null),
    isDirty
  });

  if (!statusModal) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
        onClick={handleBackdropClick}
      >
        <div
          ref={dialogRef}
          role={isRetire ? 'alertdialog' : 'dialog'}
          aria-modal="true"
          aria-labelledby="asset-status-title"
          tabIndex="-1"
          className="bg-white rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 shadow-2xl max-w-md w-full max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden my-0 sm:my-auto outline-none transition-transform duration-100 ease-out"
        >
          <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/50">
            <h2 id="asset-status-title" className="text-xl font-bold text-slate-900 tracking-tight">
              {statusModal.mode === 'RETIRE'
                ? `ปลดออกจากทะเบียน (${statusModal.asset.asset_code})`
                : `นำเครื่องมือกลับมาใช้งาน (${statusModal.asset.asset_code})`}
            </h2>
            <button
              type="button"
              onClick={requestClose}
              aria-label="ปิดหน้าต่าง"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 motion-safe:active:bg-slate-300 transition-colors cursor-pointer select-none"
            >
              <X size={20} />
            </button>
          </div>

        <form onSubmit={handleConfirmStatusChange} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-y-contain">
          {statusError && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center gap-2">
              <AlertTriangle size={17} className="text-rose-600 shrink-0" />
              <span>{statusError}</span>
            </div>
          )}

          {statusModal.mode === 'RETIRE' && (
            <p className="text-sm text-slate-600 font-medium">
              เครื่องมือจะไม่อยู่ในแผนประจำปีฉบับใหม่ แต่ไม่ถูกลบ ประวัติทั้งหมดยังอยู่และนำกลับมาใช้ได้ ถ้าต้องการแค่เอาออกจากแผนปีนี้ ให้ไปที่หน้าแผนประจำปีแล้วเลือก “นำออกจากแผน”
            </p>
          )}

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm">
            <div className="font-bold text-slate-900 text-base">
              {statusModal.asset.asset_code} — {statusModal.asset.name}
            </div>
            <div className="text-xs text-slate-500 font-medium mt-1">
              แผนก: {statusModal.asset.department} • ประเภท: {statusModal.asset.asset_type}
            </div>
          </div>

          {statusImpact && (
            <div
              data-testid="asset-impact"
              className={`p-3.5 rounded-xl border text-sm bg-slate-50 border-slate-200 text-slate-700`}
            >
              <div className="font-bold mb-1">ผลกระทบที่ตรวจพบ</div>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>ใบสั่งงานสอบเทียบที่ยังไม่ปิด: {statusImpact.open_work_orders}</li>
                <li>อยู่ในแผนประจำปีฉบับปัจจุบัน: {statusImpact.plan_items} รายการ</li>
                <li>ใบสั่งงานที่ปิดแล้ว (ประวัติ ไม่ถูกแก้ไข): {statusImpact.closed_work_orders}</li>
              </ul>
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

          <div className="pt-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-0 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={requestClose}
              className="order-1 sm:order-1 w-full sm:w-auto min-h-[44px] sm:min-h-[40px] px-4 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer select-none motion-safe:active:scale-[0.98]"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={savingStatus || !statusReason.trim()}
              className={`order-2 sm:order-2 w-full sm:w-auto min-h-[44px] sm:min-h-[40px] px-5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-colors cursor-pointer shadow-2xs select-none motion-safe:active:scale-[0.98] ${
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

    <VccDiscardConfirmDialog
      isOpen={showConfirmDiscard}
      onConfirm={confirmDiscard}
      onCancel={cancelDiscard}
    />
  </>
);
};

import { AssetDetailDrawer } from './AssetDetailDrawer';

export { AssetDetailDrawer as AssetDetailHistoryModal };

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
  const isDirty = Boolean(newTypeName?.trim());

  const {
    dialogRef,
    requestClose,
    handleBackdropClick,
    showConfirmDiscard,
    confirmDiscard,
    cancelDiscard
  } = useVccModalAccessibility({
    isOpen: typesModalOpen,
    onClose: () => setTypesModalOpen(false),
    isDirty
  });

  if (!typesModalOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
        onClick={handleBackdropClick}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="asset-types-title"
          tabIndex="-1"
          className="bg-white rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 shadow-2xl max-w-lg w-full max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden my-0 sm:my-auto outline-none transition-transform duration-100 ease-out"
        >
          <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/50">
            <h2 id="asset-types-title" className="text-xl font-bold text-slate-900 tracking-tight">ตั้งค่ารายการประเภทเครื่องมือ</h2>
            <button
              type="button"
              onClick={requestClose}
              aria-label="ปิดหน้าต่าง"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 motion-safe:active:bg-slate-300 transition-colors cursor-pointer select-none"
            >
              <X size={20} />
            </button>
          </div>

        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-y-contain">
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

          <div className="pt-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:pb-0 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={requestClose}
              className="order-1 sm:order-1 w-full sm:w-auto min-h-[44px] sm:min-h-[40px] px-4 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer select-none motion-safe:active:scale-[0.98]"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={savingTypes}
              onClick={handleSaveTypes}
              className="order-2 sm:order-2 w-full sm:w-auto min-h-[44px] sm:min-h-[40px] px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs select-none motion-safe:active:scale-[0.98]"
            >
              {savingTypes ? 'กำลังบันทึก...' : 'บันทึกรายการตั้งค่า'}
            </button>
          </div>
        </div>
      </div>
    </div>

    <VccDiscardConfirmDialog
      isOpen={showConfirmDiscard}
      onConfirm={confirmDiscard}
      onCancel={cancelDiscard}
    />
  </>
);
};
