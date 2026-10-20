/**
 * QMS Enterprise Seed & Mock Data Fixtures
 * Sourced and extracted from useStore.js for modular architecture and lean store size.
 */

import {
  defaultSeedDocuments,
  defaultSeedDars,
  defaultSeedTasks,
  defaultSeedCopies,
  defaultSeedCurrentUser
} from '../mockSeedData';

export {
  defaultSeedDocuments,
  defaultSeedDars,
  defaultSeedTasks,
  defaultSeedCopies,
  defaultSeedCurrentUser
};

// 1. Master Data Users (Roles: DCC_ADMIN, DEPT_ADMIN, GENERAL_USER)
export const MASTER_DATA_USER = [
  { 
    id: 'EMP-001', 
    empId: 'EMP-001', 
    name: 'ธนาวุฒิ สมควรกิจดำรง', 
    fullName: 'ธนาวุฒิ สมควรกิจดำรง', 
    email: 'thanawut.s@company.com', 
    position: 'Technology Project Leader / DCC Supervisor', 
    level: 4, 
    approval_level: 4, 
    role: 'DCC_ADMIN', 
    isDcc: true, 
    isQmr: false, 
    depts: ['DC'], 
    department: 'DC', 
    dept: 'DC', 
    primary_department: 'DC', 
    affiliated_departments: ['DC'], 
    status: 'Active', 
    pin: '123456', 
    failedPinAttempts: 0, 
    isLocked: false, 
    lastPinChangedAt: '2026-01-01T00:00:00.000Z', 
    signatureType: 'TYPOGRAPHIC', 
    signatureStyle: 'FORMAL_SERIF', 
    signatureInitials: 'TNW-DC', 
    hasRegisteredSignature: true, 
    certificateSerial: 'CERT-2026-DC001', 
    permissions: ['DAR_CREATE', 'TASK_ACCESS', 'VIEW_REGISTER', 'DCC_ADMIN'],
    canCreateDar: true,
    canAccessTasks: true,
    canViewRegister: true,
    isWorkflowUser: true
  },
  { id: 'U003', empId: 'EMP-003', name: 'กัลยาณี พลไกร', fullName: 'กัลยาณี พลไกร', email: 'kalyanee.p@company.com', position: 'Production Assistant Manager', level: 5, approval_level: 5, role: 'DEPT_ADMIN', isDcc: false, isQmr: false, depts: ['PD', 'QC'], department: 'PD', dept: 'PD', primary_department: 'PD', departments: ['PD', 'QC'], secondaryDepartments: ['QC'], affiliated_departments: ['PD', 'QC'], status: 'ACTIVE', pin: '123456', failedPinAttempts: 0, isLocked: false, lastPinChangedAt: '2026-01-01T00:00:00.000Z', signatureType: 'TYPOGRAPHIC', signatureStyle: 'CLASSIC_CALLIGRAPHY', signatureInitials: 'KYN-PD', hasRegisteredSignature: true, certificateSerial: 'CERT-2026-PD003', permissions: ['DAR_CREATE', 'TASK_ACCESS', 'VIEW_REGISTER'], canCreateDar: true, canAccessTasks: true, canViewRegister: true, isWorkflowUser: true },
  { id: 'U004', empId: 'EMP-004', name: 'คุณเรย์', fullName: 'คุณเรย์', email: 'ray.gm@company.com', position: 'General Manager / QMR', level: 6, approval_level: 6, role: 'DEPT_ADMIN', isDcc: false, isQmr: true, depts: ['MGMT'], department: 'MGMT', dept: 'MGMT', primary_department: 'MGMT', affiliated_departments: ['MGMT', 'QC', 'PD', 'EN', 'DC'], managedDepartments: ['*'], status: 'ACTIVE', pin: '123456', failedPinAttempts: 0, isLocked: false, lastPinChangedAt: '2026-01-01T00:00:00.000Z', signatureType: 'TYPOGRAPHIC', signatureStyle: 'FORMAL_SERIF', signatureInitials: 'RAY-GM', hasRegisteredSignature: true, certificateSerial: 'CERT-2026-GM004', permissions: ['DAR_CREATE', 'TASK_ACCESS', 'VIEW_REGISTER', 'QMR_ACCESS'], canCreateDar: true, canAccessTasks: true, canViewRegister: true, isWorkflowUser: true },
  { id: 'U005', empId: 'EMP-005', name: 'บีม', fullName: 'บีม', email: 'beam.qa@company.com', position: 'QAQC Supervisor', level: 4, approval_level: 4, role: 'DEPT_ADMIN', isDcc: false, isQmr: false, depts: ['QC'], department: 'QC', dept: 'QC', primary_department: 'QC', primaryDepartment: 'QC', departments: ['QC'], departmentMemberships: ['QC'], affiliated_departments: ['QC'], secondaryDepartments: [], status: 'ACTIVE', pin: '123456', failedPinAttempts: 0, isLocked: false, lastPinChangedAt: '2026-01-01T00:00:00.000Z', signatureType: 'DRAWN', signatureStyle: 'BRUSH_SCRIPT', signatureInitials: 'Beam', signatureImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPAAAABQCAYAAAAnSfh8AAACZklEQVR4nO3SwQnAIBAF0W8XtiW7sXWbEEQM5g+D78C4r/f5Pqf31Xvf81335T46B7DTAZy17wmc6gDOKn0F+1UAcNYBHNUBnFUGcFYHcFYZAM7qAM4qAzirDDCsDOAsA8BZZQA4qwzgrDMAvGUAOKsMAM4yAJx1BoCzzgDOKgPAWQaw2wEczc8w/QpW5gCO6gDOKgPAWR3AWZUB4KwzgLN6wLDOAM4yAJxVBnBWB3BWBwBndQBndQBn9RnwfF4HcFZlADirDAA/HQCe9wDwrDOAMwBnlQHgrDOAszoAMCsDOCsDODsCODsDOKsMAM4A4KwOAM7qAMDqAM7qAM7qAM7qAM4qAzirDAAcPQBOZQBndQBwVgcAZ3UAcFYZAM4yAJxVBnBWB3BWBwBndQBndQBn9RnwfF4HcFZlADirDAA/HQCe9wDwrDOAMwBnlQHgrDOAszoAMCsDOCsDODsCODsDOKsMAM4A4KwOAM7qAMDqAM7qAM7qAM7qAM4qAzirDAAcPQBOZQBndQBwVgcAZ3UAcFYZAM4yAJxVBnBWB3BWBwBndQBndQBn9RnwfF4HcFZlADirDAA/HQCe9wDwrDOAMwBnlQHgrDOAszoAMCsDOCsDODsCODsDOKsMAM4A4KwOAM7qAMDqAM7qAM7qAM7qAM4qAzirDAAcPQBOZQBndQBwVgcAZ3UAcFYZAM4yAJxVBnBWB3BWBwBndQBndQBn9RnwfF4HcFZlADirDAA/HQCe9wDwrDOAMwBnlQHgrDOAszoAMCsDOCsDODsCODsDOKsMAM4A4KwOAM7qAMDq/wEAAP//0mZ89XbJ6f8AAAAASUVORK5CYII=', hasRegisteredSignature: true, certificateSerial: 'CERT-2026-QA005', permissions: ['DAR_CREATE', 'TASK_ACCESS', 'VIEW_REGISTER'], canCreateDar: true, canAccessTasks: true, canViewRegister: true, isWorkflowUser: true },
  { id: 'U006', empId: 'EMP-006', name: 'รัตนพล', fullName: 'รัตนพล', email: 'rattanapol.en@company.com', position: 'Engineering Supervisor', level: 4, approval_level: 4, role: 'DEPT_ADMIN', isDcc: false, isQmr: false, depts: ['EN'], department: 'EN', dept: 'EN', primary_department: 'EN', affiliated_departments: ['EN'], status: 'ACTIVE', pin: '123456', failedPinAttempts: 0, isLocked: false, lastPinChangedAt: '2026-01-01T00:00:00.000Z', signatureType: 'TYPOGRAPHIC', signatureStyle: 'MODERN_SANS', signatureInitials: 'RTP-EN', hasRegisteredSignature: true, certificateSerial: 'CERT-2026-EN006', permissions: ['DAR_CREATE', 'TASK_ACCESS', 'VIEW_REGISTER'], canCreateDar: true, canAccessTasks: true, canViewRegister: true, isWorkflowUser: true },
  { id: 'U007', empId: 'EMP-007', name: 'ชัยวัฒน์', fullName: 'ชัยวัฒน์', email: 'chaiwat.en@company.com', position: 'Engineering Assistant Manager', level: 5, approval_level: 5, role: 'DEPT_ADMIN', isDcc: false, isQmr: false, depts: ['EN'], department: 'EN', dept: 'EN', primary_department: 'EN', affiliated_departments: ['EN'], status: 'ACTIVE', pin: '123456', failedPinAttempts: 0, isLocked: false, lastPinChangedAt: '2026-01-01T00:00:00.000Z', signatureType: 'TYPOGRAPHIC', signatureStyle: 'FORMAL_SERIF', signatureInitials: 'CWT-EN', hasRegisteredSignature: true, certificateSerial: 'CERT-2026-EN007', permissions: ['DAR_CREATE', 'TASK_ACCESS', 'VIEW_REGISTER'], canCreateDar: true, canAccessTasks: true, canViewRegister: true, isWorkflowUser: true },
  { id: 'U008', empId: 'EMP-008', name: 'คุณกิต', fullName: 'คุณกิต', email: 'kit.fin@company.com', position: 'Finance Director', level: 7, approval_level: 7, role: 'DEPT_ADMIN', isDcc: false, isQmr: false, depts: ['FIN'], department: 'FIN', dept: 'FIN', primary_department: 'FIN', affiliated_departments: ['FIN'], status: 'ACTIVE', pin: '123456', failedPinAttempts: 0, isLocked: false, lastPinChangedAt: '2026-01-01T00:00:00.000Z', signatureType: 'TYPOGRAPHIC', signatureStyle: 'MODERN_SANS', signatureInitials: 'KIT-FIN', hasRegisteredSignature: true, certificateSerial: 'CERT-2026-FN008', permissions: ['DAR_CREATE', 'TASK_ACCESS', 'VIEW_REGISTER'], canCreateDar: true, canAccessTasks: true, canViewRegister: true, isWorkflowUser: true },
  { id: 'U009', empId: 'EMP-009', name: 'คุณนัท', fullName: 'คุณนัท', email: 'nut.md@company.com', position: 'Managing Director', level: 8, approval_level: 8, role: 'DEPT_ADMIN', isDcc: false, isQmr: false, depts: ['EXEC'], department: 'EXEC', dept: 'EXEC', primary_department: 'EXEC', affiliated_departments: ['EXEC'], status: 'ACTIVE', pin: '123456', failedPinAttempts: 0, isLocked: false, lastPinChangedAt: '2026-01-01T00:00:00.000Z', signatureType: 'TYPOGRAPHIC', signatureStyle: 'CLASSIC_CALLIGRAPHY', signatureInitials: 'NUT-MD', hasRegisteredSignature: true, certificateSerial: 'CERT-2026-EX009', permissions: ['DAR_CREATE', 'TASK_ACCESS', 'VIEW_REGISTER'], canCreateDar: true, canAccessTasks: true, canViewRegister: true, isWorkflowUser: true },
  { id: 'U010', empId: 'EMP-010', name: 'สมชาย การตลาด', fullName: 'สมชาย การตลาด', email: 'somchai.mkt@company.com', position: 'Sales Executive', level: 3, approval_level: 3, role: 'GENERAL_USER', isDcc: false, isQmr: false, depts: ['MKT'], department: 'MKT', dept: 'MKT', primary_department: 'MKT', affiliated_departments: ['MKT'], status: 'ACTIVE', pin: '123456', failedPinAttempts: 0, isLocked: false, lastPinChangedAt: '2026-01-01T00:00:00.000Z', signatureType: 'TYPOGRAPHIC', signatureStyle: 'MODERN_SANS', signatureInitials: 'SCM-MKT', hasRegisteredSignature: true, certificateSerial: 'CERT-2026-MK010', permissions: ['DAR_CREATE', 'TASK_ACCESS', 'VIEW_REGISTER'], canCreateDar: true, canAccessTasks: true, canViewRegister: true, isWorkflowUser: true }
];

export const REQUEST_MASTER_DATA_USER = MASTER_DATA_USER.map(u => ({ 
  id: u.id, 
  empId: u.empId || u.id, 
  name: u.name, 
  depts: u.affiliated_departments || u.depts, 
  affiliated_departments: u.affiliated_departments || u.depts, 
  department: u.primary_department || u.department, 
  primary_department: u.primary_department || u.department, 
  level: u.approval_level || u.level, 
  approval_level: u.approval_level || u.level 
}));

export const REVIEW_MASTER_DATA_USER = [...REQUEST_MASTER_DATA_USER];
export const APPROVE_MASTER_DATA_USER = [...REQUEST_MASTER_DATA_USER];

// 2. Mock Document Formats
export const MOCK_DOC_FORMATS = [
  { id: 1, format: 'WI-[YY]-[RUN_NO]' },
  { id: 2, format: 'MN-[YY]-[RUN_NO]' },
];

// 3. Mock DARs
export const MOCK_DARS = [
  {
    id: 'DAR-MOCK-1',
    darNo: 'DAR-2607-001',
    type: 'NEW',
    title: 'MN-QA-001',
    name: 'คู่มือคุณภาพ (Quality Manual)',
    status: 'PENDING_REVIEW',
    department: 'QA/QC',
    requesterId: 'U005',
    requestDate: '2026-07-01T08:00:00Z',
    reason: 'จัดทำคู่มือคุณภาพฉบับใหม่ให้สอดคล้องกับนโยบาย',
    reviewerId: 'U003',
    approverId: 'U009'
  },
  {
    id: 'DAR-MOCK-2',
    darNo: 'DAR-2607-002',
    type: 'REVISION',
    title: 'SOP-WH-002',
    name: 'ขั้นตอนการรับสินค้าเข้าคลัง',
    status: 'PENDING_APPROVAL',
    department: 'WH',
    requesterId: 'U001',
    requestDate: '2026-06-25T08:00:00Z',
    reason: 'ปรับปรุงขั้นตอนการตรวจสอบพาเลท',
    reviewerId: 'U005',
    approverId: 'U004',
    docId: 'DOC-MOCK-WH-002',
    revisesRev: '02'
  },
  {
    id: 'DAR-MOCK-3',
    darNo: 'DAR-2607-003',
    dar_no: 'DAR-2607-003',
    type: 'OBSOLETE',
    request_type: 'OBSOLETE',
    title: 'WI-PD-010',
    doc_code: 'WI-PD-010',
    name: 'การใช้งานเครื่องซีลถุง',
    status: 'PENDING_DCC',
    department: 'PD',
    requesterId: 'U001',
    requestDate: '2026-07-08T08:00:00Z',
    reason: 'ยกเลิกเครื่องจักร เลิกผลิต',
    reviewerId: 'U003',
    approverId: 'U004',
    docId: 'DOC-MOCK-PD-010',
    revision: '05',
    targetRevision: '05',
    rev: '05',
    docRev: '05'
  },
  {
    id: 'DAR-2026-005',
    darNo: 'DAR-2026-005',
    dar_no: 'DAR-2026-005',
    type: 'OBSOLETE',
    request_type: 'OBSOLETE',
    title: 'SOP-PD-01',
    doc_code: 'SOP-PD-01',
    name: 'ขั้นตอนการผลิตสาย 1',
    status: 'UNDER_REVIEW',
    department: 'PD',
    requesterId: 'u1',
    requester_name: 'ธนาวุฒิ สมควรกิจดำรง',
    requestDate: '2026-09-24T08:00:00Z',
    reason: 'ยกเลิกสายการผลิตเดิม ปรับปรุงเป็นกระบวนการผลิตอัตโนมัติเต็มรูปแบบ',
    reviewerId: 'u2',
    approverId: 'u3',
    revision: '03',
    targetRevision: '03',
    rev: '03',
    docRev: '03'
  },
  {
    id: 'DAR-2026-001',
    darNo: 'DAR-2026-001',
    dar_no: 'DAR-2026-001',
    darNumber: 'DAR-2026-001',
    docId: 'WI-QC-01_REV_00',
    doc_id: 'WI-QC-01_REV_00',
    title: 'WI-QC-01',
    document_code: 'WI-QC-01',
    doc_code: 'WI-QC-01',
    docNo: 'WI-QC-01',
    docTitle: 'WI-QC-01',
    document_title: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
    docName: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
    name: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
    type: 'NEW_DOCUMENT',
    docType: 'WI',
    doc_type: 'WI',
    revision: '00',
    target_revision: '00',
    targetRevision: '00',
    rev: '00',
    assignee_department: 'DC',
    department: 'QC',
    dept: 'QC',
    status: 'COMPLETED',
    reason: 'จัดทำคู่มือปฏิบัติงานการตรวจสอบคุณภาพวัตถุดิบรับเข้าฉบับแรก (Genesis Rev.00)',
    effectiveDate: '2025-01-15',
    effective_date: '2025-01-15',
    requesterId: 'U005',
    requesterName: 'บีม',
    requester_department: 'QC',
    requesterDepartment: 'QC',
    reviewerId: 'U003',
    reviewerName: 'กัลยาณี',
    approverId: 'U004',
    approverName: 'คุณเรย์'
  },
  {
    id: 'DAR-2026-002',
    darNo: 'DAR-2026-002',
    dar_no: 'DAR-2026-002',
    darNumber: 'DAR-2026-002',
    docId: 'WI-QC-01_REV_01',
    doc_id: 'WI-QC-01_REV_01',
    title: 'WI-QC-01',
    document_code: 'WI-QC-01',
    doc_code: 'WI-QC-01',
    docNo: 'WI-QC-01',
    docTitle: 'WI-QC-01',
    document_title: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
    docName: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
    name: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
    type: 'REVISION',
    docType: 'WI',
    doc_type: 'WI',
    revision: '01',
    target_revision: '01',
    targetRevision: '01',
    currentRevision: '00',
    previous_revision: '00',
    rev: '01',
    department: 'QC',
    dept: 'QC',
    status: 'COMPLETED',
    reason: 'ปรับปรุงเกณฑ์การชักตัวอย่างและการตรวจปล่อยวัตถุดิบ Rev.01',
    effectiveDate: '2025-06-20',
    effective_date: '2025-06-20',
    requesterId: 'U005',
    requesterName: 'บีม',
    reviewerId: 'U003',
    reviewerName: 'กัลยาณี',
    approverId: 'U004',
    approverName: 'คุณเรย์'
  },
  {
    id: 'DAR-2026-003',
    darNo: 'DAR-2026-003',
    dar_no: 'DAR-2026-003',
    darNumber: 'DAR-2026-003',
    docId: 'WI-QC-01_REV_02',
    doc_id: 'WI-QC-01_REV_02',
    title: 'WI-QC-01',
    document_code: 'WI-QC-01',
    doc_code: 'WI-QC-01',
    docNo: 'WI-QC-01',
    docTitle: 'WI-QC-01',
    document_title: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
    docName: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
    name: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
    type: 'REVISION',
    docType: 'WI',
    doc_type: 'WI',
    revision: '02',
    target_revision: '02',
    targetRevision: '02',
    currentRevision: '01',
    previous_revision: '01',
    rev: '02',
    department: 'QC',
    dept: 'QC',
    status: 'COMPLETED',
    reason: 'ปรับปรุงขั้นตอนการทดสอบทางจุลชีววิทยาและสารตกค้าง Rev.02 ฉบับปัจจุบัน',
    effectiveDate: '2026-03-01',
    effective_date: '2026-03-01',
    requesterId: 'U005',
    requesterName: 'บีม',
    reviewerId: 'U003',
    reviewerName: 'กัลยาณี',
    approverId: 'U004',
    approverName: 'คุณเรย์'
  }
];

// 4. Mock Tasks
export const MOCK_TASKS = [
  {
    id: 'TASK-MOCK-1',
    type: 'REVIEW',
    darId: 'DAR-MOCK-1',
    docId: 'DOC-MOCK-QA-001',
    docCode: 'MN-QA-001',
    doc_code: 'MN-QA-001',
    docTitle: 'คู่มือคุณภาพ (Quality Manual)',
    docName: 'คู่มือคุณภาพ (Quality Manual)',
    title: 'ทบทวนคำร้อง (Review DAR) - MN-QA-001',
    assigneeId: 'U003',
    department: 'QA',
    target_department: 'QA',
    owner_dept: 'QA',
    currentHandlerDepartment: 'QA',
    status: 'PENDING',
    createdAt: '2026-07-01T08:00:00Z',
    dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // Due Soon (in 2 days)
  },
  {
    id: 'TASK-MOCK-2',
    type: 'APPROVE',
    darId: 'DAR-MOCK-2',
    docId: 'DOC-MOCK-WH-002',
    docCode: 'SOP-WH-002',
    doc_code: 'SOP-WH-002',
    docTitle: 'ขั้นตอนการรับสินค้าเข้าคลัง',
    docName: 'ขั้นตอนการรับสินค้าเข้าคลัง',
    title: 'อนุมัติคำร้อง (Approve DAR) - SOP-WH-002',
    assigneeId: 'U004',
    department: 'WH',
    target_department: 'WH',
    owner_dept: 'WH',
    currentHandlerDepartment: 'WH',
    status: 'PENDING',
    createdAt: '2026-06-25T08:00:00Z',
    dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // Overdue (5 days ago)
  },
  {
    id: 'TASK-MOCK-3',
    type: 'DCC_ACTION',
    darId: 'DAR-MOCK-3',
    docId: 'DOC-MOCK-PD-010',
    docCode: 'WI-PD-010',
    doc_code: 'WI-PD-010',
    docTitle: 'การใช้งานเครื่องซีลถุง',
    docName: 'การใช้งานเครื่องซีลถุง',
    title: 'ดำเนินการอัปเดตระบบ (DCC Action) - WI-PD-010',
    assigneeId: 'U001',
    department: 'PD',
    target_department: 'PD',
    owner_dept: 'PD',
    currentHandlerDepartment: 'PD',
    status: 'PENDING',
    createdAt: '2026-07-08T08:00:00Z',
    dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // Normal
  },
  {
    id: 'TASK-MOCK-4',
    type: 'ACKNOWLEDGE',
    docId: 'DOC-MOCK-1', // SOP-PD-001
    docCode: 'SOP-PD-001',
    doc_code: 'SOP-PD-001',
    docTitle: 'มาตรฐานการควบคุมเครื่องตรวจจับโลหะ (Metal Detector)',
    docName: 'มาตรฐานการควบคุมเครื่องตรวจจับโลหะ (Metal Detector)',
    title: 'รับทราบการประกาศใช้เอกสารใหม่ - SOP-PD-001',
    assigneeId: 'U001',
    department: 'PD',
    target_department: 'PD',
    owner_dept: 'PD',
    currentHandlerDepartment: 'PD',
    status: 'PENDING',
    createdAt: '2026-07-05T08:00:00Z',
    dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // Overdue by 1 day
  }
];

// 5. Mock Timeline
export const MOCK_TIMELINE = [
  {
    id: 'TL-1',
    darId: 'DAR-MOCK-2',
    action: 'SUBMIT',
    actor: 'U001',
    timestamp: '2026-06-25T08:00:00Z',
    comment: 'ปรับปรุงขั้นตอนการตรวจสอบพาเลท'
  },
  {
    id: 'TL-2',
    darId: 'DAR-MOCK-2',
    action: 'REVIEW',
    actor: 'U005',
    timestamp: '2026-06-26T10:00:00Z',
    comment: 'ตรวจสอบความถูกต้องเรียบร้อย'
  }
];

// 6. Mock Documents
export const MOCK_DOCUMENTS = [
  {
    id: 'DOC-MOCK-1',
    title: 'SOP-PD-001',
    name: 'มาตรฐานการควบคุมเครื่องตรวจจับโลหะ (Metal Detector)',
    status: 'EFFECTIVE',
    department: 'PD',
    ownerId: 'U003', // Document Owner (Production Assistant Manager)
    effectiveDate: '2025-07-16', // Due Soon (7 days left for 12 months)
    rev: '01',
    access_control: {
      scope: 'GENERAL',
      authorized_depts: [],
      authorized_users: [],
      min_access_level: 1
    }
  },
  {
    id: 'DOC-MOCK-2',
    title: 'WI-PD-015',
    name: 'ขั้นตอนการล้างทำความสะอาดข้าวเหนียว',
    status: 'EFFECTIVE',
    department: 'PD',
    ownerId: 'U003',
    effectiveDate: '2025-05-25', // Overdue (Escalated)
    rev: '01',
    access_control: {
      scope: 'DEPT_ONLY',
      authorized_depts: ['PD'],
      authorized_users: [],
      min_access_level: 1
    }
  },
  {
    id: 'DOC-MOCK-WH-002',
    title: 'SOP-WH-002',
    name: 'ขั้นตอนการรับสินค้าเข้าคลัง',
    status: 'EFFECTIVE',
    department: 'WH',
    ownerId: 'U005',
    effectiveDate: '2024-11-20',
    rev: '02',
    access_control: {
      scope: 'TARGETED',
      authorized_depts: ['WH', 'PD', 'QA/QC'],
      authorized_users: [],
      min_access_level: 1
    }
  },
  {
    id: 'DOC-MOCK-PD-010',
    title: 'WI-PD-010',
    name: 'การใช้งานเครื่องซีลถุง',
    status: 'EFFECTIVE',
    department: 'PD',
    ownerId: 'U003',
    effectiveDate: '2024-03-10',
    rev: '05',
    access_control: {
      scope: 'RESTRICTED',
      authorized_depts: ['PD'],
      authorized_users: ['U001', 'U003'],
      min_access_level: 4
    }
  },
  {
    id: 'WI-QC-01_REV_00',
    title: 'WI-QC-01',
    document_code: 'WI-QC-01',
    doc_code: 'WI-QC-01',
    code: 'WI-QC-01',
    docNo: 'WI-QC-01',
    docCode: 'WI-QC-01',
    docTitle: 'WI-QC-01',
    name: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
    docName: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
    status: 'SUPERSEDED',
    is_superseded: true,
    is_active: false,
    department: 'QC',
    dept: 'QC',
    ownerId: 'U005',
    effectiveDate: '2025-01-15',
    effective_date: '2025-01-15',
    superseded_at: '2025-06-20T09:00:00.000Z',
    supersededAt: '2025-06-20T09:00:00.000Z',
    supersededByRev: '01',
    rev: '00',
    revision: '00',
    doc_version: '00',
    darId: 'DAR-2026-001',
    darNo: 'DAR-2026-001',
    darNumber: 'DAR-2026-001',
    darRef: 'DAR-2026-001',
    latestDarNo: 'DAR-2026-001',
    access_control: {
      scope: 'GENERAL',
      authorized_depts: [],
      authorized_users: [],
      min_access_level: 1
    }
  },
  {
    id: 'WI-QC-01_REV_01',
    title: 'WI-QC-01',
    document_code: 'WI-QC-01',
    doc_code: 'WI-QC-01',
    code: 'WI-QC-01',
    docNo: 'WI-QC-01',
    docCode: 'WI-QC-01',
    docTitle: 'WI-QC-01',
    name: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
    docName: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
    status: 'SUPERSEDED',
    is_superseded: true,
    is_active: false,
    department: 'QC',
    dept: 'QC',
    ownerId: 'U005',
    effectiveDate: '2025-06-20',
    effective_date: '2025-06-20',
    superseded_at: '2026-03-01T08:30:00.000Z',
    supersededAt: '2026-03-01T08:30:00.000Z',
    supersededByRev: '02',
    rev: '01',
    revision: '01',
    doc_version: '01',
    darId: 'DAR-2026-002',
    darNo: 'DAR-2026-002',
    darNumber: 'DAR-2026-002',
    darRef: 'DAR-2026-002',
    latestDarNo: 'DAR-2026-002',
    access_control: {
      scope: 'GENERAL',
      authorized_depts: [],
      authorized_users: [],
      min_access_level: 1
    }
  },
  {
    id: 'WI-QC-01_REV_02',
    title: 'WI-QC-01',
    document_code: 'WI-QC-01',
    doc_code: 'WI-QC-01',
    code: 'WI-QC-01',
    docNo: 'WI-QC-01',
    docCode: 'WI-QC-01',
    docTitle: 'WI-QC-01',
    name: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
    docName: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
    status: 'EFFECTIVE',
    is_superseded: false,
    is_active: true,
    department: 'QC',
    dept: 'QC',
    ownerId: 'U005',
    effectiveDate: '2026-03-01',
    effective_date: '2026-03-01',
    rev: '02',
    revision: '02',
    doc_version: '02',
    darId: 'DAR-2026-003',
    darNo: 'DAR-2026-003',
    darNumber: 'DAR-2026-003',
    darRef: 'DAR-2026-003',
    latestDarNo: 'DAR-2026-003',
    access_control: {
      scope: 'GENERAL',
      authorized_depts: [],
      authorized_users: [],
      min_access_level: 1
    }
  }
];

// 7. Mock Controlled Copy Instances
export const MOCK_CONTROLLED_COPY_INSTANCES = [
  {
    id: 'CC-MOCK-1',
    doc_id: 'DOC-MOCK-1',
    docId: 'DOC-MOCK-1',
    doc_code: 'WI-PD-001',
    docTitle: 'WI-PD-001',
    docName: 'ขั้นตอนการล้างทำความสะอาดเครื่องผสม',
    doc_version: '01',
    rev: '01',
    copy_no: '01',
    ccNumber: 'CC-001',
    issue_no: '01',
    issueNumber: 'I01',
    holder_dept: 'PD',
    department: 'PD',
    departmentId: 'PD',
    holder_name: 'PD (ฝ่ายผลิต)',
    holderId: 'PD',
    location: 'Line 1 - Mixing (ห้องผสม)',
    locationName: 'Line 1 - Mixing (ห้องผสม)',
    status: 'ISSUED_ACTIVE',
    is_replacement: false,
    dispatched_at: '2025-07-17T08:00:00Z',
    dispatched_by: 'ธนาวุฒิ สมควรกิจดำรง (DCC)',
    dateIssued: '2025-07-17',
    receipt_confirmed_at: '2025-07-17T09:30:00Z',
    receipt_confirmed_by: 'กัลยาณี พลไกร',
    receipt_remarks: 'Verified physical stamp and station binder',
    recall_task_id: null
  },
  {
    id: 'CC-MOCK-2',
    doc_id: 'DOC-MOCK-WH-002',
    docId: 'DOC-MOCK-WH-002',
    doc_code: 'WI-WH-002',
    docTitle: 'WI-WH-002',
    docName: 'ขั้นตอนการจัดเก็บวัตถุดิบและสารก่อภูมิแพ้',
    doc_version: '02',
    rev: '02',
    copy_no: '01',
    ccNumber: 'CC-001',
    issue_no: '01',
    issueNumber: 'I01',
    holder_dept: 'WH',
    department: 'WH',
    departmentId: 'WH',
    holder_name: 'WH (ฝ่ายคลังสินค้าและโลจิสติกส์)',
    holderId: 'WH',
    location: 'คลังสินค้าวัตถุดิบ RM Store',
    locationName: 'คลังสินค้าวัตถุดิบ RM Store',
    status: 'DISPATCHED_PENDING_RECEIPT',
    is_replacement: false,
    dispatched_at: '2026-07-08T10:00:00Z',
    dispatched_by: 'ธนาวุฒิ สมควรกิจดำรง (DCC)',
    dateIssued: '2026-07-08',
    receipt_confirmed_at: null,
    receipt_confirmed_by: null,
    receipt_remarks: null,
    recall_task_id: null
  }
];

// 8. Initial System Notifications
export const INITIAL_NOTIFICATIONS = [
  {
    id: 'noti-init-sys-01',
    title: 'ยินดีต้อนรับสู่ระบบ QMS Portal',
    message: 'ระบบศูนย์ควบคุมเอกสารคุณภาพและบันทึกพร้อมให้บริการตามมาตรฐาน ISO 9001:2015',
    link: '/portal',
    type: 'INFO',
    category: 'SYSTEM',
    isGlobal: true,
    isRead: false,
    read: false,
    readBy: [],
    timestamp: new Date().toISOString()
  },
  {
    id: 'noti-init-ext-01',
    userId: 'U003',
    targetUserIds: ['U003'],
    title: 'มีเอกสารภายนอกรอการทบทวน',
    message: 'คำร้อง EDR-2026-0001 (Compendium of Methods for the Microbiological Examination of Foods) รอให้คุณดำเนินการทบทวน',
    link: '/dcc/tasks',
    type: 'TASK_ASSIGNED',
    category: 'EXTERNAL_DOC',
    isRead: false,
    read: false,
    readBy: [],
    timestamp: new Date().toISOString()
  },
  {
    id: 'noti-init-ext-02',
    userId: 'U004',
    targetUserIds: ['U004'],
    title: 'มีเอกสารภายนอกรอการอนุมัติ',
    message: 'คำร้อง EDR-2026-0002 (ประกาศกระทรวงสาธารณสุข ฉบับที่ 444 (พ.ศ. 2566)) ผ่านการทบทวนแล้ว รอให้คุณพิจารณาอนุมัติ',
    link: '/dcc/tasks',
    type: 'TASK_ASSIGNED',
    category: 'EXTERNAL_DOC',
    isRead: false,
    read: false,
    readBy: [],
    timestamp: new Date().toISOString()
  },
  {
    id: 'noti-init-ext-03',
    userId: 'U005',
    targetUserIds: ['U005'],
    title: 'คำร้องเอกสารภายนอกถูกส่งกลับแก้ไข',
    message: 'คำร้อง EDR-2026-0004 ถูกส่งกลับแก้ไขโดย กัลยาณี พลไกร: กรุณาแนบไฟล์มาตรฐานฉบับแปลภาษาไทยเพิ่มเติม',
    link: '/dcc/external/my-requests?id=EDR-2026-0004',
    type: 'ACTION_REQUIRED',
    category: 'EXTERNAL_DOC',
    isRead: false,
    read: false,
    readBy: [],
    timestamp: new Date().toISOString()
  },
  {
    id: 'noti-init-ext-04',
    userId: 'U005',
    targetUserIds: ['U005'],
    title: 'คำร้องเอกสารภายนอกได้รับการอนุมัติแล้ว',
    message: 'เอกสาร ED-QA-03 (Compendium of Methods for the Microbiological Examination of Foods) ได้รับการอนุมัติและขึ้นทะเบียนในคลังเรียบร้อยแล้ว',
    link: '/dcc/external/my-requests?id=EDR-2026-0001',
    type: 'SUCCESS',
    category: 'EXTERNAL_DOC',
    isRead: false,
    read: false,
    readBy: [],
    timestamp: new Date().toISOString()
  },
  {
    id: 'noti-init-ext-05',
    userId: 'U005',
    targetUserIds: ['U005'],
    title: 'มีสำเนาควบคุมใหม่รอตรวจรับ',
    message: 'กรุณาตรวจรับสำเนาเล่ม 01 สำหรับเอกสาร ED-QA-03',
    link: '/dcc/tasks',
    type: 'TASK_ASSIGNED',
    category: 'EXTERNAL_DOC',
    isRead: false,
    read: false,
    readBy: [],
    timestamp: new Date().toISOString()
  }
];

// Semantic Aliases for clean external fixture consumption
export const initialUsers = MASTER_DATA_USER;
export const initialDocuments = MOCK_DOCUMENTS;
export const initialExternalDocuments = [];
export const initialDarRequests = MOCK_DARS;
export const initialTasks = MOCK_TASKS;
export const initialTimeline = MOCK_TIMELINE;
export const initialControlledCopyInstances = MOCK_CONTROLLED_COPY_INSTANCES;
export const initialNotifications = INITIAL_NOTIFICATIONS;

