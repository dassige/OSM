/**
 * Sanitizes a copy of the production database before it is used to
 * refresh a TEST/UAT/DEV environment — so the app can never send a real
 * email or WhatsApp message to a real member while that environment is
 * being used for testing.
 *
 * Works on a raw SQLite file (fenz.db), an OpReady "DB-only SQL" export (the
 * format produced by services/db/backup.js generateSqlDump()), or a "full
 * backup" .zip (produced by GET /system/backup or the scheduled-backup
 * service — manifest.json + database.sql + storage/knowledgebase/*). Input
 * and output must be the same format — convert first via the app's own
 * Backup & Restore page if you need to switch formats.
 *
 * The .zip mode only rewrites the database.sql entry inside the archive
 * (using the exact same logic as .sql mode); manifest.json and every
 * storage/knowledgebase/* file are carried over byte-for-byte unchanged.
 *
 * What it changes:
 *  - members:               email -> <first-name>.<last-name>+info@<domain>
 *                            mobile -> <mobile-number> (same value for every member)
 *                            messengerId -> NULL (stored WhatsApp JID tied to the real number)
 *  - users:                  all rows deleted (admin/superadmin accounts)
 *  - user_preferences:       all rows deleted (orphaned once users are gone)
 *  - api_keys:               all rows deleted, UNLESS --env is given, in which case one
 *                            row is restored — see the --env section below
 *  - email_history:          all rows deleted (log of real past sends)
 *  - event_log:              all rows deleted (audit payloads can embed member
 *                            name/email/mobile per the Event Log convention)
 *  - remote_backup_servers:  all rows deleted (holds a live API key + URL for
 *                            another OpReady environment)
 *  - remote_backup_log:      all rows deleted (references the rows above)
 *  - surveys.created_by, survey_live.published_by, quiz_sessions.created_by,
 *    quiz_team_sessions.created_by: set to NULL (dangling references to the
 *    now-deleted users, so a later FK-enforced write doesn't fail)
 *
 * Deliberately NOT touched (see scripts/scripts.md for the reasoning):
 *  - Member/skill/form/survey/quiz structure and history (kept realistic for testing)
 *  - Free-text answer fields (live_forms.form_submitted_data, survey_responses.submitted_data,
 *    quiz_players.submitted_data) — not scrubbed; a member could in theory have typed
 *    their own contact details into a free-text answer
 *  - preferences (notification template sender identity) — organisational, not personal
 *  - sessions.db — a separate SQLite file (express-session store), not part of fenz.db;
 *    do not copy it alongside the DB, or run `DELETE FROM sessions` on it if you do
 *
 * Usage:
 *   node scripts/sanitize-prod-copy.js <input> <output> <email-domain> <mobile-number> [--env=CODE] [--force]
 *   node scripts/sanitize-prod-copy.js                                    (interactive — prompts for each value)
 *
 *   <input>          Path to the source .db, .sql, or .zip file (never modified)
 *   <output>         Path to write the sanitized result (same extension as <input>).
 *                    May be the same path as <input> to sanitize in place.
 *   <email-domain>   Domain used for every generated member email (leading '@' optional)
 *   <mobile-number>  Value written into every member's mobile column
 *   --env=CODE       Restore one working API key instead of deleting them all — see below
 *   --force          Overwrite <output> if it already exists (required when
 *                    <output> differs from <input> and already exists)
 *
 * Any of the four required arguments left out on the command line switches
 * the whole run to interactive mode: the script prompts for each missing
 * value (and for --env / overwrite confirmation) instead of failing.
 *
 * --env=CODE — restoring a working API key:
 *   keys/api-keys.env (gitignored) holds one raw API key per test
 *   environment (e.g. UAT_BACKUP_API_KEY, DEV_TEST_API_KEY) plus that same
 *   environment's own HMAC secret as <ENV>_API_KEY_HASH_SECRET (e.g.
 *   UAT_API_KEY_HASH_SECRET, DEV_API_KEY_HASH_SECRET) — each environment has
 *   a different secret. --env=UAT looks up the raw-key variable starting
 *   with "UAT_" and ending in "_API_KEY", and the UAT_API_KEY_HASH_SECRET
 *   variable, then inserts a fresh api_keys row with
 *   key_hash = HMAC-SHA256(rawKey, thatEnvironmentsSecret) — the exact
 *   algorithm services/db/api-keys.js hashKey() uses — so that raw key keeps
 *   authenticating once this sanitized copy is deployed to that environment.
 *
 * Examples:
 *   node scripts/sanitize-prod-copy.js fenz.db fenz.db test.opready.local +64000000000 --force
 *   node scripts/sanitize-prod-copy.js prod-backup.zip sanitized-backup.zip uat.opready.local +64000000000 --env=UAT
 */

'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const readline = require('readline');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const archiver = require('archiver');
const unzipper = require('unzipper');

// Local, gitignored file holding one raw API key per test environment plus
// the shared HMAC secret used to hash them — see keys/api-keys.env itself
// for the exact format. Only read when --env is used.
const KEYS_ENV_PATH = path.join(__dirname, '..', 'keys', 'api-keys.env');

const DELETE_ALL_TABLES = [
  'users',
  'user_preferences',
  'api_keys',
  'email_history',
  'event_log',
  'remote_backup_servers',
  'remote_backup_log',
];

const NULL_OUT_FK_COLUMNS = [
  { table: 'surveys', column: 'created_by' },
  { table: 'survey_live', column: 'published_by' },
  { table: 'quiz_sessions', column: 'created_by' },
  { table: 'quiz_team_sessions', column: 'created_by' },
];

// ---------------------------------------------------------------------------
// Shared member email derivation
// ---------------------------------------------------------------------------

function slugify(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

// Falls back to parsing the free-text `name` column ("RANK Lastname, F")
// when the ETL-populated first_name/last_name columns are empty.
function deriveFirstLast({ id, name, first_name, last_name }) {
  let first = first_name || '';
  let last = last_name || '';
  if (!first || !last) {
    const withoutRank = String(name || '').replace(/^[A-Z]{2,6}\s+/, '');
    const commaIdx = withoutRank.indexOf(',');
    if (commaIdx >= 0) {
      last = last || withoutRank.slice(0, commaIdx).trim();
      first = first || withoutRank.slice(commaIdx + 1).trim();
    } else {
      last = last || withoutRank.trim();
    }
  }
  return {
    first: slugify(first) || 'member',
    last: slugify(last) || String(id),
  };
}

// usedEmails is shared across all members processed in a single run so two
// members that resolve to the same slug (e.g. two "J Smith") don't collide.
function buildMemberEmail(row, domain, usedEmails) {
  const { first, last } = deriveFirstLast(row);
  let email = `${first}.${last}+info@${domain}`;
  if (usedEmails.has(email)) {
    email = `${first}.${last}${row.id}+info@${domain}`;
  }
  usedEmails.add(email);
  return email;
}

// ---------------------------------------------------------------------------
// --env support — restores one working api_keys row instead of deleting them
// all, so a raw key already used for testing keeps authenticating once the
// sanitized copy is deployed to that environment.
//
// key_hash is HMAC-SHA256(rawKey, apiKeyHashSecret) — see hashKey() in
// services/db/api-keys.js — so the raw key alone is not enough; the target
// environment's OWN apiKeyHashSecret (API_KEY_HASH_SECRET / SESSION_SECRET,
// config.js) is required too, and each environment has a different one.
// keys/api-keys.env stores one <ENV>_API_KEY_HASH_SECRET per environment
// alongside its <ENV>_..._API_KEY raw key.
// ---------------------------------------------------------------------------

function parseEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return result;
}

// Returns { envCode, matchedVar, prefix, hash } for the given environment
// code, or throws with a message listing what was actually found.
function resolveEnvironmentApiKey(envCode) {
  const vars = parseEnvFile(KEYS_ENV_PATH);
  const upper = envCode.toUpperCase();

  const isHashSecretVar = (k) => k.toUpperCase() === `${upper}_API_KEY_HASH_SECRET`;
  const isRawKeyVar = (k) =>
    !isHashSecretVar(k) && !k.toUpperCase().endsWith('_API_KEY_HASH_SECRET') &&
    k.toUpperCase().startsWith(`${upper}_`) && k.toUpperCase().endsWith('_API_KEY');

  const matchedVar = Object.keys(vars).find(isRawKeyVar);
  if (!matchedVar) {
    const available = listAvailableEnvironments();
    throw new Error(
      `No API key found for environment "${envCode}" in ${KEYS_ENV_PATH}. ` +
      `Available: ${available.length ? available.join(', ') : '(none found)'}`
    );
  }

  const secretVar = Object.keys(vars).find(isHashSecretVar);
  const secret = secretVar && vars[secretVar];
  if (!secret) {
    throw new Error(
      `${upper}_API_KEY_HASH_SECRET not set in ${KEYS_ENV_PATH} — add that environment's own ` +
      `API_KEY_HASH_SECRET (or SESSION_SECRET, its fallback) before using --env=${envCode}.`
    );
  }

  const rawKey = vars[matchedVar];
  const prefix = rawKey.substring(0, 12); // matches generateApiKey() in services/db/api-keys.js
  const hash = crypto.createHmac('sha256', secret).update(rawKey).digest('hex');
  return { envCode: upper, matchedVar, prefix, hash };
}

// Environment codes derived from every *_API_KEY variable (excluding
// *_API_KEY_HASH_SECRET) in keys/api-keys.env — e.g. "UAT_BACKUP_API_KEY"
// contributes "UAT". Used to hint valid --env values at the interactive
// prompt and to list what's actually available on a lookup failure.
function listAvailableEnvironments() {
  const vars = parseEnvFile(KEYS_ENV_PATH);
  const codes = new Set();
  for (const k of Object.keys(vars)) {
    const upper = k.toUpperCase();
    if (!upper.endsWith('_API_KEY') || upper.endsWith('_API_KEY_HASH_SECRET')) continue;
    const code = upper.split('_')[0];
    if (code) codes.add(code);
  }
  return [...codes].sort();
}

function apiKeyRestoreName(apiKeyRestore) {
  return `${apiKeyRestore.envCode} Test Key (restored by sanitize-prod-copy)`;
}

// ---------------------------------------------------------------------------
// .db mode
// ---------------------------------------------------------------------------

async function tableExists(db, name) {
  const row = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, name);
  return !!row;
}

async function sanitizeDbFile(inputPath, outputPath, domain, mobile, apiKeyRestore) {
  if (path.resolve(inputPath) !== path.resolve(outputPath)) {
    fs.copyFileSync(inputPath, outputPath);
  }

  const db = await open({ filename: outputPath, driver: sqlite3.Database });

  const members = await db.all('SELECT id, name, first_name, last_name FROM members ORDER BY id');
  const usedEmails = new Set();
  for (const member of members) {
    const email = buildMemberEmail(member, domain, usedEmails);
    await db.run(
      `UPDATE members SET email = ?, mobile = ?, messengerId = NULL WHERE id = ?`,
      [email, mobile, member.id]
    );
  }
  console.log(`Updated  ${members.length} members  (email, mobile, messengerId)`);

  for (const table of DELETE_ALL_TABLES) {
    if (!(await tableExists(db, table))) continue;
    const { changes } = await db.run(`DELETE FROM ${table}`);
    console.log(`Deleted  ${changes} row(s) from ${table}`);
  }

  if (apiKeyRestore && (await tableExists(db, 'api_keys'))) {
    await db.run(
      `INSERT INTO api_keys (name, key_prefix, key_hash, role, created_by, active) VALUES (?, ?, ?, 'superadmin', 'System', 1)`,
      [apiKeyRestoreName(apiKeyRestore), apiKeyRestore.prefix, apiKeyRestore.hash]
    );
    console.log(`Restored api_keys row for "${apiKeyRestore.envCode}" (matched ${apiKeyRestore.matchedVar} in keys/api-keys.env)`);
  }

  for (const { table, column } of NULL_OUT_FK_COLUMNS) {
    if (!(await tableExists(db, table))) continue;
    const { changes } = await db.run(`UPDATE ${table} SET ${column} = NULL WHERE ${column} IS NOT NULL`);
    if (changes > 0) console.log(`Cleared  ${table}.${column} on ${changes} row(s)`);
  }

  await db.run('VACUUM');
  await db.close();

  const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
  console.log(`\nDone.  ${outputPath}  is ready  (${sizeMB} MB)`);
}

// ---------------------------------------------------------------------------
// .sql mode — operates on OpReady's own dump grammar (see
// services/db/backup.js generateSqlDump): one statement per line,
// `INSERT INTO "table" (col,col,...) VALUES (v,v,...);`, string values
// single-quoted with '' escaping, everything else emitted as a raw literal.
// ---------------------------------------------------------------------------

// Splits on a delimiter that appears outside single-quoted string literals
// (handling '' as an escaped quote), matching splitSqlStatements() in backup.js.
function splitOutsideQuotes(str, delimiter) {
  const parts = [];
  let current = '';
  let inString = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inString) {
      current += ch;
      if (ch === "'") {
        if (str[i + 1] === "'") {
          current += str[++i];
        } else {
          inString = false;
        }
      }
    } else if (ch === "'") {
      inString = true;
      current += ch;
    } else if (ch === delimiter) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function decodeSqlToken(token) {
  const t = token.trim();
  if (t === 'NULL') return null;
  if (/^'[\s\S]*'$/.test(t)) return t.slice(1, -1).replace(/''/g, "'");
  return t;
}

function encodeSqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

const INSERT_RE = /^INSERT INTO "([^"]+)" \(([^)]*)\) VALUES \(/;

function rewriteInsertStatement(stmt, domain, mobile, usedEmails) {
  const m = INSERT_RE.exec(stmt);
  if (!m) return stmt;

  const table = m[1];
  const cols = m[2].split(',').map((c) => c.trim());
  const valuesStr = stmt.slice(m[0].length, -1); // drop the statement's closing ')'
  const rawValues = splitOutsideQuotes(valuesStr, ',');

  if (DELETE_ALL_TABLES.includes(table)) return null; // drop the row entirely

  if (table === 'members') {
    const idIdx = cols.indexOf('id');
    const nameIdx = cols.indexOf('name');
    const firstIdx = cols.indexOf('first_name');
    const lastIdx = cols.indexOf('last_name');
    const emailIdx = cols.indexOf('email');
    const mobileIdx = cols.indexOf('mobile');
    const msgIdx = cols.indexOf('messengerId');

    const row = {
      id: idIdx >= 0 ? decodeSqlToken(rawValues[idIdx]) : null,
      name: nameIdx >= 0 ? decodeSqlToken(rawValues[nameIdx]) : '',
      first_name: firstIdx >= 0 ? decodeSqlToken(rawValues[firstIdx]) : '',
      last_name: lastIdx >= 0 ? decodeSqlToken(rawValues[lastIdx]) : '',
    };
    const email = buildMemberEmail(row, domain, usedEmails);

    if (emailIdx >= 0) rawValues[emailIdx] = encodeSqlValue(email);
    if (mobileIdx >= 0) rawValues[mobileIdx] = encodeSqlValue(mobile);
    if (msgIdx >= 0) rawValues[msgIdx] = 'NULL';
  } else {
    const fkEntry = NULL_OUT_FK_COLUMNS.find((e) => e.table === table);
    if (fkEntry) {
      const colIdx = cols.indexOf(fkEntry.column);
      if (colIdx >= 0) rawValues[colIdx] = 'NULL';
    }
  }

  return `INSERT INTO "${table}" (${cols.join(',')}) VALUES (${rawValues.join(',')})`;
}

function buildApiKeyInsertStatement(apiKeyRestore) {
  const cols = 'name,key_prefix,key_hash,role,created_by,active';
  const values = [
    encodeSqlValue(apiKeyRestoreName(apiKeyRestore)),
    encodeSqlValue(apiKeyRestore.prefix),
    encodeSqlValue(apiKeyRestore.hash),
    encodeSqlValue('superadmin'),
    encodeSqlValue('System'),
    '1',
  ].join(',');
  return `INSERT INTO "api_keys" (${cols}) VALUES (${values})`;
}

// Core transform, shared by .sql-file mode and the database.sql entry inside
// a .zip full backup. Operates purely on strings — no filesystem access.
function sanitizeSqlText(sql, domain, mobile, apiKeyRestore) {
  const statements = splitOutsideQuotes(sql, ';')
    .map((s) => s.trim())
    .filter(Boolean);

  const usedEmails = new Set();
  let membersUpdated = 0;
  let rowsDropped = 0;
  let sawCommit = false;

  const output = [];
  for (const stmt of statements) {
    if (INSERT_RE.test(stmt)) {
      const rewritten = rewriteInsertStatement(stmt, domain, mobile, usedEmails);
      if (rewritten === null) {
        rowsDropped++;
        continue;
      }
      if (rewritten.startsWith('INSERT INTO "members"')) membersUpdated++;
      output.push(rewritten);
    } else if (/^COMMIT$/i.test(stmt)) {
      sawCommit = true;
      if (apiKeyRestore) output.push(buildApiKeyInsertStatement(apiKeyRestore));
      output.push(stmt);
    } else {
      output.push(stmt);
    }
  }
  if (apiKeyRestore && !sawCommit) {
    output.push(buildApiKeyInsertStatement(apiKeyRestore));
  }

  return { sql: output.join(';\n') + ';\n', membersUpdated, rowsDropped };
}

function sanitizeSqlFile(inputPath, outputPath, domain, mobile, apiKeyRestore) {
  const sql = fs.readFileSync(inputPath, 'utf8');
  const result = sanitizeSqlText(sql, domain, mobile, apiKeyRestore);

  fs.writeFileSync(outputPath, result.sql, 'utf8');
  console.log(`Updated  ${result.membersUpdated} members  (email, mobile, messengerId)`);
  console.log(`Dropped  ${result.rowsDropped} row(s) from: ${DELETE_ALL_TABLES.join(', ')}`);
  if (apiKeyRestore) {
    console.log(`Restored api_keys row for "${apiKeyRestore.envCode}" (matched ${apiKeyRestore.matchedVar} in keys/api-keys.env)`);
  }
  console.log(`\nDone.  ${outputPath}  is ready`);
}

// ---------------------------------------------------------------------------
// .zip mode — a "full backup" as produced by GET /system/backup or
// services/scheduled-backup-service.js: manifest.json (optional) +
// database.sql (required) + storage/knowledgebase/* (optional). Mirrors the
// exact entry names the restore route (routes/api/system.js POST
// /system/restore) looks for, so a sanitized zip restores the same way a
// real backup does. Only database.sql is rewritten; every other entry is
// carried over byte-for-byte.
// ---------------------------------------------------------------------------

async function sanitizeZipFile(inputPath, outputPath, domain, mobile, apiKeyRestore) {
  const directory = await unzipper.Open.file(inputPath);

  const sqlEntry = directory.files.find((f) => f.path === 'database.sql');
  if (!sqlEntry) {
    throw new Error('Invalid backup file: database.sql not found in ZIP.');
  }
  const manifestEntry = directory.files.find((f) => f.path === 'manifest.json');
  const kbEntries = directory.files.filter(
    (f) => f.path.startsWith('storage/knowledgebase/') && f.type === 'File'
  );

  const sqlText = (await sqlEntry.buffer()).toString('utf8');
  const result = sanitizeSqlText(sqlText, domain, mobile, apiKeyRestore);

  // Write to a temp file first so sanitizing in place (input === output)
  // never truncates the archive we're still reading entries from.
  const tmpOutput = `${outputPath}.tmp-${process.pid}`;
  const out = fs.createWriteStream(tmpOutput);
  const archive = archiver('zip', { zlib: { level: 6 } });
  const done = new Promise((resolve, reject) => {
    out.on('close', resolve);
    out.on('error', reject);
    archive.on('error', reject);
  });
  archive.pipe(out);

  if (manifestEntry) {
    archive.append(await manifestEntry.buffer(), { name: 'manifest.json' });
  }
  archive.append(result.sql, { name: 'database.sql' });
  for (const entry of kbEntries) {
    archive.append(entry.stream(), { name: entry.path });
  }

  await archive.finalize();
  await done;

  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  fs.renameSync(tmpOutput, outputPath);

  console.log(`Updated  ${result.membersUpdated} members  (email, mobile, messengerId)`);
  console.log(`Dropped  ${result.rowsDropped} row(s) from: ${DELETE_ALL_TABLES.join(', ')}`);
  if (apiKeyRestore) {
    console.log(`Restored api_keys row for "${apiKeyRestore.envCode}" (matched ${apiKeyRestore.matchedVar} in keys/api-keys.env)`);
  }
  console.log(`Copied   ${kbEntries.length} knowledge-base file(s) unchanged`);
  console.log(`\nDone.  ${outputPath}  is ready`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

// Strips one layer of surrounding matching quotes — e.g. a path pasted from
// Windows Explorer's "Copy as path" ("C:\foo\bar.zip") or typed with quotes
// at an interactive prompt, where (unlike a shell) nothing strips them.
function stripQuotes(s) {
  const t = (s || '').trim();
  if (t.length >= 2 && ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function printUsageAndExit(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error(
    'Usage: node scripts/sanitize-prod-copy.js <input> <output> <email-domain> <mobile-number> [--env=CODE] [--force]\n' +
    'Run with no arguments to be prompted for each value interactively.'
  );
  process.exit(1);
}

// Node's readline.question() only reliably answers the FIRST of several
// sequential async/await questions when stdin is a non-TTY pipe (all
// buffered input is drained and emitted as 'line' events before later
// question() calls re-attach their listener, so those lines are lost —
// a well-known readline gotcha). Consuming lines through the interface's
// async iterator instead queues them properly and works for both a piped
// answer file and an interactive terminal.
function makeAsker(rl) {
  const it = rl[Symbol.asyncIterator]();
  return async (question) => {
    process.stdout.write(question);
    const { value, done } = await it.next();
    return done ? '' : value.trim();
  };
}

// Prompts for whatever wasn't already supplied on the command line.
async function runInteractivePrompts(current) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = makeAsker(rl);
  console.log('Interactive mode — press Enter to accept a default shown in [brackets].\n');

  const inputPath = stripQuotes(current.inputPath || (await ask('Input file (.db, .sql, or .zip): ')));
  const outputAnswer = await ask(`Output file [${current.outputPath || inputPath}]: `);
  const outputPath = stripQuotes(current.outputPath || outputAnswer || inputPath);
  const rawDomain = current.rawDomain || (await ask('Email domain for member addresses (e.g. test.opready.local): '));
  const mobile = current.mobile || (await ask('Mobile number for all members (e.g. +64000000000): '));

  let environment = current.environment;
  if (environment === undefined) {
    const available = listAvailableEnvironments();
    const hint = available.length ? ` [${available.join('/')}]` : '';
    environment = (await ask(`Destination environment to restore an API key for${hint} (blank = delete all API keys): `)) || undefined;
  }

  rl.close();
  return { inputPath, outputPath, rawDomain, mobile, environment };
}

async function confirmOverwrite(outputPath) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await makeAsker(rl)(`Output file already exists: ${outputPath} — overwrite? (y/N): `);
  rl.close();
  return /^y(es)?$/i.test(answer);
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const force = rawArgs.includes('--force');
  const envArg = rawArgs.find((a) => a.startsWith('--env='));
  let environment = envArg ? envArg.slice('--env='.length) || undefined : undefined;
  const positional = rawArgs.filter((a) => a !== '--force' && !a.startsWith('--env='));
  let [inputPath, outputPath, rawDomain, mobile] = positional;

  const interactive = !inputPath || !outputPath || !rawDomain || !mobile;
  if (interactive) {
    ({ inputPath, outputPath, rawDomain, mobile, environment } = await runInteractivePrompts({
      inputPath, outputPath, rawDomain, mobile, environment,
    }));
  }

  inputPath = stripQuotes(inputPath);
  outputPath = stripQuotes(outputPath);

  if (!inputPath || !outputPath || !rawDomain || !mobile) {
    printUsageAndExit('all four arguments are required');
  }
  if (!fs.existsSync(inputPath)) {
    printUsageAndExit(`input file not found: ${inputPath}`);
  }

  const inExt = path.extname(inputPath).toLowerCase();
  const outExt = path.extname(outputPath).toLowerCase();
  if (!['.db', '.sql', '.zip'].includes(inExt) || inExt !== outExt) {
    printUsageAndExit('<input> and <output> must be the same format: both .db, both .sql, or both .zip');
  }

  const samePath = path.resolve(inputPath) === path.resolve(outputPath);
  if (!samePath && fs.existsSync(outputPath) && !force) {
    if (!interactive || !(await confirmOverwrite(outputPath))) {
      printUsageAndExit(`output file already exists: ${outputPath} (pass --force to overwrite)`);
    }
  }

  const domain = rawDomain.replace(/^@/, '');

  // Resolved up front (before any file is touched) so a typo'd --env fails fast.
  const apiKeyRestore = environment ? resolveEnvironmentApiKey(environment) : null;
  if (apiKeyRestore) {
    console.log(`Will restore the "${apiKeyRestore.matchedVar}" API key for environment "${apiKeyRestore.envCode}"`);
  } else {
    console.log('No --env given — all API keys will be deleted.');
  }

  console.log(`Sanitizing ${inputPath} -> ${outputPath}`);
  console.log(`Email domain: ${domain}   Mobile: ${mobile}\n`);

  if (inExt === '.db') {
    await sanitizeDbFile(inputPath, outputPath, domain, mobile, apiKeyRestore);
  } else if (inExt === '.zip') {
    await sanitizeZipFile(inputPath, outputPath, domain, mobile, apiKeyRestore);
  } else {
    sanitizeSqlFile(inputPath, outputPath, domain, mobile, apiKeyRestore);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
