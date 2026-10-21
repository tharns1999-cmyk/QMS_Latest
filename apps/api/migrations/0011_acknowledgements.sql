-- People the requester wants to read and acknowledge the document once it is in force (JSON array of user ids).
ALTER TABLE dars ADD COLUMN ack_user_ids TEXT;

-- One row per person per published revision, created when the revision takes effect.
CREATE TABLE acknowledgements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dar_id INTEGER NOT NULL REFERENCES dars(id),
  document_id TEXT NOT NULL REFERENCES documents(id),
  doc_code TEXT NOT NULL,
  revision TEXT,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACKNOWLEDGED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  acknowledged_at TEXT,
  UNIQUE (dar_id, user_id)
);
CREATE INDEX acknowledgements_user ON acknowledgements (user_id, status);
