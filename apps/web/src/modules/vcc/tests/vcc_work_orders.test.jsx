import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { resetVccLocalStore } from '../api/vccApi';
import { approveVccWorkOrder, getLocalWos, releaseVccWorkOrderHold, rescheduleVccWorkOrder } from '../api/vccWorkOrderApi';

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
    fireEvent.click(screen.getByRole('tab', { name: /ตรวจรับปิดงานแล้ว \(CLOSED\)/i }));
    expect(await screen.findByText(/ไม่พบรายการใบสั่งงานในแท็บ CLOSED/i)).toBeInTheDocument();
    expect(screen.queryByText('WO-2026-001')).not.toBeInTheDocument();

    // Switch back to OPEN tab and test Reschedule mandatory reason
    fireEvent.click(screen.getByRole('tab', { name: /เปิดงาน \/ รอบันทึกผล \(OPEN\)/i }));
    // the action sits in the row's "more" menu: closed it is hidden from users and the keyboard, so open it first
    expect(screen.queryByRole('button', { name: /เลื่อนวันครบกำหนด/i })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /การจัดการเพิ่มเติมสำหรับ WO-2026-001/ }));
    fireEvent.click(await screen.findByRole('button', { name: /เลื่อนวันครบกำหนด/i }));

    const confirmBtn = await screen.findByRole('button', { name: 'ยืนยันการดำเนินการ' });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/วันครบกำหนดใหม่/i), { target: { value: '2026-04-15' } });
    fireEvent.change(screen.getByPlaceholderText(/ระบุรายละเอียด/i), { target: { value: 'รอคิวสอบเทียบจากห้องแล็บ' } });
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);

    // Must display new due date and preserve original_due_date (2026-03-31)
    expect(await screen.findByText('2026-04-15')).toBeInTheDocument();
    expect(screen.getByText('2026-03-31')).toBeInTheDocument();
  });

  it('2. บังคับกรอกเลขที่ใบรับรองและเกณฑ์ยอมรับก่อนส่งตรวจรับ, ห้ามผู้บันทึกผลตรวจรับงานตัวเอง, และเมื่อผู้ตรวจรับอนุมัติปิดงานจะอัปเดตแถว Act. ในแผนประจำปี', async () => {
    render(<AssetRegisterPage />);

    fireEvent.click(await screen.findByRole('button', { name: /ใบสั่งงานและบันทึกผล \(Work Orders\)/i }));
    fireEvent.click(await screen.findByRole('button', { name: /บันทึกผลและใบรับรอง/i }));

    const submitResultBtn = await screen.findByRole('button', { name: /ส่งผลให้ผู้ตรวจรับพิจารณา/i });
    expect(submitResultBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/วันที่ทวนสอบจริง/i), { target: { value: '2026-03-25' } });
    fireEvent.change(screen.getByLabelText(/เลขที่ใบรับรอง/i), { target: { value: 'CERT-ST002-2026' } });
    expect(submitResultBtn).not.toBeDisabled();
    fireEvent.click(submitResultBtn);

    // Moves to PENDING_REVIEW tab (not CLOSED). The performer (dc4) is not offered the close button at all ...
    expect((await screen.findAllByText('รอผู้ตรวจรับ')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /ตรวจรับปิดงาน/i })).not.toBeInTheDocument();

    // ... and the backend rule still refuses them if the call is made anyway
    const pendingWo = getLocalWos().find((w) => w.status === 'PENDING_REVIEW');
    await expect(approveVccWorkOrder(pendingWo.id, 'ลองอนุมัติงานตัวเอง')).rejects.toThrow(
      /ผู้บันทึกผลไม่สามารถตรวจรับและอนุมัติปิดใบสั่งงานของตนเองได้/
    );

    // Switch to Reviewer L4 (qc4) and approve -> moves to CLOSED
    useStore.setState({
      currentUser: {
        id: 'qc4',
        name: 'QC หัวหน้า (L4)',
        role: 'STAFF',
        department: 'QC',
        approval_level: 4,
        approvalLevel: 4,
        isDcc: true
      }
    });

    fireEvent.click(await screen.findByRole('button', { name: /ตรวจรับปิดงาน/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'ยืนยันการดำเนินการ' }));

    // Now in CLOSED tab
    expect(await screen.findByText('CERT-ST002-2026')).toBeInTheDocument();

    // Verify Annual Plan Act. row updated to A3 and COMPLETED badge
    fireEvent.click(screen.getByRole('button', { name: /แผนการทวนสอบประจำปี \(FM-QC-46\)/i }));
    expect(await screen.findByText(/ทวนสอบเสร็จแล้ว • มีใบรับรอง/i)).toBeInTheDocument();
    expect(screen.getByText('A3')).toBeInTheDocument();
  });

  it('3. เมื่อผลเป็น FAIL จะขึ้นสถานะระงับใช้ (ON_HOLD) ทันที ไม่ปลดระงับอัตโนมัติเมื่อปิดใบงาน และต้องใช้ผู้อนุมัติ L5+ พร้อมระบุการประเมินผลกระทบจึงจะปลดระงับได้', async () => {
    render(<AssetRegisterPage />);

    fireEvent.click(await screen.findByRole('button', { name: /ใบสั่งงานและบันทึกผล \(Work Orders\)/i }));
    fireEvent.click(await screen.findByRole('button', { name: /บันทึกผลและใบรับรอง/i }));

    fireEvent.change(screen.getByLabelText(/ผลการทวนสอบ/i), { target: { value: 'FAIL' } });
    fireEvent.change(screen.getByLabelText(/เลขที่ใบรับรอง/i), { target: { value: 'CERT-FAIL-01' } });
    fireEvent.click(screen.getByRole('button', { name: /ส่งผลให้ผู้ตรวจรับพิจารณา/i }));

    // Immediately shows ON_HOLD badge
    expect(await screen.findByText(/ON_HOLD \(ระงับใช้ชั่วคราว\)/i)).toBeInTheDocument();

    // Not reviewed yet (and dc4 is the L4 performer): no release is offered, and the rule refuses it anyway
    expect(screen.queryByRole('button', { name: /ปลดระงับ ON_HOLD/i })).not.toBeInTheDocument();
    const heldWo = getLocalWos().find((w) => w.nc_status === 'OPEN');
    await expect(releaseVccWorkOrderHold(heldWo.id, 'ประเมินแล้ว', 'สอบเทียบซ้ำผ่าน')).rejects.toThrow(/L5 ขึ้นไป/);

    // An L5 reviewer (qc5) closes the FAIL result first ...
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
    fireEvent.click(await screen.findByRole('button', { name: /ตรวจรับปิดงาน/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'ยืนยันการดำเนินการ' }));

    // ... then releases the hold with both a reason and an impact assessment
    fireEvent.click(await screen.findByRole('button', { name: /ปลดระงับ ON_HOLD/i }));
    const confirmReleaseBtn = await screen.findByRole('button', { name: 'ยืนยันการดำเนินการ' });
    fireEvent.change(screen.getByPlaceholderText(/ระบุรายละเอียด/i), {
      target: { value: 'ตรวจสอบย้อนหลังแล้วไม่กระทบสินค้า' }
    });
    expect(confirmReleaseBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/เหตุผลการปลดระงับ/i), { target: { value: 'ซ่อมบำรุงและสอบเทียบซ้ำผ่านแล้ว' } });
    expect(confirmReleaseBtn).not.toBeDisabled();
    fireEvent.click(confirmReleaseBtn);

    await screen.findByText('WO-2026-001');
    expect(screen.queryByText(/ON_HOLD \(ระงับใช้ชั่วคราว\)/i)).not.toBeInTheDocument();
    expect(getLocalWos().find((w) => w.id === heldWo.id).nc_status).toBe('RELEASED');
  });

  it('3b. เลื่อนกำหนดเป็นวันเดิมไม่ได้ (ไม่มีการเปลี่ยนแปลง) และไม่เขียนประวัติ', async () => {
    const wo = getLocalWos().find((w) => w.wo_code === 'WO-2026-001');
    await expect(rescheduleVccWorkOrder(wo.id, { new_due_date: wo.due_date, reason: 'เลื่อน' })).rejects.toThrow(/ไม่มีการเปลี่ยนแปลง/);
    const moved = await rescheduleVccWorkOrder(wo.id, { new_due_date: '2026-05-15', reason: 'รอคิวแล็บ' });
    expect(moved.due_date).toBe('2026-05-15');
    await expect(rescheduleVccWorkOrder(wo.id, { new_due_date: '2026-05-15', reason: 'กดซ้ำ' })).rejects.toThrow(/ไม่มีการเปลี่ยนแปลง/);
  });

  it('4. ผลรอตรวจซ้ำ (INCONCLUSIVE) ระงับใช้ทันที ผู้ตรวจรับปิดงานไม่ได้ มีปุ่มเดียวคือส่งกลับตรวจซ้ำ', async () => {
    render(<AssetRegisterPage />);

    fireEvent.click(await screen.findByRole('button', { name: /ใบสั่งงานและบันทึกผล \(Work Orders\)/i }));
    fireEvent.click(await screen.findByRole('button', { name: /บันทึกผลและใบรับรอง/i }));
    fireEvent.change(screen.getByLabelText(/ผลการทวนสอบ/i), { target: { value: 'INCONCLUSIVE' } });
    expect(screen.getByText(/ผลรอตรวจซ้ำปิดงานไม่ได้/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/เลขที่ใบรับรอง/i), { target: { value: 'CERT-INC-01' } });
    fireEvent.click(screen.getByRole('button', { name: /ส่งผลให้ผู้ตรวจรับพิจารณา/i }));
    expect(await screen.findByText(/ON_HOLD \(ระงับใช้ชั่วคราว\)/i)).toBeInTheDocument();

    useStore.setState({
      currentUser: { id: 'qc4', name: 'QC หัวหน้า (L4)', role: 'STAFF', department: 'QC', approval_level: 4, approvalLevel: 4, isDcc: true }
    });
    expect(await screen.findByRole('button', { name: /ส่งกลับตรวจซ้ำ/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ตรวจรับปิดงาน/i })).not.toBeInTheDocument();
    const pendingWo = getLocalWos().find((w) => w.status === 'PENDING_REVIEW');
    await expect(approveVccWorkOrder(pendingWo.id, 'ปิดงาน')).rejects.toThrow(/INCONCLUSIVE/);

    fireEvent.click(screen.getByRole('button', { name: /ส่งกลับตรวจซ้ำ/ }));
    expect(await screen.findByText('สิ่งที่ต้องตรวจซ้ำ')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/ระบุรายละเอียด/i), { target: { value: 'วัดซ้ำที่ 3 จุด' } });
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันการดำเนินการ' }));
    await screen.findByText('WO-2026-001');
    expect(getLocalWos().find((w) => w.id === pendingWo.id).status).toBe('REJECTED');
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
});

