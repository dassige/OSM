-- migrations/025-skill-kb-document.sql
-- Link a skill to an optional Knowledge Base document — refresher material members
-- can read before an in-person practical assessment (or any skill, regardless of
-- whether it also has an online verification form).

ALTER TABLE skills ADD COLUMN kb_document_id INTEGER REFERENCES knowledgebase_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_skills_kb_document_id ON skills (kb_document_id);
