-- VCC Phase 3: Critical Remediation & Legacy Data Protection
-- 1. Safely resolve any legacy data with multiple CURRENT plans per department and year:
--    Keeps the highest revision as CURRENT, gracefully transitioning older revisions to SUPERSEDED
--    without deleting any history or violating audit trails.
UPDATE vcc_annual_plans
SET effective_status = 'SUPERSEDED',
    is_current = 0,
    superseded_at = COALESCE(superseded_at, (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
WHERE effective_status = 'CURRENT'
  AND id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY plan_year, department
        ORDER BY CAST(revision AS INTEGER) DESC, id DESC
      ) as rn
      FROM vcc_annual_plans
      WHERE effective_status = 'CURRENT'
    ) WHERE rn = 1
  );

-- 2. Performance & query indices for cycle reconciliation and department filtering
CREATE INDEX IF NOT EXISTS idx_vcc_plan_cycles_initial ON vcc_plan_cycles(initial_cycle_id);
CREATE INDEX IF NOT EXISTS idx_vcc_wo_plan_year_dept ON vcc_work_orders(plan_year, plan_id);

