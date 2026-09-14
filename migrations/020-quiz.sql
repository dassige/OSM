-- Quiz Games — Phase 1 (foundations): question bank + game creation.
-- Questions are stored as a JSON array on the game record, mirroring the
-- `forms.structure` pattern — the whole bank is edited and saved as one unit.
CREATE TABLE IF NOT EXISTS quiz_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  game_type TEXT NOT NULL DEFAULT 'score', -- 'score' (self-paced, points per question) | 'timed' (live, speed-scored)
  enabled INTEGER DEFAULT 1,
  questions TEXT DEFAULT '[]', -- JSON array: [{ id, text, choiceA, choiceB, choiceC, choiceD, correctChoice, points, timeLimitSeconds }]
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
