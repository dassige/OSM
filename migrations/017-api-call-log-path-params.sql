-- Add path_params column so route parameters (e.g. { "id": "42" }) are stored alongside
-- query_params and request_body. NULL when the matched route has no path parameters.
ALTER TABLE api_call_log ADD COLUMN path_params TEXT;
