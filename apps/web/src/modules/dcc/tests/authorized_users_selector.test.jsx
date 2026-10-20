import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import AuthorizedUsersSelector from '../components/workflow/AuthorizedUsersSelector';

describe('AuthorizedUsersSelector Component', () => {
  const mockUsers = [
    { id: 'U001', empId: 'EMP-001', name: 'Admin QA (DCC)', department: 'QA', level: 1, position: 'Officer', status: 'ACTIVE' },
    { id: 'U002', empId: 'EMP-002', name: 'ธนาวุฒิ สมควรกิจดำรง', department: 'PD', level: 4, position: 'Production Supervisor', status: 'ACTIVE' },
    { id: 'U003', empId: 'EMP-003', name: 'กัลยาณี พลไกร', department: 'PD', level: 5, position: 'Production Asst Manager', status: 'ACTIVE' },
    { id: 'U006', empId: 'EMP-006', name: 'รัตนพล', department: 'EN', level: 4, position: 'Engineering Supervisor', status: 'ACTIVE' },
    { id: 'U010', empId: 'EMP-010', name: 'สมชาย การตลาด', department: 'MKT', level: 3, position: 'Sales Executive', status: 'ACTIVE' }
  ];

  it('renders selected user tags in tray and allows removing them', () => {
    const handleChange = vi.fn();
    render(
      <AuthorizedUsersSelector
        selectedUserIds={['U002', 'U010']}
        onChange={handleChange}
        users={mockUsers}
      />
    );

    // Selected tray counter
    expect(screen.getByText('เลือกแล้ว 2 ท่าน')).toBeInTheDocument();

    // Check tags (present in tray and candidate list)
    const thanawutElements = screen.getAllByText('ธนาวุฒิ สมควรกิจดำรง');
    expect(thanawutElements.length).toBeGreaterThanOrEqual(1);

    const somchaiElements = screen.getAllByText('สมชาย การตลาด');
    expect(somchaiElements.length).toBeGreaterThanOrEqual(1);

    // Click remove on U002 tag
    const removeBtn = screen.getByTitle('นำ ธนาวุฒิ สมควรกิจดำรง ออก');
    fireEvent.click(removeBtn);

    expect(handleChange).toHaveBeenCalledWith(['U010']);
  });

  it('clears all selected users when clicking ล้างทั้งหมด', () => {
    const handleChange = vi.fn();
    render(
      <AuthorizedUsersSelector
        selectedUserIds={['U002', 'U003']}
        onChange={handleChange}
        users={mockUsers}
      />
    );

    const clearBtn = screen.getByText('ล้างทั้งหมด');
    fireEvent.click(clearBtn);

    expect(handleChange).toHaveBeenCalledWith([]);
  });

  it('filters users instantly by search term (name, ID, or position)', () => {
    const handleChange = vi.fn();
    render(
      <AuthorizedUsersSelector
        selectedUserIds={[]}
        onChange={handleChange}
        users={mockUsers}
      />
    );

    const searchInput = screen.getByPlaceholderText(/ค้นหาด้วยชื่อ/i);

    // Search by name
    fireEvent.change(searchInput, { target: { value: 'รัตนพล' } });
    expect(screen.getByText('รัตนพล')).toBeInTheDocument();
    expect(screen.queryByText('สมชาย การตลาด')).not.toBeInTheDocument();

    // Search by User ID
    fireEvent.change(searchInput, { target: { value: 'U010' } });
    expect(screen.getByText('สมชาย การตลาด')).toBeInTheDocument();
    expect(screen.queryByText('รัตนพล')).not.toBeInTheDocument();

    // Search with no results
    fireEvent.change(searchInput, { target: { value: 'XYZ999' } });
    expect(screen.getByText('ไม่พบรายชื่อผู้ใช้ที่ตรงกับเงื่อนไข')).toBeInTheDocument();
  });

  it('filters users by department quick filter chips', () => {
    render(
      <AuthorizedUsersSelector
        selectedUserIds={[]}
        onChange={vi.fn()}
        users={mockUsers}
      />
    );

    // Click on PD chip
    const pdChip = screen.getByRole('button', { name: /^PD$/ });
    fireEvent.click(pdChip);

    expect(screen.getByText('ธนาวุฒิ สมควรกิจดำรง')).toBeInTheDocument();
    expect(screen.getByText('กัลยาณี พลไกร')).toBeInTheDocument();
    expect(screen.queryByText('รัตนพล')).not.toBeInTheDocument();
    expect(screen.queryByText('สมชาย การตลาด')).not.toBeInTheDocument();
  });
});
