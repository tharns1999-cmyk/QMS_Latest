import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dashApi from '../api/vccDashboardApi';
import useStore from '../../../store/useStore';
import VccDashboardSection from '../components/VccDashboardSection';
import WorkOrderSection from '../components/WorkOrderSection';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { resetVccLocalStore } from '../api/vccApi';

// jsdom has no real layout, so these check the responsive classes that keep tabs on screen at 375px;
// the real-browser run checks the pixels.
const dcc = { id: 'dc4', name: 'DCC', department: 'DC', depts: ['DC'], approval_level: 4, isDcc: true };

describe('VCC tabs and titles stay on screen on a phone', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetVccLocalStore();
    useStore.setState({ currentUser: dcc, departments: [{ code: 'QC', name_th: 'QC', status: 'ACTIVE' }], masterDepartments: [{ code: 'QC', name_th: 'QC', status: 'ACTIVE' }] });
  });

  it('dashboard main tabs: two-by-two grid on a phone, the original single row from sm up', async () => {
    vi.spyOn(dashApi, 'fetchVccDashboard').mockResolvedValue({ equipment_kpi: {}, work_order_kpi: {}, certificate_kpi: {}, alerts: [], notification_settings: {}, monthly_comparison: [], department_breakdown: [] });
    render(<MemoryRouter><VccDashboardSection onNavigateToWorkOrders={() => {}} /></MemoryRouter>);
    const nav = await screen.findByRole('navigation', { name: 'Dashboard Tabs' });
    expect(nav.className).toContain('grid');
    expect(nav.className).toContain('grid-cols-2');
    expect(nav.className).toContain('sm:flex');
    expect(nav.className).toContain('sm:space-x-6');
    expect(nav.className).not.toMatch(/(^|\s)space-x-6/);
    expect(screen.getAllByTestId(/^main-tab-/)).toHaveLength(4);
  });

  it('work-order status tabs wrap on phones and portrait tablets instead of hiding tabs off-screen; one row from xl (1280px) up', async () => {
    render(<MemoryRouter><WorkOrderSection /></MemoryRouter>);
    const tablist = await screen.findByRole('tablist', { name: 'สถานะใบสั่งงาน' });
    expect(tablist.className).toContain('flex-wrap');
    expect(tablist.className).toContain('xl:flex-nowrap');
    expect(tablist.className).not.toMatch(/(^|\s)overflow-x-auto/);
    expect(tablist.className).toContain('xl:overflow-x-auto');
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  it('page title wraps instead of running off the screen (truncate does nothing on an inline span)', async () => {
    render(<MemoryRouter><AssetRegisterPage /></MemoryRouter>);
    const h1 = await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(h1.textContent.length).toBeGreaterThan(5));
    expect(h1.className).toContain('break-words');
    expect(h1.querySelector('.truncate')).toBeNull();
  });
});
