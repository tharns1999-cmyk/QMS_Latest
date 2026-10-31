import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, Plus } from 'lucide-react';
import { getPlanStatusLabel } from '../utils/planLabels';
import { fetchVccAssets, fetchVccAssetDetail } from '../api/vccApi';
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
  convertVccPlanGroupItem,
  validateVccPlanItemWorkOrder,
  submitVccPlan,
  isUserAuthorizedForPlanDept
} from '../api/vccPlanApi';
import { fetchVccWorkOrders, createVccWorkOrder } from '../api/vccWorkOrderApi';
import {
  PlanFormModal,
  PlanItemModal,
  PlanSubmitModal,
  GroupWorkOrderModal,
  PlanSettingsModal,
  PlanHistoryModal,
  UnplannedJustificationModal,
  DraftGroupConversionModal
} from './AnnualPlanModals';
import AnnualPlanWorkspaceHeader from './AnnualPlanWorkspaceHeader';
import AnnualPlanMatrixTable from './AnnualPlanMatrixTable';
import SmartAssetImportModal from './SmartAssetImportModal';
import useStore from '../../../store/useStore';

const AnnualPlanMatrixSection = ({ activeDepartments }) => {
  const { currentUser, masterUsers, tasks } = useStore();
  const [searchParams] = useSearchParams();
  const queryTab = searchParams.get('tab');
  const queryId = searchParams.get('id');

  const initialTab = useMemo(() => {
    if (queryTab) return queryTab;
    const vccTasks = (tasks || []).filter(
      (t) => (t.referenceType === 'VCC_PLAN' || String(t.type || t.taskType).startsWith('VCC_PLAN_') || t.planId) &&
             t.status !== 'COMPLETED'
    );
    const hasRevise = vccTasks.some(
      (t) => (t.taskType === 'VCC_PLAN_REVISE' || t.type === 'Revise') &&
             (!t.assigneeId || t.assigneeId === currentUser?.id || t.assigneeId === currentUser?.empId)
    );
    if (hasRevise) return 'REJECTED';
    const hasReview = vccTasks.some(
      (t) => (t.taskType === 'VCC_PLAN_REVIEW' || t.type === 'Review') &&
             (!t.assigneeId || t.assigneeId === currentUser?.id || t.assigneeId === currentUser?.empId)
    );
    if (hasReview) return 'PENDING_REVIEW';
    const hasApprove = vccTasks.some(
      (t) => (t.taskType === 'VCC_PLAN_APPROVE' || t.type === 'Approve') &&
             (!t.assigneeId || t.assigneeId === currentUser?.id || t.assigneeId === currentUser?.empId)
    );
    if (hasApprove) return 'PENDING_APPROVAL';
    return 'DRAFT';
  }, [queryTab, tasks, currentUser]);

  const [statusTab, setStatusTab] = useState(queryTab || initialTab);
  const [filterYear, setFilterYear] = useState('');
  const [filterDept, setFilterDept] = useState('');

  useEffect(() => {
    if (queryTab) {
      setStatusTab((prev) => (prev !== queryTab ? queryTab : prev));
    } else if (queryId) {
      fetchVccPlanDetail(queryId)
        .then((detail) => {
          if (detail?.plan?.status) {
            setStatusTab((prev) => (prev !== detail.plan.status ? detail.plan.status : prev));
          }
        })
        .catch(() => {});
    }
  }, [queryTab, queryId]);

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
  const [justificationModalOpen, setJustificationModalOpen] = useState(false);
  const [groupConversionModal, setGroupConversionModal] = useState(null);
  const [convertingGroup, setConvertingGroup] = useState(false);
  const [planSubmitModalOpen, setPlanSubmitModalOpen] = useState(false);
  const [submittingPlan, setSubmittingPlan] = useState(false);
  const [planSubmitError, setPlanSubmitError] = useState('');

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
        fetchVccAssets({ status: 'ACTIVE', calibratable_only: true })
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
    loadPlansAndMeta(queryId || '');
  }, [loadPlansAndMeta, queryId]);

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
    const updatedMonths = currentMonths.filter((m) => m !== month);
    await saveVccPlanItem(planDetail.plan.id, {
      asset_id: item.asset_id,
      provider_name: item.provider_name || 'ทวนสอบภายใน',
      frequency_label: item.frequency_label || 'รายปี',
      planned_months: updatedMonths,
      responsible_dept: item.responsible_dept || planDetail.plan.department,
      responsible_label: item.responsible_label || '',
      remarks: item.remarks || (updatedMonths.length === 0 ? 'ยังไม่ถึงกำหนดตามรอบความถี่' : '')
    });
    toast.success(`ยกเลิกรอบเดือน ${month} สำหรับ ${item.asset_code} แล้ว`);
    const refreshed = await fetchVccPlanDetail(planDetail.plan.id);
    setPlanDetail(refreshed);
  };

  const handleCreateWorkOrder = async (item, month) => {
    if (!planDetail?.plan) return;
    if (Number(item.is_group) === 1 && item.group_nature !== 'COMPOSITE_SET') {
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

  const openGroupConversion = async (groupItem) => {
    if (!groupItem) return;
    let groupChildren = [];
    try {
      const detail = await fetchVccAssetDetail(groupItem.asset_id || groupItem.id);
      groupChildren = detail?.children || [];
    } catch {
      groupChildren = activeAssets.filter((a) => a.parent_id === groupItem.asset_id);
    }
    setGroupConversionModal({ groupItem, groupChildren });
  };

  const handleSubmitPlan = () => {
    if (!planDetail?.plan) return;
    setWorkflowBannerError('');
    setPlanSubmitError('');
    const items = planDetail.items || [];
    if (items.length === 0) {
      toast.error('กรุณาเพิ่มรายการเครื่องมือในแผนอย่างน้อย 1 รายการก่อนส่งขออนุมัติ');
      return;
    }

    const legacyGroups = items.filter(
      (i) => Number(i.is_group) === 1 && i.group_nature !== 'COMPOSITE_SET'
    );
    if (legacyGroups.length > 0) {
      const codes = legacyGroups.map((g) => g.asset_code).join(', ');
      const msg = `ไม่สามารถส่งทบทวนแผนได้ เนื่องจากยังมีรายการกลุ่มเดิม (${codes}) ค้างอยู่ในแผน กรุณาแปลงเป็นเครื่องมือรายตัวก่อนส่งทบทวน`;
      setWorkflowBannerError(msg);
      toast.error(msg);
      openGroupConversion(legacyGroups[0]);
      return;
    }

    const calibratableUnits = items.filter(
      (i) => Number(i.is_group) === 0 || i.group_nature === 'COMPOSITE_SET'
    );
    const unplannedWithoutJustification = calibratableUnits.filter((item) => {
      const hasPlan = Array.isArray(item.planned_months) && item.planned_months.length > 0;
      const hasRemarks = Boolean(item.remarks && item.remarks.trim());
      return !hasPlan && !hasRemarks;
    });

    if (unplannedWithoutJustification.length > 0) {
      const msg = `มีเครื่องมือที่ยังไม่ได้วางแผนและยังไม่ได้ระบุเหตุผล ${unplannedWithoutJustification.length} รายการ กรุณาระบุเหตุผลก่อนส่งทบทวน`;
      setWorkflowBannerError(msg);
      toast.error(msg);
      setJustificationModalOpen(true);
      return;
    }
    setPlanSubmitModalOpen(true);
  };

  const handleConfirmSubmitPlan = async ({ reviewerId, approverId }) => {
    if (!planDetail?.plan) return;
    setSubmittingPlan(true);
    setPlanSubmitError('');
    setWorkflowBannerError('');
    try {
      await submitVccPlan(planDetail.plan.id, reviewerId, approverId);
      toast.success('ส่งแผนประจำปีเข้าสู่ขั้นตอนรอทบทวน (PENDING_REVIEW) แล้ว');
      setPlanSubmitModalOpen(false);
      setStatusTab('PENDING_REVIEW');
    } catch (err) {
      const msg = err.message || 'ไม่สามารถส่งทบทวนแผนได้';
      setPlanSubmitError(msg);
      setWorkflowBannerError(msg);
      toast.error(msg);
      if (msg.includes('ยังไม่ได้วางแผน') || msg.includes('ระบุเหตุผล')) {
        setPlanSubmitModalOpen(false);
        setJustificationModalOpen(true);
      }
    } finally {
      setSubmittingPlan(false);
    }
  };

  const handleSaveJustifications = async (updates) => {
    if (!planDetail?.plan) return;
    for (const u of updates) {
      const existing = (planDetail.items || []).find((i) => i.asset_id === u.asset_id);
      if (existing) {
        await saveVccPlanItem(planDetail.plan.id, {
          asset_id: u.asset_id,
          provider_name: existing.provider_name || 'ทวนสอบภายใน',
          frequency_label: existing.frequency_label || 'รายปี',
          planned_months: existing.planned_months || [],
          responsible_dept: existing.responsible_dept || planDetail.plan.department,
          responsible_label: existing.responsible_label || '',
          remarks: u.remarks
        });
      }
    }
    toast.success('บันทึกเหตุผลเรียบร้อยแล้ว');
    const refreshed = await fetchVccPlanDetail(planDetail.plan.id);
    setPlanDetail(refreshed);
  };

  const openGroupWorkOrderCheck = async (item) => {
    let childAssets = activeAssets.filter((a) => a.parent_id === item.asset_id && a.status === 'ACTIVE');
    if (childAssets.length === 0) {
      try {
        const detail = await fetchVccAssetDetail(item.asset_id);
        childAssets = (detail?.children || []).filter((a) => a.status === 'ACTIVE');
      } catch {
        childAssets = [];
      }
    }
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
  const planItems = useMemo(() => planDetail?.items || [], [planDetail?.items]);
  const isUserEligibleEditor = useMemo(() => {
    if (!activePlan) return false;
    if (!currentUser) return true;
    const isDeptOk = isUserAuthorizedForPlanDept(currentUser, activePlan.department);
    const lvl = Number(currentUser.approval_level ?? currentUser.approvalLevel ?? 1);
    if (lvl < (thresholds.min_requester_level || 1)) return false;
    if (activePlan.status === 'REJECTED' && activePlan.prepared_by) {
      return (
        currentUser.id === activePlan.prepared_by ||
        Boolean(currentUser.isDcc) ||
        Boolean(currentUser.isQmr) ||
        lvl >= 6 ||
        isDeptOk
      );
    }
    return isDeptOk;
  }, [activePlan, currentUser, thresholds.min_requester_level]);

  const canEditPlan = Boolean(
    activePlan &&
    (activePlan.status === 'DRAFT' || activePlan.status === 'REJECTED') &&
    isUserEligibleEditor
  );

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

  const draftLogicalGroupItems = useMemo(() => {
    if (!canEditPlan) return [];
    return planItems.filter(
      (i) => Number(i.is_group) === 1 && i.group_nature !== 'COMPOSITE_SET'
    );
  }, [canEditPlan, planItems]);

  const handleConfirmConvertGroup = async ({ groupItem, items = [], confirm_remove_empty = false }) => {
    if (!planDetail?.plan || !groupItem) return;
    setConvertingGroup(true);
    try {
      await convertVccPlanGroupItem(planDetail.plan.id, groupItem.id, {
        selections: items,
        items,
        confirm_remove_empty
      });
      toast.success(
        items.length > 0
          ? `แปลงรายการ ${groupItem.asset_code} เป็นเครื่องมือรายตัว ${items.length} รายการเรียบร้อยแล้ว`
          : `นำรายการกลุ่มเดิม ${groupItem.asset_code} ออกจากแผนร่างแล้ว`
      );
      setGroupConversionModal(null);
      setWorkflowBannerError('');
      await loadPlansAndMeta(planDetail.plan.id);
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถแปลงรายการกลุ่มเดิมได้');
    } finally {
      setConvertingGroup(false);
    }
  };

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
        activeAssets={activeAssets}
        canEditPlan={canEditPlan}
        thresholds={thresholds}
        onSubmitPlan={handleSubmitPlan}
        onOpenSettings={openSettings}
        onOpenCreatePlan={openCreatePlan}
        onOpenEditPlan={openEditPlan}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenJustificationModal={() => setJustificationModalOpen(true)}
        onOpenSmartImport={() => setSmartImportOpen(true)}
      />

      {workflowBannerError && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2 shadow-2xs">
          <AlertTriangle size={15} className="text-rose-600 shrink-0" />
          <span>{workflowBannerError}</span>
        </div>
      )}

      {draftLogicalGroupItems.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex flex-wrap items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-600 shrink-0" />
            <span>
              พบรายการกลุ่มเดิม ({draftLogicalGroupItems.map((g) => g.asset_code).join(', ')}) ค้างอยู่ในแผนฉบับร่าง — กรุณาแปลงเป็นเครื่องมือรายตัวและกำหนดเดือนก่อนส่งทบทวนแผน
            </span>
          </div>
          <button
            type="button"
            onClick={() => openGroupConversion(draftLogicalGroupItems[0])}
            className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-colors cursor-pointer shadow-2xs text-xs"
          >
            แปลงเป็นเครื่องมือรายตัว
          </button>
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
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => openCreatePlan(filterYear)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus size={13} />
              <span>สร้างแผนประจำปีใหม่</span>
            </button>
            {(filterYear || filterDept) && (
              <button
                type="button"
                onClick={() => {
                  setFilterYear('');
                  setFilterDept('');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                <span>ล้างตัวกรอง</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <AnnualPlanMatrixTable
            planItems={planItems}
            activePlan={activePlan}
            workOrders={planWorkOrders}
            canEditPlan={canEditPlan}
            filterYear={filterYear}
            setFilterYear={setFilterYear}
            availableYears={availableYears}
            filterDept={filterDept}
            setFilterDept={setFilterDept}
            activeDepartments={activeDepartments}
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

      <PlanSubmitModal
        open={planSubmitModalOpen}
        onClose={() => setPlanSubmitModalOpen(false)}
        plan={activePlan}
        masterUsers={masterUsers}
        thresholds={thresholds}
        currentUser={currentUser}
        onSubmit={handleConfirmSubmitPlan}
        saving={submittingPlan}
        error={planSubmitError}
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

      <UnplannedJustificationModal
        open={justificationModalOpen}
        onClose={() => setJustificationModalOpen(false)}
        unplannedItems={planItems.filter(
          (i) =>
            (Number(i.is_group) === 0 || i.group_nature === 'COMPOSITE_SET') &&
            (i.planned_months || []).length === 0
        )}
        onSaveJustifications={handleSaveJustifications}
      />

      {Boolean(groupConversionModal) && (
        <DraftGroupConversionModal
          open={Boolean(groupConversionModal)}
          onClose={() => setGroupConversionModal(null)}
          groupItem={groupConversionModal?.groupItem || groupConversionModal}
          groupChildren={groupConversionModal?.groupChildren || []}
          activeAssets={activeAssets}
          existingPlanItems={planItems}
          onConfirmConvert={handleConfirmConvertGroup}
          converting={convertingGroup}
        />
      )}
    </div>
  );
};

export default AnnualPlanMatrixSection;
