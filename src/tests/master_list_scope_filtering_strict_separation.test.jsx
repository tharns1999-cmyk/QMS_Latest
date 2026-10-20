import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../store/useStore';
import Library, { filterDocumentsByScope } from '../pages/Library/Library';
import MasterList from '../pages/MasterList/MasterList';

describe('Strict Separation Between "ในแผนกฉัน" and "เอกสารทั่วไป" Scope Filtering', () => {
  const beamUser = {
    id: 'U-QC-001',
    name: 'บีม (QC)',
    department: 'QC',
    affiliatedDepartments: ['QC'],
    depts: ['QC'],
    role: 'DEPT_ADMIN',
    level: 4,
    isDcc: false
  };

  const qcOnlyDoc = {
    id: 'doc-qc-01',
    code: 'SOP-QC-01',
    docNo: 'SOP-QC-01',
    title: 'SOP-QC-01',
    name: 'ระเบียบปฏิบัติงานการตรวจสอบคุณภาพ',
    department: 'QC',
    owner_dept: 'QC',
    status: 'EFFECTIVE',
    rev: '01',
    access_level: 'PUBLIC',
    is_public: true,
    access_control: { scope: 'GENERAL' }
  };

  beforeEach(() => {
    useStore.getState().resetStore();
    useStore.setState({
      currentUser: beamUser,
      documents: [qcOnlyDoc]
    });
  });

  it('Criteria 1 & 2 & 3: When only SOP-QC-01 exists, "ในแผนกฉัน" badge is (1) and "เอกสารทั่วไป" badge is (0)', () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    const generalBtn = screen.getByRole('button', { name: /เอกสารทั่วไป/i });
    const myDeptBtn = screen.getByRole('button', { name: /ในแผนกฉัน/i });

    // Badge counts must be strictly separated
    expect(generalBtn).toHaveTextContent('0');
    expect(myDeptBtn).toHaveTextContent('1');

    // Criteria 1: In General tab, own department document SOP-QC-01 MUST NOT appear
    fireEvent.click(generalBtn);
    expect(screen.queryByText(/ระเบียบปฏิบัติงานการตรวจสอบคุณภาพ/i)).not.toBeInTheDocument();
    expect(screen.queryByText('SOP-QC-01')).not.toBeInTheDocument();

    // Criteria 2: Clicking "ในแผนกฉัน" tab shows SOP-QC-01
    fireEvent.click(myDeptBtn);
    expect(screen.getByText('SOP-QC-01')).toBeInTheDocument();
  });

  it('Criteria 3: Tooltip / Title on "เอกสารทั่วไป" specifies "เอกสารส่วนกลาง / เอกสารทั่วไปของแผนกอื่น"', () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    const generalBtn = screen.getByRole('button', { name: /เอกสารทั่วไป/i });
    expect(generalBtn).toHaveAttribute('title', 'เอกสารส่วนกลาง / เอกสารทั่วไปของแผนกอื่น');
  });

  it('Cross-department isolation: General tab displays only non-own department public docs', () => {
    const pdGeneralDoc = {
      id: 'doc-pd-01',
      code: 'SOP-PD-01',
      docNo: 'SOP-PD-01',
      title: 'SOP-PD-01',
      name: 'ระเบียบการผลิตทั่วไป',
      department: 'PD',
      owner_dept: 'PD',
      status: 'EFFECTIVE',
      rev: '01',
      access_level: 'PUBLIC',
      is_public: true,
      access_control: { scope: 'GENERAL' }
    };

    useStore.setState({
      currentUser: beamUser,
      documents: [qcOnlyDoc, pdGeneralDoc]
    });

    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    const generalBtn = screen.getByRole('button', { name: /เอกสารทั่วไป/i });
    const myDeptBtn = screen.getByRole('button', { name: /ในแผนกฉัน/i });

    // General badge is 1 (PD doc), My Dept badge is 1 (QC doc)
    expect(generalBtn).toHaveTextContent('1');
    expect(myDeptBtn).toHaveTextContent('1');

    // In General tab: PD doc is visible, own QC doc is hidden
    fireEvent.click(generalBtn);
    expect(screen.getByText('SOP-PD-01')).toBeInTheDocument();
    expect(screen.queryByText('SOP-QC-01')).not.toBeInTheDocument();

    // In My Dept tab: QC doc is visible, PD doc is hidden
    fireEvent.click(myDeptBtn);
    expect(screen.getByText('SOP-QC-01')).toBeInTheDocument();
    expect(screen.queryByText('SOP-PD-01')).not.toBeInTheDocument();
  });

  it('filterDocumentsByScope pure function enforces mutually exclusive separation', () => {
    const qaDoc = { id: 'd2', code: 'SOP-QA-01', department: 'QA', access_level: 'PUBLIC', is_public: true };
    const distDoc = { id: 'd3', code: 'WI-PD-01', department: 'PD', distributed_departments: ['QC'], access_level: 'RESTRICTED' };
    const testDocs = [qcOnlyDoc, qaDoc, distDoc];

    // MY_DEPT: Only QC doc
    const myDeptResult = filterDocumentsByScope(testDocs, 'MY_DEPT', beamUser);
    expect(myDeptResult.map(d => d.code)).toEqual(['SOP-QC-01']);

    // GENERAL: Only QA doc (strictly excludes SOP-QC-01)
    const generalResult = filterDocumentsByScope(testDocs, 'GENERAL', beamUser);
    expect(generalResult.map(d => d.code)).toEqual(['SOP-QA-01']);

    // DISTRIBUTED: Only distDoc
    const distResult = filterDocumentsByScope(testDocs, 'DISTRIBUTED', beamUser);
    expect(distResult.map(d => d.code)).toEqual(['WI-PD-01']);
  });

  it('MasterList UI displays scope filter tabs with mutually exclusive counts', () => {
    render(
      <MemoryRouter>
        <MasterList />
      </MemoryRouter>
    );

    // Verify Scope tabs in MasterList
    const generalBtn = screen.getByRole('button', { name: /เอกสารทั่วไป/i });
    const myDeptBtn = screen.getByRole('button', { name: /ในแผนกฉัน/i });

    expect(generalBtn).toHaveAttribute('title', 'เอกสารส่วนกลาง / เอกสารทั่วไปของแผนกอื่น');
    expect(generalBtn).toHaveTextContent('0');
    expect(myDeptBtn).toHaveTextContent('1');
  });
});
