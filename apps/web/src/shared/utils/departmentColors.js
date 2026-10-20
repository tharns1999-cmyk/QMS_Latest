/**
 * Department Color & Badge Styling Utility
 * Standardized High-Contrast Modern Pastel Pill Palette across all QMS views.
 */

/**
 * Get color styling configuration for a department code.
 * High contrast: soft level-50 background, light level-200 border, dark level-800 text, level-600 icon.
 *
 * @param {string} [deptCode=''] - Department identifier or abbreviation
 * @returns {{ badge: string, icon: string }}
 */
export const getDeptBadgeStyle = (deptCode = '') => {
  const code = String(deptCode || '').toUpperCase().trim();

  // QC / QA (Quality Assurance & Quality Control)
  if (code.includes('QC') || code.includes('QA')) {
    return {
      badge: 'bg-emerald-50 text-emerald-800 border-emerald-200/90',
      icon: 'text-emerald-600'
    };
  }

  // PD / Production
  if (code.includes('PD') || code.includes('PROD')) {
    return {
      badge: 'bg-amber-50 text-amber-800 border-amber-200/90',
      icon: 'text-amber-600'
    };
  }

  // EN / Engineering
  if (code.includes('EN') || code.includes('ENG')) {
    return {
      badge: 'bg-sky-50 text-sky-800 border-sky-200/90',
      icon: 'text-sky-600'
    };
  }

  // DC / DCC / QMS (Document Control Center / Quality Management)
  if (code.includes('DC') || code.includes('DCC') || code.includes('QMS')) {
    return {
      badge: 'bg-blue-50 text-blue-800 border-blue-200/90',
      icon: 'text-blue-600'
    };
  }

  // FIN / Finance
  if (code.includes('FIN') || code.includes('ACC')) {
    return {
      badge: 'bg-purple-50 text-purple-800 border-purple-200/90',
      icon: 'text-purple-600'
    };
  }

  // MGMT / Management
  if (code.includes('MGMT')) {
    return {
      badge: 'bg-rose-50 text-rose-800 border-rose-200/90',
      icon: 'text-rose-600'
    };
  }

  // EXEC / Executive
  if (code.includes('EXEC')) {
    return {
      badge: 'bg-indigo-50 text-indigo-800 border-indigo-200/90',
      icon: 'text-indigo-600'
    };
  }

  // Default / Other Departments
  return {
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: 'text-slate-500'
  };
};

/**
 * Convenience helper returning just the badge CSS class string.
 * @param {string} [deptCode='']
 * @returns {string}
 */
export const getDepartmentBadgeClass = (deptCode = '') => {
  return getDeptBadgeStyle(deptCode).badge;
};

export const getDepartmentBadgeClasses = getDepartmentBadgeClass;

export default getDeptBadgeStyle;
