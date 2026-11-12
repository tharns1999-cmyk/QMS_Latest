import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SearchableSelect } from './SearchableSelect';

describe('SearchableSelect Component Tests', () => {
  const sampleOptions = [
    {
      value: 'AST-001',
      label: 'Digital Vernier Caliper 150mm',
      subLabel: 'Mitutoyo - SN: 1049281',
      badge: 'QC',
      keywords: ['vernier', 'caliper', 'เวอร์เนียร์']
    },
    {
      value: 'AST-002',
      label: 'Micrometer 0-25mm',
      subLabel: 'Mitutoyo - SN: 994821',
      badge: 'QC',
      keywords: ['micro', 'ไมโครมิเตอร์']
    },
    {
      value: 'AST-003',
      label: 'Analytical Balance 0.1mg',
      subLabel: 'Mettler Toledo - SN: BAL-01',
      badge: 'LB',
      keywords: ['balance', 'เครื่องชั่ง']
    },
    {
      value: 'AST-004',
      label: 'Temperature Chamber',
      subLabel: 'ESPEC - SN: TC-09',
      badge: 'EN',
      disabled: true
    }
  ];

  it('1. Renders placeholder when no value is selected', () => {
    render(<SearchableSelect options={sampleOptions} value="" placeholder="เลือกเครื่องมือ..." />);
    const trigger = screen.getByTestId('searchable-select-trigger');
    expect(within(trigger).getByText('เลือกเครื่องมือ...')).toBeInTheDocument();
  });

  it('2. Renders selected label and badge when value is passed', () => {
    render(<SearchableSelect options={sampleOptions} value="AST-001" />);
    const trigger = screen.getByTestId('searchable-select-trigger');
    expect(within(trigger).getByText('Digital Vernier Caliper 150mm')).toBeInTheDocument();
    expect(within(trigger).getByText('QC')).toBeInTheDocument();
  });

  it('3. Opens dropdown on click and displays all enabled options', () => {
    render(<SearchableSelect options={sampleOptions} value="" placeholder="เลือกเครื่องมือ..." />);
    const trigger = screen.getByTestId('searchable-select-trigger');
    fireEvent.click(trigger);

    expect(screen.getByPlaceholderText('พิมพ์ค้นหา...')).toBeInTheDocument();
    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByText('Digital Vernier Caliper 150mm')).toBeInTheDocument();
    expect(within(listbox).getByText('Micrometer 0-25mm')).toBeInTheDocument();
    expect(within(listbox).getByText('Analytical Balance 0.1mg')).toBeInTheDocument();
  });

  it('4. Filters options case-insensitively by label, subLabel, badge, or keywords', () => {
    render(<SearchableSelect options={sampleOptions} value="" />);
    const trigger = screen.getByTestId('searchable-select-trigger');
    fireEvent.click(trigger);

    const searchInput = screen.getByPlaceholderText('พิมพ์ค้นหา...');
    const listbox = screen.getByRole('listbox');

    // 4.1 Search by label
    fireEvent.change(searchInput, { target: { value: 'micro' } });
    expect(within(listbox).getByText('Micrometer 0-25mm')).toBeInTheDocument();
    expect(within(listbox).queryByText('Analytical Balance 0.1mg')).not.toBeInTheDocument();

    // 4.2 Search by subLabel (e.g., Mettler)
    fireEvent.change(searchInput, { target: { value: 'mettler' } });
    expect(within(listbox).getByText('Analytical Balance 0.1mg')).toBeInTheDocument();
    expect(within(listbox).queryByText('Micrometer 0-25mm')).not.toBeInTheDocument();

    // 4.3 Search by Thai keyword
    fireEvent.change(searchInput, { target: { value: 'เวอร์เนียร์' } });
    expect(within(listbox).getByText('Digital Vernier Caliper 150mm')).toBeInTheDocument();
    expect(within(listbox).queryByText('Analytical Balance 0.1mg')).not.toBeInTheDocument();

    // 4.4 Search with no match shows emptyMessage
    fireEvent.change(searchInput, { target: { value: 'xyzไม่มีข้อมูล' } });
    expect(screen.getByText('ไม่พบข้อมูลที่ค้นหา')).toBeInTheDocument();
  });

  it('5. Mouse selection: clicking option triggers onChange and closes dropdown', () => {
    const handleChange = vi.fn();
    render(<SearchableSelect options={sampleOptions} value="" onChange={handleChange} />);
    const trigger = screen.getByTestId('searchable-select-trigger');
    fireEvent.click(trigger);

    const listbox = screen.getByRole('listbox');
    const optionItem = within(listbox).getByText('Micrometer 0-25mm');
    fireEvent.click(optionItem);

    expect(handleChange).toHaveBeenCalledWith(
      'AST-002',
      expect.objectContaining({ value: 'AST-002', label: 'Micrometer 0-25mm' }),
      expect.objectContaining({ target: { value: 'AST-002', name: '', id: '' } })
    );

    // Dropdown closes after selection
    expect(screen.queryByPlaceholderText('พิมพ์ค้นหา...')).not.toBeInTheDocument();
  });

  it('6. Clearable: clicking X clears the selected value', () => {
    const handleChange = vi.fn();
    render(<SearchableSelect options={sampleOptions} value="AST-001" onChange={handleChange} clearable={true} />);

    const clearBtn = screen.getByRole('button', { name: 'ล้างการเลือก' });
    fireEvent.click(clearBtn);

    expect(handleChange).toHaveBeenCalledWith(
      '',
      null,
      expect.objectContaining({
        target: expect.objectContaining({ value: '' })
      })
    );
  });

  it('7. Keyboard Navigation: ArrowDown, ArrowUp, and Enter to select', () => {
    const handleChange = vi.fn();
    render(<SearchableSelect options={sampleOptions} value="" onChange={handleChange} />);
    const trigger = screen.getByTestId('searchable-select-trigger');

    // 7.1 ArrowDown opens dropdown when closed
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByPlaceholderText('พิมพ์ค้นหา...')).toBeInTheDocument();

    // 7.2 ArrowDown highlights options in order
    fireEvent.keyDown(trigger, { key: 'ArrowDown' }); // index 0 (AST-001)
    fireEvent.keyDown(trigger, { key: 'ArrowDown' }); // index 1 (AST-002)

    // 7.3 Enter selects the highlighted option
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(handleChange).toHaveBeenCalledWith(
      'AST-002',
      expect.objectContaining({ value: 'AST-002' }),
      expect.anything()
    );
  });

  it('8. Escape Key Isolation: closes dropdown and stops propagation to protect outer modal', () => {
    const outerModalKeyDown = vi.fn();
    render(
      <div onKeyDown={outerModalKeyDown}>
        <SearchableSelect options={sampleOptions} value="" />
      </div>
    );

    const trigger = screen.getByTestId('searchable-select-trigger');
    fireEvent.click(trigger);
    expect(screen.getByPlaceholderText('พิมพ์ค้นหา...')).toBeInTheDocument();

    // Press Escape while dropdown is open
    const searchInput = screen.getByPlaceholderText('พิมพ์ค้นหา...');
    fireEvent.keyDown(searchInput, { key: 'Escape' });

    // Dropdown must close
    expect(screen.queryByPlaceholderText('พิมพ์ค้นหา...')).not.toBeInTheDocument();

    // Outer modal keydown listener MUST NOT be called!
    expect(outerModalKeyDown).not.toHaveBeenCalled();
  });

  it('9. Disabled options cannot be selected', () => {
    const handleChange = vi.fn();
    render(<SearchableSelect options={sampleOptions} value="" onChange={handleChange} />);
    const trigger = screen.getByTestId('searchable-select-trigger');
    fireEvent.click(trigger);

    const listbox = screen.getByRole('listbox');
    const disabledOption = within(listbox).getByText('Temperature Chamber');
    fireEvent.click(disabledOption);

    expect(handleChange).not.toHaveBeenCalled();
  });
});
