/**
 * Generates a sanitised demo copy of fenz.db → fenz_demo.db
 *
 * What it does:
 *  - Reads the character pool from public/demo/demo_osm_dasboard.html (unique
 *    member names in appearance order) and maps each real member to one entry
 *  - Replaces each member's name, email, rank, first_name, last_name with the
 *    demo character's values; clears mobile, messengerId, and member_osm_id
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
 *   If member count exceeds the pool size, overflow members receive a numeric
 *   suffix (e.g. "Kenobi2, O") so all names remain unique regardless of brigade
 *   size. The pool size equals the number of unique members in the demo HTML.
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const { open } = require('sqlite');
const sqlite3  = require('sqlite3');

const ROOT      = path.join(__dirname, '..');
const SOURCE_DB = path.join(ROOT, 'fenz.db');
const DEST_DB   = path.join(ROOT, 'fenz_demo.db');
const DEMO_HTML = path.join(ROOT, 'public', 'demo', 'demo_osm_dasboard.html');

// Sender identity used in all notification templates
const DEMO_SENDER_NAME  = 'Rebel Alliance Training';
const DEMO_SENDER_EMAIL = 'training@rebels.starwars.demo';
const DEMO_SENDER_FULL  = `${DEMO_SENDER_NAME} <${DEMO_SENDER_EMAIL}>`;

// ---------------------------------------------------------------------------
// Parse unique member names from the demo OSM dashboard HTML in appearance
// order.  Returns: Array<{ rank, last, initial }>
// `initial` is '' for single-name members such as "SFF Chewbacca".
// ---------------------------------------------------------------------------
function parseDemoPool(html) {
  const seen = new Set();
  const pool = [];
  // Match the text inside <td style="background-color:...">  (member column)
  const re = /<td[^>]*>([A-Z]{2,}\s+[A-Z][a-z]+(?:,\s*[A-Z])?)\s*<\/td>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    if (seen.has(raw)) continue;
    seen.add(raw);
    const parts = raw.match(/^([A-Z]+)\s+([A-Za-z]+)(?:,\s*([A-Z]))?$/);
    if (!parts) continue;
    pool.push({ rank: parts[1], last: parts[2], initial: parts[3] || '' });
  }
  return pool;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Build the full demo name from a pool entry + optional overflow suffix.
//   { rank:"QFF", last:"Solo",      initial:"H" }, ''  →  "QFF Solo, H"
//   { rank:"SFF", last:"Chewbacca", initial:""  }, ''  →  "SFF Chewbacca"
function buildDemoName(char, suffix = '') {
  const last = char.last + suffix;
  return char.initial
    ? `${char.rank} ${last}, ${char.initial}`
    : `${char.rank} ${last}`;
}

// Build the demo email from a pool entry.
// Uses initial if present; falls back to first letter of last name.
//   { last:"Solo",      initial:"H" }  →  "h.solo@starwars.demo"
//   { last:"Chewbacca", initial:""  }  →  "c.chewbacca@starwars.demo"
function buildEmail(char, suffix = '') {
  const last    = (char.last + suffix).toLowerCase();
  const initial = (char.initial || char.last[0]).toLowerCase();
  return `${initial}.${last}@starwars.demo`;
}

// Assign unique (char, suffix) pairs to each member index.
// First pass uses pool as-is; overflow rounds append "2", "3", etc.
function assignCharacter(index, pool) {
  const poolSize = pool.length;
  const round    = Math.floor(index / poolSize);
  const slot     = index % poolSize;
  const suffix   = round === 0 ? '' : String(round + 1);
  return { char: pool[slot], suffix };
}

// ---------------------------------------------------------------------------

async function main() {
  // -------------------------------------------------------------------------
  // 0. Parse the demo character pool from the dashboard HTML
  // -------------------------------------------------------------------------
  if (!fs.existsSync(DEMO_HTML)) {
    console.error(`Demo HTML not found: ${DEMO_HTML}`);
    process.exit(1);
  }
  const pool = parseDemoPool(fs.readFileSync(DEMO_HTML, 'utf8'));
  if (pool.length === 0) {
    console.error('No member names parsed from demo HTML — aborting.');
    process.exit(1);
  }
  console.log(`Demo pool: ${pool.length} characters from ${path.relative(ROOT, DEMO_HTML)}`);

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

  if (members.length > pool.length) {
    console.warn(
      `Note: ${members.length} members exceed the pool size of ${pool.length}. ` +
      `Overflow members will receive a numeric suffix (e.g. "Kenobi2, O").`
    );
  }

  // real name  →  { demoName, demoEmail }
  const nameMap = new Map();
  // member id  →  { demoName, demoEmail, rank, firstName, lastName }
  const idMap   = new Map();

  members.forEach((m, i) => {
    const { char, suffix } = assignCharacter(i, pool);
    const dn        = buildDemoName(char, suffix);
    const de        = buildEmail(char, suffix);
    const firstName = char.initial ? char.initial : char.last[0].toUpperCase();
    const lastName  = char.last + suffix;
    nameMap.set(m.name, { dn, de });
    idMap.set(m.id,     { dn, de, rank: char.rank, firstName, lastName });
  });

  // -------------------------------------------------------------------------
  // 2. Update members
  // -------------------------------------------------------------------------
  for (const [id, { dn, de, rank, firstName, lastName }] of idMap) {
    await db.run(
      `UPDATE members
       SET name = ?, email = ?, mobile = NULL, messengerId = NULL,
           rank = ?, first_name = ?, last_name = ?, member_osm_id = NULL
       WHERE id = ?`,
      [dn, de, rank, firstName, lastName, id]
    );
  }
  console.log(`Updated  ${idMap.size} members  (name, email, mobile, ETL fields sanitised)`);

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
