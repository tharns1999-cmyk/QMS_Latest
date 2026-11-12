import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { resetVccLocalStore } from '../api/vccApi';
import { approveVccWorkOrder, amendVccWorkOrder, getLocalWos, releaseVccWorkOrderHold, rescheduleVccWorkOrder, submitVccWorkOrderResult } from '../api/vccWorkOrderApi';
import { getAvailableMonthsForItem } from '../components/WorkOrderModals';
import { getCalibrationMethodLabel } from '../utils/statusLabels';

describe('VCC Phase 3 — Work Orders, Execution, Review, Close & Hold/NC Control', () => {
  beforeEach(() => {
    resetVccLocalStore();
    useStore.setState({
      currentUser: {
        id: 'dc4',
        name: 'DC หัวหน้า (DCC)',
        email: 'dc4@qms.local',
        role: 'STAFF',
        department: 'DC',
        position: 'Document Control Supervisor',
        approval_level: 4,
        approvalLevel: 4,
        isDcc: true,
        isQmr: false
      },
      masterDepartments: [
        { code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' },
        { code: 'WH', name_th: 'คลังสินค้า', status: 'ACTIVE' }
      ],
      approvalMatrix: [
        {
          docType: 'FM',
          minRequesterLevel: 1,
          requiredReviewerLevel: 4,
          requiredApproverLevel: 5
        }
      ]
    });
  });

  it('1. แยกลิสต์ใบสั่งงานตามสถานะ, บังคับกรอกเหตุผลเมื่อเลื่อนวันครบกำหนด, และเก็บวันครบกำหนดเดิม (original_due_date)', async () => {
    render(<AssetRegisterPage />);

    fireEvent.click(await screen.findByRole('button', { name: /ใบสั่งงานและบันทึกผล \(Work Orders\)/i }));

    // Seed WO-2026-001 (ST002) is in OPEN tab
    expect(await screen.findByText('WO-2026-001')).toBeInTheDocument();

    // Switching to CLOSED tab must NOT show OPEN work orders
    fireEvent.click(screen.getByRole('tab', { name: /ปิดงานแล้ว/i }));
    expect(await screen.findByText(/ไม่พบรายการใบสั่งงานในแท็บปิดงานแล้ว/i)).toBeInTheDocument();
    expect(screen.queryByText('WO-2026-001')).not.toBeInTheDocument();

    // Switch back to OPEN tab and test Reschedule mandatory reason
    fireEvent.click(screen.getByRole('tab', { name: /เปิดงาน \/ รอบันทึกผล/i }));
    // the action sits in the row's "more" menu: closed it is hidden from users and the keyboard, so open it first
    expect(screen.queryByRole('button', { name: /เลื่อนวันครบกำหนด/i })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /การจัดการเพิ่มเติมสำหรับ WO-2026-001/ }));
    fireEvent.click(await screen.findByRole('button', { name: /เลื่อนวันครบกำหนด/i }));

    const confirmBtn = await screen.findByRole('button', { name: 'ยืนยันการดำเนินการ' });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/วันครบกำหนดใหม่/i), { target: { value: '2026-04-15' } });
    fireEvent.change(screen.getByPlaceholderText(/ระบุรายละเอียด/i), { target: { value: 'รอคิวสอบเทียบจากห้องแล็บ' } });
    expect(confirmBtn).not.toBeDisabled();

    // Check DCC Direct Override checkbox to test immediate due date update
    const overrideChk = screen.queryByRole('checkbox', { name: /ดำเนินการเลื่อนทันที/i });
    if (overrideChk) fireEvent.click(overrideChk);

    fireEvent.click(confirmBtn);

    // Must display new due date and preserve original_due_date (2026-03-31)
    expect(await screen.findByText('2026-04-15')).toBeInTheDocument();
    expect(screen.getByText('2026-03-31')).toBeInTheDocument();
  });

  it('2. บังคับกรอกเลขที่ใบรับรองและเกณฑ์ยอมรับก่อนบันทึกผล และบันทึกผลแล้วปิดงานทันที พร้อมอัปเดตแถว Act. ในแผนประจำปี', async () => {
    render(<AssetRegisterPage />);

    fireEvent.click(await screen.findByRole('button', { name: /ใบสั่งงานและบันทึกผล \(Work Orders\)/i }));
    fireEvent.click(await screen.findByRole('button', { name: /บันทึกผลและใบรับรอง/i }));

    const submitResultBtn = await screen.findByRole('button', { name: /บันทึกผลและปิดใบงาน/i });
    expect(submitResultBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/วันที่ทวนสอบจริง/i), { target: { value: '2026-03-25' } });
    fireEvent.change(screen.getByLabelText(/เลขที่ใบรับรอง/i), { target: { value: 'CERT-ST002-2026' } });
    expect(submitResultBtn).not.toBeDisabled();
    fireEvent.click(submitResultBtn);

    // Moves directly to CLOSED tab
    expect(await screen.findByText('CERT-ST002-2026')).toBeInTheDocument();

    // Verify Annual Plan month 3 cell updated to green checkmark (✓)
    fireEvent.click(screen.getByRole('button', { name: /แผนการทวนสอบประจำปี \(FM-QC-46\)/i }));
    const m3Badges = await screen.findAllByRole('button', { name: /เป้าหมายทวนสอบเดือน 3 \(P3\)/i });
    expect(m3Badges.some((b) => b.textContent.includes('✓'))).toBe(true);
  }, 15000);

  it('3. เมื่อผลเป็น FAIL จะขึ้นสถานะระงับใช้ (ON_HOLD) ทันที ไม่ปลดระงับอัตโนมัติเมื่อปิดใบงาน และต้องใช้ผู้อนุมัติ L5+ พร้อมระบุการประเมินผลกระทบจึงจะปลดระงับได้', async () => {
    render(<AssetRegisterPage />);

    fireEvent.click(await screen.findByRole('button', { name: /ใบสั่งงานและบันทึกผล \(Work Orders\)/i }));
    fireEvent.click(await screen.findByRole('button', { name: /บันทึกผลและใบรับรอง/i }));

    fireEvent.click(screen.getByRole('button', { name: /ไม่ผ่านเกณฑ์ \(FAIL\)/i }));
    fireEvent.change(screen.getByLabelText(/เลขที่ใบรับรอง/i), { target: { value: 'CERT-FAIL-01' } });
    fireEvent.change(screen.getByPlaceholderText(/ระบุสาเหตุที่ไม่ผ่านเกณฑ์/i), { target: { value: 'ค่าคลาดเคลื่อนเกินเกณฑ์' } });
    fireEvent.click(screen.getByRole('button', { name: /ยืนยันผลไม่ผ่านเกณฑ์และระงับใช้/i }));

    // Immediately shows ON_HOLD badge
    expect(await screen.findByTestId('wo-hold-badge')).toBeInTheDocument();

    // The performer (dc4, L4): no release is offered, and the rule refuses it anyway
    expect(screen.queryByRole('button', { name: /ปลดระงับใช้/i })).not.toBeInTheDocument();
    const heldWo = getLocalWos().find((w) => w.nc_status === 'OPEN');
    await expect(releaseVccWorkOrderHold(heldWo.id, 'ประเมินแล้ว', 'สอบเทียบซ้ำผ่าน')).rejects.toThrow(/L5 ขึ้นไป/);

    // An L5 reviewer (qc5) releases the hold with both a reason and an impact assessment
    useStore.setState({
      currentUser: {
        id: 'qc5',
        name: 'QC ผู้ช่วยผู้จัดการ (L5)',
        role: 'STAFF',
        department: 'QC',
        approval_level: 5,
        approvalLevel: 5,
        isDcc: true
      }
    });

    fireEvent.click(await screen.findByRole('button', { name: /ปลดระงับใช้/i }));
    const confirmReleaseBtn = await screen.findByRole('button', { name: 'ยืนยันการดำเนินการ' });
    fireEvent.change(screen.getByPlaceholderText(/ระบุรายละเอียด/i), {
      target: { value: 'ตรวจสอบย้อนหลังแล้วไม่กระทบสินค้า' }
    });
    expect(confirmReleaseBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/เหตุผลการปลดระงับ/i), { target: { value: 'ซ่อมบำรุงและสอบเทียบซ้ำผ่านแล้ว' } });
    expect(confirmReleaseBtn).not.toBeDisabled();
    fireEvent.click(confirmReleaseBtn);

    await screen.findByText('WO-2026-001');
    expect(screen.queryByTestId('wo-hold-badge')).not.toBeInTheDocument();
    expect(getLocalWos().find((w) => w.id === heldWo.id).nc_status).toBe('RELEASED');
  });

  it('3b. เลื่อนกำหนดเป็นวันเดิมไม่ได้ (ไม่มีการเปลี่ยนแปลง) และไม่เขียนประวัติ', async () => {
    const wo = getLocalWos().find((w) => w.wo_code === 'WO-2026-001');
    await expect(rescheduleVccWorkOrder(wo.id, { new_due_date: wo.due_date, reason: 'เลื่อน' })).rejects.toThrow(/ไม่มีการเปลี่ยนแปลง/);
    const moved = await rescheduleVccWorkOrder(wo.id, { new_due_date: '2026-05-15', reason: 'รอคิวแล็บ' });
    expect(moved.due_date).toBe('2026-05-15');
    await expect(rescheduleVccWorkOrder(wo.id, { new_due_date: '2026-05-15', reason: 'กดซ้ำ' })).rejects.toThrow(/ไม่มีการเปลี่ยนแปลง/);
  });

  it('4. ผลรอตรวจซ้ำ (INCONCLUSIVE) ระงับใช้ทันที ผู้ตรวจรับปิดงานไม่ได้', async () => {
    const wo = getLocalWos().find((w) => w.wo_code === 'WO-2026-001');
    await submitVccWorkOrderResult(wo.id, {
      performed_at: '2026-03-25',
      result_status: 'INCONCLUSIVE',
      certificate_no: 'CERT-INC-01',
      acceptance_criteria: '± 0.05 mm'
    });
    const pendingWo = getLocalWos().find((w) => w.id === wo.id);
    expect(pendingWo.nc_status).toBe('OPEN');
    await expect(approveVccWorkOrder(pendingWo.id, 'ปิดงาน')).rejects.toThrow(/INCONCLUSIVE/);
  });

  it('5. ปุ่มยกเลิกใบสั่งงานแสดงเฉพาะ DCC หรือหัวหน้าแผนกเจ้าของงาน L4+ และต้องระบุเหตุผล', async () => {
    useStore.setState({
      currentUser: { id: 'qc2', name: 'QC พนักงาน (L2)', role: 'STAFF', department: 'QC', approval_level: 2, approvalLevel: 2, isDcc: false }
    });
    const { unmount } = render(<AssetRegisterPage />);
    fireEvent.click(await screen.findByRole('button', { name: /ใบสั่งงานและบันทึกผล \(Work Orders\)/i }));
    fireEvent.click(await screen.findByRole('button', { name: /การจัดการเพิ่มเติมสำหรับ WO-2026-001/ }));
    expect(screen.queryByRole('button', { name: /ยกเลิกใบสั่งงาน/ })).not.toBeInTheDocument();
    unmount();

    useStore.setState({
      currentUser: { id: 'qc4', name: 'QC หัวหน้า (L4)', role: 'STAFF', department: 'QC', approval_level: 4, approvalLevel: 4, isDcc: false }
    });
    render(<AssetRegisterPage />);
    fireEvent.click(await screen.findByRole('button', { name: /ใบสั่งงานและบันทึกผล \(Work Orders\)/i }));
    fireEvent.click(await screen.findByRole('button', { name: /การจัดการเพิ่มเติมสำหรับ WO-2026-001/ }));
    fireEvent.click(await screen.findByRole('button', { name: /ยกเลิกใบสั่งงาน/ }));

    const confirmBtn = await screen.findByRole('button', { name: 'ยืนยันการดำเนินการ' });
    expect(screen.getByText(/รอบในแผนประจำปียังอยู่/)).toBeInTheDocument();
    expect(confirmBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/ประเภทการยกเลิก/), { target: { value: 'AUTHORIZED_CANCEL' } });
    fireEvent.change(screen.getByPlaceholderText(/ระบุรายละเอียด/i), { target: { value: 'ออกใบงานซ้ำกับรอบเดิม' } });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(screen.queryByText('WO-2026-001')).not.toBeInTheDocument());
    const cancelled = getLocalWos().find((w) => w.wo_code === 'WO-2026-001');
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancellation_category: 'AUTHORIZED_CANCEL', cancellation_reason: 'ออกใบงานซ้ำกับรอบเดิม' });
  });

  it('6. getAvailableMonthsForItem: รองรับรอบเดือนซ้ำ [6, 6] และกรองเฉพาะใบงานที่อยู่ในแผนเดียวกัน', () => {
    const item = { id: 'item-1', asset_id: 'ast-1', months: [6, 6] };
    const planId = 'plan-2026';

    // 0 work orders -> both 6s available
    expect(getAvailableMonthsForItem(item, [], planId)).toEqual([6, 6]);

    // 1 work order in month 6 (OPEN) -> 1 remaining month 6 available
    const wos1 = [{ id: 'wo-1', plan_id: 'plan-2026', plan_item_id: 'item-1', planned_month: 6, status: 'OPEN' }];
    expect(getAvailableMonthsForItem(item, wos1, planId)).toEqual([6]);

    // Both work orders booked -> 0 remaining
    const wos2 = [
      { id: 'wo-1', plan_id: 'plan-2026', plan_item_id: 'item-1', planned_month: 6, status: 'OPEN' },
      { id: 'wo-2', plan_id: 'plan-2026', plan_item_id: 'item-1', planned_month: 6, status: 'CLOSED' }
    ];
    expect(getAvailableMonthsForItem(item, wos2, planId)).toEqual([]);

    // CANCELLED or SCHEDULED work order does not book the cycle
    const wos3 = [
      { id: 'wo-1', plan_id: 'plan-2026', plan_item_id: 'item-1', planned_month: 6, status: 'SCHEDULED' },
      { id: 'wo-2', plan_id: 'plan-2026', plan_item_id: 'item-1', planned_month: 6, status: 'CANCELLED' }
    ];
    expect(getAvailableMonthsForItem(item, wos3, planId)).toEqual([6, 6]);

    // Ad-hoc work order (plan_id is null) does NOT book the plan's cycles
    const wosAdHoc = [{ id: 'wo-adhoc', plan_id: null, asset_id: 'ast-1', planned_month: 6, status: 'OPEN' }];
    expect(getAvailableMonthsForItem(item, wosAdHoc, planId)).toEqual([6, 6]);
  });

  it('7. getCalibrationMethodLabel: แปลงค่า Raw Enum เช่น EXTERNAL_LAB เป็นข้อความภาษาไทยที่ถูกต้อง', () => {
    expect(getCalibrationMethodLabel('EXTERNAL_LAB')).toBe('ห้องปฏิบัติการภายนอก (External Lab)');
    expect(getCalibrationMethodLabel('IN_HOUSE')).toBe('ทวนสอบภายใน (In-House)');
    expect(getCalibrationMethodLabel('MANUFACTURER')).toBe('ผู้ผลิต/ตัวแทนจำหน่าย (Manufacturer)');
    expect(getCalibrationMethodLabel('ON_SITE')).toBe('สอบเทียบนอกสถานที่ (On-Site Calibration)');
    expect(getCalibrationMethodLabel('WI-CAL-01')).toBe('WI-CAL-01');
  });

  it('8. amendVccWorkOrder: รองรับ direct amendment บนใบสั่งงาน CLOSED และบันทึก audit log', async () => {
    const wo = getLocalWos().find((w) => w.wo_code === 'WO-2026-001');
    // First submit and close the work order
    await submitVccWorkOrderResult(wo.id, {
      performed_at: '2026-03-25',
      result_status: 'PASS',
      certificate_no: 'CERT-ORIGINAL',
      acceptance_criteria: '± 0.5 °C'
    });

    const closedWo = getLocalWos().find((w) => w.id === wo.id);
    expect(closedWo.status).toBe('CLOSED');

    // Direct amend
    const amended = await amendVccWorkOrder(closedWo.id, {
      direct: true,
      amendment_reason: 'แก้ไขเลขที่ใบรับรองที่พิมพ์ตกหล่น',
      certificate_no: 'CERT-CORRECTED',
      actual_result: '100.01 °C'
    });

    expect(amended.is_amended).toBe(1);
    expect(amended.certificate_no).toBe('CERT-CORRECTED');
    expect(amended.actual_result).toBe('100.01 °C');
    expect(amended.amendment_reason).toBe('แก้ไขเลขที่ใบรับรองที่พิมพ์ตกหล่น');
  });
});

