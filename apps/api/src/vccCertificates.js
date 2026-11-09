// A later accepted calibration replaces an earlier one, even when its validity is shorter or unknown.
export const loadLatestAcceptedCertificates = async (db, scope = null) => {
  const { results } = await db.prepare(`
    SELECT a.id AS asset_id, a.asset_code, a.name AS asset_name, a.department,
      wo.id AS wo_id, wo.certificate_no, wo.certificate_valid_until, wo.performed_at
    FROM vcc_assets a
    JOIN vcc_work_orders wo ON wo.id = (
      SELECT latest.id FROM vcc_work_orders latest
      WHERE latest.asset_id = a.id AND latest.status = 'CLOSED' AND latest.result_status = 'PASS'
      ORDER BY latest.performed_at DESC, latest.reviewed_at DESC, latest.created_at DESC, latest.id DESC
      LIMIT 1
    )
    WHERE a.status != 'RETIRED' AND wo.certificate_valid_until IS NOT NULL
      ${scope ? `AND (${scope.sql})` : ''}
  `).bind(...(scope?.args || [])).all();
  return results || [];
};
