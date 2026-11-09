-- Module governance is opt-in for administrators; existing DCC permissions are unchanged.
CREATE TABLE module_configuration (
 module_id TEXT PRIMARY KEY,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','READ_ONLY','MAINTENANCE','DISABLED')),
 maintenance_message TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 0,
 updated_by TEXT REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO module_configuration(module_id) VALUES ('vcc');
CREATE TABLE module_departments (
 module_id TEXT NOT NULL REFERENCES module_configuration(module_id),
 department TEXT NOT NULL REFERENCES departments(code),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 PRIMARY KEY(module_id,department)
);
-- Preserve only the five previously approved entry departments, never all master departments.
INSERT INTO module_departments(module_id,department,enabled)
 SELECT 'vcc',code,1 FROM departments WHERE code IN ('DC','QC','QA','MGT','LB');
CREATE TABLE module_permission_grants (
 user_id TEXT NOT NULL REFERENCES users(id),
 permission TEXT NOT NULL CHECK(permission IN ('MODULE_MANAGE','PLATFORM_ADMIN')),
 module_id TEXT NOT NULL,
 granted_by TEXT REFERENCES users(id),
 granted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 CHECK((permission='PLATFORM_ADMIN' AND module_id='*') OR (permission='MODULE_MANAGE' AND module_id='vcc')),
 PRIMARY KEY(user_id,permission,module_id)
);
-- Store historical policy in configuration once; runtime code no longer chooses departments.
UPDATE settings SET value = (
 SELECT json_group_object(j.key,json(json_set(j.value,'$.approver_dept','MGT','$.min_preparer_level',COALESCE(json_extract(j.value,'$.min_preparer_level'),4))))
 FROM json_each(settings.value) j
) WHERE key='vcc_document_profiles';
CREATE TRIGGER module_last_platform_admin BEFORE DELETE ON module_permission_grants
WHEN OLD.permission='PLATFORM_ADMIN' AND
 (SELECT count(*) FROM module_permission_grants g JOIN users u ON u.id=g.user_id WHERE g.permission='PLATFORM_ADMIN' AND u.status='ACTIVE') <= 1
BEGIN SELECT RAISE(ABORT,'LAST_PLATFORM_ADMIN'); END;

CREATE TRIGGER module_guard_vcc_assets_insert BEFORE INSERT ON vcc_assets
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_assets_update BEFORE UPDATE ON vcc_assets
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_assets_delete BEFORE DELETE ON vcc_assets
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_annual_plans_insert BEFORE INSERT ON vcc_annual_plans
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_annual_plans_update BEFORE UPDATE ON vcc_annual_plans
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_annual_plans_delete BEFORE DELETE ON vcc_annual_plans
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_annual_plan_items_insert BEFORE INSERT ON vcc_annual_plan_items
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_annual_plan_items_update BEFORE UPDATE ON vcc_annual_plan_items
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_annual_plan_items_delete BEFORE DELETE ON vcc_annual_plan_items
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_plan_cycles_insert BEFORE INSERT ON vcc_plan_cycles
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_plan_cycles_update BEFORE UPDATE ON vcc_plan_cycles
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_plan_cycles_delete BEFORE DELETE ON vcc_plan_cycles
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_work_orders_insert BEFORE INSERT ON vcc_work_orders
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_work_orders_update BEFORE UPDATE ON vcc_work_orders
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_work_orders_delete BEFORE DELETE ON vcc_work_orders
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_work_order_certificates_insert BEFORE INSERT ON vcc_work_order_certificates
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_work_order_certificates_update BEFORE UPDATE ON vcc_work_order_certificates
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_work_order_certificates_delete BEFORE DELETE ON vcc_work_order_certificates
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_work_order_amendments_insert BEFORE INSERT ON vcc_work_order_amendments
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_work_order_amendments_update BEFORE UPDATE ON vcc_work_order_amendments
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_work_order_amendments_delete BEFORE DELETE ON vcc_work_order_amendments
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_work_order_amendment_requests_insert BEFORE INSERT ON vcc_work_order_amendment_requests
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_work_order_amendment_requests_update BEFORE UPDATE ON vcc_work_order_amendment_requests
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

CREATE TRIGGER module_guard_vcc_work_order_amendment_requests_delete BEFORE DELETE ON vcc_work_order_amendment_requests
WHEN COALESCE((SELECT status FROM module_configuration WHERE module_id='vcc'),'DISABLED') != 'ACTIVE'
BEGIN SELECT RAISE(ABORT,'MODULE_LOCKED'); END;

-- These guards run inside the write batch, including requests already in flight.
CREATE TRIGGER module_new_asset_department BEFORE INSERT ON vcc_assets
WHEN NOT EXISTS (SELECT 1 FROM module_departments md JOIN departments d ON d.code=md.department
 WHERE md.module_id='vcc' AND md.department=NEW.department AND md.enabled=1 AND d.status='ACTIVE')
BEGIN SELECT RAISE(ABORT,'DEPARTMENT_DISABLED'); END;
CREATE TRIGGER module_new_plan_department BEFORE INSERT ON vcc_annual_plans
WHEN NEW.parent_plan_id IS NULL AND NOT EXISTS (SELECT 1 FROM module_departments md JOIN departments d ON d.code=md.department
 WHERE md.module_id='vcc' AND md.department=NEW.department AND md.enabled=1 AND d.status='ACTIVE')
BEGIN SELECT RAISE(ABORT,'DEPARTMENT_DISABLED'); END;
