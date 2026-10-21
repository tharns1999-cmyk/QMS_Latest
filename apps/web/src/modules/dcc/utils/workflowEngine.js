/**
 * workflowEngine.js
 *
 * Rule-Based Workflow Generator & Dynamic Signatory Route Engine
 * Enforces dynamic, department-aware routing without hardcoded fallback names.
 */

import { isSameDepartment } from './taskFilter';
import { getApprovalThresholds } from './workflowResolver';

export const generateDynamicWorkflow = (requesterUser, docDepartment, allUsers = [], docType, approvalMatrix) => {
  if (!requesterUser || !docDepartment) return [];

  // Helper ตรวจสอบแผนก (ครอบคลุมทั้งหลักและรอง)
  const isMatchDept = (u, dept) => {
    if (!u || !dept) return false;
    const targetDept = String(dept).toUpperCase().trim();
    const uDept = String(u.department || u.dept || u.primaryDepartment || u.primary_department || '').toUpperCase().trim();
    if (isSameDepartment(uDept, targetDept)) return true;
    if (Array.isArray(u.secondaryDepartments) && u.secondaryDepartments.some(d => isSameDepartment(d, targetDept))) return true;
    if (Array.isArray(u.departments) && u.departments.some(d => isSameDepartment(d, targetDept))) return true;
    if (Array.isArray(u.depts) && u.depts.some(d => isSameDepartment(d, targetDept))) return true;
    if (Array.isArray(u.affiliated_departments) && u.affiliated_departments.some(d => isSameDepartment(d, targetDept))) return true;
    return false;
  };

  const isActive = (u) => {
    if (!u) return false;
    if (!u.status) return true;
    return String(u.status).toUpperCase() === 'ACTIVE';
  };

  // 1. ผู้จัดทำ (Step 1 - Requester)
  const step1 = {
    step: 1,
    role: 'REQUESTER',
    userId: requesterUser.id || requesterUser.userId || requesterUser.empId,
    userName: requesterUser.name || requesterUser.fullName || '',
    position: requesterUser.position || requesterUser.role || '',
    status: 'COMPLETED',
    timestamp: new Date().toISOString()
  };

  // เกณฑ์ระดับมาจาก Approval Matrix (ตั้งค่าได้ที่ SLA Hub) เป็นแหล่งเดียว
  const { minReviewerLevel, minApproverLevel } = getApprovalThresholds(docType, approvalMatrix);
  const levelOf = (u) => Number(u.level || u.approval_level) || 0;
  // Segregation of duties: ผู้จัดทำห้ามเป็นผู้ทบทวน/ผู้อนุมัติงานของตนเอง
  const isNotRequester = (u) => (u.id || u.userId) !== step1.userId;
  // Same rule as the server (apps/api/src/approval.js): a signer belongs to the owning department or is cross-org
  // (QMR, L6+, MGMT/EXEC), and DCC staff only sign for DC. Routing anyone else gets the request refused.
  const isCrossOrg = (u) => Boolean(u.isQmr) || levelOf(u) >= 6 ||
    ['MGMT', 'EXEC', 'QMR'].some((d) => [u.department, u.dept, u.primary_department, ...(u.depts || [])].some((x) => String(x || '').toUpperCase() === d));
  const maySign = (u) => (!(u.isDcc || u.role === 'DCC_ADMIN') || String(docDepartment).toUpperCase() === 'DC') && (isMatchDept(u, docDepartment) || isCrossOrg(u));

  // 2. ค้นหาผู้ทบทวน (Step 2 - ผู้มีระดับต่ำสุดที่ผ่านเกณฑ์ในแผนกเดียวกัน)
  let reviewerUser = allUsers
    .filter(u => isActive(u) && isNotRequester(u) && levelOf(u) >= minReviewerLevel && isMatchDept(u, docDepartment))
    .sort((a, b) => levelOf(a) - levelOf(b))[0];

  // Fallback: หากแผนกนั้นไม่มีผู้ผ่านเกณฑ์ ให้ใช้ผู้บริหารฝ่ายคุณภาพ/ตัวแทนฝ่ายบริหาร (MGMT / L6)
  if (!reviewerUser) {
    reviewerUser = allUsers.find(u =>
      isActive(u) && isNotRequester(u) && maySign(u) &&
      (u.department === 'MGMT' || u.dept === 'MGMT' || u.role === 'QMR' || u.isQmr || levelOf(u) === 6)
    );
  }

  const step2 = {
    step: 2,
    role: 'REVIEWER',
    userId: reviewerUser?.id || reviewerUser?.userId || null,
    userName: reviewerUser?.name || reviewerUser?.fullName || '',
    position: reviewerUser?.position || reviewerUser?.role || '',
    status: 'PENDING',
    timestamp: null
  };

  // 3. ค้นหาผู้อนุมัติ (Step 3 - ระดับตามเกณฑ์ Approval Matrix, เน้น MGMT/EXEC)
  const reviewerUserId = reviewerUser?.id || reviewerUser?.userId;
  const canApprove = (u) => isActive(u) && isNotRequester(u) && maySign(u) && levelOf(u) >= minApproverLevel && (u.id || u.userId) !== reviewerUserId;
  let approverUser = allUsers.find(u =>
    canApprove(u) &&
    (u.department === 'MGMT' || u.department === 'EXEC' || u.dept === 'MGMT' || u.dept === 'EXEC')
  );

  // Fallback: หากไม่พบใน MGMT/EXEC ให้ค้นหาผู้ผ่านเกณฑ์คนอื่นที่ไม่ใช่ reviewer
  if (!approverUser) {
    approverUser = allUsers.find(canApprove);
  }

  const step3 = {
    step: 3,
    role: 'APPROVER',
    userId: approverUser?.id || approverUser?.userId || null,
    userName: approverUser?.name || approverUser?.fullName || '',
    position: approverUser?.position || approverUser?.role || '',
    status: 'PENDING',
    timestamp: null
  };

  return [step1, step2, step3];
};
