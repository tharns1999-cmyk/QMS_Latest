import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithRouter, setTestUser } from '../../../test/test_utils';
import useStore from '../../../store/useStore';
import MasterDataHub from '../pages/Admin/MasterDataHub';

describe('Approval Matrix Dynamic Sync & Stepper SLA Redesign Tests', () => {
  const dccUser = {
    id: 'U001',
    name: 'Admin QA (DCC)',
    department: 'QA',
    depts: ['QA'],
    role: 'DCC_ADMIN',
    isDcc: true,
    level: 1
  };

  beforeEach(() => {
    useStore.getState().resetStore();
    setTestUser(dccUser);
  });

  it('1. Dynamically syncs new document types added in Tab 3 directly into Tab 6 without hardcoding', () => {
    // Add a new custom document type in Tab 3 (documentTypes in Store)
    const customDocType = {
      code: 'MKT',
      name: 'Marketing Standard Procedure',
      nameTh: 'ระเบียบปฏิบัติการตลาด',
      description: 'มาตรฐานการดำเนินงานฝ่ายการตลาด',
      category: 'INTERNAL'
    };

    useStore.getState().addDocumentType(customDocType);

    renderWithRouter(<MasterDataHub />);

    // Switch to Tab 6
    const slaTabBtn = screen.getByText(/สายการอนุมัติและ SLAs/i);
    fireEvent.click(slaTabBtn);

    // Verify MKT dynamically appears in Tab 6 Approval Matrix table
    expect(screen.getByText('MKT')).toBeInTheDocument();
    expect(screen.getByText('ระเบียบปฏิบัติการตลาด')).toBeInTheDocument();

    // Verify Single Source of Truth badge is present
    expect(screen.getByText(/Single Source of Truth/i)).toBeInTheDocument();
  });

  it('2. Compact SLA stepper buttons [-] and [+] adjust day counts within valid range', () => {
    renderWithRouter(<MasterDataHub />);

    const slaTabBtn = screen.getByText(/สายการอนุมัติและ SLAs/i);
    fireEvent.click(slaTabBtn);

    const decreaseBtns = screen.getAllByTitle('ลดจำนวนวัน');
    const increaseBtns = screen.getAllByTitle('เพิ่มจำนวนวัน');
    const inputs = screen.getAllByRole('spinbutton');

    // Initial Review SLA is 3 days
    expect(inputs[0].value).toBe('3');

    // Click [+] twice on Review SLA
    fireEvent.click(increaseBtns[0]);
    expect(inputs[0].value).toBe('4');
    fireEvent.click(increaseBtns[0]);
    expect(inputs[0].value).toBe('5');

    // Click [-] once on Review SLA
    fireEvent.click(decreaseBtns[0]);
    expect(inputs[0].value).toBe('4');

    // Click Save All
    const saveBtn = screen.getByRole('button', { name: /บันทึกการตั้งค่า/i });
    fireEvent.click(saveBtn);

    expect(useStore.getState().slaSettings.reviewSlaDays).toBe(4);
  });

  it('3. Approval Matrix Edit Modal validates Approver Level >= Reviewer Level', () => {
    renderWithRouter(<MasterDataHub />);

    const slaTabBtn = screen.getByText(/สายการอนุมัติและ SLAs/i);
    fireEvent.click(slaTabBtn);

    // Click Edit on SOP
    const sopEditBtn = screen.getByTitle(/แก้ไขผังสายการอนุมัติของ SOP/i);
    fireEvent.click(sopEditBtn);

    // Check modal opens
    expect(screen.getByText(/แก้ไขผังสายการอนุมัติ \(SOP\)/i)).toBeInTheDocument();

    // Set Reviewer Level to 6 (GM) and Approver Level to 5 (Dept Manager) -> Invalid!
    const reviewerSelect = screen.getByLabelText(/ระดับผู้ทบทวนที่ต้องการ/i);
    const approverSelect = screen.getByLabelText(/ระดับผู้อนุมัติขั้นสุดท้าย/i);
    fireEvent.change(reviewerSelect, { target: { value: '6' } });
    fireEvent.change(approverSelect, { target: { value: '5' } });

    // Verify warning alert is rendered in modal
    expect(screen.getByText(/คำเตือน: ระดับผู้อนุมัติ \(Level 5\) ต่ำกว่าระดับผู้ทบทวน \(Level 6\)/i)).toBeInTheDocument();

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /บันทึกการเปลี่ยนแปลง/i });
    fireEvent.click(submitBtn);

    // Store should NOT have been updated with invalid configuration
    const sopEntry = useStore.getState().approvalMatrix?.find(m => (m.docType || m.doc_type) === 'SOP');
    expect(sopEntry?.requiredReviewerLevel).not.toBe(6);
  });

  it('4. Saving valid configuration for newly added document type in Tab 6 persists into Store', () => {
    // Add custom doc type
    useStore.getState().addDocumentType({
      code: 'POL',
      name: 'Corporate Policy',
      nameTh: 'นโยบายองค์กร',
      description: 'นโยบายและวิสัยทัศน์คุณภาพ'
    });

    renderWithRouter(<MasterDataHub />);

    const slaTabBtn = screen.getByText(/สายการอนุมัติและ SLAs/i);
    fireEvent.click(slaTabBtn);

    // Click edit on POL
    const polEditBtn = screen.getByTitle(/แก้ไขผังสายการอนุมัติของ POL/i);
    fireEvent.click(polEditBtn);

    const minReqSelect = screen.getByLabelText(/ระดับผู้มีสิทธิ์ยื่นคำขอขั้นต่ำ/i);
    const reviewerSelect = screen.getByLabelText(/ระดับผู้ทบทวนที่ต้องการ/i);
    const approverSelect = screen.getByLabelText(/ระดับผู้อนุมัติขั้นสุดท้าย/i);

    // Set Min Requester Level = 4 (Sup+), Reviewer Level = 5 (Lead), Approver Level = 8 (MD)
    fireEvent.change(minReqSelect, { target: { value: '4' } });
    fireEvent.change(reviewerSelect, { target: { value: '5' } });
    fireEvent.change(approverSelect, { target: { value: '8' } });

    const submitBtn = screen.getByRole('button', { name: /บันทึกการเปลี่ยนแปลง/i });
    fireEvent.click(submitBtn);

    // Verify persisted into store
    const polEntry = useStore.getState().approvalMatrix?.find(m => (m.docType || m.doc_type) === 'POL');
    expect(polEntry).toBeDefined();
    expect(polEntry.minRequesterLevel).toBe(4);
    expect(polEntry.requiredReviewerLevel).toBe(5);
    expect(polEntry.requiredApproverLevel).toBe(8);
  });
});
