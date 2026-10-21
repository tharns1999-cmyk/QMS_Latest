import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import useStore from '../../../store/useStore';
import TaskApprove from '../pages/Tasks/TaskApprove';
import Library from '../pages/Library/Library';
import MasterDocsList, { isMyDepartment } from '../pages/MasterDocs/MasterDocsList';
import { transformDarToMasterDocument, standardizeDepartmentCode } from '../services/darService';

describe('Master Architectural Blueprint: Materialize Approved DAR to Master Document Library with Standardized Department Code (QC)', () => {
  beforeEach(() => {
    useStore.setState({
      currentUser: {
        id: 'U005',
        name: 'บีม',
        department: 'QC',
        role: 'DEPT_ADMIN',
        position: 'QAQC Supervisor'
      },
      tasks: [
        {
          id: 'task-app-dar-001',
          taskId: 'task-app-dar-001',
          darId: 'DAR-2026-001',
          type: 'Approve',
          title: 'อนุมัติเอกสาร SOP-QC-01',
          status: 'PENDING',
          assigneeId: 'U005'
        }
      ],
      completedTasks: [],
      dars: [
        {
          id: 'DAR-2026-001',
          darNo: 'DAR-2026-001',
          darNumber: 'DAR-2026-001',
          docNo: 'SOP-QC-01',
          docIdInput: 'SOP-QC-01',
          title: 'ระเบียบปฏิบัติงานการควบคุมคุณภาพ',
          documentName: 'ระเบียบปฏิบัติงานการควบคุมคุณภาพ',
          documentType: 'SOP',
          type: 'NEW',
          department: 'QC',
          departmentName: 'ฝ่ายประกันและควบคุมคุณภาพ',
          edition: '00',
          revision: '00',
          status: 'PENDING_APPROVAL',
          requesterId: 'U-REQ-01',
          effectiveDate: '2026-09-17'
        }
      ],
      documents: [],
      masterDocuments: [],
      timeline: [],
      notifications: [],
      masterDepartments: [
        { id: 'QC', code: 'QC', nameTh: 'ฝ่ายประกันและควบคุมคุณภาพ', nameEn: 'Quality Assurance & Control', headName: 'บีม' },
        { id: 'QA/QC', code: 'QC', nameTh: 'ฝ่ายประกันและควบคุมคุณภาพ', nameEn: 'Quality Assurance & Control', headName: 'บีม' },
        { id: 'PD', code: 'PD', nameTh: 'ฝ่ายผลิต', nameEn: 'Production', headName: 'กัลยาณี' }
      ],
      masterUsers: [
        { id: 'U005', name: 'บีม', department: 'QC', position: 'QAQC Supervisor' }
      ]
    });
  });

  it('1. Standardizes department code to QC and transforms DAR into Master Document', () => {
    expect(standardizeDepartmentCode('QA')).toBe('QA'); // QA is its own department
    expect(standardizeDepartmentCode('QC')).toBe('QC');
    expect(standardizeDepartmentCode('QA/QC')).toBe('QC');
    expect(standardizeDepartmentCode('QAQC')).toBe('QC');
    expect(standardizeDepartmentCode('PD')).toBe('PD');

    const dar = useStore.getState().dars[0];
    const masterDoc = transformDarToMasterDocument(dar);

    expect(masterDoc).toBeDefined();
    expect(masterDoc.docNo).toBe('SOP-QC-01');
    expect(masterDoc.department).toBe('QC');
    expect(masterDoc.departmentName).toBe('ฝ่ายประกันและควบคุมคุณภาพ');
    expect(masterDoc.status).toBe('ACTIVE');
    expect(masterDoc.is_active).toBe(true);
  });

  it('2. When DAR-2026-001 is approved, SOP-QC-01 is auto-materialized into masterDocuments immediately', async () => {
    // Approve task-app-dar-001 via processWorkflow
    await useStore.getState().processWorkflow('task-app-dar-001', 'APPROVE', 'อนุมัติเรียบร้อย');

    const state = useStore.getState();

    // Verify DAR is completed
    const dar = state.dars.find(d => d.id === 'DAR-2026-001');
    expect(dar.status).toBe('COMPLETED');

    // Verify document exists in masterDocuments & documents
    const inMasterDocs = (state.masterDocuments || []).find(d => (d.docNo === 'SOP-QC-01' || d.code === 'SOP-QC-01' || d.title === 'SOP-QC-01'));
    expect(inMasterDocs).toBeDefined();
    expect(inMasterDocs.department).toBe('QC');
    expect(inMasterDocs.departmentName).toBe('ฝ่ายประกันและควบคุมคุณภาพ');
    expect(['ACTIVE', 'EFFECTIVE']).toContain(inMasterDocs.status);

    const inDocs = (state.documents || []).find(d => (d.docNo === 'SOP-QC-01' || d.code === 'SOP-QC-01' || d.title === 'SOP-QC-01'));
    expect(inDocs).toBeDefined();
    expect(inDocs.department).toBe('QC');
  });

  it('3. isMyDepartment correctly matches direct code and formatted user department strings like บีม (QC)', () => {
    expect(isMyDepartment('QC', 'QC')).toBe(true);
    expect(isMyDepartment('QC', 'บีม (QC)')).toBe(true);
    expect(isMyDepartment('QC', 'QA/QC')).toBe(true);
    expect(isMyDepartment('QC', 'QA')).toBe(false); // QA is its own department
    expect(isMyDepartment('QC', 'PD')).toBe(false);
  });

  it('4. MasterDocsList displays 1 item in "มีผลบังคับใช้ (Active)" and 1 item in "ในแผนกฉัน" for Beam (QC)', async () => {
    await useStore.getState().processWorkflow('task-app-dar-001', 'APPROVE', 'อนุมัติเรียบร้อย');

    render(
      <MemoryRouter>
        <MasterDocsList />
      </MemoryRouter>
    );

    // Active tab (default)
    expect(screen.getByText('มีผลบังคับใช้ (Active)')).toBeDefined();
    expect(screen.getAllByText('SOP-QC-01').length).toBeGreaterThanOrEqual(1);

    // Click "ในแผนกฉัน" tab
    const myDeptBtn = screen.getByRole('button', { name: /ในแผนกฉัน/i });
    fireEvent.click(myDeptBtn);

    expect(screen.getAllByText('SOP-QC-01').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('QC').length).toBeGreaterThanOrEqual(1);
  });

  it('5. Library page displays SOP-QC-01 in "มีผลบังคับใช้" and "ในแผนกฉัน" for Beam', async () => {
    await useStore.getState().processWorkflow('task-app-dar-001', 'APPROVE', 'อนุมัติเรียบร้อย');

    render(
      <MemoryRouter initialEntries={['/dcc/library']}>
        <Routes>
          <Route path="/dcc/library" element={<Library />} />
        </Routes>
      </MemoryRouter>
    );

    // Switch to "ในแผนกฉัน" tab
    const myDeptBtn = screen.getByRole('button', { name: /ในแผนกฉัน/i });
    fireEvent.click(myDeptBtn);

    expect(screen.getAllByText(/SOP-QC-01/i).length).toBeGreaterThanOrEqual(1);
  });

  it('6. Approving from TaskApprove UI navigates to /dcc/tasks and materializes master document', async () => {
    render(
      <MemoryRouter initialEntries={['/dcc/tasks/approve/task-app-dar-001']}>
        <Routes>
          <Route path="/dcc/tasks/approve/:id" element={<TaskApprove />} />
          <Route path="/dcc/tasks" element={<div>Task Inbox Screen</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('อนุมัติเอกสาร')).toBeDefined();
    expect(screen.getByText('DAR-2026-001')).toBeDefined();

    // Click Approve button
    const approveBtn = screen.getByRole('button', { name: /อนุมัติ \(Approve\)/i });
    fireEvent.click(approveBtn);

    // In modal, click confirm
    const confirmBtn = screen.getByRole('button', { name: /ยืนยันการอนุมัติ/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText('Task Inbox Screen')).toBeDefined();
    });

    const state = useStore.getState();
    const doc = (state.masterDocuments || []).find(d => d.docNo === 'SOP-QC-01' || d.code === 'SOP-QC-01');
    expect(doc).toBeDefined();
    expect(doc.department).toBe('QC');
  });
});
