// services/booking-service.js — pure validation and slot-generation helpers for
// Booking Events. No DB access here, so every rule is unit-testable in isolation.
//
// Slot dates/times are local wall-clock values in the brigade timezone
// ('YYYY-MM-DD' / 'HH:MM') — appointments happen at one physical location, so
// converting them to UTC would only introduce DST bugs.

const ACCESS_TYPES = ["general", "personal"];
const FIELD_TYPES = ["text", "tel", "email", "textarea"];

const LIMITS = {
  nameLength: 200,
  locationLength: 300,
  contactLength: 500,
  descriptionLength: 20000,
  minSlotMinutes: 5,
  maxSlotMinutes: 480,
  maxSlotCapacity: 50,
  maxBookingsPerMember: 20,
  maxDays: 60,
  maxWindowsPerDay: 10,
  maxSlots: 2000,
  maxFields: 20,
  fieldLabelLength: 100,
};

// Max stored length per field type for member-entered values
const VALUE_MAX_LENGTH = { text: 200, tel: 30, email: 254, textarea: 1000 };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const FIELD_ID_RE = /^[a-z0-9_-]{1,40}$/i;
const TEL_RE = /^[+()\d\s-]{6,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class BookingValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "BookingValidationError";
    this.status = 400;
  }
}

function fail(message) {
  throw new BookingValidationError(message);
}

function isValidDate(str) {
  if (typeof str !== "string" || !DATE_RE.test(str)) return false;
  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function optionalText(value, max, label) {
  if (value === undefined || value === null) return "";
  const s = String(value).trim();
  if (s.length > max) fail(`${label} must be ${max} characters or fewer.`);
  return s;
}

function toFlag(value, fallback) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
}

function toInt(value, fallback, min, max, label) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) fail(`${label} must be a whole number between ${min} and ${max}.`);
  return n;
}

function normaliseSchedule(schedule) {
  if (schedule === undefined || schedule === null) return [];
  if (!Array.isArray(schedule)) fail("Schedule must be a list of days.");
  if (schedule.length > LIMITS.maxDays) fail(`A booking event can have at most ${LIMITS.maxDays} days.`);

  const seen = new Set();
  const days = schedule.map((day) => {
    if (!day || !isValidDate(day.date)) fail("Every day needs a valid date.");
    if (seen.has(day.date)) fail(`The date ${day.date} appears more than once.`);
    seen.add(day.date);

    const windows = Array.isArray(day.windows) ? day.windows : [];
    if (windows.length === 0) fail(`The date ${day.date} needs at least one time window.`);
    if (windows.length > LIMITS.maxWindowsPerDay) fail(`The date ${day.date} has too many time windows (max ${LIMITS.maxWindowsPerDay}).`);

    const cleanWindows = windows
      .map((w) => {
        if (!w || !TIME_RE.test(w.start) || !TIME_RE.test(w.end)) fail(`The date ${day.date} has an invalid time (use HH:MM).`);
        if (toMinutes(w.start) >= toMinutes(w.end)) fail(`On ${day.date} each window must end after it starts.`);
        return { start: w.start, end: w.end };
      })
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

    for (let i = 1; i < cleanWindows.length; i++) {
      if (toMinutes(cleanWindows[i].start) < toMinutes(cleanWindows[i - 1].end)) {
        fail(`On ${day.date} the time windows overlap.`);
      }
    }
    return { date: day.date, windows: cleanWindows };
  });

  return days.sort((a, b) => a.date.localeCompare(b.date));
}

function normaliseFields(fields) {
  if (fields === undefined || fields === null) return [];
  if (!Array.isArray(fields)) fail("Fields must be a list.");
  if (fields.length > LIMITS.maxFields) fail(`A booking event can collect at most ${LIMITS.maxFields} fields.`);

  const ids = new Set();
  return fields.map((f, idx) => {
    if (!f || typeof f !== "object") fail("Invalid field definition.");
    const label = optionalText(f.label, LIMITS.fieldLabelLength, "Field label");
    if (!label) fail("Every field needs a label.");
    const type = FIELD_TYPES.includes(f.type) ? f.type : "text";

    let id = typeof f.id === "string" && FIELD_ID_RE.test(f.id) ? f.id : `field_${idx + 1}`;
    while (ids.has(id)) id = `${id}_${idx + 1}`;
    ids.add(id);

    return { id, label, type, required: f.required === true || f.required === 1 };
  });
}

/**
 * Validate and normalise a template body (create/update). Throws
 * BookingValidationError (status 400) on any problem.
 */
function normaliseTemplate(input) {
  const body = input || {};
  const name = optionalText(body.name, LIMITS.nameLength, "Name");
  if (!name) fail("Event name is required.");

  const accessType = body.access_type === undefined ? "personal" : body.access_type;
  if (!ACCESS_TYPES.includes(accessType)) fail("Access type must be 'general' or 'personal'.");

  const description = body.description === undefined || body.description === null ? "" : String(body.description);
  if (description.length > LIMITS.descriptionLength) fail("Description is too long.");

  const template = {
    name,
    description,
    location: optionalText(body.location, LIMITS.locationLength, "Location"),
    contact_info: optionalText(body.contact_info, LIMITS.contactLength, "Contact info"),
    slot_minutes: toInt(body.slot_minutes, 15, LIMITS.minSlotMinutes, LIMITS.maxSlotMinutes, "Slot length (minutes)"),
    slot_capacity: toInt(body.slot_capacity, 1, 1, LIMITS.maxSlotCapacity, "Places per slot"),
    schedule: normaliseSchedule(body.schedule),
    fields: normaliseFields(body.fields),
    access_type: accessType,
    show_booked_names: toFlag(body.show_booked_names, 0),
    allow_cancel: toFlag(body.allow_cancel, 1),
    max_bookings: toInt(body.max_bookings, 1, 1, LIMITS.maxBookingsPerMember, "Maximum bookings per member"),
  };

  const slots = generateSlots(template.schedule, template.slot_minutes, template.slot_capacity);
  if (slots.length > LIMITS.maxSlots) fail(`This schedule produces ${slots.length} slots (max ${LIMITS.maxSlots}).`);

  return template;
}

/**
 * Expand a schedule into concrete slots. Only whole slots that fit inside a
 * window are produced — a 25-minute remainder with 15-minute slots yields one
 * slot, not two.
 */
function generateSlots(schedule, slotMinutes, capacity = 1) {
  const slots = [];
  const seen = new Set(); // defensive: a date/start time is never produced twice
  for (const day of schedule || []) {
    for (const w of day.windows || []) {
      const end = toMinutes(w.end);
      for (let t = toMinutes(w.start); t + slotMinutes <= end; t += slotMinutes) {
        const key = `${day.date} ${toHHMM(t)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        slots.push({
          slot_date: day.date,
          start_time: toHHMM(t),
          end_time: toHHMM(t + slotMinutes),
          capacity,
        });
      }
    }
  }
  return slots;
}

/**
 * Validate member-entered values against the event's field definitions.
 * Returns a clean object containing only known field ids.
 */
function validateFieldValues(fields, values, { enforceRequired = true } = {}) {
  const input = values && typeof values === "object" && !Array.isArray(values) ? values : {};
  const clean = {};
  for (const f of fields || []) {
    const raw = input[f.id];
    const v = raw === undefined || raw === null ? "" : String(raw).trim();
    if (!v) {
      if (f.required && enforceRequired) fail(`${f.label} is required.`);
      clean[f.id] = "";
      continue;
    }
    if (v.length > VALUE_MAX_LENGTH[f.type]) fail(`${f.label} is too long.`);
    if (f.type === "tel" && !TEL_RE.test(v)) fail(`${f.label} must be a valid phone number.`);
    if (f.type === "email" && !EMAIL_RE.test(v)) fail(`${f.label} must be a valid email address.`);
    clean[f.id] = v;
  }
  return clean;
}

/**
 * Human-readable list of distinct slot dates for notifications, e.g.
 * "Tue, 10 Nov 2026, Wed, 11 Nov 2026". Dates are calendar dates, so they are
 * built and formatted in UTC to avoid any timezone shift.
 */
function formatBookingDates(dates, locale = "en-NZ") {
  const unique = [...new Set((dates || []).filter(isValidDate))].sort();
  return unique
    .map((d) => {
      const [y, m, day] = d.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString(locale, {
        weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
      });
    })
    .join(", ");
}

/**
 * Current local wall-clock time in the given IANA timezone as 'YYYY-MM-DD HH:MM',
 * directly comparable with a slot's `${slot_date} ${start_time}`.
 */
function localNow(timeZone = "Pacific/Auckland", now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

// A slot is "past" once its start time has been reached in brigade local time.
function isSlotPast(slot, nowLocal) {
  return `${slot.slot_date} ${slot.start_time}` <= nowLocal;
}

// Member notificationPreference values: 'email' | 'whatsapp' | 'email,whatsapp' | 'both' | 'none'
function memberChannels(preference) {
  const p = String(preference || "email").toLowerCase();
  return {
    email: p === "both" || p.includes("email"),
    whatsapp: p === "both" || p.includes("whatsapp"),
  };
}

function bookingLink(baseUrl, publicId, accessCode) {
  const url = `${baseUrl}/booking/${publicId}`;
  return accessCode ? `${url}?code=${accessCode}` : url;
}

module.exports = {
  ACCESS_TYPES,
  FIELD_TYPES,
  LIMITS,
  BookingValidationError,
  isValidDate,
  normaliseSchedule,
  normaliseFields,
  normaliseTemplate,
  generateSlots,
  validateFieldValues,
  formatBookingDates,
  localNow,
  isSlotPast,
  memberChannels,
  bookingLink,
};
