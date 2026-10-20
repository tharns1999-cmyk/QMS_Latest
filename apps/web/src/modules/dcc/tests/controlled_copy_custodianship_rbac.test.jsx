import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import DocumentDetailModal from '../components/workflow/DocumentDetailModal';
import { canManageControlledCopy } from '../utils/accessControl';
import useStore from '../../../store/useStore';

describe('Enterprise Security & RBAC Guard: Controlled Copy Custodianship Isolation & Action Authorization', () => {
  const sampleDoc = {
    id: 'DOC-PD-001',
    title: 'SOP-PD-01',
    name: 'ขั้นตอนการควบคุมกระบวนการผลิต',
    rev: '01',
    department: 'PD',
    owner_dept: 'PD',
    status: 'EFFECTIVE',
    access_scope: 'GENERAL'
  };

  const copyPD1 = {
    id: 'inst-pd-01',
    doc_id: 'DOC-PD-001',
    doc_code: 'SOP-PD-01',
    docTitle: 'SOP-PD-01',
    copy_no: '01',
    issue_no: '01',
    holder_dept: 'PD',
    department: 'PD',
    location: 'Line 1 Mixing',
    status: 'ISSUED_ACTIVE'
  };

  const copyPD2 = {
    id: 'inst-pd-02',
    doc_id: 'DOC-PD-001',
    doc_code: 'SOP-PD-01',
    docTitle: 'SOP-PD-01',
    copy_no: '02',
    issue_no: '01',
    holder_dept: 'PD',
    department: 'PD',
    location: 'Line 2 Packaging',
    status: 'ISSUED_ACTIVE'
  };

  const copyQA1 = {
    id: 'inst-qa-01',
    doc_id: 'DOC-PD-001',
    doc_code: 'SOP-PD-01',
    docTitle: 'SOP-PD-01',
    copy_no: '03',
    issue_no: '01',
    holder_dept: 'QA',
    department: 'QA',
    location: 'QA In-Process Lab',
    status: 'ISSUED_ACTIVE'
  };

  beforeEach(() => {
    useStore.setState({
      documents: [sampleDoc],
      controlledCopyInstances: [copyPD1, copyPD2, copyQA1],
      documentControlledCopies: [copyPD1, copyPD2, copyQA1],
      canDownloadDocument: () => true
    });
  });

  it('1. canManageControlledCopy helper correctly authorizes copy custodianship', () => {
    const dccUser = { id: 'U001', name: 'Admin DC', department: 'DC', isDcc: true, role: 'DCC_ADMIN' };
    const dcDeptUser = { id: 'U008', name: 'เจ้าหน้าที่ DC', department: 'DC', isDcc: false, role: 'GENERAL_USER' };
    const pdUser = { id: 'U002', name: 'ธนาวุฒิ', department: 'PD', isDcc: false, role: 'GENERAL_USER' };
    const qcUser = { id: 'U005', name: 'บีม QC', department: 'QC', isDcc: false, role: 'GENERAL_USER' };

    // DCC Admin and DC Department can manage any copy
    expect(canManageControlledCopy(dccUser, copyPD1)).toBe(true);
    expect(canManageControlledCopy(copyPD1, dccUser)).toBe(true);
    expect(canManageControlledCopy(dcDeptUser, copyPD1)).toBe(true);
    expect(canManageControlledCopy(copyQA1, dccUser)).toBe(true);

    // PD User can ONLY manage PD copies
    expect(canManageControlledCopy(pdUser, copyPD1)).toBe(true);
    expect(canManageControlledCopy(pdUser, copyPD2)).toBe(true);
    expect(canManageControlledCopy(pdUser, copyQA1)).toBe(false);

    // QC User can ONLY manage QA/QC copies, NEVER PD copies
    expect(canManageControlledCopy(qcUser, copyPD1)).toBe(false);
    expect(canManageControlledCopy(qcUser, copyPD2)).toBe(false);
    expect(canManageControlledCopy(qcUser, copyQA1)).toBe(true);

    // Invariant: doc.department does NOT grant permission on copies held by other departments
    const docCreatorFromPD = { id: 'U999', name: 'Creator', department: 'PD', isDcc: false, role: 'GENERAL_USER' };
    expect(canManageControlledCopy(docCreatorFromPD, copyQA1)).toBe(false);
  });

  it('2. QC User viewing PD document sees Lock badge "เฉพาะแผนก PD" and cannot see/click relocate/return on PD copies', () => {
    const qcUser = { id: 'U005', name: 'บีม QC', department: 'QC', isDcc: false, role: 'GENERAL_USER' };
    useStore.setState({ currentUser: qcUser });

    render(<DocumentDetailModal isOpen={true} onClose={() => {}} document={sampleDoc} />);

    // Should render Lock badge "เฉพาะแผนก PD" for the 2 PD copies
    const lockBadges = screen.getAllByText(/เฉพาะแผนก PD/i);
    expect(lockBadges.length).toBe(2);

    // QC user should NOT see relocate or return buttons for PD copies
    // Copy 03 (QA/QC) is non-origin, so QC user sees 1 "ขอย้ายจุด" and 1 "ส่งคืน" button for Copy 03
    const relocateButtons = screen.getAllByRole('button', { name: /ขอย้ายจุด/i });
    expect(relocateButtons.length).toBe(1);

    const returnButtons = screen.getAllByRole('button', { name: /ส่งคืน/i });
    expect(returnButtons.length).toBe(1);

    // QC User should NOT see Watermark Studio button
    expect(screen.queryByRole('button', { name: /Watermark Studio/i })).not.toBeInTheDocument();
  });

  it('3. PD User viewing PD document sees action buttons on PD copies and Lock badge on QA copy', () => {
    const pdUser = { id: 'U002', name: 'ธนาวุฒิ PD', department: 'PD', isDcc: false, role: 'GENERAL_USER' };
    useStore.setState({ currentUser: pdUser });

    render(<DocumentDetailModal isOpen={true} onClose={() => {}} document={sampleDoc} />);

    // Copy 01 (Origin): shows emergency button [แจ้งชำรุด/สูญหาย] only
    // Copy 02: shows [ขอย้ายจุด], [ส่งคืน], [AlertTriangle (แจ้งชำรุด)]
    expect(screen.getByRole('button', { name: /ขอย้ายจุด/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ส่งคืน/i })).toBeInTheDocument();

    // Lock badge on Copy 03 QA
    expect(screen.getByText(/เฉพาะแผนก QA/i)).toBeInTheDocument();

    // Non-DCC user does NOT see Watermark Studio
    expect(screen.queryByRole('button', { name: /Watermark Studio/i })).not.toBeInTheDocument();
  });

  it('4. DCC Admin sees action buttons on ALL copies and Watermark Studio is removed from detail view', () => {
    const dccUser = { id: 'U001', name: 'Admin DC (DCC)', department: 'DC', isDcc: true, role: 'DCC_ADMIN' };
    useStore.setState({ currentUser: dccUser });

    render(<DocumentDetailModal isOpen={true} onClose={() => {}} document={sampleDoc} />);

    // Copy 01 (Origin) has emergency damaged button; Copy 02 and Copy 03 have relocate/return buttons
    const relocateButtons = screen.getAllByRole('button', { name: /ขอย้ายจุด/i });
    expect(relocateButtons.length).toBe(2);

    const returnButtons = screen.getAllByRole('button', { name: /ส่งคืน/i });
    expect(returnButtons.length).toBe(2);

    // Zero Lock badges for DCC Admin
    expect(screen.queryByText(/เฉพาะแผนก/i)).not.toBeInTheDocument();

    // Watermark Studio button has been removed from detail view
    expect(screen.queryByRole('button', { name: /Watermark Studio/i })).not.toBeInTheDocument();
  });

  it('5. Store-Level Security Guard: blocks unauthorized cross-department relocate, return, and damaged reporting', () => {
    const qcUser = { id: 'U005', name: 'บีม QC', department: 'QC', isDcc: false, role: 'GENERAL_USER' };
    useStore.setState({ currentUser: qcUser });

    const { reportCcDamagedLost, requestCcRelocation, requestCcReturn } = useStore.getState();

    // Relocation rejection on PD copy by QC user
    expect(() => {
      requestCcRelocation('inst-pd-02', { newLocation: 'Lab 2', reason: 'ทดสอบย้าย' });
    }).toThrow(/ปฏิเสธการทำรายการ: คุณไม่มีสิทธิ์จัดการสำเนาควบคุม/i);

    // Return rejection on PD copy by QC user
    expect(() => {
      requestCcReturn('inst-pd-02', { reason: 'ทดสอบส่งคืน' });
    }).toThrow(/ปฏิเสธการทำรายการ: คุณไม่มีสิทธิ์จัดการสำเนาควบคุม/i);

    // Report damaged rejection on PD copy by QC user
    expect(() => {
      reportCcDamagedLost('inst-pd-01', 'DAMAGED', 'ชำรุด');
    }).toThrow(/ปฏิเสธการทำรายการ: คุณไม่มีสิทธิ์จัดการสำเนาควบคุม/i);

    expect(() => {
      reportCcDamagedLost('inst-pd-02', 'LOST', 'สูญหาย');
    }).toThrow(/ปฏิเสธการทำรายการ: คุณไม่มีสิทธิ์จัดการสำเนาควบคุม/i);

    // QC user reporting on QA/QC copy succeeds
    expect(() => {
      reportCcDamagedLost('inst-qa-01', 'DAMAGED', 'เปียกน้ำ');
    }).not.toThrow();

    const state = useStore.getState();
    const replaced = state.controlledCopyInstances.find(c => c.is_replacement);
    expect(replaced).toBeDefined();
    expect(replaced.holder_dept).toBe('QA');
  });

  it('6. Store-Level Security Guard: DCC Admin can relocate, return, and report damage on copies of any department', () => {
    const dccUser = { id: 'U001', name: 'Admin DC (DCC)', department: 'DC', isDcc: true, role: 'DCC_ADMIN' };
    useStore.setState({ currentUser: dccUser });

    const { reportCcDamagedLost, requestCcRelocation } = useStore.getState();

    // DCC Admin reporting on PD Copy succeeds
    expect(() => {
      reportCcDamagedLost('inst-pd-01', 'DAMAGED', 'DCC physical inspection damaged');
    }).not.toThrow();

    // DCC Admin requesting relocation on PD Copy succeeds
    expect(() => {
      requestCcRelocation('inst-pd-02', { newLocation: 'Packing Line 3', reason: 'DCC reassignment' });
    }).not.toThrow();

    const state = useStore.getState();
    const repPd = state.controlledCopyInstances.find(c => c.is_replacement && c.replaced_copy_id === 'inst-pd-01');
    expect(repPd).toBeDefined();
    expect(repPd.department).toBe('PD');
  });
});
