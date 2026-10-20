import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import useStore from '../../store/useStore';
import ProtectedRoute from '../auth/ProtectedRoute';
import Sidebar from '../layout/Sidebar';
import toast from 'react-hot-toast';

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
    dismiss: vi.fn(),
    custom: vi.fn(),
  },
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    dismiss: vi.fn(),
    custom: vi.fn(),
  }
}));

describe('System-Wide RBAC, Route Guards & Dynamic User-Switching Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      currentUser: {
        id: 'U001',
        name: 'Admin QA (DCC)',
        role: 'DCC_ADMIN',
        isDcc: true,
        department: 'QA',
        level: 1
      },
      masterUsers: [
        { id: 'U001', name: 'Admin QA (DCC)', role: 'DCC_ADMIN', isDcc: true, department: 'QA', level: 1 },
        { id: 'U002', name: 'ธนาวุฒิ สมควรกิจดำรง', role: 'DEPT_ADMIN', isDcc: false, department: 'PD', level: 4 },
        { id: 'U003', name: 'กัลยาณี พลไกร', role: 'DEPT_ADMIN', isDcc: false, department: 'PD', level: 5 },
        { id: 'U010', name: 'สมชาย การตลาด', role: 'GENERAL_USER', isDcc: false, department: 'MKT', level: 3 }
      ]
    });
  });

  describe('1. ProtectedRoute Component & Permissions', () => {
    it('grants access to DCC user for requireDcc and requireAdmin routes', () => {
      render(
        <MemoryRouter initialEntries={['/protected-dcc']}>
          <Routes>
            <Route 
              path="/protected-dcc" 
              element={
                <ProtectedRoute requireDcc>
                  <div>DCC Secret Area</div>
                </ProtectedRoute>
              } 
            />
            <Route path="/dcc/dashboard" element={<div>Dashboard Page</div>} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('DCC Secret Area')).toBeInTheDocument();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('denies access to non-DCC user for requireDcc and redirects to dashboard with toast', () => {
      useStore.setState({
        currentUser: {
          id: 'U003',
          name: 'กัลยาณี พลไกร',
          role: 'DEPT_ADMIN',
          isDcc: false,
          department: 'PD',
          level: 5
        }
      });

      render(
        <MemoryRouter initialEntries={['/dcc/controlled-copy']}>
          <Routes>
            <Route 
              path="/dcc/controlled-copy" 
              element={
                <ProtectedRoute requireDcc deniedToastMessage="คุณไม่มีสิทธิ์เข้าถึงศูนย์ควบคุมงาน DCC">
                  <div>DCC Controlled Copy Table</div>
                </ProtectedRoute>
              } 
            />
            <Route path="/dcc/dashboard" element={<div>Redirected Dashboard</div>} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.queryByText('DCC Controlled Copy Table')).not.toBeInTheDocument();
      expect(screen.getByText('Redirected Dashboard')).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith('คุณไม่มีสิทธิ์เข้าถึงศูนย์ควบคุมงาน DCC', { id: 'rbac-denied-toast' });
    });

    it('denies access to non-DCC manager (Level 5+) for requireAdmin and redirects with master data toast', () => {
      useStore.setState({
        currentUser: {
          id: 'U003',
          name: 'กัลยาณี พลไกร',
          role: 'DEPT_ADMIN',
          isDcc: false,
          department: 'PD',
          level: 5
        }
      });

      render(
        <MemoryRouter initialEntries={['/dcc/admin/master-data']}>
          <Routes>
            <Route 
              path="/dcc/admin/master-data" 
              element={
                <ProtectedRoute requireAdmin deniedToastMessage="คุณไม่มีสิทธิ์เข้าถึงศูนย์จัดการข้อมูลหลัก">
                  <div>Master Data Hub</div>
                </ProtectedRoute>
              } 
            />
            <Route path="/dcc/dashboard" element={<div>Redirected Dashboard</div>} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.queryByText('Master Data Hub')).not.toBeInTheDocument();
      expect(screen.getByText('Redirected Dashboard')).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith('คุณไม่มีสิทธิ์เข้าถึงศูนย์จัดการข้อมูลหลัก', { id: 'rbac-denied-toast' });
    });
  });

  describe('2. Sidebar Menu Dynamic Visibility based on Active User', () => {
    it('shows DCC-exclusive menus when DCC Admin is the active user', () => {
      render(
        <MemoryRouter initialEntries={['/dcc/dashboard']}>
          <Sidebar />
        </MemoryRouter>
      );

      expect(screen.getByText('ทะเบียนสำเนาควบคุม')).toBeInTheDocument();
      expect(screen.getByText('จัดการข้อมูลหลัก')).toBeInTheDocument();
      expect(screen.getByText('บันทึกประวัติการทำงาน')).toBeInTheDocument();
      expect(screen.getByTitle(/ล้างข้อมูลจำลอง/)).toBeInTheDocument();
    });

    it('hides DCC-exclusive menus when active user is a non-DCC department manager (e.g. Kalyanee L5)', () => {
      useStore.setState({
        currentUser: {
          id: 'U003',
          name: 'กัลยาณี พลไกร',
          role: 'DEPT_ADMIN',
          isDcc: false,
          department: 'PD',
          level: 5
        }
      });

      render(
        <MemoryRouter initialEntries={['/dcc/dashboard']}>
          <Sidebar />
        </MemoryRouter>
      );

      expect(screen.queryByText('ทะเบียนสำเนาควบคุม')).not.toBeInTheDocument();
      expect(screen.queryByText('จัดการข้อมูลหลัก')).not.toBeInTheDocument();
      expect(screen.queryByText('บันทึกประวัติการทำงาน')).not.toBeInTheDocument();
      expect(screen.queryByTitle(/ล้างข้อมูลจำลอง/)).not.toBeInTheDocument();
      // Regular menus are still visible
      expect(screen.getByText('คลังเอกสารแม่บท')).toBeInTheDocument();
      expect(screen.getByText('เอกสารภายนอก')).toBeInTheDocument();
    });
  });

  describe('3. Dynamic User-Switching Reactivity without Page Reload', () => {
    it('immediately hides DCC menus and redirects when switching user via Sidebar role selector', async () => {
      const { rerender } = render(
        <MemoryRouter initialEntries={['/dcc/controlled-copy']}>
          <div className="flex">
            <Sidebar />
            <main>
              <Routes>
                <Route 
                  path="/dcc/controlled-copy" 
                  element={
                    <ProtectedRoute requireDcc deniedToastMessage="คุณไม่มีสิทธิ์เข้าถึงศูนย์ควบคุมงาน DCC">
                      <div data-testid="controlled-copy-page">DCC Controlled Copy Page</div>
                    </ProtectedRoute>
                  } 
                />
                <Route path="/dcc/dashboard" element={<div data-testid="dashboard-page">DCC Dashboard Page</div>} />
              </Routes>
            </main>
          </div>
        </MemoryRouter>
      );

      // Initially U001 (DCC) is active
      expect(screen.getByTestId('controlled-copy-page')).toBeInTheDocument();
      expect(screen.getByText('ทะเบียนสำเนาควบคุม')).toBeInTheDocument();

      // Switch user to U003 (Kalyanee - PD) via store
      act(() => {
        useStore.getState().setCurrentUser('U003');
      });

      // Rerender triggers React component update
      rerender(
        <MemoryRouter initialEntries={['/dcc/controlled-copy']}>
          <div className="flex">
            <Sidebar />
            <main>
              <Routes>
                <Route 
                  path="/dcc/controlled-copy" 
                  element={
                    <ProtectedRoute requireDcc deniedToastMessage="คุณไม่มีสิทธิ์เข้าถึงศูนย์ควบคุมงาน DCC">
                      <div data-testid="controlled-copy-page">DCC Controlled Copy Page</div>
                    </ProtectedRoute>
                  } 
                />
                <Route path="/dcc/dashboard" element={<div data-testid="dashboard-page">DCC Dashboard Page</div>} />
              </Routes>
            </main>
          </div>
        </MemoryRouter>
      );

      // Controlled Copy Page must be unmounted and redirect to Dashboard
      expect(screen.queryByTestId('controlled-copy-page')).not.toBeInTheDocument();
      expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      // Sidebar DCC menu must be gone
      expect(screen.queryByText('ทะเบียนสำเนาควบคุม')).not.toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith('คุณไม่มีสิทธิ์เข้าถึงศูนย์ควบคุมงาน DCC', { id: 'rbac-denied-toast' });
    });
  });
});
