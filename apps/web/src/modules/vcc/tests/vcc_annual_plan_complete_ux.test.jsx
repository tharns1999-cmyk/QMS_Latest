import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnnualPlanOverviewCards } from '../components/AnnualPlanOverviewCards';
import { AnnualPlanViewSwitcher } from '../components/AnnualPlanViewSwitcher';
import { AnnualPlanEquipmentListView } from '../components/AnnualPlanEquipmentListView';
import { AnnualPlanQuarterlyView } from '../components/AnnualPlanQuarterlyView';
import { PlanFormModal } from '../components/AnnualPlanModals';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import useStore from '../../../store/useStore';
import { resetVccLocalStore } from '../api/vccApi';

describe('VCC Annual Plan — Complete UX Architecture Redesign', () => {
  const mockPlanItems = [
    {
      id: 'item-1',
      plan_id: 'plan-2026',
      asset_id: 'asset-1',
      asset_code: 'EQ-001',
      asset_name: 'Digital Caliper 150mm',
      asset_type: 'TOOL',
      location: 'Production Line A',
      provider_name: 'ทวนสอบภายใน',
      frequency_label: 'รายปี',
      planned_months: [3],
      remarks: '',
      sort_order: 1
    },
    {
      id: 'item-2',
      plan_id: 'plan-2026',
      asset_id: 'asset-2',
      asset_code: 'EQ-002',
      asset_name: 'Pressure Gauge 10 Bar',
      asset_type: 'GAUGE',
      location: 'Boiler Room',
      provider_name: 'ภายนอก (สอบเทียบ)',
      frequency_label: 'รายครึ่งปี',
      planned_months: [4, 10],
      remarks: '',
      sort_order: 2
    },
    {
      id: 'item-3',
      plan_id: 'plan-2026',
      asset_id: 'asset-3',
      asset_code: 'EQ-003',
      asset_name: 'Backup Thermometer',
      asset_type: 'TOOL',
      location: 'QC Lab',
      provider_name: 'ทวนสอบภายใน',
      frequency_label: 'รายปี',
      planned_months: [],
      remarks: '', // lacks justification
      sort_order: 3
    }
  ];

  const mockPlan = {
    id: 'plan-2026',
    plan_year: 2026,
    department_code: 'QC',
    status: 'DRAFT',
    form_code: 'FM-QC-46',
    revision: '01',
    title: 'แผนการทวนสอบและสอบเทียบเครื่องมือวัดประจำปี 2026',
    due_date_rule: 'END_OF_MONTH'
  };

  const mockActiveAssets = [
    { id: 'asset-1', asset_code: 'EQ-001', status: 'ACTIVE' },
    { id: 'asset-2', asset_code: 'EQ-002', status: 'ACTIVE' },
    { id: 'asset-3', asset_code: 'EQ-003', status: 'ACTIVE' },
    { id: 'asset-4', asset_code: 'EQ-004', status: 'ACTIVE' } // Not in plan
  ];

  describe('1. AnnualPlanOverviewCards', () => {
    it('แสดงตัวเลขสรุป 4 กล่อง (ในขอบเขต, มีแผนทวนสอบแล้ว, ยังไม่ได้วางแผน, รอบทวนสอบรวม) ได้ถูกต้อง', () => {
      render(
        <AnnualPlanOverviewCards
          planItems={mockPlanItems}
          activePlan={mockPlan}
          activeAssets={mockActiveAssets}
          canEditPlan={true}
        />
      );

      // In Scope: 3
      expect(screen.getByText('เครื่องมือในขอบเขต')).toBeInTheDocument();
      const threes = screen.getAllByText('3');
      expect(threes.length).toBeGreaterThanOrEqual(2);

      // Planned: 2, Unplanned: 1
      expect(screen.getByText('มีแผนทวนสอบแล้ว')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('ยังไม่ได้วางแผน')).toBeInTheDocument();
      const ones = screen.getAllByText('1');
      expect(ones.length).toBeGreaterThanOrEqual(1);

      // Total rounds: 1 + 2 = 3
      expect(screen.getByText('รอบวางแผนรวม')).toBeInTheDocument();
    });

    it('แสดงการแจ้งเตือนเครื่องมือที่ยังไม่ได้วางแผนและยังไม่มีเหตุผลรองรับ พร้อมปุ่มระบุเหตุผล', () => {
      const handleOpenJustification = vi.fn();
      render(
        <AnnualPlanOverviewCards
          planItems={mockPlanItems}
          activePlan={mockPlan}
          activeAssets={mockActiveAssets}
          canEditPlan={true}
          onOpenJustificationModal={handleOpenJustification}
        />
      );

      expect(screen.getByText(/ยังมีเครื่องมืออีก/i)).toBeInTheDocument();
      expect(screen.getByText(/ที่ยังไม่ได้กำหนดรอบทวนสอบและยังไม่ได้ระบุเหตุผล/i)).toBeInTheDocument();

      const btn = screen.getByRole('button', { name: /^ระบุเหตุผล$/i });
      fireEvent.click(btn);
      expect(handleOpenJustification).toHaveBeenCalledTimes(1);
    });

    it('แสดงแบนเนอร์แจ้งเตือนเมื่อมีเครื่องมือในทะเบียนที่ยังไม่ได้ถูกดึงเข้าแผน', () => {
      const handleOpenSmartImport = vi.fn();
      render(
        <AnnualPlanOverviewCards
          planItems={mockPlanItems}
          activePlan={mockPlan}
          activeAssets={mockActiveAssets}
          canEditPlan={true}
          onOpenSmartImport={handleOpenSmartImport}
        />
      );

      expect(screen.getByText(/พบเครื่องมือใช้งานในทะเบียนที่ยังไม่ได้รวมอยู่ในแผนนี้จำนวน/i)).toBeInTheDocument();

      const importBtn = screen.getByRole('button', { name: /เพิ่มเข้าแผนจากทะเบียน/i });
      fireEvent.click(importBtn);
      expect(handleOpenSmartImport).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. AnnualPlanViewSwitcher', () => {
    it('แสดงตัวเลือกมุมมอง 3 รูปแบบ และสลับสถานะ active ได้ถูกต้อง', () => {
      const handleViewChange = vi.fn();
      const { rerender } = render(
        <AnnualPlanViewSwitcher
          viewMode="LIST"
          onViewModeChange={handleViewChange}
        />
      );

      const listTab = screen.getByRole('button', { name: /รายการเครื่องมือ/i });
      const quarterlyTab = screen.getByRole('button', { name: /มุมมองรายไตรมาส/i });
      const matrixTab = screen.getByRole('button', { name: /ตารางแผน 12 เดือน/i });

      expect(listTab).toHaveAttribute('aria-pressed', 'true');
      expect(quarterlyTab).toHaveAttribute('aria-pressed', 'false');
      expect(matrixTab).toHaveAttribute('aria-pressed', 'false');

      fireEvent.click(quarterlyTab);
      expect(handleViewChange).toHaveBeenCalledWith('QUARTERLY');

      rerender(
        <AnnualPlanViewSwitcher
          viewMode="QUARTERLY"
          onViewModeChange={handleViewChange}
        />
      );
      expect(quarterlyTab).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('3. AnnualPlanEquipmentListView', () => {
    it('แสดงรายการเครื่องมือแบบแถวเดี่ยว แถบเดือน 12 เดือน และข้อความมาตรฐาน ISO 9001', () => {
      render(
        <AnnualPlanEquipmentListView
          planItems={mockPlanItems}
          activePlan={mockPlan}
          canEditPlan={true}
        />
      );

      expect(screen.getByText('EQ-001')).toBeInTheDocument();
      expect(screen.getByText('Digital Caliper 150mm')).toBeInTheDocument();
      expect(screen.getByText('EQ-002')).toBeInTheDocument();
      expect(screen.getByText('Pressure Gauge 10 Bar')).toBeInTheDocument();

      // Check ISO 9001 compliance notice
      expect(screen.getAllByText(/วางแผนเท่านั้น • ยังไม่มีหลักฐานใบงาน/i).length).toBeGreaterThanOrEqual(1);
    });

    it('กดเลือกเดือนเพื่อเพิ่มหรือลบเดือนในแถบกำหนดการ 12 เดือนได้', () => {
      const handleQuickAddMonth = vi.fn();
      const handleQuickRemoveMonth = vi.fn();

      render(
        <AnnualPlanEquipmentListView
          planItems={mockPlanItems}
          activePlan={mockPlan}
          canEditPlan={true}
          onQuickAddMonth={handleQuickAddMonth}
          onQuickRemoveMonth={handleQuickRemoveMonth}
        />
      );

      // EQ-001 has planned_months: [3]
      // Button for Month 3 should be selected, clicking it should trigger remove
      const m3Btn = screen.getByRole('button', { name: /EQ-001 มี\.ค\. ยกเลิกกำหนดการ/i });
      fireEvent.click(m3Btn);
      expect(handleQuickRemoveMonth).toHaveBeenCalledWith(mockPlanItems[0], 3);

      // Month 5 is unselected, clicking it should trigger add
      const m5Btn = screen.getByRole('button', { name: /EQ-001 พ\.ค\. กำหนดการ/i });
      fireEvent.click(m5Btn);
      expect(handleQuickAddMonth).toHaveBeenCalledWith(mockPlanItems[0], 5);
    });

    it('ค้นหาเครื่องมือตามรหัสหรือชื่อได้ถูกต้อง', () => {
      render(
        <AnnualPlanEquipmentListView
          planItems={mockPlanItems}
          activePlan={mockPlan}
          canEditPlan={true}
        />
      );

      const searchInput = screen.getByPlaceholderText(/ค้นหารหัส, ชื่อเครื่องมือ, สถานที่/i);
      fireEvent.change(searchInput, { target: { value: 'Pressure' } });

      expect(screen.getByText('EQ-002')).toBeInTheDocument();
      expect(screen.queryByText('EQ-001')).not.toBeInTheDocument();
      expect(screen.queryByText('EQ-003')).not.toBeInTheDocument();
    });

    it('กรองตามหมวดหมู่ประเภทเครื่องมือได้ถูกต้อง', () => {
      render(
        <AnnualPlanEquipmentListView
          planItems={mockPlanItems}
          activePlan={mockPlan}
          canEditPlan={true}
        />
      );

      const categorySelect = screen.getByLabelText(/กรองประเภทเครื่องมือ/i);
      fireEvent.change(categorySelect, { target: { value: 'GAUGE' } });

      expect(screen.getByText('EQ-002')).toBeInTheDocument();
      expect(screen.queryByText('EQ-001')).not.toBeInTheDocument();
    });
  });

  describe('4. AnnualPlanQuarterlyView', () => {
    it('จัดกลุ่มเครื่องมือแยกตามไตรมาส Q1-Q4 และส่วนที่ยังไม่ได้วางแผน', () => {
      render(
        <AnnualPlanQuarterlyView
          planItems={mockPlanItems}
          activePlan={mockPlan}
          canEditPlan={true}
        />
      );

      // Q1 has EQ-001 (Month 3)
      expect(screen.getByText(/ไตรมาส 1: มกราคม – มีนาคม/i)).toBeInTheDocument();
      // Q2 has EQ-002 (Month 4)
      expect(screen.getByText(/ไตรมาส 2: เมษายน – มิถุนายน/i)).toBeInTheDocument();
      // Q4 has EQ-002 (Month 10)
      expect(screen.getByText(/ไตรมาส 4: ตุลาคม – ธันวาคม/i)).toBeInTheDocument();

      // Unscheduled items section
      expect(screen.getByText(/เครื่องมือที่ยังไม่ได้วางแผนในไตรมาสใด ๆ/i)).toBeInTheDocument();
      expect(screen.getByText('EQ-003')).toBeInTheDocument();
    });
  });

  describe('5. PlanFormModal', () => {
    it('แสดง 3 ส่วนชัดเจน และล็อกฟิลด์ถาวรเมื่ออยู่ในโหมดแก้ไขแผนเดิม', () => {
      const mockForm = {
        plan_year: 2026,
        department_code: 'QC',
        form_code: 'FM-QC-46',
        revision: '01',
        title: 'แผนการทวนสอบและสอบเทียบเครื่องมือวัดประจำปี 2026',
        due_date_rule: 'END_OF_MONTH'
      };

      render(
        <PlanFormModal
          open={true}
          onClose={vi.fn()}
          editingPlan={mockPlan}
          form={mockForm}
          setForm={vi.fn()}
          error=""
          saving={false}
          onSubmit={vi.fn()}
          activeDepartments={[{ code: 'QC', name_th: 'ควบคุมคุณภาพ' }]}
        />
      );

      // 3 Structured sections
      expect(screen.getByText(/1\. ข้อมูลพื้นฐานแผนประจำปี/i)).toBeInTheDocument();
      expect(screen.getByText(/2\. ข้อมูลเอกสารคุณภาพ \(QMS\)/i)).toBeInTheDocument();
      expect(screen.getByText(/3\. กติกาคำนวณวันครบกำหนด/i)).toBeInTheDocument();

      // Badges when editing
      const lockBadges = screen.getAllByText('ล็อกอัตโนมัติ');
      expect(lockBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('6. AssetRegisterPage Integration & View Switching', () => {
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
        masterUsers: [
          {
            id: 'dc4',
            name: 'DC หัวหน้า (DCC)',
            department: 'DC',
            approval_level: 4,
            status: 'ACTIVE',
            isDcc: true
          }
        ]
      });
    });

    it('เปิดหน้าแผนประจำปีโดยเริ่มต้นที่ Equipment List View และสามารถสลับมุมมองได้', async () => {
      render(<AssetRegisterPage />);

      fireEvent.click(await screen.findByRole('button', { name: /แผนการทวนสอบประจำปี \(FM-QC-46\)/i }));

      // By default: AnnualPlanEquipmentListView is rendered
      expect(await screen.findByTestId('annual-plan-equipment-list-view')).toBeInTheDocument();

      // Switch to Quarterly View
      const quarterlyBtn = screen.getByRole('button', { name: /มุมมองรายไตรมาส/i });
      fireEvent.click(quarterlyBtn);

      expect(await screen.findByTestId('annual-plan-quarterly-view')).toBeInTheDocument();

      // Switch to Matrix View
      const matrixBtn = screen.getByRole('button', { name: /ตารางแผน 12 เดือน/i });
      fireEvent.click(matrixBtn);

      expect(await screen.findByTestId('annual-plan-matrix-table')).toBeInTheDocument();

      // Switch back to List View
      const listBtn = screen.getByRole('button', { name: /รายการเครื่องมือ/i });
      fireEvent.click(listBtn);

      expect(await screen.findByTestId('annual-plan-equipment-list-view')).toBeInTheDocument();
    });
  });
});
