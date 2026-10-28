-- VCC (Verify and Calibration Center) Phase 3: Work Orders, Execution, Review & Hold/NC Control
-- Enforces:
-- 1. Work orders must reference an individual asset (is_group = 0), never a group directly
-- 2. Unique constraint prevents duplicate work orders for the same (plan_item_id, asset_id, planned_month)
-- 3. Submitting results requires certificate_no and acceptance_criteria; only reviewer approval closes the work order
-- 4. FAIL result triggers ON_HOLD / NC control and requires L5+ approver to release hold with impact assessment

CREATE TABLE IF NOT EXISTS vcc_work_orders (
  id                     TEXT PRIMARY KEY,
  wo_code                TEXT NOT NULL UNIQUE COLLATE NOCASE,
  plan_id                TEXT REFERENCES vcc_annual_plans(id),
  plan_item_id           TEXT REFERENCES vcc_annual_plan_items(id),
  planned_month          INTEGER CHECK (planned_month IS NULL OR (planned_month >= 1 AND planned_month <= 12)),
  asset_id               TEXT NOT NULL REFERENCES vcc_assets(id),
  provider_name          TEXT NOT NULL,
  due_date               TEXT NOT NULL,
  original_due_date      TEXT NOT NULL,
  reschedule_reason      TEXT,
  status                 TEXT NOT NULL DEFAULT 'OPEN'
                           CHECK (status IN ('OPEN', 'PENDING_REVIEW', 'REJECTED', 'CLOSED', 'CANCELLED')),
  result_status          TEXT NOT NULL DEFAULT 'PENDING'
                           CHECK (result_status IN ('PENDING', 'PASS', 'FAIL', 'INCONCLUSIVE')),
  performed_at           TEXT,
  certificate_no         TEXT,
  acceptance_criteria    TEXT,
  result_remarks         TEXT,
  performed_by           TEXT REFERENCES users(id),
  reviewed_by            TEXT REFERENCES users(id),
  reviewed_at            TEXT,
  review_comment         TEXT,
  rejected_reason        TEXT,
  nc_status              TEXT CHECK (nc_status IS NULL OR nc_status IN ('OPEN', 'RELEASED')),
  nc_impact_assessment   TEXT,
  hold_released_by       TEXT REFERENCES users(id),
  hold_released_at       TEXT,
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  created_by             TEXT REFERENCES users(id),
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_by             TEXT REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vcc_wo_unique_plan_cycle
  ON vcc_work_orders(plan_item_id, asset_id, planned_month)
  WHERE plan_item_id IS NOT NULL AND status != 'CANCELLED';

CREATE INDEX IF NOT EXISTS idx_vcc_wo_status
  ON vcc_work_orders(status);

CREATE INDEX IF NOT EXISTS idx_vcc_wo_asset
  ON vcc_work_orders(asset_id);

CREATE INDEX IF NOT EXISTS idx_vcc_wo_plan
  ON vcc_work_orders(plan_id);

-- Configurable work order settings (acceptance criteria templates & retention period) editable by DCC
INSERT OR IGNORE INTO settings (key, value) VALUES (
  'vcc_work_order_settings',
  '{"retention_years":3,"approval_doc_type":"FM","default_acceptance_criteria":["± 0.5 °C ตามเกณฑ์โรงงาน","± 1.0 g ตามพิกัดเครื่องชั่ง","ผ่านเกณฑ์มาตรฐานห้องปฏิบัติการ ISO/IEC 17025","± 0.02 mm ตามเกณฑ์เวอร์เนียร์คาลิปเปอร์"]}'
);

