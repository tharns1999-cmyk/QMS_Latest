import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ControlledCopyRegister from '../pages/ControlledCopy/ControlledCopyRegister';
import useStore from '../../../store/useStore';

vi.mock('../services/UniversalWatermarkService', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    UniversalWatermarkService: {
      ...actual.UniversalWatermarkService,
      generateStampingPDF: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      downloadWatermarkedPdf: vi.fn().mockResolvedValue('blob:mock-url')
    }
  };
});

describe('ControlledCopyRegister Unified Tabs & Safe Audit History Tests', () => {
  const dccUser = {
    id: 'U001',
    name: 'DCC Officer Admin',
    department: 'QA',
    role: 'DCC_ADMIN',
    level: 5,
    isDcc: true
  };

  const sampleDoc = {
    id: 'doc-001',
    title: 'SOP-QA-001',
    name: 'ระเบียบปฏิบัติการควบคุมคุณภาพ',
    department: 'QA',
    rev: '01',
    status: 'EFFECTIVE'
  };

  const sampleCopies = [
    {
      id: 'cc-01',
      doc_id: 'doc-001',
      doc_code: 'SOP-QA-001',
      docName: 'ระเบียบปฏิบัติการควบคุมคุณภาพ',
      copy_no: '01',
      holder_dept: 'QA',
      location: 'QA Lab Station 1',
      status: 'PENDING_ISSUE'
    },
    {
      id: 'cc-02',
      doc_id: 'doc-001',
      doc_code: 'SOP-QA-001',
      docName: 'ระเบียบปฏิบัติการควบคุมคุณภาพ',
      copy_no: '02',
      holder_dept: 'PD',
      location: 'Production Line 1',
      status: 'DISPATCHED_PENDING_RECEIPT',
      dispatched_at: '2026-08-20T10:00:00Z'
    },
    {
      id: 'cc-03',
      doc_id: 'doc-001',
      doc_code: 'SOP-QA-001',
      docName: 'ระเบียบปฏิบัติการควบคุมคุณภาพ',
      copy_no: '03',
      holder_dept: 'QC',
      location: 'QC Lab',
      status: 'ISSUED_ACTIVE',
      receipt_confirmed_at: '2026-08-21T10:00:00Z',
      receipt_confirmed_by: 'QC Staff'
    }
  ];

  // Complex & edge-case audit trail items that previously caused White Screen of Death
  const complexAuditTrail = [
    {
      id: 'audit-001',
      timestamp: '2026-08-25T08:30:00.000Z',
      user: { name: 'DCC Lead Officer', id: 'U001' }, // Object as user
      action: 'DISPATCH_COPY',
      docTitle: 'SOP-QA-001',
      ccNumber: '02',
      oldStatus: 'PENDING_ISSUE',
      newStatus: 'DISPATCHED_PENDING_RECEIPT',
      remarks: { note: 'Dispatched via internal mail', station: 'Line 1' } // Object as remarks
    },
    {
      id: 'audit-002',
      timestamp: null, // Null timestamp
      user: null, // Null user
      action: null,
      docTitle: null,
      ccNumber: null,
      remarks: null
    },
    {
      id: 'audit-003',
      timestamp: '2026-08-24T14:00:00.000Z',
      performed_by: 'Auto Service Bot',
      action: 'CC_RECALL_CONFIRMED',
      document_code: 'SOP-QA-001',
      copy_number: '01',
      details: 'All copies collected and securely destroyed'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      currentUser: dccUser,
      documents: [sampleDoc],
      controlledCopyInstances: sampleCopies,
      documentControlledCopies: sampleCopies,
      controlledCopyAuditTrail: complexAuditTrail,
      actionLog: [
        {
          id: 'log-cc-101',
          actionType: 'CC_DISPATCH',
          actor: 'DCC Officer',
          details: { batch: 'BATCH-001', count: 2 },
          timestamp: '2026-08-25T09:00:00.000Z'
        }
      ],
      masterDepartments: [{ id: 'QA', nameTh: 'ฝ่ายประกันคุณภาพ' }, { id: 'PD', nameTh: 'ฝ่ายผลิต' }]
    });
  });

  it('1. Renders unified 5-stage navigator tabs without duplicate stat cards', () => {
    render(
      <MemoryRouter initialEntries={['/controlled-copy?tab=PENDING_ISSUE']}>
        <ControlledCopyRegister />
      </MemoryRouter>
    );

    // Verify all 5 tab buttons exist in the unified navigator
    expect(screen.getByText(/1\. รายการรอออกสำเนา/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. ติดตามการส่งมอบ/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. เช็กลิสต์เรียกคืนเอกสาร/i)).toBeInTheDocument();
    expect(screen.getByText(/4\. สำเนาใช้งานจริง/i)).toBeInTheDocument();
    expect(screen.getByText(/5\. ประวัติการทำงาน/i)).toBeInTheDocument();

    // Verify single navigator structure
    const tabNav = screen.getByText(/1\. รายการรอออกสำเนา/i).closest('.grid');
    expect(tabNav).toHaveClass('md:grid-cols-5');
  });

  it('2. Clicking tabs switches active workflow stage cleanly', () => {
    render(
      <MemoryRouter initialEntries={['/controlled-copy?tab=PENDING_ISSUE']}>
        <ControlledCopyRegister />
      </MemoryRouter>
    );

    // Switch to Tab 2: ติดตามการส่งมอบ
    const tab2 = screen.getByText(/2\. ติดตามการส่งมอบ/i);
    fireEvent.click(tab2);
    expect(screen.getByText(/ติดตามการส่งมอบและรอตรวจรับ/i)).toBeInTheDocument();

    // Switch to Tab 4: สำเนาใช้งานจริง
    const tab4 = screen.getByText(/4\. สำเนาใช้งานจริง/i);
    fireEvent.click(tab4);
    expect(screen.getByText(/ทะเบียนสำเนาควบคุมที่ใช้งานอยู่จริง/i)).toBeInTheDocument();
  });

  it('3. Tab 5 (ประวัติและบันทึกการทำงาน) renders safely without White Screen crash', () => {
    render(
      <MemoryRouter initialEntries={['/controlled-copy?tab=AUDIT_TRAIL']}>
        <ControlledCopyRegister />
      </MemoryRouter>
    );

    // Header rendered
    expect(screen.getByText(/บันทึกประวัติการจัดการสำเนาและวงจรเอกสาร \(DCC Activity Logs\)/i)).toBeInTheDocument();

    // Complex object rendered as stringified JSON without crashing React
    expect(screen.getByText(/Dispatched via internal mail/i)).toBeInTheDocument();
    expect(screen.getByText(/All copies collected and securely destroyed/i)).toBeInTheDocument();
  });

  it('4. Tab 5 Export CSV button triggers download without reference errors', () => {
    const createElementSpy = vi.spyOn(document, 'createElement');

    render(
      <MemoryRouter initialEntries={['/controlled-copy?tab=AUDIT_TRAIL']}>
        <ControlledCopyRegister />
      </MemoryRouter>
    );

    const exportBtn = screen.getByTitle('Export CSV');
    expect(exportBtn).toBeInTheDocument();
    fireEvent.click(exportBtn);

    expect(createElementSpy).toHaveBeenCalledWith('a');
    createElementSpy.mockRestore();
  });
});
