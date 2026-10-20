import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PeriodicReviewDashboard from '../pages/PeriodicReviews/PeriodicReviewDashboard';
import PeriodicReviewDetail from '../pages/PeriodicReviews/PeriodicReviewDetail';
import { renderWithRouter, setTestUser } from '../../../test/test_utils';
import { TEST_PERSONAS } from '../../../test/fixtures/dccTestUsers';
import useStore from '../../../store/useStore';
import { Routes, Route } from 'react-router-dom';

describe('Periodic Review Components & Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-07-14T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Standard Owner Department User', () => {
    beforeEach(() => {
      setTestUser(TEST_PERSONAS.DOCUMENT_OWNER); // 'PD' department owner
      useStore.setState({
        documents: [
          { id: 'DOC-1', department: 'PD', status: 'EFFECTIVE' },
          { id: 'DOC-2', department: 'QA', status: 'EFFECTIVE' }
        ],
        periodicReviewSchedules: [
          { id: 'SCH-1', documentId: 'DOC-1', ownerDepartmentId: 'PD', status: 'DUE_SOON', nextReviewDate: '2026-07-30' },
          { id: 'SCH-2', documentId: 'DOC-2', ownerDepartmentId: 'QA', status: 'OVERDUE', nextReviewDate: '2026-06-30' }
        ]
      });
    });

    it('sees "งานของแผนกฉัน" and does not see "ภาพรวมทุกแผนก" control board', () => {
      renderWithRouter(<PeriodicReviewDashboard />);
      expect(screen.getByText('งานทบทวนเอกสารของแผนกฉัน')).toBeInTheDocument();
      expect(screen.queryByText('ภาพรวมการทบทวนเอกสารทุกแผนก')).not.toBeInTheDocument();
      expect(screen.queryByText('งานของแผนกฉัน')).not.toBeInTheDocument();
    });

    it('dashboard cards use permitted data only', () => {
      renderWithRouter(<PeriodicReviewDashboard />);
      const dueSoonValue = screen.getByText('ใกล้ครบกำหนดใน 30 วัน').parentElement.querySelector('h3.text-3xl');
      expect(dueSoonValue).toHaveTextContent('1');
      const overdueValue = screen.getAllByText('เกินกำหนด')[0].parentElement.querySelector('h3.text-3xl');
      expect(overdueValue).toHaveTextContent('0');
    });
  });

  describe('QAQC / DCC Monitoring User', () => {
    beforeEach(() => {
      setTestUser(TEST_PERSONAS.QAQC_MONITOR);
      useStore.setState({
        documents: [
          { id: 'DOC-1', department: 'PD', status: 'EFFECTIVE' },
          { id: 'DOC-2', department: 'QA', status: 'EFFECTIVE' }
        ],
        periodicReviewSchedules: [
          { id: 'SCH-1', documentId: 'DOC-1', ownerDepartmentId: 'PD', status: 'DUE_SOON', nextReviewDate: '2026-07-30' },
          { id: 'SCH-2', documentId: 'DOC-2', ownerDepartmentId: 'QA', status: 'OVERDUE', nextReviewDate: '2026-06-30' }
        ]
      });
    });

    it('defaults to ภาพรวมทุกแผนก and can switch views', async () => {
      renderWithRouter(<PeriodicReviewDashboard />);
      expect(screen.getAllByText('ภาพรวมการทบทวนเอกสารทุกแผนก').length).toBeGreaterThan(0);
      
      const switchBtn = screen.getByRole('button', { name: /งานของแผนกฉัน/i });
      await userEvent.click(switchBtn);
      
      expect(screen.getByText('งานทบทวนเอกสารของแผนกฉัน')).toBeInTheDocument();
    });

    it('renders control board table with all departments', () => {
      renderWithRouter(<PeriodicReviewDashboard />);
      expect(screen.getAllByText('ภาพรวมทุกแผนก').length).toBeGreaterThan(0);
    });
  });

  describe('Management User (e.g. กัลยาณี L5 - PD)', () => {
    beforeEach(() => {
      useStore.setState({
        currentUser: {
          id: 'U003',
          name: 'กัลยาณี พลไกร',
          department: 'PD',
          level: 5,
          approval_level: 5,
          role: 'DEPT_ADMIN',
          is_hod: true
        },
        documents: [
          {
            id: 'DOC-PD-1',
            doc_code: 'WI-PD-01',
            title: 'WI-PD-01',
            name: 'Production Work Instruction',
            department: 'PD',
            status: 'EFFECTIVE',
            next_review_date: '2026-07-30',
            review_status: 'DUE_SOON'
          },
          {
            id: 'DOC-QC-1',
            doc_code: 'WI-QC-01',
            title: 'WI-QC-01',
            name: 'QC Work Instruction',
            department: 'QC',
            status: 'EFFECTIVE',
            next_review_date: '2026-07-30',
            last_reviewed_at: '2026-07-10',
            review_status: 'COMPLETED',
            is_reviewed_this_cycle: true
          }
        ],
        periodicReviewSchedules: [
          {
            id: 'SCH-PD-1',
            documentId: 'DOC-PD-1',
            documentNumber: 'WI-PD-01',
            documentName: 'Production Work Instruction',
            ownerDepartmentId: 'PD',
            status: 'DUE_SOON',
            nextReviewDate: '2026-07-30'
          },
          {
            id: 'SCH-QC-1',
            documentId: 'DOC-QC-1',
            documentNumber: 'WI-QC-01',
            documentName: 'QC Work Instruction',
            ownerDepartmentId: 'QC',
            status: 'COMPLETED',
            nextReviewDate: '2026-07-30',
            lastReviewedDate: '2026-07-10',
            is_reviewed_this_cycle: true
          }
        ]
      });
    });

    it('has scope toggle buttons and starts in "งานของแผนกฉัน (PD)"', () => {
      renderWithRouter(<PeriodicReviewDashboard />);
      expect(screen.getByRole('button', { name: /งานของแผนกฉัน \(PD\)/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /ภาพรวมทุกแผนก/i })).toBeInTheDocument();
      expect(screen.getByText('WI-PD-01')).toBeInTheDocument();
      expect(screen.queryByText('WI-QC-01')).not.toBeInTheDocument();
    });

    it('shows WI-QC-01 with status "ทบทวนแล้วเสร็จ" when clicking "ภาพรวมทุกแผนก"', async () => {
      renderWithRouter(<PeriodicReviewDashboard />);
      const allDeptBtn = screen.getByRole('button', { name: /ภาพรวมทุกแผนก/i });
      await userEvent.click(allDeptBtn);

      expect(screen.getByText('WI-QC-01')).toBeInTheDocument();
      expect(screen.getByText('WI-PD-01')).toBeInTheDocument();
      expect(screen.getAllByText('ทบทวนแล้วเสร็จ').length).toBeGreaterThan(0);
    });

    it('displays all records without empty table when selecting "ทุกแผนก" in dropdown', async () => {
      renderWithRouter(<PeriodicReviewDashboard />);
      const select = screen.getByRole('combobox', { name: /กรองตามแผนก/i });
      await userEvent.selectOptions(select, 'ALL');

      expect(screen.getByText('WI-QC-01')).toBeInTheDocument();
      expect(screen.getByText('WI-PD-01')).toBeInTheDocument();
    });
  });

  describe('Unauthorized User', () => {
    beforeEach(() => {
      setTestUser(TEST_PERSONAS.UNRELATED_DEPT);
      useStore.setState({
        documents: [
          { id: 'DOC-1', department: 'PD', status: 'EFFECTIVE' }
        ],
        periodicReviewSchedules: [
          { id: 'SCH-1', documentId: 'DOC-1', ownerDepartmentId: 'PD', status: 'DUE_SOON', nextReviewDate: '2026-07-30' }
        ]
      });
    });

    it('direct route displays Thai Access Denied and hides metadata', () => {
      renderWithRouter(
        <Routes>
          <Route path="/dcc/periodic-reviews/:reviewId" element={<PeriodicReviewDetail />} />
        </Routes>,
        { route: '/dcc/periodic-reviews/SCH-1' }
      );

      expect(screen.getByText('ไม่มีสิทธิ์เข้าถึงข้อมูลการทบทวนเอกสารนี้')).toBeInTheDocument();
      expect(screen.queryByText('DOC-1')).not.toBeInTheDocument();
    });
  });

  describe('Review Form & DAR Linkage', () => {
    beforeEach(() => {
      setTestUser(TEST_PERSONAS.DEPT_SUPERVISOR); // Authorized for PD
    });

    it('selecting outcome does not create DAR until submit', async () => {
      useStore.setState({
        documents: [
          { id: 'DOC-1', department: 'PD', status: 'EFFECTIVE' }
        ],
        periodicReviewSchedules: [
          { id: 'SCH-1', documentId: 'DOC-1', ownerDepartmentId: 'PD', status: 'DUE', nextReviewDate: '2026-07-30' }
        ]
      });

      renderWithRouter(
        <Routes>
          <Route path="/dcc/periodic-reviews/:reviewId" element={<PeriodicReviewDetail />} />
        </Routes>,
        { route: '/dcc/periodic-reviews/SCH-1' }
      );

      const revisionBtn = await screen.findByText('ต้องปรับปรุง/แก้ไข');
      await userEvent.click(revisionBtn);

      const schedule = useStore.getState().periodicReviewSchedules[0];
      expect(schedule.linkedActionId).toBeUndefined(); 
    });

    it('retry banner appears after simulated DAR linkage failure', async () => {
      useStore.setState({
        documents: [
          { id: 'DOC-1', department: 'PD', status: 'EFFECTIVE' }
        ],
        periodicReviewSchedules: [
          { id: 'SCH-1', documentId: 'DOC-1', ownerDepartmentId: 'PD', status: 'COMPLETED', linkageStatus: 'FAILED' }
        ]
      });

      renderWithRouter(
        <Routes>
          <Route path="/dcc/periodic-reviews/:reviewId" element={<PeriodicReviewDetail />} />
        </Routes>,
        { route: '/dcc/periodic-reviews/SCH-1' }
      );

      expect(await screen.findByText('การบันทึกสำเร็จ แต่การสร้าง DAR ล้มเหลว')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'ลองสร้างคำขออีกครั้ง' })).toBeInTheDocument();
    });
    
    it('ดู DAR ที่เชื่อมโยง appears when draft exists', async () => {
       useStore.setState({
        documents: [
          { id: 'DOC-1', department: 'PD', status: 'EFFECTIVE' }
        ],
        periodicReviewSchedules: [
          { id: 'SCH-1', documentId: 'DOC-1', ownerDepartmentId: 'PD', status: 'COMPLETED', linkageStatus: 'SUCCESS', linkedActionId: 'DAR-123', outcome: 'REVISION_REQUIRED' }
        ]
      });

      renderWithRouter(
        <Routes>
          <Route path="/dcc/periodic-reviews/:reviewId" element={<PeriodicReviewDetail />} />
        </Routes>,
        { route: '/dcc/periodic-reviews/SCH-1' }
      );

      expect(await screen.findByRole('button', { name: 'ดู DAR ที่เชื่อมโยง' })).toBeInTheDocument();
    });
  });

  describe('CSV Export', () => {
    beforeEach(() => {
      setTestUser(TEST_PERSONAS.QAQC_MONITOR);
    });

    it('shows ส่งออก CSV button and helper text', () => {
      renderWithRouter(<PeriodicReviewDashboard />);
      expect(screen.getByRole('button', { name: /ส่งออก CSV/i })).toBeInTheDocument();
      expect(screen.getByText('สามารถเปิดด้วย Microsoft Excel ได้')).toBeInTheDocument();
    });
  });
});
