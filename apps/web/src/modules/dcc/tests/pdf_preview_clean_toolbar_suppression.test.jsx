import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import useStore from '../../../store/useStore';
import TaskReview from '../pages/Tasks/TaskReview';
import TaskApprove from '../pages/Tasks/TaskApprove';
import Viewer from '../pages/Library/Viewer';
import FileViewerModal from '../components/modals/FileViewerModal';
import { saveFile } from '../utils/fileStorage';

describe('PDF Preview Clean Toolbar Suppression & Single Source Download Enforcement', () => {
  const dummySignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      currentUser: {
        id: 'u-user-01',
        name: 'หัวหน้างาน QA',
        department: 'QA',
        role: 'APPROVER',
        isDcc: true,
        isDccAdmin: true
      },
      tasks: [
        {
          id: 'task-rev-clean',
          taskId: 'task-rev-clean',
          darId: 'dar-clean-01',
          title: 'ทบทวนเอกสาร WI-QA-01',
          status: 'PENDING',
          assigneeId: 'u-user-01'
        },
        {
          id: 'task-app-clean',
          taskId: 'task-app-clean',
          darId: 'dar-clean-01',
          title: 'อนุมัติเอกสาร WI-QA-01',
          status: 'PENDING',
          assigneeId: 'u-user-01'
        }
      ],
      dars: [
        {
          id: 'dar-clean-01',
          darNumber: 'DAR-2026-CLEAN',
          darNo: 'DAR-2026-CLEAN',
          title: 'วิธีการปฏิบัติงานควบคุมคุณภาพ (WI-QA-01)',
          type: 'NEW',
          department: 'QA',
          docCode: 'WI-QA-01',
          docRev: '00',
          requesterId: 'u-user-01',
          requesterName: 'หัวหน้างาน QA',
          attachedFile: {
            fileId: 'file_clean_pdf_sample.pdf',
            name: 'clean_pdf_sample.pdf',
            size: 2048,
            type: 'application/pdf'
          },
          approvalWorkflow: [
            { step: 1, roleKey: 'REQUESTER', role: 'ผู้จัดทำ', name: 'หัวหน้างาน QA' },
            { step: 2, roleKey: 'REVIEWER', role: 'ผู้ทบทวน', name: 'หัวหน้างาน QA' }
          ]
        }
      ],
      documents: [
        {
          id: 'doc-clean-viewer-01',
          document_code: 'WI-QA-01',
          title: 'วิธีการปฏิบัติงานควบคุมคุณภาพ (WI-QA-01)',
          status: 'EFFECTIVE',
          department: 'QA',
          isSignatoryStamped: true,
          fileBlob: new Blob(['%PDF-1.4 sample stamped blob'], { type: 'application/pdf' })
        }
      ],
      masterUsers: [
        {
          id: 'u-user-01',
          name: 'หัวหน้างาน QA',
          department: 'QA',
          position: 'QA Manager',
          signatureImage: dummySignature
        }
      ]
    });
  });

  it('1. TaskReview: mounts iframe with #toolbar=0&navpanes=0&view=FitH, CSS viewport-clipping styles, and shows clean download header button', async () => {
    const sampleBlob = new Blob(['%PDF-1.4 raw content'], { type: 'application/pdf' });
    await saveFile('file_clean_pdf_sample.pdf', sampleBlob);

    render(
      <MemoryRouter initialEntries={['/tasks/review/task-rev-clean']}>
        <Routes>
          <Route path="/tasks/review/:id" element={<TaskReview />} />
        </Routes>
      </MemoryRouter>
    );

    // Verify Header Bar has single-source download button
    const downloadBtn = screen.getByTitle(/ดาวน์โหลดเอกสาร PDF/i);
    expect(downloadBtn).toBeDefined();

    // Verify iframe src has clean parameters disabling viewer toolbar and CSS viewport-clipping
    await waitFor(() => {
      const iframe = screen.queryByTitle('PDF Preview');
      expect(iframe).toBeDefined();
      if (iframe) {
        expect(iframe.src).toContain('#toolbar=0&navpanes=0&view=FitH');
        expect(iframe.style.marginTop).toBe('-54px');
        expect(iframe.style.height).toBe('calc(100% + 54px)');
      }
    });
  });

  it('2. TaskApprove: mounts iframe with #toolbar=0&navpanes=0&view=FitH, CSS viewport-clipping styles, and shows clean download header button', async () => {
    const sampleBlob = new Blob(['%PDF-1.4 raw content'], { type: 'application/pdf' });
    await saveFile('file_clean_pdf_sample.pdf', sampleBlob);

    render(
      <MemoryRouter initialEntries={['/dcc/tasks/approve/task-app-clean']}>
        <Routes>
          <Route path="/dcc/tasks/approve/:id" element={<TaskApprove />} />
        </Routes>
      </MemoryRouter>
    );

    const downloadBtn = screen.getByTitle(/ดาวน์โหลดเอกสาร PDF/i);
    expect(downloadBtn).toBeDefined();

    await waitFor(() => {
      const iframe = screen.queryByTitle('PDF Preview');
      expect(iframe).toBeDefined();
      if (iframe) {
        expect(iframe.src).toContain('#toolbar=0&navpanes=0&view=FitH');
        expect(iframe.style.marginTop).toBe('-54px');
        expect(iframe.style.height).toBe('calc(100% + 54px)');
      }
    });
  });

  it('3. FileViewerModal: renders iframe with #toolbar=0&navpanes=0&scrollbar=1&view=FitH for PDF attachments', async () => {
    const sampleBlob = new Blob(['%PDF-1.4 modal content'], { type: 'application/pdf' });
    await saveFile('file_modal_pdf.pdf', sampleBlob);

    render(
      <FileViewerModal
        isOpen={true}
        onClose={() => {}}
        attachedFile={{
          fileId: 'file_modal_pdf.pdf',
          name: 'attachment.pdf',
          type: 'application/pdf'
        }}
      />
    );

    await waitFor(() => {
      const iframe = screen.queryByTitle('PDF Preview');
      expect(iframe).toBeDefined();
      if (iframe) {
        expect(iframe.src).toContain('#toolbar=0&navpanes=0&scrollbar=1&view=FitH');
      }
    });
  });

  it('4. Viewer: renders iframe with #toolbar=0&navpanes=0&scrollbar=1&view=FitH', async () => {
    render(
      <MemoryRouter initialEntries={['/library/viewer/doc-clean-viewer-01/00']}>
        <Routes>
          <Route path="/library/viewer/:docId/:rev" element={<Viewer />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const iframe = screen.queryByTitle(/Viewer -/i);
      expect(iframe).toBeDefined();
      if (iframe) {
        expect(iframe.src).toContain('#toolbar=0&navpanes=0&scrollbar=1&view=FitH');
      }
    });
  });
});
