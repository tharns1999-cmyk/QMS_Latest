-- 0044_module_governance_remediation.sql
-- Removes blanket DML triggers and moves module state & department enforcement to API service layer.

-- Drop all 24 blanket module_guard triggers
DROP TRIGGER IF EXISTS module_guard_vcc_assets_insert;
DROP TRIGGER IF EXISTS module_guard_vcc_assets_update;
DROP TRIGGER IF EXISTS module_guard_vcc_assets_delete;

DROP TRIGGER IF EXISTS module_guard_vcc_annual_plans_insert;
DROP TRIGGER IF EXISTS module_guard_vcc_annual_plans_update;
DROP TRIGGER IF EXISTS module_guard_vcc_annual_plans_delete;

DROP TRIGGER IF EXISTS module_guard_vcc_annual_plan_items_insert;
DROP TRIGGER IF EXISTS module_guard_vcc_annual_plan_items_update;
DROP TRIGGER IF EXISTS module_guard_vcc_annual_plan_items_delete;

DROP TRIGGER IF EXISTS module_guard_vcc_plan_cycles_insert;
DROP TRIGGER IF EXISTS module_guard_vcc_plan_cycles_update;
DROP TRIGGER IF EXISTS module_guard_vcc_plan_cycles_delete;

DROP TRIGGER IF EXISTS module_guard_vcc_work_orders_insert;
DROP TRIGGER IF EXISTS module_guard_vcc_work_orders_update;
DROP TRIGGER IF EXISTS module_guard_vcc_work_orders_delete;

DROP TRIGGER IF EXISTS module_guard_vcc_work_order_certificates_insert;
DROP TRIGGER IF EXISTS module_guard_vcc_work_order_certificates_update;
DROP TRIGGER IF EXISTS module_guard_vcc_work_order_certificates_delete;

DROP TRIGGER IF EXISTS module_guard_vcc_work_order_amendments_insert;
DROP TRIGGER IF EXISTS module_guard_vcc_work_order_amendments_update;
DROP TRIGGER IF EXISTS module_guard_vcc_work_order_amendments_delete;

DROP TRIGGER IF EXISTS module_guard_vcc_work_order_amendment_requests_insert;
DROP TRIGGER IF EXISTS module_guard_vcc_work_order_amendment_requests_update;
DROP TRIGGER IF EXISTS module_guard_vcc_work_order_amendment_requests_delete;

-- Drop table-level triggers to enforce department validation in API service layer
DROP TRIGGER IF EXISTS module_new_asset_department;
DROP TRIGGER IF EXISTS module_new_plan_department;

-- Ensure module_configuration exists and vcc is ACTIVE
INSERT OR IGNORE INTO module_configuration(module_id, status, maintenance_message, version)
VALUES ('vcc', 'ACTIVE', '', 0);

UPDATE module_configuration
SET status = 'ACTIVE'
WHERE module_id = 'vcc' AND status IS NULL;

-- Ensure default 5 authorized departments are enabled for vcc
INSERT OR IGNORE INTO module_departments(module_id, department, enabled)
SELECT 'vcc', code, 1 FROM departments WHERE code IN ('DC','QC','QA','MGT','LB');

UPDATE module_departments
SET enabled = 1
WHERE module_id = 'vcc' AND department IN ('DC','QC','QA','MGT','LB');
