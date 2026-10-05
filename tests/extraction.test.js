// tests/extraction.test.js
// Route tests for /api/extraction (Skills Data Source — pdf-report snapshots).

const request = require('supertest');
const { createTestApp } = require('./test-utils');

jest.mock('../config', () => ({
    appMode: 'production',
    timezone: 'Pacific/Auckland',
    pdfReport: {
        source: 'gcs',
        localPath: '/app/storage/extraction/OSM-Status-6-months.pdf',
        gcsBucket: 'opready-reports',
        gcsObject: 'OSM-Status-6-months.pdf',
        maxSizeMb: 1,
        staleWarnDays: 35,
    },
}));
jest.mock('../services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../services/db', () => ({
    getLatestExtractionSnapshot: jest.fn(),
    listExtractionSnapshots: jest.fn(),
    getExtractionSnapshotById: jest.fn(),
    getExtractionSnapshotFile: jest.fn(),
    deleteExtractionSnapshot: jest.fn().mockResolvedValue(1),
    getLatestExtractionRecords: jest.fn(),
    getMembers: jest.fn(),
    getMemberById: jest.fn(),
    getMemberSourceAliases: jest.fn(),
    getMemberSourceAliasById: jest.fn(),
    saveManualMemberSourceAlias: jest.fn(),
    deleteMemberSourceAlias: jest.fn().mockResolvedValue(1),
    updateMemberFirstName: jest.fn().mockResolvedValue(),
    logEvent: jest.fn().mockResolvedValue(),
}));
jest.mock('../middleware/auth', () => ({
    hasRole: () => (req, res, next) => next(),
    ROLES: { guest: 0, simple: 1, admin: 2, superadmin: 3 },
}));
jest.mock('../services/extraction-engine', () => ({
    getActivePlugin: jest.fn(() => ({ name: 'pdf-report', description: 'PDF report' })),
    clearCache: jest.fn(),
}));
jest.mock('../services/pdf-report-service', () => {
    const actual = jest.requireActual('../services/pdf-report-service');
    return {
        SNAPSHOT_RETENTION: 24,
        ReportRejectedError: actual.ReportRejectedError,
        snapshotEventPayload: actual.snapshotEventPayload,
        ingestReport: jest.fn(),
        syncFromSource: jest.fn(),
        getLastSync: jest.fn(() => ({ at: null, source: null, status: null, message: null, snapshotId: null })),
    };
});

const config = require('../config');
const db = require('../services/db');
const extractionEngine = require('../services/extraction-engine');
const pdfReportService = require('../services/pdf-report-service');
const extractionRoutes = require('../routes/api/extraction');

const app = createTestApp([{ path: '/api/extraction', router: extractionRoutes }]);
const PDF = Buffer.from('%PDF-1.7\nreport');

const snapshotRow = (over = {}) => ({
    id: 7, plugin: 'pdf-report', source: 'upload', source_ref: null, file_name: 'OSM-Status-6-months.pdf',
    file_hash: 'abc', file_size: 100, report_created_date: '2026-10-05', record_count: 249, member_count: 15,
    skill_count: 32, warnings: [], created_by: 'Test Admin', created_at: '2026-10-05 01:00:00', ...over,
});

// ISO date `days` before today in the app timezone.
function daysAgo(days) {
    const [y, m, d] = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' }).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

beforeEach(() => {
    jest.clearAllMocks();
    config.appMode = 'production';
});

// ── GET /status ─────────────────────────────────────────────────────────────

describe('GET /api/extraction/status', () => {
    it('describes the source and the current report', async () => {
        db.getLatestExtractionSnapshot.mockResolvedValue(snapshotRow({ report_created_date: daysAgo(10) }));
        const res = await request(app).get('/api/extraction/status');

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            activePlugin: { name: 'pdf-report' },
            source: 'gcs',
            sourceLocation: 'gs://opready-reports/OSM-Status-6-months.pdf',
            maxSizeMb: 1,
            staleWarnDays: 35,
            retention: 24,
            latest: { id: 7 },
            ageDays: 10,
            isStale: false,
            lastSync: { status: null },
        });
    });

    it('flags a report older than the stale threshold', async () => {
        db.getLatestExtractionSnapshot.mockResolvedValue(snapshotRow({ report_created_date: daysAgo(40) }));
        const res = await request(app).get('/api/extraction/status');
        expect(res.body).toMatchObject({ ageDays: 40, isStale: true });
    });

    it('handles no report yet', async () => {
        db.getLatestExtractionSnapshot.mockResolvedValue(null);
        const res = await request(app).get('/api/extraction/status');
        expect(res.body).toMatchObject({ latest: null, ageDays: null, isStale: false });
    });

    it('returns 500 on a database error', async () => {
        db.getLatestExtractionSnapshot.mockRejectedValue(new Error('db down'));
        const res = await request(app).get('/api/extraction/status');
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'db down' });
    });
});

// ── GET /snapshots ──────────────────────────────────────────────────────────

describe('GET /api/extraction/snapshots', () => {
    it('returns the snapshot list', async () => {
        db.listExtractionSnapshots.mockResolvedValue([snapshotRow({ id: 2 }), snapshotRow({ id: 1 })]);
        const res = await request(app).get('/api/extraction/snapshots');
        expect(res.status).toBe(200);
        expect(res.body.map((s) => s.id)).toEqual([2, 1]);
    });

    it('returns 500 on a database error', async () => {
        db.listExtractionSnapshots.mockRejectedValue(new Error('db down'));
        expect((await request(app).get('/api/extraction/snapshots')).status).toBe(500);
    });
});

// ── GET /snapshots/:id/file ─────────────────────────────────────────────────

describe('GET /api/extraction/snapshots/:id/file', () => {
    it('downloads the original PDF', async () => {
        db.getExtractionSnapshotFile.mockResolvedValue({ fileName: 'OSM "Status".pdf', buffer: PDF });
        const res = await request(app).get('/api/extraction/snapshots/7/file')
            .buffer(true)
            .parse((stream, cb) => {
                const chunks = [];
                stream.on('data', (c) => chunks.push(c));
                stream.on('end', () => cb(null, Buffer.concat(chunks)));
            });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/pdf');
        expect(res.headers['content-disposition']).toBe('attachment; filename="OSM _Status_.pdf"');
        expect(Buffer.compare(res.body, PDF)).toBe(0);
    });

    it('returns 404 for an unknown snapshot and 400 for a bad id', async () => {
        db.getExtractionSnapshotFile.mockResolvedValue(null);
        expect((await request(app).get('/api/extraction/snapshots/99/file')).status).toBe(404);
        expect((await request(app).get('/api/extraction/snapshots/abc/file')).status).toBe(400);
    });
});

// ── POST /upload ────────────────────────────────────────────────────────────

describe('POST /api/extraction/upload', () => {
    it('imports a report, clears the extraction cache and logs the upload', async () => {
        pdfReportService.ingestReport.mockResolvedValue({ status: 'imported', snapshot: snapshotRow({ warnings: ['w1'] }) });
        const res = await request(app).post('/api/extraction/upload').attach('file', PDF, 'OSM-Status-6-months.pdf');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            success: true, status: 'imported', id: 7, reportCreatedDate: '2026-10-05',
            recordCount: 249, memberCount: 15, skillCount: 32, warnings: ['w1'],
        });
        expect(pdfReportService.ingestReport).toHaveBeenCalledWith(PDF, {
            source: 'upload', fileName: 'OSM-Status-6-months.pdf', actor: 'Test Admin', force: false,
        });
        expect(extractionEngine.clearCache).toHaveBeenCalled();
        expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'System', 'Skills Report Uploaded', {
            snapshotId: 7, fileName: 'OSM-Status-6-months.pdf', source: 'upload', reportCreatedDate: '2026-10-05',
            recordCount: 249, memberCount: 15, skillCount: 32, warningCount: 1, forced: false,
        });
    });

    it('passes force=true through', async () => {
        pdfReportService.ingestReport.mockResolvedValue({ status: 'imported', snapshot: snapshotRow() });
        await request(app).post('/api/extraction/upload').field('force', 'true').attach('file', PDF, 'r.pdf');
        expect(pdfReportService.ingestReport).toHaveBeenCalledWith(PDF, expect.objectContaining({ force: true }));
    });

    it('reports an identical file as unchanged without logging', async () => {
        pdfReportService.ingestReport.mockResolvedValue({ status: 'unchanged', snapshot: snapshotRow() });
        const res = await request(app).post('/api/extraction/upload').attach('file', PDF, 'r.pdf');

        expect(res.body).toEqual({ success: true, status: 'unchanged', id: 7, reportCreatedDate: '2026-10-05' });
        expect(extractionEngine.clearCache).not.toHaveBeenCalled();
        expect(db.logEvent).not.toHaveBeenCalled();
    });

    it.each([
        [400, 'File is not a PDF (missing %PDF- header).'],
        [409, 'This report was created on 2026-09-01, before the current report (2026-10-05).'],
    ])('returns %i for a rejected report', async (status, message) => {
        pdfReportService.ingestReport.mockRejectedValue(new pdfReportService.ReportRejectedError(message, status));
        const res = await request(app).post('/api/extraction/upload').attach('file', PDF, 'r.pdf');

        expect(res.status).toBe(status);
        expect(res.body).toEqual({ error: message });
        expect(db.logEvent).not.toHaveBeenCalled();
    });

    it('returns 413 for a file over the size limit', async () => {
        const res = await request(app).post('/api/extraction/upload').attach('file', Buffer.alloc(1024 * 1024 + 10), 'big.pdf');
        expect(res.status).toBe(413);
        expect(res.body.error).toMatch(/1 MB limit/);
        expect(pdfReportService.ingestReport).not.toHaveBeenCalled();
    });

    it('returns 400 when no file is sent', async () => {
        const res = await request(app).post('/api/extraction/upload').field('force', 'true');
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/No file uploaded/);
    });

    it('returns 500 on an unexpected error', async () => {
        pdfReportService.ingestReport.mockRejectedValue(new Error('disk full'));
        const res = await request(app).post('/api/extraction/upload').attach('file', PDF, 'r.pdf');
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'disk full' });
    });

    it('is disabled in demo mode', async () => {
        config.appMode = 'demo';
        const res = await request(app).post('/api/extraction/upload').attach('file', PDF, 'r.pdf');
        expect(res.status).toBe(403);
        expect(pdfReportService.ingestReport).not.toHaveBeenCalled();
    });
});

// ── POST /sync ──────────────────────────────────────────────────────────────

describe('POST /api/extraction/sync', () => {
    it('checks the source now and clears the cache after an import', async () => {
        const result = { at: '2026-10-05T01:00:00.000Z', source: 'gcs', status: 'imported', message: 'Imported', snapshotId: 8 };
        pdfReportService.syncFromSource.mockResolvedValue(result);
        const res = await request(app).post('/api/extraction/sync');

        expect(res.status).toBe(200);
        expect(res.body).toEqual(result);
        expect(pdfReportService.syncFromSource).toHaveBeenCalledWith({ actor: 'Test Admin', recheck: true });
        expect(extractionEngine.clearCache).toHaveBeenCalled();
    });

    it('keeps the cache when nothing changed', async () => {
        pdfReportService.syncFromSource.mockResolvedValue({ status: 'unchanged' });
        await request(app).post('/api/extraction/sync');
        expect(extractionEngine.clearCache).not.toHaveBeenCalled();
    });

    it('returns 500 on an unexpected error', async () => {
        pdfReportService.syncFromSource.mockRejectedValue(new Error('boom'));
        expect((await request(app).post('/api/extraction/sync')).status).toBe(500);
    });

    it('is disabled in demo mode', async () => {
        config.appMode = 'demo';
        expect((await request(app).post('/api/extraction/sync')).status).toBe(403);
        expect(pdfReportService.syncFromSource).not.toHaveBeenCalled();
    });
});

// ── Member name matching ────────────────────────────────────────────────────

describe('GET /api/extraction/name-matches', () => {
    const keith = { id: 1, name: 'QFF Keith, A', rank: 'QFF', first_name: 'A', last_name: 'Keith', enabled: 1 };
    const robertsA = { id: 2, name: 'FF Roberts, G', rank: 'FF', first_name: 'G', last_name: 'Roberts', enabled: 1 };
    const robertsB = { id: 3, name: 'QFF Roberts, G', rank: 'QFF', first_name: 'G', last_name: 'Roberts', enabled: 0 };
    const rec = (sourceName) => ({ name: sourceName, sourceName, skill: 'S' });

    it('describes how each name in the current report is matched', async () => {
        db.getLatestExtractionRecords.mockResolvedValue({
            snapshot: snapshotRow(),
            records: [rec('Andrew Keith'), rec('Andrew Keith'), rec('Geoff Roberts'), rec('Emma Ryan')],
        });
        db.getMembers.mockResolvedValue([keith, robertsA, robertsB]);
        db.getMemberSourceAliases.mockResolvedValue([]);

        const res = await request(app).get('/api/extraction/name-matches');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([
            {
                sourceName: 'Andrew Keith', entryCount: 2, status: 'suggested', aliasId: null,
                member: { id: 1, name: 'QFF Keith, A', rank: 'QFF', firstName: 'A', lastName: 'Keith', enabled: true },
                candidates: [expect.objectContaining({ id: 1 })],
            },
            {
                sourceName: 'Geoff Roberts', entryCount: 1, status: 'ambiguous', aliasId: null, member: null,
                candidates: [expect.objectContaining({ id: 2 }), expect.objectContaining({ id: 3, enabled: false })],
            },
            { sourceName: 'Emma Ryan', entryCount: 1, status: 'unmatched', aliasId: null, member: null, candidates: [] },
        ]);
        expect(db.saveManualMemberSourceAlias).not.toHaveBeenCalled();
    });

    it('returns an empty list when no report has been imported', async () => {
        db.getLatestExtractionRecords.mockResolvedValue(null);
        const res = await request(app).get('/api/extraction/name-matches');
        expect(res.body).toEqual([]);
    });

    it('returns 500 on a database error', async () => {
        db.getLatestExtractionRecords.mockRejectedValue(new Error('db down'));
        expect((await request(app).get('/api/extraction/name-matches')).status).toBe(500);
    });
});

describe('POST /api/extraction/name-matches', () => {
    it('links a name to a member, stores the full first name and logs it', async () => {
        db.getMemberById.mockResolvedValue({ id: 4, name: 'FF Whybrow, R', first_name: 'R', last_name: 'Whybrow' });
        db.saveManualMemberSourceAlias.mockResolvedValue(21);

        const res = await request(app).post('/api/extraction/name-matches').send({ sourceName: '  Rob   Whybrow ', memberId: 4 });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, id: 21, firstNameStored: 'Rob' });
        expect(db.saveManualMemberSourceAlias).toHaveBeenCalledWith({
            sourceName: 'Rob Whybrow', sourceKey: 'rob whybrow', memberId: 4, createdBy: 'Test Admin',
        });
        expect(db.updateMemberFirstName).toHaveBeenCalledWith(4, 'Rob');
        expect(extractionEngine.clearCache).toHaveBeenCalled();
        expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Member', 'Member Name Matched', {
            aliasId: 21, sourceName: 'Rob Whybrow', memberId: 4, memberName: 'FF Whybrow, R', firstNameStored: 'Rob',
        });
    });

    it('keeps an existing full first name', async () => {
        db.getMemberById.mockResolvedValue({ id: 4, name: 'FF Smith, R', first_name: 'Robert', last_name: 'Smith' });
        db.saveManualMemberSourceAlias.mockResolvedValue(22);
        const res = await request(app).post('/api/extraction/name-matches').send({ sourceName: 'Bob Smith', memberId: 4 });
        expect(res.body.firstNameStored).toBeNull();
        expect(db.updateMemberFirstName).not.toHaveBeenCalled();
    });

    it.each([
        [{ memberId: 4 }, /sourceName is required/],
        [{ sourceName: 'x'.repeat(201), memberId: 4 }, /sourceName is required/],
        [{ sourceName: 'Rob Whybrow' }, /memberId is required/],
        [{ sourceName: 'Rob Whybrow', memberId: 'abc' }, /memberId is required/],
    ])('returns 400 for %p', async (body, message) => {
        const res = await request(app).post('/api/extraction/name-matches').send(body);
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(message);
    });

    it('returns 404 for an unknown member', async () => {
        db.getMemberById.mockResolvedValue(undefined);
        const res = await request(app).post('/api/extraction/name-matches').send({ sourceName: 'Rob Whybrow', memberId: 99 });
        expect(res.status).toBe(404);
        expect(db.saveManualMemberSourceAlias).not.toHaveBeenCalled();
    });

    it('returns 500 on a database error', async () => {
        db.getMemberById.mockRejectedValue(new Error('db down'));
        expect((await request(app).post('/api/extraction/name-matches').send({ sourceName: 'Rob Whybrow', memberId: 4 })).status).toBe(500);
    });

    it('is disabled in demo mode', async () => {
        config.appMode = 'demo';
        expect((await request(app).post('/api/extraction/name-matches').send({ sourceName: 'Rob Whybrow', memberId: 4 })).status).toBe(403);
    });
});

describe('DELETE /api/extraction/name-matches/:id', () => {
    it('removes a match and logs it', async () => {
        db.getMemberSourceAliasById.mockResolvedValue({
            id: 21, source_name: 'Rob Whybrow', member_id: 4, member_name: 'FF Whybrow, R', match_type: 'manual',
        });
        const res = await request(app).delete('/api/extraction/name-matches/21');

        expect(res.status).toBe(200);
        expect(db.deleteMemberSourceAlias).toHaveBeenCalledWith(21);
        expect(extractionEngine.clearCache).toHaveBeenCalled();
        expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'Member', 'Member Name Match Removed', {
            aliasId: 21, sourceName: 'Rob Whybrow', memberId: 4, memberName: 'FF Whybrow, R', matchType: 'manual',
        });
    });

    it('returns 404 for an unknown match and 400 for a bad id', async () => {
        db.getMemberSourceAliasById.mockResolvedValue(undefined);
        expect((await request(app).delete('/api/extraction/name-matches/99')).status).toBe(404);
        expect((await request(app).delete('/api/extraction/name-matches/x')).status).toBe(400);
        expect(db.deleteMemberSourceAlias).not.toHaveBeenCalled();
    });

    it('is disabled in demo mode', async () => {
        config.appMode = 'demo';
        expect((await request(app).delete('/api/extraction/name-matches/21')).status).toBe(403);
    });
});

// ── DELETE /snapshots/:id ───────────────────────────────────────────────────

describe('DELETE /api/extraction/snapshots/:id', () => {
    it('deletes the current report, clears the cache and logs it', async () => {
        db.getExtractionSnapshotById.mockResolvedValue(snapshotRow({ id: 7 }));
        db.getLatestExtractionSnapshot.mockResolvedValue(snapshotRow({ id: 7 }));
        const res = await request(app).delete('/api/extraction/snapshots/7');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true });
        expect(db.deleteExtractionSnapshot).toHaveBeenCalledWith(7);
        expect(extractionEngine.clearCache).toHaveBeenCalled();
        expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'System', 'Skills Report Deleted',
            expect.objectContaining({ snapshotId: 7, reportCreatedDate: '2026-10-05', wasCurrent: true }));
    });

    it('deletes an older report without clearing the cache', async () => {
        db.getExtractionSnapshotById.mockResolvedValue(snapshotRow({ id: 3 }));
        db.getLatestExtractionSnapshot.mockResolvedValue(snapshotRow({ id: 7 }));
        await request(app).delete('/api/extraction/snapshots/3');

        expect(extractionEngine.clearCache).not.toHaveBeenCalled();
        expect(db.logEvent).toHaveBeenCalledWith('Test Admin', 'System', 'Skills Report Deleted', expect.objectContaining({ wasCurrent: false }));
    });

    it('returns 404 for an unknown report and 400 for a bad id', async () => {
        db.getExtractionSnapshotById.mockResolvedValue(null);
        expect((await request(app).delete('/api/extraction/snapshots/99')).status).toBe(404);
        expect((await request(app).delete('/api/extraction/snapshots/0')).status).toBe(400);
        expect(db.deleteExtractionSnapshot).not.toHaveBeenCalled();
    });

    it('returns 500 on a database error', async () => {
        db.getExtractionSnapshotById.mockRejectedValue(new Error('db down'));
        expect((await request(app).delete('/api/extraction/snapshots/7')).status).toBe(500);
    });

    it('is disabled in demo mode', async () => {
        config.appMode = 'demo';
        expect((await request(app).delete('/api/extraction/snapshots/7')).status).toBe(403);
        expect(db.deleteExtractionSnapshot).not.toHaveBeenCalled();
    });
});
