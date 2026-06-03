-- migrations/010-etl-plugin-fields.sql
-- ETL plugin enrichment fields for members and skills.
-- The original name column in both tables is preserved.

-- members: rank/name breakdown + OSM source identifier
ALTER TABLE members ADD COLUMN rank          TEXT;
ALTER TABLE members ADD COLUMN first_name    TEXT;
ALTER TABLE members ADD COLUMN last_name     TEXT;
ALTER TABLE members ADD COLUMN member_osm_id TEXT;

-- skills: OSM source identifier + category grouping
ALTER TABLE skills ADD COLUMN skill_osm_id   TEXT;
ALTER TABLE skills ADD COLUMN skill_category TEXT;

-- Support future lookups when matching extracted records to DB rows
CREATE INDEX IF NOT EXISTS idx_members_member_osm_id ON members (member_osm_id);
CREATE INDEX IF NOT EXISTS idx_skills_skill_osm_id   ON skills  (skill_osm_id);
CREATE INDEX IF NOT EXISTS idx_skills_skill_category ON skills  (skill_category);
