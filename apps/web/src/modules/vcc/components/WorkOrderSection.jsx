import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Plus,
  SlidersHorizontal,
  Search,
  X,
  FilterX
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
  releaseVccWorkOrderHold,
  cancelVccWorkOrder,
  uploadVccWorkOrderCertificate,
  downloadVccWorkOrderCertificate,
  amendVccWorkOrder
} from '../api/vccWorkOrderApi';
import {
  CreateWorkOrderModal,
  RecordResultModal,
  WorkOrderActionModal,
  WorkOrderSettingsModal,
  AmendmentModal,
  DigitalRecordModal
} from './WorkOrderModals';
import WorkOrderInfoBar from './WorkOrderInfoBar';
import WorkOrderSideDrawer from './WorkOrderSideDrawer';
import WorkOrderTable from './WorkOrderTable';
import { WORK_ORDER_STATUS_LABELS, RESULT_STATUS_LABELS } from '../utils/statusLabels';

const WO_TABS = [
  {
    key: 'OPEN',
    shortLabel: WORK_ORDER_STATUS_LABELS.OPEN,
    fullLabel: 'เปิดงาน / รอบันทึกผล'
  },
  {
    key: 'PENDING_REVIEW',
    shortLabel: WORK_ORDER_STATUS_LABELS.PENDING_REVIEW,
    fullLabel: WORK_ORDER_STATUS_LABELS.PENDING_REVIEW
  },
  {
    key: 'REJECTED',
    shortLabel: WORK_ORDER_STATUS_LABELS.REJECTED,
    fullLabel: WORK_ORDER_STATUS_LABELS.REJECTED
  },
  {
    key: 'CLOSED',
    shortLabel: WORK_ORDER_STATUS_LABELS.CLOSED,
    fullLabel: WORK_ORDER_STATUS_LABELS.CLOSED
  },
  {
    key: 'ON_HOLD',
    shortLabel: WORK_ORDER_STATUS_LABELS.ON_HOLD,
    fullLabel: WORK_ORDER_STATUS_LABELS.ON_HOLD
  }
];

// Local Bangkok timezone date helpers (UTC+7 safe)
const getBangkokDate = (d = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
};

const getDefaultAdHocDueDate = (d = new Date()) => {
  const bangkokDateStr = getBangkokDate(d);
  const [y, m] = bangkokDateStr.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
};

const WorkOrderSection = ({ activeDepartments = [] }) => {
  const [activeTab, setActiveTab] = useState('OPEN');
  const [filterDept, setFilterDept] = useState('');
  const [filterResult, setFilterResult] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDrawerWo, setSelectedDrawerWo] = useState(null);

  // Raw work orders by tab
  const [rawWosByTab, setRawWosByTab] = useState({
    OPEN: [],
    PENDING_REVIEW: [],
    REJECTED: [],
    CLOSED: [],
    ON_HOLD: []
  });

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
  const [fetchError, setFetchError] = useState(null);

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
    due_date: getDefaultAdHocDueDate()
  });
  const [createError, setCreateError] = useState('');
  const [savingCreate, setSavingCreate] = useState(false);

  // Record Result Modal
  const [resultWo, setResultWo] = useState(null);
  const [resultForm, setResultForm] = useState({
    performed_at: getBangkokDate(),
    result_status: 'PASS',
    verification_type: 'QUANTITATIVE',
    actual_result: '',
    certificate_no: '',
    acceptance_criteria: '',
    result_remarks: '',
    calibration_provider_name: '',
    calibration_method: 'EXTERNAL_LAB',
    traceability_ref: '',
    environmental_conditions: '',
    uncertainty_value: '',
    calibration_error_value: '',
    certificate_issue_date: '',
    certificate_valid_until: '',
    certificate_file: null,
    certificate_name: ''
  });
  const [resultError, setResultError] = useState('');
  const [savingResult, setSavingResult] = useState(false);

  // Amendment Modal (Controlled Amendment for CLOSED work orders)
  const [amendWo, setAmendWo] = useState(null);
  const [amendForm, setAmendForm] = useState({
    result_status: 'PASS',
    certificate_no: '',
    acceptance_criteria: '',
    result_remarks: '',
    calibration_provider_name: '',
    calibration_method: 'EXTERNAL_LAB',
    traceability_ref: '',
    environmental_conditions: '',
    uncertainty_value: '',
    calibration_error_value: '',
    amendment_reason: '',
    certificate_file: null
  });
  const [amendError, setAmendError] = useState('');
  const [savingAmend, setSavingAmend] = useState(false);

  // Digital Calibration Record Modal (Print / Export View)
  const [digitalRecordWo, setDigitalRecordWo] = useState(null);

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
    setFetchError(null);
    try {
      const [
        openWos,
        pendingWos,
        rejectedWos,
        closedWos,
        holdWos,
        settingsRes,
        planSettingsRes,
        indivAssets,
        appPlans
      ] = await Promise.all([
        fetchVccWorkOrders({ status: 'OPEN', department: filterDept }),
        fetchVccWorkOrders({ status: 'PENDING_REVIEW', department: filterDept }),
        fetchVccWorkOrders({ status: 'REJECTED', department: filterDept }),
        fetchVccWorkOrders({ status: 'CLOSED', department: filterDept }),
        fetchVccWorkOrders({ nc_status: 'OPEN', department: filterDept }),
        fetchVccWorkOrderSettings(),
        fetchVccPlanSettings(),
        fetchVccAssets({ status: 'ACTIVE', calibratable_only: true }),
        fetchVccPlans({ status: 'APPROVED' })
      ]);

      setRawWosByTab({
        OPEN: openWos || [],
        PENDING_REVIEW: pendingWos || [],
        REJECTED: rejectedWos || [],
        CLOSED: closedWos || [],
        ON_HOLD: holdWos || []
      });

      setWoSettings(settingsRes.settings);
      setThresholds(settingsRes.thresholds);
      setProviders(planSettingsRes.providers || []);
      setIndividualAssets(indivAssets);
      setApprovedPlans(appPlans);
    } catch (err) {
      setFetchError(err.message || 'ไม่สามารถโหลดข้อมูลใบสั่งงานได้');
      toast.error(err.message || 'ไม่สามารถโหลดข้อมูลใบสั่งงานได้');
    } finally {
      setLoading(false);
    }
  }, [filterDept]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Deep link from the task inbox / notifications: /vcc/work-orders?wo=<id> opens that work order's drawer on its own tab
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkedWoId = searchParams.get('wo');

  const handleOpenDrawer = useCallback((wo) => {
    setSelectedDrawerWo(wo);
    if (wo?.id) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (next.get('wo') !== wo.id && next.get('wo') !== wo.wo_code) {
          next.set('wo', wo.id);
          return next;
        }
        return prev;
      });
    }
  }, [setSearchParams]);

  const handleCloseDrawer = useCallback(() => {
    setSelectedDrawerWo(null);
    setSearchParams((prev) => {
      if (prev.has('wo')) {
        const next = new URLSearchParams(prev);
        next.delete('wo');
        return next;
      }
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    if (loading || fetchError) return;
    if (deepLinkedWoId) {
      if (selectedDrawerWo && (selectedDrawerWo.id === deepLinkedWoId || selectedDrawerWo.wo_code === deepLinkedWoId || selectedDrawerWo.wo_number === deepLinkedWoId)) {
        return;
      }
      const tab = Object.keys(rawWosByTab).find((key) =>
        rawWosByTab[key].some((w) => w.id === deepLinkedWoId || w.wo_code === deepLinkedWoId || w.wo_number === deepLinkedWoId)
      );
      if (tab) {
        const matched = rawWosByTab[tab].find((w) => w.id === deepLinkedWoId || w.wo_code === deepLinkedWoId || w.wo_number === deepLinkedWoId);
        setActiveTab(tab);
        setSelectedDrawerWo(matched);
      } else {
        toast.error('ไม่พบใบสั่งงานที่ระบุ หรือคุณไม่มีสิทธิ์ดูใบสั่งงานนี้');
        setSearchParams((prev) => {
          if (!prev.has('wo')) return prev;
          const next = new URLSearchParams(prev);
          next.delete('wo');
          return next;
        }, { replace: true });
      }
    } else {
      if (selectedDrawerWo) {
        setSelectedDrawerWo(null);
      }
    }
  }, [deepLinkedWoId, loading, fetchError, rawWosByTab, setSearchParams]);

  useEffect(() => {
    if (createForm.mode === 'PLAN' && createForm.plan_id) {
      fetchVccPlanDetail(createForm.plan_id)
        .then((d) => setSelectedPlanItems(d.items || []))
        .catch(() => setSelectedPlanItems([]));
    } else {
      setSelectedPlanItems([]);
    }
  }, [createForm.mode, createForm.plan_id]);

  // Tab counts
  const tabCounts = useMemo(() => {
    return {
      OPEN: rawWosByTab.OPEN.length,
      PENDING_REVIEW: rawWosByTab.PENDING_REVIEW.length,
      REJECTED: rawWosByTab.REJECTED.length,
      CLOSED: rawWosByTab.CLOSED.length,
      ON_HOLD: rawWosByTab.ON_HOLD.length
    };
  }, [rawWosByTab]);

  // Filtered work orders for currently active tab
  const activeTabWorkOrders = useMemo(() => {
    let list = rawWosByTab[activeTab] || [];

    // Filter by Result Status (PASS / FAIL / PENDING)
    if (filterResult) {
      list = list.filter((wo) => wo.result_status === filterResult);
    }

    // Filter by Search Query
    const query = searchTerm.trim().toLowerCase();
    if (!query) return list;

    return list.filter((wo) => {
      const matchWoCode = (wo.wo_code || '').toLowerCase().includes(query);
      const matchAssetCode = (wo.asset_code || '').toLowerCase().includes(query);
      const matchAssetName = (wo.asset_name || '').toLowerCase().includes(query);
      const matchCertNo = (wo.certificate_no || '').toLowerCase().includes(query);
      const matchProvider = (wo.provider_name || '').toLowerCase().includes(query);
      return matchWoCode || matchAssetCode || matchAssetName || matchCertNo || matchProvider;
    });
  }, [rawWosByTab, activeTab, searchTerm, filterResult]);

  const openCreateModal = () => {
    setCreateError('');
    setCreateForm({
      mode: 'ADHOC',
      plan_id: approvedPlans[0]?.id || '',
      plan_item_id: '',
      planned_month: 1,
      child_asset_id: '',
      asset_id: '',
      provider_name: '',
      due_date: getDefaultAdHocDueDate()
    });
    setCreateOpen(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setSavingCreate(true);
    setCreateError('');
    try {
      if (createForm.mode !== 'PLAN') {
        if (!createForm.asset_id) {
          setCreateError('กรุณาเลือกเครื่องมือวัด');
          setSavingCreate(false);
          return;
        }
        const trimmedProvider = String(createForm.provider_name || '').trim();
        if (!trimmedProvider || trimmedProvider === '-- เลือกหน่วยงานที่ทวนสอบ --') {
          setCreateError('กรุณาระบุสถาบัน/หน่วยงานที่ทวนสอบ');
          setSavingCreate(false);
          return;
        }
        if (!createForm.due_date || !createForm.due_date.trim()) {
          setCreateError('กรุณาระบุวันครบกำหนด');
          setSavingCreate(false);
          return;
        }
      }

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
              provider_name: createForm.provider_name.trim(),
              due_date: createForm.due_date.trim()
            };
      const created = await createVccWorkOrder(payload);
      toast.success(`สร้างใบสั่งงาน ${created.wo_code} แล้ว`);
      setCreateOpen(false);
      if (activeTab !== 'OPEN') setActiveTab('OPEN');
      await loadData();
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
      performed_at: wo.performed_at || getBangkokDate(),
      result_status: wo.result_status === 'PENDING' ? 'PASS' : wo.result_status,
      verification_type: wo.verification_type || 'QUANTITATIVE',
      actual_result: wo.actual_result || '',
      certificate_no: wo.certificate_no || '',
      acceptance_criteria: wo.acceptance_criteria || woSettings.default_acceptance_criteria?.[0] || '',
      result_remarks: wo.result_remarks || '',
      calibration_provider_name: wo.calibration_provider_name || wo.provider_name || '',
      calibration_method: wo.calibration_method || 'EXTERNAL_LAB',
      traceability_ref: wo.traceability_ref || '',
      environmental_conditions: wo.environmental_conditions || '',
      uncertainty_value: wo.uncertainty_value || '',
      calibration_error_value: wo.calibration_error_value || '',
      certificate_issue_date: wo.certificate_issue_date || '',
      certificate_valid_until: wo.certificate_valid_until || '',
      certificate_file: null,
      certificate_name: wo.certificate_file_name || ''
    });
  };

  const handleResultSubmit = async (e) => {
    e.preventDefault();
    if (!resultWo) return;
    setSavingResult(true);
    setResultError('');
    try {
      if (resultForm.certificate_file) {
        await uploadVccWorkOrderCertificate(resultWo.id, resultForm.certificate_file);
      }
      const { certificate_file: _cf, certificate_name: _cn, ...payload } = resultForm;
      const updated = await submitVccWorkOrderResult(resultWo.id, payload);
      toast.success(`ส่งผลใบสั่งงาน ${updated.wo_code} เข้าสู่คิวตรวจรับแล้ว`);
      setResultWo(null);
      if (selectedDrawerWo?.id === resultWo.id) {
        handleCloseDrawer();
      }
      setActiveTab('PENDING_REVIEW');
      await loadData();
    } catch (err) {
      setResultError(err.message || 'ไม่สามารถส่งผลการทวนสอบได้');
    } finally {
      setSavingResult(false);
    }
  };

  const openAmendModal = (wo) => {
    setAmendWo(wo);
    setAmendError('');
    setAmendForm({
      result_status: wo.result_status || 'PASS',
      certificate_no: wo.certificate_no || '',
      acceptance_criteria: wo.acceptance_criteria || woSettings.default_acceptance_criteria?.[0] || '',
      result_remarks: wo.result_remarks || '',
      calibration_provider_name: wo.calibration_provider_name || wo.provider_name || '',
      calibration_method: wo.calibration_method || 'EXTERNAL_LAB',
      traceability_ref: wo.traceability_ref || '',
      environmental_conditions: wo.environmental_conditions || '',
      uncertainty_value: wo.uncertainty_value || '',
      calibration_error_value: wo.calibration_error_value || '',
      amendment_reason: '',
      certificate_file: null
    });
  };

  const handleAmendSubmit = async (e) => {
    e.preventDefault();
    if (!amendWo) return;
    setSavingAmend(true);
    setAmendError('');
    try {
      if (amendForm.certificate_file) {
        await uploadVccWorkOrderCertificate(amendWo.id, amendForm.certificate_file);
      }
      const { certificate_file: _cf, ...payload } = amendForm;
      const updated = await amendVccWorkOrder(amendWo.id, payload);
      toast.success(
        updated?.request
          ? 'ส่งคำขอแก้ไขผลแล้ว รอผู้อนุมัติที่ไม่ใช่ผู้ขอตรวจสอบและอนุมัติ'
          : `บันทึกการแก้ไขผลของใบสั่งงาน ${updated.wo_code} แล้ว (ฉบับแก้ไข)`
      );
      setAmendWo(null);
      if (selectedDrawerWo?.id === amendWo.id) {
        handleCloseDrawer();
      }
      await loadData();
    } catch (err) {
      setAmendError(err.message || 'ไม่สามารถบันทึกการแก้ไขผลได้');
    } finally {
      setSavingAmend(false);
    }
  };

  const handleDownloadCert = async (workOrder) => {
    try {
      await downloadVccWorkOrderCertificate(workOrder.id, workOrder.certificate_file_name);
    } catch (err) {
      toast.error(err.message || 'ดาวน์โหลดใบรับรองไม่สำเร็จ');
    }
  };

  const openAction = (mode, workOrder) => {
    setActionModal({ mode, workOrder });
    setActionError('');
    setActionForm({
      new_due_date: workOrder.due_date,
      text: '',
      reason: '',
      category: 'MISTAKE_CREATION'
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
        if (selectedDrawerWo?.id === workOrder.id) {
          handleCloseDrawer();
        }
        setActiveTab('CLOSED');
        await loadData();
      } else if (mode === 'REJECT') {
        await rejectVccWorkOrder(workOrder.id, actionForm.text);
        toast.success(`ส่งใบสั่งงาน ${workOrder.wo_code} กลับไปแก้ไขแล้ว`);
        setActionModal(null);
        if (selectedDrawerWo?.id === workOrder.id) {
          handleCloseDrawer();
        }
        setActiveTab('REJECTED');
        await loadData();
      } else if (mode === 'RELEASE_HOLD') {
        await releaseVccWorkOrderHold(workOrder.id, actionForm.text, actionForm.reason);
        toast.success(`ปลดระงับเครื่องมือ ${workOrder.asset_code} แล้ว`);
        setActionModal(null);
        if (selectedDrawerWo?.id === workOrder.id) {
          handleCloseDrawer();
        }
        await loadData();
      } else if (mode === 'CANCEL') {
        await cancelVccWorkOrder(workOrder.id, { cancellation_category: actionForm.category, cancellation_reason: actionForm.text });
        toast.success(`ยกเลิกใบสั่งงาน ${workOrder.wo_code} แล้ว`);
        setActionModal(null);
        if (selectedDrawerWo?.id === workOrder.id) {
          handleCloseDrawer();
        }
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

  const handleResetFilters = () => {
    setSearchTerm('');
    setFilterDept('');
    setFilterResult('');
  };

  const isFiltered = Boolean(searchTerm || filterDept || filterResult);

  return (
    <div className="space-y-4 max-w-full" data-testid="vcc-work-order-section">
      
      {/* 1. Page Header (Single H1 Title, One-line Description, Header Actions) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="space-y-0.5 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
            ใบสั่งงานและบันทึกผล (Work Orders)
          </h1>

          <p className="text-sm text-slate-500">
            เปิดใบสั่งงานตามแผน เลื่อนวันครบกำหนด บันทึกผลพร้อมใบรับรอง ตรวจรับปิดงาน และควบคุมการระงับใช้
          </p>
        </div>

        {/* Primary and Secondary Actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <WorkOrderInfoBar thresholds={thresholds} woSettings={woSettings} />

          <button
            type="button"
            onClick={openSettings}
            className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs sm:text-sm font-medium hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <SlidersHorizontal size={14} className="text-slate-500" />
            <span>ตั้งค่าเกณฑ์ยอมรับ</span>
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-indigo-600 text-white text-xs sm:text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-2xs cursor-pointer"
          >
            <Plus size={15} />
            <span>สร้างใบสั่งงานใหม่</span>
          </button>
        </div>
      </div>

      {/* 2. Status Navigation - Minimal Underline Tabs */}
      <div className="border-b border-slate-200">
        <nav
          className="flex flex-wrap gap-x-4 gap-y-1 xl:flex-nowrap xl:items-center xl:gap-6 xl:overflow-x-auto xl:scrollbar-none"
          role="tablist"
          aria-label="สถานะใบสั่งงาน"
        >
          {WO_TABS.map((t) => {
            const isActive = activeTab === t.key;
            const count = tabCounts[t.key] ?? 0;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={t.fullLabel}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 sm:gap-2 pb-3 pt-1 text-xs sm:text-sm font-medium border-b-2 transition-all cursor-pointer whitespace-nowrap select-none ${
                  isActive
                    ? 'border-indigo-600 text-indigo-700 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <span className="hidden 2xl:inline">{t.fullLabel}</span>
                <span className="inline 2xl:hidden">{t.shortLabel}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold transition-colors ${
                    isActive ? 'bg-indigo-50 text-indigo-800' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* 3. Search & Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {/* Search Input (Primary) */}
        <div className="relative flex-1 min-w-[180px] max-w-sm sm:max-w-md">
          <Search
            size={14}
            className="text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ค้นหาเลขที่ใบงาน, เครื่องมือ, ใบรับรอง..."
            className="w-full pl-8.5 pr-8 py-1.5 h-9 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors shadow-2xs"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
              aria-label="ล้างคำค้นหา"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Secondary Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Department Filter (Master Data) */}
          <select
            aria-label="กรองใบสั่งงานตามแผนก"
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:border-indigo-600 cursor-pointer shadow-2xs truncate max-w-[180px]"
          >
            <option value="">ทุกแผนก (Master Data)</option>
            {activeDepartments.map((d) => (
              <option key={d.code} value={d.code}>
                {d.code} — {d.nameTh}
              </option>
            ))}
          </select>

          {/* Result Status Filter */}
          <select
            aria-label="กรองตามผลการตรวจ"
            value={filterResult}
            onChange={(e) => setFilterResult(e.target.value)}
            className="h-9 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:border-indigo-600 cursor-pointer shadow-2xs"
          >
            <option value="">ทุกผลตรวจ</option>
            <option value="PASS">{RESULT_STATUS_LABELS.PASS}</option>
            <option value="FAIL">{RESULT_STATUS_LABELS.FAIL}</option>
            <option value="PENDING">{RESULT_STATUS_LABELS.PENDING}</option>
          </select>

          {/* Reset Filters button */}
          {isFiltered && (
            <button
              type="button"
              onClick={handleResetFilters}
              title="ล้างตัวกรองทั้งหมด"
              className="inline-flex items-center gap-1 px-2.5 h-9 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors cursor-pointer shrink-0"
            >
              <FilterX size={13} />
              <span>ล้างตัวกรอง</span>
            </button>
          )}

          {/* Right: Total Items Badge */}
          <div className="text-xs font-medium text-slate-500 pl-1 shrink-0">
            แสดง <span className="font-bold text-slate-800">{activeTabWorkOrders.length}</span> รายการ
          </div>
        </div>
      </div>

      {/* 4. Professional Data Grid (Comfortable Row Density, Single Primary Action) */}
      <WorkOrderTable
        workOrders={activeTabWorkOrders}
        loading={loading}
        error={fetchError}
        activeTab={activeTab}
        searchTerm={searchTerm}
        filterDept={filterDept}
        thresholds={thresholds}
        onRowClick={handleOpenDrawer}
        onRecordResult={openRecordResult}
        onReschedule={(wo) => openAction('RESCHEDULE', wo)}
        onApprove={(wo) => openAction('APPROVE', wo)}
        onReject={(wo) => openAction('REJECT', wo)}
        onReleaseHold={(wo) => openAction('RELEASE_HOLD', wo)}
        onCancel={(wo) => openAction('CANCEL', wo)}
        onResetFilters={handleResetFilters}
        onOpenCreate={openCreateModal}
        onAmend={openAmendModal}
        onViewDigitalRecord={(wo) => setDigitalRecordWo(wo)}
      />

      {/* 5. Side Drawer for Work Order Details */}
      <WorkOrderSideDrawer
        workOrder={selectedDrawerWo}
        onClose={handleCloseDrawer}
        thresholds={thresholds}
        onRecordResult={openRecordResult}
        onReschedule={(wo) => openAction('RESCHEDULE', wo)}
        onApprove={(wo) => openAction('APPROVE', wo)}
        onReject={(wo) => openAction('REJECT', wo)}
        onReleaseHold={(wo) => openAction('RELEASE_HOLD', wo)}
        onCancel={(wo) => openAction('CANCEL', wo)}
        onAmend={openAmendModal}
        onDownloadCert={handleDownloadCert}
        onViewDigitalRecord={(wo) => setDigitalRecordWo(wo)}
        onAmendmentResolved={loadData}
      />

      {/* 6. Modals */}
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
        providers={providers}
      />

      <AmendmentModal
        workOrder={amendWo}
        onClose={() => setAmendWo(null)}
        form={amendForm}
        setForm={setAmendForm}
        error={amendError}
        saving={savingAmend}
        onSubmit={handleAmendSubmit}
        criteriaOptions={woSettings.default_acceptance_criteria}
      />

      <DigitalRecordModal
        workOrder={digitalRecordWo}
        onClose={() => setDigitalRecordWo(null)}
        onDownloadCert={handleDownloadCert}
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
