/**
 * UniversalWatermarkService.js
 * 
 * Enterprise Document Security & Watermark Engine (Client-Side 100%)
 * Single watermark engine: every diagonal watermark is drawn by watermarkEngine.drawStandardIsoWatermark,
 * with colours/texts from WATERMARK_CONFIG (config/qmsRegistry). Blank FM forms stay clean while current.
 */

import { 
  stampExternalDocumentTopRight, 
  drawIsoDiagonalWatermark, 
  applyProgressiveSignatoryStamp,
  SIGNATORY_FONT_FAMILY,
  PURE_BLACK,
  renderSignatoryText
} from '../utils/pdfStamper';
import { resolveFileBlob } from '../utils/fileStorage';
import { FILE_PURPOSE } from '../../../api/client';
import { generateQmsDownloadName } from '../utils/documentNamingHelper';
import { cleanLocationName } from './MasterDataService';
import { isDccUser } from '../utils/taskFilter';
import { drawStandardIsoWatermark, generateWatermarkCanvas, applyCanvasWatermarkToPdf, getSignatoryTableDimensions, WATERMARK_FONT_FAMILY } from './watermarkEngine';

export {
  drawIsoDiagonalWatermark,
  applyProgressiveSignatoryStamp,
  drawStandardIsoWatermark,
  generateWatermarkCanvas,
  applyCanvasWatermarkToPdf,
  getSignatoryTableDimensions,
  SIGNATORY_FONT_FAMILY,
  PURE_BLACK,
  renderSignatoryText,
  WATERMARK_FONT_FAMILY
};

export const WATERMARK_TYPES = {
  UNCONTROLLED_COPY: 'UNCONTROLLED_COPY',
  OFFICIAL_MASTER_COPY: 'OFFICIAL_MASTER_COPY',
  STRICTLY_CONFIDENTIAL: 'STRICTLY_CONFIDENTIAL',
  CONTROLLED: 'CONTROLLED',
  CONTROLLED_COPY: 'CONTROLLED_COPY',
  CONTROLLED_COPY_REPLACEMENT: 'CONTROLLED_COPY_REPLACEMENT',
  OBSOLETE: 'OBSOLETE',
  SUPERSEDED: 'SUPERSEDED',
  DRAFT: 'DRAFT',
  DRAFT_WATERMARK: 'DRAFT_WATERMARK'
};

export const DOWNLOAD_MODES = {
  UNCONTROLLED: 'UNCONTROLLED',
  CLEAN_MASTER: 'CLEAN_MASTER',
  CLEAN: 'CLEAN',
  CONTROLLED: 'CONTROLLED'
};

/**
 * Helper: Format date/time to Thailand local time (Asia/Bangkok - GMT+7) in YYYY-MM-DD HH:mm format
 * @param {Date|string|number} [dateInput=new Date()]
 * @returns {string} e.g. "2026-08-24 10:58"
 */
export const getBangkokFormattedTimestamp = (dateInput = new Date()) => {
  if (!dateInput) return '';
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type) => parts.find(p => p.type === type)?.value || '';

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  const hour = getPart('hour');
  const minute = getPart('minute');

  return `${year}-${month}-${day} ${hour}:${minute}`;
};

/**
 * Helper: Format date to Thailand local time (Asia/Bangkok - GMT+7) in YYYY-MM-DD format
 * @param {Date|string|number} [dateInput=new Date()]
 * @returns {string} e.g. "2026-08-24"
 */
export const getBangkokFormattedDate = (dateInput = new Date()) => {
  if (!dateInput) return '';
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type) => parts.find(p => p.type === type)?.value || '';

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');

  return `${year}-${month}-${day}`;
};


/**
 * Sequential Stamping Pipeline for Master PDF Download:
 * Step 1 (Signatures Burn-in): If document is approved (ACTIVE, APPROVED, EFFECTIVE, stage === 'MASTER'),
 * resolve signatories from dar.workflowSteps / masterDoc.signatories and call applyProgressiveSignatoryStamp.
 * Step 2 (Watermark Layer): Stamp large diagonal watermark (e.g. UNCONTROLLED COPY ~50pt) using drawIsoDiagonalWatermark.
 * Step 3: Returns the finalized PDF bytes.
 */
// A revision keeps its sign-off table for life: superseded/obsolete copies are stamped with signatures first, the lifecycle watermark goes on top.
const SIGNED_OFF_STATUS = /^(ACTIVE|EFFECTIVE|APPROVED|SUPERSEDED|OBSOLETE)/;

export const prepareMasterPdfForDownload = async ({ 
  document: docInput, 
  dar, 
  masterUsers, 
  watermarkType = 'UNCONTROLLED',
  isCleanMaster = false,
  meta = {}
}) => {
  const document = docInput || {};

  // 1. ดึงข้อมูลไบนารีดั้งเดิมของ PDF
  let pdfBytes = document.fileData || document.originalPdfBytes || document.fileBlob || document.file;
  if (!pdfBytes) {
    const fallbackKey = document.fileId || document.file_id || document.id || document.docCode || document.document_code || dar?.id;
    // Preparing a master file for download: the server audits it as a download.
    const resolvedBlob = await resolveFileBlob(document, fallbackKey, { purpose: FILE_PURPOSE.DOWNLOAD });
    if (resolvedBlob) {
      pdfBytes = await resolvedBlob.arrayBuffer();
    }
  }
  if (typeof Blob !== 'undefined' && pdfBytes instanceof Blob) {
    pdfBytes = await pdfBytes.arrayBuffer();
  }

  if (!pdfBytes) {
    throw new Error('ไม่พบข้อมูลไฟล์ PDF สำหรับเตรียมดาวน์โหลด');
  }

  // 2. ตรวจสอบและประทับตารางลายเซ็น 3x3 หากเป็นเอกสารที่ผ่านการอนุมัติแล้ว
  const statusUpper = String(document.status || dar?.status || 'ACTIVE').toUpperCase();
  const isApproved = SIGNED_OFF_STATUS.test(statusUpper) || 
                     dar?.status === 'APPROVED' || 
                     document.stage === 'MASTER' || 
                     dar?.stage === 'MASTER';

  const docCode = document.document_code || document.doc_code || document.docCode || document.edCode || document.title || '';
  const isInternal = !document.isExternal && document.docType !== 'ED' && !String(docCode).startsWith('ED-') && !String(docCode).startsWith('EXT-');

  if (isApproved && isInternal) {
    let resolvedMasterUsers = masterUsers;
    let resolvedUsers = [];
    let resolvedDar = dar;

    if (!resolvedMasterUsers || resolvedMasterUsers.length === 0 || !resolvedDar) {
      try {
        const { default: useStore } = await import('../../../store/useStore');
        const store = useStore.getState();
        if (store) {
          if (!resolvedMasterUsers) resolvedMasterUsers = store.masterUsers || [];
          resolvedUsers = store.users || [];
          if (!resolvedDar && store.dars) {
            resolvedDar = store.dars.find(d => 
              d.id === document.darId || 
              d.darNumber === document.darNumber || 
              d.docNo === docCode || 
              d.docCode === docCode ||
              d.title === document.title
            );
          }
        }
      } catch {}
    }

    const { resolveProgressiveSignatories } = await import('../utils/signatoryResolver');
    const signatories = resolveProgressiveSignatories({
      dar: resolvedDar || document,
      masterDoc: document,
      stage: 'MASTER',
      masterUsers: resolvedMasterUsers || [],
      users: resolvedUsers || []
    });

    // ประทับตรายางตาราง 3x3 (ผู้จัดทำ, ผู้ทบทวน, ผู้อนุมัติ) ถาวร
    pdfBytes = await applyProgressiveSignatoryStamp(pdfBytes, signatories);
  }

  // 3. ตรวจสอบโหมด Clean Master (สำหรับ DCC Admin ข้ามลายน้ำทแยงมุม เพื่อให้ได้เอกสารคลีนที่มีเฉพาะตาราง 3x3)
  const normWatermark = String(watermarkType || 'UNCONTROLLED').toUpperCase();
  const shouldBypassWatermark = isCleanMaster || 
    normWatermark === 'CLEAN' || 
    normWatermark === 'CLEAN_MASTER' || 
    normWatermark === 'MASTER_CLEAN' || 
    normWatermark === 'NONE';

  if (!shouldBypassWatermark) {
    pdfBytes = await drawStandardIsoWatermark(pdfBytes, normWatermark, {
      ...document,
      docCode,
      status: statusUpper,
      revNo: document.revNo ?? document.revision ?? document.rev ?? '00',
      ...meta
    });
  }

  return pdfBytes;
};

// The record's lifecycle decides the stamp: callers cannot download a superseded/obsolete record as clean, controlled or uncontrolled
const lifecycleWatermarkType = (doc = {}) => {
  const status = String(doc.status || '').toUpperCase();
  if (status.startsWith('OBSOLETE') || doc.is_obsolete || doc.isObsolete) return WATERMARK_TYPES.OBSOLETE;
  if (status.startsWith('SUPERSEDED') || doc.is_superseded || doc.isSuperseded) return WATERMARK_TYPES.SUPERSEDED;
  return null;
};

// Clean (unwatermarked) masters are DCC custody only; checked against the signed-in user, not caller-supplied meta
const assertCleanMasterAccess = async () => {
  const { default: useStore } = await import('../../../store/useStore');
  if (!isDccUser(useStore.getState().currentUser)) {
    throw new Error('สงวนสิทธิ์ดาวน์โหลดต้นฉบับไม่ติดลายน้ำเฉพาะ DCC เท่านั้น');
  }
  return useStore;
};

export class UniversalWatermarkService {
  static drawStandardIsoWatermark = drawStandardIsoWatermark;
  static generateWatermarkCanvas = generateWatermarkCanvas;
  static applyCanvasWatermarkToPdf = applyCanvasWatermarkToPdf;
  static drawIsoDiagonalWatermark = drawIsoDiagonalWatermark;
  static applyProgressiveSignatoryStamp = applyProgressiveSignatoryStamp;
  static getSignatoryTableDimensions = getSignatoryTableDimensions;
  static SIGNATORY_FONT_FAMILY = SIGNATORY_FONT_FAMILY;
  static PURE_BLACK = PURE_BLACK;
  static renderSignatoryText = renderSignatoryText;
  static WATERMARK_FONT_FAMILY = WATERMARK_FONT_FAMILY;
  static prepareMasterPdfForDownload = prepareMasterPdfForDownload;

  /**
   * Static helper for Bangkok timezone timestamp
   */
  static getBangkokTimestamp(dateInput = new Date()) {
    return getBangkokFormattedTimestamp(dateInput);
  }

  /**
   * Static helper for Bangkok timezone date
   */
  static getBangkokDate(dateInput = new Date()) {
    return getBangkokFormattedDate(dateInput);
  }

  /**
   * Helper: Check if document is an Active Form/Template that should bypass watermarking (Clean Form 100%)
   * ISO 9001: Forms must be 100% clean so staff can fill in or print/use immediately
   */
  static isBlankFormBypass(metadata = {}) {
    if (!metadata || typeof metadata !== 'object') return false;

    const docType = String(
      metadata.docType || 
      metadata.doc_type || 
      metadata.documentType || 
      metadata.document_type || 
      metadata.type || 
      metadata.category || 
      ''
    ).trim().toUpperCase();

    const docCode = String(
      metadata.docCode || 
      metadata.doc_code || 
      metadata.document_code || 
      metadata.documentCode || 
      metadata.edCode || 
      metadata.docNo || 
      metadata.code || 
      metadata.id || 
      metadata.title || 
      ''
    ).trim().toUpperCase();

    const status = String(metadata.status || '').trim().toUpperCase();

    // Check if form or template:
    // 1. Doc code starts with FM- or FM_ or is FM
    const isFormCode = docCode.startsWith('FM-') || docCode.startsWith('FM_') || docCode === 'FM' || /^FM\b/i.test(docCode);

    // 2. Doc type / category is FM, FORM, TEMPLATE
    const isFormType = ['FM', 'FORM', 'TEMPLATE'].includes(docType) || docType.startsWith('FM-');

    // Forms bypass watermarking only while current: obsolete or superseded forms must carry their stamp
    const isObsolete = status === 'OBSOLETE' || status === 'OBSOLETE_ARCHIVED' || Boolean(metadata.is_obsolete) || Boolean(metadata.isObsolete);
    const isSuperseded = status.startsWith('SUPERSEDED') || Boolean(metadata.is_superseded) || Boolean(metadata.isSuperseded);

    return (isFormCode || isFormType) && !isObsolete && !isSuperseded;
  }

  /**
   * Helper: Resolve raw PDF bytes from actual attached file (with JIT stamp for external docs)
   * or fallback to dummy generator.
   */
  static async resolveRawPdfBytes(doc, meta = {}) {
    let rawPdfBytes = null;
    try {
      if (doc instanceof ArrayBuffer) rawPdfBytes = doc;
      else if (doc instanceof Uint8Array) rawPdfBytes = doc.buffer;
      else if (typeof Blob !== 'undefined' && doc instanceof Blob) rawPdfBytes = await doc.arrayBuffer();
      else if (meta instanceof ArrayBuffer) rawPdfBytes = meta;
      else if (meta instanceof Uint8Array) rawPdfBytes = meta.buffer;
      else if (typeof Blob !== 'undefined' && meta instanceof Blob) rawPdfBytes = await meta.arrayBuffer();
      else if (doc?.fileBlob && typeof doc.fileBlob.arrayBuffer === 'function') rawPdfBytes = await doc.fileBlob.arrayBuffer();
      else if (doc?.fileData instanceof ArrayBuffer) rawPdfBytes = doc.fileData;
      else if (doc?.fileData instanceof Uint8Array) rawPdfBytes = doc.fileData.buffer;
      else if (doc?.fileData && typeof doc.fileData.arrayBuffer === 'function') rawPdfBytes = await doc.fileData.arrayBuffer();
      else if (doc?.originalPdfBytes instanceof ArrayBuffer) rawPdfBytes = doc.originalPdfBytes;
      else if (doc?.originalPdfBytes instanceof Uint8Array) rawPdfBytes = doc.originalPdfBytes.buffer;
      else if (doc?.file && typeof doc.file.arrayBuffer === 'function') rawPdfBytes = await doc.file.arrayBuffer();
      else if (meta?.fileBlob && typeof meta.fileBlob.arrayBuffer === 'function') rawPdfBytes = await meta.fileBlob.arrayBuffer();
      else if (meta?.fileData instanceof ArrayBuffer) rawPdfBytes = meta.fileData;
      else if (meta?.fileData instanceof Uint8Array) rawPdfBytes = meta.fileData.buffer;
      else if (meta?.fileData && typeof meta.fileData.arrayBuffer === 'function') rawPdfBytes = await meta.fileData.arrayBuffer();

      if (!rawPdfBytes) {
        const merged = { ...meta, ...doc };
        const docCodeFallback = doc?.fileId || doc?.file_id || doc?.attachedFile?.fileId || doc?.attachedFile?.id || doc?.edCode || doc?.doc_code || doc?.document_code || doc?.docNo || doc?.darId || doc?.id || meta?.docCode;
        const fileBlob = await resolveFileBlob(merged, docCodeFallback, { purpose: FILE_PURPOSE.DOWNLOAD });
        if (fileBlob) {
          rawPdfBytes = await fileBlob.arrayBuffer();
        }
      }
    } catch (err) {
      console.error("Failed to load attached file:", err);
      throw new Error('ไม่พบไฟล์เอกสารอ้างอิงจริง (Original file not found in storage)');
    }

    if (!rawPdfBytes || rawPdfBytes.byteLength === 0) {
      throw new Error('ไม่พบไฟล์เอกสารอ้างอิงจริง (Original file not found or corrupted)');
    }

    // PDF Byte Header Validation (Invariant 3 & PDF-Lib Safety)
    const uint8 = new Uint8Array(rawPdfBytes);
    if (uint8.length < 4 || uint8[0] !== 0x25 || uint8[1] !== 0x50 || uint8[2] !== 0x44 || uint8[3] !== 0x46) {
      throw new Error('ไฟล์ที่แนบมาไม่ใช่รูปแบบ PDF ที่ถูกต้อง (Invalid or corrupted PDF file: missing %PDF- header)');
    }

    const docCode = doc.edCode || doc.doc_code || doc.document_code || doc.title || meta.docCode || 'DOC-001';
    const isExternalDoc = Boolean(
      doc.isExternal ||
      doc.is_external ||
      meta.isExternal ||
      meta.is_external ||
      doc.edCode ||
      doc.origin === 'EXTERNAL' ||
      doc.sourceVersion ||
      docCode.startsWith('ED') ||
      docCode.startsWith('EXT')
    );

    if (isExternalDoc && rawPdfBytes) {
      try {
        const originRev = doc.sourceVersion || doc.edition || doc.originRev || doc.externalEdition || (doc.rev && doc.rev !== '00' && doc.rev !== 'Rev.00' ? doc.rev : null) || (doc.version && doc.version !== '00' && doc.version !== 'Rev.00' ? doc.version : null) || '-';
        const docTitle = doc.docTitle || doc.docName || doc.name || (doc.title !== docCode ? doc.title : '') || meta.docTitle || '';
        const effectiveDateFormatted = doc.effectiveDate 
          ? (typeof doc.effectiveDate === 'string' && doc.effectiveDate.includes('/') ? doc.effectiveDate : new Date(doc.effectiveDate).toLocaleDateString('th-TH')) 
          : new Date().toLocaleDateString('th-TH');
        const stampData = {
          docCode: docCode,
          docRev: originRev,
          title: docTitle || 'External Document',
          timestamp: effectiveDateFormatted,
          status: doc.status || meta.status || 'ACTIVE'
        };
        rawPdfBytes = await stampExternalDocumentTopRight(rawPdfBytes, stampData);
      } catch (err) {
        console.warn("Failed to JIT stamp external document:", err);
      }
    }

    return rawPdfBytes;
  }

  /**
   * Helper: Directly download clean (unwatermarked) PDF document in browser or open in new tab
   * Reserved for Active Forms / Templates (Bypass) and DCC Admin / Master Custodian (ISO 9001 Clause 7.5.3)
   */
  static async downloadCleanPdf(doc, meta = {}, openInTab = false) {
    const lifecycleType = lifecycleWatermarkType(doc);
    if (lifecycleType) return this.downloadWatermarkedPdf(doc, lifecycleType, { ...meta, isCleanMaster: false }, openInTab);

    const isForm = this.isBlankFormBypass({ ...doc, ...meta });
    const store = isForm ? null : await assertCleanMasterAccess();
    let rawPdfBytes = await this.resolveRawPdfBytes(doc, meta);

    const statusUpper = String(doc.status || meta.status || 'ACTIVE').toUpperCase();
    const isMasterDoc = SIGNED_OFF_STATUS.test(statusUpper) || doc.stage === 'MASTER' || meta.stage === 'MASTER';
    const docCode = doc.document_code || doc.doc_code || doc.edCode || doc.title || meta.docCode || 'DOCUMENT';
    const docTitle = doc.docTitle || doc.docName || doc.name || (doc.title !== docCode ? doc.title : '') || meta.docTitle || '';
    const isInternal = !doc.isExternal && doc.docType !== 'ED' && !String(docCode).startsWith('ED-') && !String(docCode).startsWith('EXT-');

    if (!isForm && isMasterDoc && isInternal) {
      try {
        const { resolveProgressiveSignatories } = await import('../utils/signatoryResolver');
        let relatedDar = doc.dar;
        let masterUsers = [];
        let users = [];
        try {
          const { default: useStore } = await import('../../../store/useStore');
          const store = useStore.getState();
          if (store) {
            masterUsers = store.masterUsers || [];
            users = store.users || [];
            if (!relatedDar && store.dars) {
              relatedDar = store.dars.find(d => 
                d.id === doc.darId || 
                d.darNumber === doc.darNumber || 
                d.docNo === docCode || 
                d.docCode === docCode ||
                d.title === docTitle
              );
            }
          }
        } catch {}

        const signatories = resolveProgressiveSignatories({
          dar: relatedDar || doc,
          masterDoc: doc,
          stage: 'MASTER',
          masterUsers,
          users,
          currentUser: meta.currentUser || { name: meta.userName, department: meta.userDept }
        });
        rawPdfBytes = await applyProgressiveSignatoryStamp(rawPdfBytes, signatories);
      } catch (err) {
        console.warn('[UniversalWatermarkService] downloadCleanPdf stamping warning:', err);
      }
    }

    store?.getState().logDocumentDownload?.(doc, 'CLEAN_MASTER', null);

    const blob = new Blob([rawPdfBytes], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);

    if (openInTab) {
      window.open(url, '_blank');
      return url;
    }

    const link = document.createElement('a');
    link.href = url;
    const filename = meta.filename || generateQmsDownloadName({
      docCode,
      title: docTitle,
      revision: doc.rev || doc.revision || doc.doc_version || meta.docVersion || '00',
      systemStatus: doc.status || meta.status || 'ACTIVE',
      isControlledPrint: !isForm
    });
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => {
      try {
        window.URL.revokeObjectURL(url);
      } catch { /* safe */ }
    }, 60000);
    return url;
  }

  /**
   * Helper: Directly download watermarked PDF in browser or open in new tab
   */
  static async downloadWatermarkedPdf(doc, watermarkType = WATERMARK_TYPES.UNCONTROLLED_COPY, meta = {}, openInTab = false) {
    const lifecycleType = lifecycleWatermarkType(doc);
    if (lifecycleType && lifecycleType !== watermarkType) {
      // Caller-supplied texts belong to the type it asked for, not the forced one
      const { mainText: _m, subLines: _s, customColor: _c, ...rest } = meta;
      watermarkType = lifecycleType;
      meta = { ...rest, isCleanMaster: false, downloadMode: lifecycleType, isControlledPrint: false };
    }
    const normWatermark = String(watermarkType || 'UNCONTROLLED').toUpperCase();
    const isCleanMode = Boolean(
      meta.isCleanMaster || 
      normWatermark === 'CLEAN' || 
      normWatermark === 'CLEAN_MASTER' || 
      normWatermark === 'MASTER_CLEAN'
    );

    const isFormBypass = this.isBlankFormBypass({ ...doc, ...meta });
    if (isCleanMode && !isFormBypass) await assertCleanMasterAccess();
    if (isFormBypass && watermarkType !== WATERMARK_TYPES.OBSOLETE && watermarkType !== 'OBSOLETE' && !isCleanMode) {
      return await this.downloadCleanPdf(doc, { ...doc, ...meta }, openInTab);
    }

    const docCode = doc.docCode || doc.doc_code || doc.document_code || doc.docNo || doc.code || doc.edCode || meta.docCode || doc.title || 'DOC-001';
    const docTitle = doc.docTitle || doc.docName || doc.name || (doc.title !== docCode ? doc.title : '') || meta.docTitle || '';

    let rawPdfBytes = await this.resolveRawPdfBytes(doc, meta);

    // Sequential Stamping Pipeline:
    // Step 1 (Signatures Burn-in): If master document is ACTIVE, EFFECTIVE, APPROVED, or stage === 'MASTER'
    const statusUpper = String(doc.status || meta.status || 'ACTIVE').toUpperCase();
    const isMasterDoc = SIGNED_OFF_STATUS.test(statusUpper) || doc.stage === 'MASTER' || meta.stage === 'MASTER';
    const isInternal = !doc.isExternal && doc.docType !== 'ED' && !String(docCode).startsWith('ED-') && !String(docCode).startsWith('EXT-');

    if (isMasterDoc && isInternal) {
      try {
        const { resolveProgressiveSignatories } = await import('../utils/signatoryResolver');
        let relatedDar = doc.dar;
        let masterUsers = [];
        let users = [];
        try {
          const { default: useStore } = await import('../../../store/useStore');
          const store = useStore.getState();
          if (store) {
            masterUsers = store.masterUsers || [];
            users = store.users || [];
            if (!relatedDar && store.dars) {
              relatedDar = store.dars.find(d => 
                d.id === doc.darId || 
                d.darNumber === doc.darNumber || 
                d.docNo === docCode || 
                d.docCode === docCode ||
                d.title === docTitle
              );
            }
          }
        } catch {}

        const signatories = resolveProgressiveSignatories({
          dar: relatedDar || doc,
          masterDoc: doc,
          stage: 'MASTER',
          masterUsers,
          users,
          currentUser: meta.currentUser || { name: meta.userName, department: meta.userDept }
        });
        rawPdfBytes = await applyProgressiveSignatoryStamp(rawPdfBytes, signatories);
      } catch (err) {
        console.warn('[UniversalWatermarkService] Stamping 3x3 table on download warning:', err);
      }
    }

    let finalPdfBytes = rawPdfBytes;
    if (!isCleanMode && normWatermark !== 'NONE') {
      finalPdfBytes = await drawStandardIsoWatermark(rawPdfBytes, watermarkType, {
        ...doc,
        docCode,
        docTitle,
        docVersion: doc.rev || doc.revision || doc.doc_version || meta.docVersion,
        docType: doc.docType || doc.doc_type || doc.documentType || doc.type || (docCode || '').split('-')[0],
        documentType: doc.documentType || doc.docType || doc.doc_type,
        category: doc.category,
        type: doc.type,
        status: doc.status || meta.status || 'ACTIVE',
        userName: meta.userName,
        userDept: meta.userDept || doc.department,
        effectiveDate: doc.effectiveDate || meta.effectiveDate,
        ...meta
      });
    }

    const isControlled = !normWatermark.includes('UNCONTROLLED') && (
      watermarkType === WATERMARK_TYPES.CONTROLLED_COPY || 
      watermarkType === 'CONTROLLED_COPY' || 
      watermarkType === 'CONTROLLED' ||
      watermarkType === WATERMARK_TYPES.CONTROLLED ||
      watermarkType === WATERMARK_TYPES.CONTROLLED_COPY_REPLACEMENT ||
      watermarkType === 'CONTROLLED_COPY_REPLACEMENT' ||
      normWatermark.startsWith('CONTROLLED') ||
      watermarkType === WATERMARK_TYPES.OFFICIAL_MASTER_COPY || 
      watermarkType === 'OFFICIAL_MASTER_COPY' ||
      meta.downloadMode === 'CONTROLLED_COPY' || 
      meta.downloadMode === 'CONTROLLED' || 
      Boolean(meta.isControlledPrint)
    );

    // Audit Trail Logging: Record download history into Store
    try {
      const { default: useStore } = await import('../../../store/useStore');
      const store = useStore.getState();
      if (store && typeof store.logDocumentDownload === 'function') {
        store.logDocumentDownload(
          doc,
          isCleanMode ? 'CLEAN_MASTER' : (isControlled ? 'CONTROLLED' : 'UNCONTROLLED'),
          meta.currentUser || { name: meta.userName, department: meta.userDept }
        );
      }
    } catch (auditErr) {
      console.warn('[UniversalWatermarkService] Audit log warning:', auditErr);
    }

    const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);

    if (openInTab) {
      window.open(url, '_blank');
      return url;
    }

    const link = document.createElement('a');
    link.href = url;
      
    const resolvedStatus = doc.status || meta.status || (
      watermarkType === WATERMARK_TYPES.OBSOLETE || watermarkType === 'OBSOLETE' 
        ? 'OBSOLETE' 
        : (watermarkType === WATERMARK_TYPES.SUPERSEDED || watermarkType === 'SUPERSEDED' 
            ? 'SUPERSEDED' 
            : 'ACTIVE')
    );

    const filename = meta.filename || generateQmsDownloadName({
      docCode,
      title: docTitle,
      revision: doc.rev || doc.revision || doc.doc_version || meta.docVersion || '00',
      systemStatus: resolvedStatus,
      isControlledPrint: isControlled,
      isCleanMaster: isCleanMode,
      watermarkType: isCleanMode ? 'CLEAN_MASTER' : watermarkType
    });
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => {
      try {
        window.URL.revokeObjectURL(url);
      } catch { /* safe */ }
    }, 60000);
    return url;
  }

  /**
   * Universal PDF Generation & Download Helper
   * Automatically resolves watermark config if not explicitly provided
   */
  static async generateAndDownloadPdf(doc, watermarkConfigOrType, options = {}, openInTab = false) {
    let watermarkType = WATERMARK_TYPES.UNCONTROLLED_COPY;
    let extraMeta = { ...options };

    if (watermarkConfigOrType && typeof watermarkConfigOrType === 'object' && (watermarkConfigOrType.type || watermarkConfigOrType.mainText || watermarkConfigOrType.watermarkType)) {
      watermarkType = watermarkConfigOrType.watermarkType || watermarkConfigOrType.type;
      extraMeta = {
        ...watermarkConfigOrType.metadata,
        mainText: watermarkConfigOrType.mainText,
        subLines: watermarkConfigOrType.subLines,
        customColor: watermarkConfigOrType.color,
        ...options
      };
    } else if (typeof watermarkConfigOrType === 'string') {
      watermarkType = watermarkConfigOrType;
    } else {
      const resolved = resolveWatermarkConfig(doc, options);
      watermarkType = resolved.watermarkType || resolved.type;
      extraMeta = {
        ...resolved.metadata,
        mainText: resolved.mainText,
        subLines: resolved.subLines,
        customColor: resolved.color,
        ...options
      };
    }

    return await this.downloadWatermarkedPdf(doc, watermarkType, extraMeta, openInTab);
  }

  /**
   * Resolve Watermark configuration for a document and context
   */
  static resolveWatermarkConfig(doc, options = {}) {
    return resolveWatermarkConfig(doc, options);
  }

  /**
   * Build Watermark Sub-Lines strictly separated by status
   */
  static buildWatermarkSubLines(doc = {}, watermarkType = 'UNCONTROLLED', options = {}) {
    return buildWatermarkSubLines(doc, watermarkType, options);
  }
}

/**
 * สร้างรายการข้อความบรรทัดย่อยใต้ลายน้ำตามประเภทสถานะเอกสาร
 * Strict separation: OBSOLETE (Cancelled) vs SUPERSEDED (Outdated revision)
 */
export const buildWatermarkSubLines = (doc = {}, watermarkType = 'UNCONTROLLED', options = {}) => {
  const isExternal = Boolean(
    options.isExternal ||
    doc?.isExternal ||
    doc?.is_external ||
    doc?.documentCategory === 'EXTERNAL' ||
    doc?.docCategory === 'EXTERNAL' ||
    doc?.category === 'EXTERNAL' ||
    doc?.type === 'EXTERNAL' ||
    (doc?.edCode && !doc?.doc_code)
  );

  const docCode = doc?.document_code || doc?.doc_code || doc?.edCode || doc?.title || doc?.id || '-';
  const docRev = String(doc?.revision || doc?.rev || doc?.doc_version || '00').replace(/^REV\.?/i, '').padStart(2, '0');
  const extVersion = doc?.sourceVersion || doc?.source_version || doc?.edition || doc?.version || doc?.externalVersion || '-';
  const extIssueDate = doc?.effectiveDate || doc?.effective_date || doc?.issueDate || doc?.issue_date || '-';
  const nowStr = (options.timestamp || getBangkokFormattedTimestamp(new Date())).split(' ')[0] || new Date().toISOString().split('T')[0];
  const userStr = options.currentUser?.name 
    ? `${options.currentUser.name} (${options.currentUser.department || options.currentUser.dept || 'HQ'})` 
    : (options.userName ? `${options.userName} (${options.userDept || 'HQ'})` : 'QMS System');

  const normalizedType = (watermarkType || '').toUpperCase();

  // 🌐 EXTERNAL DOCUMENT BRANCH (No internal Rev whatsoever)
  if (isExternal) {
    if (
      normalizedType === 'OBSOLETE' || 
      doc?.status?.toUpperCase().startsWith('OBSOLETE') || 
      doc?.is_obsolete
    ) {
      return [
        'เอกสารภายนอก - ยกเลิกใช้งาน (OBSOLETE EXTERNAL DOCUMENT)',
        `Doc: ${docCode} | Ver/Ed: ${extVersion}`,
        `วันที่ออกเอกสารต้นทาง: ${extIssueDate} | วันที่บันทึกยกเลิก: ${nowStr}`,
        `Printed By: ${userStr}`,
      ];
    }

    if (
      normalizedType === 'SUPERSEDED' || 
      doc?.status?.toUpperCase().startsWith('SUPERSEDED') || 
      doc?.is_superseded || 
      options.isHistoricalRev
    ) {
      const nextEd = doc?.superseded_by_edition || doc?.superseded_by_rev || options.supersededByRev || doc?.nextVersion || 'ฉบับใหม่';
      return [
        'เอกสารภายนอกฉบับเดิมตกรุ่น (SUPERSEDED EXTERNAL DOCUMENT)',
        `Doc: ${docCode} | Ver/Ed: ${extVersion}`,
        `แทนที่โดยฉบับ: ${nextEd} | วันที่: ${nowStr}`,
        `Printed By: ${userStr}`,
      ];
    }

    return [
      'เอกสารภายนอกสำหรับอ้างอิง (EXTERNAL DOCUMENT - FOR REFERENCE ONLY)',
      `Doc: ${docCode} | Ver/Ed: ${extVersion} | ปรับปรุงล่าสุด: ${extIssueDate}`,
      `Downloaded By: ${userStr} | Date: ${nowStr}`,
      '*ขึ้นทะเบียนควบคุมแล้ว (REGISTERED) - FOR REFERENCE ONLY*'
    ];
  }

  // 🚫 1. กรณีเอกสารยกเลิก (OBSOLETE) — ห้ามมีคำว่า "Superseded By" เด็ดขาด 100%!
  if (
    normalizedType === 'OBSOLETE' || 
    doc?.status?.toUpperCase().startsWith('OBSOLETE') || 
    doc?.is_obsolete
  ) {
    const darRef = doc?.obsolete_dar_id || doc?.obsolete_dar_no || doc?.dar_id || doc?.dar_no || doc?.darId || doc?.darNo || 'DAR-OBSOLETE';
    return [
      'เอกสารยกเลิก - ห้ามนำไปปฏิบัติงาน (CANCELLED DOCUMENT)',
      `Doc: ${docCode} | Rev: Rev.${docRev}`,
      `Obsolete DAR Ref: ${darRef} | Date: ${nowStr}`,
      `Printed By: ${userStr}`,
    ];
  }

  // ⏳ 2. กรณีเอกสารตกรุ่นจากการ Revise (SUPERSEDED) — มีคำว่า Superseded By ได้
  if (
    normalizedType === 'SUPERSEDED' || 
    doc?.status?.toUpperCase().startsWith('SUPERSEDED') || 
    doc?.is_superseded || 
    options.isHistoricalRev
  ) {
    const nextRev = doc?.superseded_by_rev || options.supersededByRev || doc?.nextVersion || 'Latest';
    return [
      'เอกสารฉบับเดิมตกรุ่น - ใช้อ้างอิงประวัติเท่านั้น (SUPERSEDED REVISION)',
      `Doc: ${docCode} | Rev: Rev.${docRev}`,
      `Superseded By: Rev.${nextRev} | Date: ${nowStr}`,
      `Printed By: ${userStr}`,
    ];
  }

  // 🖨️ 3. กรณีสำเนาควบคุม (CONTROLLED COPY)
  if (
    normalizedType === 'CONTROLLED' || 
    normalizedType === 'CONTROLLED_COPY' || 
    options.copyInfo || 
    options.isControlledCopy
  ) {
    const copyInfo = options.copyInfo || {};
    return [
      'OFFICIAL CONTROLLED COPY — DO NOT DUPLICATE',
      `Doc: ${docCode} | Rev.${docRev}`,
      `Copy: ${copyInfo.copy_number || copyInfo.copy_no || copyInfo.ccNumber || 'Copy 01'} | Station: ${cleanLocationName(copyInfo.station_name || copyInfo.location || copyInfo.locationName || 'จุดใช้งาน')}`,
      `Issued Date: ${nowStr} | Issuer: ${userStr}`,
    ];
  }

  // 📄 4. กรณีเอกสารใช้งานทั่วไป (UNCONTROLLED COPY)
  const docTitle = doc?.docTitle || doc?.docName || doc?.name || (doc?.title !== docCode ? doc?.title : '') || options?.docTitle || '';
  const titlePart = docTitle ? ` | Title: ${docTitle}` : '';
  const isRestricted = Boolean(
    doc?.accessScope === 'Restricted' || 
    doc?.access_scope === 'Restricted' || 
    doc?.accessScope === 'RESTRICTED' || 
    doc?.access_scope === 'RESTRICTED' ||
    doc?.isRestricted ||
    options?.isRestricted
  );
  const restrictedSuffix = isRestricted ? ' [RESTRICTED ACCESS]' : '';
  const userDept = options.currentUser?.department || options.currentUser?.dept || options.userDept || doc?.department || 'HQ';
  const userName = options.currentUser?.name || options.currentUser?.username || options.userName || 'Authorized User';

  return [
    `Doc: ${docCode}${titlePart} | Rev.${docRev}${restrictedSuffix}`,
    `Downloaded By: ${userName} (${userDept}) | Date: ${nowStr}`,
    '*UNCONTROLLED COPY - FOR REFERENCE ONLY - DO NOT DUPLICATE*'
  ];
};

/**
 * Universal Watermark Config Resolver
 * Determines correct watermark preset, main text, colors, sub-lines, and metadata based on document state
 */
export const resolveWatermarkConfig = (doc = {}, options = {}) => {
  const isExternal = Boolean(
    options.isExternal ||
    doc?.isExternal ||
    doc?.is_external ||
    doc?.documentCategory === 'EXTERNAL' ||
    doc?.docCategory === 'EXTERNAL' ||
    doc?.category === 'EXTERNAL' ||
    doc?.type === 'EXTERNAL' ||
    (doc?.edCode && !doc?.doc_code)
  );
  const status = (doc?.status || '').toUpperCase();
  const currentUser = options.currentUser || {};
  const copyInfo = options.copyInfo || null;
  const nowStr = getBangkokFormattedTimestamp(new Date());

  const docCode = doc?.document_code || doc?.doc_code || doc?.docCode || doc?.title || doc?.edCode || 'DOC-001';
  const extVersion = doc?.sourceVersion || doc?.source_version || doc?.edition || doc?.version || doc?.externalVersion || '-';
  const docVersion = isExternal ? extVersion : String(doc?.revision || doc?.rev || doc?.doc_version || doc?.docVersion || '00').replace(/^REV\.?/i, '').padStart(2, '0');
  const userDisplayName = currentUser.name || currentUser.username || options.userName || 'User';
  const userDept = currentUser.department || currentUser.dept || options.userDept || doc?.department || 'HQ';

  // 1. Controlled Copy (internal documents only)
  if (!isExternal && copyInfo && (copyInfo.copy_number || copyInfo.copy_no || copyInfo.ccNumber || options.isControlledCopy)) {
    const copyNum = copyInfo.copy_number || copyInfo.copy_no || copyInfo.ccNumber || '01';
    const copyDept = copyInfo.holder_dept || copyInfo.department || copyInfo.holderDept || '-';
    const station = copyInfo.station_name || copyInfo.location || copyInfo.locationName || copyInfo.station || '-';
    const dccName = currentUser.name || options.dccName || 'DCC System';

    return {
      type: 'CONTROLLED',
      watermarkType: WATERMARK_TYPES.CONTROLLED_COPY,
      mainText: 'CONTROLLED COPY',
      color: '#2563EB', // Cobalt Blue
      subLines: buildWatermarkSubLines(doc, 'CONTROLLED', { ...options, copyInfo, currentUser, isExternal }),
      metadata: {
        docCode,
        docVersion,
        copyNo: copyNum,
        holderDept: copyDept,
        location: station,
        issuedBy: dccName,
        timestamp: nowStr
      }
    };
  }

  // 2. กรณีเป็นเอกสารขอยกเลิกถาวร (OBSOLETE)
  if (
    status === 'OBSOLETE' ||
    status === 'OBSOLETE_ARCHIVED' ||
    status === 'ARCHIVED_OBSOLETE' ||
    status === 'OBSOLETE_PENDING_RECALL' ||
    status.startsWith('OBSOLETE') ||
    doc?.is_obsolete
  ) {
    const obsoleteDarRef = doc?.obsolete_dar_id || doc?.obsolete_dar_no || doc?.dar_id || doc?.darId || doc?.darNo || (isExternal ? 'ED-OBSOLETE' : 'DAR-OBSOLETE');

    return {
      type: 'OBSOLETE',
      watermarkType: WATERMARK_TYPES.OBSOLETE,
      mainText: isExternal ? 'OBSOLETE (CANCELLED)' : 'OBSOLETE - DO NOT USE',
      color: '#DC2626', // Crimson Red
      subLines: buildWatermarkSubLines(doc, 'OBSOLETE', { ...options, currentUser, isExternal }),
      metadata: {
        docCode,
        docVersion,
        obsoleteDarId: obsoleteDarRef,
        darNo: obsoleteDarRef,
        userName: userDisplayName,
        userDept,
        timestamp: nowStr,
        isExternal
      }
    };
  }

  // 3. กรณีเป็นฉบับเดิมตกรุ่นจากการ Revise / Update (SUPERSEDED)
  if (
    status === 'SUPERSEDED' ||
    status === 'SUPERSEDED_ARCHIVED' ||
    status === 'OUTDATED' ||
    Boolean(doc?.is_superseded) ||
    options.isHistoricalRev
  ) {
    const nextRev = doc?.superseded_by_edition || doc?.superseded_by_rev || doc?.nextVersion || (isExternal ? 'ฉบับใหม่' : 'Latest');

    return {
      type: 'SUPERSEDED',
      watermarkType: WATERMARK_TYPES.SUPERSEDED,
      mainText: 'SUPERSEDED - FOR REFERENCE ONLY',
      color: '#D97706', // Amber / Orange
      subLines: buildWatermarkSubLines(doc, 'SUPERSEDED', { ...options, currentUser, isExternal }),
      metadata: {
        docCode,
        docVersion,
        supersededByRev: nextRev,
        nextVersion: nextRev,
        userName: userDisplayName,
        userDept,
        timestamp: nowStr,
        isExternal
      }
    };
  }

  // 4. External Registered or Default: Active / Reference Uncontrolled Copy
  if (isExternal) {
    return {
      type: 'EXTERNAL_ACTIVE',
      watermarkType: WATERMARK_TYPES.EXTERNAL_ACTIVE || 'EXTERNAL_ACTIVE',
      mainText: 'EXTERNAL DOCUMENT - FOR REFERENCE ONLY',
      color: '#4F46E5', // Indigo
      subLines: buildWatermarkSubLines(doc, 'EXTERNAL_ACTIVE', { ...options, currentUser, isExternal }),
      metadata: {
        docCode,
        docVersion,
        sourceVersion: extVersion,
        userName: userDisplayName,
        userDept,
        timestamp: nowStr,
        isExternal: true
      }
    };
  }

  return {
    type: 'UNCONTROLLED',
    watermarkType: WATERMARK_TYPES.UNCONTROLLED_COPY,
    mainText: 'UNCONTROLLED COPY',
    color: '#EA580C', // Rust Orange
    subLines: buildWatermarkSubLines(doc, 'UNCONTROLLED', { ...options, currentUser }),
    metadata: {
      docCode,
      docVersion,
      userName: userDisplayName,
      userDept,
      timestamp: nowStr
    }
  };
};

/**
 * Get Watermark overlay configuration based on document lifecycle status
 * @param {string} status - e.g. 'SUPERSEDED', 'OBSOLETE', 'EFFECTIVE'
 * @returns {{ text?: string, color?: string, visible: boolean }}
 */
export const getWatermarkConfig = (status) => {
  const norm = (status || '').toUpperCase();
  switch (norm) {
    case 'SUPERSEDED':
    case 'SUPERSEDED_ARCHIVED':
      return { text: 'SUPERSEDED / ฉบับตกรุ่น', color: 'rgba(234, 88, 12, 0.28)', visible: true };
    case 'OBSOLETE':
    case 'OBSOLETE_ARCHIVED':
      return { text: 'OBSOLETE / ยกเลิกการใช้งาน', color: 'rgba(220, 38, 38, 0.35)', visible: true };
    default:
      if (norm.startsWith('OBSOLETE')) {
        return { text: 'OBSOLETE / ยกเลิกการใช้งาน', color: 'rgba(220, 38, 38, 0.35)', visible: true };
      }
      return { visible: false };
  }
};

/**
 * Stamping engine for SUPERSEDED historical document versions
 * Conforms to ISO 9001 Clause 7.5.3: Outdated historical revisions must bear
 * high-visibility red SUPERSEDED watermark with former revision, replacement revision, and date.
 *
 * @param {Blob|File|ArrayBuffer|Uint8Array} rawPdfFile
 * @param {Object} options - { documentCode, formerRev, replacedByRev, effectiveDate, userName, userDept }
 * @returns {Promise<Blob>} Stamped PDF Blob
 */
export const applySupersededWatermark = async (rawPdfFile, options = {}) => {
  let rawPdfBytes = null;
  if (typeof Blob !== 'undefined' && rawPdfFile instanceof Blob) {
    rawPdfBytes = await rawPdfFile.arrayBuffer();
  } else if (rawPdfFile instanceof ArrayBuffer) {
    rawPdfBytes = rawPdfFile;
  } else if (rawPdfFile instanceof Uint8Array) {
    rawPdfBytes = rawPdfFile.buffer;
  } else if (rawPdfFile && typeof rawPdfFile.arrayBuffer === 'function') {
    rawPdfBytes = await rawPdfFile.arrayBuffer();
  } else {
    throw new Error('Invalid PDF file provided to applySupersededWatermark');
  }

  const docCode = options.documentCode || options.docCode || options.code || options.title || 'DOCUMENT';
  const formerRev = String(options.formerRev ?? options.revision ?? options.rev ?? '00').replace(/^rev\.?/i, '').padStart(2, '0');
  const replacedByRev = String(options.replacedByRev ?? options.supersededByRev ?? options.nextRev ?? 'Latest').replace(/^rev\.?/i, '');
  const effDate = options.effectiveDate || options.effective_date || options.date || new Date().toLocaleDateString('th-TH');

  const meta = {
    ...options,
    docCode,
    documentCode: docCode,
    revNo: formerRev,
    revision: formerRev,
    formerRev,
    replacedByRev,
    supersededByRev: replacedByRev,
    effectiveDate: effDate,
    status: 'SUPERSEDED',
    watermarkType: 'SUPERSEDED',
    userName: options.userName || 'DCC Officer',
    userDept: options.userDept || 'DC'
  };

  const stampedBytes = await drawStandardIsoWatermark(rawPdfBytes, WATERMARK_TYPES.SUPERSEDED, meta);
  const finalBytes = (stampedBytes && typeof stampedBytes.save === 'function')
    ? await stampedBytes.save()
    : stampedBytes;

  return new Blob([finalBytes], { type: 'application/pdf' });
};

UniversalWatermarkService.getWatermarkConfig = getWatermarkConfig;
UniversalWatermarkService.applySupersededWatermark = applySupersededWatermark;

export default UniversalWatermarkService;

