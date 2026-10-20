import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import useStore, { MASTER_DATA_USER } from '../store/useStore';
import ControlledCopyRegister from '../pages/ControlledCopy/ControlledCopyRegister';
import TaskInbox from '../pages/Tasks/TaskInbox';

const renderWithRouter = (ui) => {
  return render(
    <BrowserRouter>
      {ui}
    </BrowserRouter>
  );
};

describe('Post-Dispatch Delivery Tracking & DCC Task Lifecycle Sync Tests', () => {
  const pdDoc = {
    id: 'doc-pd-088',
    title: 'SOP-PD-088',
    doc_code: 'SOP-PD-088',
    name: 'ระเบียบการควบคุมสายการผลิตเบเกอรี่',
    rev: '01',
    department: 'PD',
    status: 'EFFECTIVE'
  };

  const copy01_PD = {
    id: 'cc-pd-88-01',
    doc_id: 'doc-pd-088',
    doc_code: 'SOP-PD-088',
    docTitle: 'SOP-PD-088',
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
    id: 'cc-pd-88-02',
    doc_id: 'doc-pd-088',
    doc_code: 'SOP-PD-088',
    docTitle: 'SOP-PD-088',
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
    id: 'cc-pd-88-03',
    doc_id: 'doc-pd-088',
    doc_code: 'SOP-PD-088',
    docTitle: 'SOP-PD-088',
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

  const dccDistributionTask = {
    id: 'task-dcc-dist-88',
    docId: 'doc-pd-088',
    doc_id: 'doc-pd-088',
    doc_code: 'SOP-PD-088',
    docTitle: 'SOP-PD-088',
    type: 'DCC_DISTRIBUTE',
    taskType: 'DCC_DISTRIBUTE',
    title: 'แจกจ่ายเอกสาร Controlled Copy: SOP-PD-088',
    description: 'กรุณาพิมพ์และแจกจ่ายสำเนาควบคุมสำหรับเอกสาร SOP-PD-088 จำนวน 3 แผนก/จุดใช้งาน',
    department: 'DC',
    target_department: 'PD',
    assignedToRole: 'DCC_ADMIN',
    status: 'PENDING',
    actionRequired: true,
    isUrgent: true,
    dueDate: '2026-09-10'
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

  beforeEach(() => {
    useStore.setState({
      currentUser: dccAdmin,
      documents: [pdDoc],
      controlledCopyInstances: [copy01_PD, copy02_PD, copy03_QA],
      documentControlledCopies: [copy01_PD, copy02_PD, copy03_QA],
      tasks: [dccDistributionTask],
      masterUsers: [dccAdmin, pdStaff, beamQA],
      notifications: [],
      controlledCopyAuditTrail: [],
      actionLog: []
    });
  });

  it('1. Pre-dispatch initial state: Tab 1 has 3 items, Tab 2 has 0 items, DCC has 1 actionable distribution task', () => {
    const { unmount } = renderWithRouter(<ControlledCopyRegister />);
    
    // Tab 1 shows count 3, Tab 2 shows count 0
    expect(screen.getByText(/1\. รายการรอออกสำเนา/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. ติดตามการส่งมอบ/i)).toBeInTheDocument();
    
    unmount();

    // Check Task Inbox for DCC
    renderWithRouter(<TaskInbox />);
    expect(screen.getByText(/กรุณาพิมพ์และแจกจ่ายสำเนาควบคุม/i)).toBeInTheDocument();
  });

  it('2. Post-dispatch state transition: Tab 1 drops to 0, Tab 2 increases to 3 with destination department badges', () => {
    // DCC triggers Dispatch All via store action
    useStore.getState().dispatchControlledCopies([copy01_PD.id, copy02_PD.id, copy03_QA.id]);

    const state = useStore.getState();
    const copies = state.controlledCopyInstances;
    expect(copies.every(c => c.status === 'DISPATCHED_PENDING_RECEIPT')).toBe(true);
    expect(copies.every(c => Boolean(c.dispatched_at) && Boolean(c.dispatched_by))).toBe(true);

    // Render Controlled Copy Register
    renderWithRouter(<ControlledCopyRegister />);

    // Click on Tab 2: ติดตามการส่งมอบ
    const tab2Button = screen.getByText(/2\. ติดตามการส่งมอบ/i);
    fireEvent.click(tab2Button);

    // Tab 2 table must display all 3 copies and their recipient departments
    expect(screen.getByText(/ติดตามการส่งมอบและรอตรวจรับ \(3 รายการ\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Copy 01/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Copy 02/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Copy 03/i).length).toBeGreaterThan(0);

    // Department badges in table: PD and QA/QC (or QC)
    expect(screen.getAllByText(/รอตรวจรับ \(PD\)/i).length).toBe(2);
    expect(screen.getByText(/รอตรวจรับ \((QA\/QC|QC)\)/i)).toBeInTheDocument();
  });

  it('3. DCC Task Inbox reflects post-dispatch tracking and clears urgent actionRequired count', () => {
    // DCC dispatches all copies
    useStore.getState().dispatchControlledCopies([copy01_PD.id, copy02_PD.id, copy03_QA.id]);

    const tasks = useStore.getState().tasks;
    const distTask = tasks.find(t => t.id === dccDistributionTask.id);
    expect(distTask).toBeDefined();
    expect(distTask.status).toBe('COMPLETED');
    expect(distTask.is_completed).toBe(true);
    expect(distTask.actionRequired).toBe(false);
    expect(distTask.delivery_status).toBe('DISPATCHED_TRACKING');

    // Render DCC Task Inbox
    renderWithRouter(<TaskInbox />);

    // Fast-track / Urgent action text "กรุณาพิมพ์และแจกจ่าย..." is NO LONGER displayed
    expect(screen.queryByText(/กรุณาพิมพ์และแจกจ่ายสำเนาควบคุม/i)).not.toBeInTheDocument();

    // Completed distribution task leaves the pending inbox; tracking lives in ControlledCopyRegister (Tab 2)
    expect(screen.queryByText(/ติดตามการส่งมอบ \(รอปลายทางตรวจรับ\)/i)).not.toBeInTheDocument();
  });

  it('4. Receipt tasks are generated and isolated for recipient departments (PD & QA/QC)', () => {
    useStore.getState().dispatchControlledCopies([copy01_PD.id, copy02_PD.id, copy03_QA.id]);

    const tasks = useStore.getState().tasks;
    const receiptTasks = tasks.filter(t => t.type === 'DEPT_CONFIRM_HARDCOPY_RECEIPT');
    expect(receiptTasks.length).toBe(3);

    const pdReceiptTasks = receiptTasks.filter(t => t.target_department === 'PD');
    const qaReceiptTasks = receiptTasks.filter(t => t.target_department === 'QA/QC' || t.target_department === 'QC');

    expect(pdReceiptTasks.length).toBe(2);
    expect(qaReceiptTasks.length).toBe(1);
    expect(qaReceiptTasks[0].assignee_id).toBe('U005'); // Beam QA
  });

  it('5. Confirming all receipts resolves the distribution tracking task to ALL_RECEIPTS_CONFIRMED', () => {
    useStore.getState().dispatchControlledCopies([copy01_PD.id, copy02_PD.id, copy03_QA.id]);

    const tasks = useStore.getState().tasks;
    const task01 = tasks.find(t => t.copy_id === copy01_PD.id);
    const task02 = tasks.find(t => t.copy_id === copy02_PD.id);
    const task03 = tasks.find(t => t.copy_id === copy03_QA.id);

    // 1. Confirm Copy 01 & Copy 02 by PD
    useStore.setState({ currentUser: pdStaff });
    useStore.getState().confirmHardcopyReceipt(copy01_PD.id, task01.id);
    useStore.getState().confirmHardcopyReceipt(copy02_PD.id, task02.id);

    // 2. Confirm Copy 03 by QA
    useStore.setState({ currentUser: beamQA });
    useStore.getState().confirmHardcopyReceipt(copy03_QA.id, task03.id);

    const state = useStore.getState();
    const copies = state.controlledCopyInstances;
    expect(copies.every(c => c.status === 'ISSUED_ACTIVE')).toBe(true);

    const distTask = state.tasks.find(t => t.id === dccDistributionTask.id);
    if (distTask) {
      expect(distTask.delivery_status).toBe('ALL_RECEIPTS_CONFIRMED');
    }
  });
});
