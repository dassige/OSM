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
        { name: 'Nurse Check 2026', access_type: accessType, show_booked_names: 0, allow_cancel: 1, max_bookings: 1 },
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

// Publishes an event with explicit slots (e.g. several places / a higher maximum)
async function publishWith(slotsSpec, options = {}, members = memberIds) {
    const template = await bookings.getBookingTemplateById(templateId);
    return bookings.publishBookingEvent(
        template,
        { name: 'Custom', access_type: 'personal', show_booked_names: 0, allow_cancel: 1, max_bookings: 1, ...options },
        slotsSpec, members, 'Admin',
    );
}

const fourSlots = ['09:00', '09:30', '10:00', '10:30'].map((t, i) => ({
    slot_date: '2026-11-10', start_time: t, end_time: ['09:30', '10:00', '10:30', '11:00'][i], capacity: 1,
}));

describe('createBooking / moveBooking / cancelBookingEntry', () => {
    let eventId;
    let slots;

    beforeAll(async () => {
        ({ eventId } = await publish('personal'));
        slots = await bookings.getBookingSlots(eventId);
    });

    it('books a free slot', async () => {
        const entryId = await bookings.createBooking(eventId, memberIds[0], slots[0].id, { phone: '021' }, 'member', 1);
        const entry = await bookings.getBookingEntryById(entryId);
        expect(entry).toMatchObject({ event_id: eventId, member_id: memberIds[0], slot_id: slots[0].id, start_time: '09:00' });
        expect(entry.field_values).toEqual({ phone: '021' });
    });

    it('refuses a slot that is already at capacity', async () => {
        await expect(bookings.createBooking(eventId, memberIds[1], slots[0].id, {}, 'member', 1))
            .rejects.toMatchObject({ code: bookings.BOOKING_ERRORS.SLOT_FULL });
    });

    it('refuses a second booking once the member reaches the maximum', async () => {
        await expect(bookings.createBooking(eventId, memberIds[0], slots[1].id, {}, 'member', 1))
            .rejects.toMatchObject({ code: bookings.BOOKING_ERRORS.MAX_REACHED });
    });

    it('moves a booking to another free slot and updates its answers', async () => {
        const [entry] = await bookings.getBookingEntriesForMember(eventId, memberIds[0]);
        const r = await bookings.moveBooking(entry.id, slots[1].id, { phone: '022' }, 'admin');
        expect(r.previousSlotId).toBe(slots[0].id);
        const moved = await bookings.getBookingEntryById(entry.id);
        expect(moved).toMatchObject({ slot_id: slots[1].id, source: 'admin' });
        expect(moved.field_values.phone).toBe('022');
    });

    it('updates answers when "moving" to the same slot', async () => {
        const [entry] = await bookings.getBookingEntriesForMember(eventId, memberIds[0]);
        await bookings.moveBooking(entry.id, slots[1].id, { phone: '023' });
        expect((await bookings.getBookingEntryById(entry.id)).field_values.phone).toBe('023');
    });

    it('refuses a move into a full slot and keeps the original booking', async () => {
        const otherId = await bookings.createBooking(eventId, memberIds[1], slots[0].id, {}, 'member', 1);
        await expect(bookings.moveBooking(otherId, slots[1].id, {}))
            .rejects.toMatchObject({ code: bookings.BOOKING_ERRORS.SLOT_FULL });
        expect((await bookings.getBookingEntryById(otherId)).slot_id).toBe(slots[0].id);
    });

    it('rejects a slot from another event', async () => {
        const other = await publish('general');
        const otherSlots = await bookings.getBookingSlots(other.eventId);
        await expect(bookings.createBooking(eventId, memberIds[2], otherSlots[0].id, {}, 'member', 1))
            .rejects.toMatchObject({ code: bookings.BOOKING_ERRORS.SLOT_NOT_FOUND });
    });

    it('reports booked counts on slots, roster and entries', async () => {
        const s = await bookings.getBookingSlots(eventId);
        expect(s.map(x => x.booked_count)).toEqual([1, 1]);
        const invites = await bookings.getBookingInvites(eventId);
        expect(invites).toHaveLength(3);
        expect(invites.filter(i => i.booking_count > 0).length).toBe(2);
        const entries = await bookings.getBookingEntries(eventId);
        expect(entries.map(e => e.start_time)).toEqual(['09:00', '09:30']);
    });

    it('cancels a booking and frees the slot', async () => {
        const [entry] = await bookings.getBookingEntriesForMember(eventId, memberIds[1]);
        expect(await bookings.cancelBookingEntry(entry.id)).toBe(1);
        await bookings.createBooking(eventId, memberIds[2], slots[0].id, {}, 'member', 1);
        const [mine] = await bookings.getBookingEntriesForMember(eventId, memberIds[2]);
        expect(mine.slot_id).toBe(slots[0].id);
    });
});

describe('several bookings per member', () => {
    let eventId;
    let slots;

    beforeAll(async () => {
        ({ eventId } = await publishWith(fourSlots, { max_bookings: 2 }));
        slots = await bookings.getBookingSlots(eventId);
    });

    it('stores the maximum on the event', async () => {
        expect((await bookings.getBookingEventById(eventId)).max_bookings).toBe(2);
    });

    it('lets a member book up to the maximum, then refuses', async () => {
        await bookings.createBooking(eventId, memberIds[0], slots[2].id, {}, 'member', 2);
        await bookings.createBooking(eventId, memberIds[0], slots[0].id, {}, 'member', 2);
        await expect(bookings.createBooking(eventId, memberIds[0], slots[3].id, {}, 'member', 2))
            .rejects.toMatchObject({ code: bookings.BOOKING_ERRORS.MAX_REACHED, message: expect.stringMatching(/maximum of 2/) });
        const mine = await bookings.getBookingEntriesForMember(eventId, memberIds[0]);
        expect(mine.map(e => e.start_time)).toEqual(['09:00', '10:00']); // slot order
    });

    it('never lets a member book the same slot twice', async () => {
        const db = await initDB();
        await db.run('UPDATE booking_slots SET capacity = 3 WHERE id = ?', slots[1].id);
        await bookings.createBooking(eventId, memberIds[1], slots[1].id, {}, 'member', 2);
        await expect(bookings.createBooking(eventId, memberIds[1], slots[1].id, {}, 'member', 2))
            .rejects.toMatchObject({ code: bookings.BOOKING_ERRORS.ALREADY_BOOKED });
    });

    it('refuses to move a booking onto a slot the member already holds', async () => {
        const mine = await bookings.getBookingEntriesForMember(eventId, memberIds[0]);
        await expect(bookings.moveBooking(mine[0].id, mine[1].slot_id, {}))
            .rejects.toMatchObject({ code: bookings.BOOKING_ERRORS.ALREADY_BOOKED });
    });

    it('lets admins exceed the maximum (no limit passed)', async () => {
        await bookings.createBooking(eventId, memberIds[0], slots[3].id, {}, 'admin', null);
        expect(await bookings.getBookingEntriesForMember(eventId, memberIds[0])).toHaveLength(3);
    });

    it('counts each member once in the roster and the event list', async () => {
        const roster = await bookings.getBookingInvites(eventId);
        expect(roster).toHaveLength(3); // no duplicate rows for members with several bookings
        expect(roster.find(r => r.member_id === memberIds[0]).booking_count).toBe(3);
        const listed = (await bookings.getBookingEvents()).find(e => e.id === eventId);
        expect(listed).toMatchObject({ booked_count: 2, entry_count: 4, max_bookings: 2 });
    });

    it('rejects two slots with the same date and start time in one event', async () => {
        await expect(publishWith([fourSlots[0], { ...fourSlots[0] }])).rejects.toThrow(/UNIQUE/);
    });
});

describe('event lifecycle', () => {
    it('locks, disables, archives, lists and deletes with cascade', async () => {
        const { eventId, publicId } = await publish('personal');
        const slots = await bookings.getBookingSlots(eventId);
        await bookings.createBooking(eventId, memberIds[0], slots[0].id, {}, 'member', 1);

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
