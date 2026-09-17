
# OpReady

## Description

**OpReady** is a Node.js web application designed to streamline the tracking and management of expiring Operational Skills Maintenance (OSM) competencies.

It automates the process of checking a dashboard for expiring skills, persists data via a local SQLite database, and provides a secure web interface for administrators to send targeted email reminders. This application manages all members, skills, and configurations dynamically via the web interface—no code editing required.

**Key Features:**

  * **Real-Time Web Dashboard:** A responsive UI using Socket.IO to view scraping progress, logs, and sending status in real-time.
  * **Database Driven:** All members and skills are stored in a local SQLite database (`fenz.db`).
  * **Integrated Form System (Live Forms):**
      * **Form Builder:** Drag-and-drop interface to create custom skill verification forms internally.
      * **Unique Tracking:** System generates unique, secure links for every member/skill combination.
      * **Lifecycle Management:** Track exactly when a form was sent, opened, and submitted.
      * **Data Review:** Admins can review submission answers directly within the app.
  * **Anonymous Survey System:**
      * **Builder:** Create custom polls and feedback surveys with various question types (Multiple Choice, Checkboxes, Free Text).
      * **Distribution:** Publish to members with automated email/WhatsApp invitations using custom dynamic templates.
      * **Anonymous Tracking:** Track completion status to send targeted reminders without linking member identities to their submitted answers.
      * **Analytics:** View aggregated results with visual bar charts and seamlessly export them to CSV or PDF for reporting.
  * **Multi-User System:**
      * **Super Admin:** A resilient system account defined via environment variables.
      * **User Management:** Create multiple database-backed administrators with secure password hashing.
      * **Automatic Notifications:** New users receive a welcome email with a randomly generated temporary password.
      * **Self-Service:** Users can manage their profiles and reset forgotten passwords via a time-limited email link.
  * **Quiz Games (Social Learning Sessions):**
      * **Question Bank Builder:** Create multiple-choice quiz games with a 4-choice question bank per game.
      * **Two Play Styles:** Score-based (self-paced, points per question) or Timed (live, speed-scored, Kahoot-style).
      * **Question Ordering:** Reorder questions with up/down controls; each question carries its own points or time limit depending on game type.
  * **Web-Based Management:**
      * **Members:** Add, edit, delete, and CSV Import/Export members directly in the browser.
      * **Skills:** Configure which skills to track and mark them as Critical.
      * **Smart Form Links:** Define Online Form URLs with dynamic placeholders (e.g., `{{member-name}}`) to pre-fill member details automatically.
      * **Email Templates:** A rich-text editor with drag-and-drop variables to customize notifications for Expiring Skills, Surveys, New Users, Password Resets, Forgot Password reset links, and Account Deletions.
  * **Reports Console:**
      * **Flexible Reporting:** Generate comprehensive reports grouped by **Member** (for individual follow-up) or **Skill** (for planning training blocks).
      * **Export Options:** Includes built-in support for browser Printing (A4 optimized) and direct **PDF Export**.
      * **Localization:** Reports automatically respect your configured Date Format and Timezone settings.
  * **Training Planner:**
      * **Visual Scheduling:** A drag-and-drop calendar to plan in-person training sessions for skills that don't have online forms.
      * **Smart Filtering:** A "Show Training Day Only" toggle that hides irrelevant days and expands the calendar to fill the screen.
      * **Training Day Highlight:** Define your brigade's standard training day in `.env` to have it automatically highlighted.
  * **System Maintenance & Auditing:**
      * **Backup & Restore:** Dedicated page (`backup-restore.html`, superadmin only). Two tabs:
          * **This Server** — manual backup (Full `.zip` or Database-only `.sql`), restore from file, and a **Scheduled Backup** section (daily, weekly, every N hours, or every N days) that saves files to a configured server-side path with configurable retention. Requires a persistent deployment (`DEPLOYMENT_TYPE` — disabled automatically on Cloud Run, App Runner, and Fargate).
          * **Remote Servers** — connect up to 5 other OpReady instances via URL + API key. **Manual pull** downloads the backup directly to the browser (Save As dialog — nothing written to disk on this server). **Scheduled pull** saves files to a configurable local path (set per-server in the Schedule modal, defaults to `/app/backups/remote/<server-name>/`; mount `/app/backups` as a Docker volume). A **Run Now** button in the schedule modal lets you immediately test the configuration. Connection test allows up to 90 s for ephemeral cold-start; pull transfers allow up to 15 min. History per server is logged with status, filename, and file size.
      * **Event Log:** A comprehensive audit trail recording all major actions. Successful login events include the originating IP address and its resolved geographic location (city and country), displayed in a highlighted panel in the event detail modal.
      * **Log Maintenance:** Super Admins can prune old events, purge the entire log, or export it to JSON.
  * **Geoblocking Bypass:** Built-in proxy manager with support for **Fixed** (paid) and **Dynamic** (free) proxies.
  * **Cloud-Native Persistence:** Uses **Litestream** to replicate the SQLite database to Google Cloud Storage (GCS) for stateless deployments (e.g., Google Cloud Run).
  * **Dockerized:** Ready for production deployment with a flexible configuration system.
  * **Demo Mode:** Run the application in a fully sandboxed environment using static local data and a separate database (`demo.db`). This allows for safe testing and demonstration without connecting to the live OSM Dashboard or risking production data.
  * **WhatsApp Integration:** Send expiring skill notifications directly to members' WhatsApp accounts using a headless client. Includes support for bulk sending, test messages, session management, **automatic reconnection with exponential backoff**, and a **message queue** that retries delivery once the connection is restored.
  * **REST API with API Key Authentication:** Every `/api/*` endpoint can be called by external systems using an `X-API-Key` request header. Keys are managed (create, revoke, delete) through the **System Admin → API Management** page without restarting the server.
  * **API Reference (Swagger UI):** Interactive OpenAPI 3.0 documentation is available at `/api/docs` for authenticated admin users.
  * **Knowledge Base:** A built-in document library for storing and sharing documents (PDF, Word, Excel, RTF, TXT, Markdown, PNG, JPG, BMP) with brigade members — no login required. Documents are organised in a collapsible folder/category tree with live document counts and red expiry badges. Each document has a configurable expiry date; expired documents are flagged for admin review and their public link stops working automatically until an admin extends the date or replaces the file. The Edit modal supports replacing a document's file content without changing its public link. Admins can rotate GUIDs per-document or in bulk (System Tools) to invalidate shared links. A **KB Link** button in every TinyMCE editor embeds persistent document links inside forms and surveys using a stable integer ID that survives slug rotation.

## Table of Contents

  * [Prerequisites](#prerequisites)
  * [Installation](#installation)
  * [Configuration](#configuration)
  * [Demo Mode](#demo-mode)
  * [UI Customization](#ui-customization)
  * [Usage](#usage)
  * [Example Data and Configuration](#example-data-and-configuration)
  * [API Access](#api-access)
  * [Testing](#testing)
  * [Docker Deployment](#docker-deployment)
  * [Cloudflare Tunnel](#cloudflare-tunnel)
  * [Google Cloud Run Deployment](#google-cloud-run-deployment)
  * [Progressive Web App (PWA)](#progressive-web-app-pwa)
  * [Integrations](#integrations)
  * [Project Structure](#project-structure)
  * [Credits](#credits)
  * [License](#license)

## Prerequisites

  * **Node.js**: v20 or higher.
  * **npm**: Included with Node.js.
  * **Access**: Valid credentials for the OSM Dashboard you intend to scrape.

## Installation

1.  **Clone the repository:**

    ```bash
    git clone [https://github.com/dassige/OSM.git](https://github.com/dassige/OSM.git)
    cd OSM
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Prepare Configuration Files:**
    The application uses environment variables for sensitive data. Choose one of the two methods below.

    **Option A — Interactive Setup Tool (recommended for first-time setup):**

    ```powershell
    npm run setup-env
    ```

    This opens a web form at `http://localhost:3088` where you can enable/disable variables, enter values, and read descriptions — all in a single view. Click **Generate .env File** to write `.generated.env`, then copy it:

    ```powershell
    # PowerShell
    Copy-Item .generated.env .env

    # Bash / macOS
    cp .generated.env .env
    ```

    **Option B — Manual:**

    ```bash
    cp .example.env .env
    # then open .env in your editor
    ```

## Configuration

The application is configured primarily via the **`.env`** file.

### Environment Setup Tool

The interactive setup tool (`npm run setup-env`) is the easiest way to create or update your `.env` file. It reads `.example.env` — the authoritative source of all supported variables — and presents a web UI at `http://localhost:3088`:

| Feature | Detail |
|---|---|
| **Sections** | Variables grouped by category (Security, Email, AI Evaluation, etc.) |
| **Descriptions** | Inline explanation for every variable, sourced directly from `.example.env` comments |
| **Enable/disable** | Checkbox per variable; disabled variables are written as `# KEY=value` (commented out) |
| **Sensitive fields** | Password-type inputs with a Show/Hide toggle for keys containing `PASSWORD`, `SECRET`, `PASS`, `KEY` |
| **Pre-fill** | Form loads with values from `.generated.env` (if it exists), then `.env`, then template defaults |
| **Output** | Writes `.generated.env`; copy to `.env` to activate |

```powershell
npm run setup-env          # open the form
Copy-Item .generated.env .env   # activate (PowerShell)
cp .generated.env .env          # activate (Bash)
```

The tool uses only Node.js built-ins — no additional install required.

**Windows standalone executable (no Node.js needed)**

For machines without Node.js, build a self-contained `.exe` with:

```powershell
npm run build:setup-env   # requires npm install (dev deps)
```

This produces `dist/setup-env-<version>.exe` (~36 MB, bundles Node.js 18 runtime — e.g. `setup-env-3.7.8.exe`). Copy it alongside `.example.env` and double-click or run it from a terminal — the same web UI opens at `http://localhost:3088` and writes `.generated.env` next to the executable.

### Environment Variables (`.env`)

Open the `.env` file and configure the following parameters:

#### **Application Security (Super Admin)**

  * `APP_USERNAME`: The username for the immutable Super Admin (e.g., `admin`).
  * `APP_PASSWORD`: A strong password for the Super Admin.
  * `SESSION_SECRET`: **Required in production.** A random string of 32+ characters used to sign session cookies. Startup will abort if this is missing in production mode. Generate one with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
  * `MAX_LOGIN_ATTEMPTS`: Maximum number of failing login attempt before a user is blocked and a notification is sent to the super user (default 5).
  * `COOKIE_SECURE`: Set to `false` for local HTTP development. Leave unset (defaults to `true`) in production — session cookies will only be sent over HTTPS. Your deployment must run behind a TLS-terminating reverse proxy (e.g., Cloudflare Tunnel, nginx) for this to work correctly. **Setting `COOKIE_SECURE=false` when `APP_MODE=production` is a fatal startup error — the server will abort with an error message.** This prevents accidental insecure cookie deployment in production.
  * **Session timeout:** Sessions automatically expire after **8 hours** of inactivity regardless of the `COOKIE_SECURE` setting. This is a server-side `maxAge` on the session cookie and is not configurable via environment variables.
  * **Content Security Policy:** Helmet's CSP is enabled by default with a baseline policy that blocks external script/style loading, prevents clickjacking (`frame-ancestors: none`), blocks Flash/plugins (`object-src: none`), and restricts form targets to the same origin. `'unsafe-inline'` and `'unsafe-eval'` are currently permitted for `script-src` and `style-src` to support existing inline scripts. Future hardening: migrate inline scripts to external files and remove these directives.
  * `CORS_ORIGIN`: Leave unset for the standard same-origin deployment (the frontend and API are served from the same host). Set to your frontend's full origin (e.g., `https://app.yourdomain.com`) only if the frontend is hosted on a separate domain.

#### **Operation Mode**

  * `APP_MODE`: Controls the operating mode:
    * `production` (default) — live OI dashboard scraping, real database, HTTPS required (`COOKIE_SECURE=true` is enforced).
    * `development` — same as production (real database, real scraping, real credentials required) but `COOKIE_SECURE=false` is permitted for local HTTP development without a TLS proxy.
    * `demo` — sandboxed mode with a bundled static data file, isolated `demo.db`, and demo credentials. All destructive actions are blocked.

#### **Demo Secrets (Only used when APP_MODE=demo)**

  * `DEMO_SUPERADMIN_USERNAME`: The username for the Super Admin in demo mode.
  * `DEMO_SUPERADMIN_PASSWORD`: The password for the Super Admin in demo mode.

#### **Application Settings**

  * `APP_TIMEZONE`: The timezone used for date calculations (e.g., `Pacific/Auckland`). Defaults to NZ time.
  * `APP_LOCALE`: The locale used for date/time formatting strings (e.g., `en-NZ`, `en-US`). Defaults to `en-NZ`.
  * `TRAINING_DAY_OF_WEEK`: Your brigade's training day (e.g., `Monday`). Used to highlight the day in the Training Planner.   
  * `APP_BASE_URL`: Public base URL of the deployment (e.g., `https://opready.yourbrigade.nz`). Used when building absolute links in outbound emails — skill verification form links and password reset links. If unset, the URL is derived automatically from the incoming request (works correctly for most deployments, but must be set explicitly when the app is behind a custom domain on Cloud Run or a reverse proxy).
  * `ACCEPTED_FORM_VISIBILITY_DAYS`: Days an 'Accepted' icon stays on the dashboard after review. (default 30)

#### **Forms Scoring Defaults**
  * `DEFAULT_MIN_SCORE`: Minimum score required to accept a form (default: 70).
  * `DEFAULT_MIN_SCORE_TYPE`: Type of score (`percentage` or `number`).
  * `DEFAULT_MAX_TRIES`: Max number of attempts allowed per form (default: 3).

#### **AI Evaluation Configuration (Optional)**
  * `ENABLE_AI_EVALUATION`: Set to `true` to enable AI-based paragraph grading.
  * `AI_PROVIDER`: `gemini` or `ollama`.
  * `AI_MODEL`: E.g., `gemini-1.5-pro` or `llama3`.
  * `GEMINI_API_KEY`: Required if provider is Gemini.

#### **Extraction Engine**

  * `EXTRACTION_PLUGIN`: Which ETL plugin to use for fetching member skill expiry data. `html-scraper` (default) scrapes the OI HTML dashboard. Additional plugins can be added as `services/plugins/<name>.plugin.js`.

#### **OSM Dashboard Connection** *(html-scraper plugin)*

  * `OSM_BU_ID`: **Crucial.** Your unique Business Unit ID (GUID) for the dashboard (e.g., `87FF646A-FCBC-49A1-9BAC-XXXXXXXXXXX`). The system will automatically construct the correct URL.
  * `DASHBOARD_URL`: (Optional) Override the automatic URL construction if you have a custom link.
  * `SCRAPING_INTERVAL`: Minutes to cache extracted data before the next live fetch (Default: `60`).

#### **Email Configuration (SMTP)**

  * `SMTP_SERVICE`: The service provider (e.g., `gmail`).
  * `SMTP_USER`: Your full email address.
  * `SMTP_PASS`: Your email password (or App Password).

#### **Proxy Configuration (Geoblocking Bypass)**

  * `PROXY_MODE`: Set to `none` (local NZ), `fixed` (paid proxy), or `dynamic` (free scraper).
  * `PROXY_URL`: Required if mode is `fixed`.

#### **WhatsApp Integration**
  * `ENABLE_WHATSAPP`: Set to `true` to enable the WhatsApp service and menu items.

#### **Knowledge Base Document Storage**
  * `KB_STORAGE_TYPE`: Storage backend for uploaded documents. Options: `local` (default, filesystem), `s3` (AWS S3 or compatible), `gcs` (Google Cloud Storage).
  * `KB_LOCAL_PATH`: Path *inside the container* where files are stored when `KB_STORAGE_TYPE=local` (default: `./storage/knowledgebase`). Created automatically. In Docker, control the *host* path via `KB_STORAGE_HOST_PATH` instead.
  * `KB_STORAGE_HOST_PATH`: *Docker only.* Host path mounted into the container at `/app/storage/knowledgebase`. Defaults to `./storage/knowledgebase` (inside the project directory, gitignored). Set this to redirect storage to an external disk or NAS.
  * **AWS S3:** Set `KB_S3_BUCKET` (supports `bucket/subfolder` prefix), `KB_S3_REGION`, `KB_S3_ACCESS_KEY_ID`, `KB_S3_SECRET_ACCESS_KEY`. Set `KB_S3_ENDPOINT` to use S3-compatible stores (MinIO, Cloudflare R2, etc.).
  * **Google Cloud Storage:** Set `KB_GCS_BUCKET` to the bucket name, or `bucketname/subfolder/prefix` to store files under a specific path within the bucket. Optionally set `KB_GCS_KEY_FILE` to a service-account JSON path; leave unset to use Application Default Credentials.

#### **Backup Root Directory**

  * `BACKUP_ROOT_DIR`: The absolute server-side path that acts as the root for all backup save locations — scheduled backups, remote pull backups, and the filesystem browser. Defaults to `<app-root>/backups`. All user-supplied backup paths are validated against this root at runtime; paths outside it are rejected with HTTP 400. When running in Docker, mount this path as a volume so backup files survive container recreation (e.g. `-v /host/backups:/app/backups`).

#### **Rate Limiting**

All rate limits are per-IP. The configurable limits below apply to unauthenticated and general API traffic. Additional fixed limits apply to sensitive system endpoints (see table).

  * `RATE_LIMIT_LOGIN_MAX` / `RATE_LIMIT_LOGIN_WINDOW_MIN`: Max login attempts per window before the IP is blocked (default: max=10, window=15 min).
  * `RATE_LIMIT_MFA_MAX` / `RATE_LIMIT_MFA_WINDOW_MIN`: MFA code verification attempts (default: max=5, window=5 min).
  * `RATE_LIMIT_FORGOT_MAX` / `RATE_LIMIT_FORGOT_WINDOW_MIN`: Password-reset requests (default: max=3, window=30 min).
  * `RATE_LIMIT_API_MAX` / `RATE_LIMIT_API_WINDOW_MIN`: Authenticated API requests (default: max=300, window=1 min).
  * `RATE_LIMIT_PUBLIC_SUBMIT_MAX` / `RATE_LIMIT_PUBLIC_SUBMIT_WINDOW_MIN`: Unauthenticated live-form access and survey submission endpoints. Applied per IP to member-facing routes (`/api/live-forms/access/`, `/api/live-forms/submit/`, `/api/live-surveys/`, plus the Quiz Games join-code lookup and the one-time Score-based quiz submission). Set high enough to allow a whole crew to submit simultaneously. (default: max=30, window=5 min).
  * `RATE_LIMIT_LIVE_QUIZ_MAX` / `RATE_LIMIT_LIVE_QUIZ_WINDOW_MIN`: Unauthenticated Timed Quiz live-play endpoints (`GET /api/live-quiz/play/{code}`, `GET /api/live-quiz/team-play/{code}`, and their `/live-answer` submission). A live Timed quiz refetches state on every host action (question started/revealed/leaderboard shown) for every joined player, and a whole crew often plays from the same station IP, so this needs a much higher ceiling than a one-off form/survey submission — the `RATE_LIMIT_PUBLIC_SUBMIT_*` limit is too tight for this traffic pattern and will surface as "Too many submission attempts" mid-game if reused. (default: max=300, window=1 min).

**Fixed-limit system endpoint rate limits** (not configurable — hardcoded to prevent abuse):

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /api/users` (create user) | 10 requests | 15 minutes |
| `GET /api/system/backup` | 10 requests | 1 hour |
| `POST /api/system/restore` | 3 requests | 1 hour |
| `POST /api/system/ai-test` | 10 requests | 1 minute |

All rate-limited responses return HTTP **429** with a JSON body containing a human-readable `error` message and standard `RateLimit-*` response headers.

#### **CSRF Protection**

All state-changing requests (POST, PUT, DELETE) made by a logged-in browser session require a `X-CSRF-Token` header. The token is obtained from `GET /api/csrf-token` and is stable for the life of the session. The `utils.js` fetch interceptor bundled into every authenticated page handles this automatically — no frontend changes are needed for new pages that use the standard `fetch` API. API key-authenticated requests and unauthenticated public endpoints (form/survey submissions) are exempt.

#### **Input Validation**

Member and skill create/update endpoints are validated with [Joi](https://joi.dev/). Invalid or unexpected fields return HTTP 400 with a `{ "error": "Validation Failed", "details": [...] }` response listing each failing constraint. Unknown fields are stripped before they reach the database.

  * **Skill external URLs** — the `url` field on skills is restricted to `http://` and `https://` schemes. Other schemes (e.g. `javascript:`, `ftp://`) are rejected at validation time with HTTP 400.
  * **Knowledge Base file uploads** — the server validates file content against the declared MIME type using magic-byte detection (TXT/MD are verified as plain text instead, since they have no binary signature). A file renamed to `.pdf` that does not contain PDF bytes is rejected with HTTP 400. Accepted types: PDF, Word (.doc/.docx), Excel (.xls/.xlsx), RTF, TXT, Markdown (.md), PNG, JPG/JPEG, BMP.
  * **Pagination bounds** — `limit` and `offset` query parameters on paginated list endpoints are clamped to safe ranges (`limit`: 1–500, `offset`: ≥ 0) to prevent unbounded queries.
  * **Report lookback window** — the `days` parameter on `/api/reports/data/:type` is clamped to 1–3650 days.

## Demo Mode

You can run the application in **Demo Mode** to test features or demonstrate the workflow without accessing live private data.

**How to Enable:**
1. Set `APP_MODE=demo` in your `.env` file.
2. (Optional) Set `DEMO_SUPERADMIN_USERNAME` and `DEMO_SUPERADMIN_PASSWORD`.

**Features in Demo Mode:**
* **Sandboxed Database:** Uses `demo.db` instead of `fenz.db` to ensure your real data is never touched.
* **Static Scraping:** Instead of connecting to the live OSM website, the app scrapes a local static HTML file located at `public/demo/demo_osm_dasboard.html`.
* **Dynamic Dates:** The system automatically adjusts the dates in the static file to appear current (relative to "today"), allowing you to test expiry logic effectively.
* **Visual Indicators:** A "DEMO VERSION" banner appears on all pages, providing a link to view the source HTML used for scraping.
* **Credential Reveal:** The login page includes a tool to reveal the demo Super Admin credentials for easy access.

## UI Customization

You can fully customize the look and feel (Logo, Background, Title).

### 1\. Customizing the Title

Change the `UI_LOGIN_TITLE` variable in your `.env` file:

```bash
UI_LOGIN_TITLE="Station 44 OSM Manager"
```

### 2\. Customizing Images (Local / Docker)

1.  Create a folder (e.g., `my-branding`) containing `logo.png` and `background.png`.
2.  Set `UI_RESOURCES_PATH=./my-branding` in your `.env`.
3.  Restart the application.

### 3\. Customizing Images (Cloud Run)

For stateless deployments, host your images publicly and provide the URLs via environment variables:

  * `UI_LOGO_URL`
  * `UI_BACKGROUND_URL`

## Usage

### 1\. Starting the Server

```bash
node server.js
```

*Listens on port **3000** by default.*

### 2\. User Management

  * **Super Admin:** Log in with the credentials defined in `.env`. Access **Manage Users** to create other admins.
  * **Creating Users:** When you add a user, the system generates a cryptographically random 128-bit (32 hex character) temporary password and emails it to them automatically.
  * **Deleting Users:** Deleting a user will also send them a notification email.
  * **Forgot Password:** Users can request a password reset from the login page. A time-limited link (valid for 30 minutes) is emailed to the registered address. The link opens a self-service page (`/reset-password.html`) where the user sets a new password. The response is always identical regardless of whether the address is registered, to prevent account enumeration.
  * **MFA Authentication:** Enhance security using an authenticator app (e.g. Google Authenticator).
  * **Role hierarchy:** Admin users can only create or modify accounts at a lower role level than their own. An Admin cannot create another Admin or promote any account to Super Admin — only the Super Admin can manage other admins.
  * **Session timeout:** All sessions expire automatically after **8 hours** of inactivity. Users are redirected to the login page when their session expires.

### 3\. Dashboard Workflow

1.  **Manage Members**: Import your team via CSV.
2.  **Manage Skills**:
      * Add skill names exactly as they appear on the OSM Dashboard.
      * **Templated URLs:** You can use variables in the "Form URL" field.
          * Example: `https://docs.google.com/forms/...?entry.123={{member-name}}`
          * The system will auto-fill the member's name and email when generating the link.
3.  **Email Templates**: Use the tabbed editor to customize the `Expiring Skills`, `New User`, `Password Reset`, `Forgot Password`, and `Account Deleted` emails. Drag and drop variables directly into the text. The `Forgot Password` tab uses `{{resetlink}}`, which automatically renders as a clickable "Reset link" anchor in the outbound email.
4.  **Training Planner**: Use the planner to schedule in-person verification sessions for skills that don't have an online form. Drag skills from the list to the calendar.
5.  **Event Log**: Use the yellow maintenance bar (Super Admin only) to prune old logs or purge the history.
6.  **Reports**: Navigate to the Reports Console to print or export PDF summaries of expiring competencies to display on station noticeboards.
7.  **Run Dashboard**: Click **Reload Expiring Skills** to fetch live data, then select members to send reminders.

### 4\. Live Forms Workflow & Automatic Scoring

The application includes a self-contained form system designed to replace external tools like Google Forms.

1.  **Create a Form:**

      * Go to **Manage Forms**.
      * Build your questionnaire (Text, Yes/No, Checkboxes).
      * Save and copy the **Public Link** (🔗).

2.  **Link to a Skill:**

      * Go to **Manage Skills**.
      * Paste the internal link into the URL field for the relevant skill.
      * *Note:* The system automatically detects this is an internal form.

3.  **Automatic Distribution:**

      * When you send an email/WhatsApp reminder, the system generates a unique **Access Code**.
      * The member receives a personalized link (e.g., `.../forms-view.html?code=uuid`).

4.  **Tracking & Review:**

      * Go to **Live Forms**.
      * Filter by Status (Open/Submitted) or Date.
      * **Review:** Click the Eye icon to see the member's answers.
      * **Maintenance:** Use **Purge Filtered** to clean up old records or **Download JSON** for offline archiving.

5.  **Form Validation:** \* Administrators can "Test the Form" in Demo Mode directly from the management table to verify layout and variables before final approval.

6.  **Scoring Simulator:** Use the **Test** button to simulate submissions and verify point weighting.

7.  **Auto-Grading:** Upon submission, the system calculates the score. If the member passes, it is marked `Accepted`. If they fail but have tries left, it resets to `Sent` for a retry.

8.  **AI Review:** If **AI Evaluation** is enabled, paragraph answers show an AI-suggested score and justification for the admin to approve.

### 5\. AI-Assisted Form Generation

To speed up the creation of new verification questionnaires, you can use AI to analyze technical documents and generate compatible JSON definitions.

See the [AI Form Generation Guide](AI_FORM_GENERATION.md) for a ready-to-use prompt and detailed instructions.

### 6\. Anonymous Surveys Workflow

The application includes a fully anonymous survey engine for brigade feedback, elections, or general polling.

1.  **Create a Survey:**
      * Go to **Manage Surveys**.
      * Build your questionnaire using Multiple Choice, Yes/No, Checkboxes, or Free Text fields.
2.  **Publish and Distribute:**
      * Click **Publish** and select the target members.
      * The system automatically generates unique tracking links and dispatches invitations using your configured Survey Template.
3.  **Track and Remind:**
      * Navigate to **Live Surveys** -\> **Tracking**.
      * View who has completed the survey (without seeing their answers) and click **Remind All Pending** to follow up with a single click.
4.  **Analyze Results:**
      * Navigate to **Live Surveys** -\> **Results**.
      * View auto-generated percentage bar charts for choice questions and aggregated text responses.
      * Use the action bar to **Print**, **Export CSV**, or **Export PDF** for offline analysis and reporting.

### 7\. Quiz Games Workflow

A social-quiz feature for brigade learning sessions run in the social room: game/question building, individual play, team setup, and live hosting. The game/question builder layout matches **Manage Forms** / **Manage Surveys**: a game list on the left, and a question editor on the right.

1.  **Create a Game:**
      * Go to **Quiz Games** → **+ Add Game**.
      * Choose **Score-based** or **Timed**. The type can only be changed while the game has no questions yet.
2.  **Build the Questions:**
      * **Score-based** games reuse the exact same question editor as a Form — Paragraph, Single Choice, Checkboxes, or Yes/No questions, each worth a configurable number of points. It's basically a form, minus the passing-threshold and max-attempts settings. Answered at your own pace, submitted once.
      * **Timed** games are simpler to build but always played live, host-driven — every question is a fixed 4-choice question with its own time limit. Each of the 4 answer slots always carries the same number and colour (1 Green, 2 Light Blue, 3 Red, 4 Yellow), matching the buttons shown during play. Scoring is speed-based: a correct answer given instantly earns full points, one given right at the deadline earns half, and a wrong answer or a timeout earns nothing.
      * Drag questions by their handle to reorder; click **Save** to persist.
3.  **Editor Toolbar:**
      * **Preview** and **Test** (Score-based games only) — preview shows a read-only, correct-answer-highlighted view of the game in a new tab; Test opens a scoring simulator to check point weighting.
      * **Export** / **Import** (both game types) — download or load a game's name, description, type, and question bank as a `.json` file.
      * **Start Single** (both game types) — starts an individual play session, one access code per member (see Phase 2 below).
      * **Start Teams** (both game types) — opens the drag-and-drop team builder, one access code per team (see Phase 3 below).
4.  **Phase 2 — Individual Play (both game types):**
      * Click **Start Single** on a saved game with at least one question. Choose all active members or a specific selection, and leave the **Send email notification to invited members** checkbox ticked (default) to also email each invited member their code/link — untick it to just generate the codes without sending anything, e.g. when reading codes straight off a shared screen for a Timed session.
      * A session snapshots the game's current questions and generates one unique access code per member. If the email checkbox was ticked, members with an email on file are sent a link automatically; others (or everyone, if the checkbox was unticked) can be given their code to enter directly.
      * Every member gets a short 6-character join code (e.g. `K3P9XZ`) alongside their emailed link — members can open the emailed link directly (`quiz-play.html?code=...`), or go to the short address `/quiz` (`quiz-join.html`) and type the code in manually, no link required. For a **Score-based** game, they answer at their own pace and submit once. For a **Timed** game, the page waits for an admin to launch and start the host screen (Phase 4 below), then each question appears live with a countdown in sync with everyone else. Either way, the score is shown immediately once finished, and each code can only be used once.
      * Track progress and results in **Live Quiz** (**Single Sessions** tab) — a list of started sessions (with a Score/Timed type badge) with submitted/invited counts, and a per-session results view (member, status, score, submitted time, join code with a copy button) with resend-invitation and refresh actions.
      * Click **View** next to a submitted player to open their answers in a read-only review, with correct answers highlighted green and incorrect ones red (mirrors the Live Forms review screen).
5.  **Phase 3 — Team Setup (both game types):**
      * Click **Start Teams** on a saved game (Score-based or Timed) with at least one question. An unassigned-members pool starts alongside two blank teams — add more teams, rename them, and drag members from the pool (or between teams) to build the rosters.
      * Every member can belong to only one team; every team needs a name and at least one member; at least 2 teams are required.
      * Confirming snapshots the game's current questions and generates one short join code per team — the captain opens `quiz-play.html?teamCode=...` directly, or goes to `/quiz` and types the code in, with the result attributed to the whole team. Score-based teams play self-paced immediately; Timed teams wait for the host screen like individual Timed players do.
      * Track team setups in **Live Quiz** (**Team Setups** tab) — a list of started setups (with a Score/Timed type badge and a submitted/total progress count), and a per-setup view showing each team's roster, status, score (once submitted), and a copy-to-clipboard access code. A submitted team also gets a **View** action for a read-only, correct/incorrect-marked review of its answers.
6.  **Phase 4 — Live Hosting (Timed games only):**
      * Click **Launch** in the **Live Quiz** actions column. For a **Score** session or team setup, this opens a standalone leaderboard window that polls every 10 seconds and shows current standings as members/teams submit — anyone still pending shows their join code in big bold text in place of a status badge (so they can join straight off the shared screen), which disappears the moment they submit and is replaced by a **View** button opening that member's/team's correct/incorrect-marked answers in a new tab. For a **Timed** session or team setup, it opens the host screen (`quiz-host.html`) — a standalone, full-screen display with no side menu, meant for a shared screen (projector/TV).
      * The host screen's lobby shows every invited name alongside its join code in a large font. As each player/team actually connects (by opening their code on `/quiz`), their entry turns light green and the code disappears — a live, real-time view of who has joined, tracked over the same Socket.IO channel (no polling). A **START** button then broadcasts question 1 to every joined player/team's `quiz-play.html` page at once, each showing the same countdown.
      * `quiz-join.html` (also reachable at the short address `/quiz`) is the general landing page for players/captains who don't have a link — enter the 6-character join code and it resolves and redirects to the right `quiz-play.html?code=...` or `?teamCode=...` automatically, for either game type. Both `quiz-join.html` and `quiz-play.html` force a hard reload if the browser restores them from its back/forward cache, so navigating Back after finishing one quiz never carries a stale code or result into the next.
      * In **Live Quiz**, each session/team setup's Score/Timed badge is colour-coded (teal for Score, orange for Timed) so the two are easy to tell apart at a glance in the list.
      * A question ends automatically once the timer runs out or everyone has answered — every wrong option greys out, leaving the correct one in its original colour; on each player's own screen, whichever option they picked is also marked "Your answer" so they can see how they did even if they chose wrong. A big tick icon appears in the upper-left corner of the correct option if they got it right, or a big X icon in the upper-left corner of their own (wrong) pick if they didn't. The host then advances to a leaderboard (which lists each player's/team's join code next to their name, so anyone who disconnects — or if the quiz resumes after a long pause — can rejoin from `/quiz`), and clicks **Next Question** to continue. On the final question's leaderboard the button instead reads **Finish Quiz**. This repeats until the last question, which finalizes every participant's score exactly like the self-paced flow (so **Live Quiz** results/review screens, including the correct/incorrect-marked **View** answers page, work unchanged).
      * Since a Timed participant only flips to "submitted" at the very end, the **Live Quiz** list's Progress column shows the live question the host is on instead (e.g. "Question 2 of 5") rather than a submission count, which stays for Score sessions. On the player's/team's own `quiz-play.html` screen, the progress bar under the question counter switches the same way — it counts down the current question's time limit while a question is live, then between questions (leaderboard) and once finished it instead fills to reflect how many of the total questions are done (e.g. "Question 2 of 6" fills to ~33%, and "Finished" fills to 100%).
      * If the host screen is closed and reopened (or **Launch** clicked again), it always resumes from the leaderboard for the last completed question rather than mid-countdown, so no progress is lost.
      * Host presence is tracked over the same Socket.IO channel as the lobby's join indicators. If the host's tab disconnects mid-game (closed, crashed, lost network) while any player/team is mid-question or waiting on a leaderboard, every joined player's screen immediately shows a "Host disconnected — waiting for them to reconnect..." banner instead of silently freezing — including a player who joins/reloads *after* the disconnect already happened. The banner clears automatically the moment any host tab (the same one, or a fresh **Launch**) reconnects, and is suppressed once the quiz has finished.

## Example Data and Configuration

To facilitate a rapid setup and standardized testing, the application now includes a collection of pre-configured JSON examples located in the `./examples` directory. These files can be imported via the web interface to populate the system with actual FENZ Operational Instructions (OIs) and professionally formatted notification templates.

### 1\. Form Examples (`/examples/forms/`)

This directory contains JSON definitions for various skill verification questionnaires. These forms are designed for the **Live Forms** system and represent "online test" verifications.

  * **Standard OIs included:**

  * `IS1 - Operational Safety`

  * `G7 - Decontamination`

  * `H7-1 - Clandestine Laboratories`

  * `E3-2 - Respiratory Protection`

  * `IS3 - Working Near Roadways`

  * `...and more`

  * **Bulk Import:** You can replace the entire forms database by using the **Import All** tool in the **Forms Manager**.

  * **AI Generation:** A guide and prompt for generating additional form JSONs from FENZ PDFs can be found in `AI_FORM_GENERATION.md`.

### 2\. Template Examples (`/examples/templates/`)

These examples provide structured logic for the `mailer.js` and `whatsapp-service.js` modules.

  * **Notification Types:**

  * `template_skills.json`: Primary reminders for expiring competencies, including logic for both `row` (with URL) and `rowNoUrl` (for in-person training).

  * `template_accepted.json` / `template_rejected.json`: Automated feedback loops for admin reviews of member submissions, utilizing the `{{custom_comment}}` and `{{url}}` retry variables.

  * `template_surveys.json`: Dynamic invitations for Anonymous Surveys, utilizing the `{{surveyLink}}` variable.

  * `template_newuser.json`: Onboarding credentials for new system administrators.

  * **Implementation:** These can be imported into the **Templates** editor using the **Import JSON** feature.

### 3\. Quiz Game Examples (`/examples/quiz/`)

Ready-made games covering both Quiz Games types, importable via the **Import** button in `quiz-games.html`.

  * `quiz-chainsaw-operation.json`: A **Timed** game on OSM Specialist Chainsaw Operation (safety features, kickback, PPE, correct procedure).
  * `quiz-working-at-height.json`: A **Score-based** game on fall-arrest classifications, edge protection distances, anchor ratings, and the hierarchy of fall-protection controls.
  * **Demo mode:** these two are automatically seeded into `demo.db` by `scripts/generate-demo-db.js` (since Quiz Games is new and has no real production data to sanitise-and-copy) — visible via Preview/Test on the demo instance, since starting a session is disabled in demo mode.
  * **Full guide:** `docs/guides/OpReady-Quiz-Feature-Guide.pdf` is a complete illustrated Administrator and Player/Team guide for the Quiz Games feature, with real screenshots (desktop for admin, mobile for players/teams) generated end-to-end by `npm run guide:quiz` — see `scripts/scripts.md` for how it works and `.claude/skills/pdf-guide-builder/SKILL.md` for how to build a similar guide for another feature.

### Technical Schema Reference

Both forms and templates utilize a strict JSON schema validated by the backend.

  * **Forms/Surveys:** Managed via the `forms` and `surveys` tables in SQLite. Key fields include `structure` (a JSON stringified array of question objects) and `public_id` (a unique UUID for secure public access).
  * **Templates:** Persisted in the `preferences` table as serialized JSON objects.

## API Access

The application exposes its full REST API to external systems via **API Key authentication**. This allows dashboards, scripts, or integrations to read and write data without a browser session.

### Interactive API Reference

An interactive **Swagger UI** is available at:

```
GET /api/docs
```

Requires an active admin session. The raw OpenAPI 3.0 spec is also downloadable at `/api/docs/spec.json`.

---

### Managing API Keys

API keys are managed exclusively through **System Admin → API Management** (admin role required).

| Action | Description |
|--------|-------------|
| **Create** | Provide a name and role (`superadmin`, `admin`, `simple`, or `guest`). The full key is shown **once** — copy it immediately. |
| **Revoke / Enable** | Toggle a key active/inactive without deleting it. |
| **Delete** | Permanently removes the key. |

### API Call Log

Every request authenticated with an API key is recorded in the **API Call Log** section of the API Management page. The log captures key name, HTTP method, full endpoint URL (including query parameters), origin IP, **geographic location** (city and country resolved from the IP), user agent, and response status.

- **Geo-location:** Each entry resolves the caller's IP to a city and country using an offline GeoLite2 database (via `geoip-lite`). The location is displayed as a subtitle beneath the Origin IP in the table, and as a dedicated row in the mobile card view. Private and loopback addresses (`127.x`, `10.x`, `192.168.x`, `::1`, etc.) show no geo label.
- **Sort** by any column (Timestamp, Key Name, Method, Endpoint, Origin IP, Status). Sort column and direction persist across page reloads.
- **Filter** by key, method, endpoint text, and date range. Active filter fields are highlighted with a blue border.
- **Rows per page** can be changed from the pagination bar; the preference persists across reloads.
- **Purge** entries older than a configurable number of days (requires typing `PURGE` to confirm).

> **Security:** Only the SHA-256 hash of each key is stored in the database. If a key is lost, delete it and create a new one.

---

### Authenticating with an API Key

Add the key as an `X-API-Key` HTTP request header on any `/api/*` endpoint.

**curl:**
```bash
curl -H "X-API-Key: osm_a1b2c3d4..." \
     https://your-osm-instance.example.com/api/members
```

**JavaScript (fetch):**
```js
const res = await fetch('https://your-osm-instance.example.com/api/members', {
  headers: { 'X-API-Key': 'osm_a1b2c3d4...' }
});
const members = await res.json();
```

**Python (requests):**
```python
import requests

headers = {'X-API-Key': 'osm_a1b2c3d4...'}
r = requests.get('https://your-osm-instance.example.com/api/members', headers=headers)
members = r.json()
```

---

### Key Roles & Permissions

| Role | Access |
|------|--------|
| `superadmin` | All endpoints including backup, restore, event prune, and system tools |
| `admin` | Full read/write access to members, skills, forms, users, and preferences |
| `simple` | Read-only access to statistics and reports (`/api/statistics/*`, `/api/reports/*`) |
| `guest` | Read-only access to the member list and dashboard data |

**Role hierarchy enforcement:** The server enforces strict hierarchy on user management. An `admin` API key cannot modify another admin account or a superadmin account, and cannot create or promote accounts to a role equal to or higher than its own. Attempts return HTTP 403.

API keys **cannot** access HTML pages — those remain session-only. Endpoints restricted to `superadmin` (e.g., backup, restore, purge event log) are not accessible via an `admin` or lower key.

---

### Common Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/members` | List all members |
| `GET` | `/api/skills` | List all skills |
| `GET` | `/api/reports/data/by-member` | Compliance report grouped by member |
| `GET` | `/api/reports/data/by-skill` | Compliance report grouped by skill |
| `GET` | `/api/statistics/data/compliance-overview` | Dashboard compliance stats |
| `GET` | `/api/live-forms` | Live form submission records |
| `GET` | `/api/quiz/games` | List quiz games (with question bank) |
| `GET` | `/api/quiz/games/{id}/export` | Download a quiz game as a `.json` file |
| `GET` | `/api/live-quiz/sessions` | List quiz sessions (self-paced play instances) |
| `GET` | `/api/live-quiz/players/{playerId}/review` | Admin: view a submitted player's answers with correctness marked |
| `GET` | `/api/live-quiz/team-sessions` | List team setups (both game types, drag-and-drop team building) |
| `GET` | `/api/live-quiz/teams/{teamId}/review` | Admin: view a submitted team's answers with correctness marked |
| `GET` | `/api/live-quiz/play/{code}` | Public: fetch a player's quiz by access code |
| `GET` | `/api/live-quiz/team-play/{code}` | Public: fetch a team's quiz by access code (Score-based team setups) |
| `GET` | `/api/health` | Health check (no key required) |
| `GET` | `/api/ready` | Readiness probe — DB + WhatsApp state (no key required) |

**Pagination** — `GET /api/members` and `GET /api/skills` support optional pagination query parameters. Without them the full list is returned as a plain array (backward-compatible). With `limit` the response is a paginated wrapper:

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Max records to return. Activates paginated mode. |
| `offset` | integer | Records to skip (default `0`). |
| `search` | string | Case-insensitive substring filter on `name`. |
| `sortBy` | string | Column to sort by (see `/api/docs` for allowed values). |
| `sortDir` | `asc` \| `desc` | Sort direction (default `asc`). |

Paginated response shape: `{ "items": [...], "total": 150, "limit": 25, "offset": 0 }`

Every response includes an `X-Request-Id` header. Pass the same header in your request to propagate a trace ID through the logs; if omitted, the server generates a UUID automatically.

See `/api/docs` for the complete endpoint reference including request/response schemas.

---

## Knowledge Base

The Knowledge Base is a built-in document library that lets brigade administrators upload, organise, and share documents with members without requiring a login.

### Supported file types

The upload dialog groups allowed types into three categories — **Documents**, **Spreadsheets**, and **Images** — selectable as tabs above the file picker; choosing one narrows the browser's file picker to that category.

| Category | Type | Format | Member viewer |
|---|---|---|---|
| Documents | PDF | `.pdf` | Inline browser viewer (iframe) |
| Documents | Word | `.doc`, `.docx` | Google Docs Viewer (public URLs) / Download card |
| Documents | RTF | `.rtf` | Download only |
| Documents | Plain text | `.txt` | Inline browser viewer (iframe) |
| Documents | Markdown | `.md` | Download only |
| Spreadsheets | Excel | `.xls`, `.xlsx` | Google Docs Viewer (public URLs) / Download card |
| Images | PNG / JPEG / BMP | `.png`, `.jpg`, `.jpeg`, `.bmp` | Inline browser viewer (`<img>`) |

Maximum file size: **50 MB**.

**Disk space requirement (local storage only):** Before accepting any upload, the server checks available disk space on the KB storage partition. If less than **100 MB** is free, the upload is rejected with HTTP 507 Insufficient Storage. This guard applies only to the local filesystem backend — S3 and GCS manage their own capacity. Monitor free space on the server running OpReady and ensure at least several hundred MB are available for ongoing uploads.

### Public access — GUID links

Each document receives a unique UUID slug. The public URL is:

```
https://your-server.com/knowledgebase/4A04912E-F5C3-4CA6-91FC-8CBB3527AD81
```

No login is required. The UUID is the only access control — keep links confidential if the document is sensitive. On iOS Safari, PDFs and Office documents open via a download/open card because inline PDF embedding is not supported.

### Categories

Documents are organised in a collapsible folder/category tree with unlimited nesting depth. The document count badge next to each folder reflects the active filter state. Admins can create, rename, and delete categories; deleting a category re-parents its children and leaves documents as *Uncategorized*.

### Filters

The filter bar (collapsible on mobile) lets admins filter the document list by **title**, **description**, or **active/disabled status**. Category tree counts update to reflect the filtered set, so admins can see at a glance which categories contain matching documents.

### Document expiry

Every document has an optional **expiry date**. The default is *today + `KB_DEFAULT_EXPIRY_DAYS`* (default: 365). Set a different default in `.env`:

```env
KB_DEFAULT_EXPIRY_DAYS=365
```

Once a document's expiry date passes, its public link stops working automatically — viewing, downloading, and any `{{kb}}` links inserted into forms or surveys all show "Document Not Available". Expired documents are highlighted with a red `EXPIRED` badge in the document table and a red `!N` count in the category tree, but remain fully visible and manageable by admins. Admins can then:

- **Extend the expiry** — update the date in the Edit modal and save, restoring the public link immediately
- **Replace the file** — upload new content in the Edit modal (same link, same ID, bytes replaced)
- **Disable the document** — use the active toggle to block public access regardless of expiry (e.g. to retire it permanently rather than just extend the date)

### Replacing a document file

The Edit modal includes an optional **Replace Document File** section. Uploading a new file overwrites the stored bytes at the same storage path. The document's **id, public GUID slug, and all metadata are preserved** — only the file content changes. Use this to publish an updated version of a document while all existing shared links continue to work.

When a file is chosen for upload, the **Title** field is automatically pre-filled from the filename — hyphens and underscores are replaced with spaces and the extension is stripped (e.g. `fire-attack_procedures.pdf` → `fire attack procedures`). The title is always editable before saving.

### Missing file recovery

If a document's physical file is deleted from storage (e.g. manual deletion, a database-only restore without restoring the storage folder, or storage misconfiguration), the database record is preserved and the document remains listed in the Knowledge Base. Opening the **Edit** modal for such a document displays an amber warning banner:

> *File not found in storage — the document record is intact but the physical file is missing.*

The Replace Document File section is shown automatically. Upload a replacement file and save to restore the document. The document's public GUID link, ID, and all metadata remain unchanged.

The `GET /api/knowledgebase/documents/:id/file-status` endpoint (returns `{ exists: boolean }`) is used by the UI to detect this condition and can also be called by external integrations to audit storage consistency.

To proactively audit the entire library rather than discovering missing files one at a time, go to **System Tools → Knowledge Base → Find Documents with Missing Files** and click **Scan for Missing Files**. The scan checks every document record against the storage backend and lists any whose physical file is absent, including the title, filename, storage type, category, and active/inactive status. The equivalent API endpoint is `GET /api/knowledgebase/documents/missing-files`, which returns `{ total: <integer>, missing: [...] }`.  This scan is read-only and covers active and inactive documents.

### Per-document link rotation

The Edit modal includes a **Renew Link** button that generates a new GUID for that specific document, invalidating its current public URL. This is useful when a single link has been shared with unintended recipients without rotating all other document links.

For bulk rotation of all documents at once, see [Rotating slugs (security)](#rotating-slugs-security).

### Embedding links in forms and surveys

When editing a form or survey in the TinyMCE editor, the green **KB Link** button at the start of the toolbar opens a searchable document picker. Selecting a document inserts a placeholder link:

```html
<a href="{{kb:42}}" data-kb-id="42" class="kb-doc-link">Document Title</a>
```

The integer `id` (`42`) is the stable anchor — not the slug. When the form or survey is rendered for a member, the placeholder is resolved to the current public URL automatically. This means **rotating slugs does not break embedded links**.

### Linking a document to a skill (refresher material)

On the **Skills** page, each skill has an optional **Refresher Material** field. Click **Select Document** (same document picker used in forms/surveys) to link a Knowledge Base document to that skill, or **Clear** to unlink it. This is most useful for skills verified in person (no online form) — members can review the document before their practical assessment.

When a member's expiring-skills notification is generated, any linked document is resolved to its current public `/knowledgebase/{slug}` link and made available to the Skills email/WhatsApp templates (**Notification Templates** page) as the `{{kb-link}}` placeholder — it renders as a ready-to-use link and is left blank automatically for skills with no document linked. A document that has been disabled or has passed its expiry date is treated as unlinked for notification purposes, even though it remains linked on the skill (an admin can re-enable or extend it at any time).

### Rotating slugs (security)

Go to **System Tools → Rotate Document Links** and confirm with the keyword `ROTATE`. Every document is assigned a new UUID immediately. All previously shared `/knowledgebase/<guid>` URLs stop working. Embedded links in forms and surveys are unaffected.

### Storage backends

Controlled by `KB_STORAGE_TYPE` in `.env`:

| Value | Storage | Notes |
|---|---|---|
| `local` (default) | `./storage/knowledgebase/` on the server filesystem | Mounted as a Docker volume via `KB_STORAGE_HOST_PATH` |
| `s3` | AWS S3 (or any S3-compatible store) | Set `KB_S3_BUCKET` (supports `bucket/subfolder` prefix), `KB_S3_REGION`, `KB_S3_ACCESS_KEY_ID`, `KB_S3_SECRET_ACCESS_KEY`; optionally `KB_S3_ENDPOINT` for MinIO/R2 |
| `gcs` | Google Cloud Storage | Set `KB_GCS_BUCKET` (supports `bucket/subfolder` prefix); optionally `KB_GCS_KEY_FILE` for explicit credentials |

The public GUID slug and the internal storage key are **separate UUIDs** generated at upload time. Rotating slugs never touches stored files.

---

## Testing

| Command | When to run | Requires |
|---------|-------------|---------|
| `npm test` | Before every commit | Nothing — runs in-process |
| `npm run test:coverage` | CI coverage gate | Nothing — runs Jest with `--coverage`; fails if line coverage drops below 70% |
| `npm run test:ui` | Before every frontend change | Nothing — spins up its own demo server |
| `npm run test:all` | Pre-merge / CI | Nothing — combines the two above |
| `npm run test:api` | Pre-UAT deploy | Live instance + admin API key |

The first three suites are fully self-contained and require no credentials or running server. `test:api` is a release-gate check that runs Newman against a real environment — keep it separate from the development workflow.

---

The project has three independent test suites that cover different layers of the application.

### Backend tests (Jest + Supertest)

Unit and integration tests for all API route handlers. Supertest mounts the Express app in-process — no running server needed.

```bash
npm test
```

To run both backend and UI tests in one go:

```bash
npm run test:all
```

Tests live in `tests/` with one file per route domain (e.g. `tests/members.test.js`). All suites must pass before any backend change is merged.

---

### UI smoke tests (Playwright)

End-to-end tests that launch a real headless Chromium browser against a live server instance and visit every page of the application. The suite fails if any page produces an uncaught JavaScript exception or a `console.error` call.

#### Prerequisites

Playwright and the Chromium browser binary are installed automatically as part of `npm install` + the one-time browser install step:

```bash
npm install
npx playwright install chromium
```

#### Running the tests

```bash
npm run test:ui
```

Playwright starts the server automatically on port **3099** in `APP_MODE=demo` (so it never touches your production database), logs in with the `demo` / `demo` superadmin, then visits all 20 pages. The dev server on port 3000 is unaffected.

**What is tested:**

| Category | Pages covered |
|---|---|
| Public | Login |
| Members & Skills | Members, Skills |
| Forms | Forms Manage, Live Forms, Forms View |
| Surveys | Surveys Manage, Live Surveys, Surveys Results, Surveys Tracking, Surveys View |
| Reports & Stats | Reports, Statistics |
| Training | Training Planner |
| Admin | Event Log, Templates, Third Parties, Users, System Tools, Backup & Restore |
| User | Profile |

#### Overriding credentials

If you need to test against a non-demo server, override via environment variables before running:

```bash
# PowerShell
$env:TEST_USERNAME = "myadmin"
$env:TEST_PASSWORD = "mypassword"
$env:TEST_PORT     = "3000"
npm run test:ui
```

#### Output

Results are printed to the terminal in list format. On failure, Playwright saves a screenshot to `test-results/` showing exactly what the browser rendered when the error occurred.

---

### API smoke tests (Newman)

Read-only API smoke tests that run against a live OpReady instance (local or cloud UAT). Every test is a GET request with assertions — no data is created or modified.

**What is tested:**

| Test | Endpoint | Assertion |
|---|---|---|
| T20-01 Health Check | `GET /api/system/health` | `status: ok`, `db: connected`, version present |
| T20-02 API Docs | `GET /api/docs` | HTTP 200 |
| T20-03 Auth guard | `GET /api/members` (no key) | HTTP 401/302/403 — no data exposed |
| — Members | `GET /api/members` | HTTP 200, JSON array |
| — Skills | `GET /api/skills` | HTTP 200, JSON array |
| — Forms | `GET /api/forms` | HTTP 200, JSON array |
| — Live Forms | `GET /api/live-forms` | HTTP 200, valid JSON |
| — Surveys | `GET /api/surveys` | HTTP 200, JSON array |
| — Survey Instances | `GET /api/surveys/instances` | HTTP 200, JSON array |
| — Training | `GET /api/training` | HTTP 200, JSON array |
| — Users | `GET /api/users` | HTTP 200, JSON array |
| — API Keys | `GET /api/api-keys` | HTTP 200, JSON array |
| — Preferences | `GET /api/system/preferences` | HTTP 200, valid JSON |
| — Event Log | `GET /api/system/events` | HTTP 200, valid JSON |

All requests must respond within 5 seconds.

#### One-time setup

```powershell
# 1. Install Newman (already a devDependency — just run npm install)
npm install

# 2. Copy the environment template and fill in your values
Copy-Item examples/api/newman-environment.example.json examples/api/newman-environment.local.json
# Then edit newman-environment.local.json:
#   "baseUrl"  → your UAT instance URL  (e.g. https://opready.example.com)
#   "apiKey"   → an admin-role API key from System Admin → API Management
```

`newman-environment.local.json` is gitignored — it stays on your machine.

#### Running the tests

```powershell
# Terminal output only
npm run test:api

# Terminal output + JSON report saved to newman-report.json
npm run test:api:report
```

Newman prints a summary table: requests run, assertions passed/failed, average response time. A non-zero exit code means at least one assertion failed.

---

## Docker Deployment

1.  **Build and Run:**
    ```bash
    docker compose up -d --build
    ```
2.  **Persistence:** The `docker-compose.yml` mounts the local directory to `/app`, ensuring your `fenz.db` persists restarts.
3.  **Health check:** The image includes a `HEALTHCHECK` that polls `GET /api/health` every 30 seconds (40-second start period, 3 retries). Docker marks the container `unhealthy` after three consecutive failures — use `docker ps` or `docker inspect` to check status.
4.  **Graceful shutdown:** Sending `SIGTERM` or `SIGINT` to the process (e.g. `docker stop`) drains Socket.IO connections, disconnects the WhatsApp client if enabled, and closes the database cleanly before the process exits. The default `docker stop` timeout is 10 seconds — sufficient for normal shutdown.
5.  **Database WAL mode:** The SQLite database runs in WAL (Write-Ahead Logging) mode. This creates two additional files alongside `fenz.db` (`fenz.db-wal` and `fenz.db-shm`) while the server is running. These are normal and should be included in any backup. They are automatically checkpointed and removed on clean shutdown.
6.  **Multi-stage build:** The `Dockerfile` uses a two-stage build. The `builder` stage installs `python3`, `make`, and `g++` to compile native Node.js addons (e.g. `better-sqlite3`). The `runtime` stage copies only the pre-built `node_modules` and the app source — no build tooling is present in the final image, reducing the attack surface.
7.  **Non-root execution:** The runtime image runs as the built-in `node` user (UID 1000) rather than root. This applies to Cloud Run and any deployment where the image runs without a bind mount — the `chown -R node:node /app` layer in the Dockerfile is effective in that case. The provided `docker-compose.yml` overrides this with `user: "0"` because it bind-mounts the host directory at `/app`, meaning host-file ownership governs write access rather than the image layer. The `USER node` instruction still appears in the Dockerfile so that production image deployments (no bind mount) benefit from non-root execution automatically.
8.  **Knowledge Base document storage:** Uploaded PDFs are stored at `./storage/knowledgebase` on the host (the directory is gitignored and created automatically on first upload). The `docker-compose.yml` mounts this path explicitly at `/app/storage/knowledgebase` inside the container so files survive container recreation:

    ```yaml
    - ${KB_STORAGE_HOST_PATH:-./storage/knowledgebase}:/app/storage/knowledgebase
    ```

    To redirect storage to a different host path — for example an external disk or NAS mount — set `KB_STORAGE_HOST_PATH` in your `.env`:

    ```env
    KB_STORAGE_HOST_PATH=/mnt/nas/opready-kb
    ```

    For **cloud or server deployments** where local disk is not suitable, switch to S3 or GCS instead and remove the volume entry:

    ```env
    KB_STORAGE_TYPE=s3
    KB_S3_BUCKET=my-bucket
    KB_S3_REGION=ap-southeast-2
    KB_S3_ACCESS_KEY_ID=...
    KB_S3_SECRET_ACCESS_KEY=...
    ```

    When `KB_STORAGE_TYPE` is `s3` or `gcs`, no local directory or volume mount is needed for document storage.

## Cloudflare Tunnel

Expose OpReady over **HTTPS** from a local or on-premise server — no inbound firewall ports, no SSL certificates to manage — using a Cloudflare Tunnel (`cloudflared`). HTTPS is also required for PWA installation on Android devices and for the service worker to register on non-localhost origins.

Two deployment styles are covered in the guide:

| Style | When to use |
|---|---|
| **Bare-metal (systemd service)** | Running OpReady directly on a Linux server with `node server.js` |
| **Docker sidecar (docker-compose)** | Running OpReady via `docker compose up` |

See the full [Cloudflare Tunnel Guide](cloudflared-tunnel.md) for step-by-step instructions.

---

## Google Cloud Run Deployment

Supports stateless deployment using **Litestream** to replicate the database to Google Cloud Storage. Must be deployed with `--max-instances 1` — the real-time Quiz Games live-hosting feature (Socket.IO) and the SQLite/Litestream setup both assume a single running instance.

See [Installation on Google Cloud Run](Installation_google_run.md) for details.

## Progressive Web App (PWA)

OpReady ships as a full Progressive Web App, installable on any device directly from the browser.

### Installing

| Platform | Steps |
|---|---|
| **Android (Chrome)** | Accept the *Install OpReady* banner that appears at the top of any page, or use the browser menu → **Install app** |
| **iOS (Safari)** | Tap the Share icon → **Add to Home Screen** |
| **Desktop (Chrome / Edge)** | Accept the install banner, or use the address-bar install icon, or browser menu → **Install OpReady** |

### What you get

* **Home screen / taskbar shortcut** — one-tap access, no browser chrome
* **Offline fallback** — recently visited pages remain accessible when there is no network; the app shows a friendly offline page for content not yet cached
* **Background asset caching** — CSS, JS, and icons are served from the local cache after the first visit; updates are applied silently on next reload
* **App shortcuts** — long-press the icon to jump directly to Dashboard, Live Forms, or Members

### Regenerating icons

If the favicon is replaced, regenerate all PWA icon sizes:

```bash
node scripts/generate-icons.js
```

Icons are written to `public/icons/`. The manifest references them at `/icons/icon-{size}.png`.

### Caching strategy

| Request type | Strategy |
|---|---|
| App shell (CSS, JS, core images) | Cache-first; updated on every SW install |
| HTML page navigations | Network-first; falls back to cached page, then `/offline.html` |
| Static assets (other images, fonts) | Stale-while-revalidate |
| `/api/*` requests | Network-only (never cached) |

---

## Integrations

  * [**WhatsApp Feature Guide**](whatsapp-feature.md): Detailed instructions on connecting your WhatsApp account, managing sessions, and sending mobile notifications.
  * [**Cloudflare Tunnel Guide**](cloudflared-tunnel.md): Step-by-step instructions for exposing OpReady over HTTPS using a Cloudflare Tunnel — covers both bare-metal (systemd service) and Dockerized (docker-compose sidecar) deployments. Required for PWA installation on Android and other non-localhost devices.

### Built-in Scheduled Backup

For **persistent deployments** (local machine, EC2, GCE, or any always-on VM), use the built-in scheduler on the **Backup & Restore** page. Configure the frequency (daily, weekly, every N hours, or every N days), save location, and retention policy directly in the UI. Set `DEPLOYMENT_TYPE=local` or `DEPLOYMENT_TYPE=vm` in `.env` to enable the feature. The scheduler persists its configuration in the database and restarts automatically when the server starts.

#### Docker — mount the backup location as a volume

When running inside Docker, the save location you configure is a path **inside the container**. If the container is ever recreated or the image rebuilt, that directory — and all backup files in it — will be lost. Always mount the backup directory as a named or host-path volume so files survive container recreation.

The `docker-compose.yml` already includes this volume out of the box:

```yaml
- ${BACKUP_HOST_PATH:-./backups}:/app/backups
```

The host directory defaults to `./backups` (next to `docker-compose.yml`, already gitignored). Set the backup save location in the **Backup & Restore** UI to the **container-side path**: `/app/backups`.

To redirect backup files to a different host path — for example an external disk or NAS — set `BACKUP_HOST_PATH` in `.env`:

```env
BACKUP_HOST_PATH=/mnt/nas/opready-backups
```

> **Tip:** `/app/backups` is the recommended container-side path — it does not overlap with `/app/storage/knowledgebase` (used for Knowledge Base documents) or any other existing mount.

### Scheduled External Backup (for ephemeral / cloud deployments)

The backup endpoint accepts API key authentication (`X-API-Key` header) so it can be called from any external scheduler — no browser session required. Two modes are available:

| Endpoint | Output | Contains |
|---|---|---|
| `GET /api/system/backup?type=db` | `.sql` | Database only |
| `GET /api/system/backup?type=full` | `.zip` | Database + local KB documents |

Use `type=db` for Cloud Run / S3/GCS deployments where documents live in the cloud. Use `type=full` for local/Docker deployments to capture everything in one file.

This is the recommended backup strategy for Cloud Run deployments, where keeping the instance running continuously just to run scheduled jobs would incur unnecessary cost. The HTTP request wakes the instance, the dump is streamed back, and the instance returns to idle.

#### Step 1 — Create a superadmin API key

In the app UI go to **System Admin → API Management**, create a key with the `superadmin` role, and copy the value. Store it securely on the machine that will run the backup.

#### Step 2 — Write the backup script

A ready-to-use script is provided at [`examples/system/backup-opready.sh`](examples/system/backup-opready.sh). Copy it to your backup machine (Raspberry Pi, VPS, or similar) and fill in the variables at the top:

```bash
#!/bin/bash
# backup-opready.sh — downloads a database-only SQL backup from OpReady
# For a full backup (DB + KB documents) change ?type=db to ?type=full
# and update the filename extension to .zip.
# Recommended schedule: daily via cron

API_KEY="osm_your64hexkeyhere"
BASE_URL="https://your-cloud-run-url.run.app"
BACKUP_DIR="/home/pi/opready-backups"
DATE=$(date +%Y-%m-%d)

# Retention policy — choose one or both:
KEEP_DAYS=30    # delete backups older than this many days (0 = disabled)
KEEP_COUNT=10   # keep only the N most recent files     (0 = disabled)

mkdir -p "$BACKUP_DIR"

HTTP_STATUS=$(curl -s -w "%{http_code}" \
  -H "X-API-Key: $API_KEY" \
  -o "$BACKUP_DIR/opready-db-backup-${DATE}.sql" \
  "${BASE_URL}/api/system/backup?type=db")

if [ "$HTTP_STATUS" -eq 200 ]; then
  echo "[$(date)] Backup saved: opready-db-backup-${DATE}.sql"
else
  echo "[$(date)] Backup FAILED — HTTP $HTTP_STATUS" >&2
  rm -f "$BACKUP_DIR/opready-db-backup-${DATE}.sql"
  exit 1
fi

# Retention: remove files older than KEEP_DAYS days
if [ "$KEEP_DAYS" -gt 0 ]; then
  find "$BACKUP_DIR" -name "opready-db-backup-*.sql" -mtime +"$KEEP_DAYS" -delete
fi

# Retention: keep only the KEEP_COUNT most recent files
if [ "$KEEP_COUNT" -gt 0 ]; then
  ls -1t "$BACKUP_DIR"/opready-db-backup-*.sql 2>/dev/null | tail -n +"$((KEEP_COUNT + 1))" | xargs -r rm --
fi
```

Make it executable:

```bash
chmod +x backup-opready.sh
```

#### Step 3 — Schedule with cron

```bash
crontab -e
```

Add a daily job (example: 2:00 AM):

```
0 2 * * * /home/pi/backup-opready.sh >> /home/pi/opready-backups/backup.log 2>&1
```

#### Restoring from a backup

To restore, upload the backup file via the UI (**Backup & Restore** page — accessible from the System Admin menu or System Tools), or call the restore endpoint directly:

```bash
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -F "databaseFile=@/home/pi/opready-backups/fenz_backup_2025-01-15.sql" \
  "${BASE_URL}/api/system/restore"
```

> **Warning:** restore replaces the entire database and invalidates all active sessions.

> **Large full backups on Cloud Run:** the curl example above sends the whole file in one request. Cloud Run enforces a hard ~32MB request-body limit at the platform layer — a `.sql` dump rarely hits this, but a full `.zip` backup with a healthy Knowledge Base often does. The Backup & Restore UI handles this automatically by splitting large uploads into chunks (`POST /api/system/restore/chunk` + `POST /api/system/restore/finalize`); a script or scheduler restoring a large `.zip` directly via curl on Cloud Run should do the same, or restore the `.sql` (database only) instead.

#### Using Google Cloud Scheduler instead of a local machine

If you prefer a fully cloud-native solution, create a Cloud Scheduler job targeting the same endpoint:

| Field | Value |
|---|---|
| **Frequency** | `0 2 * * *` (daily at 2 AM) |
| **Target type** | HTTP |
| **URL** | `https://your-cloud-run-url.run.app/api/system/backup` |
| **HTTP method** | GET |
| **Auth header** | Add header `X-API-Key` with your superadmin key value |

The response body (the `.sql` file) can be captured by routing the job through a Cloud Function or Workflow that writes it to a Cloud Storage bucket.

---

### WhatsApp Resilience

The WhatsApp service includes built-in fault tolerance:

* **Automatic Reconnection:** On an unexpected disconnect the service waits and retries automatically using exponential backoff — 5 s, 15 s, 60 s, then 5 min intervals. The UI displays a `RECONNECTING` status during recovery. Manual logout suppresses auto-reconnect.
* **Message Queue:** Messages sent while the client is offline are queued (up to 100) and delivered automatically once the connection is restored. Each message is retried up to 3 times across reconnect cycles; permanently undeliverable messages are logged and dropped cleanly.

## Project Structure

```text
├── .env                        # Secrets & config (generated by npm run setup-env)
├── server.js                   # Express app — route mounting, Socket.IO, middleware chain
├── main.js                     # Process entry point — starts server.js
├── config.js                   # Config loader (env vars → structured object)
├── start.sh                    # Litestream + Node startup script (Cloud Run / Docker)
├── Dockerfile                  # Container definition
├── docker-compose.yml          # Local Docker Compose stack
├── litestream.yml              # Litestream replication config (GCS)
├── fenz.db                     # SQLite main database
├── sessions.db                 # SQLite session store (express-session)
├── migrations/                 # Auto-applied SQL migrations (numeric order)
│   ├── 001-baseline.sql
│   ├── ...
│   └── 010-etl-plugin-fields.sql
├── middleware/
│   ├── auth.js                 # globalAuthGuard, hasRole(), ROLES, X-API-Key check
│   └── rate-limiter.js         # apiLimiter, loginLimiter, publicSubmitLimiter
├── routes/
│   ├── auth.js                 # /login, /logout, /forgot-password
│   ├── views.js                # HTML page serving
│   └── api/
│       ├── api-keys.js         # API key CRUD
│       ├── docs.js             # Swagger UI + OpenAPI spec (/api/docs)
│       ├── forms.js            # Form template management
│       ├── live-forms.js       # Form issue / submit / accept / reject
│       ├── live-surveys.js     # Survey instance tracking
│       ├── members.js          # Member CRUD + import
│       ├── profile.js          # Current-user profile
│       ├── reports.js          # Compliance report data
│       ├── skills.js           # Skill CRUD + import
│       ├── statistics.js       # Dashboard aggregate metrics
│       ├── surveys.js          # Survey template management
│       ├── system.js           # Health, preferences, backup/restore, event logs
│       ├── training.js         # Training session management
│       └── users.js            # Admin user management
├── services/
│   ├── db.js                   # Barrel export — facade for all DB modules
│   ├── db/
│   │   ├── connection.js       # initDB(); delegates migrations to migration-runner.js
│   │   ├── api-keys.js         # API key CRUD + hashing
│   │   ├── backup.js           # generateSqlDump(), restoreFromSqlDump()
│   │   ├── events.js           # Event log CRUD
│   │   ├── members.js          # Member queries
│   │   ├── preferences.js      # System & user preferences
│   │   ├── skills.js           # Skill queries
│   │   ├── surveys.js          # Survey template & instance queries
│   │   ├── training.js         # Training session queries
│   │   └── users.js            # Admin user queries
│   ├── plugins/
│   │   ├── html-scraper.plugin.js  # Default plugin — scrapes the OI HTML dashboard
│   │   ├── rest-api.plugin.js      # Stub — future REST API data source
│   │   └── name-parser.js          # Parses raw OI name strings → rank/lastName/firstName
│   ├── ai-service.js           # AI text-answer grading (Gemini or local Ollama)
│   ├── env-validator.js        # Startup environment / config validation
│   ├── extraction-engine.js    # ETL orchestrator — plugin loader, cache, unified entry point
│   ├── forms-service.js        # Form lifecycle: issue, score, accept/reject, bulk import
│   ├── logger.js               # Winston logger
│   ├── mailer.js               # SMTP notification service
│   ├── member-manager.js       # Skill expiry enrichment, status mapping, date parsing
│   ├── migration-runner.js     # Applies migrations/NNN-*.sql in numeric order
│   ├── proxy-manager.js        # NZ proxy sourcing and verification for the scraper
│   ├── rank-config.js          # Rank display names and ordering
│   ├── report-service.js       # Compliance reports (7 views)
│   ├── statistics-service.js   # Aggregate compliance metrics and dashboard stats
│   └── whatsapp-service.js     # WhatsApp headless client (auto-reconnect + message queue)
├── public/                     # Frontend — static HTML + vanilla JS
│   ├── styles.css              # Global CSS (dark mode, layout, components)
│   ├── help.js                 # In-app contextual help (all pages)
│   ├── utils.js                # Shared utilities (confirmAction, promptAction, initPageTitle)
│   ├── toast.js                # Toast notification helper
│   ├── app.js                  # Dashboard controller
│   ├── index.html              # Dashboard
│   ├── members.html            # Member management
│   ├── skills.html             # Skill management
│   ├── live-forms.html         # Live form tracking
│   ├── live-surveys.html       # Live survey tracking
│   ├── surveys-manage.html     # Survey template management
│   ├── surveys-view.html       # Public survey submission page
│   ├── surveys-results.html    # Survey results viewer
│   ├── surveys-tracking.html   # Survey campaign tracker
│   ├── training-planner.html   # Training session planner
│   ├── reports.html            # Compliance reports
│   ├── statistics.html         # Compliance statistics & charts
│   ├── event-log.html          # Audit log
│   ├── system-tools.html       # Tabbed: Knowledge Base tab (link rotation, missing-file scan); AI tab (AI Evaluator Test Lab)
│   ├── backup-restore.html     # Backup & Restore (dedicated page, superadmin only)
│   ├── users.html              # Admin user management
│   ├── profile.html            # Current-user profile
│   ├── forms-manage.html       # Form template management
│   ├── forms-view.html         # Public form submission page
│   ├── login.html              # Login page
│   ├── js/                     # Shared JS modules (reports controller, etc.)
│   └── reports/                # Report renderer modules (one per report type)
├── examples/
│   ├── api/                    # Postman & Newman collections
│   ├── forms/                  # Form definition export samples (JSON)
│   ├── skills/                 # Skills export sample (CSV)
│   ├── system/
│   │   └── backup-opready.sh   # External scheduled backup script
│   └── templates/              # Notification email template samples (JSON)
├── scripts/
│   ├── setup-env.js            # Interactive .env generator (npm run setup-env)
│   ├── generate-demo-db.js     # Generates demo.db seed data
│   ├── generate-icons.js       # Regenerates PWA icon sizes from favicon
│   ├── release.js              # Version bump + changelog helper
│   ├── take-screenshots.js     # Automated UI screenshots
│   └── scripts.md              # Index of all scripts with usage instructions
└── tests/
    ├── test-utils.js           # Shared Jest/supertest app setup
    ├── *.test.js               # Jest + supertest backend test suites (one per domain)
    └── ui/
        ├── global-setup.js     # Playwright login once, saves auth-state.json
        ├── smoke.spec.js       # Visits all pages, asserts zero JS errors
        └── *.spec.js           # Feature-level Playwright UI tests
```

## Credits

  * **Project Lead & Developer:** Gerardo Dassi
  * **Web Framework:** Express.js
  * **Database:** SQLite via `sqlite` + `sqlite3`
  * **Persistence & Replication:** Litestream
  * **Real-time UI:** Socket.IO
  * **WhatsApp Integration:** whatsapp-web.js
  * **Email:** Nodemailer
  * **HTML Scraping:** Cheerio
  * **AI Evaluation:** Google Generative AI (Gemini)
  * **API Documentation:** Swagger UI Express
  * **Security:** Helmet
  * **Logging:** Winston
  * **Backend Testing:** Jest + Supertest
  * **UI Testing:** Playwright
  * **API Smoke Testing:** Newman
  * **Icons:** Feather Icons
  * **AI Assistance:** A significant portion of the code and documentation in this project was generated by **Google Gemini** and **Anthropic Claude Code**, acting as pair programmers under the guidance and architectural direction of the Project Lead.

## License

MIT License

Copyright (c) 2025 Gerardo Dassi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

