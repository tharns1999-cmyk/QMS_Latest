import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import TaskInbox from '../pages/Tasks/TaskInbox';
import { calculateCopyAllocations } from '../services/MasterDataService';

describe('Multi-Department Controlled Copy Dispatch & Receipt Routing Isolation Tests', () => {
  const pdUser = {
    id: 'U002',
    name: 'ธนาวุฒิ สมควรกิจดำรง (PD Requester)',
    department: 'PD',
    depts: ['PD'],
    role: 'STAFF',
    level: 4,
    isDcc: false
  };

  const qaUser = {
    id: 'U005',
    name: 'สิริรัตน์ กลิ่นสุคนธ์ (QA Supervisor)',
    department: 'QA',
    depts: ['QA'],
    role: 'SUPERVISOR',
    level: 4,
    isDcc: false
  };

  const enUser = {
    id: 'U007',
    name: 'วิศวกร ประจำแผนก EN',
    department: 'EN',
    depts: ['EN'],
    role: 'STAFF',
    level: 3,
    isDcc: false
  };

  const dccAdminUser = {
    id: 'U001',
    name: 'Admin QA (DCC)',
    department: 'QA',
    depts: ['QA'],
    role: 'DCC_ADMIN',
    level: 1,
    isDcc: true
  };

  const sampleDar = {
    id: 'DAR-PD-2026-088',
    title: 'SOP-PD-088',
    doc_code: 'SOP-PD-088',
    name: 'ระเบียบปฏิบัติงานสายการผลิตข้ามแผนก',
    department: 'PD',
    requester_id: 'U002',
    requesterId: 'U002',
    requester_name: 'ธนาวุฒิ สมควรกิจดำรง (PD Requester)',
    status: 'COMPLETED'
  };

  // 3 Station distributions: PD (Master), QA Head Office, EN Workshop
  const selectedStations = [
    { departmentId: 'QA', dept: 'QA', locationId: 'ST-QA-01', locationName: 'QA Head Office' },
    { departmentId: 'EN', dept: 'EN', locationId: 'ST-EN-01', locationName: 'EN Workshop' }
  ];

  const allocations = calculateCopyAllocations('PD', selectedStations);

  const copy01_PD = {
    id: 'cc-pd-01',
    doc_id: 'doc-pd-088',
    dar_id: 'DAR-PD-2026-088',
    doc_code: 'SOP-PD-088',
    docTitle: 'SOP-PD-088',
    doc_version: '01',
    rev: '01',
    copy_no: '01',
    ccNumber: 'CC-001',
    holder_dept: 'PD',
    department: 'PD',
    location: 'PD Production Line 1',
    locationName: 'PD Production Line 1',
    status: 'PENDING_ISSUE',
    is_master: true,
    isMaster: true
  };

  const copy02_QA = {
    id: 'cc-qa-02',
    doc_id: 'doc-pd-088',
    dar_id: 'DAR-PD-2026-088',
    doc_code: 'SOP-PD-088',
    docTitle: 'SOP-PD-088',
    doc_version: '01',
    rev: '01',
    copy_no: '02',
    ccNumber: 'CC-002',
    holder_dept: 'QA',
    department: 'QA',
    location: 'QA Head Office',
    locationName: 'QA Head Office',
    status: 'PENDING_ISSUE',
    is_master: false,
    isMaster: false
  };

  const copy03_EN = {
    id: 'cc-en-03',
    doc_id: 'doc-pd-088',
    dar_id: 'DAR-PD-2026-088',
    doc_code: 'SOP-PD-088',
    docTitle: 'SOP-PD-088',
    doc_version: '01',
    rev: '01',
    copy_no: '03',
    ccNumber: 'CC-003',
    holder_dept: 'EN',
    department: 'EN',
    location: 'EN Workshop',
    locationName: 'EN Workshop',
    status: 'PENDING_ISSUE',
    is_master: false,
    isMaster: false
  };

  beforeEach(() => {
    useStore.setState({
      currentUser: dccAdminUser,
      dars: [sampleDar],
      darRequests: [sampleDar],
      documents: [{
        id: 'doc-pd-088',
        title: 'SOP-PD-088',
        name: 'ระเบียบปฏิบัติงานสายการผลิตข้ามแผนก',
        rev: '01',
        department: 'PD',
        status: 'EFFECTIVE'
      }],
      documentControlledCopies: [copy01_PD, copy02_QA, copy03_EN],
      controlledCopyInstances: [copy01_PD, copy02_QA, copy03_EN],
      tasks: [],
      masterUsers: [pdUser, qaUser, enUser, dccAdminUser],
      notifications: []
    });
  });

  it('1. Verifies calculateCopyAllocations creates allocations strictly tagged with target department', () => {
    expect(allocations.masterCopy.department).toBe('PD');
    expect(allocations.masterCopy.target_department).toBe('PD');
    expect(allocations.distributedCopies).toHaveLength(2);

    const qaAlloc = allocations.distributedCopies.find(c => c.department === 'QC' || c.department === 'QA/QC' || c.department === 'QA' || c.departmentId === 'QC');
    expect(qaAlloc).toBeDefined();
    expect(qaAlloc.department).toBe('QC');
    expect(qaAlloc.target_department).toBe('QC');

    const enAlloc = allocations.distributedCopies.find(c => c.department === 'EN' || c.departmentId === 'EN');
    expect(enAlloc).toBeDefined();
    expect(enAlloc.department).toBe('EN');
    expect(enAlloc.target_department).toBe('EN');
  });

  it('2. DCC Dispatches all 3 copies -> tasks are strictly tagged with respective destination departments', () => {
    useStore.getState().dispatchControlledCopies(['cc-pd-01', 'cc-qa-02', 'cc-en-03']);

    const state = useStore.getState();
    const task01 = state.tasks.find(t => t.copy_id === 'cc-pd-01');
    const task02 = state.tasks.find(t => t.copy_id === 'cc-qa-02');
    const task03 = state.tasks.find(t => t.copy_id === 'cc-en-03');

    expect(task01.target_department).toBe('PD');
    expect(task01.assignedToDept).toBe('PD');
    expect(task01.assignee_id).toBe('U002'); // PD Requester

    expect(task02.target_department).toBe('QA');
    expect(task02.assignedToDept).toBe('QA');
    expect(task02.assignee_id).toBe('U005'); // QA Supervisor

    expect(task03.target_department).toBe('EN');
    expect(task03.assignedToDept).toBe('EN');
    expect(task03.assignee_id).toBe('U007'); // EN User
  });

  it('3. QA User logs into TaskInbox -> sees ONLY QA receipt task (Copy 02) and NOT PD or EN', () => {
    useStore.getState().dispatchControlledCopies(['cc-pd-01', 'cc-qa-02', 'cc-en-03']);

    useStore.setState({ currentUser: qaUser });

    render(
      <MemoryRouter>
        <TaskInbox />
      </MemoryRouter>
    );

    // QA user sees QA Copy 02
    expect(screen.getByText(/Copy 02/i)).toBeInTheDocument();

    // QA user MUST NOT see Copy 01 (PD) or Copy 03 (EN)
    expect(screen.queryByText(/Copy 01/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Copy 03/i)).not.toBeInTheDocument();
  });

  it('4. PD User logs into TaskInbox -> sees ONLY PD receipt task (Copy 01) and NOT QA or EN', () => {
    useStore.getState().dispatchControlledCopies(['cc-pd-01', 'cc-qa-02', 'cc-en-03']);

    useStore.setState({ currentUser: pdUser });

    render(
      <MemoryRouter>
        <TaskInbox />
      </MemoryRouter>
    );

    // PD user sees PD Copy 01
    expect(screen.getByText(/Copy 01/i)).toBeInTheDocument();

    // PD user MUST NOT see Copy 02 (QA) or Copy 03 (EN)
    expect(screen.queryByText(/Copy 02/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Copy 03/i)).not.toBeInTheDocument();
  });

  it('5. EN User logs into TaskInbox -> sees ONLY EN receipt task (Copy 03) and NOT PD or QA', () => {
    useStore.getState().dispatchControlledCopies(['cc-pd-01', 'cc-qa-02', 'cc-en-03']);

    useStore.setState({ currentUser: enUser });

    render(
      <MemoryRouter>
        <TaskInbox />
      </MemoryRouter>
    );

    // EN user sees EN Copy 03
    expect(screen.getByText(/Copy 03/i)).toBeInTheDocument();

    // EN user MUST NOT see Copy 01 (PD) or Copy 02 (QA)
    expect(screen.queryByText(/Copy 01/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Copy 02/i)).not.toBeInTheDocument();
  });

  it('6. Strict Authorization Guard: Non-QA user (PD User) attempting to confirm receipt for QA copy is rejected', () => {
    useStore.getState().dispatchControlledCopies(['cc-pd-01', 'cc-qa-02', 'cc-en-03']);
    const qaTask = useStore.getState().tasks.find(t => t.copy_id === 'cc-qa-02');

    // PD user tries to confirm QA copy
    useStore.setState({ currentUser: pdUser });
    useStore.getState().confirmHardcopyReceipt('cc-qa-02', qaTask.id, {
      name: pdUser.name,
      pin: '123456',
      remarks: 'Unauthorized attempt'
    });

    const state = useStore.getState();
    const qaCopy = state.controlledCopyInstances.find(c => c.id === 'cc-qa-02');
    // QA copy remains in DISPATCHED_PENDING_RECEIPT and is NOT confirmed
    expect(qaCopy.status).toBe('DISPATCHED_PENDING_RECEIPT');
    expect(qaCopy.receipt_confirmed_at).toBeFalsy();
    // QA task remains in tasks
    expect(state.tasks.some(t => t.copy_id === 'cc-qa-02')).toBe(true);
  });

  it('7. Authorized QA User confirms receipt -> QA copy becomes ISSUED_ACTIVE and removes QA task', () => {
    useStore.getState().dispatchControlledCopies(['cc-pd-01', 'cc-qa-02', 'cc-en-03']);
    const qaTask = useStore.getState().tasks.find(t => t.copy_id === 'cc-qa-02');

    // QA user confirms QA copy
    useStore.setState({ currentUser: qaUser });
    useStore.getState().confirmHardcopyReceipt('cc-qa-02', qaTask.id, {
      name: qaUser.name,
      pin: '654321',
      remarks: 'Verified physical QA binder'
    });

    const state = useStore.getState();
    const qaCopy = state.controlledCopyInstances.find(c => c.id === 'cc-qa-02');
    expect(qaCopy.status).toBe('ISSUED_ACTIVE');
    expect(qaCopy.receipt_confirmed_by).toBe(qaUser.name);
    expect(qaCopy.receipt_remarks).toBe('Verified physical QA binder');

    // QA task is removed, but PD and EN tasks remain pending
    expect(state.tasks.some(t => t.copy_id === 'cc-qa-02')).toBe(false);
    expect(state.tasks.some(t => t.copy_id === 'cc-pd-01')).toBe(true);
    expect(state.tasks.some(t => t.copy_id === 'cc-en-03')).toBe(true);
  });
});
