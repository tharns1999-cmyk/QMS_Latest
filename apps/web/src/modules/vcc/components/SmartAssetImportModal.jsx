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
              <h2 className="text-base font-bold text-slate-900">
                เลือกเครื่องมือจากทะเบียนเข้าสู่แผนปี {plan.plan_year} (FM-QC-46)
              </h2>
              <p className="text-xs text-slate-500">
                เชื่อมโยงข้อมูลเครื่องมือจริงจาก Asset Register เพื่อกำหนดรอบการทวนสอบและวันครบกำหนดอัตโนมัติ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleImport} className="flex-1 overflow-y-auto p-5 space-y-4">
          {importError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2"
            >
              <AlertTriangle size={15} className="text-rose-600 shrink-0" />
              <span>{importError}</span>
            </div>
          )}

          {/* Top Filter Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
            {/* Search Input */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหารหัส, ชื่อ, รุ่น, จุดติดตั้ง..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:border-indigo-600"
              />
            </div>

            {/* Department Filter */}
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:border-indigo-600 font-medium"
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
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:border-indigo-600 font-medium"
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
            <div className="flex items-center justify-between text-xs">
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
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer underline"
              >
                เลือก/ยกเลิกทั้งหมดที่แสดง
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100/80 sticky top-0 z-10 border-b border-slate-200 text-slate-700 font-semibold">
                  <tr>
                    <th className="py-2 px-3 w-8 text-center">#</th>
                    <th className="py-2 px-3">รหัสเครื่องมือ</th>
                    <th className="py-2 px-3">ชื่อเครื่องมือ</th>
                    <th className="py-2 px-2">ประเภท</th>
                    <th className="py-2 px-2">แผนก</th>
                    <th className="py-2 px-3">สถานที่ติดตั้ง</th>
                    <th className="py-2 px-3 text-right">สถานะในแผน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAssets.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-500">
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
                          <td className="py-2 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isAlreadyInPlan}
                              onChange={() => toggleSelectAsset(asset.id)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-900">
                            {asset.asset_code}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-800">
                            <div>{asset.name}</div>
                            {isGroup && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-purple-700 font-semibold">
                                <FolderTree size={10} /> กลุ่มแม่
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-slate-600">{asset.asset_type}</td>
                          <td className="py-2 px-2 font-bold text-slate-700">{asset.department}</td>
                          <td className="py-2 px-3 text-slate-500">{asset.location || '-'}</td>
                          <td className="py-2 px-3 text-right">
                            {isAlreadyInPlan ? (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                <CheckCircle2 size={11} className="text-slate-400" /> อยู่ในแผนแล้ว
                              </span>
                            ) : (
                              <span className="text-[10.5px] text-indigo-700 font-semibold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
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
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Calendar size={14} className="text-indigo-600" />
                <span>กำหนดรอบการทวนสอบและวันครบกำหนด (สำหรับรายการที่เลือก)</span>
              </h3>
              <div className="text-[11px] text-slate-500">
                กติกาวันครบกำหนด:{' '}
                <strong>
                  {plan.due_date_rule === 'START_OF_MONTH' ? 'วันที่ 1 ของเดือน' : 'วันสิ้นเดือน (END_OF_MONTH)'}
                </strong>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  สถาบัน / หน่วยงานที่ทวนสอบ <span className="text-rose-600">*</span>
                </label>
                <select
                  value={scheduleConfig.provider_name}
                  onChange={(e) =>
                    setScheduleConfig((prev) => ({ ...prev, provider_name: e.target.value }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                >
                  {providers.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ความถี่ในการทวนสอบ
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {FREQUENCY_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyFrequencyPreset(preset)}
                      className={`py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
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
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
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
                      className={`py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
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

              <div className="mt-2 text-[11px] text-slate-600 flex items-center gap-1.5">
                <Clock size={12} className="text-indigo-600 shrink-0" />
                <span>วันครบกำหนดคำนวณอัตโนมัติ:</span>
                <span className="font-mono font-bold text-slate-800">
                  {previewDueDates.length > 0 ? previewDueDates.join(', ') : 'ยังไม่ได้เลือกเดือน'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  แผนกผู้รับผิดชอบ <span className="text-rose-600">*</span>
                </label>
                <select
                  value={scheduleConfig.responsible_dept}
                  onChange={(e) =>
                    setScheduleConfig((prev) => ({ ...prev, responsible_dept: e.target.value }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                >
                  {activeDepartments.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.code} — {d.nameTh}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ตำแหน่งผู้รับผิดชอบ
                </label>
                <input
                  type="text"
                  value={scheduleConfig.responsible_label}
                  onChange={(e) =>
                    setScheduleConfig((prev) => ({ ...prev, responsible_label: e.target.value }))
                  }
                  placeholder="เช่น QC Sup., เจ้าหน้าที่ Store"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              พร้อมนำเข้าเครื่องมือเข้าแผนประจำปี: <strong>{selectedAssetIds.length}</strong> รายการ
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={saving || selectedAssetIds.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowRight size={14} />
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
