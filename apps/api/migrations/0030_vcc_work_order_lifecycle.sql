-- VCC (Verify and Calibration Center) Phase 1-2: Work Order Lifecycle Redesign
-- 1. Expands vcc_work_orders to support:
--    - Stable Planned Cycle Identity (cycle_key format: YYYY:DEPT:ASSET_ID:MONTH)
--    - Multi-year and carryover fields (plan_year, plan_revision, baseline_planned_date, scheduled_date, required_due_date, is_carryover)
--    - Expanded statuses: SCHEDULED, OPEN, IN_PROGRESS, PENDING_REVIEW, REJECTED, CLOSED, CANCELLED
-- 2. Preserves backward compatibility with legacy status ('OPEN') and legacy unique index
-- 3. Adds tracking columns to vcc_annual_plans (is_current, superseded_at, superseded_by, work_orders_generated_at, work_orders_generated_count)

ALTER TABLE vcc_annual_plans ADD COLUMN is_current INTEGER NOT NULL DEFAULT 1;
ALTER TABLE vcc_annual_plans ADD COLUMN superseded_at TEXT;
ALTER TABLE vcc_annual_plans ADD COLUMN superseded_by TEXT REFERENCES users(id);
ALTER TABLE vcc_annual_plans ADD COLUMN work_orders_generated_at TEXT;
ALTER TABLE vcc_annual_plans ADD COLUMN work_orders_generated_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS vcc_work_orders_new (
  id                     TEXT PRIMARY KEY,
  wo_code                TEXT NOT NULL UNIQUE COLLATE NOCASE,
  cycle_key              TEXT,
  plan_year              INTEGER,
  plan_revision          TEXT NOT NULL DEFAULT '00',
  plan_id                TEXT REFERENCES vcc_annual_plans(id),
  plan_item_id           TEXT REFERENCES vcc_annual_plan_items(id),
  planned_month          INTEGER CHECK (planned_month IS NULL OR (planned_month >= 1 AND planned_month <= 12)),
  asset_id               TEXT NOT NULL REFERENCES vcc_assets(id),
  provider_name          TEXT NOT NULL,
  baseline_planned_date  TEXT,
  scheduled_date         TEXT,
  due_date               TEXT NOT NULL,
  original_due_date      TEXT NOT NULL,
  required_due_date      TEXT,
  reschedule_reason      TEXT,
  is_carryover           INTEGER NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'SCHEDULED'
                           CHECK (status IN ('SCHEDULED', 'OPEN', 'IN_PROGRESS', 'PENDING_REVIEW', 'REJECTED', 'CLOSED', 'CANCELLED')),
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

INSERT INTO vcc_work_orders_new (
  id, wo_code, cycle_key, plan_year, plan_revision, plan_id, plan_item_id, planned_month, asset_id, provider_name,
  baseline_planned_date, scheduled_date, due_date, original_due_date, required_due_date, reschedule_reason, is_carryover,
  status, result_status, performed_at, certificate_no, acceptance_criteria, result_remarks,
  performed_by, reviewed_by, reviewed_at, review_comment, rejected_reason,
  nc_status, nc_impact_assessment, hold_released_by, hold_released_at,
  created_at, created_by, updated_at, updated_by
)
SELECT
  w.id,
  w.wo_code,
  CASE
    WHEN w.plan_item_id IS NOT NULL AND w.planned_month IS NOT NULL THEN
      (COALESCE(p.plan_year, CAST(substr(w.due_date, 1, 4) AS INTEGER)) || ':' || COALESCE(p.department, a.department, 'QC') || ':' || w.asset_id || ':' || w.planned_month)
    ELSE NULL
  END AS cycle_key,
  COALESCE(p.plan_year, CAST(substr(w.due_date, 1, 4) AS INTEGER)) AS plan_year,
  COALESCE(p.revision, '00') AS plan_revision,
  w.plan_id,
  w.plan_item_id,
  w.planned_month,
  w.asset_id,
  w.provider_name,
  w.original_due_date AS baseline_planned_date,
  w.due_date AS scheduled_date,
  w.due_date,
  w.original_due_date,
  w.due_date AS required_due_date,
  w.reschedule_reason,
  0 AS is_carryover,
  w.status,
  w.result_status,
  w.performed_at,
  w.certificate_no,
  w.acceptance_criteria,
  w.result_remarks,
  w.performed_by,
  w.reviewed_by,
  w.reviewed_at,
  w.review_comment,
  w.rejected_reason,
  w.nc_status,
  w.nc_impact_assessment,
  w.hold_released_by,
  w.hold_released_at,
  w.created_at,
  w.created_by,
  w.updated_at,
  w.updated_by
FROM vcc_work_orders w
LEFT JOIN vcc_annual_plans p ON p.id = w.plan_id
LEFT JOIN vcc_assets a ON a.id = w.asset_id;

DROP TABLE vcc_work_orders;
ALTER TABLE vcc_work_orders_new RENAME TO vcc_work_orders;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vcc_wo_unique_cycle
  ON vcc_work_orders(cycle_key)
  WHERE cycle_key IS NOT NULL AND status != 'CANCELLED';

CREATE UNIQUE INDEX IF NOT EXISTS idx_vcc_wo_unique_plan_cycle
  ON vcc_work_orders(plan_item_id, asset_id, planned_month)
  WHERE plan_item_id IS NOT NULL AND status != 'CANCELLED';

CREATE INDEX IF NOT EXISTS idx_vcc_wo_status ON vcc_work_orders(status);
CREATE INDEX IF NOT EXISTS idx_vcc_wo_asset ON vcc_work_orders(asset_id);
CREATE INDEX IF NOT EXISTS idx_vcc_wo_plan ON vcc_work_orders(plan_id);
CREATE INDEX IF NOT EXISTS idx_vcc_wo_plan_year ON vcc_work_orders(plan_year);
CREATE INDEX IF NOT EXISTS idx_vcc_wo_cycle_key ON vcc_work_orders(cycle_key);

