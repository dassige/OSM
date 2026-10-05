// routes/api/extraction.js — Skills data source: PDF report snapshots (pdf-report plugin)
//
// Reports can be uploaded from the Skills Data Source page or by an automation
// (e.g. n8n) with an X-API-Key header, and are picked up automatically from GCS
// or the local file when PDF_SOURCE says so. The newest accepted report is the
// data the pdf-report plugin serves.

const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const db = require('../../services/db');
const config = require('../../config');
const logger = require('../../services/logger');
const { hasRole } = require('../../middleware/auth');
const extractionEngine = require('../../services/extraction-engine');
const pdfReportService = require('../../services/pdf-report-service');

const actorOf = (req) => (req.apiKeyUser || req.session?.user)?.name || 'Unknown';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.pdfReport.maxSizeMb * 1024 * 1024, files: 1 },
});

// Wrap multer so its errors come back as JSON instead of Express's HTML error page.
function receiveFile(req, res, next) {
    upload.single('file')(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: `PDF file is larger than the ${config.pdfReport.maxSizeMb} MB limit.` });
        }
        return res.status(400).json({ error: err.message });
    });
}

function rejectInDemo(req, res, next) {
    if (config.appMode === 'demo') return res.status(403).json({ error: 'Disabled in demo mode.' });
    next();
}

function parseId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function todayInTimezone() {
    return new Date().toLocaleDateString('en-CA', { timeZone: config.timezone });
}

function daysBetween(fromIso, toIso) {
    const [fy, fm, fd] = fromIso.split('-').map(Number);
    const [ty, tm, td] = toIso.split('-').map(Number);
    return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

// ── GET /api/extraction/status ─────────────────────────────────────────────
router.get('/status', hasRole('admin'), async (req, res) => {
    try {
        const { source, localPath, gcsBucket, gcsObject, maxSizeMb, staleWarnDays } = config.pdfReport;
        const latest = await db.getLatestExtractionSnapshot();
        const ageDays = latest ? daysBetween(latest.report_created_date, todayInTimezone()) : null;
        res.json({
            activePlugin: extractionEngine.getActivePlugin(),
            source,
            sourceLocation: source === 'gcs' ? `gs://${gcsBucket}/${gcsObject}` : source === 'local' ? localPath : null,
            maxSizeMb,
            staleWarnDays,
            retention: pdfReportService.SNAPSHOT_RETENTION,
            latest,
            ageDays,
            isStale: ageDays !== null && ageDays > staleWarnDays,
            lastSync: pdfReportService.getLastSync(),
        });
    } catch (e) {
        logger.error('[PDF Report] Status failed', { error: e.message });
        res.status(500).json({ error: e.message });
    }
});

// ── GET /api/extraction/snapshots ──────────────────────────────────────────
router.get('/snapshots', hasRole('admin'), async (req, res) => {
    try {
        res.json(await db.listExtractionSnapshots());
    } catch (e) {
        logger.error('[PDF Report] Snapshot list failed', { error: e.message });
        res.status(500).json({ error: e.message });
    }
});

// ── GET /api/extraction/snapshots/:id/file ─────────────────────────────────
router.get('/snapshots/:id/file', hasRole('admin'), async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid snapshot id.' });
    try {
        const file = await db.getExtractionSnapshotFile(id);
        if (!file) return res.status(404).json({ error: 'Report not found.' });
        const name = (file.fileName || `skills-report-${id}.pdf`).replace(/[^\w.\- ]/g, '_');
        logger.info('[PDF Report] Report downloaded', { snapshotId: id, by: actorOf(req) });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
        res.send(file.buffer);
    } catch (e) {
        logger.error('[PDF Report] Download failed', { snapshotId: id, error: e.message });
        res.status(500).json({ error: e.message });
    }
});

// ── POST /api/extraction/upload ────────────────────────────────────────────
// multipart/form-data: file (the PDF), force ("true" to accept a report older than the current one)
router.post('/upload', hasRole('admin'), rejectInDemo, receiveFile, async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded — send the PDF in the "file" form field.' });

    const actor = actorOf(req);
    const fileName = path.basename(req.file.originalname || 'report.pdf').slice(0, 200);
    const force = String(req.body?.force ?? req.query.force ?? '') === 'true';
    try {
        const result = await pdfReportService.ingestReport(req.file.buffer, { source: 'upload', fileName, actor, force });
        const s = result.snapshot;
        if (result.status === 'unchanged') {
            return res.json({ success: true, status: 'unchanged', id: s.id, reportCreatedDate: s.report_created_date });
        }

        extractionEngine.clearCache();
        await db.logEvent(actor, 'System', 'Skills Report Uploaded', {
            ...pdfReportService.snapshotEventPayload(s),
            forced: force,
        });
        res.json({
            success: true,
            status: 'imported',
            id: s.id,
            reportCreatedDate: s.report_created_date,
            recordCount: s.record_count,
            memberCount: s.member_count,
            skillCount: s.skill_count,
            warnings: s.warnings,
        });
    } catch (e) {
        if (e instanceof pdfReportService.ReportRejectedError) {
            logger.warn('[PDF Report] Upload rejected', { fileName, by: actor, reason: e.message });
            return res.status(e.status).json({ error: e.message });
        }
        logger.error('[PDF Report] Upload failed', { fileName, error: e.message });
        res.status(500).json({ error: e.message });
    }
});

// ── POST /api/extraction/sync ──────────────────────────────────────────────
// Check the configured source (GCS object or local file) for a new report now.
router.post('/sync', hasRole('admin'), rejectInDemo, async (req, res) => {
    try {
        const result = await pdfReportService.syncFromSource({ actor: actorOf(req), recheck: true });
        if (result.status === 'imported') extractionEngine.clearCache();
        res.json(result);
    } catch (e) {
        logger.error('[PDF Report] Manual source check failed', { error: e.message });
        res.status(500).json({ error: e.message });
    }
});

// ── DELETE /api/extraction/snapshots/:id ───────────────────────────────────
router.delete('/snapshots/:id', hasRole('admin'), rejectInDemo, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid snapshot id.' });
    try {
        const snapshot = await db.getExtractionSnapshotById(id);
        if (!snapshot) return res.status(404).json({ error: 'Report not found.' });
        const latest = await db.getLatestExtractionSnapshot();
        const wasCurrent = latest?.id === id;

        await db.deleteExtractionSnapshot(id);
        if (wasCurrent) extractionEngine.clearCache();

        const actor = actorOf(req);
        await db.logEvent(actor, 'System', 'Skills Report Deleted', {
            ...pdfReportService.snapshotEventPayload(snapshot),
            wasCurrent,
        });
        logger.info('[PDF Report] Report deleted', { snapshotId: id, wasCurrent, by: actor });
        res.json({ success: true });
    } catch (e) {
        logger.error('[PDF Report] Delete failed', { snapshotId: id, error: e.message });
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
