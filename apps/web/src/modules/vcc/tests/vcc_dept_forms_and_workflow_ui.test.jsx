import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import useStore from '../../../store/useStore';
import { AnnualPlanWorkspaceHeader } from '../components/AnnualPlanWorkspaceHeader';
import { AnnualPlanApprovalChain } from '../components/AnnualPlanApprovalChain';
import { AnnualPlanEquipmentListView } from '../components/AnnualPlanEquipmentListView';
import { PlanFormModal, PlanSubmitModal } from '../components/AnnualPlanModals';

describe('VCC Phase 1 Step 4: QC/LAB Department Forms & Workflow UI', () => {
  beforeEach(() => {
    useStore.setState({
      currentUser: {
        id: 'qc-prep-01',
        name: 'QC Preparer (L4)',
        role: 'STAFF',
        department: 'QC',
        approval_level: 4,
        approvalLevel: 4,
        isDcc: false,
        isQmr: false
      },
      masterUsers: [
        { id: 'qc-prep-01', name: 'QC Preparer (L4)', department: 'QC', approval_level: 4, status: 'ACTIVE' },
        { id: 'pd-rev-01', name: 'PD Reviewer (L5)', department: 'PD', approval_level: 5, status: 'ACTIVE' },
        { id: 'lb-rev-01', name: 'LAB Reviewer (L5)', department: 'LB', approval_level: 5, status: 'ACTIVE' },
        { id: 'mgt-app-01', name: 'MGT Approver (L6)', department: 'MGT', approval_level: 6, status: 'ACTIVE' }
      ],
      masterDepartments: [
        { code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' },
        { code: 'LB', name_th: 'ห้องปฏิบัติการจุลชีววิทยา', status: 'ACTIVE' },
        { code: 'PD', name_th: 'ฝ่ายผลิต', status: 'ACTIVE' },
        { code: 'MGT', name_th: 'ฝ่ายบริหาร', status: 'ACTIVE' }
      ]
    });
  });

  it('1. displays FM-QC-46 Rev.01 document profile, form issue date, and assigned signatories for QC plan', () => {
    const qcPlan = {
      id: 'plan-qc-2026',
      plan_year: 2026,
      department: 'QC',
      department_name_th: 'ควบคุมคุณภาพ',
      document_code: 'FM-QC-46',
      revision: '01',
      form_issue_date: '2026-06-09',
      title: 'แผนการทวนสอบเครื่องมือประจำปี 2026',
      status: 'PENDING_REVIEW',
      due_date_rule: 'END_OF_MONTH',
      prepared_by_name: 'QC Preparer (L4)',
      prepared_at: '2026-01-15T08:00:00.000Z',
      assigned_reviewer_name: 'PD Reviewer (L5)',
      assigned_approver_name: 'MGT Approver (L6)'
    };

    render(
      <AnnualPlanWorkspaceHeader
        activePlan={qcPlan}
        plans={[qcPlan]}
        selectedPlanId={qcPlan.id}
        statusTab="PENDING_REVIEW"
      />
    );

    // Verify paperless revision badge
    expect(screen.getByText('Rev.01')).toBeInTheDocument();
    // Verify form issue date
    expect(screen.getByText(/ประกาศใช้: 2026-06-09/i)).toBeInTheDocument();
    // Verify reviewer in metadata
    expect(screen.getAllByText(/ผู้ทบทวน: PD Reviewer \(L5\)/i).length).toBeGreaterThan(0);
  });

  it('2. displays FM-LB-11 Rev.02 document profile and approval chain for LAB plan', () => {
    const lbPlan = {
      id: 'plan-lb-2026',
      plan_year: 2026,
      department: 'LB',
      department_name_th: 'ห้องปฏิบัติการจุลชีววิทยา',
      document_code: 'FM-LB-11',
      revision: '02',
      form_issue_date: '2026-08-10',
      title: 'แผนการสอบเทียบเครื่องมือที่ใช้ในห้องปฏิบัติการจุลชีววิทยา ประจำปี 2026',
      status: 'PENDING_APPROVAL',
      due_date_rule: 'END_OF_MONTH',
      prepared_by_name: 'LAB Preparer (L4)',
      prepared_at: '2026-01-15T08:00:00.000Z',
      reviewed_by_name: 'LAB Reviewer (L5)',
      reviewed_at: '2026-01-16T09:00:00.000Z',
      assigned_approver_name: 'MGT Approver (L6)'
    };

    render(<AnnualPlanApprovalChain activePlan={lbPlan} />);

    // Verify approval chain roles
    expect(screen.getByText(/ผู้จัดทำ \(L4\+ · แผนก LB\)/i)).toBeInTheDocument();
    expect(screen.getByText(/ผู้ทบทวน \(LB L5\)/i)).toBeInTheDocument();
    expect(screen.getByText(/ผู้อนุมัติ \(MGT L6\+\)/i)).toBeInTheDocument();
    expect(screen.getByText('LAB Preparer (L4)')).toBeInTheDocument();
    expect(screen.getByText('LAB Reviewer (L5)')).toBeInTheDocument();
  });

  it('3. renders "เปิดดูเอกสาร PDF ทางการ" button when active plan is APPROVED', () => {
    const approvedPlan = {
      id: 'plan-qc-2026-app',
      plan_year: 2026,
      department: 'QC',
      document_code: 'FM-QC-46',
      revision: '01',
      status: 'APPROVED',
      approved_by_name: 'MGT Approver (L6)',
      approved_at: '2026-01-18T10:00:00.000Z',
      pdf_file_key: 'vcc/plans/2026/QC/official_FM-QC-46_R01.pdf'
    };

    const handleOpenPdf = vi.fn();

    render(
      <AnnualPlanWorkspaceHeader
        activePlan={approvedPlan}
        plans={[approvedPlan]}
        selectedPlanId={approvedPlan.id}
        statusTab="APPROVED"
        onOpenOfficialPdf={handleOpenPdf}
      />
    );

    const pdfBtn = screen.getByRole('button', { name: /เปิดดูเอกสาร PDF ทางการ/i });
    expect(pdfBtn).toBeInTheDocument();
    fireEvent.click(pdfBtn);
    expect(handleOpenPdf).toHaveBeenCalledTimes(1);
  });

  it('4. displays department-specific fields: brand, mpe, calibration points, and acceptance criteria in equipment list', () => {
    const testItems = [
      {
        id: 'item-01',
        asset_id: 'asset-cal-01',
        asset_code: 'CAL-QC-001',
        asset_name: 'Digital Vernier Caliper',
        brand: 'Mitutoyo',
        mpe: '±0.02 mm',
        calibration_points: '0, 50, 100, 150 mm',
        acceptance_criteria: 'Error ≤ MPE',
        planned_months: [3, 9],
        provider_name: 'ห้องปฏิบัติการภายนอก',
        responsible_dept: 'QC',
        asset_type: 'เวอร์เนียร์คาลิปเปอร์'
      }
    ];

    render(
      <AnnualPlanEquipmentListView
        planItems={testItems}
        activePlan={{ plan_year: 2026, due_date_rule: 'END_OF_MONTH' }}
      />
    );

    expect(screen.getByText(/CAL-QC-001/i)).toBeInTheDocument();
    expect(screen.getByText(/Digital Vernier Caliper/i)).toBeInTheDocument();
    expect(screen.getByText(/\(Mitutoyo\)/i)).toBeInTheDocument();
    expect(screen.getByText(/MPE: ±0.02 mm/i)).toBeInTheDocument();
    expect(screen.getByText(/จุดวัด: 0, 50, 100, 150 mm/i)).toBeInTheDocument();
    expect(screen.getByText(/เกณฑ์: Error ≤ MPE/i)).toBeInTheDocument();
  });

  it('5. PlanFormModal auto-populates paperless electronic defaults when selecting department', () => {
    let currentForm = { plan_year: 2026, department: '', document_code: '', revision: '', title: '' };
    const setForm = (updater) => {
      currentForm = typeof updater === 'function' ? updater(currentForm) : updater;
    };

    render(
      <PlanFormModal
        open={true}
        onClose={vi.fn()}
        form={currentForm}
        setForm={setForm}
        onSubmit={vi.fn()}
        activeDepartments={[
          { code: 'QC', nameTh: 'ควบคุมคุณภาพ' },
          { code: 'LB', nameTh: 'ห้องปฏิบัติการจุลชีววิทยา' }
        ]}
      />
    );

    // Simulate choosing QC
    const deptSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(deptSelect, { target: { value: 'QC' } });

    expect(currentForm.department).toBe('QC');
    expect(currentForm.document_code).toBe('FM-QC-46');
    expect(currentForm.revision).toBe('01');
    expect(currentForm.title).toContain('แผนการทวนสอบเครื่องมือประจำปี');

    // Simulate choosing LB
    fireEvent.change(deptSelect, { target: { value: 'LB' } });
    expect(currentForm.department).toBe('LB');
    expect(currentForm.document_code).toBe('FM-LB-11');
    expect(currentForm.revision).toBe('01');
    expect(currentForm.title).toContain('แผนการสอบเทียบเครื่องมือ');
  });

  it('6. PlanSubmitModal includes assigned PD reviewer for QC plan submission', () => {
    const qcPlan = {
      id: 'plan-qc-test',
      department: 'QC',
      title: 'แผนทดสอบ',
      document_code: 'FM-QC-46',
      revision: '01',
      status: 'DRAFT',
      assigned_reviewer_id: 'pd-rev-01'
    };

    render(
      <PlanSubmitModal
        open={true}
        onClose={vi.fn()}
        plan={qcPlan}
        masterUsers={[
          { id: 'qc-prep-01', name: 'QC Preparer (L4)', department: 'QC', approval_level: 4, status: 'ACTIVE' },
          { id: 'pd-rev-01', name: 'PD Reviewer (L5)', department: 'PD', approval_level: 5, status: 'ACTIVE' },
          { id: 'mgt-app-01', name: 'MGT Approver (L6)', department: 'MGT', approval_level: 6, status: 'ACTIVE' }
        ]}
        thresholds={{ required_reviewer_level: 4, required_approver_level: 5 }}
        currentUser={{ id: 'qc-prep-01', approval_level: 4 }}
        onSubmit={vi.fn()}
      />
    );

    const reviewerSelect = screen.getByLabelText(/เลือกผู้ทบทวนแผน/i);
    expect(reviewerSelect).toBeInTheDocument();
    // Must contain PD Reviewer (L5)
    expect(screen.getByText(/PD Reviewer \(L5\)/i)).toBeInTheDocument();
  });
});
