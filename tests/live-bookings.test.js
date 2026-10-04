const request = require('supertest');
const { createTestApp } = require('./test-utils');

jest.mock('../services/db', () => ({
    BOOKING_ERRORS: {
        SLOT_NOT_FOUND: 'SLOT_NOT_FOUND',
        SLOT_BLOCKED: 'SLOT_BLOCKED',
        SLOT_FULL: 'SLOT_FULL',
        ALREADY_BOOKED: 'ALREADY_BOOKED',
        MAX_REACHED: 'MAX_REACHED',
    },
    getBookingEventByPublicId: jest.fn(),
    getBookingInviteByCode: jest.fn(),
    getBookingInviteForMember: jest.fn(),
    getBookingSlots: jest.fn(),
    getBookingEntries: jest.fn(),
    getBookingInvites: jest.fn(),
    getBookingEntriesForMember: jest.fn(),
    createBooking: jest.fn(),
    moveBooking: jest.fn(),
    cancelBookingEntry: jest.fn().mockResolvedValue(1),
    logEvent: jest.fn().mockResolvedValue(),
}));

jest.mock('../middleware/rate-limiter', () => ({
    publicBookingLimiter: (req, res, next) => next(),
}));

jest.mock('../config', () => ({ timezone: 'Pacific/Auckland' }));
jest.mock('../services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const db = require('../services/db');
const liveBookingRoutes = require('../routes/api/live-bookings');

// No session — public endpoints must work for anonymous visitors.
const app = createTestApp({ path: '/api/live-bookings', router: liveBookingRoutes }, {});

const PUBLIC_ID = '3115fc90-5c05-4ba5-bdcf-6b5a341b87bc';
const CODE = 'e581aac2-0cab-4de0-b2cc-df3a470117bc';

const FIELDS = [{ id: 'phone', label: 'Phone', type: 'tel', required: true }];

const baseEvent = (overrides) => ({
    id: 7, public_id: PUBLIC_ID, name: 'Nurse Check', description: '<p>Info</p>', location: 'Station',
    contact_info: 'Chief', slot_minutes: 15, access_type: 'personal', fields: FIELDS,
    show_booked_names: false, allow_cancel: true, is_locked: false, is_enabled: true, is_archived: false,
    ...overrides,
});

const SLOTS = [
    { id: 1, slot_date: '2099-11-10', start_time: '09:00', end_time: '09:15', capacity: 1, is_blocked: 0, booked_count: 1 },
    { id: 2, slot_date: '2099-11-10', start_time: '09:15', end_time: '09:30', capacity: 2, is_blocked: 0, booked_count: 0 },
    { id: 3, slot_date: '2000-01-01', start_time: '09:00', end_time: '09:15', capacity: 1, is_blocked: 0, booked_count: 0 },
];

const INVITE_ALICE = { invite_id: 1, event_id: 7, member_id: 1, access_code: CODE, member_name: 'Alice', member_last_name: 'Smith', member_first_name: 'Alice', member_rank: 'FF' };
const INVITE_BOB = { invite_id: 2, event_id: 7, member_id: 2, access_code: null, member_name: 'Bob Jones' };

beforeEach(() => {
    jest.clearAllMocks();
    db.getBookingSlots.mockResolvedValue(SLOTS);
    db.getBookingEntries.mockResolvedValue([]);
    db.getBookingInvites.mockResolvedValue([]);
    db.getBookingEntriesForMember.mockResolvedValue([]);
    db.createBooking.mockResolvedValue(31);
    db.moveBooking.mockResolvedValue({ previousSlotId: 1 });
});

describe('GET /api/live-bookings/:publicId — access control', () => {
    it('returns 404 for a malformed public id without touching the DB', async () => {
        const res = await request(app).get('/api/live-bookings/not-a-guid');
        expect(res.status).toBe(404);
        expect(db.getBookingEventByPublicId).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown event', async () => {
        db.getBookingEventByPublicId.mockResolvedValue(undefined);
        const res = await request(app).get(`/api/live-bookings/${PUBLIC_ID}?code=${CODE}`);
        expect(res.status).toBe(404);
    });

    it('treats an archived event exactly like an unknown link', async () => {
        db.getBookingEventByPublicId.mockResolvedValue(baseEvent({ is_archived: true, is_enabled: false }));
        const res = await request(app).get(`/api/live-bookings/${PUBLIC_ID}?code=${CODE}`);
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/not valid or is no longer available/);
    });

    it('returns 403 for a disabled event', async () => {
        db.getBookingEventByPublicId.mockResolvedValue(baseEvent({ is_enabled: false }));
        const res = await request(app).get(`/api/live-bookings/${PUBLIC_ID}?code=${CODE}`);
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/currently unavailable/);
    });

    it('requires the personal access code on personal events', async () => {
        db.getBookingEventByPublicId.mockResolvedValue(baseEvent());
        const res = await request(app).get(`/api/live-bookings/${PUBLIC_ID}`);
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/personal link/);
    });

    it('rejects an access code that belongs to another event', async () => {
        db.getBookingEventByPublicId.mockResolvedValue(baseEvent());
        db.getBookingInviteByCode.mockResolvedValue({ ...INVITE_ALICE, event_id: 99 });
        const res = await request(app).get(`/api/live-bookings/${PUBLIC_ID}?code=${CODE}`);
        expect(res.status).toBe(404);
    });
});

describe('GET /api/live-bookings/:publicId — payload', () => {
    const ENTRY_9AM = { id: 11, slot_id: 1, slot_date: '2099-11-10', start_time: '09:00', end_time: '09:15', field_values: { phone: '021' } };

    it('identifies the member on a personal link and returns their bookings with answers', async () => {
        db.getBookingEventByPublicId.mockResolvedValue(baseEvent({ max_bookings: 2 }));
        db.getBookingInviteByCode.mockResolvedValue(INVITE_ALICE);
        db.getBookingEntriesForMember.mockResolvedValue([ENTRY_9AM]);

        const res = await request(app).get(`/api/live-bookings/${PUBLIC_ID}?code=${CODE}`);
        expect(res.status).toBe(200);
        expect(res.body.me).toEqual({
            memberId: 1, displayName: 'FF Smith, Alice',
            bookings: [{ entryId: 11, slotId: 1, slot_date: '2099-11-10', start_time: '09:00', end_time: '09:15', field_values: { phone: '021' } }],
        });
        expect(res.body.event.max_bookings).toBe(2);
        expect(res.body.roster).toBeUndefined();
        expect(res.body.event.timezone).toBe('Pacific/Auckland');
        expect(res.body.event).not.toHaveProperty('public_id');
    });

    it('defaults the maximum to 1 for older events', async () => {
        db.getBookingEventByPublicId.mockResolvedValue(baseEvent({ max_bookings: undefined }));
        db.getBookingInviteByCode.mockResolvedValue(INVITE_ALICE);
        const res = await request(app).get(`/api/live-bookings/${PUBLIC_ID}?code=${CODE}`);
        expect(res.body.event.max_bookings).toBe(1);
    });

    it('computes availability, past slots and my slots; hides names when the option is off', async () => {
        db.getBookingEventByPublicId.mockResolvedValue(baseEvent());
        db.getBookingInviteByCode.mockResolvedValue(INVITE_ALICE);
        db.getBookingEntriesForMember.mockResolvedValue([ENTRY_9AM, { ...ENTRY_9AM, id: 12, slot_id: 2 }]);

        const res = await request(app).get(`/api/live-bookings/${PUBLIC_ID}?code=${CODE}`);
        const [s1, s2, s3] = res.body.slots;
        expect(s1).toMatchObject({ available: 0, is_mine: true, is_past: false });
        expect(s2).toMatchObject({ available: 2, is_mine: true, is_past: false });
        expect(s3).toMatchObject({ is_mine: false, is_past: true });
        expect(s1).not.toHaveProperty('booked_names');
        expect(db.getBookingEntries).not.toHaveBeenCalled();
    });

    it('shows booked names per slot when the option is on', async () => {
        db.getBookingEventByPublicId.mockResolvedValue(baseEvent({ show_booked_names: true }));
        db.getBookingInviteByCode.mockResolvedValue(INVITE_ALICE);
        db.getBookingEntries.mockResolvedValue([{ slot_id: 1, member_name: 'Bob Jones' }]);
        const res = await request(app).get(`/api/live-bookings/${PUBLIC_ID}?code=${CODE}`);
        expect(res.body.slots[0].booked_names).toEqual(['Bob Jones']);
        expect(res.body.slots[1].booked_names).toEqual([]);
    });

    it('returns the sorted roster on a general link without identifying anyone', async () => {
        db.getBookingEventByPublicId.mockResolvedValue(baseEvent({ access_type: 'general' }));
        db.getBookingInvites.mockResolvedValue([
            { member_id: 2, member_name: 'Zed', booking_count: 0 },
            { member_id: 1, member_name: 'Amy', booking_count: 2 },
        ]);
        const res = await request(app).get(`/api/live-bookings/${PUBLIC_ID}`);
        expect(res.status).toBe(200);
        expect(res.body.me).toBeNull();
        expect(res.body.roster).toEqual([
            { memberId: 1, displayName: 'Amy', hasBooked: true },
            { memberId: 2, displayName: 'Zed', hasBooked: false },
        ]);
        expect(JSON.stringify(res.body.roster)).not.toMatch(/email|mobile|access_code/);
    });

    it('never echoes answers back on a general link', async () => {
        db.getBookingEventByPublicId.mockResolvedValue(baseEvent({ access_type: 'general' }));
        db.getBookingInviteForMember.mockResolvedValue(INVITE_BOB);
        db.getBookingEntriesForMember.mockResolvedValue([{ id: 13, slot_id: 2, slot_date: '2099-11-10', start_time: '09:15', end_time: '09:30', field_values: { phone: '021' } }]);
        const res = await request(app).get(`/api/live-bookings/${PUBLIC_ID}?memberId=2`);
        expect(res.body.me.bookings).toEqual([{ entryId: 13, slotId: 2, slot_date: '2099-11-10', start_time: '09:15', end_time: '09:30' }]);
    });

    it('rejects a general-link member who is not invited', async () => {
        db.getBookingEventByPublicId.mockResolvedValue(baseEvent({ access_type: 'general' }));
        db.getBookingInviteForMember.mockResolvedValue(undefined);
        const res = await request(app).get(`/api/live-bookings/${PUBLIC_ID}?memberId=99`);
        expect(res.status).toBe(400);
    });

    it('returns 500 on a DB failure', async () => {
        db.getBookingEventByPublicId.mockRejectedValue(new Error('boom'));
        const res = await request(app).get(`/api/live-bookings/${PUBLIC_ID}?code=${CODE}`);
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Failed to load booking page.');
    });
});

describe('POST /api/live-bookings/:publicId/book', () => {
    const MINE = { id: 21, slot_id: 1, slot_date: '2099-11-10', start_time: '09:00' };

    beforeEach(() => {
        db.getBookingEventByPublicId.mockResolvedValue(baseEvent());
        db.getBookingInviteByCode.mockResolvedValue(INVITE_ALICE);
    });

    const book = (body) => request(app).post(`/api/live-bookings/${PUBLIC_ID}/book`).send({ code: CODE, ...body });

    it('creates a booking (with the event maximum) and logs it as System with the member name', async () => {
        db.getBookingEventByPublicId.mockResolvedValue(baseEvent({ max_bookings: 3 }));
        const res = await book({ slotId: 2, fieldValues: { phone: '021 123 4567' } });
        expect(res.status).toBe(200);
        expect(res.body.booking).toEqual({ entryId: 31, slotId: 2, slot_date: '2099-11-10', start_time: '09:15', end_time: '09:30' });
        expect(db.createBooking).toHaveBeenCalledWith(7, 1, 2, { phone: '021 123 4567' }, 'member', 3);
        expect(db.logEvent).toHaveBeenCalledWith('System', 'Bookings', 'Booking Created', expect.objectContaining({ entryId: 31, memberId: 1, memberName: 'FF Smith, Alice', slotDate: '2099-11-10', startTime: '09:15' }));
    });

    it('enforces required fields for members', async () => {
        const res = await book({ slotId: 2, fieldValues: {} });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Phone is required/);
        expect(db.createBooking).not.toHaveBeenCalled();
    });

    it('refuses when the event is locked', async () => {
        db.getBookingEventByPublicId.mockResolvedValue(baseEvent({ is_locked: true }));
        const res = await book({ slotId: 2, fieldValues: { phone: '0211234567' } });
        expect(res.status).toBe(403);
    });

    it('refuses a slot that has already started', async () => {
        const res = await book({ slotId: 3, fieldValues: { phone: '0211234567' } });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/already started/);
    });

    it('refuses a slot that does not belong to the event', async () => {
        const res = await book({ slotId: 999, fieldValues: { phone: '0211234567' } });
        expect(res.status).toBe(400);
    });

    it('returns 409 when the slot fills up first', async () => {
        db.createBooking.mockRejectedValue(Object.assign(new Error('full'), { code: 'SLOT_FULL' }));
        const res = await book({ slotId: 2, fieldValues: { phone: '0211234567' } });
        expect(res.status).toBe(409);
    });

    it('returns 409 with a hint when the member reached the maximum', async () => {
        db.createBooking.mockRejectedValue(Object.assign(new Error('You already have a booking for this event.'), { code: 'MAX_REACHED' }));
        let res = await book({ slotId: 2, fieldValues: { phone: '0211234567' } });
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/already have a booking.*Use Change/);

        db.getBookingEventByPublicId.mockResolvedValue(baseEvent({ allow_cancel: false }));
        res = await book({ slotId: 2, fieldValues: { phone: '0211234567' } });
        expect(res.body.error).toMatch(/contact the organiser/);
    });

    it('moves one of my bookings and logs the change', async () => {
        db.getBookingEntriesForMember.mockResolvedValue([MINE]);
        const res = await book({ entryId: 21, slotId: 2, fieldValues: { phone: '0211234567' } });
        expect(res.status).toBe(200);
        expect(db.moveBooking).toHaveBeenCalledWith(21, 2, { phone: '0211234567' }, 'member');
        expect(db.createBooking).not.toHaveBeenCalled();
        expect(db.logEvent).toHaveBeenCalledWith('System', 'Bookings', 'Booking Changed', expect.objectContaining({ entryId: 21, previousStartTime: '09:00', startTime: '09:15' }));
    });

    it('logs a details update when the slot is unchanged', async () => {
        db.getBookingEntriesForMember.mockResolvedValue([{ ...MINE, slot_id: 2 }]);
        await book({ entryId: 21, slotId: 2, fieldValues: { phone: '0211234567' } });
        expect(db.logEvent).toHaveBeenCalledWith('System', 'Bookings', 'Booking Details Updated', expect.any(Object));
    });

    it("refuses to move someone else's booking", async () => {
        db.getBookingEntriesForMember.mockResolvedValue([MINE]);
        const res = await book({ entryId: 999, slotId: 2, fieldValues: { phone: '0211234567' } });
        expect(res.status).toBe(404);
        expect(db.moveBooking).not.toHaveBeenCalled();
    });

    it('refuses moves when changes are not allowed', async () => {
        db.getBookingEventByPublicId.mockResolvedValue(baseEvent({ allow_cancel: false }));
        db.getBookingEntriesForMember.mockResolvedValue([MINE]);
        const res = await book({ entryId: 21, slotId: 2, fieldValues: { phone: '0211234567' } });
        expect(res.status).toBe(409);
        expect(db.moveBooking).not.toHaveBeenCalled();
    });

    it('refuses to move an appointment that has already started', async () => {
        db.getBookingEntriesForMember.mockResolvedValue([{ ...MINE, slot_id: 3, slot_date: '2000-01-01' }]);
        const res = await book({ entryId: 21, slotId: 2, fieldValues: { phone: '0211234567' } });
        expect(res.status).toBe(400);
    });

    it('requires a name on general links', async () => {
        db.getBookingEventByPublicId.mockResolvedValue(baseEvent({ access_type: 'general' }));
        const res = await request(app).post(`/api/live-bookings/${PUBLIC_ID}/book`).send({ slotId: 2, fieldValues: { phone: '0211234567' } });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/select your name/);
    });

    it('books for the selected member on general links', async () => {
        db.getBookingEventByPublicId.mockResolvedValue(baseEvent({ access_type: 'general' }));
        db.getBookingInviteForMember.mockResolvedValue(INVITE_BOB);
        const res = await request(app).post(`/api/live-bookings/${PUBLIC_ID}/book`).send({ memberId: 2, slotId: 2, fieldValues: { phone: '0211234567' } });
        expect(res.status).toBe(200);
        expect(db.createBooking).toHaveBeenCalledWith(7, 2, 2, expect.any(Object), 'member', 1);
    });
});

describe('POST /api/live-bookings/:publicId/cancel', () => {
    const MINE = { id: 21, slot_id: 2, slot_date: '2099-11-10', start_time: '09:15' };

    beforeEach(() => {
        db.getBookingEventByPublicId.mockResolvedValue(baseEvent());
        db.getBookingInviteByCode.mockResolvedValue(INVITE_ALICE);
        db.getBookingEntriesForMember.mockResolvedValue([MINE]);
    });

    const cancel = (body = {}) => request(app).post(`/api/live-bookings/${PUBLIC_ID}/cancel`).send({ code: CODE, ...body });

    it('cancels my only booking without an entryId and logs it', async () => {
        const res = await cancel();
        expect(res.status).toBe(200);
        expect(db.cancelBookingEntry).toHaveBeenCalledWith(21);
        expect(db.logEvent).toHaveBeenCalledWith('System', 'Bookings', 'Booking Cancelled', expect.objectContaining({ entryId: 21, memberId: 1, startTime: '09:15' }));
    });

    it('needs an entryId when I hold several bookings, then cancels that one', async () => {
        db.getBookingEntriesForMember.mockResolvedValue([MINE, { ...MINE, id: 22, slot_id: 1, start_time: '09:00' }]);
        let res = await cancel();
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/choose which booking to cancel/);
        res = await cancel({ entryId: 22 });
        expect(res.status).toBe(200);
        expect(db.cancelBookingEntry).toHaveBeenCalledWith(22);
    });

    it('refuses when cancelling is not allowed', async () => {
        db.getBookingEventByPublicId.mockResolvedValue(baseEvent({ allow_cancel: false }));
        const res = await cancel();
        expect(res.status).toBe(403);
        expect(db.cancelBookingEntry).not.toHaveBeenCalled();
    });

    it('refuses when the event is locked', async () => {
        db.getBookingEventByPublicId.mockResolvedValue(baseEvent({ is_locked: true }));
        const res = await cancel();
        expect(res.status).toBe(403);
    });

    it('returns 404 when there is nothing to cancel', async () => {
        db.getBookingEntriesForMember.mockResolvedValue([]);
        const res = await cancel();
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/no booking to cancel/);
    });

    it('refuses to cancel an appointment that has already started', async () => {
        db.getBookingEntriesForMember.mockResolvedValue([{ ...MINE, slot_id: 3, slot_date: '2000-01-01', start_time: '09:00' }]);
        const res = await cancel();
        expect(res.status).toBe(400);
    });
});
