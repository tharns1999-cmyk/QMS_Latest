import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../store/useStore';
import Sidebar from '../components/layout/Sidebar';

describe('Bug Fix: Newly Created Users Missing Sidebar Menus', () => {
  beforeEach(() => {
    useStore.getState().resetStore();
  });

  it('1. Newly created user (สิรภัทร L4) has full permissions, workflow flags, and presence in role arrays', () => {
    const newUserPayload = {
      name: 'สิรภัทร ภักดี',
      email: 'sirapat.p@company.com',
      department: 'QA',
      position: 'Quality Assurance Supervisor',
      level: 4,
      approval_level: 4,
      role: 'GENERAL_USER'
    };

    act(() => {
      useStore.getState().addMasterUser(newUserPayload);
    });

    const state = useStore.getState();
    const createdUser = state.masterUsers.find(u => u.name === 'สิรภัทร ภักดี');
    expect(createdUser).toBeDefined();
    expect(createdUser.id).toBeDefined();
    expect(createdUser.empId).toBeDefined();
    expect(createdUser.permissions).toEqual(expect.arrayContaining(['DAR_CREATE', 'TASK_ACCESS', 'VIEW_REGISTER']));
    expect(createdUser.canCreateDar).toBe(true);
    expect(createdUser.canAccessTasks).toBe(true);
    expect(createdUser.canViewRegister).toBe(true);
    expect(createdUser.isWorkflowUser).toBe(true);

    // Verify presence in request, review, and approve user arrays
    expect(state.requestUsers.some(u => u.id === createdUser.id)).toBe(true);
    expect(state.reviewUsers.some(u => u.id === createdUser.id)).toBe(true);
    expect(state.approveUsers.some(u => u.id === createdUser.id)).toBe(true);
  });

  it('2. Switching active user to newly created user (สิรภัทร L4) renders all 4 required menus in Sidebar', () => {
    const newUserPayload = {
      id: 'U-SIRA-01',
      empId: 'EMP-099',
      name: 'สิรภัทร ภักดี',
      email: 'sirapat.p@company.com',
      department: 'QA',
      primary_department: 'QA',
      depts: ['QA'],
      position: 'Quality Assurance Supervisor',
      level: 4,
      approval_level: 4,
      role: 'GENERAL_USER'
    };

    act(() => {
      useStore.getState().addMasterUser(newUserPayload);
      useStore.getState().setCurrentUser('U-SIRA-01');
    });

    const activeUser = useStore.getState().currentUser;
    expect(activeUser.id).toBe('U-SIRA-01');
    expect(activeUser.name).toBe('สิรภัทร ภักดี');
    expect(activeUser.canCreateDar).toBe(true);
    expect(activeUser.canAccessTasks).toBe(true);

    render(
      <MemoryRouter initialEntries={['/dcc/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    );

    // 1. ยื่นคำร้อง DAR
    expect(screen.getByText('ยื่นคำร้อง DAR')).toBeInTheDocument();

    // 2. ติดตามคำร้องของฉัน
    expect(screen.getByText('ติดตามคำร้องของฉัน')).toBeInTheDocument();

    // 3. กล่องงานที่ต้องทำ
    expect(screen.getByText('กล่องงานที่ต้องทำ')).toBeInTheDocument();

    // 4. คลังเอกสารแม่บท (Master List Deprecated and Replaced by Document Library)
    expect(screen.getByText('คลังเอกสารแม่บท')).toBeInTheDocument();
    expect(screen.queryByText('ทะเบียนเอกสารหลัก')).not.toBeInTheDocument();
  });

  it('3. Existing general user L3 (สมชาย การตลาด) also retains access to primary menus', () => {
    act(() => {
      useStore.getState().setCurrentUser('U010');
    });

    const activeUser = useStore.getState().currentUser;
    expect(activeUser.id).toBe('U010');
    expect(activeUser.name).toBe('สมชาย การตลาด');

    render(
      <MemoryRouter initialEntries={['/dcc/dashboard']}>
        <Sidebar />
      </MemoryRouter>
    );

    // Primary menus visible
    expect(screen.getByText('ยื่นคำร้อง DAR')).toBeInTheDocument();
    expect(screen.getByText('ติดตามคำร้องของฉัน')).toBeInTheDocument();
    expect(screen.getByText('กล่องงานที่ต้องทำ')).toBeInTheDocument();
    expect(screen.getByText('คลังเอกสารแม่บท')).toBeInTheDocument();
    expect(screen.queryByText('ทะเบียนเอกสารหลัก')).not.toBeInTheDocument();
  });
});
