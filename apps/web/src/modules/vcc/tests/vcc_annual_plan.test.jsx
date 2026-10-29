import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { resetVccLocalStore } from '../api/vccApi';

describe('VCC Phase 2 — Annual Calibration Plan (FM-QC-46) & Approval Workflow', () => {
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

  it('1. แยกสถานะแผนตามแท็บ (DRAFT / PENDING_REVIEW / PENDING_APPROVAL / APPROVED / REJECTED) และแสดง V001 เดือน 2 / V002 เดือน 9 พร้อมระบุว่าสีในแผนไม่ใช่หลักฐานว่าทำเสร็จแล้ว', async () => {
    render(<AssetRegisterPage />);

    const planNavBtn = await screen.findByRole('button', { name: /แผนการทวนสอบประจำปี \(FM-QC-46\)/i });
    fireEvent.click(planNavBtn);

    // Must display 2026 DRAFT plan with V001 (due 2026-02-28) and V002 (due 2026-09-30)
    expect(await screen.findByText('V001')).toBeInTheDocument();
    expect(screen.getByText('2026-02-28')).toBeInTheDocument();
    expect(screen.getByText('V002')).toBeInTheDocument();
    expect(screen.getByText('2026-09-30')).toBeInTheDocument();

    // Must explicitly show that plan cells are PLANNED_ONLY, not actual completion evidence
    const plannedOnlyBadges = screen.getAllByText(/วางแผนเท่านั้น • ยังไม่มีหลักฐานใบงาน/i);
    expect(plannedOnlyBadges.length).toBeGreaterThan(0);

    // Switching status filter to APPROVED must NOT show DRAFT plans
    fireEvent.change(screen.getByLabelText('กรองตามสถานะแผน'), { target: { value: 'APPROVED' } });

    expect(await screen.findByText(/ไม่พบแผนการทวนสอบประจำปีในสถานะ “อนุมัติแล้ว”/i)).toBeInTheDocument();
    expect(screen.queryByText('V001')).not.toBeInTheDocument();
  });

  it('2. เครื่องมือแบบกลุ่ม (GRP-SCALE) บังคับแยกรหัสเครื่องมือลูกก่อนสร้างใบสั่งงาน และแสดงข้อความแจ้งเตือนหากไม่เลือกลูก', async () => {
    render(<AssetRegisterPage />);

    fireEvent.click(await screen.findByRole('button', { name: /แผนการทวนสอบประจำปี \(FM-QC-46\)/i }));
    const grpText = await screen.findByText('GRP-SCALE');
    expect(grpText).toBeInTheDocument();

    const grpRow = grpText.closest('tr');
    const checkBtn = within(grpRow).getByRole('button', { name: /ตรวจรหัสลูกก่อนออกใบงาน/i });
    fireEvent.click(checkBtn);

    // Try validating without selecting a child asset -> must show error alert
    const validateBtn = await screen.findByRole('button', { name: /ตรวจสอบการออกใบสั่งงาน/i });
    fireEvent.click(validateBtn);

    const alertBox = await screen.findByRole('alert');
    expect(alertBox).toHaveTextContent(/เครื่องมือแบบกลุ่มต้องแยกรหัสเครื่องมือรายตัวก่อนสร้างใบสั่งงาน/i);

    // Now select active child asset SC-WH-001 -> must pass validation
    const childSelect = screen.getByLabelText(/เลือกรหัสเครื่องมือลูก/i);
    fireEvent.change(childSelect, { target: { value: 'vcc-seed-sc001' } });
    fireEvent.click(validateBtn);

    expect(await screen.findByText(/พร้อมสร้างใบสั่งงานสำหรับเครื่องมือรายตัว: SC-WH-001/i)).toBeInTheDocument();
  });

  it('3. การอนุมัติแผน 3 ขั้นตอนตาม Approval Matrix, บังคับกรอกเหตุผลเมื่อส่งกลับแก้ไข, และแสดง error จาก API เมื่อผู้จัดทำทบทวนเองหรือระดับอนุมัติไม่ถึง', async () => {
    render(<AssetRegisterPage />);

    fireEvent.click(await screen.findByRole('button', { name: /แผนการทวนสอบประจำปี \(FM-QC-46\)/i }));
    expect(await screen.findByText('ST002')).toBeInTheDocument();

    // 1) Submit plan as dc4 -> moves to PENDING_REVIEW
    const submitBtn = screen.getByRole('button', { name: 'ส่งทบทวนแผน' });
    fireEvent.click(submitBtn);

    // Now in PENDING_REVIEW tab
    expect(await screen.findByRole('button', { name: /ยืนยันการทบทวน/i })).toBeInTheDocument();

    // 2) Try reviewing as same user (dc4) -> must display API error
    fireEvent.click(screen.getByRole('button', { name: /ยืนยันการทบทวน/i }));
    const confirmReviewBtn = await screen.findByRole('button', { name: 'บันทึกผลการทบทวน' });
    fireEvent.click(confirmReviewBtn);

    const selfReviewErrors = await screen.findAllByRole('alert');
    expect(selfReviewErrors[0]).toHaveTextContent(/ผู้จัดทำไม่สามารถทบทวนแผนของตนเองได้/i);

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));

    // 3) Switch user to Reviewer L4 (qc4) and test Reject mandatory reason first
    useStore.setState({
      currentUser: {
        id: 'qc4',
        name: 'QC หัวหน้า (L4)',
        role: 'STAFF',
        department: 'QC',
        position: 'QC Supervisor',
        approval_level: 4,
        approvalLevel: 4,
        isDcc: true
      }
    });

    fireEvent.click(screen.getByRole('button', { name: /ส่งกลับแก้ไข/i }));
    const confirmRejectBtn = await screen.findByRole('button', { name: /ยืนยันส่งกลับแก้ไข/i });
    expect(confirmRejectBtn).toBeDisabled();

    // Cancel reject and perform Review as qc4 (L4) -> moves to PENDING_APPROVAL
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
    fireEvent.click(screen.getByRole('button', { name: /ยืนยันการทบทวน/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'บันทึกผลการทบทวน' }));

    // Now in PENDING_APPROVAL tab
    expect(await screen.findByRole('button', { name: /อนุมัติแผนประจำปี/i })).toBeInTheDocument();

    // 4) Switch user to Approver L5 (qc5) and Approve -> moves to APPROVED
    useStore.setState({
      currentUser: {
        id: 'qc5',
        name: 'QC ผู้ช่วยผู้จัดการ (L5)',
        role: 'STAFF',
        department: 'QC',
        position: 'Assistant QC Manager',
        approval_level: 5,
        approvalLevel: 5,
        isDcc: true
      }
    });

    fireEvent.click(screen.getByRole('button', { name: /อนุมัติแผนประจำปี/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'บันทึกการอนุมัติแผน' }));

    // Verify plan is now in APPROVED status
    expect(await screen.findByText(/สถานะ: อนุมัติแล้ว/i, { selector: 'span' })).toBeInTheDocument();
  }, 15000);

  it('4. เมื่อโหลดแผนกจาก Master Data ไม่ได้ จะแสดงข้อความแจ้งเตือนและปิดปุ่มบันทึกแผนประจำปี', async () => {
    useStore.setState({ masterDepartments: [], departments: [] });

    render(<AssetRegisterPage />);
    fireEvent.click(await screen.findByRole('button', { name: /แผนการทวนสอบประจำปี \(FM-QC-46\)/i }));

    fireEvent.click(await screen.findByRole('button', { name: 'เมนูเพิ่มเติมของแผน' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /สร้างแผนประจำปีใหม่/i }));
    expect(
      await screen.findByText(/ไม่สามารถโหลดแผนกจาก Master Data ได้ กรุณาตรวจสอบข้อมูลแผนกก่อนบันทึก/i)
    ).toBeInTheDocument();

    const savePlanBtn = screen.getByRole('button', { name: /บันทึกแผนประจำปี/i });
    expect(savePlanBtn).toBeDisabled();
  });
});
