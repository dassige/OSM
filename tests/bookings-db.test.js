// Integration test for services/db/bookings.js against a throwaway SQLite file.
// DB_PATH MUST point at a temp file before anything requires the connection —
// never let this suite touch the real fenz.db / demo.db.
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEST_DB = path.join(os.tmpdir(), `opready-bookings-test-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = TEST_DB;

jest.mock('../config', () => ({ appMode: 'production' }));
jest.mock('../services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { initDB, closeDB } = require('../services/db/connection');
const bookings = require('../services/db/bookings');
const { generateSlots } = require('../services/booking-service');

let memberIds;
let templateId;

beforeAll(async () => {
    const db = await initDB();
    memberIds = [];
    for (const name of ['Alice Smith', 'Bob Jones', 'Carol White']) {
        const r = await db.run('INSERT INTO members (name, email, mobile) VALUES (?, ?, ?)', name, `${name.split(' ')[0].toLowerCase()}@example.test`, '0210000000');
        memberIds.push(r.lastID);
    }
    templateId = await bookings.createBookingTemplate({
        name: 'Nurse Check',
        description: '<p>Bring your list of medications</p><script>alert(1)</script>',
        location: 'Station',
        contact_info: 'Chief',
        slot_minutes: 30,
        slot_capacity: 1,
        schedule: [{ date: '2026-11-10', windows: [{ start: '09:00', end: '10:00' }] }],
        fields: [{ id: 'phone', label: 'Phone', type: 'tel', required: true }],
        access_type: 'personal',
        show_booked_names: 0,
        allow_cancel: 1,
    }, 'Admin');
});

afterAll(async () => {
    await closeDB();
    for (const suffix of ['', '-wal', '-shm']) {
        try { fs.unlinkSync(TEST_DB + suffix); } catch { /* already gone */ }
    }
});

async function publish(accessType, members = memberIds) {
    const template = await bookings.getBookingTemplateById(templateId);
    const slots = generateSlots(template.schedule, template.slot_minutes, template.slot_capacity);
    return bookings.publishBookingEvent(
        template,
        { name: 'Nurse Check 2026', access_type: accessType, show_booked_names: 0, allow_cancel: 1 },
        slots, members, 'Admin',
    );
}

describe('booking templates', () => {
    it('stores a template with parsed JSON and sanitised description', async () => {
        const t = await bookings.getBookingTemplateById(templateId);
        expect(t.schedule).toHaveLength(1);
        expect(t.fields[0].id).toBe('phone');
        expect(t.allow_cancel).toBe(true);
        expect(t.description).not.toMatch(/<script>/);
        expect(t.created_by).toBe('Admin');
    });

    it('duplicates a template with an empty schedule and "(Copy)" suffix', async () => {
        const copyId = await bookings.duplicateBookingTemplate(templateId, 'Admin');
        const copy = await bookings.getBookingTemplateById(copyId);
        expect(copy.name).toBe('Nurse Check (Copy)');
        expect(copy.schedule).toEqual([]);
        expect(copy.fields).toHaveLength(1);
        await bookings.deleteBookingTemplate(copyId);
    });

    it('returns null when duplicating a missing template', async () => {
        expect(await bookings.duplicateBookingTemplate(999999, 'Admin')).toBeNull();
    });

    it('updates a template', async () => {
        const t = await bookings.getBookingTemplateById(templateId);
        const changes = await bookings.updateBookingTemplate(templateId, { ...t, location: 'Hall' });
        expect(changes).toBe(1);
        expect((await bookings.getBookingTemplateById(templateId)).location).toBe('Hall');
    });
});

describe('publishing', () => {
    it('creates slots and per-member access codes for personal access', async () => {
        const { eventId, publicId } = await publish('personal');
        expect(publicId).toMatch(/^[0-9a-f-]{36}$/);
        const slots = await bookings.getBookingSlots(eventId);
        expect(slots.map(s => s.start_time)).toEqual(['09:00', '09:30']);
        const invites = await bookings.getBookingInvites(eventId);
        expect(invites).toHaveLength(3);
        expect(invites.every(i => typeof i.access_code === 'string' && i.access_code.length === 36)).toBe(true);

        const byCode = await bookings.getBookingInviteByCode(invites[0].access_code);
        expect(byCode.event_id).toBe(eventId);
    });

    it('creates invites without access codes for general access', async () => {
        const { eventId } = await publish('general');
        const invites = await bookings.getBookingInvites(eventId);
        expect(invites.every(i => i.access_code === null)).toBe(true);
    });

    it('de-duplicates member ids', async () => {
        const { eventId } = await publish('general', [memberIds[0], memberIds[0]]);
        expect(await bookings.getBookingInvites(eventId)).toHaveLength(1);
    });
});

describe('saveBooking / cancelBooking', () => {
    let eventId;
    let slots;

    beforeAll(async () => {
        ({ eventId } = await publish('personal'));
        slots = await bookings.getBookingSlots(eventId);
    });

    it('books a free slot', async () => {
        const r = await bookings.saveBooking(eventId, memberIds[0], slots[0].id, { phone: '021' });
        expect(r.previousSlotId).toBeNull();
        const entry = await bookings.getBookingEntryForMember(eventId, memberIds[0]);
        expect(entry.slot_id).toBe(slots[0].id);
        expect(entry.field_values).toEqual({ phone: '021' });
    });

    it('refuses a slot that is already at capacity', async () => {
        await expect(bookings.saveBooking(eventId, memberIds[1], slots[0].id, {}))
            .rejects.toMatchObject({ code: bookings.BOOKING_ERRORS.SLOT_FULL });
    });

    it('moves an existing booking to another free slot', async () => {
        const r = await bookings.saveBooking(eventId, memberIds[0], slots[1].id, { phone: '022' }, 'admin');
        expect(r.previousSlotId).toBe(slots[0].id);
        const entry = await bookings.getBookingEntryForMember(eventId, memberIds[0]);
        expect(entry.slot_id).toBe(slots[1].id);
        expect(entry.source).toBe('admin');
    });

    it('updates field values when re-booking the same slot', async () => {
        await bookings.saveBooking(eventId, memberIds[0], slots[1].id, { phone: '023' });
        const entry = await bookings.getBookingEntryForMember(eventId, memberIds[0]);
        expect(entry.field_values.phone).toBe('023');
    });

    it('refuses a move into a full slot and keeps the original booking', async () => {
        await bookings.saveBooking(eventId, memberIds[1], slots[0].id, {});
        await expect(bookings.saveBooking(eventId, memberIds[1], slots[1].id, {}))
            .rejects.toMatchObject({ code: bookings.BOOKING_ERRORS.SLOT_FULL });
        expect((await bookings.getBookingEntryForMember(eventId, memberIds[1])).slot_id).toBe(slots[0].id);
    });

    it('rejects a slot from another event', async () => {
        const other = await publish('general');
        const otherSlots = await bookings.getBookingSlots(other.eventId);
        await expect(bookings.saveBooking(eventId, memberIds[2], otherSlots[0].id, {}))
            .rejects.toMatchObject({ code: bookings.BOOKING_ERRORS.SLOT_NOT_FOUND });
    });

    it('reports booked counts on slots, roster and entries', async () => {
        const s = await bookings.getBookingSlots(eventId);
        expect(s.map(x => x.booked_count)).toEqual([1, 1]);
        const invites = await bookings.getBookingInvites(eventId);
        expect(invites.filter(i => i.entry_id).length).toBe(2);
        const entries = await bookings.getBookingEntries(eventId);
        expect(entries.map(e => e.start_time)).toEqual(['09:00', '09:30']);
    });

    it('cancels a booking and frees the slot', async () => {
        expect(await bookings.cancelBooking(eventId, memberIds[1])).toBe(1);
        await bookings.saveBooking(eventId, memberIds[2], slots[0].id, {});
        expect((await bookings.getBookingEntryForMember(eventId, memberIds[2])).slot_id).toBe(slots[0].id);
    });
});

describe('event lifecycle', () => {
    it('locks, disables, archives, lists and deletes with cascade', async () => {
        const { eventId, publicId } = await publish('personal');
        const slots = await bookings.getBookingSlots(eventId);
        await bookings.saveBooking(eventId, memberIds[0], slots[0].id, {});

        await bookings.setBookingEventLocked(eventId, true);
        await bookings.setBookingEventEnabled(eventId, false);
        let ev = await bookings.getBookingEventByPublicId(publicId);
        expect(ev).toMatchObject({ is_locked: true, is_enabled: false, is_archived: false });

        await bookings.setBookingEventEnabled(eventId, true);
        await bookings.archiveBookingEvent(eventId);
        ev = await bookings.getBookingEventById(eventId);
        expect(ev).toMatchObject({ is_archived: true, is_enabled: false });
        expect(ev.archived_at).toBeTruthy();

        const listed = (await bookings.getBookingEvents()).find(e => e.id === eventId);
        expect(listed).toMatchObject({ invited_count: 3, booked_count: 1, slot_count: 2, total_capacity: 2, first_date: '2026-11-10' });

        const invite = (await bookings.getBookingInvites(eventId))[0];
        await bookings.markBookingInviteNotified(invite.invite_id, 'email');
        expect((await bookings.getBookingInvites(eventId))[0].notified_via).toBe('email');

        expect(await bookings.deleteBookingEvent(eventId)).toBe(1);
        const db = await initDB();
        const leftovers = await db.get(
            `SELECT (SELECT COUNT(*) FROM booking_slots WHERE event_id = ?) +
                    (SELECT COUNT(*) FROM booking_invites WHERE event_id = ?) +
                    (SELECT COUNT(*) FROM booking_entries WHERE event_id = ?) AS n`,
            eventId, eventId, eventId,
        );
        expect(leftovers.n).toBe(0);
    });

    it('keeps events when their template is deleted', async () => {
        const { eventId } = await publish('general');
        await bookings.deleteBookingTemplate(templateId);
        const ev = await bookings.getBookingEventById(eventId);
        expect(ev).toBeTruthy();
        expect(ev.template_id).toBeNull();
    });
});
