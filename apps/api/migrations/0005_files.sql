-- R2 object keys of the controlled PDF. The DAR's file becomes the document's file on publish; objects are never overwritten.
ALTER TABLE dars ADD COLUMN file_key TEXT;
ALTER TABLE documents ADD COLUMN file_key TEXT;
