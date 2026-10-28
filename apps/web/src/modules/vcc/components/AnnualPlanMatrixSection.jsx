import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  Plus,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  Send,
  ShieldCheck,
  XCircle,
  Edit3,
  History,
  FolderTree,
  Clock
} from 'lucide-react';
import { fetchVccAssets } from '../api/vccApi';
import {
  fetchVccPlanSettings,
  saveVccPlanSettings,
  fetchVccPlans,
  fetchVccPlanDetail,
  createVccPlan,
  updateVccPlan,
  saveVccPlanItem,
  deleteVccPlanItem,
  validateVccPlanItemWorkOrder,
  submitVccPlan,
  reviewVccPlan,
  approveVccPlan,
  rejectVccPlan
} from '../api/vccPlanApi';
import {
  PlanFormModal,
  PlanItemModal,
  PlanWorkflowModal,
  GroupWorkOrderModal,
  PlanSettingsModal,
  PlanHistoryModal
} from './AnnualPlanModals';

const PLAN_STATUS_TABS = [
  { key: 'DRAFT', label: 'ร่างแผน (DRAFT)', color: 'bg-slate-800 text-white' },
  { key: 'PENDING_REVIEW', label: 'รอทบทวน (PENDING_REVIEW)', color: 'bg-amber-600 text-white' },
  { key: 'PENDING_APPROVAL', label: 'รออนุมัติ (PENDING_APPROVAL)', color: 'bg-indigo-600 text-white' },
  { key: 'APPROVED', label: 'อนุมัติแล้ว (APPROVED)', color: 'bg-emerald-600 text-white' },
  { key: 'REJECTED', label: 'ส่งกลับแก้ไข (REJECTED)', color: 'bg-rose-600 text-white' }
];

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const AnnualPlanMatrixSection = ({ activeDepartments }) => {
  const [statusTab, setStatusTab] = useState('DRAFT');
  const [filterYear, setFilterYear] = useState('');
  const [filterDept, setFilterDept] = useState('');

  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [planDetail, setPlanDetail] = useState(null);
  const [activeAssets, setActiveAssets] = useState([]);
  const [providers, setProviders] = useState([]);
  const [planSettings, setPlanSettings] = useState({
    default_doc_code: 'FM-QC-46',
    approval_doc_type: 'FM',
    due_date_rule: 'END_OF_MONTH'
  });
  const [thresholds, setThresholds] = useState({
    min_requester_level: 1,
    required_reviewer_level: 4,
    required_approver_level: 5
  });
  const [loading, setLoading] = useState(true);
  const [workflowBannerError, setWorkflowBannerError] = useState('');

  // Modals state
  const [planFormOpen, setPlanFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm, setPlanForm] = useState({
    plan_year: 2026,
    department: '',
    document_code: 'FM-QC-46',
    revision: '01',
    title: '',
    due_date_rule: 'END_OF_MONTH'
  });
  const [planFormError, setPlanFormError] = useState('');
  const [savingPlanForm, setSavingPlanForm] = useState(false);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemForm, setItemForm] = useState({
    asset_id: '',
    provider_name: '',
    frequency_label: 'รายปี',
    planned_months: [1],
    responsible_dept: '',
    responsible_label: 'QC Sup.',
    remarks: ''
  });
  const [itemError, setItemError] = useState('');
  const [savingItem, setSavingItem] = useState(false);

  const [workflowModal, setWorkflowModal] = useState(null);
  const [workflowComment, setWorkflowComment] = useState('');
  const [workflowError, setWorkflowError] = useState('');
  const [savingWorkflow, setSavingWorkflow] = useState(false);

  const [groupCheckModal, setGroupCheckModal] = useState(null);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [groupCheckResult, setGroupCheckResult] = useState(null);
  const [groupCheckError, setGroupCheckError] = useState('');

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftProviders, setDraftProviders] = useState([]);
  const [newProvider, setNewProvider] = useState('');
  const [draftSettings, setDraftSettings] = useState(planSettings);
  const [savingSettings, setSavingSettings] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);

  const loadPlansAndMeta = useCallback(async (preferredPlanId = '') => {
    setLoading(true);
    try {
      const [settingsRes, planList, assetsList] = await Promise.all([
        fetchVccPlanSettings(),
        fetchVccPlans({ status: statusTab, year: filterYear, department: filterDept }),
        fetchVccAssets({ status: 'ACTIVE' })
      ]);
      setProviders(settingsRes.providers || []);
      setPlanSettings(settingsRes.planSettings || {});
      setThresholds(settingsRes.thresholds || { min_requester_level: 1, required_reviewer_level: 4, required_approver_level: 5 });
      setPlans(planList);
      setActiveAssets(assetsList);

      const targetId =
        preferredPlanId && planList.some((p) => p.id === preferredPlanId)
          ? preferredPlanId
          : planList[0]?.id || '';
      setSelectedPlanId(targetId);

      if (targetId) {
        const detail = await fetchVccPlanDetail(targetId);
        setPlanDetail(detail);
      } else {
        setPlanDetail(null);
      }
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถโหลดแผนการสอบเทียบประจำปีได้');
    } finally {
      setLoading(false);
    }
  }, [statusTab, filterYear, filterDept]);

  useEffect(() => {
    loadPlansAndMeta();
  }, [loadPlansAndMeta]);

  const handleSelectPlan = async (planId) => {
    setSelectedPlanId(planId);
    setWorkflowBannerError('');
    try {
      const detail = await fetchVccPlanDetail(planId);
      setPlanDetail(detail);
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถโหลดรายละเอียดแผนได้');
    }
  };

  const openCreatePlan = () => {
    setEditingPlan(null);
    setPlanFormError('');
    setPlanForm({
      plan_year: 2026,
      department: activeDepartments[0]?.code || '',
      document_code: planSettings.default_doc_code || 'FM-QC-46',
      revision: '01',
      title: 'แผนการทวนสอบเครื่องมือประจำปี 2026',
      due_date_rule: planSettings.due_date_rule || 'END_OF_MONTH'
    });
    setPlanFormOpen(true);
  };

  const openEditPlan = (plan) => {
    setEditingPlan(plan);
    setPlanFormError('');
    setPlanForm({
      plan_year: plan.plan_year,
      department: plan.department,
      document_code: plan.document_code,
      revision: plan.revision,
      title: plan.title,
      due_date_rule: plan.due_date_rule
    });
    setPlanFormOpen(true);
  };

  const handleSavePlan = async (e) => {
    e.preventDefault();
    setSavingPlanForm(true);
    setPlanFormError('');
    try {
      if (editingPlan) {
        await updateVccPlan(editingPlan.id, planForm);
        toast.success('บันทึกการแก้ไขหัวแผนประจำปีแล้ว');
        setPlanFormOpen(false);
        await loadPlansAndMeta(editingPlan.id);
      } else {
        const created = await createVccPlan(planForm);
        toast.success(`สร้างแผนประจำปี ${created.plan_year} แล้ว`);
        setPlanFormOpen(false);
        if (statusTab !== 'DRAFT') {
          setStatusTab('DRAFT');
        } else {
          await loadPlansAndMeta(created.id);
        }
      }
    } catch (err) {
      setPlanFormError(err.message || 'ไม่สามารถบันทึกแผนได้');
    } finally {
      setSavingPlanForm(false);
    }
  };

  const openAddItem = (existingItem = null) => {
    setItemError('');
    if (existingItem) {
      setItemForm({
        asset_id: existingItem.asset_id,
        provider_name: existingItem.provider_name,
        frequency_label: existingItem.frequency_label || 'รายปี',
        planned_months: [...(existingItem.planned_months || [1])],
        responsible_dept: existingItem.responsible_dept || activeDepartments[0]?.code || '',
        responsible_label: existingItem.responsible_label || '',
        remarks: existingItem.remarks || ''
      });
    } else {
      setItemForm({
        asset_id: activeAssets[0]?.id || '',
        provider_name: providers[0] || 'ห้องปฏิบัติการภายนอก',
        frequency_label: 'รายปี',
        planned_months: [1],
        responsible_dept: planDetail?.plan?.department || activeDepartments[0]?.code || '',
        responsible_label: 'QC Sup.',
        remarks: ''
      });
    }
    setItemModalOpen(true);
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!planDetail?.plan) return;
    setSavingItem(true);
    setItemError('');
    try {
      await saveVccPlanItem(planDetail.plan.id, itemForm);
      toast.success('บันทึกรายการในตารางแผนประจำปีแล้ว');
      setItemModalOpen(false);
      const refreshed = await fetchVccPlanDetail(planDetail.plan.id);
      setPlanDetail(refreshed);
    } catch (err) {
      setItemError(err.message || 'ไม่สามารถบันทึกรายการได้');
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteItem = async (item) => {
    if (!planDetail?.plan) return;
    try {
      await deleteVccPlanItem(planDetail.plan.id, item.id);
      toast.success(`นำ ${item.asset_code} ออกจากแผนแล้ว`);
      const refreshed = await fetchVccPlanDetail(planDetail.plan.id);
      setPlanDetail(refreshed);
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถลบรายการได้');
    }
  };

  const handleSubmitPlan = async () => {
    if (!planDetail?.plan) return;
    setWorkflowBannerError('');
    try {
      await submitVccPlan(planDetail.plan.id);
      toast.success('ส่งแผนประจำปีเข้าสู่ขั้นตอนรอทบทวน (PENDING_REVIEW) แล้ว');
      setStatusTab('PENDING_REVIEW');
    } catch (err) {
      const msg = err.message || 'ไม่สามารถส่งทบทวนแผนได้';
      setWorkflowBannerError(msg);
      toast.error(msg);
    }
  };

  const openWorkflowModal = (mode) => {
    setWorkflowModal({ mode });
    setWorkflowComment('');
    setWorkflowError('');
    setWorkflowBannerError('');
  };

  const handleConfirmWorkflow = async (e) => {
    e.preventDefault();
    if (!planDetail?.plan || !workflowModal) return;
    setSavingWorkflow(true);
    setWorkflowError('');
    try {
      if (workflowModal.mode === 'REVIEW') {
        await reviewVccPlan(planDetail.plan.id, workflowComment);
        toast.success('ยืนยันการทบทวนแผนแล้ว สถานะเปลี่ยนเป็นรออนุมัติ (PENDING_APPROVAL)');
        setWorkflowModal(null);
        setStatusTab('PENDING_APPROVAL');
      } else if (workflowModal.mode === 'APPROVE') {
        await approveVccPlan(planDetail.plan.id, workflowComment);
        toast.success('อนุมัติแผนประจำปีเรียบร้อยแล้ว (APPROVED)');
        setWorkflowModal(null);
        setStatusTab('APPROVED');
      } else if (workflowModal.mode === 'REJECT') {
        await rejectVccPlan(planDetail.plan.id, workflowComment);
        toast.success('ส่งแผนกลับไปแก้ไข (REJECTED) แล้ว');
        setWorkflowModal(null);
        setStatusTab('REJECTED');
      }
    } catch (err) {
      const msg = err.message || 'ไม่สามารถดำเนินการอนุมัติได้';
      setWorkflowError(msg);
      setWorkflowBannerError(msg);
    } finally {
      setSavingWorkflow(false);
    }
  };

  const openGroupWorkOrderCheck = (item) => {
    const childAssets = activeAssets.filter((a) => a.parent_id === item.asset_id && a.status === 'ACTIVE');
    setGroupCheckModal({ item, childAssets });
    setSelectedChildId('');
    setGroupCheckResult(null);
    setGroupCheckError('');
  };

  const handleValidateGroupWorkOrder = async () => {
    if (!groupCheckModal || !planDetail?.plan) return;
    setGroupCheckError('');
    setGroupCheckResult(null);
    try {
      const res = await validateVccPlanItemWorkOrder(
        planDetail.plan.id,
        groupCheckModal.item.id,
        selectedChildId
      );
      setGroupCheckResult(res);
    } catch (err) {
      setGroupCheckError(err.message || 'ไม่สามารถออกใบสั่งงานจากกลุ่มโดยตรงได้');
    }
  };

  const openSettings = () => {
    setDraftProviders([...providers]);
    setNewProvider('');
    setDraftSettings({ ...planSettings });
    setSettingsOpen(true);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await saveVccPlanSettings({ providers: draftProviders, planSettings: draftSettings });
      setProviders(res.providers);
      setPlanSettings(res.planSettings);
      setThresholds(res.thresholds);
      toast.success('บันทึกการตั้งค่าแผนประจำปีแล้ว');
      setSettingsOpen(false);
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถบันทึกการตั้งค่าได้');
    } finally {
      setSavingSettings(false);
    }
  };

  const activePlan = planDetail?.plan;
  const planItems = planDetail?.items || [];
  const canEditPlan = activePlan && (activePlan.status === 'DRAFT' || activePlan.status === 'REJECTED');

  return (
    <div className="space-y-5">
      {/* Rule Notice Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-950 space-y-1.5">
        <div className="font-bold flex items-center gap-2 text-sm text-amber-900">
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <span>กติกาสำคัญของตารางแผนการทวนสอบเครื่องมือประจำปี (FM-QC-46)</span>
        </div>
        <ul className="list-disc list-inside space-y-0.5 text-amber-900">
          <li>
            <span className="font-bold">สี/จุดในตาราง 12 เดือนแสดงเฉพาะเดือนที่วางแผน (Plan) เท่านั้น</span> ไม่ใช่หลักฐานว่าทวนสอบเสร็จแล้ว (Act. จะขึ้นเมื่อมีใบงานและผลสอบเทียบในรอบถัดไป)
          </li>
          <li>
            <span className="font-bold">เครื่องมือแบบกลุ่ม (เช่น เครื่องชั่ง GRP-SCALE, เวอร์เนียร์ GRP-VERNIER)</span> ต้องแยกรหัสเครื่องมือลูก (รายตัว) ก่อนสร้างใบสั่งงานจริง
          </li>
          <li>
            วันครบกำหนดคำนวณจากเดือนที่วางแผนตามกติกาของแผน (ค่าเริ่มต้น: <span className="font-mono font-bold">END_OF_MONTH</span> วันสิ้นเดือนของเดือนที่วางแผน)
          </li>
        </ul>
      </div>

      {/* Status Tabs & Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="สถานะแผนประจำปี">
            {PLAN_STATUS_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={statusTab === t.key}
                onClick={() => setStatusTab(t.key)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  statusTab === t.key ? t.color : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openSettings}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
            >
              <SlidersHorizontal size={14} />
              <span>ตั้งค่าแผนและเกณฑ์อนุมัติ</span>
            </button>
            <button
              type="button"
              onClick={openCreatePlan}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 cursor-pointer"
            >
              <Plus size={15} />
              <span>สร้างแผนประจำปีใหม่</span>
            </button>
          </div>
        </div>

        {/* Filters & Plan Selector */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
          <select
            aria-label="กรองตามปีของแผน"
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
          >
            <option value="">ทุกปี ค.ศ.</option>
            <option value="2026">ปี 2026 (พ.ศ. 2569)</option>
            <option value="2027">ปี 2027 (พ.ศ. 2570)</option>
          </select>

          <select
            aria-label="กรองแผนตามแผนก"
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
          >
            <option value="">ทุกแผนก (Master Data)</option>
            {activeDepartments.map((d) => (
              <option key={d.code} value={d.code}>{d.code} — {d.nameTh}</option>
            ))}
          </select>

          <div className="md:col-span-2 flex flex-wrap gap-2">
            {plans.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPlan(p.id)}
                className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                  selectedPlanId === p.id
                    ? 'bg-indigo-50 border-indigo-400 text-indigo-900'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                ปี {p.plan_year} • {p.department} ({p.document_code} Rev.{p.revision}) — {p.item_count || 0} รายการ
              </button>
            ))}
          </div>
        </div>
      </div>

      {workflowBannerError && (
        <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle size={16} className="text-rose-600 shrink-0" />
          <span>{workflowBannerError}</span>
        </div>
      )}

      {/* Main Matrix View */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-sm text-slate-500">
          กำลังโหลดตารางแผนการทวนสอบเครื่องมือประจำปี...
        </div>
      ) : !activePlan ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-2">
          <div className="text-base font-bold text-slate-700">
            ไม่พบแผนการทวนสอบประจำปีในสถานะ {statusTab}
          </div>
          <p className="text-xs text-slate-500">
            เลือกแท็บสถานะอื่น หรือกดปุ่ม &ldquo;สร้างแผนประจำปีใหม่&rdquo; ด้านบน
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-5 p-6">
          {/* FM-QC-46 Document Header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-800 font-mono text-xs font-bold">
                  {activePlan.document_code} Rev.{activePlan.revision}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-800 text-xs font-bold">
                  สถานะ: {activePlan.status}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                  กติกาวันครบกำหนด: {activePlan.due_date_rule === 'START_OF_MONTH' ? 'วันที่ 1 ของเดือน' : 'วันสิ้นเดือน (END_OF_MONTH)'}
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                {activePlan.title} — แผนก {activePlan.department} ({activePlan.department_name_th})
              </h2>
              {activePlan.status === 'REJECTED' && activePlan.rejected_reason && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                  เหตุผลที่ส่งกลับแก้ไข: {activePlan.rejected_reason}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                <History size={14} />
                <span>ประวัติการอนุมัติ</span>
              </button>
              {canEditPlan && (
                <>
                  <button
                    type="button"
                    onClick={() => openEditPlan(activePlan)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                  >
                    <Edit3 size={14} />
                    <span>แก้ไขหัวแผน</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openAddItem(null)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>เพิ่มเครื่องมือเข้าแผน</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* FM-QC-46 12-Month Matrix Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                  <th className="py-3 px-3">รายการเครื่องมือวัด</th>
                  <th className="py-3 px-2">หน่วยงานที่ทวนสอบ</th>
                  <th className="py-3 px-2 text-center">Action</th>
                  {MONTHS.map((m) => (
                    <th key={m} className="py-3 px-1.5 text-center w-9 border-l border-slate-200">
                      ด.{m}
                    </th>
                  ))}
                  <th className="py-3 px-3 border-l border-slate-200">วันครบกำหนด / สถานะหลักฐาน</th>
                  <th className="py-3 px-2">ผู้รับผิดชอบ</th>
                  <th className="py-3 px-2">หมายเหตุ</th>
                  <th className="py-3 px-3 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {planItems.map((item) => {
                  const isGroup = Number(item.is_group) === 1;
                  return (
                    <React.Fragment key={item.id}>
                      <tr className="hover:bg-slate-50/70">
                        <td className="py-3 px-3 align-top" rowSpan={2}>
                          <div className="font-mono font-bold text-slate-900 text-sm">{item.asset_code}</div>
                          <div className="font-semibold text-slate-800">{item.asset_name}</div>
                          <div className="text-[11px] text-slate-500">ความถี่: {item.frequency_label}</div>
                          {isGroup ? (
                            <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-bold text-[11px]">
                              <FolderTree size={11} />
                              กลุ่มแม่ (ต้องแยกรหัสลูกก่อนสร้างใบงาน)
                            </span>
                          ) : item.parent_asset_code ? (
                            <span className="mt-1 inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">
                              ลูกของกลุ่ม: {item.parent_asset_code}
                            </span>
                          ) : null}
                        </td>

                        <td className="py-3 px-2 align-top font-medium text-slate-800" rowSpan={2}>
                          {item.provider_name}
                        </td>

                        <td className="py-2 px-2 text-center font-bold bg-indigo-50/60 text-indigo-900 border-b border-slate-200">
                          Plan
                        </td>

                        {MONTHS.map((m) => {
                          const isPlanned = (item.planned_months || []).includes(m);
                          return (
                            <td
                              key={`plan-${item.id}-${m}`}
                              className={`py-2 px-1 text-center border-l border-b border-slate-200 ${
                                isPlanned ? 'bg-indigo-600 text-white font-bold' : 'bg-white text-slate-300'
                              }`}
                            >
                              {isPlanned ? `P${m}` : '-'}
                            </td>
                          );
                        })}

                        <td className="py-3 px-3 align-top border-l border-slate-200" rowSpan={2}>
                          <div className="font-mono font-bold text-slate-800">
                            {(item.due_dates || []).slice(0, 2).join(', ')}
                            {(item.due_dates || []).length > 2 ? ` (+${item.due_dates.length - 2} เดือน)` : ''}
                          </div>
                          <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 font-semibold text-[11px]">
                            <Clock size={11} />
                            วางแผนเท่านั้น • ยังไม่มีหลักฐานใบงาน
                          </span>
                        </td>

                        <td className="py-3 px-2 align-top" rowSpan={2}>
                          <div className="font-bold text-slate-800">{item.responsible_dept}</div>
                          <div className="text-slate-500">{item.responsible_label}</div>
                        </td>

                        <td className="py-3 px-2 align-top text-slate-600" rowSpan={2}>
                          {item.remarks || '-'}
                        </td>

                        <td className="py-3 px-3 align-top text-right" rowSpan={2}>
                          <div className="flex flex-col items-end gap-1">
                            {isGroup && (
                              <button
                                type="button"
                                onClick={() => openGroupWorkOrderCheck(item)}
                                className="px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-800 font-bold hover:bg-purple-100 cursor-pointer"
                              >
                                ตรวจรหัสลูกก่อนออกใบงาน
                              </button>
                            )}
                            {canEditPlan && (
                              <div className="inline-flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => openAddItem(item)}
                                  className="px-2 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                                >
                                  แก้ไข
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(item)}
                                  className="px-2 py-1 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 cursor-pointer"
                                >
                                  ลบ
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Act. Row (Never filled from plan color alone) */}
                      <tr className="bg-slate-50/50">
                        <td className="py-1.5 px-2 text-center font-semibold text-slate-500">Act.</td>
                        {MONTHS.map((m) => (
                          <td key={`act-${item.id}-${m}`} className="py-1.5 px-1 text-center border-l border-slate-200 text-slate-300">
                            -
                          </td>
                        ))}
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 3-Stage Sign-off & Approval Matrix Box */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1 text-xs">
              <div className="font-bold text-slate-700">1. ผู้จัดทำแผน (Requester L{thresholds.min_requester_level}+)</div>
              <div className="text-slate-900 font-semibold">{activePlan.prepared_by_name || activePlan.prepared_by || 'ยังไม่ได้ส่งทบทวน'}</div>
              {canEditPlan && (
                <button
                  type="button"
                  onClick={handleSubmitPlan}
                  className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700 cursor-pointer"
                >
                  <Send size={13} />
                  <span>ส่งทบทวนแผน (Submit)</span>
                </button>
              )}
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1 text-xs">
              <div className="font-bold text-slate-700">2. ผู้ทบทวนแผน (Reviewer L{thresholds.required_reviewer_level}+)</div>
              <div className="text-slate-900 font-semibold">{activePlan.reviewed_by_name || activePlan.reviewed_by || 'รอการทบทวน'}</div>
              {activePlan.status === 'PENDING_REVIEW' && (
                <div className="pt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openWorkflowModal('REVIEW')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-cyan-600 text-white font-bold hover:bg-cyan-700 cursor-pointer"
                  >
                    <CheckCircle2 size={13} />
                    <span>ยืนยันการทบทวน</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openWorkflowModal('REJECT')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700 cursor-pointer"
                  >
                    <XCircle size={13} />
                    <span>ส่งกลับแก้ไข</span>
                  </button>
                </div>
              )}
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1 text-xs">
              <div className="font-bold text-slate-700">3. ผู้อนุมัติแผน (Approver L{thresholds.required_approver_level}+)</div>
              <div className="text-slate-900 font-semibold">{activePlan.approved_by_name || activePlan.approved_by || 'รอการอนุมัติ'}</div>
              {activePlan.status === 'PENDING_APPROVAL' && (
                <div className="pt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openWorkflowModal('APPROVE')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 cursor-pointer"
                  >
                    <ShieldCheck size={13} />
                    <span>อนุมัติแผนประจำปี</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openWorkflowModal('REJECT')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700 cursor-pointer"
                  >
                    <XCircle size={13} />
                    <span>ส่งกลับแก้ไข</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <PlanFormModal
        open={planFormOpen}
        onClose={() => setPlanFormOpen(false)}
        editingPlan={editingPlan}
        form={planForm}
        setForm={setPlanForm}
        error={planFormError}
        saving={savingPlanForm}
        onSubmit={handleSavePlan}
        activeDepartments={activeDepartments}
      />

      <PlanItemModal
        open={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        plan={activePlan}
        itemForm={itemForm}
        setItemForm={setItemForm}
        error={itemError}
        saving={savingItem}
        onSubmit={handleSaveItem}
        activeAssets={activeAssets}
        providers={providers}
        activeDepartments={activeDepartments}
      />

      <PlanWorkflowModal
        modalState={workflowModal}
        onClose={() => setWorkflowModal(null)}
        commentOrReason={workflowComment}
        setCommentOrReason={setWorkflowComment}
        error={workflowError}
        saving={savingWorkflow}
        onConfirm={handleConfirmWorkflow}
      />

      <GroupWorkOrderModal
        modalData={groupCheckModal}
        onClose={() => setGroupCheckModal(null)}
        selectedChildId={selectedChildId}
        setSelectedChildId={setSelectedChildId}
        checkResult={groupCheckResult}
        checkError={groupCheckError}
        onValidate={handleValidateGroupWorkOrder}
      />

      <PlanSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        draftProviders={draftProviders}
        setDraftProviders={setDraftProviders}
        newProvider={newProvider}
        setNewProvider={setNewProvider}
        draftSettings={draftSettings}
        setDraftSettings={setDraftSettings}
        saving={savingSettings}
        onSave={handleSaveSettings}
      />

      <PlanHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        history={planDetail?.history || []}
      />
    </div>
  );
};

export default AnnualPlanMatrixSection;
