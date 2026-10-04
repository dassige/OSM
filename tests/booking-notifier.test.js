jest.mock('../services/db', () => ({
    getPreferences: jest.fn(),
    getBookingSlots: jest.fn(),
    markBookingInviteNotified: jest.fn().mockResolvedValue(),
}));

jest.mock('../services/mailer', () => ({
    sendBookingInvitation: jest.fn().mockResolvedValue(),
    buildBookingWhatsAppMessage: jest.fn().mockReturnValue('wa text'),
}));

jest.mock('../services/whatsapp-service', () => ({
    sendMessage: jest.fn().mockResolvedValue(true),
}));

jest.mock('../services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const mockConfig = { appMode: 'production', enableWhatsApp: true, locale: 'en-NZ', transporter: {}, ui: { loginTitle: 'OpReady' } };
jest.mock('../config', () => mockConfig);

const db = require('../services/db');
const mailer = require('../services/mailer');
const whatsappService = require('../services/whatsapp-service');
const { notifyBookingInvites } = require('../services/booking-notifier');

const EVENT = { id: 7, name: 'Nurse Check', public_id: 'pub', access_type: 'personal', location: 'Station' };

const invite = (overrides) => ({
    invite_id: 1, member_id: 1, member_name: 'Alice', email: 'a@example.test', mobile: '0211111111',
    notification_preference: 'both', access_code: 'code-1', ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.appMode = 'production';
    mockConfig.enableWhatsApp = true;
    db.getPreferences.mockResolvedValue({});
    db.getBookingSlots.mockResolvedValue([{ slot_date: '2026-11-10' }, { slot_date: '2026-11-10' }, { slot_date: '2026-11-11' }]);
    whatsappService.sendMessage.mockResolvedValue(true);
});

describe('notifyBookingInvites', () => {
    it('sends on both channels with a personal link and formatted dates', async () => {
        const summary = await notifyBookingInvites(EVENT, [invite()], { email: true, whatsapp: true }, 'https://host');
        expect(summary).toMatchObject({ emailSent: 1, whatsappSent: 1, failed: 0, skipped: 0, simulated: false });

        const details = mailer.sendBookingInvitation.mock.calls[0][2];
        expect(details.link).toBe('https://host/booking/pub?code=code-1');
        expect(details.accessType).toBe('personal');
        expect(details.dates).toMatch(/10 Nov 2026.*11 Nov 2026/);
        expect(whatsappService.sendMessage).toHaveBeenCalledWith('0211111111', 'wa text');
        expect(db.markBookingInviteNotified).toHaveBeenCalledWith(1, 'email,whatsapp');
    });

    it('uses the shared link for general access', async () => {
        await notifyBookingInvites({ ...EVENT, access_type: 'general' }, [invite()], { email: true }, 'https://host');
        expect(mailer.sendBookingInvitation.mock.calls[0][2].link).toBe('https://host/booking/pub');
    });

    it("respects the member's notification preference", async () => {
        const summary = await notifyBookingInvites(EVENT, [invite({ notification_preference: 'whatsapp' })], { email: true, whatsapp: false }, 'https://host');
        expect(mailer.sendBookingInvitation).not.toHaveBeenCalled();
        expect(summary.skipped).toBe(1);
        expect(db.markBookingInviteNotified).not.toHaveBeenCalled();
    });

    it('skips WhatsApp when the integration is disabled', async () => {
        mockConfig.enableWhatsApp = false;
        await notifyBookingInvites(EVENT, [invite()], { whatsapp: true }, 'https://host');
        expect(whatsappService.sendMessage).not.toHaveBeenCalled();
    });

    it('counts queued WhatsApp messages separately', async () => {
        whatsappService.sendMessage.mockResolvedValue(false);
        const summary = await notifyBookingInvites(EVENT, [invite()], { whatsapp: true }, 'https://host');
        expect(summary.whatsappQueued).toBe(1);
        expect(summary.whatsappSent).toBe(0);
    });

    it('counts failures without aborting the batch', async () => {
        mailer.sendBookingInvitation.mockRejectedValueOnce(new Error('SMTP down'));
        const summary = await notifyBookingInvites(EVENT, [invite(), invite({ invite_id: 2, member_id: 2 })], { email: true }, 'https://host');
        expect(summary.failed).toBe(1);
        expect(summary.emailSent).toBe(1);
    });

    it('simulates sends in demo mode', async () => {
        mockConfig.appMode = 'demo';
        const summary = await notifyBookingInvites(EVENT, [invite()], { email: true, whatsapp: true }, 'https://host');
        expect(summary).toMatchObject({ simulated: true, emailSent: 1, whatsappSent: 1 });
        expect(mailer.sendBookingInvitation).not.toHaveBeenCalled();
        expect(whatsappService.sendMessage).not.toHaveBeenCalled();
        expect(db.markBookingInviteNotified).not.toHaveBeenCalled();
    });

    it('skips everyone when no channel is selected', async () => {
        const summary = await notifyBookingInvites(EVENT, [invite(), invite()], {}, 'https://host');
        expect(summary.skipped).toBe(2);
        expect(db.getPreferences).not.toHaveBeenCalled();
    });

    it('passes the saved tpl_bookings template to the mailer', async () => {
        const tpl = { email: { subject: 'Custom' } };
        db.getPreferences.mockResolvedValue({ tpl_bookings: JSON.stringify(tpl) });
        await notifyBookingInvites(EVENT, [invite()], { email: true }, 'https://host');
        expect(mailer.sendBookingInvitation.mock.calls[0][5]).toEqual(tpl);
    });
});
