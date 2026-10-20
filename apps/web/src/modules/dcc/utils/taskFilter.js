/**
 * Role-Based Actionable Task Scoping and Filtering Engine
 * 
 * Ensures that operational tasks (Distribution, Recall, Register, Replacement)
 * are strictly restricted to DCC Admin and DC staff.
 * Prevents task leaks to Executive, QMR, or other department members.
 * Enforces that personal task inboxes and sidebar badge counts only reflect
 * actionable tasks assigned to or waiting on the current user.
 */

export const isDccAdmin = (user) => {
  if (!user) return false;
  return Boolean(
    user.role === 'DCC_ADMIN' ||
    user.isDccAdmin === true ||
    (Array.isArray(user.permissions) && user.permissions.includes('DCC_ADMIN')) ||
    user.role === 'SUPER_ADMIN' ||
    (user.isDcc === true && !['GENERAL_USER', 'DEPT_ADMIN', 'DCC_STAFF', 'APPROVER', 'REVIEWER', 'MGMT'].includes(user.role))
  );
};

export const isDccExclusiveTask = (task) => {
  if (!task) return false;
  const normType = (task.type || task.taskType || task.task_type || task.category || '').toUpperCase();
  const title = String(task.title || '');

  const isDist = 
    normType === 'DISTRIBUTION' ||
    normType === 'DCC_DISTRIBUTE' ||
    normType === 'DCC_ISSUE' ||
    normType === 'DCC_ISSUE_CONTROLLED_COPIES' ||
    normType === 'DCC_REPLACEMENT' ||
    task.taskType === 'DISTRIBUTION' ||
    task.taskType === 'DCC_ISSUE_CONTROLLED_COPIES' ||
    title.includes('แจกจ่าย') ||
    title.includes('จัดพิมพ์และส่งมอบ') ||
    title.includes('ขอออกสำเนาควบคุมเพิ่มเติม') ||
    title.includes('ออกสำเนาควบคุมทดแทน');

  const isRecall = 
    normType === 'RECALL' ||
    normType === 'DCC_RECALL' ||
    normType === 'DCC_RECALL_WITH_CHECKLIST' ||
    normType === 'RECALL_HARDCOPY' ||
    normType === 'OBSOLETE_RECALL' ||
    task.taskType === 'RECALL' ||
    task.taskType === 'DCC_RECALL_WITH_CHECKLIST' ||
    title.includes('เรียกคืน') ||
    title.includes('Recall');

  // ISO 9001 Clause 7.5.3 – Custody workflow (Relocation & Return)
  // Exclusively actionable by DCC Admin. Never visible to other departments.
  const isCustody =
    normType === 'DCC_RELOCATE' ||
    normType === 'DCC_RETURN' ||
    task.taskType === 'DCC_RELOCATE' ||
    task.taskType === 'DCC_RETURN';

  return isDist || isRecall || isCustody;
};

export const isDccUser = (user) => {
  if (!user) return false;
  return Boolean(
    user.isDcc || 
    user.role === 'DCC_ADMIN' || 
    user.role === 'DCC_STAFF' || 
    user.role === 'SUPER_ADMIN' || 
    user.department === 'DC' || 
    user.dept === 'DC' ||
    user.primary_department === 'DC' ||
    (user.affiliated_departments && (user.affiliated_departments.includes('DC') || user.affiliated_departments.includes('DCC'))) ||
    (user.depts && (user.depts.includes('DC') || user.depts.includes('DCC')))
  );
};

export const isDccOperationalTask = (task) => {
  if (!task) return false;
  const normType = (task.type || task.taskType || task.task_type || task.category || '').toUpperCase();
  return (
    isDccExclusiveTask(task) ||
    [
      'DCC_CHECK', 'DCC_REGISTER', 'DCC_DISTRIBUTE', 'DCC_RECALL',
      'DISTRIBUTION', 'RECALL', 'DCC_ACTION', 'DCC_ISSUE',
      'DCC_RECALL_WITH_CHECKLIST', 'RECALL_HARDCOPY',
      'CC_REPLACEMENT_APPROVAL', 'DCC_REPLACEMENT', 'DCC_ISSUE_CONTROLLED_COPIES'
    ].includes(normType) ||
    normType.startsWith('DCC_') ||
    task.assignedToRole === 'DCC_ADMIN' ||
    task.assignedToRole === 'DCC_STAFF' ||
    task.target_role === 'DCC' ||
    task.targetRole === 'DCC_ADMIN'
  );
};

/**
 * Canonicalizes department identifiers to their standard Master Data code:
 * QA / QA/QC / QAQC / QC -> 'QC'
 * DCC / DC -> 'DC'
 * HR / GA -> 'HR&GA'
 * Strips descriptive Thai text if attached (e.g. 'QA/QC - ฝ่ายประกัน...' -> 'QC', 'QC (Quality Control)' -> 'QC')
 */
export const normalizeCanonicalDept = (dept) => {
  if (!dept) return '';
  if (typeof dept !== 'string') {
    dept = dept.code || dept.id || dept.department || dept.dept || dept.dept_code || '';
  }
  let str = String(dept).trim();
  if (!str) return '';

  // Extract leading acronym if combined e.g. "QA/QC - ฝ่ายประกัน..." -> "QA/QC", "QC - ฝ่าย..." -> "QC"
  if (str.includes('-')) {
    const firstPart = str.split('-')[0].trim();
    if (firstPart && firstPart.length <= 10) {
      str = firstPart;
    }
  }

  const clean = str.replace(/[^a-zA-Z0-9&]/g, '').toUpperCase();
  if (clean === 'DCC' || clean === 'DC') return 'DC';
  if (
    clean === 'QA' ||
    clean === 'QAQC' ||
    clean === 'QC' ||
    clean === 'QASUPER' ||
    clean.startsWith('QAQC') ||
    clean.startsWith('QC') ||
    clean.startsWith('QASUPER')
  ) {
    return 'QC';
  }
  if (clean === 'HR' || clean === 'GA' || clean === 'HRGA') {
    return 'HR&GA';
  }
  return str.toUpperCase();
};

export const normalizeDept = normalizeCanonicalDept;

/**
 * Compares two department identifiers with normalization and alias equivalence (QA <-> QA/QC <-> QC)
 */
export const isSameDepartment = (deptA, deptB) => {
  if (!deptA || !deptB) return false;
  const a = normalizeCanonicalDept(deptA);
  const b = normalizeCanonicalDept(deptB);
  if (a && b && a === b) return true;
  return false;
};

/**
 * Checks if a user belongs to a target department (primary, department, depts, or affiliated_departments)
 */
export const userMatchesDepartment = (user, dept) => {
  if (!user || !dept) return false;
  
  if (Array.isArray(user.managedDepartments)) {
    if (user.managedDepartments.includes('*') || user.managedDepartments.some(d => isSameDepartment(d, dept))) return true;
  }

  const userDepts = [
    user.department,
    user.dept,
    user.primary_department,
    ...(user.depts || []),
    ...(user.affiliated_departments || [])
  ].filter(Boolean);
  return userDepts.some(d => isSameDepartment(d, dept));
};

/**
 * Extracts normalized numeric level from user (supports numbers, 'L6', 'Level 6', approval_level, etc.)
 */
export const getUserLevelNumber = (user) => {
  if (!user) return 1;
  const raw = user.level ?? user.approval_level ?? user.approvalLevel ?? '';
  const parsed = parseInt(String(raw).replace(/\D/g, ''), 10);
  return isNaN(parsed) ? 1 : parsed;
};

export const isLevel6Plus = (user) => {
  if (!user) return false;
  const role = String(user.role || '').toUpperCase();
  const pos = String(user.position || '').toUpperCase();
  if (role === 'EXECUTIVE' || role === 'MANAGING_DIRECTOR' || role === 'BOARD' || user.isExecutive) {
    return true;
  }
  if (pos.includes('MANAGING DIRECTOR') || pos.includes('GENERAL MANAGER') || pos.includes('EXECUTIVE') || pos.includes('DIRECTOR') || pos.includes('QMR/BOARD') || pos.includes('BOARD')) {
    return true;
  }
  return getUserLevelNumber(user) >= 6;
};

export const isLevel1To5 = (user) => {
  if (!user) return false;
  if (isLevel6Plus(user)) return false;
  const lvl = getUserLevelNumber(user);
  return lvl >= 1 && lvl < 6;
};

export const isReceiptTask = (task) => {
  if (!task) return false;
  const normType = (task.type || task.taskType || task.task_type || task.category || '').toUpperCase();
  const title = String(task.title || '');
  return (
    normType === 'RECEIPT' || 
    normType === 'DEPT_CONFIRM_HARDCOPY_RECEIPT' || 
    normType === 'CONFIRM_RECEIPT' ||
    task.category === 'RECEIPT' ||
    Boolean(task.id?.includes('task-receipt-')) ||
    title.includes('ตรวจรับ') ||
    title.includes('ตรวจรับเล่ม') ||
    title.includes('ตรวจรับสำเนา') ||
    title.includes('ตรวจรับเอกสาร')
  );
};

export const isActionableTask = (task, currentUser, documents = [], referenceDate = new Date()) => {
  if (!task || !currentUser) return false;

  // 1. Reactive completion filter: immediately drop completed or resolved tasks
  // Exception: DCC delivery tracking tasks (where delivery_status === 'DISPATCHED_TRACKING')
  // remain visible for DCC tracking in TaskInbox until all receipts are confirmed.
  if ((task.status === 'COMPLETED' || task.status === 'REJECTED' || task.status === 'RESOLVED' || task.is_completed === true) && task.delivery_status !== 'DISPATCHED_TRACKING') {
    return false;
  }

  const dccAdmin = isDccAdmin(currentUser);

  // 2. Strict DCC Admin Exclusive Task Gatekeeper (ISO 9001 Section 7.5.3):
  // Distribution (printing, binding, dispatch) and Recall (recall, destruction) tasks
  // are EXCLUSIVELY actionable by DCC Admin.
  // Non-DCC Admin users (QMR, GM, Executives, Dept Admins, general users)
  // MUST NEVER see Distribution or Recall tasks under ANY circumstances.
  if (isDccExclusiveTask(task)) {
    return dccAdmin;
  }

  const isDcc = isDccUser(currentUser);
  const isDccOp = isDccOperationalTask(task);

  // 3. Other DCC Operational Tasks:
  // Strictly scoped to DCC Admin or DC department staff only.
  // Executives, QMR, and other department users MUST NEVER see these in their inbox or badge counter.
  if (isDccOp) {
    return isDcc;
  }

  const userDepts = currentUser?.affiliated_departments || 
    currentUser?.depts || 
    (currentUser?.primary_department ? [currentUser.primary_department] : (currentUser?.department ? [currentUser.department] : []));
  const userApprovalLevel = Number(currentUser?.approval_level || currentUser?.level || 1);
  const normType = (task.type || task.taskType || task.task_type || task.category || '').toUpperCase();

  // 🛡️ Periodic Review & Verification Task Routing (ISO 9001 Clause 7.5.3)
  // External document verification is strictly routed to DCC or QA team members.
  if (normType === 'EXTERNAL_VERIFICATION' || task.taskType === 'EXTERNAL_VERIFICATION') {
    const isQa = userMatchesDepartment(currentUser, 'QA') || 
                 userMatchesDepartment(currentUser, 'QC') || 
                 userDepts.some(d => ['QA', 'QC', 'QA/QC'].includes(String(d).toUpperCase()));
    return isDcc || isQa;
  }

  // Internal document periodic review is routed to owner department (or designated assignee)
  if (normType === 'PERIODIC_REVIEW' || task.taskType === 'PERIODIC_REVIEW') {
    // 1. Completion guard
    if (task.status === 'COMPLETED' || task.status === 'REJECTED' || task.status === 'RESOLVED' || task.is_completed === true) {
      return false;
    }

    // 2. Strict 30-Day Due Window Enforcement (Just-In-Time Task Visibility)
    const docCode = task.document_code || task.doc_code || task.docCode || task.documentNumber;
    const docId = task.doc_id || task.docId || task.documentId;
    const allDocs = Array.isArray(documents) && documents.length > 0 ? documents : [];
    const targetDoc = allDocs.find(d => 
      (docId && (d.id === docId || d.doc_id === docId)) ||
      (docCode && (d.code === docCode || d.doc_code === docCode || d.document_code === docCode || d.title === docCode))
    );

    const nextReviewDate = targetDoc?.next_review_date || targetDoc?.nextReviewDate || task.dueDate || task.due_date;
    if (nextReviewDate) {
      const today = new Date(referenceDate || new Date());
      today.setHours(0, 0, 0, 0);
      const target = new Date(nextReviewDate);
      if (!isNaN(target.getTime())) {
        target.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        // เอกสารที่มีวันครบกำหนดเกินกว่า 30 วัน (> 30 วัน เช่น ปี 2030) ต้องไม่มี Task ปรากฏในกล่องงานเด็ดขาด
        if (diffDays > 30) {
          return false;
        }
      }
    } else if (targetDoc && !targetDoc.next_review_date) {
      return false;
    }

    const taskAssigneeId = task.assigneeId || task.assignee_id || task.assignedToUserId || task.target_user_id;
    if (taskAssigneeId && (taskAssigneeId === currentUser?.id || taskAssigneeId === currentUser?.empId || task.assigneeName === currentUser?.name)) {
      return true;
    }
    const taskDept = task.department || task.target_department || task.targetDepartment || task.assignedToDepartmentId || task.ownerDepartmentId || '';
    if (taskDept && (userMatchesDepartment(currentUser, taskDept) || userDepts.some(uDept => isSameDepartment(uDept, taskDept)))) {
      return true;
    }
    return false;
  }

  // 🛡️ Periodic Review Approval (Staff -> HOD Approval Workflow)
  if (normType === 'PERIODIC_REVIEW_APPROVAL' || task.taskType === 'PERIODIC_REVIEW_APPROVAL') {
    // 1. Separation of duties: Reviewer cannot approve their own review
    const reviewerId = task.payload?.reviewer_id || task.reviewerId;
    const reviewerName = task.payload?.reviewer_name || task.reviewerName;
    if (
      (reviewerId && (reviewerId === currentUser?.id || reviewerId === currentUser?.empId)) ||
      (reviewerName && reviewerName === currentUser?.name)
    ) {
      return false;
    }
    const taskDept = task.department || task.assignee_department || task.target_department || task.payload?.department || '';
    const isQmr = currentUser?.role === 'QMR' || currentUser?.isQmr;
    const isDcc = currentUser?.role === 'DCC' || currentUser?.role === 'DC' || currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN' || currentUser?.isDcc;
    const isSupervisor = ['SUPERVISOR', 'DEPT_SUPERVISOR', 'STAFF', 'OFFICER'].includes(currentUser?.role) || 
                         String(currentUser?.position || '').toLowerCase().includes('supervisor');
    const isDeptManager = !isSupervisor && Boolean(
      currentUser?.isDeptHead || 
      currentUser?.is_manager || 
      ['HOD', 'MANAGER', 'APPROVER'].includes(currentUser?.role) || 
      userApprovalLevel >= 5
    );
    const hasDept = userMatchesDepartment(currentUser, taskDept) || userDepts.some(uDept => isSameDepartment(uDept, taskDept));
    return Boolean(isQmr || isDcc || (isDeptManager && hasDept));
  }

  // 4. Department-Pooled Receipt Task (Physical controlled copy confirmation at department stations):
  // Strictly scoped to destination department. Never leak to DCC or other departments.
  // 🛡️ ISO 9001 Segregation of Duties:
  // Receipt tasks MUST strictly be handled by the recipient/holding department members.
  // Even DCC Admin and QMR must NOT receive other departments' receipt tasks in personal inboxes.
  // Executive users (Level 6+: GM, Plant Manager, QMR, or level >= 6 / 'L6'):
  // Cut all RECEIPT tasks from task inbox and badge counters.
  if (isReceiptTask(task)) {
    if (isLevel6Plus(currentUser)) {
      return false;
    }

    const taskDept = task.recipient_department || task.recipientDepartment || task.target_department || task.targetDepartment || task.destinationDept || task.destination_dept || task.department || task.assignedToDept || task.currentHandlerDepartment || task.holder_dept || task.holderDept || task.targetDept || '';
    const isDeptMatch = userMatchesDepartment(currentUser, taskDept) || 
      userDepts.some(uDept => isSameDepartment(uDept, taskDept)) ||
      isSameDepartment(currentUser?.department, taskDept) ||
      isSameDepartment(currentUser?.primary_department, taskDept);

    return isDeptMatch;
  }

  // 🛡️ Separation of Duties: Requester must NEVER review or approve their own submission
  const isRequester = Boolean(
    (task.requesterId && (task.requesterId === currentUser?.id || task.requesterId === currentUser?.empId)) ||
    (task.requesterName && task.requesterName === currentUser?.name)
  );
  const isReviewOrApprove = [
    'REVIEW', 'DAR_REVIEW', 'EXT_REVIEW', 'EXTERNAL_REVIEW',
    'APPROVE', 'DAR_APPROVE', 'APPROVAL', 'EXT_APPROVAL', 'EXTERNAL_APPROVAL'
  ].includes(normType);

  if (isRequester && isReviewOrApprove) {
    return false;
  }

  // 5. Direct user assignment (for person-specific workflow tasks):
  // When a task specifies an Assignee ID for an individual user, it MUST ONLY be actionable by that specific user.
  const taskAssigneeId = task.assigneeId || task.assignee_id || task.assignedToUserId || task.target_user_id;
  if (taskAssigneeId) {
    return Boolean(
      taskAssigneeId === currentUser?.id || 
      taskAssigneeId === currentUser?.empId || 
      task.assigneeName === currentUser?.name
    );
  }

  // 6. Department Workflow Tasks (Review / Approve / Revise / Ack) without specific assignee (Pooled):
  // Must match department AND user's level must meet required approval level.
  // QMR has wildcard cross-org authority across all departments (ISO 9001 SoD).
  const isDeptReviewOrApprove = [
    'REVIEW', 'DAR_REVIEW', 'EXT_REVIEW', 'EXTERNAL_REVIEW', 
    'APPROVE', 'DAR_APPROVE', 'APPROVAL', 'EXT_APPROVAL', 'EXTERNAL_APPROVAL',
    'REVISE', 'EXTERNAL_REVISE', 'ACK', 'ACKNOWLEDGE'
  ].includes(normType);

  if (isDeptReviewOrApprove) {
    const isQmr = currentUser?.role === 'QMR' || currentUser?.isQmr;
    const taskDept = task.department || task.target_department || task.targetDepartment || task.destinationDept || task.assignedToDept || task.currentHandlerDepartment || task.holder_dept || '';
    const isDeptMatch = Boolean(isQmr || (taskDept && userMatchesDepartment(currentUser, taskDept)));
    const requiredLevel = Number(task.required_approval_level || task.requiredLevel || task.currentHandlerLevel || task.min_level || 1);
    const isLevelMatch = isQmr || (userApprovalLevel >= requiredLevel);

    return isDeptMatch && isLevelMatch;
  }

  // 7. Generic unassigned department pooled tasks:
  const taskDept = task.department || task.target_department || task.targetDepartment || task.destinationDept || task.assignedToDept || task.currentHandlerDepartment || task.holder_dept || '';
  if (!taskAssigneeId && taskDept && userMatchesDepartment(currentUser, taskDept)) {
    return true;
  }

  return false;
};

/**
 * Filter tasks for current user with strict department segregation for RECEIPT tasks
 */
export const filterTasksForUser = (tasks, currentUser) => {
  if (!tasks || !currentUser) return [];

  const userDept = currentUser.department || currentUser.primary_department;
  const isDcc = isDccAdmin(currentUser);

  return tasks.filter((task) => {
    // 1. งานตรวจรับเล่ม (RECEIPT): ต้องเป็นของแผนกตัวเองเท่านั้น (Strict Segregation)
    // แม้เป็น DCC Admin ก็ไม่มีสิทธิ์รับงานตรวจรับแทนแผนกอื่น
    if (isReceiptTask(task) || task.type === 'RECEIPT' || task.taskType === 'RECEIPT' || task.task_type === 'CONFIRM_RECEIPT') {
      const targetDept = task.department || task.target_department || task.targetDepartment || task.destinationDept || task.destination_dept || task.targetDept || task.holderDept || task.holder_dept;
      return userMatchesDepartment(currentUser, targetDept) || isSameDepartment(targetDept, userDept);
    }

    // 2. งาน DCC โดยเฉพาะ (แจกจ่าย, เรียกคืน): เฉพาะ DCC Admin
    if (isDccExclusiveTask(task) || ['DISTRIBUTE', 'DISTRIBUTION', 'RECALL', 'DCC_REPLACEMENT'].includes(task.type)) {
      return isDcc;
    }

    // 3. งาน Workflow ทั่วไป (Review, Approve): ตามสิทธิ์เดิม
    if (isDcc) {
      return true; // Bypass เฉพาะงานกำกับดูแลทั่วไปที่ไม่ใช่งานตรวจรับเล่มหน้างาน
    }

    return isSameDepartment(task.department, userDept) || task.assignedTo === currentUser.id || task.assigneeId === currentUser.id;
  });
};

export default {
  isDccAdmin,
  isDccExclusiveTask,
  isDccUser,
  isDccOperationalTask,
  normalizeCanonicalDept,
  normalizeDept,
  isSameDepartment,
  userMatchesDepartment,
  getUserLevelNumber,
  isLevel6Plus,
  isLevel1To5,
  isReceiptTask,
  isActionableTask,
  filterTasksForUser
};

