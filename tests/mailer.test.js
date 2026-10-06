const { sendNotification } = require('../services/mailer');

describe('mailer - sendNotification KB refresher link', () => {
    const baseMember = { name: 'FF Test User', email: 'test@example.com', rank: '', last_name: '', first_name: '' };

    it('includes a refresher material link when a skill has kbLink/kbTitle', async () => {
        const member = {
            ...baseMember,
            expiringSkills: [{
                skill: 'Ladders', dueDate: '2026-01-01', url: 'https://forms.example.com/x', isCritical: false,
                kbLink: 'https://app.example.com/knowledgebase/ABC123', kbTitle: 'Ladder Safety Guide',
            }],
        };

        const result = await sendNotification(member, {}, null, true, () => {}, 'OpReady');

        expect(result.html).toContain('Refresher material');
        expect(result.html).toContain('https://app.example.com/knowledgebase/ABC123');
        expect(result.html).toContain('Ladder Safety Guide');
    });

    it('shows the month label instead of the derived date for month-only sources', async () => {
        const member = {
            ...baseMember,
            expiringSkills: [
                { skill: 'Ladders', dueDate: '2026-11-05', dueLabel: 'Nov 2026', url: 'https://forms.example.com/x', isCritical: false },
                { skill: 'Pumps', dueDate: '2026-09-30', dueLabel: 'Lapsed', url: 'https://forms.example.com/y', isCritical: false },
            ],
        };

        const result = await sendNotification(member, {}, null, true, () => {}, 'OpReady');

        expect(result.html).toContain('Nov 2026');
        expect(result.html).toContain('Lapsed');
        expect(result.html).not.toContain('2026-11-05');
    });

    it('omits the refresher block entirely when no KB document is linked', async () => {
        const member = {
            ...baseMember,
            expiringSkills: [{
                skill: 'Pumps', dueDate: '2026-01-01', url: 'https://forms.example.com/y', isCritical: false,
                kbLink: null, kbTitle: null,
            }],
        };

        const result = await sendNotification(member, {}, null, true, () => {}, 'OpReady');

        expect(result.html).not.toContain('Refresher material');
    });

    it('includes a refresher material link on the no-url row template too', async () => {
        const member = {
            ...baseMember,
            expiringSkills: [{
                skill: 'Knots', dueDate: '2026-01-01', url: null, isCritical: false,
                kbLink: 'https://app.example.com/knowledgebase/DEF456', kbTitle: 'Knot Tying Guide',
            }],
        };

        const result = await sendNotification(member, {}, null, true, () => {}, 'OpReady');

        expect(result.html).toContain('Refresher material');
        expect(result.html).toContain('https://app.example.com/knowledgebase/DEF456');
    });
});

describe('mailer - booking invitations', () => {
    const { sendBookingInvitation, buildBookingWhatsAppMessage } = require('../services/mailer');
    const member = { member_name: 'Alice', member_rank: 'FF', member_last_name: 'Smith', member_first_name: 'Alice' };
    const details = { eventName: 'Nurse <Check>', link: 'https://host/booking/pub?code=c', dates: 'Tue, 10 Nov 2026', location: 'Station', accessType: 'personal' };

    it('sends the personal body with escaped variables by default', async () => {
        const transporter = { sendMail: jest.fn().mockResolvedValue() };
        await sendBookingInvitation('a@example.test', member, details, transporter, 'OpReady', null);
        const mail = transporter.sendMail.mock.calls[0][0];
        expect(mail.to).toBe('a@example.test');
        expect(mail.subject).toBe('Book your slot: Nurse <Check>');
        expect(mail.html).toContain('FF Smith, Alice');
        expect(mail.html).toContain('Nurse &lt;Check&gt;');
        expect(mail.html).toContain('personal link');
        expect(mail.from).toContain('OpReady');
    });

    it('uses the general body, a custom template and a reminder prefix', async () => {
        const transporter = { sendMail: jest.fn().mockResolvedValue() };
        const tpl = { email: { subject: 'Health check: {{eventName}}', bodyGeneral: '<p>Pick: {{link}}</p>' } };
        await sendBookingInvitation('a@example.test', member, { ...details, accessType: 'general', isReminder: true }, transporter, 'OpReady', tpl);
        const mail = transporter.sendMail.mock.calls[0][0];
        expect(mail.subject).toBe('Reminder: Health check: Nurse <Check>');
        expect(mail.html).toBe('<p>Pick: https://host/booking/pub?code=c</p>');
    });

    it('builds a plain-text WhatsApp message with fallback to defaults for empty template bodies', () => {
        const text = buildBookingWhatsAppMessage(member, { ...details, isReminder: true }, 'OpReady', { whatsapp: { bodyPersonal: '' } });
        expect(text.startsWith('*Reminder*')).toBe(true);
        expect(text).toContain('FF Smith, Alice');
        expect(text).toContain('https://host/booking/pub?code=c');
        expect(text).not.toContain('&lt;');
    });
});
