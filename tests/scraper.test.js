// tests/scraper.test.js
// Tests for the ETL plugin layer: name-parser, skill categoriser, and html-scraper plugin.

const axios = require('axios');
const { parseMemberName } = require('../services/plugins/name-parser');

// All jest.mock() calls are hoisted — declare them at the top of the file
jest.mock('axios');

jest.mock('../config', () => ({
    appMode: 'production',
    url: 'http://fake-oi.osm/dashboard',
    locale: 'en-NZ',
    timezone: 'Pacific/Auckland',
    gcsConfig: { bucketName: null, dataFilename: null },
    extractionPlugin: 'html-scraper',
    scrapingInterval: 60,
    rateLimits: {
        login:         { windowMin: 15, max: 10  },
        mfa:           { windowMin: 5,  max: 5   },
        forgotPassword:{ windowMin: 30, max: 3   },
        api:           { windowMin: 1,  max: 300 },
        publicSubmit:  { windowMin: 5,  max: 30  },
    },
}));

// Logger is loaded transitively by the plugin — stub it out
jest.mock('../services/logger', () => ({
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
}));

const htmlScraperPlugin = require('../services/plugins/html-scraper.plugin');
const mockConfig = require('../config');
const mockLogger = jest.fn();

// ── name-parser ───────────────────────────────────────────────────────────────

describe('parseMemberName', () => {
    it('parses standard "RANK LastName, FirstInitial" format', () => {
        expect(parseMemberName('QFF Skywalker, L')).toEqual({
            rank: 'QFF',
            lastName: 'Skywalker',
            firstName: 'L',
        });
    });

    it('parses two-letter rank', () => {
        expect(parseMemberName('FF Kenobi, O')).toEqual({
            rank: 'FF',
            lastName: 'Kenobi',
            firstName: 'O',
        });
    });

    it('parses full first name after comma', () => {
        expect(parseMemberName('SFF Organa, Leia')).toEqual({
            rank: 'SFF',
            lastName: 'Organa',
            firstName: 'Leia',
        });
    });

    it('handles name without a rank prefix', () => {
        const result = parseMemberName('Solo, H');
        expect(result.rank).toBe('');
        expect(result.lastName).toBe('Solo');
        expect(result.firstName).toBe('H');
    });

    it('handles space-separated name without comma', () => {
        const result = parseMemberName('FF Vader');
        expect(result.rank).toBe('FF');
        expect(result.lastName).toBe('Vader');
        expect(result.firstName).toBe('');
    });

    it('returns empty strings for an empty input', () => {
        expect(parseMemberName('')).toEqual({ rank: '', lastName: '', firstName: '' });
    });

    it('returns empty strings for null input', () => {
        expect(parseMemberName(null)).toEqual({ rank: '', lastName: '', firstName: '' });
    });
});

// ── html-scraper plugin — full record shape ───────────────────────────────────

describe('html-scraper plugin', () => {
    beforeEach(() => jest.clearAllMocks());

    it('parses member skills and includes all contract fields', async () => {
        const fakeHtml = `
            <html><body>
                <table><tbody>
                    <tr>
                        <td>QFF Skywalker, L</td>
                        <td>First Aid</td>
                        <td>2026-05-15</td>
                    </tr>
                    <tr>
                        <td>FF Kenobi, O</td>
                        <td>Driving</td>
                        <td>2026-08-20</td>
                    </tr>
                </tbody></table>
            </body></html>
        `;
        axios.get.mockResolvedValue({ data: fakeHtml });

        const records = await htmlScraperPlugin.extract(mockConfig, mockLogger);

        expect(records).toHaveLength(2);

        expect(records[0]).toMatchObject({
            name: 'QFF Skywalker, L',
            rank: 'QFF',
            lastName: 'Skywalker',
            firstName: 'L',
            memberOsmId: 'QFF Skywalker, L',
            skill: 'First Aid',
            skillOsmId: 'First Aid',
            skillCategory: 'First Aid',
            dueDate: '2026-05-15',
        });

        expect(records[1]).toMatchObject({
            name: 'FF Kenobi, O',
            rank: 'FF',
            lastName: 'Kenobi',
            firstName: 'O',
            memberOsmId: 'FF Kenobi, O',
            skill: 'Driving',
            skillOsmId: 'Driving',
            skillCategory: 'Vehicle & Appliance',
            dueDate: '2026-08-20',
        });
    });

    it('returns an empty array when no <tbody> is found', async () => {
        axios.get.mockResolvedValue({ data: '<html><body><p>No table</p></body></html>' });
        const records = await htmlScraperPlugin.extract(mockConfig, mockLogger);
        expect(records).toEqual([]);
    });

    it('returns an empty array on empty response', async () => {
        axios.get.mockResolvedValue({ data: '' });
        const records = await htmlScraperPlugin.extract(mockConfig, mockLogger);
        expect(records).toEqual([]);
    });

    it('throws on network error', async () => {
        axios.get.mockRejectedValue(new Error('Network Timeout'));
        await expect(htmlScraperPlugin.extract(mockConfig, mockLogger)).rejects.toThrow('Network Timeout');
    });

    it('validateConfig passes for production mode with a URL', () => {
        const result = htmlScraperPlugin.validateConfig(mockConfig);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('validateConfig fails for gcs mode without bucket name', () => {
        const cfg = { ...mockConfig, appMode: 'gcs', gcsConfig: { bucketName: null, dataFilename: 'x.html' } };
        const result = htmlScraperPlugin.validateConfig(cfg);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('GCS_BUCKET_NAME'))).toBe(true);
    });
});

// ── skill categoriser ─────────────────────────────────────────────────────────
// categoriseSkill is internal to the plugin; tested indirectly via extract() output.
// One it.each row per supported category + edge cases.

const CATEGORY_CASES = [
    // [skillName, expectedCategory]
    ['OI (IS1) - Operational Safety',                            'Operational Integrity'],
    ['OI (H6-2) - Portable gas cylinders',                      'Operational Integrity'],
    ['Pumps - Appliance Pump Operation from Pressure Fed Supply', 'Pumps'],
    ['Line Rescue - Standard Knots',                             'Line Rescue'],
    ['Ladders - Access',                                         'Ladders'],
    ['Breathing Apparatus - Entry',                              'Breathing Apparatus'],
    ['First Aid Level 2',                                        'First Aid'],
    ['Hazmat - Spill Response',                                  'Hazardous Materials'],
    ['Vehicle Rescue - Road Crash',                              'Vehicle & Appliance'],
    ['Radio Communications - Basic',                             'Communications'],
    ['Firefighting - Structure Fire',                            'Firefighting'],
    ['Incident Command - ICS Level 1',                           'Command & Leadership'],
    ['Rope Rescue - High Angle',                                 'Rescue'],
    ['Unknown Obscure Skill',                                    'General'],               // no rule, no dash → General
    ['Some Custom Category - specific detail',                   'Some Custom Category'],  // fallback: text before " - "
];

describe('skill categoriser', () => {
    beforeEach(() => jest.clearAllMocks());

    it.each(CATEGORY_CASES)('"%s" → %s', async (skillName, expectedCategory) => {
        const fakeHtml = `<html><body><table><tbody>
            <tr><td>FF Solo, H</td><td>${skillName}</td><td>2026-01-01</td></tr>
        </tbody></table></body></html>`;
        axios.get.mockResolvedValue({ data: fakeHtml });
        const records = await htmlScraperPlugin.extract(mockConfig, jest.fn());
        expect(records[0].skillCategory).toBe(expectedCategory);
    });
});
