const express  = require('express');
const multer   = require('multer');
const fs       = require('fs');
const path     = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto   = require('crypto');
const fileType = require('file-type');
const router   = express.Router();
const db       = require('../../services/db');
const storage  = require('../../services/knowledgebase-storage');
const { hasRole } = require('../../middleware/auth');
const config   = require('../../config');
const logger   = require('../../services/logger');

// Minimum free disk space required before accepting a local-storage upload (100 MB)
const MIN_FREE_BYTES = 100 * 1024 * 1024;

function assertLocalDiskSpace() {
    if (config.kbStorage?.type !== 'local') return; // Cloud storage manages its own capacity
    try {
        const kbPath = config.kbStorage.localPath || __dirname;
        const checkPath = fs.existsSync(kbPath) ? kbPath : path.dirname(kbPath);
        const stats = fs.statfsSync(checkPath);
        const freeBytes = stats.bfree * stats.bsize;
        if (freeBytes < MIN_FREE_BYTES) {
            const err = new Error('Insufficient disk space on server. Please contact your administrator.');
            err.status = 507;
            throw err;
        }
    } catch (e) {
        if (e.status === 507) throw e;
        // statfsSync failure is non-fatal — log and continue
        logger.warn('[KB] Could not check disk space', { error: e.message });
    }
}

// M-08: Magic bytes detected by file-type that are acceptable for document uploads.
// OOXML files (.docx/.xlsx) are ZIP archives at the byte level — file-type returns
// 'application/zip' when it cannot distinguish the specific OOXML sub-type.
// RTF and plain-text formats (TXT/MD) have no binary magic bytes — handled separately.
// Kept as two separate sets (rather than one combined set) so an image can't pass off
// as a document, or vice versa, purely by renaming the extension — see IMAGE_EXTENSIONS below.
const DOCUMENT_MAGIC_MIMES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip', // generic detection for OOXML when sub-type not identified
]);
const IMAGE_MAGIC_MIMES = new Set(['image/png', 'image/jpeg', 'image/bmp']);

// Extensions with no reliable binary signature, verified as plain text instead.
const PLAIN_TEXT_EXTENSIONS = new Set(['.txt', '.md']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.bmp']);

function assertMagicBytes(file) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isRtf = file.mimetype === 'application/rtf' || file.mimetype === 'text/rtf';
    if (isRtf) {
        // RTF has no binary magic bytes — verify the text signature instead.
        const sig = file.buffer.slice(0, 6).toString('ascii');
        if (!sig.startsWith('{\\rtf')) {
            throw new Error('File content does not match the declared RTF type.');
        }
        return;
    }
    if (PLAIN_TEXT_EXTENSIONS.has(ext)) {
        // TXT/MD have no magic bytes either — reject anything that isn't valid text
        // (a null byte anywhere in the sample means it's binary content smuggled in
        // under a .txt/.md extension).
        if (file.buffer.slice(0, 1024).includes(0)) {
            throw new Error('File does not appear to be plain text.');
        }
        return;
    }
    const detected = fileType(file.buffer);
    if (IMAGE_EXTENSIONS.has(ext)) {
        if (!detected || !IMAGE_MAGIC_MIMES.has(detected.mime)) {
            throw new Error('File content does not match the declared image type. Upload rejected.');
        }
        return;
    }
    if (!detected || !DOCUMENT_MAGIC_MIMES.has(detected.mime)) {
        throw new Error('File content does not match the declared type. Upload rejected.');
    }
}

const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'application/msword',                                                               // .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',          // .docx
    'application/vnd.ms-excel',                                                         // .xls
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',                // .xlsx
    'application/rtf',                                                                  // .rtf
    'text/rtf',                                                                         // .rtf (some browsers)
    'text/plain',                                                                        // .txt
    'text/markdown',                                                                     // .md (not all browsers set this)
    'image/png',                                                                         // .png
    'image/jpeg',                                                                        // .jpg / .jpeg
    'image/bmp',                                                                         // .bmp
    'image/x-ms-bmp',                                                                    // .bmp (some browsers/OSes)
]);

// Browsers don't reliably set a MIME type for .md (and sometimes .txt/.bmp) in the
// upload's Content-Type — fall back to the file extension for these known-safe types.
const EXTENSION_MIME_FALLBACK = {
    '.txt':  'text/plain',
    '.md':   'text/markdown',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.bmp':  'image/bmp',
};

// Resolves the mime type to store/serve for an uploaded file, trusting the browser's
// declared Content-Type when it's already an allowed type, otherwise falling back to
// the extension map above (multer's fileFilter already guarantees one of the two matches).
function resolveUploadMimeType(file) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) return file.mimetype;
    const ext = path.extname(file.originalname || '').toLowerCase();
    return EXTENSION_MIME_FALLBACK[ext] || file.mimetype;
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (ALLOWED_MIME_TYPES.has(file.mimetype) || EXTENSION_MIME_FALLBACK[ext]) return cb(null, true);
        cb(new Error('Unsupported file type. Allowed: PDF, Word (.doc/.docx), Excel (.xls/.xlsx), RTF, TXT, Markdown, PNG, JPG, BMP.'));
    },
});

// An expired document is treated identically to an inactive/missing one on every public
// (no-auth) endpoint — it must not be viewable, downloadable, or resolvable via its old
// link. Admins can still see and manage it (e.g. renew the expiry date) via the authed UI.
function isKbDocExpired(doc) {
    if (!doc.expires_at) return false;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: config.timezone });
    return String(doc.expires_at).slice(0, 10) < today;
}

// ── Public: serve document file by slug (no auth — GUID is the security) ──────

router.get('/file/:slug', async (req, res) => {
    try {
        const doc = await db.getKbDocumentBySlug(req.params.slug);
        if (!doc || !doc.is_active || isKbDocExpired(doc)) return res.status(404).json({ error: 'Document not found.' });

        const exists = await storage.fileExists(doc.storage_type, doc.storage_path);
        if (!exists) {
            logger.warn('[KB] File missing from storage', { slug: req.params.slug, storagePath: doc.storage_path });
            return res.status(404).json({ error: 'Document not found.' });
        }

        res.setHeader('Content-Type', doc.mime_type || 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.original_filename)}"`);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        // Override the global frame-ancestors 'none' (server.js) — this route is the
        // one place the app legitimately embeds its own response in an <iframe>
        // (the PDF inline viewer on the public knowledgebase-view page).
        res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
        if (doc.file_size) res.setHeader('Content-Length', doc.file_size);

        // The viewer page HEAD-checks this route before rendering the iframe. Without an
        // explicit Content-Length, a HEAD response carries no body-framing header at all
        // (Node omits Transfer-Encoding for HEAD), which some HTTP/1.1 keep-alive clients
        // and proxies cannot reliably terminate — end here instead of opening the file.
        if (req.method === 'HEAD') return res.end();

        const stream = await storage.getFileStream(doc.storage_type, doc.storage_path);
        stream.pipe(res);
    } catch (e) {
        logger.error('[KB] File serve error', { slug: req.params.slug, error: e.message });
        res.status(500).json({ error: 'Could not serve file.' });
    }
});

// ── Public: resolve a document's resolver_token → slug (used by viewer pages to expand
//    {{kb:<token>}} placeholders). N-PUB-2 / N-AUTH-1: this used to accept the document's
//    sequential auto-increment id, letting an unauthenticated caller enumerate every active
//    KB document's slug/title. resolver_token is a random 128-bit value — same "GUID is the
//    security" guarantee as the slug itself, but stable across a slug rotation. ──

router.get('/resolve/:token', async (req, res) => {
    try {
        const doc = await db.getKbDocumentByResolverToken(req.params.token);
        if (!doc || !doc.is_active || isKbDocExpired(doc)) return res.status(404).json({ error: 'Document not found.' });
        res.json({ slug: doc.slug, title: doc.title });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Public: get document metadata by slug (used by the viewer page) ───────────

router.get('/doc/:slug', async (req, res) => {
    try {
        const doc = await db.getKbDocumentBySlug(req.params.slug);
        if (!doc || !doc.is_active || isKbDocExpired(doc)) return res.status(404).json({ error: 'Document not found.' });
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

// ── Security: rotate all public slugs ────────────────────────────────────────
// Invalidates every existing public link by assigning each document a brand-new UUID.
// The stored file (storage_path / storage_key) is not touched.
router.post('/rotate-slugs', hasRole('superadmin'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    try {
        const count = await db.rotateAllKbSlugs();
        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        await db.logEvent(actor, 'Knowledge Base', 'All Document Slugs Rotated', {
            documentCount: count,
            note: 'All previous public Knowledge Base links are now invalid.',
        });
        logger.info('[KB] All document slugs rotated', { count, actor });
        res.json({ success: true, rotated: count });
    } catch (e) {
        logger.error('[KB] Slug rotation failed', { error: e.message });
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

// Must be declared before /documents/:id so Express does not treat "missing-files" as an id param.
router.get('/documents/missing-files', hasRole('admin'), async (req, res) => {
    try {
        const docs = await db.getKbDocuments();
        const missing = [];
        for (const doc of docs) {
            const exists = await storage.fileExists(doc.storage_type, doc.storage_path);
            if (!exists) {
                missing.push({
                    id:                doc.id,
                    title:             doc.title,
                    original_filename: doc.original_filename,
                    storage_type:      doc.storage_type,
                    category_name:     doc.category_name || null,
                    is_active:         doc.is_active,
                    created_at:        doc.created_at,
                });
            }
        }
        logger.info('[KB] Missing files scan completed', { total: docs.length, missing: missing.length });
        res.json({ total: docs.length, missing });
    } catch (e) {
        logger.error('[KB] Missing files scan failed', { error: e.message });
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

router.get('/documents/:id/file-status', hasRole('admin'), async (req, res) => {
    try {
        const doc = await db.getKbDocumentById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Document not found.' });
        const exists = await storage.fileExists(doc.storage_type, doc.storage_path);
        res.json({ exists });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/documents', hasRole('admin'), upload.single('file'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    try {
        assertLocalDiskSpace();
        if (!req.file) return res.status(400).json({ error: 'A file is required (PDF, Word, Excel, RTF, TXT, Markdown, PNG, JPG, or BMP).' });
        try { assertMagicBytes(req.file); } catch (e) {
            return res.status(400).json({ error: e.message });
        }
        const { title, description, category_id } = req.body;
        if (!title || !title.trim()) return res.status(400).json({ error: 'Document title is required.' });

        const mimeType   = resolveUploadMimeType(req.file);
        const slug       = uuidv4().toUpperCase(); // public access key — rotatable
        const storageKey = uuidv4().toUpperCase(); // immutable storage filename — never changes
        const { storageType, storagePath, fileSize } = await storage.upload(
            storageKey, req.file.originalname, req.file.buffer, mimeType,
        );

        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        const id = await db.createKbDocument({
            slug,
            title: title.trim(),
            description: description || null,
            category_id: category_id ? parseInt(category_id, 10) : null,
            original_filename: req.file.originalname,
            file_size: fileSize,
            mime_type: mimeType,
            storage_type: storageType,
            storage_path: storagePath,
            uploaded_by: actor,
            expires_at: req.body.expires_at || null,
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
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.patch('/documents/:id', hasRole('admin'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    try {
        const { title, description, category_id, expires_at } = req.body;
        if (!title || !title.trim()) return res.status(400).json({ error: 'Document title is required.' });
        await db.updateKbDocument(req.params.id, {
            title: title.trim(),
            description: description || null,
            category_id: category_id ? parseInt(category_id, 10) : null,
            expires_at: expires_at || null,
        });
        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        await db.logEvent(actor, 'Knowledge Base', 'Document Updated', { documentId: req.params.id, documentTitle: title.trim() });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Replace the stored file — same id, slug, storage path; only the bytes and file metadata change.
router.post('/documents/:id/replace-file', hasRole('admin'), upload.single('file'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    try {
        assertLocalDiskSpace();
        if (!req.file) return res.status(400).json({ error: 'A replacement file is required.' });
        try { assertMagicBytes(req.file); } catch (e) {
            return res.status(400).json({ error: e.message });
        }
        const doc = await db.getKbDocumentById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Document not found.' });

        const mimeType = resolveUploadMimeType(req.file);
        await storage.replaceFile(doc.storage_type, doc.storage_path, req.file.buffer, mimeType);
        await db.updateKbDocumentFile(req.params.id, {
            original_filename: req.file.originalname,
            file_size:         req.file.size,
            mime_type:         mimeType,
        });

        const actor = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        await db.logEvent(actor, 'Knowledge Base', 'Document File Replaced', {
            documentId:       req.params.id,
            documentTitle:    doc.title,
            newFilename:      req.file.originalname,
            newFileSize:      req.file.size,
        });
        res.json({ success: true });
    } catch (e) {
        logger.error('[KB] Replace file error', { id: req.params.id, error: e.message });
        res.status(e.status || 500).json({ error: e.message });
    } finally {
        // multer memoryStorage — no temp file to clean up
    }
});

// Rotate the slug for a single document — invalidates its current public link only.
router.patch('/documents/:id/rotate-slug', hasRole('admin'), async (req, res) => {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    try {
        const doc = await db.getKbDocumentById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Document not found.' });

        const newSlug = await db.rotateKbDocumentSlug(req.params.id);
        const actor   = (req.apiKeyUser || req.session?.user)?.name || 'Unknown';
        await db.logEvent(actor, 'Knowledge Base', 'Document Slug Rotated', {
            documentId:    req.params.id,
            documentTitle: doc.title,
            oldSlug:       doc.slug,
            newSlug,
        });
        res.json({ success: true, slug: newSlug });
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
