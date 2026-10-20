import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';

describe('Periodic Review DAR Completion Runtime', () => {
  beforeEach(() => {
    useStore.setState({
      tasks: [],
      dars: [],
      documents: [],
      timeline: [],
      periodicReviewSchedules: []
    });
  });

  it('Revision runtime integration: completes linkage and generates +1 year schedule deterministically', () => {
    // 1. Create linked Revision DAR
    const mockSchedule = {
      id: 'SCH-REV-01',
      documentId: 'DOC-01',
      documentCategory: 'INTERNAL',
      status: 'IN_PROGRESS',
      outcome: 'REVISION_REQUIRED',
      isActive: true,
      linkageStatus: 'SUCCESS'
    };

    const mockDoc = {
      id: 'DOC-01',
      title: 'SOP-01',
      status: 'EFFECTIVE',
      rev: '01'
    };

    const mockDar = {
      id: 'DAR-REV-01',
      type: 'REVISION',
      sourceType: 'PERIODIC_REVIEW',
      sourceId: 'SCH-REV-01',
      targetDocumentId: 'DOC-01',
      status: 'APPROVED_WAITING_EFFECTIVE',
      effectiveDate: new Date().toISOString().split('T')[0],
      actualEffectiveDate: '2026-07-20',
      docIdRef: 'DOC-01'
    };

    useStore.setState({ 
      periodicReviewSchedules: [mockSchedule],
      documents: [mockDoc],
      dars: [mockDar]
    });

    // 2. Invoke real finalization action (checkSLA)
    useStore.getState().checkSLA();

    // 3. Verify status changed to COMPLETED
    const stateAfterSla = useStore.getState();
    const completedDar = stateAfterSla.dars.find(d => d.id === 'DAR-REV-01');
    expect(completedDar.status).toBe('COMPLETED');

    // 4. Verify originating schedule linkageStatus becomes COMPLETED
    const origSchedule = stateAfterSla.periodicReviewSchedules.find(s => s.id === 'SCH-REV-01');
    expect(origSchedule.linkageStatus).toBe('COMPLETED');

    // 5. Verify exactly one next schedule exists
    const nextSchedules = stateAfterSla.periodicReviewSchedules.filter(s => s.id !== 'SCH-REV-01');
    expect(nextSchedules).toHaveLength(1);

    // 6. Verify next review due date equals Actual Effective Date + 1 year
    const nextSchedule = nextSchedules[0];
    expect(nextSchedule.dueDate).toBe('2027-07-20');
    expect(nextSchedule.documentCategory).toBe('INTERNAL');

    // 7. Run the finalization action again
    useStore.getState().checkSLA();

    // 8. Still exactly one next schedule exists (idempotency)
    const stateAfterRetry = useStore.getState();
    const nextSchedulesRetry = stateAfterRetry.periodicReviewSchedules.filter(s => s.id !== 'SCH-REV-01');
    expect(nextSchedulesRetry).toHaveLength(1);
  });

  it('Obsolete runtime integration: completes linkage and cancels future schedules without creating new ones', () => {
    // 1. Create linked Obsolete DAR
    const mockSchedule = {
      id: 'SCH-OBS-01',
      documentId: 'DOC-02',
      documentCategory: 'INTERNAL',
      status: 'IN_PROGRESS',
      outcome: 'OBSOLETE_REQUIRED',
      isActive: true,
      linkageStatus: 'SUCCESS'
    };
    
    const futureSchedule = {
      id: 'SCH-OBS-FUTURE',
      documentId: 'DOC-02',
      documentCategory: 'INTERNAL',
      status: 'NOT_YET_DUE',
      isActive: true,
      linkageStatus: null
    };

    const mockDoc = {
      id: 'DOC-02',
      title: 'SOP-02',
      status: 'EFFECTIVE',
      rev: '01'
    };

    const mockDar = {
      id: 'DAR-OBS-01',
      type: 'OBSOLETE',
      sourceType: 'PERIODIC_REVIEW',
      sourceId: 'SCH-OBS-01',
      targetDocumentId: 'DOC-02',
      status: 'APPROVED_WAITING_EFFECTIVE',
      effectiveDate: new Date().toISOString().split('T')[0],
      docIdRef: 'DOC-02'
    };

    useStore.setState({ 
      periodicReviewSchedules: [mockSchedule, futureSchedule],
      documents: [mockDoc],
      dars: [mockDar]
    });

    // 2. Invoke real final completion action
    useStore.getState().checkSLA();

    // 3. DAR becomes COMPLETED
    const stateAfterSla = useStore.getState();
    const completedDar = stateAfterSla.dars.find(d => d.id === 'DAR-OBS-01');
    expect(completedDar.status).toBe('COMPLETED');

    // 4. Originating schedule linkageStatus becomes COMPLETED
    const origSchedule = stateAfterSla.periodicReviewSchedules.find(s => s.id === 'SCH-OBS-01');
    expect(origSchedule.linkageStatus).toBe('COMPLETED');

    // 5. No next review schedule is generated & Applicable future open schedules are stopped
    const schedules = stateAfterSla.periodicReviewSchedules;
    expect(schedules).toHaveLength(2); // Original + cancelled future one
    
    const checkedFuture = schedules.find(s => s.id === 'SCH-OBS-FUTURE');
    expect(checkedFuture.status).toBe('CANCELLED');
    expect(checkedFuture.isActive).toBe(false);

    // 6. Repeated execution remains idempotent
    useStore.getState().checkSLA();
    const stateAfterRetry = useStore.getState();
    expect(stateAfterRetry.periodicReviewSchedules).toHaveLength(2);
  });

  it('Manual DAR negative tests: manual workflows do not alter Periodic Review', () => {
    const mockSchedule = {
      id: 'SCH-01',
      documentId: 'DOC-03',
      documentCategory: 'INTERNAL',
      status: 'NOT_YET_DUE',
      isActive: true
    };

    const manualRevisionDar = {
      id: 'DAR-MANUAL-REV',
      type: 'REVISION',
      sourceType: 'MANUAL', // Not PERIODIC_REVIEW
      targetDocumentId: 'DOC-03',
      status: 'APPROVED_WAITING_EFFECTIVE',
      effectiveDate: new Date().toISOString().split('T')[0],
      actualEffectiveDate: '2026-07-20',
      docIdRef: 'DOC-03'
    };
    
    const manualObsoleteDar = {
      id: 'DAR-MANUAL-OBS',
      type: 'OBSOLETE',
      sourceType: 'MANUAL',
      targetDocumentId: 'DOC-03',
      status: 'APPROVED_WAITING_EFFECTIVE',
      effectiveDate: new Date().toISOString().split('T')[0],
      docIdRef: 'DOC-03'
    };

    useStore.setState({ 
      periodicReviewSchedules: [mockSchedule],
      documents: [{ id: 'DOC-03', title: 'SOP-03', status: 'EFFECTIVE' }],
      dars: [manualRevisionDar, manualObsoleteDar]
    });

    useStore.getState().checkSLA();
    
    const state = useStore.getState();
    const schedule = state.periodicReviewSchedules[0];
    
    // Nothing was altered
    expect(state.periodicReviewSchedules).toHaveLength(1);
    expect(schedule.status).toBe('NOT_YET_DUE');
    expect(schedule.linkageStatus).toBeUndefined();
  });

  it('Negative test: linked DAR waiting effective does not synchronize', () => {
     const mockSchedule = { id: 'SCH-1', linkageStatus: 'SUCCESS' };
     const mockDar = { id: 'DAR-1', sourceType: 'PERIODIC_REVIEW', sourceId: 'SCH-1', type: 'REVISION', status: 'APPROVED_WAITING_EFFECTIVE', effectiveDate: '2099-01-01' }; // Future date so it stays waiting
     
     useStore.setState({ periodicReviewSchedules: [mockSchedule], dars: [mockDar] });
     useStore.getState().checkSLA();
     
     const state = useStore.getState();
     expect(state.dars[0].status).toBe('APPROVED_WAITING_EFFECTIVE');
     expect(state.periodicReviewSchedules[0].linkageStatus).toBe('SUCCESS'); // Unchanged
  });

  it('Negative test: missing Actual Effective Date fails safely without creating next schedule', () => {
    const mockSchedule = { id: 'SCH-REV-02', documentId: 'DOC-04', isActive: true, linkageStatus: 'SUCCESS' };
    const mockDar = {
      id: 'DAR-REV-02',
      type: 'REVISION',
      sourceType: 'PERIODIC_REVIEW',
      sourceId: 'SCH-REV-02',
      targetDocumentId: 'DOC-04',
      status: 'APPROVED_WAITING_EFFECTIVE',
      effectiveDate: new Date().toISOString().split('T')[0],
      actualEffectiveDate: null, // Missing!
      docIdRef: 'DOC-04'
    };

    useStore.setState({ 
      periodicReviewSchedules: [mockSchedule],
      documents: [{ id: 'DOC-04', title: 'SOP-04', status: 'EFFECTIVE' }],
      dars: [mockDar]
    });

    useStore.getState().checkSLA();

    const state = useStore.getState();
    expect(state.dars[0].status).toBe('COMPLETED');
    expect(state.periodicReviewSchedules).toHaveLength(1); // No new schedule generated
    expect(state.periodicReviewSchedules[0].syncError).toBe('MISSING_ACTUAL_EFFECTIVE_DATE'); // Safely marked error
  });
});
