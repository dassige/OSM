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
});
