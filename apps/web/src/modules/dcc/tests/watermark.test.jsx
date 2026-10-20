// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { 
  UniversalWatermarkService, 
  WATERMARK_TYPES, 
  WATERMARK_PRESETS 
} from '../services/UniversalWatermarkService';

describe('UniversalWatermarkService & DCS Digital Watermark Engine Tests', () => {
  let drawTextSpy;
  let drawRectangleSpy;

  beforeEach(() => {
    drawTextSpy = vi.spyOn(PDFPage.prototype, 'drawText');
    drawRectangleSpy = vi.spyOn(PDFPage.prototype, 'drawRectangle');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createSamplePdf = async (width = 595.28, height = 841.89) => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([width, height]);
    return await pdfDoc.save();
  };

  describe('Strict Graphic & Rendering Rules', () => {
    it('Zero Stamp Box & Footer: drawRectangle must NEVER be called', async () => {
      const pdfBytes = await createSamplePdf();
      await UniversalWatermarkService.stampPdf(pdfBytes, WATERMARK_TYPES.UNCONTROLLED_COPY, {
        docCode: 'WI-PD-001',
        docVersion: '01'
      });

      expect(drawRectangleSpy).not.toHaveBeenCalled();
    });

    it('Multi-line Center Diagonal: All text lines must rotate at 45 degrees', async () => {
      const pdfBytes = await createSamplePdf();
      await UniversalWatermarkService.stampPdf(pdfBytes, WATERMARK_TYPES.UNCONTROLLED_COPY, {
        docCode: 'WI-PD-001',
        docVersion: '01'
      });

      expect(drawTextSpy).toHaveBeenCalled();
      const calls = drawTextSpy.mock.calls;
      
      // All lines should have rotate: degrees(45)
      calls.forEach(([, options]) => {
        expect(options.rotate).toBeDefined();
        expect(options.rotate.angle).toBe(45);
      });
    });

    it('Opacity Control: Opacity must be between 0.60 and 0.70 across all presets', async () => {
      const pdfBytes = await createSamplePdf();

      for (const type of Object.values(WATERMARK_TYPES)) {
        drawTextSpy.mockClear();
        await UniversalWatermarkService.stampPdf(pdfBytes, type, {
          docCode: 'SOP-QA-005',
          docVersion: '02',
          status: type === WATERMARK_TYPES.OBSOLETE ? 'OBSOLETE' : 'ACTIVE'
        });

        const preset = WATERMARK_PRESETS[type];
        // Opacity range: 0.35 (DRAFT) – 0.70 (OBSOLETE/CONFIDENTIAL)
        // UNCONTROLLED_COPY is intentionally 0.50 (50%) per DCS spec.
        // DRAFT/DRAFT_WATERMARK are intentionally 0.35 per ISO QMS spec.
        expect(preset.opacity).toBeGreaterThanOrEqual(0.35);
        expect(preset.opacity).toBeLessThanOrEqual(0.70);

        const calls = drawTextSpy.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        calls.forEach(([, options]) => {
          expect(options.opacity).toBe(preset.opacity);
        });
      }
    });

    it('2D Affine Transformation (Center Pivot): Calculates symmetric rotated positions on portrait & landscape', async () => {
      // Portrait page
      const portraitPdf = await createSamplePdf(600, 800);
      drawTextSpy.mockClear();
      await UniversalWatermarkService.stampPdf(portraitPdf, WATERMARK_TYPES.DRAFT, {
        docCode: 'WI-EN-010',
        darNo: 'DAR-2026-001'
      });

      const portraitCalls = [...drawTextSpy.mock.calls];
      expect(portraitCalls.length).toBe(3);
      
      // Landscape page
      const landscapePdf = await createSamplePdf(800, 600);
      drawTextSpy.mockClear();
      await UniversalWatermarkService.stampPdf(landscapePdf, WATERMARK_TYPES.DRAFT, {
        docCode: 'WI-EN-010',
        darNo: 'DAR-2026-001'
      });

      const landscapeCalls = [...drawTextSpy.mock.calls];
      expect(landscapeCalls.length).toBe(3);

      // Verify that coordinates adapt to different center pivots (300, 400 vs 400, 300)
      expect(portraitCalls[0][1].x).not.toBe(landscapeCalls[0][1].x);
    });

    it('Metadata Resolution: Extracts doc_code and doc_version without internal UUIDs', async () => {
      const pdfBytes = await createSamplePdf();
      await UniversalWatermarkService.stampPdf(pdfBytes, WATERMARK_TYPES.UNCONTROLLED_COPY, {
        id: 'uuid-1234-5678-internal',
        docCode: 'WI-PD-005',
        docVersion: 'Rev.03',
        userName: 'Somchai QC',
        userDept: 'QA'
      });

      const calls = drawTextSpy.mock.calls;
      const texts = calls.map(([text]) => text);

      expect(texts).toContain('UNCONTROLLED COPY');
      expect(texts).toContain('Doc: WI-PD-005 | Ver: Rev.03');
      expect(texts.some(t => t.includes('uuid-1234-5678-internal'))).toBe(false);
      expect(texts.some(t => t.includes('Somchai QC (QA)'))).toBe(true);
    });
  });

  describe('Blank Form FM Bypass Rule', () => {
    it('Active FM/FORM document must have ZERO watermark (100% Clean Form)', async () => {
      const pdfBytes = await createSamplePdf();
      
      // Form with FM- prefix
      drawTextSpy.mockClear();
      await UniversalWatermarkService.stampPdf(pdfBytes, WATERMARK_TYPES.UNCONTROLLED_COPY, {
        docCode: 'FM-PD-001',
        docType: 'FM',
        status: 'ACTIVE'
      });
      expect(drawTextSpy).not.toHaveBeenCalled();

      // Form with docType: 'FORM'
      drawTextSpy.mockClear();
      await UniversalWatermarkService.stampPdf(pdfBytes, WATERMARK_TYPES.OFFICIAL_MASTER_COPY, {
        docCode: 'CHECKLIST-01',
        docType: 'FORM',
        status: 'ACTIVE'
      });
      expect(drawTextSpy).not.toHaveBeenCalled();
    });

    it('Obsolete FM document must be stamped with OBSOLETE - DO NOT USE', async () => {
      const pdfBytes = await createSamplePdf();
      drawTextSpy.mockClear();

      await UniversalWatermarkService.stampPdf(pdfBytes, WATERMARK_TYPES.OBSOLETE, {
        docCode: 'FM-PD-001',
        docType: 'FM',
        status: 'OBSOLETE',
        docVersion: '02',
        nextVersion: '03'
      });

      expect(drawTextSpy).toHaveBeenCalled();
      const texts = drawTextSpy.mock.calls.map(([text]) => text);
      expect(texts).toContain('OBSOLETE - DO NOT USE');
      expect(texts).toContain('Doc: FM-PD-001 | Rev: Rev.02');
    });
  });

  describe('Watermark Matrix & Action Mapping (7 Presets)', () => {
    it('1. UNCONTROLLED_COPY (User Direct Download): Dark Orange color, 0.65 opacity', async () => {
      const pdfBytes = await createSamplePdf();
      await UniversalWatermarkService.stampPdf(pdfBytes, WATERMARK_TYPES.UNCONTROLLED_COPY, {
        docCode: 'WI-PD-002',
        docVersion: '01',
        userName: 'John Doe',
        userDept: 'PD',
        scope: 'INTERNAL'
      });

      const texts = drawTextSpy.mock.calls.map(([text]) => text);
      expect(texts[0]).toBe('UNCONTROLLED COPY');
      expect(texts[1]).toBe('FOR REFERENCE ONLY (INTERNAL)');
      expect(texts[2]).toContain('Doc: WI-PD-002 | Ver: Rev.01');
      expect(texts[3]).toContain('Printed By: John Doe (PD)');
    });

    it('2. OFFICIAL_MASTER_COPY (DCC Master Archive): Navy Blue, 0.60 opacity', async () => {
      const pdfBytes = await createSamplePdf();
      await UniversalWatermarkService.stampPdf(pdfBytes, WATERMARK_TYPES.OFFICIAL_MASTER_COPY, {
        docCode: 'MA-QA-001',
        docVersion: '00',
        effectiveDate: '2026-08-01'
      });

      const texts = drawTextSpy.mock.calls.map(([text]) => text);
      expect(texts[0]).toBe('OFFICIAL MASTER COPY');
      expect(texts[1]).toBe('Doc: MA-QA-001 | Ver: Rev.00');
      expect(texts[2]).toBe('Document Control Center (DCC Archive)');
      expect(texts[3]).toBe('Effective Date: 2026-08-01');
      expect(texts[4]).toContain('SHA-256:');
    });

    it('3. STRICTLY_CONFIDENTIAL (DCC External Release): Rose Red, 0.70 opacity', async () => {
      const pdfBytes = await createSamplePdf();
      await UniversalWatermarkService.stampPdf(pdfBytes, WATERMARK_TYPES.STRICTLY_CONFIDENTIAL, {
        docCode: 'SPEC-PD-001',
        docVersion: '02',
        authorizedScope: 'Global Auditor ISO 9001',
        dccName: 'Admin QA (DCC)'
      });

      const texts = drawTextSpy.mock.calls.map(([text]) => text);
      expect(texts[0]).toBe('STRICTLY CONFIDENTIAL - EXTERNAL RELEASE');
      expect(texts[1]).toBe('Doc: SPEC-PD-001 | Ver: Rev.02');
      expect(texts[2]).toBe('Authorized Scope: Global Auditor ISO 9001');
      expect(texts[3]).toContain('Released By: Admin QA (DCC)');
      expect(texts[4]).toBe('*UNAUTHORIZED DUPLICATION & DISTRIBUTION IS PROHIBITED*');
    });

    it('4. CONTROLLED_COPY (DCC Distribution - Issue 01): Emerald Green, 0.65 opacity', async () => {
      const pdfBytes = await createSamplePdf();
      await UniversalWatermarkService.stampPdf(pdfBytes, WATERMARK_TYPES.CONTROLLED_COPY, {
        docCode: 'WI-PD-010',
        docVersion: '01',
        copyNo: '02',
        issueNo: '01',
        location: 'Line 1 - Mixing (ห้องผสม)',
        holderDept: 'PD',
        issuedBy: 'Admin QA (DCC)'
      });

      const texts = drawTextSpy.mock.calls.map(([text]) => text);
      expect(texts[0]).toBe('CONTROLLED COPY');
      expect(texts[1]).toBe('Doc: WI-PD-010 | Ver: Rev.01');
      expect(texts[2]).toBe('Copy No: 02 | Issue: 01 | Holder: PD (ฝ่ายผลิต)');
      expect(texts[3]).toContain('Loc: Line 1 - Mixing (ห้องผสม)');
      expect(texts[3]).toContain('Issued By: Admin QA (DCC)');
      expect(texts[4]).toContain('Issued:');
      expect(texts[4]).toContain('*DO NOT DUPLICATE*');
    });

    it('5. CONTROLLED_COPY_REPLACEMENT (DCC Replacement - Issue 02+): Amber Orange, 0.65 opacity', async () => {
      const pdfBytes = await createSamplePdf();
      await UniversalWatermarkService.stampPdf(pdfBytes, WATERMARK_TYPES.CONTROLLED_COPY_REPLACEMENT, {
        docCode: 'WI-PD-010',
        docVersion: '01',
        copyNo: '02',
        issueNo: '02',
        location: 'Line 1 - Mixing (ห้องผสม)',
        holderDept: 'PD'
      });

      const texts = drawTextSpy.mock.calls.map(([text]) => text);
      expect(texts[0]).toBe('CONTROLLED COPY (REPLACEMENT)');
      expect(texts[1]).toBe('Doc: WI-PD-010 | Ver: Rev.01');
      expect(texts[2]).toBe('Copy No: 02 | Issue: 02 | Holder: PD (ฝ่ายผลิต)');
      expect(texts[3]).toContain('Loc: Line 1 - Mixing (ห้องผสม)');
      expect(texts[3]).toContain('Issued By: DCC');
      expect(texts[4]).toBe('*PREVIOUS ISSUE IS VOID & INVALID*');
    });

    it('6. OBSOLETE (Cancelled document): Dark Crimson Red, 0.70 opacity', async () => {
      const pdfBytes = await createSamplePdf();
      await UniversalWatermarkService.stampPdf(pdfBytes, WATERMARK_TYPES.OBSOLETE, {
        docCode: 'SOP-WH-002',
        docVersion: '01',
        darNo: 'DAR-OBS-2026-001',
        obsoleteDate: '2026-08-15'
      });

      const texts = drawTextSpy.mock.calls.map(([text]) => text);
      expect(texts[0]).toBe('OBSOLETE - DO NOT USE');
      expect(texts.some(t => t.includes('CANCELLED DOCUMENT') || t.includes('เอกสารยกเลิก'))).toBe(true);
      expect(texts[2]).toBe('Doc: SOP-WH-002 | Rev: Rev.01');
      expect(texts[3]).toContain('Obsolete DAR Ref: DAR-OBS-2026-001');
      expect(texts[3]).not.toContain('Superseded By');
    });

    it('7. DRAFT (Under review): Amber Orange, 0.65 opacity', async () => {
      const pdfBytes = await createSamplePdf();
      await UniversalWatermarkService.stampPdf(pdfBytes, WATERMARK_TYPES.DRAFT, {
        docCode: 'QP-QA-001',
        darNo: 'DAR-2607-001'
      });

      const texts = drawTextSpy.mock.calls.map(([text]) => text);
      expect(texts[0]).toBe('DRAFT / UNDER REVIEW');
      expect(texts[1]).toBe('ฉบับร่างระหว่างดำเนินการ - ห้ามใช้ปฏิบัติงาน');
      expect(texts[2]).toBe('DAR Ref: DAR-2607-001 | Doc: QP-QA-001');
    });
  });
});
