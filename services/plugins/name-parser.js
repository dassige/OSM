// services/plugins/name-parser.js
// Parses a raw member name string from the OI dashboard into structured fields.
//
// Current source format: "RANK LastName, FirstInitial"
//   e.g. "QFF Skywalker, L"  → { rank: "QFF", lastName: "Skywalker", firstName: "L" }
//   e.g. "FF Kenobi, O"      → { rank: "FF",  lastName: "Kenobi",    firstName: "O" }
//
// When data comes from a richer source (REST API, SQL) the plugin will supply
// these fields directly and this parser becomes unused for that plugin.

'use strict';

// NZ fire brigade rank abbreviations, ordered longest-first so DCFO is matched
// before DCF, etc.  The regex below is the canonical authority — this list is
// documentation only.
//   CFO, DCFO, SSO, SO, SFF, QFF, RFF, FF, R
const RANK_RE = /^([A-Z]{2,5})\s+/;

/**
 * Parse a raw OI dashboard name string into its constituent parts.
 *
 * @param {string} rawName  Raw name as scraped, e.g. "QFF Skywalker, L"
 * @returns {{ rank: string, lastName: string, firstName: string }}
 */
function parseMemberName(rawName) {
    if (!rawName) return { rank: '', lastName: '', firstName: '' };

    const trimmed = rawName.trim();

    let rank = '';
    let nameStr = trimmed;

    // Extract leading rank abbreviation (2–5 uppercase letters followed by a space)
    const rankMatch = trimmed.match(RANK_RE);
    if (rankMatch) {
        rank = rankMatch[1];
        nameStr = trimmed.slice(rankMatch[0].length).trim();
    }

    // Parse "LastName, FirstName" (comma-separated format from OI dashboard)
    const commaIdx = nameStr.indexOf(',');
    if (commaIdx !== -1) {
        return {
            rank,
            lastName: nameStr.slice(0, commaIdx).trim(),
            firstName: nameStr.slice(commaIdx + 1).trim(),
        };
    }

    // Fallback for space-separated "LastName FirstName" (no comma)
    const parts = nameStr.split(/\s+/);
    return {
        rank,
        lastName: parts[0] || '',
        firstName: parts.slice(1).join(' ') || '',
    };
}

module.exports = { parseMemberName };
