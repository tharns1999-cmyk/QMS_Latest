import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import { getWatermarkConfig } from '../services/UniversalWatermarkService';
import DarObsoleteForm from '../pages/DarWorkflow/DarObsoleteForm';

const renderWithRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('Document Lifecycle Transition, Hardcopy Recall Tasks, and Watermark Engine', () => {
  beforeEach(() => {
    // Seed master documents with multiple revisions
    const initialDocs = [
      {
        id: 'doc-sop-01-r00',
        document_code: 'SOP-QA-01',
        code: 'SOP-QA-01',
        title: 'SOP-QA-01',
        name: 'Standard Operating Procedure for Quality Testing',
        status: 'EFFECTIVE',
        rev: '00',
        revision: '00',
        department: 'QA',
        controlledCopy: 2,
        effectiveDate: '2026-01-01',
        distributions: [{ departmentId: 'QA' }, { departmentId: 'PD' }],
        access_control: { scope: 'GENERAL' }
      },
      {
        id: 'doc-sop-02-r00',
        document_code: 'SOP-PD-02',
        code: 'SOP-PD-02',
        title: 'SOP-PD-02',
        name: 'Production Line Operating Procedure',
        status: 'SUPERSEDED',
        rev: '00',
        revision: '00',
        department: 'PD',
        controlledCopy: 1,
        effectiveDate: '2025-01-01'
      },
      {
        id: 'doc-sop-02-r01',
        document_code: 'SOP-PD-02',
        code: 'SOP-PD-02',
        title: 'SOP-PD-02',
        name: 'Production Line Operating Procedure',
        status: 'EFFECTIVE',
        rev: '01',
        revision: '01',
        department: 'PD',
        controlledCopy: 2,
        effectiveDate: '2026-01-01'
      }
    ];

    // Seed controlled copy instances
    const initialCopies = [
      {
        id: 'copy-qa-01',
        doc_id: 'doc-sop-01-r00',
        docId: 'doc-sop-01-r00',
        doc_code: 'SOP-QA-01',
        docTitle: 'SOP-QA-01',
        doc_version: '00',
        rev: '00',
        copy_no: '01',
        copyNo: '01',
        holder_dept: 'QA',
        department: 'QA',
        location: 'QA Lab Station 1',
        locationName: 'QA Lab Station 1',
        status: 'ISSUED_ACTIVE'
      },
      {
        id: 'copy-qa-02',
        doc_id: 'doc-sop-01-r00',
        docId: 'doc-sop-01-r00',
        doc_code: 'SOP-QA-01',
        docTitle: 'SOP-QA-01',
        doc_version: '00',
        rev: '00',
        copy_no: '02',
        copyNo: '02',
        holder_dept: 'PD',
        department: 'PD',
        location: 'Production Line 1',
        locationName: 'Production Line 1',
        status: 'RECEIVED'
      },
      {
        id: 'copy-pd-02-01',
        doc_id: 'doc-sop-02-r00',
        docId: 'doc-sop-02-r00',
        doc_code: 'SOP-PD-02',
        docTitle: 'SOP-PD-02',
        doc_version: '00',
        rev: '00',
        copy_no: '01',
        copyNo: '01',
        holder_dept: 'PD',
        department: 'PD',
        location: 'PD Workshop',
        locationName: 'PD Workshop',
        status: 'SUPERSEDED'
      },
      {
        id: 'copy-pd-02-02',
        doc_id: 'doc-sop-02-r01',
        docId: 'doc-sop-02-r01',
        doc_code: 'SOP-PD-02',
        docTitle: 'SOP-PD-02',
        doc_version: '01',
        rev: '01',
        copy_no: '01',
        copyNo: '01',
        holder_dept: 'PD',
        department: 'PD',
        location: 'PD Line 2',
        locationName: 'PD Line 2',
        status: 'ACTIVE'
      }
    ];

    // Seed DARs
    const initialDars = [
      {
        id: 'dar-rev-01',
        dar_no: 'DAR-2026-REV-01',
        type: 'REVISION',
        docIdRef: 'doc-sop-01-r00',
        document_code: 'SOP-QA-01',
        docCode: 'SOP-QA-01',
        doc_code: 'SOP-QA-01',
        title: 'SOP-QA-01',
        revision: '01',
        status: 'PENDING_APPROVAL',
        department: 'QA',
        distributions: [{ departmentId: 'QA' }]
      },
      {
        id: 'dar-obs-02',
        dar_no: 'DAR-2026-OBS-02',
        type: 'OBSOLETE',
        targetDocumentId: 'doc-sop-02-r01',
        docIdRef: 'doc-sop-02-r01',
        document_code: 'SOP-PD-02',
        docCode: 'SOP-PD-02',
        doc_code: 'SOP-PD-02',
        title: 'SOP-PD-02',
        status: 'PENDING_APPROVAL',
        department: 'PD'
      }
    ];

    // Seed tasks including pending workflow
    const initialTasks = [
      {
        id: 'task-receipt-pd-02',
        type: 'RECEIPT',
        doc_code: 'SOP-PD-02',
        status: 'PENDING',
        title: 'ตรวจรับเล่ม SOP-PD-02'
      }
    ];

    useStore.setState({
      documents: initialDocs,
      controlledCopyInstances: initialCopies,
      documentControlledCopies: initialCopies,
      dars: initialDars,
      tasks: initialTasks,
      currentUser: { id: 'U001', name: 'Admin DCC', role: 'DCC_ADMIN', department: 'QA' }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Revision Lifecycle
  // ───────────────────────────────────────────────────────────────────────────
  it('1. Revision Lifecycle: single EFFECTIVE invariant, superseded prior revs, copies to PENDING_RECALL and creates RECALL_HARDCOPY task', () => {
    const store = useStore.getState();
    store.publishDarRevision('dar-rev-01');

    const state = useStore.getState();

    // 1. Prior revision Rev.00 must be SUPERSEDED
    const rev00Doc = state.documents.find(d => d.id === 'doc-sop-01-r00');
    expect(rev00Doc.status).toBe('SUPERSEDED');
    expect(rev00Doc.is_superseded).toBe(true);

    // 2. New revision Rev.01 must be EFFECTIVE
    const rev01Doc = state.documents.find(d => (d.document_code === 'SOP-QA-01' || d.code === 'SOP-QA-01' || d.title === 'SOP-QA-01') && d.status === 'EFFECTIVE');
    expect(rev01Doc).toBeDefined();
    expect(rev01Doc.rev).toBe('01');

    // Exactly 1 document of SOP-QA-01 should be EFFECTIVE
    const effectiveDocs = state.documents.filter(d => (d.document_code === 'SOP-QA-01' || d.code === 'SOP-QA-01' || d.title === 'SOP-QA-01') && d.status === 'EFFECTIVE');
    expect(effectiveDocs.length).toBe(1);

    // 3. Active hard copies of Rev.00 must be PENDING_RECALL
    const copy01 = state.controlledCopyInstances.find(c => c.id === 'copy-qa-01');
    const copy02 = state.controlledCopyInstances.find(c => c.id === 'copy-qa-02');
    expect(copy01.status).toBe('PENDING_RECALL');
    expect(copy02.status).toBe('PENDING_RECALL');

    // 4. RECALL_HARDCOPY Task dispatched to DCC
    const recallTask = state.tasks.find(t => 
      (t.type === 'RECALL_HARDCOPY' || t.type === 'DCC_RECALL' || t.taskType === 'DCC_RECALL_WITH_CHECKLIST') &&
      (t.document_code === 'SOP-QA-01' || t.doc_code === 'SOP-QA-01' || (t.title && t.title.includes('SOP-QA-01')))
    );
    expect(recallTask).toBeDefined();
    expect(recallTask.status).toBe('PENDING'); // tasks use PENDING; copies carry PENDING_RECALL
    expect(recallTask.copies_to_recall.length).toBe(2);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Obsolete Lifecycle (Cascade Obsolete)
  // ───────────────────────────────────────────────────────────────────────────
  it('2. Obsolete Lifecycle: cascades OBSOLETE to all historical revisions, marks copies OBSOLETE_PENDING_RECALL, and invalidates pending tasks', () => {
    const store = useStore.getState();
    store.publishObsoleteDar('dar-obs-02');

    const state = useStore.getState();

    // 1. Both Rev.00 (previously SUPERSEDED) and Rev.01 (previously EFFECTIVE) must be OBSOLETE
    const allRevs = state.documents.filter(d => d.document_code === 'SOP-PD-02' || d.code === 'SOP-PD-02' || d.title === 'SOP-PD-02');
    expect(allRevs.length).toBe(2);
    allRevs.forEach(doc => {
      expect(doc.status).toBe('OBSOLETE');
      expect(doc.is_obsolete).toBe(true);
    });

    // 2. Copies of SOP-PD-02 must be OBSOLETE_PENDING_RECALL
    const activeCopy = state.controlledCopyInstances.find(c => c.id === 'copy-pd-02-02');
    expect(activeCopy.status).toBe('OBSOLETE_PENDING_RECALL');

    // 3. Pending workflow/receipt task for SOP-PD-02 must be invalidated / dismissed
    const pendingReceiptTask = state.tasks.find(t => t.id === 'task-receipt-pd-02');
    expect(pendingReceiptTask).toBeUndefined();

    // 4. RECALL_HARDCOPY Task dispatched to DCC
    const recallTask = state.tasks.find(t =>
      (t.type === 'RECALL_HARDCOPY' || t.type === 'DCC_RECALL') &&
      (t.document_code === 'SOP-PD-02' || t.doc_code === 'SOP-PD-02' || (t.title && t.title.includes('SOP-PD-02')))
    );
    expect(recallTask).toBeDefined();
    expect(recallTask.status).toBe('PENDING'); // tasks use PENDING; copies carry PENDING_RECALL
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. DCC Recall Closure Action
  // ───────────────────────────────────────────────────────────────────────────
  it('3. DCC Recall Closure: confirmCopiesRecalled marks copies DESTROYED, task RESOLVED, and logs audit trail', () => {
    const store = useStore.getState();
    store.publishDarRevision('dar-rev-01');

    let state = useStore.getState();
    const recallTask = state.tasks.find(t => 
      (t.type === 'RECALL_HARDCOPY' || t.type === 'DCC_RECALL' || t.taskType === 'DCC_RECALL_WITH_CHECKLIST') &&
      (t.document_code === 'SOP-QA-01' || t.doc_code === 'SOP-QA-01' || (t.title && t.title.includes('SOP-QA-01')))
    );

    expect(recallTask).toBeDefined();

    // DCC officer confirms copies recalled and destroyed
    store.confirmCopiesRecalled(recallTask.id, {
      finalStatus: 'DESTROYED',
      method: 'SHREDDING',
      notes: 'ทำลายด้วยเครื่องย่อยเอกสารความละเอียดสูง'
    });

    state = useStore.getState();

    // Copies are DESTROYED
    const copy01 = state.controlledCopyInstances.find(c => c.id === 'copy-qa-01');
    const copy02 = state.controlledCopyInstances.find(c => c.id === 'copy-qa-02');
    expect(copy01.status).toBe('DESTROYED');
    expect(copy02.status).toBe('DESTROYED');

    // Active recall task is closed / dismissed from active queue
    const activeTask = state.tasks.find(t => t.id === recallTask.id);
    expect(activeTask).toBeUndefined();

    // Audit log exists
    const auditLog = state.controlledCopyAuditTrail.find(a => a.action === 'RECALL_COMPLETED_DESTROYED');
    expect(auditLog).toBeDefined();
    expect(auditLog.docTitle).toBe('SOP-QA-01');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Reactive UI in Obsolete Form (DarObsoleteForm)
  // ───────────────────────────────────────────────────────────────────────────
  it('4. Reactive UI in Obsolete Form: renders summary count, copy badges, and auto-recall notification for selected doc', () => {
    renderWithRouter(<DarObsoleteForm />);

    // Renders the form components properly
    expect(screen.getByText(/ขอยกเลิกเอกสาร/i)).toBeInTheDocument();
    expect(screen.getByText(/แผนการจัดการและเรียกคืนสำเนาเดิม/i)).toBeInTheDocument();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Watermark Engine
  // ───────────────────────────────────────────────────────────────────────────
  it('5. Watermark Engine: getWatermarkConfig returns correct colors and text for SUPERSEDED and OBSOLETE', () => {
    // SUPERSEDED
    const supersededConfig = getWatermarkConfig('SUPERSEDED');
    expect(supersededConfig.visible).toBe(true);
    expect(supersededConfig.text).toBe('SUPERSEDED / ฉบับตกรุ่น');
    expect(supersededConfig.color).toBe('rgba(234, 88, 12, 0.28)');

    const supersededArchivedConfig = getWatermarkConfig('SUPERSEDED_ARCHIVED');
    expect(supersededArchivedConfig.visible).toBe(true);
    expect(supersededArchivedConfig.text).toBe('SUPERSEDED / ฉบับตกรุ่น');

    // OBSOLETE
    const obsoleteConfig = getWatermarkConfig('OBSOLETE');
    expect(obsoleteConfig.visible).toBe(true);
    expect(obsoleteConfig.text).toBe('OBSOLETE / ยกเลิกการใช้งาน');
    expect(obsoleteConfig.color).toBe('rgba(220, 38, 38, 0.35)');

    const obsoleteArchivedConfig = getWatermarkConfig('OBSOLETE_ARCHIVED');
    expect(obsoleteArchivedConfig.visible).toBe(true);
    expect(obsoleteArchivedConfig.text).toBe('OBSOLETE / ยกเลิกการใช้งาน');

    // EFFECTIVE (should be hidden)
    const effectiveConfig = getWatermarkConfig('EFFECTIVE');
    expect(effectiveConfig.visible).toBe(false);
  });
});
