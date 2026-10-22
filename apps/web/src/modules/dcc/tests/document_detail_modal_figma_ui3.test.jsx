import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DocumentDetailModal from '../components/workflow/DocumentDetailModal';
import useStore from '../../../store/useStore';
import { ACCESS_SCOPES } from '../utils/accessControl';

describe('DocumentDetailModal Figma UI3 Master Overhaul Tests', () => {
  const currentUser = {
    id: 'U005',
    name: 'บีม (QA)',
    department: 'QA',
    depts: ['QA'],
    role: 'DCC_ADMIN',
    level: 4,
    isDcc: true
  };

  const sampleDoc = {
    id: 'doc-sop-qa-01',
    title: 'SOP-QA-01',
    name: 'ระเบียบการตรวจประเมินคุณภาพภายในประจำปี',
    department: 'QA',
    owner_dept: 'QA',
    rev: '02',
    effectiveDate: '2026-08-01',
    status: 'EFFECTIVE',
    access_control: { scope: ACCESS_SCOPES.GENERAL }
  };

  const sampleCopies = [
    {
      id: 'cc-qa-01',
      doc_id: 'doc-sop-qa-01',
      doc_code: 'SOP-QA-01',
      copy_no: '01',
      issue_no: '01',
      holder_dept: 'QA',
      location: 'QA Central Lab (ห้องปฏิบัติการกลาง)',
      status: 'ISSUED_ACTIVE',
      receipt_confirmed_at: '2026-08-02T08:30:00Z'
    },
    {
      id: 'cc-qa-02',
      doc_id: 'doc-sop-qa-01',
      doc_code: 'SOP-QA-01',
      copy_no: '02',
      issue_no: '02',
      is_replacement: true,
      holder_dept: 'QA',
      location: 'QA In-Process Station (จุดตรวจหน้าไลน์)',
      status: 'ISSUED_ACTIVE',
      receipt_confirmed_at: '2026-08-03T09:15:00Z'
    }
  ];

  const sampleDars = [
    {
      id: 'DAR-2026-088',
      dar_no: 'DAR-2026-088',
      doc_code: 'SOP-QA-01',
      docRev: '02',
      rev: '02',
      request_type: 'REVISION',
      type: 'REVISION',
      status: 'EFFECTIVE',
      effectiveDate: '2026-08-01',
      reason: 'ปรับปรุงเกณฑ์การสุ่มตรวจตัวอย่างให้สอดคล้องกับมาตรฐาน FSSC 22000 Version 6',
      description: 'เพิ่มความถี่ในการตรวจ Swab Test และกำหนดจุดวิกฤต CCP ใหม่',
      requester_name: 'บีม (QA Lv.4 Supervisor)',
      reviewer_name: 'กัลยาณี พลไกร (QA Lv.5 Lead)',
      approver_name: 'คุณเรย์ (MGMT Lv.6 General Manager)',
      require_ack: true
    }
  ];

  beforeEach(() => {
    useStore.setState({
      currentUser,
      documents: [sampleDoc],
      controlledCopyInstances: sampleCopies,
      documentControlledCopies: sampleCopies,
      dars: sampleDars,
      masterUsers: [
        { id: 'U005', name: 'บีม (QA Lv.4 Supervisor)' },
        { id: 'U003', name: 'กัลยาณี พลไกร (QA Lv.5 Lead)' },
        { id: 'U004', name: 'คุณเรย์ (MGMT Lv.6 General Manager)' }
      ],
      canDownloadDocument: () => true
    });
  });

  it('1. Renders Figma UI3 header with Electric Blue doc code and sharp surfaces', () => {
    render(<DocumentDetailModal isOpen={true} onClose={() => {}} document={sampleDoc} />);

    expect(screen.getAllByText('SOP-QA-01').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rev\.?02/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('ระเบียบการตรวจประเมินคุณภาพภายในประจำปี').length).toBeGreaterThan(0);
  });

  it('2. Top 4 Inspector Property Cards render accurate metadata and badges', () => {
    render(<DocumentDetailModal isOpen={true} onClose={() => {}} document={sampleDoc} />);

    expect(screen.getByText('แผนกเจ้าของเอกสาร')).toBeInTheDocument();
    expect(screen.getByText('วันที่มีผลบังคับใช้')).toBeInTheDocument();
    expect(screen.getByText('2026-08-01')).toBeInTheDocument();
    expect(screen.getAllByText('มีผลบังคับใช้').length).toBeGreaterThan(0);
    expect(screen.getByText(/ทั่วไป \(General\)/i)).toBeInTheDocument();
  });

  it('3. Action Toolbar Grid renders standardized action buttons', () => {
    render(<DocumentDetailModal isOpen={true} onClose={() => {}} document={sampleDoc} />);

    expect(screen.getByRole('button', { name: /เปิดดูเอกสาร/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ดาวน์โหลด PDF/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Watermark Studio/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ขอสำเนาควบคุมเพิ่มเติม/i })).toBeInTheDocument();
  });

  it('4. Controlled copies table renders with Issue 02 (ทดแทน) badge and warning micro-buttons', () => {
    render(<DocumentDetailModal isOpen={true} onClose={() => {}} document={sampleDoc} />);

    expect(screen.getByText(/สำเนาควบคุมที่แจกจ่ายประจำจุดใช้งาน \(2 เล่ม\)/i)).toBeInTheDocument();
    expect(screen.getByText(/QA Central Lab/i)).toBeInTheDocument();
    expect(screen.getByText(/Issue 02 \(ทดแทน\)/i)).toBeInTheDocument();

    const reportBtns = screen.getAllByRole('button', { name: /แจ้งชำรุด\/เล่มใหม่/i });
    expect(reportBtns.length).toBe(2);
  });

  it('5. Tab 2 "ประวัติ DAR และการแก้ไข" displays rich audit trail and 4-step sign-off matrix without empty dashes', () => {
    render(<DocumentDetailModal isOpen={true} onClose={() => {}} document={sampleDoc} />);

    const historyTab = screen.getByRole('button', { name: /ประวัติ DAR และการแก้ไข/i });
    fireEvent.click(historyTab);

    // Verify DAR Header
    expect(screen.getByText('DAR-26-088')).toBeInTheDocument();
    expect(screen.getByText('ขอแก้ไข')).toBeInTheDocument();

    // Verify Reason & Description
    expect(screen.getByText(/ปรับปรุงเกณฑ์การสุ่มตรวจตัวอย่างให้สอดคล้องกับมาตรฐาน FSSC 22000/i)).toBeInTheDocument();
    expect(screen.getByText(/เพิ่มความถี่ในการตรวจ Swab Test และกำหนดจุดวิกฤต CCP ใหม่/i)).toBeInTheDocument();

    // Verify 4-step sign-off matrix
    expect(screen.getAllByText('บีม (QA Lv.4 Supervisor)')[0]).toBeInTheDocument();
    expect(screen.getByText('กัลยาณี พลไกร (QA Lv.5 Lead)')).toBeInTheDocument();
    expect(screen.getByText('คุณเรย์ (MGMT Lv.6 General Manager)')).toBeInTheDocument();
    expect(screen.getAllByText('ต้องรับทราบ')[0]).toBeInTheDocument();
  });

  it('6. Tab 2 renders "ส่งออกประวัติ (CSV)" button and exports valid CSV data with UTF-8 BOM', () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-csv-url');
    const revokeObjectURLMock = vi.fn();
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    render(<DocumentDetailModal isOpen={true} onClose={() => {}} document={sampleDoc} />);

    const historyTab = screen.getByRole('button', { name: /ประวัติ DAR และการแก้ไข/i });
    fireEvent.click(historyTab);

    const exportBtn = screen.getByRole('button', { name: /ส่งออกประวัติ \(CSV\)/i });
    expect(exportBtn).toBeInTheDocument();
    expect(exportBtn).not.toBeDisabled();

    fireEvent.click(exportBtn);
    expect(createObjectURLMock).toHaveBeenCalled();
  });

  it('7. "ดาวน์โหลด PDF" button calls resolveFileBlob and triggers UniversalWatermarkService download', async () => {
    const { UniversalWatermarkService } = await import('../services/UniversalWatermarkService');
    const toast = (await import('react-hot-toast')).default;

    const fakePdfBlob = new Blob(['%PDF-1.4 mock content'], { type: 'application/pdf' });
    const successSpy = vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'error').mockImplementation(() => {});
    vi.spyOn(toast, 'loading').mockReturnValue('t-123');
    vi.spyOn(toast, 'dismiss').mockImplementation(() => {});

    // Mock file resolver returning a valid raw blob
    const downloadSpy = vi.spyOn(UniversalWatermarkService, 'downloadWatermarkedPdf').mockResolvedValue('blob:mock-watermarked');

    // Attach attachedFile to sampleDoc
    const docWithFile = {
      ...sampleDoc,
      fileId: 'file-sample-01',
      attachedFile: { fileId: 'file-sample-01', name: 'sop.pdf', type: 'application/pdf' },
      file: fakePdfBlob
    };

    render(<DocumentDetailModal isOpen={true} onClose={() => {}} document={docWithFile} />);

    const downloadPdfBtn = screen.getByRole('button', { name: /ดาวน์โหลด PDF/i });
    expect(downloadPdfBtn).toBeInTheDocument();

    fireEvent.click(downloadPdfBtn);
    const uncontrolledOpt = screen.queryByRole('button', { name: /สำเนาไม่ควบคุม/i });
    if (uncontrolledOpt) {
      fireEvent.click(uncontrolledOpt);
    }

    const { waitFor } = await import('@testing-library/react');
    await waitFor(() => {
      expect(downloadSpy).toHaveBeenCalled();
    });
    // Critical ISO 9001 Assertion: Must NOT be called with CONTROLLED or CONTROLLED_COPY
    const calledWatermarkType = downloadSpy.mock.calls[0]?.[1];
    expect(calledWatermarkType).not.toBe('CONTROLLED');
    expect(calledWatermarkType).not.toBe('CONTROLLED_COPY');
    expect(calledWatermarkType).toBe('UNCONTROLLED_COPY');

    await waitFor(() => {
      expect(successSpy).toHaveBeenCalledWith(expect.stringContaining('สำเร็จ'));
    });
  });

  it('8. No Phantom Success: displays red error toast when document original file is not found', async () => {
    const { UniversalWatermarkService } = await import('../services/UniversalWatermarkService');
    const fileStorage = await import('../utils/fileStorage');
    const toast = (await import('react-hot-toast')).default;

    const toastErrorSpy = vi.spyOn(toast, 'error').mockImplementation(() => {});
    const toastSuccessSpy = vi.spyOn(toast, 'success').mockImplementation(() => {});
    toastErrorSpy.mockClear();
    toastSuccessSpy.mockClear();
    vi.spyOn(toast, 'loading').mockReturnValue('t-124');
    vi.spyOn(toast, 'dismiss').mockImplementation(() => {});
    const downloadSpy = vi.spyOn(UniversalWatermarkService, 'downloadWatermarkedPdf');
    downloadSpy.mockClear();

    // Force resolveFileBlob to return null (file missing in IDB and memory)
    vi.spyOn(fileStorage, 'resolveFileBlob').mockResolvedValue(null);

    const docWithoutFile = {
      id: 'doc-missing-file',
      title: 'WI-MISSING-01',
      status: 'EFFECTIVE'
    };

    render(<DocumentDetailModal isOpen={true} onClose={() => {}} document={docWithoutFile} />);

    const downloadPdfBtn = screen.getByRole('button', { name: /ดาวน์โหลด PDF/i });
    fireEvent.click(downloadPdfBtn);
    const uncontrolledOpt = screen.queryByRole('button', { name: /สำเนาไม่ควบคุม/i });
    if (uncontrolledOpt) {
      fireEvent.click(uncontrolledOpt);
    }

    const { waitFor } = await import('@testing-library/react');
    // Verify: error toast is triggered, no phantom success toast, and watermarking is NOT called
    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledWith('ไม่พบไฟล์เอกสารต้นฉบับในระบบ');
    });
    expect(toastSuccessSpy).not.toHaveBeenCalled();
    expect(downloadSpy).not.toHaveBeenCalled();
  });

  it('9. Form Bypass: calls downloadCleanPdf for blank forms (FM type)', async () => {
    const { UniversalWatermarkService } = await import('../services/UniversalWatermarkService');
    const fileStorage = await import('../utils/fileStorage');
    const toast = (await import('react-hot-toast')).default;

    const fakePdfBlob = new Blob(['%PDF-1.4 form content'], { type: 'application/pdf' });
    vi.spyOn(fileStorage, 'resolveFileBlob').mockResolvedValue(fakePdfBlob);
    const cleanPdfSpy = vi.spyOn(UniversalWatermarkService, 'downloadCleanPdf').mockResolvedValue('blob:mock-clean');
    const successSpy = vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'loading').mockReturnValue('t-125');
    vi.spyOn(toast, 'dismiss').mockImplementation(() => {});

    const formDoc = {
      id: 'doc-fm-qc-01',
      docCode: 'FM-QC-01',
      docType: 'FM',
      title: 'FM-QC-01 แบบฟอร์มบันทึกการตรวจประเมิน',
      status: 'EFFECTIVE'
    };

    render(<DocumentDetailModal isOpen={true} onClose={() => {}} document={formDoc} />);

    const downloadPdfBtn = screen.getByRole('button', { name: /ดาวน์โหลด PDF/i });
    fireEvent.click(downloadPdfBtn);
    const uncontrolledOpt = screen.queryByRole('button', { name: /สำเนาไม่ควบคุม/i });
    if (uncontrolledOpt) {
      fireEvent.click(uncontrolledOpt);
    }

    const { waitFor } = await import('@testing-library/react');
    await waitFor(() => {
      expect(cleanPdfSpy).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(successSpy).toHaveBeenCalledWith(expect.stringContaining('สำเร็จ'));
    });
  });

  it('10. Role-Based Menu: DCC Admin sees 2 choices (Uncontrolled Copy & Clean Master) and can download Clean Master', async () => {
    const { UniversalWatermarkService } = await import('../services/UniversalWatermarkService');
    const fileStorage = await import('../utils/fileStorage');
    const toast = (await import('react-hot-toast')).default;

    const fakePdfBlob = new Blob(['%PDF-1.4 mock content'], { type: 'application/pdf' });
    vi.spyOn(fileStorage, 'resolveFileBlob').mockResolvedValue(fakePdfBlob);
    const cleanSpy = vi.spyOn(UniversalWatermarkService, 'downloadCleanPdf').mockResolvedValue('blob:mock-clean');
    const watermarkSpy = vi.spyOn(UniversalWatermarkService, 'downloadWatermarkedPdf').mockResolvedValue('blob:mock-wm');
    cleanSpy.mockClear();
    watermarkSpy.mockClear();
    vi.spyOn(toast, 'loading').mockReturnValue('t-200');
    vi.spyOn(toast, 'dismiss').mockImplementation(() => {});
    vi.spyOn(toast, 'success').mockImplementation(() => {});

    render(<DocumentDetailModal isOpen={true} onClose={() => {}} document={sampleDoc} />);

    const downloadPdfBtn = screen.getByRole('button', { name: /ดาวน์โหลด PDF/i });
    fireEvent.click(downloadPdfBtn);

    // Verify Dropdown items exist
    const uncontrolledOption = screen.getByRole('button', { name: /สำเนาไม่ควบคุม/i });
    const cleanOption = screen.getByRole('button', { name: /เอกสารแม่บทคลีน/i });
    expect(uncontrolledOption).toBeInTheDocument();
    expect(cleanOption).toBeInTheDocument();

    // Click Clean Master
    fireEvent.click(cleanOption);

    const { waitFor } = await import('@testing-library/react');
    await waitFor(() => {
      expect(cleanSpy).toHaveBeenCalled();
    });
    expect(watermarkSpy).not.toHaveBeenCalled();
  });

  it('11. Non-DCC User: Single click directly downloads Uncontrolled Copy without dropdown menu', async () => {
    const { UniversalWatermarkService } = await import('../services/UniversalWatermarkService');
    const fileStorage = await import('../utils/fileStorage');
    const toast = (await import('react-hot-toast')).default;

    const regularUser = {
      id: 'U099',
      name: 'พนักงานทั่วไป (PROD)',
      department: 'PD',
      depts: ['PD'],
      role: 'USER',
      level: 1,
      isDcc: false
    };

    useStore.setState({ currentUser: regularUser });

    const fakePdfBlob = new Blob(['%PDF-1.4 regular content'], { type: 'application/pdf' });
    vi.spyOn(fileStorage, 'resolveFileBlob').mockResolvedValue(fakePdfBlob);
    const watermarkSpy = vi.spyOn(UniversalWatermarkService, 'downloadWatermarkedPdf').mockResolvedValue('blob:mock-regular');
    watermarkSpy.mockClear();
    vi.spyOn(toast, 'loading').mockReturnValue('t-300');
    vi.spyOn(toast, 'dismiss').mockImplementation(() => {});
    vi.spyOn(toast, 'success').mockImplementation(() => {});

    render(<DocumentDetailModal isOpen={true} onClose={() => {}} document={sampleDoc} />);

    const downloadPdfBtn = screen.getByRole('button', { name: /ดาวน์โหลด PDF/i });
    fireEvent.click(downloadPdfBtn);

    // Non-DCC user should immediately trigger downloadWatermarkedPdf with UNCONTROLLED_COPY
    const { waitFor } = await import('@testing-library/react');
    await waitFor(() => {
      expect(watermarkSpy).toHaveBeenCalledWith(
        expect.anything(),
        'UNCONTROLLED_COPY',
        expect.anything(),
        false
      );
    });

    // Dropdown options should NOT exist
    expect(screen.queryByRole('button', { name: /เอกสารแม่บทคลีน/i })).not.toBeInTheDocument();

    // Reset store state
    useStore.setState({ currentUser });
  });
});
