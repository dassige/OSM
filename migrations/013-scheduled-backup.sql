-- Scheduled automatic backup configuration (singleton row, id = 1)
CREATE TABLE IF NOT EXISTS scheduled_backup_config (
    id              INTEGER PRIMARY KEY DEFAULT 1,
    enabled         INTEGER NOT NULL DEFAULT 0,
    backup_type     TEXT NOT NULL DEFAULT 'db',
    schedule_type   TEXT NOT NULL DEFAULT 'daily',
    schedule_time   TEXT NOT NULL DEFAULT '02:00',
    schedule_days   TEXT NOT NULL DEFAULT '[1]',
    interval_value  INTEGER NOT NULL DEFAULT 6,
    backup_location TEXT NOT NULL DEFAULT '',
    retention_type  TEXT NOT NULL DEFAULT 'count',
    retention_value INTEGER NOT NULL DEFAULT 10,
    last_run_at     TEXT,
    next_run_at     TEXT,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Ensure the singleton row always exists after migration
INSERT OR IGNORE INTO scheduled_backup_config (id) VALUES (1);

-- History log for scheduled backup runs
CREATE TABLE IF NOT EXISTS scheduled_backup_log (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at            TEXT NOT NULL,
    status            TEXT NOT NULL,
    backup_type       TEXT NOT NULL,
    filename          TEXT,
    file_size         INTEGER,
    retention_cleaned INTEGER NOT NULL DEFAULT 0,
    error_message     TEXT
);
