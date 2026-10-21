-- Force a new password after an admin sets the first one; tokens issued before a password change stop working.
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN password_changed_at INTEGER NOT NULL DEFAULT 0;

-- The login rate limit and audit exports filter on action and time.
CREATE INDEX audit_log_action_at ON audit_log (action, at);

-- The audit trail is append-only in the database itself, not only by convention in the API.
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
