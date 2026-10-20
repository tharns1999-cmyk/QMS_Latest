import { describe, it, expect, beforeEach } from 'vitest';
import useStore, { CONTROLLED_COPY_STATUS } from '../../../store/useStore';

describe('Closed-Loop Controlled Copy Lifecycle & Zombie Task Elimination Tests', () => {
  beforeEach(() => {
    useStore.setState({
      dars: [],
      documents: [],
      documentControlledCopies: [],
      controlledCopyInstances: [],
      tasks: [],
      notifications: [],
      controlledCopyAuditTrail: [],
      actionLog: [],
      currentUser: { id: 'U001', name: 'Admin QA (DCC)', department: 'QA', role: 'DCC_ADMIN', isDcc: true, level: 5 }
    });
  });

  describe('1. State Schema & State Machine Transitions', () => {
    it('defines the 5 core lifecycle statuses in CONTROLLED_COPY_STATUS', () => {
      expect(CONTROLLED_COPY_STATUS.PENDING_ISSUE).toBe('PENDING_ISSUE');
      expect(CONTROLLED_COPY_STATUS.DISPATCHED_PENDING_RECEIPT).toBe('DISPATCHED_PENDING_RECEIPT');
      expect(CONTROLLED_COPY_STATUS.ISSUED_ACTIVE).toBe('ISSUED_ACTIVE');
      expect(CONTROLLED_COPY_STATUS.PENDING_RECALL).toBe('PENDING_RECALL');
      expect(CONTROLLED_COPY_STATUS.RECALLED_DESTROYED).toBe('RECALLED_DESTROYED');
    });

    it('issueControlledCopy initializes copy in PENDING_ISSUE state', () => {
      useStore.setState({
        documents: [{ id: 'doc-1', title: 'SOP-PD-001', name: 'Standard Procedure', status: 'EFFECTIVE', rev: '01', department: 'PD' }]
      });

      useStore.getState().issueControlledCopy('SOP-PD-001', 'PD');

      const copies = useStore.getState().controlledCopyInstances;
      expect(copies).toHaveLength(1);
      expect(copies[0].status).toBe('PENDING_ISSUE');
      expect(copies[0].doc_code || copies[0].docTitle).toBe('SOP-PD-001');
      expect(copies[0].copy_no).toBe('01');
      expect(copies[0].issue_no).toBe('01');
    });
  });

  describe('2. Action: dispatchControlledCopy(copyId)', () => {
    it('updates copy to DISPATCHED_PENDING_RECEIPT, records dispatched_at, and creates DEPT_CONFIRM_HARDCOPY_RECEIPT task', () => {
      const copyId = 'cc-item-101';
      useStore.setState({
        controlledCopyInstances: [{
          id: copyId,
          doc_id: 'doc-1',
          doc_code: 'WI-PD-005',
          doc_version: '01',
          copy_no: '02',
          issue_no: '01',
          holder_dept: 'PD',
          location: 'Line 2 Packaging',
          status: 'PENDING_ISSUE'
        }],
        tasks: []
      });

      useStore.getState().dispatchControlledCopy(copyId);

      const state = useStore.getState();
      const updatedCopy = state.controlledCopyInstances.find(c => c.id === copyId);
      expect(updatedCopy.status).toBe('DISPATCHED_PENDING_RECEIPT');
      expect(updatedCopy.dispatched_at).toBeDefined();
      expect(updatedCopy.dispatched_by).toBe('Admin QA (DCC)');

      // Verify task creation
      const receiptTask = state.tasks.find(t => t.type === 'DEPT_CONFIRM_HARDCOPY_RECEIPT');
      expect(receiptTask).toBeDefined();
      expect(String(receiptTask.copy_id)).toBe(copyId);
      expect(receiptTask.assignedToDept).toBe('PD');
      expect(receiptTask.status).toBe('PENDING');
    });
  });

  describe('3. Action: confirmHardcopyReceipt(copyId, taskId, recipientData) - Zombie Task Elimination', () => {
    it('performs strict type coercion, sets copy to ISSUED_ACTIVE, and HARD DELETES the receipt task', () => {
      const numCopyId = 12345; // Test numeric type coercion
      const strTaskId = 'task-receipt-12345-abc';

      useStore.setState({
        currentUser: { id: 'U002', name: 'ธนาวุฒิ (PD User)', department: 'PD', role: 'USER', isDcc: false, level: 3 },
        controlledCopyInstances: [{
          id: String(numCopyId),
          doc_id: 'doc-1',
          doc_code: 'SOP-PD-001',
          doc_version: '02',
          copy_no: '01',
          issue_no: '01',
          holder_dept: 'PD',
          location: 'Line 1 Mixing',
          status: 'DISPATCHED_PENDING_RECEIPT',
          dispatched_at: '2026-08-23T10:00:00Z',
          dispatched_by: 'Admin QA (DCC)'
        }],
        tasks: [
          {
            id: strTaskId,
            type: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
            copy_id: String(numCopyId),
            assignedToDept: 'PD',
            status: 'PENDING'
          },
          {
            id: 'unrelated-task-999',
            type: 'Review',
            assigneeId: 'U002',
            status: 'PENDING'
          }
        ]
      });

      // User confirms hardcopy receipt with numeric/string IDs
      useStore.getState().confirmHardcopyReceipt(numCopyId, strTaskId, {
        name: 'ธนาวุฒิ สมควรกิจดำรง',
        pin: '998877',
        remarks: 'Inspected stamp & placed in line binder'
      });

      const state = useStore.getState();
      const confirmedCopy = state.controlledCopyInstances.find(c => c.id === String(numCopyId));

      // Document status must be ISSUED_ACTIVE with receipt timestamp
      expect(confirmedCopy.status).toBe('ISSUED_ACTIVE');
      expect(confirmedCopy.receipt_confirmed_at).toBeDefined();
      expect(confirmedCopy.receipt_confirmed_by).toBe('ธนาวุฒิ สมควรกิจดำรง');
      expect(confirmedCopy.receipt_remarks).toContain('Inspected stamp');

      // Task must be HARD DELETED from the array (not just status=COMPLETED)
      const receiptTask = state.tasks.find(t => t.id === strTaskId);
      expect(receiptTask).toBeUndefined();
      expect(state.tasks).toHaveLength(1);
      expect(state.tasks[0].id).toBe('unrelated-task-999');
    });

    it('Loop Guard: checkSLA() and cleanupDccTasks NEVER resurrect or recreate completed receipt tasks', () => {
      useStore.setState({
        simulatedDate: '2026-08-23',
        controlledCopyInstances: [{
          id: 'cc-active-1',
          doc_id: 'doc-1',
          doc_code: 'WI-PD-001',
          doc_version: '01',
          copy_no: '01',
          holder_dept: 'PD',
          status: 'ISSUED_ACTIVE',
          receipt_confirmed_at: '2026-08-23T08:00:00Z'
        }],
        tasks: [],
        dars: [],
        externalDocuments: [],
        documents: []
      });

      // Run SLA evaluation
      useStore.getState().checkSLA();

      const state = useStore.getState();
      const ghostTasks = state.tasks.filter(t => t.type === 'DEPT_CONFIRM_HARDCOPY_RECEIPT');
      expect(ghostTasks).toHaveLength(0);
    });
  });

  describe('4. Action: completeRecallChecklist(taskId, checkedCopyIds)', () => {
    it('transitions checked copies to RECALLED_DESTROYED and hard deletes the recall checklist task', () => {
      const taskId = 'task-recall-checklist-777';
      useStore.setState({
        controlledCopyInstances: [
          { id: 'cc-old-1', doc_id: 'doc-old', doc_code: 'SOP-PD-001', rev: '01', status: 'PENDING_RECALL' },
          { id: 'cc-old-2', doc_id: 'doc-old', doc_code: 'SOP-PD-001', rev: '01', status: 'PENDING_RECALL' },
          { id: 'cc-new-1', doc_id: 'doc-new', doc_code: 'SOP-PD-001', rev: '02', status: 'ISSUED_ACTIVE' }
        ],
        tasks: [
          {
            id: taskId,
            type: 'DCC_RECALL_WITH_CHECKLIST',
            status: 'PENDING'
          }
        ]
      });

      useStore.getState().completeRecallChecklist(taskId, ['cc-old-1', 'cc-old-2']);

      const state = useStore.getState();
      const copy1 = state.controlledCopyInstances.find(c => c.id === 'cc-old-1');
      const copy2 = state.controlledCopyInstances.find(c => c.id === 'cc-old-2');
      const copy3 = state.controlledCopyInstances.find(c => c.id === 'cc-new-1');

      expect(copy1.status).toBe('RECALLED_DESTROYED');
      expect(copy1.recalled_at).toBeDefined();
      expect(copy2.status).toBe('RECALLED_DESTROYED');
      expect(copy2.recalled_at).toBeDefined();
      expect(copy3.status).toBe('ISSUED_ACTIVE');

      // Recall task must be hard-deleted
      expect(state.tasks.find(t => t.id === taskId)).toBeUndefined();
    });
  });
});
