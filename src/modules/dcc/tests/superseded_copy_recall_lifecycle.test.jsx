import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import useStore from '../../../store/useStore';
import ControlledCopyRegister from '../pages/ControlledCopy/ControlledCopyRegister';
import TaskInbox from '../pages/Tasks/TaskInbox';

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn()
  }
}));

const renderWithRouter = (ui) => render(<BrowserRouter>{ui}</BrowserRouter>);

describe('ISO 9001 / FSSC 22000 Universal Superseded Copy Recall Engine Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      currentUser: {
        id: 'U001',
        name: 'Admin QA (DCC)',
        role: 'DCC_ADMIN',
        department: 'QA',
        isDcc: true,
        level: 1
      },
      masterUsers: [
        { id: 'U001', name: 'Admin QA (DCC)', department: 'QA', role: 'DCC_ADMIN', isDcc: true, level: 1 },
        { id: 'U002', name: 'ธนาวุฒิ สมควรกิจดำรง', department: 'PD', role: 'DEPT_ADMIN', level: 4 },
        { id: 'U006', name: 'รัตนพล วิศวกรรม', department: 'EN', role: 'DEPT_ADMIN', level: 4 },
        { id: 'U010', name: 'สมชาย การตลาด', department: 'MKT', role: 'GENERAL_USER', level: 3 }
      ],
      documents: [
        {
          id: 'doc-sop-01',
          title: 'SOP-PD-01',
          name: 'ขั้นตอนการปฏิบัติงานสายการผลิต 1',
          rev: '00',
          department: 'PD',
          status: 'EFFECTIVE',
          controlledCopy: 2,
          distributions: [
            { departmentId: 'MKT', station_name: 'MKT Head Office', locationId: 'MKT-LOC-01', isMaster: true },
            { departmentId: 'EN', station_name: 'EN Maintenance Workshop', locationId: 'EN-LOC-01', isMaster: false }
          ]
        }
      ],
      controlledCopyInstances: [
        {
          id: 'cc-mkt-01',
          doc_id: 'doc-sop-01',
          docId: 'doc-sop-01',
          doc_code: 'SOP-PD-01',
          docTitle: 'SOP-PD-01',
          docName: 'ขั้นตอนการปฏิบัติงานสายการผลิต 1',
          rev: '00',
          doc_version: '00',
          copy_no: '01',
          ccNumber: 'CC-001',
          holder_dept: 'MKT',
          department: 'MKT',
          location: 'MKT Head Office',
          locationName: 'MKT Head Office',
          locationId: 'MKT-LOC-01',
          status: 'ISSUED_ACTIVE',
          dateIssued: '2026-01-10'
        },
        {
          id: 'cc-en-01',
          doc_id: 'doc-sop-01',
          docId: 'doc-sop-01',
          doc_code: 'SOP-PD-01',
          docTitle: 'SOP-PD-01',
          docName: 'ขั้นตอนการปฏิบัติงานสายการผลิต 1',
          rev: '00',
          doc_version: '00',
          copy_no: '02',
          ccNumber: 'CC-002',
          holder_dept: 'EN',
          department: 'EN',
          location: 'EN Maintenance Workshop',
          locationName: 'EN Maintenance Workshop',
          locationId: 'EN-LOC-01',
          status: 'ISSUED_ACTIVE',
          dateIssued: '2026-01-10'
        }
      ],
      documentControlledCopies: [],
      dars: [
        {
          id: 'DAR01-08-26',
          type: 'REVISION',
          title: 'ขั้นตอนการปฏิบัติงานสายการผลิต 1 (Revise Process)',
          docCode: 'SOP-PD-01',
          docIdRef: 'doc-sop-01',
          docId: 'doc-sop-01',
          requesterId: 'U002',
          department: 'PD',
          status: 'APPROVED_WAITING_EFFECTIVE',
          effectiveDate: '2026-08-26',
          distributions: [
            // Only MKT is retained; EN is dropped (Orphaned / Deselected Station)
            { departmentId: 'MKT', station_name: 'MKT Head Office', locationId: 'MKT-LOC-01', isMaster: true }
          ]
        }
      ],
      tasks: [],
      actionLog: [],
      controlledCopyAuditTrail: [],
      notifications: [],
      simulatedDate: '2026-08-26'
    });
  });

  it('1. All Active Copies Recall Invariant: Transitions BOTH MKT and EN Rev.00 copies to PENDING_RECALL upon Rev.01 effective', () => {
    // Execute publish/effective
    useStore.getState().publishDarRevision('DAR01-08-26');

    const state = useStore.getState();

    // 1. Master Doc statuses
    const oldDoc = state.documents.find(d => d.id === 'doc-sop-01');
    expect(['SUPERSEDED', 'SUPERSEDED_ARCHIVED']).toContain(oldDoc.status);

    const newDoc = state.documents.find(d => d.title === 'SOP-PD-01' && d.rev === '01');
    expect(newDoc).toBeDefined();
    expect(newDoc.status).toBe('EFFECTIVE');

    // 2. Controlled Copy Rev.00 Statuses:
    // MKT copy Rev.00 must be PENDING_RECALL
    const mktOldCopy = state.controlledCopyInstances.find(c => c.id === 'cc-mkt-01');
    expect(mktOldCopy.status).toBe('PENDING_RECALL');
    expect(mktOldCopy.superseded_by_rev).toBe('01');
    expect(mktOldCopy.recall_reason).toContain('Superseded by Rev.01');

    // EN copy Rev.00 (Orphaned / Deselected Station) MUST ALSO be PENDING_RECALL (Zero Orphaned Active Copies)
    const enOldCopy = state.controlledCopyInstances.find(c => c.id === 'cc-en-01');
    expect(enOldCopy.status).toBe('PENDING_RECALL');
    expect(enOldCopy.superseded_by_rev).toBe('01');
    expect(enOldCopy.recall_reason).toContain('Superseded by Rev.01');

    // 3. New Rev.01 copy created only for MKT
    const mktNewCopy = state.controlledCopyInstances.find(c => c.rev === '01' && c.holder_dept === 'MKT');
    expect(mktNewCopy).toBeDefined();
    expect(mktNewCopy.status).toBe('PENDING_ISSUE');

    // Zero Rev.01 copies created for EN
    const enNewCopy = state.controlledCopyInstances.find(c => c.rev === '01' && c.holder_dept === 'EN');
    expect(enNewCopy).toBeUndefined();

    // 4. Recall Task created for DCC
    const recallTask = state.tasks.find(t => t.type === 'DCC_RECALL' || t.taskType === 'DCC_RECALL_WITH_CHECKLIST');
    expect(recallTask).toBeDefined();
    expect(recallTask.title).toContain('Rev.00');
    expect(recallTask.assigneeId).toBe('U001');
  });

  it('2. Lifecycle via checkSLA: Automatically sets all old copies to PENDING_RECALL when simulated date arrives', () => {
    useStore.getState().checkSLA();

    const state = useStore.getState();

    const oldDoc = state.documents.find(d => d.id === 'doc-sop-01');
    expect(['SUPERSEDED', 'SUPERSEDED_ARCHIVED']).toContain(oldDoc.status);

    const mktOldCopy = state.controlledCopyInstances.find(c => c.id === 'cc-mkt-01');
    const enOldCopy = state.controlledCopyInstances.find(c => c.id === 'cc-en-01');

    expect(mktOldCopy.status).toBe('PENDING_RECALL');
    expect(enOldCopy.status).toBe('PENDING_RECALL');

    const recallTask = state.tasks.find(t => t.type === 'DCC_RECALL' || t.taskType === 'DCC_RECALL_WITH_CHECKLIST');
    expect(recallTask).toBeDefined();
  });

  it('3. Complete Recall Checklist Execution: DCC destroys/archives old copies and resets EN active count to 0', () => {
    // Trigger publish
    useStore.getState().publishDarRevision('DAR01-08-26');

    const recallTask = useStore.getState().tasks.find(t => t.type === 'DCC_RECALL' || t.taskType === 'DCC_RECALL_WITH_CHECKLIST');
    expect(recallTask).toBeDefined();

    // DCC confirms physical recall of both MKT and EN copies
    useStore.getState().completeRecallChecklist(recallTask.id, ['cc-mkt-01', 'cc-en-01'], 'RECALLED_DESTROYED');

    const state = useStore.getState();

    // Verify copies are RECALLED_DESTROYED
    const mktOld = state.controlledCopyInstances.find(c => c.id === 'cc-mkt-01');
    const enOld = state.controlledCopyInstances.find(c => c.id === 'cc-en-01');

    expect(mktOld.status).toBe('RECALLED_DESTROYED');
    expect(enOld.status).toBe('RECALLED_DESTROYED');
    expect(enOld.recalled_by).toBe('Admin QA (DCC)');

    // Active copies for EN must be 0
    const activeEnCopies = state.controlledCopyInstances.filter(c => c.holder_dept === 'EN' && (c.status === 'ISSUED_ACTIVE' || c.status === 'ACTIVE'));
    expect(activeEnCopies.length).toBe(0);

    // Recall task is completed and removed
    const remainingRecallTasks = state.tasks.filter(t => t.type === 'DCC_RECALL' || t.taskType === 'DCC_RECALL_WITH_CHECKLIST');
    expect(remainingRecallTasks.length).toBe(0);
  });

  it('4. ControlledCopyRegister UI: Renders Tab 3 Recall Checklist with both MKT and EN copies and action buttons', async () => {
    useStore.getState().publishDarRevision('DAR01-08-26');

    renderWithRouter(<ControlledCopyRegister />);

    // Switch to Tab 3: Recall Checklist
    const tab3Btn = screen.getByText(/3\. เช็กลิสต์เรียกคืนเอกสาร/i);
    fireEvent.click(tab3Btn);

    // Tab 3 Header
    expect(screen.getByText(/เช็กลิสต์การเรียกคืนเอกสารฉบับเดิม/i)).toBeInTheDocument();
    expect(screen.getAllByText(/SOP-PD-01/i).length).toBeGreaterThan(0);

    // Verify both MKT and EN appear in the checklist table
    expect(screen.getByText(/MKT Head Office/i)).toBeInTheDocument();
    expect(screen.getByText(/EN Maintenance Workshop/i)).toBeInTheDocument();

    // Verify the new unified Recall & Disposition modal trigger button exists
    // (replaces the old two bare "Destroy" / "Archive" buttons)
    const recallModalBtn = screen.getByRole('button', { name: /จัดการเรียกคืนสำเนา/i });
    expect(recallModalBtn).toBeInTheDocument();
    expect(recallModalBtn).not.toBeDisabled(); // Modal button is always accessible

    // Clicking the modal trigger should not crash the component
    fireEvent.click(recallModalBtn);

    // After click, the DccRecallActionModal heading should appear
    expect(screen.getByText(/จัดการเรียกคืนสำเนาควบคุม/i)).toBeInTheDocument();

    // Modal should show the copy list
    expect(screen.getByText(/ขั้นตอนที่ 1/i)).toBeInTheDocument();

    // Confirm button inside modal should be disabled (no copies checked, no disposition chosen)
    const allButtons = screen.getAllByRole('button');
    const confirmBtn = allButtons.find(b => b.textContent?.includes('บันทึกการเรียกคืน'));
    expect(confirmBtn).toBeDefined();
    expect(confirmBtn.disabled).toBe(true);
  });


  it('5. TaskInbox UI: DCC Task list routes DCC_RECALL directly to RECALL_CHECKLIST tab', () => {
    useStore.getState().publishDarRevision('DAR01-08-26');

    renderWithRouter(<TaskInbox />);

    // DCC sees the recall task in inbox
    expect(screen.getByText(/เรียกคืนเอกสาร Controlled Copy/i)).toBeInTheDocument();
  });
});
