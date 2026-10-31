import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { resetVccLocalStore } from '../api/vccApi';
import {
  fetchVccPlans,
  fetchVccPlanDetail,
  saveVccPlanItem,
  submitVccPlan,
  reviewVccPlan,
  approveVccPlan,
  rejectVccPlan,
  syncVccTasks
} from '../api/vccPlanApi';
import TaskInbox from '../../dcc/pages/Tasks/TaskInbox';

const MOCK_USERS = [
  {
    id: 'emp_qc_l1',
    name: 'สมชาย ผู้จัดทำ (QC L1)',
    department: 'QC',
    approval_level: 1,
    status: 'ACTIVE',
    isDcc: true
  },
  {
    id: 'emp_qc_l4',
    name: 'สมศรี ผู้ทบทวน (QC L4)',
    department: 'QC',
    approval_level: 4,
    status: 'ACTIVE',
    isDcc: true
  },
  {
    id: 'emp_pd_l5_with_qc',
    name: 'สมศักดิ์ ผู้จัดการผลิต (PD L5 + รอง QC)',
    department: 'PD',
    secondaryDepartments: ['QC'],
    approval_level: 5,
    status: 'ACTIVE',
    isDcc: true
  },
  {
    id: 'emp_wh_l5_no_qc',
    name: 'สมคิด ผู้จัดการคลัง (WH L5 ไม่มีสิทธิ์ QC)',
    department: 'WH',
    approval_level: 5,
    status: 'ACTIVE',
    isDcc: false
  },
  {
    id: 'emp_qmr_l6',
    name: 'ดร.วิโรจน์ QMR (L6)',
    department: 'MGMT',
    approval_level: 6,
    isQmr: true,
    status: 'ACTIVE',
    isDcc: true
  }
];

describe('VCC Approval Workflow Redesign — Clean, Minimal & Task-Centric (16 E2E Acceptance Scenarios)', () => {
  beforeEach(() => {
    resetVccLocalStore();
    useStore.setState({
      currentUser: MOCK_USERS[0], // emp_qc_l1 (Requester)
      masterUsers: MOCK_USERS,
      masterDepartments: [
        { code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' },
        { code: 'PD', name_th: 'ฝ่ายผลิต', status: 'ACTIVE' },
        { code: 'WH', name_th: 'คลังสินค้า', status: 'ACTIVE' },
        { code: 'MGMT', name_th: 'ฝ่ายบริหาร', status: 'ACTIVE' }
      ],
      approvalMatrix: [
        {
          docType: 'FM',
          minRequesterLevel: 1,
          requiredReviewerLevel: 4,
          requiredApproverLevel: 5
        }
      ],
      tasks: [],
      documents: [],
      externalDocuments: []
    });
  });

  it('Scenarios 1 & 2: ผู้จัดทำแก้ไขและบันทึก Draft ได้โดยไม่เปลี่ยนสถานะ และส่งทบทวนครั้งแรกผ่าน Confirmation Dialog พร้อมคัดกรองผู้รับงานตาม Matrix', async () => {
    const plans = await fetchVccPlans({ status: 'DRAFT' });
    const planId = plans[0].id;

    // 1. บันทึกรายการในสถานะ DRAFT ได้โดยไม่เปลี่ยนสถานะเป็น PENDING_REVIEW
    await saveVccPlanItem(planId, {
      asset_id: 'vcc-seed-v001',
      provider_name: 'ทวนสอบภายใน',
      frequency_label: 'ราย 6 เดือน',
      planned_months: [3, 9],
      responsible_dept: 'QC',
      remarks: 'บันทึกในร่างแผน'
    });
    const draftDetail = await fetchVccPlanDetail(planId);
    expect(draftDetail.plan.status).toBe('DRAFT');

    // 2. เปิดหน้า /vcc/plans แล้วกดส่งทบทวนแผนผ่าน Confirmation Dialog
    render(<AssetRegisterPage initialEntries={['/vcc/plans']} />);

    const submitBtn = await screen.findByRole('button', { name: 'ส่งทบทวนแผน' });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/ส่งแผนประจำปีเข้าสู่กระบวนการทบทวนและอนุมัติ/i)).toBeInTheDocument();

    const reviewerSelect = screen.getByLabelText(/เลือกผู้ทบทวนแผน/i);
    expect(within(reviewerSelect).getByText(/สมศรี ผู้ทบทวน/i)).toBeInTheDocument();

    const approverSelect = screen.getByLabelText(/เลือกผู้อนุมัติแผน/i);
    expect(within(approverSelect).getByText(/สมศักดิ์ ผู้จัดการผลิต/i)).toBeInTheDocument();
    expect(within(approverSelect).queryByText(/สมคิด ผู้จัดการคลัง/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันส่งทบทวนแผน' }));

    expect(await screen.findByText(/สถานะ: รอทบทวน/i, { selector: 'span' })).toBeInTheDocument();
    const revTags = await screen.findAllByText(/ผู้ทบทวน: สมศรี ผู้ทบทวน/i);
    expect(revTags.length).toBeGreaterThan(0);
  }, 20000);

  it('Scenarios 3 & 4: ผู้ทบทวนเห็นงานใน Task Inbox และหน้า Annual Plan (/vcc/plans) ไม่มีปุ่มทบทวน/อนุมัติ/ส่งกลับแก้ไขโดยเด็ดขาด', async () => {
    const plans = await fetchVccPlans({ status: 'DRAFT' });
    const planId = plans[0].id;
    await submitVccPlan(planId, 'emp_qc_l4', 'emp_pd_l5_with_qc');

    // เปลี่ยนผู้ใช้เป็นผู้ทบทวน (emp_qc_l4)
    useStore.setState({ currentUser: MOCK_USERS[1] });
    const reviewerTasks = await syncVccTasks(MOCK_USERS[1]);
    expect(reviewerTasks.some((t) => t.planId === planId && t.taskType === 'VCC_PLAN_REVIEW')).toBe(true);

    // 4. เปิดหน้า /vcc/plans ในฐานะผู้ทบทวน -> ต้องเป็น Read-only และไม่มีปุ่มทบทวน/อนุมัติ/ส่งกลับแก้ไข
    const { unmount } = render(<AssetRegisterPage initialEntries={[`/vcc/plans?id=${encodeURIComponent(planId)}`]} />);
    expect(await screen.findByText(/สถานะ: รอทบทวน/i, { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ยืนยันการทบทวน/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /อนุมัติแผน/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /ส่งกลับแก้ไข/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /เพิ่มเครื่องมือจากทะเบียน/i })).toBeNull();
    unmount();

    // 3. เปิดหน้า /vcc/tasks (VCC Task Inbox) -> เห็นงานรอทบทวนชัดเจน
    render(<AssetRegisterPage initialEntries={['/vcc/tasks']} />);
    expect(await screen.findByTestId(`vcc-inbox-item-${planId}`)).toBeInTheDocument();
    expect(screen.getByText(/ตรวจสอบรายการและกดยืนยันการทบทวน/i)).toBeInTheDocument();
  }, 20000);

  it('Scenarios 5, 6, 7, 8 & 9: วงจรส่งกลับแก้ไข (Return for Revision) -> บันทึกโดยไม่ส่งอัตโนมัติ -> ส่งทบทวนอีกครั้ง -> สร้างงานทบทวนรอบใหม่', async () => {
    const plans = await fetchVccPlans({ status: 'DRAFT' });
    const planId = plans[0].id;
    await submitVccPlan(planId, 'emp_qc_l4', 'emp_pd_l5_with_qc');

    // 5. ผู้ทบทวนเปิด Task Detail ใน /vcc/tasks แล้วกดส่งกลับแก้ไข (บังคับกรอกเหตุผล)
    useStore.setState({ currentUser: MOCK_USERS[1] });
    const { unmount: unmountReviewer } = render(
      <AssetRegisterPage initialEntries={[`/vcc/tasks?id=${encodeURIComponent(planId)}&action=REVIEW`]} />
    );

    const rejectBtn = await screen.findByTestId('vcc-task-btn-reject');
    fireEvent.click(rejectBtn);

    const confirmRejectBtn = await screen.findByRole('button', { name: /ยืนยันส่งกลับแก้ไข/i });
    expect(confirmRejectBtn).toBeDisabled();

    const reasonInput = screen.getByPlaceholderText(/ระบุสิ่งที่ต้องแก้ไขในแผนประจำปี/i);
    fireEvent.change(reasonInput, {
      target: { value: 'กรุณาปรับรอบทวนสอบของ V001 เป็นเดือน 4 และ 10 แทน' }
    });
    expect(confirmRejectBtn).not.toBeDisabled();
    fireEvent.click(confirmRejectBtn);

    expect(await screen.findByText(/สถานะ: ส่งกลับแก้ไข/i)).toBeInTheDocument();
    unmountReviewer();

    // 6. ผู้จัดทำ (emp_qc_l1) เห็นงานส่งกลับให้แก้ไขใน Task Inbox และเปิดเข้าหน้า /vcc/plans
    useStore.setState({ currentUser: MOCK_USERS[0] });
    const requesterTasks = await syncVccTasks(MOCK_USERS[0]);
    const reviseTask = requesterTasks.find((t) => t.planId === planId);
    expect(reviseTask).toBeDefined();
    expect(reviseTask.taskType).toBe('VCC_PLAN_REVISE');

    // 7. ผู้จัดทำแก้ไขรายการในแผนและบันทึก -> สถานะต้องยังคงเป็น REJECTED (ไม่ส่งทบทวนอัตโนมัติ)
    await saveVccPlanItem(planId, {
      asset_id: 'vcc-seed-v001',
      provider_name: 'ทวนสอบภายใน',
      frequency_label: 'ราย 6 เดือน',
      planned_months: [4, 10],
      responsible_dept: 'QC',
      remarks: 'ปรับแก้ตามที่ผู้ทบทวนแจ้งแล้ว'
    });
    const afterSaveDetail = await fetchVccPlanDetail(planId);
    expect(afterSaveDetail.plan.status).toBe('REJECTED');

    // 8. ผู้จัดทำเปิดหน้า /vcc/plans เห็นเหตุผลที่ถูกส่งกลับแบบเต็ม และกดปุ่ม "ส่งทบทวนอีกครั้ง"
    render(<AssetRegisterPage initialEntries={[`/vcc/plans?id=${encodeURIComponent(planId)}&tab=REJECTED`]} />);

    const rejectedBanner = await screen.findByTestId('plan-rejected-reason-banner');
    expect(rejectedBanner).toHaveTextContent(/กรุณาปรับรอบทวนสอบของ V001 เป็นเดือน 4 และ 10 แทน/i);

    const resubmitBtn = screen.getByRole('button', { name: 'ส่งทบทวนอีกครั้ง' });
    fireEvent.click(resubmitBtn);

    // Confirmation Dialog แสดงข้อความส่งทบทวนอีกครั้งและเหตุผลที่ส่งกลับรอบก่อน
    expect(await screen.findByText(/ส่งทบทวนอีกครั้ง — ส่งแผนประจำปีเข้าสู่กระบวนการทบทวนและอนุมัติ/i)).toBeInTheDocument();
    const confirmResubmitBtn = screen.getByRole('button', { name: /ยืนยันส่งทบทวนอีกครั้ง/i });
    fireEvent.click(confirmResubmitBtn);

    expect(await screen.findByText(/สถานะ: รอทบทวน/i, { selector: 'span' })).toBeInTheDocument();

    // 9. ผู้ทบทวนได้รับงานทบทวนรอบใหม่ (workflow_round = 2)
    const round2Tasks = await syncVccTasks(MOCK_USERS[1]);
    expect(round2Tasks.some((t) => t.planId === planId && t.taskType === 'VCC_PLAN_REVIEW')).toBe(true);
    const round2Detail = await fetchVccPlanDetail(planId);
    expect(round2Detail.plan.workflow_round).toBe(2);
  }, 25000);

  it('Scenarios 9b, 10 & 11: แม้ผู้อนุมัติส่งกลับแก้ไข เมื่อส่งทบทวนอีกครั้งต้องกลับไปเริ่มที่ผู้ทบทวนใหม่ และเมื่อทบทวนผ่านจึงส่งต่อผู้อนุมัติจนสำเร็จ', async () => {
    const plans = await fetchVccPlans({ status: 'DRAFT' });
    const planId = plans[0].id;
    await submitVccPlan(planId, 'emp_qc_l4', 'emp_pd_l5_with_qc');

    // รอบแรก: ผู้ทบทวนยืนยันการทบทวน -> ไปยัง PENDING_APPROVAL
    useStore.setState({ currentUser: MOCK_USERS[1] });
    await reviewVccPlan(planId, 'ทบทวนรอบแรกผ่าน');

    // ผู้อนุมัติ (emp_pd_l5_with_qc) ส่งกลับแก้ไขจากขั้น PENDING_APPROVAL
    useStore.setState({ currentUser: MOCK_USERS[2] });
    const rejectedByApprover = await rejectVccPlan(planId, 'ผู้อนุมัติขอให้เพิ่มหมายเหตุผู้รับผิดชอบให้ชัดเจน');
    expect(rejectedByApprover.status).toBe('REJECTED');

    // ผู้จัดทำส่งทบทวนอีกครั้ง -> ต้องกลับเข้าสถานะ PENDING_REVIEW (ให้ผู้ทบทวนตรวจซ้ำก่อนเสมอ)
    useStore.setState({ currentUser: MOCK_USERS[0] });
    const resubmitted = await submitVccPlan(planId, 'emp_qc_l4', 'emp_pd_l5_with_qc');
    expect(resubmitted.status).toBe('PENDING_REVIEW');
    expect(resubmitted.reviewed_by).toBeNull();

    // 10. ผู้ทบทวนเปิด Task Detail และกดยืนยันการทบทวน
    useStore.setState({ currentUser: MOCK_USERS[1] });
    const { unmount: unmountRev } = render(
      <AssetRegisterPage initialEntries={[`/vcc/tasks?id=${encodeURIComponent(planId)}&action=REVIEW`]} />
    );

    // ตรวจสอบว่าแสดงสรุปประวัติการส่งกลับแก้ไขและการส่งซ้ำในหน้า Task Detail
    expect(await screen.findByTestId('vcc-task-revision-summary')).toHaveTextContent(
      /ผู้อนุมัติขอให้เพิ่มหมายเหตุผู้รับผิดชอบให้ชัดเจน/i
    );

    fireEvent.click(screen.getByTestId('vcc-task-btn-review'));
    fireEvent.click(await screen.findByRole('button', { name: 'บันทึกผลการทบทวน' }));
    expect(await screen.findByText(/สถานะ: รออนุมัติ/i)).toBeInTheDocument();
    unmountRev();

    // 11. ผู้อนุมัติเปิด Task Detail และกดอนุมัติแผนสำเร็จ
    useStore.setState({ currentUser: MOCK_USERS[2] });
    render(<AssetRegisterPage initialEntries={[`/vcc/tasks?id=${encodeURIComponent(planId)}&action=APPROVE`]} />);

    const approveBtn = await screen.findByTestId('vcc-task-btn-approve');
    fireEvent.click(approveBtn);
    fireEvent.click(await screen.findByRole('button', { name: 'บันทึกการอนุมัติแผน' }));

    expect(await screen.findByText(/สถานะ: อนุมัติแล้ว/i)).toBeInTheDocument();
  }, 25000);

  it('Scenarios 12, 13, 14, 15 & 16: บล็อกผู้ไม่มีสิทธิ์/SoD, รองรับ Direct Link, ป้องกัน Stale Link, บันทึก Audit Trail ครบ และล็อกแผนที่อนุมัติแล้ว', async () => {
    const plans = await fetchVccPlans({ status: 'DRAFT' });
    const planId = plans[0].id;
    await submitVccPlan(planId, 'emp_qc_l4', 'emp_pd_l5_with_qc');

    // 12. Separation of Duties & Assignee Check ที่ระดับ API และ UI
    useStore.setState({ currentUser: MOCK_USERS[0] });
    await expect(reviewVccPlan(planId, 'ตรวจเอง')).rejects.toThrow(/ผู้จัดทำไม่สามารถทบทวนแผนของตนเองได้/i);

    // ผู้ทบทวนดำเนินการทบทวน
    useStore.setState({ currentUser: MOCK_USERS[1] });
    await reviewVccPlan(planId, 'ทบทวนผ่านเรียบร้อย');

    // ผู้ทบทวนห้ามอนุมัติหรือส่งกลับแก้ไขแผนที่อยู่ในขั้น PENDING_APPROVAL
    await expect(approveVccPlan(planId, 'อนุมัติเอง')).rejects.toThrow(/ผู้ทบทวนไม่สามารถอนุมัติแผนที่ตน.*ทบทวนได้/i);
    await expect(rejectVccPlan(planId, 'ส่งกลับเองตอนรออนุมัติ')).rejects.toThrow(
      /(ผู้ทบทวนไม่สามารถพิจารณาอนุมัติหรือส่งกลับแผนในขั้นตอนอนุมัติได้|แผนนี้ถูกมอบหมายให้ผู้อนุมัติรายอื่นดำเนินการ)/i
    );

    // 13 & 14. เปิด Direct Link ?action=REVIEW หลังจากแผนถูกทบทวนไปแล้ว (Stale Action Link) -> ต้องไม่แสดงปุ่มกดซ้ำ
    const { unmount } = render(
      <AssetRegisterPage initialEntries={[`/vcc/tasks?id=${encodeURIComponent(planId)}&action=REVIEW`]} />
    );
    expect(await screen.findByTestId('vcc-task-non-actionable-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('vcc-task-btn-review')).toBeNull();
    unmount();

    // ผู้อนุมัติตัวจริงอนุมัติแผน
    useStore.setState({ currentUser: MOCK_USERS[2] });
    await approveVccPlan(planId, 'อนุมัติแผนประจำปี 2026');

    // 15. ตรวจสอบความครบถ้วนของ Audit Trail และการล็อกแผนที่ APPROVED แล้ว
    const finalDetail = await fetchVccPlanDetail(planId);
    expect(finalDetail.plan.status).toBe('APPROVED');
    const actions = finalDetail.history.map((h) => h.action);
    expect(actions).toContain('VCC_PLAN_SUBMITTED');
    expect(actions).toContain('VCC_PLAN_REVIEWED');
    expect(actions).toContain('VCC_PLAN_APPROVED');

    // แผนที่อนุมัติแล้วห้ามแก้ไขรายการย้อนหลัง
    await expect(
      saveVccPlanItem(planId, {
        asset_id: 'vcc-seed-v001',
        provider_name: 'ทวนสอบภายใน',
        frequency_label: 'รายปี',
        planned_months: [1],
        responsible_dept: 'QC'
      })
    ).rejects.toThrow(/เฉพาะสถานะร่าง.*หรือส่งกลับแก้ไข.*เท่านั้น/i);

    // 16. Regression Check: Central TaskInbox (/dcc/tasks) ยังคงเรนเดอร์ได้ปกติโดยไม่กระทบงาน DCC
    render(
      <MemoryRouter initialEntries={['/dcc/tasks']}>
        <TaskInbox />
      </MemoryRouter>
    );
    expect(await screen.findByText(/กล่องงานที่ต้องจัดการ/i)).toBeInTheDocument();
  }, 25000);
});
