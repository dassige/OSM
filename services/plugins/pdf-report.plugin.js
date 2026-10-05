// services/plugins/pdf-report.plugin.js
// ETL plugin — extracts member skill expiry data from the FENZ
// "Skills Expiring in the Next Six Months" PDF report.
//
// Source limitations compared with the html-scraper:
//   • Only skills that are lapsed or expire within six months are listed —
//     a skill missing from the report means "current for more than six months".
//   • Expiry is a month, not a date — see grid-parser.js deriveDueDate() for the
//     agreed rules (orange names = expiring within one month of the Created date).
//   • Members appear by full name ("Andrew Keith") with no rank, so `name` and
//     `memberOsmId` carry the source name until member matching maps them onto
//     existing member records.
//
// Phase 1 source: a local file (PDF_LOCAL_PATH).
//
// Output record shape (one entry per member × skill):
//   { name, rank, lastName, firstName, memberOsmId, skill, skillOsmId, skillCategory, dueDate,
//     dueMonth, lapsed, withinOneMonth, sourceName, reportCreatedDate }

'use strict';

const fs = require('fs').promises;
const { extractTextItems } = require('./pdf/pdf-text');
const { parseGrid } = require('./pdf/grid-parser');
const { parseFullName } = require('./name-parser');

const PDF_MAGIC = '%PDF-';

/**
 * Reject anything that is not a PDF of an acceptable size before pdf.js sees it.
 * @param {Buffer} buffer
 * @param {number} maxSizeMb
 */
function assertPdfBuffer(buffer, maxSizeMb) {
    if (!buffer || buffer.length === 0) throw new Error('PDF file is empty.');
    if (buffer.length > maxSizeMb * 1024 * 1024) {
        throw new Error(`PDF file is larger than the ${maxSizeMb} MB limit.`);
    }
    if (buffer.subarray(0, 1024).indexOf(PDF_MAGIC) === -1) {
        throw new Error('File is not a PDF (missing %PDF- header).');
    }
}

/**
 * Parse a PDF buffer into extraction-contract records.
 * Shared by the local-file source here and the upload/GCS sources added later.
 *
 * @param {Buffer}   buffer
 * @param {object}   options
 * @param {number}   options.maxSizeMb
 * @param {Function} [options.log]
 * @returns {Promise<{ createdDate: string, records: Array, warnings: string[] }>}
 */
async function parsePdfReport(buffer, { maxSizeMb, log = () => {} }) {
    assertPdfBuffer(buffer, maxSizeMb);
    const { pages } = await extractTextItems(buffer);
    const result = parseGrid(pages);
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

const plugin = {
    name: 'pdf-report',
    description: 'Parses the FENZ "Skills Expiring in the Next Six Months" PDF report',

    /**
     * @param {object} config  Full application config object
     * @returns {{ valid: boolean, errors: string[] }}
     */
    validateConfig(config) {
        const errors = [];
        if (!config.pdfReport?.localPath) errors.push('PDF_LOCAL_PATH is required for the pdf-report plugin');
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
        const { localPath, maxSizeMb } = config.pdfReport;
        log(`[pdf-report] Reading PDF report from ${localPath}...`);

        let buffer;
        try {
            buffer = await fs.readFile(localPath);
        } catch (e) {
            if (e.code === 'ENOENT') throw new Error(`PDF report not found at ${localPath}`);
            throw e;
        }

        const { createdDate, records } = await parsePdfReport(buffer, { maxSizeMb, log });
        const members = new Set(records.map((r) => r.sourceName)).size;
        const skills = new Set(records.map((r) => r.skill)).size;
        log(`[pdf-report] Parsed ${records.length} records (${members} members, ${skills} skills) from report created ${createdDate}.`);
        return records;
    },
};

module.exports = plugin;
module.exports.parsePdfReport = parsePdfReport;
module.exports.assertPdfBuffer = assertPdfBuffer;
