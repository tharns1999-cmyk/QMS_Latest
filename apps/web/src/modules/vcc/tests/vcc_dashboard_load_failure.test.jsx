import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dashApi from '../api/vccDashboardApi';
import useStore from '../../../store/useStore';
import VccDashboardSection from '../components/VccDashboardSection';

const goodData = {
  equipment_kpi: { total: 13, active: 12 },
  work_order_kpi: { overdue: 1 },
  certificate_kpi: {},
  alerts: [],
  notification_settings: {},
  monthly_comparison: [],
  department_breakdown: []
};

const mount = () => render(<MemoryRouter><VccDashboardSection onNavigateToWorkOrders={() => {}} /></MemoryRouter>);

describe('VCC dashboard: a failed load is shown as a failure, never as zero KPIs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useStore.setState({ currentUser: { id: 'dc4', name: 'DCC', department: 'DC', approval_level: 4, isDcc: true } });
  });

  it('shows the failure with a retry button and hides KPI cards, alert list and charts', async () => {
    vi.spyOn(dashApi, 'fetchVccDashboard').mockRejectedValue(new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'));
    mount();

    const panel = await screen.findByTestId('dashboard-load-failed');
    expect(panel).toHaveTextContent('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    expect(screen.getByRole('button', { name: 'ลองใหม่อีกครั้ง' })).toBeInTheDocument();
    expect(screen.queryByText('เครื่องมือปกติ')).not.toBeInTheDocument();
    expect(screen.queryByTestId('alert-empty-state')).not.toBeInTheDocument();
    expect(screen.queryByText('ศูนย์แจ้งเตือนตามกติกา QMS')).not.toBeInTheDocument();
  });

  it('retry loads the dashboard and the failure panel goes away', async () => {
    const fetchSpy = vi.spyOn(dashApi, 'fetchVccDashboard')
      .mockRejectedValueOnce(new Error('HTTP 500'))
      .mockResolvedValue(goodData);
    mount();

    fireEvent.click(await screen.findByRole('button', { name: 'ลองใหม่อีกครั้ง' }));
    await waitFor(() => expect(screen.queryByTestId('dashboard-load-failed')).not.toBeInTheDocument());
    expect(await screen.findByText('เครื่องมือปกติ')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('a refresh that fails after a good load clears the old numbers instead of leaving stale ones', async () => {
    vi.spyOn(dashApi, 'fetchVccDashboard')
      .mockResolvedValueOnce(goodData)
      .mockRejectedValue(new Error('HTTP 500'));
    mount();

    expect(await screen.findByText('เครื่องมือปกติ')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('รีเฟรชข้อมูล'));
    expect(await screen.findByTestId('dashboard-load-failed')).toBeInTheDocument();
    expect(screen.queryByText('เครื่องมือปกติ')).not.toBeInTheDocument();
  });
});
