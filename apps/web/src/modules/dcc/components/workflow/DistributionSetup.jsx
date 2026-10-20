import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Printer, Check, Plus, X, Lock, CheckCircle2, Search,
  Building2, Sparkles
} from 'lucide-react';
import useStore from '../../../../store/useStore';
import { 
  DEPARTMENT_METADATA, 
  normalizeDepartmentId, 
  cleanLocationName,
  getDepartmentStations, 
  getMasterStationForDept,
  calculateCopyAllocations 
} from '../../services/MasterDataService';

// Helper Functions for ID Normalization and Master Lock Resolution
export const getStationKey = (station) => {
  if (!station) return '';
  if (typeof station === 'string') return station.trim();
  return String(station.id || station.location_id || station.station_id || station.locationId || station.code || '').trim();
};

export const isMasterStation = (station, ownerDept) => {
  if (!station) return false;
  const normOwner = normalizeDepartmentId(ownerDept);
  const stationDept = normalizeDepartmentId(station.departmentId || station.dept || station.dept_code || station.department || normOwner);
  const key = getStationKey(station);
  
  if (stationDept !== normOwner) {
    return false;
  }
  
  return Boolean(
    station.isMaster ||
    station.is_master ||
    station.isMasterOffice ||
    key.includes('MASTER') ||
    key === `${normOwner}-MASTER` ||
    key === `${normOwner}-OFFICE`
  );
};

const DistributionSetup = ({
  ownerDept = 'PD',
  originatorDeptId = null,
  originatorDeptCode = null,
  distributions = [],
  _oldDistributions = null,
  onChange = () => {},
  showConfirmButton = false,
  onConfirm = () => {},
  _document = { docNo: 'NEW-DOCUMENT', title: 'New Document' },
  documentType = 'WI',
  accessControl = null,
  accessScope = 'GENERAL',
  targetDepartments = null
}) => {
  const { distributionLocations, masterDepartments, departments: storeDepts, addMasterStation } = useStore();
  
  const effectiveOwnerDeptId = originatorDeptId || ownerDept || 'PD';
  const effectiveOwnerDeptCode = originatorDeptCode || normalizeDepartmentId(effectiveOwnerDeptId);
  const normOwnerDept = normalizeDepartmentId(effectiveOwnerDeptId);

  const isForm = String(documentType).startsWith('FM') || 
                 String(_document?.docNo || _document?.title || '').startsWith('FM-') || 
                 documentType === 'FM' || 
                 documentType === 'FORM';

  const resolvedScope = accessControl?.scope || accessScope || 'GENERAL';
  const isTargeted = resolvedScope === 'TARGETED';

  // Extract raw target departments from all possible keys (supporting strings and objects)
  const rawTargetDepts = useMemo(() => {
    const list = [
      ...(Array.isArray(targetDepartments) ? targetDepartments : []),
      ...(Array.isArray(accessControl?.targetDepartments) ? accessControl.targetDepartments : []),
      ...(Array.isArray(accessControl?.target_departments) ? accessControl.target_departments : []),
      ...(Array.isArray(accessControl?.authorized_depts) ? accessControl.authorized_depts : []),
      ...(Array.isArray(accessControl?.authorizedDepts) ? accessControl.authorizedDepts : [])
    ];
    return [...new Set(list.filter(Boolean))];
  }, [targetDepartments, accessControl]);

  const isOriginatorDept = useCallback((dept) => {
    if (!dept) return false;
    const dId = String(dept.id || '').trim();
    const dCode = String(dept.code || dept.shortName || '').trim();
    const dNorm = normalizeDepartmentId(dId || dCode);
    return (
      dId === effectiveOwnerDeptId ||
      dCode === effectiveOwnerDeptId ||
      dId === effectiveOwnerDeptCode ||
      dCode === effectiveOwnerDeptCode ||
      dNorm === normOwnerDept ||
      dId === normOwnerDept ||
      dCode === normOwnerDept
    );
  }, [effectiveOwnerDeptId, effectiveOwnerDeptCode, normOwnerDept]);

  const matchesTarget = (dept, target) => {
    if (!dept || !target) return false;
    const tVal = typeof target === 'object' ? (target.id || target.code || target.departmentId) : target;
    if (!tVal) return false;

    const tStr = String(tVal).trim();
    const tNorm = normalizeDepartmentId(tStr);

    const dId = String(dept.id || '').trim();
    const dCode = String(dept.code || dept.shortName || '').trim();
    const dNorm = normalizeDepartmentId(dId || dCode);

    return (
      tStr === dId ||
      tStr === dCode ||
      tNorm === dNorm ||
      tNorm === dId ||
      tStr === dNorm ||
      tNorm === normalizeDepartmentId(dId) ||
      tNorm === normalizeDepartmentId(dCode) ||
      (dept.name && String(dept.name).includes(tStr)) ||
      (dept.nameTh && String(dept.nameTh).includes(tStr))
    );
  };

  // Dynamic departments list with strict deduplication & fail-safe filtering
  const availableDeptsList = useMemo(() => {
    let list = [];
    if (masterDepartments && masterDepartments.length > 0) {
      list = masterDepartments.filter(d => d && d.status !== 'INACTIVE').map(d => ({
        id: d.id,
        code: d.id,
        name: `${d.nameTh || d.name} (${d.id})`,
        nameTh: d.nameTh || d.name,
        shortName: d.id,
        badgeColor: d.color || 'blue'
      }));
    } else if (storeDepts && storeDepts.length > 0) {
      list = storeDepts.filter(Boolean).map(d => ({
        id: typeof d === 'string' ? d : d.id,
        code: typeof d === 'string' ? d : d.id,
        name: typeof d === 'string' ? d : `${d.nameTh || d.name} (${d.id})`,
        nameTh: typeof d === 'string' ? d : (d.nameTh || d.name),
        shortName: typeof d === 'string' ? d : d.id,
        badgeColor: 'blue'
      }));
    } else {
      list = DEPARTMENT_METADATA.map(d => ({ ...d, code: d.id }));
    }

    // Deduplicate by normalized department ID to prevent ghost duplicate rows
    const seen = new Set();
    const deduped = [];
    list.forEach(item => {
      const norm = normalizeDepartmentId(item.id || item.code);
      if (!seen.has(norm)) {
        seen.add(norm);
        deduped.push({ ...item, normalizedId: norm });
      }
    });

    if (isTargeted) {
      const filtered = deduped.filter(dept => {
        // แผนกต้นทาง (Originator) ต้องไม่ถูกกรองทิ้งเด็ดขาด
        if (isOriginatorDept(dept)) return true;
        if (rawTargetDepts.length === 0) return false;
        return rawTargetDepts.some(target => matchesTarget(dept, target));
      });

      // Fail-safe: if filtered is somehow empty, ensure at least the originator department is present
      if (filtered.length === 0) {
        const fallbackOwner = deduped.find(d => isOriginatorDept(d)) || {
          id: effectiveOwnerDeptId,
          code: effectiveOwnerDeptCode,
          name: `${effectiveOwnerDeptId} Head Office`,
          nameTh: effectiveOwnerDeptId,
          shortName: effectiveOwnerDeptId,
          normalizedId: normOwnerDept,
          badgeColor: 'blue'
        };
        return [fallbackOwner];
      }
      return filtered;
    }

    return deduped;
  }, [masterDepartments, storeDepts, isTargeted, rawTargetDepts, effectiveOwnerDeptId, effectiveOwnerDeptCode, normOwnerDept, isOriginatorDept]);

  // Active selected department in Master-Detail Pane (Defaults to Originator/Requester Dept)
  const [selectedDeptId, setSelectedDeptId] = useState(effectiveOwnerDeptId);

  // Sync selected dept if current selection becomes invalid
  useEffect(() => {
    const isCurrentSelectedValid = availableDeptsList.some(d => 
      d.id === selectedDeptId || 
      d.code === selectedDeptId || 
      normalizeDepartmentId(d.id) === normalizeDepartmentId(selectedDeptId)
    );
    if (!isCurrentSelectedValid) {
      // รีเซ็ตกลับมาเลือกแผนกต้นทาง (Originator) เสมอ
      const defaultDept = availableDeptsList.find(d => isOriginatorDept(d)) || availableDeptsList[0];
      if (defaultDept) {
        setSelectedDeptId(defaultDept.id || defaultDept.code || effectiveOwnerDeptId);
      }
    }
  }, [availableDeptsList, selectedDeptId, effectiveOwnerDeptId, effectiveOwnerDeptCode, normOwnerDept, isOriginatorDept]);

  const selectedDeptObj = useMemo(() => {
    return availableDeptsList.find(d => 
      d.id === selectedDeptId || 
      d.code === selectedDeptId || 
      normalizeDepartmentId(d.id) === normalizeDepartmentId(selectedDeptId)
    ) || availableDeptsList[0] || {
      id: effectiveOwnerDeptId,
      shortName: effectiveOwnerDeptId,
      name: effectiveOwnerDeptId,
      nameTh: effectiveOwnerDeptId
    };
  }, [availableDeptsList, selectedDeptId, effectiveOwnerDeptId]);

  const currentActiveDeptNorm = normalizeDepartmentId(
    selectedDeptObj?.id || selectedDeptId || normOwnerDept
  );

  // Search & Filter state for Left Department Nav
  const [deptSearchQuery, setDeptSearchQuery] = useState('');

  // Station Creation Dialog / Inline Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newStationName, setNewStationName] = useState('');
  const [createError, setCreateError] = useState('');
  const [quickInputText, setQuickInputText] = useState('');

  // Selected locations lookup map
  const selectedLocationMap = useMemo(() => {
    const map = new Map();
    (distributions || []).forEach(d => {
      if (!d) return;
      const deptId = normalizeDepartmentId(d.departmentId || d.dept || d.dept_code || d.department || normOwnerDept);
      const locId = getStationKey(d);
      if (!locId) return;

      const locName = cleanLocationName(d.locationName || d.station_name || d.name || d.location || locId);
      const key = `${deptId}::${locId}`;
      map.set(key, {
        departmentId: deptId,
        department: deptId,
        dept: deptId,
        dept_code: deptId,
        target_department: deptId,
        targetDepartment: deptId,
        locationId: locId,
        station_id: locId,
        id: locId,
        locationName: locName,
        station_name: locName,
        location: locName,
        name: locName,
        isCustom: !!(d.isCustom || d.is_custom),
        is_custom: !!(d.isCustom || d.is_custom)
      });
    });
    return map;
  }, [distributions, normOwnerDept]);

  // Copy calculations (ISO 9001: Copy 01 locked to Owner Dept)
  const copyCalculation = useMemo(() => {
    const rawList = Array.from(selectedLocationMap.values());
    return calculateCopyAllocations(normOwnerDept, rawList);
  }, [normOwnerDept, selectedLocationMap]);

  const copyNumberByLocationKey = useMemo(() => {
    const map = new Map();
    copyCalculation.allAllocations.forEach(alloc => {
      const locKey = getStationKey(alloc);
      const key = `${alloc.departmentId}::${locKey}`;
      map.set(key, alloc.copyNo);
    });
    return map;
  }, [copyCalculation]);

  const emitChange = (newSelectedList) => {
    const calculated = calculateCopyAllocations(normOwnerDept, newSelectedList);
    onChange(calculated.distributedCopies);
  };

  const getDeptAllocatedCount = useCallback((deptId) => {
    const normDept = normalizeDepartmentId(deptId);
    return (copyCalculation?.allAllocations || []).filter(alloc => 
      normalizeDepartmentId(alloc.departmentId || alloc.dept || alloc.dept_code || alloc.department) === normDept
    ).length;
  }, [copyCalculation]);

  // Dynamic Department Sorting:
  // 1. Originator department on TOP ALWAYS with ★ badge
  // 2. Departments with copies allocated (count > 0)
  // 3. Other departments alphabetically
  const sortedDepartments = useMemo(() => {
    let list = [...availableDeptsList];

    if (deptSearchQuery.trim()) {
      const q = deptSearchQuery.toLowerCase();
      list = list.filter(d => 
        (d.name || '').toLowerCase().includes(q) || 
        (d.shortName || d.id || '').toLowerCase().includes(q) ||
        (d.nameTh || '').toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => {
      const aNorm = normalizeDepartmentId(a.id);
      const bNorm = normalizeDepartmentId(b.id);
      const aIsOwner = aNorm === normOwnerDept;
      const bIsOwner = bNorm === normOwnerDept;

      // 1. Originator department on top ALWAYS
      if (aIsOwner && !bIsOwner) return -1;
      if (!aIsOwner && bIsOwner) return 1;

      // 2. Departments with allocated copies
      const aCount = getDeptAllocatedCount(aNorm);
      const bCount = getDeptAllocatedCount(bNorm);
      if (aCount > 0 && bCount === 0) return -1;
      if (aCount === 0 && bCount > 0) return 1;
      if (aCount > 0 && bCount > 0 && aCount !== bCount) return bCount - aCount;

      // 3. Other departments alphabetically
      return (a.shortName || a.id || '').localeCompare(b.shortName || b.id || '');
    });
  }, [availableDeptsList, deptSearchQuery, normOwnerDept, getDeptAllocatedCount]);

  // Stations belonging to the currently selected department in Detail View
  const allStationsForSelectedDept = useMemo(() => {
    const std = getDepartmentStations(currentActiveDeptNorm, distributionLocations);
    const seenKeys = new Set(std.map(s => getStationKey(s)));
    
    // Also include any custom stations present in distributions that belong to this dept
    const extraFromDist = (distributions || [])
      .filter(d => {
        const dDept = normalizeDepartmentId(d.departmentId || d.dept || d.dept_code || d.department);
        return dDept === currentActiveDeptNorm && !seenKeys.has(getStationKey(d));
      })
      .map(d => ({
        id: getStationKey(d),
        departmentId: currentActiveDeptNorm,
        name: cleanLocationName(d.locationName || d.station_name || d.name || d.location || getStationKey(d)),
        isCustom: true
      }));

    return [...std, ...extraFromDist];
  }, [currentActiveDeptNorm, distributionLocations, distributions]);

  const ownerMasterStation = useMemo(() => {
    return getMasterStationForDept(normOwnerDept, distributionLocations);
  }, [normOwnerDept, distributionLocations]);

  // Toggle single station on/off
  const handleToggleStation = (deptId, station) => {
    const normDept = normalizeDepartmentId(deptId);
    const stationKey = getStationKey(station);
    if (!stationKey) return;
    
    // Guard: Master Station of Owner Dept cannot be toggled (permanently locked at Copy 01)
    if (isMasterStation({ ...station, departmentId: normDept }, normOwnerDept)) {
      return;
    }

    const key = `${normDept}::${stationKey}`;
    const newMap = new Map(selectedLocationMap);

    if (newMap.has(key)) {
      newMap.delete(key);
    } else {
      const stationName = cleanLocationName(station.name || station.station_name || station.locationName || station.location || stationKey);
      newMap.set(key, {
        departmentId: normDept,
        department: normDept,
        dept: normDept,
        dept_code: normDept,
        target_department: normDept,
        targetDepartment: normDept,
        locationId: stationKey,
        station_id: stationKey,
        id: stationKey,
        locationName: stationName,
        station_name: stationName,
        location: stationName,
        name: stationName,
        isCustom: !!(station.isCustom || station.is_custom),
        is_custom: !!(station.isCustom || station.is_custom)
      });
    }

    emitChange(Array.from(newMap.values()));
  };

  // Select/Unselect all non-master stations in active department
  const nonMasterInCurrentDept = useMemo(() => {
    return allStationsForSelectedDept.filter(s => !isMasterStation({ ...s, departmentId: currentActiveDeptNorm }, normOwnerDept));
  }, [allStationsForSelectedDept, currentActiveDeptNorm, normOwnerDept]);

  const isAllCurrentDeptSelected = useMemo(() => {
    return nonMasterInCurrentDept.length > 0 && 
      nonMasterInCurrentDept.every(s => selectedLocationMap.has(`${currentActiveDeptNorm}::${getStationKey(s)}`));
  }, [nonMasterInCurrentDept, selectedLocationMap, currentActiveDeptNorm]);

  const handleSelectAllInDept = (deptId) => {
    const normDept = normalizeDepartmentId(deptId);
    const stations = getDepartmentStations(normDept, distributionLocations);
    const newMap = new Map(selectedLocationMap);
    const nonMaster = stations.filter(s => !isMasterStation({ ...s, departmentId: normDept }, normOwnerDept));
    const allSelected = nonMaster.length > 0 && nonMaster.every(s => newMap.has(`${normDept}::${getStationKey(s)}`));

    if (allSelected) {
      nonMaster.forEach(s => newMap.delete(`${normDept}::${getStationKey(s)}`));
    } else {
      nonMaster.forEach(s => {
        const sKey = getStationKey(s);
        const sName = cleanLocationName(s.name || s.station_name || s.locationName || sKey);
        newMap.set(`${normDept}::${sKey}`, {
          departmentId: normDept,
          department: normDept,
          dept: normDept,
          dept_code: normDept,
          target_department: normDept,
          targetDepartment: normDept,
          locationId: sKey,
          station_id: sKey,
          id: sKey,
          locationName: sName,
          station_name: sName,
          location: sName,
          name: sName,
          isCustom: !!(s.isCustom || s.is_custom),
          is_custom: !!(s.isCustom || s.is_custom)
        });
      });
    }

    emitChange(Array.from(newMap.values()));
  };

  // Global All Toggle (compatibility helper)
  const allSelectableStations = useMemo(() => {
    const list = [];
    availableDeptsList.forEach(dept => {
      const normDept = normalizeDepartmentId(dept.id);
      const std = getDepartmentStations(normDept, distributionLocations);
      std.forEach(s => {
        if (!isMasterStation({ ...s, departmentId: normDept }, normOwnerDept)) {
          list.push({ ...s, departmentId: normDept });
        }
      });
    });
    return list;
  }, [normOwnerDept, availableDeptsList, distributionLocations]);

  const isAllGlobalSelected = useMemo(() => {
    return allSelectableStations.length > 0 && 
      allSelectableStations.every(s => selectedLocationMap.has(`${s.departmentId}::${getStationKey(s)}`));
  }, [allSelectableStations, selectedLocationMap]);

  const handleGlobalAllToggle = () => {
    let newList = [];
    if (!isAllGlobalSelected) {
      newList = allSelectableStations.map(s => ({
        departmentId: s.departmentId,
        dept: s.departmentId,
        dept_code: s.departmentId,
        locationId: getStationKey(s),
        station_id: getStationKey(s),
        id: getStationKey(s),
        locationName: cleanLocationName(s.name),
        station_name: cleanLocationName(s.name),
        location: cleanLocationName(s.name),
        name: cleanLocationName(s.name),
        isCustom: false
      }));
    }
    emitChange(newList);
  };

  // Create Station Engine: Updates Store Master Data AND Immediately Selects into DAR
  const handleCreateStation = (rawName) => {
    const nameStr = (rawName || '').trim();
    if (!nameStr) {
      setCreateError('กรุณากรอกชื่อจุดติดตั้ง');
      return false;
    }
    const cleanName = cleanLocationName(nameStr);
    
    // Duplicate Validation in same department
    const isDuplicate = allStationsForSelectedDept.some(s => 
      cleanLocationName(s.name || s.station_name || '').toLowerCase() === cleanName.toLowerCase()
    );
    if (isDuplicate) {
      setCreateError(`ชื่อจุดใช้งาน "${cleanName}" มีอยู่แล้วในแผนก ${selectedDeptObj?.shortName || currentActiveDeptNorm}`);
      return false;
    }

    // 1. Save to Master Data via Store Action
    const stationPayload = {
      name: cleanName,
      departmentId: currentActiveDeptNorm,
      isCustom: true
    };
    
    let created = null;
    if (addMasterStation) {
      created = addMasterStation(currentActiveDeptNorm, stationPayload);
    } else {
      const fallbackId = `STATION-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      created = {
        id: fallbackId,
        name: cleanName,
        departmentId: currentActiveDeptNorm,
        isCustom: true,
        createdAt: new Date().toISOString()
      };
    }

    const stationId = created?.id || `STATION-${Date.now()}`;

    // 2. Immediately select this new station into current DAR distributions
    const key = `${currentActiveDeptNorm}::${stationId}`;
    const newMap = new Map(selectedLocationMap);
    newMap.set(key, {
      departmentId: currentActiveDeptNorm,
      department: currentActiveDeptNorm,
      dept: currentActiveDeptNorm,
      dept_code: currentActiveDeptNorm,
      target_department: currentActiveDeptNorm,
      targetDepartment: currentActiveDeptNorm,
      locationId: stationId,
      station_id: stationId,
      id: stationId,
      locationName: cleanName,
      station_name: cleanName,
      location: cleanName,
      name: cleanName,
      isCustom: true,
      is_custom: true
    });

    emitChange(Array.from(newMap.values()));
    setIsCreateModalOpen(false);
    setNewStationName('');
    setQuickInputText('');
    setCreateError('');
    return true;
  };

  // Clean Form Notice (FM Bypass)
  if (isForm) {
    return (
      <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50/80 border border-emerald-200/70 text-emerald-900 text-xs font-medium shadow-2xs max-h-[36px]">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        <span className="truncate">แบบฟอร์มเปล่า (FM) จะพร้อมให้ดาวน์โหลดตามสิทธิ์การเข้าถึงทันทีเมื่ออนุมัติเสร็จสมบูรณ์ (Bypass การออกเล่มสำเนาควบคุม)</span>
      </div>
    );
  }

  const isCurrentOwner = currentActiveDeptNorm === normOwnerDept;

  return (
    <div className="h-auto w-full transition-all duration-200 space-y-3 select-none">
      
      {/* ══════════════════════════════════════════════════════════
          1. Header & Metric Strip
      ══════════════════════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Printer size={16} strokeWidth={2.2} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              การจัดสรรสำเนาควบคุมประจำจุดใช้งาน (Physical Controlled Copies)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              ระบุจุดใช้งานหน้างานที่ต้องการให้ DCC จัดพิมพ์เล่มสำเนาควบคุมไปติดตั้ง
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs font-mono font-medium px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">
            จัดสรรแล้ว: {copyCalculation.totalCopies} จุด (Master: 1 | Controlled: {copyCalculation.distributedCopies.length})
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          2. Originator Copy 01 (Permanent Lock Anchor Card)
      ══════════════════════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-50/90 border border-slate-200 rounded-xl shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-200/90 text-slate-800 shrink-0">
            Copy 01
          </span>
          <div className="flex items-center gap-1.5 truncate text-xs">
            <span className="font-bold text-slate-800">
              แผนกเจ้าของเอกสาร ({normOwnerDept} — {cleanLocationName(ownerMasterStation.name)})
            </span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-600 truncate">(จุดใช้งานหลัก)</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/80 text-[11px] font-semibold shadow-2xs">
            <Lock size={10} />
            <span>Master Copy 01 ล็อกถาวร</span>
            <span className="text-slate-400 font-normal">[สถานะ: บังคับจ่ายถาวร]</span>
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          3. Fixed-Height 2-Column Master-Detail Split Pane Layout
      ══════════════════════════════════════════════════════════ */}
      <div className="border border-slate-200 rounded-xl bg-white overflow-hidden grid grid-cols-1 md:grid-cols-12 h-[380px] shadow-2xs">
        
        {/* ────────────────────────────────────────────────────────
            LEFT COLUMN (md:col-span-5): Department Navigation List
        ──────────────────────────────────────────────────────── */}
        <div className="md:col-span-5 h-full flex flex-col border-b md:border-b-0 md:border-r border-slate-100 bg-white overflow-hidden">
          
          {/* Search Header */}
          <div className="px-3 py-2 border-b border-slate-100 bg-white shrink-0 flex items-center justify-between gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
              <input
                type="text"
                placeholder="ค้นหาแผนก..."
                value={deptSearchQuery}
                onChange={(e) => setDeptSearchQuery(e.target.value)}
                className="w-full pl-7 pr-7 py-1 h-7 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-slate-400 focus:outline-none placeholder:text-slate-400 text-slate-800 shadow-2xs"
              />
              {deptSearchQuery && (
                <button
                  type="button"
                  onClick={() => setDeptSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleGlobalAllToggle}
              className="h-7 px-2 rounded-md text-[10px] font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all cursor-pointer shrink-0"
              title="เลือกหรือล้างสำเนาทุกแผนก"
            >
              {isAllGlobalSelected ? 'ล้างทุกแผนก' : 'เลือกทุกแผนก'}
            </button>
          </div>

          {/* Department Count Subhead */}
          <div className="px-3 py-1 bg-slate-50/60 border-b border-slate-100/80 flex items-center justify-between text-[10px] text-slate-400 font-medium">
            <span>แผนกในระบบ ({sortedDepartments.length})</span>
            <span>จัดสรร (จุด)</span>
          </div>

          {/* Department Scrollable List */}
          <div className="overflow-y-auto flex-1 divide-y divide-slate-100/80">
            {sortedDepartments.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                ไม่พบแผนกที่ตรงกับคำค้นหา
              </div>
            ) : (
              sortedDepartments.map((dept) => {
                const normDept = normalizeDepartmentId(dept.id);
                const isOwner = normDept === normOwnerDept;
                const isSelected = normDept === currentActiveDeptNorm;
                const count = getDeptAllocatedCount(normDept);

                return (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() => setSelectedDeptId(normDept)}
                    className={`w-full px-3 py-2.5 flex items-center justify-between text-left transition-colors cursor-pointer text-xs ${
                      isSelected
                        ? 'bg-blue-50/70 border-l-3 border-blue-600 text-blue-950 font-semibold'
                        : 'hover:bg-slate-50/80 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono font-bold text-xs shrink-0">
                        {dept.shortName || dept.id}
                      </span>
                      <span className="truncate text-slate-600 text-[11px]">
                        {dept.nameTh || dept.name}
                      </span>
                      {isOwner && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 shrink-0">
                          ★ เจ้าของเอกสาร
                        </span>
                      )}
                    </div>

                    <div className="shrink-0 ml-2">
                      {count > 0 ? (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          isSelected ? 'bg-blue-600 text-white' : 'bg-indigo-100 text-indigo-700'
                        }`}>
                          {count} จุด
                        </span>
                      ) : (
                        <span className="text-slate-300 text-[10px] font-mono">–</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ────────────────────────────────────────────────────────
            RIGHT COLUMN (md:col-span-7): Station Matrix & Workspace
        ──────────────────────────────────────────────────────── */}
        <div className="md:col-span-7 h-full flex flex-col bg-slate-50/40 border-l border-slate-100 overflow-hidden">
          
          {/* Header Bar */}
          <div className="bg-white px-4 py-2.5 border-b border-slate-100 flex items-center justify-between shrink-0 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Building2 size={15} className="text-slate-400 shrink-0" />
              <span className="font-bold text-xs text-slate-900 truncate">
                {selectedDeptObj?.shortName || currentActiveDeptNorm} — {selectedDeptObj?.nameTh || selectedDeptObj?.name || currentActiveDeptNorm}
              </span>
              <span className="text-slate-400 text-xs shrink-0 hidden sm:inline">• จุดติดตั้งประจำแผนก</span>
              {isCurrentOwner && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/70 px-1.5 py-0.2 rounded shrink-0">
                  <Lock size={9} /> Copy 01 บังคับถาวร
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleSelectAllInDept(currentActiveDeptNorm)}
                className="h-7 px-2 text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded border border-slate-200 transition-colors cursor-pointer"
              >
                {isAllCurrentDeptSelected ? 'ล้างค่า' : 'เลือกทั้งหมด'}
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setNewStationName('');
                  setCreateError('');
                  setIsCreateModalOpen(true);
                }}
                className="h-8 px-2.5 text-xs text-blue-600 bg-blue-50/60 hover:bg-blue-100/80 rounded-md font-medium flex items-center gap-1.5 cursor-pointer border border-blue-200/60 transition-colors shadow-2xs"
              >
                <Plus size={13} strokeWidth={2.5} />
                <span>+ เพิ่มจุดติดตั้งใหม่</span>
              </button>
            </div>
          </div>

          {/* Station Matrix Grid */}
          <div className="overflow-y-auto flex-1 p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 content-start">
            {(!allStationsForSelectedDept || allStationsForSelectedDept.length === 0) ? (
              <div className="col-span-1 sm:col-span-2 flex flex-col items-center justify-center p-8 text-center bg-white rounded-xl border border-dashed border-slate-200 my-auto">
                <div className="w-10 h-10 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center mb-2">
                  <Building2 size={20} />
                </div>
                <p className="text-xs font-medium text-slate-600">
                  ยังไม่มีจุดติดตั้งในแผนกนี้
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5 mb-3">
                  ท่านสามารถกดเพิ่มจุดติดตั้งใหม่เพื่อจัดสรรสำเนาในแผนกนี้ได้ทันที
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setNewStationName('');
                    setCreateError('');
                    setIsCreateModalOpen(true);
                  }}
                  className="h-8 px-3 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg font-medium flex items-center gap-1.5 cursor-pointer border border-blue-200 transition-colors shadow-2xs"
                >
                  <Plus size={13} strokeWidth={2.5} />
                  <span>+ เพิ่มจุดติดตั้งใหม่</span>
                </button>
              </div>
            ) : (
              allStationsForSelectedDept.map((station) => {
              const stationKey = getStationKey(station);
              const isMaster = isCurrentOwner && isMasterStation({ ...station, departmentId: currentActiveDeptNorm }, normOwnerDept);
              const isSelected = selectedLocationMap.has(`${currentActiveDeptNorm}::${stationKey}`) || isMaster;
              const copyLabel = copyNumberByLocationKey.get(`${currentActiveDeptNorm}::${stationKey}`);
              const stationCleanName = cleanLocationName(station.name || station.station_name || stationKey);

              // Master Station Checkbox Tile (Locked)
              if (isMaster) {
                return (
                  <div
                    key={stationKey}
                    className="p-3 rounded-xl border border-amber-200 bg-amber-50/70 text-slate-800 flex items-start justify-between gap-2 select-none cursor-not-allowed shadow-2xs"
                    title="Master Copy 01 ประจำจุดคุมงานแผนกต้นทาง (ล็อกอัตโนมัติ)"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="w-4 h-4 mt-0.5 rounded border border-amber-400 bg-amber-500 text-white flex items-center justify-center shrink-0">
                        <Check size={11} strokeWidth={3} />
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-slate-900 truncate flex items-center gap-1.5">
                          <span>{stationCleanName}</span>
                          <Lock size={10} className="text-amber-600 shrink-0" />
                        </div>
                        <p className="text-[10px] text-amber-800/80 mt-0.5">
                          จุดควบคุมหลัก • แผนกเจ้าของเอกสาร
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-amber-800 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded shrink-0">
                      Copy 01
                    </span>
                  </div>
                );
              }

              // Standard / Custom Point-of-use Checkbox Tile
              return (
                <div
                  key={stationKey}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleToggleStation(currentActiveDeptNorm, station)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleToggleStation(currentActiveDeptNorm, station);
                    }
                  }}
                  className={`p-3 rounded-xl border transition-all flex items-start justify-between gap-2 select-none cursor-pointer outline-none shadow-2xs ${
                    isSelected
                      ? 'bg-white border-blue-600 ring-1 ring-blue-600 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white'
                    }`}>
                      {isSelected && <Check size={11} strokeWidth={3} />}
                    </span>
                    <div className="min-w-0">
                      <div className={`text-xs truncate ${isSelected ? 'text-blue-950 font-bold' : 'text-slate-800 font-semibold'}`}>
                        {stationCleanName}
                      </div>
                      {station.isCustom && (
                        <span className="inline-flex items-center gap-0.5 mt-0.5 text-[9px] font-medium text-purple-700 bg-purple-50 border border-purple-200 px-1 py-0.2 rounded">
                          <Sparkles size={8} />
                          <span>จุดติดตั้งพิเศษ</span>
                        </span>
                      )}
                      {station.description && !station.isCustom && (
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">
                          {station.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {isSelected && copyLabel && (
                    <span className="text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded shrink-0">
                      Copy {copyLabel}
                    </span>
                  )}
                </div>
              );
            })
          )}
          </div>

          {/* Quick Add Station Inline Bar at Bottom of Workspace */}
          <div className="p-2.5 bg-white border-t border-slate-100 flex items-center gap-2 shrink-0">
            <div className="relative flex-1 max-w-sm">
              <input
                type="text"
                placeholder={`เพิ่มจุดติดตั้งพิเศษใน ${selectedDeptObj?.shortName || currentActiveDeptNorm}...`}
                value={quickInputText}
                onChange={(e) => setQuickInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateStation(quickInputText);
                  }
                }}
                className="w-full h-8 pl-3 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-blue-400 focus:outline-none placeholder:text-slate-400 text-slate-800 shadow-2xs"
              />
            </div>
            <button
              type="button"
              onClick={() => handleCreateStation(quickInputText)}
              className="h-8 px-3 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all cursor-pointer shadow-2xs flex items-center gap-1 shrink-0"
            >
              <Plus size={12} />
              <span>เพิ่มจุด</span>
            </button>
          </div>

        </div>

      </div>

      {/* ══════════════════════════════════════════════════════════
          4. Sticky Summary Footer (Compact Strip)
      ══════════════════════════════════════════════════════════ */}
      <div className="px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs shadow-2xs">
        <div className="flex items-center gap-2 text-slate-500 font-medium flex-wrap">
          <span>ต้นฉบับ (Master): <strong className="text-slate-700 font-semibold">จัดเก็บที่ DCC</strong></span>
          <span className="text-slate-300">|</span>
          <span>สำเนาควบคุมทั้งหมด: <strong className="text-indigo-600 font-bold">{copyCalculation.totalCopies}</strong> จุด</span>
          <span className="text-slate-400 font-mono">
            (Copy 01 - Copy {String(copyCalculation.totalCopies).padStart(2, '0')})
          </span>
          <span className="text-slate-400 text-[11px] hidden lg:inline">
            สำเนาที่จะพิมพ์ ({copyCalculation.totalCopies} ชุด):
          </span>
        </div>

        {/* Allocated copy tags */}
        <div className="flex flex-wrap gap-1 items-center">
          {copyCalculation.allAllocations.map(alloc => {
            const isOrigin = alloc.isOwner || alloc.copyNo === '01';
            return (
              <span
                key={`${alloc.departmentId}::${alloc.locationId}`}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono border ${
                  isOrigin
                    ? 'bg-indigo-50 text-indigo-900 border-indigo-200 font-semibold'
                    : 'bg-white text-slate-700 border-slate-200 shadow-2xs'
                }`}
              >
                <span className="font-bold text-indigo-600">{alloc.departmentId}</span>
                <span>Copy {alloc.copyNo}</span>
                <span className="text-slate-500 font-sans font-normal truncate max-w-[100px] hidden md:inline">
                  {cleanLocationName(alloc.locationName)}
                </span>
                {!isOrigin && (
                  <button
                    type="button"
                    onClick={() => handleToggleStation(alloc.departmentId, { id: alloc.locationId, name: alloc.locationName })}
                    className="text-slate-300 hover:text-rose-500 cursor-pointer ml-0.5"
                    title="ลบจุดนี้ออก"
                  >
                    <X size={10} strokeWidth={2.5} />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      </div>

      {/* Confirm Button (if required by parent) */}
      {showConfirmButton && (
        <div className="flex justify-end pt-1 border-t border-slate-100">
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors shadow-sm cursor-pointer"
          >
            Confirm & Distribute
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          5. Modal Dialog: Create Point-of-Use Station
      ══════════════════════════════════════════════════════════ */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4 animate-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Plus size={16} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    เพิ่มจุดติดตั้งใหม่ — แผนก {selectedDeptObj?.shortName || currentActiveDeptNorm}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {selectedDeptObj?.nameTh || selectedDeptObj?.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setNewStationName('');
                  setCreateError('');
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-md"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-2">
              <label htmlFor="station-name-input" className="block text-xs font-semibold text-slate-700">
                ชื่อจุดใช้งาน / ตำแหน่งติดตั้งเล่มสำเนา <span className="text-rose-500">*</span>
              </label>
              <input
                id="station-name-input"
                type="text"
                autoFocus
                placeholder="เช่น ห้องชั่งสาร 2, ไลน์บรรจุ 4, ห้องควบคุมคุณภาพ..."
                value={newStationName}
                onChange={(e) => {
                  setNewStationName(e.target.value);
                  if (createError) setCreateError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateStation(newStationName);
                  } else if (e.key === 'Escape') {
                    setIsCreateModalOpen(false);
                  }
                }}
                className={`w-full h-9 px-3 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 transition-all ${
                  createError
                    ? 'border-rose-300 focus:ring-rose-200 focus:border-rose-400 bg-rose-50/40'
                    : 'border-slate-200 focus:ring-blue-100 focus:border-blue-500'
                }`}
              />
              {createError && (
                <p className="text-[11px] text-rose-600 flex items-center gap-1 font-medium">
                  {createError}
                </p>
              )}
              <p className="text-[11px] text-slate-400">
                จุดติดตั้งนี้จะถูกบันทึกลงฐานข้อมูล Master Data ของระบบ และเลือกเข้าสู่คำร้องนี้ทันที
              </p>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setNewStationName('');
                  setCreateError('');
                }}
                className="h-8 px-3 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => handleCreateStation(newStationName)}
                className="h-8 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Check size={12} strokeWidth={3} />
                <span>บันทึกและเลือกใช้งาน</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default DistributionSetup;
