import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import useStore from '../../../store/useStore';
import { resetVccLocalStore } from '../api/vccApi';
import PortalLandingPage from '../../portal/pages/PortalLandingPage';
import ProtectedRoute from '../../../app/auth/ProtectedRoute';
import AnnualPlanWorkspaceHeader from '../components/AnnualPlanWorkspaceHeader';

const SAMPLE_MASTER_DEPTS = [
  { code: 'DC', name_th: 'ฝ่ายควบคุมเอกสาร', status: 'ACTIVE' },
  { code: 'QC', name_th: 'ฝ่ายควบคุมคุณภาพ', status: 'ACTIVE' },
  { code: 'QA', name_th: 'ฝ่ายประกันคุณภาพ', status: 'ACTIVE' },
  { code: 'PD', name_th: 'ฝ่ายผลิต', status: 'ACTIVE' },
  { code: 'WH', name_th: 'ฝ่ายคลังสินค้า', status: 'ACTIVE' }
];

describe('VCC Multi-Department Access & Workflow Enablement (Frontend)', () => {
  beforeEach(() => {
    resetVccLocalStore();
    useStore.setState({
      departments: SAMPLE_MASTER_DEPTS,
      masterDepartments: SAMPLE_MASTER_DEPTS
    });
  });

  describe('1. Portal Landing Page Visibility', () => {
    it('shows VCC card for QC Staff (isDcc: false, department: QC)', () => {
      useStore.setState({
        currentUser: { id: 'qc2', name: 'เจ้าหน้าที่ QC', department: 'QC', depts: ['QC'], approval_level: 2, isDcc: false }
      });
      render(
        <MemoryRouter>
          <PortalLandingPage />
        </MemoryRouter>
      );
      expect(screen.getByText('ระบบควบคุมเอกสาร (DCC)')).toBeInTheDocument();
      expect(screen.getByText('VCC (Verify and Calibration Center)')).toBeInTheDocument();
    });

    it('shows VCC card for QA Manager (isDcc: false, department: QA)', () => {
      useStore.setState({
        currentUser: { id: 'qa6', name: 'ผู้จัดการ QA', department: 'QA', depts: ['QA'], approval_level: 6, isDcc: false }
      });
      render(
        <MemoryRouter>
          <PortalLandingPage />
        </MemoryRouter>
      );
      expect(screen.getByText('VCC (Verify and Calibration Center)')).toBeInTheDocument();
    });

    it('shows VCC card for DCC User (isDcc: true, department: DC)', () => {
      useStore.setState({
        currentUser: { id: 'dc4', name: 'หัวหน้า DCC', department: 'DC', depts: ['DC'], approval_level: 4, isDcc: true }
      });
      render(
        <MemoryRouter>
          <PortalLandingPage />
        </MemoryRouter>
      );
      expect(screen.getByText('VCC (Verify and Calibration Center)')).toBeInTheDocument();
    });

    it('hides VCC card for Unauthorized Department (PD/WH Staff, isDcc: false)', () => {
      useStore.setState({
        currentUser: { id: 'pd2', name: 'เจ้าหน้าที่ฝ่ายผลิต', department: 'PD', depts: ['PD'], approval_level: 2, isDcc: false }
      });
      render(
        <MemoryRouter>
          <PortalLandingPage />
        </MemoryRouter>
      );
      expect(screen.getByText('ระบบควบคุมเอกสาร (DCC)')).toBeInTheDocument();
      expect(screen.queryByText('VCC (Verify and Calibration Center)')).not.toBeInTheDocument();
    });
  });

  describe('2. Protected Route Guards for VCC', () => {
    it('allows QC and QA users to access VCC protected routes', () => {
      useStore.setState({
        currentUser: { id: 'qc4', name: 'หัวหน้า QC', department: 'QC', depts: ['QC'], approval_level: 4, isDcc: false }
      });
      render(
        <MemoryRouter initialEntries={['/vcc/plans']}>
          <Routes>
            <Route
              path="/vcc/plans"
              element={
                <ProtectedRoute requireVcc redirectPath="/portal">
                  <div data-testid="vcc-plans-view">หน้าแผนการทวนสอบประจำปี</div>
                </ProtectedRoute>
              }
            />
            <Route path="/portal" element={<div>หน้าหลักพอร์ทัล</div>} />
          </Routes>
        </MemoryRouter>
      );
      expect(screen.getByTestId('vcc-plans-view')).toBeInTheDocument();
    });

    it('denies access to unauthorized department (PD) and redirects to portal', () => {
      useStore.setState({
        currentUser: { id: 'pd2', name: 'ฝ่ายผลิต', department: 'PD', depts: ['PD'], approval_level: 2, isDcc: false }
      });
      render(
        <MemoryRouter initialEntries={['/vcc/plans']}>
          <Routes>
            <Route
              path="/vcc/plans"
              element={
                <ProtectedRoute requireVcc redirectPath="/portal" deniedToastMessage="เฉพาะผู้ใช้งานแผนก DCC, QC และ QA เท่านั้นที่สามารถเข้าใช้งาน VCC ได้">
                  <div data-testid="vcc-plans-view">หน้าแผนการทวนสอบประจำปี</div>
                </ProtectedRoute>
              }
            />
            <Route path="/portal" element={<div data-testid="portal-view">หน้าหลักพอร์ทัล</div>} />
          </Routes>
        </MemoryRouter>
      );
      expect(screen.queryByTestId('vcc-plans-view')).not.toBeInTheDocument();
      expect(screen.getByTestId('portal-view')).toBeInTheDocument();
    });
  });

  describe('3. Annual Plan Workspace Header Actions across Roles', () => {
    const mockDraftPlan = {
      id: 'plan-qc-2026',
      plan_year: 2026,
      department: 'QC',
      department_name_th: 'ฝ่ายควบคุมคุณภาพ',
      document_code: 'FM-QC-46',
      revision: '00',
      status: 'DRAFT',
      title: 'แผนการทวนสอบเครื่องมือประจำปี 2026',
      prepared_by: 'qc2',
      prepared_by_name: 'เจ้าหน้าที่ QC'
    };

    const mockReviewPlan = {
      ...mockDraftPlan,
      status: 'PENDING_REVIEW'
    };

    const mockApprovePlan = {
      ...mockDraftPlan,
      status: 'PENDING_APPROVAL',
      reviewed_by: 'qc4',
      reviewed_by_name: 'หัวหน้า QC'
    };

    it('shows [ส่งทบทวนแผน] for DRAFT plan', () => {
      render(
        <AnnualPlanWorkspaceHeader
          statusTab="DRAFT"
          setStatusTab={() => {}}
          activePlan={mockDraftPlan}
          canEditPlan={true}
          onSubmitPlan={() => {}}
          availablePlans={[mockDraftPlan]}
          planItems={[{ id: 'item-1' }]}
        />
      );
      expect(screen.getByRole('button', { name: /ส่งทบทวนแผน/ })).toBeInTheDocument();
    });

    it('shows [ยืนยันการทบทวน] and [ส่งกลับแก้ไข] for PENDING_REVIEW plan', () => {
      render(
        <AnnualPlanWorkspaceHeader
          statusTab="PENDING_REVIEW"
          setStatusTab={() => {}}
          activePlan={mockReviewPlan}
          canEditPlan={false}
          onOpenWorkflowModal={() => {}}
          availablePlans={[mockReviewPlan]}
          planItems={[{ id: 'item-1' }]}
        />
      );
      expect(screen.getByRole('button', { name: /ยืนยันการทบทวน/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /ส่งกลับแก้ไข/ })).toBeInTheDocument();
    });

    it('shows [อนุมัติแผนประจำปี] and [ส่งกลับแก้ไข] for PENDING_APPROVAL plan', () => {
      render(
        <AnnualPlanWorkspaceHeader
          statusTab="PENDING_APPROVAL"
          setStatusTab={() => {}}
          activePlan={mockApprovePlan}
          canEditPlan={false}
          onOpenWorkflowModal={() => {}}
          availablePlans={[mockApprovePlan]}
          planItems={[{ id: 'item-1' }]}
        />
      );
      expect(screen.getByRole('button', { name: /อนุมัติแผนประจำปี/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /ส่งกลับแก้ไข/ })).toBeInTheDocument();
    });
  });
});

