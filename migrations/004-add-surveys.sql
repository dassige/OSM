-- Templates Table
CREATE TABLE IF NOT EXISTS surveys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    intro_text TEXT,
    status INTEGER DEFAULT 0,
    structure TEXT NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
);

-- Live Instances Table (Snapshot of the template at publish time)
CREATE TABLE IF NOT EXISTS survey_live (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER,
    name TEXT NOT NULL,
    intro_text TEXT,
    structure TEXT NOT NULL,
    published_by INTEGER,
    is_archived INTEGER DEFAULT 0,
    published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(template_id) REFERENCES surveys(id),
    FOREIGN KEY(published_by) REFERENCES users(id)
);

-- Tracking Table (Linked to the Live Instance)
CREATE TABLE IF NOT EXISTS survey_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    survey_live_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    access_code TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'pending',
    completed_at DATETIME,
    FOREIGN KEY(survey_live_id) REFERENCES survey_live(id),
    FOREIGN KEY(member_id) REFERENCES members(id)
);

-- Responses Table (Linked to the Live Instance, Anonymous)
CREATE TABLE IF NOT EXISTS survey_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    survey_live_id INTEGER NOT NULL,
    submitted_data TEXT NOT NULL,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(survey_live_id) REFERENCES survey_live(id)
);