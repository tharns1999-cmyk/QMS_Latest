import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useInRouterContext, useLocation, useNavigate, MemoryRouter } from 'react-router-dom';
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
  FolderTree,
  CheckCircle2,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import useStore from '../../../store/useStore';
import {
  fetchVccAssets,
  fetchVccAssetDetail,
  fetchVccAssetTypes,
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
import AnnualPlanMatrixSection from '../components/AnnualPlanMatrixSection';
import WorkOrderSection from '../components/WorkOrderSection';
import VccDashboardSection from '../components/VccDashboardSection';

const EMPTY_FORM = {
  asset_code: '',
  name: '',
  asset_type: '',
  serial_no: '',
  model: '',
  location: '',
  department: '',
  is_group: false,
  parent_id: ''
};

const AssetRegisterPageInner = () => {
  const { departments: storeDepts, masterDepartments } = useStore();

  const activeDepartments = useMemo(() => {
    const raw = masterDepartments?.length ? masterDepartments : storeDepts || [];
    return raw
      .map((d) => ({
        code: d.code || d.deptCode || d.id,
        nameTh: d.name_th || d.nameTh || d.name || d.code,
        status: d.status || 'ACTIVE'
      }))
      .filter((d) => d.code && d.status === 'ACTIVE');
  }, [masterDepartments, storeDepts]);

  const location = useLocation();
  const navigate = useNavigate();

  // URL-driven navigation synchronized with Sidebar
  const routeView = useMemo(() => {
    const p = location?.pathname || '';
    if (p.includes('/vcc/work-orders')) return 'WORK_ORDERS';
    if (p.includes('/vcc/plans')) return 'ANNUAL_PLAN';
    if (p.includes('/vcc/assets')) return 'ASSETS';
    if (p.includes('/vcc/dashboard')) return 'DASHBOARD';
    if (p === '/vcc' || p === '/vcc/') return 'DASHBOARD';
    return null;
  }, [location?.pathname]);

  const [localModuleView, setLocalModuleView] = useState('ASSETS');
  const moduleView = routeView || localModuleView;

  const setModuleView = useCallback((nextView) => {
    setLocalModuleView(nextView);
    if (navigate && location?.pathname && location.pathname.startsWith('/vcc')) {
      const targetPath =
        nextView === 'WORK_ORDERS' ? '/vcc/work-orders' :
        nextView === 'ANNUAL_PLAN' ? '/vcc/plans' :
        nextView === 'ASSETS' ? '/vcc/assets' : '/vcc/dashboard';
      if (location.pathname !== targetPath) {
        navigate(targetPath);
      }
    }
  }, [navigate, location?.pathname]);

  // Separate status tabs: ACTIVE and RETIRED are never mixed in one list.
  const [activeTab, setActiveTab] = useState('ACTIVE');
  const [assets, setAssets] = useState([]);
  const [activeGroups, setActiveGroups] = useState([]);
  const [assetTypes, setAssetTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterKind, setFilterKind] = useState('');
  const [filterParent, setFilterParent] = useState('');

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

  // History / Detail Modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Asset Types Settings Modal
  const [typesModalOpen, setTypesModalOpen] = useState(false);
  const [draftTypes, setDraftTypes] = useState([]);
  const [newTypeName, setNewTypeName] = useState('');
  const [savingTypes, setSavingTypes] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [list, groups, types] = await Promise.all([
        fetchVccAssets({
          status: activeTab,
          department: filterDept,
          asset_type: filterType,
          parent_id: filterParent,
          is_group: filterKind,
          q: searchQuery
        }),
        fetchVccAssets({ status: 'ACTIVE', is_group: '1' }),
        fetchVccAssetTypes()
      ]);
      setAssets(list);
      setActiveGroups(groups);
      setAssetTypes(types);
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถโหลดข้อมูลทะเบียนเครื่องมือได้');
    } finally {
      setLoading(false);
    }
  }, [activeTab, filterDept, filterType, filterParent, filterKind, searchQuery]);

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
      department: activeDepartments[0]?.code || ''
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
      is_group: Boolean(asset.is_group),
      parent_id: asset.parent_id || ''
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
        is_group: Boolean(form.is_group),
        parent_id: form.is_group ? null : (form.parent_id || null)
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

  const openRetireModal = (asset) => {
    setStatusModal({ mode: 'RETIRE', asset });
    setStatusReason('');
    setStatusError('');
  };

  const openReactivateModal = (asset) => {
    setStatusModal({ mode: 'REACTIVATE', asset });
    setStatusReason('');
    setStatusError('');
  };

  const handleConfirmStatusChange = async (e) => {
    e.preventDefault();
    if (!statusModal) return;
    setSavingStatus(true);
    setStatusError('');
    try {
      if (statusModal.mode === 'RETIRE') {
        await retireVccAsset(statusModal.asset.id, statusReason);
        toast.success(`ปลดออกเครื่องมือ ${statusModal.asset.asset_code} แล้ว`);
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

  const openHistoryModal = async (assetId) => {
    setDetailModalOpen(true);
    setLoadingDetail(true);
    setDetailData(null);
    try {
      const detail = await fetchVccAssetDetail(assetId);
      setDetailData(detail);
    } catch (err) {
      toast.error(err.message || 'ไม่สามารถดึงประวัติการแก้ไขได้');
      setDetailModalOpen(false);
    } finally {
      setLoadingDetail(false);
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
          breadcrumb: 'ภาพรวมและแจ้งเตือน',
          title: 'ภาพรวมและแจ้งเตือน (Dashboard & Alerts)',
          description: 'สรุป KPI งานทวนสอบ/สอบเทียบ ศูนย์แจ้งเตือนตามกติกา และส่งออกรายงานประจำปี',
          Icon: BarChart3
        };
      case 'WORK_ORDERS':
        return {
          breadcrumb: 'ใบสั่งงานและบันทึกผล',
          title: 'ใบสั่งงานและบันทึกผล (Work Orders)',
          description: 'เปิดใบสั่งงานตามแผน เลื่อนวันครบกำหนด บันทึกผลพร้อมใบรับรอง ตรวจรับปิดงาน และควบคุมการระงับใช้',
          Icon: ClipboardList
        };
      case 'ANNUAL_PLAN':
        return {
          breadcrumb: 'แผนการทวนสอบประจำปี',
          title: 'แผนการทวนสอบเครื่องมือประจำปี (FM-QC-46)',
          description: 'ตารางแผนการทวนสอบเครื่องมือประจำปี 12 เดือน คำนวณวันครบกำหนดตามกติกา และอนุมัติแผนตาม Approval Matrix',
          Icon: Calendar
        };
      case 'ASSETS':
      default:
        return {
          breadcrumb: 'ทะเบียนเครื่องมือวัด',
          title: 'ทะเบียนเครื่องมือวัด (Equipment Register)',
          description: 'จัดการทะเบียนเครื่องมือวัดและกลุ่มเครื่องมือ ตรวจสอบรหัสเครื่องมือไม่ให้ซ้ำทั้งบริษัท และบันทึกประวัติการแก้ไขทุกขั้นตอน',
          Icon: Wrench
        };
    }
  }, [moduleView]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8">
      {/* Accessible navigation fallback for headless tests & assistive technology */}
      <div className="sr-only" role="navigation" aria-label="เมนูย่อยระบบ VCC">
        <button
          type="button"
          onClick={() => setModuleView('DASHBOARD')}
          aria-label="ภาพรวมและรายงาน (Dashboard & Export)"
        >
          ภาพรวมและรายงาน (Dashboard & Export)
        </button>
        <button
          type="button"
          onClick={() => setModuleView('WORK_ORDERS')}
          aria-label="ใบสั่งงานและบันทึกผล (Work Orders)"
        >
          ใบสั่งงานและบันทึกผล (Work Orders)
        </button>
        <button
          type="button"
          onClick={() => setModuleView('ANNUAL_PLAN')}
          aria-label="แผนการทวนสอบประจำปี (FM-QC-46)"
        >
          แผนการทวนสอบประจำปี (FM-QC-46)
        </button>
        <button
          type="button"
          onClick={() => setModuleView('ASSETS')}
          aria-label="ทะเบียนเครื่องมือ (Asset Register)"
        >
          ทะเบียนเครื่องมือ (Asset Register)
        </button>
      </div>

      {/* Enterprise Unified Page Header */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 md:p-6 shadow-xs transition-all">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            {/* Breadcrumb Navigation Context */}
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <span className="hover:text-slate-700 transition-colors">พอร์ทัลหลัก</span>
              <span className="text-slate-300">/</span>
              <span className="text-indigo-600 font-semibold">ศูนย์ทวนสอบและสอบเทียบ (VCC)</span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-800 font-semibold truncate">{pageMeta.breadcrumb}</span>
            </div>

            {/* Page Title & Icon */}
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100/80 text-indigo-600 flex items-center justify-center shrink-0 shadow-2xs">
                <pageMeta.Icon size={20} />
              </div>
              <span className="truncate">{pageMeta.title}</span>
            </h1>

            {/* Subtitle helper */}
            <p className="text-xs md:text-sm text-slate-600 pl-0.5">
              {pageMeta.description}
            </p>
          </div>

          {/* Contextual Actions (for ASSETS page) */}
          {moduleView === 'ASSETS' && (
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={openTypesSettings}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs md:text-sm font-semibold hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
              >
                <SlidersHorizontal size={15} />
                <span>ตั้งค่าประเภทเครื่องมือ</span>
              </button>

              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs md:text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
              >
                <Plus size={16} />
                <span>เพิ่มเครื่องมือ / กลุ่มเครื่องมือ</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {moduleView === 'ANNUAL_PLAN' ? (
        <AnnualPlanMatrixSection activeDepartments={activeDepartments} />
      ) : moduleView === 'WORK_ORDERS' ? (
        <WorkOrderSection activeDepartments={activeDepartments} />
      ) : moduleView === 'DASHBOARD' ? (
        <VccDashboardSection onNavigateToWorkOrders={() => setModuleView('WORK_ORDERS')} />
      ) : (
        <>
          {hasTestData && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 text-amber-900 text-sm">
              <AlertTriangle size={18} className="text-amber-600 shrink-0" />
              <div>
                <span className="font-bold">หมายเหตุข้อมูลจำลอง:</span>{' '}
                รายการที่มีป้าย <span className="font-semibold">[ข้อมูลทดสอบ]</span> เป็นข้อมูลตัวอย่างสำหรับทดสอบบน Localhost เท่านั้น ยังไม่ใช่ข้อมูลนำเข้าจากไฟล์ Excel จริง
              </div>
            </div>
          )}

          {/* Status Tabs & Filters */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2" role="tablist" aria-label="สถานะเครื่องมือ">
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
                  <span>ใช้งานปกติ (ACTIVE)</span>
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
                  <span>ปลดออกแล้ว (RETIRED)</span>
                </button>
              </div>

              <div className="text-xs font-medium text-slate-600">
                แสดงเฉพาะสถานะ <span className="font-bold text-slate-800">{activeTab}</span> ({assets.length} รายการ)
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative lg:col-span-2">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ค้นหารหัสเครื่องมือ, ชื่อ, Serial, รุ่น, ที่ตั้ง..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <select
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                aria-label="กรองตามแผนก"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-indigo-600"
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
                aria-label="กรองตามประเภทเครื่องมือ"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-indigo-600"
              >
                <option value="">ทุกประเภทเครื่องมือ</option>
                {assetTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <select
                value={filterKind}
                onChange={(e) => setFilterKind(e.target.value)}
                aria-label="กรองตามรูปแบบกลุ่มหรือรายตัว"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-indigo-600"
              >
                <option value="">ทุกรูปแบบ (กลุ่ม + รายตัว)</option>
                <option value="0">เฉพาะเครื่องมือรายตัว</option>
                <option value="1">เฉพาะกลุ่มเครื่องมือแม่</option>
              </select>
            </div>

            {activeGroups.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                <span className="font-semibold text-slate-500">กรองตามกลุ่มแม่:</span>
                <button
                  type="button"
                  onClick={() => setFilterParent('')}
                  className={`px-2.5 py-1 rounded-lg border font-medium cursor-pointer ${
                    filterParent === ''
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  ทั้งหมด
                </button>
                {activeGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setFilterParent(g.id === filterParent ? '' : g.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-medium cursor-pointer ${
                      filterParent === g.id
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <FolderTree size={12} />
                    <span>{g.asset_code} ({g.active_child_count || 0})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Assets Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-500 text-sm font-medium">
                กำลังโหลดข้อมูลทะเบียนเครื่องมือ...
              </div>
            ) : assets.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <div className="text-slate-700 font-bold text-base">
                  ไม่พบรายการเครื่องมือในสถานะ {activeTab === 'ACTIVE' ? 'ใช้งานปกติ (ACTIVE)' : 'ปลดออกแล้ว (RETIRED)'}
                </div>
                <p className="text-slate-500 text-xs">
                  ลองปรับเงื่อนไขการค้นหา หรือกดปุ่ม &ldquo;เพิ่มเครื่องมือ / กลุ่มเครื่องมือ&rdquo; ด้านบน
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase">
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
                    {assets.map((asset) => {
                      const isGroup = Boolean(asset.is_group);
                      return (
                        <tr key={asset.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4 align-top">
                            <div className="font-mono font-bold text-slate-900">{asset.asset_code}</div>
                            {isGroup ? (
                              <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-bold">
                                <FolderTree size={11} />
                                กลุ่มแม่ (ลูก {asset.active_child_count || 0}/{asset.child_count || 0})
                              </span>
                            ) : asset.parent_asset_code ? (
                              <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200 text-xs font-medium">
                                อยู่ในกลุ่ม: {asset.parent_asset_code}
                              </span>
                            ) : (
                              <span className="mt-1 inline-block text-xs text-slate-500">เครื่องมือรายตัว</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 align-top">
                            <div className="font-semibold text-slate-900">{asset.name}</div>
                            {asset.model && <div className="text-xs text-slate-600 mt-0.5">รุ่น: {asset.model}</div>}
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
                            <div className="font-semibold text-slate-800">
                              {asset.department} {asset.department_name_th ? `(${asset.department_name_th})` : ''}
                            </div>
                            <div className="text-xs text-slate-600 mt-0.5">{asset.location || 'ไม่ระบุที่ตั้ง'}</div>
                          </td>

                          <td className="py-3.5 px-4 align-top">
                            {asset.status === 'ACTIVE' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                                <CheckCircle2 size={13} />
                                ใช้งานปกติ (ACTIVE)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold">
                                <XCircle size={13} />
                                ปลดออกแล้ว (RETIRED)
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 align-top text-right">
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openHistoryModal(asset.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                              >
                                <History size={13} />
                                <span>ประวัติ</span>
                              </button>

                              {asset.status === 'ACTIVE' ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(asset)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 cursor-pointer"
                                  >
                                    <Edit3 size={13} />
                                    <span>แก้ไข</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openRetireModal(asset)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100 cursor-pointer"
                                  >
                                    <Archive size={13} />
                                    <span>ปลดออก</span>
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openReactivateModal(asset)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 cursor-pointer"
                                >
                                  <RotateCcw size={13} />
                                  <span>นำกลับมาใช้ (Reactivate)</span>
                                </button>
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
        activeDepartments={activeDepartments}
        activeGroups={activeGroups}
      />

      <AssetStatusModal
        statusModal={statusModal}
        setStatusModal={setStatusModal}
        statusReason={statusReason}
        setStatusReason={setStatusReason}
        statusError={statusError}
        savingStatus={savingStatus}
        handleConfirmStatusChange={handleConfirmStatusChange}
      />

      <AssetDetailHistoryModal
        detailModalOpen={detailModalOpen}
        setDetailModalOpen={setDetailModalOpen}
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
      <MemoryRouter initialEntries={['/vcc']}>
        <AssetRegisterPageInner {...props} />
      </MemoryRouter>
    );
  }
  return <AssetRegisterPageInner {...props} />;
};

export default AssetRegisterPage;
