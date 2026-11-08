import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, FolderTree, Trash2, X, Send, UserCheck, ShieldCheck, Calendar, FileText, Clock, Lock, Settings2 } from 'lucide-react';
import { computeDueDates, computeDueDateForMonth, fetchVccDocumentProfiles, saveVccDocumentProfile } from '../api/vccPlanApi';
import { formatVccDateTime, formatVccDueDatesList } from '../utils/vccDateUtils';
import { useVccModalAccessibility } from '../hooks/useVccModalAccessibility';
import { VccDiscardConfirmDialog } from './VccDiscardConfirmDialog';

const PLAN_AUDIT_LABELS = {
  VCC_PLAN_CREATED: { label: 'สร้างแผนประจำปีใหม่', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  VCC_PLAN_UPDATED: { label: 'แก้ไขข้อมูลหัวแผน', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  VCC_PLAN_ITEM_SAVED: { label: 'เพิ่ม/แก้ไขเครื่องมือในแผน', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  VCC_PLAN_ITEM_REMOVED: { label: 'ลบเครื่องมือออกจากแผน', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
  VCC_PLAN_SUBMITTED: { label: 'ส่งทบทวนแผน (Submit)', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  VCC_PLAN_REVIEWED: { label: 'ยืนยันการทบทวนแผน (Review)', badge: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  VCC_PLAN_APPROVED: { label: 'อนุมัติแผนประจำปี (Approve)', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  VCC_PLAN_REJECTED: { label: 'ส่งกลับแก้ไข (Reject)', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
  VCC_PLAN_GROUP_CONVERTED: { label: 'แปลงรายการกลุ่มเดิมเป็นรายตัว', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
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
  const isDirty = useMemo(() => {
    if (!form) return false;
    if (editingPlan) {
      return (
        form.department !== editingPlan.department ||
        form.document_code !== editingPlan.document_code ||
        form.revision !== editingPlan.revision ||
        form.title !== editingPlan.title ||
        form.due_date_rule !== editingPlan.due_date_rule
      );
    }
    return Boolean(form.plan_year || form.department || form.document_code || form.title);
  }, [form, editingPlan]);

  const {
    dialogRef,
    requestClose,
    handleBackdropClick,
    showConfirmDiscard,
    confirmDiscard,
    cancelDiscard
  } = useVccModalAccessibility({
    isOpen: open,
    onClose,
    isDirty,
    discardTitle: 'ข้อมูลแผนประจำปียังไม่ได้บันทึก',
    discardMessage: 'คุณมีข้อมูลแผนประจำปีที่กำลังแก้ไข ต้องการยกเลิกและปิดหน้าต่างใช่หรือไม่?'
  });

  if (!open) return null;

  const previewYear = form.plan_year && Number.isInteger(Number(form.plan_year)) && Number(form.plan_year) >= 2000 && Number(form.plan_year) <= 2100
    ? Number(form.plan_year)
    : new Date().getFullYear();
  const endOfMonthPreview = computeDueDateForMonth(previewYear, 2, 'END_OF_MONTH');
  const startOfMonthPreview = computeDueDateForMonth(previewYear, 2, 'START_OF_MONTH');

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
        onClick={handleBackdropClick}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="plan-form-modal-title"
          tabIndex="-1"
          className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden my-auto outline-none"
        >
          <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
            <h2 id="plan-form-modal-title" className="text-xl font-bold text-slate-900 tracking-tight">
              {editingPlan ? `แก้ไขหัวแผนประจำปี ${editingPlan.plan_year}` : 'สร้างแผนการทวนสอบเครื่องมือประจำปีใหม่'}
            </h2>
            <button
              type="button"
              onClick={requestClose}
              aria-label="ปิดหน้าต่าง"
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
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

          {/* Section 1: ข้อมูลพื้นฐานแผนประจำปี */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Calendar size={13} className="text-indigo-600 shrink-0" />
                <span>1. ข้อมูลพื้นฐานแผนประจำปี</span>
              </span>
              {editingPlan && (
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-medium bg-slate-200/80 px-1.5 py-0.5 rounded">
                  <Lock size={10} />
                  <span>ล็อกอัตโนมัติ</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label htmlFor="plan_year" className="block text-xs font-semibold text-slate-700 mb-1">
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
                  className="w-full h-9.5 px-3 rounded-lg border border-slate-300 text-xs font-semibold disabled:bg-slate-100/90 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
                <p className="mt-1 text-[11px] text-slate-500 font-medium">
                  {form.plan_year && Number.isInteger(Number(form.plan_year)) && Number(form.plan_year) >= 2000 && Number(form.plan_year) <= 2100
                    ? `ตรงกับ พ.ศ. ${Number(form.plan_year) + 543}`
                    : 'รองรับ ค.ศ. 2000–2100'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  แผนกเจ้าของแผน (Master Data) <span className="text-rose-600">*</span>
                </label>
                <select
                  required
                  disabled={Boolean(editingPlan) || activeDepartments.length === 0}
                  value={form.department}
                  onChange={(e) => {
                    const dept = e.target.value;
                    const yr = form.plan_year ? String(form.plan_year) : '';
                    if (editingPlan) {
                      setForm({ ...form, department: dept });
                    } else if (dept === 'QC') {
                      setForm({
                        ...form,
                        department: dept,
                        document_code: 'FM-QC-46',
                        revision: '01',
                        title: yr ? `แผนการทวนสอบเครื่องมือประจำปี ${yr}` : 'แผนการทวนสอบเครื่องมือประจำปี'
                      });
                    } else if (dept === 'LB') {
                      setForm({
                        ...form,
                        department: dept,
                        document_code: 'FM-LB-11',
                        revision: '02',
                        title: yr ? `แผนการสอบเทียบเครื่องมือที่ใช้ในห้องปฏิบัติการจุลชีววิทยา ประจำปี ${yr}` : 'แผนการสอบเทียบเครื่องมือที่ใช้ในห้องปฏิบัติการจุลชีววิทยา ประจำปี'
                      });
                    } else {
                      setForm({ ...form, department: dept });
                    }
                  }}
                  className="w-full h-9.5 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white disabled:bg-slate-100/90 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
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
                  <p className="mt-1 text-[11px] text-rose-600 font-semibold">
                    ไม่สามารถโหลดแผนกจาก Master Data ได้ กรุณาตรวจสอบข้อมูลแผนกก่อนบันทึก
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: ข้อมูลเอกสารคุณภาพ (QMS) */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <FileText size={13} className="text-indigo-600 shrink-0" />
              <span>2. ข้อมูลเอกสารคุณภาพ (QMS)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">รหัสแบบฟอร์มเอกสาร</label>
                <input
                  type="text"
                  required
                  value={form.document_code}
                  onChange={(e) => setForm({ ...form, document_code: e.target.value })}
                  className="w-full h-9.5 px-3 rounded-lg border border-slate-300 text-xs font-mono font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Revision (ครั้งที่แก้ไข)</label>
                <input
                  type="text"
                  required
                  value={form.revision}
                  onChange={(e) => setForm({ ...form, revision: e.target.value })}
                  className="w-full h-9.5 px-3 rounded-lg border border-slate-300 text-xs font-mono font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">ชื่อแผนประจำปี</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full h-9.5 px-3 rounded-lg border border-slate-300 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              />
            </div>
          </div>

          {/* Section 3: กติกาคำนวณวันครบกำหนด */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Clock size={13} className="text-indigo-600 shrink-0" />
              <span>3. กติกาคำนวณวันครบกำหนด</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                กำหนดวันครบกำหนด (เมื่อแผนระบุเฉพาะเดือน)
              </label>
              <select
                value={form.due_date_rule}
                onChange={(e) => setForm({ ...form, due_date_rule: e.target.value })}
                className="w-full h-9.5 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              >
                <option value="END_OF_MONTH">วันสิ้นเดือนของเดือนที่วางแผน (เช่น {endOfMonthPreview})</option>
                <option value="START_OF_MONTH">วันที่ 1 ของเดือนที่วางแผน (เช่น {startOfMonthPreview})</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={requestClose}
              className="h-9.5 px-4 rounded-xl border border-slate-300 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving || activeDepartments.length === 0}
              className="h-9.5 px-5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 shadow-2xs transition-colors cursor-pointer"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกแผนประจำปี'}
            </button>
          </div>
        </form>
      </div>
    </div>

    <VccDiscardConfirmDialog
      isOpen={showConfirmDiscard}
      onConfirm={confirmDiscard}
      onCancel={cancelDiscard}
      title="ข้อมูลแผนประจำปียังไม่ได้บันทึก"
      message="คุณมีข้อมูลแผนประจำปีที่กำลังแก้ไข ต้องการยกเลิกและปิดหน้าต่างใช่หรือไม่?"
    />
  </>
  );
};

export const PlanRevisionModal = ({ open, onClose, plan, reason, setReason, error, saving, onSubmit }) => {
  const isDirty = Boolean(reason?.trim());

  const {
    dialogRef,
    requestClose,
    handleBackdropClick,
    showConfirmDiscard,
    confirmDiscard,
    cancelDiscard
  } = useVccModalAccessibility({
    isOpen: open,
    onClose,
    isDirty,
    discardTitle: 'ข้อมูลฉบับแก้ไขยังไม่ได้บันทึก',
    discardMessage: 'คุณมีข้อมูลเหตุผลการแก้ไขที่กำลังกรอก ต้องการยกเลิกและปิดหน้าต่างใช่หรือไม่?'
  });

  if (!open || !plan) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
        onClick={handleBackdropClick}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="plan-revision-modal-title"
          tabIndex="-1"
          className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden my-auto outline-none"
        >
          <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
            <h2 id="plan-revision-modal-title" className="text-xl font-bold text-slate-900 tracking-tight">
              สร้างแผนฉบับแก้ไข (Revision) ของแผนปี {plan.plan_year}
            </h2>
            <button
              type="button"
              onClick={requestClose}
              aria-label="ปิดหน้าต่าง"
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
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
            <p className="text-sm text-slate-600 font-medium">
              ระบบจะคัดลอกแผน {plan.department} Rev.{plan.revision} เป็นฉบับร่างใหม่ แผนเดิมยังใช้งานต่อจนกว่าฉบับใหม่จะผ่านการทบทวนและอนุมัติ
            </p>
            <div>
              <label htmlFor="plan_revision_reason" className="block text-sm font-semibold text-slate-700 mb-1.5">
                เหตุผลการขอปรับปรุงแผน <span className="text-rose-600">*</span>
              </label>
              <textarea
                id="plan_revision_reason"
                rows={3}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="เช่น เพิ่มเครื่องมือใหม่เข้าแผน / เปลี่ยนรอบทวนสอบ..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:border-indigo-600"
              />
            </div>
            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={requestClose}
                className="h-10 px-4 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={saving || !reason.trim()}
                className="h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {saving ? 'กำลังสร้าง...' : 'สร้างฉบับแก้ไข'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <VccDiscardConfirmDialog
        isOpen={showConfirmDiscard}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
        title="ข้อมูลฉบับแก้ไขยังไม่ได้บันทึก"
        message="คุณมีข้อมูลเหตุผลการแก้ไขที่กำลังกรอก ต้องการยกเลิกและปิดหน้าต่างใช่หรือไม่?"
      />
    </>
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
  const isDirty = useMemo(() => {
    return Boolean(itemForm?.asset_id || (itemForm?.planned_months && itemForm.planned_months.length > 0) || itemForm?.remarks?.trim());
  }, [itemForm]);

  const {
    dialogRef,
    requestClose,
    handleBackdropClick,
    showConfirmDiscard,
    confirmDiscard,
    cancelDiscard
  } = useVccModalAccessibility({
    isOpen: open,
    onClose,
    isDirty,
    discardTitle: 'ข้อมูลกำหนดการเครื่องมือยังไม่ได้บันทึก',
    discardMessage: 'คุณมีข้อมูลตารางทวนสอบที่กำลังกำหนด ต้องการยกเลิกและปิดหน้าต่างใช่หรือไม่?'
  });

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
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
        onClick={handleBackdropClick}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="plan-item-modal-title"
          tabIndex="-1"
          className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden my-auto outline-none"
        >
          <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
            <h2 id="plan-item-modal-title" className="text-xl font-bold text-slate-900 tracking-tight">
              กำหนดตารางทวนสอบเครื่องมือในแผนปี {plan.plan_year}
            </h2>
            <button
              type="button"
              onClick={requestClose}
              aria-label="ปิดหน้าต่าง"
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
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
              เครื่องมือวัด / ชุดเครื่องมือ (เฉพาะที่ใช้งานปกติ) <span className="text-rose-600">*</span>
            </label>
            <select
              required
              value={itemForm.asset_id}
              onChange={(e) => handleAssetChange(e.target.value)}
              className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white"
            >
              <option value="" disabled>-- เลือกเครื่องมือจากทะเบียน --</option>
              {activeAssets
                .filter((a) => Number(a.is_group) === 0 || a.group_nature === 'COMPOSITE_SET')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.asset_code} — {a.name} {a.group_nature === 'COMPOSITE_SET' ? '(ชุดเครื่องมือ)' : ''}
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
              <span className="font-semibold text-slate-900 font-sans" title={previewDueDates.join(', ')}>{previewDueDates.length > 0 ? formatVccDueDatesList(previewDueDates) : 'กรุณาเลือกอย่างน้อย 1 เดือน'}</span>
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

          {/* Department-specific metrology fields (FM-QC-46 / FM-LB-11) */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <FileText size={13} className="text-indigo-600 shrink-0" />
              <span>เกณฑ์มาตรฐานเฉพาะแผนก (Metrology & Criteria)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  MPE (ค่าความผิดพลาดสูงสุด)
                </label>
                <input
                  type="text"
                  value={itemForm.mpe || ''}
                  onChange={(e) => setItemForm({ ...itemForm, mpe: e.target.value })}
                  placeholder="เช่น ±0.02 mm, ±0.5°C"
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  จุดสอบเทียบ / ทวนสอบ
                </label>
                <input
                  type="text"
                  value={itemForm.calibration_points || ''}
                  onChange={(e) => setItemForm({ ...itemForm, calibration_points: e.target.value })}
                  placeholder="เช่น 0, 50, 100 mm"
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  เกณฑ์การยอมรับ
                </label>
                <input
                  type="text"
                  value={itemForm.acceptance_criteria || ''}
                  onChange={(e) => setItemForm({ ...itemForm, acceptance_criteria: e.target.value })}
                  placeholder="เช่น ไม่เกิน MPE"
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                />
              </div>
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
            <button
              type="button"
              onClick={requestClose}
              className="h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
            >
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

    <VccDiscardConfirmDialog
      isOpen={showConfirmDiscard}
      onConfirm={confirmDiscard}
      onCancel={cancelDiscard}
      title="ข้อมูลกำหนดการเครื่องมือยังไม่ได้บันทึก"
      message="คุณมีข้อมูลตารางทวนสอบที่กำลังกำหนด ต้องการยกเลิกและปิดหน้าต่างใช่หรือไม่?"
    />
  </>
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
  const isReject = modalState?.mode === 'REJECT';
  const isDirty = Boolean(commentOrReason?.trim());

  const {
    dialogRef,
    requestClose,
    handleBackdropClick,
    showConfirmDiscard,
    confirmDiscard,
    cancelDiscard
  } = useVccModalAccessibility({
    isOpen: Boolean(modalState),
    onClose,
    isDirty,
    discardTitle: 'ข้อคิดเห็นยังไม่ได้บันทึก',
    discardMessage: 'คุณมีข้อความความเห็นที่กำลังกรอก ต้องการยกเลิกและปิดหน้าต่างใช่หรือไม่?'
  });

  if (!modalState) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
        onClick={handleBackdropClick}
      >
        <div
          ref={dialogRef}
          role={isReject ? 'alertdialog' : 'dialog'}
          aria-modal="true"
          aria-labelledby="plan-workflow-title"
          tabIndex="-1"
          className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden my-auto outline-none"
        >
          <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
            <h2 id="plan-workflow-title" className="text-xl font-bold text-slate-900 tracking-tight">
              {isReject
                ? 'ส่งกลับแก้ไขแผนประจำปี (Reject)'
                : modalState.mode === 'REVIEW'
                  ? 'ยืนยันการทบทวนแผนประจำปี (Review)'
                  : 'ยืนยันการอนุมัติแผนประจำปี (Approve)'}
            </h2>
            <button
              type="button"
              onClick={requestClose}
              aria-label="ปิดหน้าต่าง"
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
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
              <label htmlFor="plan-workflow-comment" className="block text-sm font-semibold text-slate-700 mb-1.5">
                {isReject ? 'เหตุผลในการส่งกลับแก้ไข' : 'ความเห็นเพิ่มเติม (ถ้ามี)'}{' '}
                {isReject && <span className="text-rose-600">*</span>}
              </label>
              <textarea
                id="plan-workflow-comment"
                rows={3}
                required={isReject}
                value={commentOrReason}
                onChange={(e) => setCommentOrReason(e.target.value)}
                placeholder={isReject ? 'ระบุสิ่งที่ต้องแก้ไขในแผนประจำปี...' : 'ความเห็นประกอบการทบทวน/อนุมัติ...'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={requestClose}
                className="h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
              >
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

      <VccDiscardConfirmDialog
        isOpen={showConfirmDiscard}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
        title="ข้อคิดเห็นยังไม่ได้บันทึก"
        message="คุณมีข้อความความเห็นที่กำลังกรอก ต้องการยกเลิกและปิดหน้าต่างใช่หรือไม่?"
      />
    </>
  );
};

const PlanSubmitModalContent = ({
  open: _open,
  onClose,
  plan,
  masterUsers = [],
  thresholds = {},
  currentUser,
  onSubmit,
  saving,
  error
}) => {
  const minReviewerLevel = Number(thresholds.required_reviewer_level || 4);
  const minApproverLevel = Number(thresholds.required_approver_level || 5);
  const planDept = String(plan.department || 'QC').toUpperCase().trim();

  const isUserEligibleForDept = (u, dept) => {
    if (!u) return false;
    if (u.isQmr || Number(u.approval_level || u.level || 0) >= 6) return true;
    const depts = [
      u.department, u.dept, u.primary_department, u.primaryDepartment,
      ...(Array.isArray(u.secondaryDepartments) ? u.secondaryDepartments : []),
      ...(Array.isArray(u.departments) ? u.departments : []),
      ...(Array.isArray(u.affiliated_departments) ? u.affiliated_departments : []),
      ...(Array.isArray(u.depts) ? u.depts : [])
    ].filter(Boolean).map((d) => String(d).toUpperCase().trim());
    return depts.some((d) => d === dept);
  };

  const eligibleReviewers = useMemo(() => {
    return (masterUsers || []).filter((u) => {
      if (!u || !u.id || String(u.status || '').toUpperCase() === 'INACTIVE') return false;
      if (u.id === currentUser?.id) return false; // SoD: ผู้จัดทำห้ามทบทวนงานตนเอง
      if (plan.assigned_reviewer_id && u.id === plan.assigned_reviewer_id) return true;
      const lvl = Number(u.approval_level || u.level || 0);
      if (planDept === 'QC' && isUserEligibleForDept(u, 'PD') && lvl >= 5) return true;
      return lvl >= minReviewerLevel && isUserEligibleForDept(u, planDept);
    });
  }, [masterUsers, currentUser, planDept, minReviewerLevel, plan.assigned_reviewer_id]);

  const [selectedReviewerId, setSelectedReviewerId] = useState(
    plan.assigned_reviewer_id || eligibleReviewers[0]?.id || ''
  );

  const eligibleApprovers = useMemo(() => {
    return (masterUsers || []).filter((u) => {
      if (!u || !u.id || String(u.status || '').toUpperCase() === 'INACTIVE') return false;
      if (u.id === currentUser?.id) return false; // SoD: ผู้จัดทำห้ามอนุมัติงานตนเอง
      if (u.id === selectedReviewerId) return false; // 4-Eyes: ผู้ทบทวนห้ามอนุมัติงานที่ตนทบทวน
      if (plan.assigned_approver_id && u.id === plan.assigned_approver_id) return true;
      const lvl = Number(u.approval_level || u.level || 0);
      return lvl >= minApproverLevel && isUserEligibleForDept(u, planDept);
    });
  }, [masterUsers, currentUser, selectedReviewerId, planDept, minApproverLevel, plan.assigned_approver_id]);

  const [selectedApproverId, setSelectedApproverId] = useState(
    plan.assigned_approver_id || eligibleApprovers[0]?.id || ''
  );

  useEffect(() => {
    if (!selectedReviewerId && eligibleReviewers.length > 0) {
      setSelectedReviewerId(eligibleReviewers[0].id);
    }
  }, [eligibleReviewers, selectedReviewerId]);

  useEffect(() => {
    if ((!selectedApproverId || selectedApproverId === selectedReviewerId) && eligibleApprovers.length > 0) {
      setSelectedApproverId(eligibleApprovers[0].id);
    }
  }, [eligibleApprovers, selectedApproverId, selectedReviewerId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSubmit) {
      onSubmit({ reviewerId: selectedReviewerId, approverId: selectedApproverId });
    }
  };

  const hasNoReviewer = eligibleReviewers.length === 0;
  const hasNoApprover = eligibleApprovers.length === 0;
  const isResubmit = plan.status === 'REJECTED';

  const {
    dialogRef,
    requestClose,
    handleBackdropClick
  } = useVccModalAccessibility({
    isOpen: true,
    onClose
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-submit-title"
        tabIndex="-1"
        className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden outline-none"
      >
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Send size={18} />
            </div>
            <div>
              <h2 id="plan-submit-title" className="text-base font-bold text-slate-900 tracking-tight">
                {isResubmit
                  ? 'ส่งทบทวนอีกครั้ง — ส่งแผนประจำปีเข้าสู่กระบวนการทบทวนและอนุมัติ'
                  : 'ส่งแผนประจำปีเข้าสู่กระบวนการทบทวนและอนุมัติ'}
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                {plan.title} ({plan.document_code} Rev.{plan.revision})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="ปิดหน้าต่าง"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isResubmit && plan.rejected_reason && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-0.5">
              <div className="font-bold">ส่งทบทวนรอบใหม่หลังแก้ไขตามเหตุผลที่ส่งกลับ:</div>
              <div className="text-amber-800">{plan.rejected_reason}</div>
            </div>
          )}

          {/* Controlled Reviewer Picker */}
          <div className="space-y-1.5">
            <label className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5">
                <UserCheck size={14} className="text-indigo-600" />
                ผู้ทบทวนแผน (Reviewer - ขั้นต่ำ L{minReviewerLevel})
              </span>
              <span className="text-xs font-semibold text-slate-500">แผนก {planDept}</span>
            </label>
            {hasNoReviewer ? (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                ⚠️ ยังไม่พบผู้ใช้ในแผนก {planDept} หรือผู้มีอำนาจข้ามแผนกที่มีระดับ L{minReviewerLevel}+ กรุณาติดต่อ DCC
              </div>
            ) : (
              <select
                aria-label="เลือกผู้ทบทวนแผน"
                value={selectedReviewerId}
                onChange={(e) => setSelectedReviewerId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium bg-white focus:outline-indigo-500"
                required
              >
                {eligibleReviewers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.position || 'เจ้าหน้าที่'} (L{u.approval_level || u.level || 4}) [{u.department || planDept}]
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Controlled Approver Picker */}
          <div className="space-y-1.5">
            <label className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-600" />
                ผู้อนุมัติแผน (Approver - ขั้นต่ำ L{minApproverLevel})
              </span>
              <span className="text-xs font-semibold text-slate-500">แผนก {planDept}</span>
            </label>
            {hasNoApprover ? (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                ⚠️ ยังไม่พบผู้ใช้ในแผนก {planDept} หรือผู้มีอำนาจข้ามแผนกที่มีระดับ L{minApproverLevel}+ กรุณาติดต่อ DCC
              </div>
            ) : (
              <select
                aria-label="เลือกผู้อนุมัติแผน"
                value={selectedApproverId}
                onChange={(e) => setSelectedApproverId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium bg-white focus:outline-indigo-500"
                required
              >
                {eligibleApprovers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.position || 'ผู้จัดการ'} (L{u.approval_level || u.level || 5}) [{u.department || planDept}]
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-1">
            <p className="font-semibold text-slate-800">หลักการควบคุมสายการอนุมัติ (Approval Matrix Governance):</p>
            <ul className="list-disc list-inside space-y-0.5 pl-1">
              <li>ผู้จัดทำจะไม่สามารถทบทวนหรืออนุมัติแผนของตนเองได้ (Separation of Duties)</li>
              <li>ผู้ทบทวนจะไม่สามารถเป็นผู้อนุมัติแผนฉบับเดียวกันได้ (4-Eyes Principle)</li>
              <li>ผู้รับผิดชอบต้องสังกัดแผนกเจ้าของแผน หรือมีสิทธิ์แผนกรอง/ข้ามแผนกที่ได้รับการรับรอง</li>
            </ul>
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={requestClose}
              className="h-9 px-4 rounded-xl border border-slate-300 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving || hasNoReviewer || hasNoApprover || !selectedReviewerId || !selectedApproverId}
              className="h-9 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
            >
              {saving
                ? 'กำลังส่งแผน...'
                : isResubmit
                  ? 'ยืนยันส่งทบทวนอีกครั้ง (ยืนยันส่งทบทวนแผน)'
                  : 'ยืนยันส่งทบทวนแผน'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const PlanSubmitModal = (props) => {
  if (!props.open || !props.plan) return null;
  return <PlanSubmitModalContent {...props} />;
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
  const {
    dialogRef,
    requestClose,
    handleBackdropClick
  } = useVccModalAccessibility({
    isOpen: !!modalData,
    onClose
  });

  if (!modalData) return null;
  const { item, childAssets } = modalData;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-wo-modal-title"
        tabIndex="-1"
        className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden outline-none"
      >
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
          <h2 id="group-wo-modal-title" className="text-xl font-bold text-slate-900 tracking-tight">
            ตรวจสอบความพร้อมก่อนออกใบสั่งงาน ({item.asset_code})
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="ปิดหน้าต่าง"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
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
              <div>วันครบกำหนดตามแผน: <span className="font-semibold text-slate-900 font-sans" title={(checkResult.due_dates || []).join(', ')}>{(checkResult.due_dates || []).length > 0 ? formatVccDueDatesList(checkResult.due_dates) : '-'}</span></div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              เลือกรหัสเครื่องมือลูกที่ใช้งานปกติ ในกลุ่ม {item.asset_code}
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
            <button type="button" onClick={requestClose} className="h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">
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
  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'profiles'
  const [selectedDept, setSelectedDept] = useState('QC'); // 'QC' | 'LB'
  const [profiles, setProfiles] = useState({});
  const [candidates, setCandidates] = useState({
    qc_reviewers: [],
    lab_reviewers: [],
    approvers: [],
    qc_preparers: [],
    lab_preparers: []
  });
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [savingDeptProfile, setSavingDeptProfile] = useState(false);

  // Department Profile Draft state
  const [deptDraft, setDeptDraft] = useState({
    document_code: '',
    revision: '',
    form_issue_date: '',
    title_th: '',
    min_preparer_level: 4,
    assigned_reviewer_id: '',
    assigned_approver_id: ''
  });

  const isDirty = Boolean(newProvider?.trim());

  const {
    dialogRef,
    requestClose,
    handleBackdropClick,
    showConfirmDiscard,
    confirmDiscard,
    cancelDiscard
  } = useVccModalAccessibility({
    isOpen: open,
    onClose,
    isDirty
  });

  // Load document profiles and Central RBAC candidates when modal opens
  useEffect(() => {
    if (!open) return;
    let isMounted = true;
    setLoadingProfiles(true);
    fetchVccDocumentProfiles()
      .then((data) => {
        if (!isMounted) return;
        const loadedProfiles = data?.profiles || {};
        setProfiles(loadedProfiles);
        if (data?.candidates) setCandidates(data.candidates);

        // Populate initial dept draft
        const initial = loadedProfiles[selectedDept] || {};
        setDeptDraft({
          document_code: initial.document_code || (selectedDept === 'QC' ? 'FM-QC-46' : 'FM-LB-11'),
          revision: initial.revision || (selectedDept === 'QC' ? '01' : '02'),
          form_issue_date: initial.form_issue_date || (selectedDept === 'QC' ? '2026-06-09' : '2026-08-10'),
          title_th: initial.title_th || (selectedDept === 'QC' ? 'แผนการทวนสอบเครื่องมือประจำปี' : 'แผนการสอบเทียบเครื่องมือที่ใช้ในห้องปฏิบัติการจุลชีววิทยา ประจำปี'),
          min_preparer_level: initial.min_preparer_level || 4,
          assigned_reviewer_id: initial.assigned_reviewer_id || '',
          assigned_approver_id: initial.assigned_approver_id || ''
        });
      })
      .catch((err) => {
        toast.error('ไม่สามารถโหลดข้อมูลแบบฟอร์มควบคุมได้: ' + (err.message || ''));
      })
      .finally(() => {
        if (isMounted) setLoadingProfiles(false);
      });
    return () => { isMounted = false; };
  }, [open, selectedDept]);

  if (!open) return null;

  const addProvider = () => {
    const trimmed = newProvider.trim();
    if (!trimmed || draftProviders.includes(trimmed)) return;
    setDraftProviders([...draftProviders, trimmed]);
    setNewProvider('');
  };

  const handleSelectDept = (dept) => {
    setSelectedDept(dept);
    const p = profiles[dept] || {};
    setDeptDraft({
      document_code: p.document_code || '',
      revision: p.revision || '',
      form_issue_date: p.form_issue_date || '',
      title_th: p.title_th || '',
      min_preparer_level: p.min_preparer_level || 4,
      assigned_reviewer_id: p.assigned_reviewer_id || '',
      assigned_approver_id: p.assigned_approver_id || ''
    });
  };

  const handleSaveDepartmentProfile = async () => {
    setSavingDeptProfile(true);
    try {
      const payload = {
        document_code: deptDraft.document_code,
        revision: deptDraft.revision,
        form_issue_date: deptDraft.form_issue_date,
        title_th: deptDraft.title_th,
        min_preparer_level: Number(deptDraft.min_preparer_level || 4),
        assigned_reviewer_id: deptDraft.assigned_reviewer_id || null,
        assigned_approver_id: deptDraft.assigned_approver_id || null
      };
      const res = await saveVccDocumentProfile(selectedDept, payload);
      setProfiles((prev) => ({ ...prev, [selectedDept]: res.profile || payload }));
      toast.success(`บันทึกแบบฟอร์มควบคุมแผนก ${selectedDept} สำเร็จ`);
    } catch (err) {
      toast.error(err.message || 'บันทึกแบบฟอร์มควบคุมไม่สำเร็จ');
    } finally {
      setSavingDeptProfile(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
        onClick={handleBackdropClick}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="plan-settings-title"
          tabIndex="-1"
          className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full overflow-hidden outline-none flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                <Settings2 size={20} />
              </div>
              <div>
                <h2 id="plan-settings-title" className="text-xl font-bold text-slate-900 tracking-tight">ตั้งค่าแผนประจำปีและเกณฑ์ควบคุม (DCC)</h2>
                <p className="text-xs text-slate-500">จัดการหน่วยงานทวนสอบ, แบบฟอร์มควบคุม และสายการอนุมัติรายแผนก</p>
              </div>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="ปิดหน้าต่าง"
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="px-6 pt-3 border-b border-slate-200 flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`px-4 py-2 text-sm font-semibold rounded-t-xl border-b-2 transition-colors cursor-pointer ${
                activeTab === 'general'
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              ทั่วไปและหน่วยงานทวนสอบ
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('profiles')}
              className={`px-4 py-2 text-sm font-semibold rounded-t-xl border-b-2 transition-colors cursor-pointer ${
                activeTab === 'profiles'
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              แบบฟอร์มควบคุมและผู้รับผิดชอบ (QC / LAB)
            </button>
          </div>

          {/* Content Body */}
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {activeTab === 'general' ? (
              <>
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
                      <option value="END_OF_MONTH">วันสิ้นเดือน</option>
                      <option value="START_OF_MONTH">วันที่ 1 ของเดือน</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
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
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-200 max-h-48 overflow-y-auto">
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

                <div className="pt-4 flex justify-end gap-2.5 border-t border-slate-100">
                  <button type="button" onClick={requestClose} className="h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={onSave}
                    className="h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs"
                  >
                    {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่าทั่วไป'}
                  </button>
                </div>
              </>
            ) : (
              /* Department Profiles Tab */
              <div className="space-y-4">
                {/* Department Selector Pills */}
                <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => handleSelectDept('QC')}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedDept === 'QC'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    แผนก QC (FM-QC-46 R01)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectDept('LB')}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedDept === 'LB'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    แผนก LAB (FM-LB-11 R02)
                  </button>
                </div>

                <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 text-xs text-indigo-800 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-indigo-600" />
                    <span>นโยบายความปลอดภัยและแยกข้อมูลเฉพาะแผนก:</span>
                  </div>
                  <p>การตั้งค่านี้แยกอิสระระหว่างแผนก ไม่ส่งผลกระทบต่อกัน และตรวจสอบระดับสิทธิ์สดกับ Central RBAC</p>
                </div>

                {loadingProfiles ? (
                  <div className="py-8 text-center text-sm text-slate-500">กำลังโหลดข้อมูลแบบฟอร์ม...</div>
                ) : (
                  <div className="space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">รหัสแบบฟอร์มควบคุม (Document Code)</label>
                        <input
                          type="text"
                          value={deptDraft.document_code}
                          onChange={(e) => setDeptDraft({ ...deptDraft, document_code: e.target.value })}
                          placeholder={selectedDept === 'QC' ? 'FM-QC-46' : 'FM-LB-11'}
                          className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">ครั้งที่แก้ไข (Revision)</label>
                        <input
                          type="text"
                          value={deptDraft.revision}
                          onChange={(e) => setDeptDraft({ ...deptDraft, revision: e.target.value })}
                          placeholder={selectedDept === 'QC' ? '01' : '02'}
                          className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-medium"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">วันที่เริ่มใช้แบบฟอร์ม (Form Issue Date)</label>
                        <input
                          type="text"
                          value={deptDraft.form_issue_date}
                          onChange={(e) => setDeptDraft({ ...deptDraft, form_issue_date: e.target.value })}
                          placeholder={selectedDept === 'QC' ? '2026-06-09 (09/06/2569)' : '2026-08-10 (10/08/2026)'}
                          className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">ระดับขั้นต่ำของผู้จัดทำ (Prepared By)</label>
                        <select
                          value={deptDraft.min_preparer_level}
                          onChange={(e) => setDeptDraft({ ...deptDraft, min_preparer_level: Number(e.target.value) })}
                          className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-medium bg-white"
                        >
                          <option value="4">L4+ (Supervisor ขึ้นไป)</option>
                          <option value="5">L5+ (Assistant Manager ขึ้นไป)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">ชื่อทางการของแบบฟอร์ม (Document Title)</label>
                      <input
                        type="text"
                        value={deptDraft.title_th}
                        onChange={(e) => setDeptDraft({ ...deptDraft, title_th: e.target.value })}
                        placeholder="ชื่อแบบฟอร์มภาษาไทย..."
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-medium"
                      />
                    </div>

                    {/* Authorized Reviewer Assignment */}
                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-slate-800">
                          ผู้ทบทวนที่ได้รับมอบหมาย (Authorized Reviewer)
                        </label>
                        <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                          {selectedDept === 'QC' ? 'ฝ่ายผลิต (PD L5+)' : 'ห้องแล็บ (LB L5+)'}
                        </span>
                      </div>
                      <select
                        value={deptDraft.assigned_reviewer_id}
                        onChange={(e) => setDeptDraft({ ...deptDraft, assigned_reviewer_id: e.target.value })}
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-medium bg-white"
                      >
                        <option value="">-- ไม่ระบุ / กำหนดรายบุคคลตอนจัดทำแผน --</option>
                        {(selectedDept === 'QC' ? candidates.qc_reviewers : candidates.lab_reviewers).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.position || 'เจ้าหน้าที่'}) — {u.department} L{u.approval_level}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-500">
                        {selectedDept === 'QC'
                          ? 'ผู้ทบทวน QC ต้องเป็นผู้ช่วยผู้จัดการฝ่ายผลิต (PD L5) ที่ได้รับมอบหมายข้ามแผนกแบบ Task-Scoped'
                          : 'ผู้ทบทวน LAB ต้องเป็นผู้ช่วยผู้จัดการห้องปฏิบัติการ (LAB L5)'}
                      </p>
                    </div>

                    {/* Authorized Approver Assignment */}
                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-slate-800">
                          ผู้อนุมัติที่ได้รับมอบหมาย (Authorized Approver)
                        </label>
                        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                          ฝ่ายบริหาร (MGT L6+)
                        </span>
                      </div>
                      <select
                        value={deptDraft.assigned_approver_id}
                        onChange={(e) => setDeptDraft({ ...deptDraft, assigned_approver_id: e.target.value })}
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-medium bg-white"
                      >
                        <option value="">-- ไม่ระบุ / กำหนดรายบุคคลตอนจัดทำแผน --</option>
                        {candidates.approvers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.position || 'ผู้บริหาร'}) — MGT L{u.approval_level}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-500">
                        ผู้อนุมัติต้องสังกัดฝ่ายบริหาร (MGT) และมีระดับ L6 ขึ้นไปตามเกณฑ์อำนาจอนุมัติ
                      </p>
                    </div>

                    <div className="pt-3 flex justify-end gap-2.5 border-t border-slate-100">
                      <button type="button" onClick={requestClose} className="h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer">
                        ปิด
                      </button>
                      <button
                        type="button"
                        disabled={savingDeptProfile}
                        onClick={handleSaveDepartmentProfile}
                        className="h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs"
                      >
                        {savingDeptProfile ? 'กำลังบันทึก...' : `บันทึกแบบฟอร์มแผนก ${selectedDept}`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
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

export const PlanHistoryModal = ({ open, onClose, history = [] }) => {
  const {
    dialogRef,
    requestClose,
    handleBackdropClick
  } = useVccModalAccessibility({
    isOpen: open,
    onClose
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-history-title"
        tabIndex="-1"
        className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden outline-none"
      >
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between">
          <h2 id="plan-history-title" className="text-xl font-bold text-slate-900 tracking-tight">ประวัติการอนุมัติและแก้ไขแผน (Audit Log)</h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="ปิดหน้าต่าง"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
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
                    <span className="text-xs text-slate-500 font-sans">{formatVccDateTime(h.at)} • {h.actor_name || h.actor_id}</span>
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

  const isDirty = Object.values(customReasons).some((r) => Boolean(r?.trim()));

  const {
    dialogRef,
    requestClose,
    handleBackdropClick,
    showConfirmDiscard,
    confirmDiscard,
    cancelDiscard
  } = useVccModalAccessibility({
    isOpen: open,
    onClose,
    isDirty
  });

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
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
        onClick={handleBackdropClick}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="unplanned-justification-title"
          tabIndex="-1"
          className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh] outline-none"
        >
          <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between shrink-0">
            <div>
              <h2 id="unplanned-justification-title" className="text-lg font-bold text-slate-900 tracking-tight">
                ระบุเหตุผลที่ไม่วางแผนทวนสอบในปีนี้
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                เครื่องมือที่ไม่มีรอบทวนสอบ ต้องระบุเหตุผลประกอบก่อนส่งขออนุมัติแผนตามข้อกำหนด QMS
              </p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="ปิดหน้าต่าง"
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
              onClick={requestClose}
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

    <VccDiscardConfirmDialog
      isOpen={showConfirmDiscard}
      onConfirm={confirmDiscard}
      onCancel={cancelDiscard}
    />
  </>
);
};

export { LegacyGroupConversionModal as DraftGroupConversionModal } from './LegacyGroupConversionModal';

