-- Booking Events: allow more than one booking per member (configurable maximum)
-- and guarantee a published event can never contain two identical slots.
--
-- NOTE: the migration runner splits this file on semicolons, so comments must
-- never contain one.

-- Maximum bookings a member may hold for one event (1 = previous behaviour)
ALTER TABLE booking_templates ADD COLUMN max_bookings INTEGER NOT NULL DEFAULT 1;
ALTER TABLE booking_events ADD COLUMN max_bookings INTEGER NOT NULL DEFAULT 1;

-- booking_entries had UNIQUE (event_id, member_id). SQLite cannot drop a
-- constraint, so rebuild the table: a member may now hold several bookings per
-- event, but never the same slot twice. Existing rows are copied unchanged.
CREATE TABLE IF NOT EXISTS booking_entries_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES booking_events(id) ON DELETE CASCADE,
  slot_id INTEGER NOT NULL REFERENCES booking_slots(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  field_values TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'member',
  booked_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (slot_id, member_id)
);

INSERT INTO booking_entries_v2 (id, event_id, slot_id, member_id, field_values, source, booked_at, updated_at)
  SELECT id, event_id, slot_id, member_id, field_values, source, booked_at, updated_at FROM booking_entries;

DROP TABLE booking_entries;

ALTER TABLE booking_entries_v2 RENAME TO booking_entries;

CREATE INDEX IF NOT EXISTS idx_booking_entries_slot ON booking_entries(slot_id);
CREATE INDEX IF NOT EXISTS idx_booking_entries_member ON booking_entries(event_id, member_id);

-- One slot per date/start time per event (slot generation already de-duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_slots_unique ON booking_slots(event_id, slot_date, start_time)
