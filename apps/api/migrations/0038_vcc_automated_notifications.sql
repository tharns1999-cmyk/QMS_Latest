-- Migration 0038: VCC Automated Notification & Multi-Tier Escalation Engine (Phase 3.4)
-- Provides stateful notification registry, deduplication, acknowledgement tracking, and escalation history
-- Compliant with ISO 9001 (7.1.5), ISO/IEC 17025 (7.10), and FSSC 22000

CREATE TABLE IF NOT EXISTS vcc_notifications (
  id TEXT PRIMARY KEY,
  dedup_key TEXT NOT NULL UNIQUE,
  notification_type TEXT NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES vcc_assets(id),
  work_order_id TEXT REFERENCES vcc_work_orders(id),
  department TEXT NOT NULL,
  target_role TEXT NOT NULL DEFAULT 'PERFORMER',
  target_user_id TEXT REFERENCES users(id),
  escalation_level INTEGER NOT NULL DEFAULT 1,
  severity TEXT NOT NULL DEFAULT 'INFO',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  due_date TEXT,
  days_offset INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  acknowledged_at TEXT,
  acknowledged_by TEXT REFERENCES users(id),
  acknowledgement_note TEXT,
  resolved_at TEXT,
  resolved_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_vcc_notif_ref ON vcc_notifications(reference_type, reference_id, notification_type, status);
CREATE INDEX IF NOT EXISTS idx_vcc_notif_dept_status ON vcc_notifications(department, status, escalation_level);
CREATE INDEX IF NOT EXISTS idx_vcc_notif_asset ON vcc_notifications(asset_id, status);
CREATE INDEX IF NOT EXISTS idx_vcc_notif_wo ON vcc_notifications(work_order_id, status);
CREATE INDEX IF NOT EXISTS idx_vcc_notif_dedup ON vcc_notifications(dedup_key);

