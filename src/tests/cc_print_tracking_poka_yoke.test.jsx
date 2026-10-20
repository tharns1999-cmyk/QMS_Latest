import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../store/useStore';

// ─────────────────────────────────────────────────────────────────
// Store-level: markCopyPrinted
// ─────────────────────────────────────────────────────────────────
describe('markCopyPrinted store action', () => {
  const baseCopy = {
    id: 'CC-TEST-001',
    doc_id: 'DOC-001',
    document_code: 'WI-PD-01',
    document_title: 'Work Instruction PD',
    doc_version: '01',
    copy_no: '01',
    holder_dept: 'PD',
    department: 'PD',
    location: 'PD Station 1',
    status: 'PENDING_ISSUE',
    is_printed: false,
    print_count: 0,
    printed_at: null
  };

  beforeEach(() => {
    useStore.setState({
      currentUser: { id: 'U001', name: 'DCC Officer', role: 'DCC_ADMIN', isDcc: true },
      controlledCopyInstances: [{ ...baseCopy }],
      documentControlledCopies: [],
      controlledCopyAuditTrail: []
    });
  });

  it('sets is_printed=true after markCopyPrinted', () => {
    useStore.getState().markCopyPrinted('CC-TEST-001');
    const copy = useStore.getState().controlledCopyInstances.find(c => c.id === 'CC-TEST-001');
    expect(copy.is_printed).toBe(true);
  });

  it('sets printed_at to a valid ISO string', () => {
    useStore.getState().markCopyPrinted('CC-TEST-001');
    const copy = useStore.getState().controlledCopyInstances.find(c => c.id === 'CC-TEST-001');
    expect(copy.printed_at).toBeTruthy();
    expect(new Date(copy.printed_at).toISOString()).toBe(copy.printed_at);
  });

  it('increments print_count to 1 on first call', () => {
    useStore.getState().markCopyPrinted('CC-TEST-001');
    const copy = useStore.getState().controlledCopyInstances.find(c => c.id === 'CC-TEST-001');
    expect(copy.print_count).toBe(1);
  });

  it('increments print_count to 2 on second call (reprint tracking)', () => {
    useStore.getState().markCopyPrinted('CC-TEST-001');
    useStore.getState().markCopyPrinted('CC-TEST-001');
    const copy = useStore.getState().controlledCopyInstances.find(c => c.id === 'CC-TEST-001');
    expect(copy.print_count).toBe(2);
  });

  it('adds PRINT_COPY entry to controlledCopyAuditTrail', () => {
    useStore.getState().markCopyPrinted('CC-TEST-001');
    const entry = (useStore.getState().controlledCopyAuditTrail || []).find(e => e.action === 'PRINT_COPY');
    expect(entry).toBeDefined();
    expect(entry.id).toMatch(/^audit-print-/);
  });

  it('does not affect other copies with different ids', () => {
    useStore.setState({
      controlledCopyInstances: [
        { ...baseCopy, id: 'CC-TEST-001' },
        { ...baseCopy, id: 'CC-TEST-002', copy_no: '02', is_printed: false, print_count: 0 }
      ]
    });
    useStore.getState().markCopyPrinted('CC-TEST-001');
    const other = useStore.getState().controlledCopyInstances.find(c => c.id === 'CC-TEST-002');
    expect(other.is_printed).toBe(false);
    expect(other.print_count).toBe(0);
  });

  it('works on documentControlledCopies when controlledCopyInstances is empty', () => {
    useStore.setState({
      controlledCopyInstances: [],
      documentControlledCopies: [{ ...baseCopy, id: 'CC-DOC-001' }]
    });
    useStore.getState().markCopyPrinted('CC-DOC-001');
    const copy = (useStore.getState().documentControlledCopies || []).find(c => c.id === 'CC-DOC-001');
    expect(copy?.is_printed).toBe(true);
    expect(copy?.print_count).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────
// UI-level: Poka-Yoke guard
// ─────────────────────────────────────────────────────────────────
import ControlledCopyRegister from '../pages/ControlledCopy/ControlledCopyRegister';

const baseState = {
  currentUser: { id: 'U001', name: 'DCC Officer', role: 'DCC_ADMIN', isDcc: true },
  documents: [{ id: 'DOC-PD-01', title: 'WI-PD-01', code: 'WI-PD-01', document_code: 'WI-PD-01', name: 'Work Instruction PD', document_title: 'Work Instruction PD', department: 'PD', rev: '01', status: 'EFFECTIVE' }],
  externalDocuments: [],
  tasks: [], controlledCopyAuditTrail: [], actionLog: [], masterDepartments: [], departments: [], distributionLocations: [], copyDispositionRecords: []
};

describe('ControlledCopyRegister Tab1 - Print-Status Badge & Button Hierarchy', () => {
  beforeEach(() => {
    useStore.setState({
      ...baseState,
      controlledCopyInstances: [
        { id: 'CC-UNPRINTED', doc_id: 'DOC-PD-01', document_code: 'WI-PD-01', document_title: 'Work Instruction PD', doc_version: '01', copy_no: '01', holder_dept: 'PD', department: 'PD', location: 'PD Station 1', status: 'PENDING_ISSUE', is_printed: false },
        { id: 'CC-PRINTED', doc_id: 'DOC-PD-01', document_code: 'WI-PD-01', document_title: 'Work Instruction PD', doc_version: '01', copy_no: '02', holder_dept: 'PD', department: 'PD', location: 'PD Station 2', status: 'PENDING_ISSUE', is_printed: true, print_count: 1, printed_at: new Date().toISOString() }
      ],
      documentControlledCopies: []
    });
  });

  it('shows "ยังไม่ได้พิมพ์" badge for unprinted and "พิมพ์แล้ว" for printed', () => {
    render(<MemoryRouter initialEntries={['/controlled-copy?tab=PENDING_ISSUE']}><ControlledCopyRegister /></MemoryRouter>);
    expect(screen.getByText('ยังไม่ได้พิมพ์')).toBeInTheDocument();
    expect(screen.getByText('พิมพ์แล้ว')).toBeInTheDocument();
  });

  it('unprinted copy has primary blue print button', () => {
    render(<MemoryRouter initialEntries={['/controlled-copy?tab=PENDING_ISSUE']}><ControlledCopyRegister /></MemoryRouter>);
    const printBtns = screen.getAllByText('พิมพ์สำเนา');
    expect(printBtns.length).toBeGreaterThanOrEqual(1);
    expect(printBtns[0].closest('button').className).toContain('bg-blue-600');
  });

  it('printed copy has secondary "พิมพ์อีกครั้ง" button', () => {
    render(<MemoryRouter initialEntries={['/controlled-copy?tab=PENDING_ISSUE']}><ControlledCopyRegister /></MemoryRouter>);
    const btn = screen.getByText('พิมพ์อีกครั้ง').closest('button');
    expect(btn.className).toContain('bg-slate-100');
  });

  it('clicking dispatch on unprinted copy opens warning modal', () => {
    render(<MemoryRouter initialEntries={['/controlled-copy?tab=PENDING_ISSUE']}><ControlledCopyRegister /></MemoryRouter>);
    const btns = screen.getAllByText('บันทึกส่งมอบ');
    const unprintedBtn = btns.find(el => el.closest('button')?.className.includes('border-slate-300'));
    expect(unprintedBtn).toBeDefined();
    fireEvent.click(unprintedBtn.closest('button'));
    expect(screen.getByText('เอกสารนี้ยังไม่ได้สั่งพิมพ์สำเนาควบคุม')).toBeInTheDocument();
    expect(screen.getByText('สั่งพิมพ์และบันทึกส่งมอบทันที')).toBeInTheDocument();
  });

  it('modal opens showing warning title when dispatch guard triggers', () => {
    render(<MemoryRouter initialEntries={['/controlled-copy?tab=PENDING_ISSUE']}><ControlledCopyRegister /></MemoryRouter>);
    const btns = screen.getAllByText('บันทึกส่งมอบ');
    const unprintedBtn = btns.find(el => el.closest('button')?.className.includes('border-slate-300'));
    fireEvent.click(unprintedBtn.closest('button'));
    // Modal must show all 3 action options
    expect(screen.getByText('สั่งพิมพ์และบันทึกส่งมอบทันที')).toBeInTheDocument();
    expect(screen.getByText('ยืนยันส่งมอบ (ข้ามการพิมพ์)')).toBeInTheDocument();
    expect(screen.getByText('กลับไปพิมพ์ก่อน')).toBeInTheDocument();
  });
});

describe('ControlledCopyRegister Tab2 - Reprint Fallback Button', () => {
  beforeEach(() => {
    useStore.setState({
      ...baseState,
      controlledCopyInstances: [
        { id: 'CC-DISPATCHED-01', doc_id: 'DOC-PD-01', document_code: 'WI-PD-01', document_title: 'Work Instruction PD', doc_version: '01', copy_no: '01', holder_dept: 'QA', department: 'QA', target_department: 'QA', location: 'QA Lab', status: 'DISPATCHED_PENDING_RECEIPT', dispatched_at: new Date().toISOString(), dispatched_by: 'DCC Officer', is_printed: true }
      ],
      documentControlledCopies: []
    });
  });

  it('renders "พิมพ์ซ้ำ" Reprint button in dispatched tracking tab', () => {
    render(<MemoryRouter initialEntries={['/controlled-copy?tab=DISPATCHED_TRACKING']}><ControlledCopyRegister /></MemoryRouter>);
    const reprintBtn = screen.getByText('พิมพ์ซ้ำ');
    expect(reprintBtn).toBeInTheDocument();
    expect(reprintBtn.closest('button').title).toContain('Reprint');
  });

  it('shows "รอปลายทางตรวจรับ" status alongside Reprint button', () => {
    render(<MemoryRouter initialEntries={['/controlled-copy?tab=DISPATCHED_TRACKING']}><ControlledCopyRegister /></MemoryRouter>);
    expect(screen.getByText('รอปลายทางตรวจรับ')).toBeInTheDocument();
  });
});