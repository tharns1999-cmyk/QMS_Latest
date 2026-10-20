import React from 'react';
import { Building2 } from 'lucide-react';
import { getDeptBadgeStyle, getDepartmentBadgeClass } from '../../utils/departmentColors';

/**
 * Reusable Modern Pastel Pill Department Badge
 * High contrast, readable, crisp typography with Lucide Building2 icon.
 *
 * @param {Object} props
 * @param {string} props.department - Department identifier / code (e.g. 'QC', 'PD', 'EN', 'DC')
 * @param {string} [props.deptName] - Optional full or formatted department name
 * @param {string} [props.className] - Additional CSS class overrides
 * @param {boolean} [props.showIcon] - Whether to display the Building2 icon (default: true)
 */
export const DepartmentBadge = ({
  department = '',
  deptName,
  className = '',
  showIcon = true
}) => {
  const style = getDeptBadgeStyle(department);
  const text = deptName || department || '-';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${style.badge} ${className}`}
    >
      {showIcon && <Building2 className={`w-3.5 h-3.5 shrink-0 ${style.icon}`} />}
      <span>{text}</span>
    </span>
  );
};

export { getDeptBadgeStyle, getDepartmentBadgeClass };
export default DepartmentBadge;
