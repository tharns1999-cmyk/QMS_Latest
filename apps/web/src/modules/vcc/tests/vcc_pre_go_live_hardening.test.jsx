import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import useStore from '../../../store/useStore';
import { isVccAuthorized as isApiVccAuth } from '../api/vccApi';
import { isVccAuthorized as isPlanVccAuth } from '../api/vccPlanApi';
import { moduleRegistry } from '../../portal/moduleRegistry';
import ProtectedRoute from '../../../app/auth/ProtectedRoute';
import Layout from '../../../app/layout/Layout';
import VccDashboardSection from '../components/VccDashboardSection';

describe('VCC Pre-Go-Live Hardening Regression Suite', () => {
  beforeEach(() => {
    useStore.setState({
      currentUser: {
        id: 'qc-user-1',
        name: 'QC Test Staff',
        department: 'QC',
        depts: ['QC'],
        approval_level: 2,
        isDcc: false,
        isQmr: false
      }
    });
  });

  describe('1. VCC Department Access Expansion (DC, QC, QA, MGT, LB)', () => {
    it('grants VCC authorization to DC, QC, QA, MGT, and LB users', () => {
      const allowedDepts = ['DC', 'QC', 'QA', 'MGT', 'LB'];
      for (const dept of allowedDepts) {
        const user = { id: `user-${dept}`, department: dept, depts: [dept], approval_level: 2 };
        expect(isApiVccAuth(user), `vccApi should authorize ${dept}`).toBe(true);
        expect(isPlanVccAuth(user), `vccPlanApi should authorize ${dept}`).toBe(true);
      }
    });

    it('denies VCC authorization to unauthorized departments (PD, WH, HR, EN)', () => {
      const deniedDepts = ['PD', 'WH', 'HR', 'EN'];
      for (const dept of deniedDepts) {
        const user = { id: `user-${dept}`, department: dept, depts: [dept], approval_level: 2 };
        expect(isApiVccAuth(user), `vccApi should deny ${dept}`).toBe(false);
        expect(isPlanVccAuth(user), `vccPlanApi should deny ${dept}`).toBe(false);
      }
    });

    it('allows high-level executives (approval_level >= 6) or DCC/QMR regardless of department', () => {
      const execUser = { id: 'ceo', department: 'PD', depts: ['PD'], approval_level: 6 };
      expect(isApiVccAuth(execUser)).toBe(true);
      expect(isPlanVccAuth(execUser)).toBe(true);

      const dccUser = { id: 'dcc1', department: 'WH', depts: ['WH'], isDcc: true };
      expect(isApiVccAuth(dccUser)).toBe(true);
      expect(isPlanVccAuth(dccUser)).toBe(true);
    });

    it('includes DC, QC, QA, MGT, LB in moduleRegistry allowedDepartments', () => {
      const vccMod = moduleRegistry.find((m) => m.moduleId === 'vcc');
      expect(vccMod).toBeDefined();
      expect(vccMod.allowedDepartments).toEqual(expect.arrayContaining(['DC', 'QC', 'QA', 'MGT', 'LB']));
      expect(vccMod.allowedDepartments).not.toContain('PD');
      expect(vccMod.allowedDepartments).not.toContain('WH');
    });

    it('blocks unauthorized users via ProtectedRoute and redirects with Thai warning', () => {
      useStore.setState({
        currentUser: { id: 'wh-staff', name: 'พนักงานคลัง', department: 'WH', depts: ['WH'], approval_level: 2 }
      });

      render(
        <MemoryRouter initialEntries={['/vcc/dashboard']}>
          <Routes>
            <Route
              path="/vcc/dashboard"
              element={
                <ProtectedRoute requireVcc redirectPath="/portal">
                  <div data-testid="vcc-content">หน้าแดชบอร์ด VCC</div>
                </ProtectedRoute>
              }
            />
            <Route path="/portal" element={<div data-testid="portal-content">หน้าหลักพอร์ทัล</div>} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.queryByTestId('vcc-content')).not.toBeInTheDocument();
      expect(screen.getByTestId('portal-content')).toBeInTheDocument();
    });
  });

  describe('2. Dashboard Dynamic Year Calculation', () => {
    it('defaults to current calendar year and populates data-driven range in select', () => {
      const currentYear = new Date().getFullYear();
      render(
        <MemoryRouter>
          <VccDashboardSection onNavigateToWorkOrders={() => {}} />
        </MemoryRouter>
      );

      const yearSelect = screen.getByLabelText(/เลือกปีแผน Dashboard/i);
      expect(yearSelect).toBeInTheDocument();
      expect(Number(yearSelect.value)).toBe(currentYear);

      // Verify options are data-driven: contains current year and plan year (2027), descending order, no arbitrary empty years
      const options = Array.from(yearSelect.querySelectorAll('option')).map((o) => Number(o.value));
      expect(options).toContain(currentYear);
      expect(options).toContain(2027);
      expect(options).not.toContain(currentYear - 1);
      for (let i = 0; i < options.length - 1; i++) {
        expect(options[i]).toBeGreaterThanOrEqual(options[i + 1]);
      }
    });
  });

  describe('3. Production Safety: Demo Mode Visual Banner', () => {
    it('renders prominent DEMO MODE banner in Layout when running in mock mode', () => {
      render(
        <MemoryRouter initialEntries={['/portal']}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="portal" element={<div>Portal Content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      );

      const banner = screen.getByTestId('demo-mode-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent(/โหมดข้อมูลจำลอง \(DEMO MODE \/ LOCAL STORAGE\)/i);
    });
  });
});
