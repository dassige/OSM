// services/plugins/html-scraper.plugin.js
// ETL plugin — extracts member skill expiry data by scraping the OI HTML dashboard.
//
// Supports three sub-modes (governed by config.appMode):
//   demo       — reads a bundled static HTML file; shifts dates relative to today
//   gcs        — downloads the HTML file from a Google Cloud Storage bucket
//   production — fetches the live dashboard URL via HTTP (optionally via NZ proxy)
//
// Output record shape (one entry per member × skill row):
//   { name, rank, lastName, firstName, memberOsmId, skill, skillOsmId, skillCategory, dueDate }

'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const fs = require('fs').promises;
const { HttpsProxyAgent } = require('https-proxy-agent');
const { Storage } = require('@google-cloud/storage');
const { parseMemberName } = require('./name-parser');

const storage = new Storage();

function formatDateToISO(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Ordered rules applied left-to-right; first match wins.
// When no rule matches, the text before the first " - " separator is used as
// the category (e.g. "Pumps - X" → "Pumps").  Falls back to "General".
const SKILL_CATEGORY_RULES = [
    // More-specific prefixes first so they win over broader keyword matches below
    { pattern: /^OI\s*\(/i,                                        category: 'Operational Integrity' },
    { pattern: /^pump/i,                                            category: 'Pumps' },
    { pattern: /^line rescue/i,                                     category: 'Line Rescue' },
    { pattern: /^ladder/i,                                          category: 'Ladders' },
    { pattern: /breathing apparatus|\bBA\b/i,                       category: 'Breathing Apparatus' },
    { pattern: /first aid/i,                                        category: 'First Aid' },
    { pattern: /hazmat|hazardous/i,                                 category: 'Hazardous Materials' },
    { pattern: /firefighting|suppression/i,                         category: 'Firefighting' },
    { pattern: /command|leadership|incident control|\bICS\b/i,      category: 'Command & Leadership' },
    { pattern: /navigation|\bGPS\b/i,                               category: 'Navigation' },
    { pattern: /medical|trauma|\bcpr\b|defibrillat/i,               category: 'Medical' },
    { pattern: /communication|radio/i,                              category: 'Communications' },
    // Vehicle & Appliance before generic rescue so "Vehicle Rescue" hits here
    { pattern: /vehicle|appliance|driving/i,                        category: 'Vehicle & Appliance' },
    // Generic rescue after vehicle so "Line Rescue" and "Vehicle Rescue" are already handled
    { pattern: /\brescue\b/i,                                       category: 'Rescue' },
];

function categoriseSkill(skillName) {
    if (!skillName) return 'General';
    for (const { pattern, category } of SKILL_CATEGORY_RULES) {
        if (pattern.test(skillName)) return category;
    }
    // Use text before the first " - " as a fallback category label
    const dashIdx = skillName.indexOf(' - ');
    if (dashIdx > 0) return skillName.slice(0, dashIdx).trim();
    return 'General';
}

const plugin = {
    name: 'html-scraper',
    description: 'Scrapes the OI HTML dashboard page to extract member skill expiry data',

    /**
     * Validate that the config contains what this plugin needs before extraction runs.
     * @param {object} config  Full application config object
     * @returns {{ valid: boolean, errors: string[] }}
     */
    validateConfig(config) {
        const errors = [];
        if (config.appMode === 'gcs') {
            if (!config.gcsConfig?.bucketName) errors.push('GCS_BUCKET_NAME is required when APP_MODE=gcs');
            if (!config.gcsConfig?.dataFilename) errors.push('GCS_DATA_FILENAME is required when APP_MODE=gcs');
        }
        if (config.appMode !== 'demo' && config.appMode !== 'gcs' && !config.url) {
            errors.push('DASHBOARD_URL (or OSM_BU_ID) is required when APP_MODE=production');
        }
        return { valid: errors.length === 0, errors };
    },

    /**
     * Fetch and parse the OI dashboard, returning one normalised record per row.
     *
     * @param {object}   config           Full application config object
     * @param {Function} log              Logger function (string → void)
     * @param {object}   [options]
     * @param {string}   [options.proxyUrl]  NZ proxy URL, or null for direct connection
     * @returns {Promise<Array<{ name, rank, lastName, firstName, skill, dueDate }>>}
     */
    async extract(config, log, options = {}) {
        const { proxyUrl = null } = options;
        const getTime = () =>
            new Date().toLocaleTimeString(config.locale, { timeZone: config.timezone });

        let responseData = '';

        if (config.appMode === 'demo') {
            log(`[${getTime()}] [html-scraper] DEMO MODE: Reading local dashboard file...`);
            responseData = await fs.readFile(config.url, 'utf8');

        } else if (config.appMode === 'gcs') {
            log(`[${getTime()}] [html-scraper] GCS MODE: Downloading dashboard file from Cloud Storage...`);
            if (!config.gcsConfig.bucketName || !config.gcsConfig.dataFilename) {
                throw new Error('GCS_BUCKET_NAME and GCS_DATA_FILENAME must be defined for GCS mode.');
            }
            const bucket = storage.bucket(config.gcsConfig.bucketName);
            const file = bucket.file(config.gcsConfig.dataFilename);
            const [contents] = await file.download();
            responseData = contents.toString('utf8');

        } else {
            log(`[${getTime()}] [html-scraper] Fetching live HTML from dashboard...`);
            const axiosConfig = {
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            };
            if (proxyUrl) {
                try {
                    axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
                    axiosConfig.proxy = false;
                    log(`[html-scraper] Using proxy: ${proxyUrl.replace(/:[^:]*@/, ':***@')}`);
                } catch (e) {
                    log(`[html-scraper] Proxy configuration failed: ${e.message}`);
                }
            // H-18: TLS certificate validation is now enforced (rejectUnauthorized defaults to true).
            }
            const response = await axios.get(config.url, axiosConfig);
            responseData = response.data;
        }

        if (!responseData) {
            log('[html-scraper] Warning: Empty response — no records returned.');
            return [];
        }

        const $ = cheerio.load(responseData);
        const osmStatusTable = $('tbody');

        if (osmStatusTable.length === 0) {
            log('[html-scraper] Warning: No <tbody> found in page — no records returned.');
            return [];
        }

        let records = [];
        osmStatusTable.find('tr').each((i, row) => {
            const cols = [];
            $(row).find('td').each((j, col) => cols.push($(col).text().trim()));
            if (cols.length >= 3) {
                const rawName = cols[0];
                const rawSkill = cols[1];
                const { rank, lastName, firstName } = parseMemberName(rawName);
                records.push({
                    name: rawName,
                    rank,
                    lastName,
                    firstName,
                    memberOsmId: rawName,      // no real member ID in OI HTML; raw name is the unique key
                    skill: rawSkill,
                    skillOsmId: rawSkill,      // no real skill ID in OI HTML; raw skill name is the unique key
                    skillCategory: categoriseSkill(rawSkill),
                    dueDate: cols[2],
                });
            }
        });

        // Shift all skill dates relative to today so the static demo file stays
        // current without manual edits.  The file embeds its reference date in a
        // footer <div style="background:#000099">.
        if (config.appMode === 'demo') {
            const footerText = $('div[style*="background:#000099"]').text().trim();
            if (footerText) {
                const referenceDate = new Date(footerText);
                if (!isNaN(referenceDate.getTime())) {
                    log(`[html-scraper] Demo reference date: ${formatDateToISO(referenceDate)}`);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    referenceDate.setHours(0, 0, 0, 0);
                    records = records.map((record) => {
                        const orig = new Date(record.dueDate);
                        if (isNaN(orig.getTime())) return record;
                        const diff = orig.getTime() - referenceDate.getTime();
                        return { ...record, dueDate: formatDateToISO(new Date(today.getTime() + diff)) };
                    });
                    log(`[html-scraper] Adjusted ${records.length} dates relative to today.`);
                } else {
                    log(`[html-scraper] Warning: Footer found but date could not be parsed: "${footerText}"`);
                }
            } else {
                log('[html-scraper] Warning: Demo reference date not found — dates unchanged.');
            }
        }

        log(`[html-scraper] Successfully parsed ${records.length} records.`);
        return records;
    },
};

module.exports = plugin;
// Also export categoriseSkill so the backfill script and tests can use the
// same logic without duplicating it.
module.exports.categoriseSkill = categoriseSkill;
