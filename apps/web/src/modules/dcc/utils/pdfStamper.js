import { PDFDocument, rgb } from 'pdf-lib';
import { formatSignOffDate as _formatSignOffDate } from '../../../shared/utils/dateFormatter';

/**
 * Ensure TH Sarabun New font is loaded and ready before drawing on canvas.
 */
let fontLoadPromise = null;
export const ensureThSarabunFontLoaded = async () => {
  if (typeof document === 'undefined' || !document.fonts) return;
  if (fontLoadPromise) return fontLoadPromise;

  fontLoadPromise = (async () => {
    try {
      // 1. Check if TH Sarabun New is already available
      if (document.fonts.check('16px "TH Sarabun New"')) {
        await document.fonts.ready;
        return;
      }

      // 2. Try loading system/registered font
      try {
        await Promise.race([
          document.fonts.load('16px "TH Sarabun New"'),
          new Promise((resolve) => setTimeout(resolve, 200))
        ]);
      } catch {
        // Fallback to registering font files
      }

      // 3. Register FontFace fallback from /fonts/ folder under family "TH Sarabun New"
      if (!document.fonts.check('16px "TH Sarabun New"') && typeof FontFace !== 'undefined') {
        try {
          const fontRegular = new FontFace('TH Sarabun New', 'url(/fonts/Sarabun-Regular.ttf)', { weight: 'normal' });
          const fontBold = new FontFace('TH Sarabun New', 'url(/fonts/Sarabun-Bold.ttf)', { weight: 'bold' });
          await Promise.allSettled([fontRegular.load(), fontBold.load()]);
          document.fonts.add(fontRegular);
          document.fonts.add(fontBold);
        } catch {
          // Ignore if cannot fetch
        }
      }

      await document.fonts.ready;
    } catch (e) {
      console.warn('Font loading check completed with fallback:', e);
    }
  })();

  return fontLoadPromise;
};

/**
 * Helper: Format sign-off date to Thailand readable date (BE)
 * @param {Date|string|number} dateInput
 * @returns {string}
 */
export const formatSignOffDate = (dateInput) => {
  return _formatSignOffDate(dateInput);
};

/**
 * Helper: Generate dynamic cursive handwritten signature data URL from text/style
 * Uses HTML5 Canvas off-screen rendering with smooth anti-aliased cursive script and paraph flourish.
 */
export const generateCursiveSignatureDataUrl = (nameOrInitials = '', style = 'BRUSH_SCRIPT') => {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 140;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const textToDraw = nameOrInitials || 'Signature';

    let fontChoice = 'italic bold 48px "Brush Script MT", "Caveat", "Segoe Script", "Dancing Script", cursive, "TH Sarabun New"';
    if (style === 'FORMAL_SERIF') {
      fontChoice = 'italic bold 40px "Times New Roman", Times, Georgia, serif';
    } else if (style === 'MODERN_SANS') {
      fontChoice = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    } else if (style === 'CLASSIC_CALLIGRAPHY') {
      fontChoice = 'italic 44px "Snell Roundhand", "Apple Chancery", cursive';
    }

    ctx.font = fontChoice;
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(textToDraw, 180, 60);

    // Dynamic hand-drawn flourish stroke (authentic signature underline paraph)
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(70, 94);
    ctx.bezierCurveTo(130, 84, 220, 102, 290, 88);
    ctx.bezierCurveTo(250, 98, 170, 102, 110, 96);
    ctx.stroke();

    const dataUrl = canvas.toDataURL('image/png');
    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    } catch {}

    return dataUrl;
  } catch (err) {
    console.warn('generateCursiveSignatureDataUrl failed:', err);
    return null;
  }
};

/**
 * Extract active user signature image asset:
 * 1. user.signatureImage (from MasterDataHub "จัดการลายเซ็นอิเล็กทรอนิกส์")
 * 2. user.signatureUrl / user.eSignDataUrl / user.signature
 * 3. Fallback to generating a cursive signature data URL if user has registered signature or name
 */
export const getActiveUserSignatureAsset = (user) => {
  if (!user) return null;

  // 1. Direct active signature asset saved from MasterDataHub
  if (user.signatureImage && typeof user.signatureImage === 'string' && user.signatureImage.length > 20) {
    return user.signatureImage;
  }
  if (user.eSignDataUrl && typeof user.eSignDataUrl === 'string') {
    return user.eSignDataUrl;
  }
  if (user.signatureUrl && typeof user.signatureUrl === 'string') {
    return user.signatureUrl;
  }
  if (user.signature && typeof user.signature === 'string' && user.signature.startsWith('data:image/')) {
    return user.signature;
  }
  if (user.eSign && typeof user.eSign === 'string' && user.eSign.startsWith('data:image/')) {
    return user.eSign;
  }

  // 2. Synthesize an authentic handwritten signature image from user profile
  if (user.hasRegisteredSignature || user.signatureType || user.signatureInitials || user.name) {
    const text = user.signatureInitials || user.name || '';
    const style = user.signatureStyle || 'BRUSH_SCRIPT';
    return generateCursiveSignatureDataUrl(text, style);
  }

  return null;
};

/**
 * Safely resolve and format the DAR submission date from all possible fields.
 * NEVER returns '-' for a submitted DAR.
 */
export const resolveSubmissionDate = (dar, task, darTimeline = []) => {
  const submitTl = (darTimeline || []).find(t => 
    t && (
      t.action === 'SUBMIT' || 
      t.action === 'REQUEST' || 
      t.action === 'CREATE' || 
      t.action === 'Created' || 
      t.action === 'Submitted'
    )
  );

  const rawCandidate = 
    dar?.submittedAt || 
    dar?.submitted_at || 
    dar?.requestDate || 
    dar?.request_date || 
    dar?.createdAt || 
    dar?.created_at || 
    dar?.date || 
    dar?.timestamp || 
    task?.createdAt || 
    task?.created_at || 
    task?.submittedAt || 
    task?.date || 
    task?.timestamp || 
    submitTl?.date || 
    submitTl?.timestamp || 
    submitTl?.createdAt;

  if (rawCandidate && rawCandidate !== '-') {
    const formatted = formatSignOffDate(rawCandidate);
    if (formatted && formatted !== '-') {
      return formatted;
    }
  }

  // Fallback to today's date formatted in Buddhist Era (DD/MM/YYYY)
  return formatSignOffDate(new Date());
};

// ─── 3x3 Signatory Table Typography Standards ──────────────────────────────
export const SIGNATORY_FONT_FAMILY = "'TH Sarabun New', 'THSarabunNew', 'Sarabun', sans-serif";
export const PURE_BLACK = '#000000';

/**
 * Render non-bold pure black text for signatory table slots
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x - Pixel X on canvas
 * @param {number} y - Pixel Y on canvas
 * @param {number} sizePt - Font size in points (e.g. 12, 11, 9.5)
 * @param {number} [scale=4]
 */
export const renderSignatoryText = (ctx, text, x, y, sizePt, scale = 4) => {
  if (!ctx || text === undefined || text === null) return;
  if (typeof ctx.save === 'function') ctx.save();
  ctx.font = `normal ${sizePt * scale}px ${SIGNATORY_FONT_FAMILY}`;
  ctx.fillStyle = PURE_BLACK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (typeof ctx.fillText === 'function') {
    ctx.fillText(String(text), x, y);
  }
  if (typeof ctx.restore === 'function') ctx.restore();
};

/**
 * Generate a dynamic sign-off stamp image with 3-column table
 * using HTML5 Canvas with HiDPI Supersampling (4x) and TH Sarabun New font.
 * 
 * @param {Object} signOffData - { requester, reviewer, approver }
 * Each role object: { name, position, timestamp, status, statusText }
 * @returns {Promise<string>} Data URL of the generated PNG image
 */
export const generateSignOffStampImage = async ({ requester = {}, reviewer = {}, approver = {} } = {}) => {
  await ensureThSarabunFontLoaded();

  // 3x3 Signatory Table Dimensions (ISO 9001:2015 Spec)
  // Row 1: Header (26pt)
  // Row 2: Signature (62pt - Expanded height for prominent signatures without clipping)
  // Row 3: Signer Info (48pt)
  const headerRowHeight = 26;
  const signatureRowHeight = 62;
  const metaRowHeight = 48;
  const totalTableHeight = headerRowHeight + signatureRowHeight + metaRowHeight; // 136 pt
  const tableWidth = 500;
  const colWidth = tableWidth / 3;

  const canvas = document.createElement('canvas');
  const scale = 4; // Ultra-HD 4x Supersampling for crisp TH Sarabun New thin font lines
  const width = tableWidth * scale;
  const height = totalTableHeight * scale;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  }

  // Ultra-HD High-DPI Sharpness settings
  if ('imageSmoothingEnabled' in ctx) {
    ctx.imageSmoothingEnabled = true;
  }
  if ('imageSmoothingQuality' in ctx) {
    ctx.imageSmoothingQuality = 'high';
  }

  // 1. ถมพื้นหลังขาวทึบ 100% ป้องกันเส้นตารางเดิมใน PDF ทะลุ
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // 2. ตีกรอบนอกและเส้นแบ่งคอลัมน์ (3 คอลัมน์เท่ากัน สีดำล้วน #000000)
  ctx.strokeStyle = PURE_BLACK;
  ctx.lineWidth = Math.max(1, Math.round(1 * scale)); // 1pt border
  ctx.strokeRect(0, 0, width, height);

  ctx.beginPath();
  ctx.lineWidth = Math.max(1, Math.round(0.75 * scale)); // 0.75pt divider
  // เส้นแบ่งคอลัมน์
  ctx.moveTo(colWidth * scale, 0); ctx.lineTo(colWidth * scale, height);
  ctx.moveTo(colWidth * 2 * scale, 0); ctx.lineTo(colWidth * 2 * scale, height);
  // เส้นแบ่งแถว: แถว 1 (26pt), แถว 2 (62pt), แถว 3 (48pt)
  ctx.moveTo(0, headerRowHeight * scale); ctx.lineTo(width, headerRowHeight * scale);
  ctx.moveTo(0, (headerRowHeight + signatureRowHeight) * scale); ctx.lineTo(width, (headerRowHeight + signatureRowHeight) * scale);
  ctx.stroke();

  // Helper โหลดภาพลายเซ็น
  const loadImg = (src) => new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    setTimeout(() => resolve(null), 1500); // 1.5s timeout
    img.src = src;
  });

  const cols = [
    { title: 'ผู้จัดทำ', data: requester },
    { title: 'ผู้ทบทวน', data: reviewer },
    { title: 'ผู้อนุมัติ', data: approver }
  ];

  const headerCenterY = headerRowHeight / 2; // 13 pt (Center of 26pt header)
  const metaRowStartY = headerRowHeight + signatureRowHeight; // 88 pt

  for (let i = 0; i < cols.length; i++) {
    const { title, data } = cols[i];
    const cellCenterX = (i * colWidth) + (colWidth / 2);

    // แถวที่ 1: หัวข้อบทบาท (Header: 12 pt, Regular / Non-Bold, Pure Black #000000)
    renderSignatoryText(ctx, title, cellCenterX * scale, headerCenterY * scale, 12, scale);

    // หากขั้นตอนยังไม่เสร็จสิ้น (Pending): ปล่อยช่องแถว 2 และ 3 ว่างเปล่า 100%
    const status = (data?.status || '').toUpperCase();
    const isExplicitPending = data?.isPending === true || 
      status.includes('PENDING') || 
      status.includes('WAIT') || 
      status === 'DRAFT' ||
      !status;

    const isSigned = data?.isSigned !== undefined
      ? Boolean(data.isSigned)
      : (data?.isCompleted !== undefined
          ? Boolean(data.isCompleted)
          : (!isExplicitPending && Boolean(data?.name && String(data.name).trim() !== '')));

    if (!data || !isSigned) {
      continue;
    }

    // แถวที่ 2: วาดภาพ E-Signature จริง (ความสูงแถว 62pt, ขนาดภาพสูงสุด 120x48pt กึ่งกลางแนวนอนและแนวตั้ง)
    const signatureSrc = data.signatureImage || data.signature || (data.name ? generateCursiveSignatureDataUrl(data.name, 'BRUSH_SCRIPT') : null);
    if (signatureSrc) {
      const sigImg = await loadImg(signatureSrc);
      if (sigImg) {
        const maxImgW = Math.min(120, colWidth - 20);
        const maxImgH = 48; // ขยายความสูงภาพลายเซ็นเป็น 48 pt
        const ratio = Math.min(maxImgW / sigImg.width, maxImgH / sigImg.height, 1);
        const drawW = sigImg.width * ratio;
        const drawH = sigImg.height * ratio;
        const drawX = (i * colWidth) + ((colWidth - drawW) / 2);
        const drawY = headerRowHeight + ((signatureRowHeight - drawH) / 2);
        if (typeof ctx.drawImage === 'function') {
          ctx.drawImage(
            sigImg,
            drawX * scale,
            drawY * scale,
            drawW * scale,
            drawH * scale
          );
        }
      }
    }

    // แถวที่ 3: ข้อมูลผู้ลงนาม (ชื่อ 11pt, ตำแหน่ง 9.5pt, วันที่ 9.5pt - Regular / Non-Bold, Pure Black #000000)
    const line1Y = metaRowStartY + 14; // ชื่อ-นามสกุล
    const line2Y = metaRowStartY + 27; // ตำแหน่ง
    const line3Y = metaRowStartY + 39; // วันที่
    const dateText = data.date || data.timestamp || '-';

    renderSignatoryText(ctx, data.name || '-', cellCenterX * scale, line1Y * scale, 11, scale);
    renderSignatoryText(ctx, data.position || '-', cellCenterX * scale, line2Y * scale, 9.5, scale);
    renderSignatoryText(ctx, dateText, cellCenterX * scale, line3Y * scale, 9.5, scale);
  }

  try {
    const dataUrl = canvas.toDataURL('image/png');
    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    } catch {}
    return dataUrl;
  } catch {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  }
};

/**
 * Stamp the FIRST page of a PDF with the sign-off table (Legacy compatibility)
 * @param {Uint8Array|ArrayBuffer} originalPdfBytes - The source PDF
 * @param {Object} signOffData - The data for the stamp { requester, reviewer, approver }
 * @returns {Promise<Uint8Array>} The modified PDF bytes
 */
export const stampDocumentFirstPage = async (originalPdfBytes, signOffData) => {
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  const { width } = firstPage.getSize();

  const pngDataUrl = await generateSignOffStampImage(signOffData);
  const pngImage = await pdfDoc.embedPng(pngDataUrl);

  const stampWidth = Math.min(500, width - 40);
  const stampHeight = (stampWidth / pngImage.width) * pngImage.height;

  const x = (width - stampWidth) / 2;
  const y = 30;

  // Mask out underlying PDF content/ghost lines with solid white rectangle
  firstPage.drawRectangle({
    x,
    y,
    width: stampWidth,
    height: stampHeight,
    color: rgb(1, 1, 1),
    borderWidth: 0,
    opacity: 1.0
  });

  firstPage.drawImage(pngImage, {
    x,
    y,
    width: stampWidth,
    height: stampHeight,
  });

  return await pdfDoc.save();
};

/**
 * Apply permanent progressive signatory stamp (3-column 3x3 table) onto the FIRST page footer of a PDF.
 * Conforms to ISO 9001 permanent signatory stamping requirement.
 *
 * @param {Uint8Array|ArrayBuffer|Blob} originalPdfBytesOrBlob - Pristine source PDF
 * @param {{ requester: Object, reviewer: Object, approver: Object }} signatories
 * @returns {Promise<Uint8Array>} Stamped PDF bytes
 */
export const applyProgressiveSignatoryStamp = async (originalPdfBytesOrBlob, signatories = {}) => {
  if (!originalPdfBytesOrBlob) {
    throw new Error('applyProgressiveSignatoryStamp: ไม่พบข้อมูล PDF ต้นฉบับ');
  }

  let arrayBuffer;
  if (typeof Blob !== 'undefined' && originalPdfBytesOrBlob instanceof Blob) {
    arrayBuffer = await originalPdfBytesOrBlob.arrayBuffer();
  } else if (originalPdfBytesOrBlob instanceof ArrayBuffer) {
    arrayBuffer = originalPdfBytesOrBlob;
  } else if (ArrayBuffer.isView(originalPdfBytesOrBlob)) {
    arrayBuffer = originalPdfBytesOrBlob.buffer.slice(
      originalPdfBytesOrBlob.byteOffset,
      originalPdfBytesOrBlob.byteOffset + originalPdfBytesOrBlob.byteLength
    );
  } else {
    throw new Error('applyProgressiveSignatoryStamp: รูปแบบข้อมูล PDF ไม่ถูกต้อง');
  }

  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const pages = pdfDoc.getPages();
  if (pages.length === 0) return new Uint8Array(arrayBuffer);

  const firstPage = pages[0];
  const { width } = firstPage.getSize();

  // Normalize signatories cell shape
  const toStampCell = (cell) => {
    if (!cell) return { isCompleted: false, isPending: true, isSigned: false };
    const isSigned = cell.isSigned !== undefined 
      ? Boolean(cell.isSigned) 
      : (cell.isCompleted !== undefined 
          ? Boolean(cell.isCompleted) 
          : Boolean(cell.name && String(cell.name).trim() !== ''));
    return {
      name: isSigned ? (cell.name || '') : '',
      position: isSigned ? (cell.position || '') : '',
      date: isSigned ? (cell.date || cell.timestamp || '') : '',
      timestamp: isSigned ? (cell.date || cell.timestamp || '') : '',
      signatureImage: isSigned ? (cell.signatureImage || cell.signature || null) : null,
      signature: isSigned ? (cell.signatureImage || cell.signature || null) : null,
      isCompleted: isSigned,
      isSigned,
      isPending: !isSigned,
      status: isSigned ? 'COMPLETED' : 'PENDING'
    };
  };

  const stampData = {
    requester: toStampCell(signatories?.requester),
    reviewer:  toStampCell(signatories?.reviewer),
    approver:  toStampCell(signatories?.approver)
  };

  const pngDataUrl = await generateSignOffStampImage(stampData);
  const pngImage = await pdfDoc.embedPng(pngDataUrl);

  const stampWidth = Math.min(500, width - 40);
  const stampHeight = (stampWidth / pngImage.width) * pngImage.height;
  const x = (width - stampWidth) / 2;
  const y = 30; // 30pt from bottom of Page 1

  // Solid white rectangle mask to erase any underlying PDF text/grid lines
  firstPage.drawRectangle({
    x,
    y,
    width: stampWidth,
    height: stampHeight,
    color: rgb(1, 1, 1),
    borderWidth: 0,
    opacity: 1.0
  });

  firstPage.drawImage(pngImage, {
    x,
    y,
    width: stampWidth,
    height: stampHeight,
  });

  return await pdfDoc.save();
};

/**
 * Stamp the LAST page of a PDF with the dynamic sign-off matrix table in the footer.
 * Conforms to ISO 9001 QMS Process Automation specifications.
 * 
 * @param {Uint8Array|ArrayBuffer} originalPdfBytes - The source PDF
 * @param {Object} signOffData - The data for the stamp { requester, reviewer, approver }
 * @returns {Promise<Uint8Array>} The modified PDF bytes
 */
export const stampDocumentLastPage = async (originalPdfBytes, signOffData) => {
  // Guard: must load from real bytes — never create a blank document
  if (!originalPdfBytes || (originalPdfBytes instanceof ArrayBuffer && originalPdfBytes.byteLength === 0)) {
    throw new Error('stampDocumentLastPage: ไม่มีไบต์ PDF ต้นฉบับ — ห้ามสร้างเอกสารเปล่า');
  }

  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  const { width } = lastPage.getSize();

  // 1. Generate stamp image
  const pngDataUrl = await generateSignOffStampImage(signOffData);
  const pngImage = await pdfDoc.embedPng(pngDataUrl);

  // 2. STRICTLY CLAMPED Footer dimensions — 136pt high, 30pt from bottom edge
  // This ensures the white mask covers the full 136pt signatory matrix (26 + 62 + 48).
  const MATRIX_HEIGHT = 136; // Fixed 136pt footer zone
  const FOOTER_BOTTOM  = 30; // 30pt from physical bottom edge
  const stampWidth  = Math.min(500, width - 40);
  const stampHeight = MATRIX_HEIGHT;
  const xPos = (width - stampWidth) / 2;
  const yPos = FOOTER_BOTTOM;

  // 3. White mask — covers ONLY the footer rectangle (never touches content above)
  lastPage.drawRectangle({
    x: xPos,
    y: yPos,
    width: stampWidth,
    height: stampHeight,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });

  // 4. Draw the signatory matrix image into the exactly-clamped footer zone
  lastPage.drawImage(pngImage, {
    x: xPos,
    y: yPos,
    width: stampWidth,
    height: stampHeight,
  });

  return await pdfDoc.save();
};

/**
 * Generate a stamp image for External Documents
 * @param {Object} stampData - Data for the stamp (e.g. { docCode, title, timestamp, status })
 * @returns {Promise<string>} Data URL of the generated PNG image
 */
export const generateExternalDocStampImage = async (stampData) => {
  // Ensure TH Sarabun New is loaded before drawing
  await ensureThSarabunFontLoaded();

  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    // HiDPI Supersampling (1200 x 220) - 5x supersampled vs 240pt on PDF
    const width = 1200;
    const height = 220;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if ('textRendering' in ctx) {
      ctx.textRendering = 'optimizeLegibility';
    }

    // 1. Transparent Background (100% frameless, no background or border)
    ctx.clearRect(0, 0, width, height);

    // 2. Right-Aligned Typography setup
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    // Stamp Red (Crimson/Carmine) with 0.85 opacity as watermark stamp
    ctx.fillStyle = 'rgba(220, 38, 38, 0.85)'; 

    // Right-Margin Safety Buffer to avoid edge clipping (e.g. 2569 or ')')
    const paddingRight = 36;
    const FONT_FAMILY = '"TH Sarabun New", "THSarabunNew", "Sarabun", sans-serif';
    
    // Line 1: รหัสเอกสาร (ฉบับต้นทาง: [เวอร์ชัน]) - Bold Monospace / TH Sarabun New
    ctx.font = `bold 50px ${FONT_FAMILY}`;
    const docCode = stampData?.docCode || stampData?.edCode || 'EXT-DOC';
    let originRev = stampData?.docRev || stampData?.sourceVersion || stampData?.edition || '-';
    if (originRev === '00' || originRev === 'Rev.00' || originRev === 'Rev. 00') {
      originRev = stampData?.sourceVersion || stampData?.edition || '-';
      if (originRev === '00' || originRev === 'Rev.00' || originRev === 'Rev. 00') {
        originRev = '-';
      }
    }
    ctx.fillText(`${docCode} (ฉบับต้นทาง: ${originRev})`, width - paddingRight, 50);

    // Line 2: ชื่อเอกสาร (Truncate if too long)
    ctx.font = `normal 42px ${FONT_FAMILY}`;
    let docTitle = stampData?.title || 'External Document';
    const maxTextWidth = width - paddingRight - 80; 
    if (ctx.measureText(docTitle).width > maxTextWidth) {
      while (docTitle.length > 0 && ctx.measureText(docTitle + '...').width > maxTextWidth) {
        docTitle = docTitle.slice(0, -1);
      }
      docTitle += '...';
    }
    ctx.fillText(docTitle, width - paddingRight, 112);

    // Line 3: Effective Date - Compact Caption size
    ctx.font = `normal 38px ${FONT_FAMILY}`;
    const effectiveDate = stampData?.timestamp || '-';
    ctx.fillText(`Effective Date: ${effectiveDate}`, width - paddingRight, 170);
    const dataUrl = canvas.toDataURL('image/png');
    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    } catch {}

    resolve(dataUrl);
  });
};

/**
 * Stamp ALL pages of an External Document at the Top Right corner, handling page rotation.
 * @param {Uint8Array|ArrayBuffer} pdfBytes - The source PDF
 * @param {Object} stampData - The data for the stamp
 * @returns {Promise<Uint8Array>} The modified PDF bytes
 */
export const stampExternalDocumentTopRight = async (pdfBytes, stampData) => {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  
  // 1. Generate stamp image once
  const pngDataUrl = await generateExternalDocStampImage(stampData);
  
  // 2. Embed image once
  const stampImage = await pdfDoc.embedPng(pngDataUrl);

  const margin = 16; 
  const stampWidth = 240; // Scaled down & compact width for seamless top-right alignment
  const stampHeight = (stampWidth / stampImage.width) * stampImage.height;

  // 3. Iterate and stamp all pages
  pages.forEach((page) => {
    const { width, height } = page.getSize();
    const rotationAngle = page.getRotation().angle;

    // Default Top-Right coordinates (unrotated)
    let x = width - stampWidth - margin;
    let y = height - stampHeight - margin;

    // Handle Rotation to keep the stamp physically at the Top Right of the viewed page
    if (rotationAngle === 90) {
      // Page is rotated 90 degrees clockwise.
      // The visual top-right is (x: width, y: 0) in the unrotated coordinate system
      x = width - stampWidth - margin;
      y = margin;
    } else if (rotationAngle === 180) {
      // Rotated 180 degrees. Visual top-right is bottom-left unrotated (0, 0).
      x = margin;
      y = margin;
    } else if (rotationAngle === 270) {
      // Rotated 270 degrees clockwise. Visual top-right is top-left unrotated (0, height).
      x = margin;
      y = height - stampHeight - margin;
    }

    // 100% Transparent Watermark Stamp (no opaque background rectangle that blocks table lines or header text)
    page.drawImage(stampImage, {
      x,
      y,
      width: stampWidth,
      height: stampHeight,
      opacity: 0.85,
    });
  });

  // 4. Save and return
  return await pdfDoc.save();
};

/**
 * Generate an Uncontrolled Copy watermark image
 * Enhanced with 4x HiDPI Supersampling (300+ DPI) & high-quality anti-aliasing for vector-like sharpness
 */
export const generateDiagonalWatermarkCanvas = async ({
  type = 'UNCONTROLLED', // 'CONTROLLED' | 'UNCONTROLLED' | 'DRAFT'
  docInfo = {},
  userInfo = {}
}) => {
  await ensureThSarabunFontLoaded();

  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const scale = 3; // HiDPI 3x Supersampling
    const size = 600 * scale; // ลดขนาด Canvas จาก 800 เหลือ 600
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    
    // Enable high-quality anti-aliasing & subpixel text smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if ('textRendering' in ctx) {
      ctx.textRendering = 'optimizeLegibility';
    }

    ctx.scale(scale, scale);

    ctx.translate(300, 300);
    ctx.rotate((-45 * Math.PI) / 180); // หมุนทวนเข็ม 45 องศา

    const isControlled = type === 'CONTROLLED';
    // ปรับความโปร่งแสงให้นุ่มนวล สบายตา ไม่อึดอัด
    const mainColor = isControlled ? 'rgba(22, 101, 52, 0.38)' : 'rgba(220, 38, 38, 0.35)';
    const subColor = isControlled ? 'rgba(21, 128, 61, 0.35)' : 'rgba(239, 68, 68, 0.32)';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 1. หัวเรื่องหลัก (ย่อเหลือ 34px)
    ctx.font = 'bold 34px "TH Sarabun New", sans-serif';
    ctx.fillStyle = mainColor;
    ctx.fillText(isControlled ? 'CONTROLLED COPY' : 'UNCONTROLLED COPY', 0, -28);

    // 2. หัวเรื่องภาษาไทย (ย่อเหลือ 18px)
    ctx.font = 'bold 18px "TH Sarabun New", sans-serif';
    ctx.fillText(
      isControlled ? 'สำเนาควบคุม (เอกสารมีผลบังคับใช้)' : 'สำเนาไม่ควบคุม (ใช้สำหรับอ้างอิงเท่านั้น)',
      0,
      -5
    );

    // เส้นคั่นกึ่งกลาง (ย่นเหลือความกว้าง 340px)
    ctx.strokeStyle = subColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-170, 10);
    ctx.lineTo(170, 10);
    ctx.stroke();

    // 3. รายละเอียดและ Metadata (ย่อเหลือ 12px)
    ctx.font = 'normal 12px "TH Sarabun New", sans-serif';
    ctx.fillStyle = subColor;

    const formattedRev = docInfo.revision ? (String(docInfo.revision).startsWith('Rev') ? docInfo.revision : `Rev.${docInfo.revision}`) : 'Rev.00';
    const line1 = `รหัส: ${docInfo.docCode || '-'} | ฉบับ: ${formattedRev} | ชื่อ: ${docInfo.title || '-'}`;
    const line2 = `ผู้ดาวน์โหลด: ${userInfo.name || '-'} ${userInfo.dept ? `(${userInfo.dept})` : ''} | วันที่: ${docInfo.downloadDate || '-'}`;
    const line3 = isControlled
      ? '*ห้ามทำซ้ำหรือถ่ายเอกสารโดยไม่ได้รับอนุญาตจาก DCC*'
      : '*เอกสารนี้ไม่มีการปรับปรุงเมื่อมีการแก้ไข โปรดตรวจสอบฉบับล่าสุดในระบบ*';

    ctx.fillText(line1, 0, 25);
    ctx.fillText(line2, 0, 40);
    ctx.fillText(line3, 0, 55);

    const dataUrl = canvas.toDataURL('image/png');
    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    } catch {}

    resolve(dataUrl);
  });
};

/**
 * Generate an Uncontrolled Copy watermark image (Backwards Compatible Wrapper)
 */
export const generateUncontrolledWatermarkImage = async (metadata) => {
  let name = metadata.downloadedBy || 'Authorized User';
  let dept = '';
  // parse "Name (Dept)" if possible
  const match = name.match(/^(.*?)\s*\((.*?)\)$/);
  if (match) {
    name = match[1].trim();
    dept = match[2].trim();
  }

  return await generateDiagonalWatermarkCanvas({
    type: 'UNCONTROLLED',
    docInfo: {
      docCode: metadata.docCode,
      revision: metadata.docRev,
      title: metadata.docTitle,
      downloadDate: metadata.downloadDate
    },
    userInfo: {
      name,
      dept
    }
  });
};

/**
 * Redesigned Responsive ISO Watermark Engine (Blueprint A)
 * Parametric Auto-Scaling according to actual page size:
 * - Main text (48pt-52pt, min(width, height) * 0.085)
 * - Sub text (20pt-22pt, mainFontSize * 0.42)
 * - Warning Red ({ red: 0.9, green: 0.2, blue: 0.2 }), opacity: 0.22, 45 degrees, centered
 *
 * @param {PDFPage} page - pdf-lib page
 * @param {string} text - Main watermark text
 * @param {string} subText - Secondary subtitle text
 * @param {Object} [options={}] - Custom options (font, opacity, color)
 */
export const drawIsoDiagonalWatermark = (pageOrBytes, text = 'UNCONTROLLED COPY', subText = '(สำเนาไม่ควบคุม)', options = {}) => {
  if (!pageOrBytes) return pageOrBytes;

  // Support polymorphic invocation: If passed a PDF document / bytes / ArrayBuffer / Blob instead of a single page
  if (typeof pageOrBytes.getSize !== 'function') {
    return (async () => {
      let rawBytes = pageOrBytes;
      if (typeof Blob !== 'undefined' && rawBytes instanceof Blob) {
        rawBytes = await rawBytes.arrayBuffer();
      }
      const pdfDoc = await PDFDocument.load(rawBytes);
      const pages = pdfDoc.getPages();
      for (const p of pages) {
        drawIsoDiagonalWatermark(p, text, subText, options);
      }
      return await pdfDoc.save();
    })();
  }

  const page = pageOrBytes;
  const { width, height } = page.getSize();
  
  // คำนวณขนาดฟอนต์ให้ได้สัดส่วนกับหน้ากระดาษจริงเสมอ
  const mainFontSize = Math.min(width, height) * 0.085; // ~50pt สำหรับ A4
  const subFontSize = mainFontSize * 0.42;              // ~21pt

  const centerX = width / 2;
  const centerY = height / 2;
  const opacity = options.opacity !== undefined ? options.opacity : 0.22;
  const color = options.color || rgb(0.9, 0.25, 0.25);
  const font = options.font || null;

  // วาดข้อความหลักภาษาอังกฤษ
  page.drawText(text, {
    x: centerX - (text.length * mainFontSize * 0.28),
    y: centerY + 10,
    size: mainFontSize,
    rotate: { type: 'degrees', angle: 45 },
    opacity,
    color,
    ...(font ? { font } : {})
  });

  // วาดข้อความบรรทัดรองภาษาไทย
  if (subText) {
    try {
      page.drawText(subText, {
        x: centerX - (subText.length * subFontSize * 0.32),
        y: centerY - (subFontSize * 1.5),
        size: subFontSize,
        rotate: { type: 'degrees', angle: 45 },
        opacity: Math.max(0.1, opacity - 0.02),
        color,
        ...(font ? { font } : {})
      });
    } catch {
      try {
        const fallbackSub = subText.includes('ไม่ควบคุม') ? '(FOR REFERENCE ONLY)' : '(CONTROLLED)';
        page.drawText(fallbackSub, {
          x: centerX - (fallbackSub.length * subFontSize * 0.28),
          y: centerY - (subFontSize * 1.5),
          size: subFontSize,
          rotate: { type: 'degrees', angle: 45 },
          opacity: Math.max(0.1, opacity - 0.02),
          color
        });
      } catch {
        // safe
      }
    }
  }
};

/**
 * Apply the Uncontrolled watermark to all pages of a PDF using responsive ISO engine
 */
export const applyUncontrolledWatermarkToPdf = async (pdfBytes, _metadata = {}) => {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  pages.forEach((page) => {
    drawIsoDiagonalWatermark(page, 'UNCONTROLLED COPY', '(สำเนาไม่ควบคุม)');
  });

  return await pdfDoc.save();
};

/**
 * Generate a State-Aware DRAFT Watermark image
 * Specifications:
 * - Line 1: DRAFT (Large Bold)
 * - Line 2: ฉบับร่าง (สำหรับทบทวนและพิจารณาเท่านั้น)
 * - Line 3: ห้ามนำไปใช้ปฏิบัติงานจริง (NOT FOR OPERATIONAL USE)
 * - HiDPI 4x Supersampling with TH Sarabun New font
 * - 30% - 40% Opacity in Deep Carmine / Amber-Red
 */
export const generateDraftWatermarkImage = async (metadata = {}) => {
  if (
    metadata?.type === 'OBSOLETE' ||
    metadata?.action_type === 'OBSOLETE' ||
    metadata?.darType === 'OBSOLETE' ||
    metadata?.requestType === 'OBSOLETE' ||
    metadata?.type === 'CANCEL' ||
    metadata?.skipStamping
  ) {
    return null;
  }

  await ensureThSarabunFontLoaded();

  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');

    const SCALE = 4;
    const BASE_WIDTH = 640;
    const BASE_HEIGHT = 400;

    canvas.width = BASE_WIDTH * SCALE;   // 2560 px
    canvas.height = BASE_HEIGHT * SCALE; // 1600 px
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      resolve(null);
      return;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if ('textRendering' in ctx) {
      ctx.textRendering = 'optimizeLegibility';
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Rotate 45 degrees or -35 degrees diagonal across the page
    const angle = -35 * (Math.PI / 180);
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);

    const FONT_FAMILY = '"TH Sarabun New", "Noto Sans Thai", "Sarabun", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 35% opacity tone
    const primaryColor = 'rgba(225, 29, 72, 0.38)';
    const secondaryColor = 'rgba(225, 29, 72, 0.36)';
    const warningColor = 'rgba(225, 29, 72, 0.34)';
    const metaColor = 'rgba(225, 29, 72, 0.30)';

    // Line 1: DRAFT (Large bold header)
    ctx.fillStyle = primaryColor;
    ctx.font = `bold ${Math.round(44 * SCALE)}px ${FONT_FAMILY}`;
    ctx.fillText('DRAFT', 0, -Math.round(44 * SCALE));

    // Line 2: ฉบับร่าง (สำหรับทบทวนและพิจารณาเท่านั้น)
    ctx.fillStyle = secondaryColor;
    ctx.font = `bold ${Math.round(20 * SCALE)}px ${FONT_FAMILY}`;
    ctx.fillText('ฉบับร่าง (สำหรับทบทวนและพิจารณาเท่านั้น)', 0, -Math.round(4 * SCALE));

    // Divider Line
    ctx.strokeStyle = 'rgba(225, 29, 72, 0.28)';
    ctx.lineWidth = Math.max(1, 0.8 * SCALE);
    ctx.beginPath();
    ctx.moveTo(-Math.round(180 * SCALE), Math.round(16 * SCALE));
    ctx.lineTo(Math.round(180 * SCALE), Math.round(16 * SCALE));
    ctx.stroke();

    // Line 3: ห้ามนำไปใช้ปฏิบัติงานจริง (NOT FOR OPERATIONAL USE)
    ctx.fillStyle = warningColor;
    ctx.font = `600 ${Math.round(13.5 * SCALE)}px ${FONT_FAMILY}`;
    ctx.fillText('ห้ามนำไปใช้ปฏิบัติงานจริง (NOT FOR OPERATIONAL USE)', 0, Math.round(32 * SCALE));

    // Optional Line 4: DAR reference & Date
    if (metadata.darNo || metadata.docCode) {
      ctx.fillStyle = metaColor;
      ctx.font = `normal ${Math.round(11 * SCALE)}px ${FONT_FAMILY}`;
      const darText = metadata.darNo ? `DAR: ${metadata.darNo}` : '';
      const docText = metadata.docCode ? `Doc: ${metadata.docCode}` : '';
      const dateText = metadata.timestamp ? `วันที่: ${metadata.timestamp}` : '';
      const parts = [darText, docText, dateText].filter(Boolean).join('  |  ');
      if (parts) {
        ctx.fillText(parts, 0, Math.round(50 * SCALE));
      }
    }

    ctx.restore();
    const dataUrl = canvas.toDataURL('image/png');
    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    } catch {}

    resolve(dataUrl);
  });
};

/**
 * Apply the State-Aware DRAFT watermark to all pages of a PDF
 * @param {Uint8Array|ArrayBuffer} pdfBytes - Source PDF bytes
 * @param {Object} metadata - Optional metadata (darNo, docCode, timestamp)
 * @returns {Promise<Uint8Array>} Stamped PDF bytes
 */
export const applyDraftWatermarkToPdf = async (pdfBytes, metadata = {}) => {
  if (
    metadata?.type === 'OBSOLETE' ||
    metadata?.action_type === 'OBSOLETE' ||
    metadata?.darType === 'OBSOLETE' ||
    metadata?.requestType === 'OBSOLETE' ||
    metadata?.type === 'CANCEL' ||
    metadata?.skipStamping
  ) {
    return pdfBytes;
  }

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  const watermarkPngUrl = await generateDraftWatermarkImage(metadata);
  if (!watermarkPngUrl) {
    return await pdfDoc.save();
  }
  const watermarkImage = await pdfDoc.embedPng(watermarkPngUrl);

  pages.forEach((page) => {
    const { width, height } = page.getSize();
    const watermarkWidth = width * 0.90;
    const watermarkHeight = (watermarkWidth / watermarkImage.width) * watermarkImage.height;

    page.drawImage(watermarkImage, {
      x: (width - watermarkWidth) / 2,
      y: (height - watermarkHeight) / 2,
      width: watermarkWidth,
      height: watermarkHeight,
    });
  });

  return await pdfDoc.save();
};

export { rawBlobRegistry } from './fileStorage';

/**
 * Resolve pristine raw PDF Blob from storage using High-Performance Resilient Architecture:
 *
 * Layer 0: rawBlobRegistry (clean in-session raw blobs — 0ms instant cache hit)
 * Layer 1: IndexedDB (ground-truth persistent store)
 * Layer 2: inMemoryBlobRegistry (in-memory session store)
 * Layer 3: dar/task object fields (fallback for embedded blobs passed directly)
 * Layer 4: resolveFileBlob universal resolver
 *
 * @param {string} fileId - Primary file storage key
 * @param {string[]} [fallbackKeys=[]] - Additional keys to try in order
 * @param {Object|null} [darObject=null] - DAR/task object for last-resort field extraction
 * @returns {Promise<Blob|null>}
 */
export const resolveRawFileBlob = async (fileId, fallbackKeys = [], darObject = null) => {
  const { initDB, inMemoryBlobRegistry, rawBlobRegistry, resolveFileBlob } = await import('./fileStorage');

  const toBlob = (result) => {
    if (!result) return null;
    if (typeof Blob !== 'undefined' && result instanceof Blob) return result;
    if (result instanceof ArrayBuffer) return new Blob([result], { type: 'application/pdf' });
    if (ArrayBuffer.isView(result)) return new Blob([result.buffer], { type: 'application/pdf' });
    return null;
  };

  const extraKeysFromDar = darObject ? [
    darObject.attachedFile?.fileId,
    darObject.attachedFile?.id,
    darObject.attachedFile?.key,
    darObject.attachedFile?.name,
    darObject.fileId,
    darObject.file_id,
    darObject.id,
    darObject.darNumber,
    darObject.darNo,
    darObject.docCode,
    darObject.document_code,
    darObject.title
  ] : [];

  const allKeys = Array.from(new Set([fileId, ...fallbackKeys, ...extraKeysFromDar].filter(Boolean)));

  // ── LAYER 0: Clean Raw In-Memory Registry (Instant 0ms Cache) ─────────
  for (const key of allKeys) {
    if (rawBlobRegistry && rawBlobRegistry.has(String(key))) {
      const blob = toBlob(rawBlobRegistry.get(String(key)));
      if (blob) return blob;
    }
  }

  // ── LAYER 1: IndexedDB ─────────────────────────────────────────────────
  const fetchFromIDB = async (key) => {
    if (!key) return null;
    try {
      const db = await initDB();
      return await new Promise((resolve) => {
        const tx = db.transaction('attachments', 'readonly');
        const store = tx.objectStore('attachments');
        const req = store.get(String(key));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  };

  for (const key of allKeys) {
    const blob = toBlob(await fetchFromIDB(key));
    if (blob) {
      if (rawBlobRegistry) rawBlobRegistry.set(String(key), blob);
      return blob;
    }
  }

  // ── LAYER 2: In-Memory Binary Registry Fallback ────────────────────────
  for (const key of allKeys) {
    if (inMemoryBlobRegistry && inMemoryBlobRegistry.has(String(key))) {
      const blob = toBlob(inMemoryBlobRegistry.get(String(key)));
      if (blob) {
        if (rawBlobRegistry) rawBlobRegistry.set(String(key), blob);
        return blob;
      }
    }
  }

  // ── LAYER 3: DAR/task object direct field extraction ───────────────────
  if (darObject) {
    const candidates = [
      darObject.attachedFile,
      darObject.file,
      darObject.fileBlob,
      darObject.blob,
      darObject.pdfBlob,
      darObject.attachment,
      darObject.attachedFile?.file,
      darObject.attachedFile?.blob
    ];
    for (const field of candidates) {
      const blob = toBlob(field);
      if (blob) return blob;
    }
    // Also try data URL fields
    const dataUrls = [
      darObject.fileData,
      darObject.dataUrl,
      typeof darObject.attachedFile === 'string' ? darObject.attachedFile : null,
      typeof darObject.file === 'string' ? darObject.file : null,
    ];
    for (const dataUrl of dataUrls) {
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
        try {
          const res = await fetch(dataUrl);
          return await res.blob();
        } catch { /* continue */ }
      }
    }
  }

  // ── LAYER 4: Universal File Storage Resolver Fallback ───────────────────
  if (darObject && typeof resolveFileBlob === 'function') {
    try {
      const fallbackBlob = await resolveFileBlob(darObject, fileId);
      if (fallbackBlob) return fallbackBlob;
    } catch { /* continue */ }
  }

  return null;
};

/**
 * Sequential Stamping Pipeline for DAR Document Previews:
 * 1. Stamp dynamic Signatory Matrix on the last page footer (strictly 136pt at y=30)
 * 2. Stamp state-aware DRAFT watermark across center of all pages
 * 3. Return final stamped PDF bytes
 *
 * ZERO BLANK PDF POLICY:
 * - Accepts only real, non-empty PDF bytes (Uint8Array | ArrayBuffer)
 * - Will throw immediately if rawPdfBytes is falsy or empty
 * - NEVER calls PDFDocument.create() — always loads from existing bytes
 *
 * Calling conventions (both are supported):
 *   stampDarPreviewPdf(bytes, { signOffData, draftMetadata })  — legacy
 *   stampDarPreviewPdf(bytes, { dar, task, signatories })      — new Blueprint C
 *
 * @param {Uint8Array|ArrayBuffer} rawPdfBytes - MUST be non-empty pristine PDF bytes
 * @param {Object} options
 * @returns {Promise<Uint8Array>}
 */
export const stampDarPreviewPdf = async (rawPdfBytes, options = {}) => {
  // Zero Blank PDF guard — throw immediately rather than produce a white page
  if (!rawPdfBytes) {
    throw new Error('stampDarPreviewPdf: rawPdfBytes is null/undefined — ห้ามสร้างเอกสารเปล่า');
  }
  const byteLen = rawPdfBytes instanceof ArrayBuffer
    ? rawPdfBytes.byteLength
    : (ArrayBuffer.isView(rawPdfBytes) ? rawPdfBytes.byteLength : 0);
  if (byteLen === 0) {
    throw new Error('stampDarPreviewPdf: rawPdfBytes is empty (0 bytes) — ห้ามสร้างเอกสารเปล่า');
  }

  // Stamping Guard: Bypass Sign-off Matrix & Watermark for OBSOLETE Requests
  const dar = options.dar || {};
  const isObsoleteRequest = Boolean(
    dar.type === 'OBSOLETE' ||
    dar.action_type === 'OBSOLETE' ||
    dar.darType === 'OBSOLETE' ||
    dar.requestType === 'OBSOLETE' ||
    dar.type === 'CANCEL'
  );
  if (options.skipStamping || isObsoleteRequest) {
    return rawPdfBytes;
  }

  // Resolve signOffData — support both calling conventions
  let signOffData = options.signOffData || {};
  let draftMetadata = options.draftMetadata || {};

  // Blueprint C convention: { dar, task, signatories }
  if (options.signatories && !options.signOffData) {
    const sig = options.signatories;
    signOffData = {
      requester: sig.requester || {},
      reviewer:  sig.reviewer  || {},
      approver:  sig.approver  || {}
    };
    const d = options.dar || {};
    const t = options.task || {};
    draftMetadata = {
      darNo:     d.darNumber || d.darNo || d.id || t.darId,
      docCode:   d.docCode   || d.document_code || d.title,
      docTitle:  d.title     || d.name,
      timestamp: d.submittedAt || d.date || t.createdAt
    };
  }

  // Step 1: Stamp Signatory Matrix on the last page footer only (strictly 136pt at y=30)
  let stampedBytes = await stampDocumentLastPage(rawPdfBytes, signOffData);

  // Step 2: Stamp DRAFT watermark on ALL pages — exclusively, no other center watermark
  if (!isObsoleteRequest) {
    stampedBytes = await applyDraftWatermarkToPdf(stampedBytes, draftMetadata);
  }

  return stampedBytes;
};

/**
 * Blueprint C entry-point: accepts a raw Blob + { dar, task, signatories }
 * and returns a stamped Blob (not Uint8Array).
 *
 * ZERO BLANK PDF POLICY: throws if rawPdfBlob is missing or empty.
 *
 * @param {Blob} rawPdfBlob
 * @param {{ dar: Object, task: Object, signatories: Object }} options
 * @returns {Promise<Blob>}
 */
export const stampDarPreviewPdfFromBlob = async (rawPdfBlob, options = {}) => {
  if (!rawPdfBlob || !(rawPdfBlob instanceof Blob)) {
    throw new Error('stampDarPreviewPdfFromBlob: ต้องการ Blob จริงที่ไม่ว่างเปล่า — ห้ามสร้างเอกสารเปล่า');
  }
  if (rawPdfBlob.size === 0) {
    throw new Error('stampDarPreviewPdfFromBlob: Blob มีขนาด 0 bytes — ไม่พบไฟล์เอกสาร PDF ต้นฉบับ');
  }

  const dar = options.dar || {};
  const isObsoleteRequest = Boolean(
    dar.type === 'OBSOLETE' ||
    dar.action_type === 'OBSOLETE' ||
    dar.darType === 'OBSOLETE' ||
    dar.requestType === 'OBSOLETE' ||
    dar.type === 'CANCEL'
  );
  if (options.skipStamping || isObsoleteRequest) {
    return rawPdfBlob;
  }

  const rawBytes = await rawPdfBlob.arrayBuffer();
  const stampedBytes = await stampDarPreviewPdf(rawBytes, options);
  return new Blob([stampedBytes], { type: 'application/pdf' });
};

// ─── Progressive Signatory Resolver (re-export for convenience) ──────────────
export { resolveProgressiveSignatories } from './signatoryResolver';

/**
 * Blueprint B: Canvas Matrix Renderer — thin alias for generateSignOffStampImage
 * that accepts the { requester, reviewer, approver } shape produced by
 * resolveProgressiveSignatories (each entry has `isCompleted` flag).
 *
 * Blank cells (isCompleted: false) are rendered as white empty slots.
 *
 * @param {{ requester: Object, reviewer: Object, approver: Object }} signatories
 * @returns {Promise<string>} PNG data URL
 */
export const drawSignatoryMatrixCanvas = async ({ requester, reviewer, approver } = {}) => {
  // Map resolveProgressiveSignatories output shape → generateSignOffStampImage input shape
  const toStampCell = (cell) => {
    if (!cell) return { isCompleted: false, isPending: true, isSigned: false };
    const isSigned = cell.isSigned !== undefined 
      ? Boolean(cell.isSigned) 
      : Boolean(cell.isCompleted);
    return {
      name:           isSigned ? (cell.name || '') : '',
      position:       isSigned ? (cell.position || '') : '',
      date:           isSigned ? (cell.date || '') : '',
      timestamp:      isSigned ? (cell.date || '') : '',
      signatureImage: isSigned ? (cell.signatureImage || null) : null,
      signature:      isSigned ? (cell.signatureImage || null) : null,
      isCompleted:    isSigned,
      isSigned,
      isPending:      !isSigned,
      status:         isSigned ? 'COMPLETED' : 'PENDING'
    };
  };

  return generateSignOffStampImage({
    requester: toStampCell(requester),
    reviewer:  toStampCell(reviewer),
    approver:  toStampCell(approver)
  });
};

/**
 * Blueprint C: Unified Internal Document Stamping Engine
 * =========================================================
 * Single pipeline function for BOTH preview and download:
 *
 * 1. Resolves signatory data progressively via resolveProgressiveSignatories
 * 2. Stamps 3-column matrix (500×136 pt) on the FIRST page footer (y=30)
 *    — cells that are not yet completed render as clean white blank slots
 * 3. Stamps diagonal 45° watermark (TH Sarabun New) on ALL pages
 *
 * Returns a Blob so callers can create object URLs for both preview and download.
 * Preview and Download MUST share this exact same Blob — Zero Parity Gap.
 *
 * ZERO BLANK PDF POLICY: throws if rawPdfBlob is missing or empty.
 *
 * @param {Blob} rawPdfBlob - Pristine source PDF Blob (non-empty)
 * @param {{
 *   stage?: 'REVIEW'|'APPROVE'|'MASTER',
 *   dar?: Object,
 *   task?: Object,
 *   masterDoc?: Object,
 *   masterUsers?: Array,
 *   users?: Array,
 *   currentUser?: Object,
 *   watermarkType?: 'DRAFT'|'UNCONTROLLED'|'CONTROLLED',
 *   docInfo?: Object,
 *   userInfo?: Object
 * }} options
 * @returns {Promise<Blob>} Stamped PDF Blob
 */
export const stampUnifiedInternalPdf = async (rawPdfBlob, {
  stage        = 'REVIEW',
  dar          = null,
  task         = null,
  masterDoc    = null,
  masterUsers  = [],
  users        = [],
  currentUser  = null,
  watermarkType = 'DRAFT',
  docInfo      = {},
  userInfo     = {},
  skipStamping = false
} = {}) => {
  // Zero Blank PDF guard
  if (!rawPdfBlob || !(rawPdfBlob instanceof Blob)) {
    throw new Error('stampUnifiedInternalPdf: ต้องการ Blob จริงที่ไม่ว่างเปล่า — ห้ามสร้างเอกสารเปล่า');
  }
  if (rawPdfBlob.size === 0) {
    throw new Error('stampUnifiedInternalPdf: Blob มีขนาด 0 bytes — ไม่พบไฟล์เอกสาร PDF ต้นฉบับ');
  }

  // Stamping Guard: Bypass Sign-off Matrix & Watermark for OBSOLETE Requests
  const isObsoleteRequest = Boolean(
    dar?.type === 'OBSOLETE' ||
    dar?.action_type === 'OBSOLETE' ||
    dar?.darType === 'OBSOLETE' ||
    dar?.requestType === 'OBSOLETE' ||
    dar?.type === 'CANCEL'
  );
  if (skipStamping || isObsoleteRequest) {
    return rawPdfBlob;
  }

  // 1. Resolve progressive signatories
  const { resolveProgressiveSignatories: _resolve } = await import('./signatoryResolver');
  const signatories = _resolve({ dar, task, masterDoc, stage, masterUsers, users, currentUser });

  // 2. Load real PDF bytes
  const rawBytes = await rawPdfBlob.arrayBuffer();
  const pdfDoc   = await PDFDocument.load(rawBytes);
  const pages    = pdfDoc.getPages();
  if (pages.length === 0) return rawPdfBlob; // nothing to stamp

  // 3. Stamp 3-column signatory matrix on FIRST page footer
  const firstPage = pages[0];
  const { width: pageWidth } = firstPage.getSize();
  const MATRIX_WIDTH  = Math.min(500, pageWidth - 40);
  const MATRIX_HEIGHT = 136;
  const xPos = (pageWidth - MATRIX_WIDTH) / 2;
  const yPos = 30; // 30 pt from bottom edge of Page 1

  // White mask — covers exactly the footer rectangle to erase any underlying content
  firstPage.drawRectangle({
    x:      xPos,
    y:      yPos,
    width:  MATRIX_WIDTH,
    height: MATRIX_HEIGHT,
    color:  rgb(1, 1, 1),
    opacity: 1.0
  });

  // Render the matrix canvas using Blueprint B
  const matrixPngData = await drawSignatoryMatrixCanvas(signatories);
  const matrixImage   = await pdfDoc.embedPng(matrixPngData);
  firstPage.drawImage(matrixImage, {
    x:      xPos,
    y:      yPos,
    width:  MATRIX_WIDTH,
    height: MATRIX_HEIGHT
  });

  // 4. Stamp diagonal 45° watermark on ALL pages
  let watermarkPngData;
  let effectiveWatermarkType = watermarkType;
  if (isObsoleteRequest && effectiveWatermarkType === 'DRAFT') {
    effectiveWatermarkType = 'NONE';
  }

  if (effectiveWatermarkType === 'DRAFT') {
    // Use DRAFT watermark (existing engine — diagonal -35° red text)
    watermarkPngData = await generateDraftWatermarkImage({
      darNo:    dar?.darNumber || dar?.darNo || dar?.id,
      docCode:  docInfo.docCode || dar?.docCode || dar?.document_code || dar?.title,
      timestamp: dar?.submittedAt || dar?.date
    });
  } else if (effectiveWatermarkType !== 'NONE') {
    // Use UNCONTROLLED or CONTROLLED diagonal 45° canvas
    watermarkPngData = await generateDiagonalWatermarkCanvas({
      type: effectiveWatermarkType === 'CONTROLLED' ? 'CONTROLLED' : 'UNCONTROLLED',
      docInfo,
      userInfo
    });
  }

  if (watermarkPngData) {
    const watermarkImage = await pdfDoc.embedPng(watermarkPngData);
    for (const page of pages) {
      const { width, height } = page.getSize();
      
      // ปรับจาก 0.95 ลงมาเหลือ 0.52 (ประมาณ 310 pt บนหน้ากระดาษ A4 กว้าง 595 pt)
      const wmSize = Math.min(width, height) * 0.52;
      
      page.drawImage(watermarkImage, {
        x:      (width  - wmSize) / 2,
        y:      (height - wmSize) / 2,
        width:  wmSize,
        height: wmSize
      });
    }
  }

  const finalBytes = await pdfDoc.save();
  return new Blob([finalBytes], { type: 'application/pdf' });
};

/**
 * Stamping Guard & Entry Point:
 * Orchestrates document stamping for DAR workflows.
 * For OBSOLETE requests, bypasses all stamping and returns pristine raw PDF blob.
 *
 * @param {Blob} pdfBlob - Source PDF blob
 * @param {Object} dar - DAR request object
 * @param {Object} options - Stamping options (skipStamping, etc.)
 * @returns {Promise<Blob>}
 */
export async function stampPdfDocument(pdfBlob, dar, options = {}) {
  // หากเป็นคำร้อง OBSOLETE ให้ return ไฟล์ต้นทางกลับไปทันที ไม่วาดทับ
  const isObsoleteRequest = Boolean(
    dar?.type === 'OBSOLETE' || 
    dar?.action_type === 'OBSOLETE' || 
    dar?.darType === 'OBSOLETE' || 
    dar?.requestType === 'OBSOLETE' || 
    dar?.type === 'CANCEL'
  );

  if (options?.skipStamping || isObsoleteRequest) {
    return pdfBlob;
  }

  // ขั้นตอนการวาดตาราง Sign-off สำหรับ NEW / REVISION...
  return await stampUnifiedInternalPdf(pdfBlob, {
    dar,
    ...options
  });
}

/**
 * Universal System Sample Document Generator (ISO 9001 SOP/WI Template)
 * Creates a fully formatted QMS document with header box, control grid,
 * purpose & scope, role responsibility table, procedure steps, and quality verification matrix.
 * Guarantees that legacy test records without uploaded files NEVER render a blank white page.
 *
 * @param {string} docCode
 * @param {string} docTitle
 * @returns {Blob}
 */
export const getSystemSampleDocumentBlob = (docCode = 'SOP-QC-002', docTitle = 'Standard Operating Procedure for Quality Control') => {
  const safeTitle = (docTitle || 'Standard Operating Procedure').replace(/[()\\\\]/g, '');
  const safeCode = (docCode || 'SOP-QC-002').replace(/[()\\\\]/g, '');
  const streamContent = [
    '0.75 w 0.2 0.3 0.5 RG 30 160 535.28 650 re S',
    '0.92 0.95 0.98 rg 31 765 533.28 44 re f',
    'BT /F2 14 Tf 0.1 0.2 0.4 rg 45 790 Td (' + safeTitle + ') Tj ET',
    'BT /F1 9 Tf 0.3 0.3 0.3 rg 45 775 Td (ISO 9001:2015 Quality Management System Standard Document) Tj ET',
    '0.5 w 0.7 0.75 0.8 RG 40 710 515.28 45 re S',
    '40 732.5 m 555.28 732.5 l S',
    '170 710 m 170 755 l S',
    '300 710 m 300 755 l S',
    '430 710 m 430 755 l S',
    'BT /F2 8 Tf 0.4 0.4 0.4 rg 45 744 Td (DOC NO:) Tj /F2 9 Tf 0.1 0.1 0.1 rg 45 735 Td (' + safeCode + ') Tj ET',
    'BT /F2 8 Tf 0.4 0.4 0.4 rg 175 744 Td (REVISION:) Tj /F2 9 Tf 0.1 0.1 0.1 rg 175 735 Td (Rev. 00) Tj ET',
    'BT /F2 8 Tf 0.4 0.4 0.4 rg 305 744 Td (EFFECTIVE DATE:) Tj /F2 9 Tf 0.1 0.1 0.1 rg 305 735 Td (2026-03-01) Tj ET',
    'BT /F2 8 Tf 0.4 0.4 0.4 rg 435 744 Td (STATUS:) Tj /F2 9 Tf 0.1 0.5 0.2 rg 435 735 Td (UNDER REVIEW) Tj ET',
    'BT /F2 8 Tf 0.4 0.4 0.4 rg 45 721 Td (OWNER DEPT:) Tj /F1 9 Tf 0.1 0.1 0.1 rg 45 713 Td (Quality Assurance / QC) Tj ET',
    'BT /F2 8 Tf 0.4 0.4 0.4 rg 305 721 Td (SECURITY SCOPE:) Tj /F1 9 Tf 0.1 0.1 0.1 rg 305 713 Td (INTERNAL USE ONLY) Tj ET',
    'BT /F2 11 Tf 0.1 0.2 0.4 rg 40 685 Td (1. PURPOSE & SCOPE) Tj ET',
    'BT /F1 9 Tf 0.2 0.2 0.2 rg 40 670 Td (This procedure defines the operational criteria and inspection requirements for quality verification.) Tj ET',
    'BT /F1 9 Tf 0.2 0.2 0.2 rg 40 658 Td (Applicable across all manufacturing stages, packaging, and finished goods release.) Tj ET',
    'BT /F2 11 Tf 0.1 0.2 0.4 rg 40 635 Td (2. RESPONSIBILITIES & ROLES) Tj ET',
    '0.94 0.96 0.98 rg 40 605 515.28 15 re f',
    '0.5 w 0.75 0.8 0.85 RG 40 565 515.28 55 re S',
    '40 605 m 555.28 605 l S',
    '40 585 m 555.28 585 l S',
    '150 565 m 150 620 l S',
    '350 565 m 350 620 l S',
    'BT /F2 8.5 Tf 0.2 0.2 0.2 rg 45 609 Td (Role / Position) Tj ET',
    'BT /F2 8.5 Tf 0.2 0.2 0.2 rg 155 609 Td (Key Responsibility) Tj ET',
    'BT /F2 8.5 Tf 0.2 0.2 0.2 rg 355 609 Td (Authority / Competence) Tj ET',
    'BT /F1 8.5 Tf 0.2 0.2 0.2 rg 45 592 Td (Requester / Initiator) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 155 592 Td (Draft procedure, execute initial runs, verify accuracy) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 355 592 Td (Staff / Officer Level) Tj ET',
    'BT /F1 8.5 Tf 0.2 0.2 0.2 rg 45 572 Td (Reviewer / Supervisor) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 155 572 Td (Review compliance, verify resources, technical audit) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 355 572 Td (Section Head / Level 4+) Tj ET',
    'BT /F2 11 Tf 0.1 0.2 0.4 rg 40 540 Td (3. PROCEDURE & WORKFLOW REQUIREMENTS) Tj ET',
    'BT /F1 8.5 Tf 0.2 0.2 0.2 rg 45 525 Td (3.1 Document preparation must comply with QMS manual guidelines and customer specs.) Tj ET',
    'BT /F1 8.5 Tf 0.2 0.2 0.2 rg 45 513 Td (3.2 All process parameters must be recorded in approved inspection log sheets.) Tj ET',
    'BT /F1 8.5 Tf 0.2 0.2 0.2 rg 45 501 Td (3.3 Non-conformances require immediate containment and CAPA initiation.) Tj ET',
    'BT /F2 11 Tf 0.1 0.2 0.4 rg 40 475 Td (4. QUALITY VERIFICATION MATRIX) Tj ET',
    '0.94 0.96 0.98 rg 40 440 515.28 18 re f',
    '0.5 w 0.75 0.8 0.85 RG 40 355 515.28 103 re S',
    '40 440 m 555.28 440 l S',
    '40 410 m 555.28 410 l S',
    '40 380 m 555.28 380 l S',
    '75 355 m 75 458 l S',
    '220 355 m 220 458 l S',
    '370 355 m 370 458 l S',
    '460 355 m 460 458 l S',
    'BT /F2 8 Tf 0.2 0.2 0.2 rg 45 446 Td (Item) Tj ET',
    'BT /F2 8 Tf 0.2 0.2 0.2 rg 82 446 Td (Process Step) Tj ET',
    'BT /F2 8 Tf 0.2 0.2 0.2 rg 225 446 Td (Acceptance Criteria) Tj ET',
    'BT /F2 8 Tf 0.2 0.2 0.2 rg 375 446 Td (Responsible) Tj ET',
    'BT /F2 8 Tf 0.2 0.2 0.2 rg 465 446 Td (Frequency) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 53 422 Td (1) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 82 422 Td (Raw Material Receiving) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 225 422 Td (Visual check & COA verification) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 375 422 Td (QC Inspector) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 465 422 Td (Every Lot) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 53 392 Td (2) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 82 392 Td (In-Process Inspection) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 225 392 Td (Tolerance +/- 0.05 mm standard) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 375 392 Td (Line QC) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 465 392 Td (Hourly) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 53 364 Td (3) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 82 364 Td (Finished Goods Release) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 225 364 Td (100% functional test passed) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 375 364 Td (QA Supervisor) Tj ET',
    'BT /F1 8 Tf 0.2 0.2 0.2 rg 465 364 Td (Per Batch) Tj ET',
    'BT /F1 7.5 Tf 0.5 0.5 0.5 rg 40 165 Td (Note: Official approval signatory matrix below is verified and stamped progressively by QMS Portal.) Tj ET'
  ].join('\n');

  const encoder = new TextEncoder();
  const streamBytes = encoder.encode(streamContent);
  const streamLen = streamBytes.length;

  let pdf = '%PDF-1.4\n';
  const offsets = [];

  offsets.push(pdf.length);
  pdf += '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';

  offsets.push(pdf.length);
  pdf += '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';

  offsets.push(pdf.length);
  pdf += '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>\nendobj\n';

  offsets.push(pdf.length);
  pdf += '4 0 obj\n<< /Length ' + streamLen + ' >>\nstream\n' + streamContent + '\nendstream\nendobj\n';

  offsets.push(pdf.length);
  pdf += '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';

  offsets.push(pdf.length);
  pdf += '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n';

  const startxref = pdf.length;
  pdf += 'xref\n0 7\n0000000000 65535 f \n';
  for (const off of offsets) {
    pdf += String(off).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += 'trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n' + startxref + '\n%%EOF';

  const fullBytes = encoder.encode(pdf);
  return new Blob([fullBytes], { type: 'application/pdf' });
};

/**
 * Re-export applySupersededWatermark for backward compatibility and uniform access
 */
export const applySupersededWatermark = async (rawPdfFile, options = {}) => {
  const { applySupersededWatermark: stamper } = await import('../services/UniversalWatermarkService');
  return await stamper(rawPdfFile, options);
};
