import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from '../api/vccWorkOrderApi';
import useStore from '../../../store/useStore';
import { WorkOrderSideDrawer } from '../components/WorkOrderSideDrawer';

const closedWo = {
  id: 'wo-amend-1', wo_code: 'WO-2027-001', asset_id: 'a1', asset_code: 'ST002', asset_name: 'Thermometer',
  department: 'QC', status: 'CLOSED', result_status: 'PASS', due_date: '2027-01-31', provider_name: 'Lab'
};
const pending = {
  id: 'req-1', work_order_id: 'wo-amend-1', status: 'PENDING', requested_by: 'qc4', requester_name: 'QC หัวหน้า',
  amendment_reason: 'แก้เลขใบรับรองตามฉบับจริง', created_at: '2027-01-05T03:00:00Z', proposed_changes: {}
};

const mountDrawer = (wo = closedWo, onAmendmentResolved = vi.fn()) =>
  render(
    <WorkOrderSideDrawer
      workOrder={wo} onClose={vi.fn()} thresholds={{}} onRecordResult={vi.fn()} onReschedule={vi.fn()}
      onApprove={vi.fn()} onReject={vi.fn()} onReleaseHold={vi.fn()} onAmend={vi.fn()} onDownloadCert={vi.fn()}
      onAmendmentResolved={onAmendmentResolved}
    />
  );

describe('VCC amendment requests: approvers can act on pending requests from the work-order drawer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useStore.setState({ currentUser: { id: 'qc6', name: 'QC ผู้จัดการ', department: 'QC', approval_level: 6, isDcc: false } });
    vi.spyOn(api, 'fetchVccWorkOrderDetail').mockResolvedValue({ workOrder: closedWo, history: [], thresholds: {} });
  });

  it('lists a pending request with its reason and lets another approver approve it', async () => {
    const list = vi.spyOn(api, 'fetchVccWorkOrderAmendmentRequests')
      .mockResolvedValueOnce([pending])
      .mockResolvedValue([{ ...pending, status: 'APPROVED' }]);
    const approve = vi.spyOn(api, 'approveVccWorkOrderAmendment').mockResolvedValue({ workOrder: closedWo });
    const resolved = vi.fn();
    mountDrawer(closedWo, resolved);

    expect(await screen.findByText('คำขอแก้ไขผลที่รออนุมัติ')).toBeInTheDocument();
    expect(screen.getByText('แก้เลขใบรับรองตามฉบับจริง')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'อนุมัติคำขอแก้ไข' }));

    await waitFor(() => expect(approve).toHaveBeenCalledWith('wo-amend-1', 'req-1', expect.any(Object)));
    await waitFor(() => expect(resolved).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'อนุมัติคำขอแก้ไข' })).not.toBeInTheDocument());
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('rejecting needs a reason, then calls the reject API', async () => {
    vi.spyOn(api, 'fetchVccWorkOrderAmendmentRequests').mockResolvedValue([pending]);
    const reject = vi.spyOn(api, 'rejectVccWorkOrderAmendment').mockResolvedValue({ status: 'REJECTED' });
    mountDrawer();

    const btn = await screen.findByRole('button', { name: 'ปฏิเสธคำขอแก้ไข' });
    fireEvent.click(btn);
    expect(reject).not.toHaveBeenCalled();
    expect(await screen.findByText('กรุณาระบุเหตุผลที่ปฏิเสธ')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('ความเห็นของผู้อนุมัติ'), { target: { value: 'ข้อมูลไม่ตรงใบรับรอง' } });
    fireEvent.click(screen.getByRole('button', { name: 'ปฏิเสธคำขอแก้ไข' }));
    await waitFor(() => expect(reject).toHaveBeenCalledWith('wo-amend-1', 'req-1', { comment: 'ข้อมูลไม่ตรงใบรับรอง' }));
  });

  it('the requester sees the request but gets no approve/reject buttons (segregation of duties)', async () => {
    useStore.setState({ currentUser: { id: 'qc4', name: 'QC หัวหน้า', department: 'QC', approval_level: 4 } });
    vi.spyOn(api, 'fetchVccWorkOrderAmendmentRequests').mockResolvedValue([pending]);
    mountDrawer();

    expect(await screen.findByText('แก้เลขใบรับรองตามฉบับจริง')).toBeInTheDocument();
    expect(screen.getByText(/รอผู้อนุมัติท่านอื่น/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'อนุมัติคำขอแก้ไข' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ปฏิเสธคำขอแก้ไข' })).not.toBeInTheDocument();
  });

  it('shows the server refusal instead of failing silently', async () => {
    vi.spyOn(api, 'fetchVccWorkOrderAmendmentRequests').mockResolvedValue([pending]);
    vi.spyOn(api, 'approveVccWorkOrderAmendment').mockRejectedValue(new Error('ผู้มีอำนาจขอแก้ไขใบสั่งงานที่ปิดแล้วต้องมีระดับอนุมัติ L5 ขึ้นไป'));
    mountDrawer();

    fireEvent.click(await screen.findByRole('button', { name: 'อนุมัติคำขอแก้ไข' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ต้องมีระดับอนุมัติ L5 ขึ้นไป');
    expect(screen.getByRole('button', { name: 'อนุมัติคำขอแก้ไข' })).toBeEnabled();
  });

  it('shows nothing when there is no pending request, and never loads for non-CLOSED work orders', async () => {
    const list = vi.spyOn(api, 'fetchVccWorkOrderAmendmentRequests').mockResolvedValue([{ ...pending, status: 'REJECTED' }]);
    const { unmount } = mountDrawer();
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(screen.queryByText('คำขอแก้ไขผลที่รออนุมัติ')).not.toBeInTheDocument();
    unmount();

    list.mockClear();
    vi.spyOn(api, 'fetchVccWorkOrderDetail').mockResolvedValue({ workOrder: { ...closedWo, status: 'OPEN' }, history: [], thresholds: {} });
    mountDrawer({ ...closedWo, status: 'OPEN' });
    await screen.findAllByText('WO-2027-001');
    expect(list).not.toHaveBeenCalled();
  });
});
