-- Quiz Team Sessions — Phase 3: team setup for both game types.
-- A team session snapshots a game's questions and organizes selected members
-- into named teams (drag-and-drop in the UI). Each team gets one access code.
-- Score-based team sessions are playable immediately — the whole team answers
-- together on the captain's device, reusing the same self-paced scoring flow
-- as Phase 2's individual sessions, just attributed to the team. Timed team
-- sessions are setup-only for now: whichever device enters the code first
-- becomes that team's captain screen once live hosting (Phase 4) exists.
-- Ephemeral, like quiz_sessions: not a reusable roster, just the setup for
-- one game run.
CREATE TABLE IF NOT EXISTS quiz_team_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  game_type TEXT NOT NULL, -- 'score' | 'timed' — 'score' is playable now, 'timed' awaits live hosting
  game_snapshot TEXT NOT NULL, -- JSON: { name, description, game_type, questions } frozen at setup
  is_archived INTEGER DEFAULT 0,
  created_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(game_id) REFERENCES quiz_games(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS quiz_teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_session_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  access_code TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending' | 'submitted' (score-based team play, unused by Timed until live hosting)
  submitted_data TEXT,
  achieved_score REAL,
  max_score REAL,
  submitted_at TEXT,
  FOREIGN KEY(team_session_id) REFERENCES quiz_team_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  FOREIGN KEY(team_id) REFERENCES quiz_teams(id) ON DELETE CASCADE,
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quiz_teams_session ON quiz_teams(team_session_id);
CREATE INDEX IF NOT EXISTS idx_quiz_team_members_team ON quiz_team_members(team_id);
