-- 004_physical_copy_receipt_and_audit_down.sql
DROP TABLE IF EXISTS physical_copy_audit_logs;
ALTER TABLE controlled_copy_instances
    DROP COLUMN IF EXISTS receipt_confirmed_at,
    DROP COLUMN IF EXISTS receipt_confirmed_by,
    DROP COLUMN IF EXISTS receipt_remarks;
