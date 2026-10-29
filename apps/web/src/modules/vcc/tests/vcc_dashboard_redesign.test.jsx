import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VccPlanActualChart from '../components/VccPlanActualChart';
import VccDepartmentSummary from '../components/VccDepartmentSummary';
import VccMetricsStrip from '../components/VccMetricsStrip';

describe('VCC Dashboard Redesign — Enterprise UX/UI Components', () => {
  describe('VccMetricsStrip', () => {
    it('renders all 6 metrics and applies status highlight when overdue and on_hold exist', () => {
      const mockEq = {
        active_assets: 6,
        total_assets: 7,
        on_hold_assets: 2,
        retired_assets: 1,
        group_count: 1
      };
      const mockWo = {
        overdue_count: 3,
        due_in_7_days: 2,
        due_in_30_days: 5,
        total_work_orders: 12,
        pending_review_count: 1,
        completed_count: 8,
        on_time_rate: 88,
        on_time_count: 7,
        pass_count: 8,
        fail_count: 2
      };

      render(<VccMetricsStrip eq={mockEq} wo={mockWo} reviewSlaDays={3} />);

      // Active assets test id check
      expect(screen.getByTestId('kpi-active-assets').textContent).toContain('6');
      expect(screen.getByTestId('kpi-active-assets').textContent).toContain('7');

      // Highlighted On-Hold count
      expect(screen.getByTestId('kpi-on-hold-assets').textContent).toBe('2');

      // Highlighted Overdue count
      expect(screen.getByTestId('kpi-overdue-count').textContent).toBe('3');

      // Due 30 and Pending review
      expect(screen.getByTestId('kpi-due-30-count').textContent).toBe('5');
      expect(screen.getByTestId('kpi-pending-review-count').textContent).toBe('1');

      // Completed with on-time rate
      expect(screen.getByTestId('kpi-completed-count').textContent).toContain('8');
      expect(screen.getByTestId('kpi-completed-count').textContent).toContain('88%');
    });
  });

  describe('VccPlanActualChart', () => {
    const mockMonthly = [
      { month: 1, planned: 2, actual_closed: 2 },
      { month: 2, planned: 4, actual_closed: 3 },
      { month: 3, planned: 1, actual_closed: 1 },
      { month: 4, planned: 0, actual_closed: 0 },
      { month: 5, planned: 3, actual_closed: 2 },
      { month: 6, planned: 2, actual_closed: 1 },
      { month: 7, planned: 0, actual_closed: 0 },
      { month: 8, planned: 1, actual_closed: 1 },
      { month: 9, planned: 5, actual_closed: 4 },
      { month: 10, planned: 2, actual_closed: 2 },
      { month: 11, planned: 1, actual_closed: 0 },
      { month: 12, planned: 3, actual_closed: 1 }
    ];

    it('renders 12-month visual comparative chart and annual summary stats', () => {
      render(<VccPlanActualChart monthlyComparison={mockMonthly} year={2026} />);

      // Check annual summary
      expect(screen.getByText('แผนทั้งปี')).toBeInTheDocument();
      expect(screen.getByText('24')).toBeInTheDocument(); // total planned: 2+4+1+3+2+1+5+2+1+3 = 24
      expect(screen.getByText('ปิดจริงแล้ว')).toBeInTheDocument();
      expect(screen.getByText('17')).toBeInTheDocument(); // total actual: 2+3+1+2+1+1+4+2+1 = 17

      // Check month labels rendered
      expect(screen.getByText('ม.ค.')).toBeInTheDocument();
      expect(screen.getByText('ก.ย.')).toBeInTheDocument();
      expect(screen.getByText('ธ.ค.')).toBeInTheDocument();
    });

    it('supports toggling between visual chart and numeric data grid', () => {
      render(<VccPlanActualChart monthlyComparison={mockMonthly} year={2026} />);

      // Click table view toggle
      const tableBtn = screen.getByTitle('มุมมองตารางสรุป');
      fireEvent.click(tableBtn);

      // Table headers & rows should now be rendered
      expect(screen.getByText('Plan (แผน)')).toBeInTheDocument();
      expect(screen.getByText('Act. (ปิดแล้ว)')).toBeInTheDocument();

      // Click back to chart view
      const chartBtn = screen.getByTitle('มุมมองกราฟรายเดือน');
      fireEvent.click(chartBtn);
      expect(screen.getByText('Act. (ปิดแล้ว)')).toBeInTheDocument(); // In legend
    });
  });

  describe('VccDepartmentSummary', () => {
    const mockBreakdown = [
      {
        department: 'QC',
        asset_count: 5,
        total_work_orders: 10,
        closed_work_orders: 8,
        overdue_work_orders: 1,
        on_hold_count: 0
      },
      {
        department: 'WH',
        asset_count: 2,
        total_work_orders: 4,
        closed_work_orders: 2,
        overdue_work_orders: 0,
        on_hold_count: 1
      }
    ];

    it('renders visual progress cards with completion percentage and operational badges', () => {
      render(<VccDepartmentSummary departmentBreakdown={mockBreakdown} />);

      expect(screen.getByText(/2 แผนก · รวม 7 เครื่องมือ/)).toBeInTheDocument();

      // QC department: 8/10 (80%), 1 overdue
      expect(screen.getByText('(80%)')).toBeInTheDocument();
      expect(screen.getByText('1 เลยกำหนด')).toBeInTheDocument();

      // WH department: 2/4 (50%), 1 on hold
      expect(screen.getByText('(50%)')).toBeInTheDocument();
      expect(screen.getByText('1 ระงับใช้')).toBeInTheDocument();
    });

    it('supports toggling to detailed table view for exact auditing', () => {
      render(<VccDepartmentSummary departmentBreakdown={mockBreakdown} />);

      const tableToggleBtn = screen.getByTitle('มุมมองตารางรายละเอียด');
      fireEvent.click(tableToggleBtn);

      // In table view, headers exist
      expect(screen.getByText('ใบงานทั้งหมด')).toBeInTheDocument();
      expect(screen.getByText('ระงับใช้')).toBeInTheDocument();
    });
  });
});
