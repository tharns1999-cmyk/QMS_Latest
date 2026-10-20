import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import ControlledCopyRegister from '../pages/ControlledCopy/ControlledCopyRegister';

describe('Controlled Copy Pending Issue Table (Column 1 Resolution & Non-Duplication)', () => {
  beforeEach(() => {
    useStore.setState({
      currentUser: { id: 'U001', name: 'DCC Officer', role: 'DCC_ADMIN', isDcc: true },
      documents: [
        {
          id: 'DOC-QC-001',
          title: 'WI-QC-01',
          code: 'WI-QC-01',
          document_code: 'WI-QC-01',
          name: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
          document_title: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
          department: 'QC',
          rev: '01',
          status: 'EFFECTIVE'
        }
      ],
      externalDocuments: [],
      controlledCopyInstances: [
        {
          id: 'CC-PENDING-01',
          doc_id: 'DOC-QC-001',
          document_code: 'WI-QC-01',
          document_title: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
          doc_version: '01',
          copy_no: '01',
          holder_dept: 'QC',
          department: 'QC',
          location: 'Lab QC 1',
          status: 'PENDING_ISSUE'
        },
        {
          id: 'CC-PENDING-02',
          doc_id: 'DOC-QC-001',
          // doc_code and document_code missing, docTitle has Thai title (legacy buggy state)
          doc_code: null,
          document_code: null,
          docTitle: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
          docName: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
          doc_version: '01',
          copy_no: '02',
          holder_dept: 'PD',
          department: 'PD',
          location: 'Production Station 2',
          status: 'PENDING_ISSUE'
        }
      ],
      documentControlledCopies: []
    });
  });

  it('renders document_code in blue badge and document_title on line below without duplicates', () => {
    render(
      <MemoryRouter initialEntries={['/controlled-copy?tab=PENDING_ISSUE']}>
        <ControlledCopyRegister />
      </MemoryRouter>
    );

    // Both rows must display the alphanumeric document code in badge chip
    const badges = screen.getAllByText('WI-QC-01');
    expect(badges.length).toBeGreaterThanOrEqual(2);

    // Each badge must have the blue badge styling
    badges.forEach(badge => {
      expect(badge.className).toContain('text-blue-700');
      expect(badge.className).toContain('bg-blue-50');
      expect(badge.className).toContain('border-blue-200');
    });

    // Thai document title should be displayed as document title text below
    const titles = screen.getAllByText('ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า');
    expect(titles.length).toBeGreaterThanOrEqual(2);

    // Ensure the badge chip NEVER contains Thai title text
    badges.forEach(badge => {
      expect(badge.textContent).not.toContain('ขั้นตอน');
    });
  });

  it('verifies useStore issueControlledCopy correctly populates document_code and document_title', () => {
    const store = useStore.getState();
    store.issueControlledCopy('WI-QC-01', 'WH', 'Warehouse Bay 3');

    const state = useStore.getState();
    const copies = state.documentControlledCopies || state.controlledCopyInstances;
    const newlyIssued = copies.find(c => c.location === 'Warehouse Bay 3');

    expect(newlyIssued).toBeDefined();
    expect(newlyIssued.document_code).toBe('WI-QC-01');
    expect(newlyIssued.doc_code).toBe('WI-QC-01');
    expect(newlyIssued.document_title).toBe('ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า');
    expect(newlyIssued.status).toBe('PENDING_ISSUE');
  });
});
