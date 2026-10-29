import React, { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  FolderTree,
  Calendar,
  Clock,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { computeDueDates, saveVccPlanItem, fetchVccPlanDetail } from '../api/vccPlanApi';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const FREQUENCY_PRESETS = [
  { label: 'รายปี', months: [1] },
  { label: 'รายครึ่งปี', months: [1, 7] },
  { label: 'รายไตรมาส', months: [1, 4, 7, 10] },
  { label: 'รายเดือน', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }
];

export const SmartAssetImportModal = ({
  open,
  onClose,
  plan,
  activeAssets = [],
  existingPlanItems = [],
  providers = [],
  activeDepartments = [],
  onImportSuccess
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState(plan?.department || '');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedAssetIds, setSelectedAssetIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [importError, setImportError] = useState('');

  // Default schedule settings for selected assets
  const [scheduleConfig, setScheduleConfig] = useState({
    provider_name: providers[0] || 'ห้องปฏิบัติการภายนอก',
    frequency_label: 'รายปี',
    planned_months: [1],
    responsible_dept: plan?.department || '',
    responsible_label: 'QC Sup.',
    remarks: ''
  });

  const existingAssetIdSet = useMemo(() => {
    return new Set((existingPlanItems || []).map((i) => i.asset_id));
  }, [existingPlanItems]);

  const assetTypes = useMemo(() => {
    return Array.from(new Set(activeAssets.map((a) => a.asset_type).filter(Boolean)));
  }, [activeAssets]);

  const filteredAssets = useMemo(() => {
    return activeAssets.filter((a) => {
      if (a.status !== 'ACTIVE') return false;
      if (deptFilter && a.department !== deptFilter) return false;
      if (typeFilter && a.asset_type !== typeFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const code = (a.asset_code || '').toLowerCase();
        const name = (a.name || '').toLowerCase();
        const model = (a.model || '').toLowerCase();
        const location = (a.location || '').toLowerCase();
        if (!code.includes(q) && !name.includes(q) && !model.includes(q) && !location.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [activeAssets, deptFilter, typeFilter, searchTerm]);

  if (!open || !plan) return null;

  const toggleSelectAsset = (assetId) => {
    setSelectedAssetIds((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]
    );
  };

  const handleSelectAllFiltered = () => {
    const availableIds = filteredAssets
      .filter((a) => !existingAssetIdSet.has(a.id))
      .map((a) => a.id);

    const allSelected = availableIds.every((id) => selectedAssetIds.includes(id));
    if (allSelected) {
      setSelectedAssetIds((prev) => prev.filter((id) => !availableIds.includes(id)));
    } else {
      setSelectedAssetIds((prev) => Array.from(new Set([...prev, ...availableIds])));
    }
  };

  const applyFrequencyPreset = (preset) => {
    setScheduleConfig((prev) => ({
      ...prev,
      frequency_label: preset.label,
      planned_months: preset.months
    }));
  };

  const toggleMonth = (m) => {
    setScheduleConfig((prev) => {
      const exists = prev.planned_months.includes(m);
      const next = exists
        ? prev.planned_months.filter((x) => x !== m)
        : [...prev.planned_months, m].sort((a, b) => a - b);
      return { ...prev, planned_months: next.length > 0 ? next : [m] };
    });
  };

  const previewDueDates = computeDueDates(
    plan.plan_year,
    scheduleConfig.planned_months,
    plan.due_date_rule
  );

  const handleImport = async (e) => {
    e.preventDefault();
    if (selectedAssetIds.length === 0) {
      setImportError('กรุณาเลือกเครื่องมือจากทะเบียนอย่างน้อย 1 รายการ');
      return;
    }
    setSaving(true);
    setImportError('');

    try {
      let count = 0;
      for (const assetId of selectedAssetIds) {
        const asset = activeAssets.find((a) => a.id === assetId);
        const payload = {
          asset_id: assetId,
          provider_name: scheduleConfig.provider_name,
          frequency_label: scheduleConfig.frequency_label,
          planned_months: scheduleConfig.planned_months,
          responsible_dept: scheduleConfig.responsible_dept || asset?.department || plan.department,
          responsible_label: scheduleConfig.responsible_label,
          remarks: scheduleConfig.remarks
        };
        await saveVccPlanItem(plan.id, payload);
        count++;
      }

      toast.success(`นำเข้าเครื่องมือจากทะเบียนเข้าสู่แผนสำเร็จ ${count} รายการ`);
      const refreshed = await fetchVccPlanDetail(plan.id);
      if (onImportSuccess) onImportSuccess(refreshed);
      onClose();
    } catch (err) {
      setImportError(err.message || 'ไม่สามารถนำเข้าเครื่องมือเข้าแผนได้');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                เลือกเครื่องมือจากทะเบียนเข้าสู่แผนปี {plan.plan_year} (FM-QC-46)
              </h2>
              <p className="text-sm text-slate-500 font-medium mt-0.5">
                เชื่อมโยงข้อมูลเครื่องมือจริงจาก Asset Register เพื่อกำหนดรอบการทวนสอบและวันครบกำหนดอัตโนมัติ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleImport} className="flex-1 overflow-y-auto p-5 space-y-4">
          {importError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center gap-2"
            >
              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
              <span>{importError}</span>
            </div>
          )}

          {/* Top Filter Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
            {/* Search Input */}
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหารหัส, ชื่อ, รุ่น, จุดติดตั้ง..."
                className="w-full h-10 pl-9 pr-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
              />
            </div>

            {/* Department Filter */}
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
            >
              <option value="">ทุกแผนก (Master Data)</option>
              {activeDepartments.map((d) => (
                <option key={d.code} value={d.code}>
                  แผนก {d.code} — {d.nameTh}
                </option>
              ))}
            </select>

            {/* Asset Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
            >
              <option value="">ทุกประเภทเครื่องมือ</option>
              {assetTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Section 1: Asset Selection Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="font-bold text-slate-800 flex items-center gap-2">
                <span>เลือกเครื่องมือวัดในทะเบียน ({filteredAssets.length} รายการที่ค้นพบ)</span>
                <span className="text-slate-400 font-normal">•</span>
                <span className="text-indigo-600 font-semibold">
                  เลือกแล้ว {selectedAssetIds.length} รายการ
                </span>
              </div>
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer underline"
              >
                เลือก/ยกเลิกทั้งหมดที่แสดง
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-slate-100/80 sticky top-0 z-10 border-b border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3 w-8 text-center">#</th>
                    <th className="py-2.5 px-3.5">รหัสเครื่องมือ</th>
                    <th className="py-2.5 px-3.5">ชื่อเครื่องมือ</th>
                    <th className="py-2.5 px-3">ประเภท</th>
                    <th className="py-2.5 px-3">แผนก</th>
                    <th className="py-2.5 px-3.5">สถานที่ติดตั้ง</th>
                    <th className="py-2.5 px-3.5 text-right">สถานะในแผน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAssets.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-500 font-medium">
                        ไม่พบเครื่องมือวัดตรงตามเงื่อนไขการค้นหา
                      </td>
                    </tr>
                  ) : (
                    filteredAssets.map((asset) => {
                      const isAlreadyInPlan = existingAssetIdSet.has(asset.id);
                      const isSelected = selectedAssetIds.includes(asset.id);
                      const isGroup = Number(asset.is_group) === 1;

                      return (
                        <tr
                          key={asset.id}
                          onClick={() => !isAlreadyInPlan && toggleSelectAsset(asset.id)}
                          className={`cursor-pointer transition-colors ${
                            isAlreadyInPlan
                              ? 'bg-slate-50/70 opacity-60 cursor-not-allowed'
                              : isSelected
                              ? 'bg-indigo-50/60'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isAlreadyInPlan}
                              onChange={() => toggleSelectAsset(asset.id)}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="py-2.5 px-3.5 font-mono font-bold text-slate-900">
                            {asset.asset_code}
                          </td>
                          <td className="py-2.5 px-3.5 font-semibold text-slate-800">
                            <div>{asset.name}</div>
                            {isGroup && (
                              <span className="inline-flex items-center gap-1 text-xs text-purple-700 font-semibold mt-0.5">
                                <FolderTree size={12} /> กลุ่มแม่
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 font-medium">{asset.asset_type}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-700">{asset.department}</td>
                          <td className="py-2.5 px-3.5 text-slate-500 font-medium">{asset.location || '-'}</td>
                          <td className="py-2.5 px-3.5 text-right">
                            {isAlreadyInPlan ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                                <CheckCircle2 size={13} className="text-slate-400" /> อยู่ในแผนแล้ว
                              </span>
                            ) : (
                              <span className="text-xs text-indigo-700 font-semibold bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                                พร้อมนำเข้า
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Shared Schedule Rule Configuration for Selected Items */}
          <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/30 space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Calendar size={16} className="text-indigo-600" />
                <span>กำหนดรอบการทวนสอบและวันครบกำหนด (สำหรับรายการที่เลือก)</span>
              </h3>
              <div className="text-xs text-slate-500 font-medium">
                กติกาวันครบกำหนด:{' '}
                <strong className="text-slate-800">
                  {plan.due_date_rule === 'START_OF_MONTH' ? 'วันที่ 1 ของเดือน' : 'วันสิ้นเดือน (END_OF_MONTH)'}
                </strong>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  สถาบัน / หน่วยงานที่ทวนสอบ <span className="text-rose-600">*</span>
                </label>
                <select
                  value={scheduleConfig.provider_name}
                  onChange={(e) =>
                    setScheduleConfig((prev) => ({ ...prev, provider_name: e.target.value }))
                  }
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                >
                  {providers.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  ความถี่ในการทวนสอบ
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {FREQUENCY_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyFrequencyPreset(preset)}
                      className={`h-10 rounded-xl border text-sm font-semibold transition-colors cursor-pointer ${
                        scheduleConfig.frequency_label === preset.label
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Months Selector */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                เลือกเดือนที่วางแผน (Plan เดือน 1 - 12) <span className="text-rose-600">*</span>
              </label>
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                {MONTHS.map((m) => {
                  const selected = scheduleConfig.planned_months.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleMonth(m)}
                      className={`py-2 rounded-xl border text-sm font-bold transition-colors cursor-pointer ${
                        selected
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      ด.{m}
                    </button>
                  );
                })}
              </div>

              <div className="mt-2.5 text-xs text-slate-600 font-medium flex items-center gap-1.5">
                <Clock size={14} className="text-indigo-600 shrink-0" />
                <span>วันครบกำหนดคำนวณอัตโนมัติ:</span>
                <span className="font-mono font-bold text-xs sm:text-sm text-slate-800">
                  {previewDueDates.length > 0 ? previewDueDates.join(', ') : 'ยังไม่ได้เลือกเดือน'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  แผนกผู้รับผิดชอบ <span className="text-rose-600">*</span>
                </label>
                <select
                  value={scheduleConfig.responsible_dept}
                  onChange={(e) =>
                    setScheduleConfig((prev) => ({ ...prev, responsible_dept: e.target.value }))
                  }
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                >
                  {activeDepartments.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.code} — {d.nameTh}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  ตำแหน่งผู้รับผิดชอบ
                </label>
                <input
                  type="text"
                  value={scheduleConfig.responsible_label}
                  onChange={(e) =>
                    setScheduleConfig((prev) => ({ ...prev, responsible_label: e.target.value }))
                  }
                  placeholder="เช่น QC Sup., เจ้าหน้าที่ Store"
                  className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm font-medium bg-white focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-slate-600">
              พร้อมนำเข้าเครื่องมือเข้าแผนประจำปี: <strong className="text-slate-900">{selectedAssetIds.length}</strong> รายการ
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={saving || selectedAssetIds.length === 0}
                className="inline-flex items-center gap-1.5 h-10 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowRight size={16} />
                <span>
                  {saving
                    ? 'กำลังนำเข้าสู่แผน...'
                    : `นำเข้าสู่แผนประจำปี (${selectedAssetIds.length} รายการ)`}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SmartAssetImportModal;
