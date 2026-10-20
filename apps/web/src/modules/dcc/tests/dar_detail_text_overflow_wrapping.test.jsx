import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import useStore from '../../../store/useStore';
import TaskReview from '../pages/Tasks/TaskReview';
import TaskApprove from '../pages/Tasks/TaskApprove';
import DarDetail from '../pages/DarWorkflow/DarDetail';

describe('DAR Detail Boxes Text Overflow & Strict Word-Wrapping', () => {
  const longUnbrokenReason = 'VERYLONGUNBROKENREASONSTRINGWITHOUTSPACESFORTESTINGTEXTOVERFLOWPREVENTIONABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
  const longUnbrokenChangeSummary = 'VERYLONGUNBROKENCHANGESUMMARYSTRINGWITHOUTSPACESFORTESTINGTEXTOVERFLOWPREVENTIONABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
  const longUnbrokenComment = 'VERYLONGUNBROKENCOMMENTSTRINGWITHOUTSPACESFORTESTINGTIMELINEOVERFLOWPREVENTIONABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';

  const overflowDar = {
    id: 'dar-overflow-001',
    darNumber: 'DAR-2026-OVERFLOW',
    title: 'เอกสารทดสอบการตัดคำและป้องกันการล้นกรอบ',
    type: 'REVISION',
    department: 'QA',
    docCode: 'SOP-QA-999',
    docRev: '00',
    effectiveDate: '2026-10-15',
    reason: longUnbrokenReason,
    change_summary: longUnbrokenChangeSummary,
    changeSummary: longUnbrokenChangeSummary,
    approvalWorkflow: [
      { step: 1, roleKey: 'REQUESTER', role: 'ผู้ร้องขอ', name: 'พนักงาน QA' },
      { step: 2, roleKey: 'REVIEWER', role: 'ผู้ทบทวน', name: 'หัวหน้างาน QA' },
      { step: 3, roleKey: 'APPROVER', role: 'ผู้อนุมัติ', name: 'คุณเรย์' }
    ]
  };

  const reviewTask = {
    id: 'task-review-001',
    taskId: 'task-review-001',
    darId: 'dar-overflow-001',
    title: 'ทบทวนเอกสาร SOP-QA-999',
    status: 'PENDING',
    type: 'REVIEW',
    dueDate: '2026-10-10'
  };

  const approveTask = {
    id: 'task-approve-001',
    taskId: 'task-approve-001',
    darId: 'dar-overflow-001',
    title: 'อนุมัติเอกสาร SOP-QA-999',
    status: 'PENDING',
    type: 'APPROVE',
    dueDate: '2026-10-12'
  };

  beforeEach(() => {
    useStore.setState({
      currentUser: {
        id: 'U002',
        name: 'คุณเรย์',
        department: 'QA',
        role: 'APPROVER'
      },
      tasks: [reviewTask, approveTask],
      dars: [overflowDar],
      documents: [],
      timeline: [
        {
          id: 'tl-1',
          darId: 'dar-overflow-001',
          user: 'ผู้ร้องขอ QA',
          date: '2026-10-02',
          comment: longUnbrokenComment
        }
      ],
      masterDepartments: [{ id: 'QA', nameTh: 'แผนกควบคุมคุณภาพ', name: 'Quality Assurance' }],
      masterUsers: [
        { id: 'U001', name: 'พนักงาน QA', department: 'QA', level: 2 },
        { id: 'U002', name: 'คุณเรย์', department: 'QA', level: 5 }
      ]
    });
  });

  it('1. TaskReview enforces strict overflow wrapping and container bounds on reason, change summary, and comments', () => {
    render(
      <MemoryRouter initialEntries={['/tasks/review/task-review-001']}>
        <Routes>
          <Route path="/tasks/review/:id" element={<TaskReview />} />
        </Routes>
      </MemoryRouter>
    );

    // Verify reason paragraph
    const reasonP = screen.getByText(longUnbrokenReason);
    expect(reasonP).toBeInTheDocument();
    expect(reasonP.className).toContain('break-words');
    expect(reasonP.className).toContain('[overflow-wrap:anywhere]');
    expect(reasonP.className).toContain('break-all');

    // Verify container box bounds
    const reasonBox = reasonP.closest('.p-3');
    expect(reasonBox).toBeInTheDocument();
    expect(reasonBox.className).toContain('min-w-0');
    expect(reasonBox.className).toContain('overflow-hidden');
    expect(reasonBox.className).toContain('w-full');

    // Verify change summary paragraph
    const summaryP = screen.getByText(longUnbrokenChangeSummary);
    expect(summaryP).toBeInTheDocument();
    expect(summaryP.className).toContain('break-words');
    expect(summaryP.className).toContain('[overflow-wrap:anywhere]');
    expect(summaryP.className).toContain('break-all');

    const summaryBox = summaryP.closest('.p-3');
    expect(summaryBox).toBeInTheDocument();
    expect(summaryBox.className).toContain('min-w-0');
    expect(summaryBox.className).toContain('overflow-hidden');
    expect(summaryBox.className).toContain('w-full');

    // Verify timeline comment wrapping
    const commentP = screen.getByText(longUnbrokenComment);
    expect(commentP).toBeInTheDocument();
    expect(commentP.className).toContain('break-words');
    expect(commentP.className).toContain('[overflow-wrap:anywhere]');
    expect(commentP.className).toContain('break-all');

    const commentBox = commentP.closest('.p-2\\.5');
    expect(commentBox).toBeInTheDocument();
    expect(commentBox.className).toContain('min-w-0');
    expect(commentBox.className).toContain('overflow-hidden');
    expect(commentBox.className).toContain('w-full');
  });

  it('2. TaskApprove enforces strict overflow wrapping and container bounds on reason, change summary, and comments', () => {
    render(
      <MemoryRouter initialEntries={['/tasks/approve/task-approve-001']}>
        <Routes>
          <Route path="/tasks/approve/:id" element={<TaskApprove />} />
        </Routes>
      </MemoryRouter>
    );

    // Verify reason paragraph
    const reasonP = screen.getByText(longUnbrokenReason);
    expect(reasonP).toBeInTheDocument();
    expect(reasonP.className).toContain('break-words');
    expect(reasonP.className).toContain('[overflow-wrap:anywhere]');
    expect(reasonP.className).toContain('break-all');

    const reasonBox = reasonP.closest('.p-3');
    expect(reasonBox).toBeInTheDocument();
    expect(reasonBox.className).toContain('min-w-0');
    expect(reasonBox.className).toContain('overflow-hidden');
    expect(reasonBox.className).toContain('w-full');

    // Verify change summary paragraph
    const summaryP = screen.getByText(longUnbrokenChangeSummary);
    expect(summaryP).toBeInTheDocument();
    expect(summaryP.className).toContain('break-words');
    expect(summaryP.className).toContain('[overflow-wrap:anywhere]');
    expect(summaryP.className).toContain('break-all');

    const summaryBox = summaryP.closest('.p-3');
    expect(summaryBox).toBeInTheDocument();
    expect(summaryBox.className).toContain('min-w-0');
    expect(summaryBox.className).toContain('overflow-hidden');
    expect(summaryBox.className).toContain('w-full');

    // Verify timeline comment wrapping
    const commentP = screen.getByText(longUnbrokenComment);
    expect(commentP).toBeInTheDocument();
    expect(commentP.className).toContain('break-words');
    expect(commentP.className).toContain('[overflow-wrap:anywhere]');
    expect(commentP.className).toContain('break-all');

    const commentBox = commentP.closest('.p-2\\.5');
    expect(commentBox).toBeInTheDocument();
    expect(commentBox.className).toContain('min-w-0');
    expect(commentBox.className).toContain('overflow-hidden');
    expect(commentBox.className).toContain('w-full');
  });

  it('3. DarDetail enforces strict overflow wrapping and container bounds on reason and change summary', () => {
    render(
      <MemoryRouter initialEntries={['/dar/dar-overflow-001']}>
        <Routes>
          <Route path="/dar/:id" element={<DarDetail />} />
        </Routes>
      </MemoryRouter>
    );

    // Verify reason paragraph
    const reasonP = screen.getByText(longUnbrokenReason);
    expect(reasonP).toBeInTheDocument();
    expect(reasonP.className).toContain('break-words');
    expect(reasonP.className).toContain('[overflow-wrap:anywhere]');
    expect(reasonP.className).toContain('break-all');

    const reasonBox = reasonP.closest('.p-4');
    expect(reasonBox).toBeInTheDocument();
    expect(reasonBox.className).toContain('min-w-0');
    expect(reasonBox.className).toContain('overflow-hidden');
    expect(reasonBox.className).toContain('w-full');

    // Verify change summary paragraph
    const summaryP = screen.getByText(longUnbrokenChangeSummary);
    expect(summaryP).toBeInTheDocument();
    expect(summaryP.className).toContain('break-words');
    expect(summaryP.className).toContain('[overflow-wrap:anywhere]');
    expect(summaryP.className).toContain('break-all');

    const summaryBox = summaryP.closest('.p-4');
    expect(summaryBox).toBeInTheDocument();
    expect(summaryBox.className).toContain('min-w-0');
    expect(summaryBox.className).toContain('overflow-hidden');
    expect(summaryBox.className).toContain('w-full');
  });
});
