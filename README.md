
# FENZ OSM Automation Manager

![Build Status](https://img.shields.io/badge/build-passing-brightgreen) ![Node Version](https://img.shields.io/badge/node-v20-blue) ![License](https://img.shields.io/badge/license-MIT-green)

## Description

**FENZ OSM Automation Manager** is a Node.js web application designed to streamline the tracking and management of expiring Operational Skills Maintenance (OSM) competencies.

It automates the process of checking a dashboard for expiring skills, persists data via a local SQLite database, and provides a secure web interface for administrators to send targeted email reminders.

**Key Features:**

* **Real-Time Web Dashboard:** A responsive UI using Socket.IO to view scraping progress and logs in real-time.
* **Web-Based Data Management:** Manage Members and Skills directly via the browser (CRUD operations & CSV Import).
* **Persistent Storage:** Uses **SQLite** (`fenz.db`) to store members, skills, user preferences, and email history.
* **Smart Caching:** Reduces load on the target dashboard by caching scraped results.
* **Secure Authentication:** Session-based login system.
* **Automated Emailing:** Sends HTML-formatted reminders via SMTP with deep links to specific Google Forms.
* **Dockerized:** Ready for production deployment using Docker and Docker Compose.

## Table of Contents

* [Prerequisites](#prerequisites)
* [Installation](#installation)
* [Configuration](#configuration)
* [Usage](#usage)
* [Docker Deployment](#docker-deployment)
* [Project Structure](#project-structure)
* [Troubleshooting](#troubleshooting)

## Prerequisites

* **Node.js**: v20 or higher.
* **npm**: Included with Node.js.
* **Access**: Valid credentials for the OSM Dashboard you intend to scrape.

## Installation

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/your-username/fenz-osm-manager.git](https://github.com/your-username/fenz-osm-manager.git)
    cd fenz-osm-manager
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Setup Configuration:**
    The project relies on a `config.js` file (powered by `.env`). Create your configuration file:
    ```bash
    cp .example.env .env
    cp config.js config.local.js # Optional if you want to override JS directly
    ```

## Configuration

The application is configured primarily through environment variables or `config.js`.

### 1. Authentication & Secrets
Configure these in your `.env` file or `config.js`:
* **`APP_USERNAME` / `APP_PASSWORD`**: Credentials for logging into this OSM Manager web interface.
* **`SESSION_SECRET`**: A random string used to sign session cookies.

### 2. OSM Dashboard Source
* **`DASHBOARD_URL`**: The full URL of the dashboard to scrape (including your specific user code).
* **`SCRAPING_INTERVAL`**: Time in minutes to cache scraped data (default: 60).

### 3. Email Settings (SMTP)
Configure your SMTP provider (eja. Gmail, Outlook, AWS SES) to enable email notifications:
* **`SMTP_SERVICE`**: (e.g., 'gmail').
* **`SMTP_USER`** & **`SMTP_PASS`**: Your email account credentials.
* **`EMAIL_FROM`**: The "From" address displayed in sent emails.

### 4. UI Customization
You can customize the login screen branding in `config.js`:
```javascript
const ui = {
    loginTitle: "Station OSM Manager",
    loginLogo: "[https://your-logo-url.com/logo.png](https://your-logo-url.com/logo.png)"
};
````

## Usage

### Running Locally

To start the web server:

```bash
node server.js
```

*The server listens on port **3000** by default.*

### Dashboard Workflow

1.  **Login**: Access `http://localhost:3000` and log in with your configured credentials.
2.  **Dashboard Controls**:
      * **Days to Expiry**: Set your threshold (e.g., 30 days). This is saved to the database automatically.
      * **Reload Expiring Skills**: Triggers the scraper. If data was fetched recently (within `SCRAPING_INTERVAL`), cached data is shown instantly.
      * **Send Emails**: Select specific members and click "Send Emails" to dispatch notifications.

### Data Management (New)

Unlike previous versions, **Members** and **Skills** are no longer hardcoded in `config.js`. You must add them via the UI or the system will not know who to track.

#### Managing Members

  * Navigate to the **Menu** (top right) \> **Manage Members**.
  * **Add Member**: Manually enter Name, Email, and Mobile.
      * *Important:* The **Name** must match the name displayed on the OSM Dashboard *exactly*.
  * **Import CSV**: Upload a CSV file with headers: `name`, `email`, `mobile`.

#### Managing Skills

  * Navigate to the **Menu** \> **Manage Skills**.
  * **Add Skill**: define the Skill Name and the renewal URL.
      * *Important:* The **Skill Name** must match the text on the OSM Dashboard *exactly*.
  * **Critical Skills**: Check the "Critical" box to highlight these skills in bold on the dashboard.
  * **Import CSV**: Upload a CSV file with headers: `name`, `url`, `critical_skill`.

## Docker Deployment

The project includes a `Dockerfile` and `docker-compose.yml` for easy deployment.

1.  **Build and Run:**

    ```bash
    docker-compose up -d --build
    ```

2.  **Access:**
    Open `http://localhost:3000`.

3.  **Data Persistence:**
    The `docker-compose.yml` mounts the current directory. The `fenz.db` SQLite database is stored on the host machine, ensuring your member and skill data is preserved across container restarts.

## Project Structure

```text
├── config.js              # Main configuration file
├── server.js              # Main Express Web Server & Socket.IO
├── fenz.db                # SQLite Database (Stores Members, Skills, History)
├── public/                # Frontend Assets
│   ├── index.html         # Main Dashboard
│   ├── members.html       # Member Management UI
│   ├── skills.html        # Skill Management UI
│   └── app.js             # Client-side logic
├── services/              # Backend Services
│   ├── db.js              # Database Access Layer (SQLite)
│   ├── mailer.js          # Email transport logic
│   ├── member-manager.js  # Logic to map scraped data to members
│   └── scraper.js         # Scraping & Caching logic
└── Dockerfile             # Container definition
```

## Troubleshooting

  * **"Unauthorized" Socket Error:**
    If you see "connect\_error: unauthorized" in the logs, ensure you have logged in via `http://localhost:3000/login.html` first. The socket connection requires an active session.
  * **Database Locked:**
    This uses SQLite. Ensure only one process is writing to `fenz.db` at a time. If running in Docker, ensure file permissions allow the container to write to the mounted volume.
  * **Email Failures:**
    Check your `SMTP` credentials in `.env`. If using Gmail, you likely need an **App Password** rather than your login password.
  * **Empty Dashboard:**
    If the "Reload" button returns 0 results, ensure your `DASHBOARD_URL` is correct and that the **Member Names** in the "Manage Members" section exactly match those on the target website.

<!-- end list -->
