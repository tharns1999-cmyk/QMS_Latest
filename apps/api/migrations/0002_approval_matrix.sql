-- Approval Matrix: the single source of reviewer/approver levels per document type.
CREATE TABLE approval_matrix (
  doc_type TEXT PRIMARY KEY,
  name_th TEXT NOT NULL,
  min_requester_level INTEGER NOT NULL,
  required_reviewer_level INTEGER NOT NULL,
  required_approver_level INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT
);

-- Same defaults as DEFAULT_APPROVAL_MATRIX in apps/web/src/modules/dcc/config/qmsRegistry.js.
INSERT INTO approval_matrix (doc_type, name_th, min_requester_level, required_reviewer_level, required_approver_level) VALUES
  ('QM', 'คู่มือคุณภาพ (Quality Manual)', 4, 6, 8),
  ('SOP', 'ระเบียบปฏิบัติงาน (Standard Operating Procedure)', 1, 4, 6),
  ('WI', 'คู่มือการปฏิบัติงาน (Work Instruction)', 1, 4, 5),
  ('FM', 'แบบฟอร์มบันทึกข้อมูล (Form / Record Format)', 1, 4, 5),
  ('SD', 'เอกสารสนับสนุน (Supporting Document)', 1, 4, 5),
  ('SPEC', 'ข้อกำหนดและสเปกมาตรฐาน (Standard Specification)', 1, 4, 5),
  ('ED', 'เอกสารภายนอกและกฎหมาย (External Document)', 1, 4, 6);
