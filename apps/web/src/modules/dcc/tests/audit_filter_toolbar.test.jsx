import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AuditFilterToolbar from '../pages/Admin/AuditFilterToolbar';

describe('AuditFilterToolbar Component Tests', () => {
  const defaultProps = {
    searchTerm: '',
    onSearchChange: vi.fn(),
    selectedModule: 'ALL',
    onModuleChange: vi.fn(),
    selectedCategory: 'ALL',
    onCategoryChange: vi.fn(),
    dateFrom: '',
    dateTo: '',
    onDateFromChange: vi.fn(),
    onDateToChange: vi.fn(),
    onClearDate: vi.fn(),
    categoryCounts: { ALL: 10, VCC_ASSET: 5, VCC_PLAN: 3, VCC_WO: 2 }
  };

  it('renders search input and triggers onSearchChange', () => {
    const onSearchChange = vi.fn();
    render(<AuditFilterToolbar {...defaultProps} onSearchChange={onSearchChange} />);

    const searchInput = screen.getByPlaceholderText(/ค้นหาตาม action/i);
    expect(searchInput).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'WO-2026' } });
    expect(onSearchChange).toHaveBeenCalledWith('WO-2026');
  });

  it('shows clear search button when searchTerm is present and clears on click', () => {
    const onSearchChange = vi.fn();
    render(<AuditFilterToolbar {...defaultProps} searchTerm="caliper" onSearchChange={onSearchChange} />);

    const clearBtn = screen.getByTitle('ล้างคำค้นหา');
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);
    expect(onSearchChange).toHaveBeenCalledWith('');
  });

  it('hides Row 2 contextual quick chips when module is ALL', () => {
    render(<AuditFilterToolbar {...defaultProps} selectedModule="ALL" />);
    expect(screen.queryByTestId('audit-quick-chips')).not.toBeInTheDocument();
  });

  it('renders Row 2 contextual quick chips with dynamic counts when a specific module is selected', () => {
    const onCategoryChange = vi.fn();
    render(
      <AuditFilterToolbar 
        {...defaultProps} 
        selectedModule="VCC" 
        selectedCategory="ALL"
        onCategoryChange={onCategoryChange} 
      />
    );

    const chipsContainer = screen.getByTestId('audit-quick-chips');
    expect(chipsContainer).toBeInTheDocument();

    // Check VCC categories rendered as chips
    expect(screen.getByRole('button', { name: /ทั้งหมดใน VCC/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /เครื่องมือวัด/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /แผนสอบเทียบ/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ใบสั่งงาน\/บันทึกผล/i })).toBeInTheDocument();

    // Clicking a chip calls onCategoryChange
    fireEvent.click(screen.getByRole('button', { name: /เครื่องมือวัด/i }));
    expect(onCategoryChange).toHaveBeenCalledWith('VCC_ASSET');
  });

  it('renders date inputs and triggers date callbacks', () => {
    const onDateFromChange = vi.fn();
    const onDateToChange = vi.fn();
    const onClearDate = vi.fn();

    render(
      <AuditFilterToolbar 
        {...defaultProps}
        dateFrom="2026-08-01"
        dateTo="2026-08-31"
        onDateFromChange={onDateFromChange}
        onDateToChange={onDateToChange}
        onClearDate={onClearDate}
      />
    );

    const fromInput = screen.getByLabelText(/วันที่เริ่มต้น/i);
    const toInput = screen.getByLabelText(/วันที่สิ้นสุด/i);
    const clearDateBtn = screen.getByTitle('ล้างช่วงวันที่');

    expect(fromInput.value).toBe('2026-08-01');
    expect(toInput.value).toBe('2026-08-31');
    expect(clearDateBtn).toBeInTheDocument();

    fireEvent.change(fromInput, { target: { value: '2026-08-05' } });
    expect(onDateFromChange).toHaveBeenCalledWith('2026-08-05');

    fireEvent.click(clearDateBtn);
    expect(onClearDate).toHaveBeenCalledTimes(1);
  });
});
