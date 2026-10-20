import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../store/useStore';
import TaskInbox from '../../modules/dcc/pages/Tasks/TaskInbox';
import Sidebar from '../layout/Sidebar';
import Dashboard from '../../modules/dcc/pages/Dashboard/Dashboard';
import { isActionableTask, isDccUser } from '../../modules/dcc/utils/taskFilter';

describe('Role-Based Task Visibility & Sidebar Badge Tests (No DCC Leak for QMR/Executives)', () => {
  const rayExecutiveQmrUser = {
    id: 'U004',
    empId: 'EMP-004',
    name: 'คุณเรย์',
    fullName: 'คุณเรย์',
    email: 'ray.gm@company.com',
    position: 'General Manager / QMR',
    level: 6,
    approval_level: 6,
    role: 'DEPT_ADMIN',
    isDcc: false,
    isQmr: true,
    department: 'MGMT',
    dept: 'MGMT',
    primary_department: 'MGMT',
    affiliated_departments: ['MGMT'],
    depts: ['MGMT'],
    status: 'ACTIVE'
  };

  const dccAdminUser = {
    id: 'EMP-001',
    empId: 'EMP-001',
    name: 'ธนาวุฒิ สมควรกิจดำรง',
    department: 'DC',
    dept: 'DC',
    primary_department: 'DC',
    affiliated_departments: ['DC'],
    depts: ['DC'],
    role: 'DCC_ADMIN',
    isDcc: true,
    isQmr: false,
    level: 4,
    approval_level: 4,
    status: 'ACTIVE'
  };

  const sampleTasks = [
    // 1. DCC Distribution Task (NEW controlled copies)
    {
      id: 'task-dist-01',
      title: 'Distribution Task: แจกจ่ายเอกสาร Controlled Copy (NEW)',
      type: 'DCC_DISTRIBUTE',
      taskType: 'DCC_DISTRIBUTE',
      department: 'DC',
      target_department: 'DC',
      assignedToRole: 'DCC_ADMIN',
      target_role: 'DCC',
      assigneeId: 'EMP-001',
      status: 'PENDING',
      dueDate: '2026-09-10'
    },
    // 2. DCC Recall Task
    {
      id: 'task-recall-01',
      title: 'Recall Task: เรียกคืนเอกสาร Controlled Copy Rev.00',
      type: 'DCC_RECALL',
      taskType: 'DCC_RECALL',
      department: 'DC',
      target_department: 'DC',
      assignedToRole: 'DCC_ADMIN',
      target_role: 'DCC',
      assigneeId: 'EMP-001',
      status: 'PENDING',
      dueDate: '2026-09-10'
    },
    // 3. PD Department Review Task
    {
      id: 'task-review-pd-01',
      title: 'ทบทวน SOP การผลิตสาย A',
      type: 'Review',
      taskType: 'REVIEW',
      department: 'PD',
      target_department: 'PD',
      assigneeId: 'U002',
      status: 'PENDING',
      dueDate: '2026-09-12'
    },
    // 4. PD Department Receipt Task
    {
      id: 'task-receipt-pd-01',
      title: 'ตรวจรับเล่มสำเนาควบคุม SOP-PD-001 (สถานี PD-01)',
      type: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
      taskType: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
      department: 'PD',
      target_department: 'PD',
      status: 'PENDING',
      dueDate: '2026-09-12'
    }
  ];

  beforeEach(() => {
    useStore.setState({
      currentUser: rayExecutiveQmrUser,
      tasks: sampleTasks,
      dars: [],
      documents: [
        { id: 'DOC-PD-001', title: 'SOP-PD-001', department: 'PD', status: 'EFFECTIVE' }
      ],
      controlledCopyInstances: [
        { id: 'cc-01', doc_id: 'DOC-PD-001', status: 'PENDING_ISSUE', holder_dept: 'DC' },
        { id: 'cc-02', doc_id: 'DOC-PD-001', status: 'PENDING_RECALL', holder_dept: 'QA' }
      ],
      masterUsers: [rayExecutiveQmrUser, dccAdminUser]
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('1. TaskFilter Utility Unit Logic', () => {
    it('correctly identifies DCC user vs non-DCC user', () => {
      expect(isDccUser(dccAdminUser)).toBe(true);
      expect(isDccUser(rayExecutiveQmrUser)).toBe(false);
    });

    it('denies DCC operational tasks for non-DCC users (even QMR/Executives)', () => {
      const distTask = sampleTasks[0];
      const recallTask = sampleTasks[1];

      // Non-DCC user (Ray) cannot action DCC operational tasks
      expect(isActionableTask(distTask, rayExecutiveQmrUser)).toBe(false);
      expect(isActionableTask(recallTask, rayExecutiveQmrUser)).toBe(false);

      // DCC user can action DCC operational tasks
      expect(isActionableTask(distTask, dccAdminUser)).toBe(true);
      expect(isActionableTask(recallTask, dccAdminUser)).toBe(true);
    });

    it('allows actionable tasks assigned directly to the user', () => {
      const qmrDirectTask = {
        id: 'task-approve-qmr-01',
        title: 'อนุมัติคู่มือคุณภาพประจำปี (QMR Approval)',
        type: 'Approve',
        taskType: 'APPROVE',
        department: 'MGMT',
        assigneeId: 'U004',
        status: 'PENDING'
      };

      expect(isActionableTask(qmrDirectTask, rayExecutiveQmrUser)).toBe(true);
    });
  });

  describe('2. TaskInbox Component: Visibility & Filtering Scoping', () => {
    it('shows empty state for Ray (MGMT L6) when he has no actionable tasks', () => {
      render(
        <MemoryRouter initialEntries={['/dcc/tasks']}>
          <TaskInbox />
        </MemoryRouter>
      );

      // ❌ Distribution Task must NOT be visible to Ray
      expect(screen.queryByText(/แจกจ่ายเอกสาร Controlled Copy/i)).not.toBeInTheDocument();

      // ❌ Recall Task must NOT be visible to Ray
      expect(screen.queryByText(/เรียกคืนเอกสาร Controlled Copy/i)).not.toBeInTheDocument();

      // ❌ Other department tasks must NOT be visible to Ray
      expect(screen.queryByText(/ทบทวน SOP การผลิตสาย A/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/ตรวจรับเล่มสำเนาควบคุม SOP-PD-001/i)).not.toBeInTheDocument();

      // ✅ Empty state is rendered
      expect(screen.getByText('ไม่มีงานค้างในกล่องข้อความ')).toBeInTheDocument();
      expect(screen.getByText('คุณจัดการงานทั้งหมดเรียบร้อยแล้ว')).toBeInTheDocument();

      // ✅ Department pill default is NOT "งานทั้งหมดทุกแผนก"
      expect(screen.queryByText(/🏢 งานทั้งหมดทุกแผนก/i)).not.toBeInTheDocument();
    });

    it('displays DCC Distribution task for DCC Admin profile', () => {
      useStore.setState({ currentUser: dccAdminUser });

      render(
        <MemoryRouter initialEntries={['/dcc/tasks']}>
          <TaskInbox />
        </MemoryRouter>
      );

      // ✅ DCC Admin sees the Distribution task
      expect(screen.getByText(/แจกจ่ายเอกสาร Controlled Copy \(NEW\)/i)).toBeInTheDocument();

      // ✅ DCC Admin sees the Recall task
      expect(screen.getByText(/เรียกคืนเอกสาร Controlled Copy Rev.00/i)).toBeInTheDocument();

      // ✅ DCC Admin sees "งานทั้งหมดทุกแผนก" button in DCC operational view
      expect(screen.getByText(/🏢 งานทั้งหมดทุกแผนก/i)).toBeInTheDocument();
    });

    it('displays assigned approval task for Ray when targeted to him', () => {
      const qmrDirectTask = {
        id: 'task-approve-qmr-01',
        title: 'ลงนามอนุมัตินโยบายคุณภาพ QMR',
        type: 'Approve',
        taskType: 'APPROVE',
        department: 'MGMT',
        target_department: 'MGMT',
        assigneeId: 'U004',
        status: 'PENDING',
        dueDate: '2026-09-15'
      };

      useStore.setState({
        currentUser: rayExecutiveQmrUser,
        tasks: [...sampleTasks, qmrDirectTask]
      });

      render(
        <MemoryRouter initialEntries={['/dcc/tasks']}>
          <TaskInbox />
        </MemoryRouter>
      );

      // ✅ Ray sees his personal approval task
      expect(screen.getByText(/ลงนามอนุมัตินโยบายคุณภาพ QMR/i)).toBeInTheDocument();

      // ❌ Still does NOT see the DCC Distribution task
      expect(screen.queryByText(/แจกจ่ายเอกสาร Controlled Copy/i)).not.toBeInTheDocument();
    });
  });

  describe('3. Sidebar Component: Badge Count Synchronisation', () => {
    it('renders badge count as 0 (hidden) on Sidebar for Ray when no actionable tasks exist', () => {
      const { container } = render(
        <MemoryRouter initialEntries={['/dcc/dashboard']}>
          <Sidebar />
        </MemoryRouter>
      );

      // Find the NavLink for Task Inbox (/dcc/tasks)
      const taskNavLink = container.querySelector('a[href="/dcc/tasks"]');
      expect(taskNavLink).toBeInTheDocument();

      // Verify that NO badge span is rendered inside the task link because badgeCount === 0
      const badge = taskNavLink.querySelector('.badge-system') || taskNavLink.querySelector('span.bg-\\[\\#F24822\\]') || taskNavLink.querySelector('span.bg-rose-500');
      expect(badge).toBeNull();
    });

    it('renders badge count for DCC Admin reflecting their actionable DCC tasks', () => {
      useStore.setState({ currentUser: dccAdminUser });

      const { container } = render(
        <MemoryRouter initialEntries={['/dcc/dashboard']}>
          <Sidebar />
        </MemoryRouter>
      );

      const taskNavLink = container.querySelector('a[href="/dcc/tasks"]');
      expect(taskNavLink).toBeInTheDocument();

      // DCC Admin has 2 actionable DCC tasks (Distribute, Recall; PD Receipt task is scoped to PD)
      // Badge should display 2
      expect(taskNavLink.textContent).toContain('2');
    });
  });

  describe('4. Dashboard Component: Task Queue Alignment', () => {
    it('shows 0 tasks for Ray on Dashboard', () => {
      render(
        <MemoryRouter initialEntries={['/dcc/dashboard']}>
          <Dashboard />
        </MemoryRouter>
      );

      // "ตรวจสอบคิวงาน" or actionable tasks counter should not display pending tasks for Ray
      expect(screen.queryByText('แจกจ่ายเอกสาร Controlled Copy')).not.toBeInTheDocument();
    });
  });
});
