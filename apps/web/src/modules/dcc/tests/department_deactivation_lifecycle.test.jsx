import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithRouter, setTestUser } from '../../../test/test_utils';
import useStore, { SYSTEM_CORE_DEPTS } from '../../../store/useStore';
import MasterDataHub from '../pages/Admin/MasterDataHub';

describe('Department Deactivation / Soft Delete with Pre-check & User Re-assignment', () => {
  const dccAdmin = {
    id: 'EMP-001',
    empId: 'EMP-001',
    name: 'ธนาวุฒิ สมควรกิจดำรง',
    department: 'DC',
    depts: ['DC'],
    role: 'DCC_ADMIN',
    isDcc: true,
    level: 4
  };

  beforeEach(() => {
    useStore.getState().resetStore();
    setTestUser(dccAdmin);
  });

  describe('1. Store Logic & Dependency Pre-checks', () => {
    it('accurately pre-checks dependencies (effective docs, copies, tasks, affected users)', () => {
      // Seed mock dependencies for department 'MKT'
      useStore.setState({
        documents: [
          { id: 'DOC-001', code: 'SOP-MKT-01', department: 'MKT', status: 'EFFECTIVE' },
          { id: 'DOC-002', code: 'SOP-MKT-02', department: 'MKT', status: 'OBSOLETE' },
          { id: 'DOC-003', code: 'SOP-PD-01', department: 'PD', status: 'EFFECTIVE' }
        ],
        controlledCopyInstances: [
          { copyId: 'CP-01', department: 'MKT', status: 'ACTIVE' },
          { copyId: 'CP-02', department: 'MKT', status: 'RECALLED' }
        ],
        tasks: [
          { id: 'TSK-01', target_department: 'MKT', status: 'PENDING' },
          { id: 'TSK-02', target_department: 'MKT', status: 'COMPLETED' }
        ]
      });

      const check = useStore.getState().checkDepartmentDependencies('MKT');

      expect(check.targetDeptId).toBe('MKT');
      expect(check.activeDocsCount).toBe(1); // Only effective
      expect(check.activeCopiesCount).toBe(1); // Only active
      expect(check.pendingTasksCount).toBe(1); // Only non-completed
      expect(check.affectedUsers.length).toBeGreaterThanOrEqual(1); // Somchai MKT
    });

    it('blocks deactivating System Core Departments (DC, QA, QA/QC)', () => {
      const store = useStore.getState();
      expect(SYSTEM_CORE_DEPTS).toContain('DC');
      expect(SYSTEM_CORE_DEPTS).toContain('QA');

      expect(() => {
        store.deactivateDepartment('DC', 'PD');
      }).toThrow(/System Core Department/);

      expect(() => {
        store.deactivateDepartment('QA/QC', 'PD');
      }).toThrow(/System Core Department/);
    });

    it('blocks deactivating department with effective docs, copies, or pending tasks', () => {
      // Case A: Has effective document
      useStore.setState({
        documents: [{ id: 'D1', department: 'MKT', status: 'EFFECTIVE' }],
        controlledCopyInstances: [],
        tasks: []
      });

      expect(() => {
        useStore.getState().deactivateDepartment('MKT', 'PD');
      }).toThrow(/เอกสารแม่บทที่มีผลบังคับใช้/);

      // Case B: Has active controlled copy
      useStore.setState({
        documents: [],
        controlledCopyInstances: [{ copyId: 'C1', department: 'MKT', status: 'ACTIVE' }],
        tasks: []
      });

      expect(() => {
        useStore.getState().deactivateDepartment('MKT', 'PD');
      }).toThrow(/สำเนาควบคุมถือครองจริง/);

      // Case C: Has pending task
      useStore.setState({
        documents: [],
        controlledCopyInstances: [],
        tasks: [{ id: 'T1', target_department: 'MKT', status: 'PENDING' }]
      });

      expect(() => {
        useStore.getState().deactivateDepartment('MKT', 'PD');
      }).toThrow(/งานคงค้างในระบบ/);
    });

    it('successfully deactivates clean department and performs multi-dept & single-dept user re-assignment', () => {
      // Setup test users:
      // U-SINGLE: only belongs to 'MKT'
      // U-MULTI: belongs to primary 'MKT' and affiliated ['MKT', 'EN']
      useStore.setState({
        documents: [],
        controlledCopyInstances: [],
        documentControlledCopies: [],
        tasks: [],
        masterUsers: [
          ...useStore.getState().masterUsers,
          {
            id: 'U-SINGLE',
            empId: 'EMP-S1',
            name: 'พนักงาน แผนกเดียว',
            primary_department: 'MKT',
            department: 'MKT',
            affiliated_departments: ['MKT'],
            depts: ['MKT']
          },
          {
            id: 'U-MULTI',
            empId: 'EMP-M1',
            name: 'พนักงาน สองแผนก',
            primary_department: 'MKT',
            department: 'MKT',
            affiliated_departments: ['MKT', 'EN'],
            depts: ['MKT', 'EN']
          }
        ]
      });

      // Deactivate MKT with fallback 'PD'
      useStore.getState().deactivateDepartment('MKT', 'PD');

      const state = useStore.getState();
      const mktDept = state.departments.find(d => d.id === 'MKT');
      expect(mktDept.status).toBe('INACTIVE');
      expect(mktDept.headUserId).toBe('');

      // Verify single-dept user migrated to fallback 'PD'
      const singleUser = state.masterUsers.find(u => u.id === 'U-SINGLE');
      expect(singleUser.department).toBe('PD');
      expect(singleUser.primary_department).toBe('PD');
      expect(singleUser.affiliated_departments).toEqual(['PD']);

      // Verify multi-dept user switched primary to remaining 'EN'
      const multiUser = state.masterUsers.find(u => u.id === 'U-MULTI');
      expect(multiUser.department).toBe('EN');
      expect(multiUser.primary_department).toBe('EN');
      expect(multiUser.affiliated_departments).toEqual(['EN']);

      // Re-activate department
      useStore.getState().reactivateDepartment('MKT');
      const reactivatedMkt = useStore.getState().departments.find(d => d.id === 'MKT');
      expect(reactivatedMkt.status).toBe('ACTIVE');
    });
  });

  describe('2. UI & Smart Deactivation Modal in MasterDataHub', () => {
    it('filters departments by status: All, Active, and Inactive', () => {
      // Mark ST as INACTIVE
      useStore.setState(state => ({
        departments: state.departments.map(d => d.id === 'ST' ? { ...d, status: 'INACTIVE' } : d),
        masterDepartments: state.masterDepartments.map(d => d.id === 'ST' ? { ...d, status: 'INACTIVE' } : d)
      }));

      renderWithRouter(<MasterDataHub />);

      // Switch to Tab 2
      fireEvent.click(screen.getByText(/2\. แผนกและโครงสร้าง/i));

      // Filter by Active
      fireEvent.click(screen.getByRole('button', { name: /ใช้งานอยู่/i }));
      expect(screen.queryByText('Store & Inventory')).not.toBeInTheDocument();
      expect(screen.getByText('Production Department')).toBeInTheDocument();

      // Filter by Inactive
      fireEvent.click(screen.getByRole('button', { name: /ระงับแล้ว/i }));
      expect(screen.getByText('Store & Inventory')).toBeInTheDocument();
      expect(screen.queryByText('Production Department')).not.toBeInTheDocument();

      // Filter by All
      fireEvent.click(screen.getByRole('button', { name: /ทั้งหมด/i }));
      expect(screen.getByText('Store & Inventory')).toBeInTheDocument();
      expect(screen.getByText('Production Department')).toBeInTheDocument();
    });

    it('shows Core badge for DC & QA and opens Smart Deactivation Modal on non-core department', () => {
      renderWithRouter(<MasterDataHub />);
      fireEvent.click(screen.getByText(/2\. แผนกและโครงสร้าง/i));

      // Core badges should be rendered
      const coreBadges = screen.getAllByText(/Core/i);
      expect(coreBadges.length).toBeGreaterThan(0);

      // Trigger deactivation on MKT (Marketing)
      const mktCard = screen.getByText('Marketing & Sales').closest('.card-surface');
      const deactivateBtn = mktCard.querySelector('button');
      fireEvent.click(deactivateBtn);

      // Smart Modal should open
      expect(screen.getByText(/ยืนยันการระงับการใช้งานฝ่าย/i)).toBeInTheDocument();
      expect(screen.getByText(/สรุปการตรวจสอบภาระผูกพัน/i)).toBeInTheDocument();
      expect(screen.getByText(/Department Deactivation & User Re-assignment/i)).toBeInTheDocument();

      // Cancel button closes modal
      const cancelBtn = screen.getByRole('button', { name: /ยกเลิก \(Cancel\)/i });
      fireEvent.click(cancelBtn);
      expect(screen.queryByText(/Department Deactivation & User Re-assignment/i)).not.toBeInTheDocument();
    });
  });
});
