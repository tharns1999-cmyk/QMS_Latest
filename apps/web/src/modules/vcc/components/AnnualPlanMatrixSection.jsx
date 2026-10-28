import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Plus } from 'lucide-react';
import { getPlanStatusLabel } from '../utils/planLabels';
import { fetchVccAssets } from '../api/vccApi';
import {
  fetchVccPlanSettings,
  saveVccPlanSettings,
  fetchVccPlans,
  fetchVccPlanDetail,
  computeDueDateForMonth,
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
import { fetchVccWorkOrders, createVccWorkOrder } from '../api/vccWorkOrderApi';
import {
  PlanFormModal,
  PlanItemModal,
  PlanWorkflowModal,
  GroupWorkOrderModal,
  PlanSettingsModal,
  PlanHistoryModal
} from './AnnualPlanModals';
import AnnualPlanWorkspaceHeader from './AnnualPlanWorkspaceHeader';
import AnnualPlanApprovalStepper from './AnnualPlanApprovalStepper';
import AnnualPlanMatrixTable from './AnnualPlanMatrixTable';
import SmartAssetImportModal from './SmartAssetImportModal';

const AnnualPlanMatrixSection = ({ activeDepartments }) => {
  const [statusTab, setStatusTab] = useState('DRAFT');
  const [filterYear, setFilterYear] = useState('');
  const [filterDept, setFilterDept] = useState('');

  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [planDetail, setPlanDetail] = useState(null);
  const [planWorkOrders, setPlanWorkOrders] = useState([]);
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
    plan_year: new Date().getFullYear(),
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
  const [smartImportOpen, setSmartImportOpen] = useState(false);

  const loadPlanWorkOrders = useCallback(async (planId) => {
    if (!planId) {
      setPlanWorkOrders([]);
      return;
    }
    try {
      const statuses = ['OPEN', 'PENDING_REVIEW', 'REJECTED', 'CLOSED', 'CANCELLED'];
      const results = await Promise.all(
        statuses.map((st) => fetchVccWorkOrders({ plan_id: planId, status: st }).catch(() => []))
      );
      const holdRes = await fetchVccWorkOrders({ plan_id: planId, nc_status: 'OPEN' }).catch(() => []);
      const map = new Map();
      [...results.flat(), ...holdRes].forEach((w) => {
        if (w && w.id) map.set(w.id, w);
      });
      setPlanWorkOrders(Array.from(map.values()));
    } catch {
      setPlanWorkOrders([]);
    }
  }, []);

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
        const [detail] = await Promise.all([
          fetchVccPlanDetail(targetId),
          loadPlanWorkOrders(targetId)
        ]);
        setPlanDetail(detail);
      } else {
        setPlanDetail(null);
        setPlanWorkOrders([]);
      }
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถโหลดแผนการสอบเทียบประจำปีได้');
    } finally {
      setLoading(false);
    }
  }, [statusTab, filterYear, filterDept, loadPlanWorkOrders]);

  useEffect(() => {
    loadPlansAndMeta();
  }, [loadPlansAndMeta]);

  const handleSelectPlan = async (planId) => {
    setSelectedPlanId(planId);
    setWorkflowBannerError('');
    try {
      const [detail] = await Promise.all([
        fetchVccPlanDetail(planId),
        loadPlanWorkOrders(planId)
      ]);
      setPlanDetail(detail);
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถโหลดรายละเอียดแผนได้');
    }
  };

  const openCreatePlan = (overrideYear = null) => {
    const currentYear = new Date().getFullYear();
    const targetYear = overrideYear ? Number(overrideYear) : (filterYear ? Number(filterYear) : currentYear);
    const targetDept = filterDept || activeDepartments[0]?.code || '';
    setEditingPlan(null);
    setPlanFormError('');
    setPlanForm({
      plan_year: targetYear,
      department: targetDept,
      document_code: planSettings.default_doc_code || 'FM-QC-46',
      revision: '01',
      title: `แผนการทวนสอบเครื่องมือประจำปี ${targetYear}`,
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

  const handleQuickAddMonth = async (item, month) => {
    if (!planDetail?.plan) return;
    const currentMonths = item.planned_months || [];
    if (currentMonths.includes(month)) return;
    const updatedMonths = [...currentMonths, month].sort((a, b) => a - b);
    await saveVccPlanItem(planDetail.plan.id, {
      asset_id: item.asset_id,
      provider_name: item.provider_name,
      frequency_label: item.frequency_label || 'รายปี',
      planned_months: updatedMonths,
      responsible_dept: item.responsible_dept,
      responsible_label: item.responsible_label || '',
      remarks: item.remarks || ''
    });
    toast.success(`เพิ่มเป้าหมายเดือน ${month} สำหรับ ${item.asset_code} แล้ว`);
    const refreshed = await fetchVccPlanDetail(planDetail.plan.id);
    setPlanDetail(refreshed);
  };

  const handleQuickRemoveMonth = async (item, month) => {
    if (!planDetail?.plan) return;
    const currentMonths = item.planned_months || [];
    if (!currentMonths.includes(month)) return;
    if (currentMonths.length <= 1) {
      throw new Error('ต้องมีรอบการทวนสอบอย่างน้อย 1 เดือน หากต้องการนำเครื่องมือออก กรุณากดปุ่มลบรายการ');
    }
    const updatedMonths = currentMonths.filter((m) => m !== month);
    await saveVccPlanItem(planDetail.plan.id, {
      asset_id: item.asset_id,
      provider_name: item.provider_name,
      frequency_label: item.frequency_label || 'รายปี',
      planned_months: updatedMonths,
      responsible_dept: item.responsible_dept,
      responsible_label: item.responsible_label || '',
      remarks: item.remarks || ''
    });
    toast.success(`ยกเลิกรอบเดือน ${month} สำหรับ ${item.asset_code} แล้ว`);
    const refreshed = await fetchVccPlanDetail(planDetail.plan.id);
    setPlanDetail(refreshed);
  };

  const handleCreateWorkOrder = async (item, month) => {
    if (!planDetail?.plan) return;
    if (Number(item.is_group) === 1) {
      openGroupWorkOrderCheck(item);
      return;
    }
    const dueDate = computeDueDateForMonth(
      planDetail.plan.plan_year,
      month,
      planDetail.plan.due_date_rule || 'END_OF_MONTH'
    );
    await createVccWorkOrder({
      mode: 'FROM_PLAN',
      plan_id: planDetail.plan.id,
      plan_item_id: item.id,
      planned_month: month,
      asset_id: item.asset_id,
      provider_name: item.provider_name,
      due_date: dueDate
    });
    toast.success(`เปิดใบสั่งงานเดือน ${month} สำหรับ ${item.asset_code} แล้ว`);
    const refreshed = await fetchVccPlanDetail(planDetail.plan.id);
    setPlanDetail(refreshed);
    await loadPlanWorkOrders(planDetail.plan.id);
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

  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const dynamicBaseYears = [
      currentYear - 1,
      currentYear,
      currentYear + 1,
      currentYear + 2,
      currentYear + 3
    ];
    const planYears = plans.map((p) => Number(p.plan_year)).filter(Boolean);
    const filterYr = filterYear ? [Number(filterYear)] : [];
    const yearSet = new Set([...dynamicBaseYears, ...planYears, ...filterYr]);
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [plans, filterYear]);

  return (
    <div className="space-y-3" data-testid="annual-plan-matrix">
      <AnnualPlanWorkspaceHeader
        statusTab={statusTab}
        setStatusTab={setStatusTab}
        filterYear={filterYear}
        setFilterYear={setFilterYear}
        availableYears={availableYears}
        filterDept={filterDept}
        setFilterDept={setFilterDept}
        activeDepartments={activeDepartments}
        plans={plans}
        selectedPlanId={selectedPlanId}
        onSelectPlan={handleSelectPlan}
        activePlan={activePlan}
        planItems={planItems}
        canEditPlan={canEditPlan}
        onOpenSettings={openSettings}
        onOpenCreatePlan={openCreatePlan}
        onOpenEditPlan={openEditPlan}
        onOpenHistory={() => setHistoryOpen(true)}
      />

      {workflowBannerError && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2 shadow-2xs">
          <AlertTriangle size={15} className="text-rose-600 shrink-0" />
          <span>{workflowBannerError}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-sm text-slate-500 shadow-2xs">
          กำลังโหลดตารางแผนการทวนสอบเครื่องมือประจำปี...
        </div>
      ) : !activePlan ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center space-y-3 shadow-2xs">
          <div className="text-base font-bold text-slate-700">
            {filterYear
              ? `ไม่พบแผนการทวนสอบประจำปี ${filterYear} ในสถานะ “${getPlanStatusLabel(statusTab)}”`
              : `ไม่พบแผนการทวนสอบประจำปีในสถานะ “${getPlanStatusLabel(statusTab)}”`}
          </div>
          <p className="text-xs text-slate-500">
            {filterYear
              ? `ยังไม่มีแผนสำหรับปี ${filterYear} (พ.ศ. ${Number(filterYear) + 543}) คุณสามารถสร้างแผนใหม่ได้ทันที`
              : 'เลือกสถานะอื่นจากตัวกรองด้านบน หรือสร้างแผนประจำปีใหม่'}
          </p>
          <button
            type="button"
            onClick={() => openCreatePlan(filterYear)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
          >
            <Plus size={13} />
            <span>สร้างแผนประจำปีใหม่</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <AnnualPlanApprovalStepper
            activePlan={activePlan}
            thresholds={thresholds}
            canEditPlan={canEditPlan}
            onSubmitPlan={handleSubmitPlan}
            onOpenWorkflowModal={openWorkflowModal}
          />

          <AnnualPlanMatrixTable
            planItems={planItems}
            activePlan={activePlan}
            workOrders={planWorkOrders}
            canEditPlan={canEditPlan}
            onOpenAddItem={openAddItem}
            onDeleteItem={handleDeleteItem}
            onOpenGroupWorkOrderCheck={openGroupWorkOrderCheck}
            onOpenSmartImport={() => setSmartImportOpen(true)}
            onQuickAddMonth={handleQuickAddMonth}
            onQuickRemoveMonth={handleQuickRemoveMonth}
            onCreateWorkOrder={handleCreateWorkOrder}
          />
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

      <SmartAssetImportModal
        open={smartImportOpen}
        onClose={() => setSmartImportOpen(false)}
        plan={activePlan}
        activeAssets={activeAssets}
        existingPlanItems={planItems}
        providers={providers}
        activeDepartments={activeDepartments}
        onImportSuccess={(refreshed) => setPlanDetail(refreshed)}
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
