import React, { useMemo, useState, useEffect, useId } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { formatVccDueDate, formatVccDate } from '../utils/vccDateUtils';
import { useVccModalAccessibility } from '../hooks/useVccModalAccessibility';
import { useVccMobileViewport } from '../hooks/useVccMobileViewport';
import { VccDiscardConfirmDialog } from './VccDiscardConfirmDialog';
import { getUserDeptCodes, canReadAllVccDepartments } from '../utils/departmentScope';
import useStore from '../../../store/useStore';
import { SearchableSelect } from '../../../shared/components/ui/SearchableSelect';

export const parseRevisionNo = (plan) => {
  if (plan?.revision_no !== undefined && plan?.revision_no !== null) {
    const n = Number(plan.revision_no);
    if (!isNaN(n)) return n;
  }
  if (plan?.revision !== undefined && plan?.revision !== null) {
    const n = parseInt(String(plan.revision).replace(/\D/g, ''), 10);
    if (!isNaN(n)) return n;
  }
  return 0;
};

export const formatRevisionLabel = (plan) => {
  if (plan?.revision) {
    const revStr = String(plan.revision).trim();
    return revStr.toUpperCase().startsWith('REV') ? revStr : `Rev.${revStr.padStart(2, '0')}`;
  }
  if (plan?.revision_no !== undefined && plan?.revision_no !== null) {
    return `Rev.${String(plan.revision_no).padStart(2, '0')}`;
  }
  return 'Rev.01';
};

export const getItemPlannedMonths = (item) => {
  if (Array.isArray(item?.planned_months) && item.planned_months.length > 0) {
    return item.planned_months.map(Number);
  }
  if (Array.isArray(item?.months) && item.months.length > 0) {
    return item.months.map(Number);
  }
  if (item?.planned_month) {
    return [Number(item.planned_month)];
  }
  return [1];
};

export const getBookedMonthsForItem = (item, wos, planId) => {
  return (wos || [])
    .filter((w) => {
      if (w.status === 'CANCELLED' || w.status === 'SCHEDULED') return false;
      const matchPlan = planId ? String(w.plan_id) === String(planId) : true;
      if (!matchPlan) return false;
      const matchItem = (item?.id && w.plan_item_id === item.id) || (item?.asset_id && w.asset_id === item.asset_id);
      return Boolean(matchItem);
    })
    .map((w) => Number(w.planned_month))
    .filter((m) => !isNaN(m) && m > 0);
};

export const getAvailableMonthsForItem = (item, wos, planId) => {
  if (!item) return [];
  const allMonths = getItemPlannedMonths(item);
  const booked = getBookedMonthsForItem(item, wos, planId);
  const remaining = [...allMonths];
  for (const b of booked) {
    const idx = remaining.indexOf(b);
    if (idx !== -1) {
      remaining.splice(idx, 1);
    }
  }
  return remaining;
};

const serializeCreateForm = (f) => JSON.stringify({
  mode: f?.mode || 'ADHOC',
  plan_id: f?.plan_id || '',
  plan_item_id: f?.plan_item_id || '',
  planned_month: f?.planned_month || '',
  child_asset_id: f?.child_asset_id || '',
  asset_id: f?.asset_id || '',
  provider_name: f?.provider_name || '',
  due_date: f?.due_date || ''
});

export const CreateWorkOrderModal = ({
  open,
  onClose,
  form,
  setForm,
  error,
  saving,
  onSubmit,
  approvedPlans,
  planItems,
  individualAssets,
  providers,
  currentUser: propCurrentUser,
  workOrders = []
}) => {
  const titleId = useId();
  const storeUser = useStore((s) => s.currentUser);
  const currentUser = propCurrentUser || storeUser;
  const userDepts = useMemo(() => getUserDeptCodes(currentUser), [currentUser]);
  const canReadAll = useMemo(() => canReadAllVccDepartments(currentUser), [currentUser]);
  const showDeptPrefix = Boolean(canReadAll || userDepts.length > 1);

  const filteredIndividualAssets = useMemo(() => {
    return (individualAssets || []).filter((a) => {
      if (a.status && a.status !== 'ACTIVE') return false;
      if (canReadAll) return true;
      const dept = String(a.department || '').trim().toUpperCase();
      return userDepts.includes(dept);
    });
  }, [individualAssets, canReadAll, userDepts]);

  const filteredApprovedPlans = useMemo(() => {
    const accessible = (approvedPlans || []).filter((p) => {
      if (p.status && p.status !== 'APPROVED') return false;
      if (p.is_current === false || p.is_current === 0) return false;
      if (p.effective_status === 'SUPERSEDED') return false;

      if (canReadAll) return true;
      const dept = String(p.department || '').trim().toUpperCase();
      return userDepts.includes(dept);
    });

    const planMap = new Map();
    for (const p of accessible) {
      const year = p.plan_year || '';
      const dept = String(p.department || '').trim().toUpperCase();
      const key = `${year}-${dept}`;
      const revNum = parseRevisionNo(p);
      const existing = planMap.get(key);
      if (!existing || revNum > parseRevisionNo(existing)) {
        planMap.set(key, p);
      }
    }
    return Array.from(planMap.values());
  }, [approvedPlans, canReadAll, userDepts]);

  const approvedPlanOptions = useMemo(() => {
    return filteredApprovedPlans.map((p) => {
      const revLabel = formatRevisionLabel(p);
      return {
        value: p.id,
        label: `ปี ${p.plan_year} • ${p.department} (${p.title || p.document_code})${revLabel ? ` [${revLabel}]` : ''}`,
        subLabel: `${p.document_code || ''} ${revLabel ? `(${revLabel})` : ''}`.trim(),
        badge: `${p.department} • ${revLabel}`,
        keywords: [p.plan_year, p.department, p.title, p.document_code, revLabel].filter(Boolean)
      };
    });
  }, [filteredApprovedPlans]);

  const availablePlanItems = useMemo(() => {
    if (!form?.plan_id) return [];
    return (planItems || []).filter((it) => {
      const avail = getAvailableMonthsForItem(it, workOrders, form.plan_id);
      return avail.length > 0;
    });
  }, [planItems, workOrders, form?.plan_id]);

  const planItemOptions = useMemo(() => {
    return availablePlanItems.map((it) => {
      const isLegacyGroup = Number(it.is_group) === 1 && it.group_nature !== 'COMPOSITE_SET';
      const isSet = it.group_nature === 'COMPOSITE_SET';
      return {
        value: it.id,
        label: `${it.asset_code} — ${it.asset_name}`,
        subLabel: isLegacyGroup
          ? 'กลุ่มเดิมในประวัติ — ต้องเลือกรหัสเครื่องมือจริง'
          : isSet
          ? 'ชุดเครื่องมือ (Composite Set)'
          : it.remarks || it.acceptance_criteria || '',
        badge: isSet ? 'ชุดเครื่องมือ' : isLegacyGroup ? 'กลุ่มเดิม' : null,
        keywords: [it.asset_code, it.asset_name, it.group_nature, it.remarks].filter(Boolean)
      };
    });
  }, [availablePlanItems]);

  const individualAssetOptions = useMemo(() => {
    return filteredIndividualAssets.map((a) => {
      const prefix = showDeptPrefix && a.department ? `[${a.department}] ` : '';
      const isSet = a.group_nature === 'COMPOSITE_SET';
      const sub = [
        a.serial_no ? `S/N: ${a.serial_no}` : null,
        a.model ? `รุ่น: ${a.model}` : null
      ].filter(Boolean).join(' • ');

      return {
        value: a.id,
        label: `${prefix}${a.asset_code} — ${a.name}${isSet ? ' (ชุดเครื่องมือ)' : ''}`,
        subLabel: sub || null,
        badge: isSet ? 'ชุดเครื่องมือ' : a.department,
        keywords: [prefix, a.asset_code, a.name, a.serial_no, a.model, a.department].filter(Boolean)
      };
    });
  }, [filteredIndividualAssets, showDeptPrefix]);

  const isCurrentlyOpen = Boolean(open);
  const [prevOpen, setPrevOpen] = useState(isCurrentlyOpen);
  const [initialSnapshot, setInitialSnapshot] = useState(() => (isCurrentlyOpen && form ? serializeCreateForm(form) : null));

  if (isCurrentlyOpen !== prevOpen) {
    setPrevOpen(isCurrentlyOpen);
    setInitialSnapshot(isCurrentlyOpen && form ? serializeCreateForm(form) : null);
  }

  const isDirty = useMemo(() => {
    if (!isCurrentlyOpen || !initialSnapshot || !form) return false;
    return serializeCreateForm(form) !== initialSnapshot;
  }, [isCurrentlyOpen, form, initialSnapshot]);

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
    discardTitle: 'ข้อมูลใบสั่งงานยังไม่ได้บันทึก',
    discardMessage: 'คุณมีข้อมูลใบสั่งงานที่กำลังจัดทำ ต้องการยกเลิกและปิดหน้าต่างใช่หรือไม่?'
  });

  const {
    isMobile,
    dragOffset,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  } = useVccMobileViewport({
    containerRef: dialogRef,
    isOpen: open,
    onDismiss: requestClose,
    isDirty
  });

  const selectedPlanItem = (planItems || []).find((i) => i.id === form?.plan_item_id);
  const selectedItemAvailableMonths = useMemo(() => {
    if (!selectedPlanItem) return [];
    return getAvailableMonthsForItem(selectedPlanItem, workOrders, form?.plan_id);
  }, [selectedPlanItem, workOrders, form?.plan_id]);

  useEffect(() => {
    if (open && selectedPlanItem && selectedItemAvailableMonths.length > 0) {
      if (!selectedItemAvailableMonths.includes(Number(form?.planned_month))) {
        setForm?.((prev) => ({ ...prev, planned_month: selectedItemAvailableMonths[0] }));
      }
    }
  }, [open, selectedPlanItem, selectedItemAvailableMonths, form?.planned_month, setForm]);

  useEffect(() => {
    if (open && form?.mode === 'PLAN' && form?.plan_item_id) {
      if (!planItems || planItems.length === 0) return;
      const isAvailable = availablePlanItems.some((it) => it.id === form.plan_item_id);
      if (!isAvailable) {
        setForm?.((prev) => ({ ...prev, plan_item_id: '', planned_month: '' }));
      }
    }
  }, [open, form?.mode, form?.plan_item_id, availablePlanItems, planItems, setForm]);

  const isGroupPlanItem =
    Number(selectedPlanItem?.is_group) === 1 && selectedPlanItem?.group_nature !== 'COMPOSITE_SET';
  const groupChildren = isGroupPlanItem
    ? filteredIndividualAssets.filter((a) => a.parent_id === selectedPlanItem.asset_id)
    : [];

  if (!open) return null;

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
          aria-labelledby={titleId}
          tabIndex="-1"
          style={isMobile && dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined}
          className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden outline-none animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0 duration-200 transition-transform duration-100 ease-out"
        >
          {/* Mobile Drag Handle Bar */}
          <div
            data-testid="vcc-drag-handle"
            className="sm:hidden pt-3 pb-1.5 flex justify-center cursor-grab active:cursor-grabbing select-none shrink-0 bg-slate-50 border-b border-slate-100"
            aria-hidden="true"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="w-12 h-1.5 rounded-full bg-slate-300 active:bg-slate-400 transition-colors" />
          </div>

          <div className="px-5 sm:px-6 py-3.5 sm:py-4.5 border-b border-slate-200 flex items-center justify-between shrink-0">
            <h2 id={titleId} className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">สร้างใบสั่งงานทวนสอบ/สอบเทียบ (Work Order)</h2>
            <button
              type="button"
              onClick={requestClose}
              aria-label="ปิดหน้าต่าง"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer motion-safe:active:scale-[0.96] select-none"
            >
              <X size={20} />
            </button>
          </div>

        <form onSubmit={onSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-y-contain">
          {error && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center gap-2">
              <AlertTriangle size={17} className="text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold">
            <label htmlFor="wo-mode-adhoc" className="inline-flex items-center gap-2 cursor-pointer">
              <input
                id="wo-mode-adhoc"
                type="radio"
                name="wo_mode"
                checked={form.mode === 'ADHOC'}
                onChange={() => setForm({ ...form, mode: 'ADHOC', plan_id: '', plan_item_id: '', asset_id: '' })}
              />
              <span>ใบสั่งงานนอกแผน (Ad-hoc)</span>
            </label>
            <label htmlFor="wo-mode-plan" className="inline-flex items-center gap-2 cursor-pointer">
              <input
                id="wo-mode-plan"
                type="radio"
                name="wo_mode"
                checked={form.mode === 'PLAN'}
                onChange={() => setForm({ ...form, mode: 'PLAN', plan_id: filteredApprovedPlans[0]?.id || '', plan_item_id: '', asset_id: '' })}
              />
              <span>สร้างจากแผนประจำปีที่อนุมัติแล้ว</span>
            </label>
          </div>

          {form.mode === 'PLAN' ? (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">แผนประจำปีที่อนุมัติแล้ว</label>
                <SearchableSelect
                  required
                  value={form.plan_id}
                  onChange={(val) => setForm({ ...form, plan_id: val, plan_item_id: '', asset_id: '' })}
                  options={approvedPlanOptions}
                  placeholder="-- เลือกแผนประจำปีที่อนุมัติแล้ว --"
                  ariaLabel="แผนประจำปีที่อนุมัติแล้ว"
                />
              </div>

              {form.plan_id && (planItems || []).length > 0 && availablePlanItems.length === 0 ? (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-semibold flex items-center gap-2.5">
                  <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                  <span>เครื่องมือทุกรายการในแผนนี้ถูกเปิดใบสั่งงานครบทั้งหมดแล้ว</span>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">รายการในแผนประจำปี</label>
                    <SearchableSelect
                      required
                      value={form.plan_item_id}
                      onChange={(val) => {
                        const item = planItems.find((i) => i.id === val);
                        const avail = getAvailableMonthsForItem(item, workOrders, form.plan_id);
                        setForm({
                          ...form,
                          plan_item_id: val,
                          planned_month: avail[0] || 1,
                          child_asset_id: ''
                        });
                      }}
                      options={planItemOptions}
                      placeholder="-- เลือกรายการเครื่องมือในแผน --"
                      ariaLabel="รายการในแผนประจำปี"
                    />
                  </div>

                  {selectedPlanItem && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">รอบเดือนตามแผน</label>
                        <select
                          value={form.planned_month}
                          onChange={(e) => setForm({ ...form, planned_month: Number(e.target.value) })}
                          className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white"
                        >
                          {(selectedItemAvailableMonths.length > 0 ? selectedItemAvailableMonths : [1]).map((m, idx) => (
                            <option key={`${m}-${idx}`} value={m}>เดือน {m}</option>
                          ))}
                        </select>
                      </div>

                      {isGroupPlanItem && (
                        <div>
                          <label className="block text-sm font-semibold text-indigo-900 mb-1.5">
                            เลือกรหัสเครื่องมือลูกรายตัว <span className="text-rose-600">*</span>
                          </label>
                          <select
                            required
                            value={form.child_asset_id}
                            onChange={(e) => setForm({ ...form, child_asset_id: e.target.value })}
                            className="w-full h-10 px-3.5 rounded-xl border border-indigo-300 text-sm font-medium bg-white"
                          >
                            <option value="">-- เลือกเครื่องมือลูก --</option>
                            {groupChildren.map((ch) => {
                              const prefix = showDeptPrefix && ch.department ? `[${ch.department}] ` : '';
                              return (
                                <option key={ch.id} value={ch.id}>
                                  {prefix}{ch.asset_code} — {ch.name}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  เครื่องมือวัด / ชุดเครื่องมือที่ใช้งานปกติ <span className="text-rose-600">*</span>
                </label>
                <SearchableSelect
                  required
                  ariaLabel="เลือกเครื่องมือรายตัว"
                  value={form.asset_id}
                  onChange={(val) => setForm({ ...form, asset_id: val })}
                  options={individualAssetOptions}
                  placeholder="-- เลือกเครื่องมือหรือชุดเครื่องมือที่ใช้งานปกติ --"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="create-wo-provider-name" className="block text-sm font-semibold text-slate-700 mb-1.5">
                    หน่วยงานที่ทวนสอบ <span className="text-rose-600">*</span>
                  </label>
                  <select
                    id="create-wo-provider-name"
                    required
                    aria-label="หน่วยงานที่ทวนสอบ"
                    value={form.provider_name}
                    onChange={(e) => setForm({ ...form, provider_name: e.target.value })}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white"
                  >
                    <option value="" disabled>-- เลือกหน่วยงานที่ทวนสอบ --</option>
                    {form.provider_name && !providers.includes(form.provider_name) && form.provider_name !== '-- เลือกหน่วยงานที่ทวนสอบ --' && (
                      <option value={form.provider_name}>{form.provider_name}</option>
                    )}
                    {providers.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="create-wo-due-date" className="block text-sm font-semibold text-slate-700 mb-1.5">วันครบกำหนด (YYYY-MM-DD)</label>
                  <input
                    id="create-wo-due-date"
                    type="date"
                    required
                    aria-label="วันครบกำหนด"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium"
                  />
                </div>
              </div>
            </>
          )}

          <div className="pt-3 sm:pt-2 flex flex-col sm:flex-row justify-end gap-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:pb-0">
            <button
              type="button"
              onClick={requestClose}
              className="order-1 sm:order-1 w-full sm:w-auto min-h-[44px] h-11 sm:h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer motion-safe:active:scale-[0.98] select-none whitespace-nowrap shrink-0"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving || (form.mode === 'PLAN' && (!form.plan_item_id || availablePlanItems.length === 0))}
              className="order-2 sm:order-2 w-full sm:w-auto min-h-[44px] h-11 sm:h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs motion-safe:active:scale-[0.98] select-none whitespace-nowrap shrink-0"
            >
              {saving ? 'กำลังสร้าง...' : 'ยืนยันสร้างใบสั่งงาน'}
            </button>
          </div>
        </form>
      </div>
    </div>

    <VccDiscardConfirmDialog
      isOpen={showConfirmDiscard}
      onConfirm={confirmDiscard}
      onCancel={cancelDiscard}
      title="ข้อมูลใบสั่งงานยังไม่ได้บันทึก"
      message="คุณมีข้อมูลใบสั่งงานที่กำลังจัดทำ ต้องการยกเลิกและปิดหน้าต่างใช่หรือไม่?"
    />
  </>
  );
};

export { RecordResultModal } from './RecordResultModal';
export { AmendmentModal } from './AmendmentModal';
export { DigitalRecordModal } from './DigitalRecordModal';

export const WorkOrderActionModal = ({
  modal,
  onClose,
  form,
  setForm,
  error,
  saving,
  currentUser,
  onConfirm,
  onApproveReschedule,
  onRejectReschedule
}) => {
  const mode = modal?.mode;
  const workOrder = modal?.workOrder;
  const isAlertDialog = mode === 'REJECT' || mode === 'CANCEL';

  const isDirty = useMemo(() => {
    return Boolean(form?.text?.trim() || form?.reason?.trim() || (mode === 'RESCHEDULE' && form?.new_due_date && form?.new_due_date !== workOrder?.due_date));
  }, [form, mode, workOrder]);

  const {
    dialogRef,
    requestClose,
    handleBackdropClick,
    showConfirmDiscard,
    confirmDiscard,
    cancelDiscard
  } = useVccModalAccessibility({
    isOpen: Boolean(modal),
    onClose,
    isDirty,
    discardTitle: 'ข้อมูลเหตุผลยังไม่ได้บันทึก',
    discardMessage: 'คุณมีข้อมูลเหตุผลหรือรายละเอียดที่กำลังกรอก ต้องการยกเลิกและปิดหน้าต่างใช่หรือไม่?'
  });

  const {
    isMobile,
    dragOffset,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  } = useVccMobileViewport({
    containerRef: dialogRef,
    isOpen: Boolean(modal),
    onDismiss: requestClose,
    isDirty
  });

  if (!modal) return null;
  const requiresText = mode !== 'APPROVE';
  const missingReason = mode === 'RELEASE_HOLD' && !form.reason?.trim();

  const isSelfRequester = Boolean(
    currentUser?.id &&
    workOrder?.reschedule_requested_by &&
    (currentUser.id === workOrder.reschedule_requested_by || currentUser.username === workOrder.reschedule_requested_by)
  );

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
        onClick={handleBackdropClick}
      >
        <div
          ref={dialogRef}
          role={isAlertDialog ? 'alertdialog' : 'dialog'}
          aria-modal="true"
          aria-labelledby="wo-action-modal-title"
          tabIndex="-1"
          style={isMobile && dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined}
          className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-xl max-w-md w-full max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden outline-none animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0 duration-200 transition-transform duration-100 ease-out"
        >
          {/* Mobile Drag Handle Bar */}
          <div
            data-testid="vcc-drag-handle"
            className="sm:hidden pt-3 pb-1.5 flex justify-center cursor-grab active:cursor-grabbing select-none shrink-0 bg-slate-50 border-b border-slate-100"
            aria-hidden="true"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="w-12 h-1.5 rounded-full bg-slate-300 active:bg-slate-400 transition-colors" />
          </div>

          <div className="px-5 sm:px-6 py-3.5 sm:py-4.5 border-b border-slate-200 flex items-center justify-between shrink-0">
            <h2 id="wo-action-modal-title" className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              {mode === 'RESCHEDULE' && `เลื่อนวันครบกำหนด (${workOrder?.wo_code})`}
              {mode === 'REVIEW_RESCHEDULE' && `พิจารณาคำขอเลื่อนวันครบกำหนด (${workOrder?.wo_code})`}
              {mode === 'APPROVE' && `ตรวจรับผลและอนุมัติปิดใบงาน (${workOrder?.wo_code})`}
              {mode === 'REJECT' && `ส่งกลับแก้ไขผลทวนสอบ (${workOrder?.wo_code})`}
              {mode === 'RELEASE_HOLD' && `อนุมัติปลดระงับเครื่องมือ (${workOrder?.asset_code})`}
              {mode === 'CANCEL' && `ยกเลิกใบสั่งงาน (${workOrder?.wo_code})`}
            </h2>
            <button
              type="button"
              onClick={requestClose}
              aria-label="ปิดหน้าต่าง"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer motion-safe:active:scale-[0.96] select-none"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={onConfirm} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-y-contain">
            {error && (
              <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center gap-2">
                <AlertTriangle size={17} className="text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {mode === 'RESCHEDULE' && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block mb-0.5">วันครบกำหนดเริ่มแรก (Original Due Date):</span>
                    <span className="font-semibold text-slate-900 font-sans" title={`ค.ศ. ${workOrder.original_due_date || workOrder.due_date}`}>
                      {formatVccDueDate(workOrder.original_due_date || workOrder.due_date)}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">(เก็บรักษาถาวรตามนโยบายตรวจสอบย้อนกลับ)</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">วันครบกำหนดปัจจุบัน (Current Due Date):</span>
                    <span className="font-semibold text-indigo-700 font-sans" title={`ค.ศ. ${workOrder.due_date}`}>
                      {formatVccDueDate(workOrder.due_date)}
                    </span>
                  </div>
                </div>

                <div>
                  <label htmlFor="wo-reschedule-new-date" className="block text-sm font-semibold text-slate-700 mb-1.5">
                    วันครบกำหนดใหม่ที่เสนอ (Proposed Due Date) <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="wo-reschedule-new-date"
                    type="date"
                    required
                    aria-label="วันครบกำหนดใหม่ที่เสนอ"
                    value={form.new_due_date}
                    onChange={(e) => setForm({ ...form, new_due_date: e.target.value })}
                    className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium"
                  />
                </div>

                {Boolean(currentUser?.isDcc || currentUser?.is_dcc) && (
                  <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer font-semibold text-indigo-900">
                      <input
                        type="checkbox"
                        id="wo-reschedule-override-chk"
                        checked={Boolean(form.is_direct_override)}
                        onChange={(e) => setForm({ ...form, is_direct_override: e.target.checked })}
                        className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                      />
                      <span>ดำเนินการเลื่อนทันที (DCC Administrative Direct Override)</span>
                    </label>
                    <span className="block text-[11px] text-indigo-700 mt-1 pl-6">
                      สิทธิ์เฉพาะ DCC: ข้ามขั้นตอนขออนุมัติและปรับวันครบกำหนดทันที พร้อมบันทึกหลักฐานใน Audit Trail
                    </span>
                  </div>
                )}

                <div className="p-2.5 rounded-lg bg-indigo-50/60 border border-indigo-100 text-[11px] text-indigo-900 leading-relaxed">
                  * การขอเลื่อนกำหนดต้องได้รับความเห็นชอบจากผู้มีอำนาจ (หัวหน้าฝ่าย L4 ขึ้นไป หรือเจ้าหน้าที่ DCC) และจะถูกบันทึกประวัติการเปลี่ยนแปลงอย่างถาวรใน Audit Trail
                </div>
              </div>
            )}

            {mode === 'REVIEW_RESCHEDULE' && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-3 pb-2 border-b border-slate-200">
                    <div>
                      <span className="text-slate-500 block mb-0.5">วันครบกำหนดเดิม:</span>
                      <span className="font-semibold text-slate-800 font-sans">
                        {formatVccDueDate(workOrder.original_due_date || workOrder.due_date)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-0.5">วันใหม่ที่ขอเสนอ:</span>
                      <span className="font-bold text-indigo-700 font-sans">
                        {formatVccDueDate(workOrder.proposed_due_date)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-0.5">เหตุผลในการขอเลื่อน:</span>
                    <span className="font-medium text-slate-900 leading-relaxed block">
                      {workOrder.reschedule_reason || '-'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                    ยื่นคำขอโดย: <span className="font-semibold text-slate-700">{workOrder.reschedule_requested_by_name || workOrder.reschedule_requested_by || '-'}</span>
                    {workOrder.reschedule_requested_at && ` • ${formatVccDate(workOrder.reschedule_requested_at)}`}
                  </div>
                </div>

                {isSelfRequester && (
                  <div role="alert" className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                    <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">การคัดแยกหน้าที่ (Segregation of Duties)</span>
                      <span>ท่านเป็นผู้ยื่นคำขอเลื่อนกำหนดนี้ ระบบไม่อนุญาตให้อนุมัติตนเองได้ ต้องให้หัวหน้างานฝ่ายหรือ DCC เป็นผู้อนุมัติ</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {mode === 'CANCEL' && (
              <div>
                <p className="text-xs sm:text-sm text-slate-600 mb-3">
                  ยกเลิกเฉพาะใบสั่งงานนี้ รอบในแผนประจำปียังอยู่ และออกใบสั่งงานใหม่ได้ หากต้องตัดรอบออกจากแผนให้ทำผ่านการปรับปรุงแผน
                </p>
                <label htmlFor="wo-cancel-category" className="block text-sm font-semibold text-slate-700 mb-1.5">ประเภทการยกเลิก <span className="text-rose-600">*</span></label>
                <select
                  id="wo-cancel-category"
                  value={form.category || 'MISTAKE_CREATION'}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white"
                >
                  <option value="MISTAKE_CREATION">ออกใบสั่งงานผิดพลาด</option>
                  <option value="AUTHORIZED_CANCEL">ยกเลิกตามการอนุมัติของหัวหน้า</option>
                </select>
              </div>
            )}

            {mode === 'RELEASE_HOLD' && (
              <div>
                <label htmlFor="wo-release-reason" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  เหตุผลการปลดระงับและการแก้ไขที่ทำแล้ว <span className="text-rose-600">*</span>
                </label>
                <textarea
                  id="wo-release-reason"
                  rows={2}
                  required
                  value={form.reason || ''}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="เช่น ซ่อมและสอบเทียบซ้ำผ่าน ใบรับรองเลขที่..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium"
                />
              </div>
            )}

            <div>
              <label htmlFor="wo-action-text" className="block text-sm font-semibold text-slate-700 mb-1.5">
                {mode === 'RESCHEDULE' && 'เหตุผลในการขอเลื่อนวันครบกำหนด'}
                {mode === 'REVIEW_RESCHEDULE' && 'ความเห็นหรือเหตุผลการพิจารณา'}
                {mode === 'APPROVE' && 'ความเห็นผู้ตรวจรับผล (ถ้ามี)'}
                {mode === 'REJECT' && (workOrder.result_status === 'INCONCLUSIVE' ? 'สิ่งที่ต้องตรวจซ้ำ' : 'เหตุผลในการส่งกลับแก้ไขผล')}
                {mode === 'RELEASE_HOLD' && 'ผลการประเมินผลกระทบและการแก้ไข (NC Impact Assessment)'}
                {mode === 'CANCEL' && 'เหตุผลในการยกเลิก'}
                {requiresText && mode !== 'REVIEW_RESCHEDULE' && <span className="text-rose-600"> *</span>}
                {mode === 'REVIEW_RESCHEDULE' && <span className="text-slate-400 font-normal text-xs"> (จำเป็นกรณีไม่อนุมัติ)</span>}
              </label>
              <textarea
                id="wo-action-text"
                rows={3}
                required={requiresText && mode !== 'REVIEW_RESCHEDULE'}
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                placeholder={mode === 'REVIEW_RESCHEDULE' ? 'ระบุความเห็น หรือเหตุผลประกอบกรณีไม่อนุมัติ...' : 'ระบุรายละเอียด...'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium"
              />
            </div>

            {mode === 'REVIEW_RESCHEDULE' ? (
              <div className="pt-3 sm:pt-2 flex flex-col sm:flex-row justify-end gap-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:pb-0">
                <button
                  type="button"
                  onClick={requestClose}
                  className="order-1 sm:order-1 w-full sm:w-auto min-h-[44px] h-11 sm:h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer motion-safe:active:scale-[0.98] select-none whitespace-nowrap shrink-0"
                >
                  ปิด
                </button>
                <button
                  type="button"
                  disabled={saving || !form.text?.trim()}
                  onClick={(e) => onRejectReschedule ? onRejectReschedule(e, workOrder, form.text) : onConfirm(e, 'REJECT')}
                  className="order-2 sm:order-2 w-full sm:w-auto min-h-[44px] h-11 sm:h-10 px-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-700 text-sm font-semibold hover:bg-rose-100 disabled:opacity-50 transition-colors cursor-pointer motion-safe:active:scale-[0.98] select-none whitespace-nowrap shrink-0"
                >
                  {saving ? 'กำลังประมวลผล...' : 'ไม่อนุมัติ (ปฏิเสธ)'}
                </button>
                <button
                  type="button"
                  disabled={saving || isSelfRequester}
                  title={isSelfRequester ? 'ไม่สามารถอนุมัติตนเองได้ (Segregation of Duties)' : 'อนุมัติการขอเลื่อนกำหนด'}
                  onClick={(e) => onApproveReschedule ? onApproveReschedule(e, workOrder, form.text) : onConfirm(e, 'APPROVE')}
                  className="order-3 sm:order-3 w-full sm:w-auto min-h-[44px] h-11 sm:h-10 px-5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-2xs motion-safe:active:scale-[0.98] select-none whitespace-nowrap shrink-0"
                >
                  {saving ? 'กำลังบันทึก...' : 'อนุมัติการเลื่อนกำหนด'}
                </button>
              </div>
            ) : (
              <div className="pt-3 sm:pt-2 flex flex-col sm:flex-row justify-end gap-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:pb-0">
                <button
                  type="button"
                  onClick={requestClose}
                  className="order-1 sm:order-1 w-full sm:w-auto min-h-[44px] h-11 sm:h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer motion-safe:active:scale-[0.98] select-none whitespace-nowrap shrink-0"
                >
                  ปิด
                </button>
                <button
                  type="submit"
                  disabled={saving || (requiresText && !form.text.trim()) || missingReason}
                  className="order-2 sm:order-2 w-full sm:w-auto min-h-[44px] h-11 sm:h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs motion-safe:active:scale-[0.98] select-none whitespace-nowrap shrink-0"
                >
                  {saving ? 'กำลังบันทึก...' : 'ยืนยันการดำเนินการ'}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>

      <VccDiscardConfirmDialog
        isOpen={showConfirmDiscard}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
        title="ข้อมูลเหตุผลยังไม่ได้บันทึก"
        message="คุณมีข้อมูลเหตุผลหรือรายละเอียดที่กำลังกรอก ต้องการยกเลิกและปิดหน้าต่างใช่หรือไม่?"
      />
    </>
  );
};

export const WorkOrderSettingsModal = ({
  open,
  onClose,
  draftSettings,
  setDraftSettings,
  newCriteria,
  setNewCriteria,
  saving,
  onSave
}) => {
  const {
    dialogRef,
    requestClose,
    handleBackdropClick
  } = useVccModalAccessibility({
    isOpen: open,
    onClose,
    isDirty: false
  });

  const {
    isMobile,
    dragOffset,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  } = useVccMobileViewport({
    containerRef: dialogRef,
    isOpen: open,
    onDismiss: requestClose
  });

  if (!open) return null;

  const addCriteria = () => {
    const trimmed = newCriteria.trim();
    if (!trimmed || draftSettings.default_acceptance_criteria.includes(trimmed)) return;
    setDraftSettings({
      ...draftSettings,
      default_acceptance_criteria: [...draftSettings.default_acceptance_criteria, trimmed]
    });
    setNewCriteria('');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wo-settings-title"
        tabIndex="-1"
        style={isMobile && dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined}
        className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden outline-none animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0 duration-200 transition-transform duration-100 ease-out"
      >
        {/* Mobile Drag Handle Bar */}
        <div
          data-testid="vcc-drag-handle"
          className="sm:hidden pt-3 pb-1.5 flex justify-center cursor-grab active:cursor-grabbing select-none shrink-0 bg-slate-50 border-b border-slate-100"
          aria-hidden="true"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-12 h-1.5 rounded-full bg-slate-300 active:bg-slate-400 transition-colors" />
        </div>

        <div className="px-5 sm:px-6 py-3.5 sm:py-4.5 border-b border-slate-200 flex items-center justify-between shrink-0">
          <h2 id="wo-settings-title" className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">ตั้งค่าเกณฑ์ยอมรับและระยะเวลาเก็บเอกสาร (DCC)</h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="ปิดหน้าต่าง"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer motion-safe:active:scale-[0.96] select-none"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-y-contain">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">ระยะเวลาเก็บประวัติใบรับรอง (ปี)</label>
            <input
              type="number"
              min={1}
              max={50}
              value={draftSettings.retention_years}
              onChange={(e) => setDraftSettings({ ...draftSettings, retention_years: Number(e.target.value) })}
              className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">ตัวเลือกเกณฑ์ยอมรับมาตรฐาน (Acceptance Criteria)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCriteria}
                onChange={(e) => setNewCriteria(e.target.value)}
                placeholder="เพิ่มเกณฑ์ยอมรับใหม่..."
                className="flex-1 min-h-[44px] h-11 sm:h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium"
              />
              <button
                type="button"
                onClick={addCriteria}
                className="min-h-[44px] h-11 sm:h-10 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors cursor-pointer motion-safe:active:scale-[0.98] select-none"
              >
                เพิ่ม
              </button>
            </div>
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-200 max-h-40 overflow-y-auto">
              {(draftSettings.default_acceptance_criteria || []).map((c) => (
                <div key={c} className="px-3.5 py-2.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-800">{c}</span>
                  {draftSettings.default_acceptance_criteria.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDraftSettings({
                          ...draftSettings,
                          default_acceptance_criteria: draftSettings.default_acceptance_criteria.filter((x) => x !== c)
                        })
                      }
                      aria-label={`ลบเกณฑ์ ${c}`}
                      className="text-rose-600 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-rose-50 cursor-pointer motion-safe:active:scale-[0.96] select-none"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 sm:pt-2 flex flex-col sm:flex-row justify-end gap-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:pb-0">
            <button
              type="button"
              onClick={requestClose}
              className="order-1 sm:order-1 w-full sm:w-auto min-h-[44px] h-11 sm:h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer motion-safe:active:scale-[0.98] select-none whitespace-nowrap shrink-0"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onSave}
              className="order-2 sm:order-2 w-full sm:w-auto min-h-[44px] h-11 sm:h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs motion-safe:active:scale-[0.98] select-none whitespace-nowrap shrink-0"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

