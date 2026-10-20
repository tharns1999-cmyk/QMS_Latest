import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';
import { formatQmsDisplayDate } from '../../../shared/utils/dateFormatter';
import { getPeriodicReviewForUser } from '../services/PeriodicReviewAccessService';

describe('Unified Periodic Review Workflow Tests', () => {
  beforeEach(() => {
    useStore.setState({
      currentUser: { id: 'U001', name: 'Tester', role: 'DCC_ADMIN', isDcc: true, level: 4, department: 'DC', depts: ['DC'], managedDepartments: ['*'] },
      periodicReviewSchedules: [
        {
          id: 'SCH-TEST-1',
          documentId: 'doc-001',
          documentNumber: 'SOP-QA-001',
          documentName: 'Standard Operating Procedure Quality',
          ownerDepartmentId: 'QA',
          status: 'ACTION_REQUIRED',
          dueState: 'OVERDUE',
          currentScheduledReviewDate: '2028-10-09',
          nextReviewDate: '2028-10-09',
          originalReviewAnchorDate: '2027-10-09',
          documentCategory: 'INTERNAL',
          reviewLogs: []
        }
      ],
      tasks: [
        {
          id: 'TASK-PR-123',
          scheduleId: 'SCH-TEST-1',
          type: 'PERIODIC_REVIEW',
          taskType: 'PERIODIC_REVIEW',
          docCode: 'SOP-QA-001',
          documentNumber: 'SOP-QA-001',
          document_code: 'SOP-QA-001',
          docId: 'doc-001',
          status: 'ACTION_REQUIRED',
          department: 'QA'
        }
      ],
      documents: [
        {
          id: 'doc-001',
          code: 'SOP-QA-001',
          title: 'Standard Operating Procedure Quality',
          department: 'QA',
          effectiveDate: '2027-10-09',
          next_review_date: '2028-10-09'
        }
      ]
    });
  });

  it('resolves review schedule by docCode, documentId, or scheduleId', () => {
    const schedules = useStore.getState().periodicReviewSchedules;
    const docs = useStore.getState().documents;
    const user = useStore.getState().currentUser;

    // By schedule id
    const resById = getPeriodicReviewForUser('SCH-TEST-1', user, schedules, docs);
    expect(resById.status).toBe('SUCCESS');
    expect(resById.data.documentNumber).toBe('SOP-QA-001');

    // By docCode
    const resByDocCode = getPeriodicReviewForUser('SOP-QA-001', user, schedules, docs);
    expect(resByDocCode.status).toBe('SUCCESS');
    expect(resByDocCode.data.id).toBe('SCH-TEST-1');
  });

  it('marks task in Task Inbox as COMPLETED when submitPeriodicReview is called with taskId', () => {
    const store = useStore.getState();
    const taskBefore = store.tasks.find(t => t.id === 'TASK-PR-123');
    expect(taskBefore.status).toBe('ACTION_REQUIRED');

    // Submit with standardized schema and taskId
    store.submitPeriodicReview({
      scheduleId: 'SCH-TEST-1',
      outcome: 'NO_CHANGE',
      comment: 'Verified no change needed for this review cycle',
      taskId: 'TASK-PR-123',
      reviewDetails: {
        outcome: 'NO_CHANGE',
        reason: 'Verified no change needed for this review cycle',
        findings: 'No non-conformities found',
        standard_clause: 'ISO 9001 Requirement',
        evidence_reference: 'Audit Report 2028',
        additional_comment: 'Keep standard as is'
      }
    });

    const tasksAfter = useStore.getState().tasks;
    const taskAfter = tasksAfter.find(t => t.id === 'TASK-PR-123');
    expect(taskAfter.status).toBe('COMPLETED');
    expect(taskAfter.is_completed).toBe(true);

    // Verify standardized review logs and record schema
    const records = useStore.getState().periodicReviewRecords;
    expect(records.length).toBeGreaterThan(0);
    const lastRecord = records[records.length - 1];
    expect(lastRecord.reason).toBe('Verified no change needed for this review cycle');
    expect(lastRecord.findings).toBe('No non-conformities found');
    expect(lastRecord.standard_clause).toBe('ISO 9001 Requirement');
    expect(lastRecord.evidence_reference).toBe('Audit Report 2028');
    expect(lastRecord.additional_comment).toBe('Keep standard as is');
  });

  it('formats dates consistently using international CE year without Buddhist Era skew', () => {
    const formatted = formatQmsDisplayDate('2028-10-09');
    expect(formatted).toContain('2028');
    expect(formatted).not.toContain('2571');
    expect(formatted).toBe('9 ต.ค. 2028');

    const formattedIso = formatQmsDisplayDate('2028-10-09', true);
    expect(formattedIso).toBe('2028-10-09');
  });
});
