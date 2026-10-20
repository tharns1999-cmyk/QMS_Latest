import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';

describe('Periodic Review DAR Idempotency and Linkage', () => {
  beforeEach(() => {
    // Reset store state for testing
    useStore.setState({
      periodicReviewSchedules: [
        {
          id: 'PR-TEST-1',
          documentId: 'DOC-1',
          status: 'IN_PROGRESS',
          dueState: 'DUE_TODAY'
        }
      ],
      periodicReviewTasks: [],
      periodicReviewRecords: []
    });
  });

  it('submit creates one Revision draft linkage', () => {
    const store = useStore.getState();
    store.submitPeriodicReview('PR-TEST-1', 'REVISION_REQUIRED', 'Needs update', 'DAR-123', 'SUCCESS', 'PERIODIC_REVIEW_PR-TEST-1_REVISION');
    
    const updatedSchedule = useStore.getState().periodicReviewSchedules.find(s => s.id === 'PR-TEST-1');
    expect(updatedSchedule.status).toBe('AWAITING_ACTION'); // revision outcome waits for the linked DAR
    expect(updatedSchedule.outcome).toBe('REVISION_REQUIRED');
    expect(updatedSchedule.linkedActionId).toBe('DAR-123');
    expect(updatedSchedule.linkageStatus).toBe('SUCCESS');
    expect(updatedSchedule.idempotencyKey).toBe('PERIODIC_REVIEW_PR-TEST-1_REVISION');
  });

  it('submit creates one Obsolete draft linkage', () => {
    const store = useStore.getState();
    store.submitPeriodicReview('PR-TEST-1', 'OBSOLETE_REQUIRED', 'Not needed', 'DAR-124', 'SUCCESS', 'PERIODIC_REVIEW_PR-TEST-1_OBSOLETE');
    
    const updatedSchedule = useStore.getState().periodicReviewSchedules.find(s => s.id === 'PR-TEST-1');
    expect(updatedSchedule.outcome).toBe('OBSOLETE_REQUIRED');
    expect(updatedSchedule.linkedActionId).toBe('DAR-124');
    expect(updatedSchedule.idempotencyKey).toBe('PERIODIC_REVIEW_PR-TEST-1_OBSOLETE');
  });

  it('deterministic DAR failure and retry logic', () => {
    const store = useStore.getState();
    const initialDarCount = store.dars ? store.dars.length : 0;

    // Simulate dependency injection of a DAR creation service
    const mockDarAdapter = (shouldFail) => (payload) => {
      if (shouldFail) {
        throw new Error('Network Error: DAR service unreachable');
      } else {
        return useStore.getState().addDarAndReturnId(payload);
      }
    };

    // 1. Submit a Periodic Review requiring Revision.
    // 2. Inject a DAR creation dependency that throws a controlled error.
    // 3. Confirm the actual Periodic Review result remains saved.
    store.submitPeriodicReviewWithDarAction(
      'PR-TEST-1', 
      'REVISION_REQUIRED', 
      'Needs update', 
      { type: 'REVISION', isDraft: true, title: 'Revise DOC-1' },
      mockDarAdapter(true)
    );
    
    let schedule = useStore.getState().periodicReviewSchedules.find(s => s.id === 'PR-TEST-1');
    expect(schedule.outcome).toBe('REVISION_REQUIRED');
    
    // 4. Confirm linkageStatus becomes FAILED.
    expect(schedule.linkageStatus).toBe('FAILED');
    
    // 5. Confirm no linked DAR exists after the failed attempt.
    expect(schedule.linkedActionId).toBeFalsy();
    
    // 6. Confirm no DAR draft was added.
    const currentDarCount = useStore.getState().dars ? useStore.getState().dars.length : 0;
    expect(currentDarCount).toBe(initialDarCount);
    
    // 7. Change the dependency to succeed and Invoke retry
    store.retryPeriodicReviewLinkageWithDarAction(
      'PR-TEST-1', 
      { type: 'REVISION', isDraft: true, title: 'Revise DOC-1' },
      mockDarAdapter(false)
    );
    
    schedule = useStore.getState().periodicReviewSchedules.find(s => s.id === 'PR-TEST-1');
    expect(schedule.linkageStatus).toBe('SUCCESS');
    expect(schedule.linkedActionId).toBeTruthy();

    // 8. Confirm exactly one DAR draft is created.
    const createdDars = useStore.getState().dars.filter(d => d.id === schedule.linkedActionId);
    expect(createdDars.length).toBe(1);
    
    // 9. Confirm DAR status is DRAFT.
    expect(createdDars[0].status).toBe('DRAFT');
    
    // 10. Invoke retry again.
    // 11. Confirm no duplicate DAR is created.
    store.retryPeriodicReviewLinkageWithDarAction(
      'PR-TEST-1', 
      { type: 'REVISION', isDraft: true, title: 'Revise DOC-1' },
      mockDarAdapter(false)
    );
    const finalDarCount = useStore.getState().dars.length;
    expect(finalDarCount).toBe(initialDarCount + 1); // Still only 1 added
  });
});
