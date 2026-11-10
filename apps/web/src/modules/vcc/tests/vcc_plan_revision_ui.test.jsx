import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AnnualPlanWorkspaceHeader from '../components/AnnualPlanWorkspaceHeader';
import { PlanRevisionModal } from '../components/AnnualPlanModals';

const plan = (status) => ({ id: 'p1', plan_year: 2027, department: 'QC', document_code: 'FM-QC-46', revision: '01', title: 'แผน 2027', status, due_date_rule: 'END_OF_MONTH' });
const renderHeader = (status, extra = {}) =>
  render(
    <AnnualPlanWorkspaceHeader
      statusTab="APPROVED"
      setStatusTab={() => {}}
      activePlan={plan(status)}
      plans={[plan(status)]}
      selectedPlanId="p1"
      planItems={[]}
      {...extra}
    />
  );

describe('Plan revision button', () => {
  it('shows on an approved plan and opens the revision dialog handler', () => {
    const onOpenRevision = vi.fn();
    renderHeader('APPROVED', { onOpenRevision });
    fireEvent.click(screen.getByRole('button', { name: /สร้างฉบับแก้ไข \(Revision\)/ }));
    expect(onOpenRevision).toHaveBeenCalledTimes(1);
  });

  it('is hidden on a draft plan, and when the page does not offer it (demo mode, not allowed to edit)', () => {
    const { unmount } = renderHeader('DRAFT', { onOpenRevision: vi.fn() });
    expect(screen.queryByRole('button', { name: /สร้างฉบับแก้ไข/ })).not.toBeInTheDocument();
    unmount();
    renderHeader('APPROVED');
    expect(screen.queryByRole('button', { name: /สร้างฉบับแก้ไข/ })).not.toBeInTheDocument();
  });

  it(' hides revision button when plan is SUPERSEDED (not current)', () => {
    const onOpenRevision = vi.fn();
    render(
      <AnnualPlanWorkspaceHeader
        statusTab="APPROVED"
        setStatusTab={() => {}}
        activePlan={{ ...plan('APPROVED'), is_current: 0, effective_status: 'SUPERSEDED' }}
        plans={[{ ...plan('APPROVED'), is_current: 0, effective_status: 'SUPERSEDED' }]}
        selectedPlanId="p1"
        planItems={[]}
        onOpenRevision={onOpenRevision}
      />
    );
    expect(screen.queryByRole('button', { name: /สร้างฉบับแก้ไข/ })).not.toBeInTheDocument();
    expect(screen.getAllByText(/SUPERSEDED/).length).toBeGreaterThan(0);
  });
});

describe('Plan revision dialog', () => {
  const setup = (props = {}) => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    const setReason = vi.fn();
    render(<PlanRevisionModal open plan={plan('APPROVED')} reason="" setReason={setReason} error="" saving={false} onSubmit={onSubmit} onClose={() => {}} {...props} />);
    return { onSubmit, setReason };
  };

  it('cannot be submitted without a reason', () => {
    setup();
    expect(screen.getByRole('button', { name: 'สร้างฉบับแก้ไข' })).toBeDisabled();
  });

  it('submits once a reason is typed, and shows a server error', () => {
    const { onSubmit } = setup({ reason: 'เพิ่มเครื่องมือใหม่', error: 'มีแผนอยู่ในสถานะ DRAFT แล้ว' });
    expect(screen.getByRole('alert')).toHaveTextContent('DRAFT');
    fireEvent.click(screen.getByRole('button', { name: 'สร้างฉบับแก้ไข' }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('passes the typed reason up', () => {
    const { setReason } = setup();
    fireEvent.change(screen.getByLabelText(/เหตุผลการขอปรับปรุงแผน/), { target: { value: 'เปลี่ยนรอบ' } });
    expect(setReason).toHaveBeenCalledWith('เปลี่ยนรอบ');
  });
});
