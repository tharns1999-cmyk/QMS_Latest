import { getDocCode, getDocTitle, getCleanRev, getCleanDept } from '../utils/domainNormalizer';

/**
 * Standardize department code to Master Department Code
 * Quality Assurance & Control standardizes strictly to 'QC'
 */
export const standardizeDepartmentCode = (dept) => {
  if (!dept) return 'QC';
  const raw = String(dept).trim();
  const clean = getCleanDept(raw, raw);
  if (clean === 'QC' || clean === 'DC') {
    return clean;
  }
  const stripped = raw.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (stripped === 'QA' || stripped === 'QC' || stripped === 'QAQC' || stripped === 'QASUPER') {
    return 'QC';
  }
  return raw.toUpperCase();
};

const KNOWN_DEPT_CODES = ['PD', 'WH', 'EN', 'PC', 'HSE', 'MKT', 'ST', 'FIN', 'DC', 'HR&GA'];
const DOC_TYPE_PREFIXES = ['QM', 'QP', 'SOP', 'WI', 'SD', 'FM', 'ED', 'EXT', 'DAR', 'DOC', 'JD'];

/**
 * Extract clean department code from string or object (e.g. 'SOP-QC-01' -> 'QC', 'QC-SOP-01' -> 'QC', 'Staff (QC)' -> 'QC', 'QC - ฝ่ายประกัน...' -> 'QC')
 */
export const extractDeptCode = (val) => {
  if (!val) return '';
  if (typeof val !== 'string') {
    val = val.code || val.id || val.department || val.dept || val.dept_code || '';
  }
  const trimmed = String(val).trim();
  if (!trimmed) return '';

  // Extract from doc code like SOP-QC-01, WI-PD-02, or QC-SOP-01 / QC-01-01
  if (trimmed.includes('-')) {
    const parts = trimmed.split('-').map(s => s.trim());
    const p0 = (parts[0] || '').toUpperCase();
    const p1 = (parts[1] || '').toUpperCase();

    // a) {Dept}-{Type}-{##} / QC-XX-XX format
    if ((p0 === 'QC' || p0 === 'QA' || p0 === 'QAQC' || p0 === 'QA/QC' || p0 === 'QA SUPER' || p0 === 'QASUPER') && !DOC_TYPE_PREFIXES.includes(p0)) {
      return 'QC';
    }
    if (KNOWN_DEPT_CODES.includes(p0) && (DOC_TYPE_PREFIXES.includes(p1) || /^\d+$/.test(p1))) {
      return p0;
    }

    // b) {Type}-{Dept}-{##} format (e.g., SOP-QC-01, WI-QC-01, ED-QA-01)
    if (p1 === 'QA' || p1 === 'QC' || p1 === 'QAQC' || p1 === 'QA/QC') {
      return 'QC';
    }
    if (parts.length >= 2 && p1.length <= 5 && /^[A-Z/]+$/.test(p1)) {
      return p1;
    }
  }

  // Extract from parentheses like "Officer (QC)" or "(QA/QC)"
  const parenMatch = trimmed.match(/\(([A-Za-z/]+)\)/);
  if (parenMatch) {
    const inside = parenMatch[1].toUpperCase();
    if (inside === 'QA' || inside === 'QC' || inside === 'QAQC' || inside === 'QA/QC') return 'QC';
    return inside.replace(/[^A-Z]/g, '');
  }

  // Extract from formatted "QC - ฝ่ายประกัน..." or "QA/QC - ฝ่ายประกัน..." or "QA SUPER"
  if (/^QA[\s/_-]?(QC|SUPER)/i.test(trimmed)) return 'QC';
  const firstWord = trimmed.split(/[\s-]+/)[0].replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (firstWord === 'QA' || firstWord === 'QC' || firstWord === 'QAQC' || firstWord === 'QASUPER') return 'QC';

  return firstWord || trimmed.toUpperCase();
};

/**
 * Check if two department codes are equivalent with bidirectional QC / QA / QA/QC alias rule.
 */
export const isDeptEquivalent = (d1, d2) => {
  if (!d1 || !d2) return false;
  const c1 = d1.toUpperCase();
  const c2 = d2.toUpperCase();
  if (c1 === c2) return true;
  const isQaQc1 = c1 === 'QC' || c1 === 'QA' || c1 === 'QA/QC' || c1 === 'QAQC' || c1 === 'QA SUPER' || c1 === 'QASUPER';
  const isQaQc2 = c2 === 'QC' || c2 === 'QA' || c2 === 'QA/QC' || c2 === 'QAQC' || c2 === 'QA SUPER' || c2 === 'QASUPER';
  return Boolean(isQaQc1 && isQaQc2);
};

/**
 * Check if a document belongs to the user's department.
 * Supports Multi-Department Membership (department, primaryDepartment, departmentMemberships, departments, etc.)
 * and bidirectional equivalence between QC, QA, and QA/QC.
 */
export const isMyDepartment = (docDept, user) => {
  if (!docDept || !user) return false;

  const targetCode = extractDeptCode(docDept);
  if (!targetCode) return false;

  // If user is passed as a string
  if (typeof user === 'string') {
    const uCode = extractDeptCode(user);
    return isDeptEquivalent(targetCode, uCode);
  }

  // If user is passed as an array
  if (Array.isArray(user)) {
    return user.some(u => isDeptEquivalent(targetCode, extractDeptCode(u)));
  }

  // Extract all department affiliations from User Profile
  const rawDeptList = [
    user.department,
    user.dept,
    user.primaryDepartment,
    user.primary_department,
    ...(Array.isArray(user.departmentMemberships) ? user.departmentMemberships : [user.departmentMemberships]),
    ...(Array.isArray(user.departments) ? user.departments : [user.departments]),
    ...(Array.isArray(user.affiliated_departments) ? user.affiliated_departments : [user.affiliated_departments]),
    ...(Array.isArray(user.secondaryDepartments) ? user.secondaryDepartments : [user.secondaryDepartments]),
    ...(Array.isArray(user.depts) ? user.depts : [user.depts])
  ].filter(Boolean);

  const userDeptCodes = rawDeptList
    .map(d => typeof d === 'string' ? extractDeptCode(d) : extractDeptCode(d?.code || d?.id || d?.department))
    .filter(Boolean);

  if (userDeptCodes.length === 0) return false;

  return userDeptCodes.some(uCode => isDeptEquivalent(targetCode, uCode));
};

/**
 * Transform approved DAR object into a standardized Master Document record.
 */
export const transformDarToMasterDocument = (dar) => {
  if (!dar) return null;
  const now = new Date().toISOString();
  const todayStr = now.split('T')[0];

  const targetDocCode = 
    getDocCode(dar) || 
    dar.docNo || 
    dar.docIdInput || 
    'SOP-QC-01';

  const docTitle = getDocTitle(dar) || dar.documentName || dar.docTitle || targetDocCode;
  const docType = dar.documentType || dar.docType || dar.type || (targetDocCode ? targetDocCode.split('-')[0] : 'SOP');
  
  // Standardize department strictly to 'QC' if it belongs to Quality dept
  const deptCode = standardizeDepartmentCode(getCleanDept(dar, 'QC'));
  const deptName = deptCode === 'QC' ? 'ฝ่ายประกันและควบคุมคุณภาพ' : (dar.departmentName || deptCode);

  const docRevision = getCleanRev(dar.revision ?? dar.rev ?? dar.edition, '00');
  const docEdition = getCleanRev(dar.edition ?? dar.revision ?? dar.rev, '00');

  const effectiveDate = dar.effectiveDate || dar.effective_date || todayStr;
  const isFormDoc = docType === 'FM' || String(targetDocCode).startsWith('FM');

  return {
    id: dar.docId || dar.targetDocumentId || `doc-${Date.now()}`,
    darId: dar.id,
    darNo: dar.darNo || dar.darNumber || dar.id,
    darNumber: dar.darNumber || dar.darNo || dar.id,
    docNo: targetDocCode,
    code: targetDocCode,
    docCode: targetDocCode,
    document_code: targetDocCode,
    doc_code: targetDocCode,
    title: docTitle,
    name: docTitle,
    docName: docTitle,
    docTitle: docTitle,
    type: docType,
    docType: docType,
    department: deptCode,
    departmentName: deptName,
    owner_dept: deptCode,
    edition: docEdition,
    revision: docRevision,
    rev: docRevision,
    effectiveDate: effectiveDate,
    effective_date: effectiveDate,
    status: 'ACTIVE',
    is_active: true,
    is_superseded: false,
    is_obsolete: false,
    accessLevel: dar.securityLevel || dar.accessLevel || 'General',
    accessScope: dar.accessScope || dar.access_control?.scope || 'GENERAL',
    access_control: dar.access_control || { scope: dar.accessScope || 'GENERAL' },
    distributionCopies: dar.distributionCopies || dar.distributions || [],
    distributions: isFormDoc ? [] : (dar.distributions || dar.distributionCopies || []),
    fileId: dar.fileId || dar.file_id || dar.attachedFile?.fileId || dar.attachedFile?.id || null,
    attachedFile: dar.attachedFile || null,
    file: dar.file || dar.attachedFile || null,
    fileUrl: dar.fileUrl || dar.file || dar.pdfUrl || null,
    fileName: dar.fileName || dar.file?.name || dar.attachedFile?.name || null,
    pdfUrl: dar.pdfUrl || dar.fileUrl || '/mock.pdf',
    createdAt: dar.createdAt || now,
    approvedAt: now,
    published_at: now
  };
};

export default {
  standardizeDepartmentCode,
  extractDeptCode,
  isDeptEquivalent,
  isMyDepartment,
  transformDarToMasterDocument
};
