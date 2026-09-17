const fs   = require('fs');
const os   = require('os');
const path = require('path');

// Mock the cloud SDKs so no real network calls are made. Each mock captures the
// bucket name it was constructed/called with, so tests can assert the storage
// module resolved the configured bucket correctly for every operation.
const mockS3Send = jest.fn().mockResolvedValue({});
jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
    PutObjectCommand: jest.fn().mockImplementation((input) => ({ __cmd: 'Put', input })),
    GetObjectCommand: jest.fn().mockImplementation((input) => ({ __cmd: 'Get', input })),
    DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ __cmd: 'Delete', input })),
    HeadObjectCommand: jest.fn().mockImplementation((input) => ({ __cmd: 'Head', input })),
}), { virtual: true });

const mockGcsFileSave   = jest.fn().mockResolvedValue();
const mockGcsFileExists = jest.fn().mockResolvedValue([true]);
const mockGcsFile       = jest.fn(() => ({ save: mockGcsFileSave, exists: mockGcsFileExists, createReadStream: jest.fn(), delete: jest.fn().mockResolvedValue() }));
const mockGcsBucketFn   = jest.fn((name) => ({ file: mockGcsFile, __bucketName: name }));
jest.mock('@google-cloud/storage', () => ({
    Storage: jest.fn().mockImplementation(() => ({ bucket: mockGcsBucketFn })),
}), { virtual: true });

jest.mock('../config', () => ({
    kbStorage: {
        type: 'local',
        localPath: '',
        s3:  { bucket: 's3-bucket-name/some-prefix', region: 'us-east-1', accessKeyId: 'AKIA', secretAccessKey: 'secret', endpoint: '' },
        gcs: { bucket: 'gcs-bucket-name', keyFilename: '' },
    },
}));

const config = require('../config');
const storage = require('../services/knowledgebase-storage');

describe('knowledgebase-storage', () => {
    let tmpDir;

    beforeEach(() => {
        jest.clearAllMocks();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opready-kb-storage-'));
        config.kbStorage.localPath = tmpDir;
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('replaceFile', () => {
        it('overwrites the file in place for local storage', async () => {
            const filePath = path.join(tmpDir, 'doc.pdf');
            fs.writeFileSync(filePath, 'old content');

            await storage.replaceFile('local', 'doc.pdf', Buffer.from('new content'), 'application/pdf');

            expect(fs.readFileSync(filePath, 'utf8')).toBe('new content');
        });

        it('writes to the configured bucket for s3', async () => {
            await storage.replaceFile('s3', 'knowledgebase/doc.pdf', Buffer.from('bytes'), 'application/pdf');

            expect(mockS3Send).toHaveBeenCalledTimes(1);
            const cmd = mockS3Send.mock.calls[0][0];
            expect(cmd.input.Bucket).toBe('s3-bucket-name');
            expect(cmd.input.Key).toBe('knowledgebase/doc.pdf');
        });

        it('writes to the configured bucket for gcs (regression: bucket name must resolve, not throw ReferenceError)', async () => {
            await storage.replaceFile('gcs', 'knowledgebase/doc.pdf', Buffer.from('bytes'), 'application/pdf');

            expect(mockGcsBucketFn).toHaveBeenCalledWith('gcs-bucket-name');
            expect(mockGcsFile).toHaveBeenCalledWith('knowledgebase/doc.pdf');
            expect(mockGcsFileSave).toHaveBeenCalledWith(Buffer.from('bytes'), { contentType: 'application/pdf' });
        });
    });

    describe('fileExists', () => {
        it('checks the local filesystem', async () => {
            fs.writeFileSync(path.join(tmpDir, 'present.pdf'), 'x');
            expect(await storage.fileExists('local', 'present.pdf')).toBe(true);
            expect(await storage.fileExists('local', 'absent.pdf')).toBe(false);
        });

        it('checks gcs via the configured bucket', async () => {
            expect(await storage.fileExists('gcs', 'knowledgebase/doc.pdf')).toBe(true);
            expect(mockGcsBucketFn).toHaveBeenCalledWith('gcs-bucket-name');
        });
    });
});
