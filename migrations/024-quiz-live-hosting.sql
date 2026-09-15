-- Live-hosted Timed quiz play (Phase 4). Timed sessions/team-sessions are now
-- always played through a launched host screen: one shared question at a
-- time, controlled by an admin, synced to every joined player/team. A phase
-- cursor on the session tracks progress, and quiz_live_answers records each
-- participant's per-question answer as it happens (not just the final
-- submitted_data blob), enabling live answered-counts, a leaderboard between
-- questions, and resuming a closed host screen at the right point instead of
-- restarting the game. Unused (left at defaults) for Score-type sessions,
-- which remain self-paced.
ALTER TABLE quiz_sessions ADD COLUMN current_question_index INTEGER NOT NULL DEFAULT -1;
ALTER TABLE quiz_sessions ADD COLUMN game_phase TEXT NOT NULL DEFAULT 'lobby';
ALTER TABLE quiz_sessions ADD COLUMN question_started_at TEXT;

ALTER TABLE quiz_team_sessions ADD COLUMN current_question_index INTEGER NOT NULL DEFAULT -1;
ALTER TABLE quiz_team_sessions ADD COLUMN game_phase TEXT NOT NULL DEFAULT 'lobby';
ALTER TABLE quiz_team_sessions ADD COLUMN question_started_at TEXT;

-- game_phase: 'lobby' | 'question' | 'reveal' | 'leaderboard' | 'finished'

CREATE TABLE IF NOT EXISTS quiz_live_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_kind TEXT NOT NULL, -- 'individual' | 'team'
  session_id INTEGER NOT NULL, -- quiz_sessions.id or quiz_team_sessions.id, per session_kind
  participant_id INTEGER NOT NULL, -- quiz_players.id or quiz_teams.id, per session_kind
  question_index INTEGER NOT NULL,
  answer TEXT,
  time_taken_ms INTEGER,
  is_correct INTEGER NOT NULL DEFAULT 0,
  points_awarded REAL NOT NULL DEFAULT 0,
  answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_live_answers_unique
  ON quiz_live_answers(session_kind, session_id, participant_id, question_index);
CREATE INDEX IF NOT EXISTS idx_quiz_live_answers_lookup
  ON quiz_live_answers(session_kind, session_id, question_index);
