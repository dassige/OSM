// tests/pdf-report-service.test.js
// Tests for skills-report ingestion (services/pdf-report-service.js) and the
// pdf-report plugin wrapper.  The DB, GCS and pdf.js loader are mocked; the
// grid parser runs for real against the anonymised fixture.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../config', () => ({
    appMode: 'production',
    timezone: 'Pacific/Auckland',
    pdfReport: {
        source: 'local',
        localPath: '',
        gcsBucket: 'opready-reports',
        gcsObject: 'OSM-Status-6-months.pdf',
        maxSizeMb: 1,
        staleWarnDays: 35,
    },
}));
jest.mock('../services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../services/db', () => ({
    getLatestExtractionSnapshot: jest.fn(),
    getLatestExtractionSnapshotBySource: jest.fn(),
    getExtractionSnapshotById: jest.fn(),
    createExtractionSnapshot: jest.fn(),
    pruneExtractionSnapshots: jest.fn(),
    getLatestExtractionRecords: jest.fn(),
    // member-name-resolver (called by the plugin's extract)
    getMembers: jest.fn().mockResolvedValue([]),
    getMemberSourceAliases: jest.fn().mockResolvedValue([]),
    getSkills: jest.fn().mockResolvedValue([]),
    createAutoMemberSourceAlias: jest.fn().mockResolvedValue(true),
    updateMemberFirstName: jest.fn().mockResolvedValue(),
    logEvent: jest.fn().mockResolvedValue(),
}));
// pdfjs-dist is ESM-only — the loader is mocked and fed the anonymised fixture pages.
jest.mock('../services/plugins/pdf/pdf-text', () => ({ extractTextItems: jest.fn() }));
jest.mock('@google-cloud/storage', () => {
    const file = { getMetadata: jest.fn(), download: jest.fn() };
    return { Storage: jest.fn(() => ({ bucket: jest.fn(() => ({ file: jest.fn(() => file) })) })), __file: file };
});

const config = require('../config');
const db = require('../services/db');
const { extractTextItems } = require('../services/plugins/pdf/pdf-text');
const gcsFile = require('@google-cloud/storage').__file;
const service = require('../services/pdf-report-service');
const plugin = require('../services/plugins/pdf-report.plugin');
const fixture = require('./fixtures/pdf-report/six-month-report.items.json');

const pdf = (tag = 'body') => Buffer.from(`%PDF-1.7\n${tag}`);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const snapshotRow = (over = {}) => ({
    id: 11, plugin: 'pdf-report', source: 'upload', source_ref: null, file_name: 'report.pdf', file_hash: 'abc',
    file_size: 100, report_created_date: '2026-10-05', record_count: 249, member_count: 15, skill_count: 32,
    warnings: [], created_by: 'Admin', created_at: '2026-10-05 01:00:00', ...over,
});

let tmpDir;
let mtimeSeq = 1_700_000_000;
// Write a local report file with a unique modification time (the change marker).
function writeLocalReport(name, content) {
    const file = path.join(tmpDir, name);
    fs.writeFileSync(file, content);
    mtimeSeq += 60;
    fs.utimesSync(file, new Date(mtimeSeq * 1000), new Date(mtimeSeq * 1000));
    config.pdfReport.localPath = file;
    return { file, ref: `${mtimeSeq * 1000}:${fs.statSync(file).size}` };
}

beforeAll(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-report-service-')); });
afterAll(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

beforeEach(() => {
    jest.clearAllMocks();
    config.appMode = 'production';
    config.pdfReport.source = 'local';
    extractTextItems.mockResolvedValue({ pageCount: fixture.pages.length, pages: fixture.pages });
    db.getLatestExtractionSnapshot.mockResolvedValue(null);
    db.getLatestExtractionSnapshotBySource.mockResolvedValue(null);
    db.createExtractionSnapshot.mockResolvedValue(11);
    db.pruneExtractionSnapshots.mockResolvedValue(0);
    db.getExtractionSnapshotById.mockImplementation(async (id) => snapshotRow({ id }));
});

// ── assertPdfBuffer ─────────────────────────────────────────────────────────

describe('assertPdfBuffer', () => {
    it.each([
        ['an empty buffer', Buffer.alloc(0), 400, /empty/],
        ['a non-PDF file', Buffer.from('<html>not a pdf</html>'), 400, /not a PDF/],
        ['an oversized file', Buffer.concat([pdf(), Buffer.alloc(1024 * 1024)]), 413, /1 MB limit/],
    ])('rejects %s', (_label, buffer, status, message) => {
        let err;
        try { service.assertPdfBuffer(buffer, 1); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(service.ReportRejectedError);
        expect(err.status).toBe(status);
        expect(err.message).toMatch(message);
    });

    it('accepts a PDF header', () => {
        expect(() => service.assertPdfBuffer(pdf(), 1)).not.toThrow();
    });
});

// ── parsePdfReport ──────────────────────────────────────────────────────────

describe('parsePdfReport', () => {
    it('returns extraction-contract records', async () => {
        const { createdDate, records, warnings } = await service.parsePdfReport(pdf(), { maxSizeMb: 1 });
        expect(createdDate).toBe('2026-10-05');
        expect(warnings).toEqual([]);
        expect(records).toHaveLength(249);
        expect(records.find((r) => r.sourceName === 'Obi-Wan Kenobi' && r.skill === 'BA - Search & Rescue')).toEqual({
            name: 'Obi-Wan Kenobi',
            rank: '',
            lastName: 'Kenobi',
            firstName: 'Obi-Wan',
            memberOsmId: 'Obi-Wan Kenobi',
            skill: 'BA - Search & Rescue',
            skillOsmId: 'BA - Search & Rescue',
            skillCategory: 'B.A',
            dueDate: '2026-12-01',
            dueMonth: '2026-12',
            lapsed: false,
            withinOneMonth: false,
            sourceName: 'Obi-Wan Kenobi',
            reportCreatedDate: '2026-10-05',
        });
    });

    it('reports a file that is not a readable report as a 400 rejection', async () => {
        extractTextItems.mockResolvedValue({ pageCount: 1, pages: [{ page: 1, items: [{ x: 1, y: 1, text: 'Hello', bold: false, color: '#000000' }] }] });
        await expect(service.parsePdfReport(pdf(), { maxSizeMb: 1 }))
            .rejects.toMatchObject({ name: 'ReportRejectedError', status: 400, message: expect.stringMatching(/Not a readable skills report: .*header row/) });
    });

    it('does not blame the file when the PDF library itself is missing', async () => {
        const setup = Object.assign(new Error('The PDF library (pdfjs-dist) could not be loaded on the server'), { setupError: true });
        extractTextItems.mockRejectedValue(setup);
        await expect(service.parsePdfReport(pdf(), { maxSizeMb: 1 })).rejects.toBe(setup);
    });

    it('also rejects PDFs that pdf.js cannot open', async () => {
        extractTextItems.mockRejectedValue(new Error('Invalid PDF structure.'));
        await expect(service.parsePdfReport(pdf(), { maxSizeMb: 1 }))
            .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/Invalid PDF structure/) });
    });
});

// ── ingestReport ────────────────────────────────────────────────────────────

describe('ingestReport', () => {
    it('stores a new report as the current snapshot', async () => {
        const buffer = pdf('new');
        const result = await service.ingestReport(buffer, { source: 'upload', fileName: 'report.pdf', actor: 'Admin' });

        expect(result).toEqual({ status: 'imported', snapshot: snapshotRow({ id: 11 }) });
        const saved = db.createExtractionSnapshot.mock.calls[0][0];
        expect(saved).toMatchObject({
            plugin: 'pdf-report', source: 'upload', sourceRef: null, fileName: 'report.pdf',
            fileHash: sha256(buffer), fileSize: buffer.length, fileData: buffer,
            reportCreatedDate: '2026-10-05', recordCount: 249, memberCount: 15, skillCount: 32,
            warnings: [], createdBy: 'Admin',
        });
        expect(saved.records).toHaveLength(249);
        expect(db.pruneExtractionSnapshots).toHaveBeenCalledWith(service.SNAPSHOT_RETENTION);
    });

    it('reports an identical file as unchanged without parsing it', async () => {
        const buffer = pdf('same');
        const latest = snapshotRow({ file_hash: sha256(buffer) });
        db.getLatestExtractionSnapshot.mockResolvedValue(latest);

        expect(await service.ingestReport(buffer, { source: 'upload' })).toEqual({ status: 'unchanged', snapshot: latest });
        expect(extractTextItems).not.toHaveBeenCalled();
        expect(db.createExtractionSnapshot).not.toHaveBeenCalled();
    });

    it('rejects a report older than the current one with 409', async () => {
        db.getLatestExtractionSnapshot.mockResolvedValue(snapshotRow({ report_created_date: '2026-11-02' }));
        await expect(service.ingestReport(pdf('old'), { source: 'upload' }))
            .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/2026-10-05, before the current report \(2026-11-02\)/) });
        expect(db.createExtractionSnapshot).not.toHaveBeenCalled();
    });

    it('accepts an older report when forced', async () => {
        db.getLatestExtractionSnapshot.mockResolvedValue(snapshotRow({ report_created_date: '2026-11-02' }));
        const result = await service.ingestReport(pdf('old'), { source: 'upload', force: true });
        expect(result.status).toBe('imported');
    });

    it('accepts a different report with the same report date', async () => {
        db.getLatestExtractionSnapshot.mockResolvedValue(snapshotRow({ report_created_date: '2026-10-05' }));
        expect((await service.ingestReport(pdf('regenerated'), { source: 'upload' })).status).toBe('imported');
    });

    it('rejects invalid files before touching the database', async () => {
        await expect(service.ingestReport(Buffer.from('nope'), { source: 'upload' })).rejects.toMatchObject({ status: 400 });
        expect(db.getLatestExtractionSnapshot).not.toHaveBeenCalled();
    });
});

// ── syncFromSource ──────────────────────────────────────────────────────────

describe('syncFromSource', () => {
    it('does nothing when reports arrive by upload only', async () => {
        config.pdfReport.source = 'upload';
        const result = await service.syncFromSource();
        expect(result).toMatchObject({ source: 'upload', status: 'skipped' });
        expect(db.getLatestExtractionSnapshotBySource).not.toHaveBeenCalled();
    });

    it('reports an unknown source as an error', async () => {
        config.pdfReport.source = 'ftp';
        expect(await service.syncFromSource()).toMatchObject({ status: 'error', message: expect.stringMatching(/Unknown PDF_SOURCE "ftp"/) });
    });

    describe('local file', () => {
        it('reports a missing file', async () => {
            config.pdfReport.localPath = path.join(tmpDir, 'missing.pdf');
            expect(await service.syncFromSource()).toMatchObject({ status: 'missing', message: expect.stringContaining('missing.pdf') });
        });

        it('imports a new file and logs the import', async () => {
            const { ref } = writeLocalReport('report-a.pdf', pdf('a'));
            const result = await service.syncFromSource({ actor: 'System' });

            expect(result).toMatchObject({ source: 'local', status: 'imported', snapshotId: 11, message: expect.stringMatching(/2026-10-05/) });
            expect(db.createExtractionSnapshot).toHaveBeenCalledWith(expect.objectContaining({ source: 'local', sourceRef: ref, fileName: 'report-a.pdf' }));
            expect(db.logEvent).toHaveBeenCalledWith('System', 'System', 'Skills Report Imported', expect.objectContaining({
                snapshotId: 11, reportCreatedDate: '2026-10-05', recordCount: 249, memberCount: 15, skillCount: 32, warningCount: 0,
            }));
            expect(service.getLastSync()).toEqual(result);
        });

        it('skips a file that was already imported', async () => {
            const { ref } = writeLocalReport('report-b.pdf', pdf('b'));
            db.getLatestExtractionSnapshotBySource.mockResolvedValue(snapshotRow({ id: 5, source: 'local', source_ref: ref }));

            expect(await service.syncFromSource()).toMatchObject({ status: 'unchanged', snapshotId: 5 });
            expect(db.createExtractionSnapshot).not.toHaveBeenCalled();
            expect(db.logEvent).not.toHaveBeenCalled();
        });

        it('reports a missing PDF library as an error and retries the file next time', async () => {
            writeLocalReport('setup.pdf', pdf('setup'));
            const setup = Object.assign(new Error('The PDF library (pdfjs-dist) could not be loaded on the server'), { setupError: true });
            extractTextItems.mockRejectedValueOnce(setup);

            const first = await service.syncFromSource();
            expect(first).toMatchObject({ status: 'error', message: expect.stringMatching(/PDF library \(pdfjs-dist\) could not be loaded/) });
            expect(db.logEvent).not.toHaveBeenCalledWith(expect.anything(), 'System', 'Skills Report Rejected', expect.anything());

            // Library fixed (e.g. container rebuilt): the same file is picked up without a manual recheck
            expect(await service.syncFromSource()).toMatchObject({ status: 'imported' });
            expect(extractTextItems).toHaveBeenCalledTimes(2);
        });

        it('rejects a bad file once and retries it only on request', async () => {
            writeLocalReport('bad.pdf', 'not a pdf at all');

            const first = await service.syncFromSource();
            expect(first).toMatchObject({ status: 'rejected', message: expect.stringMatching(/not a PDF/) });
            expect(db.logEvent).toHaveBeenCalledWith('System', 'System', 'Skills Report Rejected', {
                source: 'local', fileName: 'bad.pdf', reason: expect.stringMatching(/not a PDF/),
            });

            db.logEvent.mockClear();
            expect(await service.syncFromSource()).toMatchObject({ status: 'rejected' });
            expect(db.logEvent).not.toHaveBeenCalled();

            await service.syncFromSource({ recheck: true, actor: 'Admin' });
            expect(db.logEvent).toHaveBeenCalledWith('Admin', 'System', 'Skills Report Rejected', expect.any(Object));
        });
    });

    describe('Google Cloud Storage', () => {
        beforeEach(() => { config.pdfReport.source = 'gcs'; });

        it('reports a missing object', async () => {
            gcsFile.getMetadata.mockRejectedValue(Object.assign(new Error('No such object'), { code: 404 }));
            expect(await service.syncFromSource()).toMatchObject({
                status: 'missing', message: expect.stringContaining('gs://opready-reports/OSM-Status-6-months.pdf'),
            });
        });

        it('imports a new object generation', async () => {
            gcsFile.getMetadata.mockResolvedValue([{ generation: '1001', size: '20' }]);
            gcsFile.download.mockResolvedValue([pdf('gcs-1001')]);

            expect(await service.syncFromSource()).toMatchObject({ source: 'gcs', status: 'imported' });
            expect(db.createExtractionSnapshot).toHaveBeenCalledWith(expect.objectContaining({
                source: 'gcs', sourceRef: '1001', fileName: 'OSM-Status-6-months.pdf',
            }));
        });

        it('does not download a generation that was already imported', async () => {
            gcsFile.getMetadata.mockResolvedValue([{ generation: '1002', size: '20' }]);
            db.getLatestExtractionSnapshotBySource.mockResolvedValue(snapshotRow({ source: 'gcs', source_ref: '1002' }));

            expect(await service.syncFromSource()).toMatchObject({ status: 'unchanged' });
            expect(gcsFile.download).not.toHaveBeenCalled();
        });

        it('rejects an oversized object without downloading it', async () => {
            gcsFile.getMetadata.mockResolvedValue([{ generation: '1003', size: String(2 * 1024 * 1024) }]);
            expect(await service.syncFromSource()).toMatchObject({ status: 'rejected', message: expect.stringMatching(/1 MB limit/) });
            expect(gcsFile.download).not.toHaveBeenCalled();
        });

        it('reports a failed check as an error', async () => {
            gcsFile.getMetadata.mockRejectedValue(new Error('permission denied'));
            expect(await service.syncFromSource()).toMatchObject({ status: 'error', message: expect.stringMatching(/permission denied/) });
        });

        it('retries a download that failed transiently', async () => {
            gcsFile.getMetadata.mockResolvedValue([{ generation: '1004', size: '20' }]);
            gcsFile.download.mockRejectedValueOnce(new Error('socket hang up')).mockResolvedValueOnce([pdf('gcs-1004')]);

            expect(await service.syncFromSource()).toMatchObject({ status: 'error', message: expect.stringMatching(/socket hang up/) });
            expect(await service.syncFromSource()).toMatchObject({ status: 'imported' });
            expect(gcsFile.download).toHaveBeenCalledTimes(2);
        });
    });
});

// ── pdf-report plugin ───────────────────────────────────────────────────────

describe('pdf-report plugin', () => {
    it('declares its six-month, month-only coverage', () => {
        expect(plugin.coverage).toEqual({ windowMonths: 6, monthPrecision: true });
    });

    describe('dueLabelFor', () => {
        it.each([
            [{ dueMonth: '2026-11', dueDate: '2026-11-05', lapsed: false }, 'en-NZ', 'Nov 2026'],
            [{ dueMonth: '2027-03', dueDate: '2027-03-01', lapsed: false }, 'en-NZ', 'Mar 2027'],
            [{ dueMonth: null, dueDate: '2026-09-30', lapsed: true }, 'en-NZ', 'Lapsed'],
            [{ dueDate: '2026-12-01' }, 'en-NZ', '2026-12-01'],
        ])('labels %p', (record, locale, expected) => {
            expect(plugin.dueLabelFor(record, locale)).toBe(expected);
        });
    });

    describe('validateConfig', () => {
        const cfg = (pdfReport, extra = {}) => ({ appMode: 'production', pdfReport, ...extra });

        it.each([
            ['local', { source: 'local', localPath: '/data/r.pdf' }],
            ['gcs', { source: 'gcs', gcsBucket: 'b', gcsObject: 'o.pdf' }],
            ['upload', { source: 'upload' }],
        ])('accepts the %s source', (_label, pdfReport) => {
            expect(plugin.validateConfig(cfg(pdfReport))).toEqual({ valid: true, errors: [] });
        });

        it.each([
            ['an unknown source', { source: 'ftp' }, /PDF_SOURCE must be one of/],
            ['local without a path', { source: 'local' }, /PDF_LOCAL_PATH is required/],
            ['gcs without a bucket', { source: 'gcs', gcsObject: 'o.pdf' }, /PDF_GCS_BUCKET/],
        ])('reports %s', (_label, pdfReport, message) => {
            const { valid, errors } = plugin.validateConfig(cfg(pdfReport));
            expect(valid).toBe(false);
            expect(errors).toEqual([expect.stringMatching(message)]);
        });

        it('refuses demo mode', () => {
            expect(plugin.validateConfig(cfg({ source: 'upload' }, { appMode: 'demo' })).errors)
                .toEqual([expect.stringMatching(/demo mode/)]);
        });
    });

    describe('extract', () => {
        const log = jest.fn();

        it('returns the newest report with member names resolved', async () => {
            config.pdfReport.source = 'upload';
            const kenobi = { id: 3, name: 'SO Kenobi, O', rank: 'SO', first_name: 'O', last_name: 'Kenobi', member_osm_id: null };
            db.getMembers.mockResolvedValueOnce([kenobi]);
            const records = [
                { name: 'Obi-Wan Kenobi', sourceName: 'Obi-Wan Kenobi', skill: 'BA - Search & Rescue', dueDate: '2026-12-01', dueMonth: '2026-12', lapsed: false },
                { name: 'Han Solo', sourceName: 'Han Solo', skill: 'BA - Search & Rescue', dueDate: '2026-09-30', dueMonth: null, lapsed: true },
            ];
            db.getLatestExtractionRecords.mockResolvedValue({ snapshot: snapshotRow(), records });

            const out = await plugin.extract({ ...config, locale: 'en-NZ' }, log);
            expect(out[0]).toMatchObject({ name: 'SO Kenobi, O', memberId: 3, firstName: 'Obi-Wan', sourceName: 'Obi-Wan Kenobi', dueLabel: 'Dec 2026' });
            expect(out[1]).toMatchObject({ name: 'Han Solo', unresolved: true, dueLabel: 'Lapsed' });
            expect(log).toHaveBeenCalledWith(expect.stringMatching(/Using the report created on 2026-10-05 \(249 records, 15 members, 32 skills\)/));
            expect(log).toHaveBeenCalledWith(expect.stringMatching(/Member names: 1 of 2 matched/));
        });

        it('logs a warning when the source check found a problem', async () => {
            config.pdfReport.localPath = path.join(tmpDir, 'not-there.pdf');
            db.getLatestExtractionRecords.mockResolvedValue({ snapshot: snapshotRow(), records: [] });

            await plugin.extract(config, log);
            expect(log).toHaveBeenCalledWith(expect.stringMatching(/\[pdf-report\] Warning: No report found at .*not-there\.pdf/));
        });

        it('fails clearly when no report has been imported yet', async () => {
            config.pdfReport.source = 'upload';
            db.getLatestExtractionRecords.mockResolvedValue(null);
            await expect(plugin.extract(config, log)).rejects.toThrow(/No skills report has been imported yet/);
        });
    });
});
