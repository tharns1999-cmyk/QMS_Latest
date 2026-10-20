class RecallService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Generates a bulk recall campaign for all active physical copies of a superseded document.
   * @param {string} supersededDocId 
   * @param {string} newDocId 
   */
  async generateRecallCampaign(supersededDocId, newDocId) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Create Campaign
      const createCampaignQuery = `
        INSERT INTO recall_campaigns (superseded_doc_id, new_doc_id, status)
        VALUES ($1, $2, 'ACTIVE')
        RETURNING id;
      `;
      const campaignRes = await client.query(createCampaignQuery, [supersededDocId, newDocId]);
      const campaignId = campaignRes.rows[0].id;

      // 2. Find active copies
      // Since document_id in DB is UUID, but in our mock it might be string, we assume type coercion or standard matching works
      const findInstancesQuery = `
        SELECT cci.id, dd.department_id, dd.custodian_name
        FROM controlled_copy_instances cci
        JOIN controlled_copy_slots ccs ON cci.slot_id = ccs.id
        JOIN document_distributions dd ON ccs.distribution_id = dd.id
        WHERE dd.document_id = $1 
          AND cci.status IN ('GENERATED', 'DISTRIBUTED')
      `;
      const instancesRes = await client.query(findInstancesQuery, [supersededDocId]);
      const instances = instancesRes.rows;

      // 3. Create recall items (controlled_copy_recalls)
      if (instances.length > 0) {
        // Build values for bulk insert: ($1, 'SYSTEM', 'SUPERSEDED_BY_NEW_REV', 'PENDING_RETURN', $2)
        const insertItemsValues = [];
        const insertItemsParams = [];
        let paramIndex = 1;

        instances.forEach(inst => {
          insertItemsValues.push(`($${paramIndex++}, 'SYSTEM', 'SUPERSEDED_BY_NEW_REV', 'PENDING_RETURN', $${paramIndex++})`);
          insertItemsParams.push(inst.id, campaignId);
        });

        const insertItemsQuery = `
          INSERT INTO controlled_copy_recalls (instance_id, recalled_by_user_id, recall_reason, status, campaign_id)
          VALUES ${insertItemsValues.join(', ')}
        `;
        await client.query(insertItemsQuery, insertItemsParams);
      }

      await client.query('COMMIT');

      // 4. Mock sending notifications
      instances.forEach(inst => {
        console.log(`[Notification MOCK] Sent to Custodian: ${inst.custodian_name || inst.department_id} - Please return physical copy for document ${supersededDocId} (New revision ${newDocId} is now effective).`);
      });

      return {
        campaignId,
        itemsRecalled: instances.length
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('generateRecallCampaign Error:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = RecallService;
