import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { resetVccLocalStore, createVccAsset, fetchVccAssets } from '../api/vccApi';

const SAMPLE_MASTER_DEPTS = [
  { code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' },
  { code: 'WH', name_th: 'คลังสินค้า', status: 'ACTIVE' },
  { code: 'DC', name_th: 'ควบคุมเอกสาร', status: 'ACTIVE' }
];

describe('VCC Instrument-Centric Architecture: Flat Table, Option B, Category Chips, and Logical Group Admin', () => {
  beforeEach(() => {
    resetVccLocalStore();
    useStore.setState({
      departments: SAMPLE_MASTER_DEPTS,
      masterDepartments: SAMPLE_MASTER_DEPTS,
      currentUser: { id: 'dc4', name: 'เจ้าหน้าที่ DCC', department: 'DC', isDcc: true }
    });
  });

  it('1. Flat Table displays only Calibratable Units and excludes Logical Groups from main rows', async () => {
    render(
      <MemoryRouter>
        <AssetRegisterPage />
      </MemoryRouter>
    );

    // Real calibratable instruments must appear as rows in the table
    await waitFor(() => {
      expect(screen.getByText('ST002')).toBeInTheDocument();
      expect(screen.getByText('SW001')).toBeInTheDocument();
      expect(screen.getByText('SC-WH-001')).toBeInTheDocument();
    });

    // Logical group container (GRP-SCALE) must NEVER appear as a table row in the flat registry
    const table = screen.getByRole('table');
    expect(within(table).queryByText('GRP-SCALE')).not.toBeInTheDocument();
  });

  it('2. Option B: Table row shows NO parent badge, Composite Set has badge, and group relation is in detail modal', async () => {
    render(
      <MemoryRouter>
        <AssetRegisterPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('SW001')).toBeInTheDocument();
      expect(screen.getByText('SC-WH-001')).toBeInTheDocument();
    });

    // 2a. Composite Set (SW001) displays Composite Set badge
    const sw001Row = screen.getByText('SW001').closest('tr');
    expect(within(sw001Row).getByText(/ชุดเครื่องมือ \(Composite Set\)/i)).toBeInTheDocument();

    // 2b. Child instrument (SC-WH-001) follows Option B: NO parent badge in table row
    const scRow = screen.getByText('SC-WH-001').closest('tr');
    expect(within(scRow).queryByText(/อยู่ในกลุ่ม/i)).not.toBeInTheDocument();
    expect(within(scRow).queryByText(/GRP-SCALE/i)).not.toBeInTheDocument();

    // 2c. Group relationship is visible inside the History / Detail modal
    fireEvent.click(within(scRow).getByRole('button', { name: /ประวัติ/i }));
    await waitFor(() => {
      expect(screen.getByText(/กลุ่มเครื่องมือที่สังกัด/i)).toBeInTheDocument();
      expect(screen.getByText('GRP-SCALE')).toBeInTheDocument();
    });
  });

  it('3. Category Overview chips filter instruments by category with live counts', async () => {
    render(
      <MemoryRouter>
        <AssetRegisterPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('ST002')).toBeInTheDocument();
      expect(screen.getByText('SW001')).toBeInTheDocument();
    });

    // Look for category chip "เทอร์โมมิเตอร์"
    const thermoChip = screen.getByRole('button', { name: /เทอร์โมมิเตอร์/i });
    expect(thermoChip).toBeInTheDocument();

    // Click "เทอร์โมมิเตอร์" chip
    fireEvent.click(thermoChip);

    // Only Thermometers should be visible (ST002, TC001)
    expect(screen.getByText('ST002')).toBeInTheDocument();
    expect(screen.queryByText('SW001')).not.toBeInTheDocument(); // SW001 is ชุดตุ้มน้ำหนัก

    // Click "ทุกประเภท" to reset filter
    const allChip = screen.getByRole('button', { name: /ทุกประเภท/i });
    fireEvent.click(allChip);

    // Both appear again
    expect(screen.getByText('ST002')).toBeInTheDocument();
    expect(screen.getByText('SW001')).toBeInTheDocument();
  });

  it('4. DCC Logical Group Admin Modal is restricted to DCC and allows managing logical groups', async () => {
    // 4a. Check DCC button visibility for DCC user
    const { unmount } = render(
      <MemoryRouter>
        <AssetRegisterPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /จัดการกลุ่มเครื่องมือ/i })).toBeInTheDocument();
    });

    // Click "จัดการกลุ่มเครื่องมือ"
    fireEvent.click(screen.getByRole('button', { name: /จัดการกลุ่มเครื่องมือ/i }));

    // Modal opens with Logical Group Admin title
    await waitFor(() => {
      expect(screen.getByText(/จัดการกลุ่มเครื่องมือเชิงตรรกะ \(Logical Group Admin\)/i)).toBeInTheDocument();
      expect(screen.getByText('GRP-SCALE')).toBeInTheDocument();
    });

    // Close modal
    fireEvent.click(screen.getByTitle('ปิด'));
    unmount();

    // 4b. Non-DCC user must NOT see "จัดการกลุ่มเครื่องมือ" button
    useStore.setState({
      currentUser: { id: 'qc1', name: 'เจ้าหน้าที่ QC ทั่วไป', department: 'QC', isDcc: false }
    });

    render(
      <MemoryRouter>
        <AssetRegisterPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('ST002')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /จัดการกลุ่มเครื่องมือ/i })).not.toBeInTheDocument();
  });

  it('5. Supports creating a Composite Set as 1 Calibratable Unit', async () => {
    render(
      <MemoryRouter>
        <AssetRegisterPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('ST002')).toBeInTheDocument();
    });

    // Click "เพิ่มเครื่องมือ"
    fireEvent.click(screen.getByRole('button', { name: /^เพิ่มเครื่องมือ$/i }));

    // Modal title
    expect(screen.getByText(/เพิ่มเครื่องมือวัดใหม่/i)).toBeInTheDocument();

    // Fill form for new composite set
    fireEvent.change(screen.getByPlaceholderText(/เช่น ST002, SW001, TC001/i), {
      target: { value: 'SET-GAUGE-01' }
    });
    fireEvent.change(screen.getByPlaceholderText(/ระบุชื่อเครื่องมือวัด/i), {
      target: { value: 'ชุดบล็อกเกจมาตรฐาน Class 0' }
    });
    fireEvent.change(screen.getByPlaceholderText(/เช่น Testo 176T4/i), {
      target: { value: 'ชุด 47 ชิ้น' }
    });

    // Select "ชุดเครื่องมือจริง (Composite Set)"
    const compositeRadio = screen.getByLabelText(/ชุดเครื่องมือจริง \(Composite Set/i);
    fireEvent.click(compositeRadio);

    // Save asset
    fireEvent.click(screen.getByRole('button', { name: /บันทึกข้อมูล/i }));

    // Should appear in table as a Calibratable Unit with Composite Set badge
    await waitFor(() => {
      expect(screen.getByText('SET-GAUGE-01')).toBeInTheDocument();
    });
    const setRow = screen.getByText('SET-GAUGE-01').closest('tr');
    expect(within(setRow).getByText(/ชุดเครื่องมือ \(Composite Set\)/i)).toBeInTheDocument();
  });
});
