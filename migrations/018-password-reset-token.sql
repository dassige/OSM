-- Migration 018: Token-based password reset
-- Adds reset_token_hash and reset_token_expires columns to users table.
-- The token itself is never stored — only its SHA-256 hash.
-- reset_token_expires is a Unix timestamp (milliseconds) — NULL means no pending reset.

ALTER TABLE users ADD COLUMN reset_token_hash TEXT;
ALTER TABLE users ADD COLUMN reset_token_expires INTEGER;
