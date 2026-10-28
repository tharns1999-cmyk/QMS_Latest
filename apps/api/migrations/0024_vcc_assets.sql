-- VCC (Verify and Calibration Center) Phase 1: Equipment / Asset Register.
-- Groups (is_group = 1) hold individual child assets (parent_id -> group.id, one level deep).
-- Status supports ACTIVE, ON_HOLD, UNDER_REPAIR and RETIRED from day one; Phase 1 UI uses ACTIVE and RETIRED.
CREATE TABLE vcc_assets (
  id TEXT PRIMARY KEY,
  asset_code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  serial_no TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL REFERENCES departments(code),
  is_group INTEGER NOT NULL DEFAULT 0 CHECK (is_group IN (0, 1)),
  parent_id TEXT REFERENCES vcc_assets(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ON_HOLD', 'UNDER_REPAIR', 'RETIRED')),
  retired_reason TEXT,
  retired_at TEXT,
  retired_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT REFERENCES users(id),
  CHECK (is_group = 0 OR parent_id IS NULL)
);

CREATE INDEX idx_vcc_assets_status ON vcc_assets (status);
CREATE INDEX idx_vcc_assets_department ON vcc_assets (department);
CREATE INDEX idx_vcc_assets_parent ON vcc_assets (parent_id);

-- Starting list of equipment types; DCC can add or remove entries in the web UI without changing code.
INSERT OR IGNORE INTO settings (key, value) VALUES (
  'vcc_asset_types',
  '["เทอร์โมมิเตอร์","เครื่องชั่ง","ตุ้มน้ำหนักมาตรฐาน","Temperature Controller","เครื่องตรวจจับโลหะ","นาฬิกาจับเวลา","เวอร์เนียร์คาลิปเปอร์","เครื่องวัดคุณภาพน้ำ/น้ำมัน"]'
);

