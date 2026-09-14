-- Backfills quiz_team_sessions.game_type and quiz_teams' play/scoring columns for
-- any database where migration 022 was already applied before these columns were
-- added to it (022's CREATE TABLE IF NOT EXISTS is then a no-op, so the table is
-- stuck on the old shape). The migration runner swallows "duplicate column name"
-- errors, so this is a no-op on a fresh install where 022 already created the
-- table with these columns present.
ALTER TABLE quiz_team_sessions ADD COLUMN game_type TEXT NOT NULL DEFAULT 'timed';
ALTER TABLE quiz_teams ADD COLUMN status TEXT DEFAULT 'pending';
ALTER TABLE quiz_teams ADD COLUMN submitted_data TEXT;
ALTER TABLE quiz_teams ADD COLUMN achieved_score REAL;
ALTER TABLE quiz_teams ADD COLUMN max_score REAL;
ALTER TABLE quiz_teams ADD COLUMN submitted_at TEXT;
