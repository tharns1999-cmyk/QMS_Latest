const PdfStamper = require('../utils/PdfStamper');
const PdfService = require('./PdfService');

class ReplacementService {
  constructor(pool, pdfService) {
    this.pool = pool;
    this.pdfService = pdfService || new PdfService(pool);
  }

  /**
   * Replaces a damaged or lost instance.
   * @param {string} documentId 
   * @param {string} oldInstanceId 
   * @param {string} reasonType - 'DAMAGED' or 'LOST'
   * @param {string} reasonText 
   */
  async replaceInstance(documentId, oldInstanceId, reasonType, reasonText) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // 1. Fetch old instance
      const fetchOldQuery = `
        SELECT cci.slot_id, cci.issue_number, ccs.cc_number, ccs.distribution_id, dd.department_id
        FROM controlled_copy_instances cci
        JOIN controlled_copy_slots ccs ON cci.slot_id = ccs.id
        JOIN document_distributions dd ON ccs.distribution_id = dd.id
        WHERE cci.id = $1
      `;
      const oldRes = await client.query(fetchOldQuery, [oldInstanceId]);
      
      if (oldRes.rowCount === 0) {
        throw new Error('Instance not found');
      }

      const oldData = oldRes.rows[0];

      // 2. Mark old instance as DAMAGED or LOST
      const updateOldQuery = `
        UPDATE controlled_copy_instances
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `;
      await client.query(updateOldQuery, [reasonType, oldInstanceId]);

      // 3. Calculate new issue number
      // issue_number is like '01', '02', '10'.
      // Get the max issue_number for this slot to ensure we always increment correctly
      const maxIssueQuery = `
        SELECT MAX(issue_number) as max_issue
        FROM controlled_copy_instances
        WHERE slot_id = $1
      `;
      const maxRes = await client.query(maxIssueQuery, [oldData.slot_id]);
      const maxIssue = maxRes.rows[0].max_issue || '01';
      
      const currentIssueInt = parseInt(maxIssue, 10);
      const nextIssueInt = currentIssueInt + 1;
      const nextIssueStr = nextIssueInt.toString().padStart(2, '0'); // '02'

      // 4. Create new instance
      const insertQuery = `
        INSERT INTO controlled_copy_instances (slot_id, status, issue_number)
        VALUES ($1, 'GENERATED', $2)
        RETURNING id;
      `;
      const insertRes = await client.query(insertQuery, [oldData.slot_id, nextIssueStr]);
      const newInstanceId = insertRes.rows[0].id;

      // 5. Generate new PDF
      const originalPdfBuffer = await this.pdfService._fetchOriginalPdf(documentId);
      const stampedBuffer = await PdfStamper.stampControlled(originalPdfBuffer, {
        ccNumber: oldData.cc_number,
        department: oldData.department_id,
        issueNumber: nextIssueStr
      });

      // Optionally: Log the recall/replacement reason in controlled_copy_recalls
      const insertRecallQuery = `
        INSERT INTO controlled_copy_recalls (instance_id, recalled_by_user_id, recall_reason, status)
        VALUES ($1, 'SYSTEM', $2, 'PENDING_RETURN')
      `;
      await client.query(insertRecallQuery, [oldInstanceId, reasonText]);

      await client.query('COMMIT');

      return {
        newInstanceId,
        stampedBuffer,
        ccNumber: oldData.cc_number,
        department: oldData.department_id
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = ReplacementService;
