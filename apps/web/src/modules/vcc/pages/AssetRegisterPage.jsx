import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  Wrench,
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
  AlertTriangle,
  X,
  Trash2
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

const ACTION_LABELS = {
  VCC_ASSET_CREATED: { label: 'เพิ่มเครื่องมือใหม่', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  VCC_ASSET_UPDATED: { label: 'แก้ไขข้อมูลเครื่องมือ', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  VCC_ASSET_RETIRED: { label: 'ปลดออกเครื่องมือ (Retire)', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
  VCC_ASSET_REACTIVATED: { label: 'นำกลับมาใช้งาน (Reactivate)', badge: 'bg-amber-50 text-amber-700 border-amber-200' }
};

const FIELD_LABELS = {
  asset_code: 'รหัสเครื่องมือ',
  name: 'ชื่อเครื่องมือ',
  asset_type: 'ประเภท',
  serial_no: 'Serial No.',
  model: 'รุ่น (Model)',
  location: 'ที่ตั้ง',
  department: 'แผนก',
  is_group: 'รูปแบบกลุ่ม',
  parent_id: 'กลุ่มเครื่องมือแม่'
};

const formatThaiDateTime = (iso) => {
  if (!iso) return '-';
  try {
    return new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

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

const AssetRegisterPage = () => {
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
  const [statusModal, setStatusModal] = useState(null); // { mode: 'RETIRE' | 'REACTIVATE', asset }
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
    loadData();
  }, [loadData]);

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

  // Include current asset's type even if DCC removed it from settings so existing assets never break.
  const formTypeOptions = useMemo(() => {
    if (form.asset_type && !assetTypes.includes(form.asset_type)) {
      return [form.asset_type, ...assetTypes];
    }
    return assetTypes;
  }, [assetTypes, form.asset_type]);

  const hasTestData = assets.some((a) => String(a.name || '').includes('[ข้อมูลทดสอบ]'));

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold">
            <Wrench size={14} />
            <span>VCC • Phase 1 (เฉพาะเจ้าหน้าที่ DCC)</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            VCC (Verify and Calibration Center) — ทะเบียนเครื่องมือ
          </h1>
          <p className="text-sm text-slate-600">
            จัดการทะเบียนเครื่องมือวัดและกลุ่มเครื่องมือ ตรวจสอบรหัสเครื่องมือไม่ให้ซ้ำทั้งบริษัท และบันทึกประวัติการแก้ไขทุกขั้นตอน
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={openTypesSettings}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <SlidersHorizontal size={16} />
            <span>ตั้งค่าประเภทเครื่องมือ</span>
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
          >
            <Plus size={16} />
            <span>เพิ่มเครื่องมือ / กลุ่มเครื่องมือ</span>
          </button>
        </div>
      </div>

      {/* Test Data Notice Banner */}
      {hasTestData && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 text-amber-900 text-sm">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <div>
            <span className="font-bold">หมายเหตุข้อมูลจำลอง:</span>{' '}
            รายการที่มีป้าย <span className="font-semibold">[ข้อมูลทดสอบ]</span> เป็นข้อมูลตัวอย่างสำหรับทดสอบบน Localhost เท่านั้น ยังไม่ใช่ข้อมูลนำเข้าจากไฟล์ Excel จริง
          </div>
        </div>
      )}

      {/* Status Tabs (Never mix statuses in one list) & Filters */}
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
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Archive size={16} />
              <span>ปลดออกแล้ว (RETIRED)</span>
            </button>
          </div>

          <div className="text-xs font-medium text-slate-500">
            แสดงเฉพาะสถานะ <span className="font-bold text-slate-800">{activeTab}</span> ({assets.length} รายการ)
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-2">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหารหัสเครื่องมือ, ชื่อ, Serial, รุ่น, ที่ตั้ง..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
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
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
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
                          <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-medium">
                            อยู่ในกลุ่ม: {asset.parent_asset_code}
                          </span>
                        ) : (
                          <span className="mt-1 inline-block text-[11px] text-slate-400">เครื่องมือรายตัว</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        <div className="font-semibold text-slate-900">{asset.name}</div>
                        {asset.model && (
                          <div className="text-xs text-slate-500 mt-0.5">รุ่น: {asset.model}</div>
                        )}
                        {asset.status === 'RETIRED' && asset.retired_reason && (
                          <div className="mt-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1">
                            <span className="font-bold">เหตุผลที่ปลดออก:</span> {asset.retired_reason}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        <span className="inline-flex px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-medium">
                          {asset.asset_type}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 align-top font-mono text-xs text-slate-700">
                        {asset.serial_no || <span className="text-slate-400">-</span>}
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        <div className="font-semibold text-slate-800">
                          {asset.department} {asset.department_name_th ? `(${asset.department_name_th})` : ''}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {asset.location || 'ไม่ระบุที่ตั้ง'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        {asset.status === 'ACTIVE' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                            <CheckCircle2 size={13} />
                            ใช้งานปกติ (ACTIVE)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">
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

      {/* Add / Edit Asset Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editingAsset ? `แก้ไขข้อมูลเครื่องมือ (${editingAsset.asset_code})` : 'เพิ่มเครื่องมือ / กลุ่มเครื่องมือใหม่'}
              </h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveAsset} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Group vs Individual Switch */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-700">รูปแบบรายการ</label>
                <div className="flex flex-wrap gap-3">
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="is_group"
                      checked={!form.is_group}
                      disabled={Boolean(editingAsset && editingAsset.child_count > 0)}
                      onChange={() => setForm({ ...form, is_group: false })}
                    />
                    <span>เครื่องมือรายตัว (ใช้สร้างใบงานจริงในรอบถัดไป)</span>
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="is_group"
                      checked={Boolean(form.is_group)}
                      onChange={() => setForm({ ...form, is_group: true, parent_id: '' })}
                    />
                    <span>กลุ่มเครื่องมือแม่ (สำหรับรวมเครื่องมือลูก 1 ระดับ)</span>
                  </label>
                </div>
                {editingAsset && editingAsset.child_count > 0 && (
                  <p className="text-xs text-amber-700 font-medium">
                    * กลุ่มนี้มีเครื่องมือลูกผูกอยู่ ({editingAsset.child_count} รายการ) จึงไม่สามารถเปลี่ยนเป็นเครื่องมือรายตัวได้
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    รหัสเครื่องมือ (Asset Code) <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.asset_code}
                    onChange={(e) => setForm({ ...form, asset_code: e.target.value.toUpperCase() })}
                    placeholder={form.is_group ? 'เช่น GRP-SCALE' : 'เช่น ST002, SW001, TC001'}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono uppercase focus:outline-none focus:border-indigo-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ประเภทเครื่องมือ <span className="text-rose-600">*</span>
                  </label>
                  <select
                    required
                    value={form.asset_type}
                    onChange={(e) => setForm({ ...form, asset_type: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-indigo-600"
                  >
                    <option value="" disabled>
                      -- เลือกประเภทเครื่องมือ --
                    </option>
                    {formTypeOptions.map((t) => (
                      <option key={t} value={t}>
                        {t} {!assetTypes.includes(t) ? '(ประเภทเดิม)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ชื่อเครื่องมือ <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="ระบุชื่อเครื่องมือวัด หรือชื่อกลุ่มเครื่องมือ"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    แผนกเจ้าของ (Master Data) <span className="text-rose-600">*</span>
                  </label>
                  <select
                    required
                    disabled={activeDepartments.length === 0}
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-indigo-600 disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="" disabled>
                      {activeDepartments.length === 0 ? '-- โหลดแผนกไม่ได้ --' : '-- เลือกแผนก --'}
                    </option>
                    {activeDepartments.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.code} — {d.nameTh}
                      </option>
                    ))}
                  </select>
                  {activeDepartments.length === 0 && (
                    <p className="mt-1.5 text-xs text-rose-600 font-semibold">
                      ไม่สามารถโหลดแผนกจาก Master Data ได้ กรุณาตรวจสอบข้อมูลแผนกก่อนบันทึก
                    </p>
                  )}
                </div>

                {!form.is_group && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      กลุ่มเครื่องมือแม่ (ถ้าเป็นเครื่องมือลูก)
                    </label>
                    <select
                      value={form.parent_id}
                      onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-indigo-600"
                    >
                      <option value="">-- ไม่อยู่ในกลุ่ม (เครื่องมือเดี่ยว) --</option>
                      {activeGroups
                        .filter((g) => g.id !== editingAsset?.id)
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.asset_code} — {g.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    หมายเลขเครื่อง (Serial No.) <span className="text-slate-400 font-normal">(ว่างได้)</span>
                  </label>
                  <input
                    type="text"
                    value={form.serial_no}
                    onChange={(e) => setForm({ ...form, serial_no: e.target.value })}
                    placeholder="เช่น 40717388"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:border-indigo-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    รุ่น (Model) <span className="text-slate-400 font-normal">(ว่างได้)</span>
                  </label>
                  <input
                    type="text"
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder="เช่น Testo 176T4, Dixell XR120C"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">สถานที่ตั้ง / จุดใช้งาน</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="เช่น ห้องปฏิบัติการ QC, ห้องเย็น F1, จุดรับวัตถุดิบ WH"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={savingForm || activeDepartments.length === 0}
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                >
                  {savingForm ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Retire / Reactivate Modal */}
      {statusModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {statusModal.mode === 'RETIRE'
                  ? `ปลดออกเครื่องมือ (${statusModal.asset.asset_code})`
                  : `นำเครื่องมือกลับมาใช้งาน (${statusModal.asset.asset_code})`}
              </h2>
              <button
                type="button"
                onClick={() => setStatusModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmStatusChange} className="p-6 space-y-4">
              {statusError && (
                <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                  <span>{statusError}</span>
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-sm">
                <div className="font-bold text-slate-900">
                  {statusModal.asset.asset_code} — {statusModal.asset.name}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  แผนก: {statusModal.asset.department} • ประเภท: {statusModal.asset.asset_type}
                </div>
              </div>

              {statusModal.mode === 'RETIRE' && statusModal.asset.active_child_count > 0 && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
                  ไม่สามารถปลดออกกลุ่มแม่นี้ได้ เนื่องจากยังมีเครื่องมือลูกที่ใช้งานอยู่ (ACTIVE) จำนวน{' '}
                  <span className="font-bold">{statusModal.asset.active_child_count} รายการ</span> กรุณาย้ายหรือปลดออกเครื่องมือลูกก่อน
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {statusModal.mode === 'RETIRE' ? 'เหตุผลในการปลดออก' : 'เหตุผลในการนำกลับมาใช้งาน'}{' '}
                  <span className="text-rose-600">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder={
                    statusModal.mode === 'RETIRE'
                      ? 'ระบุสาเหตุ เช่น ชำรุดไม่สามารถซ่อมได้ / ยกเลิกจุดใช้งาน...'
                      : 'ระบุสาเหตุ เช่น ซ่อมบำรุงและทวนสอบผ่านแล้ว...'
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStatusModal(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={
                    savingStatus ||
                    !statusReason.trim() ||
                    (statusModal.mode === 'RETIRE' && statusModal.asset.active_child_count > 0)
                  }
                  className={`px-5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50 cursor-pointer ${
                    statusModal.mode === 'RETIRE'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {savingStatus
                    ? 'กำลังบันทึก...'
                    : statusModal.mode === 'RETIRE'
                      ? 'ยืนยันการปลดออก'
                      : 'ยืนยันการนำกลับมาใช้'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History / Detail Modal */}
      {detailModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                รายละเอียดและประวัติการแก้ไข (Audit Log)
              </h2>
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 max-h-[80vh] overflow-y-auto space-y-5">
              {loadingDetail || !detailData ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  กำลังโหลดประวัติการแก้ไข...
                </div>
              ) : (
                <>
                  {/* Asset Summary */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono font-bold text-base text-slate-900">
                        {detailData.asset.asset_code} — {detailData.asset.name}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                          detailData.asset.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {detailData.asset.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-slate-600 pt-1">
                      <div><span className="font-semibold text-slate-800">ประเภท:</span> {detailData.asset.asset_type}</div>
                      <div><span className="font-semibold text-slate-800">แผนก:</span> {detailData.asset.department}</div>
                      <div><span className="font-semibold text-slate-800">Serial No.:</span> {detailData.asset.serial_no || '-'}</div>
                      <div><span className="font-semibold text-slate-800">รุ่น:</span> {detailData.asset.model || '-'}</div>
                      <div><span className="font-semibold text-slate-800">ที่ตั้ง:</span> {detailData.asset.location || '-'}</div>
                      <div>
                        <span className="font-semibold text-slate-800">กลุ่มแม่:</span>{' '}
                        {detailData.asset.parent_asset_code || (detailData.asset.is_group ? 'เป็นกลุ่มแม่' : '-')}
                      </div>
                    </div>
                  </div>

                  {/* Children List if Group — Strictly separated into ACTIVE ("ใช้งานอยู่") and RETIRED ("ปลดออกแล้ว") */}
                  {Boolean(detailData.asset.is_group) && (() => {
                    const activeChildren = (detailData.children || []).filter((ch) => ch.status === 'ACTIVE');
                    const retiredChildren = (detailData.children || []).filter((ch) => ch.status === 'RETIRED');
                    return (
                      <div className="space-y-4">
                        <div className="space-y-2" data-testid="group-children-active">
                          <h3 className="text-xs font-bold uppercase text-emerald-700 tracking-wider">
                            เครื่องมือลูกที่ใช้งานอยู่ ({activeChildren.length} รายการ)
                          </h3>
                          {activeChildren.length > 0 ? (
                            <div className="border border-emerald-200 rounded-xl divide-y divide-emerald-100 bg-emerald-50/30 text-xs">
                              {activeChildren.map((ch) => (
                                <div key={ch.id} className="px-3.5 py-2.5 flex items-center justify-between">
                                  <div>
                                    <span className="font-mono font-bold text-slate-900">{ch.asset_code}</span>{' '}
                                    <span className="text-slate-700">— {ch.name}</span>
                                  </div>
                                  <span className="px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800">
                                    ใช้งานอยู่ (ACTIVE)
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-500 italic">ไม่มีเครื่องมือลูกที่ใช้งานอยู่</div>
                          )}
                        </div>

                        <div className="space-y-2" data-testid="group-children-retired">
                          <h3 className="text-xs font-bold uppercase text-rose-700 tracking-wider">
                            เครื่องมือลูกที่ปลดออกแล้ว ({retiredChildren.length} รายการ)
                          </h3>
                          {retiredChildren.length > 0 ? (
                            <div className="border border-rose-200 rounded-xl divide-y divide-rose-100 bg-rose-50/30 text-xs">
                              {retiredChildren.map((ch) => (
                                <div key={ch.id} className="px-3.5 py-2.5 flex items-center justify-between">
                                  <div>
                                    <span className="font-mono font-bold text-slate-900">{ch.asset_code}</span>{' '}
                                    <span className="text-slate-700">— {ch.name}</span>
                                  </div>
                                  <span className="px-2 py-0.5 rounded-full font-bold bg-rose-100 text-rose-800">
                                    ปลดออกแล้ว (RETIRED)
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-500 italic">ไม่มีเครื่องมือลูกที่ปลดออกแล้ว</div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Audit Trail */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                      ประวัติการแก้ไข (Audit Log: VCC_ASSET_*)
                    </h3>
                    {detailData.history?.length === 0 ? (
                      <div className="text-xs text-slate-500">ไม่พบประวัติการแก้ไข</div>
                    ) : (
                      <div className="space-y-3">
                        {detailData.history.map((h) => {
                          const meta = ACTION_LABELS[h.action] || {
                            label: h.action,
                            badge: 'bg-slate-100 text-slate-700 border-slate-200'
                          };
                          const details = h.details || {};
                          const changedKeys =
                            h.action === 'VCC_ASSET_UPDATED' && details.before && details.after
                              ? Object.keys(details.after).filter(
                                  (k) => String(details.before[k] ?? '') !== String(details.after[k] ?? '')
                                )
                              : [];
                          return (
                            <div key={h.id} className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2 text-xs">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className={`px-2.5 py-0.5 rounded-md border font-bold ${meta.badge}`}>
                                  {meta.label} ({h.action})
                                </span>
                                <span className="text-slate-500 font-medium">
                                  {formatThaiDateTime(h.at)} • โดย {h.actor_name || h.actor_id || 'DCC'}
                                </span>
                              </div>

                              {details.reason && (
                                <div className="text-slate-800 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                                  <span className="font-bold">เหตุผล:</span> {details.reason}
                                </div>
                              )}

                              {changedKeys.length > 0 && (
                                <div className="space-y-1 pt-1">
                                  {changedKeys.map((k) => (
                                    <div key={k} className="text-slate-700">
                                      <span className="font-semibold">{FIELD_LABELS[k] || k}:</span>{' '}
                                      <span className="line-through text-rose-600">{String(details.before[k] || '-')}</span>{' '}
                                      → <span className="font-semibold text-emerald-700">{String(details.after[k] || '-')}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Asset Types Settings Modal */}
      {typesModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">ตั้งค่ารายการประเภทเครื่องมือ</h2>
              <button
                type="button"
                onClick={() => setTypesModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                เพิ่มหรือลบตัวเลือกประเภทเครื่องมือสำหรับใช้ในหน้าทะเบียนเครื่องมือ การลบประเภทออกจากรายการนี้จะไม่ทำให้เครื่องมือเดิมที่ใช้ประเภทนั้นอยู่เสียหาย
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddDraftType();
                    }
                  }}
                  placeholder="พิมพ์ชื่อประเภทเครื่องมือใหม่..."
                  className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-600"
                />
                <button
                  type="button"
                  onClick={handleAddDraftType}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 cursor-pointer"
                >
                  เพิ่มรายการ
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-200">
                {draftTypes.map((t) => (
                  <div key={t} className="px-3.5 py-2.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-800">{t}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDraftType(t)}
                      className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                      title={`ลบ ${t}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTypesModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={savingTypes}
                  onClick={handleSaveTypes}
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                >
                  {savingTypes ? 'กำลังบันทึก...' : 'บันทึกรายการตั้งค่า'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetRegisterPage;

