-- A reviewer or approver can send a DAR back to its requester instead of rejecting it. The DAR stays PENDING_REVIEW (so the
-- document stays locked by dars_one_in_flight) with awaiting_requester = 1 until the requester resubmits or withdraws it.
ALTER TABLE dars ADD COLUMN awaiting_requester INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dars ADD COLUMN returned_at TEXT;
ALTER TABLE dars ADD COLUMN returned_by TEXT REFERENCES users(id);
ALTER TABLE dars ADD COLUMN return_comment TEXT;
ALTER TABLE dars ADD COLUMN return_count INTEGER NOT NULL DEFAULT 0;
