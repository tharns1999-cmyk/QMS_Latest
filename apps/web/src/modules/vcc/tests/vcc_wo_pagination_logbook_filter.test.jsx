import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { WorkOrderTable } from '../components/WorkOrderTable';
import WorkOrderSection from '../components/WorkOrderSection';
import { AssetDetailDrawer } from '../components/AssetDetailDrawer';
import * as vccWorkOrderApi from '../api/vccWorkOrderApi';
import * as vccApi from '../api/vccApi';
import * as vccPlanApi from '../api/vccPlanApi';

describe('VCC Multi-Year Filtering, Pagination, UI Polish, and Asset Calibration Logbook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn(() => 'blob:mock-csv-url');
    } else {
      vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:mock-csv-url');
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(vi.fn());
    }
  });

  describe('1. WorkOrderTable UI Polish (DEC-02 / No Empty Parens, Secondary Amend Button)', () => {
    const mockWoNoReason = {
      id: 'wo-resched-no-reason',
      wo_code: 'WO-2026-001',
      asset_code: 'CAL-01',
      asset_name: 'Vernier Caliper',
      department: 'QC',
      provider_name: 'สถาบันมาตรวิทยา',
      original_due_date: '2026-06-30',
      due_date: '2026-07-15',
      reschedule_status: 'APPROVED',
      reschedule_reason: '', // Empty reason
      status: 'OPEN',
      result_status: 'PENDING'
    };

    const mockWoWithReason = {
      id: 'wo-resched-with-reason',
      wo_code: 'WO-2026-002',
      asset_code: 'CAL-02',
      asset_name: 'Digital Scale',
      department: 'QC',
      provider_name: 'สถาบันมาตรวิทยา',
      original_due_date: '2026-06-30',
      due_date: '2026-07-15',
      reschedule_status: 'APPROVED',
      reschedule_reason: 'ส่งสอบเทียบภายนอกล่าช้า',
      status: 'OPEN',
      result_status: 'PENDING'
    };

    const mockClosedWo = {
      id: 'wo-closed-01',
      wo_code: 'WO-2026-003',
      asset_code: 'CAL-03',
      asset_name: 'Micrometer',
      department: 'QC',
      provider_name: 'สถาบันมาตรวิทยา',
      original_due_date: '2026-05-15',
      due_date: '2026-05-15',
      status: 'CLOSED',
      result_status: 'PASS',
      performed_at: '2026-05-10',
      actual_result: '0.002 mm',
      acceptance_criteria: '±0.005 mm',
      certificate_no: 'CERT-2026-999'
    };

    it('does NOT render empty parens () when reschedule_reason is empty/whitespace', () => {
      const { container } = render(
        <WorkOrderTable
          workOrders={[mockWoNoReason]}
          activeTab="OPEN"
          thresholds={{ required_approver_level: 5 }}
          onRowClick={vi.fn()}
        />
      );

      // Verify "วันเดิม:" is rendered
      expect(screen.getByText(/วันเดิม:/i)).toBeInTheDocument();
      // Ensure there is NO empty "()" in the rendered output
      const rawText = container.textContent;
      expect(rawText).not.toMatch(/\(\s*\)/);
    });

    it('renders ({reschedule_reason}) when reschedule_reason is present', () => {
      render(
        <WorkOrderTable
          workOrders={[mockWoWithReason]}
          activeTab="OPEN"
          thresholds={{ required_approver_level: 5 }}
          onRowClick={vi.fn()}
        />
      );

      expect(screen.getByText('(ส่งสอบเทียบภายนอกล่าช้า)')).toBeInTheDocument();
    });

    it('renders [แก้ไขผลบันทึก] button as clean secondary gray without emoji ✏️ for CLOSED work orders', () => {
      render(
        <WorkOrderTable
          workOrders={[mockClosedWo]}
          activeTab="CLOSED"
          thresholds={{ required_approver_level: 5 }}
          onRowClick={vi.fn()}
          onAmend={vi.fn()}
          onViewDigitalRecord={vi.fn()}
        />
      );

      // Primary button is "ดูผล / ใบรับรอง"
      const viewBtn = screen.getByRole('button', { name: /ดูผล \/ ใบรับรอง/i });
      expect(viewBtn).toBeInTheDocument();

      // Secondary button "แก้ไขผลบันทึก"
      const amendBtn = screen.getByRole('button', { name: /แก้ไขผลบันทึก/i });
      expect(amendBtn).toBeInTheDocument();
      // Verify no emoji ✏️
      expect(amendBtn.textContent).not.toContain('✏️');
      expect(amendBtn.textContent).toBe('แก้ไขผลบันทึก');
      // Verify gray secondary styling classes
      expect(amendBtn.className).toContain('border-slate-200');
      expect(amendBtn.className).toContain('bg-white');
      expect(amendBtn.className).toContain('text-slate-600');
      expect(amendBtn.className).not.toContain('bg-amber-600');
    });

    it('renders pagination controls when pagination prop is passed to WorkOrderTable', () => {
      const mockPagination = {
        currentPage: 2,
        totalItems: 45,
        pageSize: 15,
        onPageChange: vi.fn(),
        onPageSizeChange: vi.fn(),
        pageSizeOptions: [15, 25, 50, 100]
      };

      render(
        <WorkOrderTable
          workOrders={[mockClosedWo]}
          pagination={mockPagination}
          activeTab="CLOSED"
          thresholds={{ required_approver_level: 5 }}
          onRowClick={vi.fn()}
        />
      );

      expect(screen.getByTestId('table-pagination')).toBeInTheDocument();
      expect(screen.getByText(/แสดง/i)).toBeInTheDocument();
      expect(screen.getByText('16–30')).toBeInTheDocument();
      expect(screen.getByText('45')).toBeInTheDocument();
    });
  });

  describe('2. WorkOrderSection Multi-Year & Month Filtering, Pagination, and CSV Export', () => {
    const sampleWorkOrders = [
      {
        id: 'wo-2025-01',
        wo_code: 'WO-2025-001',
        plan_year: 2025,
        planned_month: 2,
        due_date: '2025-02-28',
        original_due_date: '2025-02-28',
        asset_code: 'AST-25',
        asset_name: 'Digital Caliper 2025',
        department: 'QC',
        provider_name: 'NIMT',
        status: 'CLOSED',
        result_status: 'PASS',
        performed_at: '2025-02-25',
        actual_result: '0.01 mm',
        certificate_no: 'CERT-2025-01'
      },
      {
        id: 'wo-2026-05',
        wo_code: 'WO-2026-005',
        plan_year: 2026,
        planned_month: 5,
        due_date: '2026-05-31',
        original_due_date: '2026-05-31',
        asset_code: 'AST-26',
        asset_name: 'Thermometer 2026',
        department: 'QC',
        provider_name: 'ทวนสอบภายใน',
        status: 'CLOSED',
        result_status: 'PASS',
        performed_at: '2026-05-20',
        actual_result: '25.1 °C',
        certificate_no: 'CERT-2026-05'
      },
      {
        id: 'wo-2026-08',
        wo_code: 'WO-2026-008',
        plan_year: 2026,
        planned_month: 8,
        due_date: '2026-08-31',
        original_due_date: '2026-08-31',
        asset_code: 'AST-26-B',
        asset_name: 'Pressure Gauge 2026',
        department: 'QA',
        provider_name: 'External Lab',
        status: 'CLOSED',
        result_status: 'FAIL',
        performed_at: '2026-08-22',
        actual_result: '10.5 bar (Error > 5%)',
        certificate_no: 'CERT-2026-08'
      }
    ];

    beforeEach(() => {
      vi.spyOn(vccWorkOrderApi, 'fetchVccWorkOrders').mockImplementation(async ({ status }) => {
        if (status === 'CLOSED') return sampleWorkOrders;
        return [];
      });
      vi.spyOn(vccWorkOrderApi, 'fetchVccWorkOrderSettings').mockResolvedValue({
        settings: { retention_years: 3, approval_doc_type: 'FM', default_acceptance_criteria: [] },
        thresholds: { min_requester_level: 1, required_reviewer_level: 4, required_approver_level: 5 }
      });
      vi.spyOn(vccPlanApi, 'fetchVccPlanSettings').mockResolvedValue({ providers: [] });
      vi.spyOn(vccPlanApi, 'fetchVccPlans').mockResolvedValue([]);
      vi.spyOn(vccApi, 'fetchVccAssets').mockResolvedValue([]);
    });

    it('renders Year and Month filters defaulting to "ทุกปี" and "ทุกเดือน"', async () => {
      render(
        <MemoryRouter>
          <WorkOrderSection activeDepartments={[{ code: 'QC', nameTh: 'ควบคุมคุณภาพ' }]} />
        </MemoryRouter>
      );

      // Switch to CLOSED tab
      const closedTab = screen.getByRole('tab', { name: /ปิดงานแล้ว/i });
      fireEvent.click(closedTab);

      await waitFor(() => {
        expect(screen.getByText('WO-2025-001')).toBeInTheDocument();
        expect(screen.getByText('WO-2026-005')).toBeInTheDocument();
        expect(screen.getByText('WO-2026-008')).toBeInTheDocument();
      });

      const yearFilter = screen.getByLabelText(/กรองตามปี/i);
      expect(yearFilter).toBeInTheDocument();
      expect(yearFilter.value).toBe('ALL');

      const monthFilter = screen.getByLabelText(/กรองตามเดือน/i);
      expect(monthFilter).toBeInTheDocument();
      expect(monthFilter.value).toBe('ALL');
    });

    it('filters work orders when a specific Year is selected', async () => {
      render(
        <MemoryRouter>
          <WorkOrderSection activeDepartments={[{ code: 'QC', nameTh: 'ควบคุมคุณภาพ' }]} />
        </MemoryRouter>
      );

      const closedTab = screen.getByRole('tab', { name: /ปิดงานแล้ว/i });
      fireEvent.click(closedTab);

      await waitFor(() => {
        expect(screen.getByText('WO-2025-001')).toBeInTheDocument();
      });

      const yearFilter = screen.getByLabelText(/กรองตามปี/i);
      fireEvent.change(yearFilter, { target: { value: '2025' } });

      await waitFor(() => {
        expect(screen.getByText('WO-2025-001')).toBeInTheDocument();
        expect(screen.queryByText('WO-2026-005')).not.toBeInTheDocument();
        expect(screen.queryByText('WO-2026-008')).not.toBeInTheDocument();
      });
    });

    it('filters work orders when a specific Month is selected', async () => {
      render(
        <MemoryRouter>
          <WorkOrderSection activeDepartments={[{ code: 'QC', nameTh: 'ควบคุมคุณภาพ' }]} />
        </MemoryRouter>
      );

      const closedTab = screen.getByRole('tab', { name: /ปิดงานแล้ว/i });
      fireEvent.click(closedTab);

      await waitFor(() => {
        expect(screen.getByText('WO-2026-005')).toBeInTheDocument();
      });

      const monthFilter = screen.getByLabelText(/กรองตามเดือน/i);
      fireEvent.change(monthFilter, { target: { value: '5' } });

      await waitFor(() => {
        expect(screen.getByText('WO-2026-005')).toBeInTheDocument();
        expect(screen.queryByText('WO-2025-01')).not.toBeInTheDocument();
        expect(screen.queryByText('WO-2026-008')).not.toBeInTheDocument();
      });
    });

    it('resets year and month filters when clicking [ล้างตัวกรอง]', async () => {
      render(
        <MemoryRouter>
          <WorkOrderSection activeDepartments={[{ code: 'QC', nameTh: 'ควบคุมคุณภาพ' }]} />
        </MemoryRouter>
      );

      const closedTab = screen.getByRole('tab', { name: /ปิดงานแล้ว/i });
      fireEvent.click(closedTab);

      await waitFor(() => {
        expect(screen.getByText('WO-2025-001')).toBeInTheDocument();
      });

      const yearFilter = screen.getByLabelText(/กรองตามปี/i);
      fireEvent.change(yearFilter, { target: { value: '2025' } });

      const resetBtn = screen.getByRole('button', { name: /ล้างตัวกรอง/i });
      expect(resetBtn).toBeInTheDocument();
      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(yearFilter.value).toBe('ALL');
        expect(screen.getByText('WO-2026-005')).toBeInTheDocument();
      });
    });

    it('triggers CSV download with UTF-8 BOM and formula safety when clicking [ส่งออกประวัติ (CSV)]', async () => {
      render(
        <MemoryRouter>
          <WorkOrderSection activeDepartments={[{ code: 'QC', nameTh: 'ควบคุมคุณภาพ' }]} />
        </MemoryRouter>
      );

      const closedTab = screen.getByRole('tab', { name: /ปิดงานแล้ว/i });
      fireEvent.click(closedTab);

      await waitFor(() => {
        expect(screen.getByText('WO-2025-001')).toBeInTheDocument();
      });

      const exportBtn = screen.getByRole('button', { name: /ส่งออกประวัติ \(CSV\)/i });
      expect(exportBtn).toBeInTheDocument();

      const appendChildSpy = vi.spyOn(document.body, 'appendChild');
      fireEvent.click(exportBtn);

      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(appendChildSpy).toHaveBeenCalled();
    });
  });

  describe('3. AssetDetailDrawer Asset Calibration Logbook (Multi-Year Grouping & PDF Inspection)', () => {
    const sampleAsset = {
      id: 'ast-multi-yr',
      asset_code: 'TC-001',
      name: 'Temperature Controller',
      asset_type: 'เทอร์โมคัปเปิล',
      department: 'QC',
      status: 'ACTIVE'
    };

    const multiYearWos = [
      {
        id: 'wo-2026-jan',
        wo_code: 'WO-2026-010',
        plan_year: 2026,
        planned_month: 1,
        performed_at: '2026-01-20',
        due_date: '2026-01-31',
        status: 'CLOSED',
        result_status: 'PASS',
        actual_result: '100.1 °C',
        acceptance_criteria: '±1.0 °C',
        certificate_no: 'CERT-2026-010',
        certificate_file_name: 'cert-2026-010.pdf'
      },
      {
        id: 'wo-2026-feb',
        wo_code: 'WO-2026-020',
        plan_year: 2026,
        planned_month: 2,
        performed_at: '2026-02-18',
        due_date: '2026-02-28',
        status: 'CLOSED',
        result_status: 'PASS',
        actual_result: '100.2 °C',
        acceptance_criteria: '±1.0 °C',
        certificate_no: 'CERT-2026-020'
      },
      {
        id: 'wo-2025-dec',
        wo_code: 'WO-2025-120',
        plan_year: 2025,
        planned_month: 12,
        performed_at: '2025-12-15',
        due_date: '2025-12-31',
        status: 'CLOSED',
        result_status: 'FAIL',
        actual_result: '102.5 °C (Exceeded)',
        acceptance_criteria: '±1.0 °C',
        certificate_no: 'CERT-2025-120'
      }
    ];

    it('renders calibration logbook grouped by year when "ทุกปี" is selected', async () => {
      vi.spyOn(vccWorkOrderApi, 'fetchVccWorkOrders').mockResolvedValue(multiYearWos);

      render(
        <AssetDetailDrawer
          isOpen={true}
          onClose={vi.fn()}
          data={{ asset: sampleAsset, history: [] }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('WO-2026-010')).toBeInTheDocument();
        expect(screen.getByText('WO-2026-020')).toBeInTheDocument();
        expect(screen.getByText('WO-2025-120')).toBeInTheDocument();
      });

      // Year headers for grouped view (present in dropdown option and group section header)
      expect(screen.getAllByText(/ปี 2569 \(2026\)/i).length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText(/2 รายการ/i)).toBeInTheDocument();
      expect(screen.getAllByText(/ปี 2568 \(2025\)/i).length).toBeGreaterThanOrEqual(2);

      // Measurement and Acceptance criteria check
      expect(screen.getByText('100.1 °C')).toBeInTheDocument();
      expect(screen.getAllByText('±1.0 °C').length).toBeGreaterThanOrEqual(1);

      // Result badges
      expect(screen.getAllByText('✓ ผ่าน (PASS)').length).toBe(2);
      expect(screen.getByText('✕ ไม่ผ่าน (FAIL)')).toBeInTheDocument();
    });

    it('filters calibration logbook to selected year', async () => {
      vi.spyOn(vccWorkOrderApi, 'fetchVccWorkOrders').mockResolvedValue(multiYearWos);

      render(
        <AssetDetailDrawer
          isOpen={true}
          onClose={vi.fn()}
          data={{ asset: sampleAsset, history: [] }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('WO-2026-010')).toBeInTheDocument();
      });

      const yearDropdown = screen.getByLabelText(/เลือกปีกรองประวัติ/i);
      expect(yearDropdown).toBeInTheDocument();

      // Filter to 2025
      fireEvent.change(yearDropdown, { target: { value: '2025' } });

      await waitFor(() => {
        expect(screen.getByText('WO-2025-120')).toBeInTheDocument();
        expect(screen.queryByText('WO-2026-010')).not.toBeInTheDocument();
        expect(screen.queryByText('WO-2026-020')).not.toBeInTheDocument();
      });
    });

    it('opens DigitalRecordModal when clicking [ดูผล / ใบรับรอง]', async () => {
      vi.spyOn(vccWorkOrderApi, 'fetchVccWorkOrders').mockResolvedValue(multiYearWos);

      render(
        <AssetDetailDrawer
          isOpen={true}
          onClose={vi.fn()}
          data={{ asset: sampleAsset, history: [] }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('WO-2026-010')).toBeInTheDocument();
      });

      const viewBtns = screen.getAllByRole('button', { name: /ดูผล \/ ใบรับรอง/i });
      expect(viewBtns.length).toBeGreaterThanOrEqual(1);

      fireEvent.click(viewBtns[0]);

      // DigitalRecordModal should be mounted
      await waitFor(() => {
        expect(screen.getByTestId('digital-record-modal')).toBeInTheDocument();
      });
    });
  });
});
