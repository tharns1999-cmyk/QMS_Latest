/**
 * qmsRegistry.js
 * ─────────────────────────────────────────────────────────────────────────────
 * QMS Configuration Registry (Single Source of Truth)
 * ISO 9001:2015 Domain Policies & Master Metadata Registry
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getDeptBadgeStyle, getDepartmentBadgeClass } from '../../../shared/utils/departmentColors';
export { getDeptBadgeStyle, getDepartmentBadgeClass };


// ==========================================
// 1. Raw Constant Arrays (ต้องอยู่บนสุดเสมอ)
// ==========================================
export const MASTER_DEPARTMENTS = [
  { id: 'DC', code: 'DC', name: 'DC (Document Control)', nameTh: 'ศูนย์ควบคุมเอกสาร / Document Control', nameEn: 'Document Control Center', headUserId: 'EMP-001', headName: 'ธนาวุฒิ สมควรกิจดำรง', status: 'ACTIVE', color: 'sky', allowDarSubmit: true },
  { id: 'PD', code: 'PD', name: 'PD (Production)', nameTh: 'ฝ่ายผลิต', nameEn: 'Production Department', headUserId: 'U003', headName: 'กัลยาณี พลไกร', status: 'ACTIVE', color: 'indigo', allowDarSubmit: true },
  { id: 'QC', code: 'QC', name: 'QC (Quality Control)', shortName: 'QC', nameTh: 'ฝ่ายประกันและควบคุมคุณภาพ', nameEn: 'Quality Assurance & Control', headUserId: 'U005', headName: 'บีม', status: 'ACTIVE', color: 'emerald', allowDarSubmit: true },
  { id: 'WH', code: 'WH', name: 'WH (Warehouse)', nameTh: 'ฝ่ายคลังสินค้าและโลจิสติกส์', nameEn: 'Warehouse & Logistics', headUserId: 'U005', headName: 'บีม', status: 'ACTIVE', color: 'amber', allowDarSubmit: true },
  { id: 'EN', code: 'EN', name: 'EN (Engineering)', nameTh: 'ฝ่ายวิศวกรรมและซ่อมบำรุง', nameEn: 'Engineering & Maintenance', headUserId: 'U006', headName: 'รัตนพล', status: 'ACTIVE', color: 'blue', allowDarSubmit: true },
  { id: 'PC', code: 'PC', name: 'PC (Purchasing)', nameTh: 'ฝ่ายจัดซื้อ', nameEn: 'Purchasing Department', headUserId: 'U004', headName: 'คุณเรย์', status: 'ACTIVE', color: 'purple', allowDarSubmit: true },
  { id: 'HR&GA', code: 'HR&GA', name: 'HR&GA', nameTh: 'ฝ่ายทรัพยากรบุคคลและธุรการ', nameEn: 'Human Resources & General Affairs', headUserId: 'U004', headName: 'คุณเรย์', status: 'ACTIVE', color: 'rose', allowDarSubmit: true },
  { id: 'HSE', code: 'HSE', name: 'HSE (Safety)', nameTh: 'ฝ่ายความปลอดภัยและสิ่งแวดล้อม', nameEn: 'Health, Safety & Environment', headUserId: 'U004', headName: 'คุณเรย์', status: 'ACTIVE', color: 'teal', allowDarSubmit: true },
  { id: 'MKT', code: 'MKT', name: 'MKT (Marketing)', nameTh: 'ฝ่ายการตลาดและการขาย', nameEn: 'Marketing & Sales', headUserId: 'U010', headName: 'สมชาย การตลาด', status: 'ACTIVE', color: 'cyan', allowDarSubmit: true },
  { id: 'ST', code: 'ST', name: 'ST (Store)', nameTh: 'ฝ่ายจัดเก็บวัตถุดิบ', nameEn: 'Store & Inventory', headUserId: 'U005', headName: 'บีม', status: 'ACTIVE', color: 'slate', allowDarSubmit: true },
  { id: 'FIN', code: 'FIN', name: 'FIN (Finance)', nameTh: 'ฝ่ายการเงินและบัญชี', nameEn: 'Finance Department', status: 'ACTIVE', color: 'purple', allowDarSubmit: true },
  { id: 'MGMT', code: 'MGMT', name: 'ตัวแทนฝ่ายบริหาร/คุณภาพ (MGMT)', nameTh: 'ตัวแทนฝ่ายบริหาร/คุณภาพ', nameEn: 'Management / QMR', isCentral: true, allowDarSubmit: true, status: 'ACTIVE', color: 'rose' },
  { id: 'EXEC', code: 'EXEC', name: 'ผู้บริหารสูงสุด (EXEC)', nameTh: 'ผู้บริหารสูงสุด', nameEn: 'Executive Management', isCentral: true, allowDarSubmit: true, status: 'ACTIVE', color: 'indigo' }
];

export const MASTER_DOC_TYPES = [
  { id: 'QM', code: 'QM', name: 'Quality Manual', nameTh: 'คู่มือคุณภาพ (Quality Manual)', prefix: 'QM', namingPattern: 'QM-{Dept}-{##}', is_form_type: false, reviewCycleMonths: 12, retentionPeriodYears: 5, status: 'ACTIVE', category: 'INTERNAL', allowDar: true, description: 'คู่มือระบบการบริหารคุณภาพตามมาตรฐานสากล' },
  { id: 'SOP', code: 'SOP', name: 'Standard Operating Procedure', nameTh: 'ระเบียบปฏิบัติงาน (Standard Operating Procedure)', prefix: 'SOP', namingPattern: 'SOP-{Dept}-{##}', is_form_type: false, reviewCycleMonths: 12, retentionPeriodYears: 3, status: 'ACTIVE', category: 'INTERNAL', allowDar: true, description: 'ขั้นตอนและระเบียบการดำเนินงานข้ามสายงาน' },
  { id: 'WI', code: 'WI', name: 'Work Instruction', nameTh: 'วิธีการปฏิบัติงาน (Work Instruction)', prefix: 'WI', namingPattern: 'WI-{Dept}-{##}', is_form_type: false, reviewCycleMonths: 12, retentionPeriodYears: 3, status: 'ACTIVE', category: 'INTERNAL', allowDar: true, description: 'คำแนะนำขั้นตอนการทำงานเฉพาะจุดปฏิบัติงาน' },
  { id: 'FM', code: 'FM', name: 'Form / Record Format', nameTh: 'แบบฟอร์ม (Form)', prefix: 'FM', namingPattern: 'FM-{Dept}-{##}', is_form_type: true, reviewCycleMonths: 24, retentionPeriodYears: 2, status: 'ACTIVE', category: 'INTERNAL', allowDar: true, description: 'แบบฟอร์มเปล่าสำหรับบันทึกผลการปฏิบัติงาน' },
  { id: 'SD', code: 'SD', name: 'Supporting Document', nameTh: 'เอกสารสนับสนุน (Supporting Document)', prefix: 'SD', namingPattern: 'SD-{Dept}-{##}', is_form_type: false, reviewCycleMonths: 24, retentionPeriodYears: 3, status: 'ACTIVE', category: 'INTERNAL', allowDar: true, description: 'เอกสารอ้างอิงและข้อมูลทางวิชาการสนับสนุน' },
  { id: 'QP', code: 'QP', name: 'Quality Procedure', nameTh: 'ระเบียบวิธีคุณภาพ (Quality Procedure)', prefix: 'QP', namingPattern: 'QP-{Dept}-{##}', is_form_type: false, reviewCycleMonths: 12, retentionPeriodYears: 5, status: 'ACTIVE', category: 'INTERNAL', allowDar: true, description: 'เกณฑ์มาตรฐานคุณลักษณะวัตถุดิบและผลิตภัณฑ์' },
  { id: 'ED', code: 'ED', name: 'External Document & Regulation', nameTh: 'เอกสารภายนอกและกฎหมาย (External Document)', prefix: 'ED', namingPattern: 'ED-{Dept}-{##}', is_form_type: false, isFormBypass: true, reviewCycleMonths: 12, retentionPeriodYears: 5, status: 'ACTIVE', category: 'EXTERNAL', allowDar: false, description: 'เอกสาร กฎหมาย มาตรฐาน และคู่มือจากหน่วยงานภายนอก' }
];

export const MASTER_DOCUMENT_TYPES = MASTER_DOC_TYPES;

export const MASTER_DATA_DEPT = MASTER_DEPARTMENTS;

export const SYSTEM_CORE_DEPTS = ['DC', 'QA', 'QC', 'QA/QC'];

export const CROSS_ORG_DEPTS = ['MGT', 'MGMT', 'EXEC', 'QMR'];

export const DEFAULT_APPROVAL_MATRIX = [
  { docType: 'QM', doc_type: 'QM', nameTh: 'คู่มือคุณภาพ (Quality Manual)', minRequesterLevel: 4, min_requester_level: 4, requiredReviewerLevel: 6, required_reviewer_level: 6, requiredApproverLevel: 8, required_approver_level: 8, requireAckDefault: true, require_ack_default: true, description: 'คู่มือระบบการบริหารคุณภาพตามมาตรฐานสากล' },
  { docType: 'SOP', doc_type: 'SOP', nameTh: 'ระเบียบปฏิบัติงาน (Standard Operating Procedure)', minRequesterLevel: 1, min_requester_level: 1, requiredReviewerLevel: 4, required_reviewer_level: 4, requiredApproverLevel: 6, required_approver_level: 6, requireAckDefault: true, require_ack_default: true, description: 'ขั้นตอนและระเบียบการดำเนินงานข้ามสายงาน' },
  { docType: 'WI', doc_type: 'WI', nameTh: 'คู่มือการปฏิบัติงาน (Work Instruction)', minRequesterLevel: 1, min_requester_level: 1, requiredReviewerLevel: 4, required_reviewer_level: 4, requiredApproverLevel: 5, required_approver_level: 5, requireAckDefault: false, require_ack_default: false, description: 'คำแนะนำขั้นตอนการทำงานเฉพาะจุดปฏิบัติงาน' },
  { docType: 'FM', doc_type: 'FM', nameTh: 'แบบฟอร์มบันทึกข้อมูล (Form / Record Format)', minRequesterLevel: 1, min_requester_level: 1, requiredReviewerLevel: 4, required_reviewer_level: 4, requiredApproverLevel: 5, required_approver_level: 5, requireAckDefault: false, require_ack_default: false, description: 'แบบฟอร์มเปล่าสำหรับบันทึกผลการปฏิบัติงาน' },
  { docType: 'SD', doc_type: 'SD', nameTh: 'เอกสารสนับสนุน (Supporting Document)', minRequesterLevel: 1, min_requester_level: 1, requiredReviewerLevel: 4, required_reviewer_level: 4, requiredApproverLevel: 5, required_approver_level: 5, requireAckDefault: true, require_ack_default: true, description: 'เอกสารอ้างอิงและข้อมูลทางวิชาการสนับสนุน' },
  { docType: 'QP', doc_type: 'QP', nameTh: 'ระเบียบวิธีคุณภาพ (Quality Procedure)', minRequesterLevel: 1, min_requester_level: 1, requiredReviewerLevel: 4, required_reviewer_level: 4, requiredApproverLevel: 6, required_approver_level: 6, requireAckDefault: true, require_ack_default: true, description: 'เกณฑ์มาตรฐานคุณลักษณะวัตถุดิบและผลิตภัณฑ์' },
  { docType: 'ED', doc_type: 'ED', nameTh: 'เอกสารภายนอกและกฎหมาย (External Document)', minRequesterLevel: 1, min_requester_level: 1, requiredReviewerLevel: 4, required_reviewer_level: 4, requiredApproverLevel: 5, required_approver_level: 5, requireAckDefault: false, require_ack_default: false, description: 'เอกสาร กฎหมาย มาตรฐาน และคู่มือจากหน่วยงานภายนอก' }
];

export const DEFAULT_SIGNATURE_SETTINGS = {
  pinLength: 6,
  maxFailedAttempts: 3,
  defaultPin: '123456',
  requireTermsAcknowledgment: true,
  requireReasonForSigning: true,
  requireReAuthentication: true,
  enableTimestampAuthority: true,
  dualSignOffOnObsolete: true,
  auditTrailLogging: true,
  signatureStampFormat: 'STANDARD_WITH_METADATA',
  allowDrawnSignature: true,
  allowUploadedSignature: true,
  allowTypographicSignature: true
};

export const DEFAULT_SLA_SETTINGS = {
  reviewSlaDays: 3,
  approvalSlaDays: 3,
  hardcopyReceiptSlaDays: 5,
  recallSlaDays: 7,
  darCreationSlaDays: 3
};

// ==========================================
// 1.1 Standardized Watermark Dictionary (ISO 9001:2015)
// ==========================================
export const WATERMARK_CONFIG = {
  // 1. สำเนาควบคุม (แจกจ่ายทางการสำหรับหน้างาน)
  CONTROLLED: {
    color: { r: 0.12, g: 0.25, b: 0.69 }, // Navy Blue
    colorHex: '#1F40B0',
    opacity: 0.16,
    fontStyle: 'normal',
    getLines: (meta = {}) => [
      { text: 'CONTROLLED COPY', size: 48, weight: '600', fontStyle: 'normal', letterSpacing: 3 },
      { text: '(สำเนาควบคุม — บังคับใช้ปฏิบัติงานจริง)', size: 19, weight: '400', fontStyle: 'normal' },
      { text: `Doc No: ${meta.docCode || '-'} | Rev: ${meta.revNo ?? '00'}`, size: 14, weight: '400', fontStyle: 'normal' },
      { text: `Copy No: ${meta.copyNo || '01'} | Issue No: ${meta.issueNo || '01'} | Holder: ${meta.holderDept || meta.targetDept || 'DCC'}`, size: 12.5, weight: '400', fontStyle: 'normal' },
      { text: `Loc: ${meta.location || meta.loc || '-'} | Issued: ${meta.issuedDate || meta.effectiveDate || '-'}`, size: 11.5, weight: '400', fontStyle: 'normal' },
      { text: 'OFFICIAL CONTROLLED COPY | REPRODUCTION STRICTLY PROHIBITED', size: 9.5, weight: '400', fontStyle: 'normal' }
    ],
    lines(meta = {}) {
      return this.getLines(meta);
    }
  },

  // 2. สำเนาไม่ควบคุม (ดาวน์โหลดเพื่อเปิดดู/อ้างอิง)
  UNCONTROLLED: {
    color: { r: 0.86, g: 0.15, b: 0.15 }, // Coral Red
    colorHex: '#DC2626',
    opacity: 0.16,
    fontStyle: 'normal',
    getLines: (meta = {}) => [
      { text: 'UNCONTROLLED COPY', size: 48, weight: '600', fontStyle: 'normal', letterSpacing: 3 },
      { text: '(สำเนาไม่ควบคุม — สำหรับอ้างอิงเท่านั้น)', size: 19, weight: '400', fontStyle: 'normal' },
      { text: `Doc No: ${meta.docCode || '-'} | Rev: ${meta.revNo ?? '00'}`, size: 14, weight: '400', fontStyle: 'normal' },
      { text: `Downloaded by: ${meta.userName || 'Authorized User'} (${meta.userDept || 'QMS'}) | ${meta.timestamp || ''}`, size: 12, weight: '400', fontStyle: 'normal' },
      { text: 'DO NOT DUPLICATE | VERIFY LATEST REVISION BEFORE USE', size: 9.5, weight: '400', fontStyle: 'normal' }
    ],
    lines(meta = {}) {
      return this.getLines(meta);
    }
  },

  // 3. เอกสารฉบับยกเลิกเนื่องจากมีฉบับใหม่แทนที่ (Superseded)
  SUPERSEDED: {
    color: { r: 0.60, g: 0.10, b: 0.10 }, // Crimson
    colorHex: '#991A1A',
    opacity: 0.24,
    fontStyle: 'normal',
    getLines: (meta = {}) => [
      { text: 'SUPERSEDED DOCUMENT', size: 46, weight: '600', fontStyle: 'normal', letterSpacing: 2 },
      { text: '(เอกสารฉบับยกเลิก — มีฉบับใหม่ประกาศใช้แทน)', size: 19, weight: '400', fontStyle: 'normal' },
      { text: `Doc No: ${meta.docCode || '-'} | Former Rev: ${meta.revNo ?? '00'}`, size: 14, weight: '400', fontStyle: 'normal' },
      { text: `Replaced by Rev: ${meta.replacedByRev || 'Latest'} | As of: ${meta.effectiveDate || '-'}`, size: 12, weight: '400', fontStyle: 'normal' },
      { text: 'FOR HISTORICAL & AUDIT REFERENCE ONLY | DO NOT USE IN PRODUCTION', size: 9.5, weight: '400', fontStyle: 'normal' }
    ],
    lines(meta = {}) {
      return this.getLines(meta);
    }
  },

  // 4. เอกสารยกเลิกถาวร (Obsolete)
  OBSOLETE: {
    color: { r: 0.30, g: 0.35, b: 0.40 }, // Slate Gray
    colorHex: '#4D5966',
    opacity: 0.22,
    fontStyle: 'normal',
    getLines: (meta = {}) => [
      { text: 'OBSOLETE DOCUMENT', size: 46, weight: '600', fontStyle: 'normal', letterSpacing: 2 },
      { text: '(เอกสารยกเลิกการใช้งานถาวร)', size: 19, weight: '400', fontStyle: 'normal' },
      { text: `Doc No: ${meta.docCode || '-'} | DAR Ref: ${meta.darNo || '-'}`, size: 14, weight: '400', fontStyle: 'normal' },
      { text: `Discontinued Date: ${meta.obsoleteDate || '-'} | Reason: Retired`, size: 12, weight: '400', fontStyle: 'normal' },
      { text: 'PERMANENTLY RETIRED | NOT VALID FOR OPERATIONAL USE', size: 9.5, weight: '400', fontStyle: 'normal' }
    ],
    lines(meta = {}) {
      return this.getLines(meta);
    }
  },

  // 5. เอกสารร่างระหว่างจัดทำ/ทบทวน (Draft)
  DRAFT: {
    color: { r: 0.85, g: 0.47, b: 0.03 }, // Amber
    colorHex: '#D97808',
    opacity: 0.20,
    fontStyle: 'normal',
    getLines: (meta = {}) => [
      { text: 'DRAFT / UNDER REVIEW', size: 46, weight: '600', fontStyle: 'normal', letterSpacing: 2 },
      { text: '(เอกสารร่าง — อยู่ระหว่างจัดทำ/ทบทวน)', size: 19, weight: '400', fontStyle: 'normal' },
      { text: `Workflow: ${meta.darNo || 'DRAFT'} | Current Step: In-Review`, size: 14, weight: '400', fontStyle: 'normal' },
      { text: `Initiated By: ${meta.userName || 'Requester'} (${meta.userDept || '-'})`, size: 12, weight: '400', fontStyle: 'normal' },
      { text: 'NOT YET EFFECTIVE | UNAPPROVED DRAFT COPY', size: 9.5, weight: '400', fontStyle: 'normal' }
    ],
    lines(meta = {}) {
      return this.getLines(meta);
    }
  }
};

// Aliases for system compatibility
WATERMARK_CONFIG.CONTROLLED_COPY = WATERMARK_CONFIG.CONTROLLED;
WATERMARK_CONFIG.CONTROLLED_COPY_REPLACEMENT = WATERMARK_CONFIG.CONTROLLED;
WATERMARK_CONFIG.CONTROLLED_REPLACEMENT = WATERMARK_CONFIG.CONTROLLED;
WATERMARK_CONFIG.UNCONTROLLED_COPY = WATERMARK_CONFIG.UNCONTROLLED;
WATERMARK_CONFIG.OFFICIAL_MASTER_COPY = WATERMARK_CONFIG.CONTROLLED;
WATERMARK_CONFIG.DRAFT_WATERMARK = WATERMARK_CONFIG.DRAFT;

// ==========================================
// 2. Main Config & Policies Objects
// ==========================================
export const QMS_CONFIG = Object.freeze({
  /** All active departments in the organisation */
  departments: MASTER_DEPARTMENTS,

  /** All document types managed by the QMS */
  documentTypes: MASTER_DOCUMENT_TYPES,

  /** Level-threshold matrix per document type */
  approvalMatrix: DEFAULT_APPROVAL_MATRIX,

  /** 21 CFR Part 11 e-signature settings */
  signatureSettings: DEFAULT_SIGNATURE_SETTINGS,

  /** SLA durations (in working days) */
  slaSettings: DEFAULT_SLA_SETTINGS,

  /** Dept codes that hold system/DCC core functions */
  systemCoreDepts: SYSTEM_CORE_DEPTS,

  /** Dept codes with cross-organisational review/approve authority */
  crossOrgDepts: CROSS_ORG_DEPTS,

  /** Seed user list (used as fallback when DB/IndexedDB is empty) */
  seedUsers: []
});

export const QMS_POLICIES = Object.freeze({
  // 1. นโยบายเหตุผลการทำ DAR
  CHANGE_REASONS: [
    { id: 'NEW_PROCESS', labelTh: 'จัดทำใหม่สำหรับกระบวนการใหม่', applicableTo: ['NEW'] },
    { id: 'PERIODIC_REVIEW', labelTh: 'ทบทวนประจำปี', applicableTo: ['REVISE'] },
    { id: 'CAR_PAR', labelTh: 'แก้ไขตามข้อบกพร่องจากการตรวจติดตาม (CAR/PAR)', applicableTo: ['REVISE'] },
    { id: 'PROCESS_IMPROVEMENT', labelTh: 'ปรับปรุงประสิทธิภาพการทำงาน', applicableTo: ['REVISE'] },
    { id: 'OBSOLETE_PROCESS', labelTh: 'ยกเลิกเนื่องจากยุบเลิกกระบวนการ/ไม่มีการใช้งาน', applicableTo: ['OBSOLETE'] }
  ],

  // 2. นโยบาย SLA และการคำนวณวันครบกำหนด (Due Date)
  SLA_POLICIES: {
    FAST_TRACK: { id: 'FAST_TRACK', label: 'งานด่วน (Fast-Track)', targetDays: 0, badgeColor: 'amber' },
    URGENT:     { id: 'URGENT',     label: 'ด่วนพิเศษ',          targetDays: 3, badgeColor: 'orange' },
    NORMAL:     { id: 'NORMAL',     label: 'งานทั่วไป',           targetDays: 7, badgeColor: 'blue' }
  },

  // 3. ระดับชั้นความลับของเอกสาร
  CONFIDENTIALITY_LEVELS: [
    { code: 'PUBLIC',       nameTh: 'ทั่วไป',   badgeColor: 'emerald' },
    { code: 'INTERNAL',     nameTh: 'ภายใน',   badgeColor: 'sky' },
    { code: 'CONFIDENTIAL', nameTh: 'ลับเฉพาะ', badgeColor: 'rose' }
  ],

  // 4. ข้อจำกัดและนโยบายความปลอดภัยของไฟล์
  FILE_POLICIES: {
    MAX_DOCUMENT_SIZE_MB: 25,
    MAX_SIGNATURE_SIZE_MB: 2,
    ALLOWED_DOCUMENT_EXTENSIONS: ['.pdf'],
    ALLOWED_SIGNATURE_EXTENSIONS: ['.png', '.jpg', '.jpeg']
  },

  // 5. พจนานุกรมกิจกรรม Audit Trail
  AUDIT_EVENTS: {
    DAR_SUBMITTED:       { code: 'DAR_SUBMITTED',       actionTh: 'ยื่นคำร้องขอเอกสาร',      severity: 'INFO' },
    DAR_REVIEW_APPROVED: { code: 'DAR_REVIEW_APPROVED', actionTh: 'ผ่านการทบทวนเอกสาร',     severity: 'SUCCESS' },
    DAR_REJECTED:        { code: 'DAR_REJECTED',        actionTh: 'ส่งกลับเพื่อแก้ไข',         severity: 'WARNING' },
    DAR_FINAL_APPROVED:  { code: 'DAR_FINAL_APPROVED',  actionTh: 'อนุมัติและประกาศใช้สมบูรณ์', severity: 'SUCCESS' },
    CONTROLLED_DOWNLOAD: { code: 'CONTROLLED_DOWNLOAD', actionTh: 'ดาวน์โหลดสำเนาควบคุม',     severity: 'AUDIT' }
  },

  // 6. UI Themes (Badge & Status Color Schemes - Standardized High-Contrast Pastel)
  THEMES: {
    DEPARTMENTS: {
      QC: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200/90' },
      PD: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200/90' },
      EN: { bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200/90' },
      FIN: { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200/90' },
      DC: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200/90' },
      MGMT: { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200/90' },
      EXEC: { bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200/90' }
    }
  }
});

// ==========================================
// 3. Pure Lookup Helpers (อยู่ล่างสุด)
// ==========================================

/**
 * Resolve a department object by its id/code string (case-insensitive).
 * @param {string} deptId
 * @returns {Object|undefined}
 */
export const getDeptById = (deptId) => {
  if (!deptId) return undefined;
  const key = String(deptId).toUpperCase().trim();
  return MASTER_DEPARTMENTS.find(
    (d) => String(d.id || d.code || '').toUpperCase().trim() === key
  );
};

/**
 * Resolve a document type object by its code string (case-insensitive).
 * @param {string} docTypeCode
 * @returns {Object|undefined}
 */
export const getDocTypeById = (docTypeCode) => {
  if (!docTypeCode) return undefined;
  const key = String(docTypeCode).toUpperCase().trim();
  return MASTER_DOCUMENT_TYPES.find(
    (t) => String(t.id || t.code || '').toUpperCase().trim() === key
  );
};

/**
 * Get all active departments as { value, label } option pairs for dropdowns.
 * @returns {{ value: string, label: string }[]}
 */
export const getDeptOptions = () =>
  MASTER_DEPARTMENTS
    .filter((d) => !d.status || d.status === 'ACTIVE')
    .map((d) => ({
      value: d.id || d.code,
      label: d.name || d.nameTh || d.id,
      nameTh: d.nameTh || d.name,
      nameEn: d.nameEn || d.name,
      color: d.color,
    }));

/**
 * Get all active internal document types as { value, label } option pairs.
 * @param {{ includeExternal?: boolean }} opts
 * @returns {{ value: string, label: string }[]}
 */
export const getDocTypeOptions = ({ includeExternal = false } = {}) =>
  MASTER_DOCUMENT_TYPES
    .filter((t) => {
      if (!t.status || t.status !== 'ACTIVE') return false;
      if (!includeExternal && t.category === 'EXTERNAL') return false;
      return true;
    })
    .map((t) => ({
      value: t.id || t.code,
      label: `${t.code || t.id} – ${t.nameTh || t.name}`,
      nameTh: t.nameTh || t.name,
      nameEn: t.name,
      isFormType: t.is_form_type || false,
      namingPattern: t.namingPattern,
      reviewCycleMonths: t.reviewCycleMonths,
    }));

/**
 * Resolve approval level thresholds for a given document type code.
 * Falls back to { minRequesterLevel: 1, minReviewerLevel: 4, minApproverLevel: 5 }.
 *
 * @param {string} docTypeCode
 * @returns {{ minRequesterLevel: number, minReviewerLevel: number, minApproverLevel: number }}
 */
export const getApprovalThresholdsFromRegistry = (docTypeCode) => {
  const key = String(docTypeCode || '').toUpperCase().trim();
  const entry = DEFAULT_APPROVAL_MATRIX.find(
    (m) => String(m.docType || m.doc_type || '').toUpperCase().trim() === key
  );
  return {
    minRequesterLevel: entry?.minRequesterLevel ?? entry?.min_requester_level ?? 1,
    minReviewerLevel:
      entry?.requiredReviewerLevel ?? entry?.required_reviewer_level ?? 4,
    minApproverLevel:
      entry?.requiredApproverLevel ?? entry?.required_approver_level ?? 5,
  };
};

/**
 * Resolve whether a department id represents a cross-org authority.
 * @param {string} deptId
 * @returns {boolean}
 */
export const isCrossOrgDept = (deptId) => {
  if (!deptId) return false;
  const key = String(deptId).toUpperCase().trim();
  return CROSS_ORG_DEPTS.some(
    (d) => String(d).toUpperCase().trim() === key
  );
};

/**
 * Resolve the review cycle (months) for a given document type.
 * @param {string} docTypeCode
 * @returns {number}
 */
export const getReviewCycleMonths = (docTypeCode) => {
  const dt = getDocTypeById(docTypeCode);
  return dt?.reviewCycleMonths ?? 12;
};

/**
 * Resolve the naming pattern string for a given document type code.
 * e.g. 'SOP' → 'SOP-{Dept}-{##}'
 * @param {string} docTypeCode
 * @returns {string}
 */
export const getNamingPattern = (docTypeCode) => {
  const dt = getDocTypeById(docTypeCode);
  return dt?.namingPattern ?? `${String(docTypeCode || '').toUpperCase()}-{Dept}-{##}`;
};

/**
 * Resolve the Thai display name for a department id.
 * @param {string} deptId
 * @returns {string}
 */
export const getDeptNameTh = (deptId) => {
  const dept = getDeptById(deptId);
  return dept?.nameTh || dept?.name || deptId || '';
};

/**
 * Resolve the Thai display name for a document type code.
 * @param {string} docTypeCode
 * @returns {string}
 */
export const getDocTypeNameTh = (docTypeCode) => {
  const dt = getDocTypeById(docTypeCode);
  return dt?.nameTh || dt?.name || docTypeCode || '';
};

/**
 * Check whether a document type code is an external document type.
 * External documents (ED) bypass the standard DAR workflow.
 * @param {string} docTypeCode
 * @returns {boolean}
 */
export const isExternalDocType = (docTypeCode) => {
  const dt = getDocTypeById(docTypeCode);
  return dt?.category === 'EXTERNAL' || dt?.isFormBypass === true;
};

/**
 * Check whether a document type is a form/record type.
 * Form types (FM) may have different distribution requirements.
 * @param {string} docTypeCode
 * @returns {boolean}
 */
export const isFormDocType = (docTypeCode) => {
  const dt = getDocTypeById(docTypeCode);
  return dt?.is_form_type === true;
};

/**
 * Get Change Reasons filtered by DAR action type (NEW, REVISE, OBSOLETE)
 * @param {'NEW'|'REVISE'|'OBSOLETE'} darType
 * @returns {Array<{ id: string, labelTh: string, applicableTo: string[] }>}
 */
export const getChangeReasonsByDarType = (darType = 'NEW') => {
  const normType = String(darType).toUpperCase();
  return QMS_POLICIES.CHANGE_REASONS.filter(r => r.applicableTo.includes(normType));
};

/**
 * Get UI theme configuration for a given department id.
 * @param {string} deptId
 * @returns {{ bg: string, text: string, border: string, avatar: string }}
 */
export const getDepartmentTheme = (deptId) => {
  const defaultTheme = {
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
    avatar: 'bg-slate-700 text-white'
  };
  if (!deptId) return defaultTheme;

  const key = String(deptId).toUpperCase().trim();
  const cleanKey = (key === 'QA/QC' || key === 'QAQC') ? 'QC' : (key === 'DCC' ? 'DC' : key);
  const theme = QMS_POLICIES.THEMES.DEPARTMENTS[cleanKey];
  if (!theme) return defaultTheme;

  const avatarMap = {
    QC: 'bg-emerald-600 text-white',
    PD: 'bg-amber-600 text-white',
    EN: 'bg-sky-600 text-white',
    FIN: 'bg-purple-600 text-white',
    DC: 'bg-blue-600 text-white',
    MGMT: 'bg-rose-600 text-white',
    EXEC: 'bg-indigo-600 text-white'
  };

  return {
    ...theme,
    avatar: avatarMap[cleanKey] || defaultTheme.avatar
  };
};

/**
 * Get unified CSS class string for department badge.
 * @param {string} deptId
 * @returns {string}
 */
export const getDepartmentBadgeClasses = (deptId) => {
  return getDepartmentBadgeClass(deptId);
};

/**
 * Calculate due date based on SLA policies.
 * @param {'FAST_TRACK'|'URGENT'|'NORMAL'|boolean} slaPolicyOrFastTrack
 * @param {Date|string|number} [baseDate=new Date()]
 * @returns {string} YYYY-MM-DD
 */
export const calculateDueDateBySla = (slaPolicyOrFastTrack, baseDate = new Date()) => {
  const start = baseDate instanceof Date ? new Date(baseDate) : new Date(baseDate || Date.now());
  const d = isNaN(start.getTime()) ? new Date() : start;

  let policyKey = 'NORMAL';
  if (slaPolicyOrFastTrack === true || slaPolicyOrFastTrack === 'FAST_TRACK') {
    policyKey = 'FAST_TRACK';
  } else if (slaPolicyOrFastTrack === 'URGENT') {
    policyKey = 'URGENT';
  } else if (slaPolicyOrFastTrack === 'NORMAL' || slaPolicyOrFastTrack === false) {
    policyKey = 'NORMAL';
  }

  const policy = QMS_POLICIES.SLA_POLICIES[policyKey] || QMS_POLICIES.SLA_POLICIES.NORMAL;
  const targetDays = policy.targetDays;

  // Advance by targetDays (handling calendar days)
  d.setDate(d.getDate() + targetDays);

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default QMS_CONFIG;
