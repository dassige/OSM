const express  = require('express');
const multer   = require('multer');
const { v4: uuidv4 } = require('uuid');
const router   = express.Router();
const db       = require('../../services/db');
const storage  = require('../../services/knowledgebase-storage');
const { hasRole } = require('../../middleware/auth');
const config   = require('../../config');
const logger   = require('../../services/logger');

const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'application/msword',                                                               // .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',          // .docx
    'application/vnd.ms-excel',                                                         // .xls
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',                // .xlsx
    'application/rtf',                                                                  // .rtf
    'text/rtf',                                                                         // .rtf (some browsers)
]);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.has(file.mimetype)) return cb(null, true);
        cb(new Error('Unsupported file type. Allowed: PDF, Word (.doc/.docx), Excel (.xls/.xlsx), RTF.'));
    },
});

// ── Public: serve document file by slug (no auth — GUID is the security) ──────

router.get('/file/:slug', async (req, res) => {
    try {
        const doc = await db.getKbDocumentBySlug(req.params.slug);
        if (!doc || !doc.is_active) return res.status(404).json({ error: 'Document not found.' });

        const stream = await storage.getFileStream(doc.storage_type, doc.storage_path);
        res.setHeader('Content-Type', doc.mime_type || 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.original_filename)}"`);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        stream.pipe(res);
    } catch (e) {
        logger.error('[KB] File serve error', { slug: req.params.slug, error: e.message });
        res.status(500).json({ error: 'Could not serve file.' });
    }
});

// ── Public: resolve document id → slug (used by viewer pages to expand {{kb:N}} placeholders) ──

router.get('/resolve/:id', async (req, res) => {
    try {
        const doc = await db.getKbDocumentById(req.params.id);
        if (!doc || !doc.is_active) return res.status(404).json({ error: 'Document not found.' });
        res.json({ id: doc.id, slug: doc.slug, title: doc.title });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Public: get document metadata by slug (used by the viewer page) ───────────

router.get('/doc/:slug', async (req, res) => {
    try {
        const doc = await db.getKbDocumentBySlug(req.params.slug);
        if (!doc || !doc.is_active) return res.status(404).json({ error: 'Document not found.' });
        res.json({
            title:             doc.title,
            description:       doc.description,
            category_name:     doc.category_name,
            original_filename: doc.original_filename,
            file_size:         doc.file_size,
            created_at:        doc.created_at,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Categories ────────────────────────────────────────────────────────────────

router.get('/categories', hasRole('admin'), async (req, res) => {
    try {
        res.json(await db.getKbCategories());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/categories', hasRole('admin'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    try {
        const { name, parent_id, sort_order } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Category name is required.' });
        const id = await db.createKbCategory(name.trim(), parent_id || null, sort_order || 0);
        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        await db.logEvent(actor, 'Knowledge Base', 'Category Created', { categoryId: id, categoryName: name.trim() });
        res.json({ id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.patch('/categories/:id', hasRole('admin'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    try {
        const { name, parent_id, sort_order } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Category name is required.' });
        await db.updateKbCategory(req.params.id, name.trim(), parent_id || null, sort_order || 0);
        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        await db.logEvent(actor, 'Knowledge Base', 'Category Updated', { categoryId: req.params.id, categoryName: name.trim() });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/categories/:id', hasRole('admin'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    try {
        const cat = await db.getKbCategoryById(req.params.id);
        await db.deleteKbCategory(req.params.id);
        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        await db.logEvent(actor, 'Knowledge Base', 'Category Deleted', { categoryId: req.params.id, categoryName: cat?.name });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Documents ─────────────────────────────────────────────────────────────────

router.get('/documents', hasRole('admin'), async (req, res) => {
    try {
        const { category_id } = req.query;
        const docs = category_id !== undefined
            ? await db.getKbDocuments(category_id === 'null' ? null : parseInt(category_id, 10))
            : await db.getKbDocuments();
        res.json(docs);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/documents/:id', hasRole('admin'), async (req, res) => {
    try {
        const doc = await db.getKbDocumentById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Document not found.' });
        res.json(doc);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/documents', hasRole('admin'), upload.single('file'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    try {
        if (!req.file) return res.status(400).json({ error: 'A file is required (PDF, Word, Excel, or RTF).' });
        const { title, description, category_id } = req.body;
        if (!title || !title.trim()) return res.status(400).json({ error: 'Document title is required.' });

        const slug       = uuidv4().toUpperCase(); // public access key — rotatable
        const storageKey = uuidv4().toUpperCase(); // immutable storage filename — never changes
        const { storageType, storagePath, fileSize } = await storage.upload(
            storageKey, req.file.originalname, req.file.buffer, req.file.mimetype,
        );

        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        const id = await db.createKbDocument({
            slug,
            title: title.trim(),
            description: description || null,
            category_id: category_id ? parseInt(category_id, 10) : null,
            original_filename: req.file.originalname,
            file_size: fileSize,
            mime_type: req.file.mimetype,
            storage_type: storageType,
            storage_path: storagePath,
            uploaded_by: actor,
        });

        await db.logEvent(actor, 'Knowledge Base', 'Document Uploaded', {
            documentId: id,
            documentTitle: title.trim(),
            slug,
            originalFilename: req.file.originalname,
            fileSize,
            storageType,
        });
        res.json({ id, slug });
    } catch (e) {
        logger.error('[KB] Upload error', { error: e.message });
        res.status(500).json({ error: e.message });
    }
});

router.patch('/documents/:id', hasRole('admin'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    try {
        const { title, description, category_id } = req.body;
        if (!title || !title.trim()) return res.status(400).json({ error: 'Document title is required.' });
        await db.updateKbDocument(req.params.id, {
            title: title.trim(),
            description: description || null,
            category_id: category_id ? parseInt(category_id, 10) : null,
        });
        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        await db.logEvent(actor, 'Knowledge Base', 'Document Updated', { documentId: req.params.id, documentTitle: title.trim() });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.patch('/documents/:id/toggle', hasRole('admin'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    try {
        const doc = await db.getKbDocumentById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Document not found.' });
        await db.toggleKbDocument(req.params.id);
        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        await db.logEvent(actor, 'Knowledge Base', 'Document Toggled', {
            documentId: req.params.id,
            documentTitle: doc.title,
            newState: doc.is_active ? 'disabled' : 'enabled',
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/documents/:id', hasRole('admin'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    try {
        const doc = await db.getKbDocumentById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Document not found.' });
        await storage.deleteFile(doc.storage_type, doc.storage_path);
        await db.deleteKbDocument(req.params.id);
        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        await db.logEvent(actor, 'Knowledge Base', 'Document Deleted', {
            documentId: req.params.id,
            documentTitle: doc.title,
            slug: doc.slug,
            originalFilename: doc.original_filename,
        });
        res.json({ success: true });
    } catch (e) {
        logger.error('[KB] Delete error', { id: req.params.id, error: e.message });
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
