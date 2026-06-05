-- Knowledge Base: categories and documents
-- Categories support unlimited parent/child nesting with documents referencing a category.
-- Files are stored on the filesystem or a cloud bucket with only metadata in the DB.

CREATE TABLE IF NOT EXISTS knowledgebase_categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    parent_id  INTEGER REFERENCES knowledgebase_categories(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledgebase_documents (
    id                INTEGER  PRIMARY KEY AUTOINCREMENT,
    slug              TEXT     NOT NULL UNIQUE,
    title             TEXT     NOT NULL,
    description       TEXT,
    category_id       INTEGER  REFERENCES knowledgebase_categories(id) ON DELETE SET NULL,
    original_filename TEXT     NOT NULL,
    file_size         INTEGER  NOT NULL DEFAULT 0,
    mime_type         TEXT     NOT NULL DEFAULT 'application/pdf',
    storage_type      TEXT     NOT NULL DEFAULT 'local',
    storage_path      TEXT     NOT NULL,
    is_active         INTEGER  NOT NULL DEFAULT 1,
    uploaded_by       TEXT,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kb_docs_slug     ON knowledgebase_documents(slug);
CREATE INDEX IF NOT EXISTS idx_kb_docs_category ON knowledgebase_documents(category_id);
CREATE INDEX IF NOT EXISTS idx_kb_cats_parent   ON knowledgebase_categories(parent_id);
