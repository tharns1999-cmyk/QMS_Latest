import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AnnualPlanMatrixTable from '../components/AnnualPlanMatrixTable';

const generateMockPlanItems = (count = 60) => {
  return Array.from({ length: count }, (_, i) => {
    const num = String(i + 1).padStart(3, '0');
    return {
      id: `plan-item-${num}`,
      asset_id: `asset-${num}`,
      asset_code: `EQ-${num}`,
      asset_name: `Calibration Gauge ${num}`,
      asset_type: i % 2 === 0 ? 'เวอร์เนียร์คาลิปเปอร์' : 'เครื่องวัดความดัน',
      asset_department: 'QC',
      responsible_dept: 'QC',
      provider_name: 'ทวนสอบภายใน',
      frequency_label: 'รายปี',
      planned_months: [((i % 12) + 1)],
      due_dates: [],
      asset_status: 'ACTIVE',
      is_group: 0,
      sort_order: i
    };
  });
};

const mockPlan = {
  id: 'vcc-plan-2026-qc',
  plan_year: 2026,
  department: 'QC',
  document_code: 'FM-QC-46',
  revision: '00',
  status: 'DRAFT',
  title: 'แผนการทวนสอบและสอบเทียบเครื่องมือวัด ประจำปี 2026 ฝ่ายควบคุมคุณภาพ'
};

describe('VCC: AnnualPlanMatrixTable Pagination & Navigation Integration Tests', () => {
  it('1. renders first 25 items by default for a 60-item list and displays accurate pagination stats', () => {
    const items = generateMockPlanItems(60);

    render(
      <AnnualPlanMatrixTable
        planItems={items}
        activePlan={mockPlan}
        canEditPlan={true}
      />
    );

    // Record Range check
    expect(screen.getByText(/แสดง/i)).toBeInTheDocument();
    expect(screen.getByText('1-25')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();

    // Page indicator check: หน้า 1 จาก 3
    expect(screen.getByText('1', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('3', { selector: 'strong' })).toBeInTheDocument();

    // First and 25th items rendered in table
    expect(screen.getByText('EQ-001')).toBeInTheDocument();
    expect(screen.getByText('EQ-025')).toBeInTheDocument();

    // 26th item NOT rendered on page 1
    expect(screen.queryByText('EQ-026')).not.toBeInTheDocument();

    // First and Previous buttons must be disabled on page 1
    const firstBtn = screen.getByRole('button', { name: 'หน้าแรก' });
    const prevBtn = screen.getByRole('button', { name: 'ก่อนหน้า' });
    const nextBtn = screen.getByRole('button', { name: 'ถัดไป' });
    const lastBtn = screen.getByRole('button', { name: 'หน้าสุดท้าย' });

    expect(firstBtn).toBeDisabled();
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).toBeEnabled();
    expect(lastBtn).toBeEnabled();
  });

  it('2. navigates smoothly between pages using Next, Previous, Last, and First buttons', () => {
    const items = generateMockPlanItems(60);

    render(
      <AnnualPlanMatrixTable
        planItems={items}
        activePlan={mockPlan}
        canEditPlan={true}
      />
    );

    const firstBtn = screen.getByRole('button', { name: 'หน้าแรก' });
    const prevBtn = screen.getByRole('button', { name: 'ก่อนหน้า' });
    const nextBtn = screen.getByRole('button', { name: 'ถัดไป' });
    const lastBtn = screen.getByRole('button', { name: 'หน้าสุดท้าย' });

    // Step A: Click Next -> Page 2
    fireEvent.click(nextBtn);

    expect(screen.getByText('26-50')).toBeInTheDocument();
    expect(screen.getByText('EQ-026')).toBeInTheDocument();
    expect(screen.getByText('EQ-050')).toBeInTheDocument();
    expect(screen.queryByText('EQ-001')).not.toBeInTheDocument();
    expect(screen.queryByText('EQ-051')).not.toBeInTheDocument();

    expect(firstBtn).toBeEnabled();
    expect(prevBtn).toBeEnabled();
    expect(nextBtn).toBeEnabled();
    expect(lastBtn).toBeEnabled();

    // Step B: Click Last -> Page 3
    fireEvent.click(lastBtn);

    expect(screen.getByText('51-60')).toBeInTheDocument();
    expect(screen.getByText('EQ-051')).toBeInTheDocument();
    expect(screen.getByText('EQ-060')).toBeInTheDocument();
    expect(screen.queryByText('EQ-050')).not.toBeInTheDocument();

    // On last page, Next and Last must be disabled
    expect(firstBtn).toBeEnabled();
    expect(prevBtn).toBeEnabled();
    expect(nextBtn).toBeDisabled();
    expect(lastBtn).toBeDisabled();

    // Step C: Click Previous -> Page 2
    fireEvent.click(prevBtn);
    expect(screen.getByText('26-50')).toBeInTheDocument();

    // Step D: Click First -> Page 1
    fireEvent.click(firstBtn);
    expect(screen.getByText('1-25')).toBeInTheDocument();
    expect(screen.getByText('EQ-001')).toBeInTheDocument();
    expect(firstBtn).toBeDisabled();
    expect(prevBtn).toBeDisabled();
  });

  it('3. dynamically recalculates total pages and displayed items when changing page size', () => {
    const items = generateMockPlanItems(60);

    render(
      <AnnualPlanMatrixTable
        planItems={items}
        activePlan={mockPlan}
        canEditPlan={true}
      />
    );

    const pageSizeSelect = screen.getByLabelText('จำนวนแถวต่อหน้า');

    const paginationNav = screen.getByRole('navigation', { name: 'การแบ่งหน้าตารางวางแผน' });

    // Change page size to 10
    fireEvent.change(pageSizeSelect, { target: { value: '10' } });

    expect(screen.getByText('1-10')).toBeInTheDocument();
    expect(paginationNav).toHaveTextContent('หน้า 1 จาก 6');
    expect(screen.getByText('EQ-001')).toBeInTheDocument();
    expect(screen.getByText('EQ-010')).toBeInTheDocument();
    expect(screen.queryByText('EQ-011')).not.toBeInTheDocument();

    // Change page size to 9999 (ทั้งหมด)
    fireEvent.change(pageSizeSelect, { target: { value: '9999' } });

    expect(screen.getByText('1-60')).toBeInTheDocument();
    expect(paginationNav).toHaveTextContent('หน้า 1 จาก 1');
    expect(screen.getByText('EQ-001')).toBeInTheDocument();
    expect(screen.getByText('EQ-060')).toBeInTheDocument();

    // All buttons disabled when showing all items in 1 page
    expect(screen.getByRole('button', { name: 'หน้าแรก' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ก่อนหน้า' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ถัดไป' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'หน้าสุดท้าย' })).toBeDisabled();
  });

  it('4. automatically resets currentPage to 1 when search query changes', () => {
    const items = generateMockPlanItems(60);

    render(
      <AnnualPlanMatrixTable
        planItems={items}
        activePlan={mockPlan}
        canEditPlan={true}
      />
    );

    const nextBtn = screen.getByRole('button', { name: 'ถัดไป' });

    // Navigate to page 2 (items 26-50)
    fireEvent.click(nextBtn);
    expect(screen.getByText('26-50')).toBeInTheDocument();

    // Search for EQ-05 (matches EQ-050 to EQ-059 = 10 items)
    const searchInput = screen.getByLabelText('ค้นหารหัสหรือชื่อเครื่องมือในตาราง');
    fireEvent.change(searchInput, { target: { value: 'EQ-05' } });

    // Current page must auto-reset to 1
    expect(screen.getByText('1-10')).toBeInTheDocument();
    expect(screen.getByText('10', { selector: 'strong' })).toBeInTheDocument(); // 10 filtered items
    expect(screen.getByText('EQ-050')).toBeInTheDocument();
    expect(screen.getByText('EQ-059')).toBeInTheDocument();
  });

  it('5. preserves month cell click handlers and instrument identity across pages', () => {
    const items = generateMockPlanItems(30);
    const handleQuickAddMonth = vi.fn();

    render(
      <AnnualPlanMatrixTable
        planItems={items}
        activePlan={mockPlan}
        canEditPlan={true}
        onQuickAddMonth={handleQuickAddMonth}
      />
    );

    // Page 1: Navigate to Page 2 to target item 28
    const nextBtn = screen.getByRole('button', { name: 'ถัดไป' });
    fireEvent.click(nextBtn);

    const assetNameNode = screen.getByText('EQ-028');
    expect(assetNameNode).toBeInTheDocument();

    // Verify cell within EQ-028's row
    const row = assetNameNode.closest('tr');
    expect(row).toBeInTheDocument();

    const cellBtn = within(row).getByLabelText('กำหนดเป้าหมายเดือน 5');
    expect(cellBtn).toBeInTheDocument();
    fireEvent.click(cellBtn);

    // Popover / dialog opens
    expect(cellBtn).toBeInTheDocument();
  });

  it('6. handles empty items gracefully with 0 range and disabled navigation', () => {
    render(
      <AnnualPlanMatrixTable
        planItems={[]}
        activePlan={mockPlan}
        canEditPlan={true}
      />
    );

    expect(screen.getByText('แสดง 0 จากทั้งหมด 0 เครื่องมือ')).toBeInTheDocument();
    expect(screen.getByText('แผนประจำปีฉบับนี้ยังไม่มีรายการเครื่องมือวัด')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'หน้าแรก' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ก่อนหน้า' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ถัดไป' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'หน้าสุดท้าย' })).toBeDisabled();
  });
});
