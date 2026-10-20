-- 005_multi_department_and_task_routing.sql
-- Database Dialect: PostgreSQL
-- Feature: Multi-Department Membership, Cross-Department Task Routing & Audit Trail Expansion

-- 1. Extend users table to support primary department, affiliated departments array, and approval level
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS primary_department VARCHAR(50),
    ADD COLUMN IF NOT EXISTS affiliated_departments TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS approval_level INT DEFAULT 1,
    ADD COLUMN IF NOT EXISTS is_qmr BOOLEAN DEFAULT FALSE;

-- Migrate existing single department data if available
UPDATE users
SET primary_department = department
WHERE primary_department IS NULL AND department IS NOT NULL;

UPDATE users
SET affiliated_departments = ARRAY[department]
WHERE (affiliated_departments IS NULL OR affiliated_departments = '{}') AND department IS NOT NULL;

-- 2. Extend physical_copy_audit_logs to record task department and actor primary department
ALTER TABLE physical_copy_audit_logs
    ADD COLUMN IF NOT EXISTS task_department VARCHAR(50),
    ADD COLUMN IF NOT EXISTS actor_primary_department VARCHAR(50);

-- Backfill legacy records: copy target_department to task_department
UPDATE physical_copy_audit_logs
SET task_department = target_department
WHERE task_department IS NULL AND target_department IS NOT NULL;

-- 3. Extend tasks table to explicitly support target department and approval level criteria
ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS target_department VARCHAR(50),
    ADD COLUMN IF NOT EXISTS required_approval_level INT DEFAULT 1;

-- Indexes for cross-department queries
CREATE INDEX IF NOT EXISTS idx_users_affiliated_departments ON users USING GIN (affiliated_departments);
CREATE INDEX IF NOT EXISTS idx_physical_copy_audit_task_dept ON physical_copy_audit_logs (task_department);
CREATE INDEX IF NOT EXISTS idx_tasks_target_department ON tasks (target_department);
