import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../store/useStore';
import TaskInbox from '../pages/Tasks/TaskInbox';
import { calculateTaskDueDate } from '../utils/slaCalculator';

describe('Enterprise QMS: Dynamic Task Due Date Capped by Document Effective Date (Urgent / Fast-Track SLA)', () => {
  beforeEach(() => {
    // Fixed clock: fixtures use Sep-2026 dates; past effective dates get clamped to today
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-01T08:00:00Z'));
    useStore.setState({
      tasks: [],
      dars: [],
      darRequests: [],
      documents: [],
      notifications: [],
      timeline: [],
      mockDateOffset: 0,
      currentUser: {
        id: 'U001',
        name: 'ธนาวุฒิ สมควรกิจดำรง (DC) L4',
        department: 'DC',
        role: 'DCC_ADMIN',
        isDcc: true,
        level: 4
      },
      masterUsers: [
        { id: 'U001', name: 'ธนาวุฒิ สมควรกิจดำรง', department: 'DC', level: 4, role: 'DCC_ADMIN' },
        { id: 'u1', name: 'สมชาย นักวิจัย', department: 'PD', level: 1, role: 'GENERAL_USER' },
        { id: 'U002', name: 'สมศักดิ์ ผู้จัดการฝ่ายผลิต', department: 'PD', level: 4, role: 'DEPT_ADMIN' },
        { id: 'U003', name: 'กัลยาณี พลไกร', department: 'PD', level: 5, role: 'QMR' }
      ],
      reviewUsers: [
        { id: 'U002', name: 'สมศักดิ์ ผู้จัดการฝ่ายผลิต', department: 'PD', level: 4 }
      ],
      approveUsers: [
        { id: 'U003', name: 'กัลยาณี พลไกร', department: 'PD', level: 5 }
      ]
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('1. SLA Calculator Utility (calculateTaskDueDate)', () => {
    it('calculates standard forward SLA when document effective date is well after standard due date', () => {
      const result = calculateTaskDueDate({
        submissionDate: '2026-09-01',
        effectiveDate: '2026-09-15',
        stepSlaDays: 3,
        mockDateOffset: 0
      });

      expect(result.standardDueDate).toBe('2026-09-04');
      expect(result.dueDate).toBe('2026-09-04');
      expect(result.isUrgent).toBe(false);
      expect(result.isFastTrack).toBe(false);
      expect(result.slaType).toBe('STANDARD');
      expect(result.effectiveDate).toBe('2026-09-15');
    });

    it('caps finalDueDate to effectiveDate and flags Fast-Track when effectiveDate <= standardDueDate', () => {
      // User scenario: submission on Sep 5 + 3 days = Sep 8, but effective date is Sep 6
      const result = calculateTaskDueDate({
        submissionDate: '2026-09-05',
        effectiveDate: '2026-09-06',
        stepSlaDays: 3,
        mockDateOffset: 0
      });

      expect(result.standardDueDate).toBe('2026-09-08');
      expect(result.dueDate).toBe('2026-09-06'); // Strictly capped!
      expect(result.isUrgent).toBe(true);
      expect(result.isFastTrack).toBe(true);
      expect(result.slaType).toBe('FAST_TRACK');
      expect(result.effectiveDate).toBe('2026-09-06');
      expect(result.cancelDate).toBe('2026-09-06');
    });

    it('caps finalDueDate to today when effectiveDate is today or already in the past', () => {
      vi.useFakeTimers();
      const mockToday = new Date('2026-09-06T10:00:00Z');
      vi.setSystemTime(mockToday);

      const todayStr = '2026-09-06';
      const pastEffective = '2026-09-01';

      const result = calculateTaskDueDate({
        submissionDate: todayStr,
        effectiveDate: pastEffective,
        stepSlaDays: 3,
        mockDateOffset: 0
      });

      // Target effective date is before today -> capped to today
      expect(result.dueDate).toBe(todayStr);
      expect(result.isUrgent).toBe(true);
      expect(result.slaType).toBe('FAST_TRACK');
      expect(result.cancelDate).toBe(todayStr);
    });

    it('falls back to standardDueDate when effectiveDate is not provided', () => {
      const result = calculateTaskDueDate({
        submissionDate: '2026-09-05',
        effectiveDate: null,
        stepSlaDays: 3
      });

      expect(result.dueDate).toBe('2026-09-08');
      expect(result.isUrgent).toBe(false);
      expect(result.slaType).toBe('STANDARD');
    });
  });

  describe('2. Store Integration: addDar with Fast-Track Capping', () => {
    it('automatically generates Reviewer task with capped due date and isUrgent flag', () => {
      vi.useFakeTimers();
      const mockToday = new Date('2026-09-05T08:00:00Z');
      vi.setSystemTime(mockToday);

      const darPayload = {
        title: 'SOP จัดการงานด่วนสายการผลิต',
        department: 'PD',
        requesterId: 'u1',
        docType: 'SOP',
        date: '2026-09-05',
        effectiveDate: '2026-09-06', // Fast track (1 day instead of standard 3 days)
        isDraft: false
      };

      useStore.getState().addDar(darPayload);

      const tasks = useStore.getState().tasks;
      expect(tasks.length).toBe(1);

      const reviewTask = tasks[0];
      expect(reviewTask.type).toBe('Review');
      expect(reviewTask.assigneeId).toBe('U002');
      expect(reviewTask.dueDate).toBe('2026-09-06'); // Capped by effective date!
      expect(reviewTask.isUrgent).toBe(true);
      expect(reviewTask.priority).toBe('URGENT');
      expect(reviewTask.slaType).toBe('FAST_TRACK');
      expect(reviewTask.effectiveDate).toBe('2026-09-06');
    });
  });

  describe('3. Store Integration: Workflow Transition (Reviewer -> Approver)', () => {
    it('dispatches Approver task with capped due date respecting document effective date', () => {
      vi.useFakeTimers();
      const mockToday = new Date('2026-09-05T08:00:00Z');
      vi.setSystemTime(mockToday);

      const darId = 'DAR01-09-26';
      const initialDar = {
        id: darId,
        title: 'WI ตรวจสอบคุณภาพด่วน',
        department: 'PD',
        requesterId: 'u1',
        status: 'UNDER_REVIEW',
        effectiveDate: '2026-09-07' // 2 days later, standard SLA is 3 days
      };

      const existingReviewTask = {
        id: 'task-rev-01',
        darId,
        type: 'Review',
        assigneeId: 'U002',
        dueDate: '2026-09-07',
        status: 'NORMAL'
      };

      useStore.setState({
        dars: [initialDar],
        tasks: [existingReviewTask]
      });

      // Reviewer approves the task
      useStore.getState().processWorkflow('task-rev-01', 'APPROVE', 'ผ่านการทบทวน');

      const tasks = useStore.getState().tasks;
      expect(tasks.length).toBe(1);

      const approverTask = tasks[0];
      expect(approverTask.type).toBe('Approve');
      expect(approverTask.assigneeId).toBe('U003');
      expect(approverTask.dueDate).toBe('2026-09-07'); // Capped at effective date!
      expect(approverTask.isUrgent).toBe(true);
      expect(approverTask.priority).toBe('URGENT');
      expect(approverTask.slaType).toBe('FAST_TRACK');
    });
  });

  describe('4. TaskInbox UI: Fast-Track Urgent Badges and Metadata', () => {
    it('renders the Fast-Track Zap badge and capped due date alert in TaskInbox', () => {
      const urgentTask = {
        id: 't-urgent-999',
        referenceId: 'DAR-URGENT-01',
        darId: 'DAR-URGENT-01',
        title: 'คู่มือปฏิบัติงานเร่งด่วนสำหรับ ISO Audit',
        type: 'Review',
        assigneeId: 'U001',
        dueDate: '2026-09-06',
        effectiveDate: '2026-09-06',
        isUrgent: true,
        priority: 'URGENT',
        slaType: 'FAST_TRACK',
        status: 'NORMAL'
      };

      useStore.setState({
        tasks: [urgentTask],
        dars: [
          {
            id: 'DAR-URGENT-01',
            title: 'คู่มือปฏิบัติงานเร่งด่วนสำหรับ ISO Audit',
            type: 'NEW',
            effectiveDate: '2026-09-06'
          }
        ]
      });

      render(
        <MemoryRouter>
          <TaskInbox />
        </MemoryRouter>
      );

      // Verify Fast-Track badge is rendered
      expect(screen.getByText(/Fast-Track/)).toBeInTheDocument();
    });
  });
});
