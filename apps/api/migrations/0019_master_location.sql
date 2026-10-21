-- Each department's main place (where Copy 01 of its documents is kept) is chosen by the DCC, not invented by the app.
ALTER TABLE distribution_locations ADD COLUMN is_master INTEGER NOT NULL DEFAULT 0;
-- Existing departments start with their first-created place as the main one; the DCC can change it.
UPDATE distribution_locations SET is_master = 1
WHERE status = 'ACTIVE' AND rowid IN (SELECT min(rowid) FROM distribution_locations WHERE status = 'ACTIVE' GROUP BY department);
