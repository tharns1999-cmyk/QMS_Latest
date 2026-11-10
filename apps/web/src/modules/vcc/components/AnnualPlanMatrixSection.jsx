import { getUserDeptCodes } from '../utils/departmentScope';
import useVccPolicyUser from '../hooks/useVccPolicyUser';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, Plus } from 'lucide-react';
import { getPlanStatusLabel, isSavedPlanItem } from '../utils/planLabels';
import { fetchVccAssets, fetchVccAssetDetail } from '../api/vccApi';
import {
  fetchVccPlanSettings,
  saveVccPlanSettings,
  fetchVccPlans,
  fetchVccPlanDetail,
  computeDueDateForMonth,
  createVccPlan,
  createVccPlanRevision,
  updateVccPlan,
  saveVccPlanItem,
  deleteVccPlanItem,
  convertVccPlanGroupItem,
  validateVccPlanItemWorkOrder,
  submitVccPlan,
  isUserAuthorizedForPlanDept,
  fetchApprovedPlanPdf,
} from '../api/vccPlanApi';
import { isApiMode } from '../../../api/client';
import { fetchVccWorkOrders, createVccWorkOrder } from '../api/vccWorkOrderApi';
import {
  PlanFormModal,
  PlanItemModal,
  PlanSubmitModal,
  PlanRevisionModal,
  GroupWorkOrderModal,
  PlanSettingsModal,
  PlanHistoryModal,
  UnplannedJustificationModal,
  DraftGroupConversionModal,
} from './AnnualPlanModals';
import AnnualPlanWorkspaceHeader from './AnnualPlanWorkspaceHeader';
import AnnualPlansHub from './AnnualPlansHub';
import AnnualPlanPrintView from './AnnualPlanPrintView';
import { exportAnnualPlansMultiSheet } from '../utils/exportPlanSummary';
import AnnualPlanMatrixTable from './AnnualPlanMatrixTable';
import AnnualPlanQuarterlyView from './AnnualPlanQuarterlyView';
import AnnualPlanViewSwitcher from './AnnualPlanViewSwitcher';
import AnnualPlanOverviewCards from './AnnualPlanOverviewCards';
import { AnnualPlanAuditTrailTimeline } from './AnnualPlanAuditTrailTimeline';
import SmartAssetImportModal from './SmartAssetImportModal';
import useStore from '../../../store/useStore';

const AnnualPlanMatrixSection = ({ activeDepartments = [] }) => {
  const { currentUser: sessionUser, masterUsers, tasks } = useStore();
  const currentUser = useVccPolicyUser(sessionUser);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get('tab');
  const queryId = searchParams.get('id') || searchParams.get('planId');

  const isAnnualPlansHubPath = location?.pathname?.includes('/vcc/annual-plans');
  const [viewState, setViewState] = useState(() => {
    if (queryId) return 'WORKSPACE';
    if (searchParams.get('view') === 'workspace') return 'WORKSPACE';
    if (searchParams.get('view') === 'hub') return 'HUB';
    if (isAnnualPlansHubPath) return 'HUB';
    return 'WORKSPACE';
  });

  useEffect(() => {
    if (queryId) {
      setViewState('WORKSPACE');
      setSelectedPlanId((prev) => (prev !== queryId ? queryId : prev));
    } else if (searchParams.get('view') === 'workspace') {
      setViewState('WORKSPACE');
    } else if (searchParams.get('view') === 'hub' || isAnnualPlansHubPath) {
      setViewState('HUB');
      setSelectedPlanId('');
    }
  }, [queryId, searchParams, isAnnualPlansHubPath]);

  const [printPlan, setPrintPlan] = useState(null);
  const [printPlanItems, setPrintPlanItems] = useState([]);

  const userDept = useMemo(() => {
    return String(currentUser?.department || currentUser?.dept || '').toUpperCase();
  }, [currentUser]);

  const canReadAll = useMemo(() => {
    if (!currentUser) return false;
    const lvl = Number(currentUser.approval_level ?? currentUser.approvalLevel ?? 1);
    return Boolean(currentUser.isDcc || currentUser.isQmr || lvl >= 6);
  }, [currentUser]);

  const canManageSettings = canReadAll;

  const createDepartments = useMemo(() => {
    if (currentUser?.vccReadOnly) return [];
    const enabledDepts = currentUser?.vccEnabledDepartments;
    return activeDepartments.filter((d) => {
      if (enabledDepts && Array.isArray(enabledDepts) && !enabledDepts.includes(d.code)) {
        return false;
      }
      return canReadAll || getUserDeptCodes(currentUser).includes(d.code);
    });
  }, [activeDepartments, currentUser, canReadAll]);

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
  const [filterDept, setFilterDept] = useState(() => (!canReadAll && userDept ? userDept : ''));

  useEffect(() => {
    if (!canReadAll && userDept) {
      setFilterDept(userDept);
    }
  }, [canReadAll, userDept]);

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
  const [viewMode, setViewMode] = useState('MATRIX');
  const [planDetail, setPlanDetail] = useState(null);
  const [planWorkOrders, setPlanWorkOrders] = useState([]);
  const [activeAssets, setActiveAssets] = useState([]);
  const [providers, setProviders] = useState([]);
  const [planSettings, setPlanSettings] = useState({
    default_doc_code: 'VCC-PLAN',
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
    document_code: 'VCC-PLAN',
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
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');
  const [revisionError, setRevisionError] = useState('');
  const [creatingRevision, setCreatingRevision] = useState(false);
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
      const effectiveDept = (!canReadAll && userDept) ? userDept : filterDept;
      const targetStatus = viewState === 'HUB' ? 'ALL' : statusTab;
      const [settingsRes, planList, assetsList] = await Promise.all([
        fetchVccPlanSettings(),
        fetchVccPlans({ status: targetStatus, year: filterYear, department: effectiveDept }),
        fetchVccAssets({ status: 'ACTIVE', calibratable_only: true, department: effectiveDept })
      ]);
      setProviders(settingsRes.providers || []);
      setPlanSettings(settingsRes.planSettings || {});
      setThresholds(settingsRes.thresholds || { min_requester_level: 1, required_reviewer_level: 4, required_approver_level: 5 });
      setPlans(planList);
      setActiveAssets(assetsList);

      const targetId =
        preferredPlanId && planList.some((p) => p.id === preferredPlanId)
          ? preferredPlanId
          : (viewState === 'HUB' && !queryId ? '' : (planList[0]?.id || ''));
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
  }, [statusTab, filterYear, filterDept, canReadAll, userDept, loadPlanWorkOrders, viewState, queryId]);

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

  const handleOpenPlanFromHub = async (planId) => {
    await handleSelectPlan(planId);
    setViewState('WORKSPACE');
    const targetPlan = plans.find((p) => p.id === planId);
    if (targetPlan?.status) {
      setStatusTab(targetPlan.status);
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('id', planId);
      next.delete('planId');
      next.delete('view');
      return next;
    }, { replace: true });
  };

  const handleBackToHub = () => {
    setSelectedPlanId('');
    setViewState('HUB');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('id');
      next.delete('planId');
      if (!isAnnualPlansHubPath) {
        next.set('view', 'hub');
      }
      return next;
    }, { replace: true });
  };

  const handlePrintPlan = async (planToPrint) => {
    const target = planToPrint || planDetail?.plan || plans.find((p) => p.id === selectedPlanId) || plans[0];
    if (!target) {
      toast.error('ไม่พบแผนที่ต้องการพิมพ์');
      return;
    }
    try {
      if (planDetail?.plan?.id === target.id && planDetail?.items) {
        setPrintPlan(target);
        setPrintPlanItems(planDetail.items);
      } else {
        const detail = await fetchVccPlanDetail(target.id);
        setPrintPlan(detail?.plan || target);
        setPrintPlanItems(detail?.items || []);
      }
    } catch (err) {
      toast.error('ไม่สามารถโหลดข้อมูลสำหรับพิมพ์ได้: ' + (err.message || ''));
    }
  };

  const handleExportSummary = async () => {
    try {
      toast.loading('กำลังจัดเตรียมรายงานสรุปทุกแผนก...', { id: 'vcc-export-summary' });
      const itemPromises = plans.map((p) =>
        fetchVccPlanDetail(p.id)
          .then((d) => (d?.items || []).map((i) => ({ ...i, plan_year: p.plan_year, department: p.department })))
          .catch(() => [])
      );
      const allNested = await Promise.all(itemPromises);
      const flattened = allNested.flat();
      exportAnnualPlansMultiSheet(plans, flattened, filterYear || new Date().getFullYear());
      toast.success('ส่งออกรายงานสรุปภาพรวมสำเร็จ', { id: 'vcc-export-summary' });
    } catch (err) {
      toast.error('ส่งออกรายงานสรุปล้มเหลว: ' + (err.message || ''), { id: 'vcc-export-summary' });
    }
  };

  const handleExportPlanExcel = (planToExport) => {
    const target = planToExport || planDetail?.plan || plans[0];
    if (!target) return;
    const items = printPlanItems.length > 0 ? printPlanItems : (planDetail?.items || []);
    exportAnnualPlansMultiSheet([target], items, target.plan_year);
  };

  const openCreatePlan = (overrideYear = null) => {
    const currentYear = new Date().getFullYear();
    // Only a real year counts: a click event or a filter label must not turn into NaN
    const fixedYear = Number.isInteger(Number(overrideYear)) && Number(overrideYear) > 0 ? Number(overrideYear) : null;
    const targetYear = fixedYear || (Number(filterYear) > 0 ? Number(filterYear) : currentYear);
    const targetDept = (!canReadAll && userDept) || filterDept || activeDepartments[0]?.code || 'QC';
    const defaultDocCode = targetDept ? `VCC-PLAN-${targetDept}` : (planSettings.default_doc_code || 'VCC-PLAN');
    setEditingPlan(null);
    setPlanFormError('');
    setPlanForm({
      plan_year: targetYear,
      department: targetDept,
      document_code: defaultDocCode,
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
    if (!isSavedPlanItem(item)) {
      toast(`${item.asset_code} ยังไม่ได้บันทึกเข้าแผน จึงไม่มีรายการให้นำออก (เครื่องมืออยู่ในทะเบียนอยู่แล้ว)`);
      return;
    }
    try {
      await deleteVccPlanItem(planDetail.plan.id, item.id);
      toast.success(`นำ ${item.asset_code} ออกจากแผนแล้ว เครื่องมือยังอยู่ในทะเบียนและจะแสดงเป็นยังไม่ได้วางแผน`);
      const refreshed = await fetchVccPlanDetail(planDetail.plan.id);
      setPlanDetail(refreshed);
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถนำรายการออกจากแผนได้');
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

  const openRevision = () => {
    setRevisionReason('');
    setRevisionError('');
    setRevisionOpen(true);
  };

  const handleCreateRevision = async (e) => {
    e.preventDefault();
    setCreatingRevision(true);
    setRevisionError('');
    try {
      const created = await createVccPlanRevision(activePlan.id, { revision_reason: revisionReason.trim() });
      toast.success(`สร้างแผนปี ${created.plan_year} Rev.${created.revision} (ฉบับร่าง) แล้ว`);
      setRevisionOpen(false);
      if (statusTab !== 'DRAFT') setStatusTab('DRAFT');
      await loadPlansAndMeta(created.id);
    } catch (err) {
      setRevisionError(err.message || 'ไม่สามารถสร้างฉบับแก้ไขได้');
    } finally {
      setCreatingRevision(false);
    }
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
      toast.success('ส่งแผนประจำปีเข้าสู่ขั้นตอนรอทบทวน แล้ว');
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
    if (!canManageSettings) return;
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

  const handleOpenOfficialPdf = async () => {
    if (!planDetail?.plan?.id) return;
    if (!isApiMode) {
      toast.error('การเปิดดูเอกสารทางการ PDF ใช้ได้เมื่อเชื่อมต่อเซิร์ฟเวอร์เท่านั้น');
      return;
    }
    try {
      toast.loading('กำลังโหลดเอกสารทางการ...', { id: 'vcc-pdf' });
      const blob = await fetchApprovedPlanPdf(planDetail.plan.id, 'view');
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      toast.success('เปิดเอกสารสำเร็จ', { id: 'vcc-pdf' });
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถเปิดเอกสารทางการได้', { id: 'vcc-pdf' });
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

  // A new revision can only start from the plan in force (the server checks the same), by someone who may edit this department's plans
  const canRevisePlan = Boolean(
    isApiMode &&
    activePlan &&
    activePlan.status === 'APPROVED' &&
    Number(activePlan.is_current) === 1 &&
    activePlan.effective_status !== 'SUPERSEDED' &&
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
      {viewState === 'HUB' ? (
        <AnnualPlansHub
          plans={plans}
          activeAssets={activeAssets}
          activeDepartments={activeDepartments}
          filterYear={filterYear}
          setFilterYear={setFilterYear}
          filterDept={filterDept}
          setFilterDept={setFilterDept}
          onOpenPlan={handleOpenPlanFromHub}
          onOpenCreatePlan={() => openCreatePlan(filterYear)}
          onExportSummary={handleExportSummary}
          onPrintPlan={handlePrintPlan}
          onExportPlanExcel={handleExportPlanExcel}
          onOpenHistory={(plan) => { handleSelectPlan(plan.id); setHistoryOpen(true); }}
          canCreatePlan={!currentUser?.vccReadOnly}
        />
      ) : (
        <>
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
            canCreatePlan={!currentUser?.vccReadOnly}
            canEditPlan={canEditPlan}
            thresholds={thresholds}
            onSubmitPlan={handleSubmitPlan}
            onOpenRevision={canRevisePlan ? openRevision : undefined}
            canManageSettings={canManageSettings}
            onOpenSettings={canManageSettings ? openSettings : undefined}
            onOpenCreatePlan={openCreatePlan}
            onOpenEditPlan={openEditPlan}
            onOpenHistory={() => setHistoryOpen(true)}
            onOpenJustificationModal={() => setJustificationModalOpen(true)}
            onOpenSmartImport={() => setSmartImportOpen(true)}
            onOpenOfficialPdf={handleOpenOfficialPdf}
            onBackToHub={handleBackToHub}
            onPrintPlan={() => handlePrintPlan(activePlan)}
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
            <div className="space-y-3">
              {/* Plan Overview KPI Cards */}
              <AnnualPlanOverviewCards
                planItems={planItems}
                activePlan={activePlan}
                activeAssets={activeAssets}
                canEditPlan={canEditPlan}
                onOpenJustificationModal={() => setJustificationModalOpen(true)}
                onOpenSmartImport={() => setSmartImportOpen(true)}
              />

              {/* Segmented View Switcher */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-0.5">
                <AnnualPlanViewSwitcher
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                />
              </div>

              {/* View 1: 12-Month Matrix View (Primary / Default) */}
              {(viewMode === 'MATRIX' || viewMode === 'LIST') && (
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
                  onOpenJustificationModal={() => setJustificationModalOpen(true)}
                />
              )}

              {/* View 2: Quarterly Grouped View */}
              {viewMode === 'QUARTERLY' && (
                <AnnualPlanQuarterlyView
                  planItems={planItems}
                  activePlan={activePlan}
                  workOrders={planWorkOrders}
                  canEditPlan={canEditPlan}
                  onCreateWorkOrder={handleCreateWorkOrder}
                  onOpenJustificationModal={() => setJustificationModalOpen(true)}
                />
              )}

              {/* Audit Trail Timeline Section (Bottom of Workspace) */}
              <AnnualPlanAuditTrailTimeline
                history={planDetail?.history || []}
                plan={activePlan}
              />
            </div>
          )}
        </>
      )}

      {printPlan && (
        <AnnualPlanPrintView
          plan={printPlan}
          items={printPlanItems}
          onClose={() => setPrintPlan(null)}
          onExportExcel={() => handleExportPlanExcel(printPlan)}
        />
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
        activeDepartments={editingPlan ? activeDepartments : (createDepartments.length > 0 ? createDepartments : activeDepartments)}
      />

      <PlanRevisionModal
        open={revisionOpen}
        onClose={() => setRevisionOpen(false)}
        plan={activePlan}
        reason={revisionReason}
        setReason={setRevisionReason}
        error={revisionError}
        saving={creatingRevision}
        onSubmit={handleCreateRevision}
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
        currentUser={currentUser}
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
