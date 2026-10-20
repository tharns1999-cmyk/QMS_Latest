import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import TaskInbox from '../pages/Tasks/TaskInbox';

const renderWithRouter = (ui) => {
  return render(
    <BrowserRouter>
      {ui}
    </BrowserRouter>
  );
};

describe('Cross-Department Copy Dispatch Routing Tests', () => {
  const pdDoc = {
    id: 'doc-pd-01',
    title: 'SOP-PD-01',
    name: 'ขั้นตอนการผลิตเบเกอรี่และควบคุมสายการอบ',
    rev: '01',
    department: 'PD',
    status: 'EFFECTIVE'
  };

  const copy01_PD = {
    id: 'cc-pd-01',
    doc_id: 'doc-pd-01',
    doc_code: 'SOP-PD-01',
    docTitle: 'SOP-PD-01',
    doc_version: '01',
    rev: '01',
    copy_no: '01',
    copy_number: 1,
    ccNumber: 'CC-001',
    owner_dept: 'PD',
    target_department: 'PD',
    holder_dept: 'PD',
    department: 'PD',
    location: 'PD Head Office (จุดคุมงานหลัก Master)',
    locationName: 'PD Head Office (จุดคุมงานหลัก Master)',
    status: 'ISSUED_ACTIVE',
    is_master: true
  };

  const pdUser = {
    id: 'U-PD-01',
    name: 'กัลยาณี ประจำไลน์',
    role: 'DEPT_STAFF',
    department: 'PD',
    primary_department: 'PD',
    affiliated_departments: ['PD'],
    level: 2
  };

  const qaUser = {
    id: 'U-QA-01',
    name: 'กานต์ ประกันคุณภาพ',
    role: 'DEPT_STAFF',
    department: 'QA',
    primary_department: 'QA',
    affiliated_departments: ['QA'],
    level: 2
  };

  const dccAdmin = {
    id: 'U-DCC-01',
    name: 'Admin DCC',
    role: 'DCC_ADMIN',
    department: 'QA',
    primary_department: 'QA',
    affiliated_departments: ['QA'],
    isDcc: true,
    level: 4
  };

  beforeEach(() => {
    useStore.setState({
      currentUser: dccAdmin,
      documents: [pdDoc],
      controlledCopyInstances: [copy01_PD],
      documentControlledCopies: [copy01_PD],
      tasks: [],
      masterUsers: [pdUser, qaUser, dccAdmin],
      notifications: [],
      distributionLocations: [
        { id: 'PD-MASTER', name: 'PD Head Office', departmentId: 'PD', status: 'ACTIVE' },
        { id: 'LOC-QA-01', name: 'QA Lab (ห้องปฏิบัติการควบคุมคุณภาพ)', departmentId: 'QA', status: 'ACTIVE' }
      ]
    });
  });

  it('1. requestAdditionalControlledCopies preserves target_department = QA for cross-dept copy', () => {
    const newLocations = [
      {
        departmentId: 'QA',
        target_department: 'QA',
        locationId: 'LOC-QA-01',
        locationName: 'QA Lab (ห้องปฏิบัติการควบคุมคุณภาพ)'
      }
    ];

    useStore.getState().requestAdditionalControlledCopies(
      'doc-pd-01',
      newLocations,
      'ขอสำเนาข้ามแผนกไปยัง QA Lab'
    );

    const state = useStore.getState();
    const copies = state.controlledCopyInstances.filter(c => c.doc_id === 'doc-pd-01');
    expect(copies).toHaveLength(2); // Copy 01 (PD) + Copy 02 (QA)

    const copy02 = copies.find(c => c.copy_no === '02' || c.copy_number === 2);
    expect(copy02).toBeDefined();
    expect(copy02.target_department).toBe('QA');
    expect(copy02.holder_dept).toBe('QA');
    expect(copy02.owner_dept).toBe('PD');
    expect(copy02.status).toBe('PENDING_ISSUE');
  });

  it('2. dispatchControlledCopy strictly routes Receipt Task to QA (Recipient Dept), NOT PD (Owner Dept)', () => {
    // Request additional copy for QA
    useStore.getState().requestAdditionalControlledCopies(
      'doc-pd-01',
      [{ departmentId: 'QA', locationId: 'LOC-QA-01', locationName: 'QA Lab' }],
      'ขอสำเนาข้ามแผนกไปยัง QA'
    );

    const state = useStore.getState();
    const copy02 = state.controlledCopyInstances.find(c => c.copy_no === '02');
    expect(copy02).toBeDefined();

    // DCC Dispatches the copy
    useStore.getState().dispatchControlledCopy(copy02.id);

    const afterDispatchState = useStore.getState();
    const dispatchedCopy = afterDispatchState.controlledCopyInstances.find(c => c.id === copy02.id);
    expect(dispatchedCopy.status).toBe('DISPATCHED_PENDING_RECEIPT');
    expect(dispatchedCopy.dispatched_to_dept).toBe('QA');
    expect(dispatchedCopy.target_department).toBe('QA');

    // Verify created receipt task
    const receiptTask = afterDispatchState.tasks.find(t => t.copy_id === copy02.id);
    expect(receiptTask).toBeDefined();
    expect(receiptTask.type).toBe('DEPT_CONFIRM_HARDCOPY_RECEIPT');
    expect(receiptTask.target_department).toBe('QA');
    expect(receiptTask.assignedToDept).toBe('QA');
    expect(receiptTask.assignee_dept).toBe('QA');
    expect(receiptTask.assignee_id).toBe('U-QA-01'); // Must be assigned to QA staff, NOT PD!
  });

  it('3. In TaskInbox: QA user sees the receipt task under QA tab, while PD user does not see it', () => {
    // 1. Setup dispatched copy 02 for QA
    useStore.getState().requestAdditionalControlledCopies(
      'doc-pd-01',
      [{ departmentId: 'QA', locationId: 'LOC-QA-01', locationName: 'QA Lab' }],
      'ขอสำเนาข้ามแผนกไปยัง QA'
    );
    const copy02 = useStore.getState().controlledCopyInstances.find(c => c.copy_no === '02');
    useStore.getState().dispatchControlledCopy(copy02.id);

    // 2. Render TaskInbox as QA User
    useStore.setState({ currentUser: qaUser });
    const { unmount } = renderWithRouter(<TaskInbox />);

    // QA user should see the task
    expect(screen.getByText('SOP-PD-01')).toBeInTheDocument();
    expect(screen.getByText(/Copy 02/i)).toBeInTheDocument();
    expect(screen.getAllByText(/ตรวจรับเล่มสำเนา \(Receipt\)/i).length).toBeGreaterThan(0);
    unmount();

    // 3. Render TaskInbox as PD User
    useStore.setState({ currentUser: pdUser });
    renderWithRouter(<TaskInbox />);

    // PD user should NOT see this cross-department task
    expect(screen.queryByText('SOP-PD-01')).not.toBeInTheDocument();
    expect(screen.queryByText(/Copy 02/i)).not.toBeInTheDocument();
  });
});
