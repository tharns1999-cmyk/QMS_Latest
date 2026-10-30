-- VCC Phase 2 Enhancement: Distinguish Logical Group from Physical Composite Set
-- - LOGICAL_GROUP: Container for grouping child instruments; work orders are issued to children.
-- - COMPOSITE_SET: Physical set of instruments calibrated together as 1 unit with 1 certificate.
ALTER TABLE vcc_assets ADD COLUMN group_nature TEXT NOT NULL DEFAULT 'LOGICAL_GROUP' CHECK (group_nature IN ('LOGICAL_GROUP', 'COMPOSITE_SET'));

