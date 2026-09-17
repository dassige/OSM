-- migrations/026-kb-resolver-token.sql
-- N-PUB-2 / N-AUTH-1 security fix: the public /api/knowledgebase/resolve/:id endpoint
-- (used to expand {{kb:N}} placeholders embedded in form/survey rich text) accepted the
-- document's sequential auto-increment id, letting an unauthenticated caller enumerate
-- every active Knowledge Base document's slug/title. resolver_token is a random,
-- unguessable identifier used in its place. Unlike `slug`, it is never rotated, so
-- embedded {{kb:<token>}} links keep working across a slug rotation (the original
-- purpose the sequential id served) without being enumerable.

ALTER TABLE knowledgebase_documents ADD COLUMN resolver_token TEXT;

UPDATE knowledgebase_documents
SET resolver_token = lower(hex(randomblob(16)))
WHERE resolver_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_documents_resolver_token ON knowledgebase_documents (resolver_token);
