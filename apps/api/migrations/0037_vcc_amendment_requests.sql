-- VCC Phase 3.2: 2-Step Controlled Amendment Workflow (SoD Enforcement)
-- Separates Amendment Request from Amendment Approval to prevent requester self-approval and client spoofing.
CREATE TABLE IF NOT EXISTS vcc_work_order_amendment_requests (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES vcc_work_orders(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  amendment_reason TEXT NOT NULL,
  proposed_changes TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  review_comment TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_vcc_wo_amend_req_wo ON vcc_work_order_amendment_requests(work_order_id);
CREATE INDEX IF NOT EXISTS idx_vcc_wo_amend_req_status ON vcc_work_order_amendment_requests(status);

