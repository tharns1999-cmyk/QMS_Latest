-- 005_multi_department_and_task_routing_down.sql
-- Database Dialect: PostgreSQL
-- Rollback for Multi-Department Membership, Cross-Department Task Routing & Audit Trail Expansion

DROP INDEX IF EXISTS idx_tasks_target_department;
DROP INDEX IF EXISTS idx_physical_copy_audit_task_dept;
DROP INDEX IF EXISTS idx_users_affiliated_departments;

ALTER TABLE tasks
    DROP COLUMN IF EXISTS required_approval_level,
    DROP COLUMN IF EXISTS target_department;

ALTER TABLE physical_copy_audit_logs
    DROP COLUMN IF EXISTS actor_primary_department,
    DROP COLUMN IF EXISTS task_department;

ALTER TABLE users
    DROP COLUMN IF EXISTS is_qmr,
    DROP COLUMN IF EXISTS approval_level,
    DROP COLUMN IF EXISTS affiliated_departments,
    DROP COLUMN IF EXISTS primary_department;
