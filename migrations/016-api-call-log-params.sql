-- Add query_params and request_body columns to api_call_log for richer diagnostics.
-- Both are JSON TEXT, NULL when empty. Sensitive field values are masked (***) at capture time.
ALTER TABLE api_call_log ADD COLUMN query_params TEXT;
ALTER TABLE api_call_log ADD COLUMN request_body TEXT;
