import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ApiMasterData from '../pages/Admin/ApiMasterData';
import useStore from '../../../store/useStore';
import * as api from '../../../api/masterData';

vi.mock('../../../api/masterData', () => ({
  createUser: vi.fn(), updateUser: vi.fn(), setUserStatus: vi.fn(), resetUserPassword: vi.fn(),
  createDepartment: vi.fn(), updateDepartment: vi.fn(), createLocation: vi.fn(), updateLocation: vi.fn(), saveMatrixEntry: vi.fn(),
  resetUserTwoFactor: vi.fn(), getSecurityPolicy: vi.fn(), saveSecurityPolicy: vi.fn()
}));

const person = (id, status, extra = {}) => ({ id, name: `คน ${id}`, email: `${id}@x.local`, empId: '', approval_level: 3, department: 'QC', depts: ['QC'], isDcc: false, isQmr: false, status, ...extra });

describe('API master data page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      currentUser: { id: 'me', isDcc: true },
      adminUsers: [person('me', 'ACTIVE', { isDcc: true }), person('u1', 'ACTIVE', { twoFactorEnabled: true }), person('u2', 'LOCKED', { twoFactorRequired: true })],
      departments: [{ code: 'QC', nameTh: 'คุณภาพ', nameEn: 'Quality', status: 'ACTIVE' }, { code: 'PD', nameTh: 'ผลิต', nameEn: '', status: 'INACTIVE' }],
      distributionLocations: [{ id: 'l1', departmentId: 'QC', name: 'ห้องแล็บ', description: '', status: 'ACTIVE' }],
      approvalMatrix: [{ doc_type: 'SOP', name_th: 'ระเบียบ', min_requester_level: 1, required_reviewer_level: 4, required_approver_level: 6, updated_at: 't' }]
    });
  });

  it('lists everyone with their status, and offers deactivation only for other people', () => {
    render(<ApiMasterData />);
    expect(screen.getByText('คน u2')).toBeInTheDocument();
    expect(screen.getByText('ถูกล็อก')).toBeInTheDocument();
    // me: no deactivate button; u1: deactivate; u2 (locked): unlock
    expect(screen.getAllByRole('button', { name: 'ปิดบัญชี' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'ปลดล็อก' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('ค้นหาผู้ใช้'), { target: { value: 'u2@' } });
    expect(screen.queryByText('คน u1')).not.toBeInTheDocument();
  });

  it('creates a user and shows the one-time password', async () => {
    api.createUser.mockResolvedValue({ temporaryPassword: 'Abcdefgh234567' });
    render(<ApiMasterData />);
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มผู้ใช้' }));
    const dialogForm = screen.getByText('เพิ่มผู้ใช้ใหม่').closest('form');
    fireEvent.change(dialogForm.querySelector('input'), { target: { value: 'สมศรี' } });
    fireEvent.change(dialogForm.querySelector('input[type="email"]'), { target: { value: ' Som@X.local ' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(api.createUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'สมศรี', department: 'QC', approval_level: 1 })));
    expect(await screen.findByText('Abcdefgh234567')).toBeInTheDocument();
    expect(screen.getByText(/แสดงครั้งเดียว/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
    expect(screen.queryByText('Abcdefgh234567')).not.toBeInTheDocument();
  });

  it('does not show a password when the server refuses the new user', async () => {
    api.createUser.mockResolvedValue(null);
    render(<ApiMasterData />);
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มผู้ใช้' }));
    const dialogForm = screen.getByText('เพิ่มผู้ใช้ใหม่').closest('form');
    fireEvent.change(dialogForm.querySelector('input'), { target: { value: 'x' } });
    fireEvent.change(dialogForm.querySelector('input[type="email"]'), { target: { value: 'x@y.z' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(api.createUser).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('เพิ่มผู้ใช้ใหม่')).toBeInTheDocument(); // form stays open for another try
  });

  it('saves a changed approval level for a document type', () => {
    render(<ApiMasterData />);
    fireEvent.click(screen.getByRole('tab', { name: 'ระดับผู้ทบทวน/อนุมัติ' }));
    const save = screen.getByRole('button', { name: 'บันทึก' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('SOP required_approver_level'), { target: { value: '7' } });
    fireEvent.click(save);
    expect(api.saveMatrixEntry).toHaveBeenCalledWith('SOP', { min_requester_level: 1, required_reviewer_level: 4, required_approver_level: 7, obsolete_approver_level: null });
    // Retiring can be set stricter than the normal approver; the save button follows the change.
    fireEvent.change(screen.getByLabelText('SOP obsolete_approver_level'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));
    expect(api.saveMatrixEntry).toHaveBeenLastCalledWith('SOP', expect.objectContaining({ obsolete_approver_level: 8 }));
  });

  it('closes a department and adds a place through the server', () => {
    render(<ApiMasterData />);
    fireEvent.click(screen.getByRole('tab', { name: 'แผนก' }));
    fireEvent.click(screen.getByRole('button', { name: 'ปิดแผนก' }));
    expect(api.updateDepartment).toHaveBeenCalledWith('QC', { status: 'INACTIVE' });

    fireEvent.click(screen.getByRole('tab', { name: 'สถานที่แจกจ่ายสำเนา' }));
    fireEvent.change(screen.getByDisplayValue('เลือกแผนก'), { target: { value: 'QC' } });
    fireEvent.change(screen.getByRole('textbox', { name: /ชื่อสถานที่/ }), { target: { value: 'คลังเอกสาร' } });
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มสถานที่' }));
    expect(api.createLocation).toHaveBeenCalledWith({ department: 'QC', name: 'คลังเอกสาร', description: '' });
  });

  it('shows who has two-factor and who still has to set it up, and resets it only for those who have it', () => {
    render(<ApiMasterData />);
    expect(screen.getByText('ใช้แล้ว')).toBeInTheDocument();
    expect(screen.getByText('ต้องตั้งค่า')).toBeInTheDocument();
    const reset = screen.getByRole('button', { name: 'รีเซ็ต 2FA' }); // only u1 has it on
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(reset);
    expect(api.resetUserTwoFactor).toHaveBeenCalledWith('u1');
  });

  it('edits the two-factor policy from the values the server holds', async () => {
    api.getSecurityPolicy.mockResolvedValue({ twoFactorMinLevel: 5, twoFactorForDcc: true });
    api.saveSecurityPolicy.mockResolvedValue({ twoFactorMinLevel: 4, twoFactorForDcc: false });
    render(<ApiMasterData />);
    fireEvent.click(screen.getByRole('tab', { name: 'ความปลอดภัย' }));
    const level = await screen.findByDisplayValue('L5 ขึ้นไป');
    fireEvent.change(level, { target: { value: '4' } });
    fireEvent.click(screen.getByLabelText(/บังคับบัญชี DCC/));
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));
    await waitFor(() => expect(api.saveSecurityPolicy).toHaveBeenCalledWith({ twoFactorMinLevel: 4, twoFactorForDcc: false }));
    expect(await screen.findByDisplayValue('L4 ขึ้นไป')).toBeInTheDocument();
  });
});
