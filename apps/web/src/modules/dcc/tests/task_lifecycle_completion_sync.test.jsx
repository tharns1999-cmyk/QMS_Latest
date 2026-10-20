import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import TaskInbox from '../pages/Tasks/TaskInbox';

const renderWithRouter = (ui) => {
  return render(
    <MemoryRouter>
      {ui}
    </MemoryRouter>
  );
};

describe('Enterprise QMS Task Engine Overhaul: Task Lifecycle & Completion Sync Tests', () => {
  const dccUser = {
    id: 'U001',
    name: 'Admin QA (DCC)',
    department: 'QA',
    depts: ['QA'],
    role: 'DCC_ADMIN',
    level: 1,
    isDcc: true
  };

  const sampleDoc = {
    id: 'doc-sop-003',
    title: 'SOP-QA-003',
    name: 'การควบคุมการจัดเก็บบันทึกคุณภาพ',
    department: 'QA',
    rev: '01',
    status: 'OBSOLETE',
    obsolete_at: '2026-08-26T10:00:00.000Z',
    access_control: { scope: 'GENERAL' }
  };

  const createCopies = () => [
    { id: 'cc-101', docId: 'doc-sop-003', doc_code: 'SOP-QA-003', docTitle: 'SOP-QA-003', copy_no: '01', ccNumber: 'CC-001', holder_dept: 'QA', status: 'PENDING_RECALL' },
    { id: 'cc-102', docId: 'doc-sop-003', doc_code: 'SOP-QA-003', docTitle: 'SOP-QA-003', copy_no: '02', ccNumber: 'CC-002', holder_dept: 'PD', status: 'PENDING_RECALL' },
    { id: 'cc-103', docId: 'doc-sop-003', doc_code: 'SOP-QA-003', docTitle: 'SOP-QA-003', copy_no: '03', ccNumber: 'CC-003', holder_dept: 'EN', status: 'PENDING_RECALL' },
    { id: 'cc-104', docId: 'doc-sop-003', doc_code: 'SOP-QA-003', docTitle: 'SOP-QA-003', copy_no: '04', ccNumber: 'CC-004', holder_dept: 'WH', status: 'PENDING_RECALL' },
    { id: 'cc-105', docId: 'doc-sop-003', doc_code: 'SOP-QA-003', docTitle: 'SOP-QA-003', copy_no: '05', ccNumber: 'CC-005', holder_dept: 'HR&GA', status: 'PENDING_RECALL' },
  ];

  beforeEach(() => {
    useStore.getState().resetStore();
    useStore.setState({
      currentUser: dccUser,
      documents: [sampleDoc],
      controlledCopyInstances: createCopies(),
      documentControlledCopies: createCopies(),
      tasks: [
        {
          id: 'task-recall-sop-003',
          title: 'เรียกคืนสำเนาควบคุม (Obsolete: SOP-QA-003)',
          description: 'เอกสาร SOP-QA-003 ถูกยกเลิกถาวร กรุณาเรียกคืนสำเนาจากทุกจุด (5 ชุด)',
          type: 'DCC_RECALL',
          taskType: 'DCC_RECALL_WITH_CHECKLIST',
          doc_code: 'SOP-QA-003',
          status: 'PENDING',
          assigneeId: 'U001',
          assignedToRole: 'DCC_ADMIN',
          dueDate: '2026-09-02',
          priority: 'HIGH'
        }
      ]
    });
  });

  /* ── Test Case 1: Obsolete Recall Task Auto-Clear ─────────────────────── */
  it('1. Obsolete Recall Task Auto-Clear: full recall completion closes task and drops badge to 0', () => {
    // 1. Initial State: TaskInbox shows badge = 1 and renders recall task
    const { unmount } = renderWithRouter(<TaskInbox />);

    expect(screen.getByText(/เรียกคืนสำเนาควบคุม \(Obsolete: SOP-QA-003\)/i)).toBeInTheDocument();
    
    // Verify All DCC Tasks and Recall tab badges show 1
    const allTabBtns = screen.getAllByRole('button', { name: /(All DCC Tasks|ทั้งหมด)/i });
    expect(allTabBtns.length).toBeGreaterThan(0);
    expect(allTabBtns[0]).toHaveTextContent('1');

    const recallTabBtn = screen.queryByRole('button', { name: /(Recall|เรียกคืน)/i });
    if (recallTabBtn) {
      expect(recallTabBtn).toHaveTextContent('1');
    }
    unmount();

    // 2. DCC completes full physical copy recall for all 5 copies
    const { completeCopyRecallAndArchive } = useStore.getState();
    completeCopyRecallAndArchive({
      documentCode: 'SOP-QA-003',
      collectedCopyIds: ['cc-101', 'cc-102', 'cc-103', 'cc-104', 'cc-105'],
      dispositionMethod: 'STAMP_AND_ARCHIVE',
      notes: 'Collected all 5 physical binders and stamped OBSOLETE',
      taskId: 'task-recall-sop-003'
    });

    // 3. Re-render TaskInbox: task must be resolved, list empty, and badges = 0
    renderWithRouter(<TaskInbox />);

    expect(screen.queryByText(/เรียกคืนสำเนาควบคุม \(Obsolete: SOP-QA-003\)/i)).toBeNull();
    expect(screen.getByText(/ไม่มีงานค้างในกล่องข้อความ/i)).toBeInTheDocument();

    const updatedAllTabs = screen.getAllByRole('button', { name: /(All DCC Tasks|ทั้งหมด)/i });
    expect(updatedAllTabs[0]).not.toHaveTextContent('1');
  });

  /* ── Test Case 2: Partial Recall Handling ────────────────────────────── */
  it('2. Partial Recall Handling: task remains active until 100% of copies are recalled', () => {
    // Recall only 3 out of 5 copies
    const { completeCopyRecallAndArchive } = useStore.getState();
    completeCopyRecallAndArchive({
      documentCode: 'SOP-QA-003',
      collectedCopyIds: ['cc-101', 'cc-102', 'cc-103'],
      dispositionMethod: 'STAMP_AND_ARCHIVE',
      notes: 'Partial recall (3/5 copies received)',
      taskId: 'task-recall-sop-003'
    });

    // Task must STILL be present in TaskInbox (since 2 copies are still PENDING_RECALL)
    const { unmount } = renderWithRouter(<TaskInbox />);
    expect(screen.getByText(/เรียกคืนสำเนาควบคุม \(Obsolete: SOP-QA-003\)/i)).toBeInTheDocument();
    unmount();

    // Now recall the remaining 2 copies
    completeCopyRecallAndArchive({
      documentCode: 'SOP-QA-003',
      collectedCopyIds: ['cc-104', 'cc-105'],
      dispositionMethod: 'DESTROY_SCRAP',
      notes: 'Remaining 2 copies shredded',
      taskId: 'task-recall-sop-003'
    });

    // Task must now be auto-cleared
    renderWithRouter(<TaskInbox />);
    expect(screen.queryByText(/เรียกคืนสำเนาควบคุม \(Obsolete: SOP-QA-003\)/i)).toBeNull();
  });

  /* ── Test Case 3: Complete Recall Checklist Action Sync ──────────────── */
  it('3. completeRecallChecklist clears the recall task and updates controlled copies', () => {
    const { completeRecallChecklist } = useStore.getState();

    completeRecallChecklist('task-recall-sop-003', ['cc-101', 'cc-102', 'cc-103', 'cc-104', 'cc-105'], 'RECALLED_OBSOLETE');

    renderWithRouter(<TaskInbox />);
    expect(screen.queryByText(/เรียกคืนสำเนาควบคุม \(Obsolete: SOP-QA-003\)/i)).toBeNull();
  });

  /* ── Test Case 4: Hardcopy Receipt Confirmation Auto-Clears Receipt Task ─ */
  it('4. confirmHardcopyReceipt immediately auto-clears receipt task from TaskInbox', () => {
    useStore.setState({
      currentUser: {
        id: 'U002',
        name: 'ธนาวุฒิ สมควรกิจดำรง',
        department: 'PD',
        depts: ['PD'],
        isDcc: false,
        role: 'SUPERVISOR',
        level: 2
      },
      controlledCopyInstances: [
        { id: 'cc-pd-01', doc_code: 'WI-PD-001', docTitle: 'WI-PD-001', copy_no: '01', holder_dept: 'PD', status: 'DISPATCHED_PENDING_RECEIPT' }
      ],
      tasks: [
        {
          id: 'task-receipt-pd-01',
          type: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
          copy_id: 'cc-pd-01',
          target_department: 'PD',
          title: 'ตรวจรับเล่มสำเนาควบคุม WI-PD-001',
          status: 'PENDING',
          assigneeId: 'U002'
        }
      ]
    });

    const { unmount } = renderWithRouter(<TaskInbox />);
    expect(screen.getByText(/ตรวจรับเล่มสำเนาควบคุม WI-PD-001/i)).toBeInTheDocument();
    unmount();

    // Confirm receipt
    useStore.getState().confirmHardcopyReceipt('cc-pd-01', 'task-receipt-pd-01', {
      receiverName: 'ธนาวุฒิ สมควรกิจดำรง',
      remarks: 'Received and placed in workstation binder'
    });

    // Re-render: Receipt task must be auto-cleared
    renderWithRouter(<TaskInbox />);
    expect(screen.queryByText(/ตรวจรับเล่มสำเนาควบคุม WI-PD-001/i)).toBeNull();
  });
});
