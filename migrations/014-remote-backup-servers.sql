-- Remote OpReady server registry for centralised pull-backup (max 5 enforced at app layer)
CREATE TABLE IF NOT EXISTS remote_backup_servers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL UNIQUE,
    url             TEXT NOT NULL,
    api_key         TEXT NOT NULL,
    backup_type     TEXT NOT NULL DEFAULT 'db',
    backup_location TEXT NOT NULL DEFAULT '',
    -- embedded schedule config (max-5 rows makes a separate table unnecessary)
    schedule_enabled  INTEGER NOT NULL DEFAULT 0,
    schedule_type     TEXT NOT NULL DEFAULT 'daily',
    schedule_time     TEXT NOT NULL DEFAULT '02:00',
    schedule_days     TEXT NOT NULL DEFAULT '[1]',
    interval_value    INTEGER NOT NULL DEFAULT 6,
    retention_type    TEXT NOT NULL DEFAULT 'count',
    retention_value   INTEGER NOT NULL DEFAULT 10,
    -- run tracking
    last_run_at     TEXT,
    next_run_at     TEXT,
    last_run_status TEXT,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Per-server pull-backup history
CREATE TABLE IF NOT EXISTS remote_backup_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id     INTEGER NOT NULL,
    run_at        TEXT NOT NULL,
    triggered_by  TEXT NOT NULL DEFAULT 'scheduler',
    status        TEXT NOT NULL,
    backup_type   TEXT NOT NULL,
    filename      TEXT,
    file_size     INTEGER,
    error_message TEXT
);
