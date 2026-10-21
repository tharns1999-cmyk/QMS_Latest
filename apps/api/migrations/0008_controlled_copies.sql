-- Where the requester wants printed controlled copies (JSON array of {department, location_id, location_name}); copy 01 is the owner's office.
ALTER TABLE dars ADD COLUMN distributions TEXT;

-- One printed controlled copy (ISO 9001 7.5.3): issued when its revision takes effect, dispatched by DCC, received by the
-- department, recalled when the revision is superseded or obsoleted. VOID = never dispatched before it was superseded.
CREATE TABLE controlled_copies (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  doc_code TEXT NOT NULL,
  revision TEXT NOT NULL,
  copy_no TEXT NOT NULL,
  department TEXT NOT NULL,
  location_id TEXT,
  location_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_ISSUE'
    CHECK (status IN ('PENDING_ISSUE', 'DISPATCHED_PENDING_RECEIPT', 'ISSUED_ACTIVE', 'PENDING_RECALL', 'RECALLED', 'VOID')),
  issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  dispatched_at TEXT,
  dispatched_by TEXT REFERENCES users(id),
  received_at TEXT,
  received_by TEXT REFERENCES users(id),
  recalled_at TEXT,
  recalled_by TEXT REFERENCES users(id),
  UNIQUE (doc_code, revision, copy_no)
);
CREATE INDEX controlled_copies_status ON controlled_copies (status);
