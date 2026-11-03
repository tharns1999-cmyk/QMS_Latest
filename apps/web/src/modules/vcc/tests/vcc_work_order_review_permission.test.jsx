import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from '../api/vccWorkOrderApi';
import useStore from '../../../store/useStore';
import { WorkOrderSideDrawer } from '../components/WorkOrderSideDrawer';
import { WorkOrderTable } from '../components/WorkOrderTable';
import { canReviewWorkOrder } from '../utils/workOrderPermissions';

const thresholds = { required_reviewer_level: 4, required_approver_level: 5 };
const wo = {
  id: 'wo-1', wo_code: 'WO-2027-001', asset_id: 'a1', asset_code: 'ST002', asset_name: 'Thermometer', department: 'QC',
  status: 'PENDING_REVIEW', result_status: 'PASS', performed_by: 'qc2', due_date: '2027-01-31', provider_name: 'Lab'
};
const user = (over) => ({ id: 'qc4', name: 'QC หัวหน้า', department: 'QC', depts: ['QC'], approval_level: 4, ...over });

describe('canReviewWorkOrder mirrors the server rule for closing / sending back a result', () => {
  it('allows a same-department reviewer at or above the reviewer level', () => {
    expect(canReviewWorkOrder(user(), wo, thresholds)).toBe(true);
    expect(canReviewWorkOrder(user({ approval_level: 5 }), wo, thresholds)).toBe(true);
  });
  it('refuses the person who recorded the result, even at a high level', () => {
    expect(canReviewWorkOrder(user({ id: 'qc2', approval_level: 6 }), wo, thresholds)).toBe(false);
  });
  it('refuses a level below the reviewer level', () => {
    expect(canReviewWorkOrder(user({ id: 'qc3', approval_level: 2 }), wo, thresholds)).toBe(false);
  });
  it('refuses another department below L6, but keeps L6+ and DCC with enough level (existing policy)', () => {
    expect(canReviewWorkOrder(user({ id: 'lb4', department: 'LB', depts: ['LB'] }), wo, thresholds)).toBe(false);
    expect(canReviewWorkOrder(user({ id: 'lb6', department: 'LB', depts: ['LB'], approval_level: 6 }), wo, thresholds)).toBe(true);
    expect(canReviewWorkOrder(user({ id: 'dcc', department: 'DC', depts: ['DC'], isDcc: true }), wo, thresholds)).toBe(true);
  });
  it('follows a changed reviewer level from settings (nothing hardcoded)', () => {
    expect(canReviewWorkOrder(user({ approval_level: 4 }), wo, { required_reviewer_level: 5 })).toBe(false);
  });
  it('refuses a missing user or work order', () => {
    expect(canReviewWorkOrder(null, wo, thresholds)).toBe(false);
    expect(canReviewWorkOrder(user(), null, thresholds)).toBe(false);
  });
});

describe('close / send-back buttons are shown only to people who can use them', () => {
  const tableProps = {
    loading: false, workOrders: [wo], thresholds, onRowClick: vi.fn(), onRecordResult: vi.fn(), onReschedule: vi.fn(),
    onApprove: vi.fn(), onReject: vi.fn(), onReleaseHold: vi.fn(), onAmend: vi.fn(), onViewDigitalRecord: vi.fn()
  };
  const drawerProps = {
    workOrder: wo, onClose: vi.fn(), thresholds, onRecordResult: vi.fn(), onReschedule: vi.fn(), onApprove: vi.fn(),
    onReject: vi.fn(), onReleaseHold: vi.fn(), onAmend: vi.fn(), onDownloadCert: vi.fn()
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'fetchVccWorkOrderDetail').mockResolvedValue({ workOrder: wo, history: [], thresholds });
    vi.spyOn(api, 'fetchVccWorkOrderAmendmentRequests').mockResolvedValue([]);
  });

  it('table: the reviewer sees the close button; the performer and a level-2 colleague see a waiting note instead', () => {
    useStore.setState({ currentUser: user() });
    const { unmount } = render(<WorkOrderTable {...tableProps} />);
    expect(screen.getByRole('button', { name: /ตรวจรับปิดงาน/ })).toBeInTheDocument();
    unmount();

    for (const u of [user({ id: 'qc2', approval_level: 2 }), user({ id: 'qc3', approval_level: 2 })]) {
      useStore.setState({ currentUser: u });
      const r = render(<WorkOrderTable {...tableProps} />);
      expect(screen.queryByRole('button', { name: /ตรวจรับปิดงาน/ })).not.toBeInTheDocument();
      expect(screen.getAllByText('รอผู้ตรวจรับ').length).toBeGreaterThan(0);
      r.unmount();
    }
  });

  it('drawer: close and send-back follow the same rule', async () => {
    useStore.setState({ currentUser: user({ id: 'qc2', approval_level: 2 }) });
    const { unmount } = render(<WorkOrderSideDrawer {...drawerProps} />);
    await screen.findAllByText('WO-2027-001');
    expect(screen.queryByRole('button', { name: /ตรวจรับปิดงาน/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ส่งกลับแก้ไข/ })).not.toBeInTheDocument();
    unmount();

    useStore.setState({ currentUser: user() });
    render(<WorkOrderSideDrawer {...drawerProps} />);
    expect(await screen.findByRole('button', { name: /ตรวจรับปิดงาน/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ส่งกลับแก้ไข/ })).toBeInTheDocument();
  });
});
