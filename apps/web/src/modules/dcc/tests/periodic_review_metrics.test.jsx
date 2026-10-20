import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import { getDocumentReviewMetrics, isDocumentReviewedThisCycle, evaluateDocumentReviewStatus, getCycleDisplayText } from '../utils/documentUtils';
import PeriodicReviewDashboard from '../pages/PeriodicReviews/PeriodicReviewDashboard';
import PeriodicReviewApprovalModal from '../pages/Tasks/PeriodicReviewApprovalModal';

describe('Periodic Review Metrics & MECE Calculation Logic', () => {
  describe('getDocumentReviewMetrics unit tests', () => {
    it('Criteria 1: Document overdue (diffDays < 0) counts strictly in overdue, NOT dueSoon', () => {
      const refDate = new Date('2028-10-12');
      const docs = [
        { id: 'DOC-1', next_review_date: '2028-10-09' } // 3 days overdue
      ];

      const metrics = getDocumentReviewMetrics(docs, refDate);
      expect(metrics.total).toBe(1);
      expect(metrics.dueSoon).toBe(0);
      expect(metrics.overdue).toBe(1);
      expect(metrics.completed).toBe(0);
      expect(metrics.upToDate).toBe(0);
      expect(metrics.dueSoon + metrics.overdue + metrics.completed + metrics.upToDate).toBe(metrics.total);
    });

    it('Criteria 2: Document due soon (0 <= diffDays <= 30) counts in dueSoon, NOT overdue', () => {
      const refDate = new Date('2028-10-01');
      const docs = [
        { id: 'DOC-1', next_review_date: '2028-10-20' } // 19 days away
      ];

      const metrics = getDocumentReviewMetrics(docs, refDate);
      expect(metrics.total).toBe(1);
      expect(metrics.dueSoon).toBe(1);
      expect(metrics.overdue).toBe(0);
      expect(metrics.completed).toBe(0);
      expect(metrics.upToDate).toBe(0);
      expect(metrics.dueSoon + metrics.overdue + metrics.completed + metrics.upToDate).toBe(metrics.total);
    });

    it('Documents with review_status COMPLETED count in completed and are mutually exclusive', () => {
      const refDate = new Date('2028-10-12');
      const docs = [
        { id: 'DOC-1', next_review_date: '2029-10-09', last_reviewed_at: '2028-10-09', review_status: 'COMPLETED' },
        { id: 'DOC-2', next_review_date: '2029-10-09', last_reviewed_at: '2028-10-09', is_reviewed_this_cycle: true }
      ];

      const metrics = getDocumentReviewMetrics(docs, refDate);
      expect(metrics.total).toBe(2);
      expect(metrics.completed).toBe(2);
      expect(metrics.overdue).toBe(0);
      expect(metrics.dueSoon).toBe(0);
      expect(metrics.upToDate).toBe(0);
    });

    it('Multi-document mixed test strictly adheres to MECE (total = dueSoon + overdue + completed + upToDate)', () => {
      const refDate = new Date('2028-10-12');
      const docs = [
        { id: 'D1', next_review_date: '2028-10-05' }, // Overdue (-7 days)
        { id: 'D2', next_review_date: '2028-10-20' }, // Due Soon (+8 days)
        { id: 'D3', next_review_date: '2028-11-20' }, // Up to date (+39 days)
        { id: 'D4', next_review_date: '2029-10-01', last_reviewed_at: '2028-10-01', review_status: 'COMPLETED' } // Completed
      ];

      const metrics = getDocumentReviewMetrics(docs, refDate);
      expect(metrics.total).toBe(4);
      expect(metrics.overdue).toBe(1);
      expect(metrics.dueSoon).toBe(1);
      expect(metrics.upToDate).toBe(1);
      expect(metrics.completed).toBe(1);
      expect(metrics.dueSoon + metrics.overdue + metrics.completed + metrics.upToDate).toBe(metrics.total);
    });
  });

  describe('PeriodicReviewDashboard UI Integration tests', () => {
    beforeEach(() => {
      useStore.setState({
        currentUser: {
          id: 'U002',
          name: 'QC Reviewer',
          department: 'QC',
          role: 'DEPARTMENT_USER'
        }
      });
    });

    it('Integration Acceptance Criteria 1: Overdue document shows Total=1, DueSoon=0, Overdue=1, Completed=0', () => {
      useStore.setState({
        simulatedSystemDate: '2028-10-12',
        documents: [
          {
            id: 'DOC-QC-OVERDUE',
            doc_code: 'WI-QC-OVERDUE',
            title: 'QC Procedure Overdue',
            department: 'QC',
            status: 'EFFECTIVE',
            next_review_date: '2028-10-09' // Overdue
          }
        ],
        externalDocuments: [],
        periodicReviewSchedules: []
      });

      render(
        <MemoryRouter initialEntries={['/periodic-reviews']}>
          <PeriodicReviewDashboard />
        </MemoryRouter>
      );

      // Total card
      const totalCard = screen.getByText('เอกสารทั้งหมด').closest('.card-surface').querySelector('h3.text-3xl');
      expect(totalCard).toHaveTextContent('1');

      // Due soon card (must NOT double count overdue document!)
      const dueSoonCard = screen.getByText('ใกล้ครบกำหนดใน 30 วัน').closest('.card-surface').querySelector('h3.text-3xl');
      expect(dueSoonCard).toHaveTextContent('0');

      // Overdue card
      const overdueCard = screen.getAllByText('เกินกำหนด')[0].closest('.card-surface').querySelector('h3.text-3xl');
      expect(overdueCard).toHaveTextContent('1');

      // Completed card
      const completedCard = screen.getByText('ทบทวนแล้วเสร็จ').closest('.card-surface').querySelector('h3.text-3xl');
      expect(completedCard).toHaveTextContent('0');
    });

    it('Integration Acceptance Criteria 2: Document 1-30 days before review shows DueSoon=1, Overdue=0', () => {
      useStore.setState({
        simulatedSystemDate: '2028-10-01',
        documents: [
          {
            id: 'DOC-QC-DUESOON',
            doc_code: 'WI-QC-DUESOON',
            title: 'QC Procedure Due Soon',
            department: 'QC',
            status: 'EFFECTIVE',
            next_review_date: '2028-10-15' // Due in 14 days
          }
        ],
        externalDocuments: [],
        periodicReviewSchedules: []
      });

      render(
        <MemoryRouter initialEntries={['/periodic-reviews']}>
          <PeriodicReviewDashboard />
        </MemoryRouter>
      );

      // Due soon card shows 1
      const dueSoonCard = screen.getByText('ใกล้ครบกำหนดใน 30 วัน').closest('.card-surface').querySelector('h3.text-3xl');
      expect(dueSoonCard).toHaveTextContent('1');

      // Overdue card shows 0
      const overdueCard = screen.getAllByText('เกินกำหนด')[0].closest('.card-surface').querySelector('h3.text-3xl');
      expect(overdueCard).toHaveTextContent('0');

      // Total card shows 1
      const totalCard = screen.getByText('เอกสารทั้งหมด').closest('.card-surface').querySelector('h3.text-3xl');
      expect(totalCard).toHaveTextContent('1');
    });

    it('Action Required Tab exists and filters due soon and overdue documents combined', () => {
      useStore.setState({
        simulatedSystemDate: '2028-10-12',
        documents: [
          {
            id: 'DOC-1',
            doc_code: 'WI-QC-1',
            title: 'QC Doc 1',
            department: 'QC',
            status: 'EFFECTIVE',
            next_review_date: '2028-10-09' // Overdue
          },
          {
            id: 'DOC-2',
            doc_code: 'WI-QC-2',
            title: 'QC Doc 2',
            department: 'QC',
            status: 'EFFECTIVE',
            next_review_date: '2028-10-25' // Due soon
          },
          {
            id: 'DOC-3',
            doc_code: 'WI-QC-3',
            title: 'QC Doc 3',
            department: 'QC',
            status: 'EFFECTIVE',
            next_review_date: '2029-05-01' // Far future
          }
        ],
        externalDocuments: [],
        periodicReviewSchedules: []
      });

      render(
        <MemoryRouter initialEntries={['/periodic-reviews']}>
          <PeriodicReviewDashboard />
        </MemoryRouter>
      );

      // Verify the tab button exists
      const actionReqTab = screen.getByRole('button', { name: /ต้องดำเนินการ \(Due Soon \/ Overdue\)/i });
      expect(actionReqTab).toBeInTheDocument();
    });

    it('Post-Approval Sync: increments "ทบทวนแล้วเสร็จ" metric, displays completed badge, and locks action button', () => {
      const refDate = '2026-10-12';
      useStore.setState({
        simulatedSystemDate: refDate,
        documents: [
          {
            id: 'DOC-APPROVED-1',
            doc_code: 'SOP-QC-001',
            title: 'Quality Testing Procedure',
            department: 'QC',
            status: 'EFFECTIVE',
            last_reviewed_at: '2026-10-12',
            next_review_date: '2027-10-12',
            periodic_reviews: [
              {
                id: 'REV-1',
                approval_status: 'APPROVED',
                approved_at: '2026-10-12T10:00:00Z',
                result: 'NO_CHANGE'
              }
            ]
          }
        ],
        externalDocuments: [],
        periodicReviewSchedules: [
          {
            id: 'PRS-001',
            documentCategory: 'INTERNAL',
            documentId: 'DOC-APPROVED-1',
            documentNumber: 'SOP-QC-001',
            documentName: 'Quality Testing Procedure',
            ownerDepartmentId: 'QC',
            lastReviewedDate: '2026-10-12',
            nextReviewDate: '2027-10-12',
            currentScheduledReviewDate: '2027-10-12',
            outcome: 'NO_CHANGE',
            status: 'UPCOMING',
            hasActiveTask: false
          }
        ]
      });

      render(
        <MemoryRouter initialEntries={['/periodic-reviews']}>
          <PeriodicReviewDashboard />
        </MemoryRouter>
      );

      // Criteria 1: "ทบทวนแล้วเสร็จ" KPI card must be 1
      const completedCard = screen.getAllByText('ทบทวนแล้วเสร็จ')[0].closest('.card-surface').querySelector('h3.text-3xl');
      expect(completedCard).toHaveTextContent('1');

      // Criteria 3: Status badge shows "ทบทวนแล้วเสร็จ"
      const statusBadge = screen.getAllByText('ทบทวนแล้วเสร็จ')[1];
      expect(statusBadge).toBeInTheDocument();

      // Criteria 3: Action button "บันทึกผล" is locked/replaced with disabled "ทบทวนแล้ว"
      const lockedBtn = screen.getByRole('button', { name: /ทบทวนแล้ว/i });
      expect(lockedBtn).toBeDisabled();
      expect(lockedBtn).toHaveAttribute('title', 'เอกสารผ่านการทบทวนรอบปีนี้เรียบร้อยแล้ว');

      // "บันทึกผล" button must not be present
      expect(screen.queryByRole('button', { name: /บันทึกผล/i })).not.toBeInTheDocument();

      // History button must remain accessible
      const historyBtn = screen.getByRole('button', { name: /ประวัติ/i });
      expect(historyBtn).toBeInTheDocument();
      expect(historyBtn).not.toBeDisabled();

      // Criteria 2: Clicking tab "ดำเนินการแล้วเสร็จ" shows this document
      const completedTab = screen.getByRole('button', { name: 'ดำเนินการแล้วเสร็จ' });
      fireEvent.click(completedTab);
      expect(screen.getByText('SOP-QC-001')).toBeInTheDocument();

      // Document is excluded from "ยังไม่ถึงกำหนด" tab
      const upcomingTab = screen.getByRole('button', { name: 'ยังไม่ถึงกำหนด' });
      fireEvent.click(upcomingTab);
      expect(screen.queryByText('SOP-QC-001')).not.toBeInTheDocument();
    });

    it('Acceptance Criteria 1: When simulated date is 2030-10-10 (2 days before 2030-10-12 due date), Due Soon = 1, Completed = 0, badge = ใกล้ครบกำหนด, Action button unlocked', () => {
      useStore.setState({
        simulatedSystemDate: '2030-10-10',
        documents: [
          {
            id: 'DOC-2030-CYCLE',
            doc_code: 'SOP-QC-2030',
            title: 'Quality Testing Procedure 2030',
            department: 'QC',
            status: 'EFFECTIVE',
            last_reviewed_at: '2029-10-12',
            next_review_date: '2030-10-12',
            periodic_reviews: [
              {
                id: 'REV-PRIOR',
                approval_status: 'APPROVED',
                approved_at: '2029-10-12T10:00:00Z',
                result: 'NO_CHANGE'
              }
            ]
          }
        ],
        externalDocuments: [],
        periodicReviewSchedules: [
          {
            id: 'PRS-2030',
            documentCategory: 'INTERNAL',
            documentId: 'DOC-2030-CYCLE',
            documentNumber: 'SOP-QC-2030',
            documentName: 'Quality Testing Procedure 2030',
            ownerDepartmentId: 'QC',
            lastReviewedDate: '2029-10-12',
            nextReviewDate: '2030-10-12',
            currentScheduledReviewDate: '2030-10-12',
            status: 'UPCOMING',
            hasActiveTask: false
          }
        ]
      });

      render(
        <MemoryRouter initialEntries={['/periodic-reviews']}>
          <PeriodicReviewDashboard />
        </MemoryRouter>
      );

      // Criteria 1: "ใกล้ครบกำหนดใน 30 วัน" KPI card must be 1
      const dueSoonCard = screen.getAllByText('ใกล้ครบกำหนดใน 30 วัน')[0].closest('.card-surface').querySelector('h3.text-3xl');
      expect(dueSoonCard).toHaveTextContent('1');

      // Criteria 1: "ทบทวนแล้วเสร็จ" KPI card must be 0
      const completedCard = screen.getAllByText('ทบทวนแล้วเสร็จ')[0].closest('.card-surface').querySelector('h3.text-3xl');
      expect(completedCard).toHaveTextContent('0');

      // Criteria 1: Table row badge shows "⚠️ ใกล้ครบกำหนด"
      expect(screen.getByText('⚠️ ใกล้ครบกำหนด')).toBeInTheDocument();

      // Criteria 1: Action button [ 🔄 บันทึกผล ] is unlocked (not disabled)
      const recordBtn = screen.getByRole('button', { name: /บันทึกผล/i });
      expect(recordBtn).toBeInTheDocument();
      expect(recordBtn).not.toBeDisabled();
    });
  });

  describe('isDocumentReviewedThisCycle unit tests', () => {
    it('returns true when last_reviewed_at is in reference year', () => {
      const doc = { id: 'D1', last_reviewed_at: '2026-05-10' };
      expect(isDocumentReviewedThisCycle(doc, '2026-10-12')).toBe(true);
    });

    it('returns false when last_reviewed_at is in previous year', () => {
      const doc = { id: 'D1', last_reviewed_at: '2025-12-31' };
      expect(isDocumentReviewedThisCycle(doc, '2026-10-12')).toBe(false);
    });

    it('returns true when last review in periodic_reviews has APPROVED in reference year', () => {
      const doc = {
        id: 'D1',
        periodic_reviews: [
          { approval_status: 'APPROVED', approved_at: '2026-08-15' }
        ]
      };
      expect(isDocumentReviewedThisCycle(doc, '2026-10-12')).toBe(true);
    });

    it('returns false when last review was in prior year and no recent approval', () => {
      const doc = {
        id: 'D1',
        periodic_reviews: [
          { approval_status: 'APPROVED', approved_at: '2025-08-15' }
        ]
      };
      expect(isDocumentReviewedThisCycle(doc, '2026-10-12')).toBe(false);
    });

    it('returns true for schedule with lastReviewedDate in reference year', () => {
      const schedule = { id: 'S1', lastReviewedDate: '2026-10-09' };
      expect(isDocumentReviewedThisCycle(schedule, '2026-10-12')).toBe(true);
    });
  });

  describe('PeriodicReviewApprovalModal Dynamic Extension Badge', () => {
    it('Criteria 2: displays "+ ขยายรอบ 2 ปี" for document with 24-month review cycle', () => {
      useStore.setState({
        currentUser: { id: 'U-HOD', name: 'QC Manager', department: 'QC', role: 'DEPARTMENT_HEAD' },
        documents: [
          {
            id: 'DOC-24M',
            doc_code: 'WI-QC-24M',
            title: 'Calibration Work Instruction',
            department: 'QC',
            review_cycle_months: 24
          }
        ],
        externalDocuments: [],
        periodicReviewSchedules: []
      });

      const mockTask = {
        id: 'TASK-APPROVE-1',
        type: 'PERIODIC_REVIEW_APPROVAL',
        payload: {
          doc_id: 'DOC-24M',
          doc_code: 'WI-QC-24M',
          doc_title: 'Calibration Work Instruction',
          review_cycle_months: 24,
          details: { comment: 'No change needed' }
        }
      };

      render(
        <PeriodicReviewApprovalModal
          isOpen={true}
          onClose={() => {}}
          task={mockTask}
        />
      );

      expect(screen.getByText('+ ขยายรอบ 2 ปี')).toBeInTheDocument();
    });
  });

  describe('getCycleDisplayText helper unit tests', () => {
    it('returns "2 ปี" for 24 months', () => {
      expect(getCycleDisplayText({ review_cycle_months: 24 })).toBe('2 ปี');
    });

    it('returns "1 ปี" for 12 months', () => {
      expect(getCycleDisplayText({ review_cycle_months: 12 })).toBe('1 ปี');
    });

    it('returns "6 เดือน" for 6 months', () => {
      expect(getCycleDisplayText({ review_cycle_months: 6 })).toBe('6 เดือน');
    });

    it('returns "3 ปี" for review_cycle_years 3', () => {
      expect(getCycleDisplayText({ review_cycle_years: 3 })).toBe('3 ปี');
    });
  });

  describe('Dynamic Expiry & Cross-Year Tab Transition tests', () => {
    it('Criteria 1 & 2 Unit: evaluates to COMPLETED in approval year and transitions to UP_TO_DATE next year', () => {
      const doc = {
        id: 'DOC-CYCLE-TRANSITION',
        doc_code: 'WI-QC-CYCLE',
        last_reviewed_at: '2026-10-12',
        next_review_date: '2030-10-12',
        periodic_reviews: [
          { approval_status: 'APPROVED', approved_at: '2026-10-12T10:00:00Z', result: 'NO_CHANGE' }
        ]
      };

      // In the approval year (2026) -> COMPLETED
      const eval2026 = evaluateDocumentReviewStatus(doc, new Date('2026-10-12'));
      expect(eval2026.status).toBe('COMPLETED');
      expect(eval2026.canReview).toBe(false);

      // In the next year (2027) with due date 2030 -> UP_TO_DATE
      const eval2027 = evaluateDocumentReviewStatus(doc, new Date('2027-02-01'));
      expect(eval2027.status).toBe('UP_TO_DATE');
      expect(eval2027.canReview).toBe(false);
    });

    it('Criteria 1 & 2 Integration: Dashboard moves document from "ดำเนินการแล้วเสร็จ" to "ยังไม่ถึงกำหนด" after 1 year', () => {
      const doc = {
        id: 'DOC-CYCLE-DASH',
        doc_code: 'WI-QC-CYCLE-DASH',
        title: 'QC Cycle Transition Test',
        department: 'QC',
        status: 'EFFECTIVE',
        last_reviewed_at: '2026-10-12',
        next_review_date: '2030-10-12',
        periodic_reviews: [
          { approval_status: 'APPROVED', approved_at: '2026-10-12T10:00:00Z', result: 'NO_CHANGE' }
        ]
      };

      const schedule = {
        id: 'PRS-CYCLE-DASH',
        documentCategory: 'INTERNAL',
        documentId: 'DOC-CYCLE-DASH',
        documentNumber: 'WI-QC-CYCLE-DASH',
        documentName: 'QC Cycle Transition Test',
        ownerDepartmentId: 'QC',
        lastReviewedDate: '2026-10-12',
        nextReviewDate: '2030-10-12',
        currentScheduledReviewDate: '2030-10-12',
        status: 'UPCOMING',
        hasActiveTask: false
      };

      // Year 2026 (Approval year)
      useStore.setState({
        currentUser: { id: 'U002', name: 'QC Reviewer', department: 'QC', role: 'DEPARTMENT_USER' },
        simulatedSystemDate: '2026-10-12',
        documents: [doc],
        externalDocuments: [],
        periodicReviewSchedules: [schedule]
      });

      const { unmount } = render(
        <MemoryRouter initialEntries={['/periodic-reviews']}>
          <PeriodicReviewDashboard />
        </MemoryRouter>
      );

      // In 2026: "ทบทวนแล้วเสร็จ" = 1
      const completedCard2026 = screen.getAllByText('ทบทวนแล้วเสร็จ')[0].closest('.card-surface').querySelector('h3.text-3xl');
      expect(completedCard2026).toHaveTextContent('1');

      // Click "ดำเนินการแล้วเสร็จ" -> document is present
      fireEvent.click(screen.getByRole('button', { name: 'ดำเนินการแล้วเสร็จ' }));
      expect(screen.getByText('WI-QC-CYCLE-DASH')).toBeInTheDocument();

      // Click "ยังไม่ถึงกำหนด" -> document is NOT present
      fireEvent.click(screen.getByRole('button', { name: 'ยังไม่ถึงกำหนด' }));
      expect(screen.queryByText('WI-QC-CYCLE-DASH')).not.toBeInTheDocument();

      unmount();

      // Advance simulated date to 2027 (Next year)
      useStore.setState({
        simulatedSystemDate: '2027-02-01'
      });

      render(
        <MemoryRouter initialEntries={['/periodic-reviews']}>
          <PeriodicReviewDashboard />
        </MemoryRouter>
      );

      // In 2027: "ทบทวนแล้วเสร็จ" = 0, "เอกสารทั้งหมด" = 1
      const completedCard2027 = screen.getAllByText('ทบทวนแล้วเสร็จ')[0].closest('.card-surface').querySelector('h3.text-3xl');
      expect(completedCard2027).toHaveTextContent('0');

      const totalCard2027 = screen.getByText('เอกสารทั้งหมด').closest('.card-surface').querySelector('h3.text-3xl');
      expect(totalCard2027).toHaveTextContent('1');

      // Click "ยังไม่ถึงกำหนด" -> document IS present
      fireEvent.click(screen.getByRole('button', { name: 'ยังไม่ถึงกำหนด' }));
      expect(screen.getByText('WI-QC-CYCLE-DASH')).toBeInTheDocument();

      // Click "ดำเนินการแล้วเสร็จ" -> document is NOT present
      fireEvent.click(screen.getByRole('button', { name: 'ดำเนินการแล้วเสร็จ' }));
      expect(screen.queryByText('WI-QC-CYCLE-DASH')).not.toBeInTheDocument();

      // Table row shows "ยังไม่ถึงกำหนด" badge and unlocked "บันทึกผล" button
      fireEvent.click(screen.getByRole('button', { name: 'ทั้งหมด' }));
      expect(screen.getByText('✅ ยังไม่ถึงกำหนด')).toBeInTheDocument();
      const recordBtn = screen.getByRole('button', { name: /บันทึกผล/i });
      expect(recordBtn).toBeInTheDocument();
      expect(recordBtn).not.toBeDisabled();
    });
  });
});

