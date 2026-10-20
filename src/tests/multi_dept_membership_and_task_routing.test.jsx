import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { renderWithRouter, setTestUser } from './test_utils';
import useStore from '../store/useStore';
import MasterDataHub from '../pages/Admin/MasterDataHub';
import TaskInbox from '../pages/Tasks/TaskInbox';

describe('Multi-Department Membership & Cross-Department Task Routing Tests', () => {
  beforeEach(() => {
    useStore.getState().resetStore();
  });

  describe('1. Master Data Hub: User Entity & Multi-Department Tag Input', () => {
    const adminUser = {
      id: 'U001',
      name: 'Admin QA (DCC)',
      primary_department: 'QA',
      affiliated_departments: ['QA'],
      department: 'QA',
      depts: ['QA'],
      role: 'DCC_ADMIN',
      isDcc: true,
      approval_level: 8,
      level: 8
    };

    beforeEach(() => {
      setTestUser(adminUser);
    });

    it('displays affiliated departments and primary department ⭐ badge in user table', () => {
      // Add a multi-department user
      useStore.getState().addMasterUser({
        id: 'u-multi-1',
        empId: 'EMP-9901',
        name: 'Somchai CrossDept',
        primary_department: 'PD',
        affiliated_departments: ['PD', 'QA', 'EN'],
        role: 'SECTION_HEAD',
        approval_level: 5,
        status: 'ACTIVE'
      });

      renderWithRouter(<MasterDataHub />);

      expect(screen.getByText('Somchai CrossDept')).toBeInTheDocument();
      // Should show affiliated department badges with primary indicator within this user row
      const userRow = screen.getByText('Somchai CrossDept').closest('tr');
      const primaryBadge = within(userRow).getByTitle('แผนกหลัก (Primary Department)');
      expect(primaryBadge).toHaveTextContent('⭐');
      expect(primaryBadge).toHaveTextContent('PD');
      expect(within(userRow).getByText('QA')).toBeInTheDocument();
      expect(within(userRow).getByText('EN')).toBeInTheDocument();
    });

    it('supports adding, changing primary, and removing affiliated departments in User Modal', () => {
      renderWithRouter(<MasterDataHub />);

      // Open "เพิ่มผู้ใช้งานใหม่" modal
      const addUserBtn = screen.getByRole('button', { name: /เพิ่มผู้ใช้งานใหม่/i });
      fireEvent.click(addUserBtn);

      // Verify modal is open
      expect(screen.getByRole('heading', { level: 3, name: 'เพิ่มผู้ใช้งานใหม่' })).toBeInTheDocument();

      // Enter user details
      const nameInput = screen.getByPlaceholderText(/เช่น สมชาย สายผลิต/i);
      fireEvent.change(nameInput, { target: { value: 'Somsak DualDept' } });

      const empIdInput = screen.getByPlaceholderText(/เช่น EMP-015/i);
      fireEvent.change(empIdInput, { target: { value: 'EMP-DUAL-01' } });

      // Check current default department tag
      expect(screen.getByText('⭐ แผนกหลัก')).toBeInTheDocument();

      // Add another department 'WH' via dropdown
      const addDeptSelect = screen.getByLabelText(/เพิ่มแผนกที่สังกัดร่วม/i);
      fireEvent.change(addDeptSelect, { target: { value: 'WH' } });

      // Now both QA and WH should be displayed in the tag list
      const whSpan = screen.getByText(/WH -/i, { selector: 'span' });
      expect(whSpan).toBeInTheDocument();

      // Switch WH to be the primary department
      const setPrimaryBtn = screen.getByRole('button', { name: /ตั้งเป็นหลัก/i });
      fireEvent.click(setPrimaryBtn);

      // Verify WH is now the primary department
      const whTag = whSpan.closest('div');
      expect(within(whTag).getByText('⭐ แผนกหลัก')).toBeInTheDocument();

      // Change Approval Level to Level 6 (Department Manager)
      const levelSelect = screen.getByLabelText(/ระดับอำนาจอนุมัติ/i);
      fireEvent.change(levelSelect, { target: { value: '6' } });

      // Save user
      const saveBtn = screen.getByRole('button', { name: /บันทึกข้อมูล/i });
      fireEvent.click(saveBtn);

      // Verify user in store
      const addedUser = useStore.getState().masterUsers.find(u => u.empId === 'EMP-DUAL-01');
      expect(addedUser).toBeDefined();
      expect(addedUser.primary_department).toBe('WH');
      expect(addedUser.affiliated_departments).toContain('WH');
      expect(addedUser.affiliated_departments).toContain('QA');
      expect(addedUser.approval_level).toBe(6);
    });

    it('shows wildcard notice when DCC_ADMIN or QMR role is selected', () => {
      renderWithRouter(<MasterDataHub />);

      const addUserBtn = screen.getByRole('button', { name: /เพิ่มผู้ใช้งานใหม่/i });
      fireEvent.click(addUserBtn);

      const roleSelect = screen.getByLabelText(/บทบาทสิทธิ์/i);
      fireEvent.change(roleSelect, { target: { value: 'QMR' } });

      // Notice should appear indicating wildcard bypass
      expect(screen.getByText(/Wildcard Access:/i)).toBeInTheDocument();
    });
  });

  describe('2. Task Queue: Cross-Department Routing & Approval Level Filtering', () => {
    const multiDeptLead = {
      id: 'u-lead-multi',
      name: 'Anan MultiDept Lead',
      primary_department: 'PD',
      affiliated_departments: ['PD', 'QA'],
      department: 'PD',
      depts: ['PD', 'QA'],
      role: 'DEPT_MANAGER',
      approval_level: 5,
      level: 5,
      isDcc: false
    };

    beforeEach(() => {
      setTestUser(multiDeptLead);

      useStore.setState({
        tasks: [
          // 1. Task for PD (Pooled Receipt)
          {
            id: 'task-receipt-pd',
            type: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
            title: 'ตรวจรับ SOP-PD-001',
            target_department: 'PD',
            status: 'PENDING',
            doc_code: 'SOP-PD-001',
            copy_no: '01'
          },
          // 2. Task for QA (Pooled Receipt)
          {
            id: 'task-receipt-qa',
            type: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
            title: 'ตรวจรับ SOP-QA-001',
            target_department: 'QA',
            status: 'PENDING',
            doc_code: 'SOP-QA-001',
            copy_no: '02'
          },
          // 3. Task for EN (Engineering - should NOT be visible)
          {
            id: 'task-receipt-en',
            type: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
            title: 'ตรวจรับ SOP-EN-001',
            target_department: 'EN',
            status: 'PENDING',
            doc_code: 'SOP-EN-001',
            copy_no: '03'
          },
          // 4. Approval Task for PD with Required Level 5 (Matches Level 5 -> Visible)
          {
            id: 'task-approve-level5',
            type: 'APPROVE',
            title: 'อนุมัติ WI-PD-002',
            target_department: 'PD',
            required_approval_level: 5,
            status: 'PENDING',
            doc_code: 'WI-PD-002'
          },
          // 5. Approval Task for QA with Required Level 7 (Requires Level 7, user is 5 -> Hidden)
          {
            id: 'task-approve-level7',
            type: 'APPROVE',
            title: 'อนุมัติ POL-QA-001',
            target_department: 'QA',
            required_approval_level: 7,
            status: 'PENDING',
            doc_code: 'POL-QA-001'
          }
        ]
      });
    });

    it('routes tasks across all affiliated departments (PD and QA) while hiding non-affiliated (EN)', () => {
      renderWithRouter(<TaskInbox />);

      // Default filter is "ทุกแผนกที่สังกัด" (all affiliated departments)
      expect(screen.getByRole('button', { name: /ทุกแผนกที่สังกัด/i })).toBeInTheDocument();

      // Should see PD and QA tasks
      expect(screen.getByText(/ตรวจรับ SOP-PD-001/i)).toBeInTheDocument();
      expect(screen.getByText(/ตรวจรับ SOP-QA-001/i)).toBeInTheDocument();

      // Should NOT see EN task
      expect(screen.queryByText(/ตรวจรับ SOP-EN-001/i)).not.toBeInTheDocument();
    });

    it('filters approval tasks by approval level hierarchy (Level 5 visible, Level 7 hidden)', () => {
      renderWithRouter(<TaskInbox />);

      // Level 5 approval matches user's level (5 >= 5)
      expect(screen.getByText(/อนุมัติ WI-PD-002/i)).toBeInTheDocument();

      // Level 7 approval exceeds user's level (5 < 7)
      expect(screen.queryByText(/อนุมัติ POL-QA-001/i)).not.toBeInTheDocument();
    });

    it('filters tasks via the Department Filter Pill Bar', () => {
      renderWithRouter(<TaskInbox />);

      // Initially on all affiliated departments (PD + QA)
      expect(screen.getByText(/ตรวจรับ SOP-PD-001/i)).toBeInTheDocument();
      expect(screen.getByText(/ตรวจรับ SOP-QA-001/i)).toBeInTheDocument();

      // Click "เฉพาะงาน QA"
      const qaPill = screen.getByRole('button', { name: /เฉพาะงาน QA/i });
      fireEvent.click(qaPill);

      // Only QA tasks should remain
      expect(screen.getByText(/ตรวจรับ SOP-QA-001/i)).toBeInTheDocument();
      expect(screen.queryByText(/ตรวจรับ SOP-PD-001/i)).not.toBeInTheDocument();

      // Click "เฉพาะงาน PD"
      const pdPill = screen.getByRole('button', { name: /เฉพาะงาน PD/i });
      fireEvent.click(pdPill);

      expect(screen.getByText(/ตรวจรับ SOP-PD-001/i)).toBeInTheDocument();
      expect(screen.queryByText(/ตรวจรับ SOP-QA-001/i)).not.toBeInTheDocument();

      // Click to "ทุกแผนกที่สังกัด"
      const allDeptsPill = screen.getByRole('button', { name: /ทุกแผนกที่สังกัด/i });
      fireEvent.click(allDeptsPill);

      expect(screen.getByText(/ตรวจรับ SOP-PD-001/i)).toBeInTheDocument();
      expect(screen.getByText(/ตรวจรับ SOP-QA-001/i)).toBeInTheDocument();
    });

    it('allows other department members (e.g. Kalyanee in PD) to see and count receipt tasks even if task has another individual assigneeId', () => {
      // User is Kalyanee (U003) in PD
      const kalyanee = {
        id: 'U003',
        empId: 'EMP-003',
        name: 'กัลยาณี พลไกร',
        primary_department: 'PD',
        affiliated_departments: ['PD', 'QA'],
        department: 'PD',
        depts: ['PD', 'QA'],
        role: 'DEPT_ADMIN',
        approval_level: 5,
        level: 5,
        isDcc: false
      };
      setTestUser(kalyanee);

      // Task has assigneeId set to U002 (Thanawut) in department PD
      useStore.setState({
        tasks: [
          {
            id: 'task-receipt-pd-assigned-to-thanawut',
            type: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
            title: 'ตรวจรับเล่มสำเนา SOP-PD-999',
            target_department: 'PD',
            assigneeId: 'U002',
            assignee_id: 'U002',
            assigneeName: 'ธนาวุฒิ สมควรกิจดำรง',
            status: 'PENDING',
            doc_code: 'SOP-PD-999',
            copy_no: '01'
          }
        ]
      });

      renderWithRouter(<TaskInbox />);

      // Kalyanee MUST see the task and Receipt tab count must be 1 (NOT 0)
      expect(screen.getByText(/ตรวจรับเล่มสำเนา SOP-PD-999/i)).toBeInTheDocument();
      
      const receiptTab = screen.getByRole('button', { name: /ตรวจรับเล่ม/i });
      expect(within(receiptTab).getByText('1')).toBeInTheDocument();
    });
  });

  describe('3. Wildcard Bypass for DCC Admin & QMR', () => {
    it('allows DCC_ADMIN to access DCC operational tasks but strictly blocks other department receipt tasks', () => {
      const dccAdmin = {
        id: 'u-dcc-wildcard',
        name: 'DCC Officer Wildcard',
        primary_department: 'DCC',
        affiliated_departments: ['DCC'],
        department: 'DCC',
        depts: ['DCC'],
        role: 'DCC_ADMIN',
        isDcc: true,
        approval_level: 2,
        level: 2
      };

      setTestUser(dccAdmin);

      useStore.setState({
        tasks: [
          {
            id: 'task-en-dept',
            type: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
            title: 'ตรวจรับ SOP-EN-999',
            target_department: 'EN',
            status: 'PENDING'
          },
          {
            id: 'task-dcc-dist',
            type: 'DISTRIBUTION',
            title: 'แจกจ่าย SOP-DC-999',
            target_department: 'DCC',
            status: 'PENDING'
          },
          {
            id: 'task-wh-dept',
            type: 'REVIEW',
            title: 'ทบทวน SOP-WH-999',
            target_department: 'WH',
            required_approval_level: 6,
            status: 'PENDING'
          }
        ]
      });

      renderWithRouter(<TaskInbox />);

      // DCC Admin strictly CANNOT see other department receipt tasks (ISO 9001 Segregation of Duties)
      expect(screen.queryByText(/ตรวจรับ SOP-EN-999/i)).not.toBeInTheDocument();
      // DCC Admin MUST see DCC operational tasks
      expect(screen.getByText(/แจกจ่าย SOP-DC-999/i)).toBeInTheDocument();
      expect(screen.queryByText(/ทบทวน SOP-WH-999/i)).not.toBeInTheDocument();
    });

    it('allows QMR to see workflow approval tasks across all departments but strictly blocks station receipt tasks', () => {
      const qmrUser = {
        id: 'u-qmr-wildcard',
        name: 'QMR Officer',
        primary_department: 'MANAGEMENT',
        affiliated_departments: ['MANAGEMENT'],
        department: 'MANAGEMENT',
        depts: ['MANAGEMENT'],
        role: 'QMR',
        isQmr: true,
        approval_level: 7,
        level: 7
      };

      setTestUser(qmrUser);

      useStore.setState({
        tasks: [
          {
            id: 'task-qa-receipt',
            type: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
            title: 'ตรวจรับ WI-QA-888',
            target_department: 'QA',
            status: 'PENDING'
          },
          {
            id: 'task-pd-approve',
            type: 'APPROVE',
            title: 'อนุมัติ WI-PD-888',
            target_department: 'PD',
            required_approval_level: 6,
            status: 'PENDING'
          }
        ]
      });

      renderWithRouter(<TaskInbox />);

      // Switch to "งานทั้งหมดทุกแผนก" / "ทุกแผนกที่สังกัด" to view cross-department tasks
      const allDeptsPill = screen.getByRole('button', { name: /งานทั้งหมดทุกแผนก|ทุกแผนกที่สังกัด/i });
      fireEvent.click(allDeptsPill);

      // Physical receipt is strictly segregated to recipient department staff
      expect(screen.queryByText(/ตรวจรับ WI-QA-888/i)).not.toBeInTheDocument();
      // Cross-department approval is accessible to QMR
      expect(screen.getByText(/อนุมัติ WI-PD-888/i)).toBeInTheDocument();
    });
  });

  describe('4. Physical Copy Receipt Audit Trail with Multi-Department Context', () => {
    it('records actor_primary_department, task_department, and actor_user_id on receipt', () => {
      const crossDeptUser = {
        id: 'u-cross-actor',
        empId: 'EMP-777',
        name: 'Prasert CrossDept',
        primary_department: 'QA',
        affiliated_departments: ['QA', 'PD'],
        department: 'QA',
        depts: ['QA', 'PD'],
        role: 'SECTION_HEAD',
        approval_level: 5
      };

      setTestUser(crossDeptUser);

      useStore.setState({
        tasks: [
          {
            id: 'task-rcpt-100',
            copy_id: 'copy-100',
            copyId: 'copy-100',
            type: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
            target_department: 'PD',
            doc_code: 'SOP-PD-100',
            copy_no: '01',
            status: 'PENDING'
          }
        ],
        controlledCopyInstances: [
          {
            id: 'copy-100',
            doc_code: 'SOP-PD-100',
            copy_no: '01',
            status: 'DISPATCHED_PENDING_RECEIPT',
            holder_dept: 'PD',
            location: 'Mixing Station 1'
          }
        ],
        physicalCopyAuditLogs: []
      });

      // Execute receipt directly via store
      useStore.getState().confirmHardcopyReceipt('copy-100', 'task-rcpt-100', {
        document_id: 'SOP-PD-100',
        copy_id: 'copy-100',
        receiver_user_id: crossDeptUser.id,
        actor_name: crossDeptUser.name,
        actor_primary_department: crossDeptUser.primary_department,
        task_department: 'PD',
        remarks: 'Confirmed and verified in Mixing Station'
      });

      const auditLogs = useStore.getState().physicalCopyAuditLogs;
      expect(auditLogs).toHaveLength(1);

      const log = auditLogs[0];
      expect(log.action).toBe('PHYSICAL_COPY_RECEIVED');
      expect(log.actor_user_id).toBe('u-cross-actor');
      expect(log.actor_primary_department).toBe('QA');
      expect(log.task_department).toBe('PD');
      expect(log.copy_id).toBe('copy-100');
      expect(log.timestamp).toBeDefined();

      // Task should be dismissed from pending tasks queue and copy status updated to ISSUED_ACTIVE
      const task = useStore.getState().tasks.find(t => t.id === 'task-rcpt-100');
      expect(task).toBeUndefined();

      const copy = useStore.getState().controlledCopyInstances.find(c => c.id === 'copy-100');
      expect(copy.status).toBe('ISSUED_ACTIVE');
      expect(copy.receipt_confirmed_at).toBeDefined();
      expect(copy.receipt_confirmed_by).toBe(crossDeptUser.name);
    });
  });
});
