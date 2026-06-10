-- Add geo_location column to api_call_log for storing resolved IP geolocation data.
-- Stored as a JSON TEXT object: { city, region, country } or NULL when unresolvable.
ALTER TABLE api_call_log ADD COLUMN geo_location TEXT;
