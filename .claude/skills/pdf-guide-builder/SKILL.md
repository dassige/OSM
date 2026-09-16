# OpReady PDF Guide Builder

You are generating a full PDF user guide for an OpReady feature — written content plus real screenshots of the actual application, not mockups. This skill documents the reusable framework at `scripts/guide-builder/` (see `scripts/scripts.md` for the on-disk structure and npm shortcuts) and how to extend it to a new feature.

## What already exists

`scripts/guide-builder/lib/` is feature-agnostic and should be reused as-is:

| File | Purpose |
|---|---|
| `prepare-db.js` | Copies `demo.db` to a scratch file (OS temp dir) and seeds fixture data into it. Never opens the real `demo.db` or `fenz.db` for writing. |
| `demo-server.js` | Starts/stops a disposable `node server.js` instance in `APP_MODE=development` (not `demo`), pointed at the scratch DB, on its own port. `development` mode matters: it satisfies the same production-mode env-validator checks as `demo` mode without the demo-mode guard blocking mutating routes (Start Single/Teams, live hosting, etc. are all hard-blocked when `appMode === 'demo'`). SMTP is pointed at an invalid host so any real email attempt fails harmlessly. |
| `guide-html.js` | Branding constants (OpReady teal) and HTML builders: `coverPage()`, `tableOfContents()`, `partDivider()`, `section()` (heading + paragraphs + screenshot figures + a tip box), `figure()` (embeds a PNG as a base64 data URI, with a `mobile: true` option that frames it like a phone). |
| `pdf-renderer.js` | Renders an assembled HTML string to PDF via a headless Chromium's own `page.pdf()` — no PDF library dependency. Adds page-number footers. |

A feature guide is one `<feature>/capture.js` (Playwright walkthrough) + one `<feature>/content.js` (written content) + one top-level `build-<feature>-guide.js` (orchestrator). See `scripts/guide-builder/quiz/` and `scripts/guide-builder/build-quiz-guide.js` as the reference implementation.

## Adding a guide for a new feature

1. **Understand the feature's full UI flow first** — read the relevant `routes/api/*.js` and `public/*.html` + `public/js/*.js` files before writing any Playwright code. Note exact element IDs/classes, which actions are plain `fetch()` calls vs. real navigations/popups, and — critically — whether any action is blocked by the demo-mode guard (`config.appMode === 'demo'`) in the route handler. If any is, the capture server MUST run in `development` mode via `lib/demo-server.js`, not `demo` mode.
2. **Write `<feature>/capture.js`**, exporting a `capture<Feature>Screenshots({ baseUrl, username, password, outDir })` function that returns a manifest `{ shots: { key: filePath }, data: {...} }`. Reuse the patterns already in `quiz/capture.js`:
   - Log in once per browser context via `context.request.post(baseUrl + '/login', { data: { username, password } })` — this shares cookies with every `page` created from that context.
   - Use a desktop context (`viewport: { width: 1440, height: 900 }`) for admin screens and `devices['iPhone 13']` (from `@playwright/test`) for any end-user/mobile screen — most OpReady end-user flows (quiz play, form/survey submission) are mobile-first in practice even though the page itself is responsive.
   - **Never call state-changing API endpoints directly via `context.request.post()`.** OpReady's global `fetch()` wrapper (`public/utils.js`) attaches a CSRF token that only exists inside a real page context — a bare `context.request.post()` to a mutating endpoint gets a silent-looking `403 Invalid or missing CSRF token`, and worse, the corresponding UI won't reflect the change so a later `waitForSelector` will simply time out with no obvious cause. Instead, either click the real UI control, or — for actions with no visible button (e.g. an auto-fires-on-timer transition) — call the page's own JS function via `page.evaluate(() => someInPageFunction(...))`, which goes through the same patched `fetch()`.
   - Wrap any screenshot step that isn't load-bearing for later steps (a preview popup, an optional detail view) in a small `safe()` try/catch helper that logs a warning and continues rather than aborting the whole run — but never wrap a step whose *return value* (an ID, an access code, an API response) a later step depends on.
   - Watch for app-level timing quirks that only show up under fast, scripted interaction — e.g. a field that snapshots its "dirty" baseline on a short `setTimeout` after render, which a real user would never click through fast enough to race. If a click silently no-ops (no error, but the expected UI change never happens), check the target page's JS for exactly this kind of deferred state capture before assuming your selector is wrong.
   - Use fictional data only — the seeded `demo.db` fixture (Star Wars member names, etc.) or data your own `prepare-db.js` addition seeds. Never point any of this at `fenz.db` or a real deployment.
3. **Write `<feature>/content.js`**, exporting a `build<Feature>GuideHtml({ manifest, appVersion, generatedDate })` that composes `guide-html.js` blocks referencing `manifest.shots[...]` by key. Write real, complete guide prose — this is a manual for admins and end users, not in-app quick-reference help (`public/help.js`'s terseness rules do not apply here). Guard any figure whose capture step was wrapped in `safe()` in case it's missing from the manifest.
4. **Write `build-<feature>-guide.js`**, mirroring `build-quiz-guide.js`: prepare the DB, start the server, capture screenshots (stopping the server in a `finally` block even on failure), render the PDF to `docs/guides/OpReady-<Feature>-Guide.pdf`, log progress at each stage.
5. **Wire it up**: add an npm script (`"guide:<feature>": "node scripts/guide-builder/build-<feature>-guide.js"`), document it in `scripts/scripts.md` under the `guide-builder/` section, and mention the new guide in `README.md` if it introduces a new npm script (which it does).
6. **Run it, then actually look at a handful of the generated screenshots** (the `Read` tool can open PNGs directly) before considering the guide done — a script that "completed without errors" can still have captured a blank or wrong-state screen if a selector matched too early.

## Safety rules (non-negotiable)

- Never set `DB_PATH` to the real `fenz.db`, the real `demo.db`, or any file the user might be actively using — always run through `prepare-db.js`'s scratch-copy pattern.
- Never commit anything under `scripts/guide-builder/output/` (screenshots, scratch DB) — only the final PDF under `docs/guides/` is committed.
- Treat `APP_MODE=development` here purely as a local automation convenience to bypass the demo-mode guard for scripted screenshot capture — it is not a suggestion to use that mode for anything else, and this skill's servers are always disposable, port-isolated, and torn down at the end of the run.
