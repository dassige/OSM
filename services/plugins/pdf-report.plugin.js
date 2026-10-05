// services/plugins/pdf-report.plugin.js
// ETL plugin — extracts member skill expiry data from the FENZ
// "Skills Expiring in the Next Six Months" PDF report.
//
// Reports are ingested as snapshots by services/pdf-report-service.js (upload,
// GCS pickup or local file — see PDF_SOURCE); this plugin checks the configured
// source for a newer report and then serves the records of the newest snapshot.
//
// Source limitations compared with the html-scraper:
//   • Only skills that are lapsed or expire within six months are listed —
//     a skill missing from the report means "current for more than six months".
//   • Expiry is a month, not a date — see grid-parser.js deriveDueDate() for the
//     agreed rules (orange names = expiring within one month of the Created date).
//   • Members appear by full name ("Andrew Keith") with no rank, so every record
//     is resolved onto a member record by services/member-name-resolver.js before
//     it is returned; names that cannot be matched keep the report name and are
//     flagged `unresolved` (consumers simply find no member for them).
//
// Output record shape (one entry per member × skill):
//   { name, rank, lastName, firstName, memberOsmId, skill, skillOsmId, skillCategory, dueDate,
//     dueMonth, lapsed, withinOneMonth, sourceName, reportCreatedDate, memberId?, unresolved? }

'use strict';

const db = require('../db');
const pdfReportService = require('../pdf-report-service');
const { resolveRecords } = require('../member-name-resolver');

const SOURCES = ['local', 'gcs', 'upload'];

const plugin = {
    name: 'pdf-report',
    description: 'Parses the FENZ "Skills Expiring in the Next Six Months" PDF report',

    /**
     * @param {object} config  Full application config object
     * @returns {{ valid: boolean, errors: string[] }}
     */
    validateConfig(config) {
        const errors = [];
        const pdf = config.pdfReport || {};
        if (!SOURCES.includes(pdf.source)) {
            errors.push(`PDF_SOURCE must be one of ${SOURCES.join(', ')} (got "${pdf.source}")`);
        }
        if (pdf.source === 'local' && !pdf.localPath) errors.push('PDF_LOCAL_PATH is required when PDF_SOURCE=local');
        if (pdf.source === 'gcs' && !pdf.gcsBucket) {
            errors.push('PDF_GCS_BUCKET (or GCS_BUCKET_NAME) is required when PDF_SOURCE=gcs');
        }
        if (config.appMode === 'demo') {
            errors.push('pdf-report reads real member data — use html-scraper in demo mode');
        }
        return { valid: errors.length === 0, errors };
    },

    /**
     * @param {object}   config  Full application config object
     * @param {Function} log     Logger function (string → void)
     * @returns {Promise<Array>}
     */
    async extract(config, log) {
        const sync = await pdfReportService.syncFromSource({ log });
        if (['missing', 'rejected', 'error'].includes(sync.status)) {
            log(`[pdf-report] Warning: ${sync.message}`);
        }

        const latest = await db.getLatestExtractionRecords();
        if (!latest) {
            throw new Error('No skills report has been imported yet — upload the latest PDF on the Skills Data Source page.');
        }
        const { snapshot } = latest;
        log(`[pdf-report] Using the report created on ${snapshot.report_created_date} ` +
            `(${snapshot.record_count} records, ${snapshot.member_count} members, ${snapshot.skill_count} skills).`);
        const { records } = await resolveRecords(latest.records, { log });
        return records;
    },
};

module.exports = plugin;
