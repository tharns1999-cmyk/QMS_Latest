import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import MasterDataHub from '../pages/Admin/MasterDataHub';

describe('MasterDataHub Tab 4: Searchable Department Autocomplete & Compact Toolbar Tests', () => {
  const adminUser = {
    id: 'U001',
    name: 'Admin QA (DCC)',
    department: 'QA',
    role: 'DCC_ADMIN',
    level: 1,
    isDcc: true
  };

  const sampleStations = [
    {
      id: 'PD-OFFICE',
      departmentId: 'PD',
      department: 'PD',
      name: 'PD Head Office (จุดคุมงานหลัก Master)',
      code: 'PD-OFFICE',
      isMasterOffice: true,
      description: 'สำนักงานฝ่ายผลิต'
    },
    {
      id: 'PD-L1',
      departmentId: 'PD',
      department: 'PD',
      name: 'Line 1 - Mixing (ห้องผสม)',
      code: 'PD-L1',
      description: 'ห้องผสมและเตรียมวัตถุดิบไลน์ 1'
    },
    {
      id: 'QA-OFFICE',
      departmentId: 'QA',
      department: 'QA',
      name: 'QA Head Office (จุดคุมงานหลัก Master)',
      code: 'QA-OFFICE',
      isMasterOffice: true,
      description: 'สำนักงานฝ่ายประกันคุณภาพ'
    },
    {
      id: 'EN-OFFICE',
      departmentId: 'EN',
      department: 'EN',
      name: 'EN Workshop (จุดคุมงานหลัก Master)',
      code: 'EN-OFFICE',
      isMasterOffice: true,
      description: 'สำนักงานฝ่ายวิศวกรรม'
    }
  ];

  const sampleDepts = [
    { id: 'PD', nameTh: 'ฝ่ายผลิต', nameEn: 'Production', headName: 'มนัสวีร์ ขจรศักดิ์' },
    { id: 'QA', nameTh: 'ฝ่ายประกันและควบคุมคุณภาพ', nameEn: 'Quality Assurance', headName: 'ธนาวุฒิ สมควรกิจดำรง' },
    { id: 'EN', nameTh: 'ฝ่ายวิศวกรรม', nameEn: 'Engineering', headName: 'วิศวกรรมการผลิต' }
  ];

  beforeEach(() => {
    useStore.setState({
      currentUser: adminUser,
      masterUsers: [adminUser],
      masterDepartments: sampleDepts,
      distributionLocations: sampleStations,
      controlledCopyInstances: []
    });
  });

  const renderTab4 = () => {
    render(
      <MemoryRouter>
        <MasterDataHub />
      </MemoryRouter>
    );

    const tabBtn = screen.getByText(/4\. จุดใช้งานและไลน์ผลิต/i);
    fireEvent.click(tabBtn);
  };

  it('1. Renders Tab 4 with unified toolbar and default "ทุกแผนก (All Departments)"', () => {
    renderTab4();

    // Verify unified toolbar elements
    expect(screen.getByPlaceholderText(/ค้นหาชื่อจุดใช้งาน, รหัสสถานี/i)).toBeInTheDocument();
    expect(screen.getByText('ทุกแผนก (All Depts)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /เพิ่มจุดใช้งานใหม่/i })).toBeInTheDocument();
    expect(screen.getByTestId('station-count-badge')).toHaveTextContent('พบ 4 / 4 จุด');

    // Verify all stations render in table
    expect(screen.getByText('Line 1 - Mixing (ห้องผสม)')).toBeInTheDocument();
    expect(screen.getByText('QA Head Office (จุดคุมงานหลัก Master)')).toBeInTheDocument();
  });

  it('2. Free-text search filters stations in real-time and clear button resets query', () => {
    renderTab4();

    const searchInput = screen.getByPlaceholderText(/ค้นหาชื่อจุดใช้งาน, รหัสสถานี/i);
    fireEvent.change(searchInput, { target: { value: 'Mixing' } });

    // Only PD-L1 Mixing is visible
    expect(screen.getByText('Line 1 - Mixing (ห้องผสม)')).toBeInTheDocument();
    expect(screen.queryByText('QA Head Office (จุดคุมงานหลัก Master)')).not.toBeInTheDocument();
    expect(screen.getByTestId('station-count-badge')).toHaveTextContent('พบ 1 / 4 จุด');

    // Click clear search (X) button
    const clearBtn = screen.getByTitle('ล้างคำค้นหา');
    fireEvent.click(clearBtn);

    expect(searchInput.value).toBe('');
    expect(screen.getByText('QA Head Office (จุดคุมงานหลัก Master)')).toBeInTheDocument();
    expect(screen.getByTestId('station-count-badge')).toHaveTextContent('พบ 4 / 4 จุด');
  });

  it('3. Department combobox opens autocomplete dropdown and filters departments', () => {
    renderTab4();

    const deptTrigger = screen.getByText('ทุกแผนก (All Depts)');
    fireEvent.click(deptTrigger);

    // Dropdown is open with internal search field
    const deptSearchInput = screen.getByPlaceholderText(/พิมพ์ค้นหาชื่อ\/รหัสแผนก/i);
    expect(deptSearchInput).toBeInTheDocument();

    // Verify station counts on options
    expect(screen.getByText('2 จุด')).toBeInTheDocument(); // PD has 2 stations

    // Search for 'วิศว' (EN) in dropdown
    fireEvent.change(deptSearchInput, { target: { value: 'วิศว' } });
    expect(screen.getByText('ฝ่ายวิศวกรรม')).toBeInTheDocument();
    expect(screen.queryByText('ฝ่ายประกันและควบคุมคุณภาพ')).not.toBeInTheDocument();
  });

  it('4. Selecting a department filters table and displays clear filters button', () => {
    renderTab4();

    // Open combobox
    const deptTrigger = screen.getByText('ทุกแผนก (All Depts)');
    fireEvent.click(deptTrigger);

    // Click QA option
    const qaOption = screen.getByText('ฝ่ายประกันและควบคุมคุณภาพ');
    fireEvent.click(qaOption);

    // Check table has only QA station
    expect(screen.getByText('QA Head Office (จุดคุมงานหลัก Master)')).toBeInTheDocument();
    expect(screen.queryByText('Line 1 - Mixing (ห้องผสม)')).not.toBeInTheDocument();
    expect(screen.getByTestId('station-count-badge')).toHaveTextContent('พบ 1 / 4 จุด');

    // Clear filters button appears
    const clearFiltersBtn = screen.getByRole('button', { name: /ล้างตัวกรอง/i });
    expect(clearFiltersBtn).toBeInTheDocument();

    // Click Clear filters
    fireEvent.click(clearFiltersBtn);

    // Back to ALL
    expect(screen.getByText('ทุกแผนก (All Depts)')).toBeInTheDocument();
    expect(screen.getByText('Line 1 - Mixing (ห้องผสม)')).toBeInTheDocument();
    expect(screen.getByText('QA Head Office (จุดคุมงานหลัก Master)')).toBeInTheDocument();
  });

  it('5. Renders empty state when search finds no stations and offers quick reset button', () => {
    renderTab4();

    const searchInput = screen.getByPlaceholderText(/ค้นหาชื่อจุดใช้งาน, รหัสสถานี/i);
    fireEvent.change(searchInput, { target: { value: 'Nonexistent Station 999' } });

    expect(screen.getByText('ไม่พบจุดใช้งานตรงตามเงื่อนไขที่ค้นหา')).toBeInTheDocument();
    const resetAllBtn = screen.getByRole('button', { name: /ล้างตัวกรองทั้งหมด/i });
    fireEvent.click(resetAllBtn);

    expect(searchInput.value).toBe('');
    expect(screen.getByText('Line 1 - Mixing (ห้องผสม)')).toBeInTheDocument();
  });
});
