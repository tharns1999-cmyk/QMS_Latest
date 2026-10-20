import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';
import { getMockQaSeedData } from '../../../store/fixtures/mockQaWorkflowSeed';

describe('QA Comprehensive Workflow Mock Data Engine & State Seeding Tests', () => {
  beforeEach(() => {
    useStore.getState().resetStore();
  });

  it('1. Verifies getMockQaSeedData generates complete, valid, schema-compliant objects', () => {
    const seed = getMockQaSeedData();

    expect(seed.dars).toHaveLength(8);
    expect(seed.externalDocuments).toHaveLength(9);
    expect(seed.documents).toHaveLength(2);
    expect(seed.controlledCopyInstances).toHaveLength(3);
    expect(seed.tasks).toHaveLength(9);
    expect(seed.actionLog.length).toBeGreaterThanOrEqual(3);
    expect(seed.timeline.length).toBeGreaterThanOrEqual(2);
  });

  it('2. seedComprehensiveQaMockData populates useStore state accurately', () => {
    useStore.getState().seedComprehensiveQaMockData();
    const state = useStore.getState();

    expect(state.dars).toHaveLength(8);
    expect(state.externalDocuments).toHaveLength(9);
    expect(state.documents).toHaveLength(2);
    expect(state.controlledCopyInstances).toHaveLength(3);
    expect(state.tasks).toHaveLength(9);
  });

  it('3. User Persona Architecture: All DARs originate from QA Level 4 Supervisor (U005 - บีม)', () => {
    useStore.getState().seedComprehensiveQaMockData();
    const { dars } = useStore.getState();

    dars.forEach(dar => {
      expect(dar.requesterId).toBe('U005');
      expect(dar.department).toBe('QA');
      expect(dar.requester_level).toBe(4);
      expect(dar.requester_name).toBe('บีม');
    });
  });

  it('4. Internal DAR Workflow Matrix: Accurately seeds all 6 diverse cases', () => {
    useStore.getState().seedComprehensiveQaMockData();
    const { dars } = useStore.getState();

    // Case 1: General + Multi-Copy (Pending Review)
    const dar1 = dars.find(d => d.id === 'DAR-2608-001');
    expect(dar1).toBeDefined();
    expect(dar1.type).toBe('NEW');
    expect(dar1.doc_code).toBe('SOP-QA-001');
    expect(dar1.access_control.scope).toBe('GENERAL');
    expect(dar1.distributions).toHaveLength(3);
    expect(dar1.status).toBe('PENDING_REVIEW');
    expect(dar1.reviewerId).toBe('U003');

    // Case 2: Dept Only + Paperless (Pending Approval)
    const dar2 = dars.find(d => d.id === 'DAR-2608-002');
    expect(dar2).toBeDefined();
    expect(dar2.type).toBe('NEW');
    expect(dar2.doc_code).toBe('WI-QA-001');
    expect(dar2.access_control.scope).toBe('DEPT_ONLY');
    expect(dar2.is_physical_copy).toBe(false);
    expect(dar2.distributions).toHaveLength(0);
    expect(dar2.status).toBe('PENDING_APPROVAL');
    expect(dar2.approverId).toBe('U004');

    // Case 3: Targeted Scope + Master Only (Pending Review)
    const dar3 = dars.find(d => d.id === 'DAR-2608-003');
    expect(dar3).toBeDefined();
    expect(dar3.type).toBe('NEW');
    expect(dar3.doc_code).toBe('SD-QA-001');
    expect(dar3.access_control.scope).toBe('TARGETED');
    expect(dar3.distributions).toHaveLength(1);
    expect(dar3.status).toBe('PENDING_REVIEW');

    // Case 4: Restricted Scope + Paperless (Pending Approval)
    const dar4 = dars.find(d => d.id === 'DAR-2608-004');
    expect(dar4).toBeDefined();
    expect(dar4.type).toBe('NEW');
    expect(dar4.doc_code).toBe('SOP-QA-002');
    expect(dar4.access_control.scope).toBe('RESTRICTED');
    expect(dar4.access_control.min_access_level).toBe(4);
    expect(dar4.is_physical_copy).toBe(false);
    expect(dar4.status).toBe('PENDING_APPROVAL');

    // Case 5: Revision Workflow (Pending Review)
    const dar5 = dars.find(d => d.id === 'DAR-2608-005');
    expect(dar5).toBeDefined();
    expect(dar5.type).toBe('REVISION');
    expect(dar5.docId).toBe('DOC-QA-ACTIVE-01');
    expect(dar5.doc_code).toBe('SOP-QA-003');
    expect(dar5.status).toBe('PENDING_REVIEW');

    // Case 6: Obsolete Workflow (Pending Approval)
    const dar6 = dars.find(d => d.id === 'DAR-2608-006');
    expect(dar6).toBeDefined();
    expect(dar6.type).toBe('OBSOLETE');
    expect(dar6.docId).toBe('DOC-QA-ACTIVE-02');
    expect(dar6.doc_code).toBe('FM-QA-001');
    expect(dar6.status).toBe('PENDING_APPROVAL');
  });

  it('5. External Documents Matrix: Seeds Active, Superseded history, Obsolete and Due Soon documents', () => {
    useStore.getState().seedComprehensiveQaMockData();
    const { externalDocuments } = useStore.getState();

    const ed1 = externalDocuments.find(e => e.id === 'ED-QA-01');
    expect(ed1.status).toBe('ACTIVE');
    expect(ed1.accessScope).toBe('General');
    expect(externalDocuments.find(e => e.id === 'ED-QA-01-R00').status).toBe('SUPERSEDED');
    expect(externalDocuments.find(e => e.id === 'ED-QA-07').status).toBe('OBSOLETE');

    const ed3 = externalDocuments.find(e => e.id === 'ED-QA-03');
    expect(ed3.status).toBe('ACTIVE');
    expect(ed3.accessScope).toBe('Restricted');
    expect(ed3.nextReviewDate).toBeDefined();
  });

  it('6. Task Inbox Synchronization: Accurately delivers 4 tasks to Reviewer (U003) and 4 tasks to Approver (U004)', () => {
    useStore.getState().seedComprehensiveQaMockData();
    const { tasks } = useStore.getState();

    const reviewerTasks = tasks.filter(t => t.assigneeId === 'U003');
    expect(reviewerTasks).toHaveLength(4);
    expect(reviewerTasks.some(t => t.darId === 'DAR-2608-001')).toBe(true);
    expect(reviewerTasks.some(t => t.darId === 'DAR-2608-003')).toBe(true);
    expect(reviewerTasks.some(t => t.darId === 'DAR-2608-005')).toBe(true);
    expect(reviewerTasks.some(t => t.edCode === 'ED-QA-01' || t.docId === 'ED-QA-01')).toBe(true);

    const approverTasks = tasks.filter(t => t.assigneeId === 'U004');
    expect(approverTasks).toHaveLength(4);
    expect(approverTasks.some(t => t.darId === 'DAR-2608-002')).toBe(true);
    expect(approverTasks.some(t => t.darId === 'DAR-2608-004')).toBe(true);
    expect(approverTasks.some(t => t.darId === 'DAR-2608-006')).toBe(true);
    expect(approverTasks.some(t => t.edCode === 'ED-QA-02' || t.docId === 'ED-QA-02')).toBe(true);
  });
});
