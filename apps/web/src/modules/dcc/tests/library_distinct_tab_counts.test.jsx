/**
 * @file library_distinct_tab_counts.test.jsx
 * @description Unit and Integration tests verifying distinct master document code counting
 * in Library tab badges and summary counter (1 Document Code = 1 Count, regardless of revision count).
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Library from '../pages/Library/Library';
import useStore from '../../../store/useStore';
import { ACCESS_SCOPES } from '../utils/accessControl';

describe('Library Distinct Master Document Tab Counts & Summary Counter Tests', () => {

  const pdUser = {
    id: 'U-PD-001',
    name: 'Somchai Prasert',
    department: 'PD',
    depts: ['PD'],
    role: 'DEPT_ADMIN',
    level: 4,
    isDcc: false
  };

  const testDocuments = [
    // SOP-PD-01: 4 Obsolete revisions (Rev.00, Rev.01, Rev.02, Rev.03)
    {
      id: 'doc-sop-pd-01-r00',
      document_code: 'SOP-PD-01',
      title: 'SOP-PD-01',
      name: 'Procedure 1 Rev 00',
      status: 'OBSOLETE',
      department: 'PD',
      owner_dept: 'PD',
      rev: '00',
      access_control: { scope: ACCESS_SCOPES.DEPT_ONLY }
    },
    {
      id: 'doc-sop-pd-01-r01',
      document_code: 'SOP-PD-01',
      title: 'SOP-PD-01',
      name: 'Procedure 1 Rev 01',
      status: 'OBSOLETE',
      department: 'PD',
      owner_dept: 'PD',
      rev: '01',
      access_control: { scope: ACCESS_SCOPES.DEPT_ONLY }
    },
    {
      id: 'doc-sop-pd-01-r02',
      document_code: 'SOP-PD-01',
      title: 'SOP-PD-01',
      name: 'Procedure 1 Rev 02',
      status: 'OBSOLETE',
      department: 'PD',
      owner_dept: 'PD',
      rev: '02',
      access_control: { scope: ACCESS_SCOPES.DEPT_ONLY }
    },
    {
      id: 'doc-sop-pd-01-r03',
      document_code: 'SOP-PD-01',
      title: 'SOP-PD-01',
      name: 'Procedure 1 Rev 03',
      status: 'OBSOLETE',
      department: 'PD',
      owner_dept: 'PD',
      rev: '03',
      access_control: { scope: ACCESS_SCOPES.DEPT_ONLY }
    },
    // WI-PD-02: 1 Obsolete revision
    {
      id: 'doc-wi-pd-02-r00',
      document_code: 'WI-PD-02',
      title: 'WI-PD-02',
      name: 'Work Instruction 2',
      status: 'OBSOLETE',
      department: 'PD',
      owner_dept: 'PD',
      rev: '00',
      access_control: { scope: ACCESS_SCOPES.DEPT_ONLY }
    },
    // SOP-PD-03: Active doc with 2 Superseded historical revisions
    {
      id: 'doc-sop-pd-03-act',
      document_code: 'SOP-PD-03',
      title: 'SOP-PD-03',
      name: 'Procedure 3 Active',
      status: 'EFFECTIVE',
      department: 'PD',
      owner_dept: 'PD',
      rev: '02',
      access_control: { scope: ACCESS_SCOPES.DEPT_ONLY }
    },
    {
      id: 'doc-sop-pd-03-sup1',
      document_code: 'SOP-PD-03',
      title: 'SOP-PD-03',
      name: 'Procedure 3 Super 1',
      status: 'SUPERSEDED_ARCHIVED',
      department: 'PD',
      owner_dept: 'PD',
      rev: '01',
      access_control: { scope: ACCESS_SCOPES.DEPT_ONLY }
    },
    {
      id: 'doc-sop-pd-03-sup2',
      document_code: 'SOP-PD-03',
      title: 'SOP-PD-03',
      name: 'Procedure 3 Super 0',
      status: 'SUPERSEDED_ARCHIVED',
      department: 'PD',
      owner_dept: 'PD',
      rev: '00',
      access_control: { scope: ACCESS_SCOPES.DEPT_ONLY }
    }
  ];

  beforeEach(() => {
    useStore.setState({
      currentUser: pdUser,
      documents: testDocuments,
      masterDepartments: [{ id: 'PD', name: 'Production', nameTh: 'ฝ่ายผลิต' }]
    });
  });

  it('counts distinct document codes in tab badges instead of flat raw record count', () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    // Switch to "เอกสารในแผนกฉัน"
    fireEvent.click(screen.getByRole('button', { name: /เอกสารในแผนกฉัน/i }));

    // Obsolete tab button should display badge '2' (SOP-PD-01 and WI-PD-02), NOT '5'
    const obsoleteBtn = screen.getByRole('button', { name: /ยกเลิกถาวร/i });
    expect(obsoleteBtn).toHaveTextContent('2');
    expect(obsoleteBtn).not.toHaveTextContent('5');

    // Superseded tab button should display badge '1' (SOP-PD-03), NOT '2'
    const supersededBtn = screen.getByRole('button', { name: /ฉบับตกรุ่น/i });
    expect(supersededBtn).toHaveTextContent('1');
    expect(supersededBtn).not.toHaveTextContent('2');

    // Active tab button should display badge '1' (SOP-PD-03)
    const activeBtn = screen.getByRole('button', { name: /มีผลบังคับใช้/i });
    expect(activeBtn).toHaveTextContent('1');
  });

  it('synchronizes table grouped rows and summary counter text with distinct tab count', () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    // Switch to "เอกสารในแผนกฉัน"
    fireEvent.click(screen.getByRole('button', { name: /เอกสารในแผนกฉัน/i }));

    // Click "ยกเลิกถาวร (Obsolete)" tab
    fireEvent.click(screen.getByRole('button', { name: /ยกเลิกถาวร/i }));

    // Both distinct codes must be rendered as primary group rows
    expect(screen.getByText('SOP-PD-01')).toBeInTheDocument();
    expect(screen.getByText('WI-PD-02')).toBeInTheDocument();

    // Summary Counter counts distinct codes (2), not raw records (5)
    expect(screen.getByText(/แสดงผล/i)).toHaveTextContent('แสดงผล 2 รายการ / 2 รายการ');
  });

});
