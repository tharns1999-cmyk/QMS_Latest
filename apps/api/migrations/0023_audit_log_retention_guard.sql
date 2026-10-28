-- Audit rows may now leave the database, but only after 365 days and only through scripts/audit-archive.js,
-- which exports them to a checksummed file first. Younger rows stay undeletable, and no row can ever be edited.
DROP TRIGGER audit_log_no_delete;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
WHEN OLD.at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-365 days')
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only: rows can be removed only after 365 days'); END;
