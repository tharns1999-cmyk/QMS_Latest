import { getDocCode, getDocTitle } from '../../utils/domainNormalizer';
const stripAutoSchedulePrefix = (val) => {
  if (!val) return '';
  return String(val).replace(/^PRS-(?:AUTO-(?:EXT-)?|GEN-)/i, '');
};

const extractDeptFromDocCode = (code) => {
  const match = String(code || '').toUpperCase().match(/^(?:ED|FM|WI|QP|QM|SD)-([A-Z0-9]+)-/);
  return match ? match[1] : null;
};

const matchesDocKey = (doc, key) => {
  if (!doc || !key) return false;
  const k = String(key).trim();
  const stripped = stripAutoSchedulePrefix(k);
  const candidates = [doc.id, doc.docCode, doc.code, doc.documentNumber, doc.edCode, doc.doc_code]
    .filter(Boolean)
    .map(v => String(v).trim());
  return candidates.includes(k) || (stripped && candidates.includes(stripped));
};

const isDocActive = (doc) =>
  !['SUPERSEDED', 'OBSOLETE', 'CANCELLED', 'ARCHIVED'].includes(String(doc?.status || '').toUpperCase());

export const resolveReviewContext = ({ reviewId, docCode, routeParamId, searchParams, location, taskId, tasks, periodicReviewSchedules, documents, externalDocuments }) => {
  const paramId = reviewId || docCode || routeParamId;
  const targetTask = taskId ? (tasks || []).find(t => t.id === taskId) : null;
  const stateRecord = location.state?.record || location.state?.schedule || null;
  const stateDoc = location.state?.document || location.state?.doc || null;

  const rawKeys = [
    paramId,
    reviewId,
    docCode,
    routeParamId,
    searchParams.get('docCode'),
    searchParams.get('docId'),
    searchParams.get('scheduleId'),
    location.state?.docCode,
    location.state?.docId,
    location.state?.scheduleId,
    stateRecord?.id,
    stateRecord?.documentNumber,
    stateRecord?.docCode,
    stateRecord?.documentId,
    stateRecord?.externalDocumentId,
    targetTask?.scheduleId,
    targetTask?.docCode,
    targetTask?.documentNumber,
    targetTask?.docId
  ].filter(Boolean).map(v => String(v).trim());

  const candidateKeys = Array.from(
    new Set([
      ...rawKeys,
      ...rawKeys.map(stripAutoSchedulePrefix).filter(Boolean)
    ])
  );

  // 1. Match existing schedule in periodicReviewSchedules
  const matchedSchedule = (periodicReviewSchedules || []).find(s =>
    candidateKeys.some(k =>
      s.id === k ||
      s.documentNumber === k ||
      s.docCode === k ||
      s.documentId === k ||
      s.externalDocumentId === k
    )
  );

  if (matchedSchedule) {
    [
      matchedSchedule.id,
      matchedSchedule.documentNumber,
      matchedSchedule.docCode,
      matchedSchedule.documentId,
      matchedSchedule.externalDocumentId
    ]
      .filter(Boolean)
      .forEach(v => {
        const s = String(v).trim();
        if (!candidateKeys.includes(s)) candidateKeys.push(s);
      });
  }

  // 2. Match internal & external documents (prefer active over superseded/obsolete)
  const internalMatches = (documents || []).filter(d => candidateKeys.some(k => matchesDocKey(d, k)));
  const matchedInternalDoc = internalMatches.find(isDocActive) || internalMatches[0] || null;

  const externalMatches = (externalDocuments || []).filter(d => candidateKeys.some(k => matchesDocKey(d, k)));
  const matchedExternalDoc = externalMatches.find(isDocActive) || externalMatches[0] || null;

  const resolvedExternalFlag = Boolean(
    matchedExternalDoc ||
    stateDoc?.is_external ||
    stateDoc?.external ||
    stateDoc?.isExternal ||
    stateDoc?.doc_type === 'EXTERNAL' ||
    stateDoc?.edCode ||
    stateRecord?.isExternal ||
    stateRecord?.documentCategory === 'EXTERNAL' ||
    matchedSchedule?.documentCategory === 'EXTERNAL' ||
    matchedSchedule?.isExternal ||
    matchedSchedule?.externalDocumentId ||
    location.state?.isExternal ||
    searchParams.get('isExternal') === 'true' ||
    candidateKeys.some(k => String(k).toUpperCase().startsWith('ED-'))
  );

  const resolvedDoc = (resolvedExternalFlag
    ? (matchedExternalDoc || matchedInternalDoc)
    : (matchedInternalDoc || matchedExternalDoc)) || stateDoc || null;

  const resolvedDocCode =
    getDocCode(resolvedDoc) ||
    matchedSchedule?.documentNumber ||
    matchedSchedule?.docCode ||
    stateRecord?.documentNumber ||
    stateRecord?.docCode ||
    docCode ||
    stripAutoSchedulePrefix(paramId) ||
    '';

  const resolvedDept =
    resolvedDoc?.department ||
    resolvedDoc?.owner_dept ||
    resolvedDoc?.dept ||
    (matchedSchedule?.ownerDepartmentId && matchedSchedule.ownerDepartmentId !== 'DC' ? matchedSchedule.ownerDepartmentId : null) ||
    stateRecord?.ownerDepartmentId ||
    stateRecord?.department ||
    extractDeptFromDocCode(resolvedDocCode) ||
    matchedSchedule?.ownerDepartmentId ||
    'DC';

  // Synthesize or enrich schedule when a schedule or document is found
  const synthesizedSchedule = (matchedSchedule || resolvedDoc || stateRecord) ? {
    ...(stateRecord || {}),
    ...(matchedSchedule || {}),
    id: matchedSchedule?.id || stateRecord?.id || (resolvedDoc?.id ? `PRS-AUTO-${resolvedDoc.id}` : (paramId || `PRS-AUTO-${resolvedDocCode}`)),
    documentCategory: resolvedExternalFlag ? 'EXTERNAL' : (matchedSchedule?.documentCategory || stateRecord?.documentCategory || 'INTERNAL'),
    isExternal: resolvedExternalFlag,
    documentId: resolvedExternalFlag ? (matchedSchedule?.documentId || null) : (resolvedDoc?.id || matchedSchedule?.documentId || stateRecord?.documentId || null),
    externalDocumentId: resolvedExternalFlag ? (resolvedDoc?.id || matchedSchedule?.externalDocumentId || stateRecord?.externalDocumentId || null) : (matchedSchedule?.externalDocumentId || null),
    documentNumber: resolvedDocCode || matchedSchedule?.documentNumber || '',
    docCode: resolvedDocCode || matchedSchedule?.docCode || '',
    documentName: matchedSchedule?.documentName || getDocTitle(resolvedDoc) || stateRecord?.documentName || getDocTitle(stateRecord) || resolvedDocCode,
    rev: matchedSchedule?.rev || resolvedDoc?.sourceVersion || resolvedDoc?.edition || resolvedDoc?.revision || resolvedDoc?.rev || stateRecord?.rev || (resolvedExternalFlag ? '-' : '00'),
    edition: resolvedDoc?.sourceVersion || resolvedDoc?.edition || matchedSchedule?.edition || stateRecord?.edition || null,
    sourceVersion: resolvedDoc?.sourceVersion || resolvedDoc?.edition || matchedSchedule?.sourceVersion || null,
    issuer: resolvedDoc?.issuer || resolvedDoc?.officialIssuer || resolvedDoc?.source || resolvedDoc?.issuing_agency || matchedSchedule?.issuer || stateRecord?.issuer || null,
    ownerDepartmentId: resolvedDept,
    ownerUserId: matchedSchedule?.ownerUserId || resolvedDoc?.owner || resolvedDoc?.owner_name || stateRecord?.ownerUserId || stateRecord?.owner || 'ไม่ระบุ',
    originalReviewAnchorDate: matchedSchedule?.originalReviewAnchorDate || resolvedDoc?.effectiveDate || resolvedDoc?.effective_date || resolvedDoc?.issueDate || resolvedDoc?.createdAt || stateRecord?.originalReviewAnchorDate || null,
    nextReviewDate: matchedSchedule?.nextReviewDate || resolvedDoc?.nextReviewDate || resolvedDoc?.next_review_date || stateRecord?.nextReviewDate || null,
    lastReviewedDate: matchedSchedule?.lastReviewedDate || resolvedDoc?.lastReviewDate || resolvedDoc?.last_reviewed_at || stateRecord?.lastReviewedDate || null,
    status: matchedSchedule?.status || resolvedDoc?.review_status || stateRecord?.status || 'SCHEDULED',
    review_status: matchedSchedule?.review_status || resolvedDoc?.review_status || matchedSchedule?.status || 'SCHEDULED',
    reviewCycleMonths: matchedSchedule?.reviewCycleMonths || resolvedDoc?.reviewCycleMonths || 12
  } : null;

  const schedulesForLookup = synthesizedSchedule
    ? [
        synthesizedSchedule,
        ...(periodicReviewSchedules || []).filter(s => s.id !== synthesizedSchedule.id)
      ]
    : (periodicReviewSchedules || []);

  return { paramId, resolvedDoc, synthesizedSchedule, schedulesForLookup };
};

export const normalizeReviewUser = currentUser => currentUser ? {
  ...currentUser,
  departmentMemberships: Array.isArray(currentUser.departmentMemberships)
    ? currentUser.departmentMemberships.map(m => typeof m === 'string'
      ? { departmentId: m, positionLevel: currentUser.level || currentUser.approval_level || 4, isActive: true }
      : m)
    : currentUser.departmentMemberships
} : currentUser;
