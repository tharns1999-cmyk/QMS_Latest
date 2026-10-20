import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore, { resolveReceiptTaskDepartment, createReceiptTask } from '../../../store/useStore';
import TaskInbox, { formatDepartmentBadge } from '../pages/Tasks/TaskInbox';
import { normalizeCanonicalDept, isSameDepartment } from '../utils/taskFilter';
import { normalizeDepartmentId, DEPARTMENT_METADATA } from '../services/MasterDataService';

describe('Task Inbox & Generation: QC Canonicalization Suite', () => {
  beforeEach(() => {
    useStore.setState({
      currentUser: {
        id: 'EMP-005',
        name: 'บีม',
        role: 'SUPERVISOR',
        primary_department: 'QC',
        department: 'QC',
        affiliated_departments: ['QC', 'QA/QC'],
        level: 3
      },
      masterDepartments: [
        { id: 'PD', code: 'PD', nameTh: 'ฝ่ายผลิต', nameEn: 'Production' },
        { id: 'QC', code: 'QC', nameTh: 'ฝ่ายประกันและควบคุมคุณภาพ', nameEn: 'Quality Assurance & Control' },
        { id: 'WH', code: 'WH', nameTh: 'ฝ่ายคลังสินค้า', nameEn: 'Warehouse' }
      ],
      tasks: [
        {
          id: 'task-qc-01',
          type: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
          taskType: 'DEPT_CONFIRM_HARDCOPY_RECEIPT',
          title: 'ตรวจรับเอกสารควบคุมฉบับพิมพ์: วิธีการปฏิบัติงานควบคุมคุณภาพ (WI-QC-01)',
          docCode: 'WI-QC-01',
          doc_code: 'WI-QC-01',
          docTitle: 'วิธีการปฏิบัติงานควบคุมคุณภาพ',
          department: 'QA/QC', // Raw legacy dept that should be canonicalized to QC
          destinationDept: 'QA/QC',
          status: 'PENDING',
          actionRequired: true,
          copy_no: '01',
          location: 'QC Lab'
        }
      ],
      dars: [],
      documents: [],
      externalDocuments: [],
      controlledCopyInstances: []
    });
  });

  it('1. Department Normalization: MasterDataService and taskFilter canonicalize QA/QC to QC', () => {
    expect(normalizeDepartmentId('QA/QC')).toBe('QC');
    expect(normalizeDepartmentId('QA')).toBe('QC');
    expect(normalizeDepartmentId('QC')).toBe('QC');
    expect(normalizeDepartmentId('QAQC')).toBe('QC');

    expect(normalizeCanonicalDept('QA/QC')).toBe('QC');
    expect(normalizeCanonicalDept('QA/QC - ฝ่ายประกันและควบคุมคุณภาพ')).toBe('QC');
    expect(normalizeCanonicalDept('QC - ฝ่ายประกันและควบคุมคุณภาพ')).toBe('QC');
    expect(isSameDepartment('QA/QC', 'QC')).toBe(true);
    expect(isSameDepartment('QC', 'QA/QC - ฝ่ายประกันและควบคุมคุณภาพ')).toBe(true);

    const qcMeta = DEPARTMENT_METADATA.find(d => d.id === 'QC');
    expect(qcMeta).toBeDefined();
    expect(qcMeta.shortName).toBe('QC');
  });

  it('2. Task Generation: createReceiptTask and resolveReceiptTaskDepartment strictly set QC and departmentName', () => {
    const copy = {
      id: 'CC-QC-01',
      doc_code: 'WI-QC-01',
      title: 'WI-QC-01',
      department: 'QA/QC',
      location: 'QC Lab',
      copy_no: '01'
    };
    const dept = resolveReceiptTaskDepartment(copy, copy);
    expect(dept).toBe('QC');

    const generatedTask = createReceiptTask(copy);
    expect(generatedTask.department).toBe('QC');
    expect(generatedTask.departmentName).toBe('ฝ่ายประกันและควบคุมคุณภาพ');
  });

  it('3. formatDepartmentBadge: always renders "QC - ฝ่ายประกันและควบคุมคุณภาพ" regardless of raw deptCode', () => {
    const masterDepts = useStore.getState().masterDepartments;
    expect(formatDepartmentBadge('QC', masterDepts)).toBe('QC - ฝ่ายประกันและควบคุมคุณภาพ');
    expect(formatDepartmentBadge('QA/QC', masterDepts)).toBe('QC - ฝ่ายประกันและควบคุมคุณภาพ');
    expect(formatDepartmentBadge('QA', masterDepts)).toBe('QC - ฝ่ายประกันและควบคุมคุณภาพ');
    expect(formatDepartmentBadge('QA/QC - ฝ่ายประกันและควบคุมคุณภาพ', masterDepts)).toBe('QC - ฝ่ายประกันและควบคุมคุณภาพ');
  });

  it('4. TaskInbox UI: Department filter pills show ONLY "QC" and NO "QA/QC" pill, with matching counts', () => {
    render(
      <MemoryRouter>
        <TaskInbox />
      </MemoryRouter>
    );

    // Pill for all departments in affiliation
    const allPill = screen.getByRole('button', { name: /ทุกแผนกที่สังกัด \(1\)/i });
    expect(allPill).toBeInTheDocument();

    // Exactly one QC filter pill exists
    const qcPill = screen.getByRole('button', { name: /QC.*1/i });
    expect(qcPill).toBeInTheDocument();

    // QA/QC filter button must NOT exist
    const qaqcPill = screen.queryByRole('button', { name: /QA\/QC/i });
    expect(qaqcPill).not.toBeInTheDocument();

    // Task Card: WI-QC-01 displays department badge as "QC - ฝ่ายประกันและควบคุมคุณภาพ"
    expect(screen.getByText('QC - ฝ่ายประกันและควบคุมคุณภาพ')).toBeInTheDocument();
    expect(screen.queryByText('QA/QC - ฝ่ายประกันและควบคุมคุณภาพ')).not.toBeInTheDocument();
  });
});
