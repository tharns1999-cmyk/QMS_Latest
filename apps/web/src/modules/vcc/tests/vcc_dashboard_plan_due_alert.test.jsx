import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import useStore from '../../../store/useStore';
import VccDashboardSection from '../components/VccDashboardSection';
import * as dashboardApi from '../api/vccDashboardApi';
import * as workOrderApi from '../api/vccWorkOrderApi';
import * as planApi from '../api/vccPlanApi';
import * as assetApi from '../api/vccApi';

describe('VCC Dashboard: Due Plan Cycles Alert & 1-Click Work Order Creation', () => {
  const mockPlanDueAlert = {
    dedupe_key: 'cycle-nov-001:PLAN_DUE',
    alert_type: 'PLAN_DUE',
    severity: 'MEDIUM',
    plan_id: 'plan-qc-2026',
    plan_item_id: 'item-tc-001',
    plan_title: 'แผนการทวนสอบ QC ประจำปี 2026',
    plan_year: 2026,
    plan_revision: '00',
    planned_month: 11,
    cycle_id: 'cycle-nov-001',
    initial_cycle_id: 'cycle-nov-001',
    wo_id: null,
    wo_code: null,
    wo_status: null,
    asset_id: 'ast-tc-001',
    asset_code: 'TC-001',
    asset_name: 'เครื่องวัดอุณหภูมิ TC-001',
    department: 'QC',
    due_date: '2026-11-30',
    work_type: 'รายปี (ทวนสอบภายใน)',
    provider_name: 'ทวนสอบภายใน',
    is_group: 0,
    group_nature: 'LOGICAL_GROUP',
    message: 'ถึงรอบตามแผนประจำเดือน พฤศจิกายน (รายปี)',
    recommended_action: 'กดเปิดใบสั่งงานใหม่ตามแผนประจำปี'
  };

  const mockDashboardData = {
    year: 2026,
    reference_date: '2026-11-15',
    approved_plan_count: 1,
    equipment_kpi: {
      total_assets: 10,
      active_assets: 9,
      on_hold_assets: 0,
      retired_assets: 1,
      equipment_overdue_count: 0,
      equipment_due_soon_count: 0
    },
    work_order_kpi: {
      total_work_orders: 5,
      overdue_count: 0,
      completed_count: 5
    },
    certificate_kpi: {},
    monthly_comparison: [],
    department_breakdown: [],
    alerts: [mockPlanDueAlert],
    notification_settings: {
      monthly_due_soon_days: [7, 3],
      monthly_overdue_days: [1, 3, 7],
      annual_due_soon_days: [30, 14, 7],
      annual_overdue_days: [1, 7, 14],
      review_sla_days: 3
    }
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    useStore.setState({
      currentUser: {
        id: 'u-qc-officer',
        name: 'QC Officer Tester',
        role: 'USER',
        isDcc: false,
        isQmr: false,
        approval_level: 3,
        primary_department: 'QC',
        department: 'QC',
        departments: ['QC']
      },
      masterDepartments: [
        { code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' }
      ]
    });

    vi.spyOn(dashboardApi, 'fetchVccDashboard').mockResolvedValue(mockDashboardData);
    vi.spyOn(planApi, 'fetchVccPlans').mockResolvedValue([
      { id: 'plan-qc-2026', plan_year: 2026, department: 'QC', title: 'แผนการทวนสอบ QC ประจำปี 2026', status: 'APPROVED' }
    ]);
    vi.spyOn(planApi, 'fetchVccPlanDetail').mockResolvedValue({
      id: 'plan-qc-2026',
      items: [
        {
          id: 'item-tc-001',
          asset_id: 'ast-tc-001',
          asset_code: 'TC-001',
          asset_name: 'เครื่องวัดอุณหภูมิ TC-001',
          planned_months: [11],
          provider_name: 'ทวนสอบภายใน',
          is_group: 0
        }
      ]
    });
    vi.spyOn(assetApi, 'fetchVccAssets').mockResolvedValue([
      { id: 'ast-tc-001', asset_code: 'TC-001', name: 'เครื่องวัดอุณหภูมิ TC-001', department: 'QC', status: 'ACTIVE' }
    ]);
    vi.spyOn(planApi, 'fetchVccPlanSettings').mockResolvedValue({
      providers: ['ทวนสอบภายใน', 'ห้องปฏิบัติการภายนอก']
    });
    vi.spyOn(workOrderApi, 'createVccWorkOrder').mockResolvedValue({
      workOrder: {
        id: 'wo-new-001',
        wo_code: 'WO-2026-999',
        status: 'OPEN',
        asset_id: 'ast-tc-001'
      }
    });
  });

  it('1. แสดงแท็บ "รอบตามแผนประจำเดือนนี้" บน Dashboard พร้อมตัวเลขนับจำนวนแจ้งเตือน', async () => {
    render(<VccDashboardSection onNavigateToWorkOrders={vi.fn()} onNavigateToAsset={vi.fn()} />);

    // Check dashboard loaded
    await waitFor(() => {
      expect(screen.getByTestId('vcc-dashboard-section')).toBeTruthy();
    });

    // Verify Tab exists and displays count 1
    const planDueTab = screen.getByTestId('alert-tab-PLAN_DUE');
    expect(planDueTab).toBeTruthy();
    expect(planDueTab.textContent).toContain('รอบตามแผนประจำเดือนนี้');
    expect(planDueTab.textContent).toContain('1');
  });

  it('2. แสดงรายการเครื่องมือที่ถึงกำหนดรอบเดือนนี้ พร้อมปุ่ม [+ เปิดใบสั่งงาน]', async () => {
    render(<VccDashboardSection onNavigateToWorkOrders={vi.fn()} onNavigateToAsset={vi.fn()} />);

    // Click tab
    const planDueTab = await screen.findByTestId('alert-tab-PLAN_DUE');
    fireEvent.click(planDueTab);

    // Verify alert list contains TC-001 and details
    await waitFor(() => {
      const alertList = screen.getByTestId('alert-list-PLAN_DUE');
      expect(alertList.textContent).toContain('TC-001');
      expect(alertList.textContent).toContain('เครื่องวัดอุณหภูมิ TC-001');
      expect(alertList.textContent).toContain('QC');
      expect(alertList.textContent).toContain('ถึงรอบตามแผนประจำเดือน พฤศจิกายน');
    });

    // Button [+ เปิดใบสั่งงาน] exists
    const openBtn = screen.getByTestId('open-wo-btn-cycle-nov-001');
    expect(openBtn).toBeTruthy();
    expect(openBtn.textContent).toContain('+ เปิดใบสั่งงาน');
  });

  it('3. กดปุ่ม [+ เปิดใบสั่งงาน] แล้วเปิด CreateWorkOrderModal พร้อม Auto-populate แผน เครื่องมือ และรอบเดือน', async () => {
    render(<VccDashboardSection onNavigateToWorkOrders={vi.fn()} onNavigateToAsset={vi.fn()} />);

    const planDueTab = await screen.findByTestId('alert-tab-PLAN_DUE');
    fireEvent.click(planDueTab);

    const openBtn = await screen.findByTestId('open-wo-btn-cycle-nov-001');
    fireEvent.click(openBtn);

    // Verify CreateWorkOrderModal opens
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /สร้างใบสั่งงาน/i })).toBeTruthy();
    });

    // Radio "สร้างจากแผนประจำปีที่อนุมัติแล้ว" should be checked
    const planModeRadio = screen.getByLabelText(/สร้างจากแผนประจำปีที่อนุมัติแล้ว/i);
    expect(planModeRadio.checked).toBe(true);

    // Form should have auto-selected plan
    const planSelect = screen.getByDisplayValue(/แผนการทวนสอบ QC ประจำปี 2026/i);
    expect(planSelect).toBeTruthy();

    // Submit the form
    const submitBtn = screen.getByRole('button', { name: /สร้างใบสั่งงาน/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(workOrderApi.createVccWorkOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'PLAN',
          plan_id: 'plan-qc-2026',
          plan_item_id: 'item-tc-001',
          planned_month: 11,
          asset_id: 'ast-tc-001'
        })
      );
    });
  });
});
