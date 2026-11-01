-- VCC (Verify and Calibration Center) Phase 3.1: Plan Revision Foundation
-- 1. Adds revision lineage and effective status columns to vcc_annual_plans:
--    - parent_plan_id: references the immediate prior revision that this draft was created from
--    - revision_reason: mandatory justification for plan revisions
--    - effective_status: 'CURRENT' (active plan in effect), 'SUPERSEDED' (historical approved plan replaced by newer revision), 'PENDING' (draft / in-review revision not yet effective)
-- 2. Adds initial_cycle_ids column to vcc_annual_plan_items for immutable cycle lineage tracking
-- 3. Enforces unique constraint: exactly 1 CURRENT plan per plan_year and department
-- 4. Installs SQLite triggers to protect approved plans and items from tampering
-- 5. Backfills existing plans to set effective_status aligned with is_current & status
-- 6. Ensures initial_cycle_id is backfilled for all existing plan cycles

ALTER TABLE vcc_annual_plans ADD COLUMN parent_plan_id TEXT REFERENCES vcc_annual_plans(id);
ALTER TABLE vcc_annual_plans ADD COLUMN revision_reason TEXT;
ALTER TABLE vcc_annual_plans ADD COLUMN effective_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK (effective_status IN ('CURRENT', 'SUPERSEDED', 'PENDING'));

ALTER TABLE vcc_annual_plan_items ADD COLUMN initial_cycle_ids TEXT DEFAULT '[]';

-- Drop partial index if created in previous test run
DROP INDEX IF EXISTS idx_vcc_annual_plans_one_in_flight;

-- Index for parent_plan_id lookups
CREATE INDEX IF NOT EXISTS idx_vcc_annual_plans_parent ON vcc_annual_plans(parent_plan_id);

-- Index for querying current vs superseded plans by year & department
CREATE INDEX IF NOT EXISTS idx_vcc_annual_plans_effective ON vcc_annual_plans(plan_year, department, effective_status);

-- Enforce exactly one CURRENT plan per plan_year and department
CREATE UNIQUE INDEX IF NOT EXISTS idx_vcc_annual_plans_one_current
  ON vcc_annual_plans (plan_year, department)
  WHERE effective_status = 'CURRENT';

-- Backfill effective_status for existing annual plans:
-- Approved plans with is_current = 1 become 'CURRENT'
-- Approved plans with is_current = 0 become 'SUPERSEDED'
-- In-flight plans remain 'PENDING'
UPDATE vcc_annual_plans
SET effective_status = CASE
  WHEN status = 'APPROVED' AND is_current = 1 THEN 'CURRENT'
  WHEN status = 'APPROVED' AND is_current = 0 THEN 'SUPERSEDED'
  ELSE 'PENDING'
END;

-- Ensure all existing plan cycles have initial_cycle_id populated for lineage tracking
UPDATE vcc_plan_cycles
SET initial_cycle_id = id
WHERE initial_cycle_id IS NULL;

-- Historical Protection Triggers:
-- Prevent modification of items belonging to an approved annual plan
CREATE TRIGGER IF NOT EXISTS trg_prevent_update_approved_plan_item
BEFORE UPDATE ON vcc_annual_plan_items
FOR EACH ROW
WHEN (SELECT status FROM vcc_annual_plans WHERE id = OLD.plan_id) = 'APPROVED'
BEGIN
  SELECT RAISE(ABORT, 'Cannot modify items of an APPROVED annual plan. QMS integrity violation.');
END;

-- Prevent tampering with core identity or schedule rules of an approved annual plan
CREATE TRIGGER IF NOT EXISTS trg_prevent_tamper_approved_annual_plan
BEFORE UPDATE ON vcc_annual_plans
FOR EACH ROW
WHEN OLD.status = 'APPROVED' AND (
  NEW.plan_year != OLD.plan_year OR
  NEW.department != OLD.department OR
  NEW.revision != OLD.revision OR
  NEW.document_code != OLD.document_code OR
  NEW.due_date_rule != OLD.due_date_rule
)
BEGIN
  SELECT RAISE(ABORT, 'Cannot alter core identity or schedule rules of an APPROVED annual plan. QMS integrity violation.');
END;
