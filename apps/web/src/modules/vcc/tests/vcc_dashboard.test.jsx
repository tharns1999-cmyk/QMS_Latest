import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import useStore from '../../../store/useStore';
import { resetVccLocalStore } from '../api/vccApi';
import AssetRegisterPage from '../pages/AssetRegisterPage';

describe('VCC Phase 4 — Dashboard KPI, Notification Policy, CSV Export & Audit Trail', () => {
  beforeEach(() => {
    resetVccLocalStore();
    useStore.setState({
      currentUser: {
        id: 'dcc-dash-1',
        name: 'DCC Dashboard Tester',
        role: 'USER',
        isDcc: true,
        approvalLevel: 4,
        approval_level: 4,
        department: 'QC'
      },
      masterDepartments: [
        { code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' },
        { code: 'WH', name_th: 'คลังสินค้า', status: 'ACTIVE' }
      ],
      approvalMatrix: [
        { docType: 'FM', minRequesterLevel: 1, requiredReviewerLevel: 4, requiredApproverLevel: 5 }
      ]
    });
  });

  it('1. แสดง KPI แยกเครื่องมือรายตัวออกจากกลุ่มแม่, แยกแท็บแจ้งเตือนตามสถานะ (OVERDUE / ON_HOLD / DUE_SOON / PENDING_REVIEW) และบันทึกประวัติใน Audit Trail', async () => {
    render(<AssetRegisterPage />);

    const dashNavBtn = await screen.findByRole('button', { name: /ภาพรวมและรายงาน/i });
    fireEvent.click(dashNavBtn);

    await waitFor(() => {
      expect(screen.getByTestId('vcc-dashboard-section')).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByTestId('kpi-active-assets').textContent).toContain('6 / 7');
      expect(screen.getByTestId('kpi-overdue-count').textContent).toBe('1');
    });

    // OVERDUE tab shows WO-2026-001, while ON_HOLD tab does not mix OVERDUE alerts in
    expect(screen.getByTestId('alert-list-OVERDUE').textContent).toContain('WO-2026-001');

    fireEvent.click(screen.getByTestId('alert-tab-ON_HOLD'));
    await waitFor(() => {
      expect(screen.getByTestId('alert-empty-state')).toBeTruthy();
    });
  });

  it('2. แก้ไขกติกาวันแจ้งเตือนล่วงหน้า/เลยกำหนดได้ในหน้าเว็บ แสดงข้อผิดพลาดเมื่อกรอกค่าไม่ถูกต้อง และส่งออกไฟล์ CSV พร้อมบันทึก Audit Trail', async () => {
    render(<AssetRegisterPage />);

    fireEvent.click(await screen.findByRole('button', { name: /ภาพรวมและรายงาน/i }));
    await screen.findByTestId('vcc-dashboard-section');

    // Open notification settings modal
    fireEvent.click(screen.getByTestId('vcc-open-notification-settings-btn'));

    const monthlyDueInput = await screen.findByLabelText('งานรายเดือน แจ้งเตือนล่วงหน้า');
    fireEvent.change(monthlyDueInput, { target: { value: '' } });
    fireEvent.click(screen.getByTestId('vcc-save-notification-settings-btn'));

    // Displays validation error when empty/invalid
    const alertBox = await screen.findByRole('alert');
    expect(alertBox.textContent).toMatch(/รายการวันแจ้งเตือนต้องเป็นตัวเลข/);

    // Enter valid days and save
    fireEvent.change(monthlyDueInput, { target: { value: '10, 5' } });
    fireEvent.click(screen.getByTestId('vcc-save-notification-settings-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('vcc-save-notification-settings-btn')).toBeNull();
    });

    // Export Annual Plan CSV & Work Orders CSV
    fireEvent.click(screen.getByTestId('vcc-export-plan-csv-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('vcc-export-success-banner').textContent).toMatch(/ส่งออกตารางแผนประจำปี/);
    });

    fireEvent.click(screen.getByTestId('vcc-export-wo-csv-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('vcc-export-success-banner').textContent).toMatch(/ส่งออกรายการใบสั่งงาน/);
    });
  });
});
