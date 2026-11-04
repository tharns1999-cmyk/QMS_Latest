import React, { useState, useMemo, useId } from 'react';
import { X, Settings } from 'lucide-react';
import { useVccModalAccessibility } from '../hooks/useVccModalAccessibility';
import { VccDiscardConfirmDialog } from './VccDiscardConfirmDialog';

const serializeSettings = (props) => JSON.stringify({
  monthlyDueSoonText: String(props.monthlyDueSoonText ?? ''),
  monthlyOverdueText: String(props.monthlyOverdueText ?? ''),
  annualDueSoonText: String(props.annualDueSoonText ?? ''),
  annualOverdueText: String(props.annualOverdueText ?? ''),
  reviewSlaDays: String(props.reviewSlaDays ?? ''),
  escalationL1Days: Number(props.escalationL1Days ?? 1),
  escalationL2Days: Number(props.escalationL2Days ?? 7),
  escalationL3Days: Number(props.escalationL3Days ?? 14),
  gracePeriodDays: Number(props.gracePeriodDays ?? 3)
});

/**
 * VccNotificationSettingsModal
 * Modal dialog for configuring DCC notification policies and reviewer SLA.
 */
export default function VccNotificationSettingsModal({
  isOpen,
  onClose,
  onSubmit,
  monthlyDueSoonText,
  setMonthlyDueSoonText,
  monthlyOverdueText,
  setMonthlyOverdueText,
  annualDueSoonText,
  setAnnualDueSoonText,
  annualOverdueText,
  setAnnualOverdueText,
  reviewSlaDays,
  setReviewSlaDays,
  escalationL1Days = 1,
  setEscalationL1Days,
  escalationL2Days = 7,
  setEscalationL2Days,
  escalationL3Days = 14,
  setEscalationL3Days,
  gracePeriodDays = 3,
  setGracePeriodDays,
  saving = false
}) {
  const titleId = useId();
  const isCurrentlyOpen = Boolean(isOpen);
  const [prevOpen, setPrevOpen] = useState(isCurrentlyOpen);
  const currentProps = {
    monthlyDueSoonText,
    monthlyOverdueText,
    annualDueSoonText,
    annualOverdueText,
    reviewSlaDays,
    escalationL1Days,
    escalationL2Days,
    escalationL3Days,
    gracePeriodDays
  };

  const [initialSnapshot, setInitialSnapshot] = useState(() => (isCurrentlyOpen ? serializeSettings(currentProps) : null));

  if (isCurrentlyOpen !== prevOpen) {
    setPrevOpen(isCurrentlyOpen);
    setInitialSnapshot(isCurrentlyOpen ? serializeSettings(currentProps) : null);
  }

  const isDirty = useMemo(() => {
    if (!isCurrentlyOpen || !initialSnapshot) return false;
    return serializeSettings(currentProps) !== initialSnapshot;
  }, [
    isCurrentlyOpen,
    initialSnapshot,
    monthlyDueSoonText,
    monthlyOverdueText,
    annualDueSoonText,
    annualOverdueText,
    reviewSlaDays,
    escalationL1Days,
    escalationL2Days,
    escalationL3Days,
    gracePeriodDays
  ]);

  const {
    dialogRef,
    requestClose,
    handleBackdropClick,
    showConfirmDiscard,
    confirmDiscard,
    cancelDiscard
  } = useVccModalAccessibility({
    isOpen,
    onClose,
    isDirty,
    discardTitle: 'การตั้งค่าการแจ้งเตือนยังไม่ได้บันทึก',
    discardMessage: 'คุณมีการแก้ไขค่าแจ้งเตือนหรือ SLA ที่ยังไม่ได้บันทึก ต้องการยกเลิกและปิดหน้าต่างใช่หรือไม่?'
  });

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4"
        onClick={handleBackdropClick}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex="-1"
          className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 border border-slate-200/80 animate-in fade-in zoom-in-95 duration-150 outline-none"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-200/60 font-bold">
                <Settings size={16} />
              </div>
              <div>
                <h3 id={titleId} className="text-base font-bold text-slate-900">
                  ตั้งค่ากติกาวันแจ้งเตือนล่วงหน้าและเลยกำหนด (DCC)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  กำหนดจำนวนวันสำหรับรอบการแจ้งเตือนงานสอบเทียบและ SLA
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

        <form onSubmit={onSubmit} className="space-y-3.5 text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              งานรายเดือน — แจ้งเตือนล่วงหน้า (วัน คั่นด้วยจุลภาค)
            </label>
            <input
              type="text"
              aria-label="งานรายเดือน แจ้งเตือนล่วงหน้า"
              value={monthlyDueSoonText}
              onChange={(e) => setMonthlyDueSoonText(e.target.value)}
              placeholder="เช่น 7, 3"
              className="w-full h-9 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              งานรายเดือน — แจ้งเตือนเมื่อเลยกำหนด (วัน คั่นด้วยจุลภาค)
            </label>
            <input
              type="text"
              aria-label="งานรายเดือน แจ้งเตือนเลยกำหนด"
              value={monthlyOverdueText}
              onChange={(e) => setMonthlyOverdueText(e.target.value)}
              placeholder="เช่น 1, 3, 7"
              className="w-full h-9 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              งานรายปี — แจ้งเตือนล่วงหน้า (วัน คั่นด้วยจุลภาค)
            </label>
            <input
              type="text"
              aria-label="งานรายปี แจ้งเตือนล่วงหน้า"
              value={annualDueSoonText}
              onChange={(e) => setAnnualDueSoonText(e.target.value)}
              placeholder="เช่น 30, 14, 7"
              className="w-full h-9 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              งานรายปี — แจ้งเตือนเมื่อเลยกำหนด (วัน คั่นด้วยจุลภาค)
            </label>
            <input
              type="text"
              aria-label="งานรายปี แจ้งเตือนเลยกำหนด"
              value={annualOverdueText}
              onChange={(e) => setAnnualOverdueText(e.target.value)}
              placeholder="เช่น 1, 7, 14"
              className="w-full h-9 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              SLA รอผู้ตรวจรับ (วัน)
            </label>
            <input
              type="number"
              min={1}
              max={60}
              aria-label="SLA รอผู้ตรวจรับ"
              value={reviewSlaDays}
              onChange={(e) => setReviewSlaDays(e.target.value)}
              className="w-full h-9 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 bg-white"
            />
          </div>

          <div className="pt-2 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-800 mb-2">
              เกณฑ์การยกระดับแจ้งเตือน (Escalation Multi-tier & Grace Period)
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Overdue L1 (วัน)
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  aria-label="เกณฑ์ Overdue L1"
                  value={escalationL1Days}
                  onChange={(e) => setEscalationL1Days && setEscalationL1Days(Number(e.target.value))}
                  className="w-full h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Overdue L2 (วัน)
                </label>
                <input
                  type="number"
                  min={2}
                  max={60}
                  aria-label="เกณฑ์ Overdue L2"
                  value={escalationL2Days}
                  onChange={(e) => setEscalationL2Days && setEscalationL2Days(Number(e.target.value))}
                  className="w-full h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Overdue L3 วิกฤต (วัน)
                </label>
                <input
                  type="number"
                  min={3}
                  max={90}
                  aria-label="เกณฑ์ Overdue L3"
                  value={escalationL3Days}
                  onChange={(e) => setEscalationL3Days && setEscalationL3Days(Number(e.target.value))}
                  className="w-full h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  ระยะผ่อนผันหลังรับทราบ (วัน)
                </label>
                <input
                  type="number"
                  min={1}
                  max={14}
                  aria-label="ระยะผ่อนผัน Grace Period"
                  value={gracePeriodDays}
                  onChange={(e) => setGracePeriodDays && setGracePeriodDays(Number(e.target.value))}
                  className="w-full h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-900 bg-white"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={requestClose}
              className="h-9 px-4 rounded-xl border border-slate-200 text-slate-700 text-xs sm:text-sm font-medium hover:bg-slate-50 cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              data-testid="vcc-save-notification-settings-btn"
              className="h-9 px-5 rounded-xl bg-indigo-600 text-white text-xs sm:text-sm font-medium hover:bg-indigo-700 shadow-xs cursor-pointer disabled:opacity-60 transition-colors"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกกติกาแจ้งเตือน'}
            </button>
          </div>
        </form>
      </div>
    </div>

    <VccDiscardConfirmDialog
      isOpen={showConfirmDiscard}
      onConfirm={confirmDiscard}
      onCancel={cancelDiscard}
      title="การตั้งค่าการแจ้งเตือนยังไม่ได้บันทึก"
      message="คุณมีการแก้ไขค่าแจ้งเตือนหรือ SLA ที่ยังไม่ได้บันทึก ต้องการยกเลิกและปิดหน้าต่างใช่หรือไม่?"
    />
  </>
  );
}
