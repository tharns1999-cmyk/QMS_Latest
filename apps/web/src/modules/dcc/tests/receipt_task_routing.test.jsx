import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import TaskInbox from '../pages/Tasks/TaskInbox';

describe('Controlled Copy Receipt Task Routing to Strict DAR Requester Tests', () => {
  const requesterUser = {
    id: 'U002',
    name: 'ธนาวุฒิ สมควรกิจดำรง',
    department: 'PD',
    role: 'STAFF',
    level: 4,
    isDcc: false
  };

  const colleagueUser = {
    id: 'U003',
    name: 'กัลยาณี พลไกร',
    department: 'PD',
    role: 'MANAGER',
    level: 5,
    isDcc: false
  };

  const dccAdminUser = {
    id: 'U001',
    name: 'Admin QA (DCC)',
    department: 'QA',
    role: 'DCC_ADMIN',
    level: 1,
    isDcc: true
  };

  const sampleDar = {
    id: 'DAR-2026-001',
    title: 'SOP-PD-001',
    doc_code: 'SOP-PD-001',
    name: 'คู่มือการล้างผสมวัตถุดิบ',
    department: 'PD',
    requester_id: 'U002',
    requesterId: 'U002',
    requester_name: 'ธนาวุฒิ สมควรกิจดำรง',
    requesterName: 'ธนาวุฒิ สมควรกิจดำรง',
    status: 'APPROVED_WAITING_EFFECTIVE'
  };

  const sampleCopy = {
    id: 'cc-inst-101',
    doc_id: 'DAR-2026-001',
    dar_id: 'DAR-2026-001',
    doc_code: 'SOP-PD-001',
    docTitle: 'SOP-PD-001',
    doc_version: '01',
    rev: '01',
    copy_no: '02',
    ccNumber: '02',
    holder_dept: 'PD',
    department: 'PD',
    location: 'Line 1 - Mixing (ห้องผสม)',
    locationName: 'Line 1 - Mixing (ห้องผสม)',
    status: 'PENDING_ISSUE',
    isMaster: false
  };

  beforeEach(() => {
    useStore.setState({
      currentUser: dccAdminUser,
      dars: [sampleDar],
      darRequests: [sampleDar],
      documents: [{ id: 'DAR-2026-001', title: 'SOP-PD-001', name: 'คู่มือการล้างผสมวัตถุดิบ', rev: '01', department: 'PD', status: 'EFFECTIVE' }],
      documentControlledCopies: [sampleCopy],
      controlledCopyInstances: [sampleCopy],
      tasks: [],
      masterUsers: [requesterUser, colleagueUser, dccAdminUser],
      notifications: []
    });
  });

  it('1. DCC Dispatch creates DEPT_CONFIRM_HARDCOPY_RECEIPT task strictly assigned to Requester (U002)', () => {
    // DCC triggers dispatch
    useStore.getState().dispatchControlledCopy('cc-inst-101');

    const state = useStore.getState();
    const dispatchedCopy = state.controlledCopyInstances.find(c => c.id === 'cc-inst-101');
    expect(dispatchedCopy.status).toBe('DISPATCHED_PENDING_RECEIPT');
    expect(dispatchedCopy.requester_id).toBe('U002');
    expect(dispatchedCopy.requester_name).toBe('ธนาวุฒิ สมควรกิจดำรง');

    const receiptTask = state.tasks.find(t => t.copy_id === 'cc-inst-101');
    expect(receiptTask).toBeDefined();
    expect(receiptTask.type).toBe('DEPT_CONFIRM_HARDCOPY_RECEIPT');
    expect(receiptTask.assignee_id).toBe('U002');
    expect(receiptTask.assigneeId).toBe('U002');
    expect(receiptTask.assignee_name).toBe('ธนาวุฒิ สมควรกิจดำรง');
    expect(receiptTask.assigneeName).toBe('ธนาวุฒิ สมควรกิจดำรง');
    expect(receiptTask.assignedToDept).toBe('PD');
  });

  it('2. Requester (U002) sees the Receipt Task in Task Inbox and on Sidebar badge', () => {
    useStore.getState().dispatchControlledCopy('cc-inst-101');

    // Switch currentUser to Requester (U002)
    useStore.setState({ currentUser: requesterUser });

    render(
      <MemoryRouter>
        <TaskInbox />
      </MemoryRouter>
    );

    // Should find the task
    expect(screen.getByText('SOP-PD-001')).toBeInTheDocument();
    expect(screen.getAllByText('ตรวจรับสำเนา').length).toBeGreaterThan(0);
  });

  it('3. User in different department (U005 - Beam QA) does NOT see the Receipt Task in Task Inbox', () => {
    useStore.getState().dispatchControlledCopy('cc-inst-101');

    // Switch currentUser to different department (QA)
    const otherDeptUser = { ...colleagueUser, id: 'U005', name: 'บีม (QA)', department: 'QA', depts: ['QA'] };
    useStore.setState({ currentUser: otherDeptUser });

    render(
      <MemoryRouter>
        <TaskInbox />
      </MemoryRouter>
    );

    // Should NOT find the receipt task
    expect(screen.queryByText(/ตรวจรับเอกสารควบคุมฉบับพิมพ์: SOP-PD-001/i)).not.toBeInTheDocument();
    expect(screen.getByText(/ไม่มีงานค้างในกล่องข้อความ/i)).toBeInTheDocument();
  });

  it('4. Confirming receipt clears the task and marks copy as ISSUED_ACTIVE with receipt audit info', () => {
    useStore.getState().dispatchControlledCopy('cc-inst-101');
    const task = useStore.getState().tasks.find(t => t.copy_id === 'cc-inst-101');

    useStore.setState({ currentUser: requesterUser });
    useStore.getState().confirmHardcopyReceipt('cc-inst-101', task.id, {
      name: requesterUser.name,
      pin: '123456',
      remarks: 'Verified physical binder'
    });

    const state = useStore.getState();
    const confirmedCopy = state.controlledCopyInstances.find(c => c.id === 'cc-inst-101');
    expect(confirmedCopy.status).toBe('ISSUED_ACTIVE');
    expect(confirmedCopy.receipt_confirmed_by).toBe('ธนาวุฒิ สมควรกิจดำรง');
    expect(confirmedCopy.receipt_remarks).toBe('Verified physical binder');

    // Task is cleared
    const remainingTasks = state.tasks.filter(t => t.id === task.id);
    expect(remainingTasks.length).toBe(0);
  });
});
