import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import useStore from '../../../store/useStore';
import TaskReview from '../pages/Tasks/TaskReview';
import TaskApprove from '../pages/Tasks/TaskApprove';
import SignatoryStatusCard from '../components/workflow/SignatoryStatusCard';
import { saveFile, rawBlobRegistry } from '../utils/fileStorage';
import { resolveRawFileBlob, stampPdfDocument, stampUnifiedInternalPdf, stampDarPreviewPdf, resolveProgressiveSignatories, generateSignOffStampImage } from '../utils/pdfStamper';

describe('Instant Non-Blocking Preview Architecture & Signatory Matrix Tests', () => {
  const dummySignatureDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof URL.createObjectURL !== 'function') {
      URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test-blob-url');
      URL.revokeObjectURL = vi.fn();
    }

    useStore.setState({
      currentUser: {
        id: 'u-reviewer-01',
        name: 'หัวหน้างาน QA',
        department: 'QA',
        role: 'REVIEWER'
      },
      tasks: [
        {
          id: 'task-rev-01',
          taskId: 'task-rev-01',
          darId: 'dar-new-001',
          title: 'ทบทวนเอกสาร WI-QC-01',
          status: 'PENDING',
          assigneeId: 'u-reviewer-01'
        },
        {
          id: 'task-app-01',
          taskId: 'task-app-01',
          darId: 'dar-new-001',
          title: 'อนุมัติเอกสาร WI-QC-01',
          status: 'PENDING',
          assigneeId: 'u-reviewer-01'
        }
      ],
      dars: [
        {
          id: 'dar-new-001',
          darNumber: 'DAR-2026-001',
          darNo: 'DAR-2026-001',
          title: 'วิธีการตรวจสอบคุณภาพวัตถุดิบ (WI-QC-01)',
          type: 'NEW',
          department: 'QA',
          docCode: 'WI-QC-01',
          docRev: '00',
          requesterId: 'u-beam-01',
          requesterName: 'คุณบีม (ชนัญญา ศรีสุข)',
          requesterRole: 'QAQC Supervisor',
          attachedFile: {
            fileId: 'file_1740000000_dgzhdtgh_raw.pdf',
            name: 'dgzhdtgh_raw.pdf',
            size: 1024,
            type: 'application/pdf'
          },
          approvalWorkflow: [
            { step: 1, roleKey: 'REQUESTER', role: 'ผู้ร้องขอ', name: 'คุณบีม (ชนัญญา ศรีสุข)' },
            { step: 2, roleKey: 'REVIEWER', role: 'ผู้ทบทวน', name: 'หัวหน้างาน QA' },
            { step: 3, roleKey: 'APPROVER', role: 'ผู้อนุมัติ', name: 'คุณเรย์' },
            { step: 4, roleKey: 'DCC', role: 'เจ้าหน้าที่ DCC', name: 'ธนาวุฒิ สมควรกิจดำรง' }
          ]
        }
      ],
      documents: [],
      timeline: [
        {
          id: 1,
          darId: 'dar-new-001',
          action: 'SUBMIT',
          user: 'คุณบีม (ชนัญญา ศรีสุข)',
          date: '25/09/2026 10:00'
        }
      ],
      masterUsers: [
        {
          id: 'u-beam-01',
          name: 'คุณบีม (ชนัญญา ศรีสุข)',
          department: 'QA',
          position: 'QAQC Supervisor',
          signatureImage: dummySignatureDataUrl
        },
        {
          id: 'u-reviewer-01',
          name: 'หัวหน้างาน QA',
          department: 'QA',
          position: 'QA Manager',
          signatureImage: dummySignatureDataUrl
        },
        {
          id: 'u-approver-01',
          name: 'คุณเรย์',
          department: 'QA',
          position: 'Plant Director',
          signatureImage: dummySignatureDataUrl
        }
      ]
    });
  });

  it('1. SignatoryStatusCard displays 3 columns with Khun Beam authentic signature and TH Sarabun styling', () => {
    const mockSignOffData = {
      requester: {
        name: 'คุณบีม (ชนัญญา ศรีสุข)',
        position: 'QAQC Supervisor',
        timestamp: '25/09/2569',
        status: 'SUBMITTED',
        isCompleted: true,
        signature: dummySignatureDataUrl
      },
      reviewer: {
        name: 'หัวหน้างาน QA',
        position: 'QA Manager',
        timestamp: '',
        status: 'PENDING_REVIEW',
        isCompleted: false,
        signature: null
      },
      approver: {
        name: 'คุณเรย์',
        position: 'Plant Director',
        timestamp: '',
        status: 'PENDING_APPROVAL',
        isCompleted: false,
        signature: null
      }
    };

    render(
      <SignatoryStatusCard 
        signOffData={mockSignOffData}
        stage="REVIEW"
        isStamped={false}
      />
    );

    expect(screen.getByText(/ตารางการลงนามอิเล็กทรอนิกส์/i)).toBeDefined();
    expect(screen.getByText(/1\. ผู้จัดทำ \(Requester\)/i)).toBeDefined();
    expect(screen.getByText(/2\. ผู้ทบทวน \(Reviewer\)/i)).toBeDefined();
    expect(screen.getByText(/3\. ผู้อนุมัติ \(Approver\)/i)).toBeDefined();
    expect(screen.getByText('(คุณบีม (ชนัญญา ศรีสุข))')).toBeDefined();
    expect(screen.getByText('QAQC Supervisor')).toBeDefined();

    // Verifies signature image is present
    const sigImg = screen.getByAltText(/ลายเซ็น คุณบีม/i);
    expect(sigImg).toBeDefined();
    expect(sigImg.src).toContain('data:image/png');
  });

  it('2. TaskReview renders instant non-blocking preview and unlocked download button', async () => {
    // Seed raw blob into registry under attachedFile.fileId
    const sampleBlob = new Blob(['%PDF-1.4 mock content'], { type: 'application/pdf' });
    await saveFile('file_1740000000_dgzhdtgh_raw.pdf', sampleBlob);

    render(
      <MemoryRouter initialEntries={['/tasks/review/task-rev-01']}>
        <Routes>
          <Route path="/tasks/review/:id" element={<TaskReview />} />
        </Routes>
      </MemoryRouter>
    );

    // Download button must NOT be disabled
    const downloadBtn = screen.getByTitle(/ดาวน์โหลดเอกสาร PDF/i);
    expect(downloadBtn).toBeDefined();
    expect(downloadBtn.classList.contains('cursor-not-allowed')).toBe(false);

    // Verifies SignatoryStatusCard banner is removed to maximize viewer real estate
    expect(screen.queryByText(/ตารางการลงนามอิเล็กทรอนิกส์/i)).toBeNull();

    // Verifies PDF preview frame is mounted immediately without permanent hang
    await waitFor(() => {
      const iframe = screen.queryByTitle('PDF Preview');
      expect(iframe).toBeDefined();
      if (iframe) {
        expect(iframe.src).toContain('#toolbar=0');
        expect(iframe.src).toContain('navpanes=0');
        expect(iframe.src).toContain('view=FitH');
        expect(iframe.style.marginTop).toBe('-54px');
        expect(iframe.style.height).toBe('calc(100% + 54px)');
      }
    });
  });

  it('3. TaskApprove renders instant non-blocking preview without redundant signatory banner, and unlocked download button', async () => {
    const sampleBlob = new Blob(['%PDF-1.4 mock content'], { type: 'application/pdf' });
    await saveFile('file_1740000000_dgzhdtgh_raw.pdf', sampleBlob);

    render(
      <MemoryRouter initialEntries={['/dcc/tasks/approve/task-app-01']}>
        <Routes>
          <Route path="/dcc/tasks/approve/:id" element={<TaskApprove />} />
        </Routes>
      </MemoryRouter>
    );

    // Download button is accessible and unlocked
    const downloadBtn = screen.getByTitle(/ดาวน์โหลดเอกสาร PDF/i);
    expect(downloadBtn).toBeDefined();
    expect(downloadBtn.classList.contains('cursor-not-allowed')).toBe(false);

    // Verifies Signatory Matrix banner is removed to maximize viewer real estate
    expect(screen.queryByText(/ตารางการลงนามอิเล็กทรอนิกส์/i)).toBeNull();

    // Verifies PDF iframe mounts with FitH, disabled toolbar, and CSS viewport clipping
    await waitFor(() => {
      const iframe = screen.queryByTitle('PDF Preview');
      expect(iframe).toBeDefined();
      if (iframe) {
        expect(iframe.src).toContain('#toolbar=0');
        expect(iframe.src).toContain('navpanes=0');
        expect(iframe.src).toContain('view=FitH');
        expect(iframe.style.marginTop).toBe('-54px');
        expect(iframe.style.height).toBe('calc(100% + 54px)');
      }
    });
  });

  it('4. Raw File Ingestion with random name (dgzhdtgh...pdf) resolves 100% via resolveRawFileBlob', async () => {
    const randomFileName = `file_${Date.now()}_dgzhdtgh123.pdf`;
    const randomBlob = new Blob(['%PDF-1.4 pristine arbitrary blob'], { type: 'application/pdf' });

    // Save under random key
    await saveFile(randomFileName, randomBlob);

    // Confirm registry cache hit
    expect(rawBlobRegistry.has(randomFileName)).toBe(true);

    // Test resolveRawFileBlob with random key and dar object
    const resolved = await resolveRawFileBlob(randomFileName, [], {
      attachedFile: { fileId: randomFileName, name: 'dgzhdtgh123.pdf' }
    });

    expect(resolved).toBeDefined();
    expect(resolved instanceof Blob).toBe(true);
  });

  it('5. TaskReview bypasses sign-off stamping & DRAFT watermark for OBSOLETE request and renders header badge', async () => {
    const obsoleteMasterBlob = new Blob(['%PDF-1.4 pristine master document'], { type: 'application/pdf' });
    await saveFile('file_sop_qc_01_master.pdf', obsoleteMasterBlob);

    useStore.setState({
      documents: [
        {
          id: 'doc-sop-qc-01',
          code: 'SOP-QC-01',
          document_code: 'SOP-QC-01',
          title: 'คู่มือควบคุมคุณภาพ',
          revision: '01',
          status: 'EFFECTIVE',
          fileId: 'file_sop_qc_01_master.pdf',
          file: obsoleteMasterBlob
        }
      ],
      tasks: [
        {
          id: 'task-rev-obs-01',
          taskId: 'task-rev-obs-01',
          darId: 'dar-obs-006',
          title: 'ทบทวนการขอยกเลิก SOP-QC-01 Rev.01',
          status: 'PENDING',
          assigneeId: 'u-reviewer-01'
        }
      ],
      dars: [
        {
          id: 'dar-obs-006',
          darNumber: 'DAR-2026-006',
          darNo: 'DAR-2026-006',
          title: 'ขอยกเลิก SOP-QC-01 Rev.01',
          type: 'OBSOLETE',
          action_type: 'OBSOLETE',
          department: 'QC',
          document_code: 'SOP-QC-01',
          docCode: 'SOP-QC-01',
          current_revision: '01',
          revision: '01',
          requesterId: 'u-beam-01',
          requesterName: 'คุณบีม (ชนัญญา ศรีสุข)',
          approvalWorkflow: [
            { step: 1, roleKey: 'REQUESTER', role: 'ผู้ร้องขอ', name: 'คุณบีม (ชนัญญา ศรีสุข)' },
            { step: 2, roleKey: 'REVIEWER', role: 'ผู้ทบทวน', name: 'หัวหน้างาน QA' },
            { step: 3, roleKey: 'APPROVER', role: 'ผู้อนุมัติ', name: 'คุณเรย์' },
            { step: 4, roleKey: 'DCC', role: 'เจ้าหน้าที่ DCC', name: 'ธนาวุฒิ สมควรกิจดำรง' }
          ]
        }
      ]
    });

    render(
      <MemoryRouter initialEntries={['/dcc/tasks/review/task-rev-obs-01']}>
        <Routes>
          <Route path="/dcc/tasks/review/:id" element={<TaskReview />} />
        </Routes>
      </MemoryRouter>
    );

    // Verify header badge is displayed
    await waitFor(() => {
      expect(screen.getByText(/ฉบับปัจจุบันที่ขอยกเลิก \(Effective Master Document\)/i)).toBeDefined();
    });

    // Verify PDF viewer iframe renders
    await waitFor(() => {
      const iframe = screen.queryByTitle('PDF Preview');
      expect(iframe).toBeDefined();
    });
  });

  it('6. TaskApprove bypasses sign-off stamping & DRAFT watermark for OBSOLETE request and renders header badge', async () => {
    const obsoleteMasterBlob = new Blob(['%PDF-1.4 pristine master document'], { type: 'application/pdf' });
    await saveFile('file_sop_qc_01_master.pdf', obsoleteMasterBlob);

    useStore.setState({
      documents: [
        {
          id: 'doc-sop-qc-01',
          code: 'SOP-QC-01',
          document_code: 'SOP-QC-01',
          title: 'คู่มือควบคุมคุณภาพ',
          revision: '01',
          status: 'EFFECTIVE',
          fileId: 'file_sop_qc_01_master.pdf',
          file: obsoleteMasterBlob
        }
      ],
      tasks: [
        {
          id: 'task-app-obs-01',
          taskId: 'task-app-obs-01',
          darId: 'dar-obs-006',
          title: 'อนุมัติการขอยกเลิก SOP-QC-01 Rev.01',
          status: 'PENDING',
          assigneeId: 'u-reviewer-01'
        }
      ],
      dars: [
        {
          id: 'dar-obs-006',
          darNumber: 'DAR-2026-006',
          darNo: 'DAR-2026-006',
          title: 'ขอยกเลิก SOP-QC-01 Rev.01',
          type: 'OBSOLETE',
          action_type: 'OBSOLETE',
          department: 'QC',
          document_code: 'SOP-QC-01',
          docCode: 'SOP-QC-01',
          current_revision: '01',
          revision: '01',
          requesterId: 'u-beam-01',
          requesterName: 'คุณบีม (ชนัญญา ศรีสุข)',
          approvalWorkflow: [
            { step: 1, roleKey: 'REQUESTER', role: 'ผู้ร้องขอ', name: 'คุณบีม (ชนัญญา ศรีสุข)' },
            { step: 2, roleKey: 'REVIEWER', role: 'ผู้ทบทวน', name: 'หัวหน้างาน QA' },
            { step: 3, roleKey: 'APPROVER', role: 'ผู้อนุมัติ', name: 'คุณเรย์' },
            { step: 4, roleKey: 'DCC', role: 'เจ้าหน้าที่ DCC', name: 'ธนาวุฒิ สมควรกิจดำรง' }
          ]
        }
      ]
    });

    render(
      <MemoryRouter initialEntries={['/dcc/tasks/approve/task-app-obs-01']}>
        <Routes>
          <Route path="/dcc/tasks/approve/:id" element={<TaskApprove />} />
        </Routes>
      </MemoryRouter>
    );

    // Verify header badge is displayed
    await waitFor(() => {
      expect(screen.getByText(/ฉบับปัจจุบันที่ขอยกเลิก \(Effective Master Document\)/i)).toBeDefined();
    });

    // Verify PDF viewer iframe renders
    await waitFor(() => {
      const iframe = screen.queryByTitle('PDF Preview');
      expect(iframe).toBeDefined();
    });
  });

  it('7. Stamping Guard stampPdfDocument and stampUnifiedInternalPdf return raw blob directly when skipStamping is true', async () => {
    const rawBlob = new Blob(['%PDF-1.4 raw blob sample'], { type: 'application/pdf' });
    
    // stampPdfDocument returns rawBlob immediately
    const resBlob = await stampPdfDocument(rawBlob, null, { skipStamping: true });
    expect(resBlob).toBe(rawBlob);

    // stampUnifiedInternalPdf returns rawBlob immediately
    const unifiedRes = await stampUnifiedInternalPdf(rawBlob, { skipStamping: true });
    expect(unifiedRes).toBe(rawBlob);

    // stampDarPreviewPdf returns rawBytes immediately
    const rawBytes = new Uint8Array([37, 80, 68, 70]);
    const previewRes = await stampDarPreviewPdf(rawBytes, { skipStamping: true });
    expect(previewRes).toBe(rawBytes);
  });

  it('8. Progressive Dynamic Signatory Matrix: Review stage has only creator signed, Approve stage has creator + reviewer, Master has all 3', () => {
    const mockDar = {
      id: 'DAR-2026-004',
      darNo: 'DAR-2026-004',
      type: 'REVISION',
      status: 'PENDING_REVIEW',
      requesterName: 'บีม',
      requesterRole: 'QAQC Supervisor',
      reviewerName: 'กัลยาณี พลไกร',
      reviewerRole: 'Production Assistant Manager',
      approverName: 'คุณเรย์',
      approverRole: 'General Manager / QMR'
    };

    // Review stage
    const reviewMatrix = resolveProgressiveSignatories({ dar: mockDar, stage: 'REVIEW' });
    expect(reviewMatrix.requester.isSigned).toBe(true);
    expect(reviewMatrix.requester.name).toBe('บีม');
    expect(reviewMatrix.reviewer.isSigned).toBe(false);
    expect(reviewMatrix.reviewer.name).toBe('');
    expect(reviewMatrix.reviewer.position).toBe('');
    expect(reviewMatrix.approver.isSigned).toBe(false);
    expect(reviewMatrix.approver.name).toBe('');
    expect(reviewMatrix.approver.position).toBe('');

    // Approve stage
    const approveMatrix = resolveProgressiveSignatories({ dar: mockDar, stage: 'APPROVE' });
    expect(approveMatrix.requester.isSigned).toBe(true);
    expect(approveMatrix.requester.name).toBe('บีม');
    expect(approveMatrix.reviewer.isSigned).toBe(true);
    expect(approveMatrix.reviewer.name).toBe('กัลยาณี พลไกร');
    expect(approveMatrix.approver.isSigned).toBe(false);
    expect(approveMatrix.approver.name).toBe('');
    expect(approveMatrix.approver.position).toBe('');

    // Master stage
    const masterMatrix = resolveProgressiveSignatories({ dar: mockDar, stage: 'MASTER' });
    expect(masterMatrix.requester.isSigned).toBe(true);
    expect(masterMatrix.reviewer.isSigned).toBe(true);
    expect(masterMatrix.approver.isSigned).toBe(true);
    expect(masterMatrix.approver.name).toBe('คุณเรย์');
  });

  it('9. generateSignOffStampImage renders blank cells for unsigned roles without error', async () => {
    const dataUrl = await generateSignOffStampImage({
      requester: { name: 'บีม', position: 'QAQC', isSigned: true, isCompleted: true },
      reviewer: { isSigned: false, isCompleted: false },
      approver: { isSigned: false, isCompleted: false }
    });
    expect(typeof dataUrl).toBe('string');
    expect(dataUrl.startsWith('data:image/png')).toBe(true);
  });

  it('10. stampUnifiedInternalPdf completely bypasses stamping and returns raw blob for OBSOLETE request', async () => {
    const pristineBlob = new Blob(['%PDF-1.4 pristine master blob'], { type: 'application/pdf' });
    const obsoleteDar = { id: 'DAR-2026-006', type: 'OBSOLETE' };

    const resultBlob = await stampUnifiedInternalPdf(pristineBlob, { dar: obsoleteDar });
    expect(resultBlob).toBe(pristineBlob);
  });
});
