// tests/report-service.test.js
// How compliance reports adapt to the extraction source: month labels and the
// six-month window of the pdf-report plugin vs complete sources (html-scraper).

jest.mock('../config', () => ({ locale: 'en-NZ', timezone: 'Pacific/Auckland' }));
jest.mock('../services/extraction-engine', () => ({
    extractData: jest.fn(),
    getActivePlugin: jest.fn(),
}));
jest.mock('../services/db', () => ({
    getMembers: jest.fn(),
    getSkills: jest.fn(),
    getUserPreference: jest.fn().mockResolvedValue(null),
    getAllFutureTrainingSessions: jest.fn().mockResolvedValue([]),
}));

const extractionEngine = require('../services/extraction-engine');
const db = require('../services/db');
const reportService = require('../services/report-service');

// ISO date `days` from today in the app timezone.
function inDays(days) {
    const [y, m, d] = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' }).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const members = [{ id: 1, name: 'QFF Skywalker, L', rank: 'QFF', first_name: 'Luke', last_name: 'Skywalker', enabled: 1 }];
const skills = [
    { id: 10, name: 'BA - Search & Rescue', enabled: 1, critical_skill: 1 },
    { id: 11, name: 'Pumps - Basic', enabled: 1, critical_skill: 0 },
    { id: 12, name: 'Ladders', enabled: 1, critical_skill: 0 },
];

const PDF_PLUGIN = { name: 'pdf-report', description: '', coverage: { windowMonths: 6, monthPrecision: true } };
const HTML_PLUGIN = { name: 'html-scraper', description: '', coverage: null };

beforeEach(() => {
    jest.clearAllMocks();
    db.getMembers.mockResolvedValue(members);
    db.getSkills.mockResolvedValue(skills);
});

describe('getComplianceMatrix', () => {
    const records = (withLabels) => [
        { name: 'QFF Skywalker, L', skill: 'BA - Search & Rescue', dueDate: inDays(-5), ...(withLabels && { dueLabel: 'Lapsed' }) },
        { name: 'QFF Skywalker, L', skill: 'Pumps - Basic', dueDate: inDays(20), ...(withLabels && { dueLabel: 'Nov 2026' }) },
    ];

    it('marks skills absent from the six-month report as not listed, with month labels', async () => {
        extractionEngine.getActivePlugin.mockReturnValue(PDF_PLUGIN);
        extractionEngine.extractData.mockResolvedValue(records(true));

        const result = await reportService.getComplianceMatrix(99, null, 90);

        expect(result.meta).toMatchObject({ threshold: 90, sourceWindowMonths: 6 });
        expect(result.rows[0].skills).toEqual([
            { id: 10, name: 'BA - Search & Rescue', status: 'expired', date: 'Lapsed' },
            { id: 12, name: 'Ladders', status: 'not-listed', date: 'Not due within 6 months' },
            { id: 11, name: 'Pumps - Basic', status: 'expiring', date: 'Nov 2026' },
        ]);
    });

    it('keeps "missing" and exact dates for complete sources', async () => {
        extractionEngine.getActivePlugin.mockReturnValue(HTML_PLUGIN);
        extractionEngine.extractData.mockResolvedValue(records(false));

        const result = await reportService.getComplianceMatrix(99, null, 90);

        expect(result.meta.sourceWindowMonths).toBeNull();
        expect(result.rows[0].skills.map((s) => [s.status, s.date])).toEqual([
            ['expired', inDays(-5)],
            ['missing', '-'],
            ['expiring', inDays(20)],
        ]);
    });
});

describe('grouped reports', () => {
    it('pass the month label through and report the source window', async () => {
        extractionEngine.getActivePlugin.mockReturnValue(PDF_PLUGIN);
        extractionEngine.extractData.mockResolvedValue([
            { name: 'QFF Skywalker, L', skill: 'Pumps - Basic', dueDate: inDays(20), dueLabel: 'Nov 2026' },
        ]);

        const byMember = await reportService.getGroupedByMember(99, null, 200);
        expect(byMember.meta).toMatchObject({ filterDays: 200, sourceWindowMonths: 6 });
        expect(byMember.items[0].skills[0]).toMatchObject({ skill: 'Pumps - Basic', dueDate: inDays(20), dueLabel: 'Nov 2026' });

        const bySkill = await reportService.getGroupedBySkill(99, null, 30);
        expect(bySkill.meta.sourceWindowMonths).toBe(6);
        expect(bySkill.items[0].members[0].dueLabel).toBe('Nov 2026');
    });

    it('count report names that are not matched to a member', async () => {
        extractionEngine.getActivePlugin.mockReturnValue(PDF_PLUGIN);
        extractionEngine.extractData.mockResolvedValue([
            { name: 'QFF Skywalker, L', skill: 'BA - Search & Rescue', dueDate: inDays(-3), dueLabel: 'Lapsed' },
            { name: 'Jyn Erso', sourceName: 'Jyn Erso', skill: 'BA - Search & Rescue', dueDate: inDays(-3), unresolved: true },
            { name: 'Jyn Erso', sourceName: 'Jyn Erso', skill: 'Pumps - Basic', dueDate: inDays(20), unresolved: true },
        ]);

        expect((await reportService.getGroupedByMember(99, null, 30)).meta.unmatchedNames).toBe(1);
        expect((await reportService.getGroupedBySkill(99, null, 30)).meta.unmatchedNames).toBe(1);
        expect((await reportService.getComplianceMatrix(99, null, 30)).meta.unmatchedNames).toBe(1);
        const critical = await reportService.getCriticalOverdue(99, null, 30);
        expect(critical.meta.unmatchedNames).toBe(1);
        // The unmatched person is not attributed to anyone
        expect(critical.items.map((g) => g.name)).toEqual(['QFF Skywalker, Luke']);
    });

    it('report no window and no label for complete sources', async () => {
        extractionEngine.getActivePlugin.mockReturnValue(HTML_PLUGIN);
        extractionEngine.extractData.mockResolvedValue([
            { name: 'QFF Skywalker, L', skill: 'Pumps - Basic', dueDate: inDays(20) },
        ]);

        const byMember = await reportService.getGroupedByMember(99, null, 30);
        expect(byMember.meta.sourceWindowMonths).toBeNull();
        expect(byMember.meta.unmatchedNames).toBe(0);
        expect(byMember.items[0].skills[0].dueLabel).toBeNull();
    });
});

describe('statistics compliance overview', () => {
    const statisticsService = require('../services/statistics-service');

    it('counts unmatched report names separately from the charts', async () => {
        extractionEngine.extractData.mockResolvedValue([
            { name: 'QFF Skywalker, L', skill: 'Pumps - Basic', dueDate: inDays(10) },
            { name: 'Jyn Erso', sourceName: 'Jyn Erso', skill: 'Pumps - Basic', dueDate: inDays(10), unresolved: true },
        ]);
        db.getUserPreference.mockResolvedValueOnce(30);

        const result = await statisticsService.getComplianceOverview(99);
        expect(result.compliance).toEqual({ compliant: 0, nonCompliant: 1 });
        expect(result.meta).toMatchObject({ totalMembers: 1, unmatchedNames: 1 });
    });
});
