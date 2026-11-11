import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import useStore from '../../../store/useStore';
import { VccBadge, VccEmptyState, VccSkeleton } from '../components/VccDesignSystem';
import { AnnualPlanMatrixTable } from '../components/AnnualPlanMatrixTable';
import { WorkOrderTable } from '../components/WorkOrderTable';
import VccMetricsStrip from '../components/VccMetricsStrip';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { resetVccLocalStore } from '../api/vccApi';

describe('VCC Refinement Round E2 — UX/UI & Responsive Excellence Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. VccDesignSystem — Semantic Contrast & Tokens', () => {
    it('VccBadge renders accessible high-contrast colors and labels for work order statuses', () => {
      const { rerender } = render(<VccBadge status="CLOSED" type="WORK_ORDER" dot />);
      expect(screen.getByText('ปิดงานแล้ว')).toBeInTheDocument();

      rerender(<VccBadge status="PENDING_REVIEW" type="WORK_ORDER" dot />);
      expect(screen.getByText('รอตรวจรับ')).toBeInTheDocument();

      rerender(<VccBadge status="ON_HOLD" type="WORK_ORDER" dot />);
      expect(screen.getByText('ระงับใช้')).toBeInTheDocument();
    });

    it('VccBadge renders correct labels for result statuses', () => {
      const { rerender } = render(<VccBadge status="PASS" type="RESULT" />);
      expect(screen.getByText('ผ่านเกณฑ์')).toBeInTheDocument();

      rerender(<VccBadge status="FAIL" type="RESULT" />);
      expect(screen.getByText('ไม่ผ่านเกณฑ์')).toBeInTheDocument();
    });

    it('VccEmptyState renders title, subtitle, and accessible action', () => {
      render(
        <VccEmptyState
          title="ไม่พบรายการใบสั่งงาน"
          subtitle="ลองปรับเปลี่ยนตัวกรองค้นหา"
          action={<button type="button">ล้างตัวกรอง</button>}
        />
      );
      expect(screen.getByText('ไม่พบรายการใบสั่งงาน')).toBeInTheDocument();
      expect(screen.getByText('ลองปรับเปลี่ยนตัวกรองค้นหา')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'ล้างตัวกรอง' })).toBeInTheDocument();
    });

    it('VccSkeleton renders accessible loading state', () => {
      render(<VccSkeleton count={3} type="card" />);
      expect(screen.getByRole('status', { name: 'กำลังโหลดข้อมูล' })).toBeInTheDocument();
    });
  });

  describe('2. AnnualPlanMatrixTable — Responsive Sticky Columns & Cues', () => {
    const mockPlanItems = [
      {
        id: 'pi-1',
        asset_id: 'ast-1',
        asset_code: 'CAL-001',
        asset_name: 'Digital Caliper',
        department: 'QC',
        asset_status: 'ACTIVE',
        planned_months: [2, 8],
        due_dates: ['2026-02-15', '2026-08-15'],
        is_group: 0
      }
    ];

    it('renders Column 1 with sticky positioning and omits middle due-date column for full 12-month space', () => {
      render(
        <AnnualPlanMatrixTable
          planItems={mockPlanItems}
          activePlan={{ id: 'plan-1', plan_year: 2026, status: 'APPROVED' }}
          workOrders={[]}
          canEditPlan={false}
        />
      );

      const col1Header = screen.getByText('รายการเครื่องมือวัด');
      expect(col1Header).toHaveClass('sticky');
      expect(col1Header).toHaveClass('left-0');

      expect(screen.queryByText('วันครบกำหนด / สถานะหลักฐาน')).not.toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'ม.ค.' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'ธ.ค.' })).toBeInTheDocument();
    });
  });

  describe('3. WorkOrderTable — Mobile Card vs Desktop Table', () => {
    const mockWorkOrders = [
      {
        id: 'wo-1',
        wo_code: 'WO-QC-2026-001',
        asset_code: 'CAL-001',
        asset_name: 'Vernier Caliper',
        department: 'QC',
        provider_name: 'Internal Calibration Lab',
        due_date: '2026-03-15',
        original_due_date: '2026-03-15',
        status: 'OPEN',
        result_status: 'PENDING',
        acceptance_criteria: 'Error <= 0.02 mm'
      }
    ];

    it('renders desktop table view when viewport is desktop width (>= 640px)', () => {
      window.innerWidth = 1024;
      useStore.setState({
        currentUser: { id: 'u1', name: 'Tester', department: 'QC', isDcc: false, level: 3 }
      });

      render(
        <WorkOrderTable
          workOrders={mockWorkOrders}
          thresholds={{ required_approver_level: 5 }}
          onRowClick={vi.fn()}
          onRecordResult={vi.fn()}
        />
      );

      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByText('WO-QC-2026-001')).toBeInTheDocument();
      expect(screen.getByText('CAL-001')).toBeInTheDocument();
    });

    it('renders mobile card view when viewport is mobile width (< 640px)', () => {
      window.innerWidth = 375;
      useStore.setState({
        currentUser: { id: 'u1', name: 'Tester', department: 'QC', isDcc: false, level: 3 }
      });

      render(
        <WorkOrderTable
          workOrders={mockWorkOrders}
          thresholds={{ required_approver_level: 5 }}
          onRowClick={vi.fn()}
          onRecordResult={vi.fn()}
        />
      );

      const mobileCardList = screen.getByTestId('vcc-wo-mobile-card-list');
      expect(mobileCardList).toBeInTheDocument();
      expect(screen.getByText('WO-QC-2026-001')).toBeInTheDocument();
      expect(screen.getByText('ผู้ดำเนินการ:')).toBeInTheDocument();

      // Reset window width
      window.innerWidth = 1024;
    });
  });

  describe('4. VccMetricsStrip — Adaptive 7-Card Grid', () => {
    it('renders executive metrics strip with 7th item spanning 2 cols on mobile', () => {
      render(
        <VccMetricsStrip
          eq={{ active_assets: 10, total_assets: 12, composite_set_count: 2, retired_assets: 2, on_hold_assets: 1 }}
          wo={{ completed_count: 8, on_time_rate: 95, on_time_count: 8, pass_count: 8, overdue_count: 0 }}
          certKpi={{ cert_valid_count: 10, total_expiring_soon: 1 }}
        />
      );

      expect(screen.getByTestId('kpi-active-assets')).toHaveTextContent('10');
      expect(screen.getByTestId('kpi-on-hold-assets')).toHaveTextContent('1');
      expect(screen.getByTestId('kpi-completed-count')).toHaveTextContent('8');

      const completedCard = screen.getByTestId('kpi-completed-count').closest('.col-span-2');
      expect(completedCard).toBeInTheDocument();
      expect(completedCard).toHaveClass('col-span-2');
      expect(completedCard).toHaveClass('md:col-span-1');
    });
  });

  describe('5. AssetRegisterPage — Mobile Card History & URL Sync (Viewport 375px & 390px)', () => {
    const LocationWatcher = () => {
      const location = useLocation();
      return <div data-testid="current-search">{location.search}</div>;
    };

    beforeEach(() => {
      resetVccLocalStore();
      useStore.setState({
        currentUser: { id: 'u-dcc-1', name: 'DCC Officer', department: 'DC', isDcc: true, level: 4 },
        departments: [
          { code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' },
          { code: 'WH', name_th: 'คลังสินค้า', status: 'ACTIVE' },
          { code: 'DC', name_th: 'ควบคุมเอกสาร', status: 'ACTIVE' }
        ],
        masterDepartments: [
          { code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' },
          { code: 'WH', name_th: 'คลังสินค้า', status: 'ACTIVE' },
          { code: 'DC', name_th: 'ควบคุมเอกสาร', status: 'ACTIVE' }
        ]
      });
    });

    it('opens history modal with asset.id from mobile card on 375px viewport and synchronizes URL', async () => {
      window.innerWidth = 375;

      render(
        <MemoryRouter initialEntries={['/vcc/assets']}>
          <LocationWatcher />
          <AssetRegisterPage />
        </MemoryRouter>
      );

      // Verify mobile card list is rendered
      const mobileList = await screen.findByTestId('vcc-asset-mobile-card-list');
      expect(mobileList).toBeInTheDocument();

      // Find mobile card history buttons
      const historyButtons = await screen.findAllByTestId('btn-asset-history-mobile');
      expect(historyButtons.length).toBeGreaterThan(0);

      // Click the first history button on mobile card
      fireEvent.click(historyButtons[0]);

      // Verify modal opens and displays asset details
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText(/รายละเอียดและประวัติการแก้ไข/i)).toBeInTheDocument();
      });

      // Verify URL search has updated with asset ID
      await waitFor(() => {
        expect(screen.getByTestId('current-search')).toHaveTextContent(/asset=/i);
      });

      // Close the modal and verify URL search parameter is cleared
      const closeButton = screen.getByRole('button', { name: /ปิดหน้าต่าง/i });
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByTestId('current-search')).toHaveTextContent('');
      });

      window.innerWidth = 1024;
    });

    it('opens history modal from mobile card on 390px viewport with correct asset details', async () => {
      window.innerWidth = 390;

      render(
        <MemoryRouter initialEntries={['/vcc/assets']}>
          <LocationWatcher />
          <AssetRegisterPage />
        </MemoryRouter>
      );

      const mobileList = await screen.findByTestId('vcc-asset-mobile-card-list');
      expect(mobileList).toBeInTheDocument();

      const historyButtons = await screen.findAllByTestId('btn-asset-history-mobile');
      fireEvent.click(historyButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      window.innerWidth = 1024;
    });

    it('supports opening history modal from mobile card across RETIRED tab', async () => {
      window.innerWidth = 375;

      render(
        <MemoryRouter initialEntries={['/vcc/assets']}>
          <LocationWatcher />
          <AssetRegisterPage />
        </MemoryRouter>
      );

      // Switch to RETIRED tab
      const retiredTab = screen.getByRole('tab', { name: /ปลดออกแล้ว/i });
      fireEvent.click(retiredTab);

      // Find mobile card history button in RETIRED tab
      const historyButtons = await screen.findAllByTestId('btn-asset-history-mobile');
      expect(historyButtons.length).toBeGreaterThan(0);

      fireEvent.click(historyButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText(/รายละเอียดและประวัติการแก้ไข/i)).toBeInTheDocument();
        expect(screen.getByTestId('current-search')).toHaveTextContent(/asset=/i);
      });

      window.innerWidth = 1024;
    });

    it('automatically opens history modal via direct deep-link (?asset=<id>) without errors', async () => {
      window.innerWidth = 375;

      render(
        <MemoryRouter initialEntries={['/vcc/assets?asset=ST002']}>
          <LocationWatcher />
          <AssetRegisterPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('ST002')).toBeInTheDocument();
      });

      window.innerWidth = 1024;
    });
  });
});
