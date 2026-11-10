import React, { useState } from 'react';
import { X, Settings2, Trash2 } from 'lucide-react';
import { useVccModalAccessibility } from '../hooks/useVccModalAccessibility';
import { VccDiscardConfirmDialog } from './VccDiscardConfirmDialog';
import VccDocumentProfilesSummary from './VccDocumentProfilesSummary';

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
  onSave,
  currentUser
}) => {
  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'profiles'
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

  if (!open) return null;

  const addProvider = () => {
    const trimmed = newProvider.trim();
    if (!trimmed || draftProviders.includes(trimmed)) return;
    setDraftProviders([...draftProviders, trimmed]);
    setNewProvider('');
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
              แบบฟอร์มและผู้รับผิดชอบตามแผนก
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
              <VccDocumentProfilesSummary currentUser={currentUser} />
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

