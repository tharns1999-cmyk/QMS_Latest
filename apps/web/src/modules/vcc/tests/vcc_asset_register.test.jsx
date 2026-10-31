import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import PortalLandingPage from '../../portal/pages/PortalLandingPage';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { resetVccLocalStore, createVccAsset, retireVccAsset } from '../api/vccApi';

const SAMPLE_MASTER_DEPTS = [
  { code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' },
  { code: 'WH', name_th: 'คลังสินค้า', status: 'ACTIVE' },
  { code: 'DC', name_th: 'ควบคุมเอกสาร', status: 'ACTIVE' }
];

describe('VCC Phase 1 Frontend: Portal Access, Asset Tabs, Mandatory Reason, and API Errors', () => {
  beforeEach(() => {
    resetVccLocalStore();
    useStore.setState({
      departments: SAMPLE_MASTER_DEPTS,
      masterDepartments: SAMPLE_MASTER_DEPTS
    });
  });

  it('shows VCC card on PortalLandingPage strictly based on currentUser.isDcc (ignoring role)', () => {
    // 1. Role is DCC_ADMIN but isDcc flag is false -> MUST NOT show VCC
    useStore.setState({
      currentUser: { id: 'u-admin-no-dcc', name: 'แอดมินทั่วไป', department: 'IT', role: 'DCC_ADMIN', isDcc: false }
    });
    const { unmount } = render(
      <MemoryRouter>
        <PortalLandingPage />
      </MemoryRouter>
    );
    expect(screen.getByText('ระบบควบคุมเอกสาร (DCC)')).toBeInTheDocument();
    expect(screen.queryByText('VCC (Verify and Calibration Center)')).not.toBeInTheDocument();
    unmount();

    // 2. Role is GENERAL_USER but isDcc flag is true -> MUST show VCC
    useStore.setState({
      currentUser: { id: 'dc4', name: 'เจ้าหน้าที่ DCC', department: 'DC', role: 'GENERAL_USER', isDcc: true }
    });
    render(
      <MemoryRouter>
        <PortalLandingPage />
      </MemoryRouter>
    );
    expect(screen.getByText('VCC (Verify and Calibration Center)')).toBeInTheDocument();
  });

  it('strictly separates ACTIVE and RETIRED asset lists with no mixed statuses', async () => {
    useStore.setState({
      currentUser: { id: 'dc4', name: 'เจ้าหน้าที่ DCC', department: 'DC', isDcc: true }
    });

    render(
      <MemoryRouter>
        <AssetRegisterPage />
      </MemoryRouter>
    );

    // Initial load: ACTIVE tab
    await waitFor(() => {
      expect(screen.getByText('ST002')).toBeInTheDocument();
      expect(screen.getByText('SW001')).toBeInTheDocument();
    });
    // Retired items must never appear in ACTIVE tab
    expect(screen.queryByText('T-OLD-01')).not.toBeInTheDocument();

    // Switch to RETIRED tab
    fireEvent.click(screen.getByRole('tab', { name: /ปลดออกแล้ว \(RETIRED\)/i }));
    await waitFor(() => {
      expect(screen.getByText('T-OLD-01')).toBeInTheDocument();
    });
    // Active items must never appear in RETIRED tab
    expect(screen.queryByText('ST002')).not.toBeInTheDocument();
    expect(screen.queryByText('SW001')).not.toBeInTheDocument();
  });

  it('enforces mandatory reason for retire and reactivate buttons (disabled until reason is provided)', async () => {
    useStore.setState({
      currentUser: { id: 'dc4', name: 'เจ้าหน้าที่ DCC', department: 'DC', isDcc: true }
    });

    render(
      <MemoryRouter>
        <AssetRegisterPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('SW001')).toBeInTheDocument();
    });

    // 1. Open Retire Modal for SW001
    const sw001Row = screen.getByText('SW001').closest('tr');
    const retireBtn = within(sw001Row).getByRole('button', { name: /ปลดออก$/i });
    fireEvent.click(retireBtn);

    const submitRetireBtn = screen.getByRole('button', { name: /ยืนยันการปลดออก/i });
    // Button must be disabled initially when reason is empty
    expect(submitRetireBtn).toBeDisabled();

    // Type whitespace only -> still disabled
    const reasonInput = screen.getByPlaceholderText(/ระบุสาเหตุ เช่น ชำรุดไม่สามารถซ่อมได้/i);
    fireEvent.change(reasonInput, { target: { value: '   ' } });
    expect(submitRetireBtn).toBeDisabled();

    // Type valid reason -> button becomes enabled
    fireEvent.change(reasonInput, { target: { value: 'ยกเลิกจุดใช้งานเดิม' } });
    expect(submitRetireBtn).not.toBeDisabled();

    // Submit retire
    fireEvent.click(submitRetireBtn);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /ยืนยันการปลดออก/i })).not.toBeInTheDocument();
    });

    // SW001 should now be gone from ACTIVE tab
    expect(screen.queryByText('SW001')).not.toBeInTheDocument();

    // 2. Switch to RETIRED tab to test Reactivate
    fireEvent.click(screen.getByRole('tab', { name: /ปลดออกแล้ว \(RETIRED\)/i }));
    await waitFor(() => {
      expect(screen.getByText('SW001')).toBeInTheDocument();
    });

    const sw001RetiredRow = screen.getByText('SW001').closest('tr');
    const reactivateBtn = within(sw001RetiredRow).getByRole('button', { name: /นำกลับมาใช้/i });
    fireEvent.click(reactivateBtn);

    const submitReactivateBtn = screen.getByRole('button', { name: /ยืนยันการนำกลับมาใช้/i });
    // Button must be disabled initially
    expect(submitReactivateBtn).toBeDisabled();

    const reactivateReasonInput = screen.getByPlaceholderText(/ระบุสาเหตุ เช่น ซ่อมบำรุงและทวนสอบผ่านแล้ว/i);
    fireEvent.change(reactivateReasonInput, { target: { value: '   ' } });
    expect(submitReactivateBtn).toBeDisabled();

    // Fill reason -> becomes enabled
    fireEvent.change(reactivateReasonInput, { target: { value: 'จัดสรรให้จุดใช้งานใหม่' } });
    expect(submitReactivateBtn).not.toBeDisabled();

    // Submit reactivate
    fireEvent.click(submitReactivateBtn);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /ยืนยันการนำกลับมาใช้/i })).not.toBeInTheDocument();
    });

    // SW001 is now removed from RETIRED tab
    expect(screen.queryByText('SW001')).not.toBeInTheDocument();
  });

  it('displays API error message when adding an asset with duplicate asset code', async () => {
    useStore.setState({
      currentUser: { id: 'dc4', name: 'เจ้าหน้าที่ DCC', department: 'DC', isDcc: true }
    });

    render(
      <MemoryRouter>
        <AssetRegisterPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('ST002')).toBeInTheDocument();
    });

    // Click Add asset
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มเครื่องมือ/i }));

    // Fill form with already existing asset_code 'ST002'
    const codeInput = screen.getByPlaceholderText(/เช่น ST002, SW001, TC001/i);
    fireEvent.change(codeInput, { target: { value: 'ST002' } });

    const nameInput = screen.getByPlaceholderText(/ระบุชื่อเครื่องมือวัด/i);
    fireEvent.change(nameInput, { target: { value: 'เทอร์โมมิเตอร์ทดสอบรหัสซ้ำ' } });

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /บันทึกข้อมูล/i }));

    // Error alert banner must be displayed with API error message
    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent(/รหัสเครื่องมือ ST002 มีอยู่ในระบบแล้ว/i);
    });
  });

  it('enforces flat register model: hides legacy group management, blocks parent_id/is_group creation, and separates ACTIVE vs RETIRED tabs', async () => {
    useStore.setState({
      currentUser: { id: 'dc4', name: 'เจ้าหน้าที่ DCC', department: 'DC', isDcc: true }
    });

    // Reject creating Logical Groups or assigning parent_id in flat architecture
    await expect(
      createVccAsset({
        asset_code: 'GRP-NEW',
        name: 'กลุ่มต้องห้าม',
        asset_type: 'เครื่องชั่ง',
        department: 'WH',
        is_group: true
      })
    ).rejects.toThrow(/ยกเลิกการสร้างกลุ่มเครื่องมือแม่/i);

    await expect(
      createVccAsset({
        asset_code: 'SC-CHILD-ERR',
        name: 'ผูกกลุ่มแม่ต้องห้าม',
        asset_type: 'เครื่องชั่ง',
        department: 'WH',
        parent_id: 'vcc-seed-grp-scale'
      })
    ).rejects.toThrow(/ยกเลิกการผูกเครื่องมือ.*เข้ากับกลุ่มแม่/i);

    // Create flat instrument SC-WH-002 and retire it
    const asset2 = await createVccAsset({
      asset_code: 'SC-WH-002',
      name: '[ข้อมูลทดสอบ] เครื่องชั่งดิจิทัล จุดรับวัตถุดิบ 2 (ชำรุด)',
      asset_type: 'เครื่องชั่ง',
      department: 'WH'
    });
    await retireVccAsset(asset2.id, 'โหลดเซลล์เสีย');

    render(
      <MemoryRouter>
        <AssetRegisterPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('SC-WH-001')).toBeInTheDocument();
    });

    // Legacy "จัดการกลุ่มเครื่องมือ" button must NOT appear even for DCC
    expect(screen.queryByRole('button', { name: /จัดการกลุ่มเครื่องมือ/i })).not.toBeInTheDocument();

    // ACTIVE tab shows SC-WH-001 and never SC-WH-002
    expect(screen.queryByText('SC-WH-002')).not.toBeInTheDocument();

    // Switch to RETIRED tab -> shows SC-WH-002 and never SC-WH-001
    fireEvent.click(screen.getByRole('tab', { name: /ปลดออกแล้ว \(RETIRED\)/i }));
    await waitFor(() => {
      expect(screen.getByText('SC-WH-002')).toBeInTheDocument();
    });
    expect(screen.queryByText('SC-WH-001')).not.toBeInTheDocument();
  });

  it('shows error message and disables save button when Master Data departments cannot be loaded', async () => {
    useStore.setState({
      currentUser: { id: 'dc4', name: 'เจ้าหน้าที่ DCC', department: 'DC', isDcc: true },
      departments: [],
      masterDepartments: []
    });

    render(
      <MemoryRouter>
        <AssetRegisterPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('ST002')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /เพิ่มเครื่องมือ/i }));

    // Must display message that Master Data departments could not be loaded
    expect(screen.getByText(/ไม่สามารถโหลดแผนกจาก Master Data ได้/i)).toBeInTheDocument();

    // Even after filling code and name, save button must remain disabled
    fireEvent.change(screen.getByPlaceholderText(/เช่น ST002, SW001, TC001/i), {
      target: { value: 'NEW-001' }
    });
    fireEvent.change(screen.getByPlaceholderText(/ระบุชื่อเครื่องมือวัด/i), {
      target: { value: 'เครื่องมือทดสอบไม่มีแผนก' }
    });

    const saveBtn = screen.getByRole('button', { name: /บันทึกข้อมูล/i });
    expect(saveBtn).toBeDisabled();
  });
});
