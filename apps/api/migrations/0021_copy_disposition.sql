-- A recalled copy is finished once DCC records how the paper was disposed of (destroyed or stamped and archived).
ALTER TABLE controlled_copies ADD COLUMN disposed_at TEXT;
ALTER TABLE controlled_copies ADD COLUMN disposed_by TEXT REFERENCES users(id);
ALTER TABLE controlled_copies ADD COLUMN disposition TEXT;
