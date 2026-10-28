-- Controlled copies after issue: extra copies, damaged/lost with a replacement, relocation and return.
-- SQLite cannot change a CHECK constraint or a UNIQUE key in place, so the table is rebuilt (nothing references it).
-- A replacement keeps the copy number and takes the next issue number, so the key now includes issue_no.
CREATE TABLE controlled_copies_new (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  doc_code TEXT NOT NULL,
  revision TEXT NOT NULL,
  copy_no TEXT NOT NULL,
  issue_no INTEGER NOT NULL DEFAULT 1,
  department TEXT NOT NULL,
  location_id TEXT,
  location_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_ISSUE'
    CHECK (status IN ('PENDING_ISSUE', 'DISPATCHED_PENDING_RECEIPT', 'ISSUED_ACTIVE', 'PENDING_RECALL', 'RECALLED', 'VOID',
      'LOST', 'RELOCATION_PENDING_APPROVAL', 'RETURN_PENDING_APPROVAL')),
  -- ISSUE: with the revision. ADDITIONAL: a department asked for another copy. REPLACEMENT: stands in for a damaged or lost copy.
  origin TEXT NOT NULL DEFAULT 'ISSUE' CHECK (origin IN ('ISSUE', 'ADDITIONAL', 'REPLACEMENT')),
  replaces_id TEXT,
  report_kind TEXT CHECK (report_kind IN ('DAMAGED', 'LOST')),
  -- Why the current request (extra copy, damage report, relocation, return) was made, and by whom.
  request_reason TEXT,
  requested_by TEXT REFERENCES users(id),
  requested_at TEXT,
  new_department TEXT,
  new_location_id TEXT,
  new_location_name TEXT,
  return_date TEXT,
  decision_note TEXT,
  decided_by TEXT REFERENCES users(id),
  decided_at TEXT,
  issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  dispatched_at TEXT,
  dispatched_by TEXT REFERENCES users(id),
  received_at TEXT,
  received_by TEXT REFERENCES users(id),
  recalled_at TEXT,
  recalled_by TEXT REFERENCES users(id),
  UNIQUE (doc_code, revision, copy_no, issue_no)
);

INSERT INTO controlled_copies_new (id, document_id, doc_code, revision, copy_no, department, location_id, location_name, status, issued_at,
    dispatched_at, dispatched_by, received_at, received_by, recalled_at, recalled_by)
  SELECT id, document_id, doc_code, revision, copy_no, department, location_id, location_name, status, issued_at,
    dispatched_at, dispatched_by, received_at, received_by, recalled_at, recalled_by FROM controlled_copies;

DROP TABLE controlled_copies;
ALTER TABLE controlled_copies_new RENAME TO controlled_copies;
CREATE INDEX controlled_copies_status ON controlled_copies (status);
