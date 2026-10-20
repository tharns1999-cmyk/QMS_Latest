import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ExternalDocFormModal from '../pages/ExternalDocs/ExternalDocFormModal';
import useStore from '../../../store/useStore';

describe('ExternalDocFormModal Default Responsible Department & Auto-Sync Tests', () => {
  const qaUser = {
    id: 'U001',
    name: 'Admin QA (DCC)',
    department: 'QA',
    role: 'DCC_ADMIN',
    level: 1,
    isDcc: true
  };

  const pdUser = {
    id: 'U002',
    name: 'Somchai Production',
    department: 'PD',
    role: 'DEPT_HEAD',
    level: 4,
    isDcc: false
  };

  const departments = [
    { id: 'QA', nameTh: 'ฝ่ายประกันคุณภาพ' },
    { id: 'PD', nameTh: 'ฝ่ายผลิต' },
    { id: 'EN', nameTh: 'ฝ่ายวิศวกรรม' }
  ];

  beforeEach(() => {
    useStore.getState().resetStore();
    useStore.setState({
      currentUser: qaUser,
      masterDepartments: departments,
      externalDocuments: [],
      documentTypes: [{ id: 'ED', code: 'ED', namingPattern: 'ED-{Dept}-{##}' }]
    });
  });

  it('1. Defaults Responsible Department to QA for QA user and computes ED-QA-01 preview badge', () => {
    render(
      <MemoryRouter>
        <ExternalDocFormModal isOpen={true} onClose={() => {}} />
      </MemoryRouter>
    );

    const selects = screen.getAllByRole('combobox');
    const deptSelect = selects[0];
    expect(deptSelect).toHaveValue('QA');

    // System ED Code Preview badge
    expect(screen.getByText('ED-QA-01')).toBeInTheDocument();
  });

  it('2. Defaults Responsible Department to PD when logged-in user is from PD department', () => {
    useStore.setState({
      currentUser: pdUser
    });

    render(
      <MemoryRouter>
        <ExternalDocFormModal isOpen={true} onClose={() => {}} />
      </MemoryRouter>
    );

    const selects = screen.getAllByRole('combobox');
    const deptSelect = selects[0];
    expect(deptSelect).toHaveValue('PD');

    // System ED Code Preview badge
    expect(screen.getByText('ED-PD-01')).toBeInTheDocument();
  });

  it('3. Dynamically updates ED code preview when user manually changes department dropdown', () => {
    render(
      <MemoryRouter>
        <ExternalDocFormModal isOpen={true} onClose={() => {}} />
      </MemoryRouter>
    );

    const selects = screen.getAllByRole('combobox');
    const deptSelect = selects[0];
    expect(deptSelect).toHaveValue('QA');
    expect(screen.getByText('ED-QA-01')).toBeInTheDocument();

    // Change dropdown to EN
    fireEvent.change(deptSelect, { target: { value: 'EN' } });
    expect(deptSelect).toHaveValue('EN');
    expect(screen.getByText('ED-EN-01')).toBeInTheDocument();
  });

  it('4. Action buttons display clean Thai labels without English parentheses', () => {
    render(
      <MemoryRouter>
        <ExternalDocFormModal isOpen={true} onClose={() => {}} />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /^ยกเลิก$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^ยืนยันการลงทะเบียน$/i })).toBeInTheDocument();
  });
});
