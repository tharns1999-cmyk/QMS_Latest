import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../../../store/useStore';
import { canPerformPeriodicReview, isQaProxyReviewer } from '../services/PeriodicReviewAccessService';

const qaL4 = { id: 'U-QA-04', name: 'QA Officer', role: 'DEPT_ADMIN', level: 4, approval_level: 4, department: 'QA', dept: 'QA', depts: ['QA'] };
const qaL3 = { ...qaL4, id: 'U-QA-03', level: 3, approval_level: 3 };
const pdManager = { id: 'U-PD-05', name: 'PD Manager', role: 'DEPT_ADMIN', level: 5, approval_level: 5, department: 'PD', dept: 'PD', depts: ['PD'] };
const pdDoc = { id: 'DOC-PD-01', doc_code: 'WI-PD-01', code: 'WI-PD-01', title: 'WI-PD-01', rev: '00', department: 'PD', status: 'EFFECTIVE', type: 'WI', effectiveDate: '2026-10-20', next_review_date: '2028-10-20', ownerId: 'U-PD-05' };
const schedule = { id: 'PRS-PD-01', documentId: 'DOC-PD-01', documentNumber: 'WI-PD-01', ownerDepartmentId: 'PD', status: 'ACTION_REQUIRED', documentCategory: 'INTERNAL' };

describe('QA proxy periodic review', () => {
  beforeEach(() => {
    useStore.setState({
      simulatedSystemDate: '2028-10-03',
      currentUser: qaL4,
      users: [qaL4, pdManager],
      masterUsers: [qaL4, pdManager],
      documents: [pdDoc],
      externalDocuments: [],
      periodicReviewSchedules: [{ ...schedule, nextReviewDate: '2028-10-20', isActive: true }],
      periodicReviewTasks: [],
      periodicReviewRecords: [],
      tasks: [],
      actionLog: []
    });
  });

  it('QA L4+ may review another department, below L4 may not; owner dept members are never proxies', () => {
    expect(isQaProxyReviewer(qaL4, 'PD')).toBe(true);
    expect(isQaProxyReviewer(qaL3, 'PD')).toBe(false);
    expect(isQaProxyReviewer(pdManager, 'PD')).toBe(false);
    expect(canPerformPeriodicReview(qaL4, schedule, pdDoc)).toBe(true);
    expect(canPerformPeriodicReview(qaL3, schedule, pdDoc)).toBe(false);
  });

  it('stamps reviewed_by_proxy through submission and owner-dept approval', () => {
    useStore.getState().submitPeriodicReview({ scheduleId: 'PRS-PD-01', outcome: 'NO_CHANGE', comment: 'QA proxy', reviewDetails: { reason: 'QA proxy' } });
    const task = useStore.getState().tasks.find(t => t.type === 'PERIODIC_REVIEW_APPROVAL');
    expect(task.payload).toMatchObject({ reviewer_id: 'U-QA-04', reviewed_by_proxy: true, proxy_department: 'QA' });

    useStore.getState().approvePeriodicReview({ taskId: task.id, approverUser: pdManager, remarks: 'ok' });
    const history = useStore.getState().documents.find(d => d.id === 'DOC-PD-01').periodic_reviews || [];
    expect(history.at(-1) ?? history[0]).toMatchObject({ reviewer_id: 'U-QA-04', reviewed_by_proxy: true, proxy_department: 'QA' });
  });
});
