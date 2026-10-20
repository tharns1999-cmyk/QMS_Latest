import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { screen, fireEvent, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../layout/Sidebar';
import PeriodicReviewDashboard from '../../modules/dcc/pages/PeriodicReviews/PeriodicReviewDashboard';
import useStore from '../../store/useStore';

describe('Periodic Review Sidebar Badge & Management Modal Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-10-09T00:00:00Z'));

    useStore.setState({
      currentUser: {
        id: 'U010',
        name: 'หัวหน้าแผนก DC และผู้ดูแล QC',
        department: 'DC',
        dept: 'DC',
        depts: ['DC'],
        role: 'STAFF',
        level: 4,
        managedDepartments: ['QC'],
        isDcc: false
      },
      documents: [
        {
          id: 'DOC-QC-1',
          doc_code: 'WI-QC-01',
          title: 'WI-QC-01',
          name: 'คู่มือการตรวจสอบ QC',
          department: 'QC',
          status: 'EFFECTIVE',
          next_review_date: '2026-10-05', // Past due (OVERDUE)
          review_status: 'OVERDUE'
        },
        {
          id: 'DOC-DC-1',
          doc_code: 'SOP-DC-01',
          title: 'SOP-DC-01',
          name: 'ระเบียบการจัดส่งเอกสาร',
          department: 'DC',
          status: 'EFFECTIVE',
          next_review_date: '2027-10-09',
          review_status: 'UP_TO_DATE'
        }
      ],
      externalDocuments: [
        {
          id: 'EXT-ISO-1',
          document_number: 'ED-ISO-9001',
          name: 'ISO 9001:2015 Standard',
          department: 'DC',
          status: 'EFFECTIVE',
          next_review_date: '2026-10-20', // DUE_SOON (<= 30 days)
          review_status: 'DUE_SOON'
        }
      ],
      tasks: [
        {
          id: 'TASK-DAR-REVIEW-1',
          type: 'REVIEW', // Normal DAR Review task (must NOT inflate Periodic Review badge)
          title: 'ทบทวนคำร้อง DAR-2026-001',
          assigneeId: 'U010',
          status: 'PENDING'
        }
      ],
      periodicReviewSchedules: [
        {
          id: 'SCH-QC-1',
          documentId: 'DOC-QC-1',
          documentNumber: 'WI-QC-01',
          documentName: 'คู่มือการตรวจสอบ QC',
          ownerDepartmentId: 'QC',
          status: 'OVERDUE',
          nextReviewDate: '2026-10-05'
        }
      ]
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. Sidebar does NOT count regular DAR "type: REVIEW" tasks toward the Periodic Review badge', () => {
    // When only DAR review task exists and no due docs for the user
    useStore.setState({
      documents: [],
      externalDocuments: [],
      tasks: [
        {
          id: 'TASK-DAR-1',
          type: 'REVIEW',
          title: 'ทบทวนคำร้อง DAR-2026-001',
          assigneeId: 'U010',
          status: 'PENDING'
        }
      ]
    });

    render(
      <MemoryRouter initialEntries={['/dcc/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    );

    // The nav item "การทบทวนตามรอบ" should not display a badge
    const reviewNavLink = screen.getByText('การทบทวนตามรอบ').closest('a');
    expect(reviewNavLink).toBeInTheDocument();
    // Badge span should not contain "1"
    const badge = reviewNavLink.querySelector('.rounded-full');
    expect(badge).toBeNull();
  });

  it('2. Sidebar badge reflects overdue/due_soon documents in managedDepartments (QC & DC)', () => {
    render(
      <MemoryRouter initialEntries={['/dcc/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    );

    const reviewNavLink = screen.getByText('การทบทวนตามรอบ').closest('a');
    const badge = reviewNavLink.querySelector('.rounded-full');
    expect(badge).not.toBeNull();
    // We have DOC-QC-1 (OVERDUE in managed dept QC) and EXT-ISO-1 (DUE_SOON in DC)
    expect(badge).toHaveTextContent('2');
  });

  it('3. PeriodicReviewDashboard displays managedDepartments (QC) records in metrics and workspace table', () => {
    render(
      <MemoryRouter initialEntries={['/dcc/periodic-reviews']}>
        <PeriodicReviewDashboard />
      </MemoryRouter>
    );

    // QC document is visible because user has managedDepartments: ['QC']
    expect(screen.getByText('WI-QC-01')).toBeInTheDocument();

    // "ใกล้ครบกำหนดใน 30 วัน" metric card shows 0 (eliminates double counting of overdue document)
    const dueSoonCardValue = screen.getByText('ครบกำหนดภายใน 30 วันข้างหน้า', { exact: false }).closest('.card-surface').querySelector('h3.text-3xl');
    expect(dueSoonCardValue).toHaveTextContent('0');

    // "เกินกำหนด" card has 1
    const overdueCardValue = screen.getAllByText('เกินกำหนด')[0].closest('.card-surface').querySelector('h3.text-3xl');
    expect(overdueCardValue).toHaveTextContent('1');
  });

  it('4. Unified workspace switches between Internal and External tabs directly without modal and displays action buttons', () => {
    render(
      <MemoryRouter initialEntries={['/dcc/periodic-reviews']}>
        <PeriodicReviewDashboard />
      </MemoryRouter>
    );

    // Old duplicate modal button does NOT exist
    expect(screen.queryByRole('button', { name: /จัดการทบทวน \(Internal\/External\)/i })).not.toBeInTheDocument();

    // In Internal tab by default: WI-QC-01 is visible with action buttons
    expect(screen.getByText('WI-QC-01')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /บันทึกผล/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /ประวัติ/i }).length).toBeGreaterThan(0);

    // Switch to External tab directly in the workspace
    const extTabBtn = screen.getByRole('button', { name: /เอกสารภายนอก \(External\)/i });
    fireEvent.click(extTabBtn);

    // External document shows up directly in table with action buttons
    expect(screen.getByText('ED-ISO-9001')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /บันทึกผล/i }).length).toBeGreaterThan(0);
  });
});
