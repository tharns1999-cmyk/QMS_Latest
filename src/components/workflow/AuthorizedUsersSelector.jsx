import React, { useState, useMemo } from 'react';
import { 
  Search, 
  X, 
  Check, 
  Plus, 
  Lock,
  RotateCcw
} from 'lucide-react';
import { getDepartmentTheme } from '../../config/qmsRegistry';

const getInitials = (name = '') => {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

/**
 * AuthorizedUsersSelector Component (Compact Linear / Vercel Combobox Style)
 */
const AuthorizedUsersSelector = ({
  selectedUserIds = [],
  onChange,
  users = [],
  minLevel = null,
  onMinLevelChange = null,
  onToggleUser = null,
  onRemoveUser = null,
  workflowParticipants = []
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeDeptFilter, setActiveDeptFilter] = useState('ALL');

  const safeSelectedIds = useMemo(() => {
    return Array.isArray(selectedUserIds) ? selectedUserIds : [];
  }, [selectedUserIds]);

  const activeUsers = useMemo(() => {
    return (users || []).filter(u => u && (u.status === 'ACTIVE' || u.status === 'Active' || !u.status));
  }, [users]);

  const normalizedParticipants = useMemo(() => {
    if (!Array.isArray(workflowParticipants)) return [];
    return workflowParticipants.map(item => {
      if (!item) return null;
      if (typeof item === 'string') {
        const found = (users || []).find(u => u && (u.id === item || u.empId === item));
        return {
          id: item,
          empId: found?.empId,
          name: found ? found.name : item,
          department: found?.primary_department || found?.department || found?.dept || 'QMS',
          roleTitle: 'ผู้ร่วมสายงาน (Auto)'
        };
      }
      const found = (users || []).find(u => u && (u.id === item.id || (item.empId && u.empId === item.empId)));
      let roleTitle = item.roleTitle;
      if (!roleTitle) {
        if (item.role === 'REQUESTER') roleTitle = 'ผู้จัดทำ (Requester)';
        else if (item.role === 'REVIEWER') roleTitle = 'ผู้ทบทวน (Reviewer)';
        else if (item.role === 'APPROVER') roleTitle = 'ผู้อนุมัติ (Approver)';
        else roleTitle = 'ผู้ร่วมสายงาน (Auto)';
      }
      return {
        id: item.id,
        empId: item.empId || found?.empId,
        name: item.name || found?.name || item.id,
        department: item.department || found?.primary_department || found?.department || found?.dept || 'QMS',
        role: item.role,
        roleTitle
      };
    }).filter(Boolean);
  }, [workflowParticipants, users]);

  const participantIdsSet = useMemo(() => {
    const set = new Set();
    (normalizedParticipants || []).forEach(p => {
      if (p?.id) set.add(p.id);
      if (p?.empId) set.add(p.empId);
    });
    return set;
  }, [normalizedParticipants]);

  const selectedUsers = useMemo(() => {
    return (safeSelectedIds || [])
      .map(id => (activeUsers || []).find(u => u && (u.id === id || u.empId === id)))
      .filter(Boolean);
  }, [safeSelectedIds, activeUsers]);

  const departmentsList = useMemo(() => {
    const depts = new Set();
    (activeUsers || []).forEach(u => {
      if (!u) return;
      if (u.department) depts.add(u.department);
      if (u.dept) depts.add(u.dept);
      if (u.primary_department) depts.add(u.primary_department);
      if (Array.isArray(u.depts)) u.depts.forEach(d => d && depts.add(d));
      if (Array.isArray(u.affiliated_departments)) u.affiliated_departments.forEach(d => d && depts.add(d));
    });
    return Array.from(depts).filter(Boolean).sort();
  }, [activeUsers]);

  const filteredUsers = useMemo(() => {
    const query = (searchTerm || '').trim().toLowerCase();

    return (activeUsers || []).filter(user => {
      if (!user) return false;
      if (activeDeptFilter !== 'ALL') {
        const userDepts = user.affiliated_departments || user.depts || (user.primary_department ? [user.primary_department] : (user.department ? [user.department] : [user.dept]));
        const matchDept = (userDepts || []).some(d => d === activeDeptFilter);
        if (!matchDept) return false;
      }

      if (!query) return true;

      const nameMatch = (user.name || '').toLowerCase().includes(query);
      const idMatch = (user.id || '').toLowerCase().includes(query);
      const empIdMatch = (user.empId || '').toLowerCase().includes(query);
      const posMatch = (user.position || '').toLowerCase().includes(query);
      const deptMatch = (user.primary_department || user.department || user.dept || '').toLowerCase().includes(query);

      return nameMatch || idMatch || empIdMatch || posMatch || deptMatch;
    });
  }, [activeUsers, activeDeptFilter, searchTerm]);

  const handleToggle = (userId) => {
    if (onToggleUser) {
      onToggleUser(userId);
      return;
    }
    const next = safeSelectedIds.includes(userId)
      ? safeSelectedIds.filter(id => id !== userId)
      : [...safeSelectedIds, userId];
    if (onChange) onChange(next);
  };

  const handleRemove = (userId, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (onRemoveUser) {
      onRemoveUser(userId);
    }
    const next = safeSelectedIds.filter(id => id !== userId);
    if (onChange) onChange(next);
  };

  const handleClearAll = () => {
    if (onChange) onChange([]);
  };

  return (
    <div className="space-y-3 select-none">
      {/* 1. Optional Min Level row if provided */}
      {minLevel !== null && minLevel !== undefined && (
        <div className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
          <label htmlFor="min-access-level-select" className="text-xs font-semibold text-slate-800 shrink-0">
            ระดับตำแหน่งขั้นต่ำที่อนุญาต (Minimum Position Level):
          </label>
          <select
            id="min-access-level-select"
            aria-label="ระดับสิทธิ์ขั้นต่ำ"
            value={minLevel}
            onChange={(e) => onMinLevelChange && onMinLevelChange(Number(e.target.value))}
            className="h-8 px-2 bg-white text-xs text-slate-800 border border-slate-200 rounded-md focus:outline-none cursor-pointer flex-1 max-w-xs"
          >
            <option value={4}>Level 4: หัวหน้างานขึ้นไป (Supervisor L4+)</option>
            <option value={1}>Level 1: ทุกคนในองค์กร (All Staff)</option>
            <option value={3}>Level 3: เจ้าหน้าที่อาวุโสขึ้นไป (Senior Staff L3+)</option>
            <option value={5}>Level 5: ผู้ช่วยผู้จัดการขึ้นไป (Asst. Manager L5+)</option>
            <option value={6}>Level 6: ผู้จัดการฝ่ายขึ้นไป (Dept. Manager L6+)</option>
            <option value={7}>Level 7: ผู้บริหารระดับสูง (Directors & Executives)</option>
          </select>
        </div>
      )}

      {/* 2. Auto-Authorized Workflow Strip */}
      {normalizedParticipants.length > 0 && (
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-slate-700">
            <Lock size={12} className="text-slate-500 shrink-0" />
            <span className="font-semibold text-xs text-slate-900">สิทธิ์เข้าถึงอัตโนมัติตามสายอนุมัติ (Auto-Authorized):</span>
            <span className="text-[11px] text-slate-500 hidden md:inline">
              บุคคลในสายการจัดทำ ทบทวน และอนุมัติจะได้รับสิทธิ์เข้าถึงเอกสารนี้โดยอัตโนมัติ
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {normalizedParticipants.map(p => (
              <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[11px] text-slate-700 font-medium shadow-2xs">
                <span>{p.name}</span>
                <span className="text-slate-500 font-mono text-[10px]">({p.roleTitle})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 3. Selected Whitelist Tags (Compact Avatar Tags) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-600">
            เลือกแล้ว {selectedUsers.length} ท่าน
          </span>
          {selectedUsers.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-slate-400 hover:text-rose-600 text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1"
            >
              <RotateCcw size={10} />
              <span>ล้างทั้งหมด</span>
            </button>
          )}
        </div>

        {selectedUsers.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
            {selectedUsers.map(user => {
              const theme = getDepartmentTheme(user.primary_department || user.department || user.dept);
              return (
                <span
                  key={user.id}
                  className="inline-flex items-center gap-1.5 pl-1 pr-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-xs text-slate-800 shadow-2xs"
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${theme.avatar}`}>
                    {getInitials(user.name)}
                  </span>
                  <span className="font-medium text-[12px]">{user.name}</span>
                  <span className="text-[10px] font-mono text-slate-500">
                    ({user.primary_department || user.department || user.dept})
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleRemove(user.id, e)}
                    className="text-slate-400 hover:text-rose-600 cursor-pointer p-0.5 transition-colors"
                    title={`นำ ${user.name} ออก`}
                  >
                    <X size={11} strokeWidth={2.5} />
                  </button>
                </span>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-slate-400 py-1 font-normal">
            ยังไม่มีการเลือกรายชื่อเฉพาะบุคคล (ค้นหาและเลือกพนักงานด้านล่าง)
          </div>
        )}
      </div>

      {/* 4. Search & Department Filter + Candidate Combobox */}
      <div className="space-y-2 pt-1">
        {/* Search Input Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
          <input
            type="text"
            placeholder="ค้นหาด้วยชื่อ, รหัสพนักงาน (EMP-001), แผนก หรือตำแหน่ง..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 h-8 text-xs bg-white border border-slate-200 rounded-lg focus:border-slate-400 focus:outline-none placeholder:text-slate-400 text-slate-800 shadow-2xs"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Department Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          <button
            type="button"
            aria-pressed={activeDeptFilter === 'ALL'}
            onClick={() => setActiveDeptFilter('ALL')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap cursor-pointer transition-all ${
              activeDeptFilter === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            ทั้งหมด ({activeUsers.length})
          </button>
          {departmentsList.map(dept => {
            const isSelected = activeDeptFilter === dept;
            return (
              <button
                key={dept}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setActiveDeptFilter(dept)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {dept}
              </button>
            );
          })}
        </div>

        {/* Candidate Scrollable Rows */}
        <div className="border border-slate-200 rounded-lg overflow-hidden max-h-44 overflow-y-auto divide-y divide-slate-100 bg-white shadow-2xs">
          {filteredUsers.length > 0 ? (
            filteredUsers.map(user => {
              const isWorkflowParticipant = participantIdsSet.has(user.id) || (user.empId && participantIdsSet.has(user.empId));
              const isSelected = isWorkflowParticipant || safeSelectedIds.includes(user.id) || (user.empId && safeSelectedIds.includes(user.empId));
              const theme = getDepartmentTheme(user.primary_department || user.department || user.dept);

              return (
                <div
                  key={user.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-disabled={isWorkflowParticipant || undefined}
                  onClick={isWorkflowParticipant ? undefined : () => handleToggle(user.id)}
                  onKeyDown={isWorkflowParticipant ? undefined : (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleToggle(user.id);
                    }
                  }}
                  className={`px-2.5 py-1.5 flex items-center justify-between text-xs transition-colors cursor-pointer select-none ${
                    isWorkflowParticipant
                      ? 'bg-slate-50/70 text-slate-400 cursor-not-allowed'
                      : isSelected
                        ? 'bg-slate-50 text-slate-900 font-medium'
                        : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${theme.avatar}`}>
                      {getInitials(user.name)}
                    </span>
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ({user.primary_department || user.department || user.dept})
                    </span>
                    {isWorkflowParticipant && (
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 rounded font-medium">
                        ผู้ร่วมสายงาน (Auto)
                      </span>
                    )}
                  </div>
                  <div className="shrink-0">
                    {isWorkflowParticipant ? (
                      <Lock size={11} className="text-slate-400" />
                    ) : isSelected ? (
                      <Check size={12} className="text-slate-900 stroke-[3]" />
                    ) : (
                      <Plus size={12} className="text-slate-400" />
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-4 text-center text-xs text-slate-400">
              ไม่พบรายชื่อผู้ใช้ที่ตรงกับเงื่อนไข
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthorizedUsersSelector;
