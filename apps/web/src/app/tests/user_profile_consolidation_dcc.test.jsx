import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import useStore, { MASTER_DATA_USER, MASTER_DEPARTMENTS, MASTER_DATA_DEPT } from '../../store/useStore';
import Sidebar from '../layout/Sidebar';

describe('Task: Merge User Profiles and Set Department to DC (DCC Admin)', () => {
  beforeEach(() => {
    useStore.getState().resetStore();
  });

  it('1. Consolidates Admin QA and Thanawut into single DCC Admin account', () => {
    // Verify Admin QA is removed
    const adminQa = MASTER_DATA_USER.find(u => u.name && u.name.includes('Admin QA'));
    expect(adminQa).toBeUndefined();

    // Verify Thanawut is the primary DCC Admin
    const thanawut = MASTER_DATA_USER.find(u => u.name === 'ธนาวุฒิ สมควรกิจดำรง');
    expect(thanawut).toBeDefined();
    expect(thanawut.id).toBe('EMP-001');
    expect(thanawut.empId).toBe('EMP-001');
    expect(thanawut.fullName).toBe('ธนาวุฒิ สมควรกิจดำรง');
    expect(thanawut.email).toBe('thanawut.s@company.com');
    expect(thanawut.department).toBe('DC');
    expect(thanawut.primary_department).toBe('DC');
    expect(thanawut.depts).toEqual(['DC']);
    expect(thanawut.position).toBe('Technology Project Leader / DCC Supervisor');
    expect(thanawut.role).toBe('DCC_ADMIN');
    expect(thanawut.isDcc).toBe(true);
    expect(thanawut.level).toBe(4);
    expect(thanawut.approval_level).toBe(4);
    expect(thanawut.status).toBe('Active');

    // Only 1 Thanawut account exists
    const allThanawut = MASTER_DATA_USER.filter(u => u.name && u.name.includes('ธนาวุฒิ'));
    expect(allThanawut).toHaveLength(1);
  });

  it('2. Verifies DC department exists in Master Departments and MASTER_DATA_DEPT alias', () => {
    const dcDept = MASTER_DEPARTMENTS.find(d => d.id === 'DC');
    expect(dcDept).toBeDefined();
    expect(dcDept.id).toBe('DC');
    expect(dcDept.headUserId).toBe('EMP-001');
    expect(dcDept.headName).toBe('ธนาวุฒิ สมควรกิจดำรง');
    expect(MASTER_DATA_DEPT).toBe(MASTER_DEPARTMENTS);
  });

  it('3. User Switcher in Sidebar displays "ธนาวุฒิ สมควรกิจดำรง (DC) L4" with role DCC_ADMIN', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    // Option should be rendered with expected text
    const select = screen.getByTitle('สลับผู้ใช้งาน / บทบาทจำลอง');
    expect(select).toBeInTheDocument();

    const expectedOption = screen.getByRole('option', { name: 'ธนาวุฒิ สมควรกิจดำรง (DC) L4' });
    expect(expectedOption).toBeInTheDocument();
    expect(expectedOption.value).toBe('EMP-001');

    // Default or switched user has DCC_ADMIN
    const state = useStore.getState();
    expect(state.currentUser.role).toBe('DCC_ADMIN');
    expect(state.currentUser.department).toBe('DC');
    expect(state.currentUser.isDcc).toBe(true);
    expect(state.currentUser.name).toBe('ธนาวุฒิ สมควรกิจดำรง');
  });

  it('4. Initial and switched currentUser resolves accurately by id and empId', () => {
    const store = useStore.getState();
    expect(store.currentUser.id).toBe('EMP-001');
    expect(store.currentUser.empId).toBe('EMP-001');
    expect(store.currentUser.role).toBe('DCC_ADMIN');

    // Switch to U003
    store.setCurrentUser('U003');
    expect(useStore.getState().currentUser.id).toBe('U003');

    // Switch back to Thanawut using empId
    useStore.getState().setCurrentUser('EMP-001');
    expect(useStore.getState().currentUser.id).toBe('EMP-001');
    expect(useStore.getState().currentUser.role).toBe('DCC_ADMIN');
    expect(useStore.getState().currentUser.department).toBe('DC');
  });
});
