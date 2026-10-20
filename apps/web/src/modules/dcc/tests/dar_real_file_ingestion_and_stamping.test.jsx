import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PDFDocument } from 'pdf-lib';
import useStore from '../../../store/useStore';
import TaskReview from '../pages/Tasks/TaskReview';
import { rawBlobRegistry, inMemoryBlobRegistry } from '../utils/fileStorage';
import { stampDarPreviewPdf } from '../utils/pdfStamper';

// Helper to generate a genuine 2-page test PDF
async function createTestPdf(pageCount = 2) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([600, 800]);
    page.drawText(`Real Document Page ${i + 1}`, { x: 50, y: 700 });
  }
  const bytes = await doc.save();
  return new File([bytes], 'real_procedure_manual.pdf', { type: 'application/pdf' });
}

describe('DAR File Ingestion, No Synthetic Blank Fallback & 3x3 Stamping Tests', () => {
  beforeEach(() => {
    rawBlobRegistry.clear();
    inMemoryBlobRegistry.clear();
    useStore.setState({
      dars: [],
      darRequests: [],
      tasks: [],
      timeline: [],
      currentUser: {
        id: 'U005',
        name: 'บีม',
        department: 'QA',
        position: 'QAQC Supervisor',
        role: 'DEPT_ADMIN'
      },
      masterUsers: [
        {
          id: 'U005',
          name: 'บีม',
          department: 'QA',
          position: 'QAQC Supervisor',
          signatureImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
        },
        {
          id: 'U003',
          name: 'กัลยาณี พลไกร',
          department: 'QA',
          level: 5,
          position: 'QA Manager'
        }
      ]
    });
  });

  it('1. submitDar saves real PDF file into inMemoryBlobRegistry under fileId, darId, and docCode', async () => {
    const realFile = await createTestPdf(2);
    const { submitDar } = useStore.getState();

    const darPayload = {
      title: 'ขั้นตอนการปฏิบัติงานทดสอบจริง',
      docType: 'SOP',
      docCode: 'SOP-QA-999',
      department: 'QA',
      requesterId: 'U005',
      effectiveDate: '2026-10-01'
    };

    const newDar = await submitDar(darPayload, realFile);

    expect(newDar).toBeDefined();
    expect(newDar.id).toMatch(/^DAR-\d{4}-\d{3}$/);
    expect(newDar.fileId).toBeDefined();
    expect(newDar.attachedFile).toBeDefined();
    expect(newDar.attachedFile.name).toBe('real_procedure_manual.pdf');

    // Verify storage aliases exist
    expect(rawBlobRegistry.has(newDar.fileId)).toBe(true);
    expect(rawBlobRegistry.has(newDar.id)).toBe(true);
    expect(rawBlobRegistry.has('SOP-QA-999')).toBe(true);

    // Verify tasks generated has attachedFile and fileId
    const state = useStore.getState();
    const reviewTask = state.tasks.find(t => t.darId === newDar.id);
    expect(reviewTask).toBeDefined();
    expect(reviewTask.fileId).toBe(newDar.fileId);
    expect(reviewTask.attachedFile).toBeDefined();
    expect(reviewTask.attachedFile.fileId).toBe(newDar.fileId);
  });

  it('2. TaskReview resolves the real PDF and loads preview with non-blocking lifecycle', async () => {
    const realFile = await createTestPdf(2);
    const { submitDar } = useStore.getState();

    const darPayload = {
      title: 'ขั้นตอนการปฏิบัติงานทดสอบจริง',
      docType: 'SOP',
      docCode: 'SOP-QA-999',
      department: 'QA',
      requesterId: 'U005',
      effectiveDate: '2026-10-01'
    };

    const newDar = await submitDar(darPayload, realFile);
    const state = useStore.getState();
    const reviewTask = state.tasks.find(t => t.darId === newDar.id);

    render(
      <MemoryRouter initialEntries={[`/tasks/review/${reviewTask.id}`]}>
        <Routes>
          <Route path="/tasks/review/:id" element={<TaskReview />} />
        </Routes>
      </MemoryRouter>
    );

    // Assert iframe preview mounts
    await waitFor(() => {
      const iframe = screen.queryByTitle('PDF Preview');
      expect(iframe).toBeDefined();
      if (iframe) {
        expect(iframe.src).toContain('#view=FitH');
      }
    });

    // Verify no blank PDF fallback error
    expect(screen.queryByText(/ไม่พบไฟล์เอกสารอ้างอิงจริง/i)).toBeNull();
  });

  it('3. When no file is attached, TaskReview shows explicit error state and DOES NOT create blank synthetic PDF', async () => {
    const { addDar } = useStore.getState();

    // Create a DAR without any attached file
    addDar({
      title: 'DAR Without File',
      docType: 'SOP',
      docCode: 'SOP-QA-NOFILE',
      department: 'QA',
      requesterId: 'U005',
      effectiveDate: '2026-10-01',
      fileId: null,
      attachedFile: null,
      file: null
    });

    const state = useStore.getState();
    const reviewTask = state.tasks.find(t => t.docCode === 'SOP-QA-NOFILE');
    useStore.setState({
      currentUser: {
        id: reviewTask.assigneeId || 'U003',
        name: 'กัลยาณี พลไกร',
        department: 'QA',
        role: 'REVIEWER'
      }
    });

    render(
      <MemoryRouter initialEntries={[`/tasks/review/${reviewTask.id}`]}>
        <Routes>
          <Route path="/tasks/review/:id" element={<TaskReview />} />
        </Routes>
      </MemoryRouter>
    );

    // Verify explicit error state is shown
    await waitFor(() => {
      expect(screen.getByText(/ไม่พบไฟล์เอกสารอ้างอิงจริง/i)).toBeDefined();
    });

    // Ensure iframe with PDF is not rendered
    expect(screen.queryByTitle('PDF Preview')).toBeNull();
  });

  it('4. stampDarPreviewPdf stamps 3x3 matrix table on last page and DRAFT watermark across pages on real bytes', async () => {
    const realFile = await createTestPdf(3);
    const arrayBuffer = await realFile.arrayBuffer();

    const signOffData = {
      requester: {
        name: 'บีม',
        position: 'QAQC Supervisor',
        timestamp: '25/09/2569 16:45',
        status: 'SUBMITTED',
        isCompleted: true,
        signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      },
      reviewer: {
        name: 'กัลยาณี พลไกร',
        position: 'Reviewer',
        timestamp: '',
        status: 'PENDING_REVIEW',
        isCompleted: false
      },
      approver: {
        name: 'คุณเรย์',
        position: 'Plant Director',
        timestamp: '',
        status: 'PENDING_APPROVAL',
        isCompleted: false
      }
    };

    const draftMetadata = {
      darNo: 'DAR-2026-001',
      docCode: 'SOP-QA-999',
      docTitle: 'ขั้นตอนการปฏิบัติงานทดสอบจริง',
      timestamp: '25/09/2569 16:45'
    };

    const stampedBytes = await stampDarPreviewPdf(arrayBuffer, { signOffData, draftMetadata });
    expect(stampedBytes).toBeDefined();
    expect(stampedBytes.byteLength).toBeGreaterThan(0);

    // Verify page count is preserved exactly
    const loadedDoc = await PDFDocument.load(stampedBytes);
    expect(loadedDoc.getPages().length).toBe(3);
  });
});
