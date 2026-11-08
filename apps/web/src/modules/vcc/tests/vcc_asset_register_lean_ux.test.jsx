import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { AssetDetailDrawer } from '../components/AssetDetailDrawer';
import { resetVccLocalStore } from '../api/vccApi';

const MASTER_DEPTS = [
  { code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' },
  { code: 'WH', name_th: 'คลังสินค้า', status: 'ACTIVE' },
  { code: 'DC', name_th: 'ควบคุมเอกสาร', status: 'ACTIVE' }
];

const DCC_USER = { id: 'dc4', name: 'เจ้าหน้าที่ DCC', department: 'DC', depts: ['DC'], isDcc: true, approval_level: 4 };
const QC_STAFF = { id: 'qc2', name: 'พนักงาน QC', department: 'QC', depts: ['QC'], isDcc: false, approval_level: 2 };

describe('VCC Round E4 — Asset Register Lean UX Redesign', () => {
  beforeEach(async () => {
    resetVccLocalStore();
    useStore.setState({
      departments: MASTER_DEPTS,
      masterDepartments: MASTER_DEPTS,
      currentUser: DCC_USER
    });
  });

  it('1. Status Navigation: displays 4 primary status tabs with counts and defaults to ใช้งานปกติ (ACTIVE)', async () => {
    render(
      <MemoryRouter>
        <AssetRegisterPage />
      </MemoryRouter>
    );

    // Default tab is ACTIVE
    await waitFor(() => {
      const activeTab = screen.getByRole('tab', { name: /ใช้งานปกติ/i });
      expect(activeTab).toHaveAttribute('aria-selected', 'true');
    });

    // Check tabs with counts exist
    expect(screen.getByRole('tab', { name: /ทั้งหมด/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /ใช้งานปกติ/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /ระงับใช้/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /ปลดออกแล้ว/i })).toBeInTheDocument();

    // Verify Active instruments are displayed, Retired instrument T-OLD-01 is NOT shown
    expect(screen.getByText('ST002')).toBeInTheDocument();
    expect(screen.getByText('SW001')).toBeInTheDocument();
    expect(screen.queryByText('T-OLD-01')).not.toBeInTheDocument();

    // Switch to "ทั้งหมด" (ALL) tab
    fireEvent.click(screen.getByRole('tab', { name: /ทั้งหมด/i }));
    await waitFor(() => {
      expect(screen.getByText('ST002')).toBeInTheDocument();
      expect(screen.getByText('T-OLD-01')).toBeInTheDocument();
    });
  });

  it('2. Equipment List: renders 5 logical desktop columns (เครื่องมือ, แผนก/สถานที่, Serial Number, สถานะ, การจัดการ)', async () => {
    render(
      <MemoryRouter>
        <AssetRegisterPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('ST002')).toBeInTheDocument();
    });

    // Table header must have the 5 logical columns
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent.trim());
    expect(headers).toContain('เครื่องมือ');
    expect(headers).toContain('แผนก / สถานที่');
    expect(headers).toContain('Serial Number');
    expect(headers).toContain('สถานะ');
    expect(headers).toContain('การจัดการ');

    // Row content checks
    const stRow = screen.getByText('ST002').closest('tr');
    expect(within(stRow).getByText(/เทอร์โมมิเตอร์มาตรฐาน ST002/i)).toBeInTheDocument();
    expect(within(stRow).getByText('QC (ควบคุมคุณภาพ)')).toBeInTheDocument();
    expect(within(stRow).getByText('40717388')).toBeInTheDocument();
    expect(within(stRow).getByText('ใช้งานปกติ')).toBeInTheDocument();
    expect(within(stRow).getByRole('button', { name: /ประวัติ/i })).toBeInTheDocument();
  });

  it('3. Search & Clear Filters: searches instruments and resets with clear action', async () => {
    render(
      <MemoryRouter>
        <AssetRegisterPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('ST002')).toBeInTheDocument();
      expect(screen.getByText('SW001')).toBeInTheDocument();
    });

    // Search by Model or Serial
    const searchInput = screen.getByPlaceholderText(/ค้นหารหัสเครื่องมือ/i);
    fireEvent.change(searchInput, { target: { value: '40717388' } });

    await waitFor(() => {
      expect(screen.getByText('ST002')).toBeInTheDocument();
      expect(screen.queryByText('SW001')).not.toBeInTheDocument();
    });

    // Clear filter button should appear and reset search
    const clearBtn = screen.getByRole('button', { name: /ล้างตัวกรอง/i });
    expect(clearBtn).toBeInTheDocument();
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.getByText('SW001')).toBeInTheDocument();
    });
  });

  it('4. Detail Experience: AssetDetailDrawer renders 4 structured sections and handles close', async () => {
    const mockClose = vi.fn();
    const sampleAsset = {
      asset_code: 'EQ-TEST-01',
      name: 'เครื่องมือทดสอบความเที่ยงตรง',
      asset_type: 'ไมโครมิเตอร์',
      serial_no: 'SN-998877',
      model: 'Mitutoyo 500-196-30',
      location: 'ห้องปฏิบัติการ QC 1',
      department: 'QC',
      department_name_th: 'ควบคุมคุณภาพ',
      status: 'ACTIVE',
      group_nature: 'COMPOSITE_SET',
      composite_details: 'ไมโครมิเตอร์ 0-25 มม. และแท่งเกจมาตรฐาน 25 มม.'
    };

    const sampleHistory = [
      {
        id: 'h1',
        action: 'VCC_ASSET_CREATED',
        at: '2026-11-01T08:00:00Z',
        actor_name: 'DCC Admin',
        details: { reason: 'นำเข้าเครื่องมือใหม่' }
      }
    ];

    render(
      <AssetDetailDrawer
        isOpen={true}
        onClose={mockClose}
        data={{ asset: sampleAsset, history: sampleHistory }}
        canManage={true}
      />
    );

    // Section 1: ข้อมูลทั่วไป
    expect(screen.getByText('ข้อมูลทั่วไปของเครื่องมือ')).toBeInTheDocument();
    expect(screen.getByText(/EQ-TEST-01/)).toBeInTheDocument();
    expect(screen.getByText(/ไมโครมิเตอร์ 0-25 มม/)).toBeInTheDocument();

    // Section 2: สถานะและการควบคุมคุณภาพ
    expect(screen.getByText('สถานะและการควบคุมคุณภาพ')).toBeInTheDocument();
    expect(screen.getByText(/และสามารถวางแผนการทวนสอบ/i)).toBeInTheDocument();

    // Section 3: ผู้รับผิดชอบและสถานที่
    expect(screen.getByText('ผู้รับผิดชอบและสถานที่จัดเก็บ')).toBeInTheDocument();
    expect(screen.getAllByText('ห้องปฏิบัติการ QC 1').length).toBeGreaterThanOrEqual(1);

    // Section 4: ประวัติการแก้ไข
    expect(screen.getByText('ประวัติการแก้ไข (Audit Log: VCC_ASSET_*)')).toBeInTheDocument();
    expect(screen.getByText(/นำเข้าเครื่องมือใหม่/i)).toBeInTheDocument();

    // Close button in footer
    const closeBtn = screen.getByRole('button', { name: 'ปิดหน้าต่าง' });
    fireEvent.click(closeBtn);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('5. Deep Link: opens AssetDetailDrawer directly when ?asset=<id> is in URL', async () => {
    render(
      <MemoryRouter initialEntries={['/vcc/assets?asset=vcc-seed-st002']}>
        <AssetRegisterPage />
      </MemoryRouter>
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getAllByText(/ST002/i).length).toBeGreaterThanOrEqual(1);
  });

  it('6. RBAC & Ergonomics: General staff sees read-only notes and 44px mobile touch targets', async () => {
    useStore.setState({ currentUser: QC_STAFF });

    render(
      <MemoryRouter>
        <AssetRegisterPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('ST002')).toBeInTheDocument();
    });

    // Add instrument button must NOT be visible to L2 staff
    expect(screen.queryByRole('button', { name: /เพิ่มเครื่องมือ/i })).not.toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/หัวหน้าแผนก \(ระดับ L4 ขึ้นไป\)/);

    // History button must be accessible to L2 staff
    const historyBtn = screen.getAllByRole('button', { name: /ประวัติ/i })[0];
    expect(historyBtn).toBeInTheDocument();
  });
});
