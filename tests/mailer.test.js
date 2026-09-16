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
