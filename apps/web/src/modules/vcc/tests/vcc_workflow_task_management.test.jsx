import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { resetVccLocalStore } from '../api/vccApi';
import {
  fetchVccPlans,
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
    isDcc: false
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

describe('VCC Workflow & Task Management (DCC-Aligned)', () => {
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

  it('1. Controlled Assignee Selection: ผู้จัดทำเลือกผู้ทบทวนและผู้อนุมัติตาม Matrix และคัดกรองขอบเขตแผนก', async () => {
    render(<AssetRegisterPage initialEntries={['/vcc/plans']} />);

    // Click submit plan
    const submitBtn = await screen.findByRole('button', { name: 'ส่งทบทวนแผน' });
    fireEvent.click(submitBtn);

    // PlanSubmitModal must appear
    expect(await screen.findByText(/ส่งแผนประจำปีเข้าสู่กระบวนการทบทวนและอนุมัติ/i)).toBeInTheDocument();

    // Reviewer select should include QC L4
    const reviewerSelect = screen.getByLabelText(/เลือกผู้ทบทวนแผน/i);
    expect(reviewerSelect).toBeInTheDocument();
    expect(within(reviewerSelect).getByText(/สมศรี ผู้ทบทวน/i)).toBeInTheDocument();

    // Approver select should include PD L5 with secondary QC, but NOT WH L5 (no QC rights)
    const approverSelect = screen.getByLabelText(/เลือกผู้อนุมัติแผน/i);
    expect(approverSelect).toBeInTheDocument();
    expect(within(approverSelect).getByText(/สมศักดิ์ ผู้จัดการผลิต/i)).toBeInTheDocument();
    expect(within(approverSelect).queryByText(/สมคิด ผู้จัดการคลัง/i)).not.toBeInTheDocument();

    // Confirm submission
    const confirmBtn = screen.getByRole('button', { name: 'ยืนยันส่งทบทวนแผน' });
    fireEvent.click(confirmBtn);

    // Plan moves to PENDING_REVIEW and shows assigned reviewer
    expect(await screen.findByText(/สถานะ: รอทบทวน/i, { selector: 'span' })).toBeInTheDocument();
    const revTags = await screen.findAllByText(/ผู้ทบทวน: สมศรี ผู้ทบทวน/i);
    expect(revTags.length).toBeGreaterThan(0);
  }, 20000);

  it('2. L5 Without Department Scope & Separation of Duties (SoD) Enforced', async () => {
    const plans = await fetchVccPlans({ status: 'DRAFT' });
    const planId = plans[0].id;

    // Submit plan assigning emp_qc_l4 and emp_pd_l5_with_qc
    await submitVccPlan(planId, 'emp_qc_l4', 'emp_pd_l5_with_qc');

    // SoD Check: Requester (emp_qc_l1) CANNOT review own plan
    useStore.setState({ currentUser: MOCK_USERS[0] });
    await expect(reviewVccPlan(planId, 'ตรวจแล้ว')).rejects.toThrow(/ผู้จัดทำไม่สามารถทบทวนแผนของตนเองได้/i);

    // Non-assigned reviewer (another user) cannot review if assigned specifically
    useStore.setState({
      currentUser: {
        id: 'other_qc_l4',
        name: 'หัวหน้า QC อีกคน',
        department: 'QC',
        approval_level: 4,
        status: 'ACTIVE'
      }
    });
    await expect(reviewVccPlan(planId, 'ตรวจแล้ว')).rejects.toThrow(/แผนนี้ถูกมอบหมายให้ผู้ทบทวนรายอื่นดำเนินการ/i);

    // Designated Reviewer (emp_qc_l4) reviews successfully
    useStore.setState({ currentUser: MOCK_USERS[1] }); // emp_qc_l4
    const reviewedPlan = await reviewVccPlan(planId, 'ทบทวนผ่าน ตารางถูกต้องครบถ้วน');
    expect(reviewedPlan.status).toBe('PENDING_APPROVAL');

    // SoD Check: Reviewer (emp_qc_l4) CANNOT approve the plan they reviewed
    await expect(approveVccPlan(planId, 'อนุมัติ')).rejects.toThrow(/ผู้ทบทวนไม่สามารถอนุมัติแผนที่ตน.*ทบทวนได้/i);

    // WH L5 (without QC scope) CANNOT approve QC plan
    useStore.setState({ currentUser: MOCK_USERS[3] }); // emp_wh_l5_no_qc
    await expect(approveVccPlan(planId, 'อนุมัติ')).rejects.toThrow(/(คุณไม่มีสิทธิ์อนุมัติแผนการสอบเทียบของแผนก QC|เฉพาะผู้ใช้งานแผนก DCC, QC และ QA)/i);

    // Designated Approver with Secondary QC (emp_pd_l5_with_qc) approves successfully
    useStore.setState({ currentUser: MOCK_USERS[2] }); // emp_pd_l5_with_qc
    const approvedPlan = await approveVccPlan(planId, 'อนุมัติแผนประจำปี 2026');
    expect(approvedPlan.status).toBe('APPROVED');
    expect(approvedPlan.approved_by).toBe('emp_pd_l5_with_qc');
  });

  it('3. Single Shared Task Infrastructure: syncVccTasks generates individual assigned tasks for reviewers & approvers', async () => {
    const plans = await fetchVccPlans({ status: 'DRAFT' });
    const planId = plans[0].id;

    // Submit plan
    await submitVccPlan(planId, 'emp_qc_l4', 'emp_pd_l5_with_qc');

    // Reviewer emp_qc_l4 syncs tasks -> sees actionable task for FM-QC-46
    const reviewerTasks = await syncVccTasks(MOCK_USERS[1]);
    expect(reviewerTasks.length).toBeGreaterThan(0);
    const revTask = reviewerTasks.find((t) => t.planId === planId);
    expect(revTask).toBeDefined();
    expect(revTask.assigneeId).toBe('emp_qc_l4');
    expect(revTask.taskType).toBe('VCC_PLAN_REVIEW');
    expect(revTask.referenceType).toBe('VCC_PLAN');

    // Approver emp_pd_l5_with_qc does NOT see review task
    const approverTasksBeforeReview = await syncVccTasks(MOCK_USERS[2]);
    expect(approverTasksBeforeReview.some((t) => t.planId === planId)).toBe(false);

    // Review plan as emp_qc_l4
    useStore.setState({ currentUser: MOCK_USERS[1] });
    await reviewVccPlan(planId, 'ทบทวนผ่าน');

    // Approver emp_pd_l5_with_qc now sees approval task
    const approverTasksAfterReview = await syncVccTasks(MOCK_USERS[2]);
    const appTask = approverTasksAfterReview.find((t) => t.planId === planId);
    expect(appTask).toBeDefined();
    expect(appTask.assigneeId).toBe('emp_pd_l5_with_qc');
    expect(appTask.taskType).toBe('VCC_PLAN_APPROVE');
  });

  it('4. Central Task Inbox: VCC tasks route cleanly to /vcc/plans with planId and target tab', async () => {
    const plans = await fetchVccPlans({ status: 'DRAFT' });
    const planId = plans[0].id;
    await submitVccPlan(planId, 'emp_qc_l4', 'emp_pd_l5_with_qc');

    // Set reviewer as currentUser and populate tasks in store
    useStore.setState({ currentUser: MOCK_USERS[1] });
    await syncVccTasks(MOCK_USERS[1]);

    render(
      <MemoryRouter initialEntries={['/dcc/tasks']}>
        <TaskInbox />
      </MemoryRouter>
    );

    // Task should be visible in Central Task Inbox
    expect(await screen.findByText(/ทบทวนแผนสอบเทียบประจำปี \(VCC\)/i)).toBeInTheDocument();
    expect(screen.getByText('FM-QC-46')).toBeInTheDocument();
  }, 20000);

  it('5. Intelligent Default Tab: Reviewer opening Annual Plan defaults to PENDING_REVIEW with pending plan active', async () => {
    const plans = await fetchVccPlans({ status: 'DRAFT' });
    const planId = plans[0].id;
    await submitVccPlan(planId, 'emp_qc_l4', 'emp_pd_l5_with_qc');

    // Set reviewer as currentUser and sync tasks
    useStore.setState({ currentUser: MOCK_USERS[1] });
    await syncVccTasks(MOCK_USERS[1]);

    render(<AssetRegisterPage initialEntries={['/vcc/plans']} />);

    // Should immediately show PENDING_REVIEW tab and action buttons (NOT stuck on empty DRAFT)
    expect(await screen.findByRole('button', { name: /ยืนยันการทบทวน/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ส่งกลับแก้ไข/i })).toBeInTheDocument();
    const revTags = await screen.findAllByText(/ผู้ทบทวน: สมศรี ผู้ทบทวน/i);
    expect(revTags.length).toBeGreaterThan(0);
  }, 20000);

  it('6. Direct Plan Navigation by URL: ?id=... selects the plan and its status tab automatically', async () => {
    const plans = await fetchVccPlans({ status: 'DRAFT' });
    const planId = plans[0].id;
    await submitVccPlan(planId, 'emp_qc_l4', 'emp_pd_l5_with_qc');

    useStore.setState({ currentUser: MOCK_USERS[1] });

    render(<AssetRegisterPage initialEntries={[`/vcc/plans?id=${encodeURIComponent(planId)}`]} />);

    // Auto-detects that plan is in PENDING_REVIEW and shows review action buttons
    expect(await screen.findByRole('button', { name: /ยืนยันการทบทวน/i })).toBeInTheDocument();
  }, 20000);

  it('7. Workflow Plan Locking: Pending plans cannot have items added or deleted', async () => {
    const plans = await fetchVccPlans({ status: 'DRAFT' });
    const planId = plans[0].id;
    await submitVccPlan(planId, 'emp_qc_l4', 'emp_pd_l5_with_qc');

    useStore.setState({ currentUser: MOCK_USERS[1] });

    render(<AssetRegisterPage initialEntries={[`/vcc/plans?id=${encodeURIComponent(planId)}&tab=PENDING_REVIEW`]} />);

    // "เพิ่มรายการเครื่องมือ" and "นำเครื่องมือเข้า" buttons must be hidden in PENDING_REVIEW
    await screen.findByRole('button', { name: /ยืนยันการทบทวน/i });
    expect(screen.queryByRole('button', { name: /เพิ่มรายการเครื่องมือ/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /นำเครื่องมือเข้าอัตโนมัติ/i })).not.toBeInTheDocument();
  }, 20000);

  it('8. Rejection and Resubmission: Plan returned to REJECTED requires reason and can be corrected and resubmitted', async () => {
    const plans = await fetchVccPlans({ status: 'DRAFT' });
    const planId = plans[0].id;
    await submitVccPlan(planId, 'emp_qc_l4', 'emp_pd_l5_with_qc');

    // Reviewer rejects plan with mandatory reason
    useStore.setState({ currentUser: MOCK_USERS[1] });
    const rejectedPlan = await rejectVccPlan(planId, 'กรุณาปรับรอบทวนสอบของ V002 เป็นเดือน 8 แทน');
    expect(rejectedPlan.status).toBe('REJECTED');
    expect(rejectedPlan.rejected_reason || rejectedPlan.reject_reason).toBe('กรุณาปรับรอบทวนสอบของ V002 เป็นเดือน 8 แทน');

    // In REJECTED status, requester can edit and resubmit
    useStore.setState({ currentUser: MOCK_USERS[0] });
    const resubmitted = await submitVccPlan(planId, 'emp_qc_l4', 'emp_pd_l5_with_qc');
    expect(resubmitted.status).toBe('PENDING_REVIEW');
  });
});
