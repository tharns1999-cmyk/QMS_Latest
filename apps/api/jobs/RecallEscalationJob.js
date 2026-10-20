const cron = require('node-cron');

class RecallEscalationJob {
  constructor(dbPool) {
    this.pool = dbPool;
    this.job = null;
  }

  // Run every day at 8:00 AM by default
  start(schedule = '0 8 * * *') {
    if (this.job) {
      console.log('RecallEscalationJob is already running.');
      return;
    }

    console.log(`Starting RecallEscalationJob with schedule: ${schedule}`);
    this.job = cron.schedule(schedule, async () => {
      console.log('Running RecallEscalationJob...');
      try {
        await this.processEscalations();
      } catch (error) {
        console.error('Error running RecallEscalationJob:', error);
      }
    });
  }

  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('RecallEscalationJob stopped.');
    }
  }

  async processEscalations() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Find recalls that are PENDING_RETURN and older than 7 days
      // In a real system, you might use 7 days. For testing, we'll use 1 day or just mock it.
      const query = `
        SELECT 
          cr.id as recall_id,
          rc.superseded_doc_id,
          dd.department_id,
          dd.custodian_name,
          cr.recalled_at
        FROM controlled_copy_recalls cr
        JOIN recall_campaigns rc ON cr.campaign_id = rc.id
        JOIN controlled_copy_instances cci ON cr.instance_id = cci.id
        JOIN controlled_copy_slots ccs ON cci.slot_id = ccs.id
        JOIN document_distributions dd ON ccs.distribution_id = dd.id
        WHERE cr.status = 'PENDING_RETURN'
        AND cr.recalled_at < NOW() - INTERVAL '7 days'
      `;

      const { rows } = await client.query(query);

      if (rows.length === 0) {
        console.log('No overdue recalls found for escalation.');
        await client.query('COMMIT');
        return;
      }

      console.log(`Found ${rows.length} overdue recalls. Triggering escalations...`);

      for (const row of rows) {
        // Mock finding the manager of the department
        // In reality, this would query the users table for role/level logic
        const managerTitle = `Manager of ${row.department_id}`;
        
        // Mock sending email/notification
        console.log(`[ESCALATION] Alerting ${managerTitle}: Custodian ${row.custodian_name || 'Unknown'} in ${row.department_id} has not returned CC for ${row.superseded_doc_id}. Overdue since ${row.recalled_at}`);
        
        // Optionally update the recall record to mark that it was escalated to avoid spamming every day,
        // or just let it spam every day until returned. We'll leave it as daily spam for now as per typical escalation logic.
      }

      await client.query('COMMIT');
      console.log('RecallEscalationJob completed successfully.');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = RecallEscalationJob;
