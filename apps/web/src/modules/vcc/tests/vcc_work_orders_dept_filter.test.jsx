import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CreateWorkOrderModal } from '../components/WorkOrderModals';

const mockAssets = [
  { id: 'ast-qc-1', asset_code: 'CAL-QC-001', name: 'Vernier Caliper 150mm', department: 'QC', status: 'ACTIVE' },
  { id: 'ast-qc-2', asset_code: 'MIC-QC-002', name: 'Micrometer 0-25mm', department: 'QC', status: 'ACTIVE' },
  { id: 'ast-wh-1', asset_code: 'SC-WH-001', name: 'Floor Scale 500kg', department: 'WH', status: 'ACTIVE' },
  { id: 'ast-pd-1', asset_code: 'GAU-PD-001', name: 'Pressure Gauge', department: 'PD', status: 'ACTIVE' },
  { id: 'ast-qc-retired', asset_code: 'OLD-QC-999', name: 'Old Caliper', department: 'QC', status: 'RETIRED' },
  { id: 'ast-qc-hold', asset_code: 'HLD-QC-888', name: 'Broken Scale', department: 'QC', status: 'ON_HOLD' }
];

const mockApprovedPlans = [
  { id: 'plan-qc-2026', plan_year: 2026, department: 'QC', title: 'แผนการทวนสอบ QC 2026', status: 'APPROVED' },
  { id: 'plan-wh-2026', plan_year: 2026, department: 'WH', title: 'แผนการทวนสอบ WH 2026', status: 'APPROVED' },
  { id: 'plan-pd-2026', plan_year: 2026, department: 'PD', title: 'แผนการทวนสอบ PD 2026', status: 'APPROVED' }
];

const defaultForm = {
  mode: 'ADHOC',
  plan_id: '',
  plan_item_id: '',
  planned_month: 1,
  child_asset_id: '',
  asset_id: '',
  provider_name: '',
  due_date: '2026-11-30'
};

describe('VCC Work Order Modal: Dynamic Department Scoping (No Hardcoding)', () => {
  it('1. ผู้ใช้ทั่วไปแผนก QC ต้องเห็นเฉพาะเครื่องมือ ACTIVE ของ QC และต้องไม่เห็น SC-WH-001 ของฝ่าย WH', () => {
    const qcUser = {
      id: 'u-qc',
      name: 'QC Officer',
      primary_department: 'QC',
      department: 'QC',
      approval_level: 2,
      isDcc: false,
      isQmr: false
    };

    render(
      <CreateWorkOrderModal
        open={true}
        onClose={vi.fn()}
        form={defaultForm}
        setForm={vi.fn()}
        error=""
        saving={false}
        onSubmit={vi.fn()}
        approvedPlans={mockApprovedPlans}
        planItems={[]}
        individualAssets={mockAssets}
        providers={['ห้องปฏิบัติการภายนอก', 'ทวนสอบภายใน']}
        currentUser={qcUser}
      />
    );

    const assetSelect = screen.getByLabelText(/เลือกเครื่องมือรายตัว/);
    const options = Array.from(assetSelect.querySelectorAll('option'));
    const optionTexts = options.map((o) => o.textContent);

    // ต้องพบเครื่องมือของ QC
    expect(optionTexts.some((t) => t.includes('CAL-QC-001'))).toBe(true);
    expect(optionTexts.some((t) => t.includes('MIC-QC-002'))).toBe(true);

    // ต้องไม่พบเครื่องมือของฝ่าย WH และ PD
    expect(optionTexts.some((t) => t.includes('SC-WH-001'))).toBe(false);
    expect(optionTexts.some((t) => t.includes('GAU-PD-001'))).toBe(false);

    // ต้องไม่แสดงเครื่องมือที่ RETIRED หรือ ON_HOLD
    expect(optionTexts.some((t) => t.includes('OLD-QC-999'))).toBe(false);
    expect(optionTexts.some((t) => t.includes('HLD-QC-888'))).toBe(false);
  });

  it('2. ผู้ใช้ Multi-Department (PD + QC) ต้องเห็นเครื่องมือของทั้งสองแผนก พร้อมรหัสแผนกนำหน้า [PD] และ [QC]', () => {
    const multiDeptUser = {
      id: 'u-multi',
      name: 'กัลยาณี MultiDept',
      primary_department: 'PD',
      affiliated_departments: ['PD', 'QC'],
      approval_level: 4,
      isDcc: false
    };

    render(
      <CreateWorkOrderModal
        open={true}
        onClose={vi.fn()}
        form={defaultForm}
        setForm={vi.fn()}
        error=""
        saving={false}
        onSubmit={vi.fn()}
        approvedPlans={mockApprovedPlans}
        planItems={[]}
        individualAssets={mockAssets}
        providers={['ห้องปฏิบัติการภายนอก']}
        currentUser={multiDeptUser}
      />
    );

    const assetSelect = screen.getByLabelText(/เลือกเครื่องมือรายตัว/);
    const options = Array.from(assetSelect.querySelectorAll('option'));
    const optionTexts = options.map((o) => o.textContent);

    // ต้องพบเครื่องมือของทั้ง PD และ QC พร้อมรหัสแผนกนำหน้า [PD] และ [QC]
    expect(optionTexts.some((t) => t.includes('[PD] GAU-PD-001'))).toBe(true);
    expect(optionTexts.some((t) => t.includes('[QC] CAL-QC-001'))).toBe(true);

    // ต้องไม่พบเครื่องมือของ WH
    expect(optionTexts.some((t) => t.includes('SC-WH-001'))).toBe(false);
  });

  it('3. ผู้ดูแลระบบ DCC Admin ต้องเห็นเครื่องมือ ACTIVE ของทุกแผนก พร้อมรหัสแผนกนำหน้า [WH], [QC], [PD]', () => {
    const dccUser = {
      id: 'u-dcc',
      name: 'DCC Officer',
      department: 'DC',
      approval_level: 4,
      isDcc: true
    };

    render(
      <CreateWorkOrderModal
        open={true}
        onClose={vi.fn()}
        form={defaultForm}
        setForm={vi.fn()}
        error=""
        saving={false}
        onSubmit={vi.fn()}
        approvedPlans={mockApprovedPlans}
        planItems={[]}
        individualAssets={mockAssets}
        providers={['ห้องปฏิบัติการภายนอก']}
        currentUser={dccUser}
      />
    );

    const assetSelect = screen.getByLabelText(/เลือกเครื่องมือรายตัว/);
    const options = Array.from(assetSelect.querySelectorAll('option'));
    const optionTexts = options.map((o) => o.textContent);

    // DCC Admin ต้องเห็นครบทุกแผนก
    expect(optionTexts.some((t) => t.includes('[WH] SC-WH-001'))).toBe(true);
    expect(optionTexts.some((t) => t.includes('[QC] CAL-QC-001'))).toBe(true);
    expect(optionTexts.some((t) => t.includes('[PD] GAU-PD-001'))).toBe(true);
  });

  it('4. การรีเซ็ตค่าเครื่องมือ: สลับโหมดระหว่าง Ad-hoc และ Plan ต้องรีเซ็ต asset_id เป็นค่าว่างเสมอ', () => {
    const mockSetForm = vi.fn();
    const currentForm = {
      ...defaultForm,
      mode: 'ADHOC',
      asset_id: 'ast-qc-1'
    };

    render(
      <CreateWorkOrderModal
        open={true}
        onClose={vi.fn()}
        form={currentForm}
        setForm={mockSetForm}
        error=""
        saving={false}
        onSubmit={vi.fn()}
        approvedPlans={mockApprovedPlans}
        planItems={[]}
        individualAssets={mockAssets}
        providers={['ห้องปฏิบัติการภายนอก']}
        currentUser={{ department: 'QC', approval_level: 2, isDcc: false }}
      />
    );

    // สลับไปยังโหมดสร้างจากแผน (Plan)
    const planRadio = screen.getByLabelText(/สร้างจากแผนประจำปีที่อนุมัติแล้ว/);
    fireEvent.click(planRadio);

    // ตรวจสอบว่า setForm ถูกเรียกโดยมี asset_id: ''
    expect(mockSetForm).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'PLAN',
        asset_id: ''
      })
    );
  });

  it('5. โหมดจากแผนประจำปี: กรองเฉพาะแผนของแผนกที่สังกัดสำหรับผู้ใช้ทั่วไป', () => {
    const qcUser = {
      id: 'u-qc',
      name: 'QC Officer',
      department: 'QC',
      approval_level: 2,
      isDcc: false
    };

    const planForm = {
      ...defaultForm,
      mode: 'PLAN',
      plan_id: 'plan-qc-2026'
    };

    render(
      <CreateWorkOrderModal
        open={true}
        onClose={vi.fn()}
        form={planForm}
        setForm={vi.fn()}
        error=""
        saving={false}
        onSubmit={vi.fn()}
        approvedPlans={mockApprovedPlans}
        planItems={[]}
        individualAssets={mockAssets}
        providers={['ห้องปฏิบัติการภายนอก']}
        currentUser={qcUser}
      />
    );

    // Dropdown แผนที่อนุมัติแล้ว ต้องมีเฉพาะ QC ไม่พบ WH หรือ PD
    expect(screen.getByRole('option', { name: /QC \(แผนการทวนสอบ QC 2026\)/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /WH \(แผนการทวนสอบ WH 2026\)/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /PD \(แผนการทวนสอบ PD 2026\)/ })).not.toBeInTheDocument();
  });
});
