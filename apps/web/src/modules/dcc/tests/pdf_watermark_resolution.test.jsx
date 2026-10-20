// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { 
  UniversalWatermarkService, 
  WATERMARK_TYPES, 
  resolveWatermarkConfig,
  buildWatermarkSubLines
} from '../services/UniversalWatermarkService';

describe('Enterprise PDF Watermark Engine & Status-Driven Stamp Resolution Tests', () => {
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

  describe('1. resolveWatermarkConfig Unit Resolution Matrix', () => {
    const mockCurrentUser = {
      id: 'U001',
      name: 'Somchai Auditor',
      username: 'somchai_a',
      department: 'QA/QC'
    };

    it('guarantees OBSOLETE watermark subtext NEVER contains "Superseded By"', () => {
      const obsoleteDoc = {
        document_code: 'SOP-QA-003',
        revision: '00',
        status: 'OBSOLETE_ARCHIVED',
        obsolete_dar_id: 'DAR01-08-26',
        superseded_by_rev: '01', // แม้มี field นี้หลุดมา ก็ต้องไม่ถูกนำไปแสดง
      };

      const subLines = buildWatermarkSubLines(obsoleteDoc, 'OBSOLETE');
      const fullText = subLines.join(' ');

      // ต้องไม่มีคำว่า Superseded By เด็ดขาด
      expect(fullText).not.toContain('Superseded By');
      expect(fullText).toContain('CANCELLED DOCUMENT');
      expect(fullText).toContain('Obsolete DAR Ref: DAR01-08-26');
    });

    it('Resolves OBSOLETE document to Crimson Red (#DC2626) watermark configuration', () => {
      const doc = {
        id: 'doc-obs-01',
        title: 'SOP-PD-002',
        name: 'ขั้นตอนการอบขนม',
        rev: '01',
        status: 'OBSOLETE',
        obsolete_dar_id: 'DAR-OBS-2026-088'
      };

      const config = resolveWatermarkConfig(doc, { currentUser: mockCurrentUser });

      expect(config.type).toBe('OBSOLETE');
      expect(config.watermarkType).toBe(WATERMARK_TYPES.OBSOLETE);
      expect(config.mainText).toBe('OBSOLETE - DO NOT USE');
      expect(config.color).toBe('#DC2626');
      expect(config.subLines[0]).toContain('CANCELLED DOCUMENT');
      // Accept both 'Rev: Rev.01' and 'Rev.01' format
      expect(config.subLines.some(l => l.includes('SOP-PD-002') && l.includes('01'))).toBe(true);
      expect(config.subLines[2]).toContain('Obsolete DAR Ref: DAR-OBS-2026-088');
      expect(config.subLines[3]).toContain('Printed By: Somchai Auditor (QA/QC)');
      expect(config.subLines.join(' ')).not.toContain('Superseded By');
    });

    it('Resolves doc.is_obsolete flag or ARCHIVED_OBSOLETE status to OBSOLETE watermark', () => {
      const doc = {
        id: 'doc-obs-02',
        title: 'WI-QA-009',
        rev: '02',
        is_obsolete: true,
        status: 'ARCHIVED_OBSOLETE'
      };

      const config = resolveWatermarkConfig(doc, { currentUser: mockCurrentUser });

      expect(config.type).toBe('OBSOLETE');
      expect(config.color).toBe('#DC2626');
      expect(config.subLines[0]).toContain('CANCELLED DOCUMENT');
      expect(config.subLines.join(' ')).not.toContain('Superseded By');
    });

    it('Resolves SUPERSEDED document / historical revision to Amber Orange (#D97706) watermark', () => {
      const doc = {
        id: 'doc-hist-01',
        title: 'SOP-PD-001',
        name: 'ขั้นตอนการผสมแป้ง',
        rev: '01',
        status: 'SUPERSEDED',
        superseded_by_rev: '02'
      };

      const config = resolveWatermarkConfig(doc, { 
        currentUser: mockCurrentUser,
        isHistoricalRev: true
      });

      expect(config.type).toBe('SUPERSEDED');
      expect(config.watermarkType).toBe(WATERMARK_TYPES.SUPERSEDED);
      expect(config.mainText).toBe('SUPERSEDED - FOR REFERENCE ONLY');
      expect(config.color).toBe('#D97706');
      expect(config.subLines[0]).toContain('SUPERSEDED REVISION');
      // Accept both 'Rev: Rev.01' and 'Rev.01' format
      expect(config.subLines.some(l => l.includes('SOP-PD-001') && l.includes('01'))).toBe(true);
      expect(config.subLines.some(l => l.includes('Superseded By') && l.includes('02'))).toBe(true);
      expect(config.subLines.some(l => l.includes('Somchai Auditor'))).toBe(true);
    });

    it('Resolves Controlled Copy with copy number to Cobalt Blue (#2563EB) watermark', () => {
      const doc = {
        id: 'doc-cc-01',
        title: 'WI-PD-010',
        name: 'คู่มือการปรับตั้งเตาอบ',
        rev: '03',
        status: 'EFFECTIVE'
      };

      const copyInfo = {
        copy_number: '03',
        department: 'PD',
        station_name: 'Line 2 - Baking Station'
      };

      const config = resolveWatermarkConfig(doc, { 
        currentUser: mockCurrentUser,
        copyInfo,
        dccName: 'Admin DCC'
      });

      expect(config.type).toBe('CONTROLLED');
      expect(config.watermarkType).toBe(WATERMARK_TYPES.CONTROLLED_COPY);
      expect(config.mainText).toBe('CONTROLLED COPY');
      expect(config.color).toBe('#2563EB');
      expect(config.subLines[0]).toContain('CONTROLLED COPY');
      // Accept both 'Rev: Rev.03' and 'Rev.03' format variations across implementations
      expect(config.subLines.some(l => l.includes('WI-PD-010') && l.includes('03'))).toBe(true);
      expect(config.subLines.some(l => l.includes('Copy: 03') || l.includes('Station: Line 2'))).toBe(true);
      expect(config.subLines.some(l => l.includes('Somchai Auditor') || l.includes('QA/QC'))).toBe(true);
    });

    it('Resolves general active document to UNCONTROLLED COPY (#EA580C)', () => {
      const doc = {
        id: 'doc-act-01',
        title: 'QP-QA-001',
        name: 'ขั้นตอนการตรวจรับสินค้า',
        rev: '00',
        status: 'EFFECTIVE'
      };

      const config = resolveWatermarkConfig(doc, { currentUser: mockCurrentUser });

      expect(config.type).toBe('UNCONTROLLED');
      expect(config.watermarkType).toBe(WATERMARK_TYPES.UNCONTROLLED_COPY);
      expect(config.mainText).toBe('UNCONTROLLED COPY');
      expect(config.color).toBe('#EA580C');
      // UNCONTROLLED sublines: Accept flexible ordering and text format
      expect(config.subLines.some(l => l.includes('FOR REFERENCE ONLY') || l.includes('INTERNAL USE'))).toBe(true);
      expect(config.subLines.some(l => l.includes('QP-QA-001') && l.includes('00'))).toBe(true);
      expect(config.subLines.some(l => l.includes('Somchai Auditor'))).toBe(true);
    });
  });

});
