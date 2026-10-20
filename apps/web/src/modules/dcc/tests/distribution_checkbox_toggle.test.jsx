import React, { useState } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DistributionSetup from '../components/workflow/DistributionSetup';
import useStore from '../../../store/useStore';

// Wrapper component to test controlled parent state sync
const TestDistributionContainer = ({ ownerDept = 'PD', documentType = 'SOP' }) => {
  const [distributions, setDistributions] = useState([]);
  return (
    <div>
      <div data-testid="distributions-count">{distributions.length}</div>
      <DistributionSetup
        ownerDept={ownerDept}
        documentType={documentType}
        distributions={distributions}
        onChange={(newDist) => setDistributions(newDist)}
      />
    </div>
  );
};

describe('Distribution Station Checkbox Click, ID Normalization & Real-time Allocation Sync Tests', () => {
  beforeEach(() => {
    useStore.setState({
      currentUser: { id: 'U002', name: 'ธนาวุฒิ', department: 'PD', role: 'DEPT_ADMIN' },
      masterDepartments: [
        { id: 'PD', nameTh: 'ฝ่ายผลิต', name: 'Production (PD)', status: 'ACTIVE' },
        { id: 'QA', nameTh: 'ฝ่ายประกันคุณภาพ', name: 'Quality Assurance (QA)', status: 'ACTIVE' },
        { id: 'WH', nameTh: 'ฝ่ายคลังสินค้า', name: 'Warehouse (WH)', status: 'ACTIVE' }
      ],
      distributionLocations: [
        { id: 'PD-MASTER', departmentId: 'PD', name: 'PD Head Office', code: 'PD-OFFICE', isMasterOffice: true },
        { id: 'PD-L1', departmentId: 'PD', name: 'ขนม 1', code: 'PD-LINE-1' },
        { id: 'PD-L2', departmentId: 'PD', name: 'ขนม 2', code: 'PD-LINE-2' },
        { id: 'QA-MASTER', departmentId: 'QA', name: 'QA Head Office', code: 'QA-OFFICE', isMasterOffice: true },
        { id: 'QA-LAB', departmentId: 'QA', name: 'ห้องแล็บกลาง', code: 'QA-LAB' }
      ]
    });
  });

  it('Test Case 1: Master Station is locked as Copy 01 and cannot be toggled', () => {
    render(<TestDistributionContainer ownerDept="PD" />);

    // Master station row
    const masterBadge = screen.getByText('Master Copy 01 ล็อกถาวร');
    expect(masterBadge).toBeInTheDocument();

    // Find PD Head Office master row in right pane
    const masterStationText = screen.getAllByText(/PD Head Office/i)[0];
    expect(masterStationText).toBeInTheDocument();

    // Clicking master row should NOT trigger onChange or remove Master
    fireEvent.click(masterStationText);
    expect(screen.getByTestId('distributions-count').textContent).toBe('0'); // Master is separate, distributedCopies is 0
  });

  it('Test Case 2: Clicking station "ขนม 1" selects it in single click, assigns Copy 02 and updates department counter', () => {
    render(<TestDistributionContainer ownerDept="PD" />);

    // Initial state: PD counter is 1 จุด (Master Copy 01)
    const pdDeptButton = screen.getByRole('button', { name: /^PD\s*ฝ่ายผลิต/ });
    expect(pdDeptButton).toHaveTextContent('1 จุด');

    // Click on "ขนม 1"
    const stationRow = screen.getByText('ขนม 1').closest('div[role="button"]');
    expect(stationRow).toBeInTheDocument();
    
    fireEvent.click(stationRow);

    // After click:
    // 1. Badge "Copy 02" appears in station row and summary tray
    expect(screen.getAllByText(/Copy 02/i).length).toBeGreaterThanOrEqual(1);

    // 2. PD counter in left pane becomes "2 จุด"
    expect(pdDeptButton).toHaveTextContent('2 จุด');

    // 3. Summary Tray at bottom has "สำเนาที่จะพิมพ์ (2 ชุด)"
    expect(screen.getByText(/สำเนาที่จะพิมพ์ \(2 ชุด\)/i)).toBeInTheDocument();
    expect(screen.getByTestId('distributions-count').textContent).toBe('1'); // 1 distributed copy
  });

  it('Test Case 3: Clicking station "ขนม 1" again unselects it and re-indexes counters cleanly', () => {
    render(<TestDistributionContainer ownerDept="PD" />);

    const pdDeptButton = screen.getByRole('button', { name: /^PD\s*ฝ่ายผลิต/ });
    const stationRow = screen.getByText('ขนม 1').closest('div[role="button"]');

    // Select
    fireEvent.click(stationRow);
    expect(screen.getAllByText(/Copy 02/i).length).toBeGreaterThanOrEqual(1);
    expect(pdDeptButton).toHaveTextContent('2 จุด');

    // Unselect by clicking again
    fireEvent.click(stationRow);
    expect(screen.queryByText('Copy 02')).not.toBeInTheDocument();
    expect(pdDeptButton).toHaveTextContent('1 จุด');
    expect(screen.getByTestId('distributions-count').textContent).toBe('0');
  });

  it('Test Case 4: Multi-Department Selection: Switch to QA tab, select "QA Head Office" receives Copy 02 and updates QA counter', () => {
    render(<TestDistributionContainer ownerDept="PD" />);

    // Switch to QA Tab
    const qaDeptButton = screen.getByRole('button', { name: /^QA\s*ฝ่ายประกันคุณภาพ/ });
    fireEvent.click(qaDeptButton);

    // Initial QA count is empty (rendered as a dash)
    expect(qaDeptButton).toHaveTextContent('–');

    // Select QA Head Office
    const qaMasterRow = screen.getByText('QA Head Office').closest('div[role="button"]');
    expect(qaMasterRow).toBeInTheDocument();

    fireEvent.click(qaMasterRow);

    // QA count becomes 1 จุด
    expect(qaDeptButton).toHaveTextContent('1 จุด');

    // Badge Copy 02 appears
    expect(screen.getAllByText(/Copy 02/i).length).toBeGreaterThanOrEqual(1);

    // Switch back to PD Tab, select ขนม 1 -> receives Copy 03, total is 3
    const pdDeptButton = screen.getByRole('button', { name: /^PD\s*ฝ่ายผลิต/ });
    fireEvent.click(pdDeptButton);

    const khanom1Row = screen.getByText('ขนม 1').closest('div[role="button"]');
    fireEvent.click(khanom1Row);

    // Total copies in summary tray is 3
    expect(screen.getByText(/สำเนาที่จะพิมพ์ \(3 ชุด\)/i)).toBeInTheDocument();
  });

  it('Test Case 5: Keyboard navigation (Space/Enter) triggers selection cleanly', () => {
    render(<TestDistributionContainer ownerDept="PD" />);

    const stationRow = screen.getByText('ขนม 2').closest('div[role="button"]');
    expect(stationRow).toBeInTheDocument();

    // Trigger Enter key
    fireEvent.keyDown(stationRow, { key: 'Enter', code: 'Enter' });
    expect(screen.getAllByText(/Copy 02/i).length).toBeGreaterThanOrEqual(1);

    // Trigger Space key to uncheck
    fireEvent.keyDown(stationRow, { key: ' ', code: 'Space' });
    expect(screen.queryByText('Copy 02')).not.toBeInTheDocument();
  });
});
