import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import AnnualPlanMatrixTable from '../components/AnnualPlanMatrixTable';
import AnnualPlanOverviewCards from '../components/AnnualPlanOverviewCards';
import { isSavedPlanItem } from '../utils/planLabels';

const plan = { id: 'P1', plan_year: 2027, department: 'QC', document_code: 'FM-QC-46', revision: '01', title: 'แผน 2027', status: 'DRAFT', due_date_rule: 'END_OF_MONTH' };
const base = { plan_id: 'P1', provider_name: 'ทวนสอบภายใน', frequency_label: 'รายปี', responsible_dept: 'QC', is_group: 0, asset_status: 'ACTIVE', asset_type: 'เทอร์โมมิเตอร์', due_dates: [] };
const saved = { ...base, id: 'item-1', asset_id: 'a1', asset_code: 'ST002', asset_name: 'เทอร์โมมิเตอร์ ST002', planned_months: [1, 7], is_persisted: 1 };
const virtual = { ...base, id: 'virtual-a2', asset_id: 'a2', asset_code: 'SW001', asset_name: 'ตุ้มน้ำหนัก SW001', planned_months: [], remarks: '', is_persisted: 0 };
const withReason = { ...base, id: 'item-3', asset_id: 'a3', asset_code: 'TC001', asset_name: 'Temp controller', planned_months: [], remarks: 'ยังไม่ถึงกำหนดตามรอบความถี่', is_persisted: 1 };

describe('plan items: saved vs register-only rows', () => {
  it('isSavedPlanItem is true only for rows stored in the plan', () => {
    expect(isSavedPlanItem(saved)).toBe(true);
    expect(isSavedPlanItem(withReason)).toBe(true);
    expect(isSavedPlanItem(virtual)).toBe(false);
    expect(isSavedPlanItem({ id: 'virtual-x' })).toBe(false);
    expect(isSavedPlanItem(null)).toBe(false);
  });

  it('shows "นำออกจากแผน" only on rows that are saved in the plan, and says unsaved rows are still in the register', () => {
    const onDeleteItem = vi.fn();
    render(<AnnualPlanMatrixTable planItems={[saved, virtual, withReason]} activePlan={plan} workOrders={[]} canEditPlan onOpenAddItem={() => {}} onDeleteItem={onDeleteItem} onOpenGroupWorkOrderCheck={() => {}} />);

    const rowOf = (code) => screen.getByText(code).closest('tr');
    expect(within(rowOf('ST002')).getByRole('button', { name: 'นำออกจากแผน' })).toBeInTheDocument();
    expect(within(rowOf('TC001')).getByRole('button', { name: 'นำออกจากแผน' })).toBeInTheDocument();
    expect(within(rowOf('SW001')).queryByRole('button', { name: 'นำออกจากแผน' })).toBeNull();
    expect(within(rowOf('SW001')).getByText(/อยู่ในทะเบียนเครื่องมือ • ยังไม่บันทึกเข้าแผน/)).toBeInTheDocument();
    expect(within(rowOf('ST002')).queryByText(/ยังไม่บันทึกเข้าแผน/)).toBeNull();
    // the planned-with-reason row is labelled as such
    expect(within(rowOf('TC001')).getByText(/ไม่วางแผน \(ยังไม่ถึงกำหนดตามรอบความถี่\)/)).toBeInTheDocument();
    expect(within(rowOf('SW001')).getByText('ยังไม่ได้วางแผน')).toBeInTheDocument();

    // removing a saved row still asks for confirmation first
    fireEvent.click(within(rowOf('ST002')).getByRole('button', { name: 'นำออกจากแผน' }));
    expect(onDeleteItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันนำออกจากแผน' }));
    expect(onDeleteItem).toHaveBeenCalledWith(saved);
  });

  it('read-only users (cannot edit the plan) see no remove button at all', () => {
    render(<AnnualPlanMatrixTable planItems={[saved, virtual]} activePlan={plan} workOrders={[]} canEditPlan={false} onOpenAddItem={() => {}} onDeleteItem={() => {}} onOpenGroupWorkOrderCheck={() => {}} />);
    expect(screen.queryByRole('button', { name: /นำออกจากแผน/ })).toBeNull();
  });

  it('the overview cards split "no plan" into waiting for a reason and not planned with a reason', () => {
    render(
      <AnnualPlanOverviewCards activePlan={plan} planItems={[saved, virtual, withReason]} canEditPlan />
    );
    expect(screen.getByText(/รอระบุเหตุผล 1/)).toBeInTheDocument();
    expect(screen.getByText(/ไม่วางแผนพร้อมเหตุผล 1/)).toBeInTheDocument();
  });
});
