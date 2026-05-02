-- migrations/005-update-survey-fk.sql

-- Disable foreign key checks to allow the table swap
PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- 1. Create a new temporary table with the updated foreign key constraint
CREATE TABLE survey_tracking_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    survey_live_id INTEGER,
    member_id INTEGER,
    access_code TEXT UNIQUE,
    status TEXT DEFAULT 'pending',
    completed_at TEXT,
    -- Apply the SET NULL behavior here:
    FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE SET NULL,
    FOREIGN KEY(survey_live_id) REFERENCES survey_live(id) ON DELETE CASCADE
);

-- 2. Copy all existing data from the old table to the new one
INSERT INTO survey_tracking_new (id, survey_live_id, member_id, access_code, status, completed_at)
SELECT id, survey_live_id, member_id, access_code, status, completed_at FROM survey_tracking;

-- 3. Drop the old table and rename the new one
DROP TABLE survey_tracking;
ALTER TABLE survey_tracking_new RENAME TO survey_tracking;

COMMIT;

-- Re-enable foreign key checks
PRAGMA foreign_keys = ON;