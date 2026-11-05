-- Migration 0040: Add qualitative verification governance columns to vcc_work_orders
-- Supports DEC-03: Qualitative vs Quantitative verification governance

ALTER TABLE vcc_work_orders ADD COLUMN verification_type TEXT NOT NULL DEFAULT 'QUANTITATIVE';
ALTER TABLE vcc_work_orders ADD COLUMN actual_result TEXT;

