-- VCC (Verify and Calibration Center) Phase 2.5: Stable Planned Cycle Identity & Data Integrity Hardening
-- 1. Introduces vcc_plan_cycles as an immutable cycle entity:
--    Each planned calibration slot in an Annual Plan (FM-QC-46) receives a stable, immutable cycle_id.
--    This ID remains stable across rescheduling, date shifts, carryover, department transfers, and plan revisions.
-- 2. Adds cycle_id column to vcc_work_orders referencing vcc_plan_cycles(id).
-- 3. Enforces unique constraint: 1 cycle_id = exactly 1 active work order (status != 'CANCELLED').
-- 4. Backfills existing work orders (using cycle_key as initial cycle_id) preserving 100% of historical data.

CREATE TABLE IF NOT EXISTS vcc_plan_cycles (
  id                     TEXT PRIMARY KEY,
  plan_id                TEXT NOT NULL REFERENCES vcc_annual_plans(id) ON DELETE CASCADE,
  plan_item_id           TEXT NOT NULL REFERENCES vcc_annual_plan_items(id) ON DELETE CASCADE,
  asset_id               TEXT NOT NULL REFERENCES vcc_assets(id),
  cycle_seq              INTEGER NOT NULL DEFAULT 1,
  planned_month          INTEGER NOT NULL CHECK (planned_month >= 1 AND planned_month <= 12),
  baseline_planned_date  TEXT NOT NULL,
  cycle_status           TEXT NOT NULL DEFAULT 'PLANNED'
                           CHECK (cycle_status IN ('PLANNED', 'SCHEDULED', 'IN_PROGRESS', 'CLOSED', 'CANCELLED')),
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  created_by             TEXT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_vcc_plan_cycles_plan ON vcc_plan_cycles(plan_id);
CREATE INDEX IF NOT EXISTS idx_vcc_plan_cycles_item ON vcc_plan_cycles(plan_item_id);
CREATE INDEX IF NOT EXISTS idx_vcc_plan_cycles_asset ON vcc_plan_cycles(asset_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vcc_plan_cycles_item_seq ON vcc_plan_cycles(plan_item_id, cycle_seq);

-- Add cycle_id column to vcc_work_orders
ALTER TABLE vcc_work_orders ADD COLUMN cycle_id TEXT;

-- Backfill cycle_id for existing work orders that have cycle_key
UPDATE vcc_work_orders
SET cycle_id = cycle_key
WHERE cycle_id IS NULL AND cycle_key IS NOT NULL;

-- Backfill vcc_plan_cycles for existing work orders
INSERT OR IGNORE INTO vcc_plan_cycles (
  id, plan_id, plan_item_id, asset_id, cycle_seq, planned_month, baseline_planned_date, cycle_status, created_at, created_by
)
SELECT
  w.cycle_id,
  w.plan_id,
  w.plan_item_id,
  w.asset_id,
  COALESCE(w.planned_month, 1),
  COALESCE(w.planned_month, 1),
  COALESCE(w.baseline_planned_date, w.due_date),
  CASE
    WHEN w.status = 'CLOSED' THEN 'CLOSED'
    WHEN w.status = 'CANCELLED' THEN 'CANCELLED'
    WHEN w.status = 'IN_PROGRESS' THEN 'IN_PROGRESS'
    ELSE 'SCHEDULED'
  END,
  w.created_at,
  w.created_by
FROM vcc_work_orders w
WHERE w.cycle_id IS NOT NULL
  AND w.plan_id IS NOT NULL
  AND w.plan_item_id IS NOT NULL;

-- Drop legacy plan cycle index that prevented multiple cycles of same asset in the same month
DROP INDEX IF EXISTS idx_vcc_wo_unique_plan_cycle;

-- Enforce partial unique index: exactly 1 active work order per cycle_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_vcc_wo_unique_cycle_id
  ON vcc_work_orders(cycle_id)
  WHERE cycle_id IS NOT NULL AND status != 'CANCELLED';

CREATE INDEX IF NOT EXISTS idx_vcc_wo_cycle_id ON vcc_work_orders(cycle_id);

