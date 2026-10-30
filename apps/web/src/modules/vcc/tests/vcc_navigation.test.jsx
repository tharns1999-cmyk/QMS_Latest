import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import { resetVccLocalStore } from '../api/vccApi';
import Sidebar from '../../../app/layout/Sidebar';
import AssetRegisterPage from '../pages/AssetRegisterPage';

describe('VCC Enterprise Navigation & Sidebar Spoke Integration Tests', () => {
  beforeEach(() => {
    resetVccLocalStore();
    useStore.setState({
      currentUser: {
        id: 'dcc-nav-tester',
        name: 'DCC Nav Tester',
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

  it('1. Sidebar adapts to VCC Spoke when in /vcc route: shows VCC brand badge, "กลับสู่พอร์ทัลหลัก", and all 4 Enterprise navigation items', () => {
    render(
      <MemoryRouter initialEntries={['/vcc/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    );

    // VCC Brand badge and subtitle
    expect(screen.getByText('VCC')).toBeTruthy();
    expect(screen.getByText('Calibration & Verification')).toBeTruthy();

    // Spoke navigation link back to Hub
    expect(screen.getByText('กลับสู่พอร์ทัลหลัก')).toBeTruthy();

    // Group headers
    expect(screen.getByText('การปฏิบัติงานและภาพรวม')).toBeTruthy();
    expect(screen.getByText('แผนและการควบคุม')).toBeTruthy();
    expect(screen.getByText('ทะเบียนและข้อมูลหลัก')).toBeTruthy();

    // 4 VCC menu items
    expect(screen.getByRole('link', { name: /ภาพรวมและแจ้งเตือน/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /ใบสั่งงานและบันทึกผล/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /แผนการทวนสอบประจำปี/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /ทะเบียนเครื่องมือวัด/i })).toBeTruthy();
  });

  it('2. Synchronizes URL routes with VCC views: /vcc/dashboard, /vcc/work-orders, /vcc/plans, and /vcc/assets', async () => {
    // Test route /vcc/dashboard
    const { unmount: unmountDash } = render(
      <MemoryRouter initialEntries={['/vcc/dashboard']}>
        <AssetRegisterPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('vcc-dashboard-section')).toBeTruthy();
    });
    unmountDash();

    // Test route /vcc/work-orders
    const { unmount: unmountWo } = render(
      <MemoryRouter initialEntries={['/vcc/work-orders']}>
        <AssetRegisterPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('vcc-work-order-section')).toBeTruthy();
    });
    unmountWo();

    // Test route /vcc/plans
    const { unmount: unmountPlan } = render(
      <MemoryRouter initialEntries={['/vcc/plans']}>
        <AssetRegisterPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('annual-plan-matrix')).toBeTruthy();
    });
    unmountPlan();

    // Test route /vcc/assets
    render(
      <MemoryRouter initialEntries={['/vcc/assets']}>
        <AssetRegisterPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^เพิ่มเครื่องมือ$/i })).toBeTruthy();
    });
  });

  it('3. Preserves backward compatibility: default view and in-page buttons continue switching views seamlessly', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AssetRegisterPage />
      </MemoryRouter>
    );

    // Initial view defaults to ASSETS when rendered at root
    expect(screen.getByRole('button', { name: /^เพิ่มเครื่องมือ$/i })).toBeTruthy();

    // Clicking top switcher buttons switches views
    fireEvent.click(screen.getByRole('button', { name: /ภาพรวมและรายงาน/i }));
    await waitFor(() => {
      expect(screen.getByTestId('vcc-dashboard-section')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /ใบสั่งงานและบันทึกผล/i }));
    await waitFor(() => {
      expect(screen.getByTestId('vcc-work-order-section')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /แผนการทวนสอบประจำปี/i }));
    await waitFor(() => {
      expect(screen.getByTestId('annual-plan-matrix')).toBeTruthy();
    });
  });

  it('4. Renders clean Enterprise Page Header: breadcrumb context, title without redundant module prefix, and eliminates duplicate header tabs in visual UI', async () => {
    render(
      <MemoryRouter initialEntries={['/vcc/dashboard']}>
        <AssetRegisterPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      // Must render clean title without redundant "VCC (Verify and Calibration Center) — " prefix
      expect(screen.getByRole('heading', { level: 1, name: /ภาพรวมและแจ้งเตือน \(Dashboard & Alerts\)/i })).toBeTruthy();
      // Must render breadcrumb context
      expect(screen.getByText('ศูนย์ทวนสอบและสอบเทียบ (VCC)')).toBeTruthy();
      expect(screen.queryByText(/VCC \(Verify and Calibration Center\) —/i)).toBeNull();
    });
  });
});
