/**
 * Generates a sanitised demo copy of fenz.db → fenz_demo.db
 *
 * What it does:
 *  - Preserves each member's rank prefix (SO, SFF, QFF, FF, RFF …)
 *  - Replaces surname + initial with a unique Star Wars character
 *  - Replaces all member emails with <initial>.<lastname>@starwars.demo
 *  - Clears mobile and messengerId on every member
 *  - Mirrors the name/email replacements into email_history
 *  - Scrubs real emails from event_log security-event payloads
 *  - Replaces sender name and email in all notification templates (preferences)
 *  - Deletes all rows from: users, user_preferences, api_keys
 *
 * Usage:
 *   node scripts/generate-demo-db.js
 *
 * Output:
 *   fenz_demo.db  (in the project root — safe to commit/share)
 *
 * Scale guarantee:
 *   The character pool has 60 entries. If member count exceeds that, overflow
 *   members receive a numeric suffix (e.g. "Kenobi2, O") so all names remain
 *   unique regardless of brigade size.
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const { open } = require('sqlite');
const sqlite3  = require('sqlite3');

const ROOT      = path.join(__dirname, '..');
const SOURCE_DB = path.join(ROOT, 'fenz.db');
const DEST_DB   = path.join(ROOT, 'fenz_demo.db');

// Sender identity used in all notification templates
const DEMO_SENDER_NAME  = 'Rebel Alliance Training';
const DEMO_SENDER_EMAIL = 'training@rebels.starwars.demo';
const DEMO_SENDER_FULL  = `${DEMO_SENDER_NAME} <${DEMO_SENDER_EMAIL}>`;

// ---------------------------------------------------------------------------
// Star Wars character pool  { last, initial }
// All (last, initial) pairs are unique → unique emails guaranteed within pool.
// ---------------------------------------------------------------------------
const SW_POOL = [
  // From demo_osm_dasboard.html
  { last: 'Kenobi',      initial: 'O' },
  { last: 'Organa',      initial: 'L' },
  { last: 'Skywalker',   initial: 'L' },
  { last: 'Solo',        initial: 'H' },
  { last: 'Vader',       initial: 'D' },
  { last: 'Yoda',        initial: 'M' },
  { last: 'Calrissian',  initial: 'L' },
  { last: 'Dameron',     initial: 'P' },
  { last: 'Erso',        initial: 'J' },
  { last: 'Tano',        initial: 'A' },
  { last: 'Ackbar',      initial: 'G' },
  { last: 'Fett',        initial: 'B' },
  { last: 'Palpatine',   initial: 'S' },
  { last: 'Windu',       initial: 'M' },
  // Prequel era
  { last: 'Dooku',       initial: 'C' },
  { last: 'Maul',        initial: 'D' },
  { last: 'Jinn',        initial: 'Q' },
  { last: 'Amidala',     initial: 'P' },
  { last: 'Offee',       initial: 'B' },
  { last: 'Secura',      initial: 'A' },
  { last: 'Unduli',      initial: 'L' },
  { last: 'Gallia',      initial: 'A' },
  { last: 'Koon',        initial: 'P' },
  { last: 'Mundi',       initial: 'K' },
  { last: 'Fisto',       initial: 'K' },
  { last: 'Billaba',     initial: 'D' },
  { last: 'Wesell',      initial: 'Z' },
  { last: 'Ventress',    initial: 'A' },
  { last: 'Sing',        initial: 'A' },
  { last: 'Grievous',    initial: 'G' },
  { last: 'Mereel',      initial: 'J' },
  { last: 'Fett',        initial: 'J' },
  // Rebels era
  { last: 'Bridger',     initial: 'E' },
  { last: 'Syndulla',    initial: 'H' },
  { last: 'Rex',         initial: 'C' },
  { last: 'Wren',        initial: 'S' },
  { last: 'Jarrus',      initial: 'K' },
  { last: 'Bonteri',     initial: 'L' },
  { last: 'Kallus',      initial: 'A' },
  { last: 'Thrawn',      initial: 'M' },
  { last: 'Pryce',       initial: 'A' },
  // Mandalorian / Rogue One / Andor
  { last: 'Djarin',      initial: 'D' },
  { last: 'Kryze',       initial: 'B' },
  { last: 'Vizsla',      initial: 'P' },
  { last: 'Andor',       initial: 'C' },
  { last: 'Imwe',        initial: 'C' },
  { last: 'Malbus',      initial: 'B' },
  { last: 'Erso',        initial: 'G' },
  // Sequel era
  { last: 'Ren',         initial: 'K' },
  { last: 'Hux',         initial: 'A' },
  { last: 'Phasma',      initial: 'C' },
  { last: 'Tico',        initial: 'R' },
  { last: 'Holdo',       initial: 'A' },
  // Original era extras
  { last: 'Tarkin',      initial: 'W' },
  { last: 'Mothma',      initial: 'M' },
  { last: 'Piett',       initial: 'F' },
  { last: 'Veers',       initial: 'M' },
  { last: 'Lobot',       initial: 'L' },
  { last: 'Dodonna',     initial: 'J' },
  { last: 'Antilles',    initial: 'W' },
  { last: 'Porkins',     initial: 'J' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// "QFF Dassi, G"  →  "QFF"  (handles ranks like RFF, SFF, DCFO, etc.)
function extractRank(realName) {
  const m = realName.match(/^([A-Z]+)\s/);
  return m ? m[1] : 'FF';
}

// Build the demo name from the real rank + a pool character
// e.g. rank="QFF", char={last:"Solo", initial:"H"}  →  "QFF Solo, H"
function buildDemoName(rank, char, suffix = '') {
  return `${rank} ${char.last}${suffix}, ${char.initial}`;
}

// "QFF Solo, H"  →  "h.solo@starwars.demo"
function buildEmail(char, suffix = '') {
  const last = (char.last + suffix).toLowerCase();
  return `${char.initial.toLowerCase()}.${last}@starwars.demo`;
}

// Assign unique (char, suffix) pairs to each member index.
// First pass uses pool as-is; overflow rounds append "2", "3", etc.
function assignCharacter(index) {
  const poolSize = SW_POOL.length;
  const round    = Math.floor(index / poolSize);   // 0 = first pass (no suffix)
  const slot     = index % poolSize;
  const suffix   = round === 0 ? '' : String(round + 1);
  return { char: SW_POOL[slot], suffix };
}

// ---------------------------------------------------------------------------

async function main() {
  if (!fs.existsSync(SOURCE_DB)) {
    console.error(`Source database not found: ${SOURCE_DB}`);
    process.exit(1);
  }

  fs.copyFileSync(SOURCE_DB, DEST_DB);
  console.log(`Copied  fenz.db  →  fenz_demo.db`);

  const db = await open({ filename: DEST_DB, driver: sqlite3.Database });

  // -------------------------------------------------------------------------
  // 1. Read all members and build the mapping before any writes
  // -------------------------------------------------------------------------
  const members = await db.all('SELECT id, name FROM members ORDER BY id');

  if (members.length > SW_POOL.length) {
    console.warn(
      `Note: ${members.length} members exceed the pool size of ${SW_POOL.length}. ` +
      `Overflow members will receive a numeric suffix (e.g. "Kenobi2, O").`
    );
  }

  // real name  →  { demoName, demoEmail }
  const nameMap = new Map();
  // member id  →  { demoName, demoEmail }
  const idMap   = new Map();

  members.forEach((m, i) => {
    const rank          = extractRank(m.name);
    const { char, suffix } = assignCharacter(i);
    const dn            = buildDemoName(rank, char, suffix);
    const de            = buildEmail(char, suffix);
    nameMap.set(m.name, { dn, de });
    idMap.set(m.id,     { dn, de });
  });

  // -------------------------------------------------------------------------
  // 2. Update members
  // -------------------------------------------------------------------------
  for (const [id, { dn, de }] of idMap) {
    await db.run(
      `UPDATE members SET name = ?, email = ?, mobile = NULL, messengerId = NULL WHERE id = ?`,
      [dn, de, id]
    );
  }
  console.log(`Updated  ${idMap.size} members  (name, email, mobile cleared)`);

  // -------------------------------------------------------------------------
  // 3. Update email_history — match on recipient_name
  // -------------------------------------------------------------------------
  let emailHistoryUpdated = 0;
  for (const [realName, { dn, de }] of nameMap) {
    const result = await db.run(
      `UPDATE email_history SET recipient_name = ?, recipient_email = ? WHERE recipient_name = ?`,
      [dn, de, realName]
    );
    emailHistoryUpdated += result.changes ?? 0;
  }
  console.log(`Updated  ${emailHistoryUpdated} email_history rows`);

  // -------------------------------------------------------------------------
  // 4. Scrub event_log security payloads (userEmail field)
  // -------------------------------------------------------------------------
  const securityEvents = await db.all(
    `SELECT id, payload FROM event_log WHERE event_type = 'Security' AND payload LIKE '%userEmail%'`
  );
  let eventLogUpdated = 0;
  for (const row of securityEvents) {
    try {
      const p = JSON.parse(row.payload);
      if (p.userEmail && p.userEmail !== 'admin') {
        p.userEmail = 'demo@starwars.demo';
        await db.run(`UPDATE event_log SET payload = ? WHERE id = ?`, [JSON.stringify(p), row.id]);
        eventLogUpdated++;
      }
    } catch {
      // skip unparseable rows
    }
  }
  console.log(`Scrubbed ${eventLogUpdated} event_log security payloads`);

  // -------------------------------------------------------------------------
  // 5. Sanitise notification templates in preferences
  //    The stored values are JSON-serialised strings, so we do a plain-text
  //    replace on the raw column value — no double-parse needed.
  // -------------------------------------------------------------------------
  const prefRows = await db.all(
    `SELECT key, value FROM preferences WHERE value LIKE '%@%' OR value LIKE '%Training Manager%'`
  );
  let prefsUpdated = 0;
  for (const row of prefRows) {
    // Collect every real email-like token that appears in this value
    const realEmails = [...new Set(
      (row.value.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [])
        .filter(e => !e.endsWith('@starwars.demo') && e !== DEMO_SENDER_EMAIL)
    )];

    let updated = row.value;

    // Replace the full "Name <email>" sender string first (most specific)
    updated = updated.replace(/[^"<\n]*Training Manager[^>]*<[^>]+>/g, DEMO_SENDER_FULL);

    // Replace any remaining real email addresses
    for (const email of realEmails) {
      updated = updated.split(email).join(DEMO_SENDER_EMAIL);
    }

    if (updated !== row.value) {
      await db.run(`UPDATE preferences SET value = ? WHERE key = ?`, [updated, row.key]);
      prefsUpdated++;
    }
  }
  console.log(`Updated  ${prefsUpdated} preference rows  (sender name/email replaced)`);

  // -------------------------------------------------------------------------
  // 6. Delete users, user_preferences, api_keys
  // -------------------------------------------------------------------------
  const { changes: usersDeleted }   = await db.run(`DELETE FROM users`);
  const { changes: prefsDeleted }   = await db.run(`DELETE FROM user_preferences`);
  const { changes: apiKeysDeleted } = await db.run(`DELETE FROM api_keys`);
  console.log(`Deleted  ${usersDeleted} users,  ${prefsDeleted} user_preferences,  ${apiKeysDeleted} api_keys`);

  // -------------------------------------------------------------------------
  // 6. Vacuum
  // -------------------------------------------------------------------------
  await db.run(`VACUUM`);
  console.log(`VACUUM complete`);

  await db.close();

  const sizeMB = (fs.statSync(DEST_DB).size / 1024 / 1024).toFixed(2);
  console.log(`\nDone.  fenz_demo.db  is ready  (${sizeMB} MB)`);

  console.log('\nMember mapping applied:');
  members.forEach(m => {
    const { dn, de } = idMap.get(m.id);
    console.log(`  [${m.id}] ${m.name.padEnd(32)} →  ${dn.padEnd(24)}  ${de}`);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
