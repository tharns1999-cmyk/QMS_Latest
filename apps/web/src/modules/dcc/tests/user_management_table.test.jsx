import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UserManagementTable, {
  getUserInitials,
  getAvatarRoleBadge
} from '../pages/Admin/components/UserManagementTable';

describe('UserManagementTable Component Tests', () => {
  const mockDepartments = [
    { id: 'DC', name: 'Document Control', nameTh: 'ศูนย์ควบคุมเอกสาร' },
    { id: 'QA', name: 'Quality Assurance', nameTh: 'ฝ่ายประกันคุณภาพ' },
    { id: 'QC', name: 'Quality Control', nameTh: 'ฝ่ายควบคุมคุณภาพ' },
    { id: 'PD', name: 'Production', nameTh: 'ฝ่ายผลิต' }
  ];

  const mockUsers = [
    {
      id: 'U001',
      empId: 'EMP-001',
      name: 'Somchai Thana',
      email: 'somchai@thaiairways.co.th',
      position: 'Quality Director',
      role: 'DCC_ADMIN',
      level: 6,
      status: 'ACTIVE',
      primary_department: 'DC',
      affiliated_departments: ['DC', 'QA', 'QC'],
      isLocked: false
    },
    {
      id: 'U002',
      empId: 'EMP-002',
      name: 'Wichai DeptAdmin',
      email: 'wichai@thaiairways.co.th',
      position: 'QA Manager',
      role: 'DEPT_ADMIN',
      level: 4,
      status: 'ACTIVE',
      primary_department: 'QA',
      affiliated_departments: ['QA'],
      isLocked: false
    },
    {
      id: 'U003',
      empId: 'EMP-003',
      name: 'Nattapong Locked',
      email: 'nattapong@thaiairways.co.th',
      position: 'QC Inspector',
      role: 'GENERAL_USER',
      level: 2,
      status: 'INACTIVE',
      primary_department: 'QC',
      affiliated_departments: ['QC', 'PD'],
      isLocked: true
    }
  ];

  const mockHandlers = {
    onOpenUserModal: vi.fn(),
    onOpenSignatureModal: vi.fn(),
    onOpenStampSimulator: vi.fn(),
    onResetPassword: vi.fn(),
    onUnlockAccount: vi.fn(),
    onToggleStatus: vi.fn(),
    onSwitchPersona: vi.fn(),
    onResetTwoFactor: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Pure Helper Functions', () => {
    it('getUserInitials extracts first characters of first and last name or first 2 letters', () => {
      expect(getUserInitials('Somchai Thana')).toBe('ST');
      expect(getUserInitials('Wichai')).toBe('WI');
      expect(getUserInitials('')).toBe('U');
      expect(getUserInitials('   ')).toBe('U');
      expect(getUserInitials('สมชาย สายผลิต')).toBe('สส');
    });

    it('getAvatarRoleBadge assigns appropriate color palette per role', () => {
      const dcc = getAvatarRoleBadge({ role: 'DCC_ADMIN' });
      expect(dcc.bg).toContain('purple');
      expect(dcc.roleLabel).toBe('DCC Admin');

      const dept = getAvatarRoleBadge({ role: 'DEPT_ADMIN' });
      expect(dept.bg).toContain('sky');
      expect(dept.roleLabel).toBe('ผู้ดูแลแผนก');

      const general = getAvatarRoleBadge({ role: 'GENERAL_USER' });
      expect(general.bg).toContain('slate');
      expect(general.roleLabel).toBe('ผู้ใช้งานทั่วไป');
    });
  });

  describe('2. Table Structure & Visual Identity', () => {
    it('renders user avatars with correct initials and employee ID monospace badges', () => {
      render(
        <UserManagementTable
          users={mockUsers}
          departmentsList={mockDepartments}
          {...mockHandlers}
        />
      );

      // Verify initials
      expect(screen.getByText('ST')).toBeInTheDocument();
      expect(screen.getByText('WD')).toBeInTheDocument();
      expect(screen.getByText('NL')).toBeInTheDocument();

      // Verify names and empIds
      expect(screen.getByText('Somchai Thana')).toBeInTheDocument();
      expect(screen.getByText('EMP-001')).toBeInTheDocument();
      expect(screen.getByText('somchai@thaiairways.co.th')).toBeInTheDocument();
    });

    it('renders single-line Smart Department badge with primary indicator and +X overflow', () => {
      render(
        <UserManagementTable
          users={mockUsers}
          departmentsList={mockDepartments}
          {...mockHandlers}
        />
      );

      // Primary badge for U001
      const primaryBadges = screen.getAllByTitle('แผนกหลัก (Primary Department)');
      expect(primaryBadges.length).toBe(3);
      expect(primaryBadges[0]).toHaveTextContent('⭐');
      expect(primaryBadges[0]).toHaveTextContent('DC');

      // Overflow badge for U001 (+2 แผนก: QA, QC)
      const overflowBadge = screen.getByTitle('สังกัดร่วมอีก 2 แผนก');
      expect(overflowBadge).toHaveTextContent('+2 แผนก');

      // Overflow badge for U003 (+1 แผนก: PD)
      const overflowU3 = screen.getByTitle('สังกัดร่วมอีก 1 แผนก');
      expect(overflowU3).toHaveTextContent('+1 แผนก');
    });

    it('renders human-readable role labels and approval level badges', () => {
      render(
        <UserManagementTable
          users={mockUsers}
          departmentsList={mockDepartments}
          {...mockHandlers}
        />
      );

      expect(screen.getByText('DCC Admin')).toBeInTheDocument();
      expect(screen.getByText('ผู้ดูแลแผนก')).toBeInTheDocument();
      expect(screen.getByText('ผู้ใช้งานทั่วไป')).toBeInTheDocument();

      expect(screen.getByText('L6')).toBeInTheDocument();
      expect(screen.getByText('L4')).toBeInTheDocument();
      expect(screen.getByText('L2')).toBeInTheDocument();
    });

    it('displays LOCKED badge and dedicated Unlock button for locked user accounts', () => {
      render(
        <UserManagementTable
          users={mockUsers}
          departmentsList={mockDepartments}
          {...mockHandlers}
        />
      );

      expect(screen.getByText('LOCKED')).toBeInTheDocument();

      const unlockBtn = screen.getByTitle('ปลดล็อกบัญชี');
      expect(unlockBtn).toBeInTheDocument();

      fireEvent.click(unlockBtn);
      expect(mockHandlers.onUnlockAccount).toHaveBeenCalledTimes(1);
      expect(mockHandlers.onUnlockAccount).toHaveBeenCalledWith(expect.objectContaining({ id: 'U003' }));
    });
  });

  describe('3. Action Dock & Overflow Menu [•••] Interactions', () => {
    it('clicking primary Edit button calls onOpenUserModal', () => {
      render(
        <UserManagementTable
          users={mockUsers}
          departmentsList={mockDepartments}
          {...mockHandlers}
        />
      );

      const editButtons = screen.getAllByTitle('แก้ไขข้อมูลผู้ใช้');
      expect(editButtons.length).toBe(3);

      fireEvent.click(editButtons[0]);
      expect(mockHandlers.onOpenUserModal).toHaveBeenCalledTimes(1);
      expect(mockHandlers.onOpenUserModal).toHaveBeenCalledWith(expect.objectContaining({ id: 'U001' }));
    });

    it('toggles overflow menu and opens action items when clicking [•••]', () => {
      render(
        <UserManagementTable
          users={mockUsers}
          departmentsList={mockDepartments}
          {...mockHandlers}
        />
      );

      const moreButtons = screen.getAllByTitle('ตัวเลือกเพิ่มเติม');
      expect(moreButtons.length).toBe(3);

      // Open menu for U001
      fireEvent.click(moreButtons[0]);
      expect(moreButtons[0]).toHaveAttribute('aria-expanded', 'true');

      // Check overflow items
      const resetButtons = screen.getAllByTitle('รีเซ็ตรหัสผ่านเริ่มต้น');
      fireEvent.click(resetButtons[0]);
      expect(mockHandlers.onResetPassword).toHaveBeenCalledWith(expect.objectContaining({ id: 'U001' }));
    });

    it('triggers switch persona, digital signature, and stamp simulator from overflow menu', () => {
      render(
        <UserManagementTable
          users={mockUsers}
          departmentsList={mockDepartments}
          {...mockHandlers}
        />
      );

      const moreButtons = screen.getAllByTitle('ตัวเลือกเพิ่มเติม');
      fireEvent.click(moreButtons[1]); // open for U002

      const personaBtns = screen.getAllByTitle('จำลองมุมมองผู้ใช้');
      fireEvent.click(personaBtns[1]);
      expect(mockHandlers.onSwitchPersona).toHaveBeenCalledWith(expect.objectContaining({ id: 'U002' }));

      const sigBtns = screen.getAllByTitle('จัดการลายเซ็นอิเล็กทรอนิกส์ (Signature Asset)');
      fireEvent.click(sigBtns[1]);
      expect(mockHandlers.onOpenSignatureModal).toHaveBeenCalledWith(expect.objectContaining({ id: 'U002' }));

      const stampBtns = screen.getAllByTitle('ทดสอบตราประทับจำลอง (21 CFR Part 11 Stamp Simulator)');
      fireEvent.click(stampBtns[1]);
      expect(mockHandlers.onOpenStampSimulator).toHaveBeenCalledWith(expect.objectContaining({ id: 'U002' }));
    });

    it('closes open overflow menu on Escape key press', () => {
      render(
        <UserManagementTable
          users={mockUsers}
          departmentsList={mockDepartments}
          {...mockHandlers}
        />
      );

      const moreButtons = screen.getAllByTitle('ตัวเลือกเพิ่มเติม');
      fireEvent.click(moreButtons[0]);
      expect(moreButtons[0]).toHaveAttribute('aria-expanded', 'true');

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(moreButtons[0]).toHaveAttribute('aria-expanded', 'false');
    });

    it('toggles user status when status button is clicked', () => {
      render(
        <UserManagementTable
          users={mockUsers}
          departmentsList={mockDepartments}
          {...mockHandlers}
        />
      );

      const activeBtns = screen.getAllByText('🟢 Active');
      fireEvent.click(activeBtns[0]);
      expect(mockHandlers.onToggleStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'U001' }));
    });
  });

  describe('4. Empty State & Pagination Integration', () => {
    it('displays empty state message when users array is empty', () => {
      render(
        <UserManagementTable
          users={[]}
          departmentsList={mockDepartments}
          {...mockHandlers}
        />
      );

      expect(screen.getByText('ไม่พบข้อมูลผู้ใช้งานที่ค้นหา')).toBeInTheDocument();
    });

    it('renders pagination slot seamlessly inside the elevated container', () => {
      render(
        <UserManagementTable
          users={mockUsers}
          departmentsList={mockDepartments}
          pagination={<div data-testid="custom-pagination">Custom Pagination Controls</div>}
          {...mockHandlers}
        />
      );

      expect(screen.getByTestId('custom-pagination')).toBeInTheDocument();
    });
  });
});
