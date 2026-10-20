import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import useStore from '../../../store/useStore';
import { generateSchedules, generateTasksForSchedules } from '../services/PeriodicReviewService';
import { isActionableTask } from '../utils/taskFilter';
import { getReviewCycleYears, getReviewStatusFlag } from '../utils/documentUtils';

describe('Periodic Review Engine & Routing Audit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Criterion 1: Strict Exclusion of Superseded & Obsolete Documents', () => {
    it('must NOT include SUPERSEDED, OBSOLETE, or archived documents in schedule generation', () => {
      const internalDocs = [
        { id: 'DOC-1', status: 'ACTIVE', title: 'QP-QA-001', effectiveDate: '2025-10-05' },
        { id: 'DOC-2', status: 'EFFECTIVE', title: 'SOP-PD-001', effectiveDate: '2025-10-05' },
        { id: 'DOC-3', status: 'SUPERSEDED', title: 'QP-QA-001-OLD', effectiveDate: '2024-10-05' },
        { id: 'DOC-4', status: 'OBSOLETE', title: 'WI-WH-001-OBS', effectiveDate: '2024-10-05' },
        { id: 'DOC-5', status: 'SUPERSEDED_ARCHIVED', title: 'FM-HR-001-ARCH', effectiveDate: '2023-10-05' },
        { id: 'DOC-6', status: 'EFFECTIVE', is_superseded: true, title: 'FM-HR-002', effectiveDate: '2025-10-05' },
        { id: 'DOC-7', status: 'ACTIVE', is_obsolete: true, title: 'WI-QC-002', effectiveDate: '2025-10-05' },
      ];

      const externalDocs = [
        { id: 'EXT-1', status: 'ACTIVE', title: 'ISO 9001:2015', receivedDate: '2025-10-05', verification_frequency: 1 },
        { id: 'EXT-2', status: 'SUPERSEDED', title: 'ISO 9001:2008', receivedDate: '2015-10-05' },
        { id: 'EXT-3', status: 'OBSOLETE', title: 'Old Law 1999', receivedDate: '2000-10-05' },
        { id: 'EXT-4', status: 'ACTIVE', is_superseded: true, title: 'TISI 123-OLD', receivedDate: '2024-10-05' },
      ];

      const schedules = generateSchedules(internalDocs, externalDocs, []);
      
      // Only DOC-1, DOC-2 and EXT-1 should be scheduled
      expect(schedules.length).toBe(3);
      const scheduledDocIds = schedules.map(s => s.documentId || s.externalDocumentId);
      expect(scheduledDocIds).toContain('DOC-1');
      expect(scheduledDocIds).toContain('DOC-2');
      expect(scheduledDocIds).toContain('EXT-1');
      expect(scheduledDocIds).not.toContain('DOC-3');
      expect(scheduledDocIds).not.toContain('DOC-4');
      expect(scheduledDocIds).not.toContain('DOC-5');
      expect(scheduledDocIds).not.toContain('DOC-6');
      expect(scheduledDocIds).not.toContain('DOC-7');
      expect(scheduledDocIds).not.toContain('EXT-2');
      expect(scheduledDocIds).not.toContain('EXT-3');
      expect(scheduledDocIds).not.toContain('EXT-4');
    });

    it('must NOT generate tasks for inactive schedules or superseded documents', () => {
      const schedules = [
        {
          id: 'SCH-INACTIVE',
          isActive: false,
          currentScheduledReviewDate: '2026-10-05',
          documentCategory: 'INTERNAL'
        }
      ];

      const tasks = generateTasksForSchedules(schedules, [], new Date('2026-10-05T00:00:00Z'));
      expect(tasks.length).toBe(0);
    });
  });

  describe('Criterion 2: Review Cycle Engine & Status Flag Calculation', () => {
    it('calculates 1 year for QP and SOP, and 2 years for WI and FM', () => {
      expect(getReviewCycleYears('QP')).toBe(1);
      expect(getReviewCycleYears('SOP')).toBe(1);
      expect(getReviewCycleYears('WI')).toBe(2);
      expect(getReviewCycleYears('FM')).toBe(2);

      // By document titles
      expect(getReviewCycleYears('QP-QA-001')).toBe(1);
      expect(getReviewCycleYears('SOP-PD-002')).toBe(1);
      expect(getReviewCycleYears('WI-ENG-003')).toBe(2);
      expect(getReviewCycleYears('FM-QC-004')).toBe(2);
    });

    it('calculates Status Flag correctly: OVERDUE, UPCOMING (<= 30 days), and NORMAL (> 30 days)', () => {
      const today = '2026-10-05';
      
      // OVERDUE: today > next_review_date (diff < 0)
      expect(getReviewStatusFlag('2026-10-04', today)).toBe('OVERDUE');
      expect(getReviewStatusFlag('2026-09-01', today)).toBe('OVERDUE');

      // UPCOMING: next_review_date - today <= 30 days
      expect(getReviewStatusFlag('2026-10-05', today)).toBe('UPCOMING'); // 0 days
      expect(getReviewStatusFlag('2026-10-15', today)).toBe('UPCOMING'); // 10 days
      expect(getReviewStatusFlag('2026-11-04', today)).toBe('UPCOMING'); // 30 days

      // NORMAL: > 30 days
      expect(getReviewStatusFlag('2026-11-06', today)).toBe('NORMAL'); // 32 days
      expect(getReviewStatusFlag('2027-10-05', today)).toBe('NORMAL'); // 1 year
    });

    it('Re-affirm (No Change) advances nextReviewDate by exact cycle years, keeps Revision unchanged, and closes task', () => {
      const internalDoc = {
        id: 'DOC-WI-01',
        title: 'WI-PRD-001',
        name: 'Work Instruction for Production',
        doc_type: 'WI',
        rev: '02',
        revision: '02',
        status: 'EFFECTIVE',
        effectiveDate: '2024-10-05',
        last_reviewed_at: null,
        next_review_date: '2026-10-05',
        review_history: []
      };

      const schedule = {
        id: 'SCH-WI-01',
        documentId: 'DOC-WI-01',
        documentNumber: 'WI-PRD-001',
        documentCategory: 'INTERNAL',
        frequencyMonths: 24,
        cycleYears: 2,
        nextReviewDate: '2026-10-05',
        currentScheduledReviewDate: '2026-10-05',
        status: 'ACTION_REQUIRED',
        isActive: true,
        reviewLogs: []
      };

      const task = {
        id: 'TASK-REV-01',
        scheduleId: 'SCH-WI-01',
        docId: 'DOC-WI-01',
        type: 'PERIODIC_REVIEW',
        taskType: 'PERIODIC_REVIEW',
        status: 'ACTION_REQUIRED',
        actionRequired: true,
        dueDate: '2026-10-05'
      };

      useStore.setState({
        documents: [internalDoc],
        externalDocuments: [],
        periodicReviewSchedules: [schedule],
        periodicReviewTasks: [task],
        tasks: [task],
        periodicReviewRecords: [],
        currentUser: { id: 'U-ENG-1', name: 'Eng Reviewer', department: 'PRD' }
      });

      // Execute Action A: Re-affirm / No Changes
      useStore.getState().confirmPeriodicReviewNoChange({
        scheduleId: 'SCH-WI-01',
        comment: 'ยืนยันกระบวนการยังถูกต้อง ไม่มีการเปลี่ยนแปลง',
        reviewer: 'Eng Reviewer',
        reviewDate: '2026-10-05'
      });

      const store = useStore.getState();
      const updatedDoc = store.documents.find(d => d.id === 'DOC-WI-01');
      const updatedSchedule = store.periodicReviewSchedules.find(s => s.id === 'SCH-WI-01');
      const updatedTask = store.tasks.find(t => t.id === 'TASK-REV-01');

      // 1. Revision MUST NOT change
      expect(updatedDoc.rev).toBe('02');
      expect(updatedDoc.revision).toBe('02');

      // 2. Next review date advances by 2 years for WI (2026-10-05 -> 2028-10-05)
      expect(updatedDoc.next_review_date).toBe('2028-10-05');
      expect(updatedDoc.last_reviewed_at).toBe('2026-10-05');
      expect(updatedSchedule.nextReviewDate).toBe('2028-10-05');

      // 3. review_history record created
      expect(updatedDoc.review_history).toHaveLength(1);
      expect(updatedDoc.review_history[0].reviewer).toBe('Eng Reviewer');
      expect(updatedDoc.review_history[0].outcome).toBe('NO_CHANGE');
      expect(updatedDoc.review_history[0].nextReviewDate).toBe('2028-10-05');

      // 4. Task is closed/completed
      expect(updatedTask.status).toBe('COMPLETED');
      expect(updatedTask.is_completed).toBe(true);
    });
  });

  describe('Criterion 3: External Document Verification Flow & Segregation', () => {
    it('segregates external document verification flow and allows marking as SUPERSEDED when new version is found', () => {
      const extDoc = {
        id: 'EXT-STD-01',
        edCode: 'ED-STD-001',
        title: 'ISO 14001:2015',
        status: 'ACTIVE',
        receivedDate: '2025-10-05',
        verification_frequency: 1,
        review_history: []
      };

      const schedule = {
        id: 'SCH-EXT-01',
        externalDocumentId: 'EXT-STD-01',
        documentNumber: 'ED-STD-001',
        documentCategory: 'EXTERNAL',
        frequencyMonths: 12,
        cycleYears: 1,
        nextReviewDate: '2026-10-05',
        currentScheduledReviewDate: '2026-10-05',
        status: 'ACTION_REQUIRED',
        isActive: true
      };

      const task = {
        id: 'TASK-EXT-VER-01',
        scheduleId: 'SCH-EXT-01',
        docId: 'EXT-STD-01',
        type: 'EXTERNAL_VERIFICATION',
        taskType: 'EXTERNAL_VERIFICATION',
        status: 'ACTION_REQUIRED',
        actionRequired: true,
        dueDate: '2026-10-05'
      };

      useStore.setState({
        documents: [],
        externalDocuments: [extDoc],
        periodicReviewSchedules: [schedule],
        periodicReviewTasks: [task],
        tasks: [task],
        currentUser: { id: 'U-DCC-1', name: 'DCC Officer', department: 'DC', role: 'DCC_STAFF' }
      });

      // Verify that mandatory fields are enforced
      expect(() => {
        useStore.getState().verifyExternalDocument({
          scheduleId: 'SCH-EXT-01',
          docId: 'EXT-STD-01',
          verificationChannel: '',
          verificationResult: 'CURRENT_VALID'
        });
      }).toThrow('กรุณาระบุช่องทางการตรวจสอบและผลการตรวจสอบ');

      // Execute: New Edition Found externally -> marks current doc as SUPERSEDED
      const result = useStore.getState().verifyExternalDocument({
        scheduleId: 'SCH-EXT-01',
        docId: 'EXT-STD-01',
        verificationChannel: 'https://www.iso.org/standard/iso-14001',
        verificationResult: 'NEW_VERSION_FOUND',
        comment: 'ตรวจพบ ISO 14001 ฉบับใหม่เตรียมประกาศใช้',
        reviewer: 'DCC Officer',
        verificationDate: '2026-10-05'
      });

      expect(result.success).toBe(true);
      expect(result.shouldOpenRegister).toBe(true);

      const store = useStore.getState();
      const updatedExtDoc = store.externalDocuments.find(d => d.id === 'EXT-STD-01');
      const updatedSchedule = store.periodicReviewSchedules.find(s => s.id === 'SCH-EXT-01');
      const updatedTask = store.tasks.find(t => t.id === 'TASK-EXT-VER-01');

      // Current document is marked SUPERSEDED
      expect(updatedExtDoc.status).toBe('SUPERSEDED');
      expect(updatedExtDoc.is_superseded).toBe(true);
      expect(updatedExtDoc.superseded_date).toBe('2026-10-05');
      expect(updatedExtDoc.superseded_reason).toContain('https://www.iso.org/standard/iso-14001');

      // Schedule is cancelled/deactivated
      expect(updatedSchedule.isActive).toBe(false);
      expect(updatedSchedule.status).toBe('CANCELLED_BY_DOCUMENT_STATUS');

      // Task is completed
      expect(updatedTask.status).toBe('COMPLETED');
      expect(updatedTask.is_completed).toBe(true);
    });
  });

  describe('Criterion 4: Task Routing & Scoping Segregation', () => {
    it('routes Internal Periodic Review task to document owner department, not DCC/QA by default', () => {
      const internalTask = {
        id: 'T-INT-1',
        type: 'PERIODIC_REVIEW',
        taskType: 'PERIODIC_REVIEW',
        department: 'PRD',
        assignedToDepartmentId: 'PRD',
        status: 'ACTION_REQUIRED'
      };

      const userPrd = { id: 'U-PRD', department: 'PRD', primary_department: 'PRD' };
      const userWh = { id: 'U-WH', department: 'WH', primary_department: 'WH' };
      const userDcc = { id: 'U-DC', department: 'DC', primary_department: 'DC', role: 'DCC_STAFF' };

      expect(isActionableTask(internalTask, userPrd)).toBe(true);
      expect(isActionableTask(internalTask, userWh)).toBe(false);
      expect(isActionableTask(internalTask, userDcc)).toBe(false);
    });

    it('routes External Document Verification task to DCC or QA members only', () => {
      const extTask = {
        id: 'T-EXT-1',
        type: 'EXTERNAL_VERIFICATION',
        taskType: 'EXTERNAL_VERIFICATION',
        department: 'DC',
        status: 'ACTION_REQUIRED'
      };

      const userDcc = { id: 'U-DC', department: 'DC', primary_department: 'DC', role: 'DCC_STAFF' };
      const userQa = { id: 'U-QA', department: 'QA', primary_department: 'QA' };
      const userPrd = { id: 'U-PRD', department: 'PRD', primary_department: 'PRD' };

      expect(isActionableTask(extTask, userDcc)).toBe(true);
      expect(isActionableTask(extTask, userQa)).toBe(true);
      expect(isActionableTask(extTask, userPrd)).toBe(false);
    });
  });
});
