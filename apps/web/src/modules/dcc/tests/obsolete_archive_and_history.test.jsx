/**
 * @file obsolete_archive_and_history.test.jsx
 * @description Integration tests for the full Obsolete Document Lifecycle:
 *   1. publishObsoleteDar  — EFFECTIVE → OBSOLETE, copies → PENDING_RECALL, task created
 *   2. completeCopyRecallAndArchive — STAMP_AND_ARCHIVE path (→ ARCHIVED_OBSOLETE)
 *   3. completeCopyRecallAndArchive — DESTROY_SCRAP path (→ DESTROYED)
 *   4. DccRecallActionModal — renders correctly and validates before confirm
 *   5. Zero Hard Delete  — original doc still present in state after publish
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import useStore from '../../../store/useStore';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** Reset Zustand store to a fresh seeded state for each test */
const seedState = () => {

  // Minimal document seed
  const testDoc = {
    id: 'doc-test-001',
    title: 'QA-SOP-001',
    name: 'การตรวจสอบคุณภาพวัตถุดิบ',
    status: 'EFFECTIVE',
    rev: '03',
    department: 'QA',
    controlledCopy: 3,
    effectiveDate: '2025-01-01',
    distributions: [{ departmentId: 'QA' }, { departmentId: 'PD' }],
    access_control: { scope: 'GENERAL' }
  };

  // Minimal DAR seed (OBSOLETE request)
  const testDar = {
    id: 'dar-obs-test-001',
    dar_no: 'DAR-OBS-2025-001',
    type: 'OBSOLETE',
    request_type: 'OBSOLETE',
    status: 'PENDING_GM_APPROVAL',
    docIdRef: 'QA-SOP-001',
    docCode: 'QA-SOP-001',
    title: 'QA-SOP-001',
    effectiveDate: '2025-06-01',
    obsoleteReason: 'เอกสารถูกทดแทนด้วยระบบดิจิทัล',
  };

  // Minimal controlled copy seeds (3 copies, all ISSUED_ACTIVE)
  const testCopies = [
    { id: 'copy-001', doc_id: 'doc-test-001', docId: 'doc-test-001', doc_code: 'QA-SOP-001', docTitle: 'QA-SOP-001', status: 'ISSUED_ACTIVE', copy_no: '01', ccNumber: 'CC-001', holder_dept: 'QA', department: 'QA', location: 'QA Office' },
    { id: 'copy-002', doc_id: 'doc-test-001', docId: 'doc-test-001', doc_code: 'QA-SOP-001', docTitle: 'QA-SOP-001', status: 'ISSUED_ACTIVE', copy_no: '02', ccNumber: 'CC-002', holder_dept: 'PD', department: 'PD', location: 'PD Floor' },
    { id: 'copy-003', doc_id: 'doc-test-001', docId: 'doc-test-001', doc_code: 'QA-SOP-001', docTitle: 'QA-SOP-001', status: 'ISSUED_ACTIVE', copy_no: '03', ccNumber: 'CC-003', holder_dept: 'QC', department: 'QC', location: 'QC Lab' },
  ];

  useStore.setState(prev => ({
    ...prev,
    documents: [...(prev.documents || []).filter(d => d.id !== 'doc-test-001'), testDoc],
    dars: [...(prev.dars || []).filter(d => d.id !== 'dar-obs-test-001'), testDar],
    controlledCopyInstances: [...testCopies, ...(prev.controlledCopyInstances || []).filter(c => !c.id.startsWith('copy-00'))],
    documentControlledCopies: [...testCopies, ...(prev.documentControlledCopies || []).filter(c => !c.id.startsWith('copy-00'))],
    tasks: (prev.tasks || []).filter(t => !t.id.startsWith('task-obs')),
    controlledCopyAuditTrail: [],
    actionLog: []
  }));
};

/* ── Test Suite ─────────────────────────────────────────────────────────── */

describe('Obsolete Document Lifecycle & Archive Workflow', () => {

  beforeEach(() => {
    seedState();
  });

  /* ── Test 1: publishObsoleteDar ──────────────────────────────────────── */
  it('T1: publishObsoleteDar marks document OBSOLETE and copies PENDING_RECALL', () => {
    const { publishObsoleteDar } = useStore.getState();

    act(() => {
      publishObsoleteDar('dar-obs-test-001');
    });

    const state = useStore.getState();

    // Document must be OBSOLETE (not deleted)
    const doc = state.documents.find(d => d.id === 'doc-test-001');
    expect(doc).toBeDefined();
    expect(doc.status).toBe('OBSOLETE');
    expect(doc.obsolete_dar_id).toBeDefined();

    // All active copies must be PENDING_RECALL
    const copies = (state.controlledCopyInstances || []).filter(c =>
      ['copy-001', 'copy-002', 'copy-003'].includes(c.id)
    );
    copies.forEach(copy => {
      expect(['PENDING_RECALL', 'OBSOLETE_PENDING_RECALL']).toContain(copy.status);
    });

    // A DCC Recall Task must be created
    const recallTask = state.tasks.find(t =>
      (t.type === 'DCC_RECALL' || t.type === 'RECALL_HARDCOPY') && (t.title || '').includes('QA-SOP-001')
    );
    expect(recallTask).toBeDefined();

    // DAR must be COMPLETED
    const dar = state.dars.find(d => d.id === 'dar-obs-test-001');
    expect(dar.status).toBe('COMPLETED');
  });

  /* ── Test 2: Zero Hard Delete ─────────────────────────────────────────── */
  it('T2: Zero Hard Delete — document persists in documents[] after publishObsoleteDar', () => {
    const { publishObsoleteDar } = useStore.getState();

    act(() => {
      publishObsoleteDar('dar-obs-test-001');
    });

    const state = useStore.getState();
    const docsWithId = state.documents.filter(d => d.id === 'doc-test-001');

    // Must still have exactly 1 document with that ID
    expect(docsWithId.length).toBe(1);
    // Must not be deleted
    expect(docsWithId[0]).toBeDefined();
  });

  /* ── Test 3: completeCopyRecallAndArchive — STAMP_AND_ARCHIVE ─────────── */
  it('T3: completeCopyRecallAndArchive STAMP_AND_ARCHIVE sets copies ARCHIVED_OBSOLETE with notes', () => {
    const { completeCopyRecallAndArchive } = useStore.getState();

    act(() => {
      completeCopyRecallAndArchive({
        documentCode: 'QA-SOP-001',
        collectedCopyIds: ['copy-001', 'copy-002'],
        dispositionMethod: 'STAMP_AND_ARCHIVE',
        notes: 'Box #A-2025-01',
      });
    });

    const state = useStore.getState();
    const copies = state.controlledCopyInstances || [];

    const archived1 = copies.find(c => c.id === 'copy-001');
    const archived2 = copies.find(c => c.id === 'copy-002');
    const untouched = copies.find(c => c.id === 'copy-003');

    expect(archived1.status).toBe('ARCHIVED_OBSOLETE');
    expect(archived1.disposition_method).toBe('STAMP_AND_ARCHIVE');
    expect(archived1.dcc_notes).toBe('Box #A-2025-01');
    expect(archived2.status).toBe('ARCHIVED_OBSOLETE');

    // copy-003 was not in the collectedCopyIds — should be unchanged
    expect(untouched.status).not.toBe('ARCHIVED_OBSOLETE');

    // Audit trail should have 1 entry
    const auditEntry = state.controlledCopyAuditTrail.find(a => a.action === 'CONTROLLED_COPY_DISPOSITION');
    expect(auditEntry).toBeDefined();
  });

  /* ── Test 4: completeCopyRecallAndArchive — DESTROY_SCRAP ─────────────── */
  it('T4: completeCopyRecallAndArchive DESTROY_SCRAP sets copies DESTROYED', () => {
    const { completeCopyRecallAndArchive } = useStore.getState();

    act(() => {
      completeCopyRecallAndArchive({
        documentCode: 'QA-SOP-001',
        collectedCopyIds: ['copy-001', 'copy-002', 'copy-003'],
        dispositionMethod: 'DESTROY_SCRAP',
        notes: '',
      });
    });

    const state = useStore.getState();
    const copies = state.controlledCopyInstances || [];

    ['copy-001', 'copy-002', 'copy-003'].forEach(id => {
      const copy = copies.find(c => c.id === id);
      expect(copy.status).toBe('DESTROYED');
      expect(copy.disposition_method).toBe('DESTROY_SCRAP');
      expect(copy.recalled_by).toBeDefined();
    });
  });

  /* ── Test 5: DccRecallActionModal renders and validates ──────────────── */
  it('T5: DccRecallActionModal renders without crashing and shows copy list', async () => {
    const { default: DccRecallActionModal } = await import('../components/modals/DccRecallActionModal');

    const group = {
      docId: 'doc-test-001',
      docCode: 'QA-SOP-001',
      docTitle: 'การตรวจสอบคุณภาพวัตถุดิบ',
      docVersion: '03',
      taskId: 'task-recall-001',
      copies: [
        { id: 'copy-001', copy_no: '01', ccNumber: 'CC-001', holder_dept: 'QA', department: 'QA', location: 'QA Office' },
        { id: 'copy-002', copy_no: '02', ccNumber: 'CC-002', holder_dept: 'PD', department: 'PD', location: 'PD Floor' },
      ]
    };

    const mockClose = () => {};

    render(
      <DccRecallActionModal
        isOpen={true}
        onClose={mockClose}
        group={group}
        onComplete={mockClose}
      />
    );

    // Heading should be present
    expect(screen.getByText(/จัดการเรียกคืนสำเนาควบคุม/i)).toBeDefined();

    // Should list both copies
    expect(screen.getByText(/Copy 01/i)).toBeDefined();
    expect(screen.getByText(/Copy 02/i)).toBeDefined();

    // Confirm button should be disabled initially (no disposition method selected yet)
    const allButtons = screen.getAllByRole('button');
    const confirmBtn = allButtons.find(b =>
      b.textContent?.includes('บันทึกการเรียกคืน') || b.textContent?.includes('บันทึกการจัดการสำเนา')
    );
    expect(confirmBtn).toBeDefined();
    expect(confirmBtn.disabled).toBe(true);
  });

});
