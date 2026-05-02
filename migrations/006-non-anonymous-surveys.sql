-- Add anonymity toggle to surveys
ALTER TABLE surveys ADD COLUMN is_anonymous BOOLEAN DEFAULT 1;
ALTER TABLE survey_live ADD COLUMN is_anonymous BOOLEAN DEFAULT 1;

-- Link responses to members
ALTER TABLE survey_responses ADD COLUMN member_id INTEGER REFERENCES members(id) ON DELETE SET NULL;
-- Update the live snapshot table to store the anonymity preference

-- Indexing for performance on results lookups
CREATE INDEX idx_survey_responses_member ON survey_responses(member_id);