/**
 * documentUtils.js
 * 
 * Central QMS Document & Numbering Utilities
 * Conforms to ISO 9001:2015 Clause 7.5.3 Monotonic Non-Recycling Document Code Standard
 */

export {
  escapeRegex,
  formatDocumentRunningNumber,
  generateDocumentCode,
  getNextSequenceNumber,
  calculateNextDocumentSequence,
  calculateNextExternalDocSequence,
  checkDocumentCodeCollision
} from '../services/numberingService';

export {
  getDocCode,
  getDocTitle,
  getCleanRev,
  getCleanDept,
  isActiveDoc,
  syncMirroredState
} from './domainNormalizer';

import numberingService from '../services/numberingService';
export default numberingService;

/**
 * Checks if a string contains Thai characters
 * @param {string} text 
 * @returns {boolean}
 */
export const isThaiText = (text) => /[\u0E00-\u0E7F]/.test(String(text || ''));

/**
 * Resolves genuine alphanumeric document code (e.g. WI-QC-01, SOP-PD-001)
 * Rejects Thai descriptions from being treated as document codes.
 * Supports both resolveDocCode(doc) and resolveDocCode(copy, doc).
 * 
 * @param {Object} primary - Document object or copy instance
 * @param {Object|null} secondary - Optional linked master document
 * @returns {string} Clean document code
 */
export const resolveDocCode = (primary, secondary = null) => {
  if (!primary && !secondary) return '-';
  const p = primary || {};
  const s = secondary || {};

  const candidates = [
    p.document_code,
    p.doc_code,
    p.docCode,
    p.code,
    p.docNo,
    p.doc_no,
    p.documentCode,
    p.edCode,
    s.document_code,
    s.doc_code,
    s.docCode,
    s.code,
    s.docNo,
    s.doc_no,
    s.documentCode,
    s.edCode,
    p.title,
    s.title,
    p.docTitle,
    s.docTitle
  ];

  for (const c of candidates) {
    if (c && typeof c === 'string' && c.trim() !== '' && !isThaiText(c)) {
      return c.trim();
    }
  }

  return p.document_code || p.doc_code || p.docCode || p.code || p.docNo || p.documentCode ||
         s.document_code || s.doc_code || s.docCode || s.code || s.docNo || s.documentCode ||
         (p.title && !isThaiText(p.title) ? p.title : null) ||
         (s.title && !isThaiText(s.title) ? s.title : null) ||
         'DOC-UNKNOWN';
};

/**
 * Resolves descriptive document title/name in Thai or English.
 * Prioritizes actual document names over alphanumeric codes.
 * 
 * @param {Object} primary - Document object or copy instance
 * @param {Object|null} secondary - Optional linked master document
 * @returns {string} Document descriptive title
 */
export const resolveDocTitle = (primary, secondary = null) => {
  if (!primary && !secondary) return '-';
  const p = primary || {};
  const s = secondary || {};

  const candidates = [
    p.document_title,
    p.doc_title,
    p.docName,
    p.documentName,
    p.name,
    p.document_name,
    s.document_title,
    s.doc_title,
    s.name,
    s.document_name,
    s.docName,
    isThaiText(p.docTitle) ? p.docTitle : null,
    isThaiText(p.title) ? p.title : null,
    isThaiText(s.docTitle) ? s.docTitle : null,
    isThaiText(s.title) ? s.title : null,
    p.docTitle,
    p.title,
    p.name,
    s.docTitle,
    s.title,
    s.name
  ];

  for (const c of candidates) {
    if (c && typeof c === 'string' && c.trim() !== '') {
      return c.trim();
    }
  }

  return '';
};

/**
 * Resolves document revision formatted with 'Rev.' prefix (e.g. 'Rev.01')
 * 
 * @param {Object} primary - Document or copy instance
 * @param {Object|null} secondary - Optional linked master document
 * @returns {string}
 */
export const resolveDocVersion = (primary, secondary = null) => {
  const p = primary || {};
  const s = secondary || {};
  const v = p.doc_version || p.rev || p.revision || s.rev || s.revision || s.doc_version || '01';
  const str = String(v).replace(/^(Rev\.?\s*)+/i, '');
  return str ? `Rev.${str}` : 'Rev.01';
};

/**
 * Resolves the owning department of a document or copy
 * 
 * @param {Object} primary - Document or copy instance
 * @param {Object|null} secondary - Optional linked master document
 * @returns {string} Department code (e.g. 'QC', 'PD')
 */
export const resolveOwnerDept = (primary, secondary = null) => {
  const p = primary || {};
  const s = secondary || {};
  return s.department || s.owner_dept || s.ownerDepartment || p.department || p.dept || p.owner_dept || p.ownerDepartment || p.holder_dept || '-';
};

/**
 * Finds the master document associated with a copy instance
 * 
 * @param {Object} copy - Controlled copy record
 * @param {Array} documents - Internal document master list
 * @param {Array} externalDocuments - External document master list
 * @returns {Object|null} Master document or null
 */
export const resolveCopyDoc = (copy, documents = [], externalDocuments = []) => {
  if (!copy) return null;
  const docId = String(copy.doc_id || copy.docId || copy.external_doc_id || '');
  if (!docId) return null;
  return (documents || []).find(d => String(d.id) === docId)
    || (externalDocuments || []).find(d => String(d.id) === docId) || null;
};

/**
 * Converts revision string (e.g. '00', '01', 'Rev.02', 'A') to numeric sequence index
 * @param {string|number} revStr 
 * @returns {number}
 */
export const getRevisionIndex = (revStr) => {
  if (!revStr && revStr !== 0) return 0;
  const clean = String(revStr).replace(/^rev\.?\s*/i, '').trim();
  const num = parseInt(clean, 10);
  if (!isNaN(num)) return num;
  if (clean.length === 1) return clean.toUpperCase().charCodeAt(0) - 65;
  return 0;
};

/**
 * Compares two revision identifiers
 * Returns negative if revA < revB, 0 if equal, positive if revA > revB
 * @param {string|number} revA 
 * @param {string|number} revB 
 * @returns {number}
 */
export const compareRevisions = (revA, revB) => {
  return getRevisionIndex(revA) - getRevisionIndex(revB);
};

/**
 * ISO 9001 Clause 7.5.3 — Periodic Review Helpers
 * ─────────────────────────────────────────────────
 * These helpers operate on lightweight date strings (YYYY-MM-DD)
 * and are intentionally separate from PeriodicReviewService.js
 * to allow use in documentUtils-dependent paths (e.g. Library, DocumentDetailModal).
 */

/**
 * Adds specified number of years to a date string (YYYY-MM-DD or ISO).
 * Properly handles leap-year edge cases (e.g. 2024-02-29 + 1 year = 2025-02-28).
 *
 * @param {string} baseDateStr - ISO date string or YYYY-MM-DD
 * @param {number} years - number of years to add (default 1)
 * @returns {string} YYYY-MM-DD date or '' if falsy/invalid
 */
export const addYears = (baseDateStr, years = 1) => {
  if (!baseDateStr) return '';
  const str = String(baseDateStr).split('T')[0].trim();
  const parts = str.split('-');
  if (parts.length < 3) {
    const dt = new Date(baseDateStr);
    if (isNaN(dt.getTime())) return '';
    dt.setFullYear(dt.getFullYear() + years);
    return dt.toISOString().split('T')[0];
  }
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return '';

  const targetYear = y + years;
  // Leap year edge case: 2024-02-29 -> 2025-02-28 (if target year is not leap year)
  if (m === 2 && d === 29) {
    const isLeap = (targetYear % 4 === 0 && targetYear % 100 !== 0) || (targetYear % 400 === 0);
    const targetDay = isLeap ? 29 : 28;
    return `${targetYear}-02-${String(targetDay).padStart(2, '0')}`;
  }
  return `${targetYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

/**
 * Returns document review cycle in years based on document type:
 * - QP, SOP: 1 year
 * - WI, FM: 2 years
 * - Other/Default: 1 year
 *
 * @param {string} docType - Document type or title prefix (e.g. 'QP', 'SOP', 'WI', 'FM')
 * @returns {number} cycle in years
 */
export const getReviewCycleYears = (docType) => {
  const type = String(docType || '').toUpperCase().trim();
  if (
    type === 'WI' || 
    type === 'FM' || 
    type.startsWith('WI-') || 
    type.startsWith('FM-') || 
    type.startsWith('WI_') || 
    type.startsWith('FM_') ||
    type.includes('/WI/') ||
    type.includes('/FM/')
  ) {
    return 2;
  }
  return 1;
};

/**
 * Returns a date string after adding cycle years (default 1 year) to the supplied base date.
 * Safe for use in both store actions and pure utility calculations.
 *
 * @param {string} baseDateStr - ISO date string or YYYY-MM-DD
 * @param {number} [years=1] - number of years
 * @returns {string} YYYY-MM-DD date, or '' if baseDateStr is falsy
 */
export const calculateNextReviewDate = (baseDateStr, years = 1) => {
  return addYears(baseDateStr, years);
};

/**
 * Returns a normalized review status string based on distance between today and nextReviewDueDate.
 *
 * @param {string} nextReviewDueDate - YYYY-MM-DD date of next due review
 * @param {Date|string} [today=new Date()] - reference date
 * @returns {'OVERDUE' | 'DUE_SOON' | 'UP_TO_DATE'} review urgency status
 */
export const getReviewStatus = (nextReviewDueDate, today = new Date()) => {
  if (!nextReviewDueDate) return 'UP_TO_DATE';
  const now = new Date(today);
  now.setHours(0, 0, 0, 0);
  const due = new Date(nextReviewDueDate);
  due.setHours(0, 0, 0, 0);
  if (isNaN(due.getTime())) return 'UP_TO_DATE';
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'OVERDUE';     // เกินกำหนด
  if (diffDays <= 30) return 'UPCOMING';  // ใกล้ถึงกำหนดใน 30 วัน
  return 'UP_TO_DATE';                   // ปกติ
};

/**
 * Returns normalized status flag strictly as OVERDUE, UPCOMING, or NORMAL:
 * - OVERDUE: today > next_review_date
 * - UPCOMING: next_review_date - today <= 30 days
 * - NORMAL: > 30 days
 *
 * @param {string} nextReviewDueDate - YYYY-MM-DD date of next due review
 * @param {Date|string} [today=new Date()] - reference date
 * @returns {'OVERDUE' | 'UPCOMING' | 'NORMAL'}
 */
export const getReviewStatusFlag = (nextReviewDueDate, today = new Date()) => {
  const status = getReviewStatus(nextReviewDueDate, today);
  if (status === 'UP_TO_DATE' || status === 'ON_SCHEDULE') return 'NORMAL';
  return status;
};

/**
 * Evaluates document periodic review status against reference date.
 * Single source of truth helper for reactive Periodic Review testing.
 *
 * @param {string} nextReviewDate - YYYY-MM-DD date of next review
 * @param {Date|string} [referenceDate=new Date()] - effective today reference date
 * @returns {'OVERDUE' | 'DUE_SOON' | 'UP_TO_DATE'}
 */
/**
 * Computes dynamic cycle display text for a document or task payload.
 *
 * @param {Object} doc - Document or schedule or task payload object
 * @returns {string} e.g. "1 ปี", "2 ปี", "6 เดือน"
 */
export function getCycleDisplayText(doc) {
  if (!doc) return '1 ปี';
  if (doc.review_cycle_months) {
    const months = Number(doc.review_cycle_months);
    if (months >= 12 && months % 12 === 0) {
      return `${months / 12} ปี`;
    }
    return `${months} เดือน`;
  }
  if (doc.review_cycle_years) {
    return `${doc.review_cycle_years} ปี`;
  }
  if (doc.cycleYears) {
    return `${doc.cycleYears} ปี`;
  }
  if (doc.frequencyMonths) {
    const months = Number(doc.frequencyMonths);
    if (months >= 12 && months % 12 === 0) {
      return `${months / 12} ปี`;
    }
    return `${months} เดือน`;
  }
  const code = doc.doc_code || doc.document_code || doc.documentNumber || doc.code || doc.document_number || doc.title || '';
  if (code) {
    const years = getReviewCycleYears(code);
    return `${years} ปี`;
  }
  return '1 ปี';
}

/**
 * Pure date-based periodic review status calculator.
 * - diffDays < 0 => OVERDUE
 * - 0 <= diffDays <= 30 => DUE_SOON
 * - diffDays > 30 => NORMAL (ยังไม่ถึงกำหนด)
 */
export const getPeriodicReviewStatus = (nextReviewDate, referenceDate = new Date()) => {
  if (!nextReviewDate) return { status: 'NORMAL', label: 'ยังไม่ถึงกำหนด', color: 'green', days: null };

  const now = new Date(referenceDate);
  now.setHours(0, 0, 0, 0);

  const target = new Date(nextReviewDate);
  if (isNaN(target.getTime())) {
    return { status: 'NORMAL', label: 'ยังไม่ถึงกำหนด', color: 'green', days: null };
  }
  target.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { status: 'OVERDUE', label: 'เกินกำหนด', color: 'red', days: Math.abs(diffDays) };
  }
  if (diffDays >= 0 && diffDays <= 30) {
    return { status: 'DUE_SOON', label: 'ใกล้ครบกำหนด', color: 'amber', days: diffDays };
  }
  return { status: 'NORMAL', label: 'ยังไม่ถึงกำหนด', color: 'green', days: diffDays };
};

/**
 * Evaluates document periodic review status against reference date with strict priority order.
 * Priority 1: OVERDUE (diffDays < 0) or DUE_SOON (0 <= diffDays <= 30) -> canReview: true
 * Priority 2: COMPLETED (recent approval within 60 days when diffDays > 30) -> canReview: false
 * Priority 3: UP_TO_DATE -> canReview: false
 *
 * @param {Object|string} docOrDate - Document object or nextReviewDate string
 * @param {Date|string} [referenceDate=new Date()] - effective today reference date
 * @returns {{ status: string, diffDays: number, canReview: boolean } | 'OVERDUE' | 'DUE_SOON' | 'UP_TO_DATE'}
 */
export function evaluateDocumentReviewStatus(docOrDate, referenceDate = new Date()) {
  const isDocObject = docOrDate && typeof docOrDate === 'object' && !(docOrDate instanceof Date);
  const isExternalDoc = isDocObject && Boolean(
    docOrDate.isExternal ||
    docOrDate.is_external ||
    docOrDate.documentCategory === 'EXTERNAL' ||
    docOrDate.doc_type === 'EXTERNAL' ||
    docOrDate.edCode ||
    docOrDate.targetDoc?.edCode ||
    docOrDate.targetDoc?.is_external
  );
  const nextDateStr = isDocObject
    ? (isExternalDoc
        ? (docOrDate.nextReviewDate || docOrDate.next_review_date || docOrDate.currentScheduledReviewDate || docOrDate.targetDoc?.nextReviewDate || docOrDate.targetDoc?.next_review_date)
        : (docOrDate.next_review_date || docOrDate.nextReviewDate || docOrDate.currentScheduledReviewDate || docOrDate.targetDoc?.next_review_date || docOrDate.targetDoc?.nextReviewDate))
    : docOrDate;

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  // String status checks if docOrDate itself is a status string
  if (!isDocObject && typeof docOrDate === 'string') {
    if (docOrDate === 'PENDING_APPROVAL') return 'PENDING_APPROVAL';
    if (docOrDate === 'AWAITING_ACTION') return 'AWAITING_ACTION';
  }

  // Pre-calculate diffDays if nextDateStr is valid
  let diffDays = null;
  if (nextDateStr) {
    const target = new Date(nextDateStr);
    if (!isNaN(target.getTime())) {
      target.setHours(0, 0, 0, 0);
      diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }
  }

  // Handle PENDING_APPROVAL and AWAITING_ACTION cleanly for document objects
  if (isDocObject) {
    const rawReviewStatus = String(docOrDate.review_status || docOrDate.status || docOrDate.targetDoc?.review_status || docOrDate.targetDoc?.status || '').toUpperCase();
    const isPendingApproval = rawReviewStatus === 'PENDING_APPROVAL' ||
      docOrDate.dueState === 'PENDING_APPROVAL' ||
      Boolean(docOrDate.pending_periodic_review) ||
      Boolean(docOrDate.targetDoc?.pending_periodic_review);

    if (isPendingApproval) {
      return { status: 'PENDING_APPROVAL', diffDays: diffDays ?? 0, canReview: false };
    }

    const isAwaitingAction = rawReviewStatus === 'AWAITING_ACTION' ||
      docOrDate.dueState === 'AWAITING_ACTION' ||
      docOrDate.periodic_review_outcome === 'REVISION_REQUIRED' ||
      docOrDate.periodic_review_outcome === 'OBSOLETE_REQUIRED' ||
      docOrDate.targetDoc?.periodic_review_outcome === 'REVISION_REQUIRED' ||
      docOrDate.targetDoc?.periodic_review_outcome === 'OBSOLETE_REQUIRED';

    if (isAwaitingAction) {
      return { status: 'AWAITING_ACTION', diffDays: diffDays ?? 0, canReview: false };
    }
  }

  if (!nextDateStr || diffDays === null) {
    if (isDocObject && docOrDate.status === 'OVERDUE') {
      return isDocObject ? { status: 'OVERDUE', diffDays: -999, canReview: true } : 'OVERDUE';
    }
    if (isDocObject && (docOrDate.status === 'DUE_SOON' || docOrDate.status === 'DUE')) {
      return isDocObject ? { status: 'DUE_SOON', diffDays: 0, canReview: true } : 'DUE_SOON';
    }
    if (isDocObject) {
      const isExplicitlyFreshCycle = docOrDate.targetDoc
        ? (docOrDate.targetDoc.is_reviewed_this_cycle === false && docOrDate.targetDoc.review_status === 'UP_TO_DATE' && docOrDate.review_status !== 'COMPLETED')
        : (docOrDate.is_reviewed_this_cycle === false && docOrDate.review_status === 'UP_TO_DATE');

      if (!isExplicitlyFreshCycle) {
        const reviews = docOrDate.periodic_reviews || docOrDate.reviewLogs || docOrDate.review_history || docOrDate.targetDoc?.periodic_reviews || docOrDate.targetDoc?.review_history;
        const lastReview = Array.isArray(reviews) && reviews.length > 0 ? reviews[reviews.length - 1] : null;
        const hasRecentApproval = lastReview && (lastReview.approval_status === 'APPROVED' || lastReview.result === 'NO_CHANGE' || lastReview.outcome === 'CONFIRM_CONTINUE' || lastReview.outcome === 'NO_CHANGE');

        const lastReviewedAt = docOrDate.last_reviewed_at || docOrDate.lastReviewedDate || docOrDate.targetDoc?.last_reviewed_at || docOrDate.targetDoc?.lastReviewedDate || lastReview?.approved_at || lastReview?.reviewed_at || lastReview?.reviewed_date || lastReview?.reviewDate;

        if (lastReviewedAt) {
          const reviewDate = new Date(lastReviewedAt);
          if (!isNaN(reviewDate.getTime())) {
            reviewDate.setHours(0, 0, 0, 0);
            const daysSinceReview = Math.floor((today - reviewDate) / (1000 * 60 * 60 * 24));
            const sameYear = reviewDate.getFullYear() === today.getFullYear();
            if ((daysSinceReview >= 0 && daysSinceReview < 60) || sameYear) {
              return { status: 'COMPLETED', diffDays: 999, canReview: false };
            }
          }
        } else if (hasRecentApproval || docOrDate.status === 'COMPLETED' || docOrDate.review_status === 'COMPLETED' || docOrDate.is_reviewed_this_cycle) {
          return { status: 'COMPLETED', diffDays: 999, canReview: false };
        }
      }
    }
    return isDocObject ? { status: 'UP_TO_DATE', diffDays: 999, canReview: false } : 'UP_TO_DATE';
  }

  // 1. ตรวจสอบสถานะด่วนก่อนเสมอ (Priority 1)
  if (diffDays < 0) {
    return isDocObject ? { status: 'OVERDUE', diffDays, canReview: true } : 'OVERDUE';
  }
  if (diffDays >= 0 && diffDays <= 30) {
    return isDocObject ? { status: 'DUE_SOON', diffDays, canReview: true } : 'DUE_SOON';
  }

  // 2. ถ้าเหลือเวลามากกว่า 30 วัน: ตรวจสอบว่าเพิ่งได้รับการอนุมัติทบทวนมาหมาด ๆ หรือไม่ (Priority 2)
  if (isDocObject) {
    const isExplicitlyFreshCycle = docOrDate.targetDoc
      ? (docOrDate.targetDoc.is_reviewed_this_cycle === false && docOrDate.targetDoc.review_status === 'UP_TO_DATE' && docOrDate.review_status !== 'COMPLETED')
      : (docOrDate.is_reviewed_this_cycle === false && docOrDate.review_status === 'UP_TO_DATE');

    if (!isExplicitlyFreshCycle) {
      const reviews = docOrDate.periodic_reviews || docOrDate.reviewLogs || docOrDate.review_history || docOrDate.targetDoc?.periodic_reviews || docOrDate.targetDoc?.review_history;
      const lastReview = Array.isArray(reviews) && reviews.length > 0 ? reviews[reviews.length - 1] : null;
      const hasRecentApproval = lastReview && (lastReview.approval_status === 'APPROVED' || lastReview.result === 'NO_CHANGE' || lastReview.outcome === 'CONFIRM_CONTINUE' || lastReview.outcome === 'NO_CHANGE');

      const lastReviewedAt = docOrDate.last_reviewed_at || docOrDate.lastReviewedDate || docOrDate.targetDoc?.last_reviewed_at || docOrDate.targetDoc?.lastReviewedDate || lastReview?.approved_at || lastReview?.reviewed_at || lastReview?.reviewed_date || lastReview?.reviewDate;

      const isMarkedCompleted = hasRecentApproval ||
        docOrDate.status === 'COMPLETED' ||
        docOrDate.review_status === 'COMPLETED' ||
        docOrDate.is_reviewed_this_cycle ||
        docOrDate.targetDoc?.review_status === 'COMPLETED' ||
        docOrDate.targetDoc?.is_reviewed_this_cycle;

      if (isMarkedCompleted) {
        if (lastReviewedAt) {
          const reviewDate = new Date(lastReviewedAt);
          if (!isNaN(reviewDate.getTime())) {
            reviewDate.setHours(0, 0, 0, 0);
            const daysSinceReview = Math.floor((today - reviewDate) / (1000 * 60 * 60 * 24));
            const sameYear = reviewDate.getFullYear() === today.getFullYear();
            // หากเพิ่งทบทวนเสร็จไม่เกินระยะปลอดภัย (เช่น 60 วัน) หรืออยู่ในรอบปีเดียวกัน ให้แสดงเป็น "ทบทวนแล้วเสร็จ"
            if ((daysSinceReview >= 0 && daysSinceReview < 60) || sameYear) {
              return { status: 'COMPLETED', diffDays, canReview: false };
            }
            // หากข้ามปีและพ้นระยะ 60 วันแล้ว ให้ถือว่าสิ้นสุดรอบเสร็จสิ้นเดิม -> จะปรับเป็น UP_TO_DATE
          }
        } else {
          return { status: 'COMPLETED', diffDays, canReview: false };
        }
      }
    }
  }

  // 3. นอกนั้นถือเป็นสถานะปกติ ยังไม่ถึงกำหนด (Priority 3)
  return isDocObject ? { status: 'UP_TO_DATE', diffDays, canReview: false } : 'UP_TO_DATE';
}

/**
 * Checks whether a document or schedule record has completed its periodic review in the current cycle.
 * Delegates to evaluateDocumentReviewStatus to adhere strictly to priority order.
 *
 * @param {Object} doc - Document or schedule object
 * @param {Date|string} [referenceDate=new Date()] - Reference date (effective today)
 * @returns {boolean}
 */
export function isDocumentReviewedThisCycle(doc, referenceDate = new Date()) {
  if (!doc) return false;
  const result = evaluateDocumentReviewStatus(doc, referenceDate);
  const status = typeof result === 'object' ? result.status : result;
  return status === 'COMPLETED';
}

/**
 * Calculates mutually exclusive (MECE) periodic review metrics for documents or review records.
 * Uses evaluateDocumentReviewStatus to eliminate race conditions and prioritize urgent due dates.
 *
 * @param {Array} docs - List of documents or review schedule records
 * @param {Date|string} [referenceDate=new Date()] - Reference date (effective today)
 * @returns {{ total: number, dueSoon: number, overdue: number, completed: number, upToDate: number, actionRequired: number }}
 */
export function getDocumentReviewMetrics(docs = [], referenceDate = new Date()) {
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  let total = docs.length;
  let dueSoon = 0;
  let overdue = 0;
  let completed = 0;
  let upToDate = 0;

  docs.forEach(doc => {
    if (!doc) return;

    const evaluation = evaluateDocumentReviewStatus(doc, referenceDate);
    const status = typeof evaluation === 'object' ? evaluation.status : evaluation;

    if (status === 'OVERDUE') {
      overdue++;
    } else if (status === 'DUE_SOON') {
      dueSoon++;
    } else if (status === 'COMPLETED') {
      completed++;
    } else {
      upToDate++;
    }
  });

  return { total, dueSoon, overdue, completed, upToDate, actionRequired: dueSoon + overdue };
}





