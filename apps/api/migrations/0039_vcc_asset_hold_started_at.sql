-- Migration 0039: record the real start of an ON_HOLD episode so escalation counts from it
-- (not from work-order updated_at, which changes on any edit).
ALTER TABLE vcc_assets ADD COLUMN hold_started_at TEXT;

-- Backfill assets already ON_HOLD: earliest open FAIL result, else last asset update.
UPDATE vcc_assets
SET hold_started_at = COALESCE(
  (SELECT MIN(w.performed_at) FROM vcc_work_orders w
    WHERE w.asset_id = vcc_assets.id AND w.result_status = 'FAIL' AND w.nc_status = 'OPEN'),
  updated_at
)
WHERE status = 'ON_HOLD' AND hold_started_at IS NULL;
