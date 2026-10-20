import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import DarNewForm from '../pages/DarWorkflow/DarNewForm';
import { calculateSLAStatus } from '../../../store/useStore';

describe('SLA & Logic Tests', () => {
  beforeEach(() => {
    useStore.setState({
      tasks: [],
      dars: [],
      documents: [],
      timeline: []
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('should mark SLA as OVERDUE if deadline has passed by 4 days', () => {
    vi.useFakeTimers();
    // Set fake system time to a specific date (e.g. 2026-07-10)
    const mockToday = new Date('2026-07-10T12:00:00Z');
    vi.setSystemTime(mockToday);

    // Document was expected to be completed 4 days ago (2026-07-06)
    const effectiveDate = '2026-07-06';
    const todayStr = '2026-07-10';

    const slaStatus = calculateSLAStatus(effectiveDate, todayStr);
    
    expect(slaStatus).toBe('OVERDUE');
  });

  it('should auto-cancel OVERDUE DARs when checkSLA is run', () => {
    vi.useFakeTimers();
    const mockToday = new Date('2026-07-10T12:00:00Z');
    vi.setSystemTime(mockToday);
    
    useStore.setState({
      simulatedDate: '2026-07-10',
      dars: [
        {
          id: 'DAR-001',
          status: 'UNDER_REVIEW',
          effectiveDate: '2026-07-06' // 4 days overdue
        }
      ]
    });

    useStore.getState().checkSLA();

    const dar = useStore.getState().dars[0];
    expect(dar.status).toBe('CANCELLED_OVERDUE');
  });

  it('should prevent DarNewForm submission if "อื่นๆ (Others)" is selected but no detail is provided', async () => {
    const user = userEvent.setup({ delay: null });
    
    render(
      <MemoryRouter>
        <DarNewForm />
      </MemoryRouter>
    );

    // Find and check the "อื่นๆ (Others)" checkbox
    // Since there are multiple checkboxes, we find by label text
    const othersCheckbox = await screen.findByLabelText(/อื่น ๆ \(Others\)/i);
    await user.click(othersCheckbox);

    // Try to submit the form
    const submitBtn = screen.getByRole('button', { name: /ส่งคำขอ/i });
    await user.click(submitBtn);

    // Verify that the store's addDarAndReturnId was NOT called or a validation error appears.
    // In DarNewForm, it shows a toast error. We can mock toast or simply check that DAR is not added.
    const storeDars = useStore.getState().dars;
    expect(storeDars.length).toBe(0);
  });
});
