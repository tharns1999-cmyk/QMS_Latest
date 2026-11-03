import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';
import * as dashboardApi from '../api/vccDashboardApi';
import VccDashboardSection from '../components/VccDashboardSection';
import MobileCollapsible from '../components/MobileCollapsible';
import { WorkOrderTable } from '../components/WorkOrderTable';
import { getWorkOrderStatusLabel, getResultStatusLabel, getAssetStatusLabel, WORK_ORDER_STATUS_LABELS } from '../utils/statusLabels';

const alert = (alert_type, wo_code) => ({ dedupe_key: `${alert_type}:${wo_code}`, alert_type, wo_code, asset_code: 'ST002', asset_name: 'เครื่องชั่ง', department: 'QC', due_date: '2026-12-31', message: wo_code });

describe('status labels', () => {
  it('every status has one Thai name and an unknown code still shows instead of disappearing', () => {
    for (const label of Object.values(WORK_ORDER_STATUS_LABELS)) expect(label).toMatch(/^[฀-๿ ]+$/);
    expect(getWorkOrderStatusLabel('SCHEDULED')).toBe('ตามแผน');
    expect(getResultStatusLabel('INCONCLUSIVE')).toBe('รอผลตรวจซ้ำ');
    expect(getAssetStatusLabel('RETIRED')).toBe('ปลดออกแล้ว');
    expect(getWorkOrderStatusLabel('NEW_CODE')).toBe('NEW_CODE');
    expect(getWorkOrderStatusLabel(null)).toBe('-');
  });

  it('the work-order table shows Thai names, never the codes', () => {
    useStore.setState({ currentUser: { id: 'qc4', department: 'QC', depts: ['QC'], approval_level: 4 } });
    const base = { asset_id: 'a', asset_code: 'ST002', asset_name: 'เครื่องชั่ง', department: 'QC', due_date: '2099-01-31', provider_name: 'Lab', result_status: 'PENDING' };
    const workOrders = [
      { ...base, id: '1', wo_code: 'WO-1', status: 'SCHEDULED' },
      { ...base, id: '2', wo_code: 'WO-2', status: 'CLOSED', result_status: 'FAIL', nc_status: 'OPEN', performed_by: 'x' },
      { ...base, id: '3', wo_code: 'WO-3', status: 'PENDING_REVIEW', result_status: 'INCONCLUSIVE', performed_by: 'x' }
    ];
    const noop = vi.fn();
    const { container } = render(
      <WorkOrderTable loading={false} workOrders={workOrders} thresholds={{ required_reviewer_level: 4, required_approver_level: 5 }} onRowClick={noop} onRecordResult={noop} onReschedule={noop} onApprove={noop} onReject={noop} onReleaseHold={noop} onAmend={noop} onViewDigitalRecord={noop} />
    );
    for (const name of ['ตามแผน', 'ปิดงานแล้ว', 'รอตรวจรับ', 'ระงับใช้', 'ไม่ผ่านเกณฑ์', 'รอผลตรวจซ้ำ']) expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/SCHEDULED|PENDING_REVIEW|CLOSED|ON_HOLD|INCONCLUSIVE|\bFAIL\b/);
  });
});

describe('dashboard alert tabs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useStore.setState({ currentUser: { id: 'dcc', department: 'DC', depts: ['DC'], isDcc: true, approval_level: 5 } });
  });
  const open = (alerts) => {
    vi.spyOn(dashboardApi, 'fetchVccDashboard').mockResolvedValue({ alerts, equipment_kpi: {}, work_order_kpi: {}, certificate_kpi: {} });
    render(<VccDashboardSection />);
  };

  it('opens on the first category that has work, not an empty one', async () => {
    open([alert('DUE_SOON', 'WO-SOON')]);
    expect(await screen.findByTestId('alert-list-DUE_SOON')).toHaveTextContent('WO-SOON');
  });

  it('keeps the tab the user picked, even when it is empty', async () => {
    open([alert('DUE_SOON', 'WO-SOON')]);
    await screen.findByTestId('alert-list-DUE_SOON');
    fireEvent.click(screen.getByTestId('alert-tab-OVERDUE'));
    await waitFor(() => expect(screen.getByTestId('alert-empty-state')).toBeInTheDocument());
  });

  it('falls back to the first category when nothing is due', async () => {
    open([]);
    await screen.findByTestId('alert-empty-state');
    expect(screen.getByTestId('alert-tab-OVERDUE').className).toContain('border-slate-900');
  });
});

describe('MobileCollapsible', () => {
  it('stays hidden on phones until opened, and is always shown from md up', () => {
    render(<MobileCollapsible summary="คำอธิบาย"><p>เนื้อหา</p></MobileCollapsible>);
    const toggle = screen.getByRole('button', { name: 'คำอธิบาย' });
    const panel = screen.getByText('เนื้อหา').parentElement;
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(panel.className).toContain('hidden');
    expect(panel.className).toContain('md:block');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(panel.className.split(' ')).not.toContain('hidden');
  });
});
