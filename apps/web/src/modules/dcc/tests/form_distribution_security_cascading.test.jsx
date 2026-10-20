import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import DistributionSetup from '../components/workflow/DistributionSetup';
import useStore from '../../../store/useStore';

// FM (blank forms) bypass physical copies; download visibility follows the document Access Scope,
// so Distribution Scope ⊆ Access Scope holds by construction.
describe('DistributionSetup: FM bypass vs physical controlled copy matrix', () => {
  beforeEach(() => {
    useStore.setState({
      masterDepartments: [
        { id: 'QA', nameTh: 'ฝ่ายประกันคุณภาพ', code: 'QA', status: 'ACTIVE' },
        { id: 'PD', nameTh: 'ฝ่ายผลิต', code: 'PD', status: 'ACTIVE' }
      ],
      currentUser: { id: 'U002', name: 'กัลยาณี พลไกร', department: 'QA', role: 'DEPT_ADMIN' }
    });
  });

  it('FM document shows the access-scope notice and no controlled copy matrix', () => {
    render(
      <DistributionSetup ownerDept="QA" distributions={[]} onChange={() => {}} documentType="FM"
        accessScope="DEPT_ONLY" accessControl={{ scope: 'DEPT_ONLY', authorized_depts: [] }} />
    );

    expect(screen.getByText(/ดาวน์โหลดตามสิทธิ์การเข้าถึง/)).toBeInTheDocument();
    expect(screen.queryByText(/Copy 01/)).not.toBeInTheDocument();
  });

  it('Non-FM document (SOP) renders the physical controlled copy station matrix', () => {
    render(
      <DistributionSetup ownerDept="QA" distributions={[]} onChange={() => {}} documentType="SOP" accessScope="DEPT_ONLY" />
    );

    expect(screen.getByText(/Master Copy 01 ล็อกถาวร/i)).toBeInTheDocument();
    expect(screen.queryByText(/ดาวน์โหลดตามสิทธิ์การเข้าถึง/)).not.toBeInTheDocument();
  });
});
