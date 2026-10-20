import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Library from '../pages/Library/Library';
import useStore from '../../../store/useStore';

describe('Immutable Document Revision History, Persistent Obsolete/Superseded Library Retention', () => {

  const qaUser = {
    id: 'U-QA-001',
    name: 'Somchai QA',
    department: 'QA',
    depts: ['QA'],
    role: 'DEPT_ADMIN',
    level: 4,
    isDcc: false
  };

  const pdUser = {
    id: 'U-PD-001',
    name: 'Somying PD',
    department: 'PD',
    depts: ['PD'],
    role: 'DEPT_ADMIN',
    level: 4,
    isDcc: false
  };

  const dccUser = {
    id: 'U-DCC-001',
    name: 'Admin DCC',
    department: 'DCC',
    depts: ['DCC'],
    role: 'DCC_ADMIN',
    level: 5,
    isDcc: true
  };

  const testDocuments = [
    // Scenario 1: Obsolete Document
    {
      id: 'doc-qa-obs',
      title: 'SOP-QA-01',
      name: 'QA Old Procedure',
      status: 'OBSOLETE',
      department: 'QA',
      owner_dept: 'QA',
      rev: '01',
      effectiveDate: '2023-01-01',
      access_control: { scope: 'DEPT_ONLY' }
    },
    // Scenario 2: Superseded Document
    {
      id: 'doc-pd-sup',
      title: 'SOP-PD-01',
      name: 'PD Old Procedure',
      status: 'SUPERSEDED_ARCHIVED',
      department: 'PD',
      owner_dept: 'PD',
      rev: '00',
      effectiveDate: '2023-01-01',
      access_control: { scope: 'GENERAL' }
    },
    // Active Docs
    {
      id: 'doc-qa-act',
      title: 'SOP-QA-02',
      name: 'QA New Procedure',
      status: 'EFFECTIVE',
      department: 'QA',
      owner_dept: 'QA',
      rev: '00',
      effectiveDate: '2026-01-01',
      access_control: { scope: 'DEPT_ONLY' }
    }
  ];

  beforeEach(() => {
    useStore.setState({
      currentUser: qaUser,
      documents: testDocuments,
      masterDepartments: [
        { id: 'QA', name: 'Quality Assurance', nameTh: 'ประกันคุณภาพ' },
        { id: 'PD', name: 'Production', nameTh: 'ฝ่ายผลิต' }
      ]
    });
  });

  it('Scenario 1 (Obsolete Document Visibility): QA user sees SOP-QA-01 under Obsolete tab in My Dept', () => {
    useStore.setState({ currentUser: qaUser });
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    // Switch to "เอกสารในแผนกฉัน"
    fireEvent.click(screen.getByRole('button', { name: /เอกสารในแผนกฉัน/i }));

    // Click "ยกเลิกการใช้งาน (Obsolete)" tab
    fireEvent.click(screen.getByRole('button', { name: /ยกเลิกการใช้งาน/i }));

    // Must find SOP-QA-01
    expect(screen.getByText('SOP-QA-01')).toBeInTheDocument();
    expect(screen.getByText('ยกเลิกถาวร')).toBeInTheDocument();
  });

  it('Scenario 2 (Superseded Revision Visibility): PD user sees SOP-PD-01 Rev.00 under Superseded tab in My Dept', () => {
    useStore.setState({ currentUser: pdUser });
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    // Switch to "เอกสารในแผนกฉัน"
    fireEvent.click(screen.getByRole('button', { name: /เอกสารในแผนกฉัน/i }));

    // Click "ฉบับเดิมตกรุ่น (Superseded)" tab
    fireEvent.click(screen.getByRole('button', { name: /ฉบับเดิมตกรุ่น/i }));

    // Must find SOP-PD-01
    expect(screen.getByText('SOP-PD-01')).toBeInTheDocument();
    expect(screen.getAllByText(/ฉบับตกรุ่น/i).length).toBeGreaterThan(0);
  });

  it('Scenario 3 (Discrete Status Tabs & No All Records): Tab bar renders strictly 3 status tabs and no All Records', () => {
    useStore.setState({ currentUser: dccUser });
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    // Verify "ทั้งหมด (All Records)" tab is permanently removed
    expect(screen.queryByRole('button', { name: /ทั้งหมด \(All Records\)/i })).not.toBeInTheDocument();

    // Verify exactly 3 status tabs exist
    expect(screen.getByRole('button', { name: /มีผลบังคับใช้/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ฉบับเดิมตกรุ่น/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ยกเลิกการใช้งาน/i })).toBeInTheDocument();
  });
});
