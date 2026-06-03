// services/plugins/rest-api.plugin.js
// ETL plugin stub — fetches member skill expiry data from a REST API endpoint.
//
// This plugin is a placeholder for a future integration when direct API access
// to the source system becomes available.  A REST API source can provide richer,
// more accurate fields (full firstName, lastName, rank) without needing to parse
// them from a formatted name string.
//
// To activate: set EXTRACTION_PLUGIN=rest-api in your .env file and implement
// the extract() method below.
//
// Expected output record shape (must match the extraction engine contract):
//   { name, rank, lastName, firstName, memberOsmId, skill, skillOsmId, skillCategory, dueDate }
//
// Where:
//   name          — full display name (may be constructed from lastName + firstName)
//   rank          — member rank abbreviation (e.g. "QFF", "FF", "CFO")
//   lastName      — member last / family name
//   firstName     — member first / given name (or initial)
//   memberOsmId      — unique member identifier from the source system
//   skill         — skill name string
//   skillOsmId       — unique skill identifier from the source system
//   skillCategory — logical grouping of the skill (e.g. "Pumps", "Line Rescue", "Operational Integrity")
//   dueDate       — expiry date as "YYYY-MM-DD"

'use strict';

const plugin = {
    name: 'rest-api',
    description: 'Fetches member skill expiry data from a REST API endpoint (not yet implemented)',

    /**
     * Validate config before extraction.
     * TODO: Add checks for any required env vars once the API is defined.
     */
    validateConfig(/* config */) {
        return { valid: false, errors: ['rest-api plugin is not yet implemented.'] };
    },

    /**
     * Fetch skill expiry data from the REST API.
     * TODO: Implement once API access is available.
     *
     * @param {object}   config  Full application config object
     * @param {Function} log     Logger function (string → void)
     * @returns {Promise<Array<{ name, rank, lastName, firstName, skill, dueDate }>>}
     */
    async extract(config, log) {
        log('[rest-api] This plugin is not yet implemented.');
        throw new Error(
            'rest-api plugin is not yet implemented. ' +
            'Set EXTRACTION_PLUGIN=html-scraper in your .env to use the default plugin.'
        );
    },
};

module.exports = plugin;
