import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import TaskInbox from '../pages/Tasks/TaskInbox';
import { filterTasksForUser, isActionableTask, isReceiptTask } from '../utils/taskFilter';

const renderWithRouter = (ui) => {
  return render(
    <BrowserRouter>
      {ui}
    </BrowserRouter>
  );
};

describe('Strict Department Segregation for RECEIPT Tasks in TaskInbox & TaskFilter', () => {
  // User 1: Thanawut (DC Department, DCC Admin L4)
  const thanawutDcc = {
    id: 'EMP-001',
    empId: 'EMP-001',
    name: 'ธนาวุฒิ สมควรกิจดำรง',
    role: 'DCC_ADMIN',
    isDcc: true,
    department: 'DC',
    dept: 'DC',
    primary_department: 'DC',
    affiliated_departments: ['DC'],
    depts: ['DC'],
    level: 4,
    approval_level: 4
  };

  // User 2: Beam (QC Department, Dept Controller L4)
  const beamQc = {
    id: 'U005',
    empId: 'EMP-005',
    name: 'สิริพร วงศ์สวัสดิ์ (Beam)',
    role: 'DEPT_ADMIN',
    isDcc: false,
    department: 'QC',
    dept: 'QC',
    primary_department: 'QC',
    affiliated_departments: ['QC'],
    depts: ['QC'],
    level: 4,
    approval_level: 4
  };

  // User 3: Somchai (PD Department, Staff L2)
  const somchaiPd = {
    id: 'U-PD-001',
    empId: 'EMP-PD-001',
    name: 'สมชาย สายผลิต',
    role: 'GENERAL_USER',
    isDcc: false,
    department: 'PD',
    dept: 'PD',
    primary_department: 'PD',
    affiliated_departments: ['PD'],
    depts: ['PD'],
    level: 2,
    approval_level: 2
  };

  const sampleTasks = [
    // 1. QC Department Receipt Task
    {
      id: 'task-receipt-qc-01',
      title: 'ตรวจรับเอกสารควบคุมฉบับพิมพ์: คู่มือการสุ่มตัวอย่างและตรวจวิเคราะห์ (SOP-QC-01) (Copy 01)',
      type: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
      taskType: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
      task_type: 'CONFIRM_RECEIPT',
      category: 'RECEIPT',
      docCode: 'SOP-QC-01',
      doc_code: 'SOP-QC-01',
      docTitle: 'คู่มือการสุ่มตัวอย่างและตรวจวิเคราะห์',
      docName: 'คู่มือการสุ่มตัวอย่างและตรวจวิเคราะห์',
      copy_no: '01',
      department: 'QC',
      target_department: 'QC',
      recipientDepartment: 'QC',
      destinationDept: 'QC',
      status: 'PENDING',
      isDepartmentPool: true
    },
    // 2. PD Department Receipt Task
    {
      id: 'task-receipt-pd-01',
      title: 'ตรวจรับเอกสารควบคุมฉบับพิมพ์: คู่มือการผลิต (SOP-PD-01) (Copy 01)',
      type: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
      taskType: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
      task_type: 'CONFIRM_RECEIPT',
      category: 'RECEIPT',
      docCode: 'SOP-PD-01',
      doc_code: 'SOP-PD-01',
      docTitle: 'คู่มือการผลิต',
      docName: 'คู่มือการผลิต',
      copy_no: '01',
      department: 'PD',
      target_department: 'PD',
      recipientDepartment: 'PD',
      destinationDept: 'PD',
      status: 'PENDING',
      isDepartmentPool: true
    },
    // 3. DCC Exclusive Distribution Task
    {
      id: 'task-dist-01',
      title: 'แจกจ่ายเอกสาร Controlled Copy SOP-DC-01',
      type: 'DISTRIBUTION',
      taskType: 'DISTRIBUTION',
      category: 'DCC_DISTRIBUTE',
      docCode: 'SOP-DC-01',
      doc_code: 'SOP-DC-01',
      docId: 'DOC-DC-01',
      department: 'DC',
      assignedToRole: 'DCC_ADMIN',
      status: 'PENDING',
      actionRequired: true,
      origin: 'INTERNAL'
    },
    // 4. DCC Exclusive Recall Task
    {
      id: 'task-recall-01',
      title: 'เรียกคืนสำเนาตกรุ่น SOP-PD-00 Rev.00',
      type: 'RECALL',
      taskType: 'RECALL',
      category: 'DCC_RECALL',
      docCode: 'SOP-PD-00',
      doc_code: 'SOP-PD-00',
      docId: 'DOC-PD-00',
      department: 'DC',
      assignedToRole: 'DCC_ADMIN',
      status: 'PENDING',
      actionRequired: true,
      origin: 'INTERNAL'
    }
  ];

  const sampleCopies = [
    {
      id: 'inst-dc-01',
      doc_id: 'DOC-DC-01',
      docId: 'DOC-DC-01',
      doc_code: 'SOP-DC-01',
      docTitle: 'SOP-DC-01',
      rev: '01',
      copy_no: '01',
      status: 'PENDING_ISSUE',
      target_department: 'DC',
      department: 'DC'
    },
    {
      id: 'inst-pd-00',
      doc_id: 'DOC-PD-00',
      docId: 'DOC-PD-00',
      doc_code: 'SOP-PD-00',
      docTitle: 'SOP-PD-00',
      rev: '00',
      copy_no: '01',
      status: 'SUPERSEDED_PENDING_RECALL',
      target_department: 'PD',
      department: 'PD'
    }
  ];

  beforeEach(() => {
    useStore.setState({
      currentUser: thanawutDcc,
      tasks: sampleTasks,
      controlledCopyInstances: sampleCopies,
      documentControlledCopies: sampleCopies,
      dars: [],
      documents: [
        { id: 'DOC-QC-01', code: 'SOP-QC-01', title: 'SOP-QC-01', name: 'คู่มือการสุ่มตัวอย่างและตรวจวิเคราะห์', department: 'QC', status: 'EFFECTIVE' },
        { id: 'DOC-PD-01', code: 'SOP-PD-01', title: 'SOP-PD-01', name: 'คู่มือการผลิต', department: 'PD', status: 'EFFECTIVE' },
        { id: 'DOC-PD-00', code: 'SOP-PD-00', title: 'SOP-PD-00', name: 'คู่มือการผลิต (ฉบับเดิม)', department: 'PD', status: 'OBSOLETE' },
        { id: 'DOC-DC-01', code: 'SOP-DC-01', title: 'SOP-DC-01', name: 'คู่มือการควบคุมเอกสาร', department: 'DC', status: 'EFFECTIVE' }
      ],
      masterUsers: [thanawutDcc, beamQc, somchaiPd]
    });
  });

  describe('1. TaskFilter Unit Logic: Strict Segregation & filterTasksForUser', () => {
    it('isReceiptTask identifies all variants of receipt tasks', () => {
      expect(isReceiptTask(sampleTasks[0])).toBe(true);
      expect(isReceiptTask(sampleTasks[1])).toBe(true);
      expect(isReceiptTask(sampleTasks[2])).toBe(false);
      expect(isReceiptTask(sampleTasks[3])).toBe(false);
    });

    it('isActionableTask denies QC and PD receipt tasks for DCC Admin Thanawut (DC)', () => {
      // Thanawut is DCC Admin, but belongs to DC department
      // QC and PD receipt tasks MUST NOT be actionable for him
      expect(isActionableTask(sampleTasks[0], thanawutDcc)).toBe(false);
      expect(isActionableTask(sampleTasks[1], thanawutDcc)).toBe(false);

      // But DCC tasks are actionable
      expect(isActionableTask(sampleTasks[2], thanawutDcc)).toBe(true);
      expect(isActionableTask(sampleTasks[3], thanawutDcc)).toBe(true);
    });

    it('isActionableTask allows QC receipt task only for QC user Beam', () => {
      expect(isActionableTask(sampleTasks[0], beamQc)).toBe(true);
      expect(isActionableTask(sampleTasks[1], beamQc)).toBe(false); // PD receipt denied
      expect(isActionableTask(sampleTasks[2], beamQc)).toBe(false); // DCC task denied
    });

    it('filterTasksForUser returns strictly segregated tasks per user role and department', () => {
      const dccFiltered = filterTasksForUser(sampleTasks, thanawutDcc);
      // DCC Admin receives Distribute, Recall, but NO Receipt tasks from QC or PD
      expect(dccFiltered.some(t => t.id === 'task-receipt-qc-01')).toBe(false);
      expect(dccFiltered.some(t => t.id === 'task-receipt-pd-01')).toBe(false);
      expect(dccFiltered.some(t => t.id === 'task-dist-01')).toBe(true);
      expect(dccFiltered.some(t => t.id === 'task-recall-01')).toBe(true);

      const qcFiltered = filterTasksForUser(sampleTasks, beamQc);
      // QC user receives QC Receipt task, but NO PD Receipt or DCC tasks
      expect(qcFiltered.some(t => t.id === 'task-receipt-qc-01')).toBe(true);
      expect(qcFiltered.some(t => t.id === 'task-receipt-pd-01')).toBe(false);
      expect(qcFiltered.some(t => t.id === 'task-dist-01')).toBe(false);
    });
  });

  describe('2. TaskInbox Component: Criteria 1 & 2 Verification', () => {
    beforeEach(() => {
      useStore.setState({
        currentUser: thanawutDcc,
        tasks: sampleTasks,
        dars: [],
        documents: [
          { id: 'DOC-QC-01', code: 'SOP-QC-01', title: 'SOP-QC-01', name: 'คู่มือการสุ่มตัวอย่างและตรวจวิเคราะห์', department: 'QC', status: 'EFFECTIVE' },
          { id: 'DOC-PD-01', code: 'SOP-PD-01', title: 'SOP-PD-01', name: 'คู่มือการผลิต', department: 'PD', status: 'EFFECTIVE' }
        ],
        masterUsers: [thanawutDcc, beamQc, somchaiPd]
      });
    });

    it('Criteria 1: When logged in as Thanawut (DC, DCC L4), SOP-QC-01 receipt task is NOT visible in TaskInbox', () => {
      useStore.setState({ currentUser: thanawutDcc });

      renderWithRouter(<TaskInbox />);

      // ❌ MUST NOT see QC Receipt task
      expect(screen.queryByText(/คู่มือการสุ่มตัวอย่างและตรวจวิเคราะห์/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/SOP-QC-01/i)).not.toBeInTheDocument();

      // ❌ MUST NOT see PD Receipt task or any receipt confirmation tasks
      expect(screen.queryByText(/SOP-PD-01/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/ตรวจรับเอกสารควบคุมฉบับพิมพ์/i)).not.toBeInTheDocument();
      expect(screen.queryByText('Copy 01')).not.toBeInTheDocument();

      // ✅ MUST see DCC Distribution and Recall tasks
      expect(screen.getByText(/แจกจ่ายเอกสาร Controlled Copy/i)).toBeInTheDocument();
      expect(screen.getByText(/เรียกคืนสำเนาตกรุ่น/i)).toBeInTheDocument();
    });

    it('Criteria 1.1: When DCC Admin switches to "ตรวจรับเล่ม" tab, displays Empty State (No DC tasks) and does NOT leak QC tasks', () => {
      useStore.setState({ currentUser: thanawutDcc });

      renderWithRouter(<TaskInbox />);

      // Click "ตรวจรับเล่ม" tab
      const receiptTab = screen.getByRole('button', { name: /ตรวจรับเล่ม/i });
      fireEvent.click(receiptTab);

      // ❌ MUST NOT display SOP-QC-01
      expect(screen.queryByText(/SOP-QC-01/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/คู่มือการสุ่มตัวอย่างและตรวจวิเคราะห์/i)).not.toBeInTheDocument();

      // ✅ Empty state is rendered because DC has no pending receipt tasks
      expect(screen.getByText('ไม่มีงานค้างในกล่องข้อความ')).toBeInTheDocument();
      expect(screen.getByText('คุณจัดการงานทั้งหมดเรียบร้อยแล้ว')).toBeInTheDocument();
    });

    it('Criteria 2: When logged in as QC user Beam, SOP-QC-01 Copy 01 appears in TaskInbox', () => {
      useStore.setState({ currentUser: beamQc });

      renderWithRouter(<TaskInbox />);

      // ✅ MUST see QC Receipt task
      expect(screen.getByText(/คู่มือการสุ่มตัวอย่างและตรวจวิเคราะห์/i)).toBeInTheDocument();
      expect(screen.getByText(/SOP-QC-01/i)).toBeInTheDocument();
      expect(screen.getByText('Copy 01')).toBeInTheDocument();

      // ❌ MUST NOT see PD Receipt task or DCC tasks
      expect(screen.queryByText(/คู่มือการผลิต/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/แจกจ่ายเอกสาร Controlled Copy/i)).not.toBeInTheDocument();
    });

    it('Department Pill Bar does NOT include other departments receipt tasks in badge count', () => {
      useStore.setState({ currentUser: thanawutDcc });

      renderWithRouter(<TaskInbox />);

      // Total count for DCC Admin should reflect only the 2 actionable DCC tasks (Distribute, Recall)
      // and NOT include the 2 receipt tasks of QC and PD (total 2, not 4)
      const allDeptsPill = screen.getByRole('button', { name: /งานทั้งหมดทุกแผนก/i });
      expect(allDeptsPill.textContent).toContain('2');
      expect(allDeptsPill.textContent).not.toContain('4');
    });
  });
});
