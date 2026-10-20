import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import useStore, { 
  getInitialStoreState,
  defaultSeedDocuments, 
  defaultSeedDars, 
  defaultSeedTasks, 
  defaultSeedCopies 
} from '../../../store/useStore';

describe('Baseline Seed Initialization & Resilient Zustand Hydration Tests', () => {
  beforeEach(() => {
    useStore.getState().resetStore();
  });

  it('1. Initial State contains empty collections for transaction data (No auto-seed on clean start)', () => {
    const initialState = getInitialStoreState();
    
    // Empty collections verification
    expect(initialState.documents).toEqual([]);
    expect(initialState.dars).toEqual([]);
    expect(initialState.tasks).toEqual([]);
    expect(initialState.controlledCopies).toEqual([]);
  });

  it('2. Baseline Seed Documents cover all required documents (SOP-QC-01, WI-QC-01, Active & Superseded)', () => {
    const docs = defaultSeedDocuments;

    // Active SOP-QC-01 Rev.01
    const sopActive = docs.find(d => (d.code === 'SOP-QC-01' || d.document_code === 'SOP-QC-01') && (d.rev === '01' || d.revision === '01'));
    expect(sopActive).toBeDefined();
    expect(sopActive.status).toBe('EFFECTIVE');
    expect(sopActive.department).toBe('QC');

    // Superseded SOP-QC-01 Rev.00
    const sopSuperseded = docs.find(d => (d.code === 'SOP-QC-01' || d.document_code === 'SOP-QC-01') && (d.rev === '00' || d.revision === '00'));
    expect(sopSuperseded).toBeDefined();
    expect(sopSuperseded.status).toBe('SUPERSEDED');

    // Active WI-QC-01 Rev.01
    const wiActive = docs.find(d => (d.code === 'WI-QC-01' || d.document_code === 'WI-QC-01') && (d.rev === '01' || d.revision === '01'));
    expect(wiActive).toBeDefined();
    expect(wiActive.status).toBe('EFFECTIVE');

    // Superseded WI-QC-01 Rev.00
    const wiSuperseded = docs.find(d => (d.code === 'WI-QC-01' || d.document_code === 'WI-QC-01') && (d.rev === '00' || d.revision === '00'));
    expect(wiSuperseded).toBeDefined();
    expect(wiSuperseded.status).toBe('SUPERSEDED');
  });

  it('3. Baseline Seed DARs cover DAR-2026-001, DAR-2026-002, and DAR-2026-003 across statuses', () => {
    const dars = defaultSeedDars;

    const dar1 = dars.find(d => d.id === 'DAR-2026-001');
    expect(dar1).toBeDefined();
    expect(dar1.status).toBe('COMPLETED');

    const dar2 = dars.find(d => d.id === 'DAR-2026-002');
    expect(dar2).toBeDefined();
    expect(dar2.status).toBe('COMPLETED');

    const dar3 = dars.find(d => d.id === 'DAR-2026-003');
    expect(dar3).toBeDefined();
    expect(dar3.status).toBe('PENDING_REVIEW');
    expect(dar3.reviewerId).toBe('U003');
  });

  it('4. Baseline Seed Tasks cover Distribution, Recall, Review, and Receipt tasks properly scoped to departments', () => {
    const tasks = defaultSeedTasks;

    // Distribution Task (DC)
    const distTask = tasks.find(t => t.id === 'task-dist-sop-qc-01-rev01');
    expect(distTask).toBeDefined();
    expect(distTask.type).toBe('DISTRIBUTE_HARDCOPY');
    expect(distTask.department).toBe('DC');

    // Recall Task (DC)
    const recallTask = tasks.find(t => t.id === 'task-recall-sop-qc-01-rev00');
    expect(recallTask).toBeDefined();
    expect(recallTask.type).toBe('RECALL_HARDCOPY');
    expect(recallTask.department).toBe('DC');

    // Review Task (QC)
    const reviewTask = tasks.find(t => t.id === 'task-review-dar-2026-003');
    expect(reviewTask).toBeDefined();
    expect(reviewTask.type).toBe('REVIEW');
    expect(reviewTask.department).toBe('QC');
    expect(reviewTask.assigneeId).toBe('U003');

    // Receipt Task (QC)
    const receiptTask = tasks.find(t => t.id === 'task-receipt-sop-qc-01-rev01');
    expect(receiptTask).toBeDefined();
    expect(receiptTask.category).toBe('RECEIPT');
    expect(receiptTask.location).toBe('QC Office');
    expect(receiptTask.target_department).toBe('QC');
  });

  it('5. Baseline Seed Controlled Copies contains QC Office point-of-use physical copy', () => {
    const copies = defaultSeedCopies;
    const qcCopy = copies.find(c => c.id === 'COPY_SOP-QC-01_REV01_01');
    expect(qcCopy).toBeDefined();
    expect(qcCopy.location).toBe('QC Office');
    expect(qcCopy.status).toBe('ISSUED_ACTIVE');
    expect(qcCopy.department).toBe('QC');
  });

  it('6. Zero Auto-Seed on Rehydration: Cleared / Empty localStorage remains empty without auto-seeding mock data', () => {
    // Simulate cleared localStorage state
    useStore.setState({
      documents: [],
      masterDocuments: [],
      supersededDocuments: [],
      dars: [],
      darRequests: [],
      tasks: [],
      controlledCopies: [],
      documentControlledCopies: [],
      controlledCopyInstances: []
    });

    expect(useStore.getState().documents).toHaveLength(0);
    expect(useStore.getState().dars).toHaveLength(0);

    // Trigger rehydration callback
    const persistOptions = useStore.persist?.getOptions?.();
    const onRehydrate = persistOptions?.onRehydrateStorage?.();
    expect(typeof onRehydrate).toBe('function');

    act(() => {
      onRehydrate(useStore.getState());
    });

    // Should remain strictly empty — NO auto-seeding on reload
    const rehydrated = useStore.getState();
    expect(rehydrated.documents).toEqual([]);
    expect(rehydrated.dars).toEqual([]);
    expect(rehydrated.tasks).toEqual([]);
    expect(rehydrated.controlledCopies).toEqual([]);
  });

  it('7. Resilient Rehydration: Existing user-created data in localStorage is preserved and NOT overwritten', () => {
    const userDoc = {
      id: 'USER-DOC-CREATED-999',
      code: 'WI-TEST-99',
      document_code: 'WI-TEST-99',
      title: 'WI-TEST-99',
      name: 'เอกสารที่ผู้ใช้งานสร้างขึ้นจริง',
      status: 'EFFECTIVE',
      department: 'QC'
    };

    const userDar = {
      id: 'DAR-USER-777',
      darNo: 'DAR-USER-777',
      doc_code: 'WI-TEST-99',
      status: 'PENDING_REVIEW',
      department: 'QC'
    };

    useStore.setState({
      documents: [userDoc],
      masterDocuments: [userDoc],
      dars: [userDar],
      darRequests: [userDar]
    });

    const persistOptions = useStore.persist?.getOptions?.();
    const onRehydrate = persistOptions?.onRehydrateStorage?.();

    act(() => {
      onRehydrate(useStore.getState());
    });

    const finalState = useStore.getState();
    expect(finalState.documents).toHaveLength(1);
    expect(finalState.documents[0].id).toBe('USER-DOC-CREATED-999');
    expect(finalState.dars).toHaveLength(1);
    expect(finalState.dars[0].id).toBe('DAR-USER-777');
  });

  it('8. Resilient Rehydration: Hydration error does not auto-seed mock data or corrupt state', () => {
    useStore.setState({
      documents: [],
      dars: []
    });

    const persistOptions = useStore.persist?.getOptions?.();
    const onRehydrate = persistOptions?.onRehydrateStorage?.();

    act(() => {
      onRehydrate(null, new Error('Corrupted LocalStorage JSON'));
    });

    const recoveredState = useStore.getState();
    // No automatic mock data should be seeded on error
    expect(recoveredState.documents).toEqual([]);
    expect(recoveredState.dars).toEqual([]);
  });

  it('9. Manual resetToDefaultSeed() restores baseline seed data anytime', () => {
    useStore.setState({
      documents: [{ id: 'CUSTOM-1' }],
      dars: [{ id: 'CUSTOM-DAR-1' }]
    });

    act(() => {
      useStore.getState().resetToDefaultSeed();
    });

    const state = useStore.getState();
    expect(state.documents).toEqual(defaultSeedDocuments);
    expect(state.dars).toEqual(defaultSeedDars);
    expect(state.tasks).toEqual(defaultSeedTasks);
    expect(state.controlledCopies).toEqual(defaultSeedCopies);
  });
});
