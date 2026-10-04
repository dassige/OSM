// routes/api/live-bookings.js — public (unauthenticated) booking-page API.
// The event GUID is the access control. Personal links also carry a per-member
// access code; general links ask the member to pick their name from the
// invited roster. Archived events are indistinguishable from unknown links.
const express = require("express");
const router = express.Router();
const db = require("../../services/db");
const config = require("../../config");
const logger = require("../../services/logger");
const { publicBookingLimiter } = require("../../middleware/rate-limiter");
const { formatMemberName } = require("../../services/rank-config");
const {
  BookingValidationError,
  validateFieldValues,
  localNow,
  isSlotPast,
} = require("../../services/booking-service");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = "This booking link is not valid or is no longer available.";

router.use(publicBookingLimiter);

class AccessError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function displayName(row) {
  return formatMemberName(row.member_rank, row.member_last_name, row.member_first_name, row.member_name);
}

function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function sendError(res, e, fallback) {
  if (e instanceof AccessError) return res.status(e.status).json({ error: e.message });
  if (e instanceof BookingValidationError) return res.status(400).json({ error: e.message });
  const { BOOKING_ERRORS } = db;
  if (e.code === BOOKING_ERRORS.SLOT_FULL || e.code === BOOKING_ERRORS.ALREADY_BOOKED) {
    return res.status(409).json({ error: e.message });
  }
  if (e.code === BOOKING_ERRORS.SLOT_NOT_FOUND || e.code === BOOKING_ERRORS.SLOT_BLOCKED) {
    return res.status(400).json({ error: e.message });
  }
  logger.error(`[Bookings] ${fallback}`, { error: e.message });
  return res.status(500).json({ error: fallback });
}

// Resolves a reachable (enabled, non-archived) event or throws AccessError.
async function loadEvent(publicId) {
  if (!UUID_RE.test(String(publicId || ""))) throw new AccessError(404, NOT_FOUND);
  const event = await db.getBookingEventByPublicId(publicId);
  if (!event || event.is_archived) throw new AccessError(404, NOT_FOUND);
  if (!event.is_enabled) throw new AccessError(403, "This booking page is currently unavailable. Please contact the organiser.");
  return event;
}

/**
 * Identifies the member for this request.
 * Personal access: the access code is mandatory and must belong to the event.
 * General access: memberId (picked from the roster) — optional when `required` is false.
 * @returns {Promise<object|null>} invite row (with member name fields) or null
 */
async function identifyMember(event, { code, memberId }, required) {
  if (event.access_type === "personal") {
    if (!UUID_RE.test(String(code || ""))) {
      throw new AccessError(404, "This booking page needs your personal link. Please use the link you received.");
    }
    const invite = await db.getBookingInviteByCode(code);
    if (!invite || invite.event_id !== event.id) throw new AccessError(404, NOT_FOUND);
    return invite;
  }
  const id = parseId(memberId);
  if (!id) {
    if (required) throw new AccessError(400, "Please select your name from the list.");
    return null;
  }
  const invite = await db.getBookingInviteForMember(event.id, id);
  if (!invite) throw new AccessError(400, "Please select your name from the list.");
  return invite;
}

function slotSummary(entry) {
  return { slotId: entry.slot_id, slot_date: entry.slot_date, start_time: entry.start_time, end_time: entry.end_time };
}

router.get("/:publicId", async (req, res) => {
  try {
    const event = await loadEvent(req.params.publicId);
    const member = await identifyMember(event, { code: req.query.code, memberId: req.query.memberId }, false);
    const personal = event.access_type === "personal";

    const [slots, entries, roster, myEntry] = await Promise.all([
      db.getBookingSlots(event.id),
      event.show_booked_names ? db.getBookingEntries(event.id) : Promise.resolve([]),
      personal ? Promise.resolve([]) : db.getBookingInvites(event.id),
      member ? db.getBookingEntryForMember(event.id, member.member_id) : Promise.resolve(null),
    ]);

    const namesBySlot = {};
    for (const e of entries) (namesBySlot[e.slot_id] = namesBySlot[e.slot_id] || []).push(displayName(e));
    const now = localNow(config.timezone);

    res.json({
      event: {
        name: event.name,
        description: event.description,
        location: event.location,
        contact_info: event.contact_info,
        slot_minutes: event.slot_minutes,
        access_type: event.access_type,
        show_booked_names: event.show_booked_names,
        allow_cancel: event.allow_cancel,
        is_locked: event.is_locked,
        fields: event.fields,
        timezone: config.timezone,
      },
      slots: slots.map((s) => ({
        id: s.id,
        slot_date: s.slot_date,
        start_time: s.start_time,
        end_time: s.end_time,
        capacity: s.capacity,
        available: Math.max(0, s.capacity - s.booked_count),
        is_blocked: !!s.is_blocked,
        is_past: isSlotPast(s, now),
        is_mine: !!(myEntry && myEntry.slot_id === s.id),
        ...(event.show_booked_names ? { booked_names: namesBySlot[s.id] || [] } : {}),
      })),
      me: member
        ? {
            memberId: member.member_id,
            displayName: displayName(member),
            // Answers (phone etc.) are only echoed back on personal links — on a
            // shared link anyone could pick this name and read them.
            booking: myEntry ? { ...slotSummary(myEntry), ...(personal ? { field_values: myEntry.field_values } : {}) } : null,
          }
        : null,
      roster: personal
        ? undefined
        : roster
            .map((r) => ({ memberId: r.member_id, displayName: displayName(r), hasBooked: !!r.entry_id }))
            .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" })),
    });
  } catch (e) {
    sendError(res, e, "Failed to load booking page.");
  }
});

router.post("/:publicId/book", async (req, res) => {
  try {
    const event = await loadEvent(req.params.publicId);
    if (event.is_locked) throw new AccessError(403, "Bookings for this event are locked. Please contact the organiser.");
    const body = req.body || {};
    const member = await identifyMember(event, body, true);

    const slotId = parseId(body.slotId);
    const slots = await db.getBookingSlots(event.id);
    const slot = slotId && slots.find((s) => s.id === slotId);
    if (!slot) throw new AccessError(400, "Please choose a valid slot.");
    const now = localNow(config.timezone);
    if (isSlotPast(slot, now)) throw new AccessError(400, "This slot has already started. Please choose a later one.");

    const existing = await db.getBookingEntryForMember(event.id, member.member_id);
    if (existing) {
      if (!event.allow_cancel) {
        throw new AccessError(409, "You already have a booking for this event. Please contact the organiser to change it.");
      }
      if (isSlotPast(existing, now)) throw new AccessError(400, "Your appointment has already started and can no longer be changed.");
    }

    const fieldValues = validateFieldValues(event.fields, body.fieldValues);
    await db.saveBooking(event.id, member.member_id, slotId, fieldValues, "member");

    const title = !existing ? "Booking Created" : existing.slot_id === slotId ? "Booking Details Updated" : "Booking Changed";
    await db.logEvent("System", "Bookings", title, {
      eventId: event.id,
      eventName: event.name,
      accessType: event.access_type,
      memberId: member.member_id,
      memberName: displayName(member),
      slotDate: slot.slot_date,
      startTime: slot.start_time,
      ...(existing && existing.slot_id !== slotId ? { previousSlotDate: existing.slot_date, previousStartTime: existing.start_time } : {}),
    });
    logger.info("[Bookings] Member booking saved", { eventId: event.id, memberId: member.member_id, slotId });

    res.json({
      success: true,
      booking: { slotId: slot.id, slot_date: slot.slot_date, start_time: slot.start_time, end_time: slot.end_time },
    });
  } catch (e) {
    sendError(res, e, "Failed to save booking.");
  }
});

router.post("/:publicId/cancel", async (req, res) => {
  try {
    const event = await loadEvent(req.params.publicId);
    if (event.is_locked) throw new AccessError(403, "Bookings for this event are locked. Please contact the organiser.");
    if (!event.allow_cancel) throw new AccessError(403, "Cancelling is not allowed for this event. Please contact the organiser.");
    const member = await identifyMember(event, req.body || {}, true);

    const existing = await db.getBookingEntryForMember(event.id, member.member_id);
    if (!existing) throw new AccessError(404, "You have no booking to cancel.");
    if (isSlotPast(existing, localNow(config.timezone))) {
      throw new AccessError(400, "Your appointment has already started and can no longer be cancelled.");
    }

    await db.cancelBooking(event.id, member.member_id);
    await db.logEvent("System", "Bookings", "Booking Cancelled", {
      eventId: event.id,
      eventName: event.name,
      accessType: event.access_type,
      memberId: member.member_id,
      memberName: displayName(member),
      slotDate: existing.slot_date,
      startTime: existing.start_time,
    });
    logger.info("[Bookings] Member booking cancelled", { eventId: event.id, memberId: member.member_id });
    res.json({ success: true });
  } catch (e) {
    sendError(res, e, "Failed to cancel booking.");
  }
});

module.exports = router;
