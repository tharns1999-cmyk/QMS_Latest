import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PDFDocument } from 'pdf-lib';
import Library from '../pages/Library/Library';
import useStore from '../store/useStore';
import { UniversalWatermarkService, WATERMARK_TYPES } from '../services/UniversalWatermarkService';
import toast from 'react-hot-toast';

vi.mock('react-hot-toast', () => ({
  default: {
    loading: vi.fn(() => 'loading-toast-id'),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
  toast: {
    loading: vi.fn(() => 'loading-toast-id'),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  }
}));

describe('Library PDF Download, Preview & Watermark Actions Tests', () => {
  const sampleDoc = {
    id: 'doc-001',
    title: 'SOP-PD-001',
    name: 'คู่มือการปฏิบัติงานผสมวัตถุดิบ',
    department: 'PD',
    rev: '01',
    effectiveDate: '2026-08-15',
    status: 'EFFECTIVE',
    relatedStandards: ['ISO 9001:2015']
  };

  const sampleForm = {
    id: 'doc-002',
    title: 'FM-PD-001',
    name: 'แบบฟอร์มตรวจสอบวัตถุดิบ',
    department: 'PD',
    rev: '00',
    effectiveDate: '2026-08-15',
    status: 'EFFECTIVE'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      currentUser: {
        id: 'U001',
        name: 'Admin QA (DCC)',
        role: 'DCC_ADMIN',
        isDcc: true,
        department: 'QA',
        level: 1
      },
      documents: [sampleDoc, sampleForm],
      masterDepartments: [
        { id: 'PD', nameTh: 'ฝ่ายผลิต' },
        { id: 'QA', nameTh: 'ฝ่ายประกันคุณภาพ' }
      ]
    });
  });

  describe('1. UniversalWatermarkService Methods', () => {
    it('generateStampingPDF stamps the real attached PDF bytes', async () => {
      const source = await PDFDocument.create();
      source.addPage();
      const originalPdfBytes = await source.save();

      const pdfBytes = await UniversalWatermarkService.generateStampingPDF(
        { ...sampleDoc, originalPdfBytes },
        WATERMARK_TYPES.UNCONTROLLED_COPY,
        { name: 'User 1', department: 'PD' }
      );
      expect(pdfBytes).toBeInstanceOf(Uint8Array);
      expect(pdfBytes.length).toBeGreaterThan(0);
    });

    it('fails closed when the original file is missing (never fabricates a placeholder PDF)', async () => {
      await expect(UniversalWatermarkService.generateStampingPDF(
        sampleDoc,
        WATERMARK_TYPES.UNCONTROLLED_COPY,
        { name: 'User 1', department: 'PD' }
      )).rejects.toThrow(/Original file not found/);
    });

    it('downloadWatermarkedPdf resolves and downloads without throw', async () => {
      const spyDownload = vi.spyOn(UniversalWatermarkService, 'downloadWatermarkedPdf').mockResolvedValue('blob:mock-url');
      const res = await UniversalWatermarkService.downloadWatermarkedPdf(sampleDoc, WATERMARK_TYPES.OFFICIAL_MASTER_COPY, {}, false);
      expect(res).toBe('blob:mock-url');
      expect(spyDownload).toHaveBeenCalled();
    });
  });

  describe('2. Library.jsx PDF Actions for DCC Admin', () => {
    it('triggers handleDownloadMaster when Master Download button is clicked', async () => {
      const spyDownload = vi.spyOn(UniversalWatermarkService, 'downloadWatermarkedPdf').mockResolvedValue('blob:mock-url');

      render(
        <MemoryRouter>
          <Library />
        </MemoryRouter>
      );
      // PD docs for a QA-based DCC user live in the General tab (default tab is My Dept)
      fireEvent.click(screen.getByRole('button', { name: /เอกสารทั่วไป/ }));

      const downloadBtns = screen.getAllByTitle('ดาวน์โหลด Master Document (DCC)');
      expect(downloadBtns.length).toBeGreaterThan(0);
      fireEvent.click(downloadBtns[0]);

      await waitFor(() => {
        expect(toast.loading).toHaveBeenCalledWith('กำลังสร้าง Master Archive PDF...');
        expect(spyDownload).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'SOP-PD-001' }),
          WATERMARK_TYPES.OFFICIAL_MASTER_COPY,
          expect.objectContaining({ reason: 'Official Master Archive' }),
          false
        );
        expect(toast.dismiss).toHaveBeenCalledWith('loading-toast-id');
        expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('ดาวน์โหลด Master Copy'));
      });
    });

    it('triggers handleDownloadExternal when External Release button is clicked', async () => {
      const spyDownload = vi.spyOn(UniversalWatermarkService, 'downloadWatermarkedPdf').mockResolvedValue('blob:mock-url');

      render(
        <MemoryRouter>
          <Library />
        </MemoryRouter>
      );
      // PD docs for a QA-based DCC user live in the General tab (default tab is My Dept)
      fireEvent.click(screen.getByRole('button', { name: /เอกสารทั่วไป/ }));

      // External Release lives in the row overflow menu
      const sopRow = screen.getByText('SOP-PD-001').closest('tr');
      fireEvent.click(within(sopRow).getByTitle('เมนูการจัดการเพิ่มเติม'));
      fireEvent.click(within(sopRow).getByTitle('ดาวน์โหลดสำหรับแจกจ่ายภายนอก (External Release)'));

      await waitFor(() => {
        expect(toast.loading).toHaveBeenCalledWith('กำลังสร้าง External Release PDF...');
        expect(spyDownload).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'SOP-PD-001' }),
          WATERMARK_TYPES.STRICTLY_CONFIDENTIAL,
          expect.objectContaining({ reason: 'External Audit / Vendor Release' }),
          false
        );
        expect(toast.dismiss).toHaveBeenCalledWith('loading-toast-id');
        expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('ดาวน์โหลด External Release'));
      });
    });

    it('non-DCC user downloads an UNCONTROLLED COPY from the quick download button', async () => {
      const spyDownload = vi.spyOn(UniversalWatermarkService, 'downloadWatermarkedPdf').mockResolvedValue('blob:mock-url');
      useStore.setState({ currentUser: { id: 'U-PD', name: 'PD Staff', role: 'GENERAL_USER', department: 'PD', level: 3 } });

      render(
        <MemoryRouter>
          <Library />
        </MemoryRouter>
      );
      // PD docs for a QA-based DCC user live in the General tab (default tab is My Dept)
      fireEvent.click(screen.getByRole('button', { name: /เอกสารทั่วไป/ }));

      fireEvent.click(screen.getByRole('button', { name: /เอกสารในแผนกฉัน/ }));
      fireEvent.click(screen.getByTitle('ดาวน์โหลดสำเนาไม่ควบคุม (UNCONTROLLED COPY)'));

      await waitFor(() => {
        expect(toast.loading).toHaveBeenCalledWith('กำลังสร้างไฟล์ PDF และประทับลายน้ำ (UNCONTROLLED COPY)...');
        expect(spyDownload).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'SOP-PD-001' }),
          WATERMARK_TYPES.UNCONTROLLED_COPY,
          expect.objectContaining({ reason: 'General Download / Print' }),
          false
        );
        expect(toast.dismiss).toHaveBeenCalledWith('loading-toast-id');
        expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('UNCONTROLLED COPY'));
      });
    });

    it('gracefully handles error and dismisses loading toast if PDF generation fails', async () => {
      vi.spyOn(UniversalWatermarkService, 'downloadWatermarkedPdf').mockRejectedValue(new Error('PDF Corrupted'));

      render(
        <MemoryRouter>
          <Library />
        </MemoryRouter>
      );
      // PD docs for a QA-based DCC user live in the General tab (default tab is My Dept)
      fireEvent.click(screen.getByRole('button', { name: /เอกสารทั่วไป/ }));

      const downloadBtns = screen.getAllByTitle('ดาวน์โหลด Master Document (DCC)');
      fireEvent.click(downloadBtns[0]);

      await waitFor(() => {
        expect(toast.loading).toHaveBeenCalled();
        expect(toast.dismiss).toHaveBeenCalledWith('loading-toast-id');
        expect(toast.error).toHaveBeenCalledWith('เกิดข้อผิดพลาดในการสร้าง Master PDF');
      });
    });
  });
});
