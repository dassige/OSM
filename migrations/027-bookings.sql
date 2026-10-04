-- Booking Events — slot booking for scheduled appointments (e.g. the annual
-- nurse health screening). Mirrors the survey pattern: a reusable template is
-- configured, then published as a live event snapshot with its own GUID slug.
--
-- Slot dates/times are stored as LOCAL wall-clock values in the brigade
-- timezone (slot_date 'YYYY-MM-DD', start_time/end_time 'HH:MM') because they
-- are physical appointments at one location. Audit timestamps are UTC.
--
-- NOTE: the migration runner splits this file on semicolons, so comments must
-- never contain one.

-- Reusable configuration. schedule is a JSON array of
-- { date: 'YYYY-MM-DD', windows: [{ start: 'HH:MM', end: 'HH:MM' }] }
-- and fields is a JSON array of
-- { id, label, type: 'text'|'tel'|'email'|'textarea', required: bool }
CREATE TABLE IF NOT EXISTS booking_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,
  contact_info TEXT,
  slot_minutes INTEGER NOT NULL DEFAULT 15,
  slot_capacity INTEGER NOT NULL DEFAULT 1,
  schedule TEXT NOT NULL DEFAULT '[]',
  fields TEXT NOT NULL DEFAULT '[]',
  access_type TEXT NOT NULL DEFAULT 'personal',
  show_booked_names INTEGER NOT NULL DEFAULT 0,
  allow_cancel INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Published event — a snapshot of the template at publish time.
-- access_type 'general' = one shared link, member picks their name.
-- access_type 'personal' = one access code per invited member.
-- Lifecycle flags: is_locked (read-only for members), is_enabled (link
-- reachable), is_archived (one-way, link permanently dead).
CREATE TABLE IF NOT EXISTS booking_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER REFERENCES booking_templates(id) ON DELETE SET NULL,
  public_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,
  contact_info TEXT,
  slot_minutes INTEGER NOT NULL DEFAULT 15,
  fields TEXT NOT NULL DEFAULT '[]',
  access_type TEXT NOT NULL DEFAULT 'personal' CHECK (access_type IN ('general', 'personal')),
  show_booked_names INTEGER NOT NULL DEFAULT 0,
  allow_cancel INTEGER NOT NULL DEFAULT 1,
  is_locked INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  is_archived INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  published_by TEXT,
  published_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS booking_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES booking_events(id) ON DELETE CASCADE,
  slot_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1,
  is_blocked INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_booking_slots_event ON booking_slots(event_id, slot_date, start_time);

-- Invited members — the roster for both access types. access_code is only
-- set for personal access (NULLs do not collide on a UNIQUE column).
CREATE TABLE IF NOT EXISTS booking_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES booking_events(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  access_code TEXT UNIQUE,
  notified_at TEXT,
  notified_via TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, member_id)
);

-- One booking per member per event. field_values is a JSON object keyed by
-- the event field ids. source is 'member' or 'admin'.
CREATE TABLE IF NOT EXISTS booking_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES booking_events(id) ON DELETE CASCADE,
  slot_id INTEGER NOT NULL REFERENCES booking_slots(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  field_values TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'member',
  booked_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_booking_entries_slot ON booking_entries(slot_id)
