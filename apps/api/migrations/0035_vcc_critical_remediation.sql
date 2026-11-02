-- VCC Phase 3: Critical Remediation & Performance Indexing
-- 1. Performance & query indices for cycle reconciliation and department filtering
--    Safely created without modifying historical records or conflicting with Trigger 0034.
CREATE INDEX IF NOT EXISTS idx_vcc_plan_cycles_initial ON vcc_plan_cycles(initial_cycle_id);
CREATE INDEX IF NOT EXISTS idx_vcc_wo_plan_year_dept ON vcc_work_orders(plan_year, plan_id);
