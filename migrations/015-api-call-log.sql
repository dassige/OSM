-- Migration 015: API call log
-- Tracks every request authenticated via X-API-Key header.

CREATE TABLE IF NOT EXISTS api_call_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key_id  INTEGER,
    key_name    TEXT,
    key_prefix  TEXT,
    method      TEXT NOT NULL,
    endpoint    TEXT NOT NULL,
    origin_ip   TEXT,
    user_agent  TEXT,
    status_code INTEGER,
    logged_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_api_call_log_logged_at  ON api_call_log (logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_call_log_api_key_id ON api_call_log (api_key_id);
