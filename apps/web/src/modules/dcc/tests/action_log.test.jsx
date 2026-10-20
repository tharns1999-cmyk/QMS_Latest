import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ActionLog from '../pages/Admin/ActionLog';
import useStore from '../../../store/useStore';

const mockDccAdmin = {
  id: 'u-admin',
  name: 'Admin User',
  role: 'DCC_ADMIN',
  isDcc: true
};

const mockGeneralUser = {
  id: 'u-gen',
  name: 'General User',
  role: 'GENERAL_USER',
  isDcc: false
};

const renderWithRouter = (ui) => {
  return render(
    <BrowserRouter>
      {ui}
    </BrowserRouter>
  );
};

describe('ActionLog Page & Multi-Key Timestamp Synchronization Tests', () => {
  beforeEach(() => {
    useStore.setState({
      currentUser: mockDccAdmin,
      actionLog: [
        {
          id: 'LOG-001',
          actionType: 'DAR_SUBMIT',
          actor: 'John Doe',
          actorRole: 'Requester',
          details: 'Submitted DAR-2026-001',
          date: '2026-08-25T01:00:00.000Z'
        },
        {
          id: 'LOG-002',
          actionType: 'CC_ISSUE',
          actor: 'Admin DCC',
          actorRole: 'DCC Admin',
          details: { info: 'Issued Copy 01' },
          timestamp: '2026-08-24T15:30:00.000Z'
        },
        {
          id: 'LOG-003',
          actionType: 'EXT_DOC_REGISTER',
          actor: 'Jane Specialist',
          actorRole: 'QA Officer',
          details: 'Registered ISO standard',
          created_at: '2026-08-23T10:15:00.000Z'
        },
        {
          id: 'LOG-004',
          actionType: null,
          actor: null,
          actorRole: null,
          details: null,
          date: undefined
        }
      ],
      controlledCopyAuditTrail: [],
      externalAuditTrail: [],
      timeline: []
    });
  });

  it('renders access denied if user is not DCC Admin', () => {
    useStore.setState({ currentUser: mockGeneralUser });
    renderWithRouter(<ActionLog />);
    expect(screen.getByText(/Access Denied/i)).toBeInTheDocument();
  });

  it('renders action log table with entries for DCC Admin without crashing', () => {
    renderWithRouter(<ActionLog />);
    expect(screen.getByText(/บันทึกประวัติการทำงาน/i)).toBeInTheDocument();
    expect(screen.getByText('DAR_SUBMIT')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('filters logs according to search input', () => {
    renderWithRouter(<ActionLog />);
    const searchInput = screen.getByPlaceholderText(/ค้นหาตาม action/i);
    fireEvent.change(searchInput, { target: { value: 'DAR_SUBMIT' } });
    expect(screen.getByText('DAR_SUBMIT')).toBeInTheDocument();
  });

  it('correctly resolves and formats timestamps across multi-key variations (date, timestamp, created_at)', () => {
    renderWithRouter(<ActionLog />);

    // LOG-001 with 'date': 2026-08-25T01:00:00.000Z
    expect(screen.getAllByText(/25\/08\/2026/).length).toBeGreaterThanOrEqual(1);

    // LOG-002 with 'timestamp': 2026-08-24T15:30:00.000Z
    expect(screen.getByText(/24\/08\/2026/)).toBeInTheDocument();

    // LOG-003 with 'created_at': 2026-08-23T10:15:00.000Z
    expect(screen.getByText(/23\/08\/2026/)).toBeInTheDocument();
  });

  it('auto-injects multi-key timestamps when logAction is invoked from useStore', () => {
    useStore.getState().logAction('PERIODIC_REVIEW_APPROVED', 'Review approved for QM-01');

    const logs = useStore.getState().actionLog;
    const latest = logs[0];

    expect(latest.actionType).toBe('PERIODIC_REVIEW_APPROVED');
    expect(latest.details).toBe('Review approved for QM-01');
    expect(latest.timestamp).toBeDefined();
    expect(latest.created_at).toBeDefined();
    expect(latest.date).toBeDefined();
    expect(latest.rawDate).toBeDefined();

    // Also test object signature
    useStore.getState().logAction({
      action: 'DOWNLOAD_WATERMARK_PDF',
      docTitle: 'SOP-QA-01',
      details: 'Confidential download'
    });

    const objectLog = useStore.getState().actionLog[0];
    expect(objectLog.actionType).toBe('DOWNLOAD_WATERMARK_PDF');
    expect(objectLog.timestamp).toBeDefined();
    expect(objectLog.date).toBeDefined();
  });
});
