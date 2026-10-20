import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import useStore from '../../../store/useStore';
import DarList from '../pages/DarWorkflow/DarList';
import Dashboard from '../pages/Dashboard/Dashboard';
import DarDetail from '../pages/DarWorkflow/DarDetail';
import { isDarDraft, isDarRequester, canViewDar } from '../utils/darHelper';

describe('Strict Data Isolation for My DAR Requests & Universal Draft Privacy', () => {
  // Test Users
  const dccAdminUser = {
    id: 'EMP-001',
    empId: 'EMP-001',
    name: 'ธนาวุฒิ สมควรกิจดำรง',
    department: 'DC',
    dept: 'DC',
    role: 'DCC_ADMIN',
    isDcc: true,
    level: 4
  };

  const pdSiraphatUser = {
    id: 'U012',
    empId: 'EMP-012',
    name: 'สิรภัทร แจ่มมิน',
    department: 'PD',
    dept: 'PD',
    role: 'GENERAL_USER',
    isDcc: false,
    level: 2
  };

  // Test DAR Data
  const siraphatDraft = {
    id: 'draft_pd_siraphat_001',
    title: 'คู่มือการปฏิบัติงานสายการผลิตใหม่ (PD Draft by Siraphat)',
    type: 'NEW',
    status: 'DRAFT',
    isDraft: true,
    requesterId: 'U012',
    requester_id: 'U012',
    requester: 'สิรภัทร แจ่มมิน',
    department: 'PD',
    date: '2026-09-06'
  };

  const siraphatSubmittedDar = {
    id: 'DAR-2026-088',
    darNumber: 'DAR-2026-088',
    title: 'ขออนุมัติ WI บรรจุภัณฑ์ (PD Submitted by Siraphat)',
    type: 'NEW',
    status: 'UNDER_REVIEW',
    isDraft: false,
    requesterId: 'U012',
    requester_id: 'U012',
    requester: 'สิรภัทร แจ่มมิน',
    department: 'PD',
    date: '2026-09-05'
  };

  const dccAdminDraft = {
    id: 'draft_dc_thanawut_001',
    title: 'แบบร่างคู่มือจัดเก็บเอกสารแม่บท (DC Draft by Thanawut)',
    type: 'NEW',
    status: 'DRAFT',
    isDraft: true,
    requesterId: 'EMP-001',
    requester_id: 'EMP-001',
    requester: 'ธนาวุฒิ สมควรกิจดำรง',
    department: 'DC',
    date: '2026-09-06'
  };

  const dccAdminSubmittedDar = {
    id: 'DAR-2026-010',
    darNumber: 'DAR-2026-010',
    title: 'ขอปรับปรุงระบบทะเบียนควบคุมเอกสาร (DC Submitted by Thanawut)',
    type: 'REVISION',
    status: 'PENDING_APPROVAL',
    isDraft: false,
    requesterId: 'EMP-001',
    requester_id: 'EMP-001',
    requester: 'ธนาวุฒิ สมควรกิจดำรง',
    department: 'DC',
    date: '2026-09-04'
  };

  beforeEach(() => {
    useStore.setState({
      currentUser: dccAdminUser,
      dars: [siraphatDraft, siraphatSubmittedDar, dccAdminDraft, dccAdminSubmittedDar],
      tasks: [],
      masterUsers: [dccAdminUser, pdSiraphatUser],
      timeline: []
    });
  });

  describe('1. Universal Draft Privacy & Identity Helpers (darHelper.js)', () => {
    it('accurately identifies draft status across multiple indicators', () => {
      expect(isDarDraft(siraphatDraft)).toBe(true);
      expect(isDarDraft(dccAdminDraft)).toBe(true);
      expect(isDarDraft({ id: 'draft_123', status: 'UNKNOWN' })).toBe(true);
      expect(isDarDraft(siraphatSubmittedDar)).toBe(false);
      expect(isDarDraft(dccAdminSubmittedDar)).toBe(false);
    });

    it('correctly matches currentUser as requester by ID or Name', () => {
      expect(isDarRequester(siraphatDraft, pdSiraphatUser)).toBe(true);
      expect(isDarRequester(siraphatSubmittedDar, pdSiraphatUser)).toBe(true);
      expect(isDarRequester(siraphatDraft, dccAdminUser)).toBe(false);
      expect(isDarRequester(dccAdminDraft, dccAdminUser)).toBe(true);
    });

    it('enforces canViewDar invariant: non-creator CANNOT view draft even if DCC Admin', () => {
      // DCC Admin cannot view Siraphat's draft
      expect(canViewDar(siraphatDraft, dccAdminUser)).toBe(false);
      // Siraphat can view her own draft
      expect(canViewDar(siraphatDraft, pdSiraphatUser)).toBe(true);
      // DCC Admin can view submitted DAR from Siraphat
      expect(canViewDar(siraphatSubmittedDar, dccAdminUser)).toBe(true);
    });
  });

  describe('2. Strict Personal Scoping in "My DAR Requests" (DarList.jsx)', () => {
    it('displays updated title "คำร้อง DAR ของฉัน (My DAR Requests)"', () => {
      render(
        <MemoryRouter initialEntries={['/dcc/dar/list']}>
          <DarList />
        </MemoryRouter>
      );

      expect(screen.getByText('คำร้อง DAR ของฉัน (My DAR Requests)')).toBeInTheDocument();
      expect(screen.getByText(/รายการคำร้องขอจัดการเอกสารที่คุณเป็นผู้ยื่นคำร้อง/)).toBeInTheDocument();
    });

    it('when logged in as DCC Admin (ธนาวุฒิ): HIDES Siraphat (PD) drafts and requests', () => {
      useStore.setState({ currentUser: dccAdminUser });

      render(
        <MemoryRouter initialEntries={['/dcc/dar/list']}>
          <DarList />
        </MemoryRouter>
      );

      // Must NOT see Siraphat's draft
      expect(screen.queryByText('คู่มือการปฏิบัติงานสายการผลิตใหม่ (PD Draft by Siraphat)')).not.toBeInTheDocument();
      // Must NOT see Siraphat's submitted request in personal "My DAR" list
      expect(screen.queryByText('ขออนุมัติ WI บรรจุภัณฑ์ (PD Submitted by Siraphat)')).not.toBeInTheDocument();

      // MUST see DCC Admin's own draft and request
      expect(screen.getByText('แบบร่างคู่มือจัดเก็บเอกสารแม่บท (DC Draft by Thanawut)')).toBeInTheDocument();
      expect(screen.getByText('ขอปรับปรุงระบบทะเบียนควบคุมเอกสาร (DC Submitted by Thanawut)')).toBeInTheDocument();
    });

    it('when logged in as Siraphat (สิรภัทร PD): displays her own draft and requests, hides Thanawuts', () => {
      useStore.setState({ currentUser: pdSiraphatUser });

      render(
        <MemoryRouter initialEntries={['/dcc/dar/list']}>
          <DarList />
        </MemoryRouter>
      );

      // MUST see Siraphat's own draft and request
      expect(screen.getByText('คู่มือการปฏิบัติงานสายการผลิตใหม่ (PD Draft by Siraphat)')).toBeInTheDocument();
      expect(screen.getByText('ขออนุมัติ WI บรรจุภัณฑ์ (PD Submitted by Siraphat)')).toBeInTheDocument();

      // Must NOT see DCC Admin's draft or requests
      expect(screen.queryByText('แบบร่างคู่มือจัดเก็บเอกสารแม่บท (DC Draft by Thanawut)')).not.toBeInTheDocument();
      expect(screen.queryByText('ขอปรับปรุงระบบทะเบียนควบคุมเอกสาร (DC Submitted by Thanawut)')).not.toBeInTheDocument();
    });
  });

  describe('3. Dashboard Leak Prevention & Stat Integrity (Dashboard.jsx)', () => {
    it('ensures myDraftCount on Dashboard only counts drafts created by currentUser', () => {
      // Logged in as DCC Admin: only 1 draft created by Thanawut, Siraphat draft must be ignored
      useStore.setState({ currentUser: dccAdminUser });

      render(
        <MemoryRouter initialEntries={['/dcc/dashboard']}>
          <Dashboard />
        </MemoryRouter>
      );

      // Verify Recent DARs does NOT show Siraphat's draft to DCC Admin
      expect(screen.queryByText('คู่มือการปฏิบัติงานสายการผลิตใหม่ (PD Draft by Siraphat)')).not.toBeInTheDocument();
      // Verify DCC Admin's own draft IS shown
      expect(screen.getByText('แบบร่างคู่มือจัดเก็บเอกสารแม่บท (DC Draft by Thanawut)')).toBeInTheDocument();
    });
  });

  describe('4. Direct Route Universal Draft Privacy Guard (DarDetail.jsx)', () => {
    it('blocks DCC Admin from accessing Siraphat draft via /dar/:id', () => {
      useStore.setState({ currentUser: dccAdminUser });

      render(
        <MemoryRouter initialEntries={['/dar/draft_pd_siraphat_001']}>
          <Routes>
            <Route path="/dar/:id" element={<DarDetail />} />
          </Routes>
        </MemoryRouter>
      );

      // Privacy barrier must be rendered
      expect(screen.getByText('ไม่สามารถเข้าถึงเอกสารฉบับร่างได้')).toBeInTheDocument();
      expect(screen.getByText(/คำร้องนี้อยู่ในสถานะแบบร่าง \(Draft\) ซึ่งเป็นสิทธิ์ส่วนบุคคลของผู้สร้างคำร้องเท่านั้น/)).toBeInTheDocument();

      // Draft content must NOT be shown
      expect(screen.queryByText('คู่มือการปฏิบัติงานสายการผลิตใหม่ (PD Draft by Siraphat)')).not.toBeInTheDocument();
    });

    it('allows Siraphat to view her own draft via /dar/:id', () => {
      useStore.setState({ currentUser: pdSiraphatUser });

      render(
        <MemoryRouter initialEntries={['/dar/draft_pd_siraphat_001']}>
          <Routes>
            <Route path="/dar/:id" element={<DarDetail />} />
          </Routes>
        </MemoryRouter>
      );

      // Siraphat can view her own draft details
      expect(screen.getAllByText('คู่มือการปฏิบัติงานสายการผลิตใหม่ (PD Draft by Siraphat)').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('ไม่สามารถเข้าถึงเอกสารฉบับร่างได้')).not.toBeInTheDocument();
    });
  });
});
