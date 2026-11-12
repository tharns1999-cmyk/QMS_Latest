import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

describe('Revision dropdown switcher', () => {
  it('displays both Rev.01 and Rev.02 and invokes onSelectPlan when switched', () => {
    const rev01 = { id: 'p1', plan_year: 2027, department: 'QC', revision: '01', status: 'APPROVED', is_current: 1 };
    const rev02 = { id: 'p2', plan_year: 2027, department: 'QC', revision: '02', status: 'DRAFT', is_current: 0, parent_plan_id: 'p1' };
    const onSelectPlan = vi.fn();

    render(
      <AnnualPlanWorkspaceHeader
        statusTab="DRAFT"
        setStatusTab={() => {}}
        activePlan={rev02}
        plans={[rev02]}
        planRevisions={[rev01, rev02]}
        selectedPlanId="p2"
        onSelectPlan={onSelectPlan}
        planItems={[]}
      />
    );

    const select = screen.getByLabelText('เลือกแผนประจำปี');
    expect(select).toBeInTheDocument();
    const options = within(select).getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent(/Rev\.01/);
    expect(options[1]).toHaveTextContent(/Rev\.02/);

    fireEvent.change(select, { target: { value: 'p1' } });
    expect(onSelectPlan).toHaveBeenCalledWith('p1');
  });

  it('handles case-insensitive department matching across multiple revisions (Rev.01, Rev.02, Rev.03)', () => {
    const rev01 = { id: 'p1', plan_year: 2027, department: 'qc', revision: '01', status: 'APPROVED', is_current: 0, effective_status: 'SUPERSEDED' };
    const rev02 = { id: 'p2', plan_year: 2027, department: 'QC', revision: '02', status: 'APPROVED', is_current: 1, effective_status: 'EFFECTIVE' };
    const rev03 = { id: 'p3', plan_year: 2027, department: 'QC', revision: '03', status: 'DRAFT', is_current: 0 };
    const onSelectPlan = vi.fn();

    render(
      <AnnualPlanWorkspaceHeader
        statusTab="DRAFT"
        setStatusTab={() => {}}
        activePlan={rev03}
        plans={[rev03]}
        planRevisions={[rev01, rev02, rev03]}
        selectedPlanId="p3"
        onSelectPlan={onSelectPlan}
        planItems={[]}
      />
    );

    const select = screen.getByLabelText('เลือกแผนประจำปี');
    const options = within(select).getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent(/Rev\.01/);
    expect(options[0]).toHaveTextContent(/SUPERSEDED/);
    expect(options[1]).toHaveTextContent(/Rev\.02/);
    expect(options[2]).toHaveTextContent(/Rev\.03/);
  });
});
