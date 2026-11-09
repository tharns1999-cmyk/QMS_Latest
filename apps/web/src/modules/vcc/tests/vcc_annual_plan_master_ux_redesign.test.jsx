import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AnnualPlanLevel1Overview from '../components/AnnualPlanLevel1Overview';
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

  it('1. LEVEL 1: Horizontal Year Tabs display actual years and plan counts without dropdowns', () => {
    const setFilterYear = vi.fn();
    render(
      <AnnualPlanLevel1Overview
        plans={mockPlans}
        availableYears={[2027, 2026]}
        filterYear="2026"
        setFilterYear={setFilterYear}
        activeDepartments={[{ code: 'QC', nameTh: 'ควบคุมคุณภาพ' }]}
        statusTab="ALL"
      />
    );

    // Shows horizontal year buttons directly on page
    expect(screen.getByRole('button', { name: /ปี 2026/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ปี 2027/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ทุกปี \(3\)/ })).toBeInTheDocument();

    // Clicking year switches filter immediately
    fireEvent.click(screen.getByRole('button', { name: /ปี 2027/ }));
    expect(setFilterYear).toHaveBeenCalledWith('2027');
  });

  it('2. LEVEL 1: Status Filter Chips show real item counts and allow direct 1-click filtering', () => {
    const setStatusTab = vi.fn();
    render(
      <AnnualPlanLevel1Overview
        plans={mockPlans}
        availableYears={[2027, 2026]}
        filterYear="2026"
        statusTab="ALL"
        setStatusTab={setStatusTab}
        activeDepartments={[{ code: 'QC', nameTh: 'ควบคุมคุณภาพ' }]}
      />
    );

    // Shows status filter chips with accurate live counts
    expect(screen.getByRole('button', { name: /ทั้งหมด/ })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /ร่างแผน/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /อนุมัติแล้ว \/ บังคับใช้/ })).toHaveTextContent('1');

    // 1-click to filter
    fireEvent.click(screen.getByRole('button', { name: /อนุมัติแล้ว \/ บังคับใช้/ }));
    expect(setStatusTab).toHaveBeenCalledWith('APPROVED');
  });

  it('3. LEVEL 1: Distinct "สร้างแผนประจำปี" CTA exists and clearly differs from revising a plan', () => {
    const onOpenCreatePlan = vi.fn();
    render(
      <AnnualPlanLevel1Overview
        plans={mockPlans}
        availableYears={[2027, 2026]}
        filterYear="2026"
        onOpenCreatePlan={onOpenCreatePlan}
      />
    );

    const createPlanBtn = screen.getByRole('button', { name: 'สร้างแผนประจำปี' });
    expect(createPlanBtn).toBeInTheDocument();
    fireEvent.click(createPlanBtn);
    expect(onOpenCreatePlan).toHaveBeenCalledTimes(1);
  });

  it('4. LEVEL 2: Clearly separates Plan Revision from Form Template Revision', () => {
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
    // Template Revision badge
    expect(screen.getByText('Template Rev.01')).toBeInTheDocument();
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
    expect(screen.getByText(/VCC-PLAN-QC Rev\.01/)).toBeInTheDocument();
    expect(screen.getByText(/VCC-PLAN-QC Rev\.02/)).toBeInTheDocument();
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
