Here is the updated `README.md`. I have revised it to reflect the move to a `server.js` architecture, the introduction of SQLite (`fenz.db`) for persistence, the new Authentication/UI configuration in `config.js`, and the modularization of services.

````markdown
# FENZ OSM Automation Manager

![Build Status](https://img.shields.io/badge/build-passing-brightgreen) ![Node Version](https://img.shields.io/badge/node-v20-blue) ![License](https://img.shields.io/badge/license-MIT-green)

## Description

**FENZ OSM Automation Manager** is a Node.js web application designed to streamline the tracking and management of expiring Operational Skills Maintenance (OSM) competencies.

It automates the process of checking a dashboard for expiring skills, persists preferences and history via a local SQLite database, and provides a secure web interface for administrators to send targeted email reminders.

**Key Features:**

* **Real-Time Web Dashboard:** A responsive UI using Socket.IO to view scraping progress and logs in real-time.
* **Secure Authentication:** Session-based login system to protect member data.
* **Persistent Storage:** Uses **SQLite** (`fenz.db`) to save user preferences (e.g., expiry thresholds, view filters) and log email history.
* **Smart Filtering:** Filter results by "Actionable" (has a form link) or hide members with no expiring skills.
* **Automated Emailing:** Sends HTML-formatted reminders via SMTP with deep links to specific Google Forms for skill renewal.
* **Modular Architecture:** Logic separated into dedicated services (Scraper, Mailer, Database, Member Manager).
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

## Configuration

Open `config.js` and configure the following sections:

### 1. Authentication (`auth`)
Set the login credentials for the web dashboard and the session secret.
```javascript
const auth = {
    username: "admin",
    password: "your_secure_password", 
    sessionSecret: "complex_random_string_here" 
};
````

### 2\. UI Customization (`ui`)

Customize the login screen branding.

```javascript
const ui = {
    loginBackground: "/images/bg.jpg", // Optional
    loginLogo: "/images/logo.png",     // Optional
    loginTitle: "FENZ OSM Manager"
};
```

### 3\. Members & Skills

  * **`members`**: Array of objects containing the exact names of team members to track and their email addresses.
  * **`skillsConfig`**: Map skill names (as they appear in the dashboard) to their renewal Form URLs. Set `critical_skill: true` to highlight them in the UI.

### 4\. System URLs & Email

  * **`url`**: The specific OSM dashboard URL (including your user code).
  * **`transporter`**: SMTP settings (NodeMailer) for sending emails.

## Usage

### Running Locally

To start the web server:

```bash
node server.js
```

*Note: The server listens on port **3000** by default.*

1.  Open your browser to `http://localhost:3000`.
2.  Login with the credentials defined in `config.js`.
3.  **Dashboard Controls:**
      * **Days to Expiry:** Set the threshold (e.g., 30 days). This preference is saved automatically to the database.
      * **Reload Expiring Skills:** Scrapes the live dashboard.
      * **Filters:** Use the checkboxes to hide members with no issues or skills without URL links.
      * **Send Emails:** Select specific members and click "Send Emails".

### Database

The application automatically creates a `fenz.db` SQLite file in the root directory upon the first run. This file stores:

  * User Preferences (Last used threshold, active filters).
  * Email History (Logs of sent notifications).

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
      * `config.js` changes are reflected after a container restart.
      * `fenz.db` persists data on the host machine.

## Project Structure

```text
├── config.js              # (Ignored) Main configuration and secrets
├── config.example.js      # Template for configuration
├── server.js              # Main Express/Socket.io Web Server
├── main.js                # Legacy/CLI entry point
├── fenz.db                # SQLite Database (Auto-generated)
├── public/                # Frontend assets (HTML, CSS, Client JS)
├── services/              # Backend Logic
│   ├── db.js              # SQLite connection and query helpers
│   ├── mailer.js          # Nodemailer logic
│   ├── member-manager.js  # Business logic for mapping skills to members
│   └── scraper.js         # Axios/Cheerio scraping logic
└── Dockerfile             # Container definition
```

## Troubleshooting

  * **"Unauthorized" Socket Error:**
    If the terminal logs "connect\_error: unauthorized", ensure you have logged in via `http://localhost:3000/login.html`. The socket connection requires an active Express session.
  * **Database Locked:**
    If running multiple instances or accessing `fenz.db` manually while the server is running, you may encounter SQLite locking issues. Ensure only one process accesses the DB file at a time.
  * **Email Failures:**
    Check the terminal logs for SMTP errors. If using Gmail, ensure you are using an **App Password** and not your standard login password.

## License

Distributed under the MIT License.

```
```