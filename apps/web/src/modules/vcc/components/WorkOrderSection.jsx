import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  releaseVccWorkOrderHold
} from '../api/vccWorkOrderApi';
import {
  CreateWorkOrderModal,
  RecordResultModal,
  WorkOrderActionModal,
  WorkOrderSettingsModal
} from './WorkOrderModals';
import WorkOrderInfoBar from './WorkOrderInfoBar';
import WorkOrderSideDrawer from './WorkOrderSideDrawer';
import WorkOrderTable from './WorkOrderTable';

const WO_TABS = [
  {
    key: 'OPEN',
    label: 'เปิดงาน / รอบันทึกผล (OPEN)',
    activeClass: 'bg-white text-indigo-700 shadow-2xs font-bold border border-slate-200/90',
    badgeClass: 'bg-indigo-50 text-indigo-700 border border-indigo-200'
  },
  {
    key: 'PENDING_REVIEW',
    label: 'รอตรวจรับผล (PENDING_REVIEW)',
    activeClass: 'bg-white text-amber-800 shadow-2xs font-bold border border-slate-200/90',
    badgeClass: 'bg-amber-50 text-amber-800 border border-amber-200'
  },
  {
    key: 'REJECTED',
    label: 'ส่งกลับแก้ไขผล (REJECTED)',
    activeClass: 'bg-white text-rose-700 shadow-2xs font-bold border border-slate-200/90',
    badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200'
  },
  {
    key: 'CLOSED',
    label: 'ตรวจรับปิดงานแล้ว (CLOSED)',
    activeClass: 'bg-white text-emerald-800 shadow-2xs font-bold border border-slate-200/90',
    badgeClass: 'bg-emerald-50 text-emerald-800 border border-emerald-200'
  },
  {
    key: 'ON_HOLD',
    label: 'เครื่องมือระงับใช้ / NC (ON_HOLD)',
    activeClass: 'bg-white text-purple-800 shadow-2xs font-bold border border-slate-200/90',
    badgeClass: 'bg-purple-50 text-purple-800 border border-purple-200'
  }
];

const WorkOrderSection = ({ activeDepartments = [] }) => {
  const [activeTab, setActiveTab] = useState('OPEN');
  const [filterDept, setFilterDept] = useState('');
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
        fetchVccAssets({ status: 'ACTIVE', is_group: '0' }),
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
    const list = rawWosByTab[activeTab] || [];
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
  }, [rawWosByTab, activeTab, searchTerm]);

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
      if (selectedDrawerWo?.id === resultWo.id) {
        setSelectedDrawerWo(null);
      }
      setActiveTab('PENDING_REVIEW');
      await loadData();
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
        if (selectedDrawerWo?.id === workOrder.id) {
          setSelectedDrawerWo(null);
        }
        setActiveTab('CLOSED');
        await loadData();
      } else if (mode === 'REJECT') {
        await rejectVccWorkOrder(workOrder.id, actionForm.text);
        toast.success(`ส่งใบสั่งงาน ${workOrder.wo_code} กลับไปแก้ไขแล้ว`);
        setActionModal(null);
        if (selectedDrawerWo?.id === workOrder.id) {
          setSelectedDrawerWo(null);
        }
        setActiveTab('REJECTED');
        await loadData();
      } else if (mode === 'RELEASE_HOLD') {
        await releaseVccWorkOrderHold(workOrder.id, actionForm.text);
        toast.success(`ปลดระงับเครื่องมือ ${workOrder.asset_code} แล้ว`);
        setActionModal(null);
        if (selectedDrawerWo?.id === workOrder.id) {
          setSelectedDrawerWo(null);
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
  };

  return (
    <div className="space-y-4 max-w-full" data-testid="vcc-work-order-section">
      {/* 1. Page Header & Collapsible Rule Notice Bar */}
      <WorkOrderInfoBar thresholds={thresholds} woSettings={woSettings} />

      {/* 2. Control Card: Status Tabs & Unified Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-3.5">
        
        {/* 2.1 Status Navigation - Single Row on Desktop with reactive counts */}
        <div className="w-full overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <div
            className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl min-w-max"
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
                  onClick={() => setActiveTab(t.key)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap select-none ${
                    isActive
                      ? t.activeClass
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <span>{t.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono font-bold transition-colors ${
                      isActive ? t.badgeClass : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2.2 Unified Toolbar - Search, Department Filter, and Actions in one row */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
          {/* Left: Search & Filter */}
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[180px] max-w-md">
              <Search
                size={15}
                className="text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหาเลขที่ใบงาน, เครื่องมือ, ใบรับรอง..."
                className="w-full pl-9 pr-8 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-2xs"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  title="ล้างคำค้นหา"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Department Filter (Master Data) */}
            <select
              aria-label="กรองใบสั่งงานตามแผนก"
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="h-9 px-3 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer shadow-2xs truncate max-w-[200px]"
            >
              <option value="">ทุกแผนก (Master Data)</option>
              {activeDepartments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} — {d.nameTh}
                </option>
              ))}
            </select>

            {/* Reset Filters button */}
            {(searchTerm || filterDept) && (
              <button
                type="button"
                onClick={handleResetFilters}
                title="ล้างตัวกรองทั้งหมด"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl border border-rose-200 transition-all cursor-pointer shrink-0"
              >
                <FilterX size={13} />
                <span>ล้างตัวกรอง</span>
              </button>
            )}

            {/* Total items badge */}
            <span className="text-xs text-slate-500 font-medium hidden lg:inline">
              แสดง {activeTabWorkOrders.length} รายการ
            </span>
          </div>

          {/* Right: Actions (Secondary + Primary) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={openSettings}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl border border-slate-200/90 bg-white text-slate-700 text-xs sm:text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer shadow-2xs"
            >
              <SlidersHorizontal size={14} className="text-slate-500" />
              <span>ตั้งค่าเกณฑ์ยอมรับและอายุเก็บเอกสาร</span>
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl bg-indigo-600 text-white text-xs sm:text-sm font-semibold hover:bg-indigo-700 shadow-2xs transition-colors cursor-pointer"
            >
              <Plus size={15} />
              <span>สร้างใบสั่งงานใหม่</span>
            </button>
          </div>

        </div>
      </div>

      {/* 3. Work Order Table */}
      <WorkOrderTable
        workOrders={activeTabWorkOrders}
        loading={loading}
        error={fetchError}
        activeTab={activeTab}
        searchTerm={searchTerm}
        filterDept={filterDept}
        thresholds={thresholds}
        onRowClick={(wo) => setSelectedDrawerWo(wo)}
        onRecordResult={openRecordResult}
        onReschedule={(wo) => openAction('RESCHEDULE', wo)}
        onApprove={(wo) => openAction('APPROVE', wo)}
        onReject={(wo) => openAction('REJECT', wo)}
        onReleaseHold={(wo) => openAction('RELEASE_HOLD', wo)}
        onResetFilters={handleResetFilters}
        onOpenCreate={openCreateModal}
      />

      {/* 4. Side Drawer for Work Order Details */}
      <WorkOrderSideDrawer
        workOrder={selectedDrawerWo}
        onClose={() => setSelectedDrawerWo(null)}
        thresholds={thresholds}
        onRecordResult={openRecordResult}
        onReschedule={(wo) => openAction('RESCHEDULE', wo)}
        onApprove={(wo) => openAction('APPROVE', wo)}
        onReject={(wo) => openAction('REJECT', wo)}
        onReleaseHold={(wo) => openAction('RELEASE_HOLD', wo)}
      />

      {/* 5. Modals */}
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
