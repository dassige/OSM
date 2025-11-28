
````markdown
# FENZ OSM Automation Manager

![Build Status](https://img.shields.io/badge/build-passing-brightgreen) ![Node Version](https://img.shields.io/badge/node-v20-blue) ![License](https://img.shields.io/badge/license-MIT-green)

## Description

**FENZ OSM Automation Manager** is a Node.js web application designed to streamline the tracking and management of expiring Operational Skills Maintenance (OSM) competencies.

It automates the process of checking a dashboard for expiring skills, persists preferences and data via a local SQLite database, and provides a secure web interface for administrators to send targeted email reminders.

**Key Features:**

* **Real-Time Web Dashboard:** A responsive UI using Socket.IO to view scraping progress and logs in real-time.
* **Full Data Management:** Manage Members and Skills directly via the Web UI (CRUD operations).
* **Bulk Operations:** Support for CSV Import and Bulk Delete for both members and skills.
* **Secure Authentication:** Session-based login system to protect member data.
* **Persistent Storage:** Uses **SQLite** (`fenz.db`) to store members, skills, user preferences, and email history.
* **Smart Caching:** The scraper includes caching logic to prevent excessive hits to the live dashboard.
* **Automated Emailing:** Sends HTML-formatted reminders via SMTP with deep links to specific Google Forms for skill renewal.
* **Dockerized:** Ready for production deployment using Docker and Docker Compose.

## Table of Contents

* [Prerequisites](#prerequisites)
* [Installation](#installation)
* [Configuration](#configuration)
* [Data Management](#data-management)
* [Usage](#usage)
* [Docker Deployment](#docker-deployment)
* [Project Structure](#project-structure)
* [Troubleshooting](#troubleshooting)

## Prerequisites

* **Node.js**: v20 or higher (Recommended).
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
    The project relies on a `config.js` file. Create this by copying the example template.
    ```bash
    cp config.example.js config.js
    ```
    *Tip: You can also use a `.env` file to manage secrets (see `.example.env`).*

## Configuration

Open `config.js` and configure the following sections:

### 1. Authentication (`auth`)
Set the login credentials for the web dashboard and the session secret.
```javascript
const auth = {
    username: process.env.APP_USERNAME || "admin",
    password: process.env.APP_PASSWORD || "your_secure_password", 
    sessionSecret: process.env.SESSION_SECRET || "complex_random_string" 
};
````

### 2\. UI Customization (`ui`)

Customize the login screen branding.

```javascript
const ui = {
    loginBackground: "/images/bg.jpg", // Optional
    loginLogo: "/images/logo.png",     // Optional
    loginTitle: "DVFB OSM Manager"
};
```

### 3\. System URLs & Email

  * **`url`**: The specific OSM dashboard URL (including your user code).
  * **`scrapingInterval`**: Time in minutes to cache scraped data (default: 60).
  * **`transporter`**: SMTP settings (NodeMailer) for sending emails.
  * **`emailInfo`**: Default subject line and sender address.

## Data Management

Unlike previous versions, **Members** and **Skills** are no longer hardcoded in `config.js`. They are managed dynamically via the web interface.

### Managing Members

Navigate to **Menu \> Manage Members** to:

  * **Add/Edit:** Manually input member details (Name, Email, Mobile). *Note: Names must match the OSM Dashboard exactly.*
  * **Import CSV:** Bulk upload members using a CSV file.
      * *Format:* Headers required (`name`, `email`, `mobile`).

### Managing Skills

Navigate to **Menu \> Manage Skills** to:

  * **Configure Skills:** Map the skill names found in the dashboard to specific Google Form URLs.
  * **Critical Skills:** Flag specific skills as "Critical" to highlight them in reports.
  * **Import CSV:** Bulk upload skill configurations.
      * *Format:* Headers required (`name`, `url`, `critical_skill`).

## Usage

### Running Locally

To start the web server:

```bash
node server.js
```

*Note: The server listens on port **3000** by default.*

1.  Open your browser to `http://localhost:3000`.
2.  Login with the credentials defined in configuration.
3.  **Dashboard Controls:**
      * **Days to Expiry:** Set the threshold (e.g., 30 days). This preference is saved automatically.
      * **Reload Expiring Skills:** Scrapes the live dashboard (or loads from cache if within interval).
      * **Filters:** Hide members with no issues or skills without URL links.
      * **Send Emails:** Select specific members and click "Send Emails".

### Database

The application automatically creates a `fenz.db` SQLite file in the root directory upon the first run. This file stores:

  * **Members & Skills:** The directory of people and configurations.
  * **Preferences:** Last used threshold, active filters, sort orders.
  * **Email History:** Logs of sent notifications.

## Docker Deployment

The project includes a `Dockerfile` and `docker-compose.yml` for easy deployment.

1.  **Build and Run:**

    ```bash
    docker-compose up -d --build
    ```

2.  **Access:**
    Open `http://localhost:3000`.

3.  **Persistence:**

      * The `docker-compose.yml` mounts the current directory.
      * `fenz.db` persists data on the host machine.

## Project Structure

```text
├── config.js              # Main configuration
├── server.js              # Express/Socket.io Web Server & API
├── fenz.db                # SQLite Database (Auto-generated)
├── public/                # Frontend assets
│   ├── index.html         # Main Dashboard
│   ├── members.html       # Member Management UI
│   ├── skills.html        # Skill Management UI
│   └── ...
├── services/              # Backend Logic
│   ├── db.js              # SQLite connection and Data Access Layer
│   ├── mailer.js          # Nodemailer logic
│   ├── member-manager.js  # Business logic for mapping skills
│   └── scraper.js         # Axios/Cheerio scraping logic
└── Dockerfile             # Container definition
```

## Troubleshooting

  * **"Unauthorized" Socket Error:**
    If the terminal logs "connect\_error: unauthorized", ensure you have logged in via `http://localhost:3000/login.html`.
  * **Database Locked:**
    Ensure only one process accesses the `fenz.db` file at a time.
  * **CSV Import Issues:**
    Ensure your CSV files have the correct headers (case-insensitive). See the "Help" button (?) on the management pages for examples.

## License

Distributed under the MIT License.

```
```