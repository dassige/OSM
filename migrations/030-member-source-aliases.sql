-- Member name matching for extraction sources that identify members by full
-- name only (the pdf-report plugin: "Andrew Keith" instead of "QFF Keith, A").
--
-- Each row links one name as it appears in the source report to a member.
-- source_key is the normalised name (lower case, accents and extra spaces
-- removed) used for lookups. match_type is auto (unique surname and first-name
-- initial match, made by the system) or manual (chosen by an admin).
-- A member may have several aliases. Deleting a member removes its aliases.
--
-- NOTE: the migration runner splits this file on semicolons, so comments must
-- never contain one.

CREATE TABLE IF NOT EXISTS member_source_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name TEXT NOT NULL,
  source_key TEXT NOT NULL UNIQUE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  match_type TEXT NOT NULL DEFAULT 'auto',
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_member_source_aliases_member ON member_source_aliases(member_id)
