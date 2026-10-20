/**
 * Controlled Copy Custodianship RBAC Helper
 * 
 * Custodianship Invariant:
 * 1. DCC Admin (role === 'DCC_ADMIN', 'SUPER_ADMIN', or isDcc) or DC department members can manage all copies.
 * 2. Regular users can ONLY manage copies assigned to their own department (copy.department, copy.recipient_department, or copy.holder_dept).
 * 3. Document owner / doc.department / doc creator must NEVER be used to bypass copy custodianship.
 */

export const canManageControlledCopy = (arg1, arg2, arg3) => {
  let user = null;
  let copy = null;

  const args = [arg1, arg2, arg3].filter(Boolean);
  if (args.length === 0) return false;

  // Auto-detect user vs copy regardless of parameter order:
  // User has role / isDcc / isSuperAdmin / empId / username or department without copy fields
  user = args.find(a => 
    a.role !== undefined || 
    a.isDcc !== undefined || 
    a.isSuperAdmin !== undefined || 
    a.empId !== undefined || 
    a.username !== undefined ||
    (a.department && a.copy_no === undefined && a.copyNumber === undefined && a.copyNo === undefined && a.doc_id === undefined && a.doc_code === undefined && a.location === undefined)
  );

  // Copy has copy_no / copyNumber / copyNo / holder_dept / recipient_department / recipientDept / location / is_owner
  copy = args.find(a => 
    a !== user && (
      a.copy_no !== undefined || 
      a.copyNumber !== undefined || 
      a.copyNo !== undefined || 
      a.holder_dept !== undefined || 
      a.recipient_department !== undefined || 
      a.recipientDept !== undefined || 
      a.recipient_dept !== undefined ||
      a.location !== undefined ||
      a.station_name !== undefined ||
      a.is_owner !== undefined
    )
  );

  // Fallbacks if shape detection was ambiguous
  if (!user || !copy) {
    if (args.length >= 2) {
      if (!user) user = arg1;
      if (!copy) copy = arg2;
    } else {
      return false;
    }
  }

  if (!user || !copy) return false;

  // 1. DCC Admin หรือ เจ้าหน้าที่แผนก DC มีสิทธิ์จัดการได้ทุกเล่ม
  const isDcc = Boolean(
    user.role === 'DCC_ADMIN' ||
    user.role === 'SUPER_ADMIN' ||
    user.isDcc ||
    user.isSuperAdmin ||
    (user.department && (user.department.toUpperCase() === 'DC' || user.department.toUpperCase() === 'DCC')) ||
    (user.dept && (user.dept.toUpperCase() === 'DC' || user.dept.toUpperCase() === 'DCC')) ||
    (user.primary_department && (user.primary_department.toUpperCase() === 'DC' || user.primary_department.toUpperCase() === 'DCC')) ||
    (user.permissions && (user.permissions.includes('DCC_ADMIN') || user.permissions.includes('ADMIN')))
  );

  if (isDcc) return true;

  // 2. สำหรับผู้ใช้งานทั่วไป: ต้องสังกัดแผนกเดียวกับแผนกที่ถือครองสำเนาจริง (copy.department หรือ copy.recipient_dept)
  const copyHolderDept = (
    copy.department || 
    copy.recipient_department || 
    copy.recipient_dept || 
    copy.recipientDept || 
    copy.holder_dept || 
    copy.departmentId || 
    copy.dept_code || 
    copy.target_department || 
    ''
  ).toString().trim().toUpperCase();

  if (!copyHolderDept) return false;

  const rawUserDepts = [
    user.primary_department,
    user.department,
    user.dept,
    user.dept_code,
    ...(Array.isArray(user.departments) ? user.departments : []),
    ...(Array.isArray(user.secondaryDepartments) ? user.secondaryDepartments : []),
    ...(Array.isArray(user.affiliated_departments) ? user.affiliated_departments : []),
    ...(Array.isArray(user.depts) ? user.depts : [])
  ];

  const userDepts = Array.from(
    new Set(
      rawUserDepts
        .map(d => (typeof d === 'object' ? (d?.id || d?.code || d?.dept || d?.department) : d)?.toString().trim().toUpperCase())
        .filter(Boolean)
    )
  );

  const isSameDept = (dept) => {
    if (!dept) return false;
    const cleanDept = String(dept).trim().toUpperCase();
    return userDepts.some(
      (u) =>
        u === cleanDept ||
        ((u === 'QA' || u === 'QA/QC' || u === 'QAQC' || u === 'QC') && 
         (cleanDept === 'QA' || cleanDept === 'QA/QC' || cleanDept === 'QAQC' || cleanDept === 'QC'))
    );
  };

  return isSameDept(copyHolderDept);
};
