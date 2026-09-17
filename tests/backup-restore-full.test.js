const request  = require('supertest');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');
const archiver = require('archiver');
const { createTestApp } = require('./test-utils');

jest.mock('../services/db', () => ({
    generateSqlDump:        jest.fn(),
    restoreFromSqlDump:     jest.fn().mockResolvedValue(),
    logEvent:               jest.fn().mockResolvedValue(),
    getDbPath:              jest.fn().mockReturnValue('/tmp/test.db'),
    getKbDocuments:         jest.fn(),
    updateKbDocumentStorage: jest.fn().mockResolvedValue(),
}));

// Mocked at the same boundary the restore route actually calls — this proves the
// route pushes bundled bytes into THIS environment's storage via kbStorage.upload(),
// without re-exercising (or double-mocking) the real GCS/S3 SDKs that
// knowledgebase-storage.test.js already covers directly.
jest.mock('../services/knowledgebase-storage', () => ({
    upload: jest.fn(),
}));

jest.mock('../middleware/auth', () => ({
    hasRole: () => (req, res, next) => next()
}));

jest.mock('../middleware/rate-limiter', () => ({
    backupLimiter:       (req, res, next) => next(),
    restoreLimiter:      (req, res, next) => next(),
    restoreChunkLimiter: (req, res, next) => next(),
    aiTestLimiter:       (req, res, next) => next(),
}));

const db        = require('../services/db');
const config    = require('../config');
const kbStorage = require('../services/knowledgebase-storage');
const systemRoutes = require('../routes/api/system');

const app = createTestApp({ path: '/api', router: systemRoutes });

// Builds a ZIP buffer matching the shape produced by GET /api/system/backup?type=full
function buildFullBackupZip({ manifest, sql, kbFiles = [] }) {
    return new Promise((resolve, reject) => {
        const archive = archiver('zip', { zlib: { level: 6 } });
        const chunks  = [];
        archive.on('data', (c) => chunks.push(c));
        archive.on('error', reject);
        archive.on('end', () => resolve(Buffer.concat(chunks)));

        archive.append(JSON.stringify(manifest), { name: 'manifest.json' });
        archive.append(sql, { name: 'database.sql' });
        for (const f of kbFiles) {
            archive.append(f.content, { name: `storage/knowledgebase/${f.name}` });
        }
        archive.finalize();
    });
}

describe('Full ZIP Restore — Knowledge Base storage reconciliation', () => {
    let kbTempDir;

    beforeEach(() => {
        jest.clearAllMocks();
        kbTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opready-kb-restore-'));
        config.kbStorage = { type: 'local', localPath: kbTempDir };
    });

    afterEach(() => {
        fs.rmSync(kbTempDir, { recursive: true, force: true });
    });

    it('restores KB files to local storage and repoints documents backed up from a cloud storage type', async () => {
        // Simulates restoring a PROD backup (KB_STORAGE_TYPE=gcs) onto a local-storage
        // environment: the doc row still says storage_type='gcs' with a GCS-style key,
        // but the actual bytes were bundled into the zip under their basename.
        db.getKbDocuments.mockResolvedValue([
            { id: 1, storage_type: 'gcs', storage_path: 'storage/knowledgebase/AAAA-1111.pdf' },
        ]);

        const zip = await buildFullBackupZip({
            manifest: { appVersion: '1.0.0', date: '2026-09-16T00:00:00Z', storageType: 'gcs', kbFileCount: 1 },
            sql: "DROP TABLE IF EXISTS test; CREATE TABLE test (id INT);",
            kbFiles: [{ name: 'AAAA-1111.pdf', content: 'pdf-bytes' }],
        });

        const response = await request(app)
            .post('/api/system/restore')
            .attach('databaseFile', zip, 'opready-full-backup.zip');

        expect(response.status).toBe(200);

        // File actually landed on local disk
        expect(fs.existsSync(path.join(kbTempDir, 'AAAA-1111.pdf'))).toBe(true);
        expect(fs.readFileSync(path.join(kbTempDir, 'AAAA-1111.pdf'), 'utf8')).toBe('pdf-bytes');

        // DB metadata was repointed to local so the app can actually find the file it just wrote
        expect(db.updateKbDocumentStorage).toHaveBeenCalledWith(1, 'local', 'AAAA-1111.pdf');

        expect(db.logEvent).toHaveBeenCalledWith(
            expect.any(String),
            'System',
            'Full Backup Restored',
            expect.objectContaining({ kbFilesRestored: 1, kbStorageReconciled: 1 }),
        );
        expect(response.body.message).toMatch(/storage metadata updated to match this environment/);
    });

    it('does not touch metadata for documents already pointing at local storage with the matching filename', async () => {
        db.getKbDocuments.mockResolvedValue([
            { id: 2, storage_type: 'local', storage_path: 'BBBB-2222.pdf' },
        ]);

        const zip = await buildFullBackupZip({
            manifest: { appVersion: '1.0.0', date: '2026-09-16T00:00:00Z', storageType: 'local', kbFileCount: 1 },
            sql: "DROP TABLE IF EXISTS test; CREATE TABLE test (id INT);",
            kbFiles: [{ name: 'BBBB-2222.pdf', content: 'pdf-bytes-2' }],
        });

        const response = await request(app)
            .post('/api/system/restore')
            .attach('databaseFile', zip, 'opready-full-backup.zip');

        expect(response.status).toBe(200);
        expect(fs.existsSync(path.join(kbTempDir, 'BBBB-2222.pdf'))).toBe(true);
        expect(db.updateKbDocumentStorage).not.toHaveBeenCalled();
        expect(db.logEvent).toHaveBeenCalledWith(
            expect.any(String),
            'System',
            'Full Backup Restored',
            expect.objectContaining({ kbFilesRestored: 1, kbStorageReconciled: 0 }),
        );
    });

    it('leaves documents alone when no matching file was restored for them', async () => {
        db.getKbDocuments.mockResolvedValue([
            { id: 3, storage_type: 'gcs', storage_path: 'storage/knowledgebase/ORPHAN.pdf' },
        ]);

        const zip = await buildFullBackupZip({
            manifest: { appVersion: '1.0.0', date: '2026-09-16T00:00:00Z', storageType: 'gcs', kbFileCount: 1 },
            sql: "DROP TABLE IF EXISTS test; CREATE TABLE test (id INT);",
            kbFiles: [], // fetch from cloud failed at backup time — no file bundled
        });

        const response = await request(app)
            .post('/api/system/restore')
            .attach('databaseFile', zip, 'opready-full-backup.zip');

        expect(response.status).toBe(200);
        expect(db.updateKbDocumentStorage).not.toHaveBeenCalled();
    });
});

describe('Full ZIP Restore — restoring into cloud storage (s3/gcs)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        config.kbStorage = { type: 'gcs', gcs: { bucket: 'uat-own-bucket', keyFilename: '' } };
    });

    it('uploads bundled files into this environment\'s own storage and repoints documents, regardless of the source bucket', async () => {
        // Simulates restoring a PROD backup (gcs, PROD's bucket) onto a different
        // gcs-backed environment (e.g. UAT) with its own, separate bucket.
        db.getKbDocuments.mockResolvedValue([
            { id: 1, original_filename: 'doc.pdf', mime_type: 'application/pdf', storage_type: 'gcs', storage_path: 'knowledgebase/PROD-KEY.pdf' },
        ]);
        kbStorage.upload.mockResolvedValue({ storageType: 'gcs', storagePath: 'knowledgebase/NEW-UAT-KEY.pdf', fileSize: 9 });

        const zip = await buildFullBackupZip({
            manifest: { appVersion: '1.0.0', date: '2026-09-16T00:00:00Z', storageType: 'gcs', kbFileCount: 1 },
            sql: "DROP TABLE IF EXISTS test; CREATE TABLE test (id INT);",
            kbFiles: [{ name: 'PROD-KEY.pdf', content: 'pdf-bytes' }],
        });

        const response = await request(app)
            .post('/api/system/restore')
            .attach('databaseFile', zip, 'opready-full-backup.zip');

        expect(response.status).toBe(200);

        // Uploaded via this environment's own storage config (kbStorage self-dispatches
        // on config.kbStorage.type — 'gcs' here), not by reusing PROD's stored key
        expect(kbStorage.upload).toHaveBeenCalledTimes(1);
        const [, originalFilename, buffer, mimeType] = kbStorage.upload.mock.calls[0];
        expect(originalFilename).toBe('doc.pdf');
        expect(buffer).toEqual(Buffer.from('pdf-bytes'));
        expect(mimeType).toBe('application/pdf');

        // DB row repointed to whatever this environment's storage.upload() returned
        expect(db.updateKbDocumentStorage).toHaveBeenCalledWith(1, 'gcs', 'knowledgebase/NEW-UAT-KEY.pdf');

        expect(db.logEvent).toHaveBeenCalledWith(
            expect.any(String), 'System', 'Full Backup Restored',
            expect.objectContaining({ kbFilesRestored: 1, kbStorageReconciled: 1 }),
        );
        expect(response.body.message).toMatch(/1 Knowledge Base document restored/);
    });

    it('leaves documents alone when no matching file was bundled for them', async () => {
        db.getKbDocuments.mockResolvedValue([
            { id: 2, original_filename: 'doc.pdf', mime_type: 'application/pdf', storage_type: 'gcs', storage_path: 'knowledgebase/ORPHAN.pdf' },
        ]);

        const zip = await buildFullBackupZip({
            manifest: { appVersion: '1.0.0', date: '2026-09-16T00:00:00Z', storageType: 'gcs', kbFileCount: 1 },
            sql: "DROP TABLE IF EXISTS test; CREATE TABLE test (id INT);",
            kbFiles: [],
        });

        const response = await request(app)
            .post('/api/system/restore')
            .attach('databaseFile', zip, 'opready-full-backup.zip');

        expect(response.status).toBe(200);
        expect(db.updateKbDocumentStorage).not.toHaveBeenCalled();
        expect(kbStorage.upload).not.toHaveBeenCalled();
    });

    it('continues restoring other documents when one upload fails', async () => {
        db.getKbDocuments.mockResolvedValue([
            { id: 1, original_filename: 'a.pdf', mime_type: 'application/pdf', storage_type: 'gcs', storage_path: 'knowledgebase/A.pdf' },
            { id: 2, original_filename: 'b.pdf', mime_type: 'application/pdf', storage_type: 'gcs', storage_path: 'knowledgebase/B.pdf' },
        ]);
        kbStorage.upload
            .mockRejectedValueOnce(new Error('bucket quota exceeded'))
            .mockResolvedValueOnce({ storageType: 'gcs', storagePath: 'knowledgebase/NEW-B.pdf', fileSize: 1 });

        const zip = await buildFullBackupZip({
            manifest: { appVersion: '1.0.0', date: '2026-09-16T00:00:00Z', storageType: 'gcs', kbFileCount: 2 },
            sql: "DROP TABLE IF EXISTS test; CREATE TABLE test (id INT);",
            kbFiles: [{ name: 'A.pdf', content: 'a' }, { name: 'B.pdf', content: 'b' }],
        });

        const response = await request(app)
            .post('/api/system/restore')
            .attach('databaseFile', zip, 'opready-full-backup.zip');

        expect(response.status).toBe(200);
        expect(db.updateKbDocumentStorage).toHaveBeenCalledTimes(1);
        expect(db.updateKbDocumentStorage).toHaveBeenCalledWith(2, 'gcs', 'knowledgebase/NEW-B.pdf');
    });
});
