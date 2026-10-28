import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AnnualPlanMonthCell from '../components/AnnualPlanMonthCell';
import AnnualPlanSideInspector from '../components/AnnualPlanSideInspector';
import { computeDueDateForMonth } from '../api/vccPlanApi';

describe('VCC FM-QC-46 Interactive Planning Board Edge Cases & Exceptions', () => {
  const samplePlan = {
    id: 'PLAN-2026-QC',
    plan_year: 2026,
    department: 'QC',
    document_code: 'FM-QC-46',
    revision: '01',
    status: 'APPROVED',
    due_date_rule: 'END_OF_MONTH'
  };

  const sampleItem = {
    id: 'ITEM-001',
    plan_id: 'PLAN-2026-QC',
    asset_id: 'ASSET-EQ-001',
    asset_code: 'EQ-001',
    asset_name: 'เครื่องวัดอุณหภูมิห้องเย็น 1',
    asset_type: 'เทอร์โมมิเตอร์',
    provider_name: 'ทวนสอบภายใน',
    frequency_label: 'ราย 6 เดือน',
    planned_months: [2, 3], // Planned in February and March
    due_dates: ['2026-02-28', '2026-03-31'],
    responsible_dept: 'QC',
    responsible_label: 'หัวหน้างาน QC',
    is_group: 0,
    status: 'ACTIVE'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Plan Month vs Actual Month mismatch: Plan Feb executed on 05/03/2026 renders P2✓ in Feb and A(ก.พ.) alongside P3 in March', () => {
    // Work order planned for Month 2 (Feb), but performed on 2026-03-05 (March)
    const delayedWo = {
      id: 'WO-2026-001',
      wo_code: 'WO-2026-001',
      plan_id: 'PLAN-2026-QC',
      plan_item_id: 'ITEM-001',
      asset_id: 'ASSET-EQ-001',
      planned_month: 2,
      due_date: '2026-02-28',
      original_due_date: '2026-02-28',
      status: 'CLOSED',
      result_status: 'PASS',
      performed_at: '2026-03-05',
      certificate_no: 'CER-2026-001',
      acceptance_criteria: '± 0.5 °C ตามเกณฑ์โรงงาน'
    };

    // Render February Cell (Month 2)
    const { unmount: unmountFeb } = render(
      <table>
        <tbody>
          <tr>
            <AnnualPlanMonthCell
              month={2}
              item={sampleItem}
              plan={samplePlan}
              workOrders={[delayedWo]}
              canEditPlan={false}
            />
          </tr>
        </tbody>
      </table>
    );

    // February preserves planned cycle (P2✓) indicating delayed completion in another month
    expect(screen.getByText('P2✓')).toBeInTheDocument();

    // Open February popover
    fireEvent.click(screen.getByText('P2✓'));
    expect(screen.getByText(/เสร็จสิ้นในเดือน มีนาคม/)).toBeInTheDocument();
    expect(screen.getByText(/CER-2026-001/)).toBeInTheDocument();
    expect(screen.getByText('2026-03-05')).toBeInTheDocument();

    unmountFeb();

    // Render March Cell (Month 3) which has its own plan (P3) AND receives delayed actual from Feb
    render(
      <table>
        <tbody>
          <tr>
            <AnnualPlanMonthCell
              month={3}
              item={sampleItem}
              plan={samplePlan}
              workOrders={[delayedWo]}
              canEditPlan={false}
            />
          </tr>
        </tbody>
      </table>
    );

    // Both badges must be visible in March: P3 (plan) and A(ก.พ.) (actual from Feb)
    expect(screen.getByText('P3')).toBeInTheDocument();
    expect(screen.getByText(/A\(ก\.พ\.\)/)).toBeInTheDocument();

    // Open March popover to verify contextual breakdown
    fireEvent.click(screen.getByText(/A\(ก\.พ\.\)/));
    expect(screen.getByText(/1\. รอบตามแผนประจำปี/)).toBeInTheDocument();
    expect(screen.getByText(/2\. การดำเนินงานจริงในเดือนนี้/)).toBeInTheDocument();
    expect(screen.getByText(/จากรอบแผน ก\.พ\. \(P2\)/)).toBeInTheDocument();
    expect(screen.getByText('2026-03-05')).toBeInTheDocument();
  });

  it('2. FAIL and ON_HOLD: Highlights cell in rose red with NC badge and shows warning in popover', () => {
    const failWo = {
      id: 'WO-2026-FAIL',
      wo_code: 'WO-2026-FAIL',
      plan_id: 'PLAN-2026-QC',
      plan_item_id: 'ITEM-001',
      asset_id: 'ASSET-EQ-001',
      planned_month: 2,
      due_date: '2026-02-28',
      status: 'CLOSED',
      result_status: 'FAIL',
      nc_status: 'OPEN',
      performed_at: '2026-02-20',
      certificate_no: 'CER-REJECT-01'
    };

    render(
      <table>
        <tbody>
          <tr>
            <AnnualPlanMonthCell
              month={2}
              item={sampleItem}
              plan={samplePlan}
              workOrders={[failWo]}
              canEditPlan={false}
            />
          </tr>
        </tbody>
      </table>
    );

    expect(screen.getByText('NC')).toBeInTheDocument();
    fireEvent.click(screen.getByText('NC'));
    expect(screen.getByText(/WO-2026-FAIL/)).toBeInTheDocument();
    expect(screen.getByText('FAIL')).toBeInTheDocument();
  });

  it('3. Group instrument enforcement: Opens group check modal instead of direct work order creation', () => {
    const groupItem = {
      ...sampleItem,
      id: 'ITEM-GROUP',
      asset_code: 'GRP-SCALE',
      asset_name: 'ชุดตาชั่งประจำไลน์',
      is_group: 1
    };

    const onOpenGroupCheck = vi.fn();

    render(
      <table>
        <tbody>
          <tr>
            <AnnualPlanMonthCell
              month={2}
              item={groupItem}
              plan={samplePlan}
              workOrders={[]}
              canEditPlan={false}
              onOpenGroupCheck={onOpenGroupCheck}
            />
          </tr>
        </tbody>
      </table>
    );

    fireEvent.click(screen.getByText('P2'));
    const groupCheckBtn = screen.getByRole('button', { name: /ตรวจรหัสลูกก่อนออกใบงาน/i });
    expect(groupCheckBtn).toBeInTheDocument();

    fireEvent.click(groupCheckBtn);
    expect(onOpenGroupCheck).toHaveBeenCalledWith(groupItem);
  });

  it('4. Quick Remove in Draft plan: Requires confirmation before triggering removal API', () => {
    const draftPlan = { ...samplePlan, status: 'DRAFT' };
    const onQuickRemoveMonth = vi.fn();

    render(
      <table>
        <tbody>
          <tr>
            <AnnualPlanMonthCell
              month={2}
              item={sampleItem}
              plan={draftPlan}
              workOrders={[]}
              canEditPlan={true}
              onQuickRemoveMonth={onQuickRemoveMonth}
            />
          </tr>
        </tbody>
      </table>
    );

    fireEvent.click(screen.getByText('P2'));
    const initialRemoveBtn = screen.getByRole('button', { name: /ยกเลิกรอบแผนเดือน 2/i });
    expect(initialRemoveBtn).toBeInTheDocument();

    // Clicking initial remove button shows confirmation UI, does NOT invoke callback immediately
    fireEvent.click(initialRemoveBtn);
    expect(onQuickRemoveMonth).not.toHaveBeenCalled();
    expect(screen.getByText(/ยืนยันยกเลิกรอบเดือน 2 ออกจากแผน\?/i)).toBeInTheDocument();

    // Clicking confirm invokes callback
    fireEvent.click(screen.getByRole('button', { name: /ยืนยันยกเลิก/i }));
    expect(onQuickRemoveMonth).toHaveBeenCalledWith(sampleItem, 2);
  });

  it('5. Boundary date calculations: Handles leap years and month-end dates accurately', () => {
    // 2024 is a leap year (Feb has 29 days)
    expect(computeDueDateForMonth(2024, 2, 'END_OF_MONTH')).toBe('2024-02-29');

    // 2025 and 2026 are common years (Feb has 28 days)
    expect(computeDueDateForMonth(2025, 2, 'END_OF_MONTH')).toBe('2025-02-28');
    expect(computeDueDateForMonth(2026, 2, 'END_OF_MONTH')).toBe('2026-02-28');

    // 30-day and 31-day months
    expect(computeDueDateForMonth(2026, 4, 'END_OF_MONTH')).toBe('2026-04-30');
    expect(computeDueDateForMonth(2026, 12, 'END_OF_MONTH')).toBe('2026-12-31');

    // START_OF_MONTH rule
    expect(computeDueDateForMonth(2026, 2, 'START_OF_MONTH')).toBe('2026-02-01');
  });

  it('6. AnnualPlanSideInspector: Accurately renders delayed execution and traceability details in 12-month schedule', () => {
    const delayedWo = {
      id: 'WO-2026-001',
      wo_code: 'WO-2026-001',
      plan_id: 'PLAN-2026-QC',
      plan_item_id: 'ITEM-001',
      asset_id: 'ASSET-EQ-001',
      planned_month: 2,
      due_date: '2026-02-28',
      status: 'CLOSED',
      result_status: 'PASS',
      performed_at: '2026-03-05',
      certificate_no: 'CER-2026-001'
    };

    render(
      <AnnualPlanSideInspector
        item={sampleItem}
        plan={samplePlan}
        workOrders={[delayedWo]}
        canEditPlan={false}
        onClose={vi.fn()}
      />
    );

    // Verifies asset specs and traceability
    expect(screen.getByText('EQ-001')).toBeInTheDocument();
    expect(screen.getByText('เครื่องวัดอุณหภูมิห้องเย็น 1')).toBeInTheDocument();

    // Verifies 12-month timeline notes the delayed execution in March
    expect(screen.getByText(/ดำเนินการจริงในเดือน มีนาคม/)).toBeInTheDocument();
    expect(screen.getByText(/CER-2026-001/)).toBeInTheDocument();
  });
});
