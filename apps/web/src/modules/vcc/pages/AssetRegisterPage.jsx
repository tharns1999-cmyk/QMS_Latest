import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useInRouterContext, useLocation, useNavigate, useSearchParams, MemoryRouter } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Wrench,
  Calendar,
  ClipboardList,
  BarChart3,
  Plus,
  Search,
  SlidersHorizontal,
  History,
  Edit3,
  Archive,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle
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
  AssetDetailHistoryModal,
  AssetTypesModal
} from '../components/AssetRegisterModals';
import { filterReadableDepartments, manageableVccDepartments, canManageVccAsset, getUserDeptCodes } from '../utils/departmentScope';
import AnnualPlanMatrixSection from '../components/AnnualPlanMatrixSection';
import WorkOrderSection from '../components/WorkOrderSection';
import VccDashboardSection from '../components/VccDashboardSection';
import VccTaskInboxSection from '../components/VccTaskInboxSection';
import MobileCollapsible from '../components/MobileCollapsible';
import { getAssetStatusLabel } from '../utils/statusLabels';

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
  const { departments: storeDepts, masterDepartments, currentUser } = useStore();

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
    if (p.includes('/vcc/plans')) return 'ANNUAL_PLAN';
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
        nextView === 'ANNUAL_PLAN' ? '/vcc/plans' :
        nextView === 'ASSETS' ? (targetAssetId ? `/vcc/assets?asset=${encodeURIComponent(targetAssetId)}` : '/vcc/assets') :
        '/vcc/dashboard';
      const currentFullPath = (location.pathname || '') + (location.search || '');
      if (currentFullPath !== targetPath) {
        navigate(targetPath);
      }
    }
  }, [navigate, location?.pathname, location?.search]);

  // Separate status tabs: ACTIVE and RETIRED are never mixed in one list.
  const [activeTab, setActiveTab] = useState('ACTIVE');
  const [assets, setAssets] = useState([]);
  const [assetTypes, setAssetTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Department filter (Flat Instrument Register — no category navigation)
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterType, setFilterType] = useState('');
  // DCC manages every department; L4+ only their own VCC department(s). The server enforces the same rule; here it only decides what is shown.
  const isDccUser = Boolean(currentUser?.isDcc);
  const manageableDepts = useMemo(() => manageableVccDepartments(currentUser), [currentUser]);
  const canAddAsset = manageableDepts.length > 0;
  const myDepts = useMemo(() => getUserDeptCodes(currentUser), [currentUser]);
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

  const openHistoryModal = useCallback(async (assetId, updateUrl = true) => {
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
      if (detailModalOpen) {
        setDetailModalOpen(false);
        setDetailData(null);
      }
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
      const [list, types] = await Promise.all([
        fetchVccAssets({
          status: activeTab,
          department: filterDept,
          asset_type: filterType,
          calibratable_only: true,
          q: searchQuery
        }),
        fetchVccAssetTypes()
      ]);
      setAssets(list);
      setAssetTypes(types);
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถโหลดข้อมูลทะเบียนเครื่องมือได้');
    } finally {
      setLoading(false);
    }
  }, [activeTab, filterDept, filterType, searchQuery]);

  const displayedAssets = assets;

  useEffect(() => {
    if (moduleView === 'ASSETS') {
      loadData();
    }
  }, [loadData, moduleView]);

  const openCreateModal = () => {
    setEditingAsset(null);
    setFormError('');
    setForm({
      ...EMPTY_FORM,
      asset_type: assetTypes[0] || '',
      department: formDepartments[0]?.code || ''
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

  const hasTestData = assets.some((a) => String(a.name || '').includes('[ข้อมูลทดสอบ]'));

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

      {/* Compact Page Header: title + one-line description (for ASSETS, ANNUAL_PLAN, DASHBOARD) */}
      {moduleView !== 'WORK_ORDERS' && (
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
          {hasTestData && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 text-amber-900 text-sm">
              <AlertTriangle size={18} className="text-amber-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <MobileCollapsible summary="หมายเหตุข้อมูลจำลอง">
                <span className="font-bold">หมายเหตุข้อมูลจำลอง:</span>{' '}
                รายการที่มีป้าย <span className="font-semibold">[ข้อมูลทดสอบ]</span> เป็นข้อมูลตัวอย่างสำหรับทดสอบบน Localhost เท่านั้น ยังไม่ใช่ข้อมูลนำเข้าจากไฟล์ Excel จริง
                </MobileCollapsible>
              </div>
            </div>
          )}

          {/* Management panel: who may do what, and the add / settings buttons, in plain view instead of the page corner */}
          <section aria-label="จัดการเครื่องมือ" className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900">จัดการเครื่องมือ</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {isDccUser && (
                  <button
                    type="button"
                    onClick={openTypesSettings}
                    className="inline-flex items-center gap-2 px-4 py-2.5 h-10 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
                  >
                    <SlidersHorizontal size={15} />
                    <span>ตั้งค่าประเภทเครื่องมือ</span>
                  </button>
                )}
                {canAddAsset && (
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="inline-flex items-center gap-2 px-4 py-2.5 h-10 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
                  >
                    <Plus size={16} />
                    <span>เพิ่มเครื่องมือ</span>
                  </button>
                )}
              </div>
            </div>
            <MobileCollapsible summary="สิทธิ์ของคุณและคำอธิบาย" className="space-y-3">
            <p className="text-sm text-slate-600" data-testid="asset-manage-summary">
                  {isDccUser
                    ? 'คุณเป็น DCC: จัดการเครื่องมือได้ทุกแผนก โอนเครื่องมือข้ามแผนกได้ และตั้งค่าประเภทเครื่องมือได้'
                    : canAddAsset
                      ? `คุณจัดการเครื่องมือของแผนก ${manageableDepts.join(', ')} ได้ (เพิ่ม แก้ไข ปลดออก นำกลับมาใช้) เครื่องมือของแผนกอื่นดูได้อย่างเดียว`
                      : 'คุณดูทะเบียนเครื่องมือได้อย่างเดียว'}
            </p>
            {!canAddAsset && (
              <div role="note" className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700">
                การเพิ่ม แก้ไข ปลดออก และนำกลับมาใช้ ทำโดยหัวหน้าแผนก (ระดับ L4 ขึ้นไป) ของแผนกเจ้าของเครื่องมือ หรือ DCC
                {myDepts.length > 0 ? ` — แผนกของคุณคือ ${myDepts.join(', ')}` : ''} · การตั้งค่าประเภทเครื่องมือและการโอนข้ามแผนกเป็นหน้าที่ของ DCC
              </div>
            )}
            <p className="text-xs text-slate-500">
              <span className="font-semibold text-slate-700">ปลดออกจากทะเบียน</span> = เลิกใช้เครื่องมือนั้นทั้งระบบ (ไม่ลบ ประวัติอยู่ครบ นำกลับมาใช้ได้) ·{' '}
              <span className="font-semibold text-slate-700">นำออกจากแผน</span> = เอาออกจากแผนประจำปีเท่านั้น ทำที่หน้าแผนประจำปี เครื่องมือยังอยู่ในทะเบียน
            </p>
            </MobileCollapsible>
          </section>

          {/* Status Tabs & Filters */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="สถานะเครื่องมือ">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'ACTIVE'}
                  onClick={() => setActiveTab('ACTIVE')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                    activeTab === 'ACTIVE'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <CheckCircle2 size={16} />
                  <span>ใช้งานปกติ</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'RETIRED'}
                  onClick={() => setActiveTab('RETIRED')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                    activeTab === 'RETIRED'
                      ? 'bg-rose-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Archive size={16} />
                  <span>ปลดออกแล้ว</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'ON_HOLD'}
                  onClick={() => setActiveTab('ON_HOLD')}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                    activeTab === 'ON_HOLD'
                      ? 'bg-amber-700 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <span>ระงับใช้</span>
                </button>
              </div>

              <div className="text-sm font-medium text-slate-600">
                แสดงเฉพาะสถานะ <span className="font-bold text-slate-800">{getAssetStatusLabel(activeTab)}</span> ({displayedAssets.length} เครื่อง)
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="relative md:col-span-2">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ค้นหารหัสเครื่องมือ, ชื่อ, แผนก, Serial, รุ่น, ที่ตั้ง..."
                  className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-300 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <select
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                aria-label="กรองตามแผนก"
                className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-indigo-600"
              >
                <option value="">ทุกแผนก (Master Data)</option>
                {activeDepartments.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} — {d.nameTh}
                  </option>
                ))}
              </select>

              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                aria-label="กรองตามประเภท"
                className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-indigo-600"
              >
                <option value="">ทุกประเภท</option>
                {assetTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Assets Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-500 text-sm font-medium">
                กำลังโหลดข้อมูลทะเบียนเครื่องมือ...
              </div>
            ) : displayedAssets.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <div className="text-slate-700 font-bold text-base">
                  ไม่พบรายการเครื่องมือในสถานะ {getAssetStatusLabel(activeTab)}
                </div>
                <p className="text-slate-500 text-sm">
                  {canAddAsset ? 'ลองปรับเงื่อนไขการค้นหา หรือกดปุ่ม “เพิ่มเครื่องมือ” ด้านบน' : 'ลองปรับเงื่อนไขการค้นหา'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                      <th className="py-3.5 px-4">รหัสเครื่องมือ</th>
                      <th className="py-3.5 px-4">ชื่อเครื่องมือ / รุ่น</th>
                      <th className="py-3.5 px-4">ประเภท</th>
                      <th className="py-3.5 px-4">Serial No.</th>
                      <th className="py-3.5 px-4">แผนก / ที่ตั้ง</th>
                      <th className="py-3.5 px-4">สถานะ</th>
                      <th className="py-3.5 px-4 text-right">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {displayedAssets.map((asset) => {
                      const isComposite = asset.group_nature === 'COMPOSITE_SET';
                      return (
                        <tr key={asset.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4 align-top">
                            <div className="font-mono font-bold text-sm text-slate-900">{asset.asset_code}</div>
                            {isComposite && (
                              <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 text-xs font-semibold">
                                ชุดเครื่องมือ (Composite Set)
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 align-top">
                            <div className="font-semibold text-slate-900 text-sm">{asset.name}</div>
                            {asset.model && <div className="text-xs text-slate-600 mt-0.5">รุ่น: {asset.model}</div>}
                            {isComposite && asset.composite_details && (
                              <div className="text-xs text-teal-800 mt-1">
                                <span className="font-semibold">อุปกรณ์ในชุด:</span> {asset.composite_details}
                              </div>
                            )}
                            {asset.status === 'RETIRED' && asset.retired_reason && (
                              <div className="mt-1.5 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1">
                                <span className="font-bold">เหตุผลที่ปลดออก:</span> {asset.retired_reason}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 align-top">
                            <span className="inline-flex px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-medium">
                              {asset.asset_type}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 align-top font-mono text-xs text-slate-800">
                            {asset.serial_no || <span className="text-slate-400">-</span>}
                          </td>

                          <td className="py-3.5 px-4 align-top">
                            <div className="font-semibold text-slate-800 text-sm">
                              {asset.department} {asset.department_name_th ? `(${asset.department_name_th})` : ''}
                            </div>
                            <div className="text-xs text-slate-600 mt-0.5">{asset.location || 'ไม่ระบุที่ตั้ง'}</div>
                            {(() => {
                              const mine = myDepts.includes(String(asset.department).toUpperCase());
                              const canManage = canManageVccAsset(currentUser, asset.department);
                              return (
                                <span
                                  data-testid="asset-ownership"
                                  className={`mt-1 inline-flex px-2 py-0.5 rounded-md border text-xs font-semibold ${
                                    canManage ? 'bg-indigo-50 text-indigo-800 border-indigo-200' : 'bg-slate-50 text-slate-600 border-slate-200'
                                  }`}
                                >
                                  {canManage ? (mine ? 'แผนกของฉัน • จัดการได้' : 'จัดการได้ (DCC)') : mine ? 'แผนกของฉัน • ดูอย่างเดียว' : 'แผนกอื่น • ดูอย่างเดียว'}
                                </span>
                              );
                            })()}
                          </td>

                          <td className="py-3.5 px-4 align-top">
                            {asset.status === 'ACTIVE' ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                                <CheckCircle2 size={13} />
                                ใช้งานปกติ
                              </span>
                            ) : asset.status !== 'RETIRED' ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold">
                                {asset.status === 'ON_HOLD' ? 'ระงับใช้' : 'ซ่อมบำรุง'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold">
                                <XCircle size={13} />
                                ปลดออกแล้ว
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 align-top text-right">
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openHistoryModal(asset.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs sm:text-sm font-semibold hover:bg-slate-50 cursor-pointer"
                              >
                                <History size={13} />
                                <span>ประวัติ</span>
                              </button>

                              {asset.status === 'ACTIVE' && canManageVccAsset(currentUser, asset.department) ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(asset)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs sm:text-sm font-semibold hover:bg-indigo-100 cursor-pointer"
                                  >
                                    <Edit3 size={13} />
                                    <span>แก้ไข</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openRetireModal(asset)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-xs sm:text-sm font-semibold hover:bg-rose-100 cursor-pointer"
                                  >
                                    <Archive size={13} />
                                    <span>ปลดออกจากทะเบียน</span>
                                  </button>
                                </>
                              ) : asset.status === 'RETIRED' && canManageVccAsset(currentUser, asset.department) ? (
                                <button
                                  type="button"
                                  onClick={() => openReactivateModal(asset)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs sm:text-sm font-semibold hover:bg-amber-100 cursor-pointer"
                                >
                                  <RotateCcw size={13} />
                                  <span>นำกลับมาใช้ (Reactivate)</span>
                                </button>
                              ) : asset.status === 'ON_HOLD' || asset.status === 'UNDER_REPAIR' ? (
                                <span className="text-xs text-slate-500 max-w-[11rem] text-right">ปลดระงับที่หน้า “ใบสั่งงาน” เมื่อประเมินผลแล้ว</span>
                              ) : (
                                <span className="text-xs text-slate-500 max-w-[12rem] text-right" data-testid="asset-responsible">
                                  ผู้รับผิดชอบ: หัวหน้าแผนก {asset.department} (L4 ขึ้นไป) หรือ DCC
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
        activeDepartments={formDepartments}
        canTransfer={isDccUser}
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

      <AssetDetailHistoryModal
        detailModalOpen={detailModalOpen}
        setDetailModalOpen={handleCloseDetailModal}
        loadingDetail={loadingDetail}
        detailData={detailData}
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
