
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
    git clone https://github.com/dassige/OSM.git
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

The application is configured in two places:
1.  **`.env`**: For sensitive secrets (passwords, API keys) and backend settings.
2.  **`config.js`**: For UI branding and non-sensitive defaults.

### 1. Environment Variables (`.env`)

Open the `.env` file you just created and configure the following parameters:

#### **Application Security**
These credentials are for logging into *this* OSM Manager application, not the external dashboard.
* `APP_USERNAME`: The username you want to use for the admin panel (e.g., `admin`).
* `APP_PASSWORD`: A strong password for the admin panel.
* `SESSION_SECRET`: A long, random string used to encrypt session cookies (e.g., `my_super_secret_session_key_123`).

#### **OSM Dashboard Connection**
* `DASHBOARD_URL`: **Crucial.** This is the full URL of the live dashboard you want to scrape.
    * *Format:* `https://www.dashboardlive.nz/index.php?user=YOUR_UNIQUE_CODE`
    * *Note:* Ensure you include the `?user=...` query parameter provided by FENZ.
* `SCRAPING_INTERVAL`: The number of minutes to cache data before scraping the live site again (Default: `60`).

#### **Email Configuration (SMTP)**
This application uses **Nodemailer** to send alerts. The example below assumes Gmail, but any SMTP service (Outlook, AWS SES, SendGrid) will work.

* `SMTP_SERVICE`: The service provider (e.g., `gmail` or `hotmail`).
* `SMTP_USER`: Your full email address (e.g., `sender@yourdomain.com`).
* `SMTP_PASS`: Your email password.
    * **Gmail Users:** Do **not** use your login password. You must generate an [App Password](https://myaccount.google.com/apppasswords) if you have 2FA enabled.
* `EMAIL_FROM`: The string that appears in the "From" field (e.g., `"Station Officer" <sender@yourdomain.com>`).

### 2. UI Customization (`config.js`)

You can customize the look and feel of the login screen by editing `config.js` directly:

```javascript
// config.js
const ui = {
    loginBackground: "", // URL to a background image (optional)
    loginLogo: "[https://your-fire-station-logo.com/logo.png](https://your-fire-station-logo.com/logo.png)", // URL to your logo
    loginTitle: "Station 12 OSM Manager" // Custom title for the login page
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

### Data Management

**Members** and **Skills** are managed dynamically via the web interface.

#### Managing Members

  * Navigate to the **Menu** (top right) \> **Manage Members**.
  * **Add Member**: Manually enter Name, Email, and Mobile.
      * *Important:* The **Name** must match the name displayed on the OSM Dashboard *exactly*.
  * **Import CSV**: Upload a CSV file with headers: `name`, `email`, `mobile`.

#### Managing Skills

  * Navigate to the **Menu** \> **Manage Skills**.
  * **Add Skill**: Define the Skill Name and the renewal URL.
      * *Important:* The **Skill Name** must match the text on the OSM Dashboard *exactly*.
  * **Critical Skills**: Check the "Critical" box to highlight these skills in bold on the dashboard.
  * **Import CSV**: Upload a CSV file with headers: `name`, `url`, `critical_skill` (1 for true, 0 for false).

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
├── config.js              # Main configuration file (UI defaults)
├── .env                   # Environment variables (Secrets)
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
