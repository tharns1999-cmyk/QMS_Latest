import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import TaskInbox from '../pages/Tasks/TaskInbox';
import { isActionableTask } from '../utils/taskFilter';

describe('Task Inbox Periodic Review Due Window & Lifecycle Cleanup', () => {
  const beamUser = {
    id: 'U005',
    empId: 'U005',
    name: 'บีม',
    department: 'QC',
    primary_department: 'QC',
    role: 'DEPARTMENT_USER',
    level: 3,
    approval_level: 3
  };

  const hodUser = {
    id: 'U003',
    empId: 'U003',
    name: 'กัลยาณี พลไกร',
    department: 'QC',
    primary_department: 'QC',
    role: 'HOD',
    level: 5,
    approval_level: 5,
    is_hod: true
  };

  const wiQcDoc = {
    id: 'DOC-WI-QC-01',
    code: 'WI-QC-01',
    doc_code: 'WI-QC-01',
    document_code: 'WI-QC-01',
    title: 'WI-QC-01',
    name: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
    department: 'QC',
    status: 'EFFECTIVE',
    ownerId: 'U005',
    next_review_date: '2030-10-12',
    nextReviewDate: '2030-10-12'
  };

  const periodicReviewTask2030 = {
    id: 'PRT-WI-QC-01-2030',
    type: 'PERIODIC_REVIEW',
    taskType: 'PERIODIC_REVIEW',
    title: 'ทบทวนเอกสารตามรอบ: ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า (WI-QC-01)',
    document_code: 'WI-QC-01',
    doc_code: 'WI-QC-01',
    docCode: 'WI-QC-01',
    docId: 'DOC-WI-QC-01',
    scheduleId: 'PRS-QC-01',
    department: 'QC',
    assignedToDepartmentId: 'QC',
    assignedToUserId: 'U005',
    assigneeId: 'U005',
    assigneeName: 'บีม',
    status: 'ACTION_REQUIRED',
    dueDate: '2030-10-12',
    createdAt: '2026-10-12T00:00:00Z'
  };

  beforeEach(() => {
    useStore.setState({
      currentUser: beamUser,
      simulatedSystemDate: '2026-10-12',
      documents: [wiQcDoc],
      externalDocuments: [],
      tasks: [periodicReviewTask2030],
      dars: [],
      controlledCopyInstances: []
    });
  });

  describe('isActionableTask unit tests with 30-day window', () => {
    it('returns false when task due date is in 2030 (diffDays > 30)', () => {
      const today = new Date('2026-10-12');
      const actionable = isActionableTask(periodicReviewTask2030, beamUser, [wiQcDoc], today);
      expect(actionable).toBe(false);
    });

    it('returns true when task due date is within 30 days (e.g. 2030-10-10, diffDays = 2)', () => {
      const dueSoonDate = new Date('2030-10-10');
      const actionable = isActionableTask(periodicReviewTask2030, beamUser, [wiQcDoc], dueSoonDate);
      expect(actionable).toBe(true);
    });

    it('returns true when task is overdue (diffDays < 0)', () => {
      const overdueDate = new Date('2030-10-20');
      const actionable = isActionableTask(periodicReviewTask2030, beamUser, [wiQcDoc], overdueDate);
      expect(actionable).toBe(true);
    });

    it('returns false if task is already completed', () => {
      const completedTask = { ...periodicReviewTask2030, status: 'COMPLETED' };
      const dueSoonDate = new Date('2030-10-10');
      const actionable = isActionableTask(completedTask, beamUser, [wiQcDoc], dueSoonDate);
      expect(actionable).toBe(false);
    });
  });

  describe('Acceptance Criteria 1: Beam does NOT see 2030 WI-QC-01 task in TaskInbox at 2026', () => {
    it('does not display WI-QC-01 periodic review task in TaskInbox when due in 2030', () => {
      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <TaskInbox />
        </MemoryRouter>
      );

      // Must NOT find WI-QC-01 in the list
      expect(screen.queryByText(/WI-QC-01/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/ทบทวนเอกสารตามรอบ/i)).not.toBeInTheDocument();
    });

    it('getUserTaskBadgeCount returns 0 for Beam when task is due in 2030', () => {
      const count = useStore.getState().getUserTaskBadgeCount(beamUser);
      expect(count).toBe(0);
    });
  });

  describe('Acceptance Criteria 2: Task automatically appears when simulated time advances to 2030-10-10 (<= 30 days)', () => {
    it('displays WI-QC-01 in TaskInbox when simulatedSystemDate is 2030-10-10', () => {
      useStore.setState({
        simulatedSystemDate: '2030-10-10'
      });

      render(
        <MemoryRouter initialEntries={['/tasks']}>
          <TaskInbox />
        </MemoryRouter>
      );

      // Must find WI-QC-01 in the task inbox
      expect(screen.getByText(/WI-QC-01/i)).toBeInTheDocument();
    });

    it('getUserTaskBadgeCount returns 1 for Beam when simulatedSystemDate is 2030-10-10', () => {
      useStore.setState({
        simulatedSystemDate: '2030-10-10'
      });

      const count = useStore.getState().getUserTaskBadgeCount(beamUser);
      expect(count).toBe(1);
    });
  });

  describe('Acceptance Criteria 3: Proper Task Lifecycle Cleanup on Approval', () => {
    it('marks both approval task and review task as COMPLETED with completed_at when approved', () => {
      const approvalTask = {
        id: 'TASK-APPR-01',
        type: 'PERIODIC_REVIEW_APPROVAL',
        taskType: 'PERIODIC_REVIEW_APPROVAL',
        title: 'อนุมัติผลทบทวนตามรอบ: WI-QC-01',
        document_code: 'WI-QC-01',
        status: 'PENDING',
        payload: {
          doc_id: 'DOC-WI-QC-01',
          doc_code: 'WI-QC-01',
          scheduleId: 'PRS-QC-01',
          reviewer_id: 'U005',
          reviewer_name: 'บีม',
          submitted_at: '2026-10-12T10:00:00Z',
          details: { comment: 'All good' }
        }
      };

      useStore.setState({
        currentUser: hodUser,
        tasks: [periodicReviewTask2030, approvalTask],
        periodicReviewSchedules: [{
          id: 'PRS-QC-01',
          documentId: 'DOC-WI-QC-01',
          documentNumber: 'WI-QC-01',
          status: 'PENDING_APPROVAL'
        }]
      });

      // HOD approves the review
      useStore.getState().approvePeriodicReview({
        taskId: 'TASK-APPR-01',
        approverUser: hodUser,
        remarks: 'Approved by HOD'
      });

      const updatedTasks = useStore.getState().tasks;
      const closedApprovalTask = updatedTasks.find(t => t.id === 'TASK-APPR-01');
      const closedReviewTask = updatedTasks.find(t => t.id === 'PRT-WI-QC-01-2030');

      expect(closedApprovalTask.status).toBe('COMPLETED');
      expect(closedApprovalTask.is_completed).toBe(true);
      expect(closedApprovalTask.completed_at).toBeDefined();

      expect(closedReviewTask.status).toBe('COMPLETED');
      expect(closedReviewTask.is_completed).toBe(true);
      expect(closedReviewTask.completed_at).toBeDefined();
    });
  });
});
