

class CcNumberService {
  constructor(pool) {
    this.pool = pool;
  }

  // Helper to extract the highest number
  _extractMaxSeq(existingNumbers, prefix) {
    let maxSeq = 0;
    for (const numStr of existingNumbers) {
      if (numStr.startsWith(prefix)) {
        const seqStr = numStr.replace(prefix, '');
        const seq = parseInt(seqStr, 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }
    return maxSeq;
  }

  async previewCcNumbers(documentId, departmentId, quantity) {
    // Note: Preview does not lock, it just queries the current max
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT s.cc_number 
        FROM controlled_copy_slots s
        JOIN document_distributions d ON s.distribution_id = d.id
        WHERE d.document_id = $1 AND d.department_id = $2
      `;
      const res = await client.query(query, [documentId, departmentId]);
      
      const existingNumbers = res.rows.map(row => row.cc_number);
      // Usually CC-XXX or CC-[Dept]-XXX. Let's use CC- for simplicity or could be dynamic.
      const prefix = `CC-`; 
      
      let currentMax = this._extractMaxSeq(existingNumbers, prefix);
      
      const previews = [];
      for (let i = 0; i < quantity; i++) {
        currentMax++;
        previews.push(`${prefix}${String(currentMax).padStart(3, '0')}`);
      }
      
      return previews;
    } finally {
      client.release();
    }
  }

  async allocateCcNumbers(documentId, departmentId, copyType, quantity) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // 1. Get or create the distribution with an exclusive lock
      // Lock the distribution row. If it doesn't exist, create it and lock it implicitly.
      let distRes = await client.query(
        `SELECT id FROM document_distributions 
         WHERE document_id = $1 AND department_id = $2 FOR UPDATE`,
        [documentId, departmentId]
      );
      
      let distributionId;
      if (distRes.rows.length === 0) {
        distRes = await client.query(
          `INSERT INTO document_distributions (document_id, department_id) 
           VALUES ($1, $2) RETURNING id`,
          [documentId, departmentId]
        );
      }
      distributionId = distRes.rows[0].id;
      
      // 2. Query existing CC numbers for this distribution
      const existingRes = await client.query(
        `SELECT cc_number FROM controlled_copy_slots WHERE distribution_id = $1`,
        [distributionId]
      );
      const existingNumbers = existingRes.rows.map(r => r.cc_number);
      const prefix = `CC-`;
      
      let currentMax = this._extractMaxSeq(existingNumbers, prefix);
      
      const allocatedNumbers = [];
      // 3. Allocate new slots
      for (let i = 0; i < quantity; i++) {
        currentMax++;
        const ccNumber = `${prefix}${String(currentMax).padStart(3, '0')}`;
        allocatedNumbers.push(ccNumber);
        
        await client.query(
          `INSERT INTO controlled_copy_slots (distribution_id, copy_type, cc_number) 
           VALUES ($1, $2, $3)`,
          [distributionId, copyType, ccNumber]
        );
      }

      await client.query('COMMIT');
      return allocatedNumbers;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = CcNumberService;
