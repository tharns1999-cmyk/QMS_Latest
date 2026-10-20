import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import DarReviewModal from '../components/workflow/DarReviewModal';
import useStore from '../../../store/useStore';

describe('DarReviewModal Inspector & Approval Component', () => {
  const mockDar = {
    id: 'DAR01-08-26',
    type: 'NEW',
    title: 'ขั้นตอนการควบคุมเอกสารและบันทึกคุณภาพ',
    docIdInput: 'SOP-QA-01',
    docType: 'SOP',
    docRev: '00',
    department: 'QA',
    requesterId: 'U001',
    effectiveDate: '2026-09-01',
    ackRequirement: 'REQUIRED',
    requestDetail: 'จัดทำระเบียบปฏิบัติงานใหม่เพื่อรองรับการตรวจประเมินระบบ ISO 9001:2015',
    requestReason: 'ปรับกระบวนการทำงานให้เป็นระบบดิจิทัลและสอดคล้องกับข้อกำหนดใหม่',
    relatedStandards: ['ISO 9001', 'GHPs / HACCP'],
    access_control: {
      scope: 'RESTRICTED',
      min_access_level: 4,
      authorized_users: ['U002', 'U003']
    },
    distributions: [
      { id: 'dist-1', departmentId: 'PD', location: 'PD Head Office', copyType: 'CONTROLLED' }
    ]
  };

  const mockUsers = [
    { id: 'U001', name: 'Admin QA (DCC)', department: 'QA', level: 1 },
    { id: 'U002', name: 'ธนาวุฒิ สมควรกิจดำรง', department: 'PD', level: 4 },
    { id: 'U003', name: 'กัลยาณี พลไกร', department: 'PD', level: 5 }
  ];

  beforeEach(() => {
    useStore.setState({
      currentUser: { id: 'U005', name: 'Reviewer Manager', department: 'QA', role: 'DEPT_ADMIN' },
      masterUsers: mockUsers,
      documents: []
    });
  });

  it('renders all 6 comprehensive data sections in Figma UI3 structure', () => {
    render(
      <DarReviewModal
        isOpen={true}
        onClose={vi.fn()}
        dar={mockDar}
        role="REVIEWER"
        onApprove={vi.fn()}
        onReturn={vi.fn()}
      />
    );

    // Header & DAR badge
    expect(screen.getByText(/DAR01-08-26/i)).toBeInTheDocument();
    expect(screen.getByText(/Admin QA \(DCC\)/i)).toBeInTheDocument();

    // Section 1: Document & Standards
    expect(screen.getByText('SOP-QA-01 (ฉบับใหม่)')).toBeInTheDocument();
    expect(screen.getByText(/ขั้นตอนการควบคุมเอกสารและบันทึกคุณภาพ/i)).toBeInTheDocument();
    expect(screen.getByText('🏷️ ISO 9001')).toBeInTheDocument();
    expect(screen.getByText('🏷️ GHPs / HACCP')).toBeInTheDocument();

    // Section 2: Purpose & Justification
    expect(screen.getByText(/จัดทำระเบียบปฏิบัติงานใหม่เพื่อรองรับการตรวจประเมินระบบ ISO 9001:2015/i)).toBeInTheDocument();
    expect(screen.getByText(/ปรับกระบวนการทำงานให้เป็นระบบดิจิทัลและสอดคล้องกับข้อกำหนดใหม่/i)).toBeInTheDocument();

    // Section 3: Confidentiality & Access Scope
    expect(screen.getByText(/ลับเฉพาะบุคคล\/ตำแหน่ง/i)).toBeInTheDocument();
    expect(screen.getByText(/Level 4\+ ขึ้นไป/i)).toBeInTheDocument();
    expect(screen.getByText(/ธนาวุฒิ สมควรกิจดำรง \(PD\)/i)).toBeInTheDocument();

    // Section 4: Controlled Copies & Distribution Matrix
    expect(screen.getByText(/Master 01 \(ต้นฉบับ\)/i)).toBeInTheDocument();
    expect(screen.getByText(/QA Head Office \(ล็อกถาวร\)/i)).toBeInTheDocument();
    expect(screen.getByText(/PD Head Office/i)).toBeInTheDocument();

    // Section 5: Attachments & Effective Date
    expect(screen.getByText(/SOP-QA-01_Draft\.pdf/i)).toBeInTheDocument();
    expect(screen.getByText(/เปิดดูตัวอย่าง PDF/i)).toBeInTheDocument();
    expect(screen.getByText(/ต้องรับทราบ/i)).toBeInTheDocument();

    // Section 6: Action buttons
    expect(screen.getByText('ผ่านการทบทวน (Approve Review)')).toBeInTheDocument();
    expect(screen.getByText('ส่งกลับแก้ไข (Request Changes)')).toBeInTheDocument();
  });

  it('triggers onApprove with comment when clicking approve button', () => {
    const handleApprove = vi.fn();
    render(
      <DarReviewModal
        isOpen={true}
        onClose={vi.fn()}
        dar={mockDar}
        role="APPROVER"
        onApprove={handleApprove}
        onReturn={vi.fn()}
        onReject={vi.fn()}
      />
    );

    const commentInput = screen.getByPlaceholderText(/ระบุความเห็นหรือข้อเสนอแนะ/i);
    fireEvent.change(commentInput, { target: { value: 'เอกสารถูกต้องตามมาตรฐาน ISO 9001 อนุมัติประกาศใช้' } });

    const approveBtn = screen.getByText('อนุมัติคำร้อง (Approve)');
    fireEvent.click(approveBtn);

    expect(handleApprove).toHaveBeenCalledWith('เอกสารถูกต้องตามมาตรฐาน ISO 9001 อนุมัติประกาศใช้');
  });

  it('triggers onReject with mandatory comment when clicking reject button', () => {
    const handleReject = vi.fn();
    render(
      <DarReviewModal
        isOpen={true}
        onClose={vi.fn()}
        dar={mockDar}
        role="APPROVER"
        onApprove={vi.fn()}
        onReturn={vi.fn()}
        onReject={handleReject}
      />
    );

    const commentInput = screen.getByPlaceholderText(/ระบุความเห็นหรือข้อเสนอแนะ/i);
    fireEvent.change(commentInput, { target: { value: 'ไม่อนุมัติเนื่องจากขัดกับระเบียบบริษัท' } });

    const rejectBtn = screen.getByText('ไม่อนุมัติ (Reject)');
    fireEvent.click(rejectBtn);

    expect(handleReject).toHaveBeenCalledWith('ไม่อนุมัติเนื่องจากขัดกับระเบียบบริษัท');
  });

  it('handles null safety gracefully on legacy DAR without access_control or distributions', () => {
    const legacyDar = {
      id: 'DAR-LEGACY-01',
      type: 'NEW',
      title: 'คู่มือความปลอดภัยเก่า',
      department: 'PD',
      requesterId: 'U002'
    };

    render(
      <DarReviewModal
        isOpen={true}
        onClose={vi.fn()}
        dar={legacyDar}
        readOnly={true}
      />
    );

    // Fallback confidentiality
    expect(screen.getByText(/เปิดเผยทั่วไป — ทุกคนเข้าถึงได้/i)).toBeInTheDocument();
    // Fallback digital distribution
    expect(screen.getByText(/ดิจิทัล 100% \(ไม่มีการพิมพ์เล่มควบคุมกระดาษ\)/i)).toBeInTheDocument();
    // Fallback standards
    expect(screen.getByText(/มาตรฐานทั่วไป/i)).toBeInTheDocument();
  });

  it('handles long unbroken strings and prevents text overflow without double colons', () => {
    const longUnbrokenText = 'https://enterprise-qms-portal.internal.company.com/quality-manual/iso-9001-2015-clause-7-5-control-of-documented-information-revision-record-attachment-very-long-unbroken-string-without-spaces-1234567890abcdefghijklmnopqrstuvwxyz';
    const longReason = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

    const overflowDar = {
      id: 'DAR-OVERFLOW-01',
      type: 'REVISION',
      title: 'ระเบียบการควบคุมเอกสารที่มีชื่อยาวต่อเนื่องไม่มีเว้นวรรคAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      department: 'QA',
      requesterId: 'U001',
      changeReason: 'PROCESS_IMPROVEMENT',
      changeSummary: longUnbrokenText,
      requestReason: longReason
    };

    render(
      <DarReviewModal
        isOpen={true}
        onClose={vi.fn()}
        dar={overflowDar}
        readOnly={true}
      />
    );

    // Verify reason and detail titles render with single colon
    expect(screen.getByText('เหตุผลในการแก้ไข:')).toBeInTheDocument();
    expect(screen.getByText('สรุปการเปลี่ยนแปลง:')).toBeInTheDocument();

    // Verify long strings are in document
    expect(screen.getByText(longUnbrokenText)).toBeInTheDocument();
    expect(screen.getByText(/ปรับปรุงกระบวนการทำงานให้ดีขึ้น/i)).toBeInTheDocument();
  });
});
