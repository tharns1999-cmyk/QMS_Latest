-- VCC Phase 3: Critical Remediation & Historical Evidence Integrity
-- 1. Ensure Historical Evidence Integrity:
--    Non-approved plans or plans lacking approval evidence must NOT hold active effective status.
--    This protects historical records from automatic tampering without verifiable approval.
UPDATE vcc_annual_plans
SET effective_status = 'PENDING',
    is_current = 0
WHERE (status != 'APPROVED' OR approved_at IS NULL OR approved_by IS NULL)
  AND effective_status IN ('CURRENT', 'SUPERSEDED');

-- 2. Performance & query indices for cycle reconciliation and department filtering
CREATE INDEX IF NOT EXISTS idx_vcc_plan_cycles_initial ON vcc_plan_cycles(initial_cycle_id);
CREATE INDEX IF NOT EXISTS idx_vcc_wo_plan_year_dept ON vcc_work_orders(plan_year, plan_id);
