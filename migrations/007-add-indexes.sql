-- migrations/007-add-indexes.sql
-- Performance indexes for high-frequency query patterns

-- live_forms: filtered by member, skill, status, and archive flag
CREATE INDEX IF NOT EXISTS idx_live_forms_member_id      ON live_forms(member_id);
CREATE INDEX IF NOT EXISTS idx_live_forms_skill_id       ON live_forms(skill_id);
CREATE INDEX IF NOT EXISTS idx_live_forms_form_status    ON live_forms(form_status);
CREATE INDEX IF NOT EXISTS idx_live_forms_is_archived    ON live_forms(is_archived);
-- Composite for member+skill lookups (e.g. "does this member have a form for this skill?")
CREATE INDEX IF NOT EXISTS idx_live_forms_member_skill   ON live_forms(member_id, skill_id);

-- survey_tracking: filtered by survey instance and member
CREATE INDEX IF NOT EXISTS idx_survey_tracking_live_id   ON survey_tracking(survey_live_id);
CREATE INDEX IF NOT EXISTS idx_survey_tracking_member_id ON survey_tracking(member_id);
CREATE INDEX IF NOT EXISTS idx_survey_tracking_status    ON survey_tracking(status);

-- survey_responses: filtered by survey instance
CREATE INDEX IF NOT EXISTS idx_survey_responses_live_id  ON survey_responses(survey_live_id);

-- event_log: sorted/filtered by timestamp and type
CREATE INDEX IF NOT EXISTS idx_event_log_timestamp       ON event_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_event_log_event_type      ON event_log(event_type);

-- email_history: looked up by recipient and sorted by date
CREATE INDEX IF NOT EXISTS idx_email_history_recipient   ON email_history(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_history_timestamp   ON email_history(timestamp);
