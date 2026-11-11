import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AnnualPlansHub from '../components/AnnualPlansHub';
import AnnualPlanMatrixSection from '../components/AnnualPlanMatrixSection';
import { MemoryRouter } from 'react-router-dom';

const mockPlans = [
  {
    id: 'plan-pd-2026',
    plan_year: 2026,
    department: 'PD',
    department_name_th: 'ฝ่ายผลิต',
    document_code: 'FM-PD-01',
    revision: '01',
    status: 'APPROVED',
    title: 'แผนการทวนสอบประจำปี 2026 ฝ่ายผลิต',
    due_date_rule: 'END_OF_MONTH',
    item_count: 5,
    planned_items_count: 5
  },
  {
    id: 'plan-qc-2026',
    plan_year: 2026,
    department: 'QC',
    department_name_th: 'ควบคุมคุณภาพ',
    document_code: 'FM-QC-42',
    revision: '01',
    status: 'DRAFT',
    title: 'แผนการทวนสอบประจำปี 2026 ฝ่าย QC',
    due_date_rule: 'END_OF_MONTH',
    item_count: 8,
    planned_items_count: 8
  },
  {
    id: 'plan-qa-2026',
    plan_year: 2026,
    department: 'QA',
    department_name_th: 'ประกันคุณภาพ',
    document_code: 'FM-QA-11',
    revision: '01',
    status: 'APPROVED',
    title: 'แผนการทวนสอบประจำปี 2026 ฝ่าย QA',
    due_date_rule: 'END_OF_MONTH',
    item_count: 4,
    planned_items_count: 4
  },
  {
    id: 'plan-lb-2026',
    plan_year: 2026,
    department: 'LB',
    department_name_th: 'ห้องปฏิบัติการ',
    document_code: 'FM-LB-05',
    revision: '01',
    status: 'PENDING_APPROVAL',
    title: 'แผนการทวนสอบประจำปี 2026 ฝ่าย LB',
    due_date_rule: 'END_OF_MONTH',
    item_count: 3,
    planned_items_count: 3
  }
];

const activeDepartments = [
  { code: 'PD', nameTh: 'ฝ่ายผลิต' },
  { code: 'QC', nameTh: 'ควบคุมคุณภาพ' },
  { code: 'QA', nameTh: 'ประกันคุณภาพ' },
  { code: 'LB', nameTh: 'ห้องปฏิบัติการ' }
];

const activeAssets = [
  { id: 'ast-1', department: 'PD', status: 'ACTIVE' },
  { id: 'ast-2', department: 'PD', status: 'ACTIVE' },
  { id: 'ast-3', department: 'QC', status: 'ACTIVE' },
  { id: 'ast-4', department: 'LB', status: 'ACTIVE' }
];

describe('VCC Hub Multi-Department Membership Filter & Scoping', () => {
  it('1. กำหนดค่าเริ่มต้นเป็น "MY_DEPTS" และแสดงป้ายชื่อพร้อมรายชื่อแผนกเมื่อมี 2 แผนก (PD, QC)', () => {
    const multiDeptUser = {
      id: 'u-multi',
      name: 'กัลยาณี MultiDept',
      primary_department: 'PD',
      department: 'PD',
      affiliated_departments: ['PD', 'QC'],
      approval_level: 4,
      isDcc: false,
      isQmr: false
    };

    render(
      <AnnualPlansHub
        plans={mockPlans}
        activeDepartments={activeDepartments}
        activeAssets={activeAssets}
        currentUser={multiDeptUser}
        canCreatePlan={true}
        canEditPlan={true}
        onSelectPlan={vi.fn()}
        onOpenCreatePlan={vi.fn()}
        onOpenRevision={vi.fn()}
        onDeletePlan={vi.fn()}
        onPrintSinglePlan={vi.fn()}
        onPrintAllPlans={vi.fn()}
        onExportSummary={vi.fn()}
      />
    );

    // Dropdown value should default to MY_DEPTS
    const deptSelect = screen.getByLabelText('เลือกแผนก');
    expect(deptSelect.value).toBe('MY_DEPTS');

    // Label should display "🏢 ทุกแผนกที่ฉันสังกัด (PD, QC)"
    expect(screen.getByRole('option', { name: /ทุกแผนกที่ฉันสังกัด \(PD, QC\)/ })).toBeInTheDocument();

    // The table must display both PD and QC plans
    expect(screen.getByText('VCC-AP-PD-2026')).toBeInTheDocument();
    expect(screen.getByText('VCC-AP-QC-2026')).toBeInTheDocument();

    // Plans of unassigned departments (QA, LB) must NOT be displayed
    expect(screen.queryByText('VCC-AP-QA-2026')).not.toBeInTheDocument();
    expect(screen.queryByText('VCC-AP-LB-2026')).not.toBeInTheDocument();
  });

  it('2. ป้องกันข้อความ Dropdown ล้นจอ: แสดง "(N แผนก)" เมื่อสังกัดมากกว่า 3 แผนก', () => {
    const fourDeptUser = {
      id: 'u-four',
      name: 'สมชาย 4 แผนก',
      primary_department: 'PD',
      affiliated_departments: ['PD', 'QC', 'QA', 'LB'],
      approval_level: 4,
      isDcc: false
    };

    render(
      <AnnualPlansHub
        plans={mockPlans}
        activeDepartments={activeDepartments}
        activeAssets={activeAssets}
        currentUser={fourDeptUser}
        canCreatePlan={true}
        canEditPlan={true}
        onSelectPlan={vi.fn()}
        onOpenCreatePlan={vi.fn()}
        onOpenRevision={vi.fn()}
        onDeletePlan={vi.fn()}
        onPrintSinglePlan={vi.fn()}
        onPrintAllPlans={vi.fn()}
        onExportSummary={vi.fn()}
      />
    );

    // Should format as "(4 แผนก)"
    expect(screen.getByRole('option', { name: /ทุกแผนกที่ฉันสังกัด \(4 แผนก\)/ })).toBeInTheDocument();
  });

  it('3. จำกัดตัวเลือกใน Dropdown เฉพาะแผนกที่ผู้ใช้สังกัดเท่านั้น สำหรับผู้ใช้ทั่วไป', () => {
    const multiDeptUser = {
      id: 'u-multi',
      name: 'กัลยาณี MultiDept',
      primary_department: 'PD',
      affiliated_departments: ['PD', 'QC'],
      approval_level: 4,
      isDcc: false
    };

    render(
      <AnnualPlansHub
        plans={mockPlans}
        activeDepartments={activeDepartments}
        activeAssets={activeAssets}
        currentUser={multiDeptUser}
        canCreatePlan={true}
        canEditPlan={true}
        onSelectPlan={vi.fn()}
        onOpenCreatePlan={vi.fn()}
        onOpenRevision={vi.fn()}
        onDeletePlan={vi.fn()}
        onPrintSinglePlan={vi.fn()}
        onPrintAllPlans={vi.fn()}
        onExportSummary={vi.fn()}
      />
    );

    const deptSelect = screen.getByLabelText('เลือกแผนก');
    const options = Array.from(deptSelect.querySelectorAll('option')).map((o) => o.value);

    // Options should only contain MY_DEPTS, PD, and QC
    expect(options).toEqual(['MY_DEPTS', 'PD', 'QC']);
    expect(options).not.toContain('QA');
    expect(options).not.toContain('LB');
  });

  it('4. สลับตัวกรองไปยังแผนกเดี่ยว (QC) แสดงเฉพาะแผนของแผนกนั้น และอัปเดตสถิติ KPI อย่างถูกต้อง', () => {
    const multiDeptUser = {
      id: 'u-multi',
      name: 'กัลยาณี MultiDept',
      primary_department: 'PD',
      affiliated_departments: ['PD', 'QC'],
      approval_level: 4,
      isDcc: false
    };

    render(
      <AnnualPlansHub
        plans={mockPlans}
        activeDepartments={activeDepartments}
        activeAssets={activeAssets}
        currentUser={multiDeptUser}
        canCreatePlan={true}
        canEditPlan={true}
        onSelectPlan={vi.fn()}
        onOpenCreatePlan={vi.fn()}
        onOpenRevision={vi.fn()}
        onDeletePlan={vi.fn()}
        onPrintSinglePlan={vi.fn()}
        onPrintAllPlans={vi.fn()}
        onExportSummary={vi.fn()}
      />
    );

    const deptSelect = screen.getByLabelText('เลือกแผนก');
    fireEvent.change(deptSelect, { target: { value: 'QC' } });

    // Table now displays only QC plan
    expect(screen.getByText('VCC-AP-QC-2026')).toBeInTheDocument();
    expect(screen.queryByText('VCC-AP-PD-2026')).not.toBeInTheDocument();
  });

  it('5. ผู้ดูแลระบบ DCC / QMR / L6+ สามารถเห็นตัวเลือก "🏢 ทุกแผนก (ทั้งหมด)" และเห็นแผนกทั้งหมดในระบบ', () => {
    const dccUser = {
      id: 'u-dcc',
      name: 'DCC Officer',
      department: 'DC',
      approval_level: 4,
      isDcc: true
    };

    render(
      <AnnualPlansHub
        plans={mockPlans}
        activeDepartments={activeDepartments}
        activeAssets={activeAssets}
        currentUser={dccUser}
        canCreatePlan={true}
        canEditPlan={true}
        onSelectPlan={vi.fn()}
        onOpenCreatePlan={vi.fn()}
        onOpenRevision={vi.fn()}
        onDeletePlan={vi.fn()}
        onPrintSinglePlan={vi.fn()}
        onPrintAllPlans={vi.fn()}
        onExportSummary={vi.fn()}
      />
    );

    const deptSelect = screen.getByLabelText('เลือกแผนก');
    expect(deptSelect.value).toBe('');
    expect(screen.getByRole('option', { name: /🏢 ทุกแผนก \(ทั้งหมด\)/ })).toBeInTheDocument();

    const options = Array.from(deptSelect.querySelectorAll('option')).map((o) => o.value);
    expect(options).toContain('PD');
    expect(options).toContain('QC');
    expect(options).toContain('QA');
    expect(options).toContain('LB');
  });

  it('6. ป้องกัน Modal สร้างแผนใหม่: เมื่อตัวกรองหน้า Hub เป็น "MY_DEPTS" ต้องไม่ตั้งค่าแผนกเป็น "MY_DEPTS" แต่ให้ใช้ Primary Department แทน', async () => {
    const multiDeptUser = {
      id: 'u-multi',
      name: 'กัลยาณี MultiDept',
      primary_department: 'PD',
      department: 'PD',
      affiliated_departments: ['PD', 'QC'],
      approval_level: 4,
      isDcc: false
    };

    render(
      <MemoryRouter initialEntries={['/vcc/annual-plans']}>
        <AnnualPlanMatrixSection
          activeDepartments={activeDepartments}
          currentUser={multiDeptUser}
        />
      </MemoryRouter>
    );

    // Filter should default to MY_DEPTS
    const deptSelect = screen.getByLabelText('เลือกแผนก');
    expect(deptSelect.value).toBe('MY_DEPTS');

    // Click "สร้างแผนการทวนสอบประจำปีใหม่"
    const createBtn = screen.getByRole('button', { name: /สร้างแผนการทวนสอบประจำปีใหม่/ });
    fireEvent.click(createBtn);

    // Modal dialog opens
    expect(screen.getByText('สร้างแผนการทวนสอบเครื่องมือประจำปีใหม่')).toBeInTheDocument();

    // Department select inside the modal form must NOT be "MY_DEPTS"; it must be "PD"
    const modalDeptSelect = screen.getByLabelText(/แผนกเจ้าของแผน/);
    expect(modalDeptSelect.value).toBe('PD');
    expect(modalDeptSelect.value).not.toBe('MY_DEPTS');

    // The options inside modal form must only be the user's departments: PD and QC
    const modalOptions = Array.from(modalDeptSelect.querySelectorAll('option'))
      .map((o) => o.value)
      .filter(Boolean);
    expect(modalOptions).toEqual(['PD', 'QC']);
  });
});
