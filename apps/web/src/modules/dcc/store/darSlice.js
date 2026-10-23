/**
 * DAR (Document Action Request) Zustand Slice
 * Extracted from useStore.js (Phase 5 Refactor)
 */
import toast from 'react-hot-toast';
import { getFile, saveFile, resolveFileBlob } from '../utils/fileStorage';
import { applyProgressiveSignatoryStamp } from '../utils/pdfStamper';
import { resolveProgressiveSignatories } from '../utils/signatoryResolver';
import { resolveReviewer, resolveApprover } from '../utils/workflowResolver';
import { getActiveDarForDocument } from '../utils/workflowHelpers';
import { calculateTaskDueDate } from '../utils/slaCalculator';
import { generateInternalDarNumber } from '../utils/darNumberGenerator';
import { getCleanDept } from '../utils/domainNormalizer';
import {
  formatDocumentRunningNumber,
  calculateNextDocumentSequence,
  checkDocumentCodeCollision,
  calculateCopyAllocations,
  cleanLocationName
} from '../services/MasterDataService';
import { syncRevisionEffective as syncRevisionEffectiveService, syncObsoleteCompleted as syncObsoleteCompletedService } from '../services/PeriodicReviewDarLinkService';
import { cleanupDccTasks, buildControlledCopyId, sanitizeControlledCopies, resolveDarDocumentCode } from './controlledCopySlice';
import { generateDynamicWorkflow } from '../utils/workflowEngine';
import { addYears, getReviewCycleYears } from '../utils/documentUtils';
import { resolveDccAdminUserId } from './externalDocSlice';
import { isApiMode } from '../../../api/client';

// Re-export helper
export { generateInternalDarNumber };
export const generateNextDarNumber = generateInternalDarNumber;

export const syncCompletedDarToMasterDocuments = (dar, currentDocs = []) => {
  if (!dar) return currentDocs;
  const now = new Date().toISOString();
  const darType = String(dar.type || dar.requestType || dar.darType || '').toUpperCase();
  const targetDocCode = dar.docNo || dar.document_code || dar.doc_code || dar.docCode || dar.docIdInput || dar.code || dar.title;
  if (!targetDocCode) return currentDocs;

  const oldDoc = currentDocs.find(d => {
    const code = d.docNo || d.document_code || d.doc_code || d.code || d.docCode || d.title;
    return code && code.trim().toLowerCase() === targetDocCode.trim().toLowerCase() && (d.status === 'EFFECTIVE' || d.status === 'ACTIVE' || d.is_active);
  }) || currentDocs.find(d => {
    const code = d.docNo || d.document_code || d.doc_code || d.code || d.docCode || d.title;
    return code && code.trim().toLowerCase() === targetDocCode.trim().toLowerCase();
  });

  const oldRev = dar.currentRevision || dar.previous_revision || dar.previousRev || (oldDoc ? (oldDoc.revision || oldDoc.rev || oldDoc.doc_version || oldDoc.version) : '00');
  const currentRevNum = parseInt(String(oldRev).replace(/\D/g, ''), 10) || 0;
  const newRevNum = currentRevNum + 1;
  const defaultNextRev = newRevNum < 10 ? `0${newRevNum}` : `${newRevNum}`;

  const rawTarget = dar.targetRevision || dar.newRevision || dar.newRev || dar.targetRev || dar.proposedRev;
  let nextRevision;
  if (rawTarget) {
    const clean = String(rawTarget).replace(/^rev\.?/i, '').trim();
    nextRevision = clean.length === 1 ? `0${clean}` : clean;
  } else if (dar.rev && String(dar.rev).replace(/^rev\.?/i, '').trim() !== String(oldRev).replace(/^rev\.?/i, '').trim()) {
    const clean = String(dar.rev).replace(/^rev\.?/i, '').trim();
    nextRevision = clean.length === 1 ? `0${clean}` : clean;
  } else if (dar.revision && String(dar.revision).replace(/^rev\.?/i, '').trim() !== String(oldRev).replace(/^rev\.?/i, '').trim()) {
    const clean = String(dar.revision).replace(/^rev\.?/i, '').trim();
    nextRevision = clean.length === 1 ? `0${clean}` : clean;
  } else {
    nextRevision = defaultNextRev;
  }

  let updatedMasterDocs = [...currentDocs];

  if (darType === 'REVISE' || darType === 'REVISION' || darType === 'REVISE_DOCUMENT') {
    // 1. ปรับฉบับเดิมของรหัสเอกสารนี้ที่มีสถานะ ACTIVE / EFFECTIVE ให้กลายเป็น SUPERSEDED
    updatedMasterDocs = updatedMasterDocs.map(doc => {
      const code = doc.docNo || doc.document_code || doc.doc_code || doc.code || doc.docCode || doc.title;
      const isMatchCode = code && code.trim().toLowerCase() === targetDocCode.trim().toLowerCase();
      const isActive = doc.status === 'ACTIVE' || doc.status === 'EFFECTIVE' || doc.is_active;
      const isOldRev = String(doc.revision || doc.rev || doc.doc_version || doc.version).replace(/^rev\.?/i, '').trim() !== String(nextRevision).replace(/^rev\.?/i, '').trim();

      if (isMatchCode && isActive && isOldRev) {
        const prevRev = String(doc.revision || doc.rev || doc.doc_version || doc.version || '00').replace(/^rev\.?/i, '').trim();
        return {
          ...doc,
          id: `${targetDocCode}_REV_${prevRev}_${Date.now()}`,
          status: 'SUPERSEDED',
          is_active: false,
          is_superseded: true,
          isLocked: false,
          hasPendingDar: false,
          supersededAt: now,
          superseded_at: now,
          supersededByRev: nextRevision,
          supersededByDar: dar.darNo || dar.darNumber || dar.id,
          superseded_by: `${targetDocCode} Rev.${nextRevision}`,
          darRef: doc.darRef || doc.darId || dar.darNo || dar.darNumber || dar.id,
          periodic_reviews: doc.periodic_reviews || []
        };
      }
      if (isMatchCode) {
        return {
          ...doc,
          isLocked: false,
          hasPendingDar: false
        };
      }
      return doc;
    });

    // 2. ตรวจสอบว่ามี Record ของฉบับใหม่นี้อยู่แล้วหรือไม่
    const existingNewDocIndex = updatedMasterDocs.findIndex(
      doc => {
        const code = doc.docNo || doc.document_code || doc.doc_code || doc.code || doc.docCode || doc.title;
        const isMatchCode = code && code.trim().toLowerCase() === targetDocCode.trim().toLowerCase();
        const docRev = String(doc.revision || doc.rev || doc.doc_version || doc.version).replace(/^rev\.?/i, '').trim();
        return isMatchCode && docRev === String(nextRevision).replace(/^rev\.?/i, '').trim();
      }
    );

    const isFormDoc = Boolean(
      dar.docType === 'FM' ||
      dar.doc_type === 'FM' ||
      dar.type === 'FM' ||
      oldDoc?.docType === 'FM' ||
      String(targetDocCode).startsWith('FM')
    );

    const effectiveDateStr = dar.effectiveDate || dar.effective_date || now.split('T')[0];
    const cycleYears = dar.review_cycle_years || oldDoc?.review_cycle_years || getReviewCycleYears(dar.documentType || dar.docType || dar.type || targetDocCode?.split('-')[0]);

    const newDocumentRecord = {
      id: `DOC-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      darId: dar.id,
      origin_dar_id: dar.id,
      darNumber: dar.darNumber || dar.darNo || dar.id,
      latestDarNo: dar.darNo || dar.darNumber || dar.id,
      docNo: dar.docNo || targetDocCode,
      document_code: targetDocCode,
      doc_code: targetDocCode,
      code: targetDocCode,
      docCode: targetDocCode,
      title: dar.docTitle || dar.title || (oldDoc ? oldDoc.title : targetDocCode),
      name: dar.docTitle || dar.title || (oldDoc ? (oldDoc.name || oldDoc.title) : targetDocCode),
      docName: dar.docTitle || dar.title || (oldDoc ? (oldDoc.docName || oldDoc.title) : targetDocCode),
      docTitle: dar.docTitle || dar.title || (oldDoc ? oldDoc.docTitle : targetDocCode),
      revision: nextRevision,
      rev: nextRevision,
      doc_version: nextRevision,
      version: nextRevision,
      department: dar.department || oldDoc?.department || 'PD',
      type: dar.documentType || dar.docType || dar.type || (oldDoc?.type || (targetDocCode ? targetDocCode.split('-')[0] : 'SOP')),
      status: 'EFFECTIVE',
      is_active: true,
      is_superseded: false,
      is_obsolete: false,
      isLocked: false,
      hasPendingDar: false,
      effectiveDate: effectiveDateStr,
      effective_date: effectiveDateStr,
      accessScope: dar.accessScope || dar.access_control?.scope || 'GENERAL',
      access_control: dar.access_control || oldDoc?.access_control || { scope: dar.accessScope || 'GENERAL' },
      targetDepartments: dar.targetDepartments || dar.target_departments || [],
      confidentialityLevel: dar.confidentialityLevel || 'INTERNAL',
      controlledCopy: isFormDoc ? 0 : (oldDoc?.controlledCopy || 0),
      distributions: isFormDoc ? [] : (dar.distributions && dar.distributions.length > 0 ? dar.distributions : (oldDoc?.distributions || [])),
      pdfUrl: dar.pdfUrl || dar.fileUrl || '/mock.pdf',
      review_cycle_years: cycleYears,
      last_reviewed_at: now,
      next_review_date: addYears(effectiveDateStr, cycleYears),
      review_status: 'UP_TO_DATE',
      periodic_reviews: [], // เริ่มนับประวัติรอบใหม่สำหรับเวอร์ชันใหม่
      published_at: now,
      updatedAt: now,
      createdAt: now
    };

    if (existingNewDocIndex >= 0) {
      updatedMasterDocs[existingNewDocIndex] = {
        ...updatedMasterDocs[existingNewDocIndex],
        ...newDocumentRecord,
        status: 'EFFECTIVE',
        is_active: true
      };
    } else {
      updatedMasterDocs.unshift(newDocumentRecord);
    }
  } else if (darType === 'OBSOLETE' || darType === 'CANCEL' || darType === 'OBSOLETE_DOCUMENT') {
    updatedMasterDocs = updatedMasterDocs.map(doc => {
      const code = doc.docNo || doc.document_code || doc.doc_code || doc.code || doc.docCode || doc.title;
      const isMatchCode = code && code.trim().toLowerCase() === targetDocCode.trim().toLowerCase();
      if (isMatchCode) {
        return {
          ...doc,
          status: 'OBSOLETE',
          is_active: false,
          is_obsolete: true,
          isLocked: false,
          hasPendingDar: false,
          obsoleteAt: now,
          obsolete_at: now,
          obsoleteDarRef: dar.darNo || dar.darNumber || dar.id,
          obsoleteReason: dar.reason || dar.obsolete_reason || dar.remarks || dar.description || '-',
          periodic_reviews: doc.periodic_reviews || []
        };
      }
      return doc;
    });
  }

  return updatedMasterDocs;
};

export const createDarSlice = (set, get) => ({
  // DAR State
  dars: [],
  darRequests: [],
  darDrafts: {},
  activeDarId: null,
  darAuditTrail: [],
  darTimeline: [],
  darHistory: [],

  // Aliases & Convenience Methods (Backward Compatibility)
  createDarDraft: (draftData) => get().saveDarDraft(draftData),
  deleteDarDraft: (darId) => get().deleteDar(darId),
  publishDar: (darId) => get().publishApprovedDar(darId),
  materializeApprovedDarToMasterDoc: (darId) => get().publishApprovedDar(darId),
  returnDarForRevision: (taskId, comment) => get().processWorkflow(taskId, 'REJECT', comment),
  rejectDar: (taskId, comment) => get().processWorkflow(taskId, 'REJECT', comment),

  syncRevisionEffective: (dar) => {
    syncRevisionEffectiveService(dar, get, set);
  },

  syncObsoleteCompleted: (dar) => {
    syncObsoleteCompletedService(dar, get, set);
  },

  setDars: (dars) => set({ dars, darRequests: dars }),

  cleanDuplicateDars: () => set(state => {
    const darsList = state.dars || [];
    const hasDar004 = darsList.some(d => (d?.id === 'DAR-2026-004' || d?.dar_no === 'DAR-2026-004' || d?.darNo === 'DAR-2026-004') && (d?.document_code === 'SOP-QC-01' || d?.doc_code === 'SOP-QC-01' || d?.title === 'SOP-QC-01' || d?.title === '[OBSOLETE] SOP-QC-01'));
    const hasDar005 = darsList.some(d => (d?.id === 'DAR-2026-005' || d?.dar_no === 'DAR-2026-005' || d?.darNo === 'DAR-2026-005') && (d?.document_code === 'SOP-QC-01' || d?.doc_code === 'SOP-QC-01' || d?.title === 'SOP-QC-01' || d?.title === '[OBSOLETE] SOP-QC-01'));

    if (hasDar004 && hasDar005) {
      const sanitized = darsList.map(d => {
        if ((d?.id === 'DAR-2026-005' || d?.dar_no === 'DAR-2026-005' || d?.darNo === 'DAR-2026-005') &&
            (d?.document_code === 'SOP-QC-01' || d?.doc_code === 'SOP-QC-01' || d?.title === 'SOP-QC-01' || d?.title === '[OBSOLETE] SOP-QC-01')) {
          return { ...d, status: 'CANCELLED' };
        }
        return d;
      });
      return { dars: sanitized, darRequests: sanitized };
    }
    return state;
  }),

  addDarAndReturnId: (dar) => {
    const docCodeToCheck = dar?.document_code || dar?.doc_code || dar?.docCode || dar?.docNo || (dar?.type !== 'NEW' && dar?.type !== 'NEW_DOCUMENT' ? (dar?.title || dar?.docIdInput) : null);
    if (docCodeToCheck) {
      const existingActiveDar = getActiveDarForDocument(get().dars, docCodeToCheck);
      const isSelf = existingActiveDar && (
        (dar.id && String(dar.id) === String(existingActiveDar.id)) ||
        (dar.dar_no && String(dar.dar_no) === String(existingActiveDar.dar_no)) ||
        (dar.darNo && String(dar.darNo) === String(existingActiveDar.dar_no))
      );
      if (existingActiveDar && !isSelf) {
        const activeDarNo = existingActiveDar.dar_no || existingActiveDar.darNo || existingActiveDar.id;
        const errorMsg = `ไม่สามารถสร้างคำร้องได้ เนื่องจากเอกสาร ${dar.document_code || docCodeToCheck} มีคำร้อง ${activeDarNo} อยู่ระหว่างดำเนินการ`;
        try { toast?.error?.(errorMsg); } catch {}
        throw new Error(errorMsg);
      }
    }

    let newDarId = '';
    set((state) => {
      const date = new Date();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yy = String(date.getFullYear()).slice(-2);
      const prefix = `DAR`;
      const suffix = `-${mm}-${yy}`;
      
      const existingDarsThisMonth = state.dars.filter(d => d.id.endsWith(suffix));
      let nextRun = 1;
      if (existingDarsThisMonth.length > 0) {
         const runNums = existingDarsThisMonth.map(d => parseInt(d.id.replace(prefix, '').split('-')[0]));
         nextRun = Math.max(...runNums) + 1;
      }
      newDarId = `${prefix}${String(nextRun).padStart(2, '0')}${suffix}`;
      
      const distributions = dar.distributions || [];
      const newDar = { ...dar, id: newDarId, distributions };

      if (newDar.type === 'NEW' || newDar.type === 'NEW_DOCUMENT') {
        const selectedTypeObj = (state.documentTypes || []).find(t => (t.code || t.id) === newDar.docType);
        const pattern = selectedTypeObj?.namingPattern || `${newDar.docType}-{Dept}-{##}`;
        const allDocs = [...(state.documents || []), ...(state.masterDocuments || [])];
        const allDars = [...(state.dars || []), ...(state.darRequests || [])];
        const dept = newDar.department || 'PD';
        const nextSeq = calculateNextDocumentSequence(newDar.docType, dept, allDocs, allDars, state.tasks);
        const seqFormatted = formatDocumentRunningNumber(nextSeq);
        let calculatedCode = '';
        if (pattern.includes('{Type}') || pattern.includes('{Dept}') || pattern.includes('{###}') || pattern.includes('{##}')) {
          calculatedCode = pattern
            .replace('{Type}', newDar.docType)
            .replace('{Dept}', dept)
            .replace('{###}', seqFormatted)
            .replace('{##}', seqFormatted);
        } else {
          calculatedCode = `${newDar.docType}-${dept}-${seqFormatted}`;
        }
        const omniPool = [...allDocs, ...allDars, ...(state.tasks || [])];
        if (!newDar.docIdInput || checkDocumentCodeCollision(newDar.docIdInput, omniPool)) {
          newDar.docIdInput = calculatedCode;
        }
        if (checkDocumentCodeCollision(newDar.docIdInput, omniPool)) {
          const safeSeq = nextSeq + 1;
          const safeSeqFormatted = formatDocumentRunningNumber(safeSeq);
          newDar.docIdInput = pattern
            .replace('{Type}', newDar.docType)
            .replace('{Dept}', dept)
            .replace('{###}', safeSeqFormatted)
            .replace('{##}', safeSeqFormatted);
        }
      }

      const today = new Date();
      today.setDate(today.getDate() + state.mockDateOffset);
      const todayStr = today.toISOString().split('T')[0];

      const reviewSla = calculateTaskDueDate({
        submissionDate: newDar.date || todayStr,
        effectiveDate: newDar.effectiveDate,
        stepSlaDays: state.slaSettings?.reviewSlaDays || 3,
        mockDateOffset: state.mockDateOffset
      });

      let newTasks = [...state.tasks];
      let newNotifications = [...state.notifications];
      let realStatus = dar.isDraft ? 'DRAFT' : 'UNDER_REVIEW';
      
      // Generate Reviewer Task
      if (!dar.isDraft) {
        realStatus = 'UNDER_REVIEW';
        let reviewerObj = resolveReviewer(
          newDar.requesterId, 
          newDar.department, 
          state.masterUsers, 
          state.reviewUsers, 
          newDar.docType, 
          state.approvalMatrix
        );
        
        if (reviewerObj) {
          const newTaskId = `t-${Date.now()}`;
          const darDept = newDar.department || 'PD';
          newTasks.push({
            id: newTaskId,
            referenceType: 'INTERNAL_DAR', referenceId: newDar.id,
            darId: newDar.id, title: newDar.title, type: 'Review',
            assigneeId: reviewerObj.id,
            department: darDept,
            target_department: darDept,
            owner_dept: darDept,
            currentHandlerDepartment: darDept,
            currentHandlerLevel: reviewerObj.level,
            dueDate: reviewSla.dueDate,
            cancelDate: reviewSla.cancelDate,
            isUrgent: reviewSla.isUrgent,
            isFastTrack: reviewSla.isFastTrack,
            priority: reviewSla.isUrgent ? 'URGENT' : 'NORMAL',
            slaType: reviewSla.slaType,
            effectiveDate: reviewSla.effectiveDate,
            status: 'NORMAL'
          });
          newNotifications.push({ id: Date.now() + Math.random(), userId: reviewerObj.id, title: 'งานใหม่รอการตรวจสอบ', message: `DAR "${newDar.title}" รอการตรวจสอบจากคุณ`, isRead: false, link: '/tasks', timestamp: new Date().toISOString(), relatedTaskId: newTaskId });
        }
      }

      return { 
        dars: [...state.dars, { ...newDar, status: realStatus }],
        tasks: newTasks,
        notifications: newNotifications,
        timeline: [...state.timeline, { 
          id: Date.now(), darId: newDar.id, action: 'Created', user: state.currentUser.name, date: new Date().toLocaleString(), comment: 'Submitted request' 
        }],
        actionLog: [{
          id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          actionType: 'DAR_SUBMIT',
          actor: state.currentUser.name,
          details: `Submitted DAR ${newDar.id}`,
          timestamp: new Date().toISOString()
        }, ...(state.actionLog || [])]
      };
    });
    return newDarId;
  },

  addDar: (dar) => {
    const docCodeToCheck = dar?.document_code || dar?.doc_code || dar?.docCode || dar?.docNo || (dar?.type !== 'NEW' && dar?.type !== 'NEW_DOCUMENT' ? (dar?.title || dar?.docIdInput) : null);
    if (docCodeToCheck) {
      const existingActiveDar = getActiveDarForDocument(get().dars, docCodeToCheck);
      const isSelf = existingActiveDar && (
        (dar.id && String(dar.id) === String(existingActiveDar.id)) ||
        (dar.dar_no && String(dar.dar_no) === String(existingActiveDar.dar_no)) ||
        (dar.darNo && String(dar.darNo) === String(existingActiveDar.dar_no))
      );
      if (existingActiveDar && !isSelf) {
        const activeDarNo = existingActiveDar.dar_no || existingActiveDar.darNo || existingActiveDar.id;
        const errorMsg = `ไม่สามารถสร้างคำร้องได้ เนื่องจากเอกสาร ${dar.document_code || docCodeToCheck} มีคำร้อง ${activeDarNo} อยู่ระหว่างดำเนินการ`;
        try { toast?.error?.(errorMsg); } catch {}
        throw new Error(errorMsg);
      }
    }

    return set((state) => {
    // Generate new ID DAR-YYYY-XXX upon non-draft submission
    let newDarId = dar.id;
    let allocatedDarNumber = dar.darNumber || null;

    if (!dar.isDraft && dar.status !== 'DRAFT') {
      const targetYear = new Date().getFullYear();
      allocatedDarNumber = dar.darNumber || generateInternalDarNumber(state.dars, targetYear);
      newDarId = allocatedDarNumber;
    } else if (!newDarId) {
      newDarId = `draft_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    const today = new Date();
    today.setDate(today.getDate() + (state.mockDateOffset || 0));
    const todayStr = today.toISOString().split('T')[0];

    const newDar = { 
      ...dar, 
      id: newDarId, 
      darNumber: allocatedDarNumber,
      darNo: allocatedDarNumber,
      dar_no: allocatedDarNumber,
      title: dar.title || dar.docTitle || dar.name || 'Untitled Document',
      name: dar.name || dar.title || dar.docTitle || 'Untitled Document',
      docTitle: dar.docTitle || dar.name || dar.title || 'Untitled Document',
      department: dar.department || state.currentUser?.department || 'PD',
      requesterId: dar.requesterId || dar.requester_id || state.currentUser?.id || (state.masterUsers?.[0]?.id || ''),
      date: dar.date || dar.createdAt?.split('T')[0] || todayStr,
      type: dar.type || 'NEW',
      fileId: dar.fileId || dar.file_id || dar.attachedFile?.fileId || null,
      file_id: dar.file_id || dar.fileId || dar.attachedFile?.fileId || null,
      fileName: dar.fileName || dar.attachedFile?.name || null,
      attachedFile: dar.attachedFile || null,
      distributions: dar.distributions || []
    };

    // Bind file to new DAR ID and allocated number in rawBlobRegistry, file storage & window.__PDF_CACHE__
    const activeFileKey = newDar.fileId || newDar.attachedFile?.fileId;
    const targetBlob = (window.__PDF_CACHE__ && window.__PDF_CACHE__.get(activeFileKey)) ||
      (window.__UPLOADED_FILES_MAP__ && window.__UPLOADED_FILES_MAP__.get(activeFileKey)) ||
      dar.file || dar.attachedFile?.file;

    if (targetBlob) {
      window.__PDF_CACHE__ = window.__PDF_CACHE__ || new Map();
      window.__UPLOADED_FILES_MAP__ = window.__UPLOADED_FILES_MAP__ || new Map();
      [window.__PDF_CACHE__, window.__UPLOADED_FILES_MAP__].forEach(cache => {
        if (newDarId) cache.set(String(newDarId), targetBlob);
        if (allocatedDarNumber) cache.set(String(allocatedDarNumber), targetBlob);
        if (newDar.docCode) cache.set(String(newDar.docCode), targetBlob);
        if (newDar.document_code) cache.set(String(newDar.document_code), targetBlob);
        if (newDar.fileName) cache.set(String(newDar.fileName), targetBlob);
      });
    }

    if (activeFileKey) {
      import('../utils/fileStorage').then(({ inMemoryBlobRegistry, rawBlobRegistry, saveFile }) => {
        const existingBlob = (rawBlobRegistry && rawBlobRegistry.get(String(activeFileKey))) ||
          (inMemoryBlobRegistry && inMemoryBlobRegistry.get(String(activeFileKey))) ||
          targetBlob;
        if (existingBlob) {
          if (newDarId) {
            rawBlobRegistry?.set(String(newDarId), existingBlob);
            saveFile(String(newDarId), existingBlob);
          }
          if (allocatedDarNumber && allocatedDarNumber !== newDarId) {
            rawBlobRegistry?.set(String(allocatedDarNumber), existingBlob);
            saveFile(String(allocatedDarNumber), existingBlob);
          }
        }
      }).catch(() => {});
    }

    // --- INVARIANT VALIDATION: Document Identity Immutability ---
    // ISO 9001: 7.5.3 - Identity (Department, DocNo, Type) of a document cannot mutate during a Revision/Amendment/Obsolete.
    // We enforce this invariant by overriding any payload values with the true values from the source document.
    if (newDar.type === 'REVISION' || newDar.type === 'AMENDMENT') {
      const allDocsForInvariant = [...(state.documents || []), ...(state.masterDocuments || [])];
      const targetDocId = newDar.docIdRef || newDar.doc_id || newDar.targetDocumentId;
      if (targetDocId) {
        const sourceDoc = allDocsForInvariant.find(d => String(d.id) === String(targetDocId));
        if (sourceDoc) {
          // Force override to source document's identity
          newDar.department = sourceDoc.department || sourceDoc.dept || newDar.department;
          newDar.docType = sourceDoc.docType || sourceDoc.type || newDar.docType;
          
          const sourceCode = sourceDoc.code || sourceDoc.document_code || sourceDoc.docCode;
          if (sourceCode) {
            newDar.docCode = sourceCode;
            newDar.document_code = sourceCode;
            newDar.docIdInput = sourceCode; // Used by some UI components
          }
        }
      }
    }

    if (newDar.type === 'OBSOLETE' || newDar.request_type === 'OBSOLETE') {
      const allDocsForInvariant = [...(state.documents || []), ...(state.masterDocuments || [])];
      const targetDocId = newDar.docIdRef || newDar.doc_id || newDar.targetDocumentId || newDar.docId;
      const targetCode = newDar.docCode || newDar.document_code || newDar.doc_code || newDar.title;
      const sourceDoc = allDocsForInvariant.find(d => 
        (targetDocId && String(d.id) === String(targetDocId)) ||
        (targetCode && (d.title === targetCode || d.document_code === targetCode || d.code === targetCode))
      );
      if (sourceDoc) {
        newDar.department = sourceDoc.department || sourceDoc.dept || newDar.department;
        newDar.docType = sourceDoc.docType || sourceDoc.type || newDar.docType;
        const sourceCode = sourceDoc.code || sourceDoc.document_code || sourceDoc.docCode || sourceDoc.title;
        if (sourceCode) {
          newDar.docCode = sourceCode;
          newDar.document_code = sourceCode;
          newDar.docIdInput = sourceCode;
        }
        const effectiveRev = String(
          (sourceDoc.revision && sourceDoc.revision !== '00')
            ? sourceDoc.revision
            : (sourceDoc.rev || sourceDoc.revision || '01')
        ).replace(/^Rev\.?/i, '').padStart(2, '0');

        newDar.revision = (newDar.revision && newDar.revision !== '00') ? newDar.revision : effectiveRev;
        newDar.targetRevision = (newDar.targetRevision && newDar.targetRevision !== '00') ? newDar.targetRevision : effectiveRev;
        newDar.rev = (newDar.rev && newDar.rev !== '00') ? newDar.rev : effectiveRev;
        newDar.docRev = (newDar.docRev && newDar.docRev !== '00') ? newDar.docRev : effectiveRev;
      }
    }
    // ------------------------------------------------------------

    if (newDar.type === 'NEW' || newDar.type === 'NEW_DOCUMENT') {
      const selectedTypeObj = (state.documentTypes || []).find(t => (t.code || t.id) === newDar.docType);
      const pattern = selectedTypeObj?.namingPattern || `${newDar.docType}-{Dept}-{##}`;
      const allDocs = [...(state.documents || []), ...(state.masterDocuments || [])];
      const allDars = [...(state.dars || []), ...(state.darRequests || [])];
      const nextSeq = calculateNextDocumentSequence(newDar.docType, newDar.department, allDocs, allDars, state.tasks);
      const seqFormatted = formatDocumentRunningNumber(nextSeq);
      let calculatedCode = '';
      if (pattern.includes('{Type}') || pattern.includes('{Dept}') || pattern.includes('{###}') || pattern.includes('{##}')) {
        calculatedCode = pattern
          .replace('{Type}', newDar.docType)
          .replace('{Dept}', newDar.department)
          .replace('{###}', seqFormatted)
          .replace('{##}', seqFormatted);
      } else {
        calculatedCode = `${newDar.docType}-${newDar.department}-${seqFormatted}`;
      }

      // Omni-Status Monotonic Collision Guard
      const omniPool = [...allDocs, ...allDars, ...(state.tasks || [])];
      if (newDar.docIdInput && checkDocumentCodeCollision(newDar.docIdInput, omniPool)) {
        newDar.docIdInput = calculatedCode;
      } else if (!newDar.docIdInput) {
        newDar.docIdInput = calculatedCode;
      }
      if (checkDocumentCodeCollision(newDar.docIdInput, omniPool)) {
        const safeSeq = nextSeq + 1;
        const safeSeqFormatted = formatDocumentRunningNumber(safeSeq);
        newDar.docIdInput = pattern
          .replace('{Type}', newDar.docType)
          .replace('{Dept}', newDar.department)
          .replace('{###}', safeSeqFormatted)
          .replace('{##}', safeSeqFormatted);
      }
    }

    // Generate Rule-Based Dynamic Workflow Steps (Step 1: Requester, Step 2: Reviewer, Step 3: Approver)
    const requesterUser = (state.masterUsers || []).find(u => (u.id === newDar.requesterId || u.userId === newDar.requesterId)) || state.currentUser;
    const dynamicWorkflow = generateDynamicWorkflow(requesterUser, newDar.department, state.masterUsers || [], newDar.docType, state.approvalMatrix);

    newDar.workflowSteps = (Array.isArray(dar.workflowSteps) && dar.workflowSteps.length > 0)
      ? dar.workflowSteps
      : dynamicWorkflow;

    const step2 = newDar.workflowSteps?.find(s => s.role === 'REVIEWER' || s.step === 2);
    const step3 = newDar.workflowSteps?.find(s => s.role === 'APPROVER' || s.step === 3);

    if (step2?.userId) {
      newDar.reviewerId = step2.userId;
      newDar.reviewerName = step2.userName;
    }
    if (step3?.userId) {
      newDar.approverId = step3.userId;
      newDar.approverName = step3.userName;
    }

    // Set reviewerObj based on dynamic workflow step 2 (with fallback to resolveReviewer)
    let reviewerObj = null;
    if (step2?.userId) {
      const step2User = (state.masterUsers || []).find(m => m.id === step2.userId || m.userId === step2.userId);
      if (step2User) {
        reviewerObj = {
          id: step2User.id || step2User.userId,
          name: step2User.name || step2.userName,
          level: step2User.level || step2User.approval_level || 5,
          dept: step2User.department || newDar.department
        };
      }
    }
    if (!reviewerObj && !newDar.manualReviewerId) {
      reviewerObj = resolveReviewer(
        newDar.requesterId, 
        newDar.department, 
        state.masterUsers, 
        state.reviewUsers, 
        newDar.docType, 
        state.approvalMatrix
      );
    } else if (!reviewerObj && newDar.manualReviewerId) {
      const u = state.masterUsers.find(m => m.id === newDar.manualReviewerId);
      if (u) reviewerObj = { id: u.id, level: u.level, dept: newDar.department };
    }

    // Safety fallback: if no candidate found in pool, escalate to management
    if (!reviewerObj) {
      const fallback = state.masterUsers.find(m => 
        m.id !== newDar.requesterId && 
        (!m.isDcc || newDar.department === 'DC') && 
        ((m.approval_level || m.level || 0) >= 4 || m.isQmr || m.role === 'DEPT_ADMIN')
      );
      if (fallback) {
        reviewerObj = { id: fallback.id, level: fallback.approval_level || fallback.level || 4, dept: fallback.department || newDar.department };
      }
    }

    const reviewSla = calculateTaskDueDate({
      submissionDate: newDar.date || todayStr,
      effectiveDate: newDar.effectiveDate,
      stepSlaDays: state.slaSettings?.reviewSlaDays || 3,
      mockDateOffset: state.mockDateOffset
    });

    let newTasks = [...state.tasks];
    let newNotifications = [...state.notifications];
    let realStatus = dar.isDraft ? 'DRAFT' : 'UNDER_REVIEW';

    if (!dar.isDraft && reviewerObj) {
      const newTaskId = `t-${Date.now()}`;
      const docCode = resolveDarDocumentCode(newDar, state.documents, newDar.id);
      const docOfficialTitle = newDar.docTitle || newDar.name || newDar.document_name || newDar.docName || newDar.title;
      newTasks.push({
        id: newTaskId,
        referenceType: 'INTERNAL_DAR', referenceId: newDar.id,
        darId: newDar.id,
        docId: newDar.docId || newDar.id,
        docCode: docCode,
        doc_code: docCode,
        docTitle: docOfficialTitle,
        docName: docOfficialTitle,
        title: `[DAR ทบทวน] ${docOfficialTitle} (${docCode})`,
        type: 'Review',
        taskType: 'DAR_REVIEW',
        task_type: 'DAR_REVIEW',
        assigneeId: reviewerObj.id,
        assignee_id: reviewerObj.id,
        assigneeName: reviewerObj.name || '',
        assignee_department: reviewerObj.dept || '',
        department: newDar.department || newDar.dept || 'PD',
        target_department: newDar.department || newDar.dept || 'PD',
        owner_dept: newDar.department || newDar.dept || 'PD',
        currentHandlerDepartment: newDar.department || newDar.dept || 'PD',
        currentHandlerLevel: reviewerObj.level,
        required_approval_level: reviewerObj.level,
        dueDate: reviewSla.dueDate,
        cancelDate: reviewSla.cancelDate,
        isUrgent: reviewSla.isUrgent,
        isFastTrack: reviewSla.isFastTrack,
        priority: reviewSla.isUrgent ? 'URGENT' : 'NORMAL',
        slaType: reviewSla.slaType,
        effectiveDate: reviewSla.effectiveDate,
        fileId: newDar.fileId || newDar.attachedFile?.fileId || null,
        fileName: newDar.fileName || newDar.attachedFile?.name || null,
        attachedFile: newDar.attachedFile || null,
        status: 'NORMAL'
      });
      newNotifications.push({ 
        id: `notif-dar-rev-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`, 
        userId: reviewerObj.id, 
        targetUserIds: [reviewerObj.id],
        title: 'งานใหม่รอการตรวจสอบ', 
        message: `DAR "${docOfficialTitle}" (${docCode}) รอการตรวจสอบจากคุณ`, 
        type: 'TASK_ASSIGNED',
        category: 'DAR',
        isRead: false, 
        read: false,
        readBy: [],
        link: '/tasks', 
        timestamp: new Date().toISOString(), 
        relatedTaskId: newTaskId,
        docCode: docCode,
        refId: newDar.id
      });
    }

    return {
      dars: [...state.dars, { ...newDar, status: realStatus }],
      darRequests: [...(state.dars || []), { ...newDar, status: realStatus }],
      tasks: newTasks,
      notifications: newNotifications,
      timeline: [...state.timeline, { 
        id: Date.now(), darId: newDar.id, action: 'Created', user: state.currentUser.name, date: new Date().toLocaleString(), comment: 'Submitted request' 
      }],
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: dar.isDraft ? 'DRAFT_SAVED' : 'DAR_SUBMITTED',
        actor: state.currentUser.name,
        details: `Submitted DAR ${newDar.darNumber || newDar.id}`,
        timestamp: new Date().toISOString()
      }, ...(state.actionLog || [])]
    };
  });
},

  submitDar: async (dar, rawFile) => {
    if (isApiMode) {
      const { submitDarToApi } = await import('../../../api/dars');
      return submitDarToApi(dar, rawFile || dar.file);
    }
    const finalDar = { ...dar, isDraft: false };
    const darId = finalDar.darNumber || finalDar.id || `DAR-${String(new Date().getFullYear()).slice(-2)}-${String(get().dars.length + 1).padStart(3, '0')}`;
    const fileId = finalDar.fileId || `file-${darId}-${Date.now()}`;
    
    // 1. สกัดหาไฟล์จริงจากทุกช่องทางที่เป็นไปได้
    const targetFile = rawFile || finalDar.file || finalDar.attachedFile?.file || finalDar.rawFile || finalDar.fileBlob;
    const fileName = targetFile?.name || finalDar.fileName || finalDar.attachedFile?.name || `${darId}.pdf`;
    finalDar.fileName = fileName;

    // 2. ถ้ามีไฟล์จริง บันทึกลง Storage ทันที
    if (targetFile && (targetFile instanceof Blob || targetFile instanceof File)) {
      // สำรองไฟล์ลง Global Memory (Synchronous Access) ตาม Blueprint B
      window.__PDF_CACHE__ = window.__PDF_CACHE__ || new Map();
      window.__UPLOADED_FILES_MAP__ = window.__UPLOADED_FILES_MAP__ || new Map();
      [window.__PDF_CACHE__, window.__UPLOADED_FILES_MAP__].forEach(cache => {
        cache.set(fileId, targetFile);
        cache.set(darId, targetFile);
        cache.set(fileName, targetFile);
        if (finalDar.docCode) cache.set(finalDar.docCode, targetFile);
        if (finalDar.document_code) cache.set(finalDar.document_code, targetFile);
      });

      const { saveFile } = await import('../utils/fileStorage');
      try {
        await saveFile(fileId, targetFile);
        await saveFile(darId, targetFile); // ทำ Alias ด้วยรหัส DAR
        if (finalDar.docCode) await saveFile(finalDar.docCode, targetFile);
        if (finalDar.document_code) await saveFile(finalDar.document_code, targetFile);
      } catch (e) {
        console.error('Failed to save file to IndexedDB:', e);
      }
      
      finalDar.fileId = fileId;
      if (!finalDar.attachedFile) {
        finalDar.attachedFile = {
          fileId: fileId,
          name: fileName,
          size: targetFile.size || 0,
          type: 'application/pdf'
        };
      } else {
        finalDar.attachedFile = {
          ...finalDar.attachedFile,
          fileId: fileId,
          name: fileName,
          size: targetFile.size || finalDar.attachedFile.size || 0
        };
      }
    }
    get().addDar(finalDar);
    const addedDar = get().dars.find(d => (fileId && d.fileId === fileId) || (finalDar.id && d.id === finalDar.id)) || get().dars[get().dars.length - 1] || finalDar;
    return addedDar;
  },

  saveDarDraft: (draftData) => set((state) => {
    const list = state.dars || [];
    const targetId = draftData.id || draftData.dar_no || draftData.darNo;
    
    // Check if draft already exists
    const existingIndex = list.findIndex(
      (d) => String(d.id) === String(targetId) || (targetId && (String(d.dar_no) === String(targetId) || String(d.darNo) === String(targetId)))
    );

    let updatedDars;
    let savedId = targetId;

    if (existingIndex >= 0) {
      // In-place update
      const existing = list[existingIndex];
      savedId = existing.id;
      const updatedDraft = {
        ...existing,
        ...draftData,
        id: existing.id,
        darNumber: null,
        darNo: null,
        dar_no: null,
        status: 'DRAFT',
        isDraft: true,
        updated_at: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      updatedDars = [...list];
      updatedDars[existingIndex] = updatedDraft;
    } else {
      // Insert new draft with temporary auto-generated draft ID if not provided
      if (!savedId) {
        savedId = `draft_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      }

      const newDraft = {
        ...draftData,
        id: savedId,
        darNumber: null,
        darNo: null,
        dar_no: null,
        status: 'DRAFT',
        isDraft: true,
        requesterId: draftData.requesterId || draftData.requester_id || state.currentUser?.id,
        requester_name: draftData.requester_name || state.currentUser?.name,
        department: draftData.department || draftData.owner_dept || state.currentUser?.department || 'QA/QC',
        created_at: draftData.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      updatedDars = [newDraft, ...list];
    }

    return {
      dars: updatedDars,
      darRequests: updatedDars,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'DRAFT_SAVED',
        actor: state.currentUser?.name || 'User',
        details: `Saved DAR Draft ${savedId}`,
        timestamp: new Date().toISOString()
      }, ...(state.actionLog || [])]
    };
  }),

  deleteDar: (darId) => set((state) => {
    const updatedDars = (state.dars || []).filter(d => d.id !== darId && d.dar_no !== darId && d.darNo !== darId);
    return {
      dars: updatedDars,
      darRequests: updatedDars,
      tasks: state.tasks.filter(t => t.darId !== darId),
      timeline: state.timeline.filter(t => t.darId !== darId),
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'DAR_DELETE',
        actor: state.currentUser?.name || 'System',
        details: `Deleted DAR ${darId}`,
        timestamp: new Date().toISOString()
      }, ...(state.actionLog || [])]
    };
  }),

  finalizeAndPublishMaster: async (darId) => {
    // API mode: the register changes only when DCC publishes on the server.
    if (isApiMode) return;
    const state = get();
    const safeDars = state.dars || [];
    const safeDarRequests = state.darRequests || [];
    const dar = safeDars.find(d => d.id === darId || d.dar_no === darId || d.darNumber === darId || d.darNo === darId)
      || safeDarRequests.find(d => d.id === darId || d.dar_no === darId || d.darNumber === darId || d.darNo === darId);
    if (!dar) return;

    try {
      const targetDocCode = dar.docNo || dar.document_code || dar.doc_code || dar.docCode || dar.docIdInput || dar.title;
      const targetDocId = dar.docIdRef || dar.docId || dar.doc_id;

      const activeFileId = dar.fileId || dar.file_id || dar.attachedFile?.fileId || dar.attachedFile?.id || dar.id;
      let rawBlob = dar.fileData || dar.originalPdfBytes || dar.fileBlob;
      if (!rawBlob) {
        rawBlob = await resolveFileBlob(dar, activeFileId);
      }
      if (!rawBlob) {
        try {
          const { getSystemSampleDocumentBlob } = await import('../utils/pdfStamper');
          rawBlob = getSystemSampleDocumentBlob(targetDocCode || 'SOP-QC-002', dar.title || 'Standard Operating Procedure');
        } catch {}
      }
      if (!rawBlob) return;

      const signatories = resolveProgressiveSignatories({
        dar,
        stage: 'MASTER',
        masterUsers: state.masterUsers,
        users: state.users,
        currentUser: state.currentUser
      });

      const permanentlyStampedPdfBytes = await applyProgressiveSignatoryStamp(
        rawBlob,
        signatories
      );
      const stampedBlob = new Blob([permanentlyStampedPdfBytes], { type: 'application/pdf' });

      const nowIso = new Date().toISOString();
      const stampedBlobUrl = (typeof URL !== 'undefined' && URL.createObjectURL) ? URL.createObjectURL(stampedBlob) : null;

      const darTargetRev = String(dar.targetRevision || dar.target_revision || dar.newRevision || dar.revision || dar.rev || dar.proposedRev || '01').replace(/^rev\.?/i, '').trim();
      const darFormerRev = String(dar.previousRevision || dar.previous_revision || dar.currentRevision || '00').replace(/^rev\.?/i, '').trim();

      // Collect all keys to persist into IndexedDB
      const keysToSave = new Set();
      if (activeFileId) keysToSave.add(activeFileId);
      if (targetDocCode) {
        keysToSave.add(targetDocCode);
        keysToSave.add(`DOC_${targetDocCode}_REV${darTargetRev}`);
        keysToSave.add(`FILE_${targetDocCode}_REV${darTargetRev}`);
        keysToSave.add(`DOC_${targetDocCode}_REV${darTargetRev.padStart(2, '0')}`);
        keysToSave.add(`FILE_${targetDocCode}_REV${darTargetRev.padStart(2, '0')}`);
        keysToSave.add(`DOC_${targetDocCode}_REV_${darTargetRev}`);
        keysToSave.add(`FILE_${targetDocCode}_REV_${darTargetRev}`);
        keysToSave.add(`DOC_${targetDocCode}_REV_${darTargetRev.padStart(2, '0')}`);
        keysToSave.add(`FILE_${targetDocCode}_REV_${darTargetRev.padStart(2, '0')}`);
      }
      if (targetDocId) keysToSave.add(targetDocId);
      if (dar.id) keysToSave.add(dar.id);
      if (dar.darNo) keysToSave.add(dar.darNo);
      if (dar.darNumber) keysToSave.add(dar.darNumber);

      const allExistingDocs = [...(state.documents || []), ...(state.masterDocuments || [])];

      // 1. Snapshot former revision file into IndexedDB & in-memory registry before publishing new master
      const formerActiveDoc = allExistingDocs.find(d => {
        const c = d.code || d.document_code || d.docNo || d.title || d.docCode;
        const isCodeMatch = c && targetDocCode && c.trim().toLowerCase() === targetDocCode.trim().toLowerCase();
        const dRev = String(d.revision || d.rev || '').replace(/^rev\.?/i, '').trim();
        const isFormer = dRev !== darTargetRev && dRev !== darTargetRev.padStart(2, '0');
        return isCodeMatch && (d.status === 'SUPERSEDED' || d.is_superseded || (isFormer && (d.status === 'EFFECTIVE' || d.status === 'ACTIVE')));
      });

      if (formerActiveDoc && targetDocCode) {
        const fRev = String(formerActiveDoc.revision || formerActiveDoc.rev || darFormerRev).replace(/^rev\.?/i, '').trim();
        const fFile = formerActiveDoc.file || formerActiveDoc.fileBlob || formerActiveDoc.fileData;
        if (fFile) {
          const fKeys = [
            `DOC_${targetDocCode}_REV${fRev}`,
            `FILE_${targetDocCode}_REV${fRev}`,
            `DOC_${targetDocCode}_REV${fRev.padStart(2, '0')}`,
            `FILE_${targetDocCode}_REV${fRev.padStart(2, '0')}`,
            `DOC_${targetDocCode}_REV_${fRev}`,
            `FILE_${targetDocCode}_REV_${fRev}`,
            `DOC_${targetDocCode}_REV_${fRev.padStart(2, '0')}`,
            `FILE_${targetDocCode}_REV_${fRev.padStart(2, '0')}`
          ];
          for (const fk of fKeys) {
            await saveFile(fk, fFile).catch(() => {});
          }
        }
      }

      // 2. Only add ID of the target document being published (DO NOT overwrite IDs of superseded documents!)
      for (const d of allExistingDocs) {
        const isSuperseded = d.status === 'SUPERSEDED' || d.is_superseded;
        const dRev = String(d.revision || d.rev || '').replace(/^rev\.?/i, '').trim();
        const isTargetRevMatch = dRev === darTargetRev || dRev.padStart(2, '0') === darTargetRev.padStart(2, '0');

        const isMatch = !isSuperseded && (
          (targetDocId && String(d.id) === String(targetDocId)) ||
          (targetDocCode && (d.code === targetDocCode || d.document_code === targetDocCode || d.docNo === targetDocCode || d.title === targetDocCode || d.docCode === targetDocCode) && (isTargetRevMatch || d.status === 'EFFECTIVE' || d.status === 'ACTIVE' || d.status === 'SCHEDULED_EFFECTIVE')) ||
          (dar.id && (d.darId === dar.id || d.darNo === dar.id)) ||
          (dar.darNo && (d.darNo === dar.darNo || d.darId === dar.darNo))
        );
        if (isMatch) {
          if (d.id) keysToSave.add(d.id);
          if (d.fileId) keysToSave.add(d.fileId);
        }
      }

      for (const key of keysToSave) {
        if (key) {
          await saveFile(key, stampedBlob).catch(() => {});
        }
      }

      const formerHistSnapshot = formerActiveDoc ? {
        revision: String(formerActiveDoc.revision || formerActiveDoc.rev || darFormerRev).replace(/^rev\.?/i, '').trim(),
        rev: String(formerActiveDoc.revision || formerActiveDoc.rev || darFormerRev).replace(/^rev\.?/i, '').trim(),
        dar_no: formerActiveDoc.darNo || formerActiveDoc.darNumber || formerActiveDoc.darId || dar.previousDarNo || dar.darNo,
        dar_id: formerActiveDoc.darId || dar.id,
        effective_date: formerActiveDoc.effectiveDate || formerActiveDoc.effective_date,
        file: formerActiveDoc.file || formerActiveDoc.fileBlob,
        fileBlob: formerActiveDoc.fileBlob || formerActiveDoc.file,
        fileData: formerActiveDoc.fileData,
        superseded_at: nowIso,
        superseded_by_rev: darTargetRev
      } : null;

      set(s => {
        const mapDoc = (d) => {
          const isSuperseded = d.status === 'SUPERSEDED' || d.is_superseded;
          const dRev = String(d.revision || d.rev || '').replace(/^rev\.?/i, '').trim();
          const isTargetRevMatch = dRev === darTargetRev || dRev.padStart(2, '0') === darTargetRev.padStart(2, '0');

          const isMatch = !isSuperseded && (
            (targetDocId && String(d.id) === String(targetDocId)) ||
            (targetDocCode && (d.code === targetDocCode || d.document_code === targetDocCode || d.docNo === targetDocCode || d.title === targetDocCode || d.docCode === targetDocCode) && (isTargetRevMatch || d.status === 'EFFECTIVE' || d.status === 'ACTIVE' || d.status === 'SCHEDULED_EFFECTIVE')) ||
            (dar.id && (d.darId === dar.id || d.darNo === dar.id)) ||
            (dar.darNo && (d.darNo === dar.darNo || d.darId === dar.darNo))
          );

          if (isMatch) {
            const existingHistory = Array.isArray(d.revision_history) ? d.revision_history : [];
            const hasFormer = formerHistSnapshot && existingHistory.some(h => String(h.revision || h.rev) === String(formerHistSnapshot.revision));
            return {
              ...d,
              file: stampedBlob,
              fileData: permanentlyStampedPdfBytes,
              fileBlob: stampedBlob,
              pdfUrl: stampedBlobUrl || d.pdfUrl,
              fileUrl: stampedBlobUrl || d.fileUrl,
              isSignatoryStamped: true,
              stampedAt: nowIso,
              revision_history: formerHistSnapshot && !hasFormer ? [...existingHistory, formerHistSnapshot] : existingHistory
            };
          }

          // If document is superseded, ensure its historical file is preserved and not overwritten
          if (isSuperseded) {
            return {
              ...d,
              file: d.file || d.fileBlob,
              fileBlob: d.fileBlob || d.file
            };
          }

          return d;
        };

        const updatedDocs = (s.documents || []).map(mapDoc);
        const updatedMasterDocs = (s.masterDocuments || []).map(mapDoc);

        const updatedDars = (s.dars || []).map(d => (d.id === dar.id || d.darNo === dar.darNo) ? {
          ...d,
          file: stampedBlob,
          fileData: permanentlyStampedPdfBytes,
          fileBlob: stampedBlob,
          pdfUrl: stampedBlobUrl || d.pdfUrl,
          fileUrl: stampedBlobUrl || d.fileUrl,
          isSignatoryStamped: true,
          stampedAt: nowIso
        } : d);

        return {
          documents: updatedDocs,
          masterDocuments: updatedMasterDocs,
          dars: updatedDars
        };
      });
    } catch (err) {
      console.warn('[useStore] finalizeAndPublishMaster stamping warning:', err);
    }
  },

  stampFinalApprovalPdf: async (darId) => {
    return get().finalizeAndPublishMaster(darId);
  },

  processWorkflow: (taskId, action, comment) => {
    if (isApiMode) return import('../../../api/dars').then((m) => m.decideTask(taskId, action, comment));
    let newlyCompletedDar = null;
    let targetTask = null;
    let targetDar = null;
    let newStatus = null;
    set((state) => {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return state;

    const dar = state.dars.find(d => d.id === task.darId);
    if (!dar) return state;

    targetTask = task;
    targetDar = dar;

    const newTasks = state.tasks.filter(t => t.id !== taskId);
    newStatus = dar.status;

    const today = new Date();
    today.setDate(today.getDate() + state.mockDateOffset);
    const _dueDateStr = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const _cancelDateStr = new Date(today.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let newNotifications = state.notifications.map(n => n.relatedTaskId === taskId ? { ...n, isRead: true } : n);

    if (task.type === 'Review' || task.type === 'REVIEW') {
      if (action === 'APPROVE') {
        newStatus = 'PENDING_APPROVAL';

        // Find Approver (Rule: candidate.level >= minApproverLevel, Linear Multi-Stage Pipeline)
        let approverObj = null;
        const step3 = dar.workflowSteps?.find(s => s.role === 'APPROVER' || s.step === 3);
        if (step3?.userId && !dar.manualApproverId) {
          const step3User = (state.masterUsers || []).find(m => m.id === step3.userId || m.userId === step3.userId);
          if (step3User) {
            approverObj = {
              id: step3User.id || step3User.userId,
              name: step3User.name || step3.userName,
              level: step3User.level || step3User.approval_level || 6,
              dept: step3User.department || dar.department
            };
          }
        }
        if (!approverObj && !dar.manualApproverId) {
          approverObj = resolveApprover(
            dar.requesterId, 
            task.assigneeId, 
            dar.department, 
            state.masterUsers, 
            state.approveUsers, 
            dar.docType || dar.doc_type, 
            state.approvalMatrix
          );
        } else if (!approverObj && dar.manualApproverId) {
          const u = state.masterUsers.find(m => m.id === dar.manualApproverId);
          if (u) approverObj = { id: u.id, level: u.level, dept: dar.department };
        }

        // Safety escalation fallback if still not resolved
        if (!approverObj) {
          const fallback = state.masterUsers.find(m => 
            m.id !== dar.requesterId && 
            m.id !== task.assigneeId && 
            (!m.isDcc || dar.department === 'DC') && 
            ((m.approval_level || m.level || 0) >= 5 || m.isQmr || m.role === 'DEPT_ADMIN')
          ) || state.masterUsers.find(m => m.id !== dar.requesterId && m.id !== task.assigneeId);

          if (fallback) {
            approverObj = { id: fallback.id, level: fallback.approval_level || fallback.level || 5, dept: fallback.department || dar.department };
          }
        }

        if (approverObj) {
          const approverSla = calculateTaskDueDate({
            submissionDate: today,
            effectiveDate: dar.effectiveDate,
            stepSlaDays: state.slaSettings?.approvalSlaDays || 3,
            mockDateOffset: state.mockDateOffset
          });
          const newTaskId = `t-${Date.now()}`;
          const docCode = resolveDarDocumentCode(dar, state.documents, dar.id);
          const docOfficialTitle = dar.name || dar.document_name || dar.docName || dar.title;
          const darDept = dar.department || 'PD';
          newTasks.push({
            id: newTaskId, referenceType: 'INTERNAL_DAR', referenceId: dar.id, darId: dar.id,
            docId: dar.docId || dar.id,
            docCode: docCode,
            doc_code: docCode,
            docTitle: docOfficialTitle,
            docName: docOfficialTitle,
            title: `[DAR รออนุมัติ] ${docOfficialTitle} (${docCode})`,
            type: 'Approve', assigneeId: approverObj.id,
            assigneeName: approverObj.name || state.masterUsers.find(u => u.id === approverObj.id)?.name,
            assignee_department: approverObj.dept || state.masterUsers.find(u => u.id === approverObj.id)?.department,
            department: darDept,
            target_department: darDept,
            owner_dept: darDept,
            currentHandlerDepartment: darDept,
            currentHandlerLevel: approverObj.level,
            dueDate: approverSla.dueDate, cancelDate: approverSla.cancelDate,
            isUrgent: approverSla.isUrgent, isFastTrack: approverSla.isFastTrack, priority: approverSla.isUrgent ? 'URGENT' : 'NORMAL', slaType: approverSla.slaType, effectiveDate: approverSla.effectiveDate,
            status: 'NORMAL'
          });
          newNotifications.push({
            id: `notif-dar-app-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            userId: approverObj.id,
            targetUserIds: [approverObj.id],
            title: 'งานใหม่รอการอนุมัติ',
            message: `DAR "${dar.title}" รอการอนุมัติจากคุณ`,
            type: 'TASK_ASSIGNED',
            category: 'DAR',
            isRead: false,
            read: false,
            readBy: [],
            link: '/tasks',
            timestamp: new Date().toISOString(),
            relatedTaskId: newTaskId,
            docCode: docCode,
            refId: dar.id
          });

          if (dar.requesterId) {
            newNotifications.push({
              id: `notif-dar-revpass-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
              userId: dar.requesterId,
              targetUserIds: [dar.requesterId],
              title: 'DAR ผ่านการทบทวนแล้ว',
              message: `DAR "${dar.title}" ผ่านการทบทวนแล้ว และถูกส่งต่อให้ผู้อนุมัติพิจารณา`,
              type: 'WORKFLOW_UPDATE',
              category: 'DAR',
              isRead: false,
              read: false,
              readBy: [],
              link: '/tasks',
              timestamp: new Date().toISOString(),
              docCode: docCode,
              refId: dar.id
            });
          }
        }
      } else if (action === 'RETURN') {
        newStatus = 'RETURNED_FOR_REVISION';
        const reviseSla = calculateTaskDueDate({
          submissionDate: today,
          effectiveDate: dar.effectiveDate,
          stepSlaDays: state.slaSettings?.darCreationSlaDays || 3,
          mockDateOffset: state.mockDateOffset
        });
        const newTaskId = `t-${Date.now()}`;
        const docCode = resolveDarDocumentCode(dar, state.documents, dar.id);
        const docOfficialTitle = dar.name || dar.document_name || dar.docName || dar.title;
        const darDept = dar.department || 'PD';
        newTasks.push({
          id: newTaskId, referenceType: 'INTERNAL_DAR', referenceId: dar.id, darId: dar.id,
          docId: dar.docId || dar.id,
          docCode: docCode,
          doc_code: docCode,
          docTitle: docOfficialTitle,
          docName: docOfficialTitle,
          title: `[DAR ส่งกลับแก้ไข] ${docOfficialTitle} (${docCode})`,
          type: 'Revise', assigneeId: dar.requesterId,
          department: darDept,
          target_department: darDept,
          owner_dept: darDept,
          currentHandlerDepartment: darDept,
          dueDate: reviseSla.dueDate, cancelDate: reviseSla.cancelDate,
          isUrgent: reviseSla.isUrgent, isFastTrack: reviseSla.isFastTrack, priority: reviseSla.isUrgent ? 'URGENT' : 'NORMAL', slaType: reviseSla.slaType, effectiveDate: reviseSla.effectiveDate,
          status: 'NORMAL'
        });
        newNotifications.push({
          id: `notif-dar-return1-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          userId: dar.requesterId,
          targetUserIds: [dar.requesterId],
          title: 'DAR ถูกส่งกลับแก้ไข',
          message: `DAR "${dar.title}" ถูกส่งกลับให้คุณแก้ไข${comment ? `: ${comment}` : ''}`,
          type: 'ACTION_REQUIRED',
          category: 'DAR',
          isRead: false,
          read: false,
          readBy: [],
          link: '/tasks',
          timestamp: new Date().toISOString(),
          relatedTaskId: newTaskId,
          docCode: docCode,
          refId: dar.id
        });
      }
    } else if (task.type === 'Approve') {
      if (action === 'APPROVE') {
        const todayStr = today.toISOString().split('T')[0];
        const isImmediateEffective = !dar.effectiveDate || dar.effectiveDate <= todayStr;

        if (dar.ackRequirement === 'REQUIRED') {
          newStatus = 'WAITING_ACKNOWLEDGEMENT';
        } else {
          newStatus = isImmediateEffective ? 'COMPLETED' : 'APPROVED_WAITING_EFFECTIVE';
        }

        // Notify Requester of Approval
        if (dar.requesterId) {
          newNotifications.push({
            id: `notif-dar-approved-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            userId: dar.requesterId,
            targetUserIds: [dar.requesterId],
            title: 'DAR ได้รับการอนุมัติแล้ว',
            message: `คำร้อง DAR "${dar.title}" ได้รับการอนุมัติเรียบร้อยแล้ว`,
            type: 'SUCCESS',
            category: 'DAR',
            isRead: false,
            read: false,
            readBy: [],
            link: '/tasks',
            timestamp: new Date().toISOString(),
            docCode: dar.docIdInput || dar.title,
            refId: dar.id
          });
        }

        // Notify DCC Admin of Approval (pending DCC processing)
        const dccAdminId = resolveDccAdminUserId(state.masterUsers);
        if (dccAdminId) {
          newNotifications.push({
            id: `notif-dar-dccapp-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            userId: dccAdminId,
            targetUserIds: [dccAdminId],
            title: 'DAR ได้รับการอนุมัติแล้ว (รอ DCC ดำเนินการ)',
            message: `คำร้อง DAR "${dar.title}" ได้รับการอนุมัติแล้ว กรุณาดำเนินการขั้นต่อไป`,
            type: 'TASK_ASSIGNED',
            category: 'DAR',
            isRead: false,
            read: false,
            readBy: [],
            link: '/tasks',
            timestamp: new Date().toISOString(),
            docCode: dar.docIdInput || dar.title,
            refId: dar.id
          });
        }

        if (newStatus === 'WAITING_ACKNOWLEDGEMENT' && dar.ackUserIds?.length > 0) {
          const ackSla = calculateTaskDueDate({
            submissionDate: today,
            effectiveDate: dar.effectiveDate,
            stepSlaDays: 3,
            mockDateOffset: state.mockDateOffset
          });
          const docCode = resolveDarDocumentCode(dar, state.documents, dar.id);
          const docOfficialTitle = dar.name || dar.document_name || dar.docName || dar.title;
          const darDept = dar.department || 'PD';
          dar.ackUserIds.forEach(uid => {
            const newTaskId = `t-${Date.now()}-${uid}`;
            newTasks.push({
              id: newTaskId, referenceType: 'INTERNAL_DAR', referenceId: dar.id, darId: dar.id,
              docId: dar.docId || dar.id,
              docCode: docCode,
              doc_code: docCode,
              docTitle: docOfficialTitle,
              docName: docOfficialTitle,
              title: `[รับทราบเอกสาร] ${docOfficialTitle} (${docCode})`,
              type: 'Ack', assigneeId: uid,
              department: darDept,
              target_department: darDept,
              owner_dept: darDept,
              currentHandlerDepartment: darDept,
              dueDate: ackSla.dueDate, cancelDate: ackSla.cancelDate,
              isUrgent: ackSla.isUrgent, isFastTrack: ackSla.isFastTrack, priority: ackSla.isUrgent ? 'URGENT' : 'NORMAL', slaType: ackSla.slaType, effectiveDate: ackSla.effectiveDate,
              status: 'NORMAL'
            });
            newNotifications.push({
              id: `notif-ack-${Date.now()}-${uid}`,
              userId: uid,
              targetUserIds: [uid],
              title: 'โปรดรับทราบเอกสาร',
              message: `DAR "${dar.title}" บังคับใช้แล้ว โปรดรับทราบ`,
              type: 'ACTION_REQUIRED',
              category: 'DAR',
              isRead: false,
              read: false,
              readBy: [],
              link: '/tasks',
              timestamp: new Date().toISOString(),
              relatedTaskId: newTaskId,
              docCode: docCode,
              refId: dar.id
            });
          });
        }
      } else if (action === 'RETURN') {
        newStatus = 'RETURNED_FOR_REVISION';
        const reviseSla = calculateTaskDueDate({
          submissionDate: today,
          effectiveDate: dar.effectiveDate,
          stepSlaDays: state.slaSettings?.darCreationSlaDays || 3,
          mockDateOffset: state.mockDateOffset
        });
        const newTaskId = `t-${Date.now()}`;
        const docCode = resolveDarDocumentCode(dar, state.documents, dar.id);
        const docOfficialTitle = dar.name || dar.document_name || dar.docName || dar.title;
        const darDept = dar.department || 'PD';
        newTasks.push({
          id: newTaskId, referenceType: 'INTERNAL_DAR', referenceId: dar.id, darId: dar.id,
          docId: dar.docId || dar.id,
          docCode: docCode,
          doc_code: docCode,
          docTitle: docOfficialTitle,
          docName: docOfficialTitle,
          title: `[DAR ส่งกลับแก้ไข] ${docOfficialTitle} (${docCode})`,
          type: 'Revise', assigneeId: dar.requesterId,
          department: darDept,
          target_department: darDept,
          owner_dept: darDept,
          currentHandlerDepartment: darDept,
          dueDate: reviseSla.dueDate, cancelDate: reviseSla.cancelDate,
          isUrgent: reviseSla.isUrgent, isFastTrack: reviseSla.isFastTrack, priority: reviseSla.isUrgent ? 'URGENT' : 'NORMAL', slaType: reviseSla.slaType, effectiveDate: reviseSla.effectiveDate,
          status: 'NORMAL'
        });
        newNotifications.push({
          id: `notif-dar-return2-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          userId: dar.requesterId,
          targetUserIds: [dar.requesterId],
          title: 'DAR ถูกส่งกลับแก้ไข',
          message: `DAR "${dar.title}" ถูกส่งกลับให้คุณแก้ไข${comment ? `: ${comment}` : ''}`,
          type: 'ACTION_REQUIRED',
          category: 'DAR',
          isRead: false,
          read: false,
          readBy: [],
          link: '/tasks',
          timestamp: new Date().toISOString(),
          relatedTaskId: newTaskId,
          docCode: docCode,
          refId: dar.id
        });
      } else if (action === 'REJECT') {
        newStatus = 'REJECTED';
        if (dar.requesterId) {
          newNotifications.push({
            id: `notif-dar-rejected-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            userId: dar.requesterId,
            targetUserIds: [dar.requesterId],
            title: 'คำร้อง DAR ไม่ได้รับการอนุมัติ',
            message: `DAR "${dar.title}" ไม่ผ่านการอนุมัติ${comment ? `: ${comment}` : ''}`,
            type: 'REJECTED',
            category: 'DAR',
            isRead: false,
            read: false,
            readBy: [],
            link: '/tasks',
            timestamp: new Date().toISOString(),
            docCode: dar.docIdInput || dar.title,
            refId: dar.id
          });
        }
      }
    } else if (task.type === 'Ack') {
      if (action === 'ACKNOWLEDGE') {
        // Check if there are other pending Ack tasks for this DAR
        const remainingAcks = newTasks.filter(t => t.darId === dar.id && t.type === 'Ack');
        if (remainingAcks.length === 0) {
          const today = new Date();
          today.setDate(today.getDate() + state.mockDateOffset);
          const todayStr = today.toISOString().split('T')[0];
          
          if (!dar.effectiveDate || dar.effectiveDate <= todayStr) {
            newStatus = 'COMPLETED';
          } else {
            newStatus = 'APPROVED_WAITING_EFFECTIVE';
          }
        }
      }
    }

    const isReviewTask = task.type === 'Review' || task.type === 'REVIEW';
    const isApproveTask = task.type === 'Approve' || task.type === 'APPROVE';

    const updatedSteps = (dar.workflowSteps || []).map(s => {
      if (isReviewTask && (s.role === 'REVIEWER' || s.step === 2)) {
        return {
          ...s,
          userId: s.userId || state.currentUser?.id,
          userName: state.currentUser?.name || s.userName,
          position: state.currentUser?.position || s.position,
          status: action === 'APPROVE' ? 'COMPLETED' : action,
          timestamp: new Date().toISOString()
        };
      }
      if (isApproveTask && (s.role === 'APPROVER' || s.step === 3)) {
        return {
          ...s,
          userId: s.userId || state.currentUser?.id,
          userName: state.currentUser?.name || s.userName,
          position: state.currentUser?.position || s.position,
          status: action === 'APPROVE' ? 'COMPLETED' : action,
          timestamp: new Date().toISOString()
        };
      }
      return s;
    });

    const newHistoryEntry = {
      step: isReviewTask ? 2 : (isApproveTask ? 3 : 1),
      role: isReviewTask ? 'REVIEWER' : (isApproveTask ? 'APPROVER' : 'REQUESTER'),
      action: action === 'APPROVE' ? (isReviewTask ? 'REVIEW' : 'APPROVE') : action,
      userId: state.currentUser?.id,
      userName: state.currentUser?.name,
      timestamp: new Date().toISOString(),
      comment: comment || ''
    };

    const updatedWorkflowHistory = [...(dar.workflowHistory || []), newHistoryEntry];

    const updatedDars = state.dars.map(d => d.id === dar.id ? { 
      ...d, 
      status: newStatus,
      workflowSteps: updatedSteps,
      workflowHistory: updatedWorkflowHistory,
      ...(isReviewTask && action === 'APPROVE' ? { reviewedAt: new Date().toISOString(), reviewerId: state.currentUser?.id, reviewerName: state.currentUser?.name } : {}),
      ...(isApproveTask && action === 'APPROVE' ? { approvedAt: new Date().toISOString(), approverId: state.currentUser?.id, approverName: state.currentUser?.name } : {})
    } : d);
    const updatedDarRequests = (state.darRequests || []).map(d => d.id === dar.id ? { 
      ...d, 
      status: newStatus,
      workflowSteps: updatedSteps,
      workflowHistory: updatedWorkflowHistory,
      ...(isReviewTask && action === 'APPROVE' ? { reviewedAt: new Date().toISOString(), reviewerId: state.currentUser?.id, reviewerName: state.currentUser?.name } : {}),
      ...(isApproveTask && action === 'APPROVE' ? { approvedAt: new Date().toISOString(), approverId: state.currentUser?.id, approverName: state.currentUser?.name } : {})
    } : d);
    if (newStatus === 'COMPLETED' && dar.status !== 'COMPLETED') {
      newlyCompletedDar = { ...dar, status: 'COMPLETED' };
    }

    let timelineActionLabel = action;
    if (action === 'APPROVE') {
      timelineActionLabel = task.type === 'Review' ? 'Reviewed' : 'Approved';
    } else if (action === 'RETURN') {
      timelineActionLabel = 'Returned for Revision';
    } else if (action === 'REJECT') {
      timelineActionLabel = 'Rejected';
    } else if (action === 'ACKNOWLEDGE') {
      timelineActionLabel = 'Acknowledged';
    }

    const newTimeline = [...state.timeline, {
      id: Date.now(), darId: dar.id, action: timelineActionLabel, user: state.currentUser.name, date: new Date().toLocaleString(), comment: comment || '-', isChat: false, userId: state.currentUser.id
    }];

    let updatedDocs = state.documents;
    if (newStatus === 'COMPLETED' || newStatus === 'REJECTED' || newStatus === 'CANCELLED' || (action === 'APPROVE' && (targetTask?.type === 'Approve' || targetTask?.type === 'APPROVE'))) {
      const targetDocCode = dar.document_code || dar.doc_code || dar.code || dar.docCode || dar.title;
      const targetDocId = dar.docIdRef || dar.docId || dar.doc_id || dar.targetDocumentId;
      updatedDocs = (state.documents || []).map(d => {
        const isDocMatch = 
          (targetDocId && String(d.id) === String(targetDocId)) ||
          (targetDocCode && (d.document_code === targetDocCode || d.doc_code === targetDocCode || d.code === targetDocCode || d.title === targetDocCode));
        if (isDocMatch) {
          return {
            ...d,
            isLocked: false,
            hasPendingDar: false
          };
        }
        return d;
      });
    }

    const completedRecord = targetTask ? {
      ...targetTask,
      status: 'COMPLETED',
      is_completed: true,
      completedAt: new Date().toISOString(),
      completedBy: state.currentUser?.name || 'ผู้ใช้งาน',
      completedAction: action,
      comment: comment || '-'
    } : null;

    const updatedCompletedTasks = completedRecord 
      ? [completedRecord, ...(state.completedTasks || []).filter(t => t.id !== taskId)]
      : (state.completedTasks || []);

    const newState = {
      documents: updatedDocs,
      masterDocuments: updatedDocs,
      tasks: newTasks,
      completedTasks: updatedCompletedTasks,
      notifications: newNotifications,
      dars: updatedDars,
      darRequests: updatedDarRequests,
      timeline: newTimeline,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: `WORKFLOW_${action}`,
        details: `Processed task ${taskId} (${action}) for DAR ${dar.title}`,
        actor: state.currentUser.name,
        actorId: state.currentUser.id,
        actorRole: state.currentUser.role || state.currentUser.position,
        date: new Date().toISOString()
      }, ...(state.actionLog || [])]
    };

    return newState;
    });

    const isApproveFinal = (targetTask?.type === 'Approve' || targetTask?.type === 'APPROVE') && action === 'APPROVE';
    const targetDarToPublish = isApproveFinal ? { ...targetDar, status: newStatus || 'COMPLETED' } : newlyCompletedDar;
    if (targetDarToPublish) {
      const store = get();
      
      if (targetDarToPublish.status === 'COMPLETED') {
        const existingMaster = store.masterDocuments?.find(d => d.docNo === targetDarToPublish.docNo || (d.docCode && d.docCode === targetDarToPublish.docNo));
        if (!existingMaster && targetDarToPublish.docNo) {
          const activeFileId = targetDarToPublish.fileId || targetDarToPublish.file_id || targetDarToPublish.attachedFile?.fileId || targetDarToPublish.attachedFile?.id;
          const activeAttachedFile = targetDarToPublish.attachedFile || null;
          const newDocRecordId = `doc-${Date.now()}`;
          const newMasterDoc = {
            id: newDocRecordId,
            docNo: targetDarToPublish.docNo,
            docCode: targetDarToPublish.docNo,
            title: targetDarToPublish.documentName || targetDarToPublish.title,
            type: targetDarToPublish.documentType || targetDarToPublish.type || 'SOP',
            department: 'QC',
            departmentName: 'ฝ่ายประกันและควบคุมคุณภาพ',
            edition: targetDarToPublish.edition || '00',
            revision: targetDarToPublish.revision || '00',
            effectiveDate: targetDarToPublish.effectiveDate || new Date().toISOString().split('T')[0],
            status: 'ACTIVE',
            accessLevel: targetDarToPublish.securityLevel || 'General',
            distributionCopies: targetDarToPublish.distributionCopies || [],
            darNo: targetDarToPublish.darNo || targetDarToPublish.darNumber || targetDarToPublish.id,
            darId: targetDarToPublish.id,
            fileId: activeFileId || null,
            attachedFile: activeAttachedFile,
            file: targetDarToPublish.file || activeAttachedFile || null,
            fileUrl: targetDarToPublish.fileUrl || null,
            fileName: targetDarToPublish.fileName || activeAttachedFile?.name || null,
            createdAt: new Date().toISOString(),
            approvedAt: new Date().toISOString()
          };
          if (activeFileId) {
            getFile(activeFileId).then(blob => {
              if (blob) {
                if (targetDarToPublish.docNo) saveFile(targetDarToPublish.docNo, blob).catch(() => {});
                saveFile(newDocRecordId, blob).catch(() => {});
                if (targetDarToPublish.id) saveFile(targetDarToPublish.id, blob).catch(() => {});
              }
            }).catch(() => {});
          }
          if (store.addMasterDocument) {
            store.addMasterDocument(newMasterDoc);
          }
        }
      }
      
      if (store.syncRevisionEffective) store.syncRevisionEffective(targetDarToPublish);
      if (store.syncObsoleteCompleted) store.syncObsoleteCompleted(targetDarToPublish);
      if (store.publishApprovedDar) {
        store.publishApprovedDar(targetDarToPublish.id);
      } else {
        const dType = String(targetDarToPublish.type || targetDarToPublish.requestType || '').toUpperCase();
        if (dType === 'REVISION' || dType === 'REVISE') {
          store.publishDarRevision(targetDarToPublish.id);
        } else if (dType === 'OBSOLETE') {
          store.publishObsoleteDar(targetDarToPublish.id);
        } else if (dType === 'NEW' || dType === 'NEW_DOCUMENT') {
          store.publishNewDocumentDar(targetDarToPublish.id);
        }
      }
      // The published record needs its own review cycle; the superseded one's schedule retires
      store.syncPeriodicReviewSchedulesAndTasks?.();
      
      // Asynchronous Stamp Generation for Approved DAR
      const dType = String(targetDarToPublish.type || targetDarToPublish.requestType || '').toUpperCase();
      if (dType !== 'OBSOLETE' && dType !== 'OBSOLETE_DOCUMENT') {
        if (store.finalizeAndPublishMaster) {
          store.finalizeAndPublishMaster(targetDarToPublish.id);
        } else if (store.stampFinalApprovalPdf) {
          store.stampFinalApprovalPdf(targetDarToPublish.id);
        }
      }
    }
  },

  resubmitDar: (darId, updatedData, taskId) => set((state) => {
    const dar = state.dars.find(d => d.id === darId);
    if (!dar) return state;

    const newTasks = state.tasks.filter(t => t.id !== taskId);
    const updatedDars = state.dars.map(d => d.id === darId ? { ...d, ...updatedData, status: 'UNDER_REVIEW' } : d);
    let newNotifications = [...state.notifications];

    const reviewerObj = resolveReviewer(
      dar.requesterId, 
      dar.department, 
      state.masterUsers, 
      state.reviewUsers, 
      dar.docType || dar.doc_type, 
      state.approvalMatrix
    );
    const assignedReviewerId = reviewerObj?.id || reviewerObj;

    if (assignedReviewerId) {
      const today = new Date();
      today.setDate(today.getDate() + state.mockDateOffset);
      const _todayStr = today.toISOString().split('T')[0];
      const taskSla = calculateTaskDueDate({
        submissionDate: today,
        effectiveDate: updatedData.effectiveDate || dar.effectiveDate,
        stepSlaDays: state.slaSettings?.reviewSlaDays || 3,
        mockDateOffset: state.mockDateOffset
      });

      const docCode = resolveDarDocumentCode({ ...dar, ...updatedData }, state.documents, dar.id);
      const docOfficialTitle = updatedData.name || dar.name || updatedData.docTitle || dar.docTitle || updatedData.title || dar.title;
      const darDept = dar.department || updatedData.department || 'PD';
      newTasks.push({
        id: `t-${Date.now()}`,
        referenceType: 'INTERNAL_DAR', referenceId: dar.id,
        darId: dar.id,
        docId: dar.docId || dar.id,
        docCode: docCode,
        doc_code: docCode,
        docTitle: docOfficialTitle,
        docName: docOfficialTitle,
        title: `[DAR ทบทวนใหม่] ${docOfficialTitle} (${docCode})`,
        type: 'Review',
        assigneeId: assignedReviewerId,
        department: darDept,
        target_department: darDept,
        owner_dept: darDept,
        currentHandlerDepartment: darDept,
        currentHandlerLevel: reviewerObj?.level || 4,
        dueDate: taskSla.dueDate,
        cancelDate: taskSla.cancelDate,
        isUrgent: taskSla.isUrgent,
        isFastTrack: taskSla.isFastTrack,
        priority: taskSla.isUrgent ? 'URGENT' : 'NORMAL',
        slaType: taskSla.slaType,
        effectiveDate: taskSla.effectiveDate,
        status: 'NORMAL'
      });
      newNotifications.push({ id: Date.now() + Math.random(), userId: assignedReviewerId, title: 'งานใหม่รอการตรวจสอบ', message: `DAR "${updatedData.title || dar.title}" ถูกส่งมาใหม่ รอการตรวจสอบจากคุณ`, isRead: false, link: '/tasks', timestamp: new Date().toISOString() });
    }

    return {
      dars: updatedDars,
      tasks: newTasks,
      notifications: newNotifications,
      timeline: [...state.timeline, {
        id: Date.now(), darId: dar.id, action: 'Resubmitted', user: state.currentUser.name, date: new Date().toLocaleString(), comment: 'Resubmitted after revision'
      }],
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: `DAR_RESUBMIT`,
        details: `Resubmitted DAR ${dar.title}`,
        actor: state.currentUser.name,
        actorId: state.currentUser.id,
        actorRole: state.currentUser.role || state.currentUser.position,
        date: new Date().toISOString()
      }, ...(state.actionLog || [])]
    };
  }),

  addComment: (darId, commentStr, user) => set((state) => {
    const cleanDarId = String(darId || '').trim();
    if (!cleanDarId || !commentStr?.trim()) return state;
    const newTimeline = [...state.timeline, {
      id: Date.now(),
      darId: cleanDarId,
      action: 'Comment',
      user: user?.name || user?.fullName || 'ผู้ใช้งาน',
      date: new Date().toLocaleDateString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      comment: commentStr.trim(),
      isChat: true,
      userId: user?.id || user?.empId || 'U-GUEST'
    }];
    return { timeline: newTimeline };
  }),

  createDAR: (darPayload) => {
    return get().addDarAndReturnId(darPayload);
  },

  cancelDar: (darId) => {
    const targetDar = get().dars?.find(d => d.id === darId);
    set((state) => {
      const updatedDars = state.dars.map(d => d.id === darId ? { ...d, status: 'CANCELLED' } : d);
      return { dars: updatedDars };
    });
    
    set((state) => {
      return {
        dars: state.dars.filter(d => d.id !== darId),
        tasks: state.tasks.filter(t => t.darId !== darId),
        timeline: state.timeline.filter(t => t.darId !== darId),
        actionLog: [{
          id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          actionType: 'DAR_CANCEL',
          actor: state.currentUser.name,
          details: `Cancelled DAR ${darId}`,
          timestamp: new Date().toISOString()
        }, ...(state.actionLog || [])]
      };
    });

    const store = get();
    const linkedSched = (store.periodicReviewSchedules || []).find(s =>
      s.linkedActionId === darId || (targetDar?.sourceId && s.id === targetDar.sourceId)
    );
    const linkedDoc = (store.documents || []).find(d =>
      d.linkedActionId === darId || (targetDar?.targetDocumentId && d.id === targetDar.targetDocumentId)
    );
    if (linkedSched || linkedDoc) {
      store.resetPendingReviewIntent(linkedSched?.id || linkedDoc?.id);
    }
  },

  publishObsoleteDar: (darId) => set((state) => {
    const dar = state.dars.find(d => d.id === darId || d.dar_no === darId);
    if (!dar) return state;

    const targetDocId = dar.docIdRef || dar.docId || dar.doc_id || dar.targetDocumentId;
    const refDoc = targetDocId ? state.documents.find(d => String(d.id) === String(targetDocId)) : null;
    let targetDocCode = dar.document_code || dar.doc_code || dar.docCode || dar.docIdInput || (refDoc ? (refDoc.document_code || refDoc.doc_code || refDoc.code || refDoc.docCode || refDoc.title) : null);
    if (!targetDocCode && dar.title) {
      targetDocCode = dar.title.startsWith('[') ? dar.title.replace(/^\[.*?\]\s*/, '') : dar.title;
    }
    const obsoleteAt = new Date().toISOString();
    const darNo = dar.dar_no || dar.id;
    const docOfficialTitle = refDoc?.title || dar.doc_name || dar.document_title || dar.title || targetDocCode || 'เอกสาร';

    // Rule 2: Cascade Obsolete All Historical Versions (ยกเลิกยกตระกูล)
    // Matches EVERY Revision having the same document code, whether previously ACTIVE or SUPERSEDED
    const isDocMatchCode = (doc) => {
      if (targetDocId && String(doc.id) === String(targetDocId)) return true;
      const docCode = doc.document_code || doc.doc_code || doc.code || doc.docCode || doc.title;
      if (targetDocCode && docCode && docCode.trim().toLowerCase() === targetDocCode.trim().toLowerCase()) return true;
      if (refDoc) {
        const refCode = refDoc.document_code || refDoc.doc_code || refDoc.code || refDoc.docCode || refDoc.title;
        if (refCode && docCode && docCode.trim().toLowerCase() === refCode.trim().toLowerCase()) return true;
      }
      return false;
    };

    // 1. Cascade Obsolete: Mark EVERY Revision of this document code OBSOLETE
    const updatedDocs = state.documents.map(doc => {
      if (isDocMatchCode(doc)) {
        const existingHist = Array.isArray(doc.revision_history) ? [...doc.revision_history] : [];
        const curRev = String(doc.revision || doc.rev || '01').replace(/^Rev\.?/i, '').padStart(2, '0');
        if (!existingHist.some(h => String(h.revision || h.rev || '').replace(/^Rev\.?/i, '').padStart(2, '0') === curRev && h.type !== 'OBSOLETE')) {
          existingHist.push({
            dar_no: doc.dar_no || doc.darNo || doc.darId || `DAR-PREV-R${curRev}`,
            revision: curRev,
            rev: curRev,
            type: curRev === '00' ? 'NEW' : 'REVISION',
            status: 'COMPLETED',
            effective_date: doc.effectiveDate || doc.effective_date,
            date: doc.effectiveDate || doc.effective_date,
            reason: doc.reason || doc.change_details || 'ประวัติการประกาศใช้เดิม',
            file: doc.file,
            fileBlob: doc.fileBlob
          });
        }
        if (!existingHist.some(h => h.type === 'OBSOLETE' || h.request_type === 'OBSOLETE')) {
          existingHist.push({
            dar_no: darNo,
            revision: curRev,
            rev: curRev,
            target_revision: curRev,
            type: 'OBSOLETE',
            request_type: 'OBSOLETE',
            status: 'COMPLETED',
            effective_date: obsoleteAt.split('T')[0],
            date: obsoleteAt.split('T')[0],
            reason: dar.obsoleteReason || dar.reason || 'ถูกยกเลิกตามคำร้อง DAR'
          });
        }

        return {
          ...doc,
          status: 'OBSOLETE',
          is_active: false,
          is_superseded: false,
          is_obsolete: true,
          obsolete_at: obsoleteAt,
          obsoleted_at: obsoleteAt,
          obsolete_dar_id: darNo,
          obsolete_reason: dar.obsoleteReason || dar.reason || 'ถูกยกเลิกตามคำร้อง DAR',
          obsolete_detail: dar.obsoleteDetail || dar.description || '',
          revision_history: existingHist
        };
      }
      return doc;
    });

    // 2. Set all active copies across ALL revisions to OBSOLETE_PENDING_RECALL
    const copies = (state.controlledCopyInstances && state.controlledCopyInstances.length > 0)
      ? state.controlledCopyInstances
      : (state.documentControlledCopies || []);

    const isMatchCopy = (copy) => {
      const copyDocCode = copy.document_code || copy.doc_code || copy.docTitle;
      const matchDoc = 
        (targetDocId && (String(copy.doc_id) === String(targetDocId) || String(copy.docId) === String(targetDocId))) ||
        (targetDocCode && copyDocCode && copyDocCode.trim().toLowerCase() === targetDocCode.trim().toLowerCase()) ||
        (refDoc && copyDocCode && (refDoc.document_code || refDoc.code || refDoc.title) === copyDocCode) ||
        updatedDocs.some(d => (String(d.id) === String(copy.doc_id || copy.docId) || (d.document_code || d.code || d.title) === copyDocCode) && d.status === 'OBSOLETE');
      const isActive = copy.status === 'ISSUED_ACTIVE' || copy.status === 'ACTIVE' || copy.status === 'RECEIVED' || copy.status === 'DISPATCHED_PENDING_RECEIPT' || copy.status === 'PENDING_RECALL' || copy.status === 'OBSOLETE_PENDING_RECALL' || copy.status === 'SUPERSEDED_PENDING_RECALL';
      return matchDoc && isActive;
    };

    const obsoleteCopiesToRecall = copies.filter(isMatchCopy);

    const updatedCopies = copies.map(copy => {
      if (isMatchCopy(copy)) {
        return {
          ...copy,
          status: 'OBSOLETE_PENDING_RECALL',
          recall_reason: `เอกสารถูกขอยกเลิกถาวร (Obsolete DAR: ${darNo})`,
          obsolete_pending_at: obsoleteAt,
        };
      }
      return copy;
    });

    // 3. Update DAR status to COMPLETED
    const updatedDars = state.dars.map(d => d.id === dar.id ? { ...d, status: 'COMPLETED' } : d);

    // 4. Task Invalidation: Invalidate/dismiss pending workflow & receipt tasks for this obsoleted document
    const invalidatedTasks = state.tasks.filter(t => {
      const isTargetDocTask = 
        (t.doc_code && t.doc_code === targetDocCode) ||
        (t.docTitle && t.docTitle === targetDocCode) ||
        (t.document_code && t.document_code === targetDocCode) ||
        (targetDocId && String(t.docId) === String(targetDocId)) ||
        (t.darId && String(t.darId) === String(dar.id));
      const isPendingWorkflowOrReceipt = 
        t.type === 'RECEIPT' || 
        t.type === 'Review' || 
        t.type === 'Approve' || 
        t.type === 'Ack' || 
        t.type === 'CONFIRM_RECEIPT' || 
        t.type === 'DEPT_CONFIRM_HARDCOPY_RECEIPT' || 
        t.type === 'DCC_DISTRIBUTE' || 
        t.type === 'DCC_ISSUE';
      return !(isTargetDocTask && isPendingWorkflowOrReceipt);
    });

    // 5. Create DCC Recall Task
    const newTasks = [...invalidatedTasks];
    if (obsoleteCopiesToRecall.length > 0 || (dar.recallPlan && dar.recallPlan.length > 0) || (dar.totalControlledCopies && dar.totalControlledCopies > 0) || (dar.controlledCopy && dar.controlledCopy > 0)) {
      const matchedDoc = (state.documents || []).find(d => (targetDocCode && (d.title === targetDocCode || d.document_code === targetDocCode)) || (targetDocId && String(d.id) === String(targetDocId)));
      const docOfficialTitle = matchedDoc?.name || matchedDoc?.document_name || dar.name || targetDocCode;
      newTasks.push({
        id: `task-recall-${targetDocCode}-ALL-${Date.now()}`,
        type: 'DCC_RECALL',
            assignee_department: 'DC',
            document_department: 'QC',
        taskType: 'RECALL',
        task_type: 'RECALL',
        targetRole: 'DCC_ADMIN',
        target_role: 'DCC_ADMIN',
        assignedToRole: 'DCC_ADMIN',
        assigneeId: resolveDccAdminUserId(state.masterUsers),
        department: 'DC',
        target_department: 'DC',
        docId: targetDocId,
        doc_id: targetDocId,
        document_code: targetDocCode,
        doc_code: targetDocCode,
        docCode: targetDocCode,
        docTitle: docOfficialTitle,
        docName: docOfficialTitle,
        targetRevision: 'ALL',
        revision: 'ALL',
        doc_version: 'ALL',
        title: `[เรียกคืนสำเนาขอยกเลิก] เรียกคืนเอกสาร Controlled Copy: ${docOfficialTitle} (${targetDocCode})`,
        description: `เอกสาร ${targetDocCode} ทุก Revision ถูกยกเลิกถาวรตาม ${darNo} กรุณาเรียกคืนสำเนาจากทุกจุด (${obsoleteCopiesToRecall.length} ชุด) และดำเนินการทำลาย/ประทับตรา OBSOLETE`,
        copies_to_recall: obsoleteCopiesToRecall.map(c => ({
          id: c.id,
          copy_no: c.copy_no || c.copyNo,
          holder_dept: c.holder_dept || c.department,
          location: c.location || c.locationName,
          status: c.status
        })),
        supersededCopyIds: obsoleteCopiesToRecall.map(c => c.id),
        status: 'PENDING',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        priority: 'HIGH',
        darId: dar.id,
        createdAt: obsoleteAt
      });
    }

    // 6. Audit log
    const auditLog = {
      id: `audit-obs-${Date.now()}`,
      timestamp: obsoleteAt,
      user: state.currentUser ? state.currentUser.name : 'System',
      action: 'DOCUMENT_OBSOLETED',
      docTitle: targetDocCode,
      remarks: `เอกสาร ${targetDocCode} ทุก Revision ถูกยกเลิกถาวรตามคำร้อง ${darNo} (Cascade Obsolete) — รอ DCC เรียกคืนสำเนา ${obsoleteCopiesToRecall.length} ชุด`,
      actionType: 'DOCUMENT_OBSOLETED',
      actor: state.currentUser ? state.currentUser.name : 'System',
      details: `เอกสาร ${targetDocCode} ทุก Revision ถูกยกเลิกถาวรตามคำร้อง ${darNo} (Cascade Obsolete) — รอ DCC เรียกคืนสำเนา ${obsoleteCopiesToRecall.length} ชุด`
    };

    const actionLogEntry = {
      id: `LOG-OBS-${Date.now()}`,
      actionType: 'DOCUMENT_OBSOLETED',
      action: 'DOCUMENT_OBSOLETED',
      actor: state.currentUser ? state.currentUser.name : 'System',
      details: `เอกสาร ${targetDocCode} ทุก Revision ถูกยกเลิกถาวรตามคำร้อง ${darNo} (Cascade Obsolete) — รอ DCC เรียกคืนสำเนา ${obsoleteCopiesToRecall.length} ชุด`,
      timestamp: obsoleteAt
    };

    const newNotifications = [...(state.notifications || [])];
    if (dar.requesterId) {
      newNotifications.push({
        id: `notif-obs-req-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        userId: dar.requesterId,
        targetUserIds: [dar.requesterId],
        title: 'คำร้องขอยกเลิกเอกสารสำเร็จ',
        message: `คำร้องยกเลิกเอกสาร "${docOfficialTitle}" (${targetDocCode}) ได้รับการดำเนินการเรียบร้อยแล้ว`,
        type: 'SUCCESS',
        category: 'DAR',
        isRead: false,
        read: false,
        readBy: [],
        link: '/dcc/library',
        timestamp: obsoleteAt,
        docCode: targetDocCode,
        refId: dar.id
      });
    }

    newNotifications.push({
      id: `notif-obs-broad-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      isGlobal: true,
      targetDepartment: dar.department,
      title: `ประกาศยกเลิกเอกสาร: ${targetDocCode}`,
      message: `เอกสาร "${docOfficialTitle}" (${targetDocCode}) ถูกยกเลิกถาวร (Obsolete) แล้ว ห้ามนำไปใช้งานหรืออ้างอิง`,
      type: 'OBSOLETE',
      category: 'DAR',
      isRead: false,
      read: false,
      readBy: [],
      link: '/dcc/library',
      timestamp: obsoleteAt,
      docCode: targetDocCode,
      refId: dar.id
    });

    if (obsoleteCopiesToRecall.length > 0) {
      const dccAdminId = resolveDccAdminUserId(state.masterUsers);
      if (dccAdminId) {
        newNotifications.push({
          id: `notif-obs-recall-dcc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          userId: dccAdminId,
          targetUserIds: [dccAdminId],
          title: 'ภาระงานเรียกคืนสำเนาเอกสารยกเลิกถาวร',
          message: `เอกสาร ${targetDocCode} ถูกยกเลิกถาวรตาม ${darNo} กรุณาเรียกคืนสำเนาจากทุกจุด (${obsoleteCopiesToRecall.length} ชุด)`,
          type: 'TASK_ASSIGNED',
          category: 'CONTROLLED_COPY',
          isRead: false,
          read: false,
          readBy: [],
          link: '/controlled-copy',
          timestamp: obsoleteAt,
          docCode: targetDocCode,
          refId: dar.id
        });
      }

      const holderDepts = Array.from(new Set(obsoleteCopiesToRecall.map(c => c.holder_dept || c.department).filter(Boolean)));
      holderDepts.forEach(dept => {
        newNotifications.push({
          id: `notif-obs-recall-dept-${dept}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          targetDepartment: dept,
          isGlobal: false,
          title: `แจ้งเตือนเรียกคืนสำเนาเอกสารยกเลิก: ${targetDocCode}`,
          message: `เอกสาร ${targetDocCode} ถูกยกเลิกถาวรแล้ว กรุณาส่งคืนสำเนาควบคุมทั้งหมดต่อเจ้าหน้าที่ DCC`,
          type: 'ACTION_REQUIRED',
          category: 'CONTROLLED_COPY',
          isRead: false,
          read: false,
          readBy: [],
          link: '/controlled-copy',
          timestamp: obsoleteAt,
          docCode: targetDocCode,
          refId: dar.id
        });
      });
    }

    return {
      documents: updatedDocs,
      dars: updatedDars,
      controlledCopyInstances: updatedCopies,
      documentControlledCopies: updatedCopies,
      tasks: newTasks,
      controlledCopyAuditTrail: [auditLog, ...(state.controlledCopyAuditTrail || [])],
      notifications: newNotifications,
      actionLog: [actionLogEntry, ...(state.actionLog || [])]
    };
  }),

  obsoleteDocument: (docIdOrCode, reason = 'ขอยกเลิกเอกสาร', customDarNo = null) => set((state) => {
    const obsoleteAt = new Date().toISOString();
    const todayStr = obsoleteAt.split('T')[0];
    const darNo = customDarNo || `DAR-${new Date().getFullYear()}-OBS`;
    const targetCodeUpper = String(docIdOrCode || '').replace(/^\[OBSOLETE\]\s*/i, '').trim().toUpperCase();

    const isMatch = (doc) => {
      const dId = String(doc.id || '');
      const dCode = String(doc.document_code || doc.code || doc.doc_code || doc.title || '').replace(/^\[OBSOLETE\]\s*/i, '').trim().toUpperCase();
      return dId === String(docIdOrCode) || (targetCodeUpper && dCode === targetCodeUpper);
    };

    const updatedDocuments = (state.documents || []).map(doc => {
      if (isMatch(doc)) {
        const existingHist = Array.isArray(doc.revision_history) ? [...doc.revision_history] : [];
        const curRev = String(doc.revision || doc.rev || '01').replace(/^Rev\.?/i, '').padStart(2, '0');
        if (!existingHist.some(h => String(h.revision || h.rev || '').replace(/^Rev\.?/i, '').padStart(2, '0') === curRev && h.type !== 'OBSOLETE')) {
          existingHist.push({
            dar_no: doc.dar_no || doc.darNo || doc.darId || `DAR-PREV-R${curRev}`,
            revision: curRev,
            rev: curRev,
            type: curRev === '00' ? 'NEW' : 'REVISION',
            status: 'COMPLETED',
            effective_date: doc.effectiveDate || doc.effective_date,
            date: doc.effectiveDate || doc.effective_date,
            reason: doc.reason || doc.change_details || 'ประวัติการประกาศใช้เดิม',
            file: doc.file,
            fileBlob: doc.fileBlob
          });
        }
        if (!existingHist.some(h => h.type === 'OBSOLETE' || h.request_type === 'OBSOLETE')) {
          existingHist.push({
            dar_no: darNo,
            revision: curRev,
            rev: curRev,
            target_revision: curRev,
            type: 'OBSOLETE',
            request_type: 'OBSOLETE',
            status: 'COMPLETED',
            effective_date: todayStr,
            date: todayStr,
            reason: reason || 'ขอยกเลิกเอกสาร'
          });
        }

        return {
          ...doc,
          status: 'OBSOLETE',
          is_active: false,
          is_superseded: false,
          is_obsolete: true,
          obsolete_at: obsoleteAt,
          obsoleted_at: obsoleteAt,
          obsolete_dar_id: darNo,
          obsolete_reason: reason,
          revision_history: existingHist
        };
      }
      return doc;
    });

    return { documents: updatedDocuments };
  }),

  publishNewDocumentDar: (darId) => set((state) => {
    const dar = state.dars.find(d => d.id === darId || d.dar_no === darId || d.darNumber === darId);
    if (!dar) return state;

    const today = new Date();
    today.setDate(today.getDate() + (state.mockDateOffset || 0));
    const todayStr = state.simulatedDate || today.toISOString().split('T')[0];
    const isEffectiveTodayOrPast = !dar.effectiveDate || dar.effectiveDate <= todayStr;
    const docStatus = isEffectiveTodayOrPast ? 'EFFECTIVE' : 'SCHEDULED_EFFECTIVE';

    const targetCode = dar.docIdInput || dar.document_code || dar.doc_code || dar.docCode || dar.code || dar.title;
    const docName = dar.title || dar.name || targetCode;
    const isFormDoc = Boolean(
      dar.docType === 'FM' ||
      dar.doc_type === 'FM' ||
      dar.type === 'FM' ||
      (targetCode && String(targetCode).startsWith('FM')) ||
      (dar.title && String(dar.title).startsWith('FM'))
    );

    // Check if document already exists
    const existingIndex = state.documents.findIndex(d => 
      (dar.id && String(d.darId) === String(dar.id)) || 
      (targetCode && (d.document_code === targetCode || d.code === targetCode || d.title === targetCode))
    );

    let updatedDocs = [...state.documents];
    let createdDoc;

    const rawDept = dar.department || dar.dept || dar.departmentId || 'QC';
    const cleanDept = getCleanDept(rawDept);
    const deptObj = (state.masterDepartments || []).find(d => d.id === cleanDept || d.code === cleanDept);
    const deptName = dar.departmentName || deptObj?.nameTh || (cleanDept === 'QC' ? 'ฝ่ายประกันและควบคุมคุณภาพ' : cleanDept);

    if (existingIndex >= 0) {
      createdDoc = {
        ...updatedDocs[existingIndex],
        status: docStatus,
        department: cleanDept,
        departmentName: updatedDocs[existingIndex].departmentName || deptName,
        dept: cleanDept,
        owner_dept: cleanDept,
        effectiveDate: dar.effectiveDate || todayStr,
        effective_date: dar.effectiveDate || todayStr,
        published_at: isEffectiveTodayOrPast ? (updatedDocs[existingIndex].published_at || new Date().toISOString()) : null,
        access_control: dar.access_control || updatedDocs[existingIndex].access_control || { scope: 'GENERAL' },
        distributions: isFormDoc ? [] : (dar.distributions && dar.distributions.length > 0 ? dar.distributions : updatedDocs[existingIndex].distributions)
      };
      updatedDocs[existingIndex] = createdDoc;
    } else {
      const activeFileId = dar.fileId || dar.file_id || dar.attachedFile?.fileId || dar.attachedFile?.id;
      const activeAttachedFile = dar.attachedFile || null;
      createdDoc = {
        id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        darId: dar.id,
        darNumber: dar.darNumber || dar.id,
        document_code: targetCode,
        code: targetCode,
        title: targetCode,
        name: docName,
        docName: docName,
        status: docStatus,
        rev: dar.rev || dar.revision || '00',
        revision: dar.rev || dar.revision || '00',
        docType: dar.docType || (targetCode ? targetCode.split('-')[0] : 'SOP'),
        department: cleanDept,
        departmentName: deptName,
        dept: cleanDept,
        owner_dept: cleanDept,
        ownerId: dar.requesterId || dar.requester_id,
        requesterId: dar.requesterId,
        effectiveDate: dar.effectiveDate || todayStr,
        effective_date: dar.effectiveDate || todayStr,
        published_at: isEffectiveTodayOrPast ? new Date().toISOString() : null,
        distributions: isFormDoc ? [] : (dar.distributions || []),
        access_control: dar.access_control || { scope: 'GENERAL' },
        fileId: activeFileId || null,
        attachedFile: activeAttachedFile,
        file: dar.file || activeAttachedFile || null,
        fileName: dar.fileName || activeAttachedFile?.name || null,
        relatedStandards: dar.relatedStandards || []
      };
      if (activeFileId) {
        getFile(activeFileId).then(blob => {
          if (blob) {
            if (targetCode) saveFile(targetCode, blob).catch(() => {});
            saveFile(createdDoc.id, blob).catch(() => {});
            if (dar.id) saveFile(dar.id, blob).catch(() => {});
          }
        }).catch(() => {});
      }
      updatedDocs.push(createdDoc);
    }

    // Controlled Copies & DCC Distribution (Non-blocking for digital publishing)
    let newCreatedCopies = [];
    let newAuditLogs = [...(state.controlledCopyAuditTrail || [])];
    let newTasks = [...state.tasks];
    const currentCopies = (state.controlledCopyInstances && state.controlledCopyInstances.length > 0)
      ? state.controlledCopyInstances
      : (state.documentControlledCopies || []);

    if (!isFormDoc) {
      const allocations = calculateCopyAllocations(createdDoc.department, createdDoc.distributions || []);
      const allTargets = allocations.allAllocations || [];

      if (allTargets.length > 0) {
        allTargets.forEach((dist, idx) => {
          const deptName = dist.departmentId || dist.dept || dist.dept_code || createdDoc.department;
          const locName = cleanLocationName(dist.station_name || dist.locationName || dist.name || dist.location || `${deptName} Head Office`);
          const locId = dist.station_id || dist.locationId || dist.id || `${deptName}-LOC-${idx + 1}`;
          const copyNo = dist.copy_no || dist.copyNo || String(idx + 1).padStart(2, '0');
          const nextCcNum = `CC-${String(idx + 1).padStart(3, '0')}`;
          const isOrigin = dist.isOwner || dist.copyNo === '01' || copyNo === '01';

          const copyDocCode = targetCode || createdDoc.document_code || createdDoc.code || createdDoc.doc_code || createdDoc.title;
          const copyDocTitle = createdDoc.document_title || createdDoc.docName || createdDoc.name || dar.title || copyDocCode;
          const copyId = buildControlledCopyId(copyDocCode, createdDoc.rev, copyNo);
          const newInst = {
            id: copyId,
            doc_id: createdDoc.id,
            docId: createdDoc.id,
            document_code: copyDocCode,
            doc_code: copyDocCode,
            docCode: copyDocCode,
            document_title: copyDocTitle,
            doc_title: copyDocTitle,
            docName: copyDocTitle,
            docTitle: copyDocCode,
            doc_version: createdDoc.rev,
            rev: createdDoc.rev,
            copy_no: copyNo,
            copyNo: copyNo,
            ccNumber: nextCcNum,
            issue_no: '01',
            issueNumber: 'I01',
            holder_dept: deptName,
            department: deptName,
            departmentId: deptName,
            dept_code: deptName,
            target_department: deptName,
            targetDepartment: deptName,
            recipientDepartment: deptName,
            recipient_department: deptName,
            owner_dept: createdDoc.department,
            holder_name: `${deptName} (${locName})`,
            location: locName,
            locationName: locName,
            locationId: locId,
            station_id: locId,
            station_name: locName,
            is_master: false,
            isMaster: false,
            is_owner: isOrigin,
            isOwner: isOrigin,
            copy_type: 'CONTROLLED',
            copyType: 'CONTROLLED',
            status: 'PENDING_ISSUE',
            is_active_in_field: false,
            received_by: null,
            received_at: null,
            is_replacement: false,
            dispatched_at: null,
            dispatched_by: null,
            dateIssued: todayStr,
            receipt_confirmed_at: null,
            receipt_confirmed_by: null,
            receipt_remarks: null,
            recall_task_id: null
          };

          const alreadyExists = currentCopies.some(c => c.id === copyId || (
            (c.doc_code === copyDocCode || c.docTitle === copyDocCode || c.docId === createdDoc.id) &&
            String(c.rev || c.doc_version || c.revision) === String(createdDoc.rev) &&
            String(c.copy_no || c.copyNo || c.ccNumber).replace(/\D/g, '') === String(copyNo).replace(/\D/g, '')
          )) || newCreatedCopies.some(c => c.id === copyId);

          if (!alreadyExists) {
            newCreatedCopies.push(newInst);
          }

          newAuditLogs.unshift({
            id: `audit-${Date.now()}-${idx}`,
            timestamp: new Date().toISOString(),
            user: 'System (Lifecycle Engine)',
            action: 'AUTO_GENERATE',
            docTitle: newInst.docTitle,
            docRev: newInst.rev,
            ccNumber: newInst.ccNumber,
            oldStatus: '-',
            newStatus: newInst.status,
            remarks: `Auto-generated CC for ${deptName} (${locName}) upon document effective`
          });
        });

        const hasExistingDistTask = newTasks.some(t => t.darId === dar.id && t.type === 'DCC_DISTRIBUTE');
        if (!hasExistingDistTask) {
          const distSla = calculateTaskDueDate({
            submissionDate: new Date(),
            effectiveDate: dar.effectiveDate || createdDoc.effectiveDate,
            stepSlaDays: state.slaSettings?.hardcopyReceiptSlaDays || 3,
            mockDateOffset: state.mockDateOffset
          });
          const distDocOfficialTitle = createdDoc.name || dar.name || createdDoc.title;
          newTasks.push({
            id: `task-dist-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            title: `แจกจ่ายเอกสาร Controlled Copy (NEW): ${distDocOfficialTitle} (${createdDoc.title})`,
            description: `กรุณาพิมพ์และแจกจ่ายสำเนาควบคุมสำหรับเอกสาร ${createdDoc.title} (${distDocOfficialTitle}) จำนวน ${allTargets.length} แผนก/จุดใช้งาน`,
            type: 'DCC_DISTRIBUTE',
            assignee_department: 'DC',
            document_department: 'QC',
            status: 'PENDING',
            assigneeId: resolveDccAdminUserId(state.masterUsers),
            assignedToRole: 'DCC_ADMIN',
            target_role: 'DCC',
            department: 'DC',
            target_department: 'DC',
            docId: createdDoc.id,
            doc_id: createdDoc.id,
            document_code: createdDoc.title,
            doc_code: createdDoc.title,
            docCode: createdDoc.title,
            docTitle: distDocOfficialTitle,
            docName: distDocOfficialTitle,
            dueDate: distSla.dueDate,
            cancelDate: distSla.cancelDate,
            isUrgent: distSla.isUrgent,
            isFastTrack: distSla.isFastTrack,
            priority: distSla.isUrgent ? 'URGENT' : 'HIGH',
            slaType: distSla.slaType,
            effectiveDate: distSla.effectiveDate,
            darId: dar.id
          });
        }
      }
    }

    const updatedDars = state.dars.map(d => {
      if (d.id === dar.id) {
        return {
          ...d,
          status: isEffectiveTodayOrPast ? (d.ackRequirement === 'REQUIRED' && d.ackUserIds?.length > 0 ? 'WAITING_ACKNOWLEDGEMENT' : 'COMPLETED') : 'APPROVED_WAITING_EFFECTIVE'
        };
      }
      return d;
    });

    const updatedDarRequests = (state.darRequests || []).map(d => {
      if (d.id === dar.id) {
        return {
          ...d,
          status: isEffectiveTodayOrPast ? (d.ackRequirement === 'REQUIRED' && d.ackUserIds?.length > 0 ? 'WAITING_ACKNOWLEDGEMENT' : 'COMPLETED') : 'APPROVED_WAITING_EFFECTIVE'
        };
      }
      return d;
    });

    const finalCopies = sanitizeControlledCopies([...currentCopies, ...newCreatedCopies]);

    const actionLogEntry = {
      id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      actionType: 'DOCUMENT_PUBLISHED',
      actor: 'System (Lifecycle Engine)',
      details: isFormDoc ? `แบบฟอร์มใหม่ ${createdDoc.title} เผยแพร่สถานะ ${createdDoc.status} เรียบร้อยแล้ว (Bypass การออกเล่มสำเนาควบคุม)` : `เอกสารใหม่ ${createdDoc.title} เผยแพร่สถานะ ${createdDoc.status} เรียบร้อยแล้ว`,
      timestamp: new Date().toISOString()
    };

    const newNotifications = [...(state.notifications || [])];
    if (dar.requesterId) {
      newNotifications.push({
        id: `notif-pub-new-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        userId: dar.requesterId,
        targetUserIds: [dar.requesterId],
        title: 'เอกสารใหม่ได้รับการประกาศใช้แล้ว',
        message: `เอกสาร "${createdDoc.title}" (${createdDoc.document_code || dar.docIdInput || ''}) ได้รับการประกาศใช้เรียบร้อยแล้ว`,
        type: 'SUCCESS',
        category: 'DAR',
        isRead: false,
        read: false,
        readBy: [],
        link: '/dcc/library',
        timestamp: new Date().toISOString(),
        docCode: createdDoc.document_code || dar.docIdInput,
        refId: dar.id
      });
    }
    const targetDept = createdDoc.department || dar.department;
    newNotifications.push({
      id: `notif-pub-dept-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      targetDepartment: targetDept,
      isGlobal: !targetDept,
      title: `ประกาศใช้เอกสารใหม่: ${createdDoc.document_code || dar.docIdInput || ''}`,
      message: `เอกสาร "${createdDoc.title}" มีผลบังคับใช้แล้ว กรุณาศึกษาและปฏิบัติตาม`,
      type: 'INFO',
      category: 'DAR',
      isRead: false,
      read: false,
      readBy: [],
      link: '/dcc/library',
      timestamp: new Date().toISOString(),
      docCode: createdDoc.document_code || dar.docIdInput,
      refId: dar.id
    });

    return {
      documents: updatedDocs,
      masterDocuments: updatedDocs,
      dars: updatedDars,
      darRequests: updatedDarRequests,
      controlledCopyInstances: finalCopies,
      documentControlledCopies: finalCopies,
      controlledCopies: finalCopies,
      tasks: cleanupDccTasks(newTasks, finalCopies, updatedDocs),
      controlledCopyAuditTrail: newAuditLogs,
      notifications: newNotifications,
      actionLog: [actionLogEntry, ...(state.actionLog || [])]
    };
  }),

  promoteDarToEffective: (darId) => set((state) => {
    const safeDars = state.dars || [];
    const safeDarRequests = state.darRequests || [];
    const dar = safeDars.find(d => d.id === darId || d.dar_no === darId || d.darNumber === darId || d.darNo === darId)
      || safeDarRequests.find(d => d.id === darId || d.dar_no === darId || d.darNumber === darId || d.darNo === darId);
    if (!dar) return state;

    const docCode = dar.document_code || dar.doc_code || dar.docCode || dar.docNo || dar.code || dar.title;
    const cleanDocCode = (docCode && docCode.startsWith('[')) ? docCode.replace(/^\[.*?\]\s*/, '') : (docCode || 'DOC');

    const currentActiveDoc = (state.documents || []).find(d => {
      const c = d.document_code || d.doc_code || d.code || d.docCode || d.docNo || d.title;
      return c && cleanDocCode && c.trim().toLowerCase() === cleanDocCode.trim().toLowerCase() && 
        (d.status === 'EFFECTIVE' || d.status === 'ACTIVE' || d.is_active);
    });

    const previousRev = dar.currentRevision || dar.previous_revision || dar.previousRev || (currentActiveDoc ? (currentActiveDoc.revision || currentActiveDoc.rev) : '00');
    const targetRev = dar.target_revision || dar.targetRevision || dar.newRevision || dar.revision || dar.rev || '01';
    const now = new Date().toISOString();

    let updatedDocs = [...(state.documents || [])];

    // 1. ถอดฉบับเดิมทุกฉบับที่มีรหัสเดียวกันออกเป็น SUPERSEDED ทันทีแบบ Atomic (Single-Active ISO 9001 Invariant)
    updatedDocs = updatedDocs.map(d => {
      const c = d.document_code || d.doc_code || d.code || d.docCode || d.docNo || d.title;
      const isSameCode = c && cleanDocCode && c.trim().toLowerCase() === cleanDocCode.trim().toLowerCase();
      const isCurrentlyActive = (d.status === 'EFFECTIVE' || d.status === 'ACTIVE' || Boolean(d.is_active));

      if (isSameCode && isCurrentlyActive) {
        const docRev = String(d.revision || d.rev || previousRev || '00').replace(/^rev\.?/i, '').trim();
        const hasRevInId = d.id && d.id.includes(`_REV_${docRev}`);
        const formerFile = d.file || d.fileBlob || d.fileData;
        if (formerFile && cleanDocCode) {
          saveFile(`DOC_${cleanDocCode}_REV${docRev}`, formerFile).catch(() => {});
          saveFile(`FILE_${cleanDocCode}_REV${docRev}`, formerFile).catch(() => {});
          saveFile(`DOC_${cleanDocCode}_REV${docRev.padStart(2, '0')}`, formerFile).catch(() => {});
          saveFile(`FILE_${cleanDocCode}_REV${docRev.padStart(2, '0')}`, formerFile).catch(() => {});
          saveFile(`DOC_${cleanDocCode}_REV_${docRev}`, formerFile).catch(() => {});
          saveFile(`FILE_${cleanDocCode}_REV_${docRev}`, formerFile).catch(() => {});
        }
        return {
          ...d,
          id: hasRevInId ? d.id : `${cleanDocCode}_REV_${docRev}_${Date.now()}`,
          status: 'SUPERSEDED',
          is_active: false,
          is_superseded: true,
          file: d.file || d.fileBlob,
          fileBlob: d.fileBlob || d.file,
          supersededAt: now,
          superseded_at: now,
          supersededByRev: targetRev,
          darRef: d.darRef || d.darId || dar.dar_no || dar.darNo || dar.darNumber || dar.id
        };
      }
      return d;
    });

    // 2. เพิ่มหรืออัปเดตฉบับใหม่ให้เป็น EFFECTIVE
    const prevRevClean = String(previousRev || '00').replace(/^rev\.?/i, '').trim();
    const formerHistEntry = currentActiveDoc ? {
      revision: prevRevClean,
      rev: prevRevClean,
      dar_no: currentActiveDoc.darNo || currentActiveDoc.darNumber || currentActiveDoc.darId || dar.previousDarNo || dar.darNo,
      dar_id: currentActiveDoc.darId || dar.id,
      effective_date: currentActiveDoc.effectiveDate || currentActiveDoc.effective_date,
      file: currentActiveDoc.file || currentActiveDoc.fileBlob,
      fileBlob: currentActiveDoc.fileBlob || currentActiveDoc.file,
      fileData: currentActiveDoc.fileData,
      superseded_at: now,
      superseded_by_rev: targetRev
    } : null;

    const newEffectiveDocId = `${cleanDocCode}_REV_${targetRev}`;
    const newEffectiveDoc = {
      ...(currentActiveDoc || {}),
      id: newEffectiveDocId,
      code: cleanDocCode,
      document_code: cleanDocCode,
      doc_code: cleanDocCode,
      docCode: cleanDocCode,
      docNo: cleanDocCode,
      title: dar.document_title || dar.docTitle || dar.title || (currentActiveDoc?.title || cleanDocCode),
      name: dar.document_title || dar.docTitle || dar.title || (currentActiveDoc?.name || cleanDocCode),
      docTitle: dar.document_title || dar.docTitle || dar.title || (currentActiveDoc?.docTitle || cleanDocCode),
      docName: dar.document_title || dar.docTitle || dar.title || (currentActiveDoc?.docName || cleanDocCode),
      revision: targetRev,
      rev: targetRev,
      doc_version: targetRev,
      status: 'EFFECTIVE',
      is_active: true,
      is_superseded: false,
      is_obsolete: false,
      effectiveDate: dar.effective_date || dar.effectiveDate || now.split('T')[0],
      effective_date: dar.effective_date || dar.effectiveDate || now.split('T')[0],
      department: dar.department || currentActiveDoc?.department || 'QC',
      dept: dar.department || currentActiveDoc?.dept || 'QC',
      darRef: dar.dar_no || dar.darNo || dar.darNumber || dar.id,
      darId: dar.id,
      latestDarNo: dar.dar_no || dar.darNo || dar.darNumber || dar.id,
      published_at: now,
      file: dar.file || dar.attachedFile || dar.final_file || currentActiveDoc?.file,
      fileBlob: dar.fileBlob || dar.file || dar.attachedFile?.file || currentActiveDoc?.fileBlob,
      revision_history: [
        ...(currentActiveDoc?.revision_history || []),
        ...(formerHistEntry ? [formerHistEntry] : [])
      ],
      updatedAt: now
    };

    if (newEffectiveDoc.file || newEffectiveDoc.fileBlob) {
      const activeFile = newEffectiveDoc.file || newEffectiveDoc.fileBlob;
      saveFile(`DOC_${cleanDocCode}_REV${targetRev}`, activeFile).catch(() => {});
      saveFile(`FILE_${cleanDocCode}_REV${targetRev}`, activeFile).catch(() => {});
      saveFile(`DOC_${cleanDocCode}_REV${String(targetRev).padStart(2, '0')}`, activeFile).catch(() => {});
      saveFile(`FILE_${cleanDocCode}_REV${String(targetRev).padStart(2, '0')}`, activeFile).catch(() => {});
    }

    const existingNewIndex = updatedDocs.findIndex(d => {
      const c = d.document_code || d.doc_code || d.code || d.docCode || d.docNo || d.title;
      const r = d.revision || d.rev;
      return c && cleanDocCode && c.trim().toLowerCase() === cleanDocCode.trim().toLowerCase() && String(r).replace(/^rev\.?/i, '').trim() === String(targetRev).replace(/^rev\.?/i, '').trim();
    });

    if (existingNewIndex >= 0) {
      updatedDocs[existingNewIndex] = { ...updatedDocs[existingNewIndex], ...newEffectiveDoc };
    } else {
      updatedDocs = [newEffectiveDoc, ...updatedDocs];
    }

    const updatedDars = (state.dars || []).map(d => (d.id === darId || d.dar_no === darId || d.darNumber === darId) ? { ...d, status: 'COMPLETED' } : d);
    const updatedDarRequests = (state.darRequests || []).map(d => (d.id === darId || d.dar_no === darId || d.darNumber === darId) ? { ...d, status: 'COMPLETED' } : d);

    // 3. Synchronize controlled copies lifecycle for the promoted DAR (ISO 9001 Clause 7.5.3)
    const currentCopies = (state.controlledCopyInstances && state.controlledCopyInstances.length > 0)
      ? state.controlledCopyInstances
      : (state.documentControlledCopies || []);

    let updatedCopies = currentCopies.map(c => {
      const matchDoc = (c.doc_code && c.doc_code.trim().toLowerCase() === cleanDocCode.trim().toLowerCase()) ||
                       (c.docTitle && c.docTitle.trim().toLowerCase() === cleanDocCode.trim().toLowerCase()) ||
                       (c.document_code && c.document_code.trim().toLowerCase() === cleanDocCode.trim().toLowerCase()) ||
                       (currentActiveDoc && (String(c.docId || c.doc_id) === String(currentActiveDoc.id)));
      const isOldRev = String(c.rev || c.revision || c.doc_version || '00').replace(/^rev\.?/i, '').trim() !== String(targetRev).replace(/^rev\.?/i, '').trim();

      if (matchDoc && isOldRev) {
        return {
          ...c,
          status: 'PENDING_RECALL',
          is_superseded: true,
          is_active_in_field: false,
          superseded_at: now,
          superseded_by_rev: targetRev
        };
      }
      return c;
    });

    const distributions = dar.distributions || newEffectiveDoc.distributions || [];
    let newCreatedCopies = [];
    if (distributions.length > 0) {
      const allocations = calculateCopyAllocations(newEffectiveDoc.department, distributions);
      const allTargets = allocations.allAllocations || [];
      allTargets.forEach((dist, idx) => {
        const deptName = dist.departmentId || dist.dept || dist.dept_code || newEffectiveDoc.department;
        const locName = cleanLocationName(dist.station_name || dist.locationName || dist.name || dist.location || `${deptName} Head Office`);
        const locId = dist.station_id || dist.locationId || dist.id || `${deptName}-LOC-${idx + 1}`;
        const copyNo = dist.copy_no || dist.copyNo || String(idx + 1).padStart(2, '0');
        const nextCcNum = `CC-${String(idx + 1).padStart(3, '0')}`;
        const isOrigin = dist.isOwner || dist.copyNo === '01' || copyNo === '01';
        const copyId = buildControlledCopyId(cleanDocCode, targetRev, copyNo);

        const newInst = {
          id: copyId,
          doc_id: newEffectiveDocId,
          docId: newEffectiveDocId,
          document_code: cleanDocCode,
          doc_code: cleanDocCode,
          docCode: cleanDocCode,
          document_title: newEffectiveDoc.title,
          doc_title: newEffectiveDoc.title,
          docName: newEffectiveDoc.title,
          docTitle: cleanDocCode,
          doc_version: targetRev,
          rev: targetRev,
          revision: targetRev,
          copy_no: copyNo,
          copyNo: copyNo,
          ccNumber: nextCcNum,
          issue_no: '01',
          issueNumber: 'I01',
          holder_dept: deptName,
          department: deptName,
          departmentId: deptName,
          dept_code: deptName,
          target_department: deptName,
          targetDepartment: deptName,
          recipientDepartment: deptName,
          recipient_department: deptName,
          owner_dept: newEffectiveDoc.department,
          holder_name: `${deptName} (${locName})`,
          location: locName,
          locationName: locName,
          locationId: locId,
          station_id: locId,
          station_name: locName,
          is_master: isOrigin,
          isMaster: isOrigin,
          is_owner: isOrigin,
          isOwner: isOrigin,
          copy_type: 'CONTROLLED',
          copyType: 'CONTROLLED',
          status: 'PENDING_ISSUE',
          is_active_in_field: false,
          received_by: null,
          received_at: null,
          receipt_confirmed_at: null,
          receipt_confirmed_by: null,
          receipt_remarks: null,
          is_replacement: false,
          dispatched_at: null,
          dispatched_by: null,
          dateIssued: now.split('T')[0],
          recall_task_id: null
        };

        const alreadyExists = updatedCopies.some(c => c.id === copyId || (
          (c.doc_code === cleanDocCode || c.docTitle === cleanDocCode) &&
          String(c.rev || c.doc_version || c.revision) === String(targetRev) &&
          String(c.copy_no || c.copyNo || c.ccNumber).replace(/\D/g, '') === String(copyNo).replace(/\D/g, '')
        )) || newCreatedCopies.some(c => c.id === copyId);

        if (!alreadyExists) {
          newCreatedCopies.push(newInst);
        }
      });
    }

    const finalCopies = sanitizeControlledCopies([...updatedCopies, ...newCreatedCopies]);

    return {
      documents: updatedDocs,
      masterDocuments: updatedDocs,
      supersededDocuments: updatedDocs.filter(d => d.status === 'SUPERSEDED' || d.is_superseded),
      dars: updatedDars,
      darRequests: updatedDarRequests,
      controlledCopyInstances: finalCopies,
      documentControlledCopies: finalCopies,
      controlledCopies: finalCopies
    };
  }),

  archivePreviousRevision: (docCode, previousRev, targetRev, darRef) => set((state) => {
    const cleanDocCode = (docCode && docCode.startsWith('[')) ? docCode.replace(/^\[.*?\]\s*/, '') : docCode;
    const now = new Date().toISOString();
    let updatedDocs = (state.documents || []).map(d => {
      const c = d.document_code || d.doc_code || d.code || d.docCode || d.docNo || d.title;
      const r = d.revision || d.rev;
      const isMatch = c && cleanDocCode && c.trim().toLowerCase() === cleanDocCode.trim().toLowerCase();
      const isTargetRev = String(r).replace(/^rev\.?/i, '').trim() === String(previousRev).replace(/^rev\.?/i, '').trim();
      if (isMatch && isTargetRev && (d.status === 'EFFECTIVE' || d.status === 'ACTIVE' || d.is_active)) {
        const formerFile = d.file || d.fileBlob || d.fileData;
        if (formerFile && cleanDocCode) {
          saveFile(`DOC_${cleanDocCode}_REV${previousRev}`, formerFile).catch(() => {});
          saveFile(`FILE_${cleanDocCode}_REV${previousRev}`, formerFile).catch(() => {});
          saveFile(`DOC_${cleanDocCode}_REV${String(previousRev).padStart(2, '0')}`, formerFile).catch(() => {});
          saveFile(`FILE_${cleanDocCode}_REV${String(previousRev).padStart(2, '0')}`, formerFile).catch(() => {});
        }
        return {
          ...d,
          id: `${cleanDocCode}_REV_${previousRev}_${Date.now()}`,
          status: 'SUPERSEDED',
          is_active: false,
          is_superseded: true,
          file: d.file || d.fileBlob,
          fileBlob: d.fileBlob || d.file,
          supersededAt: now,
          superseded_at: now,
          supersededByRev: targetRev,
          darRef: d.darRef || darRef
        };
      }
      return d;
    });

    return {
      documents: updatedDocs,
      masterDocuments: updatedDocs,
      supersededDocuments: updatedDocs.filter(d => d.status === 'SUPERSEDED' || d.is_superseded)
    };
  }),

  publishApprovedDar: (darId) => {
    const state = get();
    const safeDars = state.dars || [];
    const safeDarRequests = state.darRequests || [];
    const dar = safeDars.find(d => d.id === darId || d.dar_no === darId || d.darNumber === darId || d.darNo === darId)
      || safeDarRequests.find(d => d.id === darId || d.dar_no === darId || d.darNumber === darId || d.darNo === darId);
    if (!dar) return;

    const darType = String(dar.type || dar.requestType || dar.darType || '').toUpperCase();
    if (darType === 'NEW' || darType === 'NEW_DOCUMENT') {
      get().publishNewDocumentDar(dar.id);
    } else if (darType === 'REVISION' || darType === 'REVISE' || darType === 'REVISE_DOCUMENT') {
      get().publishDarRevision(dar.id);
    } else if (darType === 'OBSOLETE' || darType === 'OBSOLETE_DOCUMENT') {
      get().publishObsoleteDar(dar.id);
    }

    if (darType !== 'OBSOLETE' && darType !== 'OBSOLETE_DOCUMENT') {
      if (get().finalizeAndPublishMaster) {
        get().finalizeAndPublishMaster(dar.id).catch(err => {
          console.warn('[publishApprovedDar] finalizeAndPublishMaster warning:', err);
        });
      }
    }
  },

  approveDar: (darId, userOrComment = 'Approved', optionalComment = '') => {
    const comment = typeof userOrComment === 'string' ? userOrComment : (optionalComment || 'Approved');
    const state = get();
    const task = (state.tasks || []).find(t => 
      (t.darId === darId || t.referenceId === darId) && 
      (t.type === 'Approve' || t.type === 'APPROVE')
    );
    if (task) {
      get().processWorkflow(task.id, 'APPROVE', comment);
    } else {
      const safeDars = state.dars || [];
      const safeDarRequests = state.darRequests || [];
      const dar = safeDars.find(d => d.id === darId || d.dar_no === darId || d.darNumber === darId || d.darNo === darId)
        || safeDarRequests.find(d => d.id === darId || d.dar_no === darId || d.darNumber === darId || d.darNo === darId);
      if (dar) {
        set((s) => {
          const updatedDars = (s.dars || []).map(d => d.id === dar.id ? { ...d, status: 'COMPLETED' } : d);
          const updatedDarRequests = (s.darRequests || []).map(d => d.id === dar.id ? { ...d, status: 'COMPLETED' } : d);
          return { dars: updatedDars, darRequests: updatedDarRequests };
        });
        get().publishApprovedDar(dar.id);
      }
    }
  },

  checkScheduledEffectiveDocs: () => set((state) => {
    const today = new Date();
    today.setDate(today.getDate() + (state.mockDateOffset || 0));
    const todayStr = state.simulatedDate || today.toISOString().split('T')[0];

    const scheduledDocs = (state.documents || []).filter(d => 
      d.status === 'SCHEDULED_EFFECTIVE' && (d.effective_date || d.effectiveDate) && todayStr >= (d.effective_date || d.effectiveDate)
    );

    if (scheduledDocs.length === 0) return state;

    let updatedDocs = [...state.documents];
    let updatedDars = [...state.dars];
    let newTasks = [...state.tasks];
    let newControlledCopies = [...(state.controlledCopyInstances || state.documentControlledCopies || [])];
    let newAuditTrail = [...(state.controlledCopyAuditTrail || [])];
    let newActionLog = [...(state.actionLog || [])];

    scheduledDocs.forEach(doc => {
      const targetCode = doc.document_code || doc.code || doc.title;

      updatedDocs = updatedDocs.map(d => {
        if (d.id === doc.id) {
          return {
            ...d,
            status: 'EFFECTIVE',
            is_active: true,
            is_superseded: false,
            is_obsolete: false,
            published_at: d.published_at || new Date().toISOString()
          };
        }
        const docCode = d.document_code || d.doc_code || d.code || d.docCode || d.title;
        const isSameCode = targetCode && docCode && docCode.toLowerCase() === targetCode.toLowerCase();
        if (isSameCode) {
          return {
            ...d,
            status: 'SUPERSEDED',
            is_active: false,
            is_superseded: true,
            superseded_at: d.superseded_at || new Date().toISOString()
          };
        }
        return d;
      });

      if (doc.darId) {
        updatedDars = updatedDars.map(dar => {
          if ((dar.id === doc.darId || dar.dar_no === doc.darId || dar.darNumber === doc.darId) && 
              (dar.status === 'APPROVED_WAITING_EFFECTIVE' || dar.status === 'WAITING_EFFECTIVE')) {
            return { ...dar, status: 'COMPLETED' };
          }
          return dar;
        });
      }

      newActionLog.unshift({
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'SCHEDULED_DOCUMENT_ACTIVATED',
        actor: 'System (Lifecycle Engine)',
        details: `เอกสาร ${doc.title} ที่ถึงกำหนดวันบังคับใช้ (${doc.effective_date || doc.effectiveDate}) ได้เปลี่ยนสถานะเป็น EFFECTIVE อัตโนมัติ`,
        timestamp: new Date().toISOString()
      });
    });

    return {
      documents: updatedDocs,
      dars: updatedDars,
      tasks: cleanupDccTasks(newTasks, newControlledCopies, updatedDocs),
      controlledCopyInstances: newControlledCopies,
      documentControlledCopies: newControlledCopies,
      controlledCopyAuditTrail: newAuditTrail,
      actionLog: newActionLog
    };
  }),

  publishDarRevision: (darId) => set((state) => {
    const safeDars = state.dars || [];
    const safeDarRequests = state.darRequests || [];
    const dar = safeDars.find(d => d.id === darId || d.dar_no === darId || d.darNumber === darId || d.darNo === darId)
      || safeDarRequests.find(d => d.id === darId || d.dar_no === darId || d.darNumber === darId || d.darNo === darId);
    if (!dar) return state;

    const targetDocId = dar.docIdRef || dar.docId || dar.doc_id || dar.targetDocumentId;
    const refDoc = targetDocId ? (state.documents || []).find(d => String(d.id) === String(targetDocId)) : null;
    let targetCode = dar.docNo || dar.document_code || dar.doc_code || dar.docCode || dar.docIdInput || (refDoc ? (refDoc.docNo || refDoc.document_code || refDoc.doc_code || refDoc.code || refDoc.docCode || refDoc.title) : null);
    if (!targetCode && dar.title) {
      targetCode = dar.title.startsWith('[') ? dar.title.replace(/^\[.*?\]\s*/, '') : dar.title;
    }
    
    // Strict code matching to find previous revisions
    const isDocMatchCode = (doc) => {
      if (targetDocId && String(doc.id) === String(targetDocId)) return true;
      const code = doc.docNo || doc.document_code || doc.doc_code || doc.code || doc.docCode || doc.title;
      if (targetCode && code && code.trim().toLowerCase() === targetCode.trim().toLowerCase()) return true;
      if (refDoc) {
        const refCode = refDoc.docNo || refDoc.document_code || refDoc.doc_code || refDoc.code || refDoc.docCode || refDoc.title;
        if (refCode && code && code.trim().toLowerCase() === refCode.trim().toLowerCase()) return true;
      }
      return false;
    };

    const matchingDocs = (state.documents || []).filter(isDocMatchCode);
    const oldDoc = matchingDocs.find(d => d.status === 'EFFECTIVE' || d.status === 'ACTIVE' || d.is_active) || matchingDocs[matchingDocs.length - 1];

    const oldRev = dar.currentRevision || dar.previous_revision || dar.previousRev || (oldDoc ? (oldDoc.revision || oldDoc.rev || oldDoc.doc_version || oldDoc.version) : '00');
    const currentRevNum = parseInt(String(oldRev).replace(/\D/g, ''), 10) || 0;
    const newRevNum = currentRevNum + 1;
    const defaultNextRev = newRevNum < 10 ? `0${newRevNum}` : `${newRevNum}`;
    
    // Explicit target revision priority (strictly avoid falling back to old revision)
    const rawTarget = dar.targetRevision || dar.newRevision || dar.newRev || dar.targetRev || dar.proposedRev;
    let newRevStr;
    if (rawTarget) {
      const clean = String(rawTarget).replace(/^rev\.?/i, '').trim();
      newRevStr = clean.length === 1 ? `0${clean}` : clean;
    } else if (dar.rev && String(dar.rev).replace(/^rev\.?/i, '').trim() !== String(oldRev).replace(/^rev\.?/i, '').trim()) {
      const clean = String(dar.rev).replace(/^rev\.?/i, '').trim();
      newRevStr = clean.length === 1 ? `0${clean}` : clean;
    } else if (dar.revision && String(dar.revision).replace(/^rev\.?/i, '').trim() !== String(oldRev).replace(/^rev\.?/i, '').trim()) {
      const clean = String(dar.revision).replace(/^rev\.?/i, '').trim();
      newRevStr = clean.length === 1 ? `0${clean}` : clean;
    } else {
      newRevStr = defaultNextRev;
    }
    
    const today = new Date();
    today.setDate(today.getDate() + (state.mockDateOffset || 0));
    const todayStr = state.simulatedDate || today.toISOString().split('T')[0];
    const isEffectiveTodayOrPast = !dar.effectiveDate || dar.effectiveDate <= todayStr;
    const docStatus = isEffectiveTodayOrPast ? 'EFFECTIVE' : 'SCHEDULED_EFFECTIVE';
    const nowIso = new Date().toISOString();

    const prevRevClean = String(oldDoc?.revision || oldDoc?.rev || oldRev || '00').replace(/^rev\.?/i, '').trim();
    if (oldDoc && targetCode) {
      const formerFile = oldDoc.file || oldDoc.fileBlob || oldDoc.fileData;
      if (formerFile) {
        saveFile(`DOC_${targetCode}_REV${prevRevClean}`, formerFile).catch(() => {});
        saveFile(`FILE_${targetCode}_REV${prevRevClean}`, formerFile).catch(() => {});
        saveFile(`DOC_${targetCode}_REV${prevRevClean.padStart(2, '0')}`, formerFile).catch(() => {});
        saveFile(`FILE_${targetCode}_REV${prevRevClean.padStart(2, '0')}`, formerFile).catch(() => {});
        saveFile(`DOC_${targetCode}_REV_${prevRevClean}`, formerFile).catch(() => {});
        saveFile(`FILE_${targetCode}_REV_${prevRevClean}`, formerFile).catch(() => {});
      }
    }

    // 1. Single Active Revision Invariant: If effective today or past, update ALL previous revisions of this code to SUPERSEDED
    let updatedDocs = (state.documents || []).map(doc => {
      const isTargetMatch = isDocMatchCode(doc) || (dar.docNo && (doc.docNo === dar.docNo || doc.code === dar.docNo || doc.document_code === dar.docNo));
      const docRev = String(doc.revision || doc.rev || doc.doc_version || doc.version).replace(/^rev\.?/i, '').trim();
      const isOldRevision = docRev !== String(newRevStr).replace(/^rev\.?/i, '').trim();
      const isTargetActive = doc.status === 'EFFECTIVE' || doc.status === 'ACTIVE' || doc.is_active;

      if (isEffectiveTodayOrPast && isTargetMatch && isOldRevision && isTargetActive) {
        const docFormerRev = docRev || '00';
        const docFile = doc.file || doc.fileBlob || doc.fileData;
        if (docFile && targetCode) {
          saveFile(`DOC_${targetCode}_REV${docFormerRev}`, docFile).catch(() => {});
          saveFile(`FILE_${targetCode}_REV${docFormerRev}`, docFile).catch(() => {});
          saveFile(`DOC_${targetCode}_REV${docFormerRev.padStart(2, '0')}`, docFile).catch(() => {});
          saveFile(`FILE_${targetCode}_REV${docFormerRev.padStart(2, '0')}`, docFile).catch(() => {});
        }
        const histEntry = {
          revision: docFormerRev,
          rev: docFormerRev,
          dar_no: doc.darNo || doc.darNumber || doc.darId || dar.darNo || dar.id,
          dar_id: doc.darId || dar.id,
          effective_date: doc.effectiveDate || doc.effective_date,
          file: docFile,
          fileBlob: doc.fileBlob || doc.file,
          fileData: doc.fileData,
          superseded_at: nowIso,
          superseded_by_rev: newRevStr
        };
        return {
          ...doc,
          id: doc.id || `${targetCode || doc.document_code || doc.code || 'DOC'}_REV_${docFormerRev}_${Date.now()}`,
          status: 'SUPERSEDED',
          is_active: false,
          is_superseded: true,
          isLocked: false,
          hasPendingDar: false,
          file: doc.file || doc.fileBlob,
          fileBlob: doc.fileBlob || doc.file,
          revision_history: [...(doc.revision_history || []), histEntry],
          superseded_at: doc.superseded_at || nowIso,
          supersededAt: doc.supersededAt || nowIso,
          supersededByRev: newRevStr,
          supersededByDar: dar.darNo || dar.darNumber || dar.id,
          darRef: doc.darRef || doc.darId || dar.darNo || dar.darNumber || dar.id
        };
      }
      if (isTargetMatch) {
        return {
          ...doc,
          isLocked: false,
          hasPendingDar: false
        };
      }
      return doc;
    });

    const isFormDoc = Boolean(
      dar.docType === 'FM' ||
      dar.doc_type === 'FM' ||
      dar.type === 'FM' ||
      oldDoc?.docType === 'FM' ||
      String(targetCode || oldDoc?.document_code || oldDoc?.code || oldDoc?.title || dar.title || '').startsWith('FM')
    );

    const histEntryForNewDoc = oldDoc ? {
      revision: prevRevClean,
      rev: prevRevClean,
      dar_no: oldDoc.darNo || oldDoc.darNumber || oldDoc.darId || dar.darNo || dar.id,
      dar_id: oldDoc.darId || dar.id,
      effective_date: oldDoc.effectiveDate || oldDoc.effective_date,
      file: oldDoc.file || oldDoc.fileBlob,
      fileBlob: oldDoc.fileBlob || oldDoc.file,
      fileData: oldDoc.fileData,
      superseded_at: nowIso,
      superseded_by_rev: newRevStr
    } : null;

    const activeFileId = dar.fileId || dar.file_id || dar.attachedFile?.fileId || dar.attachedFile?.id;
    const activeAttachedFile = dar.attachedFile || null;
    const newDocId = `DOC-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newDoc = {
      id: newDocId,
      darId: dar.id,
      darNumber: dar.darNumber || dar.darNo || dar.id,
      latestDarNo: dar.darNo || dar.darNumber || dar.id,
      docNo: dar.docNo || targetCode,
      document_code: targetCode || dar.docNo || oldDoc?.document_code || oldDoc?.code || oldDoc?.title,
      doc_code: targetCode || dar.docNo || oldDoc?.doc_code || oldDoc?.document_code || oldDoc?.code || oldDoc?.title,
      code: targetCode || dar.docNo || oldDoc?.code || oldDoc?.document_code || oldDoc?.title,
      docCode: targetCode || dar.docNo || oldDoc?.code || oldDoc?.document_code || oldDoc?.title,
      title: (oldDoc ? oldDoc.title : null) || targetCode || dar.docNo || dar.docCode || dar.docTitle || dar.title,
      name: dar.docTitle || dar.title || (oldDoc ? (oldDoc.name || oldDoc.title) : 'Procedure Document'),
      docName: dar.docTitle || dar.title || (oldDoc ? (oldDoc.docName || oldDoc.title) : 'Procedure Document'),
      docTitle: dar.docTitle || dar.title || (oldDoc ? oldDoc.docTitle : targetCode),
      status: docStatus,
      is_active: isEffectiveTodayOrPast,
      is_superseded: false,
      is_obsolete: false,
      isLocked: false,
      hasPendingDar: false,
      rev: newRevStr,
      revision: newRevStr,
      doc_version: newRevStr,
      version: newRevStr,
      department: dar.department || oldDoc?.department || 'PD',
      type: dar.documentType || dar.docType || dar.type || (oldDoc?.type || (targetCode ? targetCode.split('-')[0] : 'SOP')),
      controlledCopy: isFormDoc ? 0 : (oldDoc?.controlledCopy || 0),
      effectiveDate: dar.effectiveDate || todayStr,
      effective_date: dar.effectiveDate || todayStr,
      published_at: isEffectiveTodayOrPast ? nowIso : null,
      distributions: isFormDoc ? [] : (dar.distributions && dar.distributions.length > 0 ? dar.distributions : (oldDoc?.distributions || [])),
      accessScope: dar.accessScope || dar.access_control?.scope || 'GENERAL',
      access_control: dar.access_control || oldDoc?.access_control || { scope: dar.accessScope || 'GENERAL' },
      targetDepartments: dar.targetDepartments || dar.target_departments || [],
      confidentialityLevel: dar.confidentialityLevel || 'INTERNAL',
      fileId: activeFileId || null,
      attachedFile: activeAttachedFile,
      file: dar.file || activeAttachedFile || null,
      fileBlob: dar.fileBlob || dar.file || activeAttachedFile?.file || null,
      fileName: dar.fileName || activeAttachedFile?.name || null,
      pdfUrl: dar.pdfUrl || dar.fileUrl || '/mock.pdf',
      revision_history: [
        ...(oldDoc?.revision_history || []),
        ...(histEntryForNewDoc ? [histEntryForNewDoc] : [])
      ],
      updatedAt: nowIso,
      createdAt: nowIso
    };

    if (activeFileId) {
      getFile(activeFileId).then(blob => {
        if (blob) {
          if (targetCode) {
            saveFile(targetCode, blob).catch(() => {});
            saveFile(`DOC_${targetCode}_REV${newRevStr}`, blob).catch(() => {});
            saveFile(`FILE_${targetCode}_REV${newRevStr}`, blob).catch(() => {});
            saveFile(`DOC_${targetCode}_REV${newRevStr.padStart(2, '0')}`, blob).catch(() => {});
            saveFile(`FILE_${targetCode}_REV${newRevStr.padStart(2, '0')}`, blob).catch(() => {});
          }
          saveFile(newDocId, blob).catch(() => {});
          if (dar.id) saveFile(dar.id, blob).catch(() => {});
        }
      }).catch(() => {});
    }
    if (newDoc.file || newDoc.fileBlob) {
      const activeBlob = newDoc.file || newDoc.fileBlob;
      if (targetCode) {
        saveFile(`DOC_${targetCode}_REV${newRevStr}`, activeBlob).catch(() => {});
        saveFile(`FILE_${targetCode}_REV${newRevStr}`, activeBlob).catch(() => {});
        saveFile(`DOC_${targetCode}_REV${newRevStr.padStart(2, '0')}`, activeBlob).catch(() => {});
        saveFile(`FILE_${targetCode}_REV${newRevStr.padStart(2, '0')}`, activeBlob).catch(() => {});
      }
    }

    const existingNewDocIndex = updatedDocs.findIndex(
      doc => (isDocMatchCode(doc) || (dar.docNo && (doc.docNo === dar.docNo || doc.code === dar.docNo || doc.document_code === dar.docNo))) && (
        String(doc.revision || doc.rev || doc.doc_version || doc.version).replace(/^rev\.?/i, '').trim() === String(newRevStr).replace(/^rev\.?/i, '').trim()
      )
    );

    if (existingNewDocIndex >= 0) {
      updatedDocs[existingNewDocIndex] = {
        ...updatedDocs[existingNewDocIndex],
        ...newDoc,
        status: docStatus,
        is_active: isEffectiveTodayOrPast
      };
    } else {
      updatedDocs.unshift(newDoc);
    }

    // 2. Controlled copies and tasks management (Bypassed for FM blank forms)
    let currentCopies = (state.controlledCopyInstances && state.controlledCopyInstances.length > 0)
      ? state.controlledCopyInstances
      : (state.documentControlledCopies && state.documentControlledCopies.length > 0 ? state.documentControlledCopies : (state.controlledCopyInstances || []));
    let updatedCopies = currentCopies;
    let newCreatedCopies = [];
    let newAuditLogs = [...(state.controlledCopyAuditTrail || [])];
    let newTasks = [...state.tasks];
    let recalledCopies = [];

    if (!isFormDoc) {
      // Mark ALL existing active / received copies of the old revision as PENDING_RECALL across ALL stations

    const isOldCopy = (copy) => {
      const copyCode = copy.document_code || copy.doc_code || copy.docTitle;
      const isDocMatch = (oldDoc && (String(copy.doc_id || copy.docId) === String(oldDoc.id))) ||
                         (targetCode && copyCode === targetCode) ||
                         (oldDoc?.title && copyCode === oldDoc.title);
      const copyRev = copy.rev || copy.doc_version || copy.revision;
      if (copyRev && String(copyRev) === String(newRevStr)) {
        return false;
      }
      const isRevMatch = copyRev ? (String(copyRev) === String(oldRev) || copyRev < newRevStr) : true;
      const isActive = copy.status === 'ISSUED_ACTIVE' || copy.status === 'ACTIVE' || copy.status === 'RECEIVED' || copy.status === 'DISPATCHED_PENDING_RECEIPT';
      return isDocMatch && isRevMatch && isActive;
    };

    recalledCopies = currentCopies.filter(isOldCopy);

      updatedCopies = currentCopies.map(copy => {
      if (isOldCopy(copy)) {
        newAuditLogs.unshift({
          id: `audit-supersede-${Date.now()}-${copy.id}`,
          timestamp: new Date().toISOString(),
          user: 'System (Lifecycle Engine)',
          action: 'SUPERSEDED_PENDING_RECALL',
          docTitle: copy.doc_code || copy.docTitle || targetCode,
          docRev: copy.rev || copy.doc_version || oldRev,
          ccNumber: copy.ccNumber || copy.copy_no,
          oldStatus: copy.status,
          newStatus: 'SUPERSEDED_PENDING_RECALL',
          remarks: `Superseded by Rev.${newRevStr} (DAR ${dar.id}). Set to SUPERSEDED_PENDING_RECALL for physical recall/destruction.`
        });

        return {
          ...copy,
          status: 'PENDING_RECALL',
          is_superseded: true,
          is_active_in_field: false,
          superseded_at: new Date().toISOString(),
          superseded_by_dar: dar.dar_no || dar.id,
          superseded_by_rev: newRevStr,
          recall_reason: `เอกสารมีการปรับปรุง Revision ใหม่ (Superseded by Rev.${newRevStr})`
        };
      }
      return copy;
    });

    // 3. Create new copies for Rev.01 based on dar.distributions
    const allocations = calculateCopyAllocations(newDoc.department, newDoc.distributions || []);
    const allTargets = allocations.allAllocations || [];

    allTargets.forEach((dist, idx) => {
      const deptName = dist.departmentId || dist.dept || dist.dept_code || newDoc.department;
      const locName = cleanLocationName(dist.station_name || dist.locationName || dist.name || dist.location || `${deptName} Head Office`);
      const locId = dist.station_id || dist.locationId || dist.id || `${deptName}-LOC-${idx + 1}`;
      const copyNo = dist.copy_no || dist.copyNo || String(idx + 1).padStart(2, '0');
      const nextCcNum = `CC-${String(idx + 1).padStart(3, '0')}`;
      const isOrigin = dist.isOwner || dist.copyNo === '01' || copyNo === '01';

      const copyDocCode = newDoc.document_code || newDoc.code || newDoc.doc_code || newDoc.title;
      const copyDocTitle = newDoc.document_title || newDoc.docName || newDoc.name || dar.title || copyDocCode;
      const copyId = buildControlledCopyId(copyDocCode, newDoc.rev, copyNo);
      const newInst = {
        id: copyId,
        doc_id: newDoc.id,
        docId: newDoc.id,
        document_code: copyDocCode,
        doc_code: copyDocCode,
        docCode: copyDocCode,
        document_title: copyDocTitle,
        doc_title: copyDocTitle,
        docName: copyDocTitle,
        docTitle: copyDocCode,
        doc_version: newDoc.rev,
        rev: newDoc.rev,
        revision: newDoc.rev,
        copy_no: copyNo,
        copyNo: copyNo,
        ccNumber: nextCcNum,
        issue_no: '01',
        issueNumber: 'I01',
        holder_dept: deptName,
        department: deptName,
        departmentId: deptName,
        dept_code: deptName,
        target_department: deptName,
        targetDepartment: deptName,
        recipientDepartment: deptName,
        recipient_department: deptName,
        owner_dept: newDoc.department,
        holder_name: `${deptName} (${locName})`,
        location: locName,
        locationName: locName,
        locationId: locId,
        station_id: locId,
        station_name: locName,
        is_master: false,
        isMaster: false,
        is_owner: isOrigin,
        isOwner: isOrigin,
        copy_type: 'CONTROLLED',
        copyType: 'CONTROLLED',
        status: 'PENDING_ISSUE',
        is_active_in_field: false,
        received_by: null,
        received_at: null,
        is_replacement: false,
        dispatched_at: null,
        dispatched_by: null,
        dateIssued: todayStr,
        receipt_confirmed_at: null,
        receipt_confirmed_by: null,
        receipt_remarks: null,
        recall_task_id: null
      };
      const alreadyExists = currentCopies.some(inst => {
        if (inst.id === copyId) return true;
        const isMatchDoc = (String(inst.docId || inst.doc_id) === String(newDoc.id)) ||
                           (inst.doc_code === newDoc.title || inst.docTitle === newDoc.title || inst.doc_code === copyDocCode);
        const isMatchRev = String(inst.rev || inst.doc_version || inst.revision) === String(newDoc.rev);
        const isMatchCopyNo = String(inst.copy_no || inst.copyNo || inst.ccNumber).replace(/\D/g, '') === String(copyNo).replace(/\D/g, '');
        return isMatchDoc && isMatchRev && isMatchCopyNo;
      }) || newCreatedCopies.some(c => c.id === copyId);
      if (!alreadyExists) {
        newCreatedCopies.push(newInst);
      }

      newAuditLogs.unshift({
        id: `audit-${Date.now()}-${idx}`,
        timestamp: new Date().toISOString(),
        user: 'System (Lifecycle Engine)',
        action: 'AUTO_GENERATE',
        docTitle: newInst.docTitle,
        docRev: newInst.rev,
        ccNumber: newInst.ccNumber,
        oldStatus: '-',
        newStatus: newInst.status,
        remarks: `Auto-generated CC for ${deptName} (${locName}) upon new revision effective`
      });
    });

    // 4. Create DCC Tasks

    // Distribution Task: Decoupled for new revision distribution
    if (allTargets.length > 0) {
      const distSla = calculateTaskDueDate({
        submissionDate: new Date(),
        effectiveDate: dar.effectiveDate || newDoc.effectiveDate,
        stepSlaDays: state.slaSettings?.hardcopyReceiptSlaDays || 3,
        mockDateOffset: state.mockDateOffset
      });
      const distDocOfficialTitle = newDoc.name || dar.name || newDoc.title;
      newTasks.push({
        id: `task-dist-${newDoc.title}-${newDoc.rev}-${Date.now()}`,
        title: `แจกจ่ายเอกสาร Controlled Copy: ${distDocOfficialTitle} (${newDoc.title} Rev.${newDoc.rev})`,
        description: `กรุณาพิมพ์และแจกจ่ายสำเนาควบคุมสำหรับเอกสาร ${newDoc.title} (${distDocOfficialTitle}) (Rev.${newDoc.rev}) จำนวน ${allTargets.length} แผนก/จุดใช้งาน`,
        type: 'DCC_DISTRIBUTE',
            assignee_department: 'DC',
            document_department: 'QC',
        taskType: 'DISTRIBUTION',
        task_type: 'DISTRIBUTION',
        target_role: 'DCC',
        assignedToRole: 'DCC_ADMIN',
        assigneeId: resolveDccAdminUserId(state.masterUsers),
        department: 'DC',
        target_department: 'DC',
        docId: newDoc.id,
        doc_id: newDoc.id,
        document_code: newDoc.title,
        doc_code: newDoc.title,
        docCode: newDoc.title,
        docTitle: distDocOfficialTitle,
        docName: distDocOfficialTitle,
        targetRevision: newDoc.rev,
        revision: newDoc.rev,
        doc_version: newDoc.rev,
        status: 'PENDING',
        priority: distSla.isUrgent ? 'URGENT' : 'HIGH',
        isUrgent: distSla.isUrgent,
        isFastTrack: distSla.isFastTrack,
        dueDate: distSla.dueDate,
        cancelDate: distSla.cancelDate,
        slaType: distSla.slaType,
        effectiveDate: distSla.effectiveDate,
        darId: dar.id,
        createdAt: new Date().toISOString()
      });
    }

    // Universal Recall Task: Decoupled for old revision recall
    const copiesToRecall = recalledCopies.map(c => ({
      id: c.id,
      copy_no: c.copy_no || c.copyNo,
      holder_dept: c.holder_dept || c.department,
      location: c.location || c.locationName,
      status: c.status
    }));

    if (recalledCopies.length > 0 || oldDoc) {
      const recallTaskId = `task-recall-${targetCode}-${oldRev}-${Date.now()}`;
      const recallDocOfficialTitle = oldDoc?.name || newDoc.name || dar.name || targetCode;
      const recallTask = {
        id: recallTaskId,
        type: 'RECALL_HARDCOPY',
        taskType: 'DCC_RECALL_WITH_CHECKLIST',
        task_type: 'DCC_RECALL_WITH_CHECKLIST',
            assignee_department: 'DC',
        document_department: 'QC',
        targetRole: 'DCC_ADMIN',
        target_role: 'DCC_ADMIN',
        assignedToRole: 'DCC_ADMIN',
        assigneeId: resolveDccAdminUserId(state.masterUsers),
        department: 'DC',
        target_department: 'DC',
        docId: oldDoc?.id,
        doc_id: oldDoc?.id,
        document_code: targetCode,
        doc_code: targetCode,
        docCode: targetCode,
        docTitle: recallDocOfficialTitle,
        docName: recallDocOfficialTitle,
        targetRevision: oldRev,
        revision: oldRev,
        doc_version: oldRev,
        supersededCopyIds: recalledCopies.map(c => c.id),
        copies_to_recall: copiesToRecall,
        status: 'PENDING',
        priority: 'HIGH',
        darId: dar.id,
        title: `[เรียกคืนสำเนาตกรุ่น] ${recallDocOfficialTitle} (${targetCode} Rev.${oldRev})`,
        description: `เอกสาร ${targetCode} มีการอัปเดตเป็น Rev.${newRevStr} แล้ว กรุณาเรียกคืนเอกสารฉบับเดิม (Rev.${oldRev}) จากทุกสถานีใช้งาน (${recalledCopies.length} จุด)`,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      };
      newTasks.push(recallTask);
    }

    }

    // 5. Update DAR status to COMPLETED
    const updatedDars = safeDars.map(d => d.id === dar.id ? { ...d, status: 'COMPLETED' } : d);
    const updatedDarRequests = safeDarRequests.map(d => d.id === dar.id ? { ...d, status: 'COMPLETED' } : d);

    // 6. Action Log
    const actionLogEntry = {
      id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      actionType: 'REVISION_PUBLISHED',
      actor: 'System (Lifecycle Engine)',
      details: isFormDoc ? `แบบฟอร์ม ${newDoc.title} ปรับปรุงเป็น Rev.${newRevStr} เรียบร้อยแล้ว (Bypass การออกเล่มสำเนาควบคุม)` : `เอกสาร ${newDoc.title} ปรับปรุงเป็น Rev.${newRevStr}: สำเนาเดิม Rev.${oldRev} ทั้งหมดถูกตั้งสถานะเรียกคืน (SUPERSEDED_PENDING_RECALL)`,
      timestamp: new Date().toISOString()
    };

    const finalCopies = sanitizeControlledCopies([...updatedCopies, ...newCreatedCopies]);

    const newNotifications = [...(state.notifications || [])];
    if (dar.requesterId) {
      newNotifications.push({
        id: `notif-pub-rev-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        userId: dar.requesterId,
        targetUserIds: [dar.requesterId],
        title: 'เอกสารฉบับปรับปรุงประกาศใช้แล้ว',
        message: `เอกสาร "${newDoc.title}" Rev.${newRevStr} ประกาศใช้เรียบร้อยแล้ว`,
        type: 'SUCCESS',
        category: 'DAR',
        isRead: false,
        read: false,
        readBy: [],
        link: '/dcc/library',
        timestamp: new Date().toISOString(),
        docCode: targetCode,
        refId: dar.id
      });
    }

    const targetDept = newDoc.department || dar.department;
    newNotifications.push({
      id: `notif-pub-revdept-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      targetDepartment: targetDept,
      isGlobal: !targetDept,
      title: `ประกาศใช้เอกสารฉบับปรับปรุง: ${targetCode} Rev.${newRevStr}`,
      message: `เอกสาร "${newDoc.title}" ปรับปรุงเป็น Rev.${newRevStr} มีผลบังคับใช้แล้ว`,
      type: 'INFO',
      category: 'DAR',
      isRead: false,
      read: false,
      readBy: [],
      link: '/dcc/library',
      timestamp: new Date().toISOString(),
      docCode: targetCode,
      refId: dar.id
    });

    if (recalledCopies.length > 0) {
      const dccAdminId = resolveDccAdminUserId(state.masterUsers);
      if (dccAdminId) {
        newNotifications.push({
          id: `notif-recall-dcc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          userId: dccAdminId,
          targetUserIds: [dccAdminId],
          title: 'ภาระงานเรียกคืนสำเนาตกรุ่น',
          message: `เอกสาร ${targetCode} มีการอัปเดตเป็น Rev.${newRevStr} กรุณาเรียกคืนสำเนาเดิม Rev.${oldRev} (${recalledCopies.length} จุด)`,
          type: 'TASK_ASSIGNED',
          category: 'CONTROLLED_COPY',
          isRead: false,
          read: false,
          readBy: [],
          link: '/controlled-copy',
          timestamp: new Date().toISOString(),
          docCode: targetCode
        });
      }

      const holderDepts = Array.from(new Set(recalledCopies.map(c => c.holder_dept || c.department).filter(Boolean)));
      holderDepts.forEach(dept => {
        newNotifications.push({
          id: `notif-recall-dept-${dept}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          targetDepartment: dept,
          isGlobal: false,
          title: `แจ้งเตือนเรียกคืนสำเนาควบคุมตกรุ่น: ${targetCode}`,
          message: `เอกสาร ${targetCode} ได้ออก Rev.${newRevStr} แล้ว กรุณาส่งคืนสำเนาเดิม Rev.${oldRev} ต่อเจ้าหน้าที่ DCC`,
          type: 'ACTION_REQUIRED',
          category: 'CONTROLLED_COPY',
          isRead: false,
          read: false,
          readBy: [],
          link: '/controlled-copy',
          timestamp: new Date().toISOString(),
          docCode: targetCode
        });
      });
    }

    return {
      documents: updatedDocs,
      masterDocuments: updatedDocs,
      supersededDocuments: updatedDocs.filter(d => d.status === 'SUPERSEDED' || d.is_superseded),
      dars: updatedDars,
      darRequests: updatedDarRequests,
      controlledCopyInstances: finalCopies,
      documentControlledCopies: finalCopies,
      controlledCopies: finalCopies,
      tasks: cleanupDccTasks(newTasks, finalCopies, updatedDocs),
      controlledCopyAuditTrail: newAuditLogs,
      notifications: newNotifications,
      actionLog: [actionLogEntry, ...(state.actionLog || [])]
    };
  })
});
