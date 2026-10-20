import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import PeriodicReviewDashboard from '../pages/PeriodicReviews/PeriodicReviewDashboard';
import { renderWithRouter, setTestUser } from '../../../test/test_utils';
import { TEST_PERSONAS } from '../../../test/fixtures/dccTestUsers';
import useStore from '../../../store/useStore';

describe('PeriodicReviewDashboard Due Date Table Sorting', () => {
  beforeEach(() => {
    setTestUser(TEST_PERSONAS.DCC_ADMIN); // Can view ALL departments
    useStore.setState({
      simulatedSystemDate: '2026-07-01T00:00:00Z',
      documents: [
        { id: 'DOC-1', doc_code: 'WI-01', name: 'Document 1', department: 'QA', status: 'EFFECTIVE', next_review_date: '2026-10-15' },
        { id: 'DOC-2', doc_code: 'WI-02', name: 'Document 2', department: 'QA', status: 'EFFECTIVE', next_review_date: '2026-08-10' },
        { id: 'DOC-3', doc_code: 'WI-03', name: 'Document 3', department: 'QA', status: 'EFFECTIVE', next_review_date: '2027-01-01' },
        { id: 'DOC-4', doc_code: 'WI-04', name: 'Document 4', department: 'QA', status: 'EFFECTIVE', next_review_date: null }
      ],
      periodicReviewSchedules: [
        { id: 'PRS-4', documentId: 'DOC-4', documentNumber: 'WI-04', documentName: 'Document 4', ownerDepartmentId: 'QA', currentScheduledReviewDate: null, nextReviewDate: null, isActive: true }
      ]
    });
  });

  it('defaults to ASC order (earliest due date first) and puts docs without due date at the end', () => {
    renderWithRouter(<PeriodicReviewDashboard />);

    // Get all document codes from the table cells
    const docCodes = screen.getAllByRole('cell', { name: /WI-0[1-4]/i }).map(el => el.textContent.trim());
    
    // WI-02 (2026-08-10) -> WI-01 (2026-10-15) -> WI-03 (2027-01-01) -> WI-04 (null)
    expect(docCodes).toEqual(['WI-02', 'WI-01', 'WI-03', 'WI-04']);
  });

  it('toggles to DESC order when "ครบกำหนด" header is clicked and keeps docs without due date at the end', () => {
    renderWithRouter(<PeriodicReviewDashboard />);

    const dueHeader = screen.getByRole('columnheader', { name: /ครบกำหนด/i });
    expect(dueHeader).toBeInTheDocument();

    // Click to sort DESC
    fireEvent.click(dueHeader);

    const docCodesDesc = screen.getAllByRole('cell', { name: /WI-0[1-4]/i }).map(el => el.textContent.trim());
    
    // WI-03 (2027-01-01) -> WI-01 (2026-10-15) -> WI-02 (2026-08-10) -> WI-04 (null)
    expect(docCodesDesc).toEqual(['WI-03', 'WI-01', 'WI-02', 'WI-04']);

    // Click again to toggle back to ASC
    fireEvent.click(dueHeader);

    const docCodesAsc = screen.getAllByRole('cell', { name: /WI-0[1-4]/i }).map(el => el.textContent.trim());
    expect(docCodesAsc).toEqual(['WI-02', 'WI-01', 'WI-03', 'WI-04']);
  });

  it('sorts before pagination (page 1 contains the earliest items in ASC)', () => {
    // Generate 15 documents with different review dates
    const docs = Array.from({ length: 15 }, (_, i) => ({
      id: `DOC-${i + 1}`,
      doc_code: `WI-${String(i + 1).padStart(2, '0')}`,
      name: `Document ${i + 1}`,
      department: 'QA',
      status: 'EFFECTIVE',
      // Days from 15 down to 01 (reverse order)
      next_review_date: `2026-05-${String(15 - i).padStart(2, '0')}`
    }));

    useStore.setState({
      documents: docs,
      periodicReviewSchedules: []
    });

    renderWithRouter(<PeriodicReviewDashboard />);

    // In ASC order, the first 10 items shown on page 1 should be the earliest dates (months 01..10)
    const firstRowCode = screen.getAllByRole('cell', { name: /WI-\d{2}/i })[0].textContent.trim();
    // Earliest date is 2026-01-01 which corresponds to i = 14 (WI-15)
    expect(firstRowCode).toBe('WI-15');
  });
});
