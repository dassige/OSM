// services/member-name-resolver.js
// Maps member names from sources that use full names (the pdf-report plugin:
// "Andrew Keith") onto member records (name "QFF Keith, A"), and skill names
// onto configured skills.
//
// Every consumer of extraction records (member-manager, report-service,
// statistics-service, member/skill sync) joins on the member's `name` and the
// skill's `name`, so resolved records are rewritten to carry the database
// values.  Unmatched records keep the source name and are flagged `unresolved`.
//
// A name is matched by, in order:
//   1. a saved link (member_source_aliases) — manual (admin) or auto (system)
//   2. an automatic match: exactly one member whose surname equals the end of the
//      name and whose first name (or initial) agrees with the start of it.
//      Members already linked to a different name are never auto-matched, and two
//      names pointing at the same member are both left for an admin to decide.

'use strict';

const db = require('./db');
const logger = require('./logger');
const { parseMemberName } = require('./plugins/name-parser');

const noop = () => {};

/** Comparison key: lower case, no accents, unified dashes/apostrophes, single spaces. */
function normaliseKey(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[‐-―−]/g, '-')
        .replace(/[‘’`´]/g, "'")
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

const isInitial = (key) => /^[a-z]\.?$/.test(key);

function memberNameKeys(member) {
    let last = member.last_name;
    let first = member.first_name;
    if (!last) {
        const parsed = parseMemberName(member.name);
        last = parsed.lastName;
        first = first || parsed.firstName;
    }
    return { last: normaliseKey(last), first: normaliseKey(first) };
}

/**
 * Members whose name agrees with a full source name.  Every split of the name
 * into given name + surname is tried, so compound surnames work.
 *
 * @returns {Array<{ member, givenName: string, exact: boolean }>}
 */
function findCandidates(sourceName, members) {
    const tokens = String(sourceName || '').trim().split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return [];
    const found = new Map();
    for (let k = 1; k < tokens.length; k++) {
        const givenName = tokens.slice(0, k).join(' ');
        const given = normaliseKey(givenName);
        const surname = normaliseKey(tokens.slice(k).join(' '));
        for (const member of members) {
            const keys = memberNameKeys(member);
            if (!keys.last || keys.last !== surname || !keys.first) continue;
            const exact = !isInitial(keys.first) && keys.first === given;
            if (exact || keys.first[0] === given[0]) {
                const prev = found.get(member.id);
                if (!prev || (exact && !prev.exact)) found.set(member.id, { member, givenName, exact });
            }
        }
    }
    return [...found.values()];
}

/**
 * Work out how each source name maps onto a member.  Pure — no database writes.
 *
 * @param {string[]} sourceNames
 * @param {object[]} members   rows from the members table
 * @param {object[]} aliases   rows from member_source_aliases
 * @returns {Map<string, { status: 'manual'|'auto'|'suggested'|'ambiguous'|'unmatched',
 *                         member: object|null, aliasId: number|null, givenName: string|null,
 *                         candidates: object[] }>}
 */
function analyseNames(sourceNames, members, aliases) {
    const memberById = new Map(members.map((m) => [m.id, m]));
    const aliasByKey = new Map(aliases.map((a) => [a.source_key, a]));
    const aliasKeysByMember = new Map();
    for (const a of aliases) {
        if (!aliasKeysByMember.has(a.member_id)) aliasKeysByMember.set(a.member_id, new Set());
        aliasKeysByMember.get(a.member_id).add(a.source_key);
    }
    const linkedToOtherName = (memberId, key) => [...(aliasKeysByMember.get(memberId) || [])].some((k) => k !== key);

    const results = new Map();
    for (const sourceName of sourceNames) {
        const key = normaliseKey(sourceName);
        const alias = aliasByKey.get(key);
        if (alias && memberById.has(alias.member_id)) {
            results.set(sourceName, {
                status: alias.match_type === 'manual' ? 'manual' : 'auto',
                member: memberById.get(alias.member_id), aliasId: alias.id, givenName: null, candidates: [],
            });
            continue;
        }

        const candidates = findCandidates(sourceName, members).filter((c) => !linkedToOtherName(c.member.id, key));
        let pick = null;
        if (candidates.length === 1) pick = candidates[0];
        else if (candidates.filter((c) => c.exact).length === 1) pick = candidates.find((c) => c.exact);

        results.set(sourceName, pick
            ? { status: 'suggested', member: pick.member, aliasId: null, givenName: pick.givenName, candidates: candidates.map((c) => c.member) }
            : { status: candidates.length ? 'ambiguous' : 'unmatched', member: null, aliasId: null, givenName: null, candidates: candidates.map((c) => c.member) });
    }

    // Two different names suggesting the same member cannot both be right.
    const suggestedBy = new Map();
    for (const [name, r] of results) {
        if (r.status !== 'suggested') continue;
        if (!suggestedBy.has(r.member.id)) suggestedBy.set(r.member.id, []);
        suggestedBy.get(r.member.id).push(name);
    }
    for (const names of suggestedBy.values()) {
        if (names.length < 2) continue;
        for (const name of names) {
            const r = results.get(name);
            results.set(name, { ...r, status: 'ambiguous', member: null, givenName: null, candidates: r.candidates.length ? r.candidates : [r.member] });
        }
    }
    return results;
}

/**
 * The given-name part of a source name for a member — the words before the
 * member's surname, or the first word when the surname does not match.
 */
function givenNameFor(sourceName, member) {
    const tokens = String(sourceName || '').trim().split(/\s+/).filter(Boolean);
    const { last } = memberNameKeys(member);
    for (let k = 1; k < tokens.length; k++) {
        if (normaliseKey(tokens.slice(k).join(' ')) === last) return tokens.slice(0, k).join(' ');
    }
    return tokens.length > 1 ? tokens[0] : '';
}

/**
 * The full first name worth storing on the member, or null to leave it alone.
 * Only blank or initial-only first names are replaced, and only when the
 * initial agrees — an existing full first name is never overwritten.
 */
function firstNameUpgrade(member, givenName) {
    const given = normaliseKey(givenName);
    if (!given || isInitial(given)) return null;
    const current = normaliseKey(member.first_name);
    if (!current) return givenName;
    if (isInitial(current) && current[0] === given[0]) return givenName;
    return null;
}

/** Store the full first name on a member when firstNameUpgrade() allows it. Returns the stored name or null. */
async function upgradeFirstName(member, givenName) {
    const firstName = firstNameUpgrade(member, givenName);
    if (!firstName) return null;
    await db.updateMemberFirstName(member.id, firstName);
    member.first_name = firstName;
    return firstName;
}

/**
 * Resolve extraction records onto members and skills.  Saves new automatic
 * matches (and upgrades first names) as a side effect.
 *
 * @param {Array} records   records with `sourceName` (pdf-report contract)
 * @param {object} [options]
 * @param {Function} [options.log]
 * @returns {Promise<{ records: Array, summary: { names: number, matched: number, unresolved: string[], autoMatched: number } }>}
 */
async function resolveRecords(records, { log = noop } = {}) {
    const [members, aliases, skills] = await Promise.all([
        db.getMembers(), db.getMemberSourceAliases(), db.getSkills(),
    ]);
    const sourceNames = [...new Set(records.map((r) => r.sourceName || r.name))];
    const analysis = analyseNames(sourceNames, members, aliases);

    let autoMatched = 0;
    for (const [sourceName, r] of analysis) {
        if (r.status !== 'suggested') continue;
        const created = await db.createAutoMemberSourceAlias({
            sourceName, sourceKey: normaliseKey(sourceName), memberId: r.member.id,
        });
        r.status = 'auto';
        if (!created) continue;   // matched concurrently by another request
        autoMatched++;
        const firstNameStored = await upgradeFirstName(r.member, r.givenName);
        await db.logEvent('System', 'Member', 'Member Name Matched Automatically', {
            sourceName, memberId: r.member.id, memberName: r.member.name, firstNameStored,
        });
        logger.info('[Name Matching] Member matched automatically', { memberId: r.member.id, firstNameStored: !!firstNameStored });
    }

    const skillByKey = new Map(skills.map((s) => [normaliseKey(s.name), s]));
    const resolved = records.map((rec) => {
        const out = { ...rec };
        const match = analysis.get(rec.sourceName || rec.name);
        if (match && match.member) {
            const m = match.member;
            out.name = m.name;
            out.memberId = m.id;
            out.memberOsmId = m.member_osm_id || m.name;
            out.rank = m.rank || '';
            out.lastName = m.last_name || rec.lastName;
            out.firstName = m.first_name || rec.firstName;
        } else {
            out.unresolved = true;
        }
        const skill = skillByKey.get(normaliseKey(rec.skill));
        if (skill) {
            out.skill = skill.name;
            out.skillOsmId = skill.skill_osm_id || skill.name;
        }
        return out;
    });

    const unresolved = sourceNames.filter((n) => !analysis.get(n).member);
    const matched = sourceNames.length - unresolved.length;
    log(`[pdf-report] Member names: ${matched} of ${sourceNames.length} matched` +
        (autoMatched ? ` (${autoMatched} newly matched automatically)` : '') +
        (unresolved.length ? ` — ${unresolved.length} need matching on the Skills Data Source page.` : '.'));
    return { records: resolved, summary: { names: sourceNames.length, matched, unresolved, autoMatched } };
}

module.exports = {
    normaliseKey,
    findCandidates,
    analyseNames,
    givenNameFor,
    firstNameUpgrade,
    upgradeFirstName,
    resolveRecords,
};
