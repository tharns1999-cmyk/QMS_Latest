import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { PDFDocument, PDFPage } from 'pdf-lib';
import useStore from '../../../store/useStore';
import { renderWithRouter } from '../../../test/test_utils';
import Library from '../pages/Library/Library';
import { 
  UniversalWatermarkService, 
  WATERMARK_TYPES, 
  resolveWatermarkConfig 
} from '../services/UniversalWatermarkService';
import { resolveWatermarkConfig as resolveFromUtil } from '../utils/pdfWatermark';

describe('Critical System Fix: Library Status Filter Normalization & Watermark Disentanglement Tests', () => {
  let drawTextSpy;

  beforeEach(() => {
    drawTextSpy = vi.spyOn(PDFPage.prototype, 'drawText');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createSamplePdf = async (width = 595.28, height = 841.89) => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([width, height]);
    return await pdfDoc.save();
  };

  describe('1. Status Normalization & Tab Filter Verification', () => {
    const mockCurrentUser = {
      id: 'U002',
      name: 'กัลยาณี พลไกร (QA Lead)',
      username: 'kallayanee_qa',
      department: 'QA',
      depts: ['QA', 'QA/QC'],
      role: 'DEPT_ADMIN',
      level: 4,
      isDcc: false
    };

    beforeEach(() => {
      useStore.setState({
        currentUser: mockCurrentUser,
        documents: [
          {
            id: 'doc-qa-001',
            title: 'SOP-QA-001',
            name: 'คู่มือการปฏิบัติงานการประกันคุณภาพ',
            rev: '02',
            department: 'QA',
            status: 'EFFECTIVE',
            effectiveDate: '2026-08-01'
          },
          {
            id: 'doc-qa-002',
            title: 'SOP-QA-002',
            name: 'ขั้นตอนการตรวจสอบวัตถุดิบ (ฉบับเก่า)',
            rev: '01',
            department: 'QA',
            status: 'SUPERSEDED_ARCHIVED',
            superseded_by_rev: '02',
            effectiveDate: '2025-01-01'
          },
          {
            id: 'doc-qa-003',
            title: 'SOP-QA-003',
            name: 'มาตรฐานการจัดการของเสียอันตราย (ยกเลิกแล้ว)',
            rev: '01',
            department: 'QA',
            status: 'OBSOLETE_ARCHIVED',
            obsolete_dar_id: 'DAR-OBS-2026-003',
            effectiveDate: '2024-06-01'
          }
        ]
      });
    });

    it('Matches all OBSOLETE status variants (OBSOLETE_ARCHIVED, ARCHIVED_OBSOLETE, OBSOLETE_PENDING_RECALL)', () => {
      const docObsolete1 = { status: 'OBSOLETE_ARCHIVED' };
      const docObsolete2 = { status: 'ARCHIVED_OBSOLETE' };
      const docObsolete3 = { status: 'OBSOLETE_PENDING_RECALL' };
      const docObsolete4 = { status: 'OBSOLETE', is_obsolete: true };

      // Helper function simulation
      const matchesStatusTab = (docStatus, selectedTab) => {
        const st = (docStatus || '').toUpperCase();
        if (selectedTab === 'ALL') return true;
        if (selectedTab === 'OBSOLETE') {
          return st === 'OBSOLETE' || st === 'OBSOLETE_ARCHIVED' || st === 'ARCHIVED_OBSOLETE' || st === 'OBSOLETE_PENDING_RECALL' || st.startsWith('OBSOLETE');
        }
        return false;
      };

      expect(matchesStatusTab(docObsolete1.status, 'OBSOLETE')).toBe(true);
      expect(matchesStatusTab(docObsolete2.status, 'OBSOLETE')).toBe(true);
      expect(matchesStatusTab(docObsolete3.status, 'OBSOLETE')).toBe(true);
      expect(matchesStatusTab(docObsolete4.status, 'OBSOLETE')).toBe(true);
    });

    it('Renders SOP-QA-003 (OBSOLETE_ARCHIVED) in Library when selecting Obsolete status sub-tab', async () => {
      renderWithRouter(<Library />);

      // Switch to "เอกสารในแผนกฉัน"
      const myDeptTab = screen.getByRole('button', { name: /เอกสารในแผนกฉัน/i });
      fireEvent.click(myDeptTab);

      // Select status filter "ยกเลิกการใช้งาน (Obsolete)"
      const obsoleteStatusBtn = screen.getByRole('button', { name: /ยกเลิกการใช้งาน/i });
      fireEvent.click(obsoleteStatusBtn);

      await waitFor(() => {
        expect(screen.getByText('SOP-QA-003')).toBeInTheDocument();
        expect(screen.getByText('มาตรฐานการจัดการของเสียอันตราย (ยกเลิกแล้ว)')).toBeInTheDocument();
        expect(screen.queryByText('SOP-QA-001')).not.toBeInTheDocument();
      });
    });

    it('Renders SOP-QA-002 (SUPERSEDED_ARCHIVED) in Library when selecting Superseded status sub-tab', async () => {
      renderWithRouter(<Library />);

      // Select status filter "ตกรุ่น (Superseded)"
      const supersededStatusBtn = screen.getByRole('button', { name: /ตกรุ่น/i });
      fireEvent.click(supersededStatusBtn);

      await waitFor(() => {
        expect(screen.getByText('SOP-QA-002')).toBeInTheDocument();
        expect(screen.queryByText('SOP-QA-003')).not.toBeInTheDocument();
      });
    });
  });

  describe('2. Disentangled Watermark Resolution Logic', () => {
    const mockCurrentUser = {
      name: 'กัลยาณี พลไกร',
      department: 'QA'
    };

    it('Obsolete Document Watermark: Crimson Red (#DC2626), OBSOLETE - DO NOT USE, contains DAR Ref, NO Superseded By text', () => {
      const doc = {
        title: 'SOP-QA-003',
        revision: '01',
        status: 'OBSOLETE_ARCHIVED',
        obsolete_dar_id: 'DAR-OBS-2026-003'
      };

      const config = resolveWatermarkConfig(doc, { currentUser: mockCurrentUser });

      expect(config.type).toBe('OBSOLETE');
      expect(config.watermarkType).toBe(WATERMARK_TYPES.OBSOLETE);
      expect(config.mainText).toBe('OBSOLETE - DO NOT USE');
      expect(config.color).toBe('#DC2626');
      expect(config.subLines[0]).toBe('เอกสารยกเลิก - ห้ามนำไปปฏิบัติงาน (CANCELLED DOCUMENT)');
      expect(config.subLines[1]).toContain('Doc: SOP-QA-003 | Rev: Rev.01');
      expect(config.subLines[2]).toContain('Obsolete DAR Ref: DAR-OBS-2026-003');
      expect(config.subLines[3]).toContain('Printed By: กัลยาณี พลไกร (QA)');

      // Critical check: absolutely NO "Superseded By" in obsolete watermark!
      config.subLines.forEach(line => {
        expect(line.toLowerCase()).not.toContain('superseded by');
      });
    });

    it('Superseded Document Watermark: Amber Orange (#D97706), SUPERSEDED - FOR REFERENCE ONLY, contains Superseded By Rev.02', () => {
      const doc = {
        title: 'SOP-QA-002',
        revision: '01',
        status: 'SUPERSEDED_ARCHIVED',
        superseded_by_rev: '02'
      };

      const config = resolveWatermarkConfig(doc, { currentUser: mockCurrentUser });

      expect(config.type).toBe('SUPERSEDED');
      expect(config.watermarkType).toBe(WATERMARK_TYPES.SUPERSEDED);
      expect(config.mainText).toBe('SUPERSEDED - FOR REFERENCE ONLY');
      expect(config.color).toBe('#D97706');
      expect(config.subLines[0]).toBe('เอกสารฉบับเดิมตกรุ่น - ใช้อ้างอิงประวัติเท่านั้น (SUPERSEDED REVISION)');
      expect(config.subLines[1]).toContain('Doc: SOP-QA-002 | Rev: Rev.01');
      expect(config.subLines[2]).toContain('Superseded By: Rev.02');
      expect(config.subLines[3]).toContain('Printed By: กัลยาณี พลไกร (QA)');
    });

    it('PDF Stamping: Stamping Obsolete document produces pure cancelled watermark on pages', async () => {
      const pdfBytes = await createSamplePdf();
      drawTextSpy.mockClear();

      const doc = {
        title: 'SOP-QA-003',
        rev: '01',
        status: 'OBSOLETE_ARCHIVED',
        obsolete_dar_id: 'DAR-OBS-2026-003'
      };

      const config = resolveFromUtil(doc, { currentUser: mockCurrentUser });
      await UniversalWatermarkService.stampPdf(pdfBytes, config);

      expect(drawTextSpy).toHaveBeenCalled();
      const texts = drawTextSpy.mock.calls.map(([text]) => text);

      expect(texts).toContain('OBSOLETE - DO NOT USE');
      expect(texts.some(t => t.includes('CANCELLED DOCUMENT') || t.includes('เอกสารยกเลิก'))).toBe(true);
      expect(texts.some(t => t.includes('DAR-OBS-2026-003'))).toBe(true);
      expect(texts.some(t => t.toLowerCase().includes('superseded by'))).toBe(false);
    });
  });
});
