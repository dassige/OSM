-- Migration: 004-add-surveys.sql
-- Description: Creates tables for the anonymous survey feature.

-- 1. Core Surveys Table
-- Stores the survey configuration and the JSON structure of the form.
CREATE TABLE IF NOT EXISTS surveys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT UNIQUE NOT NULL, -- Unique GUID for the public survey URL
    name TEXT NOT NULL,
    intro_text TEXT,
    structure TEXT NOT NULL, -- JSON string defining the survey fields (reused from form builder)
    status TEXT DEFAULT 'draft', -- 'draft', 'published', 'closed'
    created_by INTEGER, -- Optional: track which admin created it
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 2. Survey Tracking Table
-- Tracks WHICH members have been sent the survey and their submission status.
-- Critically, this table does NOT link to the actual answers.
CREATE TABLE IF NOT EXISTS survey_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    survey_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    access_code TEXT UNIQUE NOT NULL, -- Unique GUID appended to the URL for a specific member
    status TEXT DEFAULT 'pending', -- 'pending', 'submitted'
    completed_at DATETIME,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    UNIQUE(survey_id, member_id) -- Prevent duplicate entries for the same member per survey
);

-- 3. Survey Responses Table
-- Stores the actual submitted JSON data. 
-- By design, there is NO foreign key mapping back to `survey_tracking` or `members`.
CREATE TABLE IF NOT EXISTS survey_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    survey_id INTEGER NOT NULL,
    submitted_data TEXT NOT NULL, -- JSON string of the anonymous answers
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
);

-- Create indices to optimize query performance for the management dashboard
CREATE INDEX IF NOT EXISTS idx_surveys_status ON surveys(status);
CREATE INDEX IF NOT EXISTS idx_survey_tracking_status ON survey_tracking(survey_id, status);
CREATE INDEX IF NOT EXISTS idx_survey_tracking_access_code ON survey_tracking(access_code);