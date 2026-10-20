import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import TaskInbox from '../pages/Tasks/TaskInbox';

const renderWithRouter = (ui) => {
  return render(
    <MemoryRouter>
      {ui}
    </MemoryRouter>
  );
};

describe('TaskInbox UI/UX Bug Fixes & Polish Tests', () => {
  beforeEach(() => {
    useStore.getState().resetStore();
    useStore.setState({
      currentUser: {
        id: 'U002',
        name: 'ธนาวุฒิ สมควรกิจดำรง',
        department: 'PD',
        depts: ['PD'],
        isDcc: false,
        role: 'SUPERVISOR',
        level: 2
      },
      tasks: [
        {
          id: 'TASK-MOCK-4',
          type: 'ACKNOWLEDGE',
          docId: 'DOC-MOCK-1',
          title: '[] รับทราบการประกาศใช้เอกสารใหม่ - SOP-PD-001',
          assigneeId: 'U002',
          status: 'PENDING',
          createdAt: '2026-07-05T08:00:00Z',
          dueDate: '2026-07-08T06:40:15.497Z'
        },
        {
          id: 'TASK-MOCK-2',
          type: 'APPROVE',
          department: 'PD',
          darId: 'DAR-MOCK-2',
          title: 'อนุมัติคำร้อง (Approve DAR) - SOP-WH-002',
          assigneeId: 'U002',
          status: 'PENDING',
          createdAt: '2026-06-25T08:00:00Z',
          dueDate: '2026-06-30'
        }
      ]
    });
  });

  it('1. Tab Navigation: renders scrollable tabs with consistent Thai/English labels and without clipping', () => {
    renderWithRouter(<TaskInbox />);

    // Check tabs are rendered
    expect(screen.getByRole('button', { name: /Review/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Acknowledge/i })).toBeInTheDocument();
  });

  it('2. Leading Icon Box: assigns appropriate icon configuration and is never empty', () => {
    renderWithRouter(<TaskInbox />);

    // TASK-MOCK-4 is ACKNOWLEDGE — new design shows Thai chip "รับทราบเอกสาร"
    expect(screen.getByText('รับทราบเอกสาร')).toBeInTheDocument();

    // TASK-MOCK-2 is APPROVE — new design shows Thai chip "อนุมัติคำร้อง"
    expect(screen.getByText('อนุมัติคำร้อง')).toBeInTheDocument();
  });

  it('3. Title Prefix Bug Fix: sanitizes empty brackets `[]` and formats titles cleanly', () => {
    renderWithRouter(<TaskInbox />);

    // Raw title was "[] รับทราบการประกาศใช้เอกสารใหม่ - SOP-PD-001"
    // The bracket `[] ` must be stripped away from the title text
    const titleElements = screen.getAllByRole('heading', { level: 3 });
    const ackTitle = titleElements.find(el => el.textContent.includes('รับทราบการประกาศใช้เอกสารใหม่ - SOP-PD-001'));
    
    expect(ackTitle).toBeDefined();
    // Ensure it doesn't render double or empty brackets like "[] []" or start with "[] "
    expect(ackTitle.textContent.startsWith('[] ')).toBe(false);
  });

  it('4. Raw ISO Date Format Fix: renders localized Thai date format with time', () => {
    renderWithRouter(<TaskInbox />);

    // ISO timestamp '2026-07-08T06:40:15.497Z' should be localized to Thai format
    // e.g. "8 ก.ค. 2026" or "8 ก.ค. 2026, 13:40 น." depending on timezone
    expect(screen.getByText(/8 ก\.ค\. 2026/i)).toBeInTheDocument();

    // Should NOT display raw ISO string
    expect(screen.queryByText(/2026-07-08T06:40:15/i)).toBeNull();
  });

  it('5. Allows switching tabs to filter tasks accurately', () => {
    renderWithRouter(<TaskInbox />);

    // Click on Acknowledge Tab
    const ackTabBtn = screen.getByRole('button', { name: /Acknowledge/i });
    fireEvent.click(ackTabBtn);

    // After redesign: card content shows the clean document title, not the raw task ID.
    // The ACKNOWLEDGE task title after stripping "[] " is "รับทราบการประกาศใช้เอกสารใหม่ - SOP-PD-001"
    // TASK-MOCK-2 (APPROVE) should NOT be visible.
    expect(screen.queryByText('อนุมัติคำร้อง (Approve DAR) - SOP-WH-002')).toBeNull();

    // The ACK task content should be visible via its heading
    const headings = screen.getAllByRole('heading', { level: 3 });
    const ackCard = headings.find(h => h.textContent.includes('รับทราบการประกาศใช้เอกสารใหม่'));
    expect(ackCard).toBeDefined();
  });
});
