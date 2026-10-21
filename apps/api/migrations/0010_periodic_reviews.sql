-- Periodic review of a document in force (ISO 9001 7.5.3): the owner department confirms it is still right, or asks to revise or withdraw it.
-- NO_CHANGE needs an approver (unless the reviewer already holds approver rights) and only then moves the next review date.
-- REVISION_REQUIRED / OBSOLETE wait (AWAITING_ACTION) for the DAR that follows.
CREATE TABLE periodic_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL REFERENCES documents(id),
  doc_code TEXT NOT NULL,
  revision TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('NO_CHANGE', 'REVISION_REQUIRED', 'OBSOLETE')),
  status TEXT NOT NULL CHECK (status IN ('PENDING_APPROVAL', 'AWAITING_ACTION', 'COMPLETED', 'REJECTED', 'CANCELLED')),
  reason TEXT NOT NULL,
  details TEXT,
  reviewer_id TEXT NOT NULL REFERENCES users(id),
  approver_id TEXT REFERENCES users(id),
  fast_track INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,
  new_next_review_date TEXT,
  decision_comment TEXT,
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  decided_at TEXT
);

-- A document has at most one review in flight.
CREATE UNIQUE INDEX periodic_reviews_one_open ON periodic_reviews (document_id) WHERE status IN ('PENDING_APPROVAL', 'AWAITING_ACTION');
CREATE INDEX periodic_reviews_approver ON periodic_reviews (approver_id, status);

ALTER TABLE documents ADD COLUMN last_reviewed_at TEXT;

-- Documents published before reviews existed had no cycle: WI and FM every 24 months, everything else every 12.
UPDATE documents SET review_cycle_months = CASE WHEN doc_type IN ('WI', 'FM') THEN 24 ELSE 12 END WHERE review_cycle_months IS NULL;
UPDATE documents SET next_review_date = date(COALESCE(effective_date, substr(created_at, 1, 10)), '+' || review_cycle_months || ' months') WHERE next_review_date IS NULL;
