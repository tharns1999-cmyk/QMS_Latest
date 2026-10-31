-- VCC Phase 2.5: Cycle Integrity Hardening & Historical Data Protection
-- 1. Schema columns for work order cancellation categorization & cycle lineage
ALTER TABLE vcc_work_orders ADD COLUMN cancellation_category TEXT;
ALTER TABLE vcc_work_orders ADD COLUMN cancellation_reason TEXT;
ALTER TABLE vcc_work_orders ADD COLUMN cancelled_by TEXT REFERENCES users(id);
ALTER TABLE vcc_work_orders ADD COLUMN cancelled_at TEXT;

ALTER TABLE vcc_plan_cycles ADD COLUMN initial_cycle_id TEXT;
ALTER TABLE vcc_plan_cycles ADD COLUMN plan_revision TEXT DEFAULT '00';
ALTER TABLE vcc_plan_cycles ADD COLUMN updated_at TEXT;
ALTER TABLE vcc_plan_cycles ADD COLUMN updated_by TEXT;

-- 2. Legacy Cycle Migration Integrity: Ensure 0 orphan cycle_id references in vcc_work_orders
-- Backfill any missing vcc_plan_cycles for work orders that have valid plan linkage
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
  COALESCE(w.baseline_planned_date, w.due_date, strftime('%Y-%m-%d', 'now')),
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
  AND w.plan_item_id IS NOT NULL
  AND w.cycle_id NOT IN (SELECT id FROM vcc_plan_cycles);

-- Clear cycle_id on any ad-hoc/unlinked work orders that don't belong to any planned cycle
UPDATE vcc_work_orders
SET cycle_id = NULL
WHERE cycle_id IS NOT NULL
  AND cycle_id NOT IN (SELECT id FROM vcc_plan_cycles);

-- 3. Historical Data Protection Triggers
-- Prevent deletion of approved annual plans
CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_approved_annual_plan
BEFORE DELETE ON vcc_annual_plans
FOR EACH ROW
WHEN OLD.status = 'APPROVED'
BEGIN
  SELECT RAISE(ABORT, 'Cannot delete an APPROVED annual plan. QMS integrity violation.');
END;

-- Prevent deletion of plan items belonging to an approved annual plan
CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_approved_plan_item
BEFORE DELETE ON vcc_annual_plan_items
FOR EACH ROW
WHEN (SELECT status FROM vcc_annual_plans WHERE id = OLD.plan_id) = 'APPROVED'
BEGIN
  SELECT RAISE(ABORT, 'Cannot delete items from an APPROVED annual plan. QMS integrity violation.');
END;

-- Prevent deletion of closed work orders or work orders with certificate evidence
CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_closed_work_order
BEFORE DELETE ON vcc_work_orders
FOR EACH ROW
WHEN OLD.status = 'CLOSED' OR OLD.certificate_no IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Cannot delete a CLOSED work order or a work order with certificate evidence. QMS integrity violation.');
END;

-- Prevent deletion of closed plan cycles
CREATE TRIGGER IF NOT EXISTS trg_prevent_delete_closed_plan_cycle
BEFORE DELETE ON vcc_plan_cycles
FOR EACH ROW
WHEN OLD.cycle_status = 'CLOSED' OR EXISTS (SELECT 1 FROM vcc_work_orders WHERE cycle_id = OLD.id AND status = 'CLOSED')
BEGIN
  SELECT RAISE(ABORT, 'Cannot delete a cycle with CLOSED work order or closed cycle status. QMS integrity violation.');
END;

