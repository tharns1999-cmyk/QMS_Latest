import { calculateNextReviewDate } from './PeriodicReviewService';

export const validateOutcomeAndDarType = (outcome, darType) => {
  if (outcome === 'REVISION_REQUIRED' && darType !== 'REVISION') return false;
  if (outcome === 'OBSOLETE_REQUIRED' && darType !== 'OBSOLETE') return false;
  return true;
};

export const getLinkedActionStatus = (darStatus) => {
  // Map actual DAR statuses to Periodic Review Linked Action Statuses
  switch (darStatus) {
    case 'DRAFT':
    case 'RETURNED_FOR_REVISION':
      return 'DAR_DRAFT';
    case 'UNDER_REVIEW':
    case 'RETURNED_FOR_REVIEW':
      return 'UNDER_REVIEW';
    case 'PENDING_APPROVAL':
      return 'PENDING_APPROVAL';
    case 'WAITING_ACKNOWLEDGEMENT':
      return 'WAITING_ACKNOWLEDGEMENT';
    case 'WAITING_EFFECTIVE':
    case 'APPROVED_WAITING_EFFECTIVE':
      return 'WAITING_EFFECTIVE_DATE';
    case 'COMPLETED': // The generic completed state used by checkSLA
      return 'COMPLETED';
    case 'REJECTED':
      return 'REJECTED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'FAILED':
      return 'FAILED';
    default:
      return 'DAR_SUBMITTED';
  }
};

export const createOrGetLinkedDarDraft = (schedule, outcome, darPayload, storeGet) => {
  const state = storeGet();
  
  if (schedule.linkedActionId && schedule.linkageStatus === 'SUCCESS') {
    return schedule.linkedActionId;
  }

  // Validate internal document
  if (schedule.documentCategory === 'EXTERNAL' || schedule.externalDocumentId) {
    throw new Error('ไม่สามารถเชื่อมโยง DAR สำหรับเอกสารภายนอกได้');
  }

  const doc = state.documents.find(d => d.id === schedule.documentId);
  if (!doc) {
    throw new Error('ไม่สามารถยืนยันว่าเอกสารต้นทางเป็นเอกสารภายในได้');
  }

  if (!validateOutcomeAndDarType(outcome, darPayload.type)) {
    throw new Error('ประเภทการทบทวนและประเภท DAR ไม่ตรงกัน');
  }


  const idempotencyKey = outcome === 'REVISION_REQUIRED' 
    ? `PERIODIC_REVIEW:${schedule.id}:REVISION` 
    : `PERIODIC_REVIEW:${schedule.id}:OBSOLETE`;

  const newDarPayload = {
    ...darPayload,
    sourceType: 'PERIODIC_REVIEW',
    sourceId: schedule.id,
    targetDocumentId: doc.id,
    idempotencyKey,
    sourceSnapshot: {
      documentNo: doc.code || doc.documentNumber,
      documentTitle: doc.name || doc.title,
      currentRevision: doc.rev,
      documentType: doc.type,
      ownerDepartmentId: doc.department,
      documentOwnerId: doc.ownerId,
      currentEffectiveDate: doc.effectiveDate
    }
  };

  // create DAR through existing store method
  return state.addDarAndReturnId(newDarPayload);
};

export const resolveLockedSourceDocument = (draft, storeGet) => {
  if (!draft || draft.sourceType !== 'PERIODIC_REVIEW') return null;

  const state = storeGet();
  const review = state.periodicReviewSchedules?.find(s => s.id === draft.sourceId);
  if (!review) return null;

  const doc = state.documents?.find(d => d.id === draft.targetDocumentId);
  if (!doc) return null;

  return {
    documentNo: doc.code || doc.documentNumber || draft.sourceSnapshot?.documentNo,
    documentTitle: doc.name || doc.title || draft.sourceSnapshot?.documentTitle,
    currentRevision: doc.rev || draft.sourceSnapshot?.currentRevision,
    documentType: doc.type || draft.sourceSnapshot?.documentType,
    ownerDepartmentId: doc.department || draft.sourceSnapshot?.ownerDepartmentId,
    documentOwnerId: doc.ownerId || draft.sourceSnapshot?.documentOwnerId,
    currentEffectiveDate: doc.effectiveDate || draft.sourceSnapshot?.currentEffectiveDate,
    reviewReference: review.id,
    outcome: review.outcome
  };
};

export const validateLinkedDarSource = (draft, storeGet) => {
  if (draft.sourceType !== 'PERIODIC_REVIEW') return true;
  
  const state = storeGet();
  const review = state.periodicReviewSchedules?.find(s => s.id === draft.sourceId);
  const doc = state.documents?.find(d => d.id === draft.targetDocumentId);
  
  if (!review || !doc) {
    throw new Error('ไม่สามารถยืนยันข้อมูลเอกสารต้นทางได้ กรุณากลับไปยังหน้าการทบทวนเอกสารหรือติดต่อผู้ดูแลระบบ');
  }
  
  if (!validateOutcomeAndDarType(review.outcome, draft.type)) {
    throw new Error('ประเภทการทบทวนและประเภท DAR ไม่ตรงกัน');
  }
  
  if (draft.sourceSnapshot) {
    if (draft.targetDocumentId !== doc.id) {
      throw new Error('ไม่สามารถยืนยันข้อมูลเอกสารต้นทางได้ กรุณากลับไปยังหน้าการทบทวนเอกสารหรือติดต่อผู้ดูแลระบบ');
    }
  }

  return true;
};

export const syncRevisionEffective = (dar, storeGet, storeSet) => {
  if (dar.sourceType !== 'PERIODIC_REVIEW' || dar.type !== 'REVISION') return;
  if (dar.status !== 'COMPLETED') return;

  const actualDate = dar.actualEffectiveDate;

  storeSet(state => {
    let schedules = state.periodicReviewSchedules.map(s => {
      if (s.id === dar.sourceId) {
        return { ...s, linkageStatus: 'COMPLETED' };
      }
      return s;
    });

    if (!actualDate) {
      schedules = schedules.map(s => {
        if (s.id === dar.sourceId) {
          return { ...s, syncError: 'MISSING_ACTUAL_EFFECTIVE_DATE' };
        }
        return s;
      });
      return { periodicReviewSchedules: schedules };
    }

    const nextRevision = dar.rev || 'XX';
    const idempotencyKey = `PERIODIC_REVIEW_CYCLE:${dar.targetDocumentId}:${nextRevision}:${actualDate}`;
    
    const existing = schedules.find(s => s.idempotencyKey === idempotencyKey);
    
    if (!existing) {
      // Create next schedule from Actual Effective Date (Internal = +1 year/12 months)
      const newScheduleId = `PRS-INT-${dar.targetDocumentId}-${actualDate}-${nextRevision}`;
      const nextDateStr = calculateNextReviewDate(actualDate, 12, null);
      
      schedules.push({
        id: newScheduleId,
        documentId: dar.targetDocumentId,
        documentNumber: dar.sourceSnapshot?.documentNo,
        documentName: dar.sourceSnapshot?.documentTitle,
        ownerDepartmentId: dar.sourceSnapshot?.ownerDepartmentId,
        documentCategory: 'INTERNAL',
        status: 'PENDING',
        outcome: null,
        dueDate: nextDateStr,
        dueState: 'NOT_YET_DUE',
        assignedTo: null,
        isActive: true,
        idempotencyKey
      });
    }

    return { periodicReviewSchedules: schedules };
  });
};

export const syncObsoleteCompleted = (dar, storeGet, storeSet) => {
  if (dar.sourceType !== 'PERIODIC_REVIEW' || dar.type !== 'OBSOLETE') return;
  if (dar.status !== 'COMPLETED') return;

  storeSet(state => {
    const schedules = state.periodicReviewSchedules.map(s => {
      if (s.id === dar.sourceId) {
        return { ...s, linkageStatus: 'COMPLETED', status: 'COMPLETED', isActive: false };
      }
      if (s.documentId === dar.targetDocumentId &&
          ['PENDING', 'UPCOMING', 'NOT_YET_DUE', 'ACTION_REQUIRED'].includes(s.status)) {
        return { ...s, status: 'CANCELLED', isActive: false };
      }
      return s;
    });

    const documents = state.documents ? state.documents.map(d => {
      const isMatch = d.id === dar.targetDocumentId || 
        d.doc_code === dar.targetDocumentId || 
        d.document_code === dar.targetDocumentId || 
        (dar.docNo && (d.doc_code === dar.docNo || d.code === dar.docNo || d.title === dar.docNo));
      if (isMatch) {
        return {
          ...d,
          status: 'OBSOLETE',
          is_active: false,
          is_obsolete: true,
          periodic_reviews: d.periodic_reviews || []
        };
      }
      return d;
    }) : undefined;
    
    return { 
      periodicReviewSchedules: schedules,
      ...(documents ? { documents } : {})
    };
  });
};
