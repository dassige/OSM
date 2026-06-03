#!/usr/bin/env node
/**
 * backfill-etl-fields.js
 *
 * Populates the ETL enrichment columns added in migration 010 for all existing
 * members and skills rows using the html-scraper plugin's parsing logic.
 *
 * For members  : derives rank, first_name, last_name from the existing name
 *                column and sets member_osm_id = name (the raw OI name is the
 *                stable matching key for the html-scraper plugin).
 *
 * For skills   : sets skill_osm_id = name and derives skill_category from the
 *                same categorisation rules used by the html-scraper plugin.
 *
 * The member_osm_id / skill_osm_id values written here are what the extraction
 * engine will use in future to match incoming records to DB rows — so they must
 * exactly equal the values the active plugin produces as memberOsmId / skillOsmId.
 * For the html-scraper plugin that is always the raw name string.
 *
 * Usage:
 *   node scripts/backfill-etl-fields.js           # fills NULL rows only (safe to re-run)
 *   node scripts/backfill-etl-fields.js --force   # re-derives ALL rows (use after rule changes)
 *   npm run backfill-etl-fields
 */

'use strict';

const { parseMemberName }  = require('../services/plugins/name-parser');
const { categoriseSkill }  = require('../services/plugins/html-scraper.plugin');
const { initDB }           = require('../services/db/connection');

const FORCE = process.argv.includes('--force');

// ── helpers ───────────────────────────────────────────────────────────────────

function nullIfEmpty(str) {
    return (str && str.trim()) ? str.trim() : null;
}

function pad(str, len) {
    return String(str || '').padEnd(len);
}

// ── members backfill ──────────────────────────────────────────────────────────

async function backfillMembers(db) {
    const rows = await db.all(
        FORCE
            ? 'SELECT id, name FROM members ORDER BY id'
            : 'SELECT id, name FROM members WHERE member_osm_id IS NULL ORDER BY id'
    );

    if (rows.length === 0) {
        console.log('  (nothing to update)');
        return 0;
    }

    for (const m of rows) {
        const { rank, lastName, firstName } = parseMemberName(m.name);

        await db.run(
            `UPDATE members
             SET rank = ?, first_name = ?, last_name = ?, member_osm_id = ?
             WHERE id = ?`,
            [
                nullIfEmpty(rank),
                nullIfEmpty(firstName),
                nullIfEmpty(lastName),
                m.name,          // member_osm_id — raw name is the matching key
                m.id,
            ]
        );

        console.log(
            `  [${pad(m.id, 4)}] ${pad(m.name, 30)}` +
            `  rank=${pad(rank || '-', 6)}` +
            `  last=${pad(lastName || '-', 16)}` +
            `  first=${nullIfEmpty(firstName) || '-'}`
        );
    }

    return rows.length;
}

// ── skills backfill ───────────────────────────────────────────────────────────

async function backfillSkills(db) {
    const rows = await db.all(
        FORCE
            ? 'SELECT id, name FROM skills ORDER BY id'
            : 'SELECT id, name FROM skills WHERE skill_osm_id IS NULL ORDER BY id'
    );

    if (rows.length === 0) {
        console.log('  (nothing to update)');
        return 0;
    }

    for (const s of rows) {
        const category = categoriseSkill(s.name);

        await db.run(
            `UPDATE skills
             SET skill_osm_id = ?, skill_category = ?
             WHERE id = ?`,
            [
                s.name,          // skill_osm_id — raw skill name is the matching key
                category,
                s.id,
            ]
        );

        console.log(
            `  [${pad(s.id, 4)}] ${pad(s.name, 55)}` +
            `  category=${category}`
        );
    }

    return rows.length;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
    const mode = FORCE ? 'FORCE — re-deriving all rows' : 'default — filling NULL rows only (use --force to re-derive all)';
    console.log(`\n[backfill-etl-fields] ${mode}\n`);

    const db = await initDB();

    console.log('Members:');
    const memberCount = await backfillMembers(db);

    console.log('\nSkills:');
    const skillCount = await backfillSkills(db);

    console.log(`\n[backfill-etl-fields] Done — updated ${memberCount} member(s), ${skillCount} skill(s).`);
    process.exit(0);
}

main().catch((e) => {
    console.error('[backfill-etl-fields] ERROR:', e.message);
    process.exit(1);
});
