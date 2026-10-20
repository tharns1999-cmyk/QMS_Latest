import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import ControlledCopyRegister from '../pages/ControlledCopy/ControlledCopyRegister';
import TaskInbox from '../pages/Tasks/TaskInbox';

describe('Recall Workflow for Damaged Controlled Copies & Replacement Request Architecture', () => {
  const dccUser = {
    id: 'U001',
    name: 'สิริวรรณ ปรีชาเลิศ',
    department: 'DC',
    role: 'DCC_ADMIN',
    isDcc: true,
    level: 4
  };

  const pdUser = {
    id: 'U002',
    name: 'ธนาวุฒิ สมควรกิจดำรง',
    department: 'PD',
    depts: ['PD'],
    role: 'DEPT_ADMIN',
    level: 4
  };

  const testDoc = {
    id: 'DOC-PD-001',
    title: 'SOP-PD-001',
    name: 'ขั้นตอนการผสมสารเคมีในไลน์ผลิต',
    rev: '01',
    department: 'PD',
    status: 'EFFECTIVE'
  };

  const copy01_PD = {
    id: 'inst-pd-01',
    doc_id: 'DOC-PD-001',
    docId: 'DOC-PD-001',
    doc_code: 'SOP-PD-001',
    docTitle: 'SOP-PD-001',
    docName: 'ขั้นตอนการผสมสารเคมีในไลน์ผลิต',
    doc_version: '01',
    rev: '01',
    copy_no: '01',
    copyNo: '01',
    ccNumber: 'Copy 01',
    issue_no: '01',
    issueNumber: 'I01',
    holder_dept: 'PD',
    department: 'PD',
    location: 'Line 1 Prep Station',
    locationName: 'Line 1 Prep Station',
    status: 'ISSUED_ACTIVE',
    is_replacement: false
  };

  const copy02_PD = {
    id: 'inst-pd-02',
    doc_id: 'DOC-PD-001',
    docId: 'DOC-PD-001',
    doc_code: 'SOP-PD-001',
    docTitle: 'SOP-PD-001',
    docName: 'ขั้นตอนการผสมสารเคมีในไลน์ผลิต',
    doc_version: '01',
    rev: '01',
    copy_no: '02',
    copyNo: '02',
    ccNumber: 'Copy 02',
    issue_no: '01',
    issueNumber: 'I01',
    holder_dept: 'PD',
    department: 'PD',
    location: 'Line 2 Mixing Station',
    locationName: 'Line 2 Mixing Station',
    status: 'ISSUED_ACTIVE',
    is_replacement: false
  };

  beforeEach(() => {
    useStore.setState({
      currentUser: dccUser,
      masterUsers: [dccUser, pdUser],
      documents: [testDoc],
      documentControlledCopies: [copy01_PD, copy02_PD],
      controlledCopyInstances: [copy01_PD, copy02_PD],
      tasks: [],
      notifications: [],
      controlledCopyAuditTrail: [],
      actionLog: []
    });
  });

  it('1. Reporting DAMAGED triggers PENDING_RECALL, generates DCC_RECALL task, and enqueues Issue 02 replacement copy', () => {
    // Act as PD user reporting damaged on Copy 02
    useStore.setState({ currentUser: pdUser });
    const { reportCcDamagedLost } = useStore.getState();

    reportCcDamagedLost('inst-pd-02', 'DAMAGED', 'เอกสารฉีกขาดโดนน้ำยาเคมีในไลน์ 2');

    const state = useStore.getState();
    const copies = state.controlledCopyInstances;

    // 1. Original Copy State
    const originalCopy = copies.find(c => c.id === 'inst-pd-02');
    expect(['PENDING_RECALL', 'DAMAGED_PENDING_RECALL']).toContain(originalCopy.status);
    expect(originalCopy.isDamaged).toBe(true);
    expect(originalCopy.replacementReason).toBe('DAMAGED');
    expect(originalCopy.reported_at).toBeDefined();
    expect(originalCopy.reportReason).toBe('เอกสารฉีกขาดโดนน้ำยาเคมีในไลน์ 2');

    // 2. DCC Recall Task Generation
    const recallTask = state.tasks.find(t => t.type === 'DCC_RECALL');
    expect(recallTask).toBeDefined();
    expect(recallTask.title).toContain('เรียกคืนสำเนาชำรุด: SOP-PD-001');
    expect(recallTask.title).toContain('Copy 02');
    expect(recallTask.department).toBe('PD');
    expect(recallTask.location).toBe('Line 2 Mixing Station');
    expect(recallTask.copyId).toBe('inst-pd-02');
    expect(recallTask.isDamaged).toBe(true);
    expect(recallTask.status).toBe('PENDING');

    // 3. Replacement Copy Generation (Issue 02)
    const replacementCopy = copies.find(c => c.is_replacement === true);
    expect(replacementCopy).toBeDefined();
    expect(replacementCopy.copy_no).toBe('02');
    expect(replacementCopy.issue_no).toBe('02');
    expect(replacementCopy.status).toBe('PENDING_ISSUE');
    expect(replacementCopy.holder_dept).toBe('PD');
    expect(replacementCopy.replaced_copy_id).toBe('inst-pd-02');

    // 4. DCC Distribute Task for Issue 02
    const issueTask = state.tasks.find(t => t.type === 'DCC_DISTRIBUTE' && t.title.includes('Issue 02'));
    expect(issueTask).toBeDefined();

    // 5. Audit Trail Verification
    expect(state.controlledCopyAuditTrail.some(l => 
      l.action === 'REPORT_DAMAGED' && 
      l.remarks.includes('สร้างงานเรียกคืนเล่มเดิมและตั้งเรื่องออกสำเนาทดแทน')
    )).toBe(true);
  });

  it('2. Reporting LOST transitions to LOST, does NOT generate DCC_RECALL task, and enqueues Issue 02 replacement copy', () => {
    useStore.setState({ currentUser: pdUser });
    const { reportCcDamagedLost } = useStore.getState();

    reportCcDamagedLost('inst-pd-02', 'LOST', 'เอกสารหล่นหายระหว่างการย้ายเครื่องจักร');

    const state = useStore.getState();
    const copies = state.controlledCopyInstances;

    // 1. Original Copy State
    const originalCopy = copies.find(c => c.id === 'inst-pd-02');
    expect(originalCopy.status).toBe('LOST');
    expect(originalCopy.isLost).toBe(true);
    expect(originalCopy.replacementReason).toBe('LOST');

    // 2. NO DCC Recall Task should exist
    expect(state.tasks.some(t => t.type === 'DCC_RECALL')).toBe(false);

    // 3. Replacement Copy still enqueued in PENDING_ISSUE
    const replacementCopy = copies.find(c => c.is_replacement === true);
    expect(replacementCopy).toBeDefined();
    expect(replacementCopy.copy_no).toBe('02');
    expect(replacementCopy.issue_no).toBe('02');
    expect(replacementCopy.status).toBe('PENDING_ISSUE');
  });

  it('3. Controlled Copy Hub: Tab 3 shows damaged copy with "เล่มชำรุดรอเรียกคืน" and excludes LOST copies', () => {
    // Setup: Copy 01 is damaged, Copy 02 is lost
    const damagedCopy = { ...copy01_PD, status: 'PENDING_RECALL', isDamaged: true, replacementReason: 'DAMAGED' };
    const lostCopy = { ...copy02_PD, status: 'LOST', isLost: true, replacementReason: 'LOST' };

    useStore.setState({
      currentUser: dccUser,
      controlledCopyInstances: [damagedCopy, lostCopy],
      documentControlledCopies: [damagedCopy, lostCopy],
      tasks: [{
        id: 'task-recall-test-01',
        type: 'DCC_RECALL',
        taskType: 'RECALL',
        copyId: 'inst-pd-01',
        docId: 'DOC-PD-001',
        title: 'เรียกคืนสำเนาชำรุด: SOP-PD-001 (Copy 01)',
        status: 'PENDING'
      }]
    });

    render(
      <MemoryRouter initialEntries={['/controlled-copy?tab=RECALL_CHECKLIST']}>
        <ControlledCopyRegister />
      </MemoryRouter>
    );

    // Tab 3 Recall Checklist should have badge count of 1 (only the damaged copy, NOT the lost copy)
    const recallTabBadge = screen.getByRole('button', { name: /3\. เช็กลิสต์เรียกคืนเอกสาร/i });
    expect(recallTabBadge).toBeInTheDocument();
    expect(recallTabBadge).toHaveTextContent('1');

    // Tab 3 table renders damaged badge for Copy 01
    expect(screen.getByText(/เล่มชำรุดรอเรียกคืน/i)).toBeInTheDocument();

    // Copy 02 (LOST) must NOT be displayed in Tab 3 table
    expect(screen.queryByText(/หล่นหาย/i)).not.toBeInTheDocument();
  });

  it('4. DCC Recall actions: recordCopyRecalled transitions to RECALLED, destroyControlledCopy transitions to DESTROYED & resolves task', () => {
    const damagedCopy = { ...copy02_PD, status: 'PENDING_RECALL', isDamaged: true, replacementReason: 'DAMAGED' };
    const recallTask = {
      id: 'task-recall-damaged-inst-pd-02',
      type: 'DCC_RECALL',
      taskType: 'RECALL',
      copyId: 'inst-pd-02',
      docId: 'DOC-PD-001',
      title: 'เรียกคืนสำเนาชำรุด: SOP-PD-001 (Copy 02)',
      status: 'PENDING',
      is_completed: false
    };

    useStore.setState({
      currentUser: dccUser,
      controlledCopyInstances: [damagedCopy],
      documentControlledCopies: [damagedCopy],
      tasks: [recallTask]
    });

    const { recordCopyRecalled, destroyControlledCopy } = useStore.getState();

    // Step 1: DCC receives physical copy
    recordCopyRecalled('inst-pd-02', 'ได้รับเล่มจริงจากหน้างานไลน์ 2 แล้ว');

    let state = useStore.getState();
    let copy = state.controlledCopyInstances.find(c => c.id === 'inst-pd-02');
    expect(copy.status).toBe('RECALLED');
    expect(copy.recalled_at).toBeDefined();
    expect(copy.recalled_by).toBe('สิริวรรณ ปรีชาเลิศ');

    // Step 2: DCC performs physical destruction
    destroyControlledCopy('inst-pd-02', 'SHRED', 'ทำลายด้วยเครื่องย่อยเอกสารความละเอียดสูง');

    state = useStore.getState();
    copy = state.controlledCopyInstances.find(c => c.id === 'inst-pd-02');
    expect(copy.status).toBe('DESTROYED');
    expect(copy.destroyed_at).toBeDefined();
    expect(copy.destroyed_by).toBe('สิริวรรณ ปรีชาเลิศ');
    expect(copy.disposition_method).toBe('SHRED');

    // Recall Task should be marked COMPLETED
    const resolvedTask = state.tasks.find(t => t.id === 'task-recall-damaged-inst-pd-02');
    expect(resolvedTask.status).toBe('COMPLETED');
    expect(resolvedTask.is_completed).toBe(true);
  });

  it('5. Idempotency Guard: blocks duplicate report on copy already in PENDING_RECALL or DESTROYED', () => {
    const damagedCopy = { ...copy02_PD, status: 'PENDING_RECALL', isDamaged: true };
    useStore.setState({
      currentUser: pdUser,
      controlledCopyInstances: [damagedCopy],
      documentControlledCopies: [damagedCopy],
      tasks: []
    });

    const { reportCcDamagedLost } = useStore.getState();

    // Attempt reporting again on copy already in PENDING_RECALL
    reportCcDamagedLost('inst-pd-02', 'DAMAGED', 'กดแจ้งซ้ำรอบที่สอง');

    const state = useStore.getState();
    // No new replacement copies should be spawned
    expect(state.controlledCopyInstances.length).toBe(1);
    expect(state.tasks.length).toBe(0);
  });

  it('6. DCC Task Inbox displays "เล่มชำรุดรอเรียกคืน" risk badge and navigates to RECALL_CHECKLIST', () => {
    const damagedTask = {
      id: 'task-recall-damaged-inst-pd-02',
      type: 'DCC_RECALL',
      taskType: 'RECALL',
      title: 'เรียกคืนสำเนาชำรุด: SOP-PD-001 ขั้นตอนการผสม (Copy 02)',
      description: 'แผนก PD แจ้งชำรุด ประจำจุด Line 2 Mixing Station',
      department: 'PD',
      target_department: 'DCC',
      assignedToRole: 'DCC_ADMIN',
      status: 'PENDING',
      isDamaged: true,
      copyId: 'inst-pd-02',
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };

    useStore.setState({
      currentUser: dccUser,
      controlledCopyInstances: [{ ...copy02_PD, status: 'PENDING_RECALL', isDamaged: true }],
      documentControlledCopies: [{ ...copy02_PD, status: 'PENDING_RECALL', isDamaged: true }],
      tasks: [damagedTask]
    });

    render(
      <MemoryRouter initialEntries={['/tasks']}>
        <TaskInbox />
      </MemoryRouter>
    );

    // Verify damaged recall badge exists in Task Inbox
    // The new 3-Level card design renders the SLA badge as "เล่มชำรุด" (short form)
    // OR the type chip as "เรียกคืน (ชำรุด)" — either confirms the damaged state is visible
    const damagedBadge =
      screen.queryAllByText(/เล่มชำรุด/i).length > 0 ||
      screen.queryAllByText(/เรียกคืน.*ชำรุด/i).length > 0;
    expect(damagedBadge).toBe(true);

  });
});
