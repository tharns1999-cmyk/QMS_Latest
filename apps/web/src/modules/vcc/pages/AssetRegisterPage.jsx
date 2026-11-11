import useVccPolicyUser from '../hooks/useVccPolicyUser';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useInRouterContext, useLocation, useNavigate, useSearchParams, MemoryRouter } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Wrench,
  Calendar,
  ClipboardList,
  BarChart3
} from 'lucide-react';
import useStore from '../../../store/useStore';
import {
  fetchVccAssets,
  fetchVccAssetDetail,
  fetchVccAssetTypes,
  fetchVccAssetImpact,
  saveVccAssetTypes,
  createVccAsset,
  updateVccAsset,
  retireVccAsset,
  reactivateVccAsset
} from '../api/vccApi';
import {
  AssetFormModal,
  AssetStatusModal,
  AssetTypesModal
} from '../components/AssetRegisterModals';
import { AssetDetailDrawer } from '../components/AssetDetailDrawer';
import { filterReadableDepartments, manageableVccDepartments, canManageVccAsset, getUserDeptCodes, canReadAllVccDepartments } from '../utils/departmentScope';
import AnnualPlanMatrixSection from '../components/AnnualPlanMatrixSection';
import WorkOrderSection from '../components/WorkOrderSection';
import VccDashboardSection from '../components/VccDashboardSection';
import VccTaskInboxSection from '../components/VccTaskInboxSection';
import { useVccMobileViewport } from '../hooks/useVccMobileViewport';
import { AssetRegisterTitleBar } from '../components/AssetRegisterTitleBar';
import { AssetFilterToolbar } from '../components/AssetFilterToolbar';
import { AssetRegisterTable } from '../components/AssetRegisterTable';
import { AssetRegisterEmptyState } from '../components/AssetRegisterEmptyState';
import { Info } from 'lucide-react';

const EMPTY_FORM = {
  asset_code: '',
  name: '',
  asset_type: '',
  serial_no: '',
  model: '',
  location: '',
  department: '',
  group_nature: 'LOGICAL_GROUP',
  composite_details: ''
};

const AssetRegisterPageInner = () => {
  const { departments: storeDepts, masterDepartments, currentUser: sessionUser } = useStore();
  const currentUser = useVccPolicyUser(sessionUser);
  const { isMobile } = useVccMobileViewport();

  const activeDepartments = useMemo(() => {
    const raw = masterDepartments?.length ? masterDepartments : storeDepts || [];
    const all = raw
      .map((d) => ({
        code: d.code || d.deptCode || d.id,
        nameTh: d.name_th || d.nameTh || d.name || d.code,
        status: d.status || 'ACTIVE'
      }))
      .filter((d) => d.code && d.status === 'ACTIVE');
    return filterReadableDepartments(currentUser, all, (d) => d.code);
  }, [masterDepartments, storeDepts, currentUser]);

  const location = useLocation();
  const navigate = useNavigate();

  // URL-driven navigation synchronized with Sidebar
  const routeView = useMemo(() => {
    const p = location?.pathname || '';
    if (p.includes('/vcc/tasks')) return 'TASKS';
    if (p.includes('/vcc/work-orders')) return 'WORK_ORDERS';
    if (p.includes('/vcc/plans') || p.includes('/vcc/annual-plans')) return 'ANNUAL_PLAN';
    if (p.includes('/vcc/assets')) return 'ASSETS';
    if (p.includes('/vcc/dashboard')) return 'DASHBOARD';
    if (p === '/vcc' || p === '/vcc/') return 'DASHBOARD';
    return null;
  }, [location?.pathname]);

  const [localModuleView, setLocalModuleView] = useState('ASSETS');
  const moduleView = routeView || localModuleView;

  const setModuleView = useCallback((nextView, targetWoId = null, targetAssetId = null) => {
    setLocalModuleView(nextView);
    if (navigate && location?.pathname && location.pathname.startsWith('/vcc')) {
      const targetPath =
        nextView === 'TASKS' ? '/vcc/tasks' :
        nextView === 'WORK_ORDERS' ? (targetWoId ? `/vcc/work-orders?wo=${encodeURIComponent(targetWoId)}` : '/vcc/work-orders') :
        nextView === 'ANNUAL_PLAN' ? (location?.pathname?.includes('/vcc/annual-plans') ? '/vcc/annual-plans' : '/vcc/plans') :
        nextView === 'ASSETS' ? (targetAssetId ? `/vcc/assets?asset=${encodeURIComponent(targetAssetId)}` : '/vcc/assets') :
        '/vcc/dashboard';
      const currentFullPath = (location.pathname || '') + (location.search || '');
      if (currentFullPath !== targetPath) {
        navigate(targetPath);
      }
    }
  }, [navigate, location?.pathname, location?.search]);

  // 4 Status Tabs: ALL, ACTIVE, ON_HOLD, RETIRED (and UNDER_REPAIR if any). ACTIVE is default.
  const [activeTab, setActiveTab] = useState('ACTIVE');
  const [assetsByStatus, setAssetsByStatus] = useState({
    ACTIVE: [],
    ON_HOLD: [],
    UNDER_REPAIR: [],
    RETIRED: []
  });
  const [counts, setCounts] = useState({
    ALL: 0,
    ACTIVE: 0,
    ON_HOLD: 0,
    UNDER_REPAIR: 0,
    RETIRED: 0
  });
  const [assetTypes, setAssetTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Department filter (Flat Instrument Register — no category navigation)
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterType, setFilterType] = useState('');

  // DCC manages every department; L4+ only their own VCC department(s). The server enforces the same rule; here it only decides what is shown.
  const isDccUser = Boolean(currentUser?.isDcc);
  const canReadAllDepts = useMemo(() => canReadAllVccDepartments(currentUser), [currentUser]);
  const manageableDepts = useMemo(() => manageableVccDepartments(currentUser), [currentUser]);
  const canAddAsset = manageableDepts.some((d) => !currentUser?.vccEnabledDepartments || currentUser.vccEnabledDepartments.includes(d));
  const myDepts = useMemo(() => getUserDeptCodes(currentUser), [currentUser]);
  const lockedDeptCode = useMemo(
    () => (canReadAllDepts ? '' : (myDepts.length === 1 ? myDepts[0] : String(currentUser?.department || currentUser?.primary_department || myDepts[0] || '').toUpperCase())),
    [canReadAllDepts, myDepts, currentUser]
  );

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setFilterType('');
    if (canReadAllDepts) setFilterDept('');
    setActiveTab('ALL');
  }, [canReadAllDepts]);
  const effectiveDeptFilter = useMemo(
    () => (canReadAllDepts ? filterDept : (filterDept || lockedDeptCode)),
    [canReadAllDepts, filterDept, lockedDeptCode]
  );
  const scopedDeptInfo = useMemo(() => {
    const targetCode = effectiveDeptFilter || myDepts[0] || String(currentUser?.department || '').toUpperCase();
    if (!targetCode) return null;
    const found = activeDepartments.find((d) => String(d.code).toUpperCase() === targetCode);
    return {
      code: targetCode,
      nameTh: found?.nameTh || targetCode
    };
  }, [effectiveDeptFilter, myDepts, currentUser, activeDepartments]);

  const departmentBadgeText = useMemo(() => {
    if (canReadAllDepts) {
      if (!filterDept) return 'ทุกแผนก (All Departments)';
      const found = activeDepartments.find((d) => String(d.code).toUpperCase() === String(filterDept).toUpperCase());
      return `แผนก: ${filterDept} — ${found?.nameTh || filterDept}`;
    }
    const myCode = lockedDeptCode || myDepts[0] || currentUser?.department || 'QC';
    const found = activeDepartments.find((d) => String(d.code).toUpperCase() === String(myCode).toUpperCase());
    return `แผนก: ${myCode} — ${found?.nameTh || myCode}`;
  }, [canReadAllDepts, filterDept, activeDepartments, lockedDeptCode, myDepts, currentUser]);

  const isDepartmentEmpty = useMemo(() => {
    return counts.ALL === 0 && !searchQuery && !filterType;
  }, [counts.ALL, searchQuery, filterType]);
  const formDepartments = useMemo(
    () => (isDccUser ? activeDepartments : activeDepartments.filter((d) => manageableDepts.includes(String(d.code).toUpperCase()))),
    [isDccUser, activeDepartments, manageableDepts]
  );

  // Add / Edit Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [savingForm, setSavingForm] = useState(false);
  const [formError, setFormError] = useState('');

  // Retire / Reactivate Modal
  const [statusModal, setStatusModal] = useState(null);
  const [statusReason, setStatusReason] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [statusImpact, setStatusImpact] = useState(null);

  // History / Detail Modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkedAssetId = searchParams.get('asset');
  const activeAssetLookupRef = useRef(null);
  const failedAssetLookupRef = useRef(null);

  const openHistoryModal = useCallback(async (target, updateUrl = true) => {
    const assetId = typeof target === 'object' && target !== null ? target.id : target;
    if (!assetId) return;
    setDetailModalOpen(true);
    setLoadingDetail(true);
    setDetailData(null);
    try {
      const detail = await fetchVccAssetDetail(assetId);
      setDetailData(detail);
      activeAssetLookupRef.current = String(assetId);
      failedAssetLookupRef.current = null;
      if (updateUrl) {
        setSearchParams((prev) => {
          if (prev.get('asset') === String(assetId)) return prev;
          const next = new URLSearchParams(prev);
          next.set('asset', assetId);
          return next;
        }, { replace: false });
      }
    } catch (err) {
      const msg = err.message || 'ไม่พบข้อมูลเครื่องมือหรือไม่มีสิทธิ์เข้าถึง';
      toast.error(msg);
      setDetailModalOpen(false);
      setDetailData(null);
      activeAssetLookupRef.current = null;
      failedAssetLookupRef.current = String(assetId);
      setSearchParams((prev) => {
        if (!prev.has('asset')) return prev;
        const next = new URLSearchParams(prev);
        next.delete('asset');
        return next;
      }, { replace: true });
    } finally {
      setLoadingDetail(false);
    }
  }, [setSearchParams]);

  // Synchronize deep link (?asset=<id>) with History Modal directly without waiting for active tab list
  useEffect(() => {
    if (moduleView !== 'ASSETS') return;
    if (!deepLinkedAssetId) {
      activeAssetLookupRef.current = null;
      failedAssetLookupRef.current = null;
      setDetailModalOpen((prevOpen) => {
        if (prevOpen) {
          setDetailData(null);
        }
        return false;
      });
      return;
    }
    if (activeAssetLookupRef.current === deepLinkedAssetId || failedAssetLookupRef.current === deepLinkedAssetId) {
      return;
    }
    activeAssetLookupRef.current = deepLinkedAssetId;
    openHistoryModal(deepLinkedAssetId, false);
  }, [deepLinkedAssetId, moduleView, openHistoryModal]);

  const handleCloseDetailModal = useCallback((nextOpen) => {
    setDetailModalOpen(nextOpen);
    if (!nextOpen) {
      setDetailData(null);
      setSearchParams((prev) => {
        if (!prev.has('asset')) return prev;
        const next = new URLSearchParams(prev);
        next.delete('asset');
        return next;
      }, { replace: true });
    }
  }, [setSearchParams]);

  // Asset Types Settings Modal
  const [typesModalOpen, setTypesModalOpen] = useState(false);
  const [draftTypes, setDraftTypes] = useState([]);
  const [newTypeName, setNewTypeName] = useState('');
  const [savingTypes, setSavingTypes] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [listActive, listOnHold, listUnderRepair, listRetired, types] = await Promise.all([
        fetchVccAssets({
          status: 'ACTIVE',
          department: effectiveDeptFilter,
          asset_type: filterType,
          calibratable_only: true,
          q: searchQuery
        }),
        fetchVccAssets({
          status: 'ON_HOLD',
          department: effectiveDeptFilter,
          asset_type: filterType,
          calibratable_only: true,
          q: searchQuery
        }),
        fetchVccAssets({
          status: 'UNDER_REPAIR',
          department: effectiveDeptFilter,
          asset_type: filterType,
          calibratable_only: true,
          q: searchQuery
        }),
        fetchVccAssets({
          status: 'RETIRED',
          department: effectiveDeptFilter,
          asset_type: filterType,
          calibratable_only: true,
          q: searchQuery
        }),
        fetchVccAssetTypes()
      ]);

      const activeList = listActive || [];
      const onHoldList = listOnHold || [];
      const underRepairList = listUnderRepair || [];
      const retiredList = listRetired || [];

      setAssetsByStatus({
        ACTIVE: activeList,
        ON_HOLD: onHoldList,
        UNDER_REPAIR: underRepairList,
        RETIRED: retiredList
      });

      setCounts({
        ACTIVE: activeList.length,
        ON_HOLD: onHoldList.length,
        UNDER_REPAIR: underRepairList.length,
        RETIRED: retiredList.length,
        ALL: activeList.length + onHoldList.length + underRepairList.length + retiredList.length
      });

      setAssetTypes(types || []);
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถโหลดข้อมูลทะเบียนเครื่องมือได้');
    } finally {
      setLoading(false);
    }
  }, [effectiveDeptFilter, filterType, searchQuery]);

  const displayedAssets = useMemo(() => {
    if (activeTab === 'ACTIVE') return assetsByStatus.ACTIVE;
    if (activeTab === 'ON_HOLD') return assetsByStatus.ON_HOLD;
    if (activeTab === 'UNDER_REPAIR') return assetsByStatus.UNDER_REPAIR;
    if (activeTab === 'RETIRED') return assetsByStatus.RETIRED;
    if (activeTab === 'ALL') {
      return [
        ...assetsByStatus.ACTIVE,
        ...assetsByStatus.ON_HOLD,
        ...assetsByStatus.UNDER_REPAIR,
        ...assetsByStatus.RETIRED
      ].sort((a, b) => String(a.asset_code || '').localeCompare(String(b.asset_code || '')));
    }
    return assetsByStatus.ACTIVE;
  }, [activeTab, assetsByStatus]);

  useEffect(() => {
    if (moduleView === 'ASSETS') {
      loadData();
    }
  }, [loadData, moduleView]);

  const openCreateModal = () => {
    setEditingAsset(null);
    setFormError('');
    const primaryDept = String(currentUser?.department || currentUser?.primary_department || myDepts[0] || '').toUpperCase();
    const defaultDept = isDccUser
      ? (formDepartments[0]?.code || '')
      : (formDepartments.find((d) => String(d.code).toUpperCase() === primaryDept)?.code || formDepartments[0]?.code || '');
    setForm({
      ...EMPTY_FORM,
      asset_type: assetTypes[0] || '',
      department: defaultDept
    });
    setFormOpen(true);
  };

  const openEditModal = (asset) => {
    setEditingAsset(asset);
    setFormError('');
    setForm({
      asset_code: asset.asset_code || '',
      name: asset.name || '',
      asset_type: asset.asset_type || '',
      serial_no: asset.serial_no || '',
      model: asset.model || '',
      location: asset.location || '',
      department: asset.department || '',
      group_nature: asset.group_nature || 'LOGICAL_GROUP',
      composite_details: asset.composite_details || ''
    });
    setFormOpen(true);
  };

  const handleSaveAsset = async (e) => {
    e.preventDefault();
    setSavingForm(true);
    setFormError('');
    try {
      const payload = {
        asset_code: form.asset_code,
        name: form.name,
        asset_type: form.asset_type,
        serial_no: form.serial_no,
        model: form.model,
        location: form.location,
        department: form.department,
        is_group: false,
        group_nature: form.group_nature === 'COMPOSITE_SET' ? 'COMPOSITE_SET' : 'LOGICAL_GROUP',
        composite_details: form.group_nature === 'COMPOSITE_SET' ? (form.composite_details || '') : ''
      };
      if (editingAsset) {
        await updateVccAsset(editingAsset.id, payload);
        toast.success(`บันทึกการแก้ไขเครื่องมือ ${payload.asset_code.toUpperCase()} แล้ว`);
      } else {
        await createVccAsset(payload);
        toast.success(`เพิ่มเครื่องมือ ${payload.asset_code.toUpperCase()} แล้ว`);
      }
      setFormOpen(false);
      await loadData();
    } catch (err) {
      const msg = err.message || 'เกิดข้อผิดพลาดในการบันทึก';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSavingForm(false);
    }
  };

  const openStatusModal = (mode, asset) => {
    setStatusModal({ mode, asset });
    setStatusReason('');
    setStatusError('');
    setStatusImpact(null);
    fetchVccAssetImpact(asset.id).then(setStatusImpact).catch(() => setStatusImpact(null));
  };
  const openRetireModal = (asset) => openStatusModal('RETIRE', asset);
  const openReactivateModal = (asset) => openStatusModal('REACTIVATE', asset);

  const handleConfirmStatusChange = async (e) => {
    e.preventDefault();
    if (!statusModal) return;
    setSavingStatus(true);
    setStatusError('');
    try {
      if (statusModal.mode === 'RETIRE') {
        await retireVccAsset(statusModal.asset.id, statusReason);
        toast.success(`ปลดออก ${statusModal.asset.asset_code} จากทะเบียนแล้ว (ยังดูประวัติได้ในแท็บ "ปลดออกแล้ว")`);
      } else {
        await reactivateVccAsset(statusModal.asset.id, statusReason);
        toast.success(`นำเครื่องมือ ${statusModal.asset.asset_code} กลับมาใช้งานแล้ว`);
      }
      setStatusModal(null);
      await loadData();
    } catch (err) {
      const msg = err.message || 'ไม่สามารถเปลี่ยนสถานะเครื่องมือได้';
      setStatusError(msg);
      toast.error(msg);
    } finally {
      setSavingStatus(false);
    }
  };


  const openTypesSettings = () => {
    setDraftTypes([...assetTypes]);
    setNewTypeName('');
    setTypesModalOpen(true);
  };

  const handleAddDraftType = () => {
    const trimmed = newTypeName.trim();
    if (!trimmed) return;
    if (draftTypes.includes(trimmed)) {
      toast.error('มีประเภทเครื่องมือนี้อยู่ในรายการแล้ว');
      return;
    }
    setDraftTypes([...draftTypes, trimmed]);
    setNewTypeName('');
  };

  const handleRemoveDraftType = (target) => {
    if (draftTypes.length <= 1) {
      toast.error('ต้องมีประเภทเครื่องมืออย่างน้อย 1 รายการ');
      return;
    }
    setDraftTypes(draftTypes.filter((t) => t !== target));
  };

  const handleSaveTypes = async () => {
    setSavingTypes(true);
    try {
      const updated = await saveVccAssetTypes(draftTypes);
      setAssetTypes(updated);
      toast.success('บันทึกรายการประเภทเครื่องมือแล้ว');
      setTypesModalOpen(false);
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถบันทึกประเภทเครื่องมือได้');
    } finally {
      setSavingTypes(false);
    }
  };

  const formTypeOptions = useMemo(() => {
    if (form.asset_type && !assetTypes.includes(form.asset_type)) {
      return [form.asset_type, ...assetTypes];
    }
    return assetTypes;
  }, [assetTypes, form.asset_type]);

  const hasTestData = useMemo(() => {
    return Object.values(assetsByStatus).some((list) =>
      Array.isArray(list) && list.some((a) => String(a.name || '').includes('[ข้อมูลทดสอบ]'))
    );
  }, [assetsByStatus]);

  // Enterprise Page Metadata per moduleView
  const pageMeta = useMemo(() => {
    switch (moduleView) {
      case 'DASHBOARD':
        return {
          title: 'ภาพรวมและแจ้งเตือน (Dashboard & Alerts)',
          description: 'สรุป KPI งานทวนสอบ/สอบเทียบ ศูนย์แจ้งเตือนตามกติกา และส่งออกรายงานประจำปี',
          Icon: BarChart3
        };
      case 'WORK_ORDERS':
        return {
          title: 'ใบสั่งงานและบันทึกผล (Work Orders)',
          description: 'เปิดใบสั่งงานตามแผน เลื่อนวันครบกำหนด บันทึกผลพร้อมใบรับรอง ตรวจรับปิดงาน และควบคุมการระงับใช้',
          Icon: ClipboardList
        };
      case 'TASKS':
        return {
          title: 'งานที่ต้องดำเนินการ (VCC Task Inbox)',
          description: 'ศูนย์กลางการทบทวนและอนุมัติแผนการทวนสอบเครื่องมือประจำปีตามสิทธิ์และผู้รับผิดชอบ',
          Icon: ClipboardList
        };
      case 'ANNUAL_PLAN':
        return {
          title: 'แผนการทวนสอบเครื่องมือประจำปี',
          description: 'วางรอบทวนสอบและสอบเทียบเครื่องมือตลอด 12 เดือน และส่งเข้าสู่กระบวนการทบทวน',
          Icon: Calendar
        };
      case 'ASSETS':
      default:
        return {
          title: 'ทะเบียนเครื่องมือวัด (Equipment Register)',
          description: 'จัดการทะเบียนเครื่องมือวัดและชุดเครื่องมือมาตรฐาน ตรวจสอบรหัสเครื่องมือไม่ให้ซ้ำทั้งบริษัท และบันทึกประวัติการแก้ไขทุกขั้นตอน',
          Icon: Wrench
        };
    }
  }, [moduleView]);

  return (
    <div className="w-full min-w-0 space-y-4 pb-8">
      {/* Test-only switcher: the sidebar (desktop, and the mobile drawer) is the real menu for every one of these views, so shipping
          this clipped duplicate would only add an invisible landmark and Tab stops. Not rendered in production builds. */}
      {import.meta.env.MODE === 'test' && (
        <div className="sr-only" role="navigation" aria-label="เมนูย่อยระบบ VCC">
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setModuleView('DASHBOARD')}
            aria-label="ภาพรวมและรายงาน (Dashboard & Export)"
          >
            ภาพรวมและรายงาน (Dashboard & Export)
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setModuleView('WORK_ORDERS')}
            aria-label="ใบสั่งงานและบันทึกผล (Work Orders)"
          >
            ใบสั่งงานและบันทึกผล (Work Orders)
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setModuleView('ANNUAL_PLAN')}
            aria-label="แผนการทวนสอบประจำปี (FM-QC-46)"
          >
            แผนการทวนสอบประจำปี (FM-QC-46)
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setModuleView('TASKS')}
            aria-label="งานที่ต้องดำเนินการ (VCC Task Inbox)"
          >
            งานที่ต้องดำเนินการ (VCC Task Inbox)
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setModuleView('ASSETS')}
            aria-label="ทะเบียนเครื่องมือ (Asset Register)"
          >
            ทะเบียนเครื่องมือ (Asset Register)
          </button>
        </div>
      )}

      {/* Generic page header for the other views; the asset register has its own compact title bar + toolbar below */}
      {moduleView !== 'WORK_ORDERS' && moduleView !== 'ASSETS' && (
        <div className="px-1 transition-all">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight break-words">
                {pageMeta.title}
              </h1>
              <p className="hidden md:block text-sm text-slate-500">
                {pageMeta.description}
              </p>
            </div>
          </div>
        </div>
      )}

      {moduleView === 'TASKS' ? (
        <VccTaskInboxSection />
      ) : moduleView === 'ANNUAL_PLAN' ? (
        <AnnualPlanMatrixSection activeDepartments={activeDepartments} />
      ) : moduleView === 'WORK_ORDERS' ? (
        <WorkOrderSection activeDepartments={activeDepartments} />
      ) : moduleView === 'DASHBOARD' ? (
        <VccDashboardSection
          onNavigateToWorkOrders={(woId) => setModuleView('WORK_ORDERS', woId)}
          onNavigateToAsset={(assetId) => setModuleView('ASSETS', null, assetId)}
        />
      ) : (
        <>
          <span className="sr-only" data-testid="asset-manage-summary">
            {isDccUser
              ? 'คุณเป็น DCC: จัดการเครื่องมือได้ทุกแผนก โอนเครื่องมือข้ามแผนกได้ และตั้งค่าประเภทเครื่องมือได้'
              : canAddAsset
                ? `คุณจัดการเครื่องมือของแผนก ${manageableDepts.join(', ')} ได้`
                : 'คุณดูทะเบียนเครื่องมือได้อย่างเดียว'}
          </span>

          <AssetRegisterTitleBar
            title={pageMeta.title}
            description={pageMeta.description}
            departmentBadgeText={departmentBadgeText}
            departmentLocked={!canReadAllDepts}
            isDccUser={isDccUser}
            canAddAsset={canAddAsset}
            onOpenTypes={openTypesSettings}
            onAdd={openCreateModal}
          />

          {!canAddAsset && (
            <div role="note" className="rounded-xl bg-slate-50 border border-slate-200/80 px-4 py-2.5 text-xs text-slate-600 flex items-center gap-2">
              <Info size={15} className="text-slate-400 shrink-0" />
              <span>การเพิ่ม แก้ไข ปลดออก และนำกลับมาใช้ ทำโดยหัวหน้าแผนก (ระดับ L4 ขึ้นไป) ของแผนกเจ้าของเครื่องมือ หรือ DCC</span>
            </div>
          )}

          <AssetFilterToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filterType={filterType}
            onFilterTypeChange={setFilterType}
            assetTypes={assetTypes}
            canReadAllDepts={canReadAllDepts}
            filterDept={filterDept}
            onFilterDeptChange={setFilterDept}
            activeDepartments={activeDepartments}
            onClear={handleClearFilters}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            counts={counts}
          />

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-500 text-sm font-medium">
                กำลังโหลดข้อมูลทะเบียนเครื่องมือ...
              </div>
            ) : displayedAssets.length === 0 ? (
              <AssetRegisterEmptyState
                scopedDepartment={scopedDeptInfo}
                activeTab={activeTab}
                canAddAsset={canAddAsset}
                isDepartmentEmpty={isDepartmentEmpty}
                onAdd={openCreateModal}
              />
            ) : (
              <AssetRegisterTable
                assets={displayedAssets}
                isMobile={isMobile}
                currentUser={currentUser}
                showDepartment={canReadAllDepts && !filterDept}
                onOpenHistory={openHistoryModal}
                onEdit={openEditModal}
                onRetire={openRetireModal}
                onReactivate={openReactivateModal}
              />
            )}
          </div>
        </>
      )}

      <AssetFormModal
        formOpen={formOpen}
        setFormOpen={setFormOpen}
        editingAsset={editingAsset}
        form={form}
        setForm={setForm}
        formError={formError}
        savingForm={savingForm}
        handleSaveAsset={handleSaveAsset}
        formTypeOptions={formTypeOptions}
        assetTypes={assetTypes}
        loadingAssetTypes={loading && assetTypes.length === 0}
        activeDepartments={editingAsset ? formDepartments : formDepartments.filter((d) => !currentUser?.vccEnabledDepartments || currentUser.vccEnabledDepartments.includes(d.code))}
        canTransfer={isDccUser}
        isDepartmentLocked={!isDccUser}
      />

      <AssetStatusModal
        statusModal={statusModal}
        setStatusModal={setStatusModal}
        statusReason={statusReason}
        setStatusReason={setStatusReason}
        statusError={statusError}
        statusImpact={statusImpact}
        savingStatus={savingStatus}
        handleConfirmStatusChange={handleConfirmStatusChange}
      />

      <AssetDetailDrawer
        isOpen={detailModalOpen}
        onClose={handleCloseDetailModal}
        loading={loadingDetail}
        data={detailData}
        onEdit={openEditModal}
        onRetire={openRetireModal}
        onReactivate={openReactivateModal}
        canManage={detailData?.asset ? canManageVccAsset(currentUser, detailData.asset.department) : false}
      />

      <AssetTypesModal
        typesModalOpen={typesModalOpen}
        setTypesModalOpen={setTypesModalOpen}
        newTypeName={newTypeName}
        setNewTypeName={setNewTypeName}
        handleAddDraftType={handleAddDraftType}
        draftTypes={draftTypes}
        handleRemoveDraftType={handleRemoveDraftType}
        savingTypes={savingTypes}
        handleSaveTypes={handleSaveTypes}
      />
    </div>
  );
};

const AssetRegisterPage = (props) => {
  const inRouter = useInRouterContext();
  if (!inRouter) {
    return (
      <MemoryRouter initialEntries={props.initialEntries || ['/vcc']}>
        <AssetRegisterPageInner {...props} />
      </MemoryRouter>
    );
  }
  return <AssetRegisterPageInner {...props} />;
};

export default AssetRegisterPage;
