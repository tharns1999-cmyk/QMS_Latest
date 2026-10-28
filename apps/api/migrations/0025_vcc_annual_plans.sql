-- VCC (Verify and Calibration Center) Phase 2: Calibration Schedule Rules, Annual Plan Matrix & Plan Approval.
-- Plan statuses are strictly separated in UI/API queries (DRAFT, PENDING_REVIEW, PENDING_APPROVAL, APPROVED, REJECTED).
-- Highlighted months in a plan represent planned months only (not proof of completion).
CREATE TABLE vcc_annual_plans (
  id TEXT PRIMARY KEY,
  plan_year INTEGER NOT NULL CHECK (plan_year BETWEEN 2000 AND 2100),
  department TEXT NOT NULL REFERENCES departments(code),
  document_code TEXT NOT NULL DEFAULT 'FM-QC-46',
  revision TEXT NOT NULL DEFAULT '00',
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  due_date_rule TEXT NOT NULL DEFAULT 'END_OF_MONTH' CHECK (due_date_rule IN ('END_OF_MONTH', 'START_OF_MONTH')),
  prepared_by TEXT REFERENCES users(id),
  prepared_at TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  review_comment TEXT,
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  approval_comment TEXT,
  rejected_by TEXT REFERENCES users(id),
  rejected_at TEXT,
  rejected_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT REFERENCES users(id),
  UNIQUE (plan_year, department, revision)
);

CREATE INDEX idx_vcc_annual_plans_year_status ON vcc_annual_plans (plan_year, status);
CREATE INDEX idx_vcc_annual_plans_dept ON vcc_annual_plans (department);

-- Each row links an ACTIVE asset (or group with warning) to its annual schedule rule (months 1..12 and computed due dates).
-- Group assets (is_group = 1) may appear in the plan for overview, but work orders require individual child assets (is_group = 0).
CREATE TABLE vcc_annual_plan_items (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES vcc_annual_plans(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES vcc_assets(id),
  provider_name TEXT NOT NULL,
  frequency_label TEXT NOT NULL DEFAULT 'รายปี',
  planned_months TEXT NOT NULL DEFAULT '[]',
  due_dates TEXT NOT NULL DEFAULT '[]',
  responsible_dept TEXT NOT NULL REFERENCES departments(code),
  responsible_label TEXT NOT NULL DEFAULT '',
  remarks TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT REFERENCES users(id),
  UNIQUE (plan_id, asset_id)
);

CREATE INDEX idx_vcc_annual_plan_items_plan ON vcc_annual_plan_items (plan_id, sort_order);
CREATE INDEX idx_vcc_annual_plan_items_asset ON vcc_annual_plan_items (asset_id);

-- Configurable calibration providers/institutions and schedule rules (no hardcoded policy).
INSERT OR IGNORE INTO settings (key, value) VALUES (
  'vcc_calibration_providers',
  '["ห้องปฏิบัติการภายนอก","ทวนสอบภายใน","บ.ยูโรแพค จำกัด"]'
);

INSERT OR IGNORE INTO settings (key, value) VALUES (
  'vcc_plan_settings',
  '{"default_doc_code":"FM-QC-46","approval_doc_type":"FM","due_date_rule":"END_OF_MONTH"}'
);

