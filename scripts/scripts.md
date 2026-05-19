# Scripts

Standalone utility scripts for the OpReady project. Run from the project root unless stated otherwise.

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
| 1 | `members` | Preserves each member's rank prefix (SO, SFF, QFF, FF, RFF …), replaces surname and initial with a unique Star Wars character, generates `<initial>.<lastname>@starwars.demo` email, clears `mobile` and `messengerId` |
| 2 | `email_history` | Mirrors the same name and email replacements, matched by `recipient_name` |
| 3 | `event_log` | Replaces real email addresses found in `Security` event payloads with `demo@starwars.demo` |
| 4 | `preferences` | Replaces the sender name and email in all notification templates with `Rebel Alliance Training <training@rebels.starwars.demo>` |
| 5 | `users` | Deletes all rows |
| 6 | `user_preferences` | Deletes all rows |
| 7 | `api_keys` | Deletes all rows |
| 8 | *(all tables)* | Runs `VACUUM` to compact the file |

**Name assignment**

Each member's rank prefix is read from their real name and kept as-is, so the brigade structure remains realistic. The surname and initial are replaced using a pool of 60 unique Star Wars characters drawn from across all eras (Prequel, Original, Rebels, Mandalorian, Sequel). The pool is ordered deterministically by member ID, so the mapping is stable across runs as long as the set of members does not change.

If the brigade ever grows beyond 60 members, overflow entries receive a numeric suffix (e.g. `SO Kenobi2, O` / `o.kenobi2@starwars.demo`) so all names and emails remain unique regardless of brigade size.

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
