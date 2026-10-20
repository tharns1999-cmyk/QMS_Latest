import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  PlusCircle, 
  Layers, 
  MapPin, 
  Check, 
  CheckCircle2,
  Plus, 
  Trash2, 
  Send, 
  Sparkles,
  FileText,
  ArrowRight
} from 'lucide-react';
import useStore, { getActivePhysicalCopies } from '../../../../store/useStore';
import { 
  DEPARTMENT_METADATA, 
  STANDARD_STATIONS, 
  normalizeDepartmentId 
} from '../../services/MasterDataService';
import toast from 'react-hot-toast';

const RequestAdditionalCopiesModal = ({ isOpen, onClose, document: doc }) => {
  const { 
    controlledCopyInstances, 
    documentControlledCopies, 
    requestAdditionalControlledCopies,
    distributionLocations,
    masterDepartments
  } = useStore();

  const [selectedDept, setSelectedDept] = useState('PD');
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [customLocationName, setCustomLocationName] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dynamic department list
  const deptList = useMemo(() => {
    if (masterDepartments && masterDepartments.length > 0) {
      return masterDepartments.filter(d => d.status !== 'INACTIVE').map(d => ({
        id: d.id,
        name: d.nameTh || d.name,
        code: d.id
      }));
    }
    return Array.isArray(DEPARTMENT_METADATA) 
      ? DEPARTMENT_METADATA.map(d => ({ id: d.id, name: d.name, code: d.id }))
      : Object.entries(DEPARTMENT_METADATA).map(([k, v]) => ({ id: k, name: v.name || k, code: k }));
  }, [masterDepartments]);

  // Synchronized Copies
  const allCopies = useMemo(() => {
    return (controlledCopyInstances && controlledCopyInstances.length > 0)
      ? controlledCopyInstances
      : (documentControlledCopies || []);
  }, [controlledCopyInstances, documentControlledCopies]);

  const isExternal = Boolean(
    doc?.is_external ||
    doc?.isExternal ||
    doc?.doc_type === 'EXTERNAL' ||
    doc?.doc_type === 'ED' ||
    doc?.docType === 'EXTERNAL' ||
    doc?.docType === 'ED' ||
    doc?.edCode ||
    (doc?.code || doc?.doc_code || doc?.docCode || doc?.docNo || doc?.title || '')?.toString().trim().toUpperCase().startsWith('ED-')
  );

  const docCode = isExternal
    ? (doc?.edCode || doc?.doc_code || doc?.code || doc?.docNo || doc?.docCode || doc?.documentCode || doc?.title || '')
    : (doc?.doc_code || doc?.code || doc?.docNo || doc?.docCode || doc?.title || '');

  const docDisplayTitle = isExternal
    ? (doc?.name || (doc?.title && doc.title !== docCode ? doc.title : '') || doc?.doc_title || doc?.docTitle || doc?.title || '')
    : (doc?.name || doc?.doc_title || doc?.docTitle || doc?.title || '');

  const rawEdition = String(doc?.sourceVersion || doc?.edition || (isExternal ? doc?.rev : '') || '1.0')
    .replace(/^(?:Edition|Ver|Version|Rev\.?)\s*/i, '')
    .trim() || '1.0';

  // Existing deployed copies of this document (deduplicated & filtered to genuine active physical copies)
  const activeCopies = useMemo(() => {
    return getActivePhysicalCopies(allCopies, doc);
  }, [allCopies, doc]);

  // Calculate highest existing copy number from active physical copies
  const maxExistingCopyNo = useMemo(() => {
    const copyNums = activeCopies.map(c => {
      if (typeof c.copy_number === 'number' && !isNaN(c.copy_number)) return c.copy_number;
      if (typeof c.copyNumber === 'number' && !isNaN(c.copyNumber)) return c.copyNumber;
      const codeStr = String(c.copyCode || c.copy_code || c.copy_no || c.copyNo || c.ccNumber || '');
      const cMatch = codeStr.match(/-C(\d+)$/i) || codeStr.match(/^CC-(\d+)$/i) || codeStr.match(/^Copy\s*(\d+)$/i);
      if (cMatch) return parseInt(cMatch[1], 10) || 0;
      const raw = c.copy_number ?? c.copyNumber ?? c.copy_no ?? c.copyNo ?? (c.ccNumber ? String(c.ccNumber).replace(/\D/g, '') : null);
      const parsed = parseInt(raw, 10);
      return isNaN(parsed) ? 0 : parsed;
    });
    return copyNums.length > 0 ? Math.max(...copyNums, 0) : 0;
  }, [activeCopies]);

  // Set of locations already holding a copy
  const existingLocationKeys = useMemo(() => {
    const set = new Set();
    activeCopies.forEach(c => {
      const loc = c.location || c.locationName || '';
      const dept = c.holder_dept || c.department || '';
      if (loc) {
        set.add(`${dept}::${loc}`.toLowerCase());
        set.add(loc.toLowerCase());
      }
      if (c.locationId) set.add(c.locationId.toLowerCase());
      if (c.station_id) set.add(c.station_id.toLowerCase());
    });
    return set;
  }, [activeCopies]);

  // Available standard stations for the selected department (excluding already deployed)
  const availableStations = useMemo(() => {
    const normDept = normalizeDepartmentId(selectedDept);
    const stationSource = (distributionLocations && distributionLocations.length > 0)
      ? distributionLocations
      : STANDARD_STATIONS;
    const stations = stationSource.filter(s => s.status !== 'INACTIVE' && normalizeDepartmentId(s.departmentId) === normDept);

    return stations.map(station => {
      const key = `${selectedDept}::${station.name}`.toLowerCase();
      const isAlreadyDeployed = 
        existingLocationKeys.has(key) || 
        existingLocationKeys.has(station.id.toLowerCase()) ||
        existingLocationKeys.has(station.name.toLowerCase());
      const isSelectedInDraft = selectedLocations.some(l => l.locationId === station.id || (l.locationName === station.name && l.departmentId === selectedDept));

      return {
        ...station,
        isAlreadyDeployed,
        isSelectedInDraft
      };
    });
  }, [selectedDept, existingLocationKeys, selectedLocations, distributionLocations]);

  // Live Sequential Preview
  const numberingPreview = useMemo(() => {
    let currentMax = maxExistingCopyNo;
    return selectedLocations.map((loc) => {
      currentMax += 1;
      return {
        ...loc,
        previewCopyNo: String(currentMax).padStart(2, '0'),
        previewCcNumber: `CC-${String(currentMax).padStart(3, '0')}`
      };
    });
  }, [selectedLocations, maxExistingCopyNo]);

  if (!isOpen || !doc) return null;

  // Toggle Standard Station
  const handleToggleStation = (station) => {
    if (station.isAlreadyDeployed) return;

    const targetDept = station.departmentId || selectedDept;
    const exists = selectedLocations.find(l => (l.locationId === station.id || l.location_id === station.id) && (l.departmentId === targetDept || l.target_department === targetDept));
    if (exists) {
      setSelectedLocations(prev => prev.filter(l => !( (l.locationId === station.id || l.location_id === station.id) && (l.departmentId === targetDept || l.target_department === targetDept) )));
    } else {
      setSelectedLocations(prev => [
        ...prev,
        {
          departmentId: targetDept,
          department: targetDept,
          target_department: targetDept,
          targetDepartment: targetDept,
          locationId: station.id,
          location_id: station.id,
          locationName: station.name,
          location_name: station.name,
          isCustom: false
        }
      ]);
    }
  };

  // Add Custom Location
  const handleAddCustomLocation = (e) => {
    e.preventDefault();
    const trimmed = customLocationName.trim();
    if (!trimmed) return;

    const key = `${selectedDept}::${trimmed}`.toLowerCase();
    if (existingLocationKeys.has(key) || existingLocationKeys.has(trimmed.toLowerCase())) {
      toast.error(`จุดใช้งาน "${trimmed}" มีเอกสารนี้ติดตั้งอยู่แล้ว`);
      return;
    }

    if (selectedLocations.some(l => l.locationName.toLowerCase() === trimmed.toLowerCase() && (l.departmentId === selectedDept || l.target_department === selectedDept))) {
      toast.error('จุดใช้งานนี้อยู่ในรายการที่เลือกแล้ว');
      return;
    }

    setSelectedLocations(prev => [
      ...prev,
      {
        departmentId: selectedDept,
        department: selectedDept,
        target_department: selectedDept,
        targetDepartment: selectedDept,
        locationId: `CUSTOM-${Date.now()}`,
        location_id: `CUSTOM-${Date.now()}`,
        locationName: trimmed,
        location_name: trimmed,
        isCustom: true
      }
    ]);
    setCustomLocationName('');
  };

  const handleRemoveSelectedLocation = (index) => {
    setSelectedLocations(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (selectedLocations.length === 0) {
      toast.error('กรุณาเลือกจุดใช้งานใหม่อย่างน้อย 1 จุด');
      return;
    }
    if (!reason.trim()) {
      toast.error('กรุณาระบุเหตุผลในการขอสำเนาเพิ่มเติม');
      return;
    }

    setIsSubmitting(true);
    try {
      const editionVal = doc?.sourceVersion || doc?.edition || (isExternal ? rawEdition : undefined);
      const revVal = isExternal ? (doc?.sourceVersion || doc?.edition || '1.0') : (doc?.rev || '00');
      const docTypeVal = isExternal ? 'EXTERNAL' : (doc?.doc_type || doc?.type || 'INTERNAL');
      const titleVal = docDisplayTitle || doc?.title || doc?.doc_title || '';

      const enrichedLocations = selectedLocations.map(loc => ({
        ...loc,
        documentId: doc.id,
        docCode,
        documentCode: docCode,
        docTitle: titleVal,
        documentTitle: titleVal,
        edition: editionVal,
        rev: revVal,
        is_external: isExternal,
        doc_type: docTypeVal
      }));

      const payload = {
        documentId: doc.id,
        docId: doc.id,
        docCode,
        documentCode: docCode,
        docTitle: titleVal,
        documentTitle: titleVal,
        edition: editionVal,
        rev: revVal,
        is_external: isExternal,
        doc_type: docTypeVal,
        locations: enrichedLocations,
        selectedLocations: enrichedLocations,
        reason: reason.trim()
      };

      requestAdditionalControlledCopies(doc.id, enrichedLocations, reason.trim(), payload);
      toast.success(`ส่งคำขอออกสำเนาเพิ่มเติม ${selectedLocations.length} เล่ม สำเร็จ! ส่งต่อให้ DCC ดำเนินการ`);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('เกิดข้อผิดพลาดในการส่งคำขอ');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 z-10 my-auto"
        >
          {/* Header */}
          <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
                <PlusCircle size={22} strokeWidth={2.2} />
              </div>
              <div>
                <h3 className="font-bold text-xl text-slate-900 tracking-tight flex items-center gap-2">
                  ขอสำเนาควบคุมเพิ่มเติม
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  จ่ายสำเนาควบคุมฉบับจริงเพิ่มเฉพาะจุด โดยไม่ต้องเปิด DAR ปรับแก้ Revision
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors focus:ring-2 focus:ring-indigo-500/20 outline-none"
              title="ปิดหน้าต่าง"
            >
              <X size={20} />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="p-6 sm:p-8 overflow-y-auto space-y-7 flex-1 text-sm bg-white">
            {/* 2.1 Doc Info Bento Card */}
            <div className="p-4 sm:p-5 bg-slate-50/70 border border-slate-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-2xs">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5 mb-2">
                  <span className="font-mono font-bold text-base sm:text-lg text-indigo-600 bg-white px-3.5 py-1 rounded-xl border border-indigo-100 shadow-2xs tracking-tight">
                    {docCode}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-slate-200/80 text-slate-700 font-bold font-mono text-xs">
                    {isExternal ? `Edition ${rawEdition}` : `Rev.${doc.rev || '00'}`}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    {doc.status}
                  </span>
                </div>
                <div className="text-sm sm:text-base font-semibold text-slate-800 break-words [overflow-wrap:anywhere]">
                  {docDisplayTitle}
                </div>
              </div>

              <div className="flex items-center gap-2.5 bg-white px-3.5 py-2 rounded-xl border border-slate-200/70 shadow-2xs shrink-0">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs font-mono">
                  {doc.department?.slice(0, 2) || 'PD'}
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">แผนกเจ้าของเอกสาร</div>
                  <div className="text-xs font-bold text-slate-800 font-mono">{doc.department}</div>
                </div>
              </div>
            </div>

            {/* 2.2 Current Active Copies (สำเนาที่ใช้งานอยู่เดิม) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Layers size={16} className="text-indigo-600" />
                  สำเนาควบคุมที่ถือครองปัจจุบัน ({activeCopies.length} เล่ม)
                </label>
                <span className="text-xs text-slate-600 font-mono bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs font-semibold">
                  Current Max: Copy {String(maxExistingCopyNo).padStart(2, '0')}
                </span>
              </div>

              <div className="bg-slate-50/50 border border-slate-200/70 rounded-2xl p-3.5 max-h-48 overflow-y-auto">
                {activeCopies.length > 0 ? (
                  <div className="flex flex-wrap gap-2.5">
                    {activeCopies.map((copy) => {
                      const codeStr = String(copy.copyCode || copy.copy_code || copy.copy_no || copy.copyNo || copy.ccNumber || '');
                      const cMatch = codeStr.match(/-C(\d+)$/i) || codeStr.match(/^CC-(\d+)$/i) || codeStr.match(/^Copy\s*(\d+)$/i);
                      const rawNum = cMatch ? cMatch[1] : (copy.copy_number ?? copy.copyNumber ?? copy.copy_no ?? copy.copyNo ?? (copy.ccNumber ? String(copy.ccNumber).replace(/\D/g, '') : '01'));
                      const parsed = parseInt(rawNum, 10);
                      const copyNoFormatted = isNaN(parsed) ? String(rawNum) : String(parsed).padStart(2, '0');
                      const locName = copy.location || copy.locationName || '-';
                      const deptCode = copy.holder_dept || copy.department || copy.departmentId || '-';

                      const status = (copy.status || '').toUpperCase();
                      const isActive = status === 'ISSUED_ACTIVE' || status === 'ACTIVE';
                      const isPending = status === 'PENDING_ISSUE' || status === 'DISPATCHED_PENDING_RECEIPT' || status === 'PENDING_RECEIPT';

                      return (
                        <div 
                          key={copy.id || `${deptCode}-${copyNoFormatted}`}
                          className="group px-3.5 py-2 bg-white border border-slate-200/80 hover:border-slate-300 rounded-xl flex items-center gap-2.5 text-xs sm:text-sm shadow-2xs transition-all"
                        >
                          <span className="px-2 py-0.5 bg-zinc-900 text-white font-mono font-bold text-xs rounded-md shadow-2xs shrink-0">
                            Copy {copyNoFormatted}
                          </span>

                          <span className="font-semibold text-slate-800 truncate max-w-[200px]" title={locName}>
                            {locName}
                          </span>

                          <span className="text-[11px] text-slate-400 font-medium">
                            รหัสแผนก: <span className="font-semibold text-slate-700 font-mono">{deptCode}</span>
                          </span>

                          <div className="shrink-0 flex items-center ml-1">
                            {isActive ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Active
                              </span>
                            ) : isPending ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                รอยืนยันรับ (Pending)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                {copy.status || 'Active'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 text-center py-4">
                    ยังไม่มีข้อมูลสำเนาควบคุมที่ถือครองในปัจจุบัน
                  </div>
                )}
              </div>
            </div>

            {/* 2.3 New Location Selection (เลือกจุดแจกจ่ายใหม่) */}
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <MapPin size={16} className="text-emerald-600" />
                  เลือกจุดแจกจ่ายใหม่
                </label>
                <span className="text-xs text-slate-400">
                  คลิกที่การ์ดเพื่อเลือกหรือยกเลิก
                </span>
              </div>

              {/* Department Segmented Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                {deptList.map(deptItem => {
                  const isSelected = normalizeDepartmentId(selectedDept) === normalizeDepartmentId(deptItem.id);
                  return (
                    <button
                      key={deptItem.id}
                      type="button"
                      onClick={() => setSelectedDept(deptItem.id)}
                      className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap outline-none ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-500/20'
                          : 'bg-slate-100 hover:bg-slate-200/70 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {deptItem.name} ({deptItem.id})
                    </button>
                  );
                })}
              </div>

              {/* Location Interactive Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto p-1 border border-slate-200/70 rounded-2xl bg-slate-50/40">
                {availableStations.map(station => {
                  if (station.isAlreadyDeployed) {
                    return (
                      <div
                        key={station.id}
                        className="p-3 bg-slate-100/70 border border-slate-200/60 text-slate-400 rounded-xl flex items-center justify-between text-xs cursor-not-allowed opacity-60"
                        title="จุดนี้มีเอกสารควบคุมติดตั้งอยู่แล้ว"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <CheckCircle2 size={14} className="text-slate-400 shrink-0" />
                          <span className="truncate font-medium">{station.name}</span>
                        </div>
                        <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded-md text-slate-600 font-bold shrink-0">
                          ติดตั้งแล้ว
                        </span>
                      </div>
                    );
                  }

                  const isSelected = station.isSelectedInDraft;
                  return (
                    <div
                      key={station.id}
                      onClick={() => handleToggleStation(station)}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-indigo-50/70 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-950 font-semibold shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs text-slate-700 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <div className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? 'bg-indigo-600 text-white' : 'border border-slate-300'
                        }`}>
                          {isSelected && <Check size={11} strokeWidth={3} />}
                        </div>
                        <span className="truncate">{station.name}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Minimal Custom Location Input Bar */}
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={customLocationName}
                  onChange={(e) => setCustomLocationName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomLocation(e); }}}
                  placeholder={`ระบุจุดติดตั้งพิเศษเฉพาะกิจสำหรับแผนก ${selectedDept}...`}
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all outline-none shadow-2xs font-medium"
                />
                <button
                  type="button"
                  onClick={handleAddCustomLocation}
                  disabled={!customLocationName.trim()}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-xs transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus size={15} /> เพิ่มจุดพิเศษ
                </button>
              </div>
            </div>

            {/* 2.4 Real-time Sequential Preview */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-500" />
                  รายการสำเนาใหม่ที่จะได้รับ (Sequential Numbering Preview)
                </label>
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                  +{selectedLocations.length} เล่ม
                </span>
              </div>

              {numberingPreview.length > 0 ? (
                <div className="space-y-2.5 bg-slate-50/50 border border-slate-200/80 rounded-2xl p-3.5">
                  {numberingPreview.map((loc, idx) => (
                    <div 
                      key={idx}
                      className="p-3 bg-white border border-indigo-100 rounded-xl flex items-center justify-between text-xs sm:text-sm shadow-2xs min-w-0"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="px-2.5 py-1 bg-indigo-600 text-white font-mono font-bold rounded-lg text-xs shrink-0 shadow-xs">
                          Copy {loc.previewCopyNo}
                        </span>
                        <ArrowRight size={14} className="text-slate-300 shrink-0" />
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <span className="font-semibold text-slate-800 truncate">{loc.locationName}</span>
                          <span className="text-xs text-slate-400 font-mono shrink-0">({loc.departmentId})</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveSelectedLocation(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors ml-2 shrink-0"
                        title="ลบจุดนี้"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 border border-dashed border-slate-200 rounded-2xl text-center text-xs sm:text-sm text-slate-400 bg-slate-50/30">
                  ยังไม่ได้เลือกจุดใช้งานใหม่ (กรุณาคลิกเลือกจุดใช้งานจากด้านบน)
                </div>
              )}
            </div>

            {/* 2.5 Reason Input (เหตุผลและความจำเป็น) */}
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <FileText size={16} className="text-slate-500" />
                เหตุผลและความจำเป็นในการขอสำเนาเพิ่มเติม <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                placeholder="ระบุเหตุผลความจำเป็น เช่น ขยายไลน์การผลิต Line 3, เพิ่มเครื่องจักรใหม่ Metal Detector 3, หรือปรับผังโรงงาน..."
                rows={2}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all outline-none resize-none font-medium shadow-2xs"
              />
            </div>
          </div>

          {/* Sticky Floating Footer */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
            <div className="text-xs sm:text-sm text-slate-500 flex items-center gap-2">
              <Sparkles size={16} className="text-indigo-500 shrink-0" />
              <span>
                กำลังร้องขอสำเนาควบคุมเพิ่ม <strong className="text-indigo-600 font-bold">{selectedLocations.length}</strong> เล่ม
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="bg-transparent hover:bg-slate-100 text-slate-600 font-semibold text-xs sm:text-sm px-5 py-2.5 rounded-xl transition-colors outline-none"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || selectedLocations.length === 0 || !reason.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold text-xs sm:text-sm px-6 py-2.5 rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed outline-none"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    กำลังบันทึกคำขอ...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    ยืนยันขอสำเนาเพิ่มเติม ({selectedLocations.length} เล่ม)
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default RequestAdditionalCopiesModal;
