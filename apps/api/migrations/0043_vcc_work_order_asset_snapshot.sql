-- Preserve the instrument identity accepted by the reviewer. Legacy records remain explicitly unsnapshotted.
ALTER TABLE vcc_work_orders ADD COLUMN asset_snapshot TEXT
  CHECK (asset_snapshot IS NULL OR json_valid(asset_snapshot));

CREATE TRIGGER trg_vcc_closed_asset_snapshot_immutable
BEFORE UPDATE OF asset_snapshot ON vcc_work_orders
WHEN OLD.status = 'CLOSED' AND OLD.asset_snapshot IS NOT NULL
  AND NEW.asset_snapshot IS NOT OLD.asset_snapshot
BEGIN
  SELECT RAISE(ABORT, 'Cannot alter the accepted instrument snapshot of a CLOSED work order.');
END;
