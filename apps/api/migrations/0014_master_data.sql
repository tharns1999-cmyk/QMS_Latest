-- Master data the DCC manages in the app: departments and the places controlled copies are kept. Users reference department codes as text.
CREATE TABLE departments (
  code TEXT PRIMARY KEY,
  name_th TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- The plant's departments (codes as the factory chart names them). The DCC edits names and adds more in the app.
INSERT INTO departments (code, name_th, name_en) VALUES
  ('MGT', 'บริหาร / QMR', 'Management / QMR'),
  ('DC', 'ควบคุมเอกสาร', 'Document Control'),
  ('QA', 'ประกันคุณภาพ', 'Quality Assurance'),
  ('QC', 'ควบคุมคุณภาพ', 'Quality Control'),
  ('PD', 'ฝ่ายผลิต', 'Production'),
  ('WH', 'คลังสินค้า / ห้องเย็น', 'Warehouse / Cold Storage'),
  ('EN', 'วิศวกรรม / ซ่อมบำรุง', 'Engineering / Maintenance'),
  ('RD', 'วิจัยและพัฒนา', 'Research & Development'),
  ('PU', 'จัดซื้อ', 'Purchasing'),
  ('HR', 'บุคคล / ธุรการ', 'Human Resources / General Affairs'),
  ('AC', 'บัญชีและการเงิน', 'Accounting & Finance'),
  ('SF', 'ความปลอดภัย / จป.', 'Safety'),
  ('LB', 'ห้องปฏิบัติการไมโคร', 'Microbiology Laboratory');

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
