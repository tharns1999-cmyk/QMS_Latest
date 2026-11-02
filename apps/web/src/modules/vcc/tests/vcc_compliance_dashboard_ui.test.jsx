import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VccDashboardSection from '../components/VccDashboardSection';
import VccMetricsStrip from '../components/VccMetricsStrip';
import VccOnHoldTrackerTab from '../components/VccOnHoldTrackerTab';
import VccComplianceReportTab from '../components/VccComplianceReportTab';
import * as dashboardApi from '../api/vccDashboardApi';
import * as workOrderApi from '../api/vccWorkOrderApi';

vi.mock('../api/vccDashboardApi', async () => {
  const actual = await vi.importActual('../api/vccDashboardApi');
  return {
    ...actual,
    fetchVccDashboard: vi.fn(),
    fetchVccOnHoldTracker: vi.fn(),
    fetchVccComplianceReport: vi.fn(),
    exportVccComplianceReportCsv: vi.fn(),
    exportVccComplianceReportExcel: vi.fn()
  };
});

vi.mock('../api/vccWorkOrderApi', async () => {
  const actual = await vi.importActual('../api/vccWorkOrderApi');
  return {
    ...actual,
    releaseVccWorkOrderHold: vi.fn()
  };
});

describe('VCC Phase 3.3: Calibration Monitoring & Compliance Dashboard UI Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. VccMetricsStrip Enhancements', () => {
    it('renders non-overlapping due soon buckets and certificate validity metrics', () => {
      const mockEq = {
        active_assets: 10,
        total_assets: 12,
        on_hold_assets: 2,
        retired_assets: 0,
        composite_set_count: 1
      };

      const mockWo = {
        overdue_count: 3,
        rescheduled_overdue_count: 1,
        total_due_soon_30_days: 7,
        due_0_7_days: 2,
        due_8_15_days: 2,
        due_16_30_days: 3,
        pending_review_count: 1,
        completed_count: 15,
        on_time_rate: 93,
        on_time_count: 14,
        fail_count: 2
      };

      const mockCertKpi = {
        cert_valid_count: 8,
        cert_expiring_0_30_days: 1,
        cert_expiring_31_60_days: 2,
        total_expiring_soon: 3,
        cert_expired_count: 1
      };

      render(
        <VccMetricsStrip
          eq={mockEq}
          wo={mockWo}
          certKpi={mockCertKpi}
          reviewSlaDays={3}
        />
      );

      // Verify Active assets
      expect(screen.getByTestId('kpi-active-assets').textContent).toContain('10');

      // Verify Overdue and rescheduled note
      const overdueEl = screen.getByTestId('kpi-overdue-count');
      expect(overdueEl.textContent).toBe('3');
      expect(screen.getByText(/เลื่อนนัดแต่เลยเกณฑ์เดิม: 1 งาน/)).toBeInTheDocument();

      // Verify Non-overlapping Due Soon breakdown (0-7, 8-15, 16-30 days)
      expect(screen.getByTestId('kpi-due-30-count').textContent).toBe('7');
      expect(screen.getByText(/0-7วัน: 2 · 8-15วัน: 2 · 16-30วัน: 3/)).toBeInTheDocument();

      // Verify Certificate Expiry Status (Expired alert prioritized)
      const certStatusEl = screen.getByTestId('kpi-cert-status');
      expect(certStatusEl.textContent).toContain('1');
      expect(certStatusEl.textContent).toContain('หมดอายุ');
    });
  });

  describe('2. VccDashboardSection Navigation (3 Sub-Tabs)', () => {
    it('switches between Overview, ON_HOLD Tracker, and Compliance Report tabs smoothly', async () => {
      dashboardApi.fetchVccDashboard.mockResolvedValue({
        equipment_kpi: { active_assets: 8, total_assets: 10, on_hold_assets: 2 },
        work_order_kpi: { overdue_count: 1, due_in_30_days: 2, completed_count: 5 },
        certificate_kpi: { cert_valid_count: 7, total_expiring_soon: 1, cert_expired_count: 0 },
        alerts: [
          {
            dedupe_key: 'wo-1:OVERDUE',
            alert_type: 'OVERDUE',
            wo_code: 'WO-001',
            asset_code: 'AST-001',
            asset_name: 'Vernier Caliper',
            department: 'QC',
            message: 'เลยกำหนด 5 วัน'
          }
        ]
      });

      dashboardApi.fetchVccOnHoldTracker.mockResolvedValue({
        total_items: 2,
        open_nc_count: 2,
        items: [
          {
            asset_id: 'ast-1',
            asset_code: 'CAL-001',
            asset_name: 'Micrometer 0-25mm',
            asset_type: 'MEASURING_TOOL',
            department: 'QC',
            location: 'Lab A',
            wo_id: 'wo-101',
            wo_code: 'WO-101',
            result_status: 'FAIL',
            nc_status: 'OPEN',
            days_on_hold: 12,
            can_release_hold: true,
            impact_assessment: 'ประเมินล็อต A-101 แล้วไม่พบผลกระทบ'
          }
        ]
      });

      dashboardApi.fetchVccComplianceReport.mockResolvedValue({
        year: 2026,
        summary: {
          total_records: 10,
          compliant_count: 8,
          compliant_amended_count: 1,
          non_compliant_overdue_count: 1,
          non_compliant_hold_count: 0,
          compliance_rate: 90
        },
        records: [
          {
            wo_id: 'wo-201',
            wo_code: 'WO-201',
            asset_code: 'CAL-002',
            asset_name: 'Digital Scale',
            department: 'QC',
            location: 'Cleanroom',
            provider_name: 'ห้องปฏิบัติการทวนสอบภายใน',
            calibration_method: 'WI-CAL-02',
            traceability_ref: 'Standard E2 Weights',
            required_due_date: '2026-03-01',
            scheduled_date: '2026-03-01',
            is_rescheduled: false,
            performed_at: '2026-03-01',
            result_status: 'PASS',
            certificate_no: 'CERT-SCALE-01',
            cert_sha256_hash: 'abc123def4567890',
            verdict: 'COMPLIANT'
          }
        ]
      });

      render(<VccDashboardSection />);

      // Initially on Overview tab
      await waitFor(() => {
        expect(screen.getByTestId('main-tab-OVERVIEW')).toHaveClass('text-indigo-600');
        expect(screen.getByText('ศูนย์แจ้งเตือนตามกติกา QMS')).toBeInTheDocument();
      });

      // ON_HOLD badge shown in tab header
      expect(screen.getByTestId('main-tab-ON_HOLD')).toHaveTextContent('2');

      // Click ON_HOLD / NC Tracker tab
      fireEvent.click(screen.getByTestId('main-tab-ON_HOLD'));
      await waitFor(() => {
        expect(screen.getByTestId('vcc-on-hold-tracker-tab')).toBeInTheDocument();
        expect(screen.getByText('Micrometer 0-25mm')).toBeInTheDocument();
      });

      // Click Compliance Report tab
      fireEvent.click(screen.getByTestId('main-tab-COMPLIANCE'));
      await waitFor(() => {
        expect(screen.getByTestId('vcc-compliance-report-tab')).toBeInTheDocument();
        expect(screen.getByText('รายงานการตรวจสอบย้อนกลับสำหรับผู้ตรวจประเมิน (Compliance Report for Auditor)')).toBeInTheDocument();
        expect(screen.getByText('Digital Scale')).toBeInTheDocument();
      });
    });
  });

  describe('3. VccOnHoldTrackerTab Actions & Release Hold Modal', () => {
    it('opens release hold modal, requires impact assessment, and submits release hold successfully', async () => {
      dashboardApi.fetchVccOnHoldTracker.mockResolvedValue({
        total_items: 1,
        open_nc_count: 1,
        items: [
          {
            asset_id: 'ast-hld-1',
            asset_code: 'HLD-001',
            asset_name: 'Pressure Gauge',
            asset_type: 'GAUGE',
            department: 'QC',
            location: 'Boiler 1',
            wo_id: 'wo-hld-1',
            wo_code: 'WO-HLD-01',
            result_status: 'FAIL',
            nc_status: 'OPEN',
            days_on_hold: 5,
            can_release_hold: true,
            impact_assessment: null,
            recommendation: 'ผู้มีอำนาจระดับ L5+ สามารถประเมินผลกระทบและกดปลดระงับการใช้งานได้'
          }
        ]
      });

      workOrderApi.releaseVccWorkOrderHold.mockResolvedValue({
        workOrder: { id: 'wo-hld-1', nc_status: 'RELEASED' }
      });

      render(<VccOnHoldTrackerTab />);

      await waitFor(() => {
        expect(screen.getByText('HLD-001')).toBeInTheDocument();
        expect(screen.getByTestId('release-hold-btn-HLD-001')).toBeInTheDocument();
      });

      // Click Release Hold button
      fireEvent.click(screen.getByTestId('release-hold-btn-HLD-001'));

      // Modal appears
      expect(screen.getByText('ปลดระงับการใช้งานเครื่องมือ (Release ON_HOLD)')).toBeInTheDocument();

      // Enter impact assessment
      const textarea = screen.getByPlaceholderText(/ระบุผลการตรวจสอบย้อนหลัง/);
      fireEvent.change(textarea, { target: { value: 'ตรวจสอบผลทดสอบ Batch #9988 ไม่พบผลกระทบต่อสเปกผลิตภัณฑ์' } });

      // Click Confirm release
      fireEvent.click(screen.getByTestId('confirm-release-hold-btn'));

      await waitFor(() => {
        expect(workOrderApi.releaseVccWorkOrderHold).toHaveBeenCalledWith(
          'wo-hld-1',
          'ตรวจสอบผลทดสอบ Batch #9988 ไม่พบผลกระทบต่อสเปกผลิตภัณฑ์'
        );
      });
    });
  });

  describe('4. VccComplianceReportTab Filters & Export Buttons', () => {
    it('renders audit-ready table, summary metrics, and triggers CSV and Excel exports', async () => {
      dashboardApi.fetchVccComplianceReport.mockResolvedValue({
        year: 2026,
        summary: {
          total_records: 5,
          compliant_count: 4,
          compliant_amended_count: 1,
          non_compliant_overdue_count: 0,
          non_compliant_hold_count: 0,
          compliance_rate: 100
        },
        records: [
          {
            wo_id: 'wo-c1',
            wo_code: 'WO-C1',
            asset_code: 'CAL-C1',
            asset_name: 'Vernier Caliper High Precision',
            department: 'QC',
            location: 'Lab A',
            provider_name: 'สถาบันมาตรวิทยาแห่งชาติ',
            calibration_method: 'ISO 17025 Acc. Cal',
            traceability_ref: 'Standard Gauge Block Set #01',
            required_due_date: '2026-05-01',
            scheduled_date: '2026-05-01',
            is_rescheduled: false,
            performed_at: '2026-05-01',
            result_status: 'PASS',
            certificate_no: 'NIMT-2026-9901',
            certificate_valid_until: '2027-05-01',
            has_certificate_file: true,
            cert_file_name: 'cert_9901.pdf',
            cert_sha256_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            verdict: 'COMPLIANT'
          }
        ]
      });

      dashboardApi.exportVccComplianceReportCsv.mockResolvedValue(
        '\uFEFF"เลขที่ใบสั่งงาน","รหัสเครื่องมือ"\r\n"WO-C1","CAL-C1"'
      );

      render(<VccComplianceReportTab />);

      await waitFor(() => {
        expect(screen.getByTestId('summary-compliance-rate')).toHaveTextContent('100%');
        expect(screen.getByText('Vernier Caliper High Precision')).toBeInTheDocument();
        expect(screen.getByText('COMPLIANT')).toBeInTheDocument();
        expect(screen.getByText('e3b0c44298fc...')).toBeInTheDocument();
      });

      // Test CSV Export Button
      const exportCsvBtn = screen.getByTestId('export-compliance-csv-btn');
      fireEvent.click(exportCsvBtn);
      await waitFor(() => {
        expect(dashboardApi.exportVccComplianceReportCsv).toHaveBeenCalledWith({
          year: 2026,
          department: undefined
        });
      });

      // Test Excel Export Button
      const exportExcelBtn = screen.getByTestId('export-compliance-excel-btn');
      fireEvent.click(exportExcelBtn);
      expect(dashboardApi.exportVccComplianceReportExcel).toHaveBeenCalled();

      // Test Digital Record Modal Open
      const viewRecordBtn = screen.getByTestId('view-record-btn-WO-C1');
      fireEvent.click(viewRecordBtn);
      expect(screen.getByText(/DIGITAL RECORD: WO-C1/)).toBeInTheDocument();
    });
  });
});

