-- Document Action Requests: PENDING_REVIEW -> PENDING_APPROVAL -> PENDING_DCC -> COMPLETED, or REJECTED at review/approval.
CREATE TABLE dars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('NEW', 'REVISION', 'OBSOLETE')),
  doc_code TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  department TEXT NOT NULL,
  revision TEXT,
  name TEXT NOT NULL,
  access_scope TEXT NOT NULL DEFAULT 'DEPT' CHECK (access_scope IN ('GENERAL', 'DEPT')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
    CHECK (status IN ('PENDING_REVIEW', 'PENDING_APPROVAL', 'PENDING_DCC', 'COMPLETED', 'REJECTED')),
  requester_id TEXT NOT NULL REFERENCES users(id),
  reviewer_id TEXT NOT NULL REFERENCES users(id),
  approver_id TEXT NOT NULL REFERENCES users(id),
  reviewed_at TEXT,
  approved_at TEXT,
  completed_at TEXT,
  reject_comment TEXT,
  document_id TEXT REFERENCES documents(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A document is locked while one DAR on it is in flight.
CREATE UNIQUE INDEX dars_one_in_flight ON dars (doc_code) WHERE status IN ('PENDING_REVIEW', 'PENDING_APPROVAL', 'PENDING_DCC');
CREATE INDEX dars_status ON dars (status);
