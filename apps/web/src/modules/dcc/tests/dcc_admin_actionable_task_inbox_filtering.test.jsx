import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import TaskInbox from '../pages/Tasks/TaskInbox';

describe('Bug Fix: Restrict DCC Admin Task Inbox to Actionable Tasks Only (Remove Global Review Leak)', () => {
  const dccAdminUser = {
    id: 'EMP-001',
    name: 'ธนาวุฒิ สมควรกิจดำรง',
    department: 'DC',
    depts: ['DC'],
    primary_department: 'DC',
    affiliated_departments: ['DC'],
    role: 'DCC_ADMIN',
    isDcc: true,
    level: 4,
    approval_level: 4
  };

  const pdManagerUser = {
    id: 'U002',
    name: 'สมศักดิ์ ผู้จัดการฝ่ายผลิต',
    department: 'PD',
    depts: ['PD'],
    primary_department: 'PD',
    affiliated_departments: ['PD'],
    role: 'DEPT_ADMIN',
    level: 3,
    approval_level: 3
  };

  beforeEach(() => {
    useStore.setState({
      currentUser: dccAdminUser,
      tasks: [
        // 1. Other department Review Task (PD) - assigned to U002
        {
          id: 'task-review-pd-01',
          referenceId: 'DAR-PD-001',
          darId: 'DAR-PD-001',
          title: 'ทบทวน SOP ฝ่ายผลิต (PD Task)',
          type: 'Review',
          taskType: 'REVIEW',
          department: 'PD',
          target_department: 'PD',
          assigneeId: 'U002',
          assignee_id: 'U002',
          status: 'PENDING',
          dueDate: '2026-09-10'
        },
        // 2. Other department Approval Task (QA) - assigned to QA Manager
        {
          id: 'task-approve-qa-01',
          referenceId: 'DAR-QA-001',
          darId: 'DAR-QA-001',
          title: 'อนุมัติ WI ฝ่ายตรวจสอบคุณภาพ (QA Task)',
          type: 'Approve',
          taskType: 'APPROVE',
          department: 'QA',
          target_department: 'QA',
          assigneeId: 'U005',
          assignee_id: 'U005',
          status: 'PENDING',
          dueDate: '2026-09-10'
        },
        // 3. DCC Specific Distribution Task (Target DCC Admin)
        {
          id: 'task-dist-01',
          referenceId: 'DOC-PD-001',
          title: 'แจกจ่ายเอกสาร Controlled Copy SOP-PD-001',
          type: 'DCC_DISTRIBUTE',
          taskType: 'DCC_DISTRIBUTE',
          department: 'DC',
          target_department: 'PD',
          assignedToRole: 'DCC_ADMIN',
          status: 'PENDING',
          dueDate: '2026-09-08'
        },
        // 4. DCC Specific Recall Task
        {
          id: 'task-recall-01',
          referenceId: 'DOC-QA-001',
          title: 'เรียกคืนเอกสาร Controlled Copy Rev.00',
          type: 'DCC_RECALL',
          taskType: 'DCC_RECALL',
          assignedToRole: 'DCC_ADMIN',
          status: 'PENDING',
          dueDate: '2026-09-08'
        },
        // 5. Department-Pooled Receipt Task (Physical Copy Receipt for PD station)
        {
          id: 'task-receipt-pd-01',
          title: 'ตรวจรับเล่มสำเนาควบคุม SOP-PD-001 (สถานี PD-01)',
          type: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
          taskType: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
          target_department: 'PD',
          status: 'PENDING',
          dueDate: '2026-09-12'
        },
        // 6. Direct task assigned to DCC Admin (e.g. Review task within DC department)
        {
          id: 'task-review-dc-01',
          referenceId: 'DAR-DC-001',
          darId: 'DAR-DC-001',
          title: 'ทบทวนระเบียบงาน DCC (DC Department)',
          type: 'Review',
          taskType: 'REVIEW',
          department: 'DC',
          target_department: 'DC',
          assigneeId: 'EMP-001',
          assignee_id: 'EMP-001',
          status: 'PENDING',
          dueDate: '2026-09-09'
        }
      ],
      dars: [
        { id: 'DAR-PD-001', title: 'ทบทวน SOP ฝ่ายผลิต (PD Task)', type: 'NEW' },
        { id: 'DAR-QA-001', title: 'อนุมัติ WI ฝ่ายตรวจสอบคุณภาพ (QA Task)', type: 'NEW' },
        { id: 'DAR-DC-001', title: 'ทบทวนระเบียบงาน DCC (DC Department)', type: 'NEW' }
      ],
      documents: [
        { id: 'DOC-PD-001', title: 'SOP-PD-001', name: 'SOP ฝ่ายผลิต', department: 'PD', rev: '01', status: 'EFFECTIVE' },
        { id: 'DOC-QA-001', title: 'SOP-QA-001', name: 'SOP ฝ่ายตรวจสอบคุณภาพ', department: 'QA', rev: '01', status: 'OBSOLETE' }
      ],
      controlledCopyInstances: [
        { id: 'cc-01', docId: 'DOC-PD-001', doc_code: 'SOP-PD-001', status: 'PENDING_ISSUE', holder_dept: 'PD' },
        { id: 'cc-02', docId: 'DOC-QA-001', doc_code: 'SOP-QA-001', status: 'PENDING_RECALL', holder_dept: 'QA' }
      ]
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('1. DCC Admin sees actionable DCC tasks, receipt tasks, and direct DC tasks, but NOT other dept review/approve tasks', () => {
    render(
      <MemoryRouter>
        <TaskInbox />
      </MemoryRouter>
    );

    // ❌ Should NOT see PD Review task
    expect(screen.queryByText(/ทบทวน SOP ฝ่ายผลิต \(PD Task\)/i)).not.toBeInTheDocument();

    // ❌ Should NOT see QA Approve task
    expect(screen.queryByText(/อนุมัติ WI ฝ่ายตรวจสอบคุณภาพ \(QA Task\)/i)).not.toBeInTheDocument();

    // ✅ MUST see DCC Distribution task
    expect(screen.getByText(/แจกจ่ายเอกสาร Controlled Copy SOP-PD-001/i)).toBeInTheDocument();

    // ✅ MUST see DCC Recall task
    expect(screen.getByText(/เรียกคืนเอกสาร Controlled Copy Rev.00/i)).toBeInTheDocument();

    // ❌ Should NOT see Department-Pooled Receipt task for PD department
    expect(screen.queryByText(/ตรวจรับเล่มสำเนาควบคุม SOP-PD-001 \(สถานี PD-01\)/i)).not.toBeInTheDocument();

    // ✅ MUST see direct Review task for DC department assigned to him
    expect(screen.getByText(/ทบทวนระเบียบงาน DCC \(DC Department\)/i)).toBeInTheDocument();
  });

  it('2. PD Manager logs into TaskInbox and sees their own PD review task, but NOT DCC admin tasks or QA tasks', () => {
    useStore.setState({ currentUser: pdManagerUser });

    render(
      <MemoryRouter>
        <TaskInbox />
      </MemoryRouter>
    );

    // ✅ Sees PD Review task
    expect(screen.getByText(/ทบทวน SOP ฝ่ายผลิต \(PD Task\)/i)).toBeInTheDocument();

    // ✅ Sees PD Receipt task
    expect(screen.getByText(/ตรวจรับเล่มสำเนาควบคุม SOP-PD-001 \(สถานี PD-01\)/i)).toBeInTheDocument();

    // ❌ Does NOT see QA Approve task
    expect(screen.queryByText(/อนุมัติ WI ฝ่ายตรวจสอบคุณภาพ \(QA Task\)/i)).not.toBeInTheDocument();

    // ❌ Does NOT see DCC-specific Distribution task
    expect(screen.queryByText(/แจกจ่ายเอกสาร Controlled Copy SOP-PD-001/i)).not.toBeInTheDocument();

    // ❌ Does NOT see DC department Review task
    expect(screen.queryByText(/ทบทวนระเบียบงาน DCC \(DC Department\)/i)).not.toBeInTheDocument();
  });
});
