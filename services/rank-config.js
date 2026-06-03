// services/rank-config.js
// Authoritative FENZ rank list, ordered highest to lowest authority.
// Used by report-service (backend sorting) and exposed via /ui-config
// so the frontend can apply the same priority order consistently.

'use strict';

const RANKS = [
    { abbreviation: 'CFO',  fullName: 'Chief Fire Officer',       priority: 1 },
    { abbreviation: 'DCFO', fullName: 'Deputy Chief Fire Officer', priority: 2 },
    { abbreviation: 'SSO',  fullName: 'Senior Station Officer',    priority: 3 },
    { abbreviation: 'SO',   fullName: 'Station Officer',           priority: 4 },
    { abbreviation: 'SFF',  fullName: 'Senior Firefighter',        priority: 5 },
    { abbreviation: 'QFF',  fullName: 'Qualified Firefighter',     priority: 6 },
    { abbreviation: 'FF',   fullName: 'Firefighter',               priority: 7 },
    { abbreviation: 'RFF',  fullName: 'Recruit Firefighter',       priority: 8 },
];

// Priority map keyed by uppercase abbreviation — O(1) lookup
const RANK_PRIORITY_MAP = new Map(RANKS.map(r => [r.abbreviation, r.priority]));

/**
 * Return the numeric priority for a rank abbreviation or a raw name string
 * that starts with a rank (e.g. "QFF Smith, J").
 * Lower number = higher authority. Unknown ranks return 99.
 *
 * @param {string} rankOrName  Rank abbreviation ("QFF") or full member name
 * @returns {number}
 */
function getRankPriority(rankOrName) {
    if (!rankOrName) return 99;
    const upper = String(rankOrName).trim().toUpperCase();
    // Direct abbreviation match
    if (RANK_PRIORITY_MAP.has(upper)) return RANK_PRIORITY_MAP.get(upper);
    // Prefix match for raw names like "QFF Smith, J"
    for (const [abbr, priority] of RANK_PRIORITY_MAP) {
        if (upper.startsWith(abbr + ' ') || upper.startsWith(abbr + ',')) return priority;
    }
    return 99;
}

/**
 * Build the display name from structured ETL fields, falling back to the raw name.
 * Format: "RANK LastName, FirstName"  e.g. "QFF Smith, J"
 *
 * @param {string} rank
 * @param {string} lastName
 * @param {string} firstName
 * @param {string} fallbackName  Raw name used when structured fields are absent
 * @returns {string}
 */
function formatMemberName(rank, lastName, firstName, fallbackName) {
    if (lastName) {
        const r  = rank      ? rank.trim() + ' '          : '';
        const fn = firstName ? ', ' + firstName.trim()    : '';
        return `${r}${lastName.trim()}${fn}`;
    }
    return fallbackName || '';
}

module.exports = { RANKS, getRankPriority, formatMemberName };
