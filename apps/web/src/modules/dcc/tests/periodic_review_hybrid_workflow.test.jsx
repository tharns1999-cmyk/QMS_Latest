import { describe, it, expect, beforeEach, vi } from 'vitest';
import useStore, { canFastTrackExternalReview, canFastTrackReview } from '../../../store/useStore';
import { isActionableTask } from '../utils/taskFilter';

describe('Hybrid 2-Step Periodic Review Workflow (Staff -> HOD Approval with 1-Click Fast-Track)', () => {
  const MOCK_DATE = '2026-10-09';
  const INITIAL_NEXT_DATE = '2026-10-15';

  const mockStaffUser = {
    id: 'U-STAFF-01',
    name: 'Somchai Staff',
    role: 'STAFF',
    level: 2,
    approval_level: 2,
    department: 'PRD',
    primary_department: 'PRD',
    is_manager: false,
    isDeptHead: false
  };

  const mockHodUser = {
    id: 'U-HOD-01',
    name: 'Somkiat Manager',
    role: 'HOD',
    // SOP approver level per the approval matrix
    level: 6,
    approval_level: 6,
    department: 'PRD',
    primary_department: 'PRD',
    is_manager: true,
    isDeptHead: true
  };

  const mockDccUser = {
    id: 'U-DCC-01',
    name: 'Wipha DCC',
    role: 'DCC',
    level: 3,
    approval_level: 3,
    department: 'DC',
    primary_department: 'DC',
    isDcc: true,
    managedDepartments: ['*']
  };

  const initialDoc = {
    id: 'DOC-PRD-001',
    code: 'SOP-PRD-001',
    title: 'Standard Operating Procedure for Production Line A',
    rev: '01',
    revision: '01',
    department: 'PRD',
    dept: 'PRD',
    next_review_date: INITIAL_NEXT_DATE,
    review_status: 'UPCOMING',
    periodic_reviews: [],
    review_history: []
  };

  const initialSchedule = {
    id: 'SCH-PRD-001',
    documentId: 'DOC-PRD-001',
    documentNumber: 'SOP-PRD-001',
    documentName: 'Standard Operating Procedure for Production Line A',
    documentCategory: 'INTERNAL',
    ownerDepartmentId: 'PRD',
    status: 'ACTION_REQUIRED',
    dueState: 'DUE',
    cycleYears: 1,
    nextReviewDate: INITIAL_NEXT_DATE,
    currentScheduledReviewDate: INITIAL_NEXT_DATE,
    isActive: true
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${MOCK_DATE}T09:00:00Z`));

    useStore.setState({
      documents: [JSON.parse(JSON.stringify(initialDoc))],
      externalDocuments: [],
      periodicReviewSchedules: [JSON.parse(JSON.stringify(initialSchedule))],
      periodicReviewTasks: [],
      tasks: [],
      periodicReviewRecords: [],
      actionLog: [],
      currentUser: mockStaffUser
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('1. Fast-Track Eligibility Evaluation', () => {
    it('evaluates Staff as NOT eligible for Fast-Track', () => {
      expect(canFastTrackReview(mockStaffUser, 'PRD')).toBe(false);
    });

    it('evaluates HOD/Manager of that department as eligible for Fast-Track', () => {
      expect(canFastTrackReview(mockHodUser, 'PRD')).toBe(true);
    });

    it('evaluates HOD of PRD as NOT eligible for Fast-Track in another department (e.g. QC)', () => {
      expect(canFastTrackReview(mockHodUser, 'QC')).toBe(false);
    });

    it('evaluates DCC Admin with wildcard scope as eligible for Fast-Track across departments', () => {
      expect(canFastTrackReview(mockDccUser, 'PRD')).toBe(true);
      expect(canFastTrackReview(mockDccUser, 'QC')).toBe(true);
    });
  });

  describe('2. Flow A: Staff Submits Periodic Review (2-Step Workflow)', () => {
    it('does NOT advance expiration date, creates PERIODIC_REVIEW_APPROVAL task for HOD, and sets status to PENDING_APPROVAL', () => {
      useStore.setState({ currentUser: mockStaffUser });

      const result = useStore.getState().submitPeriodicReview({
        scheduleId: 'SCH-PRD-001',
        outcome: 'NO_CHANGE',
        comment: 'เนื้อหาเอกสารยังคงสอดคล้องกับหน้างานจริง ไม่มีการเปลี่ยนแปลง',
        reviewDetails: {
          findings: 'ไม่มีข้อบกพร่อง',
          standards: 'ISO 9001:2015 Clause 7.5.3'
        }
      });

      expect(result.status).toBe('PENDING_APPROVAL');
      expect(result.fastTrack).toBe(false);
      expect(result.task).toBeDefined();

      const store = useStore.getState();
      const doc = store.documents.find(d => d.id === 'DOC-PRD-001');
      const sch = store.periodicReviewSchedules.find(s => s.id === 'SCH-PRD-001');
      const approvalTask = store.tasks.find(t => t.type === 'PERIODIC_REVIEW_APPROVAL');

      // Date must NOT be extended yet
      expect(doc.next_review_date).toBe(INITIAL_NEXT_DATE);
      expect(sch.nextReviewDate).toBe(INITIAL_NEXT_DATE);

      // Status must reflect pending approval
      expect(doc.review_status).toBe('PENDING_APPROVAL');
      expect(sch.status).toBe('PENDING_APPROVAL');
      expect(doc.pending_periodic_review).toBeDefined();
      expect(doc.pending_periodic_review.reviewer_id).toBe(mockStaffUser.id);
      expect(doc.pending_periodic_review.reviewer_name).toBe(mockStaffUser.name);

      // Task created for HOD
      expect(approvalTask).toBeDefined();
      expect(approvalTask.target_role).toBe('HOD');
      expect(approvalTask.department).toBe('PRD');
      expect(approvalTask.status).toBe('PENDING');
      expect(approvalTask.payload.doc_code).toBe('SOP-PRD-001');
    });

    it('enforces Separation of Duties: Staff who submitted cannot approve their own task in TaskInbox', () => {
      useStore.setState({ currentUser: mockStaffUser });

      useStore.getState().submitPeriodicReview({
        scheduleId: 'SCH-PRD-001',
        outcome: 'NO_CHANGE',
        comment: 'Staff reviewed'
      });

      const store = useStore.getState();
      const approvalTask = store.tasks.find(t => t.type === 'PERIODIC_REVIEW_APPROVAL');

      // Staff user should NOT find this task actionable
      expect(isActionableTask(approvalTask, mockStaffUser)).toBe(false);

      // HOD user of PRD MUST find this task actionable
      expect(isActionableTask(approvalTask, mockHodUser)).toBe(true);

      // User from another department (e.g. QC Staff) must NOT find this task actionable
      const otherUser = { id: 'U-QC-01', name: 'QC Staff', role: 'STAFF', level: 2, department: 'QC' };
      expect(isActionableTask(approvalTask, otherUser)).toBe(false);
    });
  });

  describe('3. Flow B: HOD Approves / Rejects Pending Periodic Review', () => {
    let approvalTaskId;

    beforeEach(() => {
      // Staff submits first
      useStore.setState({ currentUser: mockStaffUser });
      useStore.getState().submitPeriodicReview({
        scheduleId: 'SCH-PRD-001',
        outcome: 'NO_CHANGE',
        comment: 'ทบทวนแล้วถูกต้อง',
        reviewDetails: {
          findings: 'ไม่มีประเด็น',
          standards: 'ISO 9001:2015'
        }
      });

      const task = useStore.getState().tasks.find(t => t.type === 'PERIODIC_REVIEW_APPROVAL');
      approvalTaskId = task.id;
    });

    it('HOD Approves: advances next_review_date by +1 year and stamps audit trail with both reviewer and approver', () => {
      // HOD logs in and approves
      useStore.setState({ currentUser: mockHodUser });

      useStore.getState().approvePeriodicReview({
        taskId: approvalTaskId,
        approverUser: mockHodUser,
        remarks: 'อนุมัติเรียบร้อยตามมาตรฐาน'
      });

      const store = useStore.getState();
      const doc = store.documents.find(d => d.id === 'DOC-PRD-001');
      const sch = store.periodicReviewSchedules.find(s => s.id === 'SCH-PRD-001');
      const task = store.tasks.find(t => t.id === approvalTaskId);

      // 1. Next review date extended by +1 year from current due date anchor (2026-10-15 -> 2027-10-15)
      expect(doc.next_review_date).toBe('2027-10-15');
      expect(sch.nextReviewDate).toBe('2027-10-15');
      expect(doc.review_status).toBe('UP_TO_DATE');
      expect(sch.status).toBe('UPCOMING');
      expect(doc.pending_periodic_review).toBeUndefined();

      // 2. Task completed
      expect(task.status).toBe('COMPLETED');
      expect(task.approvedBy).toBe(mockHodUser.name);

      // 3. Audit Trail Logging: Both reviewer and approver recorded
      expect(doc.periodic_reviews).toHaveLength(1);
      const auditEntry = doc.periodic_reviews[0];
      expect(auditEntry.reviewer_name).toBe(mockStaffUser.name);
      expect(auditEntry.reviewer_role).toBe(mockStaffUser.role);
      expect(auditEntry.approver_name).toBe(mockHodUser.name);
      expect(auditEntry.approver_role).toBe(mockHodUser.role);
      expect(auditEntry.result).toBe('NO_CHANGE');
      expect(auditEntry.next_review_due).toBe('2027-10-15');

      // 4. review_history entry
      expect(doc.review_history).toHaveLength(1);
      const historyEntry = doc.review_history[0];
      expect(historyEntry.reviewer).toBe(mockStaffUser.name);
      expect(historyEntry.approver).toBe(mockHodUser.name);
      expect(historyEntry.outcome).toBe('NO_CHANGE');
      expect(historyEntry.nextReviewDate).toBe('2027-10-15');
      expect(historyEntry.outcome_label).toBe('ยังคงใช้งานต่อได้');
      expect(historyEntry.extended_next_due_date).toBe('2027-10-15');
      expect(historyEntry.approved_by.name).toBe(mockHodUser.name);
      expect(historyEntry.is_fast_track).toBe(false);
      expect(historyEntry.rejection_trail).toEqual([]);
    });

    it('HOD Rejects: resets status to ACTION_REQUIRED, stores rejectReason, and clears pending state', () => {
      // HOD logs in and rejects
      useStore.setState({ currentUser: mockHodUser });

      useStore.getState().rejectPeriodicReview({
        taskId: approvalTaskId,
        approverUser: mockHodUser,
        remarks: 'เอกสารมีกระบวนการเปลี่ยน ให้ส่งขอจัดทำ DAR แก้ไขแทน'
      });

      const store = useStore.getState();
      const doc = store.documents.find(d => d.id === 'DOC-PRD-001');
      const sch = store.periodicReviewSchedules.find(s => s.id === 'SCH-PRD-001');
      const task = store.tasks.find(t => t.id === approvalTaskId);

      // Date NOT changed
      expect(doc.next_review_date).toBe(INITIAL_NEXT_DATE);

      // Status reset
      expect(sch.status).toBe('ACTION_REQUIRED');
      expect(sch.rejectionRemarks).toBe('เอกสารมีกระบวนการเปลี่ยน ให้ส่งขอจัดทำ DAR แก้ไขแทน');
      expect(doc.review_status).toBe('ACTION_REQUIRED');
      expect(doc.pending_periodic_review).toBeUndefined();

      // Task marked rejected
      expect(task.status).toBe('REJECTED');
      expect(task.is_completed).toBe(true);
      expect(task.actionRequired).toBe(false);
      expect(task.rejectReason).toBe('เอกสารมีกระบวนการเปลี่ยน ให้ส่งขอจัดทำ DAR แก้ไขแทน');
      expect(store.tasks.find(t => t.type === 'PERIODIC_REVIEW_REVISE')).toMatchObject({
        assigneeId: mockStaffUser.id,
        status: 'PENDING',
        actionRequired: true,
        is_completed: false,
        rejectionRemarks: 'เอกสารมีกระบวนการเปลี่ยน ให้ส่งขอจัดทำ DAR แก้ไขแทน'
      });
    });
  });

  describe('4. Flow C: Fast-Track 1-Click Direct Approval by HOD/Manager', () => {
    it('immediately extends next_review_date +1 year and stamps audit trail without creating approval task', () => {
      useStore.setState({ currentUser: mockHodUser });

      const result = useStore.getState().submitPeriodicReview({
        scheduleId: 'SCH-PRD-001',
        outcome: 'NO_CHANGE',
        comment: 'HOD Fast-Track review direct submission'
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.fastTrack).toBe(true);

      const store = useStore.getState();
      const doc = store.documents.find(d => d.id === 'DOC-PRD-001');
      const sch = store.periodicReviewSchedules.find(s => s.id === 'SCH-PRD-001');
      const approvalTask = store.tasks.find(t => t.type === 'PERIODIC_REVIEW_APPROVAL');

      // Date extended immediately by 1 year from current due date anchor
      expect(doc.next_review_date).toBe('2027-10-15');
      expect(sch.nextReviewDate).toBe('2027-10-15');
      expect(doc.review_status).toBe('UP_TO_DATE');
      expect(sch.status).toBe('UPCOMING');

      // NO approval task should be created
      expect(approvalTask).toBeUndefined();

      // Audit trail logged with HOD as both reviewer and approver
      expect(doc.periodic_reviews).toHaveLength(1);
      expect(doc.periodic_reviews[0].reviewer_name).toBe(mockHodUser.name);
      expect(doc.periodic_reviews[0].approver_name).toBe(mockHodUser.name);
    });
  });

  describe('5. TaskInbox UI Integration: Periodic Review Approval Card & Modal Interaction', () => {
    it('renders task card for HOD with action buttons, opens approval modal, and allows approving', async () => {
      const { render, screen, fireEvent } = await import('@testing-library/react');
      const { MemoryRouter } = await import('react-router-dom');
      const TaskInbox = (await import('../pages/Tasks/TaskInbox')).default;

      // Staff submits first
      useStore.setState({ currentUser: mockStaffUser });
      useStore.getState().submitPeriodicReview({
        scheduleId: 'SCH-PRD-001',
        outcome: 'NO_CHANGE',
        comment: 'Staff confirmed no change',
        reviewDetails: {
          findings: 'กระบวนการปัจจุบันตรงตามคู่มือ',
          standards: 'ISO 9001:2015'
        }
      });

      // HOD views TaskInbox
      useStore.setState({ currentUser: mockHodUser });

      render(
        <MemoryRouter>
          <TaskInbox />
        </MemoryRouter>
      );

      // Verify task card appears
      expect(screen.getByText(/อนุมัติผลทบทวนตามรอบ/i)).toBeDefined();
      expect(screen.getByText('SOP-PRD-001')).toBeDefined();

      // Verify action buttons exist on the card
      const approveBtn = screen.getByRole('button', { name: /พิจารณาอนุมัติ/i });
      const rejectBtn = screen.getByRole('button', { name: /ตีกลับ/i });
      expect(approveBtn).toBeDefined();
      expect(rejectBtn).toBeDefined();

      // Click "พิจารณาอนุมัติ" button to open modal
      fireEvent.click(approveBtn);

      // Verify Modal opens and displays review details
      expect(screen.getByText(/พิจารณาอนุมัติผลการทบทวนเอกสารตามรอบ/i)).toBeDefined();
      expect(screen.getByText(/ไม่มีการเปลี่ยนแปลง \(No Change\)/i)).toBeDefined();
      expect(screen.getByText(/กระบวนการปัจจุบันตรงตามคู่มือ/i)).toBeDefined();

      // In modal: click "อนุมัติผลทบทวน (Approve)" button
      const modalApproveBtn = screen.getByRole('button', { name: /อนุมัติผลทบทวน \(Approve\)/i });
      fireEvent.click(modalApproveBtn);

      // Verify task completed in store and next review date rolled
      const store = useStore.getState();
      const doc = store.documents.find(d => d.id === 'DOC-PRD-001');
      expect(doc.next_review_date).toBe('2027-10-15');
      expect(doc.review_status).toBe('UP_TO_DATE');
      expect(doc.periodic_reviews[0].approver_name).toBe(mockHodUser.name);
    });
  });

  describe('5. L4 Supervisor vs L5+ HOD Authority Enforcements', () => {
    const mockBeamL4 = {
      id: 'U005',
      name: 'บีม',
      role: 'DEPT_ADMIN',
      position: 'QAQC Supervisor',
      level: 4,
      approval_level: 4,
      department: 'QC',
      primary_department: 'QC',
      depts: ['QC']
    };

    const mockKalyaneeL5 = {
      id: 'U003',
      name: 'กัลยาณี พลไกร',
      role: 'DEPT_ADMIN',
      position: 'Production Assistant Manager',
      level: 5,
      approval_level: 5,
      department: 'PD',
      depts: ['PD', 'QC'],
      secondaryDepartments: ['QC']
    };

    // ED approver level per the approval matrix is L6
    const mockQcManagerL6 = { ...mockKalyaneeL5, id: 'U010', name: 'QC Manager', level: 6, approval_level: 6 };

    it('approval follows the approval matrix level per doc type, not a fixed L5', () => {
      expect(canFastTrackReview(mockKalyaneeL5, 'QC', 'WI-QC-001')).toBe(true);
      expect(canFastTrackReview(mockKalyaneeL5, 'QC', 'SOP-QC-001')).toBe(false);
      expect(canFastTrackReview(mockQcManagerL6, 'QC', 'SOP-QC-001')).toBe(true);
      expect(canFastTrackExternalReview(mockKalyaneeL5, 'QC')).toBe(false);
      expect(canFastTrackExternalReview(mockQcManagerL6, 'QC')).toBe(true);
    });

    it('evaluates Beam (L4 QAQC Supervisor) as strictly NOT eligible for Fast-Track', () => {
      expect(canFastTrackReview(mockBeamL4, 'QC')).toBe(false);
      expect(canFastTrackExternalReview(mockBeamL4, 'QC')).toBe(false);
    });

    it('evaluates Kalyanee (L5 Manager overseeing QC) as eligible for Fast-Track', () => {
      expect(canFastTrackReview(mockKalyaneeL5, 'QC')).toBe(true);
    });

    it('creates PERIODIC_REVIEW_APPROVAL task with target_level: 5 when Beam submits a WI review (WI matrix level)', () => {
      const qcDoc = {
        id: 'DOC-QC-001',
        code: 'WI-QC-001',
        title: 'QC Test Standard',
        department: 'QC',
        next_review_date: '2026-10-15',
        review_status: 'UPCOMING'
      };
      const qcSchedule = {
        id: 'SCH-QC-001',
        documentId: 'DOC-QC-001',
        documentNumber: 'WI-QC-001',
        documentName: 'QC Test Standard',
        ownerDepartmentId: 'QC',
        status: 'ACTION_REQUIRED',
        nextReviewDate: '2026-10-15',
        cycleYears: 1
      };
      useStore.setState({
        documents: [qcDoc],
        periodicReviewSchedules: [qcSchedule],
        tasks: [],
        currentUser: mockBeamL4
      });

      const result = useStore.getState().submitPeriodicReview({
        scheduleId: 'SCH-QC-001',
        outcome: 'NO_CHANGE',
        comment: 'ทบทวนแล้วถูกต้องตาม SOP',
        reviewDetails: { reason: 'ทบทวนแล้วถูกต้องตาม SOP' }
      });

      expect(result.status).toBe('PENDING_APPROVAL');
      expect(result.fastTrack).toBe(false);

      const approvalTask = useStore.getState().tasks.find(t => t.type === 'PERIODIC_REVIEW_APPROVAL');
      expect(approvalTask).toBeDefined();
      expect(approvalTask.target_level).toBe(5);
      expect(approvalTask.target_role).toBe('HOD');
      expect(approvalTask.department).toBe('QC');

      // Task is NOT visible to Beam L4
      expect(isActionableTask(approvalTask, mockBeamL4)).toBe(false);
      // Task IS visible to Kalyanee L5
      expect(isActionableTask(approvalTask, mockKalyaneeL5)).toBe(true);
    });

    it('routes an external review from Beam L4 to the QC L6 approver (ED matrix level) without rolling its due date', () => {
      const extDoc = {
        id: 'ED-QC-001',
        edCode: 'ED-QC-001',
        department: 'QC',
        nextReviewDate: '2026-10-15',
        next_review_date: '2026-10-15',
        review_status: 'DUE_SOON'
      };
      const extSchedule = {
        id: 'SCH-ED-QC-001',
        externalDocumentId: extDoc.id,
        documentNumber: extDoc.edCode,
        documentName: 'QC External Standard',
        documentCategory: 'EXTERNAL',
        isExternal: true,
        ownerDepartmentId: 'QC',
        status: 'ACTION_REQUIRED',
        nextReviewDate: '2026-10-15'
      };
      useStore.setState({
        users: [mockBeamL4, mockKalyaneeL5, mockQcManagerL6],
        masterUsers: [mockBeamL4, mockKalyaneeL5, mockQcManagerL6],
        externalDocuments: [extDoc],
        periodicReviewSchedules: [extSchedule],
        tasks: [],
        notifications: [],
        currentUser: mockBeamL4
      });

      const result = useStore.getState().submitPeriodicReview({
        scheduleId: extSchedule.id,
        docId: extDoc.id,
        docCode: extDoc.edCode,
        isExternal: true,
        outcome: 'NO_CHANGE',
        comment: 'ทบทวนเอกสารภายนอกแล้ว'
      });

      expect(result).toMatchObject({ status: 'PENDING_APPROVAL', fastTrack: false });
      const store = useStore.getState();
      const task = store.tasks.find(t => t.type === 'PERIODIC_REVIEW_APPROVAL');
      expect(task).toMatchObject({
        assigneeId: mockQcManagerL6.id,
        assignee_id: mockQcManagerL6.id,
        actionRequired: true,
        status: 'PENDING',
        is_completed: false,
        referenceType: 'EXTERNAL_DOC',
        origin: 'EXTERNAL',
        department: 'QC',
        target_department: 'QC',
        owner_dept: 'QC'
      });
      expect(store.notifications.some(n => n.userId === mockQcManagerL6.id && n.taskId === task.id)).toBe(true);
      expect(store.externalDocuments[0].nextReviewDate).toBe('2026-10-15');
      expect(store.externalDocuments[0].next_review_date).toBe('2026-10-15');
      expect(store.externalDocuments[0].review_status).toBe('PENDING_APPROVAL');
      expect(store.periodicReviewSchedules[0]).toMatchObject({
        nextReviewDate: '2026-10-15',
        status: 'PENDING_APPROVAL'
      });

      useStore.getState().rejectPeriodicReview(task.id, mockQcManagerL6, 'กรุณาตรวจสอบฉบับอ้างอิงอีกครั้ง');
      const rejectedStore = useStore.getState();
      expect(rejectedStore.externalDocuments[0]).toMatchObject({
        review_status: 'ACTION_REQUIRED',
        pending_periodic_review: false,
        pendingReview: null,
        rejection_remarks: 'กรุณาตรวจสอบฉบับอ้างอิงอีกครั้ง'
      });
      expect(rejectedStore.periodicReviewSchedules[0]).toMatchObject({
        status: 'ACTION_REQUIRED',
        pendingApprovalTaskId: null,
        pendingReview: null
      });
      const reviseTask = rejectedStore.tasks.find(t => t.type === 'PERIODIC_REVIEW_REVISE');
      expect(reviseTask).toMatchObject({
        assigneeId: mockBeamL4.id,
        referenceType: 'EXTERNAL_DOC',
        origin: 'EXTERNAL',
        priority: 'HIGH',
        isUrgent: true,
        rejection_remarks: 'กรุณาตรวจสอบฉบับอ้างอิงอีกครั้ง'
      });

      useStore.getState().submitPeriodicReview({
        scheduleId: extSchedule.id,
        docId: extDoc.id,
        docCode: extDoc.edCode,
        isExternal: true,
        outcome: 'NO_CHANGE',
        comment: 'ทบทวนเอกสารภายนอกใหม่แล้ว'
      });
      expect(useStore.getState().tasks.find(t => t.id === reviseTask.id)).toMatchObject({
        status: 'COMPLETED',
        is_completed: true,
        actionRequired: false
      });
    });
  });

  describe('6. Dynamic Approver Resolution, State Locking & Rejection Notification', () => {
    const mockStaff = {
      id: 'USR-OP-001',
      name: 'Anan Operator',
      role: 'OPERATOR',
      position: 'Line Operator',
      department: 'EN',
      level: 2
    };

    const mockEnManager = {
      id: 'USR-MGR-EN',
      name: 'Chaiwat EN Manager',
      role: 'MANAGER',
      position: 'Engineering Manager',
      department: 'EN',
      is_manager: true,
      level: 5
    };

    const enDoc = {
      id: 'DOC-EN-999',
      code: 'WI-EN-999',
      title: 'Machine Calibration WI',
      department: 'EN',
      next_review_date: '2026-10-20',
      review_status: 'UPCOMING'
    };

    const enSchedule = {
      id: 'SCH-EN-999',
      documentId: 'DOC-EN-999',
      documentNumber: 'WI-EN-999',
      documentName: 'Machine Calibration WI',
      ownerDepartmentId: 'EN',
      status: 'ACTION_REQUIRED',
      nextReviewDate: '2026-10-20',
      cycleYears: 1
    };

    it('dynamically resolves department approver and locks document with pending_review_task_id', () => {
      useStore.setState({
        users: [mockStaff, mockEnManager],
        documents: [JSON.parse(JSON.stringify(enDoc))],
        periodicReviewSchedules: [JSON.parse(JSON.stringify(enSchedule))],
        tasks: [],
        notifications: [],
        currentUser: mockStaff
      });

      const res = useStore.getState().submitPeriodicReview({
        scheduleId: 'SCH-EN-999',
        outcome: 'NO_CHANGE',
        comment: 'เครื่องจักรยังคงสอบเทียบตามมาตรฐานเดิม',
        reviewDetails: {
          findings: 'ไม่มีประเด็นผิดปกติ',
          standards: 'ISO 9001 Clause 7.1.5'
        }
      });

      expect(res.status).toBe('PENDING_APPROVAL');
      expect(res.fastTrack).toBe(false);

      const store = useStore.getState();
      const approvalTask = store.tasks.find(t => t.type === 'PERIODIC_REVIEW_APPROVAL');
      expect(approvalTask).toBeDefined();

      // Dynamic Approver Resolution (No hardcoded string): Assigned directly to mockEnManager
      expect(approvalTask.assignee_id).toBe(mockEnManager.id);
      expect(approvalTask.assignee_name).toBe(mockEnManager.name);
      expect(approvalTask.payload.reviewer_position).toBe('Line Operator');
      expect(approvalTask.payload.reviewer_name).toBe(mockStaff.name);

      // State Locking on Document
      const doc = store.documents.find(d => d.id === 'DOC-EN-999');
      expect(doc.review_status).toBe('PENDING_APPROVAL');
      expect(doc.pending_review_task_id).toBe(approvalTask.id);

      // Rejection clears lock and dispatches notification to reviewer
      useStore.getState().rejectPeriodicReview({
        taskId: approvalTask.id,
        approverUser: mockEnManager,
        remarks: 'ให้แนบใบสอบเทียบภายนอกประกอบด้วย'
      });

      const afterRejectStore = useStore.getState();
      const rejectedDoc = afterRejectStore.documents.find(d => d.id === 'DOC-EN-999');
      expect(rejectedDoc.review_status).toBe('ACTION_REQUIRED');
      expect(rejectedDoc.pending_review_task_id).toBeUndefined();

      // Notification sent to reviewer
      const reviewerNotif = afterRejectStore.notifications.find(n => n.userId === mockStaff.id);
      expect(reviewerNotif).toBeDefined();
      expect(reviewerNotif.title).toContain('WI-EN-999');
      expect(reviewerNotif.message).toContain('ให้แนบใบสอบเทียบภายนอกประกอบด้วย');
    });

    it('fallback dynamic resolution to DCC when no department manager exists', () => {
      const mockDccOnly = {
        id: 'USR-DCC-099',
        name: 'Darika DCC',
        role: 'DCC',
        position: 'DCC Lead',
        is_dcc: true,
        department: 'DC',
        managedDepartments: ['*']
      };

      useStore.setState({
        users: [mockStaff, mockDccOnly], // No EN manager in users list
        documents: [JSON.parse(JSON.stringify(enDoc))],
        periodicReviewSchedules: [JSON.parse(JSON.stringify(enSchedule))],
        tasks: [],
        currentUser: mockStaff
      });

      useStore.getState().submitPeriodicReview({
        scheduleId: 'SCH-EN-999',
        outcome: 'NO_CHANGE',
        comment: 'ทบทวนความพร้อม'
      });

      const store = useStore.getState();
      const approvalTask = store.tasks.find(t => t.type === 'PERIODIC_REVIEW_APPROVAL');
      expect(approvalTask).toBeDefined();
      // Dynamically falls back to DCC (not hardcoded)
      expect(approvalTask.assignee_id).toBe(mockDccOnly.id);
      expect(approvalTask.assignee_name).toBe(mockDccOnly.name);
    });
  });
});

