import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VccDashboardSection from '../components/VccDashboardSection';
import * as dashboardApi from '../api/vccDashboardApi';
import * as planApi from '../api/vccPlanApi';
import useStore from '../../../store/useStore';

vi.mock('../api/vccDashboardApi', async () => {
  const actual = await vi.importActual('../api/vccDashboardApi');
  return {
    ...actual,
    fetchVccDashboard: vi.fn(),
    fetchVccOnHoldTracker: vi.fn(),
    fetchVccComplianceReport: vi.fn(),
    exportVccAnnualPlanCsv: vi.fn(),
    exportVccWorkOrdersCsv: vi.fn()
  };
});

describe('VCC Dashboard Data-Driven Year Dropdown Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      currentUser: {
        id: 'qc1',
        name: 'QC Leader',
        department: 'QC',
        approval_level: 4,
        isDcc: false
      }
    });

    dashboardApi.fetchVccDashboard.mockResolvedValue({
      year: 2026,
      equipment_kpi: { active_assets: 5 },
      work_order_kpi: { total_work_orders: 10 },
      alerts: []
    });
  });

  it('renders data-driven year options sorted descending and excludes static phantom years', async () => {
    render(<VccDashboardSection />);

    const select = await screen.findByLabelText('เลือกปีแผน Dashboard');
    expect(select).toBeInTheDocument();

    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    
    // In local demo data, plans exist for 2026 and 2027
    expect(options).toContain('2027');
    expect(options).toContain('2026');

    // Must be in descending order: 2027 before 2026
    const idx2027 = options.indexOf('2027');
    const idx2026 = options.indexOf('2026');
    expect(idx2027).toBeLessThan(idx2026);

    // Must NOT contain static phantom years that have no plans (e.g. 2024, 2025, 2028)
    expect(options).not.toContain('2024');
    expect(options).not.toContain('2025');
    expect(options).not.toContain('2028');

    // Verifies Thai Buddhist Era format (4 digits)
    const optionLabels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent.trim());
    expect(optionLabels).toContain('2027 (พ.ศ. 2570)');
    expect(optionLabels).toContain('2026 (พ.ศ. 2569)');
  });

  it('updates dashboard query when user selects a different year', async () => {
    render(<VccDashboardSection />);

    const select = await screen.findByLabelText('เลือกปีแผน Dashboard');
    
    // Initial fetch for default year
    expect(dashboardApi.fetchVccDashboard).toHaveBeenCalledWith({ year: 2026 });

    // Change year to 2027
    fireEvent.change(select, { target: { value: '2027' } });

    await waitFor(() => {
      expect(dashboardApi.fetchVccDashboard).toHaveBeenCalledWith({ year: 2027 });
    });
  });

  it('dynamically adapts available years from fetchVccPlans results', async () => {
    const fetchSpy = vi.spyOn(planApi, 'fetchVccPlans').mockResolvedValueOnce([
      { id: 'p-2028', plan_year: 2028, status: 'APPROVED' },
      { id: 'p-2025', plan_year: 2025, status: 'DRAFT' }
    ]);

    render(<VccDashboardSection />);

    const select = await screen.findByLabelText('เลือกปีแผน Dashboard');

    await waitFor(() => {
      const options = Array.from(select.querySelectorAll('option')).map((o) => o.value);
      expect(options).toContain('2028');
      expect(options).toContain('2025');
      // Current year (2026) is preserved
      expect(options).toContain('2026');
      // Must be sorted descending: 2028, 2026, 2025
      expect(options).toEqual(['2028', '2026', '2025']);
    });

    fetchSpy.mockRestore();
  });
});
