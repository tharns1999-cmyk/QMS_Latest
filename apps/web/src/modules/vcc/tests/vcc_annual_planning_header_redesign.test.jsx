import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AnnualPlanWorkspaceHeader from '../components/AnnualPlanWorkspaceHeader';
import AnnualPlanApprovalChain from '../components/AnnualPlanApprovalChain';

const mockDraftPlan = {
  id: 'plan-2026-qc',
  plan_year: 2026,
  department: 'QC',
  department_name_th: 'ควบคุมคุณภาพ',
  document_code: 'FM-QC-46',
  revision: '01',
  title: '[ข้อมูลทดสอบ] แผนการทวนสอบเครื่องมือประจำปี 2026 (พ.ศ. 2569)',
  status: 'DRAFT',
  due_date_rule: 'END_OF_MONTH',
  prepared_by: null,
  prepared_at: null,
  reviewed_by: null,
  reviewed_at: null,
  approved_by: null,
  approved_at: null
};

const mockItems = [
  { id: '1', asset_id: 'a1', is_group: 0, planned_months: [1, 2] },
  { id: '2', asset_id: 'a2', is_group: 0, planned_months: [3] },
  { id: '3', asset_id: 'a3', is_group: 0, planned_months: [4] },
  { id: '4', asset_id: 'a4', is_group: 0, planned_months: [] }, // unplanned
  { id: '5', asset_id: 'grp-1', is_group: 1, planned_months: [] }, // group with children
  { id: '6', asset_id: 'ch-1', parent_id: 'grp-1', is_group: 0, planned_months: [6] },
  { id: '7', asset_id: 'ch-2', parent_id: 'grp-1', is_group: 0, planned_months: [7] }
];

describe('Annual Planning Header Redesign (FM-QC-46) — Compact 2-Tier Enterprise UI', () => {
  it('1. Tier 1: Displays concise title in h2, inline metadata, status badge, and primary action', () => {
    const onSubmitPlan = vi.fn();
    render(
      <AnnualPlanWorkspaceHeader
        statusTab="DRAFT"
        setStatusTab={() => {}}
        activePlan={mockDraftPlan}
        canEditPlan={true}
        onSubmitPlan={onSubmitPlan}
        plans={[mockDraftPlan]}
        selectedPlanId={mockDraftPlan.id}
        planItems={mockItems}
      />
    );

    // Single concise h2 heading without bulky prefixes
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(/แผนการทวนสอบประจำปี/);

    // Status badge with status label
    expect(screen.getByText(/สถานะ: ร่างแผน/, { selector: 'span' })).toBeInTheDocument();

    // Document code and department metadata tags
    expect(screen.getAllByText(/FM-QC-46 Rev\.01/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/ควบคุมคุณภาพ \(QC\)/)).toBeInTheDocument();
    expect(screen.getByText(/ครบกำหนดวันสิ้นเดือน/)).toBeInTheDocument();

    // Primary action button
    const submitBtn = screen.getByRole('button', { name: /ส่งทบทวนแผน/ });
    expect(submitBtn).toBeInTheDocument();
    fireEvent.click(submitBtn);
    expect(onSubmitPlan).toHaveBeenCalledTimes(1);
  });

  it('2. Tier 1: Plan switcher dropdown, status select, and secondary actions are accessible', () => {
    const onSelectPlan = vi.fn();
    const setStatusTab = vi.fn();
    const onOpenCreatePlan = vi.fn();
    const onOpenHistory = vi.fn();

    render(
      <AnnualPlanWorkspaceHeader
        statusTab="DRAFT"
        setStatusTab={setStatusTab}
        activePlan={mockDraftPlan}
        plans={[mockDraftPlan]}
        selectedPlanId={mockDraftPlan.id}
        onSelectPlan={onSelectPlan}
        onOpenCreatePlan={onOpenCreatePlan}
        onOpenHistory={onOpenHistory}
        planItems={mockItems}
      />
    );

    // Plan switcher select
    const planSelect = screen.getByLabelText('เลือกแผนประจำปี');
    expect(planSelect).toBeInTheDocument();
    expect(planSelect.value).toBe(mockDraftPlan.id);

    // Status filter select
    const statusSelect = screen.getByLabelText('กรองตามสถานะแผน');
    expect(statusSelect).toBeInTheDocument();

    // Secondary action: สร้างแผนใหม่
    const createBtn = screen.getByRole('button', { name: /สร้างแผนใหม่/ });
    expect(createBtn).toBeInTheDocument();
    fireEvent.click(createBtn);
    expect(onOpenCreatePlan).toHaveBeenCalledTimes(1);

    // Overflow menu: ...
    const menuBtn = screen.getByRole('button', { name: 'เมนูเพิ่มเติมของแผน' });
    expect(menuBtn).toBeInTheDocument();
    fireEvent.click(menuBtn);

    const historyItem = screen.getByRole('menuitem', { name: /ประวัติการอนุมัติ/ });
    expect(historyItem).toBeInTheDocument();
    fireEvent.click(historyItem);
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it('3. Tier 2: Displays 4 inline metrics without bulky cards, and resolves instrument de-duplication', () => {
    render(
      <AnnualPlanWorkspaceHeader
        statusTab="DRAFT"
        setStatusTab={() => {}}
        activePlan={mockDraftPlan}
        plans={[mockDraftPlan]}
        planItems={mockItems}
      />
    );

    // 4 inline metrics are present
    expect(screen.getByText(/เครื่องมือในขอบเขต:/)).toBeInTheDocument();
    expect(screen.getByText(/มีแผนแล้ว:/)).toBeInTheDocument();
    expect(screen.getByText(/ยังไม่มีแผน:/)).toBeInTheDocument();
    expect(screen.getByText(/รอบทวนสอบรวม:/)).toBeInTheDocument();

    // De-duplication check:
    // mockItems has 7 array elements (3 standalone + 1 unplanned + 1 group + 2 children)
    // De-duplicated inScopeCount = 4 (standalone) + 2 (children) = 6 instruments!
    const inScopeElement = screen.getByText(/เครื่องมือในขอบเขต:/).parentElement;
    expect(inScopeElement).toHaveTextContent('6');

    // Contextual workflow guidance
    expect(screen.getByText(/ขั้นตอนถัดไป:/)).toBeInTheDocument();
    expect(screen.getByText(/เพิ่มรายการเครื่องมือให้ครบ แล้วส่งทบทวนแผน/)).toBeInTheDocument();
  });

  it('4. Collapsible Approval Chain: Toggles 3-tier approval hierarchy cleanly via ผู้เกี่ยวข้อง', () => {
    render(
      <AnnualPlanWorkspaceHeader
        statusTab="DRAFT"
        setStatusTab={() => {}}
        activePlan={mockDraftPlan}
        thresholds={{ min_requester_level: 1, required_reviewer_level: 4, required_approver_level: 5 }}
        plans={[mockDraftPlan]}
        planItems={mockItems}
      />
    );

    // Drawer is closed initially
    expect(screen.queryByTestId('annual-plan-approval-chain')).toBeNull();

    // Click ผู้เกี่ยวข้อง to toggle drawer open
    const usersBtn = screen.getByRole('button', { name: /ผู้เกี่ยวข้อง/ });
    fireEvent.click(usersBtn);

    expect(screen.getByTestId('annual-plan-approval-chain')).toBeInTheDocument();
    expect(screen.getByText(/ผู้จัดทำ \(L1\+\)/)).toBeInTheDocument();
    expect(screen.getByText(/ผู้ทบทวน \(L4\+\)/)).toBeInTheDocument();
    expect(screen.getByText(/ผู้อนุมัติ \(L5\+\)/)).toBeInTheDocument();

    // Click again to collapse
    fireEvent.click(usersBtn);
    expect(screen.queryByTestId('annual-plan-approval-chain')).toBeNull();
  });

  it('5. Standalone AnnualPlanApprovalChain renders reviewer and approver information when active', () => {
    const reviewedPlan = {
      ...mockDraftPlan,
      status: 'PENDING_APPROVAL',
      prepared_by_name: 'สมชาย ผู้จัดทำ',
      prepared_at: '2026-10-28T04:00:00.000Z',
      reviewed_by_name: 'สมศรี ผู้ทบทวน',
      reviewed_at: '2026-10-28T05:00:00.000Z'
    };

    render(
      <AnnualPlanApprovalChain
        activePlan={reviewedPlan}
        thresholds={{ min_requester_level: 1, required_reviewer_level: 4, required_approver_level: 5 }}
      />
    );

    expect(screen.getByText('สมชาย ผู้จัดทำ')).toBeInTheDocument();
    expect(screen.getByText('สมศรี ผู้ทบทวน')).toBeInTheDocument();
    expect(screen.getByText('รอการอนุมัติ')).toBeInTheDocument();
  });
});
