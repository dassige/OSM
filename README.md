
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
* `UI_LOGO_URL`: (Cloud Run Only) A public URL to download a custom logo from on boot.
* `UI_BACKGROUND_URL`: (Cloud Run Only) A public URL to download a custom background from on boot.

## UI Customization

You can customize the branding (Logo, Background, and Title) without modifying the source code.

### 1. Changing the Title
Set the `UI_LOGIN_TITLE` variable in your `.env` file.

### 2. Changing Images (Docker / Local)
If running locally or via Docker Compose, you can mount a local folder containing your specific images.

1. Create a folder named `custom-resources` in the project root.
2. Add your files: `logo.png` and `background.png`.
3. Uncomment the volume mapping in `docker-compose.yml`:
   ```yaml
   volumes:
     - ./custom-resources:/app/public/resources

4.  Restart the container.

### 3\. Changing Images (Cloud Run)

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

3.  **Data Persistence:**
    The `fenz.db` SQLite database is stored on the host machine via a volume, ensuring data preservation.

## Google Cloud Run Deployment

This application supports stateless deployment on Google Cloud Run by using Litestream for database persistence and a startup script for asset customization.

See [Installation on Google Run](Installation\_google\_run.md) for details.

## Project Structure

```text
├── .env                   # Environment variables (Secrets & Config)
├── server.js              # Main Express Web Server
├── fenz.db                # SQLite Database
├── start.sh               # Cloud Run Startup Script (Asset Downloader)
├── public/                # Frontend Assets
│   └── resources/         # Default Images (can be overridden)
├── services/              # Backend Services
└── Dockerfile             # Container definition
```

## Troubleshooting

  * **"Unauthorized" Socket Error:** Ensure you have logged in via `/login.html`.
  * **Database Locked:** Ensure only one process is writing to `fenz.db`.
  * **Custom Images not loading:**
      * **Docker:** Ensure your local folder is named correctly and contains `logo.png`.
      * **Cloud Run:** Check the Cloud Run logs to see if `wget` failed to download the image from the URL provided (e.g., 403 Forbidden).

<!-- end list -->


