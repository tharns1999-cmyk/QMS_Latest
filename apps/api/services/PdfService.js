const PdfStamper = require('../utils/PdfStamper');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

class PdfService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Helper to mock fetching an original document.
   * In a real application, this would download from S3 or read from filesystem.
   */
  async _fetchOriginalPdf(documentId) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    page.drawText(`Original Document Content for ${documentId}`, {
      x: 50,
      y: 750,
      size: 20,
      font: font,
      color: rgb(0, 0, 0),
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  /**
   * Generates an uncontrolled copy for general printing
   */
  async printUncontrolled(documentId) {
    // 1. Fetch original PDF
    const originalPdfBuffer = await this._fetchOriginalPdf(documentId);
    
    // 2. Stamp with uncontrolled watermark
    const stampedBuffer = await PdfStamper.stampUncontrolled(originalPdfBuffer);
    
    return stampedBuffer;
  }

  /**
   * Generates a controlled copy, registers it in the DB, and stamps it
   */
  async issueControlledCopy(documentId, slotId, ccNumber, department) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // 1. Validate the slot exists and belongs to this department/doc
      // In a full implementation, we'd query the DB to ensure slotId matches ccNumber and department
      
      // 2. Insert into controlled_copy_instances
      const insertQuery = `
        INSERT INTO controlled_copy_instances (slot_id, status, issue_number)
        VALUES ($1, 'GENERATED', '01')
        RETURNING id;
      `;
      const result = await client.query(insertQuery, [slotId]);
      const instanceId = result.rows[0].id;

      // 3. Fetch original PDF
      const originalPdfBuffer = await this._fetchOriginalPdf(documentId);

      // 4. Stamp PDF
      const issueNumber = '01'; 
      const stampedBuffer = await PdfStamper.stampControlled(originalPdfBuffer, {
        ccNumber,
        department,
        issueNumber
      });

      await client.query('COMMIT');
      
      return {
        instanceId,
        stampedBuffer
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = PdfService;
