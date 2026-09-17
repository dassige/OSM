# Security Fix Regression Test Plan

**Scope:** Only the 5 changes made in response to Pass 4 findings (2026-09-17). This is **not** a general regression suite — see `UAT-TESTING-PLAN.md` for that. Use this plan to gain confidence before promoting commit range containing these fixes from TEST → UAT → PROD.

**Changes covered:**
1. N-BR-2 — scheduled backup path guard (`routes/api/system.js`, `services/url-utils.js`)
2. N-PUB-1 — Quiz Score-mode `correctAnswer` stripped (`routes/api/live-quiz.js`)
3. N-PUB-2/N-AUTH-1 — KB link resolution now uses `resolver_token` instead of sequential id (migration `026`, `services/db/knowledgebase.js`, `routes/api/knowledgebase.js`, `public/js/kb-link-picker.js`, `forms-manage.js`, `surveys-manage.js`)
4. F-01 — static file serving reordered behind session/page-access guards (`server.js`)
5. H-04/H-05 — server-side HTML sanitization of form/survey intro & question text (`services/html-sanitizer.js`, `services/forms-service.js`, `services/db/surveys.js`)

Automated coverage already run and passing: `npm test` (445/445), `npm run test:ui` (35/35 Playwright smoke checks). This plan covers what those suites **don't** exercise — real click-through flows, existing-data migration behavior, and cross-role access.

---

## 0. Pre-flight (do this first, in TEST)

| # | Step | Expected Result |
|---|---|---|
| 0.1 | Restore a recent PROD (or PROD-like) database snapshot into TEST | DB loads without error |
| 0.2 | Start the app against that DB and watch the startup log | Migration `026-kb-resolver-token.sql` applies once, logs `[Migrations] Success: 026-kb-resolver-token.sql`, no errors |
| 0.3 | `SELECT COUNT(*) FROM knowledgebase_documents WHERE resolver_token IS NULL;` | Returns `0` — every existing document was backfilled |
| 0.4 | `SELECT COUNT(*) FROM knowledgebase_documents; SELECT COUNT(DISTINCT resolver_token) FROM knowledgebase_documents;` | Both counts equal — every token is unique |
| 0.5 | Restart the app a second time against the same DB | Migration log shows `026` already applied (skipped), no duplicate-column errors |

**Rollback note:** migration 026 only adds a column + index — it is additive and non-destructive. If a regression forces a code rollback, the migration does not need to be reverted; old code simply ignores the new column.

---

## 1. Scheduled Backup Path Guard (N-BR-2)

| # | Environment | Step | Expected Result |
|---|---|---|---|
| 1.1 | TEST | As superadmin, `POST /api/system/scheduled-backup` with `backupLocation` left empty | `200 { success: true }` — falls back to the default location, unchanged from before |
| 1.2 | TEST | Same, with `backupLocation` set to a subdirectory of the configured `BACKUP_ROOT_DIR` | `200 { success: true }` |
| 1.3 | TEST | Same, with `backupLocation` set to a path **outside** the backup root (e.g. the app's `public/` directory, or `/tmp`) | `400` with message `Backup location must be inside the configured backup root...` — request rejected, config **not** saved |
| 1.4 | TEST | `POST /api/system/scheduled-backup/run-now` after 1.2 | Backup file is written inside the configured subdirectory; check the returned filename/history entry |
| 1.5 | UAT | Backup & Restore page → "This Server" tab → set a valid scheduled backup location → Save | Success toast; no console errors; saved value reflected on reload |
| 1.6 | UAT | Same page → try setting an out-of-root path (e.g. paste a path outside the backup root) → Save | Clear on-page error message shown (not a blank failure or raw 500) |
| 1.7 | UAT | Backup & Restore page → "Remote Servers" tab → add/update a remote server with a valid `backupLocation` | Still works exactly as before (this code path was already guarded; confirms the shared-function refactor didn't regress it) |
| 1.8 | UAT | Trigger "Run Now" for the scheduled backup configured in 1.5 | Backup completes, appears in history list |

---

## 2. Quiz Score-Mode Answer Leak Fix (N-PUB-1)

| # | Environment | Step | Expected Result |
|---|---|---|---|
| 2.1 | TEST | Create a Score-mode quiz game with 2–3 questions (radio/checkbox/boolean, each with `correctAnswer` set) | Game saves normally in Quiz Games manager |
| 2.2 | TEST | Generate an individual player code; `curl /api/live-quiz/play/:code` before submitting | `200`; every question object has no `correctAnswer` field; all other fields (`id`, `type`, `options`, `points`, `description`) present |
| 2.3 | TEST | Generate a team code (Score mode); `curl /api/live-quiz/team-play/:code` before submitting | Same as 2.2 for the team endpoint |
| 2.4 | TEST | `POST /api/live-quiz/play/:code/submit` with correct answers | `200`, `achievedScore` equals the full possible score — proves scoring still uses the full server-side data, unaffected by the response-stripping |
| 2.5 | UAT | Send a Score-mode quiz link to a test member; open it in a browser | Quiz renders normally: all questions, options, and point values visible; nothing looks missing or broken |
| 2.6 | UAT | Answer all questions and submit | Score displayed matches expectations; no console errors on the quiz-play page |
| 2.7 | UAT | Repeat 2.5–2.6 for the **team** flow via `quiz-join.html` → team play link | Same result for a team session |
| 2.8 | UAT | Re-open the same (already-submitted) player/team link | Returns the "already submitted" summary (score only) — same as pre-fix behavior, unaffected by this change |

---

## 3. Knowledge Base Link Resolution via `resolver_token` (N-PUB-2/N-AUTH-1)

This is the change with the largest functional surface — test thoroughly.

| # | Environment | Step | Expected Result |
|---|---|---|---|
| 3.1 | TEST | `curl /api/knowledgebase/resolve/<sequential-id-of-a-real-doc>` (the doc's DB `id`, not its token) | `404` — confirms the enumeration path is closed |
| 3.2 | TEST | `curl /api/knowledgebase/resolve/<that-doc's-resolver_token>` (read it from the DB for this test only) | `200 { slug, title }` |
| 3.3 | UAT | Open **Knowledge Base** page as admin | Document list loads exactly as before (titles, folders, badges) |
| 3.4 | UAT | Open **Forms Manage** → edit/create a form question → click **KB Link** in the TinyMCE toolbar → pick a document → Insert | Link appears in the editor with the document's title as link text |
| 3.5 | UAT | Save the form → open its public preview / `forms-view.html` link | The inserted KB link renders as a working, clickable link (not struck-through/"no longer available") |
| 3.6 | UAT | Repeat 3.4–3.5 for **Surveys Manage** (intro and a question) | Same result on `surveys-view.html` |
| 3.7 | UAT | As superadmin, go to Knowledge Base → **rotate the slug** of the document linked in 3.4 (single-document rotate) | Rotation succeeds, new slug shown |
| 3.8 | UAT | Re-open the same public form link from 3.5 (do **not** re-save the form) | The KB link **still works** and now points at the new slug — this is the core guarantee `resolver_token` is meant to preserve |
| 3.9 | UAT | Repeat 3.7–3.8 using **Rotate All Slugs** (bulk) | Same result — links embedded anywhere in any form/survey keep working after a bulk rotation |
| 3.10 | UAT | Deactivate (toggle off) or expire a KB document that has an embedded link somewhere | The link on the public page shows the existing "neutralised" state (struck through, "no longer available") — unchanged behavior from before this fix |
| 3.11 | UAT | **Known content-migration item**: open any form/survey that had a KB link inserted **before** this deployment | The old-style `{{kb:<id>}}` link will now show as "no longer available", since the old sequential id is no longer resolvable. This is an accepted, one-time side effect of closing the enumeration hole — confirm with the product owner whether any pre-existing embedded KB links need to be identified and re-inserted after deployment. |
| 3.12 | UAT | Skills page → link a skill to a KB document as refresher material (unrelated code path, uses the real `id` via `kb_document_id`, not the resolver) → Save | Still works exactly as before — sanity check that this fix didn't cross-affect the separate skill-refresher feature |
| 3.13 | UAT | Trigger a notification for a skill with a linked KB refresher document (email/WhatsApp) | Notification includes a working KB document link, same as before |
| 3.14 | UAT | Open the public Knowledge Base viewer (`/knowledgebase/<slug>`) directly for a document | Loads and displays/downloads the file exactly as before (this route was not changed) |

---

## 4. Static File Serving Reorder (F-01)

Highest blast-radius change — test broadly across roles.

| # | Environment | Step | Expected Result |
|---|---|---|---|
| 4.1 | TEST | With **no session cookie**, `curl` each of: `system-tools.html`, `backup-restore.html`, `users.html`, `event-log.html`, `third-parties.html`, `templates.html`, `live-forms.html`, `live-surveys.html`, `live-quiz.html`, `statistics.html`, `knowledgebase.html` | Every one returns **302** (redirect), never 200 with page content |
| 4.2 | TEST | With a **`simple`-role** session cookie, repeat 4.1 for the `adminAndSuper`-gated pages | Still 302 (simple role is below the required role) |
| 4.3 | TEST | With a **`simple`-role** session cookie, `curl statistics.html` | **200** (statistics allows all authenticated roles) |
| 4.4 | TEST | With an **`admin`-role** session cookie, `curl system-tools.html` and `backup-restore.html` | Still 302 (superadmin-only) |
| 4.5 | TEST | With an **`admin`-role** session cookie, `curl users.html`, `event-log.html`, `live-forms.html`, etc. (admin-and-above pages) | **200** |
| 4.6 | TEST | With a **`superadmin`** session cookie, `curl` all 11 gated pages | **200** for all |
| 4.7 | TEST | With **no session**, `curl login.html`, `forms-view.html`, `surveys-view.html`, `quiz-play.html`, `quiz-join.html`, `knowledgebase-view.html`, `live-surveys.html` | **200** for all — these must remain public |
| 4.8 | TEST | With **no session**, `curl` a handful of static assets: `styles.css`, `utils.js`, `theme.js`, `app.js`, an image under `/icons/` | **200** for all — unaffected |
| 4.9 | UAT | Log in as `simple`, `admin`, and `superadmin` (three separate sessions/browsers) and **type the URL directly** in the address bar for a page above your role (e.g. simple user typing `/users.html`) | Redirected to the dashboard, no error page, no leaked content |
| 4.10 | UAT | Log in as `superadmin` and click through every item in the left-hand navigation | Every page loads fully styled with no blank/broken layout |
| 4.11 | UAT | In an incognito/logged-out browser window, open a public form link, survey link, quiz link, and KB viewer link (one of each) | Each renders fully styled, JS-driven UI works (no missing CSS/JS, no console errors) |
| 4.12 | UAT | Full login flow: go to `/login.html` logged out, log in with valid credentials | Login succeeds and lands on the dashboard, exactly as before |
| 4.13 | UAT | While logged in as superadmin, confirm Socket.IO-driven live features still work: Event Log live updates, and a Live Quiz host/player session connecting | Real-time updates still arrive; no socket connection errors in the console |
| 4.14 | UAT | Check the PWA manifest / app icon still loads (view page source or browser dev tools → Application → Manifest) | Manifest loads, icons resolve correctly |

---

## 5. Server-Side Rich-Text Sanitization (H-04/H-05)

| # | Environment | Step | Expected Result |
|---|---|---|---|
| 5.1 | TEST | Create a form via the API with a question `description` containing `<script>alert(1)</script>` and an `<img src=x onerror="...">` | Form saves (`200`); `GET` the form back — both payloads are stripped from the stored `description`, no error |
| 5.2 | TEST | Create/update a form via the API with a question `description` containing normal formatting: `<p>`, `<strong>`, `<ul><li>`, a `<table>`, an `<a href="..." target="_blank">`, an `<img src="...">` | All of this formatting survives unchanged in the stored value |
| 5.3 | TEST | Repeat 5.1–5.2 against `POST /api/surveys` and `PUT /api/surveys/:id` (intro and question description) | Same results for surveys |
| 5.4 | UAT | In Forms Manage, use the TinyMCE toolbar on a question description to apply: bold, italic, bulleted list, numbered list, a hyperlink set to open in a new tab, an inserted image, and a simple table | Save, then reopen the editor — all formatting is intact exactly as authored |
| 5.5 | UAT | Open the public `forms-view.html` (or preview) for that form | The rich text renders visually identically to before: bold is bold, list renders as a list, the table renders, the image displays, the link opens in a new tab |
| 5.6 | UAT | Repeat 5.4–5.5 for Surveys Manage (intro + a question) on `surveys-view.html` | Same result |
| 5.7 | UAT | If TinyMCE's source-code view is enabled, paste a `<script>` or `onerror`-image tag directly into a question description via source view, then Save | After save/reload, the malicious tag is gone from the editor and never appears/executes on the public page |
| 5.8 | UAT | Open a form/survey that was **last saved before this deployment** (do not re-save it) | Displays exactly as it did before — old content is not retroactively touched, so no visual change is expected here |
| 5.9 | UAT | Note timing: save a question with a large amount of rich text (long description, an embedded image) | Save completes promptly, no timeout or error from the added sanitization step |

---

## 6. Go / No-Go Sign-Off

All of the following must be true before promoting to PROD:

- [ ] Section 0 pre-flight passed against a real (restored) data copy
- [ ] Section 1 (backup path guard) — all TEST + UAT rows pass
- [ ] Section 2 (quiz answer leak) — all TEST + UAT rows pass
- [ ] Section 3 (KB resolver token) — all TEST + UAT rows pass, **and** row 3.11's content-migration question has been answered by the product owner
- [ ] Section 4 (static serving reorder) — all TEST + UAT rows pass, across all four roles (none/simple/admin/superadmin)
- [ ] Section 5 (rich-text sanitization) — all TEST + UAT rows pass, with no unexpected formatting loss reported
- [ ] `npm test` green and `npm run test:ui` green on the exact commit being promoted
- [ ] No new errors in the application log (Winston) during the full UAT pass
