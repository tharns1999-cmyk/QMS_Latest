const { PDFDocument, rgb, degrees, StandardFonts } = require('pdf-lib');

class PdfStamper {
  
  /**
   * Stamps the given PDF buffer as "UNCONTROLLED WHEN PRINTED"
   * @param {Buffer|Uint8Array} pdfBuffer - Original PDF Buffer
   * @param {Object} options - { docType, docCode, docVersion }
   * @returns {Promise<Uint8Array>} - Modified PDF Buffer
   */
  static async stampUncontrolled(pdfBuffer, options = {}) {
    const { docType } = options;
    
    // Blank Form FM Bypass: Forms in active use do not get stamped
    if (docType && (docType === 'FM' || docType.startsWith('FM') || docType === 'FORM')) {
      return pdfBuffer;
    }

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();

    for (const page of pages) {
      const { width, height } = page.getSize();
      const cx = width / 2;
      const cy = height / 2;

      const lines = [
        { text: 'UNCONTROLLED COPY', size: 30 },
        { text: 'FOR REFERENCE ONLY (INTERNAL)', size: 15 },
        { text: `Doc: ${options.docCode || 'DOC-001'} | Ver: Rev.${options.docVersion || '01'}`, size: 14 }
      ];

      const theta = Math.PI / 4; // 45 degrees
      const cosTheta = Math.cos(theta);
      const sinTheta = Math.sin(theta);
      const lineSpacings = lines.map(l => l.size * 1.35);

      let totalStackHeight = 0;
      for (let i = 0; i < lineSpacings.length - 1; i++) {
        totalStackHeight += lineSpacings[i];
      }

      let accumulatedOffset = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const textWidth = font.widthOfTextAtSize(line.text, line.size);
        const u = -textWidth / 2;
        const v = (totalStackHeight / 2) - accumulatedOffset;

        const x = cx + (u * cosTheta) - (v * sinTheta);
        const y = cy + (u * sinTheta) + (v * cosTheta);

        page.drawText(line.text, {
          x,
          y,
          size: line.size,
          font: font,
          color: rgb(0.80, 0.35, 0.10), // Dark Orange
          opacity: 0.65,
          rotate: degrees(45),
        });

        accumulatedOffset += lineSpacings[i];
      }
    }

    return await pdfDoc.save();
  }

  /**
   * Stamps the given PDF buffer with Controlled Copy information
   * @param {Buffer|Uint8Array} pdfBuffer - Original PDF Buffer
   * @param {Object} options - { ccNumber, department, issueNumber, docType, docCode, docVersion }
   * @returns {Promise<Uint8Array>} - Modified PDF Buffer
   */
  static async stampControlled(pdfBuffer, options = {}) {
    const { ccNumber, department, issueNumber, docType, docCode, docVersion } = options;
    
    // Zero Internal Watermark for Forms
    if (docType && (docType === 'FM' || docType.startsWith('FM') || docType === 'FORM')) {
      return pdfBuffer;
    }

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();

    for (const page of pages) {
      const { width, height } = page.getSize();
      const cx = width / 2;
      const cy = height / 2;

      const lines = [
        { text: 'CONTROLLED COPY', size: 30 },
        { text: `Doc: ${docCode || 'DOC-001'} | Ver: Rev.${docVersion || '01'}`, size: 15 },
        { text: `Copy No: ${ccNumber || '01'} | Issue: ${issueNumber || '01'}`, size: 14 },
        { text: `Dept: ${department || 'PD'}`, size: 13 }
      ];

      const theta = Math.PI / 4;
      const cosTheta = Math.cos(theta);
      const sinTheta = Math.sin(theta);
      const lineSpacings = lines.map(l => l.size * 1.35);

      let totalStackHeight = 0;
      for (let i = 0; i < lineSpacings.length - 1; i++) {
        totalStackHeight += lineSpacings[i];
      }

      let accumulatedOffset = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const textWidth = font.widthOfTextAtSize(line.text, line.size);
        const u = -textWidth / 2;
        const v = (totalStackHeight / 2) - accumulatedOffset;

        const x = cx + (u * cosTheta) - (v * sinTheta);
        const y = cy + (u * sinTheta) + (v * cosTheta);

        page.drawText(line.text, {
          x,
          y,
          size: line.size,
          font: font,
          color: rgb(0.05, 0.60, 0.30), // Emerald Green
          opacity: 0.65,
          rotate: degrees(45)
        });

        accumulatedOffset += lineSpacings[i];
      }
    }

    return await pdfDoc.save();
  }
}

module.exports = PdfStamper;
