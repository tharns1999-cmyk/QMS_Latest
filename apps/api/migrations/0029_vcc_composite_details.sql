-- VCC Flat Instrument Model: Store physical sub-component details for Composite Sets
-- (e.g., SW001 standard weight pieces calibrated together under 1 certificate)
ALTER TABLE vcc_assets ADD COLUMN composite_details TEXT NOT NULL DEFAULT '';
