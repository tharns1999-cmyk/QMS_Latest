-- External documents (doc_type ED) use the same request pipeline; these columns hold what only they have. Add-only.
ALTER TABLE dars ADD COLUMN ext_issuer TEXT;
ALTER TABLE dars ADD COLUMN ext_edition TEXT;
ALTER TABLE dars ADD COLUMN review_cycle_months INTEGER;
ALTER TABLE documents ADD COLUMN ext_issuer TEXT;
ALTER TABLE documents ADD COLUMN ext_edition TEXT;
ALTER TABLE documents ADD COLUMN next_review_date TEXT;
