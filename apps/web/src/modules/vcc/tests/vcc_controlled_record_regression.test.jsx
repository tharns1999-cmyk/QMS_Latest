import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useStore from '../../../store/useStore';
import { getLocalAssets, resetVccLocalStore, setLocalAssets, writeJson, reactivateVccAsset } from '../api/vccApi';
import { fetchVccPlanDetail } from '../api/vccPlanApi';
import { approveVccWorkOrder, fetchVccWorkOrderDetail, getLocalWos, rejectVccWorkOrderAmendment, submitVccWorkOrderResult } from '../api/vccWorkOrderApi';
import { exportVccWorkOrdersCsv } from '../api/vccDashboardApi';
import DigitalRecordModal from '../components/DigitalRecordModal';

describe('VCC controlled records in the local demonstration', () => {
  beforeEach(() => {
    resetVccLocalStore();
    useStore.setState({ currentUser: { id: 'performer', name: '[ข้อมูลทดสอบ] performer', department: 'QC', approval_level: 4, isDcc: true }, approvalMatrix: [], masterDepartments: [{ code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' }] });
  });

  it('keeps form floors and takes higher central approval levels', async () => {
    expect((await fetchVccPlanDetail('vcc-plan-2026-qc')).thresholds).toMatchObject({ min_requester_level: 4, required_reviewer_level: 5, required_approver_level: 6 });
    useStore.setState({ approvalMatrix: [{ docType: 'FM', minRequesterLevel: 6, requiredReviewerLevel: 7, requiredApproverLevel: 8 }] });
    expect((await fetchVccPlanDetail('vcc-plan-2026-qc')).thresholds).toMatchObject({ min_requester_level: 6, required_reviewer_level: 7, required_approver_level: 8 });
  });

  it('keeps accepted instrument data in the record and export after register edits', async () => {
    const id = getLocalWos()[0].id;
    const payload = { performed_at: '2026-03-20', result_status: 'PASS', certificate_no: '[ข้อมูลทดสอบ] CERT', acceptance_criteria: '[ข้อมูลทดสอบ] criteria' };
    await submitVccWorkOrderResult(id, payload);
    useStore.setState({ currentUser: { id: 'reviewer', name: '[ข้อมูลทดสอบ] reviewer', department: 'QC', approval_level: 4, isDcc: true } });
    const accepted = await approveVccWorkOrder(id);
    setLocalAssets(getLocalAssets().map((asset) => asset.id === accepted.asset_id ? { ...asset, name: '[ข้อมูลทดสอบ] renamed', serial_no: 'NEW-SERIAL' } : asset));
    const { workOrder } = await fetchVccWorkOrderDetail(id);
    expect(workOrder.asset_name).toBe(accepted.asset_name);
    expect(workOrder.serial_no).toBe(accepted.serial_no);
    const csv = await exportVccWorkOrdersCsv();
    expect(csv).toContain(accepted.asset_name);
    expect(csv).not.toContain('[ข้อมูลทดสอบ] renamed');
    await expect(submitVccWorkOrderResult(id, payload)).rejects.toThrow(/สถานะ/);
    render(<DigitalRecordModal workOrder={workOrder} onClose={vi.fn()} />);
    expect(screen.getByText(accepted.asset_name)).toBeInTheDocument();
    expect(screen.queryByText('[ข้อมูลทดสอบ] renamed')).toBeNull();
  });

  it('labels legacy identity as current-register data and requires amendment rejection reasons', async () => {
    render(<DigitalRecordModal workOrder={{ wo_code: '[ข้อมูลทดสอบ] legacy', status: 'CLOSED', is_legacy_without_asset_snapshot: true }} onClose={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('อ้างอิงทะเบียนปัจจุบัน');
    await expect(rejectVccWorkOrderAmendment('legacy', null, { reason: '  ' })).rejects.toThrow(/เหตุผล/);
  });

  it('does not reactivate a retired instrument with an open NC', async () => {
    const wo = getLocalWos()[0];
    writeJson('qms-vcc-local-work-orders-v1', [{ ...wo, nc_status: 'OPEN' }]);
    setLocalAssets(getLocalAssets().map((asset) => asset.id === wo.asset_id ? { ...asset, status: 'RETIRED' } : asset));
    await expect(reactivateVccAsset(wo.asset_id, '[ข้อมูลทดสอบ] return')).rejects.toThrow(/NC/);
    expect(getLocalAssets().find((asset) => asset.id === wo.asset_id).status).toBe('RETIRED');
  });
});
