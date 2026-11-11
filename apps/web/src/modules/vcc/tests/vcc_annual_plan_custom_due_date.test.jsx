import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AnnualPlanMonthCell from '../components/AnnualPlanMonthCell';

describe('VCC Annual Plan Custom Due Date in Quick Popover (AnnualPlanMonthCell)', () => {
  const samplePlan2026 = {
    id: 'PLAN-2026-QC',
    plan_year: 2026,
    department: 'QC',
    document_code: 'FM-QC-46',
    revision: '00',
    status: 'DRAFT',
    due_date_rule: 'END_OF_MONTH'
  };

  const samplePlanLeap2028 = {
    id: 'PLAN-2028-QC',
    plan_year: 2028,
    department: 'QC',
    document_code: 'FM-QC-46',
    revision: '00',
    status: 'DRAFT',
    due_date_rule: 'END_OF_MONTH'
  };

  const sampleApprovedPlan = {
    id: 'PLAN-2026-APPROVED',
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
    asset_name: 'เครื่องวัดอุณหภูมิห้องเย็น',
    asset_type: 'เทอร์โมมิเตอร์',
    provider_name: 'ทวนสอบภายใน',
    frequency_label: 'ราย 6 เดือน',
    planned_months: [2, 5],
    due_dates: ['2026-02-28', '2026-05-31'],
    responsible_dept: 'QC',
    status: 'ACTIVE'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Editable Popover in Draft plan: renders date input bounded by month and 3 preset chips', () => {
    const onUpdateDueDate = vi.fn();

    render(
      <table>
        <tbody>
          <tr>
            <AnnualPlanMonthCell
              month={5}
              item={sampleItem}
              plan={samplePlan2026}
              workOrders={[]}
              canEditPlan={true}
              onUpdateDueDate={onUpdateDueDate}
            />
          </tr>
        </tbody>
      </table>
    );

    // Open Month 5 popover
    const badge = screen.getByRole('button', { name: /เป้าหมายทวนสอบเดือน 5 \(P5\)/i });
    fireEvent.click(badge);

    // Verify Date Input exists with correct month boundaries
    const dateInput = screen.getByLabelText('กำหนดวันครบกำหนดรอบ');
    expect(dateInput).toBeInTheDocument();
    expect(dateInput).toHaveAttribute('type', 'date');
    expect(dateInput).toHaveAttribute('min', '2026-05-01');
    expect(dateInput).toHaveAttribute('max', '2026-05-31');
    expect(dateInput).toHaveValue('2026-05-31');

    // Verify 3 preset chips
    const chipStart = screen.getByRole('button', { name: 'ต้นเดือน (1)' });
    const chipMid = screen.getByRole('button', { name: 'กลางเดือน (15)' });
    const chipEnd = screen.getByRole('button', { name: 'สิ้นเดือน (Default)' });

    expect(chipStart).toBeInTheDocument();
    expect(chipMid).toBeInTheDocument();
    expect(chipEnd).toBeInTheDocument();
  });

  it('2. Clicking preset chips triggers onUpdateDueDate with exact calculated dates', () => {
    const onUpdateDueDate = vi.fn();

    render(
      <table>
        <tbody>
          <tr>
            <AnnualPlanMonthCell
              month={5}
              item={sampleItem}
              plan={samplePlan2026}
              workOrders={[]}
              canEditPlan={true}
              onUpdateDueDate={onUpdateDueDate}
            />
          </tr>
        </tbody>
      </table>
    );

    const badge = screen.getByRole('button', { name: /เป้าหมายทวนสอบเดือน 5 \(P5\)/i });
    fireEvent.click(badge);

    // Click Mid-Month chip (15)
    const chipMid = screen.getByRole('button', { name: 'กลางเดือน (15)' });
    fireEvent.click(chipMid);
    expect(onUpdateDueDate).toHaveBeenCalledWith(sampleItem, 5, '2026-05-15');

    // Click Start-of-Month chip (1)
    const chipStart = screen.getByRole('button', { name: 'ต้นเดือน (1)' });
    fireEvent.click(chipStart);
    expect(onUpdateDueDate).toHaveBeenCalledWith(sampleItem, 5, '2026-05-01');
  });

  it('3. Accurate leap-year calculation: February 2028 calculates 2028-02-29 and 2026 calculates 2026-02-28', () => {
    const onUpdateDueDate = vi.fn();

    const leapItem = {
      ...sampleItem,
      plan_id: 'PLAN-2028-QC',
      due_dates: ['2028-02-29']
    };

    render(
      <table>
        <tbody>
          <tr>
            <AnnualPlanMonthCell
              month={2}
              item={leapItem}
              plan={samplePlanLeap2028}
              workOrders={[]}
              canEditPlan={true}
              onUpdateDueDate={onUpdateDueDate}
            />
          </tr>
        </tbody>
      </table>
    );

    const badge = screen.getByRole('button', { name: /เป้าหมายทวนสอบเดือน 2 \(P2\)/i });
    fireEvent.click(badge);

    const dateInput = screen.getByLabelText('กำหนดวันครบกำหนดรอบ');
    expect(dateInput).toHaveAttribute('min', '2028-02-01');
    expect(dateInput).toHaveAttribute('max', '2028-02-29');

    const chipEnd = screen.getByRole('button', { name: 'สิ้นเดือน (Default)' });
    fireEvent.click(chipEnd);
    expect(onUpdateDueDate).toHaveBeenCalledWith(leapItem, 2, '2028-02-29');
  });

  it('4. Read-only in Approved plan: date input and presets are not rendered, shows read-only due date text', () => {
    render(
      <table>
        <tbody>
          <tr>
            <AnnualPlanMonthCell
              month={5}
              item={sampleItem}
              plan={sampleApprovedPlan}
              workOrders={[]}
              canEditPlan={false}
            />
          </tr>
        </tbody>
      </table>
    );

    const badge = screen.getByRole('button', { name: /เป้าหมายทวนสอบเดือน 5 \(P5\)/i });
    fireEvent.click(badge);

    // Date input and preset chips must NOT exist
    expect(screen.queryByLabelText('กำหนดวันครบกำหนดรอบ')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ต้นเดือน (1)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'กลางเดือน (15)' })).not.toBeInTheDocument();

    // Read-only text is present
    expect(screen.getByText(/วันครบกำหนดตามเกณฑ์:/)).toBeInTheDocument();
  });
});
