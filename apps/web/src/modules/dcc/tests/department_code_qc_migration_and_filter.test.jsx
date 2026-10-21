import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import useStore, { MASTER_DATA_USER, MASTER_DEPARTMENTS } from '../../../store/useStore';
import MasterDataHub from '../pages/Admin/MasterDataHub';
import MasterDocsList from '../pages/MasterDocs/MasterDocsList';
import Library from '../pages/Library/Library';
import { isMyDepartment } from '../services/darService';

describe('Department Code QC Drift Resolution & Multi-Department Filter Blueprint', () => {
  beforeEach(() => {
    useStore.getState().resetStore();
  });

  it('1. Initial Seed Data & User Profile: Beam (EMP-005) holds department QC without QA/QC residue', () => {
    const beamUser = MASTER_DATA_USER.find(u => u.id === 'U005' || u.empId === 'EMP-005');
    expect(beamUser).toBeDefined();
    expect(beamUser.department).toBe('QC');
    expect(beamUser.primary_department).toBe('QC');
    expect(beamUser.departments).toContain('QC');
    expect(beamUser.affiliated_departments).toContain('QC');
    expect(beamUser.depts).toContain('QC');
    expect(beamUser.department).not.toContain('QA/QC');

    const qcDept = MASTER_DEPARTMENTS.find(d => d.id === 'QC');
    expect(qcDept).toBeDefined();
    expect(qcDept.code).toBe('QC');
    expect(qcDept.nameTh).toBe('ฝ่ายประกันและควบคุมคุณภาพ');
  });

  it('2. User Profile Edit Form: Beam shows QC - ฝ่ายประกันและควบคุมคุณภาพ and secondary dropdown filters out QC', () => {
    const beamUser = MASTER_DATA_USER.find(u => u.id === 'U005');
    useStore.setState({
      currentUser: { ...beamUser, role: 'DCC_ADMIN', isDcc: true },
      masterUsers: MASTER_DATA_USER
    });

    render(
      <MemoryRouter>
        <MasterDataHub />
      </MemoryRouter>
    );

    // Find Beam in the user table and click edit
    const userRows = screen.getAllByRole('row');
    const beamRow = userRows.find(row => within(row).queryByText(/EMP-005/i) || within(row).queryByText(/บีม/i));
    expect(beamRow).toBeDefined();

    const editBtn = within(beamRow).getByTitle('แก้ไขข้อมูลผู้ใช้');
    fireEvent.click(editBtn);

    // Modal is open
    expect(screen.getByText('แก้ไขข้อมูลผู้ใช้งาน')).toBeInTheDocument();

    // Primary department tag displays "QC - ฝ่ายประกันและควบคุมคุณภาพ" with ⭐ badge
    expect(screen.getByText(/⭐ แผนกหลัก/i)).toBeInTheDocument();
    expect(screen.getAllByText(/QC - ฝ่ายประกันและควบคุมคุณภาพ/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/QA\/QC - ฝ่ายประกันและควบคุมคุณภาพ/i)).not.toBeInTheDocument();

    // Dropdown for adding secondary department MUST NOT contain QC option
    const addDeptSelect = screen.getByLabelText(/เพิ่มแผนกที่สังกัดร่วม/i);
    const options = within(addDeptSelect).getAllByRole('option');
    const optionValues = options.map(o => o.value);
    expect(optionValues).not.toContain('QC');
    expect(optionValues).not.toContain('QA/QC');
  });

  it('3. isMyDepartment correctly handles Multi-Department and Bidirectional Alias Equivalence', () => {
    const beamUser = {
      id: 'U005',
      name: 'บีม',
      department: 'QC',
      primaryDepartment: 'QC',
      departments: ['QC'],
      affiliated_departments: ['QC']
    };

    const multiDeptUser = {
      id: 'U-MULTI',
      name: 'สมชาย',
      department: 'PD',
      primaryDepartment: 'PD',
      departments: ['PD', 'QC'],
      affiliated_departments: ['PD', 'QC']
    };

    // Exact and doc code extraction
    expect(isMyDepartment('QC', beamUser)).toBe(true);
    expect(isMyDepartment('SOP-QC-01', beamUser)).toBe(true);
    expect(isMyDepartment('QC - ฝ่ายประกันและควบคุมคุณภาพ', beamUser)).toBe(true);

    // Multi-department membership
    expect(isMyDepartment('QC', multiDeptUser)).toBe(true);
    expect(isMyDepartment('PD', multiDeptUser)).toBe(true);
    expect(isMyDepartment('EN', multiDeptUser)).toBe(false);

    // Bidirectional alias equivalence
    expect(isMyDepartment('QC', 'QA/QC')).toBe(true);
    expect(isMyDepartment('QC', 'QA')).toBe(false); // QA is its own department
    expect(isMyDepartment('QC', 'บีม (QC)')).toBe(true);
    expect(isMyDepartment('QA/QC', 'QC')).toBe(true);
    expect(isMyDepartment('QC', 'PD')).toBe(false);
  });

  it('4. MasterDocsList: Document SOP-QC-01 displays in "ในแผนกฉัน" tab for Beam', () => {
    const beamUser = MASTER_DATA_USER.find(u => u.id === 'U005');
    const sampleDoc = {
      id: 'doc-qc-01',
      docNo: 'SOP-QC-01',
      code: 'SOP-QC-01',
      title: 'ระเบียบปฏิบัติงานการควบคุมคุณภาพ',
      name: 'ระเบียบปฏิบัติงานการควบคุมคุณภาพ',
      department: 'QC',
      departmentName: 'ฝ่ายประกันและควบคุมคุณภาพ',
      owner_dept: 'QC',
      status: 'ACTIVE',
      is_active: true
    };

    useStore.setState({
      currentUser: beamUser,
      masterDocuments: [sampleDoc],
      documents: [sampleDoc]
    });

    render(
      <MemoryRouter>
        <MasterDocsList />
      </MemoryRouter>
    );

    // Click "ในแผนกฉัน" tab
    const myDeptTab = screen.getByRole('button', { name: /ในแผนกฉัน/i });
    fireEvent.click(myDeptTab);

    expect(screen.getByText('SOP-QC-01')).toBeInTheDocument();
    expect(screen.getByText('ระเบียบปฏิบัติงานการควบคุมคุณภาพ')).toBeInTheDocument();
  });

  it('5. Library: SOP-QC-01 displays in "ในแผนกฉัน" for Beam', () => {
    const beamUser = MASTER_DATA_USER.find(u => u.id === 'U005');
    const sampleDoc = {
      id: 'doc-qc-01',
      docNo: 'SOP-QC-01',
      code: 'SOP-QC-01',
      title: 'ระเบียบปฏิบัติงานการควบคุมคุณภาพ',
      name: 'ระเบียบปฏิบัติงานการควบคุมคุณภาพ',
      department: 'QC',
      owner_dept: 'QC',
      status: 'EFFECTIVE',
      is_active: true
    };

    useStore.setState({
      currentUser: beamUser,
      documents: [sampleDoc],
      masterDocuments: [sampleDoc]
    });

    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    // Switch to "ในแผนกฉัน" tab
    const myDeptBtn = screen.getByRole('button', { name: /ในแผนกฉัน/i });
    fireEvent.click(myDeptBtn);

    expect(screen.getAllByText(/SOP-QC-01/i).length).toBeGreaterThanOrEqual(1);
  });
});
