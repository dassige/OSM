const request = require('supertest');
const path    = require('path');
const { createTestApp } = require('./test-utils');

jest.mock('../services/db', () => ({
    getKbCategories:       jest.fn(),
    createKbCategory:      jest.fn(),
    updateKbCategory:      jest.fn(),
    getKbCategoryById:     jest.fn().mockResolvedValue({ id: 1, name: 'Operational' }),
    deleteKbCategory:      jest.fn(),
    getKbDocuments:        jest.fn(),
    getKbDocumentById:     jest.fn().mockResolvedValue({ id: 1, title: 'Test Doc', slug: 'SLUG-001', is_active: 1, storage_type: 'local', storage_path: 'SLUG-001.pdf', original_filename: 'test.pdf', mime_type: 'application/pdf', file_size: 1024 }),
    getKbDocumentBySlug:   jest.fn(),
    createKbDocument:      jest.fn(),
    updateKbDocument:      jest.fn(),
    updateKbDocumentFile:  jest.fn(),
    toggleKbDocument:      jest.fn(),
    deleteKbDocument:      jest.fn(),
    rotateKbDocumentSlug:  jest.fn(),
    rotateAllKbSlugs:      jest.fn(),
    logEvent:              jest.fn().mockResolvedValue(),
}));

jest.mock('../services/knowledgebase-storage', () => ({
    upload:      jest.fn().mockResolvedValue({ storageType: 'local', storagePath: 'test-slug.pdf', fileSize: 1024 }),
    getFileStream: jest.fn(),
    deleteFile:  jest.fn().mockResolvedValue(),
    replaceFile: jest.fn().mockResolvedValue(),
    fileExists:  jest.fn().mockResolvedValue(true),
}));

jest.mock('../middleware/auth', () => ({
    hasRole: () => (req, res, next) => next(),
    ROLES:   { guest: 0, simple: 1, admin: 2, superadmin: 3 },
}));

jest.mock('../config', () => ({
    appMode: 'production',
    rateLimits: {
        login:         { windowMin: 15, max: 10  },
        mfa:           { windowMin: 5,  max: 5   },
        forgotPassword:{ windowMin: 30, max: 3   },
        api:           { windowMin: 1,  max: 300 },
        publicSubmit:  { windowMin: 5,  max: 30  },
    },
    kbStorage: { type: 'local', localPath: '/tmp/kb-test' },
    timezone: 'Pacific/Auckland',
}));

const db      = require('../services/db');
const storage = require('../services/knowledgebase-storage');
const kbRoutes = require('../routes/api/knowledgebase');
const app = createTestApp({ path: '/api/knowledgebase', router: kbRoutes });

beforeEach(() => jest.clearAllMocks());

// ── Categories ────────────────────────────────────────────────────────────────

describe('GET /api/knowledgebase/categories', () => {
    it('returns 200 and an array', async () => {
        db.getKbCategories.mockResolvedValue([{ id: 1, name: 'Operational', parent_id: null }]);
        const res = await request(app).get('/api/knowledgebase/categories');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns 500 on DB error', async () => {
        db.getKbCategories.mockRejectedValue(new Error('DB fail'));
        const res = await request(app).get('/api/knowledgebase/categories');
        expect(res.status).toBe(500);
    });
});

describe('POST /api/knowledgebase/categories', () => {
    it('creates a category and logs event', async () => {
        db.createKbCategory.mockResolvedValue(42);
        const res = await request(app)
            .post('/api/knowledgebase/categories')
            .send({ name: 'Training', parent_id: null });
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(42);
        expect(db.logEvent).toHaveBeenCalledWith(expect.any(String), 'Knowledge Base', 'Category Created', expect.objectContaining({ categoryId: 42 }));
    });

    it('returns 400 when name is missing', async () => {
        const res = await request(app).post('/api/knowledgebase/categories').send({});
        expect(res.status).toBe(400);
    });
});

describe('PATCH /api/knowledgebase/categories/:id', () => {
    it('updates a category', async () => {
        db.updateKbCategory.mockResolvedValue();
        const res = await request(app)
            .patch('/api/knowledgebase/categories/1')
            .send({ name: 'Updated Name' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(db.logEvent).toHaveBeenCalledWith(expect.any(String), 'Knowledge Base', 'Category Updated', expect.any(Object));
    });

    it('returns 400 when name is blank', async () => {
        const res = await request(app).patch('/api/knowledgebase/categories/1').send({ name: '   ' });
        expect(res.status).toBe(400);
    });
});

describe('DELETE /api/knowledgebase/categories/:id', () => {
    it('deletes a category and logs event', async () => {
        db.deleteKbCategory.mockResolvedValue();
        const res = await request(app).delete('/api/knowledgebase/categories/1');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(db.logEvent).toHaveBeenCalledWith(expect.any(String), 'Knowledge Base', 'Category Deleted', expect.objectContaining({ categoryName: 'Operational' }));
    });

    it('returns 500 on DB error', async () => {
        db.getKbCategoryById.mockRejectedValue(new Error('DB fail'));
        const res = await request(app).delete('/api/knowledgebase/categories/1');
        expect(res.status).toBe(500);
    });
});

// ── Documents ─────────────────────────────────────────────────────────────────

describe('GET /api/knowledgebase/documents', () => {
    it('returns all documents when no category filter', async () => {
        db.getKbDocuments.mockResolvedValue([{ id: 1, title: 'Test' }]);
        const res = await request(app).get('/api/knowledgebase/documents');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(db.getKbDocuments).toHaveBeenCalledWith(); // no argument
    });

    it('filters by category_id when provided', async () => {
        db.getKbDocuments.mockResolvedValue([]);
        await request(app).get('/api/knowledgebase/documents?category_id=3');
        expect(db.getKbDocuments).toHaveBeenCalledWith(3);
    });
});

describe('GET /api/knowledgebase/documents/:id', () => {
    it('returns 200 for existing doc', async () => {
        const res = await request(app).get('/api/knowledgebase/documents/1');
        expect(res.status).toBe(200);
        expect(res.body.title).toBe('Test Doc');
    });

    it('returns 404 when doc not found', async () => {
        db.getKbDocumentById.mockResolvedValue(null);
        const res = await request(app).get('/api/knowledgebase/documents/999');
        expect(res.status).toBe(404);
    });
});

describe('GET/HEAD /api/knowledgebase/file/:slug', () => {
    const { Readable } = require('stream');
    const fileBuffer = Buffer.alloc(1024, 'a');
    const sampleDoc = { id: 1, title: 'Test Doc', slug: 'SLUG-001', is_active: 1, storage_type: 'local', storage_path: 'SLUG-001.pdf', original_filename: 'test.pdf', mime_type: 'application/pdf', file_size: fileBuffer.length };

    beforeEach(() => {
        storage.fileExists.mockResolvedValue(true);
    });

    it('GET streams the file with frame-ancestors self and Content-Length', async () => {
        db.getKbDocumentBySlug.mockResolvedValue(sampleDoc);
        storage.getFileStream.mockResolvedValue(Readable.from([fileBuffer]));

        const res = await request(app).get('/api/knowledgebase/file/SLUG-001');

        expect(res.status).toBe(200);
        expect(res.headers['content-security-policy']).toBe("frame-ancestors 'self'");
        expect(res.headers['content-length']).toBe('1024');
        expect(res.headers['content-disposition']).toContain('inline');
    });

    it('GET returns 404 when document is not found', async () => {
        db.getKbDocumentBySlug.mockResolvedValue(null);
        const res = await request(app).get('/api/knowledgebase/file/UNKNOWN');
        expect(res.status).toBe(404);
    });

    it('GET returns 404 when the file is missing from storage', async () => {
        db.getKbDocumentBySlug.mockResolvedValue(sampleDoc);
        storage.fileExists.mockResolvedValue(false);
        const res = await request(app).get('/api/knowledgebase/file/SLUG-001');
        expect(res.status).toBe(404);
    });

    it('GET returns 404 when the document has expired', async () => {
        db.getKbDocumentBySlug.mockResolvedValue({ ...sampleDoc, expires_at: '2000-01-01' });
        const res = await request(app).get('/api/knowledgebase/file/SLUG-001');
        expect(res.status).toBe(404);
        expect(storage.getFileStream).not.toHaveBeenCalled();
    });

    it('GET serves the file when expires_at is in the future', async () => {
        db.getKbDocumentBySlug.mockResolvedValue({ ...sampleDoc, expires_at: '2999-01-01' });
        storage.getFileStream.mockResolvedValue(Readable.from([fileBuffer]));
        const res = await request(app).get('/api/knowledgebase/file/SLUG-001');
        expect(res.status).toBe(200);
    });

    it('HEAD returns headers with Content-Length and an empty body without opening the file stream', async () => {
        db.getKbDocumentBySlug.mockResolvedValue(sampleDoc);

        const res = await request(app).head('/api/knowledgebase/file/SLUG-001');

        expect(res.status).toBe(200);
        expect(res.headers['content-length']).toBe('1024');
        expect(res.headers['content-security-policy']).toBe("frame-ancestors 'self'");
        expect(storage.getFileStream).not.toHaveBeenCalled();
    });
});

describe('GET /api/knowledgebase/documents/:id/file-status', () => {
    const sampleDoc = { id: 1, title: 'Test Doc', slug: 'SLUG-001', is_active: 1, storage_type: 'local', storage_path: 'SLUG-001.pdf', original_filename: 'test.pdf', mime_type: 'application/pdf', file_size: 1024 };

    it('returns exists:true when file is present', async () => {
        db.getKbDocumentById.mockResolvedValue(sampleDoc);
        storage.fileExists.mockResolvedValue(true);
        const res = await request(app).get('/api/knowledgebase/documents/1/file-status');
        expect(res.status).toBe(200);
        expect(res.body.exists).toBe(true);
        expect(storage.fileExists).toHaveBeenCalledWith('local', 'SLUG-001.pdf');
    });

    it('returns exists:false when file is missing', async () => {
        db.getKbDocumentById.mockResolvedValue(sampleDoc);
        storage.fileExists.mockResolvedValue(false);
        const res = await request(app).get('/api/knowledgebase/documents/1/file-status');
        expect(res.status).toBe(200);
        expect(res.body.exists).toBe(false);
    });

    it('returns 404 when doc not found', async () => {
        db.getKbDocumentById.mockResolvedValue(null);
        const res = await request(app).get('/api/knowledgebase/documents/999/file-status');
        expect(res.status).toBe(404);
    });
});

describe('GET /api/knowledgebase/documents/missing-files', () => {
    const docs = [
        { id: 1, title: 'Doc A', original_filename: 'a.pdf', storage_type: 'local', storage_path: 'a.pdf', category_name: 'Ops', is_active: 1, created_at: '2026-01-01' },
        { id: 2, title: 'Doc B', original_filename: 'b.pdf', storage_type: 'local', storage_path: 'b.pdf', category_name: null,  is_active: 0, created_at: '2026-01-02' },
    ];

    it('returns total and empty missing array when all files exist', async () => {
        db.getKbDocuments.mockResolvedValue(docs);
        storage.fileExists.mockResolvedValue(true);
        const res = await request(app).get('/api/knowledgebase/documents/missing-files');
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(2);
        expect(res.body.missing).toEqual([]);
    });

    it('returns documents whose file is missing', async () => {
        db.getKbDocuments.mockResolvedValue(docs);
        storage.fileExists
            .mockResolvedValueOnce(true)   // Doc A exists
            .mockResolvedValueOnce(false);  // Doc B missing
        const res = await request(app).get('/api/knowledgebase/documents/missing-files');
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(2);
        expect(res.body.missing).toHaveLength(1);
        expect(res.body.missing[0].id).toBe(2);
        expect(res.body.missing[0].title).toBe('Doc B');
        expect(res.body.missing[0].storage_type).toBe('local');
    });

    it('returns all documents when no files exist', async () => {
        db.getKbDocuments.mockResolvedValue(docs);
        storage.fileExists.mockResolvedValue(false);
        const res = await request(app).get('/api/knowledgebase/documents/missing-files');
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(2);
        expect(res.body.missing).toHaveLength(2);
    });

    it('returns 200 with empty results when no documents exist', async () => {
        db.getKbDocuments.mockResolvedValue([]);
        const res = await request(app).get('/api/knowledgebase/documents/missing-files');
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(0);
        expect(res.body.missing).toEqual([]);
    });

    it('returns 500 on DB error', async () => {
        db.getKbDocuments.mockRejectedValue(new Error('DB fail'));
        const res = await request(app).get('/api/knowledgebase/documents/missing-files');
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('DB fail');
    });
});

describe('POST /api/knowledgebase/documents (upload)', () => {
    it('returns 400 when title is missing', async () => {
        const res = await request(app)
            .post('/api/knowledgebase/documents')
            .attach('file', Buffer.from('%PDF-1.4'), { filename: 'test.pdf', contentType: 'application/pdf' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/title/i);
    });

    it('returns 400 when no file is attached', async () => {
        const res = await request(app)
            .post('/api/knowledgebase/documents')
            .field('title', 'My Doc');
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/file is required/i);
    });

    it('uploads and creates document, logs event', async () => {
        db.createKbDocument.mockResolvedValue(7);
        const res = await request(app)
            .post('/api/knowledgebase/documents')
            .attach('file', Buffer.from('%PDF-1.4'), { filename: 'test.pdf', contentType: 'application/pdf' })
            .field('title', 'Fire Attack Procedures');
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(7);
        expect(res.body.slug).toBeDefined();
        expect(storage.upload).toHaveBeenCalled();
        expect(db.createKbDocument).toHaveBeenCalled();
        expect(db.logEvent).toHaveBeenCalledWith(expect.any(String), 'Knowledge Base', 'Document Uploaded', expect.any(Object));
    });

    it('returns 400 when file content does not match declared type — PNG as PDF (M-08)', async () => {
        // PNG magic bytes with a .pdf name/mimetype — a real image can no longer masquerade
        // as a document just by renaming it, even though images are now an allowed KB type.
        const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const res = await request(app)
            .post('/api/knowledgebase/documents')
            .attach('file', pngHeader, { filename: 'disguised.pdf', contentType: 'application/pdf' })
            .field('title', 'Disguised File');
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/content does not match/i);
        expect(storage.upload).not.toHaveBeenCalled();
    });

    it('returns 400 when file content is unrecognised — plain text as PDF (M-08)', async () => {
        const textBuf = Buffer.from('this is not a pdf at all');
        const res = await request(app)
            .post('/api/knowledgebase/documents')
            .attach('file', textBuf, { filename: 'fake.pdf', contentType: 'application/pdf' })
            .field('title', 'Fake File');
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/content does not match/i);
        expect(storage.upload).not.toHaveBeenCalled();
    });

    it('uploads a TXT file', async () => {
        db.createKbDocument.mockResolvedValue(8);
        const res = await request(app)
            .post('/api/knowledgebase/documents')
            .attach('file', Buffer.from('Plain text SOP notes.'), { filename: 'notes.txt', contentType: 'text/plain' })
            .field('title', 'Notes');
        expect(res.status).toBe(200);
        expect(storage.upload).toHaveBeenCalledWith(expect.any(String), 'notes.txt', expect.any(Buffer), 'text/plain');
    });

    it('uploads a Markdown file even when the browser sends no mimetype', async () => {
        db.createKbDocument.mockResolvedValue(9);
        const res = await request(app)
            .post('/api/knowledgebase/documents')
            .attach('file', Buffer.from('# SOP\n\nBody text.'), { filename: 'sop.md', contentType: '' })
            .field('title', 'SOP Markdown');
        expect(res.status).toBe(200);
        // Extension-based fallback resolves the mime type since the browser sent none.
        expect(storage.upload).toHaveBeenCalledWith(expect.any(String), 'sop.md', expect.any(Buffer), 'text/markdown');
    });

    it('rejects a TXT file containing binary content', async () => {
        const binaryBuf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00, 0x00]);
        const res = await request(app)
            .post('/api/knowledgebase/documents')
            .attach('file', binaryBuf, { filename: 'notes.txt', contentType: 'text/plain' })
            .field('title', 'Bad Notes');
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/plain text/i);
        expect(storage.upload).not.toHaveBeenCalled();
    });

    it.each([
        ['png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]), 'image/png'],
        ['jpg', Buffer.from('ffd8ffe000104a46494600010100000100010000ffdb', 'hex'), 'image/jpeg'],
        ['bmp', Buffer.from('424d3600000000000000', 'hex'), 'image/bmp'],
    ])('uploads a %s image', async (ext, bytes, expectedMime) => {
        db.createKbDocument.mockResolvedValue(10);
        const res = await request(app)
            .post('/api/knowledgebase/documents')
            .attach('file', bytes, { filename: `photo.${ext}`, contentType: expectedMime })
            .field('title', 'Photo');
        expect(res.status).toBe(200);
        expect(storage.upload).toHaveBeenCalledWith(expect.any(String), `photo.${ext}`, expect.any(Buffer), expectedMime);
    });

    it('rejects a file with an image extension whose bytes are actually a PDF', async () => {
        const res = await request(app)
            .post('/api/knowledgebase/documents')
            .attach('file', Buffer.from('%PDF-1.4'), { filename: 'disguised.png', contentType: 'image/png' })
            .field('title', 'Disguised as Image');
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/declared image type/i);
        expect(storage.upload).not.toHaveBeenCalled();
    });
});

describe('PATCH /api/knowledgebase/documents/:id', () => {
    it('updates document metadata', async () => {
        db.updateKbDocument.mockResolvedValue();
        const res = await request(app)
            .patch('/api/knowledgebase/documents/1')
            .send({ title: 'New Title', description: 'Desc', category_id: 2 });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(db.logEvent).toHaveBeenCalledWith(expect.any(String), 'Knowledge Base', 'Document Updated', expect.any(Object));
    });

    it('returns 400 when title is blank', async () => {
        const res = await request(app).patch('/api/knowledgebase/documents/1').send({ title: '' });
        expect(res.status).toBe(400);
    });
});

describe('PATCH /api/knowledgebase/documents/:id/toggle', () => {
    it('toggles document and logs event', async () => {
        db.getKbDocumentById.mockResolvedValue({ id: 1, title: 'Test Doc', slug: 'SLUG-001', is_active: 1, storage_type: 'local', storage_path: 'SLUG-001.pdf', original_filename: 'test.pdf', mime_type: 'application/pdf', file_size: 1024 });
        db.toggleKbDocument.mockResolvedValue();
        const res = await request(app).patch('/api/knowledgebase/documents/1/toggle');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(db.logEvent).toHaveBeenCalledWith(expect.any(String), 'Knowledge Base', 'Document Toggled', expect.objectContaining({ newState: 'disabled' }));
    });

    it('returns 404 when doc not found', async () => {
        db.getKbDocumentById.mockResolvedValue(null);
        const res = await request(app).patch('/api/knowledgebase/documents/999/toggle');
        expect(res.status).toBe(404);
    });
});

describe('DELETE /api/knowledgebase/documents/:id', () => {
    it('deletes document and its file, logs event', async () => {
        db.getKbDocumentById.mockResolvedValue({ id: 1, title: 'Test Doc', slug: 'SLUG-001', is_active: 1, storage_type: 'local', storage_path: 'SLUG-001.pdf', original_filename: 'test.pdf', mime_type: 'application/pdf', file_size: 1024 });
        db.deleteKbDocument.mockResolvedValue();
        const res = await request(app).delete('/api/knowledgebase/documents/1');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(storage.deleteFile).toHaveBeenCalledWith('local', 'SLUG-001.pdf');
        expect(db.deleteKbDocument).toHaveBeenCalledWith('1');
        expect(db.logEvent).toHaveBeenCalledWith(expect.any(String), 'Knowledge Base', 'Document Deleted', expect.any(Object));
    });

    it('returns 404 when doc not found', async () => {
        db.getKbDocumentById.mockResolvedValue(null);
        const res = await request(app).delete('/api/knowledgebase/documents/999');
        expect(res.status).toBe(404);
    });
});

// ── Replace file ──────────────────────────────────────────────────────────────

describe('POST /api/knowledgebase/documents/:id/replace-file', () => {
    it('replaces the file and updates metadata', async () => {
        db.getKbDocumentById.mockResolvedValue({ id: 1, title: 'Test Doc', slug: 'SLUG-001', is_active: 1, storage_type: 'local', storage_path: 'SLUG-001.pdf', original_filename: 'test.pdf', mime_type: 'application/pdf', file_size: 1024 });
        db.updateKbDocumentFile.mockResolvedValue();
        const res = await request(app)
            .post('/api/knowledgebase/documents/1/replace-file')
            .attach('file', Buffer.from('%PDF-1.4'), { filename: 'new.pdf', contentType: 'application/pdf' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(storage.replaceFile).toHaveBeenCalledWith('local', 'SLUG-001.pdf', expect.any(Buffer), 'application/pdf');
        expect(db.updateKbDocumentFile).toHaveBeenCalled();
        expect(db.logEvent).toHaveBeenCalledWith(expect.any(String), 'Knowledge Base', 'Document File Replaced', expect.any(Object));
    });

    it('returns 400 when no file attached', async () => {
        const res = await request(app).post('/api/knowledgebase/documents/1/replace-file');
        expect(res.status).toBe(400);
    });

    it('returns 404 when document not found', async () => {
        db.getKbDocumentById.mockResolvedValue(null);
        const res = await request(app)
            .post('/api/knowledgebase/documents/999/replace-file')
            .attach('file', Buffer.from('%PDF-1.4'), { filename: 'new.pdf', contentType: 'application/pdf' });
        expect(res.status).toBe(404);
    });

    it('returns 400 when replacement file content does not match declared type — PNG as PDF (M-08)', async () => {
        db.getKbDocumentById.mockResolvedValue({ id: 1, title: 'Test Doc', slug: 'SLUG-001', is_active: 1, storage_type: 'local', storage_path: 'SLUG-001.pdf', original_filename: 'test.pdf', mime_type: 'application/pdf', file_size: 1024 });
        const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const res = await request(app)
            .post('/api/knowledgebase/documents/1/replace-file')
            .attach('file', pngHeader, { filename: 'disguised.pdf', contentType: 'application/pdf' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/content does not match/i);
        expect(storage.replaceFile).not.toHaveBeenCalled();
    });
});

// ── Single slug rotation ───────────────────────────────────────────────────────

describe('PATCH /api/knowledgebase/documents/:id/rotate-slug', () => {
    it('rotates the slug and returns new slug', async () => {
        db.getKbDocumentById.mockResolvedValue({ id: 1, title: 'Test Doc', slug: 'OLD-SLUG', is_active: 1, storage_type: 'local', storage_path: 'key.pdf', original_filename: 'test.pdf', mime_type: 'application/pdf', file_size: 100 });
        db.rotateKbDocumentSlug.mockResolvedValue('NEW-SLUG-UUID');
        const res = await request(app).patch('/api/knowledgebase/documents/1/rotate-slug');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.slug).toBe('NEW-SLUG-UUID');
        expect(db.logEvent).toHaveBeenCalledWith(expect.any(String), 'Knowledge Base', 'Document Slug Rotated', expect.objectContaining({ oldSlug: 'OLD-SLUG', newSlug: 'NEW-SLUG-UUID' }));
    });

    it('returns 404 when document not found', async () => {
        db.getKbDocumentById.mockResolvedValue(null);
        const res = await request(app).patch('/api/knowledgebase/documents/999/rotate-slug');
        expect(res.status).toBe(404);
    });
});

// ── Slug rotation ─────────────────────────────────────────────────────────────

describe('POST /api/knowledgebase/rotate-slugs', () => {
    it('rotates all slugs and returns count', async () => {
        db.rotateAllKbSlugs.mockResolvedValue(7);
        const res = await request(app).post('/api/knowledgebase/rotate-slugs');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.rotated).toBe(7);
        expect(db.rotateAllKbSlugs).toHaveBeenCalledTimes(1);
        expect(db.logEvent).toHaveBeenCalledWith(
            expect.any(String), 'Knowledge Base', 'All Document Slugs Rotated',
            expect.objectContaining({ documentCount: 7 }),
        );
    });

    it('returns 403 in demo mode', async () => {
        jest.resetModules();
        jest.doMock('../config', () => ({
            appMode: 'demo',
            rateLimits: { login:{windowMin:15,max:10}, mfa:{windowMin:5,max:5}, forgotPassword:{windowMin:30,max:3}, api:{windowMin:1,max:300}, publicSubmit:{windowMin:5,max:30} },
            kbStorage: { type: 'local', localPath: '/tmp/kb-test' },
        }));
        const demoRoutes = require('../routes/api/knowledgebase');
        const demoApp    = require('./test-utils').createTestApp({ path: '/api/knowledgebase', router: demoRoutes });
        const res = await request(demoApp).post('/api/knowledgebase/rotate-slugs');
        expect(res.status).toBe(403);
        jest.resetModules();
    });

    it('returns 500 on DB error', async () => {
        db.rotateAllKbSlugs.mockRejectedValue(new Error('DB fail'));
        const res = await request(app).post('/api/knowledgebase/rotate-slugs');
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('DB fail');
    });
});

// ── Public endpoints ──────────────────────────────────────────────────────────

describe('GET /api/knowledgebase/resolve/:id (public)', () => {
    it('returns id, slug, title for active document', async () => {
        db.getKbDocumentById.mockResolvedValue({
            id: 5, slug: 'SOME-GUID', title: 'Fire SOP', is_active: 1,
            storage_type: 'local', storage_path: 'key.pdf', original_filename: 'fire.pdf', mime_type: 'application/pdf', file_size: 100,
        });
        const res = await request(app).get('/api/knowledgebase/resolve/5');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ id: 5, slug: 'SOME-GUID', title: 'Fire SOP' });
    });

    it('returns 404 for inactive document', async () => {
        db.getKbDocumentById.mockResolvedValue({ id: 5, is_active: 0 });
        const res = await request(app).get('/api/knowledgebase/resolve/5');
        expect(res.status).toBe(404);
    });

    it('returns 404 when not found', async () => {
        db.getKbDocumentById.mockResolvedValue(null);
        const res = await request(app).get('/api/knowledgebase/resolve/999');
        expect(res.status).toBe(404);
    });

    it('returns 404 for an expired document', async () => {
        db.getKbDocumentById.mockResolvedValue({
            id: 5, slug: 'SOME-GUID', title: 'Fire SOP', is_active: 1, expires_at: '2000-01-01',
        });
        const res = await request(app).get('/api/knowledgebase/resolve/5');
        expect(res.status).toBe(404);
    });
});

describe('GET /api/knowledgebase/doc/:slug (public)', () => {
    it('returns metadata for active document', async () => {
        db.getKbDocumentBySlug.mockResolvedValue({
            title: 'Public Doc', description: 'Desc', category_name: 'Training',
            original_filename: 'test.pdf', file_size: 1024, created_at: '2026-01-01',
            is_active: 1,
        });
        const res = await request(app).get('/api/knowledgebase/doc/SOME-GUID');
        expect(res.status).toBe(200);
        expect(res.body.title).toBe('Public Doc');
    });

    it('returns 404 for inactive document', async () => {
        db.getKbDocumentBySlug.mockResolvedValue({ title: 'Hidden', is_active: 0 });
        const res = await request(app).get('/api/knowledgebase/doc/SOME-GUID');
        expect(res.status).toBe(404);
    });

    it('returns 404 when not found', async () => {
        db.getKbDocumentBySlug.mockResolvedValue(null);
        const res = await request(app).get('/api/knowledgebase/doc/NONEXISTENT');
        expect(res.status).toBe(404);
    });

    it('returns 404 for an expired document', async () => {
        db.getKbDocumentBySlug.mockResolvedValue({
            title: 'Expired Doc', is_active: 1, expires_at: '2000-01-01',
        });
        const res = await request(app).get('/api/knowledgebase/doc/SOME-GUID');
        expect(res.status).toBe(404);
    });

    it('returns metadata when expires_at is in the future', async () => {
        db.getKbDocumentBySlug.mockResolvedValue({
            title: 'Public Doc', is_active: 1, expires_at: '2999-01-01',
        });
        const res = await request(app).get('/api/knowledgebase/doc/SOME-GUID');
        expect(res.status).toBe(200);
    });
});
