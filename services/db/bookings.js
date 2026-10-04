const crypto = require("crypto");
const { initDB } = require("./connection");
const { sanitizeRichText } = require("../html-sanitizer");

// Error codes thrown by saveBooking() — routes map these to 4xx responses.
const BOOKING_ERRORS = {
  SLOT_NOT_FOUND: "SLOT_NOT_FOUND",
  SLOT_BLOCKED: "SLOT_BLOCKED",
  SLOT_FULL: "SLOT_FULL",
  ALREADY_BOOKED: "ALREADY_BOOKED",
};

function bookingError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function parseTemplate(row) {
  if (!row) return row;
  return {
    ...row,
    schedule: parseJson(row.schedule, []),
    fields: parseJson(row.fields, []),
    show_booked_names: row.show_booked_names === 1,
    allow_cancel: row.allow_cancel === 1,
  };
}

function parseEvent(row) {
  if (!row) return row;
  return {
    ...row,
    fields: parseJson(row.fields, []),
    show_booked_names: row.show_booked_names === 1,
    allow_cancel: row.allow_cancel === 1,
    is_locked: row.is_locked === 1,
    is_enabled: row.is_enabled === 1,
    is_archived: row.is_archived === 1,
  };
}

// ── Templates ────────────────────────────────────────────────────────────────

async function getBookingTemplates() {
  const db = await initDB();
  const rows = await db.all("SELECT * FROM booking_templates ORDER BY name COLLATE NOCASE ASC");
  return rows.map(parseTemplate);
}

async function getBookingTemplateById(id) {
  const db = await initDB();
  return parseTemplate(await db.get("SELECT * FROM booking_templates WHERE id = ?", id));
}

async function createBookingTemplate(t, createdBy) {
  const db = await initDB();
  const result = await db.run(
    `INSERT INTO booking_templates
       (name, description, location, contact_info, slot_minutes, slot_capacity, schedule, fields,
        access_type, show_booked_names, allow_cancel, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    t.name, sanitizeRichText(t.description || ""), t.location || "", t.contact_info || "",
    t.slot_minutes, t.slot_capacity, JSON.stringify(t.schedule || []), JSON.stringify(t.fields || []),
    t.access_type, t.show_booked_names ? 1 : 0, t.allow_cancel ? 1 : 0, createdBy || null,
  );
  return result.lastID;
}

async function updateBookingTemplate(id, t) {
  const db = await initDB();
  const result = await db.run(
    `UPDATE booking_templates SET
       name = ?, description = ?, location = ?, contact_info = ?, slot_minutes = ?, slot_capacity = ?,
       schedule = ?, fields = ?, access_type = ?, show_booked_names = ?, allow_cancel = ?,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    t.name, sanitizeRichText(t.description || ""), t.location || "", t.contact_info || "",
    t.slot_minutes, t.slot_capacity, JSON.stringify(t.schedule || []), JSON.stringify(t.fields || []),
    t.access_type, t.show_booked_names ? 1 : 0, t.allow_cancel ? 1 : 0, id,
  );
  return result.changes;
}

async function deleteBookingTemplate(id) {
  const db = await initDB();
  const result = await db.run("DELETE FROM booking_templates WHERE id = ?", id);
  return result.changes;
}

// Copies everything except the schedule — dates are always event-specific, so
// the copy starts with an empty schedule for the admin to fill in.
async function duplicateBookingTemplate(id, createdBy) {
  const db = await initDB();
  const src = await db.get("SELECT * FROM booking_templates WHERE id = ?", id);
  if (!src) return null;
  const result = await db.run(
    `INSERT INTO booking_templates
       (name, description, location, contact_info, slot_minutes, slot_capacity, schedule, fields,
        access_type, show_booked_names, allow_cancel, created_by)
     VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?)`,
    `${src.name} (Copy)`.slice(0, 200), src.description, src.location, src.contact_info,
    src.slot_minutes, src.slot_capacity, src.fields,
    src.access_type, src.show_booked_names, src.allow_cancel, createdBy || null,
  );
  return result.lastID;
}

// ── Publishing ───────────────────────────────────────────────────────────────

/**
 * Snapshot a template into a live event with its slots and invite roster.
 * @param {object} template  parsed template row
 * @param {object} options   { name, access_type, show_booked_names, allow_cancel }
 * @param {Array}  slots     output of bookingService.generateSlots()
 * @param {number[]} memberIds
 * @param {string} publishedBy actor name
 */
async function publishBookingEvent(template, options, slots, memberIds, publishedBy) {
  const db = await initDB();
  await db.exec("BEGIN TRANSACTION");
  try {
    const publicId = crypto.randomUUID();
    const eventResult = await db.run(
      `INSERT INTO booking_events
         (template_id, public_id, name, description, location, contact_info, slot_minutes, fields,
          access_type, show_booked_names, allow_cancel, published_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      template.id, publicId, options.name || template.name, sanitizeRichText(template.description || ""),
      template.location || "", template.contact_info || "", template.slot_minutes,
      JSON.stringify(template.fields || []), options.access_type,
      options.show_booked_names ? 1 : 0, options.allow_cancel ? 1 : 0, publishedBy || null,
    );
    const eventId = eventResult.lastID;

    const slotStmt = await db.prepare(
      "INSERT INTO booking_slots (event_id, slot_date, start_time, end_time, capacity) VALUES (?, ?, ?, ?, ?)",
    );
    for (const s of slots) {
      await slotStmt.run(eventId, s.slot_date, s.start_time, s.end_time, s.capacity);
    }
    await slotStmt.finalize();

    const personal = options.access_type === "personal";
    const inviteStmt = await db.prepare(
      "INSERT INTO booking_invites (event_id, member_id, access_code) VALUES (?, ?, ?)",
    );
    for (const memberId of [...new Set(memberIds)]) {
      await inviteStmt.run(eventId, memberId, personal ? crypto.randomUUID() : null);
    }
    await inviteStmt.finalize();

    await db.exec("COMMIT");
    return { eventId, publicId };
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

// ── Live events ──────────────────────────────────────────────────────────────

async function getBookingEvents() {
  const db = await initDB();
  return db.all(`
    SELECT e.id, e.template_id, e.public_id, e.name, e.location, e.access_type,
           e.show_booked_names, e.allow_cancel, e.is_locked, e.is_enabled, e.is_archived,
           e.archived_at, e.published_by, e.published_at,
           (SELECT COUNT(*) FROM booking_invites i WHERE i.event_id = e.id) AS invited_count,
           (SELECT COUNT(*) FROM booking_entries b WHERE b.event_id = e.id) AS booked_count,
           (SELECT COUNT(*) FROM booking_slots s WHERE s.event_id = e.id AND s.is_blocked = 0) AS slot_count,
           (SELECT COALESCE(SUM(s.capacity), 0) FROM booking_slots s WHERE s.event_id = e.id AND s.is_blocked = 0) AS total_capacity,
           (SELECT MIN(s.slot_date) FROM booking_slots s WHERE s.event_id = e.id) AS first_date,
           (SELECT MAX(s.slot_date) FROM booking_slots s WHERE s.event_id = e.id) AS last_date
    FROM booking_events e
    ORDER BY e.published_at DESC, e.id DESC
  `).then((rows) => rows.map(parseEvent));
}

async function getBookingEventById(id) {
  const db = await initDB();
  return parseEvent(await db.get("SELECT * FROM booking_events WHERE id = ?", id));
}

async function getBookingEventByPublicId(publicId) {
  const db = await initDB();
  return parseEvent(await db.get("SELECT * FROM booking_events WHERE public_id = ?", publicId));
}

async function getBookingSlots(eventId) {
  const db = await initDB();
  return db.all(
    `SELECT s.id, s.slot_date, s.start_time, s.end_time, s.capacity, s.is_blocked,
            COUNT(b.id) AS booked_count
     FROM booking_slots s
     LEFT JOIN booking_entries b ON b.slot_id = s.id
     WHERE s.event_id = ?
     GROUP BY s.id
     ORDER BY s.slot_date ASC, s.start_time ASC`,
    eventId,
  );
}

// Roster: every invited member with their booking (if any).
async function getBookingInvites(eventId) {
  const db = await initDB();
  return db.all(
    `SELECT i.id AS invite_id, i.member_id, i.access_code, i.notified_at, i.notified_via,
            m.name AS member_name, m.rank AS member_rank,
            m.first_name AS member_first_name, m.last_name AS member_last_name,
            m.email, m.mobile, m.notificationPreference AS notification_preference,
            b.id AS entry_id, b.slot_id, b.booked_at,
            s.slot_date, s.start_time, s.end_time
     FROM booking_invites i
     JOIN members m ON m.id = i.member_id
     LEFT JOIN booking_entries b ON b.event_id = i.event_id AND b.member_id = i.member_id
     LEFT JOIN booking_slots s ON s.id = b.slot_id
     WHERE i.event_id = ?
     ORDER BY m.name COLLATE NOCASE ASC`,
    eventId,
  );
}

async function getBookingEntries(eventId) {
  const db = await initDB();
  const rows = await db.all(
    `SELECT b.id, b.slot_id, b.member_id, b.field_values, b.source, b.booked_at, b.updated_at,
            s.slot_date, s.start_time, s.end_time,
            m.name AS member_name, m.rank AS member_rank,
            m.first_name AS member_first_name, m.last_name AS member_last_name
     FROM booking_entries b
     JOIN booking_slots s ON s.id = b.slot_id
     JOIN members m ON m.id = b.member_id
     WHERE b.event_id = ?
     ORDER BY s.slot_date ASC, s.start_time ASC, m.name COLLATE NOCASE ASC`,
    eventId,
  );
  return rows.map((r) => ({ ...r, field_values: parseJson(r.field_values, {}) }));
}

async function getBookingInviteByCode(accessCode) {
  const db = await initDB();
  return db.get(
    `SELECT i.id AS invite_id, i.event_id, i.member_id, i.access_code,
            m.name AS member_name, m.rank AS member_rank,
            m.first_name AS member_first_name, m.last_name AS member_last_name
     FROM booking_invites i
     JOIN members m ON m.id = i.member_id
     WHERE i.access_code = ?`,
    accessCode,
  );
}

async function getBookingInviteForMember(eventId, memberId) {
  const db = await initDB();
  return db.get(
    `SELECT i.id AS invite_id, i.event_id, i.member_id, i.access_code,
            m.name AS member_name, m.rank AS member_rank,
            m.first_name AS member_first_name, m.last_name AS member_last_name,
            m.email, m.mobile, m.notificationPreference AS notification_preference
     FROM booking_invites i
     JOIN members m ON m.id = i.member_id
     WHERE i.event_id = ? AND i.member_id = ?`,
    eventId, memberId,
  );
}

async function getBookingEntryForMember(eventId, memberId) {
  const db = await initDB();
  const row = await db.get(
    `SELECT b.id, b.slot_id, b.member_id, b.field_values, b.source, b.booked_at, b.updated_at,
            s.slot_date, s.start_time, s.end_time
     FROM booking_entries b
     JOIN booking_slots s ON s.id = b.slot_id
     WHERE b.event_id = ? AND b.member_id = ?`,
    eventId, memberId,
  );
  return row ? { ...row, field_values: parseJson(row.field_values, {}) } : row;
}

/**
 * Create or move a member's booking. Capacity is enforced inside the single
 * INSERT/UPDATE statement (the count subquery and the write are atomic in
 * SQLite), so two members racing for the last place cannot both win — and no
 * explicit transaction is needed on the shared connection.
 * @returns {{ entryId: number, previousSlotId: number|null }}
 */
async function saveBooking(eventId, memberId, slotId, fieldValues, source = "member") {
  const db = await initDB();
  const slot = await db.get("SELECT id, is_blocked FROM booking_slots WHERE id = ? AND event_id = ?", slotId, eventId);
  if (!slot) throw bookingError(BOOKING_ERRORS.SLOT_NOT_FOUND, "Slot not found.");
  if (slot.is_blocked) throw bookingError(BOOKING_ERRORS.SLOT_BLOCKED, "This slot is not available.");

  const valuesJson = JSON.stringify(fieldValues || {});
  const hasRoom = `(SELECT COUNT(*) FROM booking_entries WHERE slot_id = ?) <
                   (SELECT capacity FROM booking_slots WHERE id = ? AND is_blocked = 0)`;

  const existing = await db.get(
    "SELECT id, slot_id FROM booking_entries WHERE event_id = ? AND member_id = ?",
    eventId, memberId,
  );

  if (existing) {
    if (existing.slot_id === Number(slotId)) {
      await db.run(
        "UPDATE booking_entries SET field_values = ?, source = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        valuesJson, source, existing.id,
      );
      return { entryId: existing.id, previousSlotId: existing.slot_id };
    }
    const result = await db.run(
      `UPDATE booking_entries SET slot_id = ?, field_values = ?, source = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND ${hasRoom}`,
      slotId, valuesJson, source, existing.id, slotId, slotId,
    );
    if (result.changes === 0) throw bookingError(BOOKING_ERRORS.SLOT_FULL, "This slot has just been fully booked. Please choose another.");
    return { entryId: existing.id, previousSlotId: existing.slot_id };
  }

  let result;
  try {
    result = await db.run(
      `INSERT INTO booking_entries (event_id, slot_id, member_id, field_values, source)
       SELECT ?, ?, ?, ?, ? WHERE ${hasRoom}`,
      eventId, slotId, memberId, valuesJson, source, slotId, slotId,
    );
  } catch (e) {
    if (/UNIQUE constraint failed/i.test(e.message)) {
      throw bookingError(BOOKING_ERRORS.ALREADY_BOOKED, "This member already has a booking for this event.");
    }
    throw e;
  }
  if (result.changes === 0) throw bookingError(BOOKING_ERRORS.SLOT_FULL, "This slot has just been fully booked. Please choose another.");
  return { entryId: result.lastID, previousSlotId: null };
}

async function cancelBooking(eventId, memberId) {
  const db = await initDB();
  const result = await db.run("DELETE FROM booking_entries WHERE event_id = ? AND member_id = ?", eventId, memberId);
  return result.changes;
}

async function setBookingEventLocked(id, locked) {
  const db = await initDB();
  await db.run("UPDATE booking_events SET is_locked = ? WHERE id = ?", locked ? 1 : 0, id);
}

async function setBookingEventEnabled(id, enabled) {
  const db = await initDB();
  await db.run("UPDATE booking_events SET is_enabled = ? WHERE id = ?", enabled ? 1 : 0, id);
}

// One-way: archiving also disables the public link permanently.
async function archiveBookingEvent(id) {
  const db = await initDB();
  await db.run(
    "UPDATE booking_events SET is_archived = 1, is_enabled = 0, archived_at = CURRENT_TIMESTAMP WHERE id = ?",
    id,
  );
}

// Slots, invites and entries are removed by ON DELETE CASCADE.
async function deleteBookingEvent(id) {
  const db = await initDB();
  const result = await db.run("DELETE FROM booking_events WHERE id = ?", id);
  return result.changes;
}

async function markBookingInviteNotified(inviteId, via) {
  const db = await initDB();
  await db.run(
    "UPDATE booking_invites SET notified_at = CURRENT_TIMESTAMP, notified_via = ? WHERE id = ?",
    via, inviteId,
  );
}

module.exports = {
  BOOKING_ERRORS,
  getBookingTemplates,
  getBookingTemplateById,
  createBookingTemplate,
  updateBookingTemplate,
  deleteBookingTemplate,
  duplicateBookingTemplate,
  publishBookingEvent,
  getBookingEvents,
  getBookingEventById,
  getBookingEventByPublicId,
  getBookingSlots,
  getBookingInvites,
  getBookingEntries,
  getBookingInviteByCode,
  getBookingInviteForMember,
  getBookingEntryForMember,
  saveBooking,
  cancelBooking,
  setBookingEventLocked,
  setBookingEventEnabled,
  archiveBookingEvent,
  deleteBookingEvent,
  markBookingInviteNotified,
};
