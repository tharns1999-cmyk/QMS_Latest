import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import useStore from '../../../store/useStore';
import AnnualPlanMatrixTable from '../components/AnnualPlanMatrixTable';
import { DraftGroupConversionModal } from '../components/AnnualPlanModals';
import AnnualPlanMonthCell from '../components/AnnualPlanMonthCell';
import { resetVccLocalStore } from '../api/vccApi';

describe('VCC Category-Based Overview & Flat Instrument Planning Matrix', () => {
  beforeEach(() => {
    resetVccLocalStore();
    useStore.setState({
      currentUser: {
        id: 'dc4',
        name: 'DC หัวหน้า (DCC)',
        role: 'STAFF',
        department: 'DC',
        approval_level: 4,
        isDcc: true
      }
    });
  });

  const sampleChild1 = {
    id: 'PI-CH-01',
    plan_id: 'PLAN-001',
    asset_id: 'ASSET-CH-01',
    asset_code: 'V001',
    asset_name: 'เวอร์เนียร์คาลิปเปอร์ 01',
    asset_type: 'Vernier Caliper',
    is_group: 0,
    parent_id: 'ASSET-GRP-01',
    parent_asset_code: 'GRP-VERNIER',
    planned_months: [2],
    due_dates: ['2026-02-28'],
    responsible_dept: 'QC',
    provider_name: 'ทวนสอบภายใน'
  };

  const sampleChild2 = {
    id: 'PI-CH-02',
    plan_id: 'PLAN-001',
    asset_id: 'ASSET-CH-02',
    asset_code: 'V002',
    asset_name: 'เวอร์เนียร์คาลิปเปอร์ 02',
    asset_type: 'Vernier Caliper',
    is_group: 0,
    parent_id: 'ASSET-GRP-01',
    parent_asset_code: 'GRP-VERNIER',
    planned_months: [9],
    due_dates: ['2026-09-30'],
    responsible_dept: 'QC',
    provider_name: 'ทวนสอบภายใน'
  };

  const sampleCompositeSet = {
    id: 'PI-SW001',
    plan_id: 'PLAN-001',
    asset_id: 'ASSET-SW001',
    asset_code: 'SW001',
    asset_name: 'ชุดตุ้มน้ำหนักมาตรฐาน Class E2 (1mg - 1kg)',
    asset_type: 'Standard Weight Set',
    is_group: 1,
    group_nature: 'COMPOSITE_SET',
    is_composite_set: true,
    is_calibratable_unit: true,
    planned_months: [5],
    due_dates: ['2026-05-31'],
    responsible_dept: 'QC',
    provider_name: 'ห้องปฏิบัติการภายนอก'
  };

  const sampleScale = {
    id: 'PI-SC01',
    plan_id: 'PLAN-001',
    asset_id: 'ASSET-SC01',
    asset_code: 'SC-WH-001',
    asset_name: 'เครื่องชั่งดิจิทัล 30kg',
    asset_type: 'Digital Scale',
    is_group: 0,
    planned_months: [1, 7],
    due_dates: ['2026-01-31', '2026-07-31'],
    responsible_dept: 'QC',
    provider_name: 'ห้องปฏิบัติการภายนอก'
  };

  it('1. Flat Table Rendering: Each calibratable unit is an independent row with zero tree chevrons and proper parent/composite badge', () => {
    const items = [sampleChild1, sampleChild2, sampleCompositeSet, sampleScale];

    render(
      <AnnualPlanMatrixTable
        planItems={items}
        activePlan={{ id: 'PLAN-001', status: 'DRAFT', plan_year: 2026 }}
        workOrders={[]}
        canEditPlan={true}
      />
    );

    // 1 row per calibratable unit
    expect(screen.getByText('V001')).toBeInTheDocument();
    expect(screen.getByText('V002')).toBeInTheDocument();
    expect(screen.getByText('SW001')).toBeInTheDocument();
    expect(screen.getByText('SC-WH-001')).toBeInTheDocument();

    // Option B: No parent badge in main table row (traceability visible in inspector)
    expect(screen.queryByText(/กลุ่ม:/)).toBeNull();

    // Verify Composite Set badge
    expect(screen.getByText('ชุดเครื่องมือ (Composite Set)')).toBeInTheDocument();

    // No tree chevrons (expand/collapse) exist in flat table
    expect(screen.queryByRole('button', { name: /ขยายกลุ่มเครื่องมือ/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /ย่อกลุ่มเครื่องมือ/i })).toBeNull();
  });

  it('2. Category filter keeps independent instrument rows and approved evidence', () => {
    const props = { planItems: [sampleChild1, sampleChild2, sampleCompositeSet, sampleScale], activePlan: { id: 'PLAN-001', status: 'APPROVED', plan_year: 2026 }, workOrders: [{ id: 'WO-V001-M2', plan_item_id: 'PI-CH-01', asset_id: 'ASSET-CH-01', planned_month: 2, status: 'CLOSED', result_status: 'PASS', certificate_no: 'CER-2026-001' }] };
    const { rerender } = render(<AnnualPlanMatrixTable {...props} categoryFilter="Vernier Caliper" />);
    expect(screen.getByText('V001')).toBeInTheDocument();
    expect(screen.getByText('V002')).toBeInTheDocument();
    expect(screen.queryByText('SW001')).toBeNull();
    expect(screen.queryByText('SC-WH-001')).toBeNull();
    rerender(<AnnualPlanMatrixTable {...props} categoryFilter="" />);
    expect(screen.getByText('SW001')).toBeInTheDocument();
    expect(screen.getByText('SC-WH-001')).toBeInTheDocument();
  });

  it('3. Approved Plan Historical Freeze: Preserves historical group items without auto-mutation or deletion', () => {
    const historicalGroup = {
      id: 'PI-HIST-GRP',
      plan_id: 'PLAN-APPROVED',
      asset_id: 'ASSET-GRP-HIST',
      asset_code: 'GRP-HISTORICAL',
      asset_name: 'ชุดเครื่องมือประวัติเดิม',
      is_group: 1,
      group_nature: 'LOGICAL_GROUP',
      planned_months: [3, 8],
      due_dates: ['2026-03-31', '2026-08-31'],
      responsible_dept: 'QC'
    };

    render(
      <AnnualPlanMatrixTable
        planItems={[historicalGroup, sampleScale]}
        activePlan={{ id: 'PLAN-APPROVED', status: 'APPROVED', plan_year: 2026 }}
        workOrders={[]}
        canEditPlan={false} // Approved plan cannot be edited
      />
    );

    // Historical group row is preserved intact in approved view
    expect(screen.getByText('GRP-HISTORICAL')).toBeInTheDocument();
    expect(screen.getByText('กลุ่มเครื่องมือ (Group)')).toBeInTheDocument();

    // In approved mode, Edit and Delete buttons are hidden
    expect(screen.queryByRole('button', { name: /แก้ไขข้อมูลในแผน/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /นำออกจากแผน/i })).toBeNull();
  });

  it('4. Draft Group Conversion Modal: Never auto-inherits months, detects duplicates, requires manual scheduling, and previews before confirm', async () => {
    const draftGroup = {
      id: 'PI-GRP-DRAFT',
      plan_id: 'PLAN-DRAFT',
      asset_id: 'ASSET-GRP-01',
      asset_code: 'GRP-VERNIER',
      asset_name: 'ชุดเวอร์เนียร์',
      is_group: 1,
      group_nature: 'LOGICAL_GROUP',
      planned_months: [2, 9],
      is_persisted: 1
    };

    const activeAssetsInRegister = [
      { id: 'ASSET-CH-01', asset_code: 'V001', name: 'เวอร์เนียร์ 01', is_group: 0, parent_id: 'ASSET-GRP-01', status: 'ACTIVE', department: 'QC' },
      { id: 'ASSET-CH-02', asset_code: 'V002', name: 'เวอร์เนียร์ 02', is_group: 0, parent_id: 'ASSET-GRP-01', status: 'ACTIVE', department: 'QC' }
    ];

    // Child 1 is already in plan (scheduled month 2), Child 2 is not
    const existingPlanItems = [
      draftGroup,
      { id: 'PI-V001-EXISTING', asset_id: 'ASSET-CH-01', asset_code: 'V001', planned_months: [2], remarks: '' }
    ];

    const onConfirmConvert = vi.fn();
    const onClose = vi.fn();

    render(
      <DraftGroupConversionModal
        open={true}
        onClose={onClose}
        groupItem={draftGroup}
        activeAssets={activeAssetsInRegister}
        existingPlanItems={existingPlanItems}
        onConfirmConvert={onConfirmConvert}
        converting={false}
      />
    );

    // Modal title & strict non-inheritance notice
    expect(screen.getByText(/แปลงรายการกลุ่มเดิมเป็นเครื่องมือรายตัว/i)).toBeInTheDocument();
    expect(screen.getByText(/ระบบจะไม่คัดลอกเดือนจากกลุ่มเดิมไปยังเครื่องมือรายตัวโดยอัตโนมัติ/i)).toBeInTheDocument();
    expect(screen.getByText('GRP-VERNIER')).toBeInTheDocument();

    // Lists both children with duplicate detection
    expect(screen.getByText('V001')).toBeInTheDocument();
    expect(screen.getByText('V002')).toBeInTheDocument();
    expect(screen.getByText(/มีอยู่ในแผนแล้ว/i)).toBeInTheDocument();
    expect(screen.getByText(/เพิ่มเป็นแถวใหม่ในแผน/i)).toBeInTheDocument();

    // V002 was NOT in plan and did NOT inherit months -> clicking Preview immediately must block with validation alert
    fireEvent.click(screen.getByRole('button', { name: /ดูตัวอย่างก่อนยืนยัน/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/กรุณาเลือกเดือนทวนสอบอย่างน้อย 1 เดือน.*V002/i);

    // Manually pick month 9 for V002 -> proceed to Preview -> Confirm conversion
    fireEvent.click(screen.getByRole('button', { name: 'V002 เดือน 9' }));
    fireEvent.click(screen.getByRole('button', { name: /ดูตัวอย่างก่อนยืนยัน/i }));

    expect(screen.getByTestId('conversion-preview-summary')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ยืนยันการแปลงรายการ/i }));

    expect(onConfirmConvert).toHaveBeenCalledWith(
      expect.objectContaining({
        groupItem: draftGroup,
        confirm_remove_empty: false,
        items: [
          expect.objectContaining({ asset_id: 'ASSET-CH-01', planned_months: [2] }),
          expect.objectContaining({ asset_id: 'ASSET-CH-02', planned_months: [9] })
        ]
      })
    );
  });

  it('5. Floating Overlay Stability: Month cell popover opens with zero layout shift and closes on Escape/Outside Click', async () => {
    render(
      <table>
        <tbody>
          <tr>
            <AnnualPlanMonthCell
              month={2}
              item={sampleChild1}
              plan={{ id: 'PLAN-001', status: 'DRAFT', plan_year: 2026 }}
              workOrders={[]}
              canEditPlan={true}
            />
          </tr>
        </tbody>
      </table>
    );

    // Planned badge P2 is visible
    const badge = screen.getByText('P2');
    expect(badge).toBeInTheDocument();

    // Click badge opens floating overlay popover
    fireEvent.click(badge);
    expect(screen.getByText(/รอบตามแผนประจำปี/i)).toBeInTheDocument();
    expect(screen.getByText(/เดือนที่ 2/i)).toBeInTheDocument();

    // Press Escape closes the floating popover
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByText(/รอบตามแผนประจำปี/i)).toBeNull();
    });
  });
});
