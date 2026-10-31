import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { resetVccLocalStore, writeJson } from '../api/vccApi';
import { getLocalPlans, getLocalPlanItems } from '../api/vccPlanApi';

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
      masterUsers: [
        {
          id: 'dc4',
          name: 'DC หัวหน้า (DCC)',
          department: 'DC',
          approval_level: 4,
          status: 'ACTIVE',
          isDcc: true
        },
        {
          id: 'qc4',
          name: 'QC หัวหน้า (L4)',
          department: 'QC',
          approval_level: 4,
          status: 'ACTIVE'
        },
        {
          id: 'qc5',
          name: 'QC ผู้ช่วยผู้จัดการ (L5)',
          department: 'QC',
          approval_level: 5,
          status: 'ACTIVE'
        }
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

  it('2. แผนร่างปกติไม่มีกลุ่มแม่ GRP-SCALE แต่แผนที่อนุมัติในอดีต (Historical APPROVED) ยังเก็บรักษาแถวเดิมและบังคับแยกรหัสลูกก่อนออกใบงาน', async () => {
    // Seed a historical APPROVED 2025 plan containing legacy GRP-SCALE alongside normal 2026 DRAFT plan
    const plans = getLocalPlans();
    plans.push({
      id: 'vcc-plan-2025-wh-hist',
      plan_year: 2025,
      department: 'WH',
      document_code: 'FM-QC-46',
      revision: '01',
      title: '[ข้อมูลทดสอบ] แผนการทวนสอบเครื่องมือประจำปี 2025 (ประวัติ)',
      status: 'APPROVED',
      due_date_rule: 'END_OF_MONTH',
      approved_by: 'qc5',
      approved_at: '2025-01-10T03:00:00.000Z',
      created_at: '2025-01-01T03:00:00.000Z',
      created_by: 'dc4'
    });
    writeJson('qms-vcc-local-plans-v1', plans);

    const items = getLocalPlanItems();
    items.push({
      id: 'vcc-pi-2025-grp-scale',
      plan_id: 'vcc-plan-2025-wh-hist',
      asset_id: 'vcc-seed-grp-scale',
      provider_name: 'ทวนสอบภายใน',
      frequency_label: 'รายครึ่งปี',
      planned_months: [4, 10],
      due_dates: ['2025-04-30', '2025-10-31'],
      responsible_dept: 'WH',
      responsible_label: 'หัวหน้าคลัง',
      remarks: '',
      sort_order: 1
    });
    writeJson('qms-vcc-local-plan-items-v1', items);

    render(<AssetRegisterPage />);

    fireEvent.click(await screen.findByRole('button', { name: /แผนการทวนสอบประจำปี \(FM-QC-46\)/i }));
    expect(await screen.findByText('ST002')).toBeInTheDocument();

    // Normal 2026 DRAFT plan must NOT contain GRP-SCALE
    expect(screen.queryByText('GRP-SCALE')).not.toBeInTheDocument();

    // Switch to APPROVED tab -> historical 2025 plan preserves GRP-SCALE read-only + child validation
    fireEvent.change(screen.getByLabelText('กรองตามสถานะแผน'), { target: { value: 'APPROVED' } });
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

    // Select active child asset SC-WH-001 -> must pass validation
    const childSelect = screen.getByLabelText(/เลือกรหัสเครื่องมือลูก/i);
    fireEvent.change(childSelect, { target: { value: 'vcc-seed-sc001' } });
    fireEvent.click(validateBtn);

    expect(await screen.findByText(/พร้อมสร้างใบสั่งงานสำหรับเครื่องมือรายตัว: SC-WH-001/i)).toBeInTheDocument();
  }, 15000);

  it('3. การอนุมัติแผน 3 ขั้นตอนผ่านหน้า Task Inbox, หน้าแผนไม่มีปุ่มอนุมัติ/ทบทวน, บังคับกรอกเหตุผลเมื่อส่งกลับแก้ไข, และป้องกันผู้จัดทำทบทวนเอง', async () => {
    render(<AssetRegisterPage />);

    fireEvent.click(await screen.findByRole('button', { name: /แผนการทวนสอบประจำปี \(FM-QC-46\)/i }));
    expect(await screen.findByText('ST002')).toBeInTheDocument();

    // 1) Submit plan as dc4 -> opens PlanSubmitModal with controlled assignees
    const submitBtn = screen.getByRole('button', { name: 'ส่งทบทวนแผน' });
    fireEvent.click(submitBtn);

    const confirmSubmitBtn = await screen.findByRole('button', { name: 'ยืนยันส่งทบทวนแผน' });
    fireEvent.click(confirmSubmitBtn);

    // Now in PENDING_REVIEW tab on Planning Workspace — NO review/approve/reject buttons allowed here
    expect(await screen.findByText(/สถานะ: รอทบทวน/i, { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ยืนยันการทบทวน/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /อนุมัติแผน/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /ส่งกลับแก้ไข/i })).toBeNull();

    // 2) Navigate to VCC Task Inbox as dc4 (requester) -> open the pending plan from WAITING_OTHERS tab
    fireEvent.click(screen.getByRole('button', { name: /งานที่ต้องดำเนินการ \(VCC Task Inbox\)/i }));
    const trackingTab = await screen.findByTestId('vcc-inbox-tab-WAITING_OTHERS');
    fireEvent.click(trackingTab);
    fireEvent.click(await screen.findByTestId('vcc-inbox-open-vcc-plan-2026-qc'));

    // Requester sees non-actionable SoD banner and NO review/approve buttons
    const nonActionableBanner = await screen.findByTestId('vcc-task-non-actionable-banner');
    expect(nonActionableBanner).toHaveTextContent(/ผู้จัดทำไม่สามารถทบทวนแผนของตนเองได้/i);
    expect(screen.queryByTestId('vcc-task-btn-review')).toBeNull();

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

    const rejectBtn = await screen.findByTestId('vcc-task-btn-reject');
    fireEvent.click(rejectBtn);
    const confirmRejectBtn = await screen.findByRole('button', { name: /ยืนยันส่งกลับแก้ไข/i });
    expect(confirmRejectBtn).toBeDisabled();

    // Cancel reject and perform Review as qc4 (L4) -> moves to PENDING_APPROVAL
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }));
    fireEvent.click(screen.getByTestId('vcc-task-btn-review'));
    fireEvent.click(await screen.findByRole('button', { name: 'บันทึกผลการทบทวน' }));

    // Verify plan moved to PENDING_APPROVAL and qc4 (reviewer) now sees non-actionable banner
    expect(await screen.findByText(/สถานะ: รออนุมัติ/i)).toBeInTheDocument();
    expect(await screen.findByTestId('vcc-task-non-actionable-banner')).toHaveTextContent(
      /(งานทบทวนนี้ดำเนินการเสร็จสิ้นแล้ว|ผู้ทบทวนไม่สามารถอนุมัติแผนที่ตนเป็นผู้ทบทวนได้)/i
    );

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

    const approveBtn = await screen.findByTestId('vcc-task-btn-approve');
    fireEvent.click(approveBtn);
    fireEvent.click(await screen.findByRole('button', { name: 'บันทึกการอนุมัติแผน' }));

    // Verify plan is now in APPROVED status
    expect(await screen.findByText(/สถานะ: อนุมัติแล้ว/i)).toBeInTheDocument();
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
