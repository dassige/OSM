// services/pdf-report-service.js
// Ingestion of the FENZ "Skills Expiring in the Next Six Months" PDF report.
//
// Every route a report can arrive by ends in the same place — a row in
// extraction_snapshots — and the pdf-report plugin always serves the newest one:
//   • upload : POST /api/extraction/upload (browser, or n8n with an X-API-Key)
//   • gcs    : PDF_GCS_BUCKET / PDF_GCS_OBJECT, checked whenever the extraction cache expires
//   • local  : PDF_LOCAL_PATH, checked whenever the extraction cache expires
//
// A report is accepted only if it parses cleanly, differs from the current one,
// and is not older than the current one (uploads can override the age check).

'use strict';

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const db = require('./db');
const logger = require('./logger');
const { extractTextItems } = require('./plugins/pdf/pdf-text');
const { parseGrid } = require('./plugins/pdf/grid-parser');
const { parseFullName } = require('./plugins/name-parser');

const PLUGIN_NAME = 'pdf-report';
const SNAPSHOT_RETENTION = 24;   // about two years of monthly reports
const PDF_MAGIC = '%PDF-';
const noop = () => {};

/** A report that was looked at and refused — the HTTP status says why. */
class ReportRejectedError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'ReportRejectedError';
        this.status = status;
    }
}

/**
 * Reject anything that is not a PDF of an acceptable size before pdf.js sees it.
 * @param {Buffer} buffer
 * @param {number} maxSizeMb
 */
function assertPdfBuffer(buffer, maxSizeMb) {
    if (!buffer || buffer.length === 0) throw new ReportRejectedError('PDF file is empty.');
    if (buffer.length > maxSizeMb * 1024 * 1024) {
        throw new ReportRejectedError(`PDF file is larger than the ${maxSizeMb} MB limit.`, 413);
    }
    if (buffer.subarray(0, 1024).indexOf(PDF_MAGIC) === -1) {
        throw new ReportRejectedError('File is not a PDF (missing %PDF- header).');
    }
}

/**
 * Parse a PDF buffer into extraction-contract records.
 *
 * @param {Buffer}   buffer
 * @param {object}   options
 * @param {number}   options.maxSizeMb
 * @param {Function} [options.log]
 * @returns {Promise<{ createdDate: string, records: Array, warnings: string[] }>}
 * @throws {ReportRejectedError} when the file is not a readable six-month report
 */
async function parsePdfReport(buffer, { maxSizeMb, log = noop }) {
    assertPdfBuffer(buffer, maxSizeMb);
    let result;
    try {
        const { pages } = await extractTextItems(buffer);
        result = parseGrid(pages);
    } catch (e) {
        throw new ReportRejectedError(`Not a readable skills report: ${e.message}`);
    }
    result.warnings.forEach((w) => log(`[pdf-report] Warning: ${w}`));

    const records = result.records.map((r) => {
        const { firstName, lastName } = parseFullName(r.sourceName);
        return {
            name: r.sourceName,
            rank: '',
            lastName,
            firstName,
            memberOsmId: r.sourceName,
            skill: r.skill,
            skillOsmId: r.skill,
            skillCategory: r.skillCategory,
            dueDate: r.dueDate,
            dueMonth: r.dueMonth,
            lapsed: r.lapsed,
            withinOneMonth: r.withinOneMonth,
            sourceName: r.sourceName,
            reportCreatedDate: result.createdDate,
        };
    });
    return { createdDate: result.createdDate, records, warnings: result.warnings };
}

/** Event-log payload describing a snapshot (no member data). */
function snapshotEventPayload(snapshot) {
    return {
        snapshotId: snapshot.id,
        fileName: snapshot.file_name,
        source: snapshot.source,
        reportCreatedDate: snapshot.report_created_date,
        recordCount: snapshot.record_count,
        memberCount: snapshot.member_count,
        skillCount: snapshot.skill_count,
        warningCount: (snapshot.warnings || []).length,
    };
}

/**
 * Validate, parse and store a report as the new current snapshot.
 * Does not write the event log — callers do, with the right actor and title.
 *
 * @param {Buffer} buffer
 * @param {object} options
 * @param {'upload'|'gcs'|'local'} options.source
 * @param {string}  [options.sourceRef]  Change marker of the source file (GCS generation, local mtime)
 * @param {string}  [options.fileName]
 * @param {string}  [options.actor='System']
 * @param {boolean} [options.force=false]  Accept a report older than the current one
 * @param {Function} [options.log]
 * @returns {Promise<{ status: 'imported'|'unchanged', snapshot: object }>}
 * @throws {ReportRejectedError} 400 unreadable, 409 older than current, 413 too large
 */
async function ingestReport(buffer, { source, sourceRef = null, fileName = null, actor = 'System', force = false, log = noop }) {
    const { maxSizeMb } = config.pdfReport;
    assertPdfBuffer(buffer, maxSizeMb);

    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const latest = await db.getLatestExtractionSnapshot();
    if (latest && latest.file_hash === fileHash) {
        return { status: 'unchanged', snapshot: latest };
    }

    const parsed = await parsePdfReport(buffer, { maxSizeMb, log });
    if (latest && !force && parsed.createdDate < latest.report_created_date) {
        throw new ReportRejectedError(
            `This report was created on ${parsed.createdDate}, before the current report (${latest.report_created_date}).`,
            409,
        );
    }

    const id = await db.createExtractionSnapshot({
        plugin: PLUGIN_NAME,
        source,
        sourceRef,
        fileName,
        fileHash,
        fileSize: buffer.length,
        fileData: buffer,
        reportCreatedDate: parsed.createdDate,
        recordCount: parsed.records.length,
        memberCount: new Set(parsed.records.map((r) => r.sourceName)).size,
        skillCount: new Set(parsed.records.map((r) => r.skill)).size,
        warnings: parsed.warnings,
        records: parsed.records,
        createdBy: actor,
    });
    const pruned = await db.pruneExtractionSnapshots(SNAPSHOT_RETENTION);
    const snapshot = await db.getExtractionSnapshotById(id);

    logger.info('[PDF Report] Report imported', {
        snapshotId: id, source, reportCreatedDate: parsed.createdDate,
        recordCount: parsed.records.length, warningCount: parsed.warnings.length, pruned,
    });
    return { status: 'imported', snapshot };
}

// ── Automatic pickup (gcs / local) ──────────────────────────────────────────

// Outcome of the most recent automatic check — shown on the Skills Data Source page.
const lastSync = { at: null, source: null, status: null, message: null, snapshotId: null };
// Source refs already processed by this process (so a rejected file is not retried every hour).
const checkedRefs = {};

async function probeLocal() {
    const { localPath } = config.pdfReport;
    let stat;
    try {
        stat = await fs.stat(localPath);
    } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
    }
    return {
        ref: `${Math.round(stat.mtimeMs)}:${stat.size}`,
        name: path.basename(localPath),
        read: () => fs.readFile(localPath),
    };
}

async function probeGcs() {
    const { gcsBucket, gcsObject, maxSizeMb } = config.pdfReport;
    const { Storage } = require('@google-cloud/storage');
    const file = new Storage().bucket(gcsBucket).file(gcsObject);
    let meta;
    try {
        [meta] = await file.getMetadata();
    } catch (e) {
        if (e.code === 404) return null;
        throw e;
    }
    return {
        ref: String(meta.generation),
        name: gcsObject,
        read: async () => {
            if (Number(meta.size) > maxSizeMb * 1024 * 1024) {
                throw new ReportRejectedError(`PDF file is larger than the ${maxSizeMb} MB limit.`, 413);
            }
            const [buffer] = await file.download();
            return buffer;
        },
    };
}

function describeSource() {
    const { source, localPath, gcsBucket, gcsObject } = config.pdfReport;
    return source === 'gcs' ? `gs://${gcsBucket}/${gcsObject}` : localPath;
}

/**
 * Check the configured source (PDF_SOURCE = gcs | local) for a new report and
 * import it.  Never throws — the outcome is returned and kept for getLastSync().
 *
 * @param {object}   [options]
 * @param {Function} [options.log]
 * @param {string}   [options.actor='System']
 * @param {boolean}  [options.recheck=false]  Retry a file this process already refused
 * @returns {Promise<{ at, source, status, message, snapshotId }>}
 *   status: imported | unchanged | missing | rejected | error | skipped
 */
async function syncFromSource({ log = noop, actor = 'System', recheck = false } = {}) {
    const { source } = config.pdfReport;
    const record = (status, message, snapshotId = null) => {
        Object.assign(lastSync, { at: new Date().toISOString(), source, status, message, snapshotId });
        return { ...lastSync };
    };

    if (source === 'upload') return record('skipped', 'Automatic pickup is off — reports arrive by upload.');
    if (source !== 'gcs' && source !== 'local') return record('error', `Unknown PDF_SOURCE "${source}".`);

    let probe;
    try {
        probe = source === 'gcs' ? await probeGcs() : await probeLocal();
    } catch (e) {
        logger.warn('[PDF Report] Source check failed', { source, error: e.message });
        return record('error', `Could not check ${describeSource()}: ${e.message}`);
    }
    if (!probe) return record('missing', `No report found at ${describeSource()}.`);

    const lastOfSource = await db.getLatestExtractionSnapshotBySource(source);
    if (lastOfSource && lastOfSource.source_ref === probe.ref) {
        return record('unchanged', 'No new report since the last import.', lastOfSource.id);
    }
    if (!recheck && checkedRefs[source] === probe.ref) {
        return { ...lastSync };
    }

    checkedRefs[source] = probe.ref;
    try {
        log(`[pdf-report] New report found at ${describeSource()} — importing...`);
        const buffer = await probe.read();
        const result = await ingestReport(buffer, { source, sourceRef: probe.ref, fileName: probe.name, actor, log });
        if (result.status === 'unchanged') {
            return record('unchanged', 'The report file has the same content as the current report.', result.snapshot.id);
        }
        await db.logEvent(actor, 'System', 'Skills Report Imported', snapshotEventPayload(result.snapshot));
        return record('imported', `Imported the report created on ${result.snapshot.report_created_date}.`, result.snapshot.id);
    } catch (e) {
        if (!(e instanceof ReportRejectedError)) {
            delete checkedRefs[source];   // transient failure — try again next time
            logger.error('[PDF Report] Import failed', { source, error: e.message });
            return record('error', `Import from ${describeSource()} failed: ${e.message}`);
        }
        logger.warn('[PDF Report] Report rejected', { source, fileName: probe.name, reason: e.message });
        await db.logEvent(actor, 'System', 'Skills Report Rejected', { source, fileName: probe.name, reason: e.message });
        return record('rejected', e.message);
    }
}

/** Outcome of the most recent automatic check (all fields null before the first one). */
function getLastSync() {
    return { ...lastSync };
}

module.exports = {
    PLUGIN_NAME,
    SNAPSHOT_RETENTION,
    ReportRejectedError,
    assertPdfBuffer,
    parsePdfReport,
    ingestReport,
    syncFromSource,
    getLastSync,
    snapshotEventPayload,
};
