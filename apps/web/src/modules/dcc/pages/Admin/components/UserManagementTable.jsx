import React, { useState, useEffect } from 'react';
import {
  Edit,
  MoreHorizontal,
  RotateCcw,
  UserCheck,
  PenTool,
  ShieldCheck,
  Unlock,
  ShieldAlert,
  Ban
} from 'lucide-react';

/**
 * Returns initials from a user's display name
 */
export const getUserInitials = (name) => {
  if (!name) return 'U';
  const trimmed = name.trim();
  if (!trimmed) return 'U';
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  return trimmed.substring(0, 2).toUpperCase();
};

/**
 * Returns pastel avatar background and text color based on user role
 */
export const getAvatarRoleBadge = (user) => {
  if (user?.role === 'DCC_ADMIN' || user?.isDcc) {
    return {
      bg: 'bg-purple-100 text-purple-700 border-purple-200',
      roleLabel: 'DCC Admin',
      roleBadge: 'bg-purple-50 text-purple-700 border-purple-200'
    };
  }
  if (user?.role === 'DEPT_ADMIN') {
    return {
      bg: 'bg-sky-100 text-sky-700 border-sky-200',
      roleLabel: 'ผู้ดูแลแผนก',
      roleBadge: 'bg-sky-50 text-sky-700 border-sky-200'
    };
  }
  return {
    bg: 'bg-slate-100 text-slate-700 border-slate-200',
    roleLabel: 'ผู้ใช้งานทั่วไป',
    roleBadge: 'bg-slate-100 text-slate-600 border-slate-200'
  };
};

const UserManagementTable = ({
  users = [],
  departmentsList = [],
  currentUser = null,
  isApiMode = false,
  pagination = null,
  children = null,
  onOpenUserModal = () => {},
  onOpenSignatureModal = () => {},
  onOpenStampSimulator = () => {},
  onResetPassword = () => {},
  onUnlockAccount = () => {},
  onToggleStatus = () => {},
  onSwitchPersona = () => {},
  onResetTwoFactor = () => {}
}) => {
  const [openDropdownId, setOpenDropdownId] = useState(null);

  // Close dropdown on click outside or ESC
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (openDropdownId && !e.target.closest('[data-dropdown-container]')) {
        setOpenDropdownId(null);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpenDropdownId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openDropdownId]);

  return (
    <div className="w-full max-w-full overflow-visible bg-white border border-slate-200/80 rounded-xl shadow-2xs flex flex-col min-h-0" data-testid="user-management-table-container">
      <div className="overflow-x-auto w-full max-w-full scrollbar-thin">
        <table className="w-full text-left text-xs table-auto min-w-[960px] border-collapse">
          <thead className="bg-slate-50 text-slate-600 font-semibold text-[11px] uppercase tracking-wider border-b border-slate-200 whitespace-nowrap sticky top-0 z-10">
            <tr>
              <th className="py-3 px-4 min-w-[260px] bg-slate-50">ชื่อ-นามสกุล / อีเมล</th>
              <th className="py-3 px-4 w-44 whitespace-nowrap bg-slate-50">แผนก</th>
              <th className="py-3 px-4 min-w-[140px] whitespace-nowrap bg-slate-50">ตำแหน่งงาน</th>
              <th className="py-3 px-4 text-center w-32 whitespace-nowrap bg-slate-50">บทบาท (Role)</th>
              <th className="py-3 px-4 text-center w-24 whitespace-nowrap bg-slate-50">ระดับอนุมัติ</th>
              <th className="py-3 px-4 text-center w-24 whitespace-nowrap bg-slate-50">สถานะ</th>
              <th className="py-3 px-4 text-right w-36 whitespace-nowrap bg-slate-50">การจัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => {
              const { bg: avatarClass, roleLabel, roleBadge } = getAvatarRoleBadge(user);
              const initials = getUserInitials(user.name);

              // Resolve primary department and affiliated list
              const primaryDept = user.primary_department || user.department || (user.affiliated_departments && user.affiliated_departments[0]) || (user.depts && user.depts[0]) || 'QA';
              const rawAllDepts = (user.affiliated_departments && user.affiliated_departments.length > 0)
                ? user.affiliated_departments
                : ((user.depts && user.depts.length > 0) ? user.depts : [primaryDept]);
              const allDepts = Array.from(new Set([primaryDept, ...rawAllDepts]));
              const extraDepts = allDepts.filter((d) => d !== primaryDept);
              const extraCount = extraDepts.length;

              const primaryDeptObj = departmentsList.find((d) => d.id === primaryDept);
              const primaryDeptName = primaryDeptObj ? (primaryDeptObj.nameTh || primaryDeptObj.name) : '';

              const isDropdownOpen = openDropdownId === user.id;

              return (
                <tr key={user.id} className="hover:bg-slate-50/70 transition-colors">
                  {/* 1. User Identity (Avatar + Name + EmpID & Email) */}
                  <td className="py-3 px-4 align-middle min-w-[260px]">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-xs shrink-0 select-none border ${avatarClass} shadow-2xs`}>
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5 text-xs">
                          <span className="truncate">{user.name}</span>
                          {user.isLocked && (
                            <span className="px-1.5 py-0.2 bg-rose-100 text-rose-700 text-[10px] rounded font-mono font-bold">LOCKED</span>
                          )}
                        </div>
                        <div className="text-slate-400 text-[11px] font-mono leading-none mt-1 flex items-center gap-1.5">
                          <span className="bg-slate-100 px-1 py-0.2 rounded border border-slate-200 text-[10px] text-slate-600 font-semibold">{user.empId || user.id}</span>
                          <span className="text-slate-300">•</span>
                          <span className="truncate text-slate-500">{user.email || '-'}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* 2. Smart Department Badge & Overflow Tooltip */}
                  <td className="py-3 px-4 align-middle font-semibold text-slate-800 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 flex-nowrap">
                      {/* Primary Department Badge with ⭐ indicator for backwards compatibility */}
                      <span 
                        className="px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200 inline-flex items-center gap-1 shrink-0"
                        title="แผนกหลัก (Primary Department)"
                      >
                        <span className="text-amber-500">⭐</span>
                        <span>{primaryDept}</span>
                        {primaryDeptName && (
                          <span className="text-[10px] font-normal text-sky-600 truncate max-w-[80px]">
                            {primaryDeptName}
                          </span>
                        )}
                      </span>

                      {/* Extra Departments Overflow Chip with Hover Tooltip */}
                      {extraCount > 0 && (
                        <div className="relative group inline-block">
                          <span 
                            className="px-1.5 py-0.5 rounded-md font-mono text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-colors cursor-help inline-flex items-center"
                            title={`สังกัดร่วมอีก ${extraCount} แผนก`}
                          >
                            +{extraCount} แผนก
                          </span>

                          {/* Hover Tooltip Popover (stays within row DOM for test assertions) */}
                          <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover:flex flex-col gap-1 p-2 bg-slate-900 text-white text-[11px] rounded-lg shadow-xl z-30 whitespace-nowrap min-w-[140px] pointer-events-none animate-in fade-in zoom-in-95 duration-100">
                            <span className="font-semibold text-slate-300 border-b border-slate-700 pb-1 text-[10px] uppercase tracking-wider">
                              สังกัดทั้งหมด ({allDepts.length}):
                            </span>
                            {allDepts.map((d) => {
                              const dInfo = departmentsList.find((item) => item.id === d);
                              const dTitle = dInfo ? (dInfo.nameTh || dInfo.name) : '';
                              const isPri = d === primaryDept;
                              return (
                                <div key={d} className="flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-sky-400">{d}</span>
                                  {isPri && <span className="text-[10px] text-amber-300 font-medium">(หลัก)</span>}
                                  {dTitle && <span className="text-slate-300 text-[10px] truncate max-w-[150px]">{dTitle}</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* 3. Position */}
                  <td className="py-3 px-4 align-middle text-slate-600 whitespace-nowrap text-xs">
                    {user.position || '-'}
                  </td>

                  {/* 4. Role (Human Friendly Label + Code) */}
                  <td className="py-3 px-4 align-middle text-center whitespace-nowrap">
                    <span 
                      className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${roleBadge}`}
                      title={user.role || (user.isDcc ? 'DCC_ADMIN' : 'GENERAL_USER')}
                    >
                      {roleLabel}
                    </span>
                  </td>

                  {/* 5. Approval Level */}
                  <td className="py-3 px-4 align-middle text-center whitespace-nowrap">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-mono font-medium rounded text-xs border border-slate-200">
                      L{user.level || user.approval_level || 1}
                    </span>
                  </td>

                  {/* 6. Status Toggle Button */}
                  <td className="py-3 px-4 align-middle text-center whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onToggleStatus(user)}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-medium cursor-pointer transition-colors ${
                        user.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {user.status === 'ACTIVE' ? '🟢 Active' : '⚪ Inactive'}
                    </button>
                  </td>

                  {/* 7. Action Group & Overflow Menu */}
                  <td className="py-3 px-4 align-middle text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5" data-dropdown-container>
                      {/* Direct Unlock button shown when locked for rapid admin intervention */}
                      {user.isLocked && (
                        <button
                          type="button"
                          onClick={() => onUnlockAccount(user)}
                          className="h-8 px-2 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center gap-1 text-xs font-medium transition-colors shadow-2xs cursor-pointer"
                          title="ปลดล็อกบัญชี"
                          aria-label={`ปลดล็อกบัญชี ${user.name}`}
                        >
                          <Unlock size={13} className="text-emerald-600" />
                          <span>ปลดล็อก</span>
                        </button>
                      )}

                      {/* Primary Outside Action: Edit Button */}
                      <button
                        type="button"
                        onClick={() => onOpenUserModal(user)}
                        className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-sky-700 hover:border-sky-300 transition-all flex items-center justify-center shadow-2xs cursor-pointer"
                        title="แก้ไขข้อมูลผู้ใช้"
                        aria-label={`แก้ไขข้อมูล ${user.name}`}
                      >
                        <Edit size={14} />
                      </button>

                      {/* Secondary Action: Overflow Dropdown Menu Button [•••] */}
                      <div className="relative inline-block text-left">
                        <button
                          type="button"
                          onClick={() => setOpenDropdownId(isDropdownOpen ? null : user.id)}
                          className={`w-8 h-8 rounded-lg border transition-all flex items-center justify-center shadow-2xs cursor-pointer ${
                            isDropdownOpen
                              ? 'bg-slate-100 border-slate-300 text-slate-900'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900'
                          }`}
                          title="ตัวเลือกเพิ่มเติม"
                          aria-label={`ตัวเลือกเพิ่มเติม ${user.name}`}
                          aria-expanded={isDropdownOpen}
                        >
                          <MoreHorizontal size={15} />
                        </button>

                        {/* Dropdown Menu Popup (DOM kept active for test accessibility, styled via visibility) */}
                        <div 
                          className={`absolute right-0 top-full mt-1.5 w-56 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 z-50 text-xs text-left ${
                            isDropdownOpen ? 'block animate-in fade-in zoom-in-95 duration-100' : 'hidden'
                          }`}
                        >
                          {/* Reset Password */}
                          <button
                            type="button"
                            onClick={() => {
                              onResetPassword(user);
                              setOpenDropdownId(null);
                            }}
                            className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 text-slate-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                            title="รีเซ็ตรหัสผ่านเริ่มต้น"
                          >
                            <RotateCcw size={14} className="text-amber-500 shrink-0" />
                            <span>รีเซ็ตรหัสผ่าน</span>
                          </button>

                          {/* Switch Persona */}
                          <button
                            type="button"
                            onClick={() => {
                              onSwitchPersona(user);
                              setOpenDropdownId(null);
                            }}
                            className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 text-slate-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                            title="จำลองมุมมองผู้ใช้"
                          >
                            <UserCheck size={14} className="text-sky-600 shrink-0" />
                            <span>จำลองมุมมองผู้ใช้</span>
                          </button>

                          {/* Digital Signature */}
                          <button
                            type="button"
                            onClick={() => {
                              onOpenSignatureModal(user);
                              setOpenDropdownId(null);
                            }}
                            className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 text-slate-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                            title="จัดการลายเซ็นอิเล็กทรอนิกส์ (Signature Asset)"
                          >
                            <PenTool size={14} className="text-indigo-500 shrink-0" />
                            <span>ลายเซ็นดิจิทัล</span>
                          </button>

                          {/* Stamp Simulator */}
                          <button
                            type="button"
                            onClick={() => {
                              onOpenStampSimulator(user);
                              setOpenDropdownId(null);
                            }}
                            className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-emerald-50 text-slate-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                            title="ทดสอบตราประทับจำลอง (21 CFR Part 11 Stamp Simulator)"
                          >
                            <ShieldCheck size={14} className="text-emerald-500 shrink-0" />
                            <span>ทดสอบตราประทับจำลอง</span>
                          </button>

                          {/* 2FA Reset (API Mode only) */}
                          {isApiMode && user.twoFactorEnabled && (
                            <button
                              type="button"
                              onClick={() => {
                                onResetTwoFactor(user);
                                setOpenDropdownId(null);
                              }}
                              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-amber-50 text-amber-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                              title="รีเซ็ตการยืนยันสองขั้นตอน (2FA)"
                            >
                              <ShieldAlert size={14} className="text-amber-600 shrink-0" />
                              <span>รีเซ็ต 2FA</span>
                            </button>
                          )}

                          <div className="my-1 border-t border-slate-100" />

                          {/* Deactivate User */}
                          <button
                            type="button"
                            onClick={() => {
                              onToggleStatus(user);
                              setOpenDropdownId(null);
                            }}
                            className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-rose-50 text-rose-600 flex items-center gap-2.5 transition-colors cursor-pointer font-medium"
                            title="เปลี่ยนสถานะการใช้งานบัญชี"
                          >
                            <Ban size={14} className="text-rose-500 shrink-0" />
                            <span>{user.status === 'ACTIVE' ? 'ระงับการใช้งานบัญชี' : 'เปิดใช้งานบัญชี'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}

            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  ไม่พบข้อมูลผู้ใช้งานที่ค้นหา
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pagination}
      {children}
    </div>
  );
};

export default UserManagementTable;
