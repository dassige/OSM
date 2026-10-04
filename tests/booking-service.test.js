const {
    normaliseTemplate,
    normaliseSchedule,
    normaliseFields,
    generateSlots,
    validateFieldValues,
    isValidDate,
    BookingValidationError,
} = require('../services/booking-service');

describe('booking-service — isValidDate', () => {
    it('accepts real calendar dates', () => {
        expect(isValidDate('2026-11-10')).toBe(true);
        expect(isValidDate('2028-02-29')).toBe(true);
    });
    it('rejects impossible or malformed dates', () => {
        expect(isValidDate('2026-02-30')).toBe(false);
        expect(isValidDate('10/11/2026')).toBe(false);
        expect(isValidDate(undefined)).toBe(false);
    });
});

describe('booking-service — normaliseSchedule', () => {
    it('sorts days by date and windows by start time', () => {
        const out = normaliseSchedule([
            { date: '2026-11-11', windows: [{ start: '13:00', end: '16:00' }, { start: '09:00', end: '12:00' }] },
            { date: '2026-11-10', windows: [{ start: '09:00', end: '12:00' }] },
        ]);
        expect(out.map(d => d.date)).toEqual(['2026-11-10', '2026-11-11']);
        expect(out[1].windows[0].start).toBe('09:00');
    });

    it('rejects duplicate dates', () => {
        expect(() => normaliseSchedule([
            { date: '2026-11-10', windows: [{ start: '09:00', end: '10:00' }] },
            { date: '2026-11-10', windows: [{ start: '11:00', end: '12:00' }] },
        ])).toThrow(/more than once/);
    });

    it('rejects overlapping windows', () => {
        expect(() => normaliseSchedule([
            { date: '2026-11-10', windows: [{ start: '09:00', end: '12:00' }, { start: '11:30', end: '13:00' }] },
        ])).toThrow(/overlap/);
    });

    it('rejects a window that ends before it starts', () => {
        expect(() => normaliseSchedule([
            { date: '2026-11-10', windows: [{ start: '12:00', end: '09:00' }] },
        ])).toThrow(/end after it starts/);
    });

    it('rejects invalid time strings', () => {
        expect(() => normaliseSchedule([
            { date: '2026-11-10', windows: [{ start: '9am', end: '10:00' }] },
        ])).toThrow(/invalid time/);
    });

    it('rejects a day without windows', () => {
        expect(() => normaliseSchedule([{ date: '2026-11-10', windows: [] }])).toThrow(/at least one time window/);
    });

    it('treats a missing schedule as empty (draft template)', () => {
        expect(normaliseSchedule(undefined)).toEqual([]);
    });
});

describe('booking-service — normaliseFields', () => {
    it('keeps valid ids, defaults unknown types to text, and assigns missing ids', () => {
        const out = normaliseFields([
            { id: 'phone', label: 'Phone', type: 'tel', required: true },
            { label: 'Notes', type: 'weird' },
        ]);
        expect(out[0]).toEqual({ id: 'phone', label: 'Phone', type: 'tel', required: true });
        expect(out[1]).toEqual({ id: 'field_2', label: 'Notes', type: 'text', required: false });
    });

    it('de-duplicates clashing ids', () => {
        const out = normaliseFields([{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }]);
        expect(out[0].id).not.toBe(out[1].id);
    });

    it('rejects a field without a label', () => {
        expect(() => normaliseFields([{ id: 'x', label: '  ' }])).toThrow(/needs a label/);
    });
});

describe('booking-service — generateSlots', () => {
    it('produces only whole slots inside each window', () => {
        const slots = generateSlots(
            [{ date: '2026-11-10', windows: [{ start: '09:00', end: '09:50' }, { start: '13:00', end: '13:30' }] }],
            15, 2,
        );
        expect(slots.map(s => `${s.start_time}-${s.end_time}`)).toEqual([
            '09:00-09:15', '09:15-09:30', '09:30-09:45', '13:00-13:15', '13:15-13:30',
        ]);
        expect(slots.every(s => s.capacity === 2 && s.slot_date === '2026-11-10')).toBe(true);
    });

    it('returns no slots for an empty schedule', () => {
        expect(generateSlots([], 15)).toEqual([]);
    });
});

describe('booking-service — normaliseTemplate', () => {
    const valid = {
        name: 'Nurse Health Check 2026',
        location: 'Station',
        slot_minutes: 20,
        slot_capacity: 1,
        schedule: [{ date: '2026-11-10', windows: [{ start: '09:00', end: '12:00' }] }],
        fields: [{ id: 'phone', label: 'Phone', type: 'tel', required: true }],
        access_type: 'general',
        show_booked_names: true,
        allow_cancel: false,
    };

    it('returns a normalised template with flags as 1/0', () => {
        const t = normaliseTemplate(valid);
        expect(t.name).toBe('Nurse Health Check 2026');
        expect(t.access_type).toBe('general');
        expect(t.show_booked_names).toBe(1);
        expect(t.allow_cancel).toBe(0);
        expect(t.slot_minutes).toBe(20);
    });

    it('applies defaults when optional values are omitted', () => {
        const t = normaliseTemplate({ name: 'X' });
        expect(t).toMatchObject({ slot_minutes: 15, slot_capacity: 1, access_type: 'personal', show_booked_names: 0, allow_cancel: 1, schedule: [], fields: [] });
    });

    it('requires a name', () => {
        expect(() => normaliseTemplate({ ...valid, name: ' ' })).toThrow(BookingValidationError);
    });

    it('rejects an unknown access type', () => {
        expect(() => normaliseTemplate({ ...valid, access_type: 'public' })).toThrow(/Access type/);
    });

    it('rejects out-of-range slot length and capacity', () => {
        expect(() => normaliseTemplate({ ...valid, slot_minutes: 2 })).toThrow(/Slot length/);
        expect(() => normaliseTemplate({ ...valid, slot_capacity: 0 })).toThrow(/Places per slot/);
        expect(() => normaliseTemplate({ ...valid, slot_minutes: 12.5 })).toThrow(/whole number/);
    });

    it('marks validation errors with status 400', () => {
        try {
            normaliseTemplate({});
        } catch (e) {
            expect(e.status).toBe(400);
        }
    });
});

describe('booking-service — validateFieldValues', () => {
    const fields = [
        { id: 'phone', label: 'Phone', type: 'tel', required: true },
        { id: 'email', label: 'Email', type: 'email', required: false },
        { id: 'notes', label: 'Notes', type: 'textarea', required: false },
    ];

    it('trims values and drops unknown keys', () => {
        const out = validateFieldValues(fields, { phone: ' 021 123 4567 ', hacker: 'x' });
        expect(out).toEqual({ phone: '021 123 4567', email: '', notes: '' });
    });

    it('enforces required fields', () => {
        expect(() => validateFieldValues(fields, {})).toThrow(/Phone is required/);
    });

    it('validates phone and email formats', () => {
        expect(() => validateFieldValues(fields, { phone: 'call me' })).toThrow(/valid phone/);
        expect(() => validateFieldValues(fields, { phone: '0211234567', email: 'nope' })).toThrow(/valid email/);
    });

    it('enforces maximum length', () => {
        expect(() => validateFieldValues(fields, { phone: '0211234567', notes: 'x'.repeat(1001) })).toThrow(/too long/);
    });
});

describe('booking-service — notification helpers', () => {
    const { formatBookingDates, memberChannels, bookingLink } = require('../services/booking-service');

    it('formats distinct calendar dates in order without timezone shift', () => {
        const out = formatBookingDates(['2026-11-11', '2026-11-10', '2026-11-10', 'bad'], 'en-NZ');
        expect(out.split(', ').length).toBeGreaterThanOrEqual(2);
        expect(out.indexOf('10')).toBeLessThan(out.indexOf('11'));
        expect(out).toMatch(/Nov/);
    });

    it('maps member notification preferences to channels', () => {
        expect(memberChannels('email')).toEqual({ email: true, whatsapp: false });
        expect(memberChannels('whatsapp')).toEqual({ email: false, whatsapp: true });
        expect(memberChannels('email,whatsapp')).toEqual({ email: true, whatsapp: true });
        expect(memberChannels('both')).toEqual({ email: true, whatsapp: true });
        expect(memberChannels('none')).toEqual({ email: false, whatsapp: false });
        expect(memberChannels(null)).toEqual({ email: true, whatsapp: false });
    });

    it('builds shared and personal links', () => {
        expect(bookingLink('https://h', 'pub')).toBe('https://h/booking/pub');
        expect(bookingLink('https://h', 'pub', 'c1')).toBe('https://h/booking/pub?code=c1');
    });

    it('can skip required checks for admin bookings but still validates formats', () => {
        const fields = [{ id: 'phone', label: 'Phone', type: 'tel', required: true }];
        expect(validateFieldValues(fields, {}, { enforceRequired: false })).toEqual({ phone: '' });
        expect(() => validateFieldValues(fields, { phone: 'x' }, { enforceRequired: false })).toThrow(/valid phone/);
    });
});

describe('booking-service — local time helpers', () => {
    const { localNow, isSlotPast } = require('../services/booking-service');

    it('renders the wall-clock time in the brigade timezone, including DST', () => {
        // 2026-01-15T00:30Z = 13:30 NZDT (UTC+13)
        expect(localNow('Pacific/Auckland', new Date('2026-01-15T00:30:00Z'))).toBe('2026-01-15 13:30');
        // 2026-07-15T00:30Z = 12:30 NZST (UTC+12)
        expect(localNow('Pacific/Auckland', new Date('2026-07-15T00:30:00Z'))).toBe('2026-07-15 12:30');
        // Crosses the date line relative to UTC
        expect(localNow('Pacific/Auckland', new Date('2026-07-14T23:00:00Z'))).toBe('2026-07-15 11:00');
    });

    it('uses 00 rather than 24 for midnight', () => {
        expect(localNow('UTC', new Date('2026-07-15T00:05:00Z'))).toBe('2026-07-15 00:05');
    });

    it('treats a slot as past once its start time is reached', () => {
        const slot = { slot_date: '2026-11-10', start_time: '09:00' };
        expect(isSlotPast(slot, '2026-11-10 08:59')).toBe(false);
        expect(isSlotPast(slot, '2026-11-10 09:00')).toBe(true);
        expect(isSlotPast(slot, '2026-11-11 00:00')).toBe(true);
    });
});

describe('booking-service — maximum bookings and duplicate-free slots', () => {
    it('defaults max_bookings to 1 and accepts 1–20', () => {
        expect(normaliseTemplate({ name: 'X' }).max_bookings).toBe(1);
        expect(normaliseTemplate({ name: 'X', max_bookings: 3 }).max_bookings).toBe(3);
        expect(normaliseTemplate({ name: 'X', max_bookings: '20' }).max_bookings).toBe(20);
    });

    it('rejects an out-of-range or fractional maximum', () => {
        expect(() => normaliseTemplate({ name: 'X', max_bookings: 0 })).toThrow(/Maximum bookings per member/);
        expect(() => normaliseTemplate({ name: 'X', max_bookings: 21 })).toThrow(/Maximum bookings per member/);
        expect(() => normaliseTemplate({ name: 'X', max_bookings: 1.5 })).toThrow(/whole number/);
    });

    it('never produces the same date and start time twice', () => {
        // Overlapping windows are rejected by normaliseSchedule, but generation is
        // defensive on its own: identical windows yield each slot only once.
        const slots = generateSlots(
            [{ date: '2026-11-10', windows: [{ start: '13:00', end: '14:00' }, { start: '13:00', end: '14:00' }, { start: '13:30', end: '14:30' }] }],
            30,
        );
        expect(slots.map(s => s.start_time)).toEqual(['13:00', '13:30', '14:00']);
    });
});
