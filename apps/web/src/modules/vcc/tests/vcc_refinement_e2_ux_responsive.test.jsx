import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import useStore from '../../../store/useStore';
import { VccBadge, VccEmptyState, VccSkeleton } from '../components/VccDesignSystem';
import { AnnualPlanMatrixTable } from '../components/AnnualPlanMatrixTable';
import { WorkOrderTable } from '../components/WorkOrderTable';
import VccMetricsStrip from '../components/VccMetricsStrip';

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

    it('renders Column 1 with sticky positioning and Column 2 with desktop-only sticky', () => {
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

      const col2Header = screen.getByText('วันครบกำหนด / สถานะหลักฐาน');
      expect(col2Header).toHaveClass('xl:sticky');
      expect(col2Header).toHaveClass('xl:left-[260px]');
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
});
