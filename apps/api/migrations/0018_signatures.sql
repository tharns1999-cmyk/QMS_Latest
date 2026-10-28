-- Each person's e-signature image, kept on the server so every browser stamps the same one.
-- Document types and SLA days live in the settings table as JSON (keys document_types, sla_settings); nothing is fixed in code.
CREATE TABLE user_signatures (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  signature_type TEXT NOT NULL CHECK (signature_type IN ('DRAWN', 'IMAGE', 'TYPOGRAPHIC')),
  signature_style TEXT,
  initials TEXT,
  image TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT
);
