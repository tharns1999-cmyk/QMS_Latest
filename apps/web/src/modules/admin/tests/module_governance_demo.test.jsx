import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ModuleGovernancePage from '../pages/ModuleGovernancePage';
import { apiGet, apiPut } from '../../../api/client';

vi.mock('../../../api/client', () => ({
  isApiMode: false,
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn()
}));

describe('Module Governance in Demo Mode (Local Storage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('clearly identifies demo mode and never pretends to enforce or save backend governance', () => {
    render(
      <MemoryRouter>
        <ModuleGovernancePage />
      </MemoryRouter>
    );
    expect(screen.getByRole('status')).toHaveTextContent('โหมดสาธิต');
    expect(screen.queryByRole('button', { name: 'ตรวจผลกระทบ' })).not.toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
    expect(apiPut).not.toHaveBeenCalled();
  });

  it('renders full Enterprise UI in demo mode with Section 1 (Module Status) and Section 2 (Department Access Matrix)', () => {
    render(
      <MemoryRouter>
        <ModuleGovernancePage />
      </MemoryRouter>
    );

    // Section 1: Module Status Control
    expect(screen.getByText('ระบบควบคุมเอกสาร · DCC')).toBeVisible();
    expect(screen.getByText('รักษาการทำงานเดิม การควบคุมสถานะ DCC ยังไม่เปิดในหน้านี้')).toBeVisible();
    expect(screen.getByText('ศูนย์ทวนสอบและสอบเทียบ · VCC')).toBeVisible();
    expect(screen.getByLabelText('เปลี่ยนสถานะ')).toHaveValue('ACTIVE');
    expect(screen.getByLabelText('ข้อความแจ้งผู้ใช้งาน')).toBeInTheDocument();

    // Section 2: Department Access Matrix
    expect(screen.getByText('การเปิดรับงานของแผนก')).toBeVisible();
    expect(screen.getByLabelText('แสดงแผนก')).toHaveValue('enabled');
    expect(screen.getAllByRole('button', { name: 'บันทึกการตั้งค่า (Save Changes)' })[0]).toBeVisible();

    // Shows enabled departments by default
    expect(screen.getByText(/QC ·/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'ตั้งค่า QC' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'ปิดรับงานใหม่' }).length).toBeGreaterThan(0);
  });

  it('allows toggling departments and persists to localStorage and store in demo mode', () => {
    render(
      <MemoryRouter>
        <ModuleGovernancePage />
      </MemoryRouter>
    );

    // 1. Toggle QC from enabled to disabled
    const qcHeading = screen.getByText(/QC ·/);
    const qcRow = qcHeading.closest('li');
    const toggleQcBtn = within(qcRow).getByRole('button', { name: 'ปิดรับงานใหม่' });
    fireEvent.click(toggleQcBtn);

    let storedEnabled = JSON.parse(localStorage.getItem('qms_vcc_enabled_departments') || '[]');
    expect(storedEnabled.includes('QC')).toBe(false);
    expect(screen.getByText(/ปรับเปลี่ยนสิทธิ์การเข้าใช้งานของแผนก QC/)).toBeVisible();

    // 2. Switch to disabled filter - QC is now there and ready to be re-enabled
    fireEvent.change(screen.getByLabelText('แสดงแผนก'), { target: { value: 'disabled' } });
    const qcDisabledHeading = screen.getByText(/QC ·/);
    const qcDisabledRow = qcDisabledHeading.closest('li');
    const reEnableQcBtn = within(qcDisabledRow).getByRole('button', { name: 'เปิดรับงานใหม่' });
    fireEvent.click(reEnableQcBtn);

    storedEnabled = JSON.parse(localStorage.getItem('qms_vcc_enabled_departments') || '[]');
    expect(storedEnabled.includes('QC')).toBe(true);
  });

  it('allows saving module status changes in demo mode', () => {
    render(
      <MemoryRouter>
        <ModuleGovernancePage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('เปลี่ยนสถานะ'), { target: { value: 'READ_ONLY' } });
    const saveBtn = screen.getAllByRole('button', { name: 'บันทึกการตั้งค่า (Save Changes)' })[0];
    fireEvent.click(saveBtn);

    expect(localStorage.getItem('qms_vcc_module_status')).toBe('READ_ONLY');
    expect(screen.getByText(/บันทึกสถานะโมดูล VCC เป็น "อ่านอย่างเดียว" สำเร็จ/)).toBeVisible();
  });
});
