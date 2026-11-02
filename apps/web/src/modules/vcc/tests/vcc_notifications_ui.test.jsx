import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VccDashboardSection from '../components/VccDashboardSection';
import VccNotificationAuditTab from '../components/VccNotificationAuditTab';
import VccNotificationAcknowledgementModal from '../components/VccNotificationAcknowledgementModal';
import * as notificationApi from '../api/vccNotificationApi';
import * as dashboardApi from '../api/vccDashboardApi';
import useStore from '../../../store/useStore';

vi.mock('../api/vccNotificationApi', () => ({
  fetchVccNotifications: vi.fn(),
  acknowledgeVccNotification: vi.fn(),
  triggerVccNotificationSweep: vi.fn(),
  exportVccNotificationsCsv: vi.fn()
}));

vi.mock('../api/vccDashboardApi', async () => {
  const actual = await vi.importActual('../api/vccDashboardApi');
  return {
    ...actual,
    fetchVccDashboard: vi.fn(),
    saveVccNotificationSettings: vi.fn()
  };
});

describe('VCC Phase 3.4: Automated Notification & Escalation UI Tests', () => {
  const mockDccUser = {
    id: 'USR-DCC-01',
    name: 'DCC Officer',
    department: 'QC',
    isDcc: true,
    isQmr: false,
    approval_level: 5
  };

  const sampleNotifications = [
    {
      id: 'NTF-001',
      dedup_key: 'VCC_WORK_ORDER:WO-001:OVERDUE_L1',
      notification_type: 'OVERDUE_L1_SUPERVISOR',
      reference_type: 'VCC_WORK_ORDER',
      reference_id: 'WO-001',
      asset_id: 'AST-001',
      asset_code: 'CAL-001',
      asset_name: 'Digital Caliper',
      work_order_id: 'WO-001',
      wo_code: 'WO-2026-001',
      department: 'QC',
      target_role: 'SUPERVISOR',
      escalation_level: 1,
      severity: 'WARNING',
      title: '[เลยกำหนด L1] เครื่องมือ CAL-001 เกินกำหนด 2 วัน',
      message: 'เครื่องมือ CAL-001 ใบสั่งงาน WO-2026-001 เกินกำหนดทวนสอบ 2 วัน',
      days_offset: 2,
      status: 'PENDING',
      acknowledged_at: null,
      acknowledged_by: null,
      acknowledged_by_name: null,
      acknowledgement_note: null,
      created_at: '2026-11-01T08:00:00Z'
    },
    {
      id: 'NTF-002',
      dedup_key: 'VCC_WORK_ORDER:WO-002:OVERDUE_L3',
      notification_type: 'OVERDUE_L3_CRITICAL',
      reference_type: 'VCC_WORK_ORDER',
      reference_id: 'WO-002',
      asset_id: 'AST-002',
      asset_code: 'PRS-002',
      asset_name: 'Pressure Transmitter',
      work_order_id: 'WO-002',
      wo_code: 'WO-2026-002',
      department: 'QA',
      target_role: 'QMR_EXECUTIVE',
      escalation_level: 3,
      severity: 'CRITICAL',
      title: '[วิกฤต/เลยกำหนด L3] เครื่องมือ PRS-002 เกินกำหนด 16 วัน (เสนอติดป้าย ON_HOLD)',
      message: 'เกินเกณฑ์วิกฤต 14 วัน ขอให้ฝ่ายคุณภาพพิจารณาติดป้ายระงับใช้เครื่องมือ (ON_HOLD)',
      days_offset: 16,
      status: 'ACKNOWLEDGED',
      acknowledged_at: '2026-11-02T09:30:00Z',
      acknowledged_by: 'USR-QA-01',
      acknowledged_by_name: 'QA Manager',
      acknowledgement_note: 'ส่งซ่อมศูนย์บริการภายนอกแล้ว',
      created_at: '2026-11-01T08:00:00Z'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ currentUser: mockDccUser });

    dashboardApi.fetchVccDashboard.mockResolvedValue({
      equipment_kpi: { active_assets: 10, total_assets: 12, on_hold_assets: 1 },
      work_order_kpi: { overdue_count: 1, total_due_soon_30_days: 2 },
      certificate_kpi: { valid_count: 9, expiring_count: 1, expired_count: 0 },
      alerts: [],
      notification_settings: {
        monthly_due_soon_days: [7, 3],
        monthly_overdue_days: [1, 3, 7],
        annual_due_soon_days: [30, 14, 7],
        annual_overdue_days: [1, 7, 14],
        review_sla_days: 3,
        escalation_l1_days: 1,
        escalation_l2_days: 7,
        escalation_l3_days: 14,
        acknowledgement_grace_period_days: 3
      }
    });

    notificationApi.fetchVccNotifications.mockResolvedValue({
      notifications: sampleNotifications,
      total: sampleNotifications.length,
      limit: 20,
      offset: 0
    });
  });

  it('1. Tab Navigation: displays 4 main tabs and switches to Notification Audit Tab', async () => {
    render(<VccDashboardSection />);

    await waitFor(() => {
      expect(screen.getByTestId('main-tab-OVERVIEW')).toBeInTheDocument();
      expect(screen.getByTestId('main-tab-ON_HOLD')).toBeInTheDocument();
      expect(screen.getByTestId('main-tab-COMPLIANCE')).toBeInTheDocument();
      expect(screen.getByTestId('main-tab-NOTIFICATIONS')).toBeInTheDocument();
    });

    // Click on the 4th tab
    fireEvent.click(screen.getByTestId('main-tab-NOTIFICATIONS'));

    await waitFor(() => {
      expect(screen.getByTestId('vcc-notification-audit-tab')).toBeInTheDocument();
      expect(screen.getByText(/ประวัติการแจ้งเตือนและการยกระดับ/i)).toBeInTheDocument();
    });
  });

  it('2. Notification Audit Tab: displays notifications with severity, escalation level, and department badge', async () => {
    render(<VccNotificationAuditTab />);

    await waitFor(() => {
      expect(screen.getByText('CAL-001')).toBeInTheDocument();
      expect(screen.getByText('PRS-002')).toBeInTheDocument();
      expect(screen.getByText('Level 1')).toBeInTheDocument();
      expect(screen.getByText('Level 3')).toBeInTheDocument();
      expect(screen.getByText('CRITICAL')).toBeInTheDocument();
      expect(screen.getByText('WARNING')).toBeInTheDocument();
    });

    // Check that acknowledged details are displayed
    expect(screen.getByText(/รับทราบโดย: QA Manager/i)).toBeInTheDocument();
    expect(screen.getByText(/"ส่งซ่อมศูนย์บริการภายนอกแล้ว"/i)).toBeInTheDocument();
  });

  it('3. Acknowledgement Modal Flow: opens modal, submits note, and triggers API call', async () => {
    notificationApi.acknowledgeVccNotification.mockResolvedValue({
      notification: { ...sampleNotifications[0], status: 'ACKNOWLEDGED' }
    });

    render(<VccNotificationAuditTab />);

    await waitFor(() => {
      expect(screen.getByTestId('ack-btn-NTF-001')).toBeInTheDocument();
    });

    // Click Acknowledge button
    fireEvent.click(screen.getByTestId('ack-btn-NTF-001'));

    await waitFor(() => {
      expect(screen.getByText(/รับทราบการแจ้งเตือน \(Acknowledge\)/i)).toBeInTheDocument();
      expect(screen.getByText(/รหัสอ้างอิง: NTF-001/i)).toBeInTheDocument();
    });

    // Enter note and submit
    const noteInput = screen.getByLabelText('บันทึกข้อความรับทราบ');
    fireEvent.change(noteInput, { target: { value: 'ประสานงานช่างสอบเทียบแล้ว' } });

    fireEvent.click(screen.getByTestId('confirm-acknowledge-btn'));

    await waitFor(() => {
      expect(notificationApi.acknowledgeVccNotification).toHaveBeenCalledWith(
        'NTF-001',
        'ประสานงานช่างสอบเทียบแล้ว'
      );
    });
  });

  it('4. Paperless CSV Export: triggers exportVccNotificationsCsv with current filter params', async () => {
    notificationApi.exportVccNotificationsCsv.mockResolvedValue();

    render(<VccNotificationAuditTab />);

    await waitFor(() => {
      expect(screen.getByTestId('export-notif-csv-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('export-notif-csv-btn'));

    expect(notificationApi.exportVccNotificationsCsv).toHaveBeenCalledWith({
      department: undefined,
      status: undefined,
      severity: undefined
    });
  });

  it('5. DCC Manual Sweep: triggers sweep API and shows success notification', async () => {
    notificationApi.triggerVccNotificationSweep.mockResolvedValue({
      success: true,
      summary: { created: 2, escalated: 1, resolved: 0 }
    });

    render(<VccNotificationAuditTab />);

    await waitFor(() => {
      expect(screen.getByTestId('trigger-sweep-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('trigger-sweep-btn'));

    await waitFor(() => {
      expect(notificationApi.triggerVccNotificationSweep).toHaveBeenCalled();
      expect(screen.getByText(/ประมวลผลการแจ้งเตือนสำเร็จ \(สร้างใหม่: 2, ยกระดับ: 1, ปิดจบ: 0\)/i)).toBeInTheDocument();
    });
  });

  it('6. Modal Disclaimer: guarantees segregation of duties and state preservation', () => {
    const handleClose = vi.fn();
    render(
      <VccNotificationAcknowledgementModal
        isOpen={true}
        onClose={handleClose}
        notification={sampleNotifications[0]}
      />
    );

    expect(screen.getByText(/หมายเหตุตามมาตรฐาน QMS/i)).toBeInTheDocument();
    expect(screen.getByText(/ไม่มีผลเปลี่ยนแปลงสถานะ/i)).toBeInTheDocument();
  });
});
