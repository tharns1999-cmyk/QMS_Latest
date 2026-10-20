import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore, { buildControlledCopyId, deduplicateControlledCopies, sanitizeControlledCopies } from '../../../store/useStore';
import ControlledCopyRegister from '../pages/ControlledCopy/ControlledCopyRegister';

describe('Controlled Copy Auto-Dispatch Bypass Prevention & Deduplication Lifecycle', () => {
  beforeEach(() => {
    useStore.getState().resetStore();
  });

  it('1. buildControlledCopyId generates deterministic unique ID adhering to ISO 9001 pattern', () => {
    const id1 = buildControlledCopyId('QM-QC-01', '00', 'Copy 01');
    expect(id1).toBe('COPY_QM-QC-01_REV00_01');

    const id2 = buildControlledCopyId('QM-QC-01', '01', '01');
    expect(id2).toBe('COPY_QM-QC-01_REV01_01');

    const id3 = buildControlledCopyId('WI-PD-001', 'Rev.02', 'CC-002');
    expect(id3).toBe('COPY_WI-PD-001_REV02_02');
  });

  it('2. deduplicateControlledCopies eliminates duplicate Copy 01 records', () => {
    const corruptedCopies = [
      {
        id: 'inst-1',
        doc_code: 'QM-QC-01',
        rev: '00',
        copy_no: '01',
        status: 'PENDING_ISSUE',
        is_active_in_field: false
      },
      {
        id: 'inst-2',
        doc_code: 'QM-QC-01',
        rev: '00',
        copy_no: '01',
        status: 'PENDING_ISSUE',
        is_active_in_field: false
      },
      {
        id: 'inst-3',
        doc_code: 'QM-QC-01',
        rev: '00',
        copy_no: '02',
        status: 'PENDING_ISSUE',
        is_active_in_field: false
      }
    ];

    const result = deduplicateControlledCopies(corruptedCopies);
    expect(result).toHaveLength(2);
    const copy01s = result.filter(c => c.copy_no === '01');
    expect(copy01s).toHaveLength(1);
  });

  it('3. sanitizeControlledCopies purges QM-QC-01 phantom records and unverified 2026-10-06 receipts', () => {
    const testCopies = [
      {
        id: 'COPY_QM-QC-01_REV00_01_A',
        doc_code: 'QM-QC-01',
        rev: '00',
        copy_no: '01',
        status: 'ISSUED_ACTIVE',
        is_active_in_field: true
      },
      {
        id: 'COPY_QM-QC-01_REV00_01_B',
        doc_code: 'QM-QC-01',
        rev: '00',
        copy_no: '01',
        status: 'ISSUED_ACTIVE',
        is_active_in_field: true
      },
      {
        id: 'COPY_QM-QC-01_REV01_01',
        doc_code: 'QM-QC-01',
        rev: '01',
        copy_no: '01',
        status: 'ISSUED_ACTIVE',
        receipt_confirmed_at: '2026-10-06T09:00:00.000Z',
        received_by: null,
        is_active_in_field: true
      }
    ];

    const sanitized = sanitizeControlledCopies(testCopies);
    // Duplicate Rev.00 Copy 01 must be reduced to 1 record and set to SUPERSEDED_PENDING_RECALL
    const rev00Copies = sanitized.filter(c => c.doc_code === 'QM-QC-01' && c.rev === '00');
    expect(rev00Copies).toHaveLength(1);
    expect(['PENDING_RECALL', 'SUPERSEDED_PENDING_RECALL']).toContain(rev00Copies[0].status);
    expect(rev00Copies[0].is_active_in_field).toBe(false);

    // Rev.01 unverified copy must be reset to PENDING_ISSUE without receipt claims
    const rev01Copy = sanitized.find(c => c.doc_code === 'QM-QC-01' && c.rev === '01');
    expect(rev01Copy).toBeDefined();
    expect(rev01Copy.status).toBe('PENDING_ISSUE');
    expect(rev01Copy.is_active_in_field).toBe(false);
    expect(rev01Copy.received_by).toBeNull();
    expect(rev01Copy.receipt_confirmed_at).toBeNull();
  });

  it('4. Approving DAR creates copy in PENDING_ISSUE queue, never IN_USE, and idempotent against double execution', () => {
    const store = useStore.getState();

    const testDar = {
      id: 'DAR-QC-TEST-01',
      dar_no: 'DAR-QC-TEST-01',
      title: 'QM-QC-01: Quality Manual System',
      docIdInput: 'QM-QC-01',
      document_code: 'QM-QC-01',
      type: 'NEW_DOCUMENT',
      department: 'QC',
      rev: '00',
      revision: '00',
      status: 'APPROVED',
      distributions: [
        { departmentId: 'QC', station_name: 'QC Head Office', copy_no: '01', isOwner: true }
      ]
    };

    useStore.setState({
      dars: [testDar],
      darRequests: [testDar],
      documents: [],
      controlledCopyInstances: [],
      documentControlledCopies: []
    });

    // Execute first publish
    store.publishNewDocumentDar('DAR-QC-TEST-01');

    let state = useStore.getState();
    let copies = state.controlledCopyInstances;
    expect(copies).toHaveLength(1);
    expect(copies[0].id).toBe('COPY_QM-QC-01_REV00_01');
    expect(copies[0].status).toBe('PENDING_ISSUE');
    expect(copies[0].is_active_in_field).toBe(false);
    expect(copies[0].received_by).toBeNull();
    expect(copies[0].received_at).toBeNull();

    // Execute second publish (double invocation simulation)
    store.publishNewDocumentDar('DAR-QC-TEST-01');

    state = useStore.getState();
    copies = state.controlledCopyInstances;
    // Must strictly remain 1 copy, no duplicate Copy 01
    expect(copies).toHaveLength(1);
    expect(copies[0].id).toBe('COPY_QM-QC-01_REV00_01');
  });

  it('5. ControlledCopyRegister Tab 4 strictly excludes PENDING_ISSUE and DISPATCHED copies', () => {
    useStore.setState({
      controlledCopyInstances: [
        {
          id: 'COPY_QM-QC-01_REV00_01',
          doc_id: 'DOC-QM-01',
          doc_code: 'QM-QC-01',
          docTitle: 'คู่มือคุณภาพ',
          rev: '00',
          copy_no: '01',
          status: 'PENDING_ISSUE',
          is_active_in_field: false,
          holder_dept: 'QC'
        },
        {
          id: 'COPY_QM-QC-01_REV00_02',
          doc_id: 'DOC-QM-01',
          doc_code: 'QM-QC-01',
          docTitle: 'คู่มือคุณภาพ',
          rev: '00',
          copy_no: '02',
          status: 'DISPATCHED_PENDING_RECEIPT',
          is_active_in_field: false,
          holder_dept: 'PD'
        },
        {
          id: 'COPY_QM-QC-01_REV00_03',
          doc_id: 'DOC-QM-01',
          doc_code: 'QM-QC-01',
          docTitle: 'คู่มือคุณภาพ',
          rev: '00',
          copy_no: '03',
          status: 'ISSUED_ACTIVE',
          is_active_in_field: true,
          receipt_confirmed_at: '2026-08-01T10:00:00Z',
          receipt_confirmed_by: 'สมชาย ควบคุมคุณภาพ',
          holder_dept: 'QC'
        }
      ],
      documents: [
        {
          id: 'DOC-QM-01',
          title: 'QM-QC-01',
          name: 'คู่มือคุณภาพ',
          revision: '00',
          status: 'EFFECTIVE',
          department: 'QC'
        }
      ]
    });

    render(
      <MemoryRouter initialEntries={['/controlled-copy?tab=ACTIVE_REGISTER']}>
        <ControlledCopyRegister />
      </MemoryRouter>
    );

    // Tab 4 renders QM-QC-01 with 1 active copy in master row
    const masterRow = screen.getByText('QM-QC-01').closest('tr');
    expect(masterRow).toBeInTheDocument();
    expect(screen.getByText(/1 เล่มในจุดใช้งาน/i)).toBeInTheDocument();

    // Click master row to expand accordion
    fireEvent.click(masterRow);

    // Tab 4 must render only Copy 03 which is genuinely active in field
    expect(screen.getByText('Copy 03')).toBeInTheDocument();

    // Copy 01 (PENDING_ISSUE) and Copy 02 (DISPATCHED) must NOT appear in Tab 4
    expect(screen.queryByText('Copy 01')).not.toBeInTheDocument();
    expect(screen.queryByText('Copy 02')).not.toBeInTheDocument();
  });

  it('6. Revision lifecycle syncs revision number without desync', () => {
    const store = useStore.getState();

    const existingDoc = {
      id: 'DOC-QM-QC-01-R00',
      title: 'QM-QC-01',
      document_code: 'QM-QC-01',
      revision: '00',
      rev: '00',
      status: 'EFFECTIVE',
      department: 'QC'
    };

    const initialCopies = [
      {
        id: 'COPY_QM-QC-01_REV00_01',
        doc_id: existingDoc.id,
        doc_code: 'QM-QC-01',
        rev: '00',
        copy_no: '01',
        status: 'ISSUED_ACTIVE',
        is_active_in_field: true,
        holder_dept: 'QC'
      }
    ];

    const darRevision = {
      id: 'DAR-2026-REV-01',
      dar_no: 'DAR-2026-REV-01',
      document_code: 'QM-QC-01',
      doc_code: 'QM-QC-01',
      title: 'QM-QC-01',
      type: 'REVISION',
      targetRevision: '01',
      target_revision: '01',
      rev: '01',
      status: 'APPROVED',
      distributions: [
        { departmentId: 'QC', station_name: 'QC Head Office', copy_no: '01', isOwner: true }
      ]
    };

    useStore.setState({
      documents: [existingDoc],
      dars: [darRevision],
      darRequests: [darRevision],
      controlledCopyInstances: initialCopies,
      documentControlledCopies: initialCopies
    });

    store.promoteDarToEffective('DAR-2026-REV-01');

    const state = useStore.getState();
    const copies = state.controlledCopyInstances;

    // Rev.00 copy must now be SUPERSEDED_PENDING_RECALL and not active in field
    const oldCopy = copies.find(c => c.rev === '00' && c.copy_no === '01');
    expect(oldCopy).toBeDefined();
    expect(['PENDING_RECALL', 'SUPERSEDED_PENDING_RECALL']).toContain(oldCopy.status);
    expect(oldCopy.is_active_in_field).toBe(false);

    // Rev.01 copy must be created in PENDING_ISSUE with matching revision
    const newCopy = copies.find(c => c.rev === '01' && c.copy_no === '01');
    expect(newCopy).toBeDefined();
    expect(newCopy.id).toBe('COPY_QM-QC-01_REV01_01');
    expect(newCopy.status).toBe('PENDING_ISSUE');
    expect(newCopy.is_active_in_field).toBe(false);
    expect(newCopy.rev).toBe('01');
  });
});
