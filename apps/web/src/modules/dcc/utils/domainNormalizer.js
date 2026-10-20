/**
 * domainNormalizer.js
 * 
 * Central domain normalization utilities for QMS Portal.
 * Standardizes document codes, titles, revision strings, department identifiers,
 * active document criteria, and synchronized state mirror properties.
 */

/**
 * Extracts normalized document code from various candidate fields.
 * 
 * @param {Object|string} item 
 * @returns {string} Trimmed document code or empty string
 */
export const getDocCode = (item) => {
  if (!item) return '';
  if (typeof item === 'string') return item.trim();
  const code = item.edCode || item.document_code || item.doc_code || item.docCode || item.code || item.docNo || item.title || '';
  return String(code).trim();
};

/**
 * Extracts normalized document title from various candidate fields.
 * 
 * @param {Object|string} item 
 * @returns {string} Trimmed document title or empty string
 */
export const getDocTitle = (item) => {
  if (!item) return '';
  if (typeof item === 'string') return item.trim();
  const title = item.document_title || item.doc_title || item.docName || item.name || item.title || '';
  return String(title).trim();
};

/**
 * Extracts clean revision or edition string.
 * - Strips 'Rev.' or 'rev' prefix.
 * - Pads pure numeric revisions to 2 digits ('0' -> '00', '1' -> '01').
 * - Cleans whitespace for 'Edition' or 'Issue' strings.
 * 
 * @param {Object|string|number} item 
 * @param {string} [fallback='00'] 
 * @returns {string} Clean revision string or fallback
 */
export const getCleanRev = (item, fallback = '00') => {
  let raw = item;
  if (typeof item === 'object' && item !== null) {
    raw = item.rev ?? item.revision ?? item.doc_version ?? item.version ?? item.revNo ?? item.current_revision ?? item.currentRevision ?? '';
  }
  if (raw === null || raw === undefined || raw === '') {
    return fallback;
  }
  let str = String(raw).trim();
  if (!str) return fallback;

  if (/^rev\.?\s*/i.test(str)) {
    str = str.replace(/^rev\.?\s*/i, '').trim();
  }

  if (/^\d+$/.test(str)) {
    str = str.padStart(2, '0');
  } else if (/^(edition|issue)\b/i.test(str)) {
    str = str.replace(/\s+/g, ' ').trim();
  }

  return str || fallback;
};

/**
 * Extracts and normalizes department string.
 * - Normalizes 'DCC' -> 'DC'.
 * - Normalizes 'QA/QC', 'QA', 'QAQC', 'QA SUPER', 'QASUPER', 'ฝ่ายประกันและควบคุมคุณภาพ' -> 'QC'.
 * 
 * @param {Object|string} item 
 * @param {string} [fallback='QC'] 
 * @returns {string} Normalized department string
 */
export const getCleanDept = (item, fallback = 'QC') => {
  let raw = '';
  if (typeof item === 'string') {
    raw = item;
  } else if (item && typeof item === 'object') {
    raw = item.department || item.dept || item.owner_dept || item.primary_department || item.dept_code || '';
  }
  const trimmed = String(raw || fallback || '').trim();
  if (!trimmed) return fallback;

  const upper = trimmed.toUpperCase();
  if (upper === 'DCC') {
    return 'DC';
  }

  if (
    upper === 'QA/QC' ||
    upper === 'QA' ||
    upper === 'QAQC' ||
    upper === 'QA SUPER' ||
    upper === 'QASUPER' ||
    trimmed === 'ฝ่ายประกันและควบคุมคุณภาพ' ||
    trimmed.includes('ฝ่ายประกันและควบคุมคุณภาพ')
  ) {
    return 'QC';
  }

  return trimmed || fallback;
};

/**
 * Determines whether a document item has an active status and is not superseded or obsolete.
 * 
 * @param {Object} doc 
 * @returns {boolean}
 */
export const isActiveDoc = (doc) => {
  if (!doc || typeof doc !== 'object') return false;
  const status = String(doc.status || '').toUpperCase();
  const isSuperseded = Boolean(
    doc.is_superseded || 
    doc.isSuperseded || 
    status === 'SUPERSEDED' || 
    status === 'SUPERSEDED_ARCHIVED'
  );
  const isObsolete = Boolean(
    doc.is_obsolete || 
    doc.isObsolete || 
    status === 'OBSOLETE' || 
    status === 'OBSOLETE_ARCHIVED'
  );
  if (isSuperseded || isObsolete) return false;

  return (
    status === 'ACTIVE' ||
    status === 'EFFECTIVE' ||
    status === 'APPROVED' ||
    status === 'PUBLISHED' ||
    Boolean(doc.is_active || doc.isActive)
  );
};

/**
 * Synchronizes mirrored collections in a partial state object:
 * - documents <-> masterDocuments
 * - dars <-> darRequests
 * - controlledCopyInstances -> documentControlledCopies, controlledCopies
 * 
 * @param {Object} partialState 
 * @returns {Object} State with mirrored collections synced
 */
export const syncMirroredState = (partialState) => {
  if (!partialState || typeof partialState !== 'object') return partialState || {};
  const nextState = { ...partialState };

  if (nextState.documents !== undefined && !nextState.masterDocuments) {
    nextState.masterDocuments = nextState.documents;
  }
  if (nextState.masterDocuments !== undefined && !nextState.documents) {
    nextState.documents = nextState.masterDocuments;
  }

  if (nextState.dars !== undefined && !nextState.darRequests) {
    nextState.darRequests = nextState.dars;
  }
  if (nextState.darRequests !== undefined && !nextState.dars) {
    nextState.dars = nextState.darRequests;
  }

  if (nextState.controlledCopyInstances !== undefined) {
    if (!nextState.documentControlledCopies) {
      nextState.documentControlledCopies = nextState.controlledCopyInstances;
    }
    if (!nextState.controlledCopies) {
      nextState.controlledCopies = nextState.controlledCopyInstances;
    }
  } else if (nextState.controlledCopies !== undefined && !nextState.controlledCopyInstances) {
    nextState.controlledCopyInstances = nextState.controlledCopies;
    if (!nextState.documentControlledCopies) {
      nextState.documentControlledCopies = nextState.controlledCopies;
    }
  } else if (nextState.documentControlledCopies !== undefined && !nextState.controlledCopyInstances) {
    nextState.controlledCopyInstances = nextState.documentControlledCopies;
    if (!nextState.controlledCopies) {
      nextState.controlledCopies = nextState.documentControlledCopies;
    }
  }

  return nextState;
};

export default {
  getDocCode,
  getDocTitle,
  getCleanRev,
  getCleanDept,
  isActiveDoc,
  syncMirroredState,
};
