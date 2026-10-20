import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';
import { addYears } from '../utils/documentUtils';

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

  it('Revision runtime integration: retires the source cycle and schedules the new revision by its doc-type cycle', () => {
    const today = new Date().toISOString().split('T')[0];
    useStore.setState({
      periodicReviewSchedules: [{ id: 'SCH-REV-01', documentId: 'DOC-01', documentCategory: 'INTERNAL', status: 'IN_PROGRESS', outcome: 'REVISION_REQUIRED', isActive: true, linkageStatus: 'SUCCESS' }],
      documents: [{ id: 'DOC-01', title: 'WI-QC-09', status: 'EFFECTIVE', rev: '01' }],
      dars: [{ id: 'DAR-REV-01', type: 'REVISION', sourceType: 'PERIODIC_REVIEW', sourceId: 'SCH-REV-01', targetDocumentId: 'DOC-01', status: 'APPROVED_WAITING_EFFECTIVE', effectiveDate: today, docIdRef: 'DOC-01' }]
    });

    useStore.getState().checkSLA();

    const state = useStore.getState();
    expect(state.dars.find(d => d.id === 'DAR-REV-01').status).toBe('COMPLETED');
    const source = state.periodicReviewSchedules.find(s => s.id === 'SCH-REV-01');
    expect(source).toMatchObject({ linkageStatus: 'COMPLETED', status: 'COMPLETED_WITH_REVISION', isActive: false });

    const newRev = state.documents.find(d => d.status === 'EFFECTIVE');
    expect(newRev.id).not.toBe('DOC-01');
    const active = state.periodicReviewSchedules.filter(s => s.isActive !== false);
    expect(active).toHaveLength(1);
    // WI is a 2-year cycle, anchored on the new revision's effective date (was hard-coded to 12 months)
    expect(active[0]).toMatchObject({ documentId: newRev.id, nextReviewDate: addYears(today, 2), currentScheduledReviewDate: addYears(today, 2) });

    useStore.getState().checkSLA();
    expect(useStore.getState().periodicReviewSchedules.filter(s => s.isActive !== false)).toHaveLength(1);
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
});
