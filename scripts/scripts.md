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
2. Checks that the working tree is clean and the tag does not already exist.
3. Asks for confirmation before making any changes.
4. Optionally accepts custom release notes (press Enter to auto-generate from commits via `gh --generate-notes`).
5. Creates the Git tag locally.
6. Pushes the tag to origin (rolls back the local tag if the push fails).
7. Runs `gh release create vX.Y.Z --generate-notes` (or `--notes-file` if custom notes were entered).
8. Prints the GitHub Release URL on success.

**Tag format**

Tags are created as `v{major}.{minor}.{patch}` (e.g. `v3.2.9`). The GitHub Releases API used by the About modal looks up this exact tag, so the format must not be changed.

**Output**

```
──────────────────────────────────
 OpReady Release Script
──────────────────────────────────
Version : 3.2.9  →  tag: v3.2.9

Release v3.2.9? (y/N): y

Release notes (press Enter to auto-generate from commits):
>

Creating tag v3.2.9 ...
Pushing tag to origin ...
Creating GitHub release ...

✔  Release published: https://github.com/dassige/OSM/releases/tag/v3.2.9

Done.
```

**Error cases**

| Condition | Behaviour |
|---|---|
| Dirty working tree | Aborts before touching anything |
| Tag already exists | Aborts before touching anything |
| `git push` fails | Removes the local tag and aborts with the git error |
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

## backfill-etl-fields.js

Populates the ETL enrichment columns (`rank`, `first_name`, `last_name`, `member_osm_id`, `skill_osm_id`, `skill_category`) added in migration 010 for all existing members and skills rows. Uses the same parsing and categorisation logic as the html-scraper plugin.

**npm shortcut**

```powershell
npm run backfill-etl-fields
```

**Direct invocation**

```powershell
# Fill only rows where member_osm_id / skill_osm_id are still NULL (default, safe to re-run)
node scripts/backfill-etl-fields.js

# Re-derive all rows — use after a categorisation rule change
node scripts/backfill-etl-fields.js --force
```

**Prerequisites**

- Migration `010-etl-plugin-fields.sql` must already be applied (happens automatically on server start).
- The server does not need to be running — the script opens the database directly.
- `sqlite` and `sqlite3` npm packages must be installed (regular project dependencies).

**What it does**

| Table | Columns written | Source |
|---|---|---|
| `members` | `rank`, `first_name`, `last_name` | Parsed from `name` via `parseMemberName()` |
| `members` | `member_osm_id` | Set to `name` exactly — this is the stable matching key between the extraction plugin and DB rows |
| `skills` | `skill_osm_id` | Set to `name` exactly — same matching-key principle |
| `skills` | `skill_category` | Derived from `name` via `categoriseSkill()` (html-scraper plugin rules) |

The original `name` column in both tables is not modified.

**Matching key note**

`member_osm_id` and `skill_osm_id` must exactly match the values the active extraction plugin produces as `memberOsmId` / `skillOsmId`. For the html-scraper plugin those values are always the raw name strings. This equivalence is what allows future "Import from OSM" sync operations to correctly match incoming extracted records to existing DB rows.

**Idempotency**

By default the script only processes rows where `member_osm_id IS NULL` (members) or `skill_osm_id IS NULL` (skills), making it safe to run multiple times. Pass `--force` to re-derive every row — useful after updating the categorisation rules in `html-scraper.plugin.js`.

**Output**

```
[backfill-etl-fields] default -- filling NULL rows only (use --force to re-derive all)

Members:
  [1   ] QFF Skywalker, L               rank=QFF    last=Skywalker      first=L
  [2   ] FF Kenobi, O                   rank=FF     last=Kenobi         first=O

Skills:
  [1   ] OI (IS1) - Operational Safety                         category=Operational Integrity
  [2   ] Pumps - Appliance Pump Operation from Pressure Fed    category=Pumps

[backfill-etl-fields] Done -- updated 2 member(s), 2 skill(s).
```

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
| 5 | `users` | Deletes all rows |
| 6 | `user_preferences` | Deletes all rows |
| 7 | `api_keys` | Deletes all rows |
| 8 | *(all tables)* | Runs `VACUUM` to compact the file |

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
