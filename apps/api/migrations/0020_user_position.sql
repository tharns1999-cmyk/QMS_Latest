-- Job title printed under a signer's name on documents; kept apart from the access role.
ALTER TABLE users ADD COLUMN position TEXT NOT NULL DEFAULT '';
