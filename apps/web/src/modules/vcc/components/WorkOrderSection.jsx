import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  Plus,
  SlidersHorizontal,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  CalendarClock,
  FileCheck2,
  ShieldAlert
} from 'lucide-react';
import { fetchVccAssets } from '../api/vccApi';
import { fetchVccPlanSettings, fetchVccPlans, fetchVccPlanDetail } from '../api/vccPlanApi';
import {
  fetchVccWorkOrderSettings,
  saveVccWorkOrderSettings,
  fetchVccWorkOrders,
  createVccWorkOrder,
  rescheduleVccWorkOrder,
  submitVccWorkOrderResult,
  approveVccWorkOrder,
  rejectVccWorkOrder,
  releaseVccWorkOrderHold
} from '../api/vccWorkOrderApi';
import {
  CreateWorkOrderModal,
  RecordResultModal,
  WorkOrderActionModal,
  WorkOrderSettingsModal
} from './WorkOrderModals';

const WO_TABS = [
  { key: 'OPEN', label: 'เปิดงาน / รอบันทึกผล (OPEN)', color: 'bg-indigo-600 text-white' },
  { key: 'PENDING_REVIEW', label: 'รอตรวจรับผล (PENDING_REVIEW)', color: 'bg-amber-700 text-white' },
  { key: 'REJECTED', label: 'ส่งกลับแก้ไขผล (REJECTED)', color: 'bg-rose-700 text-white' },
  { key: 'CLOSED', label: 'ตรวจรับปิดงานแล้ว (CLOSED)', color: 'bg-emerald-700 text-white' },
  { key: 'ON_HOLD', label: 'เครื่องมือระงับใช้ / NC (ON_HOLD)', color: 'bg-slate-800 text-white' }
];

const WorkOrderSection = ({ activeDepartments }) => {
  const [activeTab, setActiveTab] = useState('OPEN');
  const [filterDept, setFilterDept] = useState('');
  const [workOrders, setWorkOrders] = useState([]);
  const [woSettings, setWoSettings] = useState({
    retention_years: 3,
    approval_doc_type: 'FM',
    default_acceptance_criteria: []
  });
  const [thresholds, setThresholds] = useState({
    min_requester_level: 1,
    required_reviewer_level: 4,
    required_approver_level: 5
  });
  const [individualAssets, setIndividualAssets] = useState([]);
  const [providers, setProviders] = useState([]);
  const [approvedPlans, setApprovedPlans] = useState([]);
  const [selectedPlanItems, setSelectedPlanItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create WO Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    mode: 'ADHOC',
    plan_id: '',
    plan_item_id: '',
    planned_month: 1,
    child_asset_id: '',
    asset_id: '',
    provider_name: '',
    due_date: '2026-06-30'
  });
  const [createError, setCreateError] = useState('');
  const [savingCreate, setSavingCreate] = useState(false);

  // Record Result Modal
  const [resultWo, setResultWo] = useState(null);
  const [resultForm, setResultForm] = useState({
    performed_at: '2026-03-25',
    result_status: 'PASS',
    certificate_no: '',
    acceptance_criteria: '',
    result_remarks: ''
  });
  const [resultError, setResultError] = useState('');
  const [savingResult, setSavingResult] = useState(false);

  // Action Modal (RESCHEDULE | APPROVE | REJECT | RELEASE_HOLD)
  const [actionModal, setActionModal] = useState(null);
  const [actionForm, setActionForm] = useState({ new_due_date: '', text: '' });
  const [actionError, setActionError] = useState('');
  const [savingAction, setSavingAction] = useState(false);

  // Settings Modal
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState(woSettings);
  const [newCriteria, setNewCriteria] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const query =
        activeTab === 'ON_HOLD'
          ? { nc_status: 'OPEN', department: filterDept }
          : { status: activeTab, department: filterDept };

      const [woList, settingsRes, planSettingsRes, indivAssets, appPlans] = await Promise.all([
        fetchVccWorkOrders(query),
        fetchVccWorkOrderSettings(),
        fetchVccPlanSettings(),
        fetchVccAssets({ status: 'ACTIVE', is_group: '0' }),
        fetchVccPlans({ status: 'APPROVED' })
      ]);
      setWorkOrders(woList);
      setWoSettings(settingsRes.settings);
      setThresholds(settingsRes.thresholds);
      setProviders(planSettingsRes.providers || []);
      setIndividualAssets(indivAssets);
      setApprovedPlans(appPlans);
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถโหลดข้อมูลใบสั่งงานได้');
    } finally {
      setLoading(false);
    }
  }, [activeTab, filterDept]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (createForm.mode === 'PLAN' && createForm.plan_id) {
      fetchVccPlanDetail(createForm.plan_id)
        .then((d) => setSelectedPlanItems(d.items || []))
        .catch(() => setSelectedPlanItems([]));
    } else {
      setSelectedPlanItems([]);
    }
  }, [createForm.mode, createForm.plan_id]);

  const openCreateModal = () => {
    setCreateError('');
    setCreateForm({
      mode: 'ADHOC',
      plan_id: approvedPlans[0]?.id || '',
      plan_item_id: '',
      planned_month: 1,
      child_asset_id: '',
      asset_id: individualAssets[0]?.id || '',
      provider_name: providers[0] || 'ห้องปฏิบัติการภายนอก',
      due_date: '2026-06-30'
    });
    setCreateOpen(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setSavingCreate(true);
    setCreateError('');
    try {
      const payload =
        createForm.mode === 'PLAN'
          ? {
              plan_id: createForm.plan_id,
              plan_item_id: createForm.plan_item_id,
              planned_month: createForm.planned_month,
              child_asset_id: createForm.child_asset_id
            }
          : {
              asset_id: createForm.asset_id,
              provider_name: createForm.provider_name,
              due_date: createForm.due_date
            };
      const created = await createVccWorkOrder(payload);
      toast.success(`สร้างใบสั่งงาน ${created.wo_code} แล้ว`);
      setCreateOpen(false);
      if (activeTab !== 'OPEN') setActiveTab('OPEN');
      else await loadData();
    } catch (err) {
      setCreateError(err.message || 'ไม่สามารถสร้างใบสั่งงานได้');
    } finally {
      setSavingCreate(false);
    }
  };

  const openRecordResult = (wo) => {
    setResultWo(wo);
    setResultError('');
    setResultForm({
      performed_at: wo.performed_at || '2026-03-25',
      result_status: wo.result_status === 'PENDING' ? 'PASS' : wo.result_status,
      certificate_no: wo.certificate_no || '',
      acceptance_criteria: wo.acceptance_criteria || woSettings.default_acceptance_criteria?.[0] || '',
      result_remarks: wo.result_remarks || ''
    });
  };

  const handleResultSubmit = async (e) => {
    e.preventDefault();
    if (!resultWo) return;
    setSavingResult(true);
    setResultError('');
    try {
      const updated = await submitVccWorkOrderResult(resultWo.id, resultForm);
      toast.success(`ส่งผลใบสั่งงาน ${updated.wo_code} เข้าสู่คิวตรวจรับแล้ว`);
      setResultWo(null);
      setActiveTab('PENDING_REVIEW');
    } catch (err) {
      setResultError(err.message || 'ไม่สามารถส่งผลการทวนสอบได้');
    } finally {
      setSavingResult(false);
    }
  };

  const openAction = (mode, workOrder) => {
    setActionModal({ mode, workOrder });
    setActionError('');
    setActionForm({
      new_due_date: workOrder.due_date,
      text: ''
    });
  };

  const handleActionConfirm = async (e) => {
    e.preventDefault();
    if (!actionModal) return;
    const { mode, workOrder } = actionModal;
    setSavingAction(true);
    setActionError('');
    try {
      if (mode === 'RESCHEDULE') {
        await rescheduleVccWorkOrder(workOrder.id, {
          new_due_date: actionForm.new_due_date,
          reason: actionForm.text
        });
        toast.success(`เลื่อนวันครบกำหนดของ ${workOrder.wo_code} แล้ว`);
        setActionModal(null);
        await loadData();
      } else if (mode === 'APPROVE') {
        await approveVccWorkOrder(workOrder.id, actionForm.text);
        toast.success(`ตรวจรับและปิดใบสั่งงาน ${workOrder.wo_code} แล้ว`);
        setActionModal(null);
        setActiveTab('CLOSED');
      } else if (mode === 'REJECT') {
        await rejectVccWorkOrder(workOrder.id, actionForm.text);
        toast.success(`ส่งใบสั่งงาน ${workOrder.wo_code} กลับไปแก้ไขแล้ว`);
        setActionModal(null);
        setActiveTab('REJECTED');
      } else if (mode === 'RELEASE_HOLD') {
        await releaseVccWorkOrderHold(workOrder.id, actionForm.text);
        toast.success(`ปลดระงับเครื่องมือ ${workOrder.asset_code} แล้ว`);
        setActionModal(null);
        await loadData();
      }
    } catch (err) {
      setActionError(err.message || 'ไม่สามารถดำเนินการได้');
    } finally {
      setSavingAction(false);
    }
  };

  const openSettings = () => {
    setDraftSettings({ ...woSettings });
    setNewCriteria('');
    setSettingsOpen(true);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await saveVccWorkOrderSettings(draftSettings);
      setWoSettings(res.settings);
      setThresholds(res.thresholds);
      toast.success('บันทึกการตั้งค่าเกณฑ์ยอมรับและอายุเก็บเอกสารแล้ว');
      setSettingsOpen(false);
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถบันทึกการตั้งค่าได้');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="vcc-work-order-section">
      {/* Rule Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 text-sm text-amber-950 space-y-2">
        <div className="font-bold flex items-center gap-2 text-base text-amber-900">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <span>กติกาใบสั่งงานทวนสอบ/สอบเทียบ การตรวจรับผล และการระงับใช้ (ON_HOLD)</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-sm text-amber-900 leading-relaxed font-medium">
          <li>ใบสั่งงานต้องผูกกับ <span className="font-bold">เครื่องมือรายตัว</span> เท่านั้น และต้องกรอก <span className="font-bold">เลขที่ใบรับรอง + เกณฑ์ยอมรับ</span> ก่อนส่งตรวจรับ</li>
          <li>ผู้ตรวจรับผล (<span className="font-mono font-bold">L{thresholds.required_reviewer_level}+</span> คนละคนกับผู้บันทึกผล) ต้องอนุมัติจึงจะปิดงาน (<span className="font-mono font-bold">CLOSED</span>) และอัปเดตแถว <span className="font-mono font-bold">Act.</span> ในตารางแผน</li>
          <li>เมื่อผลเป็น <span className="font-bold text-rose-700">FAIL</span> เครื่องมือจะถูกระงับใช้ (<span className="font-mono font-bold text-rose-700">ON_HOLD</span>) ทันที และต้องให้ผู้อนุมัติระดับ <span className="font-mono font-bold">L{thresholds.required_approver_level}+</span> บันทึกการประเมินผลกระทบก่อนปลดระงับ • อายุเก็บประวัติใบรับรองปัจจุบัน: <span className="font-bold">{woSettings.retention_years} ปี</span></li>
        </ul>
      </div>

      {/* Tabs & Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="สถานะใบสั่งงาน">
            {WO_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={activeTab === t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                  activeTab === t.key ? t.color : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={openSettings}
              className="h-10 inline-flex items-center gap-1.5 px-4 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <SlidersHorizontal size={15} />
              <span>ตั้งค่าเกณฑ์ยอมรับและอายุเก็บเอกสาร</span>
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="h-10 inline-flex items-center gap-1.5 px-4 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 shadow-2xs transition-colors cursor-pointer"
            >
              <Plus size={16} />
              <span>สร้างใบสั่งงานใหม่</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <select
            aria-label="กรองใบสั่งงานตามแผนก"
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white"
          >
            <option value="">ทุกแผนก (Master Data)</option>
            {activeDepartments.map((d) => (
              <option key={d.code} value={d.code}>{d.code} — {d.nameTh}</option>
            ))}
          </select>

          <div className="text-sm font-medium text-slate-500">
            แสดงเฉพาะแท็บ <span className="font-bold text-slate-900">{activeTab}</span> ({workOrders.length} รายการ)
          </div>
        </div>
      </div>

      {/* Work Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500 font-medium">กำลังโหลดข้อมูลใบสั่งงาน...</div>
        ) : workOrders.length === 0 ? (
          <div className="p-12 text-center space-y-1.5">
            <div className="font-bold text-slate-800 text-base">ไม่พบรายการใบสั่งงานในแท็บ {activeTab}</div>
            <p className="text-sm text-slate-500">เลือกแท็บสถานะอื่น หรือกดปุ่ม &ldquo;สร้างใบสั่งงานใหม่&rdquo; ด้านบน</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4">เลขที่ใบงาน</th>
                  <th className="py-3.5 px-4">เครื่องมือวัด (รายตัว)</th>
                  <th className="py-3.5 px-4">วันครบกำหนด</th>
                  <th className="py-3.5 px-4">ผลทวนสอบ / ใบรับรอง / เกณฑ์ยอมรับ</th>
                  <th className="py-3.5 px-4">สถานะ / การระงับใช้</th>
                  <th className="py-3.5 px-4 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {workOrders.map((wo) => (
                  <tr key={wo.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 align-top">
                      <div className="font-mono font-bold text-slate-900 text-sm">{wo.wo_code}</div>
                      <div className="text-xs text-slate-500 font-medium mt-0.5">
                        {wo.plan_year ? `แผนปี ${wo.plan_year} (เดือน ${wo.planned_month})` : 'ใบงานนอกแผน (Ad-hoc)'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 align-top">
                      <div className="font-mono font-bold text-indigo-700 text-sm">{wo.asset_code}</div>
                      <div className="font-semibold text-slate-900">{wo.asset_name}</div>
                      <div className="text-xs text-slate-500 font-medium mt-0.5">แผนก: {wo.department} • {wo.provider_name}</div>
                    </td>

                    <td className="py-3.5 px-4 align-top">
                      <div className="font-mono font-bold text-slate-900 text-sm">{wo.due_date}</div>
                      {wo.due_date !== wo.original_due_date && (
                        <div className="text-xs text-amber-800 font-medium mt-0.5">
                          วันเดิม: <span className="font-mono line-through text-slate-400">{wo.original_due_date}</span> ({wo.reschedule_reason})
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 align-top space-y-1 text-xs sm:text-sm">
                      <div>
                        <span className="font-semibold text-slate-600">ผล:</span>{' '}
                        <span className={`font-bold ${wo.result_status === 'FAIL' ? 'text-rose-700' : wo.result_status === 'PASS' ? 'text-emerald-700' : 'text-slate-600'}`}>
                          {wo.result_status}
                        </span>
                      </div>
                      {wo.certificate_no && (
                        <div>
                          <span className="font-semibold text-slate-600">ใบรับรอง:</span> <span className="font-mono font-semibold text-slate-900">{wo.certificate_no}</span>
                        </div>
                      )}
                      {wo.acceptance_criteria && (
                        <div>
                          <span className="font-semibold text-slate-600">เกณฑ์ยอมรับ:</span> <span className="text-slate-800">{wo.acceptance_criteria}</span>
                        </div>
                      )}
                      {wo.rejected_reason && (
                        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-medium text-xs sm:text-sm">
                          <span className="font-bold">เหตุผลที่ส่งกลับ:</span> {wo.rejected_reason}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 align-top space-y-1.5">
                      <div>
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold">
                          {wo.status}
                        </span>
                      </div>
                      {wo.nc_status === 'OPEN' && (
                        <div>
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-xs font-bold">
                            <ShieldAlert size={13} />
                            <span>ON_HOLD (ระงับใช้ชั่วคราว)</span>
                          </div>
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 align-top text-right">
                      <div className="inline-flex flex-wrap justify-end gap-2 text-xs sm:text-sm">
                        {(wo.status === 'OPEN' || wo.status === 'REJECTED') && (
                          <>
                            <button
                              type="button"
                              onClick={() => openRecordResult(wo)}
                              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors cursor-pointer shadow-2xs"
                            >
                              <FileCheck2 size={14} />
                              <span>บันทึกผลและใบรับรอง</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openAction('RESCHEDULE', wo)}
                              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
                            >
                              <CalendarClock size={14} />
                              <span>เลื่อนวันครบกำหนด</span>
                            </button>
                          </>
                        )}

                        {wo.status === 'PENDING_REVIEW' && (
                          <>
                            <button
                              type="button"
                              onClick={() => openAction('APPROVE', wo)}
                              className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors cursor-pointer shadow-2xs"
                            >
                              <CheckCircle2 size={14} />
                              <span>ตรวจรับปิดงาน</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openAction('REJECT', wo)}
                              className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700 transition-colors cursor-pointer shadow-2xs"
                            >
                              <XCircle size={14} />
                              <span>ส่งกลับแก้ไข</span>
                            </button>
                          </>
                        )}

                        {wo.nc_status === 'OPEN' && (
                          <button
                            type="button"
                            onClick={() => openAction('RELEASE_HOLD', wo)}
                            className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-purple-700 text-white font-semibold hover:bg-purple-800 transition-colors cursor-pointer shadow-2xs"
                          >
                            <ShieldAlert size={14} />
                            <span>ปลดระงับ ON_HOLD (L{thresholds.required_approver_level}+)</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateWorkOrderModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        form={createForm}
        setForm={setCreateForm}
        error={createError}
        saving={savingCreate}
        onSubmit={handleCreateSubmit}
        approvedPlans={approvedPlans}
        planItems={selectedPlanItems}
        individualAssets={individualAssets}
        providers={providers}
      />

      <RecordResultModal
        workOrder={resultWo}
        onClose={() => setResultWo(null)}
        form={resultForm}
        setForm={setResultForm}
        error={resultError}
        saving={savingResult}
        onSubmit={handleResultSubmit}
        criteriaOptions={woSettings.default_acceptance_criteria}
      />

      <WorkOrderActionModal
        modal={actionModal}
        onClose={() => setActionModal(null)}
        form={actionForm}
        setForm={setActionForm}
        error={actionError}
        saving={savingAction}
        onConfirm={handleActionConfirm}
      />

      <WorkOrderSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        draftSettings={draftSettings}
        setDraftSettings={setDraftSettings}
        newCriteria={newCriteria}
        setNewCriteria={setNewCriteria}
        saving={savingSettings}
        onSave={handleSaveSettings}
      />
    </div>
  );
};

export default WorkOrderSection;

