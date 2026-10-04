// routes/api/bookings.js — admin API for Booking Events (templates + live events)
const express = require("express");
const router = express.Router();
const db = require("../../services/db");
const { hasRole } = require("../../middleware/auth");
const config = require("../../config");
const logger = require("../../services/logger");
const { formatMemberName } = require("../../services/rank-config");
const {
  ACCESS_TYPES,
  LIMITS,
  BookingValidationError,
  normaliseTemplate,
  generateSlots,
  validateFieldValues,
  bookingLink,
} = require("../../services/booking-service");
const { notifyBookingInvites } = require("../../services/booking-notifier");

const DEMO_BLOCKED = { error: "Disabled in demo mode." };

const actorOf = (req) => (req.apiKeyUser || req.session?.user)?.name || "Unknown";
const baseUrlOf = (req) => `${req.protocol}://${req.get("host")}`;

function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseChannels(notify) {
  return { email: !!(notify && notify.email), whatsapp: !!(notify && notify.whatsapp) };
}

function memberDisplayName(row) {
  return formatMemberName(row.member_rank, row.member_last_name, row.member_first_name, row.member_name);
}

// Maps validation and booking-conflict errors to 4xx; everything else is a 500.
function sendError(res, e, fallback) {
  if (e instanceof BookingValidationError) return res.status(400).json({ error: e.message });
  const { BOOKING_ERRORS } = db;
  if (BOOKING_ERRORS && [BOOKING_ERRORS.SLOT_FULL, BOOKING_ERRORS.ALREADY_BOOKED, BOOKING_ERRORS.MAX_REACHED].includes(e.code)) {
    return res.status(409).json({ error: e.message });
  }
  if (BOOKING_ERRORS && (e.code === BOOKING_ERRORS.SLOT_NOT_FOUND || e.code === BOOKING_ERRORS.SLOT_BLOCKED)) {
    return res.status(400).json({ error: e.message });
  }
  logger.error(`[Bookings] ${fallback}`, { error: e.message });
  return res.status(500).json({ error: fallback });
}

function withSlotCount(t) {
  return { ...t, slot_count: generateSlots(t.schedule, t.slot_minutes, t.slot_capacity).length };
}

async function buildEventDetail(event, baseUrl) {
  const [slots, roster, entries] = await Promise.all([
    db.getBookingSlots(event.id),
    db.getBookingInvites(event.id),
    db.getBookingEntries(event.id),
  ]);
  const personal = event.access_type === "personal";
  const openSlots = slots.filter((s) => !s.is_blocked);
  const totalCapacity = openSlots.reduce((sum, s) => sum + s.capacity, 0);
  const bookedCount = roster.filter((r) => r.booking_count > 0).length;

  return {
    ...event,
    link: personal ? null : bookingLink(baseUrl, event.public_id),
    stats: {
      invited: roster.length,
      booked: bookedCount,
      notBooked: roster.length - bookedCount,
      bookings: entries.length,
      slotCount: openSlots.length,
      totalCapacity,
      freePlaces: totalCapacity - entries.length,
    },
    slots,
    roster: roster.map((r) => ({
      ...r,
      display_name: memberDisplayName(r),
      personal_link: personal && r.access_code ? bookingLink(baseUrl, event.public_id, r.access_code) : null,
    })),
    entries: entries.map((e) => ({ ...e, display_name: memberDisplayName(e) })),
  };
}

// ── Templates ────────────────────────────────────────────────────────────────

router.get("/templates", hasRole("admin"), async (req, res) => {
  try {
    const templates = await db.getBookingTemplates();
    res.json(templates.map(withSlotCount));
  } catch (e) {
    sendError(res, e, "Failed to retrieve booking templates.");
  }
});

router.get("/templates/:id", hasRole("admin"), async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const template = id && (await db.getBookingTemplateById(id));
    if (!template) return res.status(404).json({ error: "Booking template not found." });
    res.json(withSlotCount(template));
  } catch (e) {
    sendError(res, e, "Failed to retrieve booking template.");
  }
});

router.post("/templates", hasRole("admin"), async (req, res) => {
  try {
    const template = normaliseTemplate(req.body);
    const actor = actorOf(req);
    const id = await db.createBookingTemplate(template, actor);
    await db.logEvent(actor, "Bookings", "Booking Template Created", { templateId: id, templateName: template.name });
    logger.info("[Bookings] Template created", { templateId: id, createdBy: actor });
    res.status(201).json({ id });
  } catch (e) {
    sendError(res, e, "Failed to create booking template.");
  }
});

router.put("/templates/:id", hasRole("admin"), async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const existing = id && (await db.getBookingTemplateById(id));
    if (!existing) return res.status(404).json({ error: "Booking template not found." });

    const template = normaliseTemplate(req.body);
    await db.updateBookingTemplate(id, template);
    const actor = actorOf(req);
    await db.logEvent(actor, "Bookings", "Booking Template Updated", { templateId: id, templateName: template.name });
    logger.info("[Bookings] Template updated", { templateId: id, updatedBy: actor });
    res.json({ success: true });
  } catch (e) {
    sendError(res, e, "Failed to update booking template.");
  }
});

router.delete("/templates/:id", hasRole("admin"), async (req, res) => {
  if (config.appMode === "demo") return res.status(403).json(DEMO_BLOCKED);
  try {
    const id = parseId(req.params.id);
    const existing = id && (await db.getBookingTemplateById(id));
    if (!existing) return res.status(404).json({ error: "Booking template not found." });

    await db.deleteBookingTemplate(id);
    const actor = actorOf(req);
    await db.logEvent(actor, "Bookings", "Booking Template Deleted", { templateId: id, templateName: existing.name });
    logger.info("[Bookings] Template deleted", { templateId: id, deletedBy: actor });
    res.json({ success: true });
  } catch (e) {
    sendError(res, e, "Failed to delete booking template.");
  }
});

router.post("/templates/:id/duplicate", hasRole("admin"), async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const source = id && (await db.getBookingTemplateById(id));
    if (!source) return res.status(404).json({ error: "Booking template not found." });

    const actor = actorOf(req);
    const newId = await db.duplicateBookingTemplate(id, actor);
    await db.logEvent(actor, "Bookings", "Booking Template Duplicated", {
      sourceTemplateId: id,
      templateId: newId,
      templateName: source.name,
    });
    logger.info("[Bookings] Template duplicated", { sourceTemplateId: id, templateId: newId });
    res.status(201).json({ id: newId });
  } catch (e) {
    sendError(res, e, "Failed to duplicate booking template.");
  }
});

router.post("/templates/:id/publish", hasRole("admin"), async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const template = id && (await db.getBookingTemplateById(id));
    if (!template) return res.status(404).json({ error: "Booking template not found." });

    const body = req.body || {};
    const accessType = body.access_type || template.access_type;
    if (!ACCESS_TYPES.includes(accessType)) return res.status(400).json({ error: "Access type must be 'general' or 'personal'." });

    const memberIds = Array.isArray(body.memberIds) ? [...new Set(body.memberIds.map(Number))] : [];
    if (memberIds.length === 0 || memberIds.some((m) => !Number.isInteger(m) || m <= 0)) {
      return res.status(400).json({ error: "At least one member must be selected." });
    }
    const known = new Set((await db.getMembers()).map((m) => m.id));
    if (memberIds.some((m) => !known.has(m))) return res.status(400).json({ error: "One or more selected members do not exist." });

    const slots = generateSlots(template.schedule, template.slot_minutes, template.slot_capacity);
    if (slots.length === 0) return res.status(400).json({ error: "This template has no slots — add at least one day with a time window." });

    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 200) : template.name;
    const options = {
      name,
      access_type: accessType,
      show_booked_names: body.show_booked_names !== undefined ? !!body.show_booked_names : template.show_booked_names,
      allow_cancel: body.allow_cancel !== undefined ? !!body.allow_cancel : template.allow_cancel,
      max_bookings: template.max_bookings || 1,
    };
    if (body.max_bookings !== undefined) {
      const max = Number(body.max_bookings);
      if (!Number.isInteger(max) || max < 1 || max > LIMITS.maxBookingsPerMember) {
        return res.status(400).json({ error: `Maximum bookings per member must be a whole number between 1 and ${LIMITS.maxBookingsPerMember}.` });
      }
      options.max_bookings = max;
    }

    const actor = actorOf(req);
    const { eventId, publicId } = await db.publishBookingEvent(template, options, slots, memberIds, actor);
    const event = await db.getBookingEventById(eventId);
    const invites = await db.getBookingInvites(eventId);
    const notifications = await notifyBookingInvites(event, invites, parseChannels(body.notify), baseUrlOf(req));

    await db.logEvent(actor, "Bookings", "Booking Event Published", {
      eventId,
      eventName: name,
      templateId: id,
      accessType,
      maxBookings: options.max_bookings,
      membersInvited: invites.length,
      slotCount: slots.length,
      emailSent: notifications.emailSent,
      whatsappSent: notifications.whatsappSent + notifications.whatsappQueued,
      simulated: notifications.simulated,
    });
    logger.info("[Bookings] Event published", { eventId, accessType, membersInvited: invites.length, publishedBy: actor });

    res.status(201).json({
      id: eventId,
      publicId,
      link: accessType === "general" ? bookingLink(baseUrlOf(req), publicId) : null,
      notifications,
    });
  } catch (e) {
    sendError(res, e, "Failed to publish booking event.");
  }
});

// ── Live events ──────────────────────────────────────────────────────────────

router.get("/events", hasRole("admin"), async (req, res) => {
  try {
    res.json(await db.getBookingEvents());
  } catch (e) {
    sendError(res, e, "Failed to retrieve booking events.");
  }
});

router.get("/events/:id", hasRole("admin"), async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const event = id && (await db.getBookingEventById(id));
    if (!event) return res.status(404).json({ error: "Booking event not found." });
    res.json(await buildEventDetail(event, baseUrlOf(req)));
  } catch (e) {
    sendError(res, e, "Failed to retrieve booking event.");
  }
});

router.patch("/events/:id/lock", hasRole("admin"), async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const event = id && (await db.getBookingEventById(id));
    if (!event) return res.status(404).json({ error: "Booking event not found." });
    if (event.is_archived) return res.status(400).json({ error: "Archived events cannot be changed." });
    if (typeof req.body?.locked !== "boolean") return res.status(400).json({ error: "'locked' must be true or false." });

    await db.setBookingEventLocked(id, req.body.locked);
    const actor = actorOf(req);
    await db.logEvent(actor, "Bookings", "Booking Event Lock Toggled", {
      eventId: id,
      eventName: event.name,
      newState: req.body.locked ? "locked" : "unlocked",
    });
    logger.info("[Bookings] Event lock changed", { eventId: id, locked: req.body.locked });
    res.json({ success: true });
  } catch (e) {
    sendError(res, e, "Failed to update lock state.");
  }
});

router.patch("/events/:id/enable", hasRole("admin"), async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const event = id && (await db.getBookingEventById(id));
    if (!event) return res.status(404).json({ error: "Booking event not found." });
    if (event.is_archived) return res.status(400).json({ error: "Archived events cannot be re-enabled." });
    if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ error: "'enabled' must be true or false." });

    await db.setBookingEventEnabled(id, req.body.enabled);
    const actor = actorOf(req);
    await db.logEvent(actor, "Bookings", "Booking Event Access Toggled", {
      eventId: id,
      eventName: event.name,
      newState: req.body.enabled ? "enabled" : "disabled",
    });
    logger.info("[Bookings] Event access changed", { eventId: id, enabled: req.body.enabled });
    res.json({ success: true });
  } catch (e) {
    sendError(res, e, "Failed to update enabled state.");
  }
});

// One-way: the public link stops working permanently.
router.put("/events/:id/archive", hasRole("admin"), async (req, res) => {
  if (config.appMode === "demo") return res.status(403).json(DEMO_BLOCKED);
  try {
    const id = parseId(req.params.id);
    const event = id && (await db.getBookingEventById(id));
    if (!event) return res.status(404).json({ error: "Booking event not found." });
    if (event.is_archived) return res.status(400).json({ error: "This event is already archived." });

    await db.archiveBookingEvent(id);
    const actor = actorOf(req);
    await db.logEvent(actor, "Bookings", "Booking Event Archived", { eventId: id, eventName: event.name });
    logger.info("[Bookings] Event archived", { eventId: id, archivedBy: actor });
    res.json({ success: true });
  } catch (e) {
    sendError(res, e, "Failed to archive booking event.");
  }
});

router.delete("/events/:id", hasRole("admin"), async (req, res) => {
  if (config.appMode === "demo") return res.status(403).json(DEMO_BLOCKED);
  try {
    const id = parseId(req.params.id);
    const event = id && (await db.getBookingEventById(id));
    if (!event) return res.status(404).json({ error: "Booking event not found." });
    if (!event.is_archived) return res.status(400).json({ error: "Only archived events can be deleted." });

    const entries = await db.getBookingEntries(id);
    await db.deleteBookingEvent(id);
    const actor = actorOf(req);
    await db.logEvent(actor, "Bookings", "Booking Event Deleted", {
      eventId: id,
      eventName: event.name,
      deletedBookings: entries.length,
    });
    logger.info("[Bookings] Event deleted", { eventId: id, deletedBy: actor });
    res.json({ success: true });
  } catch (e) {
    sendError(res, e, "Failed to delete booking event.");
  }
});

// Admin bookings on a member's behalf. Allowed while locked (admin override) but
// not once archived. Required fields and the per-member maximum are not enforced —
// the admin may not have the member's details to hand, and may need to override.

async function loadOpenForAdmin(req, res) {
  const id = parseId(req.params.id);
  const event = id && (await db.getBookingEventById(id));
  if (!event) { res.status(404).json({ error: "Booking event not found." }); return null; }
  if (event.is_archived) { res.status(400).json({ error: "Archived events cannot be changed." }); return null; }
  return event;
}

async function loadEntry(req, res, event) {
  const entryId = parseId(req.params.entryId);
  const entry = entryId && (await db.getBookingEntryById(entryId));
  if (!entry || entry.event_id !== event.id) { res.status(404).json({ error: "Booking not found for this event." }); return null; }
  return entry;
}

router.post("/events/:id/bookings", hasRole("admin"), async (req, res) => {
  try {
    const event = await loadOpenForAdmin(req, res);
    if (!event) return;
    const memberId = parseId(req.body?.memberId);
    const invite = memberId && (await db.getBookingInviteForMember(event.id, memberId));
    if (!invite) return res.status(404).json({ error: "This member is not invited to the event." });

    const slotId = parseId(req.body?.slotId);
    if (!slotId) return res.status(400).json({ error: "A slot must be selected." });
    const fieldValues = validateFieldValues(event.fields, req.body?.fieldValues, { enforceRequired: false });

    const entryId = await db.createBooking(event.id, memberId, slotId, fieldValues, "admin", null);
    const entry = await db.getBookingEntryById(entryId);
    const actor = actorOf(req);
    await db.logEvent(actor, "Bookings", "Booking Created By Admin", {
      eventId: event.id,
      eventName: event.name,
      entryId,
      memberId,
      memberName: memberDisplayName(invite),
      slotDate: entry?.slot_date,
      startTime: entry?.start_time,
    });
    logger.info("[Bookings] Admin booking created", { eventId: event.id, memberId, slotId, entryId });
    res.status(201).json({ id: entryId });
  } catch (e) {
    sendError(res, e, "Failed to save booking.");
  }
});

router.put("/events/:id/bookings/:entryId", hasRole("admin"), async (req, res) => {
  try {
    const event = await loadOpenForAdmin(req, res);
    if (!event) return;
    const entry = await loadEntry(req, res, event);
    if (!entry) return;

    const slotId = parseId(req.body?.slotId);
    if (!slotId) return res.status(400).json({ error: "A slot must be selected." });
    const fieldValues = validateFieldValues(event.fields, req.body?.fieldValues, { enforceRequired: false });

    await db.moveBooking(entry.id, slotId, fieldValues, "admin");
    const updated = await db.getBookingEntryById(entry.id);
    const invite = await db.getBookingInviteForMember(event.id, entry.member_id);
    const actor = actorOf(req);
    await db.logEvent(actor, "Bookings", "Booking Changed By Admin", {
      eventId: event.id,
      eventName: event.name,
      entryId: entry.id,
      memberId: entry.member_id,
      memberName: invite ? memberDisplayName(invite) : undefined,
      slotDate: updated?.slot_date,
      startTime: updated?.start_time,
      ...(updated && updated.slot_id !== entry.slot_id ? { previousSlotDate: entry.slot_date, previousStartTime: entry.start_time } : {}),
    });
    logger.info("[Bookings] Admin booking changed", { eventId: event.id, entryId: entry.id, slotId });
    res.json({ success: true });
  } catch (e) {
    sendError(res, e, "Failed to save booking.");
  }
});

router.delete("/events/:id/bookings/:entryId", hasRole("admin"), async (req, res) => {
  try {
    const event = await loadOpenForAdmin(req, res);
    if (!event) return;
    const entry = await loadEntry(req, res, event);
    if (!entry) return;
    const invite = await db.getBookingInviteForMember(event.id, entry.member_id);

    await db.cancelBookingEntry(entry.id);
    const actor = actorOf(req);
    await db.logEvent(actor, "Bookings", "Booking Cancelled By Admin", {
      eventId: event.id,
      eventName: event.name,
      entryId: entry.id,
      memberId: entry.member_id,
      memberName: invite ? memberDisplayName(invite) : undefined,
      slotDate: entry.slot_date,
      startTime: entry.start_time,
    });
    logger.info("[Bookings] Admin booking cancelled", { eventId: event.id, entryId: entry.id });
    res.json({ success: true });
  } catch (e) {
    sendError(res, e, "Failed to cancel booking.");
  }
});

// Remind one member ({ memberId }) or every invited member without a booking.
router.post("/events/:id/remind", hasRole("admin"), async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const event = id && (await db.getBookingEventById(id));
    if (!event) return res.status(404).json({ error: "Booking event not found." });
    if (event.is_archived || !event.is_enabled || event.is_locked) {
      return res.status(400).json({ error: "Reminders can only be sent while the event is open for bookings." });
    }

    const roster = await db.getBookingInvites(id);
    let targets = roster.filter((r) => !r.booking_count);
    if (req.body?.memberId !== undefined) {
      const memberId = parseId(req.body.memberId);
      targets = targets.filter((r) => r.member_id === memberId);
      if (targets.length === 0) return res.status(400).json({ error: "This member is not invited or has already booked." });
    }
    if (targets.length === 0) return res.status(400).json({ error: "Everyone invited has already booked." });

    const channels = req.body?.notify ? parseChannels(req.body.notify) : { email: true, whatsapp: true };
    const notifications = await notifyBookingInvites(event, targets, channels, baseUrlOf(req), { isReminder: true });

    const actor = actorOf(req);
    await db.logEvent(actor, "Bookings", "Booking Reminders Sent", {
      eventId: id,
      eventName: event.name,
      membersTargeted: targets.length,
      emailSent: notifications.emailSent,
      whatsappSent: notifications.whatsappSent + notifications.whatsappQueued,
      simulated: notifications.simulated,
    });
    res.json({ success: true, notifications });
  } catch (e) {
    sendError(res, e, "Failed to send reminders.");
  }
});

module.exports = router;
