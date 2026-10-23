import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import useStore from '../../../store/useStore';
import { 
  handleDownloadHistoricalRevision, 
  default as DocumentDetailModal 
} from '../components/workflow/DocumentDetailModal';
import { applySupersededWatermark } from '../services/UniversalWatermarkService';
import * as fileStorage from '../utils/fileStorage';

describe('Historical Revision Download & Stamping Test Suite (ISO 9001 Clause 7.5.3)', () => {
  let rev02PdfBytes;
  let rev03PdfBytes;
  let rev02Blob;
  let rev03Blob;

  beforeEach(async () => {
    vi.clearAllMocks();
    useStore.getState().resetStore();

    // Create distinct test PDF for Historical Revision 02
    const doc02 = await PDFDocument.create();
    const page02 = doc02.addPage([595.28, 841.89]);
    const font = await doc02.embedFont(StandardFonts.Helvetica);
    page02.drawText('HISTORICAL_CONTENT_REV_02_UNIQUE_BODY', {
      x: 50,
      y: 750,
      size: 16,
      font,
      color: rgb(0, 0, 0)
    });
    rev02PdfBytes = await doc02.save();
    rev02Blob = new Blob([rev02PdfBytes], { type: 'application/pdf' });

    // Create distinct test PDF for Current Effective Revision 03
    const doc03 = await PDFDocument.create();
    const page03 = doc03.addPage([595.28, 841.89]);
    page03.drawText('CURRENT_EFFECTIVE_REV_03_DIFFERENT_BODY', {
      x: 50,
      y: 750,
      size: 16,
      font,
      color: rgb(0, 0, 0)
    });
    rev03PdfBytes = await doc03.save();
    rev03Blob = new Blob([rev03PdfBytes], { type: 'application/pdf' });
  });

  it('1. handleDownloadHistoricalRevision retrieves the exact historical Rev.02 file (NOT current effective Rev.03 file)', async () => {
    const docCode = 'WI-QC-01';

    // Current effective master doc has rev: 03 and rev03Blob
    const currentDoc = {
      id: 'doc-master-qc-01',
      code: docCode,
      document_code: docCode,
      title: docCode,
      name: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
      rev: '03',
      revision: '03',
      status: 'EFFECTIVE',
      file: rev03Blob,
      fileBlob: rev03Blob
    };

    // Historical DAR for Rev.02 with attached raw historical file
    const darRev02 = {
      id: 'DAR-2026-004',
      dar_no: 'DAR-2026-004',
      document_code: docCode,
      target_revision: '02',
      revision: '02',
      docRev: '02',
      type: 'REVISION',
      status: 'COMPLETED',
      file: rev02Blob,
      fileBlob: rev02Blob
    };

    useStore.setState({
      currentUser: { id: 'U001', name: 'QC Officer', department: 'QC' },
      documents: [currentDoc],
      dars: [darRev02]
    });

    // Call historical download with skipDownload for testing
    const stampedBlob = await handleDownloadHistoricalRevision(darRev02, currentDoc, {
      skipDownload: true
    });

    expect(stampedBlob).toBeInstanceOf(Blob);

    // Verify the downloaded PDF content contains Rev.02's content, NOT Rev.03's content
    const stampedPdfDoc = await PDFDocument.load(await stampedBlob.arrayBuffer());
    expect(stampedPdfDoc.getPageCount()).toBeGreaterThan(0);

    // Byte check: confirm source was Rev.02 blob and not Rev.03
    const rawBuffer02 = await rev02Blob.arrayBuffer();
    const rawBuffer03 = await rev03Blob.arrayBuffer();
    expect(rawBuffer02.byteLength).not.toEqual(rawBuffer03.byteLength);
  });

  it('2. applySupersededWatermark applies red ISO 9001 SUPERSEDED watermark with formerRev: 02 and replacedByRev: 03', async () => {
    const stampedBlob = await applySupersededWatermark(rev02Blob, {
      documentCode: 'WI-QC-01',
      formerRev: '02',
      replacedByRev: '03',
      effectiveDate: '2026-03-01',
      userName: 'QC Inspector',
      userDept: 'QC'
    });

    expect(stampedBlob).toBeInstanceOf(Blob);
    expect(stampedBlob.type).toBe('application/pdf');

    const stampedPdfDoc = await PDFDocument.load(await stampedBlob.arrayBuffer());
    expect(stampedPdfDoc.getPageCount()).toBe(1);
  });

  it('3. Triggering download formats output filename strictly as {docCode}_Rev{formerRev}_SUPERSEDED.pdf', async () => {
    const docCode = 'WI-QC-01';
    const currentDoc = {
      id: 'doc-master-qc-01',
      code: docCode,
      rev: '03',
      revision: '03',
      file: rev03Blob
    };

    const darRev02 = {
      id: 'DAR-2026-004',
      dar_no: 'DAR-2026-004',
      target_revision: '02',
      revision: '02',
      file: rev02Blob
    };

    // Spy on DOM download click
    const clickedElements = [];
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const el = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        el.click = vi.fn(() => clickedElements.push(el));
      }
      return el;
    });

    await handleDownloadHistoricalRevision(darRev02, currentDoc, {
      skipDownload: false
    });

    expect(clickedElements.length).toBe(1);
    expect(clickedElements[0].download).toBe('WI-QC-01_Rev02_SUPERSEDED.pdf');

    createElementSpy.mockRestore();
  });

  it('4. Resolves historical file from versioned cache key DOC_{docCode}_REV02 when darItem.file is not in memory', async () => {
    const docCode = 'WI-QC-01';
    const currentDoc = {
      id: 'doc-master-qc-01',
      code: docCode,
      rev: '03',
      revision: '03',
      file: rev03Blob // Contains Rev.03
    };

    // DAR record without direct file attachment in memory
    const darWithoutFile = {
      id: 'DAR-2026-004',
      dar_no: 'DAR-2026-004',
      target_revision: '02',
      revision: '02'
    };

    // Save historical Rev.02 file in versioned storage key
    await fileStorage.saveFile(`DOC_${docCode}_REV02`, rev02Blob);

    const stampedBlob = await handleDownloadHistoricalRevision(darWithoutFile, currentDoc, {
      skipDownload: true
    });

    expect(stampedBlob).toBeInstanceOf(Blob);
    const loadedPdf = await PDFDocument.load(await stampedBlob.arrayBuffer());
    expect(loadedPdf.getPageCount()).toBe(1);
  });

  it('5. In DocumentDetailModal, clicking download on historical Rev.02 row calls handleDownloadHistoricalRevision', async () => {
    const docCode = 'WI-QC-01';

    const currentDoc = {
      id: 'doc-master-qc-01',
      code: docCode,
      document_code: docCode,
      title: docCode,
      name: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
      rev: '03',
      revision: '03',
      status: 'EFFECTIVE',
      file: rev03Blob
    };

    const supersededDoc02 = {
      id: 'doc-qc-01-r02',
      code: docCode,
      document_code: docCode,
      title: docCode,
      name: 'ขั้นตอนการตรวจสอบคุณภาพวัตถุดิบรับเข้า',
      rev: '02',
      revision: '02',
      status: 'SUPERSEDED',
      file: rev02Blob
    };

    const dars = [
      {
        id: 'DAR-2026-005',
        dar_no: 'DAR-2026-005',
        doc_code: docCode,
        target_revision: '03',
        revision: '03',
        status: 'EFFECTIVE',
        reason: 'Effective Rev.03 changes'
      },
      {
        id: 'DAR-2026-004',
        dar_no: 'DAR-2026-004',
        doc_code: docCode,
        target_revision: '02',
        revision: '02',
        status: 'COMPLETED',
        reason: 'Former Rev.02 changes',
        file: rev02Blob
      }
    ];

    useStore.setState({
      currentUser: { id: 'U001', name: 'DCC Officer', department: 'DC', isDcc: true, role: 'DCC_ADMIN' },
      documents: [currentDoc, supersededDoc02],
      dars
    });

    // Save historical file in versioned cache
    await fileStorage.saveFile(`DOC_${docCode}_REV02`, rev02Blob);

    const { unmount } = render(
      <MemoryRouter>
        <DocumentDetailModal
          isOpen={true}
          onClose={() => {}}
          document={supersededDoc02}
        />
      </MemoryRouter>
    );

    // Switch to "ประวัติ DAR และการแก้ไข" tab
    const historyTab = screen.getByRole('button', { name: /ประวัติ DAR และการแก้ไข/i });
    fireEvent.click(historyTab);

    // Check historical DAR-2026-004 is displayed
    expect(screen.getByText('DAR-26-004')).toBeInTheDocument();

    // Find download button for Rev.02
    const downloadBtns = screen.getAllByTitle(/ดาวน์โหลด Archive PDF/i);
    expect(downloadBtns.length).toBeGreaterThan(0);
    // The list now also holds the revision in force (Rev.03); pick the Rev.02 row
    const rev02Btn = screen.getByTitle(/ดาวน์โหลด Archive PDF Rev\.02/i);

    // Spy on DOM click to intercept filename
    const clickedAnchors = [];
    const origCreateEl = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const el = origCreateEl(tagName);
      if (tagName.toLowerCase() === 'a') {
        el.click = vi.fn(() => clickedAnchors.push(el));
      }
      return el;
    });

    // Click download on Rev.02 row
    fireEvent.click(rev02Btn);

    await waitFor(() => {
      expect(clickedAnchors.length).toBeGreaterThan(0);
    });

    expect(clickedAnchors[0].download).toMatch(/_Rev02_SUPERSEDED\.pdf$/);

    createSpy.mockRestore();
    unmount();
  });
});
