import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import useStore from '../../../store/useStore';
import DocumentDetailModal, { 
  handleDownloadHistoricalRevision,
  resolveFullDocumentHistory 
} from '../components/workflow/DocumentDetailModal';
import DocumentHistoryTab from '../components/Documents/DocumentHistoryTab';

describe('Fix Full Document Lifecycle Traceability for OBSOLETE Documents (Retain All Superseded Historical Revisions)', () => {
  let samplePdfBlob;

  beforeEach(async () => {
    vi.clearAllMocks();
    useStore.getState().resetStore();

    // Generate sample PDF for download test
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText('SAMPLE_OBSOLETE_DOCUMENT_BODY', { x: 50, y: 750, size: 14, font, color: rgb(0, 0, 0) });
    const bytes = await pdfDoc.save();
    samplePdfBlob = new Blob([bytes], { type: 'application/pdf' });

    useStore.setState({
      currentUser: {
        id: 'U005',
        name: 'บีม (QA)',
        department: 'QC',
        role: 'DCC_ADMIN',
        isDcc: true
      }
    });
  });

  const obsoleteDocSopQc01 = {
    id: 'doc-sop-qc-01',
    code: 'SOP-QC-01',
    document_code: 'SOP-QC-01',
    doc_code: 'SOP-QC-01',
    title: 'SOP-QC-01',
    name: 'ระเบียบการควบคุมคุณภาพวัตถุดิบและผลิตภัณฑ์สำเร็จรูป',
    docName: 'ระเบียบการควบคุมคุณภาพวัตถุดิบและผลิตภัณฑ์สำเร็จรูป',
    department: 'QC',
    status: 'OBSOLETE',
    is_obsolete: true,
    rev: '02',
    revision: '02',
    doc_version: '02',
    effectiveDate: '2026-07-01',
    file: null,
    fileBlob: null,
    revision_history: [
      {
        revision: '00',
        rev: '00',
        type: 'NEW',
        dar_no: 'DAR-2025-001',
        effective_date: '2025-01-15',
        reason: 'จัดทำเอกสารฉบับเริ่มต้น Genesis'
      },
      {
        revision: '01',
        rev: '01',
        type: 'REVISION',
        dar_no: 'DAR-2025-080',
        effective_date: '2025-08-01',
        reason: 'ปรับปรุงกระบวนการสุ่มตรวจตามมาตรฐาน ISO 9001'
      },
      {
        revision: '02',
        rev: '02',
        type: 'REVISION',
        dar_no: 'DAR-2026-003',
        effective_date: '2026-03-01',
        reason: 'ปรับปรุงเกณฑ์การยอมรับข้อบกพร่อง'
      }
    ]
  };

  const darsList = [
    {
      id: 'DAR-2026-004',
      dar_no: 'DAR-2026-004',
      document_code: 'SOP-QC-01',
      doc_code: 'SOP-QC-01',
      type: 'OBSOLETE',
      request_type: 'OBSOLETE',
      status: 'COMPLETED',
      revision: '02',
      target_revision: '02',
      effectiveDate: '2026-07-01',
      reason: 'ยกเลิกการใช้งานเนื่องจากเปลี่ยนสายการผลิต'
    }
  ];

  it('1. resolveFullDocumentHistory merges DARs and revision_history and sorts OBSOLETE at top, followed by revisions descending', () => {
    const history = resolveFullDocumentHistory(obsoleteDocSopQc01, darsList);

    // Criteria 1 & 2: Expect all 4 entries (Rev.02 Obsolete, Rev.02 Revision, Rev.01, Rev.00)
    expect(history.length).toBe(4);

    // 1st entry: OBSOLETE (Rev.02)
    expect(history[0].type).toBe('OBSOLETE');
    expect(history[0].dar_no).toBe('DAR-2026-004');
    expect(history[0].revision).toBe('02');

    // 2nd entry: Rev.02 (REVISION)
    expect(history[1].type).toBe('REVISION');
    expect(history[1].revision).toBe('02');
    expect(history[1].dar_no).toBe('DAR-2026-003');

    // 3rd entry: Rev.01 (REVISION)
    expect(history[2].type).toBe('REVISION');
    expect(history[2].revision).toBe('01');
    expect(history[2].dar_no).toBe('DAR-2025-080');

    // 4th entry: Rev.00 (NEW)
    expect(history[3].type).toBe('NEW');
    expect(history[3].revision).toBe('00');
    expect(history[3].dar_no).toBe('DAR-2025-001');
  });

  it('2. DocumentDetailModal displays all revisions and correct count for Obsolete document SOP-QC-01', () => {
    useStore.setState({
      documents: [obsoleteDocSopQc01],
      dars: darsList
    });

    render(
      <DocumentDetailModal
        isOpen={true}
        onClose={() => {}}
        document={obsoleteDocSopQc01}
      />
    );

    // Tab badge displays exact count (4)
    const historyTabBtn = screen.getByRole('button', { name: /ประวัติ DAR และการแก้ไข/i });
    expect(historyTabBtn).toBeInTheDocument();
    expect(screen.getByText(/ประวัติ DAR และการแก้ไข \(4\)/i)).toBeInTheDocument();

    fireEvent.click(historyTabBtn);

    // Header count states: พบทั้งหมด 4 ฉบับ
    expect(screen.getByText(/พบทั้งหมด 4 ฉบับ/i)).toBeInTheDocument();

    // Displays all items
    expect(screen.getByText('DAR-26-004')).toBeInTheDocument();
    expect(screen.getByText('DAR-26-003')).toBeInTheDocument();
    expect(screen.getByText('DAR-25-080')).toBeInTheDocument();
    expect(screen.getByText('DAR-25-001')).toBeInTheDocument();

    // Verify badges
    expect(screen.getByText(/สิ้นสุดที่ Rev\.02/i)).toBeInTheDocument();
    expect(screen.getAllByText(/ยกเลิกถาวร/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Rev.01')).toBeInTheDocument();
    expect(screen.getByText('Rev.00')).toBeInTheDocument();
  });

  it('3. DocumentHistoryTab component renders count and all history items properly', () => {
    render(
      <DocumentHistoryTab
        currentDoc={obsoleteDocSopQc01}
        allDars={darsList}
      />
    );

    expect(screen.getByText(/พบทั้งหมด 4 ฉบับ/i)).toBeInTheDocument();
    expect(screen.getByText('DAR-26-004')).toBeInTheDocument();
    expect(screen.getByText('DAR-26-003')).toBeInTheDocument();
    expect(screen.getByText('DAR-25-080')).toBeInTheDocument();
    expect(screen.getByText('DAR-25-001')).toBeInTheDocument();
  });

  it('4. Historical revision download stamps SUPERSEDED for past revisions (Rev.00, Rev.01) and formats filename', async () => {
    const histItemRev01 = {
      id: 'DAR-2025-080',
      dar_no: 'DAR-2025-080',
      revision: '01',
      target_revision: '01',
      type: 'REVISION',
      file: samplePdfBlob
    };

    const clickedElements = [];
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const el = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        el.click = vi.fn(() => clickedElements.push(el));
      }
      return el;
    });

    const stampedBlob = await handleDownloadHistoricalRevision(histItemRev01, obsoleteDocSopQc01, {
      skipDownload: false
    });

    expect(stampedBlob).toBeInstanceOf(Blob);
    expect(clickedElements.length).toBe(1);
    expect(clickedElements[0].download).toBe('SOP-QC-01_Rev01_SUPERSEDED.pdf');

    createElementSpy.mockRestore();
  });

  it('5. Historical revision download stamps OBSOLETE for OBSOLETE request and formats filename', async () => {
    const obsoleteItem = {
      id: 'DAR-2026-004',
      dar_no: 'DAR-2026-004',
      revision: '02',
      target_revision: '02',
      type: 'OBSOLETE',
      file: samplePdfBlob
    };

    const clickedElements = [];
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const el = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        el.click = vi.fn(() => clickedElements.push(el));
      }
      return el;
    });

    const stampedBlob = await handleDownloadHistoricalRevision(obsoleteItem, obsoleteDocSopQc01, {
      skipDownload: false
    });

    expect(stampedBlob).toBeInstanceOf(Blob);
    expect(clickedElements.length).toBe(1);
    expect(clickedElements[0].download).toBe('SOP-QC-01_Rev02_OBSOLETE.pdf');

    createElementSpy.mockRestore();
  });

  it('6. obsoleteDocument action in useStore retains existing revision_history and adds current and obsolete entries', () => {
    const initialDoc = {
      id: 'doc-qc-sample',
      code: 'SOP-TEST-01',
      title: 'SOP-TEST-01',
      status: 'EFFECTIVE',
      revision: '02',
      effectiveDate: '2026-01-01',
      revision_history: [
        { revision: '00', type: 'NEW', dar_no: 'DAR-2024-001' },
        { revision: '01', type: 'REVISION', dar_no: 'DAR-2025-001' }
      ]
    };

    useStore.setState({
      documents: [initialDoc]
    });

    useStore.getState().obsoleteDocument('SOP-TEST-01', 'ยกเลิกเนื่องจากหมดความจำเป็น', 'DAR-2026-999');

    const updated = useStore.getState().documents.find(d => d.code === 'SOP-TEST-01');
    expect(updated.status).toBe('OBSOLETE');
    expect(updated.is_obsolete).toBe(true);
    expect(updated.revision_history.length).toBe(4);

    const rev00 = updated.revision_history.find(h => h.revision === '00');
    const rev01 = updated.revision_history.find(h => h.revision === '01');
    const rev02 = updated.revision_history.find(h => h.revision === '02' && h.type === 'REVISION');
    const obs = updated.revision_history.find(h => h.type === 'OBSOLETE');

    expect(rev00).toBeTruthy();
    expect(rev01).toBeTruthy();
    expect(rev02).toBeTruthy();
    expect(obs).toBeTruthy();
    expect(obs.dar_no).toBe('DAR-2026-999');
  });
});
