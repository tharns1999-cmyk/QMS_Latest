import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import useStore from '../../../store/useStore';
import TaskApprove from '../pages/Tasks/TaskApprove';
import TaskReview from '../pages/Tasks/TaskReview';
import ActionConfirmModal from '../../../shared/components/common/ActionConfirmModal';

describe('TaskApprove & TaskReview Runtime Verification (Zero WSOD & No motion errors)', () => {
  beforeEach(() => {
    useStore.setState({
      currentUser: {
        id: 'U002',
        name: 'คุณเรย์',
        department: 'QA',
        role: 'APPROVER'
      },
      tasks: [
        {
          id: 't-1789627537871',
          taskId: 't-1789627537871',
          darId: 'dar-001',
          title: 'อนุมัติเอกสาร SOP-QA-001',
          status: 'PENDING',
          dueDate: '2026-09-20'
        }
      ],
      dars: [
        {
          id: 'dar-001',
          darNumber: 'DAR-2026-001',
          title: 'ขั้นตอนการปฏิบัติงานการสอบเทียบ',
          type: 'REVISION',
          department: 'QA',
          docCode: 'SOP-QA-001',
          docRev: '00',
          effectiveDate: '2026-10-01',
          approvalWorkflow: [
            { step: 1, roleKey: 'REQUESTER', role: 'ผู้ร้องขอ', name: 'พนักงาน QA' },
            { step: 2, roleKey: 'REVIEWER', role: 'ผู้ทบทวน', name: 'หัวหน้างาน QA' },
            { step: 3, roleKey: 'APPROVER', role: 'ผู้อนุมัติ', name: 'คุณเรย์' },
            { step: 4, roleKey: 'DCC', role: 'เจ้าหน้าที่ DCC', name: 'ธนาวุฒิ สมควรกิจดำรง' }
          ]
        }
      ],
      documents: [],
      timeline: [],
      masterDepartments: [{ id: 'QA', nameTh: 'แผนกควบคุมคุณภาพ', name: 'Quality Assurance' }],
      masterUsers: [
        { id: 'u-dcc-01', name: 'ธนาวุฒิ สมควรกิจดำรง', isDcc: true, role: 'DCC_ADMIN' }
      ]
    });
  });

  it('renders TaskApprove without motion ReferenceError when task is found', () => {
    render(
      <MemoryRouter initialEntries={['/dcc/tasks/approve/t-1789627537871']}>
        <Routes>
          <Route path="/dcc/tasks/approve/:id" element={<TaskApprove />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('อนุมัติเอกสาร')).toBeDefined();
    expect(screen.getByText('DAR-2026-001')).toBeDefined();
    expect(screen.getByText('เอกสารฉบับเต็ม')).toBeDefined();
  });

  it('renders TaskApprove fallback safely without ReferenceError when task is not found', () => {
    render(
      <MemoryRouter initialEntries={['/dcc/tasks/approve/non-existent-task']}>
        <Routes>
          <Route path="/dcc/tasks/approve/:id" element={<TaskApprove />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('ไม่พบข้อมูลคำร้องหรือภารกิจนี้')).toBeDefined();
    expect(screen.getByText('กลับสู่หน้ารายการงาน (Task Inbox)')).toBeDefined();
  });

  it('renders TaskReview without motion ReferenceError', () => {
    render(
      <MemoryRouter initialEntries={['/dcc/tasks/review/t-1789627537871']}>
        <Routes>
          <Route path="/dcc/tasks/review/:id" element={<TaskReview />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('ทบทวนเอกสาร')).toBeDefined();
    expect(screen.getByText('DAR-2026-001')).toBeDefined();
  });

  it('displays Forward to DCC card and does NOT self-target to Khun Ray in TaskApprove confirmation modal', () => {
    render(
      <MemoryRouter initialEntries={['/dcc/tasks/approve/t-1789627537871']}>
        <Routes>
          <Route path="/dcc/tasks/approve/:id" element={<TaskApprove />} />
        </Routes>
      </MemoryRouter>
    );

    // Click on the Approve action button to open confirmation modal
    const approveBtn = screen.getByRole('button', { name: /อนุมัติ \(Approve\)/i });
    fireEvent.click(approveBtn);

    // Verify modal is opened
    expect(screen.getAllByText('ยืนยันการอนุมัติเอกสาร').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('(Approve DAR)')).toBeDefined();

    // Verify Case 1: Forwarding to DCC
    expect(screen.getByText('ส่งมอบงานต่อให้ Document Control Center (DCC)')).toBeDefined();
    expect(screen.getByText('เพื่อดำเนินการขึ้นทะเบียน ประทับตรา และแจกจ่ายสำเนาควบคุมตามระเบียบ')).toBeDefined();

    // CRITICAL: Ensure it does NOT show self-referential forwarding "ส่งต่อเพื่อพิจารณาขั้นถัดไป: คุณเรย์"
    expect(screen.queryByText(/ส่งต่อเพื่อพิจารณาขั้นถัดไป/i)).toBeNull();
  });

  it('displays Approval Completed card when Approver is the absolute final step without DCC', () => {
    // Set workflow with no DCC step (Approver is absolute final step)
    useStore.setState({
      dars: [
        {
          id: 'dar-001',
          darNumber: 'DAR-2026-001',
          title: 'ขั้นตอนการปฏิบัติงานการสอบเทียบ',
          type: 'REVISION',
          department: 'QA',
          docCode: 'SOP-QA-001',
          docRev: '00',
          effectiveDate: '2026-10-01',
          approvalWorkflow: [
            { step: 1, roleKey: 'REQUESTER', role: 'ผู้ร้องขอ', name: 'พนักงาน QA' },
            { step: 2, roleKey: 'REVIEWER', role: 'ผู้ทบทวน', name: 'หัวหน้างาน QA' },
            { step: 3, roleKey: 'APPROVER', role: 'ผู้อนุมัติ', name: 'คุณเรย์' }
          ]
        }
      ]
    });

    render(
      <MemoryRouter initialEntries={['/dcc/tasks/approve/t-1789627537871']}>
        <Routes>
          <Route path="/dcc/tasks/approve/:id" element={<TaskApprove />} />
        </Routes>
      </MemoryRouter>
    );

    const approveBtn = screen.getByRole('button', { name: /อนุมัติ \(Approve\)/i });
    fireEvent.click(approveBtn);

    // Verify Case 2: Final Completion
    expect(screen.getByText('สิ้นสุดขั้นตอนการอนุมัติ (Approval Completed)')).toBeDefined();
    expect(screen.getByText('เอกสารจะถูกปรับสถานะเป็น "มีผลบังคับใช้ (Active)" ทันที')).toBeDefined();

    // Verify no self-targeting
    expect(screen.queryByText(/ส่งต่อเพื่อพิจารณาขั้นถัดไป: คุณเรย์/i)).toBeNull();
  });

  it('renders sleek Success / Already Completed Card when accessing an already completed task', () => {
    useStore.setState({
      completedTasks: [
        {
          id: 't-completed-999',
          taskId: 't-completed-999',
          darId: 'dar-001',
          title: 'อนุมัติเอกสาร SOP-QA-001',
          status: 'COMPLETED',
          is_completed: true,
          completedAt: '2026-09-17T15:30:00.000Z',
          completedBy: 'คุณเรย์ (ผู้อนุมัติ)',
          completedAction: 'APPROVE'
        }
      ]
    });

    render(
      <MemoryRouter initialEntries={['/dcc/tasks/approve/t-completed-999']}>
        <Routes>
          <Route path="/dcc/tasks/approve/:id" element={<TaskApprove />} />
          <Route path="/dcc/tasks" element={<div>Task Inbox Screen</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Verify Success Card is displayed
    expect(screen.getByText('คำร้องนี้ได้รับการอนุมัติเสร็จสิ้นแล้ว')).toBeDefined();
    expect(screen.getByText(/อนุมัติเสร็จสิ้นโดย/i)).toBeDefined();
    expect(screen.getByText(/คุณเรย์ \(ผู้อนุมัติ\)/i)).toBeDefined();
    expect(screen.getByText('กลับสู่หน้ารายการงาน (Task Inbox)')).toBeDefined();

    // Verify it does NOT render error fallback
    expect(screen.queryByText('ไม่พบข้อมูลคำร้องหรือภารกิจนี้')).toBeNull();

    // Verify primary button navigates to /dcc/tasks
    const inboxBtn = screen.getByRole('button', { name: /กลับสู่หน้ารายการงาน \(Task Inbox\)/i });
    fireEvent.click(inboxBtn);
    expect(screen.getByText('Task Inbox Screen')).toBeDefined();
  });

  it('submitting approval navigates cleanly to /dcc/tasks and records task in completedTasks without error flash', async () => {
    render(
      <MemoryRouter initialEntries={['/dcc/tasks/approve/t-1789627537871']}>
        <Routes>
          <Route path="/dcc/tasks/approve/:id" element={<TaskApprove />} />
          <Route path="/dcc/tasks" element={<div>Task Inbox Screen</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Open confirmation modal
    const approveBtn = screen.getByRole('button', { name: /อนุมัติ \(Approve\)/i });
    fireEvent.click(approveBtn);

    // In modal, click confirm
    const confirmBtn = await screen.findByRole('button', { name: /ยืนยันการอนุมัติเอกสาร/i });
    fireEvent.click(confirmBtn);

    // Should navigate to Task Inbox Screen immediately
    expect(await screen.findByText('Task Inbox Screen')).toBeDefined();

    // Should verify task is now in completedTasks
    const completed = useStore.getState().completedTasks;
    expect(completed.some(t => t.id === 't-1789627537871' && t.status === 'COMPLETED')).toBe(true);

    // Should verify task is removed from pending tasks
    const pending = useStore.getState().tasks;
    expect(pending.some(t => t.id === 't-1789627537871')).toBe(false);
  });
});

describe('ActionConfirmModal Dynamic Presentation Unit Tests', () => {
  const currentActor = { id: 'U-RAY', name: 'คุณเรย์', role: 'APPROVER' };

  it('renders Case 1 (DCC Forwarding) correctly and prevents self-targeting', () => {
    const dar = {
      approvalWorkflow: [
        { step: 1, roleKey: 'REQUESTER', name: 'ผู้ร้องขอ' },
        { step: 2, roleKey: 'REVIEWER', name: 'ผู้ทบทวน' },
        { step: 3, roleKey: 'APPROVER', name: 'คุณเรย์' },
        { step: 4, roleKey: 'DCC', name: 'DCC Officer' }
      ]
    };

    render(
      <ActionConfirmModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="ยืนยันการอนุมัติเอกสาร"
        actionType="approve"
        dar={dar}
        currentActor={currentActor}
        currentStep="APPROVER"
        summaryData={[
          { label: 'ผู้อนุมัติ', value: 'คุณเรย์ (QA)' },
          { label: 'สายการอนุมัติถัดไป', value: 'ส่งมอบงานต่อให้ Document Control Center (DCC)' }
        ]}
      />
    );

    expect(screen.getByText('ส่งมอบงานต่อให้ Document Control Center (DCC)')).toBeDefined();
    expect(screen.getByText('เพื่อดำเนินการขึ้นทะเบียน ประทับตรา และแจกจ่ายสำเนาควบคุมตามระเบียบ')).toBeDefined();
    expect(screen.queryByText(/ส่งต่อเพื่อพิจารณาขั้นถัดไป: คุณเรย์/i)).toBeNull();
  });

  it('renders Case 2 (Final Completion) when Approver is final step', () => {
    const dar = {
      approvalWorkflow: [
        { step: 1, roleKey: 'REQUESTER', name: 'ผู้ร้องขอ' },
        { step: 2, roleKey: 'REVIEWER', name: 'ผู้ทบทวน' },
        { step: 3, roleKey: 'APPROVER', name: 'คุณเรย์' }
      ]
    };

    render(
      <ActionConfirmModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="ยืนยันการอนุมัติเอกสาร"
        actionType="approve"
        dar={dar}
        currentActor={currentActor}
        currentStep="APPROVER"
        summaryData={[
          { label: 'ผู้อนุมัติ', value: 'คุณเรย์ (QA)' },
          { label: 'สายการอนุมัติถัดไป', value: 'สิ้นสุดขั้นตอนการอนุมัติ (Approval Completed)' }
        ]}
      />
    );

    expect(screen.getByText('สิ้นสุดขั้นตอนการอนุมัติ (Approval Completed)')).toBeDefined();
    expect(screen.getByText('เอกสารจะถูกปรับสถานะเป็น "มีผลบังคับใช้ (Active)" ทันที')).toBeDefined();
    expect(screen.queryByText(/ส่งต่อเพื่อพิจารณาขั้นถัดไป: คุณเรย์/i)).toBeNull();
  });

  it('renders ISO 9001 Recall & Disposition messaging for Obsolete DAR in ActionConfirmModal', () => {
    const obsoleteDar = {
      type: 'OBSOLETE',
      approvalWorkflow: [
        { step: 1, roleKey: 'REQUESTER', name: 'พนักงาน QA' },
        { step: 2, roleKey: 'REVIEWER', name: 'หัวหน้างาน QA' },
        { step: 3, roleKey: 'APPROVER', name: 'คุณเรย์' },
        { step: 4, roleKey: 'DCC', name: 'เจ้าหน้าที่ DCC' }
      ]
    };

    render(
      <ActionConfirmModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="ยืนยันการอนุมัติยกเลิกเอกสาร (Approve Obsolete DAR)"
        actionType="obsolete"
        dar={obsoleteDar}
        currentActor={currentActor}
        currentStep="APPROVER"
        summaryData={[
          { label: 'ผู้อนุมัติ', value: 'คุณเรย์ (QA)' },
          { label: 'สายการอนุมัติถัดไป', value: 'ส่งมอบงานต่อให้ Document Control Center (DCC)' }
        ]}
      />
    );

    // Contextual ISO 9001 Recall & Disposition description
    expect(screen.getByText('ส่งมอบงานต่อให้ Document Control Center (DCC)')).toBeDefined();
    expect(
      screen.getByText('เพื่อดำเนินการปลดระวาง เรียกคืนสำเนาควบคุมทั้งหมดในระบบ และบันทึกผลการทำลายตามระเบียบ (Recall & Disposition)')
    ).toBeDefined();

    // Confirm button text
    expect(screen.getByRole('button', { name: /ยืนยันการอนุมัติยกเลิกเอกสาร/i })).toBeDefined();
  });

  it('switches button and modal to Obsolete workflow when TaskApprove renders an Obsolete DAR', () => {
    useStore.setState({
      dars: [
        {
          id: 'dar-obs-001',
          darNumber: 'DAR-2026-OBS',
          title: 'คู่มือการปฏิบัติงานที่ถูกยกเลิก',
          type: 'OBSOLETE',
          department: 'QA',
          docCode: 'SOP-QA-999',
          docRev: '02',
          approvalWorkflow: [
            { step: 1, roleKey: 'REQUESTER', role: 'ผู้ร้องขอ', name: 'พนักงาน QA' },
            { step: 2, roleKey: 'REVIEWER', role: 'ผู้ทบทวน', name: 'หัวหน้างาน QA' },
            { step: 3, roleKey: 'APPROVER', role: 'ผู้อนุมัติ', name: 'คุณเรย์' },
            { step: 4, roleKey: 'DCC', role: 'DCC', name: 'เจ้าหน้าที่ DCC' }
          ]
        }
      ],
      tasks: [
        {
          id: 'task-obs-001',
          taskId: 'task-obs-001',
          darId: 'dar-obs-001',
          title: 'คู่มือการปฏิบัติงานที่ถูกยกเลิก',
          status: 'PENDING',
          assigneeName: 'คุณเรย์'
        }
      ]
    });

    render(
      <MemoryRouter initialEntries={['/dcc/tasks/approve/task-obs-001']}>
        <Routes>
          <Route path="/dcc/tasks/approve/:id" element={<TaskApprove />} />
        </Routes>
      </MemoryRouter>
    );

    // Verify Obsolete Approve button text and styling
    const obsoleteBtn = screen.getByRole('button', { name: /อนุมัติยกเลิกเอกสาร \(Approve Obsolete\)/i });
    expect(obsoleteBtn).toBeDefined();
    expect(obsoleteBtn.className).toContain('bg-rose-600');

    // Click button to open confirmation modal
    fireEvent.click(obsoleteBtn);

    // Modal title & Next Step Recall & Disposition message
    expect(screen.getAllByText('ยืนยันการอนุมัติยกเลิกเอกสาร').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('(Approve Obsolete DAR)')).toBeDefined();
    expect(
      screen.getByText('เพื่อดำเนินการปลดระวาง เรียกคืนสำเนาควบคุมทั้งหมดในระบบ และบันทึกผลการทำลายตามระเบียบ (Recall & Disposition)')
    ).toBeDefined();
  });
});
