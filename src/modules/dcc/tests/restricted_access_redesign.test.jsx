import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DocumentAccessControlSelector from '../components/workflow/DocumentAccessControlSelector';
import AuthorizedUsersSelector from '../components/workflow/AuthorizedUsersSelector';

const mockUsers = [
  { id: 'EMP-001', name: 'ธนาวุฒิ สมควรกิจดำรง', department: 'DC', role: 'DCC Admin', level: 5, active: true },
  { id: 'EMP-002', name: 'ศิริพร วงศ์สุวรรณ', department: 'QA', role: 'QA Supervisor', level: 4, active: true },
  { id: 'EMP-003', name: 'วิชัย สมบูรณ์ดี', department: 'PD', role: 'Production Tech', level: 2, active: true },
  { id: 'EMP-004', name: 'สุรศักดิ์ กล้าหาญ', department: 'PD', role: 'Line Leader', level: 3, active: true },
];

describe('Restricted Document Access & Member Picker Redesign', () => {
  it('renders top rule bar with minimum level dropdown and default level 4 in restricted mode', () => {
    const handleChange = vi.fn();
    render(
      <DocumentAccessControlSelector
        value={{
          scope: 'RESTRICTED',
          min_access_level: 4,
          authorized_users: ['EMP-002']
        }}
        onChange={handleChange}
        masterUsers={mockUsers}
      />
    );

    // Should display top rule bar with shield icon text
    expect(screen.getByText(/ระดับตำแหน่งขั้นต่ำที่อนุญาต/i)).toBeInTheDocument();
    
    // Check dropdown value
    const select = screen.getByLabelText(/ระดับสิทธิ์ขั้นต่ำ/i);
    expect(select.value).toBe('4');
  });

  it('displays info banner and hides member picker when minLevel is Level 1 (All Staff)', () => {
    const handleChange = vi.fn();
    const { rerender } = render(
      <DocumentAccessControlSelector
        value={{
          scope: 'RESTRICTED',
          min_access_level: 1,
          authorized_users: []
        }}
        onChange={handleChange}
        masterUsers={mockUsers}
      />
    );

    // Should display info banner
    expect(
      screen.getByText(/พนักงานทุกคนเข้าถึงได้ตามระดับตำแหน่ง ไม่จำเป็นต้องระบุบุคคลเพิ่มเติม/i)
    ).toBeInTheDocument();

    // Member picker header / search should NOT be in document
    expect(screen.queryByPlaceholderText(/ค้นหาด้วยชื่อ/i)).not.toBeInTheDocument();

    // When switched to named-individual mode, banner disappears and member picker appears
    rerender(
      <DocumentAccessControlSelector
        value={{
          scope: 'RESTRICTED',
          restricted_mode: 'WHITELIST',
          min_access_level: 4,
          authorized_users: []
        }}
        onChange={handleChange}
        masterUsers={mockUsers}
      />
    );

    expect(
      screen.queryByText(/พนักงานทุกคนเข้าถึงได้ตามระดับตำแหน่ง ไม่จำเป็นต้องระบุบุคคลเพิ่มเติม/i)
    ).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ค้นหาด้วยชื่อ/i)).toBeInTheDocument();
  });

  it('renders selected member chips with remove button and clear all in AuthorizedUsersSelector', () => {
    const handleChange = vi.fn();
    const onToggleUser = vi.fn();
    const onRemoveUser = vi.fn();

    render(
      <AuthorizedUsersSelector
        selectedUserIds={['EMP-001', 'EMP-002']}
        onChange={handleChange}
        onToggleUser={onToggleUser}
        onRemoveUser={onRemoveUser}
        users={mockUsers}
      />
    );

    // Check count text
    expect(screen.getByText(/เลือกแล้ว 2 ท่าน/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ล้างทั้งหมด/i })).toBeInTheDocument();

    // Chips exist for selected users (in chip and member card)
    expect(screen.getAllByText('ธนาวุฒิ สมควรกิจดำรง').length).toBe(2);
    expect(screen.getAllByText('ศิริพร วงศ์สุวรรณ').length).toBe(2);

    // Test remove button
    const removeBtn = screen.getByTitle(/นำ ธนาวุฒิ สมควรกิจดำรง ออก/i);
    fireEvent.click(removeBtn);
    expect(onRemoveUser).toHaveBeenCalledWith('EMP-001');
    expect(handleChange).toHaveBeenCalledWith(['EMP-002']);
  });

  it('filters member directory by search input and department filter chips', () => {
    render(
      <AuthorizedUsersSelector
        selectedUserIds={[]}
        onChange={vi.fn()}
        users={mockUsers}
      />
    );

    // Initial state: all users rendered in cards
    expect(screen.getByText('ธนาวุฒิ สมควรกิจดำรง')).toBeInTheDocument();
    expect(screen.getByText('วิชัย สมบูรณ์ดี')).toBeInTheDocument();

    // Department filter chip click: 'QA'
    const qaFilterBtn = screen.getByRole('button', { name: /^QA/i });
    fireEvent.click(qaFilterBtn);

    // Only QA users should be visible
    expect(screen.getByText('ศิริพร วงศ์สุวรรณ')).toBeInTheDocument();
    expect(screen.queryByText('วิชัย สมบูรณ์ดี')).not.toBeInTheDocument();

    // Click back to All
    const allFilterBtn = screen.getByRole('button', { name: /^ทั้งหมด/i });
    fireEvent.click(allFilterBtn);
    expect(screen.getByText('วิชัย สมบูรณ์ดี')).toBeInTheDocument();

    // Search filter
    const searchInput = screen.getByPlaceholderText(/ค้นหาด้วยชื่อ/i);
    fireEvent.change(searchInput, { target: { value: 'วิชัย' } });
    expect(screen.getByText('วิชัย สมบูรณ์ดี')).toBeInTheDocument();
    expect(screen.queryByText('ธนาวุฒิ สมควรกิจดำรง')).not.toBeInTheDocument();
  });

  it('renders compact empty state when no users are selected', () => {
    render(
      <AuthorizedUsersSelector
        selectedUserIds={[]}
        onChange={vi.fn()}
        users={mockUsers}
      />
    );

    expect(screen.getByText(/ยังไม่มีการเลือกรายชื่อเฉพาะบุคคล/i)).toBeInTheDocument();
  });
});
