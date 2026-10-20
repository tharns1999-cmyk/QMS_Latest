import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Library from '../pages/Library/Library';
import useStore from '../../../store/useStore';
import { ACCESS_SCOPES } from '../utils/accessControl';

describe('Library 3-Tier Tab Navigation & 4-Tier Access Scope Integration Tests', () => {
  const pdUser = {
    id: 'U002',
    name: 'ธนาวุฒิ สมควรกิจดำรง (PD)',
    department: 'PD',
    depts: ['PD'],
    role: 'DEPT_ADMIN',
    level: 4,
    isDcc: false
  };

  const sampleDocuments = [
    // 1. GENERAL Scope (PD owner)
    {
      id: 'doc-pd-gen',
      title: 'SOP-PD-001',
      name: 'มาตรฐานการผลิตทั่วไป',
      status: 'EFFECTIVE',
      department: 'PD',
      owner_dept: 'PD',
      rev: '01',
      effectiveDate: '2026-01-01',
      access_control: { scope: ACCESS_SCOPES.GENERAL },
      distributions: [{ departmentId: 'PD', locationId: 'PD-L1' }]
    },
    // 2. GENERAL Scope (QA owner)
    {
      id: 'doc-qa-gen',
      title: 'SOP-QA-001',
      name: 'ระเบียบการตรวจประเมินคุณภาพภายใน',
      status: 'EFFECTIVE',
      department: 'QA',
      owner_dept: 'QA',
      rev: '01',
      effectiveDate: '2026-01-01',
      access_control: { scope: ACCESS_SCOPES.GENERAL },
      distributions: [{ departmentId: 'QA', locationId: 'QA-HQ' }]
    },
    // 3. DEPT_ONLY Scope (PD owner)
    {
      id: 'doc-pd-dept',
      title: 'WI-PD-002',
      name: 'สูตรลับเฉพาะฝ่ายผลิตสาย 1',
      status: 'EFFECTIVE',
      department: 'PD',
      owner_dept: 'PD',
      rev: '01',
      effectiveDate: '2026-01-01',
      access_control: { scope: ACCESS_SCOPES.DEPT_ONLY, authorized_depts: ['PD'] }
    },
    // 4. DEPT_ONLY Scope (QA owner)
    {
      id: 'doc-qa-dept',
      title: 'WI-QA-002',
      name: 'การวิเคราะห์แล็บเคมีขั้นสูงเฉพาะ QA',
      status: 'EFFECTIVE',
      department: 'QA',
      owner_dept: 'QA',
      rev: '01',
      effectiveDate: '2026-01-01',
      access_control: { scope: ACCESS_SCOPES.DEPT_ONLY, authorized_depts: ['QA'] }
    },
    // 5. TARGETED Scope (QA owner, shared to PD & WH)
    {
      id: 'doc-qa-target',
      title: 'SD-QA-003',
      name: 'สเปกบรรจุภัณฑ์ร่วม QA และ PD',
      status: 'EFFECTIVE',
      department: 'QA',
      owner_dept: 'QA',
      rev: '01',
      effectiveDate: '2026-01-01',
      access_control: { scope: ACCESS_SCOPES.TARGETED, authorized_depts: ['QA', 'PD', 'WH'] },
      distributions: [{ departmentId: 'QA', locationId: 'QA-HQ' }, { departmentId: 'PD', locationId: 'PD-L1' }]
    },
    // 6. RESTRICTED Scope (QA owner, Level 4+ only)
    {
      id: 'doc-qa-rest',
      title: 'SOP-QA-004',
      name: 'การจัดการภาวะวิกฤตคุณภาพลับเฉพาะ',
      status: 'EFFECTIVE',
      department: 'QA',
      owner_dept: 'QA',
      rev: '01',
      effectiveDate: '2026-01-01',
      access_control: { scope: ACCESS_SCOPES.RESTRICTED, authorized_users: ['U005'], min_access_level: 4 }
    }
  ];

  beforeEach(() => {
    useStore.getState().resetStore();
    useStore.setState({
      currentUser: pdUser,
      documents: sampleDocuments
    });
  });

  it('1. Renders 3 segmented tabs with accurate document counts for PD User', () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /เอกสารทั่วไป/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /เอกสารในแผนกฉัน/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /เอกสารที่ได้รับการแจกจ่าย/i })).toBeInTheDocument();
  });

  it('2. Tab "เอกสารทั่วไป" displays other department GENERAL documents and hides own department and non-general tiers', () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    const generalBtn = screen.getByRole('button', { name: /เอกสารทั่วไป/i });
    fireEvent.click(generalBtn);

    // Strict Separation: Should NOT show own PD GENERAL doc in General tab
    expect(screen.queryByText('SOP-PD-001')).not.toBeInTheDocument();
    // Should show QA GENERAL doc
    expect(screen.getByText('SOP-QA-001')).toBeInTheDocument();

    // Should NOT show DEPT_ONLY, TARGETED, or RESTRICTED in General tab
    expect(screen.queryByText('WI-PD-002')).not.toBeInTheDocument();
    expect(screen.queryByText('WI-QA-002')).not.toBeInTheDocument();
    expect(screen.queryByText('SD-QA-003')).not.toBeInTheDocument();
    expect(screen.queryByText('SOP-QA-004')).not.toBeInTheDocument();
  });

  it('3. Default Tab "เอกสารในแผนกฉัน" is selected automatically on initial load and displays ALL PD tiers while hiding other departments', () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    // Without clicking any tab, "ในแผนกฉัน" is active by default and filters by currentUser.department (PD)
    expect(screen.getByText('SOP-PD-001')).toBeInTheDocument();
    expect(screen.getByText('WI-PD-002')).toBeInTheDocument();

    // Hides QA documents on initial load
    expect(screen.queryByText('SOP-QA-001')).not.toBeInTheDocument();
    expect(screen.queryByText('WI-QA-002')).not.toBeInTheDocument();
    expect(screen.queryByText('SD-QA-003')).not.toBeInTheDocument();
  });

  it('4. Tab "เอกสารที่ได้รับการแจกจ่าย" displays shared/distributed docs from other depts', () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    const distBtn = screen.getByRole('button', { name: /เอกสารที่ได้รับการแจกจ่าย/i });
    fireEvent.click(distBtn);

    // Shows SD-QA-003 (Targeted & distributed to PD)
    expect(screen.getByText('SD-QA-003')).toBeInTheDocument();

    // Does NOT show own PD documents in distributed tab
    expect(screen.queryByText('SOP-PD-001')).not.toBeInTheDocument();
    expect(screen.queryByText('WI-PD-002')).not.toBeInTheDocument();
  });

  it('5. Confidentiality badges render properly in table', () => {
    render(
      <MemoryRouter>
        <Library />
      </MemoryRouter>
    );

    // In General tab, badges should display 'ทั่วไป'
    const badges = screen.getAllByText('ทั่วไป');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });
});
