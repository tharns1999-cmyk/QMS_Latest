import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import useStore, { MASTER_DATA_USER } from '../../../store/useStore';
import TaskInbox from '../pages/Tasks/TaskInbox';

const renderWithRouter = (ui) => {
  return render(
    <BrowserRouter>
      {ui}
    </BrowserRouter>
  );
};

describe('Hardcopy Receipt Task Routing & Cross-Department Isolation Tests', () => {
  const pdDoc = {
    id: 'doc-pd-99',
    title: 'SOP-PD-099',
    doc_code: 'SOP-PD-099',
    name: 'คู่มือการผลิตและการควบคุมกระบวนการอบขนม',
    rev: '01',
    department: 'PD',
    status: 'EFFECTIVE'
  };

  const copy01_PD = {
    id: 'cc-pd-99-01',
    doc_id: 'doc-pd-99',
    doc_code: 'SOP-PD-099',
    docTitle: 'SOP-PD-099',
    doc_version: '01',
    rev: '01',
    copy_no: '01',
    ccNumber: 'CC-001',
    owner_dept: 'PD',
    target_department: 'PD',
    holder_dept: 'PD',
    department: 'PD',
    location: 'PD Head Office',
    locationName: 'PD Head Office',
    status: 'PENDING_ISSUE',
    is_master: true
  };

  const copy02_PD = {
    id: 'cc-pd-99-02',
    doc_id: 'doc-pd-99',
    doc_code: 'SOP-PD-099',
    docTitle: 'SOP-PD-099',
    doc_version: '01',
    rev: '01',
    copy_no: '02',
    ccNumber: 'CC-002',
    owner_dept: 'PD',
    target_department: 'PD',
    holder_dept: 'PD',
    department: 'PD',
    location: 'Line 1 - Mixing (ห้องผสม)',
    locationName: 'Line 1 - Mixing (ห้องผสม)',
    status: 'PENDING_ISSUE',
    is_master: false
  };

  const copy03_QA = {
    id: 'cc-pd-99-03',
    doc_id: 'doc-pd-99',
    doc_code: 'SOP-PD-099',
    docTitle: 'SOP-PD-099',
    doc_version: '01',
    rev: '01',
    copy_no: '03',
    ccNumber: 'CC-003',
    owner_dept: 'PD',
    target_department: 'QA/QC',
    holder_dept: 'QA/QC',
    department: 'QA/QC',
    location: 'QC Chemistry Lab (ห้องปฏิบัติการเคมี)',
    locationName: 'QC Chemistry Lab (ห้องปฏิบัติการเคมี)',
    status: 'PENDING_ISSUE',
    is_master: false
  };

  const pdStaff = {
    id: 'U-PD-STAFF',
    name: 'สมเกียรติ ฝ่ายผลิต',
    role: 'GENERAL_USER',
    department: 'PD',
    dept: 'PD',
    primary_department: 'PD',
    affiliated_departments: ['PD'],
    depts: ['PD'],
    level: 2
  };

  const beamQA = (MASTER_DATA_USER || []).find(u => u.id === 'U005') || {
    id: 'U005',
    name: 'บีม',
    role: 'DEPT_ADMIN',
    department: 'QA',
    dept: 'QA',
    primary_department: 'QA',
    affiliated_departments: ['QA'],
    depts: ['QA'],
    level: 4
  };

  const kalyaneePD = (MASTER_DATA_USER || []).find(u => u.id === 'U003') || {
    id: 'U003',
    name: 'กัลยาณี พลไกร',
    role: 'DEPT_ADMIN',
    department: 'PD',
    dept: 'PD',
    primary_department: 'PD',
    affiliated_departments: ['PD', 'QA'],
    depts: ['PD', 'QA'],
    level: 5
  };

  const dccAdmin = (MASTER_DATA_USER || []).find(u => u.id === 'EMP-001') || {
    id: 'EMP-001',
    name: 'ธนาวุฒิ สมควรกิจดำรง',
    role: 'DCC_ADMIN',
    isDcc: true,
    department: 'DC',
    dept: 'DC',
    primary_department: 'DC',
    affiliated_departments: ['DC'],
    depts: ['DC'],
    level: 4
  };

  beforeEach(() => {
    useStore.setState({
      currentUser: dccAdmin,
      documents: [pdDoc],
      controlledCopyInstances: [copy01_PD, copy02_PD, copy03_QA],
      documentControlledCopies: [copy01_PD, copy02_PD, copy03_QA],
      tasks: [],
      masterUsers: [dccAdmin, kalyaneePD, beamQA, pdStaff],
      notifications: [],
      actionLog: []
    });
  });

  it('1. Per-Copy Independent Routing: Dispatching copies binds target_department strictly to each copy recipient department', () => {
    // DCC Admin dispatches Copy 01 (PD), Copy 02 (PD), Copy 03 (QA/QC)
    useStore.getState().dispatchControlledCopy(copy01_PD.id);
    useStore.getState().dispatchControlledCopy(copy02_PD.id);
    useStore.getState().dispatchControlledCopy(copy03_QA.id);

    const tasks = useStore.getState().tasks;
    expect(tasks.length).toBe(3);

    const task01 = tasks.find(t => t.copy_id === copy01_PD.id);
    const task02 = tasks.find(t => t.copy_id === copy02_PD.id);
    const task03 = tasks.find(t => t.copy_id === copy03_QA.id);

    expect(task01).toBeDefined();
    expect(task01.target_department).toBe('PD');
    expect(task01.department).toBe('PD');

    expect(task02).toBeDefined();
    expect(task02.target_department).toBe('PD');
    expect(task02.department).toBe('PD');

    // Copy 03 MUST be routed to QA / QA/QC, NOT PD!
    expect(task03).toBeDefined();
    expect(['QA/QC', 'QC', 'QA']).toContain(task03.target_department);
    expect(['QA/QC', 'QC', 'QA']).toContain(task03.department);
    // Assignee must resolve to Beam (QA primary dept), not Kalyanee (PD primary dept)
    expect(task03.assignee_id).toBe('U005');
  });

  it('2. Batch Dispatch: dispatchControlledCopies correctly routes each copy independently', () => {
    useStore.getState().dispatchControlledCopies([copy01_PD.id, copy02_PD.id, copy03_QA.id]);

    const tasks = useStore.getState().tasks;
    expect(tasks.length).toBe(3);

    const task03 = tasks.find(t => t.copy_id === copy03_QA.id);
    expect(['QA/QC', 'QC', 'QA']).toContain(task03.target_department);
    expect(task03.assignee_id).toBe('U005');
  });

  it('3. Task Inbox Isolation: PD user sees ONLY Copy 01 & Copy 02 receipt tasks, NOT Copy 03', () => {
    // Setup dispatched state
    useStore.getState().dispatchControlledCopy(copy01_PD.id);
    useStore.getState().dispatchControlledCopy(copy02_PD.id);
    useStore.getState().dispatchControlledCopy(copy03_QA.id);

    // Switch profile to PD Staff
    useStore.setState({ currentUser: pdStaff });

    renderWithRouter(<TaskInbox />);

    // Should see Copy 01 and Copy 02
    expect(screen.getByText(/Copy 01/i)).toBeInTheDocument();
    expect(screen.getByText(/Copy 02/i)).toBeInTheDocument();

    // Should NOT see Copy 03
    expect(screen.queryByText(/Copy 03/i)).not.toBeInTheDocument();
  });

  it('4. Task Inbox Isolation: QA/QC user (Beam) sees ONLY Copy 03 receipt task, NOT Copy 01 or Copy 02', () => {
    // Setup dispatched state
    useStore.getState().dispatchControlledCopy(copy01_PD.id);
    useStore.getState().dispatchControlledCopy(copy02_PD.id);
    useStore.getState().dispatchControlledCopy(copy03_QA.id);

    // Switch profile to QA Supervisor Beam
    useStore.setState({ currentUser: beamQA });

    renderWithRouter(<TaskInbox />);

    // Should see Copy 03
    expect(screen.getByText(/Copy 03/i)).toBeInTheDocument();

    // Should NOT see Copy 01 or Copy 02
    expect(screen.queryByText(/Copy 01/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Copy 02/i)).not.toBeInTheDocument();
  });

  it('5. Hardcopy Receipt Confirmation Guard: QA user can confirm QA copy, but PD user cannot confirm QA copy', () => {
    useStore.getState().dispatchControlledCopy(copy03_QA.id);

    const task03 = useStore.getState().tasks.find(t => t.copy_id === copy03_QA.id);

    // 1. PD staff attempts to confirm QA copy -> should be blocked
    useStore.setState({ currentUser: pdStaff });
    useStore.getState().confirmHardcopyReceipt(copy03_QA.id, task03.id, { remarks: 'Hacked by PD' });

    let copyInStore = useStore.getState().controlledCopyInstances.find(c => c.id === copy03_QA.id);
    expect(copyInStore.status).toBe('DISPATCHED_PENDING_RECEIPT'); // Still pending

    // 2. Beam (QA) confirms QA copy -> should succeed
    useStore.setState({ currentUser: beamQA });
    useStore.getState().confirmHardcopyReceipt(copy03_QA.id, task03.id, { remarks: 'Received at QC Lab' });

    copyInStore = useStore.getState().controlledCopyInstances.find(c => c.id === copy03_QA.id);
    expect(copyInStore.status).toBe('ISSUED_ACTIVE');
    expect(copyInStore.receipt_confirmed_by).toBe(beamQA.name);
  });

  it('6. Strict DCC Admin Segregation: DCC Admin (Thanawut) sees NO receipt tasks from PD or QA/QC', () => {
    // Setup dispatched state
    useStore.getState().dispatchControlledCopy(copy01_PD.id);
    useStore.getState().dispatchControlledCopy(copy02_PD.id);
    useStore.getState().dispatchControlledCopy(copy03_QA.id);

    // Switch profile to DCC Admin Thanawut (DC department)
    useStore.setState({ currentUser: dccAdmin });

    renderWithRouter(<TaskInbox />);

    // DCC Admin strictly cannot see other department receipt tasks
    expect(screen.queryByText(/Copy 01/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Copy 02/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Copy 03/i)).not.toBeInTheDocument();
  });
});
