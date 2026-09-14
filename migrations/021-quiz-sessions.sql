-- Quiz Sessions — Phase 2: self-paced play via player access codes.
-- A session is a snapshot of a score-based quiz_game, run for a specific set of
-- members (one access code each) — mirrors the surveys template/live/tracking split.
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  game_type TEXT NOT NULL,
  game_snapshot TEXT NOT NULL, -- JSON: { name, description, game_type, questions } frozen at session creation
  is_archived INTEGER DEFAULT 0,
  created_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(game_id) REFERENCES quiz_games(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS quiz_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  member_id INTEGER,
  access_code TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'sent', -- 'sent' | 'submitted'
  submitted_data TEXT,
  achieved_score REAL,
  max_score REAL,
  submitted_at TEXT,
  FOREIGN KEY(session_id) REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_quiz_players_session ON quiz_players(session_id);
