import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import useStore from '../../../store/useStore';
import DocumentDetailModal from '../components/workflow/DocumentDetailModal';

describe('Damaged & Lost Replacement Pipeline, REPLACED_VOID Lifecycle and Deduplication', () => {
  beforeEach(() => {
    const store = useStore.getState();
    store.currentUser = { id: 'U002', name: 'ธนาวุฒิ สมควรกิจดำรง', department: 'PD', depts: ['PD'], level: 4, role: 'DEPT_ADMIN' };
    
    // Seed initial controlled copy
    const initialCopy = {
      id: 'inst-test-01',
      doc_id: 'DOC-PD-001',
      docId: 'DOC-PD-001',
      doc_code: 'SOP-PD-01',
      docTitle: 'SOP-PD-01',
      docName: 'ขั้นตอนการผสมวัตถุดิบ',
      doc_version: '01',
      rev: '01',
      copy_no: '01',
      copyNo: '01',
      ccNumber: 'Copy 01',
      issue_no: '01',
      issueNumber: 'I01',
      holder_dept: 'PD',
      department: 'PD',
      location: 'Line 1 Mixing',
      locationName: 'Line 1 Mixing',
      locationId: 'LOC-PD-01',
      status: 'ISSUED_ACTIVE',
      is_replacement: false
    };

    useStore.setState({
      masterUsers: [
        { id: 'U001', name: 'DCC Officer', role: 'DCC_ADMIN', isDcc: true, department: 'DC' }
      ],
      documentControlledCopies: [initialCopy],
      controlledCopyInstances: [initialCopy],
      tasks: [],
      notifications: [],
      controlledCopyAuditTrail: []
    });
  });

  it('1. Auto-enqueues replacement copy in PENDING_ISSUE when copy is reported DAMAGED', () => {
    const { reportCcDamagedLost } = useStore.getState();

    reportCcDamagedLost('inst-test-01', 'DAMAGED', 'เอกสารเปียกน้ำฉีกขาดจากการทำความสะอาดไลน์');

    const state = useStore.getState();
    const copies = state.controlledCopyInstances;
    
    // Should have 2 copies: original + replacement
    expect(copies.length).toBe(2);

    // Old copy
    const oldCopy = copies.find(c => c.id === 'inst-test-01');
    expect(['PENDING_RECALL', 'DAMAGED_PENDING_RECALL', 'DAMAGED_PENDING_REPLACEMENT']).toContain(oldCopy.status);
    expect(oldCopy.reportType).toBe('DAMAGED');
    expect(oldCopy.isDamaged).toBe(true);
    expect(oldCopy.reportReason).toContain('เอกสารเปียกน้ำฉีกขาด');

    // Replacement copy
    const replacementCopy = copies.find(c => c.is_replacement === true);
    expect(replacementCopy).toBeDefined();
    expect(replacementCopy.status).toBe('PENDING_ISSUE');
    expect(replacementCopy.copy_no).toBe('01');
    expect(replacementCopy.issue_no).toBe('02');
    expect(replacementCopy.issueNumber).toBe('I02');
    expect(replacementCopy.holder_dept).toBe('PD');
    expect(replacementCopy.location).toBe('Line 1 Mixing');
    expect(replacementCopy.replaced_copy_id).toBe('inst-test-01');

    // Dual-state sync check
    expect(state.documentControlledCopies.length).toBe(state.controlledCopyInstances.length);

    // DCC Distribute Task check (Issue 02)
    expect(state.tasks.some(t => t.type === 'DCC_DISTRIBUTE' && t.title.includes('Issue 02'))).toBe(true);

    // DCC Recall Task check (MUST be generated for DAMAGED)
    expect(state.tasks.some(t => t.type === 'DCC_RECALL' && t.title.includes('เรียกคืนสำเนาชำรุด'))).toBe(true);

    // DCC Notification check
    expect(state.notifications.some(n => n.title.includes('มีคำขอออกสำเนาทดแทน') && n.userId === 'U001')).toBe(true);
  });

  it('2. Auto-enqueues replacement copy in PENDING_ISSUE when copy is reported LOST', () => {
    const { reportCcDamagedLost } = useStore.getState();

    reportCcDamagedLost('inst-test-01', 'LOST', 'เอกสารสูญหายระหว่างเคลื่อนย้ายจุดปฏิบัติงาน');

    const state = useStore.getState();
    const copies = state.controlledCopyInstances;
    
    expect(copies.length).toBe(2);

    const oldCopy = copies.find(c => c.id === 'inst-test-01');
    expect(['LOST', 'LOST_RECORDED', 'DECLARED_LOST']).toContain(oldCopy.status);
    expect(oldCopy.reportType).toBe('LOST');
    expect(oldCopy.isLost).toBe(true);

    // DCC Recall Task MUST NOT be generated for LOST
    expect(state.tasks.some(t => t.type === 'DCC_RECALL')).toBe(false);

    const replacementCopy = copies.find(c => c.is_replacement === true);
    expect(replacementCopy).toBeDefined();
    expect(replacementCopy.status).toBe('PENDING_ISSUE');
    expect(replacementCopy.issue_no).toBe('02');
    expect(replacementCopy.replacement_reason).toContain('LOST: เอกสารสูญหาย');
  });

  it('3. Successfully requests ad-hoc additional copies via requestAdditionalControlledCopies', () => {
    // Seed effective document
    useStore.setState({
      documents: [
        {
          id: 'DOC-PD-001',
          title: 'SOP-PD-01',
          name: 'ขั้นตอนการผสมวัตถุดิบ',
          rev: '01',
          department: 'PD',
          status: 'EFFECTIVE',
          distributions: [{ departmentId: 'PD', locationId: 'LOC-PD-01', locationName: 'Line 1 Mixing' }]
        }
      ]
    });

    const { requestAdditionalControlledCopies } = useStore.getState();

    requestAdditionalControlledCopies('DOC-PD-001', [
      { departmentId: 'PD', locationId: 'LOC-PD-02', locationName: 'Line 2 Mixing', isCustom: false }
    ], 'ขยายกำลังการผลิต Line 2');

    const state = useStore.getState();
    const copies = state.controlledCopyInstances;

    // Original (Copy 01) + Ad-hoc (Copy 02)
    expect(copies.length).toBe(2);

    const adhocCopy = copies.find(c => c.location === 'Line 2 Mixing');
    expect(adhocCopy).toBeDefined();
    expect(adhocCopy.copy_no).toBe('02');
    expect(adhocCopy.status).toBe('PENDING_ISSUE');
    expect(adhocCopy.is_adhoc).toBe(true);
  });

  it('4. Sets old copy to REPLACED_VOID when replacement copy is confirmed or dispatched', () => {
    const { reportCcDamagedLost, confirmHardcopyReceipt } = useStore.getState();

    // 1. Report damaged
    reportCcDamagedLost('inst-test-01', 'DAMAGED', 'ฉีกขาด');
    const stateAfterReport = useStore.getState();
    const replacement = stateAfterReport.controlledCopyInstances.find(c => c.is_replacement);

    // 2. Department confirms receipt of replacement
    confirmHardcopyReceipt(replacement.id, 'task-receipt-test', { name: 'ธนาวุฒิ', remarks: 'PIN verified' });

    const finalState = useStore.getState();
    const oldCopy = finalState.controlledCopyInstances.find(c => c.id === 'inst-test-01');
    const newCopy = finalState.controlledCopyInstances.find(c => c.id === replacement.id);

    expect(oldCopy.status).toBe('REPLACED_VOID');
    expect(oldCopy.replaced_at).toBeDefined();
    expect(newCopy.status).toBe('ISSUED_ACTIVE');
    expect(newCopy.issue_no).toBe('02');
  });

  it('5. DocumentDetailModal displays deduplicated active copy with Issue 02 (เล่มทดแทน) badge and excludes REPLACED_VOID', () => {
    const doc = {
      id: 'DOC-PD-001',
      title: 'SOP-PD-01',
      name: 'ขั้นตอนการผสมวัตถุดิบ',
      rev: '01',
      department: 'PD',
      status: 'EFFECTIVE'
    };

    const voidedOldCopy = {
      id: 'inst-test-01',
      doc_id: 'DOC-PD-001',
      doc_code: 'SOP-PD-01',
      docTitle: 'SOP-PD-01',
      copy_no: '01',
      issue_no: '01',
      holder_dept: 'PD',
      location: 'Line 1 Mixing',
      status: 'REPLACED_VOID'
    };

    const activeReplacementCopy = {
      id: 'inst-rep-01',
      doc_id: 'DOC-PD-001',
      doc_code: 'SOP-PD-01',
      docTitle: 'SOP-PD-01',
      copy_no: '01',
      issue_no: '02',
      holder_dept: 'PD',
      location: 'Line 1 Mixing',
      status: 'ISSUED_ACTIVE',
      is_replacement: true
    };

    useStore.setState({
      documentControlledCopies: [voidedOldCopy, activeReplacementCopy],
      controlledCopyInstances: [voidedOldCopy, activeReplacementCopy],
      documents: [doc],
      canDownloadDocument: () => true
    });

    render(<DocumentDetailModal isOpen={true} onClose={() => {}} document={doc} />);

    // Check heading counts only 1 active copy
    expect(screen.getByText(/สำเนาควบคุมที่แจกจ่ายประจำจุดใช้งาน \(1 เล่ม\)/i)).toBeInTheDocument();

    // Check that Issue 02 (ทดแทน) badge is rendered
    expect(screen.getByText(/Issue 02 \(ทดแทน\)/i)).toBeInTheDocument();
  });

  it('6. Point-of-Use Station row-level "แจ้งชำรุด/ขอเล่มใหม่" button renders in DocumentDetailModal for active copies', () => {
    const doc = {
      id: 'DOC-PD-001',
      title: 'SOP-PD-01',
      name: 'ขั้นตอนการผสมวัตถุดิบ',
      rev: '01',
      department: 'PD',
      status: 'EFFECTIVE'
    };

    const activeStationCopy = {
      id: 'inst-station-03',
      doc_id: 'DOC-PD-001',
      doc_code: 'SOP-PD-01',
      docTitle: 'SOP-PD-01',
      copy_no: '03',
      issue_no: '01',
      holder_dept: 'PD',
      location: 'ขนม 2',
      locationName: 'ขนม 2',
      status: 'ISSUED_ACTIVE'
    };

    useStore.setState({
      documentControlledCopies: [activeStationCopy],
      controlledCopyInstances: [activeStationCopy],
      documents: [doc],
      canDownloadDocument: () => true
    });

    render(<DocumentDetailModal isOpen={true} onClose={() => {}} document={doc} />);

    // Row-level button is present
    const actionBtn = screen.getByRole('button', { name: /แจ้งชำรุด\/เล่มใหม่/i });
    expect(actionBtn).toBeInTheDocument();
  });
});
