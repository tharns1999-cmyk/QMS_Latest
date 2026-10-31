import React, { act } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import useStore from '../../../store/useStore';
import { resetVccLocalStore } from '../api/vccApi';
import PortalLandingPage from '../../portal/pages/PortalLandingPage';
import ProtectedRoute from '../../../app/auth/ProtectedRoute';
import AnnualPlanWorkspaceHeader from '../components/AnnualPlanWorkspaceHeader';
import TaskInbox from '../../dcc/pages/Tasks/TaskInbox';
import { isActionableTask, userMatchesDepartment } from '../../dcc/utils/taskFilter';

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

    it('does NOT show Review/Approve/Reject buttons on AnnualPlanWorkspaceHeader for PENDING_REVIEW or PENDING_APPROVAL', () => {
      const { rerender } = render(
        <AnnualPlanWorkspaceHeader
          statusTab="PENDING_REVIEW"
          setStatusTab={() => {}}
          activePlan={mockReviewPlan}
          canEditPlan={false}
          availablePlans={[mockReviewPlan]}
          planItems={[{ id: 'item-1' }]}
        />
      );
      expect(screen.queryByRole('button', { name: /ยืนยันการทบทวน/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /ส่งกลับแก้ไข/ })).toBeNull();

      rerender(
        <AnnualPlanWorkspaceHeader
          statusTab="PENDING_APPROVAL"
          setStatusTab={() => {}}
          activePlan={mockApprovePlan}
          canEditPlan={false}
          availablePlans={[mockApprovePlan]}
          planItems={[{ id: 'item-1' }]}
        />
      );
      expect(screen.queryByRole('button', { name: /อนุมัติแผน/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /ส่งกลับแก้ไข/ })).toBeNull();
    });

    it('shows [ส่งทบทวนอีกครั้ง] and full return reason banner for REJECTED plan', () => {
      const mockRejectedPlan = {
        ...mockDraftPlan,
        status: 'REJECTED',
        rejected_reason: 'กรุณาปรับรอบสอบเทียบเครื่องชั่งเป็นทุก 6 เดือน'
      };
      render(
        <AnnualPlanWorkspaceHeader
          statusTab="REJECTED"
          setStatusTab={() => {}}
          activePlan={mockRejectedPlan}
          canEditPlan={true}
          onSubmitPlan={() => {}}
          availablePlans={[mockRejectedPlan]}
          planItems={[{ id: 'item-1' }]}
        />
      );
      expect(screen.getByRole('button', { name: /ส่งทบทวนอีกครั้ง/ })).toBeInTheDocument();
      expect(screen.getByTestId('plan-rejected-reason-banner')).toHaveTextContent(
        /กรุณาปรับรอบสอบเทียบเครื่องชั่งเป็นทุก 6 เดือน/
      );
    });
  });

  describe('4. TaskInbox Integration & Multi-Department Routing', () => {
    const creatorUser = {
      id: 'qc-creator-l4',
      name: 'QC Staff L4',
      department: 'QC',
      primary_department: 'QC',
      departments: ['QC'],
      approval_level: 4,
      isDcc: false
    };

    const multiDeptReviewer = {
      id: 'pd-qc-reviewer-l5',
      name: 'PD/QC Supervisor L5',
      department: 'PD',
      primary_department: 'PD',
      departments: ['PD', 'QC'],
      approval_level: 5,
      isDcc: false
    };

    const singleDeptUser = {
      id: 'pd-only-l5',
      name: 'PD Only Supervisor L5',
      department: 'PD',
      primary_department: 'PD',
      departments: ['PD'],
      approval_level: 5,
      isDcc: false
    };

    const approverUser = {
      id: 'qc-hod-l5',
      name: 'QC Head of Dept L5',
      department: 'QC',
      primary_department: 'QC',
      departments: ['QC'],
      approval_level: 5,
      isDcc: false
    };

    it('correctly matches multi-department affiliation from departments JSON array', () => {
      expect(userMatchesDepartment(multiDeptReviewer, 'QC')).toBe(true);
      expect(userMatchesDepartment(multiDeptReviewer, 'PD')).toBe(true);
      expect(userMatchesDepartment(multiDeptReviewer, 'QA')).toBe(false);

      expect(userMatchesDepartment(singleDeptUser, 'QC')).toBe(false);
      expect(userMatchesDepartment(singleDeptUser, 'PD')).toBe(true);
    });

    it('evaluates actionable tasks for multi-dept reviewers and strictly enforces SoD', () => {
      const vccReviewTask = {
        id: 'api-vcc-plan-plan-qc-2026-review',
        planId: 'plan-qc-2026',
        referenceId: 'plan-qc-2026',
        referenceType: 'VCC_PLAN',
        docCode: 'FM-QC-46',
        document_code: 'FM-QC-46',
        docTitle: 'แผนการทวนสอบเครื่องมือประจำปี 2026',
        docName: 'แผนการทวนสอบเครื่องมือประจำปี 2026',
        title: '[แผนทวนสอบ VCC ทบทวน] แผนการทวนสอบเครื่องมือประจำปี 2026 (FM-QC-46 Rev.00)',
        type: 'Review',
        taskType: 'VCC_PLAN_REVIEW',
        task_type: 'VCC_PLAN_REVIEW',
        category: 'REVIEW',
        department: 'QC',
        target_department: 'QC',
        owner_dept: 'QC',
        required_approval_level: 4,
        requesterId: 'qc-creator-l4',
        prepared_by: 'qc-creator-l4',
        status: 'PENDING',
        statusTab: 'PENDING_REVIEW',
        createdAt: '2026-10-29T10:00:00.000Z'
      };

      // 1. Creator cannot review their own plan (SoD)
      expect(isActionableTask(vccReviewTask, creatorUser)).toBe(false);

      // 2. PD-Only user cannot review QC plan (Department boundary)
      expect(isActionableTask(vccReviewTask, singleDeptUser)).toBe(false);

      // 3. Multi-department user (PD primary, QC affiliated, L5) CAN review QC plan
      expect(isActionableTask(vccReviewTask, multiDeptReviewer)).toBe(true);

      // Now create approval task where multiDeptReviewer was the reviewer
      const vccApproveTask = {
        ...vccReviewTask,
        id: 'api-vcc-plan-plan-qc-2026-approve',
        type: 'Approve',
        taskType: 'VCC_PLAN_APPROVE',
        task_type: 'VCC_PLAN_APPROVE',
        category: 'APPROVE',
        required_approval_level: 5,
        reviewerId: 'pd-qc-reviewer-l5',
        statusTab: 'PENDING_APPROVAL'
      };

      // 4. Creator cannot approve own plan (SoD)
      expect(isActionableTask(vccApproveTask, creatorUser)).toBe(false);

      // 5. Reviewer cannot approve plan they reviewed (SoD)
      expect(isActionableTask(vccApproveTask, multiDeptReviewer)).toBe(false);

      // 6. Independent QC HOD (L5) can approve
      expect(isActionableTask(vccApproveTask, approverUser)).toBe(true);
    });

    it('displays VCC review task in TaskInbox for multi-dept reviewer and filters out for PD-only', async () => {
      // Seed a pending review plan in local store so syncVccTasks generates it
      localStorage.setItem(
        'qms-vcc-local-plans-v1',
        JSON.stringify([
          {
            id: 'plan-qc-2026',
            plan_year: 2026,
            department: 'QC',
            document_code: 'FM-QC-46',
            revision: '00',
            title: 'แผนการทวนสอบเครื่องมือประจำปี 2026',
            status: 'PENDING_REVIEW',
            prepared_by: 'qc-creator-l4',
            created_at: '2026-10-29T10:00:00.000Z'
          }
        ])
      );

      // Mount for Multi-Dept Reviewer
      useStore.setState({
        currentUser: multiDeptReviewer,
        tasks: []
      });

      let renderResult;
      await act(async () => {
        renderResult = render(
          <MemoryRouter>
            <TaskInbox />
          </MemoryRouter>
        );
      });

      // Should show task and badge
      expect(screen.getByText(/FM-QC-46/)).toBeInTheDocument();
      expect(screen.getByText('ทบทวนแผนสอบเทียบประจำปี (VCC)')).toBeInTheDocument();
      renderResult.unmount();

      // Mount for PD-Only User
      useStore.setState({
        currentUser: singleDeptUser,
        tasks: []
      });

      await act(async () => {
        render(
          <MemoryRouter>
            <TaskInbox />
          </MemoryRouter>
        );
      });

      // Should NOT show the QC task
      expect(screen.queryByText('ทบทวนแผนสอบเทียบประจำปี (VCC)')).not.toBeInTheDocument();
    });
  });
});

