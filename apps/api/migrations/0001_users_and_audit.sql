-- Users who can sign in. departments is a JSON array of department codes (primary included).
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  emp_id TEXT UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'GENERAL_USER',
  approval_level INTEGER NOT NULL DEFAULT 1,
  primary_department TEXT NOT NULL,
  departments TEXT NOT NULL DEFAULT '[]',
  is_dcc INTEGER NOT NULL DEFAULT 0,
  is_qmr INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  failed_logins INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Append-only audit trail (ISO 9001 7.5.3); the API never updates or deletes rows.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actor_id TEXT,
  action TEXT NOT NULL,
  details TEXT
);
