CREATE TABLE IF NOT EXISTS api_keys (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  key_prefix     TEXT    NOT NULL,
  key_hash       TEXT    NOT NULL UNIQUE,
  role           TEXT    NOT NULL DEFAULT 'admin',
  created_by     TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  last_used_at   TEXT,
  active         INTEGER NOT NULL DEFAULT 1
);
