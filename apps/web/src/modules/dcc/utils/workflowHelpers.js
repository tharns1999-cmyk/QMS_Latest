/**
 * Workflow and In-Flight DAR helper utilities
 * Enforces single active DAR lock per document code across the entire QMS workflow.
 */

export const IN_FLIGHT_DAR_STATUSES = [
  'DRAFT',
  'PENDING',
  'PENDING_REVIEW',
  'UNDER_REVIEW',
  'PENDING_APPROVE',
  'PENDING_APPROVAL',
  'UNDER_APPROVAL',
  'APPROVED',
  'PENDING_DCC',
  'PENDING_DISTRIBUTION',
  'PENDING_RECALL',
  'DISTRIBUTING',
  'RECALLING',
  'SUBMITTED',
  'IN_PROGRESS'
];

export const TERMINAL_DAR_STATUSES = [
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'OBSOLETE'
];

/**
 * Returns the currently active in-flight DAR for the given document code, or null if none.
 * Documents can only have at most 1 active in-flight DAR at any time.
 * 
 * @param {Array} dars - List of DAR records
 * @param {string} docCode - Target Document Code (e.g. 'SOP-QC-01')
 * @returns {Object|null} The active DAR or null
 */
export const getActiveDarForDocument = (dars, docCode) => {
  if (!docCode || !Array.isArray(dars)) return null;
  const targetCode = String(docCode).trim().toUpperCase();

  return dars.find(d => {
    if (!d) return false;
    const status = String(d.status || '').trim().toUpperCase();

    // Terminal statuses never lock
    if (TERMINAL_DAR_STATUSES.includes(status)) {
      return false;
    }

    const isInFlight = IN_FLIGHT_DAR_STATUSES.includes(status) || 
      (!TERMINAL_DAR_STATUSES.includes(status) && (Boolean(status) || Boolean(d.isDraft)));
    if (!isInFlight) return false;

    // Direct match as per prompt specification
    if (d.document_code === docCode || d.doc_code === docCode) {
      return true;
    }

    // Comprehensive document code match
    const codes = [
      d.document_code,
      d.doc_code,
      d.docCode,
      d.docNo,
      d.docIdInput,
      d.title
    ].filter(Boolean).map(c => String(c).trim().toUpperCase());

    if (codes.includes(targetCode)) return true;

    // Stripped title format (e.g. "[OBSOLETE] SOP-QC-01")
    if (d.title && typeof d.title === 'string') {
      const stripped = d.title.replace(/^\[(OBSOLETE|REVISION|NEW)\]\s*/i, '').trim().toUpperCase();
      if (stripped === targetCode) return true;
    }

    return false;
  }) || null;
};
