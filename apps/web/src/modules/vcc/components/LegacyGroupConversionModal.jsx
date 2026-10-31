import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Eye, ArrowLeft, X } from 'lucide-react';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const EMPTY_ARRAY = [];

export const LegacyGroupConversionModal = ({
  open,
  onClose,
  groupItem,
  groupChildren = EMPTY_ARRAY,
  activeAssets = EMPTY_ARRAY,
  existingPlanItems = EMPTY_ARRAY,
  onConfirmConvert,
  converting = false
}) => {
  const targetGroupId = groupItem?.asset_id || groupItem?.id || '';

  const existingByAssetId = useMemo(() => {
    const map = new Map();
    for (const item of existingPlanItems || []) {
      if (item.id !== groupItem?.id && item.asset_id) {
        map.set(item.asset_id, item);
      }
    }
    return map;
  }, [existingPlanItems, groupItem?.id]);

  // Combine children from detail API + activeAssets linked via legacy parent_id
  const { candidateAssets, retiredChildren, usingDeptFallback } = useMemo(() => {
    if (!groupItem) {
      return { candidateAssets: [], retiredChildren: [], usingDeptFallback: false };
    }
    const mergedMap = new Map();
    for (const ch of groupChildren || []) {
      if (ch && ch.id) mergedMap.set(ch.id, ch);
    }
    for (const a of activeAssets || []) {
      if (a && a.id && (a.parent_id === targetGroupId || a.parent_id === groupItem.asset_id)) {
        if (!mergedMap.has(a.id)) mergedMap.set(a.id, a);
      }
    }

    const allLinked = Array.from(mergedMap.values());
    const retired = allLinked.filter((a) => a.status === 'RETIRED');
    const activeLinked = allLinked.filter(
      (a) => a.status === 'ACTIVE' && (Number(a.is_group) === 0 || a.group_nature === 'COMPOSITE_SET')
    );

    if (activeLinked.length > 0) {
      return { candidateAssets: activeLinked, retiredChildren: retired, usingDeptFallback: false };
    }

    // Fallback: active calibratable units in the same department if no children were linked
    const deptUnits = (activeAssets || []).filter(
      (a) =>
        a.status === 'ACTIVE' &&
        (Number(a.is_group) === 0 || a.group_nature === 'COMPOSITE_SET') &&
        (!groupItem.responsible_dept || a.department === groupItem.responsible_dept || a.department === groupItem.asset_department)
    );
    return { candidateAssets: deptUnits, retiredChildren: retired, usingDeptFallback: deptUnits.length > 0 };
  }, [groupItem, groupChildren, activeAssets, targetGroupId]);

  const [selectedIds, setSelectedIds] = useState(() => (usingDeptFallback ? [] : candidateAssets.map((a) => a.id)));
  const [schedules, setSchedules] = useState(() => {
    const next = {};
    for (const asset of candidateAssets) {
      const existing = existingByAssetId.get(asset.id);
      next[asset.id] = {
        planned_months: existing && Array.isArray(existing.planned_months) ? [...existing.planned_months] : [],
        remarks: existing?.remarks || '',
        provider_name: existing?.provider_name || groupItem?.provider_name || 'ทวนสอบภายใน',
        frequency_label: existing?.frequency_label || groupItem?.frequency_label || 'รายปี',
        responsible_dept: existing?.responsible_dept || asset.department || groupItem?.responsible_dept || '',
        responsible_label: existing?.responsible_label || groupItem?.responsible_label || ''
      };
    }
    return next;
  });
  const [confirmRemoveEmpty, setConfirmRemoveEmpty] = useState(false);
  const [step, setStep] = useState('EDIT');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (!open || !groupItem) return;
    const defaultSelected = usingDeptFallback ? [] : candidateAssets.map((a) => a.id);
    const nextSchedules = {};
    for (const asset of candidateAssets) {
      const existing = existingByAssetId.get(asset.id);
      nextSchedules[asset.id] = {
        planned_months: existing && Array.isArray(existing.planned_months) ? [...existing.planned_months] : [],
        remarks: existing?.remarks || '',
        provider_name: existing?.provider_name || groupItem.provider_name || 'ทวนสอบภายใน',
        frequency_label: existing?.frequency_label || groupItem.frequency_label || 'รายปี',
        responsible_dept: existing?.responsible_dept || asset.department || groupItem.responsible_dept || '',
        responsible_label: existing?.responsible_label || groupItem.responsible_label || ''
      };
    }
    setSelectedIds(defaultSelected);
    setSchedules(nextSchedules);
    setConfirmRemoveEmpty(false);
    setStep('EDIT');
    setValidationError('');
  }, [open, groupItem, candidateAssets, existingByAssetId, usingDeptFallback]);

  if (!open || !groupItem) return null;

  const legacyGroupMonths = Array.isArray(groupItem.planned_months) ? groupItem.planned_months : [];

  const toggleSelect = (assetId) => {
    setValidationError('');
    setSelectedIds((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]
    );
  };

  const toggleMonth = (assetId, month) => {
    setValidationError('');
    setSchedules((prev) => {
      const cur = prev[assetId] || { planned_months: [], remarks: '' };
      const months = cur.planned_months.includes(month)
        ? cur.planned_months.filter((m) => m !== month)
        : [...cur.planned_months, month].sort((a, b) => a - b);
      return {
        ...prev,
        [assetId]: { ...cur, planned_months: months }
      };
    });
  };

  const updateRemarks = (assetId, remarks) => {
    setValidationError('');
    setSchedules((prev) => ({
      ...prev,
      [assetId]: { ...(prev[assetId] || { planned_months: [] }), remarks }
    }));
  };

  const buildPayloadItems = () => {
    return selectedIds.map((assetId) => {
      const cfg = schedules[assetId] || { planned_months: [], remarks: '' };
      const asset = candidateAssets.find((a) => a.id === assetId);
      return {
        asset_id: assetId,
        asset_code: asset?.asset_code || assetId,
        asset_name: asset?.name || '',
        already_in_plan: existingByAssetId.has(assetId),
        planned_months: cfg.planned_months || [],
        remarks: (cfg.remarks || '').trim(),
        provider_name: cfg.provider_name || groupItem.provider_name || 'ทวนสอบภายใน',
        frequency_label: cfg.frequency_label || groupItem.frequency_label || 'รายปี',
        responsible_dept: cfg.responsible_dept || asset?.department || groupItem.responsible_dept || '',
        responsible_label: cfg.responsible_label || groupItem.responsible_label || ''
      };
    });
  };

  const handleProceedToPreview = () => {
    setValidationError('');
    const chosen = buildPayloadItems();
    if (chosen.length === 0) {
      if (!confirmRemoveEmpty) {
        setValidationError(
          'กรุณาเลือกเครื่องมือรายตัวอย่างน้อย 1 รายการ หรือติ๊กยืนยันการลบแถวกลุ่มเดิมออกจากแผน'
        );
        return;
      }
      setStep('PREVIEW');
      return;
    }

    for (const item of chosen) {
      if (item.planned_months.length === 0 && !item.remarks) {
        setValidationError(
          `กรุณาเลือกเดือนทวนสอบอย่างน้อย 1 เดือน หรือระบุเหตุผลไม่วางแผนสำหรับเครื่องมือ ${item.asset_code}`
        );
        return;
      }
    }
    setStep('PREVIEW');
  };

  const handleConfirm = () => {
    if (!onConfirmConvert) return;
    const chosen = buildPayloadItems();
    onConfirmConvert({
      groupItem,
      items: chosen,
      confirm_remove_empty: chosen.length === 0 && confirmRemoveEmpty
    });
  };

  const previewItems = buildPayloadItems();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="แปลงรายการกลุ่มเดิมเป็นเครื่องมือรายตัว"
    >
      <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {step === 'PREVIEW'
                ? 'ตรวจสอบตัวอย่างก่อนยืนยันการแปลงรายการ (Preview & Confirm)'
                : 'แปลงรายการกลุ่มเดิมเป็นเครื่องมือรายตัว (Flat Planning)'}
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              รายการเดิมในแผนร่าง: <span className="font-mono font-bold text-slate-900">{groupItem.asset_code}</span> — {groupItem.asset_name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-sm text-slate-700">
          {validationError && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Reference Box — Strictly Non-Auto-Inherited */}
          <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-950 text-xs space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-amber-600 shrink-0" />
              <span>ระบบจะไม่คัดลอกเดือนจากกลุ่มเดิมไปยังเครื่องมือรายตัวโดยอัตโนมัติ</span>
            </div>
            <p className="text-amber-900 leading-relaxed">
              รอบเดิมของแถวกลุ่ม ({legacyGroupMonths.length > 0 ? legacyGroupMonths.map((m) => `เดือน ${m}`).join(', ') : 'ไม่ได้ระบุเดือน'}) แสดงเพื่อใช้อ้างอิงเท่านั้น กรุณาเลือกเครื่องมือจริงและกำหนดเดือนทวนสอบของแต่ละเครื่องด้วยตนเอง
            </p>
          </div>

          {retiredChildren.length > 0 && (
            <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs">
              <span className="font-bold text-rose-700">ตรวจพบเครื่องมือเดิมที่ปลดออกแล้ว (RETIRED):</span>{' '}
              {retiredChildren.map((r) => r.asset_code).join(', ')} — ระบบคัดออกอัตโนมัติเพื่อป้องกันการวางแผนกับเครื่องมือที่เลิกใช้งาน
            </div>
          )}

          {step === 'EDIT' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>
                  {usingDeptFallback
                    ? `ไม่พบเครื่องมือที่ผูกไว้เดิม — เลือกเครื่องมือที่ใช้งานอยู่ในแผนก (${candidateAssets.length} เครื่อง):`
                    : `เลือกเครื่องมือวัดรายตัวและกำหนดเดือนทวนสอบ (${candidateAssets.length} เครื่อง):`}
                </span>
                <span className="text-indigo-700">เลือกแล้ว {selectedIds.length} เครื่อง</span>
              </div>

              {candidateAssets.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
                  ไม่พบเครื่องมือที่ใช้งานอยู่ (ACTIVE) สำหรับทดแทนรายการนี้
                </div>
              ) : (
                <div className="space-y-3">
                  {candidateAssets.map((asset) => {
                    const checked = selectedIds.includes(asset.id);
                    const alreadyInPlan = existingByAssetId.has(asset.id);
                    const cfg = schedules[asset.id] || { planned_months: [], remarks: '' };
                    return (
                      <div
                        key={asset.id}
                        className={`p-3.5 rounded-xl border transition-colors space-y-2.5 ${
                          checked ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="inline-flex items-center gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSelect(asset.id)}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600"
                            />
                            <span className="font-mono font-bold text-slate-900 text-sm">{asset.asset_code}</span>
                            <span className="font-semibold text-slate-800 text-sm">— {asset.name}</span>
                          </label>
                          {alreadyInPlan ? (
                            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200 font-semibold text-[11px]">
                              มีอยู่ในแผนแล้ว (จะใช้ค่าที่กำหนดด้านล่าง)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold text-[11px]">
                              เพิ่มเป็นแถวใหม่ในแผน
                            </span>
                          )}
                        </div>

                        {checked && (
                          <div className="pl-6 space-y-2">
                            <div className="text-xs font-semibold text-slate-700">
                              กำหนดเดือนทวนสอบสำหรับ {asset.asset_code} (เลือกด้วยตนเอง):
                            </div>
                            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                              {MONTHS.map((m) => {
                                const isMonthSelected = cfg.planned_months.includes(m);
                                return (
                                  <button
                                    key={m}
                                    type="button"
                                    aria-label={`${asset.asset_code} เดือน ${m}`}
                                    onClick={() => toggleMonth(asset.id, m)}
                                    className={`py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                                      isMonthSelected
                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs'
                                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                                    }`}
                                  >
                                    ด.{m}
                                  </button>
                                );
                              })}
                            </div>

                            {cfg.planned_months.length === 0 && (
                              <div>
                                <input
                                  type="text"
                                  value={cfg.remarks}
                                  onChange={(e) => updateRemarks(asset.id, e.target.value)}
                                  placeholder={`หากไม่วางแผนในปีนี้ กรุณาระบุเหตุผลสำหรับ ${asset.asset_code}...`}
                                  className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:border-indigo-600"
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedIds.length === 0 && (
                <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmRemoveEmpty}
                    onChange={(e) => {
                      setConfirmRemoveEmpty(e.target.checked);
                      setValidationError('');
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600"
                  />
                  <span>ยืนยันนำแถวกลุ่มเดิม ({groupItem.asset_code}) ออกจากแผนร่างโดยไม่เพิ่มเครื่องมือใหม่</span>
                </label>
              )}
            </div>
          ) : (
            /* PREVIEW & CONFIRMATION STEP */
            <div className="space-y-4" data-testid="conversion-preview-summary">
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900">
                <span className="font-bold">รายการที่จะนำออกจากแผนร่าง:</span>{' '}
                <span className="font-mono font-bold">{groupItem.asset_code}</span> — {groupItem.asset_name}
              </div>

              {previewItems.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
                  ไม่มีเครื่องมือรายตัวที่เพิ่มใหม่ (ลบเฉพาะแถวกลุ่มเดิมออกจากแผนร่าง)
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">รหัสเครื่องมือ</th>
                        <th className="py-2.5 px-3">ชื่อเครื่องมือ</th>
                        <th className="py-2.5 px-3">การดำเนินการ</th>
                        <th className="py-2.5 px-3">แผนทวนสอบที่ยืนยัน</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewItems.map((it) => (
                        <tr key={it.asset_id}>
                          <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">{it.asset_code}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">{it.asset_name}</td>
                          <td className="py-2.5 px-3">
                            {it.already_in_plan ? (
                              <span className="text-amber-800 font-semibold">อัปเดตแถวเดิมในแผน (ไม่สร้างซ้ำ)</span>
                            ) : (
                              <span className="text-emerald-700 font-semibold">สร้างแถวเครื่องมือใหม่</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                            {it.planned_months.length > 0
                              ? it.planned_months.map((m) => `เดือน ${m}`).join(', ')
                              : `ไม่วางแผน (${it.remarks})`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          {step === 'PREVIEW' ? (
            <>
              <button
                type="button"
                disabled={converting}
                onClick={() => setStep('EDIT')}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>ย้อนกลับไปแก้ไข</span>
              </button>
              <button
                type="button"
                disabled={converting}
                onClick={handleConfirm}
                className="inline-flex items-center gap-1.5 h-9 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 size={15} />
                <span>{converting ? 'กำลังบันทึกการแปลง...' : 'ยืนยันการแปลงรายการ'}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={converting}
                className="h-9 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={converting}
                onClick={handleProceedToPreview}
                className="inline-flex items-center gap-1.5 h-9 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Eye size={15} />
                <span>ดูตัวอย่างก่อนยืนยัน (Preview)</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LegacyGroupConversionModal;

