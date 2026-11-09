import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AnnualPlanRegisterTable from '../components/AnnualPlanRegisterTable';
import AnnualPlanWorkspaceHeader from '../components/AnnualPlanWorkspaceHeader';
import { PlanRevisionModal } from '../components/AnnualPlanModals';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { resetVccLocalStore } from '../api/vccApi';
import useStore from '../../../store/useStore';

describe('VCC Master UX/UI Redesign — 2-Level Architecture & Controlled Revision', () => {
  const mockPlans = [
    {
      id: 'plan-2026-qc-v1',
      plan_year: 2026,
      department: 'QC',
      department_name_th: 'ควบคุมคุณภาพ',
      document_code: 'VCC-PLAN-QC',
      revision: '01',
      form_template_revision: '01',
      title: 'แผนการทวนสอบประจำปี 2026',
      status: 'APPROVED',
      is_current: 1,
      effective_status: 'CURRENT',
      item_count: 15,
      total_cycles: 24,
      due_date_rule: 'END_OF_MONTH'
    },
    {
      id: 'plan-2026-qc-v2',
      plan_year: 2026,
      department: 'QC',
      department_name_th: 'ควบคุมคุณภาพ',
      document_code: 'VCC-PLAN-QC',
      revision: '02',
      form_template_revision: '01',
      parent_plan_id: 'plan-2026-qc-v1',
      parent_revision: '01',
      title: 'แผนการทวนสอบประจำปี 2026 (ฉบับแก้ไข)',
      status: 'DRAFT',
      is_current: 0,
      effective_status: 'PENDING_APPROVAL',
      item_count: 17,
      total_cycles: 28,
      due_date_rule: 'END_OF_MONTH'
    },
    {
      id: 'plan-2027-qc-v1',
      plan_year: 2027,
      department: 'QC',
      department_name_th: 'ควบคุมคุณภาพ',
      document_code: 'VCC-PLAN-QC',
      revision: '01',
      form_template_revision: '01',
      title: 'แผนการทวนสอบประจำปี 2027',
      status: 'DRAFT',
      is_current: 1,
      effective_status: 'CURRENT',
      item_count: 12,
      total_cycles: 12,
      due_date_rule: 'END_OF_MONTH'
    }
  ];

  beforeEach(() => {
    resetVccLocalStore();
    useStore.setState({
      currentUser: {
        id: 'qc4',
        name: 'QC Leader (L4)',
        role: 'STAFF',
        department: 'QC',
        approval_level: 4,
        approvalLevel: 4,
        isDcc: false,
        isQmr: false
      },
      masterDepartments: [
        { code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' },
        { code: 'LB', name_th: 'ห้องปฏิบัติการ', status: 'ACTIVE' }
      ]
    });
  });

  it('1. PAGE A: Displays comprehensive register data table with structured columns', () => {
    const onSelectPlan = vi.fn();
    const onOpenCreatePlan = vi.fn();

    render(
      <AnnualPlanRegisterTable
        plans={mockPlans}
        activeDepartments={[
          { code: 'QC', nameTh: 'ควบคุมคุณภาพ' },
          { code: 'LB', nameTh: 'ห้องปฏิบัติการ' }
        ]}
        userDept="QC"
        onSelectPlan={onSelectPlan}
        onOpenCreatePlan={onOpenCreatePlan}
      />
    );

    // Table headers exist
    expect(screen.getByText('ปีของแผน')).toBeInTheDocument();
    expect(screen.getByText('แผนก')).toBeInTheDocument();
    expect(screen.getByText('รหัสเอกสาร')).toBeInTheDocument();
    expect(screen.getByText('ฉบับแก้ไขแผน')).toBeInTheDocument();
    expect(screen.getByText('ฉบับฟอร์ม')).toBeInTheDocument();
    expect(screen.getByText('สถานะ')).toBeInTheDocument();
    expect(screen.getByText('เครื่องมือ')).toBeInTheDocument();
    expect(screen.getByText('รอบทวนสอบ')).toBeInTheDocument();
    expect(screen.getByText('การดำเนินการ')).toBeInTheDocument();

    // Top CTA "+ สร้างแผนประจำปี"
    const topCreateBtn = screen.getByRole('button', { name: /สร้างแผนประจำปี/ });
    expect(topCreateBtn).toBeInTheDocument();
    fireEvent.click(topCreateBtn);
    expect(onOpenCreatePlan).toHaveBeenCalledTimes(1);

    // Rows rendered
    expect(screen.getAllByText('ปี 2026').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ปี 2027').length).toBeGreaterThan(0);
    expect(screen.getAllByText('VCC-PLAN-QC').length).toBeGreaterThan(0);

    // Action button opens plan
    const actionBtns = screen.getAllByRole('button', { name: /เปิดแผนงาน|ดำเนินการต่อ/ });
    expect(actionBtns.length).toBeGreaterThan(0);
    fireEvent.click(actionBtns[0]);
    expect(onSelectPlan).toHaveBeenCalled();
  });

  it('2. PAGE A: Supports live search filtering by title and quick status filters', () => {
    render(
      <AnnualPlanRegisterTable
        plans={mockPlans}
        activeDepartments={[{ code: 'QC', nameTh: 'ควบคุมคุณภาพ' }]}
        userDept="QC"
      />
    );

    // Search input
    const searchInput = screen.getByPlaceholderText(/ค้นหารหัสแผน/);
    expect(searchInput).toBeInTheDocument();

    // Filter by search query '2027'
    fireEvent.change(searchInput, { target: { value: '2027' } });
    expect(screen.getAllByText('ปี 2027').length).toBeGreaterThan(0);
    expect(screen.queryByText('ปี 2026')).not.toBeInTheDocument();
  });

  it('3. PAGE B: Header contains `← กลับหน้ารวมแผนประจำปี` back button that triggers onBackToRegister', () => {
    const approvedPlan = mockPlans[0];
    const onBackToRegister = vi.fn();
    render(
      <AnnualPlanWorkspaceHeader
        activePlan={approvedPlan}
        plans={[approvedPlan]}
        selectedPlanId={approvedPlan.id}
        statusTab="APPROVED"
        onBackToRegister={onBackToRegister}
      />
    );

    const backBtn = screen.getByRole('button', { name: /กลับหน้ารวมแผนประจำปี/ });
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(onBackToRegister).toHaveBeenCalledTimes(1);
  });

  it('4. LEVEL 2: Displays clean paperless revision badge without residual form codes or template tags', () => {
    const approvedPlan = mockPlans[0];
    render(
      <AnnualPlanWorkspaceHeader
        activePlan={approvedPlan}
        plans={[approvedPlan]}
        selectedPlanId={approvedPlan.id}
        statusTab="APPROVED"
      />
    );

    // Plan Revision badge
    expect(screen.getByText('Rev.01')).toBeInTheDocument();
    // Residual form codes and template tags are strictly omitted
    expect(screen.queryByText(/FM-QC-46|VCC-PLAN-QC|Template Rev/)).not.toBeInTheDocument();
  });

  it('5. LEVEL 2: Displays prominent primary "สร้างฉบับแก้ไขใหม่ (Revise Plan)" CTA for Effective Plan', () => {
    const approvedPlan = mockPlans[0];
    const onOpenRevision = vi.fn();
    render(
      <AnnualPlanWorkspaceHeader
        activePlan={approvedPlan}
        plans={[approvedPlan]}
        selectedPlanId={approvedPlan.id}
        statusTab="APPROVED"
        onOpenRevision={onOpenRevision}
      />
    );

    // Prominent primary button on effective plan
    const reviseBtn = screen.getByRole('button', { name: /สร้างฉบับแก้ไข/ });
    expect(reviseBtn).toBeInTheDocument();
    fireEvent.click(reviseBtn);
    expect(onOpenRevision).toHaveBeenCalledTimes(1);
  });

  it('6. CONTROLLED REVISION: PlanRevisionModal enforces mandatory reason and explains source protection', () => {
    const setReason = vi.fn();
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(
      <PlanRevisionModal
        open={true}
        onClose={() => {}}
        plan={mockPlans[0]}
        reason="ต้องการเพิ่มเครื่องมือวัดรอบไตรมาส 3"
        setReason={setReason}
        onSubmit={onSubmit}
      />
    );

    // Explains source protection
    expect(screen.getByText('Rev.01')).toBeInTheDocument();
    expect(screen.getByText(/Rev\.02 \(ร่างแผน\)/)).toBeInTheDocument();
    expect(screen.getByText(/การสร้าง Revision ใหม่จะไม่เปลี่ยนแปลงแผนฉบับปัจจุบัน Rev\.01/)).toBeInTheDocument();

    // Mandatory reason field
    const reasonInput = screen.getByLabelText(/เหตุผลการขอปรับปรุงแผน/);
    expect(reasonInput).toBeRequired();

    // Confirm button
    const submitBtn = screen.getByRole('button', { name: /สร้างฉบับแก้ไข/ });
    expect(submitBtn).toBeInTheDocument();
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('7. DRAFT REVISION CONTEXT: Displays clear context banner when viewing in-progress Rev.02', () => {
    const draftRevisionPlan = mockPlans[1];
    render(
      <AnnualPlanWorkspaceHeader
        activePlan={draftRevisionPlan}
        plans={[draftRevisionPlan]}
        selectedPlanId={draftRevisionPlan.id}
        statusTab="DRAFT"
      />
    );

    // Context banner alerting that Rev.01 is still active
    const banner = screen.getByTestId('plan-draft-revision-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/กำลังจัดทำฉบับแก้ไข Rev\.02 — แผนเดิม Rev\.01 ยังคงมีผลบังคับใช้/);
  });

  it('8. SUPERSEDED PLAN: Displays historical callout and switch-to-current action', () => {
    const supersededPlan = {
      ...mockPlans[0],
      is_current: 0,
      effective_status: 'SUPERSEDED'
    };
    const onSelectPlan = vi.fn();
    render(
      <AnnualPlanWorkspaceHeader
        activePlan={supersededPlan}
        plans={[supersededPlan, mockPlans[1]]}
        selectedPlanId={supersededPlan.id}
        statusTab="APPROVED"
        onSelectPlan={onSelectPlan}
      />
    );

    const banner = screen.getByTestId('plan-superseded-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/ฉบับประวัติศาสตร์ที่ถูกแทนที่แล้ว \(SUPERSEDED\)/);
  });
});
