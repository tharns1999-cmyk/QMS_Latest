import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import useStore from '../../../store/useStore';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import AnnualPlanMatrixTable from '../components/AnnualPlanMatrixTable';
import AnnualPlanMonthCell from '../components/AnnualPlanMonthCell';
import { UnplannedJustificationModal } from '../components/AnnualPlanModals';
import { resetVccLocalStore } from '../api/vccApi';

const openPlanPage = async () => {
  render(<AssetRegisterPage />);
  fireEvent.click(await screen.findByRole('button', { name: /แผนการทวนสอบประจำปี \(FM-QC-46\)/i }));
  await screen.findByText('V001');
};

describe('VCC FM-QC-46 Registry-Driven Annual Planning Board', () => {
  beforeEach(() => {
    resetVccLocalStore();
    useStore.setState({
      currentUser: {
        id: 'dc4',
        name: 'DC หัวหน้า (DCC)',
        email: 'dc4@qms.local',
        role: 'STAFF',
        department: 'DC',
        position: 'Document Control Supervisor',
        approval_level: 4,
        approvalLevel: 4,
        isDcc: true,
        isQmr: false
      },
      masterDepartments: [
        { code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' },
        { code: 'WH', name_th: 'คลังสินค้า', status: 'ACTIVE' }
      ],
      approvalMatrix: [
        {
          docType: 'FM',
          minRequesterLevel: 1,
          requiredReviewerLevel: 4,
          requiredApproverLevel: 5
        }
      ]
    });
  });

  it('1. ดึงเครื่องมือที่มีสิทธิ์จากทะเบียนเข้าสู่กระดานแผนประจำปีโดยอัตโนมัติ (Registry-driven) โดยไม่ต้องกดเพิ่มทีละตัว', async () => {
    await openPlanPage();

    // Active QC instruments from register appear directly
    expect(screen.getByText('V001')).toBeInTheDocument();
    expect(screen.getByText('V002')).toBeInTheDocument();
    expect(screen.getByText('ST002')).toBeInTheDocument();

    // RETIRED asset (T-OLD-01) must NOT be loaded into the draft plan
    expect(screen.queryByText('T-OLD-01')).not.toBeInTheDocument();
  });

  it('2. แสดง Summary Metrics ครบถ้วน (ขอบเขต, มีแผนแล้ว, ยังไม่มีแผน, รอบรวม)', async () => {
    await openPlanPage();

    // Summary cards exist in workspace header
    expect(screen.getAllByText(/เครื่องมือในขอบเขต/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/มีแผนแล้ว/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/ยังไม่มีแผน/i)).toBeInTheDocument();
    expect(screen.getByText(/รอบทวนสอบรวม/i)).toBeInTheDocument();
  });

  it('3. การแสดงผลแบบ Flat Table และการกรองตาม Category (Flat Instrument Planning & Category Filter) ใน AnnualPlanMatrixTable', () => {
    const parentGroup = {
      id: 'GRP-01',
      asset_id: 'ASSET-GRP-01',
      asset_code: 'GRP-SCALE',
      asset_name: 'ชุดเครื่องชั่งประจำไลน์',
      asset_type: 'เครื่องชั่ง',
      is_group: 1,
      group_nature: 'LOGICAL_GROUP',
      planned_months: [1, 2],
      due_dates: ['2026-01-31', '2026-02-28']
    };
    const child1 = {
      id: 'CH-01',
      asset_id: 'ASSET-CH-01',
      asset_code: 'SCALE-01',
      asset_name: 'เครื่องชั่ง 1',
      asset_type: 'เครื่องชั่ง',
      is_group: 0,
      parent_id: 'ASSET-GRP-01',
      parent_asset_code: 'GRP-SCALE',
      planned_months: [],
      due_dates: []
    };
    const child2 = {
      id: 'CH-02',
      asset_id: 'ASSET-CH-02',
      asset_code: 'SCALE-02',
      asset_name: 'เครื่องชั่ง 2',
      asset_type: 'เครื่องชั่ง',
      is_group: 0,
      parent_id: 'ASSET-GRP-01',
      parent_asset_code: 'GRP-SCALE',
      planned_months: [],
      due_dates: []
    };
    const thermometer = {
      id: 'TH-01',
      asset_id: 'ASSET-TH-01',
      asset_code: 'TH-001',
      asset_name: 'เทอร์โมมิเตอร์ห้องเย็น',
      asset_type: 'เทอร์โมมิเตอร์',
      is_group: 0,
      planned_months: [4],
      due_dates: ['2026-04-30']
    };

    const { rerender } = render(
      <AnnualPlanMatrixTable
        planItems={[parentGroup, child1, child2, thermometer]}
        activePlan={{ id: 'PLAN-01', status: 'DRAFT', plan_year: 2026 }}
        workOrders={[]}
        canEditPlan={true}
      />
    );

    // All instruments are visible in a flat structure without nested tree chevrons
    expect(screen.getAllByText('GRP-SCALE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SCALE-01').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SCALE-02').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TH-001').length).toBeGreaterThan(0);

    // Option B: Flat matrix does not clutter rows with parent group badges
    expect(screen.queryByText(/กลุ่ม:/)).toBeNull();

    // When category filter is set to "เครื่องชั่ง", only scales appear
    rerender(
      <AnnualPlanMatrixTable
        planItems={[parentGroup, child1, child2, thermometer]}
        activePlan={{ id: 'PLAN-01', status: 'DRAFT', plan_year: 2026 }}
        workOrders={[]}
        canEditPlan={true}
        categoryFilter="เครื่องชั่ง"
      />
    );
    expect(screen.getAllByText('SCALE-01').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SCALE-02').length).toBeGreaterThan(0);
    expect(screen.queryByText('TH-001')).not.toBeInTheDocument();

    // When category filter is set to "เทอร์โมมิเตอร์", only thermometer appears
    rerender(
      <AnnualPlanMatrixTable
        planItems={[parentGroup, child1, child2, thermometer]}
        activePlan={{ id: 'PLAN-01', status: 'DRAFT', plan_year: 2026 }}
        workOrders={[]}
        canEditPlan={true}
        categoryFilter="เทอร์โมมิเตอร์"
      />
    );
    expect(screen.getByText('TH-001')).toBeInTheDocument();
    expect(screen.queryByText('SCALE-01')).not.toBeInTheDocument();
    expect(screen.queryByText('SCALE-02')).not.toBeInTheDocument();
  });

  it('4. ช่องเดือนที่ยังไม่มีแผน คลิกตรงเพื่อเพิ่มรอบเดือนได้ทันที (Direct Month Interaction)', async () => {
    const onQuickAddMonth = vi.fn();
    const item = {
      id: 'ITEM-01',
      asset_id: 'ASSET-01',
      asset_code: 'EQ-01',
      asset_name: 'เครื่องวัด',
      is_group: 0,
      planned_months: [],
      due_dates: []
    };

    render(
      <table>
        <tbody>
          <tr>
            <AnnualPlanMonthCell
              month={5}
              item={item}
              plan={{ id: 'PLAN-01', status: 'DRAFT', plan_year: 2026 }}
              workOrders={[]}
              canEditPlan={true}
              onQuickAddMonth={onQuickAddMonth}
            />
          </tr>
        </tbody>
      </table>
    );

    // Empty cell button has aria-label
    const targetCellBtn = screen.getByRole('button', { name: /กำหนดเป้าหมายเดือน 5/i });
    expect(targetCellBtn).toBeInTheDocument();

    // Clicking schedules month directly
    fireEvent.click(targetCellBtn);
    expect(onQuickAddMonth).toHaveBeenCalledWith(item, 5);
  });

  it('5. กล่องระบุเหตุผลเครื่องมือที่ยังไม่ได้วางแผน (UnplannedJustificationModal)', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const unplannedItems = [
      { id: 'I1', asset_id: 'A1', asset_code: 'EQ-UNPLANNED-1', asset_name: 'เครื่องมือ 1', remarks: '' },
      { id: 'I2', asset_id: 'A2', asset_code: 'EQ-UNPLANNED-2', asset_name: 'เครื่องมือ 2', remarks: '' }
    ];

    render(
      <UnplannedJustificationModal
        open={true}
        onClose={onClose}
        unplannedItems={unplannedItems}
        onSaveJustifications={onSave}
      />
    );

    expect(screen.getByText(/ระบุเหตุผลที่ไม่วางแผนทวนสอบในปีนี้/i)).toBeInTheDocument();
    expect(screen.getByText('EQ-UNPLANNED-1')).toBeInTheDocument();
    expect(screen.getByText('EQ-UNPLANNED-2')).toBeInTheDocument();

    // Quick apply standard reason to all
    const quickReasonBtn = screen.getByRole('button', { name: /ยังไม่ถึงกำหนดตามรอบความถี่/i });
    fireEvent.click(quickReasonBtn);

    // Save justifications
    const saveBtn = screen.getByRole('button', { name: 'บันทึกเหตุผล' });
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalledWith([
      { asset_id: 'A1', remarks: 'ยังไม่ถึงกำหนดตามรอบความถี่' },
      { asset_id: 'A2', remarks: 'ยังไม่ถึงกำหนดตามรอบความถี่' }
    ]);
  });
});
