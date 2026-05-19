
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
      * **Self-Service:** Users can manage their profiles and recover lost passwords via email.
  * **Web-Based Management:**
      * **Members:** Add, edit, delete, and CSV Import/Export members directly in the browser.
      * **Skills:** Configure which skills to track and mark them as Critical.
      * **Smart Form Links:** Define Online Form URLs with dynamic placeholders (e.g., `{{member-name}}`) to pre-fill member details automatically.
      * **Email Templates:** A rich-text editor with drag-and-drop variables to customize notifications for Expiring Skills, Surveys, New Users, Password Resets, and Account Deletions.
  * **Reports Console:**
      * **Flexible Reporting:** Generate comprehensive reports grouped by **Member** (for individual follow-up) or **Skill** (for planning training blocks).
      * **Export Options:** Includes built-in support for browser Printing (A4 optimized) and direct **PDF Export**.
      * **Localization:** Reports automatically respect your configured Date Format and Timezone settings.
  * **Training Planner:**
      * **Visual Scheduling:** A drag-and-drop calendar to plan in-person training sessions for skills that don't have online forms.
      * **Smart Filtering:** A "Show Training Day Only" toggle that hides irrelevant days and expands the calendar to fill the screen.
      * **Training Day Highlight:** Define your brigade's standard training day in `.env` to have it automatically highlighted.
  * **System Maintenance & Auditing:**
      * **Database Backup & Restore:** Download full database snapshots and restore them with strict version compatibility checks.
      * **Event Log:** A comprehensive audit trail recording all major actions.
      * **Log Maintenance:** Super Admins can prune old events, purge the entire log, or export it to JSON.
  * **Geoblocking Bypass:** Built-in proxy manager with support for **Fixed** (paid) and **Dynamic** (free) proxies.
  * **Cloud-Native Persistence:** Uses **Litestream** to replicate the SQLite database to Google Cloud Storage (GCS) for stateless deployments (e.g., Google Cloud Run).
  * **Dockerized:** Ready for production deployment with a flexible configuration system.
  * **Demo Mode:** Run the application in a fully sandboxed environment using static local data and a separate database (`demo.db`). This allows for safe testing and demonstration without connecting to the live OSM Dashboard or risking production data.
  * **WhatsApp Integration:** Send expiring skill notifications directly to members' WhatsApp accounts using a headless client. Includes support for bulk sending, test messages, session management, **automatic reconnection with exponential backoff**, and a **message queue** that retries delivery once the connection is restored.
  * **REST API with API Key Authentication:** Every `/api/*` endpoint can be called by external systems using an `X-API-Key` request header. Keys are managed (create, revoke, delete) through the System Tools page without restarting the server.
  * **API Reference (Swagger UI):** Interactive OpenAPI 3.0 documentation is available at `/api/docs` for authenticated admin users.

## Table of Contents

  * [Prerequisites](#prerequisites)
  * [Installation](#installation)
  * [Configuration](#configuration)
  * [UI Customization](#ui-customization)
  * [Usage](#usage)
  * [Demo Mode](#demo-mode)
  * [API Access](#api-access)
  * [Testing](#testing)
  * [Docker Deployment](#docker-deployment)
  * [Cloudflare Tunnel](#cloudflare-tunnel)
  * [Google Cloud Run Deployment](#google-cloud-run-deployment)
  * [Project Structure](#project-structure)
  * [Troubleshooting](#troubleshooting)
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
    The application uses environment variables for sensitive data. Create your `.env` file from the example template:

    ```bash
    cp .example.env .env
    ```

## Configuration

The application is configured primarily via the **`.env`** file.

### Environment Variables (`.env`)

Open the `.env` file and configure the following parameters:

#### **Application Security (Super Admin)**

  * `APP_USERNAME`: The username for the immutable Super Admin (e.g., `admin`).
  * `APP_PASSWORD`: A strong password for the Super Admin.
  * `SESSION_SECRET`: A long, random string used to encrypt session cookies.
  * `MAX_LOGIN_ATTEMPTS`: Maximum number of failing login attempt before a user is blocked and a notification is sent to the super user (default 5).

#### **Operation Mode**

  * `APP_MODE`: Set to `production` (default) for live scraping, or `demo` to enable the sandboxed demo mode.

#### **Demo Secrets (Only used when APP_MODE=demo)**

  * `DEMO_SUPERADMIN_USERNAME`: The username for the Super Admin in demo mode.
  * `DEMO_SUPERADMIN_PASSWORD`: The password for the Super Admin in demo mode.

#### **Application Settings**

  * `APP_TIMEZONE`: The timezone used for date calculations (e.g., `Pacific/Auckland`). Defaults to NZ time.
  * `APP_LOCALE`: The locale used for date/time formatting strings (e.g., `en-NZ`, `en-US`). Defaults to `en-NZ`.
  * `TRAINING_DAY_OF_WEEK`: Your brigade's training day (e.g., `Monday`). Used to highlight the day in the Training Planner.   
  * `APP_BASE_URL`: Public URL of your app (e.g., https://osm.station44.nz). Required for valid form links (default http://localhost:3000).   
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

#### **OSM Dashboard Connection**

  * `OSM_BU_ID`: **Crucial.** Your unique Business Unit ID (GUID) for the dashboard (e.g., `87FF646A-FCBC-49A1-9BAC-XXXXXXXXXXX`). The system will automatically construct the correct URL.
  * `DASHBOARD_URL`: (Optional) Override the automatic URL construction if you have a custom link.
  * `SCRAPING_INTERVAL`: Minutes to cache data before scraping the live site again (Default: `60`).

#### **Email Configuration (SMTP)**

  * `SMTP_SERVICE`: The service provider (e.g., `gmail`).
  * `SMTP_USER`: Your full email address.
  * `SMTP_PASS`: Your email password (or App Password).

#### **Proxy Configuration (Geoblocking Bypass)**

  * `PROXY_MODE`: Set to `none` (local NZ), `fixed` (paid proxy), or `dynamic` (free scraper).
  * `PROXY_URL`: Required if mode is `fixed`.

#### **WhatsApp Integration**
  * `ENABLE_WHATSAPP`: Set to `true` to enable the WhatsApp service and menu items.

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
  * **Creating Users:** When you add a user, the system generates a secure random password and emails it to them automatically.
  * **Deleting Users:** Deleting a user will also send them a notification email.
  * **MFA Authentication:** Enhance security using an authenticator app (e.g. Google Authenticator).

### 3\. Dashboard Workflow

1.  **Manage Members**: Import your team via CSV.
2.  **Manage Skills**:
      * Add skill names exactly as they appear on the OSM Dashboard.
      * **Templated URLs:** You can use variables in the "Form URL" field.
          * Example: `https://docs.google.com/forms/...?entry.123={{member-name}}`
          * The system will auto-fill the member's name and email when generating the link.
3.  **Email Templates**: Use the tabbed editor to customize the `Expiring Skills`, `New User`, `Password Reset`, and `Account Deleted` emails. Drag and drop variables directly into the text.
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

See the [AI Form Generation Guide](https://www.google.com/search?q=AI_FORM_GENERATION.md) for a ready-to-use prompt and detailed instructions.

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

API keys are managed exclusively through **System Tools → API Key Management** (admin role required).

| Action | Description |
|--------|-------------|
| **Create** | Provide a name and role (`admin` or `simple`). The full key is shown **once** — copy it immediately. |
| **Revoke / Enable** | Toggle a key active/inactive without deleting it. |
| **Delete** | Permanently removes the key. |

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
| `admin` | Full read/write access to all `/api/*` endpoints |
| `simple` | Read-only access to statistics and reports (`/api/statistics/*`, `/api/reports/*`) |

API keys **cannot** access HTML pages — those remain session-only. Endpoints restricted to `superadmin` (e.g., purge event log) are not accessible via API key.

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
| `GET` | `/api/health` | Health check (no key required) |

See `/api/docs` for the complete endpoint reference including request/response schemas.

---

## Testing

| Command | When to run | Requires |
|---------|-------------|---------|
| `npm test` | Before every commit | Nothing — runs in-process |
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
| Admin | Event Log, Templates, Third Parties, Users, System Tools |
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
#   "apiKey"   → an admin-role API key from System Tools → API Key Management
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

Supports stateless deployment using **Litestream** to replicate the database to Google Cloud Storage.

See [Installation on Google Cloud Run](https://www.google.com/search?q=Installation_google_run.md) for details.

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

### WhatsApp Resilience

The WhatsApp service includes built-in fault tolerance:

* **Automatic Reconnection:** On an unexpected disconnect the service waits and retries automatically using exponential backoff — 5 s, 15 s, 60 s, then 5 min intervals. The UI displays a `RECONNECTING` status during recovery. Manual logout suppresses auto-reconnect.
* **Message Queue:** Messages sent while the client is offline are queued (up to 100) and delivered automatically once the connection is restored. Each message is retried up to 3 times across reconnect cycles; permanently undeliverable messages are logged and dropped cleanly.

## Project Structure

```text
├── .env                      # Secrets & Config
├── server.js                 # Express Web Server
├── fenz.db                   # SQLite Database
├── config.js                 # Configuration loader
├── start.sh                  # Startup Script (Litestream)
├── migrations/               # Auto-applied SQL migrations
│   ├── 001-baseline.sql
│   ├── ...
│   └── 009-add-api-keys.sql  # API key table
├── middleware/
│   └── auth.js               # globalAuthGuard, hasRole, X-API-Key support
├── public/                   # Frontend Assets
│   ├── reports/              # Report Renderers
│   ├── email-templates.html  # Template Editor
│   ├── system-tools.html     # Backup/Restore + API Key Management
│   ├── event-log.html        # Audit Log
│   └── ...
├── routes/api/               # REST API Routers
│   ├── api-keys.js           # API key CRUD
│   ├── docs.js               # Swagger UI + OpenAPI spec (/api/docs)
│   └── ...
├── services/                 # Backend Logic
│   ├── db.js                 # Database Adapter (facade)
│   ├── db/
│   │   ├── api-keys.js       # API key DB functions
│   │   └── ...
│   ├── mailer.js             # SMTP Service
│   ├── whatsapp-service.js   # WhatsApp client (w/ reconnect & message queue)
│   ├── report-service.js     # Reporting Logic
│   ├── scraper.js            # Dashboard Scraper
│   └── ...
└── Dockerfile                # Container definition
```

## Credits

  * **Project Lead & Developer:** Gerardo Dassi
  * **Persistence:** Litestream
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

