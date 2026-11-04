import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import AnnualPlanMatrixTable from '../components/AnnualPlanMatrixTable';
import VccPlanActualChart from '../components/VccPlanActualChart';
import VccDashboardSection from '../components/VccDashboardSection';
import * as dashApi from '../api/vccDashboardApi';

describe('VCC Responsive UX Round C Quality Verification Tests', () => {
  const originalInnerWidth = window.innerWidth;

  afterEach(() => {
    window.innerWidth = originalInnerWidth;
    vi.restoreAllMocks();
  });

  describe('1. AnnualPlanMatrixTable ViewMode Persistence & Sticky Column', () => {
    const mockPlan = { id: 101, year: 2026, status: 'DRAFT', revision: 0 };
    const mockPlanItems = [
      {
        id: 'item-1',
        asset_id: 1,
        asset_code: 'CAL-001',
        asset_name: 'Digital Caliper 150mm',
        asset_type: 'Dimension',
        provider_name: 'Internal Lab',
        responsible_dept: 'QC',
        asset_department: 'QC',
        is_group: 0,
        is_composite_set: 0,
        planned_months: [3, 9]
      },
      {
        id: 'item-2',
        asset_id: 2,
        asset_code: 'SET-002',
        asset_name: 'Gauge Block Set',
        asset_type: 'Dimension',
        provider_name: 'External Lab',
        responsible_dept: 'QC',
        asset_department: 'QC',
        is_group: 1,
        is_composite_set: 1,
        composite_details: '100 pcs',
        planned_months: [6]
      },
      {
        id: 'item-3',
        asset_id: 3,
        asset_code: 'GRP-003',
        asset_name: 'Pressure Gauge Group',
        asset_type: 'Pressure',
        provider_name: 'Internal Lab',
        responsible_dept: 'QC',
        asset_department: 'QC',
        is_group: 1,
        is_composite_set: 0,
        group_nature: 'LOGICAL_GROUP',
        planned_months: [1]
      }
    ];

    it('adapts viewMode on screen resize if user has not explicitly chosen a view mode', () => {
      window.innerWidth = 1024;
      render(
        <AnnualPlanMatrixTable
          activePlan={mockPlan}
          planItems={mockPlanItems}
          workOrders={[]}
          canEditPlan={true}
        />
      );

      // Desktop default: 12 months view mode
      expect(screen.getByText('ด.1')).toBeInTheDocument();
      expect(screen.getByText('ด.12')).toBeInTheDocument();

      // Simulate viewport resizing to mobile (e.g. 500px)
      act(() => {
        window.innerWidth = 500;
        window.dispatchEvent(new Event('resize'));
      });

      // Should automatically adapt to Quarterly view mode
      expect(screen.getByText(/Q1 \(ม\.ค\.-มี\.ค\.\)/i)).toBeInTheDocument();
      expect(screen.queryByText('ด.12')).not.toBeInTheDocument();
    });

    it('strictly preserves user explicit viewMode choice and does NOT revert on screen resize or device orientation', () => {
      window.innerWidth = 500; // start on mobile
      render(
        <AnnualPlanMatrixTable
          activePlan={mockPlan}
          planItems={mockPlanItems}
          workOrders={[]}
          canEditPlan={true}
        />
      );

      // Mobile default: Quarterly
      expect(screen.getByText(/Q1 \(ม\.ค\.-มี\.ค\.\)/i)).toBeInTheDocument();

      // User explicitly clicks "12 เดือน (เต็ม)"
      const full12MonthsBtn = screen.getByRole('button', { name: /12 เดือน \(เต็ม\)/i });
      fireEvent.click(full12MonthsBtn);

      // Should be in 12 months mode
      expect(screen.getByText('ด.12')).toBeInTheDocument();

      // Now simulate resizing screen back to desktop or rotating device
      act(() => {
        window.innerWidth = 1200;
        window.dispatchEvent(new Event('resize'));
      });
      expect(screen.getByText('ด.12')).toBeInTheDocument();

      // And simulate resizing back to narrow mobile (360px)
      act(() => {
        window.innerWidth = 360;
        window.dispatchEvent(new Event('resize'));
      });

      // User explicit choice of 12_MONTHS must be strictly preserved!
      expect(screen.getByText('ด.12')).toBeInTheDocument();
      expect(screen.queryByText(/Q1 \(ม\.ค\.-มี\.ค\.\)/i)).not.toBeInTheDocument();
    });

    it('renders responsive labels in sticky column preventing mobile overflow and verifies solid background against bleed-through', () => {
      window.innerWidth = 375;
      render(
        <AnnualPlanMatrixTable
          activePlan={mockPlan}
          planItems={mockPlanItems}
          workOrders={[]}
          canEditPlan={true}
        />
      );

      // Composite set responsive badges:
      // Contains both mobile-shortened span and desktop span
      const compBadges = screen.getAllByText('ชุดเครื่องมือ');
      expect(compBadges.length).toBeGreaterThan(0);
      expect(compBadges[0].className).toContain('inline sm:hidden');

      // Group badge responsive labels:
      const groupMobileBadges = screen.getAllByText('กลุ่ม');
      expect(groupMobileBadges.length).toBeGreaterThan(0);
      expect(groupMobileBadges[0].className).toContain('inline sm:hidden');

      // Sticky cells have solid opaque background and shadow delimiter
      const stickyHeader = screen.getByRole('columnheader', { name: /รายการเครื่องมือวัด/i });
      expect(stickyHeader.className).toContain('sticky left-0');
      expect(stickyHeader.className).toContain('bg-slate-50');

      const stickyCells = document.querySelectorAll('td.sticky');
      expect(stickyCells.length).toBe(mockPlanItems.length);
      stickyCells.forEach((cell) => {
        expect(cell.className).toMatch(/bg-(white|slate-50)/);
        expect(cell.className).toContain('group-hover:bg-slate-');
      });
    });
  });

  describe('2. VccPlanActualChart Horizontal Scroll Synchronization', () => {
    const sampleMonthlyData = [
      { month: 1, planned: 10, actual_closed: 8 },
      { month: 2, planned: 5, actual_closed: 5 },
      { month: 3, planned: 12, actual_closed: 10 },
      { month: 4, planned: 8, actual_closed: 7 },
      { month: 5, planned: 15, actual_closed: 14 },
      { month: 6, planned: 6, actual_closed: 6 },
      { month: 7, planned: 9, actual_closed: 9 },
      { month: 8, planned: 11, actual_closed: 8 },
      { month: 9, planned: 14, actual_closed: 13 },
      { month: 10, planned: 7, actual_closed: 7 },
      { month: 11, planned: 4, actual_closed: 3 },
      { month: 12, planned: 10, actual_closed: 9 }
    ];

    it('renders both the 12-month bars and month labels inside the unified scroll container', () => {
      render(<VccPlanActualChart monthlyComparison={sampleMonthlyData} year={2026} />);

      const scrollContainer = screen.getByTestId('vcc-chart-scroll-container');
      expect(scrollContainer).toBeInTheDocument();
      expect(scrollContainer.className).toContain('overflow-x-auto');

      // Verify month labels are inside the exact same scroll container
      const m1 = screen.getByText('ม.ค.');
      const m12 = screen.getByText('ธ.ค.');
      expect(scrollContainer).toContainElement(m1);
      expect(scrollContainer).toContainElement(m12);

      // Verify the inner container enforces minimum width for mobile synchronization
      const innerWrapper = scrollContainer.firstElementChild;
      expect(innerWrapper.className).toContain('min-w-[340px]');
      expect(innerWrapper.className).toContain('sm:min-w-0');
    });
  });

  describe('3. VccDashboardSection Layout Integrity without Restrictive Root Clipping', () => {
    it('does not apply overflow-x-hidden to root, ensuring layout is responsive by structural design', async () => {
      vi.spyOn(dashApi, 'fetchVccDashboard').mockResolvedValue({
        equipment_kpi: { total_assets: 25, active_assets: 23, on_hold_assets: 2 },
        work_order_kpi: { total_count: 30, completed_count: 20, overdue_count: 1 },
        certificate_kpi: { cert_valid_count: 18 },
        alerts: [],
        notification_settings: {},
        monthly_comparison: [],
        department_breakdown: []
      });

      render(<VccDashboardSection onNavigateToWorkOrders={() => {}} />);

      const section = await screen.findByTestId('vcc-dashboard-section');
      expect(section).toBeInTheDocument();
      // Verifies overflow-x-hidden is removed and replaced by min-w-0 w-full
      expect(section.className).not.toContain('overflow-x-hidden');
      expect(section.className).toContain('min-w-0');
      expect(section.className).toContain('w-full');
    });
  });
});
