-- Migration 0041: Add reschedule approval workflow columns and child assets snapshot to vcc_work_orders
-- Supports DEC-02 (2-Step Reschedule Approval Workflow with SoD) and DEC-04 (Immutable Digital Record Snapshot)

ALTER TABLE vcc_work_orders ADD COLUMN child_assets_snapshot TEXT;
ALTER TABLE vcc_work_orders ADD COLUMN reschedule_status TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE vcc_work_orders ADD COLUMN proposed_due_date TEXT;
ALTER TABLE vcc_work_orders ADD COLUMN reschedule_requested_by TEXT REFERENCES users(id);
ALTER TABLE vcc_work_orders ADD COLUMN reschedule_requested_at TEXT;
ALTER TABLE vcc_work_orders ADD COLUMN reschedule_approved_by TEXT REFERENCES users(id);
ALTER TABLE vcc_work_orders ADD COLUMN reschedule_approved_at TEXT;
ALTER TABLE vcc_work_orders ADD COLUMN reschedule_rejected_reason TEXT;

