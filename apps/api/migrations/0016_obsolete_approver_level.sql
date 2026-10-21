-- Retiring a document can need a higher approver than adding or changing it. NULL means the same level as the normal approver.
-- The DCC edits this per document type in the app; the plant wants external documents retired at L6.
ALTER TABLE approval_matrix ADD COLUMN obsolete_approver_level INTEGER;
UPDATE approval_matrix SET obsolete_approver_level = 6 WHERE doc_type = 'ED';
