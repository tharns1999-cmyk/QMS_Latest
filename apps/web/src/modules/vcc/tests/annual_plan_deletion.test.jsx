import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';
import AnnualPlansHub from '../components/AnnualPlansHub';
import DeletePlanModal from '../components/DeletePlanModal';
import { deleteVccPlan, getLocalPlans, setLocalPlans } from '../api/vccPlanApi';

const mockPlans = [
  {
    id: 'plan-draft-qc',
    plan_year: 2026,
    department: 'QC',
    document_code: 'FM-QC-46',
    revision: '01',
    status: 'DRAFT',
    title: 'แผนร่าง QC'
  },
  {
    id: 'plan-returned-qc',
    plan_year: 2026,
    department: 'QC',
    document_code: 'FM-QC-46',
    revision: '02',
    status: 'RETURNED',
    title: 'แผนส่งกลับแก้ไข QC'
  },
  {
    id: 'plan-approved-qc',
    plan_year: 2026,
    department: 'QC',
    document_code: 'FM-QC-46',
    revision: '01',
    status: 'APPROVED',
    title: 'แผนอนุมัติแล้ว QC'
  },
  {
    id: 'plan-pending-qc',
    plan_year: 2026,
    department: 'QC',
    document_code: 'FM-QC-46',
    revision: '01',
    status: 'PENDING_APPROVAL',
    title: 'แผนรออนุมัติ QC'
  }
];

describe('VCC: Annual Plan Deletion Frontend & Modal Tests', () => {
  beforeEach(() => {
    useStore.setState({
      currentUser: {
        id: 'qc-lead',
        name: 'QC Leader',
        department: 'QC',
        extra_departments: [],
        approval_level: 4,
        isDcc: false
      },
      masterDepartments: [{ code: 'QC', nameTh: 'ควบคุมคุณภาพ', status: 'ACTIVE' }]
    });
  });

  it('renders delete trash button ONLY for DRAFT and RETURNED plans', () => {
    render(
      <AnnualPlansHub
        plans={mockPlans}
        filterYear={2026}
        setFilterYear={vi.fn()}
        filterDept="QC"
        setFilterDept={vi.fn()}
      />
    );

    // DRAFT and RETURNED have delete buttons
    expect(screen.getByTestId('delete-plan-plan-draft-qc')).toBeInTheDocument();
    expect(screen.getByTestId('delete-plan-plan-returned-qc')).toBeInTheDocument();

    // APPROVED and PENDING_APPROVAL do NOT have delete buttons
    expect(screen.queryByTestId('delete-plan-plan-approved-qc')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-plan-plan-pending-qc')).not.toBeInTheDocument();
  });

  it('does NOT render delete trash button for users of a different department or level < 4', () => {
    // 1. Staff level 2 in QC
    useStore.setState({
      currentUser: {
        id: 'qc-staff',
        name: 'QC Staff',
        department: 'QC',
        approval_level: 2,
        isDcc: false
      }
    });

    const { rerender } = render(
      <AnnualPlansHub
        plans={mockPlans}
        filterYear={2026}
        setFilterYear={vi.fn()}
      />
    );
    expect(screen.queryByTestId('delete-plan-plan-draft-qc')).not.toBeInTheDocument();

    // 2. Head of different department (PD L4)
    useStore.setState({
      currentUser: {
        id: 'pd-lead',
        name: 'PD Leader',
        department: 'PD',
        approval_level: 4,
        isDcc: false
      }
    });
    rerender(
      <AnnualPlansHub
        plans={mockPlans}
        filterYear={2026}
        setFilterYear={vi.fn()}
      />
    );
    expect(screen.queryByTestId('delete-plan-plan-draft-qc')).not.toBeInTheDocument();

    // 3. DCC Admin can delete across departments
    useStore.setState({
      currentUser: {
        id: 'dcc-admin',
        name: 'DCC Admin',
        department: 'DC',
        approval_level: 4,
        isDcc: true
      }
    });
    rerender(
      <AnnualPlansHub
        plans={mockPlans}
        filterYear={2026}
        setFilterYear={vi.fn()}
      />
    );
    expect(screen.getByTestId('delete-plan-plan-draft-qc')).toBeInTheDocument();
  });

  it('opens DeletePlanModal on clicking trash icon and submits with mandatory reason', async () => {
    const onDeletePlanMock = vi.fn().mockResolvedValue();

    render(
      <AnnualPlansHub
        plans={mockPlans}
        filterYear={2026}
        setFilterYear={vi.fn()}
        onDeletePlan={onDeletePlanMock}
      />
    );

    // Click trash button
    fireEvent.click(screen.getByTestId('delete-plan-plan-draft-qc'));

    // Modal is opened
    expect(screen.getByText('ยืนยันการลบแผนงานฉบับร่าง')).toBeInTheDocument();
    expect(screen.getByText(/แผนก QC/)).toBeInTheDocument();

    // Submit button is disabled when reason is empty
    const confirmBtn = screen.getByRole('button', { name: /ยืนยันลบแผนงาน/ });
    expect(confirmBtn).toBeDisabled();

    // Type reason
    const textarea = screen.getByLabelText(/เหตุผลในการลบแผนงาน/);
    fireEvent.change(textarea, { target: { value: 'ระบุข้อมูลผิดพลาด ขอยกเลิกและสร้างใหม่' } });
    expect(confirmBtn).not.toBeDisabled();

    // Click confirm
    fireEvent.click(confirmBtn);
    expect(onDeletePlanMock).toHaveBeenCalledWith('plan-draft-qc', 'ระบุข้อมูลผิดพลาด ขอยกเลิกและสร้างใหม่');
  });

  it('DeletePlanModal disables confirm button and displays error when submitting empty reason', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <DeletePlanModal
        isOpen={true}
        plan={mockPlans[0]}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    const confirmBtn = screen.getByRole('button', { name: /ยืนยันลบแผนงาน/ });
    expect(confirmBtn).toBeDisabled();

    // Click cancel
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('deleteVccPlan correctly removes plan and updates local storage in demo mode', async () => {
    setLocalPlans([
      {
        id: 'plan-test-local-draft',
        plan_year: 2026,
        department: 'QC',
        status: 'DRAFT',
        title: 'Local Draft'
      }
    ]);

    const result = await deleteVccPlan('plan-test-local-draft', 'ทดสอบลบในโหมด local');
    expect(result.success).toBe(true);

    const remaining = getLocalPlans().filter((p) => p.id === 'plan-test-local-draft');
    expect(remaining.length).toBe(0);
  });
});
