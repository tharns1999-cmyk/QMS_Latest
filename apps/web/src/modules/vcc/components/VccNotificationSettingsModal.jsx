import React from 'react';
import { X, Settings } from 'lucide-react';

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
  saving = false
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 border border-slate-200/80 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-200/60 font-bold">
              <Settings size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                ตั้งค่ากติกาวันแจ้งเตือนล่วงหน้าและเลยกำหนด (DCC)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                กำหนดจำนวนวันสำหรับรอบการแจ้งเตือนงานสอบเทียบและ SLA
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
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

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
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
  );
}
