import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AnnualPlanApprovalChain from '../components/AnnualPlanApprovalChain';

const base = { department: 'QC', status: 'DRAFT', prepared_by_name: 'ผู้จัดทำจริง', prepared_at: '2026-10-25T08:00:00Z' };
describe('Annual plan approval chain used in the workspace', () => {
  it('exposes the current step and recorded preparer accessibly', () => {
    render(<AnnualPlanApprovalChain activePlan={base} />);
    const region = screen.getByRole('region', { name: 'ขั้นตอนการอนุมัติแผนประจำปี' });
    expect(region.querySelector('[aria-current="step"]')).toHaveTextContent('ผู้จัดทำจริง');
  });
  it.each(['PENDING_REVIEW', 'PENDING_APPROVAL'])('shows assigned people at %s without recording a decision', (status) => {
    const { container } = render(<AnnualPlanApprovalChain activePlan={{ ...base, status, assigned_reviewer_name: 'ผู้ทบทวนที่มอบหมาย', assigned_approver_name: 'ผู้อนุมัติที่มอบหมาย' }} />);
    expect(screen.getByText(/รอการทบทวน.*ผู้ทบทวนที่มอบหมาย/)).toBeInTheDocument();
    expect(screen.getByText(/รอการอนุมัติ.*ผู้อนุมัติที่มอบหมาย/)).toBeInTheDocument();
    expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('shows completed decisions and their dates', () => {
    const { container } = render(<AnnualPlanApprovalChain activePlan={{ ...base, status: 'APPROVED', reviewed_by_name: 'ผู้ทบทวนจริง', reviewed_at: '2026-10-26T08:00:00Z', approved_by_name: 'ผู้อนุมัติจริง', approved_at: '2026-10-27T08:00:00Z' }} />);
    expect(screen.getByText('ผู้ทบทวนจริง')).toBeInTheDocument();
    expect(screen.getByText('ผู้อนุมัติจริง')).toBeInTheDocument();
    expect(container.querySelector('[aria-current="step"]')).toBeNull();
    expect(container.textContent).toContain('2569');
  });
  it('uses the effective higher levels supplied by the API', () => {
    render(<AnnualPlanApprovalChain activePlan={base} thresholds={{ min_requester_level: 6, required_reviewer_level: 7, required_approver_level: 8 }} />);
    expect(screen.getByText('ผู้จัดทำ (L6+ · แผนก QC):')).toBeInTheDocument();
    expect(screen.getByText('ผู้ทบทวน (PD L7):')).toBeInTheDocument();
    expect(screen.getByText('ผู้อนุมัติ (MGT L8+):')).toBeInTheDocument();
  });
  it('does not invent signatories or dates for legacy records', () => {
    const { container } = render(<AnnualPlanApprovalChain activePlan={{ department: 'QC', status: 'REJECTED' }} />);
    expect(screen.getByText('ยังไม่ส่ง')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Invalid Date|null|undefined|2569/);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
