import React, { useState } from 'react';
import { X, CheckCircle, AlertTriangle, ShieldAlert, Info } from 'lucide-react';
import { acknowledgeVccNotification } from '../api/vccNotificationApi';
import { useVccModalAccessibility } from '../hooks/useVccModalAccessibility';
import { VccDiscardConfirmDialog } from './VccDiscardConfirmDialog';

/**
 * VccNotificationAcknowledgementModal
 * Modal allowing authorized users to acknowledge active alerts without mutating WO or Asset states.
 */
export default function VccNotificationAcknowledgementModal({
  isOpen,
  onClose,
  notification,
  onSuccess
}) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isDirty = Boolean(note?.trim());

  const {
    dialogRef,
    requestClose,
    handleBackdropClick,
    showConfirmDiscard,
    confirmDiscard,
    cancelDiscard
  } = useVccModalAccessibility({
    isOpen: Boolean(isOpen && notification),
    onClose,
    isDirty
  });

  if (!isOpen || !notification) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');
    try {
      await acknowledgeVccNotification(notification.id, note);
      if (onSuccess) {
        onSuccess(notification.id);
      }
      onClose();
    } catch (err) {
      setErrorMsg(err?.message || 'ไม่สามารถรับทราบการแจ้งเตือนได้');
    } finally {
      setSubmitting(false);
    }
  };

  const isCritical = notification.severity === 'CRITICAL';
  const isWarning = notification.severity === 'WARNING';

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
        onClick={handleBackdropClick}
      >
        <div
          ref={dialogRef}
          role={isCritical ? 'alertdialog' : 'dialog'}
          aria-modal="true"
          aria-labelledby="ack-modal-title"
          tabIndex="-1"
          className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 border border-slate-200/80 animate-in fade-in zoom-in-95 duration-150 outline-none"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center border font-bold ${
                  isCritical
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : isWarning
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}
              >
                {isCritical ? <ShieldAlert size={18} /> : isWarning ? <AlertTriangle size={18} /> : <Info size={18} />}
              </div>
              <div>
                <h3 id="ack-modal-title" className="text-base font-bold text-slate-900">
                  รับทราบการแจ้งเตือน (Acknowledge)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  รหัสอ้างอิง: {notification.id}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="ปิดหน้าต่าง"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

        {errorMsg && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs font-medium text-rose-700">
            {errorMsg}
          </div>
        )}

        <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/70 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">หัวข้อ:</span>
            <span className="font-semibold text-slate-900 text-right">{notification.title}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">เครื่องมือ / ใบสั่งงาน:</span>
            <span className="font-mono font-medium text-slate-800">
              {notification.asset_code || notification.asset_id}
              {notification.wo_code ? ` (${notification.wo_code})` : ''}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">แผนก:</span>
            <span className="font-semibold text-slate-800">{notification.department}</span>
          </div>
          <div className="pt-1.5 border-t border-slate-200/50 text-slate-600">
            {notification.message}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              บันทึกข้อความ / แผนการดำเนินการ (Optional)
            </label>
            <textarea
              rows={3}
              aria-label="บันทึกข้อความรับทราบ"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น ติดต่อห้องปฏิบัติการแล้ว กำลังดำเนินการจัดส่งเครื่องมือ หรืออยู่ระหว่างรอรายงานผล"
              className="w-full rounded-xl border border-slate-200 p-2.5 text-sm text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 bg-white"
            />
          </div>

          <div className="rounded-xl bg-blue-50/70 border border-blue-200/80 p-3 text-xs text-blue-800">
            <strong>หมายเหตุตามมาตรฐาน QMS:</strong> การกดรับทราบเป็นการยืนยันความรับผิดชอบและการประสานงานเพื่อชะลอการแจ้งเตือนซ้ำในระยะผ่อนผัน โดย<strong>ไม่มีผลเปลี่ยนแปลงสถานะ</strong>ของใบสั่งงานหรือปลดระงับใช้เครื่องมือ
          </div>

          <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={requestClose}
              className="h-9 px-4 rounded-xl border border-slate-200 text-slate-700 text-xs sm:text-sm font-medium hover:bg-slate-50 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              data-testid="confirm-acknowledge-btn"
              className="h-9 px-5 rounded-xl bg-indigo-600 text-white text-xs sm:text-sm font-medium hover:bg-indigo-700 shadow-xs cursor-pointer disabled:opacity-60 transition-colors inline-flex items-center gap-1.5"
            >
              <CheckCircle size={15} />
              <span>{submitting ? 'กำลังบันทึก...' : 'ยืนยันรับทราบ'}</span>
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
}
