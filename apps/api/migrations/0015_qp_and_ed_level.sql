-- QP (Quality Procedure) is the plant's seventh document type in place of SPEC. Nothing is filed under SPEC yet, but move anything that is.
UPDATE documents SET doc_type = 'QP' WHERE doc_type = 'SPEC';
UPDATE dars SET doc_type = 'QP' WHERE doc_type = 'SPEC';
-- Levels are only reset when nobody has edited the row; a QP sits above SOP, so it is approved at L6 like SOP.
UPDATE approval_matrix SET doc_type = 'QP', name_th = 'ระเบียบวิธีคุณภาพ (Quality Procedure)',
  required_approver_level = CASE WHEN updated_by IS NULL THEN 6 ELSE required_approver_level END
  WHERE doc_type = 'SPEC';

-- External documents are approved by the owning department's head (L5); retiring one still goes to L6 (enforced in code).
UPDATE approval_matrix SET required_approver_level = 5 WHERE doc_type = 'ED' AND updated_by IS NULL;
