import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import useStore from '../../../store/useStore';
import { evaluateDocumentReviewStatus } from '../utils/documentUtils';
import PeriodicReviewDashboard from '../pages/PeriodicReviews/PeriodicReviewDashboard';
import DocumentDetailModal from '../components/workflow/DocumentDetailModal';

const reviewer = { id: 'U005', name: 'บีม', role: 'DEPT_ADMIN', level: 4, approval_level: 4, department: 'QC', dept: 'QC', depts: ['QC'], position: 'QAQC Supervisor' };
const supervisorQc = { id: 'U009', name: 'หัวหน้างาน QC', role: 'DEPT_ADMIN', level: 4, approval_level: 4, department: 'QC', dept: 'QC', depts: ['QC'], position: 'QC Supervisor' };
const approver = { id: 'U003', name: 'กัลยาณี', role: 'DEPT_ADMIN', level: 5, approval_level: 5, department: 'PD', dept: 'PD', depts: ['PD', 'QC'], position: 'Production Assistant Manager' };

const submitForApproval = () => {
  useStore.getState().submitPeriodicReview({
    scheduleId: useStore.getState().periodicReviewSchedules[0].id,
    outcome: 'NO_CHANGE',
    comment: 'ทบทวนแล้ว',
    reviewDetails: { reason: 'ทบทวนแล้ว' }
  });
  return useStore.getState().tasks.find(t => t.type === 'PERIODIC_REVIEW_APPROVAL' || t.taskType === 'PERIODIC_REVIEW_APPROVAL');
};

describe('Periodic review: status after the approval decision', () => {
  beforeEach(() => {
    useStore.setState({
      simulatedSystemDate: '2028-10-03',
      currentUser: reviewer,
      users: [reviewer, approver],
      masterUsers: [reviewer, approver],
      documents: [{ id: 'DOC-QC-01', doc_code: 'WI-QC-01', code: 'WI-QC-01', title: 'AAAAA', rev: '00', department: 'QC', status: 'EFFECTIVE', type: 'WI', effectiveDate: '2026-10-20', next_review_date: '2028-10-20', ownerId: 'U005' }],
      externalDocuments: [],
      periodicReviewSchedules: [],
      periodicReviewTasks: [],
      periodicReviewRecords: [],
      tasks: [],
      actionLog: []
    });
    useStore.getState().initializePeriodicReviews();
    useStore.getState().syncPeriodicReviewSchedulesAndTasks();
  });

  it('approved review counts as COMPLETED in the KPI card and the "ดำเนินการแล้วเสร็จ" tab', () => {
    const task = submitForApproval();
    expect(task).toBeDefined();
    useStore.getState().approvePeriodicReview({ taskId: task.id, approverUser: approver, remarks: 'ok' });

    const schedule = useStore.getState().periodicReviewSchedules[0];
    expect(schedule.review_status).not.toBe('PENDING_APPROVAL');
    expect(schedule.pending_periodic_review).toBe(false);
    expect(evaluateDocumentReviewStatus({ ...schedule, targetDoc: useStore.getState().documents[0] }, new Date('2028-10-03')).status).toBe('COMPLETED');

    render(<MemoryRouter><PeriodicReviewDashboard /></MemoryRouter>);
    const card = (label) => screen.getAllByText(label)[0].closest('.card-surface').querySelector('h3.text-3xl');
    expect(card('ทบทวนแล้วเสร็จ')).toHaveTextContent('1');

    fireEvent.click(screen.getByText('ดำเนินการแล้วเสร็จ'));
    expect(screen.getByText('WI-QC-01')).toBeDefined();
    fireEvent.click(screen.getByText('ยังไม่ถึงกำหนด'));
    expect(screen.queryByText('WI-QC-01')).toBeNull();
  });

  it('rejected review no longer reads as pending approval', () => {
    const task = submitForApproval();
    useStore.getState().rejectPeriodicReview({ taskId: task.id, approverUser: approver, remarks: 'แก้ไขเหตุผล' });

    const schedule = useStore.getState().periodicReviewSchedules[0];
    expect(schedule.review_status).toBe('ACTION_REQUIRED');
    expect(schedule.pending_periodic_review).toBe(false);
    expect(evaluateDocumentReviewStatus({ ...schedule, targetDoc: useStore.getState().documents[0] }, new Date('2028-10-03')).status).toBe('DUE_SOON');
  });

  it('an L4 supervisor cannot approve an internal review (approval needs L5+ of the owner dept)', () => {
    const task = submitForApproval();
    useStore.getState().approvePeriodicReview({ taskId: task.id, approverUser: supervisorQc, remarks: 'ok' });
    useStore.getState().rejectPeriodicReview({ taskId: task.id, approverUser: supervisorQc, remarks: 'no' });

    const schedule = useStore.getState().periodicReviewSchedules[0];
    expect(schedule.review_status).toBe('PENDING_APPROVAL');
    expect(schedule.is_reviewed_this_cycle).not.toBe(true);
  });

  it('document detail "บันทึกผลทบทวน" opens the review page instead of self-approving NO_CHANGE', () => {
    const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
    const doc = useStore.getState().documents[0];
    const scheduleId = useStore.getState().periodicReviewSchedules[0].id;
    render(
      <MemoryRouter initialEntries={['/library']}>
        <Routes>
          <Route path="/library" element={<DocumentDetailModal isOpen onClose={() => {}} document={doc} />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('ประวัติการทบทวนตามรอบ'));
    fireEvent.click(screen.getByText('บันทึกผลทบทวน'));

    expect(screen.getByTestId('where')).toHaveTextContent(`/dcc/periodic-reviews/${scheduleId}`);
    const schedule = useStore.getState().periodicReviewSchedules[0];
    expect(schedule.is_reviewed_this_cycle).not.toBe(true);
    expect(schedule.nextReviewDate).toBe('2028-10-20');
  });
});
