-- DAR-YY-NNN and EDR-YY-NNN were counted from every earlier row on each read, so one DAR list cost about n^2/2 row reads.
-- Store them once, when the DAR is submitted. The backfill uses the same rule the reads used (rank by id within the year of created_at),
-- so every existing DAR keeps the number people already see.
ALTER TABLE dars ADD COLUMN dar_no TEXT;
ALTER TABLE dars ADD COLUMN edr_no TEXT;

UPDATE dars SET
  dar_no = 'DAR-' || substr(created_at, 3, 2) || '-' || printf('%03d', (SELECT COUNT(*) FROM dars d2 WHERE substr(d2.created_at, 1, 4) = substr(dars.created_at, 1, 4) AND d2.id <= dars.id)),
  edr_no = CASE WHEN doc_type = 'ED' THEN 'EDR-' || substr(created_at, 3, 2) || '-' || printf('%03d', (SELECT COUNT(*) FROM dars d2 WHERE d2.doc_type = 'ED' AND substr(d2.created_at, 1, 4) = substr(dars.created_at, 1, 4) AND d2.id <= dars.id)) END;

-- Two DARs can never share a number (NULLs are allowed: edr_no is only set for external documents).
CREATE UNIQUE INDEX dars_dar_no ON dars (dar_no);
CREATE UNIQUE INDEX dars_edr_no ON dars (edr_no);
