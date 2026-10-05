// Integration test for services/db/extraction-snapshots.js against a throwaway SQLite file.
// DB_PATH MUST point at a temp file before anything requires the connection —
// never let this suite touch the real fenz.db / demo.db.
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEST_DB = path.join(os.tmpdir(), `opready-snapshots-test-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = TEST_DB;

jest.mock('../config', () => ({ appMode: 'production' }));
jest.mock('../services/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { initDB, closeDB } = require('../services/db/connection');
const snapshots = require('../services/db/extraction-snapshots');
const { generateSqlDump } = require('../services/db/backup');

// Binary-looking content (includes NUL, quote and semicolon bytes) to prove the base64 round trip.
const PDF_A = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from([0, 255, 39, 59, 10, 128])]);
const PDF_B = Buffer.from('%PDF-1.7\nsecond');

const base = (over) => ({
    plugin: 'pdf-report', source: 'local', sourceRef: '111:222', fileName: 'OSM-Status-6-months.pdf',
    fileHash: 'hash-a', fileSize: PDF_A.length, fileData: PDF_A, reportCreatedDate: '2026-10-05',
    recordCount: 2, memberCount: 1, skillCount: 2, warnings: ['one warning'],
    records: [{ name: 'Luke Skywalker', skill: 'A' }, { name: 'Luke Skywalker', skill: 'B' }],
    createdBy: 'System', ...over,
});

let idA;
let idB;

beforeAll(async () => {
    await initDB();
    idA = await snapshots.createExtractionSnapshot(base());
    idB = await snapshots.createExtractionSnapshot(base({
        source: 'upload', sourceRef: null, fileName: 'upload.pdf', fileHash: 'hash-b', fileSize: PDF_B.length,
        fileData: PDF_B, reportCreatedDate: '2026-11-05', warnings: [], records: [{ name: 'Leia Organa', skill: 'C' }],
        recordCount: 1, createdBy: 'Admin',
    }));
});

afterAll(async () => {
    await closeDB();
    for (const suffix of ['', '-wal', '-shm']) {
        try { fs.unlinkSync(TEST_DB + suffix); } catch { /* not created */ }
    }
});

describe('extraction snapshots DB module', () => {
    it('lists summaries newest first without the PDF or records', async () => {
        const list = await snapshots.listExtractionSnapshots();
        expect(list.map((s) => s.id)).toEqual([idB, idA]);
        expect(list[1]).toMatchObject({
            source: 'local', source_ref: '111:222', file_name: 'OSM-Status-6-months.pdf', report_created_date: '2026-10-05',
            record_count: 2, member_count: 1, skill_count: 2, warnings: ['one warning'], created_by: 'System',
        });
        expect(list[0]).not.toHaveProperty('file_data');
        expect(list[0]).not.toHaveProperty('records');
    });

    it('finds the latest snapshot overall and per source', async () => {
        expect((await snapshots.getLatestExtractionSnapshot()).id).toBe(idB);
        expect((await snapshots.getLatestExtractionSnapshotBySource('local')).id).toBe(idA);
        expect(await snapshots.getLatestExtractionSnapshotBySource('gcs')).toBeNull();
    });

    it('returns the latest records with their snapshot', async () => {
        const { snapshot, records } = await snapshots.getLatestExtractionRecords();
        expect(snapshot).toMatchObject({ id: idB, report_created_date: '2026-11-05', warnings: [] });
        expect(records).toEqual([{ name: 'Leia Organa', skill: 'C' }]);
    });

    it('round-trips the original PDF bytes', async () => {
        const file = await snapshots.getExtractionSnapshotFile(idA);
        expect(file.fileName).toBe('OSM-Status-6-months.pdf');
        expect(Buffer.compare(file.buffer, PDF_A)).toBe(0);
        expect(await snapshots.getExtractionSnapshotFile(9999)).toBeNull();
    });

    it('is included in the SQL backup dump as plain text', async () => {
        const dump = await generateSqlDump();
        expect(dump).toContain('INSERT INTO "extraction_snapshots"');
        expect(dump).toContain(PDF_A.toString('base64'));
    });

    it('prunes all but the newest snapshots and deletes by id', async () => {
        const idC = await snapshots.createExtractionSnapshot(base({ fileHash: 'hash-c' }));
        expect(await snapshots.pruneExtractionSnapshots(2)).toBe(1);
        expect((await snapshots.listExtractionSnapshots()).map((s) => s.id)).toEqual([idC, idB]);

        expect(await snapshots.deleteExtractionSnapshot(idC)).toBe(1);
        expect(await snapshots.getExtractionSnapshotById(idC)).toBeNull();
        expect((await snapshots.getLatestExtractionSnapshot()).id).toBe(idB);
    });

    it('returns null when there are no snapshots', async () => {
        const db = await initDB();
        await db.run('DELETE FROM extraction_snapshots');
        expect(await snapshots.getLatestExtractionSnapshot()).toBeNull();
        expect(await snapshots.getLatestExtractionRecords()).toBeNull();
    });
});
