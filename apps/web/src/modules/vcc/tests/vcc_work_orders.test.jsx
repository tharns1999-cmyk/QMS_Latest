import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { resetVccLocalStore } from '../api/vccApi';

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

    fireEvent.change(screen.getByLabelText(/เลขที่ใบรับรอง/i), { target: { value: 'CERT-ST002-2026' } });
    expect(submitResultBtn).not.toBeDisabled();
    fireEvent.click(submitResultBtn);

    // Moves to PENDING_REVIEW tab (not CLOSED)
    expect(await screen.findByRole('button', { name: /ตรวจรับปิดงาน/i })).toBeInTheDocument();

    // Performer (dc4) tries to approve own work order -> must show API error alert
    fireEvent.click(screen.getByRole('button', { name: /ตรวจรับปิดงาน/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'ยืนยันการดำเนินการ' }));

    const selfApproveAlert = await screen.findByRole('alert');
    expect(selfApproveAlert).toHaveTextContent(/ผู้บันทึกผลไม่สามารถตรวจรับและอนุมัติปิดใบสั่งงานของตนเองได้/i);

    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));

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

    fireEvent.click(screen.getByRole('button', { name: /ตรวจรับปิดงาน/i }));
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

    // Reviewer L4 (dc4 is L4) tries to release hold -> must show API error alert (requires L5+)
    fireEvent.click(screen.getByRole('button', { name: /ปลดระงับ ON_HOLD/i }));
    const confirmReleaseBtn = await screen.findByRole('button', { name: 'ยืนยันการดำเนินการ' });
    expect(confirmReleaseBtn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/ระบุรายละเอียด/i), {
      target: { value: 'ตรวจสอบย้อนหลังแล้วไม่กระทบสินค้า และซ่อมบำรุงสอบเทียบซ้ำผ่านแล้ว' }
    });
    fireEvent.click(confirmReleaseBtn);

    const levelAlert = await screen.findByRole('alert');
    expect(levelAlert).toHaveTextContent(/ต้องมีระดับอนุมัติ L5 ขึ้นไปตาม Approval Matrix/i);

    // Switch to Approver L5 (qc5) and release hold
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

    fireEvent.click(confirmReleaseBtn);
    await screen.findByText('WO-2026-001');
    expect(screen.queryByText(/ON_HOLD \(ระงับใช้ชั่วคราว\)/i)).not.toBeInTheDocument();
  });
});

