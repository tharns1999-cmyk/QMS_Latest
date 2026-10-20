/**
 * numberingService.js
 * 
 * Monotonic Non-Recycling Document Code Sequence Engine
 * Conforms to ISO 9001:2015 Clause 7.5.3 (Control of Documented Information)
 * 
 * Principles:
 * 1. Monotonic Non-Recycling: Once a document code or sequence number is issued, 
 *    it CANNOT be recycled under any circumstances, even if the document is OBSOLETE,
 *    SUPERSEDED, ARCHIVED, or CANCELLED.
 * 2. Omni-Status Historical Scan: All historical document pools (ACTIVE, OBSOLETE, 
 *    SUPERSEDED, DRAFT, ARCHIVED) plus in-flight requests (DARs, pending reviews, tasks)
 *    are scanned together to compute MAX(Sequence) + 1.
 * 3. Race Condition Immunity: In-flight requests waiting in queues reserve their sequence
 *    number to prevent collision.
 */

import { getDocCode } from '../utils/domainNormalizer';

/**
 * Escapes regex special characters in a string
 */
export const escapeRegex = (str) => {
  if (!str) return '';
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Formats a document running number with 2-digit minimum base standard:
 * 1-99   => "01", "02", ..., "99" (2 digits)
 * 100+   => "100", "101", ... (3+ digits)
 *
 * @param {number|string} num
 * @param {number} [minDigits=2]
 * @returns {string}
 */
export const formatDocumentRunningNumber = (num, minDigits = 2) => {
  const parsed = parseInt(num, 10);
  if (isNaN(parsed) || parsed < 1) return '01';
  if (parsed < 100 && minDigits === 2) {
    return String(parsed).padStart(2, '0');
  }
  return String(parsed);
};

/**
 * Generates formatted document code replacing pattern tokens
 * Tokens: {Type}, {Dept}, {###}, {##}
 *
 * @param {string} pattern E.g. 'SOP-{Dept}-{##}' or 'ED-{Dept}-{##}'
 * @param {string} typeCode E.g. 'SOP', 'WI', 'ED'
 * @param {string} deptCode E.g. 'PD', 'QC', 'QA'
 * @param {number|string} seqNumber Numeric sequence
 * @returns {string}
 */
export const generateDocumentCode = (pattern, typeCode, deptCode, seqNumber) => {
  const pat = pattern || `${typeCode}-{Dept}-{##}`;
  const seqFormatted = formatDocumentRunningNumber(seqNumber);
  return pat
    .replace('{Type}', typeCode)
    .replace('{Dept}', deptCode)
    .replace('{###}', seqFormatted)
    .replace('{##}', seqFormatted);
};

/**
 * Core Omni-Status Historical Scan Engine
 * Scans all candidate items across all statuses and extracts max sequence matching prefix & dept.
 *
 * @param {string} prefix Document type / category prefix (e.g. 'ED', 'SOP', 'WI', 'FM')
 * @param {string} dept Department code (e.g. 'QC', 'PD', 'QA', 'EN')
 * @param {Array<Object|string>} items List of document/request/task objects or code strings
 * @returns {number} Next available monotonic sequence (MAX + 1)
 */
export const getNextSequenceNumber = (prefix, dept, items = []) => {
  if (!prefix || !dept) return 1;
  const cleanPrefix = String(prefix).trim().toUpperCase();
  const cleanDept = String(dept).trim();
  if (!cleanDept) return 1;

  // Regex matches: ^PREFIX-DEPT-(\d+)(?:[^0-9]|$) case-insensitively
  // Examples:
  // - ED-QC-01 -> 1
  // - ED-QC-02 -> 2
  // - SOP-PD-47 -> 47
  // - SOP-PD-100 -> 100
  // - ED-QC-01-R00 -> 1
  const regex = new RegExp(`^${escapeRegex(cleanPrefix)}-${escapeRegex(cleanDept)}-(\\d+)(?:[^0-9]|$)`, 'i');

  const foundSequences = [];

  const inspectCandidate = (val) => {
    if (!val || typeof val !== 'string') return;
    const trimmed = val.trim();
    const match = trimmed.match(regex);
    if (match && match[1]) {
      const seq = parseInt(match[1], 10);
      if (!isNaN(seq) && seq > 0) {
        foundSequences.push(seq);
      }
    }
  };

  const pool = Array.isArray(items) ? items : [];

  pool.forEach(item => {
    if (!item) return;

    if (typeof item === 'string') {
      inspectCandidate(item);
      return;
    }

    if (typeof item === 'object') {
      const docCode = getDocCode(item);
      if (docCode) {
        inspectCandidate(docCode);
      }

      // Check all possible code fields across documents, dars, externalRequests, and tasks
      const candidateFields = [
        item.edCode,
        item.docCode,
        item.doc_code,
        item.documentCode,
        item.document_code,
        item.docNo,
        item.doc_no,
        item.docIdInput,
        item.code,
        item.id,
        item.docId,
        item.referenceId,
        item.title,
        item.name
      ];

      for (const val of candidateFields) {
        inspectCandidate(val);
      }
    }
  });

  if (foundSequences.length === 0) {
    return 1;
  }

  return Math.max(...foundSequences) + 1;
};

/**
 * Calculates next sequence number for Internal Documents (SOP, WI, FM, QP, etc.)
 * Strictly includes all historical documents across all statuses (EFFECTIVE, OBSOLETE, SUPERSEDED, etc.)
 * and all in-flight DAR requests/tasks.
 *
 * @param {string} docType Document type (e.g. 'SOP', 'WI', 'FM')
 * @param {string} deptCode Department code (e.g. 'PD', 'QA', 'QC')
 * @param {Array} [documents=[]] Historical documents array
 * @param {Array} [dars=[]] In-flight / draft DARs array
 * @param {Array} [tasks=[]] Active tasks array
 * @returns {number} Next sequence number
 */
export const calculateNextDocumentSequence = (docType, deptCode, documents = [], dars = [], tasks = []) => {
  if (!docType || !deptCode) return 1;
  const omniPool = [
    ...(Array.isArray(documents) ? documents : []),
    ...(Array.isArray(dars) ? dars : []),
    ...(Array.isArray(tasks) ? tasks : [])
  ];
  return getNextSequenceNumber(docType, deptCode, omniPool);
};

/**
 * Calculates next sequence number for External Documents (ED)
 * Strictly includes all historical external documents across all statuses (ACTIVE, OBSOLETE, SUPERSEDED, etc.)
 * and all in-flight external requests/tasks.
 *
 * @param {string} deptCode Department code (e.g. 'QC', 'QA', 'PD')
 * @param {Array} [externalDocuments=[]] Historical external documents array
 * @param {Array} [externalRequests=[]] In-flight external requests array
 * @param {Array} [tasks=[]] Active tasks array
 * @returns {number} Next sequence number
 */
export const calculateNextExternalDocSequence = (deptCode, externalDocuments = [], externalRequests = [], tasks = []) => {
  if (!deptCode) return 1;
  const omniPool = [
    ...(Array.isArray(externalDocuments) ? externalDocuments : []),
    ...(Array.isArray(externalRequests) ? externalRequests : []),
    ...(Array.isArray(tasks) ? tasks : [])
  ];
  return getNextSequenceNumber('ED', deptCode, omniPool);
};

/**
 * Checks if a proposed document code already exists in any pool (Omni-Status Collision Guard)
 *
 * @param {string} code Proposed code e.g. 'ED-QC-01'
 * @param {Array} pool Combined document and request items
 * @returns {boolean} True if collision detected
 */
export const checkDocumentCodeCollision = (code, pool = []) => {
  if (!code || typeof code !== 'string') return false;
  const cleanCode = code.trim().toUpperCase();
  return (pool || []).some(item => {
    if (!item) return false;
    if (typeof item === 'string') return item.trim().toUpperCase() === cleanCode;
    const docCode = getDocCode(item);
    if (docCode && docCode.toUpperCase() === cleanCode) return true;
    const candidates = [
      item.edCode, item.docCode, item.doc_code, item.documentCode,
      item.document_code, item.docNo, item.docIdInput, item.id, item.docId
    ];
    return candidates.some(c => typeof c === 'string' && c.trim().toUpperCase() === cleanCode);
  });
};

export default {
  escapeRegex,
  formatDocumentRunningNumber,
  generateDocumentCode,
  getNextSequenceNumber,
  calculateNextDocumentSequence,
  calculateNextExternalDocSequence,
  checkDocumentCodeCollision
};
