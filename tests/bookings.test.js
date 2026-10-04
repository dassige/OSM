const request = require('supertest');
const { createTestApp } = require('./test-utils');

const BOOKING_ERRORS = {
    SLOT_NOT_FOUND: 'SLOT_NOT_FOUND',
    SLOT_BLOCKED: 'SLOT_BLOCKED',
    SLOT_FULL: 'SLOT_FULL',
    ALREADY_BOOKED: 'ALREADY_BOOKED',
};

jest.mock('../services/db', () => ({
    BOOKING_ERRORS: {
        SLOT_NOT_FOUND: 'SLOT_NOT_FOUND',
        SLOT_BLOCKED: 'SLOT_BLOCKED',
        SLOT_FULL: 'SLOT_FULL',
        ALREADY_BOOKED: 'ALREADY_BOOKED',
    },
    getBookingTemplates: jest.fn(),
    getBookingTemplateById: jest.fn(),
    createBookingTemplate: jest.fn(),
    updateBookingTemplate: jest.fn().mockResolvedValue(1),
    deleteBookingTemplate: jest.fn().mockResolvedValue(1),
    duplicateBookingTemplate: jest.fn(),
    getMembers: jest.fn(),
    publishBookingEvent: jest.fn(),
    getBookingEvents: jest.fn(),
    getBookingEventById: jest.fn(),
    getBookingSlots: jest.fn(),
    getBookingInvites: jest.fn(),
    getBookingEntries: jest.fn(),
    getBookingInviteForMember: jest.fn(),
    getBookingEntryForMember: jest.fn(),
    saveBooking: jest.fn(),
    cancelBooking: jest.fn().mockResolvedValue(1),
    setBookingEventLocked: jest.fn().mockResolvedValue(),
    setBookingEventEnabled: jest.fn().mockResolvedValue(),
    archiveBookingEvent: jest.fn().mockResolvedValue(),
    deleteBookingEvent: jest.fn().mockResolvedValue(1),
    logEvent: jest.fn().mockResolvedValue(),
}));

jest.mock('../services/booking-notifier', () => ({
    notifyBookingInvites: jest.fn(),
}));

const mockConfig = { appMode: 'production', locale: 'en-NZ', ui: { loginTitle: 'OpReady' } };
jest.mock('../config', () => mockConfig);

jest.mock('../services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

jest.mock('../middleware/auth', () => ({
    hasRole: () => (req, res, next) => next(),
}));

const db = require('../services/db');
const { notifyBookingInvites } = require('../services/booking-notifier');
const bookingRoutes = require('../routes/api/bookings');

const app = createTestApp({ path: '/api/bookings', router: bookingRoutes });

const TEMPLATE = {
    id: 1,
    name: 'Nurse Check',
    description: '',
    location: 'Station',
    contact_info: '',
    slot_minutes: 30,
    slot_capacity: 1,
    schedule: [{ date: '2026-11-10', windows: [{ start: '09:00', end: '10:00' }] }],
    fields: [{ id: 'phone', label: 'Phone', type: 'tel', required: true }],
    access_type: 'personal',
    show_booked_names: false,
    allow_cancel: true,
};

const EVENT = {
    id: 7,
    public_id: 'pub-guid',
    name: 'Nurse Check',
    access_type: 'general',
    fields: TEMPLATE.fields,
    is_locked: false,
    is_enabled: true,
    is_archived: false,
};

const NOTIFY_SUMMARY = { emailSent: 2, whatsappSent: 1, whatsappQueued: 0, failed: 0, skipped: 0, simulated: false };

beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.appMode = 'production';
    notifyBookingInvites.mockResolvedValue(NOTIFY_SUMMARY);
});

describe('Booking templates', () => {
    it('GET /templates returns templates with a computed slot count', async () => {
        db.getBookingTemplates.mockResolvedValue([TEMPLATE]);
        const res = await request(app).get('/api/bookings/templates');
        expect(res.status).toBe(200);
        expect(res.body[0].slot_count).toBe(2);
    });

    it('GET /templates/:id returns 404 when missing', async () => {
        db.getBookingTemplateById.mockResolvedValue(undefined);
        const res = await request(app).get('/api/bookings/templates/99');
        expect(res.status).toBe(404);
    });

    it('GET /templates/:id returns 404 for a non-numeric id', async () => {
        const res = await request(app).get('/api/bookings/templates/abc');
        expect(res.status).toBe(404);
        expect(db.getBookingTemplateById).not.toHaveBeenCalled();
    });

    it('POST /templates creates a normalised template and logs the event', async () => {
        db.createBookingTemplate.mockResolvedValue(5);
        const res = await request(app).post('/api/bookings/templates').send({ name: '  Nurse Check  ', slot_minutes: 20 });
        expect(res.status).toBe(201);
        expect(res.body).toEqual({ id: 5 });
        expect(db.createBookingTemplate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Nurse Check', slot_minutes: 20 }), 'Test Admin');
        expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Bookings', 'Booking Template Created', { templateId: 5, templateName: 'Nurse Check' });
    });

    it('POST /templates returns 400 on validation failure', async () => {
        const res = await request(app).post('/api/bookings/templates').send({ name: '' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/name is required/i);
        expect(db.createBookingTemplate).not.toHaveBeenCalled();
    });

    it('POST /templates returns 500 when the DB fails', async () => {
        db.createBookingTemplate.mockRejectedValue(new Error('disk full'));
        const res = await request(app).post('/api/bookings/templates').send({ name: 'X' });
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Failed to create booking template.');
    });

    it('PUT /templates/:id updates an existing template', async () => {
        db.getBookingTemplateById.mockResolvedValue(TEMPLATE);
        const res = await request(app).put('/api/bookings/templates/1').send({ ...TEMPLATE, location: 'Hall' });
        expect(res.status).toBe(200);
        expect(db.updateBookingTemplate).toHaveBeenCalledWith(1, expect.objectContaining({ location: 'Hall' }));
        expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Bookings', 'Booking Template Updated', expect.objectContaining({ templateId: 1 }));
    });

    it('PUT /templates/:id returns 404 when missing', async () => {
        db.getBookingTemplateById.mockResolvedValue(undefined);
        const res = await request(app).put('/api/bookings/templates/1').send(TEMPLATE);
        expect(res.status).toBe(404);
    });

    it('DELETE /templates/:id deletes after pre-fetching the name', async () => {
        db.getBookingTemplateById.mockResolvedValue(TEMPLATE);
        const res = await request(app).delete('/api/bookings/templates/1');
        expect(res.status).toBe(200);
        expect(db.deleteBookingTemplate).toHaveBeenCalledWith(1);
        expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Bookings', 'Booking Template Deleted', { templateId: 1, templateName: 'Nurse Check' });
    });

    it('DELETE /templates/:id is blocked in demo mode', async () => {
        mockConfig.appMode = 'demo';
        const res = await request(app).delete('/api/bookings/templates/1');
        expect(res.status).toBe(403);
        expect(db.deleteBookingTemplate).not.toHaveBeenCalled();
    });

    it('POST /templates/:id/duplicate returns the new id', async () => {
        db.getBookingTemplateById.mockResolvedValue(TEMPLATE);
        db.duplicateBookingTemplate.mockResolvedValue(8);
        const res = await request(app).post('/api/bookings/templates/1/duplicate');
        expect(res.status).toBe(201);
        expect(res.body).toEqual({ id: 8 });
        expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Bookings', 'Booking Template Duplicated', { sourceTemplateId: 1, templateId: 8, templateName: 'Nurse Check' });
    });

    it('POST /templates/:id/duplicate returns 404 for a missing template', async () => {
        db.getBookingTemplateById.mockResolvedValue(undefined);
        const res = await request(app).post('/api/bookings/templates/1/duplicate');
        expect(res.status).toBe(404);
    });
});

describe('Publishing', () => {
    beforeEach(() => {
        db.getBookingTemplateById.mockResolvedValue(TEMPLATE);
        db.getMembers.mockResolvedValue([{ id: 1 }, { id: 2 }]);
        db.publishBookingEvent.mockResolvedValue({ eventId: 7, publicId: 'pub-guid' });
        db.getBookingEventById.mockResolvedValue(EVENT);
        db.getBookingInvites.mockResolvedValue([{ invite_id: 1 }, { invite_id: 2 }]);
    });

    it('publishes with overrides, notifies and returns the general link', async () => {
        const res = await request(app).post('/api/bookings/templates/1/publish').send({
            access_type: 'general', show_booked_names: true, allow_cancel: false,
            memberIds: [1, 2, 2], notify: { email: true, whatsapp: false },
        });
        expect(res.status).toBe(201);
        expect(res.body.id).toBe(7);
        expect(res.body.link).toMatch(/\/booking\/pub-guid$/);
        expect(res.body.notifications).toEqual(NOTIFY_SUMMARY);

        const [, options, slots, memberIds, actor] = db.publishBookingEvent.mock.calls[0];
        expect(options).toEqual({ name: 'Nurse Check', access_type: 'general', show_booked_names: true, allow_cancel: false });
        expect(slots).toHaveLength(2);
        expect(memberIds).toEqual([1, 2]);
        expect(actor).toBe('Test Admin');
        expect(notifyBookingInvites).toHaveBeenCalledWith(EVENT, expect.any(Array), { email: true, whatsapp: false }, expect.stringMatching(/^http/));
        expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Bookings', 'Booking Event Published', expect.objectContaining({ eventId: 7, membersInvited: 2, accessType: 'general' }));
    });

    it('falls back to the template defaults and returns no shared link for personal access', async () => {
        const res = await request(app).post('/api/bookings/templates/1/publish').send({ memberIds: [1] });
        expect(res.status).toBe(201);
        expect(res.body.link).toBeNull();
        const [, options] = db.publishBookingEvent.mock.calls[0];
        expect(options).toMatchObject({ access_type: 'personal', show_booked_names: false, allow_cancel: true });
    });

    it('requires at least one member', async () => {
        const res = await request(app).post('/api/bookings/templates/1/publish').send({ memberIds: [] });
        expect(res.status).toBe(400);
        expect(db.publishBookingEvent).not.toHaveBeenCalled();
    });

    it('rejects unknown members', async () => {
        const res = await request(app).post('/api/bookings/templates/1/publish').send({ memberIds: [1, 99] });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/do not exist/);
    });

    it('rejects an invalid access type', async () => {
        const res = await request(app).post('/api/bookings/templates/1/publish').send({ memberIds: [1], access_type: 'public' });
        expect(res.status).toBe(400);
    });

    it('rejects a template without slots', async () => {
        db.getBookingTemplateById.mockResolvedValue({ ...TEMPLATE, schedule: [] });
        const res = await request(app).post('/api/bookings/templates/1/publish').send({ memberIds: [1] });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/no slots/);
    });

    it('returns 404 for a missing template', async () => {
        db.getBookingTemplateById.mockResolvedValue(undefined);
        const res = await request(app).post('/api/bookings/templates/1/publish').send({ memberIds: [1] });
        expect(res.status).toBe(404);
    });
});

describe('Live events', () => {
    it('GET /events returns the list', async () => {
        db.getBookingEvents.mockResolvedValue([EVENT]);
        const res = await request(app).get('/api/bookings/events');
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
    });

    it('GET /events returns 500 on DB failure', async () => {
        db.getBookingEvents.mockRejectedValue(new Error('boom'));
        const res = await request(app).get('/api/bookings/events');
        expect(res.status).toBe(500);
    });

    it('GET /events/:id builds the dashboard with stats and personal links', async () => {
        db.getBookingEventById.mockResolvedValue({ ...EVENT, access_type: 'personal' });
        db.getBookingSlots.mockResolvedValue([
            { id: 1, capacity: 1, is_blocked: 0, booked_count: 1 },
            { id: 2, capacity: 2, is_blocked: 0, booked_count: 0 },
            { id: 3, capacity: 1, is_blocked: 1, booked_count: 0 },
        ]);
        db.getBookingInvites.mockResolvedValue([
            { member_id: 1, member_name: 'Alice', member_last_name: 'Smith', member_first_name: 'Alice', member_rank: 'FF', access_code: 'code-1', entry_id: 10 },
            { member_id: 2, member_name: 'Bob', access_code: 'code-2', entry_id: null },
        ]);
        db.getBookingEntries.mockResolvedValue([{ id: 10, member_id: 1, member_name: 'Alice', field_values: {} }]);

        const res = await request(app).get('/api/bookings/events/7');
        expect(res.status).toBe(200);
        expect(res.body.link).toBeNull();
        expect(res.body.stats).toEqual({ invited: 2, booked: 1, notBooked: 1, slotCount: 2, totalCapacity: 3, freePlaces: 2 });
        expect(res.body.roster[0].display_name).toBe('FF Smith, Alice');
        expect(res.body.roster[1].personal_link).toMatch(/\/booking\/pub-guid\?code=code-2$/);
    });

    it('GET /events/:id returns 404 when missing', async () => {
        db.getBookingEventById.mockResolvedValue(undefined);
        const res = await request(app).get('/api/bookings/events/7');
        expect(res.status).toBe(404);
    });

    it('PATCH /events/:id/lock sets the state and logs newState', async () => {
        db.getBookingEventById.mockResolvedValue(EVENT);
        const res = await request(app).patch('/api/bookings/events/7/lock').send({ locked: true });
        expect(res.status).toBe(200);
        expect(db.setBookingEventLocked).toHaveBeenCalledWith(7, true);
        expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Bookings', 'Booking Event Lock Toggled', { eventId: 7, eventName: 'Nurse Check', newState: 'locked' });
    });

    it('PATCH /events/:id/lock validates the body', async () => {
        db.getBookingEventById.mockResolvedValue(EVENT);
        const res = await request(app).patch('/api/bookings/events/7/lock').send({ locked: 'yes' });
        expect(res.status).toBe(400);
    });

    it('PATCH /events/:id/enable disables the link', async () => {
        db.getBookingEventById.mockResolvedValue(EVENT);
        const res = await request(app).patch('/api/bookings/events/7/enable').send({ enabled: false });
        expect(res.status).toBe(200);
        expect(db.setBookingEventEnabled).toHaveBeenCalledWith(7, false);
        expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Bookings', 'Booking Event Access Toggled', expect.objectContaining({ newState: 'disabled' }));
    });

    it('PATCH /events/:id/enable refuses archived events', async () => {
        db.getBookingEventById.mockResolvedValue({ ...EVENT, is_archived: true });
        const res = await request(app).patch('/api/bookings/events/7/enable').send({ enabled: true });
        expect(res.status).toBe(400);
        expect(db.setBookingEventEnabled).not.toHaveBeenCalled();
    });

    it('PUT /events/:id/archive archives once', async () => {
        db.getBookingEventById.mockResolvedValue(EVENT);
        const res = await request(app).put('/api/bookings/events/7/archive');
        expect(res.status).toBe(200);
        expect(db.archiveBookingEvent).toHaveBeenCalledWith(7);
        expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Bookings', 'Booking Event Archived', { eventId: 7, eventName: 'Nurse Check' });
    });

    it('PUT /events/:id/archive refuses an already archived event', async () => {
        db.getBookingEventById.mockResolvedValue({ ...EVENT, is_archived: true });
        const res = await request(app).put('/api/bookings/events/7/archive');
        expect(res.status).toBe(400);
    });

    it('PUT /events/:id/archive is blocked in demo mode', async () => {
        mockConfig.appMode = 'demo';
        const res = await request(app).put('/api/bookings/events/7/archive');
        expect(res.status).toBe(403);
    });

    it('DELETE /events/:id refuses a non-archived event', async () => {
        db.getBookingEventById.mockResolvedValue(EVENT);
        const res = await request(app).delete('/api/bookings/events/7');
        expect(res.status).toBe(400);
        expect(db.deleteBookingEvent).not.toHaveBeenCalled();
    });

    it('DELETE /events/:id deletes an archived event', async () => {
        db.getBookingEventById.mockResolvedValue({ ...EVENT, is_archived: true });
        db.getBookingEntries.mockResolvedValue([{ id: 1 }, { id: 2 }]);
        const res = await request(app).delete('/api/bookings/events/7');
        expect(res.status).toBe(200);
        expect(db.deleteBookingEvent).toHaveBeenCalledWith(7);
        expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Bookings', 'Booking Event Deleted', { eventId: 7, eventName: 'Nurse Check', deletedBookings: 2 });
    });

    it('DELETE /events/:id is blocked in demo mode', async () => {
        mockConfig.appMode = 'demo';
        const res = await request(app).delete('/api/bookings/events/7');
        expect(res.status).toBe(403);
    });
});

describe('Admin bookings', () => {
    const INVITE = { member_id: 3, member_name: 'Carol', member_last_name: 'White', member_first_name: 'Carol', member_rank: '' };

    beforeEach(() => {
        db.getBookingEventById.mockResolvedValue(EVENT);
        db.getBookingInviteForMember.mockResolvedValue(INVITE);
        db.getBookingEntryForMember.mockResolvedValue({ slot_id: 2, slot_date: '2026-11-10', start_time: '09:30' });
    });

    it('PUT books a member without enforcing required fields', async () => {
        db.saveBooking.mockResolvedValue({ entryId: 1, previousSlotId: null });
        const res = await request(app).put('/api/bookings/events/7/bookings/3').send({ slotId: 2, fieldValues: {} });
        expect(res.status).toBe(200);
        expect(db.saveBooking).toHaveBeenCalledWith(7, 3, 2, { phone: '' }, 'admin');
        expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Bookings', 'Booking Created By Admin', expect.objectContaining({ memberName: 'White, Carol', slotDate: '2026-11-10', startTime: '09:30' }));
    });

    it('PUT logs a change when the booking moved', async () => {
        db.saveBooking.mockResolvedValue({ entryId: 1, previousSlotId: 1 });
        await request(app).put('/api/bookings/events/7/bookings/3').send({ slotId: 2 });
        expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Bookings', 'Booking Changed By Admin', expect.any(Object));
    });

    it('PUT still validates field formats', async () => {
        const res = await request(app).put('/api/bookings/events/7/bookings/3').send({ slotId: 2, fieldValues: { phone: 'not a phone' } });
        expect(res.status).toBe(400);
        expect(db.saveBooking).not.toHaveBeenCalled();
    });

    it('PUT returns 409 when the slot is full', async () => {
        db.saveBooking.mockRejectedValue(Object.assign(new Error('Slot full'), { code: BOOKING_ERRORS.SLOT_FULL }));
        const res = await request(app).put('/api/bookings/events/7/bookings/3').send({ slotId: 2 });
        expect(res.status).toBe(409);
    });

    it('PUT returns 400 for a slot from another event', async () => {
        db.saveBooking.mockRejectedValue(Object.assign(new Error('Slot not found.'), { code: BOOKING_ERRORS.SLOT_NOT_FOUND }));
        const res = await request(app).put('/api/bookings/events/7/bookings/3').send({ slotId: 99 });
        expect(res.status).toBe(400);
    });

    it('PUT requires a slot', async () => {
        const res = await request(app).put('/api/bookings/events/7/bookings/3').send({});
        expect(res.status).toBe(400);
    });

    it('PUT returns 404 for a member who is not invited', async () => {
        db.getBookingInviteForMember.mockResolvedValue(undefined);
        const res = await request(app).put('/api/bookings/events/7/bookings/3').send({ slotId: 2 });
        expect(res.status).toBe(404);
    });

    it('PUT refuses archived events', async () => {
        db.getBookingEventById.mockResolvedValue({ ...EVENT, is_archived: true });
        const res = await request(app).put('/api/bookings/events/7/bookings/3').send({ slotId: 2 });
        expect(res.status).toBe(400);
    });

    it('DELETE cancels a booking and logs it', async () => {
        const res = await request(app).delete('/api/bookings/events/7/bookings/3');
        expect(res.status).toBe(200);
        expect(db.cancelBooking).toHaveBeenCalledWith(7, 3);
        expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Bookings', 'Booking Cancelled By Admin', expect.objectContaining({ memberId: 3, slotDate: '2026-11-10' }));
    });

    it('DELETE returns 404 when the member has no booking', async () => {
        db.getBookingEntryForMember.mockResolvedValue(undefined);
        const res = await request(app).delete('/api/bookings/events/7/bookings/3');
        expect(res.status).toBe(404);
    });
});

describe('Reminders', () => {
    const ROSTER = [
        { invite_id: 1, member_id: 1, entry_id: 5 },
        { invite_id: 2, member_id: 2, entry_id: null },
        { invite_id: 3, member_id: 3, entry_id: null },
    ];

    beforeEach(() => {
        db.getBookingEventById.mockResolvedValue(EVENT);
        db.getBookingInvites.mockResolvedValue(ROSTER);
    });

    it('reminds everyone who has not booked on both channels by default', async () => {
        const res = await request(app).post('/api/bookings/events/7/remind').send({});
        expect(res.status).toBe(200);
        const [, targets, channels, , opts] = notifyBookingInvites.mock.calls[0];
        expect(targets.map(t => t.member_id)).toEqual([2, 3]);
        expect(channels).toEqual({ email: true, whatsapp: true });
        expect(opts).toEqual({ isReminder: true });
        expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Bookings', 'Booking Reminders Sent', expect.objectContaining({ membersTargeted: 2 }));
    });

    it('reminds a single member on the requested channels', async () => {
        const res = await request(app).post('/api/bookings/events/7/remind').send({ memberId: 3, notify: { email: true } });
        expect(res.status).toBe(200);
        const [, targets, channels] = notifyBookingInvites.mock.calls[0];
        expect(targets.map(t => t.member_id)).toEqual([3]);
        expect(channels).toEqual({ email: true, whatsapp: false });
    });

    it('refuses a member who has already booked', async () => {
        const res = await request(app).post('/api/bookings/events/7/remind').send({ memberId: 1 });
        expect(res.status).toBe(400);
        expect(notifyBookingInvites).not.toHaveBeenCalled();
    });

    it('refuses when the event is locked', async () => {
        db.getBookingEventById.mockResolvedValue({ ...EVENT, is_locked: true });
        const res = await request(app).post('/api/bookings/events/7/remind').send({});
        expect(res.status).toBe(400);
    });

    it('refuses when everyone has booked', async () => {
        db.getBookingInvites.mockResolvedValue([{ invite_id: 1, member_id: 1, entry_id: 5 }]);
        const res = await request(app).post('/api/bookings/events/7/remind').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/already booked/);
    });
});
