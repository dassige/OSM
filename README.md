
# FENZ OSM Manager

## Description

**FENZ OSM Manager** is a Node.js web application designed to streamline the tracking and management of expiring Operational Skills Maintenance (OSM) competencies.

It automates the process of checking a dashboard for expiring skills, persists data via a local SQLite database, and provides a secure web interface for administrators to send targeted email reminders. This application manages all members, skills, and configurations dynamically via the web interface—no code editing required.

**Key Features:**

  * **Real-Time Web Dashboard:** A responsive UI using Socket.IO to view scraping progress, logs, and sending status in real-time.
  * **Database Driven:** All members and skills are stored in a local SQLite database (`fenz.db`).
  * **Integrated Form System (Live Forms):**
      * **Form Builder:** Drag-and-drop interface to create custom skill verification forms internally.
      * **Unique Tracking:** System generates unique, secure links for every member/skill combination.
      * **Lifecycle Management:** Track exactly when a form was sent, opened, and submitted.
      * **Data Review:** Admins can review submission answers directly within the app.  * 
  * **Multi-User System:**
      * **Super Admin:** A resilient system account defined via environment variables.
      * **User Management:** Create multiple database-backed administrators with secure password hashing.
      * **Automatic Notifications:** New users receive a welcome email with a randomly generated temporary password.
      * **Self-Service:** Users can manage their profiles and recover lost passwords via email.
  * **Web-Based Management:**
      * **Members:** Add, edit, delete, and CSV Import/Export members directly in the browser.
      * **Skills:** Configure which skills to track and mark them as Critical.
      * **Smart Form Links:** Define Online Form URLs with dynamic placeholders (e.g., `{{member-name}}`) to pre-fill member details automatically.
      * **Email Templates:** A rich-text editor with drag-and-drop variables to customize notifications for Expiring Skills, New Users, Password Resets, and Account Deletions.
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
  * **WhatsApp Integration:** Send expiring skill notifications directly to members' WhatsApp accounts using a headless client. Includes support for bulk sending, test messages, and session management.

## Table of Contents

  * [Prerequisites](#prerequisites)
  * [Installation](#installation)
  * [Configuration](#configuration)
  * [UI Customization](#ui-customization)
  * [Usage](#usage)
  * [Demo Mode](#demo-mode)
  * [Docker Deployment](#docker-deployment)
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

#### **Operation Mode**

  * `APP_MODE`: Set to `production` (default) for live scraping, or `demo` to enable the sandboxed demo mode.

#### **Demo Secrets (Only used when APP_MODE=demo)**

  * `DEMO_SUPERADMIN_USERNAME`: The username for the Super Admin in demo mode.
  * `DEMO_SUPERADMIN_PASSWORD`: The password for the Super Admin in demo mode.

#### **Application Settings**

  * `APP_TIMEZONE`: The timezone used for date calculations (e.g., `Pacific/Auckland`). Defaults to NZ time.
  * `APP_LOCALE`: The locale used for date/time formatting strings (e.g., `en-NZ`, `en-US`). Defaults to `en-NZ`.
  * `TRAINING_DAY_OF_WEEK`: Your brigade's training day (e.g., `Monday`). Used to highlight the day in the Training Planner.   

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

### 4\. Live Forms Workflow

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
5.  **Form Validation:** 
    * Administrators can "Test the Form" in Demo Mode directly from the management table to verify layout and variables before final approval.

## Docker Deployment

1.  **Build and Run:**
    ```bash
    docker compose up -d --build
    ```
2.  **Persistence:** The `docker-compose.yml` mounts the local directory to `/app`, ensuring your `fenz.db` persists restarts.

## Google Cloud Run Deployment

Supports stateless deployment using **Litestream** to replicate the database to Google Cloud Storage.

See [Installation on Google Cloud Run](Installation_google_run.md) for details.

## Integrations

* [**WhatsApp Feature Guide**](whatsapp-feature.md): Detailed instructions on connecting your WhatsApp account, managing sessions, and sending mobile notifications.

## Project Structure

```text
├── .env                    # Secrets & Config
├── server.js               # Express Web Server
├── fenz.db                 # SQLite Database
├── config.js               # Configuration loader
├── start.sh                # Startup Script (Litestream)
├── public/                 # Frontend Assets
│   ├── reports/            # Report Renderers
│   ├── email-templates.html # Template Editor
│   ├── system-tools.html   # Backup/Restore
│   ├── event-log.html      # Audit Log
│   └── ...
├── services/               # Backend Logic
│   ├── db.js               # Database Adapter
│   ├── mailer.js           # SMTP Service
│   ├── report-service.js   # Reporting Logic
│   ├── scraper.js          # Dashboard Scraper
│   └── ...
└── Dockerfile              # Container definition
```

## Credits

  * **Project Lead & Developer:** Gerardo Dassi
  * **Persistence:** Litestream
  * **Icons:** Feather Icons


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
