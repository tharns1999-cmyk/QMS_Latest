-- The effective date the requester asked for; publishing uses it (never earlier than today). Add-only, so an older Worker still runs on this schema.
ALTER TABLE dars ADD COLUMN effective_date TEXT;
