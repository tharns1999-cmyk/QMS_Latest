import { isApiMode } from '../../../api/client';
import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, FolderTree, Trash2, X, Send, UserCheck, ShieldCheck, Calendar, FileText, Clock, Lock, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import { computeDueDates, computeDueDateForMonth, fetchVccDocumentProfiles } from '../api/vccPlanApi';
import { formatVccDateTime, formatVccDueDatesList } from '../utils/vccDateUtils';
import { useVccModalAccessibility } from '../hooks/useVccModalAccessibility';
import { VccDiscardConfirmDialog } from './VccDiscardConfirmDialog';
import { AnnualPlanAuditTrailTimeline } from './AnnualPlanAuditTrailTimeline';

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
  const [docProfiles, setDocProfiles] = useState({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    let alive = true;
    if (open) {
      fetchVccDocumentProfiles()
        .then((res) => {
          if (alive && res?.profiles) setDocProfiles(res.profiles);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [open]);

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

  const liveDept = form.department || '';
  const liveYear = form.plan_year ? String(form.plan_year) : '';
  const liveCode = liveDept && liveYear
    ? `VCC-AP-${liveDept}-${liveYear}`
    : (form.document_code && form.document_code.startsWith('VCC-AP-') ? form.document_code : `VCC-AP-${liveDept || '[DEPT]'}-${liveYear || '[YEAR]'}`);
  const liveTitle = form.title || (liveDept && liveYear
    ? `แผนการทวนสอบเครื่องมือประจำปี ${liveYear} (${liveDept})`
    : 'แผนการทวนสอบเครื่องมือประจำปี');

  const handleFormSubmit = (e) => {
    e.preventDefault();
    const finalCode = !editingPlan && liveDept && liveYear ? `VCC-AP-${liveDept}-${liveYear}` : (form.document_code || liveCode);
    const finalTitle = form.title || liveTitle;
    if (!editingPlan && (form.document_code !== finalCode || form.title !== finalTitle)) {
      setForm({
        ...form,
        document_code: finalCode,
        title: finalTitle
      });
    }
    onSubmit(e);
  };

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
          {/* Header */}
          <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 id="plan-form-modal-title" className="text-lg font-bold text-slate-900 tracking-tight">
                {editingPlan ? `แก้ไขหัวแผนประจำปี ${editingPlan.plan_year}` : 'สร้างแผนการทวนสอบเครื่องมือประจำปีใหม่'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {editingPlan
                  ? 'ปรับปรุงข้อมูลหัวแผนงานและกติกาคำนวณวันครบกำหนด'
                  : 'กำหนดแผนกและปีเพื่อเปิดแผนงานดิจิทัลประจำปีฉบับใหม่ (Digital Annual Plan)'}
              </p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="ปิดหน้าต่าง"
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
            {error && (
              <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center gap-2">
                <AlertTriangle size={17} className="text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Row 1: Grid 2 Columns (Department 65%, Year 35%) */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
              {/* Department: 65% width (col-span-8 on sm) */}
              <div className="sm:col-span-8">
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="plan_dept" className="block text-xs font-bold text-slate-700">
                    แผนกเจ้าของแผน <span className="text-rose-600">*</span>
                  </label>
                  {editingPlan && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-semibold bg-slate-100 px-1.5 py-0.5 rounded">
                      <Lock size={10} />
                      <span>ล็อกอัตโนมัติ</span>
                    </span>
                  )}
                </div>
                <select
                  id="plan_dept"
                  required
                  disabled={Boolean(editingPlan) || activeDepartments.length === 0}
                  value={form.department}
                  onChange={(e) => {
                    const dept = e.target.value;
                    const yr = form.plan_year ? String(form.plan_year) : '';
                    if (editingPlan) {
                      setForm({ ...form, department: dept });
                    } else {
                      const prof = (docProfiles && docProfiles[dept]) || {};
                      const code = yr ? `VCC-AP-${dept}-${yr}` : (prof.document_code || `VCC-AP-${dept}`);
                      const title = yr
                        ? (prof.title_th ? `${prof.title_th} ${yr}` : `แผนการทวนสอบเครื่องมือประจำปี ${yr} (${dept})`)
                        : (prof.title_th || `แผนการทวนสอบเครื่องมือประจำปี (${dept})`);
                      setForm({
                        ...form,
                        department: dept,
                        document_code: code,
                        revision: prof.revision || '01',
                        title
                      });
                    }
                  }}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-semibold bg-white disabled:bg-slate-50 text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 cursor-pointer"
                >
                  <option value="" disabled>
                    {activeDepartments.length === 0 ? '-- โหลดแผนกไม่ได้ --' : '-- กรุณาเลือกแผนก --'}
                  </option>
                  {activeDepartments.map((d) => (
                    <option key={d.code} value={d.code}>
                      [{d.code}] {d.nameTh || d.name || d.name_th || d.code}
                    </option>
                  ))}
                </select>
                {activeDepartments.length === 0 && (
                  <p className="mt-1 text-[11px] text-rose-600 font-semibold">
                    ไม่สามารถโหลดแผนกจาก Master Data ได้ กรุณาตรวจสอบข้อมูลแผนกก่อนบันทึก
                  </p>
                )}
              </div>

              {/* Year: 35% width (col-span-4 on sm) */}
              <div className="sm:col-span-4">
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="plan_year" className="block text-xs font-bold text-slate-700">
                    ปี ค.ศ. ของแผน <span className="text-rose-600">*</span>
                  </label>
                  {editingPlan && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-semibold bg-slate-100 px-1.5 py-0.5 rounded">
                      <Lock size={10} />
                      <span>ล็อก</span>
                    </span>
                  )}
                </div>
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
                    const dept = form.department;
                    const isDefaultTitle = !form.title || form.title.startsWith('แผนการทวนสอบเครื่องมือประจำปี');
                    const docCode = dept && yr ? `VCC-AP-${dept}-${yr}` : form.document_code;
                    const nextTitle = isDefaultTitle && yr
                      ? (dept ? `แผนการทวนสอบเครื่องมือประจำปี ${yr} (${dept})` : `แผนการทวนสอบเครื่องมือประจำปี ${yr}`)
                      : form.title;
                    setForm({
                      ...form,
                      plan_year: yr,
                      document_code: docCode,
                      title: nextTitle
                    });
                  }}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold font-mono text-slate-800 disabled:bg-slate-50 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
                <p className="mt-1 text-[11px] text-slate-500 font-medium">
                  {form.plan_year && Number.isInteger(Number(form.plan_year)) && Number(form.plan_year) >= 2000 && Number(form.plan_year) <= 2100
                    ? `ตรงกับ พ.ศ. ${Number(form.plan_year) + 543}`
                    : 'รองรับ ค.ศ. 2000–2100'}
                </p>
              </div>
            </div>

            {/* Row 2: Live Preview Card */}
            <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/40 via-white to-slate-50 p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <FileText size={14} className="text-indigo-600" />
                  <span>เอกสารดิจิทัลควบคุม (Digital Plan Preview)</span>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                  <ShieldCheck size={11} className="text-emerald-600" /> ISO 9001:2015 Cl. 7.5
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-indigo-50">
                <div>
                  <div className="text-[11px] text-slate-500 font-medium">รหัสแผนงานดิจิทัล / ฉบับแก้ไข:</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-sm font-bold text-indigo-950 tracking-tight">
                      {liveCode}
                    </span>
                    <span className="text-[10px] font-mono font-bold bg-indigo-100/70 text-indigo-700 px-1.5 py-0.2 rounded border border-indigo-200">
                      Rev.{form.revision || '01'}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 font-medium">กติกาครบกำหนด:</div>
                  <div className="text-xs font-semibold text-slate-700 mt-0.5">
                    {form.due_date_rule === 'START_OF_MONTH' ? 'วันที่ 1 ของเดือน' : 'วันสิ้นเดือนของรอบที่วาง'}
                  </div>
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-indigo-50/80">
                <div className="text-[11px] text-slate-500 font-medium">ชื่อแผนงานทางการ:</div>
                <div className="text-xs font-semibold text-slate-800 mt-0.5 truncate">
                  {liveTitle}
                </div>
              </div>
            </div>

            {/* Row 3: Collapsible Advanced Settings */}
            <div className="border border-slate-200/80 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full px-4 py-2.5 bg-slate-50/80 hover:bg-slate-100/80 flex items-center justify-between text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Clock size={13} className="text-slate-500" />
                  <span>ตั้งค่าขั้นสูง (Advanced Settings)</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400">
                  <span className="text-[11px] font-normal">
                    {showAdvanced ? 'ซ่อนการตั้งค่า' : 'กติกาครบกำหนด & ปรับแต่งชื่อ'}
                  </span>
                  {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </button>

              <div className={showAdvanced ? 'p-4 bg-white border-t border-slate-200/80 space-y-3.5 animate-in fade-in duration-150' : 'hidden'}>
                {/* Due Date Rule */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    กติกาคำนวณวันครบกำหนด (เมื่อแผนระบุเฉพาะเดือน)
                  </label>
                  <select
                    value={form.due_date_rule}
                    onChange={(e) => setForm({ ...form, due_date_rule: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs font-medium bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="END_OF_MONTH">วันสิ้นเดือนของเดือนที่วางแผน (เช่น ${endOfMonthPreview})</option>
                    <option value="START_OF_MONTH">วันที่ 1 ของเดือนที่วางแผน (เช่น ${startOfMonthPreview})</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-400">
                    ใช้กำหนดเส้นตายการส่งเครื่องมือสอบเทียบอัตโนมัติในใบสั่งงาน
                  </p>
                </div>

                {/* Custom Title Input */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ปรับแต่งชื่อแผนประจำปี (ไม่บังคับ)
                  </label>
                  <input
                    type="text"
                    value={form.title || ''}
                    placeholder={form.plan_year && form.department ? `แผนการทวนสอบเครื่องมือประจำปี ${form.plan_year} (${form.department})` : 'แผนการทวนสอบเครื่องมือประจำปี'}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    เว้นว่างเพื่อใช้ชื่อทางการอัตโนมัติ
                  </p>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
              <button
                type="button"
                onClick={requestClose}
                className="h-9.5 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={saving || activeDepartments.length === 0}
                aria-label={editingPlan ? 'บันทึกการแก้ไข' : 'บันทึกแผนประจำปี'}
                className="h-9.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold shadow-xs disabled:opacity-50 transition-all cursor-pointer flex items-center gap-1.5"
              >
                {saving ? (
                  <span>กำลังบันทึก...</span>
                ) : (
                  <>
                    <span>{editingPlan ? 'บันทึกการแก้ไข' : 'สร้างและเริ่มทำแผน'}</span>
                    {!editingPlan && <ArrowRight size={13} />}
                  </>
                )}
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

          {/* Department-specific metrology fields (ISO 9001 Clause 7.1.5) */}
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
  const planDept = String(plan.department || '').toUpperCase().trim();
  const [workflowProfiles, setWorkflowProfiles] = useState({});
  useEffect(() => { let alive = true; fetchVccDocumentProfiles().then((res) => { if (alive) setWorkflowProfiles(res.profiles || {}); }).catch(() => {}); return () => { alive = false; }; }, []);
  const workflowProfile = isApiMode ? workflowProfiles[planDept] || {} : {};

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
      if (!isApiMode && plan.assigned_reviewer_id && u.id === plan.assigned_reviewer_id) return true;
      if (isApiMode && plan.assigned_reviewer_id && u.id !== plan.assigned_reviewer_id) return false;
      const lvl = Number(u.approval_level || u.level || 0);
      return lvl >= Math.max(minReviewerLevel, workflowProfile.required_reviewer_level || 0) && (plan.assigned_reviewer_id && !workflowProfile.reviewer_dept || isUserEligibleForDept(u, workflowProfile.reviewer_dept || planDept));
    });
  }, [masterUsers, currentUser, planDept, minReviewerLevel, plan.assigned_reviewer_id, workflowProfile]);

  const [selectedReviewerId, setSelectedReviewerId] = useState(
    plan.assigned_reviewer_id || eligibleReviewers[0]?.id || ''
  );

  const eligibleApprovers = useMemo(() => {
    return (masterUsers || []).filter((u) => {
      if (!u || !u.id || String(u.status || '').toUpperCase() === 'INACTIVE') return false;
      if (u.id === currentUser?.id) return false; // SoD: ผู้จัดทำห้ามอนุมัติงานตนเอง
      if (u.id === selectedReviewerId) return false; // 4-Eyes: ผู้ทบทวนห้ามอนุมัติงานที่ตนทบทวน
      if (!isApiMode && plan.assigned_approver_id && u.id === plan.assigned_approver_id) return true;
      if (isApiMode && plan.assigned_approver_id && u.id !== plan.assigned_approver_id) return false;
      const lvl = Number(u.approval_level || u.level || 0);
      return lvl >= Math.max(minApproverLevel, workflowProfile.required_approver_level || 0) && (plan.assigned_approver_id && !workflowProfile.approver_dept || isUserEligibleForDept(u, workflowProfile.approver_dept || planDept));
    });
  }, [masterUsers, currentUser, selectedReviewerId, planDept, minApproverLevel, plan.assigned_approver_id, workflowProfile]);

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
                {plan.title} (Rev.{plan.revision})
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

export { PlanSettingsModal } from './PlanSettingsModal';

export const PlanHistoryModal = ({ open, onClose, history = [], plan = null }) => {
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
        className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full overflow-hidden outline-none"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h2 id="plan-history-title" className="text-lg font-bold text-slate-900 tracking-tight">
            ประวัติการอนุมัติและแก้ไขแผน (Audit Log)
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
        <div className="p-4 sm:p-5 max-h-[75vh] overflow-y-auto">
          <AnnualPlanAuditTrailTimeline
            history={history}
            plan={plan}
            collapsible={false}
            showDrawerButton={false}
            maxHeightClass="max-h-[60vh]"
          />
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

