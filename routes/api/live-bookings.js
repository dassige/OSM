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
  if ([BOOKING_ERRORS.SLOT_FULL, BOOKING_ERRORS.ALREADY_BOOKED, BOOKING_ERRORS.MAX_REACHED].includes(e.code)) {
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

function bookingSummary(entry, withAnswers) {
  return {
    entryId: entry.id,
    slotId: entry.slot_id,
    slot_date: entry.slot_date,
    start_time: entry.start_time,
    end_time: entry.end_time,
    ...(withAnswers ? { field_values: entry.field_values } : {}),
  };
}

// Resolves which of the member's bookings a change/cancel refers to. Without an
// entryId it is only unambiguous when the member holds exactly one booking.
async function resolveMyEntry(event, member, entryIdRaw, verb = "change") {
  const mine = await db.getBookingEntriesForMember(event.id, member.member_id);
  if (entryIdRaw !== undefined && entryIdRaw !== null && entryIdRaw !== '') {
    const entryId = parseId(entryIdRaw);
    const entry = mine.find((e) => e.id === entryId);
    if (!entry) throw new AccessError(404, "That booking was not found.");
    return { entry, mine };
  }
  if (mine.length === 1) return { entry: mine[0], mine };
  if (mine.length === 0) throw new AccessError(404, `You have no booking to ${verb}.`);
  throw new AccessError(400, `Please choose which booking to ${verb}.`);
}

router.get("/:publicId", async (req, res) => {
  try {
    const event = await loadEvent(req.params.publicId);
    const member = await identifyMember(event, { code: req.query.code, memberId: req.query.memberId }, false);
    const personal = event.access_type === "personal";

    const [slots, entries, roster, myEntries] = await Promise.all([
      db.getBookingSlots(event.id),
      event.show_booked_names ? db.getBookingEntries(event.id) : Promise.resolve([]),
      personal ? Promise.resolve([]) : db.getBookingInvites(event.id),
      member ? db.getBookingEntriesForMember(event.id, member.member_id) : Promise.resolve([]),
    ]);
    const mySlotIds = new Set(myEntries.map((e) => e.slot_id));

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
        max_bookings: event.max_bookings || 1,
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
        is_mine: mySlotIds.has(s.id),
        ...(event.show_booked_names ? { booked_names: namesBySlot[s.id] || [] } : {}),
      })),
      me: member
        ? {
            memberId: member.member_id,
            displayName: displayName(member),
            // Answers (phone etc.) are only echoed back on personal links — on a
            // shared link anyone could pick this name and read them.
            bookings: myEntries.map((e) => bookingSummary(e, personal)),
          }
        : null,
      roster: personal
        ? undefined
        : roster
            .map((r) => ({ memberId: r.member_id, displayName: displayName(r), hasBooked: r.booking_count > 0 }))
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

    const fieldValues = validateFieldValues(event.fields, body.fieldValues);
    let title;
    let entryId;
    let previous = null;

    if (body.entryId !== undefined && body.entryId !== null && body.entryId !== '') {
      // Move / update one of my bookings
      if (!event.allow_cancel) {
        throw new AccessError(409, "Bookings for this event can't be changed. Please contact the organiser.");
      }
      const { entry } = await resolveMyEntry(event, member, body.entryId);
      if (isSlotPast(entry, now)) throw new AccessError(400, "This appointment has already started and can no longer be changed.");
      await db.moveBooking(entry.id, slotId, fieldValues, "member");
      entryId = entry.id;
      title = entry.slot_id === slotId ? "Booking Details Updated" : "Booking Changed";
      if (entry.slot_id !== slotId) previous = entry;
    } else {
      // New booking — the per-member maximum is enforced atomically in createBooking
      const max = event.max_bookings || 1;
      try {
        entryId = await db.createBooking(event.id, member.member_id, slotId, fieldValues, "member", max);
      } catch (e) {
        if (e.code === db.BOOKING_ERRORS.MAX_REACHED) {
          const hint = event.allow_cancel ? " Use Change to move a booking instead." : " Please contact the organiser to change it.";
          throw new AccessError(409, `${e.message}${hint}`);
        }
        throw e;
      }
      title = "Booking Created";
    }

    await db.logEvent("System", "Bookings", title, {
      eventId: event.id,
      eventName: event.name,
      accessType: event.access_type,
      entryId,
      memberId: member.member_id,
      memberName: displayName(member),
      slotDate: slot.slot_date,
      startTime: slot.start_time,
      ...(previous ? { previousSlotDate: previous.slot_date, previousStartTime: previous.start_time } : {}),
    });
    logger.info("[Bookings] Member booking saved", { eventId: event.id, memberId: member.member_id, slotId, entryId });

    res.json({
      success: true,
      booking: { entryId, slotId: slot.id, slot_date: slot.slot_date, start_time: slot.start_time, end_time: slot.end_time },
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

    const { entry: existing } = await resolveMyEntry(event, member, (req.body || {}).entryId, "cancel");
    if (isSlotPast(existing, localNow(config.timezone))) {
      throw new AccessError(400, "This appointment has already started and can no longer be cancelled.");
    }

    await db.cancelBookingEntry(existing.id);
    await db.logEvent("System", "Bookings", "Booking Cancelled", {
      eventId: event.id,
      eventName: event.name,
      accessType: event.access_type,
      entryId: existing.id,
      memberId: member.member_id,
      memberName: displayName(member),
      slotDate: existing.slot_date,
      startTime: existing.start_time,
    });
    logger.info("[Bookings] Member booking cancelled", { eventId: event.id, memberId: member.member_id, entryId: existing.id });
    res.json({ success: true });
  } catch (e) {
    sendError(res, e, "Failed to cancel booking.");
  }
});

module.exports = router;
