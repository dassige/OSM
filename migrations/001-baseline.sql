-- migrations/001-baseline.sql

CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  name TEXT NOT NULL, 
  email TEXT, 
  mobile TEXT, 
  messengerId TEXT, 
  enabled INTEGER DEFAULT 1, 
  notificationPreference TEXT DEFAULT 'email'
);

CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  name TEXT NOT NULL, 
  url TEXT, 
  critical_skill INTEGER DEFAULT 0, 
  enabled INTEGER DEFAULT 1, 
  url_type TEXT DEFAULT 'external'
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  email TEXT UNIQUE NOT NULL, 
  name TEXT, 
  hash TEXT NOT NULL, 
  salt TEXT NOT NULL, 
  role TEXT DEFAULT 'simple',
  enabled INTEGER DEFAULT 1,
  blocked INTEGER DEFAULT 0,
  login_attempts INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS forms (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  public_id TEXT UNIQUE, 
  name TEXT NOT NULL, 
  status INTEGER DEFAULT 0, 
  intro TEXT, 
  structure TEXT, 
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  min_score REAL DEFAULT 70,
  min_score_type TEXT DEFAULT 'percentage',
  max_tries INTEGER DEFAULT 3
);

CREATE TABLE IF NOT EXISTS live_forms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER NOT NULL,
  skill_expiring_date TEXT,
  member_id INTEGER NOT NULL,
  skill_form_public_id TEXT,
  form_access_code TEXT UNIQUE,
  form_status TEXT DEFAULT 'sent',  
  is_archived INTEGER DEFAULT 0,
  form_sent_datetime TEXT DEFAULT CURRENT_TIMESTAMP,
  form_submitted_datetime TEXT,
  form_submitted_data TEXT,
  form_reviewed_datetime TEXT,
  tries INTEGER DEFAULT 1,
  current_score REAL DEFAULT 0,
  FOREIGN KEY(skill_id) REFERENCES skills(id) ON DELETE CASCADE,
  FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS training_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  date TEXT NOT NULL, 
  skill_name TEXT NOT NULL, 
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INTEGER NOT NULL, 
  key TEXT NOT NULL, 
  value TEXT, 
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP, 
  user TEXT, 
  event_type TEXT, 
  title TEXT, 
  payload TEXT
);

CREATE TABLE IF NOT EXISTS email_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP, 
  recipient_name TEXT, 
  recipient_email TEXT, 
  status TEXT, 
  details TEXT
);