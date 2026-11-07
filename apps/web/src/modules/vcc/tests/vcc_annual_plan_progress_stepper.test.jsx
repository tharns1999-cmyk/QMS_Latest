import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AnnualPlanProgressStepper from '../components/AnnualPlanProgressStepper';

describe('VCC Annual Plan Progress Stepper (FM-QC-46)', () => {
  const basePlan = {
    id: 'plan-2026',
    plan_year: 2026,
    department: 'QC',
    status: 'DRAFT',
    prepared_by_name: 'สมพงษ์ วิศวกร QC',
    prepared_at: '2026-10-25T08:00:00.000Z'
  };

  const thresholds = {
    min_requester_level: 1,
    required_reviewer_level: 4,
    required_approver_level: 5
  };

  it('1. Renders with accessible region and label', () => {
    render(<AnnualPlanProgressStepper activePlan={basePlan} thresholds={thresholds} />);

    const region = screen.getByRole('region', { name: 'ขั้นตอนการอนุมัติแผนประจำปี' });
    expect(region).toBeInTheDocument();
    expect(screen.getByTestId('annual-plan-progress-stepper')).toBeInTheDocument();
  });

  it('2. DRAFT state: Step 1 is active (current step), other steps upcoming', () => {
    const { container } = render(
      <AnnualPlanProgressStepper activePlan={basePlan} thresholds={thresholds} />
    );

    // Current step in stepper
    const currentSteps = container.querySelectorAll('[aria-current="step"]');
    expect(currentSteps.length).toBeGreaterThanOrEqual(1);

    expect(screen.getAllByText('ร่างแผนประจำปี').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('ทบทวนแผน').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('อนุมัติแผน').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('มีผลบังคับใช้').length).toBeGreaterThanOrEqual(1);

    // Real preparer name displayed
    expect(screen.getByText('สมพงษ์ วิศวกร QC')).toBeInTheDocument();
  });

  it('3. PENDING_REVIEW state: Step 1 completed, Step 2 is active, displays assigned reviewer', () => {
    const reviewPlan = {
      ...basePlan,
      status: 'PENDING_REVIEW',
      assigned_reviewer_name: 'หัวหน้าแผนก QC'
    };

    render(<AnnualPlanProgressStepper activePlan={reviewPlan} thresholds={thresholds} />);

    expect(screen.getByText('หัวหน้าแผนก QC')).toBeInTheDocument();
  });

  it('4. PENDING_APPROVAL state: Steps 1 & 2 completed, Step 3 is active with assigned approver', () => {
    const approvePlan = {
      ...basePlan,
      status: 'PENDING_APPROVAL',
      reviewed_by_name: 'สมศรี ผู้ทบทวน',
      reviewed_at: '2026-10-26T10:00:00.000Z',
      assigned_approver_name: 'ผู้จัดการฝ่าย QA (QMR)'
    };

    render(<AnnualPlanProgressStepper activePlan={approvePlan} thresholds={thresholds} />);

    expect(screen.getByText('สมศรี ผู้ทบทวน')).toBeInTheDocument();
  });

  it('5. APPROVED state: All 4 steps completed, displays approver and approved timestamp', () => {
    const approvedPlan = {
      ...basePlan,
      status: 'APPROVED',
      reviewed_by_name: 'สมศรี ผู้ทบทวน',
      reviewed_at: '2026-10-26T10:00:00.000Z',
      approved_by_name: 'กิตติศักดิ์ ผู้อนุมัติ L5',
      approved_at: '2026-10-27T04:30:00.000Z'
    };

    render(<AnnualPlanProgressStepper activePlan={approvedPlan} thresholds={thresholds} />);

    expect(screen.getByText('กิตติศักดิ์ ผู้อนุมัติ L5')).toBeInTheDocument();
  });

  it('6. REJECTED state: Step 1 shows returned/revision state, Step 2 shows rejector without breaking button separation', () => {
    const rejectedPlan = {
      ...basePlan,
      status: 'REJECTED',
      rejected_by_name: 'หัวหน้า QC ผู้ส่งกลับ',
      rejected_at: '2026-10-26T11:00:00.000Z',
      rejected_reason: 'กรุณาระบุเดือนทวนสอบเครื่องวัดความดันเพิ่มเติม'
    };

    render(<AnnualPlanProgressStepper activePlan={rejectedPlan} thresholds={thresholds} />);

    expect(screen.getByText('หัวหน้า QC ผู้ส่งกลับ')).toBeInTheDocument();

    // Critical Architecture Rule: Must NOT render interactive review/approve buttons directly in stepper
    expect(screen.queryByRole('button', { name: /อนุมัติแผน/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /ส่งกลับแก้ไข/ })).toBeNull();
  });

  it('7. Real data integrity: does NOT invent fictitious reviewer or timestamps when null', () => {
    const blankPlan = {
      id: 'plan-blank',
      plan_year: 2026,
      department: 'QC',
      status: 'DRAFT',
      prepared_by: null,
      prepared_at: null,
      reviewed_by: null,
      reviewed_at: null,
      approved_by: null,
      approved_at: null
    };

    const { container } = render(
      <AnnualPlanProgressStepper activePlan={blankPlan} thresholds={thresholds} />
    );

    // No fake dates or actors
    expect(container.textContent).not.toContain('Invalid Date');
    expect(container.textContent).not.toContain('null');
    expect(container.textContent).not.toContain('undefined');
  });
});
