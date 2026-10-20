import React, { useMemo } from 'react';
import { Globe, Lock, Building2, ShieldAlert, Check, ShieldCheck, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ACCESS_SCOPES } from '../../utils/accessControl';
import AuthorizedUsersSelector from './AuthorizedUsersSelector';
import useStore from '../../../../store/useStore';
import { resolveReviewer, resolveApprover } from '../../utils/workflowResolver';

/**
 * DocumentAccessControlSelector component (Linear / Vercel 2-Step Progressive Flow)
 * 
 * @param {Object} props
 * @param {Object} props.value - { scope: 'GENERAL' | 'DEPT_ONLY' | 'TARGETED' | 'RESTRICTED', authorized_depts: [], authorized_users: [], min_access_level: number, restricted_mode: 'MIN_LEVEL' | 'WHITELIST' }
 * @param {Function} props.onChange - Callback with updated access_control object
 * @param {string} props.ownerDept - The document owner's department
 * @param {Array} props.masterDepartments - List of available departments
 * @param {Array} props.masterUsers - List of available users
 * @param {Array} props.workflowParticipants - Optional explicit list of workflow participants
 */
const DocumentAccessControlSelector = ({
  value = { scope: 'GENERAL', authorized_depts: [], authorized_users: [], min_access_level: 4 },
  onChange,
  ownerDept = 'QA',
  masterDepartments = [],
  masterUsers = [],
  workflowParticipants = []
}) => {
  const currentScope = value?.scope || ACCESS_SCOPES.GENERAL;
  const currentOwnerDept = ownerDept || 'QA';

  // Restricted sub-mode: 'MIN_LEVEL' = minimum position level, 'WHITELIST' = explicit person list
  // Unset mode is evaluated as MIN_LEVEL by hasDocumentAccess, so display it the same way
  const restrictedMode = value?.restricted_mode || 'MIN_LEVEL';

  const setRestrictedMode = (mode) => {
    onChange({
      ...value,
      restricted_mode: mode
    });
  };

  // Normalize authorized departments: Ensure owner department is always included
  const authorizedDepts = useMemo(() => {
    const rawList = value?.authorized_depts || [];
    if (currentScope === ACCESS_SCOPES.TARGETED) {
      if (!rawList.includes(currentOwnerDept)) {
        return [currentOwnerDept, ...rawList];
      }
    }
    return rawList;
  }, [value?.authorized_depts, currentScope, currentOwnerDept]);

  const authorizedUsers = value?.authorized_users || [];
  const minAccessLevel = value?.min_access_level ?? 4;

  // Auto-resolve workflow participants (Requester, Reviewer, Approver)
  const resolvedWorkflowParticipants = useMemo(() => {
    if (workflowParticipants && workflowParticipants.length > 0) {
      return workflowParticipants;
    }
    try {
      const storeState = typeof window !== 'undefined' ? useStore?.getState?.() : null;
      if (storeState) {
        const list = [];
        const currentU = storeState.currentUser;
        if (currentU) {
          list.push({
            id: currentU.id,
            empId: currentU.empId,
            name: currentU.name,
            department: currentU.department || currentU.dept || currentOwnerDept,
            role: 'REQUESTER',
            roleTitle: 'ผู้จัดทำ (Requester)'
          });
          const allMasters = masterUsers && masterUsers.length > 0 ? masterUsers : (storeState.masterUsers || []);
          const allReviewers = storeState.reviewUsers || allMasters;
          const allApprovers = storeState.approveUsers || allMasters;
          const revObj = resolveReviewer(currentU.id, currentOwnerDept, allMasters, allReviewers);
          if (revObj && revObj.id !== currentU.id) {
            const revU = allMasters.find(u => u.id === revObj.id);
            if (revU) {
              list.push({
                id: revU.id,
                empId: revU.empId,
                name: revU.name,
                department: revU.primary_department || revU.department || revObj.dept,
                role: 'REVIEWER',
                roleTitle: 'ผู้ทบทวน (Reviewer)'
              });
            }
          }
          const appObj = resolveApprover(currentU.id, revObj?.id, currentOwnerDept, allMasters, allApprovers);
          if (appObj && appObj.id !== currentU.id && appObj.id !== revObj?.id) {
            const appU = allMasters.find(u => u.id === appObj.id);
            if (appU) {
              list.push({
                id: appU.id,
                empId: appU.empId,
                name: appU.name,
                department: appU.primary_department || appU.department || appObj.dept,
                role: 'APPROVER',
                roleTitle: 'ผู้อนุมัติ (Approver)'
              });
            }
          }
        }
        return list;
      }
    } catch {
      // Graceful fallback
    }
    return [];
  }, [workflowParticipants, masterUsers, currentOwnerDept]);

  const handleScopeChange = (newScope) => {
    let nextDepts = value?.authorized_depts || [];
    if (newScope === ACCESS_SCOPES.TARGETED) {
      if (!nextDepts.includes(currentOwnerDept)) {
        nextDepts = [currentOwnerDept, ...nextDepts];
      }
    }

    onChange({
      ...value,
      scope: newScope,
      authorized_depts: nextDepts,
      authorized_users: authorizedUsers,
      min_access_level: minAccessLevel,
      restricted_mode: restrictedMode
    });
  };

  const toggleDept = (deptId) => {
    if (deptId === currentOwnerDept) return;

    let nextDepts = [];
    if (authorizedDepts.includes(deptId)) {
      nextDepts = authorizedDepts.filter((d) => d !== deptId);
    } else {
      nextDepts = [...authorizedDepts, deptId];
    }

    if (!nextDepts.includes(currentOwnerDept)) {
      nextDepts.unshift(currentOwnerDept);
    }

    onChange({
      ...value,
      authorized_depts: nextDepts
    });
  };

  const handleAuthorizedUsersChange = (nextUsers) => {
    onChange({
      ...value,
      authorized_users: nextUsers
    });
  };

  const handleMinLevelChange = (level) => {
    onChange({
      ...value,
      min_access_level: Number(level)
    });
  };

  // Dynamic department list resolution
  const deptsList = useMemo(() => {
    let raw = masterDepartments;
    if (!raw || raw.length === 0) {
      try {
        const state = useStore?.getState?.();
        raw = state?.masterDepartments || state?.departments || [];
      } catch {
        raw = [];
      }
    }
    const seen = new Set();
    const list = [];

    const items = [...(raw || [])];
    if (!items.some(d => (typeof d === 'string' ? d : d.id) === currentOwnerDept)) {
      items.unshift({ id: currentOwnerDept, name: currentOwnerDept, nameTh: currentOwnerDept });
    }

    items.forEach(d => {
      const id = typeof d === 'string' ? d : d.id;
      if (id && !seen.has(id)) {
        seen.add(id);
        list.push(d);
      }
    });

    return list.sort((a, b) => {
      const aId = typeof a === 'string' ? a : a.id;
      const bId = typeof b === 'string' ? b : b.id;
      if (aId === currentOwnerDept) return -1;
      if (bId === currentOwnerDept) return 1;
      return aId.localeCompare(bId);
    });
  }, [masterDepartments, currentOwnerDept]);

  const scopeCards = [
    {
      id: ACCESS_SCOPES.GENERAL,
      label: 'ทั่วไป (General)',
      desc: 'เปิดให้ทุกคนในองค์กรสามารถเปิดอ่านไฟล์เอกสารนี้ได้ตามปกติ',
      icon: Globe
    },
    {
      id: ACCESS_SCOPES.DEPT_ONLY,
      label: 'เฉพาะแผนกฉัน (Department Only)',
      desc: `สงวนสิทธิ์การเปิดอ่านไฟล์เฉพาะบุคลากรในสังกัดแผนก ${currentOwnerDept} เท่านั้น`,
      icon: Lock
    },
    {
      id: ACCESS_SCOPES.TARGETED,
      label: 'เฉพาะบางแผนก (Targeted)',
      desc: 'อนุญาตเฉพาะแผนกที่เลือกเปิดดูเอกสารร่วมกัน (แผนกเจ้าของเอกสารได้รับสิทธิ์ถาวร)',
      icon: Building2
    },
    {
      id: ACCESS_SCOPES.RESTRICTED,
      label: 'ลับเฉพาะบุคคล/ตำแหน่ง (Restricted)',
      desc: 'ควบคุมความลับขั้นสูง: อนุญาตเฉพาะรายชื่อบุคคลที่กำหนด หรือผู้มีระดับตำแหน่งขั้นต่ำตามเกณฑ์',
      icon: ShieldAlert
    }
  ];

  const scopeDescriptions = {
    [ACCESS_SCOPES.GENERAL]: 'เปิดให้ทุกคนในองค์กรสามารถเปิดอ่านไฟล์เอกสารนี้ได้ตามปกติ',
    [ACCESS_SCOPES.DEPT_ONLY]: `สงวนสิทธิ์การเปิดอ่านไฟล์เฉพาะบุคลากรในสังกัดแผนก ${currentOwnerDept} เท่านั้น`,
    [ACCESS_SCOPES.TARGETED]: 'อนุญาตเฉพาะแผนกที่เลือกเปิดดูเอกสารร่วมกัน (แผนกเจ้าของเอกสารได้รับสิทธิ์ถาวร)',
    [ACCESS_SCOPES.RESTRICTED]: 'ควบคุมความลับขั้นสูง: อนุญาตเฉพาะรายชื่อบุคคลที่กำหนด หรือผู้มีระดับตำแหน่งขั้นต่ำตามเกณฑ์'
  };

  return (
    <div className="h-auto w-full transition-all duration-200 bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs select-none">
      {/* 1. Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <ShieldCheck size={16} strokeWidth={2.2} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              ระดับการเข้าถึงและความลับของเอกสาร (Digital Access Scope)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              กำหนดขอบเขตสิทธิ์การเปิดอ่านไฟล์ดิจิทัลตามมาตรฐาน ISO 9001
            </p>
          </div>
        </div>
        <span className="text-xs font-mono font-medium px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 self-start sm:self-auto">
          Scope: {currentScope}
        </span>
      </div>

      {/* 2. Top-level Modern Segmented Control Track */}
      <div>
        <div className="bg-slate-100/80 p-1 rounded-xl grid grid-cols-2 md:grid-cols-4 gap-1 border border-slate-200/60">
          {scopeCards.map((card) => {
            const isSelected = currentScope === card.id;
            const Icon = card.icon;

            return (
              <button
                key={card.id}
                type="button"
                onClick={() => handleScopeChange(card.id)}
                className={`h-10 sm:h-11 flex items-center justify-center gap-2 px-3 rounded-lg text-[13px] font-medium transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80 font-semibold'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-white/60 border border-transparent'
                }`}
              >
                <Icon
                  size={15}
                  strokeWidth={2.2}
                  className={isSelected ? 'text-blue-600 shrink-0' : 'text-slate-400 shrink-0'}
                />
                <span className={`text-sm font-bold truncate ${isSelected ? 'text-slate-900' : 'text-slate-600'}`}>
                  {card.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Micro Helper Subtitle */}
        <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
          <Info size={13} className="text-slate-400 shrink-0" />
          <span>{scopeDescriptions[currentScope] || 'กำหนดขอบเขตสิทธิ์การเปิดอ่านไฟล์ดิจิทัลตามมาตรฐาน ISO 9001'}</span>
        </p>
      </div>

      {/* 3. Progressive Drawer */}
      <AnimatePresence mode="wait">
        {/* TARGETED: Modern Sleek Department Matrix Grid */}
        {currentScope === ACCESS_SCOPES.TARGETED && (
          <motion.div
            key="targeted-panel"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            className="mt-3 p-3.5 bg-slate-50/60 border border-slate-200/70 rounded-xl space-y-3"
          >
            {/* Header Line */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Building2 className="w-4 h-4 text-slate-500 inline mr-1.5" strokeWidth={1.5} />
                <span className="text-xs font-semibold text-slate-800">
                  เลือกแผนกที่อนุญาตให้อ่านไฟล์ (Authorized Departments)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded-full">
                  เลือกแล้ว {authorizedDepts.length} แผนก
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const allDeptIds = deptsList.map(d => typeof d === 'string' ? d : d.id);
                    if (!allDeptIds.includes(currentOwnerDept)) {
                      allDeptIds.unshift(currentOwnerDept);
                    }
                    onChange({
                      ...value,
                      authorized_depts: allDeptIds
                    });
                  }}
                  className="text-[11px] font-medium text-slate-500 hover:text-slate-900 transition-colors ml-2 cursor-pointer"
                >
                  เลือกทั้งหมด
                </button>
                <span className="text-slate-300 text-xs">|</span>
                <button
                  type="button"
                  onClick={() => {
                    onChange({
                      ...value,
                      authorized_depts: [currentOwnerDept]
                    });
                  }}
                  className="text-[11px] font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  ล้างค่า
                </button>
              </div>
            </div>

            {/* Department Matrix Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {deptsList.map((dept) => {
                const deptId = typeof dept === 'string' ? dept : dept.id;
                const isOwner = deptId === currentOwnerDept;
                const isChecked = isOwner || authorizedDepts.includes(deptId);
                const deptFullName = typeof dept === 'object' ? (dept.nameTh || dept.nameEn || dept.name) : deptId;

                // 1. แผนกเจ้าของเอกสาร (Originator Dept - Locked)
                if (isOwner) {
                  return (
                    <div
                      key={deptId}
                      title={`${deptId} - ${deptFullName} (แผนกเจ้าของเอกสาร - ล็อกถาวร)`}
                      className="h-10 px-2.5 py-1.5 rounded-lg border bg-slate-100/90 border-slate-200/80 text-slate-600 cursor-not-allowed opacity-90 shadow-none flex items-center justify-between select-none text-xs"
                    >
                      <div className="flex items-center min-w-0 pr-1.5">
                        <span className="font-mono font-bold text-[11px] px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 mr-2 shrink-0">
                          {deptId}
                        </span>
                        <span className="truncate text-[12px] text-slate-600 font-medium">
                          {deptFullName}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap hidden sm:inline">
                          เจ้าของ (ล็อก)
                        </span>
                        <Lock className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.5} />
                      </div>
                    </div>
                  );
                }

                // 2. แผนกที่ถูกเลือก (Selected State) vs 3. แผนกที่ไม่ได้เลือก (Default Unselected)
                return (
                  <button
                    key={deptId}
                    type="button"
                    title={`${deptId} - ${deptFullName}`}
                    aria-pressed={isChecked}
                    onClick={() => toggleDept(deptId)}
                    className={`h-10 px-2.5 py-1.5 rounded-lg border transition-all flex items-center justify-between select-none cursor-pointer text-xs ${
                      isChecked
                        ? 'bg-white border-blue-500/80 text-blue-900 shadow-[0_1px_2px_rgba(59,130,246,0.08)] ring-1 ring-blue-500/20'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/90 text-slate-700 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center min-w-0 pr-1.5">
                      <span
                        className={`font-mono font-bold text-[11px] px-1.5 py-0.5 rounded mr-2 shrink-0 ${
                          isChecked
                            ? 'bg-blue-100/70 text-blue-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {deptId}
                      </span>
                      <span
                        className={`truncate text-[12px] ${
                          isChecked ? 'font-medium text-blue-950' : 'text-slate-600'
                        }`}
                      >
                        {deptFullName}
                      </span>
                    </div>
                    <div className="shrink-0 ml-1">
                      {isChecked ? (
                        <Check className="w-3.5 h-3.5 text-blue-600 stroke-[2]" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border border-dashed border-slate-300" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* RESTRICTED: Zero Rainbow Nested Boxes */}
        {currentScope === ACCESS_SCOPES.RESTRICTED && (
          <motion.div
            key="restricted-panel"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            className="h-auto pt-3 border-t border-slate-100 space-y-3.5"
          >
            {/* Top Toggle Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setRestrictedMode('MIN_LEVEL')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    restrictedMode === 'MIN_LEVEL'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  ตามระดับตำแหน่งขั้นต่ำ
                </button>
                <button
                  type="button"
                  onClick={() => setRestrictedMode('WHITELIST')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    restrictedMode === 'WHITELIST'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  ระบุรายชื่อเฉพาะบุคคล
                </button>
              </div>

              {/* Signer Permissions Inline */}
              <div className="text-xs text-emerald-700 flex items-center gap-1.5 font-medium">
                <Check size={13} className="text-emerald-600 shrink-0" strokeWidth={2.5} />
                <span>ผู้ลงนามในสายอนุมัติได้รับสิทธิ์อัตโนมัติ</span>
              </div>
            </div>

            {/* Mode A: MIN_LEVEL */}
            {restrictedMode === 'MIN_LEVEL' && (
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-slate-50/80 rounded-xl border border-slate-200/80">
                  <label htmlFor="min-access-level-select" className="text-xs font-semibold text-slate-800 shrink-0">
                    ระดับตำแหน่งขั้นต่ำที่อนุญาต (Minimum Position Level):
                  </label>
                  <select
                    id="min-access-level-select"
                    aria-label="ระดับสิทธิ์ขั้นต่ำ"
                    value={minAccessLevel}
                    onChange={(e) => handleMinLevelChange(e.target.value)}
                    className="h-9 px-3 bg-white text-xs font-medium text-slate-800 border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:border-slate-400 cursor-pointer flex-1 max-w-md"
                  >
                    <option value={1}>Level 1: ทุกคนในองค์กร (All Staff)</option>
                    <option value={3}>Level 3+ — เจ้าหน้าที่อาวุโสขึ้นไป (Senior Staff L3+)</option>
                    <option value={4}>Level 4+ — หัวหน้างานขึ้นไป (Supervisor L4+)</option>
                    <option value={5}>Level 5+ — ผู้ช่วยผู้จัดการขึ้นไป (Asst. Manager L5+)</option>
                    <option value={6}>Level 6+ — ผู้จัดการฝ่ายขึ้นไป (Dept. Manager L6+)</option>
                    <option value={7}>Level 7+ — ผู้บริหารระดับสูง (Directors & Executives L7+)</option>
                  </select>
                </div>

                {minAccessLevel === 1 && (
                  <div className="p-2.5 rounded-lg bg-blue-50/60 border border-blue-100 text-xs text-blue-800 font-medium">
                    พนักงานทุกคนเข้าถึงได้ตามระดับตำแหน่ง ไม่จำเป็นต้องระบุบุคคลเพิ่มเติม
                  </div>
                )}
              </div>
            )}

            {/* Mode B: WHITELIST */}
            {restrictedMode === 'WHITELIST' && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-800 block">
                  ระบุบุคคลที่ได้รับอนุญาตเพิ่มเติมเฉพาะบุคคล (Authorized Individual Whitelist)
                </label>
                <AuthorizedUsersSelector
                  selectedUserIds={authorizedUsers}
                  onChange={handleAuthorizedUsersChange}
                  users={masterUsers}
                  minLevel={null}
                  onMinLevelChange={null}
                  workflowParticipants={resolvedWorkflowParticipants}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DocumentAccessControlSelector;
