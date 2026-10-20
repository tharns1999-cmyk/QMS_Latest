import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  generateSchedules, 
  generateTasksForSchedules, 
  getDueState
} from './PeriodicReviewService';

describe('PeriodicReviewService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateSchedules', () => {
    it('generates 1-year interval schedule for internal documents', () => {
      const internalDocs = [{
        id: 'DOC-INT-1',
        status: 'EFFECTIVE',
        title: 'PD-SOP-001',
        name: 'Operation',
        ownerId: 'U1',
        department: 'PD',
        effectiveDate: '2025-07-14'
      }];
      
      const schedules = generateSchedules(internalDocs, [], []);
      expect(schedules.length).toBe(1);
      expect(schedules[0].documentCategory).toBe('INTERNAL');
      expect(schedules[0].frequencyMonths).toBe(12);
      expect(schedules[0].nextReviewDate).toBe('2026-07-14');
      expect(schedules[0].ownerDepartmentId).toBe('PD');
    });

    it('generates 2-year interval schedule for external documents with verification_frequency = 2', () => {
      const externalDocs = [{
        id: 'DOC-EXT-1',
        status: 'ACTIVE',
        title: 'ISO-9001',
        ownerId: 'U2',
        department: 'QA',
        receivedDate: '2024-07-14',
        verification_frequency: 2
      }];

      const schedules = generateSchedules([], externalDocs, []);
      expect(schedules.length).toBe(1);
      expect(schedules[0].documentCategory).toBe('EXTERNAL');
      expect(schedules[0].frequencyMonths).toBe(24);
      expect(schedules[0].nextReviewDate).toBe('2026-07-14');
    });

    it('generates 1-year interval schedule for external documents by default when verification_frequency is omitted', () => {
      const externalDocs = [{
        id: 'DOC-EXT-DEFAULT',
        status: 'ACTIVE',
        title: 'Industrial Standard',
        receivedDate: '2025-07-14'
      }];

      const schedules = generateSchedules([], externalDocs, []);
      expect(schedules.length).toBe(1);
      expect(schedules[0].documentCategory).toBe('EXTERNAL');
      expect(schedules[0].frequencyMonths).toBe(12);
      expect(schedules[0].nextReviewDate).toBe('2026-07-14');
    });

    it('preserves canonical ownerDepartmentId and prevents duplicates', () => {
      const internalDocs = [{
        id: 'DOC-INT-2',
        status: 'EFFECTIVE',
        department: 'WH'
      }];
      
      const existing = [{
        id: 'SCH-EXIST',
        documentId: 'DOC-INT-2',
        documentCategory: 'INTERNAL',
        isActive: true
      }];

      const schedules = generateSchedules(internalDocs, [], existing);
      expect(schedules.length).toBe(1); // Only the existing one
      expect(schedules[0].id).toBe('SCH-EXIST');
    });

    it('ignores invalid or ineligible records', () => {
      const internalDocs = [{
        id: 'DOC-INT-OBSOLETE',
        status: 'OBSOLETE' // Not EFFECTIVE
      }];
      const externalDocs = [{
        id: 'DOC-EXT-OBSOLETE',
        status: 'OBSOLETE' // Not ACTIVE
      }];

      const schedules = generateSchedules(internalDocs, externalDocs, []);
      expect(schedules.length).toBe(0);
    });

    it('creates next cycle schedule when previous is completed', () => {
       // Based on implementation, a completed schedule might be marked isActive = false or another state.
       // Current generateSchedules looks for: s.documentId === doc.id && s.documentCategory === 'INTERNAL' && s.isActive
       const internalDocs = [{ id: 'DOC-INT-3', status: 'EFFECTIVE' }];
       const existing = [{
         id: 'SCH-OLD',
         documentId: 'DOC-INT-3',
         documentCategory: 'INTERNAL',
         isActive: false // Previous cycle completed and closed
       }];
       
       const schedules = generateSchedules(internalDocs, [], existing);
       expect(schedules.length).toBe(2); // The existing inactive one, plus the new active one
       expect(schedules[1].isActive).toBe(true);
    });
  });

  describe('generateTasksForSchedules', () => {
    it('eligible due schedule generates expected review task', () => {
      const schedules = [{
        id: 'SCH-01',
        isActive: true,
        currentScheduledReviewDate: '2026-07-20', // Due in 6 days -> DUE_SOON_7
        responsibleUserId: 'U1',
        ownerDepartmentId: 'PD',
        documentNumber: 'DOC-01'
      }];

      const tasks = generateTasksForSchedules(schedules, [], new Date('2026-07-14T00:00:00Z'));
      expect(tasks.length).toBe(1);
      expect(tasks[0].scheduleId).toBe('SCH-01');
      expect(tasks[0].status).toBe('ACTION_REQUIRED');
      expect(tasks[0].dueState).toBe('DUE_SOON_7');
      expect(tasks[0].assignedToDepartmentId).toBe('PD');
      expect(tasks[0].assignedToUserId).toBe('U1');
    });

    it('re-running task generation does not create duplicate active task', () => {
      const schedules = [{
        id: 'SCH-01',
        isActive: true,
        currentScheduledReviewDate: '2026-07-14'
      }];
      const existingTasks = [{
        id: 'TASK-1',
        scheduleId: 'SCH-01',
        status: 'ACTION_REQUIRED',
        dueDate: '2026-07-14'
      }];

      const tasks = generateTasksForSchedules(schedules, existingTasks, new Date('2026-07-14T00:00:00Z'));
      expect(tasks.length).toBe(1);
      expect(tasks[0].dueState).toBe('DUE_TODAY'); // Updates due state of existing task
    });

    it('completed schedule does not generate another open task', () => {
      const schedules = [{
        id: 'SCH-01',
        isActive: false // Schedule is not active
      }];
      
      const tasks = generateTasksForSchedules(schedules, [], new Date('2026-07-14T00:00:00Z'));
      expect(tasks.length).toBe(0);
    });

    it('future schedule outside window does not create task', () => {
      const schedules = [{
        id: 'SCH-01',
        isActive: true,
        currentScheduledReviewDate: '2027-07-14' // Over 300 days out -> NOT_YET_DUE
      }];

      const tasks = generateTasksForSchedules(schedules, [], new Date('2026-07-14T00:00:00Z'));
      expect(tasks.length).toBe(0);
    });

    it('overdue schedule behavior follows existing logic', () => {
      const schedules = [{
        id: 'SCH-01',
        isActive: true,
        currentScheduledReviewDate: '2026-07-01' // 13 days past due -> OVERDUE
      }];

      const tasks = generateTasksForSchedules(schedules, [], new Date('2026-07-14T00:00:00Z'));
      expect(tasks.length).toBe(1);
      expect(tasks[0].dueState).toBe('OVERDUE');
      expect(tasks[0].escalationLevel).toBe(0);
    });
    
    it('escalated schedule sets escalationLevel 1', () => {
      const schedules = [{
        id: 'SCH-02',
        isActive: true,
        currentScheduledReviewDate: '2026-01-01' // >30 days past due -> ESCALATED
      }];

      const tasks = generateTasksForSchedules(schedules, [], new Date('2026-07-14T00:00:00Z'));
      expect(tasks[0].dueState).toBe('ESCALATED');
      expect(tasks[0].escalationLevel).toBe(1);
    });
  });

  describe('getDueState', () => {
    const ref = new Date('2026-07-14T00:00:00Z');

    it('returns NOT_YET_DUE for more than 60 days remaining', () => {
      expect(getDueState('2026-09-15', ref)).toBe('NOT_YET_DUE'); // ~63 days
    });

    it('returns DUE_SOON_60 for exactly 60 days remaining', () => {
      expect(getDueState('2026-09-12', ref)).toBe('DUE_SOON_60');
    });

    it('returns DUE_SOON_30 for exactly 30 days remaining', () => {
      expect(getDueState('2026-08-13', ref)).toBe('DUE_SOON_30');
    });

    it('returns DUE_SOON_7 for 7 days remaining', () => {
      expect(getDueState('2026-07-21', ref)).toBe('DUE_SOON_7');
    });

    it('returns DUE_TODAY for due today', () => {
      expect(getDueState('2026-07-14', ref)).toBe('DUE_TODAY');
    });

    it('returns OVERDUE for 1 day past due', () => {
      expect(getDueState('2026-07-13', ref)).toBe('OVERDUE');
    });

    it('returns ESCALATED for >= 30 days past due', () => {
      expect(getDueState('2026-06-14', ref)).toBe('ESCALATED');
    });

    it('works with ISO timestamps', () => {
      expect(getDueState('2026-07-14T15:30:00Z', ref)).toBe('DUE_TODAY');
    });
  });
});
