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
