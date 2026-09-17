# Scripts

Standalone utility scripts for the OpReady project. Run from the project root unless stated otherwise.

## ⚠️ Docker users — WAL mode conflicts

When the app runs via Docker Compose it holds `fenz.db` open in WAL mode from within Linux. **Any external process that opens the same file from Windows** leaves an incompatible WAL shared-memory (`.shm`) state behind, causing `SQLITE_IOERR: disk I/O error` on the next Docker startup.

**Two common sources of this conflict:**

| Source | How it conflicts |
|---|---|
| Running scripts directly (`node scripts/...`) on the Windows host | Opens the DB with the Windows SQLite3 binding — different WAL context from Linux |
| Database GUI tools (DBeaver, DB Browser for SQLite, TablePlus, etc.) | Keep a persistent SQLite connection open; close the connection or disconnect before restarting Docker |

**Always run scripts through the container:**

```powershell
docker-compose exec opready node scripts/<script-name>.js
# or
docker-compose exec opready npm run <script-name>
```

**If Docker fails to start with `SQLITE_IOERR` after using a DB tool:**
1. Close / disconnect the DB tool from `fenz.db`
2. Restart Docker Compose — the server's WAL mode guard will recover automatically

---

## release.js

Reads the current version from `package.json`, creates a Git tag, pushes it to origin, and creates a GitHub Release. Version and `versionDate` are managed by the developer in `package.json` before running this script.

**npm shortcut**

```powershell
npm run release
```

**Direct invocation**

```powershell
node scripts/release.js
```

**Prerequisites**

- `package.json` must already contain the correct `version` (e.g. `3.2.9`) — update it and commit before running.
- Working tree must be clean (no uncommitted changes).
- You must have `git push` rights to origin.
- [GitHub CLI (`gh`)](https://cli.github.com/) must be installed and authenticated (`gh auth login`) for the GitHub Release step. If `gh` is not available the script still tags and pushes; it prints the manual release URL instead.
- No npm dependencies beyond Node.js built-ins (`readline`, `fs`, `path`, `child_process`).

**What it does**

1. Reads `version` from `package.json` and derives the tag name (`v3.2.9`).
2. Checks that the working tree is clean. If the tag already exists locally, prints a warning and skips creation — the script continues rather than aborting.
3. Determines the commit range by querying `gh release list` for the most recent published GitHub release (skipping the current tag if it already has one). Falls back to `git describe --tags` only when `gh` is unavailable or no releases exist yet. Prints a numbered list of every commit — subject line and full body — since that release tag.
4. Asks for confirmation before making any changes.
5. Optionally accepts custom release notes (press Enter to use the full commit messages collected in step 3).
6. Creates the Git tag locally (skipped if it already existed).
7. Pushes the tag to origin. If the push fails and the tag was pre-existing (likely already on remote), warns and continues. If the push fails for a freshly created tag, removes the local tag and aborts.
8. Checks whether a GitHub Release for the tag already exists. If it does, prints a warning and exits cleanly.
9. Builds release notes: custom notes if entered as-is; otherwise commits are grouped by conventional-commit type (feat → ✨ Features, fix → 🐛 Bug Fixes, etc.) with the type prefix bolded, commit bodies indented beneath their bullet, and a **Full Changelog** compare link appended. Notes are written to a temp file and passed via `--notes-file`.
10. Runs `gh release create vX.Y.Z --notes-file .release-notes.tmp`.
11. Prints the GitHub Release URL on success.

**Tag format**

Tags are created as `v{major}.{minor}.{patch}` (e.g. `v3.2.9`). The GitHub Releases API used by the About modal looks up this exact tag, so the format must not be changed.

**Output**

```
──────────────────────────────────
 OpReady Release Script
──────────────────────────────────
Version : 3.2.9  →  tag: v3.2.9

Commits in this release — since v3.2.8 (3):
──────────────────────────────────────────────────
  1. feat: add skill verification export

     Adds a CSV export button to the verification
     history report view.

  2. fix: correct date formatting in reports

  3. chore: bump dependencies
──────────────────────────────────────────────────

Release v3.2.9? (y/N): y

Release notes (press Enter to include all commit messages in full):
>

Creating tag v3.2.9 ...
Pushing tag to origin ...
Creating GitHub release ...

✔  Release published: https://github.com/dassige/OSM/releases/tag/v3.2.9

Done.
```

**Generated release notes structure** (when custom notes are not entered):

```markdown
## OpReady v3.2.9

### ✨ Features

- **ai-service:** Refactor prompt structure to enhance security against injection attacks
- Add skill verification export

  Adds a CSV export button to the verification history report view.

### 🐛 Bug Fixes

- **backup:** Update allowed SQL statement prefixes to enhance security
- Correct date formatting in reports

### 🔧 Maintenance

- Bump dependencies

---

**Full Changelog**: https://github.com/dassige/OSM/compare/v3.2.8...v3.2.9
```

The `feat:` / `fix:` / `chore:` prefix is stripped from every bullet — the section heading already carries that information. If the commit has a scope (e.g. `feat(ai-service):`), it is kept as a bold prefix (`**ai-service:**`). The description is capitalised. Breaking changes are flagged with ⚠️ **Breaking:**. Commits are grouped in this order: Features → Bug Fixes → Performance → Refactoring → Documentation → Tests → Maintenance → CI/CD → Build → Reverts → Other Changes. Commits that do not follow the conventional-commit prefix convention are placed in **Other Changes**.

**Error cases**

| Condition | Behaviour |
|---|---|
| Dirty working tree | Aborts before touching anything |
| Tag already exists (local) | Warns and skips tag creation; continues to push and release steps |
| `git push` fails (new tag) | Removes the local tag and aborts with the git error |
| `git push` fails (pre-existing tag) | Warns (likely already on remote) and continues to release step |
| GitHub Release already exists | Warns and exits cleanly — no duplicate release is created |
| `gh` not installed | Skips GitHub Release, prints the manual creation URL |
| `gh release create` fails | Warns and prints the manual creation URL; tag is already pushed |

---

## setup-env.js

Parses `.example.env` and serves a local web form for configuring environment variables. Variables are grouped by section, each showing the key name, a value input, an enable/disable checkbox, and the description from `.example.env`. The footer bar has three actions:

> **`APP_MODE` dropdown** renders three options: `production` (default — live DB, HTTPS required), `development` (live DB, HTTP allowed for local use without a TLS proxy), and `demo` (sandboxed DB, demo credentials, all destructive actions blocked). Select `development` when running the app on a local laptop without a TLS-terminating reverse proxy.

- **Load .env** — opens a file picker; the selected `.env` file is read client-side, its values are applied to all matching form fields, and any row that received a value from the file is highlighted with a teal left border so you can see at a glance what the loaded file contained.
- **Generate .env File** — writes the current form state to `.generated.env` in the project root (existing behaviour).
- **Save to .env** — appears after a file is loaded; writes the current form state directly to `.env` in the project root (overwrites it).

**npm shortcut**

```powershell
npm run setup-env
```

**Direct invocation**

```powershell
node scripts/setup-env.js
```

**`.example.env` convention**

The parser uses these four line types (anything else is ignored):

| Line pattern | Parsed as |
|---|---|
| `# text` | Free-form description comment — accumulated as the variable's help text in the web UI |
| `# Values: v1 \| v2 \| v3` | Dropdown values — drives the `<select>` for that variable; NOT added to the description text |
| `#KEY=value` | Disabled/optional variable (no space between `#` and the key) |
| `KEY=value` | Enabled variable |

**To make a variable render as a dropdown**, add a `# Values:` line directly above it:
```
# Description text here.
# Values: option1 | option2 | option3
MY_VARIABLE=option1
```

This means description prose can safely mention environment variable names like `COOKIE_SECURE` without being misinterpreted as a disabled variable declaration, as long as the line has a space after `#`.

**Prerequisites**

- `.example.env` must exist in the project root (it is committed to the repository).
- No npm dependencies beyond Node.js built-ins (`http`, `fs`, `path`, `child_process`).
- No running server needed — the tool starts its own HTTP server.

**What it does**

1. Parses `.example.env` into sections and variables (key, default value, enabled/disabled state, description).
2. If `.generated.env` already exists, pre-fills the form with those values. Falls back to `.env` if present, then to `.example.env` defaults.
3. Starts a local HTTP server on port **3088** and opens the form in your default browser automatically.
4. **Load .env** button (footer) — triggers a client-side file picker. The selected file is parsed in the browser; all matching variables have their values and enabled-state updated in the form, and each affected row gains a teal left-border highlight. The **Save to .env** button then becomes visible.
5. **Generate .env File** button — POSTs to `/generate`; writes the current form state to `.generated.env` in the project root.
6. **Save to .env** button (visible after Load) — POSTs to `/save-env`; writes the current form state directly to `.env` in the project root, overwriting it.

**Activating the generated file**

```powershell
# PowerShell
Copy-Item .generated.env .env

# Bash
cp .generated.env .env
```

Then restart the server for changes to take effect.

**Output**

`.generated.env` in the project root — a fully structured `.env`-format file with:
- Section headers matching `.example.env`
- Description comments above each variable
- Enabled variables as `KEY=value`
- Disabled variables as `#KEY=value` (no space after `#`)

**Port conflict**

If port 3088 is already in use the script exits with an error message. Stop the conflicting process and retry, or change `PORT` at the top of `scripts/setup-env.js`.

**Building a Windows standalone executable**

Run `npm run build:setup-env` — see [`build-setup-env.js`](#build-setup-envjs) below for full details.

---

## build-setup-env.js

Packages `setup-env.js` into a self-contained Windows `.exe` (no Node.js required on the target machine) and writes a companion plain-text instruction file alongside it.

**npm shortcut**

```powershell
npm run build:setup-env
```

**Direct invocation**

```powershell
node scripts/build-setup-env.js
```

**Prerequisites**

- `pkg` dev dependency must be installed (`npm install` covers it).
- No other dependencies beyond Node.js built-ins.

**What it does**

1. Reads `version` from `package.json` and derives the output base name (e.g. `setup-env-3.7.8`).
2. Runs `pkg` to bundle `scripts/setup-env.js` with the Node.js 18 runtime into `dist/setup-env-<version>.exe`.
3. Writes `dist/setup-env-<version>.txt` — a plain-text quick-start guide containing copy-paste instructions for end users.

**Output**

| File | Description |
|---|---|
| `dist/setup-env-<version>.exe` | ~36 MB self-contained Windows executable |
| `dist/setup-env-<version>.txt` | Plain-text instructions for the end user |

Distribute both files together. The end user places them in the same folder as `.example.env` and runs the `.exe`.

The `dist/` folder is gitignored — neither file is committed to the repository.

---

## take-screenshots.js

Launches a headless Chromium browser, logs in, visits every page of the app, and saves full-page PNG screenshots to an output folder.

**npm shortcut**

```powershell
npm run screenshots
```

**Direct invocation**

```powershell
node scripts/take-screenshots.js
```

**Prerequisites**

- The target server must already be running before the script is started.
- Playwright (`@playwright/test`) must be installed — it is a dev dependency of this project.

**Environment variables**

| Variable | Default | Description |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | Base URL of the running server |
| `SCREENSHOT_USER` | `demo` | Login username |
| `SCREENSHOT_PASS` | `demo` | Login password |
| `OUT_DIR` | `screenshots` | Output folder (created if it does not exist) |
| `VIEWPORT_W` | `1440` | Browser viewport width in pixels |
| `VIEWPORT_H` | `900` | Browser viewport height in pixels |
| `FULL_PAGE` | `true` | Set to `false` to capture the viewport only instead of the full page |

**Examples**

```powershell
# Against the local dev server with default admin credentials
npm run screenshots

# Against a demo server running on port 3099
$env:BASE_URL="http://localhost:3099"; $env:SCREENSHOT_USER="demo"; $env:SCREENSHOT_PASS="demo"; npm run screenshots

# Viewport-only screenshots saved to a custom folder
$env:OUT_DIR="shots-viewport"; $env:FULL_PAGE="false"; npm run screenshots

# Against a remote UAT environment
$env:BASE_URL="https://uat.opready.example.com"; $env:SCREENSHOT_USER="admin"; $env:SCREENSHOT_PASS="secret"; npm run screenshots
```

**Output**

One PNG per page, saved to `OUT_DIR` with a numeric prefix so they sort in navigation order:

```
screenshots/
  00-login.png
  01-members.png
  02-skills.png
  03-forms-manage.png
  04-live-forms.png
  05-live-surveys.png
  06-surveys-manage.png
  07-surveys-results.png
  08-surveys-tracking.png
  09-reports.png
  10-statistics.png
  11-training-planner.png
  12-event-log.png
  13-templates.png
  14-third-parties.png
  15-users.png
  16-system-tools.png
  17-profile.png
```

The script exits with code `1` if any page fails; all other pages are still attempted.

---

## guide-builder/ (PDF feature guides)

A reusable framework for generating full PDF user guides — cover page, table of contents, written sections, and real screenshots captured by driving the actual app with Playwright. Currently has one guide (Quiz Games); see `.claude/skills/pdf-guide-builder/SKILL.md` for how to add another.

**npm shortcut**

```powershell
npm run guide:quiz
```

**Direct invocation**

```powershell
node scripts/guide-builder/build-quiz-guide.js
```

**Prerequisites**

- `demo.db` must exist at the project root (`npm run generate-demo-db` creates it) — the guide builder copies it to a scratch file and never touches the original.
- Playwright (`@playwright/test`) must be installed — it is a dev dependency of this project.
- Nothing else needs to be running — the script starts and stops its own disposable server instance.

**What it does**

1. Copies `demo.db` to a scratch file under the OS temp directory and seeds the two example quiz games into it if not already present (same idempotent logic as `generate-demo-db.js`) — the real `demo.db` and `fenz.db` are never opened for writing.
2. Starts a disposable `node server.js` instance on `APP_MODE=development` (not `demo`) pointed at that scratch DB, on port 3098 by default — `development` mode is required because the demo-mode guard blocks Start Single/Teams and live hosting, which this guide must actually exercise. SMTP is pointed at an invalid host so any invitation-email attempt fails harmlessly.
3. Drives the real UI with Playwright, as an admin (desktop viewport) and as two mobile players/teams (`devices['iPhone 13']`), through the full Quiz Games lifecycle — creating games, starting a Single session, starting a Team session, hosting a live Timed round question-by-question, and playing both a Timed team round and a self-paced Score quiz to completion — saving a screenshot at each step.
4. Renders those screenshots plus written guide content (in `quiz/content.js`) into a single PDF via Playwright's own print pipeline (`lib/pdf-renderer.js`) — no PDF library dependency.
5. Shuts down the scratch server and deletes the scratch DB.

**Structure**

```
scripts/guide-builder/
  lib/
    prepare-db.js     — scratch DB copy + quiz-game seeding
    demo-server.js    — disposable server.js bootstrap/teardown
    guide-html.js     — shared branding, cover page, section/figure HTML helpers
    pdf-renderer.js   — HTML → PDF via a headless Chromium page.pdf()
  quiz/
    capture.js        — Playwright walkthrough + screenshot capture for the Quiz feature
    content.js         — written guide content for the Quiz feature
  build-quiz-guide.js  — orchestrates the above for the Quiz guide
  output/              — gitignored: scratch DB copy, screenshots, working files
```

**Environment variables**

| Variable | Default | Description |
|---|---|---|
| `GUIDE_BUILDER_PORT` | `3098` | Port for the disposable capture server |

**Output**

`docs/guides/OpReady-Quiz-Feature-Guide.pdf` (committed to the repo — regenerate and commit again whenever the Quiz feature's UI changes materially). Intermediate screenshots live under `scripts/guide-builder/output/` and are not committed.

---

## generate-demo-db.js

Creates a sanitised demo copy of `fenz.db` → `fenz_demo.db` in the project root. Safe to share or commit as sample data.

**npm shortcut**

```powershell
npm run generate-demo-db
```

**Direct invocation**

```powershell
node scripts/generate-demo-db.js
```

**Prerequisites**

- `fenz.db` must exist in the project root (the live database).
- `sqlite` and `sqlite3` npm packages must be installed — they are regular dependencies of this project.
- No environment variables required — the script takes no inputs.

**What it does**

| Step | Table(s) affected | Action |
|---|---|---|
| 1 | `members` | Preserves each member's rank prefix (SO, SFF, QFF, FF, RFF …), replaces surname and initial with a unique Star Wars character, generates `<initial>.<lastname>@starwars.demo` email, clears `mobile` and `messengerId`. Also writes demo values into the ETL fields (`rank`, `first_name`, `last_name`) and clears `member_osm_id` |
| 2 | `email_history` | Mirrors the same name and email replacements, matched by `recipient_name` |
| 3 | `event_log` | Replaces real email addresses found in `Security` event payloads with `demo@starwars.demo` |
| 4 | `preferences` | Replaces the sender name and email in all notification templates with `Rebel Alliance Training <training@rebels.starwars.demo>` |
| 5 | `quiz_games` | Seeds the example games from `examples/quiz/` (skipped if `quiz_games` is already non-empty — idempotent). No sessions/teams are seeded — Start Single/Teams stay blocked in demo mode, so these games are look-but-don't-play via Preview/Test only |
| 6 | `users` | Deletes all rows |
| 7 | `user_preferences` | Deletes all rows |
| 8 | `api_keys` | Deletes all rows |
| 9 | *(all tables)* | Runs `VACUUM` to compact the file |

**Name assignment**

The character pool is parsed at runtime from `public/demo/demo_osm_dasboard.html` — the same file the demo mode dashboard serves. Unique member names are extracted in order of first appearance (currently 15 characters: Skywalker, Solo, Kenobi, …). Each real member is assigned one pool entry by DB insertion order, so the mapping is stable across runs as long as the set of members does not change. The assigned demo name, including its rank prefix, is used verbatim — the real member's rank is not preserved — ensuring the demo DB is always consistent with the demo HTML.

If the brigade ever grows beyond the pool size, overflow entries receive a numeric suffix (e.g. `QFF Kenobi2, O` / `o.kenobi2@starwars.demo`) so all names and emails remain unique regardless of brigade size.

**Output**

`fenz_demo.db` in the project root. The script prints the full name mapping on completion so the substitution can be verified at a glance:

```
Member mapping applied:
  [44] SO Bandy, J          →  SO Kenobi, O      o.kenobi@starwars.demo
  [45] SO Brady, D P        →  SO Organa, L      l.organa@starwars.demo
  ...
```

The script is **non-destructive** to `fenz.db` — it copies it first and only modifies the copy. Re-running it overwrites any previous `fenz_demo.db`.

---

## sanitize-prod-copy.js

Sanitizes a copy of the production database before it is used to refresh a TEST/UAT/DEV environment, so the app running there can never send a real email or WhatsApp message to a real member or admin. Works on a raw SQLite file (`fenz.db`), an OpReady "DB-only SQL" export (the format produced by the Backup & Restore page / `services/db/backup.js` `generateSqlDump()`), or a "full backup" `.zip` (produced by `GET /system/backup` or `services/scheduled-backup-service.js`). In `.zip` mode only the `database.sql` entry inside the archive is rewritten — `manifest.json` and every `storage/knowledgebase/*` file are carried over byte-for-byte, so the sanitized zip restores the same way a real backup does via `POST /system/restore`.

**npm shortcut**

```powershell
npm run sanitize-prod-copy -- <input> <output> <email-domain> <mobile-number> [--env=CODE] [--force]
```

**Direct invocation**

```powershell
node scripts/sanitize-prod-copy.js <input> <output> <email-domain> <mobile-number> [--env=CODE] [--force]

# Or with no arguments at all to be prompted interactively for each value:
node scripts/sanitize-prod-copy.js
```

Leaving out any of the four required arguments (not just running with zero args) switches the whole run to interactive mode — the script prompts for each missing value, including `--env` and an overwrite confirmation if the output file already exists. The `--env` prompt lists the environment codes actually found in `keys/api-keys.env` (e.g. `[DEV/PRD/TST/UAT]`), derived from its `*_API_KEY` variable names. Non-interactive runs (all four args given on the command line) never prompt — an existing output file without `--force` fails immediately, so it's safe to use in CI/automation.

**Prerequisites**

- `sqlite` and `sqlite3` npm packages must be installed (regular dependencies of this project) — only used for `.db` mode.
- `archiver` and `unzipper` npm packages must be installed (regular dependencies of this project) — only used for `.zip` mode.
- No running server needed.
- `<input>` and `<output>` must be the same format: both `.db`, both `.sql`, or both `.zip` — the script does not convert between formats. Use the app's own Backup & Restore page first if you need to switch formats.

**Arguments**

| Argument | Description |
|---|---|
| `<input>` | Path to the source `.db`, `.sql`, or `.zip` file (a copy of production data). Never modified. |
| `<output>` | Path to write the sanitized result. May be the same path as `<input>` to sanitize in place (e.g. after `scp`/`rsync`-ing a prod copy onto a test server as `fenz.db`). |
| `<email-domain>` | Domain used for every generated member email (leading `@` optional). |
| `<mobile-number>` | Value written into every member's `mobile` column (same value for every member). |
| `--env=CODE` | Restore one working API key for destination environment `CODE` instead of deleting all of them — see below. |
| `--force` | Overwrite `<output>` if it already exists and differs from `<input>`. |

**What it changes**

| Table | Action |
|---|---|
| `members` | `email` → `<first-name>.<last-name>+info@<domain>`; `mobile` → `<mobile-number>`; `messengerId` → `NULL` (stored WhatsApp JID tied to the real number) |
| `users` | All rows deleted (admin/superadmin accounts) |
| `user_preferences` | All rows deleted (orphaned once `users` is emptied) |
| `api_keys` | All rows deleted — **unless `--env=CODE` is given**, in which case one row is restored (see below) |
| `email_history` | All rows deleted (log of real past sends to real addresses) |
| `event_log` | All rows deleted (audit payloads can embed member name/email/mobile per the Event Log convention) |
| `remote_backup_servers` | All rows deleted (holds a live API key + URL for another OpReady environment) |
| `remote_backup_log` | All rows deleted (references the rows above) |
| `surveys.created_by`, `survey_live.published_by`, `quiz_sessions.created_by`, `quiz_team_sessions.created_by` | Set to `NULL` (would otherwise dangle once the referenced `users` row is gone) |

Tables that don't exist yet in an older dump are skipped automatically (checked via `sqlite_master` in `.db` mode). In `.zip` mode the same table-level changes are applied to the embedded `database.sql`; `.zip` mode requires `database.sql` to be present in the archive (matching the same requirement the app's own restore route enforces) and errors out otherwise.

**`--env=CODE` — restoring a working API key instead of deleting them all**

`keys/api-keys.env` (gitignored, local-only — see the file itself) holds, per test environment: one raw API key (e.g. `UAT_BACKUP_API_KEY`, `DEV_TEST_API_KEY`) and that same environment's own HMAC secret as `<ENV>_API_KEY_HASH_SECRET` (e.g. `UAT_API_KEY_HASH_SECRET`, `DEV_API_KEY_HASH_SECRET`) — each environment has a different secret, matching its own `API_KEY_HASH_SECRET` (or `SESSION_SECRET`, its fallback — see `config.js`). `--env=UAT` finds the raw-key variable starting with `UAT_` and ending in `_API_KEY`, and the `UAT_API_KEY_HASH_SECRET` variable, then inserts a fresh `api_keys` row with `key_hash = HMAC-SHA256(rawKey, thatEnvironmentsSecret)` — the exact algorithm `hashKey()` in `services/db/api-keys.js` uses — so that raw key keeps authenticating once this sanitized copy is deployed to that environment. `key_prefix` and `role` (`superadmin`) are set the same way `generateApiKey()` does.

An unrecognised `--env`, or one missing its `<ENV>_API_KEY_HASH_SECRET`, fails fast (before any file is touched or written) with the list of environment variables actually found in `keys/api-keys.env`.

Never paste a live secret into a chat/terminal session with an AI assistant to fill these in — for an environment reachable via SSH, extract the value with a targeted, output-redirected command (e.g. `docker exec <container> sh -c 'printf "%s" "${API_KEY_HASH_SECRET:-$SESSION_SECRET}"' >> keys/api-keys.env`, appending directly to the file) so the value is never displayed or echoed back.

**Deliberately not touched** (residual, low-risk PII surface — see the header comment in the script for the full rationale)

- Free-text answer fields (`live_forms.form_submitted_data`, `survey_responses.submitted_data`, `quiz_players.submitted_data`) — a member could in theory type their own contact details into a free-text answer; not scrubbed because it would require unreliable text scanning.
- `preferences` notification template sender identity — organisational contact info, not personal member data.
- `sessions.db` — a **separate SQLite file** (the `connect-sqlite3` session store, not part of `fenz.db`). Don't copy it alongside the DB when refreshing an environment; if you do, run `DELETE FROM sessions` on it separately.
- `api_call_log` (`origin_ip`, `geo_location`) — operational telemetry, not member/user PII.
- `storage/knowledgebase/*` files inside a `.zip` backup — Knowledge Base documents (policies, training material), not member contact info; copied through unchanged.

**Output**

Prints a per-table summary of rows updated/deleted, then the path and size (`.db`/`.zip` mode) of the sanitized file. `.zip` mode also prints the count of knowledge-base files carried over unchanged. Exits with code `1` and the error on failure.

**Example**

```powershell
# Sanitize a prod copy already placed on the test server as fenz.db, in place
node scripts/sanitize-prod-copy.js fenz.db fenz.db test.opready.local +64000000000 --force

# Sanitize a "DB-only SQL" export into a new file
node scripts/sanitize-prod-copy.js prod-export.sql sanitized-import.sql uat.opready.local +64000000000

# Sanitize a full backup .zip (downloaded from GET /system/backup) into a new file
node scripts/sanitize-prod-copy.js prod-backup.zip sanitized-backup.zip uat.opready.local +64000000000

# Same, but restore a working UAT API key instead of deleting all of them
node scripts/sanitize-prod-copy.js prod-backup.zip sanitized-backup.zip uat.opready.local +64000000000 --env=UAT

# Interactive — prompts for input/output/domain/mobile/environment one at a time
node scripts/sanitize-prod-copy.js
```

---

## generate-icons.js

Generates all PWA icon PNG files (9 sizes) from `public/resources/favicon.png` and writes them to `public/icons/`. Run once after initial setup, and again any time the favicon is replaced.

**Direct invocation**

```powershell
node scripts/generate-icons.js
```

**Prerequisites**

- `sharp` npm package must be installed — it is a dev dependency of this project (`npm install` covers it).
- `public/resources/favicon.png` must exist (the source image).

**What it does**

Reads `public/resources/favicon.png` and produces the following files in `public/icons/`:

| File | Size | Purpose |
|---|---|---|
| `icon-72.png` | 72 × 72 | Android legacy |
| `icon-96.png` | 96 × 96 | Android legacy |
| `icon-128.png` | 128 × 128 | Chrome Web Store |
| `icon-144.png` | 144 × 144 | IE / Windows |
| `icon-152.png` | 152 × 152 | iOS legacy |
| `icon-192.png` | 192 × 192 | Android / Chrome (primary) |
| `icon-384.png` | 384 × 384 | Android splash |
| `icon-512.png` | 512 × 512 | Android / Chrome (large) |
| `icon-512-maskable.png` | 512 × 512 | Android adaptive icon (safe-zone padded) |

All icons use `#17A2B8` (brand teal) as the background for transparent areas. The script is **non-destructive** to the source file and will overwrite any previously generated icons.

---

## inject-pwa-tags.js

One-shot utility that injects PWA meta tags (`<link rel="manifest">`, `theme-color`, Apple web-app tags) and the `<script src="/js/pwa.js">` loader into every app HTML file. Idempotent — skips files already patched.

**Direct invocation**

```powershell
node scripts/inject-pwa-tags.js
```

**Prerequisites**

No npm dependencies beyond Node.js built-ins. The HTML files must exist in `public/`.

**What it does**

For each HTML file listed inside the script:
1. Detects whether the file has already been patched (looks for `href="/manifest.json"`); skips it if so.
2. Inserts the PWA meta block immediately after the `<link rel="icon">` tag (falls back to after `<meta name="viewport">` if the icon tag is absent).
3. Appends `<script src="/js/pwa.js"></script>` before `</body>`.

**Output**

Prints `PATCHED: <filename>` or `SKIP (already patched): <filename>` for every file processed, followed by a summary count. Files are written in-place.

> **Note:** This script was used once during initial PWA setup. It is kept for reference and can be re-run safely if new HTML pages are added without the PWA tags, but the normal workflow for new pages is to add the tags manually following the pattern in existing files.
