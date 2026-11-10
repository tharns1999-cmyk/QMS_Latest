import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import { AnnualPlanWorkspaceHeader } from '../components/AnnualPlanWorkspaceHeader';
import VccDocumentProfilesSummary from '../components/VccDocumentProfilesSummary';
import { PlanSettingsModal } from '../components/PlanSettingsModal';
import * as vccPlanApi from '../api/vccPlanApi';

const renderWithRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

const mockDraftPlan = {
  id: 'PLAN-001',
  plan_year: 2026,
  department: 'QC',
  status: 'DRAFT',
  title: 'แผนการทวนสอบประจำปี QC 2026',
  items: []
};

const mockProfilesData = {
  profiles: {
    QC: {
      document_code: 'VCC-AP-QC-2026',
      revision: '01',
      reviewer_dept: 'QC',
      required_reviewer_level: 4,
      approver_dept: 'QA',
      required_approver_level: 5
    },
    LB: {
      document_code: 'VCC-AP-LB-2026',
      revision: '01',
      reviewer_dept: 'LB',
      required_reviewer_level: 4,
      approver_dept: 'QA',
      required_approver_level: 5
    }
  },
  departments: [
    { code: 'QC', name_th: 'ควบคุมคุณภาพ' },
    { code: 'LB', name_th: 'ห้องปฏิบัติการจุลชีววิทยา' }
  ],
  forms: [],
  allActiveUsers: [],
  readiness: {
    QC: { status: 'READY', issues: [] },
    LB: { status: 'READY', issues: [] }
  },
  canManage: true
};

describe('VCC Scope Leakage Fix & Settings Access Control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(vccPlanApi, 'fetchVccDocumentProfiles').mockResolvedValue(mockProfilesData);
  });

  it('1. Hides "ตั้งค่าแผนและเกณฑ์อนุมัติ" menu button for normal users (QC / LB L4 without DCC or L6+)', () => {
    const onOpenSettings = vi.fn();
    const normalUser = {
      id: 'qc4',
      name: 'QC เจ้าหน้าที่',
      department: 'QC',
      approval_level: 4,
      isDcc: false,
      isQmr: false
    };

    useStore.setState({ currentUser: normalUser });

    render(
      <AnnualPlanWorkspaceHeader
        activePlan={mockDraftPlan}
        plans={[mockDraftPlan]}
        onOpenSettings={onOpenSettings}
        canManageSettings={false}
      />
    );

    // Open extra menu
    const menuBtn = screen.getByRole('button', { name: 'เมนูเพิ่มเติมของแผน' });
    fireEvent.click(menuBtn);

    // Verify "ตั้งค่าแผนและเกณฑ์อนุมัติ" is NOT shown
    expect(screen.queryByRole('menuitem', { name: 'ตั้งค่าแผนและเกณฑ์อนุมัติ' })).not.toBeInTheDocument();
  });

  it('2. Shows "ตั้งค่าแผนและเกณฑ์อนุมัติ" menu button for DCC Admin / L6+ users', () => {
    const onOpenSettings = vi.fn();
    const adminUser = {
      id: 'dc4',
      name: 'DCC Admin',
      department: 'DC',
      approval_level: 4,
      isDcc: true,
      isQmr: false
    };

    useStore.setState({ currentUser: adminUser });

    render(
      <AnnualPlanWorkspaceHeader
        activePlan={mockDraftPlan}
        plans={[mockDraftPlan]}
        onOpenSettings={onOpenSettings}
        canManageSettings={true}
      />
    );

    const menuBtn = screen.getByRole('button', { name: 'เมนูเพิ่มเติมของแผน' });
    fireEvent.click(menuBtn);

    expect(screen.getByRole('menuitem', { name: 'ตั้งค่าแผนและเกณฑ์อนุมัติ' })).toBeInTheDocument();
  });

  it('3. Scope Leakage Prevention: QC user only sees QC in "แผนกที่ตั้งค่าแล้ว" dropdown and cannot see LB', async () => {
    const qcUser = {
      id: 'qc4',
      name: 'QC เจ้าหน้าที่',
      department: 'QC',
      approval_level: 4,
      isDcc: false,
      isQmr: false
    };

    renderWithRouter(<VccDocumentProfilesSummary currentUser={qcUser} />);

    expect(await screen.findByLabelText('แผนกที่ตั้งค่าแล้ว')).toBeInTheDocument();

    // Verify QC is present
    expect(screen.getByRole('option', { name: 'QC' })).toBeInTheDocument();

    // Verify LB is filtered out (No scope leakage!)
    expect(screen.queryByRole('option', { name: 'LB' })).not.toBeInTheDocument();
  });

  it('4. Scope Leakage Prevention: LB user only sees LB in "แผนกที่ตั้งค่าแล้ว" dropdown', async () => {
    const lbUser = {
      id: 'lb4',
      name: 'LB เจ้าหน้าที่',
      department: 'LB',
      approval_level: 4,
      isDcc: false,
      isQmr: false
    };

    renderWithRouter(<VccDocumentProfilesSummary currentUser={lbUser} />);

    expect(await screen.findByLabelText('แผนกที่ตั้งค่าแล้ว')).toBeInTheDocument();

    // Verify LB is present
    expect(screen.getByRole('option', { name: 'LB' })).toBeInTheDocument();

    // Verify QC is filtered out
    expect(screen.queryByRole('option', { name: 'QC' })).not.toBeInTheDocument();
  });

  it('5. Organization-wide authority (DCC Admin / L6+) can see all departments in dropdown', async () => {
    const dccUser = {
      id: 'dc4',
      name: 'DCC Admin',
      department: 'DC',
      approval_level: 4,
      isDcc: true,
      isQmr: false
    };

    renderWithRouter(<VccDocumentProfilesSummary currentUser={dccUser} />);

    expect(await screen.findByLabelText('แผนกที่ตั้งค่าแล้ว')).toBeInTheDocument();

    // Both QC and LB are present for org-wide authority
    expect(screen.getByRole('option', { name: 'QC' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'LB' })).toBeInTheDocument();
  });

  it('6. PlanSettingsModal integrates currentUser filtering when switching to profiles tab', async () => {
    const qcUser = {
      id: 'qc4',
      name: 'QC เจ้าหน้าที่',
      department: 'QC',
      approval_level: 4,
      isDcc: false,
      isQmr: false
    };

    renderWithRouter(
      <PlanSettingsModal
        open={true}
        onClose={vi.fn()}
        draftProviders={['NIMT']}
        setDraftProviders={vi.fn()}
        newProvider=""
        setNewProvider={vi.fn()}
        draftSettings={{}}
        setDraftSettings={vi.fn()}
        saving={false}
        onSave={vi.fn()}
        currentUser={qcUser}
      />
    );

    // Switch to profiles tab
    fireEvent.click(screen.getByRole('button', { name: /แบบฟอร์มและผู้รับผิดชอบตามแผนก/i }));

    expect(await screen.findByLabelText('แผนกที่ตั้งค่าแล้ว')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'QC' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'LB' })).not.toBeInTheDocument();
  });
});
