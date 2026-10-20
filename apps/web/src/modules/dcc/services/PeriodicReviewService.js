export const calculateNextReviewDate = (anchorDate, frequencyMonths, referenceDate = new Date()) => {
  const anchor = new Date(anchorDate);
  
  // We want to find the current cycle's review date.
  // If the document has never been reviewed, the first review is exactly anchor + frequency.
  let nextDate = new Date(anchor);
  nextDate.setMonth(nextDate.getMonth() + frequencyMonths);
  
  // Only leap forward if referenceDate is explicitly provided and we want the strictly next future date 
  // (e.g. after completing a review).
  if (referenceDate) {
    const ref = new Date(referenceDate);
    while (nextDate <= ref) {
      nextDate.setMonth(nextDate.getMonth() + frequencyMonths);
    }
  }
  
  return nextDate.toISOString().split('T')[0];
};

export const getDueState = (dueDate, referenceDate = new Date()) => {
  const due = new Date(dueDate);
  const ref = new Date(referenceDate);
  
  // Strip time for pure day comparisons
  due.setHours(0, 0, 0, 0);
  ref.setHours(0, 0, 0, 0);
  
  const diffTime = due.getTime() - ref.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    if (diffDays <= -30) return 'ESCALATED';
    return 'OVERDUE';
  } else if (diffDays === 0) {
    return 'DUE_TODAY';
  } else if (diffDays <= 7) {
    return 'DUE_SOON_7';
  } else if (diffDays <= 30) {
    return 'DUE_SOON_30';
  } else if (diffDays <= 60) {
    return 'DUE_SOON_60';
  }
  
  return 'NOT_YET_DUE';
};

import { getReviewCycleYears, getReviewStatusFlag, getPeriodicReviewStatus, evaluateDocumentReviewStatus } from '../utils/documentUtils';
import { getDocCode, getDocTitle, getCleanRev, isActiveDoc } from '../utils/domainNormalizer';
export { getPeriodicReviewStatus, evaluateDocumentReviewStatus };

export const generateSchedules = (internalDocs, externalDocs, existingSchedules = []) => {
  const newSchedules = [...existingSchedules];
  const now = new Date().toISOString();
  const todayStr = now.split('T')[0];

  // Internal Docs
  (internalDocs || []).forEach(doc => {
    // 🛡️ Criteria 1: Exclude superseded and obsolete documents strictly
    if (!isActiveDoc(doc)) return;
    const statusUpper = (doc.status || '').toUpperCase();
    if (statusUpper !== 'EFFECTIVE' && statusUpper !== 'ACTIVE') return;

    // Check if schedule already exists
    const exists = newSchedules.find(s => s.documentId === doc.id && s.documentCategory === 'INTERNAL' && s.isActive);
    if (exists) return;

    // Determine review cycle years based on document type:
    // QP, SOP = 1 yr, WI, FM = 2 yr
    const docIdentifier = doc.doc_type || doc.type || doc.doc_code || doc.document_number || doc.title || '';
    const cycleYears = getReviewCycleYears(docIdentifier);
    const frequencyMonths = cycleYears * 12;

    // The anchor is the effective date of the document
    const anchor = doc.last_reviewed_at || doc.lastReviewedDate || doc.effectiveDate || doc.effective_date || todayStr;
    const nextReviewDate = doc.next_review_date || doc.nextReviewDate || calculateNextReviewDate(anchor, frequencyMonths, null);
    const reviewStatusFlag = getReviewStatusFlag(nextReviewDate, todayStr);
    const cleanIntRev = getCleanRev(doc.revision || doc.rev || doc.revNo, '00');
    
    newSchedules.push({
      id: `PRS-INT-${doc.id}-${Date.now()}`,
      documentCategory: 'INTERNAL',
      documentId: doc.id,
      documentNumber: getDocCode(doc) || doc.title || doc.doc_number || doc.id, // e.g., WI-IT-001
      documentName: getDocTitle(doc) || doc.name || doc.doc_name || doc.title,
      rev: cleanIntRev,
      ownerUserId: doc.ownerId || doc.owner_id || 'U002', 
      ownerDepartmentId: doc.department || doc.dept || 'QA',
      responsibleUserId: doc.ownerId || doc.owner_id || 'U002',
      frequencyMonths: frequencyMonths,
      cycleYears: cycleYears,
      originalReviewAnchorDate: anchor,
      currentScheduledReviewDate: nextReviewDate,
      nextReviewDate: nextReviewDate,
      status: (doc.review_status === 'AWAITING_ACTION' || doc.review_status === 'PENDING_APPROVAL') ? doc.review_status : 'NOT_YET_DUE',
      review_status: doc.review_status || 'NOT_YET_DUE',
      periodic_review_outcome: doc.periodic_review_outcome || null,
      linkedRequestId: doc.linkedRequestId || null,
      linkedActionId: doc.linkedActionId || null,
      dueState: getDueState(nextReviewDate),
      reviewStatusFlag: reviewStatusFlag,
      statusFlag: reviewStatusFlag,
      escalationLevel: 0,
      isActive: true,
      createdAt: now,
      updatedAt: now
    });
  });

  // External Docs
  (externalDocs || []).forEach(doc => {
    // 🛡️ Criteria 1: Exclude superseded and obsolete documents strictly
    if (!isActiveDoc(doc)) return;
    const statusUpper = (doc.status || '').toUpperCase();
    if (statusUpper !== 'ACTIVE' && statusUpper !== 'EFFECTIVE') return;

    const exists = newSchedules.find(s => s.externalDocumentId === doc.id && s.documentCategory === 'EXTERNAL' && s.isActive);
    if (exists) return;

    // Verification frequency: from verification_frequency / reviewCycleMonths field or defaults to 1 year
    let extYears = 1;
    if (doc.verification_frequency !== undefined && doc.verification_frequency !== null) {
      extYears = Number(doc.verification_frequency);
    } else if (doc.verificationFrequency !== undefined && doc.verificationFrequency !== null) {
      extYears = Number(doc.verificationFrequency);
    } else if (doc.reviewCycleMonths) {
      extYears = Number(doc.reviewCycleMonths) / 12;
    } else if (doc.frequencyMonths) {
      extYears = Number(doc.frequencyMonths) / 12;
    }
    const frequencyMonths = extYears * 12;

    const anchor = doc.last_reviewed_at || doc.lastReviewedDate || doc.last_verified_at || doc.receivedDate || doc.received_date || doc.effectiveDate || todayStr;
    const nextReviewDate = doc.nextReviewDate || doc.next_review_date || calculateNextReviewDate(anchor, frequencyMonths, null);
    const reviewStatusFlag = getReviewStatusFlag(nextReviewDate, todayStr);
    const cleanExtRev = getCleanRev(doc.revision || doc.rev || doc.revNo, '00');
    const editionVal = doc.sourceVersion || doc.edition || '';

    newSchedules.push({
      id: `PRS-EXT-${doc.id}-${Date.now()}`,
      documentCategory: 'EXTERNAL',
      isExternal: true,
      documentId: doc.id,
      externalDocumentId: doc.id,
      documentNumber: getDocCode(doc) || doc.edCode || doc.doc_code || doc.code || doc.document_number || doc.id, 
      documentName: getDocTitle(doc) || doc.title || doc.name,
      rev: cleanExtRev,
      edition: editionVal,
      sourceVersion: editionVal,
      ownerUserId: doc.ownerId || 'U002',
      ownerDepartmentId: doc.department || doc.dept || 'DC', // External verification routed to owner dept or DCC / QA
      responsibleUserId: doc.ownerId || 'U002',
      frequencyMonths: frequencyMonths,
      cycleYears: extYears,
      originalReviewAnchorDate: anchor,
      currentScheduledReviewDate: nextReviewDate,
      nextReviewDate: nextReviewDate,
      next_review_date: nextReviewDate,
      lastReviewedDate: doc.lastReviewedDate || doc.last_reviewed_at || null,
      last_reviewed_at: doc.last_reviewed_at || doc.lastReviewedDate || null,
      is_reviewed_this_cycle: Boolean(doc.is_reviewed_this_cycle),
      periodic_reviews: doc.periodic_reviews || [],
      status: (doc.review_status === 'AWAITING_ACTION' || doc.review_status === 'PENDING_APPROVAL') ? doc.review_status : 'NOT_YET_DUE',
      review_status: doc.review_status || 'NOT_YET_DUE',
      periodic_review_outcome: doc.periodic_review_outcome || null,
      linkedRequestId: doc.linkedRequestId || null,
      linkedActionId: doc.linkedActionId || null,
      dueState: getDueState(nextReviewDate),
      reviewStatusFlag: reviewStatusFlag,
      statusFlag: reviewStatusFlag,
      escalationLevel: 0,
      isActive: true,
      createdAt: now,
      updatedAt: now
    });
  });

  return newSchedules;
};

export const generateTasksForSchedules = (schedules, existingTasks = [], referenceDate = new Date()) => {
  const newTasks = [...existingTasks];
  const now = new Date().toISOString();

  schedules.forEach(schedule => {
    if (!schedule.isActive) return;

    // Check if task already exists and is not completed
    const existingTask = newTasks.find(t => t.scheduleId === schedule.id && !['COMPLETED', 'CANCELLED'].includes(t.status));
    
    // Update due state of existing task if it exists
    if (existingTask) {
      if (schedule.currentScheduledReviewDate) {
        existingTask.dueDate = schedule.currentScheduledReviewDate;
      }
      existingTask.dueState = getDueState(existingTask.dueDate, referenceDate);
      existingTask.reviewStatusFlag = getReviewStatusFlag(existingTask.dueDate, referenceDate);
      existingTask.statusFlag = existingTask.reviewStatusFlag;
      if (existingTask.dueState === 'ESCALATED') existingTask.escalationLevel = 1;
      return;
    }

    // If schedule is already completed, pending approval, or awaiting action, do not generate action task
    if (schedule.status === 'COMPLETED' || schedule.status === 'PENDING_APPROVAL' || schedule.status === 'AWAITING_ACTION' || schedule.is_reviewed_this_cycle) {
      return;
    }

    // Determine if we need to create a new task (e.g. <= 60 days before due)
    const dueState = getDueState(schedule.currentScheduledReviewDate, referenceDate);
    if (dueState !== 'NOT_YET_DUE') {
      schedule.status = 'ACTION_REQUIRED';
      schedule.dueState = dueState;
      const statusFlag = getReviewStatusFlag(schedule.currentScheduledReviewDate, referenceDate);
      schedule.reviewStatusFlag = statusFlag;
      schedule.statusFlag = statusFlag;

      const isExternal = schedule.documentCategory === 'EXTERNAL';
      const isInternal = !isExternal;

      newTasks.push({
        id: `PRT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        scheduleId: schedule.id,
        type: isInternal ? 'PERIODIC_REVIEW' : 'EXTERNAL_VERIFICATION',
        taskType: isInternal ? 'PERIODIC_REVIEW' : 'EXTERNAL_VERIFICATION',
        origin: isInternal ? 'INTERNAL' : 'EXTERNAL',
        documentCategory: schedule.documentCategory || 'INTERNAL',
        assignedToUserId: schedule.responsibleUserId || schedule.ownerUserId || null,
        assigneeId: schedule.responsibleUserId || schedule.ownerUserId || null,
        assignedToDepartmentId: isInternal ? (schedule.ownerDepartmentId || 'QA') : 'DC',
        department: isInternal ? (schedule.ownerDepartmentId || 'QA') : 'DC',
        target_department: isInternal ? (schedule.ownerDepartmentId || 'QA') : 'DC',
        targetRole: isInternal ? 'OWNER_DEPT' : 'DCC',
        dueDate: schedule.currentScheduledReviewDate,
        status: 'ACTION_REQUIRED',
        dueState: dueState,
        reviewStatusFlag: statusFlag,
        statusFlag: statusFlag,
        overdueDays: 0,
        reminderState: dueState,
        escalationLevel: dueState === 'ESCALATED' ? 1 : 0,
        createdAt: now,
        updatedAt: now,
        
        // Denormalized for easy listing
        docId: isInternal ? schedule.documentId : schedule.externalDocumentId,
        referenceId: isInternal ? schedule.documentId : schedule.externalDocumentId,
        referenceType: isInternal ? 'INTERNAL_DOC' : 'EXTERNAL_DOC',
        documentNumber: schedule.documentNumber,
        documentName: schedule.documentName,
        docCode: schedule.documentNumber,
        doc_code: schedule.documentNumber,
        docTitle: schedule.documentName,
        docName: schedule.documentName,
        title: isInternal
          ? `ทบทวนเอกสารตามรอบ: ${schedule.documentName} (${schedule.documentNumber})`
          : `ตรวจสอบความทันสมัยเอกสารภายนอก: ${schedule.documentName} (${schedule.documentNumber})`
      });
    }
  });

  return newTasks;
};

export const getDueStateLabel = (state) => {
  const map = {
    'NOT_YET_DUE': { label: 'ยังไม่ถึงกำหนด (Not Due)', color: 'bg-gray-100 text-gray-700' },
    'DUE_SOON_60': { label: 'ครบกำหนดใน 60 วัน (Due in 60d)', color: 'bg-blue-100 text-blue-700' },
    'DUE_SOON_30': { label: 'ครบกำหนดใน 30 วัน (Due in 30d)', color: 'bg-yellow-100 text-yellow-700' },
    'DUE_SOON_7': { label: 'ครบกำหนดใน 7 วัน (Due in 7d)', color: 'bg-orange-100 text-orange-700' },
    'DUE_TODAY': { label: 'ครบกำหนดวันนี้ (Due Today)', color: 'bg-red-100 text-red-700' },
    'OVERDUE': { label: 'เกินกำหนด (Overdue)', color: 'bg-red-600 text-white animate-pulse' },
    'ESCALATED': { label: 'เกินกำหนด/ยกระดับ (Escalated)', color: 'bg-black text-red-500 font-bold border-red-500 animate-pulse' }
  };
  return map[state] || map['NOT_YET_DUE'];
};

export const getReviewStatusLabel = (status) => {
  const map = {
    // New Normalized Statuses
    'UPCOMING': { label: 'ยังไม่ถึงกำหนด', color: 'bg-gray-100 text-gray-700' },
    'UP_TO_DATE': { label: 'ยังไม่ถึงกำหนด', color: 'bg-gray-100 text-gray-700' },
    'DUE_SOON': { label: 'ใกล้ครบกำหนด', color: 'bg-yellow-100 text-yellow-800' },
    'DUE': { label: 'ถึงกำหนดทบทวน', color: 'bg-orange-100 text-orange-800' },
    'IN_PROGRESS': { label: 'อยู่ระหว่างทบทวน', color: 'bg-blue-100 text-blue-800' },
    'PENDING_APPROVAL': { label: '⏳ รออนุมัติผล', color: 'bg-amber-100 text-amber-800 border-amber-200' },
    'AWAITING_ACTION': { label: 'รอดำเนินการ (แก้ไข/ยกเลิก)', color: 'bg-amber-100 text-amber-800' },
    'OVERDUE': { label: 'เกินกำหนด', color: 'bg-red-100 text-red-800' },
    'COMPLETED': { label: 'ทบทวนเสร็จแล้ว', color: 'bg-green-100 text-green-800' },

    // Fallbacks for legacy states before normalization
    'NOT_YET_DUE': { label: 'ยังไม่ถึงกำหนด', color: 'bg-gray-100 text-gray-700' },
    'ACTION_REQUIRED': { label: 'ต้องดำเนินการ', color: 'bg-yellow-100 text-yellow-800' },
    'ACTION_IN_PROGRESS': { label: 'อยู่ระหว่างดำเนินการ', color: 'bg-blue-100 text-blue-800' },
    'COMPLETED_NO_CHANGE': { label: 'เสร็จสิ้น (ไม่มีการเปลี่ยนแปลง)', color: 'bg-green-100 text-green-800' },
    'COMPLETED_WITH_REVISION': { label: 'เสร็จสิ้น (ขอแก้ไข)', color: 'bg-emerald-100 text-emerald-800' },
    'COMPLETED_WITH_OBSOLETE': { label: 'เสร็จสิ้น (ขอยกเลิก)', color: 'bg-emerald-100 text-emerald-800' },
    'COMPLETED_EXTERNAL_CONFIRMED': { label: 'เสร็จสิ้น (ยืนยันเวอร์ชันเดิม)', color: 'bg-green-100 text-green-800' },
    'COMPLETED_EXTERNAL_UPDATED': { label: 'เสร็จสิ้น (อัปเดตเวอร์ชันใหม่)', color: 'bg-emerald-100 text-emerald-800' },
    'COMPLETED_NO_LONGER_APPLICABLE': { label: 'เสร็จสิ้น (ไม่ใช้งานแล้ว)', color: 'bg-slate-100 text-slate-800' },
    'CANCELLED_BY_DOCUMENT_STATUS': { label: 'ยกเลิก (สถานะเอกสารเปลี่ยน)', color: 'bg-slate-200 text-slate-500 line-through' }
  };
  return map[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
};

export const getReviewOutcomeLabel = (outcome) => {
  const map = {
    'NO_CHANGE': { label: 'ไม่มีการเปลี่ยนแปลง', color: 'bg-green-100 text-green-800' },
    'REVISION_REQUIRED': { label: 'ต้องแก้ไขเอกสาร', color: 'bg-yellow-100 text-yellow-800' },
    'OBSOLETE_REQUIRED': { label: 'ต้องยกเลิกเอกสาร', color: 'bg-red-100 text-red-800' }
  };
  return map[outcome] || { label: outcome || '-', color: 'bg-gray-100 text-gray-700' };
};

export const canResetReviewIntent = (scheduleOrDoc) => {
  if (!scheduleOrDoc) return false;
  const status = scheduleOrDoc.review_status || scheduleOrDoc.status;
  const outcome = scheduleOrDoc.periodic_review_outcome || scheduleOrDoc.outcome;
  return (
    status === 'AWAITING_ACTION' ||
    status === 'PENDING_APPROVAL' ||
    status === 'REVISION_REQUIRED' ||
    status === 'OBSOLETE_REQUIRED' ||
    outcome === 'REVISION_REQUIRED' ||
    outcome === 'OBSOLETE_REQUIRED'
  );
};

