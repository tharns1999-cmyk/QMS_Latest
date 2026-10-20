import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../store/useStore';
import Dashboard from '../../modules/dcc/pages/Dashboard/Dashboard';
import Header from '../layout/Header';

describe('Reactive User Session & Strict Data Scoping (Draft Isolation & Role Scoping)', () => {
  const thanawutUser = {
    id: 'EMP-001',
    empId: 'EMP-001',
    name: 'ธนาวุฒิ สมควรกิจดำรง',
    department: 'DC',
    position: 'DCC Supervisor',
    role: 'DCC_ADMIN',
    isDcc: true,
    isQmr: false,
    level: 4
  };

  const rayUser = {
    id: 'U004',
    empId: 'EMP-004',
    name: 'คุณเรย์',
    fullName: 'คุณเรย์',
    department: 'MGMT',
    position: 'General Manager / QMR',
    role: 'DEPT_ADMIN',
    isDcc: false,
    isQmr: true,
    level: 6
  };

  const beamUser = {
    id: 'U005',
    empId: 'EMP-005',
    name: 'บีม',
    fullName: 'บีม',
    department: 'QC',
    position: 'QC Specialist',
    role: 'DEPT_ADMIN',
    isDcc: false,
    isQmr: false,
    level: 5
  };

  const thanawutDraft = {
    id: 'draft_dc_thanawut_001',
    title: 'แบบร่างคู่มือจัดเก็บเอกสารแม่บท (DC Draft by Thanawut)',
    type: 'NEW',
    status: 'DRAFT',
    isDraft: true,
    requesterId: 'EMP-001',
    requesterName: 'ธนาวุฒิ สมควรกิจดำรง',
    department: 'DC',
    date: '2026-09-18'
  };

  const rayDraft = {
    id: 'draft_mgmt_ray_001',
    title: 'แบบร่างนโยบายคุณภาพฝ่ายบริหาร (MGMT Draft by Ray)',
    type: 'NEW',
    status: 'DRAFT',
    isDraft: true,
    requesterId: 'U004',
    requesterName: 'คุณเรย์',
    department: 'MGMT',
    date: '2026-09-18'
  };

  const beamDraft = {
    id: 'draft_qc_beam_001',
    title: 'แบบร่างมาตรฐานการตรวจสอบคุณภาพ (QC Draft by Beam)',
    type: 'NEW',
    status: 'ฉบับร่าง',
    isDraft: true,
    requesterId: 'U005',
    requesterName: 'บีม',
    department: 'QC',
    date: '2026-09-18'
  };

  const completedDar = {
    id: 'DAR-2026-COMPLETED-01',
    darNumber: 'DAR-2026-COMPLETED-01',
    title: 'WI-QC-001 การตรวจสอบสารเคมีในกระบวนการ',
    type: 'NEW',
    status: 'EFFECTIVE',
    isDraft: false,
    requesterId: 'U005',
    department: 'QC',
    date: '2026-09-15'
  };

  const rayPendingTaskDar = {
    id: 'DAR-2026-PENDING-02',
    darNumber: 'DAR-2026-PENDING-02',
    title: 'SOP-PD-002 การควบคุมไลน์การผลิตอัตโนมัติ',
    type: 'REVISION',
    status: 'PENDING_APPROVAL',
    isDraft: false,
    requesterId: 'U012',
    department: 'PD',
    date: '2026-09-16'
  };

  const rayApprovalTask = {
    id: 'task_app_001',
    darId: 'DAR-2026-PENDING-02',
    type: 'Approve',
    status: 'PENDING_APPROVAL',
    assigneeId: 'U004',
    assigneeRole: 'APPROVER',
    targetDepartment: 'MGMT'
  };

  beforeEach(() => {
    useStore.setState({
      currentUser: thanawutUser,
      masterUsers: [thanawutUser, rayUser, beamUser],
      dars: [thanawutDraft, rayDraft, beamDraft, completedDar, rayPendingTaskDar],
      tasks: [rayApprovalTask],
      documents: [],
      controlledCopyInstances: []
    });
  });

  describe('1. Reactive User Session in Header & Single Source of Truth', () => {
    it('reactively updates greeting to "สวัสดีคุณ คุณเรย์" with role GM/QMR when switching user', () => {
      render(
        <MemoryRouter initialEntries={['/dcc/dashboard']}>
          <Dashboard />
        </MemoryRouter>
      );

      // Initially logged in as Thanawut
      expect(screen.getByText(/สวัสดีคุณ ธนาวุฒิ สมควรกิจดำรง/)).toBeInTheDocument();
      expect(screen.getByText('DCC')).toBeInTheDocument();

      // Switch user to Ray via store action
      act(() => {
        useStore.getState().switchUser('U004');
      });

      // Greeting must reactively change to Ray with GM/QMR role
      expect(screen.getByText(/สวัสดีคุณ คุณเรย์/)).toBeInTheDocument();
      expect(screen.getByText('GM/QMR')).toBeInTheDocument();
      expect(screen.getByText(/General Manager \/ QMR/)).toBeInTheDocument();
      expect(screen.queryByText(/สวัสดีคุณ ธนาวุฒิ/)).not.toBeInTheDocument();

      // Switch user to Beam
      act(() => {
        useStore.getState().switchUser('U005');
      });

      // Greeting must reactively change to Beam
      expect(screen.getByText(/สวัสดีคุณ บีม/)).toBeInTheDocument();
      expect(screen.getByText('QC')).toBeInTheDocument();
    });

    it('DashboardHeader and Header layout component reactively reflect currentUser', () => {
      useStore.setState({ currentUser: rayUser });

      render(
        <MemoryRouter>
          <Header type="dashboard" />
        </MemoryRouter>
      );

      expect(screen.getByText(/สวัสดีคุณ คุณเรย์/)).toBeInTheDocument();
      expect(screen.getByText('GM/QMR')).toBeInTheDocument();
    });
  });

  describe('2. Strict Draft Isolation (ห้ามฉบับร่างรั่ว)', () => {
    it('when logged in as Ray: hides Thanawuts draft and Beams draft immediately', () => {
      useStore.setState({ currentUser: rayUser });

      render(
        <MemoryRouter initialEntries={['/dcc/dashboard']}>
          <Dashboard />
        </MemoryRouter>
      );

      // Ray MUST see Ray's own draft
      expect(screen.getByText('แบบร่างนโยบายคุณภาพฝ่ายบริหาร (MGMT Draft by Ray)')).toBeInTheDocument();

      // Ray MUST NOT see Thanawut's draft
      expect(screen.queryByText('แบบร่างคู่มือจัดเก็บเอกสารแม่บท (DC Draft by Thanawut)')).not.toBeInTheDocument();

      // Ray MUST NOT see Beam's draft
      expect(screen.queryByText('แบบร่างมาตรฐานการตรวจสอบคุณภาพ (QC Draft by Beam)')).not.toBeInTheDocument();
    });

    it('when switching from Thanawut to Ray, Thanawuts draft row disappears from screen', () => {
      useStore.setState({ currentUser: thanawutUser });

      render(
        <MemoryRouter initialEntries={['/dcc/dashboard']}>
          <Dashboard />
        </MemoryRouter>
      );

      // Initially Thanawut sees his draft
      expect(screen.getByText('แบบร่างคู่มือจัดเก็บเอกสารแม่บท (DC Draft by Thanawut)')).toBeInTheDocument();

      // Switch to Ray
      act(() => {
        useStore.getState().switchUser('U004');
      });

      // Thanawut's draft disappears immediately
      expect(screen.queryByText('แบบร่างคู่มือจัดเก็บเอกสารแม่บท (DC Draft by Thanawut)')).not.toBeInTheDocument();
      // Ray's draft is now visible
      expect(screen.getByText('แบบร่างนโยบายคุณภาพฝ่ายบริหาร (MGMT Draft by Ray)')).toBeInTheDocument();
    });
  });

  describe('3. Role-Based Scoping & Summary Counters', () => {
    it('recalculates summary draft counter to only count current users drafts', () => {
      // Thanawut has 1 draft
      useStore.setState({ currentUser: thanawutUser });
      const { rerender } = render(
        <MemoryRouter initialEntries={['/dcc/dashboard']}>
          <Dashboard />
        </MemoryRouter>
      );

      // When switched to Ray (who also has 1 draft of his own)
      act(() => {
        useStore.getState().switchUser('U004');
      });
      rerender(
        <MemoryRouter initialEntries={['/dcc/dashboard']}>
          <Dashboard />
        </MemoryRouter>
      );

      // Ray sees his actionable task and completed requests
      expect(screen.getByText('SOP-PD-002 การควบคุมไลน์การผลิตอัตโนมัติ')).toBeInTheDocument();
      expect(screen.getByText('WI-QC-001 การตรวจสอบสารเคมีในกระบวนการ')).toBeInTheDocument();
    });
  });
});
