import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore, { getActiveDarForDocument, IN_FLIGHT_DAR_STATUSES } from '../../../store/useStore';
import MasterList from '../pages/MasterList/MasterList';

describe('Enforce Strict Document Lock (Prevent Duplicate In-Flight DARs)', () => {
  beforeEach(() => {
    useStore.setState({
      currentUser: { id: 'u-dcc-01', name: 'DCC Admin', role: 'DCC_ADMIN', department: 'DC', isDcc: true },
      documents: [
        {
          id: 'doc-sop-qc-01',
          code: 'SOP-QC-01',
          document_code: 'SOP-QC-01',
          doc_code: 'SOP-QC-01',
          title: 'คู่มือการควบคุมคุณภาพ',
          department: 'QC',
          status: 'ACTIVE',
          revision: '01'
        },
        {
          id: 'doc-wi-pd-01',
          code: 'WI-PD-01',
          document_code: 'WI-PD-01',
          doc_code: 'WI-PD-01',
          title: 'ขั้นตอนการผลิต',
          department: 'PD',
          status: 'ACTIVE',
          revision: '00'
        }
      ],
      dars: [
        {
          id: 'DAR-2026-004',
          dar_no: 'DAR-2026-004',
          darNo: 'DAR-2026-004',
          document_code: 'SOP-QC-01',
          doc_code: 'SOP-QC-01',
          type: 'OBSOLETE',
          status: 'PENDING_REVIEW'
        }
      ],
      darRequests: []
    });
  });

  it('1. Helper correctly identifies in-flight DAR vs terminal statuses', () => {
    const dars = [
      { id: '1', dar_no: 'DAR-001', document_code: 'DOC-A', status: 'PENDING_REVIEW' },
      { id: '2', dar_no: 'DAR-002', document_code: 'DOC-B', status: 'COMPLETED' },
      { id: '3', dar_no: 'DAR-003', document_code: 'DOC-C', status: 'REJECTED' },
      { id: '4', dar_no: 'DAR-004', document_code: 'DOC-D', status: 'CANCELLED' }
    ];

    expect(getActiveDarForDocument(dars, 'DOC-A')).toBeTruthy();
    expect(getActiveDarForDocument(dars, 'DOC-A')?.dar_no).toBe('DAR-001');

    // Terminal statuses should return null
    expect(getActiveDarForDocument(dars, 'DOC-B')).toBeNull();
    expect(getActiveDarForDocument(dars, 'DOC-C')).toBeNull();
    expect(getActiveDarForDocument(dars, 'DOC-D')).toBeNull();

    // Verify all in-flight statuses
    IN_FLIGHT_DAR_STATUSES.forEach(status => {
      const testDars = [{ id: '99', dar_no: 'DAR-99', doc_code: 'DOC-Z', status }];
      expect(getActiveDarForDocument(testDars, 'DOC-Z')).toBeTruthy();
    });
  });

  it('2. MasterList displays lock badge for documents with active in-flight DAR', () => {
    render(
      <MemoryRouter>
        <MasterList />
      </MemoryRouter>
    );

    // SOP-QC-01 has active DAR-2026-004
    const lockBadges = screen.getAllByText(/ติดคำร้อง DAR-2026-004/i);
    expect(lockBadges.length).toBeGreaterThan(0);

    // WI-PD-01 does NOT have active DAR, so no lock badge for WI-PD-01
    expect(screen.queryByText(/ติดคำร้อง.*WI-PD-01/i)).not.toBeInTheDocument();
  });

  it('3. MasterList disables "ขอแก้ไข" and "ขอยกเลิก" with lock title/tooltip for locked document', () => {
    render(
      <MemoryRouter>
        <MasterList />
      </MemoryRouter>
    );

    // Row for SOP-QC-01 should have disabled revision & obsolete buttons
    const reviseButtons = screen.getAllByRole('button', { name: /ขอแก้ไขเอกสาร/i });
    const obsoleteButtons = screen.getAllByRole('button', { name: /ขอยกเลิกเอกสาร/i });

    // The first row is SOP-QC-01 which is locked
    const lockedReviseBtn = reviseButtons[0];
    const lockedObsoleteBtn = obsoleteButtons[0];

    expect(lockedReviseBtn).toBeDisabled();
    expect(lockedObsoleteBtn).toBeDisabled();
    expect(lockedReviseBtn.getAttribute('title')).toContain('DAR-2026-004');
    expect(lockedObsoleteBtn.getAttribute('title')).toContain('DAR-2026-004');

    // The second row is WI-PD-01 which is NOT locked
    const freeReviseBtn = reviseButtons[1];
    const freeObsoleteBtn = obsoleteButtons[1];

    expect(freeReviseBtn).not.toBeDisabled();
    expect(freeObsoleteBtn).not.toBeDisabled();
  });

  it('4. Store Mutex Guard throws Error when attempting to add or create duplicate DAR for locked doc', () => {
    // Attempting to add another DAR for SOP-QC-01 should throw error
    expect(() => {
      useStore.getState().addDar({
        document_code: 'SOP-QC-01',
        type: 'REVISION',
        title: 'Revise SOP-QC-01',
        department: 'QC'
      });
    }).toThrow(/ไม่สามารถสร้างคำร้องได้ เนื่องจากเอกสาร SOP-QC-01 มีคำร้อง DAR-2026-004 อยู่ระหว่างดำเนินการ/);

    expect(() => {
      useStore.getState().addDar({
        doc_code: 'SOP-QC-01',
        type: 'OBSOLETE',
        title: 'Obsolete SOP-QC-01',
        department: 'QC'
      });
    }).toThrow(/ไม่สามารถสร้างคำร้องได้ เนื่องจากเอกสาร SOP-QC-01 มีคำร้อง DAR-2026-004 อยู่ระหว่างดำเนินการ/);

    // Adding DAR for WI-PD-01 should succeed without throwing
    expect(() => {
      useStore.getState().addDar({
        id: 'DAR-2026-099',
        dar_no: 'DAR-2026-099',
        document_code: 'WI-PD-01',
        type: 'REVISION',
        title: 'Revise WI-PD-01',
        department: 'PD'
      });
    }).not.toThrow();
  });

  it('5. Clean duplicate test data handles DAR-2026-005 by setting it to CANCELLED', () => {
    useStore.setState({
      dars: [
        {
          id: 'DAR-2026-004',
          dar_no: 'DAR-2026-004',
          document_code: 'SOP-QC-01',
          status: 'PENDING_REVIEW'
        },
        {
          id: 'DAR-2026-005',
          dar_no: 'DAR-2026-005',
          document_code: 'SOP-QC-01',
          status: 'PENDING_REVIEW'
        }
      ]
    });

    useStore.getState().cleanDuplicateDars();

    const dars = useStore.getState().dars;
    const dar004 = dars.find(d => d.id === 'DAR-2026-004');
    const dar005 = dars.find(d => d.id === 'DAR-2026-005');

    expect(dar004.status).toBe('PENDING_REVIEW');
    expect(dar005.status).toBe('CANCELLED');
  });
});
