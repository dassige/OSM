# FENZ OSM Automation Manager

![Build Status](https://img.shields.io/badge/build-passing-brightgreen) ![Node Version](https://img.shields.io/badge/node-v20-blue) ![License](https://img.shields.io/badge/license-MIT-green)

## Description

**FENZ OSM Automation Manager** is a Node.js web application designed to streamline the tracking and management of expiring Operational Skills Maintenance (OSM) competencies.

It automates the process of checking a dashboard for expiring skills, persists data via a local SQLite database, and provides a secure web interface for administrators to send targeted email reminders.


**Key Features:**

* **Real-Time Web Dashboard:** A responsive UI using Socket.IO to view scraping progress, logs, and sending status in real-time.
* **Geoblocking Bypass:** Built-in proxy manager with support for **Fixed** (paid) and **Dynamic** (free) proxies, allowing you to scrape New Zealand-restricted dashboards from any region.
* **Cloud-Native Persistence:** Uses **SQLite + Litestream** to replicate your database to Google Cloud Storage, ensuring data safety even on stateless platforms like Google Cloud Run.
* **Web-Based Data Management:** Manage Members and Skills directly via the browser (CRUD operations & CSV Import).
* **Smart Caching:** Reduces load on the target dashboard by caching scraped results locally.
* **Automated Emailing:** Sends HTML-formatted reminders via SMTP with deep links to specific Google Forms.
* **Dockerized:** Ready for production deployment with a flexible configuration system.

## Table of Contents

* [Prerequisites](#prerequisites)
* [Installation](#installation)
* [Configuration](#configuration)
* [UI Customization](#ui-customization)
* [Usage](#usage)
* [Docker Deployment](#docker-deployment)
* [Google Cloud Run Deployment](#google-cloud-run-deployment)
* [Project Structure](#project-structure)
* [Troubleshooting](#troubleshooting)

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

Open the `.env` file you just created and configure the following parameters:

#### **Application Security**
* `APP_USERNAME`: The username for the admin panel (e.g., `admin`).
* `APP_PASSWORD`: A strong password for the admin panel.
* `SESSION_SECRET`: A long, random string used to encrypt session cookies.

#### **OSM Dashboard Connection**
* `DASHBOARD_URL`: **Crucial.** The full URL of the live dashboard including your unique user code.
* `SCRAPING_INTERVAL`: Minutes to cache data before scraping the live site again (Default: `60`).


#### **Email Configuration (SMTP)**
* `SMTP_SERVICE`: The service provider (e.g., `gmail`).
* `SMTP_USER`: Your full email address.
* `SMTP_PASS`: Your email password (or App Password).
* `EMAIL_FROM`: The "From" address (e.g., `"Station Officer" <sender@yourdomain.com>`).

#### **UI Branding (Optional)**
* `UI_LOGIN_TITLE`: Custom text for the login screen (e.g., "Station 44 OSM Manager").
* `UI_RESOURCES_PATH`: (Docker Only) Local path to a folder containing custom images (`logo.png` and `background.png`).
* `UI_LOGO_URL`: (Cloud Run Only) A public URL to download a custom logo from on boot.
* `UI_BACKGROUND_URL`: (Cloud Run Only) A public URL to download a custom background from on boot.

### Proxy Configuration (Geoblocking Bypass)

Because the target OSM Dashboard is geoblocked to New Zealand IP addresses, this application includes a built-in proxy system. If you are hosting this application outside of New Zealand (e.g., Google Cloud Run US region), you must configure this.

Control the behavior using the `PROXY_MODE` environment variable:

#### 1. None (`none`)
* **Description:** Traffic flows directly from the container.
* **Use Case:** You are hosting the app inside New Zealand or using a system-level VPN.
* **Config:**
    ```bash
    PROXY_MODE=none
    ```

#### 2. Fixed Proxy (`fixed`)
* **Description:** Routes traffic through a specific, static proxy server.
* **Use Case:** **Recommended for production.** Use this with a paid residential proxy service for stability and speed.
* **Config:**
    ```bash
    PROXY_MODE=fixed
    PROXY_URL=[http://username:password@nz-proxy-provider.com](http://username:password@nz-proxy-provider.com):port
    ```

#### 3. Dynamic Proxy (`dynamic`)
* **Description:** Automatically fetches a list of free public proxies, filters for New Zealand, and tests them one-by-one until a working one is found.
* **Use Case:** Testing or zero-cost deployments.
* **Warning:** Startup is slower (due to testing) and free proxies are often unstable.
* **Config:**
    ```bash
    PROXY_MODE=dynamic
    # (Optional) Override the default proxy list source API
    # DYNAMIC_PROXY_SOURCE=[https://api.proxyscrape.com/](https://api.proxyscrape.com/)...
    ```

## UI Customization

You can customize the branding (Logo, Background, and Title) without modifying the source code.

### 1. Changing the Title
Set the `UI_LOGIN_TITLE` variable in your `.env` file.

### 2. Changing Images (Docker / Local)
To use custom images without modifying `docker-compose.yml`, use the `UI_RESOURCES_PATH` environment variable.

1.  Create a folder (e.g., `my-branding`) anywhere on your machine.
2.  Add your custom files: `logo.png` and `background.png` into that folder.
3.  In your `.env` file, add the path to that folder:
    ```bash
    UI_RESOURCES_PATH=./my-branding
    ```
4.  Restart the container:
    ```bash
    docker compose up -d
    ```

### 3. Changing Images (Cloud Run)

Since Cloud Run is stateless, you cannot mount a local folder. Instead, host your images publicly (e.g., in a Google Storage Bucket) and provide the URLs via `UI_LOGO_URL` and `UI_BACKGROUND_URL`. The container will download them on startup.


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
      * **Days to Expiry**: Set your threshold (e.g., 30 days).
      * **Reload Expiring Skills**: Triggers the scraper.
      * **Send Emails**: Select specific members and click "Send Emails".

## Docker Deployment

The project includes a `Dockerfile` and `docker-compose.yml` for easy deployment.

1.  **Build and Run:**

    ```bash
    docker compose up -d --build
    ```

2.  **Access:**
    Open `http://localhost:3000`.

## Data Persistence

The application stores all data (members, skills, history) in a local SQLite database file named `fenz.db`. Because Docker containers are ephemeral, we use two different strategies to ensure this data is not lost when the application restarts.

### 1. Local / Docker Compose
When running locally, persistence is handled via a **Volume Bind-Mount**.
* The `docker-compose.yml` mounts your current project folder to `/app` inside the container.
* The `fenz.db` file is written directly to your host machine's hard drive.
* **Result:** Data survives container restarts and rebuilds.

### 2. Google Cloud Run (Stateless)
Cloud Run containers have no permanent disk. If a container stops, the local files are lost. To solve this, we use **Litestream**.
* **Replication (Backup):** As the app writes to `fenz.db`, Litestream runs in the background and continuously streams the changes to your Google Cloud Storage (GCS) bucket.
* **Restore (Recovery):** When a new container starts, the `start.sh` script automatically downloads the latest database from GCS before the application boots.
* **Result:** You get the simplicity of SQLite with the durability of a cloud database.

## Google Cloud Run Deployment

This application supports stateless deployment on Google Cloud Run by using Litestream for database persistence and a startup script for asset customization.

See [Installation on Google Run](Installation\_google\_run.md) for details.

## Project Structure

```text
├── .env                    # Environment variables (Secrets & Config)
├── config.js               # Central configuration loader
├── server.js               # Main Express Web Server & API
├── fenz.db                 # SQLite Database (generated at runtime)
├── start.sh                # Startup Script (Litestream Restore & Init)
├── litestream.yml          # Database replication configuration (GCS)
├── docker-compose.yml      # Local development container orchestration
├── public/                 # Frontend Assets (Single Page App)
│   ├── resources/          # Static Images (Logo, Background)
│   ├── *.html              # UI Pages (Login, Dashboard, Management)
│   └── app.js              # Frontend Logic (Socket.IO client)
├── services/               # Backend Business Logic
│   ├── db.js               # Database interaction layer (SQLite)
│   ├── mailer.js           # SMTP Email notification service
│   ├── member-manager.js   # Data processing & expiry logic
│   ├── proxy-manager.js    # Proxy discovery & verification service
│   └── scraper.js          # Dashboard scraping logic (Cheerio/Axios)
└── Dockerfile              # Container definition
```

## Troubleshooting

  * **"Unauthorized" Socket Error:** Ensure you have logged in via `/login.html`.
  * **Database Locked:** Ensure only one process is writing to `fenz.db`.
  * **Custom Images not loading:**
      * **Docker:** Ensure your local folder is named correctly and contains `logo.png`.
      * **Cloud Run:** Check the Cloud Run logs to see if `wget` failed to download the image from the URL provided (e.g., 403 Forbidden).

<!-- end list -->


