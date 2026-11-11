import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import AssetRegisterPage from '../pages/AssetRegisterPage';
import { resetVccLocalStore, createVccAsset, updateVccAsset, retireVccAsset, reactivateVccAsset } from '../api/vccApi';
import { canManageVccAsset, manageableVccDepartments } from '../utils/departmentScope';

const DEPTS = [
  { code: 'QC', name_th: 'ควบคุมคุณภาพ', status: 'ACTIVE' },
  { code: 'LB', name_th: 'ห้องปฏิบัติการ', status: 'ACTIVE' },
  { code: 'DC', name_th: 'ควบคุมเอกสาร', status: 'ACTIVE' }
];
const dcc = { id: 'dc4', name: 'DCC', department: 'DC', depts: ['DC'], isDcc: true, approval_level: 4 };
const qc2 = { id: 'qc2', name: 'QC L2', department: 'QC', depts: ['QC'], isDcc: false, approval_level: 2 };
const qc4 = { id: 'qc4', name: 'QC L4', department: 'QC', depts: ['QC'], isDcc: false, approval_level: 4 };
const qc6 = { id: 'qc6', name: 'QC L6', department: 'QC', depts: ['QC'], isDcc: false, approval_level: 6 };
const lb4 = { id: 'lb4', name: 'LB L4', department: 'LB', depts: ['LB'], isDcc: false, approval_level: 4 };

const open = () => render(<MemoryRouter><AssetRegisterPage /></MemoryRouter>);

describe('shared UI helper for who may manage assets', () => {
  it('DCC any department; L4+ own VCC department only; L6+/QMR/MGT read access adds nothing', () => {
    expect(canManageVccAsset(dcc, 'WH')).toBe(true);
    expect(canManageVccAsset(qc4, 'qc')).toBe(true);
    expect(canManageVccAsset(qc4, 'LB')).toBe(false);
    expect(canManageVccAsset(qc2, 'QC')).toBe(false);
    expect(canManageVccAsset({ ...qc6, isQmr: true, department: 'MGT', depts: ['MGT'] }, 'QC')).toBe(false);
    expect(canManageVccAsset({ id: 'pd5', department: 'PD', depts: ['PD'], approval_level: 5 }, 'PD')).toBe(false);
    expect(manageableVccDepartments(qc2)).toEqual([]);
  });
});

describe('VCC asset register: department-based management panel & Strict Department Scoping', () => {
  beforeEach(async () => {
    resetVccLocalStore();
    useStore.setState({ departments: DEPTS, masterDepartments: DEPTS, currentUser: dcc });
    await createVccAsset({ asset_code: 'LB-T1', name: 'เครื่องมือ LB', asset_type: 'เครื่องชั่ง', department: 'LB' });
  });

  it('QC L4 sees strictly QC rows only (no LB rows or "แผนกอื่น • ดูอย่างเดียว"), locked department badge, and manageable controls', async () => {
    useStore.setState({ currentUser: qc4 });
    open();
    await waitFor(() => expect(screen.getByText('ST002')).toBeInTheDocument());
    expect(screen.queryByText('LB-T1')).toBeNull();
    expect(screen.queryByText('แผนกอื่น • ดูอย่างเดียว')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'กรองตามแผนก' })).toBeNull();
    expect(screen.getByTestId('locked-department-badge')).toHaveTextContent(/แผนก:\s*QC\s*—\s*ควบคุมคุณภาพ/);

    expect(screen.getByRole('button', { name: /เพิ่มเครื่องมือ/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ตั้งค่าประเภทเครื่องมือ/ })).toBeNull();
    expect(screen.getByTestId('asset-manage-summary')).toHaveTextContent(/แผนก QC/);

    const qcRow = screen.getAllByTestId('asset-ownership').find((el) => /แผนกของฉัน • จัดการได้/.test(el.textContent)).closest('tr');
    expect(within(qcRow).getByRole('button', { name: /^แก้ไข$/ })).toBeInTheDocument();
    expect(within(qcRow).getByRole('button', { name: /ปลดออกจากทะเบียน/ })).toBeInTheDocument();
  });

  it('LB L4 user sees strictly LB rows only (never sees QC or WH assets) and sees Clean Empty State when LB has no instruments', async () => {
    resetVccLocalStore();
    useStore.setState({ departments: DEPTS, masterDepartments: DEPTS, currentUser: lb4 });
    open();

    // When LB has 0 instruments in the register, shows Clean Empty State with CTA button
    await waitFor(() => expect(screen.getByTestId('clean-department-empty-state')).toBeInTheDocument());
    expect(screen.getByText(/ยังไม่มีเครื่องมือวัดในทะเบียนของฝ่าย ห้องปฏิบัติการ \(LB\)/)).toBeInTheDocument();
    expect(screen.queryByText('ST002')).toBeNull();
    expect(screen.queryByText('TM-07')).toBeNull();
    expect(screen.queryByText('แผนกอื่น • ดูอย่างเดียว')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'กรองตามแผนก' })).toBeNull();
    expect(screen.getByTestId('locked-department-badge')).toHaveTextContent(/แผนก:\s*LB\s*—\s*ห้องปฏิบัติการ/);

    const firstRegisterBtn = screen.getByRole('button', { name: /\+ ลงทะเบียนเครื่องมือชิ้นแรก/ });
    expect(firstRegisterBtn).toBeInTheDocument();
    fireEvent.click(firstRegisterBtn);
    const deptSelect = screen.getByText(/แผนกเจ้าของ/).closest('div').querySelector('select');
    expect(deptSelect.value).toBe('LB');
  });

  it('QC L2 sees an explanation of who is responsible instead of buttons they cannot use, scoped strictly to QC', async () => {
    useStore.setState({ currentUser: qc2 });
    open();
    await waitFor(() => expect(screen.getByText('ST002')).toBeInTheDocument());
    expect(screen.queryByText('LB-T1')).toBeNull();
    expect(screen.queryByRole('button', { name: /เพิ่มเครื่องมือ/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^แก้ไข$/ })).toBeNull();
    expect(screen.getByRole('note')).toHaveTextContent(/หัวหน้าแผนก \(ระดับ L4 ขึ้นไป\)/);
    expect(screen.getAllByTestId('asset-responsible').length).toBeGreaterThan(0);
  });

  it('DCC sees every row as manageable, has the All Departments dropdown filter, and the types button next to the add button', async () => {
    open();
    await waitFor(() => expect(screen.getByText('LB-T1')).toBeInTheDocument());
    expect(screen.getByText('ST002')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ตั้งค่าประเภทเครื่องมือ/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /เพิ่มเครื่องมือ/ })).toBeInTheDocument();

    const deptDropdown = screen.getByRole('combobox', { name: 'กรองตามแผนก' });
    expect(deptDropdown).toBeInTheDocument();
    expect(within(deptDropdown).getByRole('option', { name: /ทั้งหมดทุกแผนก \(All Departments\)/ })).toBeInTheDocument();

    const lbRow = screen.getByText('LB-T1').closest('tr');
    expect(within(lbRow).getByRole('button', { name: /^แก้ไข$/ })).toBeInTheDocument();
    expect(screen.queryByTestId('asset-responsible')).toBeNull();

    // Filter specifically to LB
    fireEvent.change(deptDropdown, { target: { value: 'LB' } });
    await waitFor(() => expect(screen.queryByText('ST002')).toBeNull());
    expect(screen.getByText('LB-T1')).toBeInTheDocument();
  });

  it('the add dialog offers only the user\'s own department; editing locks the department for non-DCC', async () => {
    useStore.setState({ currentUser: qc4 });
    open();
    await waitFor(() => expect(screen.getByText('ST002')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มเครื่องมือ/ }));
    const deptSelect = screen.getByText(/แผนกเจ้าของ/).closest('div').querySelector('select');
    expect(Array.from(deptSelect.options).map((o) => o.value).filter(Boolean)).toEqual(['QC']);
    expect(deptSelect.value).toBe('QC');
    fireEvent.click(screen.getByRole('button', { name: /ยกเลิก/ }));

    const qcRow = screen.getAllByTestId('asset-ownership').find((el) => /จัดการได้/.test(el.textContent)).closest('tr');
    fireEvent.click(within(qcRow).getByRole('button', { name: /^แก้ไข$/ }));
    const editSelect = screen.getByText(/แผนกเจ้าของ/).closest('div').querySelector('select');
    expect(editSelect).toBeDisabled();
    expect(screen.getByText(/การโอนเครื่องมือข้ามแผนกทำได้เฉพาะ DCC/)).toBeInTheDocument();
  });
});

describe('VCC asset register (demo mode): the same rule is enforced by the data layer', () => {
  beforeEach(async () => {
    resetVccLocalStore();
    useStore.setState({ departments: DEPTS, masterDepartments: DEPTS, currentUser: dcc });
  });

  it('QC L4 creates into QC automatically, cannot create for LB, edit or retire LB assets, or transfer', async () => {
    const lb = await createVccAsset({ asset_code: 'LB-T2', name: 'LB', asset_type: 'เครื่องชั่ง', department: 'LB' });
    useStore.setState({ currentUser: qc4 });

    const mine = await createVccAsset({ asset_code: 'QC-T9', name: 'QC ใหม่', asset_type: 'เครื่องชั่ง' });
    expect(mine.department).toBe('QC');
    await expect(createVccAsset({ asset_code: 'QC-T8', name: 'x', asset_type: 'เครื่องชั่ง', department: 'LB' })).rejects.toThrow(/แผนกตนเอง/);
    await expect(updateVccAsset(lb.id, { name: 'hijack' })).rejects.toThrow(/แผนกตนเอง/);
    await expect(retireVccAsset(lb.id, 'x')).rejects.toThrow(/แผนกตนเอง/);
    await expect(updateVccAsset(mine.id, { department: 'LB' })).rejects.toThrow(/เฉพาะ DCC/);

    await retireVccAsset(mine.id, 'ชำรุด');
    const back = await reactivateVccAsset(mine.id, 'ซ่อมแล้ว');
    expect(back.status).toBe('ACTIVE');
  });

  it('QC L2 and L6 outside their department cannot write', async () => {
    const lb = await createVccAsset({ asset_code: 'LB-T3', name: 'LB', asset_type: 'เครื่องชั่ง', department: 'LB' });
    useStore.setState({ currentUser: qc2 });
    await expect(createVccAsset({ asset_code: 'QC-T7', name: 'x', asset_type: 'เครื่องชั่ง', department: 'QC' })).rejects.toThrow(/แผนกตนเอง/);
    useStore.setState({ currentUser: qc6 });
    await expect(updateVccAsset(lb.id, { name: 'senior' })).rejects.toThrow(/แผนกตนเอง/);
  });
});
