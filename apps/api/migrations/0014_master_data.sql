-- Master data the DCC manages in the app: departments and the places controlled copies are kept. Users reference department codes as text.
CREATE TABLE departments (
  code TEXT PRIMARY KEY,
  name_th TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Same codes as MASTER_DEPARTMENTS in apps/web/src/modules/dcc/config/qmsRegistry.js.
INSERT INTO departments (code, name_th, name_en) VALUES
  ('DC', 'ศูนย์ควบคุมเอกสาร', 'Document Control Center'),
  ('PD', 'ฝ่ายผลิต', 'Production Department'),
  ('QC', 'ฝ่ายประกันและควบคุมคุณภาพ', 'Quality Assurance & Control'),
  ('WH', 'ฝ่ายคลังสินค้าและโลจิสติกส์', 'Warehouse & Logistics'),
  ('EN', 'ฝ่ายวิศวกรรมและซ่อมบำรุง', 'Engineering & Maintenance'),
  ('PC', 'ฝ่ายจัดซื้อ', 'Purchasing Department'),
  ('HR&GA', 'ฝ่ายทรัพยากรบุคคลและธุรการ', 'Human Resources & General Affairs'),
  ('HSE', 'ฝ่ายความปลอดภัยและสิ่งแวดล้อม', 'Health, Safety & Environment'),
  ('MKT', 'ฝ่ายการตลาดและการขาย', 'Marketing & Sales'),
  ('ST', 'ฝ่ายจัดเก็บวัตถุดิบ', 'Store & Inventory'),
  ('FIN', 'ฝ่ายการเงินและบัญชี', 'Finance Department'),
  ('MGMT', 'ตัวแทนฝ่ายบริหาร/คุณภาพ', 'Management / QMR'),
  ('EXEC', 'ผู้บริหารสูงสุด', 'Executive Management');

-- Any department an existing user already belongs to must exist, whatever the seed above says.
INSERT OR IGNORE INTO departments (code, name_th) SELECT DISTINCT primary_department, primary_department FROM users;
INSERT OR IGNORE INTO departments (code, name_th) SELECT DISTINCT value, value FROM users, json_each(users.departments);

CREATE TABLE distribution_locations (
  id TEXT PRIMARY KEY,
  department TEXT NOT NULL REFERENCES departments(code),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (department, name)
);
