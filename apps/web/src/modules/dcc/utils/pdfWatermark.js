/**
 * pdfWatermark.js
 * 
 * Enterprise Document Security & Watermark Resolution Engine
 * Conforms to ISO 9001 / Document Control System (DCS) Standards.
 */

import { 
  UniversalWatermarkService, 
  WATERMARK_TYPES, 
  WATERMARK_PRESETS,
  getBangkokFormattedTimestamp,
  getBangkokFormattedDate
} from '../services/UniversalWatermarkService';

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

  const docCode = doc.document_code || doc.doc_code || doc.edCode || doc.title || doc.id || '-';
  const docRev = String(doc.revision || doc.rev || doc.doc_version || '00').replace(/^REV\.?/i, '').padStart(2, '0');
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
      doc.status?.toUpperCase().startsWith('OBSOLETE') || 
      doc.is_obsolete
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
      doc.status?.toUpperCase().startsWith('SUPERSEDED') || 
      doc.is_superseded || 
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

  // 📝 0. กรณีเอกสารฉบับร่าง หรืออยู่ระหว่างทบทวน/อนุมัติ (DRAFT / UNDER REVIEW)
  if (
    normalizedType === 'DRAFT' || 
    normalizedType === 'DRAFT_WATERMARK' || 
    isDraftLifecycle(doc?.status) || 
    isDraftLifecycle(options?.status)
  ) {
    const darRef = doc?.darNumber || doc?.darNo || doc?.dar_no || doc?.id || options?.darNo || 'DAR-DRAFT';
    return [
      'ฉบับร่าง (สำหรับทบทวนและพิจารณาเท่านั้น)',
      'ห้ามนำไปใช้ปฏิบัติงานจริง (NOT FOR OPERATIONAL USE)',
      `DAR Ref: ${darRef} | Doc: ${docCode} | Rev: Rev.${docRev}`,
      `Printed Date: ${nowStr} | User: ${userStr}`
    ];
  }

  // 🚫 1. กรณีเอกสารยกเลิก (OBSOLETE) — ห้ามมีคำว่า "Superseded By" เด็ดขาด 100%!
  if (
    normalizedType === 'OBSOLETE' || 
    doc.status?.toUpperCase().startsWith('OBSOLETE') || 
    doc.is_obsolete
  ) {
    const darRef = doc.obsolete_dar_id || doc.obsolete_dar_no || doc.dar_id || doc.dar_no || doc.darId || doc.darNo || 'DAR-OBSOLETE';
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
    doc.status?.toUpperCase().startsWith('SUPERSEDED') || 
    doc.is_superseded || 
    options.isHistoricalRev
  ) {
    const nextRev = doc.superseded_by_rev || options.supersededByRev || doc.nextVersion || 'Latest';
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
      `Doc: ${docCode} | Rev: Rev.${docRev}`,
      `Copy: ${copyInfo.copy_number || copyInfo.copy_no || copyInfo.ccNumber || 'Copy 01'} | Station: ${copyInfo.station_name || copyInfo.location || copyInfo.locationName || 'Master'}`,
      `Issued Date: ${nowStr} | Issuer: ${userStr}`,
    ];
  }

  // 📄 4. กรณีเอกสารใช้งานทั่วไป (UNCONTROLLED COPY)
  return [
    'FOR REFERENCE ONLY (INTERNAL USE)',
    `Doc: ${docCode} | Ver: Rev.${docRev}`,
    `Printed Date: ${nowStr} | User: ${userStr}`,
  ];
};

/**
 * Check if a document or DAR status belongs to the Draft / Review lifecycle
 */
export const isDraftLifecycle = (status) => {
  if (!status) return false;
  const s = String(status).toUpperCase();
  return [
    'NEW',
    'PENDING_REVIEW',
    'UNDER_REVIEW',
    'IN_REVIEW',
    'PENDING_APPROVAL',
    'RETURNED',
    'RETURNED_FOR_REVISION',
    'DRAFT',
    'REVISION_PENDING',
    'EDITING'
  ].includes(s);
};

/**
 * ตรวจสอบและระบุประเภทลายน้ำตามสถานะเอกสารและบริบทการดาวน์โหลด
 * @param {Object} doc - ข้อมูลเอกสาร
 * @param {Object} options - ข้อมูลเสริม เช่น copyInfo, currentUser, isHistoricalRev, dccName
 * @returns {Object} การตั้งค่าลายน้ำ (type, watermarkType, mainText, color, subLines, metadata)
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
  const status = (doc?.status || options.status || '').toUpperCase();
  const currentUser = options.currentUser || {};
  const copyInfo = options.copyInfo || null;
  const nowStr = getBangkokFormattedTimestamp(new Date());

  const docCode = doc?.document_code || doc?.doc_code || doc?.docCode || doc?.title || doc?.edCode || 'DOC-001';
  const extVersion = doc?.sourceVersion || doc?.source_version || doc?.edition || doc?.version || doc?.externalVersion || '-';
  const docVersion = isExternal ? extVersion : String(doc?.revision || doc?.rev || doc?.doc_version || doc?.docVersion || '00').replace(/^REV\.?/i, '').padStart(2, '0');
  const userDisplayName = currentUser.name || currentUser.username || options.userName || 'User';
  const userDept = currentUser.department || currentUser.dept || options.userDept || doc?.department || 'HQ';

  // 0. กรณีเอกสารฉบับร่าง หรืออยู่ระหว่างทบทวน/อนุมัติ (DRAFT / IN-REVIEW / PENDING APPROVAL)
  // Mutually Exclusive Stage Governance: บังคับใช้ลายน้ำ DRAFT ชั้นเดียวเท่านั้น 100%
  const isDraftStage = isDraftLifecycle(doc?.status) || 
                       isDraftLifecycle(options?.status) || 
                       doc?.isDraft || 
                       options?.isDraft || 
                       status === 'DRAFT' || 
                       status === 'PENDING_REVIEW' || 
                       status === 'UNDER_REVIEW' || 
                       status === 'IN_REVIEW' || 
                       status === 'PENDING_APPROVAL' || 
                       status === 'RETURNED' || 
                       status === 'RETURNED_FOR_REVISION';

  if (isDraftStage) {
    return {
      type: 'DRAFT',
      watermarkType: WATERMARK_TYPES.DRAFT,
      mainText: 'DRAFT',
      color: '#E11D48', // Stamp Crimson / Rose Red
      subLines: buildWatermarkSubLines(doc, 'DRAFT', { ...options, currentUser, isExternal }),
      metadata: {
        docCode,
        docVersion,
        darNo: doc?.darNumber || doc?.darNo || doc?.id || options?.darNo || '-',
        userName: userDisplayName,
        userDept,
        timestamp: nowStr,
        isExternal,
        status: doc?.status || options?.status || 'DRAFT'
      }
    };
  }

  // 1. กรณีเป็นสำเนาควบคุม (Controlled Copy - internal documents only)
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

export { 
  UniversalWatermarkService, 
  WATERMARK_TYPES, 
  WATERMARK_PRESETS,
  getBangkokFormattedTimestamp,
  getBangkokFormattedDate
  // Note: isDraftLifecycle is declared as a named export above (line 155) — no re-export needed
};

export default {
  buildWatermarkSubLines,
  resolveWatermarkConfig,
  UniversalWatermarkService,
  WATERMARK_TYPES,
  WATERMARK_PRESETS,
  isDraftLifecycle
};

