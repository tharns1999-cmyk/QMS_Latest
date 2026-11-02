-- VCC Phase 3.2: Calibration Execution & Digital Records Foundation (Milestone M1)
-- 1. Expands vcc_work_orders with digital execution, certificate metadata, traceability and amendment fields
ALTER TABLE vcc_work_orders ADD COLUMN certificate_file_key TEXT;
ALTER TABLE vcc_work_orders ADD COLUMN certificate_file_name TEXT;
ALTER TABLE vcc_work_orders ADD COLUMN certificate_file_size INTEGER;
ALTER TABLE vcc_work_orders ADD COLUMN certificate_file_hash TEXT;
ALTER TABLE vcc_work_orders ADD COLUMN certificate_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE vcc_work_orders ADD COLUMN certificate_uploaded_at TEXT;
ALTER TABLE vcc_work_orders ADD COLUMN certificate_uploaded_by TEXT REFERENCES users(id);
ALTER TABLE vcc_work_orders ADD COLUMN certificate_issue_date TEXT;
ALTER TABLE vcc_work_orders ADD COLUMN certificate_valid_until TEXT;
ALTER TABLE vcc_work_orders ADD COLUMN calibration_provider_name TEXT;
ALTER TABLE vcc_work_orders ADD COLUMN calibration_method TEXT;
ALTER TABLE vcc_work_orders ADD COLUMN traceability_ref TEXT;
ALTER TABLE vcc_work_orders ADD COLUMN environmental_conditions TEXT;
ALTER TABLE vcc_work_orders ADD COLUMN uncertainty_value TEXT;
ALTER TABLE vcc_work_orders ADD COLUMN calibration_error_value TEXT;
ALTER TABLE vcc_work_orders ADD COLUMN is_amended INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vcc_work_orders ADD COLUMN amended_at TEXT;
ALTER TABLE vcc_work_orders ADD COLUMN amended_by TEXT REFERENCES users(id);
ALTER TABLE vcc_work_orders ADD COLUMN amendment_reason TEXT;

-- 2. Immutable Certificate Version History
-- Stores every uploaded certificate version with cryptographic SHA-256 hash.
-- NOTE: ON DELETE CASCADE is strictly prohibited for evidentiary retention integrity.
CREATE TABLE IF NOT EXISTS vcc_work_order_certificates (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES vcc_work_orders(id),
  version INTEGER NOT NULL DEFAULT 1,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash TEXT NOT NULL,
  certificate_no TEXT,
  issue_date TEXT,
  valid_until TEXT,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  change_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (work_order_id, version)
);

CREATE INDEX IF NOT EXISTS idx_vcc_wo_certs_wo ON vcc_work_order_certificates(work_order_id);

-- 3. Controlled Amendment History for Closed Work Orders (ISO/IEC 17025 clause 7.8.8)
-- Captures full immutable pre-amendment state snapshots.
-- NOTE: ON DELETE CASCADE is strictly prohibited for evidentiary retention integrity.
CREATE TABLE IF NOT EXISTS vcc_work_order_amendments (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES vcc_work_orders(id),
  amendment_seq INTEGER NOT NULL DEFAULT 1,
  snapshot_data TEXT NOT NULL,
  amendment_reason TEXT NOT NULL,
  amended_by TEXT NOT NULL REFERENCES users(id),
  amended_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (work_order_id, amendment_seq)
);

CREATE INDEX IF NOT EXISTS idx_vcc_wo_amendments_wo ON vcc_work_order_amendments(work_order_id);

