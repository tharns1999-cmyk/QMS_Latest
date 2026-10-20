import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../store/useStore';
import { evaluateDocumentReviewStatus } from '../../modules/dcc/utils/documentUtils';
import SystemTimeSimulatorWidget from '../../modules/dcc/components/common/SystemTimeSimulatorWidget';
import Sidebar from '../layout/Sidebar';

describe('System Date Time Travel Simulator', () => {
  beforeEach(() => {
    useStore.getState().resetStore?.();
    useStore.setState({
      simulatedSystemDate: null,
      documents: [],
      externalDocuments: [],
      periodicReviewSchedules: []
    });
  });

  afterEach(() => {
    useStore.getState().resetSimulatedDate();
  });

  it('Criteria 1: manages simulatedSystemDate state correctly', () => {
    const store = useStore.getState();
    expect(store.simulatedSystemDate).toBeNull();
    
    // Default effective today is current date
    const realToday = store.getEffectiveToday();
    expect(realToday).toBeInstanceOf(Date);

    // Set simulated date
    store.setSimulatedDate('2027-06-15');
    expect(useStore.getState().simulatedSystemDate).toBe('2027-06-15');
    const effective = useStore.getState().getEffectiveToday();
    expect(effective.toISOString().split('T')[0]).toBe('2027-06-15');

    // Fast-forward 6 months -> 2027-12-15
    useStore.getState().fastForwardSystemDate(6);
    expect(useStore.getState().simulatedSystemDate).toBe('2027-12-15');

    // Fast-forward 12 months -> 2028-12-15
    useStore.getState().fastForwardSystemDate(12);
    expect(useStore.getState().simulatedSystemDate).toBe('2028-12-15');

    // Reset back to real time
    useStore.getState().resetSimulatedDate();
    expect(useStore.getState().simulatedSystemDate).toBeNull();
  });

  it('Criteria 2: evaluateDocumentReviewStatus evaluates against effective simulated date', () => {
    const nextReviewDate = '2027-01-01';

    // Before time travel: reference date 2026-06-01 (> 30 days) -> UP_TO_DATE
    const statusBefore = evaluateDocumentReviewStatus(nextReviewDate, new Date('2026-06-01'));
    expect(statusBefore).toBe('UP_TO_DATE');

    // Close to review date: reference date 2026-12-15 (17 days away) -> DUE_SOON
    const statusDueSoon = evaluateDocumentReviewStatus(nextReviewDate, new Date('2026-12-15'));
    expect(statusDueSoon).toBe('DUE_SOON');

    // After time travel +1 year: reference date 2027-02-01 (past due) -> OVERDUE
    const statusOverdue = evaluateDocumentReviewStatus(nextReviewDate, new Date('2027-02-01'));
    expect(statusOverdue).toBe('OVERDUE');
  });

  it('Criteria 3: advancing simulated date flips real document review status to OVERDUE and resets cleanly', () => {
    // Simulate an actual active document with next review in 6 months from 2026-01-01
    const testDoc = {
      id: 'DOC-REAL-001',
      title: 'SOP-QA-001',
      effectiveDate: '2026-01-01',
      nextReviewDate: '2026-07-01',
      status: 'EFFECTIVE'
    };

    useStore.setState({
      documents: [testDoc],
      simulatedSystemDate: '2026-01-01'
    });

    // 1. Initial state at 2026-01-01 -> UP_TO_DATE
    let effective = useStore.getState().getEffectiveToday();
    let status = evaluateDocumentReviewStatus(testDoc.nextReviewDate, effective);
    expect(status).toBe('UP_TO_DATE');

    // 2. Advance simulated date +12 months -> flips to OVERDUE
    useStore.getState().fastForwardSystemDate(12);
    effective = useStore.getState().getEffectiveToday();
    expect(useStore.getState().simulatedSystemDate).toBe('2027-01-01');
    status = evaluateDocumentReviewStatus(testDoc.nextReviewDate, effective);
    expect(status).toBe('OVERDUE');

    // 3. Reset simulated date -> returns to null
    useStore.getState().resetSimulatedDate();
    expect(useStore.getState().simulatedSystemDate).toBeNull();
  });

  it('Criteria 4: SystemTimeSimulatorWidget renders UI elements, status badges, and handles actions', () => {
    useStore.setState({ simulatedSystemDate: null });
    const { rerender } = render(<SystemTimeSimulatorWidget />);

    // Header & Real time badge
    expect(screen.getByText('เวลาจำลองระบบ')).toBeInTheDocument();
    expect(screen.getByText('เวลาจริง')).toBeInTheDocument();

    // 4 action buttons
    const btn6m = screen.getByRole('button', { name: '+6 เดือน' });
    const btn1y = screen.getByRole('button', { name: '+1 ปี' });
    const btn2y = screen.getByRole('button', { name: '+2 ปี' });
    const btnReset = screen.getByRole('button', { name: /🔄 คืนค่า/i });

    expect(btn6m).toBeInTheDocument();
    expect(btn1y).toBeInTheDocument();
    expect(btn2y).toBeInTheDocument();
    expect(btnReset).toBeInTheDocument();
    expect(btnReset).toBeDisabled();

    // Fast-forward +1 year
    fireEvent.click(btn1y);
    expect(useStore.getState().simulatedSystemDate).not.toBeNull();

    rerender(<SystemTimeSimulatorWidget />);
    expect(screen.getByText('จำลองอยู่')).toBeInTheDocument();
    expect(btnReset).not.toBeDisabled();

    // Reset back
    fireEvent.click(btnReset);
    expect(useStore.getState().simulatedSystemDate).toBeNull();

    rerender(<SystemTimeSimulatorWidget />);
    expect(screen.getByText('เวลาจริง')).toBeInTheDocument();

    // Change date via date input
    const dateInput = screen.getByLabelText('วันที่จำลองระบบ');
    fireEvent.change(dateInput, { target: { value: '2029-05-20' } });
    expect(useStore.getState().simulatedSystemDate).toBe('2029-05-20');
  });

  it('Criteria 5: Sidebar renders SystemTimeSimulatorWidget for non-admin users as well', () => {
    useStore.setState({
      currentUser: {
        id: 'EMP-999',
        name: 'Regular Staff',
        department: 'PD',
        role: 'STAFF',
        isDcc: false,
        level: 1
      },
      simulatedSystemDate: null
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    );

    // Dev tools should not be visible for non-admin
    expect(screen.queryByText('DEV TOOLS')).not.toBeInTheDocument();

    // Time simulator widget MUST be visible
    expect(screen.getByText('เวลาจำลองระบบ')).toBeInTheDocument();
    expect(screen.getByText('เวลาจริง')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+1 ปี' })).toBeInTheDocument();
  });
});
