-- Skills report snapshots for the pdf-report extraction plugin.
--
-- Every accepted "Skills Expiring in the Next Six Months" PDF becomes one row,
-- whether it was uploaded through the UI/API, picked up from GCS or read from
-- the local PDF_LOCAL_PATH file. The newest row is the data the app uses.
--
-- file_data holds the original PDF base64-encoded (TEXT, not BLOB) so the
-- DB-only SQL backup can dump and restore it as a plain string literal.
-- records holds the parsed extraction records as JSON.
-- source_ref is the source's change marker (GCS object generation or local
-- file mtime and size) used to skip files that were already processed.
--
-- NOTE: the migration runner splits this file on semicolons, so comments must
-- never contain one.

CREATE TABLE IF NOT EXISTS extraction_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin TEXT NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT,
  file_name TEXT,
  file_hash TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_data TEXT NOT NULL,
  report_created_date TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  member_count INTEGER NOT NULL,
  skill_count INTEGER NOT NULL,
  warnings TEXT NOT NULL DEFAULT '[]',
  records TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_extraction_snapshots_source ON extraction_snapshots(source, id)
