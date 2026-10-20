-- 004_physical_copy_receipt_and_audit.sql
-- Database Dialect: PostgreSQL

-- 1. Create physical_copy_audit_logs table with all mandatory compliance fields
CREATE TABLE IF NOT EXISTS physical_copy_audit_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id VARCHAR(100) NOT NULL,
    revision VARCHAR(20) NOT NULL,
    copy_identifier VARCHAR(50) NOT NULL,
    target_department VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL DEFAULT 'PHYSICAL_COPY_RECEIVED',
    actor_user_id VARCHAR(50) NOT NULL,
    actor_name VARCHAR(150) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    remarks TEXT,
    client_ip VARCHAR(45),
    session_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for audit trail querying and traceability
CREATE INDEX IF NOT EXISTS idx_physical_copy_audit_doc_dept 
    ON physical_copy_audit_logs(document_id, target_department);

CREATE INDEX IF NOT EXISTS idx_physical_copy_audit_timestamp 
    ON physical_copy_audit_logs(timestamp DESC);

-- 2. Ensure controlled_copy_instances status and receipt confirmation fields
ALTER TABLE controlled_copy_instances
    ADD COLUMN IF NOT EXISTS receipt_confirmed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS receipt_confirmed_by VARCHAR(150),
    ADD COLUMN IF NOT EXISTS receipt_remarks TEXT;
