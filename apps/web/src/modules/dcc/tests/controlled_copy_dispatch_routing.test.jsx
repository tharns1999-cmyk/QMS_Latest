import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import TaskInbox from '../pages/Tasks/TaskInbox';

describe('Controlled Copy Dispatch & Independent Receipt Task Routing Tests', () => {
  const qcUser = {
    id: 'U004',
    name: 'สิริพร วงศ์สวัสดิ์',
    department: 'QC',
    role: 'STAFF',
    level: 4,
    isDcc: false
  };

  const pdUser = {
    id: 'U002',
    name: 'ธนาวุฒิ สมควรกิจดำรง',
    department: 'PD',
    role: 'STAFF',
    level: 4,
    isDcc: false
  };

  const dccAdminUser = {
    id: 'U001',
    name: 'Admin DC (DCC)',
    department: 'DC',
    role: 'DCC_ADMIN',
    level: 1,
    isDcc: true
  };

  const qcDocDar = {
    id: 'DAR-QC-2026-001',
    title: 'SOP-QC-01',
    doc_code: 'SOP-QC-01',
    name: 'คู่มือการสุ่มตัวอย่างและตรวจวิเคราะห์สารปนเปื้อน',
    department: 'QC',
    requester_id: 'U004',
    requesterId: 'U004',
    requester_name: 'สิริพร วงศ์สวัสดิ์',
    status: 'APPROVED_WAITING_EFFECTIVE'
  };

  const masterCopy01 = {
    id: 'cc-qc-01',
    doc_id: 'doc-qc-01',
    dar_id: 'DAR-QC-2026-001',
    doc_code: 'SOP-QC-01',
    docTitle: 'SOP-QC-01',
    doc_version: '01',
    rev: '01',
    copy_no: '01',
    ccNumber: 'CC-001',
    holder_dept: 'QC',
    department: 'QC',
    location: 'QC Head Office (Master Binder)',
    locationName: 'QC Head Office (Master Binder)',
    status: 'PENDING_ISSUE',
    is_master: true,
    isMaster: true
  };

  const recipientCopy02 = {
    id: 'cc-pd-02',
    doc_id: 'doc-qc-01',
    dar_id: 'DAR-QC-2026-001',
    doc_code: 'SOP-QC-01',
    docTitle: 'SOP-QC-01',
    doc_version: '01',
    rev: '01',
    copy_no: '02',
    ccNumber: 'CC-002',
    holder_dept: 'PD',
    department: 'PD',
    location: 'PD Production Line 1',
    locationName: 'PD Production Line 1',
    status: 'PENDING_ISSUE',
    is_master: false,
    isMaster: false
  };

  beforeEach(() => {
    useStore.setState({
      currentUser: dccAdminUser,
      dars: [qcDocDar],
      darRequests: [qcDocDar],
      documents: [{
        id: 'doc-qc-01',
        title: 'SOP-QC-01',
        name: 'คู่มือการสุ่มตัวอย่างและตรวจวิเคราะห์สารปนเปื้อน',
        rev: '01',
        department: 'QC',
        status: 'EFFECTIVE'
      }],
      documentControlledCopies: [masterCopy01, recipientCopy02],
      controlledCopyInstances: [masterCopy01, recipientCopy02],
      tasks: [],
      masterUsers: [qcUser, pdUser, dccAdminUser],
      notifications: []
    });
  });

  it('1. Dispatching Copy 01 (Master Copy) creates task strictly routed to Owner Department (QC)', () => {
    useStore.getState().dispatchControlledCopy('cc-qc-01');

    const state = useStore.getState();
    const dispatchedCopy = state.controlledCopyInstances.find(c => c.id === 'cc-qc-01');
    expect(dispatchedCopy.status).toBe('DISPATCHED_PENDING_RECEIPT');
    expect(dispatchedCopy.dispatched_to_dept).toBe('QC');

    const task01 = state.tasks.find(t => t.copy_id === 'cc-qc-01');
    expect(task01).toBeDefined();
    expect(task01.type).toBe('DEPT_CONFIRM_HARDCOPY_RECEIPT');
    expect(task01.target_department).toBe('QC');
    expect(task01.assignedToDept).toBe('QC');
    expect(task01.assignee_id).toBe('U004'); // QC User
  });

  it('2. Dispatching Copy 02 creates task strictly routed to Recipient Department (PD)', () => {
    useStore.getState().dispatchControlledCopy('cc-pd-02');

    const state = useStore.getState();
    const dispatchedCopy = state.controlledCopyInstances.find(c => c.id === 'cc-pd-02');
    expect(dispatchedCopy.status).toBe('DISPATCHED_PENDING_RECEIPT');
    expect(dispatchedCopy.dispatched_to_dept).toBe('PD');

    const task02 = state.tasks.find(t => t.copy_id === 'cc-pd-02');
    expect(task02).toBeDefined();
    expect(task02.type).toBe('DEPT_CONFIRM_HARDCOPY_RECEIPT');
    expect(task02.target_department).toBe('PD');
    expect(task02.assignedToDept).toBe('PD');
    expect(task02.assignee_id).toBe('U002'); // PD User
  });

  it('3. In TaskInbox: QC User sees Copy 01 task and does NOT see Copy 02 task', () => {
    useStore.getState().dispatchControlledCopies(['cc-qc-01', 'cc-pd-02']);

    // Log in as QC User
    useStore.setState({ currentUser: qcUser });

    render(
      <MemoryRouter>
        <TaskInbox />
      </MemoryRouter>
    );

    // QC user should see Copy 01
    expect(screen.getByText(/Copy 01/i)).toBeInTheDocument();
    // QC user should NOT see Copy 02
    expect(screen.queryByText(/Copy 02/i)).not.toBeInTheDocument();
  });

  it('4. In TaskInbox: PD User sees Copy 02 task and does NOT see Copy 01 task', () => {
    useStore.getState().dispatchControlledCopies(['cc-qc-01', 'cc-pd-02']);

    // Log in as PD User
    useStore.setState({ currentUser: pdUser });

    render(
      <MemoryRouter>
        <TaskInbox />
      </MemoryRouter>
    );

    // PD user should see Copy 02
    expect(screen.getByText(/Copy 02/i)).toBeInTheDocument();
    // PD user should NOT see Copy 01
    expect(screen.queryByText(/Copy 01/i)).not.toBeInTheDocument();
  });

  it('5. In TaskInbox: DCC Admin does NOT see other department receipt tasks (strict segregation of duties)', () => {
    useStore.getState().dispatchControlledCopies(['cc-qc-01', 'cc-pd-02']);

    // Log in as DCC Admin
    useStore.setState({ currentUser: dccAdminUser });

    render(
      <MemoryRouter>
        <TaskInbox />
      </MemoryRouter>
    );

    // DCC Admin must NOT see QC or PD receipt tasks in personal action items
    expect(screen.queryByText(/Copy 01/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Copy 02/i)).not.toBeInTheDocument();
  });

  it('6. Confirming receipt independently marks copy as ISSUED_ACTIVE and removes only that task', () => {
    useStore.getState().dispatchControlledCopies(['cc-qc-01', 'cc-pd-02']);
    const task01 = useStore.getState().tasks.find(t => t.copy_id === 'cc-qc-01');
    const task02 = useStore.getState().tasks.find(t => t.copy_id === 'cc-pd-02');

    // QC confirms Copy 01
    useStore.setState({ currentUser: qcUser });
    useStore.getState().confirmHardcopyReceipt('cc-qc-01', task01.id, {
      name: qcUser.name,
      pin: '123456',
      remarks: 'Master Copy received at QC HQ'
    });

    let state = useStore.getState();
    const copy01 = state.controlledCopyInstances.find(c => c.id === 'cc-qc-01');
    const copy02 = state.controlledCopyInstances.find(c => c.id === 'cc-pd-02');

    expect(copy01.status).toBe('ISSUED_ACTIVE');
    expect(copy02.status).toBe('DISPATCHED_PENDING_RECEIPT'); // Copy 02 still pending
    expect(state.tasks.find(t => t.id === task01.id)).toBeUndefined();
    expect(state.tasks.find(t => t.id === task02.id)).toBeDefined();

    // PD confirms Copy 02
    useStore.setState({ currentUser: pdUser });
    useStore.getState().confirmHardcopyReceipt('cc-pd-02', task02.id, {
      name: pdUser.name,
      pin: '654321',
      remarks: 'Copy 02 verified at Line 1'
    });

    state = useStore.getState();
    const updatedCopy02 = state.controlledCopyInstances.find(c => c.id === 'cc-pd-02');
    expect(updatedCopy02.status).toBe('ISSUED_ACTIVE');
    expect(state.tasks.find(t => t.id === task02.id)).toBeUndefined();
  });
});
