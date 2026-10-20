/**
 * External Document Zustand Slice
 * Extracted from useStore.js (Phase 3 Refactor)
 */
import { stampExternalDocumentTopRight } from '../../utils/pdfStamper';
import { getFile, saveFile, resolveFileBlob } from '../../utils/fileStorage';
import { 
  formatDocumentRunningNumber, 
  calculateNextExternalDocSequence, 
  checkDocumentCodeCollision 
} from '../../services/MasterDataService';
import { isDccAdmin } from '../../utils/taskFilter';

// Domain Helpers for External Documents
export const resolveDccAdminUserId = (masterUsers) => {
  const admin = (masterUsers || []).find(u => isDccAdmin(u));
  return admin?.id || masterUsers?.[0]?.id || 'U001';
};

export const generateNextEdrNumber = (requests = []) => {
  const year = new Date().getFullYear(); // บังคับใช้ ค.ศ. เสมอ (เช่น 2026)
  const prefix = `EDR-${year}-`;
  
  const matchedNumbers = (requests || [])
    .map(r => {
      const code = r?.requestNo || r?.edrNumber || r?.requestId || r?.id || '';
      if (typeof code === 'string' && code.startsWith(prefix)) {
        const parts = code.split('-');
        const seqStr = parts[2];
        return seqStr ? parseInt(seqStr, 10) : 0;
      }
      return 0;
    })
    .filter(n => !isNaN(n) && n > 0);

  let maxSeq = matchedNumbers.length > 0 ? Math.max(...matchedNumbers) : 0;
  let nextSeq = maxSeq + 1;
  let candidate = `${prefix}${String(nextSeq).padStart(4, '0')}`;

  // Concurrency & Seed Guard: loop increment if candidate already exists
  const existingCodes = new Set(
    (requests || []).flatMap(r => [r?.id, r?.requestId, r?.requestNo, r?.edrNumber].filter(Boolean))
  );
  while (existingCodes.has(candidate)) {
    nextSeq += 1;
    candidate = `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  return candidate;
};

export const createExternalDocSlice = (set, get) => ({
  // State
  externalDocuments: [],
  externalRequests: [],
  externalAuditTrail: [],

  // Auto-running Sequence Generator
  generateNextEdrNumber: () => generateNextEdrNumber(get().externalRequests || []),

  // Convenience Aliases (Backward Compatibility)
  addExternalDocument: (doc) => get().registerExternalDoc(doc),
  createExternalDocument: (doc) => get().registerExternalDoc(doc),
  updateExternalDocument: (id, updates) => get().updateExternalDoc(id, updates),
  obsoleteExternalDocument: (id, payload) => get().obsoleteExternalDoc(id, payload),
  submitExternalRequest: (payload) => get().createExternalRequest(payload),

  // Core External Document Actions
  registerExternalDoc: (doc) => {
    let finalNewId = null;
    let finalStatus = null;
    
    set((state) => {
    const dept = doc.department || doc.dept || (state.currentUser ? (state.currentUser.department || 'QA/QC') : 'QA/QC');
    const edType = (state.documentTypes || []).find(t => t.code === 'ED' || t.id === 'ED');
    const pattern = edType?.namingPattern || 'ED-{Dept}-{##}';
    
    // Omni-Status Monotonic Sequence: scan externalDocuments (including OBSOLETE), externalRequests, and tasks
    const nextSeq = calculateNextExternalDocSequence(dept, state.externalDocuments, state.externalRequests, state.tasks);
    const seqNum = formatDocumentRunningNumber(nextSeq);
    const autoCode = pattern
      .replace('{Type}', 'ED')
      .replace('{Dept}', dept)
      .replace('{###}', seqNum)
      .replace('{##}', seqNum);
      
    let edCode = doc.edCode || doc.doc_code || doc.docNo || autoCode;
    
    // Omni-Status Collision Guard: if passed code collides with any existing doc across all statuses, assign next monotonic sequence
    const omniPool = [...(state.externalDocuments || []), ...(state.externalRequests || []), ...(state.tasks || [])];
    if (doc.edCode && checkDocumentCodeCollision(doc.edCode, omniPool)) {
      edCode = autoCode;
      if (checkDocumentCodeCollision(edCode, omniPool)) {
        const safeSeq = nextSeq + 1;
        const safeSeqNum = formatDocumentRunningNumber(safeSeq);
        edCode = pattern
          .replace('{Type}', 'ED')
          .replace('{Dept}', dept)
          .replace('{###}', safeSeqNum)
          .replace('{##}', safeSeqNum);
      }
    }
    const newId = doc.id || edCode || `EXT-${Date.now()}`;
    const originRev = doc.originRev || doc.sourceVersion || doc.edition || doc.rev || doc.version || '-';

    // Review Cycle & Validity
    const reviewCycleMonths = Number(doc.reviewCycleMonths) || 12;
    const effectiveDate = doc.effectiveDate || new Date().toISOString().split('T')[0];
    const effDateObj = new Date(effectiveDate);
    effDateObj.setMonth(effDateObj.getMonth() + reviewCycleMonths);
    const nextReviewDate = doc.nextReviewDate || effDateObj.toISOString().split('T')[0];

    let initialStatus = 'ACTIVE';
    let newTasks = [...state.tasks];
    let newNotifications = [...state.notifications];

    const ownerId = doc.ownerId || (state.currentUser ? state.currentUser.id : '');
    const requesterName = state.currentUser?.fullName || state.currentUser?.name || doc.ownerName || 'User';

    const requestId = doc.requestNo || doc.requestId || doc.edrNumber || generateNextEdrNumber(state.externalRequests || []);

    const editionKey = String(doc.sourceVersion || doc.edition || originRev || '1.0').trim();
    const activeAttachedFile = doc.attachedFile || null;
    const activeFileId = doc.fileId || activeAttachedFile?.fileId || null;
    const activeRawFileId = doc.rawFileId || activeAttachedFile?.rawFileId || activeFileId;
    const activeStorageKey = doc.fileStorageKey || activeAttachedFile?.fileStorageKey || (edCode && editionKey ? `FILE_${edCode}_ED_${editionKey}` : (activeFileId || newId));
    const activeFileName = doc.fileName || activeAttachedFile?.name || '';
    const filePayload = activeAttachedFile ? {
      attachedFile: { ...activeAttachedFile, rawFileId: activeRawFileId, fileStorageKey: activeStorageKey },
      fileId: activeFileId,
      rawFileId: activeRawFileId,
      fileStorageKey: activeStorageKey,
      fileName: activeFileName,
      file: activeAttachedFile,
      attachment: activeAttachedFile
    } : (activeFileId ? { fileId: activeFileId, rawFileId: activeRawFileId, fileStorageKey: activeStorageKey, fileName: activeFileName } : { fileStorageKey: activeStorageKey });

    if (activeFileId) {
      getFile(activeFileId).then(blob => {
        if (blob) {
          saveFile(newId, blob).catch(() => {});
          saveFile(edCode, blob).catch(() => {});
          saveFile(requestId, blob).catch(() => {});
          if (edCode && editionKey) {
            saveFile(`FILE_${edCode}_ED_${editionKey}`, blob).catch(() => {});
            saveFile(`DOC_${edCode}_ED_${editionKey}`, blob).catch(() => {});
            saveFile(`FILE_${edCode}_${editionKey}`, blob).catch(() => {});
          }
        }
      }).catch(() => {});
    }

    if (doc.reviewerId) {
      initialStatus = 'PENDING_EXT_REVIEW';
      newTasks.push({
        id: `extt-${Date.now()}-rev`,
        referenceType: 'EXTERNAL_DOC',
        referenceId: newId,
        docId: newId,
        docCode: edCode,
        doc_code: edCode,
        docTitle: doc.title,
        docName: doc.title,
        title: `${edCode}: ${doc.title}`,
        type: 'EXT_REVIEW',
        taskType: 'EXT_REVIEW',
        assigneeId: doc.reviewerId,
        requesterId: ownerId,
        requesterName: requesterName,
        requesterDepartment: dept,
        department: dept,
        origin: 'EXTERNAL',
        status: 'PENDING',
        extAction: 'REGISTER',
        ...filePayload
      });
      newNotifications.push({
        id: `notif-ext-rev-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        userId: doc.reviewerId,
        targetUserIds: [doc.reviewerId],
        title: 'มีเอกสารภายนอกรอการทบทวน',
        message: `คำร้อง ${requestId} (${doc.title}) รอให้คุณดำเนินการทบทวน`,
        link: '/dcc/tasks',
        type: 'TASK_ASSIGNED',
        category: 'EXTERNAL_DOC',
        isRead: false,
        read: false,
        readBy: [],
        timestamp: new Date().toISOString(),
        docCode: edCode,
        refId: requestId
      });
    } else if (doc.approverId) {
      initialStatus = 'PENDING_EXT_APPROVAL';
      newTasks.push({
        id: `extt-${Date.now()}-app`,
        referenceType: 'EXTERNAL_DOC',
        referenceId: newId,
        docId: newId,
        docCode: edCode,
        doc_code: edCode,
        docTitle: doc.title,
        docName: doc.title,
        title: `${edCode}: ${doc.title}`,
        type: 'EXT_APPROVAL',
        taskType: 'EXT_APPROVAL',
        assigneeId: doc.approverId,
        requesterId: ownerId,
        requesterName: requesterName,
        requesterDepartment: dept,
        department: dept,
        origin: 'EXTERNAL',
        status: 'PENDING',
        extAction: 'REGISTER',
        ...filePayload
      });
      newNotifications.push({
        id: `notif-ext-app-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        userId: doc.approverId,
        targetUserIds: [doc.approverId],
        title: 'มีเอกสารภายนอกรอการอนุมัติ',
        message: `คำร้อง ${requestId} (${doc.title}) รอให้คุณดำเนินการพิจารณาอนุมัติ`,
        link: '/dcc/tasks',
        type: 'TASK_ASSIGNED',
        category: 'EXTERNAL_DOC',
        isRead: false,
        read: false,
        readBy: [],
        timestamp: new Date().toISOString(),
        docCode: edCode,
        refId: requestId
      });
    }

    if (initialStatus === 'ACTIVE' && doc.acknowledgees && doc.acknowledgees.length > 0) {
      doc.acknowledgees.forEach(uid => {
        newTasks.push({
          id: `extt-${Date.now()}-ack-${uid}`,
          referenceType: 'EXTERNAL_DOC',
          referenceId: newId,
          docCode: edCode,
          doc_code: edCode,
          docTitle: doc.title,
          docName: doc.title,
          title: `${edCode}: ${doc.title}`,
          type: 'Ack',
          assigneeId: uid,
          origin: 'EXTERNAL',
          status: 'PENDING'
        });
        newNotifications.push({ id: Date.now() + Math.random(), userId: uid, title: 'โปรดรับทราบเอกสาร', message: `เอกสารภายนอก "${edCode} - ${doc.title}" บังคับใช้แล้ว โปรดรับทราบ`, isRead: false, link: '/tasks', timestamp: new Date().toISOString() });
      });
    }

    // Handle Physical Controlled Copies on Demand (if requested and immediately ACTIVE)
    const stations = doc.distributions || doc.physical_distribution || [];
    let newCreatedCopies = [];
    if (initialStatus === 'ACTIVE' && stations.length > 0) {
      const nowIso = new Date().toISOString();
      const todayStr = nowIso.split('T')[0];
      const docEdition = doc.edition || doc.sourceVersion || originRev;
      newCreatedCopies = stations.map((station, index) => {
        const copyNoStr = String(index + 1).padStart(2, '0');
        const ccNumStr = `CC-${String(index + 1).padStart(3, '0')}`;
        const copyCode = `${edCode}-C${copyNoStr}`;
        const holderDept = station.departmentId || station.dept_code || station.dept || station.department || dept;
        const locName = station.locationName || station.station_name || station.name || station.location || `${holderDept} Head Office`;
        const locId = station.locationId || station.station_id || station.id || `${holderDept}-LOC-${index + 1}`;
        const holderName = station.holder || station.custodianName || `${holderDept} (${locName})`;
        return {
          id: `cc-ext-${newId}-${copyNoStr}`,
          copyCode,
          copy_code: copyCode,
          doc_id: newId,
          docId: newId,
          documentId: newId,
          external_doc_id: newId,
          externalDocId: newId,
          document_code: edCode,
          documentCode: edCode,
          doc_code: edCode,
          docCode: edCode,
          document_title: doc.title,
          doc_title: doc.title,
          docTitle: doc.title,
          doc_type: 'ED',
          docType: 'ED',
          docName: doc.title,
          edition: docEdition,
          doc_version: originRev,
          rev: originRev,
          copy_no: copyNoStr,
          copyNo: copyNoStr,
          copy_number: index + 1,
          copyNumber: index + 1,
          ccNumber: ccNumStr,
          issue_no: '01',
          issueNumber: 'I01',
          holder_dept: holderDept,
          department: holderDept,
          targetDepartment: holderDept,
          target_department: holderDept,
          departmentId: holderDept,
          dept_code: holderDept,
          holder: holderName,
          custodianName: holderName,
          holder_name: holderName,
          location: locName,
          locationName: locName,
          workstationLocation: locName,
          locationId: locId,
          station_id: locId,
          station_name: locName,
          status: 'PENDING_ISSUE',
          is_replacement: false,
          is_adhoc: false,
          is_external: true,
          isExternal: true,
          requested_by: state.currentUser?.name || 'Owner Department',
          requested_at: nowIso,
          createdAt: nowIso,
          distributedDate: todayStr,
          dateIssued: todayStr
        };
      });

      newTasks.push({
        id: `task-dcc-issue-ext-${newId}-${Date.now()}`,
        referenceType: 'EXTERNAL_DOC',
        type: 'DCC_DISTRIBUTE',
            assignee_department: 'DC',
            document_department: 'QC',
        taskType: 'DCC_ISSUE_CONTROLLED_COPIES',
        title: `จัดพิมพ์และส่งมอบสำเนาควบคุมเอกสารภายนอก: ${edCode} (${stations.length} จุด)`,
        description: `มีคำขอสำเนาควบคุมสำหรับเอกสารภายนอก ${edCode} จำนวน ${stations.length} เล่ม กรุณาจัดพิมพ์และแจกจ่าย`,
        docId: newId,
        externalDocId: newId,
        doc_code: edCode,
        docCode: edCode,
        is_external: true,
        doc_type: 'EXTERNAL',
        edition: doc.edition || doc.sourceVersion || originRev,
        docTitle: doc.title,
        docName: doc.title,
        department: 'DC',
        target_department: 'DC',
        doc_version: originRev,
        assigneeId: resolveDccAdminUserId(state.masterUsers),
        assignedToRole: 'DCC_ADMIN',
        targetRole: 'DCC_ADMIN',
        target_role: 'DCC_ADMIN',
        origin: 'EXTERNAL',
        status: 'PENDING',
        priority: 'HIGH',
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        createdAt: nowIso
      });
    }

    const issuerValue = doc.issuer || doc.officialIssuer || doc.source || '';
    const newExternalDoc = {
      ...doc,
      id: newId,
      code: edCode,
      doc_code: edCode,
      docNo: edCode,
      edCode,
      department: dept,
      status: initialStatus,
      ownerId: state.currentUser ? state.currentUser.id : (doc.ownerId || ''),
      rev: doc.rev || '00', // internal sequence (00, 01, ...); edition text lives in sourceVersion
      source: issuerValue,
      issuer: issuerValue,
      officialIssuer: issuerValue,
      distributions: stations,
      physical_distribution: stations,
      distributionList: Array.isArray(doc.distributionList) && doc.distributionList.length > 0 ? doc.distributionList : newCreatedCopies,
      controlledCopies: Array.isArray(doc.controlledCopies) && doc.controlledCopies.length > 0 ? doc.controlledCopies : newCreatedCopies,
      is_physical_copy: Boolean(doc.is_physical_copy || doc.isPhysicalCopy || stations.length > 0),
      reviewCycleMonths,
      nextReviewDate,
      next_review_date: nextReviewDate,
      review_status: 'UP_TO_DATE',
      is_reviewed_this_cycle: false,
      pending_periodic_review: false,
      is_external: true,
      doc_type: 'EXTERNAL',
      requestId,
      edrNumber: requestId,
      changeReason: doc.reason || doc.changeReason || 'ขึ้นทะเบียนเอกสารภายนอกใหม่',
      createdAt: new Date().toISOString(),
      ...filePayload
    };

    const prevCopies = state.documentControlledCopies || state.controlledCopyInstances || [];
    const finalCopies = [...prevCopies, ...newCreatedCopies];

    const reviewerObj = (state.masterUsers || []).find(u => u.id === doc.reviewerId);
    const approverObj = (state.masterUsers || []).find(u => u.id === doc.approverId);
    const nowIso = new Date().toISOString();

    const newExternalRequest = {
      id: requestId,
      requestId,
      requestNo: requestId,
      edrNumber: requestId,
      docId: newId,
      documentId: newId,
      externalDocId: newId,
      edCode,
      doc_code: edCode,
      docCode: edCode,
      documentCode: edCode,
      title: doc.title,
      source: issuerValue,
      issuer: issuerValue,
      officialIssuer: issuerValue,
      sourceVersion: doc.sourceVersion || doc.edition || '',
      requestType: 'NEW',
      rev: doc.rev || '00',
      effectiveDate: effectiveDate,
      nextReviewDate: nextReviewDate,
      reviewCycleMonths: reviewCycleMonths,
      department: dept,
      requesterId: ownerId,
      requesterName,
      requesterDepartment: dept,
      requesterRole: state.currentUser?.position || state.currentUser?.role || 'Requester',
      reviewerId: doc.reviewerId || null,
      reviewerName: reviewerObj ? (reviewerObj.fullName || reviewerObj.name) : null,
      reviewerRole: reviewerObj?.position || 'Reviewer',
      approverId: doc.approverId || null,
      approverName: approverObj ? (approverObj.fullName || approverObj.name) : null,
      approverRole: approverObj?.position || 'Approver',
      status: initialStatus,
      returnReason: null,
      revisionComment: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      ...filePayload,
      signoffs: [
        {
          step: 'REQUEST',
          stepName: 'ยื่นคำร้อง',
          role: 'ผู้ยื่นคำร้อง',
          userId: ownerId,
          userName: requesterName,
          userRole: state.currentUser?.position || 'Requester',
          status: 'COMPLETED',
          date: nowIso,
          comment: doc.reason || 'ยื่นคำร้องขอขึ้นทะเบียนเอกสารภายนอกใหม่'
        },
        {
          step: 'REVIEW',
          stepName: 'ทบทวนเอกสาร',
          role: 'ผู้ทบทวน',
          userId: doc.reviewerId || null,
          userName: reviewerObj ? (reviewerObj.fullName || reviewerObj.name) : '-',
          userRole: reviewerObj?.position || 'Reviewer',
          status: doc.reviewerId ? 'PENDING' : 'SKIPPED',
          date: null,
          comment: null
        },
        {
          step: 'APPROVE',
          stepName: 'อนุมัติเอกสาร',
          role: 'ผู้อนุมัติ',
          userId: doc.approverId || null,
          userName: approverObj ? (approverObj.fullName || approverObj.name) : '-',
          userRole: approverObj?.position || 'Approver',
          status: doc.approverId ? (doc.reviewerId ? 'WAITING' : 'PENDING') : 'SKIPPED',
          date: null,
          comment: null
        }
      ]
    };

    const newState = {
      externalDocuments: [newExternalDoc, ...state.externalDocuments],
      externalRequests: [newExternalRequest, ...(state.externalRequests || [])],
      documentControlledCopies: finalCopies,
      controlledCopyInstances: finalCopies,
      tasks: newTasks,
      notifications: newNotifications,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'EXT_DOC_REGISTER',
        details: `Registered new external document: ${edCode} - ${doc.title}`,
        actor: state.currentUser?.name || 'User',
        actorId: state.currentUser?.id || '',
        actorRole: state.currentUser?.role || state.currentUser?.position,
        date: new Date().toISOString()
      }, ...(state.actionLog || [])],
      externalAuditTrail: [{
        id: `EXTA-${Date.now()}`,
        docId: newId,
        docTitle: doc.title,
        docCode: edCode,
        action: 'REGISTER',
        actor: state.currentUser?.name || 'User',
        actorId: state.currentUser?.id || '',
        date: new Date().toISOString(),
        details: `Registered external document ${edCode} (Status: ${initialStatus})`
      }, ...state.externalAuditTrail]
    };
    
    // (Inject side effect values to outer scope)
    finalNewId = newId;
    finalStatus = initialStatus;
    return newState;
    });

    if (finalStatus === 'ACTIVE') {
      setTimeout(() => {
        if (get().stampFinalExternalApprovalPdf) {
          get().stampFinalExternalApprovalPdf(finalNewId);
        }
      }, 500);
    }
  },

  // Triggered when requesting to Update an existing document (create new revision)
  updateExternalDoc: (id, updates) => set((state) => {
    const oldDoc = state.externalDocuments.find(d => d.id === id || d.edCode === id || d.doc_code === id);
    if (!oldDoc) return state;

    const currentRevNum = parseInt(String(oldDoc.rev || oldDoc.revision || '0').replace(/\D/g, '') || '0', 10);
    const _originalRevStr = updates.originalRevision ? String(updates.originalRevision).replace(/\D/g, '').padStart(2, '0') : String(currentRevNum).padStart(2, '0');
    const targetRevNum = updates.targetRevision ? parseInt(String(updates.targetRevision).replace(/\D/g, '') || '1', 10) : (currentRevNum + 1);
    const targetRevStr = String(targetRevNum).padStart(2, '0');
    const newRevStr = targetRevStr;

    const reviewCycleMonths = Number(updates.reviewCycleMonths || oldDoc.reviewCycleMonths) || 12;
    const effectiveDate = updates.effectiveDate || oldDoc.effectiveDate || new Date().toISOString().split('T')[0];
    const effDateObj = new Date(effectiveDate);
    effDateObj.setMonth(effDateObj.getMonth() + reviewCycleMonths);
    const nextReviewDate = updates.nextReviewDate || effDateObj.toISOString().split('T')[0];

    const edCode = oldDoc.edCode || oldDoc.doc_code || oldDoc.docNo || id;
    const newId = `EXT-${Date.now()}`;
    const issuerValue = updates.issuer || updates.officialIssuer || updates.source || oldDoc.issuer || oldDoc.officialIssuer || oldDoc.source || '';

    const ownerId = updates.ownerId || oldDoc.ownerId || (state.currentUser ? state.currentUser.id : '');
    const requesterName = state.currentUser?.fullName || state.currentUser?.name || updates.ownerName || oldDoc.ownerName || 'User';

    const requestId = updates.requestNo || updates.requestId || updates.edrNumber || generateNextEdrNumber(state.externalRequests || []);

    const newEditionValue = updates.sourceVersion || updates.edition || oldDoc.sourceVersion || oldDoc.edition || '';
    const editionKey = String(newEditionValue || '1.0').trim();
    const hasNewFile = Boolean(updates.attachedFile || updates.fileId);

    const activeAttachedFile = updates.attachedFile || oldDoc.attachedFile || null;
    const activeFileId = updates.fileId || activeAttachedFile?.fileId || oldDoc.fileId || null;
    const activeRawFileId = hasNewFile
      ? (updates.rawFileId || updates.attachedFile?.rawFileId || updates.fileId || updates.attachedFile?.fileId || activeFileId)
      : (oldDoc.rawFileId || oldDoc.attachedFile?.rawFileId || activeFileId);
    const activeStorageKey = updates.fileStorageKey || updates.attachedFile?.fileStorageKey || (edCode && editionKey ? `FILE_${edCode}_ED_${editionKey}` : (activeFileId || newId));
    const activeFileName = updates.fileName || activeAttachedFile?.name || oldDoc.fileName || '';
    const filePayload = activeAttachedFile ? {
      attachedFile: { ...activeAttachedFile, rawFileId: activeRawFileId, fileStorageKey: activeStorageKey },
      fileId: activeFileId,
      rawFileId: activeRawFileId,
      fileStorageKey: activeStorageKey,
      fileName: activeFileName,
      file: activeAttachedFile,
      attachment: activeAttachedFile
    } : (activeFileId ? { fileId: activeFileId, rawFileId: activeRawFileId, fileStorageKey: activeStorageKey, fileName: activeFileName } : { fileStorageKey: activeStorageKey });

    if (activeFileId) {
      getFile(activeFileId).then(blob => {
        if (blob) {
          saveFile(newId, blob).catch(() => {});
          saveFile(requestId, blob).catch(() => {});
          if (edCode && editionKey) {
            saveFile(`FILE_${edCode}_ED_${editionKey}`, blob).catch(() => {});
            saveFile(`DOC_${edCode}_ED_${editionKey}`, blob).catch(() => {});
            saveFile(`FILE_${edCode}_${editionKey}`, blob).catch(() => {});
          }
        }
      }).catch(() => {});
    }

    const isAwaitingAction = oldDoc.review_status === 'AWAITING_ACTION' ||
      oldDoc.periodic_review_outcome === 'REVISION_REQUIRED' ||
      oldDoc.periodic_review_outcome === 'OBSOLETE_REQUIRED';

    const newDoc = {
      ...oldDoc,
      ...updates,
      id: newId,
      edCode,
      doc_code: edCode,
      docNo: edCode,
      rev: newRevStr,
      edition: newEditionValue,
      sourceVersion: newEditionValue,
      source: issuerValue,
      issuer: issuerValue,
      officialIssuer: issuerValue,
      status: 'PENDING_EXT_REVIEW',
      previousDocId: oldDoc.id,
      reviewCycleMonths,
      nextReviewDate,
      next_review_date: nextReviewDate,
      review_status: 'UP_TO_DATE',
      is_reviewed_this_cycle: false,
      pending_periodic_review: false,
      last_reviewed_at: null,
      lastReviewedDate: null,
      last_verified_at: null,
      periodic_reviews: [],
      review_history: [],
      is_external: true,
      doc_type: 'EXTERNAL',
      requestId,
      edrNumber: requestId,
      ...(isAwaitingAction ? { linkedRequestId: requestId, linkedActionId: requestId } : {}),
      changeReason: updates.reason || updates.changeReason || '-',
      requesterName,
      updatedAt: new Date().toISOString(),
      ...filePayload
    };

    const newTasks = [...state.tasks];
    const newNotifications = [...state.notifications];

    if (newDoc.reviewerId) {
      newTasks.push({
        id: `extt-${Date.now()}-rev`,
        referenceType: 'EXTERNAL_DOC',
        referenceId: newId,
        docId: newId,
        docCode: edCode,
        doc_code: edCode,
        docTitle: newDoc.title,
        docName: newDoc.title,
        title: `${edCode}: ${newDoc.title}${newDoc.sourceVersion ? ` (${newDoc.sourceVersion})` : ''}`,
        type: 'EXTERNAL_REVIEW',
        taskType: 'EXTERNAL_REVIEW',
        assigneeId: newDoc.reviewerId,
        requesterId: ownerId,
        requesterName: requesterName,
        requesterDepartment: newDoc.department,
        department: newDoc.department,
        origin: 'EXTERNAL',
        status: 'PENDING',
        extAction: 'UPDATE',
        ...filePayload
      });
      newNotifications.push({
        id: Date.now() + Math.random(),
        userId: newDoc.reviewerId,
        title: 'มีเอกสารภายนอกรอการทบทวน',
        message: `คำร้อง ${requestId} (${newDoc.title}) รอให้คุณดำเนินการทบทวน`,
        link: '/dcc/tasks',
        type: 'TASK_ASSIGNED',
        category: 'EXTERNAL_DOC',
        isRead: false,
        read: false,
        timestamp: new Date().toISOString()
      });
    } else {
      newDoc.status = 'PENDING_EXT_APPROVAL';
      newTasks.push({
        id: `extt-${Date.now()}-app`,
        referenceType: 'EXTERNAL_DOC',
        referenceId: newId,
        docId: newId,
        docCode: edCode,
        doc_code: edCode,
        docTitle: newDoc.title,
        docName: newDoc.title,
        title: `${edCode}: ${newDoc.title}${newDoc.sourceVersion ? ` (${newDoc.sourceVersion})` : ''}`,
        type: 'EXTERNAL_APPROVAL',
        taskType: 'EXTERNAL_APPROVAL',
        assigneeId: newDoc.approverId,
        requesterId: ownerId,
        requesterName: requesterName,
        requesterDepartment: newDoc.department,
        department: newDoc.department,
        origin: 'EXTERNAL',
        status: 'PENDING',
        extAction: 'UPDATE',
        ...filePayload
      });
      newNotifications.push({
        id: Date.now() + Math.random(),
        userId: newDoc.approverId,
        title: 'มีเอกสารภายนอกรอการอนุมัติ',
        message: `คำร้อง ${requestId} (${newDoc.title}) รอให้คุณดำเนินการพิจารณาอนุมัติ`,
        link: '/dcc/tasks',
        type: 'TASK_ASSIGNED',
        category: 'EXTERNAL_DOC',
        isRead: false,
        read: false,
        timestamp: new Date().toISOString()
      });
    }
    const targetRevId = newDoc.reviewerId;
    const targetAppId = newDoc.approverId;
    const reviewerObj = (state.masterUsers || []).find(u => u.id === targetRevId);
    const approverObj = (state.masterUsers || []).find(u => u.id === targetAppId);
    const nowIso = new Date().toISOString();

    const newExternalRequest = {
      id: requestId,
      requestId,
      requestNo: requestId,
      edrNumber: requestId,
      docId: newId,
      documentId: newId,
      externalDocId: newId,
      previousDocId: oldDoc.id,
      edCode,
      doc_code: edCode,
      docCode: edCode,
      documentCode: edCode,
      title: newDoc.title,
      source: issuerValue,
      issuer: issuerValue,
      officialIssuer: issuerValue,
      edition: updates.edition || updates.sourceVersion || oldDoc.edition || oldDoc.sourceVersion || '',
      sourceVersion: updates.sourceVersion || updates.edition || oldDoc.sourceVersion || oldDoc.edition || '',
      requestType: 'REVISION',
      type: 'REVISION',
      actionType: 'REVISION',
      extAction: 'UPDATE',
      effectiveDate: effectiveDate,
      nextReviewDate: nextReviewDate,
      reviewCycleMonths: reviewCycleMonths,
      accessScope: updates.accessScope || oldDoc.accessScope || 'General',
      accessDepartments: updates.accessDepartments || oldDoc.accessDepartments || [],
      accessUsers: updates.accessUsers || oldDoc.accessUsers || [],
      reason: updates.reason || '',
      changeReason: updates.reason || updates.changeReason || '',
      department: newDoc.department,
      requesterId: ownerId,
      requesterName,
      requesterDepartment: newDoc.department,
      requesterRole: state.currentUser?.position || state.currentUser?.role || 'Requester',
      reviewerId: targetRevId || null,
      reviewerName: reviewerObj ? (reviewerObj.fullName || reviewerObj.name) : null,
      reviewerRole: reviewerObj?.position || 'Reviewer',
      approverId: targetAppId || null,
      approverName: approverObj ? (approverObj.fullName || approverObj.name) : null,
      approverRole: approverObj?.position || 'Approver',
      status: targetRevId ? 'PENDING_EXT_REVIEW' : 'PENDING_EXT_APPROVAL',
      returnReason: null,
      revisionComment: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      ...filePayload,
      signoffs: [
        {
          step: 'REQUEST',
          stepName: 'ยื่นคำร้อง',
          role: 'ผู้ยื่นคำร้อง',
          userId: ownerId,
          userName: requesterName,
          userRole: state.currentUser?.position || 'Requester',
          status: 'COMPLETED',
          date: nowIso,
          comment: updates.reason || (updates.sourceVersion || updates.edition ? `ขอปรับปรุงเอกสารเป็นฉบับ ${updates.sourceVersion || updates.edition}` : 'ขอปรับปรุงเอกสารฉบับใหม่')
        },
        {
          step: 'REVIEW',
          stepName: 'ทบทวนเอกสาร',
          role: 'ผู้ทบทวน',
          userId: targetRevId || null,
          userName: reviewerObj ? (reviewerObj.fullName || reviewerObj.name) : '-',
          userRole: reviewerObj?.position || 'Reviewer',
          status: targetRevId ? 'PENDING' : 'SKIPPED',
          date: null,
          comment: null
        },
        {
          step: 'APPROVE',
          stepName: 'อนุมัติเอกสาร',
          role: 'ผู้อนุมัติ',
          userId: targetAppId || null,
          userName: approverObj ? (approverObj.fullName || approverObj.name) : '-',
          userRole: approverObj?.position || 'Approver',
          status: targetAppId ? (targetRevId ? 'WAITING' : 'PENDING') : 'SKIPPED',
          date: null,
          comment: null
        }
      ]
    };

    const updatedSchedules = (state.periodicReviewSchedules || []).map(s => {
      const isMatch = s.externalDocumentId === oldDoc.id || s.documentId === oldDoc.id || s.documentNumber === edCode || s.id === `PRS-AUTO-${oldDoc.id}`;
      if (isMatch && (isAwaitingAction || s.status === 'AWAITING_ACTION' || s.review_status === 'AWAITING_ACTION')) {
        return {
          ...s,
          linkedRequestId: requestId,
          linkedActionId: requestId,
          linkageStatus: 'PENDING',
          updatedAt: new Date().toISOString()
        };
      }
      return s;
    });
    const updatedOldDoc = isAwaitingAction ? { ...oldDoc, linkedRequestId: requestId, linkedActionId: requestId } : oldDoc;

    return {
      externalDocuments: [newDoc, ...state.externalDocuments.filter(d => d.id !== newId).map(d => d.id === oldDoc.id ? updatedOldDoc : d)],
      externalRequests: [newExternalRequest, ...(state.externalRequests || [])],
      periodicReviewSchedules: updatedSchedules,
      tasks: newTasks,
      notifications: newNotifications,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'EXT_DOC_REVISE_REQUEST',
        details: `Requested update for external document: ${edCode} - ${newDoc.title} to edition ${newDoc.edition || newDoc.sourceVersion || '-'}`,
        actor: state.currentUser?.name || 'User',
        actorId: state.currentUser?.id || '',
        actorRole: state.currentUser?.role || state.currentUser?.position,
        date: new Date().toISOString()
      }, ...(state.actionLog || [])],
      externalAuditTrail: [{
        id: `EXTA-${Date.now()}`,
        docId: newId,
        docTitle: newDoc.title,
        docCode: edCode,
        action: 'UPDATE_REQUEST',
        actor: state.currentUser?.name || 'User',
        actorId: state.currentUser?.id || '',
        date: new Date().toISOString(),
        details: `Requested update for ${edCode} to Rev ${newRevStr}`
      }, ...state.externalAuditTrail]
    };
  }),

  // Triggered when requesting to Obsolete a document
  obsoleteExternalDoc: (id, payload) => set((state) => {
    const oldDoc = state.externalDocuments.find(d => d.id === id);
    if (!oldDoc) return state;

    let newTasks = [...state.tasks];
    let newNotifications = [...state.notifications];

    const requestId = payload.requestNo || payload.requestId || payload.edrNumber || generateNextEdrNumber(state.externalRequests || []);
    const obsoleteEffDate = payload.effectiveDate || payload.obsoleteEffectiveDate || new Date().toISOString().split('T')[0];
    const isAwaitingAction = oldDoc.review_status === 'AWAITING_ACTION' ||
      oldDoc.periodic_review_outcome === 'OBSOLETE_REQUIRED' ||
      oldDoc.periodic_review_outcome === 'REVISION_REQUIRED';

    // Store obsolete request details inside the document temporarily while preserving official ACTIVE status
    const updatedDoc = {
      ...oldDoc,
      status: oldDoc.status || 'ACTIVE',
      pendingObsolete: true,
      obsoleteReason: payload.reason,
      effectiveDate: obsoleteEffDate,
      obsoleteEffectiveDate: obsoleteEffDate,
      obsoleteDate: obsoleteEffDate,
      obsoleteReviewerId: payload.reviewerId,
      obsoleteApproverId: payload.approverId,
      ...(isAwaitingAction ? { linkedRequestId: requestId, linkedActionId: requestId } : {})
    };

    if (payload.reviewerId) {
      newTasks.push({
        id: `extt-${Date.now()}-rev`,
        referenceType: 'EXTERNAL_DOC',
        referenceId: id,
        title: oldDoc.title,
        type: 'EXT_REVIEW',
        assigneeId: payload.reviewerId,
        origin: 'EXTERNAL',
        status: 'PENDING',
        extAction: 'OBSOLETE'
      });
      newNotifications.push({ id: Date.now() + Math.random(), userId: payload.reviewerId, title: 'ขอยกเลิกเอกสารภายนอก', message: `รอตรวจสอบการยกเลิก "${oldDoc.title}"`, isRead: false, link: '/tasks', timestamp: new Date().toISOString() });
    } else {
      newTasks.push({
        id: `extt-${Date.now()}-app`,
        referenceType: 'EXTERNAL_DOC',
        referenceId: id,
        title: oldDoc.title,
        type: 'EXT_APPROVAL',
        assigneeId: payload.approverId,
        origin: 'EXTERNAL',
        status: 'PENDING',
        extAction: 'OBSOLETE'
      });
      newNotifications.push({ id: Date.now() + Math.random(), userId: payload.approverId, title: 'ขอยกเลิกเอกสารภายนอก', message: `รออนุมัติการยกเลิก "${oldDoc.title}"`, isRead: false, link: '/tasks', timestamp: new Date().toISOString() });
    }

    const targetRevId = payload.reviewerId;
    const targetAppId = payload.approverId;
    const reviewerObj = (state.masterUsers || []).find(u => u.id === targetRevId);
    const approverObj = (state.masterUsers || []).find(u => u.id === targetAppId);
    const nowIso = new Date().toISOString();
    const ownerId = state.currentUser ? state.currentUser.id : (oldDoc.ownerId || '');
    const requesterName = state.currentUser?.fullName || state.currentUser?.name || oldDoc.ownerName || 'User';
    const edCode = oldDoc.edCode || oldDoc.doc_code || oldDoc.id;

    const newExternalRequest = {
      id: requestId,
      requestId,
      requestNo: requestId,
      edrNumber: requestId,
      docId: oldDoc.id,
      documentId: oldDoc.id,
      externalDocId: oldDoc.id,
      edCode,
      doc_code: edCode,
      docCode: edCode,
      documentCode: edCode,
      title: oldDoc.title,
      requestType: 'OBSOLETE',
      effectiveDate: obsoleteEffDate,
      obsoleteEffectiveDate: obsoleteEffDate,
      obsoleteDate: obsoleteEffDate,
      department: oldDoc.department,
      requesterId: ownerId,
      requesterName,
      requesterDepartment: oldDoc.department,
      requesterRole: state.currentUser?.position || state.currentUser?.role || 'Requester',
      reviewerId: targetRevId || null,
      reviewerName: reviewerObj ? (reviewerObj.fullName || reviewerObj.name) : null,
      reviewerRole: reviewerObj?.position || 'Reviewer',
      approverId: targetAppId || null,
      approverName: approverObj ? (approverObj.fullName || approverObj.name) : null,
      approverRole: approverObj?.position || 'Approver',
      status: targetRevId ? 'PENDING_EXT_REVIEW' : 'PENDING_EXT_APPROVAL',
      returnReason: null,
      revisionComment: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      signoffs: [
        {
          step: 'REQUEST',
          stepName: 'ยื่นคำร้อง',
          role: 'ผู้ยื่นคำร้อง',
          userId: ownerId,
          userName: requesterName,
          userRole: state.currentUser?.position || 'Requester',
          status: 'COMPLETED',
          date: nowIso,
          comment: payload.reason || 'ขอยกเลิกการใช้งานเอกสารภายนอก (Obsolete)'
        },
        {
          step: 'REVIEW',
          stepName: 'ทบทวนเอกสาร',
          role: 'ผู้ทบทวน',
          userId: targetRevId || null,
          userName: reviewerObj ? (reviewerObj.fullName || reviewerObj.name) : '-',
          userRole: reviewerObj?.position || 'Reviewer',
          status: targetRevId ? 'PENDING' : 'SKIPPED',
          date: null,
          comment: null
        },
        {
          step: 'APPROVE',
          stepName: 'อนุมัติเอกสาร',
          role: 'ผู้อนุมัติ',
          userId: targetAppId || null,
          userName: approverObj ? (approverObj.fullName || approverObj.name) : '-',
          userRole: approverObj?.position || 'Approver',
          status: targetAppId ? (targetRevId ? 'WAITING' : 'PENDING') : 'SKIPPED',
          date: null,
          comment: null
        }
      ]
    };

    const updatedSchedules = (state.periodicReviewSchedules || []).map(s => {
      const isMatch = s.externalDocumentId === oldDoc.id || s.documentId === oldDoc.id || s.documentNumber === edCode || s.id === `PRS-AUTO-${oldDoc.id}`;
      if (isMatch && (isAwaitingAction || s.status === 'AWAITING_ACTION' || s.review_status === 'AWAITING_ACTION')) {
        return {
          ...s,
          linkedRequestId: requestId,
          linkedActionId: requestId,
          linkageStatus: 'PENDING',
          updatedAt: new Date().toISOString()
        };
      }
      return s;
    });

    return {
      externalDocuments: state.externalDocuments.map(d => d.id === id ? updatedDoc : d),
      externalRequests: [newExternalRequest, ...(state.externalRequests || [])],
      periodicReviewSchedules: updatedSchedules,
      tasks: newTasks,
      notifications: newNotifications,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'EXT_DOC_OBSOLETE_REQUEST',
        details: `Requested obsolete for external document: ${oldDoc.title}`,
        actor: state.currentUser.name,
        actorId: state.currentUser.id,
        actorRole: state.currentUser.role || state.currentUser.position,
        date: new Date().toISOString()
      }, ...(state.actionLog || [])],
      externalAuditTrail: [{
        id: `EXTA-${Date.now()}`,
        docId: id,
        action: 'OBSOLETE_REQUEST',
        actor: state.currentUser.name,
        actorId: state.currentUser.id,
        date: new Date().toISOString(),
        details: `Requested obsolete: ${payload.reason}`
      }, ...state.externalAuditTrail]
    };
  }),

  createExternalRequest: (payload) => {
    const p = payload || {};
    const reqType = (p.type || p.requestType || p.extAction || '').toUpperCase();
    const docId = p.docId || p.documentId || p.id;
    if (reqType === 'OBSOLETE' && docId) {
      return get().obsoleteExternalDoc(docId, p);
    } else if (reqType === 'REVISION' && docId) {
      return get().updateExternalDoc(docId, p);
    } else {
      return get().registerExternalDoc(p);
    }
  },

  cancelExternalRequest: (requestIdOrDocId, reason = '') => {
    let affectedDocId = null;
    let targetReqId = null;
    set(state => {
      const key = String(requestIdOrDocId).trim();
      const req = (state.externalRequests || []).find(r => r.id === key || r.requestId === key || r.docId === key || r.externalDocId === key || r.edCode === key);
      targetReqId = req?.id || req?.requestId || key;
      affectedDocId = req?.docId || req?.externalDocId || req?.previousDocId || key;

      const updatedRequests = (state.externalRequests || []).map(r => {
        if (r.id === targetReqId || r.requestId === targetReqId) {
          return {
            ...r,
            status: 'CANCELLED',
            cancelReason: reason || 'Cancelled by user',
            cancelledAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        }
        return r;
      });

      const updatedTasks = (state.tasks || []).map(t => {
        if (t.referenceId === affectedDocId || t.docId === affectedDocId || t.id === targetReqId) {
          return { ...t, status: 'CANCELLED', is_completed: true, actionRequired: false, updatedAt: new Date().toISOString() };
        }
        return t;
      });

      return {
        externalRequests: updatedRequests,
        tasks: updatedTasks,
        actionLog: [{
          id: `LOG-${Date.now()}`,
          actionType: 'EXT_REQUEST_CANCELLED',
          details: `Cancelled external request ${targetReqId}`,
          actor: state.currentUser?.name,
          actorId: state.currentUser?.id,
          date: new Date().toISOString()
        }, ...(state.actionLog || [])]
      };
    });

    const store = get();
    const sched = (store.periodicReviewSchedules || []).find(s => 
      s.linkedRequestId === targetReqId || 
      s.linkedActionId === targetReqId || 
      String(s.documentId) === String(affectedDocId) || 
      String(s.externalDocumentId) === String(affectedDocId)
    );
    const doc = (store.externalDocuments || []).find(d => 
      d.linkedRequestId === targetReqId || 
      d.linkedActionId === targetReqId || 
      String(d.id) === String(affectedDocId)
    );

    if (sched?.linkedRequestId === targetReqId || sched?.linkedActionId === targetReqId || doc?.linkedRequestId === targetReqId || doc?.linkedActionId === targetReqId || doc?.review_status === 'AWAITING_ACTION' || sched?.status === 'AWAITING_ACTION') {
      store.resetPendingReviewIntent(sched?.id || doc?.id || affectedDocId);
    }
  },

  rejectExternalRequest: (requestIdOrDocId, reason = '') => {
    let affectedDocId = null;
    let targetReqId = null;
    set(state => {
      const key = String(requestIdOrDocId).trim();
      const req = (state.externalRequests || []).find(r => r.id === key || r.requestId === key || r.docId === key || r.externalDocId === key || r.edCode === key);
      targetReqId = req?.id || req?.requestId || key;
      affectedDocId = req?.docId || req?.externalDocId || req?.previousDocId || key;

      const updatedRequests = (state.externalRequests || []).map(r => {
        if (r.id === targetReqId || r.requestId === targetReqId) {
          return {
            ...r,
            status: 'REJECTED',
            rejectReason: reason || 'Rejected',
            rejectedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        }
        return r;
      });

      const updatedTasks = (state.tasks || []).map(t => {
        if (t.referenceId === affectedDocId || t.docId === affectedDocId || t.id === targetReqId) {
          return { ...t, status: 'REJECTED', is_completed: true, actionRequired: false, updatedAt: new Date().toISOString() };
        }
        return t;
      });

      return {
        externalRequests: updatedRequests,
        tasks: updatedTasks,
        actionLog: [{
          id: `LOG-${Date.now()}`,
          actionType: 'EXT_REQUEST_REJECTED',
          details: `Rejected external request ${targetReqId}: ${reason}`,
          actor: state.currentUser?.name,
          actorId: state.currentUser?.id,
          date: new Date().toISOString()
        }, ...(state.actionLog || [])]
      };
    });

    const store = get();
    const sched = (store.periodicReviewSchedules || []).find(s => 
      s.linkedRequestId === targetReqId || 
      s.linkedActionId === targetReqId || 
      String(s.documentId) === String(affectedDocId) || 
      String(s.externalDocumentId) === String(affectedDocId)
    );
    const doc = (store.externalDocuments || []).find(d => 
      d.linkedRequestId === targetReqId || 
      d.linkedActionId === targetReqId || 
      String(d.id) === String(affectedDocId)
    );

    if (sched?.linkedRequestId === targetReqId || sched?.linkedActionId === targetReqId || doc?.linkedRequestId === targetReqId || doc?.linkedActionId === targetReqId || doc?.review_status === 'AWAITING_ACTION' || sched?.status === 'AWAITING_ACTION') {
      store.resetPendingReviewIntent(sched?.id || doc?.id || affectedDocId);
    }
  },

  logExternalDownload: (id) => set((state) => {
    const doc = state.externalDocuments.find(d => d.id === id);
    const docTitle = doc ? doc.title : id;
    return {
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'EXT_DOC_DOWNLOAD',
        details: `Downloaded external document "${docTitle}"`,
        actor: state.currentUser.name,
        actorId: state.currentUser.id,
        actorRole: state.currentUser.role || state.currentUser.position,
        date: new Date().toISOString()
      }, ...(state.actionLog || [])],
      externalAuditTrail: [{
        id: `EXTA-${Date.now()}`,
        docId: id,
        action: 'DOWNLOAD',
        actor: state.currentUser.name,
        actorId: state.currentUser.id,
        date: new Date().toISOString(),
        details: 'Downloaded confidential document'
      }, ...state.externalAuditTrail]
    };
  }),

  logDocumentDownload: (docOrId, downloadMode = 'UNCONTROLLED', user = null) => set((state) => {
    const docId = typeof docOrId === 'object' ? (docOrId.id || docOrId.docCode || docOrId.document_code) : docOrId;
    const doc = (state.documents || []).find(d => d.id === docId || d.docCode === docId || d.document_code === docId) || (typeof docOrId === 'object' ? docOrId : {});
    const actor = user || state.currentUser || { name: 'Authorized User', department: 'QMS' };
    const docCode = doc.docCode || doc.document_code || doc.edCode || doc.title || docId || '-';
    const docTitle = doc.name || doc.docTitle || doc.title || '-';

    const isClean = downloadMode === 'CLEAN' || downloadMode === 'CLEAN_MASTER' || downloadMode === 'MASTER_CLEAN';
    const isControlled = downloadMode === 'CONTROLLED' || downloadMode === 'CONTROLLED_COPY';
    const actionLabel = isClean ? 'DOWNLOAD_CLEAN_MASTER' : (isControlled ? 'DOWNLOAD_CONTROLLED' : 'DOWNLOAD_UNCONTROLLED');
    const details = isClean
      ? `Downloaded Clean Master PDF (3x3 Signatory Table, No Watermark) for "${docCode} - ${docTitle}"`
      : (isControlled
          ? `Downloaded Controlled Copy PDF for "${docCode} - ${docTitle}"`
          : `Downloaded Uncontrolled Copy PDF with Red Watermark for "${docCode} - ${docTitle}"`);

    const auditEntry = {
      id: `audit-dl-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      documentId: doc.id || docId,
      docCode,
      docTitle,
      action: actionLabel,
      actionType: actionLabel,
      downloadMode: isClean ? 'CLEAN_MASTER' : (isControlled ? 'CONTROLLED' : 'UNCONTROLLED'),
      user: actor.name || actor.username || 'Authorized User',
      userName: actor.name || actor.username || 'Authorized User',
      actor: actor.name || actor.username || 'Authorized User',
      userId: actor.id || actor.empId || 'U000',
      userDept: actor.department || actor.dept || 'QMS',
      department: actor.department || actor.dept || 'QMS',
      timestamp: new Date().toISOString(),
      date: new Date().toISOString(),
      details
    };

    return {
      controlledCopyAuditTrail: [auditEntry, ...(state.controlledCopyAuditTrail || [])],
      externalAuditTrail: [auditEntry, ...(state.externalAuditTrail || [])],
      actionLog: [auditEntry, ...(state.actionLog || [])]
    };
  }),

  // ─── External Document Family Lineage Selector ──────────────────────────────
  getExternalDocumentFamily: (docNoOrId) => {
    const state = get();
    if (!docNoOrId) return [];
    const target = String(docNoOrId).split('-SUPERSEDED')[0].split('_SUPERSEDED')[0].trim().toUpperCase();
    return (state.externalDocuments || []).filter(d => {
      const code = String(d.docNo || d.edCode || d.doc_code || d.docCode || d.id || '').split('-SUPERSEDED')[0].split('_SUPERSEDED')[0].trim().toUpperCase();
      return code === target || String(d.id) === String(docNoOrId);
    });
  },

  // ─── External Document Controlled Copy Disposition Handler ────────────────
  recordExternalCopyDisposition: (docId, copyNumber, dispositionData = {}) => set((state) => {
    const {
      dispositionAction = 'SHREDDED', // 'SHREDDED' | 'STAMPED_VOID'
      recalledAt = new Date().toISOString(),
      recalledBy = state.currentUser?.name || 'DCC Officer',
      notes = '',
      witnessName = '',
      referenceNo = ''
    } = dispositionData;

    const finalStatus = dispositionAction === 'SHREDDED' ? 'DESTROYED' : 'RECALLED';
    const targetDocIdStr = String(docId || '').trim();
    const targetDoc = (state.externalDocuments || []).find(d => 
      String(d.id) === targetDocIdStr || 
      String(d.edCode || d.doc_code || d.docNo || '').toUpperCase() === targetDocIdStr.toUpperCase()
    );
    const targetDocCode = targetDoc?.edCode || targetDoc?.doc_code || targetDocIdStr;
    const targetDocTitle = targetDoc?.title || targetDoc?.name || targetDocCode;

    const targetCopiesList = Array.isArray(copyNumber) ? copyNumber.map(String) : [String(copyNumber)];

    const allCopies = (state.controlledCopyInstances && state.controlledCopyInstances.length > 0)
      ? state.controlledCopyInstances
      : (state.documentControlledCopies || []);

    const isMatchCopy = (c) => {
      const matchDoc = String(c.externalDocId || c.external_doc_id || c.docId || c.doc_id || c.documentId) === targetDocIdStr ||
                       (targetDoc && String(c.externalDocId || c.external_doc_id || c.docId || c.doc_id || c.documentId) === String(targetDoc.id)) ||
                       (targetDocCode && (String(c.doc_code || c.docCode || c.documentCode || '').trim().toUpperCase() === targetDocCode.toUpperCase()));
      if (!matchDoc) return false;

      if (targetCopiesList.includes('ALL')) return true;

      const cId = String(c.id || c.copyId || '');
      const cCode = String(c.copyCode || c.copy_code || '');
      const cNo = String(c.copy_no || c.copyNo || c.ccNumber || '');
      const cNoClean = cNo.replace(/\D/g, '');
      const cNum = String(c.copyNumber || '');

      return targetCopiesList.some(target => {
        const tStr = String(target).trim();
        const tClean = tStr.replace(/\D/g, '');
        return cId === tStr || 
               cCode === tStr ||
               cNo === tStr || 
               (tClean && cNoClean === tClean) || 
               cNum === tStr ||
               `Copy ${tClean}` === tStr ||
               `CC-${tClean.padStart(3, '0')}` === tStr;
      });
    };

    let affectedCount = 0;
    const updatedCopies = allCopies.map(c => {
      if (isMatchCopy(c)) {
        affectedCount++;
        return {
          ...c,
          status: finalStatus,
          disposition_method: dispositionAction,
          dispositionAction: dispositionAction,
          recalled_at: recalledAt,
          recalledAt: recalledAt,
          dateRecalled: recalledAt.split('T')[0],
          recalled_by: recalledBy,
          recalledBy: recalledBy,
          disposed_by_name: recalledBy,
          disposed_by_id: state.currentUser?.id || '',
          dcc_notes: notes || c.dcc_notes,
          notes: notes || c.notes,
          witness_name: witnessName || c.witness_name,
          reference_no: referenceNo || c.reference_no,
          ...(dispositionAction === 'SHREDDED' ? {
            destroyed_at: recalledAt,
            dateDestroyed: recalledAt.split('T')[0]
          } : {})
        };
      }
      return c;
    });

    const mapCopyStatus = (c) => {
      if (isMatchCopy(c)) {
        return {
          ...c,
          status: finalStatus,
          disposition_method: dispositionAction,
          recalled_at: recalledAt,
          recalled_by: recalledBy,
          notes: notes || c.notes,
          ...(dispositionAction === 'SHREDDED' ? {
            destroyed_at: recalledAt,
            dateDestroyed: recalledAt.split('T')[0]
          } : {})
        };
      }
      return c;
    };

    const updatedDocs = (state.externalDocuments || []).map(d => {
      const isTargetDoc = String(d.id) === targetDocIdStr || 
                          (targetDoc && String(d.id) === String(targetDoc.id)) ||
                          (targetDocCode && (String(d.edCode || d.doc_code || d.code || '').toUpperCase() === targetDocCode.toUpperCase()));
      if (isTargetDoc && (Array.isArray(d.controlledCopies) || Array.isArray(d.distributionList))) {
        return {
          ...d,
          ...(Array.isArray(d.controlledCopies) ? { controlledCopies: d.controlledCopies.map(mapCopyStatus) } : {}),
          ...(Array.isArray(d.distributionList) ? { distributionList: d.distributionList.map(mapCopyStatus) } : {})
        };
      }
      return d;
    });

    const matchedCopies = allCopies.filter(isMatchCopy);
    const newDispositionRecords = (matchedCopies.length > 0 ? matchedCopies : [{ copy_no: copyNumber }]).map(copy => ({
      id: `DISP-EXT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      copyId: copy.id || `${targetDocIdStr}-${copy.copy_no || copyNumber}`,
      copy_id: copy.id || `${targetDocIdStr}-${copy.copy_no || copyNumber}`,
      docCode: targetDocCode,
      docTitle: targetDocTitle,
      revision: copy.rev || targetDoc?.rev || '01',
      copyNumber: copy.copy_no ? (String(copy.copy_no).startsWith('Copy') ? copy.copy_no : `Copy ${copy.copy_no}`) : `Copy ${copyNumber}`,
      copy_no: copy.copy_no || copyNumber || '01',
      department: copy.holder_dept || copy.department || targetDoc?.department || '-',
      location: copy.location || copy.locationName || '-',
      dispositionType: finalStatus,
      dispositionMethod: dispositionAction,
      disposedBy: state.currentUser ? `${state.currentUser.name} (${state.currentUser.role || 'DCC'})` : `${recalledBy} (DCC)`,
      disposed_by_name: recalledBy,
      disposed_by_id: state.currentUser?.id || '',
      disposedAt: recalledAt,
      witnessName: witnessName || '',
      referenceNo: referenceNo || '',
      notes: notes || ''
    }));

    const actionLabel = dispositionAction === 'SHREDDED' ? 'ย่อยทำลายทิ้ง (Shred / Destroy)' : 'ประทับตรายกเลิก (Stamp VOID / Archive)';
    const auditLog = {
      id: `EXTA-DISP-${Date.now()}`,
      docId: targetDoc?.id || targetDocIdStr,
      docCode: targetDocCode,
      action: finalStatus === 'DESTROYED' ? 'COPY_DESTROYED' : 'COPY_RECALLED',
      actor: recalledBy,
      actorId: state.currentUser?.id || '',
      date: recalledAt,
      timestamp: recalledAt,
      details: `DCC บันทึกการจัดการสำเนา (${actionLabel}) จำนวน ${affectedCount || 1} ชุด ${notes ? `(หมายเหตุ: ${notes})` : ''}`
    };

    const actionLogEntry = {
      id: `LOG-EXT-DISP-${Date.now()}`,
      actionType: 'EXT_COPY_DISPOSITION',
      action: 'EXT_COPY_DISPOSITION',
      actor: recalledBy,
      details: `DCC บันทึกการจัดการสำเนา (${actionLabel}) สำหรับเอกสารภายนอก ${targetDocCode} (${targetDocTitle}) จำนวน ${affectedCount || 1} ชุด`,
      date: recalledAt,
      timestamp: recalledAt
    };

    const remainingPendingForDoc = updatedCopies.some(c => {
      const matchDoc = String(c.externalDocId || c.external_doc_id || c.docId || c.doc_id) === targetDocIdStr ||
                       (targetDoc && String(c.externalDocId || c.external_doc_id || c.docId || c.doc_id) === String(targetDoc.id)) ||
                       (targetDocCode && (String(c.doc_code || c.docCode || '').trim().toUpperCase() === targetDocCode.toUpperCase()));
      return matchDoc && (c.status === 'PENDING_RECALL' || c.status === 'SUPERSEDED_PENDING_RECALL' || c.status === 'OBSOLETE_PENDING_RECALL');
    });

    const updatedTasks = (state.tasks || []).map(t => {
      const isRecallTask = t.type === 'DCC_RECALL_WITH_CHECKLIST' || t.taskType === 'DCC_RECALL_WITH_CHECKLIST' || t.type === 'DCC_RECALL';
      const isMatchDoc = (t.docId && (String(t.docId) === targetDocIdStr || (targetDoc && String(t.docId) === String(targetDoc.id)))) ||
                         (t.externalDocId && (String(t.externalDocId) === targetDocIdStr || (targetDoc && String(t.externalDocId) === String(targetDoc.id)))) ||
                         (t.doc_code && targetDocCode && String(t.doc_code).toUpperCase() === targetDocCode.toUpperCase()) ||
                         (t.docCode && targetDocCode && String(t.docCode).toUpperCase() === targetDocCode.toUpperCase());
      if (isRecallTask && isMatchDoc && !remainingPendingForDoc) {
        return {
          ...t,
          status: 'COMPLETED',
          is_completed: true,
          completed_at: recalledAt,
          resolved_at: recalledAt,
          resolved_by: recalledBy
        };
      }
      return t;
    });

    return {
      controlledCopyInstances: updatedCopies,
      documentControlledCopies: updatedCopies,
      externalDocuments: updatedDocs,
      copyDispositionRecords: [...newDispositionRecords, ...(state.copyDispositionRecords || [])],
      dispositionHistory: [...newDispositionRecords, ...(state.dispositionHistory || [])],
      externalAuditTrail: [auditLog, ...(state.externalAuditTrail || [])],
      actionLog: [actionLogEntry, ...(state.actionLog || [])],
      tasks: updatedTasks
    };
  }),

  processExternalTask: (taskId, action, comment) => set((state) => {
    // ─── Phase 2: Defensive Task Lookup ───────────────────────────────────
    // Primary: find by taskId. Fallback: find by referenceId or docCode.
    let taskIndex = state.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      // Fallback: search by referenceId or docCode (handles ID mismatch edge cases)
      taskIndex = state.tasks.findIndex(t =>
        t.referenceId === taskId || t.docId === taskId || t.docCode === taskId
      );
    }
    if (taskIndex === -1) return state;

    const task = state.tasks[taskIndex];

    // ─── Phase 2.1: Precise Request Resolution (ISO 9001 Immutability) ───
    // First, resolve the exact request belonging to this task
    const matchingReq = (state.externalRequests || []).find(r =>
      r.id === task.referenceId || r.requestId === task.referenceId ||
      r.docId === task.referenceId || r.externalDocId === task.referenceId ||
      (task.docId && (r.docId === task.docId || r.externalDocId === task.docId)) ||
      (task.id && (r.taskId === task.id || r.reviewTaskId === task.id || r.approvalTaskId === task.id))
    ) || (state.externalRequests || []).find(r =>
      task.docCode && (r.edCode === task.docCode || r.doc_code === task.docCode || r.documentCode === task.docCode) &&
      (r.status === 'PENDING' || r.status === 'PENDING_EXT_REVIEW' || r.status === 'PENDING_EXT_APPROVAL' || r.status === 'IN_PROGRESS')
    );

    // Look up doc: check exact ID match in externalDocuments first
    let doc = (state.externalDocuments || []).find(d =>
      (task.referenceId && String(d.id) === String(task.referenceId)) ||
      (task.docId && String(d.id) === String(task.docId)) ||
      (matchingReq?.docId && String(d.id) === String(matchingReq.docId))
    );

    // If doc not yet in externalDocuments (e.g. pending revision draft), construct from matchingReq
    if (!doc && matchingReq) {
      doc = {
        id: matchingReq.docId || matchingReq.externalDocId || task.docId || task.referenceId || `EXT-${Date.now()}`,
        edCode: matchingReq.edCode || matchingReq.doc_code || matchingReq.docCode || task.docCode,
        doc_code: matchingReq.doc_code || matchingReq.edCode || task.docCode,
        title: matchingReq.title || matchingReq.docTitle || task.docTitle,
        department: matchingReq.department || matchingReq.requesterDepartment || task.department,
        reviewerId: matchingReq.reviewerId,
        approverId: matchingReq.approverId,
        ownerId: matchingReq.requesterId || task.requesterId,
        ownerName: matchingReq.requesterName || task.requesterName,
        status: matchingReq.status,
        rev: matchingReq.targetRevision || matchingReq.rev || '01',
        changeReason: matchingReq.changeReason || matchingReq.reason || '-',
        requestId: matchingReq.requestId || matchingReq.requestNo || matchingReq.id,
        edrNumber: matchingReq.requestNo || matchingReq.edrNumber || matchingReq.requestId || matchingReq.id,
        ...matchingReq
      };
    }

    // Defensive fallback: find active doc for that docCode (avoid matching superseded/obsolete docs)
    if (!doc) {
      doc = (state.externalDocuments || []).find(d =>
        task.docCode && (d.edCode === task.docCode || d.doc_code === task.docCode) &&
        d.status !== 'SUPERSEDED' && d.status !== 'OBSOLETE'
      ) || (state.externalDocuments || []).find(d =>
        task.docCode && (d.edCode === task.docCode || d.doc_code === task.docCode)
      );
    }

    if (!doc && task.metadata) {
      doc = { ...task.metadata };
    }
    if (!doc) return state;

    // Lossless Binary Persistence: Ensure doc retains attachedFile from matchingReq or task
    const candidateFile = matchingReq?.attachedFile || task.attachedFile || doc.attachedFile;
    const candidateFileId = matchingReq?.fileId || task.fileId || candidateFile?.fileId || doc.fileId;
    const candidateRawFileId = matchingReq?.rawFileId || task.rawFileId || candidateFile?.rawFileId || doc.rawFileId || candidateFileId;
    const candidateStorageKey = matchingReq?.fileStorageKey || task.fileStorageKey || candidateFile?.fileStorageKey || doc.fileStorageKey;
    const candidateFileName = matchingReq?.fileName || task.fileName || candidateFile?.name || doc.fileName;
    if (candidateFile || candidateFileId) {
      doc = {
        ...doc,
        ...(candidateFile ? { attachedFile: candidateFile, file: candidateFile, attachment: candidateFile } : {}),
        ...(candidateFileId ? { fileId: candidateFileId } : {}),
        ...(candidateRawFileId ? { rawFileId: candidateRawFileId } : {}),
        ...(candidateStorageKey ? { fileStorageKey: candidateStorageKey } : {}),
        ...(candidateFileName ? { fileName: candidateFileName } : {})
      };
    }

    const isObsolete = task.extAction === 'OBSOLETE' || matchingReq?.requestType === 'OBSOLETE' || matchingReq?.type === 'OBSOLETE';
    const isRevision = !isObsolete && ['REVISION', 'UPDATE', 'REVISE'].includes(
      matchingReq?.requestType || matchingReq?.type || matchingReq?.actionType || matchingReq?.extAction || task.extAction || ''
    );

    const reqNo = matchingReq?.requestNo || matchingReq?.requestId || matchingReq?.id || task.referenceId || doc.edCode || 'EDR';
    const reqId = matchingReq?.id || matchingReq?.requestId || task.referenceId;
    const requesterId = matchingReq?.requesterId || task.requesterId || doc.ownerId || state.currentUser?.id || '';
    const edCode = doc.edCode || doc.doc_code || doc.docNo || matchingReq?.edCode || matchingReq?.doc_code || matchingReq?.docCode || task.docCode || doc.id || 'ED-???';
    const docCode = edCode;
    const docTitle = doc.title || doc.name || matchingReq?.title || task.docTitle || 'เอกสารภายนอก';



    let newDocStatus = doc.status;
    let newTasks = state.tasks.filter(t => t.id !== taskId);
    let newNotifications = [...state.notifications];
    let updatedDocs = [...state.externalDocuments];
    let currentCopies = state.documentControlledCopies || state.controlledCopyInstances || [];
    let newCreatedCopies = [];

    // ─── Helper: Safe notification push (never crashes on bad userId) ─────
    const safeNotify = (notif) => {
      try {
        if (notif && (notif.userId || notif.isGlobal || notif.targetDepartment || (Array.isArray(notif.targetUserIds) && notif.targetUserIds.length > 0))) {
          newNotifications.push({
            ...notif,
            readBy: Array.isArray(notif.readBy) ? notif.readBy : [],
            isRead: Boolean(notif.isRead || notif.read),
            read: Boolean(notif.isRead || notif.read)
          });
        }
      } catch { /* swallow */ }
    };

    // APPROVE Action
    if (action === 'APPROVE') {
      if (task.type === 'EXT_REVIEW' || task.type === 'EXTERNAL_REVIEW') {
        const approverId = isObsolete ? doc.obsoleteApproverId : (doc.approverId || task.approverId || matchingReq?.approverId);
        if (approverId) {
          newDocStatus = 'PENDING_EXT_APPROVAL';
          const newTaskId = `extt-${Date.now()}-app`;
          newTasks.push({
            id: newTaskId,
            referenceType: 'EXTERNAL_DOC',
            referenceId: doc.id,
            docId: doc.id,
            docCode: edCode,
            doc_code: edCode,
            docTitle: doc.title,
            docName: doc.title,
            title: `${edCode}: ${doc.title}`,
            type: 'EXT_APPROVAL',
            taskType: 'EXT_APPROVAL',
            assigneeId: approverId,
            requesterId: requesterId,
            requesterName: task.requesterName || doc.ownerName || 'User',
            requesterDepartment: doc.department,
            department: doc.department,
            origin: 'EXTERNAL',
            status: 'PENDING',
            extAction: task.extAction,
            ...(doc.attachedFile ? { attachedFile: doc.attachedFile, file: doc.attachedFile, attachment: doc.attachedFile } : {}),
            ...(doc.fileId ? { fileId: doc.fileId } : {}),
            ...(doc.rawFileId ? { rawFileId: doc.rawFileId } : {}),
            ...(doc.fileStorageKey ? { fileStorageKey: doc.fileStorageKey } : {}),
            ...(doc.fileName ? { fileName: doc.fileName } : {})
          });
          // Phase 1 Point 2: Notify Approver (safe dispatch)
          safeNotify({
            id: Date.now() + Math.random(),
            userId: approverId,
            title: 'มีเอกสารภายนอกรอการอนุมัติ',
            message: `คำร้อง ${reqNo} (${docTitle}) ผ่านการทบทวนแล้ว รอให้คุณพิจารณาอนุมัติ`,
            link: '/dcc/tasks',
            type: 'TASK_ASSIGNED',
            category: 'EXTERNAL_DOC',
            isRead: false,
            read: false,
            timestamp: new Date().toISOString(),
            relatedTaskId: newTaskId
          });
          // Phase 1 Point 2: Notify Requester (safe dispatch)
          safeNotify({
            id: Date.now() + Math.random() + 0.1,
            userId: requesterId,
            title: 'คำร้องผ่านการทบทวนแล้ว',
            message: `คำร้อง ${reqNo} ผ่านการทบทวนและส่งต่อให้ผู้อนุมัติแล้ว`,
            link: `/dcc/external/my-requests?id=${reqId}`,
            type: 'WORKFLOW_UPDATE',
            category: 'EXTERNAL_DOC',
            isRead: false,
            read: false,
            timestamp: new Date().toISOString()
          });
          // Phase 2: activityLog audit trail is handled in the updatedRequests map below
        } else {
          // If no approver, it's fully approved
          newDocStatus = isObsolete ? 'OBSOLETE_ARCHIVED' : 'ACTIVE';
        }
      } else if (task.type === 'EXT_APPROVAL' || task.type === 'EXTERNAL_APPROVAL') {
        newDocStatus = isObsolete ? 'OBSOLETE_ARCHIVED' : 'ACTIVE';
      }

      // ─── REVISION Lifecycle: Retire prior revision to SUPERSEDED ───────────
      // When a REVISION request is fully approved:
      //   1. Prior active document record → Cloned to immutable SUPERSEDED snapshot (id: [UNIQUE_ID], status: 'SUPERSEDED')
      //   2. Idempotency guard: prevent duplicate snapshot creation if edition is already active
      //   3. Prior controlled copies → PENDING_RECALL
      //   4. Create DCC recall task for physical copy retrieval
      //   5. Notify requester of successful revision publication
      if (newDocStatus === 'ACTIVE' && isRevision) {
        const resolvedPrevDocId = String(
          matchingReq?.previousDocId || doc.previousDocId || doc.previousRevDocId || ''
        );
        const targetDocNo = String(doc.edCode || doc.doc_code || doc.docNo || matchingReq?.edCode || task.docCode || '').trim();
        const newEdition = String(matchingReq?.sourceVersion || matchingReq?.edition || doc?.sourceVersion || doc?.edition || 'ฉบับใหม่').trim();

        // 1. Find existing active record matching docNo (or previousDocId)
        const priorDoc = (state.externalDocuments || []).find(d =>
          (
            (resolvedPrevDocId && String(d.id) === resolvedPrevDocId) ||
            (targetDocNo && (String(d.edCode || d.doc_code || d.docNo || '').trim() === targetDocNo))
          ) &&
          (d.status === 'ACTIVE' || d.status === 'EFFECTIVE') &&
          !d.is_superseded &&
          !d.is_obsolete &&
          d.status !== 'SUPERSEDED' &&
          d.status !== 'OBSOLETE'
        );

        // 2. Idempotency Guard: Verify that an active record with the target edition does not already exist
        const alreadyHasActiveEdition = (state.externalDocuments || []).some(d =>
          (targetDocNo && String(d.edCode || d.doc_code || d.docNo || d.id).trim() === targetDocNo) &&
          (d.status === 'ACTIVE' || d.status === 'EFFECTIVE') &&
          !d.is_superseded &&
          !d.is_obsolete &&
          String(d.edition || d.sourceVersion || '').trim() === newEdition
        );

        const supersededAt = new Date().toISOString();
        const priorEdLabel = priorDoc?.edition || priorDoc?.sourceVersion || 'ฉบับเดิม';

        let snapshotId = null;
        if (priorDoc && !alreadyHasActiveEdition) {
          snapshotId = `${priorDoc.id}-SUPERSEDED-${Date.now()}`;
          const priorEdKey = String(priorDoc.edition || priorDoc.sourceVersion || priorDoc.rev || '1.0').trim();
          const priorRawFileId = priorDoc.rawFileId || priorDoc.attachedFile?.rawFileId || priorDoc.attachedFile?.fileId || priorDoc.fileId || priorDoc.id;
          const priorStorageKey = priorDoc.fileStorageKey || priorDoc.attachedFile?.fileStorageKey || (targetDocNo && priorEdKey ? `FILE_${targetDocNo}_ED_${priorEdKey}` : snapshotId);
          const supersededSnapshot = {
            ...priorDoc,
            id: snapshotId,
            rawFileId: priorRawFileId,
            fileId: priorDoc.fileId || priorRawFileId,
            fileStorageKey: priorStorageKey,
            ...(priorDoc.attachedFile ? {
              attachedFile: {
                ...priorDoc.attachedFile,
                rawFileId: priorRawFileId,
                fileStorageKey: priorStorageKey
              }
            } : {}),
            status: 'SUPERSEDED',
            is_superseded: true,
            supersededAt,
            supersededDate: supersededAt,
            supersededByEdition: newEdition,
            supersededByDocId: doc.id || `EXT-${Date.now()}`,
            supersededByCode: targetDocNo,
            supersededByRequestId: matchingReq?.id || matchingReq?.requestId || task.referenceId,
            supersededByEdrNumber: matchingReq?.requestNo || matchingReq?.edrNumber || reqNo
          };

          resolveFileBlob(priorDoc, priorRawFileId).then(b => {
            if (b) {
              saveFile(snapshotId, b).catch(() => {});
              if (priorStorageKey) saveFile(priorStorageKey, b).catch(() => {});
              if (targetDocNo && priorEdKey) {
                saveFile(`FILE_${targetDocNo}_ED_${priorEdKey}`, b).catch(() => {});
                saveFile(`DOC_${targetDocNo}_ED_${priorEdKey}`, b).catch(() => {});
                saveFile(`FILE_${targetDocNo}_${priorEdKey}`, b).catch(() => {});
              }
            }
          }).catch(() => {});

          // In updatedDocs, replace priorDoc with supersededSnapshot
          const priorIdx = updatedDocs.findIndex(d => String(d.id) === String(priorDoc.id));
          if (priorIdx >= 0) {
            updatedDocs[priorIdx] = supersededSnapshot;
          } else {
            updatedDocs.push(supersededSnapshot);
          }

          // Step 2: Recall physical controlled copies of prior edition
          const prevActiveCopiesForRevision = currentCopies.filter(c =>
            (String(c.doc_id || c.docId || c.external_doc_id || c.externalDocId) === String(priorDoc.id) ||
             String(c.doc_id || c.docId || c.external_doc_id || c.externalDocId) === snapshotId) &&
            (c.status === 'ISSUED_ACTIVE' || c.status === 'ACTIVE' || c.status === 'DISPATCHED_PENDING_RECEIPT')
          );

          if (prevActiveCopiesForRevision.length > 0) {
            currentCopies = currentCopies.map(c => {
              const cId = String(c.doc_id || c.docId || c.external_doc_id || c.externalDocId);
              if (
                (cId === String(priorDoc.id) || cId === snapshotId) &&
                c.status !== 'DESTROYED' && c.status !== 'RECALLED' && c.status !== 'ARCHIVED_OBSOLETE'
              ) {
                return { ...c, status: 'PENDING_RECALL' };
              }
              return c;
            });

            // Step 3: Create DCC recall task for superseded copy retrieval
            newTasks.push({
              id: `task-dcc-recall-revision-${priorDoc.id}-${Date.now()}`,
              referenceType: 'EXTERNAL_DOC',
              type: 'DCC_RECALL_WITH_CHECKLIST',
            assignee_department: 'DC',
            document_department: 'QC',
              taskType: 'DCC_RECALL_WITH_CHECKLIST',
              title: `เรียกคืนเอกสารภายนอกฉบับ Superseded: ${targetDocNo} (${priorEdLabel}) จำนวน ${prevActiveCopiesForRevision.length} จุด`,
              description: `เอกสาร ${targetDocNo} มีฉบับใหม่ (${newEdition}) แล้ว ฉบับเดิม (${priorEdLabel}) ถูกเปลี่ยนสถานะเป็น Superseded กรุณาเรียกคืนตาม Checklist`,
              docId: snapshotId,
              externalDocId: snapshotId,
              doc_code: targetDocNo,
              docCode: targetDocNo,
              docTitle: priorDoc.title || docTitle,
              docName: priorDoc.title || docTitle,
              department: 'DC',
              target_department: 'DC',
              doc_version: priorEdLabel,
              assigneeId: resolveDccAdminUserId(state.masterUsers),
              assignedToRole: 'DCC_ADMIN',
              targetRole: 'DCC_ADMIN',
              target_role: 'DCC_ADMIN',
              origin: 'EXTERNAL',
              status: 'PENDING',
              priority: 'HIGH',
              dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              createdAt: supersededAt
            });

            // Notify DCC Admin about superseded recall task
            const dccAdminId = resolveDccAdminUserId(state.masterUsers);
            if (dccAdminId) {
              safeNotify({
                id: `notif-edr-recall-dcc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                userId: dccAdminId,
                targetUserIds: [dccAdminId],
                title: 'ภาระงานเรียกคืนสำเนาเอกสารภายนอกตกรุ่น',
                message: `เอกสาร ${targetDocNo} มีฉบับใหม่ (${newEdition}) แล้ว กรุณาเรียกคืนสำเนาเดิม (${priorEdLabel}) (${prevActiveCopiesForRevision.length} จุด)`,
                link: '/controlled-copy',
                type: 'TASK_ASSIGNED',
                category: 'CONTROLLED_COPY',
                isRead: false,
                read: false,
                readBy: [],
                timestamp: supersededAt,
                docCode: targetDocNo
              });
            }

            // Notify copy holders' departments to return old physical copies
            const holderDepts = Array.from(new Set(prevActiveCopiesForRevision.map(c => c.holder_dept || c.department || c.dept).filter(Boolean)));
            holderDepts.forEach(hDept => {
              safeNotify({
                id: `notif-edr-recall-dept-${hDept}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                targetDepartment: hDept,
                isGlobal: false,
                title: `แจ้งเตือนเรียกคืนสำเนาเอกสารภายนอก: ${targetDocNo}`,
                message: `เอกสาร ${targetDocNo} มีการปรับปรุงฉบับใหม่ (${newEdition}) กรุณาส่งคืนสำเนาเดิม (${priorEdLabel}) ต่อเจ้าหน้าที่ DCC`,
                link: '/controlled-copy',
                type: 'ACTION_REQUIRED',
                category: 'CONTROLLED_COPY',
                isRead: false,
                read: false,
                readBy: [],
                timestamp: supersededAt,
                docCode: targetDocNo
              });
            });
          }
        }

        // Step 4: Notify requester — revision published successfully
        safeNotify({
          id: `notif-edr-revpub-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          userId: requesterId,
          targetUserIds: [requesterId],
          title: 'เอกสารภายนอกฉบับปรับปรุงได้รับการอนุมัติแล้ว',
          message: `เอกสาร ${targetDocNo} (${newEdition}) ได้รับการอนุมัติเรียบร้อยแล้ว ฉบับก่อนหน้า (${priorEdLabel}) ถูกเปลี่ยนสถานะเป็น Superseded โดยอัตโนมัติ`,
          link: `/dcc/external/my-requests?id=${reqId}`,
          type: 'SUCCESS',
          category: 'EXTERNAL_DOC',
          isRead: false,
          read: false,
          readBy: [],
          timestamp: new Date().toISOString(),
          docCode: targetDocNo,
          refId: reqId
        });
      }
      // ─── End REVISION Lifecycle ──────────────────────────────────────────────

      // Handle Physical Controlled Copies on Final Approval
      if (newDocStatus === 'ACTIVE') {
        // Phase 1 Point 4: Notify Requester of Success
        safeNotify({
          id: `notif-edr-req-succ-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          userId: requesterId,
          targetUserIds: [requesterId],
          title: 'คำร้องเอกสารภายนอกได้รับการอนุมัติแล้ว',
          message: `เอกสาร ${docCode} (${docTitle}) ได้รับการอนุมัติและขึ้นทะเบียนในคลังเรียบร้อยแล้ว`,
          link: `/dcc/external/my-requests?id=${reqId}`,
          type: 'SUCCESS',
          category: 'EXTERNAL_DOC',
          isRead: false,
          read: false,
          readBy: [],
          timestamp: new Date().toISOString(),
          docCode: docCode,
          refId: reqId
        });

        // Notify DCC Admin of Approval
        const dccAdminId = resolveDccAdminUserId(state.masterUsers);
        if (dccAdminId && dccAdminId !== requesterId) {
          safeNotify({
            id: `notif-edr-dcc-app-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            userId: dccAdminId,
            targetUserIds: [dccAdminId],
            title: 'คำร้องเอกสารภายนอกได้รับการอนุมัติแล้ว',
            message: `คำร้อง ${reqNo} (${docCode} - ${docTitle}) ได้รับการอนุมัติแล้ว พร้อมสำหรับขึ้นทะเบียน/แจกจ่าย`,
            link: '/tasks',
            type: 'TASK_ASSIGNED',
            category: 'EXTERNAL_DOC',
            isRead: false,
            read: false,
            readBy: [],
            timestamp: new Date().toISOString(),
            docCode: docCode,
            refId: reqId
          });
        }

        // Notify destination department personnel of document publication
        safeNotify({
          id: `notif-edr-dept-pub-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          targetDepartment: doc.department,
          isGlobal: !doc.department,
          title: `ประกาศใช้เอกสารภายนอก: ${docCode}`,
          message: `เอกสารภายนอก "${docTitle}" (${docCode}) ขึ้นทะเบียนและมีผลบังคับใช้แล้ว`,
          link: '/dcc/external-docs',
          type: 'INFO',
          category: 'EXTERNAL_DOC',
          isRead: false,
          read: false,
          readBy: [],
          timestamp: new Date().toISOString(),
          docCode: docCode,
          refId: reqId
        });

        const stations = doc.distributions || doc.physical_distribution || [];
        const docVer = doc.rev || doc.sourceVersion || '01';
        const docEd = doc.edition || doc.sourceVersion || docVer;
        const nowIso = new Date().toISOString();
        const todayStr = nowIso.split('T')[0];

        if (stations.length > 0) {
          newCreatedCopies = stations.map((station, index) => {
            const copyNoStr = String(index + 1).padStart(2, '0');
            const ccNumStr = `CC-${String(index + 1).padStart(3, '0')}`;
            const copyCode = `${docCode}-C${copyNoStr}`;
            const holderDept = station.departmentId || station.dept_code || station.dept || station.department || doc.department;
            const locName = station.locationName || station.station_name || station.name || station.location || `${holderDept} Head Office`;
            const locId = station.locationId || station.station_id || station.id || `${holderDept}-LOC-${index + 1}`;
            const holderName = station.holder || station.custodianName || `${holderDept} (${locName})`;
            return {
              id: `cc-ext-${doc.id || docCode}-${copyNoStr}`,
              copyCode,
              copy_code: copyCode,
              doc_id: doc.id,
              docId: doc.id,
              documentId: doc.id,
              external_doc_id: doc.id,
              externalDocId: doc.id,
              document_code: docCode,
              documentCode: docCode,
              doc_code: docCode,
              docCode: docCode,
              document_title: doc.title,
              doc_title: doc.title,
              docTitle: doc.title,
              doc_type: 'ED',
              docType: 'ED',
              docName: doc.title,
              edition: docEd,
              doc_version: docVer,
              rev: docVer,
              copy_no: copyNoStr,
              copyNo: copyNoStr,
              copy_number: index + 1,
              copyNumber: index + 1,
              ccNumber: ccNumStr,
              issue_no: '01',
              issueNumber: 'I01',
              holder_dept: holderDept,
              department: holderDept,
              targetDepartment: holderDept,
              target_department: holderDept,
              departmentId: holderDept,
              dept_code: holderDept,
              holder: holderName,
              custodianName: holderName,
              holder_name: holderName,
              location: locName,
              locationName: locName,
              workstationLocation: locName,
              locationId: locId,
              station_id: locId,
              station_name: locName,
              status: 'PENDING_ISSUE',
              is_replacement: false,
              is_adhoc: false,
              is_external: true,
              isExternal: true,
              requested_by: doc.ownerName || state.currentUser?.name || 'Owner Department',
              requested_at: nowIso,
              createdAt: nowIso,
              distributedDate: todayStr,
              dateIssued: todayStr
            };
          });

          newTasks.push({
            id: `task-dcc-issue-ext-${doc.id}-${Date.now()}`,
            referenceType: 'EXTERNAL_DOC',
            type: 'DCC_DISTRIBUTE',
            assignee_department: 'DC',
            document_department: 'QC',
            taskType: 'DCC_ISSUE_CONTROLLED_COPIES',
            title: `จัดพิมพ์และส่งมอบสำเนาควบคุมเอกสารภายนอก: ${docCode} (${stations.length} จุด)`,
            description: `มีคำขอสำเนาควบคุมสำหรับเอกสารภายนอก ${docCode} จำนวน ${stations.length} เล่ม กรุณาจัดพิมพ์และแจกจ่าย`,
            docId: doc.id,
            externalDocId: doc.id,
            doc_code: docCode,
            docCode: docCode,
            is_external: true,
            doc_type: 'EXTERNAL',
            edition: docEd,
            docTitle: doc.title || docCode,
            docName: doc.title || docCode,
            department: 'DC',
            target_department: 'DC',
            doc_version: docVer,
            assigneeId: resolveDccAdminUserId(state.masterUsers),
            assignedToRole: 'DCC_ADMIN',
            targetRole: 'DCC_ADMIN',
            target_role: 'DCC_ADMIN',
            origin: 'EXTERNAL',
            status: 'PENDING',
            priority: 'HIGH',
            dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            createdAt: nowIso
          });

          // Phase 1 Point 4: Notify controlled copy recipient department staff (level < 6)
          stations.forEach((station, index) => {
            const copyNoStr = String(index + 1).padStart(2, '0');
            const holderDept = station.departmentId || station.dept_code || station.dept || doc.department;
            const deptStaff = (state.masterUsers || []).filter(u =>
              u && !u.isDcc && u.role !== 'DCC_ADMIN' &&
              (u.department === holderDept || (u.depts || []).includes(holderDept)) &&
              (Number(u.approval_level ?? u.level ?? 1) < 6)
            );
            deptStaff.forEach(staff => {
              newNotifications.push({
                id: Date.now() + Math.random(),
                userId: staff.id,
                title: 'มีสำเนาควบคุมใหม่รอตรวจรับ',
                message: `กรุณาตรวจรับสำเนาเล่ม ${copyNoStr} สำหรับเอกสาร ${docCode}`,
                link: '/dcc/tasks',
                type: 'TASK_ASSIGNED',
                category: 'EXTERNAL_DOC',
                isRead: false,
                read: false,
                timestamp: new Date().toISOString()
              });
            });
          });
        }
      } else if (newDocStatus === 'OBSOLETE_ARCHIVED' && isObsolete) {
        // Automatic Recall for Obsoleted External Document
        const targetDocId = String(doc.id);
        const activeDocCopies = currentCopies.filter(c => 
          (String(c.doc_id || c.docId || c.external_doc_id || c.externalDocId) === targetDocId ||
           (docCode && (c.doc_code === docCode || c.docCode === docCode))) &&
          c.status !== 'DESTROYED' && c.status !== 'RECALLED' && c.status !== 'ARCHIVED_OBSOLETE'
        );

        if (activeDocCopies.length > 0) {
          currentCopies = currentCopies.map(c => {
            const isMatch = String(c.doc_id || c.docId || c.external_doc_id || c.externalDocId) === targetDocId ||
                            (docCode && (c.doc_code === docCode || c.docCode === docCode));
            if (isMatch && c.status !== 'DESTROYED' && c.status !== 'RECALLED' && c.status !== 'ARCHIVED_OBSOLETE') {
              return { ...c, status: 'PENDING_RECALL' };
            }
            return c;
          });

          newTasks.push({
            id: `task-dcc-recall-ext-${targetDocId}-${Date.now()}`,
            referenceType: 'EXTERNAL_DOC',
            type: 'DCC_RECALL_WITH_CHECKLIST',
            assignee_department: 'DC',
            document_department: 'QC',
            taskType: 'DCC_RECALL_WITH_CHECKLIST',
            title: `เรียกคืนและทำลายเอกสารภายนอกที่ถูกยกเลิก: ${docCode} จำนวน ${activeDocCopies.length} จุด`,
            description: `เอกสารภายนอก ${docCode} ถูกยกเลิกการใช้งานแล้ว กรุณาเรียกคืนฉบับกระดาษตาม Checklist`,
            docId: targetDocId,
            externalDocId: targetDocId,
            doc_code: docCode,
            docCode: docCode,
            docTitle: doc.title || doc.name || docCode,
            docName: doc.title || doc.name || docCode,
            department: 'DC',
            target_department: 'DC',
            doc_version: doc.rev || '01',
            assigneeId: resolveDccAdminUserId(state.masterUsers),
            assignedToRole: 'DCC_ADMIN',
            targetRole: 'DCC_ADMIN',
            target_role: 'DCC_ADMIN',
            origin: 'EXTERNAL',
            status: 'PENDING',
            priority: 'HIGH',
            dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            createdAt: new Date().toISOString()
          });
        }
      }

      // REJECT / REVISE / RETURN Action
    } else if (action === 'REJECT' || action === 'REVISE' || action === 'RETURN') {
      const isReviewStep = task.type === 'EXT_REVIEW' || task.type === 'EXTERNAL_REVIEW';
      const isReturnForRevision = action === 'REVISE' || action === 'RETURN' || (action === 'REJECT' && isReviewStep);

      newTasks = newTasks.filter(t => t.id !== taskId);

      if (isReturnForRevision) {
        // Phase 1 Point 3: Return for Revision
        newDocStatus = 'REVISE_REQUESTED';
        const newTaskId = `extt-${Date.now()}-revise`;
        const actorName = state.currentUser?.fullName || state.currentUser?.name || (isReviewStep ? 'ผู้ทบทวน' : 'ผู้อนุมัติ');
        const shortComment = (comment || 'กรุณาแก้ไขรายละเอียดเอกสารภายนอกตามข้อเสนอแนะ').slice(0, 100);

        newTasks.push({
          id: newTaskId,
          referenceType: 'EXTERNAL_DOC',
          referenceId: doc.id,
          docId: doc.id,
          docCode: edCode,
          doc_code: edCode,
          docTitle: doc.title,
          docName: doc.title,
          title: `แก้ไขคำร้องเอกสารภายนอก: ${edCode} - ${doc.title}`,
          type: 'EXTERNAL_REVISE',
          taskType: 'EXTERNAL_REVISE',
          assigneeId: requesterId,
          requesterId: requesterId,
          reviewerId: doc.reviewerId,
          approverId: doc.approverId,
          returnReason: comment || 'กรุณาแก้ไขรายละเอียดเอกสารภายนอกตามข้อเสนอแนะ',
          rejectReason: comment || 'กรุณาแก้ไขรายละเอียดเอกสารภายนอกตามข้อเสนอแนะ',
          comment: comment,
          origin: 'EXTERNAL',
          status: 'PENDING',
          priority: 'HIGH',
          department: doc.department,
          extAction: task.extAction || 'REGISTER',
          returnedBy: actorName,
          returnedById: state.currentUser?.id,
          returnedRole: isReviewStep ? 'ผู้ทบทวน (Reviewer)' : 'ผู้อนุมัติ (Approver)',
          createdAt: new Date().toISOString(),
          ...(doc.attachedFile ? { attachedFile: doc.attachedFile, file: doc.attachedFile, attachment: doc.attachedFile } : {}),
          ...(doc.fileId ? { fileId: doc.fileId } : {}),
          ...(doc.fileName ? { fileName: doc.fileName } : {})
        });

        // Phase 1 Point 3: Notify Requester
        newNotifications.push({
          id: Date.now() + Math.random(),
          userId: requesterId,
          title: 'คำร้องเอกสารภายนอกถูกส่งกลับแก้ไข',
          message: `คำร้อง ${reqNo} ถูกส่งกลับแก้ไขโดย ${actorName}: ${shortComment}`,
          link: `/dcc/external/my-requests?id=${reqId}`,
          type: 'ACTION_REQUIRED',
          category: 'EXTERNAL_DOC',
          isRead: false,
          read: false,
          timestamp: new Date().toISOString()
        });
      } else {
        // Phase 1 Point 5: Approver Rejection / Obsolete Rejection
        if (isObsolete) {
          newDocStatus = 'ACTIVE';
        } else {
          newDocStatus = 'REJECTED';
        }

        // Phase 1 Point 5: Notify Requester
        newNotifications.push({
          id: Date.now() + Math.random(),
          userId: requesterId,
          title: 'คำร้องเอกสารภายนอกไม่ได้รับการอนุมัติ',
          message: `คำร้อง ${reqNo} ไม่ผ่านการอนุมัติ: ${comment || 'ไม่ผ่านเกณฑ์การพิจารณาอนุมัติ'}`,
          link: `/dcc/external/my-requests?id=${reqId}`,
          type: 'REJECTED',
          category: 'EXTERNAL_DOC',
          isRead: false,
          read: false,
          timestamp: new Date().toISOString()
        });
      }
    }

    if (action === 'APPROVE') {
      if (newDocStatus === 'ACTIVE') {
        // Propagate effectiveDate, issuer, accessScope, reviewCycle, and department from the matching request
        const resolvedRequest = matchingReq || (state.externalRequests || []).find(r =>
          r.docId === doc.id || r.externalDocId === doc.id ||
          (doc.edCode && (r.edCode === doc.edCode || r.doc_code === doc.edCode))
        );
        const resolvedIssuer = doc.issuer || doc.officialIssuer || doc.source || resolvedRequest?.issuer || resolvedRequest?.officialIssuer || resolvedRequest?.source || '';
        const resolvedEffectiveDate = doc.effectiveDate || resolvedRequest?.effectiveDate || new Date().toISOString().split('T')[0];
        const resolvedAccessScope = doc.accessScope || resolvedRequest?.accessScope || 'General';
        const resolvedAccessDepts = doc.accessDepartments || resolvedRequest?.accessDepartments || [];
        const resolvedAccessUsers = doc.accessUsers || resolvedRequest?.accessUsers || [];
        const resolvedReviewCycle = Number(doc.reviewCycleMonths || resolvedRequest?.reviewCycleMonths || 12);
        const resolvedDept = doc.department || resolvedRequest?.department || 'QA';
        const effDateForReview = new Date(resolvedEffectiveDate);
        if (!isNaN(effDateForReview.getTime())) {
          effDateForReview.setMonth(effDateForReview.getMonth() + resolvedReviewCycle);
        }
        const computedNextReviewDate = !isNaN(effDateForReview.getTime()) ? effDateForReview.toISOString().split('T')[0] : '';
        const resolvedNextReviewDate = resolvedRequest?.nextReviewDate || doc.nextReviewDate || computedNextReviewDate;

        if (isRevision) {
          // REVISION: create or update the distinct new ACTIVE record
          const targetDocNo = String(doc.edCode || doc.doc_code || doc.docNo || resolvedRequest?.edCode || task.docCode || '').trim();
          const newEdition = String(resolvedRequest?.sourceVersion || resolvedRequest?.edition || doc.sourceVersion || doc.edition || 'ฉบับใหม่').trim();
          const priorDocId = String(resolvedRequest?.previousDocId || doc.previousDocId || doc.previousRevDocId || '');
          // Exclude the pending draft itself: it shares edCode and sits first in the list,
          // otherwise it is mistaken for the prior edition and left behind as an orphan record.
          const priorDoc = (state.externalDocuments || []).find(d => priorDocId && String(d.id) === priorDocId) ||
            (state.externalDocuments || []).find(d =>
              String(d.id) !== String(doc.id) &&
              targetDocNo && (String(d.edCode || d.doc_code || d.docNo || '').trim() === targetDocNo)
            );
          const finalPrevDocId = priorDoc ? String(priorDoc.id) : priorDocId;
          const supersededSnapshotInUpdated = updatedDocs.find(d => 
            (targetDocNo && String(d.edCode || d.doc_code || d.docNo || '').trim() === targetDocNo) &&
            (d.status === 'SUPERSEDED' || d.is_superseded) &&
            String(d.id).includes('SUPERSEDED')
          );
          const snapshotId = supersededSnapshotInUpdated ? String(supersededSnapshotInUpdated.id) : finalPrevDocId;

          // ISO 9001 Immutability Guard: Distinct unique ID for the new active edition (never reusing superseded ID)
          let candidateId = (doc.id && String(doc.id) !== snapshotId && (!priorDoc || String(doc.id) !== String(priorDoc.id)))
            ? String(doc.id)
            : (resolvedRequest?.docId && String(resolvedRequest.docId) !== snapshotId && (!priorDoc || String(resolvedRequest.docId) !== String(priorDoc.id))
              ? String(resolvedRequest.docId)
              : `EXT-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`);

          const newDocRecordId = candidateId;

          const reqId = resolvedRequest?.id || resolvedRequest?.requestId || task.referenceId;
          const edrNumber = resolvedRequest?.requestNo || resolvedRequest?.edrNumber || reqNo;
          const reqChangeReason = resolvedRequest?.changeReason || resolvedRequest?.reason || resolvedRequest?.remarks || doc.changeReason || '-';
          const reqRequester = resolvedRequest?.requesterName || resolvedRequest?.requester?.name || doc.requesterName || doc.ownerName || 'User';
          const reqReviewer = resolvedRequest?.reviewerName || resolvedRequest?.reviewer?.name || doc.reviewerName || '-';
          const reqApprover = state.currentUser?.fullName || state.currentUser?.name || doc.approverName || 'Approver';

          const hasReqOrDocFile = Boolean(resolvedRequest?.attachedFile || resolvedRequest?.fileId || doc.attachedFile || doc.fileId);
          const activeAttachedFile = resolvedRequest?.attachedFile || doc.attachedFile || priorDoc?.attachedFile || null;
          const activeFileId = resolvedRequest?.fileId || activeAttachedFile?.fileId || doc.fileId || priorDoc?.fileId || null;
          const activeRawFileId = hasReqOrDocFile
            ? (resolvedRequest?.rawFileId || resolvedRequest?.attachedFile?.rawFileId || resolvedRequest?.fileId || resolvedRequest?.attachedFile?.fileId || doc.rawFileId || doc.attachedFile?.rawFileId || doc.fileId || activeFileId)
            : (priorDoc?.rawFileId || activeFileId);
          const activeStorageKey = targetDocNo && newEdition ? `FILE_${targetDocNo}_ED_${newEdition}` : (resolvedRequest?.fileStorageKey || doc.fileStorageKey || activeFileId || newDocRecordId);
          const activeFileName = resolvedRequest?.fileName || activeAttachedFile?.name || doc.fileName || priorDoc?.fileName || '';
          const filePayload = activeAttachedFile ? {
            attachedFile: { ...activeAttachedFile, rawFileId: activeRawFileId, fileStorageKey: activeStorageKey },
            fileId: activeFileId,
            rawFileId: activeRawFileId,
            fileStorageKey: activeStorageKey,
            fileName: activeFileName,
            file: activeAttachedFile,
            attachment: activeAttachedFile
          } : (activeFileId ? { fileId: activeFileId, rawFileId: activeRawFileId, fileStorageKey: activeStorageKey, fileName: activeFileName } : { fileStorageKey: activeStorageKey });

          if (activeFileId) {
            getFile(activeFileId).then(blob => {
              if (blob) {
                saveFile(newDocRecordId, blob).catch(() => {});
                if (targetDocNo) {
                  saveFile(targetDocNo, blob).catch(() => {});
                  if (newEdition) {
                    saveFile(`FILE_${targetDocNo}_ED_${newEdition}`, blob).catch(() => {});
                    saveFile(`DOC_${targetDocNo}_ED_${newEdition}`, blob).catch(() => {});
                    saveFile(`FILE_${targetDocNo}_${newEdition}`, blob).catch(() => {});
                  }
                }
              }
            }).catch(() => {});
          }

          const newActiveDoc = {
            ...(priorDoc || {}),
            ...doc,
            id: newDocRecordId,
            code: targetDocNo,
            edCode: targetDocNo,
            doc_code: targetDocNo,
            docNo: targetDocNo,
            title: resolvedRequest?.title || doc.title || priorDoc?.title || docTitle,
            status: 'ACTIVE',
            is_superseded: false,
            is_obsolete: false,
            is_external: true,
            doc_type: 'EXTERNAL',
            edition: newEdition,
            sourceVersion: newEdition,
            previousDocId: snapshotId || finalPrevDocId,
            effectiveDate: resolvedEffectiveDate,
            issuer: resolvedIssuer,
            officialIssuer: resolvedIssuer,
            source: resolvedIssuer,
            accessScope: resolvedAccessScope,
            accessDepartments: resolvedAccessDepts,
            accessUsers: resolvedAccessUsers,
            reviewCycleMonths: resolvedReviewCycle,
            nextReviewDate: resolvedNextReviewDate,
            next_review_date: resolvedNextReviewDate,
            review_status: 'UP_TO_DATE',
            is_reviewed_this_cycle: false,
            pending_periodic_review: false,
            last_reviewed_at: null,
            lastReviewedDate: null,
            last_verified_at: null,
            periodic_reviews: [],
            review_history: [],
            department: resolvedDept,
            ...(newCreatedCopies.length > 0 ? {
              distributionList: newCreatedCopies,
              controlledCopies: newCreatedCopies
            } : {}),
            // ผูกความสัมพันธ์กับคำร้องใบนี้โดยตรง
            requestId: reqId,
            edrNumber: edrNumber,
            changeReason: reqChangeReason,
            // บันทึกรายชื่อผู้ดำเนินการของ Revision นี้
            requesterName: reqRequester,
            reviewerName: reqReviewer,
            approverName: reqApprover,
            approvedAt: new Date().toISOString(),
            approverId: state.currentUser?.id || doc.approverId,
            createdAt: doc.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...filePayload
          };

          if (supersededSnapshotInUpdated) {
            supersededSnapshotInUpdated.supersededByDocId = newDocRecordId;
            supersededSnapshotInUpdated.supersededByEdition = newEdition;
          }

          const existingIdx = updatedDocs.findIndex(d => 
            String(d.id) === String(newDocRecordId) &&
            !d.is_superseded &&
            !d.is_obsolete &&
            d.status !== 'SUPERSEDED' &&
            d.status !== 'OBSOLETE'
          );
          if (existingIdx >= 0) {
            updatedDocs[existingIdx] = newActiveDoc;
          } else {
            updatedDocs = [newActiveDoc, ...updatedDocs];
          }
        } else {
          // NEW registration: update or insert
          const reqId = resolvedRequest?.id || resolvedRequest?.requestId || doc.requestId || task.referenceId;
          const edrNumber = resolvedRequest?.requestNo || resolvedRequest?.edrNumber || doc.edrNumber || reqNo;
          const reqChangeReason = resolvedRequest?.changeReason || resolvedRequest?.reason || doc.changeReason || 'ขึ้นทะเบียนเอกสารภายนอกใหม่ (Initial Registration)';
          const reqRequester = resolvedRequest?.requesterName || resolvedRequest?.requester?.name || doc.requesterName || doc.ownerName || 'User';
          const reqReviewer = resolvedRequest?.reviewerName || resolvedRequest?.reviewer?.name || doc.reviewerName || '-';
          const reqApprover = state.currentUser?.fullName || state.currentUser?.name || doc.approverName || 'Approver';
          const initCode = doc.edCode || doc.doc_code || doc.docNo || '';
          const initEd = String(resolvedRequest?.sourceVersion || resolvedRequest?.edition || doc.sourceVersion || doc.edition || '1.0').trim();

          const activeAttachedFile = resolvedRequest?.attachedFile || doc.attachedFile || null;
          const activeFileId = resolvedRequest?.fileId || activeAttachedFile?.fileId || doc.fileId || null;
          const activeRawFileId = resolvedRequest?.rawFileId || activeAttachedFile?.rawFileId || doc.rawFileId || activeFileId;
          const activeStorageKey = initCode && initEd ? `FILE_${initCode}_ED_${initEd}` : (resolvedRequest?.fileStorageKey || doc.fileStorageKey || activeFileId || doc.id);
          const activeFileName = resolvedRequest?.fileName || activeAttachedFile?.name || doc.fileName || '';
          const filePayload = activeAttachedFile ? {
            attachedFile: { ...activeAttachedFile, rawFileId: activeRawFileId, fileStorageKey: activeStorageKey },
            fileId: activeFileId,
            rawFileId: activeRawFileId,
            fileStorageKey: activeStorageKey,
            fileName: activeFileName,
            file: activeAttachedFile,
            attachment: activeAttachedFile
          } : (activeFileId ? { fileId: activeFileId, rawFileId: activeRawFileId, fileStorageKey: activeStorageKey, fileName: activeFileName } : { fileStorageKey: activeStorageKey });

          if (activeFileId) {
            getFile(activeFileId).then(blob => {
              if (blob) {
                saveFile(doc.id, blob).catch(() => {});
                if (initCode) {
                  saveFile(initCode, blob).catch(() => {});
                  if (initEd) {
                    saveFile(`FILE_${initCode}_ED_${initEd}`, blob).catch(() => {});
                    saveFile(`DOC_${initCode}_ED_${initEd}`, blob).catch(() => {});
                    saveFile(`FILE_${initCode}_${initEd}`, blob).catch(() => {});
                  }
                }
              }
            }).catch(() => {});
          }

          const approvedDoc = {
            ...doc,
            code: initCode || doc.code,
            status: 'ACTIVE',
            is_superseded: false,
            is_obsolete: false,
            is_external: true,
            doc_type: 'EXTERNAL',
            approvedAt: new Date().toISOString(),
            approverId: state.currentUser?.id || doc.approverId,
            effectiveDate: resolvedEffectiveDate,
            source: resolvedIssuer,
            issuer: resolvedIssuer,
            officialIssuer: resolvedIssuer,
            accessScope: resolvedAccessScope,
            accessDepartments: resolvedAccessDepts,
            accessUsers: resolvedAccessUsers,
            reviewCycleMonths: resolvedReviewCycle,
            nextReviewDate: resolvedNextReviewDate,
            next_review_date: resolvedNextReviewDate,
            review_status: 'UP_TO_DATE',
            is_reviewed_this_cycle: false,
            pending_periodic_review: false,
            department: resolvedDept,
            ...(newCreatedCopies.length > 0 ? {
              distributionList: newCreatedCopies,
              controlledCopies: newCreatedCopies
            } : {}),
            requestId: reqId,
            edrNumber: edrNumber,
            changeReason: reqChangeReason,
            requesterName: reqRequester,
            reviewerName: reqReviewer,
            approverName: reqApprover,
            updatedAt: new Date().toISOString(),
            ...filePayload
          };
          const existingIdx = updatedDocs.findIndex(d => String(d.id) === String(doc.id));
          if (existingIdx >= 0) {
            updatedDocs[existingIdx] = { ...updatedDocs[existingIdx], ...approvedDoc };
          } else {
            updatedDocs = [approvedDoc, ...updatedDocs];
          }
        }
      } else if (newDocStatus === 'OBSOLETE_ARCHIVED' || newDocStatus === 'OBSOLETE') {
        const obsEffDate = matchingReq?.effectiveDate || matchingReq?.obsoleteEffectiveDate || doc.obsoleteEffectiveDate || doc.effectiveDate || new Date().toISOString().split('T')[0];
        const canonicalTargetCode = String(doc.edCode || doc.doc_code || doc.docNo || matchingReq?.edCode || task.docCode || '').trim();
        const baseTargetId = String(doc.id).split('-SUPERSEDED')[0].split('_SUPERSEDED')[0].trim();

        // 1. Cascade Obsolete: Mark EVERY revision/edition sharing this document code as OBSOLETE
        updatedDocs = updatedDocs.map(d => {
          const dCode = String(d.edCode || d.doc_code || d.docNo || '').trim();
          const dId = String(d.id || '').trim();
          const isMatch = (canonicalTargetCode && dCode === canonicalTargetCode) ||
                          (baseTargetId && dId.startsWith(baseTargetId)) ||
                          d.id === doc.id;

          if (isMatch) {
            return {
              ...d,
              status: 'OBSOLETE_ARCHIVED',
              is_obsolete: true,
              is_superseded: false,
              obsoletedAt: new Date().toISOString(),
              obsoleteDate: obsEffDate,
              effectiveDate: obsEffDate,
              obsoleteEffectiveDate: obsEffDate,
              obsoleteApproverId: state.currentUser?.id || doc.approverId,
              archivedReason: matchingReq?.changeReason || matchingReq?.reason || doc.obsoleteReason || 'เอกสารถูกยกเลิกการใช้งาน (OBSOLETE)',
              controlledCopies: (d.controlledCopies || []).map(c => {
                if (c.status !== 'DESTROYED' && c.status !== 'RECALLED' && c.status !== 'ARCHIVED_OBSOLETE') {
                  return { ...c, status: 'PENDING_RECALL' };
                }
                return c;
              })
            };
          }
          return d;
        });

        // Notify Requester
        if (requesterId) {
          safeNotify({
            id: `notif-edr-obs-req-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            userId: requesterId,
            targetUserIds: [requesterId],
            title: 'คำร้องขอยกเลิกเอกสารภายนอกสำเร็จ',
            message: `เอกสารภายนอก "${docTitle}" (${docCode}) ได้รับการอนุมัติยกเลิกถาวรแล้ว`,
            link: '/dcc/external/my-requests',
            type: 'SUCCESS',
            category: 'EXTERNAL_DOC',
            isRead: false,
            read: false,
            readBy: [],
            timestamp: new Date().toISOString(),
            docCode: docCode,
            refId: reqId
          });
        }

        // Broadcast Obsolete to department and organization
        safeNotify({
          id: `notif-edr-obs-broad-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          isGlobal: true,
          targetDepartment: doc.department,
          title: `ประกาศยกเลิกเอกสารภายนอก: ${docCode}`,
          message: `เอกสารภายนอก "${docTitle}" (${docCode}) ถูกยกเลิกถาวร (Obsolete) แล้ว ห้ามนำไปใช้งาน`,
          link: '/dcc/external-docs',
          type: 'OBSOLETE',
          category: 'EXTERNAL_DOC',
          isRead: false,
          read: false,
          readBy: [],
          timestamp: new Date().toISOString(),
          docCode: docCode,
          refId: reqId
        });
      }
    } else if (action === 'REJECT' || action === 'REVISE' || action === 'RETURN') {
      // Golden Rule: Approver/Reviewer rejects or returns request -> update externalRequests ONLY.
      // Strictly purge from externalDocuments if it was created or pending.
      if (!isObsolete) {
        if (isRevision) {
          // Only purge the draft/pending revision doc, preserve the prior document!
          updatedDocs = updatedDocs.filter(d => String(d.id) !== String(doc.id) && String(d.id) !== String(task.referenceId));
        } else {
          updatedDocs = updatedDocs.filter(d => d.id !== doc.id && d.id !== task.referenceId && (!doc.edCode || (d.edCode !== doc.edCode && d.doc_code !== doc.edCode)));
        }
      } else {
        // If an obsolete request is rejected, the document remains ACTIVE
        updatedDocs = updatedDocs.map(d => (d.id === doc.id || d.id === task.referenceId) ? {
          ...d,
          pendingObsolete: false,
          status: 'ACTIVE'
        } : d);
      }
    }
    const finalCopiesState = (action === 'APPROVE') ? [...currentCopies, ...newCreatedCopies] : (state.documentControlledCopies || state.controlledCopyInstances || []);

    const targetReqId = matchingReq?.id || matchingReq?.requestId;
    const targetDocId = matchingReq?.docId || matchingReq?.externalDocId || doc?.id || task.referenceId;

    const updatedRequests = (state.externalRequests || []).map(r => {
      // ISO 9001 Immutability: Strictly match ONLY the specific request for this workflow step
      const isMatch = (targetReqId && (r.id === targetReqId || r.requestId === targetReqId)) ||
                      (targetDocId && (r.docId === targetDocId || r.externalDocId === targetDocId)) ||
                      (task.referenceId && (r.id === task.referenceId || r.requestId === task.referenceId || r.docId === task.referenceId));
      if (!isMatch) return r;

      const isReviewStep = task.type === 'EXT_REVIEW' || task.type === 'EXTERNAL_REVIEW';
      const isApproveStep = task.type === 'EXT_APPROVAL' || task.type === 'EXTERNAL_APPROVAL';
      const nowIso = new Date().toISOString();

      let nextSignoffs = (r.signoffs || []).map(s => {
        if (isReviewStep && s.step === 'REVIEW') {
          return {
            ...s,
            status: action === 'APPROVE' ? 'COMPLETED' : 'RETURNED',
            date: nowIso,
            comment: comment || (action === 'APPROVE' ? 'ผ่านการทบทวน (Reviewed & Verified)' : 'ส่งกลับแก้ไข (Return for Revision)')
          };
        }
        if (isApproveStep && s.step === 'APPROVE') {
          return {
            ...s,
            status: action === 'APPROVE' ? 'COMPLETED' : (isObsolete ? 'REJECTED' : 'RETURNED'),
            date: nowIso,
            comment: comment || (action === 'APPROVE' ? 'อนุมัติเรียบร้อย (Approved)' : (isObsolete ? 'ไม่อนุมัติ (Rejected)' : 'ส่งกลับแก้ไข (Return for Revision)'))
          };
        }
        return s;
      });

      if (action === 'APPROVE' && isReviewStep) {
        nextSignoffs = nextSignoffs.map(s => s.step === 'APPROVE' && (s.status === 'WAITING' || s.status === 'PENDING') ? { ...s, status: 'PENDING' } : s);
      }

      let reqFinalStatus = r.status;
      if (action === 'APPROVE') {
        if (newDocStatus === 'ACTIVE' || newDocStatus === 'OBSOLETE_ARCHIVED') {
          reqFinalStatus = 'APPROVED';
        } else if (newDocStatus === 'PENDING_EXT_APPROVAL') {
          reqFinalStatus = 'PENDING_EXT_APPROVAL';
        }
      } else if (action === 'REJECT' || action === 'REVISE' || action === 'RETURN') {
        const isReturnForRevision = action === 'REVISE' || action === 'RETURN' || (action === 'REJECT' && isReviewStep);
        if (isReturnForRevision) {
          reqFinalStatus = 'REVISE_REQUESTED';
        } else {
          reqFinalStatus = 'REJECTED';
        }
      }

      // Phase 2: build activityLog audit entry for REVIEW → APPROVE / RETURN
      const baseLog = Array.isArray(r.activityLog) ? [...r.activityLog] : [];
      if (action === 'APPROVE' && isReviewStep) {
        baseLog.push({
          action: 'REVIEWED',
          actor: state.currentUser?.name || state.currentUser?.fullName || 'Reviewer',
          role: state.currentUser?.role || 'Reviewer',
          department: state.currentUser?.department || doc.department,
          timestamp: nowIso,
          comment: comment || '-'
        });
      } else if (action === 'REJECT' || action === 'REVISE' || action === 'RETURN') {
        const isReturnForRevision = action === 'REVISE' || action === 'RETURN' || (action === 'REJECT' && isReviewStep);
        baseLog.push({
          action: isReturnForRevision ? 'RETURNED_FOR_REVISION' : 'REJECTED',
          actor: state.currentUser?.name || state.currentUser?.fullName || (isReviewStep ? 'Reviewer' : 'Approver'),
          role: state.currentUser?.role || (isReviewStep ? 'Reviewer' : 'Approver'),
          department: state.currentUser?.department || doc.department,
          timestamp: nowIso,
          comment: comment || '-'
        });
      }

      return {
        ...r,
        status: reqFinalStatus,
        returnReason: (action === 'REJECT' || action === 'RETURN' || action === 'REVISE') ? comment : r.returnReason,
        revisionComment: (action === 'REJECT' || action === 'RETURN' || action === 'REVISE') ? comment : r.revisionComment,
        signoffs: nextSignoffs,
        activityLog: baseLog,
        ...(action === 'APPROVE' && isReviewStep ? { reviewedAt: nowIso } : {}),
        updatedAt: nowIso
      };
    });

    let updatedSchedules = state.periodicReviewSchedules;
    if (newDocStatus === 'ACTIVE' && action === 'APPROVE') {
      const activeDoc = updatedDocs.find(d => 
        (d.edCode === doc.edCode || d.doc_code === doc.doc_code || d.docNo === doc.docNo || d.id === doc.id) && d.status === 'ACTIVE'
      );
      if (activeDoc) {
        if (state.periodicReviewSchedules && state.periodicReviewSchedules.length > 0) {
          const docNum = activeDoc.edCode || activeDoc.doc_code || activeDoc.docNo || activeDoc.id;
          updatedSchedules = state.periodicReviewSchedules.map(s => {
            if (s.externalDocumentId === activeDoc.id || s.documentId === activeDoc.id || s.documentNumber === docNum || s.id === `PRS-AUTO-${activeDoc.id}` || s.id === `PRS-AUTO-${docNum}`) {
              return {
                ...s,
                documentId: activeDoc.id,
                externalDocumentId: activeDoc.id,
                documentNumber: docNum,
                edition: activeDoc.sourceVersion || activeDoc.edition || '',
                sourceVersion: activeDoc.sourceVersion || activeDoc.edition || '',
                rev: String(activeDoc.sourceVersion || activeDoc.edition || '1.0').replace(/^(Rev\.?\s*)+/i, '').trim(),
                nextReviewDate: activeDoc.nextReviewDate || activeDoc.next_review_date,
                currentScheduledReviewDate: activeDoc.nextReviewDate || activeDoc.next_review_date,
                lastReviewedDate: null,
                last_reviewed_at: null,
                is_reviewed_this_cycle: false,
                status: 'UPCOMING',
                dueState: 'NOT_YET_DUE',
                updatedAt: new Date().toISOString()
              };
            }
            return s;
          });
        }
        setTimeout(() => {
          if (get().stampFinalExternalApprovalPdf) {
            get().stampFinalExternalApprovalPdf(activeDoc.id);
          }
        }, 500);
      }
    } else if (newDocStatus === 'OBSOLETE_ARCHIVED' && state.periodicReviewSchedules && state.periodicReviewSchedules.length > 0) {
      const canonicalTargetCode = String(doc.edCode || doc.doc_code || doc.docNo || matchingReq?.edCode || task.docCode || '').trim();
      updatedSchedules = state.periodicReviewSchedules.map(s => {
        if (s.externalDocumentId === doc.id || s.documentId === doc.id || (canonicalTargetCode && s.documentNumber === canonicalTargetCode)) {
          return {
            ...s,
            status: 'OBSOLETE',
            dueState: 'NOT_YET_DUE',
            updatedAt: new Date().toISOString()
          };
        }
        return s;
      });
    } else if (action === 'REJECT') {
      const targetReqId = matchingReq?.id || matchingReq?.requestId;
      const targetDocId = matchingReq?.docId || matchingReq?.externalDocId || doc?.id || task.referenceId;
      const sched = (state.periodicReviewSchedules || []).find(s =>
        (targetReqId && (s.linkedRequestId === targetReqId || s.linkedActionId === targetReqId)) ||
        (targetDocId && (s.documentId === targetDocId || s.externalDocumentId === targetDocId))
      );
      if (sched?.linkedRequestId || sched?.linkedActionId || sched?.status === 'AWAITING_ACTION') {
        setTimeout(() => {
          get().resetPendingReviewIntent?.(sched.id || targetDocId);
        }, 0);
      }
    }

    return {
      tasks: newTasks,
      notifications: newNotifications,
      externalDocuments: updatedDocs,
      externalRequests: updatedRequests,
      documentControlledCopies: finalCopiesState,
      controlledCopyInstances: finalCopiesState,
      periodicReviewSchedules: updatedSchedules,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: `EXT_WORKFLOW_${action}`,
        details: `Processed task ${taskId} (${action}) for external document "${doc.title}"`,
        actor: state.currentUser.name,
        actorId: state.currentUser.id,
        actorRole: state.currentUser.role || state.currentUser.position,
        date: new Date().toISOString()
      }, ...(state.actionLog || [])],
      externalAuditTrail: [{
        id: `EXTA-${Date.now()}`,
        docId: doc.id,
        action: `TASK_${action}_${task.type.toUpperCase()}`,
        actor: state.currentUser.name,
        actorId: state.currentUser.id,
        date: new Date().toISOString(),
        details: comment || `Processed external task (${task.type})`
      }, ...state.externalAuditTrail]
    };
  }),

  // Closed-Loop Resubmit External Document after Revision
  resubmitExternalDoc: (id, updates, taskId) => set((state) => {
    const oldDoc = (state.externalDocuments || []).find(d => d.id === id || d.edCode === id || d.doc_code === id) ||
                   (state.externalRequests || []).find(r => r.id === id || r.requestId === id || r.docId === id || r.externalDocId === id || r.edCode === id);
    if (!oldDoc) return state;

    const reviewerId = updates.reviewerId || oldDoc.reviewerId;
    const approverId = updates.approverId || oldDoc.approverId;
    const newStatus = reviewerId ? 'PENDING_EXT_REVIEW' : 'PENDING_EXT_APPROVAL';
    const edCode = oldDoc.edCode || oldDoc.doc_code || oldDoc.docNo || id;

    const activeAttachedFile = updates.attachedFile || oldDoc.attachedFile || null;
    const activeFileId = updates.fileId || activeAttachedFile?.fileId || oldDoc.fileId || null;
    const activeFileName = updates.fileName || activeAttachedFile?.name || oldDoc.fileName || '';
    const filePayload = activeAttachedFile ? {
      attachedFile: activeAttachedFile,
      fileId: activeFileId,
      fileName: activeFileName,
      file: activeAttachedFile,
      attachment: activeAttachedFile
    } : (activeFileId ? { fileId: activeFileId, fileName: activeFileName } : {});

    if (activeFileId) {
      getFile(activeFileId).then(blob => {
        if (blob) {
          saveFile(oldDoc.id, blob).catch(() => {});
          saveFile(edCode, blob).catch(() => {});
        }
      }).catch(() => {});
    }

    const updatedDoc = {
      ...oldDoc,
      ...updates,
      id: oldDoc.id,
      status: newStatus,
      reviewerId,
      approverId,
      returnReason: null,
      revisionComment: null,
      updatedAt: new Date().toISOString(),
      ...filePayload
    };

    // Close/remove the revise task
    let newTasks = state.tasks.filter(t => t.id !== taskId && !(t.referenceId === oldDoc.id && (t.type === 'EXTERNAL_REVISE' || t.type === 'REVISE')));
    let newNotifications = [...state.notifications];

    if (reviewerId) {
      const newTaskId = `extt-${Date.now()}-rev`;
      newTasks.push({
        id: newTaskId,
        referenceType: 'EXTERNAL_DOC',
        referenceId: oldDoc.id,
        docId: oldDoc.id,
        docCode: edCode,
        doc_code: edCode,
        docTitle: updatedDoc.title,
        docName: updatedDoc.title,
        title: `${edCode}: ${updatedDoc.title}`,
        type: 'EXTERNAL_REVIEW',
        taskType: 'EXTERNAL_REVIEW',
        assigneeId: reviewerId,
        requesterId: updatedDoc.ownerId || state.currentUser?.id || '',
        requesterName: state.currentUser?.fullName || state.currentUser?.name,
        requesterDepartment: updatedDoc.department,
        department: updatedDoc.department,
        origin: 'EXTERNAL',
        status: 'PENDING',
        extAction: oldDoc.extAction || 'REGISTER',
        ...filePayload
      });
      newNotifications.push({
        id: Date.now() + Math.random(),
        userId: reviewerId,
        title: 'งานใหม่รอการตรวจสอบ (ส่งกลับแก้ไขแล้ว)',
        message: `คำขอสำหรับเอกสารภายนอก "${edCode} - ${updatedDoc.title}" ได้รับการแก้ไขและส่งกลับมาให้ตรวจสอบอีกครั้ง`,
        isRead: false,
        link: '/tasks',
        timestamp: new Date().toISOString()
      });
    } else if (approverId) {
      const newTaskId = `extt-${Date.now()}-app`;
      newTasks.push({
        id: newTaskId,
        referenceType: 'EXTERNAL_DOC',
        referenceId: oldDoc.id,
        docId: oldDoc.id,
        docCode: edCode,
        doc_code: edCode,
        docTitle: updatedDoc.title,
        docName: updatedDoc.title,
        title: `${edCode}: ${updatedDoc.title}`,
        type: 'EXTERNAL_APPROVAL',
        taskType: 'EXTERNAL_APPROVAL',
        assigneeId: approverId,
        requesterId: updatedDoc.ownerId || state.currentUser?.id || '',
        requesterName: state.currentUser?.fullName || state.currentUser?.name,
        requesterDepartment: updatedDoc.department,
        department: updatedDoc.department,
        origin: 'EXTERNAL',
        status: 'PENDING',
        extAction: oldDoc.extAction || 'REGISTER',
        ...filePayload
      });
      newNotifications.push({
        id: Date.now() + Math.random(),
        userId: approverId,
        title: 'งานใหม่รอการอนุมัติ (ส่งกลับแก้ไขแล้ว)',
        message: `คำขอสำหรับเอกสารภายนอก "${edCode} - ${updatedDoc.title}" ได้รับการแก้ไขและส่งกลับมาให้อนุมัติอีกครั้ง`,
        isRead: false,
        link: '/tasks',
        timestamp: new Date().toISOString()
      });
    }

    let matchedAnyRequest = false;
    const updatedRequests = (state.externalRequests || []).map(r => {
      const isMatch = r.id === oldDoc.id || r.requestId === oldDoc.id || r.requestNo === oldDoc.id ||
                      r.docId === oldDoc.id || r.documentId === oldDoc.id || r.externalDocId === oldDoc.id ||
                      (oldDoc.requestId && (r.id === oldDoc.requestId || r.requestId === oldDoc.requestId));
      if (!isMatch) return r;
      matchedAnyRequest = true;

      const nowIso = new Date().toISOString();
      const nextSignoffs = (r.signoffs || []).map(s => {
        if (s.step === 'REVIEW') {
          return { ...s, status: reviewerId ? 'PENDING' : 'SKIPPED', date: null, comment: null };
        }
        if (s.step === 'APPROVE') {
          return { ...s, status: approverId ? (reviewerId ? 'WAITING' : 'PENDING') : 'SKIPPED', date: null, comment: null };
        }
        return s;
      });

      nextSignoffs.push({
        step: 'RESUBMIT',
        stepName: 'แก้ไขและส่งตรวจใหม่',
        role: 'ผู้ยื่นคำร้อง',
        userId: state.currentUser?.id || oldDoc.ownerId,
        userName: state.currentUser?.fullName || state.currentUser?.name,
        userRole: state.currentUser?.position || 'Requester',
        status: 'COMPLETED',
        date: nowIso,
        comment: updates.reason || 'แก้ไขรายละเอียดและส่งคำร้องตรวจใหม่อีกครั้ง'
      });

      return {
        ...r,
        requestNo: r.requestNo || r.requestId || r.id,
        requestId: r.requestId || r.requestNo || r.id,
        docCode: r.docCode || edCode,
        documentCode: r.documentCode || edCode,
        edCode: r.edCode || edCode,
        docId: r.docId || oldDoc.id,
        documentId: r.documentId || oldDoc.id,
        title: updatedDoc.title,
        status: newStatus,
        returnReason: null,
        revisionComment: null,
        signoffs: nextSignoffs,
        updatedAt: nowIso,
        ...filePayload
      };
    });

    // Auto-Heal: If no existing request in externalRequests matched, construct and prepend one
    if (!matchedAnyRequest) {
      const newReqId = generateNextEdrNumber(state.externalRequests || []);
      const nowIso = new Date().toISOString();
      const reviewerUser = (state.masterUsers || []).find(u => u.id === reviewerId);
      const approverUser = (state.masterUsers || []).find(u => u.id === approverId);

      const newResubmitReq = {
        id: newReqId,
        requestId: newReqId,
        requestNo: newReqId,
        edrNumber: newReqId,
        docId: oldDoc.id,
        documentId: oldDoc.id,
        externalDocId: oldDoc.id,
        edCode,
        doc_code: edCode,
        docCode: edCode,
        documentCode: edCode,
        title: updatedDoc.title,
        requestType: 'NEW',
        department: updatedDoc.department || 'QA',
        requesterId: updatedDoc.ownerId || state.currentUser?.id || '',
        requesterName: state.currentUser?.fullName || state.currentUser?.name || updatedDoc.ownerName || 'User',
        requesterDepartment: updatedDoc.department || 'QA',
        requesterRole: state.currentUser?.position || 'Requester',
        reviewerId: reviewerId || null,
        reviewerName: reviewerUser ? (reviewerUser.fullName || reviewerUser.name) : '-',
        reviewerRole: 'Reviewer',
        approverId: approverId || null,
        approverName: approverUser ? (approverUser.fullName || approverUser.name) : '-',
        approverRole: 'Approver',
        status: newStatus,
        returnReason: null,
        revisionComment: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        ...filePayload,
        signoffs: [
          {
            step: 'REQUEST',
            stepName: 'ยื่นคำร้อง',
            role: 'ผู้ยื่นคำร้อง',
            userId: state.currentUser?.id || oldDoc.ownerId,
            userName: state.currentUser?.fullName || state.currentUser?.name,
            userRole: state.currentUser?.position || 'Requester',
            status: 'COMPLETED',
            date: nowIso,
            comment: updates.reason || 'ยื่นคำร้องขึ้นทะเบียนเอกสารภายนอก'
          },
          {
            step: 'REVIEW',
            stepName: 'ทบทวนเอกสาร',
            role: 'ผู้ทบทวน',
            userId: reviewerId || null,
            userName: reviewerUser ? (reviewerUser.fullName || reviewerUser.name) : '-',
            userRole: 'Reviewer',
            status: reviewerId ? 'PENDING' : 'SKIPPED',
            date: null,
            comment: null
          },
          {
            step: 'APPROVE',
            stepName: 'อนุมัติเอกสาร',
            role: 'ผู้อนุมัติ',
            userId: approverId || null,
            userName: approverUser ? (approverUser.fullName || approverUser.name) : '-',
            userRole: 'Approver',
            status: approverId ? (reviewerId ? 'WAITING' : 'PENDING') : 'SKIPPED',
            date: null,
            comment: null
          }
        ]
      };
      updatedRequests.unshift(newResubmitReq);
    }

    return {
      externalDocuments: [updatedDoc, ...state.externalDocuments.filter(d => String(d.id) !== String(oldDoc.id) && String(d.id) !== String(id))],
      externalRequests: updatedRequests,
      tasks: newTasks,
      notifications: newNotifications,
      actionLog: [{
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        actionType: 'EXT_DOC_RESUBMIT',
        details: `Resubmitted external document: ${edCode} - ${updatedDoc.title} after revision`,
        actor: state.currentUser?.name || 'User',
        actorId: state.currentUser?.id || '',
        actorRole: state.currentUser?.role || state.currentUser?.position,
        date: new Date().toISOString()
      }, ...(state.actionLog || [])],
      externalAuditTrail: [{
        id: `EXTA-${Date.now()}`,
        docId: oldDoc.id,
        action: 'RESUBMIT',
        actor: state.currentUser?.name || 'User',
        actorId: state.currentUser?.id || '',
        date: new Date().toISOString(),
        details: `Resubmitted external document after revision`
      }, ...state.externalAuditTrail]
    };
  }),

  stampFinalExternalApprovalPdf: async (docId) => {
    const state = get();
    const extDocs = state.externalDocuments || [];
    const doc = extDocs.find(d => String(d.id) === String(docId)) ||
      extDocs.find(d =>
        (String(d.edCode) === String(docId) || String(d.doc_code) === String(docId)) &&
        !d.is_superseded &&
        d.status !== 'SUPERSEDED' &&
        !d.is_obsolete &&
        d.status !== 'OBSOLETE'
      ) ||
      extDocs.find(d =>
        String(d.edCode) === String(docId) ||
        String(d.doc_code) === String(docId)
      ) ||
      (state.externalRequests || []).find(r =>
        String(r.id) === String(docId) ||
        String(r.requestId) === String(docId) ||
        String(r.docId) === String(docId)
      );
    if (!doc) return;

    try {
      const rawFileId = doc.rawFileId || doc.attachedFile?.rawFileId || doc.attachedFile?.fileId || doc.fileId;
      const sourceDoc = rawFileId ? { ...doc, fileId: rawFileId, attachedFile: { ...(doc.attachedFile || {}), fileId: rawFileId } } : doc;
      const fileBlob = await resolveFileBlob(sourceDoc, rawFileId || doc.id || docId);
      if (!fileBlob) return;
      const arrayBuffer = await fileBlob.arrayBuffer();
      
      const originRev = doc.originRev || doc.sourceVersion || doc.edition || doc.rev || doc.version || '-';
      const stampData = {
        docCode: doc.edCode || doc.doc_code || doc.docNo || 'EXT-DOC',
        docRev: originRev,
        title: doc.title || doc.name || 'External Document',
        timestamp: doc.effectiveDate ? new Date(doc.effectiveDate).toLocaleDateString('th-TH') : new Date().toLocaleDateString('th-TH'),
        status: doc.status || 'ACTIVE'
      };

      const stampedBytes = await stampExternalDocumentTopRight(arrayBuffer, stampData);
      const stampedBlob = new Blob([stampedBytes], { type: 'application/pdf' });
      const rawFileName = doc.attachedFile?.name || doc.fileName || 'document.pdf';
      const newFileId = `file_${Date.now()}_stamped_ext_${rawFileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      await saveFile(newFileId, stampedBlob);
      const edCode = doc.edCode || doc.doc_code || doc.docNo || docId;
      await saveFile(`${doc.id}_stamped`, stampedBlob).catch(() => {});
      if (edCode) await saveFile(`${edCode}_stamped`, stampedBlob).catch(() => {});

      set(s => ({
        externalDocuments: (s.externalDocuments || []).map(d => {
          const isTargetActive = d.id === doc.id || (
            edCode &&
            (d.edCode === edCode || d.doc_code === edCode) &&
            !d.is_superseded &&
            d.status !== 'SUPERSEDED' &&
            !d.is_obsolete &&
            d.status !== 'OBSOLETE'
          );
          if (!isTargetActive) return d;
          const preservedRawFileId = d.rawFileId || d.attachedFile?.rawFileId || d.attachedFile?.fileId || d.fileId;
          return {
            ...d,
            rawFileId: preservedRawFileId,
            attachedFile: {
              ...(d.attachedFile || {}),
              rawFileId: preservedRawFileId,
              fileId: newFileId,
              name: rawFileName,
              size: stampedBlob.size,
              type: 'application/pdf',
              isStamped: true
            },
            fileId: newFileId,
            fileName: rawFileName
          };
        })
      }));
    } catch (err) {
      console.error('Failed to stamp external PDF:', err);
    }
  },
});
