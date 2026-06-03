// services/extraction-engine.js
// Orchestrates ETL data extraction by delegating to the configured plugin.
//
// Plugins live in services/plugins/<name>.plugin.js and must export:
//   { name, description, validateConfig(config), extract(config, log, options) }
//
// The engine owns the in-memory result cache, plugin loading, and the single
// public entry point — extractData() — which replaces all former getOIData() calls.
//
// Extracted record shape (contract between engine and all consumers):
//   { name, rank, lastName, firstName, memberOsmId, skill, skillOsmId, skillCategory, dueDate }

'use strict';

const path = require('path');
const config = require('../config');
const logger = require('./logger');

const PLUGINS_DIR = path.join(__dirname, 'plugins');

// ── Cache (module-level; reset by clearCache()) ───────────────────────────────
let cachedData = null;
let lastExtractTime = 0;

// ── Plugin loading ────────────────────────────────────────────────────────────

function loadPlugin(name) {
    const pluginPath = path.join(PLUGINS_DIR, `${name}.plugin.js`);
    try {
        return require(pluginPath);
    } catch (e) {
        throw new Error(
            `Extraction plugin "${name}" could not be loaded from ${pluginPath}: ${e.message}`
        );
    }
}

const pluginName = config.extractionPlugin || 'html-scraper';
const plugin = loadPlugin(pluginName);

logger.info(`[ExtractionEngine] Active plugin: ${plugin.name} — ${plugin.description}`);

// Warn on config validation errors but don't abort startup — the error will
// surface clearly when the first extraction is attempted.
const { valid, errors } = plugin.validateConfig(config);
if (!valid) {
    errors.forEach((e) => logger.warn(`[ExtractionEngine] Plugin config warning: ${e}`));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract member skill expiry records, using the cached result when valid.
 *
 * @param {object}   [options]
 * @param {boolean}  [options.forceRefresh=false]  Bypass cache and fetch fresh data
 * @param {number}   [options.interval]            Cache TTL in minutes (default: config.scrapingInterval)
 * @param {string}   [options.proxyUrl=null]       NZ proxy URL passed to the plugin
 * @param {Function} [options.logFn]               Override logger (e.g. Socket.IO terminal logger)
 * @returns {Promise<Array<{ name, rank, lastName, firstName, memberOsmId, skill, skillOsmId, skillCategory, dueDate }>>}
 */
async function extractData({ forceRefresh = false, interval, proxyUrl = null, logFn } = {}) {
    const log = logFn || ((msg) => logger.info(msg));
    const ttlMinutes = interval !== undefined ? interval : config.scrapingInterval;

    if (!forceRefresh && cachedData && lastExtractTime > 0 && ttlMinutes > 0) {
        const cacheAgeMs = Date.now() - lastExtractTime;
        const maxAgeMs = ttlMinutes * 60 * 1000;
        if (cacheAgeMs < maxAgeMs) {
            log(
                `[ExtractionEngine] Using cached data` +
                ` (age: ${Math.round(cacheAgeMs / 1000)}s / TTL: ${ttlMinutes * 60}s)`
            );
            return cachedData;
        }
    }

    log(`[ExtractionEngine] Running plugin "${plugin.name}"...`);
    const records = await plugin.extract(config, log, { proxyUrl });

    if (records.length > 0) {
        cachedData = records;
        lastExtractTime = Date.now();
    }

    return records;
}

/**
 * Discard the cached result.  Call after a forced refresh or config change.
 */
function clearCache() {
    cachedData = null;
    lastExtractTime = 0;
}

/**
 * Return the name and description of the currently loaded plugin.
 * @returns {{ name: string, description: string }}
 */
function getActivePlugin() {
    return { name: plugin.name, description: plugin.description };
}

module.exports = { extractData, clearCache, getActivePlugin };
