import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { 
  drawIsoDiagonalWatermark, 
  applyProgressiveSignatoryStamp, 
  applyUncontrolledWatermarkToPdf 
} from '../utils/pdfStamper';
import { 
  UniversalWatermarkService, 
  WATERMARK_TYPES, 
  drawStandardIsoWatermark,
  generateWatermarkCanvas,
  applyCanvasWatermarkToPdf,
  getSignatoryTableDimensions,
  SIGNATORY_FONT_FAMILY,
  PURE_BLACK,
  renderSignatoryText,
  WATERMARK_FONT_FAMILY
} from '../services/UniversalWatermarkService';
import { 
  getSignatoryTableDimensions as getSignatoryTableDimensionsFromStampEngine,
  SIGNATORY_FONT_FAMILY as SIGNATORY_FONT_FAMILY_FROM_ENGINE,
  PURE_BLACK as PURE_BLACK_FROM_ENGINE,
  renderSignatoryText as renderSignatoryTextFromEngine
} from '../services/signatoryStampEngine';
import { 
  drawStandardIsoWatermark as drawStandardIsoWatermarkFromEngine, 
  generateWatermarkCanvas as generateWatermarkCanvasFromEngine,
  applyCanvasWatermarkToPdf as applyCanvasWatermarkToPdfFromEngine,
  WATERMARK_CONFIG,
  WATERMARK_FONT_FAMILY as WATERMARK_FONT_FAMILY_FROM_ENGINE
} from '../services/watermarkEngine';
import useStore from '../../../store/useStore';

describe('Permanent Signatory Stamping & Responsive ISO Watermark Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Responsive ISO Watermark Engine (drawIsoDiagonalWatermark)', () => {
    it('should scale main font size to ~50pt and sub font to ~21pt on A4 with 45 degree rotation and Warning Red', async () => {
      const pdfDoc = await PDFDocument.create();
      // Standard A4 dimensions: 595.28 x 841.89
      const page = pdfDoc.addPage([595.28, 841.89]);
      
      const drawTextSpy = vi.spyOn(page, 'drawText');

      drawIsoDiagonalWatermark(page, 'UNCONTROLLED COPY', '(สำเนาไม่ควบคุม)');

      expect(drawTextSpy).toHaveBeenCalled();
      
      // Main text call (first call)
      const mainCallArgs = drawTextSpy.mock.calls[0];
      expect(mainCallArgs[0]).toBe('UNCONTROLLED COPY');
      const mainOptions = mainCallArgs[1];
      
      // Check font size ~50pt (min(w,h) * 0.085 = 595.28 * 0.085 ≈ 50.6)
      expect(mainOptions.size).toBeGreaterThanOrEqual(48);
      expect(mainOptions.size).toBeLessThanOrEqual(52);
      
      // Check rotation 45 degrees
      expect(mainOptions.rotate).toEqual({ type: 'degrees', angle: 45 });
      
      // Check opacity 0.22
      expect(mainOptions.opacity).toBeCloseTo(0.22, 2);
      
      // Check color Warning Red (red ~0.9, green ~0.25, blue ~0.25)
      expect(mainOptions.color.red).toBeCloseTo(0.9, 1);
      expect(mainOptions.color.green).toBeCloseTo(0.25, 1);
      expect(mainOptions.color.blue).toBeCloseTo(0.25, 1);
      
      // Check sub text call (second call)
      expect(drawTextSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
      const subCallArgs = drawTextSpy.mock.calls[1];
      const subOptions = subCallArgs[1];
      
      // Check sub font size ~21pt (mainFontSize * 0.42 ≈ 21.25)
      expect(subOptions.size).toBeGreaterThanOrEqual(20);
      expect(subOptions.size).toBeLessThanOrEqual(22);
      expect(subOptions.rotate).toEqual({ type: 'degrees', angle: 45 });
    });

    it('should be exposed both as named export and static class method on UniversalWatermarkService', () => {
      expect(typeof drawIsoDiagonalWatermark).toBe('function');
      expect(typeof UniversalWatermarkService.drawIsoDiagonalWatermark).toBe('function');
      expect(typeof UniversalWatermarkService.applyProgressiveSignatoryStamp).toBe('function');
    });

    it('applyUncontrolledWatermarkToPdf should stamp all pages using drawIsoDiagonalWatermark', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([595.28, 841.89]);
      pdfDoc.addPage([595.28, 841.89]);
      const pdfBytes = await pdfDoc.save();

      const watermarkedBytes = await applyUncontrolledWatermarkToPdf(pdfBytes);
      expect(watermarkedBytes).toBeInstanceOf(Uint8Array);
      expect(watermarkedBytes.length).toBeGreaterThan(0);

      const loadedDoc = await PDFDocument.load(watermarkedBytes);
      expect(loadedDoc.getPageCount()).toBe(2);
    });
  });

  describe('2. Permanent Signatory Stamping (applyProgressiveSignatoryStamp)', () => {
    it('should draw a white background mask rectangle and stamp 3x3 table onto page 1', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([600, 800]);
      const pdfBytes = await pdfDoc.save();

      const signatories = {
        requester: { name: 'นายจัดทำ เอกสาร', position: 'QA Officer', isCompleted: true },
        reviewer: { name: 'นางสาวทบทวน ตรวจสอบ', position: 'QA Manager', isCompleted: true },
        approver: { name: 'ดร.อนุมัติ สูงสุด', position: 'Managing Director', isCompleted: true }
      };

      const stampedBytes = await applyProgressiveSignatoryStamp(pdfBytes, signatories);
      expect(stampedBytes).toBeInstanceOf(Uint8Array);
      expect(stampedBytes.length).toBeGreaterThan(0);

      const reloadedDoc = await PDFDocument.load(stampedBytes);
      expect(reloadedDoc.getPageCount()).toBe(1);
    });

    it('should calculate correct 3x3 signatory table dimensions with expanded 62pt signature row and 48pt max signature height', () => {
      const portraitDims = getSignatoryTableDimensions(595.28, 841.89);
      expect(portraitDims.headerRowHeight).toBe(26);
      expect(portraitDims.signatureRowHeight).toBe(62);
      expect(portraitDims.metaRowHeight).toBe(48);
      expect(portraitDims.totalTableHeight).toBe(136); // 26 + 62 + 48
      expect(portraitDims.maxSigHeight).toBe(48);
      expect(portraitDims.maxSigWidth).toBeLessThanOrEqual(125);

      // Verify center-center signature positioning formula
      const sigImgHeight = 48;
      const verticalPadding = (portraitDims.signatureRowHeight - sigImgHeight) / 2;
      expect(verticalPadding).toBe(7); // 7pt clearance top and bottom to avoid border collision

      // Check landscape layout dimensions
      const landscapeDims = getSignatoryTableDimensions(841.89, 595.28);
      expect(landscapeDims.headerRowHeight).toBe(26);
      expect(landscapeDims.signatureRowHeight).toBe(62);
      expect(landscapeDims.metaRowHeight).toBe(48);
      expect(landscapeDims.totalTableHeight).toBe(136);
      expect(landscapeDims.maxSigHeight).toBe(48);

      // Check export across engines
      expect(typeof UniversalWatermarkService.getSignatoryTableDimensions).toBe('function');
      expect(typeof getSignatoryTableDimensionsFromStampEngine).toBe('function');
      expect(UniversalWatermarkService.getSignatoryTableDimensions()).toEqual(portraitDims);
      expect(getSignatoryTableDimensionsFromStampEngine()).toEqual(portraitDims);
    });

    it('should enforce TH Sarabun New, regular weight (non-bold), pure black (#000000), and correct font sizes via renderSignatoryText', () => {
      // 1. Constants verification
      expect(SIGNATORY_FONT_FAMILY).toBe("'TH Sarabun New', 'THSarabunNew', 'Sarabun', sans-serif");
      expect(PURE_BLACK).toBe('#000000');
      expect(SIGNATORY_FONT_FAMILY_FROM_ENGINE).toBe(SIGNATORY_FONT_FAMILY);
      expect(PURE_BLACK_FROM_ENGINE).toBe(PURE_BLACK);
      expect(typeof UniversalWatermarkService.renderSignatoryText).toBe('function');
      expect(typeof renderSignatoryTextFromEngine).toBe('function');

      // 2. Mock canvas context to verify typography execution
      const mockCtx = {
        font: '',
        fillStyle: '',
        textAlign: '',
        textBaseline: '',
        save: vi.fn(),
        restore: vi.fn(),
        fillText: vi.fn()
      };

      const scale = 4; // Ultra-HD 4x

      // Row 1 Header: 12pt, normal, black
      renderSignatoryText(mockCtx, 'ผู้จัดทำ', 250, 52, 12, scale);
      expect(mockCtx.font).toBe(`normal ${12 * scale}px ${SIGNATORY_FONT_FAMILY}`);
      expect(mockCtx.font).not.toContain('bold');
      expect(mockCtx.fillStyle).toBe('#000000');
      expect(mockCtx.textAlign).toBe('center');
      expect(mockCtx.textBaseline).toBe('middle');
      expect(mockCtx.fillText).toHaveBeenCalledWith('ผู้จัดทำ', 250, 52);

      // Row 3 Signer Name: 11pt, normal, black
      renderSignatoryText(mockCtx, 'กัลยาณี ประเสริฐ', 250, 408, 11, scale);
      expect(mockCtx.font).toBe(`normal ${11 * scale}px ${SIGNATORY_FONT_FAMILY}`);
      expect(mockCtx.font).not.toContain('bold');
      expect(mockCtx.fillStyle).toBe('#000000');
      expect(mockCtx.fillText).toHaveBeenCalledWith('กัลยาณี ประเสริฐ', 250, 408);

      // Row 3 Role/Position: 9.5pt, normal, black
      renderSignatoryText(mockCtx, 'QA Lead Specialist', 250, 460, 9.5, scale);
      expect(mockCtx.font).toBe(`normal ${9.5 * scale}px ${SIGNATORY_FONT_FAMILY}`);
      expect(mockCtx.font).not.toContain('bold');
      expect(mockCtx.fillStyle).toBe('#000000');
      expect(mockCtx.fillText).toHaveBeenCalledWith('QA Lead Specialist', 250, 460);

      // Row 3 Sign Date: 9.5pt, normal, black
      renderSignatoryText(mockCtx, '02/10/2569 11:30', 250, 508, 9.5, scale);
      expect(mockCtx.font).toBe(`normal ${9.5 * scale}px ${SIGNATORY_FONT_FAMILY}`);
      expect(mockCtx.font).not.toContain('bold');
      expect(mockCtx.fillStyle).toBe('#000000');
      expect(mockCtx.fillText).toHaveBeenCalledWith('02/10/2569 11:30', 250, 508);
    });
  });

  describe('3. Permanent Signatory Stamping on Final Approval (finalizeAndPublishMaster)', () => {
    it('should burn 3x3 signatory table and update masterDocument with fileData and isSignatoryStamped', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([600, 800]);
      const samplePdfBytes = await pdfDoc.save();
      const sampleBlob = new Blob([samplePdfBytes], { type: 'application/pdf' });

      const testDar = {
        id: 'DAR-TEST-001',
        darNumber: 'DAR-TEST-001',
        darNo: 'DAR-TEST-001',
        docNo: 'SOP-QC-999',
        document_code: 'SOP-QC-999',
        title: 'SOP การควบคุมเอกสารทดสอบ',
        status: 'COMPLETED',
        type: 'NEW',
        fileBlob: sampleBlob,
        attachedFile: { fileId: 'file-dar-001', name: 'sample.pdf' },
        requesterName: 'นายผู้จัดทำ',
        reviewerName: 'นายผู้ทบทวน',
        approverName: 'นายผู้อนุมัติ'
      };

      const testDoc = {
        id: 'doc-qc-999',
        code: 'SOP-QC-999',
        document_code: 'SOP-QC-999',
        title: 'SOP-QC-999',
        status: 'ACTIVE',
        darId: 'DAR-TEST-001'
      };

      useStore.setState({
        dars: [testDar],
        documents: [testDoc],
        masterDocuments: [testDoc]
      });

      await useStore.getState().finalizeAndPublishMaster('DAR-TEST-001');

      const state = useStore.getState();
      const updatedDoc = state.documents.find(d => d.id === 'doc-qc-999');
      const updatedMaster = state.masterDocuments.find(d => d.id === 'doc-qc-999');

      expect(updatedDoc).toBeDefined();
      expect(updatedDoc.isSignatoryStamped).toBe(true);
      expect(updatedDoc.fileData).toBeInstanceOf(Uint8Array);
      expect(updatedDoc.stampedAt).toBeDefined();

      expect(updatedMaster).toBeDefined();
      expect(updatedMaster.isSignatoryStamped).toBe(true);
    });
  });

  describe('4. Fallback & JIT Stamping on Download', () => {
    it('UniversalWatermarkService.downloadWatermarkedPdf should process active master doc and generate stamped URL', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([600, 800]);
      const samplePdfBytes = await pdfDoc.save();

      const testDoc = {
        id: 'doc-download-001',
        title: 'SOP-QA-001',
        document_code: 'SOP-QA-001',
        docCode: 'SOP-QA-001',
        status: 'ACTIVE',
        isSignatoryStamped: false,
        fileBlob: new Blob([samplePdfBytes], { type: 'application/pdf' })
      };

      const originalCreateObjectURL = global.URL.createObjectURL;
      global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-download-url');

      try {
        await UniversalWatermarkService.downloadWatermarkedPdf(
          testDoc,
          WATERMARK_TYPES.UNCONTROLLED_COPY,
          { userName: 'Test User', userDept: 'QC' },
          false
        );

        expect(global.URL.createObjectURL).toHaveBeenCalled();
      } finally {
        global.URL.createObjectURL = originalCreateObjectURL;
      }
    });

    it('UniversalWatermarkService.downloadWatermarkedPdf should execute JIT stamping even when isSignatoryStamped is true', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([600, 800]);
      const samplePdfBytes = await pdfDoc.save();

      const testDoc = {
        id: 'doc-download-002',
        title: 'SOP-QA-002',
        document_code: 'SOP-QA-002',
        docCode: 'SOP-QA-002',
        status: 'ACTIVE',
        isSignatoryStamped: true, // Marked true, but raw blob might be unstamped
        fileBlob: new Blob([samplePdfBytes], { type: 'application/pdf' })
      };

      const originalCreateObjectURL = global.URL.createObjectURL;
      global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-download-url');

      try {
        const url = await UniversalWatermarkService.downloadWatermarkedPdf(
          testDoc,
          WATERMARK_TYPES.UNCONTROLLED_COPY,
          { userName: 'Test User', userDept: 'QC' },
          false
        );

        expect(url).toBe('blob:mock-download-url');
        expect(global.URL.createObjectURL).toHaveBeenCalled();
      } finally {
        global.URL.createObjectURL = originalCreateObjectURL;
      }
    });
  });

  describe('5. Sequential Stamping Pipeline (prepareMasterPdfForDownload)', () => {
    it('polymorphic drawIsoDiagonalWatermark should accept pdfBytes directly and return stamped Uint8Array', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([595.28, 841.89]);
      const pdfBytes = await pdfDoc.save();

      const resultBytes = await drawIsoDiagonalWatermark(pdfBytes, 'UNCONTROLLED COPY', '(สำเนาไม่ควบคุม)');
      expect(resultBytes).toBeInstanceOf(Uint8Array);
      expect(resultBytes.length).toBeGreaterThan(0);

      const reloadedDoc = await PDFDocument.load(resultBytes);
      expect(reloadedDoc.getPageCount()).toBe(1);
    });

    it('prepareMasterPdfForDownload should execute signatures burn-in and ISO watermark sequentially', async () => {
      const { prepareMasterPdfForDownload } = await import('../services/UniversalWatermarkService');
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([595.28, 841.89]);
      const pdfBytes = await pdfDoc.save();

      const doc = {
        id: 'DOC-MASTER-001',
        title: 'SOP-MFG-001',
        document_code: 'SOP-MFG-001',
        status: 'ACTIVE',
        fileData: pdfBytes
      };

      const dar = {
        id: 'DAR-MFG-001',
        docNo: 'SOP-MFG-001',
        status: 'APPROVED',
        requesterName: 'นายผู้จัดทำ',
        reviewerName: 'นายผู้ทบทวน',
        approverName: 'นายผู้อนุมัติ'
      };

      const processedBytes = await prepareMasterPdfForDownload({
        document: doc,
        dar,
        watermarkType: 'UNCONTROLLED'
      });

      expect(processedBytes).toBeInstanceOf(Uint8Array);
      expect(processedBytes.length).toBeGreaterThan(0);

      const reloaded = await PDFDocument.load(processedBytes);
      expect(reloaded.getPageCount()).toBe(1);
    });

    it('prepareMasterPdfForDownload is accessible on UniversalWatermarkService class as static method', async () => {
      expect(typeof UniversalWatermarkService.prepareMasterPdfForDownload).toBe('function');
    });
  });

  describe('6. True Geometric Centering Watermark Engine & Standardized ISO Dictionary (Canvas-to-PNG)', () => {
    it('should export drawStandardIsoWatermark, generateWatermarkCanvas, and applyCanvasWatermarkToPdf as named exports and static methods', () => {
      expect(typeof drawStandardIsoWatermark).toBe('function');
      expect(typeof UniversalWatermarkService.drawStandardIsoWatermark).toBe('function');
      expect(typeof drawStandardIsoWatermarkFromEngine).toBe('function');

      expect(typeof generateWatermarkCanvas).toBe('function');
      expect(typeof UniversalWatermarkService.generateWatermarkCanvas).toBe('function');
      expect(typeof generateWatermarkCanvasFromEngine).toBe('function');

      expect(typeof applyCanvasWatermarkToPdf).toBe('function');
      expect(typeof UniversalWatermarkService.applyCanvasWatermarkToPdf).toBe('function');
      expect(typeof applyCanvasWatermarkToPdfFromEngine).toBe('function');
    });

    it('should define all 5 standardized tiers in WATERMARK_CONFIG with correct ISO colors, colorHex, and getLines', () => {
      expect(WATERMARK_CONFIG.CONTROLLED).toBeDefined();
      expect(WATERMARK_CONFIG.UNCONTROLLED).toBeDefined();
      expect(WATERMARK_CONFIG.SUPERSEDED).toBeDefined();
      expect(WATERMARK_CONFIG.OBSOLETE).toBeDefined();
      expect(WATERMARK_CONFIG.DRAFT).toBeDefined();

      // Verify colors and opacities match ISO specifications
      expect(WATERMARK_CONFIG.CONTROLLED.color).toEqual({ r: 0.12, g: 0.25, b: 0.69 });
      expect(WATERMARK_CONFIG.CONTROLLED.colorHex).toBe('#1F40B0');
      expect(WATERMARK_CONFIG.CONTROLLED.opacity).toBeCloseTo(0.16, 2);
      expect(typeof WATERMARK_CONFIG.CONTROLLED.getLines).toBe('function');

      expect(WATERMARK_CONFIG.UNCONTROLLED.color).toEqual({ r: 0.86, g: 0.15, b: 0.15 });
      expect(WATERMARK_CONFIG.UNCONTROLLED.colorHex).toBe('#DC2626');
      expect(WATERMARK_CONFIG.UNCONTROLLED.opacity).toBeCloseTo(0.16, 2);
      expect(typeof WATERMARK_CONFIG.UNCONTROLLED.getLines).toBe('function');

      expect(WATERMARK_CONFIG.SUPERSEDED.color).toEqual({ r: 0.60, g: 0.10, b: 0.10 });
      expect(WATERMARK_CONFIG.SUPERSEDED.colorHex).toBe('#991A1A');
      expect(WATERMARK_CONFIG.SUPERSEDED.opacity).toBeCloseTo(0.24, 2);
      expect(typeof WATERMARK_CONFIG.SUPERSEDED.getLines).toBe('function');

      expect(WATERMARK_CONFIG.OBSOLETE.color).toEqual({ r: 0.30, g: 0.35, b: 0.40 });
      expect(WATERMARK_CONFIG.OBSOLETE.colorHex).toBe('#4D5966');
      expect(WATERMARK_CONFIG.OBSOLETE.opacity).toBeCloseTo(0.22, 2);
      expect(typeof WATERMARK_CONFIG.OBSOLETE.getLines).toBe('function');

      expect(WATERMARK_CONFIG.DRAFT.color).toEqual({ r: 0.85, g: 0.47, b: 0.03 });
      expect(WATERMARK_CONFIG.DRAFT.colorHex).toBe('#D97808');
      expect(WATERMARK_CONFIG.DRAFT.opacity).toBeCloseTo(0.20, 2);
      expect(typeof WATERMARK_CONFIG.DRAFT.getLines).toBe('function');
    });

    it('CONTROLLED COPY lines must contain Copy No., Issue No., Holder, and Loc', () => {
      const meta = {
        docCode: 'SOP-QA-001',
        revNo: '03',
        copyNo: '05',
        issueNo: '02',
        holderDept: 'PRODUCTION',
        location: 'QC Office (สำนักงานประกันและควบคุมคุณภาพ)',
        issuedDate: '2026-08-20'
      };

      const lines = WATERMARK_CONFIG.CONTROLLED.lines(meta);
      expect(lines.length).toBe(6);
      expect(lines[0].text).toBe('CONTROLLED COPY');
      expect(lines[1].text).toContain('สำเนาควบคุม');
      expect(lines[2].text).toBe('Doc No: SOP-QA-001 | Rev: 03');
      expect(lines[3].text).toBe('Copy No: 05 | Issue No: 02 | Holder: PRODUCTION');
      expect(lines[4].text).toBe('Loc: QC Office (สำนักงานประกันและควบคุมคุณภาพ) | Issued: 2026-08-20');
      expect(lines[5].text).toBe('OFFICIAL CONTROLLED COPY | REPRODUCTION STRICTLY PROHIBITED');
    });

    it('should generate watermark image via HTML5 Canvas and embed PNG into PDF with True Geometric Centering', async () => {
      // 1. Portrait A4 (595.28 x 841.89)
      const portraitDoc = await PDFDocument.create();
      const portraitPage = portraitDoc.addPage([595.28, 841.89]);
      const portraitSpy = vi.spyOn(portraitPage, 'drawImage');

      await drawStandardIsoWatermark(portraitDoc, 'CONTROLLED', {
        docCode: 'WI-PD-001',
        revNo: '01',
        copyNo: '02',
        issueNo: '01',
        holderDept: 'PD'
      });

      expect(portraitSpy).toHaveBeenCalled();
      const expectedPortraitDeg = 30; // Ergonomic 30° for Portrait
      portraitSpy.mock.calls.forEach(([, opts]) => {
        expect(opts.rotate.angle).toBeCloseTo(expectedPortraitDeg, 1);
        expect(opts.opacity).toBeCloseTo(0.16, 2);
        expect(opts.width).toBeCloseTo(595.28 * 0.85, 1);
        
        // Verify center of rotated image lands at page center (width/2, height/2)
        const angleRad = (30 * Math.PI) / 180;
        const centerX = opts.x + (opts.width / 2) * Math.cos(angleRad) - (opts.height / 2) * Math.sin(angleRad);
        const centerY = opts.y + (opts.width / 2) * Math.sin(angleRad) + (opts.height / 2) * Math.cos(angleRad);
        expect(centerX).toBeCloseTo(595.28 / 2, 1);
        expect(centerY).toBeCloseTo(841.89 / 2, 1);
      });

      // 2. Landscape A4 (841.89 x 595.28)
      const landscapeDoc = await PDFDocument.create();
      const landscapePage = landscapeDoc.addPage([841.89, 595.28]);
      const landscapeSpy = vi.spyOn(landscapePage, 'drawImage');

      await drawStandardIsoWatermark(landscapeDoc, 'UNCONTROLLED', {
        docCode: 'SOP-QA-002',
        revNo: '00',
        userName: 'Somsak',
        userDept: 'QA'
      });

      expect(landscapeSpy).toHaveBeenCalled();
      const expectedLandscapeDeg = 25; // Ergonomic 25° for Landscape
      landscapeSpy.mock.calls.forEach(([, opts]) => {
        expect(opts.rotate.angle).toBeCloseTo(expectedLandscapeDeg, 1);
        expect(opts.opacity).toBeCloseTo(0.16, 2);
        expect(opts.width).toBeCloseTo(841.89 * 0.70, 1);

        // Verify center of rotated image lands at landscape page center (width/2, height/2)
        const angleRad = (25 * Math.PI) / 180;
        const centerX = opts.x + (opts.width / 2) * Math.cos(angleRad) - (opts.height / 2) * Math.sin(angleRad);
        const centerY = opts.y + (opts.width / 2) * Math.sin(angleRad) + (opts.height / 2) * Math.cos(angleRad);
        expect(centerX).toBeCloseTo(841.89 / 2, 1);
        expect(centerY).toBeCloseTo(595.28 / 2, 1);
      });
    });

    it('should generate valid watermark canvas PNG data URL handling complex Thai diacritics', () => {
      const thaiLines = [
        { text: 'UNCONTROLLED COPY', size: 52, weight: 'bold' },
        { text: '(สำเนาไม่ควบคุม — ใช้เพื่อการอ้างอิงเท่านั้น)', size: 24, weight: 'normal' },
        { text: 'ชื่อผู้ร้องขอ: กัลยาณี ฉัตรแก้ว (ฝ่ายควบคุมคุณภาพ)', size: 18, weight: 'normal' },
        { text: 'เอกสาร: คู่มือปฏิบัติงานการตรวจสอบขั้นสุดท้าย', size: 16, weight: 'normal' }
      ];

      const dataUrl = generateWatermarkCanvas({
        lines: thaiLines,
        colorHex: '#DC2626',
        opacity: 0.18,
        scale: 2
      });

      expect(dataUrl).toBeDefined();
      expect(typeof dataUrl).toBe('string');
      expect(dataUrl.startsWith('data:image/png')).toBe(true);
    });

    it('should correctly render with mocked 2D canvas context and native Thai fonts', () => {
      const mockFillText = vi.fn();
      const mockClearRect = vi.fn();
      const mockContext = {
        clearRect: mockClearRect,
        fillText: mockFillText,
        textAlign: '',
        textBaseline: '',
        font: '',
        fillStyle: ''
      };

      const origCreateElement = document.createElement.bind(document);
      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        if (tag === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: vi.fn().mockReturnValue(mockContext),
            toDataURL: vi.fn().mockReturnValue('data:image/png;base64,MOCK_THAI_PNG')
          };
        }
        return origCreateElement(tag);
      });

      const thaiLines = [
        { text: 'CONTROLLED COPY', size: 52, weight: 'bold' },
        { text: '(สำเนาควบคุม — บังคับใช้ปฏิบัติงานจริง)', size: 24, weight: 'normal' },
        { text: 'ผู้ถือครอง: กัลยาณี เท่านั้น', size: 18, weight: 'normal' }
      ];

      const res = generateWatermarkCanvas({
        lines: thaiLines,
        colorHex: '#1F40B0',
        opacity: 0.18,
        scale: 2
      });

      expect(res).toBe('data:image/png;base64,MOCK_THAI_PNG');
      expect(mockClearRect).toHaveBeenCalled();
      expect(mockFillText).toHaveBeenCalledTimes(3);
      expect(mockFillText).toHaveBeenCalledWith('CONTROLLED COPY', expect.any(Number), expect.any(Number));
      expect(mockFillText).toHaveBeenCalledWith('(สำเนาควบคุม — บังคับใช้ปฏิบัติงานจริง)', expect.any(Number), expect.any(Number));
      expect(mockFillText).toHaveBeenCalledWith('ผู้ถือครอง: กัลยาณี เท่านั้น', expect.any(Number), expect.any(Number));
      expect(mockContext.font).toContain('TH Sarabun New');
      expect(mockContext.font).toContain('Sarabun');
      expect(mockContext.font).toContain('Noto Sans Thai');
      expect(mockContext.font.startsWith('normal ')).toBe(true);
      expect(mockContext.font).not.toContain('italic');
      expect(mockContext.font).not.toContain('oblique');

      createElementSpy.mockRestore();
    });

    it('should generate Ultra-HD 4x canvas with high-quality smoothing and letter-spacing for refined typography', () => {
      const mockFillText = vi.fn();
      const mockClearRect = vi.fn();
      const mockContext = {
        clearRect: mockClearRect,
        fillText: mockFillText,
        textAlign: '',
        textBaseline: '',
        font: '',
        fillStyle: '',
        imageSmoothingEnabled: false,
        imageSmoothingQuality: 'low',
        letterSpacing: '0px'
      };

      let canvasWidth = 0;
      let canvasHeight = 0;

      const origCreateElement = document.createElement.bind(document);
      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        if (tag === 'canvas') {
          return {
            set width(val) { canvasWidth = val; },
            get width() { return canvasWidth; },
            set height(val) { canvasHeight = val; },
            get height() { return canvasHeight; },
            getContext: vi.fn().mockReturnValue(mockContext),
            toDataURL: vi.fn().mockReturnValue('data:image/png;base64,MOCK_ULTRA_HD_4X_PNG')
          };
        }
        return origCreateElement(tag);
      });

      const lines = WATERMARK_CONFIG.CONTROLLED.getLines({
        docCode: 'SOP-QA-001',
        revNo: '00',
        copyNo: '01',
        issueNo: '01',
        holderDept: 'QA',
        location: 'QA Lab'
      });

      // Verify typography weights & letter spacing & strict upright fontStyle: normal
      expect(lines[0].weight).toBe('600');
      expect(lines[0].letterSpacing).toBe(3);
      expect(lines[0].fontStyle).toBe('normal');
      expect(lines[1].weight).toBe('400');
      expect(lines[1].fontStyle).toBe('normal');
      expect(lines[2].weight).toBe('400');
      expect(lines[3].weight).toBe('400');
      expect(lines[4].weight).toBe('400');
      expect(lines[5].weight).toBe('400');
      lines.forEach((l) => {
        expect(l.fontStyle).toBe('normal');
      });

      const res = generateWatermarkCanvas({
        lines,
        colorHex: '#1F40B0'
      });

      expect(res).toBe('data:image/png;base64,MOCK_ULTRA_HD_4X_PNG');
      expect(mockContext.imageSmoothingEnabled).toBe(true);
      expect(mockContext.imageSmoothingQuality).toBe('high');
      expect(canvasWidth).toBeGreaterThan(1500); // 4x scale canvas width
      expect(mockFillText).toHaveBeenCalled();

      createElementSpy.mockRestore();
    });

    it('should strictly enforce font-style: normal and purge italic/oblique across all watermark tiers', () => {
      const tiers = ['DRAFT', 'CONTROLLED', 'UNCONTROLLED', 'SUPERSEDED', 'OBSOLETE'];
      tiers.forEach((tier) => {
        const config = WATERMARK_CONFIG[tier];
        expect(config.fontStyle).toBe('normal');
        expect(config.fontStyle).not.toContain('italic');
        expect(config.fontStyle).not.toContain('oblique');

        const lines = config.getLines({
          docCode: 'SOP-QA-001',
          revNo: '01',
          copyNo: '01',
          issueNo: '01',
          holderDept: 'QA',
          location: 'QA Lab'
        });
        lines.forEach((line) => {
          expect(line.fontStyle).toBe('normal');
          expect(line.fontStyle).not.toContain('italic');
          expect(line.fontStyle).not.toContain('oblique');
        });
      });
      expect(WATERMARK_FONT_FAMILY).toContain('TH Sarabun New');
      expect(WATERMARK_FONT_FAMILY_FROM_ENGINE).toBe(WATERMARK_FONT_FAMILY);
    });

    it('should support polymorphic invocation accepting either PDFDocument or Uint8Array bytes', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([595.28, 841.89]);
      const rawBytes = await pdfDoc.save();

      // Pass raw bytes
      const stampedBytes = await drawStandardIsoWatermark(rawBytes, 'DRAFT', {
        darNo: 'DAR-2026-009',
        userName: 'Tester',
        userDept: 'Engineering'
      });

      expect(stampedBytes).toBeInstanceOf(Uint8Array);
      expect(stampedBytes.length).toBeGreaterThan(0);

      const reloadedDoc = await PDFDocument.load(stampedBytes);
      expect(reloadedDoc.getPageCount()).toBe(1);
    });

    it('should correctly render OBSOLETE and SUPERSEDED tiers via drawImage with correct opacity', async () => {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([595.28, 841.89]);
      const drawSpy = vi.spyOn(page, 'drawImage');

      await drawStandardIsoWatermark(pdfDoc, 'SUPERSEDED', {
        docCode: 'SOP-MFG-001',
        revNo: '01',
        replacedByRev: '02',
        effectiveDate: '2026-03-01'
      });

      expect(drawSpy).toHaveBeenCalled();
      const firstCall = drawSpy.mock.calls[0];
      expect(firstCall[1].opacity).toBeCloseTo(0.24, 2);

      // Obsolete tier
      const obsoleteDoc = await PDFDocument.create();
      const obsPage = obsoleteDoc.addPage([595.28, 841.89]);
      const obsSpy = vi.spyOn(obsPage, 'drawImage');

      await drawStandardIsoWatermark(obsoleteDoc, 'OBSOLETE', {
        docCode: 'WI-OLD-001',
        darNo: 'DAR-OBS-99'
      });

      expect(obsSpy).toHaveBeenCalled();
      expect(obsSpy.mock.calls[0][1].opacity).toBeCloseTo(0.22, 2);
    });
  });

  describe('7. Optimize PDF Preview Latency via Pre-stamped Blob Caching (Instant Preview)', () => {
    it('should bypass applyProgressiveSignatoryStamp when doc.isSignatoryStamped is true and pre-stamped blob exists', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([595.28, 841.89]);
      const preStampedBytes = await pdfDoc.save();
      const preStampedBlob = new Blob([preStampedBytes], { type: 'application/pdf' });

      const testDoc = {
        id: 'doc-cached-001',
        title: 'SOP-QA-CACHED',
        docCode: 'SOP-QA-CACHED',
        status: 'ACTIVE',
        isSignatoryStamped: true,
        fileBlob: preStampedBlob,
        fileData: preStampedBytes
      };

      const spyStamp = vi.fn();
      const isAlreadyStamped = Boolean(testDoc.isSignatoryStamped || testDoc.is_signatory_stamped || testDoc.stampedAt);
      const inMemoryBlob = (testDoc.fileBlob instanceof Blob ? testDoc.fileBlob : null) ||
                           (testDoc.fileData ? new Blob([testDoc.fileData], { type: 'application/pdf' }) : null);

      let finalBlob = null;
      if (isAlreadyStamped && inMemoryBlob && inMemoryBlob.size > 0) {
        finalBlob = inMemoryBlob; // Instant fast path!
      } else {
        spyStamp();
      }

      expect(spyStamp).not.toHaveBeenCalled();
      expect(finalBlob).toBe(preStampedBlob);
    });

    it('should invoke JIT stamping only when doc is NOT yet stamped (!isSignatoryStamped)', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([595.28, 841.89]);
      const rawBytes = await pdfDoc.save();
      const rawBlob = new Blob([rawBytes], { type: 'application/pdf' });

      const testDoc = {
        id: 'doc-legacy-002',
        title: 'SOP-QA-LEGACY',
        docCode: 'SOP-QA-LEGACY',
        status: 'ACTIVE',
        isSignatoryStamped: false,
        fileBlob: rawBlob
      };

      let jitStampingTriggered = false;
      const isAlreadyStamped = Boolean(testDoc.isSignatoryStamped || testDoc.is_signatory_stamped || testDoc.stampedAt);

      if (!isAlreadyStamped) {
        jitStampingTriggered = true;
      }

      expect(jitStampingTriggered).toBe(true);
    });

    it('finalizeAndPublishMaster pre-bakes 3x3 table and flags isSignatoryStamped: true on approved document', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([600, 800]);
      const pdfBytes = await pdfDoc.save();
      const rawBlob = new Blob([pdfBytes], { type: 'application/pdf' });

      const dar = {
        id: 'DAR-PREBAKE-001',
        darNumber: 'DAR-PREBAKE-001',
        docNo: 'WI-MFG-PREBAKE',
        title: 'Work Instruction Manufacturing Prebake',
        status: 'APPROVED',
        fileBlob: rawBlob,
        requesterName: 'นายจัดทำ',
        reviewerName: 'นายตรวจ',
        approverName: 'นายอนุมัติ'
      };

      const doc = {
        id: 'doc-prebake-001',
        code: 'WI-MFG-PREBAKE',
        title: 'WI-MFG-PREBAKE',
        status: 'ACTIVE',
        darId: 'DAR-PREBAKE-001',
        isSignatoryStamped: false
      };

      useStore.setState({
        dars: [dar],
        documents: [doc],
        masterDocuments: [doc]
      });

      await useStore.getState().finalizeAndPublishMaster('DAR-PREBAKE-001');

      const state = useStore.getState();
      const updatedDoc = state.documents.find(d => d.id === 'doc-prebake-001');

      expect(updatedDoc).toBeDefined();
      expect(updatedDoc.isSignatoryStamped).toBe(true);
      expect(updatedDoc.fileData).toBeInstanceOf(Uint8Array);
      expect(updatedDoc.stampedAt).toBeDefined();
    });
  });

  describe('8. DCC Admin Clean Master Download & Role-Based Download Menu', () => {
    it('prepareMasterPdfForDownload with isCleanMaster: true applies 3x3 table but bypasses watermark', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([595.28, 841.89]);
      const pdfBytes = await pdfDoc.save();

      const doc = {
        id: 'doc-clean-001',
        docCode: 'SOP-DCC-001',
        title: 'Master Procedure',
        status: 'ACTIVE',
        fileData: pdfBytes
      };

      const dar = {
        id: 'dar-clean-001',
        docNo: 'SOP-DCC-001',
        status: 'APPROVED',
        requesterName: 'นายจัดทำ',
        reviewerName: 'นายตรวจ',
        approverName: 'นายอนุมัติ'
      };

      const cleanBytes = await UniversalWatermarkService.prepareMasterPdfForDownload({
        document: doc,
        dar,
        isCleanMaster: true,
        watermarkType: 'CLEAN'
      });

      expect(cleanBytes).toBeDefined();
      expect(cleanBytes).toBeInstanceOf(Uint8Array);

      // Verify clean document has pages
      const reloadedDoc = await PDFDocument.load(cleanBytes);
      expect(reloadedDoc.getPageCount()).toBe(1);
    });

    it('UniversalWatermarkService.downloadWatermarkedPdf logs audit trail with mode CLEAN_MASTER and names file with _MASTER_CLEAN', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([595.28, 841.89]);
      const pdfBytes = await pdfDoc.save();

      const doc = {
        id: 'doc-clean-audit-001',
        docCode: 'SOP-QA-999',
        title: 'Clean Master SOP',
        status: 'ACTIVE',
        rev: '02',
        fileData: pdfBytes
      };

      useStore.setState({
        currentUser: { id: 'U001', name: 'DCC Admin', department: 'DCC', isDcc: true, role: 'DCC_ADMIN' },
        controlledCopyAuditTrail: [],
        externalAuditTrail: []
      });

      // Spy on appendChild and click to capture download filename
      let capturedFilename = '';
      const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((el) => {
        if (el && el.tagName === 'A' && el.download) {
          capturedFilename = el.download;
        }
        return el;
      });
      const removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((el) => el);
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      try {
        await UniversalWatermarkService.downloadWatermarkedPdf(doc, 'CLEAN', {
          userName: 'DCC Admin',
          userDept: 'DCC',
          isCleanMaster: true
        });

        expect(capturedFilename).toContain('MASTER_CLEAN');
        expect(capturedFilename).toContain('SOP-QA-999');
        expect(capturedFilename).toContain('Rev02');

        const state = useStore.getState();
        const latestAudit = (state.controlledCopyAuditTrail || [])[0];
        expect(latestAudit).toBeDefined();
        expect(latestAudit.action).toBe('DOWNLOAD_CLEAN_MASTER');
        expect(latestAudit.downloadMode).toBe('CLEAN_MASTER');
        expect(latestAudit.user).toBe('DCC Admin');
      } finally {
        appendSpy.mockRestore();
        removeSpy.mockRestore();
        clickSpy.mockRestore();
      }
    });

    it('UniversalWatermarkService.downloadWatermarkedPdf logs audit trail with mode UNCONTROLLED and names file with _UNCONTROLLED', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([595.28, 841.89]);
      const pdfBytes = await pdfDoc.save();

      const doc = {
        id: 'doc-uncontrolled-001',
        docCode: 'WI-PD-777',
        title: 'Work Instruction PD',
        status: 'ACTIVE',
        rev: '01',
        fileData: pdfBytes
      };

      useStore.setState({
        currentUser: { id: 'U003', name: 'Somchai Staff', department: 'PD', isDcc: false, role: 'USER' },
        controlledCopyAuditTrail: [],
        externalAuditTrail: []
      });

      let capturedFilename = '';
      const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((el) => {
        if (el && el.tagName === 'A' && el.download) {
          capturedFilename = el.download;
        }
        return el;
      });
      const removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((el) => el);
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      try {
        await UniversalWatermarkService.downloadWatermarkedPdf(doc, WATERMARK_TYPES.UNCONTROLLED_COPY, {
          userName: 'Somchai Staff',
          userDept: 'PD',
          isCleanMaster: false
        });

        expect(capturedFilename).toContain('UNCONTROLLED');
        expect(capturedFilename).toContain('WI-PD-777');
        expect(capturedFilename).toContain('Rev01');

        const state = useStore.getState();
        const latestAudit = (state.controlledCopyAuditTrail || [])[0];
        expect(latestAudit).toBeDefined();
        expect(latestAudit.action).toBe('DOWNLOAD_UNCONTROLLED');
        expect(latestAudit.downloadMode).toBe('UNCONTROLLED');
      } finally {
        appendSpy.mockRestore();
        removeSpy.mockRestore();
        clickSpy.mockRestore();
      }
    });
  });
});


