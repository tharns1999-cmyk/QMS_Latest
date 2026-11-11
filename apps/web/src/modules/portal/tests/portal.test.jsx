import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PortalLandingPage from '../pages/PortalLandingPage';
import useStore from '../../../store/useStore';

describe('Portal Architecture & Landing Page', () => {
  beforeEach(() => {
    localStorage.setItem('language', 'en');
    useStore.setState({
      currentUser: { id: 'u1', name: 'Tester', department: 'QC', approval_level: 5, permissions: ['DCC_ACCESS'] },
      tasks: [],
      vccWorkTasks: [],
      documents: [],
      externalDocuments: []
    });
  });

  it('renders Portal Landing Page with module cards and no task badge when count is 0', () => {
    render(
      <MemoryRouter initialEntries={['/portal']}>
        <Routes>
          <Route path="/portal" element={<PortalLandingPage />} />
        </Routes>
      </MemoryRouter>
    );
    
    // Check main title
    expect(screen.getByText('QMS Portal')).toBeInTheDocument();
    expect(screen.getByText('Quality Management System Portal')).toBeInTheDocument();
    expect(screen.getByText('ระบบควบคุมเอกสาร (DCC)')).toBeInTheDocument();

    // No badges when count is 0
    expect(screen.queryByTestId('module-task-badge-dcc')).not.toBeInTheDocument();
    expect(screen.queryByTestId('module-task-badge-vcc')).not.toBeInTheDocument();
  });

  it('shows action badge with correct count for DCC tasks and deep-links to /dcc/tasks on badge click', () => {
    useStore.setState({
      tasks: [
        {
          id: 'dar-task-1',
          title: 'Review DAR-2026-001',
          type: 'REVIEW',
          department: 'QC',
          required_approval_level: 4,
          status: 'PENDING'
        },
        {
          id: 'dar-task-2',
          title: 'Approve DAR-2026-002',
          type: 'APPROVE',
          department: 'QC',
          required_approval_level: 5,
          status: 'PENDING'
        }
      ]
    });

    render(
      <MemoryRouter initialEntries={['/portal']}>
        <Routes>
          <Route path="/portal" element={<PortalLandingPage />} />
          <Route path="/dcc" element={<div data-testid="dcc-home">DCC Home</div>} />
          <Route path="/dcc/tasks" element={<div data-testid="dcc-tasks-page">DCC Tasks Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    const dccBadge = screen.getByTestId('module-task-badge-dcc');
    expect(dccBadge).toBeInTheDocument();
    expect(dccBadge).toHaveTextContent('2 งานรอคุณ');

    // Clicking the badge must deep-link to /dcc/tasks (not /dcc)
    fireEvent.click(dccBadge);
    expect(screen.getByTestId('dcc-tasks-page')).toBeInTheDocument();
    expect(screen.queryByTestId('dcc-home')).not.toBeInTheDocument();
  });

  it('shows action badge with correct count for VCC tasks and deep-links to /vcc/tasks on badge click', () => {
    useStore.setState({
      tasks: [
        {
          id: 'vcc-plan-1',
          title: 'Review Calibration Plan',
          referenceType: 'VCC_PLAN',
          type: 'VCC_PLAN_REVIEW',
          department: 'QC',
          required_approval_level: 4,
          status: 'PENDING'
        }
      ],
      vccWorkTasks: [
        { id: 'RECORD_RESULT:wo-1', kind: 'RECORD_RESULT', wo_id: 'wo-1' },
        { id: 'REVIEW_RESULT:wo-2', kind: 'REVIEW_RESULT', wo_id: 'wo-2' }
      ]
    });

    render(
      <MemoryRouter initialEntries={['/portal']}>
        <Routes>
          <Route path="/portal" element={<PortalLandingPage />} />
          <Route path="/vcc" element={<div data-testid="vcc-home">VCC Home</div>} />
          <Route path="/vcc/tasks" element={<div data-testid="vcc-tasks-page">VCC Tasks Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    const vccBadge = screen.getByTestId('module-task-badge-vcc');
    expect(vccBadge).toBeInTheDocument();
    expect(vccBadge).toHaveTextContent('3 งานรอคุณ');

    // Clicking the badge must deep-link to /vcc/tasks (not /vcc)
    fireEvent.click(vccBadge);
    expect(screen.getByTestId('vcc-tasks-page')).toBeInTheDocument();
    expect(screen.queryByTestId('vcc-home')).not.toBeInTheDocument();
  });

  it('navigates to module main route when clicking card outside the badge', () => {
    useStore.setState({
      tasks: [
        {
          id: 'dar-task-1',
          title: 'Review DAR-2026-001',
          type: 'REVIEW',
          department: 'QC',
          required_approval_level: 4,
          status: 'PENDING'
        }
      ]
    });

    render(
      <MemoryRouter initialEntries={['/portal']}>
        <Routes>
          <Route path="/portal" element={<PortalLandingPage />} />
          <Route path="/dcc" element={<div data-testid="dcc-home">DCC Home</div>} />
          <Route path="/dcc/tasks" element={<div data-testid="dcc-tasks-page">DCC Tasks Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Clicking module title on card
    fireEvent.click(screen.getByText('ระบบควบคุมเอกสาร (DCC)'));
    expect(screen.getByTestId('dcc-home')).toBeInTheDocument();
    expect(screen.queryByTestId('dcc-tasks-page')).not.toBeInTheDocument();
  });

  it('displays 99+ when task count exceeds 99', () => {
    const manyTasks = Array.from({ length: 105 }, (_, i) => ({
      id: `task-${i}`,
      title: `Task ${i}`,
      type: 'REVIEW',
      department: 'QC',
      required_approval_level: 4,
      status: 'PENDING'
    }));

    useStore.setState({ tasks: manyTasks });

    render(
      <MemoryRouter initialEntries={['/portal']}>
        <Routes>
          <Route path="/portal" element={<PortalLandingPage />} />
        </Routes>
      </MemoryRouter>
    );

    const dccBadge = screen.getByTestId('module-task-badge-dcc');
    expect(dccBadge).toBeInTheDocument();
    expect(dccBadge).toHaveTextContent('99+ งานรอคุณ');
  });

  it('dynamically refreshes badge count when currentUser is switched', () => {
    useStore.setState({
      currentUser: { id: 'u1', name: 'QC Staff', department: 'QC', approval_level: 2 },
      tasks: [
        {
          id: 'dcc-l5-task',
          title: 'Approve High-Level Doc',
          type: 'APPROVE',
          department: 'QC',
          required_approval_level: 5,
          status: 'PENDING'
        }
      ]
    });

    const { rerender } = render(
      <MemoryRouter initialEntries={['/portal']}>
        <Routes>
          <Route path="/portal" element={<PortalLandingPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Staff level 2 cannot approve level 5 -> count is 0, no badge
    expect(screen.queryByTestId('module-task-badge-dcc')).not.toBeInTheDocument();

    // Switch to Manager level 5 in QC
    act(() => {
      useStore.setState({
        currentUser: { id: 'u2', name: 'QC Manager', department: 'QC', approval_level: 5 }
      });
    });

    rerender(
      <MemoryRouter initialEntries={['/portal']}>
        <Routes>
          <Route path="/portal" element={<PortalLandingPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Now badge appears with 1
    const badge = screen.getByTestId('module-task-badge-dcc');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('1 งานรอคุณ');
  });
});
