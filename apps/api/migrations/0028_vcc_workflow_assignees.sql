-- VCC Phase 2 / Phase 4: Controlled Assignee Selection & Persistent Workflow Assignees.
-- Stores designated reviewer and approver for annual calibration plans.
ALTER TABLE vcc_annual_plans ADD COLUMN assigned_reviewer_id TEXT REFERENCES users(id);
ALTER TABLE vcc_annual_plans ADD COLUMN assigned_approver_id TEXT REFERENCES users(id);
