-- VCC (Verify and Calibration Center) Phase 3.1: Historical Protection Hardening
-- 1. Drops previous trigger from 0033 and replaces with comprehensive tamper protection:
--    - Strictly blocks changing status away from 'APPROVED' (e.g. APPROVED -> DRAFT)
--    - Strictly blocks changing core identity: plan_year, department, revision, document_code, due_date_rule
--    - Strictly blocks altering historical evidence: prepared_by, prepared_at, reviewed_by, reviewed_at, approved_by, approved_at, title, parent_plan_id, revision_reason
--    - Blocks illegal effective_status transitions (e.g. APPROVED back to PENDING, or SUPERSEDED back to CURRENT)
--    - Only permits authorized lifecycle transitions: effective_status ('CURRENT' -> 'SUPERSEDED'), is_current (1 -> 0), superseded_at, superseded_by, work_orders_generated_*

DROP TRIGGER IF EXISTS trg_prevent_tamper_approved_annual_plan;

CREATE TRIGGER trg_prevent_tamper_approved_annual_plan
BEFORE UPDATE ON vcc_annual_plans
FOR EACH ROW
WHEN OLD.status = 'APPROVED' AND (
  NEW.status != 'APPROVED' OR
  NEW.plan_year != OLD.plan_year OR
  NEW.department != OLD.department OR
  NEW.revision != OLD.revision OR
  NEW.document_code != OLD.document_code OR
  NEW.due_date_rule != OLD.due_date_rule OR
  NEW.parent_plan_id IS NOT OLD.parent_plan_id OR
  NEW.revision_reason IS NOT OLD.revision_reason OR
  NEW.prepared_by IS NOT OLD.prepared_by OR
  NEW.prepared_at IS NOT OLD.prepared_at OR
  NEW.reviewed_by IS NOT OLD.reviewed_by OR
  NEW.reviewed_at IS NOT OLD.reviewed_at OR
  NEW.approved_by IS NOT OLD.approved_by OR
  NEW.approved_at IS NOT OLD.approved_at OR
  NEW.title IS NOT OLD.title OR
  NEW.effective_status = 'PENDING' OR
  (OLD.effective_status = 'SUPERSEDED' AND NEW.effective_status != 'SUPERSEDED')
)
BEGIN
  SELECT RAISE(ABORT, 'Cannot alter status, core identity, or historical evidence of an APPROVED annual plan. QMS integrity violation.');
END;
