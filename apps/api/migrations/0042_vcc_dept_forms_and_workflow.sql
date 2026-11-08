-- Migration 0042: Support Department-Specific Document Profiles and Official Forms (QC FM-QC-46 & LAB FM-LB-11)
-- ISO 9001 Clause 7.1.5 (Monitoring & Measuring Resources) & Clause 7.5.3 (Control of Documented Information)

-- 1. Extend vcc_assets with brand (Required for LAB FM-LB-11)
ALTER TABLE vcc_assets ADD COLUMN brand TEXT NOT NULL DEFAULT '';

-- 2. Extend vcc_annual_plans with operational tracking columns
ALTER TABLE vcc_annual_plans ADD COLUMN approval_attempt_id TEXT;
ALTER TABLE vcc_annual_plans ADD COLUMN form_issue_date TEXT;
ALTER TABLE vcc_annual_plans ADD COLUMN effective_date TEXT;
ALTER TABLE vcc_annual_plans ADD COLUMN pdf_file_key TEXT;
ALTER TABLE vcc_annual_plans ADD COLUMN profile_snapshot TEXT;

-- 3. Extend vcc_annual_plan_items with technical criteria columns
ALTER TABLE vcc_annual_plan_items ADD COLUMN mpe TEXT NOT NULL DEFAULT '';
ALTER TABLE vcc_annual_plan_items ADD COLUMN acceptance_criteria TEXT NOT NULL DEFAULT '';
ALTER TABLE vcc_annual_plan_items ADD COLUMN calibration_points TEXT NOT NULL DEFAULT '';

-- 4. Single-Batch Transaction Guard Trigger
-- Guarantees atomic abort if an approval attempt targets a plan not in PENDING_APPROVAL status
CREATE TRIGGER IF NOT EXISTS trg_guard_vcc_plan_approval
BEFORE UPDATE OF status ON vcc_annual_plans
FOR EACH ROW
WHEN NEW.status = 'APPROVED' AND OLD.status != 'PENDING_APPROVAL'
BEGIN
    SELECT RAISE(ABORT, 'PLAN_ALREADY_PROCESSED');
END;

-- 5. Initialize default Document Profiles safely without overwriting existing settings
INSERT OR IGNORE INTO settings (key, value) VALUES (
  'vcc_document_profiles',
  '{"QC":{"document_code":"FM-QC-46","revision":"01","form_issue_date":"2026-06-09","title_th":"แผนการทวนสอบเครื่องมือประจำปี","reviewer_dept":"PD","required_reviewer_level":5,"required_approver_level":6},"LB":{"document_code":"FM-LB-11","revision":"02","form_issue_date":"2026-08-10","title_th":"แผนการสอบเทียบเครื่องมือที่ใช้ในห้องปฏิบัติการจุลชีววิทยา ประจำปี","reviewer_dept":"LB","required_reviewer_level":5,"required_approver_level":6}}'
);
