-- Add expiry date to Knowledge Base documents.
-- NULL means no expiry set. A date value means the document should be reviewed after that date.
ALTER TABLE knowledgebase_documents ADD COLUMN expires_at DATE;
