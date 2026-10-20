-- Document register: one row per revision. Rows are created by the DAR flow, never edited in place.
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  doc_code TEXT NOT NULL,
  revision TEXT NOT NULL,
  name TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  department TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('EFFECTIVE', 'SUPERSEDED', 'OBSOLETE')),
  access_scope TEXT NOT NULL DEFAULT 'DEPT' CHECK (access_scope IN ('GENERAL', 'DEPT')),
  owner_id TEXT REFERENCES users(id),
  effective_date TEXT,
  review_cycle_months INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (doc_code, revision)
);

-- Only one revision of a document may be in force at a time.
CREATE UNIQUE INDEX documents_one_effective ON documents (doc_code) WHERE status = 'EFFECTIVE';
CREATE INDEX documents_status ON documents (status, doc_code);
